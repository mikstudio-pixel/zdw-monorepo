# Default ZDW video

`zdw-demo.mp4` is the introductory background video from the Zlin Design Week
homepage, retrieved on 2026-10-20 at the user's request:

- Page: https://zlindesignweek.com/2026/
- Source: https://zlindesignweek.com/2026/wp-content/uploads/2026/08/zdw-bg-cut02.mp4

The bundled copy is the original compressed web MP4 (18.8 MB): 1920 × 1080,
30 fps H.264 / SDR, 68.6 seconds, with no audio track. It is not re-encoded.
The application fetches its own static copy, so it does not
depend on third-party CORS headers or the WordPress server being available.

The web editor loads this clip on startup, initially paused. It can be replaced
with a file picker or drag/drop; subsequent user imports are never reset to it.
