// Turns a Vite build into one self-contained HTML file (used for the shareable demo).
// Usage: node scripts/inline.mjs dist-demo
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'dist-demo';
let html = readFileSync(join(dir, 'index.html'), 'utf8');
const read = (ref) => readFileSync(join(dir, ref.replace(/^\.\//, '')), 'utf8');

html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, (_, src) => {
  const js = read(src).replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/, (_, href) => `<style>${read(href)}</style>`);
// The single file has no neighbours: inline the icon, drop the install-only links.
const icon = Buffer.from(read('icon.svg')).toString('base64');
html = html
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="data:image/svg+xml;base64,${icon}" type="image/svg+xml" />`)
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '');

const out = join(dir, 'sunup-demo.html');
writeFileSync(out, html);
console.log(`wrote ${out} (${Math.round(html.length / 1024)} KB)`);
