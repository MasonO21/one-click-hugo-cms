// App Store in-app purchase review screenshot: the Get Hot Dogs window (needs the dev server on :8123).
//   node tools/screenshots.mjs   → store/iap-review.jpg (1290×2796)
// The captioned store screenshots are made by tools/marketing/screens.mjs, the video ad by tools/marketing/ad.mjs.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:8123/?nosw');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(2500);
await page.evaluate(() => { document.getElementById('install-hint').hidden = true; const a = window.__app; a.toMenu('scr-title'); a.ui.show('scr-shop'); a.ui.openPacks(); });
await page.waitForTimeout(900);
await page.screenshot({ path: 'store/iap-review.jpg', type: 'jpeg', quality: 90 });
await browser.close();
console.log('store/iap-review.jpg');
