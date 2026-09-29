#!/usr/bin/env node
/**
 * Generates App Store and Google Play screenshots from the web preview.
 *
 *   SCREENSHOT_MODE=1 npm run preview:build     # preview without demo-only notes
 *   npm run store:screenshots                   # writes store/screenshots and store/graphics
 *
 * Needs a Chromium: set CHROMIUM_PATH, or run `npx playwright install chromium`.
 * Screenshots come from the web build, so fonts differ slightly from a real phone. Capture on a
 * device or simulator instead if you want pixel-exact native rendering.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const preview = path.join(root, 'preview');
const outDir = path.join(root, 'store');
if (!fs.existsSync(path.join(preview, 'index.html'))) throw new Error('Run SCREENSHOT_MODE=1 npm run preview:build first.');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };
const server = http
  .createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(preview, url);
    if (url !== '/' && file.startsWith(preview) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
      return fs.createReadStream(file).pipe(res);
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>body{margin:0}</style></head><body>${fs.readFileSync(path.join(preview, 'index.html'), 'utf8')}</body></html>`);
  })
  .listen(0);
const base = `http://localhost:${server.address().port}/`;

const SHOTS = [
  { id: 'pulse', title: 'Know what to eat first', sub: 'See what is about to expire, at a glance' },
  { id: 'review', title: 'Snap a photo. Get your list.', sub: 'Fridge Pulse spots the food and reads dates' },
  { id: 'items', title: 'Everything in one place', sub: 'Fridge, freezer and pantry, sorted by date' },
  { id: 'meals', title: 'Cook what needs using up', sub: 'Meal ideas built around your soonest dates' },
  { id: 'item', title: 'Stay in control', sub: 'Edit dates and quantities, mark items used' },
  { id: 'paywall', title: 'Try free for 2 weeks', sub: 'Then $9.99 per month. Cancel anytime.' },
];

const TARGETS = [
  { name: 'ios-6.9in', viewport: { width: 430, height: 932 }, canvas: { w: 1290, h: 2796 }, phoneW: 1050, phoneTop: 560, title: 96, sub: 46, radius: 64 },
  { name: 'android-phone', viewport: { width: 360, height: 640 }, canvas: { w: 1080, h: 1920 }, phoneW: 860, phoneTop: 400, title: 80, sub: 40, radius: 52 },
];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

async function captureApp(target) {
  const ctx = await browser.newContext({ viewport: target.viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'light' });
  const page = await ctx.newPage();
  const raw = {};
  const tap = async (sel) => { await page.locator(sel).first().tap(); await page.waitForTimeout(400); };
  const grab = async (id) => { await page.waitForTimeout(500); raw[id] = await page.screenshot({ type: 'png' }); };

  await page.goto(base);
  await page.locator('[data-testid="onboarding-next"]').waitFor({ timeout: 30000 });
  for (let i = 0; i < 3; i++) await tap('[data-testid="onboarding-next"]');
  await page.locator('[data-testid="paywall-cta"]').waitFor();
  await grab('paywall');
  await tap('[data-testid="paywall-cta"]');
  await tap('[data-testid="scan-cta"]');
  await tap('[data-testid="sample-scan"]');
  await page.locator('[data-testid="save-items"]').waitFor({ timeout: 20000 });
  await grab('review');
  await tap('[data-testid="save-items"]');
  await page.locator('[data-testid="hero-headline"]').waitFor();
  await grab('pulse');
  await tap('[data-testid="tab-inventory"]');
  await grab('items');
  await tap('[data-testid="tab-meals"]');
  await page.waitForTimeout(1200);
  await grab('meals');
  await tap('[data-testid="tab-inventory"]');
  await page.locator('[data-testid^="item-"]').last().tap();
  await grab('item');
  await ctx.close();
  return raw;
}

function frameHtml(target, shot, png) {
  const { w, h } = target.canvas;
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;font-family:"Helvetica Neue",Arial,"Liberation Sans",sans-serif}
    .bg{position:absolute;inset:0;background:radial-gradient(120% 60% at 20% 0%,#2f9a5c 0%,rgba(47,154,92,0) 60%),linear-gradient(165deg,#12382a 0%,#137a3b 100%)}
    h1{position:absolute;left:${Math.round(w * 0.075)}px;right:${Math.round(w * 0.075)}px;top:${Math.round(target.phoneTop * 0.2)}px;margin:0;color:#fff;font-size:${target.title}px;line-height:1.05;font-weight:800;letter-spacing:-2px;text-wrap:balance}
    p{position:absolute;left:${Math.round(w * 0.075)}px;right:${Math.round(w * 0.075)}px;top:${Math.round(target.phoneTop * 0.2 + target.title * 2.3)}px;margin:0;color:rgba(255,255,255,.88);font-size:${target.sub}px;line-height:1.3;font-weight:500}
    img{position:absolute;left:${Math.round((w - target.phoneW) / 2)}px;top:${target.phoneTop}px;width:${target.phoneW}px;border-radius:${target.radius}px;box-shadow:0 30px 80px rgba(0,0,0,.35)}
  </style><div class="bg"></div><h1>${shot.title}</h1><p>${shot.sub}</p><img src="data:image/png;base64,${png.toString('base64')}">`;
}

for (const target of TARGETS) {
  const raw = await captureApp(target);
  const dir = path.join(outDir, 'screenshots', target.name);
  fs.mkdirSync(dir, { recursive: true });
  const page = await (await browser.newContext({ viewport: { width: target.canvas.w, height: target.canvas.h }, deviceScaleFactor: 1 })).newPage();
  let n = 0;
  for (const shot of SHOTS) {
    n += 1;
    await page.setContent(frameHtml(target, shot, raw[shot.id]));
    await page.waitForTimeout(150);
    // JPEG: no alpha channel, which the stores prefer, and smaller files.
    await page.screenshot({ path: path.join(dir, `${String(n).padStart(2, '0')}-${shot.id}.jpg`), type: 'jpeg', quality: 92 });
  }
  if (target.name === 'ios-6.9in') {
    // The plain paywall capture, for the App Store subscription review screenshot.
    fs.writeFileSync(path.join(outDir, 'screenshots', 'subscription-review-paywall.png'), raw.paywall);
  }
}

// Play feature graphic (1024x500) and 512px icon.
const gfx = await (await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 })).newPage();
const icon = fs.readFileSync(path.join(root, 'assets/icon.png')).toString('base64');
await gfx.setContent(`<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:1024px;height:500px;overflow:hidden;font-family:"Helvetica Neue",Arial,"Liberation Sans",sans-serif}
  .bg{position:absolute;inset:0;background:radial-gradient(90% 120% at 15% 0%,#2f9a5c 0%,rgba(47,154,92,0) 60%),linear-gradient(165deg,#12382a,#137a3b)}
  img{position:absolute;left:84px;top:150px;width:200px;height:200px;border-radius:46px;box-shadow:0 18px 50px rgba(0,0,0,.35)}
  h1{position:absolute;left:330px;top:150px;margin:0;color:#fff;font-size:84px;font-weight:800;letter-spacing:-2px}
  p{position:absolute;left:334px;top:262px;margin:0;color:rgba(255,255,255,.9);font-size:34px;font-weight:500;width:640px;line-height:1.25}
</style><div class="bg"></div><img src="data:image/png;base64,${icon}"><h1>Fridge Pulse</h1><p>Snap your fridge. Use food before it expires.</p>`);
fs.mkdirSync(path.join(outDir, 'graphics'), { recursive: true });
await gfx.screenshot({ path: path.join(outDir, 'graphics', 'play-feature-graphic-1024x500.jpg'), type: 'jpeg', quality: 92 });
fs.copyFileSync(path.join(root, 'assets/icon.png'), path.join(outDir, 'graphics', 'app-store-icon-1024.png'));
const svg = fs.readFileSync(path.join(root, 'assets/source/icon.svg'), 'utf8');
const ic = await (await browser.newContext({ viewport: { width: 512, height: 512 } })).newPage();
await ic.setContent(`<body style="margin:0">${svg.replace('<svg ', '<svg style="width:512px;height:512px;display:block" ')}</body>`);
await ic.screenshot({ path: path.join(outDir, 'graphics', 'play-icon-512.png') });

await browser.close();
server.close();
console.log('Store screenshots and graphics written to store/');
