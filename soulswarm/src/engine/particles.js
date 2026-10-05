// GPU particle system. Each particle is spawned once (CPU writes its initial state) and then
// simulated entirely in the vertex shader from its age, so thousands of sparks cost almost nothing.
import * as THREE from 'three';
import { glowPointFrag } from './materials.js';

const vert = /* glsl */`
attribute vec3 aV;
attribute vec2 aT;    // spawn time, life
attribute vec2 aS;    // size start, size end
attribute vec4 aC;    // rgb, alpha
attribute vec2 aPh;   // drag, gravity
uniform float uTime;
uniform float uScale;
varying vec4 vColor;
void main() {
  float age = uTime - aT.x;
  float life = aT.y;
  if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vColor = vec4(0.0); return; }
  float k = aPh.x;
  float travel = k > 0.001 ? (1.0 - exp(-k * age)) / k : age;
  vec3 p = position + aV * travel;
  p.y += -0.5 * aPh.y * age * age;
  p.y = max(p.y, 0.03);
  float u = age / life;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = mix(aS.x, aS.y, u) * uScale / -mv.z;
  float fade = smoothstep(0.0, 0.08, u) * (1.0 - smoothstep(0.55, 1.0, u));
  vColor = vec4(aC.rgb, aC.a * fade);
}`;

export class Particles {
  constructor(max = 8000) {
    this.max = max;
    this.head = 0;
    this.time = 0;
    const g = new THREE.BufferGeometry();
    const mk = (n) => { const a = new THREE.BufferAttribute(new Float32Array(max * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.a = { position: mk(3), aV: mk(3), aT: mk(2), aS: mk(2), aC: mk(4), aPh: mk(2) };
    // mark all dead
    for (let i = 0; i < max; i++) { this.a.aT.array[i * 2] = -1e9; this.a.aT.array[i * 2 + 1] = 0; }
    for (const [k, v] of Object.entries(this.a)) g.setAttribute(k, v);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 400 } },
      vertexShader: vert, fragmentShader: glowPointFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 11;
    this.dirtyLo = Infinity; this.dirtyHi = -1;
    this.budget = 1; // quality scaler for emit counts
  }

  /** Spawn one particle. color is [r,g,b] linear (values >1 bloom). */
  emit(x, y, z, vx, vy, vz, life, size, sizeEnd, r, g, b, a = 1, drag = 0, grav = 0) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    const A = this.a;
    A.position.array[i * 3] = x; A.position.array[i * 3 + 1] = y; A.position.array[i * 3 + 2] = z;
    A.aV.array[i * 3] = vx; A.aV.array[i * 3 + 1] = vy; A.aV.array[i * 3 + 2] = vz;
    A.aT.array[i * 2] = this.time; A.aT.array[i * 2 + 1] = life;
    A.aS.array[i * 2] = size; A.aS.array[i * 2 + 1] = sizeEnd;
    A.aC.array[i * 4] = r; A.aC.array[i * 4 + 1] = g; A.aC.array[i * 4 + 2] = b; A.aC.array[i * 4 + 3] = a;
    A.aPh.array[i * 2] = drag; A.aPh.array[i * 2 + 1] = grav;
    if (i < this.dirtyLo) this.dirtyLo = i;
    if (i > this.dirtyHi) this.dirtyHi = i;
  }

  /** Radial burst. opts: {speed, spread(y), life, size, sizeEnd, drag, grav, up, count} */
  burst(x, y, z, count, col, o = {}) {
    count = Math.max(1, Math.round(count * this.budget));
    const speed = o.speed ?? 6, life = o.life ?? 0.6, size = o.size ?? 0.5, sizeEnd = o.sizeEnd ?? 0.05;
    const drag = o.drag ?? 3, grav = o.grav ?? 0, up = o.up ?? 0.4, jitter = o.jitter ?? 0.4;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      const vy = (Math.random() * up) * speed;
      const l = life * (1 - jitter + Math.random() * jitter);
      this.emit(x, y, z, Math.cos(a) * s, vy, Math.sin(a) * s, l, size * (0.6 + Math.random() * 0.6), sizeEnd, col[0], col[1], col[2], o.alpha ?? 1, drag, grav);
    }
  }

  /** Ring shockwave of particles. */
  ring(x, z, radius, count, col, o = {}) {
    count = Math.max(1, Math.round(count * this.budget));
    const speed = o.speed ?? radius * 2.5;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.1;
      this.emit(x + Math.cos(a) * 0.3, o.y ?? 0.25, z + Math.sin(a) * 0.3, Math.cos(a) * speed, 0, Math.sin(a) * speed,
        o.life ?? 0.45, o.size ?? 0.6, o.sizeEnd ?? 0.2, col[0], col[1], col[2], o.alpha ?? 1, o.drag ?? 2.5, 0);
    }
  }

  update(dt) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    if (this.dirtyHi >= 0) {
      for (const attr of Object.values(this.a)) {
        attr.clearUpdateRanges();
        attr.addUpdateRange(this.dirtyLo * attr.itemSize, (this.dirtyHi - this.dirtyLo + 1) * attr.itemSize);
        attr.needsUpdate = true;
      }
      this.dirtyLo = Infinity; this.dirtyHi = -1;
    }
  }
}

/** Convert a hex colour to a linear [r,g,b] multiplied by intensity (HDR for bloom). */
export function hdr(hex, k = 1) {
  const c = new THREE.Color(hex);
  return [c.r * k, c.g * k, c.b * k];
}
