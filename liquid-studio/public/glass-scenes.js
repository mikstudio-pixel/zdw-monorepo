import { renderGlassComparison } from './glass-compare-renderer.js';
const $ = id => document.getElementById(id);
const load = async file => {
  const image=new Image(); image.src=`./glass-reference/${file}.png`; await image.decode();
  if(image.width!==512||image.height!==512)throw new Error('Nesouhlasí rozlišení reference.');
  return image;
};
try {
  const [gridRef,gridSource,rampRef,rampSource] = await Promise.all([
    load('figma-grid-dispersion-100'), load('grid-source'),
    load('figma-ramp-dispersion-100'), load('ramp-source')
  ]);
  const gridWeb=renderGlassComparison(gridSource,{scale:2}), rampWeb=renderGlassComparison(rampSource,{scale:2});
  const canvas=$('comparison'),ctx=canvas.getContext('2d');
  canvas.width=2240;canvas.height=2688;ctx.scale(2,2);
  ctx.fillStyle='#1e1e1e';ctx.fillRect(0,0,1120,1344);
  ctx.fillStyle='#eee';ctx.font='600 24px Arial';ctx.fillText('FIGMA × WEBGL',32,40);
  ctx.fillStyle='#aaa';ctx.font='13px Arial';
  ctx.fillText('Stejné podklady · scéna 512 × 512 · sklo 256 × 256 · Figma: export 1×, WebGL: render 2×',32,65);
  ctx.fillStyle='#eee';ctx.font='600 16px Arial';
  ctx.fillText('FIGMA · NATIVNÍ EXPORT',32,101);ctx.fillText('WEBGL · AKTUÁLNÍ SHADER',576,101);
  ctx.fillStyle='#aaa';ctx.font='13px Arial';ctx.fillText('01 / Mřížka s KE',32,131);ctx.fillText('01 / Stejná mřížka + živý shader',576,131);
  ctx.drawImage(gridRef,32,147,512,512);ctx.drawImage(gridWeb,576,147,512,512);
  ctx.fillText('02 / Šedý přechod',32,699);ctx.fillText('02 / Stejný přechod + živý shader',576,699);
  ctx.drawImage(rampRef,32,715,512,512);ctx.drawImage(rampWeb,576,715,512,512);
  ctx.font='12px Arial';ctx.fillText('Refraction / Depth / Dispersion / Splay 100 · Frost 0 · světlo a vedlejší efekty vypnuté',32,1260);
  ctx.fillText('Vstupem WebGL jsou originální podklady bez skla. Žádný render Figmy se do WebGL výsledku nepřimíchává.',32,1283);
  ctx.fillText('Snímek ukazuje skutečnou shodu i rozdíly; nejde o tvrzení pixelové totožnosti.',32,1306);
  ctx.fillText('17. 9. 2026',1010,1306);
  $('status').textContent='Stejné podklady i rozměry scény. WebGL se vykresluje přímo v rozlišení 1024 × 1024 (2×); geometrie a šířka rozostření se nemění.\nFigma reference pochází z původního 512px exportu a je zvětšená na stejnou plochu. Ostrost reference je omezená tímto exportem.';
  $('download').disabled=false;$('download').onclick=()=>{
    const link=document.createElement('a');link.download='figma-vs-webgl-grid-and-ramp-matched-2x.png';link.href=canvas.toDataURL('image/png');link.click();
  };
} catch(error) { $('status').textContent=`Porovnání se nepodařilo: ${error.message}`; throw error; }
