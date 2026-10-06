// The Legion: risen soul minions that orbit the Shepherd and hunt the horde.
// A minion keeps the identity of what it was (MINIONS in data.js): Shades (soul wisps), Wisp Runners,
// taunting Bulwarks, ranged Soul Witches and Soul Bombs. Raised elites become Champions of their variant.
// Every variant except the Shade renders as a spectral ghost of its source enemy, one InstancedMesh each.
import * as THREE from 'three';
import { BASE, MINIONS } from './data.js';
import { wispGeometry, enemyGeometry } from '../engine/models.js';
import { makeSpectralMaterial, addInstanceAttrs } from '../engine/materials.js';

const TAU = Math.PI * 2;

// enemy type -> variant key (anything unknown rises as a Shade)
const VARIANT_OF = {};
for (const k in MINIONS) if (MINIONS[k].from) VARIANT_OF[MINIONS[k].from] = k;
// spectral variants: source model and instance capacity (when a mesh is full, extras draw as wisps)
const GHOSTS = { runner: { model: 'ghoul', max: 160 }, bulwark: { model: 'brute', max: 96 }, soulWitch: { model: 'witch', max: 96 }, soulBomb: { model: 'bloater', max: 64 } };
const GHOST_KINDS = Object.keys(GHOSTS);
// hover height of each variant's soul core; ghosts float with their feet LIFT metres above the ground
const HOVER = { shade: 0.95, runner: 0.8, bulwark: 1.2, soulWitch: 1.05, soulBomb: 0.9 };
const LIFT = 0.3;
const MAX_ORBS = 120, MAX_CAND = 40;
const GOLD = new THREE.Color(0xffd04a), GOLD_HDR = [3.2, 2.3, 0.6], WHITE_HDR = [3.2, 3.3, 3.5], HEAL_HDR = [1.0, 3.2, 2.2], SHADE_DIE_HDR = [2.5, 2.5, 2.8];
// shared option objects: enemies.damage and particles.burst read them at once and keep no reference
const HIT = { kx: 0, kz: 0, knock: 0, source: 'minion', silent: false };
const FX_HIT = { speed: 3, life: 0.25, size: 0.25 }, FX_DIE = { speed: 3, life: 0.4, size: 0.3 }, FX_GHOST_DIE = { speed: 4, life: 0.5, size: 0.4, up: 0.8 };
const FX_ORB = { speed: 4, life: 0.3, size: 0.32 }, FX_FIZZLE = { speed: 1.5, life: 0.25, size: 0.25 }, FX_HEAL = { speed: 2.2, life: 0.5, size: 0.32, up: 1.6 };
const FX_TAUNT_HIT = { speed: 3.5, life: 0.3, size: 0.3 };
const BLAST_RING = { speed: 10, life: 0.38, size: 0.42, sizeEnd: 0.08, y: 0.3 }, BLAST_FIRE = { speed: 12, life: 0.42, size: 0.32, up: 0.6 };
const BLAST_CORE = { speed: 1.5, life: 0.16, size: 0.8 }, BLAST_SPARKS = { speed: 4, life: 1.0, size: 0.26, up: 2.6, grav: 6, drag: 1 };

export class Legion {
  constructor(run) {
    this.run = run;
    this.max = BASE.hardLegionMax;
    this.list = [];
    this.pool = [];
    // live Bulwarks ({x, z, hp, maxHp, uid}), rebuilt every update; enemies within MINIONS.bulwark.taunt attack
    // them via hitMinion(). An entry killed since the last update has hp <= 0 and should be skipped.
    this.taunters = [];
    this.orbs = []; this.orbPool = [];
    this.mesh = new THREE.InstancedMesh(wispGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    run.scene.add(this.mesh);
    this.ghostMat = makeSpectralMaterial();
    this.ghosts = {};
    for (const k of GHOST_KINDS) {
      const G = GHOSTS[k], mesh = new THREE.InstancedMesh(enemyGeometry(G.model), this.ghostMat, G.max);
      mesh.count = 0; mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 5;
      const attrs = addInstanceAttrs(mesh, G.max);
      this.ghosts[k] = { mesh, attrs, tint: attrs.tint.array, flash: attrs.flash.array, anim: attrs.anim.array, n: 0, max: G.max };
      run.scene.add(mesh);
    }
    this.core = new THREE.Color(0x4ef2ff);
    this.setColor(0x4ef2ff);
    this.t = 0;
    this.slotSeq = 0;
    this.uidSeq = 0;
    this.raiseSfxT = 0; this.orbSfxT = 0; this.blastSfxT = 0;
    this.peak = 0;
    // search state for the pre-bound callbacks below, so the hot loops create no closures
    this._px = 0; this._pz = 0; this._leash2 = 0; this._bossFull = false; this._seen = 0;
    this._bx = 0; this._bz = 0; this._bdmg = 0;
    this._cx = new Float32Array(MAX_CAND); this._cz = new Float32Array(MAX_CAND); this._cw = new Float32Array(MAX_CAND);
    this._ce = new Array(MAX_CAND).fill(null);
    this._skip = (e) => (e.x - this._px) ** 2 + (e.z - this._pz) ** 2 > this._leash2 || (this._bossFull && e.type === 'boss');
    // nearest enemy that passes _skip (enemies.nearest without allocating a closure per search)
    this._best = null; this._bestD2 = 0;
    this._nearest = (e, d2) => { if (d2 < this._bestD2 && !this._skip(e)) { this._bestD2 = d2; this._best = e; } };
    // reservoir-sample up to MAX_CAND Soul Bomb candidates, weighted for the cluster score
    this._collect = (e) => {
      if (this._skip(e)) return;
      const k = this._seen++;
      const i = k < MAX_CAND ? k : Math.floor(Math.random() * (k + 1));
      if (i >= MAX_CAND) return;
      const B = MINIONS.soulBomb;
      this._ce[i] = e; this._cx[i] = e.x; this._cz[i] = e.z;
      this._cw[i] = e.type === 'boss' ? B.bossWeight : e.elite ? B.eliteWeight : 1;
    };
    this._blast = (e) => {
      HIT.kx = e.x - this._bx; HIT.kz = e.z - this._bz;
      this.run.enemies.damage(e, this._bdmg, HIT);
    };
  }

  setColor(hex) {
    const c = this.core.setHex(hex);
    this.coreHdr = [c.r * 3, c.g * 3, c.b * 3];
    this.coreHot = [c.r * 4.5, c.g * 4.5, c.b * 4.5];
  }

  get count() { return this.list.length; }

  /**
   * A slain enemy rises as a minion. opts.kind is the enemy type it was ('husk' | 'ghoul' | 'brute' | 'witch' |
   * 'bloater', default 'husk' = Shade); opts.elite raises a Champion of that variant.
   */
  raise(x, z, { fx = true, burstY = 0, kind = 'husk', elite = false } = {}) {
    if (this.list.length >= this.max) return null;
    const run = this.run;
    const key = VARIANT_OF[kind] || 'shade', v = MINIONS[key], C = MINIONS.champion;
    const m = this.pool.pop() || {};
    m.uid = ++this.uidSeq; m.kind = key; m.v = v; m.champ = !!elite; m.hover = HOVER[key];
    m.x = x; m.z = z; m.y = burstY; m.vx = 0; m.vz = 0; m.vy = 0;
    m.maxHp = m.hp = run.stats.minionHp * v.hp * (elite ? C.hp : 1);
    m.scale = (v.scale || 1) * (elite ? C.scale : 1);
    m.target = null; m.tuid = 0; m.retarget = Math.random() * 0.3; m.atkCd = 0.2;
    m.born = 0; m.phase = Math.random() * 6.28; m.slot = this.slotSeq++;
    m.rot = Math.random() * TAU; m.flash = 0; m.fuse = -1; m.idle = 0; m.gone = false; m.trailT = Math.random() * 0.1;
    this.list.push(m);
    if (key === 'bulwark') this.taunters.push(m);
    if (this.list.length > this.peak) this.peak = this.list.length;
    if (fx) this.raiseFx(m);
    return m;
  }

  raiseFx(m) {
    const run = this.run, c = this.coreHdr, P = run.particles;
    const big = m.champ || m.kind === 'bulwark';
    const n = big ? 22 : m.kind === 'shade' ? 6 : 10, k = big ? 1.5 : 1;
    for (let i = 0; i < n; i++) P.emit(m.x + (Math.random() - 0.5) * 0.5 * k, 0.1, m.z + (Math.random() - 0.5) * 0.5 * k, 0, 2.5 + Math.random() * 2.5 * k, 0, 0.55, 0.35 * k, 0.05, c[0], c[1], c[2], 1, 2.5, 0);
    if (big) {
      // Bulwarks and Champions erupt from the grave: ring, shockwave, ground light (gold for Champions)
      const col = m.champ ? GOLD_HDR : c;
      P.ring(m.x, m.z, 1.4 * m.scale, 28, col, { life: 0.45, size: 0.55, y: 0.2 });
      P.burst(m.x, 0.6, m.z, m.champ ? 34 : 16, col, { speed: 6, life: 0.7, size: 0.45, up: 1.4 });
      run.fx.shockwave(m.x, m.z, m.champ ? 3.6 : 2.6, m.champ ? 0xffd04a : run.heroColor, 0.45, 0.12);
      run.fx.light(m.x, m.z, m.champ ? 6 : 4, m.champ ? 2 : 1.3, m.champ ? GOLD : run.heroColorObj, 0.45);
      if (m.champ) { run.fx.text(m.x, 2.4, m.z, 'CHAMPION', 'gold'); run.fx.shake(0.15); }
      run.audio.sfx('raise', { volume: 0.8, pitch: m.champ ? 0.6 : 0.75 });
    } else if (this.raiseSfxT <= 0) { run.audio.sfx('raise', { volume: 0.5 }); this.raiseSfxT = 0.09; }
  }

  /** Gate bonus: many minions (Shades) burst out of a point. */
  addMany(n, x, z) {
    const c = this.coreHdr;
    for (let i = 0; i < n; i++) {
      const m = this.raise(x + (Math.random() - 0.5) * 2.5, z + (Math.random() - 0.5) * 1.0, { fx: false, burstY: 1.5 });
      if (!m) break;
      const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 6;
      m.vx = Math.cos(a) * s; m.vz = Math.sin(a) * s; m.vy = 3;
    }
    this.run.particles.burst(x, 1.5, z, 60, c, { speed: 9, life: 0.8, size: 0.4, up: 1 });
  }

  /** Lose minions with a dissolve effect (bad gates). Returns the lost souls' positions [{x, y, z}]. */
  removeMany(n) {
    const run = this.run, out = [];
    const col = [3, 0.4, 0.6];
    for (let i = 0; i < n && this.list.length; i++) {
      const idx = Math.floor(Math.random() * this.list.length);
      const m = this.list[idx];
      out.push({ x: m.x, y: m.y, z: m.z });
      run.particles.burst(m.x, m.y, m.z, 4, col, { speed: 3, life: 0.5, size: 0.3 });
      this.list[idx] = this.list[this.list.length - 1];
      this.list.pop();
      this.pool.push(m);
    }
    if (out.length) this.syncTaunters();
    return out;
  }

  damageArea(x, z, r, dmg) {
    for (const m of this.list) {
      if ((m.x - x) ** 2 + (m.z - z) ** 2 < r * r) { m.hp -= dmg; m.flash = 1; }
    }
  }

  /** Damage one minion (enemies attacking a taunting Bulwark). Returns true if the hit killed it. */
  hitMinion(m, dmg) {
    if (!m || m.gone || !(m.hp > 0) || !(dmg > 0)) return false;
    m.hp -= dmg;
    m.flash = Math.max(m.flash, 0.4); // a soft pulse: a tanking Bulwark is hit several times a second
    if (Math.random() < 0.5) this.run.particles.burst(m.x, m.y, m.z, 2, this.coreHdr, FX_TAUNT_HIT);
    return m.hp <= 0;
  }

  /** A raise roll at the legion cap mends the most wounded minion instead. Returns it, or null if all are whole. */
  healWeakest(frac = MINIONS.capHeal) {
    const L = this.list;
    let best = null, bf = 1;
    for (let i = 0; i < L.length; i++) {
      const m = L[i];
      if (m.hp > 0 && !m.gone && m.hp < m.maxHp * bf) { bf = m.hp / m.maxHp; best = m; }
    }
    if (!best) return null;
    best.hp = Math.min(best.maxHp, best.hp + best.maxHp * frac);
    this.run.particles.burst(best.x, best.y, best.z, 5, HEAL_HDR, FX_HEAL);
    return best;
  }

  /** Detach every minion for Soul Nova. Returns their positions. */
  detonateAll() {
    const out = this.list.map((m) => ({ x: m.x, y: m.y, z: m.z }));
    for (const m of this.list) this.pool.push(m);
    this.list.length = 0;
    this.taunters.length = 0;
    return out;
  }

  syncTaunters() {
    const T = this.taunters, L = this.list;
    let k = 0;
    for (let i = 0; i < L.length; i++) if (L[i].kind === 'bulwark' && L[i].hp > 0) T[k++] = L[i];
    T.length = k;
  }

  /** enemies.nearest with the shared _skip filter and no per-call closure. */
  nearestFor(x, z, r) {
    this._best = null; this._bestD2 = Infinity;
    this.run.enemies.query(x, z, r, this._nearest);
    const e = this._best; this._best = null;
    return e;
  }

  update(dt) {
    this.t += dt;
    this.raiseSfxT -= dt; this.orbSfxT -= dt; this.blastSfxT -= dt;
    const run = this.run, P = run.player, S = run.stats, E = run.enemies, M = MINIONS;
    const boss = run.bossEnemy && run.bossEnemy.active ? run.bossEnemy : null;
    const list = this.list;
    const n = list.length;
    let alive = 0, engaged = 0;
    const trailEvery = 0.1 / Math.max(0.05, run.particles.budget); // ~10 trail sparks per second per minion
    const c = this.coreHdr, T = this.taunters;
    let tn = 0; // taunters are refilled in place (no reallocation from emptying the array)
    this._px = P.x; this._pz = P.z;
    for (let i = 0; i < n; i++) {
      const m = list[i];
      if (m.gone) { this.pool.push(m); continue; }
      if (m.hp <= 0) {
        if (m.kind === 'shade') run.particles.burst(m.x, m.y, m.z, 5, SHADE_DIE_HDR, FX_DIE);
        else run.particles.burst(m.x, m.y, m.z, Math.round(8 * m.scale), c, FX_GHOST_DIE);
        this.pool.push(m);
        continue;
      }
      list[alive++] = m;
      const v = m.v, kind = m.kind;
      m.born += dt;
      m.atkCd -= dt;
      m.retarget -= dt;
      if (m.flash > 0) m.flash = Math.max(0, m.flash - dt * 6);
      const leash = BASE.minionLeash + (v.leash || 0);
      const maxSpeed = S.minionSpeed * v.speed;

      // keep a target only while it stays inside the leash around the Shepherd; at most bossEngage fight the boss
      let tg = m.target;
      if (tg && (!tg.active || tg.uid !== m.tuid || (tg.x - P.x) ** 2 + (tg.z - P.z) ** 2 > (leash + 3) ** 2)) tg = null;
      if (tg && tg === boss && m.fuse < 0) { if (engaged < M.bossEngage) engaged++; else tg = null; }
      if (m.retarget <= 0) {
        m.retarget = kind === 'soulBomb' ? v.searchEvery * (0.8 + Math.random() * 0.4) : 0.25 + Math.random() * 0.2;
        if (!tg && m.fuse < 0) {
          this._leash2 = leash * leash; this._bossFull = engaged >= M.bossEngage;
          tg = kind === 'soulBomb' ? this.findCluster(m, v) : this.nearestFor(m.x, m.z, v.seek);
          if (tg) { m.tuid = tg.uid; if (tg === boss) engaged++; }
        }
      }
      m.target = tg;

      let tx, tz, desiredSpeed, arrive = 1;
      if (m.fuse >= 0) {
        // Soul Bomb fuse: stop, swell and flash, then detonate and leave the legion
        m.fuse += dt;
        m.flash = 0.55 + 0.45 * Math.sin(m.fuse * 60);
        if (m.fuse >= v.fuse) { this.detonate(m, v); alive--; this.pool.push(m); continue; }
        tx = m.x; tz = m.z; desiredSpeed = 0;
      } else if (tg && kind === 'soulWitch') {
        // hold `keep` metres from the target, drifting sideways
        const ox = m.x - tg.x, oz = m.z - tg.z, od = Math.sqrt(ox * ox + oz * oz) || 0.001;
        const side = Math.sin(this.t * 0.8 + m.phase) * 0.8;
        tx = tg.x + (ox / od) * v.keep - (oz / od) * side; tz = tg.z + (oz / od) * v.keep + (ox / od) * side;
        desiredSpeed = maxSpeed; arrive = -1;
      } else if (tg) {
        tx = tg.x; tz = tg.z; desiredSpeed = maxSpeed;
      } else {
        const ring = Math.floor((m.slot % 60) / 12);
        const k = m.slot % 12;
        const dir = ring % 2 ? -1 : 1;
        const ang = (k / 12) * Math.PI * 2 + ring * 0.26 + this.t * (1.1 - ring * 0.12) * dir;
        // Bulwarks hold the inner guard ring so they meet whatever reaches the Shepherd
        const rad = (v.guard || 1.7 + ring * 0.75) + Math.sin(this.t * 2 + m.phase) * 0.2;
        tx = P.x + Math.cos(ang) * rad; tz = P.z + Math.sin(ang) * rad;
        desiredSpeed = maxSpeed * 1.15; arrive = -1;
        if (kind === 'soulBomb') m.idle += dt;
      }
      const dx = tx - m.x, dz = tz - m.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 0.001; // (Math.hypot boxes its result: hot loop)
      if (arrive < 0) arrive = Math.min(1, d / 1.2);
      const dvx = (dx / d) * desiredSpeed * arrive - m.vx, dvz = (dz / d) * desiredSpeed * arrive - m.vz;
      const acc = Math.min(1, dt * 7);
      m.vx += dvx * acc; m.vz += dvz * acc;
      m.x += m.vx * dt; m.z += m.vz * dt;
      // vertical: rise from the grave, then hover
      const hover = m.hover + Math.sin(this.t * 3 + m.phase) * 0.15;
      m.vy += (hover - m.y) * dt * 12 - m.vy * dt * 5;
      m.y += m.vy * dt;

      if (tg && m.fuse < 0) {
        if (kind === 'soulWitch') {
          // ranged: one homing soul orb per interval; each orb costs a share of the melee recoil
          const ox = tg.x - m.x, oz = tg.z - m.z;
          if (m.atkCd <= 0 && ox * ox + oz * oz <= (v.range + tg.radius) ** 2) {
            m.atkCd = v.interval;
            this.fireOrb(m, tg, S.minionDmg * v.dmg * (m.champ ? M.champion.dmg : 1) * (0.9 + Math.random() * 0.2));
            m.hp -= (tg.dmg || 8) * (tg === boss ? M.bossRecoil : M.recoil) * v.recoilMul;
          }
        } else if (kind === 'soulBomb') {
          if (d < tg.radius + 0.45 * m.scale) { m.fuse = 0; m.vx *= 0.2; m.vz *= 0.2; this.fuseFx(m, v); }
        } else if (d < tg.radius + v.contact && m.atkCd <= 0) {
          // strike on contact
          m.atkCd = v.interval;
          const dmg = S.minionDmg * v.dmg * (m.champ ? M.champion.dmg : 1) * (0.85 + Math.random() * 0.3);
          HIT.kx = m.vx; HIT.kz = m.vz; HIT.knock = v.knock || 1.2; HIT.source = 'minion'; HIT.silent = false;
          E.damage(tg, dmg, HIT);
          m.hp -= (tg.dmg || 8) * (tg === boss ? M.bossRecoil : M.recoil);
          const b = kind === 'bulwark' ? -0.25 : -0.6; // heavy Bulwarks barely bounce off
          m.vx *= b; m.vz *= b;
          run.particles.burst(m.x, m.y, m.z, kind === 'bulwark' ? 4 : 2, c, FX_HIT);
        }
      }

      m.trailT -= dt;
      const spark = m.trailT <= 0;
      if (spark) m.trailT = trailEvery * (0.5 + Math.random());
      if (kind === 'shade') {
        if (spark) run.particles.emit(m.x, m.y, m.z, -m.vx * 0.15, 0.2, -m.vz * 0.15, 0.35, 0.3, 0.02, c[0] * 0.7, c[1] * 0.7, c[2] * 0.7, 0.9, 1, 0);
      } else {
        // ghosts turn to face where they swoop (Soul Witches face their target) and shed a wispy trail
        let fa = NaN;
        if (kind === 'soulWitch' && tg) fa = Math.atan2(tg.x - m.x, tg.z - m.z);
        else if (m.vx * m.vx + m.vz * m.vz > 0.25) fa = Math.atan2(m.vx, m.vz);
        if (!Number.isNaN(fa)) { let dr = fa - m.rot; dr -= Math.round(dr / TAU) * TAU; m.rot += dr * Math.min(1, dt * 8); }
        if (spark) {
          const s = m.scale;
          run.particles.emit(m.x + (Math.random() - 0.5) * 0.3 * s, m.y - 0.25 * s, m.z + (Math.random() - 0.5) * 0.3 * s, -m.vx * 0.2, 0.3, -m.vz * 0.2, 0.45, 0.4 * s, 0.03, c[0] * 0.55, c[1] * 0.55, c[2] * 0.55, 0.8, 1, 0);
        }
      }
      if (m.champ && spark && Math.random() < 0.7) {
        run.particles.emit(m.x + (Math.random() - 0.5) * 0.5, m.y + 0.2, m.z + (Math.random() - 0.5) * 0.5, 0, 0.9, 0, 0.6, 0.3, 0.02, GOLD_HDR[0], GOLD_HDR[1], GOLD_HDR[2], 0.9, 0, 0);
      }
      if (kind === 'bulwark') T[tn++] = m;
    }
    // minions raised by kills during this loop were appended past n; keep them (and list new Bulwarks)
    for (let j = n; j < list.length; j++) { const m = list[j]; list[alive++] = m; if (m.kind === 'bulwark') T[tn++] = m; }
    list.length = alive;
    T.length = tn;
    this.updateOrbs(dt);
  }

  /** Soul Bomb target: the enemy at the centre of the densest cluster within seek (throttled by the caller). */
  findCluster(m, v) {
    this._seen = 0;
    this.run.enemies.query(m.x, m.z, v.seek, this._collect);
    const n = Math.min(this._seen, MAX_CAND);
    if (!n) return null;
    const X = this._cx, Z = this._cz, W = this._cw, R2 = v.radius * v.radius;
    let best = -1, bs = -1;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) { const dx = X[j] - X[i], dz = Z[j] - Z[i]; if (dx * dx + dz * dz < R2) s += W[j]; }
      const ox = X[i] - m.x, oz = Z[i] - m.z;
      s -= Math.sqrt(ox * ox + oz * oz) * 0.05; // nearer wins a tie
      if (s > bs) { bs = s; best = i; }
    }
    // hold out for a real crowd, but settle for anything once patience runs out
    const e = bs >= (m.idle > v.patience ? 1 : v.minCluster) - 0.5 ? this._ce[best] : null;
    for (let i = 0; i < n; i++) this._ce[i] = null;
    if (e) m.idle = 0;
    return e;
  }

  fuseFx(m, v) {
    // the blast radius implodes onto the bomb over the fuse
    const P = this.run.particles, c = this.coreHdr, R = v.radius, T = v.fuse;
    const k = Math.round(18 * P.budget) || 1;
    for (let i = 0; i < k; i++) {
      const a = (i / k) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      P.emit(m.x + ca * R, 0.3, m.z + sa * R, -ca * R / T, 0.4, -sa * R / T, T, 0.42, 0.2, c[0], c[1], c[2], 1, 0, 0);
    }
    this.run.audio.sfx('raise', { volume: 0.35, pitch: 1.8 });
  }

  /** Soul Bomb blast: damages and knocks back every enemy in radius; kills go through the normal kill path. */
  detonate(m, v) {
    const run = this.run, P = run.particles, x = m.x, z = m.z, R = v.radius, k = m.champ ? 1.3 : 1;
    this._bx = x; this._bz = z;
    this._bdmg = run.stats.minionDmg * v.blast * (m.champ ? MINIONS.champion.dmg : 1);
    m.gone = true;
    HIT.knock = v.knock; HIT.source = 'soulbomb'; HIT.silent = true; // one big number instead of one per foe
    run.enemies.query(x, z, R, this._blast);
    HIT.source = 'minion'; HIT.silent = false;
    run.fx.text(x, 1.6, z, Math.round(this._bdmg), 'crit');
    // a ring of soul fire racing out to the blast edge, a brief white core, and sparks raining back down
    const c = this.coreHdr;
    P.ring(x, z, R, 36, c, BLAST_RING); // reaches R at the end of its life
    P.burst(x, 0.8, z, 22 * k, this.coreHot, BLAST_FIRE);
    P.burst(x, 0.7, z, 3, WHITE_HDR, BLAST_CORE);
    P.burst(x, 1.0, z, 10, c, BLAST_SPARKS);
    if (m.champ) P.burst(x, 1.0, z, 18, GOLD_HDR, BLAST_FIRE);
    run.fx.shockwave(x, z, R * 1.35, run.heroColor, 0.4, 0.16);
    run.fx.light(x, z, 3.5, 0.9 * k, run.heroColorObj, 0.3);
    run.fx.shake(0.16 * k);
    if (this.blastSfxT <= 0) { run.audio.sfx('explosion', { volume: 0.55, pitch: 1.35 }); this.blastSfxT = 0.08; }
  }

  // ---------------------------------------------------------------- Soul Witch orbs (pooled, homing)
  fireOrb(m, tg, dmg) {
    if (this.orbs.length >= MAX_ORBS) return;
    const o = this.orbPool.pop() || {};
    const s = m.scale, fx = Math.sin(m.rot), fz = Math.cos(m.rot);
    o.x = m.x + fx * 0.35 * s; o.z = m.z + fz * 0.35 * s; o.y = m.y + 0.35 * s;
    const dx = tg.x - o.x, dz = tg.z - o.z, l = Math.sqrt(dx * dx + dz * dz) || 1, sp = MINIONS.soulWitch.orbSpeed;
    o.vx = (dx / l) * sp; o.vz = (dz / l) * sp;
    o.t = tg; o.tuid = tg.uid; o.dmg = dmg; o.life = 1.2; o.champ = m.champ; o.lost = false;
    this.orbs.push(o);
    this.run.particles.burst(o.x, o.y, o.z, 3, this.coreHdr, FX_FIZZLE);
    if (this.orbSfxT <= 0) { this.run.audio.sfx('shoot', { volume: 0.22, pitch: 1.9 }); this.orbSfxT = 0.12; }
  }

  updateOrbs(dt) {
    const orbs = this.orbs, run = this.run, E = run.enemies, P = run.particles, c = this.coreHdr;
    const sp = MINIONS.soulWitch.orbSpeed, trailP = 0.9 * P.budget, turn = Math.min(1, dt * 10);
    let w = 0;
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i];
      o.life -= dt;
      let tg = o.t;
      if (tg && (!tg.active || tg.uid !== o.tuid)) {
        // the target died in flight: curve once onto the nearest foe, otherwise fly on and fizzle
        if (!o.lost) { this._leash2 = Infinity; this._bossFull = false; }
        tg = o.t = o.lost ? null : this.nearestFor(o.x, o.z, 2.5);
        o.lost = true;
        if (tg) o.tuid = tg.uid;
      }
      if (tg) {
        const dx = tg.x - o.x, dz = tg.z - o.z, l = Math.sqrt(dx * dx + dz * dz) || 1;
        o.vx += ((dx / l) * sp - o.vx) * turn; o.vz += ((dz / l) * sp - o.vz) * turn;
      }
      o.x += o.vx * dt; o.z += o.vz * dt;
      if (Math.random() < trailP) P.emit(o.x, o.y, o.z, -o.vx * 0.05, 0.15, -o.vz * 0.05, 0.3, 0.34, 0.03, c[0], c[1], c[2], 0.85, 0, 0);
      let dead = o.life <= 0;
      if (!dead && tg && (tg.x - o.x) ** 2 + (tg.z - o.z) ** 2 < (tg.radius + 0.3) ** 2) {
        HIT.kx = o.vx; HIT.kz = o.vz; HIT.knock = 2; HIT.source = 'minion'; HIT.silent = false;
        E.damage(tg, o.dmg, HIT);
        P.burst(o.x, o.y, o.z, 6, o.champ ? GOLD_HDR : this.coreHot, FX_ORB);
        dead = true;
      } else if (dead) P.burst(o.x, o.y, o.z, 3, c, FX_FIZZLE);
      if (dead) { o.t = null; this.orbPool.push(o); } else orbs[w++] = o;
    }
    orbs.length = w;
  }

  render() {
    // matrices and attributes are written straight into the instance buffers: three's setters, called
    // with doubles from this big loop, are not inlined and box every argument (GC pressure at 400 minions)
    const list = this.list, g = this.run.glow, c = this.core, G = this.ghosts, t = this.t;
    for (let k = 0; k < GHOST_KINDS.length; k++) G[GHOST_KINDS[k]].n = 0;
    const WM = this.mesh.instanceMatrix.array, WC = this.mesh.instanceColor.array;
    let i = 0;
    for (let li = 0; li < list.length; li++) {
      const m = list[li];
      const sp = Math.sqrt(m.vx * m.vx + m.vz * m.vz);
      const born = Math.min(1, m.born * 3);
      const hurt = m.hp / m.maxHp;
      const V = m.kind === 'shade' ? null : G[m.kind];
      if (!V || V.n >= V.max) {
        // Shade: the soul wisp, turned along its velocity and stretched by speed (also the fallback when a
        // variant's mesh is full)
        const sc = (0.8 + 0.3 * Math.sin(t * 6 + m.phase)) * born * m.scale, sz = sc * (1 + Math.min(1.5, sp * 0.12));
        const cy = sp > 0.01 ? m.vz / sp : 1, sy = sp > 0.01 ? m.vx / sp : 0, o = i * 16;
        WM[o] = cy * sc; WM[o + 1] = 0; WM[o + 2] = -sy * sc; WM[o + 3] = 0;
        WM[o + 4] = 0; WM[o + 5] = sc; WM[o + 6] = 0; WM[o + 7] = 0;
        WM[o + 8] = sy * sz; WM[o + 9] = 0; WM[o + 10] = cy * sz; WM[o + 11] = 0;
        WM[o + 12] = m.x; WM[o + 13] = m.y; WM[o + 14] = m.z; WM[o + 15] = 1;
        const f = m.flash, o3 = i * 3;
        WC[o3] = c.r * 2.2 + (1 - hurt) * 2 + f; WC[o3 + 1] = c.g * 2.6 * (0.5 + hurt * 0.5) + f; WC[o3 + 2] = c.b * 2.8 + f;
        g.add(m.x, m.y, m.z, 0.62 * m.scale, c.r * 0.8, c.g * 0.8, c.b * 0.8, 0.42);
        i++;
      } else {
        // spectral ghost of the source enemy: yaw to face its swoop, lean into it (Euler YXZ), uniform scale
        const j = V.n++;
        let sc = m.scale * born;
        if (m.fuse >= 0) sc *= 1 + (m.fuse / m.v.fuse) * 0.45;
        const lean = Math.min(0.35, sp * 0.035);
        const cy = Math.cos(m.rot), sy = Math.sin(m.rot), cx = Math.cos(lean), sx = Math.sin(lean);
        const A = V.mesh.instanceMatrix.array, o = j * 16;
        A[o] = cy * sc; A[o + 1] = 0; A[o + 2] = -sy * sc; A[o + 3] = 0;
        A[o + 4] = sy * sx * sc; A[o + 5] = cx * sc; A[o + 6] = cy * sx * sc; A[o + 7] = 0;
        A[o + 8] = sy * cx * sc; A[o + 9] = -sx * sc; A[o + 10] = cy * cx * sc; A[o + 11] = 0;
        A[o + 12] = m.x; A[o + 13] = m.y - m.hover + LIFT; A[o + 14] = m.z; A[o + 15] = 1;
        const T = V.tint, o3 = j * 3;
        T[o3] = c.r + (1 - hurt) * 0.9; T[o3 + 1] = c.g * (0.55 + hurt * 0.45); T[o3 + 2] = c.b;
        V.flash[j] = m.flash;
        V.anim[j * 2] = m.phase; V.anim[j * 2 + 1] = m.champ ? 1 : 0;
        g.add(m.x, m.y, m.z, 1.5 * m.scale, c.r * 0.5, c.g * 0.5, c.b * 0.5, 0.3); // the ghost hides the centre: a halo
        if (m.fuse >= 0) g.add(m.x, m.y, m.z, 1.6 * m.scale * (0.6 + m.fuse / m.v.fuse), 0.4 + c.r, 0.4 + c.g, 0.4 + c.b, 0.45 + 0.4 * m.flash);
      }
      // Champions carry a gold halo and crown spark
      if (m.champ) {
        g.add(m.x, m.y, m.z, 1.9 * m.scale, GOLD.r * 0.7, GOLD.g * 0.7, GOLD.b * 0.7, 0.5);
        g.add(m.x, m.y + 0.75 * m.scale, m.z, 0.5 * m.scale, 2.6, 2.0, 0.6, 0.9);
      }
    }
    this.mesh.count = i;
    if (i) { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
    for (let k = 0; k < GHOST_KINDS.length; k++) {
      const V = G[GHOST_KINDS[k]];
      V.mesh.count = V.n;
      V.mesh.visible = V.n > 0;
      if (V.n) { V.mesh.instanceMatrix.needsUpdate = true; V.attrs.tint.needsUpdate = true; V.attrs.flash.needsUpdate = true; V.attrs.anim.needsUpdate = true; }
    }
    this.ghostMat.uniforms.uTime.value = t;
    // Soul Witch orbs: hot core inside a legion-coloured halo
    for (let k = 0; k < this.orbs.length; k++) {
      const o = this.orbs[k];
      if (o.champ) g.add(o.x, o.y, o.z, 1.3, GOLD.r * 1.2, GOLD.g * 1.2, GOLD.b * 1.2, 0.85);
      else g.add(o.x, o.y, o.z, 1.15, c.r * 1.4, c.g * 1.4, c.b * 1.4, 0.85);
      g.add(o.x, o.y, o.z, 0.42, 2.6, 2.8, 3.0, 1);
    }
  }

  dispose() {
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
    for (const k of GHOST_KINDS) this.ghosts[k].mesh.geometry.dispose();
    this.ghostMat.dispose();
  }
}
