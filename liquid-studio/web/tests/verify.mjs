import assert from 'node:assert/strict';
import { writeFile, readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Input, BufferSource, ALL_FORMATS } from 'mediabunny';
import { command, binaries, probe } from '../../desktop/main/media.js';
const root = fileURLToPath(new URL('../test-results/', import.meta.url));
const prefix = process.argv[2] || 'browser-sync';
const file = `${root}${prefix}-export.mp4`;
const { ffmpeg, ffprobe } = binaries();
async function bytes(args) {
  const job = command(ffmpeg, ['-v', 'error', ...args]), chunks = [];
  for await (const chunk of job.child.stdout) chunks.push(chunk);
  await job.done; return Buffer.concat(chunks);
}
const info = await probe(file), video = info.streams.find(s => s.codec_type === 'video'), audio = info.streams.find(s => s.codec_type === 'audio');
// Read MP4's colr metadata too: older FFmpeg builds can lose these tags when
// Safari's H.264 SPS does not repeat them, and otherwise assume an SD matrix.
const input = new Input({ source: new BufferSource(await readFile(file)), formats: ALL_FORMATS });
const color = (await (await input.getPrimaryVideoTrack()).getDecoderConfig()).colorSpace; input.dispose();
assert.equal(color.matrix, 'bt709'); assert.equal(color.fullRange, false);
const toRgb = `scale=in_color_matrix=${color.matrix}:in_range=tv`;
assert.equal(video.codec_name, 'h264'); assert.equal(video.width, 1920); assert.equal(video.height, 1080);
assert.equal(video.avg_frame_rate, '30/1');
const frameCount = prefix.endsWith('sync') ? 48 : 180;
assert.equal(Number(video.nb_frames), frameCount);
const timestampJob = command(ffprobe, ['-v', 'error', '-select_streams', 'v', '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', file]);
let json = ''; for await (const chunk of timestampJob.child.stdout) json += chunk; await timestampJob.done;
JSON.parse(json).frames.forEach((frame, index) => assert.ok(Math.abs(Number(frame.best_effort_timestamp_time) - index / 30) < .00001));
const preview = await bytes(['-i', `${root}${prefix}-preview.png`, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
const first = await bytes(['-i', file, '-vf', toRgb, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
assert.equal(preview.length, first.length);
let count = 0, absolute = 0, squared = 0;
for (let y = 4; y < 1080; y += 8) for (let x = 4; x < 1920; x += 8) for (let c = 0; c < 3; c++) {
  const i = (y * 1920 + x) * 3 + c, delta = first[i] - preview[i];
  absolute += Math.abs(delta); squared += delta * delta; count++;
}
const mae = absolute / count, psnr = 10 * Math.log10(255 ** 2 / (squared / count));
assert.ok(mae < 6 && psnr > 27, `Preview/export mismatch: MAE=${mae}, PSNR=${psnr}`);
const report = { platform: prefix, codec: video.codec_name, color, width: video.width, height: video.height, frames: frameCount, frameRate: 30, exactTimestamps: true, previewComparison: { mae, psnr } };
for (const kind of ['uncompressed', 'playback']) {
  const path = `${root}${prefix}-${kind}.png`;
  if (!await access(path).then(() => true, () => false)) continue;
  const actual = await bytes(['-i', path, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
  let sum = 0, square = 0, count = 0;
  for (let y = 4; y < 1080; y += 8) for (let x = 4; x < 1920; x += 8) for (let c = 0; c < 3; c++) {
    const i = (y * 1920 + x) * 3 + c, delta = actual[i] - preview[i]; sum += Math.abs(delta); square += delta * delta; count++;
  }
  const mae = sum / count, psnr = 10 * Math.log10(255 ** 2 / (square / count));
  assert.ok(mae < (kind === 'uncompressed' ? 3 : 6) && psnr > 30, `${kind} mismatch: MAE=${mae}, PSNR=${psnr}`);
  report[kind] = { mae, psnr };
}
report.additionalFrames = {};
for (const index of [21, 24, 36]) {
  const path = `${root}${prefix}-preview-${index}.png`;
  if (!await access(path).then(() => true, () => false)) continue;
  const reference = await bytes(['-i', path, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
  const actual = await bytes(['-i', file, '-vf', `select=eq(n\\,${index}),${toRgb}`, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
  let sum = 0, square = 0, count = 0;
  for (let y = 4; y < 1080; y += 8) for (let x = 4; x < 1920; x += 8) for (let c = 0; c < 3; c++) {
    const i = (y * 1920 + x) * 3 + c, delta = actual[i] - reference[i]; sum += Math.abs(delta); square += delta * delta; count++;
  }
  const mae = sum / count, psnr = 10 * Math.log10(255 ** 2 / (square / count));
  assert.ok(mae < 6 && psnr > 27, `Frame ${index} mismatch: MAE=${mae}, PSNR=${psnr}`);
  report.additionalFrames[index] = { mae, psnr };
}
if (prefix.endsWith('sync')) {
  assert.equal(audio.codec_name, 'aac');
  const pcm = await bytes(['-i', file, '-map', '0:a:0', '-af', 'aresample=48000:async=1:first_pts=0', '-ac', '1', '-f', 'f32le', 'pipe:1']);
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
  const onset = samples.findIndex(value => Math.abs(value) > .1) / 48000;
  assert.ok(Math.abs(onset - .8) < .015, `Audio pulse was at ${onset}, expected 0.8`);
  const flash = await bytes(['-i', file, '-vf', `select=eq(n\\,24),${toRgb}`, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
  assert.ok(flash[(540 * 1920 + 960) * 3] > 235, 'Video flash is at frame 24 / 800 ms');
  report.audioPulseSeconds = onset; report.videoFlashSeconds = .8;
} else assert.ok(!audio, 'Silent input stays silent');
report.success = true;
await writeFile(`${root}${prefix}-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
