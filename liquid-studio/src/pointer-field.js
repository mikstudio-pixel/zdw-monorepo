export const FIELD_LIFETIME = 3;
export const FIELD_DISPLACEMENT = .22;

// A persistent displacement field in canvas coordinates for the repel mode.
// Pointer movement writes locally; existing marks never follow the next point.
export class PointerField {
  constructor(height = 128) {
    this.height = height;
    this.version = 0;
    this.resize(1);
  }

  resize(aspect) {
    const width = Math.max(32, Math.min(384, Math.round(this.height*aspect)));
    this.aspect = aspect;
    if (this.width === width) return;
    this.width = width;
    const count = width*this.height;
    this.life = new Float32Array(count);
    this.pushX = new Float32Array(count);
    this.pushY = new Float32Array(count);
    this.data = new Uint8Array(count*4);
    this.clear();
  }

  clear() {
    this.life.fill(0); this.pushX.fill(0); this.pushY.fill(0);
    this.active = false;
    this.pending = [];
    this.endInput();
    this.pack();
  }

  move(x, y) {
    const point = [x, y];
    const from = this.previous || point;
    if (this.previous && Math.hypot((x-from[0])*this.aspect, y-from[1]) < .0001) return;
    if (this.pending.length < 128) this.pending.push({ from, to: point });
    else this.pending[this.pending.length-1].to = point;
    this.previous = point;
  }

  endInput() { this.previous = null; }

  update(dt, { radius = .22, lifetime = FIELD_LIFETIME } = {}) {
    if (dt <= 0 || (!this.active && !this.pending.length)) return;
    const decay = Math.exp(-dt/(.65*lifetime/FIELD_LIFETIME));
    this.active = false;
    for (let i = 0; i < this.life.length; i++) {
      this.life[i] = Math.max(0, this.life[i]-dt/lifetime);
      this.pushX[i] *= this.life[i] > 0 ? decay : 0;
      this.pushY[i] *= this.life[i] > 0 ? decay : 0;
      if (this.life[i] > 0) this.active = true;
    }
    for (const segment of this.pending) this.stamp(segment,radius);
    this.pending = [];
    this.pack();
  }

  stamp({ from, to }, radius) {
    const { width, height, aspect } = this;
    const ax = from[0]*aspect, ay = from[1];
    const vx = (to[0]-from[0])*aspect, vy = to[1]-from[1];
    const length = Math.hypot(vx, vy), length2 = length*length;
    const impulse = 1-Math.exp(-(length+.001)/.025);
    const x0 = Math.max(0, Math.floor((Math.min(from[0],to[0])-radius/aspect)*width));
    const x1 = Math.min(width-1, Math.ceil((Math.max(from[0],to[0])+radius/aspect)*width));
    const y0 = Math.max(0, Math.floor((Math.min(from[1],to[1])-radius)*height));
    const y1 = Math.min(height-1, Math.ceil((Math.max(from[1],to[1])+radius)*height));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = (x+.5)/width*aspect-ax, py = (y+.5)/height-ay;
      const along = length2 ? Math.max(0,Math.min(1,(px*vx+py*vy)/length2)) : 0;
      const dx = px-vx*along, dy = py-vy*along, distance = Math.hypot(dx,dy);
      if (distance >= radius) continue;
      const edge = Math.max(0,(distance/radius-.25)/.75);
      const weight = 1-edge*edge*(3-2*edge);
      const i = y*width+x;
      this.life[i] = Math.max(this.life[i],weight);
      // Outward displacement piles up liquid at the sides of the wake.
      // A smaller directional component carries it along the stroke.
      const radial = .16/Math.max(distance,radius*.15);
      const forward = length ? .045/length : 0;
      const blend = impulse*weight;
      this.pushX[i] += ((dx*radial+vx*forward)*weight-this.pushX[i])*blend;
      this.pushY[i] += ((dy*radial+vy*forward)*weight-this.pushY[i])*blend;
      this.active = true;
    }
  }

  pack() {
    for (let i = 0; i < this.life.length; i++) {
      this.data[i*4] = Math.round(this.life[i]*255);
      this.data[i*4+1] = 128+Math.round(Math.max(-1,Math.min(1,this.pushX[i]/FIELD_DISPLACEMENT))*127);
      this.data[i*4+2] = 128+Math.round(Math.max(-1,Math.min(1,this.pushY[i]/FIELD_DISPLACEMENT))*127);
      this.data[i*4+3] = 255;
    }
    this.version++;
  }
}
