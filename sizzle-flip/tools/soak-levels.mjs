// Random-play soak test of every level with the game's own rules: the sausage is flipped from wherever it comes to
// rest, a failed attempt respawns at the last resting spot (re-attached to a moving platform, delayed while a
// grill there is on) — exactly like src/game.js. Three kinds of player: one who flips at random, one who follows
// the verified route sloppily, one who follows it and then goes off on their own.
// Reports anything a player could get stuck on: shots that never resolve, respawn loops, the sausage passing
// through a solid surface or resting outside the play area, NaNs, and places where random play keeps ending in
// the 12-second "stuck" rule (a trap the player must sit through).
// node tools/soak-levels.mjs [from=1] [to=200] [--shots 30] [--seeds 3] [--jobs 4] [--json out.json]
import { Sim, PHYS } from '../src/physics.js';
import { Checkpoints } from '../src/checkpoint.js';
import { WORLDS } from '../src/objects.js';
import { LEVELS } from '../src/levels/data.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const { N, R, W, DT } = PHYS;
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const from = +(pos[0] || 1), to = +(pos[1] || LEVELS.length);
const SHOTS = +opt('--shots', 30), SEEDS = +opt('--seeds', 3), JOBS = +opt('--jobs', 1);
const jsonOut = opt('--json', null);
const TRACE = argv.includes('--trace');

// ---- parallel runner: split the range into jobs and merge their JSON
if (JOBS > 1) {
  const n = to - from + 1, per = Math.ceil(n / JOBS);
  const parts = [];
  for (let j = 0; j < JOBS; j++) {
    const a = from + j * per, b = Math.min(to, a + per - 1);
    if (a > b) continue;
    const tmp = `/tmp/soak-${process.pid}-${j}.json`;
    parts.push(new Promise((res) => {
      const p = spawn(process.execPath, [new URL(import.meta.url).pathname, String(a), String(b), '--shots', String(SHOTS), '--seeds', String(SEEDS), '--json', tmp], { stdio: ['ignore', 'pipe', 'inherit'] });
      p.stdout.on('data', d => process.stdout.write(d));
      p.on('exit', () => { try { res(JSON.parse(fs.readFileSync(tmp, 'utf8'))); fs.unlinkSync(tmp); } catch (e) { res({ levels: [], problems: [{ level: a, kind: 'crash', msg: 'worker failed' }] }); } });
    }));
  }
  const res = await Promise.all(parts);
  const all = { levels: res.flatMap(r => r.levels), problems: res.flatMap(r => r.problems) };
  report(all);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(all, null, 1));
  process.exit(all.problems.length ? 1 : 0);
}

// ---- deterministic RNG
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

const LO = -Math.PI - PHYS.LAUNCH_MIN_ANGLE, HI = PHYS.LAUNCH_MIN_ANGLE;
const vel = (a, p) => Sim.clampLaunch(Math.cos(a), Math.sin(a), p);

function makeSim(L, wi) {
  const w = WORLDS[wi];
  const sim = new Sim({ ...L, gravity: L.gravity ?? w.gravity, floor: L.floor ?? w.floor }, { events: false });
  sim.placeSausage(L.start[0], L.start[1], L.start[2] || 0);
  for (let i = 0; i < 90; i++) sim.step();
  sim.t = 0;
  for (const b of sim.bodies) sim.updateBody(b, 0, true);
  return sim;
}

function soakLevel(li) {
  const L = LEVELS[li], wi = Math.floor(li / 20);
  const problems = [];
  const stats = { level: li + 1, shots: 0, wins: 0, fails: {}, stuck: [], respawns: 0, maxResolve: 0 };
  const add = (kind, msg, extra = {}) => { if (problems.length < 12) problems.push({ level: li + 1, kind, msg, ...extra }); };
  const sol = L.solution || [];

  for (let seed = 0; seed < SEEDS; seed++) {
    const rand = rng((li + 1) * 7919 + seed * 104729);
    const mode = seed % 3; // 0 random, 1 sloppy route, 2 route then random
    const s = makeSim(L, wi);
    // become launchable first (as the game does after the intro)
    let k = 0;
    while (!s.canLaunch() && k < 600) { s.step(); k++; }
    if (!s.canLaunch()) { add('start', `the sausage never comes to rest at the start (status ${s.status} ${s.failReason || ''})`); continue; }
    const cps = new Checkpoints(s);
    let routeN = 0, onRoute = mode !== 0, chainFails = 0;
    for (let shot = 0; shot < SHOTS; shot++) {
      // choose the shot
      let a, p;
      if (onRoute && routeN < sol.length && (mode === 2 || rand() < 0.85)) {
        const noise = mode === 1 ? 1 : 0.15;
        a = sol[routeN][0] + (rand() - 0.5) * 0.06 * noise; p = Math.max(0, Math.min(1, sol[routeN][1] + (rand() - 0.5) * 0.08 * noise));
        // the stored wait (moving platforms); a sloppy player waits a little more or less
        const wait = Math.max(0, Math.round(((sol[routeN][2] || 0) + (mode === 1 ? (rand() - 0.5) * 0.1 : 0)) / DT));
        for (let w = 0; w < wait && s.status === 'play'; w++) s.step();
        routeN++;
      } else {
        onRoute = false;
        a = LO + (HI - LO) * rand(); p = rand();
        // sometimes wait a moment first (moving platforms)
        if (rand() < 0.3) { const wait = Math.round(rand() * 2 / DT); for (let w = 0; w < wait && s.status === 'play'; w++) s.step(); }
      }
      if (s.status !== 'play' || !s.canLaunch()) { // carried off / failed while waiting: handled like any other outcome
        if (s.status !== 'play') { /* falls through to the fail handling below */ }
      } else {
        const [vx, vy] = vel(a, p);
        cps.save(); cps.work(Infinity);   // game.js launch() (the game finishes the try-out over the next frames)
        s.launch(vx, vy);
        stats.shots++;
      }
      // run until rest / win / fail
      const t0 = s.t;
      let tunnel = null, escaped = null, nan = false;
      const ring = [];
      while (s.t - t0 < 20) {
        s.step();
        if (TRACE) { const [cx, cy] = s.com(); ring.push(`${(s.t - t0).toFixed(2)} com ${cx.toFixed(1)},${cy.toFixed(1)} rest ${s.restTimer.toFixed(2)} rel ${s.maxSpeed.toFixed(0)} sup ${s.bodies[s.supportBody] ? (s.bodies[s.supportBody].type ? s.bodies[s.supportBody].type.id : s.bodies[s.supportBody].role) : '-'} contacts ${[...s.cAge].filter(a => a < 0.06).length} ang ${(Math.atan2(s.py[9] - s.py[0], s.px[9] - s.px[0]) * 57.3).toFixed(0)}`); if (ring.length > 200) ring.shift(); }
        for (let i = 0; i < N && !nan; i++) {
          const x = s.px[i], y = s.py[i];
          if (!Number.isFinite(x) || !Number.isFinite(y)) { nan = true; break; }
          if (!escaped && (x < -2 || x > W + 2)) escaped = [Math.round(x), Math.round(y)];
          if (!tunnel && s.status === 'play') for (const sh of s._cand) {
            if (sh.sensor) continue;
            if (s.pointInShape(sh, x, y, -5)) { const b = s.bodies[sh.body]; tunnel = { obj: b.type ? b.type.id : b.role, x: Math.round(x), y: Math.round(y) }; break; }
          }
        }
        if (nan || s.status !== 'play') break;
        if (s.t - t0 > 0.15 && s.canLaunch()) break;
      }
      const took = s.t - t0;
      stats.maxResolve = Math.max(stats.maxResolve, +took.toFixed(1));
      if (nan) { add('nan', `NaN after shot ${shot + 1} (seed ${seed})`); break; }
      if (escaped) add('escape', `the sausage left the world at ${escaped} (seed ${seed}, shot ${shot + 1})`);
      if (tunnel) add('tunnel', `a sausage point went inside ${tunnel.obj} at ${tunnel.x},${tunnel.y} (seed ${seed}, shot ${shot + 1})`, { obj: tunnel.obj, at: [tunnel.x, tunnel.y] });
      if (s.status === 'play' && !s.canLaunch()) { add('unresolved', `shot ${shot + 1} (seed ${seed}) did not resolve in 20 s`); break; }

      if (s.status === 'win') { stats.wins++; break; }
      if (s.status === 'fail') {
        const reason = s.failReason;
        stats.fails[reason] = (stats.fails[reason] || 0) + 1;
        if (reason === 'stuck') { const [x, y] = s.com(); stats.stuck.push([Math.round(x), Math.round(y)]); if (TRACE && stats.stuck.length === 1) console.log(`--- level ${li + 1} stuck (seed ${seed}, shot ${shot + 1}):\n` + ring.filter((_, i) => i % 15 === 0).join('\n')); }
        // respawn like the game: after 1 s, when the checkpoint is clear (at most 8 s); a respawn that fails
        // before the sausage could be flipped falls back to the checkpoint before it
        let settled = false, loops = 0;
        while (!settled) {
          cps.failed();
          let ft = 0;
          while (ft < 8 && !(ft > 1.0 && cps.clear())) { s.step(); ft += DT; }
          cps.respawn();
          stats.respawns++;
          let rt = 0;
          while (rt < 6 && s.status === 'play' && !s.canLaunch()) { s.step(); rt += DT; }
          if (s.status === 'play' && s.canLaunch()) { settled = true; cps.ready(); break; }
          if (s.status === 'play') { add('respawn-unsettled', `after respawning at ${Math.round(s.com()[0])},${Math.round(s.com()[1])} the sausage does not settle within 6 s`); break; }
          if (++loops >= 4) { const c = cps.current.pose; add('respawn-loop', `respawning at ${Math.round(c.px[4])},${Math.round(c.py[4])} keeps failing at once (${s.failReason}), ${cps.list.length} checkpoints left`); break; }
        }
        if (!settled) break;
        chainFails = 0;
        onRoute = false;
      } else {
        chainFails = 0;
        // at rest: inside the play area?
        const [cx, cy] = s.com();
        if (cy < 40) add('offscreen-rest', `the sausage came to rest above the top of the level at ${Math.round(cx)},${Math.round(cy)}`);
        cps.ready();
        cps.save(); cps.work(Infinity);
      }
    }
  }
  // traps: random play repeatedly ending in the 12-second stuck rule
  if (stats.stuck.length >= 3) add('stuck-trap', `random play hit the 12 s "stuck" rule ${stats.stuck.length} times, at ${stats.stuck.slice(0, 5).map(p => p.join(',')).join(' ; ')}`, { at: stats.stuck });
  return { stats, problems };
}

function report(all) {
  const byKind = {};
  for (const p of all.problems) (byKind[p.kind] ||= []).push(p);
  const shots = all.levels.reduce((a, l) => a + l.shots, 0), wins = all.levels.reduce((a, l) => a + l.wins, 0);
  const fails = {}; for (const l of all.levels) for (const [k, v] of Object.entries(l.fails)) fails[k] = (fails[k] || 0) + v;
  console.log(`soak: ${all.levels.length} levels, ${shots} shots, ${wins} wins, ${Object.values(fails).reduce((a, b) => a + b, 0)} fails ${JSON.stringify(fails)}`);
  console.log(`slowest shot to resolve: ${Math.max(...all.levels.map(l => l.maxResolve))} s`);
  for (const [k, list] of Object.entries(byKind)) {
    console.log(`\n${k}: ${list.length}`);
    for (const p of list.slice(0, 40)) console.log(`  level ${p.level}: ${p.msg}`);
  }
  if (!all.problems.length) console.log('no problems found');
}

const out = { levels: [], problems: [] };
for (let li = from - 1; li < to; li++) {
  const r = soakLevel(li);
  out.levels.push(r.stats); out.problems.push(...r.problems);
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(out));
else { report(out); process.exit(out.problems.length ? 1 : 0); }
