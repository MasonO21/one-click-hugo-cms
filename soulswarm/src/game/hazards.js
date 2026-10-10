// Ground hazards and chapter identity: telegraph circles, cones and lanes, burning ground, ice patches, ember vents and
// abyssal hands; Update 13's tide pools, brambles, miasma clouds, lightning and gravity wells (and the Witchfire Lantern's
// friendly flames, simulated in weapons.js). Every decal draws through one pooled instanced mesh with a small shader.
// Enemies drive update()/render() each frame; the Shepherd asks iceAt() / slowAt() and gets burned or rooted from here.
import * as THREE from 'three';
import { HAZARDS, ENEMIES } from './data.js';
import { hash2 } from './world.js';
import { hdr } from '../engine/particles.js';

const MAX = 384;           // decal instances drawn per frame (room for every kind at its cap, the Witchfire Lantern and a realm's patches included)
const VIEW2 = 26 * 26;     // decals farther than this from the Shepherd are skipped
const K_CIRCLE = 0, K_CONE = 1, K_BURN = 2, K_ICE = 3, K_VENT = 4, K_HANDS = 5, K_WITCH = 6, K_TIDE = 7, K_BRAMBLE = 8, K_MIASMA = 9, K_WELL = 10, K_LINE = 11;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _ice = { x: 0, z: 0, rx: 1, rz: 1, rot: 0, seed: 0 };
const _vent = { x: 0, z: 0 };
const _pt = { x: 0, z: 0, r: 1, seed: 0 };   // a tide pool or bramble patch (hash grid)
const _well = { x: 0, z: 0 };
const SALT = { tide: 41, brambles: 51 };
const BOLT = { kx: 0, kz: 0, knock: 0, crit: false, source: 'lightning', silent: false };
/** The gravity well in grid cell (cx, cz), written to _well; false when the cell has none. */
function wellAt(cx, cz) {
  const G = HAZARDS.gravity, C = G.cell;
  if ((cx === 0 && cz === 0) || hash2(cx, cz, 61) > G.chance) return false;
  _well.x = (cx + 0.3 + hash2(cx, cz, 62) * 0.4) * C; _well.z = (cz + 0.3 + hash2(cx, cz, 63) * 0.4) * C;
  return true;
}
/** The ember vent in grid cell (cx, cz), written to _vent; false when the cell has none. */
function ventAt(cx, cz) {
  const V = HAZARDS.vents, C = V.cell;
  if ((cx === 0 && cz === 0) || hash2(cx, cz, 31) > V.chance) return false;
  _vent.x = (cx + 0.25 + hash2(cx, cz, 32) * 0.5) * C; _vent.z = (cz + 0.25 + hash2(cx, cz, 33) * 0.5) * C;
  return true;
}

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
  float k = vData.w, p = vData.x;
  if (r > 1.0 && k < 10.5) discard; // every kind but the lane is round
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
  } else if (k < 5.5) {              // abyssal hands: a pool that darkens while it charges (p), claws rise when it grabs (z)
    float ang = atan(vUv.y, vUv.x);
    float pool = smoothstep(1.0, 0.5, r) * (0.3 + 0.55 * p);
    float claws = smoothstep(0.55, 1.0, sin(ang * 5.0 + r * 4.0)) * smoothstep(0.95, 0.3, r) * smoothstep(0.06, 0.28, r) * vData.z;
    float swirl = noise(vec2(ang * 3.0 + uTime * 2.0, r * 4.0 - uTime * 3.0));
    col = vec3(0.03, 0.0, 0.07) + vCol * (claws * 2.6 + swirl * 0.4 * p);
    a = max(pool, claws);
  } else if (k < 6.5) {              // witchfire (the Shepherd's own): flickering tongues of the lantern's colour, a scorched rim
    vec2 q = vW * 1.6 + vec2(vData.z * 13.0, -uTime * 1.8);
    q += 0.8 * vec2(noise(q * 0.9 + 3.1), noise(q * 0.9 - 5.7)); // warped, so the flames curl instead of tiling
    float n = noise(q), n2 = noise(q * 2.3 - vec2(uTime * 1.3, 0.0)) * 0.6 + noise(q * 4.1 + uTime) * 0.4;
    float mask = smoothstep(1.0, 0.6, r + (n - 0.5) * 0.45);
    float tongues = smoothstep(0.38, 0.85, n2 * (1.15 - r * 0.7));
    float heat = clamp(tongues + smoothstep(0.75, 0.0, r) * 0.3 * n, 0.0, 1.0);
    col = mix(vCol * 0.08, vCol * 1.8 + vec3(0.18), heat);
    a = mask * (0.35 + 0.6 * heat);
  } else if (k < 7.5) {              // tide pool: dark water with slow ripples and a pale foam rim
    float n = noise(vW * 0.6 + vec2(uTime * 0.15, -uTime * 0.1) + vData.z * 7.0);
    float edge = smoothstep(1.0, 0.82, r + (n - 0.5) * 0.12);
    float rim = smoothstep(0.7, 0.96, r) * edge;
    float rip = 0.5 + 0.5 * sin(r * 22.0 - uTime * 2.2 + n * 6.0);
    col = vec3(0.01, 0.06, 0.07) + vCol * (rim * 0.75 + rip * 0.1 * edge + n * 0.08);
    a = edge * (0.6 + 0.15 * n) + rim * 0.2;
  } else if (k < 8.5) {              // brambles: a dark tangle of thorny vines
    float edge = smoothstep(1.0, 0.72, r + (noise(vW * 2.0 + vData.z * 9.0) - 0.5) * 0.4);
    float vines = smoothstep(0.09, 0.0, shards(vW * 1.6 + vData.z * 5.0)) + smoothstep(0.07, 0.0, shards(vW * 2.7 - vData.z * 3.0)) * 0.7;
    float thorn = step(0.8, noise(vW * 9.0 + vData.z * 3.0)) * clamp(vines, 0.0, 1.0);
    col = vec3(0.04, 0.035, 0.015) + vCol * (vines * 0.45 + thorn * 1.5);
    a = edge * (0.5 + 0.45 * clamp(vines, 0.0, 1.0));
  } else if (k < 9.5) {              // miasma: a slow toxic swirl
    vec2 q = vW * 0.45 + vec2(uTime * 0.12, -uTime * 0.08) + vData.z * 11.0;
    float n = noise(q) * 0.6 + noise(q * 2.3 + uTime * 0.2) * 0.4;
    float edge = smoothstep(1.0, 0.4, r + (n - 0.5) * 0.45);
    col = vCol * (0.45 + 1.5 * n);
    a = edge * (0.3 + 0.35 * n);
  } else if (k < 10.5) {             // gravity well: a turning vortex that deepens as it gathers (p) and blazes as it pulls (z)
    float ang = atan(vUv.y, vUv.x);
    float swirl = 0.5 + 0.5 * sin(ang * 3.0 + r * 9.0 - uTime * (2.0 + 7.0 * vData.z));
    float core = smoothstep(0.3, 0.0, r), edge = smoothstep(1.0, 0.65, r);
    col = vec3(0.015, 0.0, 0.04) + vCol * (swirl * (0.25 + 0.9 * p + 1.5 * vData.z) * edge + core * (0.5 + 2.2 * vData.z));
    a = edge * (0.35 + 0.35 * p + 0.2 * vData.z) * (0.55 + 0.45 * swirl) + core * 0.6;
  } else {                           // lane: fills from its origin while it warns (p); z = 1 is the live beam itself
    float along = -vUv.y, across = abs(vUv.x);
    if (vData.z > 0.5) {
      float flick = 0.65 + 0.35 * noise(vec2(along * 7.0 - uTime * 24.0, uTime * 9.0));
      float core = smoothstep(0.5, 0.0, across);
      col = vCol * (1.3 + 2.6 * core) * flick + vec3(0.7) * core;
      a = (core + smoothstep(1.0, 0.3, across) * 0.35) * flick;
    } else {
      float side = smoothstep(0.14, 0.02, abs(across - 0.9));
      float fill = step((along + 1.0) * 0.5, p);
      float stripes = step(0.55, fract(along * 3.0 - uTime * 2.2)) * (1.0 - fill);
      a = side + fill * 0.3 + stripes * 0.14 + 0.06;
      col *= 1.35;
    }
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
    // Update 13's realms: short-lived patches laid by foes and bosses ({ kind: 'tide' | 'bramble' | 'miasma', x, z, r, t,
    // life, seed }), drifting miasma clouds, pending lightning bolts, the gravity wells in reach this frame, and lanes /
    // live beams other systems draw through us each frame (lines: { x, z, rot, w, len, p, live, col })
    this.trails = []; this.clouds = []; this.bolts = []; this.boltT = 2.5; this.thunder = null;
    this.wells = []; this.nw = 0; for (let i = 0; i < 25; i++) this.wells.push({ x: 0, z: 0, warn: 0, pull: 0 });
    this.lines = [];
    this.col = { white: new THREE.Color(1, 1, 1), vent: new THREE.Color(0xff8a2a), hand: new THREE.Color(0xb35bff), witch: new THREE.Color(0xc6ff3d),
      tide: new THREE.Color(0x2fb8a8), bramble: new THREE.Color(0x8a9a3a), miasma: new THREE.Color(0x6fbf2a), well: new THREE.Color(0x9a6bff),
      bolt: new THREE.Color(0x8fd8ff) };
    this.fire = hdr(0xff8a2a, 3.4); this.ember = hdr(0xff6a1a, 3); this.violet = hdr(0xb35bff, 3);
    this.spark = hdr(0xbfe6ff, 4); this.tox = hdr(0x9cff3a, 1.6);
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
    this.nv = 0; this.nw = 0;
    if (!this.mods.miasma) this.clouds.length = 0;
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

  /** Drop the transient hazards (telegraphs, burning ground, a pending grab), e.g. when the boss falls. */
  clear() {
    for (const t of this.teles) { t.owner = null; this.telePool.push(t); }
    for (const b of this.burns) this.burnPool.push(b);
    this.teles.length = 0; this.burns.length = 0;
    this.grab.on = false;
    this.trails.length = 0; this.bolts.length = 0;
  }

  // ---------------------------------------------------------------- Update 13's realms
  /** The tide pool or bramble patch of grid cell (cx, cz) (kind 'tide' | 'brambles'), written to _pt; false without one. */
  patch(kind, cx, cz) {
    const H = HAZARDS[kind], S = SALT[kind], C = H.cell;
    if ((cx === 0 && cz === 0) || hash2(cx, cz, S) > H.chance) return false; // keep the spawn clear
    _pt.x = (cx + 0.25 + hash2(cx, cz, S + 1) * 0.5) * C; _pt.z = (cz + 0.25 + hash2(cx, cz, S + 2) * 0.5) * C;
    _pt.r = H.radius[0] + hash2(cx, cz, S + 3) * (H.radius[1] - H.radius[0]); _pt.seed = hash2(cx, cz, S + 4);
    return true;
  }
  inPatch(kind, x, z, pad = 0) {
    const C = HAZARDS[kind].cell, cx0 = Math.floor(x / C), cz0 = Math.floor(z / C);
    for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) for (let cz = cz0 - 1; cz <= cz0 + 1; cz++) {
      if (this.patch(kind, cx, cz) && (x - _pt.x) ** 2 + (z - _pt.z) ** 2 < (_pt.r * 0.92 + pad) ** 2) return true;
    }
    return false;
  }
  laidAt(kind, x, z, pad = 0) {
    const T = this.trails;
    for (let i = 0; i < T.length; i++) { const t = T[i]; if (t.kind === kind && t.t > 0.15 && (x - t.x) ** 2 + (z - t.z) ** 2 < (t.r * 0.9 + pad) ** 2) return true; }
    return false;
  }
  tideAt(x, z) { return (!!this.mods.tide && this.inPatch('tide', x, z)) || this.laidAt('tide', x, z); }
  brambleAt(x, z) { return (!!this.mods.brambles && this.inPatch('brambles', x, z)) || this.laidAt('bramble', x, z); }
  miasmaAt(x, z) {
    const C = this.clouds;
    for (let i = 0; i < C.length; i++) { const c = C[i]; if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r * 0.85 * this.cloudFade(c)) ** 2) return true; }
    return this.laidAt('miasma', x, z);
  }
  cloudFade(c) { return Math.max(0, Math.min(1, c.t / 1.5, (c.life - c.t) / 1.5)); }
  /** The Shepherd's top-speed factor from the ground: tide pools and brambles slow him; 1 elsewhere. */
  slowAt(x, z) {
    let k = 1;
    if (this.tideAt(x, z)) k = Math.min(k, HAZARDS.tide.speed);
    if (this.brambleAt(x, z)) k = Math.min(k, HAZARDS.brambles.speed);
    return k;
  }
  /** A short-lived patch: a Thornback's brambles, a boss's tide pools, brambles or miasma. */
  lay(kind, x, z, r, life) {
    if (this.trails.length >= 72) return;
    this.trails.push({ kind, x, z, r, t: 0, life, seed: Math.random() });
  }
  /** A lane drawn this step (a telegraph filling to p, or a live beam); Enemies.update clears them before each step. */
  line(x0, z0, x1, z1, w, p, live, col) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 0.01;
    this.lines.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, rot: Math.atan2(dx, dz), w, len, p, live: live ? 1 : 0, col });
  }

  updateRealms(dt) {
    const run = this.run, P = run.player, M = this.mods;
    // laid patches age away
    const T = this.trails;
    let w = 0;
    for (let i = 0; i < T.length; i++) { const t = T[i]; t.t += dt; if (t.t < t.life) T[w++] = t; }
    T.length = w;
    if (P.dead) return;
    // brambles cut and miasma poisons, in quiet ticks (they never stack with each other's tick: the worse one counts)
    let dps = 0;
    if (this.brambleAt(P.x, P.z)) dps = Math.max(dps, HAZARDS.brambles.dps);
    if (M.miasma) this.updateClouds(dt);
    if (this.miasmaAt(P.x, P.z)) dps = Math.max(dps, HAZARDS.miasma.dps);
    if (dps > 0) P.burn(dps * run.dmgMul(), dt);
    if (M.lightning || this.thunder) this.updateLightning(dt);
    else this.bolts.length = 0;
    if (M.gravity) this.updateWells(dt); else this.nw = 0;
  }

  updateClouds(dt) {
    const H = HAZARDS.miasma, P = this.run.player, C = this.clouds;
    let w = 0;
    for (let i = 0; i < C.length; i++) {
      const c = C[i];
      c.t += dt; c.x += c.vx * dt; c.z += c.vz * dt;
      if (c.t < c.life && (c.x - P.x) ** 2 + (c.z - P.z) ** 2 < 34 * 34) C[w++] = c;
    }
    C.length = w;
    while (C.length < H.n) { // a new cloud drifts in ahead of the Shepherd (or anywhere around him while he stands)
      const mv = Math.hypot(P.vx, P.vz) > 0.5, a = mv ? Math.atan2(P.vz, P.vx) + (Math.random() - 0.5) * 2.2 : Math.random() * 6.283;
      const d = H.near + Math.random() * (H.far - H.near), da = Math.random() * 6.283, sp = H.drift * (0.5 + Math.random() * 0.5);
      C.push({ x: P.x + Math.cos(a) * d, z: P.z + Math.sin(a) * d, r: H.radius[0] + Math.random() * (H.radius[1] - H.radius[0]),
        vx: Math.cos(da) * sp, vz: Math.sin(da) * sp, t: 0, life: H.life[0] + Math.random() * (H.life[1] - H.life[0]), seed: Math.random() });
    }
  }

  /** A lightning strike marked where the Shepherd is heading: a telegraph, then the bolt (it burns the horde too). */
  updateLightning(dt) {
    const L = HAZARDS.lightning, run = this.run, P = run.player, Q = this.bolts;
    let w = 0;
    for (let i = 0; i < Q.length; i++) { const b = Q[i]; b.t -= dt; if (b.t > 0) Q[w++] = b; else this.strike(b.x, b.z); }
    Q.length = w;
    if ((this.boltT -= dt) > 0) return;
    const ev = this.thunder || L.every;
    this.boltT = ev[0] + Math.random() * (ev[1] - ev[0]);
    const a = Math.random() * 6.283, j = Math.random() * L.jitter;
    this.bolt(P.x + P.vx * L.lead + Math.cos(a) * j, P.z + P.vz * L.lead + Math.sin(a) * j);
  }
  /** Marks a strike at (x, z) that lands after the warning. */
  bolt(x, z) {
    const L = HAZARDS.lightning;
    this.bolts.push({ x, z, t: L.warn });
    this.circle(x, z, L.radius, L.warn, this.col.bolt, 1.5);
  }
  strike(x, z) {
    const L = HAZARDS.lightning, run = this.run, P = run.player;
    if ((P.x - x) ** 2 + (P.z - z) ** 2 < (L.radius + P.radius * 0.5) ** 2) P.hurt(L.dmg * run.dmgMul());
    const dmg = L.foeHit * ENEMIES.husk.hp * run.hpMul();
    run.enemies.query(x, z, L.radius, (e) => { if (e.type !== 'boss' && !e.ev && e.active) run.enemies.damage(e, dmg, BOLT); });
    const c = this.spark, n = Math.round(30 * run.particles.budget);
    for (let k = 0; k < n; k++) run.particles.emit(x + (Math.random() - 0.5) * 0.5, Math.random() * 9, z + (Math.random() - 0.5) * 0.5, 0, 1 + Math.random() * 2, 0, 0.35, 0.45, 0.05, c[0], c[1], c[2], 1);
    run.particles.burst(x, 0.3, z, 22, c, { speed: 6, life: 0.4, size: 0.5, up: 0.8 });
    run.fx.light(x, z, 8, 2.6, this.col.bolt, 0.25);
    run.fx.shockwave(x, z, L.radius * 1.4, 0x8fd8ff, 0.3, 0.1);
    const d2 = (P.x - x) ** 2 + (P.z - z) ** 2;
    if (d2 < 196) { run.fx.shake(0.15 + 0.2 * (1 - Math.sqrt(d2) / 14)); run.audio.sfx('boss_slam', { volume: 0.4, pitch: 1.9 }); }
  }

  /** Gravity wells: each gathers, then pulls the Shepherd (and the horde) toward its core; the core hurts once a pulse. */
  updateWells(dt) {
    const G = HAZARDS.gravity, run = this.run, P = run.player, C = G.cell;
    const cx0 = Math.floor(P.x / C), cz0 = Math.floor(P.z / C);
    let n = 0;
    for (let cx = cx0 - 2; cx <= cx0 + 2; cx++) {
      for (let cz = cz0 - 2; cz <= cz0 + 2; cz++) {
        if (!wellAt(cx, cz)) continue;
        const x = _well.x, z = _well.z;
        const period = G.period[0] + hash2(cx, cz, 64) * (G.period[1] - G.period[0]), off = hash2(cx, cz, 65) * period;
        const u = (this.time + off) % period, prev = (this.time - dt + off) % period;
        const pullAt = period - G.pull, warnAt = pullAt - G.warn;
        const W = this.wells[n++];
        W.x = x; W.z = z;
        W.warn = u >= warnAt && u < pullAt ? (u - warnAt) / G.warn : u >= pullAt ? 1 : 0;
        W.pull = u >= pullAt ? 1 : 0;
        const crossed = prev <= u ? prev < pullAt && pullAt <= u : prev < pullAt || pullAt <= u;
        const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz);
        if (crossed && d < G.coreR + P.radius * 0.5) P.hurt(G.dmg * run.dmgMul());
        if (crossed && d < 18) run.audio.sfx('summon', { volume: 0.3, pitch: 0.5 });
        if (!W.pull) continue;
        if (d < G.radius && d > 0.3) { const f = G.strength * (1 - d / G.radius) * dt; P.x += (dx / d) * f; P.z += (dz / d) * f; }
        run.enemies.query(x, z, G.radius, (e) => {
          if (e.type === 'boss' || e.ev) return;
          const ex = x - e.x, ez = z - e.z, ed = Math.hypot(ex, ez);
          if (ed > 0.4) { const f = G.strength * 0.8 * (1 - ed / G.radius) * dt; e.x += (ex / ed) * f; e.z += (ez / ed) * f; }
        });
        if (Math.random() < 0.5) {
          const a = Math.random() * 6.283, rr = G.radius * (0.4 + Math.random() * 0.6), v = this.violet;
          run.particles.emit(x + Math.cos(a) * rr, 0.2, z + Math.sin(a) * rr, -Math.cos(a) * rr * 1.2, 0.4, -Math.sin(a) * rr * 1.2, 0.6, 0.3, 0.05, v[0], v[1], v[2], 0.9, 0, 0);
        }
      }
    }
    this.nw = n;
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

  /** True when a circle (x, z, r) touches no vent, ice patch, burning ground or pending grab (run-event placement). */
  isClear(x, z, r) {
    const M = this.mods;
    if (M.vents) {
      const V = HAZARDS.vents, cx0 = Math.floor(x / V.cell), cz0 = Math.floor(z / V.cell);
      for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) for (let cz = cz0 - 1; cz <= cz0 + 1; cz++) {
        if (ventAt(cx, cz) && (x - _vent.x) ** 2 + (z - _vent.z) ** 2 < (r + V.radius) ** 2) return false;
      }
    }
    if (M.ice) { // the centre, 16 points on the rim and 8 halfway in: a patch can't slip between them
      if (this.iceAt(x, z)) return false;
      for (let k = 0; k < 24; k++) { const a = k < 16 ? k * 0.3927 : k * 0.785, rr = k < 16 ? r : r * 0.5; if (this.iceAt(x + Math.cos(a) * rr, z + Math.sin(a) * rr)) return false; }
    }
    for (const b of this.burns) if ((x - b.x) ** 2 + (z - b.z) ** 2 < (r + b.r) ** 2) return false;
    if (M.tide && this.inPatch('tide', x, z, r)) return false;
    if (M.brambles && this.inPatch('brambles', x, z, r)) return false;
    for (const c of this.clouds) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (r + c.r) ** 2) return false;
    if (M.gravity) {
      const G = HAZARDS.gravity, cx0 = Math.floor(x / G.cell), cz0 = Math.floor(z / G.cell);
      for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) for (let cz = cz0 - 1; cz <= cz0 + 1; cz++) {
        if (wellAt(cx, cz) && (x - _well.x) ** 2 + (z - _well.z) ** 2 < (r + G.radius * 0.6) ** 2) return false;
      }
    }
    const g = this.grab;
    return !(g.on && (x - g.x) ** 2 + (z - g.z) ** 2 < (r + HAZARDS.hands.radius) ** 2);
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
    this.updateRealms(dt);
  }

  updateVents(dt) {
    const V = HAZARDS.vents, run = this.run, P = run.player, C = V.cell;
    const cx0 = Math.floor(P.x / C), cz0 = Math.floor(P.z / C);
    let n = 0;
    for (let cx = cx0 - 2; cx <= cx0 + 2; cx++) {
      for (let cz = cz0 - 2; cz <= cz0 + 2; cz++) {
        if (!ventAt(cx, cz)) continue;
        const x = _vent.x, z = _vent.z;
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
  put(kind, x, z, rx, rz, rot, p, alpha, extra, col, reach = 0) {
    if (this.n >= MAX) return;
    const P = this.run.player;
    if ((x - P.x) ** 2 + (z - P.z) ** 2 > (26 + reach) ** 2) return;
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
    // Update 13's realms: tide pools and brambles (grid), laid patches, miasma clouds and gravity wells
    for (const kind of ['tide', 'brambles']) {
      if (!this.mods[kind]) continue;
      const C = HAZARDS[kind].cell, cx0 = Math.floor(P.x / C), cz0 = Math.floor(P.z / C), K = kind === 'tide' ? K_TIDE : K_BRAMBLE, col = kind === 'tide' ? this.col.tide : this.col.bramble;
      for (let cx = cx0 - 2; cx <= cx0 + 2; cx++) for (let cz = cz0 - 2; cz <= cz0 + 2; cz++) if (this.patch(kind, cx, cz)) this.put(K, _pt.x, _pt.z, _pt.r, _pt.r, _pt.seed * 6.283, 0, 1, _pt.seed, col);
    }
    for (const t of this.trails) {
      const fade = Math.min(1, t.t * 4) * Math.min(1, (t.life - t.t) * 1.5);
      if (t.kind === 'tide') this.put(K_TIDE, t.x, t.z, t.r, t.r, 0, 0, fade, t.seed, this.col.tide);
      else if (t.kind === 'bramble') this.put(K_BRAMBLE, t.x, t.z, t.r, t.r, t.seed * 6.283, 0, fade, t.seed, this.col.bramble);
      else this.put(K_MIASMA, t.x, t.z, t.r, t.r, 0, 0, fade, t.seed, this.col.miasma);
    }
    for (const c of this.clouds) { const f = this.cloudFade(c); this.put(K_MIASMA, c.x, c.z, c.r, c.r, 0, 0, f, c.seed, this.col.miasma); }
    const Gr = HAZARDS.gravity;
    for (let i = 0; i < this.nw; i++) { const W = this.wells[i]; this.put(K_WELL, W.x, W.z, Gr.radius, Gr.radius, 0, W.warn, 1, W.pull, this.col.well); }
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
    const F = this.run.weapons.flames, wc = this.col.witch;
    for (let i = 0; i < F.length; i++) {
      const f = F[i], fade = Math.min(1, f.t * 6) * Math.min(1, (f.life - f.t) * 2);
      this.put(K_WITCH, f.x, f.z, f.r * 1.1, f.r * 1.1, f.seed * 6.283, 0, fade, f.seed, wc);
    }
    for (const b of this.burns) {
      const fade = Math.min(1, b.t * 6) * Math.min(1, (b.life - b.t) * 2);
      this.put(K_BURN, b.x, b.z, b.r * 1.1, b.r * 1.1, 0, 0, fade, b.seed, W);
    }
    for (const t of this.teles) {
      const p = Math.min(1, t.t / t.dur), R = t.kind === K_CIRCLE ? t.r * Math.max(1, t.arc) : t.r;
      this.put(t.kind, t.x, t.z, R, R, t.rot, p, Math.min(1, t.t * 8 + 0.3), t.arc, t.col);
    }
    for (const L of this.lines) this.put(K_LINE, L.x, L.z, L.w, L.len / 2, L.rot, L.p, 1, L.live, L.col, L.len / 2 + 2); // refilled every simulation step (Enemies.update clears them), so they hold through a pause
    this.mesh.count = this.n;
    if (this.n) { this.mesh.instanceMatrix.needsUpdate = true; this.iData.needsUpdate = true; this.iCol.needsUpdate = true; }
    this.mat.uniforms.uTime.value = this.time;
  }

  dispose() {
    this.mesh.geometry.dispose(); this.mat.dispose();
    this.post.uVignette.value = this.post.uVignette.base;
  }
}
