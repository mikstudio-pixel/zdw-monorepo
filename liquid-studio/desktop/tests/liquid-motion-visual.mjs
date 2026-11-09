import assert from 'node:assert/strict';

export async function verifyLiquidEvolution(page) {
 const metrics=await page.evaluate(async()=>{
  const {VideoRenderer}=await import('./video-renderer.js'),{RegionMaps}=await import('../shared/regions.js'),{DEFAULTS}=await import('../shared/settings.js');
  const renderer=new VideoRenderer(document.createElement('canvas'));renderer.upload(new Uint8Array([20,30,40,255]),1,1);
  const maps=RegionMaps.empty().useLiquidArea();maps.clear('glass');maps.paint('liquid',[.25,.65],[.75,.65],430,9/16);
  const settings={...DEFAULTS,aspect:'9:16',liquid:true,regions:maps.serialize()};
  const render=time=>{renderer.draw(settings,time,{regions:maps});return renderer.readPixels().slice();};
  const error=(a,b)=>a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length;
  try{
   const pose=render(.75);render(120);const seekError=error(pose,render(.75));
   const nativePeriod=1/.22,periodError=error(pose,render(.75+nativePeriod));
   const continuing=[18,45,120].map(t=>error(render(t),render(t+.7)));
   const continuity=[nativePeriod,30,120].map(t=>error(render(t-1/60),render(t+1/60)));
   return{seekError,periodError,continuing,continuity,ditherRestored:renderer.gl.isEnabled(renderer.gl.DITHER)};
  }finally{renderer.destroy();}
 });
 assert.equal(metrics.seekError,0,'Seek/export is independent of previous frames');
 assert.equal(metrics.periodError,0,'Motion has the original AE Wave Warp period of 1 / 0.22 seconds');
 assert.ok(metrics.continuing.every(v=>v>1),`The native clock continues for long videos: ${metrics.continuing}`);
 assert.ok(metrics.continuity.every(v=>v<8),`There is no reset flash at a wave cycle or later seek: ${metrics.continuity}`);
 assert.equal(metrics.ditherRestored,true,'The filter restores the original GPU dithering state');
 console.log('Native AE motion GPU:',JSON.stringify(metrics));return metrics;
}
