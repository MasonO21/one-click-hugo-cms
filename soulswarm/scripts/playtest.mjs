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
  for (let i = 0; i < 70; i++) { s = await page.evaluate(() => window.__bot(10, true)); if (s.bossDead || s.t > 560) break; } // card picks take a few frames (0.3 s tap guard)
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

// 6. Run systems: Relic Chest pick, Nova invulnerability and charge, gate guards and soul bursts
errs = await session(async (page) => {
  const s = await page.evaluate(() => {
    const app = window.__soulswarm; app.startRun(1);
    const r = app.run, P = r.player; r.nextGate = r.nextSwarm = 1e9; r.eliteIdx = 99; r.tutorial = false;
    window.__bot(2, true);
    r.addXp = () => {}; // isolate the chest from level-ups triggered by the magnetised shards
    // an elite's chest opens a 1-of-3 pick instead of a random card
    const e = r.enemies.spawn('husk', P.x + 1, P.z, { elite: true, hpMul: 1 });
    r.enemies.damage(e, 1e6, { source: 'bolt' });
    r.pickups.magnetAll(); for (let i = 0; i < 90 && !r.levelPending; i++) r.update(1 / 30);
    const chestCards = document.querySelectorAll('.lvl-back.chest .card').length;
    const lvBefore = JSON.stringify(r.skillLv);
    for (let i = 0; i < 15; i++) { document.querySelector('.lvl-back.chest .card')?.click(); r.update(1 / 30); }
    const chestPicked = !r.levelPending && r.chestQueue === 0 && JSON.stringify(r.skillLv) !== lvBefore;
    // Nova: 1.5 s of invulnerability; gates add 3 kills of charge
    r.nova = 1; P.invuln = 0; r.triggerNova(); const invuln = P.invuln;
    r.nova = 0; r.novaQueue.length = 0; r.gates.spawnPair([{ type: 'add', n: 5 }, { type: 'add', n: 10 }]); // nothing charges mid-detonation
    const G = r.gates.pair.gates[0]; r.gates.choose(G);
    const gateCharge = Math.round(r.nova * 300 / r.stats.novaMul);
    // from 2:00 the better gate can be guarded
    r.gates.despawn(); r.time = 150; const before = r.enemies.count; const rnd = Math.random; Math.random = () => 0.1;
    r.gates.spawnPair(); Math.random = rnd;
    const guards = r.enemies.count - before;
    return { chestCards, chestPicked, invuln, gateCharge, guards };
  });
  check('relic chest: pick 1 of 3', s.chestCards === 3 && s.chestPicked, JSON.stringify(s));
  check('nova: 1.5 s invulnerability', s.invuln >= 1.45, `invuln=${s.invuln}`);
  check('gates: +3 kills of nova charge', s.gateCharge === 3, `charge=${s.gateCharge}`);
  check('gates: better gate guarded from 2:00', s.guards >= 3, `guards=${s.guards}`);
});
check('run systems: no runtime errors', !errs.length, errs[0] || '');

// 7. Accessibility: Auto-Nova, left-handed HUD, reduced flashes
errs = await session(async (page) => {
  const s = await page.evaluate(() => {
    const app = window.__soulswarm, st = app.profile.settings;
    Object.assign(st, { autoNova: true, lefty: true, reduceFlash: true, shake: 0 }); app.applySettings(); app.engine.manual = true;
    app.startRun(1); const r = app.run; r.player.hurt = () => {};
    r.legion.addMany(60, r.player.x, r.player.z); r.nova = 1; app.engine.step(1 / 30);
    return { novas: r.counters.novas, lefty: app.runUI.el.classList.contains('lefty'), flash: app.engine.post.uFlash.value.w };
  });
  check('accessibility: auto-nova, left-handed, reduced flashes', s.novas === 1 && s.lefty && s.flash <= 0.2, JSON.stringify(s));
});
check('accessibility: no runtime errors', !errs.length, errs[0] || '');

// 8. First run: the first gate pair is the scripted +5 vs ×2 lesson and the first Nova charges 2.5× faster
errs = await session(async (page) => {
  const s = await page.evaluate(() => {
    const app = window.__soulswarm; app.startRun(1); const r = app.run;
    const tutorial = r.tutorial; r.legion.addMany(12, r.player.x, r.player.z); r.gates.spawnPair();
    const ops = r.gates.pair.gates.map((G) => G.op.type + G.op.n).sort().join(',');
    r.addNovaCharge(10);
    return { tutorial, ops, charge: Math.round(r.nova * 300 / r.stats.novaMul) };
  });
  check('first run: gate lesson and early Nova', s.tutorial && s.ops === 'add5,mul2' && s.charge === 25, JSON.stringify(s));
});
check('first run: no runtime errors', !errs.length, errs[0] || '');

await browser.close();
if (server) server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
