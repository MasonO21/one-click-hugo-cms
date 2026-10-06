#!/usr/bin/env node
// Downloads the Higgsfield art listed in art/manifest.json and converts it to compact WebP in
// web/assets/art/ (ImageMagick `convert` required).
//   node tools/fetch-art.mjs            -> fetch anything missing
//   node tools/fetch-art.mjs --force    -> re-download everything
//   node tools/fetch-art.mjs --sprites  -> only the in-match sprites
// Sprites ("sprite": true) are trimmed to the figure and placed on a fixed transparent canvas with
// the feet on a shared baseline and the body centred, so the game can draw every one the same way.
import { readFileSync, existsSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'web', 'assets', 'art');
const { assets } = JSON.parse(readFileSync(join(root, 'art', 'manifest.json'), 'utf8'));
const force = process.argv.includes('--force');
const onlySprites = process.argv.includes('--sprites');
const cache = new Map();
let failed = 0;

for (const a of assets) {
  if (onlySprites && !a.sprite) continue;
  const dest = join(out, a.file);
  if (existsSync(dest) && !force) { console.log(`  skip  ${a.file}`); continue; }
  mkdirSync(dirname(dest), { recursive: true });
  try {
    let src = cache.get(a.url);
    if (!src) {
      src = join(tmpdir(), `sf-art-${a.job}.png`);
      // curl honours HTTPS_PROXY and the system CA store.
      execFileSync('curl', ['-sSfL', '--retry', '2', '-o', src, a.url], { stdio: ['ignore', 'ignore', 'pipe'] });
      cache.set(a.url, src);
    }
    if (a.sprite) sprite(src, dest, a);
    else execFileSync('convert', [src, '-resize', `${a.width}x${a.height}^`, '-gravity', 'center', '-extent', `${a.width}x${a.height}`, '-strip', '-quality', String(a.quality || 80), dest]);
    console.log(`  ok    ${a.file}  ${a.width}x${a.height}  ${Math.round(statSync(dest).size / 1024)} KB`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${a.file}: ${String(e.stderr || e.message).trim().split('\n')[0]}`);
  }
}
for (const f of cache.values()) rmSync(f, { force: true });
if (failed) {
  console.log(`\n${failed} file(s) failed. If the error is a 403 from a proxy, allow the image host (${new URL(assets[0].url).host}) in your network settings.`);
  process.exit(1);
}

// Finds the figure from the alpha channel (ignoring faint noise and stray specks), then scales it to
// fill the canvas height with the feet FOOT px above the bottom and its centre of mass on the
// vertical midline. Centring the mass, not the bounding box, stops the body jumping sideways when
// the game mirrors the sprite to face left.
function sprite(src, dest, a) {
  const FOOT = 8, HEAD = 24;
  const [w, h] = execFileSync('identify', ['-format', '%w %h', src]).toString().split(' ').map(Number);
  const alpha = execFileSync('convert', [src, '-alpha', 'extract', '-depth', '8', 'gray:-'], { maxBuffer: w * h + 1024 });
  const cols = new Uint32Array(w), rows = new Uint32Array(h);
  let mass = 0, mx = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = alpha[y * w + x];
      if (v > 24) { cols[x]++; rows[y]++; mass += v; mx += v * x; }
    }
  }
  const first = arr => arr.findIndex(n => n >= 3);
  const last = arr => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] >= 3) return i; return -1; };
  const left = first(cols), right = last(cols), top = first(rows), bottom = last(rows);
  if (left < 0 || top < 0) throw new Error('sprite is empty');
  const cx = mx / mass, bw = right - left + 1, bh = bottom - top + 1, W = a.width, H = a.height;
  const k = Math.min((H - FOOT - HEAD) / bh, (W / 2 - 4) / Math.max(cx - left, right + 1 - cx));
  const sw = Math.round(bw * k), sh = Math.round(bh * k);
  const px = Math.round(W / 2 - (cx - left) * k), py = H - FOOT - sh;
  execFileSync('convert', ['-size', `${W}x${H}`, 'xc:none',
    '(', src, '-channel', 'A', '-black-threshold', '6%', '+channel', '-crop', `${bw}x${bh}+${left}+${top}`, '+repage',
    '-filter', 'Lanczos', '-resize', `${sw}x${sh}!`, ')',
    '-geometry', `+${px}+${py}`, '-composite', '-strip', '-define', 'webp:alpha-quality=95', '-quality', String(a.quality || 86), dest]);
}
