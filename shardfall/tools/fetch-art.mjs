#!/usr/bin/env node
// Downloads the Higgsfield art listed in art/manifest.json and converts it to compact WebP in
// web/assets/art/ (ImageMagick `convert` required).
//   node tools/fetch-art.mjs            -> fetch anything missing
//   node tools/fetch-art.mjs --force    -> re-download everything
import { readFileSync, existsSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'web', 'assets', 'art');
const { assets } = JSON.parse(readFileSync(join(root, 'art', 'manifest.json'), 'utf8'));
const force = process.argv.includes('--force');
const cache = new Map();
let failed = 0;

for (const a of assets) {
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
    execFileSync('convert', [src, '-resize', `${a.width}x${a.height}^`, '-gravity', 'center', '-extent', `${a.width}x${a.height}`, '-strip', '-quality', String(a.quality || 80), dest]);
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
