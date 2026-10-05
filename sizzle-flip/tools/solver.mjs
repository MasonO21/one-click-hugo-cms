// Automated playtester: beam-searches flips with the real game physics to prove a level
// is beatable, compute its par and estimate how forgiving the required shots are.
import { Sim, PHYS, simulateShot } from '../src/physics.js';
import { WORLDS } from '../src/objects.js';

const TAU = Math.PI * 2;

export function makeSim(level, worldIndex) {
  const w = WORLDS[worldIndex];
  const sim = new Sim({ ...level, gravity: level.gravity ?? w.gravity, floor: level.floor ?? w.floor }, { events: false });
  sim.placeSausage(level.start[0], level.start[1], level.start[2] || 0);
  for (let i = 0; i < 90; i++) sim.step();
  sim.t = 0;
  for (const b of sim.bodies) sim.updateBody(b, 0, true);
  // run until launchable, exactly as replays do
  for (let i = 0; i < 120 && !sim.canLaunch(); i++) sim.step();
  return sim;
}

function snapshot(sim) { return sim.saveState(); }
function restore(sim, s) { sim.loadState(s); }

export function angleGrid(n) {
  const lo = -Math.PI - PHYS.LAUNCH_MIN_ANGLE, hi = PHYS.LAUNCH_MIN_ANGLE;
  const out = [];
  for (let i = 0; i < n; i++) out.push(lo + (hi - lo) * (i + 0.5) / n);
  return out;
}

// Explore all shots from a snapshot. Returns outcome map.
function explore(sim, snap, opts) {
  const { angles, powers, delays } = opts;
  const results = [];
  for (const delay of delays) {
    for (let ai = 0; ai < angles.length; ai++) {
      for (let pi = 0; pi < powers.length; pi++) {
        restore(sim, snap);
        // wait (moving platforms / timers): keep simulating in place
        if (delay > 0) {
          const steps = Math.round(delay / PHYS.DT);
          for (let k = 0; k < steps && sim.status === 'play'; k++) sim.step();
          if (sim.status !== 'play' || !sim.canLaunch()) { results.push({ ai, pi, delay, status: 'invalid' }); continue; }
        }
        const a = angles[ai], p = powers[pi];
        const v = PHYS.MIN_V + (PHYS.MAX_V - PHYS.MIN_V) * p;
        const r = simulateShot(sim, Math.cos(a) * v, Math.sin(a) * v, opts.maxT || 7);
        const rec = { ai, pi, delay, status: r.status, reason: r.reason };
        if (r.status === 'play') {
          rec.snap = snapshot(sim);
          const [cx, cy] = sim.com();
          rec.cx = cx; rec.cy = cy;
          rec.key = sim.supportBody + ':' + Math.round(cx / 70) + ':' + Math.round(cy / 70);
        }
        results.push(rec);
      }
    }
  }
  return results;
}

// Robustness of a cell: how many of its 8 grid neighbours (same delay) share its outcome key.
function neighbourSupport(results, opts, pred) {
  const na = opts.angles.length, np = opts.powers.length;
  const grid = new Map();
  for (const r of results) grid.set(r.delay + '|' + r.ai + '|' + r.pi, r);
  return (r) => {
    let n = 0;
    for (let da = -1; da <= 1; da++) for (let dp = -1; dp <= 1; dp++) {
      if (!da && !dp) continue;
      const q = grid.get(r.delay + '|' + (r.ai + da) + '|' + (r.pi + dp));
      if (q && pred(q)) n++;
    }
    return n;
  };
}

// Human error model: aim ±1.2°, power ±2%, reaction ±0.06 s.
const NOISE = { aim: 1.2 * Math.PI / 180, pow: 0.02, time: 0.06 };

function noisyRate(sim, snap, a, p, delay, target, n, seed, hasTime) {
  let ok = 0;
  let r = seed >>> 0 || 1;
  const rnd = () => { r ^= r << 13; r >>>= 0; r ^= r >> 17; r ^= r << 5; r >>>= 0; return r / 4294967296; };
  for (let k = 0; k < n; k++) {
    restore(sim, snap);
    const d = hasTime ? Math.max(0, delay + (rnd() - 0.5) * 2 * NOISE.time) : 0;
    const steps = Math.round(d / PHYS.DT);
    for (let i = 0; i < steps && sim.status === 'play'; i++) sim.step();
    if (sim.status !== 'play') continue;
    const aa = a + (rnd() - 0.5) * 2 * NOISE.aim;
    const pp = Math.max(0, Math.min(1, p + (rnd() - 0.5) * 2 * NOISE.pow));
    const v = PHYS.MIN_V + (PHYS.MAX_V - PHYS.MIN_V) * pp;
    const res = simulateShot(sim, Math.cos(aa) * v, Math.sin(aa) * v, 7);
    if (target === 'win') { if (res.status === 'win') ok++; }
    else if (res.status === 'play') {
      const [cx, cy] = sim.com();
      if (sim.supportBody + ':' + Math.round(cx / 70) + ':' + Math.round(cy / 70) === target) ok++;
    }
  }
  return ok / n;
}

/**
 * solve(level, worldIndex, {maxDepth, beam})
 * Beam search over resting states. Every edge on the returned route is chosen to survive human-sized
 * aim/power/timing error; minRobust is the worst per-shot success rate under that noise (0..1).
 */
export function solve(level, worldIndex, o = {}) {
  const t0 = Date.now();
  const sim = makeSim(level, worldIndex);
  const hasTime = sim.bodies.some(b => b.kinematic || b.timer);
  const na = o.na || (hasTime ? 30 : 36), np = o.np || (hasTime ? 11 : 13);
  const opts = {
    angles: angleGrid(na),
    powers: Array.from({ length: np }, (_, i) => 0.06 + 0.94 * i / (np - 1)),
    delays: hasTime ? [0.3, 1.1, 1.9] : [0],
    maxT: 7,
  };
  const goal = sim.bodies.find(b => b.type && b.type.role === 'goal');
  const gx = goal.cx, gy = goal.cy;
  const maxDepth = o.maxDepth || 7;
  const beam = o.beam || 5;
  const minEdge = o.minEdge ?? 0.12;
  const start = { snap: snapshot(sim), path: [], robust: 1, depth: 0 };
  let frontier = [start];
  const seen = new Set();
  const [sx, sy] = sim.com();
  seen.add(sim.supportBody + ':' + Math.round(sx / 70) + ':' + Math.round(sy / 70));
  let states = 0, seed = 1;
  let best = null;
  const progress = (cx, cy) => Math.abs(cy - gy) * 1.0 + Math.abs(cx - gx) * 0.35;

  for (let depth = 1; depth <= maxDepth && frontier.length && !best; depth++) {
    const next = new Map();
    for (const node of frontier) {
      states++;
      const res = explore(sim, node.snap, opts);
      const winSupport = neighbourSupport(res, opts, q => q.status === 'win');
      // wins: evaluate the best-supported few under noise
      const wins = res.filter(r => r.status === 'win').map(r => ({ r, sup: winSupport(r) })).sort((a, b) => b.sup - a.sup).slice(0, 5);
      let bestWin = null;
      for (const w of wins) {
        const a = opts.angles[w.r.ai], p = opts.powers[w.r.pi];
        const rate = noisyRate(sim, node.snap, a, p, w.r.delay, 'win', 10, seed++, hasTime);
        if (!bestWin || rate > bestWin.rate) bestWin = { ...w, rate, a, p };
        if (rate >= 0.9) break;
      }
      if (bestWin && bestWin.rate >= minEdge) {
        const cand = {
          par: depth,
          path: [...node.path, { a: bestWin.a, p: bestWin.p, delay: bestWin.r.delay }],
          minRobust: Math.min(node.robust, bestWin.rate),
          winShots: wins.length,
          winFrac: res.filter(r => r.status === 'win').length / res.length,
        };
        if (!best || cand.minRobust > best.minRobust) best = cand;
        continue;
      }
      // group transitions by destination cluster
      const groups = new Map();
      for (const r of res) {
        if (r.status !== 'play' || seen.has(r.key)) continue;
        let g = groups.get(r.key);
        if (!g) { g = []; groups.set(r.key, g); }
        g.push(r);
      }
      // rank clusters cheaply, then verify the most promising under noise
      const ranked = [...groups.entries()]
        .filter(([, g]) => g.length >= (o.minCluster ?? 2))
        .map(([key, g]) => ({ key, g, pre: progress(g[0].cx, g[0].cy) - Math.min(g.length, 30) * 3 }))
        .sort((a, b) => a.pre - b.pre)
        .slice(0, beam * 2);
      for (const { key, g } of ranked) {
        const sup = neighbourSupport(res, opts, q => q.key === key);
        const cands = g.map(r => ({ r, s: sup(r) })).sort((a, b) => b.s - a.s).slice(0, 2);
        let bestC = null;
        for (const c of cands) {
          const a = opts.angles[c.r.ai], p = opts.powers[c.r.pi];
          const rate = noisyRate(sim, node.snap, a, p, c.r.delay, key, 6, seed++, hasTime);
          if (!bestC || rate > bestC.rate) bestC = { ...c, rate, a, p };
        }
        if (!bestC || bestC.rate < minEdge) continue;
        const robust = Math.min(node.robust, bestC.rate);
        const item = {
          snap: bestC.r.snap, depth, key, robust,
          path: [...node.path, { a: bestC.a, p: bestC.p, delay: bestC.r.delay }],
          score: progress(bestC.r.cx, bestC.r.cy) - robust * 350,
        };
        const prev = next.get(key);
        if (!prev || item.score < prev.score) next.set(key, item);
      }
    }
    if (best) break;
    const arr = [...next.values()].sort((a, b) => a.score - b.score);
    for (const it of arr) seen.add(it.key);
    frontier = arr.slice(0, beam);
  }
  if (!best) return { par: null, states, ms: Date.now() - t0 };
  return { ...best, states, ms: Date.now() - t0 };
}

// Continuous replay of a stored solution (same protocol the game's hint uses). Returns final status.
export function replaySolution(level, worldIndex, solution = level.solution) {
  const sim = makeSim(level, worldIndex);
  for (const [a, p, delay] of solution) {
    for (let i = 0; i < Math.round((delay || 0) / PHYS.DT) && sim.status === 'play'; i++) sim.step();
    const v = PHYS.MIN_V + (PHYS.MAX_V - PHYS.MIN_V) * p;
    sim.launch(Math.cos(a) * v, Math.sin(a) * v);
    const t0 = sim.t;
    while (sim.t - t0 < 7) { sim.step(); if (sim.status !== 'play') break; if (sim.t - t0 > 0.15 && sim.canLaunch()) break; }
    if (sim.status !== 'play') break;
  }
  return sim.status;
}
