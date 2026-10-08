// Soul Gates: pairs of glowing arches that multiply (or cull) the legion. Walk through one to choose.
import * as THREE from 'three';
import { makeGate, disposeGroup } from './fxmeshes.js';
import { BASE, HITSTOP } from './data.js';

const WIDTH = 3.4;

function makeOps(L, minute) {
  const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);
  const add = (k = 1) => ({ type: 'add', n: round5((12 + minute * 7 + L * 0.2) * k) });
  const mul = (n) => ({ type: 'mul', n });
  const bad = () => (Math.random() < 0.5 || L < 12 ? { type: 'sub', n: round5(Math.max(10, L * 0.5)) } : { type: 'div', n: 2 });
  let pair;
  const r = Math.random();
  if (L < 10) pair = r < 0.6 ? [add(1.3), add(0.6)] : [add(1.2), bad()];
  else if (r < 0.45) pair = [add(1), mul(2)];
  else if (r < 0.75) pair = [mul(Math.random() < 0.15 ? 3 : 2), bad()];
  else pair = [add(1.4), bad()];
  if (Math.random() < 0.5) pair.reverse();
  return pair;
}
const label = (op) => ({ add: `+${op.n}`, mul: `×${op.n}`, sub: `−${op.n}`, div: `÷${op.n}` }[op.type]);
const isGood = (op) => op.type === 'add' || op.type === 'mul';
/** Legion change if the gate were taken now (before the 400 ceiling). */
const gain = (op, L) => ({ add: op.n, mul: L * (op.n - 1), sub: -Math.min(L, op.n), div: -Math.floor(L / op.n) }[op.type]);

// From 2:00 the better gate is often guarded: risk for the bigger reward (GDD §4.3).
const GUARD = { fromMinute: 2, chance: 0.6, dist: 3.4 };

export class Gates {
  constructor(run) {
    this.run = run;
    this.pair = null;
    this.passed = 0;
  }

  /** forcedOps lets scripted moments (tutorials, trailers) choose the two gates; opts.lesson explains a ×N pass. */
  spawnPair(forcedOps = null, opts = {}) {
    if (this.pair) this.despawn(false);
    const run = this.run, P = run.player;
    let dx = P.vx, dz = P.vz;
    const l = Math.hypot(dx, dz);
    if (l < 0.5) { dx = 0; dz = -1; } else { dx /= l; dz /= l; }
    const rx = -dz, rz = dx; // right vector
    const cx = P.x + dx * 10.5, cz = P.z + dz * 10.5;
    // first run: once the legion reaches 10, the next pair is a scripted maths lesson (+5 vs ×2, sides random)
    const lesson = !!opts.lesson || (!forcedOps && run.tutorial && !this.lessonShown && run.legion.count >= 10);
    if (lesson) this.lessonShown = true;
    let ops = forcedOps || (lesson ? (Math.random() < 0.5 ? [{ type: 'add', n: 5 }, { type: 'mul', n: 2 }] : [{ type: 'mul', n: 2 }, { type: 'add', n: 5 }]) : makeOps(run.legion.count, run.time / 60));
    if (run.mut.noBadGates && !forcedOps) ops = ops.map((op) => (isGood(op) ? op : { type: 'add', n: Math.max(5, Math.round((12 + run.time / 60 * 7 + run.legion.count * 0.2) / 5) * 5) })); // Gilded Gates
    const more = run.loadout.hero.passive.gateAdd; // Grimsby: his lamps light the gates brighter (+n gates only)
    if (more && !forcedOps && !lesson) ops = ops.map((op) => (op.type === 'add' ? { type: 'add', n: Math.round(op.n * (1 + more) / 5) * 5 } : op));
    const gates = ops.map((op, i) => {
      const side = i === 0 ? -1 : 1;
      const g = makeGate(label(op), isGood(op), WIDTH);
      const x = cx + rx * side * (WIDTH / 2 + 0.45), z = cz + rz * side * (WIDTH / 2 + 0.45);
      g.position.set(x, -3.5, z);
      g.rotation.y = Math.atan2(-rz, rx);
      run.scene.add(g);
      const lab = g.userData.label;
      g.remove(lab);
      run.scene.add(lab);
      return { g, op, x, z, lab, prev: null, born: 0, lesson };
    });
    this.pair = { gates, nx: dx, nz: dz, rx, rz, t: 0, life: 15, done: false };
    if (!forcedOps && run.time / 60 >= GUARD.fromMinute && Math.random() < GUARD.chance) this.guard(gates, dx, dz);
    run.ui.banner('SOUL GATES', 'Walk through one to reshape your legion', 'soul');
    run.audio.sfx('warning', { volume: 0.4, pitch: 1.6 });
    run.hint('gates', 'Walk through a Soul Gate to grow your legion!');
  }

  /** Plants a Brute squad or a Bloater cluster just in front of the gate with the bigger payoff. */
  guard(gates, dx, dz) {
    const run = this.run, L = run.legion.count;
    const G = gain(gates[0].op, L) >= gain(gates[1].op, L) ? gates[0] : gates[1];
    const x = G.x - dx * GUARD.dist, z = G.z - dz * GUARD.dist;
    const squad = run.time / 60 < 4 || Math.random() < 0.5
      ? ['brute', 'husk', 'husk', 'husk']
      : ['bloater', 'bloater', 'bloater'];
    squad.forEach((t, i) => {
      const a = (i / squad.length) * Math.PI * 2, r = i ? 1.3 : 0;
      run.spawnEnemy(t, { at: { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r } });
    });
  }

  update(dt) {
    const p = this.pair;
    if (!p) return;
    const run = this.run, P = run.player;
    p.t += dt;
    const rise = Math.min(1, p.t / 0.6);
    const fade = p.done ? Math.max(0, 1 - (p.t - p.doneT) / 0.4) : p.t > p.life - 1 ? Math.max(0, p.life - p.t) : 1;
    for (const G of p.gates) {
      G.g.position.y = -3.5 * (1 - (1 - Math.pow(1 - rise, 3)));
      G.g.userData.curtainMat.uniforms.uTime.value = p.t;
      G.g.userData.curtainMat.uniforms.uA.value = fade;
      G.lab.position.set(G.x, G.g.position.y + 4.3 + Math.sin(p.t * 3) * 0.1, G.z);
      G.lab.quaternion.copy(run.camera.quaternion);
      G.lab.material.opacity = fade;
      const s = 1 + (p.done && G.chosen ? (p.t - p.doneT) * 2 : 0);
      G.g.scale.setScalar(s);
      // crossing test in the gate's frame
      if (!p.done && rise >= 1) {
        const lx = (P.x - G.x) * p.rx + (P.z - G.z) * p.rz;
        const lz = (P.x - G.x) * p.nx + (P.z - G.z) * p.nz;
        if (G.prev !== null && Math.sign(lz) !== Math.sign(G.prev) && Math.abs(lx) < WIDTH / 2 + 0.2) this.choose(G);
        G.prev = lz;
      }
    }
    if ((p.done && p.t - p.doneT > 0.4) || p.t > p.life) this.despawn(true);
  }

  choose(G) {
    const run = this.run, p = this.pair, L = run.legion, op = G.op;
    p.done = true; p.doneT = p.t; G.chosen = true;
    this.passed++;
    run.counters.gates++;
    const before = L.count;
    const good = isGood(op);
    if (op.type === 'add') L.addMany(Math.min(op.n, BASE.hardLegionMax - before), G.x, G.z);
    else if (op.type === 'mul') { L.addMany(Math.min(before * (op.n - 1), BASE.hardLegionMax - before), G.x, G.z); run.fx.hitStop(HITSTOP.gate); }
    else run.soulBurst(L.removeMany(-gain(op, before)), before, G.x, G.z); // lost souls detonate: ÷2 doubles as an escape
    const delta = L.count - before;
    run.addNovaCharge(3);
    if (G.lesson && op.type === 'mul' && run.ui) run.ui.hint(`×${op.n} turned ${before} souls into ${L.count}. Multipliers grow with your legion!`);
    run.fx.shockwave(G.x, G.z, 6, good ? 0x4ef2ff : 0xff2e55, 0.5, 0.15);
    run.fx.flash(good ? 0.25 : 0.1);
    if (!good) run.fx.hurt(0.4);
    run.fx.shake(good ? 0.2 : 0.3);
    run.audio.sfx(good ? 'gate_good' : 'gate_bad');
    run.app.haptic(good ? 'success' : 'warning');
    run.ui.bigNumber(`${delta >= 0 ? '+' : '−'}${Math.abs(delta)}`, good ? 'LEGION SURGES' : delta ? 'SOULS DETONATE' : 'SOULS LOST', good);
    run.fx.light(G.x, G.z, 9, 2.2, new THREE.Color(good ? 0x4ef2ff : 0xff2e55), 0.6);
  }

  despawn() {
    const p = this.pair;
    if (!p) return;
    for (const G of p.gates) {
      this.run.scene.remove(G.g); this.run.scene.remove(G.lab);
      disposeGroup(G.g);
      G.lab.geometry.dispose(); if (G.lab.material.map) G.lab.material.map.dispose(); G.lab.material.dispose();
    }
    this.pair = null;
  }

  dispose() { this.despawn(); }
}
