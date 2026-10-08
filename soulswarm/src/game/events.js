// Mid-run events (GDD §4.7): the Soul Thief, the Shrine of Souls and the Cursed Coffin. One at a time, roughly every
// 80–110 s from 1:00 to 5:20 (Endless keeps rolling), never near a gate pair, an elite, a swarm ring or Gravemaw.
// Every event is optional: ignored, it lapses. While it is off screen an edge arrow points the way.
// The thief and the coffin are pooled enemies tagged e.ev (so weapons and minions hit them like anything else) that
// draw with their own meshes; Enemies.update hands them to drive() instead of the horde AI.
// Hooks: Run.director → director(), Run.update → update(), Run.onEnemyKilled → onKill(), Run.recomputeStats →
// applyStats(), Run.addXp → xpMul, RunUI → buffs (the blessing chips).
import * as THREE from 'three';
import { RUN_EVENTS, BLESSINGS } from './data.js';
import { makeCharMaterial } from '../engine/materials.js';
import { eventGeometry } from '../engine/models.js';
import { foeModel, loadFoeModel, setGait } from '../engine/foemodels.js';
import { hdr } from '../engine/particles.js';

const R = RUN_EVENTS, TH = R.thief, SH = R.shrine, CF = R.coffin;
const KINDS = ['thief', 'shrine', 'coffin'];
const COLOR = { thief: '#ffcf4a', shrine: '#7cffd4', coffin: '#ff5a8a' };
const FADE = 0.8;
const _v = new THREE.Vector3(), _sp = { x: 0, y: 0 };
const rnd = (a) => a[0] + Math.random() * (a[1] - a[0]);
const near = (t, at, c) => Math.abs(at - t) < c; // a scheduled beat (gate, elite, swarm) within c s of t

const shrineFrag = /* glsl */`
uniform vec3 uColor; uniform vec3 uGold; uniform float uTime; uniform float uP; uniform float uIn; uniform float uA;
varying vec2 vUv;
void main() {
  vec2 c = vUv * 2.0 - 1.0; float r = length(c);
  if (r > 1.0) discard;
  float ang = atan(c.y, c.x), u = fract(atan(c.x, c.y) / 6.28318 + 1.0); // u: 0 at the top of the screen, clockwise
  float rim = smoothstep(0.03, 0.0, abs(r - 0.93));
  float inner = smoothstep(0.018, 0.0, abs(r - 0.72));
  float ticks = step(0.77, r) * step(r, 0.87) * step(0.62, fract(u * 30.0 - uTime * 0.2));
  float t1 = smoothstep(0.016, 0.0, abs(r * cos(mod(ang + uTime * 0.4, 2.0944) - 1.0472) - 0.46));
  float t2 = smoothstep(0.016, 0.0, abs(r * cos(mod(ang - uTime * 0.4 + 1.0472, 2.0944) - 1.0472) - 0.46));
  float fill = smoothstep(1.0, 0.0, r) * (0.1 + 0.16 * uIn);
  float prog = smoothstep(0.075, 0.0, abs(r - 0.93)) * step(u, uP) * step(0.001, uP);
  float pulse = 0.75 + 0.25 * sin(uTime * 3.0) + uIn * 0.35;
  vec3 col = uColor * ((rim * 1.4 + inner * 0.8 + ticks * 0.75 + (t1 + t2) * 0.7 * step(r, 0.72)) * pulse + fill) + uGold * prog * 2.6;
  gl_FragColor = vec4(col * uA, 1.0);
}`;

export class Events {
  constructor(run) {
    this.run = run;
    this.cur = null;              // the live event: { kind, state, t, x, z, e, uid, … }
    this.nextAt = rnd(R.first);
    this.last = null; this.depth = 0;
    this.buffs = []; this.buffKey = ''; this.xpMul = 1; this.magnet = false; this.magT = 0;
    this.arrow = { on: false, x: 0, y: 0, a: 0, d: -1, label: '' };
    this.started = 0;
    const charOpts = { emit: 2.8, ambient: 0x3a3236, key: 0x9a9098, plRadius: 6 };
    this.thiefMat = makeCharMaterial({ ...charOpts, rim: 0xffd27a, anim: 1 });
    this.thiefMat.uniforms.uTint.value.set(0xffcf4a);
    this.thief = new THREE.Mesh(eventGeometry('thief'), this.thiefMat);
    this.sackZ = -0.5; // the sack's glint: on the procedural imp's back
    const tm = foeModel('thief');
    if (tm) this.usePaintedThief(tm);
    else loadFoeModel('thief').then((m) => { if (m && !this.disposed) this.usePaintedThief(m); });
    this.coffinMat = makeCharMaterial({ ...charOpts, rim: 0xff7a9a, anim: 0 });
    this.coffinMat.uniforms.uTint.value.set(0xff2e6a);
    this.coffin = new THREE.Mesh(eventGeometry('coffin'), this.coffinMat);
    const g = new THREE.PlaneGeometry(2, 2); g.rotateX(-Math.PI / 2);
    this.shrineMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x7cffd4) }, uGold: { value: new THREE.Color(0xffd04a) }, uTime: { value: 0 }, uP: { value: 0 }, uIn: { value: 0 }, uA: { value: 1 } },
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: shrineFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.shrine = new THREE.Mesh(g, this.shrineMat);
    this.shrine.renderOrder = 2;
    const curseMat = this.shrineMat.clone(); // the same rune circle, in crimson, under the coffin
    curseMat.uniforms.uColor.value.set(0xff2e6a);
    this.curse = new THREE.Mesh(g.clone(), curseMat);
    this.curse.renderOrder = 2;
    this.crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0).scale(0.75, 1.5, 0.75), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7cffd4).multiplyScalar(2.4) }));
    this.meshes = [this.thief, this.coffin, this.shrine, this.curse, this.crystal];
    for (const m of this.meshes) { m.visible = false; m.frustumCulled = false; run.scene.add(m); }
    this.col = { gold: hdr(0xffcf4a, 3.2), soul: hdr(0x7cffd4, 2.6), curse: hdr(0xff2e6a, 3), wood: hdr(0x6a4630, 1.2), smoke: hdr(0x8a7a9a, 0.9) };
    this.light = { gold: new THREE.Color(0xffcf4a), soul: new THREE.Color(0x7cffd4), curse: new THREE.Color(0xff2e6a) };
  }

  // ---------------------------------------------------------------- scheduling (Run.director, outside the boss fight)
  director() {
    const run = this.run, t = run.time;
    if (run.bossKills !== this.depth) { this.depth = run.bossKills; this.nextAt = Math.max(this.nextAt, t + 25); } // Endless: breathe after each King
    if (this.cur || t < this.nextAt || t < R.from || (!run.endless && t > R.to) || (run.tutorial && t < R.tutorialFrom)) return;
    if (!this.clear(t)) return;
    this.nextAt = this.start(this.pick()) ? t + rnd(R.every) : t + 2; // no clear spot right now: try again shortly
  }

  /** Nothing else is happening: no gate pair, elite or swarm ring close in time, and Gravemaw is not near. */
  clear(t) {
    const run = this.run, c = R.clear;
    if (run.nextBossAt - t < R.bossGap || run.player.dead || run.victory) return false;
    if (near(t, run.nextGate, c) || near(t, run.nextGate - run.gateEvery, c)) return false;
    if (run.gates.pair && !run.gates.pair.done && run.gates.pair.t < c) return false;
    const T = run.eliteTimes, i = run.eliteIdx, nextElite = i < T.length ? T[i] : run.endless ? run.nextElite : Infinity;
    if (near(t, nextElite, c) || near(t, run.affixes.lastAt, c)) return false;
    return !(near(t, run.nextSwarm, R.swarm) || near(t, run.nextSwarm - 60, R.swarm));
  }

  pick() {
    let total = 0;
    for (const k of KINDS) if (k !== this.last) total += R.weights[k];
    let r = Math.random() * total;
    for (const k of KINDS) { if (k === this.last) continue; r -= R.weights[k]; if (r <= 0) return k; }
    return KINDS.find((k) => k !== this.last);
  }

  /** A spot `dist` m from the Shepherd (ahead of him first), clear of hazards and of a standing gate pair. */
  spot(dist = R.dist) {
    const run = this.run, P = run.player, G = run.gates.pair;
    const base = Math.hypot(P.vx, P.vz) > 0.5 ? Math.atan2(P.vz, P.vx) : -Math.PI / 2;
    for (let k = 0; k < 32; k++) {
      const a = k < 10 ? base + (Math.random() - 0.5) * 2.2 : Math.random() * Math.PI * 2;
      const x = P.x + Math.cos(a) * dist, z = P.z + Math.sin(a) * dist;
      if (!run.hazards.isClear(x, z, 2.6)) continue;
      if (G && G.gates.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < 30)) continue;
      return { x, z };
    }
    return null;
  }

  /** Start an event (QA can pass `at`). Returns false when there is no room for it. */
  start(kind, at = null) {
    const run = this.run, p = at || this.spot();
    if (!p || this.cur) return false;
    const ev = { kind, state: 'live', t: 0, x: p.x, z: p.z, e: null, uid: 0, fade: 0, hold: 0, inside: false, awake: false, seed: Math.random() * 6.28, wave: null, waveT: 0 };
    if (kind !== 'shrine') {
      const e = run.enemies.spawn(kind === 'thief' ? 'ghoul' : 'husk', p.x, p.z, { hpMul: 1 });
      if (!e) return false;
      const D = kind === 'thief' ? TH : CF;
      e.ev = ev; ev.e = e; ev.uid = e.uid;
      e.maxHp = e.hp = D.hp * run.hpMul() * run.mut.hp;
      e.dmg = 0.01; e.scale = 1; e.flank = 0;
      if (kind === 'thief') { e.speed = TH.speed; e.radius = 0.42; e.mass = 1.2; }
      else { e.speed = 0; e.radius = 0.75; e.mass = 999; }
    }
    this.cur = ev; this.last = kind; this.started++;
    if (kind === 'thief') {
      run.ui.banner('SOUL THIEF', 'It flees with stolen souls. Catch it for gold and XP!', 'gold');
      run.audio.sfx('thief_appear');
      run.audio.voice('a_thief');
    } else if (kind === 'shrine') {
      run.ui.banner('SHRINE OF SOULS', `Stand in its circle to receive a blessing for ${SH.buff} s`, 'soul');
      run.audio.sfx('shrine_chime', { volume: 0.55 });
      run.audio.voice('a_shrine');
    } else {
      run.ui.banner('CURSED COFFIN', 'Break it to unleash a horde. Survive it for a Relic Chest', 'ember');
      run.audio.sfx('warning', { volume: 0.35, pitch: 0.7 });
      run.audio.voice('a_coffin');
    }
    run.fx.shockwave(p.x, p.z, 3, COLOR[kind], 0.6, 0.12);
    return true;
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    this.updateBuffs(dt);
    const ev = this.cur, run = this.run;
    if (!ev) return;
    ev.t += dt;
    if (run.bossSpawned && !run.bossDead && !ev.closed) this.close(ev); // Gravemaw seals the arena: what is left lapses
    if (ev.state === 'gone') { ev.fade += dt; if (ev.fade >= FADE) this.cur = null; return; }
    if (ev.kind === 'thief') this.updateThief(ev, dt);
    else if (ev.kind === 'shrine') this.updateShrine(ev, dt);
    else this.updateCoffin(ev, dt);
  }

  end(ev) { ev.state = 'gone'; ev.fade = 0; }

  /** Boss time: the thief slips away, the shrine fades, an unbroken coffin sinks, a pending coffin reward pays out now. */
  close(ev) {
    ev.closed = true;
    if (ev.state === 'wave') return this.reward(ev);
    if (ev.e && ev.e.active && ev.e.uid === ev.uid) this.run.enemies.remove(ev.e);
    if (ev.state !== 'pick') this.end(ev);
  }

  /** Enemies.update hands event-owned enemies here instead of running the horde AI. */
  drive(e, dt) {
    const ev = e.ev;
    if (ev.kind !== 'thief') { e.x = ev.x; e.z = ev.z; e.vx = e.vz = e.kx = e.kz = 0; return; } // the coffin stays put
    const P = this.run.player;
    let dx = e.x - P.x, dz = e.z - P.z;
    const d = Math.hypot(dx, dz) || 0.001;
    dx /= d; dz /= d;
    let speed = 0;
    if (ev.awake || ev.t >= TH.wake || d < TH.alert) {
      ev.awake = true;
      speed = e.speed * (d > TH.far ? TH.dawdle : 1);
      const j = Math.sin(ev.t * 2.3 + ev.seed) * 0.6, sx = dx - dz * j, sz = dz + dx * j, l = Math.hypot(sx, sz) || 1; // jinks as it runs
      dx = sx / l; dz = sz / l;
    }
    const k = Math.exp(-8 * dt);
    e.kx *= k; e.kz *= k;
    e.vx = dx * speed + e.kx; e.vz = dz * speed + e.kz;
    e.x += e.vx * dt; e.z += e.vz * dt;
    const tr = speed > 0 ? Math.atan2(e.vx, e.vz) : Math.atan2(-dx, -dz); // idle: it rummages, watching the Shepherd
    let dr = tr - e.rot; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    e.rot += dr * Math.min(1, dt * 10);
  }

  updateThief(ev, dt) {
    const run = this.run, e = ev.e;
    if (!e.active || e.uid !== ev.uid) { this.cur = null; return; } // swept away without a kill
    const P = run.player, d = Math.hypot(e.x - P.x, e.z - P.z), c = this.col.gold;
    if (Math.random() < dt * 14 * run.particles.budget) run.particles.emit(e.x + (Math.random() - 0.5) * 0.5, 0.6 + Math.random() * 0.7, e.z + (Math.random() - 0.5) * 0.5, 0, 1.2, 0, 0.5, 0.3, 0.05, c[0], c[1], c[2], 1, 0, 0);
    if (ev.awake && Math.random() < dt * 6) run.particles.emit(e.x, 0.9, e.z, (Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2, 0.6, 0.22, 0.12, c[0], c[1], c[2], 1, 0.5, 12); // coins spill
    if (ev.t >= TH.life || d > TH.escape) this.escape(ev);
  }

  escape(ev) {
    const run = this.run, e = ev.e;
    run.particles.burst(e.x, 0.6, e.z, 30, this.col.smoke, { speed: 3, life: 0.8, size: 0.9, up: 1.2 });
    run.particles.burst(e.x, 0.8, e.z, 20, this.col.gold, { speed: 5, life: 0.5, size: 0.35, up: 1.5 });
    run.fx.text(e.x, 1.8, e.z, 'It got away', 'gold');
    run.enemies.remove(e);
    run.ui.banner('IT GOT AWAY', 'The Soul Thief vanished with its loot', 'ember');
    run.audio.sfx('thief_escape');
    this.end(ev);
  }

  thiefSlain(ev, e) {
    const run = this.run, gold = TH.gold[0] + TH.gold[1] * run.chapter.id, xp = Math.max(8, Math.round(run.xpNeed * TH.xp));
    run.bonusGold += gold;
    for (let i = 0; i < 10; i++) run.pickups.dropGem(e.x, e.z, Math.ceil(xp / 10));
    run.particles.burst(e.x, 0.8, e.z, 70, this.col.gold, { speed: 9, life: 0.9, size: 0.45, up: 1.6, grav: 10 });
    run.fx.shockwave(e.x, e.z, 5, 0xffcf4a, 0.5, 0.12);
    run.fx.light(e.x, e.z, 7, 2.2, this.light.gold, 0.6);
    run.fx.text(e.x, 2.2, e.z, `+${gold} gold`, 'gold');
    run.ui.bigNumber(`+${gold}`, 'GOLD RECLAIMED', true);
    run.audio.sfx('coin'); run.audio.sfx('champion', { volume: 0.7 });
    run.app.haptic('success');
    run.counters.events++;
    run.counters.byType.thief++; // Bestiary
    this.end(ev);
  }

  updateShrine(ev, dt) {
    if (ev.state !== 'live') return; // the blessing modal is open
    const run = this.run, P = run.player, c = this.col.soul;
    const inside = !P.dead && (P.x - ev.x) ** 2 + (P.z - ev.z) ** 2 < SH.r * SH.r;
    ev.inside = inside;
    ev.hold = inside ? ev.hold + dt : Math.max(0, ev.hold - dt * SH.drain);
    const n = (inside ? 30 : 6) * dt * run.particles.budget;
    for (let i = 0; i < 2; i++) {
      if (Math.random() >= n) continue;
      const a = Math.random() * 6.283, r = SH.r * (inside ? 0.95 : Math.random());
      run.particles.emit(ev.x + Math.cos(a) * r, 0.1, ev.z + Math.sin(a) * r, -Math.cos(a) * (inside ? 1.2 : 0), 1.6 + Math.random(), -Math.sin(a) * (inside ? 1.2 : 0), 0.9, 0.35, 0.05, c[0], c[1], c[2], 1, 0.5, 0);
    }
    if (ev.hold >= SH.hold) this.offer(ev);
    else if (ev.t >= SH.life && !inside) this.end(ev);
  }

  /** The shrine answers: gameplay pauses (like a level-up) on a 1-of-3 blessing pick. */
  offer(ev) {
    const run = this.run, P = run.player;
    ev.state = 'pick';
    run.levelPending = true;
    run.input.reset();
    const pool = Object.keys(BLESSINGS).filter((id) => !this.buffs.some((b) => b.id === id)), ids = [];
    while (ids.length < 3 && pool.length) ids.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    const choices = ids.map((id) => ({ id, kind: 'blessing', name: BLESSINGS[id].name, icon: BLESSINGS[id].icon, desc: BLESSINGS[id].desc, rarity: 'epic', tag: `${SH.buff} s` }));
    run.particles.burst(ev.x, 1.2, ev.z, 60, this.col.soul, { speed: 7, life: 0.8, size: 0.45, up: 2 });
    run.fx.shockwave(ev.x, ev.z, SH.r * 2.6, 0x7cffd4, 0.6, 0.1);
    run.fx.light(P.x, P.z, 8, 2, this.light.soul, 0.7);
    run.audio.sfx('shrine_chime');
    run.app.haptic('success');
    run.ui.showLevelUp(choices, run.level, (c) => this.bless(c.id), { shrine: true });
  }

  bless(id) {
    const run = this.run, ev = this.cur, B = BLESSINGS[id];
    const b = this.buffs.find((x) => x.id === id);
    if (b) b.left = SH.buff; else this.buffs.push({ id, name: B.name, icon: B.icon, left: SH.buff, dur: SH.buff });
    this.restat();
    run.levelPending = false;
    run.player.invuln = Math.max(run.player.invuln, 0.6);
    run.counters.events++;
    if (ev && ev.kind === 'shrine') this.end(ev);
    run.fx.text(run.player.x, 2.6, run.player.z, B.name.toUpperCase(), 'big');
    run.audio.sfx('select');
    if (run.levelQueue > 0 || run.chestQueue > 0) setTimeout(() => { if (!run.ended && !run.levelPending) run.showLevelUp(); }, 120);
  }

  updateBuffs(dt) {
    const B = this.buffs;
    if (!B.length) return;
    let w = 0;
    for (let i = 0; i < B.length; i++) { B[i].left -= dt; if (B[i].left > 0) B[w++] = B[i]; }
    if (w < B.length) { B.length = w; this.restat(); }
    if (this.magnet && (this.magT -= dt) <= 0) {
      this.magT = 0.2;
      const pk = this.run.pickups;
      pk.magnetAll();
      for (const o of pk.special) o.pulled = true;
    }
  }

  restat() {
    this.xpMul = 1; this.magnet = false;
    for (const b of this.buffs) { const D = BLESSINGS[b.id]; if (D.xp) this.xpMul *= D.xp; if (D.magnet) this.magnet = true; }
    this.buffKey = this.buffs.map((b) => b.id).join();
    this.run.recomputeStats();
  }

  /** Run.recomputeStats: blessings ride on top of the build. */
  applyStats(S) {
    for (const b of this.buffs) {
      const D = BLESSINGS[b.id];
      if (D.minionDmg) S.minionDmg *= D.minionDmg;
      if (D.speed) S.speed *= D.speed;
      if (D.raise) S.raise = Math.min(0.85, S.raise + D.raise);
    }
  }

  updateCoffin(ev, dt) {
    const run = this.run;
    if (ev.state === 'burst') return this.burst(ev);
    if (ev.state === 'wave') {
      ev.waveT += dt;
      let alive = 0;
      for (const w of ev.wave) if (w.e.active && w.e.uid === w.uid) alive++;
      ev.alive = alive;
      if (!alive || ev.waveT >= CF.reward) this.reward(ev);
      return;
    }
    const e = ev.e;
    if (!e.active || e.uid !== ev.uid) { this.cur = null; return; }
    const c = this.col.curse;
    if (Math.random() < dt * 8 * run.particles.budget) {
      const a = Math.random() * 6.283;
      run.particles.emit(ev.x + Math.cos(a) * 0.6, 0.2, ev.z + Math.sin(a) * 0.6, 0, 0.9 + Math.random() * 0.6, 0, 1.1, 0.5, 0.1, c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 0.8, 0.3, 0);
    }
    if (ev.t >= CF.life) { run.enemies.remove(e); this.end(ev); }
  }

  /** The coffin breaks (the frame after the killing blow): the wave and a chest-less mini-elite pour out around it. */
  burst(ev) {
    const run = this.run, cap = run.maxEnemies + 24, wave = ev.wave = [];
    for (let i = 0; i < CF.wave && run.enemies.count < cap; i++) {
      const a = (i / CF.wave) * Math.PI * 2 + Math.random() * 0.3, r = rnd(CF.ring);
      const o = run.spawnEnemy(run.pickType(), { at: { x: ev.x + Math.cos(a) * r, z: ev.z + Math.sin(a) * r } });
      if (!o) continue;
      o.kx = Math.cos(a) * 4; o.kz = Math.sin(a) * 4;
      wave.push({ e: o, uid: o.uid });
    }
    const M = CF.mini, mini = run.spawnEnemy(M.types[Math.floor(Math.random() * M.types.length)], { elite: true, at: { x: ev.x, z: ev.z + 0.9 } });
    if (mini) {
      mini.maxHp = mini.hp = mini.maxHp * M.hp; mini.scale *= M.scale; mini.radius *= M.scale;
      run.affixes.roll(mini, 1, { noChest: true });
      wave.push({ e: mini, uid: mini.uid });
    }
    const c = this.col.curse;
    run.particles.burst(ev.x, 1, ev.z, 50, this.col.wood, { speed: 8, life: 0.8, size: 0.4, up: 1.2, grav: 12, drag: 1 });
    run.particles.burst(ev.x, 1, ev.z, 60, c, { speed: 6, life: 1.0, size: 0.6, up: 1.5 });
    run.fx.shockwave(ev.x, ev.z, 7, 0xff2e6a, 0.6, 0.1);
    run.fx.light(ev.x, ev.z, 9, 2.6, this.light.curse, 0.7);
    run.fx.shake(0.35); run.fx.flash(0.2);
    run.audio.sfx('coffin_break');
    run.app.haptic('warning');
    run.ui.banner('THE COFFIN BURSTS', `Clear the horde, or last ${CF.reward} s, for a Relic Chest`, 'ember');
    ev.state = 'wave'; ev.waveT = 0; ev.alive = wave.length;
  }

  /** The curse lifts: a Relic Chest rises from the coffin and flies to the Shepherd (the normal chest flow). */
  reward(ev) {
    const run = this.run, pk = run.pickups, n = pk.special.length;
    pk.dropSpecial('chest', ev.x, ev.z);
    if (pk.special.length > n) pk.special[n].pulled = true;
    else run.openChest(); // no room for another pickup: open it on the spot
    run.particles.burst(ev.x, 1, ev.z, 50, this.col.gold, { speed: 6, life: 0.8, size: 0.5, up: 2 });
    run.ui.banner('THE CURSE LIFTS', 'A Relic Chest is yours', 'gold');
    run.audio.sfx('champion');
    run.counters.events++;
    this.end(ev);
  }

  /** Run.onEnemyKilled: an event-owned enemy died. Returns true (the normal kill rewards don't apply). */
  onKill(e) {
    const ev = e.ev;
    if (ev !== this.cur || ev.uid !== e.uid || ev.state !== 'live') return true;
    if (ev.kind === 'thief') this.thiefSlain(ev, e);
    else { ev.state = 'burst'; this.cur.e = null; }
    return true;
  }

  // ---------------------------------------------------------------- drawing
  render() {
    const ev = this.cur, run = this.run, g = run.glow, P = run.player;
    const kind = ev ? ev.kind : '';
    this.thief.visible = kind === 'thief' && ev.state === 'live';
    this.coffin.visible = this.curse.visible = kind === 'coffin' && (ev.state === 'live' || (ev.state === 'gone' && !ev.wave));
    this.shrine.visible = this.crystal.visible = kind === 'shrine';
    if (!ev) return;
    const time = this.run.t;
    if (this.thief.visible) {
      const e = ev.e, pop = Math.min(1, ev.t * 3), U = this.thiefMat.uniforms;
      this.thief.position.set(e.x, (1 - pop) * -0.6, e.z);
      this.thief.rotation.set(0, e.rot, 0);
      this.thief.scale.setScalar(1.4 * pop);
      U.uFlash.value = e.flash; U.uTime.value = time; U.uAnim.value.set(ev.seed, ev.awake ? 1.4 : 0.4);
      U.uPLPos.value.set(P.x, 1.6, P.z); U.uPLColor.value.copy(run.heroColorObj).multiplyScalar(0.45);
      const c = this.col.gold, tw = 0.75 + 0.25 * Math.sin(time * 9);
      g.add(e.x + Math.sin(e.rot) * this.sackZ, 1.2, e.z + Math.cos(e.rot) * this.sackZ, 1.5 * tw, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 0.9); // the sack glints
    }
    if (this.coffin.visible) {
      const e = ev.e, hit = e && e.active ? e.flash : 0, U = this.coffinMat.uniforms;
      const sink = ev.state === 'gone' ? Math.min(1, ev.fade / FADE) : 0, rise = Math.min(1, ev.t * 2);
      this.coffin.position.set(ev.x + Math.sin(time * 60) * 0.06 * hit, -2.2 * (1 - rise) - 2.2 * sink, ev.z);
      this.coffin.rotation.set(0, 0, Math.sin(time * 47) * 0.05 * hit);
      U.uFlash.value = hit * 0.6; U.uTime.value = time;
      U.uPLPos.value.set(P.x, 1.6, P.z); U.uPLColor.value.copy(run.heroColorObj).multiplyScalar(0.45);
      const c = this.col.curse, pulse = 0.6 + 0.4 * Math.sin(time * 2.5), C = this.curse.material.uniforms;
      g.add(ev.x, 1.3 - 2.2 * sink, ev.z, 1.6 * pulse * (1 - sink), c[0] * 0.3, c[1] * 0.3, c[2] * 0.3, 0.7);
      this.curse.position.set(ev.x, 0.05, ev.z);
      this.curse.scale.setScalar(1.7);
      C.uTime.value = time; C.uIn.value = Math.min(1, hit * 2); C.uA.value = rise * (1 - sink) * 0.8;
    }
    if (kind === 'shrine') {
      const a = ev.state === 'gone' ? 1 - Math.min(1, ev.fade / FADE) : Math.min(1, ev.t * 2), U = this.shrineMat.uniforms;
      this.shrine.position.set(ev.x, 0.06, ev.z);
      this.shrine.scale.setScalar(SH.r);
      U.uTime.value = time; U.uP.value = ev.hold / SH.hold; U.uIn.value = ev.inside ? 1 : 0; U.uA.value = a;
      const bob = Math.sin(time * 2) * 0.12, y = 1.7 + bob;
      this.crystal.position.set(ev.x, y, ev.z);
      this.crystal.rotation.set(0, time * 1.4, 0);
      this.crystal.scale.setScalar(Math.max(0.01, a) * (1 + (ev.inside ? 0.15 * Math.sin(time * 12) : 0)));
      const c = this.col.soul;
      for (let k = 0; k < 4; k++) g.add(ev.x, 1.1 + k * 0.85, ev.z, (1.9 - k * 0.3) * a, c[0] * 0.28, c[1] * 0.28, c[2] * 0.28, 0.7); // a soft pillar of light
      g.add(ev.x, y, ev.z, 2.2 * a, c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 1);
    }
  }

  /** The off-screen arrow (and a health bar over a struck thief or coffin). arrow.on is exposed for QA. */
  draw2d(ctx) {
    const ev = this.cur, A = this.arrow;
    A.on = false;
    if (!ev || ev.state !== 'live') return;
    const run = this.run, eng = run.engine, P = run.player, e = ev.e;
    const x = e ? e.x : ev.x, z = e ? e.z : ev.z, Wd = eng.w, Hd = eng.h;
    _v.set(x, 0.8, z);
    const p = eng.project(_v, run.camera, _sp), col = COLOR[ev.kind];
    if (p && p.x > 6 && p.x < Wd - 6 && p.y > 6 && p.y < Hd - 6) {
      if (e && e.hp < e.maxHp) {
        const bw = 38, y = p.y - (ev.kind === 'coffin' ? 92 : 48);
        ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(p.x - bw / 2 - 1, y - 1, bw + 2, 6);
        ctx.fillStyle = col; ctx.fillRect(p.x - bw / 2, y, bw * Math.max(0, e.hp / e.maxHp), 4);
      }
      return;
    }
    // where the ray from the screen centre to the event leaves a frame inset clear of the HUD
    const cx = Wd / 2, cy = Hd / 2;
    let dx = p ? p.x - cx : x - P.x, dy = p ? p.y - cy : z - P.z;
    if (!dx && !dy) dy = -1;
    const L = 28, Rt = Wd - 28, T = 150, B = Hd - 150;
    const s = Math.min(dx > 0 ? (Rt - cx) / dx : dx < 0 ? (L - cx) / dx : Infinity, dy > 0 ? (B - cy) / dy : dy < 0 ? (T - cy) / dy : Infinity);
    const ax = cx + dx * s, ay = cy + dy * s, a = Math.atan2(dy, dx), d = Math.round(Math.hypot(x - P.x, z - P.z));
    A.on = true; A.x = ax; A.y = ay; A.a = a;
    if (d !== A.d) { A.d = d; A.label = d + ' m'; }
    const pulse = 0.8 + 0.2 * Math.sin(run.t * 6);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.shadowColor = col; ctx.shadowBlur = 12;
    ctx.save(); ctx.rotate(a);
    ctx.fillStyle = col; ctx.globalAlpha = pulse;
    ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(15, -8); ctx.lineTo(15, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,10,22,.85)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (ev.kind === 'thief') { ctx.arc(0, 1, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(8,10,22,.9)'; ctx.fillRect(-0.9, -2.5, 1.8, 7); } // a coin
    else if (ev.kind === 'shrine') { ctx.moveTo(0, -7); ctx.lineTo(4.5, 0); ctx.lineTo(0, 7); ctx.lineTo(-4.5, 0); ctx.closePath(); ctx.fill(); } // a soul crystal
    else { ctx.moveTo(-2.5, -7); ctx.lineTo(2.5, -7); ctx.lineTo(4.5, -2); ctx.lineTo(2, 7); ctx.lineTo(-2, 7); ctx.lineTo(-4.5, -2); ctx.closePath(); ctx.fill(); } // a coffin
    const ly = Math.sin(a) > 0.4 ? -17 : 17; // the distance sits on the side the chevron doesn't
    ctx.font = '800 10px Oxanium, "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = ly < 0 ? 'bottom' : 'top';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(A.label, 0, ly);
    ctx.fillStyle = '#fff'; ctx.fillText(A.label, 0, ly);
    ctx.restore();
  }

  /** The painted Soul Thief: a grinning goblin hugging his sack of gold and souls, sprinting on the walk shader. */
  usePaintedThief(m) {
    const mat = makeCharMaterial({ map: m.map, glow: m.glow, rim: 0xffd27a, rimK: 0.6, emit: 2.8, anim: 1, gait: true, ambient: 0xa8a4b0, key: 0xc4c0cc, plRadius: 6 });
    setGait(mat, m);
    mat.uniforms.uTint.value.set(0xffcf4a);
    this.thief.geometry.dispose(); this.thief.material.dispose();
    this.thief.geometry = m.geometry.clone(); this.thief.material = mat;
    this.thiefMat = mat;
    this.sackZ = 0.3; // he hugs it in front of him
  }

  dispose() {
    this.disposed = true;
    for (const m of this.meshes) { m.geometry.dispose(); m.material.dispose(); }
  }
}
