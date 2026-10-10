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

// 1. Boot + menu
let errs = await session(async (page) => {
  const ok = await page.evaluate(() => !!document.querySelector('.btn-battle') && !!window.__soulswarm.engine);
  check('boots to the home screen', ok);
});
check('no errors on boot', !errs.length, errs[0] || '');

// 2. Every hero survives a minute and grows a legion
for (const hero of ['vael', 'nyx', 'seraphine', 'liora', 'grimsby', 'mordrake', 'osric']) {
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
  // The victory beat needs 3.2 s of real frame time, and rendered frames add at most 0.1 s each, so a loaded
  // software-GL machine can stretch it past any timeout. Step it here instead (picking any open card, as the bot
  // does) and report the run state if it still hasn't ended.
  const beat = await page.evaluate(() => {
    const app = window.__soulswarm, r = app.run;
    if (!r) return { run: false };
    app.engine.manual = true;
    for (let i = 0; i < 160 && !r.ended; i++) {
      if (r.levelPending) document.querySelector('.lvl-back .card')?.click();
      r.update(0.05);
    }
    return { ended: r.ended, bossDead: r.bossDead, paused: r.paused, levelPending: r.levelPending, beat: r.victory ? +r.victory.t.toFixed(2) : null };
  });
  const head = await page.waitForFunction(() => document.querySelector('.res-head b')?.textContent, null, { timeout: 15000 })
    .then((x) => x.jsonValue()).catch(() => null);
  check('chapter 1: victory screen', head === 'VICTORY', `${head} ${JSON.stringify(beat)}`);
  await page.evaluate(() => { window.__soulswarm.engine.manual = false; document.querySelector('.modal .btn-primary')?.click(); });
  await page.waitForFunction(() => !window.__soulswarm.run && !window.__soulswarm.meta.el.hidden, null, { timeout: 15000 }).catch(() => {});
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
    const novas = r.counters.novas; // the tap; the blast (and its whiteout) lands after the 0.25 s wind-up
    let white = 0; for (let i = 0; i < 10; i++) { app.engine.step(1 / 30); white = Math.max(white, app.engine.post.uWhite.value); }
    return { novas, released: r.fx.white > 0.5, white, lefty: app.runUI.el.classList.contains('lefty'), flash: app.engine.post.uFlash.value.w };
  });
  check('accessibility: auto-nova, left-handed, reduced flashes', s.novas === 1 && s.released && s.white <= 0.15 && s.lefty && s.flash <= 0.2, JSON.stringify(s));
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
    prof.flags.tutorialDone = true; prof.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1 }; prof.flags.bloodMoon = 'off'; // a weekend Blood Moon would double the elites
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
  check('horde: Ch4 vignette tightens, restored after', vignette.during > 1.1 && Math.abs(vignette.after - 1.0) < 1e-6, JSON.stringify(vignette));
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
    delete p.flags.bloodMoon; // the calendar decides here (session() pins it off for every other test)
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
    const teles = [B.ring.tele, B.spiral.tele, B.summon.tele, B.waves.tele, ...B.phases.map((p) => p.slamTele),
      B.rain.flight, B.lances.tele, B.smite.tele, B.fan.windup].map((x) => Math.max(B.minTele, x));
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

// 17. Kill streaks and game feel (GDD §4.7): every kill chains the streak until its window lapses; tiers start a Soul Frenzy
//     (XP and minion attack speed, Nova charge banked mid-detonation) that expires; the best streak reaches the results and
//     the profile; an elite kill dips the time scale (on top of slow-mo, HUD still ticking) and it recovers; the Nova wind-up
//     holds the chain while invulnerability and shot-clearing are immediate; overflow fades to the cap; level-up vacuum.
//     Frame-stepped in a quiet arena (no director, no weapons); raise rolls pinned off where they would add minions.
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const app = window.__soulswarm, p = app.profile;
    p.flags.tutorialDone = true; p.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1 }; p.settings.shake = 1;
    app.engine.manual = true;
    const start = () => {
      if (app.run) app.exitRun();
      document.querySelectorAll('.modal-back, .lvl-back').forEach((n) => n.remove());
      p.energy = 30; app.startRun(1);
      const r = app.run; r.player.hurt = () => {}; r.director = () => {}; r.weapons.update = () => {}; r.stats.raise = 0;
      return r;
    };
    const step = (r, sec) => { for (let i = 0; i < Math.round(sec * 30); i++) r.update(1 / 30); };
    const SRC = ['bolt', 'minion', 'nova', 'soulbomb'];
    const kill = (r, n, elite = false) => {
      for (let i = 0; i < n; i++) { const e = r.enemies.spawn('husk', r.player.x + 25, r.player.z, { hpMul: 1, elite }); r.enemies.damage(e, 1e9, { source: SRC[i % 4], silent: true }); }
      r.enemies.compact();
    };
    const out = {};

    // tiers and Soul Frenzy: 29 kills (any source) is no tier, 30 is CARNAGE; the bonuses act; 75 is MASSACRE; it expires
    let r = start(), S = r.streak, P = r.player;
    kill(r, 29); out.t0 = { n: S.n, tier: S.tier, frenzy: S.frenzy };
    kill(r, 1);
    r.xpNeed = 1e9; const xp0 = r.xp; r.addXp(10);
    const m = r.legion.raise(P.x + 30, P.z, { fx: false }); m.atkCd = 1; r.legion.update(0.1);
    out.t1 = { n: S.n, tier: S.tier, frenzy: S.frenzy, xp: +(r.xp - xp0).toFixed(3), atk: +(1 - m.atkCd).toFixed(3) };
    r.update(1 / 30); r.update(1 / 30);
    out.call = document.querySelector('.stk-call b')?.textContent || '';
    out.hudOn = document.querySelector('.stk-c')?.classList.contains('on');
    kill(r, 45); out.t2 = { n: S.n, tier: S.tier, frenzy: S.frenzy, xpMul: S.xpMul, haste: S.haste };
    step(r, 8.5);
    out.expired = { n: S.n, lastN: S.lastN, frenzy: S.frenzy, xpMul: S.xpMul, haste: S.haste, best: r.counters.bestStreak };

    // the window: a kill just inside it chains, then the streak breaks once it lapses (and the counter fades)
    r = start(); S = r.streak;
    kill(r, 12); const w = S.win;
    step(r, w - 0.1); kill(r, 1); const chained = S.n;
    step(r, 0.1); const hudLive = document.querySelector('.stk-c').classList.contains('on');
    step(r, S.win + 0.1);
    out.window = { w: +w.toFixed(3), chained, after: S.n, lastN: S.lastN, breaks: S.breaks, hudLive, hudBroken: document.querySelector('.stk-c').classList.contains('broken') };

    // top tiers add Nova charge, banked while a detonation runs (nothing charges mid-detonation) and paid when it ends
    r = start(); S = r.streak; r.nova = 0;
    r.novaQueue = [{ x: 0, y: 0, z: 0, t: 99 }];
    kill(r, 150); out.bank = { tier: S.tier, nova: r.nova, bank: S.novaBank };
    r.novaQueue.length = 0; r.update(1 / 30);
    out.bank.paid = Math.round(r.nova * 300 / r.stats.novaMul);

    // best streak: run result, results screen row and the profile record
    r = start(); p.stats.bestStreak = 0;
    kill(r, 160); step(r, 2); kill(r, 20);
    let res = null; const onEnd = r.onEnd; r.onEnd = (x) => { res = x; onEnd(x); };
    r.end(false);
    await new Promise((ok) => setTimeout(ok, 900));
    out.best = { counter: r.counters.bestStreak, result: res && res.bestStreak, profile: p.stats.bestStreak,
      row: document.querySelector('.res-streak b')?.textContent, tier: document.querySelector('.res-streak span')?.textContent, record: !!document.querySelector('.res-streak .pill') };
    // an old save without the field still loads (migrated to 0)
    const save = await import('/src/meta/save.js');
    const old = save.newProfile(); delete old.stats.bestStreak;
    localStorage.setItem('soulswarm.save.v1', JSON.stringify(old));
    out.best.migrated = save.loadProfile().stats.bestStreak;

    // hit-stop: an elite kill dips the time scale, sim time crawls while the HUD keeps ticking, then it recovers
    r = start(); step(r, 0.3);
    const F = r.fx, ts0 = F.timeScale();
    kill(r, 1, true); kill(r, 5);
    const dip = F.timeScale(), t0 = r.time;
    r.update(1 / 30); r.update(1 / 30);
    const crawl = r.time - t0, hudKills = document.querySelector('.hud-stat.k span').textContent;
    let frames = 2; while (F.timeScale() < 1 && frames < 30) { r.update(1 / 30); frames++; }
    out.hit = { ts0, dip: +dip.toFixed(3), crawl: +crawl.toFixed(4), hudKills, kills: r.counters.kills, frames, after: F.timeScale() };
    F.slowMo(0.3, 1); kill(r, 1, true);
    out.hit.inSlow = +F.timeScale().toFixed(4);
    for (let i = 0; i < 6; i++) r.update(1 / 30);
    out.hit.slowAfter = +F.timeScale().toFixed(3);
    p.settings.shake = 0; kill(r, 1, true); out.hit.shakeOff = F.timeScale(); p.settings.shake = 1;

    // Nova wind-up: invulnerable, shots cleared and the legion committed on the tap; the blast and chain wait ~0.25 s
    r = start(); P = r.player;
    r.legion.addMany(40, P.x, P.z); step(r, 0.5);
    const tough = r.enemies.spawn('husk', P.x + 3, P.z, { hpMul: 1e5 }); tough.speed = 0; // inside the 7 m blast, not yet engaged
    r.projectiles.enemyShot(P.x + 8, P.z, -1, 0, 4, 10);
    P.invuln = 0; r.nova = 1; const hp0 = tough.hp, tap = r.time;
    r.triggerNova();
    const atTap = { invuln: +P.invuln.toFixed(2), shots: r.projectiles.embers.length, legion: r.legion.count, queued: r.novaQueue.length, hurt: hp0 - tough.hp };
    step(r, 0.2); const mid = { hurt: hp0 - tough.hp, queued: r.novaQueue.length };
    let hitAt = -1; for (let i = 0; i < 30 && hitAt < 0; i++) { r.update(1 / 30); if (tough.hp < hp0) hitAt = r.time - tap; }
    step(r, 1.5);
    out.nova = { atTap, mid, hitAt: +hitAt.toFixed(3), done: r.novaQueue.length, big: document.querySelector('.bignum b')?.textContent || '' };

    // overflow: 100 over the cap holds through the grace, then fades toward the cap (never below; Champions spared);
    // a gate that adds souls restarts the grace
    r = start(); P = r.player; r.stats.cap = 30;
    const champ = r.legion.raise(P.x, P.z, { kind: 'brute', elite: true, fx: false });
    r.legion.addMany(129, P.x, P.z);
    step(r, 14); const grace = r.legion.count, overHud = document.querySelector('.legion').classList.contains('over');
    step(r, 20); const mid2 = r.legion.count;
    r.legion.addMany(10, P.x, P.z); step(r, 2); const regate = r.legion.count; step(r, 10); const held = r.legion.count;
    step(r, 170);
    out.overflow = { grace, overHud, mid: mid2, regate, held, final: r.legion.count, champ: r.legion.list.includes(champ) };

    // level-up pulse: shards within 6 m fly in when the cards appear, farther ones stay
    r = start(); P = r.player; r.pickups.gems.length = 0;
    r.pickups.dropGem(P.x + 4.5, P.z, 1); r.pickups.dropGem(P.x - 9, P.z, 1);
    const [g1, g2] = r.pickups.gems; g1.vx = g1.vz = g2.vx = g2.vz = 0;
    r.levelQueue = 1; r.showLevelUp();
    out.vacuum = { near: g1.pulled, far: g2.pulled, cards: document.querySelectorAll('.lvl-back .card').length };
    app.exitRun();
    return out;
  });
  const { t0, t1, t2, expired, window: W, bank, best, hit, nova, overflow, vacuum } = s;
  check('streak: every kill counts; 30 is CARNAGE with a Soul Frenzy (XP +10%, minions strike 10% faster)', t0.n === 29 && t0.tier === 0 && t1.n === 30 && t1.tier === 1 && t1.frenzy === 1 && t1.xp === 11 && t1.atk === 0.11 && s.call === 'CARNAGE' && s.hudOn, JSON.stringify({ t0, t1, call: s.call, hudOn: s.hudOn }));
  check('streak: 75 is MASSACRE; the Frenzy expires after 8 s', t2.tier === 2 && t2.frenzy === 2 && t2.xpMul === 1.15 && t2.haste === 1.2 && expired.n === 0 && expired.lastN === 75 && expired.frenzy === 0 && expired.xpMul === 1 && expired.haste === 1 && expired.best === 75, JSON.stringify({ t2, expired }));
  check('streak: a kill inside the window chains, then it breaks and the counter fades', W.w > 1 && W.w < 1.2 && W.chained === 13 && W.hudLive && W.after === 0 && W.lastN === 13 && W.breaks === 1 && W.hudBroken, JSON.stringify(W));
  check('streak: ANNIHILATION Nova charge is banked mid-detonation, paid after', bank.tier === 3 && bank.nova === 0 && bank.bank === 15 && bank.paid === 15, JSON.stringify(bank));
  check('streak: best streak reaches the result, results screen and profile (old saves migrate)', best.counter === 160 && best.result === 160 && best.profile === 160 && best.row === '160' && best.tier === 'ANNIHILATION' && best.record && best.migrated === 0, JSON.stringify(best));
  check('hit-stop: an elite kill dips the time scale, the HUD keeps ticking, then it recovers', hit.ts0 === 1 && hit.dip < 0.1 && hit.crawl < 0.01 && hit.hudKills === String(hit.kills) && hit.frames <= 4 && hit.after === 1, JSON.stringify(hit));
  check('hit-stop: composes with slow-mo (and is off with screen shake at 0)', hit.inSlow < 0.03 && hit.slowAfter === 0.3 && hit.shakeOff === 0.3, JSON.stringify(hit));
  check('nova: wind-up holds the blast ~0.25 s; invulnerable, shots cleared and legion committed on the tap', nova.atTap.invuln >= 1.5 && nova.atTap.shots === 0 && nova.atTap.legion === 0 && nova.atTap.queued === 41 && nova.atTap.hurt === 0 && nova.mid.hurt === 0 && nova.mid.queued === 41 && nova.hitAt >= 0.25 && nova.hitAt < 0.3 && nova.done === 0 && nova.big === '40 SOULS', JSON.stringify(nova));
  check('overflow: holds through the grace, fades to the cap (not below), gates restart the grace', overflow.grace === 130 && overflow.overHud && overflow.mid < 120 && overflow.mid > 60 && overflow.held === overflow.regate && overflow.final === 30 && overflow.champ, JSON.stringify(overflow));
  check('level-up: the pulse draws in shards within 6 m', vacuum.near && !vacuum.far && vacuum.cards === 3, JSON.stringify(vacuum));
});
check('streaks and game feel: no runtime errors', !errs.length, errs[0] || '');

// 18. Elite affixes and run events (affixes.js, events.js). Frame-stepped in a quiet arena: each affix's mechanic, the
//     affix count and banner, chests from affixed elites, the event schedule, each event end to end, hazard-free
//     placement and the off-screen arrow; then a bot plays Chapter 4 (two affixes per elite) to shake out errors.
const AFFIX_QA = `
window.__aq = (ch) => {
  const app = window.__soulswarm, prof = app.profile;
  if (app.run) app.exitRun();
  document.querySelectorAll('.modal-back, .lvl-back').forEach((n) => n.remove());
  app.engine.manual = true;
  prof.flags.tutorialDone = true; prof.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1 }; prof.energy = 30; prof.chapter.unlocked = 6; prof.flags.bloodMoon = 'off'; // (a weekend Blood Moon halves the Endless elite gap)
  app.startRun(ch);
  const r = app.run;
  r.spawnAcc = -1e9; r.nextGate = r.nextSwarm = 1e9; r.eliteIdx = 99; r.modBannerAt = 0;
  r.weapons.update = () => {}; r.player.hurt = () => {}; r.addXp = () => {}; r.input.tx = r.input.tz = 0;
  r.events.director = () => {}; // events start only when a check starts one
  return r;
};
window.__elite = (r, type, ids, dx, dz) => { const e = r.enemies.spawn(type, r.player.x + dx, r.player.z + dz, { elite: true, hpMul: 10 }); e.spawnT = 1; r.affixes.apply(e, ids); return e; };`;
errs = await session(async (page) => {
  await page.evaluate(BOSS_QA);
  await page.evaluate(AFFIX_QA);
  const a = await page.evaluate(() => {
    const rnd = Math.random, out = {}, step = (r, sec) => window.__step(r, sec);
    // Warded: the ward (35% of max HP) soaks 70% of each hit, then shatters into a stagger; afterwards hits land in full
    let r = window.__aq(1), e = window.__elite(r, 'brute', ['warded'], 0, -9);
    const ward0 = e.aff.ward, hp0 = e.hp;
    r.affixes.render(); const bubble = r.affixes.bubbles.mesh.count;
    r.enemies.damage(e, 100, { silent: true });
    const cut = { ward: +(ward0 - e.aff.ward).toFixed(2), hp: +(hp0 - e.hp).toFixed(2) };
    r.enemies.damage(e, ward0 * 2, { silent: true });
    const x0 = e.x, z0 = e.z; step(r, 0.5);
    const hp1 = e.hp; r.enemies.damage(e, 100, { silent: true });
    r.affixes.render();
    out.ward = { share: +(ward0 / e.maxHp).toFixed(3), cut, broken: e.aff.ward === 0, staggerMoved: +Math.hypot(e.x - x0, e.z - z0).toFixed(3), after: +(hp1 - e.hp).toFixed(2), bubble, bubbleAfter: r.affixes.bubbles.mesh.count };
    // Splitter: dies into 3-4 smaller, faster, non-elite copies with 0.9× a normal husk's HP; only the elite drops a chest
    r = window.__aq(1); e = window.__elite(r, 'husk', ['splitter'], 0, -8);
    const g0 = r.bonusGold, n0 = r.enemies.count, uid0 = e.uid;
    Math.random = () => 0.99; r.enemies.kill(e, 'bolt'); Math.random = () => 0.5; r.update(1 / 30); Math.random = rnd;
    const copies = r.enemies.active.filter((o) => o.active && o.uid !== uid0), added = r.enemies.count - (n0 - 1); // (a copy may reuse the pooled elite)
    const c0 = copies[0] || {};
    for (const o of copies) r.enemies.kill(o, 'bolt');
    out.split = { n: copies.length, added, elite: copies.some((o) => o.elite), hp: +(c0.maxHp / (14 * r.hpMul())).toFixed(2), speed: +(c0.speed / 2.4).toFixed(2), scale: +(c0.scale || 0).toFixed(2),
      chests: r.pickups.special.filter((p) => p.kind === 'chest').length, gold: r.bonusGold - g0 };
    // Vampiric: a death within 6 m heals 4% of max HP (once per 0.35 s); one farther away does not
    r = window.__aq(1); e = window.__elite(r, 'witch', ['vampiric'], 0, -8); e.speed = 0; e.hp = e.maxHp * 0.5;
    const die = (dx) => { const h = r.enemies.spawn('husk', e.x + dx, e.z, { hpMul: 1 }); r.enemies.kill(h, 'bolt'); };
    let v = e.hp; die(3); const near = (e.hp - v) / e.maxHp;
    v = e.hp; die(3); const cooldown = e.hp - v;
    r.affixes.list[0].vampT = -1e9; v = e.hp; die(9); const far = e.hp - v;
    out.vamp = { near: +near.toFixed(3), cooldown, far };
    // Hasted: +45% move speed, and it really closes the distance faster
    r = window.__aq(1);
    Math.random = () => 0.5;
    const plain = r.enemies.spawn('husk', r.player.x + 10, r.player.z, { elite: true, hpMul: 10 }), fast = r.enemies.spawn('husk', r.player.x - 10, r.player.z, { elite: true, hpMul: 10 });
    Math.random = rnd;
    plain.spawnT = fast.spawnT = 1; r.affixes.apply(fast, ['hasted']);
    step(r, 1);
    out.haste = { ratio: +(fast.speed / plain.speed).toFixed(3), closed: +((10 - Math.hypot(fast.x - r.player.x, fast.z - r.player.z)) / (10 - Math.hypot(plain.x - r.player.x, plain.z - r.player.z))).toFixed(2) };
    // Commander: foes inside its 6 m aura move and hit 25% harder; out of it (or once it dies) the buff drops, and its death routs them
    r = window.__aq(1); e = window.__elite(r, 'brute', ['commander'], 0, -10); e.speed = 0;
    const nr = r.enemies.spawn('husk', e.x + 3, e.z, { hpMul: 50 }), fr = r.enemies.spawn('husk', e.x + 12, e.z, { hpMul: 50 });
    const s0 = nr.speed, d0 = nr.dmg, f0 = fr.speed;
    r.update(1 / 30); r.affixes.render();
    const buffed = { speed: +(nr.speed / s0).toFixed(3), dmg: +(nr.dmg / d0).toFixed(3), far: +(fr.speed / f0).toFixed(3), ring: r.affixes.rings.mesh.count };
    nr.x = e.x + 20; r.update(1 / 30); const left = +(nr.speed / s0).toFixed(3);
    nr.x = e.x + 3; nr.z = e.z; r.update(1 / 30); const back = +(nr.speed / s0).toFixed(3);
    r.enemies.kill(e, 'bolt'); r.update(1 / 30);
    out.cmd = { buffed, left, back, after: { speed: +(nr.speed / s0).toFixed(3), dmg: +(nr.dmg / d0).toFixed(3) }, rout: nr.slowUid === nr.uid ? nr.slowMul : -1, shoved: +Math.hypot(nr.kx, nr.kz).toFixed(1) };
    // affixed elites still drop their Relic Chest (+40 gold per affix); a coffin's mini-elite drops none; Champions carry no affix
    r = window.__aq(1); r.stats.raise = 1;
    e = window.__elite(r, 'husk', ['warded', 'vampiric'], 0, -6);
    const gc = r.bonusGold; r.enemies.kill(e, 'bolt');
    const champ = r.legion.list[r.legion.list.length - 1];
    const m = r.enemies.spawn('husk', r.player.x, r.player.z - 6, { elite: true, hpMul: 1 }); r.affixes.roll(m, 1, { noChest: true }); r.enemies.kill(m, 'bolt');
    out.chest = { chests: r.pickups.special.filter((p) => p.kind === 'chest').length, gold: r.bonusGold - gc - 40, champ: !!champ && champ.champ && !champ.aff, elites: r.counters.elites };
    // how many: 1 affix (Ch1), 2 from Chapter 4 and in Endless, plus run.diff.eliteAffixes; the banner names them
    const count = {};
    for (const ch of [1, 3, 4, 5, 6]) { r = window.__aq(ch); r.affixes.roll(r.spawnEnemy('brute', { elite: true })); count[ch] = r.affixes.list[0].ids.length; }
    r = window.__aq(1); r.diff = { eliteAffixes: 1 }; r.affixes.roll(r.spawnEnemy('brute', { elite: true })); count.diff = r.affixes.list[0].ids.length;
    r = window.__aq(1); r.tutorial = true; const tut = new Set();
    for (let i = 0; i < 20; i++) { const t = r.spawnEnemy('husk', { elite: true }); r.affixes.roll(t); for (const id of t.aff.ids) tut.add(id); r.enemies.remove(t); }
    r = window.__aq(1); r.eliteIdx = 0; r.time = 75; r.director(0);
    const first = r.enemies.active.find((o) => o.elite);
    out.count = { count, tutorial: [...tut].sort().join(), banner: document.querySelector('.banner b')?.textContent, ids: first && first.aff ? first.aff.ids : null };
    return out;
  });
  check('affix warded: the ward soaks 70% until it breaks, then a stagger and full hits', a.ward.share === 0.35 && Math.abs(a.ward.cut.ward - 70) < 0.01 && Math.abs(a.ward.cut.hp - 30) < 0.01 && a.ward.broken && a.ward.staggerMoved < 0.05 && Math.abs(a.ward.after - 100) < 0.01 && a.ward.bubble === 1 && a.ward.bubbleAfter === 0, JSON.stringify(a.ward));
  check('affix splitter: dies into 3-4 smaller, faster, chest-less copies', a.split.n === 4 && a.split.added === 4 && !a.split.elite && a.split.hp === 0.9 && a.split.speed === 1.35 && a.split.scale < 1 && a.split.chests === 1 && a.split.gold === 40, JSON.stringify(a.split));
  check('affix vampiric: a death within 6 m heals 4% (throttled), farther does not', a.vamp.near === 0.04 && a.vamp.cooldown === 0 && a.vamp.far === 0, JSON.stringify(a.vamp));
  check('affix hasted: +45% move speed', a.haste.ratio === 1.45 && a.haste.closed > 1.3, JSON.stringify(a.haste));
  check('affix commander: +25% speed and damage in its aura, dropped outside and on its death (rout)', a.cmd.buffed.speed === 1.25 && a.cmd.buffed.dmg === 1.25 && a.cmd.buffed.far === 1 && a.cmd.buffed.ring === 1 && a.cmd.left === 1 && a.cmd.back === 1.25 && a.cmd.after.speed === 1 && a.cmd.after.dmg === 1 && a.cmd.rout === 0.4 && a.cmd.shoved > 2, JSON.stringify(a.cmd));
  check('affixed elites drop their chest and bonus gold; mini-elites none; Champions carry no affix', a.chest.chests === 1 && a.chest.gold === 80 && a.chest.champ && a.chest.elites === 2, JSON.stringify(a.chest));
  check('affix count: 1, 2 from Ch4 and in Endless, +run.diff; banner names them', JSON.stringify(a.count.count) === JSON.stringify({ 1: 1, 3: 1, 4: 2, 5: 2, 6: 2, diff: 2 }) && a.count.tutorial === 'hasted,warded' && !!a.count.ids && / HUSK$/.test(a.count.banner || '') && a.count.banner.startsWith(a.count.ids[0].toUpperCase()), JSON.stringify(a.count));

  const b = await page.evaluate(() => {
    const out = {}, step = (r, sec) => window.__step(r, sec), app = window.__soulswarm;
    let seed = 20261007;
    Math.random = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    // the schedule: the real director from 0:00 to 6:00 with real gates, swarm rings and elites (recorded, not spawned)
    const schedule = (ch, tutorial) => {
      const r = window.__aq(ch); delete r.events.director;
      r.nextGate = 28; r.nextSwarm = 50; r.eliteIdx = 0; r.tutorial = tutorial;
      const T = { gate: [], swarm: [], elite: [], ev: [] };
      r.gates.spawnPair = () => T.gate.push(r.time); r.swarmRing = () => T.swarm.push(r.time);
      const sp = r.spawnEnemy.bind(r); r.spawnEnemy = (t, o = {}) => { if (o.elite) T.elite.push(r.time); return sp(t, o); };
      for (let t = 0; t < 359; t += 0.25) { r.time = t; r.director(0.25); if (r.events.cur) { T.ev.push(t); if (r.events.cur.e) r.enemies.remove(r.events.cur.e); r.events.cur = null; } }
      const gap = (L) => Math.min(...T.ev.map((t) => Math.min(...L.map((x) => Math.abs(x - t)))));
      return { ev: T.ev, gaps: T.ev.slice(1).map((t, i) => t - T.ev[i]), gate: gap(T.gate), elite: gap(T.elite), swarm: gap(T.swarm) };
    };
    out.ch1 = schedule(1, false); out.ch5 = schedule(5, false); out.tut = schedule(1, true);
    // Endless keeps rolling after 5:20 (once the depth banner has played); nothing starts in Gravemaw's fight
    let r = window.__aq(6); delete r.events.director;
    r.bossKills = 1; r.nextBossAt = 700; r.time = 400; r.events.nextAt = 0; r.director(0.1); const early = !!r.events.cur;
    r.time = 430; r.director(0.1); out.endless = { early, at430: r.events.cur ? r.events.cur.kind : null };
    r.events.start('shrine') || r.events.cur; r.bossSpawned = true; step(r, 1); out.endless.bossClears = !r.events.cur;
    // Soul Thief: it flees, the off-screen arrow points to it, a kill pays gold and an XP burst (no raise), an escape pays nothing
    r = window.__aq(1); const P = r.player;
    r.events.start('thief', { x: P.x + 5, z: P.z });
    const ev = r.events.cur, th = ev.e;
    const banner = document.querySelector('.banner b')?.textContent;
    step(r, 1.5); const fled = +Math.hypot(th.x - P.x, th.z - P.z).toFixed(2);
    th.x = P.x + 26; th.z = P.z; app.engine.step(1 / 30); const arrowOff = r.events.arrow.on, arrowX = Math.round(r.events.arrow.x);
    th.x = P.x + 2.5; th.z = P.z - 1; app.engine.step(1 / 30); const arrowOn = r.events.arrow.on;
    const gold0 = r.bonusGold, gems0 = r.pickups.gems.length, legion0 = r.legion.count;
    r.stats.raise = 0.85; r.enemies.damage(th, 1e9, { silent: true });
    const xp = r.pickups.gems.slice(gems0).reduce((s, g) => s + g.value, 0);
    out.thief = { banner, fled, arrowOff, arrowX, arrowOn, gold: r.bonusGold - gold0, gems: r.pickups.gems.length - gems0, xp, need: r.xpNeed, raised: r.legion.count - legion0, events: r.counters.events, kind: ev.kind };
    step(r, 1);
    r.events.start('thief', { x: P.x + 6, z: P.z }); const th2 = r.events.cur.e; th2.speed = 0; // pinned, so only the 18 s clock can end it
    let gone = -1; for (let i = 0; i < 30 * 20 && gone < 0; i++) { r.update(1 / 30); if (!th2.active) gone = r.events.cur ? r.events.cur.t : -2; }
    out.escape = { at: +gone.toFixed(2), banner: document.querySelector('.banner b')?.textContent, events: r.counters.events, gold: r.bonusGold - gold0 };
    return out;
  });
  const sched = (s) => s.ev.length >= 2 && s.ev.every((t) => t >= 60 && t <= 320) && s.gaps.every((g) => g >= 80) && s.gate >= 8 && s.elite >= 8 && s.swarm >= 5;
  check('events: 1:00-5:20, every 80 s+, clear of gate pairs, elites and swarm rings', sched(b.ch1) && sched(b.ch5), JSON.stringify({ ch1: b.ch1, ch5: b.ch5 }));
  check('events: none before 2:30 in the first run; Endless keeps rolling; the boss fight clears them', b.tut.ev.length >= 1 && b.tut.ev[0] >= 150 && !b.endless.early && !!b.endless.at430 && b.endless.bossClears, JSON.stringify({ tut: b.tut.ev, endless: b.endless }));
  check('event thief: banner, flees, off-screen arrow (and none on screen)', b.thief.banner === 'SOUL THIEF' && b.thief.fled > 6 && b.thief.arrowOff && b.thief.arrowX > 300 && !b.thief.arrowOn, JSON.stringify(b.thief));
  check('event thief: a kill pays gold and a big XP burst, no raise', b.thief.gold === 140 && b.thief.gems === 10 && b.thief.xp >= b.thief.need && b.thief.raised === 0 && b.thief.events === 1, JSON.stringify(b.thief));
  check('event thief: escapes after 18 s ("It got away"), paying nothing', Math.abs(b.escape.at - 18) < 0.1 && b.escape.banner === 'IT GOT AWAY' && b.escape.events === 1 && b.escape.gold === 140, JSON.stringify(b.escape));

  const c = await page.evaluate(() => {
    const out = {}, step = (r, sec) => window.__step(r, sec), rnd = Math.random;
    // Shrine of Souls: 2.5 s inside the circle pauses on a 1-of-3 blessing; Wraith Stride is +30% speed for 60 s, with a HUD chip
    let r = window.__aq(1); const P = r.player;
    r.events.start('shrine', { x: P.x + 5, z: P.z });
    const ev = r.events.cur, speed0 = r.stats.speed;
    step(r, 1); const idle = { hold: ev.hold, pending: r.levelPending };
    P.x = ev.x; P.z = ev.z; step(r, 2.3); const early = r.levelPending;
    Math.random = () => 0; step(r, 0.3); Math.random = rnd; // the draw: Soul Feast, Legion Wrath, Wraith Stride
    const cards = [...document.querySelectorAll('.lvl-back.shrine .card')], t0 = r.time;
    step(r, 0.5); const frozen = r.time === t0;
    r.t += 1; cards.find((n) => n.textContent.includes('Wraith Stride'))?.click();
    step(r, 0.2);
    out.shrine = { idle, early, pending: !!cards.length, cards: cards.length, frozen, ratio: +(r.stats.speed / speed0).toFixed(3), resumed: !r.levelPending, chip: document.querySelector('.hud-buffs .buff b')?.textContent, events: r.counters.events };
    r.recomputeStats(); out.shrine.survivesRecompute = +(r.stats.speed / speed0).toFixed(3); // a level-up recomputes stats: the blessing stays
    step(r, 60); out.shrine.expired = { ratio: +(r.stats.speed / speed0).toFixed(3), chips: document.querySelectorAll('.hud-buffs .buff').length, left: r.events.buffs.length };
    // the other blessings: Soul Feast doubles XP, Open Graves +20 pp Raise Chance, Legion Wrath ×1.5 minion damage
    const raise0 = r.stats.raise, md0 = r.stats.minionDmg;
    r.events.bless('feast'); r.events.bless('call'); r.events.bless('wrath');
    const xp0 = r.xp; Object.getPrototypeOf(r).addXp.call(r, 1);
    out.blessings = { xp: r.xp - xp0, raise: +(r.stats.raise - raise0).toFixed(3), minion: +(r.stats.minionDmg / md0).toFixed(3) };
    // ignored, a shrine lapses
    r = window.__aq(1); r.events.start('shrine', { x: r.player.x + 6, z: r.player.z }); step(r, 30);
    out.lapse = { cur: !!r.events.cur, buffs: r.events.buffs.length, events: r.counters.events };
    // Cursed Coffin: static and hidden from the horde mesh; breaking it releases 20 foes and a chest-less mini-elite; clearing
    // them (or lasting 20 s) sends a Relic Chest flying to the Shepherd
    r = window.__aq(2); const Q = r.player;
    r.events.start('coffin', { x: Q.x + 6, z: Q.z });
    const cf = r.events.cur, cof = cf.e, x0 = cof.x;
    step(r, 1);
    r.enemies.render(); const drawn = Object.values(r.enemies.meshes).reduce((s, M) => s + M.n, 0);
    const n0 = r.enemies.count;
    r.enemies.damage(cof, 1e9, { silent: true }); const state = cf.state; r.update(1 / 30);
    const mini = cf.wave.map((w) => w.e).find((o) => o.elite);
    out.coffin = { kind: cf.kind, still: cof.x === x0 || !cof.active, drawn, state, after: cf.state, wave: cf.wave.length, spawned: r.enemies.count - n0 + 1, mini: !!mini && !!mini.aff && mini.aff.noChest && mini.aff.ids.length === 1, banner: document.querySelector('.banner b')?.textContent };
    const sp0 = r.pickups.special.length;
    for (const w of cf.wave.slice(1)) r.enemies.kill(w.e, 'bolt');
    r.update(1 / 30); const notYet = cf.state;
    r.enemies.kill(cf.wave[0].e, 'bolt'); r.update(1 / 30);
    const chest = r.pickups.special.slice(sp0).filter((p) => p.kind === 'chest');
    const chests0 = r.counters.chests; step(r, 2);
    out.coffin.reward = { notYet, state: cf.state, chests: chest.length, flying: chest.every((p) => p.pulled), opened: r.counters.chests - chests0, events: r.counters.events };
    document.querySelectorAll('.lvl-back').forEach((n) => n.remove()); r.levelPending = false; r.chestQueue = 0;
    // left alone after breaking, the reward still comes 20 s later
    r = window.__aq(2); r.events.start('coffin', { x: r.player.x + 6, z: r.player.z }); const cf2 = r.events.cur;
    r.enemies.damage(cf2.e, 1e9, { silent: true }); r.update(1 / 30);
    for (const w of cf2.wave) w.e.speed = 0;
    let at = -1; for (let i = 0; i < 30 * 22 && at < 0; i++) { r.update(1 / 30); if (cf2.state === 'gone') at = cf2.waveT; }
    out.coffin.timeout = +at.toFixed(2);
    // unbroken, it sinks away after 30 s
    r = window.__aq(2); r.events.start('coffin', { x: r.player.x + 6, z: r.player.z }); const cf3 = r.events.cur; step(r, 31);
    out.coffin.lapse = { cur: !!r.events.cur, alive: cf3.e.active, events: r.counters.events };
    // placement: 12 m out, never on a vent (Ch2) or ice (Ch3), nor on burning ground
    const place = (ch) => {
      const rr = window.__aq(ch), H = rr.hazards, p = rr.player; let n = 0, bad = 0, dmin = 99, dmax = 0;
      for (let i = 0; i < 40; i++) {
        p.x = (Math.random() - 0.5) * 300; p.z = (Math.random() - 0.5) * 300; H.update(0);
        const s = rr.events.spot(); if (!s) continue; n++;
        const d = Math.hypot(s.x - p.x, s.z - p.z); dmin = Math.min(dmin, d); dmax = Math.max(dmax, d);
        for (let k = 0; k < H.nv; k++) if (Math.hypot(H.vents[k].x - s.x, H.vents[k].z - s.z) < 2.6 + 1.6) bad++;
        for (let k = 0; k < 16; k++) { const a = k * 0.3927, q = k % 2 ? 1 : 2; if (H.iceAt(s.x + Math.cos(a) * q, s.z + Math.sin(a) * q)) { bad++; break; } }
      }
      return { n, bad, d: [+dmin.toFixed(1), +dmax.toFixed(1)] };
    };
    let rr = window.__aq(2); rr.hazards.burn(rr.player.x + 3, rr.player.z, 1.1, 10);
    out.place = { ch2: place(2), ch3: place(3), burn: !rr.hazards.isClear(rr.player.x + 3, rr.player.z, 1) && rr.hazards.isClear(rr.player.x + 9, rr.player.z, 1) };
    return out;
  });
  check('event shrine: 2.5 s inside pauses on a 1-of-3 blessing pick', !c.shrine.idle.pending && c.shrine.idle.hold === 0 && !c.shrine.early && c.shrine.cards === 3 && c.shrine.frozen && c.shrine.resumed, JSON.stringify(c.shrine));
  check('event shrine: the blessing applies (+30% speed, HUD chip) and expires after 60 s', c.shrine.ratio === 1.3 && c.shrine.survivesRecompute === 1.3 && c.shrine.chip === 'Wraith Stride' && c.shrine.events === 1 && c.shrine.expired.ratio === 1 && c.shrine.expired.chips === 0 && c.shrine.expired.left === 0, JSON.stringify(c.shrine));
  check('event shrine: Soul Feast ×2 XP, Open Graves +20 pp, Legion Wrath ×1.5; ignored, it lapses', c.blessings.xp === 2 && c.blessings.raise === 0.2 && c.blessings.minion === 1.5 && !c.lapse.cur && c.lapse.buffs === 0 && c.lapse.events === 0, JSON.stringify({ b: c.blessings, lapse: c.lapse }));
  check('event coffin: breaking it releases 20 foes and a chest-less mini-elite', c.coffin.still && c.coffin.drawn === 0 && c.coffin.state === 'burst' && c.coffin.after === 'wave' && c.coffin.wave === 21 && c.coffin.spawned === 21 && c.coffin.mini && c.coffin.banner === 'THE COFFIN BURSTS', JSON.stringify(c.coffin));
  check('event coffin: clearing the wave (or 20 s) gives a Relic Chest; unbroken it lapses', c.coffin.reward.notYet === 'wave' && c.coffin.reward.state === 'gone' && c.coffin.reward.chests === 1 && c.coffin.reward.flying && c.coffin.reward.opened === 1 && c.coffin.reward.events === 1 && Math.abs(c.coffin.timeout - 20) < 0.1 && !c.coffin.lapse.cur && !c.coffin.lapse.alive && c.coffin.lapse.events === 0, JSON.stringify(c.coffin));
  check('events: placed 12 m out, never on vents, ice or burning ground', c.place.ch2.n >= 30 && c.place.ch3.n >= 30 && !c.place.ch2.bad && !c.place.ch3.bad && c.place.ch2.d[0] > 11.9 && c.place.ch3.d[1] < 12.1 && c.place.burn, JSON.stringify(c.place));

  // a bot plays 4:40 of Chapter 4 (two affixes per elite) with events on
  const d = await page.evaluate(() => {
    const app = window.__soulswarm; if (app.run) app.exitRun();
    document.querySelectorAll('.modal-back, .lvl-back').forEach((n) => n.remove());
    app.profile.energy = 30; app.startRun(4); const r = app.run; let maxAff = 0, kinds = new Set();
    const ev0 = r.events.start.bind(r.events); r.events.start = (k, at) => { const ok = ev0(k, at); if (ok) kinds.add(k); return ok; };
    const roll0 = r.affixes.roll.bind(r.affixes); r.affixes.roll = (e, n, o) => { const b = roll0(e, n, o); if (e && e.aff) maxAff = Math.max(maxAff, e.aff.ids.length); return b; };
    while (r.time < 280 && !r.ended) window.__bot(10, true);
    return { t: Math.round(r.time), maxAff, kinds: [...kinds].sort(), started: r.events.started, elites: r.counters.elites };
  });
  check('bot: Chapter 4 with affixed elites and events runs clean', d.t >= 280 && d.maxAff === 2 && d.started >= 2, JSON.stringify(d));
});
check('affixes and events: no runtime errors', !errs.length, errs[0] || '');

// 19. Hero Rites (src/game/rites.js): the RITE button fires on pointerdown (never the joystick) and its cooldown gates
// re-use; Grave Call raises every kill and pulls nearby shards; Shadow Step moves 7 m untouchable and cuts its path;
// Death Knell stuns, marks for 5 s and silences shots; Ossuary Wall expels the horde, shatters Witch fire and mends the
// legion; Ashfall strikes 20 foes (elites first), pins and burns them and feeds the Nova; Gravemaw keeps his rules; the
// first run teaches it.
// A quiet arena (no director, no weapons) frame-stepped at 30 fps; raise rolls pinned with Math.random where needed.
errs = await session(async (page) => {
  await page.evaluate(BOSS_QA);
  const s = await page.evaluate(async () => {
    const app = window.__soulswarm, p = app.profile, rnd = Math.random;
    const { RITES } = await import('/src/game/data.js');
    app.engine.manual = true;
    p.flags.tutorialDone = true; p.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 };
    const start = (hero) => {
      if (app.run) app.exitRun();
      document.querySelectorAll('.modal-back, .lvl-back').forEach((n) => n.remove());
      p.heroes[hero].owned = true; p.heroes[hero].stars = Math.max(1, p.heroes[hero].stars); p.selectedHero = hero; p.energy = 30; app.startRun(1);
      const r = app.run;
      r.spawnAcc = -1e9; r.nextGate = r.nextSwarm = 1e9; r.eliteIdx = 99; r.modBannerAt = 0;
      r.weapons.update = () => {}; r.addXp = () => {}; r.player.hurt = () => {}; r.input.tx = r.input.tz = 0; r.pickups.dropSpecial = () => {};
      return r;
    };
    const step = (r, sec) => { for (let i = 0; i < Math.round(sec * 30); i++) r.update(1 / 30); };
    const foe = (r, dx, dz, o = {}) => { const e = r.enemies.spawn(o.type || 'husk', r.player.x + dx, r.player.z + dz, { hpMul: o.hp ?? 50, elite: !!o.elite }); e.spawnT = 1; return e; };
    const dist = (a, b) => +Math.hypot(a.x - b.x, a.z - b.z).toFixed(2);
    const tap = (el) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 7 }));
    const out = { cd: RITES.vael.cd };

    // the button: a tap casts at once without starting the joystick; taps during the cooldown do nothing; E casts once ready
    let r = start('vael'), P = r.player;
    const btn = document.querySelector('.hud .rite');
    step(r, 0.1); // the HUD refreshes at 20 Hz
    const B = out.button = { exists: !!btn, label: btn ? btn.textContent.trim() : '', ready: !!btn && btn.classList.contains('ready') };
    tap(btn); r.update(1 / 30);
    B.cast = r.counters.rites; B.cd = +r.rites.cd.toFixed(1); B.joystick = r.input.pointerId === null && !r.input.active;
    tap(btn); step(r, 1); tap(btn); step(r, 0.2);
    B.gated = r.counters.rites;
    B.counter = btn.classList.contains('cooling') ? btn.querySelector('.cd').textContent : '';
    r.rites.cd = 0.05; step(r, 0.1);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); r.update(1 / 30); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
    B.key = r.counters.rites;

    // Vael: during Grave Call every kill rises (a pinned 0.4 roll against 5% Raise Chance), the cap still holds,
    // shards inside the pull radius fly in and those beyond stay put; afterwards kills roll normally again
    r = start('vael'); P = r.player;
    r.stats.raise = 0.05; r.stats.cap = 400; r.pickups.gems.length = 0;
    const near = [], far = [], pull = RITES.vael.pull;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.28;
      r.pickups.dropGem(P.x + Math.cos(a) * (pull - 1.5), P.z + Math.sin(a) * (pull - 1.5), 1); near.push(r.pickups.gems[r.pickups.gems.length - 1]);
      r.pickups.dropGem(P.x + Math.cos(a) * (pull + 4), P.z + Math.sin(a) * (pull + 4), 1); far.push(r.pickups.gems[r.pickups.gems.length - 1]);
    }
    step(r, 0.3);
    Math.random = () => 0.4;
    const kill = (dx, dz) => { const e = foe(r, dx, dz); r.enemies.damage(e, 1e9, { source: 'minion', silent: true }); };
    let raised0 = r.counters.raised; kill(3, 0);
    const V = out.vael = { before: r.counters.raised - raised0 };
    r.rites.trigger();
    V.near = near.filter((g) => g.pulled).length; V.far = far.filter((g) => g.pulled).length;
    raised0 = r.counters.raised;
    for (let i = 0; i < 12; i++) kill(3 + (i % 3), (i % 4) - 2);
    V.rose = r.counters.raised - raised0; V.pillars = r.rites.pN;
    r.stats.cap = r.legion.count; const atCap = r.legion.count; kill(3, 1); kill(3, -1);
    V.capHeld = r.legion.count === atCap;
    Math.random = rnd; step(r, 4.2); Math.random = () => 0.4;
    r.stats.cap = 400; raised0 = r.counters.raised; kill(3, 0);
    V.after = r.counters.raised - raised0;
    Math.random = rnd;

    // Nyx: Shadow Step carries her 7 m along the stick, untouchable, cutting (and knocking aside) the foe on her path,
    // not the one off it; the legion runs +60% faster for 3 s, then back to normal
    r = start('nyx'); P = r.player;
    const p0 = { x: P.x, z: P.z }, onPath = foe(r, 3, 0), offPath = foe(r, 3, 6), speed0 = r.stats.minionSpeed;
    step(r, 0.1); P.invuln = 0; // past the run-start grace
    r.input.tx = 1; r.ui.wantsRite = true; r.update(1 / 30); r.input.tx = 0;
    const N = out.nyx = { invuln: +P.invuln.toFixed(2) };
    const hp0 = P.hp; Object.getPrototypeOf(P).hurt.call(P, 40); N.untouched = P.hp === hp0;
    let knock = 0; for (let i = 0; i < 9; i++) { r.update(1 / 30); knock = Math.max(knock, Math.abs(onPath.kz)); }
    Object.assign(N, { moved: dist(P, p0), cut: onPath.hp < onPath.maxHp, knock: +knock.toFixed(1), spared: offPath.hp === offPath.maxHp, haste: +(r.stats.minionSpeed / speed0).toFixed(2) });
    step(r, 3);
    N.hasteAfter = +(r.stats.minionSpeed / speed0).toFixed(2);

    // Liora: Death Knell stuns a foe within 5 m (it holds still), not one outside; marks it for 5 s (a kill 4 s later
    // still rises ×2: a pinned 0.4 roll against 25%); an ember in flight and a Witch 8 m out are silenced; the stun wears off
    r = start('liora'); P = r.player;
    const st = foe(r, 2.5, 0), outside = foe(r, 9, 0), br = foe(r, -2, 0, { type: 'brute' }), wf = foe(r, -1, -8, { type: 'witch' });
    step(r, 0.2); br.state = 1; br.stateT = 0.3; // a Brute mid wind-up
    r.projectiles.enemyShot(P.x + 6, P.z, -1, 0, 3, 5); r.projectiles.bossOrb(P.x - 12, P.z + 12, 0, 0.01, 1, { life: 9 });
    const at = { x: st.x, z: st.z }, out0 = dist(outside, P), shots = r.projectiles.embers.length;
    r.rites.trigger();
    const L = out.liora = { shots, cleared: r.projectiles.embers.filter((b) => !b.boss).length, bossOrbs: r.projectiles.embers.filter((b) => b.boss).length, bruteCalledOff: br.state === 0, witchSilenced: wf.stunT > 0 && wf.tollUid !== wf.uid };
    step(r, 1.2);
    Object.assign(L, { stunned: st.stunT > 0, still: dist(st, at), marked: st.tollUid === st.uid && +(st.tollT - r.time).toFixed(1), outsideMoved: +(out0 - dist(outside, P)).toFixed(2), outsideStun: outside.stunT > 0 });
    step(r, 0.5); const at2 = { x: st.x, z: st.z }; step(r, 0.5);
    L.freed = st.stunT <= 0 && dist(st, at2) > 0.3;
    step(r, 2.6); r.stats.raise = 0.25; Math.random = () => 0.4;
    const n0 = r.legion.count; st.hp = 1; r.enemies.damage(st, 5, { source: 'minion', silent: true });
    Math.random = rnd; L.markRose = r.legion.count - n0;

    // Mordrake: Ossuary Wall throws a foe inside out past the ring and cuts it; a wounded minion inside heals +50% over 5 s
    r = start('mordrake'); P = r.player;
    const inner = foe(r, 2, 0), bigOne = foe(r, 0, 3, { type: 'brute' });
    r.legion.update = () => {}; // the minion holds its spot
    const m = r.legion.raise(P.x - 2, P.z, { fx: false }); m.hp = m.maxHp * 0.2;
    step(r, 0.1);
    r.rites.trigger(); r.update(1 / 30);
    const W = out.wall = { inner: dist(inner, P), brute: dist(bigOne, P), r: RITES.mordrake.r, cut: inner.hp < inner.maxHp };
    // Witch fire falling inside the ring shatters before it lands; fire falling outside still lands
    let landed = 0; const land = r.projectiles.landLob.bind(r.projectiles); r.projectiles.landLob = (F) => { landed++; land(F); };
    const lobSpec = { flight: 1, radius: 1.1, height: 3.2 };
    r.projectiles.lob(P.x + 7, P.z, P.x + 1, P.z, 10, lobSpec, false); r.projectiles.lob(P.x + 7, P.z, P.x + 8.5, P.z, 10, lobSpec, false);
    step(r, 1.2); W.fireLanded = landed;
    step(r, 4);
    Object.assign(W, { heal: +(m.hp / m.maxHp - 0.2).toFixed(2), kept: dist(inner, P), over: r.rites.wallT <= 0 });

    // Seraphine: Ashfall strikes exactly 20 of 27 foes on screen, the elite first even though it stands farthest;
    // they burn; the Nova charge rises by 15%
    r = start('seraphine'); P = r.player;
    const crowd = []; for (let i = 0; i < 26; i++) { const a = (i / 26) * 6.28, R = 3 + (i % 3); crowd.push(foe(r, Math.cos(a) * R, Math.sin(a) * R * 0.8, { hp: 200 })); }
    const elite = foe(r, 0, -7.5, { hp: 200, elite: true });
    step(r, 0.1);
    r.nova = 0.2;
    r.rites.trigger();
    const S = out.ash = { charged: +(r.nova - 0.2).toFixed(3), firstIsElite: r.rites.strikes[0].e === elite };
    step(r, 0.7);
    Object.assign(S, { struck: crowd.filter((e) => e.hp < e.maxHp).length + (elite.hp < elite.maxHp ? 1 : 0), elite: elite.hp < elite.maxHp, burning: r.weapons.burning.length, n: RITES.seraphine.n,
      pinned: crowd.filter((e) => e.hp < e.maxHp && e.stunT > 0).length + (elite.stunT > 0 ? 1 : 0) });

    // Gravemaw keeps his rules: the Knell never stuns him (his next attack slips 0.25 s), the Wall only leans on him while
    // it throws a Husk out, Ashfall strikes him first; his damage goes through his own filter
    p.selectedHero = 'liora'; r = window.__bossRun(1); P = r.player; let b = r.boss, e = r.bossEnemy;
    e.x = P.x + 3; e.z = P.z; b.state = 'chase'; b.cd = 1; r.rites.cd = 0;
    r.rites.trigger();
    const G = out.boss = { stun: e.stunT, cd: +b.cd.toFixed(2) };
    p.selectedHero = 'mordrake'; r = window.__bossRun(1); P = r.player; b = r.boss; e = r.bossEnemy;
    e.x = P.x + 2; e.z = P.z; b.cd = 99; const hk = foe(r, -2, 0);
    r.rites.trigger(); window.__step(r, 0.5);
    Object.assign(G, { bossD: dist(e, P), huskD: dist(hk, P) });
    p.selectedHero = 'seraphine'; r = window.__bossRun(1); P = r.player; e = r.bossEnemy;
    e.x = P.x; e.z = P.z - 7; for (let i = 0; i < 25; i++) foe(r, Math.cos(i) * 3, Math.sin(i) * 3);
    const bhp = e.hp; r.rites.cd = 0; r.rites.trigger();
    G.ashFirst = r.rites.strikes[0].e === e; window.__step(r, 0.2); G.ashHurt = e.hp < bhp;

    // the run result counts Rites; the hero screen lists the Rite under the passive
    r = start('nyx'); let res = null; r.onEnd = (x) => { res = x; };
    r.rites.trigger(); r.rites.cd = 0; r.rites.trigger(); r.end(false);
    out.result = res && res.rites;
    app.exitRun(); document.querySelectorAll('.modal-back').forEach((n) => n.remove());
    app.meta.show('heroes'); document.querySelector('.hcard[data-id="mordrake"]')?.click();
    out.screen = document.querySelector('.modal .hd-rite b')?.textContent || '';
    document.querySelectorAll('.modal-back').forEach((n) => n.remove());

    // first-ever run: once the Rite is ready and 8 s have passed, a one-time hint names it and is remembered
    p.flags.tutorialDone = false; p.flags.hints = {};
    r = start('vael'); r.input.moved = true;
    step(r, 9);
    out.hint = { tutorial: r.tutorial, flag: !!p.flags.hints.rite, text: document.querySelector('.hud .hint')?.textContent || '' };
    // a player from before Rites gets the same hint once on their next run, and never again
    p.flags.tutorialDone = true; p.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1 };
    r = start('vael'); r.input.moved = true; step(r, 9);
    out.veteran = { tutorial: r.tutorial, flag: !!p.flags.hints.rite, text: document.querySelector('.hud .hint')?.textContent || '' };
    r = start('vael'); r.input.moved = true; step(r, 9);
    out.veteranAgain = document.querySelector('.hud .hint')?.textContent || '';
    app.exitRun();
    return out;
  });
  const { button: B, vael: V, nyx: N, liora: L, wall: W, ash: S, boss: G, cd: RITES_CD } = s;
  check('rites: RITE button fires on pointerdown, not the joystick', B.exists && B.ready && B.label === 'CALL' && B.cast === 1 && B.cd >= RITES_CD - 0.1 && B.joystick, JSON.stringify(B));
  check('rites: the cooldown gates re-use (counter shown), E casts once ready', B.gated === 1 && +B.counter >= RITES_CD - 2 && B.key === 2, JSON.stringify(B));
  check('rites: Vael Grave Call raises every kill (cap holds), pulls nearby shards', V.before === 0 && V.rose === 12 && V.pillars > 0 && V.capHeld && V.after === 0 && V.near === 8 && V.far === 0, JSON.stringify(V));
  check('rites: Nyx Shadow Step moves 5+ m, invulnerable, cuts her path', N.moved >= 5 && N.invuln >= 0.35 && N.untouched && N.cut && N.knock > 2 && N.spared, JSON.stringify(N));
  check('rites: Nyx Shadow Step hastes the legion +60% for 3 s', N.haste === 1.6 && N.hasteAfter === 1, JSON.stringify(N));
  check('rites: Liora Death Knell stuns (holds still), marks for 5 s, silences fire and Witches', L.stunned && L.still < 0.05 && L.marked >= 3.5 && L.markRose === 1 && !L.outsideStun && L.outsideMoved > 1 && L.shots > 1 && L.cleared === 0 && L.bossOrbs === 1 && L.bruteCalledOff && L.witchSilenced && L.freed, JSON.stringify(L));
  check('rites: Mordrake Ossuary Wall pushes foes out and heals minions', W.inner >= W.r && W.brute >= W.r && W.cut && W.kept >= W.r - 0.5 && W.heal >= 0.45 && W.heal <= 0.55 && W.over, JSON.stringify(W));
  check('rites: Ossuary Wall shatters Witch fire falling inside it', W.fireLanded === 1, JSON.stringify(W));
  check('rites: Seraphine Ashfall strikes 20 foes (elite first), pins and burns, +15% Nova', S.struck === S.n && S.elite && S.firstIsElite && S.burning > 0 && S.pinned === S.n && Math.abs(S.charged - 0.15) < 0.001, JSON.stringify(S));
  check('rites: Gravemaw is staggered not stunned, barely pushed, struck first', G.stun === 0 && G.cd === 1.25 && G.bossD < W.r && G.huskD >= W.r && G.ashFirst && G.ashHurt, JSON.stringify(G));
  check('rites: run result counts Rites; hero screen lists the Rite', s.result === 2 && s.screen === 'Ossuary Wall', JSON.stringify({ result: s.result, screen: s.screen }));
  check('rites: first run hints the Rite once it is ready', s.hint.tutorial && s.hint.flag && /Rite/.test(s.hint.text), JSON.stringify(s.hint));
  check('rites: a returning player gets the Rite hint once, then never again', !s.veteran.tutorial && s.veteran.flag && /Rite/.test(s.veteran.text) && !/Rite/.test(s.veteranAgain), JSON.stringify({ v: s.veteran, again: s.veteranAgain }));
});
check('rites: no runtime errors', !errs.length, errs[0] || '');

// 20. Nightmare and Torment: per-chapter unlocks, run.diff scaling (horde HP, damage and spawns, extra elites, Gravemaw,
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
    out.identity = { id: n.id, hp: n.hp, ramp: n.ramp, xp: n.xp, bossHp: n.bossHp, bossDmg: n.bossDmg, dmg: n.dmg, spawn: n.spawn, extraElites: n.extraElites, eliteAffixes: n.eliteAffixes, gold: n.gold, passXp: n.passXp, firstClearGems: n.firstClearGems, hoard: n.hoard, tint: n.tint };
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
      const el = r.spawnEnemy('husk', { elite: true, at: { x: r.player.x, z: r.player.z + 9 } }); r.affixes.roll(el); // affixes.js reads run.diff.eliteAffixes
      const affixRolled = el.aff ? el.aff.ids.length : 0;
      r.boss.spawn(); r.bossSpawned = true; const b = r.bossEnemy;
      const add = r.spawnEnemy('brute', { at: { x: r.player.x - 9, z: r.player.z } }); // an arena add is a plain Normal add
      p.flags.bloodMoon = 'off';
      return { id: r.diff.id, affixes: r.diff.eliteAffixes, affixRolled, hp, dmg, shard, acc, elites: r.eliteTimes.length, bossHp: b.maxHp, bossDmg: b.dmg, addHp: add.maxHp, addDmg: add.dmg, hp0: e0.maxHp, sky: '#' + r.scene.background.getHexString(), badge: document.querySelector('.hud-diff')?.textContent || '' };
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
    const r1 = eco.applyRunResult(p, { ...base, time: 250, kills: 900, bestLegion: 95, bestStreak: 40, victory: false, difficulty: 'nightmare' });
    const r2 = eco.applyRunResult(p, { ...base, time: 180, kills: 700, bestLegion: 140, bestStreak: 75, victory: false, difficulty: 'nightmare' });
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
  check('difficulty: run.diff always defined, Normal is the identity', JSON.stringify(identity) === JSON.stringify({ id: 'normal', hp: 1, ramp: 0, xp: 1, bossHp: 1, bossDmg: 1, dmg: 1, spawn: 1, extraElites: 0, eliteAffixes: 0, gold: 1, passXp: 1, firstClearGems: 0, hoard: null, tint: null }), JSON.stringify(identity));
  const ratio = (k, d) => Math.round(P[d][k] / P.normal[k] * 100) / 100;
  const sc = { hp: [ratio('hp', 'nightmare'), ratio('hp', 'torment')], dmg: [ratio('dmg', 'nightmare'), ratio('dmg', 'torment')], spawn: [ratio('acc', 'nightmare'), ratio('acc', 'torment')], affixes: [P.normal.affixes, P.nightmare.affixes, P.torment.affixes], rolled: [P.normal.affixRolled, P.nightmare.affixRolled, P.torment.affixRolled] };
  sc.hp0 = [ratio('hp0', 'nightmare'), ratio('hp0', 'torment')]; sc.xp = [ratio('shard', 'nightmare'), ratio('shard', 'torment')];
  check('difficulty: enemy HP (after its ramp), damage, spawn rate, shard XP and elite affixes scale by run.diff (Nightmare, Torment)',
    near(sc.hp, [NM.hp, TM.hp]) && sc.hp0.join() === '1,1' && NM.ramp > 0 && near(sc.xp, [NM.xp, TM.xp]) && near(sc.dmg, [NM.dmg, TM.dmg]) && near(sc.spawn, [NM.spawn, TM.spawn]) && sc.affixes.join() === `0,${NM.eliteAffixes},${TM.eliteAffixes}` && sc.rolled.join() === `1,${1 + NM.eliteAffixes},${1 + TM.eliteAffixes}` && NM.hp > 1 && TM.hp > NM.hp, JSON.stringify(sc));
  const el = [P.normal.elites, P.nightmare.elites, P.torment.elites, P.bmNormal.elites, P.bmNightmare.elites];
  check('difficulty: extra elites join the schedule (Blood Moon stacks on top)', el.join() === [4, 4 + NM.extraElites, 4 + TM.extraElites, 8, 8 + NM.extraElites].join() && NM.extraElites > 0, JSON.stringify(el));
  const bs = { hp: [ratio('bossHp', 'nightmare'), ratio('bossHp', 'torment')], dmg: [ratio('bossDmg', 'nightmare'), ratio('bossDmg', 'torment')], adds: [ratio('addHp', 'nightmare'), ratio('addHp', 'torment'), ratio('addDmg', 'nightmare'), ratio('addDmg', 'torment')] };
  check('difficulty: Gravemaw HP and damage scale; his arena adds stay plain Normal adds', near(bs.hp, [NM.bossHp, TM.bossHp]) && near(bs.dmg, [NM.bossDmg, TM.bossDmg]) && bs.adds.join() === '1,1,1,1' && NM.bossHp > 1, JSON.stringify(bs));
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
  check('difficulty records: best time, legion, kills and kill streak per difficulty; Normal chapter record untouched',
    JSON.stringify(rec.nm) === JSON.stringify({ time: 250, legion: 140, kills: 900, streak: 75, cleared: false }) && rec.normal.time === 300 && rec.normal.legion === 60 && rec.normal.cleared
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

// 21. Bug-test regressions (code review): interactions between the Update 3 systems found in review. Frame-stepped in a
//     quiet arena (no director, no weapons) with rolls pinned where they matter.
errs = await session(async (page) => {
  await page.evaluate(BOSS_QA);
  const s = await page.evaluate(async () => {
    const app = window.__soulswarm, p = app.profile, rnd = Math.random, out = {};
    const { RITES, EVOLUTIONS } = await import('/src/game/data.js');
    app.engine.manual = true;
    p.flags.tutorialDone = true; p.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 };
    const start = (hero) => {
      if (app.run) app.exitRun();
      document.querySelectorAll('.modal-back, .lvl-back').forEach((n) => n.remove());
      p.heroes[hero].owned = true; p.heroes[hero].stars = Math.max(1, p.heroes[hero].stars); p.selectedHero = hero; p.energy = 30; app.startRun(1);
      const r = app.run; r.director = () => {}; r.weapons.update = () => {}; r.addXp = () => {};
      return r;
    };
    const step = (r, n) => { for (let i = 0; i < n; i++) r.update(1 / 30); };
    const foe = (r, dx, dz, hpMul) => { const e = r.enemies.spawn('husk', r.player.x + dx, r.player.z + dz, { hpMul }); e.spawnT = 1; return e; };

    // the RITE button pulses again once its cooldown ends (the cast punch class stayed on and outranked the pulse)
    let r = start('vael'); r.player.hurt = () => {};
    const btn = document.querySelector('.hud .rite');
    step(r, 3); r.ui.wantsRite = true; step(r, 3);
    const cast = getComputedStyle(btn).animationName;
    r.rites.cd = 0.05; step(r, 6);
    out.rite = { cast, ready: btn.classList.contains('ready'), anim: getComputedStyle(btn).animationName };

    // a Splitter elite slain in the same blow as Gravemaw bursts no copies into the cleared chapter's victory beat
    p.selectedHero = 'vael'; r = window.__bossRun(1); let P = r.player;
    r.weapons.update = () => {};
    const sp = r.enemies.spawn('husk', P.x + 3, P.z, { elite: true, hpMul: 1 }); sp.spawnT = 1; r.affixes.apply(sp, ['splitter']);
    r.enemies.kill(sp, 'nova');
    const B = r.bossEnemy; B.hp = 1; r.boss.immune = 0; r.enemies.damage(B, 10, { source: 'bolt', silent: true });
    step(r, 15);
    out.split = { victory: !!r.victory, foes: r.enemies.active.filter((o) => o.active && o.type !== 'boss').length };

    // a Witch orb kills Mordrake into his free revive as it lands: the revive clears the sky mid-loop without pooling an
    // orb twice (two Witches then shared one orb: one telegraph lied, the other landed twice after 0.5 s)...
    const spec = { flight: 1, radius: 1.1, height: 3.2 };
    r = start('mordrake'); P = r.player; r.rites.cd = 99; step(r, 40);
    let PR = r.projectiles;
    PR.lob(P.x + 6, P.z, P.x, P.z, 50, spec, false); P.hp = 1; P.invuln = 0; step(r, 40);
    const dupes = PR.lobPool.length - new Set(PR.lobPool).size;
    step(r, 90); // past the revive's invulnerability
    const t0 = r.time, landed = [], land = PR.landLob.bind(PR); PR.landLob = (L) => { landed.push([+(r.time - t0).toFixed(1), Math.round(L.tx - P.x)]); land(L); };
    const L1 = PR.lob(P.x + 8, P.z, P.x + 4, P.z, 5, spec, false), L2 = PR.lob(P.x - 8, P.z, P.x - 4, P.z, 5, spec, false);
    step(r, 45);
    out.lob = { revived: r.freeRevives === 0 && !P.dead, dupes, shared: L1 === L2, landed };
    // ...nor leave a hole when an orb still up sits ahead of the landing one (the next frame threw, every frame)
    r = start('mordrake'); P = r.player; r.rites.cd = 99; step(r, 40); PR = r.projectiles;
    PR.lob(P.x + 9, P.z, P.x + 20, P.z, 5, { flight: 3, radius: 1.1, height: 3.2 }, false);
    PR.lob(P.x + 6, P.z, P.x, P.z, 50, spec, false); P.hp = 1; P.invuln = 0;
    let err = ''; try { step(r, 60); } catch (e) { err = e.message; }
    out.hole = { revived: r.freeRevives === 0, err, holes: PR.lobs.length - PR.lobs.filter(Boolean).length };

    // Liora: her Grave Pulse never cuts a Death Knell toll short (a kill 4 s after the toll still rises ×2: 0.4 vs 0.25 × 2)
    r = start('liora'); P = r.player; r.player.hurt = () => {}; step(r, 6);
    const st = foe(r, 2.5, 0, 50); step(r, 1);
    r.rites.trigger(); step(r, 15);
    r.enemies.damage(st, 1, { source: 'pulse', silent: true });
    const afterPulse = +(st.tollT - r.time).toFixed(2);
    step(r, 105); r.stats.raise = 0.25; Math.random = () => 0.4;
    let n0 = r.legion.count; st.hp = 1; r.enemies.damage(st, 5, { source: 'minion', silent: true });
    Math.random = rnd;
    out.toll = { afterPulse, rose: r.legion.count - n0 };

    // Seraphine: a foe set alight by Ashfall and by her Chains of Perdition keeps Perdition's bigger raise bonus, in either
    // order (a kill while burning: 0.3 + 0.25 rises against a 0.5 roll, 0.3 + 0.15 would not)
    r = start('seraphine'); P = r.player; r.player.hurt = () => {}; step(r, 6);
    const a = foe(r, 3, 0, 500), b = foe(r, 3, 1, 500);
    r.weapons.ignite(b, 50); step(r, 1);
    r.rites.trigger(); step(r, 3);
    const ash = a.burnRaise; r.weapons.ignite(a, 50); const both = a.burnRaise;
    r.stats.raise = 0.3; Math.random = () => 0.5;
    n0 = r.legion.count; a.hp = 1; r.enemies.damage(a, 5, { source: 'minion', silent: true });
    Math.random = rnd;
    out.burn = { ash, both, chainsFirst: b.burnRaise, want: [RITES.seraphine.burnRaise, EVOLUTIONS.chainsOfPerdition.raise], rose: r.legion.count - n0 };
    app.exitRun();
    return out;
  });
  const { rite, split, lob, hole, toll, burn } = s;
  check('regression: the RITE button pulses again once its cooldown ends', rite.cast === 'ritefire' && rite.ready && rite.anim === 'ritepulse', JSON.stringify(rite));
  check('regression: a Splitter slain with Gravemaw bursts no copies into the victory beat', split.victory && split.foes === 0, JSON.stringify(split));
  check('regression: a Witch orb that revives Mordrake as it lands is pooled once (later orbs keep their 1.0 s)',
    lob.revived && lob.dupes === 0 && !lob.shared && lob.landed.length === 2 && lob.landed.every(([t]) => t >= 1) && lob.landed.map((x) => x[1]).sort((x, y) => x - y).join() === '-4,4', JSON.stringify(lob));
  check('regression: that revive leaves no hole in the sky (the game loop threw every frame)', hole.revived && !hole.err && hole.holes === 0, JSON.stringify(hole));
  check('regression: Grave Pulse never cuts a Death Knell toll short', toll.afterPulse > 4 && toll.rose === 1, JSON.stringify(toll));
  check('regression: a foe burning from Ashfall and Perdition keeps the bigger raise bonus (either order)',
    burn.ash === burn.want[0] && burn.both === burn.want[1] && burn.chainsFirst === burn.want[1] && burn.rose === 1, JSON.stringify(burn));
});
check('bug-test regressions: no runtime errors', !errs.length, errs[0] || '');

// 21b. Abandoning from the pause menu during the victory beat (the boss already fell) still wins the chapter;
//      abandoning a run in progress is still a defeat.
errs = await session(async (page) => {
  const s = await page.evaluate(() => {
    const app = window.__soulswarm, p = app.profile, out = {};
    p.flags.tutorialDone = true; p.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 }; app.engine.manual = true;
    const abandon = (won) => {
      if (app.run) app.exitRun();
      document.querySelectorAll('.modal-back').forEach((n) => n.remove());
      p.energy = 30; app.startRun(1); const r = app.run; let res = null; const end0 = r.onEnd; r.onEnd = (x) => { res = x; end0(x); };
      if (won) { r.onBossKilled(r.player.x, r.player.z + 5); r.update(0.5); }
      r.pause(true);
      [...document.querySelectorAll('.modal .modal-actions .btn')].find((b) => /Abandon/.test(b.textContent))?.click();
      return { ended: r.ended, victory: res && res.victory }; // the results header is drawn from result.victory
    };
    out.won = abandon(true); out.mid = abandon(false);
    // the legion slays Gravemaw while the Shepherd is down: no revive prompt, the victory beat plays out to a win
    app.exitRun(); document.querySelectorAll('.modal-back').forEach((n) => n.remove());
    p.selectedHero = 'vael'; p.energy = 30; app.startRun(1);
    { const r = app.run; let res = null, prompted = false; const end0 = r.onEnd; r.onEnd = (x) => { res = x; end0(x); };
      const sr = r.ui.showRevive.bind(r.ui); r.ui.showRevive = (...a) => { prompted = true; return sr(...a); };
      r.player.invuln = 0; r.player.hurt(1e9); const dead = r.player.dead; r.update(0.5);
      r.onBossKilled(r.player.x, r.player.z + 5);
      for (let i = 0; i < 80 && !r.ended; i++) r.update(0.1);
      out.downed = { dead, prompted, ended: r.ended, victory: res && res.victory }; }
    app.exitRun();
    return out;
  });
  check('regression: Gravemaw slain while the Shepherd is down wins without a revive prompt',
    s.downed.dead && !s.downed.prompted && s.downed.ended && s.downed.victory === true, JSON.stringify(s.downed));
  check('regression: abandoning during the victory beat still wins; mid-run it is a defeat',
    s.won.ended && s.won.victory === true && s.mid.ended && s.mid.victory === false, JSON.stringify(s));
});
check('abandon regression: no runtime errors', !errs.length, errs[0] || '');


// 22. Bug-test regressions (soak): invariants scripts/soak.mjs found broken, each reduced to a deterministic setup.
errs = await session(async (page) => {
  const s = await page.evaluate(() => {
    const app = window.__soulswarm, p = app.profile, E = app.engine, out = {};
    E.manual = true;
    Object.assign(p.flags, { tutorialDone: true, hints: { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 } });
    p.chapter.unlocked = 6;
    const start = (ch, hero = 'vael') => {
      if (app.run) app.exitRun();
      p.heroes[hero].owned = true; p.selectedHero = hero; p.energy = 30; app.startRun(ch);
      const r = app.run; r.spawnAcc = -1e9; r.nextGate = r.nextSwarm = 1e9; r.eliteIdx = 99; r.events.nextAt = 1e9;
      return r;
    };
    // (a Witch orb that kills Mordrake into his free revive as it lands: covered in section 21)
    // a lob the Nova tap clears takes its danger circle with it (it used to fill for a second over nothing)
    let r = start(1), P = r.player;
    const spec = { flight: 1, radius: 1.2, height: 2 };
    P.hurt = () => {};
    r.projectiles.lob(P.x + 6, P.z, P.x, P.z, 10, spec, false); r.update(1 / 30);
    const circles = () => r.hazards.teles.filter((t) => t.kind === 0).length, c0 = circles();
    r.nova = 1; r.triggerNova(); r.update(1 / 30);
    out.tele = { before: c0, lobs: r.projectiles.lobs.length, after: circles() };
    // once Gravemaw falls the chapter is won: an ember vent can't fell the Shepherd in the victory beat (it used to lead to a
    // revive screen, then DEFEAT on "Give up", or, in the beat's last 1.1 s, a revive screen over the results that spent gems)
    r = start(2); P = r.player;
    let res = null, ends = 0; const oe = r.onEnd; r.onEnd = (x) => { ends++; res = x; oe(x); };
    r.time = 359.9;
    for (let i = 0; i < 150 && !(r.bossEnemy && r.boss.state !== 'enter'); i++) { P.hp = P.maxHp; r.update(1 / 30); }
    const b = r.bossEnemy; b.hp = 1; r.enemies.damage(b, 50);
    const H = r.hazards; let puffs = 0; const pf = H.puff.bind(H);
    H.puff = (x, z, V) => { if ((P.x - x) ** 2 + (P.z - z) ** 2 < (V.radius + P.radius) ** 2) puffs++; return pf(x, z, V); }; // puffs on the Shepherd
    for (let i = 0; i < 200 && !r.ended; i++) {
      let w = null; for (let k = 0; k < H.nv; k++) if (!w || H.vents[k].warn > w.warn) w = H.vents[k];
      if (w && w.warn > 0) { P.x = w.x; P.z = w.z; } // stand on whichever vent is about to puff
      P.hp = 1; P.invuln = 0; r.update(1 / 30);
    }
    for (let i = 0; i < 45; i++) r.update(1 / 30);
    out.beat = { puffs, dead: P.dead, revive: !!document.querySelector('.modal h2') && document.querySelector('.modal h2').textContent === 'You have fallen', ends, victory: res && res.victory };
    // the NOVA button read "ready" from 99.5% charge (rounded), one kill before a tap could fire it
    r = start(1); r.director = () => {}; r.player.hurt = () => {};
    r.legion.addMany(40, r.player.x, r.player.z);
    const nb = document.querySelector('.hud .nova'), readyAt = (c) => { r.nova = c; for (let i = 0; i < 4; i++) r.update(1 / 30); return nb.classList.contains('ready'); };
    out.nova = { short: readyAt(299.5 / 300), full: readyAt(1) };
    app.exitRun();
    return out;
  });
  check('soak: a Witch lob cleared by the Nova tap takes its danger circle with it', s.tele.before === 1 && s.tele.lobs === 0 && s.tele.after === 0, JSON.stringify(s.tele));
  check('soak: nothing fells the Shepherd in the victory beat; the run ends VICTORY once, with no revive screen', s.beat.puffs > 0 && !s.beat.dead && !s.beat.revive && s.beat.ends === 1 && s.beat.victory === true, JSON.stringify(s.beat));
  check('soak: the NOVA button reads ready only at a full charge', !s.nova.short && s.nova.full, JSON.stringify(s.nova));
  // exitRun mid-run leaves nothing ticking: neither a card pick's 120 ms follow-up timer (it reopened a level-up on the
  // disposed run), the revive screen's countdown (it ended the exited run ~10 s later: rewards, and a results screen over the
  // menu) nor the results screen's own delay (the Ch2 run above ended and was exited at once)
  await page.evaluate(() => {
    const app = window.__soulswarm, p = app.profile; p.energy = 30; app.engine.manual = true;
    app.startRun(1); const a = window.__exA = app.run;
    a.levelQueue = 2; a.showLevelUp(); a.t += 0.31; document.querySelector('.lvl-back .card').click(); // the next card is 120 ms away
    app.exitRun();
    p.energy = 30; app.startRun(1); const b = window.__exB = app.run; b.__ends = 0; const oe = b.onEnd; b.onEnd = (x) => { b.__ends++; oe(x); };
    b.player.invuln = 0; b.player.hurt(1e6);
    for (let i = 0; i < 45; i++) b.update(1 / 30); // the revive screen and its 10 s countdown
    window.__exNum = document.querySelector('.modal .rev b');
    window.__exN0 = window.__exNum && window.__exNum.textContent;
    app.exitRun();
  });
  await page.waitForTimeout(2600);
  const x = await page.evaluate(() => ({ cardTimer: window.__exA.levelPending, revive: !!window.__exNum, countdown: [window.__exN0, window.__exNum && window.__exNum.textContent].join('>'),
    ends: window.__exB.__ends, results: !!document.querySelector('.modal-results'), hud: !!document.querySelector('.hud') }));
  check('soak: exitRun stops the run\'s timers (queued card follow-up, revive countdown, results delay)', !x.cardTimer && x.revive && x.countdown === '10>10' && !x.ends && !x.results && !x.hud, JSON.stringify(x));
});
check('soak regressions: no runtime errors', !errs.length, errs[0] || '');

// 23. Bug-test regressions (menus, economy, save): found by scripts/ui-sweep.mjs. Saves with a hero or relic this build does
//     not know, wrong types or out-of-range values boot and are repaired (an unreadable one is kept aside); a partial run
//     result never writes NaN; negative prices and non-tiers never pay; energy keeps regenerating when the clock goes back;
//     the ad double and a store sheet closed mid-purchase pay once; long toasts wrap on a 360 px phone and never block taps;
//     the results actions stay on screen at 375×667; the top-bar chips, the hero chip and the settings toggles have 36 px
//     targets; double taps buy once, and the second tap of a double tap on the results' Continue does not start a run.
errs = await session(async (page, errors) => {
  const s = await page.evaluate(async () => {
    const save = await import('/src/meta/save.js'), eco = await import('/src/meta/economy.js');
    const KEY = 'soulswarm.save.v1', out = {};
    const load = (v) => { localStorage.setItem(KEY, typeof v === 'string' ? v : JSON.stringify(v)); const p = save.loadProfile(); localStorage.removeItem(KEY); return p; };
    let p = load({ gold: 7777, selectedHero: 'ghost', relics: [{ uid: 'r1', type: 'bogus', rarity: 'mythic' }, { uid: 'r2', type: 'crown', rarity: 'rare', level: 2 }, { uid: 'r5', type: 'eye', rarity: 'rare', level: 1 }], equipped: ['r1', 'r2', 'r2', 'rX'], relicSeq: 2 });
    out.ids = { sel: p.selectedHero, relics: p.relics.map((r) => r.uid).join(), eq: JSON.stringify(p.equipped), seq: p.relicSeq, gold: p.gold, power: (() => { try { return eco.computeLoadout(p).power > 0; } catch (e) { return e.message; } })() };
    out.unowned = load({ selectedHero: 'mordrake' }).selectedHero;
    p = load({ gold: '5000', gems: 'abc', sigils: -2, energy: 1e9, level: '7', talents: { might: '3', vitality: 1e9 }, pass: { xp: '1200', claimedFree: '1,2' }, chapter: { unlocked: 99, selected: '2' }, heroes: { vael: { owned: true, stars: 99, shards: '4' } }, relics: [{ uid: 'r1', type: 'crown', rarity: 'common', level: 1e9 }], equipped: ['r1', null, null] });
    const gold = p.gold; eco.upgradeTalent(p, 'might');
    out.types = { gold, gems: p.gems, sigils: p.sigils, energy: p.energy, level: p.level, might: p.talents.might, vit: p.talents.vitality, pass: p.pass.xp, cf: Array.isArray(p.pass.claimedFree), un: p.chapter.unlocked, sel: p.chapter.selected, stars: p.heroes.vael.stars, shards: p.heroes.vael.shards, rl: p.relics[0].level };
    localStorage.setItem(KEY, '{"gold": 12'); p = save.loadProfile();
    out.corrupt = { gold: p.gold, kept: localStorage.getItem(KEY + '.corrupt') }; localStorage.removeItem(KEY); localStorage.removeItem(KEY + '.corrupt');
    p = save.newProfile(); p.flags.bloodMoon = 'off';
    const o = eco.applyRunResult(p, { chapter: 1, victory: false, time: 200 });
    out.partial = { xp: p.xp, kills: p.stats.kills, legion: p.stats.bestLegion, gold: o.rewards.gold, passXp: p.pass.xp };
    p = save.newProfile(); p.pass.xp = 15000;
    out.spend = [eco.spend(p, 'gems', -100), eco.spend(p, 'gold', NaN), p.gems, p.gold];
    out.tiers = [0, -10, 1.5, '3', 31, NaN].map((t) => !!eco.claimPass(p, t, false)).join(); out.gems = p.gems;
    const real = Date.now; let t = real(); Date.now = () => t;
    p.energy = 10; p.energyTs = t; t -= 864e5; eco.upkeep(p); const next = eco.energyNextIn(p); t += 400e3; eco.upkeep(p); Date.now = real;
    out.clock = { next, energy: p.energy };
    return out;
  });
  check('bug-test: a save with an unknown hero, unknown relics and dangling equips is repaired (relic ids never reused)',
    s.ids.sel === 'vael' && s.ids.relics === 'r2,r5' && s.ids.eq === '[null,"r2",null]' && s.ids.seq === 6 && s.ids.gold === 7777 && s.ids.power === true && s.unowned === 'vael', JSON.stringify(s.ids) + ' ' + s.unowned);
  const T = s.types;
  check('bug-test: wrong types and out-of-range save values are coerced and clamped (no string maths)',
    T.gold === 5000 && T.gems === 150 && T.sigils === 0 && T.energy === 99 && T.level === 7 && T.might === 4 && T.vit === 25 && T.pass === 1200 && T.cf && T.un === 6 && T.sel === 2 && T.stars === 5 && T.shards === 4 && T.rl === 10, JSON.stringify(T));
  check('bug-test: an unreadable save starts fresh and keeps its bytes aside', s.corrupt.gold === 1500 && s.corrupt.kept === '{"gold": 12', JSON.stringify(s.corrupt));
  check('bug-test: a partial run result writes no NaN', s.partial.xp > 0 && s.partial.kills === 0 && s.partial.legion === 0 && s.partial.gold === 440 && s.partial.passXp > 0, JSON.stringify(s.partial));
  check('bug-test: negative or NaN prices and non-existent pass tiers never pay', s.spend.join() === 'false,false,150,1500' && s.tiers === 'false,false,false,false,false,false' && s.gems === 150, JSON.stringify([s.spend, s.tiers, s.gems]));
  check('bug-test: energy keeps regenerating after the clock is set back a day', s.clock.next <= 360 && s.clock.energy === 11, JSON.stringify(s.clock));

  // boot with a save that names a hero and a relic this build does not have (it used to stop the boot)
  await page.context().addInitScript(() => { if (!sessionStorage.getItem('bt23')) { sessionStorage.setItem('bt23', '1'); localStorage.setItem('soulswarm.save.v1', JSON.stringify({ v: 1, gold: 4242, selectedHero: 'ghost', heroes: { ghost: { owned: true, stars: 1, shards: 0 } }, relics: [{ uid: 'r1', type: 'bogus', rarity: 'rare', level: 1 }], equipped: ['r1', null, null] })); } });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.evaluate(BOT);
  const boot = await page.evaluate(() => ({ battle: !!document.querySelector('.btn-battle'), home: (document.querySelector('.hm')?.innerText || '').trim().length > 0, gold: window.__soulswarm.profile.gold, hero: window.__soulswarm.profile.selectedHero }));
  check('bug-test: the game boots to a working home screen from a save with an unknown hero and relic', boot.battle && boot.home && boot.gold === 4242 && boot.hero === 'vael' && !errors.length, JSON.stringify(boot) + ' ' + (errors[0] || ''));

  // UI races: the rewarded-ad double while the ad loads, and the Starter Pack sheet closed mid-purchase
  const ui = await page.evaluate(async () => {
    const a = window.__soulswarm, p = a.profile, q = (sel) => document.querySelector(sel), wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const ad = a.store.rewardedAd, buy = a.store.purchase;
    a.store.rewardedAd = () => new Promise((r) => setTimeout(() => r(true), 300)); // a real SDK takes a moment to cover the screen
    p.energy = 30; p.flags.bloodMoon = 'off'; a.startRun(1); const r = a.run; r.player.hurt = () => {}; r.time = 300; r.counters.kills = 500;
    const g0 = p.gold; r.end(false); await wait(900);
    const base = p.gold - g0, b = q('.modal-results .btn-ad'); b.click(); b.click(); await wait(80); q('.modal-results .btn-ad')?.click(); await wait(600);
    const doubled = p.gold - g0 - base;
    q('.modal-results .btn-primary').click(); await wait(300);
    a.store.purchase = () => new Promise((res) => setTimeout(() => res({ ok: true, simulated: true }), 400));
    Object.assign(p.purchases, { starterBought: false, starterExpires: Date.now() + 864e5, history: [] }); Object.assign(p.heroes.nyx, { owned: false, stars: 0, shards: 0 }); a.meta.refresh();
    const gems = p.gems;
    q('.hm [data-act="starter"]').click(); await wait(30); q('.mm-starter [data-act="buy"]').click(); await wait(30);
    q('.modal-purchase .btn-primary').click(); await wait(30); q('.modal-purchase').closest('.modal-back').querySelector('.modal-x').click();
    q('.hm [data-act="starter"]')?.click(); await wait(30); q('.mm-starter [data-act="buy"]')?.click(); await wait(30); q('.modal-purchase .btn-primary')?.click();
    await wait(1000);
    const starter = { gems: p.gems - gems, buys: p.purchases.history.length, shards: p.heroes.nyx.shards, owned: p.heroes.nyx.owned };
    document.querySelectorAll('#ui > .modal-back').forEach((m) => m.remove());
    a.store.rewardedAd = ad; a.store.purchase = buy;
    return { base, doubled, starter };
  });
  check('bug-test: "Double rewards" pays once when tapped again while the ad loads', ui.base > 0 && ui.doubled === ui.base, JSON.stringify(ui));
  check('bug-test: closing the store sheet mid-purchase cannot buy the Starter Pack twice', ui.starter.gems === 300 && ui.starter.buys === 1 && ui.starter.owned && ui.starter.shards === 0, JSON.stringify(ui.starter));

  // small phones: a long toast wraps inside a 360 px screen; the results actions are on screen at 375×667
  await page.setViewportSize({ width: 360, height: 780 });
  const toastBox = await page.evaluate(async () => {
    const { toast } = await import('/src/ui/dom.js');
    toast('Clear Ashen Necropolis on Nightmare to unlock Torment');
    await new Promise((r) => setTimeout(r, 400));
    const t = [...document.querySelectorAll('.toast')].pop(), r = t.getBoundingClientRect(), A = document.getElementById('app').getBoundingClientRect();
    const under = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { left: Math.round(r.left - A.left), right: Math.round(A.right - r.right), through: !t.contains(under) };
  });
  check('bug-test: a long toast stays inside a 360 px screen and lets taps through to what is under it', toastBox.left >= 0 && toastBox.right >= 0 && toastBox.through, JSON.stringify(toastBox));
  await page.setViewportSize({ width: 375, height: 667 });
  const res = await page.evaluate(async () => {
    const a = window.__soulswarm, p = a.profile, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    p.energy = 30; p.flags.bloodMoon = 'on'; a.startRun(1); const r = a.run; r.player.hurt = () => {}; r.time = 431; r.end(true); await wait(1200);
    const vis = (sel) => { const e = document.querySelector(sel); if (!e) return 'missing'; const b = e.getBoundingClientRect(), h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return b.bottom <= innerHeight && (h === e || e.contains(h)); };
    const out = { double: vis('.modal-results .btn-ad'), cont: vis('.modal-results .btn-primary') };
    p.flags.bloodMoon = 'off'; document.querySelector('.modal-results .btn-primary').click(); await wait(400);
    // the 28 px top-bar chips, the 26 px hero chip and the settings toggles answer taps 16 px above and below their centre
    const hits = (el) => { const b = el.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2; return [y - 16, y + 16].every((yy) => { const h = document.elementFromPoint(x, yy); return h === el || el.contains(h); }); };
    out.chips = [...document.querySelectorAll('.mt-cur'), document.querySelector('.hm-chip')].map(hits);
    document.querySelector('[data-act="settings"]').click(); await wait(400);
    out.toggles = [...document.querySelectorAll('.st .tgl')].map(hits);
    document.querySelectorAll('#ui > .modal-back').forEach((m) => m.remove());
    return out;
  });
  check('bug-test: the results "Double rewards" and "Continue" are on screen at 375×667', res.double === true && res.cont === true, JSON.stringify(res));
  check('bug-test: top-bar chips, the hero chip and the settings toggles take taps within 16 px of their centre', res.chips.length === 4 && res.chips.every(Boolean) && res.toggles.length === 6 && res.toggles.every(Boolean), JSON.stringify(res));

  // double taps: a dialog button clicked again after it closed, the energy refill, the reroll while its ad loads, and the
  // second tap of a double tap on the results' Continue (it lands on BATTLE at 375×667)
  const dt = await page.evaluate(async () => {
    const a = window.__soulswarm, p = a.profile, q = (sel) => document.querySelector(sel), wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const closeAll = () => document.querySelectorAll('#ui > .modal-back').forEach((m) => m.remove()), out = {};
    p.gems = 500; a.meta.refresh(); q('[data-nav="shop"]').click(); q('.deal[data-key="gold_s"]').click();
    const buy = q('.modal .btn-gem'), g0 = p.gold; buy.click(); buy.click(); out.gemShop = [p.gems, p.gold - g0]; closeAll();
    p.energy = 0; p.gems = 500; a.meta.refresh(); q('[data-top="energy"]').click();
    const rf = q('.mm-energy [data-act="refill"]'); rf.click(); rf.click(); out.refill = [p.gems, p.energy]; closeAll();
    const ad = a.store.rewardedAd; a.store.rewardedAd = () => new Promise((r) => setTimeout(() => r(true), 300));
    q('[data-nav="battle"]').click(); p.energy = 30; a.startRun(1); const r = a.run; r.player.hurt = () => {}; await wait(300);
    r.levelQueue = 1; r.showLevelUp(); await wait(400);
    let redraws = 0; new MutationObserver((ms) => { redraws += ms.filter((m) => m.removedNodes.length).length; }).observe(q('.lvl-back .cards'), { childList: true });
    const rr = q('.lvl-actions .btn-ad'); rr.click(); rr.click(); await wait(800); out.rerolls = redraws; a.store.rewardedAd = ad;
    r.end(false); await wait(1000);
    const c = q('.modal-results .btn-primary').getBoundingClientRect(), x = c.left + c.width / 2, y = c.top + c.height / 2, e0 = p.energy;
    const tapAt = () => { const e = document.elementFromPoint(x, y), b = e.closest('button') || e; for (const k of ['pointerdown', 'pointerup']) b.dispatchEvent(new PointerEvent(k, { bubbles: true, clientX: x, clientY: y })); b.click(); };
    tapAt(); await wait(60); tapAt(); await wait(300);
    out.cont = { run: !!a.run, energy: e0 - p.energy };
    if (a.run) a.exitRun();
    return out;
  });
  check('bug-test: double taps buy once (a dialog button after it closed, the energy refill) and reroll once while the ad loads',
    dt.gemShop.join() === '440,5000' && dt.refill.join() === '450,30' && dt.rerolls === 1, JSON.stringify(dt));
  check('bug-test: a double tap on the results\' Continue does not start another run from the home screen', !dt.cont.run && dt.cont.energy === 0, JSON.stringify(dt.cont));
});
check('menus, economy and save regressions: no runtime errors', !errs.length, errs[0] || '');

// 24. Android back button (src/ui/back.js; Escape on desktop) and flat first-clear gems: back closes the top dialog,
//     pauses and resumes a run, continues from the results, steps the menu back to BATTLE and only then leaves; it
//     never skips a level-up card, the revive prompt or an ad. A Normal first clear pays 50 + 20c gems, and Blood Moon
//     and the double-rewards ad double only the 10 + 2c clear gems in it.
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const { handleBack } = await import('/src/ui/back.js');
    const { modal } = await import('/src/ui/dom.js');
    const eco = await import('/src/meta/economy.js');
    const app = window.__soulswarm, p = app.profile, out = {}, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    p.flags.tutorialDone = true; p.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 };
    out.homeExit = handleBack(app);
    app.meta.show('shop'); out.tabBack = [handleBack(app), app.meta.tab];
    modal({ title: 'x', body: 'y' }); out.close = [handleBack(app), document.querySelectorAll('.modal-back').length];
    app.meta.show('heroes'); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); out.escape = app.meta.tab;
    const ad = document.createElement('div'); ad.className = 'ad-sim'; document.body.appendChild(ad); out.ad = handleBack(app); ad.remove();
    app.engine.manual = true; p.energy = 30; app.startRun(1); let r = app.run;
    out.pause = [handleBack(app), r.paused, !!document.querySelector('.modal-pause')];
    out.resume = [handleBack(app), r.paused, !!document.querySelector('.modal-pause')];
    r.levelQueue = 1; r.showLevelUp(); out.card = [handleBack(app), r.levelPending, !!document.querySelector('.lvl-back')];
    document.querySelector('.lvl-back .card')?.click(); r.t += 0.31; document.querySelector('.lvl-back .card')?.click();
    r.player.invuln = 0; r.player.hurt(1e9); for (let i = 0; i < 40 && !document.querySelector('.modal-revive'); i++) r.update(0.05);
    out.revive = [handleBack(app), !!document.querySelector('.modal-revive'), r.ended];
    [...document.querySelectorAll('.modal-revive .modal-actions .btn')].find((b) => /Give up/.test(b.textContent))?.click();
    for (let i = 0; i < 60 && !document.querySelector('.modal-results'); i++) await wait(50);
    out.results = [handleBack(app), !app.run, !app.meta.el.hidden];
    app.engine.manual = false;
    // first-clear gems: Chapter 2, then a fresh profile with Blood Moon and the ad
    const win = (q, bloodMoon) => eco.applyRunResult(q, { chapter: 2, time: 400, kills: 1200, raised: 200, bestLegion: 90, novas: 3, gates: 6, victory: true, level: 15, bonusGold: 0, heroId: 'vael', endless: false, bossKills: 0, bloodMoon });
    const plain = win(JSON.parse(JSON.stringify(p)), false);
    const q = JSON.parse(JSON.stringify(p)); const bm = win(q, true); const g0 = q.gems; const extra = eco.doubleRunRewards(q, bm.rewards);
    out.gems = { plain: plain.rewards.gems, first: plain.firstClear, bm: bm.rewards.gems, flat: bm.rewards.firstClearGems, adExtra: q.gems - g0, again: win(q, true).rewards.gems };
    return out;
  });
  check('back: leaves only from the home screen; elsewhere it steps back to BATTLE or closes the dialog',
    s.homeExit === 'exit' && s.tabBack.join() === 'home,battle' && s.close.join() === 'close,0' && s.escape === 'battle', JSON.stringify(s));
  check('back: pauses and resumes a run, continues from the results, never skips a card, the revive prompt or an ad',
    s.ad === 'ad' && s.pause.join() === 'pause,true,true' && s.resume.join() === 'resume,false,false' && s.card.join() === 'none,true,true'
    && s.revive.join() === 'none,true,false' && s.results.join() === 'continue,true,true', JSON.stringify(s));
  check('first-clear gems: 50 + 20c in all; Blood Moon and the ad double only the 10 + 2c clear gems',
    s.gems.first && s.gems.plain === 90 && s.gems.bm === 14 * 2 + 76 && s.gems.flat === 76 && s.gems.adExtra === 28 && s.gems.again === 28, JSON.stringify(s.gems));
});
check('back button and first-clear gems: no runtime errors', !errs.length, errs[0] || '');

// 25. Trusted clock (meta/clock.js): server time for daily resets. Sources are stubbed (window.fetch) and the device
//     clock is a stand-in (clock.qa.device), so the protections stay on. Winding the clock back gains nothing, an
//     offline wind-forward then a server correction re-grants nothing, and the latest day survives a reload.
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const C = window.__soulswarm.clock, eco = await import('/src/meta/economy.js'); // the game's own clock instance
    const app = window.__soulswarm, p = app.profile, out = {}, realFetch = window.fetch;
    const T0 = new Date(2026, 9, 7, 12).getTime(), DAY = 864e5;
    const serve = (body, headers = {}) => { window.fetch = async () => new Response(body, { status: 200, headers }); };
    serve('ts=0\n'); await C.sync(); // let any boot sync settle first
    // each answer format sets the clock (server = T0 + 3 days, whatever the device says)
    const formats = { trace: [`fl=1\nts=${(T0 + 3 * DAY) / 1000}\nvisit_scheme=https`], json: [JSON.stringify({ now: T0 + 3 * DAY })],
      dateTime: [JSON.stringify({ dateTime: new Date(T0 + 3 * DAY).toISOString().slice(0, 23) })], header: ['', { date: new Date(T0 + 3 * DAY).toUTCString() }] };
    out.formats = {};
    for (const [k, [body, hd]] of Object.entries(formats)) {
      C.qa.reset(); C.qa.device(() => T0); serve(body, hd);
      const ok = await C.sync(); out.formats[k] = ok && C.isSynced() && Math.abs(C.now() - (T0 + 3 * DAY)) < 2500;
    }
    C.qa.reset(); serve(JSON.stringify({ now: 0 })); out.rejects = !(await C.sync()) && !C.isSynced();
    // offline: winding the device clock back re-grants no daily reward and no energy
    C.qa.reset(); window.fetch = realFetch; C.qa.device(() => T0);
    p.energy = 5; p.energyTs = C.now(); eco.claimLogin(p); eco.claimFreeChest(p); const day0 = C.today();
    C.qa.device(() => T0 - 2 * DAY); eco.upkeep(p);
    out.back = { day: C.today() === day0, login: eco.loginState(p).canClaim, chest: eco.freeChestAvailable(p), energy: p.energy, now: C.now() === T0 };
    C.qa.device(() => T0 + DAY + 3600e3); out.next = { login: eco.loginState(p).canClaim, day: C.today() > day0 };
    // offline wind-forward (+3 days), claim, then the server says T0: the day stays put, nothing is claimable again
    C.qa.reset(); C.qa.device(() => T0 + 3 * DAY); p.login.lastClaim = ''; eco.claimLogin(p); const fwd = C.today();
    serve(JSON.stringify({ now: T0 })); await C.sync();
    out.correction = { synced: C.isSynced(), now: Math.abs(C.now() - T0) < 2500, day: C.today() === fwd, login: eco.loginState(p).canClaim };
    // the save keeps the latest day; after a reload (reset + restore) the device clock cannot pull it back
    const snap = C.snapshot(); C.qa.reset(); C.qa.device(() => T0 - 2 * DAY); C.restore(snap);
    out.reload = { day: C.today() === fwd, floor: C.now() >= snap.t };
    // a failed sync on resume falls back to the (floored) device clock
    serve(JSON.stringify({ now: T0 + 5 * DAY })); await C.sync(); const t1 = C.now();
    window.fetch = async () => { throw new Error('offline'); }; await C.sync({ resume: true });
    out.resume = { synced: C.isSynced(), floored: C.now() >= t1 - 5 };
    window.fetch = realFetch; C.qa.reset();
    return out;
  });
  check('clock: syncs from a Cloudflare trace, JSON (now / dateTime) or a Date header; rejects implausible answers',
    Object.values(s.formats).every(Boolean) && s.rejects, JSON.stringify({ f: s.formats, r: s.rejects }));
  check('clock: winding the device clock back re-grants nothing (login, free chest, energy); the next real day does',
    s.back.day && !s.back.login && !s.back.chest && s.back.energy === 5 && s.back.now && s.next.login && s.next.day, JSON.stringify({ b: s.back, n: s.next }));
  check('clock: an offline wind-forward, then server time: the day holds and nothing is claimable twice',
    s.correction.synced && s.correction.now && s.correction.day && !s.correction.login, JSON.stringify(s.correction));
  check('clock: the latest day survives a reload; a failed resume sync falls back to the floored device clock',
    s.reload.day && s.reload.floor && !s.resume.synced && s.resume.floored, JSON.stringify({ r: s.reload, res: s.resume }));
});
check('clock: no runtime errors', !errs.length, errs[0] || '');

// 26. Voice lines (src/assets/voice, VOICE in data.js, played by audio.js). Static: every line the code asks for exists
//     and every file has its rules. Engine: all lines decode, one plays at a time, priorities cut in, important lines
//     queue, cooldowns hold, mute / volume 0 silence it, the mix ducks under a line. Hooks: the game asks for the right
//     line at each moment (spied on the facade).
{
  const { readFileSync, readdirSync } = await import('node:fs');
  const root = new globalThis.URL('../', import.meta.url).pathname;
  const files = readdirSync(root + 'src/assets/voice').filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4));
  const src = ['src/game/run.js', 'src/game/streak.js', 'src/game/events.js', 'src/game/rites.js', 'src/ui/meta/heroes.js', 'src/ui/meta/panels.js']
    .map((f) => readFileSync(root + f, 'utf8')).join('\n') + readFileSync(root + 'src/game/data.js', 'utf8');
  const asked = new Set([...src.matchAll(/voice\('([a-z_]+)'\)/g), ...src.matchAll(/'(a_[a-z_]+)'/g)].map((m) => m[1]));
  const heroes = ['vael', 'nyx', 'seraphine', 'liora', 'grimsby', 'mordrake', 'osric'];
  for (const h of heroes) asked.add(h + '_rite').add(h + '_greet');
  const missing = [...asked].filter((n) => !files.includes(n) && !/^a_(normal)$/.test(n));
  check('voice: 48 lines, and every line the code asks for has a file', files.length === 48 && !missing.length, `files=${files.length} missing=${missing}`);
}
errs = await session(async (page) => {
  await page.mouse.click(5, 420); // the audio context needs a gesture
  await page.waitForFunction(() => { const s = window.__soulswarm.audio.voiceState(); return s && s.loaded === s.lines; }, null, { timeout: 30000 });
  const s = await page.evaluate(async () => {
    const A = window.__soulswarm.audio, { VOICE } = await import('/src/game/data.js'), out = {};
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const st = A.voiceState(); out.decoded = st.loaded === st.lines && st.lines === 48;
    out.rules = Object.keys(VOICE.lines).length > 20;
    const r = [];
    r.push(A.voice('a_carnage')); await sleep(120); out.duck = A.voiceState().duck;
    r.push(A.voice('a_massacre'), A.voice('a_carnage'), A.voice('a_elite'), A.voice('a_thief'), A.voice('a_nova'), A.voice('a_boss'));
    out.r = r.join(',');
    out.mid = { p: A.voiceState().playing, q: A.voiceState().queued };
    await sleep(3500);
    out.after = { p: A.voiceState().playing, duck: A.voiceState().duck };
    A.setMuted(true); out.muted = A.voice('a_trial'); A.setMuted(false);
    A.setVolumes({ voice: 0 }); out.vol0 = A.voice('a_trial'); A.setVolumes({ voice: 0.9 });
    out.cd = [A.voice('nyx_rite'), (await sleep(2400), A.voice('nyx_rite'))].join(',');
    out.unknown = A.voice('a_nope');
    return out;
  });
  check('voice: all 48 lines decode after the first tap', s.decoded && s.rules, JSON.stringify(s));
  check('voice: one line at a time; a bigger streak or a more important line cuts in, an important line queues, the rest drop',
    s.r === 'play,play,cooldown,play,queued,busy,play' && s.mid.p === 'a_boss' && s.mid.q === 'a_thief', JSON.stringify({ r: s.r, mid: s.mid }));
  check('voice: music and sfx duck under a line and swell back', s.duck < 0.6 && s.after.duck > 0.99 && !s.after.p, JSON.stringify({ d: s.duck, a: s.after }));
  check('voice: mute and a zero Voice volume silence it; cooldowns hold; unknown lines are ignored',
    s.muted === 'muted' && s.vol0 === 'muted' && s.cd === 'play,cooldown' && s.unknown === 'unknown', JSON.stringify(s));
  // hooks: spy on the facade and drive each moment directly
  const h = await page.evaluate(async () => {
    const app = window.__soulswarm, asked = [], real = app.audio.voice;
    app.audio.voice = (n) => { asked.push(n); return real(n); };
    const p = app.profile; p.heroes.liora.owned = true; p.selectedHero = 'liora';
    app.startRun(1); app.engine.manual = true;
    const run = app.run, step = (n = 1) => { for (let i = 0; i < n; i++) run.update(1 / 30); };
    step(5);
    const mark = (k) => { const out = asked.slice(); asked.length = 0; return [k, out]; }, got = [];
    run.streak.tier = 0; run.streak.stingAt = -1e9; run.streak.tierUp(); run.streak.tierUp(); run.streak.update(1 / 30); got.push(mark('streak'));
    run.time = run.eliteTimes[run.eliteIdx]; step(); got.push(mark('elite'));
    run.events.start('thief'); got.push(mark('thief'));
    run.events.cur = null; run.events.start('shrine'); got.push(mark('shrine'));
    run.events.cur = null; run.events.start('coffin'); got.push(mark('coffin'));
    run.rites.cd = 0; run.rites.trigger(); got.push(mark('rite'));
    run.novaSize = 60; run.novaRelease(); got.push(mark('nova'));
    run.celebrateEvolution({ name: 'Test Evolution' }); got.push(mark('evolution'));
    run.time = run.nextBossAt - 7.9; step(); got.push(mark('boss'));
    run.onPlayerDeath(); got.push(mark('defeat'));
    run.revive(); got.push(mark('revive'));
    run.onBossKilled(run.player.x, run.player.z); got.push(mark('slain'));
    app.exitRun && app.exitRun();
    p.chapter.unlocked = Math.max(p.chapter.unlocked, 2); // the Daily Trial opens after chapter 1
    app.startRun(1, { trial: true }); app.engine.manual = true;
    for (let i = 0; i < 130; i++) app.run.update(1 / 30);
    got.push(mark('trial'));
    app.exitRun && app.exitRun();
    app.engine.manual = false;
    app.meta.show('heroes'); await new Promise((r) => setTimeout(r, 200));
    document.querySelector('.hcard[data-id="seraphine"]')?.click(); await new Promise((r) => setTimeout(r, 200));
    got.push(mark('greet'));
    app.audio.voice = real;
    return Object.fromEntries(got);
  });
  const want = { streak: ['a_massacre'], elite: ['a_elite'], thief: ['a_thief'], shrine: ['a_shrine'], coffin: ['a_coffin'], rite: ['liora_rite'],
    nova: ['a_nova'], evolution: ['a_evolution'], boss: ['a_boss'], defeat: ['a_defeat'], revive: ['a_revive'], slain: ['a_boss_slain', 'a_cleared'],
    trial: ['a_trial'], greet: ['seraphine_greet'] };
  const bad = Object.entries(want).filter(([k, v]) => !v.every((n) => (h[k] || []).includes(n)));
  check('voice: each moment asks for its line (streak tier, elite, events, Rite, Nova, evolution, boss, defeat, revive, clear, trial, hero screen)',
    !bad.length, JSON.stringify(bad.length ? Object.fromEntries(bad.map(([k]) => [k, h[k]])) : h));
});
check('voice: no runtime errors', !errs.length, errs[0] || '');

// 27. The Bestiary and chapter art. Kills per foe type in a run (gilded elites count as their base type; the Soul Thief and
//     Gravemaw too, Cursed Coffins never), carried in the run result and added up by applyRunResult; locked entries show a
//     silhouette and "???" until the first kill; each milestone claims once, in order, for its reward; the Heroes tab dot;
//     old saves migrate. The home chapter card wears the selected chapter's painting and cross-fades on a change; the run
//     intro card names the chapter, its twist, the difficulty and Blood Moon in the top third, takes no input, and goes.
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const eco = await import('/src/meta/economy.js'), save = await import('/src/meta/save.js'), { BESTIARY } = await import('/src/game/data.js');
    const app = window.__soulswarm, p = app.profile, out = {}, q = (sel) => document.querySelector(sel), wait = (ms) => new Promise((r) => setTimeout(r, ms));
    p.flags.tutorialDone = true; p.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 }; p.flags.bloodMoon = 'off'; p.chapter.unlocked = 6;
    // a run: two of each foe, a gilded Brute, a Soul Thief, a Cursed Coffin, then Gravemaw; the result carries the tally
    const start = (ch, opts = {}) => { p.energy = 30; app.engine.manual = true; app.startRun(ch, opts); const r = app.run; r.spawnAcc = -1e9; r.nextGate = r.nextSwarm = 1e9; r.eliteIdx = 99; r.events.director = () => {}; r.player.hurt = () => {}; return r; };
    let r = start(1); const P = r.player;
    for (const t of ['husk', 'ghoul', 'brute', 'witch', 'bloater']) for (let i = 0; i < 2; i++) r.enemies.kill(r.spawnEnemy(t, { at: { x: P.x + 6, z: P.z + i } }), 'bolt');
    r.enemies.kill(r.spawnEnemy('brute', { elite: true, at: { x: P.x - 6, z: P.z } }), 'bolt');
    r.events.start('thief', { x: P.x + 5, z: P.z }); r.enemies.damage(r.events.cur.e, 1e9, { silent: true }); r.events.cur = null;
    r.events.start('coffin', { x: P.x - 5, z: P.z }); r.enemies.damage(r.events.cur.e, 1e9, { silent: true }); r.events.cur = null; // broken (its wave never comes)
    r.update(1 / 30);
    const mid = { ...r.counters.byType, kills: r.counters.kills };
    r.boss.spawn(); r.bossSpawned = true; r.enemies.kill(r.bossEnemy, 'bolt');
    out.run = { mid, end: { ...r.counters.byType } };
    const k0 = { ...p.bestiary.kills };
    let result = null; const onEnd = r.onEnd; r.onEnd = (res) => { result = res; onEnd(res); };
    for (let i = 0; i < 160 && !r.ended; i++) { if (r.levelPending) q('.lvl-back .card')?.click(); r.update(0.05); }
    out.result = result && result.byType; out.added = Object.fromEntries(BESTIARY.order.map((id) => [id, p.bestiary.kills[id] - k0[id]]));
    for (let i = 0; i < 40 && !q('.modal-results'); i++) await wait(50);
    out.resArt = (q('.res-head.has-art')?.getAttribute('style') || '').includes('chapter-1');
    q('.modal-results .btn-primary')?.click(); await wait(200);
    // Endless: every Gravemaw kill counts, and the run goes on
    r = start(6); r.boss.spawn(); r.bossSpawned = true; r.enemies.kill(r.bossEnemy, 'bolt');
    out.endless = { gm: r.counters.byType.gravemaw, ended: r.ended, kills: r.bossKills }; app.exitRun();
    // applyRunResult adds known ids only and ignores junk
    const t = save.newProfile(); t.flags.bloodMoon = 'off';
    eco.applyRunResult(t, { chapter: 1, time: 100, kills: 60, victory: false, byType: { husk: 50, ghoul: '7', brute: -3, witch: NaN, bloater: 1e12, thief: 1.9, gravemaw: 0, junk: 5 } });
    eco.applyRunResult(t, { chapter: 1, time: 100, kills: 10, victory: false, byType: { husk: 10 } });
    eco.applyRunResult(t, { chapter: 1, time: 100, kills: 10, victory: false });
    out.acc = { ...t.bestiary.kills, junk: 'junk' in t.bestiary.kills };
    // the sub-tab: silhouettes and "???" until the first kill; claims in order, each once; rewards; the nav dot
    Object.assign(p.bestiary.kills, { husk: 10000, ghoul: 0, brute: 0, witch: 0, bloater: 0, thief: 0, gravemaw: 0 });
    Object.assign(p.bestiary.claimed, { husk: 0, ghoul: 0, brute: 0, witch: 0, bloater: 0, thief: 0, gravemaw: 0 });
    for (const id of Object.keys(p.heroes)) p.heroes[id].shards = 0; // no hero rank-up dot
    app.meta.show('heroes'); await wait(250); q('[data-sub="bestiary"]').click(); await wait(100);
    const card = (id) => q(`.bcard[data-id="${id}"]`), img = card('husk').querySelector('img');
    await img.decode().catch(() => {});
    out.cards = { n: document.querySelectorAll('.bcard').length, husk: [card('husk').classList.contains('is-locked'), card('husk').querySelector('.bcard-name').textContent],
      ghoul: [card('ghoul').classList.contains('is-locked'), card('ghoul').querySelector('.bcard-name').textContent, getComputedStyle(card('ghoul').querySelector('img')).filter !== 'none'],
      img: img.naturalWidth > 0 };
    out.dots = { nav: !q('[data-nav="heroes"] .badge-dot').hidden, sub: !!q('[data-sub="bestiary"] .badge-dot'), card: !!card('husk').querySelector('.badge-dot') };
    p.bestiary.kills.ghoul = 1; eco.commit(p); await wait(50);
    out.unlock = [card('ghoul').classList.contains('is-locked'), card('ghoul').querySelector('.bcard-name').textContent];
    card('husk').click(); await wait(100);
    const before = { gold: p.gold, sigils: p.sigils, gems: p.gems }, claims = [];
    for (let i = 0; i < 3; i++) {
      const b = q(`.mm-foe [data-tier="${i}"]`); if (!b) { claims.push('missing'); continue; }
      b.click(); b.click(); await wait(60); // a double tap claims once
      claims.push(p.bestiary.claimed.husk);
      document.querySelectorAll('#ui > .modal-back').forEach((m) => { if (!m.querySelector('.mm-foe')) m.remove(); }); // the reward popup
    }
    out.claims = { claims, gained: { gold: p.gold - before.gold, sigils: p.sigils - before.sigils, gems: p.gems - before.gems }, again: eco.claimBestiary(p, 'husk'),
      order: eco.claimBestiary(p, 'ghoul'), bogus: eco.claimBestiary(p, 'toString'), checks: document.querySelectorAll('.mm-foe .q-done').length };
    document.querySelectorAll('#ui > .modal-back').forEach((m) => m.remove());
    eco.commit(p); await wait(50);
    out.dotsAfter = { nav: !q('[data-nav="heroes"] .badge-dot').hidden, sub: !!q('[data-sub="bestiary"] .badge-dot'), complete: !!card('husk').querySelector('.bcard-max') };
    // old saves: a profile without the block migrates (Gravemaw seeded from clears); junk values are coerced
    const KEY = 'soulswarm.save.v1', load = (v) => { localStorage.setItem(KEY, JSON.stringify(v)); const x = save.loadProfile(); localStorage.removeItem(KEY); return x; };
    let o = load({ v: 1, gold: 999, stats: { runs: 12, kills: 9000, bestLegion: 80, raised: 100, clears: 7, bestStreak: 0 } });
    out.migrate = { kills: o.bestiary.kills, claimed: o.bestiary.claimed, gold: o.gold, n: eco.notifications(o).bestiary };
    o = load({ v: 1, bestiary: { kills: { husk: '250', ghoul: -4, brute: 'x', thief: 2 }, claimed: { husk: 9, ghoul: '1', witch: -1 } } });
    out.coerce = { kills: o.bestiary.kills, claimed: o.bestiary.claimed };
    out.nullSave = (() => { try { localStorage.setItem(KEY, 'null'); const x = save.loadProfile(); localStorage.removeItem(KEY); return x.bestiary.kills.gravemaw === 0; } catch (e) { return e.message; } })();
    return out;
  });
  const R = s.run;
  check('bestiary: a run counts kills per foe type (a gilded Brute as a Brute; the Soul Thief and Gravemaw; never a Cursed Coffin)',
    R.mid.husk === 2 && R.mid.ghoul === 2 && R.mid.brute === 3 && R.mid.witch === 2 && R.mid.bloater === 2 && R.mid.thief === 1 && R.mid.gravemaw === 0 && R.end.gravemaw === 1
    && R.mid.kills === 11 && s.endless.gm === 1 && !s.endless.ended && s.endless.kills === 1, JSON.stringify({ R, e: s.endless }));
  check('bestiary: the run result carries the tally and applyRunResult adds it to the profile (junk ignored)',
    JSON.stringify(s.result) === JSON.stringify(R.end) && JSON.stringify(s.added) === JSON.stringify(R.end)
    && s.acc.husk === 60 && s.acc.ghoul === 7 && s.acc.brute === 0 && s.acc.witch === 0 && s.acc.bloater === 0 && s.acc.thief === 1 && s.acc.gravemaw === 0 && !s.acc.junk, JSON.stringify({ result: s.result, added: s.added, acc: s.acc }));
  check('bestiary: 13 painted entries (8 foes, 5 bosses); silhouette and "???" until the first kill, then the name', s.cards.n === 13 && s.cards.husk.join() === 'false,Husk'
    && s.cards.ghoul.join() === 'true,???,true' && s.cards.img && s.unlock.join() === 'false,Ghoul', JSON.stringify({ c: s.cards, u: s.unlock }));
  check('bestiary: milestones claim in order and once each (double taps too) for 2,000 gold, 1 sigil and 50 gems',
    s.claims.claims.join() === '1,2,3' && s.claims.gained.gold === 2000 && s.claims.gained.sigils === 1 && s.claims.gained.gems === 50
    && s.claims.again === null && s.claims.order === null && s.claims.bogus === null && s.claims.checks === 3, JSON.stringify(s.claims));
  check('bestiary: the Heroes tab, the BESTIARY sub-tab and the card show a dot while a milestone waits, and clear after',
    s.dots.nav && s.dots.sub && s.dots.card && !s.dotsAfter.nav && !s.dotsAfter.sub && s.dotsAfter.complete, JSON.stringify({ d: s.dots, a: s.dotsAfter }));
  const M = s.migrate, C = s.coerce;
  check('bestiary: an old save without the block migrates (Gravemaw seeded from clears); junk values are coerced',
    M.gold === 999 && M.kills.husk === 0 && M.kills.gravemaw === 7 && Object.values(M.claimed).every((v) => v === 0) && M.n === 1
    && C.kills.husk === 250 && C.kills.ghoul === 0 && C.kills.brute === 0 && C.kills.thief === 2 && C.kills.gravemaw === 0 && C.claimed.husk === 3 && C.claimed.ghoul === 1 && C.claimed.witch === 0
    && s.nullSave === true, JSON.stringify({ M, C, n: s.nullSave }));
  check('results: a faint chapter painting behind the header', s.resArt, String(s.resArt));

  // the home chapter card wears the selected chapter's painting and cross-fades when it changes; Endless is chapter-6
  const h = await page.evaluate(async () => {
    const app = window.__soulswarm, p = app.profile, q = (sel) => document.querySelector(sel), wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const art = () => { const c = q('.chap'), l = [...c.querySelectorAll('.chap-art')]; const top = l[l.length - 1], cr = c.getBoundingClientRect(), ar = top.getBoundingClientRect();
      return { sel: c.dataset.art, url: getComputedStyle(top).backgroundImage, layers: l.length, fade: top.classList.contains('chap-art-in'), cover: Math.abs(cr.width - ar.width) < 1 && Math.abs(cr.height - ar.height) < 1 }; };
    p.chapter.selected = 2; app.meta.show('battle'); await wait(200);
    const a = art(), hgt = q('.chap').getBoundingClientRect().height;
    q('.chap-arrow[data-act="next"]').click(); await wait(80);
    const b = art(), hgt2 = q('.chap').getBoundingClientRect().height, low = q('.chap').querySelector('.chap-art:not(.chap-art-in)'), under = low ? getComputedStyle(low).backgroundImage : '';
    p.chapter.selected = 6; app.meta.refresh(); await wait(80);
    const e = art();
    return { a, b, e, hgt, hgt2, under };
  });
  check('chapter art: the home card shows the selected chapter\'s painting and cross-fades to the next one (Endless: chapter-6)',
    h.a.sel === '2' && /chapter-2/.test(h.a.url) && h.a.cover && h.b.sel === '3' && /chapter-3/.test(h.b.url) && h.b.layers === 2 && h.b.fade && /chapter-2/.test(h.under)
    && /chapter-6/.test(h.e.url) && Math.abs(h.hgt - h.hgt2) < 1, JSON.stringify(h));

  // the run intro card: chapter, twist, difficulty and Blood Moon, in the top third, no input, then gone; banners keep their slot
  const ri = await page.evaluate(async () => {
    const app = window.__soulswarm, p = app.profile, q = (sel) => document.querySelector(sel), wait = (ms) => new Promise((r) => setTimeout(r, ms)), out = {};
    for (let c = 1; c <= 5; c++) p.chapter.best[c] = { time: 420, cleared: true, kills: 0 };
    p.diff.best[2] = { nightmare: { time: 420, legion: 0, kills: 0, cleared: true } }; p.flags.bloodMoon = 'on'; p.energy = 30;
    app.startRun(2, { difficulty: 'nightmare' }); const r = app.run; app.engine.manual = true; r.player.hurt = () => {};
    const el = q('.run-intro'), rc = el.getBoundingClientRect();
    const pts = [[0.5, 0.2], [0.15, 0.5], [0.85, 0.5], [0.5, 0.85]].map(([fx, fy]) => document.elementFromPoint(rc.left + rc.width * fx, rc.top + rc.height * fy));
    out.card = { ch: el.dataset.ch, name: q('.ri-name').textContent, tag: q('.ri-tag').textContent, kick: q('.ri-kick').textContent, pe: getComputedStyle(el).pointerEvents,
      hits: pts.filter((n) => n && n.closest('.run-intro')).length, bottom: Math.round(rc.bottom), third: Math.round(innerHeight / 3), art: /chapter-2/.test(getComputedStyle(q('.ri-art')).backgroundImage), rf: el.classList.contains('rf') };
    // no chapter banner at 0:00.6 any more; the Blood Moon banner still opens at 0:03.6
    for (let i = 0; i < 30; i++) r.update(1 / 30);
    out.at1 = q('.banner b')?.textContent || '';
    for (let i = 0; i < 90; i++) r.update(1 / 30);
    out.at4 = q('.banner b')?.textContent || '';
    let gone = false; for (let i = 0; i < 80 && !gone; i++) { await wait(100); gone = !q('.run-intro'); }
    out.gone = gone && !q('.hud').classList.contains('intro-on');
    app.exitRun(); p.flags.bloodMoon = 'off';
    // Endless names the first rotation's twist; Chapter 1 has its own line; Reduce flashes calms it; the Daily Trial keeps its banner
    p.settings.reduceFlash = true; p.energy = 30; app.startRun(6);
    out.endless = { name: q('.ri-name').textContent, tag: q('.ri-tag').textContent, kick: q('.ri-kick').textContent, rf: q('.run-intro').classList.contains('rf'), art: /chapter-6/.test(getComputedStyle(q('.ri-art')).backgroundImage) };
    app.exitRun(); p.settings.reduceFlash = false; p.energy = 30; app.startRun(1);
    out.ch1 = { tag: q('.ri-tag').textContent, pills: document.querySelectorAll('.ri-pill').length };
    app.exitRun(); p.trial.done = false; app.startRun(0, { trial: true }); const tr = app.run; app.engine.manual = true; tr.player.hurt = () => {};
    out.trial = { kick: q('.ri-kick').textContent };
    for (let i = 0; i < 120; i++) tr.update(1 / 30);
    out.trial.banner = q('.banner b')?.textContent || '';
    app.exitRun(); app.engine.manual = false;
    return out;
  });
  const K = ri.card;
  check('run intro: names the chapter, its twist, Nightmare and Blood Moon over the painting, in the top third',
    K.ch === '2' && K.name === 'Ember Wastes' && /fire lingers/.test(K.tag) && /Chapter II/.test(K.kick) && /Nightmare/.test(K.kick) && /Blood Moon/.test(K.kick) && K.art && !K.rf && K.bottom <= K.third, JSON.stringify(K));
  check('run intro: takes no input (pointer-events off, taps fall through), then fades and goes; it replaces the chapter banner',
    K.pe === 'none' && K.hits === 0 && ri.gone && ri.at1 === '' && ri.at4 === 'BLOOD MOON', JSON.stringify({ pe: K.pe, hits: K.hits, gone: ri.gone, at1: ri.at1, at4: ri.at4 }));
  check('run intro: Endless (its first twist, chapter-6, Reduce flashes), Chapter 1 and the Daily Trial (its banner still opens at 0:03.6)',
    ri.endless.name === 'Endless Abyss' && /^Ember Wastes: /.test(ri.endless.tag) && ri.endless.kick === 'Endless' && ri.endless.rf && ri.endless.art
    && /Hollow King/.test(ri.ch1.tag) && ri.ch1.pills === 0 && /Daily Trial/.test(ri.trial.kick) && ri.trial.banner === 'DAILY TRIAL', JSON.stringify({ e: ri.endless, c: ri.ch1, t: ri.trial }));
});
check('bestiary and chapter art: no runtime errors', !errs.length, errs[0] || '');

// 28. No black screens from NaN. Some GPUs (Apple's among them) return NaN for pow() of a negative, and the bloom blur
//     smeared one such pixel row on the Hollow King's arena wall into a screen-wide blackout. Lint: every shader pow() of
//     "1.0 - x" is guarded. Runtime: a 12 x 12 px quad of NaN (and one of Inf) in a live run must stay a speck.
{
  const { readFileSync, readdirSync } = await import('node:fs');
  const root = new globalThis.URL('../', import.meta.url).pathname, files = [];
  const walk = (d) => { for (const f of readdirSync(root + d, { withFileTypes: true })) f.isDirectory() ? walk(d + f.name + '/') : f.name.endsWith('.js') && files.push(d + f.name); };
  walk('src/');
  const bad = [];
  for (const f of files) readFileSync(root + f, 'utf8').split('\n').forEach((l, i) => { if (/pow\(\s*1\.0\s*-(?!\s*(?:clamp|min)\()/.test(l)) bad.push(`${f}:${i + 1}`); });
  check('shaders: no unguarded pow(1.0 - x) (NaN on some GPUs when x creeps past 1)', !bad.length, bad.join(', '));
}
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const T = await import('/node_modules/.vite/deps/three.js');
    const app = window.__soulswarm, E = app.engine;
    app.profile.flags.tutorialDone = true; app.profile.flags.bloodMoon = 'off'; app.startRun(1); E.manual = true; // (a weekend's darker blood-red ground reads as black)
    const run = app.run; run.player.hurt = () => {};
    for (let i = 0; i < 20; i++) E.step(1 / 30);
    const gl = E.renderer.getContext(), out = {};
    const black = () => { E.step(1 / 30); const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, S = 160, px = new Uint8Array(4 * S * S);
      gl.readPixels((W >> 1) - S / 2, (H >> 1) - S / 2, S, S, gl.RGBA, gl.UNSIGNED_BYTE, px); let n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] < 4) n++; return n; };
    out.base = black();
    for (const [k, expr] of [['nan', 'uZ / uZ'], ['inf', '1.0 / uZ']]) {
      const q = new T.Mesh(new T.PlaneGeometry(2, 2), new T.ShaderMaterial({ depthTest: false, depthWrite: false,
        vertexShader: 'uniform vec2 uS; void main(){ gl_Position = vec4(position.xy * uS, 0.0, 1.0); }',
        fragmentShader: `uniform float uZ; void main(){ gl_FragColor = vec4(vec3(${expr}), 1.0); }`,
        uniforms: { uZ: { value: 0 }, uS: { value: new T.Vector2(12 / gl.drawingBufferWidth, 12 / gl.drawingBufferHeight) } } }));
      q.frustumCulled = false; q.renderOrder = 99; run.scene.add(q);
      out[k] = black(); run.scene.remove(q); q.geometry.dispose(); q.material.dispose();
    }
    out.after = black();
    return out;
  });
  check('post: a NaN or Inf pixel patch stays a speck (bloom no longer spreads it into a black screen)',
    s.base < 50 && s.nan <= 400 && s.inf <= 400 && s.after < 50, JSON.stringify(s));
});
check('NaN guard: no runtime errors', !errs.length, errs[0] || '');

// 29. Painted 3D Shepherds (engine/heromodels.js; models built from Higgsfield turnaround sheets by scripts/hero-models.sh).
//     Every hero and the Eclipse Vael skin loads a textured model of sane size, standing on the ground and facing +Z; a run
//     and the home showcase swap it in for the procedural model; an unknown model resolves to null (the fallback stays).
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const app = window.__soulswarm, H = app.heroModels, out = { models: {} }; // the game's own instance (see section 25)
    for (const id of ['vael', 'nyx', 'seraphine', 'liora', 'grimsby', 'mordrake', 'osric', 'eclipse_vael']) {
      const m = await H.loadHeroModel(id);
      if (!m) { out.models[id] = null; continue; }
      const g = m.geometry, b = g.boundingBox, tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
      out.models[id] = { tris: Math.round(tris), h: +(b.max.y - b.min.y).toFixed(2), floor: +b.min.y.toFixed(3), uv: !!g.attributes.uv, normal: !!g.attributes.normal,
        tex: m.map && m.map.image ? m.map.image.width : 0, same: H.heroModel(id) === m };
    }
    out.none = await H.loadHeroModel('nobody');
    // a run puts the painted model on the Shepherd (shared geometry, textured material)
    const p = app.profile; p.heroes.seraphine.owned = true; p.selectedHero = 'seraphine'; p.flags.tutorialDone = true;
    app.startRun(1); app.engine.manual = true;
    await new Promise((r) => setTimeout(r, 50));
    const pl = app.run.player;
    out.run = { painted: !!pl.painted, shared: pl.mesh.geometry === H.heroModel('seraphine').geometry, textured: !!(pl.mat.defines && 'USE_HEROMAP' in pl.mat.defines) };
    for (let i = 0; i < 30; i++) app.engine.step(1 / 30);
    app.exitRun(); app.engine.manual = false;
    // the home showcase follows the selected hero (and the skin)
    app.showcase.setHero('mordrake', p);
    await new Promise((r) => setTimeout(r, 50));
    out.show = { mordrake: app.showcase.hero.geometry === H.heroModel('mordrake').geometry };
    p.skins = { ...(p.skins || {}), eclipse_vael: true }; p.equippedSkin = 'eclipse_vael'; p.heroes.vael.owned = true;
    app.showcase.setHero('vael', p);
    await new Promise((r) => setTimeout(r, 50));
    out.show.eclipse = app.showcase.hero.geometry === H.heroModel('eclipse_vael').geometry;
    return out;
  });
  const bad = Object.entries(s.models).filter(([, m]) => !m || m.tris < 4000 || m.tris > 30000 || m.h < 1.8 || m.h > 2.9 || Math.abs(m.floor) > 0.01 || !m.uv || !m.normal || m.tex !== 1024 || !m.same);
  check('3D heroes: all seven heroes and the Eclipse Vael skin load a textured model (4k-30k triangles, on the ground, 1024 px paint)', !bad.length, JSON.stringify(bad.length ? bad : s.models));
  check('3D heroes: a run swaps the painted model onto the Shepherd; the home showcase shows it (and the skin\'s); a missing model resolves to null',
    s.run.painted && s.run.shared && s.run.textured && s.show.mordrake && s.show.eclipse && s.none === null, JSON.stringify({ run: s.run, show: s.show, none: s.none }));
});
check('3D heroes: no runtime errors', !errs.length, errs[0] || '');

// 30. Animated Shepherds (engine/heromodels.js HeroRig; rigs and clips from scripts/hero-models.sh). Every model is
//     skinned (24 bones, facing +Z) with a run and an idle; in a run the Shepherd runs while moving (the stride paced to
//     the ground speed) and idles when still, its posed bounds stay sane, and the rig is freed with the run; the home
//     showcase idles too and swaps rigs cleanly; Nyx's dash afterimages still copy the bind pose.
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const app = window.__soulswarm, H = app.heroModels, E = app.engine, out = { rigs: {} };
    const V = (o) => o.getWorldPosition(new (o.position.constructor)());
    for (const id of ['vael', 'nyx', 'seraphine', 'liora', 'grimsby', 'mordrake', 'osric', 'eclipse_vael']) {
      const m = await H.loadHeroModel(id), r = m && m.rig;
      if (!r) { out.rigs[id] = null; continue; }
      let mesh = null; r.scene.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
      const bone = (n) => mesh.skeleton.bones.find((b) => b.name === n);
      r.scene.updateMatrixWorld(true);
      out.rigs[id] = { bones: mesh ? mesh.skeleton.bones.length : 0, run: +r.clips.run.duration.toFixed(2), idle: +r.clips.idle.duration.toFixed(2),
        facingZ: mesh ? V(bone('LeftUpLeg')).x > V(bone('RightUpLeg')).x : false };
    }
    const p = app.profile; p.heroes.mordrake.owned = true; p.selectedHero = 'mordrake'; p.equippedSkin = null; p.flags.tutorialDone = true;
    app.startRun(1); E.manual = true;
    const run = app.run, P = run.player, R = P.rig;
    P.hurt = () => {}; run.nextGate = run.nextSwarm = 1e9;
    out.run = { rig: !!R, inScene: !!R && R.root.parent === run.scene, meshHidden: !P.mesh.visible, skinned: !!R && R.mesh.isSkinnedMesh,
      textured: !!R && 'USE_HEROMAP' in (R.mesh.material.defines || {}), mat: !!R && R.mesh.material === P.mat };
    if (R) {
      const foot = R.mesh.skeleton.bones.find((b) => b.name === 'LeftFoot');
      for (let i = 0; i < 9; i++) { run.input.tx = 0; run.input.tz = -1; E.step(1 / 30); }
      out.run.w = +R.w.toFixed(2); out.run.ts = +R.run.timeScale.toFixed(2);
      const f0 = V(foot).sub(V(R.root)); E.step(1 / 30); E.step(1 / 30); E.step(1 / 30); run.input.tz = -1;
      const f1 = V(foot).sub(V(R.root));
      out.run.footMoves = +f0.distanceTo(f1).toFixed(3);
      R.mesh.computeBoundingBox(); // posed through the skeleton
      const bb = R.mesh.boundingBox.clone().applyMatrix4(R.mesh.matrixWorld), h = P.mesh.geometry.boundingBox.max.y * 1.25;
      out.run.posedH = +((bb.max.y - bb.min.y) / h).toFixed(2); out.run.feet = +bb.min.y.toFixed(2);
      out.run.faces = +Math.cos(R.root.rotation.y - (Math.PI / 2 - P.facing)).toFixed(2);
      for (let i = 0; i < 9; i++) { run.input.tx = 0; run.input.tz = 0; E.step(1 / 30); }
      out.run.idleW = +(1 - R.w).toFixed(2);
    }
    app.exitRun(); E.manual = false;
    out.run.freed = !!R && R.root.parent === null;
    // the showcase idles the selected hero's rig and swaps it cleanly
    const sc = app.showcase;
    sc.setHero('mordrake', p); await new Promise((r) => setTimeout(r, 30));
    const r1 = sc.rig;
    p.heroes.liora.owned = true; sc.setHero('liora', p); await new Promise((r) => setTimeout(r, 30));
    out.show = { rig: !!sc.rig && sc.rig !== r1, inScene: !!sc.rig && sc.rig.root.parent === sc.scene, old: !!r1 && r1.root.parent === null, heroHidden: !sc.hero.visible };
    const t0 = sc.rig && sc.rig.idle.time; sc.update(0.25);
    out.show.idles = !!sc.rig && sc.rig.idle.time !== t0;
    // Nyx's dash afterimages copy the Shepherd's bind pose
    p.heroes.nyx.owned = true; p.selectedHero = 'nyx'; app.startRun(1); E.manual = true;
    const ghosts = app.run.rites.ghosts;
    out.nyx = { ghosts: !!ghosts && ghosts.every((g) => g.m.geometry === app.run.player.mesh.geometry), bind: app.run.player.mesh.geometry === H.heroModel('nyx').geometry };
    app.exitRun(); E.manual = false;
    return out;
  });
  const bad = Object.entries(s.rigs).filter(([, r]) => !r || r.bones !== 24 || r.run < 0.6 || r.run > 1 || r.idle < 5 || !r.facingZ);
  check('animated heroes: every model is rigged (24 bones, facing +Z) with a run cycle and an idle', !bad.length, JSON.stringify(bad.length ? bad : s.rigs));
  const r = s.run;
  check('animated heroes: in a run the Shepherd is the skinned, painted rig; moving plays the run (stride paced), stopping the idle',
    r.rig && r.inScene && r.meshHidden && r.skinned && r.textured && r.mat && r.w === 1 && r.ts >= 0.55 && r.ts <= 1.7 && r.idleW === 1 && r.faces > 0.99, JSON.stringify(r));
  check('animated heroes: the pose really moves and stays sane (feet travel, posed height 0.7-1.3x, feet near the ground); the rig is freed with the run',
    r.footMoves > 0.05 && r.posedH > 0.7 && r.posedH < 1.3 && Math.abs(r.feet) < 0.35 && r.freed, JSON.stringify(r));
  check('animated heroes: the home showcase idles the hero\'s rig and swaps rigs cleanly; Nyx\'s afterimages copy the bind pose',
    s.show.rig && s.show.inScene && s.show.old && s.show.heroHidden && s.show.idles && s.nyx.ghosts && s.nyx.bind, JSON.stringify({ show: s.show, nyx: s.nyx }));
});
check('animated heroes: no runtime errors', !errs.length, errs[0] || '');

// 31. Painted maps (game/world.js FLOORS and PROPS, game/weather.js; scripts/floors.sh, scripts/props.sh). Every chapter
//     walks on its own painted floor and among its own painted props (sane sizes, flames lighting the floor), with its
//     weather; a Blood Moon or a harder difficulty recolours the floor; the home screen keeps its hero clear.
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const app = window.__soulswarm, E = app.engine, p = app.profile, out = { ch: {} };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    p.chapter.unlocked = 6; p.flags.tutorialDone = true; p.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 };
    for (const id of [1, 2, 3, 4, 5, 6]) {
      p.energy = 30; app.startRun(id); E.manual = true;
      const r = app.run, W = r.world, u = W.groundMat.uniforms;
      r.player.hurt = () => {}; r.nextGate = r.nextSwarm = 1e9;
      for (let i = 0; i < 40 && !(u.uTexOn.value && W.painted.length); i++) await wait(50);
      for (let i = 0; i < 90; i++) { r.input.tx = 0.6; r.input.tz = -0.8; E.step(1 / 30); } // walk past the spawn
      const placed = W.painted.reduce((a, k) => a + k.mesh.count, 0);
      const sizes = W.painted.map((k) => { const g = k.mesh.geometry; g.computeBoundingBox(); const b = g.boundingBox; return { tris: (g.index ? g.index.count : g.attributes.position.count) / 3, h: b.max.y - b.min.y, floor: b.min.y }; });
      W.beginLights(); W.endLights();
      out.ch[id] = { floor: u.uTexOn.value === 1 && !!u.uTex.value && u.uTex.value.image.width === 1024, kinds: W.painted.length, placed,
        sane: sizes.every((z) => z.tris >= 1000 && z.tris <= 8000 && z.h > 0.5 && z.h < 4.5 && Math.abs(z.floor) < 0.02),
        lamps: W.lamps.length, lit: u.uLightCount.value, weather: W.weather.points.visible ? W.weather.material.uniforms.uCount.value : 0,
        fallbackHidden: W.fallback.every((k) => k.mesh.count === 0), recolor: u.uRecolorAmt.value };
      app.exitRun(); E.manual = false;
    }
    // a harder difficulty recolours the painted floor toward its palette
    p.diff = p.diff || {}; p.chapter.best[1] = { ...(p.chapter.best[1] || {}), cleared: true, time: 400 };
    p.diff.best = p.diff.best || {}; p.diff.best[1] = { normal: { cleared: true }, nightmare: { cleared: true } };
    p.energy = 30; app.startRun(1, { difficulty: 'nightmare' }); E.manual = true;
    out.nightmare = app.run.world.groundMat.uniforms.uRecolorAmt.value;
    app.exitRun(); E.manual = false;
    // the home screen's world keeps the hero's cells clear and has the chapter's weather
    const sw = app.showcase.world;
    sw.lastCell = null; sw.update(app.showcase.center, 1);
    let nearest = 1e9;
    const m = new (sw.ground.matrix.constructor)(), v = new (sw.center.constructor)();
    for (const k of sw.kinds) for (let i = 0; i < k.mesh.count; i++) { k.mesh.getMatrixAt(i, m); v.setFromMatrixPosition(m); nearest = Math.min(nearest, Math.hypot(v.x, v.z)); }
    out.home = { nearest: +nearest.toFixed(1), weather: sw.weather.points.visible };
    return out;
  });
  const bad = Object.entries(s.ch).filter(([, c]) => !c.floor || c.kinds < 3 || c.placed < 4 || !c.sane || !c.fallbackHidden || c.weather < 40 || c.recolor !== 0);
  check('maps: every chapter walks on its painted floor among its own painted props (sane sizes), with its weather', !bad.length, JSON.stringify(bad.length ? bad : s.ch));
  const lampCh = Object.values(s.ch).filter((c) => c.lamps > 0);
  check('maps: flames and crystals light the floor around them', lampCh.length >= 4 && lampCh.every((c) => c.lit > 0), JSON.stringify(Object.fromEntries(Object.entries(s.ch).map(([k, c]) => [k, [c.lamps, c.lit]]))));
  check('maps: Nightmare recolours the painted floor; the home screen keeps its hero clear and has weather',
    s.nightmare >= 0.6 && s.home.nearest > 9 && s.home.weather, JSON.stringify({ nightmare: s.nightmare, home: s.home }));
});
check('maps: no runtime errors', !errs.length, errs[0] || '');

// 32. Painted foes (engine/foemodels.js; scripts/enemies.sh). Every foe, the Soul Thief and the five bosses load as
//     painted models standing on the ground, facing +Z, within their triangle budgets; in a run the horde, the
//     legion's ghosts, the Thief and the King use them, walked by the shader (USE_GAIT); the Low quality setting keeps
//     the light procedural horde and ghosts.
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const app = window.__soulswarm, E = app.engine, p = app.profile, F = app.foeModels, out = {};
    p.chapter.unlocked = 6; p.flags.tutorialDone = true; p.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 };
    const models = await F.loadFoeModels();
    out.models = Object.fromEntries(F.FOE_IDS.map((id, i) => {
      const m = models[i]; if (!m) return [id, null];
      const g = m.geometry; g.computeBoundingBox(); const b = g.boundingBox;
      return [id, { tris: (g.index ? g.index.count : g.attributes.position.count) / 3, h: +(b.max.y - b.min.y).toFixed(2), want: F.FOES[id].h, floor: +b.min.y.toFixed(3),
        cx: +((b.min.x + b.max.x) / 2).toFixed(3), wide: b.max.x - b.min.x > b.max.z - b.min.z, map: !!(m.map && m.map.image), hip: +m.gait.a.x.toFixed(2) }];
    }));
    const start = (q) => {
      E.setQuality(q); p.energy = 30; app.startRun(1); E.manual = true;
      const r = app.run; r.player.hurt = () => {}; r.spawnAcc = -1e9; r.nextGate = r.nextSwarm = 1e9; r.eliteIdx = 99; r.events.director = () => {};
      const P = r.player;
      for (const t of ['husk', 'ghoul', 'brute', 'witch', 'bloater', 'wraith', 'priest']) r.enemies.spawn(t, P.x + 6, P.z);
      r.enemies.spawn('brute', P.x - 6, P.z, { elite: true });
      for (const kind of ['ghoul', 'brute', 'witch', 'bloater', 'wraith', 'priest']) r.legion.raise(P.x + 1, P.z + 1, { kind, fx: false });
      r.events.start('thief', { x: P.x + 4, z: P.z + 4 });
      const t0 = r.enemies.mats.map((m) => m.uniforms.uTime.value);
      for (let i = 0; i < 30; i++) E.step(1 / 30);
      const ticks = r.enemies.mats.every((m, i) => m.uniforms.uTime.value > t0[i]);
      r.boss.spawn(); r.bossSpawned = true; // (its entrance holds the horde)
      for (let i = 0; i < 3; i++) E.step(1 / 30);
      const M = r.enemies.meshes, L = r.legion.ghosts;
      const res = {
        horde: Object.fromEntries(Object.entries(M).map(([t, x]) => [t, { painted: x.painted, gait: 'USE_GAIT' in x.mesh.material.defines, map: !!x.mesh.material.uniforms.uMap.value, n: x.mesh.count, head: +x.head.toFixed(2) }])),
        ghosts: Object.fromEntries(Object.entries(L).map(([k, V]) => [k, !!V.mesh.material.uniforms.uMap.value])),
        thief: !!r.events.thief.material.uniforms.uMap.value && 'USE_GAIT' in r.events.thief.material.defines,
        boss: !!r.boss.mat.uniforms.uMap.value, crowns: r.enemies.crowns.count,
        ticks,
        lit: r.enemies.mats.every((m) => m.uniforms.uPLPos.value.lengthSq() > 0 || (r.player.x === 0 && r.player.z === 0)),
      };
      app.exitRun(); E.manual = false;
      return res;
    };
    out.medium = start('medium');
    out.low = start('low');
    E.setQuality('medium'); E.qualitySetting = p.settings.quality; // back to the boot state ('auto' starts at medium)
    return out;
  });
  const M = s.models, bad = Object.entries(M).filter(([id, m]) => !m || !m.map || Math.abs(m.h - m.want) > 0.02 || Math.abs(m.floor) > 0.01 || Math.abs(m.cx) > 0.01 || !m.wide || m.hip <= 0
    || m.tris < 1000 || m.tris > (m.want > 4 ? 8000 : 3200)); // the five bosses are the tall ones
  check('painted foes: all thirteen load standing on the ground, centred, facing +Z, at their heights and within budget', !bad.length && Object.keys(M).length === 13, JSON.stringify(bad.length ? bad : M));
  const md = s.medium, hordeOk = Object.values(md.horde).every((h) => h.painted && h.gait && h.map);
  check('painted foes: in a run the horde, the legion\'s ghosts, the Soul Thief and the Hollow King are painted and walked by the shader',
    hordeOk && Object.values(md.ghosts).every(Boolean) && md.thief && md.boss && md.ticks && md.crowns === 1, JSON.stringify(md));
  const lo = s.low;
  check('painted foes: Low quality keeps the procedural horde and ghosts (the King and the Thief stay painted)',
    Object.values(lo.horde).every((h) => !h.painted && !h.map) && Object.values(lo.ghosts).every((g) => !g) && lo.boss && lo.thief, JSON.stringify(lo));
});
check('painted foes: no runtime errors', !errs.length, errs[0] || '');

// 33. Chapter bosses (BOSSES in data.js, boss.js): each chapter ends with its own boss (Gravemaw, Pyrexa, Vaulkar,
//     Azrathel, Vesperine), painted, in its colour, named on the bar and the warning banner, with its own phase names and
//     announcer lines; the Endless Abyss brings them back in turn. Each signature attack goes off: Cinder Rain lobs
//     burning fire, Glacier Lances mark lanes that erupt into frost shards, Smite drops pillars of light where the
//     Shepherd is, Blood Lances fan orbs down a marked cone. A phase roar withdraws marks that have not gone off.
errs = await session(async (page) => {
  await page.evaluate(BOSS_QA);
  const s = await page.evaluate(async () => {
    const D = await import('/src/game/data.js'), app = window.__soulswarm, out = { ch: {} };
    await app.foeModels.loadFoeModels();
    const sigOf = { pyrexa: 'rain', vaulkar: 'lances', azrathel: 'smite', vesperine: 'fan' };
    for (const ch of [1, 2, 3, 4, 5]) {
      const r = window.__bossRun(ch), b = r.boss, P = r.player;
      r.weapons.update = () => {};
      const c = out.ch[ch] = { id: b.id, bar: document.querySelector('.bossbar .nm').textContent, painted: !!b.mat.uniforms.uMap.value,
        color: b.color.getHex() === D.BOSSES[b.id].color, bc: getComputedStyle(document.querySelector('.bossbar .bar i')).boxShadow.includes(
          `${(D.BOSSES[b.id].color >> 16) & 255}, ${(D.BOSSES[b.id].color >> 8) & 255}, ${D.BOSSES[b.id].color & 255}`) };
      if (!sigOf[b.id]) continue;
      b.cd = 99; b.force('sig'); c.state = b.state;
      // the Shepherd stands still: every signature must be able to reach him
      let hurt = 0; P.hurt = () => { hurt++; };
      if (b.id === 'pyrexa') { window.__step(r, 0.3); c.lobs = r.projectiles.lobs.length; window.__step(r, 2); c.burns = r.hazards.burns.length; }
      if (b.id === 'vaulkar') { const z0 = b.zones.filter((z) => z.t < 0).length; c.marked = z0; c.teles = r.hazards.teles.length; P.x = b.zones[0].x; P.z = b.zones[0].z; window.__step(r, 1.6); c.up = b.zones.filter((z) => z.t >= 0).length; }
      if (b.id === 'azrathel') { window.__step(r, 0.1); c.marks = b.strikes.length; window.__step(r, 2.5); c.fell = b.strikes.length === 0; }
      if (b.id === 'vesperine') { window.__step(r, 0.3); c.cone = r.hazards.teles.some((t) => t.kind === 1); const o0 = r.projectiles.embers.filter((o) => o.boss).length; window.__step(r, 1.5); c.orbs = r.projectiles.embers.filter((o) => o.boss).length - o0; }
      c.hurt = hurt; c.recovered = b.state === 'chase';
    }
    // a phase roar withdraws Glacier Lances still marked (their shards never rise)
    let r = window.__bossRun(3), b = r.boss; r.weapons.update = () => {}; b.cd = 99; b.force('lances');
    const marks = r.hazards.teles.length; b.phaseT = 99; window.__hit(r, 0.6); window.__step(r, 1 / 30);
    out.withdraw = { marks, roar: b.state, pending: b.zones.filter((z) => z.t < 0).length, teles: r.hazards.teles.filter((t) => t.t < t.dur).length };
    // the Endless Abyss brings the five back in turn: the warning banner names each; the sixth "returns"
    // (a level-up or the relic chest each boss drops would pause the clock: take the first card)
    r = window.__bossRun(6); const order = [];
    // the boss warnings as shown (a jumped clock can bring an elite or event banner over one before it is read)
    const warned = []; { const b0 = r.ui.banner.bind(r.ui); r.ui.banner = (t, sub, kind) => { if (kind === 'boss') warned.push(t); return b0(t, sub, kind); }; }
    const go = (sec) => { for (let i = 0; i < Math.round(sec * 30); i++) { if (r.levelPending) document.querySelector('.lvl-back .card')?.click(); r.update(1 / 30); } };
    for (let k = 0; k < 6; k++) {
      order.push(r.boss.id);
      const e = r.bossEnemy; if (!e) break;
      e.hp = 1; r.enemies.damage(e, 50); go(1.5);
      if (k < 5) { r.time = r.nextBossAt - 8.5; go(0.6); }
      if (k === 4) out.returns = warned[warned.length - 1] || '';
      r.time = r.nextBossAt - 0.05; go(3);
    }
    out.order = order;
    out.byType = { ...r.counters.byType };
    app.exitRun();
    // every boss has its art, announcer lines, model and Bestiary entry
    const art = await import('/src/ui/art.js');
    out.assets = D.BOSS_ORDER.map((id) => [id, !!art.FOE_ART[id], !!art.BOSS_ART[id], !!app.foeModels.foeModel(id), !!D.BESTIARY.foes[id]?.boss,
      ['', '_return', '_slain'].every((x) => !!D.VOICE.lines[D.BOSSES[id].voice + x])]);
    out.home = D.CHAPTERS.slice(0, 5).map((ch) => D.BOSSES[D.bossFor(ch)].name);
    return out;
  });
  const C = s.ch, ids = [1, 2, 3, 4, 5].map((c) => C[c].id);
  check('chapter bosses: each chapter fights its own painted boss, named on the bar in its colour',
    ids.join() === 'gravemaw,pyrexa,vaulkar,azrathel,vesperine' && Object.values(C).every((c) => c.painted && c.color && c.bc) && C[2].bar === 'PYREXA, THE CINDER MATRON', JSON.stringify(C));
  check('chapter bosses: Cinder Rain lobs fire that burns the ground; Glacier Lances mark lanes that rise into frost shards',
    C[2].lobs >= 2 && C[2].burns >= 3 && C[2].hurt > 0 && C[3].marked >= 15 && C[3].teles >= 15 && C[3].up >= 15 && C[3].hurt > 0, JSON.stringify({ p: C[2], v: C[3] }));
  check('chapter bosses: Smite drops pillars where the Shepherd stands; Blood Lances fan orbs down a marked cone',
    C[4].marks >= 1 && C[4].fell && C[4].hurt > 0 && C[5].cone && C[5].orbs >= 13 && C[5].recovered, JSON.stringify({ a: C[4], v: C[5] }));
  check('chapter bosses: a phase roar withdraws marks that have not gone off', s.withdraw.marks >= 15 && s.withdraw.roar === 'roar' && s.withdraw.pending === 0 && s.withdraw.teles === 0, JSON.stringify(s.withdraw));
  check('chapter bosses: the Endless Abyss brings the five back in turn, and they return', s.order.join() === 'gravemaw,pyrexa,vaulkar,azrathel,vesperine,gravemaw'
    && s.returns === 'THE HOLLOW KING RETURNS' && s.byType.vesperine === 1 && s.byType.gravemaw === 2, // each kill counts for its own boss
    JSON.stringify({ order: s.order, ret: s.returns, by: s.byType }));
  check('chapter bosses: every boss has its portrait, warning art, model, Bestiary entry and announcer lines; the home card names it',
    s.assets.every((a) => a.slice(1).every(Boolean)) && s.home.join() === 'Gravemaw,Pyrexa,Vaulkar,Azrathel,Vesperine', JSON.stringify({ a: s.assets, h: s.home }));
});
check('chapter bosses: no runtime errors', !errs.length, errs[0] || '');

// 34. Beginner tutorial ("The Waking", game/tutorial.js, ui/coachui.js): a new Shepherd's Battle opens a free, guided
//     run that teaches one thing per step (move, slay, raise the legion, a ×2 Soul Gate, the Rite, Soul Nova, an elite
//     and its Relic Chest, a quarter-strength Hollow King), with the coach pointing at each control. It cannot be
//     lost, pays once, unlocks nothing, and hands the home screen a pointer to Talents, then to Chapter 1. Skip and the
//     Settings replay (practice, no rewards) work, and older saves count their first run as their training.
errs = await session(async (page) => {
  const home = await page.evaluate(() => ({ strip: document.querySelector('.ftue')?.textContent.trim(), cost: document.querySelector('.bb-cost')?.textContent.trim(), done: window.__soulswarm.profile.flags.tutorialDone }));
  await page.evaluate(() => document.querySelector('[data-act="battle"]').click());
  await page.waitForTimeout(300);
  const s = await page.evaluate(async () => {
    const app = window.__soulswarm, p = app.profile, r = app.run, g = r && r.guide, D = await import('/src/game/data.js');
    const out = { guided: !!g, energy: p.energy, intro: document.querySelector('.run-intro .ri-name')?.textContent, steps: [], points: {}, marks: {}, hints: 0 };
    if (!g) return out;
    app.engine.manual = true;
    const P = r.player; P.invuln = 0; P.hurt(1e6); out.floor = { hp: P.hp, dead: P.dead }; P.hp = P.maxHp; P.invuln = 0; // the tutorial cannot be lost
    let last = '';
    for (let f = 0; f < 30 * 420 && !r.ended; f++) {
      if (r.levelPending) { const c = document.querySelector('.lvl-back .card'); if (c && r.t - (r._pk || 0) > 0.35) { r._pk = r.t; out.cardLine = out.cardLine || document.querySelector('.co-card')?.textContent; c.click(); } }
      const v = g.view();
      if (v && v.id !== last) { last = v.id; out.steps.push(v.id); if (v.id === 'gate') out.ops = r.gates.pair && r.gates.pair.gates.map((G) => G.op.type + G.op.n).sort().join(); }
      if (v) { if (v.point) out.points[v.id] = v.point; if (v.mark) out.marks[v.id] = true; if (v.goal && v.id === 'slay') out.slayGoal = v.goal[1]; }
      if (f === 60) out.panel = { step: document.querySelector('.co-step')?.textContent, text: document.querySelector('.co-text')?.textContent, thumb: !document.querySelector('.co-thumb').hidden };
      if (v && v.id === 'rite' && !out.ring) { const pt = document.querySelector('.co-point'); out.ring = !pt.hidden && Math.abs(pt.getBoundingClientRect().x - (document.querySelector('.rite').getBoundingClientRect().x + 32)) < 6; }
      let tx = Math.cos(r.t * 0.7), tz = Math.sin(r.t * 0.7);
      const m = v && v.mark; if (m) { const dx = m.x - P.x, dz = m.z - P.z, l = Math.hypot(dx, dz) || 1; tx = dx / l; tz = dz / l; }
      if (v && v.id === 'move' && r.time < 2.5) tx = tz = 0;
      r.input.tx = tx; r.input.tz = tz; r.input.moved = true;
      if (v && v.id === 'rite' && g.t > 1) r.ui.wantsRite = true;
      if (v && v.id === 'nova' && r.nova >= 1 && g.t > 1) r.ui.wantsNova = true;
      if (document.querySelector('.hint')) out.hints++;
      if (r.bossSpawned && !out.boss) out.boss = { hp: r.bossEnemy.maxHp, want: D.BOSS.hp * D.TUTORIAL.bossHp * D.CHAPTERS[0].hpMul, ticks: document.querySelectorAll('.bossbar .ticks b').length, warned: r.warned };
      out.dead = out.dead || P.dead;
      r.update(1 / 30);
    }
    out.time = Math.round(r.time); out.ended = r.ended; out.won = r.bossDead;
    await new Promise((res) => setTimeout(res, 900));
    const tiles = [...document.querySelectorAll('.res-rw > *')].map((n) => n.textContent.replace(/\s+/g, ' ').trim());
    out.res = { head: document.querySelector('.res-head b')?.textContent, ad: !!document.querySelector('.modal .btn-ad'), tiles, unlocked: p.chapter.unlocked, best: !!p.chapter.best[1], flags: { ...p.flags, hints: undefined }, gems: p.gems };
    // home: the strip leads to Talents, Might is coached; buying it moves the pointer on to Chapter 1
    [...document.querySelectorAll('.modal .btn')].find((b) => /Continue/.test(b.textContent))?.click();
    await new Promise((res) => setTimeout(res, 300));
    out.home = { strip: document.querySelector('.ftue')?.textContent.trim(), dot: !document.querySelector('[data-nav="heroes"] .badge-dot').hidden };
    document.querySelector('[data-act="coachTalent"]')?.click();
    await new Promise((res) => setTimeout(res, 300));
    const tal = document.querySelector('.tal.coach');
    out.tal = { coached: tal?.dataset.tal, tab: document.querySelector('.subtab.on')?.dataset.sub };
    tal?.querySelector('.tal-btn')?.click();
    await new Promise((res) => setTimeout(res, 300));
    out.tal.after = p.flags.coach; out.tal.might = p.talents.might;
    app.meta.show('battle'); app.meta.refresh();
    await new Promise((res) => setTimeout(res, 300));
    out.home2 = { strip: document.querySelector('.ftue')?.textContent.trim(), cost: document.querySelector('.bb-cost')?.textContent.trim() };
    const e0 = p.energy; document.querySelector('[data-act="battle"]').click();
    out.real = { run: !!app.run, guided: !!(app.run && app.run.guide), spent: e0 - p.energy, coach: p.flags.coach };
    app.exitRun();
    return out;
  });
  check('tutorial: a new Shepherd is offered free training; Battle opens it without spending energy, titled "The Waking"',
    home.done === false && /training/i.test(home.strip) && /free/i.test(home.cost) && s.guided && s.energy === 30 && s.intro === 'The Waking', JSON.stringify({ home, g: s.guided, e: s.energy, i: s.intro }));
  check('tutorial: the coach shows the step, its instruction and the drag demo; game hints stay quiet',
    /1\/8/.test(s.panel?.step || '') && /move/i.test(s.panel?.text || '') && s.panel?.thumb && s.hints === 0, JSON.stringify({ p: s.panel, h: s.hints }));
  check('tutorial: every step in order (move, slay, legion, gate, rite, nova, elite, boss), and the King falls',
    s.steps.join() === 'move,slay,legion,gate,rite,nova,elite,boss' && s.ended && s.won && s.time < 330, JSON.stringify({ steps: s.steps, t: s.time, won: s.won }));
  check('tutorial: the coach rings the legion, the RITE button and NOVA, and marks the ×2 gate and the elite; the gates are +5 / ×2',
    s.points.legion === 'legion' && s.points.rite === 'rite' && s.points.nova === 'nova' && s.ring && s.marks.gate && s.marks.elite && s.ops === 'add5,mul2', JSON.stringify({ pt: s.points, mk: s.marks, ring: s.ring, ops: s.ops }));
  check('tutorial: it cannot be lost, the first level-up gets the coach\'s line, and the King is a quarter strength with phase I only',
    s.floor.hp === 1 && !s.floor.dead && !s.dead && /LEVEL UP/.test(s.cardLine || '') && s.boss && Math.abs(s.boss.hp - s.boss.want) < 1 && s.boss.ticks === 0 && s.boss.warned, JSON.stringify({ f: s.floor, c: s.cardLine, b: s.boss }));
  check('tutorial: "TRAINING COMPLETE" pays its bonus once, with no ad doubling, records or unlocks',
    s.res.head === 'TRAINING COMPLETE' && !s.res.ad && s.res.tiles.some((t) => /×30/.test(t)) && s.res.unlocked === 1 && !s.res.best && s.res.flags.tutorialDone && s.res.flags.tutorialPaid && s.res.flags.coach === 'talent', JSON.stringify(s.res));
  check('tutorial: home then points to Talents (Might coached); buying it points to Chapter 1, whose run costs energy and ends the pointers',
    /Talents/.test(s.home.strip || '') && s.home.dot && s.tal.tab === 'talents' && s.tal.coached === 'might' && s.tal.might === 1 && s.tal.after === 'battle'
    && /Chapter 1/.test(s.home2.strip || '') && !/free/i.test(s.home2.cost || '') && s.real.run && !s.real.guided && s.real.spent === 5 && s.real.coach === '', JSON.stringify({ h: s.home, t: s.tal, h2: s.home2, r: s.real }));
});
check('tutorial run: no runtime errors', !errs.length, errs[0] || '');

errs = await session(async (page) => {
  await page.evaluate(() => document.querySelector('[data-act="battle"]').click());
  await page.waitForTimeout(300);
  const s = await page.evaluate(async () => {
    const app = window.__soulswarm, p = app.profile, out = {}, wait = (ms) => new Promise((res) => setTimeout(res, ms));
    app.engine.manual = true;
    for (let i = 0; i < 120; i++) app.run.update(1 / 30); // past the intro card
    document.querySelector('.co-skip').click();
    out.paused = app.run.paused;
    [...document.querySelectorAll('.modal .btn')].find((b) => b.textContent === 'Skip').click();
    await wait(200);
    out.skip = { run: !!app.run, done: p.flags.tutorialDone, paid: p.flags.tutorialPaid, coach: p.flags.coach, energy: p.energy, gold: p.gold, strip: document.querySelector('.ftue')?.textContent.trim() };
    // replay from Settings: practice, no rewards
    document.querySelector('[data-act="settings"]').click(); await wait(200);
    document.querySelector('[data-act="tutorial"]').click(); await wait(200);
    out.replay = { guided: !!(app.run && app.run.guide), energy: p.energy };
    { const g0 = p.gold; app.run.counters.kills = 300; app.run.end(false); await wait(900); // abandoned: nothing paid, the reward still waits
      out.abandon = { paid: p.gold - g0, flag: p.flags.tutorialPaid, head: document.querySelector('.res-head b')?.textContent };
      app.exitRun(); document.querySelector('[data-act="settings"]').click(); await wait(200); document.querySelector('[data-act="tutorial"]').click(); await wait(200); }
    p.flags.tutorialPaid = true; // as after a finished first training
    const g0 = p.gold, m0 = p.gems;
    app.run.counters.kills = 300; app.run.end(true); await wait(900);
    out.replay.paid = p.gold - g0 + p.gems - m0; out.replay.tip = document.querySelector('.res-tip')?.textContent || '';
    app.exitRun();
    // older saves: the first run they played was their training
    const S = await import('/src/meta/save.js'), key = Object.keys(localStorage).find((k) => /soul/i.test(k) && !/corrupt/.test(k));
    const raw = localStorage.getItem(key), j = JSON.parse(raw);
    j.flags = { tutorialDone: true, hints: {} }; localStorage.setItem(key, JSON.stringify(j)); out.vet = S.loadProfile().flags.tutorialPaid;
    j.flags = { tutorialDone: false, hints: {} }; localStorage.setItem(key, JSON.stringify(j)); out.fresh = S.loadProfile().flags.tutorialPaid;
    localStorage.setItem(key, raw);
    return out;
  });
  check('tutorial: Skip asks first (pausing), then counts training as done at no cost and points home to Chapter 1',
    s.paused && !s.skip.run && s.skip.done && !s.skip.paid && s.skip.coach === 'battle' && s.skip.energy === 30 && s.skip.gold === 1500 && /Chapter 1/.test(s.skip.strip || ''), JSON.stringify(s.skip));
  check('tutorial: Settings replays it; abandoning pays nothing (the reward waits), practice after a finish pays nothing; older saves count as trained',
    s.replay.guided && s.replay.energy === 30 && s.abandon.paid === 0 && !s.abandon.flag && s.abandon.head === 'TRAINING ENDED' && s.replay.paid === 0 && /Practice/.test(s.replay.tip)
    && s.vet === true && s.fresh === false, JSON.stringify({ r: s.replay, a: s.abandon, vet: s.vet, fresh: s.fresh }));
});
check('tutorial skip and replay: no runtime errors', !errs.length, errs[0] || '');

// 35. Boss Rush ("The Hollow Court", BOSS_RUSH in data.js, run.js rush, ui/meta/rush.js): a limited weekly event (Tue–Thu
//     UTC in the build) after a first Chapter 1 clear. The five chapter bosses back to back, each at its chapter's
//     scaling, from a seasoned start (level, veteran build, deep legion) and a four-pick War Council; each boss drops a
//     Relic Chest, raises souls and heals. Free tries a day (one more by ad), milestones once per event, the best clear.
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const app = window.__soulswarm, p = app.profile, D = await import('/src/game/data.js'), Ec = await import('/src/meta/economy.js'), out = {};
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    Object.assign(p.flags, { tutorialDone: true, tutorialPaid: true, hints: { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 } });
    // the calendar: open Tue–Thu UTC, closed Fri–Mon; the event key is its Tuesday; QA can force it
    const at = (iso) => Date.parse(iso);
    out.cal = ['2026-10-06T00:00:00Z', '2026-10-08T23:59:00Z', '2026-10-09T00:00:00Z', '2026-10-12T12:00:00Z'].map((t) => Ec.rushOpen({ flags: {} }, at(t)));
    const T = Ec.rushTimes(at('2026-10-07T12:00:00Z')), T2 = Ec.rushTimes(at('2026-10-10T12:00:00Z'));
    out.times = { key: T.key, ends: new Date(T.ends).toISOString(), next: new Date(T2.starts).toISOString(), key2: T2.key };
    out.force = [Ec.rushOpen({ flags: { bossRush: 'on' } }, at('2026-10-10T00:00:00Z')), Ec.rushOpen({ flags: { bossRush: 'off' } }, at('2026-10-07T00:00:00Z'))];
    // locked before a Chapter 1 clear; open, it shows on the home screen
    p.flags.bossRush = 'on'; p.chapter.unlocked = 1; app.meta.show('battle'); app.meta.refresh(); await wait(100);
    out.lockedFab = !!document.querySelector('[data-act="rush"]');
    p.chapter.unlocked = 2; app.meta.refresh(); await wait(100);
    out.fab = !!document.querySelector('[data-act="rush"]');
    document.querySelector('[data-act="rush"]').click(); await wait(300);
    out.panel = { bosses: document.querySelectorAll('.br-boss').length, ms: document.querySelectorAll('.br-ms').length, go: document.querySelector('.br-go')?.textContent.replace(/\s+/g, ' ').trim() };
    const e0 = p.energy;
    document.querySelector('.br-go').click(); await wait(300);
    const r = app.run; app.engine.manual = true;
    out.start = { rush: !!(r && r.rush), spent: e0 - p.energy, tries: p.rush.tries, level: r.level, legion: r.legion.count, picks: Object.values(r.skillLv).reduce((a, b) => a + b, 0) };
    // the War Council: four picks before the first boss, titled, while the clock waits
    const titles = new Set(); let t0 = -1, t1 = -1;
    const go = (sec) => { for (let i = 0; i < Math.round(sec * 30) && !r.ended; i++) {
      if (r.levelPending) { const ti = document.querySelector('.lvl-title b')?.textContent; if (ti) titles.add(ti); const c = document.querySelector('.lvl-back .card'); if (c && r.t - (r._pk || 0) > 0.35) { r._pk = r.t; if (ti === 'WAR COUNCIL') { if (t0 < 0) t0 = r.time; t1 = r.time; } c.click(); } }
      if (!r.levelPending && (r.levelQueue > 0 || r.chestQueue > 0)) r.showLevelUp();
      r.update(1 / 30);
    } };
    r.player.hurt = () => {};
    go(4); out.draft = { titles: [...titles], clock: +(t1 - t0).toFixed(2), picks: Object.values(r.skillLv).reduce((a, b) => a + b, 0) - out.start.picks };
    // the five bosses in turn, each at its chapter's scaling; between them a chest, souls and a heal
    out.bosses = []; out.hud = [];
    for (let k = 0; k < 5; k++) {
      for (let i = 0; i < 30 * 12 && !(r.bossEnemy && r.boss.state !== 'enter'); i++) go(1 / 30);
      const e = r.bossEnemy; if (!e) break;
      const C = D.CHAPTERS[k], want = D.BOSS.hp * C.hpMul * (1 + D.BOSS.chHp * k) * (D.BOSS.tune[k] || 1) * D.BOSS_RUSH.hp[k];
      out.bosses.push({ id: r.boss.id, hp: Math.abs(e.maxHp - want) < 2 });
      out.hud.push(document.querySelector('.hud-timer small')?.textContent);
      if (k === 1) { r.player.hp = 10; }
      e.hp = 1; r.enemies.damage(e, 50); go(0.5);
      if (k === 1) out.between = { chest: r.pickups.special.some((x) => x.kind === 'chest'), hp: Math.round(r.player.hp), legion: r.legion.count, ch: r.chapter.id, next: r.bossSpawned };
      go(1.5);
    }
    go(3); out.ended = r.ended; out.kills = r.bossKills;
    await wait(900);
    out.res = { head: document.querySelector('.res-head b')?.textContent, sub: document.querySelector('.res-head span')?.textContent, ad: !!document.querySelector('.modal .btn-ad'), best: /New best/.test(document.querySelector('.res-badges')?.textContent || ''), rush: { ...p.rush } };
    app.exitRun();
    // a second attempt that falls to the second boss pays no milestone again; the third try uses up the day, then an ad try
    const o = Ec.applyRunResult(p, { rush: true, victory: false, bossKills: 1, kills: 50, time: 90, byType: {} });
    out.again = { milestones: o.milestones.length, gems: o.rewards.gems || 0, sigils: o.rewards.sigils || 0, claimed: p.rush.claimed };
    p.rush.tries = 3; out.day = Ec.rushState(p); app.meta.refresh(); document.querySelector('[data-act="rush"]').click(); await wait(300);
    out.retryBtn = !!document.querySelector('.mm-rush [data-act="retry"]');
    out.ad = Ec.grantRushTry(p) && Ec.rushState(p).available; out.ad2 = Ec.grantRushTry(p);
    // a new day resets the tries; a new event resets the milestones and the event best (the all-time best stays)
    p.rush.day = '2000-01-01'; out.newDay = Ec.rushState(p).triesLeft;
    p.rush.event = '2000-01-04'; const ns = Ec.rushState(p); out.newEvent = { claimed: ns.claimed, best: ns.best, allBest: ns.allBest > 0 };
    document.querySelectorAll('.modal-back').forEach((n) => n.remove());
    return out;
  });
  check('boss rush: open Tue–Thu UTC, keyed by its Tuesday, closing Friday; QA can force it either way',
    s.cal.join() === 'true,true,false,false' && s.times.key === '2026-10-06' && s.times.ends === '2026-10-09T00:00:00.000Z' && s.times.next === '2026-10-13T00:00:00.000Z' && s.force.join() === 'true,false', JSON.stringify({ cal: s.cal, t: s.times, f: s.force }));
  check('boss rush: unlocked by a Chapter 1 clear; the panel shows the five bosses, five milestones and the free tries; entering spends a try, no energy',
    !s.lockedFab && s.fab && s.panel.bosses === 5 && s.panel.ms === 5 && /3 free tries/.test(s.panel.go) && s.start.rush && s.start.spent === 0 && s.start.tries === 1, JSON.stringify({ l: s.lockedFab, f: s.fab, p: s.panel, st: s.start }));
  check('boss rush: a seasoned start (level 20, a deep legion, a veteran build) and a four-pick War Council while the clock waits',
    s.start.level === 20 && s.start.legion >= 60 && s.start.picks >= 14 && s.draft.titles.includes('WAR COUNCIL') && s.draft.picks >= 4 && s.draft.clock < 0.1, JSON.stringify({ st: s.start, d: s.draft }));
  check('boss rush: the five bosses in turn at their chapters\' scaling; between them a chest, souls, a heal and the next chapter; the HUD counts them',
    s.bosses.map((b) => b.id).join() === 'gravemaw,pyrexa,vaulkar,azrathel,vesperine' && s.bosses.every((b) => b.hp) && s.between.chest && s.between.hp > 10 && s.between.ch === 3 && !s.between.next
    && s.hud[0] === 'Boss 1 of 5' && s.hud[4] === 'Boss 5 of 5', JSON.stringify({ b: s.bosses, bt: s.between, hud: s.hud }));
  check('boss rush: clearing it reads "COURT CLEARED", pays every milestone once, records the best, and offers no ad doubling',
    s.ended && s.kills === 5 && s.res.head === 'COURT CLEARED' && s.res.best && !s.res.ad && s.res.rush.claimed === 5 && s.res.rush.best > 0 && s.res.rush.bestKills === 5 && s.res.rush.clears === 1, JSON.stringify(s.res));
  check('boss rush: milestones pay once per event; three tries a day, then one by ad; a new day and a new event reset',
    s.again.milestones === 0 && s.again.gems === 0 && s.again.sigils === 0 && s.again.claimed === 5 && !s.day.available && s.day.retry && s.retryBtn && s.ad && !s.ad2 && s.newDay === 3
    && s.newEvent.claimed === 0 && s.newEvent.best === 0 && s.newEvent.allBest, JSON.stringify({ a: s.again, d: { av: s.day.available, re: s.day.retry }, rb: s.retryBtn, ad: s.ad, ad2: s.ad2, nd: s.newDay, ne: s.newEvent }));
});
check('boss rush: no runtime errors', !errs.length, errs[0] || '');

// 36. The share card (ui/sharecard.js): every run's results but the tutorial's have a Share button that paints a
//     1080×1350 card from the painted art (headline, peak legion, the boss slain, time / kills / raised / level, the
//     build) and offers it to share, to save, or to long-press.
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const app = window.__soulswarm, p = app.profile, S = await import('/src/ui/sharecard.js'), out = {}, wait = (ms) => new Promise((res) => setTimeout(res, ms));
    Object.assign(p.flags, { tutorialDone: true, tutorialPaid: true, hints: { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 } }); p.chapter.unlocked = 6; p.energy = 99;
    // the headlines
    const fake = { bossDead: true, boss: { id: 'pyrexa' } };
    out.copy = [S.cardCopy({ chapter: 2, victory: true, difficulty: 'nightmare' }, fake), S.cardCopy({ chapter: 4, victory: false, difficulty: 'normal' }, {}),
      S.cardCopy({ rush: true, victory: true, bossKills: 5 }, {}), S.cardCopy({ endless: true, bossKills: 3 }, {})].map((c) => [c.head, c.sub, c.bosses.join('+'), c.slew || '']);
    // a finished Chapter 2 run: Share opens the sheet with the card
    app.startRun(2); const r = app.run; app.engine.manual = true;
    r.counters.kills = 2400; r.legion.peak = 180; r.time = 300; r.end(false);
    await wait(900);
    out.btn = !!document.querySelector('.modal-results .btn-share');
    document.querySelector('.modal-results .btn-share').click();
    for (let i = 0; i < 60 && !document.querySelector('.share-img'); i++) await wait(100);
    const img = document.querySelector('.share-img');
    if (img) { await img.decode().catch(() => {}); }
    out.img = img ? { w: img.naturalWidth, h: img.naturalHeight, alt: img.alt } : null;
    out.save = document.querySelector('.share-acts [data-act="save"]')?.getAttribute('download');
    if (img) { // painted, not blank: many distinct colours across the card
      const c = document.createElement('canvas'); c.width = 54; c.height = 68; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 54, 68);
      const d = x.getImageData(0, 0, 54, 68).data, set = new Set(); for (let i = 0; i < d.length; i += 4) set.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4)); out.colors = set.size;
    }
    out.resultsKept = !!document.querySelector('.modal-results');
    document.querySelectorAll('.modal-back').forEach((n) => n.remove());
    app.exitRun();
    // the tutorial's results have none
    p.flags.tutorialPaid = true; app.startRun(1, { tutorial: true }); app.run.end(true); await wait(900);
    out.tutBtn = !!document.querySelector('.modal-results .btn-share');
    app.exitRun();
    return out;
  });
  check('share card: the headline fits the run (victory and the boss slain, a fall, the Court, the Abyss)',
    s.copy[0][0] === 'VICTORY' && /Ember Wastes · Nightmare/.test(s.copy[0][1]) && s.copy[0][2] === 'pyrexa' && /Cinder Matron/.test(s.copy[0][3])
    && s.copy[1][0] === 'FALLEN' && s.copy[2][0] === 'COURT CLEARED' && s.copy[2][2].split('+').length === 5 && s.copy[3][0] === 'ABYSS DEPTH 4', JSON.stringify(s.copy));
  check('share card: Share on the results paints a 1080×1350 card and offers to save it; the results stay open; the tutorial has none',
    s.btn && s.img && s.img.w === 1080 && s.img.h === 1350 && /180 souls/.test(s.img.alt) && s.save === 'soulswarm-run.png' && s.colors > 150 && s.resultsKept && !s.tutBtn,
    JSON.stringify({ b: s.btn, i: s.img, sv: s.save, c: s.colors, k: s.resultsKept, t: s.tutBtn }));
});
check('share card: no runtime errors', !errs.length, errs[0] || '');

// 37. The new heroes: Grimsby Lanternjaw (Epic, Witchfire Lantern, Hallowfire) and Osric the Bone Abbot (Legendary,
//     Skull Halo, Bone Mass). A quiet arena frame-stepped at 30 fps (as section 18); rolls pinned with Math.random.
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const app = window.__soulswarm, p = app.profile, rnd = Math.random;
    const D = await import('/src/game/data.js'), A = await import('/src/ui/art.js');
    app.engine.manual = true;
    p.flags.tutorialDone = true; p.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 };
    const start = (hero) => {
      if (app.run) app.exitRun();
      document.querySelectorAll('.modal-back, .lvl-back').forEach((n) => n.remove());
      p.heroes[hero].owned = true; p.heroes[hero].stars = Math.max(1, p.heroes[hero].stars); p.selectedHero = hero; p.energy = 30; app.startRun(1);
      const r = app.run;
      r.spawnAcc = -1e9; r.nextGate = r.nextSwarm = 1e9; r.eliteIdx = 99; r.modBannerAt = 0;
      r.addXp = () => {}; r.player.hurt = () => {}; r.input.tx = r.input.tz = 0; r.pickups.dropSpecial = () => {}; r.stats.crit = 0;
      return r;
    };
    const step = (r, sec) => { for (let i = 0; i < Math.round(sec * 30); i++) r.update(1 / 30); };
    const foe = (r, dx, dz, o = {}) => { const e = r.enemies.spawn(o.type || 'husk', r.player.x + dx, r.player.z + dz, { hpMul: o.hp ?? 50 }); e.spawnT = 1; if (o.still) e.speed = 0; return e; };
    const dist = (a, b) => +Math.hypot(a.x - b.x, a.z - b.z).toFixed(2);
    const out = {};

    // roster: seven heroes in order, the new Altar shard drops, painted splashes and ability icons
    out.roster = { order: D.HERO_ORDER.join(), epic: D.ALTAR.shardDrops.epic.grimsby, legendary: D.ALTAR.shardDrops.legendary.osric,
      art: !!(A.HERO_ART.grimsby && A.HERO_ART.osric), icons: !!(A.SKILL_ART.witchfire && A.SKILL_ART.hallowPyre),
      evo: D.EVOLUTIONS.hallowPyre.from === 'witchfire' && D.EVOLUTIONS.hallowPyre.needs === 'raiseDead', rites: !!(D.RITES.grimsby && D.RITES.osric) };

    // Witchfire Lantern: walking lays patches (one per 1.1 m), standing still keeps one at his feet; a foe takes the hottest
    // patch it stands in once per tick (two overlapping patches burn no harder than one; a hotter one burns harder)
    let r = start('grimsby'), P = r.player, W = r.weapons;
    out.start = { lv: r.skillLv.witchfire, weapon: Object.keys(r.skillLv).join() };
    let laid = 0; const lay = W.flame.bind(W); W.flame = (...a) => { laid++; return lay(...a); }; // counts patches laid (they also expire)
    step(r, 0.2); laid = 0;
    r.input.tx = 1; r.input.moved = true; step(r, 1); r.input.tx = 0;
    const walked = laid; step(r, 0.3); laid = 0; step(r, 1.3);
    out.trail = { walked, idle: laid, r: +W.flames[0].r.toFixed(2) };
    W.flame = lay;
    W.flames.length = 0;
    const a = foe(r, 6, 6, { still: true }), b = foe(r, -6, 6, { still: true }), c = foe(r, 0, -7, { still: true });
    W.flame(a.x, a.z, 1.2, 5, 20); W.flame(b.x, b.z, 1.2, 5, 20); W.flame(b.x + 0.3, b.z, 1.2, 5, 20); W.flame(c.x, c.z, 1.2, 5, 20); W.flame(c.x, c.z + 0.3, 1.2, 5, 40);
    r.input.moved = false; W.update = function (dt) { this.updateWitchfire(dt, 0); }; // no trail of his own while measuring
    step(r, 1.0);
    const da = a.maxHp - a.hp, db = b.maxHp - b.hp, dc = c.maxHp - c.hp;
    out.ticks = { da: Math.round(da), overlap: +(db / da).toFixed(2), hotter: +(dc / da).toFixed(2) };

    // lanterns (Lv3): one is hurled at the nearest foe, shatters on it and leaves a 2.2 m pool
    r = start('grimsby'); W = r.weapons; P = r.player;
    r.skillLv.witchfire = 3; W.timers.witchfire = 0;
    const t = foe(r, 6, 0, { still: true }); step(r, 0.8);
    const pool = W.flames.find((f) => Math.hypot(f.x - t.x, f.z - t.z) < 1.5 && f.r > 2);
    out.toss = { pool: pool ? +pool.r.toFixed(2) : 0, hit: t.hp < t.maxHp };
    // Hallow Pyre: a witchfire kill bursts into a new patch where it fell
    r.evolved.hallowPyre = true; r.skillLv.witchfire = 5;
    const v = foe(r, -5, 3, { still: true }), n0 = W.flames.length;
    r.enemies.damage(v, 1e9, { source: 'witchfire', silent: true });
    out.pyre = { burst: W.flames.length - n0, at: W.flames.some((f) => Math.hypot(f.x - v.x, f.z - v.z) < 0.01 && Math.abs(f.r - D.EVOLUTIONS.hallowPyre.burst * r.stats.area) < 0.01) };

    // Grimsby's passive: +n Soul Gates give 25% more (+15 becomes +20), and witchfire kills rise ×1.5
    const gates = (hero) => { const rr = start(hero); Math.random = () => 0.3; rr.gates.spawnPair(); Math.random = rnd; const ops = rr.gates.pair.gates.map((g) => g.op.n); rr.gates.despawn(); return ops.join(); };
    out.gates = { vael: gates('vael'), grimsby: gates('grimsby') };
    r = start('grimsby'); r.stats.raise = 0.4; r.stats.cap = 400;
    const rise = (rr, src) => { const e = foe(rr, 4, 0); Math.random = () => 0.5; const n = rr.counters.raised; rr.enemies.damage(e, 1e9, { source: src, silent: true }); Math.random = rnd; return rr.counters.raised - n; };
    out.witchRaise = { fire: rise(r, 'witchfire'), minion: rise(r, 'minion') };

    // Hallowfire: foes within 6 m are scorched and flee for 2 s (one 9 m out is spared); he runs 30% faster for 6 s and
    // his trail runs 1.7 m wide meanwhile
    r = start('grimsby'); P = r.player; W = r.weapons;
    const near = foe(r, 3, 0), far = foe(r, 9, 0); step(r, 0.1);
    const sp0 = r.stats.speed, d0 = dist(near, P);
    r.rites.trigger();
    const H = out.hallow = { fear: +near.fearT.toFixed(1), farFear: far.fearT, scorched: near.hp < near.maxHp, haste: 0 };
    step(r, 0.1); H.haste = +(r.stats.speed / sp0).toFixed(2);
    step(r, 0.9); H.fled = +(dist(near, P) - d0).toFixed(1);
    r.input.tx = -1; r.input.moved = true; step(r, 1); r.input.tx = 0;
    H.wide = W.flames.filter((f) => Math.abs(f.r - D.RITES.grimsby.trailR * r.stats.area) < 0.01).length;
    step(r, 5.5); H.after = +(r.stats.speed / sp0).toFixed(2); H.trailOff = W.riteTrail === null;

    // Osric: the run opens with 20 minions; Skull Halo kills rise ×2; Bone Mass raises 12 monks, the legion deals +50% for
    // 6 s (kept through a stats rebuild) while the halo spins twice as fast, then all is as before
    { const v = start('vael'), e = foe(v, 8, 0); v.enemies.damage(e, 1e9, { source: 'minion', silent: true }); out.vaelTithe = v.pickups.gems[v.pickups.gems.length - 1].pulled; }
    r = start('osric');
    const O = out.osric = { start: r.legion.count, weapon: Object.keys(r.skillLv).join() };
    r.stats.raise = 0.3; r.stats.cap = 400;
    const tithe = (rr, src) => { const e = foe(rr, 8, 0); rr.enemies.damage(e, 1e9, { source: src, silent: true }); return rr.pickups.gems[rr.pickups.gems.length - 1].pulled; };
    O.tithe = tithe(r, 'minion'); O.skullGem = tithe(r, 'skull');
    const n1 = r.legion.count, md0 = r.stats.minionDmg;
    r.rites.trigger(); step(r, 0.1);
    O.monks = r.legion.count - n1; O.fury = +(r.stats.minionDmg / md0).toFixed(2); O.spin = r.weapons.skullSpin; O.pillars = r.rites.pN > 0;
    const hurt = (rr) => { const P2 = rr.player, h0 = P2.hp; P2.invuln = 0; Object.getPrototypeOf(P2).hurt.call(P2, 20); const d = h0 - P2.hp; P2.hp = h0; return d; };
    O.ward = +hurt(r).toFixed(1);
    r.recomputeStats(); r.stats.raise = 0.3; const base = r.stats.minionDmg; step(r, 0.1); O.kept = +(r.stats.minionDmg / base).toFixed(2);
    step(r, 6.5); O.after = +(r.stats.minionDmg / base).toFixed(2); O.spinAfter = r.weapons.skullSpin; O.wardAfter = +hurt(r).toFixed(1);
    app.exitRun(); app.engine.manual = false;
    return out;
  });
  check('new heroes: seven heroes (Grimsby Epic, Osric Legendary) with Altar shards, painted splashes, Witchfire icons, Hallow Pyre and both Rites',
    s.roster.order === 'vael,nyx,seraphine,liora,grimsby,mordrake,osric' && s.roster.epic > 0 && s.roster.legendary > 0 && s.roster.art && s.roster.icons && s.roster.evo && s.roster.rites
    && s.start.weapon === 'witchfire' && s.osric.weapon === 'skullHalo', JSON.stringify({ r: s.roster, w: s.start.weapon, o: s.osric.weapon }));
  check('witchfire: walking lays a patch every 1.1 m, standing still one at his feet; a foe burns from the hottest patch only, once a tick',
    s.trail.walked >= 3 && s.trail.walked <= 7 && s.trail.idle >= 1 && s.trail.idle <= 3 && s.ticks.da > 0 && Math.abs(s.ticks.overlap - 1) < 0.15 && Math.abs(s.ticks.hotter - 2) < 0.2, JSON.stringify({ t: s.trail, k: s.ticks }));
  check('witchfire: Lv3 hurls a lantern that shatters into a 2.2 m pool; Hallow Pyre bursts a witchfire kill into a new patch',
    s.toss.pool >= 2.2 && s.toss.hit && s.pyre.burst === 1 && s.pyre.at, JSON.stringify({ t: s.toss, p: s.pyre }));
  check('Grimsby: +n gates give 25% more (+15 → +20), witchfire kills rise ×1.5 (a 0.5 roll against 40%), other kills do not',
    s.gates.vael === '5,15' && s.gates.grimsby === '5,20' && s.witchRaise.fire === 1 && s.witchRaise.minion === 0, JSON.stringify({ g: s.gates, w: s.witchRaise }));
  check('Hallowfire: foes within 6 m are scorched and flee 2 s (9 m out spared); +30% speed for 6 s with a 1.7 m river of witchfire, then normal',
    s.hallow.fear >= 1.9 && s.hallow.farFear === 0 && s.hallow.scorched && s.hallow.fled > 2 && s.hallow.haste === 1.3 && s.hallow.wide >= 3 && s.hallow.after === 1 && s.hallow.trailOff, JSON.stringify(s.hallow));
  check('Osric: starts with 20 minions, his legion\'s kills send him their souls; Bone Mass: +12 monks, legion +50% (kept through a rebuild), halo ×2 spin, 40% ward, then normal',
    s.osric.start === 20 && s.osric.tithe === true && s.osric.skullGem === false && s.vaelTithe === false && s.osric.monks === 12 && s.osric.fury === 1.5 && s.osric.spin === 2 && s.osric.pillars
    && s.osric.kept === 1.5 && s.osric.ward === 12 && s.osric.after === 1 && s.osric.spinAfter === 1 && s.osric.wardAfter === 20, JSON.stringify(s.osric));
});
check('new heroes: no runtime errors', !errs.length, errs[0] || '');

// 38. Update 5, the Deepening Horde: the Grave Wraith (passes through the legion, which can neither target nor harm it,
//     and dives on a weave), the Corpse Priest (keeps its distance and raises the horde's un-risen dead as hollow Husks),
//     their risen forms (the Phantom takes no recoil, the Soul Priest mends), when they join the horde, and the weapon
//     upgrades (Ashen Chains' pin and twin chains, Grave Pulse's chill, Soul Storm's split, the Bone Crown's aura).
//     A quiet arena frame-stepped at 30 fps, as section 37.
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const app = window.__soulswarm, p = app.profile, rnd = Math.random;
    const D = await import('/src/game/data.js'), A = await import('/src/ui/art.js');
    app.engine.manual = true;
    p.flags.tutorialDone = true; p.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 }; p.chapter.unlocked = 6; p.flags.bloodMoon = 'off';
    const start = (ch = 1) => {
      if (app.run) app.exitRun();
      document.querySelectorAll('.modal-back, .lvl-back').forEach((n) => n.remove());
      p.selectedHero = 'vael'; p.energy = 30; app.startRun(ch);
      const r = app.run;
      r.spawnAcc = -1e9; r.nextGate = r.nextSwarm = 1e9; r.eliteIdx = 99; r.modBannerAt = 0; r.events.director = () => {};
      r.addXp = () => {}; r.player.hurt = () => {}; r.input.tx = r.input.tz = 0; r.pickups.dropSpecial = () => {}; r.stats.crit = 0;
      r.weapons.update = () => {}; r.hazards.update = () => {}; // no weapons and no chapter hazards unless a test asks
      return r;
    };
    const step = (r, sec) => { for (let i = 0; i < Math.round(sec * 30); i++) r.update(1 / 30); };
    const foe = (r, dx, dz, o = {}) => { const e = r.enemies.spawn(o.type || 'husk', r.player.x + dx, r.player.z + dz, { hpMul: o.hp ?? 50 }); e.spawnT = 2; if (o.still) e.speed = 0; return e; };
    const dist = (a, b) => +Math.hypot(a.x - b.x, a.z - b.z).toFixed(2);
    const weaponsOn = (r) => { delete r.weapons.update; };
    const out = {};

    // the Bestiary: thirteen entries, the two new foes after the Bloater, painted and modelled
    await app.foeModels.loadFoeModels();
    const { bestiaryGoals } = await import('/src/meta/bestiary.js');
    out.bestiary = { order: D.BESTIARY.order.join(), art: !!(A.FOE_ART.wraith && A.FOE_ART.priest), models: !!(app.foeModels.foeModel('wraith') && app.foeModels.foeModel('priest')),
      variants: [D.MINIONS.phantom.from, D.MINIONS.soulPriest.from].join(), goals: [bestiaryGoals('wraith').join('/'), bestiaryGoals('priest').join('/'), bestiaryGoals('thief').join('/')].join() };

    // when they join: never in Chapter 1; Wraiths from Chapter 2 at 2:30, Priests from Chapter 3 at 3:00; each under its alive cap
    const mix = (ch, minute, set = {}) => {
      const r = start(ch); r.time = minute * 60; Object.assign(r.enemies.counts, set);
      const n = {}; for (let i = 0; i < 6000; i++) { const t = r.pickType(); n[t] = (n[t] || 0) + 1; }
      return { wraith: n.wraith || 0, priest: n.priest || 0 };
    };
    out.mix = { ch1: mix(1, 5), ch2early: mix(2, 2.3), ch2: mix(2, 4), ch3early: mix(3, 2.8), ch3: mix(3, 4), ch4: mix(4, 4.5), capped: mix(4, 4.5, { wraith: 14, priest: 3 }) };

    // the Grave Wraith: drifts in, then dives ×1.55 within 5 m on a weave (path length per second, alone)
    let r = start(2), P = r.player, E = r.enemies;
    let w = foe(r, 0, 14, { type: 'wraith', hp: 50 }); step(r, 0.1);
    const pace = (e, sec) => { let L = 0, x = e.x, z = e.z; for (let i = 0; i < Math.round(sec * 30); i++) { r.update(1 / 30); L += Math.hypot(e.x - x, e.z - z); x = e.x; z = e.z; } return L / sec; };
    const far = pace(w, 0.8); w.x = P.x; w.z = P.z + 3.5; const near = pace(w, 0.3);
    out.dive = { far: +far.toFixed(2), near: +near.toFixed(2), ratio: +(near / far).toFixed(2) };
    // through the legion: twelve minions guard the Shepherd; none ever targets the Wraith, whose hp minions cannot touch
    r = start(2); P = r.player; E = r.enemies;
    for (let i = 0; i < 12; i++) r.legion.raise(P.x + Math.cos(i) * 1.8, P.z + Math.sin(i) * 1.8, { fx: false });
    w = foe(r, 0, 6, { type: 'wraith', hp: 50 }); const h = foe(r, -4, -3, { hp: 50, still: true });
    let targeted = 0; for (let i = 0; i < 60; i++) { r.update(1 / 30); for (const m of r.legion.list) if (m.target === w) targeted++; }
    out.wraith = { targeted, hp: w.hp === w.maxHp, husk: h.hp < h.maxHp, reached: dist(w, P) < 1.6,
      minion: E.damage(w, 50, { source: 'minion' }), bomb: E.damage(w, 50, { source: 'soulbomb' }), still: w.hp === w.maxHp };
    E.damage(w, 5, { source: 'bolt' }); out.wraith.bolt = w.hp < w.maxHp;

    // the Corpse Priest: settles about 10 m off, backs away inside 7 m
    r = start(3); P = r.player; E = r.enemies;
    let pr = foe(r, 0, 16, { type: 'priest', hp: 50 }); pr.shootCd = 1e9; step(r, 3);
    const settled = dist(pr, P); pr.x = P.x; pr.z = P.z + 5; step(r, 0.6);
    out.keep = { settled, backed: dist(pr, P) > 5.3 };
    // the dead that do not rise are left as corpses; the Priest claims the newest 3 within 7 m, chants 1.2 s, and they rise as
    // hollow Husks (no soul shard, no corpse of their own); a Priest, its Husks and event foes leave none
    r = start(3); P = r.player; E = r.enemies; r.stats.raise = 0;
    pr = foe(r, 0, 10, { type: 'priest', hp: 50, still: true }); pr.shootCd = 1e9;
    for (let i = 0; i < 4; i++) E.kill(foe(r, -1.5 + i, 7), 'bolt');
    E.kill(foe(r, 0, -12), 'bolt'); // too far from the Priest
    out.corpses = r.corpses.length;
    pr.shootCd = 0; step(r, 0.1);
    const chant = { state: pr.state, n: pr.chant ? pr.chant.length : 0, claimed: r.corpses.filter((k) => k.claim === pr.uid).length };
    const h0 = E.counts.husk; step(r, 1.25);
    const risen = E.active.filter((e) => e.reborn);
    out.raise = { ...chant, risen: risen.length, husks: E.counts.husk - h0, stateAfter: pr.state, consumed: r.corpses.filter((k) => k.claim === -1).length };
    const g0 = r.pickups.gems.length, c0 = r.corpses.length; E.kill(risen[0], 'bolt');
    out.reborn = { gem: r.pickups.gems.length - g0, corpse: r.corpses.length - c0 };
    // a stun breaks the chant and frees the graves; so does the Priest's death; corpses older than 10 s are past raising
    for (let i = 0; i < 3; i++) E.kill(foe(r, 2 + i * 0.5, 8), 'bolt');
    pr.shootCd = 0; step(r, 0.1); const mid = pr.state === 1;
    E.stun(pr, 0.5); out.broken = { mid, state: pr.state, chant: pr.chant, free: r.corpses.filter((k) => k.claim === pr.uid).length };
    step(r, 0.6); pr.shootCd = 0; step(r, 0.1); const again = pr.state === 1;
    E.kill(pr, 'bolt'); out.broken.again = again; out.broken.freedOnDeath = r.corpses.filter((k) => k.claim > 0).length;
    out.broken.priestCorpse = r.corpses.length;
    const pr2 = foe(r, 0, 10, { type: 'priest', hp: 50, still: true }); for (const k of r.corpses) k.t = r.time - 11;
    out.broken.stale = r.claimCorpses(pr2, 30, 3);

    // the risen forms: a Wraith rises as a Phantom (no recoil), a Priest as a Soul Priest (mends minions within 4 m)
    r = start(1); P = r.player; E = r.enemies;
    const tg = foe(r, 3, 0, { hp: 200, still: true });
    r.legion.raise(P.x + 2.5, P.z, { kind: 'wraith', fx: false }); r.legion.raise(P.x + 2.5, P.z + 0.3, { kind: 'husk', fx: false });
    const [ph, sh] = r.legion.list; step(r, 1.5);
    out.forms = { phantom: ph.kind, shade: sh.kind, phantomHp: +(ph.hp / ph.maxHp).toFixed(2), shadeHp: +(sh.hp / sh.maxHp).toFixed(2), hit: tg.hp < tg.maxHp };
    r = start(1); P = r.player;
    r.legion.raise(P.x, P.z + 1, { kind: 'priest', fx: false }); r.legion.raise(P.x + 1, P.z, { fx: false }); r.legion.raise(P.x - 7, P.z, { fx: false });
    const [sp, near1, far1] = r.legion.list; step(r, 0.2);
    out.forms.priest = sp.kind;
    for (const m of [sp, near1, far1]) m.hp = m.maxHp * 0.5;
    near1.x = sp.x + 1; near1.z = sp.z; far1.x = sp.x + 7; far1.z = sp.z; sp.healT = 0.01;
    r.legion.update(1 / 30);
    out.forms.mend = { near: +(near1.hp / near1.maxHp).toFixed(2), far: +(far1.hp / far1.maxHp).toFixed(2), self: +(sp.hp / sp.maxHp).toFixed(2) };

    // Ashen Chains: from Lv4 the first foe is pinned 0.25 s; Lv5 casts two chains (never sharing a link); Perdition two of 7
    const grid = (r) => { const L = []; for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) L.push(foe(r, -4.4 + i * 2.2, 1.5 + j * 2.2, { hp: 500, still: true })); return L; };
    const lash = (lv, hell) => {
      const r = start(1), W = r.weapons; r.evolved.chainsOfPerdition = !!hell; const L = grid(r);
      r.update(1 / 30); const fx0 = W.chainFx.length; W.fire('chains', lv); // (one frame files the foes in the spatial grid)
      const res = { chains: W.chainFx.length - fx0, links: L.filter((e) => e.chainMark === W.sweepSeq).length, pinned: L.filter((e) => e.stunT > 0).length };
      if (lv === 5 && !hell) { // the same first foes again: not re-pinned within 2 s, pinned again after
        const again = () => { for (const e of L) e.stunT = 0; W.fire('chains', lv); return L.filter((e) => e.stunT > 0).length; };
        res.soon = again(); r.enemies.time += 2.1; res.later = again();
      }
      return res;
    };
    out.chains = { lv3: lash(3), lv4: lash(4), lv5: lash(5), hell: lash(5, true) };

    // Grave Pulse: from Lv3 the wave chills (×0.75 for 1.5 s; ×0.7 at Lv5 and in Requiem); a stronger running slow is kept
    const pulse = (lv, pre) => {
      const r = start(1), E = r.enemies, e = foe(r, 2, 0, { hp: 500, still: true });
      r.update(1 / 30); if (pre) r.affixes.slow(e, 0, 3);
      r.weapons.fire('gravePulse', lv);
      return e.slowUid === e.uid && e.slowT > E.time ? [e.slowMul, +(e.slowT - E.time).toFixed(2)] : null;
    };
    out.pulse = { lv2: pulse(2), lv3: pulse(3), lv5: pulse(5), kept: pulse(3, true) };
    r = start(1); weaponsOn(r); r.skillLv.soulBolt = 0; r.skillLv.gravePulse = 5; r.evolved.requiem = true; r.weapons.timers.gravePulse = 0;
    const rq = foe(r, 2.5, 0, { hp: 500 }); step(r, 0.5);
    out.pulse.requiem = rq.slowUid === rq.uid && rq.slowT > r.enemies.time ? rq.slowMul : null;

    // Soul Storm: a bolt that kills splits into 2 mini-bolts of half its damage that never split again; a plain bolt does not
    r = start(1); P = r.player; E = r.enemies;
    const weak = foe(r, 3, 0, { hp: 0.01, still: true }); foe(r, 6, 2, { hp: 500, still: true }); foe(r, 6, -2, { hp: 500, still: true });
    r.projectiles.bolt(P.x, P.z, weak, 40, 0, { split: true });
    let minis = []; for (let i = 0; i < 20 && !minis.length; i++) { r.update(1 / 30); minis = r.projectiles.shots.filter((x) => x.mini); }
    out.storm = { minis: minis.length, dmg: minis.map((x) => x.dmg).join(), split: minis.some((x) => x.split) };
    step(r, 1); // the mini-bolts land or fade
    const weak2 = foe(r, -3, 0, { hp: 0.01, still: true }); r.projectiles.bolt(P.x, P.z, weak2, 40, 0, {});
    let plain = 0; for (let i = 0; i < 20; i++) { r.update(1 / 30); plain = Math.max(plain, r.projectiles.shots.filter((x) => x.mini).length); }
    out.storm.plain = plain; out.storm.weak2 = !weak2.active;

    // Bone Crown: minions within 6 m of the Shepherd strike +30%; every 4 s the Crown mends those within 6 m by 20%
    const strike = (crown, at) => {
      const r = start(1), P = r.player, E = r.enemies; r.evolved.boneCrown = crown;
      const e = foe(r, at, 0, { hp: 500, still: true }); r.legion.raise(P.x + at - 0.6, P.z, { fx: false });
      const hits = [], dmg = E.damage.bind(E); E.damage = (x, a, o) => { if (o && o.source === 'minion') hits.push(a); return dmg(x, a, o); };
      Math.random = () => 0.5; try { step(r, 1.5); } finally { Math.random = rnd; }
      return hits.length ? hits[0] : 0;
    };
    const base = strike(false, 3);
    out.crown = { near: +(strike(true, 3) / base).toFixed(2), far: +(strike(true, 8) / strike(false, 8)).toFixed(2) };
    r = start(1); P = r.player; r.evolved.boneCrown = true; r.skillLv.skullHalo = 5;
    r.legion.raise(P.x + 1.5, P.z, { fx: false }); r.legion.raise(P.x + 8, P.z, { fx: false });
    const [cn, cf] = r.legion.list; step(r, 0.1);
    cn.hp = cn.maxHp * 0.5; cf.hp = cf.maxHp * 0.5; cn.x = P.x + 1.5; cn.z = P.z; cf.x = P.x + 8; cf.z = P.z;
    r.weapons.crownT = 0.01; r.weapons.updateSkulls(0.02, 5);
    out.crown.mend = { near: +(cn.hp / cn.maxHp).toFixed(2), far: +(cf.hp / cf.maxHp).toFixed(2), next: +r.weapons.crownT.toFixed(2) };

    app.exitRun(); app.engine.manual = false;
    return out;
  });
  const B = s.bestiary, M = s.mix;
  check('update 5: the Grave Wraith and the Corpse Priest join the Bestiary after the Bloater, painted and modelled (the Priest\'s goals 50 / 500 / 3,000); they rise as the Phantom and the Soul Priest',
    B.order === 'husk,ghoul,brute,witch,bloater,wraith,priest,thief,gravemaw,pyrexa,vaulkar,azrathel,vesperine' && B.art && B.models && B.variants === 'wraith,priest'
    && B.goals === '100/1000/10000,50/500/3000,1/10/50', JSON.stringify(B));
  check('update 5: never in Chapter 1; Wraiths from Chapter 2 at 2:30, Priests from Chapter 3 at 3:00, each under its alive cap',
    M.ch1.wraith === 0 && M.ch1.priest === 0 && M.ch2early.wraith === 0 && M.ch2.wraith > 100 && M.ch2.priest === 0 && M.ch3early.priest === 0 && M.ch3.priest > 50
    && M.ch4.wraith > M.ch2.wraith && M.capped.wraith === 0 && M.capped.priest === 0, JSON.stringify(M));
  check('Grave Wraith: it dives ×1.55 within 5 m; twelve minions never target it, cannot harm it (blows or Soul Bombs), and it reaches the Shepherd; bolts can',
    s.dive.ratio > 1.4 && s.dive.ratio < 1.7 && s.wraith.targeted === 0 && s.wraith.hp && s.wraith.husk && s.wraith.reached && s.wraith.minion === false && s.wraith.bomb === false
    && s.wraith.still && s.wraith.bolt, JSON.stringify({ d: s.dive, w: s.wraith }));
  check('Corpse Priest: it settles about 10 m off and backs away inside 7 m', s.keep.settled > 9 && s.keep.settled < 11 && s.keep.backed, JSON.stringify(s.keep));
  check('Corpse Priest: un-risen dead stay as corpses; it claims the 3 newest within 7 m, chants 1.2 s and they rise as hollow Husks with no soul shard or corpse',
    s.corpses === 5 && s.raise.state === 1 && s.raise.n === 3 && s.raise.claimed === 3 && s.raise.risen === 3 && s.raise.husks === 3 && s.raise.stateAfter === 0 && s.raise.consumed === 3
    && s.reborn.gem === 0 && s.reborn.corpse === 0, JSON.stringify({ c: s.corpses, r: s.raise, b: s.reborn }));
  check('Corpse Priest: a stun breaks the chant and frees its graves, as its death does; it leaves no corpse; graves older than 10 s stay down',
    s.broken.mid && s.broken.state === 0 && s.broken.chant === null && s.broken.free === 0 && s.broken.again && s.broken.freedOnDeath === 0 && s.broken.stale === null, JSON.stringify(s.broken));
  check('risen forms: the Phantom takes no recoil (a Shade does); the Soul Priest mends minions within 4 m by 12% (and itself), not those 7 m away',
    s.forms.phantom === 'phantom' && s.forms.shade === 'shade' && s.forms.phantomHp === 1 && s.forms.shadeHp < 1 && s.forms.hit && s.forms.priest === 'soulPriest'
    && s.forms.mend.near === 0.62 && s.forms.mend.self === 0.62 && s.forms.mend.far === 0.5, JSON.stringify(s.forms));
  const C = s.chains;
  check('Ashen Chains: Lv3 one chain of 5, no pin; Lv4 pins its first foe; Lv5 two chains of 5 with no shared link (a foe pinned at most once per 2 s); Perdition two of 7, both pinned',
    C.lv3.chains === 1 && C.lv3.links === 5 && C.lv3.pinned === 0 && C.lv4.chains === 1 && C.lv4.links === 6 && C.lv4.pinned === 1
    && C.lv5.chains === 2 && C.lv5.links === 10 && C.lv5.pinned === 2 && C.lv5.soon === 0 && C.lv5.later === 2 && C.hell.chains === 2 && C.hell.links === 14 && C.hell.pinned === 2, JSON.stringify(C));
  const U = s.pulse;
  check('Grave Pulse: no chill at Lv2; from Lv3 ×0.75 for 1.5 s, ×0.7 at Lv5 and in Requiem; a stronger running slow is kept',
    U.lv2 === null && U.lv3 && U.lv3[0] === 0.75 && Math.abs(U.lv3[1] - 1.5) < 0.05 && U.lv5[0] === 0.7 && U.requiem === 0.7 && U.kept && U.kept[0] === 0, JSON.stringify(U));
  check('Soul Storm: a killing bolt splits into 2 mini-bolts of half damage that never split; a plain bolt does not split',
    s.storm.minis === 2 && s.storm.dmg === '20,20' && !s.storm.split && s.storm.plain === 0 && s.storm.weak2, JSON.stringify(s.storm));
  check('Bone Crown: minions within 6 m strike ×1.3 (8 m out ×1); every 4 s it mends those within 6 m by 20%',
    s.crown.near === 1.3 && s.crown.far === 1 && s.crown.mend.near === 0.7 && s.crown.mend.far === 0.5 && s.crown.mend.next === 4, JSON.stringify(s.crown));
});
check('update 5: no runtime errors', !errs.length, errs[0] || '');

// 39. Update 6, the Grave Arsenal: Gravefall (tombstones on the horde's densest packs; Necropolis's graves raise the slain
//     beside them), Soul Leech (drain beams that hold the toughest foe, jump to elites and the boss, sear what they cross
//     and heal the Shepherd; Vampiric Communion forks and feeds the legion), the Grave Ward and Dread Reach passives and
//     Banish on the level-up cards. A quiet arena frame-stepped at 30 fps, as section 38.
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const app = window.__soulswarm, p = app.profile, rnd = Math.random;
    const D = await import('/src/game/data.js'), A = await import('/src/ui/art.js'), SK = await import('/src/game/skills.js');
    app.engine.manual = true;
    p.flags.tutorialDone = true; p.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 }; p.chapter.unlocked = 6;
    const start = (ch = 1) => {
      if (app.run) app.exitRun();
      document.querySelectorAll('.modal-back, .lvl-back').forEach((n) => n.remove());
      p.selectedHero = 'vael'; p.energy = 30; app.startRun(ch);
      const r = app.run;
      r.spawnAcc = -1e9; r.nextGate = r.nextSwarm = 1e9; r.eliteIdx = 99; r.modBannerAt = 0; r.events.director = () => {};
      r.addXp = () => {}; r.player.hurt = () => {}; r.input.tx = r.input.tz = 0; r.pickups.dropSpecial = () => {}; r.stats.crit = 0;
      r.hazards.update = () => {}; r.skillLv.soulBolt = 0;
      return r;
    };
    const step = (r, sec) => { for (let i = 0; i < Math.round(sec * 30); i++) r.update(1 / 30); };
    const foe = (r, dx, dz, o = {}) => { const e = r.enemies.spawn(o.type || 'husk', r.player.x + dx, r.player.z + dz, { hpMul: o.hp ?? 50, elite: !!o.elite }); e.spawnT = 2; e.speed = 0; return e; };
    const out = {};

    // the content: two weapons, their evolutions and two passives, all painted
    out.data = { weapons: [D.SKILLS.gravefall.type, D.SKILLS.soulLeech.type].join(), passives: [D.SKILLS.graveWard.type, D.SKILLS.dreadReach.type].join(),
      evo: [D.EVOLUTIONS.necropolis.from, D.EVOLUTIONS.necropolis.needs, D.EVOLUTIONS.vampiricCommunion.from, D.EVOLUTIONS.vampiricCommunion.needs].join(),
      art: ['gravefall', 'necropolis', 'soulLeech', 'vampiricCommunion', 'graveWard', 'dreadReach'].every((id) => !!A.SKILL_ART[id]) };

    // the passives: Grave Ward -6% damage taken a level, Dread Reach +10% area a level
    let r = start(); r.skillLv.graveWard = 2; r.skillLv.dreadReach = 3; r.recomputeStats();
    const P0 = r.player, h0 = P0.hp; P0.invuln = 0; Object.getPrototypeOf(P0).hurt.call(P0, 20);
    out.passives = { ward: +r.stats.ward.toFixed(2), took: +(h0 - P0.hp).toFixed(1), area: +r.stats.area.toFixed(2) };

    // Gravefall: Lv1 drops one stone on the pack of eight, not on the lone foe; Lv5 drops four, spread apart
    r = start(); let W = r.weapons, Ar = W.arsenal, P = r.player;
    const pack = []; for (let i = 0; i < 8; i++) pack.push(foe(r, 6 + (i % 3) * 0.6, (i / 3 | 0) * 0.6));
    const lone = foe(r, -8, 0); r.update(1 / 30);
    Ar.dropStones(1); const st = Ar.stones[0];
    const at = { n: Ar.stones.length, onPack: Math.hypot(st.x - (P.x + 6.6), st.z - (P.z + 0.6)) < 1.5 };
    step(r, 0.7);
    out.fall = { ...at, hit: pack.filter((e) => e.hp < e.maxHp).length, lone: lone.hp === lone.maxHp };
    r = start(); W = r.weapons; Ar = W.arsenal; P = r.player;
    for (let k = 0; k < 4; k++) for (let i = 0; i < 4; i++) foe(r, Math.cos(k * 1.57) * 7 + (i % 2) * 0.5, Math.sin(k * 1.57) * 7 + (i / 2 | 0) * 0.5);
    r.update(1 / 30); Ar.dropStones(5);
    const S5 = Ar.stones, gaps = []; for (let i = 0; i < S5.length; i++) for (let j = i + 1; j < S5.length; j++) gaps.push(Math.hypot(S5[i].x - S5[j].x, S5[i].z - S5[j].z));
    out.fall.lv5 = { n: S5.length, minGap: +Math.min(...gaps).toFixed(1) };

    // Necropolis: six stones that stand 3 s as graves; a foe slain beside one rises (a 0.5 roll against 30% + 40 pp), elsewhere not
    r = start(); W = r.weapons; Ar = W.arsenal; P = r.player; r.evolved.necropolis = true; r.skillLv.gravefall = 5; W.timers.gravefall = 1e9; r.stats.raise = 0.3; // (only the stones dropped here)
    for (let k = 0; k < 6; k++) for (let i = 0; i < 3; i++) foe(r, Math.cos(k) * 7 + i * 0.4, Math.sin(k) * 7);
    r.update(1 / 30); Ar.dropStones(5); step(r, 0.7);
    const g = Ar.stones[0], gx = g.x, gz = g.z;
    out.necro = { n: Ar.stones.length, standing: Ar.stones.every((x) => x.state === 1), near: Ar.graveNear(gx + 1, gz), far: Ar.graveNear(gx + 30, gz) };
    const raised0 = r.counters.raised;
    Math.random = () => 0.5;
    try { const a = foe(r, 0, 0, { hp: 0.01 }); a.x = gx + 0.5; a.z = gz; r.enemies.kill(a, 'bolt'); const b = foe(r, 0, 0, { hp: 0.01 }); b.x = gx + 40; b.z = gz; r.enemies.kill(b, 'bolt'); }
    finally { Math.random = rnd; }
    out.necro.rose = r.counters.raised - raised0;
    step(r, 3.2); out.necro.after = Ar.graveNear(gx, gz);

    // Soul Leech Lv3: two beams, the elite first then the toughest common foe; they hold their foes; the Shepherd heals
    r = start(); W = r.weapons; Ar = W.arsenal; P = r.player; r.skillLv.soulLeech = 3; delete W.update;
    const commons = [foe(r, 3, 0, { hp: 40 }), foe(r, -3, 1, { hp: 60 }), foe(r, 0, -4, { hp: 50 })], el = foe(r, 2, 3, { type: 'brute', elite: true, hp: 30 });
    P.hp = P.maxHp * 0.5; const hp0 = P.hp;
    step(r, 0.3);
    const first = Ar.beams.map((b) => b.e), held = first.find((e) => !e.elite);
    out.leech = { beams: first.length, elite: first.includes(el), toughest: held === commons[1] };
    commons[0].hp = commons[0].maxHp * 5; // a fresher, tougher foe appears: the beam keeps its own
    step(r, 1.5);
    out.leech.kept = Ar.beams.some((b) => b.e === commons[1]) && !Ar.beams.some((b) => b.e === commons[0]);
    out.leech.healed = +(P.hp - hp0).toFixed(1); out.leech.cap = +(D.SKILLS.soulLeech.healCap * 1.8 + 0.5).toFixed(1);
    // the sear: a foe on the beam's path burns, one beside the Shepherd off its path does not
    r = start(); W = r.weapons; Ar = W.arsenal; P = r.player; r.skillLv.soulLeech = 1; delete W.update;
    const tgt = foe(r, 6, 0), path = foe(r, 3, 0), off = foe(r, 0, 4);
    tgt.maxHp = tgt.hp = 1e6; path.maxHp = path.hp = off.maxHp = off.hp = 5000; // (the target is the toughest from the first frame)
    step(r, 1);
    out.sear = { on: Ar.beams[0] && Ar.beams[0].e === tgt, path: path.hp < path.maxHp, off: off.hp === off.maxHp };
    // the boss takes every beam
    r = start(); W = r.weapons; Ar = W.arsenal; P = r.player; r.skillLv.soulLeech = 5; delete W.update;
    foe(r, 3, 0); foe(r, -3, 0); foe(r, 0, 3);
    r.boss.spawn(); r.bossSpawned = true; const B = r.bossEnemy; B.x = P.x + 5; B.z = P.z; r.boss.state = 'chase';
    step(r, 1);
    out.boss = Ar.beams.map((b) => b.e.type === 'boss').join();

    // Vampiric Communion: four beams that fork; at full HP the stolen life mends the most wounded minions
    r = start(); W = r.weapons; Ar = W.arsenal; P = r.player; r.skillLv.soulLeech = 5; r.evolved.vampiricCommunion = true; delete W.update;
    for (let i = 0; i < 10; i++) foe(r, Math.cos(i * 0.63) * 4, Math.sin(i * 0.63) * 4, { hp: 80 });
    r.legion.raise(P.x - 1, P.z, { fx: false }); const mn = r.legion.list[0];
    step(r, 0.2); mn.hp = mn.maxHp * 0.3; mn.x = P.x - 1; mn.z = P.z; P.hp = P.maxHp;
    step(r, 1.5);
    out.vc = { beams: Ar.beams.length, forks: Ar.beams.filter((b) => b.f).length, mended: mn.hp > mn.maxHp * 0.3 + 1 };

    // Banish: two a run (none in the tutorial); a banished skill never comes back; its card is replaced by one not on the table
    r = start();
    out.ban = { left: r.banishLeft };
    const hand = SK.rollChoices(r, 3), victim = hand.find((c) => c.kind === 'weapon' || c.kind === 'passive');
    const repl = SK.banish(r, victim, hand.filter((c) => c !== victim));
    let back = 0; for (let i = 0; i < 300; i++) if (SK.rollChoices(r, 3).some((c) => c.id === victim.id)) back++;
    out.ban = { ...out.ban, after: r.banishLeft, repl: !!repl && repl.id !== victim.id && !hand.some((c) => c !== victim && c.id === repl.id), back };
    // the cards: a ✕ on each skill card replaces it in place and counts down; at zero the ✕s are gone
    r = start(); r.levelQueue = 1; r.showLevelUp();
    const q = (sel) => document.querySelector(sel), wait = (ms) => new Promise((res) => setTimeout(res, ms));
    r.t += 1; const names0 = [...document.querySelectorAll('.lvl-back .card h3')].map((n) => n.firstChild.textContent.trim());
    const ui = { bans: document.querySelectorAll('.lvl-back .card .ban').length, note: q('.lvl-ban').textContent };
    q('.lvl-back .card .ban').click(); await wait(80); r.t += 1;
    const names1 = [...document.querySelectorAll('.lvl-back .card h3')].map((n) => n.firstChild.textContent.trim());
    ui.replaced = names1.length === 3 && names1[0] !== names0[0] && names1[1] === names0[1]; ui.note2 = q('.lvl-ban').textContent;
    q('.lvl-back .card .ban').click(); await wait(80);
    ui.none = document.querySelectorAll('.lvl-back .card .ban').length; ui.left = r.banishLeft;
    document.querySelectorAll('.lvl-back').forEach((n) => n.remove()); r.levelPending = false;
    out.banUi = ui;

    app.exitRun(); app.engine.manual = false;
    return out;
  });
  check('update 6: Gravefall and Soul Leech (weapons), Grave Ward and Dread Reach (passives), Necropolis and Vampiric Communion, all painted',
    s.data.weapons === 'weapon,weapon' && s.data.passives === 'passive,passive' && s.data.evo === 'gravefall,legionCap,soulLeech,graveWard' && s.data.art, JSON.stringify(s.data));
  check('passives: Grave Ward Lv2 takes 12% off a hit (20 → 17.6); Dread Reach Lv3 is +30% weapon area',
    s.passives.ward === 0.88 && s.passives.took === 17.6 && s.passives.area === 1.3, JSON.stringify(s.passives));
  check('Gravefall: a stone falls on the densest pack (not the lone foe) and lands after its shadow; Lv5 drops four, spread apart',
    s.fall.n === 1 && s.fall.onPack && s.fall.hit >= 6 && s.fall.lone && s.fall.lv5.n === 4 && s.fall.lv5.minGap > 2, JSON.stringify(s.fall));
  check('Necropolis: six stones stand as graves for 3 s; the slain beside one rise (+40 pp), elsewhere not',
    s.necro.n === 6 && s.necro.standing && s.necro.near && !s.necro.far && s.necro.rose === 1 && !s.necro.after, JSON.stringify(s.necro));
  check('Soul Leech: beams take the elite and the toughest foe, hold them, and heal the Shepherd within the bank\'s cap',
    s.leech.beams === 2 && s.leech.elite && s.leech.toughest && s.leech.kept && s.leech.healed > 0 && s.leech.healed <= s.leech.cap, JSON.stringify(s.leech));
  check('Soul Leech: the beam sears the foe it crosses, not one off its path; every beam takes the boss',
    s.sear.on && s.sear.path && s.sear.off && s.boss === 'true,true,true', JSON.stringify({ sear: s.sear, boss: s.boss }));
  check('Vampiric Communion: four beams that fork; at full HP the stolen life mends the most wounded minion',
    s.vc.beams === 4 && s.vc.forks === 4 && s.vc.mended, JSON.stringify(s.vc));
  check('Banish: two a run; a banished skill never returns; its replacement is not already on the table',
    s.ban.left === 2 && s.ban.after === 1 && s.ban.repl && s.ban.back === 0, JSON.stringify(s.ban));
  const U = s.banUi;
  check('Banish on the cards: a ✕ on each skill card replaces it in place, the count goes down, and at zero the ✕s are gone',
    U.bans === 3 && /2 left/.test(U.note) && U.replaced && /1 left/.test(U.note2) && U.none === 0 && U.left === 0, JSON.stringify(U));
});
check('update 6: no runtime errors', !errs.length, errs[0] || '');

await browser.close();
if (server) server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
