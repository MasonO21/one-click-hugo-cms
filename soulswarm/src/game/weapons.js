// Shepherd weapons. Each fires on its own cooldown, scaled by the run's stats.
// Evolutions (EVOLUTIONS in data.js) upgrade a weapon in place; their tunables live in their data entries.
import * as THREE from 'three';
import { SKILLS, EVOLUTIONS } from './data.js';
import { makeArc, makeRuneCircle } from './fxmeshes.js';
import { skullGeometry } from '../engine/models.js';
import { makeCharMaterial, addInstanceAttrs } from '../engine/materials.js';
import { hdr } from '../engine/particles.js';

const TAU = Math.PI * 2;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
const WEAPONS = ['soulBolt', 'scythe', 'chains', 'spears', 'skullHalo', 'gravePulse'];
const HM = EVOLUTIONS.harvestMoon, CP = EVOLUTIONS.chainsOfPerdition, OB = EVOLUTIONS.ossuaryBarrage, RQ = EVOLUTIONS.requiem;
const EVO_OF = {}; // weapon id -> the evolution that upgrades it
for (const [id, ev] of Object.entries(EVOLUTIONS)) EVO_OF[ev.from] = id;

const MAX_SHARDS = 120;

// Crescent blade: a unit disc minus a disc centred at (CR_C, 0) that passes through the tips at ±CR_A rad.
const CR_A = 0.9, CR_C = 0.22, CR_RHO = Math.hypot(Math.cos(CR_A) - CR_C, Math.sin(CR_A));

/** Flat crescent in the XZ plane, convex edge toward -X. UVs are the shape coordinates. */
function crescentGeometry() {
  const B = Math.atan2(Math.sin(CR_A), Math.cos(CR_A) - CR_C), N = 18;
  const s = new THREE.Shape();
  for (let i = 0; i <= N; i++) { const p = CR_A + (TAU - 2 * CR_A) * (i / N); if (i) s.lineTo(Math.cos(p), Math.sin(p)); else s.moveTo(Math.cos(p), Math.sin(p)); }
  for (let i = 1; i < N; i++) { const p = TAU - B - (TAU - 2 * B) * (i / N); s.lineTo(CR_C + Math.cos(p) * CR_RHO, Math.sin(p) * CR_RHO); }
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
}

/** Additive crescent shader: saturated body, white-hot cutting edge along the outer rim, soft inner edge. */
function makeMoonMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color } },
    vertexShader: /* glsl */`varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`uniform vec3 uColor; varying vec2 vUv;
      void main() {
        float body = smoothstep(0.0, 0.14, length(vUv - vec2(${CR_C.toFixed(3)}, 0.0)) - ${CR_RHO.toFixed(4)});
        float edge = smoothstep(0.8, 0.98, length(vUv));
        gl_FragColor = vec4((uColor * (0.9 + 1.4 * body) + vec3(2.4) * edge) * body, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

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
    this.skullN = 0; this.skullXZ = new Float32Array(20);
    this.cols = {
      bolt: hdr(0x4ef2ff, 3), scythe: hdr(0xb36bff, 3), chain: hdr(0xffb347, 3.4), spear: hdr(0x9dffb8, 2.6),
      skull: hdr(0xff8a3d, 3.2), pulse: hdr(0x4ef2ff, 2.5),
      soul: hdr(run.heroColor, 3), white: [2.8, 2.8, 2.8],
      hell: hdr(0xff5a14, 3.4), hellCore: hdr(0xffb040, 3.4), flame: hdr(0xffc040, 3.6),
      bone: hdr(0xfff0d2, 1.8), marrow: hdr(0x9dffb8, 2.6),
    };
    this.hellColor = new THREE.Color(0xff6a1e); this.boneColor = new THREE.Color(0xd8ffe4);
    this._list = [];
    // shared, allocation-free hit plumbing for the per-frame loops
    this.crit = false;
    this._o = { kx: 0, kz: 0, knock: 0, crit: false, source: '', silent: false };
    this._sweepHit = (e) => this.sweepHit(e);
    this._bladeHit = (e) => this.bladeHit(e);
    this._dragHit = (e) => this.dragHit(e);
    this._blastHit = (e) => this.blastHit(e);
    this._shrapHit = (e) => this.shrapHit(e);

    // Harvest Moon: two crescents orbiting at the scythe's reach, each trailing a ground arc
    this.moonMat = makeMoonMaterial(run.weaponColorObj.clone().multiplyScalar(1.5));
    this.moons = new THREE.InstancedMesh(crescentGeometry(), this.moonMat, HM.blades);
    this.moons.count = 0; this.moons.frustumCulled = false; this.moons.renderOrder = 5;
    this.moons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    run.scene.add(this.moons);
    this.moonTrails = [];
    for (let i = 0; i < HM.blades; i++) {
      const a = makeArc(), u = a.material.uniforms;
      u.uLen.value = 2.0; u.uInner.value = 0.68; u.uA.value = 1.2; u.uColor.value.copy(run.weaponColorObj);
      this.moonTrails.push(a); run.scene.add(a);
    }
    this.moonAngle = 0; this.moonR = 0;
    this.healBank = HM.healPerSec; this.healAcc = 0; this.healTextT = 0;
    // Chains of Perdition: enemies currently burning (DoT state lives on the pooled enemy objects)
    this.burning = [];
    // Ossuary Barrage: evolved spears in flight (they burst when their life runs out) and a pool of bone shards
    this.barrage = []; this.barrageDmg = [];
    this.boomT = 0;
    const shardGeo = new THREE.OctahedronGeometry(0.1, 0).scale(0.7, 0.7, 2.6);
    this.shardMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0d2).multiplyScalar(1.15) }); // pale bone, just under bloom
    this.shards = new THREE.InstancedMesh(shardGeo, this.shardMat, MAX_SHARDS);
    this.shards.count = 0; this.shards.frustumCulled = false;
    this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    run.scene.add(this.shards);
    this.shardPool = []; // live shards are shardPool[0..shardN)
    for (let i = 0; i < MAX_SHARDS; i++) this.shardPool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 0, rx: 0, ry: 0, wx: 0, wy: 0 });
    this.shardN = 0;
    this._shown = 0;
    // Requiem: pull phase countdown, blast afterglow and the rune sigil drawn at its radius
    this.requiemT = 0; this.rqFx = 0;
    this.rune = makeRuneCircle(1);
    this.rune.visible = false;
    this.rune.material.uniforms.uColor.value.copy(run.weaponColorObj);
    run.scene.add(this.rune);
  }

  roll(base) {
    const S = this.run.stats;
    const crit = Math.random() < S.crit;
    return [base * S.dmgMul * (crit ? 2 : 1), crit];
  }

  /** Allocation-free roll: returns the damage and leaves the crit flag in this.crit. */
  hit(base) {
    const S = this.run.stats;
    this.crit = Math.random() < S.crit;
    return base * S.dmgMul * (this.crit ? 2 : 1);
  }

  /** Fill the shared damage options (Enemies.damage reads them at once and keeps nothing). */
  opts(kx, kz, knock, crit, source, silent = false) {
    const o = this._o;
    o.kx = kx; o.kz = kz; o.knock = knock; o.crit = crit; o.source = source; o.silent = silent;
    return o;
  }

  update(dt) {
    const run = this.run, lv = run.skillLv, S = run.stats;
    for (const w of WEAPONS) {
      if (!lv[w] || w === 'skullHalo') continue;
      this.timers[w] -= dt;
      if (this.timers[w] <= 0) {
        const evo = run.evolved[EVO_OF[w]] ? EVOLUTIONS[EVO_OF[w]] : null;
        const fired = this.fire(w, lv[w]);
        this.timers[w] = fired ? ((evo && evo.cd) || SKILLS[w].cd(lv[w])) / S.haste : 0.12;
      }
    }
    if (lv.skullHalo) this.updateSkulls(dt, lv.skullHalo);
    else { this.skulls.count = 0; this.skullN = 0; }
    this.updateSweeps(dt);
    this.updateChains(dt);
    this.updateMoon(dt, lv.scythe && run.evolved.harvestMoon);
    if (this.burning.length) this.updateBurns(dt);
    if (this.barrage.length) this.updateBarrage();
    if (this.shardN) this.updateShards(dt);
    this.boomT -= dt;
    this.updateRequiem(dt);
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
        const [dmg, crit] = this.roll(evolved ? 44 : SKILLS.soulBolt.dmg(level));
        run.projectiles.bolt(P.x, P.z, t, dmg, SKILLS.soulBolt.pierce(level) + (evolved ? 1 : 0), { spread: (i - (count - 1) / 2) * 0.22, explode: evolved ? 1.5 : 0, crit });
      }
      run.audio.sfx('shoot', { volume: 0.55 });
      return true;
    }
    if (w === 'scythe') {
      const moon = !!run.evolved.harvestMoon;
      const arcs = moon ? HM.arcs : SKILLS.scythe.arcs(level);
      const R = SKILLS.scythe.radius(level) * run.stats.area;
      const base = P.facing;
      for (let k = 0; k < arcs; k++) this.startSweep(base + (k * TAU) / arcs, R, moon ? HM.dmg : SKILLS.scythe.dmg(level), moon);
      run.audio.sfx('shoot', { volume: 0.5, pitch: 0.55 });
      return true;
    }
    if (w === 'chains') {
      const first = E.nearest(P.x, P.z, SKILLS.chains.range);
      if (!first) return false;
      const hell = !!run.evolved.chainsOfPerdition;
      const jumps = hell ? CP.jumps : SKILLS.chains.jumps(level);
      const base = hell ? CP.dmg : SKILLS.chains.dmg(level);
      const pts = [{ x: P.x, z: P.z }];
      const mark = ++this.sweepSeq;
      const marked = (e) => e.chainMark === mark;
      // Perdition lashes outward: links prefer targets at least minHop away and no closer to the Shepherd,
      // so the chain whips through the horde instead of knotting around her (falls back to the nearest)
      let cx = 0, cz = 0, cd2 = 0;
      const hop2 = CP.minHop * CP.minHop;
      const tooNear = (e) => e.chainMark === mark || (e.x - cx) ** 2 + (e.z - cz) ** 2 < hop2 || (e.x - P.x) ** 2 + (e.z - P.z) ** 2 < cd2;
      let cur = first;
      for (let j = 0; j < jumps && cur; j++) {
        cur.chainMark = mark;
        pts.push({ x: cur.x, z: cur.z });
        const dmg = this.hit(base);
        const from = pts[pts.length - 2];
        const killed = E.damage(cur, dmg, this.opts(cur.x - from.x, cur.z - from.z, 2, this.crit, 'chain', hell && j >= 4)); // Perdition: numbers on the first 4 links only
        const hx = cur.x, hz = cur.z, sd = dmg * SKILLS.chains.splashDmg; // scorch the foes packed around the struck one
        E.query(hx, hz, hell ? CP.splash : SKILLS.chains.splash, (o) => { if (o !== cur && o.active) E.damage(o, sd, { kx: o.x - hx, kz: o.z - hz, knock: 1, source: 'chain', silent: true }); });
        if (hell) {
          if (!killed) this.ignite(cur, dmg);
          run.particles.burst(cur.x, 1.2, cur.z, 6, this.cols.flame, { speed: 4, life: 0.4, size: 0.4, up: 1.5 });
        } else run.particles.burst(cur.x, 1, cur.z, 8, this.cols.chain, { speed: 5, life: 0.3, size: 0.35 });
        cx = cur.x; cz = cur.z;
        const cd = Math.hypot(cx - P.x, cz - P.z) - 0.5;
        cd2 = cd > 0 ? cd * cd : 0;
        cur = (hell && E.nearest(cx, cz, 4.5, tooNear)) || E.nearest(cx, cz, 4.5, marked);
      }
      // Perdition draws a second ember strand twisted around the first
      this.chainFx.push({ pts: this.jag(pts), pts2: hell ? this.jag(pts) : null, t: 0, life: hell ? 0.34 : 0.22 });
      if (hell) {
        const last = pts[pts.length - 1];
        run.fx.light(first.x, first.z, 4, 1.2, this.hellColor, 0.25);
        run.fx.light(last.x, last.z, 4, 1.0, this.hellColor, 0.25);
        run.audio.sfx('shoot', { volume: 0.55, pitch: 1.25 });
      } else {
        run.fx.light(first.x, first.z, 4, 1.2, new THREE.Color(0xffb347), 0.2);
        run.audio.sfx('shoot', { volume: 0.5, pitch: 1.7 });
      }
      return true;
    }
    if (w === 'spears') {
      const t = E.nearest(P.x, P.z, 13);
      const ang = t ? Math.atan2(t.z - P.z, t.x - P.x) : P.facing;
      const ob = !!run.evolved.ossuaryBarrage;
      const n = ob ? OB.count : SKILLS.spears.count(level);
      const spread = ob ? OB.spread : 0.2;
      // Ossuary spears fly just past the target, so the shrapnel lands in the horde on screen
      const reach = !ob ? 0 : t ? Math.min(OB.maxReach, Math.max(OB.minReach, Math.hypot(t.x - P.x, t.z - P.z) + OB.past)) : OB.maxReach;
      const shots = run.projectiles.shots;
      for (let i = 0; i < n; i++) {
        const a = ang + (i - (n - 1) / 2) * spread;
        const dmg = this.hit(ob ? OB.dmg : SKILLS.spears.dmg(level));
        run.projectiles.spear(P.x, P.z, Math.cos(a), Math.sin(a), dmg, ob ? 1e9 : SKILLS.spears.pierce(level), this.crit); // 1e9: infinite, still a small int
        // odd spears fly a little further: the bursts land in two staggered rows, a rolling barrage
        if (ob) { const s = shots[shots.length - 1]; s.life = (reach + (i & 1) * OB.stagger) / s.speed; this.barrage.push(s); this.barrageDmg.push(dmg * OB.shrapnel); }
      }
      if (ob) run.particles.burst(P.x + Math.cos(ang) * 0.8, 1, P.z + Math.sin(ang) * 0.8, 12, this.cols.bone, { speed: 4, life: 0.3, size: 0.35 });
      run.audio.sfx('shoot', { volume: 0.55, pitch: ob ? 0.65 : 0.8 });
      return true;
    }
    if (w === 'gravePulse') {
      if (run.evolved.requiem) { this.startRequiem(); return true; }
      const R = SKILLS.gravePulse.radius(level) * run.stats.area;
      const [dmg, crit] = this.roll(SKILLS.gravePulse.dmg(level));
      run.fx.shockwave(P.x, P.z, R, run.heroColor, 0.4, 0.1);
      run.particles.ring(P.x, P.z, R, 48, this.cols.pulse, { life: 0.4, size: 0.5 });
      run.fx.light(P.x, P.z, R + 2, 1.4, run.heroColorObj, 0.35);
      const knock = 10 * (run.loadout.hero.passive.pulseKnock ?? 1); // Liora's toll staggers foes instead of flinging them out of her legion's reach
      E.query(P.x, P.z, R, (e) => { E.damage(e, dmg, { kx: e.x - P.x, kz: e.z - P.z, knock, crit, source: 'pulse' }); });
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
  startSweep(angle, R, baseDmg, moon = false) {
    const arc = this.arcs.find((a) => !a.visible) || this.arcs[0];
    arc.visible = true;
    arc.scale.setScalar(R);
    arc.material.uniforms.uColor.value.copy(this.run.weaponColorObj);
    this.sweeps.push({ arc, phi0: angle, prev: angle, p: 0, dur: 0.3, R, baseDmg, id: ++this.sweepSeq, moon });
  }

  updateSweeps(dt) {
    const P = this.run.player, E = this.run.enemies;
    for (let i = this.sweeps.length - 1; i >= 0; i--) {
      const s = this.sweeps[i];
      s.p += dt / s.dur;
      const p = Math.min(1, s.p);
      const head = s.phi0 - TAU * (1 - Math.pow(1 - p, 1.6));
      const span = s.prev - head;
      s.arc.position.set(P.x, 0.12, P.z);
      s.arc.material.uniforms.uHead.value = -head;
      s.arc.material.uniforms.uA.value = p < 0.85 ? 1 : (1 - p) / 0.15;
      if (span > 0) { this._sw = s; this._span = span; E.query(P.x, P.z, s.R, this._sweepHit); }
      s.prev = head;
      if (p >= 1) { s.arc.visible = false; this.sweeps.splice(i, 1); }
    }
  }

  sweepHit(e) {
    const s = this._sw, run = this.run, P = run.player;
    if (e.scytheId === s.id) return;
    const a = Math.atan2(e.z - P.z, e.x - P.x);
    const d = ((s.prev - a) % TAU + TAU) % TAU;
    if (d > this._span + 0.05) return;
    e.scytheId = s.id;
    const dmg = this.hit(s.baseDmg);
    const killed = run.enemies.damage(e, dmg, this.opts(e.x - P.x, e.z - P.z, 6, this.crit, 'scythe'));
    run.particles.burst(e.x, 1, e.z, 4, this.cols.scythe, { speed: 4, life: 0.3, size: 0.35 });
    if (killed && s.moon) this.reap(e);
  }

  // ---------------------------------------------------------------- Harvest Moon
  updateMoon(dt, on) {
    if (!on) {
      if (this.moons.count) { this.moons.count = 0; for (const t of this.moonTrails) t.visible = false; }
      return;
    }
    const run = this.run, P = run.player, c = this.cols.soul;
    const R = SKILLS.scythe.radius(run.skillLv.scythe) * run.stats.area;
    this.moonR = R;
    this.moonAngle -= dt * HM.spin; // turns the same way as the sweeps
    this.healBank = Math.min(HM.healPerSec, this.healBank + HM.healPerSec * dt);
    for (let i = 0; i < HM.blades; i++) {
      const a = this.moonAngle + (i * TAU) / HM.blades;
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = P.x + ca * R, z = P.z + sa * R;
      this._ba = a;
      run.enemies.query(x, z, HM.bladeHit, this._bladeHit);
      // crescent with its convex edge leading (tangent of decreasing angle)
      _e.set(0, Math.atan2(-ca, -sa), 0);
      _q.setFromEuler(_e);
      _p.set(x, 1.5 + Math.sin(run.t * 5 + i * 3) * 0.12, z); // rides above the horde and the legion
      _s.set(1.3, 1.3, 1.3);
      _m.compose(_p, _q, _s);
      this.moons.setMatrixAt(i, _m);
      const tr = this.moonTrails[i];
      tr.visible = true;
      tr.position.set(P.x, 0.1, P.z);
      tr.scale.setScalar(R + 0.6);
      tr.material.uniforms.uHead.value = -a;
      // motes shed behind the blade
      if (Math.random() < dt * 45) {
        const o = (Math.random() - 0.5) * 1.2;
        run.particles.emit(x + ca * o, 0.9 + Math.random() * 0.4, z + sa * o, -sa * 2.5, 0.6, ca * 2.5, 0.5, 0.42, 0.05, c[0], c[1], c[2], 0.9, 2, 0);
      }
    }
    _s.set(1, 1, 1);
    this.moons.count = HM.blades;
    this.moons.instanceMatrix.needsUpdate = true;
    this.healTextT -= dt;
    if (this.healTextT <= 0 && this.healAcc >= 1) {
      run.fx.text(P.x, 2.3, P.z, '+' + Math.round(this.healAcc), 'heal');
      this.healAcc = 0; this.healTextT = 0.5;
    }
  }

  bladeHit(e) {
    const run = this.run, t = run.time;
    this.touch(e);
    if (e.reapUid === e.uid && t < e.reapT) return; // per-enemy cooldown, keyed to this spawn's uid
    e.reapUid = e.uid; e.reapT = t + HM.bladeCd;
    const a = this._ba, dmg = this.hit(HM.bladeDmg);
    const killed = run.enemies.damage(e, dmg, this.opts(Math.sin(a) + Math.cos(a) * 0.4, -Math.cos(a) + Math.sin(a) * 0.4, 4, this.crit, 'scythe', !this.crit && Math.random() < 0.6));
    run.particles.burst(e.x, 1, e.z, 5, this.cols.soul, { speed: 5, life: 0.3, size: 0.4 });
    if (killed) this.reap(e);
  }

  /** Harvest Moon: a scythe kill heals the Shepherd, from a bank that refills at healPerSec. */
  reap(e) {
    const P = this.run.player;
    if (this.healBank < HM.heal || P.dead || P.hp >= P.maxHp) return;
    this.healBank -= HM.heal;
    P.hp = Math.min(P.maxHp, P.hp + HM.heal);
    this.healAcc += HM.heal;
    const c = this.cols.soul, dx = P.x - e.x, dz = P.z - e.z; // a soul mote flies into the Shepherd
    this.run.particles.emit(e.x, 1, e.z, dx * 3, 1.2, dz * 3, 0.32, 0.55, 0.15, c[0], c[1], c[2], 1, 0, 0);
  }

  // ---------------------------------------------------------------- chain lightning visuals
  updateChains(dt) {
    for (let i = this.chainFx.length - 1; i >= 0; i--) {
      const f = this.chainFx[i];
      f.t += dt;
      if (f.t >= f.life) this.chainFx.splice(i, 1);
    }
  }

  renderChains(g) {
    for (let i = 0; i < this.chainFx.length; i++) {
      const f = this.chainFx[i];
      const k = Math.max(0, 1 - f.t / f.life);
      if (f.pts2) { // Perdition: drawn above head height so the bodies never hide it
        this.strand(g, f.pts, 0.32, 0.42 * k + 0.1, this.cols.hell, 0.36, k, true, 1.4);
        this.strand(g, f.pts2, 0.26, 0.18 * k + 0.05, this.cols.hellCore, 0.4, k, false, 1.4);
      } else this.strand(g, f.pts, 0.22, 0.42 * k + 0.1, this.cols.chain, 0.6, k, false, 1.0);
    }
  }

  /** Glow sprites along a polyline; beads alternate size so the chain reads as links. */
  strand(g, pts, step, size, c, i, a, beads, y) {
    let n2 = 0;
    for (let j = 0; j < pts.length - 1; j++) {
      const A = pts[j], B = pts[j + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(B.x - A.x, B.z - A.z) / step));
      for (let s = 0; s < n; s++, n2++) {
        const t = s / n;
        g.add(A.x + (B.x - A.x) * t, y, A.z + (B.z - A.z) * t, beads && n2 & 1 ? size * 0.55 : size, c[0] * i, c[1] * i, c[2] * i, a);
      }
    }
  }

  /** Give a pooled enemy every evolution field at once, in one fixed order: one extra hidden class, not a zoo. */
  touch(e) {
    if (e.burnUid !== undefined) return;
    e.burnUid = 0; e.burnT = 0; e.burnPool = 0; e.burnTick = 0; e.burnRaise = 0; e.burnListed = false; e.reapUid = 0; e.reapT = 0;
  }

  // ---------------------------------------------------------------- Chains of Perdition (burning)
  ignite(e, dmg) {
    this.touch(e);
    if (e.burnUid !== e.uid) { e.burnUid = e.uid; e.burnPool = 0; e.burnTick = CP.burnTick; e.burnRaise = CP.raise; }
    if (!e.burnListed) { e.burnListed = true; this.burning.push(e); }
    e.burnPool += dmg * CP.burn;
    e.burnT = CP.burnTime;
  }

  updateBurns(dt) {
    const list = this.burning, E = this.run.enemies, parts = this.run.particles, f = this.cols.flame, tick = CP.burnTick;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.active && e.burnUid === e.uid) {
        e.burnT -= dt; e.burnTick -= dt;
        if (e.burnTick <= 0) {
          e.burnTick += tick;
          const d = (e.burnPool * tick) / Math.max(tick, e.burnT + tick); // spread what is left over the remaining ticks
          e.burnPool -= d;
          const f0 = e.flash;
          E.damage(e, d, this.opts(0, 0, 0, false, 'burn', true));
          e.flash = Math.max(f0, 0.3); // a faint flicker, not a full white hit-flash on every tick
        }
        if (e.active && e.burnT > 0) {
          if (Math.random() < dt * 18) parts.emit(e.x + (Math.random() - 0.5) * 0.4, 0.9 * e.scale + Math.random() * 0.3, e.z + (Math.random() - 0.5) * 0.4, 0, 2.5 + Math.random() * 1.5, 0, 0.5, 0.55, 0.05, f[0], f[1], f[2], 0.9, 1.5, -2);
          list[w++] = e;
          continue;
        }
      }
      e.burnUid = 0; e.burnListed = false; // burnt out, dead or recycled: never leave a stale flag on a pooled enemy
    }
    list.length = w;
  }

  // ---------------------------------------------------------------- Ossuary Barrage (shrapnel)
  updateBarrage() {
    const list = this.barrage, dmg = this.barrageDmg; // parallel arrays: no extra fields on projectile objects
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s.life <= 0) this.shrapnel(s.x, s.z, dmg[i], i);
      else { list[w] = s; dmg[w++] = dmg[i]; }
    }
    list.length = w; dmg.length = w;
  }

  shrapnel(x, z, dmg, i) {
    const run = this.run, R = OB.shrapnelR;
    this._sx = x; this._sz = z; this._sd = dmg; this._shown = 0;
    run.enemies.query(x, z, R, this._shrapHit);
    // bone shards (real meshes) arc out, bounce and settle; sparks and a marrow-green ring mark the blast
    for (let k = 0; k < OB.shards && this.shardN < MAX_SHARDS; k++) {
      const s = this.shardPool[this.shardN++], a = Math.random() * TAU, sp = 5 + Math.random() * 6;
      s.x = x; s.y = 0.9; s.z = z; s.vx = Math.cos(a) * sp; s.vz = Math.sin(a) * sp; s.vy = 3 + Math.random() * 5;
      s.t = 0; s.life = 0.55 + Math.random() * 0.35; s.rx = Math.random() * TAU; s.ry = a; s.wx = (Math.random() - 0.5) * 24; s.wy = (Math.random() - 0.5) * 12;
    }
    run.particles.burst(x, 0.9, z, 10, this.cols.bone, { speed: 8, life: 0.45, size: 0.3, sizeEnd: 0.1, up: 1, grav: 16, drag: 2 });
    run.particles.burst(x, 0.7, z, 6, this.cols.marrow, { speed: 3, life: 0.3, size: 0.6 });
    run.particles.ring(x, z, R, 16, this.cols.bone, { life: 0.3, size: 0.3, y: 0.4 });
    run.fx.shockwave(x, z, R, 0x3fd47a, 0.26, 0.1);
    if (i % 2 === 0) run.fx.light(x, z, 3.5, 1.0, this.boneColor, 0.25);
    if (this.boomT <= 0) { this.boomT = 0.3; run.audio.sfx('explosion', { volume: 0.3, pitch: 1.8 }); run.fx.shake(0.04); }
  }

  shrapHit(e) {
    this.run.enemies.damage(e, this._sd, this.opts(e.x - this._sx, e.z - this._sz, 3, false, 'spear', this._shown++ >= 2)); // 2 numbers per burst
  }

  updateShards(dt) {
    const pool = this.shardPool;
    for (let i = this.shardN - 1; i >= 0; i--) {
      const s = pool[i];
      s.t += dt;
      if (s.t >= s.life) { pool[i] = pool[this.shardN - 1]; pool[this.shardN - 1] = s; this.shardN--; continue; } // swap-remove, no allocation
      s.vy -= 22 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      if (s.y < 0.08) { s.y = 0.08; s.vy *= -0.35; s.vx *= 0.55; s.vz *= 0.55; s.wx *= 0.5; s.wy *= 0.5; }
      s.rx += s.wx * dt; s.ry += s.wy * dt;
    }
  }

  // ---------------------------------------------------------------- Requiem
  startRequiem() {
    const run = this.run, P = run.player, R = RQ.radius * run.stats.area, c = this.cols.soul;
    this.requiemT = RQ.pull;
    // implosion: motes converge on the Shepherd exactly as the drag ends
    const n = Math.round(48 * run.particles.budget);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.1, ca = Math.cos(a), sa = Math.sin(a), r = R * (0.85 + Math.random() * 0.3);
      run.particles.emit(P.x + ca * r, 0.3 + Math.random() * 0.7, P.z + sa * r, (-ca * r) / RQ.pull, 0, (-sa * r) / RQ.pull, RQ.pull, 0.8, 0.25, c[0], c[1], c[2], 1, 0, 0);
    }
    run.audio.sfx('shoot', { volume: 0.45, pitch: 0.35 });
  }

  updateRequiem(dt) {
    const run = this.run, P = run.player, rune = this.rune, u = rune.material.uniforms;
    const R = RQ.radius * run.stats.area;
    if (this.requiemT > 0) {
      this.requiemT -= dt;
      this._dt = dt;
      run.enemies.query(P.x, P.z, R, this._dragHit);
      if (this.requiemT <= 0) this.detonate(R);
    }
    // the sigil gathers and spins during the drag, flares on the blast, then fades
    if (this.requiemT > 0 || this.rqFx > 0) {
      rune.visible = true;
      rune.position.set(P.x, 0.07, P.z);
      if (this.requiemT > 0) {
        const p = 1 - this.requiemT / RQ.pull;
        rune.scale.setScalar(R * (1.3 - 0.3 * p));
        rune.rotation.y += dt * 7;
        u.uAlpha.value = 0.4 + p * 0.9;
      } else {
        this.rqFx -= dt;
        const k = Math.max(0, this.rqFx / 0.45);
        rune.scale.setScalar(R * (1.12 - 0.12 * k));
        rune.rotation.y += dt * 2;
        u.uAlpha.value = k * k * 1.2;
      }
      u.uTime.value += dt;
    } else if (rune.visible) rune.visible = false;
  }

  dragHit(e) {
    if (e.mass >= 50) return; // the boss does not budge
    const P = this.run.player;
    const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1;
    const k = ((RQ.pullForce * this._dt) / Math.max(1, e.mass * 0.6)) * Math.min(1, d / 1.5) / d;
    e.kx += (dx - dz * RQ.swirl) * k;
    e.kz += (dz + dx * RQ.swirl) * k;
  }

  detonate(R) {
    const run = this.run, P = run.player;
    this._bd = this.hit(RQ.dmg); this._bc = this.crit; this._shown = 0;
    run.enemies.query(P.x, P.z, R, this._blastHit);
    run.fx.shockwave(P.x, P.z, R, run.heroColor, 0.45, 0.12);
    run.fx.shockwave(P.x, P.z, R * 0.55, run.heroColor, 0.3, 0.2);
    run.particles.ring(P.x, P.z, R, 64, this.cols.soul, { life: 0.45, size: 0.75 });
    run.particles.burst(P.x, 0.8, P.z, 14, this.cols.white, { speed: 9, life: 0.35, size: 0.45, up: 0.5 });
    run.fx.light(P.x, P.z, R + 3, 1.8, run.heroColorObj, 0.45);
    run.fx.shake(0.12);
    run.pickups.magnetNear(P.x, P.z, RQ.shardR);
    run.audio.sfx('explosion', { volume: 0.5, pitch: 0.85 });
    this.rqFx = 0.45;
  }

  blastHit(e) {
    const P = this.run.player;
    this.run.enemies.damage(e, this._bd, this.opts(e.x - P.x, e.z - P.z, 8 * (this.run.loadout.hero.passive.pulseKnock ?? 1), this._bc, 'pulse', this._shown++ >= 6)); // 6 numbers per blast
  }

  // ---------------------------------------------------------------- skull halo
  updateSkulls(dt, level) {
    const run = this.run, P = run.player, E = run.enemies;
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
      this.skullXZ[i * 2] = x; this.skullXZ[i * 2 + 1] = z;
      if (Math.random() < dt * 20) run.particles.emit(x, 1.0, z, 0, 0.8, 0, 0.35, 0.35, 0.05, this.cols.skull[0], this.cols.skull[1], this.cols.skull[2], 0.8);
      E.query(x, z, 0.6, (e) => {
        if (e.haloCd > 0) return;
        e.haloCd = 0.35;
        const [dmg, crit] = this.roll(base);
        E.damage(e, dmg, { kx: e.x - P.x, kz: e.z - P.z, knock: 4, crit, source: 'skull' });
      });
    }
    _s.set(1, 1, 1);
    this.skullN = n;
    this.skulls.count = n;
    this.skulls.instanceMatrix.needsUpdate = true;
    this.skullMat.uniforms.uTime.value += dt;
  }

  // ---------------------------------------------------------------- glow pass
  /** Called from Run.render() after the glow buffer is reset, so every weapon glow is drawn here. */
  render() {
    const run = this.run, g = run.glow, P = run.player;
    const sk = this.cols.skull;
    for (let i = 0; i < this.skullN; i++) g.add(this.skullXZ[i * 2], 1.0, this.skullXZ[i * 2 + 1], 1.1, sk[0] * 0.35, sk[1] * 0.35, sk[2] * 0.35, 0.8);
    this.renderChains(g);
    if (this.moons.count) {
      const c = this.cols.soul, R = this.moonR;
      for (let i = 0; i < HM.blades; i++) {
        const a = this.moonAngle + (i * TAU) / HM.blades;
        g.add(P.x + Math.cos(a) * R, 1.5, P.z + Math.sin(a) * R, 2.4, c[0] * 0.22, c[1] * 0.22, c[2] * 0.22, 0.9);
        for (let k = 1; k <= 4; k++) { // fading wake along the orbit, behind the blade
          const b = a + k * 0.17, f = 1 - k / 5;
          g.add(P.x + Math.cos(b) * R, 1.4, P.z + Math.sin(b) * R, 1.3 * f + 0.3, c[0] * 0.3 * f, c[1] * 0.3 * f, c[2] * 0.3 * f, f);
        }
      }
    }
    const fl = this.cols.flame, list = this.burning;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.active || e.burnUid !== e.uid) continue;
      const fk = 0.85 + 0.25 * Math.sin(run.t * 23 + e.phase * 7);
      g.add(e.x, 1.25 * e.scale, e.z, 1.0 * fk * e.scale, fl[0] * 0.4, fl[1] * 0.4, fl[2] * 0.4, 0.9);
      g.add(e.x, 1.4 * e.scale, e.z, 0.35 * fk, 2.2, 1.9, 1.2, 0.9); // white-hot heart of the flame
    }
    for (let i = 0; i < this.shardN; i++) {
      const s = this.shardPool[i], k = Math.min(1, (s.life - s.t) / 0.2) * 1.15; // shrink away at the end
      _e.set(s.rx, s.ry, 0);
      _q.setFromEuler(_e);
      _p.set(s.x, s.y, s.z); _s.set(k, k, k);
      _m.compose(_p, _q, _s);
      this.shards.setMatrixAt(i, _m);
    }
    _s.set(1, 1, 1);
    this.shards.count = this.shardN;
    if (this.shardN) this.shards.instanceMatrix.needsUpdate = true;
    const bo = this.cols.bone, mw = this.cols.marrow;
    for (let i = 0; i < this.barrage.length; i++) {
      const s = this.barrage[i];
      const l = Math.hypot(s.vx, s.vz) || 1, ux = s.vx / l, uz = s.vz / l;
      g.add(s.x, s.y, s.z, 1.6, mw[0] * 0.3, mw[1] * 0.3, mw[2] * 0.3, 0.8);
      for (let k = 1; k <= 3; k++) g.add(s.x - ux * k * 0.45, s.y, s.z - uz * k * 0.45, 0.75 - k * 0.13, bo[0] * 0.4, bo[1] * 0.4, bo[2] * 0.4, 1 - k * 0.25);
    }
  }

  dispose() {
    for (const a of [...this.arcs, ...this.moonTrails]) { a.geometry.dispose(); a.material.dispose(); }
    this.skulls.geometry.dispose(); this.skullMat.dispose();
    this.moons.geometry.dispose(); this.moonMat.dispose();
    this.shards.geometry.dispose(); this.shardMat.dispose();
    this.rune.geometry.dispose(); this.rune.material.dispose();
  }
}
