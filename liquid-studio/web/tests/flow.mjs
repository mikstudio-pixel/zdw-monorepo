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
  application = await electron.launch({ executablePath, args: [`${root}tests/browser-host.cjs`], env: { ...process.env, LIQUID_TEST_URL: 'about:blank' } });
  const page = await application.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  // The correct shell must paint even when the main bundle has not loaded.
  await page.route('**/app.js', route => route.abort());
  await page.goto(url);
  for (const selector of ['.app-header', '.settings-panel', '.preview-toolbar', '.drawing-toolbar', '.empty-state h1', '.footer-actions']) {
    assert.equal(await page.locator(selector).isVisible(), false, `${selector} never flashes before startup`);
  }
  assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).backgroundColor), 'rgb(236, 233, 216)');
  await page.screenshot({ path: `${results}startup-mobile.png` });
  await page.goto(`${url}/?editor=1`);
  assert.equal(await page.locator('.app-header').isVisible(), true);
  assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).backgroundColor), 'rgb(16, 20, 18)');
  await page.unroute('**/app.js');
  await page.goto(url);
  checks.push('The XP shell hides the old editor before the app bundle loads; ?editor=1 still opens the full editor');
  await page.waitForFunction(() => document.body.dataset.step === 'liquid' && !document.getElementById('replace-video').disabled && !document.getElementById('brush-options').hidden);
  await page.waitForFunction(() => { const icons = [...document.querySelectorAll('.flow-icon')]; return icons.length === 5 && icons.every(image => image.complete && image.naturalWidth === 16 && image.naturalHeight === 16); });
  assert.equal(await page.getByRole('button', { name: 'Guma', exact: true }).count(), 1);
  checks.push('Supplied 16×16 pixel assets load; icon controls retain accessible names');
  const next = page.locator('#flow-render');
  assert.deepEqual(await page.locator('video').evaluate(video => [video.videoWidth, video.videoHeight]), [1080, 1920]);
  assert.deepEqual(await page.locator('#preview').evaluate(canvas => [canvas.width, canvas.height]), [1080, 1920]);
  checks.push('The portrait demo loads as the default 1080×1920 source and output');
  assert.equal(await next.isDisabled(), false);
  assert.equal(await page.locator('#flow-next, #flow-back').count(), 0);
  for (const [width, height] of [[320, 568], [390, 844], [430, 932], [844, 390], [1440, 1000]]) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => {
      const button = document.getElementById('flow-render').getBoundingClientRect();
      const toolbar = document.querySelector('.flow-top').getBoundingClientRect();
      const tools = document.querySelector('.flow-steps').getBoundingClientRect();
      const eraser = document.querySelector('.flow-eraser-box').getBoundingClientRect();
      const timeline = document.getElementById('flow-timeline').getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        bottom: button.bottom, height: innerHeight, stage: document.getElementById('stage').clientHeight,
        toolbar: toolbar.toJSON(), tools: tools.toJSON(), eraser: eraser.toJSON(), timeline: timeline.toJSON(),
      };
    });
    assert.equal(layout.overflow, false, `No horizontal overflow at ${width}×${height}`);
    assert.ok(layout.bottom <= layout.height, `Next is visible at ${width}×${height}`);
    assert.ok(layout.stage > 60, `Drawing canvas remains usable at ${width}×${height}`);
    if (width <= 600) {
      assert.equal(layout.toolbar.bottom, layout.timeline.top - 12);
      assert.equal(layout.toolbar.right, width - 12);
      assert.ok(layout.eraser.top > layout.tools.bottom);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  checks.push('Responsive layout at 320–1440 px, portrait and landscape; liquid drawing is optional');
  const cdp = await page.context().newCDPSession(page);
  const docks = ['.flow-top', '.flow-files'];
  const dockLayout = () => Promise.all(docks.map(selector => page.locator(selector).getAttribute('data-flow-dock')));
  const centerOf = async selector => {
    const box = await page.locator(selector).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const sendTouch = (type, touchPoints = []) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  const dragDock = async (selector, to, end = 'touchEnd') => {
    const from = await centerOf(selector);
    await sendTouch('touchStart', [from]);
    for (const progress of [.2, .55, 1]) {
      await sendTouch('touchMove', [{ x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress }]);
    }
    assert.equal(await page.locator('.flow-dock-target:visible').count(), 2);
    await sendTouch(end);
    await page.waitForFunction(selectors => !document.querySelector('.flow-dock-target:not([hidden])') &&
      selectors.every(selector => document.querySelector(selector).getAnimations().length === 0), docks);
  };
  const tapDock = async selector => {
    await sendTouch('touchStart', [await centerOf(selector)]);
    await sendTouch('touchEnd');
  };
  await page.waitForFunction(() => document.querySelector('.flow-top').dataset.flowDock === 'bottom-right');
  const defaults = ['bottom-right', 'bottom-left'];
  assert.deepEqual(await dockLayout(), defaults);
  await page.screenshot({ path: `${results}corners-default.png` });
  await page.evaluate(() => {
    window.dockActions = { load: 0, save: 0 };
    window.liquid.chooseVideo = async () => { window.dockActions.load++; return { ok: true, value: null }; };
    window.liquid.exportVideo = async () => { window.dockActions.save++; return { ok: true, value: null }; };
  });
  await dragDock('[data-step-index="1"]', { x: 25, y: 25 });
  assert.deepEqual(await dockLayout(), ['top-left', 'bottom-left']);
  assert.equal(await page.locator('body').getAttribute('data-step'), 'liquid', 'Dragging the toolkit does not choose a tool');
  await dragDock('#replace-video', { x: 25, y: 25 });
  assert.deepEqual(await dockLayout(), ['top-left', 'bottom-left'], 'An occupied corner rejects the drop');
  await dragDock('#flow-render', { x: 365, y: 755 });
  assert.deepEqual(await dockLayout(), ['top-left', 'bottom-right'], 'Dragging save moves the whole file block');
  await dragDock('#replace-video', { x: 365, y: 25 });
  const moved = ['top-left', 'top-right'];
  assert.deepEqual(await dockLayout(), moved);
  await dragDock('#flow-render', { x: 25, y: 755 }, 'touchCancel');
  assert.deepEqual(await dockLayout(), moved);
  assert.deepEqual(await page.evaluate(() => window.dockActions), { load: 0, save: 0 });
  await page.screenshot({ path: `${results}corners-moved.png` });
  await tapDock('[data-step-index="1"]');
  await page.waitForFunction(() => document.body.dataset.step === 'glass');
  await tapDock('#replace-video');
  await tapDock('#flow-render');
  await page.waitForFunction(() => window.dockActions.load === 1 && window.dockActions.save === 1);
  await page.reload();
  await page.waitForFunction(() => document.getElementById('flow-render')?.disabled === false);
  assert.deepEqual(await dockLayout(), moved, 'Corner positions persist across reloads');
  await page.evaluate(() => localStorage.setItem('liquid-studio-corners', '["top-left","top-right","bottom-right"]'));
  await page.reload();
  await page.waitForFunction(() => document.getElementById('flow-render')?.disabled === false);
  assert.deepEqual(await dockLayout(), moved, 'A previous layout docks the grouped buttons at the saved load corner');
  await page.evaluate(() => localStorage.removeItem('liquid-studio-corners'));
  await page.reload();
  await page.waitForFunction(() => document.getElementById('flow-render')?.disabled === false);
  assert.deepEqual(await dockLayout(), defaults);
  checks.push('Touch docks the toolkit and the load/save block, preserves button taps and restores both corners on reload');
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
  await page.locator('[data-step-index="1"]').click();
  await page.waitForFunction(() => document.body.dataset.step === 'glass' && !document.getElementById('flow-render').disabled);
  assert.deepEqual(errors, []);
  const originalSettings = await settings(), maps = new RegionMaps(originalSettings.regions);
  assert.equal(maps.liquidMode, 'area'); assert.equal(maps.liquidPasses.length, 1);
  assert.equal(maps.liquidPasses[0].diameter, 0);
  checks.push('Two edge gestures become one saved area and morph into liquid before glass painting');
  // Undo, redo and repeated drawing must preserve the material exactly.
  await page.locator('[data-step-index="0"]').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#flow-eraser').isVisible(), true);
  await stroke([.12, .08], [.18, .55]);
  await page.locator('#flow-eraser').click();
  await slider('brush-size', 120);
  await stroke([.15, .2], [.15, .4]);
  await page.keyboard.press('Meta+z');
  await page.keyboard.press('Meta+Shift+z');
  await page.keyboard.press('Meta+z');
  await page.locator('[data-step-index="1"]').click();
  await page.waitForFunction(() => !document.getElementById('flow-render').disabled);
  const repainted = await settings();
  assert.equal(JSON.stringify(repainted.regions) === JSON.stringify(originalSettings.regions), true, 'Erase undo/redo restores the original area');
  await page.locator('[data-step-index="2"]').click(); // select palette
  await page.waitForFunction(() => document.body.dataset.step === 'palette' && !document.getElementById('flow-render').disabled);
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
  checks.push('Tool switching, local eraser, undo/redo and repeat painting preserve the saved union');
  await page.locator('[data-flow-palette="1"]').click();
  await page.waitForFunction(() => !document.getElementById('flow-render').disabled);
  const festival = await capturePng();
  assert.notEqual(festival, pastel);
  checks.push('Palette changes the real PNG preview');
  // Return to glass and verify the existing cube editor and selected palette.
  await page.locator('[data-step-index="1"]').click();
  await stroke([.25, .3], [.75, .7]);
  await page.locator('[data-step-index="2"]').click();
  await page.waitForFunction(() => !document.getElementById('flow-render').disabled);
  const withGlass = await settings();
  assert.ok(new RegionMaps(withGlass.regions).layers.glass.some(Boolean));
  assert.deepEqual(withGlass.liquidColors, ['#16533f', '#5c300f', '#9fbaff', '#f8cf49', '#ffa9ef', '#fd3d62', '#16533f']);
  await page.screenshot({ path: `${results}glass-palette-mobile.png` });
  assert.deepEqual(errors, []);
  checks.push('Glass drawing and the selected palette survive tool changes; no uncaught browser errors');
  await page.locator('[data-step-index="0"]').click();
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
  await page.waitForFunction(() => document.getElementById('preview').width === 1080);
  assert.deepEqual(await page.locator('#preview').evaluate(canvas => [canvas.width, canvas.height]), [1080, 1920]);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(.3)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.waitForFunction(() => document.getElementById('preview').width === 1080);
  assert.equal(await page.evaluate(() => window.scrubExports), 0);
  assert.equal(await page.locator('#timeline').isEnabled(), true);
  await page.evaluate(() => window.restoreScrubExport());
  await slider('timeline', 0);
  await page.waitForFunction(() => !document.getElementById('flow-render').disabled && document.querySelector('video').currentTime < .04);
  checks.push('Rapid touch scrubbing keeps the thumb in place and PNG export idle; release/cancel restore full resolution');
  assert.equal(await page.locator('#play').isVisible(), true);
  assert.equal(await page.locator('#timeline').isVisible(), true);
  assert.equal(await page.locator('#timeline-add').isVisible(), true);
  assert.equal(await page.locator('#timeline-toggle, #timeline-actions').count(), 0);
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
  checks.push('Compact timeline supports playback and scrubbing without creating keys; touching the image resumes drawing');
  const seed = await settings();
  const stageBefore = await page.locator('#preview').boundingBox();
  const seek = async frame => {
    await slider('timeline', frame);
    await page.waitForFunction(frame => !document.querySelector('video').seeking && Math.abs(document.querySelector('video').currentTime * 30 - frame) < 1, frame);
  };
  await seek(150);
  const add = await page.locator('#timeline-add').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: add.x + add.width / 2, y: add.y + add.height / 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await next.isDisabled(), false, 'A blank liquid target can advance without drawing');
  const firstTarget = await settings();
  assert.deepEqual(firstTarget.keyframes.map(key => key.frame), [0, 150]);
  assert.deepEqual(new RegionMaps(firstTarget.keyframes[0].effects.regions).snapshot(), new RegionMaps(seed.regions).snapshot(), 'Direct add preserves the initial shape at frame zero');
  assert.deepEqual(await page.locator('#preview').boundingBox(), stageBefore, 'Adding a keyframe does not move the canvas');
  await page.screenshot({ path: `${results}minimal-timeline.png` });
  await slider('brush-size', 180);
  await stroke([.44, .25], [.58, .55]);
  await seek(120);
  const animated = await settings();
  assert.deepEqual(animated.keyframes.map(key => key.frame), [0, 150]);
  assert.notDeepEqual(animated.keyframes[0].effects.regions.liquid, animated.keyframes[1].effects.regions.liquid);
  assert.deepEqual(new RegionMaps(animated.keyframes[0].effects.regions).snapshot(), new RegionMaps(seed.regions).snapshot(), 'Drawing a target does not modify its predecessor');
  const marker = await page.locator('#timeline-markers button').last().boundingBox();
  const compactRange = await page.locator('#timeline').boundingBox();
  await page.mouse.move(marker.x + marker.width / 2, marker.y + marker.height / 2);
  await page.mouse.down();
  await page.mouse.move(compactRange.x + compactRange.width * .5, marker.y + marker.height / 2, { steps: 6 });
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
  assert.equal(await page.locator('#timeline-markers button').count(), 2);
  assert.equal(await page.locator('#timeline-markers button').last().isEnabled(), true);
  assert.equal(await page.locator('#timeline-add').getAttribute('aria-label'), 'Upravit klíčový snímek');
  await page.locator('#timeline-add').click();
  assert.equal(await next.isDisabled(), false, 'Editing an existing target preserves its shape');
  await stroke([.55, .5], [.7, .6]);
  await seek(120);
  const edited = await settings();
  assert.deepEqual(edited.keyframes.map(key => key.frame), [0, 150], 'Editing does not duplicate the selected keyframe');
  assert.notDeepEqual(edited.keyframes[1].effects.regions.liquid, animated.keyframes[1].effects.regions.liquid);
  assert.deepEqual(edited.keyframes[0].effects.regions, animated.keyframes[0].effects.regions);
  assert.deepEqual(errors, []);
  checks.push('Direct touch adds a keyframe and preserves the initial shape; editing existing keys, morphing, playback and marker dragging work without a drawer');
  await page.route('**/assets/zdw-demo-portrait.mp4', route => route.fulfill({ status: 404, body: 'Unavailable' }));
  await page.goto(url);
  await page.waitForFunction(() => document.getElementById('status').classList.contains('error') && !document.getElementById('choose-video').disabled);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#replace-video')]);
  await chooser.setFiles(`${root}assets/zdw-demo.mp4`);
  await page.waitForFunction(() => document.getElementById('file-name').textContent === 'zdw-demo.mp4' && !document.getElementById('brush-options').hidden);
  assert.equal(await page.locator('#replace-video .flow-icon').count(), 1, 'Replacing media preserves the upload icon');
  assert.equal(await next.isDisabled(), false);
  assert.equal(await page.locator('#status').isVisible(), false);
  assert.deepEqual(errors, []);
  checks.push('Failed demo loading recovers through the real file picker into a fresh liquid area');
  // Render must commit an active editor and start video export from any tool.
  for (const index of [0, 1, 2]) {
    await page.locator(`[data-step-index="${index}"]`).click();
    await page.waitForFunction(() => !document.getElementById('flow-render').disabled);
    const called = await page.evaluate(async () => {
      const original = window.liquid.exportVideo;
      let captured;
      window.liquid.exportVideo = async settings => {
        captured = structuredClone(settings);
        return { ok: true, value: { width: 1920, height: 1080, frames: 48, duration: 1.6, path: 'test.mp4' } };
      };
      try { await document.getElementById('flow-render').onclick(); }
      finally { window.liquid.exportVideo = original; document.getElementById('status').hidden = true; }
      return Boolean(captured);
    });
    assert.equal(called, true, `Video render starts from tool ${index}`);
    assert.equal(await next.isDisabled(), false);
  }
  checks.push('Render commits the editor and starts video export from every tool');
  const [imageChooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#replace-video')]);
  await imageChooser.setFiles(`${results}after-render.png`);
  await page.waitForFunction(() => document.body.dataset.mediaType === 'image' && !document.getElementById('flow-render').disabled);
  for (const index of [0, 1, 2]) {
  await page.locator(`[data-step-index="${index}"]`).click();
  await page.waitForFunction(() => !document.getElementById('flow-render').disabled);
  const exported = await page.evaluate(async () => {
    const original = navigator.canShare, share = navigator.share;
    let file;
    navigator.canShare = () => true;
    navigator.share = async ({ files }) => { [file] = files; };
    try {
      await document.getElementById('flow-render').onclick();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const bitmap = await createImageBitmap(file);
      return { type: file.type, width: bitmap.width, height: bitmap.height, signature: Array.from(bytes.slice(0, 8)) };
    } finally { navigator.canShare = original; navigator.share = share; }
  });
  assert.deepEqual(exported, { type: 'image/png', width: 1080, height: 1920, signature: [137, 80, 78, 71, 13, 10, 26, 10] });
  }
  await page.evaluate(async () => {
    const original = navigator.canShare, share = navigator.share;
    navigator.canShare = () => true;
    navigator.share = async () => { throw new DOMException('User cancelled', 'AbortError'); };
    try { await document.getElementById('flow-render').onclick(); }
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
  checks.push('Render saves the current image from each tool; share and download receive a full-resolution PNG');
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
