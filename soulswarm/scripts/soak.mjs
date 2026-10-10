// Soak and fuzz harness: a seeded, randomized bot plays whole runs (through Gravemaw to victory, death or an Endless
// abandon) with chaos inputs at random moments, and checks the run's invariants every frame (cheap) and every second (deep).
// usage: node scripts/soak.mjs <url> [runs=60] [seed=1]        (needs a running dev server, e.g. npx vite --port 5320)
//   matrix filters: HERO=vael,nyx  CH=1,3 (1–30; default Act I and one chapter per later act)  DIFF=normal,torment  KIND=campaign,endless,trial,bloodmoon  GOD=1|0 (default mixed)
//   CHAOS=1 (scales every chaos input's rate; 0 = none)  RENDER=240 (full render every Nth frame, 0 = never; plus short
//   bursts at big moments; the 2D overlay is drawn every 5th frame)
//   PAR=2 (pages in parallel)  PER_PAGE=4 (runs per page before a fresh one)  CHUNK=300 (frames per evaluate)  ADS=1 (wait out ads)
//   RUN=17 replays run #17 of the same matrix (same arguments and filters, so the same seeds and steps; RUN=0-44 plays a
//   slice); STOP=frame halts the replay there and prints the run state. A violation's line names its run, segment and frame:
//   that is the repro. LEAK=30 starts and exits 30 runs in one page and reports renderer, DOM and heap growth; PERF=1 times
//   engine.step with a full horde, the legion, a Rite, a Nova and an event at once (CH=29: in a late realm, with its foe). OUT=file.json writes every run's result.
// Invariants: no page errors or console.error; finite positions, HP, XP, Nova, timers, gold and counters; the enemy pool
// (count, duplicates, pooled-and-active); 0 <= legion <= 400; run time advances unless legitimately blocked, every block
// resolves once the bot acts, the time scale recovers; Gravemaw rises at 6:00 and dies in bounded time in god mode, and the
// victory beat ends the run, which onEnd reports exactly once (never a defeat once he fell) with a matching results screen;
// rules and HUD (no Nova charge mid-detonation, NOVA reads ready only when a tap fires it, the boss bar); after exitRun
// nothing from the run ticks and no HUD nodes or intervals remain.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const pw = require(execSync('npm root -g').toString().trim() + '/playwright');
const URL = process.argv[2] || 'http://localhost:5173/';
const RUNS = +(process.argv[3] || 60), SEED = +(process.argv[4] || 1) >>> 0;
const env = process.env;
const list = (k, all) => (env[k] ? env[k].split(',').map((s) => s.trim()) : all);
const PAR = +(env.PAR || 2), PER_PAGE = +(env.PER_PAGE || 4), CHUNK = +(env.CHUNK || 300);
const RUN_R = env.RUN != null ? env.RUN.split('-').map(Number) : [-1], RUN_A = RUN_R[0], RUN_B = RUN_R[1] ?? RUN_A; // one run, or a slice a-b

const prng = (s) => { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ---------------------------------------------------------------- the matrix
function matrix() {
  const rng = prng(SEED), pick = (a) => a[Math.floor(rng() * a.length)];
  const HEROES = list('HERO', ['vael', 'nyx', 'seraphine', 'liora', 'mordrake']), CHS = list('CH', ['1', '2', '3', '4', '5', '8', '14', '19', '23', '29']).map(Number); // Act I and one chapter of each later act
  const DIFFS = list('DIFF', ['normal', 'nightmare', 'torment']), KINDS = list('KIND', ['campaign', 'endless', 'trial', 'bloodmoon']);
  const combos = [];
  for (const hero of HEROES) for (const ch of CHS) for (const diff of DIFFS) combos.push({ hero, ch, diff });
  for (let i = combos.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [combos[i], combos[j]] = [combos[j], combos[i]]; }
  const specials = KINDS.filter((k) => k !== 'campaign'), out = [];
  let ci = 0, si = 0;
  for (let i = 0; i < RUNS; i++) {
    const special = specials.length && (!KINDS.includes('campaign') || i % 6 === 5);
    let cfg;
    if (special) { const kind = specials[si++ % specials.length]; cfg = { kind, hero: pick(HEROES), ch: pick(CHS), diff: kind === 'bloodmoon' ? pick(DIFFS) : 'normal' }; }
    else cfg = { kind: 'campaign', ...combos[ci++ % combos.length] };
    cfg.idx = i; cfg.seed = Math.floor(rng() * 2 ** 32);
    cfg.god = env.GOD ? env.GOD === '1' : cfg.kind === 'endless' ? rng() < 0.75 : rng() < 0.5;
    cfg.tut = cfg.kind === 'campaign' && cfg.ch === 1 && cfg.diff === 'normal' && rng() < 0.3; // a first run: the gentler King, scripted lessons
    cfg.prog = cfg.kind === 'endless' || cfg.diff !== 'normal' ? 5 : cfg.kind === 'trial' ? 3 : cfg.ch;
    cfg.chaos = +(env.CHAOS ?? 1); cfg.render = +(env.RENDER ?? 240); cfg.ads = env.ADS === '1'; cfg.stop = env.STOP ? +env.STOP : 0;
    out.push(cfg);
  }
  return out;
}

// ---------------------------------------------------------------- in-page harness (serialized into the page)
function installSoak() {
  const app = window.__soulswarm, DT = 1 / 30, fin = Number.isFinite;
  const prng = (s) => { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const realNow = performance.now.bind(performance);
  const PROG = { // what a player typically owns on arrival (scripts/balance.mjs)
    1: { talents: 0, stars: 1, relics: [['crown', 'common', 1], ['heart', 'common', 1]] },
    2: { talents: 8, stars: 1, relics: [['crown', 'rare', 2], ['heart', 'common', 3], ['lantern', 'common', 2]] },
    3: { talents: 25, stars: 2, relics: [['crown', 'rare', 4], ['heart', 'rare', 3], ['lantern', 'rare', 3]] },
    4: { talents: 60, stars: 3, relics: [['crown', 'epic', 4], ['heart', 'rare', 6], ['idol', 'epic', 3]] },
    5: { talents: 110, stars: 3, relics: [['crown', 'epic', 7], ['heart', 'epic', 5], ['idol', 'epic', 6]] },
  };
  // Acts II–VI (Update 13): balance.mjs's LATE table (hero stars; relic rarity, level and Ascension stars)
  for (const [from, stars, rarity, level, rs] of [[6, 3, 'epic', 8, 0], [8, 4, 'epic', 9, 1], [10, 4, 'epic', 10, 1], [12, 4, 'epic', 10, 2], [14, 4, 'legendary', 4, 2],
    [16, 5, 'legendary', 5, 2], [18, 5, 'legendary', 6, 3], [20, 5, 'legendary', 7, 3], [22, 5, 'legendary', 8, 3], [24, 5, 'legendary', 9, 4], [26, 5, 'legendary', 10, 4], [28, 5, 'legendary', 10, 5]])
    for (let c = from; c < from + 2; c++) PROG[c] = { talents: 110, stars, relics: [['crown', rarity, level, rs], ['heart', rarity, Math.max(1, level - 1), rs], ['idol', rarity, level, rs]] };
  // intervals still running after their run was exited are a leak: remember which run created each
  const SI = window.setInterval.bind(window), CI = window.clearInterval.bind(window), intervals = new Map();
  let runTag = -1;
  window.setInterval = (fn, ms, ...a) => { const id = SI(fn, ms, ...a); intervals.set(id, { tag: runTag, at: (new Error().stack || '').split('\n').slice(2, 4).map((s) => s.trim()).join(' < ') }); return id; };
  window.clearInterval = (id) => { intervals.delete(id); return CI(id); };
  const setHidden = (on) => { // document.hidden is a prototype getter: shadow it, then drop the shadow
    if (on) Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); else delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  };

  let S = null; // the soak state of the current run
  const runRefs = []; // every run started, weakly: a run still reachable after exitRun (and a GC) is a leak
  const V = (kind, msg, extra) => {
    if (!S) return;
    const key = kind + ':' + msg.replace(/[-\d.e+]+/g, '#');
    const seen = S.seen.get(key);
    if (seen) { seen.n++; return; }
    const r = S.run, o = { kind, msg, frame: S.frame, t: r ? +r.time.toFixed(2) : 0, seg: S.seg, n: 1, ...(extra || {}) };
    S.seen.set(key, o); S.viol.push(o);
  };
  const blockedWhy = (r) => (r.ended ? 'ended' : r.paused ? 'paused' : r.levelPending ? 'levelPending' : r.player.dead ? 'dead' : '');
  const findModal = (title) => [...document.querySelectorAll('.modal-back')].find((b) => (b.querySelector('.modal h2') || {}).textContent === title);
  const pointer = (el) => el && el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch' }));

  // ---------------------------------------------------------------- setup
  function setupProfile(cfg) {
    const p = app.profile, prog = PROG[cfg.prog] || PROG[1];
    const keys = ['might', 'vitality', 'raise', 'cap', 'swift'];
    for (const k of Object.keys(p.talents)) p.talents[k] = 0;
    for (let i = 0; i < prog.talents; i++) { const k = keys[i % keys.length]; p.talents[k] = Math.min(p.talents[k] + 1, k === 'swift' ? 15 : k === 'raise' || k === 'cap' ? 20 : 25); }
    p.relics = prog.relics.map(([type, rarity, level, stars], i) => ({ uid: 's' + i, type, rarity, level, stars: stars || 0 }));
    p.equipped = p.relics.map((r) => r.uid);
    Object.assign(p.heroes[cfg.hero], { owned: true, stars: prog.stars }); p.selectedHero = cfg.hero;
    p.chapter.unlocked = 30; p.energy = 30; p.gems = 1e6;
    for (let c = 1; c <= 30; c++) { p.chapter.best[c] = { time: 420, cleared: true, kills: 0 }; p.diff.best[c] = { normal: { time: 420, legion: 0, kills: 0, cleared: true }, nightmare: { time: 420, legion: 0, kills: 0, cleared: true } }; }
    p.flags.tutorialDone = !cfg.tut; p.flags.hints = cfg.tut ? {} : { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 };
    p.flags.bloodMoon = cfg.kind === 'bloodmoon' ? 'on' : 'off';
    Object.assign(p.settings, { shake: 1, reduceFlash: false, autoNova: false, lefty: false, fps30: false, quality: 'auto', muted: true }); // muted: the synth reads the clock
    app.applySettings();
    app.engine.applyQuality('medium'); // 'auto' keeps the current tier: a run's chaos toggle must not carry into the next (replays)
  }

  /** Start (or, after a chaos exit, restart) the run under test. */
  function begin(cfg) {
    setupProfile(cfg);
    app.engine.manual = true;
    runTag = cfg.idx * 100 + S.seg;
    Math.random = prng(cfg.seed); // the game's stream; the bot has its own (S.rnd)
    let ok;
    if (cfg.kind === 'trial') { // a random day picks the chapter and the boon and bane
      const dn = Date.now, day = Date.UTC(2026, 0, 1, 12) + Math.floor(S.rnd() * 3650) * 864e5;
      Date.now = () => day;
      try { ok = app.startRun(0, { trial: true }); } finally { Date.now = dn; }
    } else ok = app.startRun(cfg.kind === 'endless' ? 100 : cfg.ch, { difficulty: cfg.diff }); // the Endless Abyss is ENDLESS_ID
    if (!ok || !app.run) return false;
    const r = S.run = app.run;
    runRefs.push(new WeakRef(r));
    hook(r, cfg);
    S.bossT = 0; S.blocked = 0; S.slowT = 0; S.noModal = 0; S.orphan = 0; S.novaUi = 0; S.barUi = 0; S.beatT = 0; S.wait = -1; S.lastBack = null; S.gp = null; S.ev = null; S.novaAt = -1; S.riteAt = -1;
    S.phase = -1; S.boss = false; S.endFrame = -1; S.wantAbandon = false; S.forcedDeath = false; S.beatDeath = false;
    return true;
  }

  function hook(r, cfg) {
    const T = r.__soak = { ends: 0 }, P = r.player;
    const oe = r.onEnd;
    r.onEnd = (res) => {
      T.ends++; T.result = res;
      if (T.ends > 1) V('end', `onEnd called ${T.ends} times`);
      if (!res.victory && r.bossDead && !r.endless) V('end', `defeat recorded after Gravemaw fell (${S.lastAnswer || 'no answer'}; dead ${r.player.dead}, beat ${r.victory ? r.victory.t.toFixed(2) : '-'} s)`);
      oe(res);
    };
    const tn = r.triggerNova.bind(r);
    r.triggerNova = () => { const why = blockedWhy(r); const ok = tn(); if (ok) { S.burst = Math.max(S.burst, 2); S.stat.novas++; if (why) V('chaos', 'Soul Nova fired while ' + why); } return ok; };
    const R = r.rites, rt = R.trigger.bind(R);
    R.trigger = () => { const why = blockedWhy(r); const ok = rt(); if (ok) { S.burst = Math.max(S.burst, 1); S.stat.rites++; if (why) V('chaos', 'Rite cast while ' + why); } return ok; };
    const E = r.enemies, cp = E.compact.bind(E);
    let k = 0;
    E.compact = () => { cp(); checkEnemies(r, true, (k++ % 15) === 0); };
    if (cfg.god) { // no hit kills (hurt still runs, so invulnerability, numbers and flashes stay exercised)
      const h0 = P.hurt.bind(P);
      P.hurt = (d, dot) => { h0(Math.min(d, Math.max(0, P.hp - 1)), dot); if (P.hp < P.maxHp * 0.25) P.hp = P.maxHp; };
    }
  }

  function start(cfg) {
    if (app.run) app.exitRun();
    document.querySelectorAll('.modal-back, .lvl-back, .ad-sim, .toast').forEach((n) => n.remove());
    S = { cfg, rnd: prng(cfg.seed ^ 0x5bd1e995), frame: 0, seg: 0, viol: [], seen: new Map(), olds: [], burst: 0, clock: 1e6, hiddenT: 0,
      gameAcc: 0, stat: { renders: 0, renderMs: 0, novas: 0, rites: 0, deaths: 0, revives: 0, pauses: 0, hides: 0, exits: 0, settings: 0, shrines: 0, forced: 0, abandons: 0, ads: 0, cards: 0 } };
    window.__soakS = S;
    const ok = begin(cfg);
    return { ok, violations: S.viol.splice(0) };
  }

  // ---------------------------------------------------------------- invariants
  const INF_OK = new Set(['nextWave', '_bestD2', '_leash2', 'wellT']); // wellT: no pull (every boss but Nihl)
  function scan(o, path) {
    if (!o) return;
    for (const k in o) {
      const v = o[k];
      if (typeof v === 'number' && (v !== v || (!fin(v) && !INF_OK.has(k)))) V('nan', `${path}.${k} = ${v}`);
    }
  }
  function scanList(a, path, test) {
    for (let i = 0; i < a.length; i++) {
      const o = a[i];
      if (!o || typeof o !== 'object') { V('pool', `${path}[${i}] is ${o}`); continue; }
      if (!test || test(o)) scan(o, path + '[]');
    }
  }
  function checkEnemies(r, compacted, full) {
    const E = r.enemies, a = E.active;
    let n = 0;
    for (let i = 0; i < a.length; i++) {
      const e = a[i];
      if (e.active) { n++; if (e.pooled) V('pool', `active ${e.type} is also pooled`); }
      else if (compacted) V('pool', `inactive ${e.type} left in the active list after compact()`);
    }
    const c = E.counts, sum = Object.values(c).reduce((a, v) => a + v, 0); // every type (the act foes, Wraiths, Priests, events)
    if (sum !== n) V('pool', `enemy counts sum to ${sum} but ${n} are active`);
    for (const t in c) if (c[t] < 0) V('pool', `enemy count ${t} is ${c[t]}`);
    if (compacted && E.count !== n) V('pool', `enemies.count ${E.count} != ${n} active after compact()`);
    if (!full) return;
    if (new Set(a).size !== a.length) V('pool', 'duplicate objects in enemies.active');
    const live = new Set(a);
    for (const o of E.pool) if (o.active || live.has(o)) V('pool', 'an enemy is both pooled and active');
    if (new Set(E.pool).size !== E.pool.length) V('pool', 'duplicate objects in the enemy pool');
  }
  function deep(r) {
    const P = r.player, L = r.legion;
    scan(r, 'run'); scan(P, 'player'); scan(r.fx, 'fx'); scan(r.streak, 'streak'); scan(r.rites, 'rites'); scan(r.events, 'events');
    scan(r.stats, 'stats'); scan(r.counters, 'counters'); scan(L, 'legion'); scan(r.enemies, 'enemies'); scan(r.pickups, 'pickups');
    scan(r.weapons, 'weapons'); scan(r.weapons.timers, 'weapons.timers'); scan(r.affixes, 'affixes'); scan(r.hazards, 'hazards'); scan(r.camPos, 'camPos');
    if (r.boss.e) { scan(r.boss, 'boss'); scan(r.boss.arena, 'boss.arena'); }
    if (r.gates.pair) scan(r.gates.pair, 'gates.pair');
    if (r.events.cur) scan(r.events.cur, 'events.cur');
    scanList(r.enemies.active, 'enemy', (e) => e.active);
    scanList(L.list, 'minion'); scanList(L.orbs, 'orb');
    scanList(r.projectiles.shots, 'shot'); scanList(r.projectiles.embers, 'ember'); scanList(r.projectiles.lobs, 'lob');
    scanList(r.pickups.gems, 'gem'); scanList(r.pickups.special, 'special'); scanList(r.novaQueue, 'novaQueue'); scanList(r.burstQueue, 'burstQueue');
    for (const k in r.counters) {
      const v = r.counters[k];
      if (v && typeof v === 'object') { for (const t in v) if (!(v[t] >= 0) || Math.floor(v[t]) !== v[t]) V('nan', `counters.${k}.${t} = ${v[t]}`); } // kills per foe (the Bestiary)
      else if (!(v >= 0) || Math.floor(v) !== v) V('nan', `counters.${k} = ${v}`);
    }
    // bounds: HP within its max, queues and caps sane, XP below the next level
    if (P.hp > P.maxHp + 1e-6 || P.hp < 0) V('nan', `player hp ${P.hp} / ${P.maxHp}`);
    if (r.levelQueue < 0 || r.chestQueue < 0) V('nan', `level queue ${r.levelQueue}, chest queue ${r.chestQueue}`);
    if (!(r.xp < r.xpNeed) && !r.levelPending) V('nan', `xp ${r.xp} >= xpNeed ${r.xpNeed}`);
    if (r.stats.cap > 400 || r.stats.raise > 0.85 + 1e-9) V('nan', `stats out of range (cap ${r.stats.cap}, raise ${r.stats.raise})`);
    for (const e of r.enemies.active) if (e.active && e.hp > e.maxHp * (1 + 1e-9)) V('nan', `${e.type} hp ${e.hp} > maxHp ${e.maxHp}`);
    for (const m of L.list) if (m.hp > m.maxHp * (1 + 1e-9)) V('nan', `${m.kind} minion hp ${m.hp} > maxHp ${m.maxHp}`);
    if (r.pickups.gems.length > 420) V('pool', `${r.pickups.gems.length} soul shards on the field`);
    const post = app.engine.post;
    for (const k of ['uWhite', 'uAberr', 'uDesat', 'uVignette']) if (!fin(post[k].value)) V('nan', `post.${k} = ${post[k].value}`);
    if (!fin(post.uFlash.value.w)) V('nan', 'post.uFlash.w');
    // the legion: no duplicates, nothing both listed and pooled
    const set = new Set(L.list);
    if (set.size !== L.list.length) V('pool', 'duplicate minions in legion.list');
    for (const m of L.pool) if (set.has(m)) V('pool', 'a minion is both listed and pooled');
    for (const t of L.taunters) if (!set.has(t) && t.hp > 0) V('pool', 'a live taunter is not in the legion');
    const lp = r.projectiles.lobPool, ls = new Set(r.projectiles.lobs);
    if (new Set(lp).size !== lp.length) V('pool', 'duplicate lobs in the lob pool');
    for (const o of lp) if (ls.has(o)) V('pool', 'a Witch lob is both in flight and pooled');
    checkEnemies(r, false, true);
  }

  function checkOlds() {
    for (const o of S.olds) {
      const r = o.r;
      if (r.t !== o.t || r.time !== o.time) V('exit', `an exited run kept ticking (t ${o.t.toFixed(2)} -> ${r.t.toFixed(2)}, ${o.why})`);
      if (r.levelPending !== o.lp) V('exit', `a timer opened a level-up on an exited run (${o.why})`);
      if (r.__soak.ends !== o.ends) V('exit', `an exited run ended after exitRun (onEnd x${r.__soak.ends}, ${o.why})`);
      if (!o.checked && realNow() - o.at > 1500) {
        o.checked = true;
        for (const [id, it] of intervals) if (it.tag === o.tag) V('exit', `interval still running after exitRun: ${it.at}`, { id });
      }
    }
  }

  // ---------------------------------------------------------------- the bot
  function steer(r) {
    const P = r.player, R = S.rnd, cfg = S.cfg;
    let fx = 0, fz = 0;
    r.enemies.query(P.x, P.z, 7, (e) => { if (e.type === 'boss' || e.ev) return; const dx = P.x - e.x, dz = P.z - e.z, d2 = dx * dx + dz * dz + 0.5; fx += dx / d2; fz += dz / d2; });
    if (cfg.god) { fx *= 0.6; fz *= 0.6; }
    const B = r.bossEnemy;
    if (B && B.active) { const dx = B.x - P.x, dz = B.z - P.z, d = Math.hypot(dx, dz) || 1, pull = d > 7.5 ? 1.2 : d < 5 ? -1.6 : 0; fx += dx / d * pull - dz / d * 0.8; fz += dz / d * pull + dx / d * 0.8; }
    const G = r.gates.pair;
    if (G && !G.done) {
      if (S.gp !== G) { S.gp = G; const u = R(); S.gateMode = u < 0.55 ? 'good' : u < 0.85 ? 'any' : 'skip'; S.gateI = R() < 0.5 ? 0 : 1; }
      const g = S.gateMode === 'good' ? G.gates.find((q) => q.op.type === 'mul' || q.op.type === 'add') : S.gateMode === 'any' ? G.gates[S.gateI] : null;
      if (g) { const dx = g.x - P.x, dz = g.z - P.z, l = Math.hypot(dx, dz) || 1; fx += dx / l * 1.5; fz += dz / l * 1.5; }
    }
    const ev = r.events.cur;
    if (ev && ev.state === 'live') {
      if (S.ev !== ev) { S.ev = ev; S.chase = R() < 0.7; }
      if (S.chase) {
        const tx = ev.e ? ev.e.x : ev.x, tz = ev.e ? ev.e.z : ev.z, dx = tx - P.x, dz = tz - P.z, l = Math.hypot(dx, dz) || 1;
        if (ev.kind === 'shrine' && l < 1.2) { fx *= 0.2; fz *= 0.2; } else { fx += dx / l * 2.5; fz += dz / l * 2.5; }
      }
    }
    fx += Math.cos(r.time * 0.35 + S.cfg.seed) * 0.25; fz += Math.sin(r.time * 0.35 + S.cfg.seed) * 0.25;
    const l = Math.hypot(fx, fz);
    r.input.tx = l > 0.05 ? fx / l : 0; r.input.tz = l > 0.05 ? fz / l : 0; r.input.moved = true;
  }

  function act(r) {
    const R = S.rnd, ui = r.ui;
    if (r.nova >= 1 && !r.novaQueue.length) {
      if (S.novaAt < 0) { S.novaAt = r.time + R() * 6; S.novaMin = Math.floor(R() * 60); }
      if (r.time >= S.novaAt && (r.legion.count >= S.novaMin || r.time - S.novaAt > 20)) {
        S.novaAt = -1;
        const u = R();
        if (u < 0.4) ui.wantsNova = true; else if (u < 0.7) r.input.keys.add('Space'); else pointer(document.querySelector('.hud .nova'));
      }
    }
    if (r.rites.ready) {
      if (S.riteAt < 0) S.riteAt = r.time + R() * 8;
      if (r.time >= S.riteAt) {
        S.riteAt = -1;
        const u = R();
        if (u < 0.4) ui.wantsRite = true; else if (u < 0.7) r.input.keys.add(R() < 0.5 ? 'KeyE' : 'ShiftLeft'); else pointer(document.querySelector('.hud .rite'));
      }
    }
  }

  /** Blocking UI: the bot answers every modal after a short, random think. */
  function answer(r) {
    const R = S.rnd, P = r.player;
    if (r.ended) return; // the results screen is the harness's to answer (after the post-end checks)
    const ad = document.querySelector('.ad-sim');
    if (ad) {
      const claim = ad.querySelector('.btn-ad');
      if (S.cfg.ads && R() < 0.8) { if (!claim.disabled) claim.click(); else S.yield = 1100; } // the stand-in ad counts down in real time
      else ad.querySelector('.ad-sim-x').click();
      if (!ad.isConnected) { S.wait = 1; S.yield = 50; } // the ad's promise settles after a microtask
      return;
    }
    if (r.paused) {
      const m = P.dead ? findModal('You have fallen') : findModal('Paused');
      if (!m) { if (++S.noModal === 45) V('stuck', `paused (${P.dead ? 'dead' : 'alive'}) with no ${P.dead ? 'revive' : 'pause'} screen`); return; }
      S.noModal = 0;
      if (S.lastBack !== m) { S.lastBack = m; S.wait = 3 + Math.floor(R() * (P.dead ? 60 : 45)); }
      if (--S.wait > 0) return;
      const btns = [...m.querySelectorAll('.modal-actions .btn')];
      if (P.dead) {
        if (btns.length === 3 && R() < 0.85) { if (R() < 0.15) { btns[0].click(); S.stat.ads++; S.wait = 1e9; S.yield = 50; return; } btns[1].click(); S.stat.revives++; S.lastAnswer = 'revived'; }
        else { S.lastAnswer = 'gave up on the revive screen'; btns[btns.length - 1].click(); }
      } else if (S.wantAbandon || (!S.cfg.god && R() < 0.01 * S.cfg.chaos)) { S.lastAnswer = 'abandoned from the pause screen'; btns[2].click(); S.stat.abandons++; }
      else { if (R() < 0.1) btns[1].click(); btns[0].click(); } // the sound toggle stays open, then Resume
      S.lastBack = null;
      return;
    }
    if (r.levelPending) {
      const backs = document.querySelectorAll('.lvl-back'), back = backs[backs.length - 1];
      if (!back) { if (++S.noModal === 45) V('stuck', 'levelPending with no card screen'); return; }
      S.noModal = 0;
      if (S.lastBack !== back) { S.lastBack = back; S.wait = Math.floor(R() * 25); }
      if (--S.wait > 0) return;
      const rr = back.querySelector('.lvl-actions .btn-ad');
      if (rr && R() < 0.03 * S.cfg.chaos) { rr.click(); S.stat.ads++; S.wait = 1e9; S.yield = 50; return; } // the ad shows after a microtask
      const cards = back.querySelectorAll('.card');
      if (cards.length) { cards[Math.floor(R() * cards.length)].click(); if (!back.isConnected) { S.stat.cards++; S.lastBack = null; } }
      return;
    }
    if (!r.ended && (r.levelQueue > 0 || r.chestQueue > 0)) r.showLevelUp(); // stands in for the 120 ms follow-up timer
  }

  /** Chaos inputs at random moments. */
  function chaos(r) {
    const R = S.rnd, c = S.cfg.chaos, P = r.player, god = S.cfg.god;
    if (!c) return;
    const free = !r.paused && !r.levelPending && !r.ended;
    if (free && !P.dead && R() < 0.0012 * c) { document.querySelector('.hud-pause').click(); S.stat.pauses++; }
    if (!S.hiddenT && R() < 0.0005 * c) { setHidden(true); S.hiddenT = 1 + Math.floor(R() * 20); S.stat.hides++; }
    if (r.novaQueue.length && r.novaT < 0.25 && R() < 0.3 * c) { if (R() < 0.5) r.ui.wantsNova = true; else r.input.keys.add('Space'); } // double-tap mid wind-up
    if ((r.paused || r.levelPending || P.dead) && R() < 0.02 * c) { r.ui.wantsRite = true; r.ui.wantsNova = true; } // must be ignored
    if (free && !P.dead && !r.levelQueue && !r.events.cur && !r.bossSpawned && r.time > 30 && R() < 0.00025 * c) {
      // the shrine answers while a level-up waits in the queue
      r.levelQueue++;
      if (r.events.start('shrine', { x: P.x, z: P.z })) { r.events.cur.hold = 99; r.events.offer(r.events.cur); S.stat.shrines++; }
    }
    if (!god && P.dead && r.deathT >= 0 && r.deathT < 1 && R() < 0.02 * c) { r.revive(false); S.stat.revives++; S.stat.forced++; } // QA hook, before the revive screen
    if (!god && free && !P.dead && !S.forcedDeath && (R() < 0.00015 * c || (r.novaQueue.length && R() < 0.01 * c))) {
      S.forcedDeath = true; P.invuln = 0; P.hurt(P.hp + 1e6); S.stat.forced++; // a death at an awkward moment
    }
    if (!god && free && !P.dead && r.bossDead && !S.beatDeath && R() < 0.05 * c) { S.beatDeath = true; P.invuln = 0; P.hurt(P.hp + 1e6); S.stat.forced++; } // in the victory beat
    if (!r.ended && ((r.novaQueue.length && R() < 0.0008 * c) || (r.bossSpawned && !r.bossDead && R() < 0.00006 * c))) return exitMid(r, r.novaQueue.length ? 'mid-Nova' : 'mid-boss');
    if (R() < 0.0008 * c) { // settings mid-run
      const s = app.profile.settings, k = ['lefty', 'reduceFlash', 'shake', 'fps30', 'autoNova', 'quality'][Math.floor(R() * 6)];
      if (k === 'shake') s.shake = [0, 0.5, 1][Math.floor(R() * 3)]; else if (k === 'quality') s.quality = ['auto', 'low', 'medium', 'high'][Math.floor(R() * 4)]; else s[k] = !s[k];
      app.applySettings(); S.stat.settings++;
      if (app.runUI.el.classList.contains('lefty') !== !!s.lefty) V('ui', 'lefty setting not applied to the HUD');
    }
  }

  /** exitRun mid-Nova or mid-boss, then immediately start another run (same configuration, a fresh seed). */
  function exitMid(r, why) {
    S.olds.push({ r, t: r.t, time: r.time, lp: r.levelPending, ends: r.__soak.ends, why, tag: runTag, at: realNow() });
    if (S.olds.length > 4) S.olds.shift();
    S.gameAcc += r.time;
    app.exitRun();
    S.stat.exits++;
    if (document.querySelector('.hud') || document.querySelector('.lvl-back')) V('exit', 'HUD or card screen left in the DOM after exitRun');
    S.seg++;
    if (!begin({ ...S.cfg, seed: Math.floor(S.rnd() * 2 ** 32) })) V('harness', 'could not restart after a chaos exit');
    return true;
  }

  function frame() {
    const r = S.run, P = r.player, cfg = S.cfg;
    S.frame++;
    if (S.hiddenT && --S.hiddenT === 0) setHidden(false);
    answer(r);
    if (!r.ended) {
      if (!r.paused && !r.levelPending && !P.dead) { steer(r); act(r); }
      if (chaos(r)) return;
    }
    if (cfg.kind === 'endless' && !S.wantAbandon && r.bossKills >= 2 && r.time > 750 && !r.bossSpawned) { S.wantAbandon = true; } // deep enough: abandon from the pause screen
    if (S.wantAbandon && !r.paused && !r.levelPending && !P.dead && !r.ended) document.querySelector('.hud-pause').click();
    // advance (render now and then, and in bursts around big moments)
    const t0 = r.time, block = r.paused || r.levelPending || (r.ended && !r.bossDead), dead0 = P.dead;
    const render = cfg.render > 0 && (S.frame % cfg.render === 0 || S.burst > 0);
    if (S.burst > 0) S.burst--;
    S.clock += DT * 1000;
    if (render) { const a = realNow(); app.engine.step(DT); S.stat.renders++; S.stat.renderMs += realNow() - a; }
    else {
      r.update(DT);
      if (cfg.render > 0 && S.frame % 5 === 0) { const E = app.engine; E.ctx2d.clearRect(0, 0, E.w, E.h); r.draw2d(E.ctx2d, E.w, E.h); } // the overlay is cheap: draw it often
    }
    if (app.run !== r) { V('harness', 'the run changed under the bot'); return; }
    // cheap invariants, every frame
    if (!(r.time >= t0)) V('nan', `run.time went from ${t0} to ${r.time}`);
    else if (!block && r.time === t0) V('stuck', `run time did not advance while unblocked (timeScale ${r.fx.timeScale()})`);
    if (block) { if (!document.querySelector('.ad-sim') && ++S.blocked === 900) V('stuck', `blocked 30 s despite the bot (${blockedWhy(r)}, modals: ${[...document.querySelectorAll('.lvl-back, .modal h2')].map((n) => n.className || n.textContent).join('/')})`); }
    else S.blocked = 0;
    const ts = r.fx.timeScale();
    if (!(ts > 0) || ts > 1) V('nan', `timeScale ${ts}`);
    S.slowT = ts < 1 && !block ? S.slowT + DT : 0;
    if (S.slowT > 6 && S.slowT < 6 + DT * 1.5) V('stuck', `time scale stuck below 1 for 6 s (${ts.toFixed(3)}, slowT ${r.fx.slowT.toFixed(2)}, hitStopT ${r.fx.hitStopT.toFixed(2)})`);
    for (const v of [P.x, P.z, P.vx, P.vz, P.hp, r.nova, r.xp]) if (!fin(v)) { V('nan', `player/run core value not finite (x ${P.x}, z ${P.z}, hp ${P.hp}, nova ${r.nova}, xp ${r.xp})`); break; }
    if (r.nova < 0 || r.nova > 1) V('nan', `nova charge ${r.nova}`);
    if (r.novaQueue.length && r.nova > 0) V('rule', `Nova charged mid-detonation (${r.nova.toFixed(3)})`);
    if (!r.endless && !r.ended && r.time > 361 && !r.bossSpawned) V('rule', 'Gravemaw did not rise at 6:00');
    S.beatT = r.bossDead && !r.ended && !r.paused ? S.beatT + DT : 0;
    if (S.beatT > 5 && S.beatT < 5 + DT * 1.5) V('stuck', `the victory beat has run 5 s without ending the run (beat ${r.victory ? r.victory.t.toFixed(2) : '-'})`);
    const n = r.legion.count;
    if (n < 0 || n > 400) V('legion', `legion count ${n}`);
    if (r.__soak.ends > 1) V('end', 'onEnd more than once');
    if (r.ended && P.dead && r.paused && findModal('You have fallen') && !S.endedDead) V('end', 'the revive screen opened after the run ended');
    // the HUD: NOVA reads ready exactly when a tap would fire it; the boss bar is up exactly while Gravemaw is
    const ui = r.ui, ready = ui.q.nova.classList.contains('ready');
    if (ready !== (r.nova >= 1)) { if (++S.novaUi === 10) V('ui', `NOVA button ${ready ? 'reads ready' : 'reads not ready'} for 10 frames at charge ${r.nova.toFixed(4)}`); } else S.novaUi = 0; // the HUD ticks at 20 Hz
    const bar = !ui.q.boss.hidden, boss = !!(r.bossEnemy && r.bossEnemy.active);
    if (bar !== boss && !r.bossDead) { if (++S.barUi === 45) V('ui', `boss bar ${bar ? 'shown without' : 'hidden with'} a live Gravemaw`); } else S.barUi = 0;
    // modal consistency: a card screen without levelPending lets the run play on under it
    const orphan = !r.levelPending && !r.ended && document.querySelector('.lvl-back');
    if (orphan) { if (++S.orphan === 30) V('ui', 'a card screen is open while the run plays on (levelPending false)'); } else S.orphan = 0;
    if (!dead0 && P.dead) S.stat.deaths++;
    if (r.bossSpawned && !S.boss) S.burst = Math.max(S.burst, 2);
    S.boss = r.bossSpawned;
    if (r.boss.phase !== S.phase) { S.phase = r.boss.phase; S.burst = Math.max(S.burst, 1); }
    if (r.bossSpawned && !r.bossDead) { S.bossT += DT; if (cfg.god && S.bossT > 480 && S.bossT < 480 + DT * 1.5) V('boss', `Gravemaw still alive after 8 min in god mode (hp ${(r.bossEnemy ? r.bossEnemy.hp / r.bossEnemy.maxHp : 0).toFixed(3)}, phase ${r.boss.phase}, state ${r.boss.state})`); }
    else S.bossT = 0;
    if (!r.endless && r.time > 360 + 900 && !r.ended && !S.wantAbandon) { V('stuck', 'campaign run past 21:00'); S.wantAbandon = true; }
    if (r.endless && r.time > 1200 && !S.wantAbandon) S.wantAbandon = true;
    if (S.frame % 30 === 0) { deep(r); if (S.olds.length) checkOlds(); }
    if (r.ended && S.endFrame < 0) { S.endFrame = S.frame; S.endedDead = P.dead && r.paused; } // a defeat ends on the revive screen itself
  }

  function step(nFrames) {
    if (!S || !S.run) return { done: true, violations: [] };
    const nowD = performance.now;
    performance.now = () => S.clock; // the camera shake reads the clock, and it nudges spawn points: replay it exactly
    S.yield = 0;
    if (S.olds.length) checkOlds();
    const f0 = S.frame;
    try {
      for (let i = 0; i < nFrames; i++) {
        frame();
        if (S.yield) break;
        if (S.endFrame >= 0 && S.frame - S.endFrame >= 60) break;
        if (S.blocked >= 900 || (S.cfg.stop && S.frame >= S.cfg.stop)) break;
      }
    } catch (e) {
      V('error', 'harness/game threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
      S.crashed = true;
    } finally { performance.now = nowD; }
    const r = S.run;
    const done = S.crashed || (S.endFrame >= 0 && S.frame - S.endFrame >= 60) || S.blocked >= 900 || (S.cfg.stop && S.frame >= S.cfg.stop);
    return { done, frames: S.frame - f0, yield: S.yield, ended: r.ended, crashed: !!S.crashed, stuck: S.blocked >= 900, violations: S.viol.splice(0), state: summary(r) };
  }

  function summary(r) {
    const b = r.bossEnemy;
    return { t: +r.time.toFixed(1), game: +(S.gameAcc + r.time).toFixed(1), seg: S.seg, frame: S.frame, kills: r.counters.kills, level: r.level, legion: r.legion.count, peak: r.legion.peak, enemies: r.enemies.count,
      hp: Math.round(r.player.hp), dead: r.player.dead, boss: r.bossSpawned, bossHp: b ? +(b.hp / b.maxHp).toFixed(3) : null, phase: r.boss.phase, bossKills: r.bossKills,
      bossDead: r.bossDead, ended: r.ended, paused: r.paused, levelPending: r.levelPending, novas: r.counters.novas, rites: r.counters.rites, gates: r.counters.gates,
      events: r.counters.events, ends: r.__soak.ends, victory: r.__soak.result ? r.__soak.result.victory : null, diff: r.diff.id, ch: r.chapter.id, mut: r.mut.ids, trial: r.trial, bloodMoon: r.bloodMoon };
  }

  /** After the run ended: Continue on the results screen, then the immediate cleanup checks. */
  function exit() {
    const r = S.run, v0 = S.viol.length;
    const res = document.querySelector('.modal-results');
    const btn = res && [...res.querySelectorAll('.btn-primary')].pop();
    if (!btn) V('end', 'no Continue button on the results screen');
    else btn.click();
    if (app.run) { V('end', 'Continue did not exit the run'); app.exitRun(); }
    for (const sel of ['.hud', '.lvl-back', '.modal-results', '.ad-sim']) if (document.querySelector(sel)) V('exit', `${sel} left in the DOM after exitRun`);
    if (findModal('Paused') || findModal('You have fallen')) V('exit', 'a run modal left after exitRun');
    if (app.meta.el.hidden) V('exit', 'the menu is not shown after exitRun');
    S.olds.push({ r, t: r.t, time: r.time, lp: r.levelPending, ends: r.__soak.ends, why: 'after Continue', tag: runTag, at: realNow() });
    app.engine.manual = false; // the menu runs in real time while we wait
    return { violations: S.viol.splice(v0) };
  }
  function afterExit() {
    for (const o of S.olds) o.at = -1e9; // the wait is over: check intervals now
    checkOlds();
    if (document.querySelector('.hud') || document.querySelector('.modal-results')) V('exit', 'run UI reappeared after exitRun');
    return { violations: S.viol.splice(0), stat: S.stat, ui: document.getElementById('ui').childElementCount };
  }
  /** A run that did not end cleanly (stuck, crashed, harness timeout): tear it down so the page can go on. */
  function abort() {
    if (app.run) app.exitRun();
    document.querySelectorAll('.modal-back, .lvl-back, .ad-sim').forEach((n) => n.remove());
    app.engine.manual = false;
    return S ? { stat: S.stat } : {};
  }

  // ---------------------------------------------------------------- leak test: start and exit many runs in one page
  function leakCycle(cfg) {
    start(cfg);
    if (!S.run) return { violations: [{ kind: 'harness', msg: 'startRun refused ' + JSON.stringify(cfg) }] };
    const r = S.run, P = r.player, E = app.engine;
    r.player.hurt = () => {};
    if (cfg.idx % 3 === 1) r.time = 352; // Gravemaw's meshes, arena and music
    for (let i = 0; i < 240; i++) {
      S.frame++;
      answer(r);
      if (!r.paused && !r.levelPending) { steer(r); act(r); }
      if (i === 30) { r.legion.addMany(80, P.x, P.z); r.gates.spawnPair(); }
      if (i === 60) { r.nova = 1; r.ui.wantsNova = true; r.rites.cd = 0; r.ui.wantsRite = true; }
      if (i === 90 && !r.bossSpawned) r.events.start(['thief', 'shrine', 'coffin'][cfg.idx % 3]);
      if (i === 120) { r.addXp(r.xpNeed * 2); }
      if (i % cfg.render === 0) E.step(DT); else r.update(DT);
    }
    const v = S.viol.splice(0);
    if (cfg.idx % 2) { r.pause(true); } // exit from a paused run half the time
    app.exitRun();
    E.manual = false;
    S.run = null; S.olds.length = 0; // the harness lets go of it too
    return { violations: v, boss: r.bossSpawned };
  }
  function leakSample() {
    if (window.gc) { window.gc(); window.gc(); }
    const R = app.engine.renderer;
    return { geometries: R.info.memory.geometries, textures: R.info.memory.textures, programs: R.info.programs ? R.info.programs.length : -1,
      dom: document.getElementsByTagName('*').length, ui: document.getElementById('ui').childElementCount, heap: performance.memory ? performance.memory.usedJSHeapSize : -1,
      intervals: intervals.size, runsAlive: runRefs.filter((w) => w.deref()).length };
  }

  // ---------------------------------------------------------------- performance smoke
  function perf(hero, ch = 3) {
    start({ idx: 9000, seed: 7, kind: 'campaign', hero, ch, diff: 'normal', god: true, prog: 5, chaos: 0, render: 1 });
    const r = S.run, P = r.player, E = app.engine, gl = E.renderer.getContext(), q = E.qName, px = new Uint8Array(4);
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // WebGL is async (finish() may not block): a pixel read waits for the frame
    r.spawnAcc = -1e9; r.nextGate = r.nextSwarm = 1e9; r.eliteIdx = 99; r.time = 200; r.events.nextAt = 1e9;
    r.stats.cap = 400;
    const actFoe = [null, null, 'siren', 'thornback', 'rat', 'caller', 'stalker'][Math.ceil(ch / 5)]; // a later act's own foe joins the horde
    const types = ['husk', 'husk', 'ghoul', 'brute', 'witch', 'bloater'].concat(actFoe ? [actFoe, actFoe] : []);
    const horde = () => { for (let i = 0; r.enemies.count < 280 && i < 600; i++) { const a = i * 2.39996, d = 4 + (i % 40) * 0.35; r.spawnEnemy(types[i % types.length], { at: { x: P.x + Math.cos(a) * d, z: P.z + Math.sin(a) * d } }); } };
    horde(); r.legion.addMany(300, P.x, P.z);
    let simT = 0; const u0 = r.update.bind(r);
    r.update = (dt) => { const a = realNow(); u0(dt); simT = realNow() - a; }; // the simulation alone, inside engine.step
    for (let i = 0; i < 8; i++) E.step(DT);
    sync();
    const frame = [], sim = [];
    let at = null, progs = 0;
    for (let i = 0; i < 90; i++) {
      if (i === 30) { // a Rite, a Nova and a Cursed Coffin at once, on the full horde and legion
        horde(); at = { enemies: r.enemies.count, legion: r.legion.count }; progs = E.renderer.info.programs.length;
        r.events.start('coffin', { x: P.x + 3, z: P.z }); r.rites.cd = 0; r.ui.wantsRite = true; r.nova = 1; r.ui.wantsNova = true;
      }
      if (i === 34 && r.events.cur && r.events.cur.e) r.enemies.damage(r.events.cur.e, 1e6, { source: 'bolt' }); // the coffin bursts mid-Nova
      if (r.levelPending) { const c = document.querySelector('.lvl-back .card'); r.t += 0.31; if (c) c.click(); }
      const a = realNow(); E.step(DT); sync(); frame.push(realNow() - a); sim.push(simT);
    }
    const stat = (v) => { const s = v.slice().sort((x, y) => x - y), med = s[s.length >> 1];
      return { median: +med.toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), max: +s[s.length - 1].toFixed(1), spikes: v.map((t, i) => [i, +t.toFixed(1)]).filter(([, t]) => t > med * 10) }; };
    const out = { hero, quality: q, at, compiled: E.renderer.info.programs.length - progs, frame: stat(frame), sim: stat(sim), violations: S.viol.splice(0) };
    app.exitRun(); E.manual = false;
    return out;
  }

  window.__soak = { start, step, exit, afterExit, abort, leakCycle, leakSample, perf, state: () => S && S.run && summary(S.run) };
}

// ---------------------------------------------------------------- node side
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc', '--enable-precise-memory-info'] });
async function newPage(tries = 3) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
  try {
    const page = await ctx.newPage();
    page.errs = [];
    page.on('pageerror', (e) => page.errs.push('pageerror: ' + (e.stack || e.message).split('\n').slice(0, 4).join(' | ')));
    page.on('console', (m) => { if (m.type() === 'error' && !/ERR_|net::|Failed to load resource/.test(m.text())) page.errs.push('console.error: ' + m.text()); });
    page.on('crash', () => page.errs.push('the page crashed'));
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.__soulswarm && window.__soulswarm.engine && window.__soulswarm.meta, null, { timeout: 90000, polling: 250 });
    await page.waitForTimeout(1500);
    await page.evaluate(installSoak);
    return page;
  } catch (e) { // a loaded machine can stall a boot: try a fresh context
    await ctx.close().catch(() => {});
    if (tries <= 1) throw e;
    console.log(`  (page boot failed: ${e.message.split('\n')[0]}; retrying)`);
    return newPage(tries - 1);
  }
}
const label = (c) => `#${c.idx} ${c.kind}${c.kind === 'campaign' || c.kind === 'bloodmoon' ? ` ch${c.ch} ${c.diff}` : ''} ${c.hero} ${c.god ? 'god' : 'mortal'}${c.tut ? ' tutorial' : ''}`;

async function playRun(page, cfg) {
  const t0 = Date.now(), viol = [], tag = label(cfg);
  page.errs.length = 0;
  const add = (vs) => { for (const v of vs) viol.push(v); };
  const st0 = await page.evaluate((c) => window.__soak.start(c), cfg);
  add(st0.violations);
  if (!st0.ok) return { cfg, tag, viol: [{ kind: 'harness', msg: 'startRun refused' }], errors: page.errs.slice(), fatal: true };
  let st = null;
  for (;;) {
    st = await page.evaluate((n) => window.__soak.step(n), CHUNK);
    add(st.violations);
    if (env.VERBOSE) console.log(`  ${tag} ${JSON.stringify(st.state)}`);
    if (st.done) break;
    if (st.yield) await page.waitForTimeout(st.yield);
    if (Date.now() - t0 > 30 * 60e3) { viol.push({ kind: 'harness', msg: 'run exceeded 30 min of real time', frame: st.state.frame }); break; }
  }
  if (cfg.stop) { console.log(JSON.stringify(st.state, null, 1)); return { cfg, tag, viol, errors: page.errs.slice(), state: st.state, stat: {} }; }
  let stat = {}, head = null;
  if (st.ended && !st.crashed) {
    // interval polling: rAF polling stalls when the shared software-GL GPU process is saturated by the other pages
    head = await page.waitForFunction(() => { const b = document.querySelector('.modal-results .res-head b'); return b && b.textContent; }, null, { timeout: 30000, polling: 250 }).then((x) => x.jsonValue()).catch(() => null);
    const s = st.state, want = s.victory == null ? null : cfg.kind === 'endless' ? /^ABYSS DEPTH \d+$/ : s.victory ? /^VICTORY$/ : /^DEFEAT$/;
    if (s.ends !== 1) viol.push({ kind: 'end', msg: `onEnd called ${s.ends} times`, frame: s.frame });
    if (!head || (want && !want.test(head))) {
      const why = await page.evaluate(() => ({ modals: [...document.querySelectorAll('.modal-back')].map((m) => m.className + ':' + ((m.querySelector('h2') || {}).textContent || '')), hud: !!document.querySelector('.hud'), run: !!window.__soulswarm.run }));
      viol.push({ kind: 'end', msg: `results screen shows "${head}" for victory=${s.victory} (${JSON.stringify(why)})`, frame: s.frame });
    }
    if (cfg.god && cfg.kind !== 'endless' && s.victory === false) viol.push({ kind: 'end', msg: 'a god-mode campaign run ended in defeat', frame: s.frame });
    add((await page.evaluate(() => window.__soak.exit())).violations);
    await page.waitForTimeout(1600);
    const a = await page.evaluate(() => window.__soak.afterExit());
    add(a.violations); stat = a.stat;
  } else stat = (await page.evaluate(() => window.__soak.abort())).stat || {};
  for (const e of page.errs) viol.push({ kind: 'error', msg: e });
  return { cfg, tag, viol, state: st.state, head, stat, real: Math.round((Date.now() - t0) / 1000), fatal: st.crashed || st.stuck };
}

async function soak() {
  const all = matrix(), queue = RUN_A >= 0 ? all.slice(RUN_A, RUN_B + 1) : all.slice(), results = [], total = queue.length;
  let done = 0;
  const worker = async () => {
    let page = null, used = 0;
    while (queue.length) {
      const cfg = queue.shift();
      let res;
      try {
        if (!page || used >= PER_PAGE) { if (page) await page.context().close().catch(() => {}); page = null; page = await newPage(); used = 0; }
        used++;
        res = await playRun(page, cfg);
      } catch (e) { res = { cfg, tag: label(cfg), viol: [{ kind: 'harness', msg: 'harness: ' + e.message.split('\n')[0] }], fatal: true, stat: {} }; }
      results.push(res); done++;
      const s = res.state || {};
      console.log(`[${done}/${total}] ${res.tag}: ${s.victory ? 'VICTORY' : s.ended ? 'DEFEAT' : 'NOT ENDED'} t=${s.t}s game=${s.game}s lv${s.level} kills=${s.kills} peak=${s.peak} novas=${s.novas} rites=${s.rites} bossKills=${s.bossKills}`
        + `${s.mut && s.mut.length ? ' [' + s.mut.join('+') + ']' : ''} segs=${(s.seg || 0) + 1} renders=${res.stat.renders || 0} real=${res.real}s  ${res.viol.length ? res.viol.length + ' VIOLATION(S)' : 'ok'}`);
      for (const v of res.viol) console.log(`    ! [${v.kind}] ${v.msg}  (run ${res.cfg.idx}, seg ${v.seg ?? '-'}, frame ${v.frame ?? '-'}, t=${v.t ?? '-'}${v.n > 1 ? `, x${v.n}` : ''})`);
      if (res.fatal && page) { await page.context().close().catch(() => {}); page = null; }
    }
    if (page) await page.context().close();
  };
  await Promise.all(Array.from({ length: Math.min(PAR, queue.length) }, worker));
  results.sort((a, b) => a.cfg.idx - b.cfg.idx);
  const bad = results.filter((r) => r.viol.length), mins = results.reduce((a, r) => a + ((r.state && r.state.game) || 0), 0) / 60;
  const by = (f) => { const m = {}; for (const r of results) { const k = f(r); m[k] = (m[k] || 0) + 1; } return m; };
  console.log(`\nsoak seed ${SEED}: ${results.length} runs, ${mins.toFixed(0)} min of game time, ${bad.length} with violations`);
  console.log('kinds', JSON.stringify(by((r) => r.cfg.kind)), 'heroes', JSON.stringify(by((r) => r.cfg.hero)), 'diffs', JSON.stringify(by((r) => r.cfg.diff)), 'god', JSON.stringify(by((r) => r.cfg.god)));
  console.log('outcomes', JSON.stringify(by((r) => (r.state ? (r.state.victory ? 'victory' : r.state.ended ? 'defeat' : 'not-ended') : 'error'))));
  const tot = {};
  for (const r of results) for (const [k, v] of Object.entries(r.stat || {})) tot[k] = (tot[k] || 0) + v;
  console.log('totals', JSON.stringify(tot));
  if (env.OUT) writeFileSync(env.OUT, JSON.stringify(results, null, 1));
  return bad.length;
}

async function leak(n) {
  const page = await newPage(), rows = [], heroes = ['vael', 'nyx', 'seraphine', 'liora', 'mordrake'];
  let viol = [];
  rows.push({ i: -1, ...(await page.evaluate(() => window.__soak.leakSample())) });
  for (let i = 0; i < n; i++) {
    const kind = i % 7 === 6 ? 'endless' : 'campaign', cfg = { idx: i, seed: 1000 + i, kind, hero: heroes[i % 5], ch: 1 + (i % 5), diff: kind === 'endless' ? 'normal' : ['normal', 'nightmare', 'torment'][i % 3], god: true, prog: 5, chaos: 0, render: 6 };
    const c = await page.evaluate((x) => window.__soak.leakCycle(x), cfg);
    viol = viol.concat(c.violations);
    await page.waitForTimeout(400); // the menu renders a few frames; run timers fire
    rows.push({ i, hero: cfg.hero, ch: cfg.ch, ...(await page.evaluate(() => window.__soak.leakSample())) });
    const r = rows[rows.length - 1];
    console.log(`leak ${i}: geo ${r.geometries} tex ${r.textures} progs ${r.programs} dom ${r.dom} ui ${r.ui} heap ${(r.heap / 1e6).toFixed(1)} MB intervals ${r.intervals} runs alive ${r.runsAlive}`);
  }
  for (const e of page.errs) viol.push({ kind: 'error', msg: e });
  await page.context().close();
  const first = rows[1], last = rows[rows.length - 1], warm = rows.slice(1, 11), keys = ['geometries', 'textures', 'programs', 'dom', 'ui', 'intervals', 'runsAlive'];
  const grew = keys.filter((k) => last[k] > Math.max(...warm.map((r) => r[k])) + (k === 'dom' ? 20 : 0));
  const heapGrowth = last.heap - Math.max(...warm.map((r) => r.heap));
  console.log(`\nleak test: ${n} runs started and exited in one page`);
  console.log(`first run: ${JSON.stringify(first)}\nlast run:  ${JSON.stringify(last)}`);
  console.log(`grew past the warm-up peak: ${grew.length ? grew.join(', ') : 'nothing'}; heap vs warm-up peak ${(heapGrowth / 1e6).toFixed(1)} MB`);
  for (const v of viol) console.log(`  ! [${v.kind}] ${v.msg}`);
  if (env.OUT) writeFileSync(env.OUT, JSON.stringify(rows, null, 1));
  return grew.length + viol.length + (heapGrowth > 25e6 ? 1 : 0);
}

async function perfSmoke() {
  const page = await newPage(), out = [];
  for (const hero of list('HERO', ['vael', 'nyx', 'seraphine', 'liora', 'mordrake'])) {
    const r = await page.evaluate(([h, ch]) => window.__soak.perf(h, ch), [hero, +env.CH || 3]); // CH=29: a late realm (its hazards and foe)
    out.push(r);
    const f = (x) => `median ${x.median} ms, p95 ${x.p95} ms, max ${x.max} ms, >10x median: ${x.spikes.length ? JSON.stringify(x.spikes) : 'none'}`;
    console.log(`perf ${hero} (${r.quality}; at the combo ${r.at.enemies} enemies, ${r.at.legion} minions; ${r.compiled} shaders compiled after it)\n  frame (step + sync): ${f(r.frame)}\n  simulation (update):  ${f(r.sim)}`);
    for (const v of r.violations) console.log(`  ! [${v.kind}] ${v.msg}`);
  }
  for (const e of page.errs) console.log('  ! [error] ' + e);
  await page.context().close();
  return out.reduce((a, r) => a + r.frame.spikes.length + r.sim.spikes.length + r.violations.length, 0) + page.errs.length;
}

let failures;
try {
  failures = env.LEAK ? await leak(+env.LEAK) : env.PERF ? await perfSmoke() : await soak();
} finally { await browser.close(); }
process.exit(failures ? 1 : 0);
