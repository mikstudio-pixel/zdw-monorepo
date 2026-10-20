// Offline GPU fixture capture; does not drive the user's browser or change settings.
import { chromium } from '../desktop/node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'public/liquid-compare');
const hash = data => createHash('sha256').update(data).digest('hex');
const errors = [];
const frames = process.env.LIQUID_CAPTURE_FRAMES ? process.env.LIQUID_CAPTURE_FRAMES.split(',').map(Number) : Array.from({ length: 181 }, (_, i) => i);
if (!frames.includes(0) || frames.some(frame => !Number.isInteger(frame) || frame < 0 || frame > 180)) throw new Error('Capture frames must include 0 and be integers from 0 to 180.');
const browser = await chromium.launch({ headless: true, executablePath: process.env.LIQUID_BROWSER || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://liquid.test/**', async route => {
    const relative = new URL(route.request().url()).pathname.slice(1);
    if (!relative) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0"><canvas id="web" style="width:1920px;height:1080px"></canvas><canvas id="studio"></canvas></body></html>' });
    if (!/^(src|desktop\/(renderer|vendor|shared))\/[\w/-]+\.js$/.test(relative)) return route.abort();
    await route.fulfill({ contentType: 'text/javascript', body: await readFile(path.join(root, relative)) });
  });
  await page.goto('http://liquid.test/');
  await page.evaluate(async () => {
    const [{ LiquidRenderer }, { PointerField }, { LiquidBirths }, { VideoRenderer }, { DEFAULTS }] = await Promise.all([
      import('/src/renderer.js'), import('/src/pointer-field.js'), import('/src/liquid-births.js'),
      import('/desktop/renderer/video-renderer.js'), import('/desktop/shared/settings.js'),
    ]);
    const web = new LiquidRenderer(document.querySelector('#web'));
    const studio = new VideoRenderer(document.querySelector('#studio'));
    studio.upload(new Uint8Array([0, 0, 0, 255]), 1, 1);
    const state = {
      mode: 'procedural', pointer: [.5, .5], background: [0, 0, 0], time: 0, interaction: false,
      pointerStrength: 0, glass: false, size: 146, zoom: 100, blur: 0, strength: 0,
      aberration: 0, repelStrength: 165, field: new PointerField(), births: new LiquidBirths(),
    };
    const settings = { ...DEFAULTS, liquid: true, opacity: 100, strength: 0, blur: 0, aberration: 0 };
    window.captureLiquid = (frame) => {
      state.time = frame / 30;
      web.draw(state); web.gl.finish();
      const a = web.canvas.toDataURL('image/png');
      if (web.gl.getError()) throw new Error('Web renderer GL error');
      studio.draw(settings, frame / 30); studio.gl.finish();
      const b = studio.canvas.toDataURL('image/png');
      if (studio.gl.getError()) throw new Error('Studio renderer GL error');
      if (web.canvas.width !== 1920 || web.canvas.height !== 1080) throw new Error('Unexpected canvas dimensions');
      return { web: a, studio: b };
    };
  });
  for (const name of ['web', 'studio']) await mkdir(path.join(output, name), { recursive: true });
  const captures = [];
  for (const frame of frames) {
    const result = await page.evaluate(frame => window.captureLiquid(frame), frame);
    const record = { frame, time: frame / 30 };
    for (const name of ['web', 'studio']) {
      const bytes = Buffer.from(result[name].split(',')[1], 'base64');
      await writeFile(path.join(output, name, `frame-${String(frame).padStart(4, '0')}.png`), bytes);
      record[name] = hash(bytes);
    }
    captures.push(record);
    if (frame % 30 === 0) console.log(`Captured frame ${frame}/180`);
  }
  const repeated = await page.evaluate(() => window.captureLiquid(0));
  for (const name of ['web', 'studio']) {
    if (hash(Buffer.from(repeated[name].split(',')[1], 'base64')) !== captures.find(record => record.frame === 0)[name]) throw new Error(`Non-deterministic ${name} capture`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  const sourceFiles = ['src/shaders.js', 'src/renderer.js', 'src/liquid-source.js', 'src/liquid-definition.js', 'src/liquid-deformation.js', 'desktop/vendor/shaders.js', 'desktop/vendor/liquid-source.js', 'desktop/vendor/liquid-definition.js', 'desktop/vendor/liquid-deformation.js', 'desktop/renderer/video-renderer.js', 'desktop/shared/settings.js'];
  const sources = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, hash(await readFile(path.join(root, file)))])));
  await writeFile(path.join(output, frames.length === 181 ? 'capture-manifest.json' : 'capture-probe.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), browser: browser.version(), width: 1920, height: 1080,
    fps: 30, settings: 'Black background, no glass, no pointer, opacity 100%, Studio structure 50; no custom brush regions.',
    sources, captures, repeatable: true, errors,
  }, null, 2));
} finally { await browser.close(); }
