/**
 * BuildingIndex — combat's read-only view of the colony: id lookup, the core, cached turret / trap /
 * shield / wall lists with per-building runtime (cooldowns, aim, shield HP), and allocation-free
 * footprint helpers. Rebuilt when buildings change (events), when the list is replaced/resized
 * (tests and loads push straight into state), and once per second as a safety net.
 */
import { CELL, HALF_WORLD } from '../../core/constants';
import type { BuildingInstance, Id } from '../../core/state';
import type { BuildingDef, ShieldSpec, TrapSpec, TurretSpec } from '../../data/schema';
import type { Game } from '../../core/Game';

// ------------------------------------------------------------------ footprint helpers (no allocation)

export function footW(def: BuildingDef, rot: number): number {
  return rot & 1 ? def.size[1] : def.size[0];
}
export function footH(def: BuildingDef, rot: number): number {
  return rot & 1 ? def.size[0] : def.size[1];
}
export function minX(b: BuildingInstance): number {
  return b.x * CELL - HALF_WORLD;
}
export function minZ(b: BuildingInstance): number {
  return b.z * CELL - HALF_WORLD;
}
export function centerX(b: BuildingInstance, def: BuildingDef): number {
  return minX(b) + (footW(def, b.rot) * CELL) / 2;
}
export function centerZ(b: BuildingInstance, def: BuildingDef): number {
  return minZ(b) + (footH(def, b.rot) * CELL) / 2;
}
/** Squared distance from a point to a building's footprint rectangle (0 inside). */
export function rectDist2(px: number, pz: number, b: BuildingInstance, def: BuildingDef): number {
  const x0 = minX(b);
  const z0 = minZ(b);
  const x1 = x0 + footW(def, b.rot) * CELL;
  const z1 = z0 + footH(def, b.rot) * CELL;
  const dx = px < x0 ? x0 - px : px > x1 ? px - x1 : 0;
  const dz = pz < z0 ? z0 - pz : pz > z1 ? pz - z1 : 0;
  return dx * dx + dz * dz;
}
/** Level effect multiplier: 1 + (level-1) * levelEffect. */
export function levelMult(b: BuildingInstance, def: BuildingDef): number {
  return 1 + (Math.max(1, b.level) - 1) * (def.levelEffect ?? 0.5);
}
/** Does this building stop aliens (solid, or a door/gate — friendlies only)? */
export function blocksAliens(def: BuildingDef): boolean {
  return def.solid || def.piece === 'door' || def.piece === 'gate';
}
/** Wall-like pieces brutes love to smash (walls, gates, doors, windows, fences, barricades). */
export function isWallLike(def: BuildingDef): boolean {
  if (def.piece) return def.piece === 'wall' || def.piece === 'gate' || def.piece === 'door' || def.piece === 'window' || def.piece === 'fence';
  return def.category === 'defense' && def.solid && !def.turret && !def.trap && !def.shield;
}

// ------------------------------------------------------------------ cached entries

export interface TurretEntry {
  b: BuildingInstance;
  def: BuildingDef;
  spec: TurretSpec;
  /** Footprint center (world units). */
  x: number;
  z: number;
  /** Seconds until the next shot. */
  cd: number;
  /** Aim yaw (radians, atan2(dx, dz)) — render rotates the turret head. */
  yaw: number;
  /** Current target alien id or -1. */
  target: Id;
  /** Seconds until the next retarget scan when idle. */
  retarget: number;
  /** playTime of the last shot (render recoil / muzzle flash). */
  firedAt: number;
  seen: number;
}

export interface TrapEntry {
  b: BuildingInstance;
  def: BuildingDef;
  spec: TrapSpec;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  cx: number;
  cz: number;
  /** Damage tick accumulator. */
  acc: number;
  seen: number;
}

export interface ShieldEntry {
  b: BuildingInstance;
  def: BuildingDef;
  spec: ShieldSpec;
  x: number;
  z: number;
  /** Protection radius (world units). */
  radius: number;
  /** Current / max absorb capacity and regen per second (level-scaled). */
  hp: number;
  cap: number;
  regen: number;
  seen: number;
}

export class BuildingIndex {
  readonly byId = new Map<Id, BuildingInstance>();
  readonly turrets: TurretEntry[] = [];
  readonly traps: TrapEntry[] = [];
  readonly shields: ShieldEntry[] = [];
  /** Wall-like pieces that currently block aliens (not damaged). */
  readonly walls: BuildingInstance[] = [];
  core: BuildingInstance | null = null;
  /** Bumped on every rebuild. */
  version = 0;
  /** Bumped only when the alien-blocking layout (position / rotation / damaged state) changes. */
  layoutVersion = 0;
  /** Set by event listeners; forces a rebuild on the next refresh(). */
  dirty = true;

  private readonly turretMap = new Map<Id, TurretEntry>();
  private readonly trapMap = new Map<Id, TrapEntry>();
  private readonly shieldMap = new Map<Id, ShieldEntry>();
  private listRef: BuildingInstance[] | null = null;
  private count = -1;
  private timer = 0;
  private stamp = 0;
  private layoutSig = 0;

  constructor(private readonly game: Game) {}

  /** Advance the periodic safety-net timer. */
  tick(dt: number): void {
    this.timer -= dt;
  }

  /** Rebuild caches if anything changed. Returns true when rebuilt. */
  refresh(force = false): boolean {
    const list = this.game.state.buildings.list;
    if (!force && !this.dirty && list === this.listRef && list.length === this.count && this.timer > 0) return false;
    this.rebuild(list);
    return true;
  }

  /** Forget runtime (cooldowns, shield HP) — used on load. */
  clearRuntime(): void {
    this.turretMap.clear();
    this.trapMap.clear();
    this.shieldMap.clear();
    this.dirty = true;
  }

  get(id: Id): BuildingInstance | undefined {
    return this.byId.get(id);
  }

  turret(id: Id): TurretEntry | undefined {
    return this.turretMap.get(id);
  }

  shield(id: Id): ShieldEntry | undefined {
    return this.shieldMap.get(id);
  }

  private rebuild(list: BuildingInstance[]): void {
    const data = this.game.data;
    const coreId = this.game.state.colony.coreId;
    const stamp = ++this.stamp;
    this.byId.clear();
    this.turrets.length = 0;
    this.traps.length = 0;
    this.shields.length = 0;
    this.walls.length = 0;
    this.core = null;
    let sig = 0x811c9dc5;
    const mix = (v: number) => {
      sig = Math.imul(sig ^ v, 0x01000193);
    };

    for (const b of list) {
      const def = data.building(b.def);
      if (!def) continue;
      this.byId.set(b.id, b);
      if (b.id === coreId || (def.core && !this.core)) this.core = b;
      if (blocksAliens(def) || def.core) {
        mix(b.id);
        mix(b.x);
        mix(b.z);
        mix(b.rot);
        mix(b.status === 'damaged' ? 1 : 0);
      }
      const cx = centerX(b, def);
      const cz = centerZ(b, def);

      if (def.turret) {
        let e = this.turretMap.get(b.id);
        if (!e) {
          e = { b, def, spec: def.turret, x: cx, z: cz, cd: 0, yaw: b.rot * (Math.PI / 2), target: -1, retarget: 0, firedAt: -1, seen: stamp };
          this.turretMap.set(b.id, e);
        }
        e.b = b;
        e.def = def;
        e.spec = def.turret;
        e.x = cx;
        e.z = cz;
        e.seen = stamp;
        this.turrets.push(e);
      }
      if (def.trap) {
        let e = this.trapMap.get(b.id);
        if (!e) {
          e = { b, def, spec: def.trap, x0: 0, z0: 0, x1: 0, z1: 0, cx, cz, acc: 0, seen: stamp };
          this.trapMap.set(b.id, e);
        }
        e.b = b;
        e.def = def;
        e.spec = def.trap;
        e.x0 = minX(b);
        e.z0 = minZ(b);
        e.x1 = e.x0 + footW(def, b.rot) * CELL;
        e.z1 = e.z0 + footH(def, b.rot) * CELL;
        e.cx = cx;
        e.cz = cz;
        e.seen = stamp;
        this.traps.push(e);
      }
      if (def.shield) {
        const lm = levelMult(b, def);
        let e = this.shieldMap.get(b.id);
        if (!e) {
          e = { b, def, spec: def.shield, x: cx, z: cz, radius: 0, hp: def.shield.capacity * lm, cap: 0, regen: 0, seen: stamp };
          this.shieldMap.set(b.id, e);
        }
        e.b = b;
        e.def = def;
        e.spec = def.shield;
        e.x = cx;
        e.z = cz;
        e.radius = def.shield.radius * CELL;
        e.cap = def.shield.capacity * lm;
        e.regen = def.shield.regen * lm;
        if (e.hp > e.cap) e.hp = e.cap;
        e.seen = stamp;
        this.shields.push(e);
      }
      if (b.status !== 'damaged' && blocksAliens(def) && isWallLike(def)) this.walls.push(b);
    }

    if (this.turretMap.size !== this.turrets.length) for (const [id, e] of this.turretMap) if (e.seen !== stamp) this.turretMap.delete(id);
    if (this.trapMap.size !== this.traps.length) for (const [id, e] of this.trapMap) if (e.seen !== stamp) this.trapMap.delete(id);
    if (this.shieldMap.size !== this.shields.length) for (const [id, e] of this.shieldMap) if (e.seen !== stamp) this.shieldMap.delete(id);

    if (sig !== this.layoutSig) {
      this.layoutSig = sig;
      this.layoutVersion++;
    }
    this.listRef = list;
    this.count = list.length;
    this.timer = 1;
    this.dirty = false;
    this.version++;
  }
}
