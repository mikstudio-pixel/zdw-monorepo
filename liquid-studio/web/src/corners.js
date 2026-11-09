const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const storageKey = 'liquid-studio-corners';
const dragThreshold = 10;

function savedCorners() {
  try {
    const layout = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(layout) && [2, 3].includes(layout.length) &&
        new Set(layout).size === layout.length && layout.every(corner => corners.includes(corner))) {
      // A previously separate save button now joins load in its saved corner.
      return layout.slice(0, 2);
    }
  } catch {
    // The controls still work when browser storage is unavailable.
  }
  return null;
}

function cornerAt(event) {
  const vertical = event.clientY < innerHeight / 2 ? 'top' : 'bottom';
  const horizontal = event.clientX < innerWidth / 2 ? 'left' : 'right';
  return `${vertical}-${horizontal}`;
}

const translate = (x, y) => `translate(${x}px, ${y}px)`;

export function setupCornerDocks(toolkit, files) {
  const controls = [toolkit, files];
  const compact = matchMedia('(max-width: 600px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const targets = corners.map(corner => {
    const target = document.createElement('div');
    target.className = 'flow-dock-target';
    target.dataset.flowDock = corner;
    target.setAttribute('aria-hidden', 'true');
    target.hidden = true;
    return target;
  });
  document.body.append(...targets);

  let layout = savedCorners();
  let defaultIsCompact;
  let drag = null;
  const applyLayout = () => {
    defaultIsCompact = compact.matches;
    const defaults = defaultIsCompact
      ? ['bottom-right', 'bottom-left']
      : ['top-left', 'bottom-left'];
    controls.forEach((control, index) => { control.dataset.flowDock = (layout || defaults)[index]; });
  };
  applyLayout();
  compact.addEventListener('change', () => { if (!layout && !drag) applyLayout(); });

  for (const control of controls) {
    let suppressClick = false;
    let glide;
    control.addEventListener('pointerdown', event => {
      if (drag || !event.isPrimary || event.button !== 0) return;
      const handle = event.target.closest('button') || control;
      if (handle.disabled) return;
      suppressClick = false;
      // Capturing on the pressed button preserves its normal tap behavior.
      handle.setPointerCapture(event.pointerId);
      drag = { control, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    });

    const move = event => {
      if (drag?.control !== control || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.targets) {
        if (Math.hypot(dx, dy) < dragThreshold) return;
        const visible = control.getBoundingClientRect();
        glide?.cancel();
        const docked = control.getBoundingClientRect();
        drag.offsetX = visible.left - docked.left;
        drag.offsetY = visible.top - docked.top;
        drag.targets = targets.filter(target => controls.every(item => item.dataset.flowDock !== target.dataset.flowDock));
        suppressClick = true;
        control.dataset.dockDragging = '';
        for (const target of drag.targets) {
          target.style.width = `${docked.width}px`;
          target.style.height = `${docked.height}px`;
          target.hidden = false;
        }
      }
      control.style.transform = translate(dx + drag.offsetX, dy + drag.offsetY);
      const corner = cornerAt(event);
      for (const target of drag.targets) target.classList.toggle('is-over', target.dataset.flowDock === corner);
    };
    control.addEventListener('pointermove', move);

    const finish = event => {
      if (drag?.control !== control || drag.pointerId !== event.pointerId) return;
      if (event.type === 'pointerup') move(event);
      const available = drag.targets;
      drag = null;
      if (!available) {
        if (!layout && defaultIsCompact !== compact.matches) applyLayout();
        return;
      }

      const from = control.getBoundingClientRect();
      const corner = cornerAt(event);
      if (event.type === 'pointerup' && available.some(target => target.dataset.flowDock === corner)) {
        control.dataset.flowDock = corner;
        layout = controls.map(item => item.dataset.flowDock);
        try { localStorage.setItem(storageKey, JSON.stringify(layout)); } catch {}
      }
      delete control.dataset.dockDragging;
      control.style.transform = '';
      for (const target of available) target.hidden = true;
      if (!layout && defaultIsCompact !== compact.matches) applyLayout();
      const to = control.getBoundingClientRect();
      if (!reducedMotion.matches) {
        glide = control.animate([
          { transform: translate(from.left - to.left, from.top - to.top) },
          { transform: 'none' },
        ], { duration: 220, easing: 'ease-out' });
      }
    };
    control.addEventListener('pointerup', finish);
    control.addEventListener('pointercancel', finish);
    control.addEventListener('lostpointercapture', finish);
    control.addEventListener('click', event => {
      if (!suppressClick || (event.detail === 0 && !event.pointerType)) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }
}
