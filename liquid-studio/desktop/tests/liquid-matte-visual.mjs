import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export async function verifyLiquidMatte(page) {
  const golden=(await readFile(new URL('./fixtures/ae-liquid-circle.png',import.meta.url))).toString('base64');
  const metrics=await page.evaluate(async golden=>{
    const { VideoRenderer }=await import('./video-renderer.js');
    const { RegionMaps }=await import('../shared/regions.js');
    const { DEFAULTS }=await import('../shared/settings.js');
    const { AELiquid }=await import('./liquid-area.js');
    const { vertex }=await import('../vendor/shaders.js');
    const renderer=new VideoRenderer(document.createElement('canvas'));
    renderer.upload(new Uint8Array([255,255,255,255]),1,1);
    const maps=RegionMaps.empty().useLiquidArea();maps.clear('glass');
    maps.paint('liquid',[.04,.76],[.96,.85],640,9/16);maps.paint('liquid',[.12,.91],[.94,.92],400,9/16);
    const settings={...DEFAULTS,aspect:'9:16',liquid:true,regions:maps.serialize()};
    const image=new Image();image.src='data:image/png;base64,'+golden;await image.decode();
    const native=document.createElement('canvas');native.width=960;native.height=540;native.getContext('2d').drawImage(image,0,0);
    const expected=native.getContext('2d').getImageData(0,0,960,540).data;
    try {
      const render=scale=>{renderer.draw(settings,.56,{regions:maps,previewScale:scale});return renderer.readPixels().slice();};
      const first=render(1);render(.5);const restored=render(1);
      const restoreError=first.reduce((max,v,i)=>Math.max(max,Math.abs(v-restored[i])),0);
      const gl=renderer.gl;const pixels=new Uint8Array(renderer.liquidWidth*renderer.liquidHeight*4);
      gl.bindFramebuffer(gl.FRAMEBUFFER,renderer.liquidFramebuffer);gl.readPixels(0,0,renderer.liquidWidth,renderer.liquidHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let premultError=0,emptyRGB=0,soft=0;
      for(let i=0;i<pixels.length;i+=4){premultError=Math.max(premultError,Math.max(pixels[i],pixels[i+1],pixels[i+2])-pixels[i+3]);if(!pixels[i+3])emptyRGB=Math.max(emptyRGB,pixels[i],pixels[i+1],pixels[i+2]);if(pixels[i+3]>16&&pixels[i+3]<240)soft++;}
      // Independent golden: natively rendered original AEP, not this shader.
      renderer.resize(1920,1080);gl.bindVertexArray(renderer.vao);
      const pipeline=new AELiquid(gl,f=>renderer.program(vertex,f));
      pipeline.render({width:960,height:540,aspect:16/9,time:0,framebuffer:renderer.liquidFramebuffer,mask:renderer.areaTexture,circle:true});
      const actual=new Uint8Array(960*540*4);gl.bindFramebuffer(gl.FRAMEBUFFER,renderer.liquidFramebuffer);gl.readPixels(0,0,960,540,gl.RGBA,gl.UNSIGNED_BYTE,actual);
      let error=0,count=0,intersection=0,union=0;
      for(let y=0;y<540;y++)for(let x=0;x<960;x++){
        const i=(y*960+x)*4,j=((539-y)*960+x)*4;
        const a=expected[i+3]>127,b=actual[j+3]>127;if(a||b){union++;if(a&&b)intersection++;}
        if(Math.max(expected[i],expected[i+1],expected[i+2],actual[j],actual[j+1],actual[j+2])>5){for(let c=0;c<3;c++){error+=Math.abs(expected[i+c]-actual[j+c]);count++;}}
      }
      pipeline.destroy();if(gl.getError()!==gl.NO_ERROR)throw new Error('Cannot read native AE comparison');
      return {restoreError,premultError,emptyRGB,soft,nativeForegroundMAE255:error/count,nativeAlphaIoU:intersection/union,environment:'Chromium desktop'};
    }finally{renderer.destroy();}
  },golden);
  assert.equal(metrics.restoreError,0,'Seeking at reduced resolution restores the same full-resolution frame');
  assert.ok(metrics.premultError<=1,'Every filter retains premultiplied color');
  assert.equal(metrics.emptyRGB,0,'Transparent regions contain no latent material');
  assert.ok(metrics.soft>1000,'Native filtering retains a soft liquid boundary');
  assert.ok(metrics.nativeForegroundMAE255<2,`The stack matches the independent native AE color fixture: ${metrics.nativeForegroundMAE255}`);
  assert.ok(metrics.nativeAlphaIoU>.985,`The stack matches the native AE silhouette: ${metrics.nativeAlphaIoU}`);
  console.log('Native AE stack GPU:',JSON.stringify(metrics));return metrics;
}
