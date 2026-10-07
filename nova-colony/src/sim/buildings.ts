/**
 * BuildingSystem — grid occupancy, placement validation, construction, drag-to-build lines,
 * move/rotate/remove (full refund), level & material-tier upgrades, mass/room upgrades,
 * blueprints, enclosed-room detection (auto roofs), and auto-repair after attacks.
 *
 * OWNER: construction agent. Writes state.buildings and game.derived.{roofCells, rooms, buildingsVersion}.
 */
import { System } from './System';
import type { BuildingDef, ResourceBag } from '../data/schema';
import type { BuildingInstance, Id } from '../core/state';

export interface PlaceCheck {
  ok: boolean;
  reason?: string;
}

export type Walker = 'player' | 'colonist' | 'alien';

export class BuildingSystem extends System {
  // ---------------------------------------------------------------- queries

  get(id: Id): BuildingInstance | undefined {
    return this.game.state.buildings.list.find((b) => b.id === id);
  }

  def(b: BuildingInstance | string): BuildingDef {
    return this.game.data.building(typeof b === 'string' ? b : b.def)!;
  }

  all(): BuildingInstance[] {
    return this.game.state.buildings.list;
  }

  /** Building occupying a cell, if any. */
  at(_cx: number, _cz: number): BuildingInstance | undefined {
    return undefined;
  }

  countOf(defId: string): number {
    return this.game.state.buildings.list.filter((b) => b.def === defId).length;
  }

  core(): BuildingInstance | undefined {
    const id = this.game.state.colony.coreId;
    return id == null ? undefined : this.get(id);
  }

  /** World-space center of a building footprint. */
  center(_b: BuildingInstance): { x: number; z: number } {
    return { x: 0, z: 0 };
  }

  /** Is a cell inside the buildable colony radius? */
  inColony(_cx: number, _cz: number): boolean {
    return true;
  }

  /** Movement blocking query used by player, colonists and alien pathing. */
  blocked(_cx: number, _cz: number, _who: Walker): boolean {
    return false;
  }

  isUnlocked(defId: string): boolean {
    const d = this.game.data.building(defId);
    if (!d) return false;
    if (d.unlockTier > this.game.state.colony.tier) return false;
    if (d.research && !this.game.state.research.completed.includes(d.research)) return false;
    return true;
  }

  /** Build cost for a def at a material tier (pieces) or level 1 (facilities). */
  cost(_defId: string, _tier?: number): ResourceBag {
    return {};
  }

  // ---------------------------------------------------------------- placement

  canPlace(_defId: string, _x: number, _z: number, _rot: 0 | 1 | 2 | 3, _ignoreId?: Id): PlaceCheck {
    return { ok: false, reason: 'not implemented' };
  }

  /** Pay and place. Returns the new id or null. */
  place(_defId: string, _x: number, _z: number, _rot: 0 | 1 | 2 | 3, _opts?: { tier?: number; free?: boolean; instant?: boolean }): Id | null {
    return null;
  }

  /** Cells for a drag-to-build line of pieces from (x0,z0) to (x1,z1) (axis-aligned L or straight). */
  lineCells(_x0: number, _z0: number, _x1: number, _z1: number): { x: number; z: number }[] {
    return [];
  }

  /** Place pieces along a line; skips invalid cells. Returns placed ids. */
  placeLine(_defId: string, _x0: number, _z0: number, _x1: number, _z1: number, _tier: number): Id[] {
    return [];
  }

  /** Relocate for free (no resources lost). */
  move(_id: Id, _x: number, _z: number, _rot: 0 | 1 | 2 | 3): boolean {
    return false;
  }

  rotate(_id: Id): boolean {
    return false;
  }

  /** Remove with refund (BalanceDef.removeRefund). The core cannot be removed. */
  remove(_id: Id): boolean {
    return false;
  }

  /** Toggle a facility on/off (saves power). */
  toggle(_id: Id): void {}

  // ---------------------------------------------------------------- upgrades

  /** Next level cost, or null at max level. */
  levelUpCost(_id: Id): ResourceBag | null {
    return null;
  }

  levelUp(_id: Id): boolean {
    return false;
  }

  /** Cost to change a piece's material tier (difference between tier costs, never negative). */
  tierUpCost(_id: Id, _toTier: number): ResourceBag | null {
    return null;
  }

  tierUp(_id: Id, _toTier: number): boolean {
    return false;
  }

  /** Mass upgrade pieces to a material tier. */
  massTierUpCost(_ids: Id[], _toTier: number): ResourceBag {
    return {};
  }

  massTierUp(_ids: Id[], _toTier: number): number {
    return 0;
  }

  /** Ids of all pieces forming the enclosed room containing the cell (walls, floor, doors...). */
  roomPieces(_cx: number, _cz: number): Id[] {
    return [];
  }

  // ---------------------------------------------------------------- factories

  setRecipe(_id: Id, _recipe: string | null): void {}

  // ---------------------------------------------------------------- blueprints

  saveBlueprint(_name: string, _ids: Id[]): string | null {
    return null;
  }

  blueprintCost(_bp: string): ResourceBag {
    return {};
  }

  placeBlueprint(_bp: string, _x: number, _z: number, _rot: 0 | 1 | 2 | 3): Id[] {
    return [];
  }

  // ---------------------------------------------------------------- combat hooks

  /** Apply damage (combat calls this). At 0 hp status becomes 'damaged' — never destroyed. */
  damage(_id: Id, _amount: number): void {}
}
