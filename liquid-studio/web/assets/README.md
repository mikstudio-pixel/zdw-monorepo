# Default ZDW video

The user supplied `ZDW_vrstvy_40s.mov` from Downloads on 2026-10-21.
Both bundled versions preserve the full clip (about 38.5 seconds) and its audio:

- `zdw-demo-portrait.mp4`: centered 9:16 crop, scaled to 1080 × 1920 without
  stretching; the default for the guided app.
- `zdw-demo.mp4`: original 16:9 framing at 1920 × 1080 for the full editor.

Both versions use 30 fps H.264 / SDR (BT.709) video and AAC stereo audio.
The source MOV remains unchanged. The application fetches its own static copy,
so it does not depend on a third-party server or CORS headers.

The web editor loads this clip on startup, initially paused. It can be replaced
with a file picker or drag/drop; subsequent user imports are never reset to it.
