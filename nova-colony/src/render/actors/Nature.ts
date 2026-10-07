/**
 * Nature actor — resource nodes (gen.nodes) and decorative props (gen.props) as InstancedMeshes
 * per model, distance-culled around the camera focus and rebuilt only when the focus moves, the
 * depletion set changes or a timer elapses. Gather hits wobble the node and throw chips; depletion
 * plays a shrink-pop before the node disappears. Solid nodes standing between the camera and the player
 * shrink out of the way (and grow back) so trees and boulders never hide the player.
 */
import * as THREE from 'three';
import type { RenderContext } from '../core/context';
import { Batch, composeEuler } from '../core/Batch';
import { nodeGeometry, propGeometry, nodeHeight, nodeChipColor } from '../models/nature';
import type { WorldGen, WorldNode } from '../../sim/world';
import { clamp } from '../../core/math';

interface Wobble {
  t: number;
  pop: boolean;
}

const _m = new THREE.Matrix4();
/** How far an occluding node shrinks (fraction of its size). */
const OCCLUDER_SHRINK = 0.78;

export class Nature {
  private group = new THREE.Group();
  private nodeBatches = new Map<string, Batch>();
  private propBatches = new Map<string, Batch>();
  /** node index -> instance index within its model batch (-1 = not drawn). */
  private nodeSlot = new Int32Array(0);
  private nodeModel: string[] = [];
  private gen: WorldGen | null = null;
  private lastCx = NaN;
  private lastCz = NaN;
  private lastRadius = 0;
  private timer = 0;
  private dirty = true;
  private depletedCount = -1;
  private lastTerrain = -1;
  private wobbles = new Map<number, Wobble>();
  /** Node indices drawn by the last rebuild (occlusion scan). */
  private drawn: number[] = [];
  /** Occluder fade per node index, 0 (normal) .. 1 (shrunk out of the way). */
  private fades = new Map<number, number>();
  private occluders = new Set<number>();
  private occAcc = 0;
  private readonly unsub: (() => void)[] = [];

  constructor(private readonly ctx: RenderContext) {
    ctx.scene.add(this.group);
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

  private onHit(node: number, model: string, x: number, z: number): void {
    const w = this.wobbles.get(node);
    if (w && w.pop) return;
    this.wobbles.set(node, { t: 0, pop: false });
    const g = this.gen;
    const n = g?.nodes[node];
    const y = this.ctx.heightAt(x, z);
    const h = nodeHeight(model) * (n?.scale ?? 1) * 0.5;
    this.ctx.particles.chips(x, y + h, z, nodeChipColor(model), 6);
  }

  private onDepleted(node: number): void {
    this.wobbles.set(node, { t: 0, pop: true });
    const g = this.gen;
    const n = g?.nodes[node];
    if (n) {
      const def = this.ctx.game.data.node(n.def);
      const model = def?.model ?? n.def;
      this.ctx.particles.chips(n.x, this.ctx.heightAt(n.x, n.z) + 0.6, n.z, nodeChipColor(model), 10);
      this.ctx.particles.dust(n.x, this.ctx.heightAt(n.x, n.z), n.z, 6, 0.8);
    }
  }

  private nodeBatch(model: string): Batch {
    let b = this.nodeBatches.get(model);
    if (!b) {
      b = new Batch(this.group, nodeGeometry(model), this.ctx.mats.set, 64, { castShadow: true, receiveShadow: true });
      this.nodeBatches.set(model, b);
    }
    return b;
  }

  private propBatch(model: string): Batch {
    let b = this.propBatches.get(model);
    if (!b) {
      b = new Batch(this.group, propGeometry(model), this.ctx.mats.set, 64, { receiveShadow: true });
      this.propBatches.set(model, b);
    }
    return b;
  }

  private setGen(gen: WorldGen | null): void {
    this.gen = gen;
    const n = gen?.nodes?.length ?? 0;
    this.nodeSlot = new Int32Array(n).fill(-1);
    this.nodeModel = new Array(n);
    const data = this.ctx.game.data;
    for (let i = 0; i < n; i++) {
      const node = gen!.nodes[i];
      this.nodeModel[i] = data.node(node.def)?.model ?? node.def;
    }
    this.wobbles.clear();
    this.dirty = true;
  }

  private nodeMatrix(node: WorldNode, model: string, out: THREE.Matrix4, wobble?: Wobble, fade = 0): THREE.Matrix4 {
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

  private rebuild(): void {
    const g = this.gen;
    const env = this.ctx.env;
    for (const b of this.nodeBatches.values()) b.begin();
    for (const b of this.propBatches.values()) b.begin();
    this.nodeSlot.fill(-1);
    this.drawn.length = 0;
    if (g) {
      const depleted = this.ctx.game.state.world.depleted;
      const nodeR = Math.min(190, env.viewRadius + 30);
      const nodeR2 = nodeR * nodeR;
      const nodes = g.nodes ?? [];
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const dx = n.x - env.cx;
        const dz = n.z - env.cz;
        if (dx * dx + dz * dz > nodeR2) continue;
        const w = this.wobbles.get(i);
        if (depleted[i] !== undefined && !(w && w.pop)) continue;
        const batch = this.nodeBatch(this.nodeModel[i]);
        this.nodeSlot[i] = batch.count;
        this.drawn.push(i);
        batch.push(this.nodeMatrix(n, this.nodeModel[i], _m, w, this.fades.get(i) ?? 0));
      }
      const propR = env.quality === 'low' ? Math.min(70, env.viewRadius * 0.7) : Math.min(120, env.viewRadius * 0.9);
      const propR2 = propR * propR;
      const props = g.props ?? [];
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        const dx = p.x - env.cx;
        const dz = p.z - env.cz;
        if (dx * dx + dz * dz > propR2) continue;
        const batch = this.propBatch(p.model);
        const s = p.scale || 1;
        composeEuler(_m, p.x, this.ctx.heightAt(p.x, p.z) - 0.03, p.z, 0, p.rot || 0, 0, s, s, s);
        batch.push(_m);
      }
    }
    for (const b of this.nodeBatches.values()) b.end();
    for (const b of this.propBatches.values()) b.end();
    this.lastCx = env.cx;
    this.lastCz = env.cz;
    this.lastRadius = env.viewRadius;
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
    this.timer += dt;
    const depleted = ctx.game.state.world.depleted;
    // detect respawns / depletions we did not hear about (cheap key count every ~1s)
    if (this.timer > 1) {
      const cnt = Object.keys(depleted).length;
      if (cnt !== this.depletedCount) {
        this.depletedCount = cnt;
        this.dirty = true;
      }
    }
    const moved = (env.cx - this.lastCx) ** 2 + (env.cz - this.lastCz) ** 2 > 36 || Math.abs(env.viewRadius - this.lastRadius) > 15;
    if (this.dirty || moved || this.timer > 2.5) this.rebuild();

    this.updateOccluders(dt);

    // wobble / pop animations
    if (this.wobbles.size && this.gen) {
      for (const [i, w] of this.wobbles) {
        w.t += dt;
        const slot = this.nodeSlot[i];
        if (w.pop && w.t > 0.36) {
          this.wobbles.delete(i);
          this.dirty = true;
          continue;
        }
        if (!w.pop && w.t > 0.9) {
          this.wobbles.delete(i);
          if (slot >= 0) this.nodeBatches.get(this.nodeModel[i])?.setMatrix(slot, this.nodeMatrix(this.gen.nodes[i], this.nodeModel[i], _m, undefined, this.fades.get(i) ?? 0));
          continue;
        }
        if (slot >= 0) this.nodeBatches.get(this.nodeModel[i])?.setMatrix(slot, this.nodeMatrix(this.gen.nodes[i], this.nodeModel[i], _m, w, this.fades.get(i) ?? 0));
      }
    }
  }

  /**
   * Shrink solid nodes that stand on the sight line camera -> player (scan at 10 Hz, animate every
   * frame). Only the handful of fading nodes get their matrices rewritten.
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
      const p = game.state.player;
      const show = game.view.mode !== 'map';
      const py = ctx.heightAt(p.x, p.z) + 0.9;
      const dx = env.camX - p.x;
      const dy = env.camY - py;
      const dz = env.camZ - p.z;
      const h2 = dx * dx + dz * dz;
      if (show && h2 > 1) {
        for (let k = 0; k < this.drawn.length; k++) {
          const i = this.drawn[k];
          const n = g.nodes[i];
          const ox = n.x - p.x;
          const oz = n.z - p.z;
          // quick reject: behind the player or beyond the camera
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
          const rayH = py + dy * along - ctx.heightAt(n.x, n.z);
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
      const slot = this.nodeSlot[i];
      if (slot < 0 || this.wobbles.has(i)) continue; // the wobble animation writes this node's matrix
      this.nodeBatches.get(this.nodeModel[i])?.setMatrix(slot, this.nodeMatrix(g.nodes[i], this.nodeModel[i], _m, undefined, f));
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

  /** Ray/sphere picking over drawn (non-depleted, in-range) nodes. */
  pick(ray: THREE.Ray, maxT: number): { index: number; t: number } | null {
    const g = this.gen;
    if (!g) return null;
    let best = -1;
    let bestT = maxT;
    const o = ray.origin;
    const d = ray.direction;
    for (let i = 0; i < g.nodes.length; i++) {
      if (this.nodeSlot[i] < 0) continue;
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
    for (const b of this.nodeBatches.values()) b.dispose();
    for (const b of this.propBatches.values()) b.dispose();
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
