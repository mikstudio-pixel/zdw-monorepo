import './bridge.js';
const { importMedia } = await import('../../desktop/renderer/app.js');
document.getElementById('reveal').textContent = 'Uložit soubor';
await importMedia(window.liquid.loadDefaultVideo);
