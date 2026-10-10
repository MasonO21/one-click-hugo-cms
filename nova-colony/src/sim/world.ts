/**
 * WorldSystem — deterministic world generation from the seed (regions/biomes, terrain height & color,
 * water, resource nodes, POIs, beacons), region discovery/unlock, fog of war, node depletion
 * & respawn, POI looting, fast-travel targets.
 *
 * OWNER: world agent. Writes state.world. Generated data (not saved) lives in `this.gen`.
 *
 * Generation lives in `./world/generate.ts` (pure, deterministic, <~100 ms desktop); node queries use a
 * static bucket grid (`./world/grid.ts`); fog is a 64x64 bitset (`./world/fog.ts`).
 */
import { System } from './System';
import type { BiomeDef, NodeDef, PoiDef, ResourceBag } from '../data/schema';
import { ANCHOR_IDS } from '../data/schema';
import { CELL, HALF_WORLD, WORLD_CELLS, cellOf } from '../core/constants';
import { bagEntries } from '../core/bag';
import type { Id, PoiState } from '../core/state';
import { generateWorld } from './world/generate';
import { NodeGrid } from './world/grid';
import { Fog } from './world/fog';
import { lootThinning, rollPoiLoot } from './world/poiLoot';

export interface WorldNode {
  /** Stable index (used as key in state.world.depleted). */
  i: number;
  def: string;
  x: number;
  z: number;
  /** Rotation (radians) and scale jitter for render. */
  rot: number;
  scale: number;
  region: string;
  /** Hits remaining in the current cycle (runtime only). */
  hits: number;
}

export interface WorldPoi {
  /** Stable instance id, e.g. "poi_12". */
  id: string;
  def: string;
  x: number;
  z: number;
  region: string;
  rot: number;
}

export interface WorldProp {
  model: string;
  x: number;
  z: number;
  rot: number;
  scale: number;
}

export interface WorldGen {
  /** Region id per cell (index = cellIndex), as indices into regionIds. */
  regionMap: Uint8Array;
  regionIds: string[];
  /** Terrain height per vertex on a (WORLD_CELLS+1)^2 grid (world units). */
  heights: Float32Array;
  /** Water cells (impassable). Water surface is at `WATER_LEVEL` (see ./world/generate). */
  water: Uint8Array;
  nodes: WorldNode[];
  pois: WorldPoi[];
  props: WorldProp[];
  /** Representative (inside-the-region) position per region, for map labels / camera focus. */
  regionCenters: { id: string; x: number; z: number }[];
  /** Bumped when `pois` changes at runtime (dynamic survivor camps) so the renderer can refresh. */
  version: number;
}

declare module '../core/state' {
  interface WorldState {
    /** POIs spawned at runtime (tutorial survivor camps); regenerated from this on load. */
    dynamicPois?: { id: string; def: string; x: number; z: number; region: string; rot: number }[];
    /** Fractional gather yield carried between hits (keeps x1.25 yields exact over time). */
    gatherCarry?: Record<string, number>;
    nextDynPoi?: number;
    /** Epoch ms of the points of interest opened within the last hour (long sweeps thin out: sim/world/poiLoot.ts). */
    lootLog?: number[];
  }
}

declare module '../core/events' {
  interface GameEvents {
    /** The player crossed into another region (HUD banner / music mood). */
    'world:regionEntered': { id: string };
    /** A POI appeared at runtime (e.g. tutorial survivor signal). */
    'world:poiSpawned': { id: string; poi: string };
    /** A depleted resource node grew back. */
    'world:nodeRespawned': { node: number };
    /** A looted cache / wreck / nest filled up again (also on load, for time away). */
    'world:poiRestocked': { id: string; poi: string };
  }
}

export { WATER_LEVEL } from './world/generate';

const N = WORLD_CELLS;
const FOG_REVEAL_RADIUS = 24;
const POI_DISCOVER_RADIUS = 25;
const NEST_TRIGGER_RADIUS = 18;
/** Stored `depleted` value for nodes covered by buildings (JSON-safe: >= 1e299 is read back as Infinity). */
const COVERED = Number.POSITIVE_INFINITY;

const EMPTY_DEF: NodeDef = { id: '?', name: '?', model: 'rock', drop: {}, hits: 1, respawn: 60, toolTier: 0, scale: 1, solid: false };

export class WorldSystem extends System {
  gen!: WorldGen;
  fog = new Fog();
  /** Static bucket grid over nodes (shared with the player's collision code). */
  readonly grid = new NodeGrid();
  /** Region id the player is currently in. */
  currentRegion: string = ANCHOR_IDS.startRegion;

  private nodeDefs: NodeDef[] = [];
  private solidRadius = new Float32Array(0);
  private poiById = new Map<string, WorldPoi>();
  private unlockedMask = new Uint8Array(0);
  private lastUnlockedLen = -1;
  private scratch = new Int32Array(1024);
  private curRegionIdx = -1;
  private lastFogCell = -1;
  private poiTimer = 0;
  /** Nests whose guardians have been spawned this session (guards are transient). */
  private guarded = new Set<string>();

  // ================================================================== lifecycle

  override init(): void {
    const bus = this.game.bus;
    const recheck = () => {
      if (this.gen) this.refreshUnlocks(true);
    };
    bus.on('colony:tierUp', recheck);
    bus.on('research:completed', recheck);
    bus.on('mission:completed', recheck);
    bus.on('mission:claimed', recheck);
    bus.on('tick:second', () => {
      if (!this.gen) return;
      this.syncMask();
      this.respawnNodes();
      this.respawnPois();
    });
  }

  override onLoad(fresh: boolean): void {
    const g = this.game;
    const st = g.state;
    this.gen = generateWorld(g.data, st.seed);
    for (const d of st.world.dynamicPois ?? []) this.gen.pois.push({ ...d });
    this.gen.version = 1;
    this.indexWorld();
    this.fog.decode(st.world.fog);
    this.syncMask();
    // caches that filled up while the app was closed (absolute timers)
    if (!fresh) this.respawnPois();

    // depleted nodes have no hits left
    for (const k in st.world.depleted) {
      const n = this.gen.nodes[+k];
      if (n) n.hits = 0;
    }

    if (fresh) {
      for (const b of g.data.biomes) {
        if (this.conditionsMet(b)) {
          if (!st.world.regionsUnlocked.includes(b.id)) st.world.regionsUnlocked.push(b.id);
          if (!st.world.regionsDiscovered.includes(b.id)) st.world.regionsDiscovered.push(b.id);
        }
      }
      // the player spawns just outside the pod
      this.revealAround(0, 5);
    } else {
      this.refreshUnlocks(false);
      this.revealAround(st.player.x, st.player.z);
    }
    this.syncMask();
    this.curRegionIdx = this.regionIndexAt(st.player.x, st.player.z);
    this.currentRegion = this.gen.regionIds[this.curRegionIdx] ?? ANCHOR_IDS.startRegion;
  }

  private indexWorld(): void {
    const { nodes, pois } = this.gen;
    const data = this.game.data;
    this.nodeDefs = new Array(nodes.length);
    this.solidRadius = new Float32Array(nodes.length);
    const xs = new Float32Array(nodes.length);
    const zs = new Float32Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const def = data.node(n.def) ?? EMPTY_DEF;
      this.nodeDefs[i] = def;
      this.solidRadius[i] = def.solid ? Math.min(1.2, 0.55 * n.scale) : 0;
      xs[i] = n.x;
      zs[i] = n.z;
    }
    this.grid.build(xs, zs, nodes.length);
    this.poiById.clear();
    for (const p of pois) this.poiById.set(p.id, p);
  }

  override update(dt: number): void {
    if (!this.gen) return;
    const st = this.game.state;
    const p = st.player;
    if (st.world.regionsUnlocked.length !== this.lastUnlockedLen) this.syncMask();

    // region transitions (+ first-time discovery)
    const idx = this.regionIndexAt(p.x, p.z);
    if (idx !== this.curRegionIdx) {
      this.curRegionIdx = idx;
      this.currentRegion = this.gen.regionIds[idx];
      this.game.bus.emit('world:regionEntered', { id: this.currentRegion });
      this.checkDiscovery();
    }

    // fog of war: only when the player steps into a new fog cell
    const fc = Fog.axis(p.z) * 64 + Fog.axis(p.x);
    if (fc !== this.lastFogCell) {
      this.lastFogCell = fc;
      this.revealAround(p.x, p.z);
    }

    this.poiTimer -= dt;
    if (this.poiTimer <= 0) {
      this.poiTimer = 0.2;
      this.scanPois();
    }
  }

  // ================================================================== regions

  /** Region index (into gen.regionIds) at a world position. Allocation-free. */
  regionIndexAt(x: number, z: number): number {
    let cx = Math.floor((x + HALF_WORLD) / CELL);
    let cz = Math.floor((z + HALF_WORLD) / CELL);
    cx = cx < 0 ? 0 : cx >= N ? N - 1 : cx;
    cz = cz < 0 ? 0 : cz >= N ? N - 1 : cz;
    return this.gen.regionMap[cz * N + cx];
  }

  /** Region id at a world position. */
  regionAt(x: number, z: number): string {
    if (!this.gen) return ANCHOR_IDS.startRegion;
    return this.gen.regionIds[this.regionIndexAt(x, z)];
  }

  /** Region id of a cell. */
  regionAtCell(cx: number, cz: number): string {
    cx = cx < 0 ? 0 : cx >= N ? N - 1 : cx;
    cz = cz < 0 ? 0 : cz >= N ? N - 1 : cz;
    return this.gen.regionIds[this.gen.regionMap[cz * N + cx]];
  }

  isUnlocked(regionId: string): boolean {
    return this.game.state.world.regionsUnlocked.includes(regionId);
  }

  /** Fast unlocked test by region index (used by collision). */
  isUnlockedIdx(idx: number): boolean {
    return this.unlockedMask[idx] === 1;
  }

  isDiscovered(regionId: string): boolean {
    return this.game.state.world.regionsDiscovered.includes(regionId);
  }

  private syncMask(): void {
    const u = this.game.state.world.regionsUnlocked;
    const ids = this.gen.regionIds;
    if (this.unlockedMask.length !== ids.length) this.unlockedMask = new Uint8Array(ids.length);
    for (let i = 0; i < ids.length; i++) this.unlockedMask[i] = u.includes(ids[i]) ? 1 : 0;
    this.lastUnlockedLen = u.length;
  }

  /** Do all unlock conditions of a region hold right now? */
  conditionsMet(b: BiomeDef): boolean {
    const st = this.game.state;
    const u = b.unlock;
    if (u.tier !== undefined && st.colony.tier < u.tier) return false;
    if (u.research && !st.research.completed.includes(u.research)) return false;
    if (u.mission && !st.missions.completed.includes(u.mission)) return false;
    return true;
  }

  /** Human-readable unlock requirement for a locked region (e.g. "Reach Stone tier"). */
  lockReason(regionId: string): string | null {
    const b = this.game.data.biome(regionId);
    if (!b || this.isUnlocked(regionId)) return null;
    const st = this.game.state;
    const data = this.game.data;
    const parts: string[] = [];
    const u = b.unlock;
    if (u.tier !== undefined && st.colony.tier < u.tier) parts.push(`Reach ${data.tier(u.tier).name} tier`);
    if (u.research && !st.research.completed.includes(u.research)) {
      parts.push(`Research ${data.researchDef(u.research)?.name ?? u.research}`);
    }
    if (u.mission && !st.missions.completed.includes(u.mission)) {
      parts.push(`Complete "${data.mission(u.mission)?.name ?? u.mission}"`);
    }
    return parts.length ? parts.join(' · ') : 'Explore further';
  }

  /** Unlock every region whose conditions now hold. `announce` emits events + toasts. */
  refreshUnlocks(announce: boolean): void {
    const st = this.game.state;
    let changed = false;
    for (const b of this.game.data.biomes) {
      if (st.world.regionsUnlocked.includes(b.id) || !this.conditionsMet(b)) continue;
      st.world.regionsUnlocked.push(b.id);
      changed = true;
      if (announce) {
        this.game.bus.emit('world:regionUnlocked', { id: b.id });
        this.game.toast(`🔓 ${b.name} is now accessible!`, 'success');
      }
    }
    if (changed) {
      this.syncMask();
      this.checkDiscovery();
    }
  }

  /** Discover the region the player is standing in if it is unlocked and new. */
  private checkDiscovery(): void {
    const id = this.currentRegion;
    const st = this.game.state;
    if (!this.isUnlocked(id) || st.world.regionsDiscovered.includes(id)) return;
    const b = this.game.data.biome(id);
    st.world.regionsDiscovered.push(id);
    st.stats.explored++;
    this.revealAround(st.player.x, st.player.z, FOG_REVEAL_RADIUS * 2);
    this.game.bus.emit('world:regionDiscovered', { id });
    this.game.bus.emit('ui:celebrate', { title: `${b?.name ?? id} discovered!`, text: b?.description, icon: '🧭' });
  }

  // ================================================================== terrain

  /** Terrain height at a world position (bilinear). */
  heightAt(x: number, z: number): number {
    const V = N + 1;
    let gx = (x + HALF_WORLD) / CELL;
    let gz = (z + HALF_WORLD) / CELL;
    gx = gx < 0 ? 0 : gx > N - 1e-6 ? N - 1e-6 : gx;
    gz = gz < 0 ? 0 : gz > N - 1e-6 ? N - 1e-6 : gz;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const h = this.gen.heights;
    const i = iz * V + ix;
    const a = h[i] + (h[i + 1] - h[i]) * fx;
    const b = h[i + V] + (h[i + V + 1] - h[i + V]) * fx;
    return a + (b - a) * fz;
  }

  /** Is the cell water? Out-of-world cells count as water-like (impassable). */
  isWaterCell(cx: number, cz: number): boolean {
    return cx < 0 || cz < 0 || cx >= N || cz >= N || this.gen.water[cz * N + cx] !== 0;
  }

  isWater(x: number, z: number): boolean {
    return this.isWaterCell(cellOf(x), cellOf(z));
  }

  /**
   * Terrain-level movement block for a cell: 0 = free, 1 = water / world edge, 2 = locked region.
   * (Buildings are checked separately through BuildingSystem.blocked.) `hover` vehicles skip water.
   */
  terrainCode(cx: number, cz: number, hover = false): 0 | 1 | 2 {
    if (cx < 0 || cz < 0 || cx >= N || cz >= N) return 1;
    const i = cz * N + cx;
    if (!hover && this.gen.water[i]) return 1;
    return this.unlockedMask[this.gen.regionMap[i]] === 1 ? 0 : 2;
  }

  /** Is a world position walkable terrain (not water, not locked)? Buildings checked separately. */
  walkable(x: number, z: number): boolean {
    if (!this.gen) return true;
    return this.terrainCode(cellOf(x), cellOf(z)) === 0;
  }

  /** Centre of the colony core (origin when there is no core yet). */
  coreCenter(): { x: number; z: number } {
    const core = this.game.sys.buildings.core();
    return core ? this.game.sys.buildings.center(core) : { x: 0, z: 0 };
  }

  // ================================================================== fog of war

  /** Is the fog revealed at a world position. */
  revealed(x: number, z: number): boolean {
    return this.fog.revealed(x, z);
  }

  /** Reveal fog around a position and persist the bitset when something changed. */
  revealAround(x: number, z: number, radius = FOG_REVEAL_RADIUS): void {
    if (this.fog.reveal(x, z, radius) > 0) this.game.state.world.fog = this.fog.encode();
  }

  /** Fraction (0..1) of the map revealed. */
  explored(): number {
    return this.fog.count() / (64 * 64);
  }

  /** Called after a teleport so fog/discovery/POIs update immediately instead of next frame. */
  onPlayerMoved(): void {
    const p = this.game.state.player;
    this.lastFogCell = Fog.axis(p.z) * 64 + Fog.axis(p.x);
    this.revealAround(p.x, p.z);
    const idx = this.regionIndexAt(p.x, p.z);
    if (idx !== this.curRegionIdx) {
      this.curRegionIdx = idx;
      this.currentRegion = this.gen.regionIds[idx];
      this.game.bus.emit('world:regionEntered', { id: this.currentRegion });
      this.checkDiscovery();
    }
    this.scanPois();
  }

  // ================================================================== nodes

  nodeDef(i: number): NodeDef {
    return this.nodeDefs[i] ?? EMPTY_DEF;
  }

  /** Collision radius of a node (0 when not solid). */
  nodeRadius(i: number): number {
    return this.solidRadius[i];
  }

  isDepleted(nodeIndex: number): boolean {
    return this.game.state.world.depleted[nodeIndex] !== undefined;
  }

  /**
   * Nearest non-depleted node within range (world units). `maxToolTier` skips nodes the caller's tool can't
   * harvest. Allocation-free (uses the bucket grid).
   */
  nearestNode(x: number, z: number, range: number, maxToolTier = Number.POSITIVE_INFINITY): WorldNode | null {
    const n = this.grid.collect(x - range, z - range, x + range, z + range, this.scratch);
    const depleted = this.game.state.world.depleted;
    const nodes = this.gen.nodes;
    let best = -1;
    let bd = range * range;
    for (let k = 0; k < n; k++) {
      const i = this.scratch[k];
      if (depleted[i] !== undefined) continue;
      if (this.nodeDefs[i].toolTier > maxToolTier) continue;
      const dx = nodes[i].x - x;
      const dz = nodes[i].z - z;
      const d = dx * dx + dz * dz;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best >= 0 ? nodes[best] : null;
  }

  /**
   * Nearest non-depleted node with a given NodeDef id anywhere in the world (tutorial arrows, "find a tree").
   * Linear scan — call at ~1 Hz, not per frame.
   */
  findNodeByDef(defId: string, x: number, z: number): WorldNode | null {
    const depleted = this.game.state.world.depleted;
    let best: WorldNode | null = null;
    let bd = Infinity;
    for (const n of this.gen.nodes) {
      if (n.def !== defId || depleted[n.i] !== undefined) continue;
      const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  /** Fill `out` with non-depleted nodes within `r` of (x, z); returns the count. For colonist/drone logic. */
  nodesNear(x: number, z: number, r: number, out: WorldNode[]): number {
    const n = this.grid.collect(x - r, z - r, x + r, z + r, this.scratch);
    const depleted = this.game.state.world.depleted;
    const nodes = this.gen.nodes;
    let c = 0;
    for (let k = 0; k < n; k++) {
      const i = this.scratch[k];
      if (depleted[i] !== undefined) continue;
      const dx = nodes[i].x - x;
      const dz = nodes[i].z - z;
      if (dx * dx + dz * dz <= r * r) out[c++] = nodes[i];
    }
    out.length = c;
    return c;
  }

  /** Apply one gather hit; returns the drop actually produced (the caller stores it). */
  hitNode(nodeIndex: number, yieldMult: number): ResourceBag {
    const st = this.game.state;
    const node = this.gen.nodes[nodeIndex];
    if (!node || st.world.depleted[nodeIndex] !== undefined) return {};
    const def = this.nodeDefs[nodeIndex];
    const carry = (st.world.gatherCarry ??= {});
    const out: ResourceBag = {};
    for (const [id, n] of bagEntries(def.drop)) {
      const raw = n * yieldMult + (carry[id] ?? 0);
      const whole = Math.floor(raw + 1e-9);
      carry[id] = Math.max(0, raw - whole);
      if (whole > 0) out[id] = whole;
    }
    node.hits--;
    this.game.bus.emit('gather:hit', { node: nodeIndex, model: def.model, x: node.x, z: node.z, drop: out });
    if (node.hits <= 0) {
      node.hits = 0;
      st.world.depleted[nodeIndex] = st.playTime + def.respawn;
      this.game.bus.emit('gather:depleted', { node: nodeIndex });
    }
    return out;
  }

  /**
   * Construction hook: harvest (grant drops for remaining hits) and deplete every node whose cell lies in
   * the inclusive cell rect, so buildings can be placed over trees/rocks. Nodes under buildings don't respawn.
   */
  clearNodesInRect(x0: number, z0: number, x1: number, z1: number): ResourceBag {
    const lo = { x: Math.min(x0, x1), z: Math.min(z0, z1) };
    const hi = { x: Math.max(x0, x1), z: Math.max(z0, z1) };
    const minX = lo.x * CELL - HALF_WORLD;
    const minZ = lo.z * CELL - HALF_WORLD;
    const maxX = (hi.x + 1) * CELL - HALF_WORLD;
    const maxZ = (hi.z + 1) * CELL - HALF_WORLD;
    let buf = this.scratch;
    let n = this.grid.collect(minX, minZ, maxX, maxZ, buf);
    while (n >= buf.length) {
      buf = new Int32Array(buf.length * 4);
      n = this.grid.collect(minX, minZ, maxX, maxZ, buf);
    }
    const st = this.game.state;
    const total: ResourceBag = {};
    const nodes = this.gen.nodes;
    // copy indices: economy.addBag may emit events whose listeners reuse the scratch buffer
    const hit: number[] = [];
    for (let k = 0; k < n; k++) {
      const node = nodes[buf[k]];
      const cx = cellOf(node.x);
      const cz = cellOf(node.z);
      if (cx >= lo.x && cx <= hi.x && cz >= lo.z && cz <= hi.z) hit.push(node.i);
    }
    for (const i of hit) {
      const node = nodes[i];
      const was = st.world.depleted[i];
      if (was === undefined) {
        const def = this.nodeDefs[i];
        const bag: ResourceBag = {};
        for (const [id, v] of bagEntries(def.drop)) bag[id] = v * node.hits;
        const given = this.game.sys.economy.addBag(bag, 'gather', node.x, node.z);
        for (const [id, v] of bagEntries(given)) total[id] = (total[id] ?? 0) + v;
        node.hits = 0;
        st.world.depleted[i] = COVERED;
        this.game.bus.emit('gather:depleted', { node: i });
      } else {
        st.world.depleted[i] = COVERED;
      }
    }
    return total;
  }

  private covered(node: WorldNode): boolean {
    return this.game.sys.buildings.at(cellOf(node.x), cellOf(node.z)) !== undefined;
  }

  /** 1 Hz: grow depleted nodes back unless a building sits on them. */
  private respawnNodes(): void {
    const st = this.game.state;
    const now = st.playTime;
    const dep = st.world.depleted;
    for (const key in dep) {
      const i = +key;
      const node = this.gen.nodes[i];
      if (!node) {
        delete dep[i];
        continue;
      }
      const t = dep[i];
      if (t >= 1e299) {
        // covered by a building: start the normal respawn timer once the cell is free again
        if (!this.covered(node)) dep[i] = now + this.nodeDefs[i].respawn;
      } else if (t <= now) {
        if (this.covered(node)) {
          dep[i] = COVERED;
        } else {
          delete dep[i];
          node.hits = this.nodeDefs[i].hits;
          this.game.bus.emit('world:nodeRespawned', { node: i });
        }
      }
    }
  }

  // ================================================================== POIs

  poi(id: string): WorldPoi | undefined {
    return this.poiById.get(id);
  }

  poiDef(id: string): PoiDef | undefined {
    const p = this.poiById.get(id);
    return p ? this.game.data.poi(p.def) : undefined;
  }

  poiState(id: string): PoiState {
    const w = this.game.state.world;
    return (w.pois[id] ??= { discovered: false, looted: false, lootedAt: 0 });
  }

  /** Has this POI ever been opened / rescued / activated? (Saves from before `times` count a past loot too.) */
  poiExplored(id: string): boolean {
    const s = this.game.state.world.pois[id];
    return !!s && ((s.times ?? 0) > 0 || s.looted || s.lootedAt > 0);
  }

  /** A restocking POI that was opened before and has filled up again. */
  poiRestocked(id: string): boolean {
    const s = this.game.state.world.pois[id];
    return !!s && !s.looted && this.poiExplored(id) && (this.poiDef(id)?.respawn ?? 0) > 0;
  }

  /** Seconds until a looted POI restocks (0 = ready; Infinity = one-off, never). */
  poiRestockLeft(id: string): number {
    const s = this.game.state.world.pois[id];
    if (!s?.looted) return 0;
    const def = this.poiDef(id);
    if (!def || def.respawn <= 0) return Number.POSITIVE_INFINITY;
    return Math.max(0, Math.min(this.restockWall(s) - this.game.now(), (s.lootedAt + def.respawn - this.game.state.playTime) * 1000) / 1000);
  }

  /** Epoch ms a looted POI restocks at (saves from before absolute timers: never by the wall clock). */
  private restockWall(s: PoiState): number {
    return typeof s.restockAt === 'number' && Number.isFinite(s.restockAt) ? s.restockAt : Number.POSITIVE_INFINITY;
  }

  /**
   * Nearest POI matching a PoiDef id or kind (e.g. 'survivor_camp' / 'beacon') that is still worth visiting
   * (not looted; beacons: not yet activated). For tutorial guide arrows and map hints.
   */
  nearestPoi(match: string, x: number, z: number): WorldPoi | null {
    let best: WorldPoi | null = null;
    let bd = Infinity;
    for (const p of this.gen.pois) {
      const def = this.game.data.poi(p.def);
      if (!def || (def.id !== match && def.kind !== match)) continue;
      if (this.game.state.world.pois[p.id]?.looted) continue;
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** Can this POI be interacted with right now (not looted / respawn elapsed / beacon not yet active)? */
  poiReady(id: string): boolean {
    const def = this.poiDef(id);
    if (!def) return false;
    const s = this.game.state.world.pois[id];
    return !s?.looted;
  }

  /** Is a nest's guardian pack alive near it? */
  nestGuarded(id: string): boolean {
    const p = this.poiById.get(id);
    if (!p) return false;
    return this.game.sys.combat.wildNear(p.x, p.z, 12) > 0;
  }

  /** Throttled proximity pass: discover POIs and wake nest guardians. */
  private scanPois(): void {
    const st = this.game.state;
    const px = st.player.x;
    const pz = st.player.z;
    const data = this.game.data;
    for (const p of this.gen.pois) {
      const dx = p.x - px;
      const dz = p.z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 > POI_DISCOVER_RADIUS * POI_DISCOVER_RADIUS) continue;
      const def = data.poi(p.def);
      if (!def) continue;
      const ps = this.poiState(p.id);
      if (!ps.discovered) {
        ps.discovered = true;
        this.game.bus.emit('world:poiDiscovered', { id: p.id, poi: p.def });
        this.game.toast(`${def.icon} ${def.name} discovered!`, 'info');
        this.revealAround(p.x, p.z, 16);
      }
      if (def.kind === 'nest' && def.guards && !ps.looted && !this.guarded.has(p.id) && d2 < NEST_TRIGGER_RADIUS * NEST_TRIGGER_RADIUS) {
        this.guardNest(p, def);
      }
    }
  }

  private guardNest(p: WorldPoi, def: PoiDef): void {
    if (!def.guards || this.guarded.has(p.id)) return;
    this.guarded.add(p.id);
    this.game.sys.combat.spawnWild(def.guards.alien, def.guards.count, p.x, p.z);
    this.game.toast('⚠️ The nest guardians are awake!', 'warning');
  }

  /**
   * 1 Hz (and on load): restock respawning POIs. The timer is absolute (epoch ms, `restockAt`), so time away counts;
   * play time is the fallback (saves from before absolute timers, a wall clock set back).
   */
  private respawnPois(): void {
    const w = this.game.state.world;
    const now = this.game.now();
    const play = this.game.state.playTime;
    for (const id in w.pois) {
      const s = w.pois[id];
      if (!s.looted) continue;
      const def = this.poiDef(id);
      if (!def || def.respawn <= 0) continue;
      if (now >= this.restockWall(s) || play >= s.lootedAt + def.respawn) {
        s.looted = false;
        delete s.restockAt;
        this.guarded.delete(id);
        this.game.bus.emit('world:poiRestocked', { id, poi: def.id });
      }
    }
  }

  /**
   * Loot / interact with a POI: grants its reward (camps rescue a colonist, beacons activate fast travel,
   * nests need their guardians dead). Does not check player distance — PlayerSystem does that.
   */
  lootPoi(poiId: string): boolean {
    const p = this.poiById.get(poiId);
    if (!p) return false;
    const def = this.game.data.poi(p.def);
    if (!def) return false;
    const st = this.game.state;
    const ps = this.poiState(poiId);
    if (ps.looted) {
      if (def.respawn > 0) {
        const left = Math.ceil(this.poiRestockLeft(poiId));
        this.game.toast(`${def.icon} ${def.name} restocks in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, 'info');
      }
      return false;
    }
    if (def.kind === 'nest') {
      if (def.guards && !this.guarded.has(poiId)) {
        this.guardNest(p, def);
        return false;
      }
      if (this.game.sys.combat.wildNear(p.x, p.z, 12) > 0) {
        this.game.toast('🪺 Clear the nest guardians first!', 'warning');
        return false;
      }
    }
    ps.discovered = true;
    ps.looted = true;
    ps.lootedAt = st.playTime;
    ps.times = (ps.times ?? 0) + 1;
    if (def.respawn > 0) ps.restockAt = this.game.now() + def.respawn * 1000;

    // goods scaled to the colony's tier, in the POI's own flavour (data/survey.ts POI_LOOT); a long sweep thins out
    const eco = this.game.sys.economy;
    const now = this.game.now();
    const log = (st.world.lootLog ??= []).filter((t) => typeof t === 'number' && t > now - 3_600_000 && t <= now);
    const reward = rollPoiLoot({ data: this.game.data, tier: st.colony.tier, capacity: (id) => eco.capacity(id) }, def.id, this.game.rng, lootThinning(log.length));
    if (def.kind !== 'beacon') log.push(now);
    st.world.lootLog = log.slice(-40);
    let colonist: Id | null = null;
    const before = st.colonists.nextId;
    this.game.grant(reward, 'poi', p.x, p.z);
    if (reward.colonist) {
      colonist = st.colonists.nextId > before ? st.colonists.nextId - 1 : -1;
      this.game.bus.emit('survivor:rescued', { poi: poiId, colonist });
      this.game.toast(`${def.icon} Survivor rescued! They join your colony.`, 'success');
    } else if (def.kind === 'beacon') {
      if (!st.world.beacons.includes(poiId)) st.world.beacons.push(poiId);
      const rn = this.game.data.biome(p.region)?.name ?? 'Region';
      this.game.toast(`${def.icon} ${rn} beacon activated — fast travel unlocked!`, 'reward');
    } else {
      this.game.toast(`${def.icon} ${def.name} looted!`, 'reward');
      this.game.bus.emit('sfx', { id: 'crate_open', x: p.x, z: p.z });
    }
    this.game.bus.emit('world:poiLooted', { id: poiId, poi: p.def, reward });
    return true;
  }

  /**
   * Tutorial/mission hook: spawn a survivor-camp POI on walkable ground ~10-16 cells from (x, z), discovered
   * immediately and persisted. Returns the POI id.
   */
  spawnSurvivorNear(x: number, z: number): string | null {
    const data = this.game.data;
    const def = data.pois.find((p) => p.kind === 'camp');
    if (!def) return null;
    const rng = this.game.rng;
    const bs = this.game.sys.buildings;
    const ring: [number, number][] = [[20, 32], [14, 42], [8, 60]];
    for (const [rmin, rmax] of ring) {
      for (let attempt = 0; attempt < 50; attempt++) {
        let a = 0;
        let b = 0;
        let l2 = 0;
        do {
          a = rng.next() * 2 - 1;
          b = rng.next() * 2 - 1;
          l2 = a * a + b * b;
        } while (l2 > 1 || l2 < 0.01);
        const inv = 1 / Math.sqrt(l2);
        const r = rng.range(rmin, rmax);
        const px = x + a * inv * r;
        const pz = z + b * inv * r;
        const cx = cellOf(px);
        const cz = cellOf(pz);
        if (this.terrainCode(cx, cz) !== 0 || this.isWaterNear(cx, cz, 2)) continue;
        if (bs.at(cx, cz) || bs.blocked(cx, cz, 'player')) continue;
        if (this.solidNear(px, pz, 3.2) || this.poiNear(px, pz, 14)) continue;
        return this.addDynamicPoi(def, px, pz);
      }
    }
    return null;
  }

  private isWaterNear(cx: number, cz: number, r: number): boolean {
    for (let z = cz - r; z <= cz + r; z++) for (let x = cx - r; x <= cx + r; x++) if (this.isWaterCell(x, z)) return true;
    return false;
  }

  /** Any solid, non-depleted node within `r` of a point? */
  solidNear(x: number, z: number, r: number): boolean {
    const n = this.grid.collect(x - r, z - r, x + r, z + r, this.scratch);
    const nodes = this.gen.nodes;
    for (let k = 0; k < n; k++) {
      const i = this.scratch[k];
      if (this.solidRadius[i] <= 0 || this.game.state.world.depleted[i] !== undefined) continue;
      const dx = nodes[i].x - x;
      const dz = nodes[i].z - z;
      if (dx * dx + dz * dz < (r + this.solidRadius[i]) * (r + this.solidRadius[i])) return true;
    }
    return false;
  }

  private poiNear(x: number, z: number, r: number): boolean {
    for (const p of this.gen.pois) {
      const dx = p.x - x;
      const dz = p.z - z;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  private addDynamicPoi(def: PoiDef, x: number, z: number): string {
    const st = this.game.state;
    const w = st.world;
    const n = (w.nextDynPoi ?? 0) + 1;
    w.nextDynPoi = n;
    const poi: WorldPoi = { id: `poi_s${n}`, def: def.id, x, z, region: this.regionAt(x, z), rot: this.game.rng.next() * Math.PI * 2 };
    (w.dynamicPois ??= []).push({ ...poi });
    this.gen.pois.push(poi);
    this.gen.version++;
    this.poiById.set(poi.id, poi);
    const ps = this.poiState(poi.id);
    ps.discovered = true;
    this.revealAround(x, z, 16);
    this.game.bus.emit('world:poiSpawned', { id: poi.id, poi: def.id });
    this.game.bus.emit('world:poiDiscovered', { id: poi.id, poi: def.id });
    this.game.toast(`📡 A survivor signal!`, 'info');
    return poi.id;
  }

  // ================================================================== fast travel

  /** Beacons/teleporters the player can fast travel to (always includes the colony). */
  fastTravelTargets(): { id: string; name: string; x: number; z: number }[] {
    const out: { id: string; name: string; x: number; z: number }[] = [];
    const core = this.coreCenter();
    out.push({ id: 'base', name: 'Colony', x: core.x, z: core.z });
    const st = this.game.state;
    for (const id of st.world.beacons) {
      const p = this.poiById.get(id);
      if (!p) continue;
      out.push({ id, name: `${this.game.data.biome(p.region)?.name ?? 'Wild'} Beacon`, x: p.x, z: p.z });
    }
    const bs = this.game.sys.buildings;
    for (const b of bs.all()) {
      const def = bs.def(b);
      if (!def?.teleporter || b.status !== 'active') continue;
      const c = bs.center(b);
      out.push({ id: `tp_${b.id}`, name: def.name, x: c.x, z: c.z });
    }
    return out;
  }
}
