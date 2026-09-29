// Visual review of the capsule art:  node tools/gacha-sheet.mjs [out.png]
import { build } from 'esbuild';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.argv[2] || '/tmp/tt/gacha-sheet.png';
fs.mkdirSync('/tmp/tt', { recursive: true });
await build({ entryPoints: [path.join(root, 'tools/qa/gacha-entry.js')], bundle: true, format: 'iife', outfile: '/tmp/tt/gacha-bundle.js', logLevel: 'error' });
const font = fs.readFileSync(path.join(root, 'node_modules/@fontsource/fredoka/files/fredoka-latin-700-normal.woff2')).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()));
await page.setContent(`<!doctype html><style>@font-face{font-family:Fredoka;src:url(data:font/woff2;base64,${font});font-weight:700}body{margin:0}</style><canvas id=c></canvas>`);
await page.addScriptTag({ content: fs.readFileSync('/tmp/tt/gacha-bundle.js', 'utf8') });
await page.evaluate(() => document.fonts.load('700 20px Fredoka'));
const size = await page.evaluate(() => {
  const { D, drawItemArt, drawMachine, drawDropped, newMachine, stepMachine, MW, MH, drawCapsule, capsuleStyle } = window.G;
  const cv = document.getElementById('c'), c = cv.getContext('2d');
  const cell = 112, cols = 10;
  const groups = [
    D.GACHA_POOL.filter((i) => i.kind === 'prop'), D.GACHA_POOL.filter((i) => i.kind === 'hat'), D.GACHA_POOL.filter((i) => i.kind === 'skin' || i.kind === 'fx'),
    D.GACHA_POOL.filter((i) => i.filler), D.GACHA_POOL.filter((i) => i.kind === 'fig' && !i.gold).slice(0, 20), D.GACHA_POOL.filter((i) => i.gold),
  ];
  const rows = groups.reduce((a, g) => a + Math.ceil(g.length / cols), 0);
  cv.width = cols * cell + MW + 20; cv.height = Math.max(rows * cell + 140, MH + 20);
  c.fillStyle = '#cfeaff'; c.fillRect(0, 0, cv.width, cv.height);
  let row = 0;
  for (const g of groups) {
    g.forEach((it, i) => { const x = (i % cols) * cell, y = (row + Math.floor(i / cols)) * cell; c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x + 3, y + 3, cell - 6, cell - 6); drawItemArt(c, it.id, x + cell / 2, y + cell * 0.46, cell * 0.72, 1.3); c.fillStyle = D.GACHA.tiers.find((t) => t.id === it.tier).color; c.fillRect(x + 6, y + cell - 12, cell - 12, 5); c.font = '700 10px Fredoka'; c.textAlign = 'center'; c.fillStyle = '#3b1d5e'; c.fillText(it.name.slice(0, 18), x + cell / 2, y + cell - 16); });
    row += Math.ceil(g.length / cols);
  }
  // capsule tiers
  ['common', 'uncommon', 'rare', 'legendary'].forEach((t, i) => { drawCapsule(c, 60 + i * 110, row * cell + 60, 34, capsuleStyle(t, 330 + i * 30), { rot: 0.3, glow: 0.4, t: 1 }); drawCapsule(c, 60 + i * 110 + 0, row * cell + 60 + 0, 0.01, capsuleStyle(t), {}); });
  drawCapsule(c, 520, row * cell + 60, 34, capsuleStyle('rare'), { open: 0.7, t: 1 });
  // machine
  const m = newMachine(); for (let i = 0; i < 90; i++) stepMachine(m, 1 / 30);
  c.save(); c.translate(cols * cell + 10, 10); drawMachine(c, m, 2.2, { hover: 1 });
  m.out.push({ x: 180, y: 424, ty: 424, tx: 180, r: 26, tier: 'rare', rot: 0.2, landed: true, ready: true, t0: 0, i: 0, wob: 0.2 });
  m.time = 1; drawDropped(c, m, 2.2); c.restore();
  return [cv.width, cv.height];
});
await (await page.$('#c')).screenshot({ path: out });
await browser.close();
console.log('wrote', out, size.join('x'));
