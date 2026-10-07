// Regression test: the game must never get stuck (camera parked at the top, no input, restart doing nothing)
// after a zero-size viewport (artifact panel opening/collapsing) or a frame timestamp from another clock.
// node tools/e2e-recover.mjs   (needs the dev server on :8123)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0, phase = '';
const errors = [];
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };

async function open(height = 844) {
  const page = await browser.newPage({ viewport: { width: 390, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && phase === 'E') errors.push('[caught] ' + m.text()); });
  await page.goto('http://localhost:8123/?nosw');
  await page.evaluate(() => localStorage.setItem('sizzleflip.save.v1', JSON.stringify({ unlocked: 30, seenTips: { a: 1 } })));
  await page.reload(); await page.waitForTimeout(1200);
  return page;
}
const state = (page) => page.evaluate(() => {
  const a = window.__app, g = a.game, [, cy] = g.sim.com();
  const [, vh, scale] = g.viewSize();
  return { phase: g.phase, camY: g.camY, zoom: g.zoom, phaseT: g.phaseT, flips: g.flips, screenY: (cy - g.camY) * scale + a.ch / 2, ch: a.ch };
});
async function healthy(page, label) {
  const s1 = await state(page);
  await page.waitForTimeout(500);
  const s2 = await state(page);
  check(Number.isFinite(s2.camY) && Number.isFinite(s2.zoom), `${label}: camera is valid`);
  check(s2.phaseT > s1.phaseT, `${label}: game loop still running`);
  check(s2.phase === 'play', `${label}: level is playable (intro finished)`);
  check(s2.screenY > 0 && s2.screenY < s2.ch, `${label}: sausage is on screen (y=${Math.round(s2.screenY)})`);
  // a real drag must launch the sausage
  await page.waitForFunction(() => window.__app.game.sim.canLaunch(), null, { timeout: 8000 }).catch(() => {});
  await page.mouse.move(195, 500); await page.mouse.down();
  for (let k = 1; k <= 6; k++) await page.mouse.move(195 - 8 * k, 500 + 18 * k);
  await page.mouse.up();
  await page.waitForTimeout(300);
  check((await state(page)).flips === s2.flips + 1, `${label}: a drag flips the sausage`);
}

// A — the view collapses to 0 height mid-level, then comes back
let page = await open();
await page.evaluate(() => window.__app.startLevel(12));
await page.waitForTimeout(2500);
await page.setViewportSize({ width: 390, height: 0 });
await page.waitForTimeout(400);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(800);
await healthy(page, 'A zero-size view mid-level');
await page.close();

// B — one frame timestamp from a different clock (far behind performance.now)
page = await open();
await page.evaluate(() => { const a = window.__app; a.startLevel(12); a.loop(a.last - 5e6); });
await page.waitForTimeout(2600);
await healthy(page, 'B backwards frame time');
await page.close();

// C — the page loads while the view is 0×0 (panel still opening), then a level starts once it has size
page = await browser.newPage({ viewport: { width: 390, height: 0 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://localhost:8123/?nosw');
await page.evaluate(() => localStorage.setItem('sizzleflip.save.v1', JSON.stringify({ unlocked: 30, seenTips: { a: 1 } })));
await page.reload(); await page.waitForTimeout(1200);
await page.evaluate(() => window.__app.startLevel(12));
await page.waitForTimeout(300);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(2500);
await healthy(page, 'C load while 0×0');
await page.close();

// D — restart recovers a camera that went bad (in overview, with a broken zoom)
page = await open();
await page.evaluate(() => window.__app.startLevel(12));
await page.waitForTimeout(2500);
await page.evaluate(() => { const g = window.__app.game; g.overview = true; g.camY = NaN; g.zoom = NaN; g.acc = -1e6; });
await page.click('[data-act=restart]', { force: true });
await page.waitForTimeout(1200);
await healthy(page, 'D restart after a broken camera');
await page.screenshot({ path: '/tmp/claude-0/shots/recover-d.png' });
await page.close();

phase = 'E'; // from here, errors the game loop caught and logged count as failures
// E — the title-screen demo restarting (it swaps in a new game mid-frame, which is drawn before its first update)
page = await open();
for (let k = 0; k < 3; k++) { await page.evaluate(() => { const g = window.__app.game; g.phase = 'win'; g.winT = 3; }); await page.waitForTimeout(400); }
const st = await page.evaluate(() => { const g = window.__app.game; return { attract: g.attract, finite: Number.isFinite(g.sim.com()[1]) && Number.isFinite(g.camY) }; });
check(st.attract && st.finite, 'E title demo restarts cleanly');
await page.close();

console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
