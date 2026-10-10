import { describe, expect, it } from 'vitest';
import { EDGE_SHIFT, acrossOnly, wallEdgeShift } from '../src/render/models/wallSnap';

/** A 4×4 floor at cells 0..3 with walls on its border cells: `built` says what stands where. */
function room(extra: (x: number, z: number) => boolean = () => false) {
  const floor = (x: number, z: number) => x >= 0 && x <= 3 && z >= 0 && z <= 3;
  const built = (x: number, z: number) => floor(x, z) || extra(x, z);
  return (x: number, z: number) => wallEdgeShift(floor(x, z), (dx, dz) => built(x + dx, z + dz));
}

describe('walls on floors snap to the floor edge', () => {
  it('a wall on the top border moves out across its length only', () => {
    expect(room()(1, 3)).toEqual([0, EDGE_SHIFT]);
    expect(room()(2, 0)).toEqual([0, -EDGE_SHIFT]);
    expect(room()(0, 2)).toEqual([-EDGE_SHIFT, 0]);
  });

  it('a corner moves out on both axes', () => {
    expect(room()(3, 3)).toEqual([EDGE_SHIFT, EDGE_SHIFT]);
    expect(room()(0, 0)).toEqual([-EDGE_SHIFT, -EDGE_SHIFT]);
  });

  it('a partition with floor on both sides stays centred', () => {
    expect(room()(1, 1)).toEqual([0, 0]);
  });

  it('a wall off any floor stays centred', () => {
    expect(wallEdgeShift(false, () => false)).toEqual([0, 0]);
    expect(wallEdgeShift(false, (dx) => dx < 0)).toEqual([0, 0]);
  });

  it('a wall continuing past the floor counts as built up', () => {
    // a wall at (4, 3) continues the top row: the corner cell has built-up cells on both X sides
    const shift = room((x, z) => x === 4 && z === 3)(3, 3);
    expect(shift).toEqual([0, EDGE_SHIFT]);
  });

  it('lone panels, doors and windows keep only the offset across their length', () => {
    expect(acrossOnly([EDGE_SHIFT, EDGE_SHIFT], 0)).toEqual([0, EDGE_SHIFT]);
    expect(acrossOnly([EDGE_SHIFT, EDGE_SHIFT], Math.PI / 2)).toEqual([EDGE_SHIFT, 0]);
    expect(acrossOnly([-EDGE_SHIFT, 0], -Math.PI)).toEqual([0, 0]);
  });
});
