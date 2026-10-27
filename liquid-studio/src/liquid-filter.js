// Optical softness is applied to premultiplied material, before composition.
// The background/media and the editing mask never pass through this filter.
export const MATERIAL_FILTER = Object.freeze({ sigma: .84, angle: .0634 });
const fragment = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_input;
uniform vec2 u_direction;
uniform vec2 u_aspect;
uniform float u_angle;
uniform float u_angular;
uniform float u_opaque;
void main() {
  vec4 color=vec4(0.);
  float weight=0.;
  vec2 p=(v_uv-.5)*u_aspect;
  for(int i=-8;i<=8;i++) {
    float x=float(i),w=exp(-.5*x*x/9.);
    vec2 uv=v_uv+x*u_direction;
    if(u_angular>.5) {
      float angle=x/8.*u_angle,c=cos(angle),s=sin(angle);
      uv=mat2(c,-s,s,c)*p/u_aspect+.5;
    }
    color+=texture(u_input,clamp(uv,0.,1.))*w;
    weight+=w;
  }
  outColor=vec4(color.rgb/weight,mix(color.a/weight,1.,u_opaque));
}`;

export class LiquidFilter {
  constructor(gl, compile) {
    this.gl = gl; this.program = compile(fragment);
    this.targets = Array.from({ length: 2 }, () => {
      const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
      for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, key, gl.LINEAR);
      for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, key, gl.CLAMP_TO_EDGE);
      return { texture, framebuffer: gl.createFramebuffer() };
    });
  }
  render(source, framebuffer, width, height, progress = 1, parameters = MATERIAL_FILTER) {
    const gl = this.gl, rasterWidth = width / 2, rasterHeight = height / 2;
    if (this.width !== width || this.height !== height) {
      for (const target of this.targets) {
        gl.bindTexture(gl.TEXTURE_2D, target.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, rasterWidth, rasterHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Filtr liquidu nelze připravit.');
      }
      this.width = width; this.height = height;
    }
    const { program, uniforms } = this.program;
    gl.useProgram(program); gl.viewport(0, 0, rasterWidth, rasterHeight);
    gl.uniform1i(uniforms.u_input, 0); gl.uniform2f(uniforms.u_aspect, width / height, 1);
    gl.uniform1f(uniforms.u_angle, parameters.angle * progress);
    const sigma = parameters.sigma * progress * height / 1080;
    for (let pass = 0; pass < 3; pass++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, pass === 2 ? framebuffer : this.targets[pass].framebuffer);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pass ? this.targets[pass - 1].texture : source);
      gl.uniform1f(uniforms.u_angular, pass === 2 ? 1 : 0);
      gl.uniform1f(uniforms.u_opaque, pass === 2 && framebuffer === null ? 1 : 0);
      gl.uniform2f(uniforms.u_direction, pass === 0 ? sigma / 3 / width : 0, pass === 1 ? sigma / 3 / height : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }
  destroy() {
    const gl = this.gl;
    gl.deleteProgram(this.program.program);
    this.targets.forEach(target => { gl.deleteTexture(target.texture); gl.deleteFramebuffer(target.framebuffer); });
  }
}
