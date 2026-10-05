// Player projectiles (homing soul bolts, piercing bone spears) and enemy ember orbs.
import * as THREE from 'three';
import { boltGeometry, spearGeometry, orbGeometry } from '../engine/models.js';
import { hdr } from '../engine/particles.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _fwd = new THREE.Vector3(0, 0, 1), _dir = new THREE.Vector3();

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
    this.orbs = instanced(orbGeometry(), 160, new THREE.Color(0xff8a3d).multiplyScalar(3.2));
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
      if (Math.random() < 0.6) parts.emit(s.x, s.y, s.z, 0, 0.4, 0, 0.3, 0.35, 0.05, this.emberCol[0], this.emberCol[1], this.emberCol[2], 0.8);
      let dead = s.life <= 0;
      if (!dead && (s.x - P.x) ** 2 + (s.z - P.z) ** 2 < (P.radius + 0.25) ** 2) {
        P.hurt(s.dmg); dead = true;
        parts.burst(s.x, s.y, s.z, 10, this.emberCol, { speed: 4, life: 0.3, size: 0.35 });
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
      _m.compose(_p, _q, _s);
      if (no < 160) this.orbs.setMatrixAt(no++, _m);
      g.add(s.x, s.y, s.z, 1.3, this.emberCol[0] * 0.45, this.emberCol[1] * 0.45, this.emberCol[2] * 0.45, 0.9);
    }
    this.bolts.count = nb; this.spears.count = ns; this.orbs.count = no;
    this.bolts.instanceMatrix.needsUpdate = true; this.spears.instanceMatrix.needsUpdate = true; this.orbs.instanceMatrix.needsUpdate = true;
  }

  clearEnemyShots() { this.embers.length = 0; }

  dispose() {
    for (const m of [this.bolts, this.spears, this.orbs]) { m.geometry.dispose(); m.material.dispose(); }
  }
}
