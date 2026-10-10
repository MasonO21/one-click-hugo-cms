/**
 * Walls on floors sit on the floor's edge. Walls are cell pieces (the cell holds the wall for rooms and pathing) and
 * are drawn down the middle of their cell; one standing on the edge of a floor is drawn moved out to the floor's
 * outer edge instead, so a floored room reads as walls around the floor rather than walls through its border tiles.
 * Shared by the placed pieces (actors/Buildings) and the build ghost (scene/BuildOverlay).
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
