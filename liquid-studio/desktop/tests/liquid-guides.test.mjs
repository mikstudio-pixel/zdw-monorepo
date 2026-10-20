import test from 'node:test';
import assert from 'node:assert/strict';
import { RegionMaps } from '../shared/regions.js';
import { liquidGuides, MAX_LIQUID_GUIDES } from '../shared/liquid-guides.js';

test('A broad stroke produces a few large liquid forms instead of tiny edge fragments', () => {
  const maps = RegionMaps.empty();
  maps.paint('liquid', [.2, .58], [.8, .4], 300, 16 / 9);
  const guides = liquidGuides(maps.layers.liquid, 16 / 9);
  assert.ok(guides.length >= 3 && guides.length <= 7, `${guides.length} forms for a broad stroke`);
  assert.ok(guides.every(guide => guide[2] > .4), 'No small rings along the stroke contour');
  assert.deepEqual(liquidGuides(new RegionMaps(maps.serialize()).layers.liquid, 16 / 9), guides);
});

test('Disconnected strokes each keep a local source; empty fields remain empty in all aspects', () => {
  for (const aspect of [16 / 9, 9 / 16, 1]) {
    const maps = RegionMaps.empty();
    assert.deepEqual(liquidGuides(maps.layers.liquid, aspect), []);
    maps.paint('liquid', [.2, .2], [.2, .2], 100, aspect);
    maps.paint('liquid', [.8, .8], [.8, .8], 100, aspect);
    const guides = liquidGuides(maps.layers.liquid, aspect);
    assert.ok(guides.some(guide => guide[0] < 0 && guide[1] > 0));
    assert.ok(guides.some(guide => guide[0] > 0 && guide[1] < 0));
    assert.ok(guides.every(guide => guide.every(Number.isFinite) && guide[2] > 0));
  }
});

test('Object erasure removes the complete guide and repainting starts with no cuts', () => {
  const maps = RegionMaps.empty();
  maps.paint('liquid', [.2, .5], [.8, .5], 220, 16 / 9);
  maps.eraseLiquid([.5, .5], [.5, .5], 150, 16 / 9, maps.liquidPasses.map(pass => ({ pass, alpha: pass.mask })));
  assert.deepEqual(liquidGuides(maps.layers.liquid, 16 / 9), []);
  const center = 256 * 512 + 256;
  maps.paint('liquid', [.5, .5], [.5, .5], 150, 16 / 9);
  assert.equal(maps.liquidPasses.length, 1);
  assert.equal(maps.liquidPasses[0].mask[center], 255);
  assert.equal(maps.liquidPasses[0].erase.some(Boolean), false, 'Fresh liquid has no inherited circular clip');
  maps.clear('liquid');
  assert.deepEqual(liquidGuides(maps.layers.liquid, 16 / 9), []);
  assert.equal(maps.layers.liquidErase.some(Boolean), false);
});

test('Brush diameter scales the actual forms, including when the canvas crops a broad stroke', () => {
  for (const aspect of [16 / 9, 1, 9 / 16]) {
    const scales = [];
    for (const diameter of [480, 960, 1440]) {
      const maps = RegionMaps.empty();
      maps.paint('liquid', [.5, .5], [.5, .5], diameter, aspect);
      const guides = liquidGuides(maps.layers.liquid, aspect, 50, maps.liquidPasses[0].diameter);
      assert.ok(guides.length > 0 && guides.length <= 2, 'A broad dab remains a large form, not a texture of small tiles');
      scales.push(guides[0][2]);
    }
    assert.ok(Math.abs(scales[1] / scales[0] - 2) < 1e-6);
    assert.ok(Math.abs(scales[2] / scales[0] - 3) < 1e-6);
  }
});

test('Dense marks stay bounded and cover the canvas instead of discarding its far side', () => {
  const maps = RegionMaps.empty(); maps.layers.liquid.fill(255);
  const guides = liquidGuides(maps.layers.liquid, 16 / 9);
  assert.ok(guides.length > 1 && guides.length <= MAX_LIQUID_GUIDES);
  assert.ok(guides.some(guide => guide[0] < -.4) && guides.some(guide => guide[0] > .4));
  assert.ok(guides.some(guide => guide[1] < -.2) && guides.some(guide => guide[1] > .2));
});

test('Closing gaps preserves the exact original anchors and their sizes', () => {
  const maps = RegionMaps.empty();
  maps.paint('liquid', [.2, .58], [.8, .4], 300, 16 / 9);
  const original = liquidGuides(maps.layers.liquid, 16 / 9);
  for (const structure of [50, 65, 80, 100]) assert.deepEqual(liquidGuides(maps.layers.liquid, 16 / 9, structure), original);
  const fine = liquidGuides(maps.layers.liquid, 16 / 9, 0);
  assert.ok(fine.length > original.length && fine.length <= MAX_LIQUID_GUIDES);
});

test('Fine liquid brush diameters (60-180 px) form valid anchors with positive scale', () => {
  for (const diameter of [60, 120, 180]) {
    const maps = RegionMaps.empty();
    maps.paint('liquid', [.4, .5], [.6, .5], diameter, 16 / 9);
    const guides = liquidGuides(maps.layers.liquid, 16 / 9, 50, diameter);
    assert.ok(guides.length > 0 && guides.length <= MAX_LIQUID_GUIDES, `Diameter ${diameter} px forms guides`);
    assert.ok(guides.every(g => g.every(Number.isFinite) && g[2] > 0), `Diameter ${diameter} px guides are valid`);
  }
});
