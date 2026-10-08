// The horde: pooled enemies, instanced rendering, spatial hash, AI and damage.
// Signature moves: Ghoul packs flank and lunge, Brutes slam a cone, Cinder Witches lob onto telegraphed circles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as DATA from './data.js';
import { ENEMIES, ELITE, BOSS } from './data.js';
import { makeCharMaterial, addInstanceAttrs } from '../engine/materials.js';
import { enemyGeometry } from '../engine/models.js';
import { foeModel, loadFoeModel, setGait } from '../engine/foemodels.js';
import { hdr } from '../engine/particles.js';

const TYPES = ['husk', 'ghoul', 'brute', 'witch', 'bloater'];
const MAX_PER = { husk: 320, ghoul: 160, brute: 70, witch: 70, bloater: 60 };
const CELL = 2.0, GRID = 64, GRID_MASK = 63;
// Taunt (contract with the Legion): enemies steer to the nearest run.legion.taunters minion within this radius.
// Read MINIONS off the namespace so it is just undefined (radius 3) until the Legion branch adds that export.
const MINIONS = Reflect.get(DATA, 'MINIONS');
const TAUNT_R = (MINIONS && MINIONS.bulwark && MINIONS.bulwark.taunt) || 3;
const HEAD = { husk: 1.4, ghoul: 0.85, brute: 2.25, witch: 2.35, bloater: 1.5 }; // crown height above the model origin
const MAX_CROWNS = 24;
const CONE_COL = 0xff4a2a;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _q2 = new THREE.Quaternion(), _xAxis = new THREE.Vector3(1, 0, 0);

/** A tiny gold crown (band + five spikes) floated above elites so they read at a glance. */
function crownGeometry() {
  const parts = [new THREE.CylinderGeometry(0.3, 0.25, 0.14, 10, 1, true)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, c = new THREE.ConeGeometry(0.07, 0.3, 4);
    c.translate(Math.cos(a) * 0.27, 0.21, Math.sin(a) * 0.27);
    parts.push(c);
  }
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

export class Enemies {
  constructor(run) {
    this.run = run;
    this.active = [];
    this.pool = [];
    this.head = new Int32Array(GRID * GRID).fill(-1); // -1 = empty cell (0 would be a valid index)
    this.next = new Int32Array(2048);
    this.time = 0;
    this.rim = new THREE.Color(run.chapter.enemy).multiplyScalar(0.55).getHex();
    this.mat = makeCharMaterial({ rim: this.rim, emit: 2.8, anim: 1, ambient: 0x3a3236, key: 0x9a9098, plRadius: 6 });
    this.mats = [this.mat];
    this.meshes = {};
    for (const t of TYPES) {
      const mesh = new THREE.InstancedMesh(enemyGeometry(t), this.mat, MAX_PER[t]);
      mesh.count = 0;
      mesh.frustumCulled = false;
      const attrs = addInstanceAttrs(mesh, MAX_PER[t]);
      run.scene.add(mesh);
      this.meshes[t] = { mesh, attrs, n: 0, head: HEAD[t], painted: false };
      // the painted model replaces the procedural one as soon as it is ready (at once when it was preloaded); the Low
      // quality setting keeps the light procedural horde (a painted foe is ~1,600-2,400 triangles, hundreds at once)
      if (run.engine.qName === 'low') continue;
      const m = foeModel(t);
      if (m) this.usePainted(t, m);
      else loadFoeModel(t).then((pm) => { if (pm && !this.disposed) this.usePainted(t, pm); });
    }
    this.color = new THREE.Color(run.chapter.enemy);
    this.eliteColor = new THREE.Color(0xffd04a);
    this.burstCol = hdr(run.chapter.enemy, 3.2);
    this.eliteBurst = hdr(0xffd04a, 3.5);
    this.counts = { husk: 0, ghoul: 0, brute: 0, witch: 0, bloater: 0, boss: 0 };
    this.uidSeq = 0;
    this.crowns = new THREE.InstancedMesh(crownGeometry(), new THREE.MeshBasicMaterial({ color: new THREE.Color(ELITE.crown).multiplyScalar(2.6) }), MAX_CROWNS);
    this.crowns.count = 0; this.crowns.frustumCulled = false;
    this.crowns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    run.scene.add(this.crowns);
    this.crownGlow = hdr(ELITE.crown, 1.2);
    this.slamCol = hdr(0xff8a3d, 3);
    this.slamLight = new THREE.Color(0xff7a2e);
  }

  get count() { return this.active.length; }

  /** The Shepherd's lantern lights every foe near it (procedural and painted materials alike). */
  setLight(x, z, color) {
    for (const m of this.mats) { m.uniforms.uPLPos.value.set(x, 1.6, z); m.uniforms.uPLColor.value.copy(color).multiplyScalar(0.45); }
  }

  /** Swaps a type's procedural mesh for its painted model: dark painted shapes rim-lit in the chapter's foe colour,
   *  whose glowing paint (eyes, ember cracks) burns in that colour too (gold on elites), walked by the shader. */
  usePainted(t, m) {
    const M = this.meshes[t];
    const mat = makeCharMaterial({ map: m.map, glow: m.glow, glowTint: 0.65, rim: this.rim, rimK: 0.12, emit: 2.8, anim: 1, gait: true,
      ambient: 0x9a96a4, key: 0xb4b0bc, plRadius: 6 });
    setGait(mat, m);
    mat.uniforms.uTime.value = this.time;
    M.mesh.geometry.dispose();
    M.mesh.geometry = m.geometry.clone();
    M.mesh.material = mat;
    M.attrs = addInstanceAttrs(M.mesh, MAX_PER[t]);
    M.head = m.h * 0.92;
    M.painted = true;
    this.mats.push(mat);
  }

  spawn(type, x, z, { elite = false, hpMul = 1, dmgMul = 1 } = {}) {
    if (type !== 'boss' && this.counts[type] >= MAX_PER[type]) return null;
    const d = type === 'boss' ? BOSS : ENEMIES[type];
    const e = this.pool.pop() || {};
    e.pooled = false;
    e.active = true; e.type = type; e.elite = elite;
    e.uid = ++this.uidSeq; // unique per spawn, so stale references to a recycled object can be detected
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
    e.moveCd = 0; e.lx = 0; e.lz = 1; e.flank = 0; // signature move: cooldown, locked direction, pack flank angle
    e.lastHitBy = null;
    e.aff = null; e.ev = null; // elite affixes (affixes.js) and run-event ownership (events.js)
    e.stunT = 0; e.riteId = 0; e.riteT = 0; // Hero Rites: stun timer, per-cast hit mark, per-foe hit cooldown
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
    const T = run.legion.taunters, nT = T ? T.length : 0; // Bulwark taunters (Legion variants); inert while absent or empty
    // Bulwarks stay leashed near the Shepherd: enemies beyond the farthest one's reach skip the taunter scan
    let tReach = 0;
    for (let k = 0; k < nT; k++) { const m = T[k]; if (m && m.hp > 0) tReach = Math.max(tReach, Math.hypot(m.x - P.x, m.z - P.z)); }
    tReach = nT ? tReach + TAUNT_R + 0.5 : 0;
    this.rebuildGrid();
    for (let i = 0; i < a.length; i++) {
      const e = a[i];
      if (!e.active) continue;
      e.spawnT += dt;
      e.flash = Math.max(0, e.flash - dt * 7);
      e.atkCd -= dt;
      e.haloCd -= dt;
      e.moveCd -= dt;
      if (e.type === 'boss') { run.boss.update(e, dt); continue; }
      if (e.ev) { run.events.drive(e, dt); continue; } // the Soul Thief and the Cursed Coffin move on their own
      if (e.stunT > 0) { e.stunT -= dt; this.drift(e, dt); continue; } // stunned: no steering and no attacks
      const pdist = Math.hypot(P.x - e.x, P.z - e.z) || 0.001;
      // taunt: the nearest taunter within range replaces the Shepherd as the target
      let tm = null;
      if (pdist < tReach && e.type !== 'bloater') { // Bloaters ignore taunts: they only ever want the Shepherd
        let bd = TAUNT_R * TAUNT_R;
        for (let k = 0; k < nT; k++) {
          const m = T[k];
          if (!m || m.hp <= 0) continue;
          const d2 = (m.x - e.x) * (m.x - e.x) + (m.z - e.z) * (m.z - e.z);
          if (d2 < bd) { bd = d2; tm = m; }
        }
      }
      const tgt = tm || P;
      let dx = tgt.x - e.x, dz = tgt.z - e.z;
      const dist = tm ? Math.hypot(dx, dz) || 0.001 : pdist;
      dx /= dist; dz /= dist;
      let speed = e.speed;
      let sx = dx, sz = dz, wobble = true; // steering direction
      const d = ENEMIES[e.type];

      if (e.type === 'ghoul') {
        // pack flanking → crouch (telegraph) → lunge along the locked direction → recover
        // (a telegraph starts at -dt: the frame that shows it doesn't count, so its full duration is visible)
        const L = d.lunge;
        if (e.state === 0) {
          if (dist < L.range && e.moveCd <= 0 && e.spawnT > 0.3) {
            // lock onto where the target will be when the lunge starts: running straight past a crouch gets punished
            const ax = tgt.x + (tgt.vx || 0) * L.lead - e.x, az = tgt.z + (tgt.vz || 0) * L.lead - e.z, al = Math.hypot(ax, az) || 1;
            e.state = 1; e.stateT = -dt; e.lx = ax / al; e.lz = az / al;
          } else if (e.flank) {
            const f = e.flank * Math.min(1, Math.max(0, (dist - 3) / 3.5)), c = Math.cos(f), s = Math.sin(f);
            sx = dx * c - dz * s; sz = dx * s + dz * c;
          }
        }
        if (e.state) {
          e.stateT += dt; wobble = false; sx = e.lx; sz = e.lz;
          if (e.state === 1) {
            speed = 0;
            e.flash = Math.max(e.flash, 0.3 + 0.2 * Math.sin(e.stateT * 45));
            if (e.stateT >= L.crouch - 1e-6) { e.state = 2; e.stateT = 0; if (pdist < 14) run.audio.sfx('lunge', { volume: 0.85 }); }
          } else if (e.state === 2) {
            speed = L.speed;
            if (e.stateT >= L.dur) { e.state = 3; e.stateT = 0; }
          } else {
            speed = e.speed * L.crawl;
            if (e.stateT >= L.recover) { e.state = 0; e.moveCd = L.cd; }
          }
        }
      } else if (e.type === 'brute') {
        // wind up (rear back, cone telegraph) → slam → recover
        const S = d.slam;
        if (e.state === 0 && dist < S.range * e.scale && e.moveCd <= 0 && e.spawnT > 0.5) {
          e.state = 1; e.stateT = -dt; e.lx = dx; e.lz = dz;
          run.hazards.cone(e, 1, dx, dz, S.reach * e.scale, S.arc, S.windup, CONE_COL);
          if (pdist < 14) run.audio.sfx('growl', { volume: 0.55 });
        }
        if (e.state) {
          e.stateT += dt; wobble = false; sx = e.lx; sz = e.lz; speed = 0;
          if (e.state === 1) {
            const k = e.stateT / S.windup; // the pulse quickens toward the slam
            e.flash = Math.max(e.flash, (0.1 + 0.3 * k) * (0.6 + 0.4 * Math.sin(e.stateT * (10 + 26 * k))));
            if (e.stateT >= S.windup - 1e-6) { this.slam(e, S); e.state = 2; e.stateT = 0; }
          } else if (e.stateT >= S.recover) { e.state = 0; e.moveCd = S.cd; }
        }
      } else if (e.type === 'witch') {
        // keep range and lob onto the target's predicted position
        e.shootCd -= dt;
        if (dist < d.ranged.range) {
          speed = dist < d.ranged.range * 0.6 ? -e.speed * 0.6 : 0;
          if (e.shootCd <= 0) {
            const lead = d.lob.lead;
            e.shootCd = d.ranged.cooldown * (0.85 + Math.random() * 0.3);
            run.projectiles.lob(e.x + dx * 0.4, e.z + dz * 0.4, tgt.x + (tgt.vx || 0) * lead, tgt.z + (tgt.vz || 0) * lead, e.dmg, d.lob, run.mods.burn);
            e.flash = Math.max(e.flash, 0.7);
          }
        }
      } else if (e.type === 'bloater') {
        if (e.state === 0 && dist < 2.4) {
          e.state = 1; e.stateT = -dt; // the frame that shows the telegraph doesn't count against the 1.0 s fuse
          run.fx.telegraph(e.x, e.z, d.explode.radius, d.explode.fuse, 0xff6a2e);
        }
        if (e.state === 1) {
          speed = e.speed * 0.25;
          e.stateT += dt;
          e.flash = 0.5 + 0.5 * Math.sin(e.stateT * 30);
          if (e.stateT >= d.explode.fuse - 1e-6) { this.explodeBloater(e); continue; }
        }
      }

      if (e.slowUid === e.uid && e.slowT > this.time) speed *= e.slowMul; // a broken ward's stagger, a Commander's rout (affixes.js)
      // steer toward the target (with a little orbiting wobble so packs flow around)
      if (wobble) {
        const wob = Math.sin(this.time * 1.3 + e.phase) * 0.35, wx = sx - sz * wob;
        sz += sx * wob; sx = wx;
      }
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
      // face the travel direction; a standing, crouching or winding-up enemy faces its aim
      const tr = speed > 0.05 ? Math.atan2(e.vx, e.vz) : Math.atan2(sx, sz);
      let dr = tr - e.rot; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      e.rot += dr * Math.min(1, dt * (wobble ? 8 : 16));

      // contact damage: a taunted enemy hits its taunter instead of the Shepherd
      if (tm) {
        if (dist < e.radius + (tm.radius || 0.4) && e.atkCd <= 0) { e.atkCd = 0.8; run.legion.hitMinion(tm, e.dmg); }
      } else if (dist < e.radius + P.radius && e.atkCd <= 0) {
        e.atkCd = 0.8;
        P.hurt(e.dmg);
      }
      // despawn stragglers that fell far behind (they respawn ahead via the director)
      if (pdist > 42) this.remove(e);
    }
    // compact, then rebuild so the grid indexes the compacted list for everyone querying after us
    this.compact();
    this.rebuildGrid();
    // the horde's ranged and ground threats tick with it
    run.projectiles.updateLobs(dt);
    run.hazards.update(dt);
  }

  /** Brute slam: everything in the cone (Shepherd and minions) takes dmgMul × damage and is knocked back. */
  slam(e, S) {
    const run = this.run, P = run.player, reach = S.reach * e.scale, cosA = Math.cos(S.arc), dmg = e.dmg * S.dmgMul;
    const lx = e.lx, lz = e.lz;
    let dx = P.x - e.x, dz = P.z - e.z;
    const pd = Math.hypot(dx, dz) || 0.001;
    dx /= pd; dz /= pd;
    // the Shepherd's body counts: widen the angular test by the angle his radius subtends
    if (pd < reach + P.radius && (pd < 0.8 || Math.acos(Math.max(-1, Math.min(1, dx * lx + dz * lz))) <= S.arc + Math.atan(P.radius / pd))) {
      P.hurt(dmg);
      P.knock(dx * S.knock, dz * S.knock);
    }
    const L = run.legion, list = L.list;
    for (let i = 0; i < list.length; i++) {
      const m = list[i], mx = m.x - e.x, mz = m.z - e.z, md = Math.hypot(mx, mz) || 0.001;
      if (md > reach + 0.3 || (md > 0.6 && (mx * lx + mz * lz) / md < cosA)) continue;
      if (L.hitMinion) L.hitMinion(m, dmg); else m.hp -= dmg;
      m.vx += (mx / md) * S.knock; m.vz += (mz / md) * S.knock;
    }
    // fx: a fan of dust along the cone, a shockwave, and a shake that fades with distance
    const base = Math.atan2(lx, lz), c = this.slamCol, sp = reach * 3.2;
    for (let k = 0; k < 18; k++) {
      const ang = base + (k / 17 * 2 - 1) * S.arc, sa = Math.sin(ang), ca = Math.cos(ang);
      run.particles.emit(e.x + sa * 0.6, 0.25, e.z + ca * 0.6, sa * sp, 0.4, ca * sp, 0.38, 0.75, 0.2, c[0], c[1], c[2], 1, 3, 0);
    }
    const cx = e.x + lx * reach * 0.55, cz = e.z + lz * reach * 0.55;
    run.particles.burst(cx, 0.3, cz, 20, c, { speed: 5, life: 0.45, size: 0.5, up: 0.5 });
    run.fx.shockwave(cx, cz, reach * 0.75, 0xff7a2e, 0.35, 0.2);
    run.fx.light(cx, cz, 5, 1.8, this.slamLight, 0.35);
    if (pd < 12) {
      run.fx.shake(0.06 + 0.3 * (1 - pd / 12));
      run.audio.sfx('slam', { volume: 0.6 });
    }
  }

  /** Stun (Hero Rites): t s without steering or attacking; knockback still carries it. A wind-up or fuse in progress is
   *  called off (a Brute's cone follows its state; a Bloater's fuse circle is put out). a boss is never stunned: its
   *  next attack only slips back by RITES.bossStagger. */
  stun(e, t) {
    if (!e.active || !(t > 0) || e.ev) return; // event entities (Soul Thief, Cursed Coffin) keep their own script
    if (e.type === 'boss') { const B = this.run.boss; if (B.state === 'chase') B.cd += DATA.RITES.bossStagger; return; }
    if (e.state && e.type !== 'witch') {
      if (e.type === 'bloater') for (const T of this.run.fx.teles) if (T.active && !T.onDone && (T.mesh.position.x - e.x) ** 2 + (T.mesh.position.z - e.z) ** 2 < 1.5) { T.active = false; T.mesh.visible = false; }
      e.state = 0; e.stateT = 0;
    }
    e.stunT = Math.max(e.stunT, t);
  }

  /** A stunned enemy only drifts on its knockback, which fades as usual. */
  drift(e, dt) {
    const k = Math.exp(-8 * dt);
    e.kx *= k; e.kz *= k; e.vx = e.kx; e.vz = e.kz;
    e.x += e.vx * dt; e.z += e.vz * dt;
  }

  /** Drop dead entries and only now return them to the pool, so a spawn can never re-add an object still listed. */
  compact() {
    const a = this.active;
    if (!a.some((e) => !e.active)) return;
    const keep = [];
    for (const e of a) { if (e.active) keep.push(e); else if (!e.pooled) { e.pooled = true; this.pool.push(e); } }
    this.active = keep;
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
    if (e.aff && e.aff.ward > 0) amount = this.run.affixes.absorb(e, amount); // a Warded elite's soul ward soaks most of it
    e.hp -= amount;
    e.flash = 1;
    e.lastHitBy = o.source || null;
    if (o.source === 'pulse') { const m = this.run.loadout.hero.passive.pulseMark; if (m) { e.tollT = Math.max(e.tollUid === e.uid ? e.tollT : 0, this.run.time + m); e.tollUid = e.uid; } } // Liora's toll (uid-keyed: pooled enemies never inherit it); never cuts a Death Knell's longer toll short
    if (o.knock && e.mass < 50) {
      const l = Math.hypot(o.kx || 0, o.kz || 0) || 1;
      const k = o.knock / Math.max(1, e.mass * 0.6);
      e.kx += (o.kx / l) * k; e.kz += (o.kz / l) * k;
    }
    const run = this.run;
    // the boss filters its own damage (Nova at 50% and capped, immunity): show what actually landed
    let shown = amount;
    if (e.type === 'boss') { const before = e.hp + amount; run.boss.onHit(e); shown = before - e.hp; }
    if (!o.silent && shown >= 0.5) {
      const y = 1.4 * e.scale + (e.type === 'boss' ? 3 : 0);
      if (o.source === 'minion') { if (Math.random() < 0.18) run.fx.text(e.x, y, e.z, Math.round(shown), 'minion'); }
      else run.fx.text(e.x, y, e.z, Math.round(shown), o.crit ? 'crit' : 'dmg');
    }
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
  }

  clearAll(withFx = true) {
    for (const e of this.active) {
      if (!e.active || e.type === 'boss') continue;
      if (withFx) this.run.particles.burst(e.x, 0.7, e.z, 6, this.burstCol, { speed: 4, life: 0.5, size: 0.4 });
      this.remove(e);
    }
    this.compact();
    this.rebuildGrid();
    // their lobs in flight, burning ground and a Splitter's pending burst go with them
    this.run.projectiles.clearLobs();
    this.run.hazards.clear();
    this.run.affixes.splits.length = 0;
  }

  render() {
    for (const t of TYPES) this.meshes[t].n = 0;
    const c = this.color, ec = this.eliteColor, g = this.run.glow, cg = this.crownGlow;
    let nc = 0;
    for (const e of this.active) {
      if (!e.active || e.type === 'boss' || e.ev) continue; // event-owned enemies draw their own mesh (events.js)
      const M = this.meshes[e.type];
      const i = M.n++;
      const pop = Math.min(1, e.spawnT * 4);
      let sc = e.scale * (0.3 + 0.7 * pop);
      if (e.type === 'bloater' && e.state === 1) sc *= 1 + e.stateT * 0.35;
      let sx = sc, sy = sc, sz = sc, tilt = 0;
      if (e.state && e.type === 'ghoul') {
        if (e.state === 1) { const k = Math.min(1, e.stateT * 10); sx = sz = sc * (1 + 0.22 * k); sy = sc * (1 - 0.38 * k); } // crouch
        else if (e.state === 2) { sx = sc * 0.85; sy = sc * 0.8; sz = sc * 1.4; } // lunge stretch
        else sy = sc * 0.9;
      } else if (e.state && e.type === 'brute') {
        if (e.state === 1) { const k = Math.min(1, e.stateT / ENEMIES.brute.slam.windup); tilt = -0.42 * k * (2 - k); sy = sc * (1 + 0.1 * k); } // rear back
        else tilt = 0.32 * Math.max(0, 1 - e.stateT / 0.25); // slam forward, then settle
      }
      _p.set(e.x, (1 - pop) * -0.6, e.z);
      _q.setFromAxisAngle(_up, e.rot);
      if (tilt) _q.multiply(_q2.setFromAxisAngle(_xAxis, tilt));
      _s.set(sx, sy, sz);
      _m.compose(_p, _q, _s);
      M.mesh.setMatrixAt(i, _m);
      const col = e.elite ? ec : c;
      M.attrs.tint.setXYZ(i, col.r, col.g, col.b);
      // during a crouch or wind-up, cap hit flashes so the squash / rear-back silhouette stays readable
      M.attrs.flash.setX(i, e.state === 1 && (e.type === 'brute' || e.type === 'ghoul') ? Math.min(e.flash, 0.5) : e.flash);
      M.attrs.anim.setXY(i, e.phase, e.stunT > 0 ? 0 : e.type === 'brute' ? 0.6 : 1); // stunned: the waddle stops
      if (e.stunT > 0) { // and three daze motes circle its head
        const y = M.head * sy + 0.3, a = this.time * 7 + e.phase, rr = 0.34 * e.scale;
        for (let k = 0; k < 3; k++) { const b = a + k * 2.094; g.add(e.x + Math.cos(b) * rr, y + Math.sin(b * 2) * 0.06, e.z + Math.sin(b) * rr, 0.42, 1.5, 1.35, 2.3, 0.9); }
      }
      // elite crown: floats over the head, tilted toward the camera so the spikes read in silhouette
      if (e.elite && nc < MAX_CROWNS) {
        const y = M.head * sy + 0.55 + Math.sin(this.time * 3 + e.phase) * 0.07, cs = 1.3 * pop;
        _p.set(e.x, y, e.z);
        _q.setFromAxisAngle(_xAxis, -0.75).multiply(_q2.setFromAxisAngle(_up, this.time * 1.6 + e.phase));
        _s.set(cs, cs, cs);
        _m.compose(_p, _q, _s);
        this.crowns.setMatrixAt(nc++, _m);
        g.add(e.x, y + 0.1, e.z, 1.5, cg[0], cg[1], cg[2], 0.8);
      }
    }
    for (const t of TYPES) {
      const M = this.meshes[t];
      M.mesh.count = M.n;
      if (M.n) {
        M.mesh.instanceMatrix.needsUpdate = true;
        M.attrs.tint.needsUpdate = true; M.attrs.flash.needsUpdate = true; M.attrs.anim.needsUpdate = true;
      }
    }
    this.crowns.count = nc;
    if (nc) this.crowns.instanceMatrix.needsUpdate = true;
    for (const m of this.mats) m.uniforms.uTime.value = this.time;
    this.run.projectiles.renderLobs();
    this.run.hazards.render();
  }

  dispose() {
    this.disposed = true;
    for (const t of TYPES) this.meshes[t].mesh.geometry.dispose();
    for (const m of this.mats) m.dispose();
    this.crowns.geometry.dispose(); this.crowns.material.dispose();
  }
}
