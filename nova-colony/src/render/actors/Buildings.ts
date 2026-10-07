/**
 * Buildings actor — draws state.buildings.list:
 *  - structure pieces as InstancedMeshes per (piece variant, tier) with walls/fences connecting to
 *    their neighbours (core post + arms), floors under wall-like pieces;
 *  - facilities as InstancedMeshes per (model, tier, level) with animated sub-parts (turret heads
 *    aim at aliens, rotors spin, pumps pump...), particle emitters and pooled point lights;
 *  - construction (rising piece + scaffold + dust), damaged (dark + smoke) and off (dim) states;
 *  - auto roofs per room (derived.roofCells / rooms) that fade when the player is inside;
 *  - shield bubbles, upgrade / completion / tier-up celebrations;
 *  - occlusion: buildings (and roofs) standing between the camera and the player / build ghost
 *    dither away via a per-instance fade attribute (see Batch `fade`), so a Titanium skyscraper never
 *    hides the player in the follow camera; their shadows dither away with them (Batch `depthMaterial`,
 *    roofs through a per-room depth material), so no solid shadow of an invisible wall lingers.
 * Instance buffers are only rebuilt when derived.buildingsVersion or a cheap state hash changes; static
 * batches carry a bounding sphere so three.js frustum-culls whole batches off screen.
 */
import * as THREE from 'three';
import type { RenderContext } from '../core/context';
import { inView, sightTargets } from '../core/context';
import { Batch, composeYaw, composeEuler, type BatchOpts } from '../core/Batch';
import { mergeCopies } from '../core/GeoBuilder';
import { tierStyle, type TierStyle } from '../core/palette';
import { buildModel, type ModelSpec } from '../models/spec';
import { pieceGeometry, pieceFullKey, WALL_H, ROOF_Y, type PieceGeoKey } from '../models/pieces';
import type { BuildingInstance, Id } from '../../core/state';
import type { BuildingDef } from '../../data/schema';
import { CELL, WORLD_CELLS, cellIndex, cellMin, cellCenter, footprintCenter, rotatedSize, inWorld } from '../../core/constants';
import { approachAngle, clamp } from '../../core/math';

interface Entry {
  id: Id;
  b: BuildingInstance;
  def: BuildingDef | undefined;
  spec: ModelSpec | null;
  style: TierStyle;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** AABB for picking. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  /** Instance slots written for this building (for construction scaling / flashes). */
  slots: Slot[];
  emitAcc: Float32Array | null;
  turretYaw: number;
  hasTarget: boolean;
  /** Occlusion fade 0 (solid) .. FADE_MAX (dithered away). */
  fade: number;
  /** Instance colour: status tint × a small per-building variation (so rows of one model never match exactly). */
  col: THREE.Color;
}

interface Slot {
  batch: Batch;
  index: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

interface FacilityBatch {
  spec: ModelSpec;
  body: Batch;
  parts: Batch[];
  entries: Entry[];
}

interface Roof {
  mesh: THREE.Mesh;
  mat: THREE.MeshLambertMaterial;
  /** Shadow-pass material dithering the roof's shadow away as it turns see-through. */
  depth: THREE.MeshDepthMaterial;
  fade: THREE.IUniform<number>;
  cells: Set<number>;
  opacity: number;
  /** XZ bounds (world) for the occlusion scan. */
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  y: number;
  occluded: boolean;
}

const WALL_LIKE = new Set(['wall', 'door', 'window', 'gate', 'pillar']);
const FENCE_LIKE = new Set(['fence', 'gate']);
const DIRS = [
  [1, 0, 0],
  [-1, 0, Math.PI],
  [0, 1, -Math.PI / 2],
  [0, -1, Math.PI / 2],
];

const COLOR_ACTIVE = new THREE.Color(1, 1, 1);
const COLOR_OFF = new THREE.Color(0.55, 0.55, 0.6);
const COLOR_DAMAGED = new THREE.Color(0.42, 0.33, 0.33);
const COLOR_FLASH = new THREE.Color(2.2, 2.2, 2.2);
const COLOR_HIT = new THREE.Color(1.6, 0.6, 0.5);
const COLOR_GHOST_BUILD = new THREE.Color(1.15, 1.15, 1.15);
/** Per-building colour variation: ±5% value with a slight warm / cool lean, picked by id. */
const TINTS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
  const a = (i / 8) * Math.PI * 2;
  const v = 1 + Math.sin(a) * 0.05;
  const warm = Math.cos(a) * 0.035;
  return new THREE.Color(v * (1 + warm), v, v * (1 - warm));
});
export function buildingTint(id: number): THREE.Color {
  return TINTS[((id * 2654435761) >>> 0) % TINTS.length];
}

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _c = new THREE.Color();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _targets = new Float64Array(6);
/** Strongest occlusion fade (a faint stipple keeps the building readable). */
const FADE_MAX = 0.85;
/** Sight-line margin (world units) around a building's footprint. */
const OCCLUDE_MARGIN = 0.6;
/** Shadow casters get the fade-aware depth material in the constructor (needs the shared materials). */
const PIECE_OPTS: BatchOpts = { color: true, castShadow: true, receiveShadow: true, cull: true, fade: true };
const BODY_OPTS: BatchOpts = { color: true, castShadow: true, receiveShadow: true, cull: true, fade: true };
const PART_OPTS: BatchOpts = { color: true, castShadow: false, fade: true };

export class Buildings {
  private group = new THREE.Group();
  private pieceBatches = new Map<string, Batch>();
  private facilityBatches = new Map<string, FacilityBatch>();
  private entries: Entry[] = [];
  private byId = new Map<Id, Entry>();
  private constructing: Entry[] = [];
  private scaffold: Batch;
  private roofs: Roof[] = [];
  private roofGroup = new THREE.Group();
  private lights: THREE.PointLight[] = [];
  private lightEntries: (Entry | null)[] = [];
  private lightTimer = 0;
  private flashes = new Map<Id, { until: number; color: THREE.Color; base: THREE.Color }>();
  /** Buildings currently on a sight line and their animated fades (kept across rebuilds). */
  private occluders = new Set<Id>();
  private bfades = new Map<Id, number>();
  private occAcc = 0;
  private shields = new Map<Id, { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; ripple: number }>();
  /** 0 = peace (faint shimmer) .. 1 = invasion (shields powered up). */
  private shieldAlert = 0;
  private lastVersion = -1;
  private lastHash = NaN;
  private lastTerrain = -1;
  private lastRoofVersion = -1;
  private lastRoofSize = -1;
  private wallMap = new Map<number, string>();
  private readonly unsub: (() => void)[] = [];
  /** Per-frame construction dust accumulator. */
  private dustAcc = 0;
  private readonly pieceOpts: BatchOpts;
  private readonly bodyOpts: BatchOpts;

  constructor(private readonly ctx: RenderContext) {
    ctx.scene.add(this.group);
    ctx.scene.add(this.roofGroup);
    this.pieceOpts = { ...PIECE_OPTS, depthMaterial: ctx.mats.litFadeDepth };
    this.bodyOpts = { ...BODY_OPTS, depthMaterial: ctx.mats.litFadeDepth };
    const scaffoldGeo = pieceGeometry('scaffold', tierStyle(ctx.game.data.tier(0)));
    this.scaffold = new Batch(this.group, scaffoldGeo, ctx.mats.set, 8);
    const bus = ctx.game.bus;
    this.unsub.push(
      bus.on('building:placed', (e) => {
        const en = this.byId.get(e.id);
        const p = en ?? this.pending(e.id);
        if (p) ctx.particles.dust(p.x, p.y, p.z, 14, Math.max(1, (p.maxX - p.minX) / 2));
      }),
      bus.on('building:completed', (e) => {
        const en = this.byId.get(e.id);
        if (!en) return;
        ctx.particles.sparkles(en.x, en.y + 0.5, en.z, '#fff0a0', 18, (en.maxX - en.minX) / 2);
        ctx.particles.ring(en.x, en.y + 0.3, en.z, (en.maxX - en.minX) / 2 + 0.5, en.style.accent, 18);
        this.flash(e.id, COLOR_FLASH, 0.25);
      }),
      bus.on('building:upgraded', (e) => {
        const en = this.byId.get(e.id);
        this.flash(e.id, COLOR_FLASH, 0.45);
        if (!en) return;
        const style = tierStyle(ctx.game.data.tier(e.tier));
        ctx.particles.sparkles(en.x, en.y + 0.5, en.z, style.accent, 26, (en.maxX - en.minX) / 2 + 0.3);
        ctx.particles.ring(en.x, en.y + 0.4, en.z, (en.maxX - en.minX) / 2 + 0.6, style.accent, 24);
        ctx.particles.flash(en.x, en.y + en.height * 0.5, en.z, Math.max(1.5, en.height * 0.6), '#ffffff', 0.3);
      }),
      bus.on('building:damaged', (e) => {
        const en = this.byId.get(e.id);
        this.flash(e.id, COLOR_HIT, 0.12);
        if (en && e.amount > 0) ctx.particles.sparks(en.x + (Math.random() - 0.5), en.y + 1, en.z + (Math.random() - 0.5), 3, '#ffb347', 3);
      }),
      bus.on('building:broken', (e) => {
        const en = this.byId.get(e.id);
        if (!en) return;
        for (let i = 0; i < 6; i++) ctx.particles.smoke(en.x + (Math.random() - 0.5) * 1.5, en.y + 0.6, en.z + (Math.random() - 0.5) * 1.5, 0.6, '#4a4448', 2);
        ctx.particles.sparks(en.x, en.y + 1, en.z, 10, '#ff8a3d', 5);
      }),
      bus.on('building:repaired', (e) => {
        const en = this.byId.get(e.id);
        if (en) ctx.particles.sparkles(en.x, en.y + 0.4, en.z, '#8dff9a', 14, 1);
      }),
      bus.on('colony:tierUp', (e) => {
        const core = this.coreEntry();
        const style = tierStyle(ctx.game.data.tier(e.tier));
        const x = core?.x ?? 0;
        const z = core?.z ?? 0;
        const y = core?.y ?? 0;
        ctx.particles.ring(x, y + 0.5, z, 5, style.accent, 40);
        ctx.particles.ring(x, y + 2.5, z, 3, '#ffffff', 24);
        ctx.particles.confetti(x, y + 4, z, 50);
        ctx.particles.sparkles(x, y + 1, z, style.accent, 50, 4);
        ctx.particles.flash(x, y + 3, z, 6, style.accent, 0.5);
        if (core) this.flash(core.id, COLOR_FLASH, 0.6);
      }),
      bus.on('turret:fired', (e) => this.muzzleFlash(e.building, e.kind, e.x, e.z, e.tx, e.tz)),
      bus.on('shield:hit', (e) => {
        const s = this.shields.get(e.building);
        if (s) s.ripple = 1;
        ctx.particles.ring(e.x, 1.5, e.z, 1.2, '#58d0ff', 12);
      }),
    );
  }

  private coreEntry(): Entry | undefined {
    const id = this.ctx.game.state.colony.coreId;
    return id == null ? undefined : this.byId.get(id);
  }

  /** Entry-like position for a building that exists in state but is not yet in our caches. */
  private pending(id: Id): { x: number; y: number; z: number; minX: number; maxX: number } | null {
    const b = this.ctx.game.state.buildings.list.find((x) => x.id === id);
    if (!b) return null;
    const def = this.ctx.game.data.building(b.def);
    const size = def?.size ?? [1, 1];
    const c = footprintCenter(b.x, b.z, size, b.rot);
    const [w] = rotatedSize(size, b.rot);
    return { x: c.x, y: this.ctx.heightAt(c.x, c.z), z: c.z, minX: c.x - (w * CELL) / 2, maxX: c.x + (w * CELL) / 2 };
  }

  private flash(id: Id, color: THREE.Color, seconds: number): void {
    const en = this.byId.get(id);
    if (!en) return;
    this.flashes.set(id, { until: this.ctx.env.t + seconds, color, base: en.col });
    for (const s of en.slots) s.batch.setColor(s.index, color);
  }

  private statusColor(b: BuildingInstance): THREE.Color {
    switch (b.status) {
      case 'off': return COLOR_OFF;
      case 'damaged': return COLOR_DAMAGED;
      case 'building': return COLOR_GHOST_BUILD;
      default: return COLOR_ACTIVE;
    }
  }

  // ------------------------------------------------------------------------------ rebuild

  /** Cheap hash over fields that change the static look (status/tier/level/position). */
  private hash(list: BuildingInstance[]): number {
    let h = list.length * 7919;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const st = b.status === 'active' ? 1 : b.status === 'building' ? 2 : b.status === 'damaged' ? 3 : 4;
      h = (h * 31 + b.id * 17 + st * 101 + b.tier * 1009 + b.level * 10007 + b.x * 131 + b.z * 137 + b.rot * 7) | 0;
    }
    return h;
  }

  private rebuild(): void {
    const ctx = this.ctx;
    const game = ctx.game;
    const list = game.state.buildings.list;
    for (const fb of this.facilityBatches.values()) {
      fb.body.begin();
      fb.entries.length = 0;
    }
    for (const pb of this.pieceBatches.values()) pb.begin();
    this.entries = [];
    this.byId.clear();
    this.constructing = [];

    // wall-like occupancy for connections
    this.wallMap.clear();
    for (const b of list) {
      const def = game.data.building(b.def);
      if (def?.piece && (WALL_LIKE.has(def.piece) || FENCE_LIKE.has(def.piece))) this.wallMap.set(cellIndex(b.x, b.z), def.piece);
    }

    for (const b of list) {
      const def = game.data.building(b.def);
      const tier = clamp(b.tier | 0, 0, game.data.tiers.length - 1);
      const style = tierStyle(game.data.tier(tier));
      const size = def?.size ?? [1, 1];
      const c = footprintCenter(b.x, b.z, size, b.rot);
      const [rw, rd] = rotatedSize(size, b.rot);
      const y = ctx.heightAt(c.x, c.z);
      const yaw = -(b.rot | 0) * (Math.PI / 2);
      const color = this.statusColor(b).clone().multiply(buildingTint(b.id));
      const entry: Entry = {
        id: b.id,
        b,
        def,
        spec: null,
        style,
        x: c.x,
        y,
        z: c.z,
        yaw,
        minX: c.x - (rw * CELL) / 2,
        maxX: c.x + (rw * CELL) / 2,
        minZ: c.z - (rd * CELL) / 2,
        maxZ: c.z + (rd * CELL) / 2,
        height: WALL_H,
        slots: [],
        emitAcc: null,
        turretYaw: 0,
        hasTarget: false,
        fade: this.bfades.get(b.id) ?? 0,
        col: color,
      };
      if (def?.piece) {
        this.buildPiece(entry, def.piece, style, color);
      } else {
        const key = def?.model ?? b.def;
        const spec = buildModel(key, style, Math.max(1, b.level | 0), def);
        entry.spec = spec;
        entry.height = spec.height;
        const fb = this.facilityBatch(`${key}|${tier}|${Math.max(1, b.level | 0)}|${size[0]}x${size[1]}`, spec);
        composeYaw(_m, c.x, y, c.z, yaw);
        this.pushSlot(entry, fb.body, c.x, y, c.z, yaw, color);
        fb.entries.push(entry);
        if (spec.emitters.length) entry.emitAcc = new Float32Array(spec.emitters.length);
        if (def?.shield) this.ensureShield(entry, def.shield.radius * CELL);
      }
      if (b.status === 'building') this.constructing.push(entry);
      this.entries.push(entry);
      this.byId.set(b.id, entry);
    }
    for (const fb of this.facilityBatches.values()) {
      fb.body.end();
      fb.body.freeze();
    }
    for (const pb of this.pieceBatches.values()) {
      pb.end();
      pb.freeze();
    }
    // flashes outlive the rebuild that their own event triggers (completed / upgraded / tier-up change the
    // status, level or tier): re-apply them to the new slots instead of dropping them before they are drawn
    for (const [id, f] of this.flashes) {
      const en = this.byId.get(id);
      if (!en) {
        this.flashes.delete(id);
        continue;
      }
      f.base = en.col;
      for (const sl of en.slots) sl.batch.setColor(sl.index, f.color);
    }
    // drop shields of removed buildings
    for (const [id, s] of this.shields) {
      if (!this.byId.has(id)) {
        this.group.remove(s.mesh);
        s.mat.dispose();
        this.shields.delete(id);
      }
    }
    this.rebuildRoofs();
  }

  private pushSlot(entry: Entry, batch: Batch, x: number, y: number, z: number, yaw: number, color: THREE.Color, sx = 1, sy = 1, sz = 1): void {
    composeYaw(_m, x, y, z, yaw, sx, sy, sz);
    const index = batch.count;
    batch.push(_m, color, entry.fade);
    entry.slots.push({ batch, index, x, y, z, yaw });
  }

  private pieceBatch(key: PieceGeoKey, style: TierStyle): Batch {
    const k = `${key}|${style.index}`;
    let b = this.pieceBatches.get(k);
    if (!b) {
      b = new Batch(this.group, pieceGeometry(key, style), this.ctx.mats.litFade, 32, this.pieceOpts);
      this.pieceBatches.set(k, b);
    }
    return b;
  }

  private facilityBatch(key: string, spec: ModelSpec): FacilityBatch {
    let fb = this.facilityBatches.get(key);
    if (!fb) {
      const body = new Batch(this.group, spec.geometry, this.ctx.mats.litFade, 8, this.bodyOpts);
      const parts = spec.parts.map((p) => new Batch(this.group, p.geometry, this.ctx.mats.litFade, 8, PART_OPTS));
      fb = { spec, body, parts, entries: [] };
      this.facilityBatches.set(key, fb);
    }
    return fb;
  }

  private neighbourKind(cx: number, cz: number): string | undefined {
    if (!inWorld(cx, cz)) return undefined;
    return this.wallMap.get(cellIndex(cx, cz));
  }

  private buildPiece(entry: Entry, piece: string, style: TierStyle, color: THREE.Color): void {
    const b = entry.b;
    const x = cellCenter(b.x);
    const z = cellCenter(b.z);
    const y = entry.y;
    const yaw = entry.yaw;
    const connects = (k: string | undefined, fence: boolean) => !!k && (fence ? FENCE_LIKE.has(k) || WALL_LIKE.has(k) : WALL_LIKE.has(k));
    const isFence = piece === 'fence';
    if (piece === 'wall' || isFence) {
      let arms = 0;
      let axisX = false;
      let axisZ = false;
      for (const [dx, dz] of DIRS) {
        if (connects(this.neighbourKind(b.x + dx, b.z + dz), isFence)) {
          arms++;
          if (dx !== 0) axisX = true;
          else axisZ = true;
        }
      }
      if (!isFence) this.pushSlot(entry, this.pieceBatch('floor', style), x, y, z, 0, color);
      if (arms === 0) {
        this.pushSlot(entry, this.pieceBatch(isFence ? 'fence_full' : 'wall_full', style), x, y, z, yaw, color);
      } else {
        // centre post + one arm per connected neighbour (arms meet flush at the cell edges)
        void axisX;
        void axisZ;
        this.pushSlot(entry, this.pieceBatch(isFence ? 'fence_core' : 'wall_core', style), x, y, z, 0, color);
        for (const [dx, dz, ang] of DIRS) {
          if (connects(this.neighbourKind(b.x + dx, b.z + dz), isFence)) this.pushSlot(entry, this.pieceBatch(isFence ? 'fence_arm' : 'wall_arm', style), x, y, z, ang, color);
        }
      }
      entry.height = isFence ? 1.4 : WALL_H;
      return;
    }
    if (piece === 'door' || piece === 'window' || piece === 'gate') {
      const nx = connects(this.neighbourKind(b.x + 1, b.z), true) || connects(this.neighbourKind(b.x - 1, b.z), true);
      const nz = connects(this.neighbourKind(b.x, b.z + 1), true) || connects(this.neighbourKind(b.x, b.z - 1), true);
      const along = nx && !nz ? 0 : nz && !nx ? Math.PI / 2 : b.rot % 2 === 0 ? 0 : Math.PI / 2;
      if (piece !== 'gate') this.pushSlot(entry, this.pieceBatch('floor', style), x, y, z, 0, color);
      this.pushSlot(entry, this.pieceBatch(piece as PieceGeoKey, style), x, y, z, along, color);
      entry.height = piece === 'gate' ? WALL_H + 0.6 : WALL_H;
      return;
    }
    const key = pieceFullKey(piece);
    if (piece === 'pillar') this.pushSlot(entry, this.pieceBatch('floor', style), x, y, z, 0, color);
    this.pushSlot(entry, this.pieceBatch(key, style), x, y, z, yaw, color);
    entry.height = piece === 'floor' ? 0.3 : piece === 'platform' ? 1.2 : piece === 'stairs' ? 1.2 : piece === 'roof' ? ROOF_Y + 0.4 : WALL_H;
  }

  // ------------------------------------------------------------------------------ roofs

  private rebuildRoofs(): void {
    const ctx = this.ctx;
    const derived = ctx.game.derived;
    for (const r of this.roofs) {
      this.roofGroup.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mat.dispose();
      r.depth.dispose();
    }
    this.roofs = [];
    const roofCells = derived.roofCells;
    if (!roofCells || roofCells.size === 0) return;
    const rooms = derived.rooms && derived.rooms.length ? derived.rooms : [{ id: 0, cells: [...roofCells], buildings: [] as Id[] }];
    const tierOf = (ids: Id[]): number => {
      const counts = new Map<number, number>();
      for (const id of ids) {
        const en = this.byId.get(id);
        if (!en || !en.def?.piece) continue;
        counts.set(en.b.tier, (counts.get(en.b.tier) ?? 0) + 1);
      }
      let best = -1;
      let bestN = -1;
      for (const [t, n] of counts) if (n > bestN) {
        best = t;
        bestN = n;
      }
      return best < 0 ? ctx.game.state.colony.tier : best;
    };
    for (const room of rooms) {
      const cells = new Set<number>(room.cells);
      // also cover the wall cells around the room so roofs sit flush on the walls
      for (const ci of room.cells) {
        const cx = ci % WORLD_CELLS;
        const cz = (ci / WORLD_CELLS) | 0;
        for (const [dx, dz] of DIRS) {
          const k = this.neighbourKind(cx + dx, cz + dz);
          if (k && WALL_LIKE.has(k)) cells.add(cellIndex(cx + dx, cz + dz));
        }
      }
      if (cells.size === 0) continue;
      let tier = tierOf(room.buildings);
      if (room.buildings.length === 0) {
        // infer from adjacent walls
        const ids: Id[] = [];
        for (const ci of cells) {
          for (const en of this.entries) if (en.def?.piece && cellIndex(en.b.x, en.b.z) === ci) ids.push(en.id);
        }
        tier = tierOf(ids);
      }
      const style = tierStyle(ctx.game.data.tier(clamp(tier, 0, ctx.game.data.tiers.length - 1)));
      const tile = pieceGeometry('roof_tile', style);
      const offsets = new Float32Array(cells.size * 2);
      let k = 0;
      let ySum = 0;
      let minX = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxZ = -Infinity;
      for (const ci of cells) {
        const cx = ci % WORLD_CELLS;
        const cz = (ci / WORLD_CELLS) | 0;
        const wx = cellCenter(cx);
        const wz = cellCenter(cz);
        offsets[k * 2] = wx;
        offsets[k * 2 + 1] = wz;
        ySum += ctx.heightAt(wx, wz);
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
        if (wz < minZ) minZ = wz;
        if (wz > maxZ) maxZ = wz;
        k++;
      }
      const geo = mergeCopies(tile, offsets, ySum / cells.size);
      const mat = ctx.mats.makeRoof();
      const fade = { value: 0 };
      const depth = ctx.mats.makeRoofDepth(fade);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.customDepthMaterial = depth;
      mesh.matrixAutoUpdate = false;
      this.roofGroup.add(mesh);
      this.roofs.push({ mesh, mat, depth, fade, cells, opacity: 1, minX: minX - CELL / 2, minZ: minZ - CELL / 2, maxX: maxX + CELL / 2, maxZ: maxZ + CELL / 2, y: ySum / cells.size, occluded: false });
    }
  }

  private updateRoofs(dt: number): void {
    if (!this.roofs.length) return;
    const p = this.ctx.game.state.player;
    const pcx = Math.floor((p.x + (WORLD_CELLS * CELL) / 2) / CELL);
    const pcz = Math.floor((p.z + (WORLD_CELLS * CELL) / 2) / CELL);
    const view = this.ctx.game.view;
    const camLow = this.ctx.env.camY < ROOF_Y + 2;
    for (const r of this.roofs) {
      let inside = false;
      for (let dz = -1; dz <= 1 && !inside; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (inWorld(pcx + dx, pcz + dz) && r.cells.has(cellIndex(pcx + dx, pcz + dz))) {
          inside = true;
          break;
        }
      }
      const target = inside || camLow || view.mode === 'build' || r.occluded ? 0.12 : 1;
      const k = 1 - Math.exp(-dt * 8);
      r.opacity += (target - r.opacity) * k;
      r.mat.opacity = r.opacity;
      r.mesh.visible = r.opacity > 0.02;
      // the shadow dithers away with the opacity (gone a little before the see-through state)
      r.fade.value = 1 - r.opacity;
      r.mesh.castShadow = r.mesh.visible;
    }
  }

  // ------------------------------------------------------------------------------ shields

  private ensureShield(entry: Entry, radius: number): void {
    let s = this.shields.get(entry.id);
    if (!s) {
      const mat = this.ctx.mats.shield.clone();
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), mat);
      mesh.renderOrder = 6;
      this.group.add(mesh);
      s = { mesh, mat, ripple: 0 };
      this.shields.set(entry.id, s);
    }
    s.mesh.position.set(entry.x, entry.y, entry.z);
    s.mesh.scale.setScalar(radius);
    s.mesh.visible = entry.b.status === 'active';
  }

  // ------------------------------------------------------------------------------ frame

  update(dt: number): void {
    const ctx = this.ctx;
    const game = ctx.game;
    const env = ctx.env;
    const list = game.state.buildings.list;
    const version = game.derived.buildingsVersion;
    const h = this.hash(list);
    if (version !== this.lastVersion || h !== this.lastHash || env.terrainVersion !== this.lastTerrain) {
      this.lastVersion = version;
      this.lastHash = h;
      this.lastTerrain = env.terrainVersion;
      this.rebuild();
      this.lastRoofVersion = version;
      this.lastRoofSize = game.derived.roofCells?.size ?? 0;
    } else if ((game.derived.roofCells?.size ?? 0) !== this.lastRoofSize || version !== this.lastRoofVersion) {
      this.lastRoofSize = game.derived.roofCells?.size ?? 0;
      this.lastRoofVersion = version;
      this.rebuildRoofs();
    }

    this.updateConstruction(dt);
    this.updateFlashes();
    this.updateOcclusion(dt);
    this.updateParts(dt);
    this.updateRoofs(dt);
    this.updateLights(dt);
    this.updateShields(dt);
  }

  private updateConstruction(dt: number): void {
    const ctx = this.ctx;
    this.scaffold.begin();
    this.dustAcc += dt;
    const puff = this.dustAcc > 0.25;
    if (puff) this.dustAcc = 0;
    for (const en of this.constructing) {
      const p = clamp(en.b.progress, 0, 1);
      // piece-by-piece: rise in steps with a soft bounce on every step
      const steps = 6;
      const q = Math.floor(p * steps) / steps;
      const frac = p * steps - Math.floor(p * steps);
      const bounce = Math.sin(Math.min(1, frac * 1.6) * Math.PI) * 0.06;
      const sy = Math.max(0.06, q + frac / steps + bounce);
      for (const s of en.slots) {
        composeYaw(_m, s.x, s.y, s.z, s.yaw, 1, sy, 1);
        s.batch.setMatrix(s.index, _m);
      }
      if (p < 0.97) {
        const w = (en.maxX - en.minX) / 2;
        const d = (en.maxZ - en.minZ) / 2;
        composeYaw(_m, en.x, en.y, en.z, 0, w, Math.max(0.6, en.height / 3.2), d);
        this.scaffold.push(_m);
        if (puff && inView(ctx.env, en.x, en.z)) ctx.particles.dust(en.x + (Math.random() - 0.5) * w * 1.5, en.y, en.z + (Math.random() - 0.5) * d * 1.5, 2, 0.4);
      }
    }
    this.scaffold.end();
  }

  private updateFlashes(): void {
    if (!this.flashes.size) return;
    const t = this.ctx.env.t;
    for (const [id, f] of this.flashes) {
      if (t >= f.until) {
        const en = this.byId.get(id);
        if (en) for (const s of en.slots) s.batch.setColor(s.index, f.base);
        this.flashes.delete(id);
      }
    }
  }

  /** Nearest targetable alien for a turret entry, writing the aim yaw into the entry. */
  private aimTurret(en: Entry, dt: number): void {
    const def = en.def;
    const turret = def?.turret;
    const aliens = this.ctx.game.state.combat.aliens;
    let best = -1;
    let bestD = turret ? (turret.range * CELL * 1.15) ** 2 : 0;
    if (turret && en.b.status === 'active') {
      for (let i = 0; i < aliens.length; i++) {
        const a = aliens[i];
        if (a.state === 'dying' || a.state === 'spawning') continue;
        const adef = this.ctx.game.data.alien(a.def);
        if (adef?.flying && !turret.antiAir) continue;
        if (!adef?.flying && turret.airOnly) continue;
        const dx = a.x - en.x;
        const dz = a.z - en.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    if (best >= 0) {
      const a = aliens[best];
      const want = Math.atan2(a.x - en.x, a.z - en.z) - en.yaw;
      en.turretYaw = approachAngle(en.turretYaw, want, dt * 5);
      en.hasTarget = true;
    } else {
      // idle scan
      en.hasTarget = false;
      const idle = Math.sin(this.ctx.env.t * 0.4 + en.id) * 0.6;
      en.turretYaw = approachAngle(en.turretYaw, idle, dt * 0.8);
    }
  }

  private updateParts(dt: number): void {
    const ctx = this.ctx;
    const env = ctx.env;
    const t = env.t;
    for (const fb of this.facilityBatches.values()) {
      const spec = fb.spec;
      const hasParts = fb.parts.length > 0;
      const hasEmit = spec.emitters.length > 0;
      if (!hasParts && !hasEmit && !spec.light) continue;
      for (const pb of fb.parts) pb.begin();
      for (const en of fb.entries) {
        const b = en.b;
        const active = b.status === 'active';
        const eff = active ? clamp(b.eff ?? 1, 0, 1.5) || 0 : 0;
        const running = active && (b.eff == null || b.eff > 0.02);
        const visible = inView(env, en.x, en.z, 10);
        const buildingScale = b.status === 'building' ? Math.max(0.06, b.progress) : 1;
        // parts
        if (hasParts && visible) {
          const phase = en.id * 1.37;
          for (let pi = 0; pi < spec.parts.length; pi++) {
            const p = spec.parts[pi];
            const speed = running ? p.speed * Math.max(0.35, eff) : 0;
            let rx = 0;
            let ry = 0;
            let rz = 0;
            let ox = 0;
            let oy = 0;
            switch (p.anim) {
              case 'spinY': ry = (t * speed + phase) % (Math.PI * 2); break;
              case 'spinX': rx = (t * speed + phase) % (Math.PI * 2); break;
              case 'spinZ': rz = (t * speed + phase) % (Math.PI * 2); break;
              case 'wheel': rz = (t * speed * 0.6 + phase) % (Math.PI * 2); break;
              case 'turret':
                this.aimTurret(en, dt);
                ry = en.turretYaw;
                break;
              case 'bob': oy = Math.sin(t * speed * 1.5 + phase) * p.amp; break;
              case 'bobSpin':
                oy = Math.sin(t * speed * 1.5 + phase) * p.amp;
                ry = (t * speed * 0.8 + phase) % (Math.PI * 2);
                break;
              case 'pump': oy = -(Math.sin(t * speed + phase) * 0.5 + 0.5) * p.amp; break;
              case 'rock': rx = Math.sin(t * speed + phase) * p.amp; break;
              case 'sway':
                rz = Math.sin(t * p.speed + phase) * p.amp * (running || p.speed > 2 ? 1 : 0.4);
                rx = Math.cos(t * p.speed * 0.7 + phase) * p.amp * 0.5;
                break;
              case 'scroll': {
                const span = p.amp * 2;
                ox = (((t * speed + phase) % span) + span) % span - p.amp;
                break;
              }
              case 'slide': {
                const span = p.amp * 2;
                const u = (((t * speed * 0.5 + phase) % span) + span) % span;
                ox = (u < p.amp ? u : span - u) - p.amp / 2;
                break;
              }
            }
            composeYaw(_m, en.x, en.y, en.z, en.yaw, 1, buildingScale, 1);
            composeEuler(_m2, p.x + ox, p.y + oy, p.z, rx, ry, rz);
            _m.multiply(_m2);
            const color = this.flashes.get(en.id)?.color ?? en.col;
            fb.parts[pi].push(_m, color, en.fade);
          }
        }
        // emitters
        if (hasEmit && running && visible && en.emitAcc && inView(env, en.x, en.z, -20)) {
          const sy = Math.sin(en.yaw);
          const cy = Math.cos(en.yaw);
          for (let ei = 0; ei < spec.emitters.length; ei++) {
            const e = spec.emitters[ei];
            en.emitAcc[ei] += e.rate * dt * Math.max(0.4, eff) * ctx.particles.scale;
            while (en.emitAcc[ei] >= 1) {
              en.emitAcc[ei] -= 1;
              const wx = en.x + e.x * cy + e.z * sy;
              const wz = en.z - e.x * sy + e.z * cy;
              const wy = en.y + e.y;
              switch (e.kind) {
                case 'smoke': ctx.particles.smoke(wx, wy, wz, 0.4, env.night > 0.5 ? '#2f2c33' : '#6b6b70'); break;
                case 'steam': ctx.particles.steam(wx, wy, wz); break;
                case 'fire': ctx.particles.fire(wx, wy, wz, 0.3); break;
                case 'sparks': ctx.particles.sparks(wx, wy, wz, 2, e.color ?? '#ffd36b', 2.5); break;
                case 'motes': ctx.particles.emit('glow', wx + (Math.random() - 0.5) * 1.2, wy + (Math.random() - 0.5) * 0.8, wz + (Math.random() - 0.5) * 1.2, 0, 0.6 + Math.random() * 0.5, 0, 1.2, 0.12, e.color ?? '#ffffff', { drag: 0.5, curve: 'grow' }); break;
                case 'drips': ctx.particles.emit('soft', wx + (Math.random() - 0.5) * 0.4, wy, wz + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.8, 0.5, (Math.random() - 0.5) * 0.8, 0.7, 0.1, e.color ?? '#9fdcff', { gravity: -9 }); break;
                case 'dust': ctx.particles.dust(wx, wy, wz, 1, 0.8, '#b8aa90'); break;
              }
            }
          }
        }
        // damaged buildings smoulder
        if (b.status === 'damaged' && visible && Math.random() < dt * 2.5) ctx.particles.smoke(en.x + (Math.random() - 0.5) * 1.2, en.y + 0.8, en.z + (Math.random() - 0.5) * 1.2, 0.45, '#3f3a40', 1.6);
      }
      for (const pb of fb.parts) pb.end();
    }
  }

  /**
   * Dither away buildings that stand between the camera and the player (and the build ghost): scan
   * at 10 Hz with a segment/AABB test, animate the per-instance fade every frame. Roofs on a sight
   * line drop to their see-through opacity.
   */
  private updateOcclusion(dt: number): void {
    const ctx = this.ctx;
    const env = ctx.env;
    this.occAcc += dt;
    if (this.occAcc >= 0.1) {
      this.occAcc = 0;
      this.occluders.clear();
      for (const r of this.roofs) r.occluded = false;
      const nt = sightTargets(ctx, _targets);
      for (let ti = 0; ti < nt; ti++) {
        const tx = _targets[ti * 3];
        const ty = _targets[ti * 3 + 1];
        const tz = _targets[ti * 3 + 2];
        _o.set(env.camX, env.camY, env.camZ);
        _d.set(tx - env.camX, ty - env.camY, tz - env.camZ);
        const len = _d.length();
        if (len < 1) continue;
        _d.divideScalar(len);
        // XZ bounds of the sight line: cheap reject before the slab test
        const bx0 = Math.min(tx, env.camX) - OCCLUDE_MARGIN;
        const bx1 = Math.max(tx, env.camX) + OCCLUDE_MARGIN;
        const bz0 = Math.min(tz, env.camZ) - OCCLUDE_MARGIN;
        const bz1 = Math.max(tz, env.camZ) + OCCLUDE_MARGIN;
        for (const en of this.entries) {
          if (en.height < 1 || en.maxX < bx0 || en.minX > bx1 || en.maxZ < bz0 || en.minZ > bz1) continue;
          const t = slabTest(_o, _d, en.minX - OCCLUDE_MARGIN, en.y - 0.3, en.minZ - OCCLUDE_MARGIN, en.maxX + OCCLUDE_MARGIN, en.y + en.height, en.maxZ + OCCLUDE_MARGIN);
          if (t >= 0 && t < len) this.occluders.add(en.id);
        }
        for (const r of this.roofs) {
          if (r.occluded || r.maxX < bx0 || r.minX > bx1 || r.maxZ < bz0 || r.minZ > bz1) continue;
          const t = slabTest(_o, _d, r.minX, r.y + ROOF_Y - 0.2, r.minZ, r.maxX, r.y + ROOF_Y + 0.6, r.maxZ);
          if (t >= 0 && t < len) r.occluded = true;
        }
      }
      for (const id of this.occluders) if (!this.bfades.has(id)) this.bfades.set(id, 0);
    }
    if (!this.bfades.size) return;
    for (const [id, f0] of this.bfades) {
      const on = this.occluders.has(id);
      const f = on ? Math.min(FADE_MAX, f0 + dt * 4) : Math.max(0, f0 - dt * 2.5);
      if (f === f0 && on) continue;
      if (f <= 0) this.bfades.delete(id);
      else this.bfades.set(id, f);
      const en = this.byId.get(id);
      if (!en) {
        this.bfades.delete(id);
        continue;
      }
      en.fade = f;
      for (const s of en.slots) s.batch.setFade(s.index, f);
    }
  }

  private updateLights(dt: number): void {
    const ctx = this.ctx;
    const env = ctx.env;
    const want = env.quality === 'low' ? 0 : env.quality === 'high' ? 4 : 3;
    while (this.lights.length < want) {
      const l = new THREE.PointLight('#ffc877', 0, 10, 2);
      l.castShadow = false;
      this.group.add(l);
      this.lights.push(l);
      this.lightEntries.push(null);
    }
    while (this.lights.length > want) {
      const l = this.lights.pop()!;
      this.group.remove(l);
      l.dispose();
      this.lightEntries.pop();
    }
    if (!want) return;
    this.lightTimer -= dt;
    const night = clamp((env.night - 0.1) / 0.6, 0, 1);
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.5;
      // choose the nearest light-bearing active buildings to the focus point
      const cands: Entry[] = [];
      for (const en of this.entries) if (en.spec?.light && en.b.status === 'active') cands.push(en);
      cands.sort((a, b) => (a.x - env.cx) ** 2 + (a.z - env.cz) ** 2 - ((b.x - env.cx) ** 2 + (b.z - env.cz) ** 2));
      for (let i = 0; i < this.lights.length; i++) this.lightEntries[i] = cands[i] ?? null;
    }
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const en = this.lightEntries[i];
      if (!en || !en.spec?.light || night <= 0.001) {
        l.intensity += (0 - l.intensity) * (1 - Math.exp(-dt * 6));
        continue;
      }
      const ls = en.spec.light;
      const sy = Math.sin(en.yaw);
      const cy = Math.cos(en.yaw);
      l.position.set(en.x + ls.x * cy + ls.z * sy, en.y + ls.y, en.z - ls.x * sy + ls.z * cy);
      l.color.set(ls.color);
      l.distance = ls.range;
      const flicker = en.def?.model === 'campfire' || en.def?.model === 'forge' ? 0.85 + Math.sin(env.t * 11 + en.id) * 0.1 + Math.sin(env.t * 23) * 0.05 : 1;
      const target = ls.intensity * 7 * night * flicker;
      l.intensity += (target - l.intensity) * (1 - Math.exp(-dt * 6));
    }
  }

  private updateShields(dt: number): void {
    if (!this.shields.size) return;
    const env = this.ctx.env;
    // shields idle as a faint shimmer (a late-game colony is covered by several huge domes — at full
    // strength they tint the whole view) and power up while an invasion is announced or under way
    const phase = this.ctx.game.state.combat.phase;
    const want = phase === 'attack' || phase === 'warning' ? 1 : 0;
    this.shieldAlert += (want - this.shieldAlert) * Math.min(1, dt * 1.5);
    const base = 0.025 + this.shieldAlert * 0.045;
    for (const [id, s] of this.shields) {
      const en = this.byId.get(id);
      if (!en) continue;
      s.mesh.visible = en.b.status === 'active';
      s.ripple = Math.max(0, s.ripple - dt * 2.2);
      const pulse = base + env.night * (0.02 + this.shieldAlert * 0.03) + Math.sin(env.t * 1.5 + id) * (0.008 + this.shieldAlert * 0.01);
      s.mat.opacity = pulse + s.ripple * 0.35;
      const r = (en.def?.shield?.radius ?? 4) * CELL * (1 + s.ripple * 0.04);
      s.mesh.scale.setScalar(r);
    }
  }

  private muzzleFlash(building: Id, kind: string, x: number, z: number, tx: number, tz: number): void {
    const en = this.byId.get(building);
    const ctx = this.ctx;
    const bx = en?.x ?? x;
    const bz = en?.z ?? z;
    const by = en?.y ?? ctx.heightAt(bx, bz);
    const spec = en?.spec;
    let mx = bx;
    let my = by + 1.2;
    let mz = bz;
    if (spec && spec.muzzle) {
      const part = spec.parts.find((p) => p.anim === 'turret');
      const yaw = (en?.yaw ?? 0) + (en?.turretYaw ?? 0);
      const sy = Math.sin(yaw);
      const cy = Math.cos(yaw);
      const px = part?.x ?? 0;
      const py = part?.y ?? 1;
      const pz = part?.z ?? 0;
      // part pivot (building-local, rotated by building yaw) + muzzle (rotated by total yaw)
      const bsy = Math.sin(en?.yaw ?? 0);
      const bcy = Math.cos(en?.yaw ?? 0);
      mx = bx + px * bcy + pz * bsy + spec.muzzle.x * cy + spec.muzzle.z * sy;
      mz = bz - px * bsy + pz * bcy - spec.muzzle.x * sy + spec.muzzle.z * cy;
      my = by + py + spec.muzzle.y;
    } else {
      const dx = tx - bx;
      const dz = tz - bz;
      const len = Math.hypot(dx, dz) || 1;
      mx = bx + (dx / len) * 0.8;
      mz = bz + (dz / len) * 0.8;
    }
    if (!inView(ctx.env, mx, mz, 10)) return;
    switch (kind) {
      case 'flame': ctx.particles.flash(mx, my, mz, 0.5, '#ff9a2e', 0.1); break;
      case 'laser': ctx.particles.flash(mx, my, mz, 0.45, '#ff5a6e', 0.08); break;
      case 'plasma': ctx.particles.flash(mx, my, mz, 0.7, '#58d0ff', 0.14); break;
      case 'rail': ctx.particles.flash(mx, my, mz, 0.8, '#bfe6ff', 0.12); ctx.particles.sparks(mx, my, mz, 6, '#bfe6ff', 4); break;
      case 'missile': ctx.particles.smoke(mx, my, mz, 0.5, '#9a9aa0', 1.2); ctx.particles.flash(mx, my, mz, 0.5, '#ffb347', 0.1); break;
      case 'cannon': ctx.particles.flash(mx, my, mz, 1.0, '#ffb347', 0.14); ctx.particles.smoke(mx, my, mz, 0.6, '#6b6b70', 1.4); break;
      case 'arrow': break;
      default: ctx.particles.flash(mx, my, mz, 0.45, '#ffe08a', 0.07); ctx.particles.sparks(mx, my, mz, 2, '#ffd36b', 3);
    }
  }

  // ------------------------------------------------------------------------------ queries

  /** World-space info of a building for selection rings / focus. */
  centerOf(id: Id): { x: number; y: number; z: number; radius: number; height: number } | null {
    const en = this.byId.get(id);
    if (!en) return null;
    return { x: en.x, y: en.y, z: en.z, radius: Math.max(en.maxX - en.minX, en.maxZ - en.minZ) / 2 + 0.3, height: en.height };
  }

  /** Ray/AABB picking over all buildings; returns the id of the nearest hit and its distance. */
  pick(ray: THREE.Ray, maxT: number): { id: Id; t: number } | null {
    let best: Entry | null = null;
    let bestT = maxT;
    const o = ray.origin;
    const d = ray.direction;
    for (const en of this.entries) {
      const t = slabTest(o, d, en.minX, en.y - 0.3, en.minZ, en.maxX, en.y + en.height, en.maxZ);
      if (t >= 0 && t < bestT) {
        bestT = t;
        best = en;
      }
    }
    return best ? { id: best.id, t: bestT } : null;
  }

  dispose(): void {
    for (const u of this.unsub) u();
    for (const b of this.pieceBatches.values()) b.dispose();
    for (const fb of this.facilityBatches.values()) {
      fb.body.dispose();
      for (const p of fb.parts) p.dispose();
    }
    for (const r of this.roofs) {
      r.mesh.geometry.dispose();
      r.mat.dispose();
      r.depth.dispose();
    }
    for (const s of this.shields.values()) s.mat.dispose();
    this.scaffold.dispose();
    this.ctx.scene.remove(this.group);
    this.ctx.scene.remove(this.roofGroup);
  }
}

/** Ray vs axis-aligned box (slab method). Returns entry distance or -1. */
export function slabTest(o: THREE.Vector3, d: THREE.Vector3, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): number {
  let tmin = -Infinity;
  let tmax = Infinity;
  const axes: [number, number, number, number][] = [
    [o.x, d.x, minX, maxX],
    [o.y, d.y, minY, maxY],
    [o.z, d.z, minZ, maxZ],
  ];
  for (const [oa, da, lo, hi] of axes) {
    if (Math.abs(da) < 1e-9) {
      if (oa < lo || oa > hi) return -1;
      continue;
    }
    let t1 = (lo - oa) / da;
    let t2 = (hi - oa) / da;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  return Math.max(0, tmin);
}

void _c;
void cellMin;
