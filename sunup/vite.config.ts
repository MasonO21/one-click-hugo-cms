/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The single-file demo has no neighbouring files, so its images are inlined too.
  build: process.env.VITE_SUNUP_SINGLE === '1' ? { assetsInlineLimit: 10_000_000 } : {},
  // Relative asset paths so the build works from any folder (and as a single inlined file).
  base: './',
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
