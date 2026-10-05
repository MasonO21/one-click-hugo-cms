import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE=1 produces one self-contained index.html (used for web previews / sharing).
// The default build emits normal hashed assets for Capacitor (iOS / Android).
const single = process.env.SINGLE === '1';

export default defineConfig({
  base: './',
  plugins: single ? [viteSingleFile()] : [],
  build: {
    target: 'es2020',
    outDir: single ? 'dist-single' : 'dist',
    assetsInlineLimit: single ? 100000000 : 4096,
    chunkSizeWarningLimit: 2000,
  },
  server: { host: true },
});
