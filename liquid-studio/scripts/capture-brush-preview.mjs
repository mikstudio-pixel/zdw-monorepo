// Capture the real editing renderer before/after the 1.4.1 preview fix.
import { chromium } from '../desktop/node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'public/liquid-brush-preview');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://brush.test/**', async route => {
    const relative = new URL(route.request().url()).pathname.slice(1);
    if (!relative) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
    if (!/^desktop\/(renderer|vendor|shared)\/[\w/-]+\.js$/.test(relative)) return route.abort();
    const file = relative === 'desktop/renderer/video-renderer-before.js'
      ? 'reference/brush-preview-fix/video-renderer-before.js' : relative;
    await route.fulfill({ contentType: 'text/javascript', body: await readFile(path.join(root, file)) });
  });
  await page.goto('http://brush.test/');
  const images = await page.evaluate(async () => {
    const [{ VideoRenderer: Before }, { VideoRenderer: After }, { DEFAULTS }, { RegionMaps }] = await Promise.all([
      import('/desktop/renderer/video-renderer-before.js'), import('/desktop/renderer/video-renderer.js'),
      import('/desktop/shared/settings.js'), import('/desktop/shared/regions.js'),
    ]);
    const maps = RegionMaps.empty();
    maps.paint('liquid', [.22, .3], [.22, .3], 480, 16 / 9);
    maps.paint('liquid', [.58, .72], [.8, .65], 480, 16 / 9);
    const settings = { ...DEFAULTS, liquid: true, opacity: 100, liquidStructure: 50 };
    const images = {};
    for (const [kind, Renderer] of [['before', Before], ['after', After]]) {
      const renderer = new Renderer(document.createElement('canvas'));
      try {
        renderer.upload(new Uint8Array([24, 29, 26, 255]), 1, 1);
        renderer.draw(settings, .7, { regions: maps, editing: true });
        renderer.gl.finish();
        if (renderer.gl.getError()) throw new Error(`${kind}: WebGL error`);
        images[kind] = renderer.canvas.toDataURL('image/png');
        renderer.draw(settings, .7, { regions: maps, editing: false });
        renderer.gl.finish();
        images[`${kind}-confirmed`] = renderer.canvas.toDataURL('image/png');
      } finally { renderer.destroy(); }
    }
    return images;
  });
  await mkdir(output, { recursive: true });
  const captures = {};
  for (const [name, url] of Object.entries(images)) {
    const bytes = Buffer.from(url.split(',')[1], 'base64');
    await writeFile(path.join(output, `${name}.png`), bytes);
    captures[name] = hash(bytes);
  }
  if (captures.after !== captures['after-confirmed']) throw new Error('Editing still changes the liquid');
  if (captures['before-confirmed'] !== captures['after-confirmed']) throw new Error('Fix changed the committed output');
  if (errors.length) throw new Error(errors.join('\n'));
  const sources = {};
  for (const file of ['reference/brush-preview-fix/video-renderer-before.js', 'desktop/renderer/video-renderer.js']) sources[file] = hash(await readFile(path.join(root, file)));
  await writeFile(path.join(output, 'capture-manifest.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), browser: browser.version(), sources,
    settings: { width: 1920, height: 1080, time: .7, background: [24, 29, 26], diameter: 480,
      strokes: [[.22, .3, .22, .3], [.58, .72, .8, .65]], structure: 50, opacity: 100, glass: false }, captures,
  }, null, 2));
  console.log('Editing matches confirmed liquid exactly; confirmed output unchanged.');
} finally { await browser.close(); }
