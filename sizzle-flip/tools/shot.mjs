// Usage: node tools/shot.mjs <url-path> <out.png> [w] [h] [script-json]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const [,, path = '/', out = '/tmp/claude-0/shots/s.png', w = '390', h = '844', script = '[]'] = process.argv;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2, hasTouch: true, isMobile: +w < +h });
const logs = [];
page.on('console', m => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message + '\n' + e.stack));
await page.goto('http://localhost:8123' + path, { waitUntil: 'load' });
await page.waitForTimeout(1200);
for (const step of JSON.parse(script)) {
  if (step.wait) await page.waitForTimeout(step.wait);
  if (step.click) await page.click(step.click, { force: true });
  if (step.eval) { const r = await page.evaluate(step.eval); if (r !== undefined) logs.push('EVAL: ' + JSON.stringify(r)); }
  if (step.drag) {
    const [x1, y1, x2, y2, hold] = step.drag;
    await page.mouse.move(x1, y1); await page.mouse.down();
    for (let k = 1; k <= 10; k++) { await page.mouse.move(x1 + (x2 - x1) * k / 10, y1 + (y2 - y1) * k / 10); await page.waitForTimeout(16); }
    if (hold) { await page.screenshot({ path: out.replace('.png', '-aim.png') }); }
    await page.mouse.up();
  }
  if (step.shot) await page.screenshot({ path: step.shot });
}
await page.screenshot({ path: out, fullPage: !!process.env.FULL });
console.log(logs.join('\n'));
await browser.close();
