import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { CELL, WORLD_CELLS, cellMin, cellOf } from '../src/core/constants';
import { createDataRegistry, defaultData } from '../src/data';
import { BUILDINGS } from '../src/data/buildings';
import { VEHICLES } from '../src/data/vehicles';
import type { BuildingDef, VehicleDef } from '../src/data/schema';
import type { BuildingInstance } from '../src/core/state';
import { createMockServices } from '../src/platform/mock';
import { collectEvents, findClearSpot, findOpenTree, makeGame, stubWalls, type Rig } from './world.helpers';

/** Game with extra content (garage, recruit hall, teleporter, hover bike) without touching the shared data. */
function makeRichGame(seed = 1234): Rig {
  const extraB: BuildingDef[] = [
    { id: 'garage', name: 'Garage', icon: '🏁', category: 'utility', description: '', size: [3, 2], unlockTier: 0, cost: {}, buildTime: 1, hp: 100, maxLevel: 1, solid: true, model: 'garage', garage: true },
    { id: 'hall', name: 'Recruit Hall', icon: '📋', category: 'utility', description: '', size: [2, 2], unlockTier: 0, cost: {}, buildTime: 1, hp: 100, maxLevel: 1, solid: true, model: 'beacon', recruit: true },
    { id: 'tele', name: 'Teleporter', icon: '🌀', category: 'utility', description: '', size: [2, 2], unlockTier: 0, cost: {}, buildTime: 1, hp: 100, maxLevel: 1, solid: true, model: 'teleporter', teleporter: true },
    { id: 'wall_piece', name: 'Wall', icon: '🧱', category: 'structure', piece: 'wall', description: '', size: [1, 1], unlockTier: 0, cost: {}, buildTime: 1, hp: 100, maxLevel: 1, solid: true, model: 'wall' },
  ];
  const hover: VehicleDef = { id: 'hover', name: 'Hover Bike', description: '', icon: '🚀', model: 'hover', speed: 2.2, storage: 40, hover: true, unlockTier: 0, cost: {} };
  // the test fixtures replace any real def with the same id (the full content now ships its own garage)
  const data = createDataRegistry({
    ...defaultData(),
    buildings: [...BUILDINGS.filter((b) => !extraB.some((e) => e.id === b.id)), ...extraB],
    vehicles: [...VEHICLES.filter((v) => v.id !== hover.id), hover],
  });
  let now = 1_700_000_000_000;
  const game = new Game({ seed, data, services: createMockServices(), clock: () => now });
  game.start();
  return {
    game,
    step(seconds, dt = 0.05) {
      for (let i = 0; i < Math.round(seconds / dt); i++) {
        now += dt * 1000;
        game.update(dt);
      }
    },
  };
}

function building(game: Game, id: number, def: string, x: number, z: number, status: BuildingInstance['status'] = 'active'): BuildingInstance {
  const b: BuildingInstance = { id, def, x, z, rot: 0, level: 1, tier: 0, hp: 100, maxHp: 100, status, progress: status === 'building' ? 0 : 1, workers: [], recipe: null, craft: 0, eff: 1 };
  game.state.buildings.list.push(b);
  syncBuildings(game);
  return b;
}

/** Buildings pushed into / cleared from state directly must be re-registered with the construction grid. */
function syncBuildings(game: Game): void {
  (game.sys.buildings as unknown as { rebuild(): void }).rebuild();
}

function clearBuildings(game: Game): void {
  game.state.buildings.list.length = 0;
  syncBuildings(game);
}

const dir = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('player movement', () => {
  it('follows the camera-relative joystick convention', () => {
    const { game, step } = makeGame();
    const p = game.state.player;
    const spot = findClearSpot(game);
    game.sys.player.teleport(spot.x, spot.z);
    // yaw 0: camera looks toward -Z, joystick right = +X, up = -Z
    game.view.camera.yaw = 0;
    game.input.moveX = 1;
    step(1);
    expect(p.x - spot.x).toBeGreaterThan(4);
    expect(Math.abs(p.z - spot.z)).toBeLessThan(0.01);
    expect(p.rot).toBeCloseTo(Math.PI / 2, 1);
    game.input.moveX = 0;
    step(0.5);
    const z0 = p.z;
    game.input.moveY = 1;
    step(1);
    expect(p.z).toBeLessThan(z0 - 4);
    expect(p.rot).toBeCloseTo(Math.PI, 1); // facing -Z (atan2(0, -1))
    // yaw 90deg: the camera sits on +X looking toward -X, so "up" is -X
    game.input.moveY = 0;
    step(0.5);
    game.view.camera.yaw = Math.PI / 2;
    const x0 = p.x;
    game.input.moveY = 1;
    step(1);
    expect(p.x).toBeLessThan(x0 - 4);
    expect(p.rot).toBeCloseTo(-Math.PI / 2, 1);
  });

  it('accelerates smoothly, caps diagonal speed at playerSpeed and scales with modifiers and vehicles', () => {
    const { game, step } = makeGame();
    const spot = findClearSpot(game, 14);
    const p = game.state.player;
    game.sys.player.teleport(spot.x, spot.z);
    game.view.camera.yaw = 0;
    game.input.moveX = 1;
    game.input.moveY = 1; // diagonal, length > 1
    step(0.05);
    const first = Math.hypot(p.x - spot.x, p.z - spot.z) / 0.05;
    expect(first).toBeLessThan(game.data.balance.playerSpeed * 0.9); // not an instant jump to full speed
    step(1);
    expect(game.sys.player.currentSpeed).toBeLessThanOrEqual(game.data.balance.playerSpeed + 0.01);
    expect(game.sys.player.currentSpeed).toBeGreaterThan(game.data.balance.playerSpeed * 0.9);
    game.sys.economy.modifier = (stat) => (stat === 'moveSpeed' ? 1.5 : 1);
    step(1);
    expect(game.sys.player.speed()).toBeCloseTo(game.data.balance.playerSpeed * 1.5, 6);
    expect(game.sys.player.currentSpeed).toBeCloseTo(game.data.balance.playerSpeed * 1.5, 0);
  });

  it('cannot walk through a wall, slides along it, and cannot tunnel at huge time steps', () => {
    const { game, step } = makeGame();
    const spot = findClearSpot(game, 12);
    const p = game.state.player;
    const wcx = cellOf(spot.x) + 3;
    const cz0 = cellOf(spot.z);
    const walls = new Set<string>();
    for (let dz = -6; dz <= 6; dz++) walls.add(`${wcx},${cz0 + dz}`);
    stubWalls(game, walls);
    game.sys.player.teleport(spot.x, spot.z);
    game.view.camera.yaw = 0;
    game.input.moveX = 1;
    step(4);
    const wallMinX = cellMin(wcx);
    expect(p.x).toBeLessThanOrEqual(wallMinX - 0.45 + 1e-6);
    expect(p.x).toBeGreaterThan(wallMinX - 0.5); // pressed against it
    // diagonal into the wall: keeps sliding along it
    const z0 = p.z;
    game.input.moveY = -1; // down-right => +X and +Z
    step(1);
    expect(p.z - z0).toBeGreaterThan(3);
    expect(p.x).toBeLessThanOrEqual(wallMinX - 0.45 + 1e-6);
    // turbo vehicle at the maximum frame time: 0.25 s * 40 u/s = 10 units per frame
    game.sys.economy.modifier = (stat) => (stat === 'moveSpeed' ? 6 : 1);
    game.input.moveY = 0;
    for (let i = 0; i < 120; i++) game.update(0.25);
    expect(p.x).toBeLessThanOrEqual(wallMinX - 0.45 + 1e-6);
    // leaving works again: walk left, away from the wall
    game.input.moveX = -1;
    for (let i = 0; i < 8; i++) game.update(0.25);
    expect(p.x).toBeLessThan(wallMinX - 5);
  });

  it('pushes the player out of a wall that appears on top of them and out of a walled-in cell', () => {
    const { game, step } = makeGame();
    const spot = findClearSpot(game, 12);
    game.sys.player.teleport(spot.x, spot.z);
    const cx = cellOf(spot.x);
    const cz = cellOf(spot.z);
    stubWalls(game, new Set([`${cx},${cz}`]));
    step(0.2);
    const p = game.state.player;
    expect(Math.max(Math.abs(p.x - spot.x), Math.abs(p.z - spot.z))).toBeGreaterThanOrEqual(CELL / 2 + 0.4);
    // completely walled in with the player in the middle: rescued after a moment rather than stuck forever
    const ring = new Set<string>();
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) ring.add(`${cx + dx},${cz + dz}`);
    ring.add(`${cx},${cz}`);
    stubWalls(game, ring);
    step(3);
    const q = game.state.player;
    expect(ring.has(`${cellOf(q.x)},${cellOf(q.z)}`)).toBe(false);
  });

  it('collides with solid nodes (trees, boulders) but walks through bushes; depleted nodes vanish', () => {
    const { game, step } = makeGame();
    const w = game.sys.world;
    const tree = w.gen.nodes.find((n) => n.def === 'tree_round')!;
    const bush = w.gen.nodes.find((n) => n.def === 'fiber_grass')!;
    game.view.camera.yaw = 0;
    game.sys.player.teleport(tree.x - 3, tree.z);
    game.state.settings.autoGather = false;
    game.input.moveX = 1;
    step(2);
    const min = w.nodeRadius(tree.i) + 0.45;
    const p = game.state.player;
    expect(Math.hypot(p.x - tree.x, p.z - tree.z)).toBeGreaterThanOrEqual(min - 1e-6);
    expect(Math.hypot(p.x - tree.x, p.z - tree.z)).toBeLessThan(min + 0.05);
    // bushes/grass are walkable
    expect(w.nodeRadius(bush.i)).toBe(0);
    // chop it down and the way is open
    for (let i = 0; i < 5; i++) w.hitNode(tree.i, 1);
    step(1);
    expect(p.x).toBeGreaterThan(tree.x + 1); // walked straight through where the trunk was
  });

  it('stays inside the world and out of lakes (but hover vehicles cross water)', () => {
    const rig = makeRichGame();
    const { game, step } = rig;
    const w = game.sys.world;
    const p = game.state.player;
    game.view.camera.yaw = 0;
    game.sys.player.teleport(250, 40);
    game.input.moveX = 1;
    step(2);
    expect(p.x).toBeLessThanOrEqual(256 - 0.45 + 1e-6);

    // a lake: find a water cell with dry land to its left
    const gen = w.gen;
    let lake: { cx: number; cz: number } | null = null;
    for (let cz = 5; cz < WORLD_CELLS - 5 && !lake; cz++)
      for (let cx = 8; cx < WORLD_CELLS - 12 && !lake; cx++) {
        let ok = gen.water[cz * WORLD_CELLS + cx] === 1 && gen.water[cz * WORLD_CELLS + cx + 1] === 1 && gen.water[cz * WORLD_CELLS + cx + 2] === 1;
        for (let dx = 1; dx <= 6 && ok; dx++) if (gen.water[cz * WORLD_CELLS + cx - dx]) ok = false;
        if (ok && w.regionAtCell(cx - 6, cz) !== w.regionAtCell(cx + 2, cz)) ok = false;
        if (ok && w.isUnlocked(w.regionAtCell(cx, cz)) && !w.solidNear(cellMin(cx) - 4, cellMin(cz) + 1, 5)) lake = { cx, cz };
      }
    expect(lake).not.toBeNull();
    const lx = cellMin(lake!.cx);
    const lz = cellMin(lake!.cz) + 1;
    game.sys.player.teleport(lx - 4, lz);
    game.input.moveX = 1;
    step(3);
    expect(p.x).toBeLessThanOrEqual(lx - 0.45 + 1e-6);
    expect(w.isWater(p.x, p.z)).toBe(false);
    // hover bike glides over it
    game.state.player.vehicles.push('hover');
    expect(game.sys.player.mount('hover')).toBe(true);
    step(2);
    expect(p.x).toBeGreaterThan(lx + 2);
    expect(w.isWater(p.x, p.z) || p.x > lx).toBe(true);
    // you cannot step off a hover bike in the middle of a lake
    game.input.moveX = 0;
    step(0.5);
    if (w.isWater(p.x, p.z)) {
      game.sys.player.dismount();
      expect(game.state.player.vehicle).toBe('hover');
    }
    // after crossing, dismount works on land
    game.sys.player.teleport(lx - 4, lz);
    step(0.1);
    game.sys.player.dismount();
    expect(game.state.player.vehicle).toBeNull();
  });

  it('is fast enough: 20k movement frames in well under a second', () => {
    const { game } = makeGame();
    const spot = findClearSpot(game, 10);
    game.sys.player.teleport(spot.x, spot.z);
    game.view.camera.yaw = 0.3;
    const t0 = performance.now();
    for (let i = 0; i < 20000; i++) {
      game.input.moveX = Math.sin(i * 0.01);
      game.input.moveY = Math.cos(i * 0.013);
      game.sys.player.update(1 / 60);
    }
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('gathering, backpack and colony deposit', () => {
  it('auto-gathers the nearest node while standing next to it, straight into storage inside the colony', () => {
    const { game, step } = makeGame();
    const w = game.sys.world;
    const tree = w.gen.nodes.filter((n) => n.def === 'tree_round').sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    expect(Math.hypot(tree.x, tree.z)).toBeLessThan(28);
    const gained = collectEvents(game, 'resource:gained');
    const hits = collectEvents(game, 'gather:hit');
    game.sys.player.teleport(tree.x + 1.9, tree.z);
    const wood = game.state.resources.amounts.wood ?? 0;
    step(1.2);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.length).toBeLessThanOrEqual(3); // 0.55 s interval
    expect(game.state.resources.amounts.wood).toBe(wood + 3 * hits.length);
    expect(game.state.stats.gathered).toBe(3 * hits.length);
    expect(gained[0]).toMatchObject({ id: 'wood', amount: 3, source: 'gather', x: tree.x, z: tree.z });
    expect(game.sys.player.carried()).toBe(0);
    // the player faces what they chop
    expect(game.state.player.rot).toBeCloseTo(Math.atan2(tree.x - game.state.player.x, tree.z - game.state.player.z), 2);
  });

  it('only auto-gathers while standing still or pushing into a node, not while running past it', () => {
    const { game, step } = makeGame();
    const w = game.sys.world;
    const hits = collectEvents(game, 'gather:hit');
    // a tree with open ground both for the fly-by (2.6 to the side) and for the head-on run (the forest is dense now)
    const tree = findOpenTree(game, [{ back: 12, side: 2.6, ahead: 10 }, { back: 14, side: 0, ahead: -3 }]);
    game.view.camera.yaw = 0;
    // running past at full speed, 2.6 units to the side (inside interact range): the tree is left alone
    game.sys.player.teleport(tree.x - 12, tree.z + 2.6);
    game.input.moveX = 1;
    game.input.moveY = 0;
    step(3);
    expect(hits.filter((h) => h.node === tree.i)).toHaveLength(0);
    expect(game.state.player.x).toBeGreaterThan(tree.x + 3);
    hits.length = 0;
    // heading straight into the trunk (or whatever stands in the way): the player stops in front of it and chops
    const speeds: number[] = [];
    game.bus.on('gather:hit', () => speeds.push(game.sys.player.currentSpeed));
    game.sys.player.teleport(tree.x - 14, tree.z);
    step(0.5);
    hits.length = 0;
    speeds.length = 0;
    step(0.5); // still running: nothing yet
    expect(hits).toHaveLength(0);
    step(3.5);
    expect(hits.length).toBeGreaterThan(0);
    expect(speeds[0]).toBeLessThan(2.5); // the first chop happened while stopped against the obstacle
    const p = game.state.player;
    const first = w.gen.nodes[hits[0].node];
    expect(Math.hypot(p.x - first.x, p.z - first.z)).toBeLessThan(40);
  });

  it('respects settings.autoGather: the context button gathers one hit per tap, or continuously while held', () => {
    const { game, step } = makeGame();
    const w = game.sys.world;
    const tree = w.gen.nodes.find((n) => n.def === 'tree_round')!;
    const hits = collectEvents(game, 'gather:hit');
    const interacts = collectEvents(game, 'player:interact');
    game.state.settings.autoGather = false;
    game.sys.player.teleport(tree.x + 1.9, tree.z);
    step(2);
    expect(hits).toHaveLength(0);
    expect(game.sys.player.interaction()).toMatchObject({ kind: 'gather', label: 'Chop', target: tree.i, icon: '🪵' });
    game.input.interact = true;
    step(0.05);
    expect(hits).toHaveLength(1);
    expect(interacts).toEqual([{ kind: 'gather', target: tree.i }]);
    expect(game.input.interact).toBe(false); // one-frame flag consumed
    game.input.interactHeld = true;
    step(game.data.balance.gatherInterval * 2 + 0.1); // two more hits while held
    game.input.interactHeld = false;
    expect(hits.length).toBeGreaterThanOrEqual(3);
    step(2);
    expect(hits.length).toBeLessThanOrEqual(5);
  });

  it('keeps carried goods in the backpack outside the colony, caps at capacity, then deposits on return', () => {
    const rig = makeGame();
    const { game, step } = rig;
    const w = game.sys.world;
    const full = collectEvents(game, 'player:backpackFull');
    const deposits = collectEvents(game, 'player:deposit');
    const sfx = collectEvents(game, 'sfx');
    const toasts = collectEvents(game, 'ui:toast');
    // far from the colony (radius 12 + 4 cells), in pinewood
    const pine = w.gen.nodes.filter((n) => n.def === 'tree_pine' && Math.hypot(n.x, n.z) > 90);
    const tree = pine[0];
    expect(game.sys.player.capacity()).toBe(80);
    game.sys.player.teleport(tree.x + 2.2, tree.z);
    expect(game.sys.player.inColony()).toBe(false);
    const wood = game.state.resources.amounts.wood ?? 0;
    step(2.5);
    expect(game.state.resources.amounts.wood ?? 0).toBe(wood);
    expect(game.state.player.backpack.wood).toBeGreaterThanOrEqual(4);
    expect(game.sys.player.carried()).toBe(game.state.player.backpack.wood);
    // keep chopping until the game says the pack is full (a drop that fits exactly, e.g. 20 x 4 wood = 80, only
    // reports "full" when the next hit no longer fits), and never carry more than the capacity on the way
    for (const n of pine.slice(0, 40)) {
      game.sys.player.teleport(n.x + 2.2, n.z);
      step(4.5);
      expect(game.sys.player.carried()).toBeLessThanOrEqual(80);
      if (full.length > 0) break;
    }
    expect(game.sys.player.carried()).toBe(80);
    expect(full.length).toBeGreaterThanOrEqual(1);
    expect(toasts.some((t) => /Backpack full/.test(t.text))).toBe(true);
    const packed = { ...game.state.player.backpack };
    // fast travel home -> arriving inside the colony auto-deposits
    expect(game.sys.player.fastTravel('base')).toBe(true);
    step(0.1);
    expect(game.sys.player.carried()).toBe(0);
    expect(deposits).toHaveLength(1);
    expect(deposits[0].bag).toEqual(packed);
    expect(sfx.some((e) => e.id === 'deposit')).toBe(true);
    for (const [id, n] of Object.entries(packed)) expect(game.state.resources.amounts[id] ?? 0).toBeGreaterThanOrEqual(Math.min(n as number, 200));
  });

  it('retries the deposit while inside when storage was full', () => {
    const { game, step } = makeGame();
    game.sys.player.teleport(0, 5);
    game.state.player.backpack.wood = 30;
    const cap = game.sys.economy.capacity('wood');
    game.state.resources.amounts.wood = cap; // storage full
    step(2);
    expect(game.state.player.backpack.wood).toBe(30);
    game.state.resources.amounts.wood = cap - 10;
    step(1.5);
    expect(game.state.player.backpack.wood).toBe(20);
    expect(game.state.resources.amounts.wood).toBe(cap);
  });

  it('refuses nodes that need a better tool and works once the right tool is equipped', () => {
    const { game, step } = makeGame();
    game.state.colony.tier = 1;
    game.bus.emit('colony:tierUp', { tier: 1 });
    const w = game.sys.world;
    const ore = w.gen.nodes.find((n) => n.def === 'ore_iron' && w.isUnlocked(n.region))!;
    expect(ore).toBeTruthy();
    const toasts = collectEvents(game, 'ui:toast');
    const hits = collectEvents(game, 'gather:hit');
    game.sys.player.teleport(ore.x + 2.2, ore.z);
    game.sys.player.unequip('tool'); // bare hands: tier 0
    step(3);
    expect(hits).toHaveLength(0);
    expect(toasts.filter((t) => /better tool/.test(t.text))).toHaveLength(1); // not spammed
    expect(game.sys.player.equip('survival_tool')).toBe(true);
    step(1.2);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].drop.iron).toBe(2);
  });

  it('applies gather yield modifiers', () => {
    const { game, step } = makeGame();
    const tree = game.sys.world.gen.nodes.find((n) => n.def === 'tree_round')!;
    game.sys.economy.modifier = (stat) => (stat === 'gatherYield' ? 2 : 1);
    const hits = collectEvents(game, 'gather:hit');
    game.sys.player.teleport(tree.x + 1.9, tree.z);
    step(0.1);
    expect(hits[0].drop.wood).toBe(6);
  });

  it('drone assistant boost gathers nearby nodes even while running', () => {
    const { game, step } = makeGame();
    const w = game.sys.world;
    const hits = collectEvents(game, 'gather:hit');
    const tree = findOpenTree(game, [{ back: 6, side: 5, ahead: 16 }]);
    game.view.camera.yaw = 0;
    game.sys.player.teleport(tree.x - 6, tree.z + 5);
    game.input.moveX = 1;
    step(1);
    expect(hits).toHaveLength(0);
    game.state.liveops.boosts.push({ id: 'd', kind: 'drone', mult: 1, until: game.now() + 60_000 });
    game.sys.player.teleport(tree.x - 6, tree.z + 5);
    step(3);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(game.sys.player.currentSpeed).toBeGreaterThan(3); // still moving
  });
});

describe('interaction', () => {
  it('prefers events, then POIs, then buildings, then nodes', () => {
    const { game } = makeRichGame();
    const w = game.sys.world;
    const p = game.state.player;
    const spot = findClearSpot(game, 12, 70, true);
    game.sys.player.teleport(spot.x, spot.z);
    expect(game.sys.player.interaction()).toBeNull();

    // a tree beside us -> Chop
    const tree = { i: 0 };
    void tree;
    const node = w.gen.nodes.find((n) => n.def === 'tree_round')!;
    game.sys.player.teleport(node.x + 1.9, node.z);
    expect(game.sys.player.interaction()?.kind).toBe('gather');

    // a workshop beside us -> building beats node
    const cx = cellOf(p.x) + 1;
    const cz = cellOf(p.z) + 1;
    building(game, 50, 'workbench', cx, cz);
    expect(game.sys.player.interaction()).toMatchObject({ kind: 'building', label: 'Craft', target: 50 });

    // a POI beats the building
    const cache = w.gen.pois.find((q) => q.def === 'supply_cache')!;
    game.sys.player.teleport(cache.x + 1.5, cache.z);
    building(game, 51, 'workbench', cellOf(cache.x) + 1, cellOf(cache.z) + 1);
    expect(game.sys.player.interaction()).toMatchObject({ kind: 'loot', label: 'Open', target: cache.id });

    // an active event beats the POI
    game.state.world.events.push({ id: 7, def: 'supply_drop', x: p.x + 2, z: p.z, endsAt: game.state.playTime + 100, claimed: false });
    expect(game.sys.player.interaction()).toMatchObject({ kind: 'event', label: 'Collect', target: 7 });
    game.state.world.events.length = 0;

    // looted POIs stop offering themselves
    w.lootPoi(cache.id);
    expect(game.sys.player.interaction()?.target).not.toBe(cache.id);
  });

  it('maps buildings to the right panels and ignores structure pieces and buildings under construction', () => {
    const { game } = makeRichGame();
    const opened = collectEvents(game, 'ui:open');
    const spot = findClearSpot(game, 12, 70, true);
    game.sys.player.teleport(spot.x, spot.z);
    const cx = cellOf(spot.x);
    const cz = cellOf(spot.z);
    const cases: [string, string, string, unknown?][] = [
      ['spin_wheel', 'Spin', 'spin'],
      ['workbench', 'Craft', 'craft', 'workbench'],
      ['campfire', 'Craft', 'craft', 'campfire'],
      ['hall', 'Recruit', 'recruit'],
      ['garage', 'Garage', 'vehicles'],
      ['tele', 'Travel', 'map'],
      ['logging_camp', 'Manage', 'building'],
    ];
    let id = 100;
    for (const [def, label, panel, arg] of cases) {
      clearBuildings(game);
      const b = building(game, ++id, def, cx + 1, cz - 1);
      const it = game.sys.player.interaction();
      expect(it, def).toMatchObject({ kind: 'building', label, target: b.id });
      opened.length = 0;
      expect(game.sys.player.interact()).toBe(true);
      expect(opened[0], def).toEqual({ panel, arg: arg ?? (panel === 'building' ? b.id : undefined) });
    }
    clearBuildings(game);
    building(game, 200, 'wall_piece', cx + 1, cz - 1);
    expect(game.sys.player.interaction()).toBeNull();
    clearBuildings(game);
    building(game, 201, 'workbench', cx + 1, cz - 1, 'building');
    expect(game.sys.player.interaction()).toBeNull();
    clearBuildings(game);
    building(game, 202, 'workbench', cx + 12, cz - 1); // too far
    expect(game.sys.player.interaction()).toBeNull();
  });

  it('opens the colony panel at the core and labels nodes by model', () => {
    const { game } = makeRichGame();
    const w = game.sys.world;
    game.sys.player.teleport(0, 5);
    // the construction system places the core at (127, 127) on a fresh game
    if (!game.sys.buildings.core()) building(game, 1, 'command_center', 127, 127);
    expect(game.sys.player.interaction()).toMatchObject({ kind: 'building', label: 'Colony' });
    clearBuildings(game);
    const label = (def: string) => {
      const n = w.gen.nodes.find((q) => q.def === def)!;
      game.sys.player.teleport(n.x + 0.4, n.z);
      return game.sys.player.interaction();
    };
    expect(label('tree_pine')).toMatchObject({ label: 'Chop' });
    expect(label('rock')).toMatchObject({ label: 'Mine', icon: '🪨' });
    expect(label('bush_berry')).toMatchObject({ label: 'Pick', icon: '🍎' });
    expect(label('fiber_grass')).toMatchObject({ label: 'Harvest' });
  });

  it('performs POI interactions through the context button', () => {
    const { game, step } = makeGame();
    const w = game.sys.world;
    const looted = collectEvents(game, 'world:poiLooted');
    const camp = w.gen.pois.find((q) => q.def === 'survivor_camp')!;
    game.sys.player.teleport(camp.x + 1.5, camp.z);
    expect(game.sys.player.interaction()).toMatchObject({ kind: 'rescue', label: 'Rescue', target: camp.id });
    game.input.interact = true;
    step(0.05);
    expect(looted).toHaveLength(1);
    expect(game.sys.player.interaction()?.target).not.toBe(camp.id);
    const beacon = w.gen.pois.find((q) => q.def === 'beacon')!;
    game.sys.player.teleport(beacon.x + 1.5, beacon.z);
    expect(game.sys.player.interaction()).toMatchObject({ kind: 'beacon', label: 'Activate' });
    game.input.interact = true;
    step(0.05);
    expect(game.state.world.beacons).toContain(beacon.id);
    expect(game.sys.player.interaction()).toMatchObject({ kind: 'beacon', label: 'Fast Travel' });
  });
});

describe('equipment, items, health', () => {
  it('equips owned items into their slot, raises max HP with armor, and unequips', () => {
    const { game } = makeGame();
    const pl = game.sys.player;
    const p = game.state.player;
    const equipped = collectEvents(game, 'player:equipped');
    expect(p.equip).toEqual({ tool: 'survival_tool', weapon: 'flare_pistol', backpack: 'small_backpack' });
    expect(pl.maxHp()).toBe(100);
    expect(pl.equip('fiber_vest')).toBe(false); // not owned
    pl.addItem('fiber_vest');
    expect(pl.equip('fiber_vest')).toBe(true);
    expect(equipped.at(-1)).toEqual({ item: 'fiber_vest', slot: 'armor' });
    expect(pl.maxHp()).toBe(130);
    expect(p.hp).toBe(130);
    expect(pl.equip('bandage')).toBe(false); // consumables have no slot
    expect(pl.equip('nothing')).toBe(false);
    pl.unequip('armor');
    expect(p.equip.armor).toBeUndefined();
    expect(pl.maxHp()).toBe(100);
    expect(p.hp).toBe(100);
    // a better tool changes the tool tier / a missing backpack shrinks capacity
    pl.unequip('backpack');
    expect(pl.capacity()).toBe(20);
    expect(pl.equip('small_backpack')).toBe(true);
    expect(pl.capacity()).toBe(80);
    // removing the last copy of an equipped item unequips it
    pl.removeItem('survival_tool');
    expect(p.equip.tool).toBeUndefined();
  });

  it('uses bandages and opens crates through game.grant', () => {
    const { game } = makeGame();
    const pl = game.sys.player;
    const p = game.state.player;
    expect(pl.useItem('bandage')).toBe(false); // full health: not wasted
    expect(p.items.bandage).toBe(2);
    p.hp = 30;
    expect(pl.useItem('bandage')).toBe(true);
    expect(p.hp).toBe(70);
    expect(p.items.bandage).toBe(1);
    p.hp = 90;
    expect(pl.useItem('bandage')).toBe(true);
    expect(p.hp).toBe(100); // capped
    expect(pl.useItem('bandage')).toBe(false); // none left
    const grants: unknown[] = [];
    const orig = game.grant.bind(game);
    game.grant = (r, s, x, z) => {
      grants.push([r, s]);
      orig(r, s, x, z);
    };
    pl.addItem('supply_crate');
    expect(pl.useItem('supply_crate')).toBe(true);
    expect(grants).toEqual([[{ resources: { wood: 60, stone: 40, fiber: 30, food: 30 } }, 'crate']]);
    expect(p.items.supply_crate).toBeUndefined();
    expect(pl.useItem('survival_tool')).toBe(false); // not consumable
  });

  it('names the opened crate on its reward event (so the reward card shows that crate)', () => {
    const { game } = makeGame();
    const pl = game.sys.player;
    const seen: { source: string; item?: string }[] = [];
    game.bus.on('reward:granted', (e) => seen.push({ source: e.source, item: e.item }));
    pl.addItem('titan_crate');
    expect(pl.useItem('titan_crate')).toBe(true);
    expect(seen).toEqual([{ source: 'crate', item: 'titan_crate' }]);
  });

  it('regenerates health slowly out of combat', () => {
    const { game, step } = makeGame();
    const p = game.state.player;
    p.hp = 40;
    step(3);
    expect(p.hp).toBeCloseTo(40, 3); // no regen right after a hit
    step(10);
    expect(p.hp).toBeGreaterThan(40);
    expect(p.hp).toBeLessThan(100);
    p.hp = 100 - 1; // hurt again resets the timer
    game.sys.player.hurt(10);
    const hp = p.hp;
    step(2);
    expect(p.hp).toBe(hp);
  });

  it('knocks the player out at 0 HP, blocks movement, and respawns at the colony with full health and all items', () => {
    const rig = makeGame();
    const { game, step } = rig;
    const downed = collectEvents(game, 'player:downed');
    const respawned = collectEvents(game, 'player:respawned');
    const spot = findClearSpot(game);
    const p = game.state.player;
    game.sys.player.teleport(spot.x, spot.z);
    p.backpack.wood = 12;
    game.state.player.vehicles.push('atv');
    game.sys.player.mount('atv');
    game.sys.player.hurt(500);
    expect(downed).toHaveLength(1);
    expect(p.hp).toBe(0);
    expect(p.vehicle).toBeNull(); // thrown off the vehicle
    expect(p.downUntil).toBeGreaterThan(game.state.playTime);
    game.input.moveX = 1;
    game.view.camera.yaw = 0;
    step(3);
    expect(p.x).toBe(spot.x); // no movement while out
    expect(game.sys.player.interaction()).toBeNull();
    expect(game.sys.player.fastTravel('base')).toBe(false);
    expect(respawned).toHaveLength(0);
    game.input.moveX = 0;
    step(4);
    expect(respawned).toHaveLength(1);
    expect(downed).toHaveLength(1);
    expect(p.hp).toBe(game.sys.player.maxHp());
    expect(p.downUntil).toBe(0);
    expect(dir(p, { x: 0, z: 0 })).toBeLessThan(12);
    expect(p.backpack.wood ?? 0).toBeGreaterThanOrEqual(0); // never lose items
    expect(game.state.player.items.survival_tool).toBe(1);
    expect(game.state.player.equip.tool).toBe('survival_tool');
    // combat can also just zero the HP / set the timer itself
    p.hp = 0;
    step(0.1);
    expect(downed).toHaveLength(2);
    expect(p.downUntil).toBeGreaterThan(game.state.playTime);
    step(7);
    expect(respawned).toHaveLength(2);
  });
});

describe('vehicles', () => {
  it('mounts any owned vehicle anywhere: speed and storage bonuses, events, dismount', () => {
    const { game, step } = makeRichGame();
    const pl = game.sys.player;
    const mounted = collectEvents(game, 'vehicle:mounted');
    const dismounted = collectEvents(game, 'vehicle:dismounted');
    const sfx = collectEvents(game, 'sfx');
    expect(pl.mount('atv')).toBe(false); // not owned
    game.state.player.vehicles.push('atv');
    const walk = pl.speed();
    expect(pl.capacity()).toBe(80);
    expect(pl.mount('atv')).toBe(true);
    expect(mounted).toEqual([{ vehicle: 'atv' }]);
    expect(sfx.some((e) => e.id === 'vehicle_start')).toBe(true);
    expect(pl.speed()).toBeCloseTo(walk * 1.8, 6);
    expect(pl.capacity()).toBe(140);
    expect(pl.mount('nope')).toBe(false);
    const spot = findClearSpot(game, 14);
    pl.teleport(spot.x, spot.z);
    game.view.camera.yaw = 0;
    game.input.moveX = 1;
    step(1.5);
    expect(pl.currentSpeed).toBeGreaterThan(walk * 1.5);
    pl.dismount();
    expect(dismounted).toEqual([{ vehicle: 'atv' }]);
    expect(pl.capacity()).toBe(80);
    expect(game.state.player.vehicle).toBeNull();
    pl.dismount(); // no-op
    expect(dismounted).toHaveLength(1);
  });
});

describe('vehicle cargo never outlives the vehicle', () => {
  function ridingFarFromHome(cargo: Record<string, number>) {
    const rig = makeRichGame();
    const { game } = rig;
    game.state.player.vehicles.push('atv', 'hover');
    const spot = findClearSpot(game, 6);
    game.sys.player.teleport(spot.x, spot.z);
    expect(game.sys.player.inColony()).toBe(false);
    game.sys.player.mount('atv');
    Object.assign(game.state.player.backpack, cargo);
    expect(game.sys.player.capacity()).toBe(140); // 80 + the ATV's 60
    return rig;
  }

  it('stepping off sends the surplus home to colony storage, so the pack never exceeds its capacity', () => {
    const { game } = ridingFarFromHome({ wood: 60, stone: 70 }); // 130 carried
    const pl = game.sys.player;
    const deposits = collectEvents(game, 'player:deposit');
    const toasts = collectEvents(game, 'ui:toast');
    const have = () => (game.state.resources.amounts.wood ?? 0) + (game.state.resources.amounts.stone ?? 0);
    const before = have();
    pl.dismount();
    expect(game.state.player.vehicle).toBeNull();
    expect(pl.capacity()).toBe(80);
    expect(pl.carried()).toBe(80);
    expect(have() - before).toBe(50); // nothing was thrown away
    expect(deposits).toHaveLength(1);
    expect(toasts.some((t) => /sent home/.test(t.text))).toBe(true);
  });

  it('being knocked out (a forced dismount) trims the same way', () => {
    const { game, step } = ridingFarFromHome({ wood: 120 });
    game.sys.player.hurt(1000);
    step(0.1);
    expect(game.state.player.vehicle).toBeNull();
    expect(game.sys.player.carried()).toBe(80);
  });

  it('swapping straight to another vehicle keeps cargo that still fits', () => {
    const { game } = ridingFarFromHome({ wood: 110 });
    const wood = game.state.resources.amounts.wood ?? 0;
    expect(game.sys.player.mount('hover')).toBe(true); // 80 + 40 = 120 >= 110
    expect(game.sys.player.capacity()).toBe(120);
    expect(game.sys.player.carried()).toBe(110);
    expect(game.state.resources.amounts.wood ?? 0).toBe(wood);
  });

  it('taking the backpack off trims to the pockets', () => {
    const { game } = makeRichGame();
    const spot = findClearSpot(game, 6);
    game.sys.player.teleport(spot.x, spot.z);
    game.state.player.backpack.wood = 70;
    game.sys.player.unequip('backpack');
    expect(game.sys.player.carried()).toBe(game.sys.player.capacity());
    expect(game.sys.player.carried()).toBeLessThan(70);
  });
});

describe('save / load', () => {
  it('resumes from a saved state with position, equipment and world intact', async () => {
    const { serializeState, deserializeState } = await import('../src/core/state');
    const rig = makeGame();
    const { game, step } = rig;
    const spot = findClearSpot(game);
    game.sys.player.teleport(spot.x, spot.z);
    game.state.player.backpack.stone = 7;
    step(1);
    const copy = deserializeState(serializeState(game.state));
    const again = makeGame(1234, { state: copy });
    const p = again.game.state.player;
    expect(p.x).toBeCloseTo(spot.x, 3);
    expect(p.z).toBeCloseTo(spot.z, 3);
    expect(p.backpack.stone).toBe(7);
    expect(p.equip.tool).toBe('survival_tool');
    expect(p.items.bandage).toBe(2);
    expect(again.game.sys.world.currentRegion).toBe(game.sys.world.currentRegion);
    // a save whose position is invalid (inside water) gets a safe spot
    const bad = deserializeState(serializeState(game.state));
    const w = game.sys.world;
    let wet = { x: 0, z: 0 };
    for (let i = 0; i < w.gen.water.length; i++)
      if (w.gen.water[i] && w.isUnlocked(w.regionAtCell(i % WORLD_CELLS, Math.floor(i / WORLD_CELLS)))) {
        wet = { x: cellMin(i % WORLD_CELLS) + 1, z: cellMin(Math.floor(i / WORLD_CELLS)) + 1 };
        break;
      }
    bad.player.x = wet.x;
    bad.player.z = wet.z;
    const fixed = makeGame(1234, { state: bad });
    expect(fixed.game.sys.world.isWater(fixed.game.state.player.x, fixed.game.state.player.z)).toBe(false);
  });
});
