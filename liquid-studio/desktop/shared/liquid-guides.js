import { REGION_SIZE } from './regions.js';

export const MAX_LIQUID_GUIDES = 128;
// Fine structure subdivides the guide. Above the midpoint, keep exactly the
// same anchors and extent; the shader closes internal gaps instead of swelling.
export function liquidScale(structure = 50) {
  const amount = (structure - 50) / 50;
  return amount < 0 ? Math.pow(.45, -amount) : 1;
}

// The brush is a direction field, not an alpha mask. Find the broad ridges of
// its distance transform and place a sparse chain of the original liquid rings.
// All choices depend on the saved field, never pointer delivery or frame time.
export function liquidGuides(mask, aspect, structure = 50, diameter = 0) {
  const scale = liquidScale(structure);
  const n = REGION_SIZE, dx = aspect / n, dy = 1 / n, diagonal = Math.hypot(dx, dy);
  const distance = new Float32Array(n * n);
  let occupied = false;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    if (mask[i] < 128) continue;
    occupied = true;
    distance[i] = Math.min((x + 1) * dx, (n - x) * dx, (y + 1) * dy, (n - y) * dy);
  }
  if (!occupied) return [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    if (x) distance[i] = Math.min(distance[i], distance[i - 1] + dx);
    if (y) {
      distance[i] = Math.min(distance[i], distance[i - n] + dy);
      if (x) distance[i] = Math.min(distance[i], distance[i - n - 1] + diagonal);
      if (x < n - 1) distance[i] = Math.min(distance[i], distance[i - n + 1] + diagonal);
    }
  }
  for (let y = n - 1; y >= 0; y--) for (let x = n - 1; x >= 0; x--) {
    const i = y * n + x;
    if (x < n - 1) distance[i] = Math.min(distance[i], distance[i + 1] + dx);
    if (y < n - 1) {
      distance[i] = Math.min(distance[i], distance[i + n] + dy);
      if (x) distance[i] = Math.min(distance[i], distance[i + n - 1] + diagonal);
      if (x < n - 1) distance[i] = Math.min(distance[i], distance[i + n + 1] + diagonal);
    }
  }
  // New strokes keep their actual brush scale even when the canvas crops the
  // stroke. The distance-derived limit only applies to imported legacy fields.
  const candidates = [], maxRadius = diameter ? diameter / 2160 : 220 / 1080, epsilon = 1e-6;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, d = distance[i];
    if (!d) continue;
    const left = x ? distance[i - 1] : 0, right = x < n - 1 ? distance[i + 1] : 0;
    const up = y ? distance[i - n] : 0, down = y < n - 1 ? distance[i + n] : 0;
    const ridge = (d >= left - epsilon && d >= right - epsilon && d > Math.min(left, right) + epsilon)
      || (d >= up - epsilon && d >= down - epsilon && d > Math.min(up, down) + epsilon);
    if ((ridge || d >= maxRadius) && (x % 2 === 0 || y % 2 === 0)) candidates.push({ x: (x + .5) / n * aspect, y: (y + .5) / n, radius: diameter ? maxRadius : Math.min(d, maxRadius), distance: d });
  }
  candidates.sort((a, b) => (diameter ? b.distance - a.distance : b.radius - a.radius) || a.y - b.y || a.x - b.x);
  // Extremely dense marks become larger connected forms instead of silently
  // dropping later parts of the painting when the uniform budget is reached.
  let minimumRadius = Math.min(24 / 1080, maxRadius * 0.75), guides;
  do {
    guides = [];
    for (const candidate of candidates) {
      const radius = Math.max(minimumRadius, candidate.radius) * scale;
      // A large form owns its surrounding contour. Do not fill the leftover
      // edge pixels with tiny rings: that creates spray instead of folded liquid.
      if (guides.some(other => Math.hypot(other.x - candidate.x, other.y - candidate.y) < Math.max(.86 * (other.radius + radius), 1.7 * other.radius))) continue;
      guides.push({ ...candidate, radius });
      if (guides.length > MAX_LIQUID_GUIDES) break;
    }
    minimumRadius *= 1.35;
  } while (guides.length > MAX_LIQUID_GUIDES);
  return guides.map(({ x, y, radius }) => [
    x - aspect / 2, .5 - y,
    radius * 1.12 / ((253 + 117) * .89 / 1080),
    ((Math.round(x * 511) * 37 + Math.round(y * 511) * 17) % 101) / 17,
  ]);
}
