import test from 'node:test';
import assert from 'node:assert/strict';
import { RegionMaps, REGION_PIXELS, canvasPoint } from '../shared/regions.js';
import { DEFAULTS, serializeSettings, parseSettings, validateSettings } from '../shared/settings.js';
import { captureEffects, putKeyframe, sampleKeyframes, materializeKeyframe, MORPH_FRAMES } from '../shared/keyframes.js';

function scene(x, colors = DEFAULTS.liquidColors) {
  const maps = RegionMaps.empty().useLiquidArea();
  maps.paint('liquid', [x, .4], [x, .6], 160, 1);
  maps.paint('glass', [x, .5], [x, .5], 40, 1);
  return { ...DEFAULTS, aspect: '1:1', liquid: true, liquidColors: colors, regions: maps.serialize() };
}
const track = () => {
  const a = scene(.2), b = scene(.8, Array(7).fill('#ffffff'));
  return { ...a, keyframes: [{ frame: 0, effects: captureEffects(a) }, { frame: 150, effects: captureEffects(b) }] };
};

test('A new shape holds its predecessor, then morphs over the two seconds before its target', () => {
  const settings = track();
  assert.equal(MORPH_FRAMES, 60);
  for (const frame of [0, 45, 89, 90]) assert.equal(sampleKeyframes(settings, frame).mix, 0);
  assert.equal(sampleKeyframes(settings, 120).mix, .5);
  assert.deepEqual(sampleKeyframes(settings, 150).state.regions, settings.keyframes[1].effects.regions);
  assert.deepEqual(sampleKeyframes(settings, 999).state.regions, settings.keyframes[1].effects.regions);
  const short = { ...settings, keyframes: [settings.keyframes[0], { ...settings.keyframes[1], frame: 30 }] };
  assert.equal(sampleKeyframes(short, 15).mix, .5, 'Closely spaced targets use the available interval');
  assert.deepEqual(sampleKeyframes(settings, 120).state.liquidColors[0], '#e4dfc8');
});

test('Keyframes compactly round-trip distinct liquid and cube shapes; replacement is sorted and bounded', () => {
  let settings = track();
  for (let frame = 160; frame < 185; frame++) settings.keyframes = putKeyframe(settings.keyframes, frame, captureEffects(scene(.5)));
  settings.keyframes = putKeyframe(settings.keyframes, 150, captureEffects(scene(.65)));
  assert.equal(settings.keyframes.length, 27);
  const text = serializeSettings(settings);
  assert.equal(JSON.parse(text).version, 6);
  assert.ok(text.length < 500_000, 'Compact masks fit many shapes inside the existing settings limit');
  const restored = parseSettings(text);
  for (let i = 0; i < settings.keyframes.length; i++) {
    assert.deepEqual(new RegionMaps(restored.keyframes[i].effects.regions).snapshot(), new RegionMaps(settings.keyframes[i].effects.regions).snapshot());
  }
  assert.throws(() => putKeyframe([], -1, {}));
  assert.throws(() => putKeyframe([], 1.5, {}));
  assert.throws(() => validateSettings({ ...settings, keyframes: [settings.keyframes[1], settings.keyframes[0]] }));
  assert.throws(() => validateSettings({ ...settings, keyframes: [{ frame: 0, effects: { ...settings, keyframes: [] } }] }));
});

test('Editing between keyframes materializes a separate shape without mutating either endpoint', () => {
  const settings = track(), before = JSON.stringify(settings);
  const state = materializeKeyframe(settings, 120);
  const maps = new RegionMaps(state.regions);
  assert.equal(maps.layers.liquid.length, REGION_PIXELS);
  assert.equal(maps.liquidMode, 'area');
  assert.equal(JSON.stringify(settings), before);
  maps.paint('liquid', [.5, .5], [.5, .5], 160, 1);
  assert.equal(JSON.stringify(settings), before);
});

test('Full-screen drawing preserves the whole frame and ignores letterbox space', () => {
  const rect = { left: 0, top: 0, width: 390, height: 844 };
  assert.deepEqual(canvasPoint(195, 422, rect, 1080, 1920), [.5, .5]);
  assert.equal(canvasPoint(0, 422, rect, 1080, 1920)[0], 0);
  assert.equal(canvasPoint(195, 10, rect, 1080, 1920), null);
});
