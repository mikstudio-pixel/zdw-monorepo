import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULTS, validateSettings, parseSettings, serializeSettings, cropTransform, DEFAULT_LIQUID_COLORS, PALETTE_COLORS, PALETTE_PRESET_COLORS } from '../shared/settings.js';
import { liquidPaletteFloats } from '../shared/settings.js';
import { describeMedia, rawFrames, binaries, command, prepareMedia, probe } from '../main/media.js';

test('Settings preserve values and reject invalid files without partial mutation', () => {
  const settings = { ...DEFAULTS, aspect: '9:16', cropX: 83.2, liquid: true, blur: 5, liquidStructure: 72 };
  assert.deepEqual(parseSettings(serializeSettings(settings)), settings);
  for (const value of [{ aspect: '__proto__' }, { aspect: 'toString' }, { strength: Infinity }, { blur: -1 }, { liquid: 'yes' }, { cropZoom: 0 }]) assert.throws(() => validateSettings(value));
  assert.throws(() => parseSettings('{broken'));
  assert.throws(() => parseSettings('{"type":"zdw-liquid-studio","version":99}'));
  assert.deepEqual(DEFAULTS.cropX, 50);
  assert.equal(validateSettings({}).liquidStructure, 50);
  assert.equal(validateSettings({}).liquidColors.length, 7);
  const customColors = ['#16533f', '#f8cf49', '#9fbaff', '#5c300f', '#fd3d62', '#ffa9ef', '#16533f'];
  assert.deepEqual(validateSettings({ liquidColors: customColors }).liquidColors, customColors);
  for (const liquidColors of [['#fff'], ['#123456'], Array(7).fill('not-a-color'), Array(6).fill('#123456'), 'invalid']) {
    assert.throws(() => validateSettings({ liquidColors }));
  }
  for (const liquidStructure of [-1, 101, NaN, '50']) assert.throws(() => validateSettings({ liquidStructure }));
});
test('Crop keeps composition bounded for all output aspects and extreme positions', () => {
  for (const source of [16 / 9, 9 / 16, 1, 2.35]) for (const target of [16 / 9, 9 / 16, 1]) {
    for (const position of [0, 50, 100]) {
      const { scale, offset } = cropTransform(source, target, { ...DEFAULTS, cropX: position, cropY: position, cropZoom: 170 });
      assert.ok(Math.abs(source * scale[0] / scale[1] - target) < 1e-9);
      scale.forEach((size, i) => { assert.ok(offset[i] >= 0 && offset[i] + size <= 1 + 1e-9); });
    }
  }
});
test('Metadata normalizes SAR/rotation and rejects HDR, interlacing, missing duration', () => {
  const video = { codec_type: 'video', width: 1920, height: 1080, index: 0, duration: '1.01', start_time: '2', sample_aspect_ratio: '1:1' };
  const describe = update => describeMedia({ streams: [{ ...video, ...update }], format: {} });
  assert.equal(describe({}).frames, 31);
  assert.equal(describe({}).start, 2);
  assert.equal(describe({ side_data_list: [{ rotation: -90 }] }).width, 1080);
  assert.equal(describe({ sample_aspect_ratio: '2:1' }).width, 3840);
  assert.throws(() => describe({ color_transfer: 'smpte2084' }), /HDR/);
  assert.throws(() => describe({ field_order: 'tt' }), /Prokládané/);
  assert.throws(() => describe({ duration: 'N/A' }), /délku/);
});
test('Whole-media fitting preserves every edge and the source aspect for any output format', () => {
  for (const source of [2.35, 16 / 9, 4 / 3, 1, 9 / 16]) for (const target of [16 / 9, 1, 9 / 16]) {
    const settings = { ...DEFAULTS, mediaFit: 'contain' };
    const { scale, offset } = cropTransform(source, target, settings);
    assert.ok(Math.abs(target * scale[1] / scale[0] - source) < 1e-9, 'No stretching');
    scale.forEach((size, i) => {
      assert.ok(-offset[i] / size >= 0 && (1 - offset[i]) / size <= 1 + 1e-9, 'Both original edges are visible');
    });
    assert.equal(parseSettings(serializeSettings(settings)).mediaFit, 'contain');
  }
  assert.throws(() => validateSettings({ mediaFit: 'cover' }));
});
test('Raw frame reader handles arbitrary chunk boundaries and detects truncation', async () => {
  const input = Buffer.from(Array.from({ length: 60 }, (_, i) => i));
  const frames = [];
  for await (const frame of rawFrames(Readable.from([input.subarray(0, 7), input.subarray(7, 44), input.subarray(44)]), 20)) frames.push(frame);
  assert.equal(frames.length, 3); assert.deepEqual(Buffer.concat(frames), input);
  await assert.rejects(async () => { for await (const _ of rawFrames(Readable.from([Buffer.alloc(19)]), 20)) {} }, /neúplný/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(async () => { for await (const _ of rawFrames(Readable.from([Buffer.alloc(20)]), 20, controller.signal)) {} }, /zrušena/);
});
test('Vendor glass shader is identical to the functional web prototype', async () => {
  for (const file of ['shaders.js', 'liquid-source.js', 'liquid-deformation.js', 'liquid-definition.js']) {
    assert.deepEqual(await readFile(new URL(`../vendor/${file}`, import.meta.url)), await readFile(new URL(`../../src/${file}`, import.meta.url)));
  }
});
test('Real FFmpeg: fractional input fps, delayed audio, cancellation and silent input', { timeout: 60000 }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'liquid-test-'));
  try {
    const { ffmpeg } = binaries();
    const input = join(folder, 'source with spaces.mp4');
    await command(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=30000/1001:duration=1.37', '-itsoffset', '0.25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1.1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', input], { stdout: 'ignore' }).done;
    const output = join(folder, 'prepared.mp4');
    const expected = describeMedia(await probe(input));
    const media = await prepareMedia(input, output);
    assert.equal(media.frames, expected.frames); assert.equal(media.duration, expected.frames / 30); assert.equal(media.hasAudio, true);
    const metadata = await probe(output);
    assert.equal(metadata.streams[0].avg_frame_rate, '30/1');
    const audio = command(ffmpeg, ['-v', 'error', '-i', output, '-map', '0:a:0', '-f', 'f32le', '-ac', '1', '-ar', '48000', 'pipe:1']);
    const chunks = []; for await (const chunk of audio.child.stdout) chunks.push(chunk); await audio.done;
    const bytes = Buffer.concat(chunks), samples = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
    const firstSound = samples.findIndex(sample => Math.abs(sample) > .02) / 48000;
    assert.ok(firstSound > .22 && firstSound < .28, `Delayed audio onset: ${firstSound}`);
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(() => prepareMedia(input, join(folder, 'cancelled.mp4'), cancelled.signal), /zrušena/);
    const silent = join(folder, 'silent.mp4');
    await command(ffmpeg, ['-v', 'error', '-i', input, '-map', '0:v:0', '-c', 'copy', '-an', silent], { stdout: 'ignore' }).done;
    assert.equal((await prepareMedia(silent, join(folder, 'silent-ready.mp4'))).hasAudio, false);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('Real FFmpeg: VFR and non-zero video/audio origin stay on one timeline', { timeout: 60000 }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'liquid-vfr-test-'));
  try {
    const { ffmpeg } = binaries();
    const input = join(folder, 'vfr.mkv');
    await command(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=20:duration=1', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1',
      '-filter_complex', '[0:v]setpts=if(lt(N\\,10)\\,N/(20*TB)\\,(0.5+(N-10)/10)/TB)+2/TB[v];[1:a]asetpts=PTS+2.3/TB[a]',
      '-map', '[v]', '-map', '[a]', '-fps_mode', 'vfr', '-c:v', 'libx264', '-bf', '0', '-c:a', 'pcm_s16le', input], { stdout: 'ignore' }).done;
    const original = describeMedia(await probe(input));
    assert.equal(original.start, 2);
    const media = await prepareMedia(input, join(folder, 'ready.mp4'));
    assert.equal(media.frames, original.frames);
    const audio = command(ffmpeg, ['-v', 'error', '-i', media.path, '-map', '0:a', '-f', 'f32le', '-ac', '1', 'pipe:1']);
    const chunks = []; for await (const chunk of audio.child.stdout) chunks.push(chunk); await audio.done;
    const buffer = Buffer.concat(chunks), samples = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
    const onset = samples.findIndex(value => Math.abs(value) > .02) / 48000;
    assert.ok(Math.abs(onset - .3) < .02, `VFR/nonzero-origin audio onset ${onset}`);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('Image import: describeMedia sets 5s default duration and prepareMedia normalizes image to MP4', { timeout: 60000 }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'liquid-image-test-'));
  try {
    const { ffmpeg } = binaries();
    const image = join(folder, 'sample.png');
    await command(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=cyan:s=800x600', '-frames:v', '1', image], { stdout: 'ignore' }).done;

    const described = describeMedia(await probe(image), { isImage: true });
    assert.equal(described.duration, 5);
    assert.equal(described.frames, 150);
    assert.equal(described.hasAudio, false);
    assert.equal(described.isImage, true);
    assert.equal(described.width, 800);
    assert.equal(described.height, 600);

    const output = join(folder, 'prepared-image.mp4');
    const prepared = await prepareMedia(image, output);
    assert.equal(prepared.frames, 150);
    assert.equal(prepared.duration, 5);
    assert.equal(prepared.hasAudio, false);
    assert.equal(prepared.isImage, true);

    const metadata = await probe(output);
    assert.equal(metadata.streams[0].width, 800);
    assert.equal(metadata.streams[0].height, 600);
    assert.equal(Number(metadata.streams[0].nb_frames), 150);
    assert.ok(!metadata.streams.some(s => s.codec_type === 'audio'));
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('Liquid palette colors and WebGL floats match specifications', () => {
  assert.equal(PALETTE_COLORS.length, 6);
  assert.deepEqual(PALETTE_COLORS, ['#16533f', '#f8cf49', '#9fbaff', '#5c300f', '#fd3d62', '#ffa9ef']);
  assert.equal(DEFAULT_LIQUID_COLORS.length, 7);
  assert.equal(PALETTE_PRESET_COLORS.length, 7);
  const defaultFloats = liquidPaletteFloats();
  assert.equal(defaultFloats.length, 21);
  assert.equal(defaultFloats[0], 201);
  assert.equal(defaultFloats[1], 191);
  assert.equal(defaultFloats[2], 145);
  const paletteFloats = liquidPaletteFloats(PALETTE_PRESET_COLORS);
  assert.equal(paletteFloats[0], 22);
  assert.equal(paletteFloats[1], 83);
  assert.equal(paletteFloats[2], 63);
});
