import { describe, expect, it, vi } from 'vitest';
import { SUPPLY_DRONE_AFTER } from '../src/sim/tutorial';
import { createDataRegistry, defaultData } from '../src/data';
import type { MissionDef } from '../src/data/schema';
import type { WorldGen } from '../src/sim/world';
import { advanceMainTo, fakeBuilding, fulfil, makeGame, tickMeta, type TestGame } from './meta.helpers';

/** The guide refreshes at 4 Hz in update(); step past one refresh before reading it. */
function guideNow(g: TestGame) {
  tickMeta(g, 0.3);
  return g.game.sys.tutorial.guide();
}

/** A hand-made world: two trees, a survivor camp and a looted camp. */
function fakeWorld(g: TestGame): WorldGen {
  const gen = {
    nodes: [
      { i: 0, def: 'tree_round', x: 20, z: 0, rot: 0, scale: 1, region: 'crash_valley', hits: 5 },
      { i: 1, def: 'tree_round', x: -8, z: 3, rot: 0, scale: 1, region: 'crash_valley', hits: 5 },
      { i: 2, def: 'rock', x: 2, z: 2, rot: 0, scale: 1, region: 'crash_valley', hits: 5 },
    ],
    pois: [
      { id: 'poi_1', def: 'survivor_camp', x: 30, z: 30, region: 'crash_valley', rot: 0 },
      { id: 'poi_2', def: 'survivor_camp', x: 12, z: 12, region: 'crash_valley', rot: 0 },
    ],
    props: [],
  } as unknown as WorldGen;
  g.game.sys.world.gen = gen;
  return gen;
}

describe('tutorial: guide target resolution', () => {
  it('points at the nearest live node of the guided def and shows the hint text', () => {
    const g = makeGame();
    fakeWorld(g);
    g.game.state.player.x = 0;
    g.game.state.player.z = 0;
    const guide = guideNow(g)!;
    expect(guide.text).toBe(g.game.data.mission('m01_wood')!.hint);
    expect(guide.mission).toBe('m01_wood');
    expect(guide.ui).toBeNull();
    expect(guide.world).toEqual({ x: -8, z: 3 }); // closer than the tree at (20, 0); the rock is ignored
  });

  it('skips depleted nodes and keeps a stable target while walking (no arrow flicker)', () => {
    const g = makeGame();
    fakeWorld(g);
    g.game.state.player.x = 0;
    g.game.state.player.z = 0;
    expect(guideNow(g)!.world).toEqual({ x: -8, z: 3 });
    // walk to a spot where the other tree is only slightly closer: stay on the first one
    g.game.state.player.x = 6;
    g.game.state.player.z = 0;
    expect(guideNow(g)!.world).toEqual({ x: -8, z: 3 });
    // deplete it: switch to the remaining tree
    g.game.state.world.depleted[1] = 999;
    expect(guideNow(g)!.world).toEqual({ x: 20, z: 0 });
    g.game.state.world.depleted[0] = 999;
    expect(guideNow(g)!.world).toBeNull(); // nothing left to point at
  });

  it('build_menu: highlights the Build button, then the build card once the panel is open', () => {
    const g = makeGame();
    advanceMainTo(g, 'm02_shelter');
    const t = g.game.sys.tutorial;
    expect(guideNow(g)).toMatchObject({ ui: '#btn-build', world: null });
    // build mode
    g.game.view.mode = 'build';
    expect(guideNow(g)!.ui).toBe('[data-build="shelter"]');
    g.game.view.mode = 'play';
    expect(guideNow(g)!.ui).toBe('#btn-build');
    // panel opened through ui:open + panelOpen flag
    g.game.bus.emit('ui:open', { panel: 'build' });
    g.game.view.panelOpen = true;
    expect(guideNow(g)!.ui).toBe('[data-build="shelter"]');
    g.game.view.panelOpen = false;
    expect(guideNow(g)!.ui).toBe('#btn-build');
    // explicit UI flag
    t.setFlag('buildPanelOpen', true);
    t.notifyPanel('build');
    expect(t.guide()!.ui).toBe('[data-build="shelter"]'); // notifyPanel invalidates the cache immediately
    expect(t.flag('buildPanelOpen')).toBe(true);
  });

  it('build_menu while placing that building: points into the world next to the core instead', () => {
    const g = makeGame();
    advanceMainTo(g, 'm02_shelter');
    g.game.view.mode = 'build';
    g.game.view.build.def = 'shelter';
    const guide = guideNow(g)!;
    expect(guide.ui).toBeNull();
    expect(guide.world).not.toBeNull();
  });

  it('ui guide: #btn-<ref>; building guide: the instance, else the core', () => {
    const g = makeGame();
    advanceMainTo(g, 'm07_assign');
    // m07 guides to a logging camp; none exists -> falls back to the core (origin)
    const t = g.game.sys.tutorial;
    expect(guideNow(g)!.world).toEqual({ x: 0, z: 0 });
    g.game.state.buildings.list.push(fakeBuilding('logging_camp', 7, { x: 128 + 5, z: 128 }));
    const w = guideNow(g)!.world!;
    expect(w.x).toBeCloseTo((128 + 5 - 128) * 2 + 2, 5); // centre of a 2x2 footprint
    advanceMainTo(g, 'm10_research');
    expect(guideNow(g)).toMatchObject({ ui: '#btn-research', world: null });
  });

  it('poi guide: nearest un-looted survivor camp', () => {
    const g = makeGame();
    fakeWorld(g);
    advanceMainTo(g, 'm05_rescue');
    g.game.state.player.x = 0;
    g.game.state.player.z = 0;
    expect(guideNow(g)!.world).toEqual({ x: 12, z: 12 });
    g.game.state.world.pois.poi_2 = { discovered: true, looted: true, lootedAt: 1 };
    expect(guideNow(g)!.world).toEqual({ x: 30, z: 30 });
  });

  it('region guide points at the biome centre', () => {
    const base = defaultData();
    const missions: MissionDef[] = [
      { id: 'r1', chain: 'main', name: 'Explore', description: '', type: 'discover', target: 'crystal_canyon', count: 1, reward: {}, hint: 'Go east', guide: { kind: 'region', ref: 'crystal_canyon' } },
    ];
    const data = createDataRegistry({ ...base, missions: [...base.missions, ...missions], firstMission: 'r1' });
    const g = makeGame({ data });
    const w = guideNow(g)!.world!;
    expect(w.x).toBeGreaterThan(100); // angle 0, 66% of the way to the edge
    expect(w.z).toBeCloseTo(0, 5);
  });

  it('emits tutorial:hint when the guided mission changes and clears when the arc is done', () => {
    const g = makeGame();
    const hints: (string | null)[] = [];
    g.game.bus.on('tutorial:hint', (e) => hints.push(e.mission));
    tickMeta(g, 0.5);
    advanceMainTo(g, 'm03_campfire');
    tickMeta(g, 0.5);
    expect(hints).toContain('m02_shelter');
    expect(hints).toContain('m03_campfire');
    advanceMainTo(g, 'm11_tier1');
    fulfil(g, g.game.sys.missions.current()!);
    tickMeta(g, 2);
    expect(hints.at(-1)).toBeNull();
    expect(g.game.sys.tutorial.guide()).toBeNull();
  });
});

describe('tutorial: completion', () => {
  it('marks tutorial.done only after the colony-tier step of the main chain is claimed', () => {
    const g = makeGame();
    expect(g.game.state.tutorial.done).toBe(false);
    advanceMainTo(g, 'm11_tier1');
    expect(g.game.state.tutorial.done).toBe(false);
    fulfil(g, g.game.sys.missions.current()!);
    expect(g.game.state.tutorial.done).toBe(false); // finished but not yet claimed
    tickMeta(g, 1.5);
    expect(g.game.state.tutorial.done).toBe(true);
  });

  it('a save that is already past the arc starts with done = true', () => {
    const g = makeGame();
    advanceMainTo(g, 'm11_tier1');
    fulfil(g, g.game.sys.missions.current()!);
    tickMeta(g, 1.5);
    const state = JSON.parse(JSON.stringify(g.game.state));
    state.tutorial.done = false;
    const g2 = makeGame({ state, at: g.clock.now });
    expect(g2.game.state.tutorial.done).toBe(true);
  });
});

describe('tutorial: pacing safeguard', () => {
  it('drops the missing materials after 60 s of being unable to afford the current build step', () => {
    const g = makeGame();
    const { game } = g;
    advanceMainTo(g, 'm02_shelter');
    vi.spyOn(game.sys.buildings, 'cost').mockReturnValue({ wood: 500, stone: 40 });
    game.state.resources.amounts.wood = 100;
    game.state.resources.amounts.stone = 0;
    game.derived.capacity.wood = 1000;
    game.derived.capacity.stone = 1000;
    const toasts: string[] = [];
    game.bus.on('ui:toast', (e) => toasts.push(e.text));
    tickMeta(g, SUPPLY_DRONE_AFTER - 5);
    expect(toasts).toHaveLength(0);
    expect(game.state.resources.amounts.wood).toBe(100);
    tickMeta(g, 6);
    expect(toasts).toEqual(['📦 A supply drone dropped off materials!']);
    expect(game.state.resources.amounts.wood).toBeGreaterThanOrEqual(500);
    expect(game.state.resources.amounts.stone).toBeGreaterThanOrEqual(40);
    expect(game.sys.tutorial.flag('supplyDrone:m02_shelter')).toBe(true);
  });

  it('does not fire while the player can afford the step, and the timer restarts when it becomes affordable', () => {
    const g = makeGame();
    const { game } = g;
    advanceMainTo(g, 'm02_shelter');
    vi.spyOn(game.sys.buildings, 'cost').mockReturnValue({ wood: 50 });
    game.state.resources.amounts.wood = 0;
    const toasts: string[] = [];
    game.bus.on('ui:toast', (e) => toasts.push(e.text));
    tickMeta(g, 50);
    game.state.resources.amounts.wood = 60; // affordable again
    tickMeta(g, 20);
    game.state.resources.amounts.wood = 0; // unaffordable again: a full new minute is needed
    tickMeta(g, 50);
    expect(toasts).toHaveLength(0);
  });

  it('does not help with steps that are not purchases', () => {
    const g = makeGame();
    const { game } = g;
    const grant = vi.spyOn(game, 'grant');
    vi.spyOn(game.sys.buildings, 'cost').mockReturnValue({ wood: 500 });
    tickMeta(g, 200); // m01 is a gather step
    expect(grant).not.toHaveBeenCalled();
  });

  it('tier step: supplies the colony upgrade cost once research is done', () => {
    const g = makeGame();
    const { game } = g;
    advanceMainTo(g, 'm11_tier1');
    vi.spyOn(game.sys.progression, 'next').mockReturnValue({ tier: 1, research: 'tier_reinforced', researchDone: true, cost: { wood: 150 }, affordable: false });
    game.state.resources.amounts.wood = 0;
    game.derived.capacity.wood = 1000;
    tickMeta(g, SUPPLY_DRONE_AFTER + 2);
    expect(game.state.resources.amounts.wood).toBeGreaterThanOrEqual(150);
  });
});

describe('tutorial: survivor self-heal', () => {
  it('asks the world to spawn a survivor camp again if the rescue step has none', () => {
    const g = makeGame();
    const spawn = vi.spyOn(g.game.sys.world, 'spawnSurvivorNear').mockReturnValue('poi_new');
    g.game.sys.world.gen = { nodes: [], pois: [], props: [] } as unknown as WorldGen;
    advanceMainTo(g, 'm05_rescue');
    // m04's trigger spawned one at completion; the rescue step found no camp in the world, so the
    // self-heal spawn is skipped for this session once a spawn succeeded
    expect(spawn).toHaveBeenCalledTimes(1);
    g.game.sys.missions.ensureGuidePoi();
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('retries when the first spawn failed', () => {
    const g = makeGame();
    const spawn = vi.spyOn(g.game.sys.world, 'spawnSurvivorNear').mockReturnValue(null);
    g.game.sys.world.gen = { nodes: [], pois: [], props: [] } as unknown as WorldGen;
    advanceMainTo(g, 'm05_rescue');
    expect(spawn.mock.calls.length).toBeGreaterThanOrEqual(2); // trigger + self-heal on activation
    spawn.mockReturnValue('poi_ok');
    expect(g.game.sys.missions.ensureGuidePoi()).toBe(true);
    expect(g.game.sys.missions.ensureGuidePoi()).toBe(false); // spawned: never again this session
  });
});
