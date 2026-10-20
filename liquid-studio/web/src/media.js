import { Input, BlobSource, ALL_FORMATS, Output, Mp4OutputFormat, BufferTarget, Conversion, Quality, VideoSample, VideoSampleSink, VideoSampleSource } from 'mediabunny';
import './sdr-decoder.js';
import { VideoRenderer } from '../../desktop/renderer/video-renderer.js';
import { FPS, FORMATS, validateSettings } from '../../desktop/shared/settings.js';

export const openInput = file => new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
const cancelled = () => new DOMException('Zpracování bylo zrušeno.', 'AbortError');
const check = signal => { if (signal?.aborted) throw cancelled(); };
class VideoInputError extends Error {}

// Normalize stills to a short local video so the shared player, timeline and
// frame-by-frame exporter use the same path for images and videos.
export async function prepareImage(file, signal) {
  if (!file.size || file.size > 300 * 1024 * 1024) throw new Error('Vyberte obrázek do 300 MB.');
  if (!globalThis.VideoEncoder) throw new Error('Tento prohlížeč nepodporuje zpracování obrázků. Použijte aktuální Safari nebo Chrome.');
  const bitmap = await createImageBitmap(file);
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const canvas = document.createElement('canvas');
  try {
    check(signal);
    if (bitmap.width > 8192 || bitmap.height > 8192) throw new Error('Obrázek je příliš velký. Maximum je 8192 px na stranu.');
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height), Math.sqrt(1920 * 1080 / (bitmap.width * bitmap.height)));
    canvas.width = Math.max(2, Math.floor(bitmap.width * scale / 2) * 2);
    canvas.height = Math.max(2, Math.floor(bitmap.height * scale / 2) * 2);
    const context = canvas.getContext('2d', { alpha: false });
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const config = { codec: 'avc1.420028', width: canvas.width, height: canvas.height, bitrate: 10_000_000, framerate: FPS };
    if (!(await VideoEncoder.isConfigSupported(config)).supported) throw new Error('Prohlížeč nepodporuje přípravu tohoto obrázku.');
    const source = new VideoSampleSource({ codec: 'avc', fullCodecString: config.codec, quality: new Quality({ bitrate: config.bitrate }) });
    output.addVideoTrack(source, { frameRate: FPS });
    await output.start();
    for (let frame = 0; frame < FPS * 5; frame++) {
      check(signal);
      const sample = new VideoSample(canvas, { timestamp: frame / FPS, duration: 1 / FPS });
      try { await source.add(sample); } finally { sample.close(); }
      if (frame % 3 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    source.close();
    await output.finalize();
    check(signal);
    return new File([target.buffer], file.name, { type: 'video/mp4' });
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  } finally { bitmap.close(); canvas.width = canvas.height = 1; }
}

export async function inspectVideo(file, signal) {
  if (!(file instanceof Blob) || !file.size) throw new Error('Vyberte neprázdný video soubor.');
  if (!globalThis.VideoDecoder || !globalThis.VideoEncoder) throw new Error('Tento prohlížeč neumí lokální export videa. Použijte aktuální Safari nebo Chrome.');
  if (file.size > 300 * 1024 * 1024) throw new Error('Webová verze zatím přijímá soubory do 300 MB.');
  const input = openInput(file);
  try {
    const video = await input.getPrimaryVideoTrack(), audio = await input.getPrimaryAudioTrack();
    const decoder = video && await video.getDecoderConfig();
    if (!decoder || !(await VideoDecoder.isConfigSupported(decoder)).supported) throw new VideoInputError('Toto video nelze dekódovat. Vyberte SDR video MP4/H.264 nebo podporovaný MOV.');
    if (await video.hasHighDynamicRange()) throw new VideoInputError('Tato verze podporuje SDR video. HDR záznam nejprve převeďte do SDR.');
    const startTime = Math.max(0, await video.getFirstTimestamp());
    const duration = await video.computeDuration() - startTime;
    if (!Number.isFinite(duration) || duration <= 0 || duration > 180) throw new VideoInputError('Webová verze zatím podporuje videa do 3 minut.');
    check(signal);
    return { name: file.name || 'video.mp4', width: await video.getDisplayWidth(), height: await video.getDisplayHeight(),
      startTime, duration, frames: Math.ceil(duration * FPS - 1e-5), fps: FPS, hasAudio: Boolean(audio) };
  } catch (error) {
    check(signal);
    if (error instanceof VideoInputError) throw error;
    throw new VideoInputError('Soubor není podporované video nebo je poškozený. Vyberte MP4 nebo MOV.', { cause: error });
  } finally { input.dispose(); }
}

export async function renderVideo(file, rawSettings, { signal, onProgress = () => {} } = {}) {
  const settings = validateSettings(rawSettings), info = await inspectVideo(file, signal);
  const input = openInput(file), target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const canvas = document.createElement('canvas'), source = document.createElement('canvas');
  const context = source.getContext('2d', { alpha: false });
  const [width, height] = FORMATS[settings.aspect];
  let renderer, audioConversion, frames = 0, encoded = 0, wakeLock, running = true, timer, rejectAbort;
  const interrupted = new Promise((_, reject) => { rejectAbort = reject; });
  const abort = () => rejectAbort(cancelled());
  const heartbeat = () => {
    if (!running) return;
    clearTimeout(timer);
    timer = setTimeout(() => rejectAbort(new Error('Prohlížeč přestal zpracovávat video. Nechte aplikaci v popředí a zkuste export znovu.')), 30_000);
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    renderer = new VideoRenderer(canvas);
    const work = async () => {
      void navigator.wakeLock?.request('screen').then(lock => {
        if (running) wakeLock = lock;
        else void lock.release();
      }).catch(() => {});
      heartbeat(); check(signal);
      const config = { codec: 'avc1.420028', width, height, bitrate: 10_000_000, framerate: FPS, latencyMode: 'quality' };
      if (!(await VideoEncoder.isConfigSupported(config)).supported) throw new Error('Tento prohlížeč nepodporuje export H.264 v 1080p.');
      onProgress({ kind: 'export', phase: 'init', progress: 0 });
      const videoSource = new VideoSampleSource({ codec: 'avc', fullCodecString: config.codec,
        quality: new Quality({ bitrate: config.bitrate }), latencyMode: 'quality',
        onEncodedPacket: (_packet, metadata) => {
          // Safari's encoder can omit color tags for an RGB canvas. Its HD
          // YUV output uses BT.709; record that in MP4 for other players too.
          if (metadata?.decoderConfig) {
            let color = metadata.decoderConfig.colorSpace;
            // WebKit sometimes copies the RGB input's tags onto limited-range
            // H.264 output, instead of reporting its encoded YUV color space.
            if (color?.transfer === 'iec61966-2-1' && color.fullRange && color.matrix === 'bt709') color = null;
            metadata.decoderConfig.colorSpace = { primaries: color?.primaries || 'bt709',
              transfer: color?.transfer || 'bt709', matrix: color?.matrix || 'bt709', fullRange: color?.fullRange ?? false };
          }
          encoded++; heartbeat();
        },
      });
      output.addVideoTrack(videoSource, { frameRate: FPS });
      if (info.hasAudio) {
        // Only audio is converted here, on the original common timeline. AAC is
        // copied when possible; a delayed audio track stays delayed.
        audioConversion = await Conversion.init({ input, output, tracks: 'primary', composable: true,
          trim: { start: info.startTime, end: info.startTime + info.duration }, video: { discard: true }, audio: { codec: 'aac' }, showWarnings: false });
        if (audioConversion.discardedTracks.some(track => track.reason !== 'discarded_by_user')) {
          throw new Error('Prohlížeč neumí převést zvuk tohoto souboru. Zkuste MP4 se zvukem AAC.');
        }
      }
      check(signal); await output.start();
      const track = await input.getPrimaryVideoTrack(), sink = new VideoSampleSink(track);
      function* timestamps() { for (let index = 0; index < info.frames; index++) yield info.startTime + index / FPS; }
      const videoTask = async () => {
        for await (const sample of sink.samplesAtTimestamps(timestamps())) {
          check(signal); if (!running) throw cancelled();
          try {
            if (sample) {
              if (source.width !== sample.displayWidth || source.height !== sample.displayHeight) {
                source.width = sample.displayWidth; source.height = sample.displayHeight;
              }
              sample.draw(context, 0, 0); renderer.upload(source);
            } else renderer.upload(new Uint8Array([0, 0, 0, 255]), 1, 1);
            // Integer frame indices drive the animation and timestamps, regardless
            // of render speed or variable input frame rate.
            renderer.draw(settings, frames / FPS);
            const rendered = new VideoSample(canvas, { timestamp: frames / FPS, duration: 1 / FPS });
            try { await videoSource.add(rendered); } finally { rendered.close(); }
          } finally { sample?.close(); }
          frames++; heartbeat();
          onProgress({ kind: 'export', phase: 'render', frames, total: info.frames, progress: frames / info.frames * .97 });
          if (frames % 3 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
        videoSource.close();
      };
      await Promise.all([videoTask(), audioConversion?.execute()]);
      check(signal);
      onProgress({ kind: 'export', phase: 'finalize', progress: .98 });
      await output.finalize(); check(signal);
      if (frames !== info.frames || encoded !== frames) throw new Error(`Kodér vrátil ${encoded} z ${info.frames} snímků. Soubor nebyl uložen.`);
      const result = new File([target.buffer], `${info.name.replace(/\.[^.]+$/, '')}-liquid.mp4`, { type: 'video/mp4' });
      return { file: result, width, height, frames, duration: frames / FPS, path: result.name };
    };
    return await Promise.race([work(), interrupted]);
  } catch (error) {
    running = false;
    void audioConversion?.cancel().catch(() => {});
    await output.cancel().catch(() => {});
    if (signal?.aborted) throw cancelled();
    throw error;
  } finally {
    running = false; clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    await wakeLock?.release().catch(() => {});
    renderer?.destroy(); input.dispose(); source.width = source.height = 1;
  }
}
