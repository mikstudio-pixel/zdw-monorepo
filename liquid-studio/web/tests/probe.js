import { Input, BlobSource, ALL_FORMATS, VideoSampleSink } from './bunny.js';
const log = async data => { document.getElementById('log').textContent += JSON.stringify(data) + '\n'; await fetch('/__qa/events.json', { method: 'POST', body: JSON.stringify({ step: 'probe', userAgent: navigator.userAgent, ...data }) }); };
for (const hardwareAcceleration of ['prefer-software', 'prefer-hardware']) {
  const latencyMode = 'quality';
  const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
  canvas.getContext('2d').fillRect(0, 0, 1920, 1080);
  let frames = 0;
  const encoder = new VideoEncoder({ output: () => frames++, error: error => log({ latencyMode, error: error.message }) });
  const config = { codec: 'avc1.420028', width: 1920, height: 1080, bitrate: 10_000_000, framerate: 30, latencyMode, hardwareAcceleration };
  const supported = (await VideoEncoder.isConfigSupported(config)).supported;
  await log({ latencyMode, hardwareAcceleration, supported });
  if (!supported) { encoder.close(); continue; }
  encoder.configure(config);
  for (let i = 0; i < 48; i++) { const frame = new VideoFrame(canvas, { timestamp: Math.round(i / 30 * 1e6), duration: 33333 }); encoder.encode(frame); frame.close(); }
  let timeout;
  await Promise.race([encoder.flush().then(() => log({ latencyMode, hardwareAcceleration, frames, flushed: true })).catch(error => log({ error: error.message })), new Promise(resolve => { timeout = setTimeout(() => { void log({ latencyMode, hardwareAcceleration, frames, timeout: true }); resolve(); }, 4000); })]);
  clearTimeout(timeout);
  encoder.close();
}
const input = new Input({ source: new BlobSource(await (await fetch('./sync.mp4')).blob()), formats: ALL_FORMATS });
const track = await input.getPrimaryVideoTrack();
await log({ decoderConfig: await track.getDecoderConfig() });
const sample = await new VideoSampleSink(track).getSample(0);
const canvas = document.createElement('canvas'); canvas.width = sample.displayWidth; canvas.height = sample.displayHeight;
sample.draw(canvas.getContext('2d'), 0, 0);
await log({ decodedColorSpace: sample.colorSpace, red: [...canvas.getContext('2d').getImageData(10, 150, 1, 1).data] });
await fetch(`/__qa/${/iPhone/.test(navigator.userAgent) ? 'ios' : 'browser'}-decoded.png`, { method: 'POST', body: await new Promise(resolve => canvas.toBlob(resolve)) });
sample.close(); input.dispose();
