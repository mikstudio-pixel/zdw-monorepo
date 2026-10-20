import test from 'node:test';
import assert from 'node:assert/strict';
import { RegionMaps, REGION_SIZE, canvasPoint, MAX_SETTINGS_BYTES } from '../shared/regions.js';
import { DEFAULTS, FORMATS, parseSettings, serializeSettings } from '../shared/settings.js';

const pixel = (maps, layer, x, y) => maps.layers[layer][Math.floor(y * REGION_SIZE) * REGION_SIZE + Math.floor(x * REGION_SIZE)];

test('Fast brush strokes stay continuous in every aspect; layer erasure and snapshots are independent', () => {
  for (const [w, h] of Object.values(FORMATS)) {
    const maps = RegionMaps.empty(), aspect = w / h;
    maps.paint('glass', [.1, .5], [.9, .5], 80, aspect);
    maps.paint('liquid', [.5, .2], [.5, .8], 80, aspect);
    for (let x = .11; x < .9; x += .03) assert.equal(pixel(maps, 'glass', x, .5), 255);
    const before = maps.snapshot();
    maps.eraseLiquid([.5, .5], [.5, .5], 160, aspect, maps.liquidPasses.map(pass => ({ pass, alpha: pass.mask })));
    assert.equal(maps.layers.liquid.some(Boolean), false);
    assert.equal(maps.layers.liquidErase.some(Boolean), false);
    assert.equal(pixel(maps, 'glass', .5, .5), 255);
    assert.equal(pixel(maps, 'liquid', .5, .25), 0, 'The distant tail is erased too');
    maps.restore(before); assert.equal(pixel(maps, 'liquid', .5, .5), 255);
    maps.clear('glass'); assert.equal(maps.layers.glass.some(Boolean), false);
    assert.equal(pixel(maps, 'liquid', .5, .5), 255);
  }
});

test('Mask files round-trip losslessly within the file limit and old settings keep their placement', () => {
  const maps = RegionMaps.empty();
  maps.paint('glass', [.02, .05], [.92, .94], 200, 16 / 9);
  maps.paint('liquid', [.8, .1], [.1, .9], 300, 16 / 9);
  maps.beginLiquidStroke();
  maps.paint('liquid', [.5, .5], [.7, .4], 960, 16 / 9);
  const repainted = maps.snapshot();
  maps.eraseLiquid([0, .5], [1, .5], 480, 16 / 9, maps.liquidPasses.map(pass => ({ pass, alpha: pass.mask })));
  assert.equal(maps.layers.liquid.some(Boolean), false);
  maps.restore(repainted);
  const file = serializeSettings({ ...DEFAULTS, regions: maps.serialize() });
  assert.ok(Buffer.byteLength(file) < MAX_SETTINGS_BYTES);
  const restored = new RegionMaps(parseSettings(file).regions);
  assert.deepEqual(restored.snapshot(), maps.snapshot());
  assert.equal(restored.liquidPasses.length, 2);
  assert.equal(restored.liquidPasses[1].diameter, 960);
  assert.equal(restored.liquidPasses[1].erase.some(Boolean), false);
  const legacy = parseSettings(JSON.stringify({ type: 'zdw-liquid-studio', version: 1, settings: { liquid: true } }));
  assert.deepEqual(legacy.regions, { glass: null, liquid: null });
  const oldRegions = { glass: null, liquid: Buffer.from(maps.layers.liquid).toString('base64'), liquidErase: Buffer.from(maps.layers.liquidErase).toString('base64') };
  const old = new RegionMaps(parseSettings(JSON.stringify({ type: 'zdw-liquid-studio', version: 3, settings: { regions: oldRegions } })).regions);
  assert.equal(old.liquidPasses[0].diameter, 0, 'Version 3 keeps its distance-derived feature scale');
  assert.deepEqual(old.layers.liquid, maps.layers.liquid);
  assert.deepEqual(old.layers.liquidErase, maps.layers.liquidErase);
  assert.deepEqual(new RegionMaps(old.serialize()).snapshot(), old.snapshot());
  assert.throws(() => parseSettings(JSON.stringify({ type: 'zdw-liquid-studio', version: 2, settings: { regions: { glass: 'bad' } } })), /oblast/);
});

test('Each gesture is one object; a fast eraser deletes complete intersected objects only', () => {
  const maps = RegionMaps.empty();
  maps.beginLiquidStroke();
  maps.paint('liquid', [.1, .2], [.4, .2], 100, 1);
  maps.paint('liquid', [.4, .2], [.9, .2], 100, 1);
  maps.beginLiquidStroke();
  maps.paint('liquid', [.1, .8], [.9, .8], 100, 1);
  assert.equal(maps.liquidPasses.length, 2, 'Segments join; pointer-down separates strokes of identical size');
  const survivor = maps.liquidPasses[1], before = maps.snapshot();
  const coverage = maps.liquidPasses.map(pass => ({ pass, alpha: pass.mask }));
  assert.equal(maps.eraseLiquid([.5, .45], [.5, .55], 20, 1, coverage), false, 'Empty space does not select anything');
  maps.eraseLiquid([.5, 0], [.5, .4], 20, 1, coverage);
  assert.deepEqual(maps.liquidPasses, [survivor]);
  assert.equal(survivor.erase.some(Boolean), false);
  maps.restore(before);
  assert.equal(maps.liquidPasses.length, 2);
  maps.beginLiquidStroke(); maps.paint('liquid', [.5, .5], [.5, .5], 100, 1);
  assert.equal(maps.liquidPasses.length, 3, 'Undo then drawing still starts a new object');
});

test('Compressed liquid fields reject invalid runs and unsupported diameters', () => {
  const maps = RegionMaps.empty();
  maps.paint('liquid', [.5, .5], [.5, .5], 480, 1);
  const regions = maps.serialize();
  const settings = liquid => JSON.stringify({ type: 'zdw-liquid-studio', version: 4, settings: { regions: { ...regions, liquid } } });
  assert.throws(() => parseSettings(settings([{ ...regions.liquid[0], diameter: 9999 }])));
  for (const mask of ['', '!!!!', btoa(String.fromCharCode(0, 0, 255)), btoa(String.fromCharCode(0, 1, 255))]) {
    assert.throws(() => parseSettings(settings([{ ...regions.liquid[0], mask }])));
  }
});

test('Whole-cell occupancy respects top-left drawing coordinates and changes with cell size', () => {
  const maps = RegionMaps.empty();
  maps.paint('glass', [.75, .15], [.75, .15], 20, 16 / 9);
  for (const size of [60, 146, 360]) {
    const tiles = maps.tiles(size, 16 / 9);
    const tx = Math.floor((.75 - .5) * 1920 / size) - tiles.origin[0];
    const ty = Math.floor((.5 - .15) * 1080 / size) - tiles.origin[1];
    assert.equal(tiles.data[ty * tiles.count[0] + tx], 255);
    assert.equal(tiles.data[0], 0);
  }
});

test('Drawing ignores letterbox bars and maps displayed pixels to the output canvas', () => {
  const rect = { left: 20, top: 30, width: 800, height: 600 };
  assert.deepEqual(canvasPoint(420, 330, rect, 1920, 1080), [.5, .5]);
  assert.equal(canvasPoint(420, 40, rect, 1920, 1080), null);
  assert.equal(canvasPoint(30, 330, rect, 1080, 1920), null);
  assert.deepEqual(canvasPoint(420, 330, rect, 1080, 1920), [.5, .5]);
});

test('Glass eraser removes the whole touched cube and preserves other cells', () => {
  const maps = RegionMaps.empty();
  maps.paint('glass', [.52, .42], [.52, .42], 20, 1);
  maps.paint('glass', [.82, .42], [.82, .42], 20, 1);
  // Both points are inside the same 180 px cell, but their paint never overlaps.
  maps.eraseGlass([.62, .38], [.62, .38], 20, 1, 180);
  assert.equal(pixel(maps, 'glass', .52, .42), 0);
  assert.equal(pixel(maps, 'glass', .82, .42), 255);
});
