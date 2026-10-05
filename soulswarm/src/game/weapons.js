// Shepherd weapons. Each fires on its own cooldown, scaled by the run's stats.
import * as THREE from 'three';
import { SKILLS } from './data.js';
import { makeArc } from './fxmeshes.js';
import { skullGeometry } from '../engine/models.js';
import { makeCharMaterial, addInstanceAttrs } from '../engine/materials.js';
import { hdr } from '../engine/particles.js';

const TAU = Math.PI * 2;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
const WEAPONS = ['soulBolt', 'scythe', 'chains', 'spears', 'skullHalo', 'gravePulse'];

export class Weapons {
  constructor(run) {
    this.run = run;
    this.timers = {};
    for (const w of WEAPONS) this.timers[w] = 0.4;
    this.arcs = [makeArc(), makeArc(), makeArc()];
    for (const a of this.arcs) run.scene.add(a);
    this.sweeps = [];
    this.sweepSeq = 1;
    this.chainFx = [];
    this.skullMat = makeCharMaterial({ rim: 0xff8a3d, emit: 3, anim: 0 });
    this.skulls = new THREE.InstancedMesh(skullGeometry(), this.skullMat, 10);
    addInstanceAttrs(this.skulls, 10);
    this.skulls.count = 0; this.skulls.frustumCulled = false;
    run.scene.add(this.skulls);
    this.skullAngle = 0;
    this.cols = {
      bolt: hdr(0x4ef2ff, 3), scythe: hdr(0xb36bff, 3), chain: hdr(0xffb347, 3.4), spear: hdr(0x9dffb8, 2.6),
      skull: hdr(0xff8a3d, 3.2), pulse: hdr(0x4ef2ff, 2.5),
    };
    this._list = [];
  }

  roll(base) {
    const S = this.run.stats;
    const crit = Math.random() < S.crit;
    return [base * S.dmgMul * (crit ? 2 : 1), crit];
  }

  update(dt) {
    const run = this.run, lv = run.skillLv, S = run.stats;
    for (const w of WEAPONS) {
      if (!lv[w] || w === 'skullHalo') continue;
      this.timers[w] -= dt;
      if (this.timers[w] <= 0) {
        const def = SKILLS[w];
        const fired = this.fire(w, lv[w]);
        this.timers[w] = fired ? def.cd(lv[w]) / S.haste : 0.12;
      }
    }
    if (lv.skullHalo) this.updateSkulls(dt, lv.skullHalo);
    else this.skulls.count = 0;
    this.updateSweeps(dt);
    this.updateChains(dt);
  }

  // ---------------------------------------------------------------- firing
  fire(w, level) {
    const run = this.run, P = run.player, E = run.enemies;
    if (w === 'soulBolt') {
      const evolved = run.evolved.soulStorm;
      const count = evolved ? 6 : SKILLS.soulBolt.count(level);
      const targets = this.nearestN(P.x, P.z, 11.5, count);
      if (!targets.length) return false;
      for (let i = 0; i < count; i++) {
        const t = targets[i % targets.length];
        const [dmg, crit] = this.roll(evolved ? 34 : SKILLS.soulBolt.dmg(level));
        run.projectiles.bolt(P.x, P.z, t, dmg, SKILLS.soulBolt.pierce(level) + (evolved ? 1 : 0), { spread: (i - (count - 1) / 2) * 0.22, explode: evolved ? 1.9 : 0, crit });
      }
      run.audio.sfx('shoot', { volume: 0.55 });
      return true;
    }
    if (w === 'scythe') {
      const arcs = SKILLS.scythe.arcs(level);
      const R = SKILLS.scythe.radius(level) * run.stats.area;
      const base = P.facing;
      for (let k = 0; k < arcs; k++) this.startSweep(base + (k * TAU) / arcs, R, SKILLS.scythe.dmg(level));
      run.audio.sfx('shoot', { volume: 0.5, pitch: 0.55 });
      return true;
    }
    if (w === 'chains') {
      const first = E.nearest(P.x, P.z, SKILLS.chains.range);
      if (!first) return false;
      const jumps = SKILLS.chains.jumps(level);
      const pts = [{ x: P.x, z: P.z }];
      const mark = ++this.sweepSeq;
      let cur = first;
      for (let j = 0; j < jumps && cur; j++) {
        cur.chainMark = mark;
        pts.push({ x: cur.x, z: cur.z });
        const [dmg, crit] = this.roll(SKILLS.chains.dmg(level));
        const from = pts[pts.length - 2];
        E.damage(cur, dmg, { kx: cur.x - from.x, kz: cur.z - from.z, knock: 2, crit, source: 'chain' });
        run.particles.burst(cur.x, 1, cur.z, 8, this.cols.chain, { speed: 5, life: 0.3, size: 0.35 });
        const cx = cur.x, cz = cur.z;
        cur = E.nearest(cx, cz, 4.5, (e) => e.chainMark === mark);
      }
      this.chainFx.push({ pts: this.jag(pts), t: 0, life: 0.22 });
      run.fx.light(first.x, first.z, 4, 1.2, new THREE.Color(0xffb347), 0.2);
      run.audio.sfx('shoot', { volume: 0.5, pitch: 1.7 });
      return true;
    }
    if (w === 'spears') {
      const t = E.nearest(P.x, P.z, 13);
      let ang = t ? Math.atan2(t.z - P.z, t.x - P.x) : P.facing;
      const n = SKILLS.spears.count(level);
      for (let i = 0; i < n; i++) {
        const a = ang + (i - (n - 1) / 2) * 0.2;
        const [dmg, crit] = this.roll(SKILLS.spears.dmg(level));
        run.projectiles.spear(P.x, P.z, Math.cos(a), Math.sin(a), dmg, SKILLS.spears.pierce(level), crit);
      }
      run.audio.sfx('shoot', { volume: 0.55, pitch: 0.8 });
      return true;
    }
    if (w === 'gravePulse') {
      const R = SKILLS.gravePulse.radius(level) * run.stats.area;
      const [dmg, crit] = this.roll(SKILLS.gravePulse.dmg(level));
      run.fx.shockwave(P.x, P.z, R, run.heroColor, 0.4, 0.1);
      run.particles.ring(P.x, P.z, R, 48, this.cols.pulse, { life: 0.4, size: 0.5 });
      run.fx.light(P.x, P.z, R + 2, 1.4, run.heroColorObj, 0.35);
      E.query(P.x, P.z, R, (e) => { E.damage(e, dmg, { kx: e.x - P.x, kz: e.z - P.z, knock: 10, crit, source: 'pulse' }); });
      run.audio.sfx('explosion', { volume: 0.4, pitch: 1.4 });
      run.fx.shake(0.08);
      return true;
    }
    return false;
  }

  nearestN(x, z, r, n) {
    const list = this._list; list.length = 0;
    this.run.enemies.query(x, z, r, (e, d2) => { list.push([d2, e]); });
    list.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (let i = 0; i < list.length && out.length < n; i++) out.push(list[i][1]);
    return out;
  }

  jag(pts) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const seg = 5;
      for (let k = 0; k <= seg; k++) {
        const t = k / seg;
        const off = k === 0 || k === seg ? 0 : (Math.random() - 0.5) * 0.7;
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
        out.push({ x: a.x + dx * t + (-dz / l) * off, z: a.z + dz * t + (dx / l) * off });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- scythe sweeps
  startSweep(angle, R, baseDmg) {
    const arc = this.arcs.find((a) => !a.visible) || this.arcs[0];
    arc.visible = true;
    arc.scale.setScalar(R);
    arc.material.uniforms.uColor.value.copy(this.run.weaponColorObj);
    this.sweeps.push({ arc, phi0: angle, prev: angle, p: 0, dur: 0.3, R, baseDmg, id: ++this.sweepSeq });
  }

  updateSweeps(dt) {
    const run = this.run, P = run.player, E = run.enemies;
    for (let i = this.sweeps.length - 1; i >= 0; i--) {
      const s = this.sweeps[i];
      s.p += dt / s.dur;
      const p = Math.min(1, s.p);
      const head = s.phi0 - TAU * (1 - Math.pow(1 - p, 1.6));
      const span = s.prev - head;
      s.arc.position.set(P.x, 0.12, P.z);
      s.arc.material.uniforms.uHead.value = -head;
      s.arc.material.uniforms.uA.value = p < 0.85 ? 1 : (1 - p) / 0.15;
      if (span > 0) {
        E.query(P.x, P.z, s.R, (e) => {
          if (e.scytheId === s.id) return;
          const a = Math.atan2(e.z - P.z, e.x - P.x);
          const d = ((s.prev - a) % TAU + TAU) % TAU;
          if (d <= span + 0.05) {
            e.scytheId = s.id;
            const [dmg, crit] = this.roll(s.baseDmg);
            E.damage(e, dmg, { kx: e.x - P.x, kz: e.z - P.z, knock: 6, crit, source: 'scythe' });
            run.particles.burst(e.x, 1, e.z, 4, this.cols.scythe, { speed: 4, life: 0.3, size: 0.35 });
          }
        });
      }
      s.prev = head;
      if (p >= 1) { s.arc.visible = false; this.sweeps.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------- chain lightning visuals
  updateChains(dt) {
    const g = this.run.glow, c = this.cols.chain;
    for (let i = this.chainFx.length - 1; i >= 0; i--) {
      const f = this.chainFx[i];
      f.t += dt;
      const k = 1 - f.t / f.life;
      if (k <= 0) { this.chainFx.splice(i, 1); continue; }
      const pts = f.pts;
      for (let j = 0; j < pts.length - 1; j++) {
        const a = pts[j], b = pts[j + 1];
        const l = Math.hypot(b.x - a.x, b.z - a.z);
        const n = Math.max(1, Math.ceil(l / 0.22));
        for (let s = 0; s < n; s++) {
          const t = s / n;
          g.add(a.x + (b.x - a.x) * t, 1.0, a.z + (b.z - a.z) * t, 0.42 * k + 0.1, c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, k);
        }
      }
    }
  }

  // ---------------------------------------------------------------- skull halo
  updateSkulls(dt, level) {
    const run = this.run, P = run.player, E = run.enemies, g = run.glow;
    const crown = run.evolved.boneCrown;
    const n = crown ? 8 : SKILLS.skullHalo.count(level);
    const R = (crown ? 3.2 : SKILLS.skullHalo.radius(level)) * run.stats.area;
    const base = crown ? 26 : SKILLS.skullHalo.dmg(level);
    this.skullAngle += dt * 2.7;
    const sc = crown ? 1.4 : 1.1;
    _s.set(sc, sc, sc);
    for (let i = 0; i < n; i++) {
      const a = this.skullAngle + (i / n) * TAU;
      const x = P.x + Math.cos(a) * R, z = P.z + Math.sin(a) * R;
      _e.set(0, -a + Math.PI, 0);
      _q.setFromEuler(_e);
      _p.set(x, 1.0 + Math.sin(this.skullAngle * 2 + i) * 0.15, z);
      _m.compose(_p, _q, _s);
      this.skulls.setMatrixAt(i, _m);
      g.add(x, 1.0, z, 1.1, this.cols.skull[0] * 0.35, this.cols.skull[1] * 0.35, this.cols.skull[2] * 0.35, 0.8);
      if (Math.random() < dt * 20) run.particles.emit(x, 1.0, z, 0, 0.8, 0, 0.35, 0.35, 0.05, this.cols.skull[0], this.cols.skull[1], this.cols.skull[2], 0.8);
      E.query(x, z, 0.6, (e) => {
        if (e.haloCd > 0) return;
        e.haloCd = 0.35;
        const [dmg, crit] = this.roll(base);
        E.damage(e, dmg, { kx: e.x - P.x, kz: e.z - P.z, knock: 4, crit, source: 'skull' });
      });
    }
    this.skulls.count = n;
    this.skulls.instanceMatrix.needsUpdate = true;
    this.skullMat.uniforms.uTime.value += dt;
  }

  dispose() {
    for (const a of this.arcs) { a.geometry.dispose(); a.material.dispose(); }
    this.skulls.geometry.dispose(); this.skullMat.dispose();
  }
}
