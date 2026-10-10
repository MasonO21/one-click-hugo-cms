import { describe, expect, it } from 'vitest';
import { EDGE_SHIFT, acrossOnly, lineAlong, roofCover, snapsToEdge, wallEdgeShift } from '../src/render/models/wallSnap';

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

describe('roofs cover the whole walled room', () => {
  const W = 16;
  const idx = (x: number, z: number) => z * W + x;
  /** Walls on the border of a w×h box at (0, 0); the room is its inside. */
  function box(w: number, h: number, wall: (x: number, z: number) => boolean = (x, z) => x === 0 || z === 0 || x === w - 1 || z === h - 1) {
    const room: number[] = [];
    for (let z = 1; z < h - 1; z++) for (let x = 1; x < w - 1; x++) if (!wall(x, z)) room.push(idx(x, z));
    const inBox = (x: number, z: number) => x >= 0 && z >= 0 && x < w && z < h;
    return roofCover(room, W, (x, z) => inBox(x, z) && wall(x, z));
  }

  it('covers the room, the walls beside it and the corner posts', () => {
    const cells = box(5, 4);
    expect(cells.size).toBe(5 * 4);
    for (const [x, z] of [[0, 0], [4, 0], [0, 3], [4, 3]]) expect(cells.has(idx(x, z))).toBe(true);
  });

  it('covers the T where a partition meets the outer wall', () => {
    const wall = (x: number, z: number) => x === 0 || z === 0 || x === 6 || z === 3 || x === 3;
    const cells = box(7, 4, wall);
    expect(cells.has(idx(3, 0))).toBe(true);
    expect(cells.has(idx(3, 3))).toBe(true);
    expect(cells.size).toBe(7 * 4);
  });

  it('leaves open ground and walls that do not touch the room alone', () => {
    const W2 = 16;
    const room = [idx(2, 2)];
    const far = roofCover(room, W2, (x, z) => x === 5 && z === 2);
    expect([...far]).toEqual([idx(2, 2)]);
  });
});

describe('doors, windows and gates in a line', () => {
  const at = (cells: Record<string, string>) => (dx: number, dz: number) => cells[`${dx},${dz}`];

  it('turn along the line their neighbours form, else the build rotation', () => {
    const joinsX = (dx: number) => dx !== 0;
    const joinsZ = (dx: number, dz: number) => dz !== 0;
    expect(lineAlong(joinsX, 1)).toBe(0);
    expect(lineAlong(joinsZ, 0)).toBe(Math.PI / 2);
    expect(lineAlong(() => false, 0)).toBe(0);
    expect(lineAlong(() => false, 3)).toBe(Math.PI / 2);
    expect(lineAlong(() => true, 2)).toBe(0);
  });

  it('walls, doors and windows move to the floor edge; a gate only in a wall line, never in a fence', () => {
    for (const p of ['wall', 'door', 'window']) expect(snapsToEdge(p, at({}))).toBe(true);
    expect(snapsToEdge('gate', at({ '1,0': 'wall', '-1,0': 'wall' }))).toBe(true);
    expect(snapsToEdge('gate', at({ '1,0': 'fence', '-1,0': 'fence' }))).toBe(false);
    expect(snapsToEdge('gate', at({ '0,-1': 'fence' }))).toBe(false);
    expect(snapsToEdge('fence', at({}))).toBe(false);
    expect(snapsToEdge('pillar', at({}))).toBe(false);
  });
});
