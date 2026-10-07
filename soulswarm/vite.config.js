import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE=1 produces one self-contained index.html (used for web previews / sharing).
// The default build emits normal hashed assets for Capacitor (iOS / Android).
const single = process.env.SINGLE === '1';

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

export default defineConfig({
  base: './',
  plugins: single ? [gzipModels, viteSingleFile()] : [],
  build: {
    target: 'es2020',
    outDir: single ? 'dist-single' : 'dist',
    assetsInlineLimit: single ? 100000000 : 4096,
    chunkSizeWarningLimit: 2000,
  },
  server: { host: true },
});
