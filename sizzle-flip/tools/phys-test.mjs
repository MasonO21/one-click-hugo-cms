import { Sim, PHYS, simulateShot } from '../src/physics.js';
const level = { w: 640, h: 1100, objects: [
  { t: 'stove', x: 140, y: 1025 },
  { t: 'pan', x: 185, y: 926 },
  { t: 'shelf', x: 480, y: 700, w: 220 },
  { t: 'bun', x: 480, y: 658 },
]};
const sim = new Sim(level);
sim.placeSausage(185 - 45, 905);
let t0 = performance.now();
for (let i = 0; i < 120; i++) sim.step();
console.log('settle', sim.canLaunch(), sim.com().map(v=>v.toFixed(1)), 'rest', sim.restTimer.toFixed(2), 'status', sim.status, 'maxRel', sim.maxSpeed.toFixed(1));
const pose = sim.savePose(); const t = sim.t;
let found = 0, total = 0;
const res = {};
for (let a = -175; a <= -5; a += 5) for (let p = 0.05; p <= 1.0001; p += 0.05) {
  sim.loadPose(pose); sim.t = t;
  for (let k=0;k<20;k++) sim.step();
  const [vx, vy] = Sim.clampLaunch(Math.cos(a*Math.PI/180), Math.sin(a*Math.PI/180), p);
  const r = simulateShot(sim, vx, vy);
  total++;
  const k = r.status + (r.reason ? ':' + r.reason : '');
  res[k] = (res[k]||0)+1;
  if (r.status === 'win') { found++; if (found < 6) console.log('WIN a', a, 'p', p.toFixed(2)); }
}
console.log(res, 'sims', total, 'ms/sim', ((performance.now()-t0)/total).toFixed(2));
