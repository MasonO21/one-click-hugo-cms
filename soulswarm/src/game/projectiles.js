// Player projectiles (homing soul bolts, piercing bone spears) and enemy ember orbs.
import * as THREE from 'three';
import { boltGeometry, spearGeometry, orbGeometry } from '../engine/models.js';
import { hdr } from '../engine/particles.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _fwd = new THREE.Vector3(0, 0, 1), _dir = new THREE.Vector3(), _sc = new THREE.Vector3();
const ORB_MAX = 320; // ember orb instances (witch shots + Gravemaw's patterns)

function instanced(geo, max, color) {
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color }), max);
  mesh.count = 0; mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

export class Projectiles {
  constructor(run) {
    this.run = run;
    this.shots = [];
    this.embers = [];
    this.bolts = instanced(boltGeometry(), 240, new THREE.Color(0x9ff8ff).multiplyScalar(3));
    this.spears = instanced(spearGeometry(), 90, new THREE.Color(0xf2ffe8).multiplyScalar(2.4));
    this.orbs = instanced(orbGeometry(), ORB_MAX, new THREE.Color(0xffffff));
    this.orbCol = new THREE.Color(0xff8a3d).multiplyScalar(3.2); // per-instance colour: ember by default, boss orbs bring their own
    this.orbs.setColorAt(0, this.orbCol); this.orbs.instanceColor.setUsage(THREE.DynamicDrawUsage);
    run.scene.add(this.bolts, this.spears, this.orbs);
    this.boltCol = hdr(0x4ef2ff, 3);
    this.spearCol = hdr(0x9dffb8, 2.5);
    this.emberCol = hdr(0xff6a2a, 3.5);
  }

  setBoltColor(hex) {
    this.boltCol = hdr(hex, 3);
    this.bolts.material.color.setHex(hex).lerp(new THREE.Color(0xffffff), 0.5).multiplyScalar(3);
  }

  bolt(x, z, target, dmg, pierce, o = {}) {
    if (this.shots.length > 400) return;
    let dx = 0, dz = 1;
    if (target) { dx = target.x - x; dz = target.z - z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
    const spread = o.spread || 0;
    if (spread) { const a = Math.atan2(dz, dx) + spread; dx = Math.cos(a); dz = Math.sin(a); }
    const speed = o.speed || 17;
    this.shots.push({ kind: 'bolt', x, z, y: 1.1, vx: dx * speed, vz: dz * speed, speed, target, tuid: target ? target.uid : 0, dmg, pierce, life: 1.4, hit: new Set(), explode: o.explode || 0, crit: o.crit });
  }

  spear(x, z, dx, dz, dmg, pierce, crit) {
    const speed = 21;
    this.shots.push({ kind: 'spear', x, z, y: 1.0, vx: dx * speed, vz: dz * speed, speed, target: null, dmg, pierce, life: 0.95, hit: new Set(), crit });
  }

  enemyShot(x, z, dx, dz, speed, dmg) {
    if (this.embers.length > 150) return;
    this.embers.push({ x, z, y: 1.0, vx: dx * speed, vz: dz * speed, dmg, life: 3.2 });
    this.run.audio.sfx('shoot', { volume: 0.25, pitch: 0.6 });
  }

  /** Embers in a ring (boss attack). */
  emberRing(x, z, n, speed, dmg, offset = 0) {
    for (let i = 0; i < n; i++) {
      const a = offset + (i / n) * Math.PI * 2;
      this.embers.push({ x: x + Math.cos(a) * 1.6, z: z + Math.sin(a) * 1.6, y: 1.4, vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, dmg, life: 4 });
    }
  }

  update(dt) {
    const run = this.run, E = run.enemies, P = run.player, parts = run.particles;
    const shots = this.shots;
    let w = 0;
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      s.life -= dt;
      if (s.kind === 'bolt') {
        if (!s.target || !s.target.active || s.target.uid !== s.tuid) {
          s.target = E.nearest(s.x, s.z, 8, (e) => s.hit.has(e.uid));
          s.tuid = s.target ? s.target.uid : 0;
        }
        if (s.target) {
          const dx = s.target.x - s.x, dz = s.target.z - s.z, l = Math.hypot(dx, dz) || 1;
          const turn = Math.min(1, dt * 9);
          s.vx += ((dx / l) * s.speed - s.vx) * turn;
          s.vz += ((dz / l) * s.speed - s.vz) * turn;
        }
        if (Math.random() < 0.9) parts.emit(s.x, s.y, s.z, 0, 0, 0, 0.22, 0.32, 0.05, this.boltCol[0], this.boltCol[1], this.boltCol[2], 0.9);
      } else if (Math.random() < 0.7) {
        parts.emit(s.x, s.y, s.z, 0, 0.2, 0, 0.25, 0.28, 0.04, this.spearCol[0], this.spearCol[1], this.spearCol[2], 0.7);
      }
      s.x += s.vx * dt; s.z += s.vz * dt;
      let dead = s.life <= 0;
      if (!dead) {
        E.query(s.x, s.z, s.kind === 'spear' ? 0.45 : 0.3, (e) => {
          if (s.hit.has(e.uid)) return;
          s.hit.add(e.uid);
          const killed = E.damage(e, s.dmg, { kx: s.vx, kz: s.vz, knock: s.kind === 'spear' ? 5 : 2.2, crit: s.crit, source: s.kind });
          parts.burst(s.x, s.y, s.z, 5, s.kind === 'spear' ? this.spearCol : this.boltCol, { speed: 4, life: 0.25, size: 0.3 });
          if (!killed) run.audio.sfx('hit', { volume: 0.4 });
          if (s.explode) {
            run.fx.shockwave(s.x, s.z, s.explode, 0x4ef2ff, 0.25, 0.2);
            E.query(s.x, s.z, s.explode, (o) => { if (o !== e) E.damage(o, s.dmg * 0.6, { kx: o.x - s.x, kz: o.z - s.z, knock: 3, source: 'bolt', silent: Math.random() < 0.5 }); });
          }
          s.pierce -= 1;
          if (s.pierce < 0) { dead = true; return false; }
          s.target = null;
        });
      }
      if (!dead) shots[w++] = s;
    }
    shots.length = w;

    const em = this.embers;
    w = 0;
    for (let i = 0; i < em.length; i++) {
      const s = em[i];
      s.life -= dt;
      s.x += s.vx * dt; s.z += s.vz * dt;
      const ec = s.glow || this.emberCol;
      if (Math.random() < 0.6) parts.emit(s.x, s.y, s.z, 0, 0.4, 0, 0.3, 0.35, 0.05, ec[0], ec[1], ec[2], 0.8);
      let dead = s.life <= 0;
      if (!dead && (s.x - P.x) ** 2 + (s.z - P.z) ** 2 < (P.radius + (s.hr || 0.25)) ** 2) {
        P.hurt(s.dmg); dead = true;
        parts.burst(s.x, s.y, s.z, 10, ec, { speed: 4, life: 0.3, size: 0.35 });
      }
      if (!dead) em[w++] = s;
    }
    em.length = w;
  }

  render() {
    const g = this.run.glow;
    let nb = 0, ns = 0;
    for (const s of this.shots) {
      _dir.set(s.vx, 0, s.vz).normalize();
      _q.setFromUnitVectors(_fwd, _dir);
      _p.set(s.x, s.y, s.z);
      _m.compose(_p, _q, _s);
      if (s.kind === 'bolt') { if (nb < 240) this.bolts.setMatrixAt(nb++, _m); g.add(s.x, s.y, s.z, 0.9, this.boltCol[0] * 0.5, this.boltCol[1] * 0.5, this.boltCol[2] * 0.5, 0.8); }
      else { if (ns < 90) this.spears.setMatrixAt(ns++, _m); g.add(s.x, s.y, s.z, 0.8, this.spearCol[0] * 0.4, this.spearCol[1] * 0.4, this.spearCol[2] * 0.4, 0.7); }
    }
    let no = 0;
    _q.identity();
    for (const s of this.embers) {
      _p.set(s.x, s.y, s.z);
      _m.compose(_p, _q, s.sc ? _sc.setScalar(s.sc) : _s);
      if (no < ORB_MAX) { this.orbs.setMatrixAt(no, _m); this.orbs.setColorAt(no, s.col || this.orbCol); no++; }
      const ec = s.glow || this.emberCol, gs = s.sc || 1;
      g.add(s.x, s.y, s.z, 1.3 * gs, ec[0] * 0.45, ec[1] * 0.45, ec[2] * 0.45, 0.9);
    }
    this.bolts.count = nb; this.spears.count = ns; this.orbs.count = no;
    this.bolts.instanceMatrix.needsUpdate = true; this.spears.instanceMatrix.needsUpdate = true; this.orbs.instanceMatrix.needsUpdate = true; this.orbs.instanceColor.needsUpdate = true;
  }

  clearEnemyShots() { this.embers.length = 0; this.clearLobs(); }

  // ---------------------------------------------------------------- Gravemaw bullet patterns (boss.js)
  // Boss orbs ride the ember pool (same update, collision and instancing) with their own colour, size and hitbox.
  /** One boss orb leaving (x, z) along angle a. o: { col: THREE.Color, glow: [r,g,b], sc, hr, life, r0 } */
  bossOrb(x, z, a, speed, dmg, o) {
    if (this.embers.length >= ORB_MAX) return null;
    const c = Math.cos(a), s = Math.sin(a), r0 = o.r0 ?? 1.6;
    const b = { x: x + c * r0, z: z + s * r0, y: 1.4, vx: c * speed, vz: s * speed, dmg, life: o.life || 4, col: o.col, glow: o.glow, sc: o.sc || 1.35, hr: o.hr || 0.22, boss: true };
    this.embers.push(b);
    return b;
  }

  /** A ring of n orbs with `gaps` evenly spaced holes of `gapSlots` missing orbs each. a0 is the centre angle of the first hole. */
  emberRingGaps(x, z, n, gaps, gapSlots, a0, speed, dmg, o = {}) {
    const per = Math.round(n / gaps) + gapSlots, step = (Math.PI * 2) / (per * gaps);
    for (let j = 0; j < gaps; j++) {
      const start = a0 + (j * Math.PI * 2) / gaps - (gapSlots * step) / 2;
      for (let k = gapSlots; k < per; k++) this.bossOrb(x, z, start + (k + 0.5) * step, speed, dmg, o);
    }
  }

  /** One beat of a spiral stream: an orb down each of `arms` arms, the first at angle a. */
  spiral(x, z, arms, a, speed, dmg, o = {}) {
    for (let k = 0; k < arms; k++) this.bossOrb(x, z, a + (k * Math.PI * 2) / arms, speed, dmg, o);
  }

  /** The sealed arena swallows boss orbs that reach its wall. Returns how many it ate (sparks are the caller's). */
  cullBossOrbs(cx, cz, R, onCull) {
    let n = 0;
    const R2 = R * R;
    for (const s of this.embers) {
      if (!s.boss || s.life <= 0 || (s.x - cx) ** 2 + (s.z - cz) ** 2 < R2) continue;
      s.life = 0; n++;
      if (onCull) onCull(s.x, s.z);
    }
    return n;
  }

  dispose() {
    for (const m of [this.bolts, this.spears, this.orbs]) { m.geometry.dispose(); m.material.dispose(); }
  }

  // ---------------------------------------------------------------- Cinder Witch lobs (horde behaviours)
  // Arcing ember orbs that land on a telegraphed circle. Self-contained: Run calls initLobs() at setup and
  // disposeLobs() on dispose, Enemies drives updateLobs()/renderLobs() each frame, and clearLobs() empties the sky.
  initLobs() {
    this.lobs = [];
    this.lobPool = [];
    this.lobMesh = instanced(orbGeometry(), 64, new THREE.Color(0xffc070).multiplyScalar(3.4));
    this.run.scene.add(this.lobMesh);
    this.lobCol = hdr(0xff7a2a, 3.6);
    this.lobHot = hdr(0xffd08a, 3.2);
    this.lobTele = new THREE.Color(0xff7a2e);
    this.lobLight = new THREE.Color(0xff7a2e);
    this.lobScale = new THREE.Vector3(1.7, 1.7, 1.7);
  }

  /** Lob an orb from (x, z) onto (tx, tz). spec = ENEMIES.witch.lob {flight, radius, height}; burn leaves burning ground. */
  lob(x, z, tx, tz, dmg, spec, burn) {
    if (!this.lobs || this.lobs.length >= 64) return null;
    const L = this.lobPool.pop() || {};
    L.x0 = x; L.z0 = z; L.tx = tx; L.tz = tz; L.x = x; L.y = 1.6; L.z = z; L.t = 0; L.fresh = true;
    L.flight = spec.flight; L.r = spec.radius; L.h = spec.height; L.dmg = dmg; L.burn = !!burn;
    this.lobs.push(L);
    this.run.hazards.circle(tx, tz, L.r, L.flight, this.lobTele, 1.8); // plus a ring closing in as the orb falls
    this.run.audio.sfx('lob', { volume: 0.8 });
    return L;
  }

  updateLobs(dt) {
    if (!this.lobs) return;
    const parts = this.run.particles, c = this.lobCol, lobs = this.lobs;
    let w = 0;
    for (let i = 0; i < lobs.length; i++) {
      const L = lobs[i];
      if (L.fresh) L.fresh = false; else L.t += dt; // the throw frame doesn't count: the telegraph shows for the full flight
      const u = L.t >= L.flight - 1e-6 ? 1 : L.t / L.flight;
      L.x = L.x0 + (L.tx - L.x0) * u; L.z = L.z0 + (L.tz - L.z0) * u;
      L.y = 1.6 * (1 - u) + 0.25 * u + 4 * L.h * u * (1 - u);
      if (Math.random() < 0.85) parts.emit(L.x, L.y, L.z, 0, 0.3, 0, 0.4, 0.45, 0.05, c[0], c[1], c[2], 0.85);
      if (u < 1) { lobs[w++] = L; continue; }
      this.landLob(L);
      this.lobPool.push(L);
    }
    lobs.length = w;
  }

  /** Area damage where the orb lands: the Shepherd and minions inside the circle; burning ground from Ch2. */
  landLob(L) {
    const run = this.run, P = run.player, x = L.tx, z = L.tz;
    if ((P.x - x) ** 2 + (P.z - z) ** 2 < (L.r + P.radius) ** 2) P.hurt(L.dmg);
    run.legion.damageArea(x, z, L.r, L.dmg);
    if (L.burn) run.hazards.burn(x, z, L.r, L.dmg);
    run.particles.burst(x, 0.4, z, 26, this.lobCol, { speed: 5, life: 0.5, size: 0.55, up: 0.9 });
    run.particles.burst(x, 0.3, z, 8, this.lobHot, { speed: 2, life: 0.35, size: 0.9, up: 0.4 });
    run.fx.shockwave(x, z, L.r * 1.25, 0xff7a2e, 0.3, 0.2);
    run.fx.light(x, z, 3.5, 1.4, this.lobLight, 0.35);
    if ((P.x - x) ** 2 + (P.z - z) ** 2 < 200) run.audio.sfx('lob_land', { volume: 0.45 });
  }

  renderLobs() {
    if (!this.lobs) return;
    const g = this.run.glow, c = this.lobCol, m = this.lobMesh;
    let n = 0;
    _q.identity();
    for (const L of this.lobs) {
      _p.set(L.x, L.y, L.z);
      _m.compose(_p, _q, this.lobScale);
      if (n < 64) m.setMatrixAt(n++, _m);
      g.add(L.x, L.y, L.z, 2.0, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 0.95);
    }
    m.count = n;
    if (n) m.instanceMatrix.needsUpdate = true;
  }

  clearLobs() { if (this.lobs) { for (const L of this.lobs) this.lobPool.push(L); this.lobs.length = 0; } }

  disposeLobs() { if (this.lobMesh) { this.lobMesh.geometry.dispose(); this.lobMesh.material.dispose(); } }
}
