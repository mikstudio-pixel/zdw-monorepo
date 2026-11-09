import assert from 'node:assert/strict';

export async function verifyUnifiedLiquid(page) {
 const metrics=await page.evaluate(async()=>{
  const {VideoRenderer}=await import('./video-renderer.js'),{RegionMaps}=await import('../shared/regions.js'),{DEFAULTS}=await import('../shared/settings.js');
  const renderer=new VideoRenderer(document.createElement('canvas'));renderer.upload(new Uint8Array([20,30,40,255]),1,1);
  const strokes=[[[.2,.55],[.5,.55],300],[[.5,.55],[.8,.55],300]];
  const make=list=>{const maps=RegionMaps.empty().useLiquidArea();maps.clear('glass');for(const [a,b,d] of list)maps.paint('liquid',a,b,d,16/9);return maps;};
  const read=()=>{const gl=renderer.gl,pixels=new Uint8Array(renderer.liquidWidth*renderer.liquidHeight*4);gl.bindFramebuffer(gl.FRAMEBUFFER,renderer.liquidFramebuffer);gl.readPixels(0,0,renderer.liquidWidth,renderer.liquidHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);if(gl.getError()!==gl.NO_ERROR)throw new Error('Cannot read painted liquid');return pixels;};
  const render=(maps,time=0,colors=DEFAULTS.liquidColors)=>{renderer.draw({...DEFAULTS,liquid:true,liquidColors:colors,regions:maps.serialize()},time,{regions:maps});return read();};
  const error=(a,b)=>a.reduce((max,v,i)=>Math.max(max,Math.abs(v-b[i])),0);
  try{
   const a=make(strokes),b=make([...strokes].reverse()),first=render(a);
   const orderError=error(first,render(b));
   const fusedError=error(first,render(make([[[.2,.55],[.8,.55],300]])));
   for(const [from,to,size] of strokes)a.paint('liquid',from,to,size,16/9);
   const repeatError=error(first,render(a));
   const empty=make([]);const emptyPixels=[0,2,120].map(t=>render(empty,t).filter((v,i)=>i%4===3&&v).length);
   const edge=make([[[.02,.5],[.02,.5],120]]);let oppositeEdgePixels=0;
   for(const time of [0,2,4]){
    const pixels=render(edge,time),w=renderer.liquidWidth,h=renderer.liquidHeight;
    // This edge is farther from the source than the measured native warp's
    // entire support. Texture clamping/wrapping must not create another copy.
    for(let y=0;y<h;y++)for(let x=Math.floor(w*.75);x<w;x++)if(pixels[(y*w+x)*4+3])oppositeEdgePixels++;
   }
   const flat=render(a,1,Array(7).fill('#cc44aa'));let paletteError=0,opaque=0,soft=0;
   for(let i=0;i<flat.length;i+=4){const alpha=flat[i+3];if(alpha>16&&alpha<240)soft++;if(alpha<224)continue;opaque++;for(const [c,value] of [[0,204],[1,68],[2,170]])paletteError=Math.max(paletteError,Math.abs(flat[i+c]*255/alpha-value));}
   const theme = render(a, 1, ['#ff0000', '#ff0000', '#ff0000', '#ff0000', '#0000ff', '#0000ff', '#0000ff']);
   const reference = render(a, 1);
   let red = 0, blue = 0, alphaError = 0;
   for (let i = 0; i < theme.length; i += 4) {
    alphaError = Math.max(alphaError, Math.abs(theme[i + 3] - reference[i + 3]));
    if (theme[i + 3] < 224) continue;
    if (theme[i] > 180) red++;
    if (theme[i + 2] > 180) blue++;
   }
   const animationChange=error(render(a,0),render(a,1));
   const portrait = RegionMaps.empty().useLiquidArea();
   portrait.clear('glass');
   portrait.paint('liquid', [.04,.76], [.96,.85], 640, 9/16);
   portrait.paint('liquid', [.12,.91], [.94,.92], 400, 9/16);
   const settings = { ...DEFAULTS, aspect: '9:16', liquid: true, regions: portrait.serialize() };
   const bottomCoverage = [0, 1.5, 3].map(time => {
    renderer.draw(settings, time, { regions: portrait });
    const pixels = read(), band = renderer.liquidWidth * 10;
    let covered = 0;
    for (let i = 0; i < band; i++) if (pixels[i * 4 + 3] >= 128) covered++;
    return covered / band;
   });
   const restoredAfterOverscan = error(first, render(a));
   const forehead = RegionMaps.empty().useLiquidArea();
   forehead.clear('glass');
   forehead.paint('liquid', [.006,.239], [.345,.037], 225, 9/16);
   const foreheadSettings = { ...settings, regions: forehead.serialize() };
   let eyeAlpha = 0, minForeheadPixels = Infinity;
   for (const time of [0, 1.5, 3]) {
    renderer.draw(foreheadSettings, time, { regions: forehead });
    const pixels = read(), w = renderer.liquidWidth, h = renderer.liquidHeight;
    let foreheadPixels = 0;
    for (let y = 0; y < h; y++) {
     const v = 1 - (y + .5) / h;
     for (let x = 0; x < w; x++) {
      const u = (x + .5) / w, alpha = pixels[(y * w + x) * 4 + 3];
      if (u > .54 && u < .66 && v > .43 && v < .53) eyeAlpha = Math.max(eyeAlpha, alpha);
      if (u < .54 && v < .30 && alpha >= 128) foreheadPixels++;
     }
    }
    minForeheadPixels = Math.min(minForeheadPixels, foreheadPixels);
   }
   return{orderError,fusedError,repeatError,emptyPixels,oppositeEdgePixels,paletteError,opaque,soft,animationChange,red,blue,alphaError,bottomCoverage,restoredAfterOverscan,eyeAlpha,minForeheadPixels};
  }finally{renderer.destroy();}
 });
 assert.equal(metrics.orderError,0,'All areas are united before the effect stack, independently of painting order');
 assert.equal(metrics.fusedError,0,'Two intersecting areas render exactly like the equivalent single fused area');
 assert.equal(metrics.repeatError,0,'Overlapping or repeated paint cannot add layers or double opacity');
 assert.ok(metrics.emptyPixels.every(v=>v===0),'Empty source space never spawns material, including after long seeks');
 assert.equal(metrics.oppositeEdgePixels,0,'Continuing a painted edge never copies material to the opposite side');
 assert.ok(metrics.bottomCoverage.every(coverage => coverage > .7), `A painted border stays covered through the wave: ${metrics.bottomCoverage}`);
 assert.equal(metrics.restoredAfterOverscan,0,'Returning to an interior mask restores the unpadded render');
 assert.equal(metrics.eyeAlpha, 0, 'A forehead stroke does not cast a remote spot beside the eye');
 assert.ok(metrics.minForeheadPixels > 1000, 'The forehead stroke retains a visible body through the wave');
 assert.ok(metrics.opaque>3000,'The material retains an opaque interior');
 assert.ok(metrics.soft>1000,'Premultiplied filtering creates a soft boundary');
 assert.ok(metrics.paletteError<2,`A single-color palette remains that color through merging and all filters: ${metrics.paletteError}`);
 assert.equal(metrics.alphaError, 0, 'Changing the theme leaves the material silhouette intact');
 assert.ok(metrics.red > 1000 && metrics.blue > 1000, 'A theme reaches both color bands in the active Colorama range');
 assert.ok(metrics.animationChange>20,'The native wave deforms the common surface');
 console.log('Native AE union GPU:',JSON.stringify(metrics));return metrics;
}
