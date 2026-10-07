// The Shepherd.
import * as THREE from 'three';
import { makeCharMaterial } from '../engine/materials.js';
import { heroGeometry } from '../engine/models.js';
import { makeRuneCircle } from './fxmeshes.js';
import { SKINS, HAZARDS } from './data.js';
import { hdr } from '../engine/particles.js';

const FROST = hdr(0xcfeeff, 1.8), ROOT = hdr(0xb35bff, 2.6);

export class Player {
  constructor(run, loadout) {
    this.run = run;
    const hero = loadout.hero;
    const skin = loadout.skin ? SKINS[loadout.skin] : null;
    this.color = new THREE.Color(skin ? skin.color : hero.color);
    this.mat = makeCharMaterial({ rim: this.color.getHex(), emit: 2.8, anim: 0, ambient: 0x3a4766, key: 0xa8b6d8, plColor: this.color.getHex(), plRadius: 5 });
    this.mat.uniforms.uTint.value.copy(this.color);
    this.mesh = new THREE.Mesh(heroGeometry(hero.id, skin ? skin.body : hero.body), this.mat);
    this.mesh.scale.setScalar(1.25);
    run.scene.add(this.mesh);
    this.circle = makeRuneCircle(1.05);
    this.circle.material.uniforms.uColor.value.copy(this.color);
    this.circle.position.y = 0.05;
    run.scene.add(this.circle);
    this.x = 0; this.z = 0; this.vx = 0; this.vz = 0;
    this.facing = -Math.PI / 2; // up the screen
    this.radius = 0.5;
    this.maxHp = this.hp = loadout.hpMax;
    this.invuln = 1.0;
    this.flash = 0;
    this.dead = false;
    this.t = 0;
    this.moving = false;
    this.kx = 0; this.kz = 0;           // knockback impulse (Brute slams)
    this.rootT = 0;                     // abyssal hands hold the Shepherd in place
    this.onIce = false;
    this.burnAcc = 0; this.burnT = 0;   // burning ground ticks
  }

  update(dt, input) {
    this.t += dt;
    const S = this.run.stats;
    if (this.maxHp !== S.maxHp) { this.hp += Math.max(0, S.maxHp - this.maxHp); this.maxHp = S.maxHp; }
    this.invuln = Math.max(0, this.invuln - dt);
    this.flash = Math.max(0, this.flash - dt * 5);
    if (this.dead) { this.vx = this.vz = this.kx = this.kz = 0; return; }
    const H = this.run.hazards, I = HAZARDS.ice;
    this.onIce = !!H && H.iceAt(this.x, this.z);
    this.rootT = Math.max(0, this.rootT - dt);
    const top = this.rootT > 0 ? 0 : S.speed * (this.onIce ? I.speed : 1);
    const tx = input.x * top, tz = input.z * top;
    // on ice: sluggish acceleration while steering, low friction once the stick is released (a glide, not a skate)
    const rate = this.rootT > 0 ? 40 : this.onIce ? 14 * (input.x * input.x + input.z * input.z > 0.01 ? I.accel : I.friction) : 14;
    const acc = Math.min(1, dt * rate);
    this.vx += (tx - this.vx) * acc;
    this.vz += (tz - this.vz) * acc;
    const kd = Math.exp(-7 * dt);
    this.kx *= kd; this.kz *= kd;
    this.x += (this.vx + this.kx) * dt; this.z += (this.vz + this.kz) * dt;
    const sp = Math.hypot(this.vx, this.vz);
    this.moving = sp > 0.5;
    const parts = this.run.particles;
    if (this.onIce && sp > 2 && Math.random() < dt * 14) parts.emit(this.x, 0.08, this.z, -this.vx * 0.15, 0.4, -this.vz * 0.15, 0.45, 0.32, 0.05, FROST[0], FROST[1], FROST[2], 0.8, 2, 0);
    if (this.rootT > 0 && Math.random() < dt * 30) {
      const a = Math.random() * 6.283;
      parts.emit(this.x + Math.cos(a) * 0.45, 0.1, this.z + Math.sin(a) * 0.45, 0, 1.8, 0, 0.4, 0.38, 0.05, ROOT[0], ROOT[1], ROOT[2], 0.9, 2, 0);
    }
    if (this.burnT > 0) {
      this.burnT -= dt;
      if (this.burnT <= 0 && this.burnAcc > 0) { this.hurt(this.burnAcc, true); this.burnAcc = 0; }
    }
    if (this.moving) {
      const target = Math.atan2(this.vz, this.vx);
      let d = target - this.facing; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, dt * 12);
    }
  }

  /** dot: damage over time (burning ground). It respects invulnerability but grants none and stays quiet. */
  hurt(dmg, dot = false) {
    if (this.invuln > 0 || this.dead || this.run.ended || this.run.bossDead) return; // the chapter is won: no vent, burn or Splitter copy may fell him in the victory beat
    const run = this.run;
    this.hp -= dmg;
    if (dot) {
      this.flash = Math.max(this.flash, 0.45);
      run.fx.hurt(0.22);
      run.fx.text(this.x, 2.2, this.z, '-' + Math.max(1, Math.round(dmg)), 'hurt');
    } else {
      this.invuln = 0.5;
      this.flash = 1;
      run.fx.hurt(0.55);
      run.fx.shake(0.18);
      run.fx.text(this.x, 2.2, this.z, '-' + Math.round(dmg), 'hurt');
      run.audio.sfx('hurt');
      run.app.haptic('medium');
      run.stats_hits = (run.stats_hits || 0) + 1;
    }
    if (this.hp <= 0) { this.hp = 0; run.onPlayerDeath(); }
  }

  /** Burning ground: accumulates dps and lands it in quiet 0.3 s ticks. */
  burn(dps, dt) {
    this.burnAcc += dps * dt;
    if (this.burnT <= 0) this.burnT = 0.3;
  }

  /** Abyssal hands: hold the Shepherd in place for t seconds. */
  root(t) { this.rootT = Math.max(this.rootT, t); this.vx *= 0.2; this.vz *= 0.2; }

  /** Brute slam knockback (an impulse in m/s that decays in ~0.3 s). */
  knock(x, z) { if (!this.dead) { this.kx += x; this.kz += z; } }

  heal(n) {
    if (this.dead) return;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    const d = Math.round(this.hp - before);
    if (d > 0) { this.run.fx.text(this.x, 2.3, this.z, '+' + d, 'heal'); this.run.audio.sfx('heal'); }
  }

  render(time) {
    const bob = this.moving ? Math.abs(Math.sin(this.t * 11)) * 0.08 : Math.sin(this.t * 2) * 0.03;
    this.mesh.position.set(this.x, bob, this.z);
    // models face +Z; rotate so they face the movement direction
    this.mesh.rotation.y = Math.PI / 2 - this.facing;
    this.mesh.rotation.z = this.moving ? Math.sin(this.t * 11) * 0.05 : 0;
    this.mat.uniforms.uFlash.value = this.flash * 0.8 + (this.invuln > 0 && this.invuln < 0.4 ? 0 : 0);
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uPLPos.value.set(this.x + 0.6, 2.2, this.z + 1.4);
    this.mesh.visible = !this.dead && !(this.invuln > 0.45 && Math.floor(this.t * 20) % 2 === 0);
    this.circle.position.set(this.x, 0.05, this.z);
    this.circle.rotation.y = -time * 0.8;
    this.circle.material.uniforms.uTime.value = time;
  }

  dispose() {
    this.mesh.geometry.dispose(); this.mat.dispose();
    this.circle.geometry.dispose(); this.circle.material.dispose();
  }
}
