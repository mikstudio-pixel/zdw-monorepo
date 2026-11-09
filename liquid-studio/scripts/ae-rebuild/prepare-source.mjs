import { _electron as electron } from '../../desktop/node_modules/playwright/index.mjs';
import executablePath from '../../desktop/node_modules/electron/index.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
if(!process.argv[2]||!process.argv[3])throw new Error('Usage: node prepare-source.mjs http://localhost:PORT /absolute/output');
const output=resolve(process.argv[3]);await mkdir(output,{recursive:true});
const fixtures=JSON.parse(await readFile(new URL('./fixtures.json',import.meta.url),'utf8'));
const app=await electron.launch({executablePath,args:[root+'web/tests/browser-host.cjs'],env:{...process.env,LIQUID_TEST_URL:new URL('/scripts/ae-rebuild/host.html',process.argv[2]).href}});
try {
 const page=await app.firstWindow();
 for(const [name,strokes] of Object.entries(fixtures.cases)) {
  const png=await page.evaluate(async strokes=>{
   const {VideoRenderer}=await import('/desktop/renderer/video-renderer.js'),{AELiquid}=await import('/desktop/renderer/liquid-area.js'),{vertex}=await import('/desktop/vendor/shaders.js');
   const {RegionMaps}=await import('/desktop/shared/regions.js'),{liquidAreaDistance,NATIVE_AREA_DISTANCE_RANGE}=await import('/desktop/shared/liquid-area.js');
   const renderer=new VideoRenderer(document.createElement('canvas')),gl=renderer.gl;gl.bindVertexArray(renderer.vao);
   const pipeline=new AELiquid(gl,f=>renderer.program(vertex,f)),mask=renderer.texture(),target=renderer.texture(),framebuffer=gl.createFramebuffer();
   const maps=RegionMaps.empty().useLiquidArea();for(const [a,b,d] of strokes)maps.paint('liquid',a,b,d,9/16);
   gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,mask);gl.texImage2D(gl.TEXTURE_2D,0,gl.R16F,512,512,0,gl.RED,gl.FLOAT,liquidAreaDistance(maps.layers.liquid,9/16,{float:true,range:NATIVE_AREA_DISTANCE_RANGE,finite:true}));
   gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,target);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,1920,1080,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target,0);
   pipeline.render({width:1920,height:1080,aspect:16/9,maskAspect:9/16,time:0,framebuffer,mask,stage:0});
   // Read the actual input raster before the final output antialiasing pass.
   // This is the same texture consumed by Wave Warp in the live renderer.
   gl.bindFramebuffer(gl.FRAMEBUFFER,pipeline.targets[0].framebuffer);
   const raw=pipeline.floating?new Float32Array(1920*1080*4):new Uint8Array(1920*1080*4);
   gl.readPixels(0,0,1920,1080,gl.RGBA,pipeline.floating?gl.FLOAT:gl.UNSIGNED_BYTE,raw);
   if(gl.getError()!==gl.NO_ERROR)throw new Error('Cannot read source geometry');
   const pixels=pipeline.floating?Uint8Array.from(raw,v=>Math.round(v*255)):raw;
   const straight=new Uint8ClampedArray(pixels.length);
   for(let y=0;y<1080;y++)for(let x=0;x<1920;x++){
    const i=(y*1920+x)*4,j=((1079-y)*1920+x)*4,a=pixels[i+3];straight[j+3]=a;
    if(a)for(let c=0;c<3;c++)straight[j+c]=Math.min(255,Math.round(pixels[i+c]*255/a));
   }
   const out=document.createElement('canvas');out.width=1920;out.height=1080;out.getContext('2d').putImageData(new ImageData(straight,1920,1080),0,0);
   const result=out.toDataURL('image/png');pipeline.destroy();renderer.destroy();return result;
  },strokes);
  await writeFile(`${output}/source-${name}.png`,Buffer.from(png.split(',')[1],'base64'));
 }
 await writeFile(output+'/source-fixtures.json',JSON.stringify({...fixtures,profile:'Native gradient stroke, 234px × 89% inside the common painted boundary'},null,2));
}finally{await app.close();}
