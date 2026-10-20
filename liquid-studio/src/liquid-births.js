export const BIRTH_LIFETIME = 3;
export const MAX_BIRTHS = 48;
const BIRTH_SPACING = .19;

// Each stroke deposits independent animation starts in canvas coordinates.
// Distance sampling keeps their density independent of pointer event frequency.
export class LiquidBirths {
  constructor() {
    this.aspect = 1;
    this.data = new Float32Array(MAX_BIRTHS*4);
    this.clear();
  }

  resize(aspect) {
    if (Math.abs(aspect-this.aspect) < .001) return;
    this.aspect = aspect;
    this.clear();
  }

  clear() {
    this.items = [];
    this.pending = [];
    this.data.fill(0);
    this.endInput();
  }

  endInput() { this.previous = null; this.distance = 0; }

  move(x, y) {
    if (!this.previous) {
      this.deposit(x,y);
    } else {
      const [ax,ay] = this.previous;
      const dx = x-ax, dy = y-ay;
      const length = Math.hypot(dx*this.aspect,dy);
      if (length < .0001) return;
      let along = BIRTH_SPACING-this.distance;
      for (; along <= length; along += BIRTH_SPACING) {
        const t = along/length;
        this.deposit(ax+dx*t,ay+dy*t);
      }
      this.distance = length-(along-BIRTH_SPACING);
    }
    this.previous = [x,y];
  }

  deposit(x,y) {
    // A full canvas traversal fits well below this bound, including fast input.
    if (this.pending.length < MAX_BIRTHS) this.pending.push({ x,y,age:0 });
  }

  update(dt) {
    if (dt <= 0) return;
    for (const item of this.items) item.age += dt;
    this.items = this.items.filter(item => item.age < BIRTH_LIFETIME);
    // Keep living shapes until their natural end, even during very fast scribbles.
    this.items.push(...this.pending.slice(0,MAX_BIRTHS-this.items.length));
    this.pending = [];
    this.items.forEach(({ x,y,age },i) => {
      this.data.set([x,y,age,0],i*4);
    });
  }
}
