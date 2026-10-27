// Usage: node scripts/reference-study/capture.mjs /absolute/reference.mp4 /absolute/output
// Optional LIQUID_BASELINE points at a snapshot containing desktop/{renderer,shared,vendor}.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '../../desktop/node_modules/playwright/index.mjs';
import executablePath from '../../desktop/node_modules/electron/index.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
if(!process.argv[2]||!process.argv[3])throw new Error('Usage: node scripts/reference-study/capture.mjs /absolute/reference.mp4 /absolute/output [--serve]');
const reference=resolve(process.argv[2]),output=resolve(process.argv[3]);
const interactive=process.argv.includes('--serve');
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const baseline=pathname.startsWith('/baseline/')&&process.env.LIQUID_BASELINE;
    const base=baseline?resolve(process.env.LIQUID_BASELINE):root;
    const path=pathname==='/reference.mp4'?reference:resolve(base,'.'+(pathname==='/'?'/scripts/reference-study/index.html':baseline?pathname.slice(9):pathname));
    if(path!==reference&&!path.startsWith(base.endsWith(sep)?base:base+sep)){res.writeHead(403).end();return;}
    const size=(await stat(path)).size,types={'.html':'text/html','.js':'text/javascript','.mp4':'video/mp4','.png':'image/png'};
    const headers={'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store','Accept-Ranges':'bytes'};
    const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
    if(range){const start=Number(range[1]),end=Math.min(size-1,range[2]?Number(range[2]):size-1);res.writeHead(206,{...headers,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${size}`});createReadStream(path,{start,end}).pipe(res);}
    else {res.writeHead(200,{...headers,'Content-Length':size});createReadStream(path).pipe(res);}
  }catch(error){res.writeHead(404).end(error.message);}
});
await new Promise(resolve=>server.listen(interactive?Number(process.env.PORT||56737):0,'127.0.0.1',resolve));
const url=`http://localhost:${server.address().port}`;
let app;
if(interactive){
  console.log(`Reference study: ${url}`);
  await new Promise(resolve=>process.once('SIGINT',resolve));
  await new Promise(resolve=>server.close(resolve));
}else{
try{
  app=await electron.launch({executablePath,args:[root+'web/tests/browser-host.cjs'],env:{...process.env,LIQUID_TEST_URL:url+(process.env.LIQUID_PREVIOUS==='1'?'/?previous=1':'')},timeout:60000});
  const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.waitForFunction(()=>window.study?.ready,null,{timeout:120000});
  const save=async(name,data)=>writeFile(output+'/'+name,Buffer.from(data.split(',')[1],'base64'));
  const parameters=process.env.LIQUID_FILTER?JSON.parse(process.env.LIQUID_FILTER):undefined;
  const render=time=>page.evaluate(({time,parameters})=>window.study.render(time,parameters),{time,parameters});
  for(const time of [0,2,5,10,20,26.7666667]) await save(`study-${time.toFixed(3)}.png`,await render(time));
  if(process.env.LIQUID_MOTION==='1'){
    await mkdir(output+'/motion',{recursive:true});
    for(let frame=0;frame<Number(process.env.LIQUID_FRAME_COUNT||180);frame++) await save(`motion/${String(frame).padStart(4,'0')}.png`,await render(frame/30));
  }
  // Actual shared renderer, identical source, area gestures, palette and time.
  for(const variant of process.env.LIQUID_STUDY_ONLY==='1'?[]:process.env.LIQUID_BASELINE?['before','after']:['after']){
    const prefix=variant==='before'?'/baseline/desktop':'/desktop';
    await page.evaluate(async({prefix,colors})=>{
      const {VideoRenderer}=await import(prefix+'/renderer/video-renderer.js');
      const {RegionMaps}=await import(prefix+'/shared/regions.js');
      const {DEFAULTS}=await import(prefix+'/shared/settings.js');
      const canvas=document.createElement('canvas');document.body.append(canvas);
      const renderer=new VideoRenderer(canvas),source=document.createElement('canvas');source.width=1920;source.height=1080;
      const ctx=source.getContext('2d');ctx.fillStyle='#101918';ctx.fillRect(0,0,1920,1080);
      for(let i=0;i<20;i++){ctx.fillStyle=i%2?'#65796b':'#bcc9b0';ctx.fillRect(i*96,200,48,680);}
      renderer.upload(source);
      const maps=RegionMaps.empty().useLiquidArea();maps.clear('glass');
      maps.paint('liquid',[.3,.35],[.7,.35],280,16/9);maps.paint('liquid',[.3,.5],[.7,.5],350,16/9);maps.paint('liquid',[.3,.65],[.7,.65],280,16/9);
      const settings={...DEFAULTS,liquid:true,opacity:100,liquidColors:colors,regions:maps.serialize()};
      window.integrated={renderer,canvas,maps,settings,render(time){renderer.draw(settings,time,{regions:maps});const pixels=renderer.readPixels();const out=document.createElement('canvas');out.width=canvas.width;out.height=canvas.height;out.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels),canvas.width,canvas.height),0,0);return out.toDataURL();}};
    },{prefix,colors:await page.evaluate(()=>window.study.colors)});
    for(const time of [0,2,5,10,20,26.7666667])await save(`${variant}-${time.toFixed(3)}.png`,await page.evaluate(t=>window.integrated.render(t),time));
    await page.evaluate(()=>{window.integrated.renderer.destroy();window.integrated.canvas.remove();});
  }
  const identityA=await render(0);await render(20);const identityB=await render(0);
  if(identityA!==identityB)throw new Error('Non-deterministic seek: same time produced different pixels');
  const sourceHash=createHash('sha256');
  for(const name of ['src/liquid-appearance.js','scripts/reference-study/appearance-study.js','src/shaders.js'])sourceHash.update(await readFile(root+name));
  const rendererSha256=sourceHash.digest('hex');
  const diagnostics=await page.evaluate(()=>window.study.diagnostics?.()||null);
  await writeFile(output+'/capture.json',JSON.stringify({browser:'Electron / Chromium desktop',deterministicSeek:true,rendererSha256,diagnostics,errors},null,2));
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(output);
}finally{await app?.close();await new Promise(resolve=>server.close(resolve));}
}
