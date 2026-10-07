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
  prof.flags.tutorialDone = true; prof.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1 }; prof.energy = 30; prof.chapter.unlocked = 6;
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

// 21b. Abandoning from the pause menu during the victory beat (Gravemaw already fell) still wins the chapter;
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
    app.exitRun();
    return out;
  });
  check('regression: abandoning during the victory beat still wins; mid-run it is a defeat',
    s.won.ended && s.won.victory === true && s.mid.ended && s.mid.victory === false, JSON.stringify(s));
});
check('abandon regression: no runtime errors', !errs.length, errs[0] || '');

await browser.close();
if (server) server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
