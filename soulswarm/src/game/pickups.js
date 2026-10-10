// Soul shards (XP), hearts, magnets, relic chests and the Soul Urns' offerings (urns.js offer()).
import * as THREE from 'three';
import { gemGeometry } from '../engine/models.js';

const MAX_GEMS = 420, MAX_SPECIAL = 24;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const GEM_COL = [new THREE.Color(0.25, 2.6, 2.2), new THREE.Color(0.6, 1.4, 3.2), new THREE.Color(2.4, 0.7, 3.4)];
const SPECIAL = {
  heart: { col: new THREE.Color(3.2, 0.5, 0.7), glow: [1.6, 0.25, 0.35] },
  magnet: { col: new THREE.Color(0.6, 1.2, 3.4), glow: [0.3, 0.6, 1.7] },
  chest: { col: new THREE.Color(3.2, 2.2, 0.6), glow: [1.6, 1.1, 0.3] },
  // the Soul Urns' offerings (OFFERINGS in data.js)
  knell: { col: new THREE.Color(2.8, 2.2, 3.4), glow: [1.4, 1.0, 1.8] },
  frost: { col: new THREE.Color(1.6, 2.8, 3.4), glow: [0.7, 1.4, 1.8] },
  lantern: { col: new THREE.Color(0.8, 3.2, 3.2), glow: [0.35, 1.6, 1.6] },
  gold: { col: new THREE.Color(3.4, 2.6, 0.7), glow: [1.8, 1.3, 0.3] },
  horn: { col: new THREE.Color(3.0, 2.9, 2.5), glow: [1.3, 1.25, 1.05] },
};

export class Pickups {
  constructor(run) {
    this.run = run;
    this.gems = [];
    this.special = [];
    this.gemMesh = new THREE.InstancedMesh(gemGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_GEMS);
    this.gemMesh.setColorAt(0, GEM_COL[0]);
    this.gemMesh.count = 0; this.gemMesh.frustumCulled = false;
    this.specialMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.32, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_SPECIAL);
    this.specialMesh.setColorAt(0, SPECIAL.heart.col);
    this.specialMesh.count = 0; this.specialMesh.frustumCulled = false;
    run.scene.add(this.gemMesh, this.specialMesh);
    this.t = 0;
    this.combo = 0; this.comboT = 0;
  }

  /** Returns the gem (or the one it merged into). */
  dropGem(x, z, value) {
    if (this.gems.length >= MAX_GEMS - 4) {
      // merge into the nearest gem so the field never overflows
      let best = null, bd = 9;
      for (const g of this.gems) { const d = (g.x - x) ** 2 + (g.z - z) ** 2; if (d < bd) { bd = d; best = g; } }
      if (best) { best.value += value; best.tier = best.value >= 10 ? 2 : best.value >= 3 ? 1 : 0; return best; }
      this.gems.shift();
    }
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2;
    const g = { x, z, y: 0.6, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 4, value, tier: value >= 10 ? 2 : value >= 3 ? 1 : 0, pulled: false, ph: Math.random() * 6 };
    this.gems.push(g);
    return g;
  }

  dropSpecial(kind, x, z) {
    if (this.special.length >= MAX_SPECIAL) return;
    this.special.push({ kind, x, z, y: 0.8, vy: 5, vx: 0, vz: 0, pulled: false, t: 0 });
  }

  magnetAll() { for (const g of this.gems) g.pulled = true; }

  /** Pull the shards within r of (x, z) to the Shepherd (Requiem). Returns how many started flying. */
  magnetNear(x, z, r) {
    let n = 0;
    for (const g of this.gems) if (!g.pulled && (g.x - x) ** 2 + (g.z - z) ** 2 < r * r) { g.pulled = true; n++; }
    return n;
  }

  update(dt) {
    this.t += dt;
    const run = this.run, P = run.player, R = run.stats.pickup;
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;
    const gems = this.gems;
    let w = 0;
    for (let i = 0; i < gems.length; i++) {
      const g = gems[i];
      // pop out, then settle
      g.vy -= 18 * dt; g.y = Math.max(0.45, g.y + g.vy * dt);
      if (g.y <= 0.45) g.vy = 0;
      const dx = P.x - g.x, dz = P.z - g.z, d = Math.hypot(dx, dz);
      if (!g.pulled && d < R) g.pulled = true;
      if (g.pulled) {
        const sp = Math.max(9, 26 - d);
        g.vx += ((dx / d) * sp - g.vx) * Math.min(1, dt * 10);
        g.vz += ((dz / d) * sp - g.vz) * Math.min(1, dt * 10);
      } else { g.vx *= Math.exp(-5 * dt); g.vz *= Math.exp(-5 * dt); }
      g.x += g.vx * dt; g.z += g.vz * dt;
      if (d < 0.6 && !P.dead) {
        run.addXp(g.value);
        this.combo++; this.comboT = 0.45;
        run.audio.sfx('gem', { volume: 0.4, pitch: 1 + Math.min(1.2, this.combo * 0.025) });
        continue;
      }
      if (d > 48) continue; // left far behind
      gems[w++] = g;
    }
    gems.length = w;

    const sp = this.special;
    w = 0;
    for (let i = 0; i < sp.length; i++) {
      const o = sp[i];
      o.t += dt;
      o.vy -= 18 * dt; o.y = Math.max(0.7, o.y + o.vy * dt);
      if (o.y <= 0.7) o.vy = 0;
      const dx = P.x - o.x, dz = P.z - o.z, d = Math.hypot(dx, dz);
      if (!o.pulled && d < R * 0.8) o.pulled = true;
      if (o.pulled) { o.x += (dx / d) * 14 * dt; o.z += (dz / d) * 14 * dt; }
      if (d < 0.8 && !P.dead) { this.collect(o); continue; }
      if (o.t > 40 || d > 50) continue;
      sp[w++] = o;
    }
    sp.length = w;
  }

  collect(o) {
    const run = this.run;
    if (o.kind === 'heart') run.player.heal(run.player.maxHp * 0.3);
    else if (o.kind === 'magnet') { this.magnetAll(); run.audio.sfx('coin'); run.fx.text(run.player.x, 2.4, run.player.z, 'MAGNET!', 'gold'); }
    else if (o.kind === 'chest') run.openChest();
    else if (run.urns) run.urns.offer(o.kind); // a Soul Urn's offering
  }

  render() {
    const g = this.run.glow;
    let i = 0;
    for (const o of this.gems) {
      _e.set(0, this.t * 2 + o.ph, 0);
      _q.setFromEuler(_e);
      const sc = o.tier === 2 ? 1.7 : o.tier === 1 ? 1.25 : 0.95;
      _s.set(sc, sc, sc);
      _p.set(o.x, o.y + Math.sin(this.t * 3 + o.ph) * 0.08, o.z);
      _m.compose(_p, _q, _s);
      this.gemMesh.setMatrixAt(i, _m);
      const c = GEM_COL[o.tier];
      this.gemMesh.setColorAt(i, c);
      if (o.tier > 0 || i % 2 === 0) g.add(o.x, o.y, o.z, 0.5 * sc, c.r * 0.3, c.g * 0.3, c.b * 0.3, 0.7);
      i++;
    }
    this.gemMesh.count = i;
    if (i) { this.gemMesh.instanceMatrix.needsUpdate = true; this.gemMesh.instanceColor.needsUpdate = true; }
    i = 0;
    for (const o of this.special) {
      _e.set(0.4, this.t * 2.5, 0);
      _q.setFromEuler(_e);
      const pulse = 1 + Math.sin(this.t * 6) * 0.1;
      _s.set(pulse, pulse, pulse);
      _p.set(o.x, o.y + Math.sin(this.t * 3) * 0.12, o.z);
      _m.compose(_p, _q, _s);
      this.specialMesh.setMatrixAt(i, _m);
      const S = SPECIAL[o.kind];
      this.specialMesh.setColorAt(i, S.col);
      g.add(o.x, o.y, o.z, 2.2, S.glow[0], S.glow[1], S.glow[2], 0.9);
      i++;
    }
    this.specialMesh.count = i;
    if (i) { this.specialMesh.instanceMatrix.needsUpdate = true; this.specialMesh.instanceColor.needsUpdate = true; }
  }

  dispose() {
    for (const m of [this.gemMesh, this.specialMesh]) { m.geometry.dispose(); m.material.dispose(); }
  }
}
