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
  // the victory beat runs on rendered frames; poll so a slow (software-GL) machine doesn't fail it
  await page.waitForFunction(() => document.querySelector('.res-head b'), null, { timeout: 40000 }).catch(() => {});
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

// 9. Weapon evolutions (Harvest Moon, Chains of Perdition, Ossuary Barrage, Requiem): the card is offered only
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
      r.t += 0.31; // past the 0.3 s tap guard
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

// ---------------------------------------------------------------- 10. Horde behaviours and chapter identities
// Frame-stepped staged checks: the enemy signature moves (Ghoul lunge, Brute slam, Witch lob), the chapter
// modifiers (Ch2 burning ground, Ch3 ice, Ch4 vignette, Ch5 elites, Endless rotation) and the Bulwark taunt
// contract (run.legion.taunters / hitMinion), using a fake taunter so it runs before the Legion branch lands.
errs = await session(async (page) => {
  const s = await page.evaluate(() => {
    const app = window.__soulswarm, prof = app.profile, post = app.engine.post;
    app.engine.manual = true;
    prof.flags.tutorialDone = true; prof.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1 };
    // a quiet arena: no director spawns, gates, swarms, elites, weapons or level-ups; the Shepherd stands still
    const start = (ch) => {
      if (app.run) app.exitRun();
      prof.energy = 30; prof.chapter.unlocked = 6; app.startRun(ch);
      const r = app.run;
      r.spawnAcc = -1e9; r.nextGate = r.nextSwarm = 1e9; r.eliteIdx = 99; r.modBannerAt = 0;
      r.weapons.update = () => {}; r.addXp = () => {}; r.player.invuln = 0; r.input.tx = r.input.tz = 0;
      return r;
    };
    const step = (r, sec) => { for (let i = 0; i < Math.round(sec * 30); i++) r.update(1 / 30); };
    const near = (r, type, dx, dz) => { const e = r.enemies.spawn(type, r.player.x + dx, r.player.z + dz, { hpMul: 50 }); e.spawnT = 1; return e; };
    const out = {};

    // Ghoul: crouch at 3 m (0.4 s), lunge at ~11 m/s along the locked direction, recover
    let r = start(1), P = r.player;
    const g = near(r, 'ghoul', 2.6, 0);
    const states = new Set(); let crouch = 0, vmax = 0;
    for (let i = 0; i < 45; i++) { r.update(1 / 30); states.add(g.state); if (g.state === 1) crouch += 1 / 30; if (g.state === 2) vmax = Math.max(vmax, Math.hypot(g.vx, g.vz)); }
    out.lunge = { states: [...states].sort().join(''), crouch: +crouch.toFixed(2), vmax: +vmax.toFixed(1) };

    // Brute: cone telegraph for the full 1.0 s wind-up, then 1.4× damage with knockback
    r = start(1); P = r.player;
    const b = near(r, 'brute', 0, -1.9);
    let hp0 = P.hp, windAt = -1, hitAt = -1, cone = false, knock = 0;
    for (let i = 0; i < 60 && hitAt < 0; i++) {
      r.update(1 / 30);
      if (b.state === 1 && windAt < 0) windAt = r.time;
      if (r.hazards.teles.some((t) => t.owner === b)) cone = true;
      if (P.hp < hp0) { hitAt = r.time; knock = Math.hypot(P.kx, P.kz); }
    }
    out.slam = { cone, delay: +(hitAt - windAt).toFixed(3), dmg: +(hp0 - P.hp).toFixed(1), want: +(b.dmg * 1.4).toFixed(1), knock: +knock.toFixed(1) };

    // Witch: the lob lands where its telegraph circle sits, after a 1.0 s flight, for its damage (no fire in Ch1)
    r = start(1); P = r.player;
    const w = near(r, 'witch', 0, -7); w.shootCd = 0;
    r.update(1 / 30);
    const L = r.projectiles.lobs[0], tele = L && r.hazards.teles.find((t) => t.kind === 0);
    const at = L ? { x: L.tx, z: L.tz } : { x: NaN, z: NaN };
    hp0 = P.hp; let frames = 0;
    while (L && r.projectiles.lobs.includes(L) && frames < 60) { r.update(1 / 30); frames++; }
    out.lob = { thrown: !!L, tele: !!tele && Math.hypot(tele.x - at.x, tele.z - at.z) < 0.01, off: L ? +Math.hypot(L.x - at.x, L.z - at.z).toFixed(3) : -1,
      flight: +(frames / 30).toFixed(2), dmg: +(hp0 - P.hp).toFixed(1), want: +w.dmg.toFixed(1), burns: r.hazards.burns.length };

    // Ch2: a landed lob leaves burning ground that hurts while the Shepherd stands in it
    r = start(2); P = r.player;
    const w2 = near(r, 'witch', 0, -7); w2.shootCd = 0;
    step(r, 1.2);
    const patch = r.hazards.burns[0];
    P.invuln = 0; hp0 = P.hp;
    step(r, 1.0);
    out.burn = { patches: r.hazards.burns.length, dps: patch ? +patch.dps.toFixed(2) : 0, lost: +(hp0 - P.hp).toFixed(2) };

    // Ch3: on an ice patch the Shepherd takes far longer to reach speed
    r = start(3); P = r.player;
    const H = r.hazards, ring5 = [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]];
    const find = (want) => { for (let R = 3; R < 90; R += 0.5) for (let a = 0; a < 6.28; a += 0.15) { const x = Math.cos(a) * R, z = Math.sin(a) * R; if (ring5.every(([u, v]) => H.iceAt(x + u, z + v) === want)) return { x, z }; } return null; };
    const iceSpot = find(true), dry = find(false);
    const speedAfter = (p) => { P.x = p.x - 0.4; P.z = p.z; P.vx = P.vz = 0; r.input.tx = 1; step(r, 0.2); r.input.tx = 0; return Math.hypot(P.vx, P.vz); };
    const vIce = iceSpot ? speedAfter(iceSpot) : -1, onIce = P.onIce, vDry = dry ? speedAfter(dry) : -1;
    out.ice = { found: !!iceSpot && !!dry, onIce, vIce: +vIce.toFixed(2), vDry: +vDry.toFixed(2), ch1: (start(1), app.run.hazards.iceAt(iceSpot ? iceSpot.x : 0, iceSpot ? iceSpot.z : 0)) };

    // Ch4: a tighter fog vignette during the run, restored afterwards
    r = start(4);
    const vigIn = post.uVignette.value;
    app.exitRun();
    out.vignette = { during: vigIn, after: post.uVignette.value };

    // Ch5 schedules 8 elites; Ch1 keeps 4
    const elitesBy300 = (ch) => {
      const rr = start(ch); rr.eliteIdx = 0; let n = 0;
      const sp = rr.spawnEnemy.bind(rr); rr.spawnEnemy = (t, o = {}) => { if (o.elite) n++; return sp(t, o); };
      for (let t = 0; t <= 300; t += 0.5) { rr.time = t; rr.director(0); }
      return n;
    };
    out.elites = { ch5: elitesBy300(5), ch1: elitesBy300(1) };

    // Endless: the modifier set rotates Ch2 → Ch3 → … with each Gravemaw kill
    r = start(6);
    const d1 = r.mods.burn ? 'ch2' : '?';
    r.bossKills = 1; r.director(0);
    out.endless = { d1, d2: r.mods.ice ? 'ch3' : '?' };

    // Taunt: inert without taunters (undefined or empty) …
    // (the real Legion rebuilds taunters every update, so it is frozen here; section 11 taunts with real Bulwarks)
    r = start(1); P = r.player; r.legion.update = () => {};
    let calls = 0; r.legion.hitMinion = () => { calls++; };
    const h1 = near(r, 'husk', 5, 0);
    r.legion.taunters = undefined; step(r, 0.5);
    r.legion.taunters = []; step(r, 0.5);
    out.inert = { calls, approach: +Math.hypot(h1.x - P.x, h1.z - P.z).toFixed(2) };
    r.enemies.clearAll(false);
    // … and with a (fake) taunter in range, enemies steer to it and hit it instead of the Shepherd
    const fake = { x: P.x + 7, z: P.z, hp: 100, vx: 0, vz: 0 };
    let hits = 0; r.legion.hitMinion = (m, dmg) => { hits++; m.hp -= dmg; };
    r.legion.taunters = [fake];
    const h2 = near(r, 'husk', 9, 1);
    hp0 = P.hp; P.invuln = 0;
    step(r, 2.5);
    out.taunt = { toTaunter: +Math.hypot(h2.x - fake.x, h2.z - fake.z).toFixed(2), toShepherd: +Math.hypot(h2.x - P.x, h2.z - P.z).toFixed(2), hits, fakeHp: +fake.hp.toFixed(1), shepherdHurt: +(hp0 - P.hp).toFixed(1) };
    app.exitRun();
    return out;
  });
  const { lunge, slam, lob, burn, ice, vignette, elites, endless, inert, taunt } = s;
  check('horde: Ghoul crouches 0.4 s, lunges ~11 m/s, recovers', lunge.states === '0123' && lunge.crouch >= 0.36 && lunge.crouch <= 0.45 && lunge.vmax >= 9.5, JSON.stringify(lunge));
  check('horde: Brute slam hits for 1.4× after its 1.0 s wind-up', slam.cone && slam.delay >= 0.99 && Math.abs(slam.dmg - slam.want) < 0.6 && slam.knock > 3, JSON.stringify(slam));
  check('horde: Witch lob lands on its telegraph after 1.0 s', lob.thrown && lob.tele && lob.off < 0.01 && lob.flight >= 0.99 && Math.abs(lob.dmg - lob.want) < 0.6 && lob.burns === 0, JSON.stringify(lob));
  check('horde: Ch2 burning ground hurts', burn.patches >= 1 && burn.lost >= burn.dps * 0.5, JSON.stringify(burn));
  check('horde: Ch3 ice slows Shepherd acceleration', ice.found && ice.onIce && ice.vIce > 0 && ice.vIce < ice.vDry * 0.75 && !ice.ch1, JSON.stringify(ice));
  check('horde: Ch4 vignette tightens, restored after', vignette.during > 1 && Math.abs(vignette.after - 0.85) < 1e-6, JSON.stringify(vignette));
  check('horde: Ch5 spawns 8 elites (Ch1 keeps 4)', elites.ch5 === 8 && elites.ch1 === 4, JSON.stringify(elites));
  check('horde: Endless rotates chapter modifiers by depth', endless.d1 === 'ch2' && endless.d2 === 'ch3', JSON.stringify(endless));
  check('horde: taunt is inert without taunters', inert.calls === 0 && inert.approach < 3.5, JSON.stringify(inert));
  check('horde: taunt pulls enemies onto a taunter', taunt.toTaunter < 1 && taunt.hits >= 1 && taunt.fakeHp < 100 && taunt.shepherdHurt === 0, JSON.stringify(taunt));
});
check('horde: no runtime errors', !errs.length, errs[0] || '');

// 11. Daily Trial: seeded by date, free, one attempt (+1 by ad), mutators applied, records untouched
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const eco = await import('/src/meta/economy.js');
    const app = window.__soulswarm, p = app.profile;
    const lockedAtStart = !eco.trialState(p).unlocked;
    p.chapter.unlocked = 3; p.chapter.best = {};
    const a = eco.dailyTrial(p, '2026-10-06'), b = eco.dailyTrial(p, '2026-10-06'), c = eco.dailyTrial(p, '2026-10-07');
    const same = JSON.stringify(a) === JSON.stringify(b), varies = JSON.stringify(a) !== JSON.stringify(c);
    const energy = p.energy, t = eco.dailyTrial(p);
    const started = app.startRun(0, { trial: true }), r = app.run;
    const mut = r.mut, S = r.stats;
    const second = (app.exitRun(), app.startRun(0, { trial: true }));
    const retry = eco.grantTrialRetry(p), third = app.startRun(0, { trial: true });
    const r3 = app.run; r3.player.hurt = () => {};
    const e = r3.spawnEnemy('husk', { at: { x: r3.player.x + 9, z: r3.player.z } });
    const hpRatio = e.maxHp / (14 * r3.hpMul());
    const out = eco.applyRunResult(p, { chapter: t.chapter, time: 400, kills: 2000, raised: 300, bestLegion: 120, novas: 5, gates: 8, victory: true, level: 20, bonusGold: 0, heroId: 'vael', endless: false, bossKills: 0, trial: true });
    return { lockedAtStart, same, varies, chapterOk: t.chapter >= 1 && t.chapter <= 2, started, energyKept: p.energy === energy, trialFlag: r.trial, ids: mut.ids, second, retry, third,
      hpRatio: Math.round(hpRatio * 100) / 100, hpExpected: mut.hp, gems: out.rewards.gems, sigils: out.rewards.sigils, bestUntouched: !p.chapter.best[t.chapter], unlocked: p.chapter.unlocked };
  });
  check('trial: locked until Chapter 1 is cleared, seeded by date', s.lockedAtStart && s.same && s.varies && s.chapterOk, JSON.stringify(s));
  check('trial: free, one attempt, an ad buys one more', s.started && s.energyKept && s.trialFlag && s.ids.length === 2 && s.second === false && s.retry && s.third, JSON.stringify(s));
  check('trial: mutators reach the horde, rewards paid, records untouched', Math.abs(s.hpRatio - s.hpExpected) < 0.02 && s.gems === 40 && !s.sigils && s.bestUntouched && s.unlocked === 3, JSON.stringify(s));
});
check('trial: no runtime errors', !errs.length, errs[0] || '');

// 12. Daily quests rotate: 5 from the pool (seeded by date) plus "Finish 2 runs"; rewards stay with the slot
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const eco = await import('/src/meta/economy.js');
    const p = window.__soulswarm.profile;
    const fresh = eco.pickQuests(p, '2026-10-06');
    p.chapter.unlocked = 3;
    const a = eco.pickQuests(p, '2026-10-06'), b = eco.pickQuests(p, '2026-10-06');
    const days = new Set(); for (let d = 1; d <= 28; d++) for (const id of eco.pickQuests(p, `2026-11-${String(d).padStart(2, '0')}`)) days.add(id);
    p.quests = { day: p.quests.day, progress: {}, claimed: [], ids: ['chest', 'elite', 'legion', 'boss', 'evolve'] };
    eco.applyRunResult(p, { chapter: 1, time: 380, kills: 2200, raised: 300, bestLegion: 140, novas: 6, gates: 9, victory: true, level: 22, bonusGold: 0, heroId: 'vael', endless: false, bossKills: 0, chests: 4, elites: 4, evolutions: 1 });
    const list = eco.questList(p);
    return { n: list.length, freshLate: fresh.some((id) => ['evolve', 'boss', 'trial'].includes(id)), same: a.join() === b.join(), unique: new Set(a).size === 5, variety: days.size,
      done: list.filter((q) => q.done).map((q) => q.id), sigilSlot: list[4].rewards.sigils === 1, runs: list[5].id === 'runs' };
  });
  check('quests: 6 a day, seeded, varied, late quests gated', s.n === 6 && !s.freshLate && s.same && s.unique && s.variety >= 10 && s.sigilSlot && s.runs, JSON.stringify(s));
  check('quests: new keys track chests, elites, peak legion, Gravemaw, evolutions', ['chest', 'elite', 'legion', 'boss', 'evolve'].every((id) => s.done.includes(id)), JSON.stringify(s.done));
});
check('quests: no runtime errors', !errs.length, errs[0] || '');

// 13. Legion variants (GDD §4.2): with Raise Chance forced to 1, every kill rises as its own kind.
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
    // taunting end to end (enemies.js side): foes next to a real Bulwark steer to it and strike it
    L.detonateAll(); EN.clearAll(false); r.stats.cap = 400;
    const bw = L.raise(P.x + 2.3, P.z, { kind: 'brute', fx: false }); bw.hp = bw.maxHp *= 50; bw.born = 1;
    let onBw = 0, onShep = 0;
    const hm = L.hitMinion.bind(L); L.hitMinion = (m, d) => { if (m === bw) onBw++; return hm(m, d); };
    P.hurt = () => { onShep++; };
    for (let i = 0; i < 4; i++) EN.spawn('husk', bw.x + 1.5 + i * 0.3, bw.z + (i - 1.5) * 0.6, { hpMul: 200 }).spawnT = 1;
    step(3);
    out.taunt2 = { hitsOnBulwark: onBw, hitsOnShepherd: onShep, bulwarkHurt: bw.hp < bw.maxHp, radius: +bw.radius.toFixed(2) };
    L.hitMinion = hm; P.hurt = () => {};
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
  check('legion: enemies taunted by a real Bulwark strike it', s.taunt2.hitsOnBulwark >= 2 && s.taunt2.bulwarkHurt, JSON.stringify(s.taunt2));
  check('legion: at most 24 minions engage the boss',s.boss.maxEngaged > 0 && s.boss.maxEngaged <= 24, JSON.stringify(s.boss));
});
check('legion variants: no runtime errors', !errs.length, errs[0] || '');

await browser.close();
if (server) server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
