import { chromium } from '../desktop/node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'public/liquid-object-eraser');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('http://brush.test/**', async route => {
    const relative = new URL(route.request().url()).pathname.slice(1);
    if (!relative) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
    if (!/^(before|after)\/(renderer|vendor|shared)\/[\w/-]+\.js$/.test(relative)) return route.abort();
    const [version, ...parts] = relative.split('/');
    const file = version === 'before' && parts[0] !== 'vendor'
      ? `reference/liquid-object-eraser/before/${parts.join('/')}` : `desktop/${parts.join('/')}`;
    await route.fulfill({ contentType: 'text/javascript', body: await readFile(path.join(root, file)) });
  });
  await page.goto('http://brush.test/');
  const result = await page.evaluate(async () => {
    const [{ VideoRenderer: After }, { RegionMaps: Maps }, { DEFAULTS }, { VideoRenderer: Before }, { RegionMaps: OldMaps }] = await Promise.all([
      import('/after/renderer/video-renderer.js'), import('/after/shared/regions.js'), import('/after/shared/settings.js'),
      import('/before/renderer/video-renderer.js'), import('/before/shared/regions.js'),
    ]);
    const maps = Maps.empty(), settings = { ...DEFAULTS, liquid: true, opacity: 100 }, images = {};
    for (const [from, to] of [[[.15, .5], [.35, .5]], [[.68, .5], [.84, .5]]]) {
      maps.beginLiquidStroke(); maps.paint('liquid', from, to, 480, 16 / 9);
    }
    const beforeMaps = new OldMaps(maps.serialize()), renderers = { before: new Before(document.createElement('canvas')), after: new After(document.createElement('canvas')) };
    const capture = (renderer, regions) => {
      renderer.draw(settings, .7, { regions, editing: true }); renderer.gl.finish();
      if (renderer.gl.getError()) throw new Error('WebGL error');
      return renderer.canvas.toDataURL();
    };
    try {
      for (const renderer of Object.values(renderers)) renderer.upload(new Uint8Array([24, 29, 26, 255]), 1, 1);
      images.initial = capture(renderers.after, maps);
      if (images.initial !== capture(renderers.before, beforeMaps)) throw new Error('Initial scenes must match exactly');
      const coverage = renderers.after.liquidCoverage(settings, .7, maps);
      const candidates = [];
      for (let y = 45; y < 467; y++) for (let x = 45; x < 230; x++) {
        if (coverage[0].alpha[y * 512 + x] > 200) candidates.push({ x, y, d: Math.hypot((x / 512 - .25) * 16 / 9, y / 512 - .5) });
      }
      candidates.sort((a, b) => a.d - b.d);
      const hit = candidates.find(({ x, y }) => {
        for (let dy = -40; dy <= 40; dy++) for (let dx = -40; dx <= 40; dx++) if (coverage[1].alpha[(y + dy) * 512 + x + dx]) return false;
        return true;
      });
      if (!hit) throw new Error('No isolated eraser target');
      const point = [(hit.x + .5) / 512, (hit.y + .5) / 512];
      beforeMaps.paint('liquid', point, point, 160, 16 / 9, true);
      maps.eraseLiquid(point, point, 160, 16 / 9, coverage);
      images.before = capture(renderers.before, beforeMaps);
      images.after = capture(renderers.after, maps);
      if (maps.liquidPasses.length !== 1) throw new Error('Wrong object removed');
      return { images, point };
    } finally { Object.values(renderers).forEach(renderer => renderer.destroy()); }
  });
  if (errors.length) throw new Error(errors.join('\n'));
  await mkdir(output, { recursive: true });
  const captures = {}, sources = {};
  for (const [name, url] of Object.entries(result.images)) {
    const bytes = Buffer.from(url.split(',')[1], 'base64');
    await writeFile(path.join(output, `${name}.png`), bytes); captures[name] = hash(bytes);
  }
  for (const prefix of ['desktop', 'reference/liquid-object-eraser/before']) {
    for (const file of ['renderer/video-renderer.js', 'shared/regions.js', 'shared/liquid-guides.js']) sources[`${prefix}/${file}`] = hash(await readFile(path.join(root, prefix, file)));
  }
  await writeFile(path.join(output, 'capture-manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), browser: browser.version(), sources, captures,
    settings: { width: 1920, height: 1080, time: .7, structure: 50, opacity: 100, brush: 480,
      strokes: [[.15, .5, .35, .5], [.68, .5, .84, .5]], erase: { point: result.point, diameter: 160 } } }, null, 2));
  console.log('Captured identical initial scene and the same eraser gesture before/after.');
} finally { await browser.close(); }
