import assert from 'node:assert/strict';

export async function verifyUnifiedLiquid(page) {
  const metrics = await page.evaluate(async () => {
    const { VideoRenderer } = await import('./video-renderer.js');
    const { RegionMaps } = await import('../shared/regions.js');
    const { DEFAULTS } = await import('../shared/settings.js');
    const renderer = new VideoRenderer(document.createElement('canvas'));
    renderer.upload(new Uint8Array([20, 30, 40, 255]), 1, 1);
    // Distinct palette edges expose colors produced by averaging multiple
    // materials: those fall inside the RGB triangle instead of on its edges.
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ff0000', '#00ff00', '#0000ff', '#ff0000'];
    const palette = colors.map(hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)));
    const strokes = [[[.2, .58], [.8, .4], 300], [[.5, .3], [.5, .7], 190]];
    const maps = reverse => {
      const result = RegionMaps.empty().useLiquidArea();
      for (const [from, to, size] of reverse ? [...strokes].reverse() : strokes) result.paint('liquid', from, to, size, 16 / 9);
      return result;
    };
    const a = maps(false), b = maps(true);
    const settings = regions => ({ ...DEFAULTS, liquid: true, liquidColors: colors, regions: regions.serialize() });
    const render = (regions, time = 0) => {
      renderer.draw(settings(regions), time);
      const gl = renderer.gl, pixels = new Uint8Array(renderer.liquidWidth * renderer.liquidHeight * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.liquidFramebuffer);
      gl.readPixels(0, 0, renderer.liquidWidth, renderer.liquidHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      assertNoError(gl);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return pixels;
    };
    function assertNoError(gl) { if (gl.getError() !== gl.NO_ERROR) throw new Error('Cannot read the liquid surface'); }
    const error = (a, b) => a.reduce((max, value, i) => Math.max(max, Math.abs(value - b[i])), 0);
    try {
      const pixels = render(a), orderError = error(pixels, render(b));
      for (const [from, to, size] of strokes) a.paint('liquid', from, to, size, 16 / 9);
      const repeatError = error(pixels, render(a));
      let opaque = 0, paletteError = 0, alphaPixels = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] > 127) alphaPixels++;
        if (pixels[i + 3] !== 255) continue;
        opaque++;
        let nearest = Infinity;
        for (let j = 1; j < palette.length; j++) {
          const start = palette[j - 1], delta = palette[j].map((v, c) => v - start[c]);
          const t = Math.max(0, Math.min(1, delta.reduce((sum, v, c) => sum + v * (pixels[i + c] - start[c]), 0) / delta.reduce((sum, v) => sum + v * v, 0)));
          nearest = Math.min(nearest, Math.hypot(...delta.map((v, c) => pixels[i + c] - start[c] - t * v)));
        }
        paletteError = Math.max(paletteError, nearest);
      }
      const width = renderer.liquidWidth, count = pixels.length / 4;
      const seen = new Uint8Array(count), queue = new Int32Array(count);
      let largestComponent = 0;
      for (let i = 0; i < count; i++) {
        if (seen[i] || pixels[i * 4 + 3] < 128) continue;
        let head = 0, tail = 1; queue[0] = i; seen[i] = 1;
        while (head < tail) {
          const at = queue[head++], x = at % width;
          for (const next of [x ? at - 1 : -1, x + 1 < width ? at + 1 : -1, at - width, at + width]) {
            if (next < 0 || next >= count || seen[next] || pixels[next * 4 + 3] < 128) continue;
            seen[next] = 1; queue[tail++] = next;
          }
        }
        largestComponent = Math.max(largestComponent, tail);
      }
      const animationChange = error(pixels, render(a, 2));
      const emptyPixels = render(RegionMaps.empty().useLiquidArea()).filter((value, i) => i % 4 === 3 && value).length;
      // Wide selections used to lose every opening and saturate to the final
      // palette color. Probe well inside an edge selection, plus a full canvas:
      // perimeter detail alone must not make this regression pass.
      const broad = RegionMaps.empty().useLiquidArea(), full = RegionMaps.empty().useLiquidArea();
      broad.paint('liquid', [0, .45], [.17, 1], 900, 16 / 9);
      full.paint('liquid', [0, .5], [1, .5], 4000, 16 / 9);
      const interiors = [];
      // readPixels starts at the bottom: this probes screen y=.6 through .95.
      for (const [name, regions, bounds] of [['edge', broad, [0, .05, .12, .4]], ['full', full, [0, 0, 1, 1]]]) {
        for (const time of [0, 2, 4]) {
          const material = render(regions, time), height = renderer.liquidHeight;
          let total = 0, filled = 0, openings = 0, varied = 0;
          for (let y = Math.floor(bounds[1] * height); y < bounds[3] * height; y++) {
            for (let x = Math.floor(bounds[0] * width); x < bounds[2] * width; x++) {
              const i = (y * width + x) * 4, alpha = material[i + 3]; total++;
              if (alpha < 32) openings++;
              if (alpha > 127) filled++;
              if (alpha === 255 && Math.hypot(material[i] - 255, material[i + 1], material[i + 2]) > 24) varied++;
            }
          }
          interiors.push({ name, time, coverage: filled / total, openings: openings / total, varied: varied / filled });
        }
      }
      return { orderError, repeatError, opaque, paletteError, connectedRatio: largestComponent / alphaPixels, animationChange, emptyPixels, interiors };
    } finally { renderer.destroy(); }
  });
  assert.equal(metrics.orderError, 0, 'The union is independent of gesture order');
  assert.equal(metrics.repeatError, 0, 'Repainting cannot accumulate material or opacity');
  assert.ok(metrics.opaque > 3000, 'The shared material has a substantial interior');
  assert.ok(metrics.paletteError < 2, `Each interior pixel receives one palette color, without averaged layers: ${metrics.paletteError}`);
  assert.ok(metrics.connectedRatio > .9, 'A connected guide produces one dominant liquid body');
  assert.ok(metrics.animationChange > 20, 'The shared surface evolves over time');
  assert.equal(metrics.emptyPixels, 0, 'An empty guide never produces stray liquid');
  for (const interior of metrics.interiors) {
    const label = `${interior.name} at ${interior.time}s`;
    assert.ok(interior.coverage > .4 && interior.coverage < .95, `A broad interior has connected material and visible openings: ${label}`);
    assert.ok(interior.openings > .05, `Openings persist away from the outline: ${label}`);
    assert.ok(interior.varied > .35, `Interior folds keep their color instead of becoming a flat fill: ${label}`);
  }
  console.log('Unified liquid GPU:', JSON.stringify(metrics));
  return metrics;
}
