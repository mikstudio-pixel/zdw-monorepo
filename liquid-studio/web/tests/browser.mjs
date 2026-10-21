import { _electron as electron } from '../../desktop/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { command, binaries, probe } from '../../desktop/main/media.js';
import electronExecutable from '../../desktop/node_modules/electron/index.js';
const root = fileURLToPath(new URL('../', import.meta.url)), results = `${root}test-results/`;
await mkdir(results, { recursive: true });
const { ffmpeg } = binaries();
const run = args => command(ffmpeg, ['-v', 'error', '-y', ...args], { stdout: 'ignore' }).done;
await run(['-f', 'lavfi', '-i', "testsrc2=size=320x180:rate=30:duration=1.6,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(t,0.8,0.89)'", '-itsoffset', '0.2', '-f', 'lavfi', '-i', "aevalsrc=0.5*sin(2*PI*1000*t)*between(t\\,0.6\\,0.69):s=48000:d=1.4", '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', `${results}sync-input.mp4`]);
await run(['-i', `${results}sync-input.mp4`, '-t', '0.3', '-an', '-c:v', 'libx264', `${results}silent.mp4`]);
await run(['-i', `${results}silent.mp4`, '-c', 'copy', '-metadata:s:v:0', 'rotate=90', `${results}rotated.mov`]);
await run(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=1.6', '-vf', 'select=not(mod(n\\,3)),setpts=PTS+2/TB', '-fps_mode', 'vfr', '-c:v', 'libx264', `${results}vfr.mp4`]);
await run(['-i', `${results}sync-input.mp4`, '-c', 'copy', '-output_ts_offset', '2', `${results}offset.mp4`]);
await run(['-f', 'lavfi', '-i', 'testsrc2=size=320x180', '-frames:v', '1', `${results}still.png`]);
const server = spawn(process.execPath, [`${root}scripts/serve.mjs`], { env: { ...process.env, LIQUID_QA: '1', PORT: '0' } });
const url = await new Promise((resolve, reject) => {
  server.stdout.on('data', chunk => { const match = /http:\/\/localhost:\d+/.exec(chunk.toString()); if (match) resolve(match[0]); });
  server.once('error', reject); server.once('exit', code => reject(new Error(`Server exited ${code}`)));
});
let application;
const checks = [], errors = [];
try {
  application = await electron.launch({ executablePath: electronExecutable,
    args: [`${root}tests/browser-host.cjs`, `--user-data-dir=${results}browser-profile`], env: { ...process.env, LIQUID_TEST_URL: `${url}/__qa/?fixture=sync&editor=1` }, timeout: 60_000 });
  const page = await application.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => document.documentElement.dataset.qaDone === 'true' || document.querySelector('#status.error'), null, { timeout: 120_000 });
  assert.equal(await page.locator('#status-title').innerText(), 'Video je připravené', await page.locator('#status-message').innerText());
  await page.screenshot({ path: `${results}browser-export.png` });
  const verified = await promisify(execFile)(process.execPath, [`${root}tests/verify.mjs`, 'browser-sync']); console.log(verified.stdout);
  checks.push('Visible import, both brushes, confirmation, preview, frame export and result playback');
  await page.goto(`${url}/?editor=1`); await page.waitForSelector('#liquidStructure');
  await page.waitForFunction(() => document.getElementById('file-name').textContent === 'ZDW – úvodní video.mp4' && !document.getElementById('export').disabled);
  assert.equal(await page.locator('video').evaluate(video => video.paused), true);
  await page.screenshot({ path: `${results}browser-default-video.png` });
  checks.push('Bundled ZDW video loads automatically, paused and ready to edit');
  const settings = JSON.parse(await readFile(`${results}browser-sync-settings.json`, 'utf8'));
  const importFile = async path => page.evaluate(async ({ bytes, name }) => window.liquid.importFile(new File([Uint8Array.from(atob(bytes), c => c.charCodeAt(0))], name)), { bytes: (await readFile(path)).toString('base64'), name: path.split('/').pop() });
  const invalid = await page.evaluate(() => window.liquid.importFile(new File(['invalid'], 'invalid.mp4')));
  assert.equal(invalid.ok, false); assert.match(invalid.error, /podporované video/);
  checks.push('Unsupported file produces a Czech error');
  await importFile(`${results}sync-input.mp4`);
  const cancellation = await page.evaluate(async settings => {
    const off = window.liquid.onProgress(value => { if (value.frames === 3) void window.liquid.cancel(); });
    try { return await window.liquid.exportVideo(settings); } finally { off(); }
  }, settings);
  assert.equal(cancellation.ok, false); assert.equal(cancellation.cancelled, true);
  checks.push('Cancellation stops an active export');
  for (const [name, file, aspect] of [['portrait', 'rotated.mov', '9:16'], ['square', 'silent.mp4', '1:1'], ['vfr', 'vfr.mp4', '16:9'], ['offset', 'offset.mp4', '16:9']]) {
    const imported = await importFile(results + file); assert.ok(imported.ok, imported.error);
    await application.context().setOffline(true);
    let result;
    try {
      result = await page.evaluate(async settings => {
        const result = await window.liquid.exportVideo(settings);
        if (!result.ok) return result;
        const data = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(result.value.file); });
        return { ok: true, width: result.value.width, height: result.value.height, frames: result.value.frames, data };
      }, { ...settings, aspect });
    } finally { await application.context().setOffline(false); }
    assert.ok(result.ok, result.error);
    assert.equal(result.frames, imported.value.frames);
    const path = `${results}browser-${name}.mp4`; await writeFile(path, Buffer.from(result.data, 'base64'));
    const metadata = await probe(path), video = metadata.streams.find(s => s.codec_type === 'video');
    assert.equal(video.width, result.width); assert.equal(video.height, result.height); assert.equal(video.avg_frame_rate, '30/1');
    assert.equal(Number(video.nb_frames), imported.value.frames);
    if (name === 'offset') { assert.ok(imported.value.startTime >= 1.9); assert.equal(result.frames, 48); }
    if (name === 'portrait') { assert.equal(imported.value.width, 180); assert.equal(imported.value.height, 320); }
    checks.push(`${name}: offline export, ${result.frames} frames at ${result.width}×${result.height}`);
  }
  assert.deepEqual(errors, []);
  await page.goto(`${url}/?editor=1`);
  await page.waitForFunction(() => document.getElementById('file-name').textContent === 'ZDW – úvodní video.mp4' && !document.getElementById('export').disabled);
  await page.evaluate(() => {
    const input = document.createElement('input'); input.type = 'file'; input.id = 'image-fixture'; document.body.append(input);
  });
  await page.locator('#image-fixture').setInputFiles(`${results}still.png`);
  await page.evaluate(() => {
    const dataTransfer = new DataTransfer(); dataTransfer.items.add(document.getElementById('image-fixture').files[0]);
    document.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true }));
  });
  await page.waitForFunction(() => document.getElementById('file-info').textContent.includes('obrázek') && !document.getElementById('export').disabled, null, { timeout: 60000 });
  assert.match(await page.locator('#file-info').innerText(), /00:05.00/);
  await page.click('[data-preset="festival"]');
  await page.locator('#apply-palette').click();
  await page.click('#export-image');
  await page.waitForFunction(() => document.getElementById('status-title').textContent === 'Snímek je připravený');
  const imageExport = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2;
    const result = await window.liquid.exportImage(canvas.toDataURL('image/png'));
    const blob = await (await fetch(result.value.url)).blob();
    return { ok: result.ok, type: blob.type, signature: Array.from(new Uint8Array(await blob.arrayBuffer()).slice(0, 8)) };
  });
  assert.ok(imageExport.ok); assert.equal(imageExport.type, 'image/png');
  assert.deepEqual(imageExport.signature, [137, 80, 78, 71, 13, 10, 26, 10]);
  await page.screenshot({ path: `${results}browser-image-palette.png` });
  const animatedImage = await page.evaluate(async settings => {
    const result = await window.liquid.exportVideo(settings);
    return { ok: result.ok, frames: result.value?.frames, error: result.error };
  }, settings);
  assert.ok(animatedImage.ok, animatedImage.error); assert.equal(animatedImage.frames, 150);
  assert.deepEqual(errors, []);
  checks.push('Image drag/drop, 5-second scene, shared palette, PNG save and 150-frame image animation export');
  await page.route('**/assets/zdw-demo.mp4', route => route.fulfill({ status: 404, body: 'Unavailable' }));
  await page.goto(`${url}/?editor=1`);
  await page.waitForFunction(() => document.getElementById('status').classList.contains('error') && !document.getElementById('choose-video').disabled);
  assert.match(await page.locator('#status-message').innerText(), /Vložte vlastní soubor/);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#choose-video')]);
  await chooser.setFiles(`${results}sync-input.mp4`);
  await page.waitForFunction(() => document.getElementById('file-name').textContent === 'sync-input.mp4' && !document.getElementById('export').disabled);
  checks.push('A failed demo download leaves the file picker usable for a custom video');
  await writeFile(`${results}browser-checks.json`, JSON.stringify({ success: true, checks }, null, 2));
  console.log(checks.join('\n'));
} finally { await application?.close(); server.kill(); }
