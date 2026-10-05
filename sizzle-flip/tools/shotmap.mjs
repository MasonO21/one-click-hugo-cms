// Print an outcome map (angle x power) for the first shot of a level. node tools/shotmap.mjs <levelIndex> [world]
import { makeSim, angleGrid } from './solver.mjs';
import { PHYS, simulateShot } from '../src/physics.js';
const { LEVELS } = await import('../src/levels/data.js');
const li = +(process.argv[2] || 0);
const L = LEVELS[li];
const wi = Math.floor(li / 20);
const sim = makeSim(L, wi);
const snap = { px: Float64Array.from(sim.px), py: Float64Array.from(sim.py), t: sim.t };
const angles = angleGrid(60).filter(a => a < -0.3 && a > -Math.PI + 0.3);
const powers = Array.from({ length: 26 }, (_, i) => 0.05 + i * 0.038);
const keyOf = (r) => r.status === 'win' ? 'W' : r.status === 'fail' ? (r.reason === 'floor' ? '_' : 'x') : r.status === 'timeout' ? '?' : null;
const sup = new Map(); let ch = 'abcdefghijklmnopqrstuvwxyz'; let ci = 0;
console.log('rows=power (low→high), cols=angle (left→right)');
for (const p of powers) {
  let line = p.toFixed(2) + ' ';
  for (const a of angles) {
    sim.loadPose({ px: snap.px, py: snap.py }); sim.t = snap.t; for (const b of sim.bodies) if (b.kinematic) sim.updateBody(b, snap.t);
    const v = PHYS.MIN_V + (PHYS.MAX_V - PHYS.MIN_V) * p;
    const r = simulateShot(sim, Math.cos(a) * v, Math.sin(a) * v);
    let k = keyOf(r);
    if (!k) { const b = sim.supportBody; if (!sup.has(b)) sup.set(b, ch[ci++ % 26]); k = sup.get(b); }
    line += k;
  }
  console.log(line);
}
console.log([...sup].map(([b, c]) => c + '=' + (sim.bodies[b].type ? sim.bodies[b].type.id : sim.bodies[b].role)).join(' '));
