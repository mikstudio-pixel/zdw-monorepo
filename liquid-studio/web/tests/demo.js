// An automated, visible walkthrough of the real UI and the real local export.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const $ = id => document.getElementById(id);
const platform = /iPhone/.test(navigator.userAgent) ? 'ios' : 'browser';
const runId = new URL(location.href).searchParams.get('record') || String(Date.now());
const send = (name, data) => fetch(`/__qa/${name === 'events.json' ? name : platform + '-' + name}`, { method: 'POST', body: data });
const event = (step, detail = {}) => send('events.json', JSON.stringify({ step, ...detail, runId, time: Date.now(), userAgent: navigator.userAgent }));
window.addEventListener('error', e => event('error', { message: e.message }));
window.addEventListener('unhandledrejection', e => event('error', { message: String(e.reason) }));
async function waitFor(test, timeout = 120_000) {
  const start = performance.now();
  while (!test()) { if (performance.now() - start > timeout) throw new Error('Čekání na aplikaci vypršelo: ' + $('status-message').textContent); await sleep(100); }
}
const slider = (id, value) => { $(id).value = value; $(id).dispatchEvent(new Event('input', { bubbles: true })); };
async function stroke(from, to) {
  const canvas = $('preview'), r = canvas.getBoundingClientRect(), scale = Math.min(r.width / canvas.width, r.height / canvas.height);
  const width = canvas.width * scale, height = canvas.height * scale;
  const point = p => ({ clientX: r.x + (r.width - width) / 2 + p[0] * width, clientY: r.y + (r.height - height) / 2 + p[1] * height,
    pointerId: 77, button: 0, buttons: 1, bubbles: true });
  // Synthetic pointers do not own native capture. The editing/event path is unchanged.
  const capture = canvas.setPointerCapture, release = canvas.releasePointerCapture;
  canvas.setPointerCapture = () => {}; canvas.releasePointerCapture = () => {};
  try {
    canvas.dispatchEvent(new PointerEvent('pointerdown', point(from)));
    for (let i = 1; i <= 24; i++) {
      canvas.dispatchEvent(new PointerEvent('pointermove', point(from.map((v, axis) => v + (to[axis] - v) * i / 24))));
      await sleep(45);
    }
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...point(to), buttons: 0 }));
  } finally { canvas.setPointerCapture = capture; canvas.releasePointerCapture = release; }
}
try {
  await waitFor(() => window.liquid && $('liquidStructure'));
  await event('ready', { encoder: typeof VideoEncoder, decoder: typeof VideoDecoder, secure: isSecureContext });
  window.liquid.onProgress(value => { if (value.phase !== 'render' || value.frames < 4 || value.frames % 30 === 0) void event('progress', value); });
  await sleep(2500);
  const fixture = new URL(location.href).searchParams.get('fixture') === 'sync' ? 'sync' : 'demo';
  const file = new File([await (await fetch(`/__qa/${fixture}.mp4`)).blob()], fixture === 'demo' ? 'ZDW – ukázka.mp4' : 'Synchronizace.mp4', { type: 'video/mp4' });
  const originalChoose = window.liquid.chooseVideo;
  window.liquid.chooseVideo = () => window.liquid.importFile(file);
  $('choose-video').click();
  await waitFor(() => !$('preview').hidden && !$('export').disabled);
  window.liquid.chooseVideo = originalChoose;
  await event('imported');
  await sleep(1000);
  document.querySelector('[data-preset="festival"]').click();
  document.querySelector('[data-tool="glass"]').click();
  $('clear-region').click();
  await stroke([.1, .25], [.25, .65]);
  await stroke([.8, .35], [.9, .7]);
  document.querySelector('[data-tool="liquid"]').click();
  $('clear-region').click(); slider('brush-size', 480);
  await stroke([.1, .3], [.2, .45]);
  await stroke([.82, .7], [.9, .75]);
  await event('painted');
  await sleep(800); $('apply-regions').click();
  $('liquidStructure').scrollIntoView({ block: 'center', behavior: 'smooth' });
  await sleep(500); slider('liquidStructure', 62);
  await event('confirmed');
  await sleep(1200);
  slider('liquidStructure', 62); // Capture in the draw task before WebGL discards its buffer.
  const blob = await new Promise(resolve => $('preview').toBlob(resolve));
  await send(`${fixture}-preview.png`, blob);
  if (fixture === 'sync') {
    for (const index of [21, 24, 36, 0]) {
      const seeked = new Promise(resolve => document.querySelector('video').addEventListener('seeked', resolve, { once: true }));
      slider('timeline', index); await seeked;
      slider('liquidStructure', 62);
      await send(`${fixture}-preview-${index}.png`, await new Promise(resolve => $('preview').toBlob(resolve)));
    }
  }
  let result;
  const exportVideo = window.liquid.exportVideo;
  window.liquid.exportVideo = async settings => {
    await send(`${fixture}-settings.json`, JSON.stringify(settings));
    // Capture one uncompressed export frame to separate renderer differences
    // from the native encoder's color conversion and compression.
    const getContext = HTMLCanvasElement.prototype.getContext;
    let captured = false, capture;
    HTMLCanvasElement.prototype.getContext = function(type, options) {
      const context = getContext.call(this, type, options);
      if (type === 'webgl2' && context) {
        const drawArrays = context.drawArrays.bind(context), canvas = this;
        context.drawArrays = (...args) => {
          drawArrays(...args);
          if (!captured && context.getParameter(context.FRAMEBUFFER_BINDING) === null) {
            captured = true;
            capture = new Promise(resolve => canvas.toBlob(resolve)).then(blob => send(`${fixture}-uncompressed.png`, blob));
          }
        };
      }
      return context;
    };
    try { result = await exportVideo(settings); await capture; return result; }
    finally { HTMLCanvasElement.prototype.getContext = getContext; }
  };
  $('export').click();
  await event('export-start');
  await waitFor(() => result, 300_000);
  if (!result.ok) throw new Error(result.error);
  await send(`${fixture}-export.mp4`, result.value.file);
  await event('export-complete', { width: result.value.width, height: result.value.height, frames: result.value.frames, duration: result.value.duration, bytes: result.value.file.size });
  await sleep(3000);
  // Display the actual exported MP4 after completion, without another render.
  const playback = document.createElement('video'); playback.controls = true; playback.playsInline = true; playback.muted = true;
  playback.src = result.value.url; playback.style.cssText = 'position:fixed;inset:10%;width:80%;height:80%;background:#101412;z-index:20;object-fit:contain';
  document.body.append(playback);
  await playback.play(); playback.pause();
  if (playback.currentTime > 0) {
    const seeked = new Promise(resolve => playback.addEventListener('seeked', resolve, { once: true }));
    playback.currentTime = 0; await seeked;
  }
  const decoded = document.createElement('canvas'); decoded.width = result.value.width; decoded.height = result.value.height;
  decoded.getContext('2d').drawImage(playback, 0, 0, decoded.width, decoded.height);
  await send(`${fixture}-playback.png`, await new Promise(resolve => decoded.toBlob(resolve)));
  await playback.play();
  await event('playback');
  await sleep(result.value.duration * 1000 + 1000);
  playback.remove(); document.documentElement.dataset.qaDone = 'true'; await event('done');
} catch (error) { await event('failed', { message: error.message, stack: error.stack }); }
