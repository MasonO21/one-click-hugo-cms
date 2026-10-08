// Hero Rites: each hero's signature active ability on the RITE button (Shift / E on desktop). Tunables: RITES in data.js.
//   Vael      Grave Call    every kill rises for 4 s and nearby soul shards fly in; soul pillars mark the risen
//   Nyx       Shadow Step   an untouchable dash that cuts a path through the horde; the legion surges after her
//   Seraphine Ashfall       burning chains fall on the field (elites first), ignite, and feed her Nova
//   Liora     Death Knell   a spectral bell tolls: stun, her toll mark, enemy shots silenced
//   Mordrake  Ossuary Wall  a ring of bone spikes hurls the horde out and mends the legion inside
// Run.update calls poll() (input), update(dt) right after the Shepherd moves, and render() inside the glow pass.
import * as THREE from 'three';
import { RITES, EVOLUTIONS } from './data.js';
import { hdr } from '../engine/particles.js';
import { makeRuneCircle, makeArc } from './fxmeshes.js';

const TAU = Math.PI * 2;
const KEYS = ['ShiftLeft', 'ShiftRight', 'KeyE'];
const BURN_SHARE = EVOLUTIONS.chainsOfPerdition.burn; // weapons.ignite() pools this share of the hit it is given
const MAX_PILLARS = 40, GHOSTS = 4, STRAND = 9, MAX_STRIKES = 24;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _ax = new THREE.Vector3(), _v = new THREE.Vector3(), _sp = { x: 0, y: 0 };
// shared particle options (read at once by Particles.burst / ring)
const SPARK = { speed: 2.2, life: 0.7, size: 0.4, up: 3.2, drag: 1.5 }, DUST = { speed: 3, life: 0.5, size: 0.5, up: 0.6 };
const IMPACT = { speed: 5, life: 0.45, size: 0.45, up: 1.2 }, IMPACT_RING = { life: 0.3, size: 0.4, y: 0.3 };
const BONE = { speed: 6, life: 0.4, size: 0.3, up: 1.6, grav: 14, drag: 1 }, HEAL = { speed: 1.4, life: 0.6, size: 0.35, up: 2.2 };
const WHITE = [3, 3, 3.2], ASH = [1.4, 0.75, 0.4], FLAME = hdr(0xffa040, 3.4), EMBER = hdr(0xff6a1e, 3), MARROW = hdr(0x6dff9a, 2.6), BONE_HDR = hdr(0xfff0d2, 1.8);

const additive = (uniforms, vert, frag, side = THREE.FrontSide) => new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side });

/** Grave Call: soul pillars (instanced open cylinders; iData = alpha, seed). Bright at the base, streaks rising. */
function pillarMesh(color) {
  const g = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true).translate(0, 0.5, 0);
  const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PILLARS * 2), 2).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iData', a);
  const mat = additive({ uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } }, /* glsl */`
    attribute vec2 iData; varying vec2 vUv; varying vec2 vD;
    void main() { vUv = uv; vD = iData; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`, /* glsl */`
    uniform vec3 uColor; uniform float uTime; varying vec2 vUv; varying vec2 vD;
    void main() {
      float y = vUv.y, fade = pow(max(1.0 - y, 0.0), 1.4) * smoothstep(0.0, 0.05, y);
      float rise = pow(fract(y * 2.2 - uTime * 2.4 + vD.y * 5.0), 4.0);
      float streak = pow(abs(sin((vUv.x + vD.y) * 18.85 + y * 4.0)), 12.0);
      float v = (0.5 + rise * 1.1 + streak * 0.7) * fade * vD.x;
      gl_FragColor = vec4(uColor * v * 0.8, 1.0);
    }`, THREE.DoubleSide);
  const mesh = new THREE.InstancedMesh(g, mat, MAX_PILLARS);
  mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 6;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return { mesh, attr: a };
}

/** Death Knell: a spectral bronze-less bell, fresnel-lit, with a toll band that runs down its body. Lip at y = 0. */
function bellMesh(color) {
  const prof = [[0, 1.75], [0.3, 1.72], [0.52, 1.56], [0.6, 1.3], [0.62, 1.0], [0.7, 0.62], [0.86, 0.3], [1.02, 0.07], [1.07, 0], [0.98, -0.03]];
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 32);
  const mat = additive({ uColor: { value: new THREE.Color(color) }, uAlpha: { value: 1 }, uRing: { value: 2 } }, /* glsl */`
    varying vec3 vN; varying vec3 vV; varying float vY;
    void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - wp.xyz; vY = position.y; gl_Position = projectionMatrix * viewMatrix * wp; }`, /* glsl */`
    uniform vec3 uColor; uniform float uAlpha; uniform float uRing; varying vec3 vN; varying vec3 vV; varying float vY;
    void main() {
      float fr = 1.0 - min(abs(dot(normalize(vN), normalize(vV))), 1.0), rim = pow(fr, 1.7);
      float bands = smoothstep(0.035, 0.0, abs(vY - 0.34)) + smoothstep(0.035, 0.0, abs(vY - 1.3)) + smoothstep(0.06, 0.0, abs(vY - 0.03)) * 1.6;
      float ring = smoothstep(0.28, 0.0, abs(vY - uRing));
      vec3 c = uColor * (0.05 + rim * 0.9 + bands * 0.7 + ring * 0.7) + vec3(0.45) * (bands * 0.3 + ring * 0.5) * rim;
      gl_FragColor = vec4(c * uAlpha * (gl_FrontFacing ? 1.0 : 0.35), 1.0);
    }`, THREE.DoubleSide);
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 6; m.visible = false; m.frustumCulled = false;
  return m;
}

/** Ossuary Wall: bone spikes (instanced cones, glowing marrow-green at the root, bone-white tips). Base at y = 0. */
function spikeMesh(n) {
  const g = new THREE.ConeGeometry(0.24, 1, 5, 3).translate(0, 0.5, 0);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = Math.min(1, pos.getY(i) / 0.5), u = k * k * (3 - 2 * k);
    col[i * 3] = 0.45 + 0.85 * u; col[i * 3 + 1] = 2.1 - 0.85 * u; col[i * 3 + 2] = 0.9 + 0.2 * u;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ vertexColors: true }), n);
  mesh.count = 0; mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

export class Rites {
  constructor(run) {
    this.run = run;
    this.hero = run.loadout.heroId;
    this.def = RITES[this.hero] || null;
    this.cd = 0; // ready from the first second of every run
    this.hinted = false;
    this.castId = 0;
    this.t = 0; // Rite clock (run time), drives the shaders
    this.o = { kx: 0, kz: 0, knock: 0, crit: false, source: 'rite', silent: false }; // shared damage options
    this.color = new THREE.Color(run.heroColor);
    this.hc = hdr(run.heroColor, 3); this.soft = hdr(run.heroColor, 1.2);
    this.lightT = 0; this.sfxT = 0; this.shown = 0;
    this.graveT = 0; this.pullT = 0; this.beatT = 0;                              // Vael
    this.dashLeft = 0; this.trail = 1; this.hasteT = 0; this.hasteS = null; this.hasteBase = 0; this.ghostT = 0; // Nyx
    this.strikeN = 0; this.strikeT = 0;                                            // Seraphine
    this.bellT = -1; this.waves = 0;                                               // Liora
    this.wallT = 0; this.wallAge = -1;                                             // Mordrake
    this.runeT = -1; this.runeLife = 1; this.runeR = 1; this.runeFollow = false;
    // pre-bound query callbacks: the per-frame loops create no closures
    this._cut = (e) => this.cutHit(e);
    this._wall = (e) => this.wallHit(e);
    this._knell = (e) => this.knellHit(e);
    this._silence = (e) => { if (e.type === 'witch' && e.stunT <= 0) { this.run.enemies.stun(e, this.def.stun); this.run.particles.burst(e.x, 2.2, e.z, 4, this.hc, IMPACT); } };
    this._seen = (e) => { if (e.riteId === this.castId) return; if (this.onScreen(e)) { this.cand.push(e); } };
    this._struck = (e) => e.riteId === this.castId;
    if (this.def) this.build();
  }

  /** Only the hero's own Rite builds meshes. */
  build() {
    const sc = this.run.scene, id = this.hero;
    this.rune = makeRuneCircle(1);
    this.rune.visible = false;
    this.rune.material.uniforms.uColor.value.copy(this.color);
    sc.add(this.rune);
    if (id === 'vael') {
      const P = pillarMesh(this.color.clone().multiplyScalar(1.3));
      this.pillarMesh = P.mesh; this.pillarAttr = P.attr; sc.add(P.mesh);
      this.pillars = Array.from({ length: MAX_PILLARS }, () => ({ x: 0, z: 0, t: 0, seed: 0 }));
      this.pN = 0;
    } else if (id === 'nyx') {
      this.ghosts = [];
      for (let i = 0; i < GHOSTS; i++) { // afterimages share the Shepherd's geometry
        const m = new THREE.Mesh(this.run.player.mesh.geometry, new THREE.MeshBasicMaterial({ color: this.color.clone().multiplyScalar(1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        m.visible = false; m.scale.setScalar(1.25); m.renderOrder = 6;
        sc.add(m); this.ghosts.push({ m, t: 9 });
      }
      this.ghostI = 0;
      this.arc = makeArc();
      const u = this.arc.material.uniforms; u.uColor.value.copy(this.color).multiplyScalar(1.3); u.uLen.value = 1.7; u.uInner.value = 0.5;
      sc.add(this.arc);
      this.arcT = -1;
    } else if (id === 'seraphine') {
      this.cand = []; this.score = new Float32Array(400);
      this.strikes = Array.from({ length: MAX_STRIKES }, () => ({ e: null, uid: 0, x: 0, z: 0, at: 0, t: -1, fired: false, pts: new Float32Array(STRAND * 3) }));
    } else if (id === 'liora') {
      this.bell = bellMesh(this.color.clone().lerp(new THREE.Color(0xffffff), 0.25));
      sc.add(this.bell);
    } else if (id === 'mordrake') {
      const n = this.def.spikes;
      this.spikes = spikeMesh(n); sc.add(this.spikes);
      this.sp = { a: new Float32Array(n), r: new Float32Array(n), h: new Float32Array(n), w: new Float32Array(n), lean: new Float32Array(n), delay: new Float32Array(n) };
    }
  }

  get ready() { return !!this.def && this.cd <= 0; }
  /** Grave Call is up: every kill rises (run.onEnemyKilled reads it). */
  get graveCall() { return this.graveT > 0; }
  /** A lasting effect is running (the HUD button glows). */
  get active() { return this.graveT > 0 || this.dashLeft > 0 || this.wallT > 0 || this.bellT >= 0 && this.bellT < 0.6 || this.strikeN > 0; }

  /** Rite damage: base × the run's damage multiplier × chapter scaling (as Soul Nova); rolls crits like a weapon. */
  dmg(base, crit = true) {
    const run = this.run, S = run.stats;
    this.o.crit = crit && Math.random() < S.crit;
    return base * S.dmgMul * (1 + RITES.ch * (run.chapter.id - 1)) * (this.o.crit ? 2 : 1);
  }

  opts(kx, kz, knock, silent) { const o = this.o; o.kx = kx; o.kz = kz; o.knock = knock; o.silent = silent; return o; }

  // ---------------------------------------------------------------- input and casting
  /** The RITE button (ui.wantsRite), Shift or E. */
  poll() {
    const run = this.run, ui = run.ui, k = run.input.keys;
    let want = false;
    if (ui && ui.wantsRite) { ui.wantsRite = false; want = true; }
    for (let i = 0; i < KEYS.length; i++) if (k.has(KEYS[i])) { k.delete(KEYS[i]); want = true; }
    if (want) this.trigger();
  }

  trigger() {
    const run = this.run, D = this.def, P = run.player;
    if (!D || this.cd > 0 || run.ended || run.paused || run.levelPending || P.dead) return false;
    this.cd = D.cd;
    this.castId++;
    run.counters.rites++;
    this[this.hero](D, P);
    run.audio.sfx('rite_' + this.hero);
    run.audio.voice(this.hero + '_rite');
    run.app.haptic(this.hero === 'nyx' ? 'medium' : 'heavy');
    if (run.ui && run.ui.rite) run.ui.rite.cast();
    return true;
  }

  onReady() {
    const run = this.run;
    run.audio.sfx('rite_ready');
    run.app.haptic('light');
    if (run.ui && run.ui.rite) run.ui.rite.flash();
  }

  showRune(x, z, r, life, follow) {
    this.runeT = 0; this.runeLife = life; this.runeR = r; this.runeFollow = follow;
    this.rune.position.set(x, 0.08, z);
  }

  // ---------------------------------------------------------------- Vael: Grave Call
  vael(D, P) {
    const run = this.run;
    this.graveT = D.dur; this.pullT = 0; this.beatT = 0.5;
    run.pickups.magnetNear(P.x, P.z, D.pull);
    run.fx.shockwave(P.x, P.z, D.pull, run.heroColor, 0.6, 0.05);
    run.fx.light(P.x, P.z, 8, 0.9, this.color, 0.8);
    run.fx.flash(0.15); run.fx.shake(0.25); run.fx.slowMo(0.55, 0.25);
    run.particles.ring(P.x, P.z, D.pull * 0.6, 70, this.hc, { life: 0.55, size: 0.7 });
    run.particles.burst(P.x, 1.2, P.z, 18, WHITE, { speed: 7, life: 0.4, size: 0.35, up: 2 });
    this.showRune(P.x, P.z, D.pull, D.dur + 0.4, true);
  }

  /** A slain foe rises during Grave Call: a soul pillar at its grave. */
  pillar(x, z) {
    const run = this.run;
    if (this.pillars) {
      const p = this.pillars[this.pN < MAX_PILLARS ? this.pN++ : (this.pRep = ((this.pRep || 0) + 1) % MAX_PILLARS)]; // full: recycle
      p.x = x; p.z = z; p.t = 0; p.seed = Math.random();
    }
    run.particles.burst(x, 0.3, z, 7, this.hc, SPARK);
    if (this.lightT <= 0) { this.lightT = 0.2; run.fx.light(x, z, 3, 0.7, this.color, 0.4); }
  }

  updateVael(dt, D) {
    const run = this.run, P = run.player;
    if (this.graveT > 0) {
      this.graveT -= dt; this.pullT -= dt; this.beatT -= dt;
      if (this.pullT <= 0) { this.pullT = 0.12; run.pickups.magnetNear(P.x, P.z, D.pull); }
      if (this.beatT <= 0 && this.graveT > 0.3) { this.beatT = 1; run.fx.shockwave(P.x, P.z, D.pull, run.heroColor, 0.6, 0.025); }
      // souls stream in from the rim of the call
      const c = this.soft, n = Math.round(dt * 45 * run.particles.budget + Math.random());
      for (let i = 0; i < n; i++) { // they fade out before they reach him, so the Shepherd stays readable
        const a = Math.random() * TAU, ca = Math.cos(a), sa = Math.sin(a), r = D.pull * (0.9 + Math.random() * 0.15), life = 0.5, v = r * 0.65 / life;
        run.particles.emit(P.x + ca * r, 0.3 + Math.random() * 0.6, P.z + sa * r, -ca * v, 0.5, -sa * v, life, 0.5, 0.1, c[0], c[1], c[2], 0.9, 0, 0);
      }
    }
    for (let i = this.pN - 1; i >= 0; i--) {
      const p = this.pillars[i];
      p.t += dt;
      if (p.t >= 0.8) { this.pillars[i] = this.pillars[this.pN - 1]; this.pillars[this.pN - 1] = p; this.pN--; }
    }
  }

  // ---------------------------------------------------------------- Nyx: Shadow Step
  nyx(D, P) {
    const run = this.run, I = run.input;
    let dx = I.x, dz = I.z, l = Math.hypot(dx, dz);
    if (l < 0.2) { dx = Math.cos(P.facing); dz = Math.sin(P.facing); l = 1; }
    this.dashX = dx / l; this.dashZ = dz / l;
    this.dashLeft = D.dist; this.dashSX = this.dashEX = P.x; this.dashSZ = this.dashEZ = P.z; this.trail = 0; this.ghostT = 0;
    P.invuln = Math.max(P.invuln, D.invuln);
    P.rootT = 0; P.kx = P.kz = 0; // the step slips abyssal hands and slam shoves
    this.hasteT = D.hasteT;
    run.particles.burst(P.x, 0.9, P.z, 26, this.hc, DUST);
    run.particles.burst(P.x, 0.9, P.z, 10, WHITE, { speed: 3, life: 0.25, size: 0.6 });
    run.fx.shockwave(P.x, P.z, 2.2, run.heroColor, 0.3, 0.16);
    run.fx.aberration(0.35);
  }

  updateNyx(dt, D) {
    const run = this.run, P = run.player;
    if (this.dashLeft > 0) {
      const step = Math.min(this.dashLeft, (D.dist / D.time) * dt), x0 = P.x, z0 = P.z;
      P.x += this.dashX * step; P.z += this.dashZ * step;
      this.dashLeft -= step; this.dashEX = P.x; this.dashEZ = P.z;
      P.facing = Math.atan2(this.dashZ, this.dashX);
      // cut every foe within `width` of this frame's slice of the path
      this._x0 = x0; this._z0 = z0; this._len = step; this._shown = 0;
      run.enemies.query((x0 + P.x) / 2, (z0 + P.z) / 2, step / 2 + D.width, this._cut);
      // afterimages and shadow smoke along the way
      this.ghostT -= dt;
      if (this.ghostT <= 0) {
        this.ghostT = D.time / GHOSTS;
        const g = this.ghosts[this.ghostI++ % GHOSTS];
        g.t = 0; g.m.visible = true; g.m.position.set(P.x, 0.05, P.z); g.m.rotation.set(0, Math.PI / 2 - P.facing, 0);
      }
      const c = this.hc;
      for (let i = 0; i < 4; i++) run.particles.emit(P.x + (Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 1.2, P.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 2, 0.8, (Math.random() - 0.5) * 2, 0.5, 0.7, 0.1, c[0] * 0.5, c[1] * 0.4, c[2] * 0.6, 0.9, 2, 0);
      if (this.dashLeft <= 0) this.arrive(D);
    } else if (this.trail < 1) this.trail = Math.min(1, this.trail + dt / 0.45);
    for (let i = 0; i < GHOSTS; i++) { const g = this.ghosts[i]; if (g.t < 9) { g.t += dt; if (g.t > 0.4) { g.t = 9; g.m.visible = false; } } }
    if (this.arcT >= 0) {
      this.arcT += dt;
      const k = Math.min(1, this.arcT / 0.22), u = this.arc.material.uniforms;
      u.uHead.value = -(this.arcA + 1.4 - 2.8 * (1 - (1 - k) * (1 - k)));
      u.uA.value = k < 0.7 ? 1 : (1 - k) / 0.3;
      if (k >= 1) { this.arcT = -1; this.arc.visible = false; }
    }
    // the legion surges after her (a level-up rebuilds run.stats, so the buff is re-applied to the new object)
    const S = run.stats;
    if (this.hasteT > 0 || this.hasteS) {
      this.hasteT -= dt;
      if (S !== this.hasteS) { this.hasteS = S; this.hasteBase = S.minionSpeed; }
      if (this.hasteT > 0) S.minionSpeed = this.hasteBase * (1 + D.haste);
      else { S.minionSpeed = this.hasteBase; this.hasteS = null; }
    }
  }

  cutHit(e) {
    if (e.riteId === this.castId) return;
    const ux = this.dashX, uz = this.dashZ, ex = e.x - this._x0, ez = e.z - this._z0;
    const along = Math.max(0, Math.min(this._len, ex * ux + ez * uz)), side = ex * uz - ez * ux; // signed distance to the path (right-hand normal)
    const px = ex - ux * along, pz = ez - uz * along;
    if (px * px + pz * pz > (this.def.width + e.radius) ** 2) return;
    e.riteId = this.castId;
    const s = side >= 0 ? 1 : -1, run = this.run;
    run.enemies.damage(e, this.dmg(this.def.dmg), this.opts(uz * s + ux * 0.35, -ux * s + uz * 0.35, this.def.knock, this._shown++ >= 6));
    run.particles.burst(e.x, 1, e.z, 6, this.hc, IMPACT);
    if (this.sfxT <= 0) { this.sfxT = 0.05; run.audio.sfx('hit', { volume: 0.5, pitch: 0.7 }); }
  }

  arrive(D) {
    const run = this.run, P = run.player;
    this.arcA = Math.atan2(this.dashZ, this.dashX); this.arcT = 0;
    this.arc.visible = true; this.arc.position.set(P.x, 0.14, P.z); this.arc.scale.setScalar(3.1);
    run.fx.shockwave(P.x, P.z, 3, run.heroColor, 0.35, 0.12);
    run.particles.ring(P.x, P.z, 2.6, 30, this.hc, { life: 0.35, size: 0.55 });
    run.fx.light(P.x, P.z, 5, 1.6, this.color, 0.35);
    run.fx.shake(0.15);
  }

  // ---------------------------------------------------------------- Seraphine: Ashfall
  /** On the phone screen (a small margin), so the chains only fall where the player can see them. */
  onScreen(e) {
    const p = this.run.engine.project(_v.set(e.x, 0.6, e.z), this.run.camera, _sp), E = this.run.engine;
    return !!p && p.x > 8 && p.x < E.w - 8 && p.y > 8 && p.y < E.h - 8;
  }

  seraphine(D, P) {
    const run = this.run, E = run.enemies, C = this.cand, sc = this.score;
    C.length = 0;
    run.camera.updateMatrixWorld(); // the camera may not have rendered since it last moved (headless QA steps)
    E.query(P.x, P.z, D.range, this._seen);
    // the boss and elites first, then Cinder Witches (the horde's casters), then the nearest; a short selection keeps the
    // order (no sort, no allocation)
    const m = Math.min(C.length, sc.length);
    for (let i = 0; i < m; i++) { const e = C[i]; sc[i] = (e.x - P.x) ** 2 + (e.z - P.z) ** 2 - (e.type === 'boss' ? 3e6 : e.elite ? 2e6 : e.type === 'witch' ? 1e6 : 0); }
    const n = Math.min(D.n, m, MAX_STRIKES);
    for (let k = 0; k < n; k++) {
      let b = k;
      for (let i = k + 1; i < m; i++) if (sc[i] < sc[b]) b = i;
      const te = C[k]; C[k] = C[b]; C[b] = te; const ts = sc[k]; sc[k] = sc[b]; sc[b] = ts;
      const S = this.strikes[k], e = C[k];
      S.e = e; S.uid = e.uid; S.x = e.x; S.z = e.z; S.at = n > 1 ? (k / (n - 1)) * D.span : 0; S.t = -1; S.fired = false;
      e.riteId = this.castId;
    }
    C.length = 0;
    this.strikeN = n; this.strikeT = 0; this.shown = 0;
    if (!run.novaQueue.length) { run.nova = Math.min(1, run.nova + D.nova); run.addNovaCharge(0); } // +15% Nova (and the first-run hint)
    run.fx.flash(0.18); run.fx.shake(0.3);
    run.fx.light(P.x, P.z, 10, 2, this.color, 0.8);
    run.fx.shockwave(P.x, P.z, 4, 0xffb347, 0.4, 0.12);
    run.particles.burst(P.x, 2.4, P.z, 16, FLAME, { speed: 6, life: 0.5, size: 0.45, up: 2.5 });
    // the ash begins to fall across the whole field
    const k = Math.round(90 * run.particles.budget);
    for (let i = 0; i < k; i++) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * D.range * 0.8;
      run.particles.emit(P.x + Math.cos(a) * r, 5 + Math.random() * 4, P.z + Math.sin(a) * r, (Math.random() - 0.5) * 0.8, -1.5, (Math.random() - 0.5) * 0.8, 1.8 + Math.random() * 0.6, 0.32, 0.1, ASH[0], ASH[1], ASH[2], 0.8, 0.5, 2);
    }
  }

  updateSeraphine(dt, D) {
    if (!this.strikeN) return;
    const run = this.run, E = run.enemies;
    this.strikeT += dt;
    let live = 0;
    for (let k = 0; k < this.strikeN; k++) {
      const S = this.strikes[k];
      if (!S.fired) {
        if (S.e && S.e.active && S.e.uid === S.uid) { S.x = S.e.x; S.z = S.e.z; }
        if (this.strikeT >= S.at) this.strike(S, D, E);
        live++;
      } else if (S.t < 0.32) { S.t += dt; live++; }
    }
    if (!live) this.strikeN = 0;
  }

  strike(S, D, E) {
    const run = this.run;
    S.fired = true; S.t = 0;
    let e = S.e && S.e.active && S.e.uid === S.uid ? S.e : null;
    if (!e) { e = E.nearest(S.x, S.z, 3, this._struck); if (e) { e.riteId = this.castId; S.x = e.x; S.z = e.z; } } // its mark died: the chain finds the nearest unstruck foe
    S.e = null;
    // a jagged chain falling from the sky onto the mark
    const top = 8.5, ox = (Math.random() - 0.5) * 2.4, oz = -1 - Math.random() * 1.5, pts = S.pts;
    for (let i = 0; i < STRAND; i++) {
      const u = i / (STRAND - 1), j = i && i < STRAND - 1 ? 0.35 : 0;
      pts[i * 3] = S.x + ox * (1 - u) + (Math.random() - 0.5) * j; pts[i * 3 + 1] = top + (0.9 - top) * u; pts[i * 3 + 2] = S.z + oz * (1 - u) + (Math.random() - 0.5) * j;
    }
    run.particles.burst(S.x, 0.8, S.z, 9, FLAME, IMPACT);
    run.particles.ring(S.x, S.z, 1.3, 14, EMBER, IMPACT_RING);
    const k = this.shown++;
    if (k % 3 === 0) run.fx.light(S.x, S.z, 4, 1.4, this.color, 0.3);
    if (k % 4 === 0) run.fx.shockwave(S.x, S.z, 1.6, 0xff8a3d, 0.3, 0.18);
    if (!e) return;
    const dmg = this.dmg(D.dmg);
    const killed = E.damage(e, dmg, this.opts(e.x - run.player.x, e.z - run.player.z, 2, k >= 8));
    if (!killed && e.active) {
      run.weapons.ignite(e, dmg * D.burn / BURN_SHARE, D.burnRaise); // a Perdition burn already on it keeps its bigger bonus
      if (D.pin) E.stun(e, D.pin); // the chain pins it where it stands
    }
  }

  // ---------------------------------------------------------------- Liora: Death Knell
  liora(D, P) {
    const run = this.run;
    run.projectiles.clearEnemyShots(true); // the boss keeps its rules: its ring, spiral and fan orbs fly on, as through the wall
    this._kx = P.x; this._kz = P.z; this._kd = this.dmg(D.dmg, false); this._shown = 0;
    run.enemies.query(P.x, P.z, D.r, this._knell);
    run.enemies.query(P.x, P.z, D.silence, this._silence); // the toll carries: Witches farther out lose their fire too
    this.bellT = 0; this.bellX = P.x; this.bellZ = P.z; this.waves = 1; this.waveT = 0;
    this.bell.visible = true;
    run.fx.shockwave(P.x, P.z, D.r, run.heroColor, 0.45, 0.06);
    run.fx.light(P.x, P.z, D.r + 2, 0.6, this.color, 0.8);
    run.fx.flash(0.2); run.fx.aberration(0.5); run.fx.shake(0.4); run.fx.hitStop(0.06);
    run.particles.ring(P.x, P.z, D.r, 60, this.soft, { life: 0.5, size: 0.6 });
    this.showRune(P.x, P.z, D.r, 1.3, false);
  }

  knellHit(e) {
    const run = this.run, D = this.def;
    if (e.type !== 'boss') { // her toll: ×2 Raise Chance whoever lands the kill (run.onEnemyKilled)
      e.tollT = Math.max(e.tollUid === e.uid ? e.tollT : 0, run.time + D.mark); e.tollUid = e.uid;
    }
    run.enemies.stun(e, D.stun);
    run.enemies.damage(e, this._kd, this.opts(e.x - this._kx, e.z - this._kz, 0, this._shown++ >= 8));
    if (e.active) run.particles.burst(e.x, 1.2, e.z, 3, this.hc, IMPACT);
  }

  updateLiora(dt, D) {
    if (this.bellT < 0) return;
    this.bellT += dt;
    if (this.waves < 3) { // the toll rings out three times
      this.waveT += dt;
      if (this.waveT >= 0.16) { this.waveT = 0; this.waves++; this.run.fx.shockwave(this.bellX, this.bellZ, D.r * (1 + this.waves * 0.12), this.run.heroColor, 0.5, 0.05); }
    }
    if (this.bellT > 1.6) { this.bellT = -1; this.bell.visible = false; }
  }

  // ---------------------------------------------------------------- Mordrake: Ossuary Wall
  mordrake(D, P) {
    const run = this.run, n = D.spikes, S = this.sp, f = P.facing;
    this.wallT = D.dur; this.wallAge = 0; this.wallX = P.x; this.wallZ = P.z;
    for (let i = 0; i < n; i++) { // two staggered rows; the eruption runs round from where he faces
      const a = (i / n) * TAU + (Math.random() - 0.5) * 0.08, outer = i & 1;
      S.a[i] = a; S.r[i] = D.r + (outer ? 0.32 : -0.08) + (Math.random() - 0.5) * 0.15;
      S.h[i] = (outer ? 1.25 : 1.75) * (0.8 + Math.random() * 0.4); S.w[i] = (outer ? 0.85 : 1.1) * (0.85 + Math.random() * 0.3);
      S.lean[i] = 0.18 + Math.random() * 0.22 + outer * 0.12;
      S.delay[i] = Math.abs(Math.atan2(Math.sin(a - f), Math.cos(a - f))) / Math.PI * 0.2;
    }
    this.spikes.count = n;
    this._wd = this.dmg(D.dmg, false);
    run.fx.shockwave(P.x, P.z, D.r + 0.6, 0x6dff9a, 0.4, 0.1);
    run.fx.shockwave(P.x, P.z, D.r * 0.6, 0xfff0d2, 0.3, 0.14);
    run.fx.light(P.x, P.z, D.r + 4, 2.2, this.color, 0.8);
    run.fx.shake(0.5); run.fx.hitStop(0.05);
    run.particles.ring(P.x, P.z, D.r, 60, BONE_HDR, { life: 0.35, size: 0.5, speed: 1.5 });
    this.showRune(P.x, P.z, D.r + 0.3, D.dur + 0.35, true);
  }

  updateMordrake(dt, D) {
    if (this.wallAge < 0) return;
    this.wallAge += dt;
    const run = this.run, P = run.player, R = D.r;
    const cx = this.wallX = P.x, cz = this.wallZ = P.z; // the ring marches with him
    if (this.wallT <= 0) { if (this.wallAge > D.dur + 0.4) { this.wallAge = -1; this.spikes.count = 0; } return; }
    this.wallT -= dt;
    // the wall: nothing stays inside; every crossing is cut (once per hitCd per foe); the boss is only shoved
    this._dt = dt; this._shown = 0;
    run.enemies.query(cx, cz, R + 1, this._wall);
    const r2 = R * R;
    // Witch fire falling inside the ring shatters on the bone just before it lands (the horde's fire only: the boss's
    // orbs keep his rules)
    const lobs = run.projectiles.lobs;
    if (lobs) for (let i = lobs.length - 1; i >= 0; i--) {
      const F = lobs[i];
      if (F.flight - F.t > 0.12 || (F.tx - cx) ** 2 + (F.tz - cz) ** 2 > r2) continue;
      lobs[i] = lobs[lobs.length - 1]; lobs.pop(); run.projectiles.lobPool.push(F);
      run.particles.burst(F.x, F.y, F.z, 8, BONE_HDR, BONE);
      run.particles.burst(F.x, F.y, F.z, 6, EMBER, IMPACT);
      if (this.sfxT <= 0) { this.sfxT = 0.12; run.audio.sfx('hit', { volume: 0.5, pitch: 0.45 }); }
    }
    // the legion inside mends: heal × max HP over the wall's life
    const L = run.legion.list, k = (D.heal / D.dur) * dt;
    for (let i = 0; i < L.length; i++) {
      const m = L[i];
      if (!(m.hp > 0) || m.hp >= m.maxHp || (m.x - cx) ** 2 + (m.z - cz) ** 2 > r2) continue;
      m.hp = Math.min(m.maxHp, m.hp + m.maxHp * k);
      if (Math.random() < dt * 2) run.particles.burst(m.x, m.y, m.z, 2, MARROW, HEAL);
    }
  }

  wallHit(e) {
    if (e.ev) return; // a Soul Thief or Cursed Coffin keeps its own script
    const D = this.def, run = this.run, cx = this.wallX, cz = this.wallZ;
    let dx = e.x - cx, dz = e.z - cz, d = Math.sqrt(dx * dx + dz * dz);
    const boss = e.type === 'boss', lim = D.r + (boss ? 0 : e.radius);
    if (d >= lim) return;
    if (d < 0.01) { dx = Math.cos(e.phase); dz = Math.sin(e.phase); d = 1; }
    const nx = dx / d, nz = dz / d;
    if (boss) { e.x += nx * D.bossPush * this._dt; e.z += nz * D.bossPush * this._dt; } // a mountain: the wall only leans on him
    else { e.x = cx + nx * (lim + 0.02); e.z = cz + nz * (lim + 0.02); }
    if (run.time < e.riteT) return;
    e.riteT = run.time + D.hitCd;
    run.enemies.damage(e, this._wd, this.opts(nx, nz, D.knock, this._shown++ >= 3));
    const px = cx + nx * D.r, pz = cz + nz * D.r;
    run.particles.burst(px, 0.8, pz, 6, BONE_HDR, BONE);
    run.particles.burst(px, 0.5, pz, 3, MARROW, IMPACT);
    if (this.sfxT <= 0) { this.sfxT = 0.12; run.audio.sfx('hit', { volume: 0.45, pitch: 0.55 }); }
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    const D = this.def;
    if (!D) return;
    const run = this.run;
    this.t += dt; this.lightT -= dt; this.sfxT -= dt;
    if (this.cd > 0) { this.cd -= dt; if (this.cd <= 0) { this.cd = 0; this.onReady(); } }
    // introduce the Rite once the opening hints have had their moment: in the first-ever run, and once for players who
    // started before Rites existed (run.hint is a no-op after the first time)
    if (!this.hinted && this.cd <= 0 && run.time >= RITES.hintAt && !(run.ui && run.ui.hintEl && run.ui.hintEl.isConnected)) {
      this.hinted = true;
      run.hint('rite', `Your Rite is ready! Tap <b>${D.short}</b> to unleash ${D.name}.`);
    }
    if (this.runeT >= 0) { this.runeT += dt; if (this.runeT > this.runeLife) { this.runeT = -1; this.rune.visible = false; } }
    if (this.hero === 'vael') this.updateVael(dt, D);
    else if (this.hero === 'nyx') this.updateNyx(dt, D);
    else if (this.hero === 'seraphine') this.updateSeraphine(dt, D);
    else if (this.hero === 'liora') this.updateLiora(dt, D);
    else if (this.hero === 'mordrake') this.updateMordrake(dt, D);
  }

  /** Glow sprites and mesh transforms (inside Run.render's glow pass). */
  render() {
    if (!this.def) return;
    const run = this.run, g = run.glow, c = this.hc, P = run.player, t = this.t;
    if (this.runeT >= 0) {
      const R = this.rune, k = this.runeT / this.runeLife;
      R.visible = true;
      if (this.runeFollow) R.position.set(P.x, 0.08, P.z);
      R.scale.setScalar(this.runeR * (1.08 - 0.08 * Math.min(1, this.runeT * 5)));
      R.rotation.y = -t * 0.6;
      R.material.uniforms.uAlpha.value = Math.min(1, this.runeT * 6) * (k > 0.8 ? (1 - k) / 0.2 : 1) * (this.runeR > 6 ? 0.55 : 0.85);
      R.material.uniforms.uTime.value = t;
    }
    if (this.hero === 'vael') this.renderVael(g, c, t);
    else if (this.hero === 'nyx') this.renderNyx(g, c, P);
    else if (this.hero === 'seraphine') this.renderSeraphine(g);
    else if (this.hero === 'liora') this.renderLiora(g, c);
    else if (this.hero === 'mordrake') this.renderMordrake(g, t);
  }

  renderVael(g, c, t) {
    const n = this.pN, A = this.pillarAttr.array;
    for (let i = 0; i < n; i++) {
      const p = this.pillars[i], k = p.t / 0.8, grow = Math.min(1, p.t / 0.12), w = 0.45 * (1 - k * 0.6);
      _p.set(p.x, 0, p.z); _q.identity(); _s.set(w, 6.5 * (0.35 + 0.65 * grow), w);
      _m.compose(_p, _q, _s);
      this.pillarMesh.setMatrixAt(i, _m);
      A[i * 2] = (1 - k) * (1 - k) * (0.6 + 0.4 * grow); A[i * 2 + 1] = p.seed;
      g.add(p.x, 0.3, p.z, 2 * (1 - k), c[0] * 0.3, c[1] * 0.3, c[2] * 0.3, 1 - k);
    }
    this.pillarMesh.count = n;
    if (n) { this.pillarMesh.instanceMatrix.needsUpdate = true; this.pillarAttr.needsUpdate = true; }
    this.pillarMesh.material.uniforms.uTime.value = t;
    if (this.graveT > 0) { const P = this.run.player, f = 0.7 + 0.3 * Math.sin(t * 9); g.add(P.x, 1.4, P.z, 3 * f, c[0] * 0.18, c[1] * 0.18, c[2] * 0.18, 0.9); }
  }

  renderNyx(g, c, P) {
    // the cut: a hot core line and a wide shadow along the path, fading once she lands
    const a = this.dashLeft > 0 ? 1 : 1 - this.trail;
    if (a > 0.01) {
      const dx = this.dashEX - this.dashSX, dz = this.dashEZ - this.dashSZ, L = Math.hypot(dx, dz), n = Math.min(40, Math.ceil(L / 0.3));
      for (let i = 0; i <= n; i++) {
        const u = n ? i / n : 1, x = this.dashSX + dx * u, z = this.dashSZ + dz * u, f = a * (0.35 + 0.65 * u);
        g.add(x, 0.9, z, 1.6 * f, c[0] * 0.3, c[1] * 0.25, c[2] * 0.4, f);
        g.add(x, 0.95, z, 0.45 * f, 2.4, 2.2, 3.0, f);
      }
    }
    for (let i = 0; i < GHOSTS; i++) { const G = this.ghosts[i]; if (G.t < 9) G.m.material.opacity = 0.5 * (1 - G.t / 0.4); }
    if (this.hasteT > 0) { // the legion surges: speed streaks behind the nearest minions
      const L = this.run.legion.list, n = Math.min(48, L.length);
      for (let i = 0; i < n; i++) { const m = L[i]; g.add(m.x - m.vx * 0.06, m.y, m.z - m.vz * 0.06, 0.9, c[0] * 0.35, c[1] * 0.35, c[2] * 0.35, 0.7); }
    }
  }

  renderSeraphine(g) {
    const f = FLAME, e = EMBER;
    for (let k = 0; k < this.strikeN; k++) {
      const S = this.strikes[k];
      if (!S.fired) { // the mark: a pulsing ember sigil on the foe about to be struck
        const p = 0.6 + 0.4 * Math.sin(this.t * 30 + k);
        g.add(S.x, 0.25, S.z, 1.6 * p, e[0] * 0.35, e[1] * 0.35, e[2] * 0.35, 0.9);
        continue;
      }
      if (S.t >= 0.32) continue;
      const a = 1 - S.t / 0.32, pts = S.pts;
      for (let i = 0; i < STRAND - 1; i++) {
        const x0 = pts[i * 3], y0 = pts[i * 3 + 1], z0 = pts[i * 3 + 2], x1 = pts[i * 3 + 3], y1 = pts[i * 3 + 4], z1 = pts[i * 3 + 5];
        for (let s = 0; s < 4; s++) {
          const u = s / 4, big = (i * 4 + s) & 1;
          g.add(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, z0 + (z1 - z0) * u, (big ? 0.55 : 0.32) * (0.5 + a * 0.5), f[0] * 0.55, f[1] * 0.55, f[2] * 0.55, a);
        }
      }
      g.add(S.x, 0.6, S.z, 2 * a, f[0] * 0.3, f[1] * 0.3, f[2] * 0.3, a);
      g.add(S.x, 0.7, S.z, 0.7 * a, 2.2, 1.6, 0.9, a);
    }
  }

  renderLiora(g, c) {
    if (this.bellT < 0) return;
    const b = this.bell, T = this.bellT, u = b.material.uniforms;
    const drop = Math.min(1, T / 0.12), sw = Math.exp(-T * 2.6);
    b.position.set(this.bellX, 3.1 + (1 - drop) * 2.5 + T * 0.4, this.bellZ - 0.6);
    b.scale.setScalar(2 * (0.7 + 0.3 * drop) * (1 + 0.05 * Math.sin(T * 40) * sw));
    b.rotation.set(-0.75 + 0.22 * Math.sin(T * 9) * sw, 0, 0.3 * Math.sin(T * 9 + 1.2) * sw); // tipped back so the camera sees its profile
    u.uAlpha.value = Math.min(1, T * 10) * (T > 1 ? Math.max(0, 1 - (T - 1) / 0.6) : 1);
    u.uRing.value = 1.9 - ((T * 3) % 1.2) * 1.6;
    const a = u.uAlpha.value;
    g.add(this.bellX, 2.7 + T * 0.4, this.bellZ, 5 * a, c[0] * 0.12, c[1] * 0.12, c[2] * 0.12, a);
  }

  renderMordrake(g, t) {
    if (this.wallAge < 0) return;
    const D = this.def, S = this.sp, n = this.spikes.count, A = this.wallAge, cx = this.wallX, cz = this.wallZ, mw = MARROW;
    const out = this.wallT <= 0 ? Math.max(0, 1 - (A - D.dur) / 0.35) : 1; // they sink back at the end
    for (let i = 0; i < n; i++) {
      const k = Math.max(0, Math.min(1, (A - S.delay[i]) / 0.2)), up = k < 1 ? 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2 : 1; // ease out back
      const a = S.a[i], ca = Math.cos(a), sa = Math.sin(a), h = S.h[i] * up * out + 0.001, tremble = Math.sin(t * 31 + i) * 0.02;
      _p.set(cx + ca * S.r[i], -0.15 * (1 - out), cz + sa * S.r[i]);
      _q.setFromAxisAngle(_ax.set(sa, 0, -ca), S.lean[i] + tremble);
      _s.set(S.w[i], h, S.w[i]);
      _m.compose(_p, _q, _s);
      this.spikes.setMatrixAt(i, _m);
      if (i % 3 === 0 && k > 0) g.add(_p.x, 0.25, _p.z, 1.5 * out, mw[0] * 0.25, mw[1] * 0.25, mw[2] * 0.25, 0.8 * out);
    }
    this.spikes.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    const sc = this.run.scene;
    for (const m of [this.rune, this.pillarMesh, this.arc, this.bell, this.spikes]) if (m) { sc.remove(m); m.geometry.dispose(); m.material.dispose(); }
    if (this.ghosts) for (const G of this.ghosts) { sc.remove(G.m); G.m.material.dispose(); } // the geometry is the Shepherd's
  }
}
