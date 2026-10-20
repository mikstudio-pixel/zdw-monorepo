import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { binaries, command, probe } from '../main/media.js';
import { PALETTE_PRESET_COLORS, parseSettings } from '../shared/settings.js';

export async function verifyExtensions(application, page, results) {
  const palette = await page.evaluate(async () => {
    const { VideoRenderer } = await import('./video-renderer.js');
    const { DEFAULTS, PALETTE_PRESET_COLORS } = await import('../shared/settings.js');
    const renderer = new VideoRenderer(document.createElement('canvas'));
    try {
      renderer.upload(new Uint8Array([96, 110, 130, 255]), 1, 1);
      const settings = { ...DEFAULTS, liquid: true, strength: 0 };
      renderer.draw(settings, 1);
      const original = renderer.readPixels().slice();
      renderer.draw({ ...settings, liquidColors: PALETTE_PRESET_COLORS }, 1);
      const custom = renderer.readPixels().slice();
      renderer.draw(settings, 1);
      const restored = renderer.readPixels();
      let changed = 0, restoreError = 0;
      for (let i = 0; i < original.length; i++) {
        if (Math.abs(original[i] - custom[i]) > 3) changed++;
        restoreError = Math.max(restoreError, Math.abs(original[i] - restored[i]));
      }
      return { changed, restoreError };
    } finally { renderer.destroy(); }
  });
  assert.ok(palette.changed > 1000, JSON.stringify(palette));
  assert.equal(palette.restoreError, 0, 'Changing colors invalidates cached textures and resetting restores the original pixels');

  const image = join(results, 'image-input.png');
  await command(binaries().ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=800x600', '-frames:v', '1', image], { stdout: 'ignore' }).done;
  await application.evaluate((_electron, path) => { globalThis.testOpen = path; }, image);
  await page.click('#replace-video');
  await page.waitForFunction(() => document.getElementById('file-info').textContent.includes('obrázek') && !document.getElementById('export').disabled, null, { timeout: 60000 });
  assert.match(await page.locator('#file-info').innerText(), /00:05.00/);
  await page.click('[data-preset="festival"]');
  await page.locator('#apply-palette').click();
  const colors = await page.locator('.color-picker-input').evaluateAll(inputs => inputs.map(input => input.value));
  assert.deepEqual(colors, PALETTE_PRESET_COLORS);
  const saved = join(results, 'custom-palette.json');
  await application.evaluate((_electron, path) => { globalThis.testSave = path; }, saved);
  await page.click('#save-settings');
  await page.waitForFunction(() => document.getElementById('status-title').textContent === 'Nastavení je uložené');
  assert.deepEqual(parseSettings(await readFile(saved, 'utf8')).liquidColors, PALETTE_PRESET_COLORS);
  await page.click('#reset-liquid-colors');
  await application.evaluate((_electron, path) => { globalThis.testOpen = path; }, saved);
  await page.click('#load-settings');
  await page.waitForFunction(() => document.getElementById('status-title').textContent === 'Nastavení je načtené');
  assert.deepEqual(await page.locator('.color-picker-input').evaluateAll(inputs => inputs.map(input => input.value)), PALETTE_PRESET_COLORS);

  const png = join(results, 'image-export');
  await application.evaluate((_electron, path) => { globalThis.testSave = path; }, png);
  await page.click('#export-image');
  await page.waitForFunction(() => document.getElementById('status-title').textContent === 'Snímek je připravený' || document.getElementById('status').classList.contains('error'));
  assert.equal(await page.locator('#status-title').innerText(), 'Snímek je připravený');
  const bytes = await readFile(`${png}.png`);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const metadata = await probe(`${png}.png`);
  assert.equal(metadata.streams[0].width, 1080);
  assert.equal(metadata.streams[0].height, 1080);
  await page.screenshot({ path: join(results, '06-image-palette-png.png') });
  await writeFile(join(results, 'extensions.json'), JSON.stringify({ palette, pngBytes: bytes.length, imageDuration: 5 }, null, 2));
}
