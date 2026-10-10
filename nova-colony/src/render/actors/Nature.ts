/**
 * Nature actor — resource nodes (gen.nodes) and decorative props (gen.props).
 *
 * Culling: the world is bucketed into 8x8 spatial chunks (32x32 cells). On a rebuild every chunk's
 * AABB is tested against the camera frustum (expanded by a margin), the nodes/props of the surviving
 * chunks are tested individually (bounding sphere vs frustum + distance LOD), and only those are
 * written into one InstancedMesh per model and LOD. So the GPU only ever sees what is on screen (a
 * follow camera looks at a ~60-unit-deep trapezoid, not a 190-unit disc) while nature stays at
 * ~10–20 draw calls. Rebuilds happen when the camera moves a couple of units / turns a few degrees /
 * zooms, when a node depletes or respawns, when the terrain changes and as a 4 s safety refresh —
 * never per frame.
 *
 * Distance LOD per instance, without pops: inside `near - LOD_BAND` a node is drawn once from the
 * discard-free near batch ('n:'). Across the band it is drawn twice — near geometry in 'tn:' with the
 * `lodNear` material and far geometry in 'tf:' with `lodFar` — and the two shaders dither the pixels
 * between them with complementary Bayer windows from the instance's live distance to the focus, so
 * the cross-fade is continuous every frame (and invisible: the silhouettes overlap) while this actor
 * only decides batch membership at rebuild time (`lodClass`, with a margin covering the camera drift
 * between rebuilds plus hysteresis). Beyond the band a node is drawn once from the discard-free far
 * batch ('f:', `lodShrinkMid`), whose vertex shader sinks it into the ground over the band below the
 * mid cutoff instead of popping or stippling at the horizon; props (near only, `lodShrinkNear`)
 * sink away the same way over the band below the near radius.
 *
 * All nature batches use the materials with the softer foliage rim (`mats.nature` and the LOD
 * variants, see materials FOLIAGE_RIM): the same programs as the buildings, one uniform apart.
 *
 * Gather hits wobble the node and throw chips; depletion plays a shrink-pop before the node disappears.
 * Solid nodes standing between the camera and the player (or the build ghost) shrink out of the way
 * and grow back so trees and boulders never hide what matters.
 */
import * as THREE from 'three';
import type { RenderContext } from '../core/context';
import { sightTargets } from '../core/context';
import { Batch, composeEuler, type BatchOpts } from '../core/Batch';
import { ViewCull } from '../core/cull';
import { nodeGeometry, nodeGeometryFar, propGeometry, nodeHeight, nodeChipColor, nodeVariant, nodeLookAt } from '../models/nature';
import type { WorldGen, WorldNode } from '../../sim/world';
import { CELL, HALF_WORLD, WORLD_CELLS } from '../../core/constants';
import { clamp } from '../../core/math';

interface Wobble {
  t: number;
  pop: boolean;
}

interface Chunk {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  nodes: number[];
  props: number[];
}

export const CHUNK_CELLS = 32;
export const CHUNKS_PER_SIDE = WORLD_CELLS / CHUNK_CELLS;
const CHUNK_SIZE = CHUNK_CELLS * CELL;
/** Frustum planes are pushed outward by this much so nothing pops at the screen edge between rebuilds. */
const FRUSTUM_MARGIN = 9;
/** Camera movement (units) / turn (radians) / zoom (view-radius units) that triggers a rebuild. */
const REBUILD_MOVE = 1.5;
const REBUILD_TURN = 0.08;
const REBUILD_RADIUS = 1.5;
/** Width (units) of the near→far cross-fade band below the near radius, and of the fade-out band below mid. */
export const LOD_BAND = 8;
/**
 * Batch membership is decided at rebuild time but the shaders fade with the live camera, so the band
 * batches extend this far past the band: it covers the focus drift (REBUILD_MOVE) plus the near-radius
 * change (0.85 × REBUILD_RADIUS) that can happen before the next rebuild. (Rarer combined moves may
 * exceed it; the shader then catches up at the next rebuild with a small stipple step, never a pop.)
 */
export const LOD_MARGIN = 3;
/** Band membership sticks this far past its boundary so camera jitter does not churn batches. */
export const LOD_HYST = 2;
/** Vertical extent used for chunk boxes (terrain relief + tallest scaled tree). */
const CHUNK_Y_MIN = -40;
const CHUNK_Y_MAX = 60;

const _m = new THREE.Matrix4();
const _targets = new Float64Array(6);
/** How far an occluding node shrinks (fraction of its size). */
const OCCLUDER_SHRINK = 0.78;
/** Nodes this close to the player (≈ gather reach) are never treated as occluders. */
const OCCLUDER_KEEP_R = 4;
const NODE_OPTS: BatchOpts = { castShadow: true, receiveShadow: true, color: true };
const PROP_OPTS: BatchOpts = { receiveShadow: true, color: true };
/**
 * Per-instance tint for nodes and props (±9% value, a yellow-green / blue-green lean), picked by
 * index so a tree keeps its tint across LOD batches and rebuilds; a forest of one model stops
 * looking stamped out.
 */
const TINTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
  const a = (i / 12) * Math.PI * 2;
  const v = 1 + Math.sin(a) * 0.09;
  const warm = Math.cos(a * 1.7) * 0.06;
  return new THREE.Color(v * (1 + warm), v * (1 + warm * 0.3), v * (1 - warm));
});
export function natureTint(index: number): THREE.Color {
  return TINTS[((index * 2654435761 + 97) >>> 0) % TINTS.length];
}

/** Chunk index of a world position. */
export function chunkOf(x: number, z: number): number {
  const cx = clamp(Math.floor((x + HALF_WORLD) / CHUNK_SIZE), 0, CHUNKS_PER_SIDE - 1);
  const cz = clamp(Math.floor((z + HALF_WORLD) / CHUNK_SIZE), 0, CHUNKS_PER_SIDE - 1);
  return cz * CHUNKS_PER_SIDE + cx;
}

/**
 * LOD radii for the current view (near = nodes + props with full geometry, mid = nodes only). The
 * puffy cozy-world canopies cost more triangles than the old lollipops, so lower quality levels
 * hand trees over to their far LOD sooner (low pulls in the most).
 */
export function lodRadii(viewRadius: number, quality: string): { near: number; mid: number } {
  const near = quality === 'low' ? Math.min(56, viewRadius * 0.56) : quality === 'medium' ? Math.min(96, viewRadius * 0.75) : Math.min(110, viewRadius * 0.85);
  const mid = Math.min(190, viewRadius + 30);
  return { near, mid };
}

/** Batch keys of one model (see Nature.batches). */
interface ModelKeys {
  n: string;
  tn: string;
  f: string;
  tf: string;
  p: string;
}
/** Which geometry a batch draws. */
type GeoKind = 0 | 1 | 2;
const GEO_NEAR = 0;
const GEO_FAR = 1;
const GEO_PROP = 2;

/** LOD classes: near geometry only · cross-fade band (near + far geometry) · far geometry only. */
export const LOD_NEAR = 0;
export const LOD_BAND_CLASS = 1;
export const LOD_FAR = 2;

/**
 * Batch class of a node at distance `d` from the focus for the near radius `near`, given its class
 * from the previous rebuild (`prev`). Pure near/far classes are only used where the shader window is
 * guaranteed fully open/closed until the next rebuild (LOD_MARGIN past the band); the band class is
 * correct everywhere, so it is sticky by LOD_HYST on both sides.
 */
export function lodClass(d: number, near: number, prev: number): number {
  const inner = near - LOD_BAND - LOD_MARGIN;
  const outer = near + LOD_MARGIN;
  if (prev === LOD_BAND_CLASS) return d < inner - LOD_HYST ? LOD_NEAR : d > outer + LOD_HYST ? LOD_FAR : LOD_BAND_CLASS;
  return d <= inner ? LOD_NEAR : d > outer ? LOD_FAR : LOD_BAND_CLASS;
}

/** Smoothstep shrink of the LOD shaders: 1 = full size at the start of a band .. 0 = sunk away at its cutoff. */
export function lodShrink(k: number): number {
  const c = clamp(k, 0, 1);
  return 1 - c * c * (3 - 2 * c);
}

/**
 * CPU mirror of the LOD shaders for an instance at distance `d`: the complementary dither windows of
 * the near / far geometry of a band node (a fragment with Bayer value b survives when lo <= b < hi),
 * the discard-free scale of far-only geometry toward the mid cutoff and of props toward the near radius.
 */
export function lodWindows(d: number, near: number, mid: number, band = LOD_BAND): { near: [number, number]; far: [number, number]; farScale: number; propScale: number } {
  const t = clamp((d - (near - band)) / band, 0, 1);
  return { near: [t, 1], far: [0, t], farScale: lodShrink((d - (mid - band)) / band), propScale: lodShrink((d - (near - band)) / band) };
}

export class Nature {
  private group = new THREE.Group();
  private chunks: Chunk[] = [];
  /** key: 'n:<model>' near nodes, 'tn:' / 'tf:' near and far geometry of band nodes, 'f:<model>' far-only nodes, 'p:<model>' props. */
  private batches = new Map<string, Batch>();
  private keys = new Map<string, ModelKeys>();
  /** node index -> instance index within its batch (-1 = not drawn); slot2/batch2 = far partner in the band. */
  private nodeSlot = new Int32Array(0);
  private nodeBatch: (Batch | null)[] = [];
  private nodeSlot2 = new Int32Array(0);
  private nodeBatch2: (Batch | null)[] = [];
  private nodeModel: string[] = [];
  /** LOD class per node from the last rebuild (hysteresis). */
  private lodCls = new Uint8Array(0);
  private gen: WorldGen | null = null;
  private timer = 0;
  private depletedAcc = 0;
  private dirty = true;
  private depletedCount = -1;
  private lastTerrain = -1;
  /** Quality the batches were built at: LOD radii and low-quality look folding depend on it. */
  private lastQuality = '';
  private readonly cull = new ViewCull(FRUSTUM_MARGIN, REBUILD_MOVE, REBUILD_TURN, REBUILD_RADIUS);
  private wobbles = new Map<number, Wobble>();
  /** Node indices drawn by the last rebuild (occlusion scan). */
  private drawn: number[] = [];
  /** Occluder fade per node index, 0 (normal) .. 1 (shrunk out of the way). */
  private fades = new Map<number, number>();
  private occluders = new Set<number>();
  private occAcc = 0;
  private readonly unsub: (() => void)[] = [];
  private readonly nearBandOpts: BatchOpts;
  private readonly farBandOpts: BatchOpts;
  private readonly farOpts: BatchOpts;

  constructor(private readonly ctx: RenderContext) {
    ctx.scene.add(this.group);
    this.nearBandOpts = { ...NODE_OPTS, depthMaterial: ctx.mats.lodNearDepth };
    this.farBandOpts = { ...NODE_OPTS, depthMaterial: ctx.mats.lodFarDepth };
    this.farOpts = { ...NODE_OPTS, depthMaterial: ctx.mats.lodShrinkMidDepth };
    const bus = ctx.game.bus;
    this.unsub.push(
      bus.on('gather:hit', (e) => this.onHit(e.node, e.model, e.x, e.z)),
      bus.on('gather:depleted', (e) => this.onDepleted(e.node)),
    );
  }

  /** The generation currently drawn (null when the world has nothing yet). */
  get current(): WorldGen | null {
    return this.gen;
  }

  /** Instanced meshes currently drawn (dev stats / tests). */
  get batchCount(): number {
    let n = 0;
    for (const b of this.batches.values()) if (b.visible && b.count > 0) n++;
    return n;
  }

  /** Node instances drawn by the last rebuild (dev stats / tests). */
  get drawnCount(): number {
    return this.drawn.length;
  }

  /** Nodes drawn in both LOD batches by the last rebuild (dev stats / tests). */
  get bandCount(): number {
    let n = 0;
    for (let k = 0; k < this.drawn.length; k++) if (this.nodeBatch2[this.drawn[k]]) n++;
    return n;
  }

  private onHit(node: number, model: string, x: number, z: number): void {
    const w = this.wobbles.get(node);
    if (w && w.pop) return;
    this.wobbles.set(node, { t: 0, pop: false });
    const g = this.gen;
    const n = g?.nodes[node];
    const y = this.ctx.heightAt(x, z);
    const h = nodeHeight(model) * (n?.scale ?? 1) * 0.5;
    this.ctx.particles.chips(x, y + h, z, nodeChipColor(this.nodeModel[node] ?? model), 6);
  }

  private onDepleted(node: number): void {
    this.wobbles.set(node, { t: 0, pop: true });
    const g = this.gen;
    const n = g?.nodes[node];
    if (n) {
      const model = this.nodeModel[node] ?? this.ctx.game.data.node(n.def)?.model ?? n.def;
      this.ctx.particles.chips(n.x, this.ctx.heightAt(n.x, n.z) + 0.6, n.z, nodeChipColor(model), 10);
      this.ctx.particles.dust(n.x, this.ctx.heightAt(n.x, n.z), n.z, 6, 0.8);
    }
  }

  private setGen(gen: WorldGen | null): void {
    this.gen = gen;
    const n = gen?.nodes?.length ?? 0;
    this.nodeSlot = new Int32Array(n).fill(-1);
    this.nodeBatch = new Array<Batch | null>(n).fill(null);
    this.nodeSlot2 = new Int32Array(n).fill(-1);
    this.nodeBatch2 = new Array<Batch | null>(n).fill(null);
    this.nodeModel = new Array(n);
    this.lodCls = new Uint8Array(n);
    this.chunks = [];
    for (let i = 0; i < CHUNKS_PER_SIDE * CHUNKS_PER_SIDE; i++) {
      const cx = i % CHUNKS_PER_SIDE;
      const cz = (i / CHUNKS_PER_SIDE) | 0;
      this.chunks.push({
        minX: cx * CHUNK_SIZE - HALF_WORLD,
        minZ: cz * CHUNK_SIZE - HALF_WORLD,
        maxX: (cx + 1) * CHUNK_SIZE - HALF_WORLD,
        maxZ: (cz + 1) * CHUNK_SIZE - HALF_WORLD,
        nodes: [],
        props: [],
      });
    }
    const data = this.ctx.game.data;
    for (let i = 0; i < n; i++) {
      const node = gen!.nodes[i];
      // the look key: the def's model or one of its variants (fruit / tall trees, slim pines, biome boulders)
      this.nodeModel[i] = nodeVariant(data.node(node.def)?.model ?? node.def, node.def, node.region, i);
      this.chunks[chunkOf(node.x, node.z)].nodes.push(i);
    }
    const props = gen?.props ?? [];
    for (let i = 0; i < props.length; i++) this.chunks[chunkOf(props[i].x, props[i].z)].props.push(i);
    this.wobbles.clear();
    this.fades.clear();
    this.occluders.clear();
    this.dirty = true;
  }

  private nodeMatrix(node: WorldNode, out: THREE.Matrix4, wobble?: Wobble, fade = 0): THREE.Matrix4 {
    const def = this.ctx.game.data.node(node.def);
    let s = (node.scale || 1) * (def?.scale ?? 1) * (1 - OCCLUDER_SHRINK * fade);
    let rx = 0;
    let rz = 0;
    let sy = s;
    if (wobble) {
      if (wobble.pop) {
        const k = clamp(wobble.t / 0.35, 0, 1);
        const pop = k < 0.3 ? 1 + k * 0.6 : Math.max(0, 1.18 - (k - 0.3) / 0.7 * 1.18);
        s *= pop;
        sy = s * (k < 0.3 ? 1 - k * 0.5 : pop);
      } else {
        const k = wobble.t;
        const a = Math.exp(-k * 5) * Math.sin(k * 28) * 0.12;
        rx = a;
        rz = a * 0.6;
        sy = s * (1 + Math.exp(-k * 6) * Math.sin(k * 30) * 0.05);
      }
    }
    const y = this.ctx.heightAt(node.x, node.z) - 0.05;
    return composeEuler(out, node.x, y, node.z, rx, node.rot || 0, rz, s, sy, s);
  }

  /** Rewrite a drawn node's matrix in its batch (and its far partner in the band). */
  private setNodeMatrix(i: number, m: THREE.Matrix4): void {
    const b = this.nodeBatch[i];
    if (b && this.nodeSlot[i] >= 0) b.setMatrix(this.nodeSlot[i], m);
    const b2 = this.nodeBatch2[i];
    if (b2 && this.nodeSlot2[i] >= 0) b2.setMatrix(this.nodeSlot2[i], m);
  }

  /** Batch keys of a model, built once (a rebuild walks hundreds of nodes: no key string or closure per node). */
  private keysOf(model: string): ModelKeys {
    let k = this.keys.get(model);
    if (!k) {
      k = { n: 'n:' + model, tn: 'tn:' + model, f: 'f:' + model, tf: 'tf:' + model, p: 'p:' + model };
      this.keys.set(model, k);
    }
    return k;
  }

  private batch(key: string, model: string, kind: GeoKind, material: THREE.Material, opts: BatchOpts): Batch {
    let b = this.batches.get(key);
    if (!b) {
      const geo = kind === GEO_NEAR ? nodeGeometry(model) : kind === GEO_FAR ? nodeGeometryFar(model) : propGeometry(model);
      b = new Batch(this.group, geo, material, 32, { ...opts, name: 'nature ' + key });
      this.batches.set(key, b);
    }
    return b;
  }

  private rebuild(): void {
    const g = this.gen;
    const ctx = this.ctx;
    const env = ctx.env;
    const cull = this.cull;
    const mats = ctx.mats;
    cull.sync(env, ctx.camera);
    for (const b of this.batches.values()) b.begin();
    this.nodeSlot.fill(-1);
    this.nodeBatch.fill(null);
    this.nodeSlot2.fill(-1);
    this.nodeBatch2.fill(null);
    this.drawn.length = 0;
    if (g) {
      const depleted = ctx.game.state.world.depleted;
      const { near, mid } = lodRadii(env.viewRadius, env.quality);
      // the shaders fade with the live camera: keep instances that may still be (partly) visible
      // before the next rebuild, i.e. up to the margin past the cutoffs
      const drawR = mid + LOD_MARGIN;
      const propR = near + LOD_MARGIN;
      const drawR2 = drawR * drawR;
      const propR2 = propR * propR;
      const nodes = g.nodes;
      const props = g.props;
      const data = ctx.game.data;
      for (let ci = 0; ci < this.chunks.length; ci++) {
        const c = this.chunks[ci];
        // distance reject (nearest point of the chunk to the focus), then frustum reject
        const ddx = Math.max(c.minX - env.cx, 0, env.cx - c.maxX);
        const ddz = Math.max(c.minZ - env.cz, 0, env.cz - c.maxZ);
        const cd2 = ddx * ddx + ddz * ddz;
        if (cd2 > drawR2) continue;
        if (!cull.box(c.minX, CHUNK_Y_MIN, c.minZ, c.maxX, CHUNK_Y_MAX, c.maxZ)) continue;
        const list = c.nodes;
        for (let k = 0; k < list.length; k++) {
          const i = list[k];
          const n = nodes[i];
          const dx = n.x - env.cx;
          const dz = n.z - env.cz;
          const d2 = dx * dx + dz * dz;
          if (d2 > drawR2) continue;
          const w = this.wobbles.get(i);
          if (depleted[i] !== undefined && !(w && w.pop)) continue;
          const model = nodeLookAt(this.nodeModel[i], env.quality);
          const s = (n.scale || 1) * (data.node(n.def)?.scale ?? 1);
          const h = nodeHeight(model) * s;
          if (!cull.sphere(n.x, ctx.heightAt(n.x, n.z) + h * 0.5, n.z, Math.max(h * 0.6, 1.4 * s))) continue;
          const cls = lodClass(Math.sqrt(d2), near, this.lodCls[i]);
          this.lodCls[i] = cls;
          this.nodeMatrix(n, _m, w, this.fades.get(i) ?? 0);
          const tint = natureTint(i);
          const keys = this.keysOf(model);
          if (cls !== LOD_FAR) {
            const batch = cls === LOD_NEAR ? this.batch(keys.n, model, GEO_NEAR, mats.nature, NODE_OPTS) : this.batch(keys.tn, model, GEO_NEAR, mats.lodNear, this.nearBandOpts);
            this.nodeSlot[i] = batch.count;
            this.nodeBatch[i] = batch;
            batch.push(_m, tint);
          }
          if (cls === LOD_FAR) {
            const far = this.batch(keys.f, model, GEO_FAR, mats.lodShrinkMid, this.farOpts);
            this.nodeSlot[i] = far.count;
            this.nodeBatch[i] = far;
            far.push(_m, tint);
          } else if (cls === LOD_BAND_CLASS) {
            const far = this.batch(keys.tf, model, GEO_FAR, mats.lodFar, this.farBandOpts);
            this.nodeSlot2[i] = far.count;
            this.nodeBatch2[i] = far;
            far.push(_m, tint);
          }
          this.drawn.push(i);
        }
        if (cd2 > propR2) continue;
        const plist = c.props;
        for (let k = 0; k < plist.length; k++) {
          const p = props[plist[k]];
          const dx = p.x - env.cx;
          const dz = p.z - env.cz;
          if (dx * dx + dz * dz > propR2) continue;
          const s = p.scale || 1;
          const y = ctx.heightAt(p.x, p.z);
          if (!cull.sphere(p.x, y + s, p.z, 1.8 * s)) continue;
          const batch = this.batch(this.keysOf(p.model).p, p.model, GEO_PROP, mats.lodShrinkNear, PROP_OPTS);
          composeEuler(_m, p.x, y - 0.03, p.z, 0, p.rot || 0, 0, s, s, s);
          batch.push(_m, natureTint(plist[k] + 31));
        }
      }
    }
    for (const b of this.batches.values()) {
      b.end();
      b.setVisible(b.count > 0);
    }
    this.timer = 0;
    this.dirty = false;
  }

  update(dt: number): void {
    const ctx = this.ctx;
    const gen = (ctx.game.sys.world.gen as WorldGen | undefined) ?? null;
    if (gen !== this.gen) this.setGen(gen);
    const env = ctx.env;
    if (env.terrainVersion !== this.lastTerrain) {
      this.lastTerrain = env.terrainVersion;
      this.dirty = true;
    }
    // a quality switch (settings or the auto governor) refreshes the batches right away, not at the next 4 s refresh
    if (env.quality !== this.lastQuality) {
      this.lastQuality = env.quality;
      this.dirty = true;
    }
    this.timer += dt;
    this.depletedAcc += dt;
    // detect respawns / depletions we did not hear about (cheap key count once per second)
    if (this.depletedAcc > 1) {
      this.depletedAcc = 0;
      const cnt = Object.keys(ctx.game.state.world.depleted).length;
      if (cnt !== this.depletedCount) {
        this.depletedCount = cnt;
        this.dirty = true;
      }
    }
    // the 4 s refresh covers a respawn and a depletion inside the same second (count unchanged)
    if (this.dirty || this.timer > 4 || this.cull.stale(env, ctx.camera)) this.rebuild();

    // the LOD shaders cross-fade against the live camera (continuous between rebuilds)
    const { near, mid } = lodRadii(env.viewRadius, env.quality);
    ctx.mats.setLod(env.cx, env.cz, near, LOD_BAND, mid);

    this.updateOccluders(dt);

    // wobble / pop animations
    if (this.wobbles.size && this.gen) {
      for (const [i, w] of this.wobbles) {
        w.t += dt;
        if (w.pop && w.t > 0.36) {
          this.wobbles.delete(i);
          this.dirty = true;
          continue;
        }
        if (!w.pop && w.t > 0.9) {
          this.wobbles.delete(i);
          this.setNodeMatrix(i, this.nodeMatrix(this.gen.nodes[i], _m, undefined, this.fades.get(i) ?? 0));
          continue;
        }
        this.setNodeMatrix(i, this.nodeMatrix(this.gen.nodes[i], _m, w, this.fades.get(i) ?? 0));
      }
    }
  }

  /**
   * Shrink solid nodes that stand on a sight line camera -> player / build ghost (scan at 10 Hz,
   * animate every frame). Only the handful of fading nodes get their matrices rewritten.
   */
  private updateOccluders(dt: number): void {
    const g = this.gen;
    if (!g) return;
    const ctx = this.ctx;
    const env = ctx.env;
    const game = ctx.game;
    this.occAcc += dt;
    if (this.occAcc >= 0.1) {
      this.occAcc = 0;
      this.occluders.clear();
      const nt = sightTargets(ctx, _targets);
      const p = game.state.player;
      for (let ti = 0; ti < nt; ti++) {
        const tx = _targets[ti * 3];
        const ty = _targets[ti * 3 + 1];
        const tz = _targets[ti * 3 + 2];
        const dx = env.camX - tx;
        const dy = env.camY - ty;
        const dz = env.camZ - tz;
        const h2 = dx * dx + dz * dz;
        if (h2 <= 1) continue;
        for (let k = 0; k < this.drawn.length; k++) {
          const i = this.drawn[k];
          const n = g.nodes[i];
          const ox = n.x - tx;
          const oz = n.z - tz;
          // the tree/rock right next to the player is what they are chopping: never shrink it
          if (ti === 0 && (n.x - p.x) * (n.x - p.x) + (n.z - p.z) * (n.z - p.z) < OCCLUDER_KEEP_R * OCCLUDER_KEEP_R) continue;
          // quick reject: behind the target or beyond the camera
          const along = (ox * dx + oz * dz) / h2;
          if (along <= 0 || along >= 1) continue;
          const def = game.data.node(n.def);
          if (!def?.solid) continue;
          const s = (n.scale || 1) * (def.scale ?? 1);
          const lx = ox - dx * along;
          const lz = oz - dz * along;
          const r = 0.75 * s + 0.8;
          if (lx * lx + lz * lz > r * r) continue;
          // only when the node is tall enough to reach the sight line at that point
          const rayH = ty + dy * along - ctx.heightAt(n.x, n.z);
          if (nodeHeight(this.nodeModel[i]) * s < rayH - 0.2) continue;
          this.occluders.add(i);
        }
      }
      for (const i of this.occluders) if (!this.fades.has(i)) this.fades.set(i, 0);
    }
    if (!this.fades.size) return;
    for (const [i, f0] of this.fades) {
      const on = this.occluders.has(i);
      const f = on ? Math.min(1, f0 + dt * 5) : Math.max(0, f0 - dt * 3);
      if (f === f0 && on) continue;
      if (f <= 0) this.fades.delete(i);
      else this.fades.set(i, f);
      if (this.nodeSlot[i] < 0 || this.wobbles.has(i)) continue; // the wobble animation writes this node's matrix
      this.setNodeMatrix(i, this.nodeMatrix(g.nodes[i], _m, undefined, f));
    }
  }

  /** World position / size of a node for selection rings. */
  nodeInfo(index: number): { x: number; y: number; z: number; radius: number; height: number } | null {
    const n = this.gen?.nodes[index];
    if (!n) return null;
    const model = this.nodeModel[index];
    const def = this.ctx.game.data.node(n.def);
    const s = (n.scale || 1) * (def?.scale ?? 1);
    return { x: n.x, y: this.ctx.heightAt(n.x, n.z), z: n.z, radius: 0.9 * s, height: nodeHeight(model) * s };
  }

  /** Ray/sphere picking over drawn (non-depleted, on-screen) nodes. */
  pick(ray: THREE.Ray, maxT: number): { index: number; t: number } | null {
    const g = this.gen;
    if (!g) return null;
    let best = -1;
    let bestT = maxT;
    const o = ray.origin;
    const d = ray.direction;
    for (let k = 0; k < this.drawn.length; k++) {
      const i = this.drawn[k];
      const n = g.nodes[i];
      const def = this.ctx.game.data.node(n.def);
      const s = (n.scale || 1) * (def?.scale ?? 1);
      const h = nodeHeight(this.nodeModel[i]) * s;
      const cy = this.ctx.heightAt(n.x, n.z) + h * 0.5;
      const r = Math.max(0.8, Math.min(1.6, h * 0.45));
      const t = raySphere(o, d, n.x, cy, n.z, r);
      if (t >= 0 && t < bestT) {
        bestT = t;
        best = i;
      }
    }
    return best >= 0 ? { index: best, t: bestT } : null;
  }

  dispose(): void {
    for (const u of this.unsub) u();
    for (const b of this.batches.values()) b.dispose();
    this.batches.clear();
    this.ctx.scene.remove(this.group);
  }
}

/** Ray vs sphere; returns the nearest positive distance or -1. */
export function raySphere(o: THREE.Vector3, d: THREE.Vector3, cx: number, cy: number, cz: number, r: number): number {
  const lx = cx - o.x;
  const ly = cy - o.y;
  const lz = cz - o.z;
  const tca = lx * d.x + ly * d.y + lz * d.z;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return -1;
  const thc = Math.sqrt(r * r - d2);
  const t0 = tca - thc;
  const t1 = tca + thc;
  if (t0 >= 0) return t0;
  if (t1 >= 0) return t1;
  return -1;
}
