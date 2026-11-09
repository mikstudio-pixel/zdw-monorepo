# Liquid rebuilt from the original After Effects project

The active **painted-area** renderer is `desktop/renderer/liquid-area.js`.
It applies one effect stack to the union of the painted regions. Older guide
projects retain their existing renderer for compatibility.

## Original and source geometry

The original is `ZDW_starter_pack2025.aep`, SHA-256
`931e11c5ebab0bd26dc7b372a7ebfc8987e741600f3924ca88b5e6058f651792`.
The native controls were rendered with After Effects 26.5x89 at Best/Full.
`original.json` records the extracted parameters and Colorama cycle.

The original ellipse has a 234 px gradient stroke, disabled fill and 89% layer
scale. The user confirmed the same stroke profile for painted areas. The
painted mask defines its **outer extent**: a 208.26 px stroke grows inward from
the common boundary, in the canonical 1080 px coordinate system. A signed
Euclidean distance field constructs it after all areas have been united.
There is no stroke along an internal overlap. The source has finite bounds.

The stack, in original order:

1. Wave Warp: Semicircle, height 100, width 242.5, direction 90°, speed 0.22.
2. Colorama: intensity input; original six-stop cyclic palette. Nonempty
   pixels receive alpha 1, matching the original Modify Alpha setting.
3. Fast Box Blur: radius 5, three iterations, Repeat Edge Pixels enabled.
4. CC Radial Blur: native type 6, amount 8, quality 50. The GPU angular kernel
   was calibrated against the isolated native filter, independently of masks.
5. Turbulent Displace: Bulge, amount 346, size 93, complexity 1.63,
   evolution 295, seed 0, pinning 3. Evolution is fixed in the original;
   motion comes from Wave Warp. Its period is `1 / 0.22` seconds.

All geometry, source colors, animation, alpha and filtering are evaluated live.
The only measured asset is the static inverse turbulence **coordinate field**:
960×540, 1/32 px quantization, 1,209,157 compressed bytes. It contains no finished
RGB, alpha, video frames or finite animation sequence. It was measured with
independent opaque 16bpc grayscale x/y ramps. `build-data.py` recreates the
generated JS byte for byte from the four native TIFF controls.

Intermediate targets use RGBA16F where available, at canonical 1920×1080.
Filtering retains premultiplied alpha. Four final subpixel samples reduce
aliasing of the distorted boundary. Wave and displacement reads outside the
source are transparent; only the original box filter repeats edge pixels.
Time is reduced modulo the true wave period before upload, so long seeks
retain the same precision and do not depend on playback history.

## Deterministic comparison

`fixtures.json` defines three identical app/native sources: an edge-touching
area, intersecting areas, and separated areas. Each has 125 frames at 25 fps.
The app source raster is imported as a normal AE footage layer, with the
original effect parade copied unchanged. The original shape layer stays
disabled. The portrait AE controls include the same video at 1080×1920 and
65% material opacity.

`analyze.py` compares all **375 native RGBA frames**, at exactly `frame / 25`,
with the actual app framebuffer. The portrait crop is the known renderer
transform. There is no fitted spatial alignment or time shift. Full per-frame
results are generated in `web/test-results/ae-rebuild/stroke-comparison.json`.

| Case | Mean alpha IoU (>0.5) | Mean foreground RGB MAE, /255 | Mean foreground SSIM |
| --- | ---: | ---: | ---: |
| Edge termination | 0.995931 | 1.030688 | 0.982637 |
| Merging areas | 0.997519 | 0.917568 | 0.978938 |
| Separate areas | 0.994873 | 0.907092 | 0.978109 |

Alpha IoU measures silhouette overlap; it is not a percentage of identical
pixels. Remaining differences include native filter sampling and raster
quantization. The independent original-circle golden also passes the GPU
check (foreground RGB MAE about 1/255, alpha IoU 0.9977).

`proof.py` places actual premultiplied AE RGBA over the **same clean video
capture** used by the app, so video decoder/color differences cannot obscure
the effect comparison. Its third panel is the actual previous app renderer
with the same strokes, time, framing and display scale. The 15-second movie
shows all three cases, with native and new app animation side by side.

Verification ran in desktop Electron/Chromium. Physical iOS devices were not
tested. Checks cover exact overlap/paint-order invariance, empty-source and
opposite-edge transparency, soft premultiplied alpha, deterministic seeking,
period continuity, palette changes, preview resolution changes, and actual
PNG/MP4 export. The 34 desktop unit tests, desktop E2E suite and web material
export suite pass.

## Reproduction

Run from `liquid-studio/`. Native processing needs After Effects, `py-aep`,
NumPy and OpenCV. Analysis/proof also use Pillow. Raw video, AEPs, TIFF probes
and renders stay in the ignored `reference/ae-rebuild/` calibration directory.

```sh
# Build/sync the actual app renderer first.
npm --prefix desktop run sync:shaders

# Serve the repository using the existing study server.
node scripts/reference-study/capture.mjs /path/to/reference.mp4 /tmp/ae-study --serve

# Prepare identical raster inputs, then independent native projects/renders.
node scripts/ae-rebuild/prepare-source.mjs http://localhost:PORT /absolute/new-controls
python scripts/ae-rebuild/native.py /path/to/ZDW_starter_pack2025.aep /absolute/new-controls \
  --video web/assets/zdw-demo-portrait.mp4 --render

# Capture the app and compare every native RGBA frame.
node scripts/ae-rebuild/capture.mjs http://localhost:PORT /absolute/app-captures
python scripts/ae-rebuild/analyze.py /absolute/new-controls /absolute/app-captures /absolute/report.json

# Repack the independent native x/y coordinate controls.
python scripts/ae-rebuild/build-data.py reference/ae-rebuild/probes \
  /path/to/ZDW_starter_pack2025.aep /tmp/liquid-ae-data.js
```

Native projects must be created in a fresh destination; the tool never changes
the original AEP. `aerender` can report exit 0 for a failed render, so `native.py`
also requires the expected frame count and a nonempty decoded first frame.
