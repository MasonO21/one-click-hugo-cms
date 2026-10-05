// Human-likeness QA: replays each level's verified route end-to-end with human-sized errors on every
// shot (aim ±1.2°, power ±2%, timing ±0.06 s) and reports how often the whole route still wins.
// (Pessimistic: a real player re-aims after an imperfect landing; this replay does not.)
// Usage: node tools/qa.mjs [--file src/levels/data.js] [--n 30] [--ids 0,1,2]
import { makeSim } from './solver.mjs';
import { PHYS } from '../src/physics.js';
import path from 'node:path';


function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function perturbedRate(L, wi, n = 30, seed = 1) {
  const rnd = mulberry(seed);
  let wins = 0;
  for (let k = 0; k < n; k++) {
    const sim = makeSim(L, wi);
    for (const [a, p, delay] of L.solution) {
      const d = Math.max(0, (delay || 0) + (rnd() - 0.5) * 0.12);
      const steps = Math.round(d / PHYS.DT);
      for (let i = 0; i < steps && sim.status === 'play'; i++) sim.step();
      if (sim.status !== 'play') break;
      const aa = a + (rnd() - 0.5) * 2 * (1.2 * Math.PI / 180);
      const pp = Math.max(0, Math.min(1, p + (rnd() - 0.5) * 2 * 0.02));
      const v = PHYS.MIN_V + (PHYS.MAX_V - PHYS.MIN_V) * pp;
      sim.launch(Math.cos(aa) * v, Math.sin(aa) * v);
      const t0 = sim.t;
      while (sim.t - t0 < 7) { sim.step(); if (sim.status !== 'play') break; if (sim.t - t0 > 0.15 && sim.canLaunch()) break; }
      if (sim.status !== 'play') break;
    }
    if (sim.status === 'win') wins++;
  }
  return wins / n;
}

if ((process.argv[1] || '').endsWith('qa.mjs')) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
  const file = path.resolve(arg('file', 'src/levels/data.js'));
  const N = +arg('n', 30);
  const { LEVELS } = await import(file);
  const ids = arg('ids', null) ? arg('ids').split(',').map(Number) : LEVELS.map((_, i) => i);
  const rows = [];
  for (const i of ids) {
    const L = LEVELS[i];
    if (!L) { console.log(i + 1, 'MISSING'); continue; }
    const r = perturbedRate(L, Math.floor(i / 20), N, i + 1);
    rows.push([i, r]);
    console.log(`#${i + 1} ${L.name.padEnd(26)} par ${L.par}  route success ${(r * 100).toFixed(0)}%${r < 0.15 ? '  <-- TOUGH' : ''}`);
  }
  const avg = rows.reduce((a, b) => a + b[1], 0) / rows.length;
  console.log('average', (avg * 100).toFixed(1) + '%');
}
