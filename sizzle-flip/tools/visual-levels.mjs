// Screenshots of every level through the real game, for a visual review: the opening view as the player first sees
// it (HUD and tip included), the whole level (the 👁 overview), a moment in mid-flight and the win. Notches and
// home bars are simulated through the safe-area variables. Uses a fake clock, so every run is identical.
// node tools/visual-levels.mjs --device max|se|ipad|ipadland [--from 1] [--to 200] [--pages 3] [--out dir] [--shots abcd]
// (shots: a opening view, b overview, c mid-flight, d win; c and d look the same on every screen, so other devices default to ab)
// (needs the dev server on :8123)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';

const DEVICES = {
  se: { width: 375, height: 667, dpr: 2, sat: 20, sab: 0 },         // iPhone SE
  max: { width: 440, height: 956, dpr: 2, sat: 62, sab: 34 },        // iPhone 17 Pro Max
  ipad: { width: 1032, height: 1376, dpr: 1, sat: 24, sab: 20 },     // iPad Pro 13" portrait
  ipadland: { width: 1376, height: 1032, dpr: 1, sat: 24, sab: 20 }, // … landscape
};
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const devName = opt('--device', 'max'), dev = DEVICES[devName];
const from = +opt('--from', 1), to = +opt('--to', 200), PAGES = +opt('--pages', 3);
const out = path.resolve(opt('--out', `/tmp/sizzle-visual/${devName}`));
fs.mkdirSync(out, { recursive: true });
const FRAME = 50;
const SHOTS = opt('--shots', devName === 'max' ? 'abcd' : 'ab');

const DRIVER = () => {
  const app = window.__app;
  window.__vis = { fired: [], err: null };
  window.__play = (i, restart) => {
    if (restart) app.restartLevel(); else app.startLevel(i);
    const game = app.game, sol = game.level.solution, PH = window.__PHYS;
    if (!restart) game.pointerDown(0, 0); // skip the intro, like a tap (a restart has none)
    const V = window.__vis = { fired: [], err: null };
    let shot = 0, wait = -1, t0 = 0;
    const fire = (a, p) => {
      const len = 14 + p * (app.maxDrag() - 14), sx = 195, sy = 420; // the same points as tools/e2e-all.mjs (bit-exact angles)
      game.pointerDown(sx, sy); game.pointerMove(sx - Math.cos(a) * len, sy - Math.sin(a) * len); game.pointerUp();
    };
    V.go = false; // the route starts once the opening screenshots are taken
    // exactly as tools/solver.mjs and tools/e2e-all.mjs: the readiness check also runs once before the first step
    const s = game.sim, step = s.step.bind(s);
    const tick = () => {
      if (!V.go || game.phase !== 'play' || shot >= sol.length) return;
      if (wait < 0) {
        if (!(shot === 0 ? s.canLaunch() : s.t - t0 > 0.15 && s.canLaunch())) return;
        wait = Math.round((sol[shot][2] || 0) / PH.DT);
      } else wait--;
      if (wait <= 0) {
        const f = game.flips;
        fire(sol[shot][0], sol[shot][1]);
        if (game.flips !== f + 1) V.err = `shot ${shot + 1} not accepted`;
        V.fired.push(game.t);
        t0 = s.t; shot++; wait = -1;
      }
    };
    s.step = () => { step(); tick(); };
    V.tick = tick;
  };
};

async function setup(browser) {
  const page = await browser.newPage({ viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: dev.dpr, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.clock.install({ time: new Date('2026-10-08T12:00:00Z') });
  await page.goto('http://localhost:8123/?nosw');
  await page.evaluate(() => localStorage.setItem('sizzleflip.save.v1', JSON.stringify({ unlocked: 200 })));
  await page.reload();
  await page.waitForFunction(() => window.__app && window.__app.ui, null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.clock.runFor(2500);
  await page.addStyleTag({ content: `:root { --sat: ${dev.sat}px !important; --sab: ${dev.sab}px !important; } #install-hint { display: none !important; }` });
  await page.evaluate(async () => { const m = await import('/src/physics.js'); window.__PHYS = m.PHYS; });
  await page.evaluate(DRIVER);
  return { page, errors };
}

const name = (i, tag) => path.join(out, `L${String(i + 1).padStart(3, '0')}-${tag}.png`);
const state = (page) => page.evaluate(() => ({ phase: window.__app.game.phase, fired: window.__vis.fired.length, err: window.__vis.err, n: window.__app.game.level.solution.length }));

async function level(page, i) {
  await page.evaluate((i) => window.__play(i), i);
  await page.clock.runFor(1300);
  await page.screenshot({ path: name(i, 'a-start') });
  await page.evaluate(() => window.__app.game.toggleOverview(true));
  await page.clock.runFor(1500);
  await page.screenshot({ path: name(i, 'b-overview') });
  await page.evaluate(() => window.__app.game.toggleOverview(false));
  if (!/[cd]/.test(SHOTS)) return null;
  // the route is timed from the start of the level (moving platforms): restart and play it from there
  await page.evaluate((i) => { window.__play(i, true); window.__vis.go = true; window.__vis.tick(); }, i);
  let st = await state(page);
  const mid = Math.floor((st.n - 1) / 2);
  let midShot = false, t = 0;
  while (t < 60000) {
    await page.clock.runFor(FRAME); t += FRAME;
    st = await state(page);
    if (st.err) return st.err;
    if (!midShot && st.fired > mid) {
      await page.clock.runFor(600);
      await page.screenshot({ path: name(i, 'c-mid') });
      midShot = true;
    }
    if (st.phase === 'win') break;
  }
  if (st.phase !== 'win') return `no win (phase ${st.phase}, ${st.fired}/${st.n} flips)`;
  await page.clock.runFor(1000);
  await page.screenshot({ path: name(i, 'd-win') });
  return null;
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ids = []; for (let i = from - 1; i < to; i++) ids.push(i);
const problems = [];
const t0 = Date.now();
await Promise.all([...Array(PAGES).keys()].map(async (k) => {
  const { page, errors } = await setup(browser);
  for (let j = k; j < ids.length; j += PAGES) {
    const i = ids[j];
    const n0 = errors.length;
    let why = null;
    try { why = await level(page, i); } catch (e) { why = 'crash: ' + e.message.split('\n')[0]; }
    if (why) problems.push(`level ${i + 1}: ${why}`);
    if (errors.length > n0) problems.push(`level ${i + 1}: page errors: ${[...new Set(errors.slice(n0))].join(' | ')}`);
    if ((j / PAGES) % 10 === 9) console.log(`[${devName} p${k}] level ${i + 1} done`);
  }
  await page.close();
}));
await browser.close();
console.log(`${devName}: ${ids.length} levels in ${((Date.now() - t0) / 60000).toFixed(1)} min → ${out}`);
for (const p of problems) console.log('  ✗ ' + p);
process.exit(problems.length ? 1 : 0);
