import { vertex, sourceFragment } from '/src/shaders.js';
import { liquidMaterial } from '/src/liquid-material.js';
import { LiquidFlow } from '/src/liquid-flow.js';
import { LiquidFilter } from '/src/liquid-filter.js';
import { DEFAULT_LIQUID_COLORS } from '/desktop/shared/settings.js';

const canvas=document.getElementById('surface'),gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true});
canvas.width=960;canvas.height=540;
function compile(fragment){
  const program=gl.createProgram();
  for(const [type,source]of[[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
    const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program,shader);gl.deleteShader(shader);
  }
  gl.bindAttribLocation(program,0,'a_position');gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
  const uniforms={};for(let i=0;i<gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS);i++){const {name}=gl.getActiveUniform(program,i);uniforms[name]=gl.getUniformLocation(program,name);}
  return{program,uniforms};
}
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
const helpers=sourceFragment.slice(0,sourceFragment.indexOf('void main()'));
const program=compile(helpers+liquidMaterial.replace('max(u_time,0.)*.25','0.')+`
uniform sampler2D u_materialFlow;
uniform sampler2D u_materialFlowB;
uniform float u_materialMix;
vec2 unpackFlow(sampler2D field,vec2 uv){vec4 v=texture(field,uv);return(vec2(v.r*256.+v.g,v.b*256.+v.a)*255.-32768.)/4096.;}
void main(){
  vec2 p=(v_uv-.5)*vec2(16./9.,1.);
  vec2 a=unpackFlow(u_materialFlow,v_uv),b=unpackFlow(u_materialFlowB,v_uv);
  vec2 displacement=mix(a,b,u_materialMix);
  vec2 drift=mix(unpackFlow(u_materialFlow,vec2(.5)),unpackFlow(u_materialFlowB,vec2(.5)),u_materialMix);
  vec2 bodyDomain=materialDomain(p+.04*tanh((displacement-drift)/.08),0.);
  vec2 box=abs(bodyDomain-vec2(0.,.06))-vec2(.41,.27);
  float body=.060-length(max(box,0.))-min(max(box.x,box.y),0.);
  float opening=mix(materialOpenings(materialDomain(p+a,0.),.5),materialOpenings(materialDomain(p+b,0.),.5),u_materialMix);
  float surface=min(body,opening);
  float alpha=smoothstep(-max(.0006,fwidth(surface)*.7),max(.0006,fwidth(surface)*.7),surface);
  outColor=vec4(materialColor(bodyDomain,opening)*alpha,alpha);
}`);
const raw=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,raw);
for(const key of[gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);
for(const key of[gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,960,540,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
const target=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,target);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,raw,0);
const flow=new LiquidFlow(gl,compile),filter=new LiquidFilter(gl,compile);
const colors=DEFAULT_LIQUID_COLORS,palette=new Float32Array(colors.flatMap(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))));
window.study={kind:'distilled',colors,draw(time,parameters){
  flow.render(time);gl.useProgram(program.program);gl.bindFramebuffer(gl.FRAMEBUFFER,target);gl.viewport(0,0,960,540);
  flow.bind(program.uniforms);gl.uniform3fv(program.uniforms['u_paletteColors[0]'],palette);gl.drawArrays(gl.TRIANGLES,0,3);
  filter.render(raw,null,1920,1080,1,parameters);
},render(time,parameters){this.draw(time,parameters);gl.finish();return canvas.toDataURL('image/png');}};
window.study.draw(0);
