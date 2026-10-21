import { RegionMaps, REGION_PIXELS, REGION_SIZE } from './regions.js';
import { liquidAreaDistance, liquidAreaFrame, sampleAreaDistance } from './liquid-area.js';

export const MORPH_FRAMES = 60; // Two seconds at the shared 30 fps timebase.
export const MAX_KEYFRAMES = 32;
export const EFFECT_KEYS = ['size', 'strength', 'aberration', 'blur', 'liquid', 'opacity', 'liquidStructure', 'liquidColors', 'regions'];

export function captureEffects(settings) {
  const effects = Object.fromEntries(EFFECT_KEYS.map(key => [key, settings[key]]));
  effects.regions = new RegionMaps(settings.regions).serialize({ compact: true });
  return effects;
}

export function putKeyframe(keyframes, frame, effects) {
  if (!Number.isInteger(frame) || frame < 0 || frame > 5400) throw new Error('Neplatný čas klíčového snímku.');
  const result = keyframes.filter(key => key.frame !== frame);
  if (result.length >= MAX_KEYFRAMES) throw new Error('Timeline už obsahuje 32 klíčových snímků.');
  return [...result, { frame, effects }].sort((a, b) => a.frame - b.frame);
}

function mixColor(a, b, amount) {
  const values = [1, 3, 5].map(index => Math.round(parseInt(a.slice(index, index + 2), 16) * (1 - amount) + parseInt(b.slice(index, index + 2), 16) * amount));
  return '#' + values.map(value => value.toString(16).padStart(2, '0')).join('');
}

export function sampleKeyframes(settings, frame) {
  const keys = settings.keyframes;
  if (!keys?.length) return { state: settings, mix: 0 };
  let before = keys[0], after = keys[0];
  for (const key of keys) {
    if (key.frame <= frame) before = after = key;
    else { after = key; break; }
  }
  const start = Math.max(before.frame, after.frame - MORPH_FRAMES);
  const amount = before === after ? 0 : Math.max(0, Math.min(1, (frame - start) / (after.frame - start)));
  const state = { ...settings, ...before.effects };
  for (const key of EFFECT_KEYS) {
    if (typeof state[key] === 'number') state[key] += (after.effects[key] - state[key]) * amount;
  }
  state.liquidColors = before.effects.liquidColors.map((color, i) => mixColor(color, after.effects.liquidColors[i], amount));
  state.liquid = before.effects.liquid || after.effects.liquid;
  state.opacity = (before.effects.liquid ? before.effects.opacity : 0) * (1 - amount) + (after.effects.liquid ? after.effects.opacity : 0) * amount;
  return { state, next: after.effects.regions, mix: amount };
}

// Editing a position between keys starts from the visible interpolated shape.
// Playback itself interpolates the two distance textures directly on the GPU.
export function materializeKeyframe(settings, frame) {
  const sample = sampleKeyframes(settings, frame);
  if (!sample.mix) return sample.state;
  const maps = new RegionMaps(sample.state.regions), next = new RegionMaps(sample.next);
  const aspect = settings.aspect === '9:16' ? 9 / 16 : settings.aspect === '16:9' ? 16 / 9 : 1;
  const a = liquidAreaDistance(maps.layers.liquid, aspect), b = liquidAreaDistance(next.layers.liquid, aspect);
  const from = liquidAreaFrame(maps.layers.liquid), to = liquidAreaFrame(next.layers.liquid);
  const current = from.map((value, i) => value * (1 - sample.mix) + to[i] * sample.mix);
  for (let i = 0; i < REGION_PIXELS; i++) {
    const x = ((i % REGION_SIZE + .5) / REGION_SIZE - current[0]) / current[2];
    const y = ((Math.floor(i / REGION_SIZE) + .5) / REGION_SIZE - current[1]) / current[3];
    const da = sampleAreaDistance(a, from[0] + x * from[2], from[1] + y * from[3]);
    const db = sampleAreaDistance(b, to[0] + x * to[2], to[1] + y * to[3]);
    maps.layers.liquid[i] = da * (1 - sample.mix) + db * sample.mix >= 127.5 ? 255 : 0;
    maps.layers.glass[i] = Math.round(maps.layers.glass[i] * (1 - sample.mix) + next.layers.glass[i] * sample.mix);
  }
  return { ...sample.state, regions: maps.serialize() };
}
