import { vertex, glassFragment } from '../src/shaders.js';

const $ = id => document.getElementById(id);
const canvas = $('glass'), source = $('source'), ctx = source.getContext('2d');
const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
if (!gl) throw new Error('Kontrola vyžaduje WebGL 2.');

// Only tile placement differs from the app. Every optical calculation uses the
// production fragment; the comparison cannot substitute a separate lens model.
const start = glassFragment.indexOf('  // Reference-space pixels');
const end = glassFragment.indexOf('  float hover=', start);
if (start < 0 || end < 0) throw new Error('Změnilo se rozhraní shaderu pro kalibraci.');
const fragment = glassFragment.slice(0, start) + `
  vec2 p=(v_uv-.5)*u_resolution;
  vec2 local=p/u_size;
  if(any(greaterThan(abs(local),vec2(.5)))) { outColor=vec4(original,1.); return; }
  vec2 referenceToUv=1./u_resolution;
  vec2 tileUv=vec2(.5);
` + glassFragment.slice(end).replace('float antialias=1080./(u_resolution.y*u_size);', 'float antialias=1./u_size;');
const program = gl.createProgram();
for (const [type, code] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, code); gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  gl.attachShader(program, shader); gl.deleteShader(shader);
}
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
gl.useProgram(program);
const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
const position = gl.getAttribLocation(program, 'a_position');
gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
const texture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, texture);
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
for (const param of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, param, gl.LINEAR);
for (const param of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, param, gl.CLAMP_TO_EDGE);
gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), 512, 512);
gl.uniform2f(gl.getUniformLocation(program, 'u_pointer'), .5, .5);
function uniforms(values) {
  for (const [name, value] of Object.entries(values)) gl.uniform1f(gl.getUniformLocation(program, name), value);
}
function upload() { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); }
function draw() { gl.drawArrays(gl.TRIANGLES, 0, 3); }
function pixels() {
  draw();
  const data = new Uint8Array(512 * 512 * 4);
  gl.readPixels(0, 0, 512, 512, gl.RGBA, gl.UNSIGNED_BYTE, data);
  return data;
}
function grid() {
  ctx.fillStyle = '#202020'; ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = '#eeeeee'; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= 16; i++) {
    ctx.moveTo(i*32, 0); ctx.lineTo(i*32, 512);
    ctx.moveTo(0, i*32); ctx.lineTo(512, i*32);
  }
  ctx.stroke(); ctx.strokeStyle = 'white'; ctx.lineWidth = 8;
  ctx.stroke(new Path2D('M 206 218 V 296 M 258 218 L 208 258 L 260 296 M 320 218 H 280 V 296 H 320 M 280 257 H 313'));
  upload();
}
function render() {
  uniforms({ u_glass: 1, u_size: 256, u_zoom: 1, u_blur: 0, u_strength: 1, u_interaction: 0,
    u_aberration: Number($('dispersion').value)/100, u_light: $('light').checked ? 1 : 0 });
  draw();
  $('reference').src = `./glass-reference/figma-grid-dispersion-${$('dispersion').value}.png`;
}
function difference(a, b, x0=0, y0=0, width=512, height=512) {
  let max = 0, sum = 0;
  for (let y = y0; y < y0+height; y++) for (let x = x0; x < x0+width; x++) {
    const i = (y*512+x)*4;
    for (let c = 0; c < 3; c++) { const d = Math.abs(a[i+c]-b[i+c]); max = Math.max(max,d); sum += d; }
  }
  return { max, mean: sum/(width*height*3) };
}
$('verify').onclick = () => {
  const checks = [];
  const check = (name, ok) => checks.push(`${ok ? 'PASS' : 'FAIL'} · ${name}`);
  try {
    const ramp = ctx.createImageData(512, 512);
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      const i = (y*512+x)*4;
      ramp.data[i] = ramp.data[i+1] = ramp.data[i+2] = Math.round(x*255/511); ramp.data[i+3] = 255;
    }
    ctx.putImageData(ramp, 0, 0); upload();
    uniforms({ u_glass: 0, u_light: 0, u_zoom: 1, u_blur: 0 });
    const plain = pixels();
    for (const size of [128, 256, 384]) {
      uniforms({ u_glass: 1, u_size: size, u_strength: 1, u_aberration: 0 });
      const bent = pixels();
      uniforms({ u_aberration: 1 });
      const dispersed = pixels(), middle = Math.round(size*.2);
      const region = [256-middle/2, 256-middle/2, middle, middle].map(Math.floor);
      check(`${size}px: klidný střed bez viditelné disperze`, difference(bent, dispersed, ...region).max <= 1);
      check(`${size}px: střed bez celkového zvětšení`, difference(plain, bent, ...region).max <= 1);
      check(`${size}px: barevné kanály se u obvodu rozcházejí`, difference(bent, dispersed).max >= 3);
    }
    uniforms({ u_strength: 0 });
    check('Nulová síla vrací původní obraz', difference(plain, pixels()).max === 0);
    ctx.fillStyle = '#8099b3'; ctx.fillRect(0,0,512,512); upload();
    uniforms({ u_glass: 0 }); const solid = pixels();
    uniforms({ u_glass: 1, u_strength: 1, u_aberration: 1 });
    check('Disperze nevytváří barvu na jednolitém podkladu', difference(solid, pixels()).max <= 1);
    // Fine detail must soften even at Frost 0, only inside active glass.
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,512,512);
    ctx.fillStyle = '#fff';
    for(let x=0;x<512;x+=8) ctx.fillRect(x,0,4,512);
    upload();
    uniforms({ u_glass: 0, u_size: 384, u_blur: 0 }); const stripes = pixels();
    uniforms({ u_glass: 1, u_strength: 1 }); const softened = pixels();
    const centerSoftness=difference(stripes, softened, 240,240,32,32).mean;
    check('Frost 0 jen lehce změkčuje střed skla', centerSoftness > 5 && centerSoftness < 30);
    check('Změkčení nezasahuje mimo sklo', difference(stripes, softened, 0,0,48,48).max === 0);
    uniforms({ u_strength: 0 });
    check('Nulová síla zachovává i ostré detaily', difference(stripes, pixels()).max === 0);
    check('WebGL bez chyb', gl.getError() === gl.NO_ERROR);
    $('result').textContent = checks.join('\n');
  } finally { grid(); render(); }
};
$('dispersion').onchange = render;
$('light').onchange = render;
$('download').onclick = () => {
  const link = document.createElement('a'); link.download = `web-glass-${$('dispersion').value}.png`;
  link.href = canvas.toDataURL(); link.click();
};
grid(); render();
