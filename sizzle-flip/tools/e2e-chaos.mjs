// Random play through the real game (rendering, effects, sound, HUD) on every level, with a fake clock: random
// flips through the touch handlers whenever the sausage can be flipped, plus random pauses, restarts and the 👁
// overview. Fails on any page error, a sausage position that is not a number, a failed attempt that never
// respawns, a sausage that cannot be flipped again for 15 s, or a HUD flip count that disagrees with the game.
// node tools/e2e-chaos.mjs [from=1] [to=200] [--pages 3] [--seconds 25]     (needs the dev server on :8123)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const from = +(pos[0] || 1), to = +(pos[1] || 200), PAGES = +opt('--pages', 3), SECONDS = +opt('--seconds', 25);
const FRAME = 50;

const PAGE = () => {
  let seed = 1;
  const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 100000) / 100000; };
  window.__chaos = {
    start(i) {
      seed = (i + 1) * 2654435761 >>> 0 || 1;
      const app = window.__app;
      app.startLevel(i);
      app.game.pointerDown(0, 0);
      this.t = 0; this.failT = 0; this.busyT = 0; this.flips = 0; this.problems = [];
    },
    // one frame of "player": returns problems found so far
    tick(dt) {
      const app = window.__app, g = app.game, s = g.sim, ui = app.ui;
      this.t += dt;
      const P = (m) => { if (!this.problems.includes(m)) this.problems.push(m); };
      for (let i = 0; i < s.px.length; i++) if (!Number.isFinite(s.px[i]) || !Number.isFinite(s.py[i])) { P('sausage position is not a number'); break; }
      if (!Number.isFinite(g.camX) || !Number.isFinite(g.camY) || !Number.isFinite(g.zoom)) P('camera is not a number');
      if (g.phase === 'fail') { this.failT += dt; if (this.failT > 9) P('a failed attempt did not respawn within 9 s'); } else this.failT = 0;
      if (g.phase === 'play' && !s.canLaunch()) { this.busyT += dt; if (this.busyT > 15) P('the sausage could not be flipped for 15 s'); } else this.busyT = 0;
      if (document.getElementById('hud-flips').textContent !== String(g.flips) && !document.getElementById('hud').hidden) P(`HUD shows ${document.getElementById('hud-flips').textContent} flips, the game counted ${g.flips}`);
      if (g.phase === 'win') return 'win';
      if (g.paused) { if (rand() < 0.3) ui.action('resume'); return; }
      const r = rand();
      if (r < 0.004) { ui.action('pause'); return; }
      if (r < 0.006) { ui.action('restart'); return; }
      if (r < 0.010) { ui.action('overview'); return; }
      if (g.overview && rand() < 0.2) { ui.action('overview'); return; }
      if (g.phase === 'play' && s.canLaunch() && rand() < 0.08) {
        const a = -Math.PI * rand(), p = rand(), len = 14 + p * (app.maxDrag() - 14), sx = innerWidth / 2, sy = innerHeight * 0.6;
        g.pointerDown(sx, sy); g.pointerMove(sx - Math.cos(a) * len * 0.5, sy - Math.sin(a) * len * 0.5); g.pointerMove(sx - Math.cos(a) * len, sy - Math.sin(a) * len); g.pointerUp();
        this.flips++;
      }
    },
  };
};

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const problems = [];
let flips = 0, wins = 0;
const t0 = Date.now();
const ids = []; for (let i = from - 1; i < to; i++) ids.push(i);
await Promise.all([...Array(PAGES).keys()].map(async (k) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.clock.install({ time: new Date('2026-10-08T12:00:00Z') });
  await page.goto('http://localhost:8123/?nosw');
  await page.evaluate(() => localStorage.setItem('sizzleflip.save.v1', JSON.stringify({ unlocked: 200, seenTips: { all: 1 } })));
  await page.reload();
  await page.waitForFunction(() => window.__app && window.__app.ui, null, { timeout: 15000 });
  await page.clock.runFor(2500);
  await page.evaluate(PAGE);
  for (let j = k; j < ids.length; j += PAGES) {
    const i = ids[j], n0 = errors.length;
    await page.evaluate((i) => window.__chaos.start(i), i);
    let res = null;
    for (let t = 0; t < SECONDS * 1000; t += FRAME) {
      await page.clock.runFor(FRAME);
      res = await page.evaluate((dt) => window.__chaos.tick(dt), FRAME / 1000);
      if (res === 'win') break;
    }
    const st = await page.evaluate(() => ({ p: window.__chaos.problems, f: window.__chaos.flips }));
    flips += st.f; if (res === 'win') wins++;
    for (const p of st.p) problems.push(`level ${i + 1}: ${p}`);
    if (errors.length > n0) problems.push(`level ${i + 1}: page errors: ${[...new Set(errors.slice(n0))].join(' | ')}`);
    await page.evaluate(() => { document.getElementById('scr-win').hidden = true; document.getElementById('scr-pause').hidden = true; window.__app.pause(false); });
    if ((j / PAGES) % 20 === 19) console.log(`[p${k}] level ${i + 1}`);
  }
  await page.close();
}));
await browser.close();
console.log(`chaos: ${ids.length} levels, ${flips} random flips, ${wins} lucky wins, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
for (const p of problems) console.log('  ✗ ' + p);
if (!problems.length) console.log('no problems found');
process.exit(problems.length ? 1 : 0);
