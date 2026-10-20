import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { stat, rm } from 'node:fs/promises';
import { FPS } from '../shared/settings.js';

const require = createRequire(import.meta.url);
export function binaries() {
  const unpack = value => value.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1');
  return {
    ffmpeg: process.env.LIQUID_FFMPEG || unpack(require('ffmpeg-static')),
    ffprobe: process.env.LIQUID_FFPROBE || unpack(require('@ffprobe-installer/ffprobe').path),
  };
}
export function cancelled() { return new Error('Operace byla zrušena.'); }
export function checkAbort(signal) { if (signal?.aborted) throw cancelled(); }

function processMessage(stderr, code) {
  if (/No space left on device|disk full/i.test(stderr)) return 'Na disku není dostatek místa. Uvolněte místo v dočasné složce a u cílového souboru.';
  if (/Permission denied|Operation not permitted/i.test(stderr)) return 'Aplikace nemá přístup k souboru. Vyberte soubor a cílovou složku, ke kterým máte oprávnění.';
  if (/Invalid data found|moov atom not found/i.test(stderr)) return 'Video je poškozené nebo má nepodporovaný obsah. Vyberte jiné SDR video nebo jej nejprve převeďte na MP4/H.264.';
  return `Zpracování videa selhalo. ${stderr.trim().slice(-1800) || `Kód ${code}`}`;
}

// Always drain stderr, handle spawn/pipe failures, and reap children on abort.
export function command(executable, args, { signal, onProgress, stdout = 'pipe' } = {}) {
  checkAbort(signal);
  const child = spawn(executable, args, { stdio: ['pipe', stdout, 'pipe'], windowsHide: true });
  let stderr = '', progress = '', killTimer;
  const abort = () => {
    child.kill('SIGTERM');
    killTimer = setTimeout(() => child.kill('SIGKILL'), 2000);
    killTimer.unref();
  };
  signal?.addEventListener('abort', abort, { once: true });
  child.stderr.on('data', chunk => {
    stderr = (stderr + chunk.toString()).slice(-8000);
    if (onProgress) {
      progress += chunk.toString();
      const lines = progress.split('\n');
      progress = lines.pop();
      for (const line of lines) if (line.startsWith('out_time_us=')) onProgress(Number(line.slice(12)) / 1e6);
    }
  });
  // EPIPE can arrive before close; close is the authoritative process result.
  child.stdin.on('error', () => {});
  const done = new Promise((resolve, reject) => {
    child.once('error', error => reject(new Error(`Nelze spustit lokální FFmpeg/ffprobe: ${error.message}`)));
    child.once('close', code => {
      clearTimeout(killTimer);
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) reject(cancelled());
      else if (code !== 0) reject(new Error(processMessage(stderr, code)));
      else resolve();
    });
  });
  done.catch(() => {}); // The consumer may still be awaiting a pipe read/write.
  return { child, done };
}

export async function probe(path, signal) {
  const { ffprobe } = binaries();
  const job = command(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_streams', '-show_format', '-of', 'json', path], { signal });
  let output = '';
  for await (const chunk of job.child.stdout) {
    output += chunk;
    if (output.length > 4 * 1024 * 1024) { job.child.kill(); throw new Error('Metadata videa jsou příliš velká.'); }
  }
  await job.done;
  const metadata = JSON.parse(output);
  const video = metadata.streams?.find(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
  // Container duration can include an arbitrary timestamp origin (e.g. MKV).
  // If the video stream has no duration, scan packet timestamps in bounded
  // memory instead of treating container duration as a video duration.
  if (video && !(Number(video.duration) > 0)) {
    const packets = command(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-select_streams', String(video.index), '-show_entries', 'packet=pts_time,duration_time', '-of', 'compact=p=0:nk=0', path], { signal });
    let pending = '', first = Infinity, end = -Infinity;
    const consume = line => {
      const values = Object.fromEntries(line.split('|').map(part => part.split('=')));
      const pts = Number(values.pts_time), duration = Number(values.duration_time);
      if (!Number.isFinite(pts)) return;
      first = Math.min(first, pts);
      const [num, den] = String(video.avg_frame_rate || video.r_frame_rate).split('/').map(Number);
      end = Math.max(end, pts + (duration > 0 ? duration : num > 0 && den > 0 ? den / num : 1 / FPS));
    };
    for await (const chunk of packets.child.stdout) {
      pending += chunk.toString();
      const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) consume(line);
    }
    if (pending) consume(pending);
    await packets.done;
    if (Number.isFinite(first) && end > first) metadata.videoTiming = { start: first, duration: end - first };
  }
  return metadata;
}

export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp'];
export const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi'];
export const DEFAULT_IMAGE_DURATION = 5;

export function isImageFile(path) {
  if (typeof path !== 'string') return false;
  const dot = path.lastIndexOf('.');
  if (dot === -1) return false;
  return IMAGE_EXTENSIONS.includes(path.slice(dot).toLowerCase());
}

export function describeMedia(metadata, { isImage = false, imageDuration = DEFAULT_IMAGE_DURATION } = {}) {
  const video = metadata.streams?.find(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
  if (!video || !video.width || !video.height) throw new Error('Soubor neobsahuje čitelný obraz nebo video stopu.');
  if (['smpte2084', 'arib-std-b67'].includes(video.color_transfer) || video.color_primaries === 'bt2020') {
    throw new Error('HDR video zatím není podporované. Nejdříve jej převeďte na SDR / Rec.709.');
  }
  if (video.field_order && !['unknown', 'progressive'].includes(video.field_order)) throw new Error('Prokládané video zatím není podporované. Použijte progresivní SDR video.');
  const start = isImage ? 0 : Number(metadata.videoTiming?.start ?? video.start_time ?? metadata.format?.start_time ?? 0);
  const duration = isImage ? imageDuration : Number(metadata.videoTiming?.duration ?? video.duration ?? (Number(metadata.format?.duration) - Math.max(0, start - Number(metadata.format?.start_time || 0))));
  if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0 || duration > 24 * 3600) throw new Error('Nelze určit platnou délku média (nejvýše 24 hodin).');
  if (video.width > 8192 || video.height > 8192) throw new Error('Vstupní soubor je příliš velký. Maximum je 8192 px na stranu.');
  const [sarN, sarD] = (video.sample_aspect_ratio || '1:1').split(':').map(Number);
  const sar = sarN > 0 && sarD > 0 ? sarN / sarD : 1;
  const rotation = Number(video.side_data_list?.find(item => item.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0);
  let width = video.width * sar, height = video.height;
  if (Math.abs(rotation % 180) > 45 && Math.abs(rotation % 180) < 135) [width, height] = [height, width];
  const scale = Math.min(1, 3840 / Math.max(width, height));
  width = Math.max(2, Math.round(width * scale / 2) * 2);
  height = Math.max(2, Math.round(height * scale / 2) * 2);
  const frames = Math.max(1, Math.ceil(duration * FPS - 1e-5));
  const audio = isImage ? null : metadata.streams?.find(stream => stream.codec_type === 'audio');
  return { width, height, frames, duration: frames / FPS, sourceDuration: duration, start, videoIndex: video.index, audioIndex: audio?.index, hasAudio: Boolean(audio), fps: FPS, isImage: Boolean(isImage) };
}

export function normalizeArgs(input, output, media) {
  const inputArgs = media.isImage
    ? ['-loop', '1', '-framerate', String(FPS), '-t', String(media.duration), '-i', input]
    : ['-copyts', '-i', input];
  const video = `[0:${media.videoIndex}]setpts=PTS-${media.start}/TB,fps=${FPS}:start_time=0:round=near,tpad=stop_mode=clone:stop_duration=1,scale=${media.width}:${media.height}:flags=lanczos:out_color_matrix=bt709:out_range=tv,setsar=1,format=yuv420p[v]`;
  const audio = media.hasAudio ? `;[0:${media.audioIndex}]asetpts=PTS-${media.start}/TB,aresample=48000:async=1:first_pts=0,apad,atrim=duration=${media.duration}[a]` : '';
  return ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-progress', 'pipe:2', '-protocol_whitelist', 'file,pipe', ...inputArgs,
    '-filter_complex', video + audio, '-map', '[v]', ...(media.hasAudio ? ['-map', '[a]', '-c:a', 'aac', '-b:a', '192k', '-ac', '2'] : ['-an']),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-t', String(media.duration), '-map_metadata', '-1', '-movflags', '+faststart', output];
}

export async function prepareMedia(input, output, signal, onProgress) {
  const info = await stat(input);
  if (!info.isFile()) throw new Error('Vyberte jeden soubor.');
  const isImage = isImageFile(input);
  const media = describeMedia(await probe(input, signal), { isImage });
  onProgress?.(0);
  const { ffmpeg } = binaries();
  try {
    const job = command(ffmpeg, normalizeArgs(input, output, media), { signal, stdout: 'ignore', onProgress: seconds => onProgress?.(Math.min(.99, seconds / media.duration)) });
    await job.done;
    checkAbort(signal);
    const prepared = await probe(output, signal);
    const stream = prepared.streams.find(item => item.codec_type === 'video');
    const frames = Number(stream.nb_frames);
    if (!Number.isSafeInteger(frames) || frames <= 0) throw new Error('Nepodařilo se ověřit snímky připraveného videa.');
    return { ...media, width: stream.width, height: stream.height, frames, duration: frames / FPS, path: output };
  } catch (error) {
    await rm(output, { force: true });
    throw error;
  }
}

// Bounded memory: one RGBA frame plus the stream's high-water mark.
export async function* rawFrames(stream, frameBytes, signal) {
  let frame = Buffer.allocUnsafe(frameBytes), offset = 0;
  for await (const chunk of stream) {
    checkAbort(signal);
    let cursor = 0;
    while (cursor < chunk.length) {
      const count = Math.min(frameBytes - offset, chunk.length - cursor);
      chunk.copy(frame, offset, cursor, cursor + count);
      cursor += count; offset += count;
      if (offset === frameBytes) {
        yield frame;
        frame = Buffer.allocUnsafe(frameBytes); offset = 0;
      }
    }
  }
  checkAbort(signal);
  if (offset) throw new Error('Dekodér vrátil neúplný snímek. Export nebyl uložen.');
}

export function writeFrame(stream, bytes, signal) {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const abort = () => finish(cancelled());
    const onError = error => finish(error);
    const onClose = () => finish(new Error('Kodér předčasně ukončil zápis.'));
    const finish = error => {
      signal?.removeEventListener('abort', abort);
      stream.off('error', onError); stream.off('close', onClose);
      error ? reject(error) : resolve();
    };
    signal?.addEventListener('abort', abort, { once: true });
    stream.once('error', onError); stream.once('close', onClose);
    stream.write(bytes, finish);
  });
}
