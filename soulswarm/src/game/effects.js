// Game feel: screen shake, hit-stop, slow-mo, flashes, pooled shockwaves/telegraphs,
// transient ground lights and floating combat text (drawn on the 2D overlay).
import * as THREE from 'three';
import { makeShockwave, makeTelegraph } from './fxmeshes.js';
import { HITSTOP } from './data.js';

const _v = new THREE.Vector3();
const _s = { x: 0, y: 0 };

export class Effects {
  constructor(run) {
    this.run = run;
    this.trauma = 0;
    this.shakeX = 0; this.shakeZ = 0;
    this.hitStopT = 0; this.hitStopDur = 0;
    this.slowT = 0; this.slowScale = 1;
    this.white = 0;
    this.red = 0;
    this.aberr = 0;
    this.immuneT = 0;
    this.lights = [];
    this.texts = [];
    this.waves = [];
    this.teles = [];
    for (let i = 0; i < 14; i++) { const m = makeShockwave(); run.scene.add(m); this.waves.push({ mesh: m, t: 0, dur: 0, r: 1, active: false }); }
    for (let i = 0; i < 10; i++) { const m = makeTelegraph(); run.scene.add(m); this.teles.push({ mesh: m, t: 0, dur: 0, active: false, onDone: null }); }
  }

  shake(amount) { this.trauma = Math.min(1, this.trauma + amount); }
  /** A brief freeze (real seconds). A motion effect, so it scales with the screen-shake setting (0 turns it off). */
  hitStop(t) {
    t *= this.run.profile.settings.shake ?? 1;
    if (t > this.hitStopT) this.hitStopT = this.hitStopDur = t;
  }
  slowMo(scale, dur) { this.slowScale = Math.min(this.slowScale, scale); this.slowT = Math.max(this.slowT, dur); }
  flash(w) { this.white = Math.max(this.white, w); }
  hurt(a = 0.5) { this.red = Math.max(this.red, a); }
  aberration(a) { this.aberr = Math.max(this.aberr, a); }

  /** Time scale for the simulation this frame. Hit-stop dips it (easing back over its last stretch) on top of any slow-mo:
   *  a freeze inside a Nova's slow-mo stays a freeze, and the slow-mo carries on after it. */
  timeScale() {
    const s = this.slowT > 0 ? this.slowScale : 1;
    if (this.hitStopT <= 0) return s;
    const u = this.hitStopT / (this.hitStopDur * HITSTOP.recover); // > 1 while frozen, then 1 → 0 as it eases back
    return s * (u >= 1 ? HITSTOP.scale : HITSTOP.scale + (1 - HITSTOP.scale) * (1 - u));
  }

  light(x, z, radius, intensity, color, life = 0.35) {
    if (this.lights.length > 24) this.lights.shift();
    this.lights.push({ x, z, radius, intensity, color, life, t: 0 });
  }

  shockwave(x, z, radius, color, dur = 0.45, width = 0.12) {
    const w = this.waves.find((o) => !o.active) || this.waves[0];
    w.active = true; w.t = 0; w.dur = dur; w.r = radius;
    w.mesh.visible = true;
    w.mesh.position.set(x, 0.06, z);
    w.mesh.scale.setScalar(radius);
    w.mesh.material.uniforms.uColor.value.set(color);
    w.mesh.material.uniforms.uW.value = width;
    w.mesh.material.uniforms.uP.value = 0;
  }

  telegraph(x, z, radius, dur, color = 0xff2e55, onDone = null) {
    const t = this.teles.find((o) => !o.active) || this.teles[0];
    t.active = true; t.t = 0; t.dur = dur; t.onDone = onDone;
    t.mesh.visible = true;
    t.mesh.position.set(x, 0.04, z);
    t.mesh.scale.setScalar(radius);
    t.mesh.material.uniforms.uColor.value.set(color);
    return t;
  }

  /** The boss shrugged a hit off: drop the damage number just spawned at (x, z) and show a throttled IMMUNE tag instead. */
  immune(x, z, y) {
    const tx = this.texts[this.texts.length - 1];
    if (tx && tx.t === 0 && tx.z === z && Math.abs(tx.x - x) < 0.25 && tx.kind !== 'immune') this.texts.pop();
    if (this.immuneT > 0) return;
    this.immuneT = 0.4;
    this.text(x, y, z, 'IMMUNE', 'immune');
  }

  /** Floating combat text. kind: 'dmg' | 'crit' | 'minion' | 'heal' | 'gold' | 'big' | 'immune' */
  text(x, y, z, str, kind = 'dmg') {
    if (this.texts.length > 70) {
      if (kind === 'minion') return;
      this.texts.shift();
    }
    this.texts.push({ x: x + (Math.random() - 0.5) * 0.4, y, z, str, kind, t: 0, life: kind === 'big' ? 1.4 : kind === 'crit' ? 0.85 : 0.6 });
  }

  update(dt, realDt) {
    this.hitStopT = Math.max(0, this.hitStopT - realDt);
    if (this.slowT > 0) { this.slowT -= realDt; if (this.slowT <= 0) this.slowScale = 1; }
    this.trauma = Math.max(0, this.trauma - realDt * 1.6);
    const s = this.trauma * this.trauma * 0.9;
    const t = performance.now() * 0.05;
    this.shakeX = s * (Math.sin(t * 1.7) + Math.sin(t * 3.1) * 0.5);
    this.shakeZ = s * (Math.cos(t * 1.3) + Math.sin(t * 2.7) * 0.5);
    this.white = Math.max(0, this.white - realDt * 2.2);
    this.red = Math.max(0, this.red - realDt * 1.8);
    this.aberr = Math.max(0, this.aberr - realDt * 2.5);
    this.immuneT -= realDt;

    for (const w of this.waves) {
      if (!w.active) continue;
      w.t += dt;
      const p = Math.min(1, w.t / w.dur);
      w.mesh.material.uniforms.uP.value = 1 - Math.pow(1 - p, 2.2);
      if (p >= 1) { w.active = false; w.mesh.visible = false; }
    }
    for (const tl of this.teles) {
      if (!tl.active) continue;
      tl.t += dt;
      const p = Math.min(1, tl.t / tl.dur);
      tl.mesh.material.uniforms.uP.value = p;
      tl.mesh.material.uniforms.uTime.value += dt;
      if (p >= 1) { tl.active = false; tl.mesh.visible = false; const cb = tl.onDone; tl.onDone = null; cb && cb(); }
    }
    for (let i = this.lights.length - 1; i >= 0; i--) {
      const l = this.lights[i];
      l.t += dt;
      if (l.t >= l.life) this.lights.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const tx = this.texts[i];
      tx.t += realDt;
      if (tx.t >= tx.life) this.texts.splice(i, 1);
    }
  }

  pushLights(world) {
    for (const l of this.lights) {
      const k = 1 - l.t / l.life;
      world.addLight(l.x, l.z, l.radius, l.intensity * k * k, l.color);
    }
  }

  applyPost(post) {
    post.uWhite.value = this.white * 0.9;
    post.uFlash.value.set(0.9, 0.05, 0.12, this.red * 0.55);
    post.uAberr.value = this.aberr;
  }

  draw2d(ctx, camera, engine) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const tx of this.texts) {
      _v.set(tx.x, tx.y + tx.t * (tx.kind === 'big' ? 0.6 : 1.4), tx.z);
      const p = engine.project(_v, camera, _s);
      if (!p) continue;
      const u = tx.t / tx.life;
      const pop = u < 0.15 ? 0.6 + (u / 0.15) * 0.6 : 1.2 - Math.min(0.2, (u - 0.15) * 0.6);
      const alpha = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
      let size = 15, fill = '#ffffff', stroke = 'rgba(20,6,10,0.9)';
      if (tx.kind === 'crit') { size = 22; fill = '#ffd04a'; }
      else if (tx.kind === 'minion') { size = 12; fill = '#9ff8ff'; }
      else if (tx.kind === 'heal') { size = 16; fill = '#6dffb0'; }
      else if (tx.kind === 'gold') { size = 14; fill = '#ffcf4a'; }
      else if (tx.kind === 'big') { size = 30; fill = '#e9feff'; stroke = 'rgba(0,40,60,0.95)'; }
      else if (tx.kind === 'hurt') { size = 18; fill = '#ff5a6e'; }
      else if (tx.kind === 'immune') { size = 17; fill = '#ffd6fb'; stroke = 'rgba(58,0,52,0.95)'; }
      ctx.globalAlpha = alpha;
      ctx.font = `800 ${Math.round(size * pop)}px Oxanium, "Segoe UI", sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = stroke;
      ctx.strokeText(tx.str, p.x, p.y);
      ctx.fillStyle = fill;
      ctx.fillText(tx.str, p.x, p.y);
    }
    ctx.restore();
  }
}
