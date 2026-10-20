import { app, BrowserWindow, ipcMain, dialog, protocol, shell, session } from 'electron';
import { readFile, writeFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { join, dirname, basename, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { prepareMedia, checkAbort, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS } from './media.js';
import { decodePng } from './png.js';
import { exportVideo } from './export.js';
import { parseSettings, serializeSettings, validateSettings } from '../shared/settings.js';
import { MAX_SETTINGS_BYTES } from '../shared/regions.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const origin = 'app://studio';
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
let window, cache, media, operation, lastExport, exiting = false;

function lockWindow(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
}
function notify(value) { if (window && !window.isDestroyed()) window.webContents.send('job:progress', value); }
async function runJob(kind, task) {
  if (operation) throw new Error('Nejdříve dokončete nebo zrušte probíhající operaci.');
  const controller = new AbortController();
  const current = { controller, kind };
  operation = current;
  current.done = (async () => {
    try { return await task(controller.signal); }
    finally { if (operation === current) operation = null; }
  })();
  return current.done;
}
function handle(name, callback) {
  ipcMain.handle(name, async (event, ...args) => {
    if (event.sender !== window?.webContents || event.senderFrame?.url !== `${origin}/renderer/index.html`) return { ok: false, error: 'Nepovolený požadavek.' };
    try { return { ok: true, value: await callback(...args) }; }
    catch (error) {
      console.error(`[${name}]`, error.message);
      return { ok: false, error: error.message, cancelled: /zrušen/.test(error.message) };
    }
  });
}

class RenderHost {
  async open(signal) {
    checkAbort(signal);
    this.win = new BrowserWindow({ show: false, width: 320, height: 240, webPreferences: {
      preload: join(root, 'main/worker-preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false,
    } });
    lockWindow(this.win);
    this.onResult = (event, result) => {
      if (event.sender !== this.win?.webContents || result.index !== this.pending?.index) return;
      if (result.error) this.pending.finish(new Error(result.error));
      else if (!ArrayBuffer.isView(result.data)) this.pending.finish(new Error('Renderer nevrátil obrazová data.'));
      else this.pending.finish(null, Buffer.from(result.data.buffer, result.data.byteOffset, result.data.byteLength));
    };
    ipcMain.on('render:result', this.onResult);
    this.win.webContents.on('render-process-gone', () => this.pending?.finish(new Error('Grafický renderer byl ukončen. Zkuste export znovu.')));
    await new Promise((resolveReady, reject) => {
      const abort = () => finish(new Error('Export byl zrušen.'));
      const ready = (event, error) => {
        if (event.sender !== this.win?.webContents) return;
        finish(error ? new Error(error) : null);
      };
      const timeout = setTimeout(() => finish(new Error('Grafický renderer se nepodařilo spustit do 30 sekund.')), 30000);
      const finish = error => {
        clearTimeout(timeout); ipcMain.off('render:ready', ready); signal.removeEventListener('abort', abort);
        error ? reject(error) : resolveReady();
      };
      ipcMain.on('render:ready', ready);
      signal.addEventListener('abort', abort, { once: true });
      this.win.loadURL(`${origin}/renderer/worker.html`).catch(finish);
    });
  }
  render(frame, signal) {
    checkAbort(signal);
    return new Promise((resolveFrame, reject) => {
      const abort = () => finish(new Error('Export byl zrušen.'));
      const timeout = setTimeout(() => finish(new Error('Grafická karta nevrátila snímek do 60 sekund. Zkuste restartovat aplikaci.')), 60000);
      const finish = (error, result) => {
        clearTimeout(timeout); signal.removeEventListener('abort', abort); this.pending = null;
        error ? reject(error) : resolveFrame(result);
      };
      this.pending = { index: frame.index, finish };
      signal.addEventListener('abort', abort, { once: true });
      this.win.webContents.send('render:frame', frame);
    });
  }
  destroy() {
    this.pending?.finish(new Error('Export byl zrušen.'));
    if (this.onResult) ipcMain.off('render:result', this.onResult);
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
  }
}

async function importVideo(path, signal) {
  if (typeof path !== 'string' || !path || ![...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS].includes(extname(path).toLowerCase())) throw new Error('Vyberte podporované video nebo obrázek PNG, JPEG, WebP či BMP.');
  const id = randomUUID();
  const prepared = await prepareMedia(resolve(path), join(cache, `${id}.mp4`), signal, progress => notify({ kind: 'prepare', progress }));
  const previous = media;
  media = { ...prepared, id, originalPath: resolve(path), name: basename(path) };
  if (previous) await rm(previous.path, { force: true }).catch(() => {});
  return { id, name: media.name, url: `${origin}/media/${id}`, width: media.width, height: media.height, duration: media.duration, fps: media.fps, frames: media.frames, hasAudio: media.hasAudio, isImage: media.isImage };
}

function installHandlers() {
  handle('video:choose', () => runJob('prepare', async signal => {
    const result = await dialog.showOpenDialog(window, { title: 'Vyberte video nebo obrázek', properties: ['openFile'], filters: [{ name: 'Video nebo obrázek', extensions: [...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS].map(extension => extension.slice(1)) }] });
    if (result.canceled) return null;
    checkAbort(signal);
    return importVideo(result.filePaths[0], signal);
  }));
  handle('video:import', path => runJob('prepare', signal => importVideo(path, signal)));
  handle('video:export', rawSettings => runJob('export', async signal => {
    if (!media) throw new Error('Nejdříve vložte video.');
    const settings = validateSettings(rawSettings);
    const selection = await dialog.showSaveDialog(window, { title: 'Exportovat MP4', defaultPath: `${basename(media.name, extname(media.name))}-liquid.mp4`, filters: [{ name: 'MP4 video', extensions: ['mp4'] }] });
    if (selection.canceled) return null;
    const output = selection.filePath.toLowerCase().endsWith('.mp4') ? selection.filePath : selection.filePath + '.mp4';
    checkAbort(signal);
    const host = new RenderHost();
    const blockSleep = (await import('electron')).powerSaveBlocker;
    const blocker = blockSleep.start('prevent-app-suspension');
    try {
      notify({ kind: 'export', phase: 'init', progress: 0 });
      await host.open(signal);
      checkAbort(signal);
      const result = await exportVideo({ media, settings, output, signal, renderFrame: (frame, abortSignal) => host.render(frame, abortSignal), onProgress: value => notify({ kind: 'export', ...value }) });
      lastExport = result.path;
      return result;
    } finally { host.destroy(); blockSleep.stop(blocker); }
  }));
  handle('image:export', dataUrl => runJob('export', async signal => {
    if (!media) throw new Error('Nejdříve vložte médium.');
    const buffer = decodePng(dataUrl);
    const selection = await dialog.showSaveDialog(window, { title: 'Exportovat obrázek (PNG)',
      defaultPath: `${basename(media.name, extname(media.name))}-liquid.png`, filters: [{ name: 'PNG obrázek', extensions: ['png'] }] });
    if (selection.canceled) return null;
    checkAbort(signal);
    const output = selection.filePath.toLowerCase().endsWith('.png') ? selection.filePath : `${selection.filePath}.png`;
    await writeFile(output, buffer);
    lastExport = output;
    return { path: output };
  }));
  handle('job:cancel', () => { operation?.controller.abort(); return true; });
  handle('settings:save', async settings => {
    const text = serializeSettings(settings);
    const result = await dialog.showSaveDialog(window, { defaultPath: 'festival.liquid.json', filters: [{ name: 'Nastavení Liquid Studio', extensions: ['json'] }] });
    if (result.canceled) return null;
    await writeFile(result.filePath, text, 'utf8');
    return true;
  });
  handle('settings:load', async () => {
    const result = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: 'Nastavení Liquid Studio', extensions: ['json'] }] });
    if (result.canceled) return null;
    if ((await stat(result.filePaths[0])).size > MAX_SETTINGS_BYTES) throw new Error('Soubor nastavení je příliš velký.');
    return parseSettings(await readFile(result.filePaths[0], 'utf8'));
  });
  handle('export:reveal', () => { if (lastExport) shell.showItemInFolder(lastExport); });
}

async function serve(request) {
  const url = new URL(request.url);
  if (url.host !== 'studio') return new Response('Not found', { status: 404 });
  if (url.pathname.startsWith('/media/')) {
    if (!media || url.pathname !== `/media/${media.id}`) return new Response('Not found', { status: 404 });
    const size = (await stat(media.path)).size;
    const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    const range = request.headers.get('Range');
    let start = 0, end = size - 1;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      if (!match[1]) start = Math.max(0, size - Number(match[2]));
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
      if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    }
    headers['Content-Length'] = String(end - start + 1);
    return new Response(request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(media.path, { start, end })), { status: range ? 206 : 200, headers });
  }
  const path = resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!['renderer', 'shared', 'vendor'].some(folder => path.startsWith(join(root, folder) + sep))) return new Response('Not found', { status: 404 });
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(path)];
  if (!mime) return new Response('Not found', { status: 404 });
  return new Response(await readFile(path), { headers: { 'Content-Type': `${mime}; charset=utf-8` } });
}

async function shutdown() {
  if (exiting) return;
  exiting = true;
  operation?.controller.abort();
  await operation?.done.catch(() => {});
  if (window && !window.isDestroyed()) window.destroy();
  if (cache) await rm(cache, { recursive: true, force: true }).catch(() => {});
  app.quit();
}
app.on('before-quit', event => { if (!exiting) { event.preventDefault(); void shutdown(); } });
app.on('window-all-closed', () => { void shutdown(); });

app.whenReady().then(async () => {
  cache = await mkdtemp(join(app.getPath('temp'), 'zdw-liquid-'));
  protocol.handle('app', request => serve(request).catch(() => new Response('Soubor není dostupný.', { status: 404 })));
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !details.url.startsWith(`${origin}/`) && !details.url.startsWith('devtools://') }));
  window = new BrowserWindow({ width: 1440, height: 960, minWidth: 1050, minHeight: 740, backgroundColor: '#101312', title: 'Liquid Studio', autoHideMenuBar: true,
    webPreferences: { preload: join(root, 'main/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  lockWindow(window);
  window.on('close', event => { if (!exiting) { event.preventDefault(); void shutdown(); } });
  window.webContents.on('render-process-gone', () => { void shutdown(); });
  installHandlers();
  await window.loadURL(`${origin}/renderer/index.html`);
}).catch(error => {
  dialog.showErrorBox('Liquid Studio nelze spustit', error.message);
  void shutdown();
});
