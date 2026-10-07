import { describe, expect, it, vi } from 'vitest';
import { Game } from '../src/core/Game';
import { deserializeState, serializeState } from '../src/core/state';
import { createDataRegistry, defaultData } from '../src/data';
import { createMockServices } from '../src/platform/mock';
import { lineCells } from '../src/sim/build/geometry';
import { ALL_TEST_DEFS, C, ENGINEER_BAY, LAB_LOCKED, addColonist, count, isolate, last, makeGame, step, wallRing } from './construction.helpers';

describe('construction: core', () => {
  it('places the command center centered on the origin on a fresh game', () => {
    const { game, b } = makeGame();
    const core = b.core()!;
    expect(core).toBeTruthy();
    expect(core.def).toBe('command_center');
    expect([core.x, core.z]).toEqual([C - 1, C - 1]);
    expect(core.status).toBe('active');
    expect(core.progress).toBe(1);
    expect(game.state.colony.coreId).toBe(core.id);
    expect(game.state.colony.radius).toBe(game.data.tiers[0].colonyRadius);
    expect(game.state.stats.built).toBe(0);
    for (const [x, z] of [[C - 1, C - 1], [C, C], [C + 1, C + 1]]) expect(b.at(x, z)?.id).toBe(core.id);
    expect(b.at(C + 2, C)).toBeUndefined();
    expect(b.blocked(C, C, 'player')).toBe(true);
    // the core cell C contains the origin; its 3×3 footprint center is the center of cell C
    expect(b.center(core)).toEqual({ x: 1, z: 1 });
    expect(b.colonyCenter()).toEqual({ x: 1, z: 1 });
    expect(b.countOf('command_center')).toBe(1);
  });

  it('never removes or moves the core', () => {
    const { b } = makeGame();
    const core = b.core()!;
    expect(b.remove(core.id)).toBe(false);
    expect(b.lastReason).toMatch(/can't be removed/);
    expect(b.move(core.id, C + 4, C + 4, 0)).toBe(false);
    expect(b.canPlace('command_center', C + 4, C + 4, 0).code).toBe('limit');
    expect(b.core()).toBe(core);
  });

  it('rebuilds grid, rooms and indexes from a save and keeps building', () => {
    const { game, b } = makeGame({ resources: { wood: 100, stone: 50 } });
    wallRing(game, C + 3, C + 3, 6, { x: C + 3, z: C + 5 });
    const fire = b.place('campfire', C + 5, C + 5, 0)!;
    step(game, 1);
    const json = serializeState(game.state);

    let now = 1_700_000_100_000;
    const g2 = new Game({ state: deserializeState(json), services: createMockServices(), clock: () => now++ });
    isolate(g2);
    g2.start();
    const b2 = g2.sys.buildings;
    expect(b2.core()?.def).toBe('command_center');
    expect(b2.at(C + 5, C + 5)?.id).toBe(fire);
    expect(b2.blocked(C + 3, C + 4, 'player')).toBe(true);
    expect(b2.blocked(C + 3, C + 5, 'alien')).toBe(true); // door
    expect(g2.derived.rooms).toHaveLength(1);
    expect(g2.derived.rooms[0].cells).toHaveLength(16);
    expect(b2.get(fire)?.spent).toEqual({ wood: 15, stone: 15 });
    // construction resumes after load
    expect(b2.get(fire)!.status).toBe('building');
    step(g2, 2.5);
    expect(b2.get(fire)!.status).toBe('active');
    // new ids never collide with loaded ones
    g2.state.resources.amounts.wood = 50;
    const w = b2.place('wall', C - 5, C - 5, 0, { tier: 0 })!;
    expect(w).toBeGreaterThan(fire);
  });
});

describe('construction: placement rules', () => {
  it('explains missing resources', () => {
    const { b } = makeGame();
    expect(b.canPlace('campfire', C + 3, C, 0)).toEqual({ ok: false, code: 'cost', reason: 'Need 15 more Wood, 15 more Stone' });
    expect(b.place('campfire', C + 3, C, 0)).toBeNull();
    expect(b.lastReason).toBe('Need 15 more Wood, 15 more Stone');
  });

  it('requires the footprint to be inside the colony radius', () => {
    const { b } = makeGame({ resources: { wood: 500 } });
    expect(b.inColony(C + 12, C)).toBe(true);
    expect(b.inColony(C + 13, C)).toBe(false);
    expect(b.inColony(C - 8, C + 8)).toBe(true);
    expect(b.inColony(C + 9, C - 9)).toBe(false);
    const out = b.canPlace('wall', C + 13, C, 0, undefined, 0);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('Outside colony — upgrade your colony tier to expand');
    // a 2×2 shelter whose far column pokes outside
    expect(b.canPlace('shelter', C + 10, C, 0).ok).toBe(true);
    expect(b.canPlace('shelter', C + 11, C, 0).code).toBe('colony'); // (C+12, C+1) is 12.04 cells out
  });

  it('rejects water / unwalkable terrain per cell center', () => {
    const { game, b } = makeGame({ resources: { wood: 500 } });
    game.sys.world.walkable = (x: number) => x < 10; // cell C+5 has center x = 11
    expect(b.canPlace('wall', C + 4, C, 0, undefined, 0).ok).toBe(true);
    expect(b.canPlace('wall', C + 5, C, 0, undefined, 0)).toMatchObject({ ok: false, code: 'terrain', reason: "Can't build on water" });
    expect(b.canPlace('shelter', C + 4, C - 6, 0)).toMatchObject({ ok: false, code: 'terrain' });
  });

  it('rejects overlaps on the same layer and allows facilities on floors', () => {
    const { b } = makeGame({ resources: { wood: 500, stone: 500, fiber: 500 } });
    expect(b.canPlace('wall', C, C, 0, undefined, 0)).toMatchObject({ ok: false, code: 'occupied', reason: 'Space taken by Command Center' });
    const floor = b.place('floor', C + 3, C, 0, { tier: 0 })!;
    expect(floor).not.toBeNull();
    expect(b.canPlace('floor', C + 3, C, 0, undefined, 0).reason).toBe('Space taken by Floor');
    const fire = b.place('campfire', C + 3, C, 0)!;
    expect(fire).not.toBeNull();
    expect(b.at(C + 3, C)?.id).toBe(fire); // object layer first
    expect(b.floorAt(C + 3, C)?.id).toBe(floor);
    expect(b.objectAt(C + 3, C)?.id).toBe(fire);
    expect(b.canPlace('wall', C + 3, C, 0, undefined, 0).reason).toBe('Space taken by Campfire');
    // a floor may be slid under an existing facility, too
    const crate = b.place('storage_crate', C + 4, C, 0)!;
    expect(b.place('floor', C + 4, C, 0, { tier: 0 })).not.toBeNull();
    expect(b.at(C + 4, C)?.id).toBe(crate);
  });

  it('enforces unlock tier, research, piece material tier and maxCount', () => {
    const { game, b } = makeGame({ extraBuildings: ALL_TEST_DEFS, resources: { wood: 500, stone: 500, fiber: 500 } });
    expect(b.canPlace('gate', C + 3, C, 0, undefined, 0)).toMatchObject({ ok: false, code: 'locked', reason: 'Unlocks at Reinforced Wood tier' });
    expect(b.canPlace(LAB_LOCKED.id, C + 3, C, 0)).toMatchObject({ ok: false, code: 'locked', reason: 'Research Masonry to unlock' });
    expect(b.canPlace('wall', C + 3, C, 0, undefined, 1)).toMatchObject({ ok: false, code: 'tier' });
    game.state.colony.tier = 1;
    expect(b.canPlace('gate', C + 3, C, 0, undefined, 0).ok).toBe(true);
    expect(b.canPlace('wall', C + 3, C, 0, undefined, 1).ok).toBe(true);
    game.state.research.completed.push('tier_stone');
    expect(b.canPlace(LAB_LOCKED.id, C + 3, C, 0).ok).toBe(true);

    expect(b.place('workbench', C + 3, C + 3, 0)).not.toBeNull();
    expect(b.canPlace('workbench', C - 5, C - 5, 0)).toMatchObject({ ok: false, code: 'limit', reason: 'You already have a Crafting Table' });
    expect(b.canPlace('nope', C + 3, C, 0)).toMatchObject({ ok: false, code: 'unknown' });
  });

  it('harvests resource nodes under the new footprint (inclusive cell rect)', () => {
    const { game, b } = makeGame({ resources: { wood: 100 } });
    const spy = vi.fn(() => ({}));
    game.sys.world.clearNodesInRect = spy;
    b.place('shelter', C + 3, C + 4, 0);
    expect(spy).toHaveBeenCalledWith(C + 3, C + 4, C + 4, C + 5);
  });

  it('computes costs from the material tier (pieces) or def cost (facilities)', () => {
    const { game, b } = makeGame();
    expect(b.cost('wall', 0)).toEqual({ wood: 4 });
    expect(b.cost('floor', 0)).toEqual({ wood: 2 });
    expect(b.cost('door', 0)).toEqual({ wood: 5 }); // 4 × 1.2 rounded up
    expect(b.cost('window', 0)).toEqual({ wood: 5, fiber: 2 });
    expect(b.cost('wall', 1)).toEqual({ wood: 6, fiber: 3 });
    expect(b.cost('wall', 2)).toEqual({ stone: 8, wood: 2 });
    expect(b.cost('campfire')).toEqual({ wood: 15, stone: 15 });
    // without an explicit tier, pieces follow the build preview's material (clamped to the colony tier)
    game.view.build.tier = 2;
    expect(b.cost('wall')).toEqual({ wood: 4 });
    game.state.colony.tier = 2;
    expect(b.cost('wall')).toEqual({ stone: 8, wood: 2 });
  });
});

describe('construction: placing and building', () => {
  it('pays, creates a construction site and completes it over buildTime', () => {
    const { game, b, events } = makeGame({ resources: { wood: 20 } });
    const id = b.place('wall', C + 3, C, 0, { tier: 0 })!;
    const w = b.get(id)!;
    expect(game.state.resources.amounts.wood).toBe(16);
    expect(w).toMatchObject({ def: 'wall', x: C + 3, z: C, rot: 0, level: 1, tier: 0, status: 'building', progress: 0, hp: 160, maxHp: 160 });
    expect(count(events, 'building:placed')).toBe(1);
    expect(count(events, 'building:changed')).toBeGreaterThanOrEqual(1);
    expect(last(events, 'sfx')).toMatchObject({ id: 'place' });
    expect(last(events, 'resource:spent')).toEqual({ bag: { wood: 4 }, reason: 'build' });

    step(game, 0.5);
    expect(w.progress).toBeCloseTo(0.5, 5);
    expect(count(events, 'building:completed')).toBe(0);
    step(game, 0.6);
    expect(w.status).toBe('active');
    expect(w.progress).toBe(1);
    expect(last(events, 'building:completed')).toEqual({ id, def: 'wall' });
    expect(last(events, 'ui:float').text).toBe('Built Wall!');
    expect(events.some((e) => e.type === 'sfx' && e.payload.id === 'build_complete')).toBe(true);
    expect(game.state.stats.built).toBe(1);
  });

  it('builds facilities at the colony tier with tier-scaled HP and announces them', () => {
    const { game, b, events } = makeGame({ resources: { wood: 50, stone: 50 } });
    game.state.colony.tier = 2;
    const id = b.place('campfire', C + 3, C, 0, { tier: 0 })!;
    expect(b.get(id)).toMatchObject({ tier: 2, maxHp: 200, hp: 200, status: 'building' });
    step(game, 3);
    expect(b.get(id)!.status).toBe('active');
    expect(last(events, 'ui:float')).toMatchObject({ text: 'Built Campfire!', big: true });
  });

  it('supports instant placement and free placement', () => {
    const { game, b, events } = makeGame();
    const id = b.place('campfire', C + 3, C, 0, { free: true, instant: true })!;
    expect(id).not.toBeNull();
    expect(b.get(id)!.status).toBe('active');
    expect(count(events, 'building:completed')).toBe(1);
    expect(game.state.resources.amounts.wood ?? 0).toBe(0);
    expect(b.refund(id)).toEqual({});
  });

  it('applies buildSpeed and +25% per working engineer', () => {
    const { game, b } = makeGame({ extraBuildings: [ENGINEER_BAY], resources: { wood: 100, stone: 100 } });
    const fire = b.place('campfire', C + 3, C, 0)!; // buildTime 3
    game.sys.economy.modifier = (s) => (s === 'buildSpeed' ? 2 : 1);
    step(game, 1);
    expect(b.get(fire)!.progress).toBeCloseTo(2 / 3, 5);

    const { game: g2, b: b2 } = makeGame({ extraBuildings: [ENGINEER_BAY], resources: { wood: 100, stone: 100 } });
    const bay = b2.place(ENGINEER_BAY.id, C - 4, C, 0, { instant: true })!;
    addColonist(g2, bay);
    addColonist(g2, bay);
    addColonist(g2, null); // idle — doesn't help
    const f2 = b2.place('campfire', C + 3, C, 0)!;
    step(g2, 1);
    expect(b2.get(f2)!.progress).toBeCloseTo(1.5 / 3, 5);
    step(g2, 1);
    expect(b2.get(f2)!.status).toBe('active');
  });

  it('recomputes the economy when a building completes', () => {
    const { game, b } = makeGame({ resources: { wood: 100 } });
    const spy = vi.spyOn(game.sys.economy, 'recompute');
    b.place('storage_crate', C + 3, C, 0);
    expect(spy).not.toHaveBeenCalled(); // still under construction
    step(game, 3);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('construction: drag-to-build', () => {
  it('computes straight and L-shaped lines', () => {
    expect(lineCells(0, 0, 5, 0)).toHaveLength(6);
    expect(lineCells(0, 0, -3, 0)).toEqual([{ x: 0, z: 0 }, { x: -1, z: 0 }, { x: -2, z: 0 }, { x: -3, z: 0 }]);
    expect(lineCells(0, 0, 0, 3).map((c) => c.z)).toEqual([0, 1, 2, 3]);
    // thumb jitter of one cell snaps to a straight line along the dominant axis
    expect(lineCells(0, 0, 6, 1).every((c) => c.z === 0)).toBe(true);
    expect(lineCells(0, 0, 8, 2).every((c) => c.z === 0)).toBe(true);
    // diagonal drag -> L: dominant axis first, then the other, corner once
    expect(lineCells(0, 0, 4, 3)).toEqual([
      { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }, { x: 3, z: 0 }, { x: 4, z: 0 },
      { x: 4, z: 1 }, { x: 4, z: 2 }, { x: 4, z: 3 },
    ]);
    expect(lineCells(0, 0, -2, -5)).toEqual([
      { x: 0, z: 0 }, { x: 0, z: -1 }, { x: 0, z: -2 }, { x: 0, z: -3 }, { x: 0, z: -4 }, { x: 0, z: -5 },
      { x: -1, z: -5 }, { x: -2, z: -5 },
    ]);
    expect(lineCells(3, 3, 3, 3)).toEqual([{ x: 3, z: 3 }]);
  });

  it('places every valid cell, skipping occupied ones, as one batch', () => {
    const { game, b, events } = makeGame({ resources: { wood: 100 } });
    const ids = b.placeLine('wall', C - 3, C, C + 3, C, 0);
    expect(ids).toHaveLength(4); // C-1..C+1 is the core
    expect(ids.map((id) => b.get(id)!.x)).toEqual([C - 3, C - 2, C + 2, C + 3]);
    expect(ids.every((id) => b.get(id)!.rot === 0)).toBe(true);
    expect(game.state.resources.amounts.wood).toBe(100 - 16);
    expect(count(events, 'building:placed')).toBe(4);
    expect(count(events, 'building:changed')).toBe(1);
    expect(events.filter((e) => e.type === 'sfx' && e.payload.id === 'place')).toHaveLength(1);
    expect(b.lastReason).toBe('Space taken by Command Center');

    // all four finish together -> a single grouped float
    events.length = 0;
    step(game, 1.1);
    expect(count(events, 'building:completed')).toBe(4);
    expect(events.filter((e) => e.type === 'ui:float').map((e) => e.payload.text)).toEqual(['Built 4 Walls!']);
    expect(game.state.stats.built).toBe(4);
  });

  it('pays per piece and stops when resources run out', () => {
    const { game, b, events } = makeGame({ resources: { wood: 22 } });
    const preview = b.previewLine('wall', C - 4, C + 4, C + 5, C + 4, 0);
    expect(preview.count).toBe(5);
    expect(preview.cells.map((c) => c.ok)).toEqual([true, true, true, true, true, false, false, false, false, false]);
    expect(preview.cost).toEqual({ wood: 20 });
    expect(preview.reason).toBe('Need 2 more Wood');

    const ids = b.placeLine('wall', C - 4, C + 4, C + 5, C + 4, 0);
    expect(ids).toHaveLength(5);
    expect(game.state.resources.amounts.wood).toBe(2);
    expect(count(events, 'resource:spent')).toBe(5);
    expect(b.lastReason).toBe('Need 2 more Wood');
  });
});

describe('construction: move & rotate', () => {
  it('moves for free and keeps progress, level and workers', () => {
    const { game, b, events } = makeGame({ resources: { wood: 100 } });
    const id = b.place('shelter', C + 3, C + 3, 0)!; // buildTime 4
    step(game, 1);
    const s = b.get(id)!;
    s.workers.push(42);
    const wood = game.state.resources.amounts.wood;
    expect(b.move(id, C - 6, C - 6, 0)).toBe(true);
    expect([s.x, s.z]).toEqual([C - 6, C - 6]);
    expect(s.progress).toBeCloseTo(0.25, 5);
    expect(s.status).toBe('building');
    expect(s.workers).toEqual([42]);
    expect(game.state.resources.amounts.wood).toBe(wood);
    expect(b.at(C + 3, C + 3)).toBeUndefined();
    expect(b.at(C - 5, C - 5)?.id).toBe(id);
    expect(last(events, 'building:moved')).toEqual({ id, def: 'shelter' });
    // the building's own cells don't block a small shift
    expect(b.move(id, C - 5, C - 6, 0)).toBe(true);
  });

  it('rejects invalid moves and leaves the building in place', () => {
    const { b } = makeGame({ resources: { wood: 100 } });
    const id = b.place('shelter', C + 3, C + 3, 0)!;
    expect(b.move(id, C, C, 0)).toBe(false);
    expect(b.lastReason).toBe('Space taken by Command Center');
    expect(b.move(id, C + 20, C, 0)).toBe(false);
    expect(b.get(id)).toMatchObject({ x: C + 3, z: C + 3 });
    expect(b.at(C + 4, C + 4)?.id).toBe(id);
  });

  it('rotates non-square footprints in place and back after four turns', () => {
    const { b } = makeGame({ resources: { wood: 100, stone: 100 } });
    const id = b.place('workbench', C + 3, C + 3, 0)!; // 2×1
    expect(b.at(C + 4, C + 3)?.id).toBe(id);
    expect(b.rotate(id)).toBe(true);
    const w = b.get(id)!;
    expect(w.rot).toBe(1);
    expect(b.at(C + 3, C + 3)?.id).toBe(id);
    expect(b.at(C + 3, C + 4)?.id).toBe(id);
    expect(b.at(C + 4, C + 3)).toBeUndefined();
    b.rotate(id);
    b.rotate(id);
    b.rotate(id);
    expect([w.x, w.z, w.rot]).toEqual([C + 3, C + 3, 0]);
  });

  it('refuses a rotation that would collide', () => {
    const { b } = makeGame({ resources: { wood: 100, stone: 100 } });
    const id = b.place('workbench', C + 3, C + 3, 0)!;
    b.place('wall', C + 3, C + 4, 0, { tier: 0 });
    expect(b.rotate(id)).toBe(false);
    expect(b.get(id)!.rot).toBe(0);
  });
});

describe('construction: remove & refunds', () => {
  it('refunds the full invested cost including level-ups and material upgrades', () => {
    const { game, b, events } = makeGame({ resources: { wood: 100, fiber: 20 } });
    const crate = b.place('storage_crate', C + 3, C, 0, { instant: true })!;
    expect(b.levelUp(crate)).toBe(true); // 15 × 1.8 = 27
    expect(game.state.resources.amounts.wood).toBe(100 - 15 - 27);
    expect(b.refund(crate)).toEqual({ wood: 42 });
    expect(b.remove(crate)).toBe(true);
    expect(game.state.resources.amounts.wood).toBe(100);
    expect(b.get(crate)).toBeUndefined();
    expect(b.at(C + 3, C)).toBeUndefined();
    expect(b.countOf('storage_crate')).toBe(0);
    expect(last(events, 'building:removed')).toEqual({ id: crate, def: 'storage_crate' });
    expect(events.some((e) => e.type === 'sfx' && e.payload.id === 'remove')).toBe(true);
    expect(last(events, 'resource:gained')).toMatchObject({ id: 'wood', amount: 42, source: 'refund' });

    game.state.colony.tier = 1;
    const wall = b.place('wall', C + 3, C, 0, { tier: 0, instant: true })!;
    expect(b.tierUp(wall, 1)).toBe(true);
    expect(b.refund(wall)).toEqual({ wood: 10, fiber: 3 });
    b.remove(wall);
    expect(game.state.resources.amounts).toMatchObject({ wood: 100, fiber: 20 });
  });

  it('applies removeRefund and refunds construction sites', () => {
    const { game, b } = makeGame({ balance: { removeRefund: 0.5 }, resources: { wood: 100 } });
    const s = b.place('shelter', C + 3, C, 0)!; // 40 wood, still building
    expect(b.remove(s)).toBe(true);
    expect(game.state.resources.amounts.wood).toBe(80);
  });

  it('unassigns colonists who worked or slept there', () => {
    const { game, b, events } = makeGame({ resources: { wood: 100, stone: 100 } });
    const camp = b.place('logging_camp', C + 3, C, 0, { instant: true })!;
    const bed = b.place('shelter', C - 5, C, 0, { instant: true })!;
    const c1 = addColonist(game, camp, bed);
    const c2 = addColonist(game, null, bed);
    b.remove(camp);
    expect(c1.workplace).toBeNull();
    expect(c1.bed).toBe(bed);
    expect(last(events, 'colonist:assigned')).toEqual({ id: c1.id, workplace: null });
    b.remove(bed);
    expect(c1.bed).toBeNull();
    expect(c2.bed).toBeNull();
  });
});

describe('construction: toggles, recipes and movement blocking', () => {
  it('toggles facilities on and off', () => {
    const { game, b } = makeGame({ resources: { wood: 100, stone: 100 } });
    const fire = b.place('campfire', C + 3, C, 0, { instant: true })!;
    const spy = vi.spyOn(game.sys.economy, 'recompute');
    b.toggle(fire);
    expect(b.get(fire)!.status).toBe('off');
    expect(spy).toHaveBeenCalledTimes(1);
    b.toggle(fire);
    expect(b.get(fire)!.status).toBe('active');
    const wall = b.place('wall', C - 4, C, 0, { tier: 0, instant: true })!;
    b.toggle(wall);
    expect(b.get(wall)!.status).toBe('active');
  });

  it('only accepts recipes for the factory station', () => {
    const base = defaultData();
    const data = createDataRegistry({ ...base, buildings: [...base.buildings, ...ALL_TEST_DEFS] });
    const g = new Game({ seed: 3, data, services: createMockServices(), clock: () => 1 });
    g.start();
    isolate(g);
    const b = g.sys.buildings;
    const f = b.place('test_auto_bench', C + 3, C + 3, 0, { free: true, instant: true })!;
    b.setRecipe(f, 'r_stone_axe');
    expect(b.get(f)!.recipe).toBe('r_stone_axe');
    b.get(f)!.craft = 2;
    b.setRecipe(f, 'r_roast_berries'); // campfire station
    expect(b.get(f)!.recipe).toBe('r_stone_axe');
    expect(b.lastReason).toMatch(/can't make that/);
    b.setRecipe(f, null);
    expect(b.get(f)).toMatchObject({ recipe: null, craft: 0 });
    const fire = b.place('campfire', C - 4, C, 0, { free: true, instant: true })!;
    b.setRecipe(fire, 'r_roast_berries');
    expect(b.get(fire)!.recipe).toBeNull();
  });

  it('answers movement blocking per walker', () => {
    const { game, b } = makeGame({ resources: { wood: 200, stone: 100, fiber: 100 } });
    const wall = b.place('wall', C + 3, C, 0, { tier: 0 })!; // under construction still blocks
    expect(b.get(wall)!.status).toBe('building');
    expect(b.blocked(C + 3, C, 'player')).toBe(true);
    expect(b.blocked(C + 3, C, 'alien')).toBe(true);
    b.place('door', C + 4, C, 0, { tier: 0 });
    expect(b.blocked(C + 4, C, 'colonist')).toBe(false);
    expect(b.blocked(C + 4, C, 'alien')).toBe(true);
    b.place('floor', C + 5, C, 0, { tier: 0 });
    b.place('spike_trap', C + 6, C, 0);
    b.place('berry_patch', C + 7, C, 0);
    for (const x of [C + 5, C + 6, C + 7, C + 8]) {
      expect(b.blocked(x, C, 'player')).toBe(false);
      expect(b.blocked(x, C, 'alien')).toBe(false);
    }
    expect(b.blocked(-1, 5, 'player')).toBe(true);
    // removal clears blocking
    b.remove(wall);
    expect(b.blocked(C + 3, C, 'alien')).toBe(false);
    expect(game.state.buildings.list.length).toBeGreaterThan(1);
  });
});
