import { describe, expect, it, vi } from 'vitest';
import { SUPPLY_DRONE_AFTER } from '../src/sim/tutorial';
import { createDataRegistry, defaultData } from '../src/data';
import type { MissionDef } from '../src/data/schema';
import type { WorldGen } from '../src/sim/world';
import { footprintCenter } from '../src/core/constants';
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
    g.game.state.resources.amounts.wood = 500; // affordable (otherwise the guide sends the player gathering)
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

  it('the first raid\'s warning: while waiting, place a trap by the turret; then "stand near your turret" again', () => {
    const g = makeGame();
    advanceMainTo(g, 'm09_defend');
    const st = g.game.state;
    st.resources.amounts.wood = 50;
    st.resources.amounts.stone = 50;
    // no warning yet: the step's own guidance
    expect(guideNow(g)!.text).toContain('Stand near your turret');
    st.combat.phase = 'warning';
    st.combat.nextAt = st.playTime + 60;
    const g1 = guideNow(g)!;
    expect(g1.text).toBe('While you wait: place a Spike Trap near your turret to slow them down.');
    expect(g1.ui).toBe('#btn-build');
    expect(g1.mission).toBe('m09_defend');
    // too little time left, or nothing to pay with: back to the turret
    st.combat.nextAt = st.playTime + 10;
    expect(guideNow(g)!.text).toContain('Stand near your turret');
    st.combat.nextAt = st.playTime + 60;
    st.resources.amounts.wood = 0;
    expect(guideNow(g)!.text).toContain('Stand near your turret');
    // a trap is down: done
    st.resources.amounts.wood = 50;
    st.buildings.list.push(fakeBuilding('spike_trap', 991));
    g.game.bus.emit('building:changed', {});
    (g.game.sys.buildings as unknown as { rebuild?: () => void }).rebuild?.();
    expect(guideNow(g)!.text).toContain('Stand near your turret');
  });

  it('build_menu while placing that building: rings the confirm button once the spot is valid', () => {
    const g = makeGame();
    advanceMainTo(g, 'm02_shelter');
    g.game.view.mode = 'build';
    g.game.view.build.def = 'shelter';
    g.game.view.build.valid = false;
    let guide = guideNow(g)!;
    expect(guide.ui).toBeNull();
    expect(guide.world).toBeNull(); // no arrow at the core: it would read as "build it here"
    g.game.view.build.valid = true;
    guide = guideNow(g)!;
    expect(guide.ui).toBe('#btn-build-confirm');
  });

  it('build_menu, unaffordable: points at the nearest node dropping what is missing, then at the Build button', () => {
    const g = makeGame();
    advanceMainTo(g, 'm02_shelter');
    g.game.state.resources.amounts.wood = 0;
    const need = g.game.sys.buildings.cost('shelter').wood!;
    const guide = guideNow(g)!;
    expect(guide.ui).toBeNull();
    expect(guide.world).not.toBeNull();
    expect(guide.text).toContain(`Need ${need} more Wood`);
    const p = g.game.state.player;
    const node = g.game.sys.world.gen.nodes.find((n) => n.x === guide.world!.x && n.z === guide.world!.z)!;
    expect(g.game.data.node(node.def)!.drop.wood).toBeGreaterThan(0);
    // nothing closer that drops wood
    for (const n of g.game.sys.world.gen.nodes) {
      if (!g.game.data.node(n.def)!.drop.wood || g.game.state.world.depleted[n.i] !== undefined || !g.game.sys.world.isUnlocked(n.region)) continue;
      expect(Math.hypot(n.x - p.x, n.z - p.z)).toBeGreaterThanOrEqual(Math.hypot(node.x - p.x, node.z - p.z) - 1e-6);
    }
    g.game.state.resources.amounts.wood = need;
    expect(guideNow(g)!.ui).toBe('#btn-build');
  });

  it('build_menu after placing: points at the construction site instead of the Build button', () => {
    const g = makeGame();
    advanceMainTo(g, 'm02_shelter');
    g.game.state.resources.amounts.wood = 500;
    expect(guideNow(g)!.ui).toBe('#btn-build');
    g.game.state.buildings.list.push(fakeBuilding('shelter', 50, { x: 130, z: 131, status: 'building', progress: 0.3 }));
    const guide = guideNow(g)!;
    expect(guide.ui).toBeNull();
    expect(guide.world).toEqual(footprintCenter(130, 131, g.game.data.building('shelter')!.size, 0));
    expect(guide.text).toMatch(/going up/);
  });

  it('ui guide: #btn-<ref>; building guide: the instance, else the core', () => {
    const g = makeGame();
    advanceMainTo(g, 'm07_assign');
    // m07 guides to a logging camp; none exists -> falls back to the core (center of its 3x3 footprint)
    const t = g.game.sys.tutorial;
    const core = g.game.sys.buildings.core();
    expect(guideNow(g)!.world).toEqual(core ? g.game.sys.buildings.center(core) : { x: 0, z: 0 });
    g.game.state.buildings.list.push(fakeBuilding('logging_camp', 7, { x: 128 + 5, z: 128 }));
    const w = guideNow(g)!.world!;
    expect(w.x).toBeCloseTo((128 + 5 - 128) * 2 + 2, 5); // centre of a 2x2 footprint
    advanceMainTo(g, 'm10_research');
    expect(guideNow(g)).toMatchObject({ ui: '#btn-research', world: null });
  });

  it('build_menu behind research the player can start: points at that research (Tech button, then the node), then at Build', () => {
    const g0 = makeGame();
    const state = JSON.parse(JSON.stringify(g0.game.state));
    const main: string[] = [];
    for (let m: string | undefined = g0.game.data.firstMission; m && m !== 'm56_laser'; m = g0.game.data.mission(m)!.next?.[0]) main.push(m);
    state.missions.completed = main;
    state.missions.active = ['m56_laser'];
    state.missions.progress = {};
    state.colony.tier = 5;
    state.tutorial.done = true;
    // everything below the Nano tier researched except the turret line Energy Weapons needs (Heavy Ordnance)
    const data = g0.game.data;
    state.research.completed = data.research.filter((r) => r.tier <= 5 && r.id !== 'heavy_ordnance' && r.id !== 'energy_weapons').map((r) => r.id);
    const g = makeGame({ state, at: g0.clock.now });
    for (const r of data.resources) g.game.state.resources.amounts[r.id] = 1e5;
    const rs = g.game.sys.research;
    expect(rs.status('energy_weapons')).toBe('locked_prereq');
    expect(rs.nextStep('energy_weapons')).toBe('heavy_ordnance'); // the open step on the way
    let guide = guideNow(g)!;
    expect(guide.mission).toBe('m56_laser');
    expect(guide.ui).toBe('[data-research="heavy_ordnance"]'); // closed panel: the Guide falls back to #btn-research
    expect(guide.text).toMatch(/^Research Heavy Ordnance first\. /); // the hint only names Energy Weapons
    expect(g.game.sys.tutorial.researchFocus()).toBe('heavy_ordnance');
    g.game.state.research.completed.push('heavy_ordnance');
    guide = guideNow(g)!;
    expect(guide.ui).toBe('[data-research="energy_weapons"]');
    expect(guide.text).toBe(data.mission('m56_laser')!.hint); // it names this one already
    g.game.state.research.completed.push('energy_weapons');
    guide = guideNow(g)!;
    expect(guide.ui).toBe('#btn-build');
    expect(g.game.sys.tutorial.researchFocus()).toBeNull();
    // a research goal focuses its own node; one above the colony tier focuses nothing
    expect(rs.nextStep('railgun_tech')).toBeNull();
    expect(rs.nextStep('energy_weapons')).toBeNull(); // done
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
    // the guided arc is over (see "completion" below) but the main chain continues with hinted missions,
    // so guidance hands over to the next story step instead of vanishing
    const next = g.game.data.mission('m11_tier1')!.next![0];
    expect(g.game.sys.missions.current()?.id).toBe(next);
    expect(hints.at(-1)).toBe(next);
    expect(g.game.sys.tutorial.guide()?.mission).toBe(next);
  });

  it('clears the guide when the main chain itself has nothing left to show', () => {
    const base = defaultData();
    const chain: MissionDef[] = [
      { id: 'x1', chain: 'main', name: 'One', description: '', type: 'gather', target: 'wood', count: 5, reward: {}, hint: 'Chop', guide: { kind: 'ui', ref: 'build' }, next: ['x2'] },
      { id: 'x2', chain: 'main', name: 'Two', description: '', type: 'gather', target: 'wood', count: 5, reward: {}, hint: 'Chop more', guide: { kind: 'ui', ref: 'build' } },
    ];
    const data = createDataRegistry({ ...base, missions: [...base.missions.filter((m) => m.chain !== 'main'), ...chain], firstMission: 'x1' });
    const g = makeGame({ data });
    const hints: (string | null)[] = [];
    g.game.bus.on('tutorial:hint', (e) => hints.push(e.mission));
    expect(guideNow(g)?.mission).toBe('x1');
    fulfil(g, g.game.sys.missions.current()!);
    tickMeta(g, 2);
    expect(hints.at(-1)).toBe('x2');
    fulfil(g, g.game.sys.missions.current()!);
    tickMeta(g, 2);
    expect(hints.at(-1)).toBeNull();
    expect(g.game.sys.tutorial.guide()).toBeNull();
    expect(g.game.state.tutorial.done).toBe(true); // the end of the chain also ends the arc
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

describe('tutorial: pacing safeguard ends with the guided arc', () => {
  it('never hands out materials for later build steps once the tutorial is done', () => {
    const g = makeGame();
    const { game } = g;
    advanceMainTo(g, 'm11_tier1');
    fulfil(g, game.sys.missions.current()!);
    tickMeta(g, 1.5);
    expect(game.state.tutorial.done).toBe(true);
    const cur = game.sys.missions.current()!;
    expect(cur.type).toBe('build'); // m12: a purchase step the drone would have covered during the arc
    vi.spyOn(game.sys.buildings, 'isUnlocked').mockReturnValue(true);
    vi.spyOn(game.sys.buildings, 'cost').mockReturnValue({ wood: 500, stone: 40 });
    game.state.resources.amounts.wood = 0;
    game.state.resources.amounts.stone = 0;
    game.derived.capacity.wood = 1000;
    game.derived.capacity.stone = 1000;
    const toasts: string[] = [];
    game.bus.on('ui:toast', (e) => toasts.push(e.text));
    tickMeta(g, SUPPLY_DRONE_AFTER * 3);
    expect(toasts).not.toContain('📦 A supply drone dropped off materials!');
    expect(game.state.resources.amounts.wood).toBe(0);
    expect(game.sys.tutorial.flag(`supplyDrone:${cur.id}`)).toBe(false);
  });

  it('never gives away a colony tier upgrade after the tutorial, however long the player is short', () => {
    const g = makeGame();
    const { game } = g;
    advanceMainTo(g, 'm11_tier1');
    fulfil(g, game.sys.missions.current()!);
    tickMeta(g, 1.5);
    expect(game.state.tutorial.done).toBe(true);
    // pretend a later main step is a tier upgrade whose research is done but whose materials are missing
    vi.spyOn(game.sys.missions, 'current').mockReturnValue({ id: 'later_tier', chain: 'main', name: '', description: '', type: 'tier', target: '*', count: 2, reward: {} });
    vi.spyOn(game.sys.progression, 'next').mockReturnValue({ tier: 2, research: 'tier_stone', researchDone: true, cost: { wood: 1400, stone: 1400 }, affordable: false });
    game.state.resources.amounts.wood = 0;
    game.state.resources.amounts.stone = 0;
    game.derived.capacity.wood = 5000;
    game.derived.capacity.stone = 5000;
    tickMeta(g, SUPPLY_DRONE_AFTER * 3);
    expect(game.state.resources.amounts.wood).toBe(0);
    expect(game.state.resources.amounts.stone).toBe(0);
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
