import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function verifyLiquidRepaint(page, directory) {
  const result = await page.evaluate(async () => {
    const { VideoRenderer } = await import('./video-renderer.js');
    const { DEFAULTS, parseSettings, serializeSettings } = await import('../shared/settings.js');
    const { RegionMaps } = await import('../shared/regions.js');
    const renderer = new VideoRenderer(document.createElement('canvas'));
    const settings = { ...DEFAULTS, liquid: true, opacity: 100 };
    const maps = RegionMaps.empty(), images = {}, metrics = {};
    const draw = (regions, name) => {
      renderer.draw(settings, .7, { regions, editing: true });
      if (name) images[name] = renderer.canvas.toDataURL();
      return renderer.readPixels().slice();
    };
    const difference = (a, b) => a.reduce((max, value, i) => Math.max(max, Math.abs(value - b[i])), 0);
    const eraseAll = () => {
      const coverage = renderer.liquidCoverage(settings, .7, maps);
      for (let y = 0; y <= 1; y += .25) maps.eraseLiquid([0, y], [1, y], 480, 16 / 9, coverage);
    };
    try {
      renderer.upload(new Uint8Array([24, 29, 26, 255]), 1, 1);
      const empty = draw(maps);
      maps.paint('liquid', [.2, .45], [.8, .5], 960, 16 / 9);
      draw(maps, 'initial');
      for (const diameter of [480, 960]) {
        eraseAll();
        const erased = maps.snapshot();
        metrics[`erased${diameter}`] = difference(draw(maps), empty);
        maps.paint('liquid', [.5, .5], [.5, .5], diameter, 16 / 9);
        const actual = draw(maps, `repaint-${diameter}`), repainted = maps.snapshot();
        const fresh = RegionMaps.empty();
        fresh.paint('liquid', [.5, .5], [.5, .5], diameter, 16 / 9);
        metrics[`fresh${diameter}`] = difference(actual, draw(fresh, `fresh-${diameter}`));
        maps.restore(erased);
        metrics[`undo${diameter}`] = difference(draw(maps), empty);
        maps.restore(repainted);
        metrics[`redo${diameter}`] = difference(draw(maps), actual);
        const restored = new RegionMaps(parseSettings(serializeSettings({ ...settings, regions: maps.serialize() })).regions);
        metrics[`saved${diameter}`] = difference(draw(restored), actual);
        let overflow = 0;
        for (let y = 0; y < 1080; y++) for (let x = 0; x < 1920; x++) {
          const i = (y * 1920 + x) * 4;
          if (Math.hypot(x - 960, y - 540) > diameter / 2 + 4 && Math.abs(actual[i] - empty[i]) > 10) overflow++;
        }
        metrics[`overflow${diameter}`] = overflow;
      }
      return { images, metrics };
    } finally { renderer.destroy(); }
  });
  for (const [name, url] of Object.entries(result.images)) await writeFile(join(directory, `liquid-${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  for (const diameter of [480, 960]) {
    for (const stage of ['erased', 'fresh', 'undo', 'redo', 'saved']) {
      assert.equal(result.metrics[`${stage}${diameter}`], 0, `${stage}: erase then repaint ${diameter} px must match independent fresh generation`);
    }
    assert.ok(result.metrics[`overflow${diameter}`] > 1000, 'Repaint must grow beyond the brush outline, including inside previously erased areas');
  }
  console.log('Erase/repaint:', JSON.stringify(result.metrics));
  return result.metrics;
}
