// Update 6's weapons (owned by Weapons, which fires and draws them):
// - Gravefall: tombstones crash onto the horde's densest packs after a falling shadow; Necropolis drops six and leaves
//   them standing as graves, beside which the slain rise far more often (Run.onEnemyKilled asks graveNear).
// - Soul Leech: drain beams on the toughest foes in reach (the boss, then elites, then the most HP) that heal the
//   Shepherd; Vampiric Communion forks each beam into the horde and, once he is whole, feeds his most wounded minions.
import * as THREE from 'three';
import { SKILLS, EVOLUTIONS, UNIONS } from './data.js';
import { tombstoneGeometry } from '../engine/models.js';
import { makeCharMaterial, addInstanceAttrs } from '../engine/materials.js';
import { hdr } from '../engine/particles.js';

const TAU = Math.PI * 2;
const GF = SKILLS.gravefall, NP = EVOLUTIONS.necropolis, SL = SKILLS.soulLeech, VC = EVOLUTIONS.vampiricCommunion;
const MAX_STONES = 24, DROP = 9, SINK = 0.35, SCALE = 1.5; // stones alive at once, drop height (m), sink time (s), size
const SAMPLE = 18; // candidate foes scored for each stone
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

export class Arsenal {
  constructor(run, W) {
    this.run = run; this.W = W;
    this.stoneMat = makeCharMaterial({ rim: 0xa9c8ff, emit: 3, anim: 0 });
    this.stoneMesh = new THREE.InstancedMesh(tombstoneGeometry(), this.stoneMat, MAX_STONES);
    addInstanceAttrs(this.stoneMesh, MAX_STONES);
    this.stoneMesh.count = 0; this.stoneMesh.frustumCulled = false;
    run.scene.add(this.stoneMesh);
    this.stones = []; this.stonePool = [];
    this.cols = { stone: hdr(0xa9c8ff, 3), dust: hdr(0x8a8f9c, 1.1), leech: hdr(0xff3d6e, 3.2), core: hdr(0xffb0c4, 3), heal: [1.0, 3.2, 2.2] };
    this.stoneColor = new THREE.Color(0xa9c8ff);
    this.boomT = 0;
    this._cand = []; this._near = 0; this._s = null; this._shown = 0;
    this._count = (e) => { this._near += e.type === 'boss' ? 6 : e.elite ? 3 : 1; };
    this._impact = (e) => this.impactHit(e);
    // Soul Leech: the live beams ({ e, uid, f, fuid }: the target and Communion's fork) and the healing bank
    this.beams = [];
    this.tickT = 0; this.retargetT = 0; this.tickN = 0;
    this.healBank = 0; this.mendAcc = 0; this.mendT = 0; this.healShown = 0; this.healTextT = 0;
    this._best = null; this._bestScore = -1;
    this._score = (e) => {
      if (e.ev || (e.type !== 'boss' && this.held(e))) return; // event entities are not drained; only the boss takes two beams
      const sc = (e.type === 'boss' ? 1e9 : 0) + (e.elite ? 1e6 : 0) + e.hp;
      if (sc > this._bestScore) { this._bestScore = sc; this._best = e; }
    };
    this.searMark = 0; this._searTarget = null; this._searDmg = 0; this._seared = 0;
    this._sear = (e) => {
      if (e === this._searTarget || e.ev) return;
      this.W.touch(e);
      if (e.searMark === this.searMark) return; // once a tick, however many beams cross it
      e.searMark = this.searMark;
      const h = e.hp;
      this.run.enemies.damage(e, this._searDmg, this.W.opts(0, 0, 0, false, 'leech', true));
      this._seared += Math.max(0, Math.min(h, h - Math.max(0, e.hp)));
    };
  }

  // ---------------------------------------------------------------- Gravefall
  /** Picks up to n impact points on the densest packs within reach (spread apart) and drops a stone on each, aimed a
   *  little ahead of the foe. Returns false when no foe is in reach. */
  dropStones(level) {
    const run = this.run, P = run.player, E = run.enemies, np = !!run.evolved.necropolis;
    const n = np ? NP.count : GF.count(level), r = (np ? NP.r : GF.r(level)) * run.stats.area;
    const cand = this._cand; cand.length = 0;
    let seen = 0;
    E.query(P.x, P.z, GF.reach, (e) => { // a reservoir sample of the foes in reach
      const k = seen++, i = k < SAMPLE ? k : Math.floor(Math.random() * (k + 1));
      if (i < SAMPLE) cand[i] = e;
    });
    if (!cand.length) return false;
    const px = [], pz = [], apart = r * r * 1.2;
    for (let s = 0; s < n; s++) {
      let best = null, bs = -1;
      for (const e of cand) {
        if (!e.active) continue;
        let taken = false;
        for (let k = 0; k < px.length; k++) if ((px[k] - e.x) ** 2 + (pz[k] - e.z) ** 2 < apart) { taken = true; break; }
        if (taken) continue;
        this._near = 0; E.query(e.x, e.z, r, this._count);
        if (this._near > bs) { bs = this._near; best = e; }
      }
      if (!best) best = cand[(Math.random() * cand.length) | 0]; // fewer packs than stones: the rest land on any foe
      const lead = GF.fall * 0.5, x = best.x + (best.vx || 0) * lead, z = best.z + (best.vz || 0) * lead;
      px.push(x); pz.push(z);
      this.drop(x, z, r, np ? NP.dmg : GF.dmg(level), np);
    }
    run.audio.sfx('shoot', { volume: 0.4, pitch: 0.45 });
    return true;
  }

  drop(x, z, r, base, grave) {
    const L = this.stones;
    if (L.length >= MAX_STONES) { const i = L.findIndex((s) => s.state === 1); this.stonePool.push(L.splice(i < 0 ? 0 : i, 1)[0]); }
    const s = this.stonePool.pop() || {};
    s.x = x; s.z = z; s.r = r; s.dmg = this.W.hit(base); s.crit = this.W.crit; s.t = 0; s.state = 0; s.grave = grave;
    s.life = grave ? NP.grave : GF.sink; s.rot = (Math.random() - 0.5) * 0.9; s.tilt = (Math.random() - 0.5) * 0.22;
    L.push(s);
  }

  updateStones(dt) {
    const L = this.stones;
    this.boomT -= dt;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const s = L[i];
      s.t += dt;
      if (s.state === 0 && s.t >= GF.fall) { s.state = 1; s.t = 0; this.impact(s); }
      else if (s.state === 1 && s.t >= s.life + SINK) { this.stonePool.push(s); continue; }
      L[w++] = s;
    }
    L.length = w;
  }

  impact(s) {
    const run = this.run;
    this._s = s; this._shown = 0;
    run.enemies.query(s.x, s.z, s.r, this._impact);
    run.fx.shockwave(s.x, s.z, s.r * 1.1, 0xa9c8ff, 0.35, 0.12);
    run.particles.ring(s.x, s.z, s.r * 0.8, 18, this.cols.dust, { life: 0.5, size: 0.55, y: 0.2 });
    run.particles.burst(s.x, 0.4, s.z, 10, this.cols.stone, { speed: 4, life: 0.4, size: 0.35, up: 2 });
    run.fx.light(s.x, s.z, s.r + 2, 1.2, this.stoneColor, 0.25);
    if (this.boomT <= 0) { this.boomT = 0.08; run.audio.sfx('explosion', { volume: 0.35, pitch: 0.55 }); run.fx.shake(0.05); }
  }

  impactHit(e) {
    const s = this._s;
    this.run.enemies.damage(e, s.dmg, this.W.opts(e.x - s.x, e.z - s.z, 7, s.crit, 'grave', this._shown++ >= 5)); // 5 numbers a stone
  }

  /** Necropolis: is (x, z) beside a standing grave? (the slain there rise more often) */
  graveNear(x, z) {
    const L = this.stones, R = NP.graveR * this.run.stats.area, r2 = R * R;
    for (let i = 0; i < L.length; i++) {
      const s = L[i];
      if (s.grave && s.state === 1 && s.t < s.life && (s.x - x) ** 2 + (s.z - z) ** 2 < r2) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- Soul Leech
  held(e) { const B = this.beams; for (let i = 0; i < B.length; i++) if (B[i].e === e) return true; return false; }

  /** The toughest foe within r of the Shepherd that no beam holds yet (the boss, then elites, then the most HP). */
  pick(r) {
    const P = this.run.player;
    this._best = null; this._bestScore = -1;
    this.run.enemies.query(P.x, P.z, r, this._score);
    return this._best;
  }

  updateLeech(dt, level) {
    const run = this.run, P = run.player, E = run.enemies, B = this.beams;
    if (!level || P.dead) { B.length = 0; return; }
    const vc = !!run.evolved.vampiricCommunion;
    const n = (vc ? VC.beams : SL.beams(level)) + (run.loadout.hero.passive.leechBeams || 0), range = vc ? VC.range : SL.range(level); // Isolde: one more beam
    // drop beams whose target died or slipped out of reach
    for (let i = B.length - 1; i >= 0; i--) {
      const b = B[i];
      if (!b.e.active || b.e.uid !== b.uid || (b.e.x - P.x) ** 2 + (b.e.z - P.z) ** 2 > (range + 1) ** 2) B.splice(i, 1);
    }
    while (B.length > n) B.pop();
    if ((this.retargetT -= dt) <= 0) {
      this.retargetT = B.length < n ? 0.15 : SL.retarget; // a free beam looks again soon
      // a beam holds its foe until it falls; one on a common foe jumps to a boss or an unheld elite
      for (const b of B) {
        if (b.e.type === 'boss' || b.e.elite) continue;
        const t = this.pick(range);
        if (t && (t.type === 'boss' || t.elite)) { b.e = t; b.uid = t.uid; b.f = null; }
      }
      while (B.length < n) {
        const t = this.pick(range);
        if (!t) break;
        B.push({ e: t, uid: t.uid, f: null, fuid: 0 });
      }
    }
    // Communion forks each beam to the nearest other foe beside its target
    if (vc) for (const b of B) {
      if (b.f && (!b.f.active || b.f.uid !== b.fuid)) b.f = null;
      if (!b.f) { const f = E.nearest(b.e.x, b.e.z, VC.fork, (e) => e === b.e || e.ev); b.f = f; b.fuid = f ? f.uid : 0; }
    }
    // the bank refills healCap HP a second (holding at most a second's worth)
    const cap = vc ? VC.healCap : SL.healCap;
    this.healBank = Math.min(cap, this.healBank + cap * dt);
    if ((this.tickT -= dt) > 0) return;
    this.tickT += SL.tick;
    if (!B.length) return;
    this.tickN++;
    const dps = vc ? VC.dps : SL.dps(level), leech = vc ? VC.leech : SL.leech(level);
    let drained = 0;
    this.searMark++; this._seared = 0;
    for (const b of B) {
      drained += this.drain(b.e, dps * SL.tick);
      this.sear(P.x, P.z, b.e, this.W.hit(dps * SL.sear * SL.tick));
      if (b.f) drained += this.drain(b.f, dps * VC.forkDps * SL.tick);
    }
    this.feed((drained + this._seared) * leech, vc);
  }

  /** One tick of a beam: the HP it actually took (a number shows about once a second per beam, crits always). */
  drain(e, base) {
    if (!e.active) return 0;
    const dmg = this.W.hit(base), h = e.hp, fl = e.flash;
    const dead = this.run.enemies.damage(e, dmg, this.W.opts(0, 0, 0, this.W.crit, 'leech', !this.W.crit && this.tickN % 5 !== 0));
    e.flash = Math.max(fl, 0.3); // a steady drain glows faintly instead of bleaching the target white every tick
    if (!dead && e.active && this.run.unions.bloodCovenant) this.W.ignite(e, dmg * UNIONS.bloodCovenant.burn); // Blood Covenant: the drain sets it ablaze
    return Math.max(0, Math.min(h, h - Math.max(0, e.hp)));
  }

  /** The beam sears every foe it passes through on the way to its target (each once a tick). */
  sear(x0, z0, t, dmg) {
    const E = this.run.enemies, dx = t.x - x0, dz = t.z - z0, len = Math.hypot(dx, dz), n = Math.floor(len / 0.9);
    this._searTarget = t; this._searDmg = dmg;
    for (let k = 1; k < n; k++) { const u = k / n; E.query(x0 + dx * u, z0 + dz * u, SL.searR, this._sear); }
  }

  /** Blood Covenant (Soul Union): a chain link feeds the Shepherd hp from the Communion's heal bank (its cap holds). */
  covenant(hp) {
    const P = this.run.player;
    if (P.dead) return;
    const take = Math.min(hp, this.healBank, P.maxHp - P.hp);
    if (take > 0) { this.healBank -= take; P.heal(take, true); this.healShown += take; }
  }

  /** Stolen life heals the Shepherd from the bank; with Communion, what he can't take mends his most wounded minions. */
  feed(hp, vc) {
    const run = this.run, P = run.player;
    const take = Math.min(hp, this.healBank, P.maxHp - P.hp);
    if (take > 0) { this.healBank -= take; P.heal(take, true); this.healShown += take; }
    if ((this.healTextT -= SL.tick) <= 0 && this.healShown >= 1) { // the trickle shows as one number a second
      this.healTextT = 1; run.fx.text(P.x, 2.3, P.z, '+' + Math.round(this.healShown), 'heal'); this.healShown = 0;
    }
    if (!vc || P.hp < P.maxHp) return;
    this.mendAcc += hp - take;
    if ((this.mendT -= SL.tick) > 0) return;
    this.mendT = 0.5;
    const amt = this.mendAcc / VC.mend; this.mendAcc = 0;
    if (amt <= 0) return;
    const L = run.legion.list, worst = [];
    for (let i = 0; i < L.length; i++) {
      const m = L[i];
      if (!(m.hp > 0) || m.gone || m.fade > 0 || m.hp >= m.maxHp) continue;
      worst.push(m);
    }
    worst.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    for (let i = 0; i < Math.min(VC.mend, worst.length); i++) {
      const m = worst[i];
      m.hp = Math.min(m.maxHp, m.hp + amt);
      run.particles.burst(m.x, m.y + 0.2, m.z, 3, this.cols.heal, { speed: 2, life: 0.5, size: 0.3, up: 1.4 });
    }
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const run = this.run, lv = run.skillLv;
    if (this.stones.length) this.updateStones(dt);
    this.updateLeech(dt, lv.soulLeech || 0);
    const P = run.player, U = this.stoneMat.uniforms;
    U.uTime.value += dt;
    U.uPLPos.value.set(P.x, 1.6, P.z); U.uPLColor.value.copy(run.heroColorObj).multiplyScalar(0.45);
  }

  render(g) {
    const run = this.run, P = run.player, L = this.stones;
    // the stones: falling (accelerating, a slight spin), standing, then sinking back into the earth
    const sc = this.cols.stone;
    for (let i = 0; i < L.length; i++) {
      const s = L[i];
      let y = 0, k = SCALE;
      if (s.state === 0) {
        const u = s.t / GF.fall; y = DROP * (1 - u * u);
        g.add(s.x, y + 1.2, s.z, 1.4, sc[0] * 0.25, sc[1] * 0.25, sc[2] * 0.25, 0.8);
        // where it will land: a faint ring of motes tightening onto the impact (a friendly mark, not a hazard telegraph)
        const R = s.r * (1.15 - 0.3 * u), a0 = run.t * 2 + i, f = 0.08 + 0.14 * u;
        for (let k = 0; k < 14; k++) { const a = a0 + (k / 14) * TAU; g.add(s.x + Math.cos(a) * R, 0.15, s.z + Math.sin(a) * R, 0.38, sc[0] * f, sc[1] * f, sc[2] * f, 0.8); }
      }
      else if (s.t > s.life) y = -1.6 * Math.min(1, (s.t - s.life) / SINK);
      else if (s.grave) { const f = 0.7 + 0.3 * Math.sin(run.t * 4 + i); g.add(s.x, 0.5, s.z, 1.8 * f, sc[0] * 0.18, sc[1] * 0.18, sc[2] * 0.18, 0.8); }
      _e.set(s.tilt, s.rot + (s.state === 0 ? s.t * 2 : 0), 0);
      _q.setFromEuler(_e); _p.set(s.x, y, s.z); _s.set(k, k, k);
      _m.compose(_p, _q, _s);
      this.stoneMesh.setMatrixAt(i, _m);
    }
    this.stoneMesh.count = L.length;
    if (L.length) this.stoneMesh.instanceMatrix.needsUpdate = true;
    // the beams: a wavering ribbon of crimson light from the Shepherd's staff to each target, its life flowing back
    const B = this.beams, c = this.cols.leech, core = this.cols.core;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      this.ribbon(g, P.x, 1.35, P.z, b.e, c, i, 1, true);
      if (b.f && b.f.active) this.ribbon(g, b.e.x, 1.0 * b.e.scale, b.e.z, b.f, c, i + 7, 0.6, false);
      g.add(b.e.x, 1.0 * b.e.scale, b.e.z, 0.8, core[0] * 0.3, core[1] * 0.3, core[2] * 0.3, 0.9);
      if (Math.random() < 0.25) { // a mote of stolen life drifts home (it fades before it reaches him)
        const u = 0.3 + Math.random() * 0.7, dx = P.x - b.e.x, dz = P.z - b.e.z;
        run.particles.emit(b.e.x + dx * (1 - u), 1.1, b.e.z + dz * (1 - u), dx * 0.9, 0, dz * 0.9, 0.3, 0.24, 0.02, c[0], c[1], c[2], 0.7, 0, 0);
      }
    }
  }

  /** fromHero: the beams all leave his staff, so each fades in over its first metre or so (stacked glow would blow out). */
  ribbon(g, x0, y0, z0, e, c, seed, k, fromHero) {
    const x1 = e.x, y1 = 1.0 * e.scale, z1 = e.z, dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len, n = Math.max(3, Math.ceil(len / 0.22)), t = this.run.t;
    for (let j = fromHero ? 1 : 0; j <= n; j++) {
      const u = j / n, w = Math.sin(u * Math.PI) * 0.22 * Math.sin(t * 9 + u * 10 + seed);
      const f = k * 0.32 * (fromHero ? Math.min(1, (u * len) / 1.2) : 1);
      g.add(x0 + dx * u + nx * w, y0 + (y1 - y0) * u, z0 + dz * u + nz * w, (0.3 + 0.08 * Math.sin(t * 14 + j)) * k, c[0] * f, c[1] * f, c[2] * f, 0.85);
    }
  }

  dispose() {
    this.stoneMesh.geometry.dispose(); this.stoneMat.dispose();
  }
}
