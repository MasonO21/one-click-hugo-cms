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

// 6. Weapon evolutions (Harvest Moon, Chains of Perdition, Ossuary Barrage, Requiem): the card is offered only
//    when eligible, each evolved weapon fires and deals damage, Requiem pulls shards, burning kills raise more often.
errs = await session(async (page) => {
  const s = await page.evaluate(() => {
    const app = window.__soulswarm;
    let seed = 20261006; // seeded RNG so the statistical check is reproducible
    Math.random = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const EVOS = { harvestMoon: ['scythe', 'haste', 'Harvest Moon'], chainsOfPerdition: ['chains', 'frenzy', 'Chains of Perdition'], ossuaryBarrage: ['spears', 'vitality', 'Ossuary Barrage'], requiem: ['gravePulse', 'soulMagnet', 'Requiem'] };
    const start = (lv) => {
      if (app.run) app.exitRun();
      document.querySelectorAll('.modal-back, .lvl-back').forEach((n) => n.remove());
      app.profile.energy = 30; app.startRun(1);
      const r = app.run; r.player.hurt = () => {}; r.addXp = () => {}; r.director = () => {};
      r.pickups.dropSpecial = () => {}; // no hearts, so any healing comes from Harvest Moon
      r.skillLv = { ...lv }; r.recomputeStats();
      return r;
    };
    const ring = (r, n, R, hpMul) => { const P = r.player; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; r.enemies.spawn('husk', P.x + Math.cos(a) * R, P.z + Math.sin(a) * R, { hpMul }); } };
    const cards = () => [...document.querySelectorAll('.lvl-back .card.evo')];
    const out = {};
    for (const [id, [w, p, name]] of Object.entries(EVOS)) {
      const o = out[id] = {};
      let r = start({ [w]: 5 });
      r.levelQueue = 1; r.showLevelUp();
      o.offeredWithout = cards().length;
      r = start({ [w]: 5, [p]: 1 });
      r.levelQueue = 1; r.showLevelUp();
      const card = cards().find((c) => c.querySelector('h3').textContent.includes(name));
      o.offered = !!card;
      if (card) card.click();
      o.evolved = !!r.evolved[id];
      // fire into a mixed horde: fragile Husks (kills, heals) and tough ones (burns, sustained hits)
      ring(r, 30, 3.5, 3); ring(r, 40, 6, 400);
      const dmg = {}, orig = r.enemies.damage.bind(r.enemies), W = r.weapons;
      r.enemies.damage = (e, a, op = {}) => { if (e.active && a > 0) dmg[op.source] = (dmg[op.source] || 0) + a; return orig(e, a, op); };
      let bursts = 0, blasts = 0, burning = 0, moons = 0, shards = 0;
      const sh = W.shrapnel.bind(W); W.shrapnel = (...a) => { bursts++; return sh(...a); };
      const dt = W.detonate.bind(W); W.detonate = (...a) => { blasts++; return dt(...a); };
      r.player.hp = r.player.maxHp * 0.5; const hp0 = r.player.hp;
      for (let i = 0; i < 180; i++) { r.update(1 / 30); burning = Math.max(burning, W.burning.length); moons = Math.max(moons, W.moons.count); shards = Math.max(shards, W.shardN); }
      Object.assign(o, { healed: Math.round(r.player.hp - hp0), burning, moons, shards, bursts, blasts });
      for (const k in dmg) o[k] = Math.round(dmg[k]);
    }
    // Requiem: each blast pulls the soul shards within 12 m to the Shepherd, and only those
    let r = start({ gravePulse: 5, soulMagnet: 1 }); r.evolved.requiem = true;
    const P = r.player, W = r.weapons, near = [], far = [];
    W.timers.gravePulse = 99; r.pickups.gems.length = 0;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.28; r.pickups.dropGem(P.x + Math.cos(a) * 8, P.z + Math.sin(a) * 8, 1); near.push(r.pickups.gems[r.pickups.gems.length - 1]); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28; r.pickups.dropGem(P.x + Math.cos(a) * 18, P.z + Math.sin(a) * 18, 1); far.push(r.pickups.gems[r.pickups.gems.length - 1]); }
    for (let i = 0; i < 20; i++) r.update(1 / 30);
    const idle = near.filter((g) => g.pulled).length;
    W.timers.gravePulse = 0;
    for (let i = 0; i < 15; i++) r.update(1 / 30);
    out.shards = { idle, near: near.filter((g) => g.pulled || !r.pickups.gems.includes(g)).length, far: far.filter((g) => g.pulled).length };
    // Chains of Perdition: 600 kills each way at a fixed 25% Raise Chance; burning ones should rise ~50% of the time
    r = start({ chains: 5, frenzy: 1 }); r.evolved.chainsOfPerdition = true;
    r.stats.raise = 0.25; r.stats.cap = 1e9;
    const rate = (burning) => {
      const before = r.counters.raised;
      for (let i = 0; i < 600; i++) {
        const e = r.enemies.spawn('husk', r.player.x + 30, r.player.z, { hpMul: 1 });
        if (burning) r.weapons.ignite(e, 10);
        r.enemies.damage(e, 1e6, { source: 'minion', silent: true });
        if (i % 100 === 99) r.enemies.compact();
      }
      return (r.counters.raised - before) / 600;
    };
    out.raise = { plain: rate(false), burning: rate(true) };
    // the pause screen lists evolved weapons by their evolution name
    r = start({ scythe: 5, chains: 5, spears: 5, gravePulse: 5 });
    for (const id of Object.keys(EVOS)) r.evolved[id] = true;
    r.pause(true);
    out.pause = [...document.querySelectorAll('.modal .pill-gold')].map((n) => n.textContent.trim());
    return out;
  });
  for (const [id, need, ok] of [
    ['harvestMoon', 'haste', (o) => o.scythe > 0 && o.moons === 2 && o.healed > 0 && o.healed <= 6 * 6 + 6], // 6 s at <= 6 HP/s plus the bank
    ['chainsOfPerdition', 'frenzy', (o) => o.chain > 0 && o.burn > 0 && o.burning > 0],
    ['ossuaryBarrage', 'vitality', (o) => o.spear > 0 && o.bursts >= 5 && o.shards > 0],
    ['requiem', 'soulMagnet', (o) => o.pulse > 0 && o.blasts >= 3],
  ]) {
    const o = s[id];
    check(`evolution ${id}: card offered only with ${need}, picking it evolves`, o.offered && o.evolved && o.offeredWithout === 0, JSON.stringify({ offered: o.offered, evolved: o.evolved, without: o.offeredWithout }));
    check(`evolution ${id}: fires and damages enemies`, ok(o), JSON.stringify(o));
  }
  check('requiem: blast pulls shards within 12 m, not beyond', s.shards.idle === 0 && s.shards.near === 12 && s.shards.far === 0, JSON.stringify(s.shards));
  check('perdition: burning kills raise ~+25 pp more often', s.raise.burning - s.raise.plain > 0.15 && Math.abs(s.raise.plain - 0.25) < 0.07 && Math.abs(s.raise.burning - 0.5) < 0.08, JSON.stringify(s.raise));
  check('pause screen lists evolved weapons', ['Harvest Moon', 'Chains of Perdition', 'Ossuary Barrage', 'Requiem'].every((n) => s.pause.some((t) => t.includes(n))), JSON.stringify(s.pause));
});
check('evolutions: no runtime errors', !errs.length, errs[0] || '');

await browser.close();
if (server) server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
