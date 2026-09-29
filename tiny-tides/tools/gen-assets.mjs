// Renders the App Store icon, launch splash and web icons from the game's own procedural art.
// Output: assets/icon-only.png (1024, opaque), assets/splash.png (2732), assets/web/icon-{180,192,512}.png
// Then run `npx capacitor-assets generate --ios` (npm run assets:ios) to fill the Xcode asset catalog.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.mkdirSync(path.join(root, 'assets/web'), { recursive: true });
fs.mkdirSync('/tmp/tt', { recursive: true });
await build({ entryPoints: [path.join(root, 'tools/art-entry.js')], bundle: true, format: 'iife', outfile: '/tmp/tt/art-bundle.js', logLevel: 'error' });
const font = fs.readFileSync(path.join(root, 'node_modules/@fontsource/fredoka/files/fredoka-latin-700-normal.woff2')).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
await page.setContent(`<!doctype html><style>@font-face{font-family:F;src:url(data:font/woff2;base64,${font});font-weight:700}body{margin:0}</style><canvas id=c width=1024 height=1024></canvas>`);
await page.addScriptTag({ content: fs.readFileSync('/tmp/tt/art-bundle.js', 'utf8') });
await page.evaluate(() => document.fonts.load('700 100px F'));

// ---------------------------------------------------------------- icon
const iconPng = await page.evaluate(() => {
  const cv = document.getElementById('c'), c = cv.getContext('2d'), T = Math.PI * 2, { drawSprite } = window.Art;
  c.clearRect(0, 0, 1024, 1024);
  const g = c.createLinearGradient(0, 0, 0, 1024); g.addColorStop(0, '#5fd6ff'); g.addColorStop(0.55, '#7f8cff'); g.addColorStop(1, '#b06cf5');
  c.fillStyle = g; c.fillRect(0, 0, 1024, 1024);
  // sun glow
  const rg = c.createRadialGradient(300, 230, 10, 300, 230, 520); rg.addColorStop(0, 'rgba(255,255,255,.75)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = rg; c.fillRect(0, 0, 1024, 1024);
  // rays
  c.save(); c.translate(512, 640); c.fillStyle = 'rgba(255,255,255,.10)'; for (let i = 0; i < 14; i++) { c.rotate(T / 14); c.beginPath(); c.moveTo(-40, 0); c.lineTo(0, -900); c.lineTo(40, 0); c.fill(); } c.restore();
  // pool: sand ring + water
  const ring = (rx, ry, col) => { c.fillStyle = col; c.beginPath(); c.ellipse(512, 800, rx, ry, 0, 0, T); c.fill(); };
  c.fillStyle = 'rgba(40,10,90,.25)'; c.beginPath(); c.ellipse(512, 870, 470, 120, 0, 0, T); c.fill();
  ring(470, 190, '#e9b877'); c.lineWidth = 12; c.strokeStyle = '#3b1d5e'; c.beginPath(); c.ellipse(512, 800, 470, 190, 0, 0, T); c.stroke();
  ring(430, 160, '#ffe9c2'); ring(360, 120, '#7fe6f6');
  const wg = c.createLinearGradient(0, 700, 0, 900); wg.addColorStop(0, '#9af3ff'); wg.addColorStop(1, '#3fb4ea'); c.fillStyle = wg; c.beginPath(); c.ellipse(512, 800, 360, 120, 0, 0, T); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 8; c.lineCap = 'round'; for (const [x, y, w] of [[380, 790, 90], [560, 830, 110], [640, 770, 70]]) { c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + w / 2, y - 18, x + w, y); c.stroke(); }
  // hero: evolved starfish + crab friend
  c.save(); c.translate(512, 745); drawSprite(c, 'crab.0', 0, 0, 720, { hat: 'crownhat' }); c.restore();
  // bubbles & sparkles
  const bub = (x, y, r) => { const b = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r); b.addColorStop(0, 'rgba(255,255,255,.95)'); b.addColorStop(0.6, 'rgba(200,240,255,.35)'); b.addColorStop(1, 'rgba(180,200,255,.5)'); c.fillStyle = b; c.beginPath(); c.arc(x, y, r, 0, T); c.fill(); c.lineWidth = 7; c.strokeStyle = '#3b1d5e'; c.stroke(); };
  bub(190, 300, 74); bub(800, 230, 92); bub(880, 440, 46); bub(120, 520, 40);
  const pearl = (x, y, r) => { const b = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r); b.addColorStop(0, '#fff'); b.addColorStop(1, '#f2a9e0'); c.fillStyle = b; c.beginPath(); c.arc(x, y, r, 0, T); c.fill(); c.lineWidth = 5; c.strokeStyle = '#3b1d5e'; c.stroke(); };
  pearl(800, 230, 40); pearl(190, 300, 30);
  const star = (x, y, r, col) => { c.fillStyle = col; c.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); c.lineTo(x + Math.cos(a + 0.78) * r * 0.28, y + Math.sin(a + 0.78) * r * 0.28); } c.fill(); };
  star(470, 150, 46, '#fff'); star(640, 100, 28, '#ffe66d'); star(930, 650, 30, '#fff'); star(80, 720, 26, '#ffe66d'); star(700, 330, 22, '#fff');
  return cv.toDataURL('image/png');
});
const iconBuf = Buffer.from(iconPng.split(',')[1], 'base64');
// Apple rejects icons with an alpha channel: flatten + drop it.
const icon = await sharp(iconBuf).flatten({ background: '#7f8cff' }).removeAlpha().png().toBuffer();
fs.writeFileSync(path.join(root, 'assets/icon-only.png'), icon);
for (const n of [180, 192, 512]) fs.writeFileSync(path.join(root, `assets/web/icon-${n}.png`), await sharp(icon).resize(n, n).png().toBuffer());
console.log('icon ok', (await sharp(icon).metadata()).channels, 'channels');

// ---------------------------------------------------------------- splash
const sp = await browser.newPage({ viewport: { width: 1366, height: 1366 }, deviceScaleFactor: 2 });
await sp.setContent(`<!doctype html><style>@font-face{font-family:F;src:url(data:font/woff2;base64,${font});font-weight:700}
html,body{margin:0;width:1366px;height:1366px;background:radial-gradient(circle at 50% 42%,#4b33b0 0%,#2a1b78 45%,#1b1145 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:F;color:#fff}
.b{width:420px;height:420px;filter:drop-shadow(0 20px 30px rgba(0,0,0,.35))}
h1{font-size:150px;margin:30px 0 0;text-shadow:0 10px 0 #3b1d5e;-webkit-text-stroke:0}
.dots i{position:absolute;border-radius:50%;border:5px solid rgba(255,255,255,.35);background:rgba(255,255,255,.08)}
</style>
<div class=dots><i style="left:180px;top:220px;width:90px;height:90px"></i><i style="left:1120px;top:300px;width:60px;height:60px"></i><i style="left:1000px;top:980px;width:120px;height:120px"></i><i style="left:230px;top:1040px;width:50px;height:50px"></i></div>
<svg class=b viewBox="0 0 64 64" stroke="#3b1d5e" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><defs><radialGradient id="g" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#c9f4ff"/><stop offset="1" stop-color="#7fc8ff"/></radialGradient></defs><circle cx="32" cy="32" r="27" fill="url(#g)"/><ellipse cx="24" cy="18" rx="7" ry="4" fill="#fff" stroke="none" transform="rotate(-30 24 18)"/><ellipse cx="24" cy="33" rx="3.8" ry="5" fill="#3b1d5e" stroke="none"/><ellipse cx="41" cy="33" rx="3.8" ry="5" fill="#3b1d5e" stroke="none"/><circle cx="22.8" cy="31" r="1.4" fill="#fff" stroke="none"/><circle cx="39.8" cy="31" r="1.4" fill="#fff" stroke="none"/><ellipse cx="17.5" cy="40" rx="4" ry="2.6" fill="#ff8fc4" stroke="none" opacity=".7"/><ellipse cx="47.5" cy="40" rx="4" ry="2.6" fill="#ff8fc4" stroke="none" opacity=".7"/><path d="M27 42q5 5 10 0" fill="none" stroke-width="2.6"/></svg>
<h1>Tiny Tides</h1>`);
await sp.waitForTimeout(400);
const splash = await sp.screenshot({ type: 'png' });
fs.writeFileSync(path.join(root, 'assets/splash.png'), await sharp(splash).resize(2732, 2732).flatten({ background: '#1b1145' }).removeAlpha().png().toBuffer());
fs.writeFileSync(path.join(root, 'assets/splash-dark.png'), await sharp(splash).resize(2732, 2732).flatten({ background: '#1b1145' }).removeAlpha().png().toBuffer());
console.log('splash ok');
await browser.close();
