export const DEFAULT_LIQUID_COLORS = Object.freeze([
  '#e99ae6', '#b5b0ed', '#a2b8f6', '#f4d45e', '#f89954', '#ed3b66', '#20583f',
]);

export const PALETTE_COLORS = Object.freeze([
  '#16533f', '#f8cf49', '#9fbaff', '#5c300f', '#fd3d62', '#ffa9ef',
]);

const [green, yellow, blue, brown, red, pink] = PALETTE_COLORS;
// Colorama controls in phase order. The extra editable stop is the midpoint
// between red and yellow, rounded to the nearest swatch color.
export const AREA_DEFAULT_LIQUID_COLORS = Object.freeze([
  brown, green, red, '#fb8656', yellow, blue, pink,
]);

export function areaLiquidColors(colors = DEFAULT_LIQUID_COLORS) {
  // Older compositions stored the legacy gradient to select the native ramp.
  return colors.every((color, index) => color.toLowerCase() === DEFAULT_LIQUID_COLORS[index])
    ? AREA_DEFAULT_LIQUID_COLORS
    : colors;
}
