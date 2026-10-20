import { vertex, glassFragment } from '../src/shaders.js';

// Dedicated comparison layout; the production material is never altered.
export function renderGlassComparison(source, {width=256, height=256, light=0, scale=1, glass=true} = {}) {
  const web = document.createElement('canvas'); web.width = web.height = 512*scale;
  const gl = web.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
  if (!gl) throw new Error('WebGL 2 není dostupné.');

  // Replace only the app grid placement with one centered reference panel.
  // The material below the prefix is exactly the production glass fragment.
  const start = glassFragment.indexOf('  // Reference-space pixels');
  const end = glassFragment.indexOf('  float hover=', start);
  if (start < 0 || end < 0) throw new Error('Rozhraní produkčního shaderu se změnilo.');
  const fragment = glassFragment.slice(0, start) + `
  vec2 p=(v_uv-.5)*512.;
  vec2 local=p/vec2(${width.toFixed(1)},${height.toFixed(1)});
  if(any(greaterThan(abs(local),vec2(.5)))) { outColor=vec4(original,1.); return; }
  vec2 referenceToUv=vec2(1./512.);
  vec2 tileUv=vec2(.5);
` + glassFragment.slice(end).replace('float antialias=1080./(u_resolution.y*u_size);', 'float antialias=512./(u_resolution.y*u_size);');
  const program = gl.createProgram();
  for (const [type, code] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type); gl.shaderSource(shader, code); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader); gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture()); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, key, gl.LINEAR);
  for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, key, gl.CLAMP_TO_EDGE);
  for (const [name, value] of Object.entries({u_glass:Number(glass), u_size:(width+height)/2, u_zoom:1, u_blur:0, u_strength:1, u_aberration:1, u_interaction:0, u_light:light})) {
    gl.uniform1f(gl.getUniformLocation(program, name), value);
  }
  gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), web.width, web.height);
  gl.uniform2f(gl.getUniformLocation(program, 'u_pointer'), .5, .5);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  if (gl.getError() !== gl.NO_ERROR) throw new Error('Chyba při vykreslení WebGL.');

  return web;
}
