import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { command, binaries, probe } from '../main/media.js';
import { verifyGuidedLiquid } from './liquid-visual.mjs';
import { verifyLiquidStructure } from './liquid-structure.mjs';
import { verifyLiquidRepaint } from './liquid-repaint.mjs';
import { verifyLiquidObjects } from './liquid-objects.mjs';
import { RegionMaps } from '../shared/regions.js';
import { verifyExtensions } from './extensions.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const results = join(root, 'test-results');
await mkdir(results, { recursive: true });
const { ffmpeg, ffprobe } = binaries();
const input = join(results, 'sync fixture.mp4');
// Audio starts 200 ms after video; its pulse and the white video flash both
// occur at 800 ms on the common timeline. This detects independent PTS resets.
await command(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', "testsrc2=size=320x180:rate=30:duration=1.6,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(t,0.8,0.89)'", '-itsoffset', '0.2', '-f', 'lavfi', '-i', "aevalsrc=0.5*sin(2*PI*1000*t)*between(t\\,0.6\\,0.69):s=48000:d=1.4", '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', input], { stdout: 'ignore' }).done;
let application;
const report = { checks: [], metrics: {} };
const errors = [];
const log = message => { console.log(message); report.checks.push(message); };
async function bytes(args) {
  const job = command(ffmpeg, args), chunks = [];
  for await (const chunk of job.child.stdout) chunks.push(chunk);
  await job.done; return Buffer.concat(chunks);
}
try {
  application = await electron.launch({
    ...(process.env.LIQUID_TEST_EXECUTABLE ? { executablePath: process.env.LIQUID_TEST_EXECUTABLE } : {}),
    args: [...(process.env.LIQUID_TEST_EXECUTABLE ? [] : [root]), `--user-data-dir=${join(results, 'electron-profile')}`], cwd: root, timeout: 60000, env: { ...process.env },
  });
  application.process().stderr.on('data', chunk => { const message = chunk.toString(); if (message.includes('Error')) console.error(message); });
  await application.evaluate(({ dialog }) => {
    globalThis.testOpen = null; globalThis.testSave = null;
    dialog.showOpenDialog = async () => ({ canceled: !globalThis.testOpen, filePaths: globalThis.testOpen ? [globalThis.testOpen] : [] });
    dialog.showSaveDialog = async () => ({ canceled: !globalThis.testSave, filePath: globalThis.testSave });
  });
  const page = await application.firstWindow();
  const slider = (id, value) => page.locator(id).evaluate((element, next) => { element.value = String(next); element.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForSelector('#choose-video');
  await page.screenshot({ path: join(results, '01-empty.png') });
  assert.equal(await page.locator('#status.error').count(), 0);
  // Real pixels catch missing lighting uniforms and unintended tile zoom,
  // which source-file equality and preview/export comparisons cannot detect.
  const glass = await page.evaluate(async () => {
    const { VideoRenderer } = await import('./video-renderer.js');
    const { DEFAULTS } = await import('../shared/settings.js');
    const renderer = new VideoRenderer(document.createElement('canvas'));
    try {
      const width = 1920, height = 1080, source = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        source[i] = x % 256; source[i + 1] = y % 256;
        source[i + 2] = ((x >> 4) + (y >> 4)) % 2 ? 200 : 40; source[i + 3] = 255;
      }
      renderer.upload(source, width, height);
      renderer.draw({ ...DEFAULTS, strength: 0 }, 0);
      let maxIdentityError = 0;
      renderer.readPixels().forEach((value, i) => { maxIdentityError = Math.max(maxIdentityError, Math.abs(value - source[i])); });
      for (let i = 0; i < source.length; i += 4) { source[i] = 96; source[i + 1] = 96; source[i + 2] = 96; }
      renderer.upload(source, width, height);
      renderer.draw(DEFAULTS, 0);
      let min = 255, max = 0, shadedPixels = 0;
      const pixels = renderer.readPixels();
      for (let i = 0; i < pixels.length; i += 4) {
        min = Math.min(min, pixels[i]); max = Math.max(max, pixels[i]);
        if (Math.abs(pixels[i] - 96) > 2) shadedPixels++;
      }
      return { maxIdentityError, min, max, shadedPixels };
    } finally { renderer.destroy(); }
  });
  assert.ok(glass.maxIdentityError <= 1, `Zero-strength glass must preserve composition: ${JSON.stringify(glass)}`);
  assert.ok(glass.min < 94 && glass.max > 98 && glass.shadedPixels > 1000, `Glass highlights/shadows must remain visible: ${JSON.stringify(glass)}`);
  report.metrics.glass = glass;
  log('Updated glass preserves zero-strength composition and renders highlights/shadows');
  const regionPixels = await page.evaluate(async () => {
    const { VideoRenderer } = await import('./video-renderer.js');
    const { DEFAULTS } = await import('../shared/settings.js');
    const { RegionMaps } = await import('../shared/regions.js');
    const renderer = new VideoRenderer(document.createElement('canvas'));
    try {
      const width = 1920, height = 1080, source = new Uint8Array(width * height * 4);
      for (let i = 0; i < source.length; i += 4) source.set([96, 110, 130, 255], i);
      renderer.upload(source, width, height);
      const maps = RegionMaps.empty(), settings = { ...DEFAULTS, liquid: true };
      renderer.draw(settings, 0, { regions: maps });
      const empty = renderer.readPixels().slice();
      maps.paint('glass', [.6, .2], [.85, .3], 300, width / height);
      maps.paint('liquid', [.15, .72], [.35, .8], 300, width / height);
      renderer.draw(settings, 0, { regions: maps });
      const first = renderer.readPixels().slice();
      renderer.draw(settings, 1, { regions: maps });
      const next = renderer.readPixels().slice();
      renderer.draw(settings, 0, { regions: maps, editing: true });
      const edit = renderer.readPixels().slice();
      renderer.draw({ ...settings, regions: maps.serialize() }, 0);
      const committed = renderer.readPixels();
      let emptyError = 0, outsideError = 0, roundtripError = 0, animated = 0, guidePixels = 0, glassPixels = 0, liquidPixels = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        for (let c = 0; c < 3; c++) {
          emptyError = Math.max(emptyError, Math.abs(empty[i + c] - source[i + c]));
          roundtripError = Math.max(roundtripError, Math.abs(committed[i + c] - first[i + c]));
          if (x < width * .1 && y < height * .3) outsideError = Math.max(outsideError, Math.abs(first[i + c] - source[i + c]));
        }
        if (Math.abs(first[i] - next[i]) > 2) animated++;
        if (Math.abs(first[i] - edit[i]) > 2) guidePixels++;
        if (y < height * .5 && Math.abs(first[i] - source[i]) > 2) glassPixels++;
        if (y > height * .5 && Math.abs(first[i] - source[i]) > 2) liquidPixels++;
      }
      const legacy = renderer.editableRegions(DEFAULTS, .7);
      const legacyCounts = ['glass', 'liquid'].map(layer => legacy.layers[layer].filter(value => value > 127).length);
      renderer.draw(DEFAULTS, .7);
      const legacyOriginal = renderer.readPixels().slice();
      renderer.draw(DEFAULTS, .7, { regions: legacy });
      let legacyGlassError = 0;
      renderer.readPixels().forEach((value, i) => { legacyGlassError = Math.max(legacyGlassError, Math.abs(value - legacyOriginal[i])); });
      return { emptyError, outsideError, roundtripError, animated, guidePixels, glassPixels, liquidPixels, legacyCounts, legacyGlassError };
    } finally { renderer.destroy(); }
  });
  assert.ok(regionPixels.emptyError <= 1 && regionPixels.outsideError <= 1 && regionPixels.roundtripError === 0, JSON.stringify(regionPixels));
  for (const key of ['animated', 'guidePixels', 'glassPixels', 'liquidPixels']) assert.ok(regionPixels[key] > 1000, `${key}: ${JSON.stringify(regionPixels)}`);
  assert.ok(regionPixels.legacyCounts.every(count => count > 1000) && regionPixels.legacyGlassError <= 1, JSON.stringify(regionPixels));
  report.metrics.regions = regionPixels;
  log('Region GPU checks: empty/outside areas preserved, both effects placed, liquid animates, saved masks match exactly, editor guides stay separate');
  report.metrics.guidedLiquid = await verifyGuidedLiquid(page, results);
  report.metrics.liquidStructure = await verifyLiquidStructure(page, results);
  report.metrics.liquidRepaint = await verifyLiquidRepaint(page, results);
  report.metrics.liquidObjects = await verifyLiquidObjects(page);
  log('Guided liquid: irregular connected rings, holes, overflow, smooth animation, reproducible seeking and persistent overflow erasure');
  await application.evaluate((_electron, path) => { globalThis.testOpen = path; }, input);
  await page.click('#choose-video');
  await page.waitForFunction(() => !document.getElementById('preview').hidden && !document.getElementById('export').disabled, null, { timeout: 60000 });
  log('Import via native file picker: ready, 48 frames, synchronized audio');
  assert.match(await page.locator('#file-info').innerText(), /se zvukem/);
  await page.click('[data-preset="festival"]');
  await slider('#blur', 3);
  // Real pointer strokes, editing confirmation, independent layers and eraser.
  const stroke = async (from, to) => {
    const bounds = await page.locator('#preview').evaluate(canvas => {
      const r = canvas.getBoundingClientRect(), scale = Math.min(r.width / canvas.width, r.height / canvas.height);
      const width = canvas.width * scale, height = canvas.height * scale;
      return { x: r.x + (r.width - width) / 2, y: r.y + (r.height - height) / 2, width, height };
    });
    await page.mouse.move(bounds.x + from[0] * bounds.width, bounds.y + from[1] * bounds.height);
    await page.mouse.down();
    await page.mouse.move(bounds.x + to[0] * bounds.width, bounds.y + to[1] * bounds.height, { steps: 14 });
    await page.mouse.up();
  };
  await page.click('[data-tool="glass"]');
  assert.equal(await page.locator('#export').isDisabled(), true);
  await stroke([.18, .25], [.82, .68]);
  await page.click('#undo-region');
  assert.equal(await page.locator('#undo-region').isDisabled(), true);
  await page.click('#redo-region');
  await page.click('[data-tool="liquid"]');
  assert.equal(await page.locator('#brush-size').getAttribute('min'), '60');
  assert.equal(await page.locator('#brush-size').inputValue(), '180');
  await slider('#brush-size', 20);
  assert.equal(await page.locator('#brush-size').inputValue(), '60', 'Liquid supports fine strokes down to 60 px');
  await slider('#brush-size', 960);
  await page.click('[data-tool="glass"]');
  assert.equal(await page.locator('#brush-size').inputValue(), '240', 'Glass keeps its own fine brush');
  await page.click('[data-tool="liquid"]');
  assert.equal(await page.locator('#brush-size').inputValue(), '960', 'Liquid remembers its size across tools');
  await slider('#brush-size', 480);
  await stroke([.25, .67], [.77, .33]);
  await stroke([.15, .12], [.25, .12]);
  await page.click('#apply-regions');
  const objectsFile = join(results, 'objects-before-erase.json');
  await application.evaluate((_electron, path) => { globalThis.testSave = path; }, objectsFile);
  await page.click('#save-settings');
  await page.waitForFunction(() => document.getElementById('status-title').textContent === 'Nastavení je uložené');
  const objectsBefore = JSON.parse(await readFile(objectsFile, 'utf8')).settings;
  assert.equal(objectsBefore.regions.liquid.length, 2, 'Two real same-size pointer gestures stay separate');
  await page.click('#dismiss');
  const erasePoint = await page.evaluate(async settings => {
    const { VideoRenderer } = await import('./video-renderer.js');
    const { RegionMaps } = await import('../shared/regions.js');
    const renderer = new VideoRenderer(document.createElement('canvas'));
    try {
      renderer.upload(new Uint8Array([24, 29, 26, 255]), 1, 1);
      const maps = new RegionMaps(settings.regions);
      const coverage = renderer.liquidCoverage(settings, document.querySelector('video').currentTime, maps);
      for (let y = 12; y < 500; y++) for (let x = 12; x < 500; x++) {
        const i = y * 512 + x;
        if (coverage[0].alpha[i] < 200) continue;
        let isolated = true;
        for (let dy = -8; dy <= 8 && isolated; dy++) for (let dx = -8; dx <= 8; dx++) {
          if (coverage[1].alpha[(y + dy) * 512 + x + dx] > 0) { isolated = false; break; }
        }
        if (isolated) return [(x + .5) / 512, (y + .5) / 512];
      }
      throw new Error('No isolated point on the first liquid object');
    } finally { renderer.destroy(); }
  }, objectsBefore);
  await page.click('[data-tool="erase"]');
  await page.selectOption('#erase-layer', 'liquid');
  await slider('#brush-size', 20);
  await stroke(erasePoint, erasePoint);
  await page.click('#undo-region');
  await page.click('#redo-region');
  // Regression: painting after the eraser creates a fresh uncut surface.
  await page.click('[data-tool="liquid"]');
  await slider('#brush-size', 960);
  await stroke([.55, .5], [.65, .5]);
  await page.click('#undo-region');
  await page.click('#redo-region');
  await page.screenshot({ path: join(results, '02-brushes.png') });
  await page.click('#apply-regions');
  assert.equal(await page.locator('#export').isEnabled(), true);
  await slider('#liquidStructure', 72);
  await page.click('[data-aspect="9:16"]');
  await slider('#cropX', 72);
  await page.screenshot({ path: join(results, '02-portrait.png') });
  // Exact settings round-trip through the real IPC and filesystem boundary.
  const settingsFile = join(results, 'saved.liquid.json');
  await application.evaluate((_electron, path) => { globalThis.testSave = path; }, settingsFile);
  await page.click('#save-settings');
  await page.waitForFunction(() => document.getElementById('status-title').textContent === 'Nastavení je uložené');
  const saved = JSON.parse(await readFile(settingsFile, 'utf8'));
  assert.equal(saved.version, 4);
  assert.equal(saved.settings.liquidStructure, 72);
  const savedMaps = new RegionMaps(saved.settings.regions);
  const glassMask = savedMaps.layers.glass, liquidMask = savedMaps.layers.liquid;
  assert.equal(glassMask.length, 512 * 512); assert.equal(liquidMask.length, 512 * 512);
  assert.ok(glassMask.some(value => value === 255) && liquidMask.some(value => value === 255));
  assert.deepEqual(saved.settings.regions.liquid[0], objectsBefore.regions.liquid[1], 'The whole first stroke is removed while the second stays unchanged');
  assert.ok(savedMaps.liquidPasses.every(pass => !pass.erase.some(Boolean)), 'The object eraser never creates partial cut masks');
  assert.equal(glassMask[256 * 512 + 256], 255, 'Liquid eraser preserves glass');
  assert.equal(savedMaps.liquidPasses.length, 2, 'Repainting survives the real tool switch, undo/redo and file save');
  assert.equal(savedMaps.liquidPasses[1].diameter, 960);
  assert.equal(savedMaps.liquidPasses[1].erase.some(Boolean), false);
  await page.click('#dismiss');
  await page.click('[data-tool="glass"]');
  await page.click('#clear-region');
  await page.click('#discard-regions');
  await page.click('#save-settings');
  await page.waitForFunction(() => document.getElementById('status-title').textContent === 'Nastavení je uložené' && !document.getElementById('status').hidden);
  assert.deepEqual(JSON.parse(await readFile(settingsFile, 'utf8')), saved, 'Cancelled region edits never replace committed masks');
  log('Brushes, separate eraser, undo/redo, confirmation, discard and mask save/load passed');
  assert.equal(saved.settings.cropX, 72); assert.equal(saved.settings.aspect, '9:16');
  await page.click('#reset');
  await application.evaluate((_electron, path) => { globalThis.testOpen = path; }, settingsFile);
  await page.click('#load-settings');
  await page.waitForFunction(() => document.getElementById('cropX').value === '72');
  assert.equal(await page.locator('#blur').inputValue(), '3');
  assert.equal(await page.locator('#liquidStructure').inputValue(), '72');
  log('Preset, controls, portrait crop and save/load settings round-trip');
  // Invalid settings report an error and leave the current composition intact.
  const invalid = join(results, 'invalid.json'); await writeFile(invalid, '{"version":99}');
  await application.evaluate((_electron, path) => { globalThis.testOpen = path; }, invalid);
  await page.click('#load-settings');
  await page.waitForSelector('#status.error');
  assert.equal(await page.locator('#cropX').inputValue(), '72');
  await page.click('#dismiss');
  const cancelledPath = join(results, 'cancelled.mp4');
  await writeFile(cancelledPath, 'existing destination must survive cancellation');
  await application.evaluate((_electron, path) => { globalThis.testSave = path; }, cancelledPath);
  await page.click('#export');
  await page.waitForFunction(() => document.getElementById('status-message').textContent.startsWith('Snímek'), null, { timeout: 60000 });
  await page.click('#cancel');
  await page.waitForFunction(() => !document.getElementById('export').disabled, null, { timeout: 30000 });
  assert.equal(await readFile(cancelledPath, 'utf8'), 'existing destination must survive cancellation');
  assert.ok(!(await readdir(results)).some(name => name.includes('.partial.mp4')));
  log('Cancellation reaps export and preserves the existing destination; no partial file');
  await page.click('#dismiss');
  await page.locator('.settings-panel').evaluate(element => { element.scrollTop = 0; });
  // Preview playback must advance in frame timestamps with a moving liquid.
  await page.click('[data-aspect="16:9"]'); await page.click('#center-crop');
  for (const structure of [saved.settings.liquidStructure, 0]) {
    await slider('#liquidStructure', structure); await slider('#timeline', 0);
    await page.waitForFunction(() => !document.querySelector('video').seeking);
    await page.evaluate(() => {
      window.testPresentationTimes = [];
      const video = document.querySelector('video');
      const record = (_now, metadata) => {
        window.testPresentationTimes.push(metadata.mediaTime);
        if (!video.ended) window.testFrameCallback = video.requestVideoFrameCallback(record);
      };
      window.testFrameCallback = video.requestVideoFrameCallback(record);
    });
    await page.click('#play');
    await page.waitForFunction(() => document.querySelector('video').ended);
    const presentationTimes = await page.evaluate(() => {
      document.querySelector('video').cancelVideoFrameCallback(window.testFrameCallback);
      return window.testPresentationTimes;
    });
    const maxGap = Math.max(...presentationTimes.slice(1).map((time, i) => time - presentationTimes[i]));
    report.metrics[`preview_${structure}`] = { frames: presentationTimes.length, maxGap };
    assert.ok(presentationTimes.length >= 45 && maxGap < .068, `Preview at structure ${structure}: ${presentationTimes.length} frames, max gap ${maxGap}`);
    log(`Live preview at structure ${structure}: ${presentationTimes.length} frames, maximum gap ${(maxGap * 1000).toFixed(2)} ms`);
  }
  await slider('#liquidStructure', saved.settings.liquidStructure);
  const comparisonFrames = [0, 15, 24, 40];
  const previews = new Map();
  const settings = { ...saved.settings, aspect: '16:9', cropX: 50, cropY: 50, cropZoom: 100 };
  // Read actual HTMLVideoElement textures through the shared production renderer.
  for (const index of comparisonFrames) {
    await slider('#timeline', index);
    await page.waitForFunction(index => { const video = document.querySelector('video'); return !video.seeking && Math.abs(video.currentTime - index / 30) < .001; }, index);
    const samples = await page.evaluate(async ({ settings, index }) => {
      const { VideoRenderer } = await import('./video-renderer.js');
      const canvas = document.createElement('canvas');
      const renderer = new VideoRenderer(canvas);
      renderer.upload(document.querySelector('video')); renderer.draw(settings, index / 30);
      const rgba = renderer.readPixels(), sampled = [];
      for (let y = 4; y < canvas.height; y += 8) for (let x = 4; x < canvas.width; x += 8) {
        const offset = (y * canvas.width + x) * 4;
        sampled.push(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
      }
      renderer.destroy(); return sampled;
    }, { settings, index });
    previews.set(index, samples);
  }
  await page.screenshot({ path: join(results, '03-preview.png') });
  const output = join(results, 'festival-export.mp4');
  await application.evaluate((_electron, path) => { globalThis.testSave = path; }, output);
  await page.click('#export');
  await page.waitForFunction(() => document.getElementById('status-title').textContent === 'Video je připravené' || document.getElementById('status').classList.contains('error'), null, { timeout: 180000 });
  assert.equal(await page.locator('#status-title').innerText(), 'Video je připravené', await page.locator('#status-message').innerText());
  await page.screenshot({ path: join(results, '04-exported.png') });
  const metadata = await probe(output);
  const stream = metadata.streams.find(s => s.codec_type === 'video');
  const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
  assert.equal(stream.codec_name, 'h264'); assert.equal(stream.width, 1920); assert.equal(stream.height, 1080);
  assert.equal(Number(stream.nb_frames), 48); assert.equal(stream.avg_frame_rate, '30/1'); assert.ok(audioStream);
  assert.ok(Math.abs(Number(stream.duration) - Number(audioStream.duration)) <= 1 / 30);
  for (const index of comparisonFrames) {
    const rgba = await bytes(['-v', 'error', '-i', output, '-vf', `select=eq(n\\,${index})`, '-frames:v', '1', '-pix_fmt', 'rgba', '-f', 'rawvideo', 'pipe:1']);
    const sample = previews.get(index); let i = 0, absolute = 0, squared = 0;
    for (let y = 4; y < 1080; y += 8) for (let x = 4; x < 1920; x += 8) for (let c = 0; c < 3; c++) {
      const diff = rgba[(y * 1920 + x) * 4 + c] - sample[i++]; absolute += Math.abs(diff); squared += diff * diff;
    }
    const mae = absolute / i, psnr = 10 * Math.log10(255 ** 2 / (squared / i));
    report.metrics[`frame_${index}`] = { mae, psnr };
    console.log(`Preview/export frame ${index}: MAE=${mae.toFixed(3)} PSNR=${psnr.toFixed(2)} dB`);
    assert.ok(mae < 6 && psnr > 27, `Preview/export mismatch at frame ${index}`);
  }
  log('Full 1080p MP4 export: 48 frames at 30 fps; preview/export pixel comparisons passed');
  const pcm = await bytes(['-v', 'error', '-i', output, '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1']);
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
  const onset = samples.findIndex(value => Math.abs(value) > .1) / 48000;
  report.metrics.audioPulseSeconds = onset;
  assert.ok(Math.abs(onset - .8) < .015, `A/V pulse offset ${onset - .8}`);
  const timestamps = command(ffprobe, ['-v', 'error', '-select_streams', 'v', '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', output]);
  let json = ''; for await (const chunk of timestamps.child.stdout) json += chunk; await timestamps.done;
  JSON.parse(json).frames.forEach((frame, index) => assert.ok(Math.abs(Number(frame.best_effort_timestamp_time) - index / 30) < .00001));
  log(`Exact frame timestamps and A/V pulse alignment: ${(onset * 1000).toFixed(2)} ms (target 800 ms)`);
  // Actual OS-backed File objects exercise drag/drop and webUtils.getPathForFile.
  const silent = join(results, 'short-silent.mp4'), rotated = join(results, 'rotated portrait.mov');
  await command(ffmpeg, ['-v', 'error', '-y', '-i', input, '-t', '0.3', '-an', '-c:v', 'libx264', silent], { stdout: 'ignore' }).done;
  await command(ffmpeg, ['-v', 'error', '-y', '-i', silent, '-c', 'copy', '-metadata:s:v:0', 'rotate=90', rotated], { stdout: 'ignore' }).done;
  await page.evaluate(() => { const input = document.createElement('input'); input.type = 'file'; input.id = 'test-file'; input.hidden = true; document.body.append(input); });
  await page.locator('#test-file').setInputFiles(rotated);
  await page.evaluate(() => { const dataTransfer = new DataTransfer(); dataTransfer.items.add(document.getElementById('test-file').files[0]); document.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true })); });
  await page.waitForFunction(() => document.getElementById('file-name').textContent === 'rotated portrait.mov' && !document.getElementById('export').disabled, null, { timeout: 60000 });
  assert.match(await page.locator('#file-info').innerText(), /180 × 320/);
  assert.match(await page.locator('#file-info').innerText(), /bez zvuku/);
  await page.click('#reset');
  for (const [aspect, width, height] of [['9:16', 1080, 1920], ['1:1', 1080, 1080]]) {
    await page.click(`[data-aspect="${aspect}"]`);
    await application.evaluate((_electron, path) => { globalThis.testSave = path; }, join(results, `silent-${width}x${height}.mp4`));
    await page.click('#export');
    await page.waitForFunction(() => !document.getElementById('export').disabled, null, { timeout: 60000 });
    assert.equal(await page.locator('#status-title').innerText(), 'Video je připravené', await page.locator('#status-message').innerText());
    const result = await probe(join(results, `silent-${width}x${height}.mp4`));
    assert.equal(result.streams[0].width, width); assert.equal(result.streams[0].height, height);
    assert.equal(Number(result.streams[0].nb_frames), 9);
    assert.ok(!result.streams.some(s => s.codec_type === 'audio'));
  }
  log('Native drag/drop, rotated MOV input and silent portrait/square exports passed');
  await page.click('#dismiss');
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.isVisible()).setSize(1050, 740));
  await page.waitForFunction(() => window.innerWidth === 1050);
  await page.click('[data-tool="erase"]');
  await page.selectOption('#erase-layer', 'both');
  const toolbarFits = await page.evaluate(() => ['brush-options', 'edit-actions'].every(id => {
    const element = document.getElementById(id), bounds = element.getBoundingClientRect();
    return Array.from(element.children).filter(child => !child.hidden).every(child => {
      const rect = child.getBoundingClientRect();
      return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
    });
  }));
  assert.ok(toolbarFits, 'Brush controls fit the minimum window size');
  await page.screenshot({ path: join(results, '05-compact.png') });
  await page.click('#discard-regions');
  log('Brush and eraser controls fit the minimum 1050 × 740 window');
  await verifyExtensions(application, page, results);
  log('Image input, five-second scene, custom palette rendering/settings and PNG export passed');
  // The local content protocol continues working with the browser offline.
  await application.context().setOffline(true);
  await page.click('#play');
  await page.waitForFunction(() => document.querySelector('video').currentTime > .1);
  await page.click('#play');
  log('Prepared playback works with the browser network offline');
  assert.deepEqual(errors, []);
  assert.ok((await stat(output)).size > 10000);
  report.success = true;
} catch (error) {
  report.error = error.stack;
  if (application) { const page = await application.firstWindow(); await page.screenshot({ path: join(results, 'failure.png') }).catch(() => {}); console.error(await page.locator('#status').innerText().catch(() => '')); }
  throw error;
} finally {
  await writeFile(join(results, 'report.json'), JSON.stringify(report, null, 2));
  await application?.close();
}
