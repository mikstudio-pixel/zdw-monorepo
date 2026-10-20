import { LiquidRenderer } from './renderer.js';
import { PointerField } from './pointer-field.js';
import { LiquidBirths } from './liquid-births.js';

const $ = id => document.getElementById(id);
const canvas = $('liquid');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const backgrounds = { light: [1,1,1], dark: [.06,.075,.065], blue: [.73,.79,.98] };
const defaults = { mode: 'original', glass: true, size: 146, zoom: 100, blur: 0, strength: 100, aberration: 100, speed: 1, repelStrength: 165, repelRadius: 240, repelDuration: 3, interaction: true, time: 0, background: backgrounds.light };
const state = { ...defaults, playing: !reducedMotion.matches, pointer: [.5,.5], pointerStrength: 0, field: new PointerField(), births: new LiquidBirths() };
const isDisplacing = mode => mode === 'repel' || mode === 'scatter';
const isInteractive = mode => mode === 'reveal' || isDisplacing(mode);
const endInput = () => { state.field.endInput(); state.births.endInput(); };
const clearInput = () => { state.field.clear(); state.births.clear(); };
const video = document.createElement('video');
video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto';
video.src = './public/assets/liquid-packed.mp4';
const poster = new Image();
poster.src = './public/assets/liquid-packed.png';
let renderer, frame, visible = true, lastTimestamp = 0, videoDirty = true, lastVideoTime = -1, pointerInside = false;
let posterReady = false, videoReady = false, failed = false;

function reportError(error) {
  failed = true; cancelAnimationFrame(frame); video.pause();
  $('error').hidden = false; $('error').textContent = error.message || String(error);
  console.error(error);
}

function updatePlayButton() {
  $('play').textContent = state.playing ? 'Ⅱ' : '▶';
  $('play').setAttribute('aria-label', state.playing ? 'Pozastavit animaci' : 'Přehrát animaci');
}

function syncPlayback() {
  video.playbackRate = state.speed;
  if (state.playing && state.mode === 'original' && visible && !document.hidden && videoReady && !failed) {
    video.play().catch(() => { state.playing = false; updatePlayButton(); });
  } else video.pause();
  updatePlayButton();
}

function tick(timestamp) {
  if (failed || !visible || document.hidden) return;
  const dt = lastTimestamp ? Math.min((timestamp-lastTimestamp)/1000, .05) : 0;
  lastTimestamp = timestamp;
  if (state.mode !== 'original' && state.playing) {
    state.time = Math.min(state.time+dt*state.speed,6);
    if (state.time===6 && !isInteractive(state.mode)) { state.playing=false; syncPlayback(); }
  }
  if (state.playing) {
    if (state.mode === 'reveal') state.births.update(dt*state.speed);
    if (isDisplacing(state.mode)) state.field.update(dt*state.speed, state.mode === 'scatter' ? { radius: state.repelRadius/1080, lifetime: state.repelDuration } : undefined);
  }
  if (state.mode === 'original' && videoReady) {
    state.time = video.currentTime;
    if ((videoDirty || video.currentTime !== lastVideoTime) && !video.seeking) {
      try { renderer.upload(video); } catch (error) { reportError(error); return; }
      videoDirty = false; lastVideoTime = video.currentTime;
    }
  }
  state.pointerStrength += ((pointerInside ? 1 : 0)-state.pointerStrength)*Math.min(1,dt*7);
  try { renderer.draw(state); } catch (error) { reportError(error); return; }
  if (isInteractive(state.mode)) $('time').value = state.playing ? 'ŽIVĚ' : 'PAUZA';
  else {
    if (document.activeElement !== $('timeline')) $('timeline').value = state.time;
    $('time').value = `${state.time.toFixed(2)} s`;
  }
  frame = requestAnimationFrame(tick);
}

function resume() {
  cancelAnimationFrame(frame); lastTimestamp = 0; syncPlayback();
  if (!visible || document.hidden) { clearInput(); pointerInside=false; }
  if (renderer && visible && !document.hidden && !failed) frame = requestAnimationFrame(tick);
}

function setMode(mode) {
  if (mode !== state.mode) {
    clearInput();
    if (isInteractive(mode)) state.playing = true;
  }
  state.mode = mode;
  const interactiveMode = isInteractive(mode);
  $('stage').classList.toggle('is-cursor', interactiveMode);
  $('playback').classList.toggle('is-live', interactiveMode);
  $('timeline').disabled = interactiveMode;
  $('timeline').max = mode === 'original' ? 4.56 : 6;
  $('timeline').step = mode === 'original' ? .04 : 1/30;
  $('repel-controls').hidden = mode !== 'scatter';
  $('cursor-hint').hidden = !interactiveMode;
  $('cursor-hint').textContent = isDisplacing(mode) ? 'Pohybem myši nebo prstu rozhánějte liquid.' : 'Pohybem myši nebo prstu nechte vznikat liquid.';
  document.querySelectorAll('[data-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.mode === mode);
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  });
  $('notice').hidden = mode !== 'original' || !$('notice').textContent;
  if (mode === 'original' && videoReady) video.currentTime = Math.min(state.time, video.duration-.04);
  syncPlayback();
}

function setBackground(name) {
  state.background = backgrounds[name];
  document.querySelectorAll('[data-background]').forEach(button => {
    const active = button.dataset.background === name;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
}

document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelectorAll('[data-background]').forEach(button => button.addEventListener('click', () => setBackground(button.dataset.background)));
const format = { size: v => `${v} px`, zoom: v => `${v} %`, blur: v => `${v} px`, strength: v => `${v} %`, aberration: v => `${v} %`, speed: v => `${v.toFixed(2)}×`, repelStrength: v => `${v} %`, repelRadius: v => `${v} px`, repelDuration: v => `${v.toFixed(1)} s` };
for (const key of Object.keys(format)) {
  $(key).addEventListener('input', () => {
    state[key] = Number($(key).value); $(`${key}-value`).value = format[key](state[key]);
    if (key === 'speed') syncPlayback();
  });
}
for (const key of ['glass','interaction']) $(key).addEventListener('change', () => {
  state[key] = $(key).checked;
  if (key === 'interaction') endInput();
});
$('play').addEventListener('click', () => {
  if (!state.playing && state.mode !== 'original' && state.time >= 6) state.time=0;
  state.playing = !state.playing; endInput(); syncPlayback();
});
$('timeline').addEventListener('input', () => {
  state.time = Number($('timeline').value); state.playing = false;
  if (videoReady) video.currentTime = Math.min(state.time, video.duration-.04);
  syncPlayback();
});
$('reset').addEventListener('click', () => {
  Object.assign(state, defaults, { playing: !reducedMotion.matches });
  clearInput();
  for (const key of Object.keys(format)) { $(key).value=state[key]; $(`${key}-value`).value=format[key](state[key]); }
  for (const key of ['glass','interaction']) $(key).checked=state[key];
  if (videoReady) video.currentTime = 0;
  setMode('original'); setBackground('light');
});
function movePointer(event) {
  if (!event.isPrimary) return;
  const rect=canvas.getBoundingClientRect();
  state.pointer=[(event.clientX-rect.left)/rect.width, 1-(event.clientY-rect.top)/rect.height];
  pointerInside=true;
  if (isInteractive(state.mode) && state.playing && state.interaction) {
    (state.mode === 'reveal' ? state.births : state.field).move(...state.pointer);
  }
}
function leavePointer() { pointerInside=false; endInput(); }
canvas.addEventListener('pointermove', movePointer);
canvas.addEventListener('pointerdown', movePointer);
canvas.addEventListener('pointerleave', leavePointer);
canvas.addEventListener('pointerup', event => { if(event.pointerType !== 'mouse') leavePointer(); });
canvas.addEventListener('pointercancel', leavePointer);
video.addEventListener('loadeddata', () => { videoReady=true; videoDirty=true; syncPlayback(); });
video.addEventListener('seeked', () => { videoDirty=true; });
video.addEventListener('error', () => {
  if (!posterReady) reportError(new Error('Nepodařilo se načíst referenční animaci.'));
  else { videoReady=false; state.playing=false; syncPlayback(); $('notice').textContent='Video nelze přehrát. Zobrazena statická reference.'; $('notice').hidden=state.mode !== 'original'; }
});
document.addEventListener('visibilitychange', resume);
reducedMotion.addEventListener('change', event => { if (event.matches) { state.playing=false; syncPlayback(); } });
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault(); reportError(new Error('Grafický kontext byl přerušen. Náhled se po obnovení automaticky načte.'));
});
canvas.addEventListener('webglcontextrestored', () => {
  failed=false; $('error').hidden=true;
  try { renderer=new LiquidRenderer(canvas); if(posterReady) renderer.upload(poster); videoDirty=true; resume(); } catch(error) { reportError(error); }
});
new IntersectionObserver(entries => { visible=entries[0].isIntersecting; resume(); }, { rootMargin:'80px' }).observe(canvas);
new ResizeObserver(() => { if(renderer && !failed) { try { renderer.resize(); } catch(error) { reportError(error); } } }).observe(canvas);
window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); video.pause(); });
window.addEventListener('pageshow', resume);
try {
  renderer = new LiquidRenderer(canvas);
  await poster.decode(); posterReady=true; renderer.upload(poster);
  videoReady = video.readyState >= 2;
  resume();
} catch(error) { reportError(error); }
