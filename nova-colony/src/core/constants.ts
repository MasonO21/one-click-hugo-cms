/**
 * World-space conventions (shared by sim, render and UI).
 *
 * - The world is a flat square plane on X/Z, Y is up. Origin (0,0) is the crash site / colony core.
 * - The build grid has WORLD_CELLS x WORLD_CELLS cells of CELL world units each.
 * - Cell coordinates are integers 0..WORLD_CELLS-1. Cell (CENTER_CELL, CENTER_CELL) contains the origin.
 * - A building's (x, z) is the cell of its min corner; its footprint is size[0] x size[1] cells
 *   (swapped when rot is 1 or 3).
 */
export const CELL = 2;
export const WORLD_CELLS = 256;
export const WORLD_SIZE = CELL * WORLD_CELLS; // 512 world units
export const HALF_WORLD = WORLD_SIZE / 2;
export const CENTER_CELL = WORLD_CELLS / 2; // 128

export const SAVE_VERSION = 1;
export const MAX_TIER = 6;
export const TIER_IDS = ['wood', 'reinforced', 'stone', 'steel', 'alloy', 'nano', 'titanium'] as const;
export type TierId = (typeof TIER_IDS)[number];

/** World coordinate -> cell index on one axis. */
export function cellOf(w: number): number {
  return Math.floor((w + HALF_WORLD) / CELL);
}
/** Cell index -> world coordinate of the cell's center on one axis. */
export function cellCenter(c: number): number {
  return (c + 0.5) * CELL - HALF_WORLD;
}
/** Cell index -> world coordinate of the cell's min edge on one axis. */
export function cellMin(c: number): number {
  return c * CELL - HALF_WORLD;
}
/** Flattened index for per-cell arrays. */
export function cellIndex(cx: number, cz: number): number {
  return cz * WORLD_CELLS + cx;
}
export function inWorld(cx: number, cz: number): boolean {
  return cx >= 0 && cz >= 0 && cx < WORLD_CELLS && cz < WORLD_CELLS;
}
/** Footprint size of a building in cells after rotation. */
export function rotatedSize(size: [number, number], rot: number): [number, number] {
  return rot % 2 === 1 ? [size[1], size[0]] : [size[0], size[1]];
}
/** World-space center of a footprint whose min corner is at cell (x, z). */
export function footprintCenter(x: number, z: number, size: [number, number], rot: number): { x: number; z: number } {
  const [w, h] = rotatedSize(size, rot);
  return { x: cellMin(x) + (w * CELL) / 2, z: cellMin(z) + (h * CELL) / 2 };
}
