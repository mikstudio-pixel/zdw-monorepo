import { flowModel, flowSpatial, flowTemporal } from './liquid-flow-data.js';

// A velocity model, not a sequence of poses: characteristics are integrated at
// the requested time. Any procedural geometry can be carried by this field.
const volumeCache = new Map();
function velocityVolume(slices) {
  if (volumeCache.has(slices)) return volumeCache.get(slices);
  const { width, height, rank, terms, spatialScale, frequencies } = flowModel;
  const cells = width * height, step = 180 / (slices - 2);
  const pixels = new Float32Array(cells * slices * 2);
  const basis = new Float64Array(terms), amplitudes = new Float64Array(rank);
  for (let z = 0; z < slices; z++) {
    const time = z * step;
    basis[0] = 1;
    frequencies.forEach((frequency, i) => { basis[i * 2 + 1] = Math.sin(frequency * time); basis[i * 2 + 2] = Math.cos(frequency * time); });
    amplitudes.fill(0);
    for (let term = 0; term < terms; term++) for (let mode = 0; mode < rank; mode++) amplitudes[mode] += basis[term] * flowTemporal[term * rank + mode];
    const start = z * cells * 2;
    for (let mode = 0; mode < rank; mode++) {
      const weight = amplitudes[mode] * spatialScale / 270;
      const offset = mode * cells * 2;
      for (let i = 0; i < cells * 2; i += 2) {
        pixels[start + i] += flowSpatial[offset + i] * weight;
        pixels[start + i + 1] -= flowSpatial[offset + i + 1] * weight;
      }
    }
  }
  const volume = { pixels, step };
  volumeCache.set(slices, volume);
  return volume;
}

const flowFragment = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform highp sampler3D u_velocity;
uniform float u_time;
uniform float u_coherence;
uniform float u_phase;
uniform vec2 u_timeGrid;
vec2 velocity(vec2 p,float time) {
  vec2 uv=p*vec2(9./16.,-1.)+.5;
  vec2 value=texture(u_velocity,vec3(clamp(uv,0.,1.),(time/u_timeGrid.x+.5)/u_timeGrid.y)).rg;
  float outside=max(max(-uv.x,uv.x-1.),max(-uv.y,uv.y-1.));
  value=mix(value,vec2(-.01925926,0.),smoothstep(0.,.1,outside));
  return value*min(1.,.09/max(length(value),.00001));
}
void main() {
  vec2 p=(v_uv-.5)*vec2(16./9.,1.),q=p;
  float time=max(u_time,0.);
  // Reference structures continually enter, merge and disappear. Transporting
  // one initial pattern for the whole clip accumulates artificial filaments.
  // Two overlapping characteristic windows each follow the measured velocity
  // exactly. Their scalar material fields join while each window renews at
  // zero weight; global carrier phase continues without replaying old poses.
  float period=2.*u_coherence;
  float start=floor((time+u_coherence-u_phase)/period)*period+u_phase;
  float direction=sign(time-start);
  float step=.25;
  // Midpoint characteristics preserve local turning and stretching. Sampling
  // only a displacement or interpolating two poses loses these trajectories.
  for(int i=0;i<20;i++) {
    if(abs(time-start)<.00001) break;
    float dt=min(abs(time-start),step)*direction;
    float middle=time-dt*.5;
    vec2 a=velocity(q,middle);
    q-=velocity(q-a*dt*.5,middle)*dt;
    time-=dt;
  }
  // Pack each signed displacement in two UNORM bytes. Decoding is linear,
  // so hardware bilinear filtering remains valid across byte boundaries.
  // This avoids requiring a renderable floating-point framebuffer on Safari.
  vec2 displacement=q-p+vec2(.01925926*start,0.);
  vec2 code=clamp(displacement*4096.+32768.,0.,65535.);
  vec2 high=floor(code/256.),low=code-high*256.;
  outColor=vec4(high.x,low.x,high.y,low.y)/255.;
}`;

export class LiquidFlow {
  constructor(gl, compile) {
    this.gl = gl;
    this.program = compile(flowFragment);
    const slices = Math.min(722, gl.getParameter(gl.MAX_3D_TEXTURE_SIZE));
    const { pixels, step } = velocityVolume(slices);
    this.slices = slices; this.step = step;
    this.velocity = gl.createTexture();
    gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_3D, this.velocity);
    for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_3D, key, gl.LINEAR);
    for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, key, gl.CLAMP_TO_EDGE);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RG16F, flowModel.width, flowModel.height, slices, 0, gl.RG, gl.FLOAT, pixels);
    this.targets = Array.from({ length: 2 }, () => {
      const texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D, texture);
      for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, key, gl.LINEAR);
      for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, key, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 320, 180, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const framebuffer = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Pole proudění liquidu nelze připravit.');
      return { texture, framebuffer };
    });
    this.framebuffer = this.targets[0].framebuffer;
  }
  render(time) {
    if (this.time === time) return;
    const gl = this.gl, { program, uniforms } = this.program;
    gl.useProgram(program); gl.viewport(0, 0, 320, 180);
    gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_3D, this.velocity);
    gl.uniform1i(uniforms.u_velocity, 9); gl.uniform1f(uniforms.u_time, time);
    gl.uniform1f(uniforms.u_coherence, flowModel.coherenceSeconds);
    gl.uniform2f(uniforms.u_timeGrid, this.step, this.slices);
    // One dithered high byte would move the surface by ~67 reference pixels.
    // These are numeric coordinates, so preserve their exact UNORM bytes.
    const dither = gl.isEnabled(gl.DITHER);
    gl.disable(gl.DITHER);
    this.targets.forEach((target, i) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.uniform1f(uniforms.u_phase, i * flowModel.coherenceSeconds);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    if (dither) gl.enable(gl.DITHER);
    this.time = time;
    this.mix = Math.sin(Math.PI * time / (2 * flowModel.coherenceSeconds)) ** 2;
  }
  bind(uniforms) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D, this.targets[0].texture);
    gl.uniform1i(uniforms.u_materialFlow, 8);
    gl.activeTexture(gl.TEXTURE10); gl.bindTexture(gl.TEXTURE_2D, this.targets[1].texture);
    gl.uniform1i(uniforms.u_materialFlowB, 10);
    gl.uniform1f(uniforms.u_materialMix, this.mix);
  }
  destroy() {
    const gl = this.gl;
    gl.deleteProgram(this.program.program); gl.deleteTexture(this.velocity);
    this.targets.forEach(target => { gl.deleteTexture(target.texture); gl.deleteFramebuffer(target.framebuffer); });
  }
}
