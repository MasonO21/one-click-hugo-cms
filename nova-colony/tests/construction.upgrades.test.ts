import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { deserializeState, serializeState } from '../src/core/state';
import { createMockServices } from '../src/platform/mock';
import { rotateLayout } from '../src/sim/build/geometry';
import { C, count, isolate, last, makeGame, step, wallRing } from './construction.helpers';

describe('construction: facility levels', () => {
  it('levels up with cost × levelCostMult^level until maxLevel', () => {
    const { game, b, events } = makeGame({ resources: { wood: 1000 } });
    const crate = b.place('storage_crate', C + 3, C, 0, { instant: true })!;
    const costs: (number | undefined)[] = [];
    while (b.levelUpCost(crate)) {
      costs.push(b.levelUpCost(crate)!.wood);
      expect(b.levelUp(crate)).toBe(true);
    }
    expect(costs).toEqual([27, 49, 88, 158]);
    expect(b.get(crate)!.level).toBe(5);
    expect(b.levelUp(crate)).toBe(false);
    expect(game.state.resources.amounts.wood).toBe(1000 - 15 - 27 - 49 - 88 - 158);
    expect(count(events, 'building:upgraded')).toBe(4);
    expect(last(events, 'building:upgraded')).toEqual({ id: crate, def: 'storage_crate', level: 5, tier: 0 });
    expect(events.find((e) => e.type === 'ui:float' && e.payload.text.startsWith('Level 2'))!.payload.text).toBe('Level 2 · Storage +100%');
    expect(events.some((e) => e.type === 'sfx' && e.payload.id === 'upgrade')).toBe(true);
  });

  it('describes the level effect and refuses while under construction or unaffordable', () => {
    const { game, b, events } = makeGame({ resources: { wood: 100, fiber: 100 } });
    const patch = b.place('berry_patch', C + 3, C, 0)!;
    expect(b.levelUp(patch)).toBe(false);
    expect(b.lastReason).toBe('Finish construction first');
    step(game, 4);
    expect(b.get(patch)!.status).toBe('active');
    expect(b.levelUp(patch)).toBe(true);
    expect(last(events, 'ui:float').text).toBe('Level 2 · Production +50%');
    game.state.resources.amounts = {};
    expect(b.levelUp(patch)).toBe(false);
    expect(b.lastReason).toMatch(/^Need /);
    expect(b.levelUpCost(b.place('wall', C - 4, C, 0, { free: true, tier: 0 })!)).toBeNull();
    expect(b.levelUpCost(b.core()!.id)).toBeNull();
  });
});

describe('construction: material tiers', () => {
  it('upgrades a piece to a new material at the full new-tier cost, rescaling HP', () => {
    const { game, b, events } = makeGame({ resources: { wood: 100, fiber: 100 } });
    const wall = b.place('wall', C + 3, C, 0, { tier: 0, instant: true })!;
    expect(b.tierUpCost(wall, 1)).toBeNull(); // colony still at Wood
    game.state.colony.tier = 1;
    expect(b.tierUpCost(wall, 0)).toBeNull();
    expect(b.tierUpCost(wall, 2)).toBeNull();
    expect(b.tierUpCost(wall, 1)).toEqual({ wood: 6, fiber: 3 });
    b.damage(wall, 80); // 50%
    expect(b.tierUp(wall, 1)).toBe(true);
    const w = b.get(wall)!;
    expect(w.tier).toBe(1);
    expect(w.maxHp).toBe(288); // 160 × 1.8
    expect(w.hp).toBeCloseTo(144, 5);
    expect(last(events, 'building:upgraded')).toEqual({ id: wall, def: 'wall', level: 1, tier: 1 });
    expect(game.state.resources.amounts).toMatchObject({ wood: 100 - 4 - 6, fiber: 97 });
  });

  it('mass-upgrades only pieces below the target, paying once', () => {
    const { game, b, events } = makeGame({ resources: { wood: 200, fiber: 200, stone: 50 } });
    game.state.colony.tier = 1;
    const walls = b.placeLine('wall', C - 5, C + 5, C + 4, C + 5, 0);
    expect(walls).toHaveLength(10);
    const done = b.place('wall', C - 5, C + 6, 0, { tier: 1 })!;
    const fire = b.place('campfire', C - 5, C - 5, 0)!;
    const ids = [...walls, done, fire, 9999];
    expect(b.massTierUpCost(ids, 1)).toEqual({ wood: 60, fiber: 30 });

    game.state.resources.amounts = { wood: 60, fiber: 30 };
    events.length = 0;
    expect(b.massTierUp(ids, 1)).toBe(10);
    expect(walls.every((id) => b.get(id)!.tier === 1)).toBe(true);
    expect(game.state.resources.amounts).toEqual({ wood: 0, fiber: 0 });
    expect(count(events, 'resource:spent')).toBe(1);
    expect(count(events, 'building:upgraded')).toBe(10);
    expect(count(events, 'building:changed')).toBe(1);
    expect(last(events, 'ui:float').text).toBe('10 pieces → Reinforced Wood!');
    expect(b.massTierUp(ids, 1)).toBe(0); // nothing left to do
  });

  it('upgrades as many as affordable, cheapest first, when the total is too much', () => {
    const { game, b } = makeGame({ resources: { wood: 200 } });
    game.state.colony.tier = 1;
    const walls = b.placeLine('wall', C + 3, C + 3, C + 4, C + 3, 0);
    const floors = b.placeLine('floor', C + 3, C + 5, C + 4, C + 5, 0);
    // reinforced: wall {wood 6, fiber 3}, floor {wood 3, fiber 2}
    game.state.resources.amounts = { wood: 9, fiber: 5 };
    expect(b.massTierUp([...walls, ...floors], 1)).toBe(2);
    expect(floors.every((id) => b.get(id)!.tier === 1)).toBe(true);
    expect(walls.every((id) => b.get(id)!.tier === 0)).toBe(true);
    expect(game.state.resources.amounts).toEqual({ wood: 3, fiber: 1 });
    expect(b.lastReason).toMatch(/Upgraded 2 of 4/);

    game.state.resources.amounts = {};
    expect(b.massTierUp(walls, 1)).toBe(0);
    expect(b.lastReason).toBe('Need 6 more Wood, 3 more Fiber');
  });

  it('upgrades an entire room via roomPieces', () => {
    const { game, b } = makeGame({ resources: {} });
    game.state.colony.tier = 1;
    const ring = wallRing(game, C + 3, C + 3, 4, { x: C + 3, z: C + 4 });
    const pieces = b.roomPieces(C + 4, C + 4);
    expect(new Set(pieces)).toEqual(new Set(ring));
    game.state.resources.amounts = { ...b.massTierUpCost(pieces, 1) } as Record<string, number>;
    expect(b.massTierUp(pieces, 1)).toBe(12);
  });

  it('refreshes facility tiers and HP for free on colony tier-up; pieces keep their material', () => {
    const { game, b } = makeGame({ resources: { wood: 100, stone: 100 } });
    const fire = b.place('campfire', C + 3, C, 0, { instant: true })!;
    const wall = b.place('wall', C - 4, C, 0, { tier: 0, instant: true })!;
    b.damage(fire, 50);
    const wood = game.state.resources.amounts.wood;
    game.state.colony.tier = 2;
    game.bus.emit('colony:tierUp', { tier: 2 });
    expect(b.get(fire)).toMatchObject({ tier: 2, maxHp: 200, hp: 100 });
    expect(b.core()!.tier).toBe(2);
    expect(b.core()!.maxHp).toBe(3000);
    expect(b.core()!.hp).toBe(3000);
    expect(b.get(wall)).toMatchObject({ tier: 0, maxHp: 160 });
    expect(game.state.resources.amounts.wood).toBe(wood);
  });

  it('rescales max HP when a structureHp modifier changes', () => {
    const { game, b } = makeGame();
    const wall = b.place('wall', C + 3, C, 0, { tier: 0, free: true, instant: true })!;
    game.sys.economy.modifier = (s) => (s === 'structureHp' ? 1.5 : 1);
    game.bus.emit('research:completed', { id: 'anything' });
    expect(b.get(wall)).toMatchObject({ maxHp: 240, hp: 240 });
  });
});

describe('construction: blueprints', () => {
  function buildSample() {
    const ctx = makeGame({ resources: { wood: 500, stone: 100, fiber: 100 } });
    const { b } = ctx;
    const walls = b.placeLine('wall', C + 3, C + 3, C + 5, C + 3, 0);
    const fire = b.place('campfire', C + 3, C + 4, 0)!;
    const patch = b.place('berry_patch', C + 4, C + 4, 0)!;
    return { ...ctx, ids: [...walls, fire, patch, ctx.b.core()!.id] };
  }

  it('saves parts relative to the min corner (excluding the core) and persists them', () => {
    const { game, b, ids, events } = buildSample();
    const bp = b.saveBlueprint('Starter hut', ids)!;
    expect(bp).toBeTruthy();
    expect(last(events, 'blueprint:saved')).toEqual({ id: bp });
    const saved = b.blueprint(bp)!;
    expect(saved.name).toBe('Starter hut');
    expect(saved.parts).toEqual([
      { def: 'wall', dx: 0, dz: 0, rot: 0, tier: 0 },
      { def: 'wall', dx: 1, dz: 0, rot: 0, tier: 0 },
      { def: 'wall', dx: 2, dz: 0, rot: 0, tier: 0 },
      { def: 'campfire', dx: 0, dz: 1, rot: 0, tier: 0 },
      { def: 'berry_patch', dx: 1, dz: 1, rot: 0, tier: 0 },
    ]);
    expect(b.blueprintCost(bp)).toEqual({ wood: 37, stone: 5, fiber: 10 });
    expect(b.saveBlueprint('nothing', [b.core()!.id])).toBeNull();

    // survives a save/load round trip
    const g2 = new Game({ state: deserializeState(serializeState(game.state)), services: createMockServices(), clock: () => 1 });
    isolate(g2);
    g2.start();
    expect(g2.sys.buildings.blueprint(bp)).toEqual(saved);
  });

  it('places a blueprint, paying the total once', () => {
    const { game, b, ids, events } = buildSample();
    const bp = b.saveBlueprint('hut', ids)!;
    game.state.resources.amounts = { wood: 40, stone: 5, fiber: 10 };
    events.length = 0;
    const placed = b.placeBlueprint(bp, C - 6, C - 6, 0);
    expect(placed).toHaveLength(5);
    expect(placed.map((id) => [b.get(id)!.def, b.get(id)!.x - (C - 6), b.get(id)!.z - (C - 6)])).toEqual([
      ['wall', 0, 0], ['wall', 1, 0], ['wall', 2, 0], ['campfire', 0, 1], ['berry_patch', 1, 1],
    ]);
    expect(game.state.resources.amounts).toEqual({ wood: 3, stone: 0, fiber: 0 });
    expect(count(events, 'resource:spent')).toBe(1);
    expect(count(events, 'building:placed')).toBe(5);
    expect(count(events, 'building:changed')).toBe(1);
    // each part refunds its own share
    expect(b.refund(placed[3])).toEqual({ wood: 10, stone: 5 });
  });

  it('rotates the layout with the parts', () => {
    const { game, b, ids } = buildSample();
    const bp = b.saveBlueprint('hut', ids)!;
    game.state.resources.amounts = { wood: 500, stone: 100, fiber: 100 };
    const placed = b.placeBlueprint(bp, C - 8, C - 6, 1);
    expect(placed).toHaveLength(5);
    const rel = placed.map((id) => {
      const x = b.get(id)!;
      return [x.def, x.x - (C - 8), x.z - (C - 6), x.rot];
    });
    // (x, z) → (z, W − x − w) for a 3×3 layout
    expect(rel).toEqual([
      ['wall', 0, 2, 1], ['wall', 0, 1, 1], ['wall', 0, 0, 1], ['campfire', 1, 2, 1], ['berry_patch', 1, 0, 1],
    ]);
    const sizeOf = (d: string) => game.data.building(d)!.size;
    expect(rotateLayout(b.blueprint(bp)!.parts, sizeOf, 4)).toEqual(b.blueprintLayout(bp, 0));
    expect(b.blueprintLayout(bp, 1)).toMatchObject({ w: 3, h: 3 });
  });

  it('is all-or-nothing', () => {
    const { game, b, ids } = buildSample();
    const bp = b.saveBlueprint('hut', ids)!;
    const before = game.state.buildings.list.length;
    game.state.resources.amounts = { wood: 500, stone: 100, fiber: 100 };
    // overlaps the core
    expect(b.canPlaceBlueprint(bp, C - 1, C - 2, 0)).toMatchObject({ ok: false, code: 'occupied' });
    expect(b.placeBlueprint(bp, C - 1, C - 2, 0)).toEqual([]);
    // can't afford
    game.state.resources.amounts = { wood: 36, stone: 5, fiber: 10 };
    expect(b.placeBlueprint(bp, C - 6, C - 6, 0)).toEqual([]);
    expect(b.lastReason).toBe('Need 1 more Wood');
    expect(game.state.buildings.list.length).toBe(before);
    expect(game.state.resources.amounts).toEqual({ wood: 36, stone: 5, fiber: 10 });
    expect(b.deleteBlueprint(bp)).toBe(true);
    expect(b.placeBlueprint(bp, C - 6, C - 6, 0)).toEqual([]);
  });
});
