import './bridge.js';
import { mountFlow, startFlow } from './flow.js';
const guided = !new URLSearchParams(location.search).has('editor');
if (guided) { mountFlow(); window.liquid.regionMode = 'area'; }
const { importMedia, studio, studioEvents } = await import('../../desktop/renderer/app.js');
document.getElementById('reveal').textContent = 'Uložit soubor';
if (guided) {
  document.querySelector('[data-aspect="9:16"]').click();
  startFlow(studio, studioEvents);
}
await importMedia(window.liquid.loadDefaultVideo);
