# Downloaded version review

Reviewed the changed application source in `Liquid-Studio-1.6.0.zip` against the
existing ZDW-liquid desktop application. This was a code and behavior review,
not an exhaustive security audit.

Accepted features: image input as a five-second silent scene, PNG frame export,
seven configurable liquid colors with a preset palette, and a 60–1440 px liquid
brush. These features work in the shared desktop/browser editor.

The import needed corrections:

- The downloaded renderer removed the browser's RGB preview normalization and
  handling of non-zero media timestamp origins. Both existing fixes are retained.
- It replaced calibrated brush geometry, animation and glass lighting while
  duplicating the source-render/filter implementation. The shared calibrated
  renderer is retained; palette uniforms extend the existing source renderer.
- PNG IPC accepted unchecked data and bypassed export serialization. PNG input
  is now bounded and validated, and saving participates in the existing job lock.
- The downloaded package narrowed the test script to three named files. The
  existing wildcard test discovery remains in place, including new PNG tests.

Local verification on macOS: 13 prototype tests, 24 desktop tests, desktop
Electron end-to-end rendering/import/export checks, browser Chromium/Electron
end-to-end checks and 100 WordPress release-manager tests (323 assertions).
The browser checks include offline video export, non-zero timestamps, delayed
audio, image drag/drop, PNG saving and a 150-frame image animation. Default
palette restoration reproduces the original renderer pixels exactly.

Both npm production dependency audits reported zero known vulnerabilities.
New features have not been retested on an iOS simulator or physical iPhone.

## GitHub Pages

`pages.yml` manually builds and publishes only `liquid-studio/web/dist`.
The generated HTML uses relative asset paths, suitable for the repository's
`/zdw-monorepo/` URL. Images and videos stay on the user's device.
