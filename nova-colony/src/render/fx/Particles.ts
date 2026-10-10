/**
 * Particles — three pooled InstancedMesh systems (3 draw calls total):
 *   soft  : lit round puffs (an 80-face icosphere; 20 faces on low) for dust, smoke, wood chips, goo, leaves (fade by shrinking)
 *   glow  : additive octahedra for sparks, fire, magic motes (fade by darkening)
 *   flash : additive spheres for explosion fireballs, muzzle flashes and shield ripples
 * Structure-of-arrays storage, swap-remove, zero allocations per frame.
 */
import * as THREE from 'three';
import { Batch, composeEuler } from '../core/Batch';
import type { Materials } from '../core/materials';
import type { Quality } from '../core/context';

export type PoolName = 'soft' | 'glow' | 'flash';

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
  constructor(public readonly cap: number, public readonly batch: Batch, public readonly additive: boolean) {
    const f = () => new Float32Array(cap);
    this.x = f(); this.y = f(); this.z = f(); this.vx = f(); this.vy = f(); this.vz = f();
    this.life = f(); this.max = f(); this.size = f(); this.r = f(); this.g = f(); this.b = f();
    this.grav = f(); this.drag = f(); this.spin = f();
    this.curve = new Uint8Array(cap);
  }
}

const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const _tmp = new THREE.Color();

export interface EmitOpts {
  gravity?: number;
  drag?: number;
  curve?: 'shrink' | 'smoke' | 'grow';
  spin?: number;
}

export class Particles {
  private pools: Record<PoolName, Pool>;
  private group = new THREE.Group();
  private budget = 1;

  constructor(scene: THREE.Scene, mats: Materials, quality: Quality) {
    scene.add(this.group);
    const caps = quality === 'low' ? [320, 320, 40] : quality === 'high' ? [1100, 1100, 120] : [720, 720, 90];
    // round puffs, not cubes: smoke and dust read soft like the painted world (cubes looked like dark blocks floating);
    // low quality keeps a 20-face puff (60 vertices, about the cost of a cube's 24 twice over)
    const softGeo = new THREE.IcosahedronGeometry(quality === 'low' ? 0.62 : 0.6, quality === 'low' ? 0 : 1);
    const glowGeo = new THREE.OctahedronGeometry(0.6, 0);
    const flashGeo = new THREE.SphereGeometry(1, 10, 7);
    this.pools = {
      soft: new Pool(caps[0], new Batch(this.group, softGeo, mats.particleSoft, caps[0], { color: true }), false),
      glow: new Pool(caps[1], new Batch(this.group, glowGeo, mats.particleGlow, caps[1], { color: true, renderOrder: 10 }), true),
      flash: new Pool(caps[2], new Batch(this.group, flashGeo, mats.particleGlow, caps[2], { color: true, renderOrder: 11 }), true),
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
      this.emit('soft', x + Math.cos(a) * r, y + 0.1, z + Math.sin(a) * r, Math.cos(a) * 1.5, 1 + Math.random() * 1.5, Math.sin(a) * 1.5, 0.5 + Math.random() * 0.5, 0.25 + Math.random() * 0.3, color, { gravity: -2, drag: 2, curve: 'smoke' });
    }
  }

  smoke(x: number, y: number, z: number, size = 0.5, color: THREE.Color | string = '#6b6b70', life = 1.8): void {
    this.emit('soft', x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4, 0.9 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4, life, size, color, { drag: 0.4, curve: 'smoke', spin: 1 });
  }

  steam(x: number, y: number, z: number): void {
    this.smoke(x, y, z, 0.35, '#dfe8ef', 1.1);
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
    for (const name of ['soft', 'glow', 'flash'] as PoolName[]) {
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
            p.grav[i] = p.grav[l]; p.drag[i] = p.drag[l]; p.curve[i] = p.curve[l]; p.spin[i] = p.spin[l];
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
        composeEuler(_m, p.x[i], p.y[i], p.z[i], sp * 0.7 + i, sp + i * 1.3, sp * 0.4, s, s, s);
        batch.push(_m, _tmp);
        i++;
      }
      batch.end();
    }
  }

  dispose(): void {
    for (const p of Object.values(this.pools)) p.batch.dispose();
    this.group.removeFromParent();
  }
}
