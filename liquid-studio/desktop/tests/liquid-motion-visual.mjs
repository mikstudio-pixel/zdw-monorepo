import assert from 'node:assert/strict';

export async function verifyLiquidEvolution(page) {
  const metrics = await page.evaluate(async () => {
    const { VideoRenderer } = await import('./video-renderer.js');
    const { RegionMaps } = await import('../shared/regions.js');
    const { DEFAULTS } = await import('../shared/settings.js');
    const renderer = new VideoRenderer(document.createElement('canvas'));
    renderer.upload(new Uint8Array([20, 30, 40, 255]), 1, 1);
    const maps = RegionMaps.empty().useLiquidArea();
    maps.paint('liquid', [0, .5], [1, .5], 4000, 16 / 9);
    const settings = { ...DEFAULTS, liquid: true, regions: maps.serialize() };
    const render = time => {
      renderer.draw(settings, time);
      const gl = renderer.gl, pixels = new Uint8Array(renderer.liquidWidth * renderer.liquidHeight * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.liquidFramebuffer);
      gl.readPixels(0, 0, renderer.liquidWidth, renderer.liquidHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Cannot read liquid motion');
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return pixels;
    };
    const difference = (a, b) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length;
    try {
      // The previous cosine clock replayed exactly the same poses in reverse
      // after its 7.48s turning point. These pairs must now show different poses.
      const oldPeriod = 2 * Math.PI / .42;
      const mirrored = [2, 4, 6].map(time => difference(render(time), render(oldPeriod - time)));
      const continuing = [18, 45, 120].map(time => difference(render(time), render(time + 4)));
      const continuity = [4.36, oldPeriod / 2, oldPeriod, 30, 120]
        .map(time => difference(render(time - 1 / 60), render(time + 1 / 60)));
      const pose = render(22.25);
      render(3);
      const seekError = difference(pose, render(22.25));
      return { mirrored, continuing, continuity, seekError };
    } finally { renderer.destroy(); }
  });
  assert.ok(metrics.mirrored.every(error => error > 3), `Motion must not replay earlier poses backwards: ${metrics.mirrored}`);
  assert.ok(metrics.continuing.every(error => error > 3), `Motion continues after the finite reference ends: ${metrics.continuing}`);
  assert.ok(metrics.continuity.every(error => error < 8), `Motion has no reset jumps: ${metrics.continuity}`);
  assert.equal(metrics.seekError, 0, 'Seeking and export reproduce the same evolving pose');
  console.log('Liquid evolution GPU:', JSON.stringify(metrics));
  return metrics;
}
