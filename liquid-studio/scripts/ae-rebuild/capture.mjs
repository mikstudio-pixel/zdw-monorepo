// Use capture.mjs --serve from reference-study to serve the source tree.
import { _electron as electron } from '../../desktop/node_modules/playwright/index.mjs';
import executablePath from '../../desktop/node_modules/electron/index.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
if(!process.argv[2]||!process.argv[3])throw new Error('Usage: node capture.mjs http://localhost:PORT /absolute/output [--before]');
const output=resolve(process.argv[3]),before=process.argv.includes('--before');
const fixtures=JSON.parse(await readFile(new URL('./fixtures.json',import.meta.url),'utf8'));
const frames=Number(process.env.LIQUID_FRAME_COUNT||fixtures.frames),selected=[0,14,25,50,75,100,124];
await mkdir(output,{recursive:true});
const app=await electron.launch({executablePath,args:[root+'web/tests/browser-host.cjs'],env:{...process.env,LIQUID_TEST_URL:new URL('/scripts/ae-rebuild/host.html',process.argv[2]).href}});
try {
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [name,strokes] of Object.entries(fixtures.cases)) {
  await mkdir(`${output}/${name}/material`,{recursive:true});await mkdir(`${output}/${name}/scene`,{recursive:true});
  await page.evaluate(async({before,strokes,fixtures})=>{
   const prefix=before?'/baseline/desktop':'/desktop';
   const {VideoRenderer}=await import(prefix+'/renderer/video-renderer.js'),{RegionMaps}=await import(prefix+'/shared/regions.js'),{DEFAULTS}=await import(prefix+'/shared/settings.js');
   const video=document.createElement('video');video.muted=true;video.src='/web/assets/zdw-demo-portrait.mp4';
   await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;});
   // Force the initial decoded frame into Chromium's video texture too.
   // loadeddata alone can expose a black texture before the first seek.
   for(const time of [1/fixtures.fps,0])await new Promise(resolve=>{video.onseeked=resolve;video.currentTime=time;});
   const maps=RegionMaps.empty().useLiquidArea();maps.clear('glass');for(const [a,b,size] of strokes)maps.paint('liquid',a,b,size,9/16);
   const renderer=new VideoRenderer(document.createElement('canvas'));
   window.probe={video,maps,renderer,settings:{...DEFAULTS,aspect:fixtures.aspect,opacity:fixtures.opacity,liquid:true,regions:maps.serialize()}};
  },{before,strokes,fixtures});
  for(let frame=0;frame<frames;frame++) {
   if(before&&!selected.includes(frame))continue;
   const capture=await page.evaluate(async({frame,fps})=>{
    const {video,maps,renderer,settings}=window.probe,time=frame/fps;
    if(Math.abs(video.currentTime-time)>1e-6)await new Promise(resolve=>{video.onseeked=resolve;video.currentTime=time;});
    renderer.upload(video);renderer.draw(settings,time,{regions:maps});
    const scene=document.createElement('canvas');scene.width=1080;scene.height=1920;scene.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(renderer.readPixels()),1080,1920),0,0);
    const gl=renderer.gl,w=renderer.liquidWidth,h=renderer.liquidHeight,pixels=new Uint8Array(w*h*4);gl.bindFramebuffer(gl.FRAMEBUFFER,renderer.liquidFramebuffer);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    if(gl.getError()!==gl.NO_ERROR)throw new Error('Cannot read material');
    const flipped=new Uint8ClampedArray(pixels.length);for(let y=0;y<h;y++)flipped.set(pixels.subarray(y*w*4,(y+1)*w*4),(h-1-y)*w*4);
    const material=document.createElement('canvas');material.width=w;material.height=h;material.getContext('2d').putImageData(new ImageData(flipped,w,h),0,0);
    return{scene:scene.toDataURL('image/png'),material:material.toDataURL('image/png')};
   },{frame,fps:fixtures.fps});
   for(const kind of ['scene','material'])await writeFile(`${output}/${name}/${kind}/${String(frame).padStart(4,'0')}.png`,Buffer.from(capture[kind].split(',')[1],'base64'));
   if(frame%25===0)console.log(name,frame);
  }
  await page.evaluate(()=>window.probe.renderer.destroy());
 }
 await writeFile(output+'/capture.json',JSON.stringify({environment:'Electron / Chromium desktop',physicalDevice:false,before,fixtures,frames,errors},null,2));
 if(errors.length)throw new Error(errors.join('\n'));
}finally{await app.close();}
