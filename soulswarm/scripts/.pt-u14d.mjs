// Automated smoke playtest: boots the game headless and drives a bot through every major system.
// usage: npm run playtest            (starts its own dev server on :5199)
//        node scripts/playtest.mjs http://localhost:5173/   (use a running server)
import { execSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pw = require(execSync('npm root -g').toString().trim() + '/playwright');
let URL = process.argv[2];
let server = null;
if (!URL) {
  URL = 'http://localhost:5199/';
  server = spawn('npx', ['vite', '--port', '5199', '--strictPort'], { cwd: new globalThis.URL('..', import.meta.url).pathname, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(URL); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
}

// In-page bot: flees the horde, circle-strafes the boss, walks into good gates, picks the first card.
const BOT = `window.__bot = (secs, god) => {
  const app = window.__soulswarm, r = app.run;
  if (god && !r.__god) { r.__god = true; r.player.hurt = () => {}; }
  for (let i = 0; i < Math.round(secs * 30); i++) {
    if (app.run !== r || r.ended) break;
    const P = r.player; let fx = 0, fz = 0;
    r.enemies.query(P.x, P.z, 7, (e) => { if (e.type === 'boss') return; const dx = P.x - e.x, dz = P.z - e.z, d2 = dx * dx + dz * dz + 0.5; fx += dx / d2; fz += dz / d2; });
    const B = r.bossEnemy;
    if (B && B.active) { const dx = B.x - P.x, dz = B.z - P.z, d = Math.hypot(dx, dz) || 1, pull = d > 7.5 ? 1.2 : d < 5 ? -1.6 : 0; fx += dx / d * pull - dz / d * 0.8; fz += dz / d * pull + dx / d * 0.8; }
    if (r.gates.pair && !r.gates.pair.done) { const g = r.gates.pair.gates.find((G) => G.op.type === 'mul' || G.op.type === 'add'); if (g) { const dx = g.x - P.x, dz = g.z - P.z, l = Math.hypot(dx, dz); fx += dx / l * 1.5; fz += dz / l * 1.5; } }
    fx += Math.cos(r.time * 0.35) * 0.25; fz += Math.sin(r.time * 0.35) * 0.25;
    const l = Math.hypot(fx, fz) || 1;
    r.input.keys.clear(); r.input.tx = fx / l; r.input.tz = fz / l; r.input.moved = true;
    if (r.levelPending) { const c = document.querySelector('.lvl-back .card'); if (c) c.click(); }
    if (!r.levelPending && (r.levelQueue > 0 || r.chestQueue > 0)) r.showLevelUp();
    if (r.nova >= 1 && r.legion.count > 25) r.ui.wantsNova = true;
    if (r.paused && r.player.dead) { r.revive(false); document.querySelectorAll('.modal-back').forEach((n) => n.remove()); }
    r.update(1 / 30);
  }
  r.input.tx = r.input.tz = 0;
  return { t: Math.round(r.time), kills: r.counters.kills, legion: r.legion.count, peak: r.legion.peak, level: r.level, novas: r.counters.novas, gates: r.counters.gates, bossKills: r.bossKills, bossDead: r.bossDead, ended: r.ended };
};`;

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function session(fn) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_|net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.evaluate(BOT);
  // the suite runs on any day: a weekend Blood Moon (8 elites, a darker blood-red world) only where a test turns it on
  await page.evaluate(() => { const p = window.__soulswarm && window.__soulswarm.profile; if (p) p.flags.bloodMoon = 'off'; });
  try { await fn(page, errors); } catch (e) { errors.push('harness: ' + e.message); }
  await ctx.close();
  return errors;
}
let errs;
// 53. Update 14: the Fallen Court. Every other week (once Chapter 10 is cleared) the Boss Rush brings the act finales
//     instead of Act I's bosses, each at its chapter's scaling; same tries, milestones and rewards.
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const D = await import('/src/game/data.js'), eco = await import('/src/meta/economy.js'), app = window.__soulswarm, p = app.profile, out = {};
    const wait = (ms) => new Promise((r) => setTimeout(r, ms)), q = (sel) => document.querySelector(sel);
    p.flags.tutorialDone = true; p.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 }; p.flags.bloodMoon = 'off'; p.flags.bossRush = 'on';
    // the calendar: odd weeks bring the Fallen Court, but only to a player past Chapter 10
    const tue = (w) => Date.UTC(2026, 9, 6) + w * 7 * 864e5; // Tuesday 2026-10-06 and the weeks after
    p.chapter.unlocked = 11; delete p.flags.rushCourt;
    out.weeks = [0, 1, 2, 3].map((w) => eco.rushCourt(p, tue(w)));
    p.chapter.unlocked = 6; out.early = [0, 1, 2, 3].map((w) => eco.rushCourt(p, tue(w)));
    // a Fallen Court run: Morwenna first at Chapter 10's scaling, then Gorrath at Chapter 15's
    p.chapter.unlocked = 30; p.flags.rushCourt = 'fallen'; p.rush.tries = 0;
    out.state = { name: eco.rushState(p).name, bosses: eco.rushState(p).bosses.join() };
    app.startRun(1, { rush: true }); const r = app.run; r.player.hurt = () => {};
    out.run = { court: r.courtId, ch: r.chapter.id, boss: r.bossId, hud: q('.hud-timer small')?.textContent, intro: q('.ri-name')?.textContent };
    r.draftLeft = 0; r.draftPicks = 0; r.nextBossAt = r.time + 0.1; for (let i = 0; i < 30 && !r.bossSpawned; i++) r.update(1 / 30);
    out.run.first = r.boss.id; out.run.lvl = r.lvl;
    const e = r.bossEnemy; e.hp = 1; r.enemies.damage(e, 50); for (let i = 0; i < 10; i++) r.update(1 / 30);
    out.run.next = { kills: r.bossKills, ch: r.chapter.id, boss: r.bossId, wm: +r.stats.weaponMul.toFixed(2) };
    app.exitRun(); document.querySelectorAll('.modal-back').forEach((n) => n.remove());
    // the panel names the court and shows its five bosses
    const { openRush } = await import('/src/ui/meta/rush.js'); openRush({ app }); await wait(100);
    out.panel = { name: q('.mm-rush .br-head b')?.textContent, bosses: [...document.querySelectorAll('.mm-rush .br-boss b')].map((b) => b.textContent).join() };
    document.querySelectorAll('.modal-back').forEach((n) => n.remove());
    delete p.flags.rushCourt; p.flags.bossRush = 'off';
    return out;
  });
  check('fallen court: once Chapter 10 is cleared, the courts alternate week by week (the Hollow Court always before)',
    new Set(s.weeks).size === 2 && s.weeks[0] !== s.weeks[1] && s.weeks[0] === s.weeks[2] && s.weeks[1] === s.weeks[3] && s.early.join() === 'hollow,hollow,hollow,hollow', JSON.stringify({ w: s.weeks, e: s.early }));
  check('fallen court: the act finales back to back, each at its chapter (Morwenna at Chapter 10, then Gorrath at 15), named on the panel, the HUD and the intro',
    s.state.name === 'The Fallen Court' && s.state.bosses === 'morwenna,gorrath,mire,kaelthar,nihl' && s.run.court === 'fallen' && s.run.ch === 10 && s.run.first === 'morwenna' && s.run.lvl === 10
    && s.run.next.kills === 1 && s.run.next.ch === 15 && s.run.next.boss === 'gorrath' && s.run.next.wm > 1 && s.run.hud === 'The Fallen Court' && s.run.intro === 'The Fallen Court'
    && s.panel.name === 'The Fallen Court' && s.panel.bosses === 'Morwenna,Gorrath,Mother Mire,Kaelthar,Nihl', JSON.stringify(s));
});
check('update 14 fallen court: no runtime errors', !errs.length, errs[0] || '');

await browser.close();
if (server) server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
