// Layout lint for every level: objects running off the sides of the screen, solid objects sunk into each other,
// and the start or the bun hidden behind another object. Prints candidates to look at in the level screenshots.
// node tools/check-layout.mjs
import { Sim, PHYS } from '../src/physics.js';
import { WORLDS } from '../src/objects.js';
import { LEVELS } from '../src/levels/data.js';

const { W } = PHYS;
const out = [];
LEVELS.forEach((L, li) => {
  const w = WORLDS[Math.floor(li / 20)];
  const sim = new Sim({ ...L, gravity: w.gravity, floor: w.floor }, { events: false });
  const bodies = sim.bodies.filter(b => b.type);
  const name = (b) => `${b.type.id}#${b.index}`;
  for (const b of bodies) {
    const sol = b.shapes.filter(s => !s.sensor);
    if (!sol.length) continue;
    const minx = Math.min(...sol.map(s => s.minx)), maxx = Math.max(...sol.map(s => s.maxx));
    const miny = Math.min(...sol.map(s => s.miny));
    if (minx < -12 || maxx > W + 12) out.push([li, `${name(b)} runs ${minx < -12 ? Math.round(-minx) + ' px off the left' : Math.round(maxx - W) + ' px off the right'} edge`]);
    if (miny < -20) out.push([li, `${name(b)} pokes ${Math.round(-miny)} px above the top of the level`]);
  }
  // solid-solid overlap: sample a grid inside each solid shape, count points deep inside another body's solid
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const A = bodies[i], B = bodies[j];
    if (A.kinematic || B.kinematic) continue; // moving things pass by others by design
    let hits = 0, total = 0, at = null;
    for (const sa of A.shapes) {
      if (sa.sensor) continue;
      for (let x = sa.minx; x <= sa.maxx; x += 6) for (let y = sa.miny; y <= sa.maxy; y += 6) {
        if (!sim.pointInShape(sa, x, y, -2)) continue;
        total++;
        if (B.shapes.some(sb => !sb.sensor && sim.pointInShape(sb, x, y, -8))) { hits++; at = at || [Math.round(x), Math.round(y)]; }
      }
    }
    if (hits >= 6) out.push([li, `${name(A)} and ${name(B)} overlap (${hits} sample points, near ${at})`]);
  }
});
let last = -1;
for (const [li, msg] of out) { if (li !== last) { console.log(`level ${li + 1} ${LEVELS[li].name}`); last = li; } console.log('   ' + msg); }
console.log(`${out.length} candidate(s) in ${new Set(out.map(o => o[0])).size} level(s)`);
