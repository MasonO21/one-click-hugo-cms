// Rough perf probe: frame times with 4x CPU throttling. node tools/perf.mjs <level>
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const lvl = process.argv[2] || '1';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
const cdp = await page.context().newCDPSession(page);
await page.goto(`http://localhost:8123/?nosw&level=${lvl}`);
await page.waitForTimeout(2500);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const r = await page.evaluate(() => new Promise(res => {
  const app = window.__app; const g = app.game;
  // launch a flip so physics + fx are active
  g.phase = 'play'; g.launch(500, -1300, 0.8);
  const times = []; let last = performance.now();
  const f = (t) => { times.push(t - last); last = t; if (times.length < 180) requestAnimationFrame(f); else res(times); };
  requestAnimationFrame(f);
}));
r.sort((a, b) => a - b);
console.log('frames', r.length, 'median', r[90].toFixed(1), 'p90', r[162].toFixed(1), 'max', r[179].toFixed(1));
await browser.close();
