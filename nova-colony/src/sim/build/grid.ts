/**
 * BuildGrid — O(1) per-cell occupancy over the 256×256 world for construction.
 *
 * Two layers so facilities and beds can stand on floors:
 *  - FLOOR layer: `floor` and `platform` pieces.
 *  - OBJECT layer: everything else (walls, doors, facilities, turrets, the core...).
 *
 * Alongside the occupancy ids it keeps two derived masks, refreshed whenever a footprint is stamped
 * or a building's status changes, so hot queries never touch defs:
 *  - `walls`: 1 where a wall-like piece (wall/window/door/gate) stands — used by room detection.
 *  - `block`: movement bits (BLOCK_FRIENDLY | BLOCK_ALIEN) — used by player, colonist and alien pathing.
 */
import { WORLD_CELLS, cellIndex, rotatedSize } from '../../core/constants';
import type { BuildingDef } from '../../data/schema';
import type { BuildingInstance, Id } from '../../core/state';

export const FLOOR = 0;
export const OBJECT = 1;
export type Layer = typeof FLOOR | typeof OBJECT;

/** Movement bits in BuildGrid.block. */
export const BLOCK_FRIENDLY = 1;
export const BLOCK_ALIEN = 2;

const CELLS = WORLD_CELLS * WORLD_CELLS;

/** Which occupancy layer a def lives on. */
export function layerOf(def: BuildingDef): Layer {
  return def.piece === 'floor' || def.piece === 'platform' ? FLOOR : OBJECT;
}

/** Pieces that enclose rooms (and get roofed as the room's boundary). */
export function isWallLike(def: BuildingDef): boolean {
  const p = def.piece;
  return p === 'wall' || p === 'window' || p === 'door' || p === 'gate';
}

/**
 * Movement bits for a building:
 *  - doors/gates block only aliens;
 *  - other solid buildings block everyone (also while under construction);
 *  - a solid building broken to 0 HP ('damaged') has been breached: aliens pass, friendlies don't;
 *  - floors, traps, farm plots and other non-solid buildings never block.
 */
export function blockBits(def: BuildingDef, b: BuildingInstance): number {
  if (def.piece === 'door' || def.piece === 'gate') return b.status === 'damaged' ? 0 : BLOCK_ALIEN;
  if (!def.solid) return 0;
  return b.status === 'damaged' ? BLOCK_FRIENDLY : BLOCK_FRIENDLY | BLOCK_ALIEN;
}

export class BuildGrid {
  /** Occupancy per layer: building id per cellIndex (0 = empty; ids start at 1). */
  readonly layers: [Int32Array, Int32Array] = [new Int32Array(CELLS), new Int32Array(CELLS)];
  /** 1 where a wall-like piece stands on the object layer. */
  readonly walls = new Uint8Array(CELLS);
  /** Movement bits from the object layer. */
  readonly block = new Uint8Array(CELLS);

  clear(): void {
    this.layers[FLOOR].fill(0);
    this.layers[OBJECT].fill(0);
    this.walls.fill(0);
    this.block.fill(0);
  }

  /** Occupant id on a layer (0 = empty or outside the world). */
  get(layer: Layer, cx: number, cz: number): Id {
    if (cx < 0 || cz < 0 || cx >= WORLD_CELLS || cz >= WORLD_CELLS) return 0;
    return this.layers[layer][cellIndex(cx, cz)];
  }

  /** Write a building's footprint into the grid (or erase it with `remove`). */
  stamp(b: BuildingInstance, def: BuildingDef, remove = false): void {
    const layer = layerOf(def);
    const occ = this.layers[layer];
    const [w, h] = rotatedSize(def.size, b.rot);
    const wall = !remove && layer === OBJECT && isWallLike(def) ? 1 : 0;
    const bits = !remove && layer === OBJECT ? blockBits(def, b) : 0;
    for (let z = b.z; z < b.z + h; z++) {
      if (z < 0 || z >= WORLD_CELLS) continue;
      for (let x = b.x; x < b.x + w; x++) {
        if (x < 0 || x >= WORLD_CELLS) continue;
        const i = cellIndex(x, z);
        if (remove) {
          // only erase cells we own (a corrupt save could overlap)
          if (occ[i] !== b.id) continue;
          occ[i] = 0;
        } else {
          occ[i] = b.id;
        }
        if (layer === OBJECT) {
          this.walls[i] = wall;
          this.block[i] = bits;
        }
      }
    }
  }

  /** Refresh movement bits after a status change (e.g. broken / repaired). */
  refreshBlock(b: BuildingInstance, def: BuildingDef): void {
    if (layerOf(def) !== OBJECT) return;
    const bits = blockBits(def, b);
    const [w, h] = rotatedSize(def.size, b.rot);
    for (let z = b.z; z < b.z + h; z++) {
      for (let x = b.x; x < b.x + w; x++) {
        if (x < 0 || z < 0 || x >= WORLD_CELLS || z >= WORLD_CELLS) continue;
        const i = cellIndex(x, z);
        if (this.layers[OBJECT][i] === b.id) this.block[i] = bits;
      }
    }
  }
}
