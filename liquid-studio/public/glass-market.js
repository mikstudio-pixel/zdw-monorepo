import { renderGlassComparison } from './glass-compare-renderer.js';

const $ = id => document.getElementById(id);
const load = async name => {
  const image = new Image(); image.src = `./glass-reference/market/${name}.png`;
  await image.decode();
  if (image.width !== 512 || image.height !== 512) throw new Error('Reference musí mít přesně 512 × 512 pixelů.');
  return image;
};
try {
  const [reference, source] = await Promise.all([load('figma-original'), load('source')]);
  const web = renderGlassComparison(source, {width:258, height:254, light:1, scale:2});

  // Same scene coordinates; the WebGL buffer is now rendered at 2x.
  // The original Figma export is only the reference, never a shader input.
  const canvas = $('comparison'), ctx = canvas.getContext('2d');
  canvas.width=2240;canvas.height=1444;ctx.scale(2,2);
  ctx.fillStyle = '#f6f6f3'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#20211e'; ctx.font = '600 23px Arial'; ctx.fillText('FIGMA × WEBGL', 32, 39);
  ctx.font = '13px Arial'; ctx.fillStyle = '#666861';
  ctx.fillText('ZDW / DESIGN MARKET   ·   totožný podklad a výřez 512 × 512 px   ·   sklo 258 × 254 px', 32, 65);
  ctx.font = '600 16px Arial'; ctx.fillStyle = '#20211e';
  ctx.fillText('FIGMA · ORIGINÁLNÍ NÁVRH', 32, 104);
  ctx.fillText('WEBGL · AKTUÁLNÍ SHADER', 576, 104);
  ctx.drawImage(reference, 32, 120,512,512); ctx.drawImage(web, 576, 120,512,512);
  ctx.font = '12px Arial'; ctx.fillStyle = '#55574f';
  ctx.fillText('Glass 100 / 100 / 100 / 0 / 100 + původní vedlejší efekty', 32, 655);
  ctx.fillText('Síla 100 % · RGB 100 % · zvětšení 100 % · Frost 0', 576, 655);
  ctx.fillText('Shodné rozměry scény · Figma: původní export 1×, WebGL: skutečný render 2× · bez retuše', 32, 687);
  ctx.fillText('17. 9. 2026', 1010, 687);

  // Independent pixel readback checks that the input did not already contain
  // the lens, and that the renderer alters only the specified glass rectangle.
  const refCanvas = document.createElement('canvas'); refCanvas.width = refCanvas.height = 512;
  const refCtx = refCanvas.getContext('2d');
  // Use the same render/downsample path for the plain input, so resampling
  // the 512px source at 2x is not mistaken for a change caused by the glass.
  const plain=renderGlassComparison(source,{scale:2,glass:false});
  refCtx.drawImage(plain,0,0,512,512); const input = refCtx.getImageData(0,0,512,512).data;
  refCtx.clearRect(0,0,512,512); refCtx.drawImage(web,0,0,512,512); const output = refCtx.getImageData(0,0,512,512).data;
  refCtx.clearRect(0,0,512,512); refCtx.drawImage(reference,0,0); const target = refCtx.getImageData(0,0,512,512).data;
  let changedInside=0, changedOutside=0, sum=0, n=0;
  for(let y=0;y<512;y++) for(let x=0;x<512;x++) {
    const inside=x>=127&&x<385&&y>=129&&y<383, i=(y*512+x)*4;
    const changed=[0,1,2].some(c=>input[i+c]!==output[i+c]);
    if(changed) { if(inside)changedInside++; else changedOutside++; }
    if(inside) for(let c=0;c<3;c++){sum+=Math.abs(target[i+c]-output[i+c]);n++;}
  }
  $('status').textContent = `Vykresleno produkčním shaderem v rozlišení 1024 × 1024 (2×). WebGL: bez chyb.\nFigma: původní 512px export zvětšený na stejnou plochu. Statistika se počítá po zmenšení WebGL na původních 512 px.\nZměněné pixely: ${changedInside} uvnitř kostky, ${changedOutside} mimo ni.\nPrůměrný rozdíl proti originálu uvnitř kostky: ${(sum/n).toFixed(2)} / 255 na RGB kanál.\nOriginál má navíc Texture, Inner shadow a Layer blur. Snímek ukazuje shodu i zbývající rozdíly, nikoli pixelovou totožnost.`;
  const save = (image,name) => {const link=document.createElement('a');link.download=name;link.href=image.toDataURL('image/png');link.click();};
  $('download').disabled=false; $('download').onclick=()=>save(canvas,'figma-vs-webgl-market-matched-2x.png');
  $('web-download').disabled=false; $('web-download').onclick=()=>save(web,'webgl-market.png');
} catch(error) { $('status').textContent = `Porovnání se nepodařilo: ${error.message}`; throw error; }
