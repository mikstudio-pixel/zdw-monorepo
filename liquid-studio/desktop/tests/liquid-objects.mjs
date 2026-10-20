import assert from 'node:assert/strict';

export async function verifyLiquidObjects(page) {
  const metrics = await page.evaluate(async () => {
    const { VideoRenderer } = await import('./video-renderer.js');
    const { DEFAULTS, FORMATS, parseSettings, serializeSettings } = await import('../shared/settings.js');
    const { RegionMaps } = await import('../shared/regions.js');
    const renderer = new VideoRenderer(document.createElement('canvas')), metrics = {};
    const diff = (a, b) => a.reduce((max, v, i) => Math.max(max, Math.abs(v - b[i])), 0);
    try {
      renderer.upload(new Uint8Array([24, 29, 26, 255]), 1, 1);
      for (const [aspect, [width, height]] of Object.entries(FORMATS)) {
        const settings = { ...DEFAULTS, aspect, liquid: true, opacity: 100 }, maps = RegionMaps.empty();
        for (const y of [.25, .75]) {
          maps.beginLiquidStroke(); maps.paint('liquid', [.2, y], [.8, y], 480, width / height);
        }
        const draw = regions => { renderer.draw(settings, .7, { regions }); return renderer.readPixels().slice(); };
        const before = maps.snapshot(), original = draw(maps), saved = maps.serialize();
        const coverage = renderer.liquidCoverage(settings, .7, maps);
        let point;
        for (let y = 8; y < 504 && !point; y++) for (let x = 8; x < 504; x++) {
          const i = y * 512 + x;
          if (coverage[0].alpha[i] < 200 || maps.liquidPasses[0].mask[i]) continue;
          let isolated = true;
          for (let dy = -8; dy <= 8 && isolated; dy++) for (let dx = -8; dx <= 8; dx++) {
            if (coverage[1].alpha[(y + dy) * 512 + x + dx]) { isolated = false; break; }
          }
          if (isolated) { point = [(x + .5) / 512, (y + .5) / 512]; break; }
        }
        if (!point) throw new Error(`${aspect}: no isolated spill point`);
        maps.eraseLiquid(point, point, 20, width / height, coverage);
        const after = maps.snapshot(), actual = draw(maps);
        const expected = new RegionMaps({ ...saved, liquid: [saved.liquid[1]] });
        const remainingError = diff(actual, draw(expected));
        const remainingCount = maps.liquidPasses.length;
        maps.restore(before); const undoError = diff(original, draw(maps));
        maps.restore(after); const redoError = diff(actual, draw(maps));
        const restored = new RegionMaps(parseSettings(serializeSettings({ ...settings, regions: maps.serialize() })).regions);
        const savedError = diff(actual, draw(restored));
        metrics[aspect] = { remainingCount, remainingError, undoError, redoError, savedError, spillPoint: point };
      }
      return metrics;
    } finally { renderer.destroy(); }
  });
  for (const [aspect, m] of Object.entries(metrics)) {
    assert.equal(m.remainingCount, 1, `${aspect}: erase the whole touched object, preserve the other`);
    for (const key of ['remainingError', 'undoError', 'redoError', 'savedError']) assert.equal(m[key], 0, `${aspect}: ${key}`);
  }
  console.log('Whole liquid objects:', JSON.stringify(metrics));
  return metrics;
}
