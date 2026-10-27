// Runs in the actual guided application, including Safari in the iOS simulator.
// Pointer events are synthetic; rendering, masks, PNG and MP4 use real app code.
const $=id=>document.getElementById(id),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const platform=/iPhone/.test(navigator.userAgent)?'ios':'browser';
const runId=new URL(location.href).searchParams.get('record')||String(Date.now());
const send=(name,data)=>fetch(`/__qa/${platform}-material-${name}`,{method:'POST',body:data});
const event=(step,detail={})=>fetch('/__qa/events.json',{method:'POST',body:JSON.stringify({step,...detail,runId,userAgent:navigator.userAgent})});
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
async function waitFor(test,timeout=120000){const start=performance.now();while(!test()){if(performance.now()-start>timeout)throw new Error('Timeout: '+$('status-message').textContent);await sleep(100);}}
const slider=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new Event('input',{bubbles:true}));};
async function stroke(from,to){
  const canvas=$('preview'),rect=canvas.getBoundingClientRect(),scale=Math.min(rect.width/canvas.width,rect.height/canvas.height),width=canvas.width*scale,height=canvas.height*scale;
  const point=p=>({clientX:rect.x+(rect.width-width)/2+p[0]*width,clientY:rect.y+(rect.height-height)/2+p[1]*height,pointerId:77,button:0,buttons:1,bubbles:true});
  const capture=canvas.setPointerCapture,release=canvas.releasePointerCapture;canvas.setPointerCapture=()=>{};canvas.releasePointerCapture=()=>{};
  try{canvas.dispatchEvent(new PointerEvent('pointerdown',point(from)));for(let i=1;i<=24;i++){canvas.dispatchEvent(new PointerEvent('pointermove',point(from.map((v,a)=>v+(to[a]-v)*i/24))));await sleep(20);}canvas.dispatchEvent(new PointerEvent('pointerup',{...point(to),buttons:0}));}
  finally{canvas.setPointerCapture=capture;canvas.releasePointerCapture=release;}
}
async function settings(){let result;const save=window.liquid.saveSettings;window.liquid.saveSettings=async value=>{result=structuredClone(value);return{ok:true};};try{await $('save-settings').onclick();}finally{window.liquid.saveSettings=save;$('status').hidden=true;}return result;}
async function png(){let data;const save=window.liquid.exportImage;window.liquid.exportImage=async value=>{data=value;return save(value);};try{await $('export-image').onclick();}finally{window.liquid.exportImage=save;$('status').hidden=true;}return data;}
try{
  await waitFor(()=>window.liquid&&document.body.dataset.step==='liquid'&&!$('replace-video').disabled);
  const file=new File([await(await fetch('/__qa/sync.mp4')).blob()],'Material sync.mp4',{type:'video/mp4'});
  const choose=window.liquid.chooseVideo;window.liquid.chooseVideo=()=>window.liquid.importFile(file);
  try{await $('replace-video').onclick();}finally{window.liquid.chooseVideo=choose;}
  await waitFor(()=>$('file-name').textContent===file.name&&!$('flow-next').disabled);
  document.querySelector('[data-aspect="16:9"]').click();
  slider('brush-size',480);await stroke([.2,.25],[.7,.4]);await stroke([.3,.7],[.8,.65]);
  await event('painted');
  await $('flow-next').onclick();await waitFor(()=>!$('flow-next').disabled);
  const saved=await settings();assert(saved.regions.liquidMode==='area','Expected area mode');assert(saved.regions.liquid.length===1,'Gestures must form one area');
  await send('settings.json',JSON.stringify(saved));
  await $('flow-next').onclick();await waitFor(()=>!$('flow-next').disabled);
  const first=await png();
  await send('preview.png',new Blob([Uint8Array.from(atob(first.split(',')[1]),c=>c.charCodeAt(0))],{type:'image/png'}));
  for(const frame of [21,24,36,0]){
    const source=document.querySelector('video');
    const seeked=new Promise(resolve=>source.addEventListener('seeked',resolve,{once:true}));
    slider('timeline',frame);await seeked;
    const data=await png();
    await send(`preview-${frame}.png`,new Blob([Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0))],{type:'image/png'}));
  }
  const encoder=window.liquid.exportVideo;
  // Capture the exact uncompressed first export frame to check shared rendering.
  const getContext=HTMLCanvasElement.prototype.getContext;let captured=false,capture;
  HTMLCanvasElement.prototype.getContext=function(type,options){const context=getContext.call(this,type,options);if(type==='webgl2'&&context){const draw=context.drawArrays.bind(context),canvas=this;context.drawArrays=(...args)=>{draw(...args);if(!captured&&context.getParameter(context.FRAMEBUFFER_BINDING)===null){captured=true;capture=new Promise(resolve=>canvas.toBlob(resolve)).then(blob=>send('uncompressed.png',blob));}};}return context;};
  let result;
  try{await event('export-start');result=await encoder(saved);await capture;}finally{HTMLCanvasElement.prototype.getContext=getContext;}
  assert(result.ok,result.error);assert(result.value.frames===48,'Expected 48 output frames');
  await send('export.mp4',result.value.file);await event('export-complete',{frames:result.value.frames,width:result.value.width,height:result.value.height});
  const video=document.createElement('video');video.muted=true;video.playsInline=true;video.src=result.value.url;document.body.append(video);
  await video.play();video.pause();
  if(video.currentTime>0){const seeked=new Promise(resolve=>video.addEventListener('seeked',resolve,{once:true}));video.currentTime=0;await seeked;}
  const decoded=document.createElement('canvas');decoded.width=result.value.width;decoded.height=result.value.height;decoded.getContext('2d').drawImage(video,0,0);await send('playback.png',await new Promise(resolve=>decoded.toBlob(resolve)));video.remove();
  await send('report.json',JSON.stringify({success:true,platform,userAgent:navigator.userAgent,areaMode:saved.regions.liquidMode,frames:result.value.frames,png:first.startsWith('data:image/png'),pointerDelivery:'synthetic',physicalDevice:false}));
  document.documentElement.dataset.qaDone='true';await event('done');
}catch(error){await event('failed',{message:error.message,stack:error.stack});document.documentElement.dataset.qaDone='failed';}
