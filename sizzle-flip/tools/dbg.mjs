import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', m => console.log('console', m.type(), m.text()));
page.on('pageerror', e => console.log('PAGEERROR', e.message, e.stack));
await page.goto('http://localhost:8123/tools/gallery.html?world=kitchen&debug=1');
await page.waitForTimeout(1500);
console.log(await page.evaluate(() => window.__done));
await browser.close();
