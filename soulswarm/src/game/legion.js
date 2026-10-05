// The Legion: risen soul minions that orbit the Shepherd and hunt the horde.
import * as THREE from 'three';
import { BASE } from './data.js';
import { wispGeometry } from '../engine/models.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _fwd = new THREE.Vector3(0, 0, 1), _dir = new THREE.Vector3();

export class Legion {
  constructor(run) {
    this.run = run;
    this.max = BASE.hardLegionMax;
    this.list = [];
    this.pool = [];
    this.mesh = new THREE.InstancedMesh(wispGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    run.scene.add(this.mesh);
    this.core = new THREE.Color(0x4ef2ff);
    this.coreHdr = [0, 0, 0];
    this.setColor(0x4ef2ff);
    this.t = 0;
    this.slotSeq = 0;
    this.raiseSfxT = 0;
    this.peak = 0;
  }

  setColor(hex) {
    this.core.setHex(hex);
    this.coreHdr = [this.core.r * 3, this.core.g * 3, this.core.b * 3];
  }

  get count() { return this.list.length; }

  /** A slain enemy rises as a minion. */
  raise(x, z, { fx = true, burstY = 0 } = {}) {
    if (this.list.length >= this.max) return null;
    const run = this.run;
    const m = this.pool.pop() || {};
    m.x = x; m.z = z; m.y = burstY; m.vx = 0; m.vz = 0; m.vy = 0;
    m.maxHp = m.hp = run.stats.minionHp;
    m.target = null; m.retarget = Math.random() * 0.3; m.atkCd = 0.2;
    m.born = 0; m.phase = Math.random() * 6.28; m.slot = this.slotSeq++;
    this.list.push(m);
    if (this.list.length > this.peak) this.peak = this.list.length;
    if (fx) {
      const c = this.coreHdr;
      for (let i = 0; i < 6; i++) run.particles.emit(x + (Math.random() - 0.5) * 0.5, 0.1, z + (Math.random() - 0.5) * 0.5, 0, 2.5 + Math.random() * 2.5, 0, 0.55, 0.35, 0.05, c[0], c[1], c[2], 1, 2.5, 0);
      if (this.raiseSfxT <= 0) { run.audio.sfx('raise', { volume: 0.5 }); this.raiseSfxT = 0.09; }
    }
    return m;
  }

  /** Gate bonus: many minions burst out of a point. */
  addMany(n, x, z) {
    const c = this.coreHdr;
    for (let i = 0; i < n; i++) {
      const m = this.raise(x + (Math.random() - 0.5) * 2.5, z + (Math.random() - 0.5) * 1.0, { fx: false, burstY: 1.5 });
      if (!m) break;
      const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 6;
      m.vx = Math.cos(a) * s; m.vz = Math.sin(a) * s; m.vy = 3;
    }
    this.run.particles.burst(x, 1.5, z, 60, c, { speed: 9, life: 0.8, size: 0.4, up: 1 });
  }

  /** Lose minions with a dissolve effect (bad gates, boss slams). */
  removeMany(n) {
    const run = this.run;
    const col = [3, 0.4, 0.6];
    for (let i = 0; i < n && this.list.length; i++) {
      const idx = Math.floor(Math.random() * this.list.length);
      const m = this.list[idx];
      run.particles.burst(m.x, m.y, m.z, 4, col, { speed: 3, life: 0.5, size: 0.3 });
      this.list[idx] = this.list[this.list.length - 1];
      this.list.pop();
      this.pool.push(m);
    }
  }

  damageArea(x, z, r, dmg) {
    for (const m of this.list) {
      if ((m.x - x) ** 2 + (m.z - z) ** 2 < r * r) m.hp -= dmg;
    }
  }

  /** Detach every minion for Soul Nova. Returns their positions. */
  detonateAll() {
    const out = this.list.map((m) => ({ x: m.x, y: m.y, z: m.z }));
    for (const m of this.list) this.pool.push(m);
    this.list.length = 0;
    return out;
  }

  update(dt) {
    this.t += dt;
    this.raiseSfxT -= dt;
    const run = this.run, P = run.player, S = run.stats, E = run.enemies;
    const leash = BASE.minionLeash;
    const maxSpeed = S.minionSpeed;
    const list = this.list;
    const n = list.length;
    let alive = 0;
    const trailP = dt * 10 * run.particles.budget;
    const c = this.coreHdr;
    for (let i = 0; i < n; i++) {
      const m = list[i];
      if (m.hp <= 0) {
        run.particles.burst(m.x, m.y, m.z, 5, [2.5, 2.5, 2.8], { speed: 3, life: 0.4, size: 0.3 });
        this.pool.push(m);
        continue;
      }
      list[alive++] = m;
      m.born += dt;
      m.atkCd -= dt;
      m.retarget -= dt;

      // keep a target only while it stays inside the leash around the Shepherd
      if (m.target && (!m.target.active || (m.target.x - P.x) ** 2 + (m.target.z - P.z) ** 2 > (leash + 3) ** 2)) m.target = null;
      if (m.retarget <= 0) {
        m.retarget = 0.25 + Math.random() * 0.2;
        if (!m.target) {
          m.target = E.nearest(m.x, m.z, 6.5, (e) => (e.x - P.x) ** 2 + (e.z - P.z) ** 2 > leash * leash);
        }
      }

      let tx, tz, desiredSpeed;
      const tg = m.target;
      if (tg) {
        tx = tg.x; tz = tg.z; desiredSpeed = maxSpeed;
      } else {
        const ring = Math.floor((m.slot % 60) / 12);
        const k = m.slot % 12;
        const dir = ring % 2 ? -1 : 1;
        const ang = (k / 12) * Math.PI * 2 + ring * 0.26 + this.t * (1.1 - ring * 0.12) * dir;
        const rad = 1.7 + ring * 0.75 + Math.sin(this.t * 2 + m.phase) * 0.2;
        tx = P.x + Math.cos(ang) * rad; tz = P.z + Math.sin(ang) * rad;
        desiredSpeed = maxSpeed * 1.15;
      }
      let dx = tx - m.x, dz = tz - m.z;
      const d = Math.hypot(dx, dz) || 0.001;
      const arrive = tg ? 1 : Math.min(1, d / 1.2);
      const dvx = (dx / d) * desiredSpeed * arrive - m.vx, dvz = (dz / d) * desiredSpeed * arrive - m.vz;
      const acc = Math.min(1, dt * 7);
      m.vx += dvx * acc; m.vz += dvz * acc;
      m.x += m.vx * dt; m.z += m.vz * dt;
      // vertical: rise from the grave, then hover
      const hover = 0.95 + Math.sin(this.t * 3 + m.phase) * 0.15;
      m.vy += (hover - m.y) * dt * 12 - m.vy * dt * 5;
      m.y += m.vy * dt;

      // strike on contact
      if (tg && d < tg.radius + 0.4 && m.atkCd <= 0) {
        m.atkCd = 0.5;
        const dmg = S.minionDmg * (0.85 + Math.random() * 0.3);
        E.damage(tg, dmg, { source: 'minion', kx: m.vx, kz: m.vz, knock: 1.2 });
        m.hp -= (tg.dmg || 8) * (tg.type === 'boss' ? 0.5 : 0.3);
        m.vx *= -0.6; m.vz *= -0.6;
        run.particles.burst(m.x, m.y, m.z, 2, c, { speed: 3, life: 0.25, size: 0.25 });
      }
      if (Math.random() < trailP) {
        run.particles.emit(m.x, m.y, m.z, -m.vx * 0.15, 0.2, -m.vz * 0.15, 0.35, 0.3, 0.02, c[0] * 0.7, c[1] * 0.7, c[2] * 0.7, 0.9, 1, 0);
      }
    }
    // minions raised by kills during this loop were appended past n; keep them
    for (let j = n; j < list.length; j++) list[alive++] = list[j];
    list.length = alive;
  }

  render() {
    const list = this.list, g = this.run.glow, c = this.core;
    let i = 0;
    for (const m of list) {
      const sp = Math.hypot(m.vx, m.vz);
      _dir.set(m.vx, 0, m.vz);
      if (sp > 0.01) _q.setFromUnitVectors(_fwd, _dir.normalize()); else _q.identity();
      const born = Math.min(1, m.born * 3);
      const sc = 0.8 + 0.3 * Math.sin(this.t * 6 + m.phase);
      _s.set(sc * born, sc * born, sc * born * (1 + Math.min(1.5, sp * 0.12)));
      _p.set(m.x, m.y, m.z);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      const hurt = m.hp / m.maxHp;
      this.mesh.instanceColor.setXYZ(i, (c.r * 2.2 + (1 - hurt) * 2) , c.g * 2.6 * (0.5 + hurt * 0.5), c.b * 2.8);
      g.add(m.x, m.y, m.z, 0.62, c.r * 0.8, c.g * 0.8, c.b * 0.8, 0.42);
      i++;
    }
    this.mesh.count = i;
    if (i) { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
  }

  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
