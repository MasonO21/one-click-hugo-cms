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
// 51. Update 14: the Endless Abyss rotates through the later acts' realms too (after Act I's twists: the Drowned Coast,
//     the Thornwood, the Plague Fens, the Storm Spire and the Hollow Moon, with their hazards and foes) and brings all ten
//     bosses back in turn.
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const D = await import('/src/game/data.js'), app = window.__soulswarm, p = app.profile, out = {};
    p.flags.tutorialDone = true; p.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 }; p.flags.bloodMoon = 'off'; p.chapter.unlocked = 6; p.energy = 30;
    app.startRun(100); const r = app.run; r.player.hurt = () => {};
    const depth = (k) => { r.bossKills = k; r.bossSpawned = false; r.director(0); r.time = 200;
      const n = {}; for (let i = 0; i < 3000; i++) { const t = r.pickType(); n[t] = (n[t] || 0) + 1; }
      return { tide: !!r.mods.tide, brambles: !!r.mods.brambles, miasma: !!r.mods.miasma, lightning: !!r.mods.lightning, gravity: !!r.mods.gravity, boss: D.bossFor(r.chapter, k),
        foes: ['siren', 'thornback', 'rat', 'caller', 'stalker'].filter((t) => n[t]).join('+') }; };
    out.d = [4, 5, 6, 7, 8, 9].map(depth);
    app.exitRun();
    return out;
  });
  const d = s.d;
  check('endless: after Act I\'s twists the Abyss shifts through each later realm (its hazard and foe), with the act finales as its bosses; then it cycles',
    d[0].tide && d[0].foes === 'siren' && d[0].boss === 'vesperine' && d[1].brambles && d[1].foes === 'thornback' && d[1].boss === 'morwenna' && d[2].miasma && d[2].foes === 'rat' && d[2].boss === 'gorrath'
    && d[3].lightning && d[3].foes === 'caller' && d[3].boss === 'mire' && d[4].gravity && d[4].foes === 'stalker' && d[4].boss === 'kaelthar' && !d[5].tide && !d[5].gravity && !d[5].foes && d[5].boss === 'nihl', JSON.stringify(d));
});
check('update 14 endless: no runtime errors', !errs.length, errs[0] || '');

await browser.close();
if (server) server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
