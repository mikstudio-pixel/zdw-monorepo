import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function verifyGuidedLiquid(page, directory) {
  const result = await page.evaluate(async () => {
    const { VideoRenderer } = await import('./video-renderer.js');
    const { DEFAULTS } = await import('../shared/settings.js');
    const { RegionMaps } = await import('../shared/regions.js');
    const renderer = new VideoRenderer(document.createElement('canvas'));
    const source = new Uint8Array(1920 * 1080 * 4);
    for (let i = 0; i < source.length; i += 4) source.set([24, 29, 26, 255], i);
    renderer.upload(source, 1920, 1080);
    const maps = RegionMaps.empty(), settings = { ...DEFAULTS, liquid: true, opacity: 100 };
    try {
      renderer.draw({ ...settings, regions: { glass: maps.serialize().glass, liquid: null } }, .7);
      const original = renderer.canvas.toDataURL();
      maps.paint('liquid', [.2, .58], [.8, .4], 300, 16 / 9);
      renderer.draw(settings, .7, { regions: maps });
      const guided = renderer.canvas.toDataURL(), first = renderer.readPixels().slice();
      renderer.draw(settings, .7, { regions: maps, editing: true });
      const editingPixels = renderer.readPixels();
      let editingError = 0;
      for (let i = 0; i < first.length; i++) editingError = Math.max(editingError, Math.abs(first[i] - editingPixels[i]));
      const guideCount = renderer.guideCount;
      let inside = 0, overflow = 0, filled = 0, spillPoint;
      const w = 480, h = 270, solid = new Uint8Array(w * h);
      for (let y = 0; y < 1080; y++) for (let x = 0; x < 1920; x++) {
        const i = (y * 1920 + x) * 4, visible = first[i] > 40;
        const mark = maps.layers.liquid[Math.floor(y / 1080 * 512) * 512 + Math.floor(x / 1920 * 512)] > 127;
        if (mark) inside++;
        if (mark && visible) filled++;
        if (!mark && visible) { overflow++; spillPoint ||= [x / 1920, y / 1080]; }
        if (x % 4 === 0 && y % 4 === 0) solid[(y / 4) * w + x / 4] = visible ? 1 : 0;
      }
      const queue = new Int32Array(w * h), visited = new Uint8Array(w * h), holes = [];
      for (let start = 0; start < solid.length; start++) {
        if (solid[start] || visited[start]) continue;
        let head = 0, tail = 1, edge = false;
        queue[0] = start; visited[start] = 1;
        while (head < tail) {
          const i = queue[head++], x = i % w, y = Math.floor(i / w);
          if (!x || !y || x === w - 1 || y === h - 1) edge = true;
          for (const next of [x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y ? i - w : -1, y < h - 1 ? i + w : -1]) {
            if (next < 0 || solid[next] || visited[next]) continue;
            visited[next] = 1; queue[tail++] = next;
          }
        }
        if (!edge && tail > 30) holes.push(tail * 16);
      }
      renderer.draw(settings, .7 + 1 / 30, { regions: maps });
      const adjacent = renderer.readPixels().slice();
      renderer.draw(settings, 1.7, { regions: maps });
      const later = renderer.readPixels().slice();
      let frameDelta = 0, secondDelta = 0;
      for (let i = 0; i < first.length; i += 4) {
        frameDelta += Math.abs(first[i] - adjacent[i]); secondDelta += Math.abs(first[i] - later[i]);
      }
      renderer.draw(settings, .7, { regions: maps });
      const repeat = renderer.readPixels();
      let repeatError = 0;
      for (let i = 0; i < first.length; i++) repeatError = Math.max(repeatError, Math.abs(first[i] - repeat[i]));
      let erasedError = 255, eraseRoundtripError = 255;
      const beforeErase = maps.snapshot();
      if (spillPoint) {
        maps.eraseLiquid(spillPoint, spillPoint, 100, 16 / 9, renderer.liquidCoverage(settings, .7, maps));
        renderer.draw(settings, .7, { regions: maps });
        const erased = renderer.readPixels().slice();
        const x = Math.round(spillPoint[0] * 1920), y = Math.round(spillPoint[1] * 1080), i = (y * 1920 + x) * 4;
        erasedError = Math.max(...[0, 1, 2].map(c => Math.abs(erased[i + c] - source[i + c])));
        renderer.draw({ ...settings, regions: maps.serialize() }, .7);
        const restored = renderer.readPixels();
        eraseRoundtripError = 0;
        for (let i = 0; i < erased.length; i++) eraseRoundtripError = Math.max(eraseRoundtripError, Math.abs(erased[i] - restored[i]));
      }
      maps.restore(beforeErase);
      renderer.draw(settings, 20.7, { regions: maps });
      const longClip = renderer.readPixels().slice();
      renderer.draw(settings, 21.7, { regions: maps });
      const longLater = renderer.readPixels().slice();
      let longClipDelta = 0;
      for (let i = 0; i < longClip.length; i += 4) longClipDelta += Math.abs(longClip[i] - longLater[i]);

      // Soft colored edges must composite consistently over any footage.
      // Compare black/white backgrounds to detect halos or straight-alpha blur.
      renderer.upload(new Uint8Array([0, 0, 0, 255]), 1, 1);
      renderer.draw(settings, .7, { regions: maps });
      const black = renderer.readPixels().slice();
      renderer.upload(new Uint8Array([255, 255, 255, 255]), 1, 1);
      renderer.draw(settings, .7, { regions: maps });
      const white = renderer.readPixels();
      let compositingError = 0, softPixels = 0;
      const colors = { blue: 0, yellow: 0, coral: 0 };
      for (let i = 0; i < black.length; i += 4) {
        const delta = [0, 1, 2].map(c => white[i + c] - black[i + c]);
        compositingError = Math.max(compositingError, Math.max(...delta) - Math.min(...delta));
        if (delta[0] > 16 && delta[0] < 239) softPixels++;
        const [r, g, b] = black.subarray(i, i + 3);
        if (b > 80 && b > r * 1.05 && b > g * 1.05) colors.blue++;
        if (g > 80 && r > b * 1.05 && g > b * 1.05) colors.yellow++;
        if (r > 80 && r > g * 1.2 && r > b * 1.15) colors.coral++;
      }
      return { original, guided, metrics: { guideCount, inside, filled, overflow, holes, frameDelta: frameDelta / (1920 * 1080), secondDelta: secondDelta / (1920 * 1080), repeatError, erasedError, eraseRoundtripError, longClipDelta: longClipDelta / (1920 * 1080), compositingError, softPixels, colors, editingError } };
    } finally { renderer.destroy(); }
  });
  for (const name of ['original', 'guided']) await writeFile(join(directory, `liquid-${name}.png`), Buffer.from(result[name].split(',')[1], 'base64'));
  console.log('Guided liquid:', JSON.stringify(result.metrics));
  const m = result.metrics;
  assert.ok(m.holes.length >= 2, 'The generated surface has several visible enclosed holes');
  assert.ok(m.overflow > 5000, 'Liquid extends past the guide without being clipped to it');
  assert.ok(m.filled / m.inside < .85 && m.filled / m.inside > .2, 'The brush directs a porous surface, not a solid stroke');
  assert.ok(m.frameDelta < 5 && m.secondDelta > m.frameDelta * 2, 'The shape flows smoothly between adjacent frames');
  assert.equal(m.repeatError, 0, 'Seeking back recreates the identical shape');
  assert.equal(m.editingError, 0, 'Painting shows the actual colored liquid, holes and overflow without a filled brush mask');
  assert.ok(m.erasedError <= 1 && m.eraseRoundtripError === 0, 'Eraser affects overflow and persists through save/load');
  assert.ok(m.longClipDelta > .5, 'Painted liquid continues evolving on long clips');
  assert.ok(m.compositingError <= 1 && m.softPixels > 5000, 'Soft premultiplied material composites without colored halos');
  assert.ok(Object.values(m.colors).every(count => count > 1000), 'The brush contains the calibrated blue, yellow and coral color families');
  return m;
}
