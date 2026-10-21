import { VideoRenderer } from './video-renderer.js';
import { DEFAULTS, PRESETS, FORMATS, FPS, validateSettings, cropTransform, PALETTE_COLORS, PALETTE_PRESET_COLORS, DEFAULT_LIQUID_COLORS } from '../shared/settings.js';
import { RegionMaps, canvasPoint } from '../shared/regions.js';
import { RegionEditor } from './region-editor.js';
import { captureEffects, materializeKeyframe, putKeyframe } from '../shared/keyframes.js';

const $ = id => document.getElementById(id);
const api = window.liquid;
export const studioEvents = new EventTarget();
const notify = () => studioEvents.dispatchEvent(new Event('change'));
const areaMode = api.regionMode === 'area';
let areaProgress = 1;
let timelinePreview = false, activeKeyframe = null;
let scrubbing = false, requestedFrame = null;
let settings = { ...DEFAULTS, ...(areaMode ? { liquid: true, mediaFit: 'contain', opacity: 100 } : {}),
  regions: (areaMode ? RegionMaps.empty().useLiquidArea() : RegionMaps.empty()).serialize() }, media = null, busy = false, frameTime = 0, renderer, drag, editor;
const video = document.createElement('video');
video.preload = 'auto'; video.playsInline = true;
const mediaTime = time => Math.max(0, time - (media?.startTime || 0));
const seekTo = time => { video.currentTime = time + (media?.startTime || 0); };
// Keep decoded frames alive and available for requestVideoFrameCallback.
video.hidden = true; document.body.append(video);
const formatTime = time => `${String(Math.floor(time / 60)).padStart(2, '0')}:${(time % 60).toFixed(2).padStart(5, '0')}`;
const formatTimelineTime = time => areaMode
  ? `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time) % 60).padStart(2, '0')}`
  : formatTime(time);
function seekLatestFrame() {
  if (video.seeking || requestedFrame === null) return;
  const time = requestedFrame / FPS;
  if (Math.abs(mediaTime(video.currentTime) - time) < .0001) {
    requestedFrame = null;
    draw(true, time);
  } else seekTo(time);
}
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
  if (!renderer || !media || (!media.isStill && video.readyState < 2)) return;
  try {
    if (upload) { renderer.upload(api.previewSource ? api.previewSource(video) : video); frameTime = time; }
    renderer.draw(settings, frameTime, { regions: editor?.maps, editing: editor?.editing,
      areaPreview: areaMode && editor?.editing && editor.layer === 'liquid', areaProgress,
      useKeyframes: !areaMode || timelinePreview,
      previewScale: areaMode && (scrubbing || requestedFrame !== null) ? .5 : 1 });
  } catch (error) { video.pause(); showError(error); }
}
function videoFrame(_now, metadata) {
  if (!busy && media && !media.isStill && !video.seeking) {
    const time = Math.round(mediaTime(metadata.mediaTime) * FPS) / FPS;
    if (time !== frameTime) draw(true, time);
    // A decoded frame must not move the user's thumb back during a seek.
    if (!scrubbing && requestedFrame === null) {
      $('timeline').value = Math.min(media.frames - 1, Math.round(frameTime * FPS));
      $('current-time').textContent = formatTimelineTime(frameTime);
    }
    studioEvents.dispatchEvent(new Event('timechange'));
  }
  video.requestVideoFrameCallback(videoFrame);
}
video.requestVideoFrameCallback(videoFrame);
video.addEventListener('seeked', () => {
  if (media?.isStill) return;
  if (requestedFrame === Math.round(mediaTime(video.currentTime) * FPS)) requestedFrame = null;
  if (!busy) draw(true, Math.floor(mediaTime(video.currentTime) * FPS + 1e-5) / FPS);
  if (areaMode) seekLatestFrame();
  studioEvents.dispatchEvent(new Event('timechange'));
});
video.addEventListener('play', updatePlay); video.addEventListener('pause', updatePlay); video.addEventListener('ended', updatePlay);
video.addEventListener('error', () => showError(new Error('Náhled připraveného videa nelze přehrát. Zkuste soubor vložit znovu.')));
function updatePlay() { $('play').textContent = video.paused ? (areaMode ? '▶︎' : '▶') : 'Ⅱ'; $('play').setAttribute('aria-label', video.paused ? 'Přehrát' : 'Pozastavit'); notify(); }
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
  notify();
}
function showStatus(title, message = '', { error = false, pending = false, success = false, revealType, revealLabel } = {}) {
  $('status').hidden = false; $('status').classList.toggle('error', error);
  $('status-title').textContent = title; $('status-message').textContent = message;
  $('progress').hidden = !pending; $('cancel').hidden = !pending; $('cancel').disabled = false;
  $('reveal').hidden = !success; $('dismiss').hidden = pending;
  if (revealType) $('reveal').dataset.exportType = revealType;
  if (revealLabel) $('reveal').textContent = revealLabel;
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
  showStatus('Příprava média', '', { pending: true });
  try {
    const result = await unwrap(load());
    if (!result) { $('status').hidden = true; return; }
    media = result; frameTime = 0; requestedFrame = null; scrubbing = false;
    if (areaMode) {
      const ratio = result.width / result.height;
      settings.aspect = ratio > 1.2 ? '16:9' : ratio < .85 ? '9:16' : '1:1';
      syncControls();
    }
    if (result.isStill) {
      video.removeAttribute('src'); video.load();
    } else {
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
    }
    $('empty').hidden = true; $('preview').hidden = false;
    $('file-name').textContent = result.name;
    const soundText = result.isImage ? 'obrázek' : result.hasAudio ? 'se zvukem' : 'bez zvuku';
    $('file-info').textContent = result.isStill ? `${result.width} × ${result.height} · obrázek`
      : `${result.width} × ${result.height} · ${formatTime(result.duration)} · 30 fps · ${soundText}`;
    if (!areaMode) $('replace-video').textContent = result.isImage ? 'Změnit obrázek' : 'Změnit video';
    $('timeline').max = result.frames - 1; $('timeline').value = 0;
    $('duration').textContent = formatTime(result.duration); $('current-time').textContent = formatTimelineTime(0);
    $('status').hidden = true;
    draw(true, 0);
    studioEvents.dispatchEvent(new Event('mediachange'));
  } catch (error) { error.cancelled ? showStatus('Příprava média byla zrušena') : showError(error); }
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
  if (busy || !media || media.isStill || editor?.editing) return;
  if (!video.paused) { video.pause(); return; }
  if (areaMode) timelinePreview = true;
  if (video.ended || mediaTime(video.currentTime) >= media.duration - 1 / FPS) seekTo(0);
  try { await video.play(); } catch { showError(new Error('Video nelze přehrát. Zkuste jej vložit znovu.')); }
};
$('mute').onclick = () => { video.muted = !video.muted; $('mute').textContent = video.muted ? 'Zvuk vyp.' : 'Zvuk zap.'; $('mute').setAttribute('aria-label', video.muted ? 'Zapnout zvuk' : 'Ztlumit zvuk'); };
$('timeline').oninput = () => {
  video.pause();
  if (areaMode) timelinePreview = true;
  const time = Number($('timeline').value) / FPS;
  if (areaMode) {
    requestedFrame = Math.max(0, Math.min(media.frames - 1, Math.round(time * FPS)));
    seekLatestFrame();
  } else seekTo(time);
  $('current-time').textContent = formatTimelineTime(time);
  studioEvents.dispatchEvent(new Event('timechange'));
};
document.addEventListener('keydown', event => {
  if (event.code === 'Space' && !['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) { event.preventDefault(); $('play').click(); }
});
$('preview').addEventListener('pointerdown', event => {
  if (areaMode || busy || !media || editor?.editing || event.button !== 0) return;
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
async function exportVideo() {
  if (busy || !media || editor?.editing) return;
  setBusy(true); exportStart = performance.now(); $('progress').value = 0;
  showStatus('Exportujeme video', '', { pending: true });
  try {
    const result = await unwrap(api.exportVideo(settings));
    if (result) showStatus('Video je připravené', `${result.width} × ${result.height} · ${result.frames} snímků · ${formatTime(result.duration)}\n${result.path}`, {
      success: true, revealType: 'video', revealLabel: areaMode ? 'Uložit video' : 'Zobrazit soubor',
    });
    else $('status').hidden = true;
    return result;
  } catch (error) { error.cancelled ? showStatus('Export byl zrušen', 'Rozpracovaný soubor byl odstraněn.') : showError(error); }
  finally { setBusy(false); draw(); }
}
$('export').onclick = () => exportVideo();
async function exportImage(announce = true) {
  if (busy || !media || editor?.editing) return;
  setBusy(true);
  if (announce) showStatus('Exportujeme snímek', '', { pending: true });
  try {
    const [width, height] = FORMATS[settings.aspect];
    renderer.draw(settings, frameTime, { regions: editor?.maps, editing: false, useKeyframes: !areaMode || timelinePreview });
    const offscreen = document.createElement('canvas');
    offscreen.width = width; offscreen.height = height;
    const ctx = offscreen.getContext('2d');
    const imgData = ctx.createImageData(width, height);
    imgData.data.set(renderer.readPixels());
    ctx.putImageData(imgData, 0, 0);
    const dataUrl = offscreen.toDataURL('image/png');
    const result = await unwrap(api.exportImage(dataUrl));
    if (result && announce) showStatus('Snímek je připravený', `${width} × ${height} · PNG\n${result.path}`, {
      success: true, revealType: 'image', revealLabel: areaMode ? 'Uložit obrázek' : 'Zobrazit soubor',
    });
    else $('status').hidden = true;
    return result;
  } catch (error) { showError(error); }
  finally { setBusy(false); draw(); }
}
$('export-image').onclick = () => exportImage();
api.onProgress(value => {
  $('progress').value = value.progress;
  if (value.kind === 'prepare') $('status-message').textContent = `Příprava náhledu a synchronizace zvuku · ${Math.round(value.progress * 100)} %`;
  else if (value.phase === 'render') {
    const elapsed = (performance.now() - exportStart) / 1000;
    const remaining = value.frames > 5 ? ` · zbývá přibližně ${formatTime(elapsed / value.frames * (value.total - value.frames))}` : '';
    $('status-message').textContent = `Snímek ${value.frames} / ${value.total} · ${Math.round(value.progress * 100)} %${remaining}`;
  } else $('status-message').textContent = value.phase === 'finalize' ? 'Dokončujeme MP4 a kontrolujeme obraz i zvuk…' : 'Spouštíme grafický renderer…';
});
$('cancel').onclick = async () => { $('cancel').disabled = true; $('status-title').textContent = 'Rušíme zpracování…'; try { await unwrap(api.cancel()); } catch (error) { showError(error); } };
$('dismiss').onclick = () => { $('status').hidden = true; };
$('reveal').onclick = async () => { try { await unwrap(api.revealExport($('reveal').dataset.exportType)); } catch (error) { showError(error); } };
$('save-settings').onclick = async () => { try { if (await unwrap(api.saveSettings(settings))) showStatus('Nastavení je uložené'); } catch (error) { showError(error); } };
$('load-settings').onclick = async () => { try { const value = await unwrap(api.loadSettings()); if (value) { settings = validateSettings(value); selectPreset(null); syncControls(); draw(); showStatus('Nastavení je načtené'); } } catch (error) { showError(error); } };
$('preview').addEventListener('webglcontextlost', event => { event.preventDefault(); video.pause(); renderer = null; setBusy(busy); showError(new Error('Grafický kontext byl přerušen. Restartujte aplikaci; uložená nastavení můžete znovu načíst.')); });
try { renderer = new VideoRenderer($('preview')); } catch (error) { showError(error); }
let redrawPending = false;
editor = new RegionEditor({
  areaMode,
  canvas: $('preview'), getSettings: () => settings, enabled: () => !busy && Boolean(media && renderer),
  createMaps: () => renderer.editableRegions(settings, frameTime), onError: showError,
  liquidCoverage: maps => renderer.liquidCoverage(settings, frameTime, maps),
  pause: () => video.pause(), onModeChange: () => setBusy(busy),
  onChange: () => {
    notify();
    if (redrawPending) return;
    redrawPending = true;
    requestAnimationFrame(() => { redrawPending = false; draw(); });
  },
});
// Small shared controller: the mobile flow owns navigation, while drawing,
// settings, PNG rendering and the desktop editor retain one implementation.
function commitLayer() {
  const editing = editor.editing;
  editor.finish(true);
  if (editing && activeKeyframe !== null && settings.keyframes?.length) {
    settings.keyframes = putKeyframe(settings.keyframes, activeKeyframe, captureEffects(settings));
    notify();
  }
}
export const studio = {
  get ready() { return Boolean(media && renderer); },
  get isImage() { return Boolean(media?.isImage); },
  get busy() { return busy; },
  get drawing() { return Boolean(editor.stroke); },
  get seeking() { return video.seeking || requestedFrame !== null; },
  get scrubbing() { return scrubbing; },
  get playing() { return !video.paused; },
  get tool() { return editor.tool; },
  get frame() { return requestedFrame ?? Math.round(mediaTime(video.currentTime) * FPS); },
  get frames() { return media?.frames || 1; },
  get keyframes() { return settings.keyframes || []; },
  get colors() { return settings.liquidColors; },
  exportVideo,
  hasArea(layer) { return Boolean((editor.maps || new RegionMaps(settings.regions)).layers[layer].some(value => value >= 128)); },
  chooseTool(tool) { editor.choose(tool); },
  editLayer(layer) { editor.choose(layer); },
  confirmLayer: commitLayer,
  resetRegions() {
    editor.finish(false);
    settings.regions = RegionMaps.empty().useLiquidArea().serialize();
    settings.liquid = true;
    delete settings.keyframes; activeKeyframe = null; timelinePreview = false;
    syncControls();
  },
  setPalette(colors) {
    settings.liquidColors = Object.freeze([...colors]);
    if (activeKeyframe !== null && settings.keyframes?.length) settings.keyframes = putKeyframe(settings.keyframes, activeKeyframe, captureEffects(settings));
    syncControls(); draw(); notify();
  },
  prepareImage: () => exportImage(false),
  setScrubbing(value) {
    scrubbing = value;
    if (!value && !studio.seeking) draw();
  },
  openTimeline({ seed = true } = {}) {
    commitLayer();
    if (seed && !settings.keyframes?.length) {
      settings.keyframes = [{ frame: 0, effects: captureEffects(settings) }];
      activeKeyframe = 0;
    }
    notify();
  },
  closeTimeline() {
    video.pause();
    if (timelinePreview) Object.assign(settings, materializeKeyframe(settings, Math.round(frameTime * FPS)));
    activeKeyframe = settings.keyframes?.some(key => key.frame === studio.frame) ? studio.frame : null;
    timelinePreview = false; syncControls(); draw();
  },
  async seekFrame(frame) {
    const target = Math.max(0, Math.min(media.frames - 1, Math.round(frame)));
    $('timeline').value = target;
    $('timeline').oninput();
    if (studio.seeking) await new Promise(resolve => {
      const settled = () => {
        if (studio.seeking) return;
        studioEvents.removeEventListener('timechange', settled); resolve();
      };
      studioEvents.addEventListener('timechange', settled);
    });
  },
  addKeyframe(layer) {
    if (timelinePreview) Object.assign(settings, materializeKeyframe(settings, Math.round(frameTime * FPS)));
    const frame = studio.frame;
    if (!settings.keyframes?.some(key => key.frame === frame) && layer) {
      const maps = new RegionMaps(settings.regions); maps.clear(layer); settings.regions = maps.serialize();
    }
    settings.keyframes = putKeyframe(settings.keyframes || [], frame, captureEffects(settings));
    activeKeyframe = frame; timelinePreview = false; notify();
  },
  removeKeyframe() {
    if (studio.frame === 0) return;
    settings.keyframes = settings.keyframes.filter(key => key.frame !== studio.frame);
    activeKeyframe = null; timelinePreview = true; draw(); notify();
  },
  async morphLiquid() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const start = performance.now();
    await new Promise(resolve => {
      const animate = now => {
        areaProgress = Math.min(1, (now - start) / 420);
        draw();
        if (areaProgress < 1) requestAnimationFrame(animate);
        else resolve();
      };
      requestAnimationFrame(animate);
    });
  },
};
setBusy(false); selectPreset('signature');
