import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE=1 produces one self-contained index.html (used for web previews / sharing while the game fit in one file).
// ARTIFACT=1 (Update 13) produces the multi-file web build: assets under 40 KB (icons, voices, small paintings) are inlined
// in the script, the rest (models, floors, chapter paintings) stay files beside it, so the 30-chapter game stays under
// the hosts' per-file and file-count limits (scripts/build-artifact.mjs --multi).
// The default build emits normal hashed assets for Capacitor (iOS / Android).
const single = process.env.SINGLE === '1';
const artifact = process.env.ARTIFACT === '1';

// In the single file the 3D models (heroes, props) are inlined gzipped, a third smaller; engine/assets.js unpacks
// them with the browser's DecompressionStream.
const gzipModels = {
  name: 'inline-gzipped-models',
  enforce: 'pre',
  load(id) {
    if (!/\.glb\?url$/.test(id)) return null;
    const b64 = gzipSync(readFileSync(id.slice(0, id.indexOf('?'))), { level: 9 }).toString('base64');
    return `export default "data:application/gzip;base64,${b64}";`;
  },
};

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) }, // ui/meta/about.js
  plugins: single ? [gzipModels, viteSingleFile()] : [],
  build: {
    target: 'es2020',
    outDir: single ? 'dist-single' : artifact ? 'dist-artifact' : 'dist',
    assetsInlineLimit: single ? 100000000 : artifact ? 40000 : 4096,
    chunkSizeWarningLimit: 2000,
  },
  server: { host: true },
});
