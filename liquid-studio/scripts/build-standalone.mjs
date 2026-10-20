import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const types = { png: 'image/png', mp4: 'video/mp4' };
let html = await read('index.html');
// The standalone file is the file:// destination, so it must not redirect again.
html = html.replace(/\s*<script id="local-preview">[\s\S]*?<\/script>/, '');
const css = await read('src/style.css');
const source = (await Promise.all(['pointer-field','liquid-births','liquid-deformation','liquid-definition','shaders','liquid-source','renderer','main'].map(name => read(`src/${name}.js`))))
  .map(code => code.replace(/^import .*;\n/gm, '').replace(/^export /gm, '')).join('\n');
html = html.replace('<link rel="stylesheet" href="./src/style.css">', () => `<style>${css}</style>`)
  .replace('<script type="module" src="./src/main.js"></script>', () => `<script type="module">${source}</script>`)
  .replace('class="wordmark" href="./"', 'class="wordmark" href="#"');
for (const name of ['liquid-packed.png','liquid-packed.mp4']) {
  const bytes = await readFile(new URL(`public/assets/${name}`, root));
  const uri = `data:${types[name.split('.').at(-1)]};base64,${bytes.toString('base64')}`;
  html = html.replaceAll(`./public/assets/${name}`, uri);
}
await mkdir(new URL('preview/', root), { recursive: true });
await writeFile(new URL('preview/zdw-liquid.html', root), html);
console.log('Standalone preview: preview/zdw-liquid.html');
