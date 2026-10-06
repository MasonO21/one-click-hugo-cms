// Ground hazards and chapter identity: telegraph circles and cones, burning ground, ice patches,
// ember vents and abyssal hands. Every decal draws through one pooled instanced mesh with a small shader.
// Enemies drive update()/render() each frame; the Shepherd asks iceAt() and gets burned or rooted from here.
import * as THREE from 'three';
import { HAZARDS } from './data.js';
import { hash2 } from './world.js';
import { hdr } from '../engine/particles.js';

const MAX = 160;           // decal instances drawn per frame
const VIEW2 = 26 * 26;     // decals farther than this from the Shepherd are skipped
const K_CIRCLE = 0, K_CONE = 1, K_BURN = 2, K_ICE = 3, K_VENT = 4, K_HANDS = 5;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _ice = { x: 0, z: 0, rx: 1, rz: 1, rot: 0, seed: 0 };

const decalVert = /* glsl */`
attribute vec4 iData;   // x: progress 0..1 · y: alpha · z: per-kind extra (cone half-angle, seed, flare) · w: kind
attribute vec3 iCol;
varying vec2 vUv; varying vec4 vData; varying vec3 vCol; varying vec2 vW;
void main() {
  vUv = uv * 2.0 - 1.0; vData = iData; vCol = iCol;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vW = wp.xz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const decalFrag = /* glsl */`
uniform float uTime;
varying vec2 vUv; varying vec4 vData; varying vec3 vCol; varying vec2 vW;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// danger decal: bright rim, a fill that grows from the centre with progress p, marching stripes ahead of it
float warn(float r, float p, float sc) {
  float edge = smoothstep(0.13, 0.03, abs(r - 0.9));
  float fill = step(r, p);
  float stripes = step(0.55, fract(sc - uTime * 2.2)) * (1.0 - fill);
  return edge + fill * 0.3 + stripes * 0.14 + 0.06;
}
// F2 - F1 of a jittered cell pattern: near zero along cell borders, which reads as shattered ice
float shards(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    float d = length(g + vec2(hash(i + g), hash(i + g + 17.3)) - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return d2 - d1;
}
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float k = vData.w, p = vData.x;
  vec3 col = vCol; float a;
  if (k < 0.5) {                     // circle telegraph (Witch lobs, vents, hands); z > 1 adds an "incoming" ring closing in from z × radius
    float s = max(vData.z, 1.0), rr = r * s;
    float ring = smoothstep(0.1, 0.0, abs(rr - 1.0 - (s - 1.0) * (1.0 - p))) * (0.45 + 0.55 * p) * step(1.01, s);
    a = rr > 1.0 ? ring : max(warn(rr, p, (vUv.x + vUv.y) * 2.5 * s), ring);
    col *= 1.35;
  } else if (k < 1.5) {              // cone telegraph (Brute slam): apex at the centre, opening along local +z
    float ang = abs(atan(vUv.x, -vUv.y));
    if (ang > vData.z) discard;
    float side = smoothstep(0.08, 0.02, (vData.z - ang) * r);
    a = max(warn(r, p, r * 3.0), side);
    col *= 1.35;
  } else if (k < 2.5) {              // burning ground: charred crust split by flickering ember veins
    float n = noise(vW * 1.7 + vec2(vData.z * 17.0, -uTime * 1.4));
    float mask = smoothstep(1.0, 0.7, r + (n - 0.5) * 0.4);
    float vein = smoothstep(0.16, 0.0, shards(vW * 1.5 + vData.z * 11.0));
    float flicker = 0.65 + 0.35 * noise(vW * 3.0 + vec2(0.0, uTime * 3.0));
    float heat = clamp(vein * flicker + smoothstep(0.55, 0.0, r) * 0.35 * n, 0.0, 1.0);
    col = mix(vec3(0.16, 0.03, 0.01), vec3(3.4, 1.25, 0.25), heat);
    a = mask * (0.62 + 0.38 * heat);
  } else if (k < 3.5) {              // ice patch: a pale, low-saturation sheet with shard cracks, a frosted rim and a slow glint
    float edge = smoothstep(1.0, 0.9, r);
    float rim = smoothstep(0.7, 0.98, r) * edge;
    float crack = smoothstep(0.07, 0.0, shards(vW * 0.75 + vData.z * 13.0)) * edge;
    float sheen = noise(vW * 0.35 + vData.z * 3.0);
    float glint = pow(max(0.0, sin((vW.x - vW.y) * 0.5 + uTime * 0.8)), 20.0) * edge;
    col = vec3(0.55, 0.74, 0.9) * (0.55 + 0.3 * sheen) + vec3(0.6, 0.82, 0.95) * (rim * 0.35 + crack * 0.45 + glint * 0.4);
    a = edge * (0.34 + 0.12 * sheen + rim * 0.2) + crack * 0.28 + glint * 0.1;
  } else if (k < 4.5) {              // ember vent: a crater whose core heats up while it charges (p) and flares on a puff (z)
    float crater = smoothstep(0.66, 0.5, r);
    float lip = smoothstep(0.09, 0.0, abs(r - 0.58));
    float core = smoothstep(0.42, 0.0, r) * (0.55 + 0.45 * noise(vW * 5.0 + uTime * 2.0));
    col = vec3(0.03, 0.012, 0.006) + vec3(2.2, 0.7, 0.15) * (core * (0.3 + 1.3 * p + 2.2 * vData.z) + lip * (0.3 + 0.6 * p));
    a = crater * 0.9 + lip * 0.6;
  } else {                           // abyssal hands: a pool that darkens while it charges (p), claws rise when it grabs (z)
    float ang = atan(vUv.y, vUv.x);
    float pool = smoothstep(1.0, 0.5, r) * (0.3 + 0.55 * p);
    float claws = smoothstep(0.55, 1.0, sin(ang * 5.0 + r * 4.0)) * smoothstep(0.95, 0.3, r) * smoothstep(0.06, 0.28, r) * vData.z;
    float swirl = noise(vec2(ang * 3.0 + uTime * 2.0, r * 4.0 - uTime * 3.0));
    col = vec3(0.03, 0.0, 0.07) + vCol * (claws * 2.6 + swirl * 0.4 * p);
    a = max(pool, claws);
  }
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * vData.y);
}`;

export class Hazards {
  constructor(run) {
    this.run = run;
    const g = new THREE.PlaneGeometry(2, 2);
    g.rotateX(-Math.PI / 2);
    this.iData = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iData', this.iData); g.setAttribute('iCol', this.iCol);
    this.mat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: decalVert, fragmentShader: decalFrag, transparent: true, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(g, this.mat, MAX);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    run.scene.add(this.mesh);
    this.n = 0;
    this.time = 0;
    this.teles = []; this.telePool = [];
    this.burns = []; this.burnPool = [];
    this.vents = []; this.nv = 0;
    for (let i = 0; i < 25; i++) this.vents.push({ x: 0, z: 0, warn: 0, flare: 0 });
    this.grab = { on: false, x: 0, z: 0, t: 0, hit: false };
    this.handT = 0;
    this.col = { white: new THREE.Color(1, 1, 1), vent: new THREE.Color(0xff8a2a), hand: new THREE.Color(0xb35bff) };
    this.fire = hdr(0xff8a2a, 3.4); this.ember = hdr(0xff6a1a, 3); this.violet = hdr(0xb35bff, 3);
    this.post = run.engine.post;
    if (this.post.uVignette.base === undefined) this.post.uVignette.base = this.post.uVignette.value;
    this.setMods(run.mods);
  }

  /** Switch the active chapter modifier set (run start, and every abyss depth in Endless). */
  setMods(mods) {
    this.mods = mods || {};
    this.post.uVignette.value = this.mods.vignette ?? this.post.uVignette.base;
    const sight = this.run.world.groundMat.uniforms.uSight; // the ground's lantern-sight fog
    if (sight.base === undefined) sight.base = sight.value;
    sight.value = this.mods.sight ?? sight.base;
    this.handT = HAZARDS.hands.every[0];
    this.grab.on = false;
    this.nv = 0;
  }

  // ---------------------------------------------------------------- telegraphs (pooled; purely visual)
  tele(kind, x, z, r, dur, color) {
    if (this.teles.length >= 64) return null;
    const t = this.telePool.pop() || { col: new THREE.Color() };
    t.kind = kind; t.x = x; t.z = z; t.r = r; t.dur = dur; t.t = 0; t.fresh = true; t.rot = 0; t.arc = 0; t.owner = null; t.uid = 0; t.state = 0;
    t.col.set(color);
    this.teles.push(t);
    return t;
  }

  /** A circle that fills over dur seconds; incoming > 1 adds a ring that closes in from incoming × r (lobs, hands). */
  circle(x, z, r, dur, color, incoming = 1) {
    const t = this.tele(K_CIRCLE, x, z, r, dur, color);
    if (t) t.arc = incoming;
    return t;
  }

  /** A cone (reach, ±arc) bound to a winding-up enemy: it follows the owner and vanishes once the owner leaves `state`. */
  cone(owner, state, dx, dz, reach, arc, dur, color) {
    const t = this.tele(K_CONE, owner.x, owner.z, reach, dur, color);
    if (t) { t.owner = owner; t.uid = owner.uid; t.state = state; t.rot = Math.atan2(dx, dz); t.arc = arc; }
    return t;
  }

  /** Burning ground left by a Witch lob: hurts the Shepherd for share × orbDmg per second while standing in it. */
  burn(x, z, r, orbDmg) {
    if (this.burns.length >= 40) return;
    const b = this.burnPool.pop() || {};
    b.x = x; b.z = z; b.r = r; b.t = 0; b.life = HAZARDS.burn.life; b.dps = orbDmg * HAZARDS.burn.share; b.seed = Math.random();
    this.burns.push(b);
  }

  /** Drop the transient hazards (telegraphs, burning ground, a pending grab), e.g. when Gravemaw falls. */
  clear() {
    for (const t of this.teles) { t.owner = null; this.telePool.push(t); }
    for (const b of this.burns) this.burnPool.push(b);
    this.teles.length = 0; this.burns.length = 0;
    this.grab.on = false;
  }

  // ---------------------------------------------------------------- ice (hash grid, stateless)
  icePatch(cx, cz) {
    const I = HAZARDS.ice;
    if ((cx === 0 && cz === 0) || hash2(cx, cz, 21) > I.chance) return false; // keep the spawn clear
    const C = I.cell;
    _ice.x = (cx + 0.2 + hash2(cx, cz, 22) * 0.6) * C;
    _ice.z = (cz + 0.2 + hash2(cx, cz, 23) * 0.6) * C;
    _ice.rx = I.radius[0] + hash2(cx, cz, 24) * (I.radius[1] - I.radius[0]);
    _ice.rz = _ice.rx * (0.65 + hash2(cx, cz, 25) * 0.35);
    _ice.rot = hash2(cx, cz, 26) * Math.PI;
    _ice.seed = hash2(cx, cz, 27);
    return true;
  }

  /** True when (x, z) stands on an ice patch (Ch3 identity). */
  iceAt(x, z) {
    if (!this.mods.ice) return false;
    const C = HAZARDS.ice.cell, cx0 = Math.floor(x / C), cz0 = Math.floor(z / C);
    for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
      for (let cz = cz0 - 1; cz <= cz0 + 1; cz++) {
        if (!this.icePatch(cx, cz)) continue;
        const dx = x - _ice.x, dz = z - _ice.z, c = Math.cos(_ice.rot), s = Math.sin(_ice.rot);
        const u = (dx * c - dz * s) / _ice.rx, v = (dx * s + dz * c) / _ice.rz;
        if (u * u + v * v < 0.92) return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- simulation
  update(dt) {
    this.time += dt;
    const run = this.run, P = run.player;
    const tl = this.teles;
    for (let i = tl.length - 1; i >= 0; i--) {
      const t = tl[i];
      if (t.fresh) t.fresh = false; else t.t += dt; // fills in step with the move it warns about
      let done = t.t >= t.dur - 1e-6;
      const o = t.owner;
      if (o) { if (!o.active || o.uid !== t.uid || o.state !== t.state) done = true; else { t.x = o.x; t.z = o.z; } }
      if (done) { t.owner = null; tl[i] = tl[tl.length - 1]; tl.pop(); this.telePool.push(t); }
    }
    // burning ground: the hottest patch under the Shepherd burns (patches don't stack)
    let dps = 0;
    const bs = this.burns, emberP = dt * 7 * run.particles.budget, c = this.ember;
    for (let i = bs.length - 1; i >= 0; i--) {
      const b = bs[i];
      b.t += dt;
      if (b.t >= b.life) { bs[i] = bs[bs.length - 1]; bs.pop(); this.burnPool.push(b); continue; }
      if ((P.x - b.x) ** 2 + (P.z - b.z) ** 2 < (b.r + P.radius * 0.4) ** 2) dps = Math.max(dps, b.dps);
      if (Math.random() < emberP) {
        const a = Math.random() * 6.283, rr = Math.random() * b.r * 0.8;
        run.particles.emit(b.x + Math.cos(a) * rr, 0.1, b.z + Math.sin(a) * rr, 0, 1.6 + Math.random(), 0, 0.6, 0.35, 0.05, c[0], c[1], c[2], 0.9, 1.5, 0);
      }
    }
    if (dps > 0) P.burn(dps, dt);
    if (this.mods.vents) this.updateVents(dt); else this.nv = 0;
    if (this.mods.hands) this.updateHands(dt);
  }

  updateVents(dt) {
    const V = HAZARDS.vents, run = this.run, P = run.player, C = V.cell;
    const cx0 = Math.floor(P.x / C), cz0 = Math.floor(P.z / C);
    let n = 0;
    for (let cx = cx0 - 2; cx <= cx0 + 2; cx++) {
      for (let cz = cz0 - 2; cz <= cz0 + 2; cz++) {
        if ((cx === 0 && cz === 0) || hash2(cx, cz, 31) > V.chance) continue;
        const x = (cx + 0.25 + hash2(cx, cz, 32) * 0.5) * C, z = (cz + 0.25 + hash2(cx, cz, 33) * 0.5) * C;
        // each vent loops idle → warn (telegraph) → puff on its own period and phase
        const period = V.period[0] + hash2(cx, cz, 34) * (V.period[1] - V.period[0]);
        const off = hash2(cx, cz, 35) * period;
        const u = (this.time + off) % period, prev = (this.time - dt + off) % period;
        const puffAt = period - V.puff, warnAt = puffAt - V.warn;
        const v = this.vents[n++];
        v.x = x; v.z = z;
        v.warn = u >= warnAt && u < puffAt ? (u - warnAt) / V.warn : 0;
        v.flare = u >= puffAt ? 1 - (u - puffAt) / V.puff : 0;
        const crossed = prev <= u ? prev < puffAt && puffAt <= u : prev < puffAt || puffAt <= u;
        if (crossed) this.puff(x, z, V);
        if (v.flare > 0 && Math.random() < 0.6) {
          const f = this.fire, a = Math.random() * 6.283, rr = Math.random() * V.radius * 0.5;
          run.particles.emit(x + Math.cos(a) * rr, 0.2, z + Math.sin(a) * rr, Math.cos(a) * 0.6, 4 + Math.random() * 3, Math.sin(a) * 0.6, 0.5, 0.9, 0.2, f[0], f[1], f[2], 0.9, 2, 0);
        }
      }
    }
    this.nv = n;
  }

  puff(x, z, V) {
    const run = this.run, P = run.player;
    const d2 = (P.x - x) ** 2 + (P.z - z) ** 2;
    if (d2 > VIEW2) return;
    run.particles.burst(x, 0.3, z, 34, this.fire, { speed: 3.5, life: 0.75, size: 0.8, up: 3, drag: 2 });
    run.fx.light(x, z, 4.5, 1.6, this.col.vent, 0.5);
    if (d2 < (V.radius + P.radius) ** 2) P.hurt(V.dmg * run.dmgMul());
    if (d2 < 196) run.audio.sfx('explosion', { volume: 0.3, pitch: 0.7 });
  }

  updateHands(dt) {
    const H = HAZARDS.hands, run = this.run, P = run.player, g = this.grab;
    if (!g.on) {
      this.handT -= dt;
      if (this.handT > 0 || P.dead) return;
      this.handT = H.every[0] + Math.random() * (H.every[1] - H.every[0]);
      g.on = true; g.t = 0; g.hit = false;
      g.x = P.x + P.vx * H.lead; g.z = P.z + P.vz * H.lead;
      this.circle(g.x, g.z, H.radius, H.warn, this.col.hand, 1.7);
      return;
    }
    g.t += dt;
    if (!g.hit && g.t >= H.warn - 1e-6) {
      g.hit = true;
      run.particles.burst(g.x, 0.2, g.z, 26, this.violet, { speed: 2.5, life: 0.6, size: 0.55, up: 2.5 });
      if ((P.x - g.x) ** 2 + (P.z - g.z) ** 2 < (H.radius + P.radius * 0.5) ** 2) {
        P.root(H.root);
        run.audio.sfx('hit', { volume: 0.6, pitch: 0.5 });
      }
    }
    if (g.t >= H.warn + H.grab) g.on = false;
  }

  // ---------------------------------------------------------------- drawing
  put(kind, x, z, rx, rz, rot, p, alpha, extra, col) {
    if (this.n >= MAX) return;
    const P = this.run.player;
    if ((x - P.x) ** 2 + (z - P.z) ** 2 > VIEW2) return;
    const i = this.n++;
    _p.set(x, 0.03 + kind * 0.002, z);
    _q.setFromAxisAngle(_up, rot);
    _s.set(rx, 1, rz);
    _m.compose(_p, _q, _s);
    this.mesh.setMatrixAt(i, _m);
    this.iData.setXYZW(i, p, alpha, extra, kind);
    this.iCol.setXYZ(i, col.r, col.g, col.b);
  }

  render() {
    this.n = 0;
    const P = this.run.player, W = this.col.white;
    // draw order matters inside one instanced mesh: ice, then vents and hands, then fire, then telegraphs on top
    if (this.mods.ice) {
      const C = HAZARDS.ice.cell, cx0 = Math.floor(P.x / C), cz0 = Math.floor(P.z / C);
      for (let cx = cx0 - 2; cx <= cx0 + 2; cx++) {
        for (let cz = cz0 - 2; cz <= cz0 + 2; cz++) if (this.icePatch(cx, cz)) this.put(K_ICE, _ice.x, _ice.z, _ice.rx, _ice.rz, _ice.rot, 0, 1, _ice.seed, W);
      }
    }
    const V = HAZARDS.vents;
    for (let i = 0; i < this.nv; i++) {
      const v = this.vents[i];
      this.put(K_VENT, v.x, v.z, V.radius, V.radius, 0, v.warn, 1, v.flare, W);
      if (v.warn > 0) this.put(K_CIRCLE, v.x, v.z, V.radius, V.radius, 0, v.warn, 1, 0, this.col.vent);
    }
    const g = this.grab;
    if (g.on) {
      const H = HAZARDS.hands, p = Math.min(1, g.t / H.warn), up = g.hit ? Math.min(1, (g.t - H.warn) * 6) : 0;
      const fade = g.hit ? 1 - Math.max(0, (g.t - H.warn - H.grab * 0.6) / (H.grab * 0.4)) : 1;
      this.put(K_HANDS, g.x, g.z, H.radius * 1.05, H.radius * 1.05, 0, p, fade, up, this.col.hand);
    }
    for (const b of this.burns) {
      const fade = Math.min(1, b.t * 6) * Math.min(1, (b.life - b.t) * 2);
      this.put(K_BURN, b.x, b.z, b.r * 1.1, b.r * 1.1, 0, 0, fade, b.seed, W);
    }
    for (const t of this.teles) {
      const p = Math.min(1, t.t / t.dur), R = t.kind === K_CIRCLE ? t.r * Math.max(1, t.arc) : t.r;
      this.put(t.kind, t.x, t.z, R, R, t.rot, p, Math.min(1, t.t * 8 + 0.3), t.arc, t.col);
    }
    this.mesh.count = this.n;
    if (this.n) { this.mesh.instanceMatrix.needsUpdate = true; this.iData.needsUpdate = true; this.iCol.needsUpdate = true; }
    this.mat.uniforms.uTime.value = this.time;
  }

  dispose() {
    this.mesh.geometry.dispose(); this.mat.dispose();
    this.post.uVignette.value = this.post.uVignette.base;
  }
}
