// The horde: pooled enemies, instanced rendering, spatial hash, AI and damage.
import * as THREE from 'three';
import { ENEMIES, ELITE, BOSS } from './data.js';
import { makeCharMaterial, addInstanceAttrs } from '../engine/materials.js';
import { enemyGeometry } from '../engine/models.js';
import { hdr } from '../engine/particles.js';

const TYPES = ['husk', 'ghoul', 'brute', 'witch', 'bloater'];
const MAX_PER = { husk: 320, ghoul: 160, brute: 70, witch: 70, bloater: 60 };
const CELL = 2.0, GRID = 64, GRID_MASK = 63;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export class Enemies {
  constructor(run) {
    this.run = run;
    this.active = [];
    this.pool = [];
    this.head = new Int32Array(GRID * GRID).fill(-1); // -1 = empty cell (0 would be a valid index)
    this.next = new Int32Array(2048);
    this.mat = makeCharMaterial({ rim: new THREE.Color(run.chapter.enemy).multiplyScalar(0.55).getHex(), emit: 2.8, anim: 1, ambient: 0x3a3236, key: 0x9a9098, plRadius: 6 });
    this.meshes = {};
    for (const t of TYPES) {
      const mesh = new THREE.InstancedMesh(enemyGeometry(t), this.mat, MAX_PER[t]);
      mesh.count = 0;
      mesh.frustumCulled = false;
      const attrs = addInstanceAttrs(mesh, MAX_PER[t]);
      run.scene.add(mesh);
      this.meshes[t] = { mesh, attrs, n: 0 };
    }
    this.color = new THREE.Color(run.chapter.enemy);
    this.eliteColor = new THREE.Color(0xffd04a);
    this.burstCol = hdr(run.chapter.enemy, 3.2);
    this.eliteBurst = hdr(0xffd04a, 3.5);
    this.counts = { husk: 0, ghoul: 0, brute: 0, witch: 0, bloater: 0, boss: 0 };
    this.time = 0;
  }

  get count() { return this.active.length; }

  spawn(type, x, z, { elite = false, hpMul = 1, dmgMul = 1 } = {}) {
    if (type !== 'boss' && this.counts[type] >= MAX_PER[type]) return null;
    const d = type === 'boss' ? BOSS : ENEMIES[type];
    const e = this.pool.pop() || {};
    e.active = true; e.type = type; e.elite = elite;
    e.x = x; e.z = z; e.vx = 0; e.vz = 0; e.kx = 0; e.kz = 0;
    e.maxHp = e.hp = d.hp * hpMul * (elite ? ELITE.hpMul : 1);
    e.dmg = d.dmg * dmgMul * (elite ? ELITE.dmgMul : 1);
    e.speed = d.speed * (0.9 + Math.random() * 0.2) * (elite ? 0.9 : 1);
    e.radius = d.radius * (elite ? ELITE.scale : 1);
    e.mass = d.mass * (elite ? 3 : 1);
    e.scale = (d.scale || 1) * (elite ? ELITE.scale : 1);
    e.rot = Math.atan2(this.run.player.x - x, this.run.player.z - z);
    e.flash = 0; e.atkCd = 0.5; e.phase = Math.random() * 20; e.spawnT = 0;
    e.state = 0; e.stateT = 0; e.haloCd = 0; e.scytheId = -1; e.chainMark = 0;
    e.shootCd = d.ranged ? d.ranged.cooldown * (0.5 + Math.random()) : 0;
    e.lastHitBy = null;
    this.active.push(e);
    this.counts[type]++;
    return e;
  }

  rebuildGrid() {
    this.head.fill(-1);
    const a = this.active;
    if (this.next.length < a.length) this.next = new Int32Array(a.length * 2);
    for (let i = 0; i < a.length; i++) {
      const e = a[i];
      const key = ((Math.floor(e.x / CELL) & GRID_MASK) << 6) | (Math.floor(e.z / CELL) & GRID_MASK);
      this.next[i] = this.head[key];
      this.head[key] = i;
    }
  }

  /** Calls fn(e, d2) for every active enemy whose centre is within r (+ its radius) of (x, z). */
  query(x, z, r, fn) {
    const a = this.active;
    const reach = r + 2;
    const x0 = Math.floor((x - reach) / CELL), x1 = Math.floor((x + reach) / CELL);
    const z0 = Math.floor((z - reach) / CELL), z1 = Math.floor((z + reach) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        let i = this.head[((cx & GRID_MASK) << 6) | (cz & GRID_MASK)];
        while (i !== -1) {
          const e = a[i];
          if (e && e.active && e.type !== 'boss') {
            const dx = e.x - x, dz = e.z - z, d2 = dx * dx + dz * dz;
            const rr = r + e.radius;
            if (d2 <= rr * rr) { if (fn(e, d2) === false) return; }
          }
          i = this.next[i];
        }
      }
    }
    // the boss can be huge: always test it directly
    const b = this.run.bossEnemy;
    if (b && b.active) {
      const d2 = (b.x - x) ** 2 + (b.z - z) ** 2;
      if (d2 <= (r + b.radius) ** 2) fn(b, d2);
    }
  }

  nearest(x, z, maxR, skip) {
    let best = null, bd = Infinity;
    this.query(x, z, maxR, (e, d2) => { if (d2 < bd && (!skip || !skip(e))) { bd = d2; best = e; } });
    return best;
  }

  update(dt) {
    this.time += dt;
    const run = this.run, P = run.player, a = this.active;
    this.rebuildGrid();
    for (let i = 0; i < a.length; i++) {
      const e = a[i];
      if (!e.active) continue;
      e.spawnT += dt;
      e.flash = Math.max(0, e.flash - dt * 7);
      e.atkCd -= dt;
      e.haloCd -= dt;
      if (e.type === 'boss') { run.boss.update(e, dt); continue; }
      let dx = P.x - e.x, dz = P.z - e.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      dx /= dist; dz /= dist;
      let speed = e.speed;
      const d = ENEMIES[e.type];

      if (e.type === 'witch') {
        e.shootCd -= dt;
        if (dist < d.ranged.range) {
          speed = dist < d.ranged.range * 0.6 ? -e.speed * 0.6 : 0;
          if (e.shootCd <= 0) {
            e.shootCd = d.ranged.cooldown * (0.85 + Math.random() * 0.3);
            run.projectiles.enemyShot(e.x + dx * 0.6, e.z + dz * 0.6, dx, dz, d.ranged.speed, e.dmg);
          }
        }
      } else if (e.type === 'bloater') {
        if (e.state === 0 && dist < 2.4) {
          e.state = 1; e.stateT = 0;
          run.fx.telegraph(e.x, e.z, d.explode.radius, d.explode.fuse, 0xff6a2e);
        }
        if (e.state === 1) {
          speed = e.speed * 0.25;
          e.stateT += dt;
          e.flash = 0.5 + 0.5 * Math.sin(e.stateT * 30);
          if (e.stateT >= d.explode.fuse) { this.explodeBloater(e); continue; }
        }
      }

      // steer toward the player (with a little orbiting wobble so packs flow around)
      const wob = Math.sin(this.time * 1.3 + e.phase) * 0.35;
      const sx = dx - dz * wob, sz = dz + dx * wob;
      const k = Math.exp(-8 * dt);
      e.kx *= k; e.kz *= k;
      e.vx = sx * speed + e.kx;
      e.vz = sz * speed + e.kz;

      // separation (cheap: only neighbours in the same few cells)
      this.query(e.x, e.z, e.radius, (o) => {
        if (o === e || o.type === 'boss') return;
        const ox = e.x - o.x, oz = e.z - o.z;
        const dd = Math.hypot(ox, oz) || 0.01;
        const overlap = e.radius + o.radius - dd;
        if (overlap > 0) {
          const w = o.mass / (e.mass + o.mass);
          e.x += (ox / dd) * overlap * w * 0.5;
          e.z += (oz / dd) * overlap * w * 0.5;
        }
      });

      e.x += e.vx * dt; e.z += e.vz * dt;
      const tr = Math.atan2(e.vx, e.vz);
      let dr = tr - e.rot; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      e.rot += dr * Math.min(1, dt * 8);

      // contact damage to the player
      if (dist < e.radius + P.radius && e.atkCd <= 0) {
        e.atkCd = 0.8;
        P.hurt(e.dmg);
      }
      // despawn stragglers that fell far behind (they respawn ahead via the director)
      if (dist > 42) this.remove(e);
    }
    // compact, then rebuild so the grid indexes the compacted list for everyone querying after us
    if (a.some((e) => !e.active)) this.active = a.filter((e) => e.active);
    this.rebuildGrid();
  }

  explodeBloater(e) {
    const run = this.run;
    const R = ENEMIES.bloater.explode.radius;
    run.particles.burst(e.x, 0.8, e.z, 70, hdr(0xff8a2e, 4), { speed: 9, life: 0.7, size: 0.7, up: 0.6 });
    run.particles.burst(e.x, 0.6, e.z, 30, hdr(0xffe08a, 4), { speed: 4, life: 0.5, size: 1.1, up: 0.3 });
    run.fx.shockwave(e.x, e.z, R, 0xff7a2e, 0.35, 0.18);
    run.fx.light(e.x, e.z, 7, 2.5, new THREE.Color(0xff7a2e), 0.4);
    run.fx.shake(0.25);
    run.audio.sfx('explosion');
    const P = run.player;
    if (Math.hypot(P.x - e.x, P.z - e.z) < R + P.radius) P.hurt(e.dmg);
    run.legion.damageArea(e.x, e.z, R, 60);
    this.query(e.x, e.z, R, (o) => { if (o !== e) this.damage(o, e.maxHp * 1.2, { kx: o.x - e.x, kz: o.z - e.z, knock: 7, source: 'blast' }); });
    this.kill(e, 'blast', true);
  }

  /** opts: {kx,kz,knock,crit,source,silent} */
  damage(e, amount, o = {}) {
    if (!e.active || amount <= 0) return false;
    e.hp -= amount;
    e.flash = 1;
    e.lastHitBy = o.source || null;
    if (o.knock && e.mass < 50) {
      const l = Math.hypot(o.kx || 0, o.kz || 0) || 1;
      const k = o.knock / Math.max(1, e.mass * 0.6);
      e.kx += (o.kx / l) * k; e.kz += (o.kz / l) * k;
    }
    const run = this.run;
    if (!o.silent) {
      const y = 1.4 * e.scale + (e.type === 'boss' ? 3 : 0);
      if (o.source === 'minion') { if (Math.random() < 0.18) run.fx.text(e.x, y, e.z, Math.round(amount), 'minion'); }
      else run.fx.text(e.x, y, e.z, Math.round(amount), o.crit ? 'crit' : 'dmg');
    }
    if (e.type === 'boss') run.boss.onHit(e);
    if (e.hp <= 0) { this.kill(e, o.source); return true; }
    return false;
  }

  kill(e, source, noRaise = false) {
    if (!e.active) return;
    const run = this.run;
    if (e.type === 'boss') { e.hp = 0; run.boss.onDeath(e); this.remove(e); return; }
    run.particles.burst(e.x, 0.7 * e.scale, e.z, e.elite ? 50 : 12, e.elite ? this.eliteBurst : this.burstCol, { speed: e.elite ? 8 : 5, life: 0.5, size: 0.42 * e.scale, up: 0.8 });
    if (Math.random() < 0.35) run.fx.light(e.x, e.z, 2.5, 0.8, this.color, 0.25);
    run.onEnemyKilled(e, source, noRaise);
    this.remove(e);
  }

  remove(e) {
    if (!e.active) return;
    e.active = false;
    this.counts[e.type]--;
    this.pool.push(e);
  }

  clearAll(withFx = true) {
    for (const e of this.active) {
      if (!e.active || e.type === 'boss') continue;
      if (withFx) this.run.particles.burst(e.x, 0.7, e.z, 6, this.burstCol, { speed: 4, life: 0.5, size: 0.4 });
      this.remove(e);
    }
    this.active = this.active.filter((e) => e.active);
    this.rebuildGrid();
  }

  render() {
    for (const t of TYPES) this.meshes[t].n = 0;
    const c = this.color, ec = this.eliteColor;
    for (const e of this.active) {
      if (!e.active || e.type === 'boss') continue;
      const M = this.meshes[e.type];
      const i = M.n++;
      const pop = Math.min(1, e.spawnT * 4);
      let sc = e.scale * (0.3 + 0.7 * pop);
      if (e.type === 'bloater' && e.state === 1) sc *= 1 + e.stateT * 0.35;
      _p.set(e.x, (1 - pop) * -0.6, e.z);
      _q.setFromAxisAngle(_up, e.rot);
      _s.set(sc, sc, sc);
      _m.compose(_p, _q, _s);
      M.mesh.setMatrixAt(i, _m);
      const col = e.elite ? ec : c;
      M.attrs.tint.setXYZ(i, col.r, col.g, col.b);
      M.attrs.flash.setX(i, e.flash);
      M.attrs.anim.setXY(i, e.phase, e.type === 'brute' ? 0.6 : 1);
    }
    for (const t of TYPES) {
      const M = this.meshes[t];
      M.mesh.count = M.n;
      if (M.n) {
        M.mesh.instanceMatrix.needsUpdate = true;
        M.attrs.tint.needsUpdate = true; M.attrs.flash.needsUpdate = true; M.attrs.anim.needsUpdate = true;
      }
    }
    this.mat.uniforms.uTime.value = this.time;
  }

  dispose() {
    for (const t of TYPES) this.meshes[t].mesh.geometry.dispose();
    this.mat.dispose();
  }
}
