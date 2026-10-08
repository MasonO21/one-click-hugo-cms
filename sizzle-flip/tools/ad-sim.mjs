// How many ads players see, and what they earn: a simulation of players who finish a world (world 1 by default).
//
//  1. Physics: every shot of every level's verified route is fired with aim errors of several sizes through the real
//     game physics, from the exact spot the route reaches. That measures, per shot, how often an imperfect flip still
//     works, lands somewhere else, falls off or wins outright, and how long the flight takes.
//  2. Players: each simulated player has a personal aim error, takes time to aim, explores before finding a shot,
//     may use hints, the long aim booster and the skip offer, and plays in sessions. Forced ads are decided by the
//     game's own pacing rules (interstitialDecision and AD_RULES in src/ads.js), exactly as the app does.
//  3. Revenue: ad impressions × eCPM, for three audience scenarios.
// Everything a person decides (how long they aim, how often they take a hint…) is an assumption: see ASSUME below.
// node tools/ad-sim.mjs [--players 100,500,1000,5000] [--world 1] [--samples 40] [--detail] [--json out.json]
//                       [--set aimErrorDeg=2.4,0.45 --set skipTake=0.2 …]   (change any assumption below)
import fs from 'node:fs';
globalThis.window = globalThis; // src/ads.js reads the page context; in Node it is a store build (no web test ads)
globalThis.location = { search: '', hash: '', hostname: 'app' };
const { AD_RULES, DEFAULT_AD_STATE, interstitialDecision } = await import('../src/ads.js');
const { PHYS, Sim } = await import('../src/physics.js');
const { LEVELS } = await import('../src/levels/data.js');
const { makeSim } = await import('./solver.mjs');

const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const COHORTS = opt('--players', '100,500,1000,5000').split(',').map(Number);
const WORLD = +opt('--world', 1) - 1;
const SAMPLES = +opt('--samples', 40);

// ---------------------------------------------------------------- assumptions (people, ad networks, prices)
const ASSUME = {
  aimErrorDeg: [1.6, 0.45],     // a player's aim error with the aim guide: lognormal (median °, spread; 10–90% of players
                                //   0.9–2.9°) — power error scales with it
  powerPerDeg: 0.02,            // 1° of aim error comes with ±2% power error
  exploreFirst: 2.5,            // the first try at a new shot is 2.5× as far off (finding the shot), shrinking ×0.7 per try
  aimSeconds: [2.0, 0.4],       // time to line up a flip: lognormal (median s, spread)
  lookSeconds: 3,               // looking at a new level before the first flip
  winCardSeconds: 4,            // reading the level-complete card before tapping Next
  failSeconds: 1.3,             // fail beat + respawn (src/game.js)
  introSeconds: 1.6,            // level intro pan (1.2–2.0 s)
  winAnimSeconds: 1.6,          // win animation before the card (counts as play time, like the app)
  sessionMinutes: [12, 0.5],    // a play session (lognormal); between sessions some hours pass
  hintTakeFree: 0.45,           // when 💡 appears: chance to tap it while it's free (first hint per world)…
  hintTakePaid: 0.2,            // …and when it costs a reward ad
  longAimTake: 0.08,            // chance to watch an ad for the long aim guide when its tip appears (after 5 falls)
  longAimHelp: 0.85,            // aim error with the long aim guide on
  hintHelp: 0.5,                // aim error while following the hint's dotted route
  skipTake: 0.1,                // once ⏭ is offered: chance after each flip that went nowhere (fell, landed off the route
                                //   or back) that they watch the ad to skip — not while they are making progress
  fillInterstitial: 0.92,       // share of ad requests that get an ad (no ad = no impression; forced ad retried next win)
  fillRewarded: 0.92,           // (no reward ad = the reward is granted anyway, without an impression)
  interstitialSeconds: 20,
  rewardedSeconds: 30,
};
for (let i = 0; i < argv.length; i++) if (argv[i] === '--set') {
  const [k, v] = argv[i + 1].split('=');
  if (!(k in ASSUME)) throw new Error(`unknown assumption ${k}`);
  ASSUME[k] = v.includes(',') ? v.split(',').map(Number) : Number(v);
}
// eCPM = what the developer earns per 1,000 impressions (AdMob pays the publisher share; app stores take no cut of ads).
// Planning figures from 2026 public benchmarks (US interstitial ≈ $10, US rewarded ≈ $16–20; India/Brazil interstitial
// ≈ $1–3); the mid scenario is a blend of US, other rich countries and lower-income countries.
const SCENARIOS = [
  { name: 'Low (mostly lower-income countries, new AdMob account)', inter: 2, reward: 4 },
  { name: 'Mid (worldwide mix)', inter: 5, reward: 8 },
  { name: 'High (mostly US / UK / Canada / Australia)', inter: 10, reward: 17 },
];

// ---------------------------------------------------------------- random numbers (seeded)
function rng(seed) {
  let a = seed >>> 0;
  const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.normal = () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  r.logn = ([median, spread]) => median * Math.exp(spread * r.normal());
  return r;
}

// ---------------------------------------------------------------- 1. physics: how forgiving is each shot?
const SIG = [0.5, 1, 2, 3, 5, 8, 12]; // aim error sizes measured (degrees)
const settle = (sim) => { const t0 = sim.t; while (sim.t - t0 < 7) { sim.step(); if (sim.status !== 'play') return; if (sim.t - t0 > 0.15 && sim.canLaunch()) return; } };
const centre = (s) => { let x = 0, y = 0; for (let i = 0; i < s.px.length; i++) { x += s.px[i]; y += s.py[i]; } return [x / s.px.length, y / s.py.length]; };

function measureLevel(idx, R) {
  const L = LEVELS[idx], sim = makeSim(L, Math.floor(idx / 20)), sol = L.solution;
  const fire = (state, a, p, last) => {
    sim.loadState(state);
    const t0 = sim.t;
    const [vx, vy] = Sim.clampLaunch(Math.cos(a), Math.sin(a), Math.max(0, Math.min(1, p)));
    sim.launch(vx, vy); settle(sim);
    // a sausage resting in the bun needs a moment more to count as a win
    for (let j = 0; j < (last ? 480 : 40) && sim.status === 'play'; j++) sim.step();
    return { st: sim.status, c: centre(sim), t: sim.t - t0 };
  };
  // the route's resting spots: spot[k] is where shot k starts from
  const states = [], spots = [];
  for (let k = 0; k < sol.length; k++) {
    const [a, p, delay] = sol[k];
    for (let j = 0, n = Math.round((delay || 0) / PHYS.DT); j < n && sim.status === 'play'; j++) sim.step();
    states.push(sim.saveState()); spots.push(centre(sim));
    const [vx, vy] = Sim.clampLaunch(Math.cos(a), Math.sin(a), p);
    sim.launch(vx, vy); settle(sim);
  }
  // an imperfect flip from spot k: wins, falls, comes to rest on one of the route's spots (a later one = progress,
  // an earlier one = back), or somewhere off the route (the player tries again from where they were)
  const shots = sol.map(([a, p], k) => SIG.map((sd) => {
    const out = new Map(), T = new Map();
    const add = (key, t) => { out.set(key, (out.get(key) || 0) + 1); T.set(key, (T.get(key) || 0) + t); };
    for (let m = 0; m < SAMPLES; m++) {
      const r = fire(states[k], a + R.normal() * sd * Math.PI / 180, p + R.normal() * sd * ASSUME.powerPerDeg, k === sol.length - 1);
      if (r.st === 'win') { add('win', r.t); continue; }
      if (r.st !== 'play') { add('fail', r.t); continue; }
      let to = -1;
      for (let j = sol.length - 1; j >= 0 && to < 0; j--) if (j !== k && Math.hypot(r.c[0] - spots[j][0], r.c[1] - spots[j][1]) < 40) to = j;
      add(to > k ? `progress:${to}` : to >= 0 ? `back:${to}` : 'stray', r.t);
    }
    return [...out].map(([key, n]) => ({ kind: key.split(':')[0], to: +(key.split(':')[1] ?? -1), p: n / SAMPLES, t: T.get(key) / n }));
  }));
  return { name: L.name, par: L.par || 3, shots };
}

// outcome for an aim error between two measured sizes (the nearer size on a log scale, chosen at random in proportion)
function outcome(shot, sd, R) {
  let i = 0;
  if (sd >= SIG[SIG.length - 1]) i = SIG.length - 1;
  else if (sd > SIG[0]) { while (SIG[i + 1] < sd) i++; if (R() < Math.log(sd / SIG[i]) / Math.log(SIG[i + 1] / SIG[i])) i++; }
  let r = R();
  for (const o of shot[i]) { if (r < o.p) return o; r -= o.p; }
  return shot[i][shot[i].length - 1];
}
const works = (shot, i) => shot[i].reduce((n, o) => n + (o.kind === 'win' || o.kind === 'progress' ? o.p : 0), 0);

// ---------------------------------------------------------------- 2. players
function playWorld(levels, R) {
  const P = { aim: R.logn(ASSUME.aimErrorDeg) };
  const st = DEFAULT_AD_STATE();
  let now = Date.parse('2026-10-08T18:00:00Z'), sessionEnd = now + R.logn(ASSUME.sessionMinutes) * 60000;
  let longAimUntil = 0, aimTipShown = false, freeHintUsed = false;
  const out = { forced: 0, forcedNoFill: 0, hint: 0, skip: 0, aim: 0, rewardNoFill: 0, playSec: 0, wallSec: 0, skipped: 0, flips: 0, falls: 0, sessions: 1 };
  const wall = (s) => { now += s * 1000; out.wallSec += s; };
  const play = (s) => { wall(s); st.playSeconds += s; out.playSec += s; };
  const rewarded = (kind) => { if (R() < ASSUME.fillRewarded) { out[kind]++; wall(ASSUME.rewardedSeconds); } else out.rewardNoFill++; };

  for (let li = 0; li < levels.length; li++) {
    const lv = levels[li], tally = lv.tally || (lv.tally = { n: 0, flips: 0, skipped: 0, hint: 0, sec: 0 }), w0 = out.wallSec, f0 = out.flips;
    let k = 0, explore = ASSUME.exploreFirst, flips = 0, falls = 0, missed = 0, hint = false, hintAsked = false, won = false;
    play(ASSUME.introSeconds + ASSUME.lookSeconds);
    while (!won) {
      const sd = P.aim * explore * (hint ? ASSUME.hintHelp : 1) * (now < longAimUntil ? ASSUME.longAimHelp : 1);
      const o = outcome(lv.shots[k], sd, R);
      flips++; out.flips++;
      play(R.logn(ASSUME.aimSeconds) + o.t);
      if (o.kind === 'win') { won = true; break; }
      missed++; // every flip that didn't win counts toward the skip offer (as in the game)
      if (o.kind === 'progress') { k = o.to; explore = hint ? 1 : ASSUME.exploreFirst; continue; }
      if (o.kind === 'back') { k = o.to; }
      if (o.kind === 'fail') { falls++; out.falls++; play(ASSUME.failSeconds); }
      explore = Math.max(1, explore * 0.7);
      // 💡 appears after 3 falls or par + 3 flips; taking it restarts the level with the route drawn
      if (!hint && !hintAsked && (falls >= 3 || flips >= lv.par + 3)) {
        hintAsked = true;
        const free = !freeHintUsed;
        if (R() < (free ? ASSUME.hintTakeFree : ASSUME.hintTakePaid)) {
          if (free) freeHintUsed = true; else rewarded('hint');
          hint = true; k = 0; explore = 1;
        }
      }
      // the long aim tip shows once per app session, after 5 falls on a level
      if (falls >= 5 && !aimTipShown && now >= longAimUntil) {
        aimTipShown = true;
        if (R() < ASSUME.longAimTake) { rewarded('aim'); longAimUntil = now + AD_RULES.longAimMinutes * 60000; }
      }
      // ⏭ after 10 flips that didn't win (never on the game's last level); taken after a flip that went nowhere
      if (missed >= AD_RULES.skipAfterMissedFlips && R() < ASSUME.skipTake) { rewarded('skip'); out.skipped++; break; }
    }
    if (won) {
      play(ASSUME.winAnimSeconds);
      st.wins++; st.levelsSinceAd++;
      wall(ASSUME.winCardSeconds);
      const [show] = interstitialDecision(st, { fails: falls, worldEnd: li === levels.length - 1 }, now, AD_RULES);
      if (show) {
        if (R() < ASSUME.fillInterstitial) { out.forced++; st.levelsSinceAd = 0; st.lastShownAt = now; st.interstitials++; wall(ASSUME.interstitialSeconds); }
        else out.forcedNoFill++;
      }
    }
    tally.n++; tally.flips += out.flips - f0; tally.skipped += won ? 0 : 1; tally.hint += hint ? 1 : 0; tally.sec += out.wallSec - w0;
    if (now > sessionEnd && li < levels.length - 1) { // a break: some hours pass, a new session starts
      now += (2 + R() * 20) * 3600e3; sessionEnd = now + R.logn(ASSUME.sessionMinutes) * 60000; aimTipShown = false; out.sessions++;
    }
  }
  return out;
}

// ---------------------------------------------------------------- run
const t0 = Date.now();
const R0 = rng(20261008);
const ids = []; for (let i = WORLD * 20; i < WORLD * 20 + 20; i++) ids.push(i);
const levels = ids.map((i) => measureLevel(i, R0));
console.log(`physics: ${levels.reduce((n, l) => n + l.shots.length, 0)} shots × ${SIG.length} aim-error sizes × ${SAMPLES} flips measured in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const pct = (a, q) => a[Math.min(a.length - 1, Math.floor(q * a.length))];
const report = [];
for (const N of COHORTS) {
  const R = rng(1000 + N);
  const ps = [];
  for (let i = 0; i < N; i++) ps.push(playWorld(levels, R));
  const sum = (k) => ps.reduce((n, p) => n + p[k], 0);
  const forced = sum('forced'), reward = sum('hint') + sum('skip') + sum('aim');
  const mins = ps.map((p) => p.wallSec / 60).sort((a, b) => a - b);
  const dist = {}; for (const p of ps) dist[Math.min(p.forced, 5)] = (dist[Math.min(p.forced, 5)] || 0) + 1;
  const rev = SCENARIOS.map((s) => ({ name: s.name, inter: forced * s.inter / 1000, reward: reward * s.reward / 1000 }));
  report.push({ players: N, forced, forcedPer: forced / N, reward, hint: sum('hint'), skip: sum('skip'), aim: sum('aim'), skipped: sum('skipped'),
    noFill: sum('forcedNoFill'), minutes: { median: pct(mins, 0.5), p10: pct(mins, 0.1), p90: pct(mins, 0.9) }, flips: sum('flips') / N, falls: sum('falls') / N,
    sessions: sum('sessions') / N, dist, rev });
}
for (const r of report) {
  console.log(`\n${r.players} players — world ${WORLD + 1}: median ${r.minutes.median.toFixed(0)} min (10–90%: ${r.minutes.p10.toFixed(0)}–${r.minutes.p90.toFixed(0)}), ${r.flips.toFixed(0)} flips, ${r.falls.toFixed(0)} falls, ${r.sessions.toFixed(1)} sessions each`);
  console.log(`  forced ads: ${r.forced} (${r.forcedPer.toFixed(2)} per player) · per player: ${Object.entries(r.dist).map(([k, v]) => `${k === '5' ? '5+' : k}: ${(100 * v / r.players).toFixed(0)}%`).join(', ')}`);
  console.log(`  reward ads (chosen): ${r.reward} — hints ${r.hint}, skips ${r.skip}, long aim ${r.aim}; levels skipped ${r.skipped}`);
  for (const s of r.rev) console.log(`  ${s.name}: forced $${s.inter.toFixed(2)} + reward $${s.reward.toFixed(2)} = $${(s.inter + s.reward).toFixed(2)}`);
}
if (argv.includes('--detail')) {
  console.log('\nper level (all cohorts): par, flips, minutes, hint taken, skipped · each shot: works at 1° / 2° / 5° aim error');
  for (const [i, l] of levels.entries()) {
    const t = l.tally, f = (sd) => l.shots.map((sh) => Math.round(100 * works(sh, SIG.indexOf(sd)))).join('/');
    console.log(`  ${String(i + 1).padStart(2)} ${l.name.padEnd(22)} par ${l.par}  ${(t.flips / t.n).toFixed(1).padStart(4)} flips  ${(t.sec / t.n / 60).toFixed(1)} min  hint ${(100 * t.hint / t.n).toFixed(0).padStart(2)}%  skipped ${(100 * t.skipped / t.n).toFixed(0).padStart(2)}%  · ${f(1)} | ${f(2)} | ${f(5)}`);
  }
}
const json = opt('--json', null);
if (json) fs.writeFileSync(json, JSON.stringify({ assume: ASSUME, scenarios: SCENARIOS, rules: AD_RULES, report, levels: levels.map((l) => ({ name: l.name, par: l.par })) }, null, 1));
