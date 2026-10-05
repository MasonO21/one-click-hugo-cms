// node tools/canvas-dump.mjs <url-path> <canvasId> <out.png>
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const [,, path, id, out] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message, e.stack));
page.on('console', m => { if (m.type() === 'error') console.log('console', m.text()); });
await page.goto('http://localhost:8123' + path);
await page.waitForFunction(() => window.__done, null, { timeout: 15000 });
const data = await page.evaluate((id) => document.getElementById(id).toDataURL('image/png'), id);
fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
await browser.close();
