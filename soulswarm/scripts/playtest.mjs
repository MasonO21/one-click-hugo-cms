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

// 6. Legion variants (GDD §4.2): with Raise Chance forced to 1, every kill rises as its own kind.
//    Covers variant mapping, Champions, Soul Bomb blasts, Soul Witch orbs, taunters, removeMany,
//    the cap heal and the boss engagement limit, then renders every ghost kind to catch shader errors.
errs = await session(async (page) => {
  const s = await page.evaluate(() => {
    const app = window.__soulswarm, E = app.engine; E.manual = true;
    app.profile.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1 };
    app.startRun(1);
    const r = app.run, P = r.player, L = r.legion, EN = r.enemies;
    r.player.hurt = () => {}; r.addXp = () => {}; r.nextGate = r.nextSwarm = 1e9; r.eliteIdx = 99; r.spawnAcc = -1e9;
    r.weapons.update = () => {}; // only minions deal damage here
    r.stats.raise = 1; r.stats.cap = 400;
    const step = (sec, each) => { for (let i = 0; i < Math.round(sec * 30); i++) { r.update(1 / 30); if (each) each(); } };
    const newest = () => L.list[L.list.length - 1];
    const out = {};
    // each enemy type rises as its matching variant; an elite rises as a Champion
    out.kinds = {};
    for (const t of ['husk', 'ghoul', 'brute', 'witch', 'bloater']) { EN.kill(EN.spawn(t, P.x + 6, P.z + 6, {}), 'bolt'); out.kinds[t] = newest().kind; }
    EN.kill(EN.spawn('witch', P.x + 6, P.z - 6, { elite: true }), 'bolt');
    const ch = newest();
    out.champ = { kind: ch.kind, champ: ch.champ, hpMul: +(ch.maxHp / r.stats.minionHp).toFixed(2), scale: +ch.scale.toFixed(3) };
    // render every ghost kind (shader compile / runtime errors surface as console errors)
    for (let i = 0; i < 6; i++) E.step(1 / 30);
    // taunters: the live Bulwarks; hitMinion damages one
    const t0 = L.taunters[0];
    out.taunt = { n: L.taunters.length, fields: !!t0 && ['x', 'z', 'hp', 'maxHp'].every((k) => typeof t0[k] === 'number') };
    const hp0 = t0.hp; out.taunt.hit = L.hitMinion(t0, 5) === false && Math.abs(t0.hp - (hp0 - 5)) < 1e-6;
    out.taunt.kill = L.hitMinion(t0, 1e9) === true;
    step(1 / 30);
    out.taunt.after = L.taunters.length;
    // Soul Bomb: dives into a tight crowd, blasts it and leaves the legion; blast kills take the normal kill path
    L.detonateAll(); EN.clearAll(false);
    const crowd = [];
    for (let i = 0; i < 10; i++) crowd.push(EN.spawn('husk', P.x + 6 + Math.cos(i * 0.63) * 0.5, P.z + Math.sin(i * 0.63) * 0.5, { hpMul: i < 4 ? 0.05 : 80 }));
    const tanky = crowd.slice(4), hpA = tanky.reduce((a, e) => a + e.hp, 0);
    const sources = [], onKill = r.onEnemyKilled.bind(r);
    r.onEnemyKilled = (e, src, nr) => { sources.push(src); onKill(e, src, nr); };
    const raised0 = r.counters.raised, bomb = L.raise(P.x + 2, P.z, { kind: 'bloater' }), uid = bomb.uid;
    let tb = 0;
    while (tb < 5 && L.list.some((m) => m.uid === uid)) { step(1 / 30); tb += 1 / 30; }
    out.bomb = { gone: !L.list.some((m) => m.uid === uid), t: +tb.toFixed(2), dmg: Math.round(hpA - tanky.reduce((a, e) => a + e.hp, 0)), expect: Math.round(6 * r.stats.minionDmg * 6),
      soulbombKills: sources.filter((x) => x === 'soulbomb').length, raised: r.counters.raised - raised0 };
    r.onEnemyKilled = onKill;
    // Soul Witch: shoots homing orbs from range
    L.detonateAll(); EN.clearAll(false);
    const foe = EN.spawn('husk', P.x + 5, P.z, { hpMul: 80 }); foe.speed = 0;
    const witch = L.raise(P.x, P.z, { kind: 'witch' });
    let orbs = 0, minD = 99;
    step(3, () => { orbs = Math.max(orbs, L.orbs.length); minD = Math.min(minD, Math.hypot(witch.x - foe.x, witch.z - foe.z)); });
    out.witch = { orbs, hurt: Math.round(foe.maxHp - foe.hp), minDist: +minD.toFixed(2) };
    // removeMany returns the lost souls' positions
    L.detonateAll(); EN.clearAll(false);
    L.addMany(12, P.x, P.z);
    const lost = L.removeMany(5);
    out.remove = { n: lost.length, left: L.count, finite: lost.every((p) => [p.x, p.y, p.z].every(Number.isFinite)) };
    // a raise roll at the cap heals the weakest minion by 50% instead of raising
    r.stats.cap = L.count;
    const weak = L.list[3]; weak.hp = weak.maxHp * 0.1;
    EN.kill(EN.spawn('husk', P.x + 7, P.z, {}), 'bolt');
    out.capHeal = { count: L.count, cap: r.stats.cap, frac: +(weak.hp / weak.maxHp).toFixed(2) };
    // at most 24 minions engage Gravemaw at once
    L.detonateAll(); EN.clearAll(false); r.stats.cap = 400;
    L.addMany(150, P.x, P.z);
    r.boss.spawn(); const B = r.bossEnemy;
    let maxEngaged = 0;
    step(5, () => { B.x = P.x + 3; B.z = P.z; let n = 0; for (const m of L.list) if (m.target === B) n++; maxEngaged = Math.max(maxEngaged, n); });
    out.boss = { maxEngaged, legion: L.count };
    for (let i = 0; i < 4; i++) E.step(1 / 30);
    return out;
  });
  check('legion: each enemy type rises as its variant', JSON.stringify(s.kinds) === JSON.stringify({ husk: 'shade', ghoul: 'runner', brute: 'bulwark', witch: 'soulWitch', bloater: 'soulBomb' }), JSON.stringify(s.kinds));
  check('legion: an elite rises as a Champion', s.champ.champ && s.champ.kind === 'soulWitch' && s.champ.hpMul === 2.4 && s.champ.scale === 1.08, JSON.stringify(s.champ));
  check('legion: taunters list live Bulwarks; hitMinion damages and kills', s.taunt.n === 1 && s.taunt.fields && s.taunt.hit && s.taunt.kill && s.taunt.after === 0, JSON.stringify(s.taunt));
  check('legion: Soul Bomb detonates, damages enemies and leaves the legion', s.bomb.gone && s.bomb.dmg >= s.bomb.expect * 0.5, JSON.stringify(s.bomb));
  check('legion: Soul Bomb kills take the kill path and roll raises', s.bomb.soulbombKills >= 3 && s.bomb.raised >= 3, JSON.stringify(s.bomb));
  check('legion: Soul Witch hits with orbs from range', s.witch.orbs > 0 && s.witch.hurt > 0 && s.witch.minDist > 2.5, JSON.stringify(s.witch));
  check('legion: removeMany returns the lost positions', s.remove.n === 5 && s.remove.left === 7 && s.remove.finite, JSON.stringify(s.remove));
  check('legion: a raise at the cap heals the weakest minion', s.capHeal.count === s.capHeal.cap && s.capHeal.frac === 0.6, JSON.stringify(s.capHeal));
  check('legion: at most 24 minions engage the boss', s.boss.maxEngaged > 0 && s.boss.maxEngaged <= 24, JSON.stringify(s.boss));
});
check('legion variants: no runtime errors', !errs.length, errs[0] || '');

await browser.close();
if (server) server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
