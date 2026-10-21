import { EMPTY_REGIONS, validateRegions, MAX_SETTINGS_BYTES } from './regions.js';
import { EFFECT_KEYS, MAX_KEYFRAMES } from './keyframes.js';

export const DEFAULT_LIQUID_COLORS = Object.freeze([
  '#c9bf91', '#c2bda5', '#a7bae2', '#98b0fd', '#e8d160', '#fd534c', '#df2d67',
]);
export const PALETTE_COLORS = Object.freeze([
  '#16533f', '#f8cf49', '#9fbaff', '#5c300f', '#fd3d62', '#ffa9ef',
]);
export const PALETTE_PRESET_COLORS = Object.freeze([
  '#16533f', '#5c300f', '#9fbaff', '#f8cf49', '#ffa9ef', '#fd3d62', '#16533f',
]);

export function liquidPaletteFloats(colors = DEFAULT_LIQUID_COLORS) {
  return new Float32Array(colors.flatMap(hex => {
    const value = Number.parseInt(hex.slice(1), 16);
    return [value >> 16 & 255, value >> 8 & 255, value & 255];
  }));
}

export const FPS = 30;
export const FORMATS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080] };
export const DEFAULTS = Object.freeze({
  aspect: '16:9', size: 146, strength: 100, aberration: 100, blur: 0,
  liquid: false, opacity: 65, liquidStructure: 50, cropX: 50, cropY: 50, cropZoom: 100,
  liquidColors: DEFAULT_LIQUID_COLORS,
  regions: EMPTY_REGIONS,
});
export const PRESETS = {
  signature: { label: 'Signature', size: 146, strength: 100, aberration: 100, blur: 0, liquid: false, opacity: 65, liquidStructure: 50 },
  soft: { label: 'Soft frost', size: 220, strength: 65, aberration: 25, blur: 5, liquid: false, opacity: 45, liquidStructure: 50 },
  festival: { label: 'Festival', size: 180, strength: 140, aberration: 150, blur: 1, liquid: true, opacity: 80, liquidStructure: 50 },
};
const limits = { size: [60, 360], strength: [0, 200], aberration: [0, 200], blur: [0, 12], opacity: [0, 100], liquidStructure: [0, 100], cropX: [0, 100], cropY: [0, 100], cropZoom: [100, 250] };
export function validateSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Nastavení efektu má neplatný formát.');
  const result = { ...DEFAULTS };
  if (value.aspect !== undefined) {
    if (!Object.hasOwn(FORMATS, value.aspect)) throw new Error('Neplatný poměr stran.');
    result.aspect = value.aspect;
  }
  if (value.liquid !== undefined) {
    if (typeof value.liquid !== 'boolean') throw new Error('Neplatné nastavení vrstvy liquidu.');
    result.liquid = value.liquid;
  }
  if (value.mediaFit !== undefined) {
    if (value.mediaFit !== 'contain') throw new Error('Neplatné přizpůsobení média.');
    result.mediaFit = 'contain';
  }
  if (value.liquidColors !== undefined) {
    if (!Array.isArray(value.liquidColors) || value.liquidColors.length !== 7 ||
        !value.liquidColors.every(c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))) {
      throw new Error('Neplatné nastavení barev liquidu.');
    }
    result.liquidColors = Object.freeze([...value.liquidColors.map(c => c.toLowerCase())]);
  }
  for (const [key, [min, max]] of Object.entries(limits)) {
    if (value[key] === undefined) continue;
    if (!Number.isFinite(value[key]) || value[key] < min || value[key] > max) throw new Error(`Nastavení „${key}“ musí být v rozsahu ${min}–${max}.`);
    result[key] = value[key];
  }
  result.regions = validateRegions(value.regions);
  if (value.keyframes !== undefined) {
    if (!Array.isArray(value.keyframes) || !value.keyframes.length || value.keyframes.length > MAX_KEYFRAMES) throw new Error('Neplatné klíčové snímky.');
    let previous = -1;
    result.keyframes = value.keyframes.map(key => {
      if (!Number.isInteger(key?.frame) || key.frame <= previous || key.frame > 5400 || !key.effects || Object.hasOwn(key.effects, 'keyframes')) throw new Error('Neplatný klíčový snímek.');
      previous = key.frame;
      const effect = validateSettings(key.effects);
      if (effect.regions.liquidMode !== 'area') throw new Error('Klíčové snímky vyžadují oblast liquidu.');
      return { frame: key.frame, effects: Object.fromEntries(EFFECT_KEYS.map(name => [name, effect[name]])) };
    });
  }
  return result;
}
export function parseSettings(text) {
  let file;
  try { file = JSON.parse(text); } catch { throw new Error('Soubor nastavení není platný JSON.'); }
  if (file?.type !== 'zdw-liquid-studio' || ![1, 2, 3, 4, 5, 6].includes(file.version)) throw new Error('Tato verze souboru nastavení není podporovaná.');
  return validateSettings(file.settings);
}
export function serializeSettings(settings) {
  const version = settings.keyframes?.length || settings.regions?.glass?.rle || settings.mediaFit ? 6 : settings.regions?.liquidMode === 'area' ? 5 : 4;
  const text = JSON.stringify({ type: 'zdw-liquid-studio', version, settings: validateSettings(settings) }, null, 2) + '\n';
  if (text.length > MAX_SETTINGS_BYTES) throw new Error('Kompozice překračuje maximální velikost souboru nastavení.');
  return text;
}
// Visible fraction of the source; position always stays inside its bounds.
export function cropTransform(sourceAspect, outputAspect, settings) {
  if (settings.mediaFit === 'contain') {
    const width = Math.max(1, outputAspect / sourceAspect), height = Math.max(1, sourceAspect / outputAspect);
    return { scale: [width, height], offset: [(1 - width) / 2, (1 - height) / 2] };
  }
  let width = Math.min(1, outputAspect / sourceAspect) * 100 / settings.cropZoom;
  let height = Math.min(1, sourceAspect / outputAspect) * 100 / settings.cropZoom;
  return { scale: [width, height], offset: [(1 - width) * settings.cropX / 100, (1 - height) * settings.cropY / 100] };
}
