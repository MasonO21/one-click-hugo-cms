/**
 * Festival — the camp dressed up while a Colony Spirit festival runs (sim/colony/spirit.ts): a ring of timber posts
 * round the gathering with sagging strings of warm bulbs and paper lanterns, a soft firelight pool on the ground,
 * and embers and slow warm motes rising from the fire. Grown-up and cozy: amber, cream and deep red, no confetti.
 *
 * Cost: one merged mesh on the shared slot-aware material (the bulbs and lanterns are its glow slot, so they light
 * up at night like windows), one additive ground quad, and a few pooled glow particles a second (fewer on low
 * quality, none when the festival is out of view). No extra scene lights (that would recompile every material).
 * The mesh is built once when a festival starts and disposed when it ends; nothing is allocated per frame.
 */
import * as THREE from 'three';
import { GeoBuilder, SLOT_GLOW, type PrimOpts } from '../core/GeoBuilder';
import type { RenderContext } from '../core/context';
import { inView } from '../core/context';
import { cellOf } from '../../core/constants';

const POST = '#7a5434';
const POST_HI = '#a87a4e';
const BRASS = '#b08a3e';
const ROPE = '#3a2c24';
const BULB_A = '#ffc46a';
const BULB_B = '#ffe2b0';
const LANTERNS = ['#ffb35a', '#d8553e', '#ffe2b0'];
/** Bunting for daylight: brick, amber, teal and cream (no candy colours). */
const PENNANTS = ['#b84a36', '#e2a542', '#3f8580', '#eadcbc'];
const POST_H = 2.7;
const P = (o: PrimOpts): PrimOpts => o;

/** Seconds the dressing takes to rise / settle. */
const GROW = 0.8;
/** Ember and mote spawn rates per second at full budget. */
const EMBERS = 7;
const MOTES = 2.2;

const _glowCol = new THREE.Color('#ffb066');

/** A paper lantern hanging from (x, y, z). */
function lantern(b: GeoBuilder, x: number, y: number, z: number, col: string, r: number): void {
  b.cyl(0.01, 0.01, 0.14, x, y - 0.07, z, ROPE, 3);
  b.cyl(r * 0.55, r * 0.6, 0.05, x, y - 0.16, z, '#2e2420', 6);
  b.lathe([r * 0.55, 0, r * 0.95, r * 0.45, r, r * 0.9, r * 0.9, r * 1.4, r * 0.55, r * 1.75], x, y - 0.18 - r * 1.75, z, col, 8, P({ slot: SLOT_GLOW }));
  b.cyl(r * 0.5, r * 0.55, 0.04, x, y - 0.2 - r * 1.75, z, '#2e2420', 6);
}

/** A sagging string from a to b (local coords) with warm bulbs and a few lanterns. */
function strand(b: GeoBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, seed: number): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const sag = Math.min(0.75, 0.18 + len * 0.09);
  const pts: number[] = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * sag, z0 + (z1 - z0) * t);
  }
  b.pipe(pts, 0.018, ROPE, 3, false);
  // bunting hangs in the strand's vertical plane
  const ry = Math.atan2(-(z1 - z0), x1 - x0);
  const n = Math.max(6, Math.round(len * 2.2));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * sag;
    const z = z0 + (z1 - z0) * t;
    // bulb, pennant, bulb, paper lantern ... : warm points of light at night, colour by day
    const k = (i + seed) % 4;
    if (k === 1) b.wedge(0.24, 0.3, 0.02, x, y - 0.02, z, PENNANTS[(i + seed * 3) % PENNANTS.length], P({ rz: Math.PI, ry }));
    else if (k === 3) lantern(b, x, y, z, LANTERNS[(i + seed) % LANTERNS.length], 0.15);
    else b.puff(0.065, x, y - 0.08, z, k === 0 ? BULB_A : BULB_B, 0, P({ slot: SLOT_GLOW, sy: 1.25 }));
  }
}

/** A soft round firelight texture (white centre to transparent edge; tinted by the material colour). */
function glowTexture(): THREE.Texture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.min(1, Math.hypot(dx, dy) * 2);
      const a = Math.pow(1 - r, 1.8);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

export class Festival {
  private readonly group = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private readonly glow: THREE.Mesh;
  private readonly glowMat: THREE.MeshBasicMaterial;
  /** Festival the dressing was built for (state.spirit.festivals), -1 = none. */
  private builtFor = -1;
  private cx = 0;
  private cy = 0;
  private cz = 0;
  private radius = 5;
  /** 0..1 rise / settle. */
  private k = 0;
  private emberAcc = 0;
  private moteAcc = 0;

  constructor(private readonly ctx: RenderContext) {
    this.group.visible = false;
    ctx.scene.add(this.group);
    this.glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: _glowCol, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0 });
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.rotateX(-Math.PI / 2);
    this.glow = new THREE.Mesh(quad, this.glowMat);
    this.glow.renderOrder = 2;
    this.glow.frustumCulled = false;
    this.group.add(this.glow);
  }

  update(dt: number): void {
    const ctx = this.ctx;
    const st = ctx.game.state;
    const sp = st.spirit;
    const active = !!sp && sp.festivalUntil > st.playTime;
    if (active && this.builtFor !== sp.festivals) this.build();
    const target = active ? 1 : 0;
    this.k += Math.sign(target - this.k) * Math.min(Math.abs(target - this.k), dt / GROW);
    if (!active && this.k <= 0) {
      if (this.mesh) this.teardown();
      this.group.visible = false;
      return;
    }
    if (!this.mesh) return;
    const env = ctx.env;
    const seen = inView(env, this.cx, this.cz, this.radius + 10);
    this.group.visible = seen;
    if (!seen) return;
    // the dressing rises out of the ground (and sinks back when the festival ends)
    const e = this.k * this.k * (3 - 2 * this.k);
    this.mesh.scale.set(1, Math.max(0.001, e), 1);
    const night = env.night;
    const flicker = 0.9 + Math.sin(env.t * 9.1) * 0.06 + Math.sin(env.t * 17.3) * 0.04;
    this.glowMat.opacity = e * (0.16 + 0.5 * night) * flicker;
    if (!active) return;
    // embers from the fire, slow warm motes drifting up round the ring (fewer on low quality)
    const p = ctx.particles;
    const budget = env.quality === 'low' ? 0.4 : env.quality === 'high' ? 1.2 : 1;
    this.emberAcc += dt * EMBERS * budget;
    while (this.emberAcc >= 1) {
      this.emberAcc -= 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.35;
      p.emit('glow', this.cx + Math.cos(a) * r, this.cy + 0.5, this.cz + Math.sin(a) * r, (Math.random() - 0.5) * 0.5, 1.6 + Math.random() * 1.4, (Math.random() - 0.5) * 0.5, 1.2 + Math.random() * 0.9, 0.09 + Math.random() * 0.08, Math.random() < 0.6 ? '#ffb04a' : '#ffd890', { drag: 0.6 });
    }
    this.moteAcc += dt * MOTES * budget;
    while (this.moteAcc >= 1) {
      this.moteAcc -= 1;
      const a = Math.random() * Math.PI * 2;
      const r = this.radius * (0.45 + Math.random() * 0.6);
      p.emit('glow', this.cx + Math.cos(a) * r, this.cy + 1.2 + Math.random() * 1.2, this.cz + Math.sin(a) * r, (Math.random() - 0.5) * 0.2, 0.35 + Math.random() * 0.3, (Math.random() - 0.5) * 0.2, 2.6 + Math.random() * 1.6, 0.07 + Math.random() * 0.05, '#ffcf8a', { drag: 0.2, curve: 'grow' });
    }
  }

  /** Posts on free ground round the gathering, strung together in a ring. */
  private build(): void {
    const ctx = this.ctx;
    const game = ctx.game;
    const sp = game.state.spirit;
    if (this.mesh) this.teardown();
    this.builtFor = sp.festivals;
    this.cx = sp.fx;
    this.cz = sp.fz;
    this.cy = ctx.heightAt(this.cx, this.cz);
    // the ring sits just outside where the crowd stands (the more colonists, the wider)
    const n = Math.max(1, game.state.colonists.list.length);
    const crowd = 1.1 + Math.sqrt(n / Math.PI) * 1.05;
    const R = Math.max(4.2, Math.min(11, crowd + 2.2));
    this.radius = R;
    const posts = Math.max(6, Math.min(12, Math.round((Math.PI * 2 * R) / 3.6)));
    const bs = game.sys.buildings;
    const b = new GeoBuilder(sp.festivals * 31 + 7);
    const pts: number[] = [];
    for (let i = 0; i < posts; i++) {
      // nudge each post off buildings: try its own angle first, then a little either side
      const base = (i / posts) * Math.PI * 2 + 0.2;
      let px = NaN;
      let pz = NaN;
      for (const d of [0, 0.12, -0.12, 0.24, -0.24]) {
        for (const rr of [R, R + 0.8, R - 0.8]) {
          const x = this.cx + Math.cos(base + d) * rr;
          const z = this.cz + Math.sin(base + d) * rr;
          if (!bs.blocked(cellOf(x), cellOf(z), 'colonist')) {
            px = x;
            pz = z;
            break;
          }
        }
        if (Number.isFinite(px)) break;
      }
      if (!Number.isFinite(px)) continue;
      const lx = px - this.cx;
      const lz = pz - this.cz;
      const ly = ctx.heightAt(px, pz) - this.cy;
      b.cyl(0.07, 0.095, POST_H, lx, ly + POST_H / 2, lz, POST, 6, P({ grad: POST_HI }));
      b.cyl(0.11, 0.11, 0.06, lx, ly + POST_H + 0.02, lz, BRASS, 6);
      b.cyl(0.16, 0.2, 0.14, lx, ly + 0.07, lz, '#857e7a', 6);
      pts.push(lx, ly + POST_H - 0.08, lz);
    }
    const m = pts.length / 3;
    for (let i = 0; i < m && m > 1; i++) {
      const j = (i + 1) % m;
      if (m === 2 && i === 1) break;
      strand(b, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2], pts[j * 3], pts[j * 3 + 1], pts[j * 3 + 2], i);
    }
    if (b.isEmpty) return;
    const mesh = new THREE.Mesh(b.build(), ctx.mats.litPlain);
    mesh.position.set(this.cx, this.cy, this.cz);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.mesh = mesh;
    this.group.add(mesh);
    // a little above the ground: the terrain mesh rides a touch above the height sampler round the camp
    this.glow.position.set(this.cx, this.cy + 0.4, this.cz);
    this.glow.scale.set(R * 2.4, 1, R * 2.4);
    this.group.visible = true;
  }

  private teardown(): void {
    if (!this.mesh) return;
    this.group.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh = null;
    this.builtFor = -1;
    this.glowMat.opacity = 0;
  }

  dispose(): void {
    this.teardown();
    this.glow.geometry.dispose();
    this.glowMat.map?.dispose();
    this.glowMat.dispose();
    this.ctx.scene.remove(this.group);
  }
}
