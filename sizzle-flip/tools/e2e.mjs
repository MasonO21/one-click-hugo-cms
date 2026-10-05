// End-to-end UI test: plays levels through the real UI with pointer drags following the solver routes.
// node tools/e2e.mjs [count=3] [startLevel=1]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const count = +(process.argv[2] || 3);
const startLevel = +(process.argv[3] || 1);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:8123/?nosw' + (startLevel > 1 ? '&debug' : ''));
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(1500);
const shot = (n) => page.screenshot({ path: `/tmp/claude-0/shots/e2e-${n}.png` });
if (startLevel === 1) {
  await page.click('[data-act=play]', { force: true }); await page.waitForTimeout(700);
  await page.click('.world-card', { force: true }); await page.waitForTimeout(700);
  await page.click('.lvl', { force: true });
} else {
  await page.evaluate((i) => window.__app.startLevel(i), startLevel - 1);
}
let results = [];
for (let n = 0; n < count; n++) {
  await page.waitForFunction(() => window.__app.game && window.__app.game.phase === 'play', null, { timeout: 10000 });
  const info = await page.evaluate(() => ({ idx: window.__app.game.info.index, sol: window.__app.game.level.solution, par: window.__app.game.info.par, maxDrag: window.__app.maxDrag() }));
  let won = false;
  for (let attempt = 0; attempt < 3 && !won; attempt++) {
    for (const [a, p, delay] of info.sol) {
      await page.waitForFunction(() => { const g = window.__app.game; return g.phase !== 'play' || g.sim.canLaunch(); }, null, { timeout: 15000 });
      if (await page.evaluate(() => window.__app.game.phase !== 'play')) break;
      if (delay) await page.waitForTimeout(delay * 1000);
      const len = 14 + p * (info.maxDrag - 14) + 0.5;
      const sx = 195, sy = 420;
      const ex = sx - Math.cos(a) * len, ey = sy - Math.sin(a) * len;
      await page.mouse.move(sx, sy); await page.mouse.down();
      for (let k = 1; k <= 6; k++) await page.mouse.move(sx + (ex - sx) * k / 6, sy + (ey - sy) * k / 6);
      await page.mouse.up();
      await page.waitForTimeout(300);
    }
    try {
      await page.waitForFunction(() => !document.getElementById('scr-win').hidden || window.__app.game.phase === 'fail', null, { timeout: 12000 });
    } catch (e) { /* timed out */ }
    won = await page.evaluate(() => !document.getElementById('scr-win').hidden);
    if (!won) { await page.evaluate(() => window.__app.restartLevel()); await page.waitForTimeout(400); }
  }
  await page.waitForTimeout(1200);
  await shot(info.idx + 1);
  const flips = await page.evaluate(() => window.__app.game.flips);
  results.push(`#${info.idx + 1} ${won ? 'WON' : 'FAILED'} flips=${flips} par=${info.par}`);
  if (!won) break;
  await page.click('[data-act=next]', { force: true });
  await page.waitForTimeout(600);
  if (!(await page.evaluate(() => document.getElementById('scr-worlddone').hidden))) { await shot('worlddone'); await page.click('[data-act=wd-continue]', { force: true }); }
}
console.log(results.join('\n'));
console.log('save:', await page.evaluate(() => localStorage.getItem('sizzleflip.save.v1')));
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
