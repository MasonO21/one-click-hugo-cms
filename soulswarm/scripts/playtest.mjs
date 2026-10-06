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
for (const hero of ['vael', 'nyx', 'seraphine', 'liora', 'mordrake']) {
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
  const k = await page.evaluate(() => {
    const app = window.__soulswarm, r = app.run, P = r.player; r.player.hurt = () => {};
    for (let i = 0; i < 5; i++) { const e = r.enemies.spawn('husk', P.x + 3, P.z, { hpMul: 1 }); r.enemies.damage(e, 1e6, { source: 'bolt' }); }
    const raised = r.counters.raised; r.time = 359.9; for (let i = 0; i < 60; i++) r.update(1 / 30);
    const b = r.bossEnemy;
    return { raised, hpFrac: b ? Math.round(b.maxHp / 12500 * 100) / 100 : 0, crownTick: r.boss.thresholds[1] };
  });
  check('first run: first 5 kills rise, gentler King (60% HP, no phase III)', k.raised === 5 && k.hpFrac === 0.6 && k.crownTick < 0, JSON.stringify(k));
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

// 15. Weekend Blood Moon (8 elites, double gold and gems, red sky) and the weekly quest chest (25 quests)
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const eco = await import('/src/meta/economy.js');
    const app = window.__soulswarm, p = app.profile;
    const fri = eco.bloodMoon(p, Date.UTC(2026, 9, 9, 12)), tue = eco.bloodMoon(p, Date.UTC(2026, 9, 6, 12));
    const T = eco.bloodMoonTimes(Date.UTC(2026, 9, 10, 12)); // a Saturday
    p.flags.bloodMoon = 'on'; app.startRun(1); const r = app.run;
    const run = { bloodMoon: r.bloodMoon, elites: r.eliteTimes.length, sky: '#' + r.scene.background.getHexString() };
    app.exitRun(); p.flags.bloodMoon = 'off';
    const base = { chapter: 1, time: 200, kills: 800, raised: 100, bestLegion: 60, novas: 2, gates: 4, victory: false, level: 12, bonusGold: 0, heroId: 'vael', endless: false, bossKills: 0 };
    const goldA = eco.applyRunResult(p, { ...base }).rewards.gold, goldB = eco.applyRunResult(p, { ...base, bloodMoon: true }).rewards.gold;
    // weekly chest: 25 claimed daily quests open it once
    p.weekly = { week: null, done: 0, claimed: false }; eco.weeklyState(p); p.weekly.done = 24;
    const early = eco.claimWeekly(p); p.weekly.done = 25;
    const gems0 = p.gems, items = eco.claimWeekly(p), again = eco.claimWeekly(p);
    return { fri, tue, ends: new Date(T.ends).toISOString(), starts: new Date(T.starts).toISOString(), ...run, double: goldB === goldA * 2, early: !!early, opened: !!items && p.gems - gems0 === 50, again: !!again };
  });
  check('blood moon: weekends only, 8 elites, red sky, double rewards', s.fri && !s.tue && s.ends === '2026-10-12T00:00:00.000Z' && s.starts === '2026-10-16T00:00:00.000Z' && s.bloodMoon && s.elites === 8 && s.sky === '#12020a' && s.double, JSON.stringify(s));
  check('weekly chest: opens at 25 quests, once', !s.early && s.opened && !s.again, JSON.stringify(s));
});
check('weekend and weekly: no runtime errors', !errs.length, errs[0] || '');

// 14. Gravemaw rework (src/game/boss.js): phases, immune roars, phase floor, sealed arena, edge adds, spiral,
//    Hollow Dirge, chapter twists and the 1.0 s telegraph floor. Each run jumps straight to 6:00 in god mode.
const BOSS_QA = `
window.__bossRun = (ch) => {
  const app = window.__soulswarm;
  if (app.run) app.exitRun();
  app.profile.chapter.unlocked = 6; app.profile.energy = 30; app.profile.flags.tutorialDone = true; app.startRun(ch); // a veteran: the first run's King is gentler
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
    step(2.7); out.resumed = b.state !== 'roar' && b.immune <= 0 && e.hp < e.maxHp * 0.67; // 2 s of sim time, stretched by the slow-mo
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
  const n = await page.evaluate(() => {
    const out = {};
    // the slam's landing kills every minion inside outright, however tough (a Champion Bulwark stand-in)
    let r = window.__bossRun(1), b = r.boss, P = r.player;
    r.weapons.update = () => {};
    const m = r.legion.raise(P.x, P.z, { kind: 'brute', elite: true }); m.hp = m.maxHp = 1e5;
    b.force('slam'); const S = b.slamS;
    for (let i = 0; i < 60 && S.fired < 1; i++) { m.x = P.x + 0.5; m.z = P.z; m.vx = m.vz = 0; r.update(1 / 30); }
    r.update(1 / 30); out.slamKill = !(m.hp > 0) || !r.legion.list.includes(m);
    // a Nova with 300 minions on him takes at most 25% of his max HP; during a phase roar it does nothing
    r = window.__bossRun(1); b = r.boss; const e = r.bossEnemy;
    r.weapons.update = () => {}; b.cd = 99;
    r.legion.addMany(300, e.x, e.z); for (const q of r.legion.list) { q.x = e.x + (Math.random() - 0.5) * 3; q.z = e.z + (Math.random() - 0.5) * 3; }
    r.nova = 1; r.triggerNova(); window.__step(r, 1.5); // souls raised by the blast may chip in a little (hence 0.26, not 0.25)
    out.novaShare = Math.round((1 - e.hp / e.maxHp) * 1000) / 1000;
    b.phaseT = 99; window.__hit(r, 0.6); window.__step(r, 1 / 30); const hp0 = e.hp;
    r.legion.addMany(200, e.x, e.z); r.nova = 1; r.triggerNova(); window.__step(r, 0.5);
    out.roarNova = { state: b.state, lost: Math.round(hp0 - e.hp) };
    return out;
  });
  check('boss: the slam landing kills every minion inside outright', n.slamKill, JSON.stringify(n));
  check('boss: a Nova deals at most 25% of his max HP, nothing mid-roar', n.novaShare > 0.05 && n.novaShare <= 0.26 && n.roarNova.state === 'roar' && n.roarNova.lost === 0, JSON.stringify(n));
  const t = await page.evaluate(async () => {
    const { BOSS_PHASES: B } = await import('/src/game/data.js');
    const teles = [B.ring.tele, B.spiral.tele, B.summon.tele, B.waves.tele, ...B.phases.map((p) => p.slamTele)].map((x) => Math.max(B.minTele, x));
    const out = { minTele: Math.min(...teles) };
    let r = window.__bossRun(5), b = r.boss, e = r.bossEnemy;
    out.ticks5 = [...document.querySelectorAll('.bossbar .ticks b')].map((x) => x.style.left).join(',');
    b.phaseT = 99; window.__hit(r, 0.6); window.__step(r, 2.7); b.phaseT = 99; window.__hit(r, 0.48); window.__step(r, 1 / 30); out.ch5 = b.phase;
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

// 16. Epic hero passives: Liora's toll (Grave Pulse marks foes; any kill within 3 s rises at ×2, a recycled enemy
// never inherits the mark) and Seraphine's Nova (her Nova's kills rise at ×2, not the halved mid-Nova rate).
// Raise rolls are pinned with Math.random = 0.4 against a 0.25 Raise Chance.
errs = await session(async (page) => {
  const s = await page.evaluate(() => {
    const app = window.__soulswarm, p = app.profile, rnd = Math.random;
    p.flags.tutorialDone = true; p.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1 };
    const rises = (hero, fn) => {
      p.heroes[hero].owned = true; p.selectedHero = hero; p.energy = 30; app.startRun(1);
      const r = app.run; app.engine.manual = true; r.director = () => {}; r.stats.raise = 0.25;
      const spawn = () => r.enemies.spawn('husk', r.player.x + 3, r.player.z, { hpMul: 50 });
      Math.random = () => 0.4;
      const n0 = r.legion.count; const out = fn(r, spawn); out.rose = r.legion.count - n0;
      Math.random = rnd; app.exitRun(); return out;
    };
    const kill = (r, e, source) => { e.hp = 1; r.enemies.damage(e, 5, { source, silent: true }); };
    return {
      // marked then slain by a minion: rises (0.25 × 2 > 0.4)
      liora: rises('liora', (r, spawn) => { const e = spawn(); r.enemies.damage(e, 1, { source: 'pulse', silent: true }); const marked = e.tollUid === e.uid; kill(r, e, 'minion'); return { marked }; }),
      // mark expired after 3 s: no rise
      lioraLate: rises('liora', (r, spawn) => { const e = spawn(); r.enemies.damage(e, 1, { source: 'pulse', silent: true }); r.time += 3.2; kill(r, e, 'minion'); return {}; }),
      // the pooled object comes back as a new enemy without the mark
      lioraPool: rises('liora', (r, spawn) => { const e = spawn(); r.enemies.damage(e, 1, { source: 'pulse', silent: true }); r.enemies.remove(e); r.enemies.compact(); const f = spawn(); kill(r, f, 'minion'); return { reused: e === f }; }),
      // another hero's pulse leaves no mark
      vaelPulse: rises('vael', (r, spawn) => { const e = spawn(); r.enemies.damage(e, 1, { source: 'pulse', silent: true }); const marked = e.tollUid === e.uid; kill(r, e, 'minion'); return { marked }; }),
      // mid-Nova kills: Seraphine 0.25 × 2 > 0.4 rises, Vael's halved 0.125 does not
      sera: rises('seraphine', (r, spawn) => { r.novaQueue = [{ x: 0, y: 0, z: 0, t: 99 }]; const e = spawn(); kill(r, e, 'nova'); return {}; }),
      vaelNova: rises('vael', (r, spawn) => { r.novaQueue = [{ x: 0, y: 0, z: 0, t: 99 }]; const e = spawn(); kill(r, e, 'nova'); return {}; }),
    };
  });
  check('liora: Grave Pulse marks foes, marked kills rise ×2 for 3 s', s.liora.marked && s.liora.rose === 1 && s.lioraLate.rose === 0, JSON.stringify(s));
  check('liora: the toll never leaks to recycled enemies or other heroes', s.lioraPool.reused && s.lioraPool.rose === 0 && !s.vaelPulse.marked && s.vaelPulse.rose === 0, JSON.stringify(s));
  check('seraphine: her Nova kills rise ×2 (others are halved mid-Nova)', s.sera.rose === 1 && s.vaelNova.rose === 0, JSON.stringify(s));
});
check('hero passives: no runtime errors', !errs.length, errs[0] || '');

// 17. Nightmare and Torment: per-chapter unlocks, run.diff scaling (horde HP, damage and spawns, extra elites, Gravemaw,
//     palette, HUD), rewards (gold, pass XP, one-time first-clear gems, the Hoard floor), records per difficulty,
//     old-save migration, late quests and the home-screen selector.
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const eco = await import('/src/meta/economy.js'), D = await import('/src/meta/difficulty.js'), { DIFFICULTY } = await import('/src/game/data.js');
    const app = window.__soulswarm, p = app.profile; app.engine.manual = true;
    p.flags.tutorialDone = true; p.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1 }; p.flags.bloodMoon = 'off';
    const out = { D: DIFFICULTY };
    const win = (ch, difficulty, extra = {}) => eco.applyRunResult(p, { chapter: ch, time: 400, kills: 2000, raised: 300, bestLegion: 120, novas: 5, gates: 8, victory: true, level: 20, bonusGold: 0, heroId: 'vael', endless: false, bossKills: 0, chests: 6, elites: 6, evolutions: 0, difficulty, ...extra });
    const runAt = (ch, opts) => { if (app.run) app.exitRun(); p.energy = 30; const ok = app.startRun(ch, opts); if (!ok) return null; const r = app.run; r.player.hurt = () => {}; return r; };
    // unlocks: Nightmare after a Normal clear of that chapter, Torment after a Nightmare clear; a Nightmare clear never moves chapter unlocks
    const e0 = p.energy;
    out.unlock = { fresh: D.difficultyUnlocked(p, 1, 'nightmare'), startLocked: app.startRun(1, { difficulty: 'nightmare' }), energyKept: p.energy === e0 };
    win(1, 'normal');
    out.unlock.afterNormal = [D.difficultyUnlocked(p, 1, 'nightmare'), D.difficultyUnlocked(p, 1, 'torment'), D.difficultyUnlocked(p, 2, 'nightmare')];
    win(1, 'nightmare');
    out.unlock.afterNightmare = [D.difficultyUnlocked(p, 1, 'torment'), p.chapter.unlocked, D.highestCleared(p, 1)];
    // Endless and the Daily Trial stay Normal; a default run is Normal and run.diff is the identity
    const t = runAt(0, { trial: true, difficulty: 'nightmare' });
    out.modes = { trial: t && t.diff.id };
    p.chapter.unlocked = 6; p.chapter.best[6] = { time: 900, cleared: true, kills: 0 };
    out.modes.endlessOpen = D.difficultyUnlocked(p, 6, 'nightmare'); out.modes.endlessStart = !!runAt(6, { difficulty: 'nightmare' });
    out.modes.endless = runAt(6, {}).diff.id;
    const n = runAt(1, {}).diff;
    out.identity = { id: n.id, hp: n.hp, ramp: n.ramp, xp: n.xp, bossHp: n.bossHp, dmg: n.dmg, spawn: n.spawn, extraElites: n.extraElites, eliteAffixes: n.eliteAffixes, gold: n.gold, passXp: n.passXp, firstClearGems: n.firstClearGems, hoard: n.hoard, tint: n.tint };
    // run scaling on Chapter 2 at 3:20 (past the HP ramp): a Brute's HP and damage, the director's spawn accrual, elites, Gravemaw and
    // an arena add, the sky; plus a Brute at 0:00 (the ramp starts at Normal HP)
    p.chapter.best[2] = { time: 420, cleared: true, kills: 0 }; p.diff.best[2] = { nightmare: { time: 420, legion: 0, kills: 0, cleared: true } };
    const probe = (difficulty, bm) => {
      p.flags.bloodMoon = bm ? 'on' : 'off';
      const r = runAt(2, { difficulty }); const e0 = r.spawnEnemy('brute', { at: { x: r.player.x + 9, z: r.player.z + 2 } }); r.time = 200;
      const e = r.spawnEnemy('brute', { at: { x: r.player.x + 9, z: r.player.z } });
      r.nextGate = r.nextSwarm = 1e9; r.eliteIdx = 99; r.modBannerAt = r.trialBannerAt = 0; r.spawnAcc = 0; r.director(0.02);
      const acc = r.spawnAcc, hp = e.maxHp, dmg = e.dmg;
      r.enemies.kill(e, 'bolt'); const shard = r.pickups.gems[r.pickups.gems.length - 1].value; // a Brute's 4 XP × diff.xp
      r.boss.spawn(); r.bossSpawned = true; const b = r.bossEnemy;
      const add = r.spawnEnemy('brute', { at: { x: r.player.x - 9, z: r.player.z } }); // an arena add has Normal HP
      p.flags.bloodMoon = 'off';
      return { id: r.diff.id, affixes: r.diff.eliteAffixes, hp, dmg, shard, acc, elites: r.eliteTimes.length, bossHp: b.maxHp, bossDmg: b.dmg, addHp: add.maxHp, hp0: e0.maxHp, sky: '#' + r.scene.background.getHexString(), badge: document.querySelector('.hud-diff')?.textContent || '' };
    };
    out.probe = { normal: probe('normal'), nightmare: probe('nightmare'), torment: probe('torment'), bmNormal: probe('normal', true), bmNightmare: probe('nightmare', true) };
    // the run-start banner names the difficulty
    const rb = runAt(1, { difficulty: 'nightmare' }); rb.time = 3.5; for (let i = 0; i < 8; i++) rb.update(1 / 30);
    out.banner = { title: document.querySelector('.banner b')?.textContent, cls: document.querySelector('.banner')?.className };
    app.exitRun();
    // rewards on Chapter 3 (cleared on Normal): gold ×1.75 / ×2.5, pass XP ×1.5 / ×2, first-clear gems once; account XP stays at the Normal amount
    p.chapter.best[3] = { time: 420, cleared: true, kills: 0 };
    const accXp = () => { let x = p.xp; for (let l = 1; l < p.level; l++) x += eco.accountXpFor(l); return x; };
    const rw = (difficulty, extra) => { const a0 = accXp(), o = win(3, difficulty, extra); return { gold: o.rewards.gold, gems: o.rewards.gems, xp: o.rewards.passXp, acc: accXp() - a0, first: o.firstClear, sigils: o.rewards.sigils || 0, rewards: o.rewards }; };
    const nr = rw('normal'), nm1 = rw('nightmare'), nm2 = rw('nightmare'), tm1 = rw('torment'), tm2 = rw('torment');
    const g0 = p.gems; eco.doubleRunRewards(p, nm1.rewards); const doubled = p.gems - g0;
    p.chapter.best[4] = { time: 420, cleared: true, kills: 0 };
    const bm = win(4, 'nightmare', { bloodMoon: true }).rewards.gems;
    for (const o of [nr, nm1, nm2, tm1, tm2]) delete o.rewards;
    out.rewards = { nr, nm1, nm2, tm1, tm2, doubled, bm };
    // Gravemaw's Hoard: Nightmare never drops below Rare, Torment never below Epic (Legendary kept rare)
    const hoard = (difficulty) => { const c = {}; for (let i = 0; i < 400; i++) { const it = win(3, difficulty).items.find((x) => x.kind === 'relic'); c[it.rarity] = (c[it.rarity] || 0) + 1; } return c; };
    out.hoard = { nightmare: hoard('nightmare'), torment: hoard('torment') };
    // records per difficulty: best time, best legion, kills and cleared; Normal's chapter record is left alone
    p.chapter.best[5] = { time: 420, cleared: true, kills: 2000 }; delete p.diff.best[5];
    const base = { chapter: 5, raised: 100, novas: 2, gates: 4, level: 15, bonusGold: 0, heroId: 'vael', endless: false, bossKills: 0 };
    const r1 = eco.applyRunResult(p, { ...base, time: 250, kills: 900, bestLegion: 95, victory: false, difficulty: 'nightmare' });
    const r2 = eco.applyRunResult(p, { ...base, time: 180, kills: 700, bestLegion: 140, victory: false, difficulty: 'nightmare' });
    eco.applyRunResult(p, { ...base, time: 300, kills: 1200, bestLegion: 60, victory: false, difficulty: 'normal' });
    out.records = { nm: p.diff.best[5].nightmare, normal: p.diff.best[5].normal, chapter: p.chapter.best[5], newBest: [r1.newBest, r2.newBest], highest: D.highestCleared(p, 5) };
    // quests: late-gated, and they count Nightmare clears and elites
    const pool = new Set(); for (let d = 1; d <= 28; d++) for (const id of eco.pickQuests({ chapter: { unlocked: 1 } }, `2026-12-${String(d).padStart(2, '0')}`)) pool.add(id);
    p.quests = { day: p.quests.day, progress: {}, claimed: [], ids: ['nmClear', 'nmElite', 'kill', 'raise', 'gate'] };
    win(3, 'torment');
    out.quests = { earlyPool: [...pool].filter((id) => id.startsWith('nm')), done: eco.questList(p).filter((q) => q.done).map((q) => q.id) };
    return out;
  });
  const { unlock: u, modes, identity, probe: P, banner, rewards: R, hoard, records: rec, quests, D: { nightmare: NM, torment: TM } } = s;
  const near = (got, want) => got.every((g, i) => Math.abs(g - want[i]) < 0.011); // ratios rounded to 2 decimals
  check('difficulty: Nightmare opens with a Normal clear, Torment with a Nightmare clear (per chapter)',
    !u.fresh && u.startLocked === false && u.energyKept && u.afterNormal.join() === 'true,false,false' && u.afterNightmare.join() === 'true,2,nightmare', JSON.stringify(u));
  check('difficulty: Endless Abyss and the Daily Trial always play Normal', modes.trial === 'normal' && !modes.endlessOpen && !modes.endlessStart && modes.endless === 'normal', JSON.stringify(modes));
  check('difficulty: run.diff always defined, Normal is the identity', JSON.stringify(identity) === JSON.stringify({ id: 'normal', hp: 1, ramp: 0, xp: 1, bossHp: 1, dmg: 1, spawn: 1, extraElites: 0, eliteAffixes: 0, gold: 1, passXp: 1, firstClearGems: 0, hoard: null, tint: null }), JSON.stringify(identity));
  const ratio = (k, d) => Math.round(P[d][k] / P.normal[k] * 100) / 100;
  const sc = { hp: [ratio('hp', 'nightmare'), ratio('hp', 'torment')], dmg: [ratio('dmg', 'nightmare'), ratio('dmg', 'torment')], spawn: [ratio('acc', 'nightmare'), ratio('acc', 'torment')], affixes: [P.normal.affixes, P.nightmare.affixes, P.torment.affixes] };
  sc.hp0 = [ratio('hp0', 'nightmare'), ratio('hp0', 'torment')]; sc.xp = [ratio('shard', 'nightmare'), ratio('shard', 'torment')];
  check('difficulty: enemy HP (after its ramp), damage, spawn rate and shard XP scale by run.diff (Nightmare, Torment)',
    near(sc.hp, [NM.hp, TM.hp]) && sc.hp0.join() === '1,1' && NM.ramp > 0 && near(sc.xp, [NM.xp, TM.xp]) && near(sc.dmg, [NM.dmg, TM.dmg]) && near(sc.spawn, [NM.spawn, TM.spawn]) && sc.affixes.join() === `0,${NM.eliteAffixes},${TM.eliteAffixes}` && NM.hp > 1 && TM.hp > NM.hp, JSON.stringify(sc));
  const el = [P.normal.elites, P.nightmare.elites, P.torment.elites, P.bmNormal.elites, P.bmNightmare.elites];
  check('difficulty: extra elites join the schedule (Blood Moon stacks on top)', el.join() === [4, 4 + NM.extraElites, 4 + TM.extraElites, 8, 8 + NM.extraElites].join() && NM.extraElites > 0, JSON.stringify(el));
  const bs = { hp: [ratio('bossHp', 'nightmare'), ratio('bossHp', 'torment')], dmg: [ratio('bossDmg', 'nightmare'), ratio('bossDmg', 'torment')], adds: [ratio('addHp', 'nightmare'), ratio('addHp', 'torment')] };
  check('difficulty: Gravemaw HP and damage scale; his arena adds keep Normal HP', near(bs.hp, [NM.bossHp, TM.bossHp]) && near(bs.dmg, [NM.dmg, TM.dmg]) && bs.adds.join() === '1,1' && NM.bossHp > 1, JSON.stringify(bs));
  const look = { skies: [P.normal.sky, P.nightmare.sky, P.torment.sky, P.bmNormal.sky, P.bmNightmare.sky], badges: [P.normal.badge, P.nightmare.badge, P.torment.badge], banner };
  check('difficulty: tinted palette (over Blood Moon too), HUD badge and run-start banner',
    new Set(look.skies).size === 5 && look.badges.join() === ',Nightmare,Torment' && banner.title === 'NIGHTMARE' && /diff-nightmare/.test(banner.cls), JSON.stringify(look));
  const rr = (a, b) => Math.round(a / b * 100) / 100;
  const mul = { gold: [rr(R.nm1.gold, R.nr.gold), rr(R.tm1.gold, R.nr.gold)], xp: [rr(R.nm1.xp, R.nr.xp), rr(R.tm1.xp, R.nr.xp)], acc: [R.nr.acc, R.nm1.acc, R.tm1.acc] };
  check('difficulty rewards: gold and pass XP multiplied (×1.75 / ×2.5, ×1.5 / ×2); account XP unchanged',
    near(mul.gold, [NM.gold, TM.gold]) && near(mul.xp, [NM.passXp, TM.passXp]) && NM.gold === 1.75 && TM.gold === 2.5 && NM.passXp === 1.5 && TM.passXp === 2 && mul.acc[0] === R.nr.xp && mul.acc[1] === R.nr.xp && mul.acc[2] === R.nr.xp, JSON.stringify(mul));
  const gems = { normal: R.nr.gems, nm: [R.nm1.gems, R.nm2.gems, R.nm1.first, R.nm2.first], tm: [R.tm1.gems, R.tm2.gems, R.tm1.first, R.tm2.first], sigils: [R.nm1.sigils, R.tm1.sigils], doubled: R.doubled, bm: R.bm };
  check('difficulty rewards: first-clear gems (+60 / +120) once per chapter and difficulty, never doubled',
    gems.normal === 16 && gems.nm.join() === `${16 + NM.firstClearGems},16,true,false` && gems.tm.join() === `${16 + TM.firstClearGems},16,true,false` && NM.firstClearGems === 60 && TM.firstClearGems === 120
    && gems.sigils.join() === '0,0' && gems.doubled === 16 && gems.bm === 36 + NM.firstClearGems, JSON.stringify(gems));
  const hn = hoard.nightmare, ht = hoard.torment;
  check('difficulty rewards: Hoard floor (Nightmare Rare+ with ~40% Epic, Torment Epic+ with a rare Legendary)',
    !hn.common && !hn.legendary && hn.epic / 400 > 0.3 && hn.epic / 400 < 0.5 && !ht.common && !ht.rare && ht.epic > 360 && (ht.legendary || 0) <= 24, JSON.stringify(hoard));
  check('difficulty records: best time, legion and kills per difficulty; Normal chapter record untouched',
    JSON.stringify(rec.nm) === JSON.stringify({ time: 250, legion: 140, kills: 900, cleared: false }) && rec.normal.time === 300 && rec.normal.legion === 60 && rec.normal.cleared
    && rec.chapter.time === 420 && rec.chapter.kills === 2000 && rec.newBest.join() === 'true,false' && rec.highest === 'normal', JSON.stringify(rec));
  check('difficulty quests: Nightmare quests are late-gated and count Nightmare+ clears and elites', !quests.earlyPool.length && quests.done.includes('nmClear') && quests.done.includes('nmElite'), JSON.stringify(quests));

  // an old-format save (no difficulty block) loads, seeds Normal records from the chapter records and plays a Nightmare run
  const m = await page.evaluate(async () => {
    const save = await import('/src/meta/save.js'), eco = await import('/src/meta/economy.js'), D = await import('/src/meta/difficulty.js');
    const old = { v: 1, gold: 4321, gems: 99, selectedHero: 'vael', chapter: { unlocked: 3, selected: 2, best: { 1: { time: 431, cleared: true, kills: 2100 }, 2: { time: 250, cleared: false, kills: 800 } } },
      heroes: { vael: { owned: true, stars: 2, shards: 3 } }, quests: { day: '2026-01-01', progress: {}, claimed: [] } };
    localStorage.setItem('soulswarm.save.v1', JSON.stringify(old));
    const q = save.loadProfile();
    const out = { gold: q.gold, block: !!q.diff && typeof q.diff.sel === 'object' && typeof q.diff.best === 'object', n1: q.diff.best[1]?.normal, n2: q.diff.best[2]?.normal,
      open: [D.difficultyUnlocked(q, 1, 'nightmare'), D.difficultyUnlocked(q, 2, 'nightmare'), D.difficultyUnlocked(q, 1, 'torment')], sel: D.selectedDifficulty(q, 1) };
    const o = eco.applyRunResult(q, { chapter: 1, time: 400, kills: 1800, raised: 200, bestLegion: 110, novas: 4, gates: 8, victory: true, level: 20, bonusGold: 0, heroId: 'vael', endless: false, bossKills: 0, difficulty: 'nightmare' });
    out.played = { first: o.firstClear, gems: o.rewards.gems, cleared: q.diff.best[1].nightmare.cleared, torment: D.difficultyUnlocked(q, 1, 'torment') };
    localStorage.removeItem('soulswarm.save.v1');
    return out;
  });
  const NM60 = s.D.nightmare.firstClearGems;
  check('difficulty: an old save without the block migrates and plays Nightmare',
    m.gold === 4321 && m.block && m.n1?.cleared && m.n1?.time === 431 && m.n2?.time === 250 && !m.n2?.cleared && m.open.join() === 'true,false,false' && m.sel === 'normal'
    && m.played.first && m.played.gems === 12 + NM60 && m.played.cleared && m.played.torment, JSON.stringify(m));

  // the home-screen selector: locks, remembered choice per chapter, BATTLE starts it; HUD, pause and results show it
  const ui = await page.evaluate(async () => {
    // app.meta.refresh() re-renders from the live profile (a test-side import of economy.js can be a separate module instance)
    const app = window.__soulswarm, p = app.profile, q = (sel) => document.querySelector(sel);
    if (app.run) app.exitRun();
    document.querySelectorAll('.modal-back, .toast').forEach((x) => x.remove());
    Object.assign(p.chapter, { unlocked: 3, selected: 1, best: { 1: { time: 420, cleared: true, kills: 2000 } } }); p.diff = { sel: {}, best: {} }; p.energy = 30;
    app.meta.show('battle');
    const seg = () => [...document.querySelectorAll('.dsel-b')].map((b) => b.dataset.d + (b.classList.contains('on') ? '*' : '') + (b.classList.contains('lk') ? '!' : '')).join(',');
    const out = { initial: seg() };
    q('.dsel-b[data-d="torment"]').click();
    out.lockedTap = seg(); out.toast = [...document.querySelectorAll('.toast')].pop()?.textContent || '';
    q('.dsel-b[data-d="nightmare"]').click();
    out.picked = seg(); out.sel = p.diff.sel[1]; out.battle = q('.btn-battle').classList.contains('d-nightmare');
    q('.chap [data-act="next"]').click(); out.ch2 = seg();
    q('.chap [data-act="prev"]').click(); out.back = seg();
    p.chapter.selected = 6; p.chapter.unlocked = 6; app.meta.refresh(); out.endless = document.querySelectorAll('.dsel').length;
    p.chapter.unlocked = 3; p.chapter.selected = 4; app.meta.refresh(); out.locked = document.querySelectorAll('.dsel').length;
    p.chapter.selected = 1; app.meta.refresh();
    const e0 = p.energy; q('.btn-battle').click();
    const r = app.run; out.started = { diff: r && r.diff.id, energy: e0 - p.energy, badge: q('.hud-diff')?.textContent };
    r.player.hurt = () => {};
    r.pause(true); out.pause = q('.modal .pill-diff')?.textContent || '';
    q('.modal .btn-primary').click();
    r.end(true);
    await new Promise((res) => setTimeout(res, 600));
    out.results = q('.res-badges .pill-diff')?.textContent || '';
    q('.modal .btn-primary')?.click();
    await new Promise((res) => setTimeout(res, 300));
    out.after = { menu: !app.meta.el.hidden, sel: seg(), cleared: !!p.diff.best[1]?.nightmare?.cleared };
    return out;
  });
  check('difficulty UI: selector shows locks, a locked tap explains, the choice is remembered per chapter',
    ui.initial === 'normal*,nightmare,torment!' && ui.lockedTap === ui.initial && /Nightmare/.test(ui.toast) && ui.picked === 'normal,nightmare*,torment!' && ui.sel === 'nightmare' && ui.battle
    && ui.ch2 === 'normal*,nightmare!,torment!' && ui.back === ui.picked && ui.endless === 0 && ui.locked === 0, JSON.stringify(ui));
  check('difficulty UI: BATTLE starts the chosen difficulty; HUD, pause and results show it',
    ui.started.diff === 'nightmare' && ui.started.energy === 5 && ui.started.badge === 'Nightmare' && /Nightmare/.test(ui.pause) && /Nightmare/.test(ui.results)
    && ui.after.menu && ui.after.cleared && ui.after.sel === 'normal,nightmare*,torment', JSON.stringify(ui));
});
check('difficulty: no runtime errors', !errs.length, errs[0] || '');

await browser.close();
if (server) server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
