import { describe, expect, it } from 'vitest';
import { cellIndex } from '../src/core/constants';
import { C, makeGame, wallRing } from './construction.helpers';

/** 6×6 outer ring at (C+3, C+3) → 4×4 interior (C+4..C+7)². */
const X0 = C + 3;
const Z0 = C + 3;
const DOOR = { x: X0, z: Z0 + 2 };

describe('construction: rooms & automatic roofs', () => {
  it('detects a 4×4 walled room with a door and roofs it including the walls', () => {
    const { game, b } = makeGame({ resources: { wood: 100, stone: 50 } });
    const ring = wallRing(game, X0, Z0, 6, DOOR);
    expect(ring).toHaveLength(20);
    const fire = b.place('campfire', X0 + 2, Z0 + 2, 0)!;
    const version = game.derived.buildingsVersion;
    game.update(0.016);

    const rooms = game.derived.rooms;
    expect(rooms).toHaveLength(1);
    const room = rooms[0];
    expect(room.cells).toHaveLength(16);
    for (let x = X0 + 1; x <= X0 + 4; x++) {
      for (let z = Z0 + 1; z <= Z0 + 4; z++) expect(room.cells).toContain(cellIndex(x, z));
    }
    expect(room.buildings).toEqual([fire]);
    // roof = 16 interior + 20 bounding wall cells (corners and the door included)
    const roof = game.derived.roofCells;
    expect(roof.size).toBe(36);
    expect(roof.has(cellIndex(X0, Z0))).toBe(true);
    expect(roof.has(cellIndex(X0 + 5, Z0 + 5))).toBe(true);
    expect(roof.has(cellIndex(DOOR.x, DOOR.z))).toBe(true);
    expect(roof.has(cellIndex(X0 - 1, Z0))).toBe(false);
    expect(game.derived.buildingsVersion).toBeGreaterThan(version);

    expect(b.roomAt(X0 + 2, Z0 + 3)).toBe(room.id);
    expect(b.roomAt(X0, Z0)).toBe(0); // wall
    expect(b.roomAt(X0 - 2, Z0)).toBe(0); // outside
  });

  it('recomputes at most once per frame, and opening the room removes the roof', () => {
    const { game, b } = makeGame();
    const ring = wallRing(game, X0, Z0, 6, DOOR);
    game.update(0.016);
    expect(game.derived.rooms).toHaveLength(1);

    // removing a wall marks rooms dirty; derived data refreshes on the next update (debounced)
    b.remove(ring[3]);
    expect(game.derived.rooms).toHaveLength(1);
    game.update(0.016);
    expect(game.derived.rooms).toHaveLength(0);
    expect(game.derived.roofCells.size).toBe(0);
  });

  it('separates rooms sharing a wall', () => {
    const { game, b } = makeGame();
    game.state.colony.radius = 20;
    wallRing(game, X0, Z0, 6);
    // second 6×6 ring to the +x side, sharing the x = X0+5 wall column
    for (let i = 5; i < 11; i++) {
      for (let j = 0; j < 6; j++) {
        if (i !== 5 && i !== 10 && j !== 0 && j !== 5) continue;
        if (b.at(X0 + i, Z0 + j)) continue;
        expect(b.place('wall', X0 + i, Z0 + j, 0, { free: true, instant: true, tier: 0 })).not.toBeNull();
      }
    }
    wallRing(game, X0 - 7, Z0, 4); // a small separate 2×2 room
    game.update(0.016);
    const sizes = game.derived.rooms.map((r) => r.cells.length).sort((a, b) => a - b);
    expect(sizes).toEqual([4, 16, 16]);
    const left = b.roomAt(X0 + 2, Z0 + 2);
    const right = b.roomAt(X0 + 7, Z0 + 2);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
    expect(left).not.toBe(right);
    // the shared wall is roofed once
    expect(game.derived.roofCells.has(cellIndex(X0 + 5, Z0 + 2))).toBe(true);
  });

  it('treats enclosures larger than 400 cells as unroofed courtyards', () => {
    const { game } = makeGame();
    game.state.colony.radius = 40;
    wallRing(game, C + 2, C + 2, 22); // 20×20 = 400 interior → room
    game.update(0.016);
    expect(game.derived.rooms.map((r) => r.cells.length)).toEqual([400]);

    const { game: g2 } = makeGame();
    g2.state.colony.radius = 40;
    wallRing(g2, C + 2, C + 2, 23); // 21×21 = 441 interior → courtyard
    g2.update(0.016);
    expect(g2.derived.rooms).toHaveLength(0);
    expect(g2.derived.roofCells.size).toBe(0);
  });

  it('roomPieces returns the floors inside plus the walls/doors around them', () => {
    const { game, b } = makeGame({ resources: { wood: 200, stone: 50 } });
    const ring = wallRing(game, X0, Z0, 6, DOOR);
    const floors: number[] = [];
    for (let x = X0 + 1; x <= X0 + 4; x++) {
      for (let z = Z0 + 1; z <= Z0 + 4; z++) floors.push(b.place('floor', x, z, 0, { free: true, instant: true, tier: 0 })!);
    }
    b.place('campfire', X0 + 2, Z0 + 2, 0); // facilities are not "pieces of the room"
    const outside = b.place('wall', X0 - 3, Z0, 0, { free: true, instant: true, tier: 0 })!;

    const pieces = b.roomPieces(X0 + 2, Z0 + 2);
    expect(new Set(pieces)).toEqual(new Set([...ring, ...floors]));
    expect(pieces).not.toContain(outside);
    // tapping a wall of the room selects the same room
    expect(new Set(b.roomPieces(X0, Z0 + 1))).toEqual(new Set(pieces));
    expect(b.roomPieces(X0 - 3, Z0)).toEqual([]);
    expect(b.roomPieces(C - 8, C - 8)).toEqual([]);
  });
});
