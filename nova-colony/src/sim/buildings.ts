/**
 * BuildingSystem — grid occupancy, placement validation, construction, drag-to-build lines,
 * move/rotate/remove (full refund), level & material-tier upgrades, mass/room upgrades,
 * blueprints, enclosed-room detection (auto roofs), and auto-repair after attacks.
 *
 * OWNER: construction agent. Writes state.buildings and game.derived.{roofCells, rooms, buildingsVersion}.
 *
 * Performance notes (mobile): cell lookups are O(1) typed-array reads (see build/grid.ts); id lookups
 * go through a Map; construction/repair loops only visit the buildings that need it; rooms are
 * recomputed at most once per frame and only after a structural change.
 */
import { System } from './System';
import { ANCHOR_IDS, type BuildingDef, type ResourceBag } from '../data/schema';
import type { Blueprint, BuildingInstance, BuildingStatus, Id } from '../core/state';
import { CELL, CENTER_CELL, MAX_TIER, WORLD_CELLS, cellCenter, cellIndex, cellMin, footprintCenter, inWorld, rotatedSize } from '../core/constants';
import { bagCovers, bagEntries, bagIsEmpty, bagSum } from '../core/bag';
import { BLOCK_ALIEN, BLOCK_FRIENDLY, BuildGrid, FLOOR, OBJECT, isWallLike, layerOf } from './build/grid';
import { RoomDetector, type CellRect } from './build/rooms';
import { lineCells, rotateLayout, type Layout, type Rot } from './build/geometry';

declare module '../core/state' {
  interface BuildingInstance {
    /**
     * Total resources invested in this building (placement + level-ups + material upgrades).
     * Refunded × BalanceDef.removeRefund on removal. Missing on very old saves (recomputed).
     */
    spent?: ResourceBag;
  }
}

export interface PlaceCheck {
  ok: boolean;
  reason?: string;
  /** Machine-readable failure category (UI styling, line placement stops on 'cost'). */
  code?: PlaceFailCode;
}

export type PlaceFailCode = 'unknown' | 'locked' | 'tier' | 'limit' | 'world' | 'colony' | 'terrain' | 'occupied' | 'cost' | 'anchored';

export type Walker = 'player' | 'colonist' | 'alien';

/** Preview of a drag-to-build line for the UI. */
export interface LinePreview {
  cells: { x: number; z: number; ok: boolean }[];
  /** Number of placeable cells (stops counting when resources run out). */
  count: number;
  /** Total cost of the placeable cells. */
  cost: ResourceBag;
  /** First reason a cell could not be placed, if any. */
  reason: string | null;
}

/** Interior rooms larger than this are courtyards (no roof). */
const ROOM_MAX_CELLS = 400;
/** Repair buildings (def.repair) heal buildings whose centers are within this many cells. */
const REPAIR_RANGE_CELLS = 6;
/** Each working engineer speeds up construction by this fraction. */
const ENGINEER_BUILD_BONUS = 0.25;
/** Facilities gain +50% max HP per colony tier. */
const FACILITY_HP_PER_TIER = 0.5;
/** Fallback level cost multiplier when a def doesn't specify one. */
const DEFAULT_LEVEL_COST_MULT = 1.5;

const OK: PlaceCheck = { ok: true };
const fail = (code: PlaceFailCode, reason: string): PlaceCheck => ({ ok: false, code, reason });

/** Scale a bag and round each entry up (cost rounding; tolerant of float noise like 10×1.1). */
function scaleCeil(bag: ResourceBag | undefined, s: number): ResourceBag {
  const out: ResourceBag = {};
  for (const [k, v] of bagEntries(bag)) out[k] = Math.ceil(v * s - 1e-6);
  return out;
}

function addInto(target: ResourceBag, bag: ResourceBag | undefined, scale = 1): ResourceBag {
  for (const [k, v] of bagEntries(bag)) target[k] = (target[k] ?? 0) + v * scale;
  return target;
}

function removeFrom<T>(arr: T[], item: T): void {
  const i = arr.indexOf(item);
  if (i < 0) return;
  arr[i] = arr[arr.length - 1];
  arr.pop();
}

export class BuildingSystem extends System {
  /** Reason the last failed mutating call (place/move/remove/upgrade...) was rejected. */
  lastReason: string | null = null;

  private readonly grid = new BuildGrid();
  private readonly roomDetector = new RoomDetector();
  private readonly byId = new Map<Id, BuildingInstance>();
  private readonly counts = new Map<string, number>();
  /** Buildings with construction progress < 1. */
  private readonly pending: BuildingInstance[] = [];
  /** Buildings below max HP (repair candidates) + membership set. */
  private readonly hurt: BuildingInstance[] = [];
  private readonly hurtIds = new Set<Id>();
  /** Buildings with def.repair (repair bays / drones). */
  private readonly repairers: BuildingInstance[] = [];
  /** Facilities that were switched off when they broke (restored to 'off' after repair). Runtime only. */
  private readonly offBeforeBreak = new Set<Id>();
  /** Colony center in fractional cell coordinates (center of the core footprint). */
  private ccx = CENTER_CELL;
  private ccz = CENTER_CELL;
  private roomsDirty = true;
  private econDirty = false;
  /** Seconds since the last attack phase / last damage (auto-repair delay). */
  private calm = 0;
  private batchDepth = 0;
  private batchChanged = false;
  private readonly tmpCenter = { x: 0, z: 0 };

  // ---------------------------------------------------------------- lifecycle

  override init(): void {
    const bus = this.game.bus;
    bus.on('colony:tierUp', ({ tier }) => this.refreshFacilityTiers(tier));
    bus.on('research:completed', () => this.refreshMaxHp());
  }

  override onLoad(fresh: boolean): void {
    const st = this.game.state;
    if (fresh) st.colony.radius = this.game.data.tier(0).colonyRadius;
    this.rebuild();
    this.ensureCore();
    this.updateColonyCenter();
    this.recomputeRooms();
    this.calm = this.game.data.balance.repairDelay;
    this.econDirty = true;
    this.flushEconomy();
  }

  override update(dt: number): void {
    if (this.pending.length) this.advanceConstruction(dt);
    this.updateRepairs(dt);
    if (this.roomsDirty) this.recomputeRooms();
    this.flushEconomy();
  }

  // ---------------------------------------------------------------- queries

  get(id: Id): BuildingInstance | undefined {
    const b = this.byId.get(id);
    if (b) return b;
    // Someone edited state.buildings.list directly — resync the index (cheap O(1) check first).
    if (this.game.state.buildings.list.length !== this.byId.size) {
      this.rebuild();
      return this.byId.get(id);
    }
    return undefined;
  }

  def(b: BuildingInstance | string): BuildingDef {
    return this.game.data.building(typeof b === 'string' ? b : b.def)!;
  }

  all(): BuildingInstance[] {
    return this.game.state.buildings.list;
  }

  /** Building occupying a cell, if any (object layer first, then floor). */
  at(cx: number, cz: number): BuildingInstance | undefined {
    const id = this.grid.get(OBJECT, cx, cz) || this.grid.get(FLOOR, cx, cz);
    return id ? this.byId.get(id) : undefined;
  }

  /** Object-layer building (walls, facilities...) on a cell. */
  objectAt(cx: number, cz: number): BuildingInstance | undefined {
    const id = this.grid.get(OBJECT, cx, cz);
    return id ? this.byId.get(id) : undefined;
  }

  /** Floor-layer piece (floor/platform) on a cell. */
  floorAt(cx: number, cz: number): BuildingInstance | undefined {
    const id = this.grid.get(FLOOR, cx, cz);
    return id ? this.byId.get(id) : undefined;
  }

  countOf(defId: string): number {
    return this.counts.get(defId) ?? 0;
  }

  core(): BuildingInstance | undefined {
    const id = this.game.state.colony.coreId;
    return id == null ? undefined : this.get(id);
  }

  /** World-space center of a building footprint. */
  center(b: BuildingInstance): { x: number; z: number } {
    return footprintCenter(b.x, b.z, this.def(b).size, b.rot);
  }

  /** Allocation-free variant of center() for hot loops. */
  centerInto(b: BuildingInstance, out: { x: number; z: number }): { x: number; z: number } {
    const [w, h] = rotatedSize(this.def(b).size, b.rot);
    out.x = cellMin(b.x) + (w * CELL) / 2;
    out.z = cellMin(b.z) + (h * CELL) / 2;
    return out;
  }

  /** World-space center of the colony (center of the core footprint). */
  colonyCenter(): { x: number; z: number } {
    return { x: cellCenter(this.ccx), z: cellCenter(this.ccz) };
  }

  /** Is a cell inside the buildable colony radius? (distance between cell centers, in cells) */
  inColony(cx: number, cz: number): boolean {
    const dx = cx - this.ccx;
    const dz = cz - this.ccz;
    const r = this.game.state.colony.radius;
    return dx * dx + dz * dz <= r * r + 1e-6;
  }

  /**
   * Movement blocking query used by player, colonists and alien pathing. O(1).
   * Solid buildings block everyone (also while under construction); doors/gates block only aliens;
   * floors, traps and farm plots never block. A solid building broken to 0 HP has been breached:
   * aliens pass through until it is repaired. Cells outside the world are blocked.
   */
  blocked(cx: number, cz: number, who: Walker): boolean {
    if (!inWorld(cx, cz)) return true;
    const bits = this.grid.block[cellIndex(cx, cz)];
    return (bits & (who === 'alien' ? BLOCK_ALIEN : BLOCK_FRIENDLY)) !== 0;
  }

  /** Room id containing a cell (0 = not inside a room). Walls count as part of no room. */
  roomAt(cx: number, cz: number): number {
    if (!inWorld(cx, cz)) return 0;
    this.ensureRooms();
    return this.roomDetector.roomOf[cellIndex(cx, cz)];
  }

  isUnlocked(defId: string): boolean {
    const d = this.game.data.building(defId);
    if (!d) return false;
    if (d.unlockTier > this.game.state.colony.tier) return false;
    if (d.research && !this.game.state.research.completed.includes(d.research)) return false;
    return true;
  }

  /** Human-readable reason a def is locked, or null when unlocked. */
  lockReason(defId: string): string | null {
    const d = this.game.data.building(defId);
    if (!d) return 'Unknown building';
    if (d.unlockTier > this.game.state.colony.tier) return `Unlocks at ${this.game.data.tier(d.unlockTier).name} tier`;
    if (d.research && !this.game.state.research.completed.includes(d.research)) {
      return `Research ${this.game.data.researchDef(d.research)?.name ?? d.research} to unlock`;
    }
    return null;
  }

  isPiece(defId: string): boolean {
    return !!this.game.data.building(defId)?.piece;
  }

  /**
   * Build cost for a def at a material tier (pieces) or level 1 (facilities).
   * Pieces: TierDef.pieceCost × costMult (rounded up) + def.cost. When `tier` is omitted, pieces use
   * the material currently selected in the build preview (view.build.tier, clamped to the colony tier).
   */
  cost(defId: string, tier?: number): ResourceBag {
    const d = this.game.data.building(defId);
    if (!d) return {};
    if (!d.piece) return { ...d.cost };
    const t = this.game.data.tier(this.pieceTier(tier));
    return addInto(scaleCeil(t.pieceCost, d.costMult ?? 1), d.cost);
  }

  /** Resources returned if the building were removed now. */
  refund(id: Id): ResourceBag {
    const b = this.get(id);
    if (!b) return {};
    const mult = this.game.data.balance.removeRefund;
    const out: ResourceBag = {};
    for (const [k, v] of bagEntries(this.invested(b))) {
      const n = Math.floor(v * mult + 1e-6);
      if (n > 0) out[k] = n;
    }
    return out;
  }

  // ---------------------------------------------------------------- placement

  /**
   * Validate a placement. `ignoreId` = the building being moved (its own cells are ignored and no
   * cost/limit applies). `tier` = piece material (defaults like cost()).
   */
  canPlace(defId: string, x: number, z: number, rot: 0 | 1 | 2 | 3, ignoreId?: Id, tier?: number): PlaceCheck {
    return this.check(defId, x, z, rot, ignoreId, tier, false);
  }

  /** Pay and place. Returns the new id or null (see lastReason). `quiet` skips the "Built X!" announcement. */
  place(defId: string, x: number, z: number, rot: 0 | 1 | 2 | 3, opts?: { tier?: number; free?: boolean; instant?: boolean; quiet?: boolean }): Id | null {
    const d = this.game.data.building(defId);
    if (!d) return this.reject('Unknown building');
    const tier = d.piece ? this.pieceTier(opts?.tier) : this.game.state.colony.tier;
    const free = !!opts?.free;
    const chk = this.check(defId, x, z, rot, undefined, tier, free);
    if (!chk.ok) return this.reject(chk.reason);
    const price = free ? {} : this.cost(defId, tier);
    if (!bagIsEmpty(price) && !this.game.sys.economy.spend(price, 'build')) return this.reject(this.needText(price));
    this.lastReason = null;
    // quiet: system-placed content (the free Lucky Wheel) gets no "Built X!" float or build sound
    const b = this.create(d, x, z, rot, tier, price, !!opts?.instant, !opts?.quiet);
    this.flushEconomy();
    return b.id;
  }

  /** Cells for a drag-to-build line of pieces from (x0,z0) to (x1,z1) (axis-aligned L or straight). */
  lineCells(x0: number, z0: number, x1: number, z1: number): { x: number; z: number }[] {
    return lineCells(x0, z0, x1, z1);
  }

  /** What placeLine would do right now: per-cell validity (incl. running out of resources) and total cost. */
  previewLine(defId: string, x0: number, z0: number, x1: number, z1: number, tier: number): LinePreview {
    const cells = lineCells(x0, z0, x1, z1);
    const budget: Record<string, number> = { ...this.game.state.resources.amounts };
    const cost: ResourceBag = {};
    const out: LinePreview['cells'] = [];
    let count = 0;
    let reason: string | null = null;
    const price = this.cost(defId, tier);
    for (const c of cells) {
      let chk = this.check(defId, c.x, c.z, 0, undefined, tier, true);
      if (chk.ok && !bagCovers(budget, price)) chk = fail('cost', this.needText(price, budget));
      if (chk.ok) {
        for (const [k, v] of bagEntries(price)) budget[k] = (budget[k] ?? 0) - v;
        addInto(cost, price);
        count++;
      } else if (!reason) reason = chk.reason ?? null;
      out.push({ x: c.x, z: c.z, ok: chk.ok });
    }
    return { cells: out, count, cost, reason };
  }

  /**
   * Place pieces along a line; skips invalid cells, pays per piece and stops when resources run out.
   * Returns placed ids.
   */
  placeLine(defId: string, x0: number, z0: number, x1: number, z1: number, tier: number): Id[] {
    const d = this.game.data.building(defId);
    if (!d) {
      this.reject('Unknown building');
      return [];
    }
    const ids: Id[] = [];
    let lastFail: string | undefined;
    let last: BuildingInstance | null = null;
    this.beginBatch();
    for (const c of lineCells(x0, z0, x1, z1)) {
      const chk = this.check(defId, c.x, c.z, 0, undefined, tier, false);
      if (!chk.ok) {
        lastFail = chk.reason;
        // nothing further can succeed when locked, at the limit or broke
        if (chk.code === 'cost' || chk.code === 'locked' || chk.code === 'tier' || chk.code === 'limit' || chk.code === 'unknown') break;
        continue;
      }
      const price = this.cost(defId, tier);
      if (!bagIsEmpty(price) && !this.game.sys.economy.spend(price, 'build')) break;
      last = this.create(d, c.x, c.z, 0, tier, price, false, false);
      ids.push(last.id);
    }
    this.endBatch();
    if (last) {
      const p = this.centerInto(last, this.tmpCenter);
      this.game.bus.emit('sfx', { id: 'place', x: p.x, z: p.z });
    }
    // why (part of) the line was skipped, even when some pieces were placed ("Need 4 more Wood")
    this.lastReason = lastFail ?? null;
    this.flushEconomy();
    return ids;
  }

  /** Relocate for free (no resources lost; progress, workers and level are kept). */
  move(id: Id, x: number, z: number, rot: 0 | 1 | 2 | 3): boolean {
    const b = this.get(id);
    if (!b) return this.no('Building not found');
    const d = this.def(b);
    if (d.core) return this.no('The Command Center is anchored in place');
    if (b.x === x && b.z === z && b.rot === rot) return true;
    const chk = this.check(b.def, x, z, rot, b.id, b.tier, true);
    if (!chk.ok) return this.no(chk.reason);
    this.grid.stamp(b, d, true);
    b.x = x;
    b.z = z;
    b.rot = rot;
    this.clearNodesUnder(b, d);
    this.grid.stamp(b, d);
    this.lastReason = null;
    this.roomsDirty = true;
    this.econDirty = true; // e.g. logging camps may care where they stand
    this.game.bus.emit('building:moved', { id: b.id, def: b.def });
    this.changed();
    const p = this.centerInto(b, this.tmpCenter);
    this.game.bus.emit('sfx', { id: 'place', x: p.x, z: p.z });
    this.flushEconomy();
    return true;
  }

  /** Rotate 90° (about the footprint center when possible, else about the min corner). */
  rotate(id: Id): boolean {
    const b = this.get(id);
    if (!b) return this.no('Building not found');
    const d = this.def(b);
    const nr = ((b.rot + 1) % 4) as Rot;
    const [w, h] = rotatedSize(d.size, b.rot);
    const [nw, nh] = rotatedSize(d.size, nr);
    // trunc (not floor) so four rotations return to the same spot
    const nx = b.x + Math.trunc((w - nw) / 2);
    const nz = b.z + Math.trunc((h - nh) / 2);
    if (this.move(id, nx, nz, nr)) return true;
    if ((nx !== b.x || nz !== b.z) && this.move(id, b.x, b.z, nr)) return true;
    return false;
  }

  /** Remove with refund (BalanceDef.removeRefund). The core cannot be removed. */
  remove(id: Id): boolean {
    const b = this.get(id);
    if (!b) return this.no('Building not found');
    const d = this.def(b);
    if (d.core) return this.no("The Command Center can't be removed");
    const refund = this.refund(id);
    const p = this.center(b);
    const st = this.game.state;

    this.unindex(b, d);
    const i = st.buildings.list.indexOf(b);
    if (i >= 0) st.buildings.list.splice(i, 1);

    // unassign colonists working or sleeping here
    for (const c of st.colonists.list) {
      if (c.workplace === b.id) {
        c.workplace = null;
        this.game.bus.emit('colonist:assigned', { id: c.id, workplace: null });
      }
      if (c.bed === b.id) c.bed = null;
    }
    b.workers = [];

    // refund before capacity is recomputed so removing a storage building never loses its refund
    this.game.sys.economy.addBag(refund, 'refund', p.x, p.z);
    this.lastReason = null;
    this.roomsDirty = true;
    this.econDirty = true;
    this.game.bus.emit('building:removed', { id: b.id, def: b.def });
    this.changed();
    this.game.bus.emit('sfx', { id: 'remove', x: p.x, z: p.z });
    this.flushEconomy();
    return true;
  }

  /** Toggle a facility on/off (saves power). */
  toggle(id: Id): void {
    const b = this.get(id);
    if (!b) return;
    const d = this.def(b);
    if (d.piece || d.core) return;
    if (b.status === 'active') b.status = 'off';
    else if (b.status === 'off') b.status = 'active';
    else if (b.status === 'damaged') {
      // remember the choice for when the repair finishes
      if (this.offBeforeBreak.has(b.id)) this.offBeforeBreak.delete(b.id);
      else this.offBeforeBreak.add(b.id);
      return;
    } else return;
    this.econDirty = true;
    this.changed();
    this.flushEconomy();
  }

  // ---------------------------------------------------------------- upgrades

  /** Next level cost, or null at max level (pieces and the core have no levels). */
  levelUpCost(id: Id): ResourceBag | null {
    const b = this.get(id);
    if (!b) return null;
    const d = this.def(b);
    if (d.piece || d.core || b.level >= d.maxLevel) return null;
    return scaleCeil(d.cost, Math.pow(d.levelCostMult ?? DEFAULT_LEVEL_COST_MULT, b.level));
  }

  levelUp(id: Id): boolean {
    const b = this.get(id);
    const cost = this.levelUpCost(id);
    if (!b || !cost) return this.no(b ? 'Already at max level' : 'Building not found');
    if (b.status === 'building') return this.no('Finish construction first');
    if (!bagIsEmpty(cost) && !this.game.sys.economy.spend(cost, 'upgrade')) return this.no(this.needText(cost));
    const d = this.def(b);
    b.level++;
    b.spent = addInto(this.invested(b), cost);
    this.lastReason = null;
    this.econDirty = true;
    this.game.bus.emit('building:upgraded', { id: b.id, def: b.def, level: b.level, tier: b.tier });
    const p = this.centerInto(b, this.tmpCenter);
    const pct = Math.round((d.levelEffect ?? 0) * (b.level - 1) * 100);
    const text = pct > 0 ? `Level ${b.level} · ${this.effectLabel(d)} +${pct}%` : `Level ${b.level}`;
    this.game.bus.emit('ui:float', { text, x: p.x, z: p.z, color: '#7cf29a', big: true });
    this.game.bus.emit('sfx', { id: 'upgrade', x: p.x, z: p.z });
    this.changed();
    this.flushEconomy();
    return true;
  }

  /**
   * Cost to change a piece's material to `toTier`: the full new-material piece cost.
   * Null when not a piece, not an upgrade, or the colony hasn't reached that tier.
   */
  tierUpCost(id: Id, toTier: number): ResourceBag | null {
    const b = this.get(id);
    if (!b) return null;
    const d = this.def(b);
    if (!d.piece) return null;
    if (!Number.isInteger(toTier) || toTier <= b.tier || toTier > this.game.state.colony.tier || toTier > MAX_TIER) return null;
    return this.cost(d.id, toTier);
  }

  tierUp(id: Id, toTier: number): boolean {
    const b = this.get(id);
    const cost = this.tierUpCost(id, toTier);
    if (!b || !cost) return this.no(b ? 'Upgrade not available' : 'Building not found');
    if (!bagIsEmpty(cost) && !this.game.sys.economy.spend(cost, 'upgrade')) return this.no(this.needText(cost));
    this.applyMaterial(b, toTier, cost);
    this.lastReason = null;
    const p = this.centerInto(b, this.tmpCenter);
    this.game.bus.emit('ui:float', { text: `${this.game.data.tier(toTier).name} ${this.def(b).name}!`, x: p.x, z: p.z, color: this.game.data.tier(toTier).accent });
    this.game.bus.emit('sfx', { id: 'upgrade', x: p.x, z: p.z });
    this.changed();
    return true;
  }

  /** Total cost to upgrade every eligible piece (piece, below `toTier`) to a material tier. */
  massTierUpCost(ids: Id[], toTier: number): ResourceBag {
    const total: ResourceBag = {};
    for (const b of this.tierUpCandidates(ids, toTier)) addInto(total, this.cost(b.def, toTier));
    return total;
  }

  /**
   * Mass upgrade pieces to a material tier. Pays in one go; if the total isn't affordable, upgrades
   * as many as possible, cheapest first. Returns the number of pieces upgraded.
   */
  massTierUp(ids: Id[], toTier: number): number {
    const candidates = this.tierUpCandidates(ids, toTier).map((b) => ({ b, cost: this.cost(b.def, toTier) }));
    if (!candidates.length) return 0;
    const eco = this.game.sys.economy;
    const total: ResourceBag = {};
    for (const c of candidates) addInto(total, c.cost);

    let chosen = candidates;
    if (!eco.canAfford(total)) {
      candidates.sort((a, b) => bagSum(a.cost) - bagSum(b.cost));
      const budget: Record<string, number> = { ...this.game.state.resources.amounts };
      chosen = [];
      for (const c of candidates) {
        if (!bagCovers(budget, c.cost)) continue;
        for (const [k, v] of bagEntries(c.cost)) budget[k] = (budget[k] ?? 0) - v;
        chosen.push(c);
      }
      if (!chosen.length) {
        this.game.bus.emit('resource:insufficient', { missing: eco.missing(candidates[0].cost) });
        this.reject(this.needText(candidates[0].cost));
        return 0;
      }
      for (const k of Object.keys(total)) delete total[k];
      for (const c of chosen) addInto(total, c.cost);
    }
    if (!bagIsEmpty(total) && !eco.spend(total, 'upgrade')) return 0;

    this.beginBatch();
    let sx = 0;
    let sz = 0;
    for (const c of chosen) {
      this.applyMaterial(c.b, toTier, c.cost);
      const p = this.centerInto(c.b, this.tmpCenter);
      sx += p.x;
      sz += p.z;
    }
    this.changed();
    this.endBatch();
    const n = chosen.length;
    const t = this.game.data.tier(toTier);
    sx /= n;
    sz /= n;
    this.game.bus.emit('ui:float', { text: `${n} piece${n === 1 ? '' : 's'} → ${t.name}!`, x: sx, z: sz, color: t.accent, big: true });
    this.game.bus.emit('sfx', { id: 'upgrade', x: sx, z: sz });
    this.lastReason = n < candidates.length ? `Upgraded ${n} of ${candidates.length} — need more resources for the rest` : null;
    return n;
  }

  /**
   * Ids of all pieces forming the enclosed room containing the cell: floors inside it plus the
   * walls/doors/windows/gates bounding it ("upgrade entire room"). Tapping a wall picks an adjacent room.
   */
  roomPieces(cx: number, cz: number): Id[] {
    if (!inWorld(cx, cz)) return [];
    this.ensureRooms();
    const roomOf = this.roomDetector.roomOf;
    let room = roomOf[cellIndex(cx, cz)];
    if (!room && this.grid.walls[cellIndex(cx, cz)]) {
      for (let dz = -1; dz <= 1 && !room; dz++) {
        for (let dx = -1; dx <= 1 && !room; dx++) {
          if (inWorld(cx + dx, cz + dz)) room = roomOf[cellIndex(cx + dx, cz + dz)];
        }
      }
    }
    const r = room ? this.game.derived.rooms.find((x) => x.id === room) : undefined;
    if (!r) return [];
    const ids = new Set<Id>();
    const floors = this.grid.layers[FLOOR];
    const objs = this.grid.layers[OBJECT];
    for (const ci of r.cells) {
      if (floors[ci]) ids.add(floors[ci]);
      const x = ci % WORLD_CELLS;
      const z = (ci - x) / WORLD_CELLS;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!inWorld(x + dx, z + dz)) continue;
          const ni = cellIndex(x + dx, z + dz);
          if (this.grid.walls[ni] && objs[ni]) ids.add(objs[ni]);
        }
      }
    }
    return [...ids];
  }

  // ---------------------------------------------------------------- factories

  /** Select the recipe an automated factory crafts (null clears). The recipe's station must match def.factory. */
  setRecipe(id: Id, recipe: string | null): void {
    const b = this.get(id);
    if (!b) return;
    const d = this.def(b);
    if (!d.factory) {
      this.reject(`${d.name} is not a factory`);
      return;
    }
    if (recipe !== null) {
      const r = this.game.data.recipe(recipe);
      if (!r || r.station !== d.factory) {
        this.reject(`${d.name} can't make that`);
        return;
      }
      const st = this.game.state;
      if (r.unlockTier > st.colony.tier || (r.research && !st.research.completed.includes(r.research))) {
        this.reject(`${r.name} is still locked`);
        return;
      }
    }
    if (b.recipe === recipe) return;
    b.recipe = recipe;
    b.craft = 0;
    this.lastReason = null;
    this.econDirty = true;
    this.changed();
    this.flushEconomy();
  }

  // ---------------------------------------------------------------- blueprints

  /** Save buildings as a reusable blueprint (relative to their min corner; keeps rot & tier). */
  saveBlueprint(name: string, ids: Id[]): string | null {
    const parts: BuildingInstance[] = [];
    const seen = new Set<Id>();
    for (const id of ids) {
      const b = this.get(id);
      if (!b || seen.has(id) || this.def(b).core) continue;
      seen.add(id);
      parts.push(b);
    }
    if (!parts.length) return this.reject('Select some buildings first');
    let minX = Infinity;
    let minZ = Infinity;
    for (const b of parts) {
      minX = Math.min(minX, b.x);
      minZ = Math.min(minZ, b.z);
    }
    const list = this.game.state.buildings.blueprints;
    let n = list.length + 1;
    while (list.some((bp) => bp.id === `bp${n}`)) n++;
    const bp: Blueprint = {
      id: `bp${n}`,
      name: name.trim() || `Blueprint ${n}`,
      parts: parts.map((b) => ({ def: b.def, dx: b.x - minX, dz: b.z - minZ, rot: b.rot, tier: b.tier })),
    };
    list.push(bp);
    this.lastReason = null;
    this.game.bus.emit('blueprint:saved', { id: bp.id });
    return bp.id;
  }

  blueprint(id: string): Blueprint | undefined {
    return this.game.state.buildings.blueprints.find((b) => b.id === id);
  }

  deleteBlueprint(id: string): boolean {
    const list = this.game.state.buildings.blueprints;
    const i = list.findIndex((b) => b.id === id);
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  }

  /** Blueprint parts rotated by `rot` quarter turns, with offsets from the placement corner. */
  blueprintLayout(bpId: string, rot: 0 | 1 | 2 | 3 = 0): Layout | null {
    const bp = this.blueprint(bpId);
    if (!bp) return null;
    return rotateLayout(bp.parts, (def) => this.game.data.building(def)?.size ?? [1, 1], rot);
  }

  blueprintCost(bp: string): ResourceBag {
    const b = this.blueprint(bp);
    const total: ResourceBag = {};
    if (!b) return total;
    for (const p of b.parts) addInto(total, this.cost(p.def, this.partTier(p.def, p.tier)));
    return total;
  }

  /** All-or-nothing validity of a blueprint placement (unlocks, limits, space, total cost). */
  canPlaceBlueprint(bpId: string, x: number, z: number, rot: 0 | 1 | 2 | 3): PlaceCheck {
    const layout = this.blueprintLayout(bpId, rot);
    if (!layout || !layout.parts.length) return fail('unknown', 'Blueprint not found');
    const adds = new Map<string, number>();
    for (const p of layout.parts) {
      const d = this.game.data.building(p.def);
      if (!d) return fail('unknown', 'This blueprint uses a building that no longer exists');
      if (d.core) return fail('limit', 'Blueprints cannot contain the Command Center');
      const lock = this.lockReason(p.def);
      if (lock) return fail('locked', `${d.name}: ${lock}`);
      adds.set(p.def, (adds.get(p.def) ?? 0) + 1);
    }
    for (const [def, n] of adds) {
      const d = this.def(def);
      if (d.maxCount != null && this.countOf(def) + n > d.maxCount) return fail('limit', `Only ${d.maxCount} ${d.name} allowed`);
    }
    const claimed = new Set<number>();
    for (const p of layout.parts) {
      const d = this.def(p.def);
      const chk = this.checkFootprint(d, x + p.dx, z + p.dz, p.rot, undefined);
      if (!chk.ok) return chk;
      const layer = layerOf(d);
      for (let dz = 0; dz < p.h; dz++) {
        for (let dx = 0; dx < p.w; dx++) {
          const key = layer * 1e6 + cellIndex(x + p.dx + dx, z + p.dz + dz);
          if (claimed.has(key)) return fail('occupied', 'Blueprint parts overlap');
          claimed.add(key);
        }
      }
    }
    const cost = this.blueprintCost(bpId);
    if (!this.game.sys.economy.canAfford(cost)) return fail('cost', this.needText(cost));
    return OK;
  }

  /** Place a blueprint (rotated). All-or-nothing; pays the total once. Returns placed ids. */
  placeBlueprint(bp: string, x: number, z: number, rot: 0 | 1 | 2 | 3): Id[] {
    const chk = this.canPlaceBlueprint(bp, x, z, rot);
    if (!chk.ok) {
      this.reject(chk.reason);
      return [];
    }
    const layout = this.blueprintLayout(bp, rot)!;
    const total = this.blueprintCost(bp);
    if (!bagIsEmpty(total) && !this.game.sys.economy.spend(total, 'build')) {
      this.reject(this.needText(total));
      return [];
    }
    const ids: Id[] = [];
    this.beginBatch();
    for (const p of layout.parts) {
      const d = this.def(p.def);
      const tier = this.partTier(p.def, p.tier);
      ids.push(this.create(d, x + p.dx, z + p.dz, p.rot, tier, this.cost(p.def, tier), false, false).id);
    }
    this.endBatch();
    this.lastReason = null;
    const cx = cellMin(x) + (layout.w * CELL) / 2;
    const cz = cellMin(z) + (layout.h * CELL) / 2;
    this.game.bus.emit('sfx', { id: 'place', x: cx, z: cz });
    this.flushEconomy();
    return ids;
  }

  // ---------------------------------------------------------------- combat hooks

  /** Apply damage (combat calls this). At 0 hp status becomes 'damaged' — never destroyed. */
  damage(id: Id, amount: number): void {
    const b = this.byId.get(id);
    if (!b || !(amount > 0)) return;
    this.calm = 0;
    if (b.status === 'damaged' || b.hp <= 0) return;
    const dealt = Math.min(b.hp, amount);
    b.hp -= dealt;
    this.markHurt(b);
    this.game.bus.emit('building:damaged', { id: b.id, def: b.def, amount: dealt });
    if (b.hp <= 1e-6) this.breakDown(b);
  }

  // ---------------------------------------------------------------- misc public helpers

  /** Force pending room/economy recomputation now (tests, UI right after a batch of edits). */
  flush(): void {
    this.ensureRooms();
    this.flushEconomy();
  }

  // ================================================================ internals

  /** Rebuild every runtime index from state (load, or after external list edits). */
  private rebuild(): void {
    const st = this.game.state;
    this.grid.clear();
    this.byId.clear();
    this.counts.clear();
    this.pending.length = 0;
    this.hurt.length = 0;
    this.hurtIds.clear();
    this.repairers.length = 0;
    const list = st.buildings.list;
    for (let i = list.length - 1; i >= 0; i--) {
      if (!this.game.data.building(list[i].def)) {
        console.warn(`[buildings] dropping unknown building def "${list[i].def}" from save`);
        list.splice(i, 1);
      }
    }
    let maxId = 0;
    for (const b of list) {
      this.sanitize(b);
      maxId = Math.max(maxId, b.id);
      this.index(b, this.def(b));
    }
    if (st.buildings.nextId <= maxId) st.buildings.nextId = maxId + 1;
    this.roomsDirty = true;
  }

  private sanitize(b: BuildingInstance): void {
    const d = this.def(b);
    if (!Array.isArray(b.workers)) b.workers = [];
    b.rot = ((((b.rot | 0) % 4) + 4) % 4) as Rot;
    b.level = Math.max(1, Math.min(d.maxLevel, b.level | 0 || 1));
    if (!Number.isFinite(b.tier)) b.tier = 0;
    if (!(b.maxHp > 0) || !Number.isFinite(b.maxHp)) b.maxHp = this.computeMaxHp(d, b.tier);
    if (!Number.isFinite(b.hp)) b.hp = b.maxHp;
    b.hp = Math.max(0, Math.min(b.maxHp, b.hp));
    if (!Number.isFinite(b.progress)) b.progress = 1;
    if (b.status === 'damaged' && b.hp >= b.maxHp) b.status = b.progress < 1 ? 'building' : 'active';
    if (b.hp <= 0 && b.status !== 'damaged') b.status = 'damaged';
    if (b.status === 'building' && b.progress >= 1) b.status = 'active';
    if (b.status === 'active' && b.progress < 1) b.progress = 1;
  }

  /** Add a building to the runtime indexes (not to state). */
  private index(b: BuildingInstance, d: BuildingDef): void {
    this.byId.set(b.id, b);
    this.counts.set(b.def, (this.counts.get(b.def) ?? 0) + 1);
    this.grid.stamp(b, d);
    if (b.progress < 1) this.pending.push(b);
    if (b.hp < b.maxHp) this.markHurt(b);
    if (d.repair) this.repairers.push(b);
  }

  private unindex(b: BuildingInstance, d: BuildingDef): void {
    this.byId.delete(b.id);
    const n = (this.counts.get(b.def) ?? 1) - 1;
    if (n > 0) this.counts.set(b.def, n);
    else this.counts.delete(b.def);
    this.grid.stamp(b, d, true);
    removeFrom(this.pending, b);
    if (this.hurtIds.delete(b.id)) removeFrom(this.hurt, b);
    removeFrom(this.repairers, b);
    this.offBeforeBreak.delete(b.id);
  }

  /** New instance object (not yet in state). `done` = skip construction. */
  private makeInstance(d: BuildingDef, x: number, z: number, rot: Rot, tier: number, spent: ResourceBag, done: boolean): BuildingInstance {
    const maxHp = this.computeMaxHp(d, tier);
    return {
      id: this.game.state.buildings.nextId++,
      def: d.id,
      x,
      z,
      rot,
      level: 1,
      tier,
      hp: maxHp,
      maxHp,
      status: done ? 'active' : 'building',
      progress: done ? 1 : 0,
      workers: [],
      recipe: null,
      craft: 0,
      eff: 0,
      spent: { ...spent },
    };
  }

  /** Create a building (already validated & paid): harvest nodes underneath, index, announce. */
  private create(d: BuildingDef, x: number, z: number, rot: Rot, tier: number, spent: ResourceBag, instant: boolean, announce: boolean): BuildingInstance {
    const st = this.game.state;
    const done = instant || !(d.buildTime > 0);
    const b = this.makeInstance(d, x, z, rot, tier, spent, done);
    this.clearNodesUnder(b, d);
    st.buildings.list.push(b);
    this.index(b, d);
    this.roomsDirty = true;
    this.game.bus.emit('building:placed', { id: b.id, def: d.id });
    this.changed();
    if (announce) {
      const p = this.centerInto(b, this.tmpCenter);
      this.game.bus.emit('sfx', { id: 'place', x: p.x, z: p.z });
    }
    if (done) this.complete(b, d, announce);
    return b;
  }

  /** Harvest & deplete resource nodes under a footprint (trees/rocks may be built over). */
  private clearNodesUnder(b: BuildingInstance, d: BuildingDef): void {
    const [w, h] = rotatedSize(d.size, b.rot);
    this.game.sys.world.clearNodesInRect(b.x, b.z, b.x + w - 1, b.z + h - 1);
  }

  /** Finish construction. `announce` = per-building float + sound (pieces are announced in bulk). */
  private complete(b: BuildingInstance, d: BuildingDef, announce: boolean): void {
    b.status = 'active';
    b.progress = 1;
    removeFrom(this.pending, b);
    this.game.state.stats.built++;
    this.econDirty = true;
    this.game.bus.emit('building:completed', { id: b.id, def: b.def });
    this.changed();
    if (announce) {
      const p = this.centerInto(b, this.tmpCenter);
      this.game.bus.emit('ui:float', { text: `Built ${d.name}!`, x: p.x, z: p.z, color: '#ffe08a', big: !d.piece });
      this.game.bus.emit('sfx', { id: 'build_complete', x: p.x, z: p.z });
    }
  }

  private advanceConstruction(dt: number): void {
    const speed = this.game.sys.economy.modifier('buildSpeed') * (1 + ENGINEER_BUILD_BONUS * this.engineersWorking());
    let pieces = 0;
    let pieceDef: string | null = null;
    let mixed = false;
    let last: BuildingInstance | null = null;
    this.beginBatch();
    // backwards: complete() swap-removes from `pending`, moving an already-visited element into i
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const b = this.pending[i];
      if (b.status !== 'building') continue; // broken mid-construction: wait for repair
      const d = this.def(b);
      b.progress += d.buildTime > 0 ? (dt * speed) / d.buildTime : 1;
      if (b.progress < 1 - 1e-6) continue; // tolerate float accumulation
      this.complete(b, d, !d.piece);
      if (d.piece) {
        pieces++;
        if (pieceDef && pieceDef !== d.id) mixed = true;
        pieceDef = d.id;
        last = b;
      }
    }
    this.endBatch();
    if (last && pieceDef) {
      const name = this.def(pieceDef).name;
      const text = pieces === 1 ? `Built ${name}!` : mixed ? `Built ${pieces} pieces!` : `Built ${pieces} ${name}s!`;
      const p = this.centerInto(last, this.tmpCenter);
      this.game.bus.emit('ui:float', { text, x: p.x, z: p.z, color: '#ffe08a' });
      this.game.bus.emit('sfx', { id: 'build_complete', x: p.x, z: p.z });
    }
  }

  /** Colonists assigned to a workplace whose job is 'engineer'. */
  private engineersWorking(): number {
    let n = 0;
    for (const c of this.game.state.colonists.list) {
      if (c.workplace == null) continue;
      const w = this.byId.get(c.workplace);
      if (w && this.def(w).workers?.job === 'engineer') n++;
    }
    return n;
  }

  private updateRepairs(dt: number): void {
    if (this.game.state.combat.phase === 'attack') this.calm = 0;
    else this.calm += dt;
    if (!this.hurt.length) return;
    const bal = this.game.data.balance;
    const auto = this.calm >= bal.repairDelay;
    if (!auto && !this.repairers.length) return;
    const mod = this.game.sys.economy.modifier('repairSpeed');
    this.beginBatch();
    for (let i = this.hurt.length - 1; i >= 0; i--) {
      const b = this.hurt[i];
      let hps = auto ? bal.repairRate * b.maxHp : 0;
      if (this.repairers.length) hps += this.bayRepairFor(b);
      if (hps > 0) this.heal(b, hps * mod * dt);
    }
    this.endBatch();
  }

  /** HP/s that active repair buildings within range provide to `b` (stacking). */
  private bayRepairFor(b: BuildingInstance): number {
    const bd = this.def(b);
    const [bw, bh] = rotatedSize(bd.size, b.rot);
    const bx = b.x + bw / 2;
    const bz = b.z + bh / 2;
    const r2 = REPAIR_RANGE_CELLS * REPAIR_RANGE_CELLS;
    let hps = 0;
    for (const r of this.repairers) {
      if (r === b || r.status !== 'active') continue;
      const rd = this.def(r);
      const [rw, rh] = rotatedSize(rd.size, r.rot);
      const dx = r.x + rw / 2 - bx;
      const dz = r.z + rh / 2 - bz;
      if (dx * dx + dz * dz <= r2) hps += (rd.repair ?? 0) * this.levelMult(r, rd);
    }
    return hps;
  }

  private heal(b: BuildingInstance, amount: number): void {
    b.hp = Math.min(b.maxHp, b.hp + amount);
    if (b.hp < b.maxHp - 1e-6) return;
    b.hp = b.maxHp;
    if (this.hurtIds.delete(b.id)) removeFrom(this.hurt, b);
    if (b.status === 'damaged') {
      b.status = this.restoredStatus(b);
      this.grid.refreshBlock(b, this.def(b));
      this.econDirty = true;
      this.changed();
    }
    this.game.bus.emit('building:repaired', { id: b.id, def: b.def });
  }

  private restoredStatus(b: BuildingInstance): BuildingStatus {
    if (b.progress < 1) return 'building';
    return this.offBeforeBreak.delete(b.id) ? 'off' : 'active';
  }

  private breakDown(b: BuildingInstance): void {
    b.hp = 0;
    if (b.status === 'off') this.offBeforeBreak.add(b.id);
    b.status = 'damaged';
    this.grid.refreshBlock(b, this.def(b));
    this.econDirty = true;
    this.game.bus.emit('building:broken', { id: b.id, def: b.def });
    const p = this.centerInto(b, this.tmpCenter);
    this.game.bus.emit('sfx', { id: 'explosion', x: p.x, z: p.z, volume: 0.35 });
    this.changed();
  }

  private markHurt(b: BuildingInstance): void {
    if (this.hurtIds.has(b.id)) return;
    this.hurtIds.add(b.id);
    this.hurt.push(b);
  }

  /** Place the colony core on a fresh game (or repair a save that lost it). */
  private ensureCore(): void {
    const st = this.game.state;
    const coreDefId = this.coreDefId();
    let core = st.colony.coreId != null ? this.byId.get(st.colony.coreId) : undefined;
    if (!core || core.def !== coreDefId) core = st.buildings.list.find((b) => b.def === coreDefId);
    if (!core) {
      const d = this.def(coreDefId);
      const [w, h] = d.size;
      const x = CENTER_CELL - Math.floor((w - 1) / 2);
      const z = CENTER_CELL - Math.floor((h - 1) / 2);
      // a broken save might have something in the way: clear it (refunding) so the colony keeps its heart
      for (let cz = z; cz < z + h; cz++) {
        for (let cx = x; cx < x + w; cx++) {
          const o = this.objectAt(cx, cz);
          if (o) this.remove(o.id);
        }
      }
      // Silent: the pod isn't "built" by the player (no placed/completed events, no stats), and the
      // world keeps the crash site clear, so no nodes are harvested.
      core = this.makeInstance(d, x, z, 0, st.colony.tier, {}, true);
      st.buildings.list.push(core);
      this.index(core, d);
      this.roomsDirty = true;
      this.changed();
    }
    st.colony.coreId = core.id;
  }

  private coreDefId(): string {
    const anchor = ANCHOR_IDS.coreBuilding;
    if (this.game.data.building(anchor)) return anchor;
    return this.game.data.buildings.find((b) => b.core)?.id ?? anchor;
  }

  private updateColonyCenter(): void {
    const core = this.core();
    if (!core) {
      this.ccx = this.ccz = CENTER_CELL;
      return;
    }
    const [w, h] = rotatedSize(this.def(core).size, core.rot);
    this.ccx = core.x + (w - 1) / 2;
    this.ccz = core.z + (h - 1) / 2;
  }

  /** Geometry + rules check. `free` skips affordability. Moving (ignoreId) skips unlock/limit/cost. */
  private check(defId: string, x: number, z: number, rot: Rot, ignoreId: Id | undefined, tier: number | undefined, free: boolean): PlaceCheck {
    const d = this.game.data.building(defId);
    if (!d) return fail('unknown', 'Unknown building');
    const moving = ignoreId != null ? this.byId.get(ignoreId) : undefined;
    const isMove = !!moving && moving.def === defId;
    const st = this.game.state;
    const t = d.piece ? this.pieceTier(tier) : st.colony.tier;
    if (!isMove) {
      const lock = this.lockReason(defId);
      if (lock) return fail('locked', lock);
      if (d.piece && t > st.colony.tier) {
        return fail('tier', `${this.game.data.tier(t).name} material unlocks at the ${this.game.data.tier(t).name} tier`);
      }
      if (d.maxCount != null && this.countOf(defId) >= d.maxCount) {
        return fail('limit', d.maxCount === 1 ? `You already have a ${d.name}` : `Limit reached: ${d.maxCount} ${d.name}s`);
      }
    }
    const geo = this.checkFootprint(d, x, z, rot, ignoreId);
    if (!geo.ok) return geo;
    if (!isMove && !free) {
      const cost = this.cost(defId, t);
      if (!this.game.sys.economy.canAfford(cost)) return fail('cost', this.needText(cost));
    }
    return OK;
  }

  /** World bounds, colony radius, terrain and same-layer overlap for a footprint. */
  private checkFootprint(d: BuildingDef, x: number, z: number, rot: Rot, ignoreId: Id | undefined): PlaceCheck {
    const [w, h] = rotatedSize(d.size, rot);
    const layer = layerOf(d);
    const occ = this.grid.layers[layer];
    const world = this.game.sys.world;
    for (let cz = z; cz < z + h; cz++) {
      for (let cx = x; cx < x + w; cx++) {
        if (!inWorld(cx, cz)) return fail('world', 'Outside the world');
        if (!this.inColony(cx, cz)) return fail('colony', 'Outside colony — upgrade your colony tier to expand');
      }
    }
    for (let cz = z; cz < z + h; cz++) {
      for (let cx = x; cx < x + w; cx++) {
        if (!world.walkable(cellCenter(cx), cellCenter(cz))) return fail('terrain', "Can't build on water");
        const id = occ[cellIndex(cx, cz)];
        if (id && id !== ignoreId) {
          const other = this.byId.get(id);
          return fail('occupied', other ? `Space taken by ${this.def(other).name}` : 'Space is taken');
        }
      }
    }
    return OK;
  }

  /** "Need 5 more Wood, 2 more Stone" for a cost against current (or given) amounts. */
  private needText(cost: ResourceBag, have: Record<string, number> = this.game.state.resources.amounts): string {
    const parts: string[] = [];
    for (const [k, v] of bagEntries(cost)) {
      const miss = v - (have[k] ?? 0);
      if (miss > 1e-9) parts.push(`${Math.ceil(miss - 1e-6)} more ${this.game.data.resource(k)?.name ?? k}`);
    }
    return parts.length ? `Need ${parts.join(', ')}` : 'Not enough resources';
  }

  private reject(reason: string | undefined): null {
    this.lastReason = reason ?? 'Not possible';
    return null;
  }

  private no(reason: string | undefined): false {
    this.lastReason = reason ?? 'Not possible';
    return false;
  }

  /**
   * Piece material tier: the requested one (integer ≥ 0; may exceed the colony tier — check() rejects
   * that), or when omitted the build preview's current selection clamped to the colony tier.
   */
  private pieceTier(tier: number | undefined): number {
    if (tier != null && Number.isFinite(tier)) return Math.max(0, Math.floor(tier));
    const t = this.game.view.build.tier | 0;
    return Math.max(0, Math.min(this.game.state.colony.tier, t));
  }

  /** Blueprint part tier: pieces keep their material (clamped), facilities follow the colony tier. */
  private partTier(defId: string, tier: number): number {
    const colony = this.game.state.colony.tier;
    return this.isPiece(defId) ? Math.max(0, Math.min(colony, tier)) : colony;
  }

  private computeMaxHp(d: BuildingDef, tier: number): number {
    const mult = d.piece ? this.game.data.tier(tier).hpMult : 1 + FACILITY_HP_PER_TIER * tier;
    return Math.max(1, Math.round(d.hp * mult * this.game.sys.economy.modifier('structureHp')));
  }

  /** Re-derive maxHp (keeping the HP fraction) after a tier/material/modifier change. */
  private rescaleHp(b: BuildingInstance, d: BuildingDef): void {
    const max = this.computeMaxHp(d, b.tier);
    if (max === b.maxHp) return;
    const full = b.hp >= b.maxHp;
    const ratio = b.maxHp > 0 ? b.hp / b.maxHp : 1;
    b.maxHp = max;
    if (b.status === 'damaged') b.hp = Math.min(b.hp, max);
    else b.hp = full ? max : ratio * max;
  }

  private applyMaterial(b: BuildingInstance, toTier: number, paid: ResourceBag): void {
    b.spent = addInto(this.invested(b), paid);
    b.tier = toTier;
    this.rescaleHp(b, this.def(b));
    this.game.bus.emit('building:upgraded', { id: b.id, def: b.def, level: b.level, tier: b.tier });
  }

  private tierUpCandidates(ids: Id[], toTier: number): BuildingInstance[] {
    const out: BuildingInstance[] = [];
    if (!Number.isInteger(toTier) || toTier > this.game.state.colony.tier || toTier > MAX_TIER) return out;
    const seen = new Set<Id>();
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const b = this.get(id);
      if (b && this.def(b).piece && b.tier < toTier) out.push(b);
    }
    return out;
  }

  /** Total invested resources (persisted in `spent`; derived for legacy saves). */
  private invested(b: BuildingInstance): ResourceBag {
    if (b.spent) return { ...b.spent };
    const d = this.def(b);
    if (d.core) return {};
    if (d.piece) return this.cost(d.id, b.tier);
    const total: ResourceBag = { ...d.cost };
    const mult = d.levelCostMult ?? DEFAULT_LEVEL_COST_MULT;
    for (let l = 1; l < b.level; l++) addInto(total, scaleCeil(d.cost, Math.pow(mult, l)));
    return total;
  }

  private levelMult(b: BuildingInstance, d: BuildingDef): number {
    return 1 + (d.levelEffect ?? 0) * (b.level - 1);
  }

  /** Short label for what a level-up improves ("Production", "Storage", ...). */
  private effectLabel(d: BuildingDef): string {
    if (d.produces) return 'Production';
    if (d.research_rate) return 'Research';
    if (d.storage) return 'Storage';
    if (d.turret || d.trap) return 'Damage';
    if (d.shield) return 'Shield';
    if (d.repair) return 'Repair';
    if ((d.power ?? 0) > 0) return 'Power';
    if (d.housing) return 'Housing';
    if (d.comfort || d.entertainment) return 'Comfort';
    return 'Output';
  }

  /** On colony tier-up every facility adopts the new tier for free (visual refresh + HP). */
  private refreshFacilityTiers(tier: number): void {
    this.beginBatch();
    for (const b of this.game.state.buildings.list) {
      const d = this.def(b);
      if (d.piece || b.tier === tier) continue;
      b.tier = tier;
      this.rescaleHp(b, d);
      if (b.hp < b.maxHp) this.markHurt(b);
    }
    this.changed();
    this.endBatch();
  }

  /** Re-apply the structureHp modifier (research completed). */
  private refreshMaxHp(): void {
    let any = false;
    for (const b of this.game.state.buildings.list) {
      const d = this.def(b);
      const before = b.maxHp;
      this.rescaleHp(b, d);
      if (b.maxHp !== before) any = true;
    }
    if (any) this.changed();
  }

  private ensureRooms(): void {
    if (this.roomsDirty) this.recomputeRooms();
  }

  private recomputeRooms(): void {
    this.roomsDirty = false;
    let box: CellRect | null = null;
    for (const b of this.game.state.buildings.list) {
      const d = this.def(b);
      if (!isWallLike(d)) continue;
      const [w, h] = rotatedSize(d.size, b.rot);
      if (!box) box = { x0: b.x, z0: b.z, x1: b.x + w - 1, z1: b.z + h - 1 };
      else {
        box.x0 = Math.min(box.x0, b.x);
        box.z0 = Math.min(box.z0, b.z);
        box.x1 = Math.max(box.x1, b.x + w - 1);
        box.z1 = Math.max(box.z1, b.z + h - 1);
      }
    }
    const derived = this.game.derived;
    derived.rooms = this.roomDetector.compute(this.grid, box, derived.roofCells, ROOM_MAX_CELLS);
    derived.buildingsVersion++;
  }

  private flushEconomy(): void {
    if (!this.econDirty) return;
    this.econDirty = false;
    this.game.sys.economy.recompute();
  }

  private beginBatch(): void {
    this.batchDepth++;
  }

  private endBatch(): void {
    if (--this.batchDepth > 0) return;
    this.batchDepth = 0;
    if (this.batchChanged) {
      this.batchChanged = false;
      this.game.bus.emit('building:changed', {});
    }
  }

  /** Signal a change to buildings: bump the render/UI cache key and emit building:changed (batched). */
  private changed(): void {
    this.game.derived.buildingsVersion++;
    if (this.batchDepth > 0) this.batchChanged = true;
    else this.game.bus.emit('building:changed', {});
  }
}
