// Builds the generated files (committed, because GitHub Pages publishes the repo root as-is):
//   3d/plant-floor.js   the lazy 3D chunk (three.js tree-shaken in), loaded after first paint
//   ui/                caylor-ui styles and the 3D gate, copied from caylor-ui/ (do not edit there)
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

mkdirSync('3d', { recursive: true });
mkdirSync('ui', { recursive: true });
await build({
  entryPoints: ['src3d/plant-floor.js'], bundle: true, format: 'esm', minify: true, target: 'es2020',
  outfile: '3d/plant-floor.js', legalComments: 'none', logLevel: 'warning',
});
const banner = (f) => `/* Generated from caylor-ui/${f} (caylor-ui ${readFileSync('caylor-ui/VERSION', 'utf8').trim()}). Edit the source, then npm run build. */\n`;
writeFileSync('ui/caylor-ui.css', banner('tokens.css + base.css') + readFileSync('caylor-ui/tokens.css', 'utf8') + '\n' + readFileSync('caylor-ui/base.css', 'utf8'));
writeFileSync('ui/support.js', banner('three/support.js') + readFileSync('caylor-ui/three/support.js', 'utf8'));
const kb = (f) => (gzipSync(readFileSync(f)).length / 1024).toFixed(1);
console.log(`3D chunk: ${kb('3d/plant-floor.js')} KB gzip`);
