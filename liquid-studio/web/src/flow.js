import { DEFAULT_LIQUID_COLORS, PALETTE_PRESET_COLORS } from '../../desktop/shared/settings.js';
import { setupTimeline } from './timeline.js';

const $ = id => document.getElementById(id);
const icon = name => `<img class="flow-icon" src="./assets/icons/${name}.png" width="32" height="32" alt="" aria-hidden="true" draggable="false">`;
const layers = ['liquid', 'glass', null];
const steps = ['Oblast liquidu', 'Kostičky', 'Barevná paleta'];
const palettes = [
  ['Pastel', DEFAULT_LIQUID_COLORS],
  ['Festival', PALETTE_PRESET_COLORS],
  ['Modrá', ['#16533f', '#437486', '#9fbaff', '#c7d6ff', '#9fbaff', '#6084cd', '#16533f']],
];

export function mountFlow() {
  document.body.classList.add('guided');
  document.body.insertAdjacentHTML('afterbegin', `
    <div class="flow-top flow-chrome">
      <nav class="flow-steps" aria-label="Postup tvorby">${steps.map((name, i) => `<button type="button" data-step-index="${i}" aria-label="${i + 1}. ${name}" title="${name}">${i < 2 ? icon(i === 0 ? 'drop' : 'cube') : '<span class="palette-icon" aria-hidden="true"><i></i><i></i><i></i><i></i></span>'}</button>`).join('')}</nav>
      <button id="flow-eraser" type="button" aria-pressed="false" aria-label="Guma" title="Zapnout nebo vypnout gumu">${icon('eraser')}</button>
    </div>
    <h1 id="flow-title" class="sr-only" tabindex="-1" aria-live="polite"></h1>`);
  document.querySelector('main').insertAdjacentHTML('beforeend', '<section id="flow-palettes" class="flow-chrome" aria-label="Barevná paleta" hidden><div class="flow-palette-list"></div></section>');
  document.querySelector('footer').insertAdjacentHTML('beforeend', `<button id="flow-back" hidden>← Zpátky</button><button id="flow-next" disabled><span id="flow-save-icon" hidden>${icon('save')}</span><span id="flow-next-label">Další →</span></button>`);
  $('replace-video').innerHTML = `${icon('file')}<span>Nahrát</span>`;
  document.querySelector('footer').prepend($('replace-video'));
  document.querySelector('footer').classList.add('flow-chrome');
  document.body.insertAdjacentHTML('beforeend', `
    <section id="flow-timeline" class="timeline-panel flow-chrome" aria-label="Timeline videa">
      <button id="timeline-add" type="button" aria-label="Přidat klíčový snímek" title="Přidat klíčový snímek"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6 1 11 6 6 11 1 6Z" fill="var(--marker-selected)" stroke="currentColor"/><path d="M12 8v7m-3.5-3.5h7" fill="none" stroke="var(--surface-raised)" stroke-width="3"/><path d="M12 8v7m-3.5-3.5h7" fill="none" stroke="currentColor"/></svg></button>
      <div class="timeline-transport"></div>
      <div class="timeline-track"><div id="timeline-markers" aria-label="Klíčové snímky"></div></div>
    </section>`);
  document.querySelector('.timeline-transport').append($('play'), $('current-time'), $('duration'));
  $('current-time').textContent = '00:00';
  $('play').textContent = '▶︎';
  document.querySelector('.timeline-track').append($('timeline'));
  $('reveal').textContent = 'Uložit obrázek';
}

export function startFlow(studio, events) {
  let step = 0, transitioning = false, prepared = false, pendingStart = false, saving = false, navigating = false, previewing = false;
  const next = $('flow-next');
  const locked = () => studio.busy || !studio.ready || transitioning || saving;
  const sync = () => {
    if (pendingStart && studio.ready && !studio.busy) {
      pendingStart = false;
      previewing = false;
      studio.resetRegions(); enter(0); return;
    }
    const disabled = locked();
    document.body.classList.toggle('is-drawing', studio.drawing);
    document.body.dataset.mediaType = studio.isImage ? 'image' : 'video';
    $('flow-timeline').hidden = studio.isImage || step === 2;
    next.disabled = disabled || (step === 0 && !studio.hasArea('liquid')) || (step === 2 && studio.isImage && !prepared);
    next.setAttribute('aria-label', step === 2 ? studio.isImage ? 'Uložit obrázek PNG' : 'Exportovat video MP4' : 'Další krok');
    $('flow-next-label').textContent = step === 2 ? studio.isImage ? 'Obrázek ↓' : 'Export MP4' : 'Další →';
    $('flow-save-icon').hidden = step !== 2;
    $('flow-back').disabled = disabled;
    $('replace-video').disabled = studio.busy || transitioning || saving;
    $('flow-eraser').disabled = disabled || step === 2;
    $('flow-eraser').setAttribute('aria-pressed', String(studio.tool === 'erase'));
    document.querySelectorAll('[data-step-index]').forEach(button => { button.disabled = disabled; });
    document.querySelectorAll('[data-flow-palette]').forEach(button => {
      button.disabled = disabled;
      button.setAttribute('aria-pressed', String(palettes[Number(button.dataset.flowPalette)][1].every((color, i) => color === studio.colors[i])));
    });
    timeline.sync();
  };
  const prepare = async () => {
    prepared = false; sync();
    if (!studio.isImage) { prepared = true; sync(); return; }
    prepared = Boolean(await studio.prepareImage()); sync();
  };
  function enter(index, focus = false) {
    step = index;
    document.body.dataset.step = ['liquid', 'glass', 'palette'][step];
    $('flow-title').textContent = `${step + 1}. ${steps[step]}`;
    $('flow-back').hidden = step === 0;
    $('replace-video').hidden = step !== 0;
    $('flow-palettes').hidden = step !== 2;
    document.querySelectorAll('[data-step-index]').forEach((button, i) => {
      if (i === step) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    if (!navigating) {
      if (step < 2) studio.editLayer(layers[step]);
      else void prepare();
    }
    sync();
    if (focus) $('flow-title').focus({ preventScroll: true });
  }
  function beginPreview(seed = false) {
    prepared = false;
    if (previewing && !seed) {
      if (step === 2) next.disabled = true;
      return;
    }
    previewing = true; prepared = false;
    studio.openTimeline({ seed });
    sync();
  }
  function endPreview(preparePalette = true) {
    if (previewing) {
      previewing = false;
      studio.closeTimeline();
      if (!navigating) {
        if (step < 2) studio.editLayer(layers[step]);
        else if (preparePalette) void prepare();
      }
    }
  }
  const timeline = setupTimeline({ studio, events, locked,
    onPreview: seed => beginPreview(seed), onEdit: () => endPreview(),
    getLayer: () => layers[step] });
  $('preview').addEventListener('pointerdown', () => {
    if (previewing && !locked()) endPreview();
  }, { capture: true });
  async function navigate(index) {
    if (locked()) return;
    const morph = step === 0 && index > 0 && studio.hasArea('liquid');
    navigating = true;
    endPreview();
    studio.confirmLayer(); navigating = false; transitioning = morph;
    enter(index, true);
    if (morph) { await studio.morphLiquid(); transitioning = false; sync(); }
  }
  document.querySelectorAll('[data-step-index]').forEach((button, index) => { button.onclick = () => index !== step && navigate(index); });
  palettes.forEach(([name, colors], index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.flowPalette = index;
    button.setAttribute('aria-label', name); button.title = name;
    button.setAttribute('aria-pressed', String(index === 0));
    const swatches = document.createElement('span'); swatches.className = 'flow-palette-colors'; swatches.setAttribute('aria-hidden', 'true');
    colors.forEach(color => { const swatch = document.createElement('i'); swatch.style.backgroundColor = color; swatches.append(swatch); });
    button.append(swatches);
    button.onclick = () => {
      endPreview(false);
      studio.setPalette(colors);
      document.querySelectorAll('[data-flow-palette]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
      void prepare();
    };
    document.querySelector('.flow-palette-list').append(button);
  });
  $('flow-eraser').onclick = () => { endPreview(); studio.chooseTool(studio.tool === 'erase' ? layers[step] : 'erase'); };
  next.onclick = async () => {
    if (next.disabled) return;
    if (step < 2) { await navigate(step + 1); return; }
    saving = true; sync();
    try {
      if (studio.isImage) {
        const result = await window.liquid.revealExport('image');
        if (!result.ok && !result.cancelled) {
          $('status').hidden = false; $('status').classList.add('error');
          $('status-title').textContent = 'Obrázek se nepodařilo uložit';
          $('status-message').textContent = result.error; $('dismiss').hidden = false;
        }
      } else {
        await studio.exportVideo();
      }
    } finally { saving = false; sync(); }
  };
  $('flow-back').onclick = () => navigate(step - 1);
  const replace = $('replace-video').onclick;
  $('replace-video').onclick = async () => {
    endPreview();
    studio.confirmLayer();
    await replace();
    if (studio.ready && step < 2) studio.editLayer(layers[step]);
    sync();
  };
  events.addEventListener('change', sync);
  events.addEventListener('mediachange', () => { prepared = false; pendingStart = true; });
  enter(0);
}
