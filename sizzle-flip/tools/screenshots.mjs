// Store/marketing screenshots: node tools/screenshots.mjs  → store/screenshot-*.png (1290x2796, iPhone 6.7")
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
fs.mkdirSync('store', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:8123/?nosw&debug');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'store/screenshot-1-title.png' });
const shots = [[3, 'kitchen'], [24, 'living'], [47, 'backyard'], [107, 'toyroom'], [165, 'space'], [189, 'heaven']];
let n = 2;
for (const [lvl, name] of shots) {
  await page.evaluate((i) => window.__app.startLevel(i), lvl);
  await page.waitForTimeout(2600);
  // mid-aim pose for a lively shot
  const sol = await page.evaluate(() => window.__app.game.level.solution[0]);
  const md = await page.evaluate(() => window.__app.maxDrag());
  const len = 14 + sol[1] * (md - 14);
  const sx = 215, sy = 520, ex = sx - Math.cos(sol[0]) * len, ey = sy - Math.sin(sol[0]) * len;
  await page.mouse.move(sx, sy); await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(sx + (ex - sx) * k / 8, sy + (ey - sy) * k / 8);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `store/screenshot-${n++}-${name}.png` });
  await page.mouse.up();
}
await browser.close();
console.log('done');
