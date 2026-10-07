// Elite affixes (GDD §5.1): every elite the director raises rolls 1 affix (2 from Chapter 4 and in Endless).
//   Warded: a soul ward soaks hits until it shatters (stagger) · Splitter: bursts into smaller, faster copies
//   Vampiric: feeds on nearby deaths (red tether) · Hasted: fast, trails embers
//   Commander: a ground aura drives the horde harder; its death routs them
// Hooks: Run.director rolls them, Run.onEnemyKilled feeds every kill to onKill(), Enemies.damage asks absorb()
// while a ward holds, and Enemies.update honours the uid-keyed slow (stagger, rout). Affix state lives in e.aff,
// which Enemies.spawn clears, so a pooled enemy never inherits it (and raised Champions never carry it).
import * as THREE from 'three';
import { AFFIXES, AFFIX_IDS, ENEMIES } from './data.js';
import { hdr } from '../engine/particles.js';

const MAX = 16;                                                            // affixed elites tracked and drawn at once
const HEAD = { husk: 1.4, ghoul: 0.85, brute: 2.25, witch: 2.35, bloater: 1.5 }; // model height (as enemies.js)
const W = AFFIXES.warded, SP = AFFIXES.splitter, VA = AFFIXES.vampiric, CO = AFFIXES.commander;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
const _sp = { x: 0, y: 0 };

const instVert = /* glsl */`
attribute vec2 iA; // x: alpha · y: hit flash
varying vec2 vA; varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying float vY;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  vW = wp.xyz; vN = normalize(mat3(m) * normal); vA = iA; vUv = uv * 2.0 - 1.0; vY = position.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
// soul ward: a fresnel bubble with slow rising bands; a hit flashes it white
const bubbleFrag = /* glsl */`
uniform vec3 uColor; uniform float uTime;
varying vec2 vA; varying vec3 vN; varying vec3 vW; varying float vY;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float f = pow(1.0 - min(abs(dot(normalize(vN), V)), 1.0), 2.4);
  float bands = smoothstep(0.75, 1.0, sin(vY * 9.0 - uTime * 3.0)) * (0.25 + f);
  float a = (f * 0.75 + 0.025 + bands * 0.22) * vA.x;
  gl_FragColor = vec4(mix(uColor, vec3(1.3), vA.y * 0.5) * a * (1.0 + vA.y * 1.2), 1.0);
}`;
// commander aura: a dashed gold ring that turns slowly over a faint wash
const ringFrag = /* glsl */`
uniform vec3 uColor; uniform float uTime;
varying vec2 vA; varying vec2 vUv;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float a = atan(vUv.y, vUv.x);
  float rim = smoothstep(0.03, 0.0, abs(r - 0.965));
  float dash = step(0.45, fract(a * 3.8197 - uTime * 0.5)) * smoothstep(0.022, 0.0, abs(r - 0.9));
  float chev = step(0.7, fract(a * 1.9099 + uTime * 0.25)) * smoothstep(0.05, 0.0, abs(r - 0.82 - 0.04 * sin(uTime * 2.0)));
  float wash = smoothstep(1.0, 0.55, r) * smoothstep(0.2, 0.9, r) * 0.07;
  gl_FragColor = vec4(uColor * (rim * 0.95 + dash * 0.6 + chev * 0.35 + wash) * vA.x, 1.0);
}`;

function instanced(geo, frag, color) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
    vertexShader: instVert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const iA = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iA', iA);
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.count = 0; mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return { mesh, iA };
}

export class Affixes {
  constructor(run) {
    this.run = run;
    this.list = [];        // live affix states (e.aff), at most MAX
    this.boosted = [];     // enemies inside a Commander's aura: { e, uid }
    this.boostPool = [];
    this.splits = [];      // Splitter deaths waiting to burst next frame: { type, x, z, n }
    this.lastAt = -1e9;    // run time of the last elite roll (events keep clear of elites)
    this.t = 0; this.fxI = 0;
    const flat = new THREE.PlaneGeometry(2, 2); flat.rotateX(-Math.PI / 2);
    this.bubbles = instanced(new THREE.IcosahedronGeometry(1, 2), bubbleFrag, new THREE.Color(W.color));
    this.bubbles.mesh.renderOrder = 12;
    this.rings = instanced(flat, ringFrag, new THREE.Color(CO.color));
    this.rings.mesh.renderOrder = 2;
    run.scene.add(this.bubbles.mesh, this.rings.mesh);
    this.col = { ward: hdr(W.color, 3.2), split: hdr(0xff8a3d, 3.2), vamp: hdr(0xff2a44, 3.4), ember: hdr(0xff8a2e, 2.8), gold: hdr(0xffd04a, 2.6), rout: hdr(0xfff2c0, 2.4) };
    this.glow = { splitter: hdr(SP.color, 0.45), vampiric: hdr(VA.color, 0.5) }; // a throbbing aura (the others show their own fx)
    this.wardLight = new THREE.Color(W.color);
    // bound once: query callbacks run every frame
    this._cmd = null;
    this._boost = (o) => {
      if (o === this._cmd || o.type === 'boss' || o.ev || o.cmdUid === o.uid) return;
      o.cmdUid = o.uid; o.speed *= CO.speed; o.dmg *= CO.dmg;
      const b = this.boostPool.pop() || {};
      b.e = o; b.uid = o.uid;
      this.boosted.push(b);
    };
  }

  get count() { return this.list.length; }

  /** How many affixes an elite rolls in this run: 1, 2 from Chapter 4 and in Endless, plus a difficulty's extra. */
  countFor() {
    const run = this.run;
    return (run.endless || run.chapter.id >= AFFIXES.lateFrom ? AFFIXES.late : AFFIXES.count) + ((run.diff && run.diff.eliteAffixes) || 0);
  }

  /** Roll affixes onto a freshly spawned elite. Returns the ELITE banner's { title, sub }. opts.noChest: a mini-elite. */
  roll(e, n = this.countFor(), opts = {}) {
    this.lastAt = this.run.time;
    if (!e || !e.active) return { title: 'ELITE', sub: 'A gilded horror has risen. It carries a Relic Chest!' };
    const pool = (this.run.tutorial ? AFFIXES.tutorial : AFFIX_IDS).slice(), ids = [];
    while (ids.length < n && pool.length) ids.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    this.apply(e, ids, opts);
    const name = (ENEMIES[e.type] ? ENEMIES[e.type].name : e.type).toUpperCase();
    return { title: `${ids.map((id) => AFFIXES[id].name.toUpperCase()).join(' ')} ${name}`, sub: `${ids.map((id) => AFFIXES[id].desc).join(' · ')}${opts.noChest ? '' : ' · Relic Chest'}` };
  }

  /** Give an elite these affixes (ids from AFFIX_IDS). */
  apply(e, ids, opts = {}) {
    if (this.list.length >= MAX) this.prune();
    if (this.list.length >= MAX) ids = ids.filter((id) => id === 'hasted'); // nothing left to track: keep the stateless one
    if (!ids.length) return null;
    const A = e.aff = {
      e, uid: e.uid, ids, dead: false, noChest: !!opts.noChest,
      warded: ids.includes('warded'), splitter: ids.includes('splitter'), vampiric: ids.includes('vampiric'),
      hasted: ids.includes('hasted'), commander: ids.includes('commander'),
      ward: 0, wardMax: 0, hit: 0, vampT: -1e9, trailT: 0, w: null, tw: 0,
    };
    if (A.warded) A.ward = A.wardMax = e.maxHp * W.share;
    if (A.hasted) e.speed *= AFFIXES.hasted.speed;
    this.list.push(A);
    return A;
  }

  live(A) { return !A.dead && A.e.active && A.e.uid === A.uid && A.e.aff === A; }

  /** Enemies.damage, while a ward holds: the ward soaks `cut` of the hit; returns what reaches HP. */
  absorb(e, amount) {
    const A = e.aff, soak = Math.min(A.ward, amount * W.cut);
    A.ward -= soak; A.hit = 1;
    if (A.ward <= 1e-6) this.shatter(e, A);
    return amount - soak;
  }

  shatter(e, A) {
    const run = this.run, y = HEAD[e.type] * e.scale * 0.5;
    A.ward = 0;
    run.particles.burst(e.x, y, e.z, 46, this.col.ward, { speed: 9, life: 0.7, size: 0.45, sizeEnd: 0.05, up: 0.9, grav: 9, drag: 1.5 });
    run.particles.burst(e.x, y, e.z, 14, [3, 3, 3.3], { speed: 4, life: 0.35, size: 0.9 });
    run.fx.shockwave(e.x, e.z, 4.5, 0x9ff0ff, 0.45, 0.14);
    run.fx.light(e.x, e.z, 6, 2.2, this.wardLight, 0.45);
    run.fx.text(e.x, y + 1.6, e.z, 'WARD BROKEN', 'big');
    run.fx.shake(0.18); run.fx.hitStop(0.05);
    run.audio.sfx('ward_break');
    run.app.haptic('light');
    this.slow(e, 0, W.stagger); // a short stagger
    e.flash = 1;
  }

  /** A uid-keyed speed multiplier for `dur` s (Enemies.update applies it after the move logic). */
  slow(e, mul, dur) {
    const T = this.run.enemies.time + dur;
    if (e.slowUid === e.uid && e.slowT > T && e.slowMul <= mul) return;
    e.slowUid = e.uid; e.slowMul = mul; e.slowT = T;
  }

  /** Every kill: an affixed elite pays out (and splits or routs); Vampiric elites feed on deaths nearby. */
  onKill(e) {
    const L = this.list;
    if (!L.length) return;
    const A = e.aff;
    if (A && A.e === e && A.uid === e.uid && !A.dead) this.died(e, A);
    const now = this.run.enemies.time;
    for (let i = 0; i < L.length; i++) {
      const B = L[i];
      if (!B.vampiric || B === A || !this.live(B)) continue;
      const v = B.e, dx = v.x - e.x, dz = v.z - e.z, d2 = dx * dx + dz * dz;
      if (d2 > VA.r * VA.r || now - B.vampT < VA.cd || v.hp >= v.maxHp) continue;
      B.vampT = now;
      v.hp = Math.min(v.maxHp, v.hp + v.maxHp * VA.heal);
      // a red tether of blood motes streaming from the corpse into the vampire
      const d = Math.sqrt(d2) || 0.1, c = this.col.vamp, sp = 9, life = d / sp, n = Math.max(3, Math.round(d * 1.6));
      for (let k = 0; k < n; k++) {
        const u = k / n, j = (Math.random() - 0.5) * 0.25;
        this.run.particles.emit(e.x + dx * u * 0.15 + j, 0.7 + u * 0.4, e.z + dz * u * 0.15 + j, (dx / d) * sp, 0.4, (dz / d) * sp, life * (1 - u * 0.15), 0.38, 0.12, c[0], c[1], c[2], 1, 0, 0);
      }
      this.run.particles.burst(v.x, 1.2 * v.scale, v.z, 6, c, { speed: 2, life: 0.4, size: 0.4, up: 1 });
    }
  }

  died(e, A) {
    const run = this.run;
    A.dead = true;
    const gold = AFFIXES.gold * A.ids.length;
    run.bonusGold += gold;
    run.fx.text(e.x, 2.8 * e.scale, e.z, `+${gold} gold`, 'gold');
    if (A.splitter) this.splits.push({ type: e.type, x: e.x, z: e.z, n: SP.n[0] + Math.floor(Math.random() * (SP.n[1] - SP.n[0] + 1)) });
    if (A.commander) this.rout(e);
    if (A.ward > 0) run.particles.burst(e.x, HEAD[e.type] * e.scale * 0.5, e.z, 16, this.col.ward, { speed: 5, life: 0.4, size: 0.4, up: 0.5 });
  }

  /** The Commander falls: its aura lifts, and everything around it is shoved back and staggers in fear. */
  rout(c) {
    const run = this.run, E = run.enemies, R = CO.r + 1;
    E.query(c.x, c.z, R, (o) => {
      if (o === c || o.type === 'boss' || o.ev) return;
      if (o.cmdUid === o.uid) { o.cmdUid = 0; o.speed /= CO.speed; o.dmg /= CO.dmg; }
      const dx = o.x - c.x, dz = o.z - c.z, l = Math.hypot(dx, dz) || 1, k = CO.knock / Math.max(1, o.mass * 0.6);
      o.kx += (dx / l) * k; o.kz += (dz / l) * k;
      this.slow(o, CO.slow, CO.rout);
      if (Math.random() < 0.5) run.particles.emit(o.x, 1.3 * o.scale, o.z, 0, 1.6, 0, 0.6, 0.35, 0.05, this.col.rout[0], this.col.rout[1], this.col.rout[2], 1, 0, 0);
    });
    run.particles.ring(c.x, c.z, R, 50, this.col.gold, { life: 0.5, size: 0.6 });
    run.fx.shockwave(c.x, c.z, R * 1.3, 0xffd04a, 0.55, 0.1);
    run.fx.text(c.x, 3.2 * c.scale, c.z, 'ROUTED!', 'big');
    run.audio.sfx('rout');
  }

  update(dt) {
    this.t += dt;
    const run = this.run, E = run.enemies, L = this.list;
    // Splitter deaths burst a frame later, so the blow that killed the parent can't also eat the copies
    for (const s of this.splits) this.split(s);
    this.splits.length = 0;
    const nCmd = this.prune();
    // Commander auras: drop whoever left every aura (or died), then take in whoever stepped inside
    const B = this.boosted;
    let w = 0;
    for (let i = 0; i < B.length; i++) {
      const b = B[i], o = b.e;
      if (!o.active || o.uid !== b.uid || o.cmdUid !== o.uid) { this.boostPool.push(b); continue; }
      let inside = false;
      for (let k = 0; k < L.length && !inside; k++) {
        const c = L[k].e;
        if (L[k].commander && (o.x - c.x) ** 2 + (o.z - c.z) ** 2 < (CO.r + o.radius) ** 2) inside = true;
      }
      if (!inside) { o.cmdUid = 0; o.speed /= CO.speed; o.dmg /= CO.dmg; this.boostPool.push(b); continue; }
      B[w++] = b;
    }
    B.length = w;
    if (nCmd) for (const A of L) if (A.commander) { this._cmd = A.e; E.query(A.e.x, A.e.z, CO.r, this._boost); }
    this._cmd = null;
    // embers above a few of the rallied each frame, so the aura's reach reads
    if (B.length) {
      const c = this.col.gold;
      for (let k = 0; k < 2; k++) {
        const o = B[(this.fxI++) % B.length].e;
        if (Math.random() < run.particles.budget) run.particles.emit(o.x, 1.2 * o.scale, o.z, 0, 1.4, 0, 0.45, 0.28, 0.04, c[0], c[1], c[2], 0.9, 0, 0);
      }
    }
    // per-elite fx: hit flashes fade, Hasted elites trail embers
    for (const A of L) {
      A.hit = Math.max(0, A.hit - dt * 6);
      if (!A.hasted) continue;
      A.trailT -= dt;
      if (A.trailT > 0) continue;
      A.trailT = 0.05 / Math.max(0.3, run.particles.budget);
      const e = A.e, c = this.col.ember;
      run.particles.emit(e.x - e.vx * 0.05 + (Math.random() - 0.5) * 0.5, 0.25 + Math.random() * 0.8 * e.scale, e.z - e.vz * 0.05 + (Math.random() - 0.5) * 0.5,
        -e.vx * 0.2, 0.7, -e.vz * 0.2, 0.55, 0.5, 0.05, c[0], c[1], c[2], 1, 1.5, 0);
    }
  }

  /** Drop the dead (and recycled) from the list; returns how many live Commanders remain. */
  prune() {
    const L = this.list;
    let w = 0, nCmd = 0;
    for (let i = 0; i < L.length; i++) { const A = L[i]; if (this.live(A)) { L[w++] = A; if (A.commander) nCmd++; } }
    L.length = w;
    return nCmd;
  }

  /** n non-elite, chest-less copies: smaller and faster, with scaled HP, shoved outward. */
  split(s) {
    const run = this.run, d = ENEMIES[s.type];
    for (let i = 0; i < s.n; i++) {
      const a = (i / s.n) * Math.PI * 2 + Math.random() * 0.5;
      const e = run.enemies.spawn(s.type, s.x + Math.cos(a) * 0.6, s.z + Math.sin(a) * 0.6, { hpMul: run.hpMul() * run.mut.hp * SP.hp, dmgMul: run.dmgMul() });
      if (!e) break;
      e.speed *= SP.speed * run.mut.speed; e.scale *= SP.scale; e.radius *= SP.scale;
      e.kx = Math.cos(a) * 7 / Math.max(1, d.mass * 0.6); e.kz = Math.sin(a) * 7 / Math.max(1, d.mass * 0.6);
      e.spawnT = 0.12;
    }
    run.particles.burst(s.x, 0.8, s.z, 34, this.col.split, { speed: 7, life: 0.55, size: 0.55, up: 0.9, grav: 8 });
    run.fx.shockwave(s.x, s.z, 3.2, 0xff8a3d, 0.35, 0.16);
    run.audio.sfx('splitter_pop');
  }

  render() {
    const L = this.list, g = this.run.glow, cam = this.run.camera;
    let nb = 0, nr = 0;
    for (const A of L) {
      const e = A.e, pop = Math.min(1, e.spawnT * 4), h = HEAD[e.type] * e.scale;
      if (A.vampiric || A.splitter) { // kept off the ground: a big low sprite gets cut by the floor's depth
        const c = this.glow[A.vampiric ? 'vampiric' : 'splitter'], th = 0.65 + 0.35 * Math.sin(this.t * (A.vampiric ? 4 : 7) + e.phase);
        g.add(e.x, h * 0.55, e.z, h * 1.25 * pop, c[0], c[1], c[2], 0.55 * th);
      }
      if (A.ward > 0 && nb < MAX) {
        const R = Math.max(h * 0.62, e.radius * 1.5 + 0.35) * pop, f = A.ward / A.wardMax;
        _p.set(e.x, h * 0.45, e.z); _q.copy(cam.quaternion); _s.set(R, R * 1.05, R);
        _m.compose(_p, _q, _s);
        this.bubbles.mesh.setMatrixAt(nb, _m);
        this.bubbles.iA.setXY(nb++, 0.45 + 0.55 * f, A.hit);
      }
      if (A.commander && nr < MAX) {
        _p.set(e.x, 0.05, e.z); _q.identity(); _s.set(CO.r * pop, 1, CO.r * pop);
        _m.compose(_p, _q, _s);
        this.rings.mesh.setMatrixAt(nr, _m);
        this.rings.iA.setXY(nr++, 1, 0);
      }
    }
    this.flush(this.bubbles, nb); this.flush(this.rings, nr);
  }

  flush(M, n) {
    M.mesh.count = n;
    if (n) { M.mesh.instanceMatrix.needsUpdate = true; M.iA.needsUpdate = true; }
    M.mesh.material.uniforms.uTime.value = this.t;
  }

  /** Affix tags over each elite (in their colours) and a thin ward gauge while it holds. */
  draw2d(ctx) {
    const L = this.list;
    if (!L.length) return;
    const run = this.run, eng = run.engine, cam = run.camera, Wd = eng.w, Hd = eng.h;
    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 3;
    ctx.font = '800 11px Oxanium, "Segoe UI", sans-serif';
    for (const A of L) {
      const e = A.e;
      _v.set(e.x, HEAD[e.type] * e.scale + 1.25, e.z);
      const p = eng.project(_v, cam, _sp);
      if (!p || p.x < -60 || p.x > Wd + 60 || p.y < -20 || p.y > Hd + 20) continue;
      if (!A.w) { A.w = A.ids.map((id) => ctx.measureText(AFFIXES[id].name.toUpperCase()).width); A.tw = A.w.reduce((a, b) => a + b, 0) + (A.ids.length - 1) * 10; }
      let x = p.x - A.tw / 2;
      ctx.globalAlpha = Math.min(1, e.spawnT * 3);
      for (let i = 0; i < A.ids.length; i++) {
        const D = AFFIXES[A.ids[i]];
        if (i) { ctx.fillStyle = 'rgba(255,240,210,.55)'; ctx.fillRect(x + 3, p.y - 1, 3, 3); x += 10; }
        ctx.strokeStyle = 'rgba(16,6,2,0.92)'; ctx.strokeText(D.name.toUpperCase(), x, p.y);
        ctx.fillStyle = D.color; ctx.fillText(D.name.toUpperCase(), x, p.y);
        x += A.w[i];
      }
      if (A.ward > 0) {
        const bw = 40, f = A.ward / A.wardMax;
        ctx.fillStyle = 'rgba(0,10,20,.75)'; ctx.fillRect(p.x - bw / 2 - 1, p.y + 8, bw + 2, 5);
        ctx.fillStyle = '#9ff0ff'; ctx.fillRect(p.x - bw / 2, p.y + 9, bw * f, 3);
      }
    }
    ctx.restore();
  }

  dispose() {
    for (const M of [this.bubbles, this.rings]) { M.mesh.geometry.dispose(); M.mesh.material.dispose(); }
  }
}
