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
    if (!r.levelPending && r.levelQueue > 0) r.showLevelUp();
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
  try { await fn(page, errors); } catch (e) { errors.push('harness: ' + e.message); }
  await ctx.close();
  return errors;
}

// 1. Boot + menu
let errs = await session(async (page) => {
  const ok = await page.evaluate(() => !!document.querySelector('.btn-battle') && !!window.__soulswarm.engine);
  check('boots to the home screen', ok);
});
check('no errors on boot', !errs.length, errs[0] || '');

// 2. Every hero survives a minute and grows a legion
for (const hero of ['vael', 'nyx', 'seraphine', 'mordrake']) {
  errs = await session(async (page) => {
    const s = await page.evaluate((h) => {
      const p = window.__soulswarm.profile; p.heroes[h].owned = true; p.heroes[h].stars = 1; p.selectedHero = h;
      window.__soulswarm.startRun(1); return window.__bot(60, false);
    }, hero);
    check(`${hero}: 60s run`, s.kills > 40 && s.peak > 5, JSON.stringify(s));
    const dup = await page.evaluate(() => { const a = window.__soulswarm.run.enemies.active; return a.length - new Set(a).size; });
    check(`${hero}: no duplicated pooled enemies`, dup === 0, `duplicates=${dup}`);
  });
  check(`${hero}: no runtime errors`, !errs.length, errs[0] || '');
}

// 3. Chapter 1 full clear: gates, nova, boss, victory, results, back to menu
errs = await session(async (page) => {
  await page.evaluate(() => window.__soulswarm.startRun(1));
  let s;
  for (let i = 0; i < 50; i++) { s = await page.evaluate(() => window.__bot(10, true)); if (s.bossDead || s.t > 560) break; }
  check('chapter 1: gates passed', s.gates >= 3, `gates=${s.gates}`);
  check('chapter 1: soul nova used', s.novas >= 2, `novas=${s.novas}`);
  check('chapter 1: Gravemaw defeated', s.bossDead, `t=${s.t}`);
  await page.waitForTimeout(4500);
  const head = await page.evaluate(() => document.querySelector('.res-head b')?.textContent);
  check('chapter 1: victory screen', head === 'VICTORY', head);
  await page.evaluate(() => document.querySelector('.modal .btn-primary')?.click());
  await page.waitForTimeout(800);
  const back = await page.evaluate(() => ({ menu: !window.__soulswarm.meta.el.hidden, run: !!window.__soulswarm.run, unlocked: window.__soulswarm.profile.chapter.unlocked }));
  check('returns to menu and unlocks chapter 2', back.menu && !back.run && back.unlocked === 2, JSON.stringify(back));
});
check('chapter 1 clear: no runtime errors', !errs.length, errs[0] || '');

// 4. Endless Abyss: boss returns, run continues
errs = await session(async (page) => {
  const s = await page.evaluate(() => {
    const app = window.__soulswarm; app.profile.chapter.unlocked = 6; app.startRun(6);
    const r = app.run; while (r.time < 304 && !r.ended) window.__bot(5, true);
    const b = r.bossEnemy; if (b) { b.hp = 1; r.enemies.damage(b, 50); }
    const gatesBefore = r.counters.gates, t = r.time;
    window.__bot(2, true);
    return { up: !!b, kills: r.bossKills, next: Math.round(r.nextBossAt), ended: r.ended, gateIn: Math.round(r.nextGate - t), swarmIn: Math.round(r.nextSwarm - t), pairsSpawned: r.gates.pair ? 1 : 0 };
  });
  check('endless: boss returns and run continues', s.up && s.kills === 1 && !s.ended && s.next > 600, JSON.stringify(s));
  check('endless: no gate/swarm catch-up burst after the kill', s.gateIn >= 10 && s.swarmIn >= 25 && !s.pairsSpawned, JSON.stringify(s));
});
check('endless: no runtime errors', !errs.length, errs[0] || '');

// 5. Economy: gacha pity, purchases, pass, quests
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const eco = await import('/src/meta/economy.js');
    const p = window.__soulswarm.profile; p.gems = 100000;
    const pull = eco.summon(p, 10, 'gems');
    const epicPlus = pull.results.some((x) => x.rarity === 'epic' || x.rarity === 'legendary');
    for (let i = 0; i < 6; i++) eco.summon(p, 10, 'gems');
    const starter = eco.applyPurchase(p, 'starter_pack');
    const first = eco.firstPurchaseBonus(p, 'gems_80');
    eco.addPassXp(p, 1600);
    const pass = eco.passState(p).tier;
    return { ok: pull.ok, n: pull.results.length, epicPlus, pulls: p.altar.pulls, pity: p.altar.pity, nyx: p.heroes.nyx.owned, starterGone: !eco.starterAvailable(p), first, pass, items: starter.length };
  });
  check('gacha: 10-pull guarantees Epic+', s.ok && s.n === 10 && s.epicPlus, JSON.stringify(s));
  check('gacha: pity never exceeds 60', s.pulls === 70 && s.pity < 60, `pity=${s.pity}`);
  check('starter pack grants Nyx once', s.nyx && s.starterGone);
  check('soul pass tiers from XP', s.pass === 3, `tier=${s.pass}`);
});
check('economy: no runtime errors', !errs.length, errs[0] || '');

// 6. Gravemaw rework (src/game/boss.js): phases, immune roars, phase floor, sealed arena, edge adds, spiral,
//    Hollow Dirge, chapter twists and the 1.0 s telegraph floor. Each run jumps straight to 6:00 in god mode.
const BOSS_QA = `
window.__bossRun = (ch) => {
  const app = window.__soulswarm;
  if (app.run) app.exitRun();
  app.profile.chapter.unlocked = 6; app.profile.energy = 30; app.startRun(ch);
  const r = app.run; r.player.hurt = () => {}; r.time = ch === 6 ? 299.9 : 359.9;
  for (let i = 0; i < 150 && !(r.bossEnemy && r.boss.state !== 'enter'); i++) r.update(1 / 30);
  return r;
};
window.__step = (r, sec, ix = 0, iz = 0) => { for (let i = 0; i < Math.round(sec * 30); i++) { r.input.tx = ix; r.input.tz = iz; r.update(1 / 30); } };
window.__hit = (r, f) => { const e = r.bossEnemy; e.hp = e.maxHp * (f + 0.01); r.enemies.damage(e, e.maxHp * 0.02, { silent: true }); };`;
errs = await session(async (page) => {
  await page.evaluate(BOSS_QA);
  const s = await page.evaluate(() => {
    const r = window.__bossRun(1), b = r.boss, e = r.bossEnemy, step = (t, x, z) => window.__step(r, t, x, z);
    const out = { up: !!e && b.phase === 0, ticks: [...document.querySelectorAll('.bossbar .ticks b')].map((t) => t.style.left).join(',') };
    window.__hit(r, 0.6); out.heldAt = Math.round(e.hp / e.maxHp * 100); out.held = b.held && b.phase === 0; // phase I cut short: warded at the tick
    b.phaseT = 99; step(1 / 30); out.p2 = b.phase; out.roar = b.state; out.immune = b.immune > 0;
    const hp0 = e.hp; r.enemies.damage(e, e.maxHp * 0.2, { silent: true }); out.invulnerable = e.hp === hp0;
    step(2.2); out.resumed = b.state !== 'roar' && b.immune <= 0 && e.hp < e.maxHp * 0.67;
    b.phaseT = 99; window.__hit(r, 0.32); step(1 / 30); out.p3 = b.phase;
    step(6.5); out.arenaR = Math.round(b.arena.r * 10) / 10;
    b.force('spiral'); step(1.6); out.orbs = r.projectiles.embers.filter((o) => o.boss).length;
    return out;
  });
  check('boss: phases advance at 66% and 33% (bar ticks)', s.up && s.p2 === 1 && s.p3 === 2 && s.ticks === '66%,33%', JSON.stringify(s));
  check('boss: phase I cut short is held at the 66% tick', s.held && s.heldAt === 66, JSON.stringify(s));
  check('boss: invulnerable during the 2 s phase roar', s.roar === 'roar' && s.immune && s.invulnerable && s.resumed, JSON.stringify(s));
  check('boss: phase III closes the arena to 12 m', s.arenaR === 12, `r=${s.arenaR}`);
  check('boss: phase III spiral spawns orbs', s.orbs >= 20, `orbs=${s.orbs}`);
  const a = await page.evaluate(() => {
    const r = window.__bossRun(1), b = r.boss, A = b.arena; let maxD = 0, outside = 0;
    for (let i = 0; i < 240; i++) { r.input.tx = 1; r.input.tz = 0.35; r.update(1 / 30); maxD = Math.max(maxD, Math.hypot(r.player.x - A.x, r.player.z - A.z)); }
    for (const o of r.enemies.active) if (o.active && o.type !== 'boss' && Math.hypot(o.x - A.x, o.z - A.z) > A.r + 0.5) outside++;
    return { maxD: Math.round(maxD * 100) / 100, r: A.r, outside, adds: r.enemies.count - 1 };
  });
  check('boss: the sealed arena keeps the Shepherd inside', a.maxD < a.r, JSON.stringify(a));
  check('boss: adds come from the arena edge, none outside', a.adds > 0 && a.outside === 0, JSON.stringify(a));
  const d = await page.evaluate(() => {
    const r = window.__bossRun(1), b = r.boss, d0 = b.dmg; b.fightT = 179.5; window.__step(r, 1);
    return { dirge: b.dirge, mul: Math.round(b.dmg / d0 * 100) / 100, rate: b.rate, banner: document.querySelector('.banner b')?.textContent };
  });
  check('boss: Hollow Dirge at 3:00 (+50% damage and attack rate)', d.dirge && d.mul === 1.5 && d.rate === 1.5 && d.banner === 'HOLLOW DIRGE', JSON.stringify(d));
  const t = await page.evaluate(async () => {
    const { BOSS_PHASES: B } = await import('/src/game/data.js');
    const teles = [B.ring.tele, B.spiral.tele, B.summon.tele, B.waves.tele, ...B.phases.map((p) => p.slamTele)].map((x) => Math.max(B.minTele, x));
    const out = { minTele: Math.min(...teles) };
    let r = window.__bossRun(5), b = r.boss, e = r.bossEnemy;
    out.ticks5 = [...document.querySelectorAll('.bossbar .ticks b')].map((x) => x.style.left).join(',');
    b.phaseT = 99; window.__hit(r, 0.6); window.__step(r, 2.2); b.phaseT = 99; window.__hit(r, 0.48); window.__step(r, 1 / 30); out.ch5 = b.phase;
    r = window.__bossRun(2); b = r.boss; b.force('slam'); window.__step(r, 2); out.fire = b.zones.filter((z) => z.kind === 'fire').length;
    r = window.__bossRun(3); b = r.boss; b.force('slam'); window.__step(r, 2); out.frost = b.zones.filter((z) => z.kind === 'frost').length;
    r = window.__bossRun(4); b = r.boss; b.force('ring'); out.waves4 = b.waves;
    r = window.__bossRun(6); b = r.boss; e = r.bossEnemy; e.hp = 1; r.enemies.damage(e, 50); window.__step(r, 1.5);
    out.endless = { kills: r.bossKills, arena: b.arena.on, ended: r.ended, spawning: !r.bossSpawned };
    return out;
  });
  check('boss: no damaging telegraph under 1.0 s', t.minTele >= 1, JSON.stringify(t));
  check('boss: chapter 5 enters phase III at 50% (bar tick)', t.ch5 === 2 && t.ticks5 === '66%,50%', JSON.stringify(t));
  check('boss: chapter twists (Ch2 fire rings, Ch3 frost shards, Ch4 extra ring)', t.fire === 3 && t.frost === 21 && t.waves4 === 2, JSON.stringify(t));
  check('boss: endless kill drops the arena and the run continues', t.endless.kills === 1 && !t.endless.arena && !t.endless.ended && t.endless.spawning, JSON.stringify(t.endless));
});
check('boss rework: no runtime errors', !errs.length, errs[0] || '');

await browser.close();
if (server) server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
