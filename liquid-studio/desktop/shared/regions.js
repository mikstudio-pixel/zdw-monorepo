// Normalized, top-left mask coordinates are independent of video resolution.
export const REGION_SIZE = 512;
export const REGION_PIXELS = REGION_SIZE * REGION_SIZE;
const encodedLength = Math.ceil(REGION_PIXELS / 3) * 4;
export const EMPTY_REGIONS = Object.freeze({ glass: null, liquid: null });
export const MAX_SETTINGS_BYTES = 2 * 1024 * 1024;
const MAX_LIQUID_PASSES = 64;

// Sparse paint/erase fields compress to a few KB instead of 350 KB per field.
function pack(bytes) {
  const runs = [];
  for (let i = 0; i < bytes.length;) {
    const start = i++, value = bytes[start];
    while (i < bytes.length && bytes[i] === value && i - start < 65535) i++;
    const count = i - start; runs.push(count >> 8, count & 255, value);
  }
  return encode(Uint8Array.from(runs));
}
function unpack(value) {
  if (typeof value !== 'string' || value.length > REGION_PIXELS * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Neplatný tah liquidu.');
  const runs = atob(value), bytes = new Uint8Array(REGION_PIXELS);
  let offset = 0;
  if (runs.length % 3) throw new Error('Neplatný tah liquidu.');
  for (let i = 0; i < runs.length; i += 3) {
    const count = runs.charCodeAt(i) * 256 + runs.charCodeAt(i + 1);
    if (!count || offset + count > REGION_PIXELS) throw new Error('Neplatný tah liquidu.');
    bytes.fill(runs.charCodeAt(i + 2), offset, offset + count); offset += count;
  }
  if (offset !== REGION_PIXELS) throw new Error('Neplatný tah liquidu.');
  return bytes;
}
function readPasses(value) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_LIQUID_PASSES) throw new Error('Neplatné tahy liquidu.');
  return value.map(({ diameter, mask, erase }) => {
    if (!Number.isFinite(diameter) || diameter < 0 || diameter > 1440) throw new Error('Neplatná velikost tahu liquidu.');
    return { diameter, mask: unpack(mask), erase: unpack(erase) };
  });
}

function decode(value) {
  if (typeof value !== 'string' || value.length !== encodedLength || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Soubor obsahuje neplatnou oblast efektu.');
  const text = atob(value);
  if (text.length !== REGION_PIXELS) throw new Error('Oblast efektu má neplatnou velikost.');
  return Uint8Array.from(text, char => char.charCodeAt(0));
}
function encode(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export function validateRegions(value = EMPTY_REGIONS) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Neplatné oblasti efektů.');
  const result = {};
  for (const layer of ['glass', 'liquid']) {
    const data = value[layer] ?? null;
    if (layer === 'liquid' && Array.isArray(data)) readPasses(data);
    else if (data !== null) decode(data);
    result[layer] = data;
  }
  if (value.liquidErase != null) { decode(value.liquidErase); result.liquidErase = value.liquidErase; }
  return result;
}

export class RegionMaps {
  constructor(regions = EMPTY_REGIONS) {
    this.version = 0;
    this.liquidVersion = 0;
    this.layers = {};
    this.custom = {};
    for (const layer of ['glass', 'liquid']) {
      this.custom[layer] = regions[layer] != null;
      this.layers[layer] = this.custom[layer] && !Array.isArray(regions[layer]) ? decode(regions[layer]) : new Uint8Array(REGION_PIXELS);
    }
    this.layers.liquidErase = regions.liquidErase ? decode(regions.liquidErase) : new Uint8Array(REGION_PIXELS);
    this.liquidPasses = Array.isArray(regions.liquid) ? readPasses(regions.liquid)
      : [{ diameter: 0, mask: this.layers.liquid, erase: this.layers.liquidErase }];
    this.bindLiquidLayers();
  }
  bindLiquidLayers() {
    this.layers.liquid = this.liquidPasses[0].mask;
    this.layers.liquidErase = this.liquidPasses[0].erase;
    for (const pass of this.liquidPasses) pass.sealed = pass.erase.some(Boolean);
    this.nextLiquidStroke = false;
  }
  // Pointer-down starts a new object; all coalesced segments belong to it.
  beginLiquidStroke() { this.nextLiquidStroke = true; }
  static empty() {
    const maps = new RegionMaps();
    maps.custom = { glass: true, liquid: true };
    return maps;
  }
  snapshot() {
    return { custom: { ...this.custom }, glass: this.layers.glass.slice(),
      liquidPasses: this.liquidPasses.map(({ diameter, mask, erase }) => ({ diameter, mask: mask.slice(), erase: erase.slice() })) };
  }
  restore(snapshot) {
    this.custom = { ...snapshot.custom };
    this.layers.glass.set(snapshot.glass);
    this.liquidPasses = snapshot.liquidPasses.map(({ diameter, mask, erase }) => ({ diameter, mask: mask.slice(), erase: erase.slice() }));
    this.bindLiquidLayers();
    this.version++; this.liquidVersion++;
  }
  serialize() {
    return { glass: this.custom.glass ? encode(this.layers.glass) : null,
      liquid: this.custom.liquid ? this.liquidPasses.map(({ diameter, mask, erase }) => ({ diameter, mask: pack(mask), erase: pack(erase) })) : null };
  }
  clear(layer) {
    this.custom[layer] = true; this.layers[layer].fill(0); this.version++;
    if (layer === 'liquid') {
      this.liquidPasses = [{ diameter: 0, mask: new Uint8Array(REGION_PIXELS), erase: new Uint8Array(REGION_PIXELS) }];
      this.bindLiquidLayers(); this.liquidVersion++;
    }
  }
  // A capsule between consecutive points keeps quick drags continuous. Brush
  // diameter is in reference pixels at 1080 px output height, on every format.
  paint(layer, from, to, diameter, aspect, erase = false) {
    if (layer === 'liquid' && erase) throw new Error('Guma liquidu maže celé tahy.');
    let pass;
    if (layer === 'liquid') {
      pass = this.liquidPasses.at(-1);
      if (pass.sealed || ((this.nextLiquidStroke || pass.diameter !== diameter) && pass.mask.some(Boolean))) {
        if (this.liquidPasses.length >= MAX_LIQUID_PASSES) throw new Error('Kompozice už obsahuje 64 tahů liquidu. Nejdřív některý tah smažte.');
        pass = { diameter, mask: new Uint8Array(REGION_PIXELS), erase: new Uint8Array(REGION_PIXELS), sealed: false };
        this.liquidPasses.push(pass);
      }
      pass.diameter = diameter;
      this.nextLiquidStroke = false;
    }
    const data = pass?.mask || this.layers[layer], radius = diameter / 2160;
    const ax = from[0] * aspect, ay = from[1], vx = (to[0] - from[0]) * aspect, vy = to[1] - from[1];
    const length2 = vx * vx + vy * vy, feather = Math.min(radius * .12, 3 / 1080);
    const loX = Math.max(0, Math.floor((Math.min(from[0], to[0]) - radius / aspect) * REGION_SIZE));
    const hiX = Math.min(REGION_SIZE - 1, Math.ceil((Math.max(from[0], to[0]) + radius / aspect) * REGION_SIZE));
    const loY = Math.max(0, Math.floor((Math.min(from[1], to[1]) - radius) * REGION_SIZE));
    const hiY = Math.min(REGION_SIZE - 1, Math.ceil((Math.max(from[1], to[1]) + radius) * REGION_SIZE));
    let changed = !this.custom[layer];
    this.custom[layer] = true;
    for (let y = loY; y <= hiY; y++) for (let x = loX; x <= hiX; x++) {
      const dx = (x + .5) / REGION_SIZE * aspect - ax, dy = (y + .5) / REGION_SIZE - ay;
      const t = length2 ? Math.max(0, Math.min(1, (dx * vx + dy * vy) / length2)) : 0;
      const distance = Math.hypot(dx - vx * t, dy - vy * t);
      if (distance >= radius) continue;
      const coverage = Math.round(255 * Math.min(1, (radius - distance) / feather));
      const i = y * REGION_SIZE + x, value = erase ? Math.min(data[i], 255 - coverage) : Math.max(data[i], coverage);
      if (value !== data[i]) { data[i] = value; changed = true; }
    }
    if (changed) { this.version++; if (layer === 'liquid') this.liquidVersion++; }
    return changed;
  }
  // Coverage is the actual animated alpha of each object at pointer-down,
  // including spill outside its guide. Reuse it for the entire eraser gesture.
  eraseLiquid(from, to, diameter, aspect, coverage) {
    const radius = diameter / 2160;
    const ax = from[0] * aspect, ay = from[1], vx = (to[0] - from[0]) * aspect, vy = to[1] - from[1];
    const length2 = vx * vx + vy * vy;
    const x0 = Math.max(0, Math.floor((Math.min(from[0], to[0]) - radius / aspect) * REGION_SIZE));
    const x1 = Math.min(REGION_SIZE - 1, Math.ceil((Math.max(from[0], to[0]) + radius / aspect) * REGION_SIZE));
    const y0 = Math.max(0, Math.floor((Math.min(from[1], to[1]) - radius) * REGION_SIZE));
    const y1 = Math.min(REGION_SIZE - 1, Math.ceil((Math.max(from[1], to[1]) + radius) * REGION_SIZE));
    const removed = new Set();
    for (const { pass, alpha } of coverage) {
      if (!this.liquidPasses.includes(pass)) continue;
      hit: for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (alpha[y * REGION_SIZE + x] < 24) continue;
        const dx = (x + .5) / REGION_SIZE * aspect - ax, dy = (y + .5) / REGION_SIZE - ay;
        const t = length2 ? Math.max(0, Math.min(1, (dx * vx + dy * vy) / length2)) : 0;
        if (Math.hypot(dx - vx * t, dy - vy * t) <= radius) { removed.add(pass); break hit; }
      }
    }
    if (!removed.size) return false;
    this.liquidPasses = this.liquidPasses.filter(pass => !removed.has(pass));
    if (!this.liquidPasses.length) this.clear('liquid');
    else { this.bindLiquidLayers(); this.version++; this.liquidVersion++; }
    return true;
  }
  textureData() {
    const data = new Uint8Array(REGION_PIXELS * 4);
    for (let i = 0; i < REGION_PIXELS; i++) {
      data[i * 4] = this.layers.glass[i]; data[i * 4 + 1] = this.layers.liquid[i];
      data[i * 4 + 2] = this.layers.liquidErase[i]; data[i * 4 + 3] = 255;
    }
    return data;
  }
  // Erasure snaps to whole cells, just like generation, even if the original
  // paint covered only a corner of a visible cube.
  eraseGlass(from, to, diameter, aspect, size) {
    const brush = RegionMaps.empty();
    brush.paint('glass', from, to, diameter, aspect);
    const tiles = brush.tiles(size, aspect), mask = this.layers.glass;
    let changed = false;
    for (let y = 0; y < REGION_SIZE; y++) for (let x = 0; x < REGION_SIZE; x++) {
      const i = y * REGION_SIZE + x;
      if (!mask[i]) continue;
      const tx = Math.floor(((x + .5) / REGION_SIZE - .5) * aspect * 1080 / size) - tiles.origin[0];
      const ty = Math.floor((.5 - (y + .5) / REGION_SIZE) * 1080 / size) - tiles.origin[1];
      if (tiles.data[ty * tiles.count[0] + tx]) { mask[i] = 0; changed = true; }
    }
    if (changed) this.version++;
    return changed;
  }
  // Any painted pixel selects its whole tile. Even a small brush selects a
  // cell reliably; the original checker pattern is applied by the shader.
  tiles(size, aspect) {
    const origin = [Math.floor(-540 * aspect / size), Math.floor(-540 / size)];
    const count = [Math.ceil(540 * aspect / size) - origin[0], Math.ceil(540 / size) - origin[1]];
    const data = new Uint8Array(count[0] * count[1]);
    const mask = this.layers.glass;
    for (let y = 0; y < REGION_SIZE; y++) for (let x = 0; x < REGION_SIZE; x++) {
      if (mask[y * REGION_SIZE + x] < 128) continue;
      const tx = Math.floor(((x + .5) / REGION_SIZE - .5) * aspect * 1080 / size) - origin[0];
      const ty = Math.floor((.5 - (y + .5) / REGION_SIZE) * 1080 / size) - origin[1];
      data[ty * count[0] + tx] = 255;
    }
    return { origin, count, data };
  }
}

// object-fit: contain letterboxing must never become part of the drawing.
export function canvasPoint(clientX, clientY, rect, width, height) {
  const scale = Math.min(rect.width / width, rect.height / height);
  const w = width * scale, h = height * scale;
  const left = rect.left + (rect.width - w) / 2, top = rect.top + (rect.height - h) / 2;
  const x = (clientX - left) / w, y = (clientY - top) / h;
  return x < 0 || y < 0 || x > 1 || y > 1 ? null : [x, y];
}
