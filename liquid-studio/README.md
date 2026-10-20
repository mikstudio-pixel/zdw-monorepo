# Liquid Studio

Add animated liquid and glass effects to videos and images. The desktop and
browser applications share settings, brushes and the calibrated WebGL renderer.

## Desktop

Requires Node.js 22.12 or newer and WebGL 2. Install dependencies on the target
computer; do not copy `node_modules` between Windows and macOS.

```sh
npm --prefix desktop ci
npm --prefix desktop start
```

Import an SDR video or a PNG, JPEG, WebP or BMP image. Images become silent
five-second scenes. Paint liquid or glass, confirm with **Hotovo**, then export
an MP4 animation or a PNG of the current frame. Liquid brushes range from
60 to 1440 px. Customize the seven liquid colors individually or apply the
built-in palette; saved settings retain these colors and older settings load
with the original palette.

## Browser

```sh
npm --prefix desktop run sync:shaders
npm --prefix web ci
npm --prefix web run dev
```

Open <http://localhost:4173>. Production hosting must use HTTPS. Processing and
export run locally in the browser. [Browser limits and verification](web/README.md).

## Original prototype

```sh
npm run dev
```

Open <http://127.0.0.1:5173>. The original renderer, sample assets and prototype
remain available separately from the editor. Larger calibration recordings and
After Effects sources remain external development material.

## Verification

```sh
npm run check
npm test
npm --prefix desktop run check
npm --prefix desktop test
npm --prefix desktop run test:e2e
npm --prefix web test
```

The browser test uses the desktop development Electron and FFmpeg only as a
test harness. Application exports do not use a server or FFmpeg in the browser.
