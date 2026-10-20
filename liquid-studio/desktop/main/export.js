import { randomUUID } from 'node:crypto';
import { dirname, basename, join, resolve } from 'node:path';
import { rm, rename } from 'node:fs/promises';
import { binaries, command, rawFrames, writeFrame, probe, checkAbort } from './media.js';
import { FPS, FORMATS, validateSettings } from '../shared/settings.js';

// renderFrame is an acknowledged request to an isolated WebGL window. Never
// queue the next decoded frame before readPixels and the encoder write finish.
export async function exportVideo({ media, settings, output, signal, renderFrame, onProgress }) {
  settings = validateSettings(settings);
  if (resolve(output) === resolve(media.path) || (media.originalPath && resolve(output) === resolve(media.originalPath))) throw new Error('Výstup nesmí přepsat vstupní video. Zvolte jiný název.');
  const [width, height] = FORMATS[settings.aspect];
  const temp = join(dirname(output), `.${basename(output)}.${randomUUID()}.partial.mp4`);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const { ffmpeg } = binaries();
  let decoder, encoder, processError;
  try {
    checkAbort(signal);
    decoder = command(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', media.path, '-map', '0:v:0', '-an', '-fps_mode', 'passthrough', '-pix_fmt', 'rgba', '-f', 'rawvideo', 'pipe:1'], { signal: controller.signal });
    encoder = command(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${width}x${height}`, '-framerate', String(FPS), '-i', 'pipe:0',
      '-i', media.path, '-map', '0:v:0', '-map', '1:a:0?', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      '-c:a', 'copy', '-t', String(media.duration), '-map_metadata', '-1', '-movflags', '+faststart', temp], { signal: controller.signal, stdout: 'ignore' });
    // Wake blocked reads/writes promptly if the other process fails.
    const processFailed = error => { processError ||= error; abort(); };
    decoder.done.catch(processFailed); encoder.done.catch(processFailed);
    let index = 0;
    for await (const data of rawFrames(decoder.child.stdout, media.width * media.height * 4, controller.signal)) {
      if (index >= media.frames) throw new Error('Počet dekódovaných snímků nesouhlasí s připraveným videem.');
      const rgba = await renderFrame({ index, time: index / FPS, data, sourceWidth: media.width, sourceHeight: media.height, width, height, settings: index === 0 ? settings : undefined }, controller.signal);
      if (rgba.byteLength !== width * height * 4) throw new Error('Renderer vrátil chybnou velikost snímku.');
      await writeFrame(encoder.child.stdin, rgba, controller.signal);
      index++;
      onProgress?.({ phase: 'render', frames: index, total: media.frames, progress: index / media.frames * .97 });
    }
    await decoder.done;
    if (index !== media.frames) throw new Error(`Dekodér vrátil ${index} z ${media.frames} snímků. Export nebyl uložen.`);
    encoder.child.stdin.end();
    onProgress?.({ phase: 'finalize', progress: .98, frames: index, total: media.frames });
    await encoder.done;
    checkAbort(signal);
    const info = await probe(temp, controller.signal);
    const video = info.streams.find(s => s.codec_type === 'video');
    if (Number(video.nb_frames) !== media.frames || video.width !== width || video.height !== height || video.codec_name !== 'h264' || (media.hasAudio && !info.streams.some(s => s.codec_type === 'audio'))) {
      throw new Error('Kontrola hotového MP4 selhala. Původní cílový soubor nebyl změněn.');
    }
    checkAbort(signal);
    await rename(temp, output);
    return { path: output, frames: index, width, height, duration: media.duration };
  } catch (error) {
    const wasCancelled = signal?.aborted;
    abort();
    const results = await Promise.allSettled([decoder?.done, encoder?.done]);
    await rm(temp, { force: true });
    if (wasCancelled) throw new Error('Export byl zrušen.');
    // Prefer actionable encoder diagnostics over a secondary broken pipe.
    const failure = results.find(r => r.status === 'rejected' && !r.reason.message.includes('zrušena'));
    throw failure?.reason || processError || error;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}
