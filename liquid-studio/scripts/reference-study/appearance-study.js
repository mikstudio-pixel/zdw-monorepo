import { vertex } from '/src/shaders.js';
import { appearanceModel } from '/src/liquid-appearance-data.js';
import { LiquidAppearance, appearanceSampling } from '/src/liquid-appearance.js';
import { DEFAULT_LIQUID_COLORS } from '/desktop/shared/settings.js';

const canvas=document.getElementById('surface'),gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true});
canvas.width=960;canvas.height=540;
function compile(fragment){
  const program=gl.createProgram();
  for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
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
const appearance=new LiquidAppearance(gl,compile);
const display=compile(`#version 300 es
precision highp float;
in vec2 v_uv;out vec4 outColor;uniform sampler2D u_appearance;
${appearanceSampling}
void main(){outColor=vec4(appearanceSample(u_appearance,v_uv).rgb,1.);}`);
window.study={kind:'appearance',diagnostics(){return{modelSha256:appearanceModel.payloadSha256,precision:appearance.precision,activeBasisSlots:appearance.slots.length};},colors:DEFAULT_LIQUID_COLORS,draw(time){
  appearance.render(time);gl.useProgram(display.program);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,960,540);
  appearance.bind(display.uniforms);gl.drawArrays(gl.TRIANGLES,0,3);
},render(time){this.draw(time);gl.finish();return canvas.toDataURL('image/png');}};
window.study.draw(0);
