// Isolated renderer fixtures: same saved stroke, settings, time and background.
import { chromium } from '../desktop/node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'public/liquid-brush-compare');
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
      ? 'reference/brush-calibration/video-renderer-before.js' : relative;
    await route.fulfill({ contentType: 'text/javascript', body: await readFile(path.join(root, file)) });
  });
  await page.goto('http://brush.test/');
  await page.evaluate(async () => {
    const [{ VideoRenderer: Before }, { VideoRenderer: After }, { DEFAULTS }, { RegionMaps }] = await Promise.all([
      import('/desktop/renderer/video-renderer-before.js'), import('/desktop/renderer/video-renderer.js'),
      import('/desktop/shared/settings.js'), import('/desktop/shared/regions.js'),
    ]);
    const renderers = { before: new Before(document.createElement('canvas')), after: new After(document.createElement('canvas')) };
    const maps = RegionMaps.empty();
    maps.paint('liquid', [.2, .58], [.8, .4], 300, 16 / 9);
    const settings = { ...DEFAULTS, liquid: true, opacity: 100 };
    for (const renderer of Object.values(renderers)) renderer.upload(new Uint8Array([24, 29, 26, 255]), 1, 1);
    window.captureBrush = (frame, structure = 50) => Object.fromEntries(Object.entries(renderers).map(([key, renderer]) => {
      renderer.draw({ ...settings, liquidStructure: structure }, frame / 30, { regions: maps });
      renderer.gl.finish();
      if (renderer.gl.getError()) throw new Error(`${key}: WebGL error`);
      return [key, renderer.canvas.toDataURL('image/png')];
    }));
  });
  for (const kind of ['before', 'after']) await mkdir(path.join(output, kind), { recursive: true });
  const captures = [];
  for (let frame = 0; frame <= 180; frame++) {
    const images = await page.evaluate(frame => window.captureBrush(frame), frame);
    const record = { frame, time: frame / 30 };
    for (const [kind, url] of Object.entries(images)) {
      const bytes = Buffer.from(url.split(',')[1], 'base64');
      await writeFile(path.join(output, kind, `frame-${String(frame).padStart(4, '0')}.png`), bytes);
      record[kind] = hash(bytes);
    }
    captures.push(record);
    if (frame % 30 === 0) console.log(`Brush capture ${frame}/180`);
  }
  for (const structure of [0, 50, 100]) {
    const images = await page.evaluate(structure => window.captureBrush(21, structure), structure);
    for (const [kind, url] of Object.entries(images)) await writeFile(path.join(output, `${kind}-structure-${structure}.png`), Buffer.from(url.split(',')[1], 'base64'));
  }
  const repeated = await page.evaluate(() => window.captureBrush(0));
  for (const [kind, url] of Object.entries(repeated)) {
    if (hash(Buffer.from(url.split(',')[1], 'base64')) !== captures[0][kind]) throw new Error(`${kind}: nondeterministic seek`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  const sources = {};
  for (const file of ['reference/brush-calibration/video-renderer-before.js', 'desktop/renderer/video-renderer.js', 'desktop/shared/liquid-guides.js', 'src/shaders.js', 'src/liquid-source.js', 'src/liquid-deformation.js']) sources[file] = hash(await readFile(path.join(root, file)));
  await writeFile(path.join(output, 'capture-manifest.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), browser: browser.version(), sources,
    settings: { width: 1920, height: 1080, fps: 30, background: [24, 29, 26], stroke: { from: [.2, .58], to: [.8, .4], diameter: 300 }, structure: 50, opacity: 100, glass: false },
    captures,
  }, null, 2));
} finally { await browser.close(); }
