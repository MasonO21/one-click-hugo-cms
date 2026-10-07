import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { CENTER_CELL, cellMin } from '../src/core/constants';
import { BuildController } from '../src/ui/build/BuildController';
import type { UiCtx } from '../src/ui/ctx';

/** A game whose BuildingSystem has just enough behaviour to exercise build mode. */
function setup(opts: { wood?: number; ground?: { x: number; z: number } | null } = {}) {
  let now = 1_700_000_000_000;
  const game = new Game({ seed: 11, services: createMockServices(), clock: () => now });
  game.start();
  game.state.resources.amounts = { wood: opts.wood ?? 500, stone: 500, fiber: 100 };
  const bs = game.sys.buildings as any;
  const calls: { place: unknown[][]; placeLine: unknown[][]; move: unknown[][]; placeBlueprint: unknown[][] } = { place: [], placeLine: [], move: [], placeBlueprint: [] };
  bs.canPlace = (id: string, x: number) => (x === 5 ? { ok: false, reason: 'Something is already there' } : { ok: true });
  bs.cost = (id: string, tier = 0) => (id === 'wall' ? { wood: 4 + tier } : { wood: 20 });
  bs.lineCells = (x0: number, z0: number, x1: number, z1: number) => {
    const out = [];
    const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
    for (let i = 0; i <= n; i++) out.push({ x: x0 + Math.sign(x1 - x0) * Math.min(i, Math.abs(x1 - x0)), z: z0 + Math.sign(z1 - z0) * Math.max(0, i - Math.abs(x1 - x0)) });
    return out;
  };
  bs.place = (...a: unknown[]) => {
    calls.place.push(a);
    return 99;
  };
  bs.placeLine = (...a: unknown[]) => {
    calls.placeLine.push(a);
    return [1, 2, 3];
  };
  bs.move = (...a: unknown[]) => {
    calls.move.push(a);
    return true;
  };
  bs.blueprintCost = () => ({ wood: 33 });
  bs.placeBlueprint = (...a: unknown[]) => {
    calls.placeBlueprint.push(a);
    return [1, 2];
  };
  const toasts: string[] = [];
  const sfx: string[] = [];
  const ground = opts.ground === undefined ? { x: cellMin(CENTER_CELL) + 1, z: cellMin(CENTER_CELL) + 1 } : opts.ground;
  const ctx = {
    game,
    data: game.data,
    renderer: { pickGround: () => ground, worldToScreen: () => ({ x: 0, y: 0, visible: true }), pick: () => null, cameraYaw: () => 0, focus() {}, stats: () => ({ fps: 60, drawCalls: 0, triangles: 0 }) },
    root: null as unknown as HTMLElement,
    build: null as never,
    open() {},
    close() {},
    isOpen: () => false,
    toast: (t: string) => toasts.push(t),
    sfx: (id: string) => sfx.push(id),
    haptic() {},
    watchAd: async () => false,
    showReward() {},
    badges: () => ({ missions: 0, research: 0, daily: false, spin: false, crate: false, season: 0, colonists: 0 }),
  } as unknown as UiCtx;
  const bc = new BuildController(ctx);
  return { game, bc, calls, toasts, sfx, bs, ctx };
}

describe('BuildController', () => {
  it('enters build mode with a ghost at the cursor and validates it', () => {
    const { game, bc } = setup();
    bc.start('shelter');
    const b = game.view.build;
    expect(game.view.mode).toBe('build');
    expect(game.view.showGrid).toBe(true);
    expect(b.def).toBe('shelter');
    expect(b.cells).toHaveLength(4); // 2x2 footprint
    expect(b.valid).toBe(true);
    expect(b.cost).toEqual({ wood: 20 });
    expect(bc.active).toBe(true);
    expect(bc.mode).toBe('place');
  });

  it('turns an unaffordable placement red with a friendly reason', () => {
    const { game, bc } = setup({ wood: 5 });
    bc.start('shelter');
    expect(game.view.build.valid).toBe(false);
    expect(game.view.build.reason).toBe('Need 15 more Wood');
    expect(bc.affordable).toBe(false);
  });

  it('reports the placement reason when the spot is blocked', () => {
    const { game, bc } = setup();
    bc.start('storage_crate');
    game.view.build.x = 5;
    bc.refresh();
    expect(game.view.build.valid).toBe(false);
    expect(game.view.build.reason).toBe('Something is already there');
  });

  it('rotating swaps the footprint around the cursor cell', () => {
    const { game, bc } = setup();
    bc.start('workbench'); // 2x1
    const before = game.view.build.cells.map((c) => `${c.x},${c.z}`).join('|');
    expect(game.view.build.cells).toHaveLength(2);
    bc.rotate();
    expect(game.view.build.rot).toBe(1);
    const cells = game.view.build.cells;
    expect(cells).toHaveLength(2);
    expect(cells[0].x).toBe(cells[1].x); // now vertical
    expect(cells.map((c) => `${c.x},${c.z}`).join('|')).not.toBe(before);
  });

  it('drag-to-build lines: preview, cost scales with valid pieces, confirm places the line', () => {
    const { game, bc, calls } = setup();
    bc.start('wall');
    const b = game.view.build;
    bc.pointer.down(100, 100);
    expect(b.lineFrom).not.toBeNull();
    const start = { ...b.lineFrom! };
    // move the cursor 3 cells to the right: ground picker returns a fixed point, so drive the cursor via view
    b.x = start.x + 3;
    b.z = start.z;
    bc.refresh();
    expect(b.cells).toHaveLength(4);
    expect(b.cost).toEqual({ wood: 4 * 4 });
    expect(b.valid).toBe(true);
    bc.pointer.up(100, 100, false);
    expect(b.lineFrom).not.toBeNull(); // preview stays until confirmed
    bc.confirm();
    expect(calls.placeLine).toHaveLength(1);
    expect(calls.placeLine[0]).toEqual(['wall', start.x, start.z, start.x + 3, start.z, b.tier]);
    expect(b.lineFrom).toBeNull();
    expect(game.view.mode).toBe('build'); // stays for quick repeats
  });

  it('blocked cells are skipped but the rest still builds', () => {
    const { game, bc } = setup();
    bc.start('wall');
    const b = game.view.build;
    b.lineFrom = { x: 3, z: 10 };
    b.x = 7; // cells 3..7, x === 5 is blocked
    b.z = 10;
    bc.refresh();
    expect(b.cells).toHaveLength(5);
    expect(bc.lineInfo).toEqual({ total: 5, ok: 4 });
    expect(b.valid).toBe(true);
    expect(b.cost).toEqual({ wood: 16 });
  });

  it('a facility confirm calls place() and returns to play (no red "space taken" ghost left behind)', () => {
    const { game, bc, calls, sfx } = setup();
    bc.start('storage_crate');
    const { x, z } = game.view.build;
    bc.confirm();
    expect(calls.place).toHaveLength(1);
    expect(calls.place[0].slice(0, 4)).toEqual(['storage_crate', x, z, 0]);
    expect(game.view.mode).toBe('play');
    expect(game.view.build.def).toBeNull();
    expect(sfx).not.toContain('ui_error');
  });

  it('confirming an invalid spot does not call the system and nudges with a toast', () => {
    const { game, bc, calls, toasts, sfx } = setup();
    bc.start('storage_crate');
    game.view.build.x = 5;
    bc.refresh();
    bc.confirm();
    expect(calls.place).toHaveLength(0);
    expect(toasts).toContain('Something is already there');
    expect(sfx).toContain('ui_error');
  });

  it('move mode is free and leaves build mode when done', () => {
    const { game, bc, calls } = setup();
    game.state.buildings.list.push({ id: 7, def: 'shelter', x: 130, z: 130, rot: 0, level: 1, tier: 0, hp: 1, maxHp: 1, status: 'active', progress: 1, workers: [], recipe: null, craft: 0, eff: 1 });
    bc.startMove(7);
    const b = game.view.build;
    expect(b.moveId).toBe(7);
    expect(b.cost).toEqual({});
    expect(b.valid).toBe(true);
    bc.confirm();
    expect(calls.move).toHaveLength(1);
    expect(calls.move[0][0]).toBe(7);
    expect(game.view.mode).toBe('play');
    expect(b.def).toBeNull();
  });

  it('places saved blueprints with their total cost', () => {
    const { game, bc, calls } = setup();
    game.state.buildings.blueprints.push({ id: 'bp1', name: 'Room', parts: [{ def: 'wall', dx: 0, dz: 0, rot: 0, tier: 0 }, { def: 'wall', dx: 1, dz: 0, rot: 0, tier: 0 }] });
    bc.startBlueprint('bp1');
    expect(game.view.build.blueprint).toBe('bp1');
    expect(game.view.build.cost).toEqual({ wood: 33 });
    expect(game.view.build.cells).toHaveLength(2);
    bc.confirm();
    expect(calls.placeBlueprint).toHaveLength(1);
    expect(calls.placeBlueprint[0][0]).toBe('bp1');
  });

  it('cancel resets the shared view state', () => {
    const { game, bc } = setup();
    bc.start('shelter');
    bc.cancel();
    const v = game.view;
    expect(v.mode).toBe('play');
    expect(v.showGrid).toBe(false);
    expect(v.build.def).toBeNull();
    expect(v.build.cells).toHaveLength(0);
    expect(bc.active).toBe(false);
  });

  it('piece material is clamped to the colony tier', () => {
    const { game, bc } = setup();
    game.state.colony.tier = 1;
    bc.pieceTier = 5;
    expect(bc.pieceTier).toBe(1);
    bc.setTier(0);
    expect(bc.pieceTier).toBe(0);
    game.state.colony.tier = 3;
    bc.pieceTier = -1; // auto: follow the colony tier
    expect(bc.pieceTier).toBe(3);
  });

  it('falls back to the player position when the ground cannot be picked', () => {
    const { game, bc } = setup({ ground: null });
    game.state.player.x = 6;
    game.state.player.z = -4;
    bc.start('storage_crate');
    expect(game.view.build.cells).toHaveLength(1);
    expect(Number.isFinite(game.view.build.x)).toBe(true);
  });
});
