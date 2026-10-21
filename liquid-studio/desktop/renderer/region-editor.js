import { canvasPoint } from '../shared/regions.js';
import { FORMATS } from '../shared/settings.js';

const $ = id => document.getElementById(id);
const brushes = {
  liquid: { min: 60, max: 1440, initial: 180 },
  glass: { min: 20, max: 480, initial: 240 },
  erase: { min: 20, max: 480, initial: 240 },
};

export class RegionEditor {
  constructor({ canvas, getSettings, createMaps, liquidCoverage, enabled, onChange, onModeChange, pause, onError, areaMode = false }) {
    Object.assign(this, { canvas, getSettings, createMaps, liquidCoverage, enabled, onChange, onModeChange, pause, onError, areaMode });
    this.tool = 'move'; this.layer = 'glass'; this.editing = false;
    this.brushSizes = Object.fromEntries(Object.entries(brushes).map(([tool, range]) => [tool, range.initial]));
    this.undo = []; this.redo = [];
    document.querySelectorAll('[data-tool]').forEach(button => button.onclick = () => this.choose(button.dataset.tool));
    $('apply-regions').onclick = () => this.finish(true);
    $('discard-regions').onclick = () => this.finish(false);
    $('undo-region').onclick = () => this.travel(this.undo, this.redo);
    $('redo-region').onclick = () => this.travel(this.redo, this.undo);
    $('brush-size').oninput = () => {
      if (brushes[this.tool]) this.brushSizes[this.tool] = Number($('brush-size').value);
      $('brush-value').value = $('brush-size').value; $('brush-cursor').hidden = true;
    };
    $('clear-region').onclick = () => {
      if (!this.editing) return;
      const before = this.maps.snapshot();
      this.targets().forEach(layer => this.maps.clear(layer));
      this.remember(before); this.onChange();
    };
    canvas.addEventListener('pointerdown', event => this.pointerDown(event));
    canvas.addEventListener('pointermove', event => this.pointerMove(event));
    canvas.addEventListener('pointerup', event => {
      if (!this.stroke || this.stroke.pointerId !== event.pointerId) return;
      // Chromium can coalesce the last move while the preview is rendering.
      // Include the release position so a fast stroke never loses its tail.
      const point = this.point(event);
      if (point) this.paint(point);
      this.endStroke();
    });
    canvas.addEventListener('pointercancel', () => this.endStroke(true));
    canvas.addEventListener('lostpointercapture', () => this.endStroke());
    canvas.addEventListener('pointerleave', () => { $('brush-cursor').hidden = true; });
    document.addEventListener('keydown', event => {
      if (!this.editing || ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault(); this.travel(event.shiftKey ? this.redo : this.undo, event.shiftKey ? this.undo : this.redo);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        if (this.areaMode) this.endStroke(true);
        else this.finish(false);
      }
    });
  }
  choose(tool) {
    if (!this.enabled() || (this.editing && tool === 'move')) return;
    if (tool !== 'move' && !this.editing) {
      this.pause();
      try { this.maps = this.createMaps(); } catch (error) { this.onError(error); return; }
      if (this.areaMode) this.maps.useLiquidArea();
      this.originalLiquid = this.getSettings().liquid;
      this.undo = []; this.redo = []; this.editing = true;
    }
    this.tool = tool;
    if (tool === 'glass' || tool === 'liquid') { this.layer = tool; $('erase-layer').value = tool; }
    if (tool === 'liquid') this.getSettings().liquid = true;
    this.sync(); this.onModeChange(); this.onChange();
  }
  finish(apply) {
    if (!this.editing) return;
    this.endStroke();
    if (apply) this.getSettings().regions = this.maps.serialize();
    else this.getSettings().liquid = this.originalLiquid;
    this.editing = false; this.maps = null; this.tool = 'move';
    this.undo = []; this.redo = []; this.sync(); this.onModeChange(); this.onChange();
  }
  targets() {
    const target = this.tool === 'erase' ? $('erase-layer').value : this.layer;
    return target === 'both' ? ['glass', 'liquid'] : [target];
  }
  sync() {
    $('edit-actions').hidden = $('brush-options').hidden = !this.editing;
    $('erase-layer').hidden = this.tool !== 'erase';
    if (brushes[this.tool]) {
      const input = $('brush-size'), range = brushes[this.tool];
      input.min = range.min; input.max = range.max;
      input.value = this.brushSizes[this.tool];
      $('brush-value').value = input.value;
    }
    $('undo-region').disabled = !this.undo.length;
    $('redo-region').disabled = !this.redo.length;
    this.canvas.classList.toggle('painting', this.editing);
    $('brush-cursor').hidden = true;
    document.querySelectorAll('[data-tool]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.tool === this.tool));
      button.disabled = !this.enabled() || (this.editing && button.dataset.tool === 'move');
    });
  }
  point(event) {
    return canvasPoint(event.clientX, event.clientY, this.canvas.getBoundingClientRect(), ...FORMATS[this.getSettings().aspect]);
  }
  pointerDown(event) {
    if (!this.editing || !this.enabled() || event.button !== 0 || this.stroke) return;
    const point = this.point(event);
    if (!point) return;
    event.preventDefault(); this.pause();
    this.stroke = { before: this.maps.snapshot(), version: this.maps.version, last: point, pointerId: event.pointerId };
    if (this.tool === 'liquid') this.maps.beginLiquidStroke();
    this.canvas.setPointerCapture(event.pointerId);
    this.paint(point); this.pointerMove(event);
  }
  pointerMove(event) {
    if (!this.editing) return;
    const point = this.point(event), cursor = $('brush-cursor');
    cursor.hidden = !point;
    if (point) {
      const rect = this.canvas.getBoundingClientRect(), stage = $('stage').getBoundingClientRect();
      const [w, h] = FORMATS[this.getSettings().aspect];
      const diameter = Number($('brush-size').value) / 1080 * Math.min(rect.width / w, rect.height / h) * h;
      cursor.style.width = cursor.style.height = `${diameter}px`;
      cursor.style.left = `${event.clientX - stage.left}px`; cursor.style.top = `${event.clientY - stage.top}px`;
      cursor.className = this.tool;
    }
    if (!this.stroke || this.stroke.pointerId !== event.pointerId) return;
    if (point) this.paint(point);
    else this.stroke.last = null;
  }
  paint(point) {
    const settings = this.getSettings(), [w, h] = FORMATS[settings.aspect];
    const from = this.stroke.last || point, diameter = Number($('brush-size').value);
    try {
      this.targets().forEach(layer => {
        if (layer === 'glass' && this.tool === 'erase') this.maps.eraseGlass(from, point, diameter, w / h, settings.size);
        else if (layer === 'liquid' && this.tool === 'erase' && this.maps.liquidMode !== 'area') this.maps.eraseLiquid(from, point, diameter, w / h,
          this.stroke.liquidCoverage ||= this.liquidCoverage(this.maps));
        else this.maps.paint(layer, from, point, diameter, w / h, this.tool === 'erase');
      });
    } catch (error) { this.endStroke(true); this.onError(error); return; }
    this.stroke.last = point; this.onChange();
  }
  endStroke(cancelled = false) {
    if (!this.stroke) return;
    const stroke = this.stroke; this.stroke = null;
    if (cancelled) { this.maps.restore(stroke.before); this.onChange(); }
    else if (this.maps.version !== stroke.version) this.remember(stroke.before);
    if (this.canvas.hasPointerCapture(stroke.pointerId)) this.canvas.releasePointerCapture(stroke.pointerId);
    this.onChange();
  }
  remember(snapshot) {
    this.undo.push(snapshot); if (this.undo.length > 20) this.undo.shift();
    this.redo = []; this.sync();
  }
  travel(from, to) {
    if (!this.editing || !from.length || this.stroke) return;
    to.push(this.maps.snapshot()); this.maps.restore(from.pop()); this.sync(); this.onChange();
  }
}
