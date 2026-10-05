// Generates store art from the live game: app icon (1024), splash (2732) and
// App Store screenshots (1290×2796, iPhone 6.7"). Requires the dev server: `npm run dev`.
// usage: node scripts/make-icons.mjs [http://localhost:5173/]
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pw = require(execSync('npm root -g').toString().trim() + '/playwright');
const URL = process.argv[2] || 'http://localhost:5173/';
const OUT = new globalThis.URL('../resources/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// Draws the icon / splash composition in a 2D canvas around a high-res hero render.
const compose = async (page, size, heroId, color, splash) => page.evaluate(async ({ size, heroId, color, splash }) => {
  const app = window.__soulswarm;
  const url = app.engine.heroPortrait(heroId, app.profile, 4);
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const S = size / 1024;
  const bg = g.createRadialGradient(size / 2, size * 0.46, 10 * S, size / 2, size / 2, size * 0.72);
  bg.addColorStop(0, '#0f4a5c'); bg.addColorStop(0.45, '#081a2a'); bg.addColorStop(1, '#030409');
  g.fillStyle = bg; g.fillRect(0, 0, size, size);
  // horde eyes in the dark
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.shadowColor = '#ff5a2e'; g.shadowBlur = 14 * S; g.fillStyle = '#ffb07a';
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2, r = (0.4 + rnd() * 0.12) * size;
    const x = size / 2 + Math.cos(a) * r, y = size * 0.55 + Math.sin(a) * r * 0.8;
    g.beginPath(); g.arc(x - 7 * S, y, 3.6 * S, 0, 7); g.arc(x + 7 * S, y, 3.6 * S, 0, 7); g.fill();
  }
  // rune circle
  const cx = size / 2, cy = size * 0.74;
  g.save(); g.translate(cx, cy); g.scale(1, 0.38);
  g.shadowColor = color; g.shadowBlur = 30 * S; g.strokeStyle = color; g.lineWidth = 7 * S;
  for (const r of [0.36, 0.3]) { g.beginPath(); g.arc(0, 0, r * size, 0, 7); g.stroke(); }
  g.lineWidth = 5 * S; g.beginPath();
  for (let k = 0; k < 2; k++) for (let i = 0; i <= 3; i++) { const a = (i / 3) * Math.PI * 2 + k * Math.PI / 3 - Math.PI / 2; const x = Math.cos(a) * 0.29 * size, y = Math.sin(a) * 0.29 * size; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
  g.stroke(); g.restore();
  // light column
  const col = g.createRadialGradient(cx, size * 0.55, 0, cx, size * 0.55, size * 0.42);
  col.addColorStop(0, color + 'aa'); col.addColorStop(1, color + '00');
  g.globalCompositeOperation = 'lighter'; g.fillStyle = col; g.fillRect(0, 0, size, size); g.globalCompositeOperation = 'source-over';
  // hero
  const h = size * (splash ? 0.5 : 0.84), w = h * (img.width / img.height);
  g.shadowBlur = 0;
  g.drawImage(img, cx - w / 2, cy - h * 0.94, w, h);
  // the legion: orbiting wisps
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2, r = (0.2 + rnd() * 0.26) * size;
    const x = cx + Math.cos(a) * r, y = size * 0.52 + Math.sin(a) * r * 0.55 - rnd() * 0.12 * size;
    const rr = (6 + rnd() * 12) * S;
    if (Math.abs(x - cx) < 0.2 * size && y > 0.1 * size && y < 0.8 * size) continue; // keep the hero readable
    const wg = g.createRadialGradient(x, y, 0, x, y, rr * 3);
    wg.addColorStop(0, '#ffffff'); wg.addColorStop(0.25, color); wg.addColorStop(1, color + '00');
    g.fillStyle = wg; g.beginPath(); g.arc(x, y, rr * 3, 0, 7); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  if (splash) {
    g.textAlign = 'center';
    g.font = `900 ${150 * S}px Cinzel, serif`;
    g.shadowColor = color; g.shadowBlur = 40 * S; g.fillStyle = '#e6fdff';
    g.fillText('SOULSWARM', cx, size * 0.2);
    g.shadowBlur = 0; g.font = `700 ${40 * S}px Cinzel, serif`; g.fillStyle = '#9fb2cc';
    g.fillText('RAISE THE LEGION', cx, size * 0.26);
  }
  // vignette
  const v = g.createRadialGradient(cx, size / 2, size * 0.35, cx, size / 2, size * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.7)');
  g.fillStyle = v; g.fillRect(0, 0, size, size);
  return c.toDataURL('image/png').split(',')[1];
}, { size, heroId, color, splash });

const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
await page.goto(URL);
await page.waitForTimeout(3000);
writeFileSync(OUT + 'icon.png', Buffer.from(await compose(page, 1024, 'vael', '#4ef2ff', false), 'base64'));
// Splash: flat background + logo only, so the dozens of generated native sizes stay small.
const splash = await page.evaluate(() => {
  const size = 2732, c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#05060b'; g.fillRect(0, 0, size, size);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 210px Cinzel, serif';
  g.shadowColor = '#4ef2ff'; g.shadowBlur = 60; g.fillStyle = '#e6fdff';
  g.fillText('SOULSWARM', size / 2, size / 2 - 40);
  g.shadowBlur = 0; g.font = '700 60px Cinzel, serif'; g.fillStyle = '#7fa6c0';
  g.fillText('RAISE THE LEGION', size / 2, size / 2 + 130);
  return c.toDataURL('image/png').split(',')[1];
});
writeFileSync(OUT + 'splash.png', Buffer.from(splash, 'base64'));
console.log('wrote', OUT + 'icon.png', OUT + 'splash.png');
await browser.close();
