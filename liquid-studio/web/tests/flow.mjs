import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '../../desktop/node_modules/playwright/index.mjs';
import executablePath from '../../desktop/node_modules/electron/index.js';
import { RegionMaps } from '../../desktop/shared/regions.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const results = `${root}test-results/flow/`;
await mkdir(results, { recursive: true });
const server = spawn(process.execPath, [`${root}scripts/serve.mjs`], { env: { ...process.env, PORT: '0' } });
const url = await new Promise((resolve, reject) => {
  server.stdout.on('data', chunk => { const match = /http:\/\/localhost:\d+/.exec(String(chunk)); if (match) resolve(match[0]); });
  server.once('error', reject); server.once('exit', code => reject(new Error(`Server exited ${code}`)));
});
let application;
const errors = [], checks = [];
try {
  application = await electron.launch({ executablePath, args: [`${root}tests/browser-host.cjs`], env: { ...process.env, LIQUID_TEST_URL: url } });
  const page = await application.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.body.dataset.step === 'liquid' && !document.getElementById('replace-video').disabled && !document.getElementById('brush-options').hidden);
  await page.waitForFunction(() => { const icons = [...document.querySelectorAll('.flow-icon')]; return icons.length === 5 && icons.every(image => image.complete && image.naturalWidth === 16 && image.naturalHeight === 16); });
  assert.equal(await page.getByRole('button', { name: 'Guma', exact: true }).count(), 1);
  checks.push('Supplied 16×16 pixel assets load; icon controls retain accessible names');
  const next = page.locator('#flow-next');
  assert.deepEqual(await page.locator('video').evaluate(video => [video.videoWidth, video.videoHeight]), [1080, 1920]);
  assert.deepEqual(await page.locator('#preview').evaluate(canvas => [canvas.width, canvas.height]), [1080, 1920]);
  checks.push('The portrait demo loads as the default 1080×1920 source and output');
  assert.equal(await next.isDisabled(), true);
  for (const [width, height] of [[320, 568], [390, 844], [430, 932], [844, 390], [1440, 1000]]) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => {
      const button = document.getElementById('flow-next').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > innerWidth, bottom: button.bottom, height: innerHeight, stage: document.getElementById('stage').clientHeight };
    });
    assert.equal(layout.overflow, false, `No horizontal overflow at ${width}×${height}`);
    assert.ok(layout.bottom <= layout.height, `Next is visible at ${width}×${height}`);
    assert.ok(layout.stage > 60, `Drawing canvas remains usable at ${width}×${height}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  checks.push('Responsive layout at 320–1440 px, portrait and landscape; empty liquid cannot advance');
  const slider = (id, value) => page.locator(`#${id}`).evaluate((input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  const stroke = async (from, to) => {
    const rect = await page.locator('#preview').evaluate(canvas => {
      const r = canvas.getBoundingClientRect(), scale = Math.min(r.width / canvas.width, r.height / canvas.height);
      return { x: r.x + (r.width - canvas.width * scale) / 2, y: r.y + (r.height - canvas.height * scale) / 2, width: canvas.width * scale, height: canvas.height * scale };
    });
    await page.mouse.move(rect.x + from[0] * rect.width, rect.y + from[1] * rect.height);
    await page.mouse.down();
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('is-drawing')), true);
    assert.equal(await page.locator('.flow-top').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
    await page.mouse.move(rect.x + to[0] * rect.width, rect.y + to[1] * rect.height, { steps: 16 });
    await page.mouse.up();
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('is-drawing')), false);
  };
  const settings = () => page.evaluate(async () => {
    let captured;
    const original = window.liquid.saveSettings;
    window.liquid.saveSettings = async value => { captured = structuredClone(value); return { ok: true }; };
    try { await document.getElementById('save-settings').onclick(); } finally { window.liquid.saveSettings = original; document.getElementById('status').hidden = true; }
    return captured;
  });
  // Keep the exact same reference strokes, input, frame time and aspect as the
  // original application capture. The screenshots are desktop Chromium QA.
  await slider('brush-size', 480);
  await stroke([.12, .08], [.18, .55]);
  await stroke([.85, .45], [.87, .95]);
  assert.equal(await next.isDisabled(), false);
  await page.screenshot({ path: `${results}area-mobile.png` });
  await next.click();
  await page.waitForFunction(() => document.body.dataset.step === 'glass' && !document.getElementById('flow-next').disabled);
  assert.deepEqual(errors, []);
  const originalSettings = await settings(), maps = new RegionMaps(originalSettings.regions);
  assert.equal(maps.liquidMode, 'area'); assert.equal(maps.liquidPasses.length, 1);
  assert.equal(maps.liquidPasses[0].diameter, 0);
  checks.push('Two edge gestures become one saved area and morph into liquid before glass painting');
  // Undo, redo and repeated drawing must preserve the material exactly.
  await page.locator('#flow-back').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#flow-eraser').isVisible(), true);
  await stroke([.12, .08], [.18, .55]);
  await page.locator('#flow-eraser').click();
  await slider('brush-size', 120);
  await stroke([.15, .2], [.15, .4]);
  await page.keyboard.press('Meta+z');
  await page.keyboard.press('Meta+Shift+z');
  await page.keyboard.press('Meta+z');
  await next.click();
  await page.waitForFunction(() => !document.getElementById('flow-next').disabled);
  const repainted = await settings();
  assert.equal(JSON.stringify(repainted.regions) === JSON.stringify(originalSettings.regions), true, 'Erase undo/redo restores the original area');
  await next.click(); // skip optional glass
  await page.waitForFunction(() => document.body.dataset.step === 'palette' && !document.getElementById('flow-next').disabled);
  await page.screenshot({ path: `${results}after-mobile.png` });
  const capturePng = async () => page.evaluate(async () => {
    const original = window.liquid.exportImage;
    let data;
    window.liquid.exportImage = async value => { data = value; return original(value); };
    try { await document.getElementById('export-image').onclick(); } finally { window.liquid.exportImage = original; document.getElementById('status').hidden = true; }
    return data;
  });
  const pastel = await capturePng();
  await writeFile(`${results}after-render.png`, Buffer.from(pastel.split(',')[1], 'base64'));
  checks.push('Back navigation, local eraser, undo/redo and repeat painting preserve the saved union');
  await page.locator('[data-flow-palette="1"]').click();
  await page.waitForFunction(() => !document.getElementById('flow-next').disabled);
  const festival = await capturePng();
  assert.notEqual(festival, pastel);
  const exported = await page.evaluate(async () => {
    const original = navigator.canShare, share = navigator.share;
    let file;
    navigator.canShare = () => true;
    navigator.share = async ({ files }) => { [file] = files; };
    try {
      await document.getElementById('flow-next').onclick();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const bitmap = await createImageBitmap(file);
      return { type: file.type, width: bitmap.width, height: bitmap.height, signature: Array.from(bytes.slice(0, 8)) };
    } finally { navigator.canShare = original; navigator.share = share; }
  });
  assert.deepEqual(exported, { type: 'image/png', width: 1080, height: 1920, signature: [137, 80, 78, 71, 13, 10, 26, 10] });
  await page.evaluate(async () => {
    const original = navigator.canShare, share = navigator.share;
    navigator.canShare = () => true;
    navigator.share = async () => { throw new DOMException('User cancelled', 'AbortError'); };
    try { await document.getElementById('flow-next').onclick(); }
    finally { navigator.canShare = original; navigator.share = share; }
  });
  assert.equal(await next.isDisabled(), false);
  assert.equal(await page.locator('#status').isVisible(), false);
  const downloaded = application.evaluate(({ BrowserWindow }) => new Promise(resolve => {
    BrowserWindow.getAllWindows()[0].webContents.session.once('will-download', (_event, item) => {
      resolve(item.getFilename()); item.cancel();
    });
  }));
  await next.click();
  assert.match(await downloaded, /-liquid\.png$/);
  checks.push('Palette changes the real PNG; native file share and download fallback receive a full-resolution 1080×1920 PNG');
  // Return to glass and verify the existing cube editor and selected palette.
  await page.locator('#flow-back').click();
  await stroke([.25, .3], [.75, .7]);
  await next.click();
  await page.waitForFunction(() => !document.getElementById('flow-next').disabled);
  const withGlass = await settings();
  assert.ok(new RegionMaps(withGlass.regions).layers.glass.some(Boolean));
  assert.deepEqual(withGlass.liquidColors, ['#16533f', '#5c300f', '#9fbaff', '#f8cf49', '#ffa9ef', '#fd3d62', '#16533f']);
  await page.screenshot({ path: `${results}glass-palette-mobile.png` });
  assert.deepEqual(errors, []);
  checks.push('Glass drawing and the selected palette survive back/forward navigation; no uncaught browser errors');
  const cdp = await page.context().newCDPSession(page);
  await page.evaluate(() => {
    const original = window.liquid.exportImage;
    window.scrubExports = 0;
    window.restoreScrubExport = () => { window.liquid.exportImage = original; };
    window.liquid.exportImage = data => { window.scrubExports++; return original(data); };
  });
  const rangeBox = await page.locator('#timeline').boundingBox();
  const rangeY = rangeBox.y + rangeBox.height / 2;
  const touch = fraction => ({ x: rangeBox.x + 6 + fraction * (rangeBox.width - 12), y: rangeY });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(.15)] });
  for (const fraction of [.7, .25, .85, .4, .7]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(fraction)] });
  await page.waitForFunction(() => !document.querySelector('video').seeking && Math.abs(document.querySelector('video').currentTime * 30 - Number(document.getElementById('timeline').value)) < 1);
  // Hold the finger after decode: the PNG cache must still stay idle.
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 180)));
  assert.equal(await page.evaluate(() => window.scrubExports), 0);
  assert.equal(await page.locator('#timeline').isEnabled(), true);
  assert.ok(await page.locator('#timeline').evaluate(input => Number(input.value) / Number(input.max) > .69));
  assert.deepEqual(await page.locator('#preview').evaluate(canvas => [canvas.width, canvas.height]), [540, 960]);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => window.scrubExports === 1 && !document.getElementById('flow-next').disabled);
  assert.deepEqual(await page.locator('#preview').evaluate(canvas => [canvas.width, canvas.height]), [1080, 1920]);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(.3)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.waitForFunction(() => window.scrubExports === 2 && !document.getElementById('flow-next').disabled);
  assert.equal(await page.locator('#timeline').isEnabled(), true);
  await page.evaluate(() => window.restoreScrubExport());
  await slider('timeline', 0);
  await page.waitForFunction(() => !document.getElementById('flow-next').disabled && document.querySelector('video').currentTime < .04);
  checks.push('Rapid touch scrubbing keeps the thumb in place and PNG export idle; release/cancel restore full resolution and prepare one final PNG');
  const swipe = async direction => {
    const box = await page.locator('#timeline-toggle').boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + direction * 150 * i / 12 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await page.locator('[data-step-index="0"]').click();
  assert.equal(await page.locator('#play').isVisible(), true);
  assert.equal(await page.locator('#timeline').isVisible(), true);
  assert.equal(await page.locator('#timeline-add').isVisible(), false);
  await page.locator('#play').click();
  await page.waitForFunction(() => !document.querySelector('video').paused && document.querySelector('video').currentTime > .3);
  assert.equal(await page.locator('#preview').evaluate(canvas => canvas.classList.contains('painting')), false, 'Compact playback previews the effect, not the editing mask');
  await page.locator('#play').click();
  await slider('timeline', 0);
  await page.waitForFunction(() => !document.querySelector('video').seeking && document.querySelector('video').currentTime < .04);
  assert.equal((await settings()).keyframes, undefined, 'Compact playback does not add keyframes');
  await page.screenshot({ path: `${results}compact-timeline.png` });
  await stroke([.12, .08], [.18, .55]);
  assert.equal(await page.locator('#preview').evaluate(canvas => canvas.classList.contains('painting')), true, 'Drawing resumes directly from compact preview');
  checks.push('Collapsed timeline supports playback and scrubbing without creating keys; touching the image resumes drawing');
  await swipe(-1);
  await page.waitForFunction(() => document.body.dataset.timelineOpen === 'true');
  assert.equal(await page.locator('body').evaluate(body => body.classList.contains('is-drawing')), false);
  const seed = await settings();
  assert.deepEqual(new RegionMaps(seed.keyframes[0].effects.regions).snapshot(), new RegionMaps(withGlass.regions).snapshot(), 'An upward swipe never paints a stray stroke');
  await page.screenshot({ path: `${results}minimal-timeline.png` });
  const seek = async frame => {
    await slider('timeline', frame);
    await page.waitForFunction(frame => !document.querySelector('video').seeking && Math.abs(document.querySelector('video').currentTime * 30 - frame) < 1, frame);
  };
  await seek(150);
  await page.locator('#timeline-add').click();
  await page.waitForFunction(() => document.body.dataset.timelineOpen === 'false');
  assert.equal(await next.isDisabled(), true, 'A new target starts with a blank liquid area');
  await slider('brush-size', 180);
  await stroke([.44, .25], [.58, .55]);
  await swipe(-1);
  const animated = await settings();
  assert.deepEqual(animated.keyframes.map(key => key.frame), [0, 150]);
  assert.notDeepEqual(animated.keyframes[0].effects.regions.liquid, animated.keyframes[1].effects.regions.liquid);
  assert.deepEqual(new RegionMaps(animated.keyframes[0].effects.regions).snapshot(), new RegionMaps(seed.keyframes[0].effects.regions).snapshot(), 'Drawing a target does not modify its predecessor');
  const marker = await page.locator('#timeline-markers button').last().boundingBox();
  const expandedRange = await page.locator('#timeline').boundingBox();
  await page.mouse.move(marker.x + marker.width / 2, marker.y + marker.height / 2);
  await page.mouse.down();
  await page.mouse.move(expandedRange.x + expandedRange.width * .5, marker.y + marker.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector('video').seeking && Number(document.getElementById('timeline').value) > Number(document.getElementById('timeline').max) * .45);
  assert.ok(await page.locator('#timeline').evaluate(input => Number(input.value) > Number(input.max) * .45), 'Dragging from a marker does not snap back to its click action');
  await seek(120);
  const intermediate = await capturePng();
  await seek(150);
  const targetPng = await capturePng();
  assert.notEqual(intermediate, targetPng);
  await page.locator('#play').click();
  await page.waitForFunction(() => !document.querySelector('video').paused && document.querySelector('video').currentTime > 5.2);
  await page.locator('#play').click();
  await seek(150);
  await swipe(1);
  await page.waitForFunction(() => document.body.dataset.timelineOpen === 'false');
  assert.equal(await page.locator('#timeline-markers button').count(), 2);
  assert.equal(await page.locator('#timeline-markers button').last().isEnabled(), true);
  assert.equal(await page.locator('#timeline-add').isVisible(), false);
  await slider('timeline', 120);
  await page.waitForFunction(() => !document.querySelector('video').seeking && Math.abs(document.querySelector('video').currentTime - 4) < .04);
  await page.locator('#timeline-toggle').click();
  await page.waitForFunction(() => document.body.dataset.timelineOpen === 'true');
  await seek(150);
  await page.locator('#timeline-remove').click();
  assert.deepEqual((await settings()).keyframes.map(key => key.frame), [0]);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#timeline-toggle').getAttribute('aria-expanded'), 'false');
  assert.deepEqual(errors, []);
  checks.push('Real touch swipes open and close the timeline without painting; distinct target shapes, playback, seeking, deletion and keyboard dismissal work');
  await page.route('**/assets/zdw-demo-portrait.mp4', route => route.fulfill({ status: 404, body: 'Unavailable' }));
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById('status').classList.contains('error') && !document.getElementById('choose-video').disabled);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#replace-video')]);
  await chooser.setFiles(`${root}assets/zdw-demo.mp4`);
  await page.waitForFunction(() => document.getElementById('file-name').textContent === 'zdw-demo.mp4' && !document.getElementById('brush-options').hidden);
  assert.equal(await page.locator('#replace-video .flow-icon').count(), 1, 'Replacing media preserves the upload icon');
  assert.equal(await next.isDisabled(), true);
  assert.equal(await page.locator('#status').isVisible(), false);
  assert.deepEqual(errors, []);
  checks.push('Failed demo loading recovers through the real file picker into a fresh liquid area');
  // A labelled contact sheet of actual captures, without altering their pixels.
  const images = await Promise.all(['before-mobile', 'after-mobile', 'before-render', 'after-render'].map(async name => {
    try { return `data:image/png;base64,${(await readFile(`${results}${name}.png`)).toString('base64')}`; } catch { return null; }
  }));
  if (images.every(Boolean)) {
    await page.goto('about:blank');
    await page.setViewportSize({ width: 780, height: 1060 });
    await page.setContent(`<style>body{margin:0;background:#101412;color:#edf1e9;font:14px system-ui}h1{font-size:18px;margin:20px 24px 5px}p{color:#aab7a4;margin:5px 24px 14px;font-size:11px}.row{display:flex;justify-content:center;gap:24px}.item{width:340px;text-align:center}h2{font-size:13px;font-weight:500}img{display:block;margin:auto;height:500px;max-width:100%}.render img{height:400px}</style><h1>Liquid Studio · původní a nový průchod</h1><p>Desktop Chromium, viewport 390 × 844 · stejné video v 0 s · 9:16 · dva tahy 480 px</p><div class="row">${images.slice(0, 2).map((src, i) => `<div class="item"><h2>${i ? 'Nové mobilní flow' : 'Původní editor'}</h2><img src="${src}"></div>`).join('')}</div><div class="row render">${images.slice(2).map((src, i) => `<div class="item"><h2>${i ? 'Jedna oblast · stálé měřítko' : 'Samostatné liquidové tahy'}</h2><img src="${src}"></div>`).join('')}</div>`);
    await page.screenshot({ path: `${results}comparison.png`, fullPage: true });
  }
  await writeFile(`${results}checks.json`, JSON.stringify({ success: true, platform: 'desktop Chromium with resized viewport, not a physical phone', checks }, null, 2));
  console.log(checks.join('\n'));
} finally { await application?.close(); server.kill(); }
