// Blur at a tiny resolution, then let CSS enlarge the cells without smoothing.
// The cost follows the viewport size, rather than the video's resolution or DPR.
export class PixelBackdrop {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'media-backdrop';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.hidden = true;
    document.getElementById('stage').prepend(this.canvas);
    this.context = this.canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    this.observer = new ResizeObserver(() => { if (this.source) this.draw(this.source); });
    this.observer.observe(this.canvas.parentElement);
  }
  draw(source) {
    this.source = source;
    const bounds = this.canvas.parentElement.getBoundingClientRect();
    const width = Math.max(1, Math.ceil(bounds.width / 12));
    const height = Math.max(1, Math.ceil(bounds.height / 12));
    if (!this.scratch || this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width; this.canvas.height = height;
      this.scratch = new Uint8ClampedArray(width * height * 4);
    }
    const scale = Math.max(width / source.width, height / source.height);
    this.context.drawImage(source, (width - source.width * scale) / 2,
      (height - source.height * scale) / 2, source.width * scale, source.height * scale);
    const frame = this.context.getImageData(0, 0, width, height);
    const weights = [1, 4, 6, 4, 1];
    // Separable Gaussian, with clamped edges so no transparent seams appear.
    for (let axis = 0; axis < 2; axis++) {
      const input = axis ? this.scratch : frame.data;
      const output = axis ? frame.data : this.scratch;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        for (let channel = 0; channel < 3; channel++) {
          let sum = 0;
          for (let tap = -2; tap <= 2; tap++) {
            const sx = axis ? x : Math.max(0, Math.min(width - 1, x + tap));
            const sy = axis ? Math.max(0, Math.min(height - 1, y + tap)) : y;
            sum += input[(sy * width + sx) * 4 + channel] * weights[tap + 2];
          }
          output[index + channel] = sum / 16;
        }
        output[index + 3] = 255;
      }
    }
    for (let i = 0; i < frame.data.length; i += 4) {
      const gray = frame.data[i] * .2126 + frame.data[i + 1] * .7152 + frame.data[i + 2] * .0722;
      for (let channel = 0; channel < 3; channel++) {
        frame.data[i + channel] = (gray + (frame.data[i + channel] - gray) * .4) * .65 + 255 * .35;
      }
    }
    this.context.putImageData(frame, 0, 0);
    this.canvas.hidden = false;
  }
}
