import { mkdir, copyFile } from 'node:fs/promises';
const target = new URL('../vendor/', import.meta.url);
await mkdir(target, { recursive: true });
for (const name of ['shaders.js', 'liquid-deformation.js', 'liquid-source.js', 'liquid-definition.js', 'pointer-field.js', 'liquid-births.js']) {
  await copyFile(new URL(`../../src/${name}`, import.meta.url), new URL(name, target));
}
console.log('Původní WebGL shadery zkopírovány beze změn.');
