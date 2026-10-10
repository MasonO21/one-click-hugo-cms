// The chapter bosses (BOSSES in data.js): Gravemaw, Pyrexa, Vaulkar, Azrathel and Vesperine (Act I), and Morwenna,
// Gorrath, Mother Mire, Kaelthar and Nihl (Acts II–VI) share a three-phase fight inside a sealed rune arena (tunables:
// BOSS_PHASES). I: ring slams, a gap ring and the boss's signature attack. II: faster, rotating gap rings, waves from the
// edge. III: a spiral stream, the arena closes, Brutes join the waves. Immune 2 s roars between phases. Each boss adds a
// twist to the shared attacks and a signature of its own: Gravemaw raises the dead, Pyrexa's Cinder Rain, Vaulkar's
// Glacier Lances, Azrathel's Smite, Vesperine's Blood Lances, Morwenna's Tidal Lanes, Gorrath's Root Snare, Mother Mire's
// Blight Rain, Kaelthar's Tempest, and Nihl, who borrows each of theirs in turn. A boss back in a later act fights at its
// tier (BOSS_TIER): faster, with more rings and an earlier enrage.
import * as THREE from 'three';
import { BOSS, BOSSES, bossFor, BOSS_PHASES as BP, BOSS_TIER, ACTS, HITSTOP, TUTORIAL, chapterLevel, bossDmgScale } from './data.js';
import { bossGeometry } from '../engine/models.js';
import { makeCharMaterial } from '../engine/materials.js';
import { foeModel, loadFoeModel, setGait } from '../engine/foemodels.js';
import { hdr } from '../engine/particles.js';
import { makeArenaRing, makeArenaWall, makeSlamRings, makeGapFan, makeSpiralSigil, makeShards } from './fxmeshes.js';

const TAU = Math.PI * 2;
const WALL_H = 2.4, SLAM_S = BP.slam.radii[2] + BP.slam.halfW + 0.35, FAN_S = 9.5, SIGIL_S = 10, GAP_HALF = 0.32;
const MAX_SHARDS = 96;
const ROMAN = ['I', 'II', 'III'];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color(0xffffff);
const rnd = (a, b) => a + Math.random() * (b - a);
const ease = (k) => k * k * (3 - 2 * k);

export class Boss {
  constructor(run) {
    this.run = run;
    this.e = null;
    this.mesh = null;
    this.state = 'none';
    this.phase = 0;
    this.zones = [];   // lingering hazards: fire bands, frost shards (t < 0: erupting later, marked meanwhile)
    this.strikes = []; // Azrathel's Smite: pillars of light still to fall
    this.rainQ = [];   // Pyrexa's Cinder Rain (and Mother Mire's spores): lobs still to throw
    this.lanes = []; this.beams = null; this.well = null; // Morwenna's Tidal Lanes, Kaelthar's Tempest, Nihl's pull
    this.tier = 1; this.tierRate = 1; this.dirgeAt = BP.dirge.at; this.epithet = '';
    this.pending = []; // telegraphed spawns at the arena edge
    this.slams = [];   // pooled ring-slam decals
    this.arena = { x: 0, z: 0, r: 0, from: 0, to: 0, closeT: 0, seal: 0, on: false, purged: false, drop: 0, hitA: 0, hitK: 0, sparkT: 0, hapT: 0 };
    this.sumPts = Array.from({ length: 8 }, () => ({ x: 0, z: 0 }));
    this._spark = (x, z) => this.spark(x, z, 5);
    this.rt = 0;
  }

  /** Arena and attack meshes are built once and reused by every spawn (Endless brings him back). */
  build() {
    if (this.ring) return;
    const sc = this.run.scene;
    this.ring = makeArenaRing(); this.wall = makeArenaWall();
    for (let i = 0; i < 3; i++) {
      const mesh = makeSlamRings(); mesh.scale.setScalar(SLAM_S); sc.add(mesh);
      this.slams.push({ mesh, on: false, t: 0, tele: 1, fired: 0, cancel: false, x: 0, z: 0, fl: [0, 0, 0], burn: [0, 0, 0] });
    }
    this.fan = makeGapFan(); this.fan.scale.setScalar(FAN_S);
    this.sigil = makeSpiralSigil(); this.sigil.scale.setScalar(SIGIL_S);
    this.shards = makeShards(MAX_SHARDS);
    sc.add(this.ring, this.wall, this.fan, this.sigil, this.shards);
  }

  /** The chapter's boss (in the Endless Abyss the next in turn); scale > 1 makes it stronger (each abyss depth). */
  spawn(scale = 1) {
    const run = this.run, P = run.player, ch = run.chapter;
    if (this.mesh) { run.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); this.mesh = null; }
    this.build();
    this.id = bossFor(ch, run.bossKills);
    const K = this.kit = BOSSES[this.id], hex = K.color;
    this.tier = run.endless || run.rush || run.guide ? 1 : ch.tier || 1; // a boss back from an earlier act fights harder
    const T = BOSS_TIER;
    this.tierRate = 1 + T.rate * (this.tier - 1);
    this.dirgeAt = Math.max(T.dirgeMin, BP.dirge.at - T.dirge * (this.tier - 1));
    this.epithet = this.tier > 1 && ch.act ? ACTS[ch.act - 1].epithet : '';
    const x = P.x, z = P.z - 11;
    const lvl = chapterLevel(ch), tune = ch.bossTune || BOSS.tune[lvl - 1] || 1;
    const e = run.enemies.spawn('boss', x, z, { hpMul: ch.hpMul * (1 + BOSS.chHp * (lvl - 1)) * tune * (run.guide ? TUTORIAL.bossHp : run.tutorial ? BOSS.firstRun : 1) * scale * run.diff.bossHp, dmgMul: bossDmgScale(lvl) * Math.sqrt(scale) * run.diff.bossDmg });
    this.e = e;
    run.bossEnemy = e;
    this.color = new THREE.Color(hex);
    this.danger = this.color.clone().lerp(new THREE.Color(0xff2e55), 0.35); // telegraphs: the boss's colour, warmed toward danger
    // the painted boss (loaded at boot; the procedural King's shape if it is not ready): crown, eyes and glowing paint burn
    // in the boss's colour, robes stir and arms sway
    const pm = foeModel(this.id);
    if (!pm) loadFoeModel(this.id);
    this.mat = pm
      ? makeCharMaterial({ map: pm.map, glow: pm.glow, glowTint: 0.6, rim: hex, rimK: 0.6, emit: 3, anim: 1, gait: true, ambient: 0x6e6878, key: 0x8e86a0, plColor: hex, plRadius: 6 })
      : makeCharMaterial({ rim: hex, emit: 3, anim: 0.3, ambient: 0x3a3048, key: 0x9a8ab8, plColor: hex, plRadius: 6 });
    if (pm) { setGait(this.mat, pm); this.mat.uniforms.uAmbient.value.multiplyScalar(pm.lit); this.mat.uniforms.uKey.value.multiplyScalar(pm.lit); }
    this.glow0 = pm ? pm.glow : 0;
    this.h = pm ? pm.h : 4.6;
    this.mat.uniforms.uTint.value.copy(this.color);
    this.mesh = new THREE.Mesh(pm ? pm.geometry.clone() : bossGeometry(), this.mat);
    run.scene.add(this.mesh);
    this.col = hdr(hex, 3.5);
    // the chest and crown glows add the boss's colour over its body: a pale, bright colour (the act bosses' sea green, thorn,
    // blight, storm and moonlight) would wash a dark painted body out to white, so they are dimmed toward Act I's luminance
    { const C = this.color; this.glowK = Math.min(1, 0.36 / Math.max(0.01, 0.2126 * C.r + 0.7152 * C.g + 0.0722 * C.b)); }
    this.hot = hdr(new THREE.Color(hex).lerp(WHITE, 0.5).getHex(), 4);
    this.orb = { col: this.color.clone().lerp(WHITE, 0.3).multiplyScalar(3.4), glow: hdr(hex, 3.2), sc: 1.35, hr: 0.22, life: 4 };
    // fight state
    this.state = 'enter'; this.t = 0; this.cd = 2.5; this.y = -5;
    this.phase = 0; this.pendingPhase = 0; this.immune = BP.rise; this.lockHp = this.lastHp = e.maxHp;
    this.novaId = -1; this.novaDealt = 0;
    this.fightT = 0; this.phaseT = 0; this.held = false; this.dirge = false; this.baseDmg = this.dmg = e.dmg; this.rate = 1; this.last = '';
    // the boss's twist on the shared attacks: 2 fire rings, 3 frost shards, 4 extra ring, 5 early phase III
    this.twist = K.twist;
    this.thresholds = this.run.guide ? [-1, -1] // the tutorial's King: phase I only
      : [BP.phases[1].from, this.run.tutorial ? -1 : this.twist === 5 || this.twist === 10 ? BP.ch5Crown : BP.phases[2].from]; // first run: no phase III
    this.nextWave = Infinity; this.zones.length = 0; this.pending.length = 0; this.shards.count = 0; this.strikes.length = 0; this.rainQ.length = 0;
    this.lanes = []; this.beams = null; this.echoI = 0; this.wellT = this.twist === 10 ? BP.well.every[0] : Infinity; this.well = null;
    run.hazards.thunder = this.twist === 9 ? BP.thunder.every : null; // Kaelthar: lightning falls through his fight
    for (const S of this.slams) { S.on = false; S.mesh.visible = false; }
    for (const m of [this.slams[0].mesh, this.slams[1].mesh, this.slams[2].mesh, this.fan, this.sigil]) m.material.uniforms.uColor.value.copy(this.danger);
    this.fan.visible = this.sigil.visible = false;
    // seal the arena around the Shepherd
    const A = this.arena;
    A.x = P.x; A.z = P.z; A.r = A.from = A.to = BP.arena.radius; A.closeT = 0; A.seal = 0; A.on = true; A.purged = false; A.drop = 0; A.hitK = 0;
    this.ring.visible = this.wall.visible = true;
    this.ring.position.set(A.x, 0.05, A.z); this.wall.position.set(A.x, 0, A.z);
    for (const m of [this.ring, this.wall]) { const u = m.material.uniforms; u.uColor.value.copy(this.color); u.uAlpha.value = 1; u.uSeal.value = 0; }
    run.fx.shake(0.6);
    run.audio.sfx('boss_roar', { pitch: K.roar });
    run.audio.sfx('arena');
    run.audio.playMusic('boss');
    run.ui.bossColor(hex);
    run.ui.bossBar(true, `${this.epithet ? this.epithet + ' ' : ''}${K.name}, ${K.title}`, this.thresholds.filter((f) => f > 0));
    run.ui.bossImmune(true);
    run.fx.telegraph(x, z, 3.2, 1.4, hex);
    run.particles.burst(x, 0.5, z, 120, this.col, { speed: 10, life: 1.2, size: 0.7, up: 1.5 });
  }

  // ---------------------------------------------------------------- per frame (called by Enemies.update after the Shepherd moved)
  update(e, dt) {
    this.lastHp = e.hp;
    this.t += dt; this.cd -= dt; this.fightT += dt; this.phaseT += dt;
    if (this.immune > 0) this.immune -= dt;
    if (!this.dirge && this.fightT >= this.dirgeAt) this.hollowDirge();
    if (this.twist === 10) this.updateWell(dt);
    if (this.held && this.phaseT >= BP.minPhase[this.phase]) { this.held = false; this.pendingPhase = this.phase + 1; this.immune = BP.transition.dur; this.lockHp = e.hp; }
    this.run.ui.bossWard(this.held ? BP.minPhase[this.phase] - this.phaseT : 0);
    // minions that strike him while he is immune (rising, roaring) are unharmed; held at a tick he still bites back
    e.dmg = this.immune > 0 ? 1e-4 : this.dmg;
    if (this.pendingPhase > this.phase && this.state !== 'enter') this.startRoar(e);
    this.updateSlams(dt);
    this.updateZones(dt);
    this.updateStrikes(dt);
    this.act(e, dt);
    this.updateArena(dt);
  }

  act(e, dt) {
    const run = this.run, P = run.player, ph = BP.phases[this.phase];
    const dx = P.x - e.x, dz = P.z - e.z, dist = Math.hypot(dx, dz) || 0.01;
    if (this.state === 'enter') {
      this.y = Math.min(0, -5 + this.t * 4);
      if (this.t > BP.rise) {
        this.toChase(this.cd); this.phaseT = 0; run.audio.sfx('boss_roar', { pitch: this.kit.roar }); run.fx.shake(0.5);
        this.phaseBanner(0); run.ui.bossImmune(false);
      }
      return;
    }
    const st = this.state;
    if (st === 'chase') {
      const sp = BOSS.speed * ph.speed;
      e.x += (dx / dist) * sp * dt; e.z += (dz / dist) * sp * dt;
      e.rot = Math.atan2(dx, dz);
      if (this.cd <= 0) this.pickAttack(dist);
    } else if (st === 'slam') this.slamStep(e);
    else if (st === 'ring') this.ringStep(e, ph);
    else if (st === 'spiral') this.spiralStep(e);
    else if (st === 'summon') this.summonStep(e);
    else if (st === 'rain') this.rainStep(e);
    else if (st === 'lances') { if (this.t >= this.lanceEnd) this.recover(BP.lances.recover); }
    else if (st === 'smite') this.smiteStep(e);
    else if (st === 'fan') this.fanStep(e);
    else if (st === 'tidal') this.tidalStep(e, dt);
    else if (st === 'roots') { if (this.t >= this.lanceEnd) this.recover(BP.roots.recover); }
    else if (st === 'spores') this.rainStep(e, BP.spores);
    else if (st === 'storm') this.stormStep(e, dt);
    else if (st === 'roar') this.roarStep(e, dt, dx, dz, dist);
    // contact damage (never mid-air or mid-roar)
    if (dist < e.radius + P.radius && e.atkCd <= 0 && this.y < 0.5 && st !== 'roar') { e.atkCd = 1.0; P.hurt(this.dmg); }
    this.aura(e, dt);
  }

  /** Hollow aura: he sears minions that swarm him (not while immune); in phase III the Crown of Cinders also sheds embers. */
  aura(e, dt) {
    const run = this.run, c = this.col, C = BP.aura;
    if (this.phase === 2 && Math.random() < dt * 30) run.particles.emit(e.x + (Math.random() - 0.5) * 1.2, 0.91 * this.h + this.y, e.z + 0.3, (Math.random() - 0.5) * 1.2, 2 + Math.random() * 2, (Math.random() - 0.5) * 1.2, 0.7, 0.4, 0.05, c[0], c[1], c[2], 0.9, 1, -1);
    if (this.immune > 0 || !C.dps[this.phase]) return;
    // it only bites a swarm: none below `from` minions in reach, full strength at `full`
    const L = run.legion.list, r2 = C.r * C.r;
    let n = 0;
    for (let i = 0; i < L.length; i++) if (L[i].hp > 0 && (L[i].x - e.x) ** 2 + (L[i].z - e.z) ** 2 <= r2) n++;
    const k = Math.min(1, (n - C.from) / (C.full - C.from));
    if (k <= 0) return;
    const dmg = this.dmg * C.dps[this.phase] * k * dt;
    for (let i = 0; i < L.length; i++) {
      const m = L[i];
      if (!(m.hp > 0) || (m.x - e.x) ** 2 + (m.z - e.z) ** 2 > r2) continue;
      m.hp -= dmg;
      if (Math.random() < dt * 4) run.particles.emit(m.x, m.y, m.z, 0, 1.5, 0, 0.35, 0.35, 0.05, c[0], c[1], c[2], 0.9);
    }
  }

  toChase(cd) { this.state = 'chase'; this.t = 0; this.cd = cd; }
  recover(base) { this.toChase(base / (BP.phases[this.phase].rate * this.rate * this.tierRate)); }

  /** The phase banner: the boss's own name for it and how to survive it. */
  phaseBanner(i) { const [name, sub] = this.kit.phases[i]; this.run.ui.banner(name, `Phase ${ROMAN[i]} · ${sub}`, 'boss'); }

  pickAttack(dist) {
    const w = this.weights || (this.weights = {});
    for (const k in w) delete w[k];
    Object.assign(w, BP.phases[this.phase].weights);
    if (this.kit.sigW[this.phase]) w.sig = this.kit.sigW[this.phase]; // the boss's signature attack
    let total = 0;
    for (const k in w) if (this.can(k, dist)) total += w[k];
    let r = Math.random() * total, pick = this.phase ? 'rings' : 'ring';
    for (const k in w) { if (!this.can(k, dist)) continue; r -= w[k]; if (r <= 0) { pick = k; break; } }
    this.start(pick);
  }
  can(k, dist) { return k === 'slam' ? dist < BP.slam.range : k !== this.last; }

  /** QA / profiling hook: force an attack ('slam' | 'ring' | 'rings' | 'spiral' | 'sig' | 'summon' | 'rain' | 'lances' |
   *  'smite' | 'fan' | 'tidal' | 'roots' | 'spores' | 'storm') or an edge 'wave'. */
  force(k) {
    if (k === 'wave') return this.edgeWave();
    if (this.state !== 'enter' && this.state !== 'roar' && this.state !== 'dead') this.start(k);
  }

  start(kind) {
    const run = this.run, P = run.player, e = this.e, ph = BP.phases[this.phase], A = this.arena;
    this.last = kind; this.t = 0;
    if (kind === 'sig') kind = this.kit.sig;
    if (kind === 'echo') kind = BP.echo[this.echoI++ % BP.echo.length]; // Nihl: each fallen boss's signature in turn
    if (kind === 'slam') {
      // Grave Slam: he leaps onto the Shepherd's spot; rings at 3 / 6 / 9 m go off one after another
      const S = this.slams.find((o) => !o.on) || this.slams[0];
      let tx = P.x - A.x, tz = P.z - A.z;
      const d = Math.hypot(tx, tz), lim = A.r - 1;
      if (d > lim) { tx *= lim / d; tz *= lim / d; }
      S.on = true; S.t = 0; S.fired = 0; S.cancel = false; S.x = A.x + tx; S.z = A.z + tz;
      S.tele = Math.max(BP.minTele, ph.slamTele);
      S.fl[0] = S.fl[1] = S.fl[2] = 0; S.burn[0] = S.burn[1] = S.burn[2] = 0;
      const u = S.mesh.material.uniforms, T = BP.slam;
      u.uR.value.set(T.radii[0] / SLAM_S, T.radii[1] / SLAM_S, T.radii[2] / SLAM_S); u.uW.value = T.halfW / SLAM_S;
      u.uLane.value.set((T.radii[0] + T.radii[1]) / 2 / SLAM_S, (T.radii[1] + T.radii[2]) / 2 / SLAM_S);
      u.uState.value.set(0, 0, 0); u.uFlash.value.set(0, 0, 0); u.uBurn.value.set(0, 0, 0); u.uP.value = 0;
      S.mesh.position.set(S.x, 0.045, S.z); S.mesh.visible = true;
      this.slamS = S; this.jumped = false; this.state = 'slam';
      run.audio.sfx('warning', { volume: 0.35, pitch: 0.62 });
    } else if (kind === 'ring' || kind === 'rings') {
      // gap rings: telegraphed by a fan showing every wave's gaps; later waves turn by `turn`
      const R = BP.ring, spin = kind === 'rings';
      this.waves = (spin ? BP.rings.waves : R.waves) + (this.twist === 4 ? BP.extraRing : 0) + (this.tier >= BOSS_TIER.waveFrom ? 1 : 0);
      this.waveI = 0;
      this.turn = BP.rings.turn * (Math.random() < 0.5 ? 1 : -1);
      this.gapA = Math.atan2(P.z - e.z, P.x - e.x) + (Math.random() < 0.5 ? 1 : -1) * rnd(0.3, 0.95); // a gap starts near the Shepherd
      this.every = spin ? BP.rings.every : R.every;
      this.next = Math.max(BP.minTele, R.tele);
      this.spin = spin;
      this.setFan();
      this.fan.material.uniforms.uP.value = 0; this.fan.material.uniforms.uAlpha.value = 1; this.fan.material.uniforms.uFill.value = 1;
      this.fan.position.set(e.x, 0.05, e.z); this.fan.visible = true;
      this.state = 'ring';
      run.audio.sfx('summon', { volume: 0.4, pitch: 1.3 });
    } else if (kind === 'spiral') {
      // Crown of Cinders: a four-arm stream that turns one way; the Shepherd starts between two arms
      const Sp = BP.spiral;
      this.spinDir = Math.random() < 0.5 ? 1 : -1;
      this.theta0 = Math.atan2(P.z - e.z, P.x - e.x) + Math.PI / Sp.arms;
      this.tele = Math.max(BP.minTele, Sp.tele); this.emitT = 0; this.beat = 0;
      const u = this.sigil.material.uniforms;
      u.uP.value = 0; u.uAlpha.value = 1; u.uDir.value = -this.spinDir; u.uCurl.value = (Sp.spin * SIGIL_S) / Sp.speed;
      this.sigil.position.set(e.x, 0.05, e.z); this.sigil.visible = true;
      this.state = 'spiral';
      run.audio.sfx('summon', { volume: 0.5, pitch: 0.8 });
    } else if (kind === 'summon') {
      const Su = BP.summon;
      this.tele = Math.max(BP.minTele, Su.tele); this.summoned = false;
      for (let i = 0; i < Su.n; i++) {
        const a = (i / Su.n) * TAU, p = this.sumPts[i];
        p.x = e.x + Math.cos(a) * Su.r; p.z = e.z + Math.sin(a) * Su.r;
        this.clampIn(p, 1);
        run.fx.telegraph(p.x, p.z, 0.9, this.tele, this.color.getHex());
      }
      this.state = 'summon';
    } else if (kind === 'rain') {
      // Pyrexa's Cinder Rain: fire lobbed onto marked circles, the first on the Shepherd's path, the rest around him;
      // each leaves the ground burning (the Witches' lob, from her)
      const R = BP.rain, n = R.n[this.phase], Q = this.rainQ;
      Q.length = 0;
      for (let i = 0; i < n; i++) {
        const p = { x: 0, z: 0, at: i * R.every };
        if (i === 0) { p.x = P.x + P.vx * R.first; p.z = P.z + P.vz * R.first; }
        else { const a = Math.random() * TAU, d = rnd(R.spread[0], R.spread[1]); p.x = P.x + Math.cos(a) * d; p.z = P.z + Math.sin(a) * d; }
        this.clampIn(p, R.radius + 0.4);
        Q.push(p);
      }
      this.rainI = 0;
      this.state = 'rain';
      run.audio.sfx('summon', { volume: 0.45, pitch: 1.5 });
    } else if (kind === 'lances') {
      // Vaulkar's Glacier Lances: lanes of frost shards ripple out from him toward the Shepherd, every spot marked
      // until it erupts; the shards stand for a moment (the frost zones of his slam twist)
      const L = BP.lances, n = L.lanes[this.phase], base = Math.atan2(P.z - e.z, P.x - e.x), lim2 = (A.r - 0.6) ** 2;
      for (let j = 0; j < n; j++) {
        const a = base + (j - (n - 1) / 2) * L.arc;
        for (let k = 0; k < L.shards; k++) {
          const d = L.from + k * L.step, x = e.x + Math.cos(a) * d, z = e.z + Math.sin(a) * d;
          if ((x - A.x) ** 2 + (z - A.z) ** 2 > lim2) break;
          const delay = L.tele + k * L.every;
          const tele = run.hazards.circle(x, z, L.r, delay, this.danger);
          this.zones.push({ kind: 'frost', x, z, r0: 0, r1: 0, r: L.r, t: -delay, life: L.life, dmg: this.dmg * L.dmg, a: Math.random() * TAU, tele });
        }
      }
      this.lanceEnd = L.tele + L.shards * L.every;
      this.state = 'lances';
      run.audio.sfx('summon', { volume: 0.5, pitch: 0.6 });
    } else if (kind === 'smite') {
      // Azrathel's Smite: pillars of light fall where the Shepherd is about to be, one after another
      this.smiteN = BP.smite.n[this.phase]; this.smiteI = 0;
      this.state = 'smite';
    } else if (kind === 'fan') {
      // Vesperine's Blood Lances: she raises her scepter over a cone toward the Shepherd, then fans of blood orbs fly
      // down it a beat apart, each fan offset by half a gap from the last
      const F = BP.fan;
      this.fanA = Math.atan2(P.z - e.z, P.x - e.x); this.fanN = F.volleys[this.phase]; this.fanI = 0;
      e.rot = Math.atan2(P.x - e.x, P.z - e.z);
      run.hazards.cone(e, e.state, P.x - e.x, P.z - e.z, 11, F.arc / 2 + 0.06, F.windup, this.danger);
      this.state = 'fan';
      run.audio.sfx('summon', { volume: 0.45, pitch: 1.2 });
    } else if (kind === 'tidal') {
      // Morwenna's Tidal Lanes: parallel lanes across the arena along her line to the Shepherd (one through him), each
      // marked, then a wave runs down it one after another
      const T = BP.tidal, n = T.lanes[this.phase], a = Math.atan2(P.z - e.z, P.x - e.x), dx = Math.cos(a), dz = Math.sin(a);
      const pick = Math.floor(Math.random() * n), gap = (T.spread[1] - T.spread[0]) / Math.max(1, n - 1);
      this.lanes.length = 0;
      for (let i = 0; i < n; i++) {
        const off = (i - pick) * Math.max(gap, T.w * 2.6), cx = P.x - dz * off, cz = P.z + dx * off;
        this.lanes.push({ x0: cx - dx * T.len / 2, z0: cz - dz * T.len / 2, x1: cx + dx * T.len / 2, z1: cz + dz * T.len / 2, dx, dz, at: Math.max(BP.minTele, T.tele) + i * T.every, fired: false, live: 0 });
      }
      this.state = 'tidal';
      run.audio.sfx('summon', { volume: 0.45, pitch: 0.9 });
    } else if (kind === 'roots') {
      // Gorrath's Root Snare: lines of thorns rip out toward the Shepherd, every spot marked until it erupts; a thorn
      // that catches him holds him fast (a root)
      const L = BP.roots, n = L.lanes[this.phase], base = Math.atan2(P.z - e.z, P.x - e.x), lim2 = (A.r - 0.6) ** 2;
      for (let j = 0; j < n; j++) {
        const a = base + (j - (n - 1) / 2) * L.arc;
        for (let k = 0; k < L.spikes; k++) {
          const d = L.from + k * L.step, x = e.x + Math.cos(a) * d, z = e.z + Math.sin(a) * d;
          if ((x - A.x) ** 2 + (z - A.z) ** 2 > lim2) break;
          const delay = Math.max(BP.minTele, L.tele) + k * L.every;
          const tele = run.hazards.circle(x, z, L.r, delay, this.danger);
          this.zones.push({ kind: 'frost', x, z, r0: 0, r1: 0, r: L.r, t: -delay, life: L.life, dmg: this.dmg * L.dmg, a: Math.random() * TAU, tele, root: L.root });
        }
      }
      this.lanceEnd = Math.max(BP.minTele, L.tele) + L.spikes * L.every;
      this.state = 'roots';
      run.audio.sfx('summon', { volume: 0.5, pitch: 0.5 });
    } else if (kind === 'spores') {
      // Mother Mire's Blight Rain: spore pods lobbed onto marked circles (the first on the Shepherd's path) that burst
      // into lingering miasma
      const R = BP.spores, n = R.n[this.phase], Q = this.rainQ;
      Q.length = 0;
      for (let i = 0; i < n; i++) {
        const p = { x: 0, z: 0, at: i * R.every };
        if (i === 0) { p.x = P.x + P.vx * R.first; p.z = P.z + P.vz * R.first; }
        else { const a = Math.random() * TAU, d = rnd(R.spread[0], R.spread[1]); p.x = P.x + Math.cos(a) * d; p.z = P.z + Math.sin(a) * d; }
        this.clampIn(p, R.radius + 0.4);
        Q.push(p);
      }
      this.rainI = 0;
      this.state = 'spores';
      run.audio.sfx('summon', { volume: 0.45, pitch: 1.1 });
    } else if (kind === 'storm') {
      // Kaelthar's Tempest: lightning beams from him, marked, then turning around him (the Shepherd starts between two)
      const S = BP.storm, n = S.beams[this.phase];
      this.beams = { n, a0: Math.atan2(P.z - e.z, P.x - e.x) + Math.PI / n, dir: Math.random() < 0.5 ? 1 : -1, hitT: 0 };
      this.state = 'storm';
      run.audio.sfx('summon', { volume: 0.5, pitch: 1.7 });
    }
  }

  /** Tidal Lanes: marks fill, then each wave runs down its lane: the Shepherd inside is struck and swept along it;
   *  minions inside are hurt. */
  tidalStep(e, dt) {
    const T = BP.tidal, run = this.run, P = run.player, H = run.hazards, col = this.color;
    let done = true;
    for (const L of this.lanes) {
      if (!L.fired) {
        done = false;
        H.line(L.x0, L.z0, L.x1, L.z1, T.w, Math.min(1, this.t / L.at), false, col);
        if (this.t >= L.at) {
          L.fired = true; L.live = 0.3;
          const inside = (x, z, pad) => Math.abs((x - L.x0) * L.dz - (z - L.z0) * L.dx) < T.w + pad;
          if (!P.dead && inside(P.x, P.z, P.radius * 0.5)) { P.hurt(this.dmg * T.dmg); P.knock(L.dx * T.knock, L.dz * T.knock); }
          const ML = run.legion.list, md = this.dmg * T.dmg * T.minionDmg;
          for (let i = 0; i < ML.length; i++) { const m = ML[i]; if (!m.gone && m.hp > 0 && inside(m.x, m.z, 0.2)) { m.hp -= md; m.flash = 1; } }
          const c = this.hot, n = Math.round(30 * run.particles.budget);
          for (let k = 0; k < n; k++) { const u = Math.random(); run.particles.emit(L.x0 + (L.x1 - L.x0) * u, 0.3, L.z0 + (L.z1 - L.z0) * u, L.dx * 6, 1.5 + Math.random() * 2, L.dz * 6, 0.5, 0.55, 0.08, c[0], c[1], c[2], 1, 2, 0); }
          run.fx.shake(0.25);
          run.audio.sfx('explosion', { volume: 0.45, pitch: 0.6 });
        }
      } else if (L.live > 0) { done = false; L.live -= dt; H.line(L.x0, L.z0, L.x1, L.z1, T.w, 1, true, col); }
    }
    if (done) this.recover(T.recover);
  }

  /** Tempest: the beams are marked for tele s, then turn around him for dur s; the Shepherd in a beam is struck (at most
   *  once per hitCd s) and minions caught in one are seared. */
  stormStep(e, dt) {
    const S = BP.storm, B = this.beams, run = this.run, P = run.player, H = run.hazards, tele = Math.max(BP.minTele, S.tele);
    const live = this.t >= tele, a = B.a0 + B.dir * S.spin * Math.max(0, this.t - tele);
    B.hitT -= dt;
    const ML = run.legion.list, md = this.dmg * S.dmg * 2 * dt;
    for (let i = 0; i < B.n; i++) {
      const ang = a + (i / B.n) * TAU, dx = Math.cos(ang), dz = Math.sin(ang);
      const x0 = e.x + dx * S.inner, z0 = e.z + dz * S.inner, x1 = e.x + dx * S.len, z1 = e.z + dz * S.len;
      H.line(x0, z0, x1, z1, S.w, live ? 1 : this.t / tele, live, this.color);
      if (!live) continue;
      const on = (x, z, pad) => { const t = (x - e.x) * dx + (z - e.z) * dz; return t > S.inner && t < S.len && Math.abs((x - e.x) * dz - (z - e.z) * dx) < S.w + pad; };
      if (B.hitT <= 0 && !P.dead && on(P.x, P.z, P.radius * 0.4)) { P.hurt(this.dmg * S.dmg); B.hitT = S.hitCd; }
      for (let k = 0; k < ML.length; k++) { const m = ML[k]; if (!m.gone && m.hp > 0 && on(m.x, m.z, 0.2)) m.hp -= md; }
      if (Math.random() < 0.6) { const u = S.inner + Math.random() * (S.len - S.inner), c = this.hot; run.particles.emit(e.x + dx * u, 0.4, e.z + dz * u, 0, 1 + Math.random() * 2, 0, 0.25, 0.4, 0.05, c[0], c[1], c[2], 1); }
    }
    if (live && Math.random() < dt * 3) run.audio.sfx('explosion', { volume: 0.2, pitch: 2 });
    if (this.t >= tele + S.dur) { this.beams = null; this.recover(S.recover); }
  }

  /** Nihl's twist: the dark gathers around it (a ring closing on it for warn s), then pulls the Shepherd toward it. */
  updateWell(dt) {
    const W = BP.well, run = this.run, P = run.player, e = this.e;
    if (this.state === 'enter' || this.state === 'dead' || !e) return;
    if (!this.well) {
      if ((this.wellT -= dt) > 0) return;
      this.well = { t: 0 };
      run.hazards.circle(e.x, e.z, W.r, W.warn, this.danger, 1.0);
      run.audio.sfx('summon', { volume: 0.5, pitch: 0.4 });
      return;
    }
    const Wl = this.well;
    Wl.t += dt;
    if (Wl.t < W.warn) return;
    const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz);
    if (d < W.r && d > e.radius + 0.6 && !P.dead) { const f = W.strength * (1 - d / W.r) * dt; P.x += (dx / d) * f; P.z += (dz / d) * f; }
    if (Math.random() < 0.7) { const a = Math.random() * TAU, rr = W.r * (0.4 + Math.random() * 0.6), c = this.col; run.particles.emit(e.x + Math.cos(a) * rr, 0.3, e.z + Math.sin(a) * rr, -Math.cos(a) * rr, 0.5, -Math.sin(a) * rr, 0.7, 0.35, 0.05, c[0], c[1], c[2], 0.9, 0, 0); }
    if (Wl.t >= W.warn + W.pull) { this.well = null; this.wellT = rnd(W.every[0], W.every[1]); }
  }

  rainStep(e, R = BP.rain) {
    const Q = this.rainQ, spores = R === BP.spores;
    while (this.rainI < Q.length && this.t >= Q[this.rainI].at) {
      const p = Q[this.rainI++];
      this.run.projectiles.lob(e.x, e.z, p.x, p.z, this.dmg * R.dmg, R, spores ? 'miasma' : true);
    }
    if (this.rainI >= Q.length && this.t >= (Q.length ? Q[Q.length - 1].at : 0) + R.flight) this.recover(R.recover);
  }

  smiteStep(e) {
    const S = BP.smite, run = this.run, P = run.player;
    while (this.smiteI < this.smiteN && this.t >= this.smiteI * S.every) {
      const p = { x: P.x + P.vx * S.lead, z: P.z + P.vz * S.lead };
      this.clampIn(p, 0.8);
      this.strikes.push({ x: p.x, z: p.z, t: S.tele, tele: run.hazards.circle(p.x, p.z, S.r, S.tele, this.danger, 1.6) });
      this.smiteI++;
      run.audio.sfx('summon', { volume: 0.3, pitch: 1.9 });
    }
    if (this.smiteI >= this.smiteN && this.t >= (this.smiteN - 1) * S.every + S.tele) this.recover(S.recover);
  }

  /** Pillars of light land: the Shepherd inside is struck (+0.2 m grace), minions inside are hurt. */
  updateStrikes(dt) {
    const S = BP.smite, run = this.run, P = run.player, Q = this.strikes;
    let w = 0;
    for (let i = 0; i < Q.length; i++) {
      const s = Q[i];
      s.t -= dt;
      if (s.t > 0) { Q[w++] = s; continue; }
      if (Math.hypot(P.x - s.x, P.z - s.z) < S.r + 0.2 && !P.dead) P.hurt(this.dmg * S.dmg);
      const L = run.legion.list, md = this.dmg * S.dmg * S.minionDmg, r2 = S.r * S.r;
      for (let j = 0; j < L.length; j++) { const m = L[j]; if (!m.gone && m.hp > 0 && (m.x - s.x) ** 2 + (m.z - s.z) ** 2 < r2) { m.hp -= md; m.flash = 1; } }
      const c = this.hot, n = Math.round(36 * run.particles.budget);
      for (let k = 0; k < n; k++) run.particles.emit(s.x + (Math.random() - 0.5) * 0.7, Math.random() * 7, s.z + (Math.random() - 0.5) * 0.7, 0, 2 + Math.random() * 3, 0, 0.5, 0.55, 0.06, c[0], c[1], c[2], 1);
      run.particles.burst(s.x, 0.3, s.z, 30, this.col, { speed: 7, life: 0.5, size: 0.55, up: 0.6 });
      run.fx.shockwave(s.x, s.z, S.r * 1.3, this.color.getHex(), 0.35, 0.12);
      run.fx.light(s.x, s.z, 7, 2.2, this.color, 0.35);
      run.fx.shake(0.3);
      run.audio.sfx('boss_slam', { volume: 0.5, pitch: 1.5 });
    }
    Q.length = w;
  }

  fanStep(e) {
    const F = BP.fan, run = this.run, step = F.arc / (F.n - 1);
    while (this.fanI < this.fanN && this.t >= F.windup + this.fanI * F.every) {
      const odd = this.fanI % 2; // odd fans fill the gaps of the last one
      for (let k = 0; k < F.n - odd; k++) run.projectiles.bossOrb(e.x, e.z, this.fanA - F.arc / 2 + (k + odd * 0.5) * step, F.speed, this.dmg * F.dmg, this.orb);
      this.fanI++;
      run.audio.sfx('shoot', { volume: 0.5, pitch: 0.7 });
      run.particles.burst(e.x, 2.6, e.z, 16, this.col, { speed: 5, life: 0.4, size: 0.5 });
    }
    if (this.fanI >= this.fanN && this.t >= F.windup + (this.fanN - 1) * F.every + 0.2) this.recover(F.recover);
  }

  slamStep(e) {
    const S = this.slamS, p = this.t / S.tele;
    if (p >= 0.55 && !this.jumped) { this.jumped = true; this.fx0 = e.x; this.fz0 = e.z; }
    if (this.jumped && p < 1) {
      const k = Math.min(1, (p - 0.55) / 0.45);
      e.x = this.fx0 + (S.x - this.fx0) * k; e.z = this.fz0 + (S.z - this.fz0) * k;
      this.y = Math.sin(k * Math.PI) * 4;
    } else if (p >= 1) { this.y = 0; if (this.jumped) { e.x = S.x; e.z = S.z; } }
    if (S.fired >= 3 || S.cancel) this.recover(BP.slam.recover);
  }

  ringStep(e, ph) {
    const run = this.run, R = BP.ring, u = this.fan.material.uniforms;
    u.uP.value = Math.min(1, this.t / R.tele);
    if (this.t >= this.next && this.waveI < this.waves) {
      run.projectiles.emberRingGaps(e.x, e.z, R.n, R.gaps, R.gapSlots, this.gapA + this.turn * this.waveI, R.speed * ph.orb, this.dmg * R.dmg, this.orb);
      this.waveI++; this.next = this.t + this.every;
      run.audio.sfx('explosion', { volume: 0.5, pitch: 0.7 });
      run.particles.burst(e.x, 2.2, e.z, 30, this.col, { speed: 6, life: 0.5, size: 0.6 });
      run.fx.shockwave(e.x, e.z, 2.4, this.color.getHex(), 0.3, 0.2);
      if (this.waveI >= this.waves) this.fan.visible = false; else { this.setFan(); u.uFill.value = 0.4; } // the orbs are the danger now
    }
    if (this.waveI >= this.waves && this.t >= this.next) this.recover(this.spin ? BP.rings.recover : R.recover);
  }

  /** The fan shows the gaps of the waves still to come (shader angles run the other way round). */
  setFan() {
    const u = this.fan.material.uniforms, a = this.gapA + this.turn * this.waveI, t = this.turn;
    u.uA.value.set(-a, -(a + t), -(a + 2 * t), -(a + 3 * t));
    u.uN.value = this.waves - this.waveI; u.uGw.value = GAP_HALF;
  }

  spiralStep(e) {
    const run = this.run, Sp = BP.spiral, u = this.sigil.material.uniforms;
    const live = this.t - this.tele;
    // telegraph: the sigil turns into its start angle the way the stream will turn
    u.uP.value = Math.min(1, this.t / this.tele);
    u.uTheta.value = -(this.theta0 + this.spinDir * Sp.spin * Math.min(live, Sp.dur));
    u.uAlpha.value = live < 0 ? 1 : Math.max(0.25, 1 - live * 2);
    while (live >= this.emitT && this.emitT < Sp.dur) {
      const a = this.theta0 + this.spinDir * Sp.spin * this.emitT;
      run.projectiles.spiral(e.x, e.z, Sp.arms, a, Sp.speed, this.dmg * Sp.dmg, this.orb);
      if (this.beat++ % 3 === 0) run.audio.sfx('shoot', { volume: 0.35, pitch: 0.55 });
      this.emitT += Sp.every;
    }
    e.rot = Math.PI / 2 - (this.theta0 + this.spinDir * Sp.spin * Math.max(0, live));
    if (live >= Sp.dur) { this.sigil.visible = false; this.recover(Sp.recover); }
  }

  summonStep(e) {
    const run = this.run, Su = BP.summon;
    if (this.t > this.tele && !this.summoned) {
      this.summoned = true;
      for (let i = 0; i < Su.n; i++) {
        const p = this.sumPts[i];
        run.enemies.spawn(i % 3 === 0 ? 'ghoul' : 'husk', p.x, p.z, { hpMul: run.hpMul(), dmgMul: run.dmgMul() });
        run.particles.burst(p.x, 0.4, p.z, 14, this.col, { speed: 3, life: 0.6, size: 0.5, up: 1.2 });
      }
      run.audio.sfx('boss_roar', { volume: 0.6, pitch: 1.3 });
    }
    if (this.t > this.tele + 0.5) this.recover(Su.recover);
  }

  // ---------------------------------------------------------------- phases
  onHit(e) {
    const run = this.run;
    // Soul Nova hurts him at 50%, at most 25% of max HP per Nova (run.counters.novas names the current one)
    if (e.lastHitBy === 'nova') {
      if (this.novaId !== run.counters.novas) { this.novaId = run.counters.novas; this.novaDealt = 0; }
      const take = Math.min(Math.max(0, this.lastHp - e.hp) * BP.nova.mul, Math.max(0, e.maxHp * BP.nova.cap - this.novaDealt));
      this.novaDealt += take; e.hp = this.lastHp - take;
    }
    if (e.hp > 0) {
      if (this.immune > 0) { e.hp = this.lockHp; run.fx.immune(e.x, e.z, 4.6); run.audio.sfx('ward', { volume: 0.35 }); }
      else {
        let n = this.phase;
        while (n < 2 && e.hp <= e.maxHp * this.thresholds[n]) n++;
        if (n > this.phase && (this.held || this.phaseT < BP.minPhase[this.phase])) { // too soon: warded at the tick until the phase has played out
          const floor = e.maxHp * this.thresholds[this.phase];
          if (this.held) this.phaseT += (floor - e.hp) / (e.maxHp * BP.wardBreak); // hammering the ward shatters it sooner
          e.hp = floor;
          if (!this.held) { this.held = true; run.ui.bossImmune(true); }
          run.fx.immune(e.x, e.z, 4.6); run.audio.sfx('ward', { volume: 0.35 });
        } else if (n > this.phase) { this.pendingPhase = n; this.immune = BP.transition.dur; this.lockHp = e.hp; } // the roar starts next frame
      }
    }
    this.lastHp = e.hp;
    run.ui.bossHp(Math.max(0, e.hp / e.maxHp));
  }

  /** Phase transition: 2 s immune roar. Shots clear, the Shepherd is pushed back, slow-mo, flash and the phase banner. */
  startRoar(e) {
    const run = this.run, T = BP.transition, ph = BP.phases[this.pendingPhase], A = this.arena;
    this.phase = this.pendingPhase;
    this.cancelAttacks();
    this.state = 'roar'; this.t = 0; this.y = 0; this.immune = T.dur;
    run.projectiles.clearEnemyShots();
    run.fx.slowMo(T.slow, T.slowDur); run.fx.hitStop(HITSTOP.phase); run.fx.flash(T.flash); run.fx.aberration(0.9); run.fx.shake(0.8);
    run.fx.shockwave(e.x, e.z, 14, this.color.getHex(), 0.9, 0.06);
    run.fx.shockwave(e.x, e.z, T.pushR, 0xffffff, 0.5, 0.12);
    run.fx.light(e.x, e.z, 14, 3.5, this.color, 1.2);
    run.particles.burst(e.x, 3, e.z, 160, this.col, { speed: 9, life: 1.1, size: 0.7, up: 1.6 });
    run.particles.burst(e.x, 1, e.z, 60, this.hot, { speed: 3, life: 1.4, size: 0.5, up: 4 });
    run.audio.sfx('boss_roar', { pitch: this.kit.roar }); run.audio.sfx('phase'); run.app.haptic('heavy');
    this.phaseBanner(this.phase);
    run.ui.bossImmune(true);
    // knock the nearby horde back (no damage)
    run.enemies.query(e.x, e.z, T.knockR, (o) => { if (o === e) return; const dx = o.x - e.x, dz = o.z - e.z, l = Math.hypot(dx, dz) || 1; o.kx += (dx / l) * T.knock; o.kz += (dz / l) * T.knock; });
    if (this.nextWave === Infinity) this.nextWave = this.fightT + T.dur + BP.waves.first;
    if (this.phase === 2) { A.from = A.r; A.to = BP.arena.closeTo; A.closeT = 1e-6; run.audio.sfx('summon', { volume: 0.7, pitch: 0.5 }); run.audio.playMusic('boss3'); }
  }

  roarStep(e, dt, dx, dz, dist) {
    const T = BP.transition, P = this.run.player;
    const k = 1 - this.t / 0.6; // gentle push, strongest at the start
    if (k > 0 && dist < T.pushR) { P.x += (dx / dist) * T.push * k * dt; P.z += (dz / dist) * T.push * k * dt; }
    if (this.t >= T.dur) { this.immune = 0; this.phaseT = 0; this.run.ui.bossImmune(false); this.toChase(0.8); }
  }

  /** Stop whatever he was doing (telegraphs that have not gone off are withdrawn). */
  cancelAttacks() {
    this.fan.visible = false; this.sigil.visible = false;
    for (const S of this.slams) if (S.on && S.fired < 3) { S.cancel = true; S.mesh.material.uniforms.uState.value.set(1, 1, 1); }
    // marked spots that have not gone off yet are withdrawn with their marks (Glacier Lances, Smite)
    const Z = this.zones;
    let w = 0;
    for (let i = 0; i < Z.length; i++) { const z = Z[i]; if (z.t < 0) { this.unmark(z.tele, z.x, z.z); continue; } Z[w++] = z; }
    Z.length = w;
    for (const s of this.strikes) this.unmark(s.tele, s.x, s.z);
    this.strikes.length = 0; this.rainQ.length = 0;
    this.lanes.length = 0; this.beams = null; this.well = null; // Tidal Lanes, Tempest and the dark's pull are withdrawn too
  }
  /** Ends a mark still showing (telegraphs are pooled: only if it is still the one placed at x, z). */
  unmark(t, x, z) { if (t && t.x === x && t.z === z && t.t < t.dur) t.t = t.dur; }

  hollowDirge() {
    const run = this.run, e = this.e;
    this.dirge = true;
    this.dmg = this.baseDmg * BP.dirge.dmg; this.rate = BP.dirge.rate;
    run.ui.banner(this.kit.dirge[0], this.kit.dirge[1], 'boss');
    run.audio.sfx('warning'); run.app.haptic('warning');
    run.fx.hurt(0.35); run.fx.shake(0.4);
    run.particles.burst(e.x, 3.5, e.z, 90, this.col, { speed: 6, life: 1, size: 0.6, up: 2 });
  }

  // ---------------------------------------------------------------- Grave Slam rings and lingering hazards
  updateSlams(dt) {
    const T = BP.slam;
    for (const S of this.slams) {
      if (!S.on) continue;
      S.t += dt;
      const u = S.mesh.material.uniforms;
      u.uTime.value += dt; u.uP.value = Math.min(1, S.t / S.tele);
      while (!S.cancel && S.fired < 3 && S.t >= S.tele + S.fired * T.every) this.fireRing(S, S.fired++);
      let live = !S.cancel && S.fired < 3;
      for (let k = 0; k < 3; k++) {
        S.fl[k] = Math.max(0, S.fl[k] - dt * 2.8);
        if (S.burn[k] > 0) S.burn[k] = Math.max(0, S.burn[k] - dt);
        if (S.fl[k] > 0 || S.burn[k] > 0) live = true;
      }
      u.uFlash.value.set(S.fl[0], S.fl[1], S.fl[2]);
      u.uBurn.value.set(Math.min(1, S.burn[0] * 2), Math.min(1, S.burn[1] * 2), Math.min(1, S.burn[2] * 2));
      if (!live) { S.on = false; S.mesh.visible = false; }
    }
  }

  fireRing(S, k) {
    const run = this.run, P = run.player, T = BP.slam, e = this.e, R = T.radii[k], W = T.halfW;
    S.mesh.material.uniforms.uState.value.setComponent(k, 1);
    S.fl[k] = 1;
    // fair hitbox: the Shepherd's centre must be inside the band (+0.2 m grace)
    const d = Math.hypot(P.x - S.x, P.z - S.z);
    if ((k === 0 ? d < R + W + 0.2 : Math.abs(d - R) < W + 0.2) && !P.dead) P.hurt(this.dmg * T.dmg);
    // the landing kills every minion inside outright (Champion Bulwarks included); the outer rings only hurt them
    const L = run.legion.list, md = this.dmg * T.dmg * T.minionDmg;
    for (let i = 0; i < L.length; i++) {
      const m = L[i];
      if (m.gone || !(m.hp > 0)) continue;
      const dm = Math.hypot(m.x - S.x, m.z - S.z);
      if (k === 0 ? dm < R + W : Math.abs(dm - R) < W) { m.hp = k === 0 ? 0 : m.hp - md; m.flash = 1; }
    }
    // a wall of sparks erupts along the band
    const c = this.hot, n = Math.round((20 + 10 * k) * run.particles.budget);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.2;
      run.particles.emit(S.x + Math.cos(a) * R, 0.2, S.z + Math.sin(a) * R, Math.cos(a) * 2, 3 + Math.random() * 4, Math.sin(a) * 2, 0.55, 0.65, 0.08, c[0], c[1], c[2], 1, 2, 6);
    }
    if (k === 0) {
      run.fx.shockwave(S.x, S.z, (R + W) * 1.5, this.color.getHex(), 0.5, 0.16);
      run.particles.burst(S.x, 0.3, S.z, 90, this.col, { speed: 11, life: 0.7, size: 0.6, up: 0.4 });
      run.fx.light(S.x, S.z, 10, 2.5, this.color, 0.5);
      run.fx.shake(0.7); run.fx.aberration(0.8);
      run.audio.sfx('boss_slam'); run.app.haptic('heavy');
    } else {
      run.fx.shockwave(S.x, S.z, R + W, this.color.getHex(), 0.3, 0.08);
      run.fx.shake(0.3);
      run.audio.sfx('explosion', { volume: 0.55, pitch: 0.55 + 0.1 * k });
    }
    // chapter twists leave the band dangerous
    if (this.twist >= 6 && this.twist <= 8) { // tide pools, brambles or miasma along the band (Morwenna, Gorrath, Mother Mire)
      const Z = this.twist === 6 ? BP.tide : this.twist === 7 ? BP.thorn : BP.rot, kind = this.twist === 6 ? 'tide' : this.twist === 7 ? 'bramble' : 'miasma';
      const n = Z.n[k], off = Math.random() * TAU;
      for (let i = 0; i < n; i++) { const a = off + (i / n) * TAU; run.hazards.lay(kind, S.x + Math.cos(a) * R, S.z + Math.sin(a) * R, Z.r, Z.life); }
    }
    if (this.twist === 2) {
      S.burn[k] = BP.fire.life;
      this.zones.push({ kind: 'fire', x: S.x, z: S.z, r0: R - W, r1: R + W, r: 0, t: 0, life: BP.fire.life, dmg: this.dmg * BP.fire.dmg, a: 0 });
    } else if (this.twist === 3) {
      const n = BP.frost.n[k], off = Math.random() * TAU;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * TAU;
        this.zones.push({ kind: 'frost', x: S.x + Math.cos(a) * R, z: S.z + Math.sin(a) * R, r0: 0, r1: 0, r: BP.frost.r, t: 0, life: BP.frost.life, dmg: this.dmg * BP.frost.dmg, a: Math.random() * TAU });
      }
    }
  }

  updateZones(dt) {
    const P = this.run.player, Z = this.zones;
    let w = 0;
    for (let i = 0; i < Z.length; i++) {
      const z = Z[i];
      const was = z.t;
      z.t += dt;
      if (z.t >= z.life) continue;
      Z[w++] = z;
      if (was < 0 && z.t >= 0) this.erupt(z); // a marked Glacier Lance spot goes off
      if (z.t < 0.2 || z.t > z.life - 0.3 || P.dead) continue; // brief grace while it ignites and as it fades
      const d = Math.hypot(P.x - z.x, P.z - z.z);
      if (z.kind === 'fire' ? d > z.r0 - 0.15 && d < z.r1 + 0.15 : d < z.r + P.radius * 0.6) {
        P.hurt(z.dmg);
        if (z.root && !z.rooted) { z.rooted = true; P.root(z.root); } // Gorrath's thorns hold him fast
      }
    }
    Z.length = w;
  }

  erupt(z) {
    const run = this.run, c = this.hot;
    run.particles.burst(z.x, 0.4, z.z, 10, c, { speed: 4, life: 0.4, size: 0.45, up: 1.6 });
    if (run.t - (this.eruptSfx || -1) > 0.09) { this.eruptSfx = run.t; run.audio.sfx('explosion', { volume: 0.3, pitch: 1.7 }); }
  }

  // ---------------------------------------------------------------- the sealed arena
  updateArena(dt) {
    const A = this.arena, run = this.run, P = run.player, C = BP.arena, e = this.e;
    if (!A.on) return;
    A.seal = Math.min(1, A.seal + dt / C.seal);
    if (A.seal >= 1 && !A.purged) this.purgeHorde();
    if (A.closeT > 0) {
      A.closeT += dt;
      const k = Math.min(1, A.closeT / C.closeTime);
      A.r = A.from + (A.to - A.from) * ease(k);
      if (k >= 1) A.closeT = 0;
    }
    // soft wall: the Shepherd can lean into the last metre, is pushed back, and never gets past r - hard
    A.hitK = Math.max(0, A.hitK - dt * 2.5); A.sparkT -= dt; A.hapT -= dt;
    const dx = P.x - A.x, dz = P.z - A.z, d = Math.hypot(dx, dz) || 0.001, soft = A.r - C.soft;
    if (d > soft) {
      const pen = d - soft, nx = dx / d, nz = dz / d;
      const nd = Math.min(d - pen * Math.min(1, C.push * dt), A.r - C.hard);
      P.x = A.x + nx * nd; P.z = A.z + nz * nd;
      const vr = P.vx * nx + P.vz * nz;
      if (vr > 0) { P.vx -= nx * vr; P.vz -= nz * vr; }
      A.hitA = Math.atan2(dz, dx); A.hitK = Math.min(1, A.hitK + pen * 2);
      if (pen > 0.25 && A.sparkT <= 0) {
        A.sparkT = 0.16;
        this.spark(A.x + nx * A.r, A.z + nz * A.r, 10);
        run.audio.sfx('wall', { volume: 0.8 });
        if (A.hapT <= 0) { A.hapT = 0.6; run.app.haptic('light'); }
      }
    }
    // the boss stays inside as well
    const bx = e.x - A.x, bz = e.z - A.z, bd = Math.hypot(bx, bz), lim = A.r - e.radius - 0.3;
    if (bd > lim && this.state !== 'enter') { e.x = A.x + (bx / bd) * lim; e.z = A.z + (bz / bd) * lim; }
    run.projectiles.cullBossOrbs(A.x, A.z, A.r, this._spark);
  }

  spark(x, z, n) {
    const run = this.run, c = this.hot;
    run.particles.burst(x, 0.6, z, n, c, { speed: 5, life: 0.35, size: 0.4, up: 1.2 });
  }

  clampIn(p, margin) {
    const A = this.arena, dx = p.x - A.x, dz = p.z - A.z, d = Math.hypot(dx, dz), lim = A.r - margin;
    if (d > lim) { p.x = A.x + (dx / d) * lim; p.z = A.z + (dz / d) * lim; }
  }

  /** As the seal completes the old horde burns to ash (no kills, no souls): from now on adds only come from the edge. Elites stay. */
  purgeHorde() {
    const A = this.arena, run = this.run;
    A.purged = true;
    for (const o of run.enemies.active) {
      if (!o.active || o.type === 'boss' || o.elite) continue;
      run.particles.burst(o.x, 0.7, o.z, 6, this.col, { speed: 3, life: 0.5, size: 0.4, up: 1 });
      run.enemies.remove(o);
    }
  }

  // ---------------------------------------------------------------- boss-time adds (Run.director hands the boss branch to us)
  director(dt) {
    const run = this.run, T = BP.trickle;
    if (!this.e || this.state === 'dead') return;
    run.spawnAcc += T.rate * dt * run.chapter.rate;
    while (run.spawnAcc >= 1) { run.spawnAcc -= 1; if (run.enemies.count < T.max[this.phase]) this.edgeSpawn(Math.random() < 0.7 ? 'husk' : 'ghoul'); }
    if (this.phase >= 1 && this.fightT >= this.nextWave && this.state !== 'roar') {
      this.edgeWave();
      this.nextWave = this.fightT + rnd(BP.waves.every[0], BP.waves.every[1]);
    }
    const Q = this.pending;
    let w = 0;
    for (let i = 0; i < Q.length; i++) {
      const p = Q[i];
      p.t -= dt;
      if (p.t > 0) { Q[w++] = p; continue; }
      if (run.enemies.count < run.maxEnemies) run.spawnEnemy(p.type, { at: p });
      run.particles.burst(p.x, 0.5, p.z, 16, this.col, { speed: 4, life: 0.5, size: 0.5, up: 1.5 });
    }
    Q.length = w;
  }

  /** A point just inside the rune wall, at least minDist from the Shepherd. */
  edgePoint(a, out) {
    const A = this.arena, r = A.r - 0.9;
    out.x = A.x + Math.cos(a) * r; out.z = A.z + Math.sin(a) * r;
    return out;
  }

  edgeSpawn(type) {
    const run = this.run, P = run.player, A = this.arena, min2 = BP.trickle.minDist ** 2, p = { x: 0, z: 0 };
    let a = Math.random() * TAU;
    for (let i = 0; i < 6 && ((this.edgePoint(a, p).x - P.x) ** 2 + (p.z - P.z) ** 2 < min2); i++) a = Math.random() * TAU;
    if ((p.x - P.x) ** 2 + (p.z - P.z) ** 2 < min2) this.edgePoint(Math.atan2(A.z - P.z, A.x - P.x), p); // far side
    run.spawnEnemy(type, { at: p });
    run.particles.burst(p.x, 0.5, p.z, 8, this.col, { speed: 3, life: 0.45, size: 0.45, up: 1.4 });
  }

  /** Phase II+: 12–16 Husks rise along an arc of the wall opposite the Shepherd (a Brute leads them in phase III). */
  edgeWave() {
    const run = this.run, P = run.player, A = this.arena, W = BP.waves;
    const n = Math.floor(rnd(W.size[0], W.size[1] + 1));
    const base = Math.atan2(P.z - A.z, P.x - A.x) + Math.PI + rnd(-0.7, 0.7), min2 = W.minDist ** 2;
    for (let i = 0; i < n; i++) {
      const p = this.edgePoint(base + (i / (n - 1) - 0.5) * W.arc, { x: 0, z: 0, t: Math.max(BP.minTele, W.tele), type: 'husk' });
      if ((p.x - P.x) ** 2 + (p.z - P.z) ** 2 < min2) continue;
      if (this.phase === 2 && i === n >> 1) p.type = 'brute';
      this.pending.push(p);
    }
    run.audio.sfx('warning', { volume: 0.35, pitch: 0.8 });
  }

  onDeath(e) {
    const run = this.run;
    run.ui.bossHp(0);
    run.ui.bossImmune(false);
    this.dropArena();
    run.onBossKilled(e.x, e.z);
    this.state = 'dead';
    this.deathT = 0;
  }

  /** The seal breaks: hazards, pending adds and telegraphs go with it. */
  dropArena() {
    const A = this.arena, run = this.run;
    A.on = false; A.drop = 1;
    run.hazards.thunder = null;
    this.cancelAttacks();
    this.zones.length = 0; this.pending.length = 0; this.shards.count = 0;
    const c = this.col;
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * TAU;
      run.particles.emit(A.x + Math.cos(a) * A.r, 0.3, A.z + Math.sin(a) * A.r, 0, 3 + Math.random() * 4, 0, 1.1, 0.7, 0.05, c[0], c[1], c[2], 1, 1.5, 0);
    }
  }

  // ---------------------------------------------------------------- rendering
  render(dt) {
    const run = this.run, rdt = Math.min(0.1, run.t - this.rt);
    this.rt = run.t;
    if (this.ring) this.renderArena(dt, rdt);
    if (!this.mesh) return;
    const e = this.e;
    if (this.state === 'dead') {
      this.deathT += dt;
      const k = Math.max(0, 1 - this.deathT / 1.2);
      this.mesh.scale.setScalar(Math.max(0.01, k));
      this.mat.uniforms.uFlash.value = 1;
      if (k <= 0) { run.scene.remove(this.mesh); }
      return;
    }
    const roar = this.state === 'roar';
    this.mesh.position.set(e.x, this.y + (roar ? Math.abs(Math.sin(this.t * 18)) * 0.12 : 0), e.z);
    this.mesh.rotation.y = e.rot;
    this.mesh.scale.setScalar(roar ? 1 + 0.1 * Math.sin(Math.min(1, this.t * 2) * Math.PI) : 1);
    const st = this.state, windup = st === 'ring' || st === 'summon' || st === 'lances' || (st === 'spiral' && this.t < this.tele)
      || (st === 'fan' && this.t < BP.fan.windup) || ((st === 'rain' || st === 'spores') && this.rainI < this.rainQ.length) || (st === 'smite' && this.smiteI < this.smiteN)
      || st === 'roots' || st === 'tidal' || (st === 'storm' && this.t < BP.storm.tele) ? 0.08 + 0.06 * Math.sin(this.t * 25) : 0;
    const shield = (this.immune > 0 && this.state !== 'enter') || this.held ? 0.25 + 0.15 * Math.sin(this.t * 30) : 0;
    // capped: hit constantly, the boss must keep its colour. A painted boss winds up by flaring its glowing paint (a white
    // flash would bleach the paint); the ward still flashes it, more softly
    const paint = this.glow0 > 0;
    this.mat.uniforms.uFlash.value = Math.max(e.flash * 0.15, paint ? 0 : windup, paint ? shield * 0.6 : shield);
    this.mat.uniforms.uTime.value += dt;
    this.mat.uniforms.uEmit.value = 3 + this.phase * 0.7 + (this.dirge ? 0.6 : 0);
    if (paint) this.mat.uniforms.uGlow.value = this.glow0 * (1 + this.phase * 0.25 + (this.dirge ? 0.2 : 0) + windup * 6); // crown, eyes and heart flare
    const g = run.glow, k = 1 + this.phase * 0.25, h = this.h, gk = this.glowK; // a glow at the chest and one at the crown, in the boss's colour
    g.add(e.x, 0.5 * h + this.y, e.z + 0.9, 2.2 * k, this.col[0] * 0.5 * gk, this.col[1] * 0.5 * gk, this.col[2] * 0.5 * gk, 0.9);
    g.add(e.x, 0.89 * h + this.y, e.z + 0.3, 3.0 * k, this.col[0] * 0.25 * gk, this.col[1] * 0.25 * gk, this.col[2] * 0.25 * gk, 0.8);
    if (shield) g.add(e.x, 2.4, e.z, 7.5, this.col[0] * 0.18, this.col[1] * 0.18, this.col[2] * 0.18, 0.8);
  }

  renderArena(dt, rdt) {
    const A = this.arena, run = this.run;
    const ru = this.ring.material.uniforms, wu = this.wall.material.uniforms;
    if (A.on || A.drop > 0) {
      if (!A.on) A.drop = Math.max(0, A.drop - rdt);
      const alpha = A.on ? 1 : A.drop;
      ru.uTime.value += dt; wu.uTime.value += dt;
      ru.uSeal.value = wu.uSeal.value = A.seal; ru.uAlpha.value = wu.uAlpha.value = alpha;
      ru.uHit.value.set(A.hitA, A.hitK); wu.uHit.value.set(A.hitA, A.hitK);
      ru.uClose.value = A.closeT > 0 ? Math.min(1, A.closeT * 3, (BP.arena.closeTime - A.closeT) * 2) : 0;
      this.ring.scale.setScalar(A.r);
      this.wall.scale.set(A.r, WALL_H * (A.on ? ease(Math.min(1, A.seal * 1.4)) : alpha), A.r);
      if (!A.on && A.drop <= 0) this.ring.visible = this.wall.visible = false;
    }
    // telegraphed edge spawns: rune flares rising from the wall
    const g = run.glow, c = this.col;
    for (const p of this.pending) {
      const k = 1 - p.t / BP.waves.tele;
      g.add(p.x, 0.4, p.z, 1.2 + k * 1.6, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 0.9);
      if (Math.random() < dt * 14) run.particles.emit(p.x + (Math.random() - 0.5) * 0.8, 0.1, p.z + (Math.random() - 0.5) * 0.8, 0, 3 + k * 3, 0, 0.6, 0.45, 0.05, c[0], c[1], c[2], 0.9);
    }
    if (this.fan.visible) this.fan.material.uniforms.uTime.value += dt;
    if (this.sigil.visible) this.sigil.material.uniforms.uTime.value += dt;
    // frost shards (Vaulkar's slam twist and Glacier Lances; still-marked spots are not up yet)
    let n = 0;
    for (const z of this.zones) {
      if (z.kind !== 'frost' || z.t < 0 || n >= MAX_SHARDS) continue;
      const grow = Math.min(1, z.t / 0.2) * Math.min(1, (z.life - z.t) / 0.3);
      _q.setFromAxisAngle(_up, z.a); _p.set(z.x, 0, z.z); _s.set(grow, grow * (0.85 + 0.15 * Math.sin(z.a * 7)), grow);
      _m.compose(_p, _q, _s);
      this.shards.setMatrixAt(n++, _m);
      g.add(z.x, 0.15, z.z, 2.4 * grow, c[0] * 0.3, c[1] * 0.3, c[2] * 0.3, 0.9); // boss-palette danger halo at the base
      g.add(z.x, 1.2, z.z, 1.4 * grow, 0.3, 0.5, 0.9, 0.6);
    }
    this.shards.count = n;
    if (n) this.shards.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    const sc = this.run.scene;
    if (this.mesh) { sc.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
    if (!this.ring) return;
    for (const m of [this.ring, this.wall, this.fan, this.sigil, this.shards, ...this.slams.map((S) => S.mesh)]) { sc.remove(m); m.geometry.dispose(); m.material.dispose(); }
  }
}
