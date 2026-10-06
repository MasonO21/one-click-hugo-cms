// Plays every level through the real game in Chromium: the verified route is fed through the game's own
// pointer handlers (pointerDown/Move/Up) at the exact physics step the solver used, then the real UI is
// used to continue (NEXT, world-complete card, forced ads). Runs ranges in parallel pages.
// node tools/e2e-all.mjs [from=1] [to=200] [pages=4] [--items]      (needs the dev server on :8123)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const argv = process.argv.slice(2).filter(a => !a.startsWith('--'));
const from = +(argv[0] || 1), to = +(argv[1] || 200), pages = +(argv[2] || 4);
const ITEMS_MODE = process.argv.includes('--items'); // equip a different shop item on every level (cycles all 30)
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

// in-page driver: hooks the level's Sim.step so a shot fires exactly N steps after the sausage is ready,
// exactly as tools/solver.mjs replays a route
const DRIVER = () => {
  window.__drive = (game) => new Promise((resolve) => {
    const sol = game.level.solution, PH = window.__PHYS;
    let shot = 0, wait = -1, t0 = 0, done = false;
    const app = window.__app;
    const fire = (a, p) => {
      const len = 14 + p * (app.maxDrag() - 14);
      const sx = 195, sy = 420;
      game.pointerDown(sx, sy);
      game.pointerMove(sx - Math.cos(a) * len, sy - Math.sin(a) * len);
      game.pointerUp();
    };
    const tick = () => {
      const s = game.sim;
      if (done || game.phase !== 'play' || shot >= sol.length) return;
      if (wait < 0) {
        const ready = shot === 0 ? s.canLaunch() : (s.t - t0 > 0.15 && s.canLaunch());
        if (!ready) return;
        wait = Math.round((sol[shot][2] || 0) / PH.DT);
      } else wait--;
      if (wait === 0) {
        const flips = game.flips;
        fire(sol[shot][0], sol[shot][1]);
        if (game.flips !== flips + 1) { done = true; resolve({ ok: false, why: `shot ${shot + 1} not accepted by input` }); return; }
        t0 = s.t; shot++; wait = -1;
        if (shot >= sol.length) { done = true; resolve({ ok: true }); }
      }
    };
    const s = game.sim, step = s.step.bind(s);
    s.step = () => { step(); tick(); };
    tick();
  });
  // hook every level the moment it is created or restarted (sim time 0), like a player tapping to skip the intro
  const app = window.__app;
  const start = app.startLevel.bind(app), restart = app.restartLevel.bind(app);
  app.startLevel = (i, f) => { start(i, f); app.game.pointerDown(0, 0); window.__run = window.__drive(app.game); };
  app.restartLevel = () => { restart(); window.__run = window.__drive(app.game); };
};

async function run(range, k) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:8123/?nosw');
  await page.evaluate((u) => localStorage.setItem('sizzleflip.save.v1', JSON.stringify({ unlocked: u, seenTips: { x: 1 } })), range[0]);
  await page.reload(); await page.waitForTimeout(1500);
  await page.evaluate(async () => { const m = await import('/src/physics.js'); window.__PHYS = m.PHYS; });
  await page.evaluate(DRIVER);
  if (ITEMS_MODE) await page.evaluate(async () => {
    const { ITEMS } = await import('/src/art/items.js');
    const a = window.__app, start = a.startLevel;
    ITEMS.forEach(it => { a.save.owned[it.id] = { at: 1, source: 'test' }; });
    a.startLevel = (i, f) => { a.save.character = ITEMS[i % ITEMS.length].id; start(i, f); };
  });
  const res = [];
  let ads = 0, worldDone = 0;
  await page.evaluate((i) => window.__app.startLevel(i), range[0] - 1);
  for (let n = range[0]; n <= range[1]; n++) {
    const t0 = Date.now();
    let won = false, why = '', attempts = 0;
    while (!won && attempts < 3) {
      attempts++;
      const idx = await page.evaluate(() => window.__app.game.info.index);
      if (idx !== n - 1) { why = `expected level ${n}, game is on ${idx + 1}`; break; }
      const r = await page.evaluate(() => window.__run);
      if (!r.ok) { why = r.why; }
      try {
        await page.waitForFunction(() => !document.getElementById('scr-win').hidden || window.__app.game.phase === 'fail', null, { timeout: 20000, polling: 100 });
        won = await page.evaluate(() => !document.getElementById('scr-win').hidden);
        if (!won) why = 'route failed: ' + (await page.evaluate(() => window.__app.game.sim.failReason));
      } catch (e) { why = 'timeout waiting for win'; }
      if (!won) { await page.evaluate(() => { document.querySelector('#hud [data-act=restart]').click(); }); await page.waitForTimeout(200); }
    }
    if (ITEMS_MODE && won && n % 20 === 6) await page.screenshot({ path: `/tmp/claude-0/shots/all/item-L${n}.png` });
    const info = await page.evaluate(() => { const a = window.__app, g = a.game; return { item: a.shop.characterItem()?.id || 'sausage', flips: g.flips, par: g.info.par, stars: a.save.stars[g.info.index] || 0, unlocked: a.save.unlocked }; });
    res.push({ n, won, attempts, why: won ? '' : why, ...info, secs: ((Date.now() - t0) / 1000).toFixed(1) });
    if (!won) { console.log(`[p${k}] L${n} FAILED: ${why}`); await page.screenshot({ path: `/tmp/claude-0/shots/all/fail-${n}.png` }); await page.evaluate((i) => window.__app.startLevel(i), n); continue; }
    if (n % 20 === 0 || n === range[1]) console.log(`[p${k}] reached L${n} (${res.filter(r => r.won).length}/${res.length} won, ads ${ads}, worlds ${worldDone})`);
    // continue through the real UI
    await page.click('#scr-win [data-act=next]', { force: true });
    await page.waitForTimeout(300);
    if (await page.evaluate(() => !!document.querySelector('.adlayer'))) {
      ads++;
      await page.waitForFunction(() => !document.querySelector('.ad-close').disabled, null, { timeout: 8000 });
      await page.click('.ad-close');
      await page.waitForTimeout(300);
    }
    if (await page.evaluate(() => !document.getElementById('scr-worlddone').hidden)) {
      worldDone++;
      if (n === 200) { await page.screenshot({ path: '/tmp/claude-0/shots/all/final.png' }); }
      await page.click('[data-act=wd-continue]', { force: true });
      await page.waitForTimeout(300);
    }
    if (n === range[1]) break;
    try { await page.waitForFunction((i) => window.__app.game && !window.__app.game.attract && window.__app.game.info.index === i, n, { timeout: 5000 }); }
    catch (e) { res[res.length - 1].why = 'NEXT did not open the next level'; console.log(`[p${k}] after L${n}: NEXT did not open L${n + 1}`); await page.evaluate((i) => window.__app.startLevel(i), n); }
  }
  const end = await page.evaluate(() => ({ heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1, title: !document.getElementById('scr-title').hidden }));
  await page.close();
  return { res, errors, ads, worldDone, end };
}

const ranges = [];
const per = Math.ceil((to - from + 1) / pages);
for (let a = from; a <= to; a += per) ranges.push([a, Math.min(to, a + per - 1)]);
const t0 = Date.now();
const out = await Promise.all(ranges.map((r, k) => run(r, k)));
const all = out.flatMap(o => o.res);
const failed = all.filter(r => !r.won), retried = all.filter(r => r.won && r.attempts > 1);
console.log(`\nplayed ${all.length} levels in ${((Date.now() - t0) / 60000).toFixed(1)} min — won ${all.length - failed.length}, failed ${failed.length}, needed a retry ${retried.length}`);
for (const r of failed) console.log(`  FAIL L${r.n}: ${r.why}`);
for (const r of retried) console.log(`  retry L${r.n}: won on attempt ${r.attempts}`);
const noNext = all.filter(r => r.why === 'NEXT did not open the next level');
if (noNext.length) console.log('  NEXT problems:', noNext.map(r => r.n).join(','));
console.log(`stars: ${all.reduce((s, r) => s + r.stars, 0)} / ${all.length * 3}; over par: ${all.filter(r => r.won && r.flips > r.par).map(r => r.n).join(',') || 'none'}`);
if (ITEMS_MODE) { const used = new Set(all.map(r => r.item)); console.log(`characters used: ${used.size} different shop items (${[...used].slice(0, 6).join(', ')}, …)`); }
out.forEach((o, k) => console.log(`page ${k} ${ranges[k].join('-')}: forced ads ${o.ads}, world-complete cards ${o.worldDone}, heap ${o.end.heapMB} MB, ended on title ${o.end.title}`));
const errs = [...new Set(out.flatMap(o => o.errors))];
console.log(errs.length ? 'PAGE ERRORS:\n' + errs.join('\n') : 'no page errors');
await browser.close();
process.exit(failed.length || errs.length ? 1 : 0);
