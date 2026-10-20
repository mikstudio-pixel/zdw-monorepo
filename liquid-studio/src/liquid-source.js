import { sourceFragment } from './shaders.js';

// Preserve effect order: path → static wave → Colorama → three box blurs
// → symmetric angular Scratch blur. Turbulence samples this result later.
const sourceHelpers = sourceFragment.slice(0, sourceFragment.indexOf('void main()'));
const pathFragment = sourceHelpers + `
uniform float u_structure;
void main() {
  vec2 q=(v_uv-.5)*vec2(1920.,-1080.);
  float wave=2.*fract((q.x+960.+.1377)/444.)-1.;
  q.y+=88.9598*(2.*sqrt(max(0.,1.-wave*wave))-1.)-.2167;
  vec4 stroke=referenceStroke(q,u_time,u_structure);
  outColor=vec4(stroke.rgb*stroke.a,stroke.a);
}`;
const filterFragment = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_input;
uniform vec2 u_direction;
uniform float u_scratch;
void main() {
  vec4 value=vec4(0.);
  if(u_scratch>.5) {
    vec2 p=(v_uv-.5)*vec2(1920.,1080.);
    for(int i=-12;i<=12;i++) {
      float angle=float(i)/12.*.13962634;
      float c=cos(angle),s=sin(angle);
      vec2 q=mat2(c,-s,s,c)*p;
      vec2 uv=q/vec2(1920.,1080.)+.5;
      if(all(greaterThanEqual(uv,vec2(0.))) && all(lessThanEqual(uv,vec2(1.)))) value+=texture(u_input,uv);
    }
    value/=25.;
  } else {
    for(int i=-5;i<=5;i++) value+=texture(u_input,v_uv+u_direction*float(i));
    value/=11.;
  }
  outColor=value;
}`;

export class LiquidSource {
  constructor(gl, compile, fragment = pathFragment) {
    this.gl=gl;
    this.pathProgram=compile(fragment);
    this.filterProgram=compile(filterFragment);
    this.targets=Array.from({length:2},()=>{
      const texture=gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,texture);
      for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);
      for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,1920,1080,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      const framebuffer=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Nelze vytvořit zdroj liquidu.');
      return {texture,framebuffer};
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
  render(time,structure=.5,palette=null) {
    const t=Math.max(0,Math.min(3.6,time));
    const paletteKey=palette?.join(',') || '';
    if(t===this.time && structure===this.structure && paletteKey===this.paletteKey) return;
    const gl=this.gl;
    gl.viewport(0,0,1920,1080);
    gl.useProgram(this.pathProgram.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets[0].framebuffer);
    gl.uniform1f(this.pathProgram.uniforms.u_time,t);
    gl.uniform1f(this.pathProgram.uniforms.u_structure,structure);
    gl.uniform1f(this.pathProgram.uniforms.u_customPalette,palette ? 1 : 0);
    if(palette) gl.uniform3fv(this.pathProgram.uniforms['u_paletteColors[0]'],palette);
    gl.drawArrays(gl.TRIANGLES,0,3);
    const {program,uniforms}=this.filterProgram;
    gl.useProgram(program); gl.uniform1i(uniforms.u_input,0); gl.uniform1f(uniforms.u_scratch,0);
    let index=0;
    for(let pass=0;pass<7;pass++) {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.targets[index].texture);
      index=1-index; gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets[index].framebuffer);
      gl.uniform2f(uniforms.u_direction,pass%2===0?1/1920:0,pass%2?1/1080:0);
      gl.uniform1f(uniforms.u_scratch,pass===6?1:0);
      gl.drawArrays(gl.TRIANGLES,0,3);
    }
    this.texture=this.targets[index].texture;
    this.time=t; this.structure=structure; this.paletteKey=paletteKey;
  }
  bind(uniforms) {
    if(uniforms.u_filteredSource===undefined) return;
    const gl=this.gl;
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D,this.texture);
    gl.uniform1i(uniforms.u_filteredSource,5);
    gl.activeTexture(gl.TEXTURE0);
  }
  destroy() {
    const gl=this.gl;
    gl.deleteProgram(this.pathProgram.program); gl.deleteProgram(this.filterProgram.program);
    for(const target of this.targets) {gl.deleteTexture(target.texture);gl.deleteFramebuffer(target.framebuffer);}
  }
}
