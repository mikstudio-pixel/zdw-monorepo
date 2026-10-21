import test from 'node:test';
import assert from 'node:assert/strict';
import { RegionMaps, REGION_SIZE, REGION_PIXELS, validateRegions } from '../shared/regions.js';
import { liquidAreaDistance } from '../shared/liquid-area.js';
import { DEFAULTS, parseSettings, serializeSettings } from '../shared/settings.js';

test('Area paint unions gestures and brush sizes into one field; repeated paint is idempotent', () => {
  const maps = RegionMaps.empty().useLiquidArea();
  for (let i = 0; i < 80; i++) {
    maps.beginLiquidStroke();
    maps.paint('liquid', [.1, .2], [.9, .8], i % 2 ? 180 : 480, 9 / 16);
  }
  assert.equal(maps.liquidPasses.length, 1);
  assert.equal(maps.liquidPasses[0].diameter, 0);
  const before = maps.snapshot(), version = maps.liquidVersion;
  maps.beginLiquidStroke(); maps.paint('liquid', [.1, .2], [.9, .8], 480, 9 / 16);
  assert.deepEqual(maps.snapshot(), before);
  assert.equal(maps.liquidVersion, version);
  const file = serializeSettings({ ...DEFAULTS, regions: maps.serialize() });
  assert.equal(JSON.parse(file).version, 5);
  const restored = new RegionMaps(parseSettings(file).regions);
  assert.deepEqual(restored.snapshot(), before);
});

test('Area erasure removes local paint, preserves distant regions and supports undo and repaint', () => {
  const maps = RegionMaps.empty().useLiquidArea();
  maps.paint('liquid', [.2, .5], [.8, .5], 180, 1);
  const before = maps.snapshot();
  maps.paint('liquid', [.5, .4], [.5, .6], 160, 1, true);
  const at = x => maps.layers.liquid[256 * REGION_SIZE + Math.floor(x * REGION_SIZE)];
  assert.equal(at(.5), 0); assert.equal(at(.2), 255); assert.equal(at(.8), 255);
  maps.restore(before); assert.equal(at(.5), 255);
  maps.clear('liquid'); maps.paint('liquid', [.5, .5], [.5, .5], 60, 1);
  assert.equal(maps.liquidMode, 'area'); assert.equal(at(.5), 255);
});

test('Distance field preserves disconnected components and uses physical aspect coordinates', () => {
  for (const aspect of [9 / 16, 1, 16 / 9]) {
    const maps = RegionMaps.empty().useLiquidArea();
    maps.paint('liquid', [.15, .15], [.15, .3], 120, aspect);
    maps.paint('liquid', [.85, .7], [.85, .85], 120, aspect);
    const field = liquidAreaDistance(maps.layers.liquid, aspect);
    const precise = liquidAreaDistance(maps.layers.liquid, aspect, { float: true });
    assert.ok(precise instanceof Float32Array);
    assert.ok(precise.every((value, i) => value >= 0 && value <= 1 && Math.abs(value * 255 - field[i]) <= .501));
    const at = (x, y) => field[Math.floor(y * REGION_SIZE) * REGION_SIZE + Math.floor(x * REGION_SIZE)];
    assert.ok(at(.15, .2) > 128); assert.ok(at(.85, .8) > 128);
    assert.equal(at(.5, .5), 0);
    assert.deepEqual(liquidAreaDistance(new RegionMaps(maps.serialize()).layers.liquid, aspect), field);
  }
  const empty = new Uint8Array(REGION_PIXELS);
  assert.ok(liquidAreaDistance(empty, 1).every(value => value === 0));
  empty.fill(255);
  assert.ok(liquidAreaDistance(empty, 1).every(value => value === 255), 'A full canvas has no artificial border');
});

test('Area conversion merges legacy overlapping passes while preserving their cuts', () => {
  const maps = RegionMaps.empty();
  maps.paint('liquid', [.2, .3], [.7, .3], 180, 1);
  maps.beginLiquidStroke(); maps.paint('liquid', [.4, .6], [.8, .6], 360, 1);
  assert.equal(maps.liquidPasses.length, 2);
  maps.liquidPasses[0].erase.fill(255, 120 * REGION_SIZE, 140 * REGION_SIZE);
  const expected = maps.liquidPasses[0].mask.map((value, i) => Math.max(Math.min(value, 255 - maps.liquidPasses[0].erase[i]), maps.liquidPasses[1].mask[i]));
  maps.useLiquidArea();
  assert.equal(maps.liquidPasses.length, 1); assert.deepEqual(maps.layers.liquid, expected);
  assert.equal(new RegionMaps(RegionMaps.empty().serialize()).liquidMode, undefined);
  assert.throws(() => validateRegions({ liquidMode: 'bad' }), /režim/);
  assert.throws(() => validateRegions({ liquidMode: 'area' }), /společnou masku/);
  const area = maps.serialize();
  assert.throws(() => validateRegions({ ...area, liquid: [...area.liquid, ...area.liquid] }), /společnou masku/);
  assert.throws(() => validateRegions({ ...area, liquid: [{ ...area.liquid[0], diameter: 180 }] }), /společnou masku/);
});
