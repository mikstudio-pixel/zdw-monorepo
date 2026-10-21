import { REGION_SIZE, REGION_PIXELS } from './regions.js';

export const AREA_DISTANCE_RANGE = 128 / 1080;

export function liquidAreaFrame(mask) {
  let left = REGION_SIZE, top = REGION_SIZE, right = -1, bottom = -1;
  for (let i = 0; i < mask.length; i++) if (mask[i] >= 128) {
    const x = i % REGION_SIZE, y = Math.floor(i / REGION_SIZE);
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return right < 0 ? [.5, .5, 1, 1] : [(left + right + 1) / (2 * REGION_SIZE), (top + bottom + 1) / (2 * REGION_SIZE), (right - left + 1) / REGION_SIZE, (bottom - top + 1) / REGION_SIZE];
}

export function sampleAreaDistance(field, x, y) {
  const n = REGION_SIZE;
  x = Math.max(0, Math.min(n - 1, x * n - .5));
  y = Math.max(0, Math.min(n - 1, y * n - .5));
  const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy;
  const x1 = Math.min(n - 1, ix + 1), y1 = Math.min(n - 1, iy + 1);
  return (field[iy * n + ix] * (1 - tx) + field[iy * n + x1] * tx) * (1 - ty)
    + (field[y1 * n + ix] * (1 - tx) + field[y1 * n + x1] * tx) * ty;
}

// A signed distance to the union, in output-height units. The brush size and
// gesture history never enter this calculation. Canvas edges are not cuts.
// The renderer keeps subpixel precision; compact CPU morphs use the byte form.
export function liquidAreaDistance(mask, aspect, { float = false } = {}) {
  const n = REGION_SIZE, dx = aspect / n, dy = 1 / n, diagonal = Math.hypot(dx, dy);
  const distanceTo = inside => {
    const distance = new Float32Array(REGION_PIXELS);
    for (let i = 0; i < REGION_PIXELS; i++) distance[i] = (mask[i] >= 128) === inside ? 0 : AREA_DISTANCE_RANGE;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x;
      if (x) distance[i] = Math.min(distance[i], distance[i - 1] + dx);
      if (y) {
        distance[i] = Math.min(distance[i], distance[i - n] + dy);
        if (x) distance[i] = Math.min(distance[i], distance[i - n - 1] + diagonal);
        if (x + 1 < n) distance[i] = Math.min(distance[i], distance[i - n + 1] + diagonal);
      }
    }
    for (let y = n - 1; y >= 0; y--) for (let x = n - 1; x >= 0; x--) {
      const i = y * n + x;
      if (x + 1 < n) distance[i] = Math.min(distance[i], distance[i + 1] + dx);
      if (y + 1 < n) {
        distance[i] = Math.min(distance[i], distance[i + n] + dy);
        if (x) distance[i] = Math.min(distance[i], distance[i + n - 1] + diagonal);
        if (x + 1 < n) distance[i] = Math.min(distance[i], distance[i + n + 1] + diagonal);
      }
    }
    return distance;
  };
  const outside = distanceTo(false), inside = distanceTo(true);
  const data = float ? new Float32Array(REGION_PIXELS) : new Uint8Array(REGION_PIXELS);
  for (let i = 0; i < REGION_PIXELS; i++) {
    const value = .5 + .5 * (outside[i] - inside[i]) / AREA_DISTANCE_RANGE;
    data[i] = float ? value : Math.round(value * 255);
  }
  return data;
}
