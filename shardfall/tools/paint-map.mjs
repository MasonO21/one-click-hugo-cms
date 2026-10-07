#!/usr/bin/env node
// Paints the battlefield art into web/assets/art/map.webp from the game's real layout
// (see tools/map-painter.js). Re-run it after moving the lane, river, camps, towers or bushes.
//   node tools/paint-map.mjs [scale, default 1.5] [webp quality, default 0.85]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './lib/pw.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const S = +(process.argv[2] || 1.5), Q = +(process.argv[3] || 0.85);
const browser = await launchChromium();
try {
  const page = await browser.newPage();
  page.on('pageerror', e => { console.error(e); process.exitCode = 1; });
  await page.setContent('<!doctype html><html><body></body></html>');
  for (const f of ['web/js/data.js', 'web/js/match.js', 'tools/map-painter.js']) await page.addScriptTag({ content: readFileSync(join(root, f), 'utf8') });
  const t0 = Date.now();
  const url = await page.evaluate(([s, q]) => window.paintMap(s).toDataURL('image/webp', q), [S, Q]);
  const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  const out = join(root, 'web', 'assets', 'art', 'map.webp');
  writeFileSync(out, buf);
  console.log(`painted ${out} at ${S}x in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${(buf.length / 1024).toFixed(0)} KB`);
} finally {
  await browser.close();
}
