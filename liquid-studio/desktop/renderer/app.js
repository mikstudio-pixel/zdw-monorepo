import { VideoRenderer } from './video-renderer.js';
import { DEFAULTS, PRESETS, FORMATS, FPS, validateSettings, cropTransform, PALETTE_COLORS, PALETTE_PRESET_COLORS, DEFAULT_LIQUID_COLORS } from '../shared/settings.js';
import { RegionMaps, canvasPoint } from '../shared/regions.js';
import { RegionEditor } from './region-editor.js';

const $ = id => document.getElementById(id);
const api = window.liquid;
let settings = { ...DEFAULTS, regions: RegionMaps.empty().serialize() }, media = null, busy = false, frameTime = 0, renderer, drag, editor;
const video = document.createElement('video');
video.preload = 'auto'; video.playsInline = true;
const mediaTime = time => Math.max(0, time - (media?.startTime || 0));
const seekTo = time => { video.currentTime = time + (media?.startTime || 0); };
// Keep decoded frames alive and available for requestVideoFrameCallback.
video.hidden = true; document.body.append(video);
const formatTime = time => `${String(Math.floor(time / 60)).padStart(2, '0')}:${(time % 60).toFixed(2).padStart(5, '0')}`;
const specs = {
  size: ['Velikost kostek', 60, 360, 'px'], strength: ['Síla lomu', 0, 200, '%'],
  aberration: ['Chromatická aberace', 0, 200, '%'], blur: ['Rozostření', 0, 12, 'px'],
  opacity: ['Intenzita liquidu', 0, 100, '%'], liquidStructure: ['Struktura', 0, 100, '%'], cropZoom: ['Přiblížení', 100, 250, '%'],
  cropX: ['Vodorovná pozice', 0, 100, '%'], cropY: ['Svislá pozice', 0, 100, '%'],
};
for (const [key, [label, min, max, unit]] of Object.entries(specs)) {
  const wrapper = document.createElement('div'); wrapper.className = 'slider';
  const line = document.createElement('div'); line.className = 'slider-label';
  const title = document.createElement('label'); title.htmlFor = key; title.textContent = label;
  const output = document.createElement('output'); output.id = `${key}-value`; output.htmlFor = key;
  const input = document.createElement('input'); Object.assign(input, { id: key, type: 'range', min, max, step: 1, value: settings[key] });
  input.addEventListener('input', () => { settings[key] = Number(input.value); selectPreset(null); syncControls(); draw(); });
  line.append(title, output); wrapper.append(line, input);
  if (key === 'liquidStructure') {
    const scale = document.createElement('div'); scale.className = 'slider-scale'; scale.id = 'liquid-structure-scale';
    const fine = document.createElement('span'), cohesive = document.createElement('span');
    fine.textContent = 'Jemná'; cohesive.textContent = 'Celistvá'; scale.append(fine, cohesive); wrapper.append(scale);
    input.setAttribute('aria-describedby', scale.id);
  }
  $(['opacity', 'liquidStructure'].includes(key) ? 'liquid-sliders' : key.startsWith('crop') ? 'crop-sliders' : 'glass-sliders').append(wrapper);
}

let activeStopIndex = 0;
function selectStop(index) {
  activeStopIndex = index;
  document.querySelectorAll('.liquid-stop-row').forEach((row, i) => row.classList.toggle('selected', i === index));
}
function updateLiquidColor(index, hex) {
  const current = [...(settings.liquidColors || DEFAULT_LIQUID_COLORS)];
  current[index] = hex.toLowerCase();
  settings.liquidColors = Object.freeze(current);
  selectPreset(null);
  syncControls();
  draw();
}

const PALETTE_NAMES = ['Tmavě zelená', 'Zlatá', 'Světle modrá', 'Hnědá', 'Korálová červená', 'Růžová'];
const paletteContainer = $('palette-swatches');
PALETTE_COLORS.forEach((color, idx) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'palette-swatch';
  btn.style.backgroundColor = color;
  btn.title = `${PALETTE_NAMES[idx]} (${color}) – kliknutím přiřadíte k vybranému bodu`;
  btn.addEventListener('click', () => {
    updateLiquidColor(activeStopIndex, color);
  });
  paletteContainer.append(btn);
});

const stopsContainer = $('liquid-stops');
for (let i = 0; i < 7; i++) {
  const row = document.createElement('div');
  row.className = 'liquid-stop-row';
  row.id = `liquid-stop-row-${i}`;
  row.classList.toggle('selected', i === 0);
  row.addEventListener('click', () => {
    selectStop(i);
  });

  const label = document.createElement('span');
  label.className = 'liquid-stop-label';
  label.textContent = `Bod ${i + 1}`;

  const pickerWrapper = document.createElement('div');
  pickerWrapper.className = 'color-picker-wrapper';
  pickerWrapper.title = `Vybrat barvu pro bod ${i + 1}`;

  const preview = document.createElement('div');
  preview.className = 'color-picker-preview';
  preview.id = `liquid-color-preview-${i}`;
  preview.style.backgroundColor = (settings.liquidColors || DEFAULT_LIQUID_COLORS)[i];

  const input = document.createElement('input');
  input.type = 'color';
  input.setAttribute('aria-label', `Barva liquidu, bod ${i + 1}`);
  input.className = 'color-picker-input';
  input.id = `liquid-color-${i}`;
  input.value = (settings.liquidColors || DEFAULT_LIQUID_COLORS)[i];
  input.addEventListener('input', () => {
    selectStop(i);
    updateLiquidColor(i, input.value);
  });

  pickerWrapper.append(preview, input);

  const miniContainer = document.createElement('div');
  miniContainer.className = 'stop-palette-mini';
  miniContainer.title = 'Rychlý výběr z palety';

  PALETTE_COLORS.forEach((pColor, pIdx) => {
    const mini = document.createElement('button');
    mini.type = 'button';
    mini.className = 'mini-swatch';
    mini.style.backgroundColor = pColor;
    mini.title = `${PALETTE_NAMES[pIdx]} (${pColor})`;
    mini.addEventListener('click', e => {
      e.stopPropagation();
      selectStop(i);
      updateLiquidColor(i, pColor);
    });
    miniContainer.append(mini);
  });

  row.append(label, pickerWrapper, miniContainer);
  stopsContainer.append(row);
}

$('apply-palette').onclick = () => {
  settings.liquidColors = Object.freeze([...PALETTE_PRESET_COLORS]);
  selectPreset(null);
  syncControls();
  draw();
};

$('reset-liquid-colors').onclick = () => {
  settings.liquidColors = Object.freeze([...DEFAULT_LIQUID_COLORS]);
  selectPreset(null);
  syncControls();
  draw();
};

function selectPreset(key) { document.querySelectorAll('[data-preset]').forEach(button => { button.classList.toggle('selected', button.dataset.preset === key); button.setAttribute('aria-pressed', String(button.dataset.preset === key)); }); }
function syncControls() {
  for (const [key, [, , , unit]] of Object.entries(specs)) { $(key).value = settings[key]; $(`${key}-value`).value = `${Math.round(settings[key])} ${unit}`; }
  $('liquid').checked = settings.liquid;
  for (const key of ['opacity', 'liquidStructure']) $(key).disabled = !settings.liquid || busy;
  const liquidDisabled = !settings.liquid || busy;
  $('liquid-colors-container').classList.toggle('disabled', liquidDisabled);
  for (const el of document.querySelectorAll('#liquid-colors-container input, #liquid-colors-container button')) {
    el.disabled = liquidDisabled;
  }
  const colors = settings.liquidColors || DEFAULT_LIQUID_COLORS;
  for (let i = 0; i < 7; i++) {
    const input = $(`liquid-color-${i}`);
    const preview = $(`liquid-color-preview-${i}`);
    if (input && preview) {
      input.value = colors[i];
      preview.style.backgroundColor = colors[i];
    }
  }
  document.querySelectorAll('[data-aspect]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.aspect === settings.aspect)));
  const resolution = FORMATS[settings.aspect].join(' × ');
  $('resolution').textContent = resolution;
  $('export-spec').textContent = `MP4 / H.264 · ${resolution} · 30 fps · ${media?.hasAudio === false ? 'bez zvuku' : 'synchronizovaný zvuk'}`;
}
function draw(upload = false, time = frameTime) {
  if (!renderer || !media || video.readyState < 2) return;
  try {
    if (upload) { renderer.upload(api.previewSource ? api.previewSource(video) : video); frameTime = time; }
    renderer.draw(settings, frameTime, { regions: editor?.maps, editing: editor?.editing });
  } catch (error) { video.pause(); showError(error); }
}
function videoFrame(_now, metadata) {
  if (!busy && media) {
    draw(true, Math.round(mediaTime(metadata.mediaTime) * FPS) / FPS);
    $('timeline').value = Math.min(media.frames - 1, Math.round(frameTime * FPS));
    $('current-time').textContent = formatTime(frameTime);
  }
  video.requestVideoFrameCallback(videoFrame);
}
video.requestVideoFrameCallback(videoFrame);
video.addEventListener('seeked', () => { if (!busy) draw(true, Math.floor(mediaTime(video.currentTime) * FPS + 1e-5) / FPS); });
video.addEventListener('play', updatePlay); video.addEventListener('pause', updatePlay); video.addEventListener('ended', updatePlay);
video.addEventListener('error', () => showError(new Error('Náhled připraveného videa nelze přehrát. Zkuste soubor vložit znovu.')));
function updatePlay() { $('play').textContent = video.paused ? '▶' : 'Ⅱ'; $('play').setAttribute('aria-label', video.paused ? 'Přehrát' : 'Pozastavit'); }
function setBusy(value) {
  busy = value;
  if (busy) video.pause();
  const locked = value || editor?.editing;
  $('effect-controls').disabled = locked;
  for (const id of ['choose-video', 'replace-video', 'load-settings', 'save-settings', 'reset']) $(id).disabled = locked;
  for (const id of ['export', 'export-image', 'play', 'timeline']) $(id).disabled = locked || !media || !renderer;
  $('mute').disabled = value || !media?.hasAudio;
  document.querySelectorAll('[data-aspect]').forEach(button => { button.disabled = locked; });
  editor?.sync();
  syncControls();
}
function showStatus(title, message = '', { error = false, pending = false, success = false } = {}) {
  $('status').hidden = false; $('status').classList.toggle('error', error);
  $('status-title').textContent = title; $('status-message').textContent = message;
  $('progress').hidden = !pending; $('cancel').hidden = !pending; $('cancel').disabled = false;
  $('reveal').hidden = !success; $('dismiss').hidden = pending;
}
function showError(error) { showStatus('Něco se nepovedlo', error.message || String(error), { error: true }); }
async function unwrap(promise) {
  const result = await promise;
  if (!result.ok) throw Object.assign(new Error(result.error), { cancelled: result.cancelled });
  return result.value;
}
function importVideo(file) { return importMedia(() => file ? api.importFile(file) : api.chooseVideo()); }
export async function importMedia(load) {
  if (busy || editor?.editing) return;
  setBusy(true); $('progress').value = 0;
  showStatus('Připravujeme médium', '', { pending: true });
  try {
    const result = await unwrap(load());
    if (!result) { $('status').hidden = true; return; }
    media = result; frameTime = 0;
    const loaded = new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timeout); video.removeEventListener('loadeddata', ready); video.removeEventListener('seeked', firstFrame); video.removeEventListener('error', error); };
      const firstFrame = () => { cleanup(); resolve(); };
      const ready = () => {
        video.addEventListener('seeked', firstFrame, { once: true });
        seekTo(0);
        if (!video.seeking) firstFrame();
      };
      const error = () => { cleanup(); reject(new Error('Nepodařilo se načíst náhled média.')); };
      const timeout = setTimeout(error, 20000);
      video.addEventListener('loadeddata', ready, { once: true }); video.addEventListener('error', error, { once: true });
    });
    video.src = result.url; video.load();
    await loaded;
    $('empty').hidden = true; $('preview').hidden = false;
    $('file-name').textContent = result.name;
    const soundText = result.isImage ? 'obrázek' : result.hasAudio ? 'se zvukem' : 'bez zvuku';
    $('file-info').textContent = `${result.width} × ${result.height} · ${formatTime(result.duration)} · 30 fps · ${soundText}`;
    $('replace-video').textContent = result.isImage ? 'Změnit obrázek' : 'Změnit video';
    $('timeline').max = result.frames - 1; $('timeline').value = 0;
    $('duration').textContent = formatTime(result.duration); $('current-time').textContent = formatTime(0);
    $('status').hidden = true;
    draw(true, 0);
  } catch (error) { error.cancelled ? showStatus('Příprava byla zrušena') : showError(error); }
  finally { setBusy(false); }
}
$('choose-video').onclick = () => importVideo(); $('replace-video').onclick = () => importVideo();
document.addEventListener('dragover', event => { event.preventDefault(); if (!busy && !editor?.editing && event.dataTransfer.types.includes('Files')) $('drop-overlay').hidden = false; });
document.addEventListener('dragleave', event => { if (!event.relatedTarget) $('drop-overlay').hidden = true; });
document.addEventListener('drop', event => {
  event.preventDefault(); $('drop-overlay').hidden = true;
  if (busy || editor?.editing) return;
  if (event.dataTransfer.files.length !== 1) { showError(new Error('Vložte prosím právě jeden soubor (video nebo obrázek).')); return; }
  void importVideo(event.dataTransfer.files[0]);
});
document.querySelectorAll('[data-aspect]').forEach(button => button.onclick = () => { settings.aspect = button.dataset.aspect; syncControls(); draw(); });
document.querySelectorAll('[data-preset]').forEach(button => button.onclick = () => { const { label, ...preset } = PRESETS[button.dataset.preset]; Object.assign(settings, preset); selectPreset(button.dataset.preset); syncControls(); draw(); });
$('liquid').onchange = () => { settings.liquid = $('liquid').checked; selectPreset(null); syncControls(); draw(); };
$('center-crop').onclick = () => { Object.assign(settings, { cropX: 50, cropY: 50, cropZoom: 100 }); syncControls(); draw(); };
$('reset').onclick = () => { settings = { ...DEFAULTS, regions: settings.regions }; selectPreset('signature'); syncControls(); draw(); };
$('play').onclick = async () => {
  if (busy || !media || editor?.editing) return;
  if (!video.paused) { video.pause(); return; }
  if (video.ended || mediaTime(video.currentTime) >= media.duration - 1 / FPS) seekTo(0);
  try { await video.play(); } catch { showError(new Error('Video nelze přehrát. Zkuste jej vložit znovu.')); }
};
$('mute').onclick = () => { video.muted = !video.muted; $('mute').textContent = video.muted ? 'Zvuk vyp.' : 'Zvuk zap.'; $('mute').setAttribute('aria-label', video.muted ? 'Zapnout zvuk' : 'Ztlumit zvuk'); };
$('timeline').oninput = () => { video.pause(); const time = Number($('timeline').value) / FPS; seekTo(time); $('current-time').textContent = formatTime(time); };
document.addEventListener('keydown', event => {
  if (event.code === 'Space' && !['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) { event.preventDefault(); $('play').click(); }
});
$('preview').addEventListener('pointerdown', event => {
  if (busy || !media || editor?.editing || event.button !== 0) return;
  if (!canvasPoint(event.clientX, event.clientY, $('preview').getBoundingClientRect(), ...FORMATS[settings.aspect])) return;
  drag = { x: event.clientX, y: event.clientY, cropX: settings.cropX, cropY: settings.cropY };
  $('preview').setPointerCapture(event.pointerId);
});
$('preview').addEventListener('pointermove', event => {
  if (!drag) return;
  const rect = $('preview').getBoundingClientRect(), [width, height] = FORMATS[settings.aspect];
  const displayedScale = Math.min(rect.width / width, rect.height / height);
  const crop = cropTransform(media.width / media.height, width / height, settings);
  const clamp = value => Math.max(0, Math.min(100, value));
  if (crop.scale[0] < .99999) settings.cropX = clamp(drag.cropX - (event.clientX - drag.x) / (width * displayedScale) * crop.scale[0] / (1 - crop.scale[0]) * 100);
  if (crop.scale[1] < .99999) settings.cropY = clamp(drag.cropY - (event.clientY - drag.y) / (height * displayedScale) * crop.scale[1] / (1 - crop.scale[1]) * 100);
  syncControls(); draw();
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) $('preview').addEventListener(event, () => { drag = null; });
let exportStart;
$('export').onclick = async () => {
  if (busy || !media || editor?.editing) return;
  setBusy(true); exportStart = performance.now(); $('progress').value = 0;
  showStatus('Exportujeme video', '', { pending: true });
  try {
    const result = await unwrap(api.exportVideo(settings));
    if (result) showStatus('Video je připravené', `${result.width} × ${result.height} · ${result.frames} snímků · ${formatTime(result.duration)}\n${result.path}`, { success: true });
    else $('status').hidden = true;
  } catch (error) { error.cancelled ? showStatus('Export byl zrušen', 'Rozpracovaný soubor byl odstraněn.') : showError(error); }
  finally { setBusy(false); draw(); }
};
$('export-image').onclick = async () => {
  if (busy || !media || editor?.editing) return;
  setBusy(true);
  showStatus('Exportujeme snímek', '', { pending: true });
  try {
    const [width, height] = FORMATS[settings.aspect];
    renderer.draw(settings, frameTime, { regions: editor?.maps, editing: false });
    const offscreen = document.createElement('canvas');
    offscreen.width = width; offscreen.height = height;
    const ctx = offscreen.getContext('2d');
    const imgData = ctx.createImageData(width, height);
    imgData.data.set(renderer.readPixels());
    ctx.putImageData(imgData, 0, 0);
    const dataUrl = offscreen.toDataURL('image/png');
    const result = await unwrap(api.exportImage(dataUrl));
    if (result) showStatus('Snímek je připravený', `${width} × ${height} · PNG\n${result.path}`, { success: true });
    else $('status').hidden = true;
  } catch (error) { showError(error); }
  finally { setBusy(false); draw(); }
};
api.onProgress(value => {
  $('progress').value = value.progress;
  if (value.kind === 'prepare') $('status-message').textContent = `Lokální příprava náhledu a synchronizace zvuku · ${Math.round(value.progress * 100)} %`;
  else if (value.phase === 'render') {
    const elapsed = (performance.now() - exportStart) / 1000;
    const remaining = value.frames > 5 ? ` · zbývá přibližně ${formatTime(elapsed / value.frames * (value.total - value.frames))}` : '';
    $('status-message').textContent = `Snímek ${value.frames} / ${value.total} · ${Math.round(value.progress * 100)} %${remaining}`;
  } else $('status-message').textContent = value.phase === 'finalize' ? 'Dokončujeme MP4 a kontrolujeme obraz i zvuk…' : 'Spouštíme grafický renderer…';
});
$('cancel').onclick = async () => { $('cancel').disabled = true; $('status-title').textContent = 'Rušíme zpracování…'; try { await unwrap(api.cancel()); } catch (error) { showError(error); } };
$('dismiss').onclick = () => { $('status').hidden = true; };
$('reveal').onclick = async () => { try { await unwrap(api.revealExport()); } catch (error) { showError(error); } };
$('save-settings').onclick = async () => { try { if (await unwrap(api.saveSettings(settings))) showStatus('Nastavení je uložené'); } catch (error) { showError(error); } };
$('load-settings').onclick = async () => { try { const value = await unwrap(api.loadSettings()); if (value) { settings = validateSettings(value); selectPreset(null); syncControls(); draw(); showStatus('Nastavení je načtené'); } } catch (error) { showError(error); } };
$('preview').addEventListener('webglcontextlost', event => { event.preventDefault(); video.pause(); renderer = null; setBusy(busy); showError(new Error('Grafický kontext byl přerušen. Restartujte aplikaci; uložená nastavení můžete znovu načíst.')); });
try { renderer = new VideoRenderer($('preview')); } catch (error) { showError(error); }
let redrawPending = false;
editor = new RegionEditor({
  canvas: $('preview'), getSettings: () => settings, enabled: () => !busy && Boolean(media && renderer),
  createMaps: () => renderer.editableRegions(settings, frameTime), onError: showError,
  liquidCoverage: maps => renderer.liquidCoverage(settings, frameTime, maps),
  pause: () => video.pause(), onModeChange: () => setBusy(busy),
  onChange: () => {
    if (redrawPending) return;
    redrawPending = true;
    requestAnimationFrame(() => { redrawPending = false; draw(); });
  },
});
setBusy(false); selectPreset('signature');
