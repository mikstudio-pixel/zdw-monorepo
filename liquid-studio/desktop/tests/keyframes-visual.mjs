import assert from 'node:assert/strict';

export async function verifyKeyframeMorph(page) {
  const metrics = await page.evaluate(async () => {
    const { VideoRenderer } = await import('./video-renderer.js');
    const { RegionMaps } = await import('../shared/regions.js');
    const { DEFAULTS, serializeSettings, parseSettings } = await import('../shared/settings.js');
    const { captureEffects } = await import('../shared/keyframes.js');
    const renderer = new VideoRenderer(document.createElement('canvas'));
    const source = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) source.set([20 + (x % 8) * 4, 28 + (y % 8) * 3, 25, 255], (y * 64 + x) * 4);
    renderer.upload(source, 64, 64);
    const scene = x => {
      const maps = RegionMaps.empty().useLiquidArea();
      maps.paint('liquid', [x, .4], [x, .6], 200, 1);
      maps.paint('glass', [x, .5], [x, .5], 180, 1);
      return { ...DEFAULTS, aspect: '1:1', liquid: true, opacity: 100, regions: maps.serialize() };
    };
    const a = scene(.2), b = scene(.8);
    const track = { ...a, keyframes: [{ frame: 0, effects: captureEffects(a) }, { frame: 150, effects: captureEffects(b) }] };
    const render = (settings, time) => { renderer.draw(settings, time); return renderer.readPixels().slice(); };
    const error = (a, b) => a.reduce((maximum, value, i) => Math.max(maximum, Math.abs(value - b[i])), 0);
    try {
      const holdError = error(render(track, 2.5), render(a, 2.5));
      const dense = render(a, 0), area = new RegionMaps(a.regions).layers.liquid;
      let coreHoles = 0, fringePixels = 0;
      for (let y = 0; y < 1080; y++) for (let x = 0; x < 1080; x++) {
        const painted = dense[(y * 1080 + x) * 4] > 80;
        if (x >= 190 && x < 240 && y >= 480 && y < 600 && !painted) coreHoles++;
        if (painted && !area[Math.floor(y / 1080 * 512) * 512 + Math.floor(x / 1080 * 512)]) fringePixels++;
      }
      const endError = error(render(track, 5), render(b, 5));
      const middle = render(track, 4);
      let middlePixels = 0;
      for (let y = 0; y < 1080; y++) for (let x = 380; x < 700; x++) if (middle[(y * 1080 + x) * 4] > 80) middlePixels++;
      const repeatError = error(middle, render(track, 4));
      const roundtripError = error(middle, render(parseSettings(serializeSettings(track)), 4));
      const interpolationChange = error(middle, render(a, 4));
      return { holdError, endError, middlePixels, repeatError, roundtripError, interpolationChange, coreHoles, fringePixels };
    } finally { renderer.destroy(); }
  });
  assert.equal(metrics.holdError, 0, 'The prior state holds until two seconds before the target');
  assert.equal(metrics.endError, 0, 'The target matches the independently drawn shape exactly');
  assert.ok(metrics.middlePixels > 1000, 'A distant shape moves through the middle rather than disappearing');
  assert.equal(metrics.repeatError, 0, 'Seeking back reproduces the same morph frame');
  assert.equal(metrics.roundtripError, 0, 'Saved animation renders the same pixels');
  assert.ok(metrics.interpolationChange > 20);
  assert.ok(metrics.coreHoles < 5500, 'The selected core stays populated instead of becoming an empty ring');
  assert.ok(metrics.fringePixels > 1000, 'Organic rays extend beyond the painted edge');
  console.log('Keyframe morph GPU:', JSON.stringify(metrics));
  return metrics;
}
