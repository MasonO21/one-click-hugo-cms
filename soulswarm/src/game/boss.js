// Gravemaw, the Hollow King. Slams, ember rings, summons, and enrages at half health.
import * as THREE from 'three';
import { BOSS } from './data.js';
import { bossGeometry } from '../engine/models.js';
import { makeCharMaterial } from '../engine/materials.js';
import { hdr } from '../engine/particles.js';

export class Boss {
  constructor(run) {
    this.run = run;
    this.e = null;
    this.mesh = null;
    this.state = 'none';
  }

  spawn() {
    const run = this.run, P = run.player, ch = run.chapter;
    const x = P.x, z = P.z - 11;
    const e = run.enemies.spawn('boss', x, z, { hpMul: ch.hpMul * (1 + 0.15 * (ch.id - 1)), dmgMul: 1 + 0.3 * (ch.id - 1) });
    this.e = e;
    run.bossEnemy = e;
    this.color = new THREE.Color(ch.boss);
    this.mat = makeCharMaterial({ rim: ch.boss, emit: 3, anim: 0.3, ambient: 0x3a3048, key: 0x9a8ab8, plColor: ch.boss, plRadius: 6 });
    this.mat.uniforms.uTint.value.copy(this.color);
    this.mesh = new THREE.Mesh(bossGeometry(), this.mat);
    run.scene.add(this.mesh);
    this.state = 'enter'; this.t = 0; this.cd = 2.5; this.enraged = false; this.y = -5;
    this.col = hdr(ch.boss, 3.5);
    run.fx.shake(0.6);
    run.audio.sfx('boss_roar');
    run.audio.playMusic('boss');
    run.ui.bossBar(true, `${BOSS.name}, ${BOSS.title}`);
    run.fx.telegraph(x, z, 3.2, 1.4, ch.boss);
    run.particles.burst(x, 0.5, z, 120, this.col, { speed: 10, life: 1.2, size: 0.7, up: 1.5 });
  }

  update(e, dt) {
    const run = this.run, P = run.player;
    this.t += dt; this.cd -= dt;
    const dx = P.x - e.x, dz = P.z - e.z, dist = Math.hypot(dx, dz) || 0.01;
    const speedMul = this.enraged ? 1.35 : 1;
    if (this.state === 'enter') {
      this.y = Math.min(0, -5 + this.t * 4);
      if (this.t > 1.4) { this.state = 'chase'; this.t = 0; run.audio.sfx('boss_roar'); run.fx.shake(0.5); }
      e.hp = Math.max(e.hp, e.maxHp * 0.999);
      return;
    }
    if (this.state === 'chase') {
      e.x += (dx / dist) * BOSS.speed * speedMul * dt;
      e.z += (dz / dist) * BOSS.speed * speedMul * dt;
      e.rot = Math.atan2(dx, dz);
      if (this.cd <= 0) this.pickAttack(dist);
    } else if (this.state === 'slam') {
      const T = this.slamT;
      const p = this.t / T.dur;
      if (p >= 0.55 && !T.jumped) { T.jumped = true; T.fx = e.x; T.fz = e.z; }
      if (T.jumped) {
        const k = Math.min(1, (p - 0.55) / 0.45);
        e.x = T.fx + (T.x - T.fx) * k; e.z = T.fz + (T.z - T.fz) * k;
        this.y = Math.sin(k * Math.PI) * 4;
      }
      if (p >= 1) this.land(e);
    } else if (this.state === 'ring') {
      this.y = 0;
      if (this.t >= this.next && this.waves > 0) {
        this.waves--; this.next = this.t + 0.45;
        const n = this.enraged ? 26 : 18;
        run.projectiles.emberRing(e.x, e.z, n, this.enraged ? 7.5 : 6, e.dmg * 0.6, this.waves * 0.17);
        run.audio.sfx('explosion', { volume: 0.5, pitch: 0.7 });
        run.particles.burst(e.x, 2.2, e.z, 30, this.col, { speed: 6, life: 0.5, size: 0.6 });
      }
      if (this.waves <= 0 && this.t > this.next) this.toChase(1.6);
    } else if (this.state === 'summon') {
      if (this.t > 0.7 && !this.summoned) {
        this.summoned = true;
        const n = this.enraged ? 8 : 6;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const sx = e.x + Math.cos(a) * 3.2, sz = e.z + Math.sin(a) * 3.2;
          run.enemies.spawn(i % 3 === 0 ? 'ghoul' : 'husk', sx, sz, { hpMul: run.hpMul(), dmgMul: run.dmgMul(), elite: this.enraged && i === 0 });
          run.particles.burst(sx, 0.4, sz, 14, this.col, { speed: 3, life: 0.6, size: 0.5, up: 1.2 });
        }
        run.audio.sfx('boss_roar', { volume: 0.6, pitch: 1.3 });
      }
      if (this.t > 1.2) this.toChase(1.4);
    }
    // contact damage
    if (dist < e.radius + P.radius && e.atkCd <= 0 && this.y < 0.5) { e.atkCd = 1.0; P.hurt(e.dmg); }
  }

  pickAttack(dist) {
    const r = Math.random();
    this.t = 0;
    const run = this.run, e = this.e, P = run.player;
    if (dist < 13 && r < 0.45) {
      this.state = 'slam';
      const R = this.enraged ? 4.2 : 3.4;
      this.slamT = { x: P.x, z: P.z, dur: this.enraged ? 1.0 : 1.25, R, jumped: false };
      run.fx.telegraph(P.x, P.z, R, this.slamT.dur, 0xff2e55);
    } else if (r < 0.78) {
      this.state = 'ring'; this.waves = this.enraged ? 3 : 2; this.next = 0.6;
      run.particles.burst(e.x, 2.5, e.z, 40, this.col, { speed: 2, life: 0.6, size: 0.5, up: 2 });
    } else {
      this.state = 'summon'; this.summoned = false;
    }
  }

  land(e) {
    const run = this.run, P = run.player, T = this.slamT;
    this.y = 0;
    run.fx.shockwave(e.x, e.z, T.R * 1.6, 0xff3df0, 0.5, 0.16);
    run.particles.burst(e.x, 0.3, e.z, 90, this.col, { speed: 11, life: 0.7, size: 0.6, up: 0.4 });
    run.particles.ring(e.x, e.z, T.R, 60, hdr(0xffd0f0, 2.5), { life: 0.5, size: 0.7 });
    run.fx.light(e.x, e.z, 10, 2.5, this.color, 0.5);
    run.fx.shake(0.7);
    run.fx.aberration(0.8);
    run.audio.sfx('boss_slam');
    run.app.haptic('heavy');
    if (Math.hypot(P.x - e.x, P.z - e.z) < T.R + P.radius) P.hurt(e.dmg * 1.4);
    run.legion.damageArea(e.x, e.z, T.R, 999);
    this.toChase(this.enraged ? 1.3 : 1.9);
  }

  toChase(cd) { this.state = 'chase'; this.t = 0; this.cd = cd; }

  onHit(e) {
    if (!this.enraged && e.hp < e.maxHp * 0.5) {
      this.enraged = true;
      const run = this.run;
      run.ui.banner('GRAVEMAW ENRAGES', 'Its crown blazes with stolen souls', 'boss');
      run.audio.sfx('boss_roar');
      run.fx.shake(0.5);
      run.particles.burst(e.x, 3, e.z, 120, this.col, { speed: 8, life: 1, size: 0.6, up: 1.5 });
    }
    this.run.ui.bossHp(Math.max(0, e.hp / e.maxHp));
  }

  onDeath(e) {
    const run = this.run;
    run.ui.bossHp(0);
    run.onBossKilled(e.x, e.z);
    this.state = 'dead';
    this.deathT = 0;
  }

  render(dt) {
    if (!this.mesh) return;
    const e = this.e;
    if (this.state === 'dead') {
      this.deathT += dt;
      const k = Math.max(0, 1 - this.deathT / 1.2);
      this.mesh.scale.setScalar(Math.max(0.01, k));
      this.mat.uniforms.uFlash.value = 1;
      if (k <= 0) { this.run.scene.remove(this.mesh); }
      return;
    }
    this.mesh.position.set(e.x, this.y, e.z);
    this.mesh.rotation.y = e.rot;
    const windup = this.state === 'ring' || this.state === 'summon' ? 0.35 + 0.35 * Math.sin(this.t * 25) : 0;
    this.mat.uniforms.uFlash.value = Math.max(e.flash * 0.6, windup);
    this.mat.uniforms.uTime.value += dt;
    this.mat.uniforms.uEmit.value = this.enraged ? 4 : 3;
    const g = this.run.glow;
    g.add(e.x, 2.3 + this.y, e.z + 0.9, 2.2, this.col[0] * 0.5, this.col[1] * 0.5, this.col[2] * 0.5, 0.9);
    g.add(e.x, 4.1 + this.y, e.z + 0.3, 3.0, this.col[0] * 0.25, this.col[1] * 0.25, this.col[2] * 0.25, 0.8);
  }

  dispose() {
    if (this.mesh) { this.run.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
  }
}
