/**
 * Walls on floors sit on the floor's edge. Walls are cell pieces (the cell holds the wall for rooms and pathing) and
 * are drawn down the middle of their cell; one standing on the edge of a floor is drawn moved out to the floor's
 * outer edge instead, so a floored room reads as walls around the floor rather than walls through its border tiles.
 * Shared by the placed pieces (render/actors/Buildings), the build ghost (render/scene/BuildOverlay) and the player's
 * collision (BuildingSystem.playerBox): the player bumps into the panel where it is drawn.
 */

/** How far (world units) the wall moves: half a cell minus half the 0.6 panel, so its outer face meets the edge. */
export const EDGE_SHIFT = 0.7;

/**
 * Offsets (x, z) from the cell centre for a wall-like piece. `onFloor`: a floor or platform is under it. `builtUp(dx,
 * dz)`: a floor, platform or wall-like piece stands on that neighbour. Each axis moves toward its open side when one
 * side is built up and the other is not; pieces off floors, and partitions with floor on both sides, stay centred.
 */
export function wallEdgeShift(onFloor: boolean, builtUp: (dx: number, dz: number) => boolean, out: number[] = [0, 0]): number[] {
  out[0] = out[1] = 0;
  if (!onFloor) return out;
  const xp = builtUp(1, 0);
  const xm = builtUp(-1, 0);
  const zp = builtUp(0, 1);
  const zm = builtUp(0, -1);
  if (xp !== xm) out[0] = xm ? EDGE_SHIFT : -EDGE_SHIFT;
  if (zp !== zm) out[1] = zm ? EDGE_SHIFT : -EDGE_SHIFT;
  return out;
}

/** A lone panel (or a door / window) only moves across its own length: keep the offset perpendicular to `yaw`. */
export function acrossOnly(shift: number[], yaw: number): [number, number] {
  const alongX = Math.abs(Math.cos(yaw)) > 0.5;
  return alongX ? [0, shift[1]] : [shift[0], 0];
}

/**
 * Which way a door, window or gate runs (yaw 0: along X, PI / 2: along Z): along the line its neighbours form, else the
 * player's rotation. `joins(dx, dz)`: a piece it connects to (a wall, fence, door...) stands on that neighbour. The
 * placed piece and its build ghost both turn this way, so the ghost previews the turn the piece will take.
 */
export function lineAlong(joins: (dx: number, dz: number) => boolean, rot: number): number {
  const nx = joins(1, 0) || joins(-1, 0);
  const nz = joins(0, 1) || joins(0, -1);
  return nx && !nz ? 0 : nz && !nx ? Math.PI / 2 : rot % 2 === 0 ? 0 : Math.PI / 2;
}

/**
 * Whether a piece moves out to a floor's edge: walls, doors and windows do, and so does a gate in a wall line. A gate
 * in a fence line stays in line with the fence (fences never move). `kindAt(dx, dz)`: the piece on that neighbour.
 */
export function snapsToEdge(piece: string, kindAt: (dx: number, dz: number) => string | undefined): boolean {
  if (piece === 'wall' || piece === 'door' || piece === 'window') return true;
  if (piece !== 'gate') return false;
  return kindAt(1, 0) !== 'fence' && kindAt(-1, 0) !== 'fence' && kindAt(0, 1) !== 'fence' && kindAt(0, -1) !== 'fence';
}

/**
 * The cells a room's roof covers: the room plus every wall-like cell around it, corners included (`width`: cells per
 * row of the cell index). A corner post on a floor's edge stands on the room's outer corner, so a roof over only the
 * walls beside the room left a tile-sized hole inside each corner (and at each T where a partition meets the walls).
 */
export function roofCover(room: readonly number[], width: number, wallLike: (cx: number, cz: number) => boolean): Set<number> {
  const out = new Set<number>(room);
  for (const ci of room) {
    const cx = ci % width;
    const cz = (ci / width) | 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx !== 0 || dz !== 0) && wallLike(cx + dx, cz + dz)) out.add((cz + dz) * width + cx + dx);
      }
    }
  }
  return out;
}
