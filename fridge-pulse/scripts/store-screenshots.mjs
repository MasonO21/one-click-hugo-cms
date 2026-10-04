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
  { id: 'lookup', title: 'Not sure what it is?', sub: 'It searches the web and shows you a picture to confirm' },
  { id: 'receipt', title: 'Back from the shops?', sub: 'Scan the receipt. Each food goes on the right shelf' },
  { id: 'meals', title: 'Cook what needs using up', sub: 'Meal ideas built around your soonest dates' },
  { id: 'nutrition', title: 'Calories and macros', sub: 'For your food and every meal idea' },
  { id: 'log', title: 'Hit your protein', sub: 'Meals you cook log themselves' },
  { id: 'paywall', title: 'Try free for 2 weeks', sub: 'Then $59.99 a year or $9.99 a month' },
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
  // The unfamiliar sample item is looked up; capture the "Is this your item?" card.
  await page.locator('[data-testid="lookup-found"]').waitFor({ timeout: 20000 });
  await page.evaluate(() => [...document.querySelectorAll('[data-testid="lookup-found"]')].pop()?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(700);
  await grab('lookup');
  await page.locator('[data-testid="lookup-yes"]').last().tap();
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await tap('[data-testid="save-items"]');
  await page.locator('[data-testid="hero-headline"]').waitFor();
  await grab('pulse');
  // A sample receipt, put away with the rest.
  await tap('[data-testid="receipt-cta"]');
  await tap('[data-testid="sample-scan"]');
  await page.locator('[data-testid="receipt-places"]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(700);
  await grab('receipt');
  await tap('[data-testid="save-items"]');
  await page.locator('[data-testid="hero-headline"]').waitFor();
  // A protein goal from body weight, for the food log shot.
  await tap('[data-testid="tab-settings"]');
  await tap('[data-testid="settings-goals"]');
  await page.locator('[data-testid="goal-weight"]').last().fill('80');
  await page.waitForTimeout(300);
  await page.locator('[aria-label="Close"]').last().tap();
  await page.waitForTimeout(500);
  await tap('[data-testid="tab-meals"]');
  await page.waitForTimeout(1200);
  await grab('meals');
  await tap('[data-testid="tab-inventory"]');
  // Other tabs stay rendered underneath: tap the row on the Items tab, the one actually on top.
  const row = await page.evaluate(() => {
    for (const e of document.querySelectorAll('[aria-label^="Chicken thighs,"]')) {
      const r = e.getBoundingClientRect();
      if (!r.width || r.top > innerHeight) continue;
      const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (t && e.contains(t)) return [r.x + r.width / 2, r.y + r.height / 2];
    }
    return null;
  });
  if (!row) throw new Error('Chicken thighs row not found on the Items tab');
  await page.touchscreen.tap(row[0], row[1]);
  await page.locator('[data-testid="item-macros"]').waitFor();
  await page.evaluate(() => document.querySelector('[data-testid="nutrition"]')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(900);
  await grab('nutrition');
  await page.locator('[aria-label="Close"]').last().tap();
  await page.waitForTimeout(500);
  // Cook the top idea, which logs a serving, then open the food log.
  await tap('[data-testid="tab-meals"]');
  await page.waitForTimeout(800);
  await page.locator('[data-testid^="cooked-"]').first().scrollIntoViewIfNeeded();
  await page.locator('[data-testid^="cooked-"]').first().tap();
  await page.waitForTimeout(400);
  await tap('[data-testid="dialog-confirm"]');
  await page.waitForTimeout(600);
  await tap('[data-testid="tab-index"]');
  await page.locator('[data-testid="today-open-log"]').first().tap();
  await page.locator('[data-testid="log-totals"]').waitFor();
  await page.waitForTimeout(900);
  await grab('log');
  await ctx.close();
  return raw;
}

/** The brand fonts and the neon backdrop shared by the screenshot frames and the feature graphic. */
const fontFace = (family, file) =>
  `@font-face{font-family:"${family}";src:url(data:font/ttf;base64,${fs.readFileSync(path.join(root, 'node_modules/@expo-google-fonts', file)).toString('base64')}) format("truetype")}`;
const BRAND_CSS = [
  fontFace('Montserrat XB', 'montserrat/800ExtraBold/Montserrat_800ExtraBold.ttf'),
  fontFace('Open Sans', 'open-sans/400Regular/OpenSans_400Regular.ttf'),
  '.bg{position:absolute;inset:0;background:radial-gradient(70% 45% at 10% 0%,rgba(0,127,255,.45) 0%,rgba(0,127,255,0) 70%),radial-gradient(70% 45% at 100% 100%,rgba(255,0,127,.38) 0%,rgba(255,0,127,0) 70%),radial-gradient(50% 30% at 100% 35%,rgba(255,95,0,.18) 0%,rgba(255,95,0,0) 70%),#070B16}',
].join('');
/** A neon heartbeat trace across the backdrop, `y` from the top. */
const pulseLine = (w, y, scale) =>
  `<svg style="position:absolute;left:0;top:${y}px;opacity:.55" width="${w}" height="${48 * scale}" viewBox="0 0 ${w / scale} 48"><defs><linearGradient id="ecg" x1="0" x2="1"><stop offset="0" stop-color="#007FFF"/><stop offset=".5" stop-color="#FF007F"/><stop offset="1" stop-color="#007FFF"/></linearGradient></defs><path d="M0 30 ${Array.from({ length: Math.ceil(w / scale / 120) + 1 }, () => 'h40 l4 -3 l4 3 l6 2 l4 -18 l4 24 l4 -8 l8 -5 l8 5 h38').join(' ')}" fill="none" stroke="url(#ecg)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/></svg>`;

function frameHtml(target, shot, png) {
  const { w, h } = target.canvas;
  const s = w / 1290;
  return `<!doctype html><meta charset="utf-8"><style>${BRAND_CSS}
    html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
    h1{position:absolute;left:${Math.round(w * 0.075)}px;right:${Math.round(w * 0.075)}px;top:${Math.round(target.phoneTop * 0.2)}px;margin:0;color:#fff;font-family:"Montserrat XB";font-size:${target.title}px;line-height:1.08;letter-spacing:-1px;text-wrap:balance;text-shadow:0 0 ${Math.round(28 * s)}px rgba(0,127,255,.55)}
    p{position:absolute;left:${Math.round(w * 0.075)}px;right:${Math.round(w * 0.075)}px;top:${Math.round(target.phoneTop * 0.2 + target.title * 2.35)}px;margin:0;color:rgba(243,246,255,.85);font-family:"Open Sans";font-size:${target.sub}px;line-height:1.3}
    img{position:absolute;left:${Math.round((w - target.phoneW) / 2)}px;top:${target.phoneTop}px;width:${target.phoneW}px;border-radius:${target.radius}px;outline:${Math.max(2, Math.round(3 * s))}px solid rgba(0,127,255,.7);box-shadow:0 0 ${Math.round(60 * s)}px rgba(0,127,255,.45),0 0 ${Math.round(140 * s)}px rgba(255,0,127,.25)}
  </style><div class="bg"></div>${pulseLine(w, target.phoneTop + Math.round((h - target.phoneTop) * 0.32), 2.6 * s)}<h1>${shot.title}</h1><p>${shot.sub}</p><img src="data:image/png;base64,${png.toString('base64')}">`;
}

for (const target of TARGETS) {
  const raw = await captureApp(target);
  const dir = path.join(outDir, 'screenshots', target.name);
  fs.mkdirSync(dir, { recursive: true });
  // Numbering shifts when a shot is added, so clear the previous set first.
  for (const f of fs.readdirSync(dir)) if (/^\d\d-[a-z-]+\.jpg$/.test(f)) fs.unlinkSync(path.join(dir, f));
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
await gfx.setContent(`<!doctype html><meta charset="utf-8"><style>${BRAND_CSS}
  html,body{margin:0;width:1024px;height:500px;overflow:hidden}
  img{position:absolute;left:84px;top:140px;width:220px;height:220px;border-radius:50px;box-shadow:0 0 50px rgba(0,127,255,.5),0 0 90px rgba(255,0,127,.3)}
  h1{position:absolute;left:350px;top:150px;margin:0;font-family:"Montserrat XB";font-size:86px;letter-spacing:-2px;white-space:nowrap}
  h1 .f{color:#3D9BFF;text-shadow:0 0 26px rgba(0,127,255,.8)} h1 .p{color:#FF2D95;text-shadow:0 0 26px rgba(255,0,127,.8)}
  p{position:absolute;left:354px;top:268px;margin:0;color:rgba(243,246,255,.9);font-family:"Open Sans";font-size:34px;width:620px;line-height:1.25}
</style><div class="bg"></div>${pulseLine(1024, 400, 1.6)}<img src="data:image/png;base64,${icon}"><h1><span class="f">Fridge</span> <span class="p">Pulse</span></h1><p>Your kitchen&rsquo;s vital sign. Use food before it expires.</p>`);
await gfx.waitForTimeout(200);
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
