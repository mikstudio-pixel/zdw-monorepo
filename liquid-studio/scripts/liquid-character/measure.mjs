// Shape-invariant Liquid Character Fingerprint (LCF) benchmark.
// Compares Figma + After Effects reference renders against the live WebGL2
// VideoRenderer across single, separated, merged, wide, edge, and portrait areas.
import { _electron as electron } from '../../desktop/node_modules/playwright/index.mjs';
import executablePath from '../../desktop/node_modules/electron/index.js';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const posArgs = [];
let gitRef = null;
let verifyGpu = false;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--git-ref') { gitRef = process.argv[++i]; }
  else if (process.argv[i] === '--verify-gpu') { verifyGpu = true; }
  else posArgs.push(process.argv[i]);
}
const [corpusDir, outDir, label = 'run'] = posArgs;
if (!corpusDir || !outDir) {
  console.error('Usage: node measure.mjs <ref-corpus-dir> <output-dir> [label] [--git-ref <ref>] [--verify-gpu]');
  process.exit(1);
}
await mkdir(outDir, { recursive: true });
const overrideLiquidArea = gitRef
  ? execFileSync('git', ['-C', resolve(ROOT, '..'), 'show', `${gitRef}:liquid-studio/desktop/renderer/liquid-area.js`])
  : null;

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (overrideLiquidArea && pathname === '/desktop/renderer/liquid-area.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' }).end(overrideLiquidArea);
      return;
    }
    const full = resolve(ROOT, `.${pathname}`);
    if (!full.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) { res.writeHead(403).end(); return; }
    const info = await stat(full);
    if (!info.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': mime[extname(full)] || 'application/octet-stream' }).end(await readFile(full));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const refFiles = (await readdir(corpusDir)).filter(f => f.endsWith('.png')).sort();
const refs = [];
for (const name of refFiles) {
  refs.push({ name, b64: (await readFile(resolve(corpusDir, name))).toString('base64') });
}

const cleanEnv = { ...process.env, LIQUID_TEST_URL: `http://127.0.0.1:${port}/scripts/ae-rebuild/host.html` };
delete cleanEnv.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath,
  args: [resolve(ROOT, 'web/tests/browser-host.cjs')],
  env: cleanEnv,
});

try {
  const page = await app.firstWindow();
  const report = await page.evaluate(async ({ refs, label }) => {
    const { VideoRenderer } = await import('/desktop/renderer/video-renderer.js');
    const { RegionMaps } = await import('/desktop/shared/regions.js');
    const { DEFAULTS, AREA_DEFAULT_LIQUID_COLORS } = await import('/desktop/shared/settings.js');

    // Exact 2D Euclidean Distance Transform (Felzenszwalb & Huttenlocher)
    function edt2d(binary, w, h) {
      const INF = 1e12;
      const d = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) d[i] = binary[i] ? INF : 0;
      const n = Math.max(w, h);
      const f = new Float32Array(n), v = new Int32Array(n), z = new Float32Array(n + 1), out = new Float32Array(n);
      const pass1d = (len, get, set) => {
        for (let q = 0; q < len; q++) f[q] = get(q);
        let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
        for (let q = 1; q < len; q++) {
          let s;
          while (true) {
            const at = v[k];
            s = ((f[q] + q * q) - (f[at] + at * at)) / (2 * (q - at));
            if (s <= z[k]) { k--; if (k < 0) break; } else break;
          }
          k++; v[k] = q; z[k] = s; z[k + 1] = INF;
        }
        k = 0;
        for (let q = 0; q < len; q++) {
          while (z[k + 1] < q) k++;
          const diff = q - v[k];
          out[q] = f[v[k]] + diff * diff;
        }
        for (let q = 0; q < len; q++) set(q, out[q]);
      };
      for (let y = 0; y < h; y++) pass1d(w, x => d[y * w + x], (x, val) => { d[y * w + x] = val; });
      for (let x = 0; x < w; x++) pass1d(h, y => d[y * w + x], (y, val) => { d[y * w + x] = val; });
      for (let i = 0; i < w * h; i++) d[i] = Math.sqrt(d[i]);
      return d;
    }

    function pct(arr, p) {
      if (!arr.length) return 0;
      const sorted = Float32Array.from(arr).sort();
      const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
      return sorted[idx];
    }

    // Estimate clean coverage matte [0..1] and RGB from either RGBA or uniform-background RGB
    function extractMatte(rgba, w, h, hasTrueAlpha) {
      const matte = new Float32Array(w * h);
      const rgb = new Float32Array(w * h * 3);
      if (hasTrueAlpha) {
        for (let i = 0; i < w * h; i++) {
          const a = rgba[i * 4 + 3] / 255;
          matte[i] = a;
          rgb[i * 3] = rgba[i * 4];
          rgb[i * 3 + 1] = rgba[i * 4 + 1];
          rgb[i * 3 + 2] = rgba[i * 4 + 2];
        }
        return { matte, rgb, bg: null };
      }
      // Estimate uniform background from image corners/border median
      const samples = [[], [], []];
      for (let x = 0; x < w; x += 4) {
        for (const y of [2, h - 3]) {
          const i = (y * w + x) * 4;
          for (let c = 0; c < 3; c++) samples[c].push(rgba[i + c]);
        }
      }
      for (let y = 0; y < h; y += 4) {
        for (const x of [2, w - 3]) {
          const i = (y * w + x) * 4;
          for (let c = 0; c < 3; c++) samples[c].push(rgba[i + c]);
        }
      }
      const bg = samples.map(s => pct(s, 0.5));
      // Distance in RGB from background, normalized by 95th percentile of active pixels
      const dist = new Float32Array(w * h);
      const active = [];
      for (let i = 0; i < w * h; i++) {
        const dr = rgba[i * 4] - bg[0], dg = rgba[i * 4 + 1] - bg[1], db = rgba[i * 4 + 2] - bg[2];
        const d = Math.hypot(dr, dg, db);
        dist[i] = d;
        if (d > 14) active.push(d);
        rgb[i * 3] = rgba[i * 4]; rgb[i * 3 + 1] = rgba[i * 4 + 1]; rgb[i * 3 + 2] = rgba[i * 4 + 2];
      }
      const scale = Math.max(40, pct(active, 0.65));
      for (let i = 0; i < w * h; i++) {
        matte[i] = Math.max(0, Math.min(1, (dist[i] - 6) / scale));
      }
      return { matte, rgb, bg };
    }

    // Core Shape-Invariant Liquid Character Fingerprint (LCF)
    // All length metrics are normalized to canonical 1080-short-side px (px1080 = 1080 / min(w, h)),
    // matching 1920x1080 landscape and 1080x1920 portrait at equal physical scale.
    function analyzeImage(rgba, w, h, hasTrueAlpha, paletteHex = AREA_DEFAULT_LIQUID_COLORS) {
      const px1080 = 1080 / Math.min(w, h);
      const { matte, rgb } = extractMatte(rgba, w, h, hasTrueAlpha);

      // Binary foreground at matte >= 0.45
      const fg = new Uint8Array(w * h);
      let fgCount = 0;
      for (let i = 0; i < w * h; i++) {
        if (matte[i] >= 0.45) { fg[i] = 1; fgCount++; }
      }
      if (fgCount < 20) return { empty: true, fgFraction: 0 };

      // 1. Interior holes via flood-fill of background from border
      const extBg = new Uint8Array(w * h);
      const queue = new Int32Array(w * h);
      let head = 0, tail = 0;
      const pushBg = idx => { if (!fg[idx] && !extBg[idx]) { extBg[idx] = 1; queue[tail++] = idx; } };
      for (let x = 0; x < w; x++) { pushBg(x); pushBg((h - 1) * w + x); }
      for (let y = 0; y < h; y++) { pushBg(y * w); pushBg(y * w + w - 1); }
      while (head < tail) {
        const cur = queue[head++], x = cur % w, y = (cur / w) | 0;
        if (x > 0) pushBg(cur - 1);
        if (x < w - 1) pushBg(cur + 1);
        if (y > 0) pushBg(cur - w);
        if (y < h - 1) pushBg(cur + w);
      }
      // Connected components of enclosed holes
      const visited = new Uint8Array(w * h);
      const holeAreas1080 = [];
      let totalHolePx = 0;
      for (let i = 0; i < w * h; i++) {
        if (!fg[i] && !extBg[i] && !visited[i]) {
          let hHead = 0, hTail = 0;
          visited[i] = 1; queue[hTail++] = i;
          while (hHead < hTail) {
            const cur = queue[hHead++], x = cur % w, y = (cur / w) | 0;
            for (const nb of [x > 0 ? cur - 1 : -1, x < w - 1 ? cur + 1 : -1, y > 0 ? cur - w : -1, y < h - 1 ? cur + w : -1]) {
              if (nb >= 0 && !fg[nb] && !extBg[nb] && !visited[nb]) { visited[nb] = 1; queue[hTail++] = nb; }
            }
          }
          totalHolePx += hTail;
          const area1080 = hTail * px1080 * px1080;
          if (area1080 >= 120) holeAreas1080.push(area1080);
        }
      }

      // Morphological closing (dilation by R then erosion by R) to also measure deep concave bays/inlets
      const closeR = Math.round(70 / px1080);
      const bgBinary = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) bgBinary[i] = 1 - fg[i];
      const distOut = edt2d(bgBinary, w, h); // distance of background to fg
      const dilated = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) dilated[i] = (fg[i] || distOut[i] <= closeR) ? 1 : 0;
      const distInDilated = edt2d(dilated, w, h); // distance inside dilated to outside
      let closedCount = 0, bayAndHolePx = 0;
      for (let i = 0; i < w * h; i++) {
        const closed = distInDilated[i] > closeR ? 1 : 0;
        if (closed) { closedCount++; if (!fg[i]) bayAndHolePx++; }
      }
      const voidRatio = closedCount > 0 ? bayAndHolePx / closedCount : 0;
      const holePorosity = totalHolePx / (fgCount + totalHolePx);
      const fgArea1080 = fgCount * px1080 * px1080;
      const holesPer100k = holeAreas1080.length / (fgArea1080 / 100000);
      const medianHoleRadius1080 = holeAreas1080.length ? Math.sqrt(pct(holeAreas1080, 0.5) / Math.PI) : 0;

      // 2. Filament / Ribbon thickness via medial-axis ridges of internal EDT
      const distIn = edt2d(fg, w, h);
      const ridgeHalfWidths = [];
      let maxThickness1080 = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x, d = distIn[i];
          if (d < 2) continue;
          const d1080 = d * px1080;
          if (d1080 > maxThickness1080) maxThickness1080 = d1080;
          // Local ridge along either horizontal or vertical axis
          const hRidge = d >= distIn[i - 1] && d >= distIn[i + 1] && (d > distIn[i - 1] || d > distIn[i + 1]);
          const vRidge = d >= distIn[i - w] && d >= distIn[i + w] && (d > distIn[i - w] || d > distIn[i + w]);
          if (hRidge || vRidge) ridgeHalfWidths.push(d1080);
        }
      }

      // 3. Contour complexity (isoperimetric ratio) & boundary edge softness distribution
      let perimeterPx = 0;
      const edgeWidths1080 = [];
      const matteGx = new Float32Array(w * h), matteGy = new Float32Array(w * h);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          matteGx[i] = (matte[i + 1] - matte[i - 1]) * 0.5;
          matteGy[i] = (matte[i + w] - matte[i - w]) * 0.5;
          if (fg[i] && (!fg[i - 1] || !fg[i + 1] || !fg[i - w] || !fg[i + w])) {
            perimeterPx++;
            const gm = Math.hypot(matteGx[i], matteGy[i]);
            if (gm > 0.01) {
              // Walk along unit normal to measure 0.15 -> 0.85 transition width
              const nx = matteGx[i] / gm, ny = matteGy[i] / gm;
              let sLo = 0, sHi = 0;
              for (let s = 0.5; s <= 45; s += 0.5) {
                const sx = Math.round(x - nx * s), sy = Math.round(y - ny * s);
                if (sx < 0 || sx >= w || sy < 0 || sy >= h) { sLo = s; break; }
                if (matte[sy * w + sx] <= 0.15) { sLo = s; break; }
                sLo = s;
              }
              for (let s = 0.5; s <= 45; s += 0.5) {
                const sx = Math.round(x + nx * s), sy = Math.round(y + ny * s);
                if (sx < 0 || sx >= w || sy < 0 || sy >= h) { sHi = s; break; }
                if (matte[sy * w + sx] >= 0.85) { sHi = s; break; }
                sHi = s;
              }
              edgeWidths1080.push((sLo + sHi) * px1080);
            }
          }
        }
      }
      // Crofton correction (~pi/4 for 4-neighbor grid perimeter)
      const correctedPerim = perimeterPx * 0.7854;
      const compactness = correctedPerim / (2 * Math.sqrt(Math.PI * fgCount));

      // 4. Connected components of foreground (droplets / islands)
      const fgVis = new Uint8Array(w * h);
      let fgComponents = 0, smallDroplets = 0;
      for (let i = 0; i < w * h; i++) {
        if (fg[i] && !fgVis[i]) {
          let cHead = 0, cTail = 0;
          fgVis[i] = 1; queue[cTail++] = i;
          while (cHead < cTail) {
            const cur = queue[cHead++], x = cur % w, y = (cur / w) | 0;
            for (const nb of [x > 0 ? cur - 1 : -1, x < w - 1 ? cur + 1 : -1, y > 0 ? cur - w : -1, y < h - 1 ? cur + w : -1]) {
              if (nb >= 0 && fg[nb] && !fgVis[nb]) { fgVis[nb] = 1; queue[cTail++] = nb; }
            }
          }
          const a1080 = cTail * px1080 * px1080;
          if (a1080 >= 80) {
            fgComponents++;
            if (a1080 < 8000) smallDroplets++;
          }
        }
      }

      // 5. Color richness, spatial hue/chroma diversity, and seam/scratch spike detector
      const palRgb = paletteHex.map(hex => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);
      const stopCounts = new Int32Array(palRgb.length);
      const interiorGrads = [];
      let opaqueCount = 0;
      // 3D quantized color histogram (6x6x6 bins) for color entropy
      const hist = new Int32Array(216);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (matte[i] < 0.85 || distIn[i] * px1080 < 6) continue;
          opaqueCount++;
          const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
          const br = Math.min(5, (r / 43) | 0), bg2 = Math.min(5, (g / 43) | 0), bb = Math.min(5, (b / 43) | 0);
          hist[br * 36 + bg2 * 6 + bb]++;
          let bestIdx = 0, bestD = 1e9;
          for (let p = 0; p < palRgb.length; p++) {
            const d = Math.hypot(r - palRgb[p][0], g - palRgb[p][1], b - palRgb[p][2]);
            if (d < bestD) { bestD = d; bestIdx = p; }
          }
          stopCounts[bestIdx]++;
          // Interior RGB gradient magnitude per canonical 1080p px
          if (matte[i - 1] > 0.85 && matte[i + 1] > 0.85 && matte[i - w] > 0.85 && matte[i + w] > 0.85) {
            const drx = (rgb[(i + 1) * 3] - rgb[(i - 1) * 3]) * 0.5;
            const dgx = (rgb[(i + 1) * 3 + 1] - rgb[(i - 1) * 3 + 1]) * 0.5;
            const dbx = (rgb[(i + 1) * 3 + 2] - rgb[(i - 1) * 3 + 2]) * 0.5;
            const dry = (rgb[(i + w) * 3] - rgb[(i - w) * 3]) * 0.5;
            const dgy = (rgb[(i + w) * 3 + 1] - rgb[(i - w) * 3 + 1]) * 0.5;
            const dby = (rgb[(i + w) * 3 + 2] - rgb[(i - w) * 3 + 2]) * 0.5;
            interiorGrads.push(Math.hypot(drx, dgx, dbx, dry, dgy, dby) / px1080);
          }
        }
      }
      let colorEntropy = 0;
      if (opaqueCount > 0) {
        for (let i = 0; i < 216; i++) {
          if (hist[i] > 0) { const p = hist[i] / opaqueCount; colorEntropy -= p * Math.log2(p); }
        }
      }
      const paletteShares = Array.from(stopCounts, c => opaqueCount ? +(c / opaqueCount).toFixed(3) : 0);
      const paletteStopsActive = paletteShares.filter(s => s >= 0.025).length;

      const edgeP25 = pct(edgeWidths1080, 0.25);
      const edgeP50 = pct(edgeWidths1080, 0.50);
      const edgeP75 = pct(edgeWidths1080, 0.75);
      const gradP50 = pct(interiorGrads, 0.50);
      const gradP99 = pct(interiorGrads, 0.99);

      return {
        fgFraction: +(fgCount / (w * h)).toFixed(4),
        holePorosity: +holePorosity.toFixed(4),
        voidRatio: +voidRatio.toFixed(4),
        holeCount: holeAreas1080.length,
        holesPer100k: +holesPer100k.toFixed(2),
        medianHoleRadius1080: +medianHoleRadius1080.toFixed(1),
        thicknessP50: +pct(ridgeHalfWidths, 0.50).toFixed(1),
        thicknessP90: +pct(ridgeHalfWidths, 0.90).toFixed(1),
        maxThickness1080: +maxThickness1080.toFixed(1),
        compactness: +compactness.toFixed(2),
        fgComponents,
        smallDroplets,
        edgeWidthP25: +edgeP25.toFixed(1),
        edgeWidthP50: +edgeP50.toFixed(1),
        edgeWidthP75: +edgeP75.toFixed(1),
        edgeSpreadRatio: +(edgeP75 / Math.max(0.5, edgeP25)).toFixed(2),
        colorEntropy: +colorEntropy.toFixed(2),
        paletteStopsActive,
        paletteShares,
        colorGradP50: +gradP50.toFixed(2),
        colorGradP99: +gradP99.toFixed(2),
        colorSpikeRatio: +(gradP99 / Math.max(0.1, gradP50)).toFixed(1),
      };
    }

    // 1. Analyze all reference images (Figma + Downloads AE)
    const refResults = [];
    for (const ref of refs) {
      const img = new Image();
      img.src = 'data:image/png;base64,' + ref.b64;
      await img.decode();
      // Downsample to max height 540 for fast consistent analysis (exact 2x of 1080p)
      const scale = Math.min(1, 540 / img.height);
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const rgba = ctx.getImageData(0, 0, w, h).data;
      let hasTrueAlpha = false;
      for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 250) { hasTrueAlpha = true; break; }
      refResults.push({ name: ref.name, size: [img.width, img.height], hasTrueAlpha, metrics: analyzeImage(rgba, w, h, hasTrueAlpha) });
    }

    // 2. Render & analyze our live WebGL2 app across 6 painted scenarios
    const canvas = document.createElement('canvas');
    const renderer = new VideoRenderer(canvas);
    renderer.upload(new Uint8Array([32, 32, 32, 255]), 1, 1);

    const scenarios = [
      { name: 'single-accent-9x16', aspect: '9:16', time: 0.7, strokes: [[[0.18, 0.28], [0.46, 0.14], 220]] },
      { name: 'two-separate-9x16', aspect: '9:16', time: 0.7, strokes: [[[0.18, 0.30], [0.22, 0.36], 240], [[0.82, 0.72], [0.78, 0.66], 240]] },
      { name: 'two-merged-9x16', aspect: '9:16', time: 0.7, strokes: [[[0.26, 0.55], [0.26, 0.55], 430], [[0.74, 0.55], [0.74, 0.55], 430]] },
      { name: 'wide-blob-16x9', aspect: '16:9', time: 0.7, strokes: [[[0.25, 0.35], [0.75, 0.35], 420], [[0.25, 0.62], [0.75, 0.62], 420]] },
      { name: 'edge-band-9x16', aspect: '9:16', time: 0.7, strokes: [[[0.04, 0.76], [0.96, 0.85], 640], [[0.12, 0.91], [0.94, 0.92], 400]] },
      { name: 'portrait-flow-9x16', aspect: '9:16', time: 0.7, strokes: [[[0.12, 0.08], [0.18, 0.55], 480], [[0.85, 0.45], [0.87, 0.95], 480]] },
    ];

    const appResults = [];
    const captures = {};
    try {
      for (const sc of scenarios) {
        const aspect = sc.aspect === '9:16' ? 9 / 16 : sc.aspect === '16:9' ? 16 / 9 : 1;
        const maps = RegionMaps.empty().useLiquidArea();
        maps.clear('glass');
        for (const [a, b, d] of sc.strokes) maps.paint('liquid', a, b, d, aspect);
        const settings = { ...DEFAULTS, aspect: sc.aspect, liquid: true, opacity: 100, regions: maps.serialize() };

        const readLiquid = (t) => {
          renderer.draw(settings, t, { regions: maps });
          const gl = renderer.gl, w = renderer.liquidWidth, h = renderer.liquidHeight;
          const raw = new Uint8Array(w * h * 4);
          gl.bindFramebuffer(gl.FRAMEBUFFER, renderer.liquidFramebuffer);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
          // Flip top-down and unpremultiply for color analysis while keeping true alpha
          const topDown = new Uint8ClampedArray(w * h * 4);
          const unprem = new Uint8ClampedArray(w * h * 4);
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const s = ((h - 1 - y) * w + x) * 4, d = (y * w + x) * 4;
              const a = raw[s + 3];
              topDown[d] = raw[s]; topDown[d + 1] = raw[s + 1]; topDown[d + 2] = raw[s + 2]; topDown[d + 3] = a;
              unprem[d + 3] = a;
              if (a > 0) {
                unprem[d] = Math.min(255, Math.round(raw[s] * 255 / a));
                unprem[d + 1] = Math.min(255, Math.round(raw[s + 1] * 255 / a));
                unprem[d + 2] = Math.min(255, Math.round(raw[s + 2] * 255 / a));
              }
            }
          }
          return { w, h, topDown, unprem };
        };

        const f0 = readLiquid(sc.time);
        const f1 = readLiquid(sc.time + 0.7);
        const metrics = analyzeImage(f0.unprem, f0.w, f0.h, true);

        // Interior motion vitality: compare pixel delta deep inside liquid vs near boundary
        const fg0 = new Uint8Array(f0.w * f0.h);
        for (let i = 0; i < f0.w * f0.h; i++) fg0[i] = f0.unprem[i * 4 + 3] >= 115 ? 1 : 0;
        const distIn0 = edt2d(fg0, f0.w, f0.h);
        const px1080 = 1080 / Math.min(f0.w, f0.h);
        let deepSum = 0, deepN = 0, edgeSum = 0, edgeN = 0;
        for (let i = 0; i < f0.w * f0.h; i++) {
          const delta = (Math.abs(f1.topDown[i * 4] - f0.topDown[i * 4]) + Math.abs(f1.topDown[i * 4 + 1] - f0.topDown[i * 4 + 1]) + Math.abs(f1.topDown[i * 4 + 2] - f0.topDown[i * 4 + 2]) + Math.abs(f1.topDown[i * 4 + 3] - f0.topDown[i * 4 + 3])) / 4;
          const d1080 = distIn0[i] * px1080;
          if (d1080 >= 30) { deepSum += delta; deepN++; }
          else if (d1080 > 0 && d1080 < 20) { edgeSum += delta; edgeN++; }
        }
        metrics.interiorMotionDelta = deepN ? +(deepSum / deepN).toFixed(2) : 0;
        metrics.boundaryMotionDelta = edgeN ? +(edgeSum / edgeN).toFixed(2) : 0;
        metrics.interiorMotionRatio = edgeN && edgeSum > 0 ? +((deepN ? deepSum / deepN : 0) / (edgeSum / edgeN)).toFixed(2) : 0;

        // Render nice preview PNG over #3e3e3e (matching Figma canvas background!) + blue mask inset
        const out = document.createElement('canvas'); out.width = f0.w; out.height = f0.h;
        const octx = out.getContext('2d');
        octx.fillStyle = '#3e3e3e'; octx.fillRect(0, 0, f0.w, f0.h);
        const tmp = document.createElement('canvas'); tmp.width = f0.w; tmp.height = f0.h;
        tmp.getContext('2d').putImageData(new ImageData(f0.unprem, f0.w, f0.h), 0, 0);
        octx.drawImage(tmp, 0, 0);
        // Subtle blue dashed contour of painted mask on top-left corner thumbnail
        const thumbW = Math.round(f0.w * 0.24), thumbH = Math.round(f0.h * 0.24);
        octx.fillStyle = 'rgba(18,18,18,0.85)'; octx.fillRect(8, 8, thumbW + 4, thumbH + 4);
        const mCan = document.createElement('canvas'); mCan.width = 512; mCan.height = 512;
        const mCtx = mCan.getContext('2d'), mImg = mCtx.createImageData(512, 512);
        for (let i = 0; i < 512 * 512; i++) {
          const v = maps.layers.liquid[i];
          mImg.data[i * 4] = 97; mImg.data[i * 4 + 1] = 186; mImg.data[i * 4 + 2] = 255; mImg.data[i * 4 + 3] = v;
        }
        mCtx.putImageData(mImg, 0, 0);
        octx.drawImage(mCan, 10, 10, thumbW, thumbH);
        captures[sc.name] = out.toDataURL('image/png');
        appResults.push({ name: sc.name, aspect: sc.aspect, metrics });
      }
    } finally {
      renderer.destroy();
    }

    // 3. Compute Reference Envelope & Character Distance
    const KEYS = ['holePorosity', 'voidRatio', 'holesPer100k', 'thicknessP50', 'thicknessP90', 'compactness', 'edgeWidthP50', 'edgeSpreadRatio', 'colorEntropy', 'colorSpikeRatio'];
    const refStats = {};
    for (const k of KEYS) {
      const vals = refResults.map(r => r.metrics[k]).filter(v => Number.isFinite(v));
      const p25 = pct(vals, 0.25), p50 = pct(vals, 0.50), p75 = pct(vals, 0.75);
      refStats[k] = { min: +Math.min(...vals).toFixed(2), p25: +p25.toFixed(2), median: +p50.toFixed(2), p75: +p75.toFixed(2), max: +Math.max(...vals).toFixed(2), iqr: +Math.max(0.05, p75 - p25).toFixed(2) };
    }

    // Standardized hinge distance outside the [p25, p75] reference IQR band
    const WEIGHTS = { holePorosity: 1.5, voidRatio: 1.5, holesPer100k: 1.2, thicknessP50: 1.5, thicknessP90: 1.5, compactness: 1.2, edgeWidthP50: 1.0, edgeSpreadRatio: 1.0, colorEntropy: 1.0, colorSpikeRatio: 1.2 };
    for (const r of appResults) {
      let wSum = 0, dSum = 0;
      const zByMetric = {};
      for (const k of KEYS) {
        const s = refStats[k], v = r.metrics[k];
        const excess = v < s.p25 ? (s.p25 - v) : v > s.p75 ? (v - s.p75) : 0;
        const scale = Math.max(s.iqr, Math.abs(s.median) * 0.2, 0.05);
        const z = excess / scale;
        zByMetric[k] = +(v < s.p25 ? -z : z).toFixed(2);
        dSum += z * WEIGHTS[k]; wSum += WEIGHTS[k];
      }
      r.characterDistance = +(dSum / wSum).toFixed(3);
      r.zByMetric = zByMetric;
    }

    const meanCharacterDistance = +(appResults.reduce((s, r) => s + r.characterDistance, 0) / appResults.length).toFixed(3);
    return { label, refStats, refResults, appResults, meanCharacterDistance, captures };
  }, { refs, label });

  for (const [name, dataUrl] of Object.entries(report.captures)) {
    await writeFile(resolve(outDir, `${label}-${name}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
  }
  delete report.captures;
  await writeFile(resolve(outDir, `${label}-report.json`), JSON.stringify(report, null, 2));

  console.log(`\n=== LIQUID CHARACTER BENCHMARK: ${label} ===`);
  console.log('Reference envelope (Figma + AE, n=' + report.refResults.length + '):');
  for (const [k, s] of Object.entries(report.refStats)) {
    console.log(`  ${k.padEnd(18)} median=${String(s.median).padStart(6)}  IQR=[${s.p25}, ${s.p75}]  range=[${s.min}, ${s.max}]`);
  }
  console.log('\nApp scenarios (0.000 = inside AE/Figma IQR band on every axis):');
  for (const r of report.appResults) {
    const m = r.metrics;
    console.log(`  ${r.name.padEnd(20)} dist=${String(r.characterDistance).padStart(5)} | holes=${String(m.holeCount).padStart(2)} (${m.holesPer100k}/100k) void=${m.voidRatio} | thickP50/90=${m.thicknessP50}/${m.thicknessP90} | comp=${m.compactness} | edgeP50=${m.edgeWidthP50} (spr=${m.edgeSpreadRatio}) | ent=${m.colorEntropy} stops=${m.paletteStopsActive}/7 spike=${m.colorSpikeRatio} | intMot=${m.interiorMotionRatio}`);
  }
  console.log(`\nMEAN CHARACTER DISTANCE: ${report.meanCharacterDistance}`);
  if (verifyGpu) {
    // Load desktop renderer page so relative imports in desktop/tests/*.mjs resolve identically
    await page.goto(`http://127.0.0.1:${port}/desktop/renderer/index.html`);
    const { verifyUnifiedLiquid } = await import('../../desktop/tests/liquid-area-visual.mjs');
    const { verifyLiquidMatte } = await import('../../desktop/tests/liquid-matte-visual.mjs');
    const { verifyLiquidEvolution } = await import('../../desktop/tests/liquid-motion-visual.mjs');
    const { verifyKeyframeMorph } = await import('../../desktop/tests/keyframes-visual.mjs');
    console.log('\n=== GPU INVARIANT CHECKS ===');
    for (const [name, fn] of [
      ['verifyUnifiedLiquid', verifyUnifiedLiquid],
      ['verifyLiquidMatte', verifyLiquidMatte],
      ['verifyLiquidEvolution', verifyLiquidEvolution],
      ['verifyKeyframeMorph', verifyKeyframeMorph],
    ]) {
      try {
        await fn(page);
        console.log(`  PASS: ${name}`);
      } catch (err) {
        console.error(`  FAIL: ${name}: ${err.message}`);
        process.exitCode = 1;
      }
    }
  }
} finally {
  await app.close();
  server.close();
}
