// Actual GPU output: identical brush/eraser actions, time and framing.
import { chromium } from '../desktop/node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'public/liquid-brush-repaint');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://brush.test/**', async route => {
    const relative = new URL(route.request().url()).pathname.slice(1);
    if (!relative) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
    if (!/^(before|after)\/(renderer|vendor|shared)\/[\w/-]+\.js$/.test(relative)) return route.abort();
    const [version, ...parts] = relative.split('/');
    const file = version === 'before' && parts[0] !== 'vendor'
      ? `reference/brush-repaint-fix/before/${parts.join('/')}` : `desktop/${parts.join('/')}`;
    await route.fulfill({ contentType: 'text/javascript', body: await readFile(path.join(root, file)) });
  });
  await page.goto('http://brush.test/');
  const images = await page.evaluate(async () => {
    const result = {};
    for (const version of ['before', 'after']) {
      const [{ VideoRenderer }, { RegionMaps }, { DEFAULTS }] = await Promise.all([
        import(`/${version}/renderer/video-renderer.js`), import(`/${version}/shared/regions.js`), import(`/${version}/shared/settings.js`),
      ]);
      const renderer = new VideoRenderer(document.createElement('canvas'));
      const settings = { ...DEFAULTS, liquid: true, opacity: 100, liquidStructure: 50 };
      try {
        renderer.upload(new Uint8Array([24, 29, 26, 255]), 1, 1);
        const capture = (maps, name) => {
          renderer.draw(settings, .7, { regions: maps, editing: true });
          renderer.gl.finish();
          if (renderer.gl.getError()) throw new Error(`${version}: WebGL error`);
          result[`${version}-${name}`] = renderer.canvas.toDataURL();
        };
        const maps = RegionMaps.empty();
        maps.paint('liquid', [.2, .45], [.8, .5], 960, 16 / 9);
        capture(maps, 'initial');
        for (let y = 0; y <= 1; y += .25) maps.paint('liquid', [0, y], [1, y], 480, 16 / 9, true);
        maps.paint('liquid', [.5, .5], [.5, .5], 480, 16 / 9);
        capture(maps, 'repaint');
        for (const diameter of [480, 960, 1440]) {
          const fresh = RegionMaps.empty();
          fresh.paint('liquid', [.5, .5], [.5, .5], diameter, 16 / 9);
          capture(fresh, `size-${diameter}`);
        }
      } finally { renderer.destroy(); }
    }
    return result;
  });
  await mkdir(output, { recursive: true });
  const captures = {};
  for (const [name, url] of Object.entries(images)) {
    const bytes = Buffer.from(url.split(',')[1], 'base64');
    await writeFile(path.join(output, `${name}.png`), bytes);
    captures[name] = hash(bytes);
  }
  if (captures['after-repaint'] !== captures['after-size-480']) throw new Error('Repaint differs from fresh generation');
  if (errors.length) throw new Error(errors.join('\n'));
  const sources = {};
  for (const prefix of ['desktop', 'reference/brush-repaint-fix/before']) {
    for (const file of ['renderer/video-renderer.js', 'shared/regions.js', 'shared/liquid-guides.js']) sources[`${prefix}/${file}`] = hash(await readFile(path.join(root, prefix, file)));
  }
  await writeFile(path.join(output, 'capture-manifest.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), browser: browser.version(), sources,
    settings: { width: 1920, height: 1080, time: .7, background: [24, 29, 26], structure: 50, opacity: 100, glass: false,
      initial: { from: [.2, .45], to: [.8, .5], diameter: 960 },
      erase: { rows: [0, .25, .5, .75, 1], fromX: 0, toX: 1, diameter: 480 },
      repaint: { point: [.5, .5], diameter: 480 }, sizes: [480, 960, 1440] }, captures,
  }, null, 2));
  console.log('Captured matching repaint and brush-size comparisons.');
} finally { await browser.close(); }
