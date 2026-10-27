import { appearanceModel as model, appearanceBytes as bytes } from './liquid-appearance-data.js';

// Learned spatial functions and cubic time coefficients. The reconstruction
// domain is this reference's 26.8 seconds; it is not a fluid solver.
const MAX_MODES = 24;
const fragment = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2DArray u_modesA;
uniform sampler2DArray u_modesB;
uniform sampler2D u_meanA;
uniform sampler2D u_meanB;
uniform float u_weightsA[${MAX_MODES}];
uniform float u_weightsB[${MAX_MODES}];
uniform float u_mix;
void main() {
  vec2 uv=vec2(v_uv.x,1.-v_uv.y);
  vec4 a=texture(u_meanA,uv),b=texture(u_meanB,uv);
  for(int i=0;i<${MAX_MODES};i++) {
    a+=(texture(u_modesA,vec3(uv,float(i)))*255.-128.)*u_weightsA[i];
    b+=(texture(u_modesB,vec3(uv,float(i)))*255.-128.)*u_weightsB[i];
  }
  vec4 value=mix(a,b,u_mix);
  value.a*=4.;
  value=clamp(value,0.,1.);
  value.rgb*=smoothstep(0.,.02,value.a);
  value.a=max(value.a,max(value.r,max(value.g,value.b)));
  outColor=value;
}`;

// Catmull-Rom reconstruction preserves the reference's soft edge profile much
// better than magnifying the calibration grid with bilinear interpolation.
export const appearanceSampling = `
vec4 appearanceSample(sampler2D source,vec2 uv) {
  vec2 size=vec2(textureSize(source,0)),pixel=uv*size-.5;
  vec2 base=floor(pixel),f=fract(pixel);
  vec2 f2=f*f,f3=f2*f;
  vec2 w0=-.5*f+f2-.5*f3,w1=1.-2.5*f2+1.5*f3;
  vec2 w2=.5*f+2.*f2-1.5*f3,w3=-.5*f2+.5*f3;
  vec4 value=vec4(0.);
  for(int y=0;y<4;y++) for(int x=0;x<4;x++) {
    float wx=x==0?w0.x:x==1?w1.x:x==2?w2.x:w3.x;
    float wy=y==0?w0.y:y==1?w1.y:y==2?w2.y:w3.y;
    value+=texture(source,(base+vec2(float(x-1),float(y-1))+.5)/size)*wx*wy;
  }
  return clamp(value,0.,1.);
}`;

function coefficients(basis, time, result) {
  const knots = basis.knots;
  let low = 0, high = knots.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (knots[middle] > time) high = middle; else low = middle;
  }
  const intervals = knots.length - 1, dt = time - knots[low], rank = basis.rank;
  const data = new Float32Array(bytes.buffer, basis.coefficientsOffset, 4 * intervals * rank);
  result.fill(0);
  for (let i = 0; i < rank; i++) {
    result[i] = ((data[low * rank + i] * dt + data[(intervals + low) * rank + i]) * dt
      + data[(2 * intervals + low) * rank + i]) * dt + data[(3 * intervals + low) * rank + i];
  }
}

function half(value) {
  const sign = value & 0x8000 ? -1 : 1, exponent = value >> 10 & 31, fraction = value & 1023;
  return sign * (exponent ? 2 ** (exponent - 15) * (1 + fraction / 1024) : fraction * 2 ** -24);
}

export class LiquidAppearance {
  static lastTime = model.lastTime;
  constructor(gl, compile) {
    this.gl = gl;
    this.program = compile(fragment);
    this.slots = [];
    this.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE12); gl.bindTexture(gl.TEXTURE_2D, this.texture);
    this.configure(gl.TEXTURE_2D);
    const floating = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
    this.precision = floating ? 'RGBA16F' : 'RGBA8';
    gl.texImage2D(gl.TEXTURE_2D, 0, floating ? gl.RGBA16F : gl.RGBA8, model.width, model.height, 0, gl.RGBA, floating ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    this.framebuffer = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Vzhled liquidu nelze připravit.');
    this.bodyTexture = gl.createTexture(); gl.activeTexture(gl.TEXTURE13); gl.bindTexture(gl.TEXTURE_2D, this.bodyTexture);
    this.configure(gl.TEXTURE_2D);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, model.bodyWidth, model.bodyHeight, 0, gl.RED, gl.FLOAT, null);
    this.bodyPixels = new Float32Array(model.bodyWidth * model.bodyHeight);
    this.weightsA = new Float32Array(MAX_MODES); this.weightsB = new Float32Array(MAX_MODES);
    this.bodyWeights = new Float32Array(12);
  }
  configure(target) {
    const gl = this.gl;
    for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(target, key, gl.LINEAR);
    for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(target, key, gl.CLAMP_TO_EDGE);
  }
  slot(index, pinned) {
    const existing = this.slots.find(slot => slot.index === index);
    if (existing) return existing;
    const gl = this.gl, segment = model.segments[index], basis = segment.appearance;
    const slot = this.slots.find(slot => slot !== pinned && slot.index !== index) || {};
    if (!this.slots.includes(slot)) this.slots.push(slot);
    slot.modes ||= gl.createTexture(); slot.mean ||= gl.createTexture();
    gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D_ARRAY, slot.modes); this.configure(gl.TEXTURE_2D_ARRAY);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, model.width, model.height, basis.rank, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array(bytes.buffer, basis.modesOffset, basis.rank * model.width * model.height * 4));
    gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D, slot.mean); this.configure(gl.TEXTURE_2D);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, model.width, model.height, 0, gl.RGBA, gl.HALF_FLOAT,
      new Uint16Array(bytes.buffer, basis.meanOffset, model.width * model.height * 4));
    const cells = this.bodyPixels.length;
    slot.bodyMean = Float32Array.from(new Uint16Array(bytes.buffer, segment.body.meanOffset, cells), half);
    slot.bodyModes = new Uint8Array(bytes.buffer, segment.body.modesOffset, segment.body.rank * cells);
    slot.segment = segment; slot.index = index;
    return slot;
  }
  render(time) {
    time = Math.max(0, Math.min(model.lastTime, time));
    if (time === this.time) return;
    const gl = this.gl, base = Math.min(model.segments.length - 1, Math.floor(time / model.stride));
    const local = time - base * model.stride;
    let mix = Math.max(0, Math.min(1, (local - (model.stride - model.radius)) / model.transition));
    mix = mix * mix * (3 - 2 * mix);
    const indexA = mix === 1 ? Math.min(base + 1, model.segments.length - 1) : base;
    const indexB = mix > 0 && mix < 1 ? Math.min(base + 1, model.segments.length - 1) : indexA;
    if (indexA === indexB) mix = 0;
    const a = this.slot(indexA), b = indexA === indexB ? a : this.slot(indexB, a);
    coefficients(a.segment.appearance, time, this.weightsA); coefficients(b.segment.appearance, time, this.weightsB);
    const { program, uniforms } = this.program;
    gl.useProgram(program); gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer); gl.viewport(0, 0, model.width, model.height);
    for (const [slot, unit, label] of [[a, 8, 'A'], [b, 10, 'B']]) {
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D_ARRAY, slot.modes); gl.uniform1i(uniforms['u_modes' + label], unit);
      gl.activeTexture(gl.TEXTURE0 + unit + 1); gl.bindTexture(gl.TEXTURE_2D, slot.mean); gl.uniform1i(uniforms['u_mean' + label], unit + 1);
    }
    gl.uniform1fv(uniforms['u_weightsA[0]'], this.weightsA); gl.uniform1fv(uniforms['u_weightsB[0]'], this.weightsB);
    gl.uniform1f(uniforms.u_mix, mix);
    const dither = gl.isEnabled(gl.DITHER); gl.disable(gl.DITHER); gl.drawArrays(gl.TRIANGLES, 0, 3); if (dither) gl.enable(gl.DITHER);
    this.bodyPixels.fill(0);
    for (const [slot, weight] of [[a, 1 - mix], [b, mix]]) {
      if (!weight) continue;
      coefficients(slot.segment.body, time, this.bodyWeights);
      for (let i = 0; i < this.bodyPixels.length; i++) this.bodyPixels[i] += weight * slot.bodyMean[i];
      for (let mode = 0; mode < slot.segment.body.rank; mode++) {
        const scale = this.bodyWeights[mode] * weight, offset = mode * this.bodyPixels.length;
        for (let i = 0; i < this.bodyPixels.length; i++) this.bodyPixels[i] += (slot.bodyModes[offset + i] - 128) * scale;
      }
    }
    gl.activeTexture(gl.TEXTURE13); gl.bindTexture(gl.TEXTURE_2D, this.bodyTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, model.bodyWidth, model.bodyHeight, gl.RED, gl.FLOAT, this.bodyPixels);
    this.time = time;
  }
  bind(uniforms) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE12); gl.bindTexture(gl.TEXTURE_2D, this.texture); gl.uniform1i(uniforms.u_appearance, 12);
    gl.activeTexture(gl.TEXTURE13); gl.bindTexture(gl.TEXTURE_2D, this.bodyTexture); gl.uniform1i(uniforms.u_appearanceBody, 13);
  }
  destroy() {
    const gl = this.gl;
    for (const slot of this.slots) { gl.deleteTexture(slot.modes); gl.deleteTexture(slot.mean); }
    gl.deleteTexture(this.texture); gl.deleteTexture(this.bodyTexture); gl.deleteFramebuffer(this.framebuffer); gl.deleteProgram(this.program.program);
  }
}
