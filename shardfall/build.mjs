// Bundles web/ into one self-contained HTML file.
//   node build.mjs              -> dist/shardfall.html (full document, opens anywhere)
//   node build.mjs --fragment   -> dist/shardfall.fragment.html (no <html>/<head>/<body>, for hosts that add their own)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const web = join(root, 'web');
const fragment = process.argv.includes('--fragment');

let html = readFileSync(join(web, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="style.css">/, () => `<style>\n${readFileSync(join(web, 'style.css'), 'utf8')}</style>`);
html = html.replace(/<script src="(js\/[\w.-]+)"><\/script>/g, (_, src) => `<script>\n${readFileSync(join(web, src), 'utf8')}</script>`);

if (fragment) {
  html = html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<\/?html[^>]*>\s*/gi, '')
    .replace(/<\/?head>\s*/gi, '')
    .replace(/<\/?body>\s*/gi, '')
    .replace(/<meta (charset|name="viewport")[^>]*>\s*/gi, '');
}

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', fragment ? 'shardfall.fragment.html' : 'shardfall.html');
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(1)} KB)`);
