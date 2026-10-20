const $ = id => document.getElementById(id);
const names = { base: 'AE · původní liquid_base', ae: 'AE · předchozí liquid_delivery', calibrated: 'AE · opravená reference', 'web-before': 'Web · před úpravou', web: 'WebGL · po kalibraci', studio: 'Liquid Studio · po kalibraci' };
const metrics = await fetch('./liquid-compare/metrics.json').then(r => { if (!r.ok) throw new Error('Měření není dostupné'); return r.json(); });
const canvas = $('combined'), context = canvas.getContext('2d');
let frame = 0, version = 0, timer, playing = false, playbackStart = 0, firstFrame = 0, notes = {};
try { notes = JSON.parse(localStorage.getItem('liquid-frame-notes-v1') || '{}'); } catch {}
const key = () => `${$('left').value}:${$('right').value}:${frame}`;
const src = (kind, index) => `./liquid-compare/${kind}/frame-${String(index).padStart(4, '0')}.png`;
function drawCombined() {
  context.globalAlpha = 1; context.globalCompositeOperation = 'source-over';
  context.drawImage($('left-image'), 0, 0);
  const mode = $('layout').value;
  if (mode === 'overlay') context.globalAlpha = .5;
  if (mode === 'difference') context.globalCompositeOperation = 'difference';
  if (mode === 'wipe') {
    const width = Math.round(1920 * $('wipe').value / 100);
    context.drawImage($('right-image'), 0, 0, width, 1080, 0, 0, width, 1080);
    context.fillStyle = '#b7d8b5'; context.fillRect(width - 1, 0, 2, 1080);
  } else context.drawImage($('right-image'), 0, 0);
  context.globalAlpha = 1; context.globalCompositeOperation = 'source-over';
}
async function show(index) {
  frame = Math.max(0, Math.min(180, Math.round(Number(index) || 0)));
  const current = ++version;
  $('frame').value = $('frame-number').value = frame;
  $('time').textContent = `00:${String(Math.floor(frame / 30)).padStart(2, '0')}:${String(frame % 30).padStart(2, '0')}`;
  $('previous').disabled = frame === 0; $('next').disabled = frame === 180;
  $('left-title').textContent = names[$('left').value]; $('right-title').textContent = names[$('right').value];
  $('note').value = notes[key()] || '';
  const pair = $('layout').value === 'pair';
  document.querySelector('.pair').hidden = !pair; document.querySelector('.combined').hidden = pair;
  $('wipe-control').hidden = $('layout').value !== 'wipe';
  $('view').classList.toggle('native', $('zoom').value === 'native');
  try {
    await Promise.all(['left', 'right'].map(async side => {
      const im = new Image(); im.src = src($(side).value, frame); await im.decode();
      if (current === version) $(`${side}-image`).src = im.src;
    }));
    if (current !== version) return;
    await Promise.all([$('left-image').decode(), $('right-image').decode()]);
    if (current !== version) return;
    if (!pair) drawCombined();
    const values = metrics.frames[frame].comparisons[`${$('left').value}-${$('right').value}`];
    $('metrics').textContent = values ? `Překryv obrysů (IoU): ${(values.silhouetteIoU * 100).toFixed(1)} %    ·    Chyba RGB v popředí: ${values.rgbMAEForeground.toFixed(1)} / 255    ·    Čas: ${(frame / 30).toFixed(3)} s` : `Čas: ${(frame / 30).toFixed(3)} s · vizuální srovnání variant`;
    if ($('left').value === 'web' && $('right').value === 'studio') {
      const parity = metrics.webStudioParity;
      $('metrics').textContent = `Web / Studio: maximální rozdíl kanálu ${parity.maxChannelError} / 255 v celé sadě 181 snímků při 1920 × 1080 · Čas: ${(frame / 30).toFixed(3)} s`;
    }
  } catch (error) { if (current === version) { stop(); $('metrics').textContent = `Snímek se nepodařilo načíst: ${error.message}`; } }
}
function stop() { playing = false; clearTimeout(timer); $('play').textContent = 'Přehrát'; }
async function tick() {
  if (!playing) return;
  const next = Math.min(180, firstFrame + Math.floor((performance.now() - playbackStart) * 30 / 1000));
  if (next !== frame) await show(next);
  if (!playing) return;
  if (frame === 180) return stop();
  timer = setTimeout(tick, 1000 / 30);
}
async function play() {
  if (playing) return stop();
  if (frame === 180) await show(0);
  firstFrame = frame; playbackStart = performance.now(); playing = true;
  $('play').textContent = 'Pozastavit'; timer = setTimeout(tick, 1000 / 30);
}
$('frame').oninput = e => { stop(); show(e.target.value); }; $('frame-number').oninput = e => { stop(); show(e.target.value); };
$('previous').onclick = () => { stop(); show(frame - 1); }; $('next').onclick = () => { stop(); show(frame + 1); }; $('play').onclick = play;
for (const id of ['left', 'right', 'layout', 'zoom']) $(id).onchange = () => { stop(); show(frame); };
$('wipe').oninput = drawCombined;
$('note').oninput = () => {
  notes[key()] = $('note').value;
  try { localStorage.setItem('liquid-frame-notes-v1', JSON.stringify(notes)); $('saved').textContent = 'Uloženo v tomto prohlížeči.'; }
  catch { $('saved').textContent = 'Prohlížeč nepovolil uložení. Stáhněte si poznámky tlačítkem.'; }
};
$('export').onclick = () => { const url = URL.createObjectURL(new Blob([JSON.stringify({ fps: 30, notes }, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'liquid-frame-notes.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
document.addEventListener('keydown', e => { if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target.tagName)) return; if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) { e.preventDefault(); if (e.key === ' ') play(); else { stop(); show(frame + (e.key === 'ArrowRight' ? 1 : -1)); } } });
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
await show(0);
