// Screenshot helper for visual checks (dev/QA).
// Usage: node scripts/shot.mjs <url> <out.png> [waitMs=4000] [width=1280] [height=720] [js-to-eval-before-shot]
import { chromium } from 'playwright';
import fs from 'node:fs';

const [url, out, waitMs = '4000', width = '1280', height = '720', evalJs] = process.argv.slice(2);
const candidates = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium',
].filter(Boolean);
const executablePath = candidates.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
const browser = await chromium.launch({
  executablePath,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: +width, height: +height }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(+waitMs);
if (evalJs) {
  const r = await page.evaluate(evalJs);
  if (r !== undefined) console.log('eval:', JSON.stringify(r));
  await page.waitForTimeout(800);
}
await page.screenshot({ path: out });
console.log(logs.filter((l) => !l.includes('GPU stall')).slice(-40).join('\n'));
await browser.close();
