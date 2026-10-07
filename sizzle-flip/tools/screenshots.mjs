// Store screenshots (needs the dev server on :8123):
//   node tools/screenshots.mjs ios   → store/ios/*.jpg   1290x2796 (App Store 6.9"/6.7" iPhone)
//   node tools/screenshots.mjs play  → store/play/*.jpg  1080x1920 (Google Play phone, 9:16 — Play allows at most 2:1)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const profile = process.argv[2] || 'ios';
const P = { ios: { w: 430, h: 932, sx: 215, sy: 520 }, play: { w: 360, h: 640, sx: 180, sy: 360 } }[profile];
const dir = `store/${profile}`;
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: P.w, height: P.h }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:8123/?nosw');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(2500);
// the store app has no "Add to Home Screen" tip
await page.evaluate(() => { document.getElementById('install-hint').hidden = true; });
const snap = (name) => page.screenshot({ path: `${dir}/${name}.jpg`, type: 'jpeg', quality: 90 });
await snap('screenshot-1-title');
const shots = [[3, 'kitchen'], [24, 'living'], [47, 'backyard'], [66, 'bathroom'], [107, 'toyroom'], [146, 'beach'], [165, 'space'], [189, 'heaven']];
let n = 2;
for (const [lvl, name] of shots) {
  await page.evaluate((i) => window.__app.startLevel(i), lvl);
  await page.waitForTimeout(2600);
  // mid-aim pose for a lively shot
  const sol = await page.evaluate(() => window.__app.game.level.solution[0]);
  const md = await page.evaluate(() => window.__app.maxDrag());
  const len = 14 + sol[1] * (md - 14);
  const sx = P.sx, sy = P.sy, ex = sx - Math.cos(sol[0]) * len, ey = sy - Math.sin(sol[0]) * len;
  await page.mouse.move(sx, sy); await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(sx + (ex - sx) * k / 8, sy + (ey - sy) * k / 8);
  await page.waitForTimeout(150);
  await snap(`screenshot-${n++}-${name}`);
  await page.mouse.up();
}
// the shop
await page.evaluate(() => { const a = window.__app; a.toMenu('scr-title'); a.ui.show('scr-shop'); });
await page.waitForTimeout(800);
await snap(`screenshot-${n++}-shop`);
// the Hot Dog packs (the in-app purchases): App Store review screenshot for every pack
if (profile === 'ios') {
  await page.evaluate(() => window.__app.ui.openPacks());
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'store/iap-review.jpg', type: 'jpeg', quality: 90 });
}
await browser.close();
console.log('done');
