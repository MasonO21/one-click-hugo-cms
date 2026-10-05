// The Shepherd.
import * as THREE from 'three';
import { makeCharMaterial } from '../engine/materials.js';
import { heroGeometry } from '../engine/models.js';
import { makeRuneCircle } from './fxmeshes.js';
import { SKINS } from './data.js';

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
  }

  update(dt, input) {
    this.t += dt;
    const S = this.run.stats;
    if (this.maxHp !== S.maxHp) { this.hp += Math.max(0, S.maxHp - this.maxHp); this.maxHp = S.maxHp; }
    this.invuln = Math.max(0, this.invuln - dt);
    this.flash = Math.max(0, this.flash - dt * 5);
    if (this.dead) { this.vx = this.vz = 0; return; }
    const tx = input.x * S.speed, tz = input.z * S.speed;
    const acc = Math.min(1, dt * 14);
    this.vx += (tx - this.vx) * acc;
    this.vz += (tz - this.vz) * acc;
    this.x += this.vx * dt; this.z += this.vz * dt;
    const sp = Math.hypot(this.vx, this.vz);
    this.moving = sp > 0.5;
    if (this.moving) {
      const target = Math.atan2(this.vz, this.vx);
      let d = target - this.facing; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, dt * 12);
    }
  }

  hurt(dmg) {
    if (this.invuln > 0 || this.dead || this.run.ended) return;
    const run = this.run;
    this.hp -= dmg;
    this.invuln = 0.5;
    this.flash = 1;
    run.fx.hurt(0.55);
    run.fx.shake(0.18);
    run.fx.text(this.x, 2.2, this.z, '-' + Math.round(dmg), 'hurt');
    run.audio.sfx('hurt');
    run.app.haptic('medium');
    run.stats_hits = (run.stats_hits || 0) + 1;
    if (this.hp <= 0) { this.hp = 0; run.onPlayerDeath(); }
  }

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
