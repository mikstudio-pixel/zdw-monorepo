import { CustomVideoDecoder, VideoSample, registerDecoder } from 'mediabunny';

// HTML video assumes SD / HD color matrices for untagged material; WebCodecs
// otherwise defaults to BT.709 even for SD. Keep preview and export consistent.
class UntaggedSdrDecoder extends CustomVideoDecoder {
  static supports(codec, config) {
    return ['avc', 'hevc'].includes(codec) && !config.colorSpace?.matrix;
  }
  init() {
    const standard = this.config.codedHeight <= 576 ? 'smpte170m' : 'bt709';
    this.colorSpace = {
      primaries: this.config.colorSpace?.primaries || standard,
      transfer: this.config.colorSpace?.transfer || standard,
      matrix: standard, fullRange: this.config.colorSpace?.fullRange ?? false,
    };
    this.pending = Promise.resolve();
    this.decoder = new VideoDecoder({ output: frame => {
      this.pending = this.pending.then(async () => {
        try {
          if (this.closed) return;
          if (frame.colorSpace.matrix !== this.colorSpace.matrix) {
            // Safari can ignore the matrix even on a re-wrapped NV12 frame.
            // Convert the native planes explicitly only for this mismatch.
            const options = { rect: { x: 0, y: 0, width: frame.codedWidth, height: frame.codedHeight } };
            const data = new Uint8Array(frame.allocationSize(options));
            const layout = await frame.copyTo(data, options);
            if (!['NV12', 'I420'].includes(frame.format)) throw new Error('Prohlížeč neumí správně převést barvy tohoto videa. Použijte SDR MP4/H.264 s barevným profilem Rec.709.');
            const rgba = new Uint8Array(frame.codedWidth * frame.codedHeight * 4);
            const full = frame.colorSpace.fullRange;
            const hd = this.colorSpace.matrix === 'bt709';
            const clamp = value => Math.max(0, Math.min(255, Math.round(value)));
            for (let y = 0; y < frame.codedHeight; y++) for (let x = 0; x < frame.codedWidth; x++) {
              const luma = data[layout[0].offset + y * layout[0].stride + x];
              const uv = layout[1].offset + (y >> 1) * layout[1].stride;
              const u = data[uv + (frame.format === 'NV12' ? (x >> 1) * 2 : x >> 1)];
              const v = frame.format === 'NV12' ? data[uv + (x >> 1) * 2 + 1] : data[layout[2].offset + (y >> 1) * layout[2].stride + (x >> 1)];
              const Y = full ? luma : (luma - 16) * 255 / 219;
              const U = (u - 128) * (full ? 1 : 255 / 224), V = (v - 128) * (full ? 1 : 255 / 224);
              const i = (y * frame.codedWidth + x) * 4;
              rgba[i] = clamp(Y + (hd ? 1.5748 : 1.402) * V);
              rgba[i + 1] = clamp(Y - (hd ? .187324 : .344136) * U - (hd ? .468124 : .714136) * V);
              rgba[i + 2] = clamp(Y + (hd ? 1.8556 : 1.772) * U); rgba[i + 3] = 255;
            }
            const corrected = new VideoFrame(rgba, { format: 'RGBA',
              codedWidth: frame.codedWidth, codedHeight: frame.codedHeight,
              visibleRect: frame.visibleRect, displayWidth: frame.displayWidth, displayHeight: frame.displayHeight,
              timestamp: frame.timestamp, duration: frame.duration ?? undefined,
              colorSpace: { primaries: 'bt709', transfer: 'iec61966-2-1', matrix: 'rgb', fullRange: true } });
            frame.close(); frame = corrected;
          }
          if (!this.closed) { this.onSample(new VideoSample(frame)); frame = null; }
        } finally { frame?.close(); }
      }).catch(error => this.onError(error));
    }, error: error => this.onError(error) });
    this.decoder.configure({ ...this.config, colorSpace: this.colorSpace });
  }
  decode(packet) { this.decoder.decode(packet.toEncodedVideoChunk()); }
  async flush() { await this.decoder.flush(); await this.pending; }
  close() { this.closed = true; if (this.decoder?.state !== 'closed') this.decoder?.close(); }
}
registerDecoder(UntaggedSdrDecoder);
