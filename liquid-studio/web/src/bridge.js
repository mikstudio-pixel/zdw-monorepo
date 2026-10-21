import { inspectVideo, renderVideo, prepareImage, prepareStillImage } from './media.js';
import { FPS, parseSettings, serializeSettings } from '../../desktop/shared/settings.js';
import { MAX_SETTINGS_BYTES } from '../../desktop/shared/regions.js';
import { PixelBackdrop } from './pixel-backdrop.js';

let current, previewUrl, controller, stillSource, latestExport = 'image';
const outputs = { image: null, video: null };
const outputUrls = { image: null, video: null };
let backdrop;
const listeners = new Set();
const previewCanvas = document.createElement('canvas');
const previewContext = previewCanvas.getContext('2d', { alpha: false });
const wrap = async action => {
  try { return { ok: true, value: await action() }; }
  catch (error) { return { ok: false, error: error.message || String(error), cancelled: error.name === 'AbortError' }; }
};
const progress = value => listeners.forEach(callback => callback(value));
function pick(accept) {
  return new Promise(resolve => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = accept; input.hidden = true;
    const finish = file => { input.remove(); resolve(file); };
    input.onchange = () => finish(input.files[0] || null);
    input.oncancel = () => finish(null);
    document.body.append(input); input.click();
  });
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
async function importFile(file, { defaultVideo = false } = {}) {
  if (!file && !defaultVideo) return null;
  controller = new AbortController();
  try {
    if (defaultVideo) {
      const portrait = window.liquid.regionMode === 'area';
      const asset = portrait ? 'zdw-demo-portrait.mp4' : 'zdw-demo.mp4';
      const response = await fetch(new URL(`./assets/${asset}`, document.baseURI), { signal: controller.signal });
      if (!response.ok) throw new Error('Ukázkové video se nepodařilo načíst. Vložte vlastní soubor.');
      file = new File([await response.blob()], portrait ? 'ZDW – úvodní video na výšku.mp4' : 'ZDW – úvodní video.mp4', { type: 'video/mp4' });
    }
    const isImage = /^image\//i.test(file.type) || /\.(png|jpe?g|webp|bmp|heic|heif|avif|gif)$/i.test(file.name);
    const still = isImage && window.liquid.regionMode === 'area' ? await prepareStillImage(file, controller.signal) : null;
    if (isImage && !still) file = await prepareImage(file, controller.signal);
    const info = still ? { name: file.name, width: still.width, height: still.height, startTime: 0,
      duration: 1 / FPS, frames: 1, fps: FPS, hasAudio: false } : await inspectVideo(file, controller.signal);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    for (const type of ['image', 'video']) {
      if (outputUrls[type]) URL.revokeObjectURL(outputUrls[type]);
      outputs[type] = outputUrls[type] = null;
    }
    latestExport = 'image';
    if (stillSource) stillSource.width = stillSource.height = 1;
    current = file; stillSource = still; previewUrl = still ? null : URL.createObjectURL(file);
    return { ...info, url: previewUrl, isImage, isStill: Boolean(still) };
  } finally { controller = null; }
}
window.liquid = {
  loadDefaultVideo: () => wrap(() => importFile(null, { defaultVideo: true })),
  // Normalize through RGB, just like decoded export frames. This also avoids
  // Safari simulator's NV12-to-WebGL texture upload color corruption.
  previewSource: video => {
    const width = stillSource ? stillSource.width : video.videoWidth;
    const height = stillSource ? stillSource.height : video.videoHeight;
    if (previewCanvas.width !== width || previewCanvas.height !== height) {
      previewCanvas.width = width; previewCanvas.height = height;
    }
    previewContext.drawImage(stillSource || video, 0, 0);
    if (window.liquid.regionMode === 'area') (backdrop ||= new PixelBackdrop()).draw(previewCanvas);
    return previewCanvas;
  },
  chooseVideo: () => wrap(async () => importFile(await pick('video/*,image/*,.mp4,.mov,.m4v,.webm,.png,.jpg,.jpeg,.webp,.bmp,.heic,.heif,.avif,.gif'))),
  importFile: file => wrap(() => importFile(file)),
  exportVideo: settings => wrap(async () => {
    if (!current) throw new Error('Nejdříve vložte video.');
    controller = new AbortController();
    try {
      const input = stillSource ? await prepareImage(current, controller.signal) : current;
      const result = await renderVideo(input, settings, { signal: controller.signal, onProgress: progress });
      if (outputUrls.video) URL.revokeObjectURL(outputUrls.video);
      outputs.video = result.file; outputUrls.video = URL.createObjectURL(outputs.video);
      latestExport = 'video';
      return { ...result, url: outputUrls.video };
    } finally { controller = null; }
  }),
  cancel: () => wrap(async () => { controller?.abort(); }),
  exportImage: dataUrl => wrap(async () => {
    if (!current) throw new Error('Nejdříve vložte médium.');
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), character => character.charCodeAt(0));
    outputs.image = new File([bytes], `${current.name.replace(/\.[^.]+$/, '')}-liquid.png`, { type: 'image/png' });
    if (outputUrls.image) URL.revokeObjectURL(outputUrls.image);
    outputUrls.image = URL.createObjectURL(outputs.image);
    latestExport = 'image';
    return { path: outputs.image.name, url: outputUrls.image };
  }),
  revealExport: type => wrap(async () => {
    const file = outputs[type === 'video' || type === 'image' ? type : latestExport];
    if (!file) return;
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
    else download(file, file.name);
  }),
  saveSettings: settings => wrap(async () => { download(new Blob([serializeSettings(settings)], { type: 'application/json' }), 'liquid-settings.json'); return true; }),
  loadSettings: () => wrap(async () => {
    const file = await pick('.json,application/json');
    if (!file) return null;
    if (file.size > MAX_SETTINGS_BYTES) throw new Error('Soubor nastavení je příliš velký.');
    return parseSettings(await file.text());
  }),
  onProgress: callback => { listeners.add(callback); return () => listeners.delete(callback); },
};
