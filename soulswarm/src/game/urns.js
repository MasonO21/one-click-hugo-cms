// Soul Urns (URNS and OFFERINGS in data.js; GDD §4.10): funerary urns rise around the map; the Shepherd smashes one by
// walking into it and it spills an offering (a pickup in pickups.js; collecting one of the new kinds calls offer()).
import * as THREE from 'three';
import { URNS, OFFERINGS } from './data.js';
import { urnGeometry } from '../engine/models.js';
import { makeCharMaterial, addInstanceAttrs } from '../engine/materials.js';
import { hdr } from '../engine/particles.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const LOOT = Object.entries(URNS.loot), LOOT_W = LOOT.reduce((a, [, w]) => a + w, 0);
const COLS = { knell: 0xd8b6ff, frost: 0x9fe6ff, lantern: 0x7ff8ff, gold: 0xffd04a, horn: 0xfff0d2 };

export class Urns {
  constructor(run) {
    this.run = run;
    this.list = [];
    this.t = URNS.first;
    this.mat = makeCharMaterial({ rim: 0x7ff8ff, emit: 3, anim: 0 });
    this.mesh = new THREE.InstancedMesh(urnGeometry(), this.mat, URNS.max + 1);
    addInstanceAttrs(this.mesh, URNS.max + 1);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    run.scene.add(this.mesh);
    this.glow = hdr(0x7ff8ff, 2.4); this.shard = hdr(0xc8bca2, 1.4);
    this.knellCol = new THREE.Color(COLS.knell); this.frostCol = new THREE.Color(COLS.frost);
  }

  update(dt) {
    const run = this.run, P = run.player, L = this.list;
    if (run.guide) return; // the tutorial teaches other things
    if ((this.t -= dt) <= 0) { this.t = URNS.every * (0.75 + Math.random() * 0.5); if (L.length < URNS.max) this.spawn(); }
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const u = L[i];
      u.t += dt;
      const d2 = (u.x - P.x) ** 2 + (u.z - P.z) ** 2;
      if (!P.dead && d2 < URNS.touch * URNS.touch) { this.smash(u); continue; }
      if (d2 > URNS.far * URNS.far) continue; // left behind: it crumbles unseen
      L[w++] = u;
    }
    L.length = w;
    const U = this.mat.uniforms; U.uTime.value += dt;
    U.uPLPos.value.set(P.x, 1.6, P.z); U.uPLColor.value.copy(run.heroColorObj).multiplyScalar(0.45);
  }

  /** A spot `dist` m out, ahead of the Shepherd first, clear of hazards, the gates and the other urns. */
  spawn(at = null) {
    const run = this.run, P = run.player, G = run.gates.pair;
    let p = at;
    if (!p) {
      const base = Math.hypot(P.vx, P.vz) > 0.5 ? Math.atan2(P.vz, P.vx) : Math.random() * Math.PI * 2;
      for (let k = 0; k < 32 && !p; k++) {
        const a = k < 12 ? base + (Math.random() - 0.5) * 2.4 : Math.random() * Math.PI * 2;
        const r = URNS.dist[0] + Math.random() * (URNS.dist[1] - URNS.dist[0]), x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
        if (!run.hazards.isClear(x, z, 1.6)) continue;
        if (G && G.gates.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < 25)) continue;
        if (this.list.some((u) => (u.x - x) ** 2 + (u.z - z) ** 2 < 36)) continue;
        p = { x, z };
      }
    }
    if (!p) return null;
    const u = { x: p.x, z: p.z, t: 0, rot: Math.random() * 6.28 };
    this.list.push(u);
    return u;
  }

  smash(u) {
    const run = this.run;
    run.particles.burst(u.x, 0.6, u.z, 16, this.shard, { speed: 5, life: 0.5, size: 0.35, up: 2.5 });
    run.particles.burst(u.x, 0.8, u.z, 12, this.glow, { speed: 3, life: 0.6, size: 0.4, up: 3 });
    run.fx.light(u.x, u.z, 4, 1.2, run.heroColorObj, 0.3);
    run.audio.sfx('hit', { volume: 0.6, pitch: 0.7 }); run.audio.sfx('coin', { volume: 0.4, pitch: 0.8 });
    run.app && run.app.haptic && run.app.haptic('light');
    run.counters.urns++;
    run.pickups.dropSpecial(this.roll(), u.x, u.z);
  }

  /** One offering by URNS.loot weight. */
  roll() {
    let r = Math.random() * LOOT_W;
    for (const [k, w] of LOOT) { r -= w; if (r <= 0) return k; }
    return LOOT[0][0];
  }

  /** The Shepherd takes an offering (pickups.js collect, for the kinds it does not handle itself). */
  offer(kind) {
    const run = this.run, P = run.player, E = run.enemies, O = OFFERINGS[kind];
    if (!O) return;
    run.fx.text(P.x, 2.6, P.z, O.name.toUpperCase(), 'big');
    if (kind === 'knell') {
      let n = 0;
      E.query(P.x, P.z, O.r, (e) => {
        if (e.ev) return; // the Soul Thief and a Cursed Coffin keep their own rules
        const f = e.type === 'boss' ? O.bossFrac : e.elite ? O.eliteFrac : O.frac;
        E.damage(e, e.maxHp * f, { kx: e.x - P.x, kz: e.z - P.z, knock: 6, source: 'knell', silent: n++ > 8 });
      });
      run.fx.shockwave(P.x, P.z, O.r, COLS.knell, 0.6, 0.12); run.fx.flash(0.12); run.fx.shake(0.25);
      run.fx.light(P.x, P.z, O.r, 1.6, this.knellCol, 0.5);
      run.audio.sfx('explosion', { volume: 0.6, pitch: 0.6 });
    } else if (kind === 'frost') {
      E.query(P.x, P.z, O.r, (e) => { E.stun(e, O.stun); if (!e.ev) e.flash = Math.max(e.flash, 0.6); });
      run.fx.shockwave(P.x, P.z, O.r, COLS.frost, 0.6, 0.08);
      run.particles.ring(P.x, P.z, O.r * 0.6, 40, hdr(COLS.frost, 2.6), { life: 0.7, size: 0.5, y: 0.4 });
      run.audio.sfx('ward_break', { volume: 0.6 });
    } else if (kind === 'lantern') run.events.grant('feast', O.dur, O.name, O.icon); // the Soul Feast blessing: double XP
    else if (kind === 'gold') { run.bonusGold += O.gold; run.audio.sfx('coin'); run.fx.text(P.x, 2.1, P.z, `+${O.gold}`, 'gold'); }
    else if (kind === 'horn') {
      let n = 0;
      for (let i = 0; i < O.n && run.legion.count < run.stats.cap; i++, n++) { const a = (i / O.n) * 6.283; run.legion.raise(P.x + Math.cos(a) * 1.6, P.z + Math.sin(a) * 1.6, { burstY: -0.6 }); }
      run.counters.raised += n;
      run.audio.sfx('raise', { volume: 0.6 });
    }
    run.app && run.app.haptic && run.app.haptic('medium');
  }

  render(g) {
    const L = this.list, t = this.run.t, c = this.glow;
    for (let i = 0; i < L.length; i++) {
      const u = L[i], rise = Math.min(1, u.t / 0.6), k = 1.15 * (0.6 + 0.4 * rise);
      _e.set(0, u.rot + t * 0.3, 0); _q.setFromEuler(_e);
      _p.set(u.x, -0.6 * (1 - rise), u.z); _s.set(k, k, k);
      _m.compose(_p, _q, _s); this.mesh.setMatrixAt(i, _m);
      const f = 0.6 + 0.4 * Math.sin(t * 3 + i * 2);
      g.add(u.x, 0.7, u.z, 2.2 * f, c[0] * 0.18, c[1] * 0.18, c[2] * 0.18, 0.85); // a beacon: urns read from afar
      g.add(u.x, 2.6 + Math.sin(t * 2 + i) * 0.2, u.z, 0.6, c[0] * 0.35, c[1] * 0.35, c[2] * 0.35, 0.9);
    }
    this.mesh.count = L.length;
    if (L.length) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); }
}
