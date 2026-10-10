/**
 * Particles — four pooled InstancedMesh systems (4 draw calls total):
 *   soft  : lit round pieces (an 80-face icosphere; 20 faces on low) for wood chips, goo, confetti (fade by shrinking)
 *   wisp  : camera-facing soft sprites (2 triangles each) for smoke, steam and dust: a lumpy round puff that is
 *           see-through at its edge and fades in and out, so chimneys trail wisps instead of stacked solid balls
 *   glow  : additive octahedra for sparks, fire, magic motes (fade by darkening)
 *   flash : additive spheres for explosion fireballs, muzzle flashes and shield ripples
 * Structure-of-arrays storage, swap-remove, zero allocations per frame.
 */
import * as THREE from 'three';
import { Batch, composeEuler } from '../core/Batch';
import type { Materials } from '../core/materials';
import type { Quality } from '../core/context';

export type PoolName = 'soft' | 'wisp' | 'glow' | 'flash';

/**
 * The wisp sprite: each instance's origin goes to view space and the quad spreads in view XY by the instance's scale,
 * turned by its Z angle (both read back from the instance matrix), so it always faces the camera. The puff is a soft
 * disc with a gently lumpy edge, shaded a little lighter on top; aFade (0 .. 1) is its fade-out, the night dims it.
 */
const WISP_VERT = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute float aFade;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vShade;
  void main() {
    vUv = uv;
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #else
      vColor = vec3(1.0);
    #endif
    vAlpha = 1.0 - aFade;
    vec3 col0 = instanceMatrix[0].xyz;
    float s = length(col0);
    float ang = atan(col0.y, col0.x);
    vec2 q = vec2(cos(ang) * position.x - sin(ang) * position.y, sin(ang) * position.x + cos(ang) * position.y);
    vShade = q.y;
    vec4 mvPosition = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
    mvPosition.xy += q * s;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const WISP_FRAG = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uOpacity;
  uniform float uLight;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vShade;
  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    float a = atan(p.y, p.x);
    float lump = 0.07 * sin(a * 3.0 + 0.6) + 0.045 * sin(a * 5.0 + 2.1);
    float shape = 1.0 - smoothstep(0.3 + lump, 0.98 + lump * 0.5, r);
    float alpha = shape * vAlpha * uOpacity;
    if (alpha < 0.01) discard;
    vec3 c = vColor * uLight * (0.9 + 0.22 * vShade);
    gl_FragColor = vec4(c, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/** Size curve kinds. */
const CURVE_SHRINK = 0;
const CURVE_SMOKE = 1;
const CURVE_GROW = 2;

class Pool {
  n = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly life: Float32Array;
  readonly max: Float32Array;
  readonly size: Float32Array;
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  readonly grav: Float32Array;
  readonly drag: Float32Array;
  readonly curve: Uint8Array;
  readonly spin: Float32Array;
  /** Peak opacity (wisps). */
  readonly alpha: Float32Array;
  constructor(public readonly cap: number, public readonly batch: Batch, public readonly additive: boolean) {
    const f = () => new Float32Array(cap);
    this.x = f(); this.y = f(); this.z = f(); this.vx = f(); this.vy = f(); this.vz = f();
    this.life = f(); this.max = f(); this.size = f(); this.r = f(); this.g = f(); this.b = f();
    this.grav = f(); this.drag = f(); this.spin = f(); this.alpha = f();
    this.curve = new Uint8Array(cap);
  }
}

const _m = new THREE.Matrix4();
const POOLS: PoolName[] = ['soft', 'wisp', 'glow', 'flash'];
const _c = new THREE.Color();
const _tmp = new THREE.Color();

export interface EmitOpts {
  gravity?: number;
  drag?: number;
  curve?: 'shrink' | 'smoke' | 'grow';
  spin?: number;
  /** Peak opacity of a wisp (default 0.8). */
  alpha?: number;
}

export class Particles {
  private pools: Record<PoolName, Pool>;
  private group = new THREE.Group();
  private budget = 1;
  private readonly wispMat: THREE.ShaderMaterial;
  private readonly wispGeo: THREE.PlaneGeometry;

  constructor(scene: THREE.Scene, mats: Materials, quality: Quality) {
    scene.add(this.group);
    const caps = quality === 'low' ? [200, 320, 320, 40] : quality === 'high' ? [600, 900, 1100, 120] : [400, 640, 720, 90];
    // round pieces, not cubes (cubes read as dark blocks); low quality keeps a 20-face piece
    const softGeo = new THREE.IcosahedronGeometry(quality === 'low' ? 0.62 : 0.6, quality === 'low' ? 0 : 1);
    // a wisp's quad is wider than the old puff's sphere (0.6 radius): its edge is see-through
    this.wispGeo = new THREE.PlaneGeometry(1.7, 1.7);
    this.wispMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uOpacity: { value: 1 }, uLight: { value: 1 } }]),
      vertexShader: WISP_VERT,
      fragmentShader: WISP_FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    const glowGeo = new THREE.OctahedronGeometry(0.6, 0);
    const flashGeo = new THREE.SphereGeometry(1, 10, 7);
    this.pools = {
      soft: new Pool(caps[0], new Batch(this.group, softGeo, mats.particleSoft, caps[0], { color: true }), false),
      wisp: new Pool(caps[1], new Batch(this.group, this.wispGeo, this.wispMat, caps[1], { color: true, fade: true, renderOrder: 9, name: 'wisps' }), false),
      glow: new Pool(caps[2], new Batch(this.group, glowGeo, mats.particleGlow, caps[2], { color: true, renderOrder: 10 }), true),
      flash: new Pool(caps[3], new Batch(this.group, flashGeo, mats.particleGlow, caps[3], { color: true, renderOrder: 11 }), true),
    };
    this.budget = quality === 'low' ? 0.5 : 1;
  }

  /** Fraction of requested particles actually spawned (quality scaling). */
  get scale(): number {
    return this.budget;
  }

  /** Adjust the spawn budget at runtime (pool capacities stay as allocated). */
  setQuality(quality: Quality): void {
    this.budget = quality === 'low' ? 0.5 : quality === 'high' ? 1.2 : 1;
  }

  emit(pool: PoolName, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: THREE.Color | string | number, opts?: EmitOpts): void {
    const p = this.pools[pool];
    if (p.n >= p.cap) return;
    const i = p.n++;
    p.x[i] = x; p.y[i] = y; p.z[i] = z;
    p.vx[i] = vx; p.vy[i] = vy; p.vz[i] = vz;
    p.life[i] = life; p.max[i] = life; p.size[i] = size;
    if (typeof color === 'object') _c.copy(color);
    else _c.set(color);
    p.r[i] = _c.r; p.g[i] = _c.g; p.b[i] = _c.b;
    p.grav[i] = opts?.gravity ?? 0;
    p.drag[i] = opts?.drag ?? 0;
    p.spin[i] = opts?.spin ?? 0;
    p.curve[i] = opts?.curve === 'smoke' ? CURVE_SMOKE : opts?.curve === 'grow' ? CURVE_GROW : CURVE_SHRINK;
    p.alpha[i] = opts?.alpha ?? 0.8;
  }

  /** Number of particles for a request after quality scaling (at least 1 when n > 0). */
  count(n: number): number {
    return n <= 0 ? 0 : Math.max(1, Math.round(n * this.budget));
  }

  // ------------------------------------------------------------------ recipes

  /** Dust puff on the ground (placement, footsteps, burrowing). */
  dust(x: number, y: number, z: number, n = 10, radius = 1, color: THREE.Color | string = '#c9b48c'): void {
    for (let i = 0, k = this.count(n); i < k; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      this.emit('wisp', x + Math.cos(a) * r, y + 0.1, z + Math.sin(a) * r, Math.cos(a) * 1.5, 1 + Math.random() * 1.5, Math.sin(a) * 1.5, 0.5 + Math.random() * 0.5, 0.25 + Math.random() * 0.3, color, { gravity: -2, drag: 2, curve: 'smoke', alpha: 0.7, spin: 0.6 });
    }
  }

  smoke(x: number, y: number, z: number, size = 0.5, color: THREE.Color | string = '#6b6b70', life = 1.8, alpha = 0.78): void {
    this.emit('wisp', x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4, 0.9 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4, life, size, color, { drag: 0.4, curve: 'smoke', spin: 0.5, alpha });
  }

  steam(x: number, y: number, z: number): void {
    this.smoke(x, y, z, 0.35, '#eef3f6', 1.1, 0.55);
  }

  /** Night dims the wisps (they are unlit: smoke and dust would otherwise glow in the dark). 0 = day, 1 = night. */
  setNight(night: number): void {
    this.wispMat.uniforms.uLight.value = 1 - night * 0.68;
  }

  fire(x: number, y: number, z: number, size = 0.35): void {
    this.emit('glow', x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 1.2 + Math.random(), (Math.random() - 0.5) * 0.3, 0.45 + Math.random() * 0.3, size, Math.random() < 0.5 ? '#ff9a2e' : '#ffd36b', { drag: 1 });
  }

  sparks(x: number, y: number, z: number, n = 8, color: THREE.Color | string = '#ffd36b', speed = 5): void {
    for (let i = 0, k = this.count(n); i < k; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const s = speed * (0.4 + Math.random() * 0.6);
      const rr = Math.sqrt(1 - u * u);
      this.emit('glow', x, y, z, Math.cos(a) * rr * s, u * s + 1.5, Math.sin(a) * rr * s, 0.3 + Math.random() * 0.4, 0.18 + Math.random() * 0.2, color, { gravity: -9, drag: 1.5 });
    }
  }

  /** Wood chips / stone shards flying off a gathered node. */
  chips(x: number, y: number, z: number, color: THREE.Color | string, n = 7): void {
    for (let i = 0, k = this.count(n); i < k; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 3;
      this.emit('soft', x, y, z, Math.cos(a) * s, 3 + Math.random() * 3, Math.sin(a) * s, 0.6 + Math.random() * 0.4, 0.14 + Math.random() * 0.14, color, { gravity: -14, drag: 0.5, spin: 6 });
    }
  }

  /** Alien goo splatter. */
  goo(x: number, y: number, z: number, color: THREE.Color | string, n = 14): void {
    for (let i = 0, k = this.count(n); i < k; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 4;
      this.emit('soft', x, y + 0.5, z, Math.cos(a) * s, 2 + Math.random() * 5, Math.sin(a) * s, 0.5 + Math.random() * 0.6, 0.18 + Math.random() * 0.3, color, { gravity: -16, drag: 0.3 });
    }
  }

  /** Celebration sparkles rising from a point. */
  sparkles(x: number, y: number, z: number, color: THREE.Color | string = '#fff0a0', n = 20, radius = 1.5): void {
    for (let i = 0, k = this.count(n); i < k; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      this.emit('glow', x + Math.cos(a) * r, y + Math.random() * 1.5, z + Math.sin(a) * r, (Math.random() - 0.5) * 0.8, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 0.8, 0.8 + Math.random() * 0.8, 0.16 + Math.random() * 0.2, color, { drag: 0.8, curve: 'grow' });
    }
  }

  /** Confetti burst (mixed colors). */
  confetti(x: number, y: number, z: number, n = 30): void {
    const colors = ['#ff6f91', '#ffd84a', '#5ef2ff', '#7cc36b', '#b48cff', '#ff9e5e'];
    for (let i = 0, k = this.count(n); i < k; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 4;
      this.emit('soft', x, y, z, Math.cos(a) * s, 5 + Math.random() * 5, Math.sin(a) * s, 1.2 + Math.random() * 0.8, 0.16 + Math.random() * 0.12, colors[i % colors.length], { gravity: -6, drag: 1.2, spin: 8 });
    }
  }

  /** Short additive flash sphere (muzzle flash, impact). */
  flash(x: number, y: number, z: number, size: number, color: THREE.Color | string, life = 0.15): void {
    this.emit('flash', x, y, z, 0, 0, 0, life, size, color, { curve: 'grow' });
  }

  /** Explosion scaled by radius (world units). */
  explosion(x: number, y: number, z: number, radius: number): void {
    const r = Math.max(0.6, radius);
    this.flash(x, y + 0.3, z, r * 1.4, '#ffb15c', 0.22);
    this.flash(x, y + 0.3, z, r * 0.7, '#fff6d0', 0.12);
    this.sparks(x, y + 0.3, z, 10 + r * 6, '#ffb347', 5 + r * 2);
    // Smoke stays small and light: a late-game battery of splash turrets fires several shells a second, and
    // big dark lit cubes piled up into a "rock heap" that hid the very aliens being shot.
    const sr = Math.min(r, 3);
    for (let i = 0, k = this.count(2 + sr * 1.5); i < k; i++) this.smoke(x + (Math.random() - 0.5) * r, y + 0.4, z + (Math.random() - 0.5) * r, 0.25 + sr * 0.12, '#9a93a0', 0.7 + Math.random() * 0.6);
    for (let i = 0, k = this.count(5 + r * 3); i < k; i++) this.fire(x + (Math.random() - 0.5) * r * 0.6, y + 0.2, z + (Math.random() - 0.5) * r * 0.6, 0.3 + r * 0.15);
  }

  /** Expanding ring made of sparks (shield ripple, tier up). */
  ring(x: number, y: number, z: number, radius: number, color: THREE.Color | string, n = 24): void {
    for (let i = 0, k = this.count(n); i < k; i++) {
      const a = (i / k) * Math.PI * 2;
      this.emit('glow', x + Math.cos(a) * radius * 0.3, y, z + Math.sin(a) * radius * 0.3, Math.cos(a) * radius * 2.2, 0.6, Math.sin(a) * radius * 2.2, 0.55, 0.22, color, { drag: 2.5 });
    }
  }

  // ------------------------------------------------------------------ update

  update(dt: number): void {
    const wisp = this.pools.wisp;
    for (const name of POOLS) {
      const p = this.pools[name];
      const batch = p.batch;
      batch.begin();
      let i = 0;
      while (i < p.n) {
        p.life[i] -= dt;
        if (p.life[i] <= 0) {
          // swap-remove
          const l = --p.n;
          if (i !== l) {
            p.x[i] = p.x[l]; p.y[i] = p.y[l]; p.z[i] = p.z[l];
            p.vx[i] = p.vx[l]; p.vy[i] = p.vy[l]; p.vz[i] = p.vz[l];
            p.life[i] = p.life[l]; p.max[i] = p.max[l]; p.size[i] = p.size[l];
            p.r[i] = p.r[l]; p.g[i] = p.g[l]; p.b[i] = p.b[l];
            p.grav[i] = p.grav[l]; p.drag[i] = p.drag[l]; p.curve[i] = p.curve[l]; p.spin[i] = p.spin[l]; p.alpha[i] = p.alpha[l];
          }
          continue;
        }
        const drag = 1 - Math.min(1, p.drag[i] * dt);
        p.vy[i] += p.grav[i] * dt;
        p.vx[i] *= drag; p.vy[i] *= drag; p.vz[i] *= drag;
        p.x[i] += p.vx[i] * dt;
        p.y[i] += p.vy[i] * dt;
        p.z[i] += p.vz[i] * dt;
        if (p.y[i] < 0.05 && p.grav[i] < 0) {
          p.y[i] = 0.05;
          p.vy[i] = 0;
          p.vx[i] *= 0.6;
          p.vz[i] *= 0.6;
        }
        const f = p.life[i] / p.max[i]; // 1 -> 0
        let s: number;
        const c = p.curve[i];
        if (c === CURVE_SMOKE) s = p.size[i] * (1.2 + (1 - f) * 1.6) * Math.min(1, f * 3);
        else if (c === CURVE_GROW) s = p.size[i] * (0.4 + (1 - f) * 1.3);
        else s = p.size[i] * Math.min(1, f * 1.4);
        if (p.additive) {
          const k = c === CURVE_GROW ? f * f : f;
          _tmp.setRGB(p.r[i] * k, p.g[i] * k, p.b[i] * k);
        } else _tmp.setRGB(p.r[i], p.g[i], p.b[i]);
        const sp = p.spin[i] * (p.max[i] - p.life[i]);
        if (p === wisp) {
          // a sprite: only its turn in the view plane matters (the shader reads it back from the matrix); it fades in
          // over its first tenth and out with its life, instead of shrinking away
          const age = 1 - f;
          const a = p.alpha[i] * Math.min(1, age * 10) * Math.min(1, f * 2.2);
          const sw = c === CURVE_SMOKE ? p.size[i] * (1 + age * 1.8) : s; // keeps swelling as it thins
          composeEuler(_m, p.x[i], p.y[i], p.z[i], 0, 0, sp + i * 2.4, sw, 1, 1);
          batch.push(_m, _tmp, 1 - a);
        } else {
          composeEuler(_m, p.x[i], p.y[i], p.z[i], sp * 0.7 + i, sp + i * 1.3, sp * 0.4, s, s, s);
          batch.push(_m, _tmp);
        }
        i++;
      }
      batch.end();
    }
  }

  dispose(): void {
    for (const p of Object.values(this.pools)) p.batch.dispose();
    this.wispMat.dispose();
    this.wispGeo.dispose();
    this.group.removeFromParent();
  }
}
