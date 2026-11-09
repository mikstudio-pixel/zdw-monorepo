import { mkdir, copyFile, rm } from 'node:fs/promises';
const target = new URL('../vendor/', import.meta.url);
await mkdir(target, { recursive: true });
for (const name of ['shaders.js', 'liquid-ae-data.js', 'liquid-deformation.js', 'liquid-source.js', 'liquid-definition.js', 'pointer-field.js', 'liquid-births.js']) {
  await copyFile(new URL(`../../src/${name}`, import.meta.url), new URL(name, target));
}
console.log('Původní WebGL shadery zkopírovány beze změn.');

// Retire generated assets from the previous appearance-reconstruction engine.
for (const name of ['liquid-material.js', 'liquid-palette-fit.js', 'liquid-appearance.js', 'liquid-appearance-data.js', 'liquid-appearance.bin.gz', 'liquid-flow.js', 'liquid-flow-data.js', 'liquid-filter.js']) {
  await rm(new URL(name, target), { force: true });
}
