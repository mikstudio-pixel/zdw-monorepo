import { vertex, sourceFragment } from '/src/shaders.js';
import { liquidMaterial } from '/src/liquid-material.js';
import { DEFAULT_LIQUID_COLORS } from '/desktop/shared/settings.js';

if(new URL(location.href).searchParams.has('baseline')){
const canvas=document.getElementById('surface'), gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true});
const helpers=sourceFragment.slice(0,sourceFragment.indexOf('void main()'));
const fragment=helpers+liquidMaterial+`
void main() {
  vec2 p=(v_uv-.5)*vec2(16./9.,1.);
  vec2 q=materialDomain(p,u_time);
  vec2 box=abs(q-vec2(0.,.06))-vec2(.41,.27);
  float body=.060-length(max(box,0.))-min(max(box.x,box.y),0.);
  float opening=materialOpenings(q,.5);
  float surface=min(body,opening);
  float angular=abs(dFdx(surface)*(-p.y)+dFdy(surface)*p.x)*1080.*.018;
  float edge=max(sqrt(.006*.006+angular*angular),fwidth(surface)*.7);
  float alpha=smoothstep(-edge,edge,surface);
  outColor=vec4(materialColor(q,opening)*alpha,1.);
}`;
function shader(type,source) {
  const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}
const program=gl.createProgram();
gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
gl.useProgram(program);
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
const position=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
const colors=DEFAULT_LIQUID_COLORS;
gl.uniform3fv(gl.getUniformLocation(program,'u_paletteColors[0]'),new Float32Array(colors.flatMap(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)))));
const timeLocation=gl.getUniformLocation(program,'u_time');
window.study={draw(time){gl.uniform1f(timeLocation,time);gl.drawArrays(gl.TRIANGLES,0,3);},render(time){this.draw(time);gl.finish();return canvas.toDataURL('image/png');},colors};
}else await import(new URL(location.href).searchParams.has('previous')?'./distill-study.js':'./appearance-study.js');
window.study.ready=true;
const video=document.getElementById('reference'),slider=document.getElementById('time'),clock=document.getElementById('clock');
const previous=new URL(location.href).searchParams.has('previous');
if(previous)document.getElementById('variant').textContent='Předchozí generátor · stejný snímek a měřítko';
const quality=document.getElementById('quality');
let report,qualityMismatch;
function showQuality(time){
  if(!report)return;
  if(qualityMismatch){quality.textContent=qualityMismatch;return;}
  const row=report.perFrame[Math.max(0,Math.min(report.frames-1,Math.round(time*report.fps)))];
  quality.textContent=`Snímek ${row.frame} / ${report.frames-1} · SSIM kapaliny ${row.ssimForeground.toFixed(4)} · MAE ${row.maeForeground255.toFixed(2)} / 255 · IoU ${(100*row.coverageIoU).toFixed(2)} % · průměrné SSIM sekvence ${report.all.ssimForeground.mean.toFixed(4)}`;
}
fetch('/web/test-results/reference-study-v3/'+(previous?'before-similarity.json':'similarity.json')).then(response=>{
  if(!response.ok)throw new Error('Report není dostupný');return response.json();
}).then(value=>{
  report=value;
  const current=window.study.diagnostics?.(),measured=value.capture?.diagnostics;
  if(current&&(!measured||current.modelSha256!==measured.modelSha256||current.precision!==measured.precision))
    qualityMismatch='Dostupné měření patří jiné verzi modelu nebo přesnosti GPU. Tento výstup je potřeba znovu přeměřit.';
  showQuality(video.currentTime);
}).catch(()=>{quality.textContent='Měření tohoto sestavení zatím není dostupné.';});
slider.oninput=()=>{video.currentTime=Number(slider.value);window.study.draw(Number(slider.value));clock.value=Number(slider.value).toFixed(2)+' s';showQuality(Number(slider.value));};
document.getElementById('play').onclick=()=>video.paused?video.play():video.pause();
function display(time){window.study.draw(time);slider.value=time;clock.value=time.toFixed(2)+' s';showQuality(time);}
if(video.requestVideoFrameCallback){
  const tick=(_now,metadata)=>{if(!video.paused)display(metadata.mediaTime);video.requestVideoFrameCallback(tick);};
  video.requestVideoFrameCallback(tick);
}else{
  const tick=()=>{if(!video.paused)display(video.currentTime);requestAnimationFrame(tick);};tick();
}
video.addEventListener('seeked',()=>{if(video.paused)display(video.currentTime);});
window.study.draw(0);
