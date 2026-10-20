import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function verifyLiquidStructure(page, directory) {
  const result = await page.evaluate(async () => {
    const { VideoRenderer } = await import('./video-renderer.js');
    const { DEFAULTS } = await import('../shared/settings.js');
    const { RegionMaps } = await import('../shared/regions.js');
    const renderer = new VideoRenderer(document.createElement('canvas'));
    const source = new Uint8Array(1920 * 1080 * 4);
    for (let i = 0; i < source.length; i += 4) source.set([24, 29, 26, 255], i);
    renderer.upload(source, 1920, 1080);
    const maps = RegionMaps.empty(), settings = { ...DEFAULTS, liquid: true, opacity: 100 };
    maps.paint('liquid', [.2, .58], [.8, .4], 300, 16 / 9);
    const initial = maps.serialize();
    const images = {}, metrics = {};
    function measure(pixels) {
      const w = 480, h = 270, solid = new Uint8Array(w * h);
      let filled = 0, perimeter = 0;
      const bounds = [w, h, -1, -1];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        solid[i] = pixels[((y * 4) * 1920 + x * 4) * 4] > 40 ? 1 : 0;
        filled += solid[i];
        if (solid[i]) { bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y); bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y); }
        if (x && solid[i] !== solid[i - 1]) perimeter++;
        if (y && solid[i] !== solid[i - w]) perimeter++;
      }
      const queue = new Int32Array(w * h), visited = new Uint8Array(w * h), holes = [], objects = [];
      for (let start = 0; start < solid.length; start++) {
        if (visited[start]) continue;
        let head = 0, tail = 1, edge = false;
        queue[0] = start; visited[start] = 1;
        while (head < tail) {
          const i = queue[head++], x = i % w, y = Math.floor(i / w);
          if (!x || !y || x === w - 1 || y === h - 1) edge = true;
          for (const next of [x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y ? i - w : -1, y < h - 1 ? i + w : -1]) {
            if (next < 0 || solid[next] !== solid[start] || visited[next]) continue;
            visited[next] = 1; queue[tail++] = next;
          }
        }
        if (tail > 12) {
          if (solid[start]) objects.push(tail * 16);
          else if (!edge) holes.push(tail * 16);
        }
      }
      holes.sort((a, b) => a - b);
      return { holes: holes.length, medianHole: holes.length ? holes[Math.floor(holes.length / 2)] : 0,
        objects: objects.length, largestObject: Math.max(0, ...objects), filled: filled * 16, edgeDensity: perimeter / Math.max(filled, 1), bounds };
    }
    try {
      let midpoint;
      for (const [name, value] of [['balanced', 50], ['fine', 0], ['cohesive', 100]]) {
        renderer.draw({ ...settings, liquidStructure: value }, .7, { regions: maps });
        const pixels = renderer.readPixels().slice();
        if (value === 50) midpoint = pixels;
        images[name] = renderer.canvas.toDataURL();
        metrics[name] = { ...measure(pixels), guides: renderer.guideCount };
      }
      renderer.draw(settings, .7, { regions: maps });
      let resetError = 0;
      renderer.readPixels().forEach((value, i) => { resetError = Math.max(resetError, Math.abs(value - midpoint[i])); });
      maps.paint('glass', [.2, .58], [.8, .4], 300, 16 / 9);
      renderer.draw({ ...settings, liquid: false, liquidStructure: 0 }, .7, { regions: maps });
      const glass = renderer.readPixels().slice();
      renderer.draw({ ...settings, liquid: false, liquidStructure: 100 }, .7, { regions: maps });
      let glassError = 0;
      renderer.readPixels().forEach((value, i) => { glassError = Math.max(glassError, Math.abs(value - glass[i])); });
      return { images, metrics, resetError, glassError, guideUnchanged: JSON.stringify(maps.serialize().liquid) === JSON.stringify(initial.liquid) };
    } finally { renderer.destroy(); }
  });
  for (const [name, url] of Object.entries(result.images)) await writeFile(join(directory, `liquid-structure-${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  const { fine, balanced, cohesive } = result.metrics;
  console.log('Liquid structure:', JSON.stringify(result.metrics));
  assert.ok(fine.holes > cohesive.holes && fine.holes > balanced.holes, 'Fine structure has more holes');
  assert.ok(fine.medianHole < balanced.medianHole, 'Fine holes are smaller');
  assert.ok(fine.edgeDensity > cohesive.edgeDensity * 1.5, 'Fine edges are more detailed');
  assert.ok(cohesive.largestObject > balanced.largestObject && cohesive.holes < balanced.holes, 'Cohesive structure fills internal openings');
  assert.ok(cohesive.bounds.every((value, i) => Math.abs(value - balanced.bounds[i]) <= 1), 'Closing holes preserves outer extent instead of inflating the stroke');
  assert.equal(cohesive.guides, balanced.guides, 'The cohesive half preserves the same anchors and feature scale');
  assert.equal(result.resetError, 0, 'Returning to midpoint restores identical pixels');
  assert.equal(result.glassError, 0, 'Liquid structure does not affect the glass renderer');
  assert.equal(result.guideUnchanged, true, 'The control preserves drawn guides');
  return result.metrics;
}
