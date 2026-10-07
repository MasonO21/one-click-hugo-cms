import { describe, expect, it } from 'vitest';
import { cellOf, footprintCenter } from '../src/core/constants';
import type { BuildingInstance, Colonist } from '../src/core/state';
import type { WorldNode } from '../src/sim/world';
import { addBuilding, addColonist, addCore, dist, makeGame, type Harness } from './colonists.util';

const centerOf = (h: Harness, b: BuildingInstance) => {
  const def = h.game.data.building(b.def)!;
  return footprintCenter(b.x, b.z, def.size, b.rot);
};

/** Step in small increments, calling `each` after every frame. */
function watch(h: Harness, seconds: number, each: () => void, dt = 0.1): void {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    h.clock.now += dt * 1000;
    h.game.update(dt);
    each();
  }
}

/** Step until `pred` holds (checked every frame) or `maxSeconds` pass. Returns whether it held. */
function until(h: Harness, pred: () => boolean, maxSeconds = 60, dt = 0.1): boolean {
  const n = Math.round(maxSeconds / dt);
  for (let i = 0; i < n; i++) {
    if (pred()) return true;
    h.clock.now += dt * 1000;
    h.game.update(dt);
  }
  return pred();
}

describe('daily life: working', () => {
  it('walks to the workplace and works there', () => {
    const h = makeGame();
    addCore(h.game);
    const camp = addBuilding(h.game, 'logging_camp', 140, 127);
    const cc = centerOf(h, camp);
    const c = addColonist(h.game, 'common', { specialty: 'gatherer' });
    expect(c.workplace).toBe(camp.id);
    const seen = new Set<string>();
    watch(h, 2, () => seen.add(c.activity));
    expect(seen.has('walking')).toBe(true);
    expect(until(h, () => c.activity === 'working' && dist(c.x, c.z, cc.x, cc.z) < 5, 40)).toBe(true);
  });

  it('gatherers make visible trips to resource nodes and back (and emit presentation-only work hits)', () => {
    const h = makeGame();
    addCore(h.game);
    const camp = addBuilding(h.game, 'logging_camp', 140, 127);
    const cc = centerOf(h, camp);
    const tree: WorldNode = { i: 0, def: 'tree_round', x: cc.x + 8, z: cc.z + 1, rot: 0, scale: 1, region: 'crash_valley', hits: 5 };
    const far: WorldNode = { i: 1, def: 'tree_round', x: cc.x + 80, z: cc.z, rot: 0, scale: 1, region: 'crash_valley', hits: 5 };
    const rock: WorldNode = { i: 2, def: 'rock', x: cc.x - 4, z: cc.z, rot: 0, scale: 1, region: 'crash_valley', hits: 5 };
    (h.game.sys.world as unknown as { gen: unknown }).gen = { nodes: [tree, far, rock] };
    const hits: { node: number; model: string }[] = [];
    let gatherHits = 0;
    h.game.bus.on('colonist:workHit', (e) => hits.push({ node: e.node, model: e.model }));
    h.game.bus.on('gather:hit', () => gatherHits++); // must stay silent: it would award season XP
    const c = addColonist(h.game, 'common', { specialty: 'gatherer' });

    let nearTree = 0;
    let atSite = 0;
    watch(h, 70, () => {
      if (c.activity !== 'working') return;
      if (dist(c.x, c.z, tree.x, tree.z) < 2.5) nearTree++;
      else if (dist(c.x, c.z, cc.x, cc.z) < 4.5) atSite++;
    });
    expect(nearTree).toBeGreaterThan(30); // several seconds spent chopping
    expect(atSite).toBeGreaterThan(10); // and some at the camp between trips
    expect(hits.length).toBeGreaterThan(10);
    expect(hits.every((e) => e.node === 0 && e.model === 'tree_round')).toBe(true);
    expect(gatherHits).toBe(0);
  });

  it('depleted nodes are skipped', () => {
    const h = makeGame();
    addCore(h.game);
    const camp = addBuilding(h.game, 'logging_camp', 140, 127);
    const cc = centerOf(h, camp);
    const tree: WorldNode = { i: 7, def: 'tree_round', x: cc.x + 8, z: cc.z, rot: 0, scale: 1, region: 'crash_valley', hits: 5 };
    (h.game.sys.world as unknown as { gen: unknown }).gen = { nodes: [tree] };
    h.game.state.world.depleted[7] = 1e9;
    const hits: number[] = [];
    h.game.bus.on('colonist:workHit', (e) => hits.push(e.node));
    const c = addColonist(h.game, 'common', { specialty: 'gatherer' });
    let nearTree = 0;
    watch(h, 40, () => {
      if (dist(c.x, c.z, tree.x, tree.z) < 3) nearTree++;
    });
    expect(nearTree).toBe(0);
    expect(hits).toEqual([]);
  });

  it('farmers pace around their field inside the footprint', () => {
    const h = makeGame();
    addCore(h.game);
    const farm = addBuilding(h.game, 'berry_patch', 140, 127); // 2x2 non-solid field
    const cc = centerOf(h, farm);
    const c = addColonist(h.game, 'common', { specialty: 'farmer' });
    const spots = new Set<string>();
    watch(h, 50, () => {
      if (c.activity === 'working') {
        expect(Math.abs(c.x - cc.x)).toBeLessThan(2.1);
        expect(Math.abs(c.z - cc.z)).toBeLessThan(2.1);
        spots.add(`${Math.round(c.x)},${Math.round(c.z)}`);
      }
    });
    expect(spots.size).toBeGreaterThan(1); // moves between spots in the field
  });

  it('takes one meal break a day at the campfire, then goes back to work', () => {
    const h = makeGame();
    addCore(h.game);
    const camp = addBuilding(h.game, 'logging_camp', 140, 127);
    const fire = addBuilding(h.game, 'campfire', 133, 123);
    const fc = centerOf(h, fire);
    const cc = centerOf(h, camp);
    h.game.state.time.dayTime = 0.45;
    const c = addColonist(h.game, 'common', { specialty: 'gatherer' });
    let starts = 0;
    let prev = '';
    let ateAtFire = false;
    watch(h, 140, () => {
      if (c.activity === 'eating' && prev !== 'eating') starts++;
      if (c.activity === 'eating' && dist(c.x, c.z, fc.x, fc.z) < 4) ateAtFire = true;
      prev = c.activity;
    });
    expect(starts).toBe(1);
    expect(ateAtFire).toBe(true);
    expect(c.activity).toBe('working');
    expect(dist(c.x, c.z, cc.x, cc.z)).toBeLessThan(6);
  });

  it('working earns xp; level-ups emit skillUp and a float', () => {
    const h = makeGame();
    addCore(h.game);
    addBuilding(h.game, 'logging_camp', 134, 127);
    const c = addColonist(h.game, 'common', { specialty: 'gatherer' });
    const ups: number[] = [];
    const floats: string[] = [];
    h.game.bus.on('colonist:skillUp', (e) => ups.push(e.skill));
    h.game.bus.on('ui:float', (e) => floats.push(e.text));
    h.run(20);
    expect(c.xp).toBeGreaterThan(0);
    expect(c.skill).toBe(1);
    c.xp = 0.999;
    h.run(3);
    expect(c.skill).toBe(2);
    expect(c.xp).toBeLessThan(0.2);
    expect(ups).toEqual([2]);
    expect(floats.some((t) => t.includes('★★'))).toBe(true);
    // max skill is 5 and stays there
    c.skill = 5;
    c.xp = 0.99;
    h.run(5);
    expect(c.skill).toBe(5);
    expect(c.xp).toBe(1);
    expect(ups).toEqual([2]);
  });

  it('idle colonists relax near the campfire instead of standing in a queue', () => {
    const h = makeGame();
    addCore(h.game);
    const fire = addBuilding(h.game, 'campfire', 133, 123);
    const fc = centerOf(h, fire);
    const cs = Array.from({ length: 6 }, () => addColonist(h.game, 'common'));
    let relaxing = 0;
    watch(h, 40, () => {
      for (const c of cs) if (c.activity === 'relaxing' && dist(c.x, c.z, fc.x, fc.z) < 5) relaxing++;
    });
    expect(relaxing).toBeGreaterThan(100);
    for (const c of cs) expect(['relaxing', 'walking', 'idle']).toContain(c.activity);
    // nobody stacks exactly on someone else
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) expect(dist(cs[i].x, cs[i].z, cs[j].x, cs[j].z)).toBeGreaterThan(0.05);
    }
  });
});

describe('daily life: night', () => {
  it('night -> walk to bed and sleep; sunrise -> back to work', () => {
    const h = makeGame();
    addCore(h.game);
    const camp = addBuilding(h.game, 'logging_camp', 140, 127);
    const shelter = addBuilding(h.game, 'shelter', 131, 131);
    const sc = centerOf(h, shelter);
    const cc = centerOf(h, camp);
    const a = addColonist(h.game, 'common', { specialty: 'gatherer' });
    const b = addColonist(h.game, 'common', { specialty: 'gatherer' });
    expect([a.bed, b.bed].every((id) => id === shelter.id || id === h.game.state.colony.coreId)).toBe(true);
    h.run(15);
    expect(h.game.isNight()).toBe(false);
    expect(a.activity).toBe('working');

    h.game.state.time.dayTime = 0.8; // nightfall
    expect(h.game.isNight()).toBe(true);
    h.run(25);
    for (const c of [a, b]) {
      expect(c.activity).toBe('sleeping');
      const home = c.bed === shelter.id ? sc : centerOf(h, h.game.sys.buildings.core()!);
      expect(dist(c.x, c.z, home.x, home.z)).toBeLessThan(4);
    }

    h.game.state.time.dayTime = 0.3; // sunrise has passed
    expect(until(h, () => a.activity === 'working' && dist(a.x, a.z, cc.x, cc.z) < 6, 40)).toBe(true);
  });

  it('colonists without beds sleep around the campfire', () => {
    const h = makeGame();
    addCore(h.game);
    const fire = addBuilding(h.game, 'campfire', 136, 127);
    const fc = centerOf(h, fire);
    // 1 bed in the pod, 4 colonists -> 3 sleep outside
    const cs = Array.from({ length: 4 }, () => addColonist(h.game, 'common'));
    const outside = cs.filter((c) => c.bed == null);
    expect(outside).toHaveLength(3);
    h.game.state.time.dayTime = 0.9;
    h.run(25);
    for (const c of outside) {
      expect(c.activity).toBe('sleeping');
      expect(dist(c.x, c.z, fc.x, fc.z)).toBeLessThan(6);
    }
    // roommates do not pile on one spot
    expect(dist(outside[0].x, outside[0].z, outside[1].x, outside[1].z)).toBeGreaterThan(0.2);
  });

  it('colonists sharing a bed building get distinct sleeping spots', () => {
    const h = makeGame();
    const shelter = addBuilding(h.game, 'shelter', 131, 131);
    const sc = centerOf(h, shelter);
    const a = addColonist(h.game, 'common');
    const b = addColonist(h.game, 'common');
    h.game.state.time.dayTime = 0.9;
    h.run(25);
    expect([a.activity, b.activity]).toEqual(['sleeping', 'sleeping']);
    expect(dist(a.x, a.z, b.x, b.z)).toBeGreaterThan(0.2);
    for (const c of [a, b]) expect(dist(c.x, c.z, sc.x, sc.z)).toBeLessThan(2);
  });
});

describe('daily life: attacks', () => {
  it('non-guards shelter at their bed or the core; guards stand at their tower', () => {
    const h = makeGame();
    addCore(h.game);
    const tower = addBuilding(h.game, 'guard_post', 145, 127);
    const shelter = addBuilding(h.game, 'shelter', 131, 131);
    const sc = centerOf(h, shelter);
    const tc = centerOf(h, tower);
    const core = centerOf(h, h.game.sys.buildings.core()!);
    const guard = addColonist(h.game, 'common', { specialty: 'guard' });
    const worker = addColonist(h.game, 'common', { specialty: 'cook' });
    const homeless = addColonist(h.game, 'common', { specialty: 'cook' });
    const homeless2 = addColonist(h.game, 'common', { specialty: 'cook' });
    expect(h.game.sys.colonists.jobOf(guard)).toBe('guard');
    h.run(10);

    // Drive the phase by hand: freeze the real combat system so it doesn't resolve the empty attack.
    h.game.sys.combat.update = () => {};
    h.game.state.combat.phase = 'warning';
    h.game.bus.emit('combat:warning', { wave: 1, seconds: 120 });
    h.run(30);
    expect(guard.activity).toBe('working');
    expect(dist(guard.x, guard.z, tc.x, tc.z)).toBeLessThan(4);
    for (const c of [worker, homeless, homeless2]) {
      if (c.workplace === tower.id) continue; // a second guard at the tower is also fine
      expect(c.activity).toBe('sheltering');
      if (c.bed === shelter.id) expect(dist(c.x, c.z, sc.x, sc.z)).toBeLessThan(2.5);
      else expect(dist(c.x, c.z, core.x, core.z)).toBeLessThan(4);
    }
    expect(h.game.state.colonists.list.some((c) => c.activity === 'sheltering')).toBe(true);

    h.game.state.combat.phase = 'attack';
    h.run(5);
    expect(h.game.state.colonists.list.some((c) => c.activity === 'sheltering')).toBe(true);

    // all clear: back to normal
    h.game.state.combat.phase = 'peace';
    h.game.bus.emit('combat:ended', { wave: 1, kills: 3, reward: {} });
    h.run(30);
    expect(h.game.state.colonists.list.some((c) => c.activity === 'sheltering')).toBe(false);
  });
});

describe('movement', () => {
  it('walks at colonistSpeed x (1 + trait speed) and faces its direction of travel', () => {
    for (const [trait, factor] of [['plain', 1], ['speedy', 1.25]] as const) {
      const h = makeGame();
      addCore(h.game);
      const camp = addBuilding(h.game, 'logging_camp', 160, 127); // ~64 units from the core
      const c = addColonist(h.game, 'common', { specialty: 'gatherer', trait }, 0, 0);
      expect(c.workplace).toBe(camp.id);
      h.game.state.player.x = 20; // keep it "near" so walking is simulated
      h.game.state.player.z = 0;
      // wait until it starts walking, then measure 2 s of travel
      let guard = 0;
      while (c.activity !== 'walking' && guard++ < 40) h.run(0.1);
      expect(c.activity).toBe('walking');
      const [x0, z0] = [c.x, c.z];
      h.run(2);
      const moved = dist(c.x, c.z, x0, z0);
      const speed = h.game.data.balance.colonistSpeed * factor;
      expect(moved).toBeGreaterThan(speed * 2 * 0.85);
      expect(moved).toBeLessThan(speed * 2 * 1.02);
      expect(Math.sin(c.rot)).toBeGreaterThan(0.5); // heading +x
    }
  });

  it('slides around obstacles and falls back to a teleport when fully stuck', () => {
    const h = makeGame();
    addCore(h.game);
    const camp = addBuilding(h.game, 'logging_camp', 160, 127);
    const cc = centerOf(h, camp);
    // an impassable wall column across the whole map between the core and the camp
    const wallCell = cellOf(30);
    (h.game.sys.buildings as unknown as { blocked: (cx: number, cz: number) => boolean }).blocked = (cx) => cx === wallCell;
    const c = addColonist(h.game, 'common', { specialty: 'gatherer' }, 0, 0);
    h.game.state.player.x = 20;
    const insideWall: boolean[] = [];
    watch(h, 8, () => insideWall.push(cellOf(c.x) === wallCell));
    // teleported past the wall after being stuck
    expect(until(h, () => c.activity === 'working' && dist(c.x, c.z, cc.x, cc.z) < 6, 10)).toBe(true);
    expect(insideWall.some(Boolean)).toBe(false); // never walked through it
  });

  it('routes around a short wall by sliding (no teleport needed)', () => {
    const h = makeGame();
    addCore(h.game);
    const camp = addBuilding(h.game, 'logging_camp', 160, 120);
    const cc = centerOf(h, camp);
    const wallCell = cellOf(30);
    const zLo = cellOf(cc.z) - 2;
    // a wall with a gap: blocked for cz in [zLo-4, zLo+1]
    (h.game.sys.buildings as unknown as { blocked: (cx: number, cz: number) => boolean }).blocked = (cx, cz) => cx === wallCell && cz >= zLo - 4 && cz <= zLo + 1;
    const c = addColonist(h.game, 'common', { specialty: 'gatherer' }, 20, cc.z - 1);
    h.game.state.player.x = 25;
    h.game.state.player.z = cc.z;
    let teleported = false;
    let last = { x: c.x, z: c.z };
    watch(h, 30, () => {
      if (dist(c.x, c.z, last.x, last.z) > 1.5) teleported = true;
      last = { x: c.x, z: c.z };
      expect(h.game.sys.buildings.blocked(cellOf(c.x), cellOf(c.z), 'colonist')).toBe(false);
    });
    expect(teleported).toBe(false);
    expect(dist(c.x, c.z, cc.x, cc.z)).toBeLessThan(8);
  });

  it('far from the player (and camera) colonists snap to destinations instead of walking', () => {
    const h = makeGame();
    addCore(h.game);
    const camp = addBuilding(h.game, 'logging_camp', 160, 127);
    const cc = centerOf(h, camp);
    h.game.state.player.x = -300;
    h.game.state.player.z = -300;
    const c = addColonist(h.game, 'common', { specialty: 'gatherer' }, 0, 0);
    let walked = false;
    watch(h, 4, () => {
      if (c.activity === 'walking') walked = true;
    });
    expect(walked).toBe(false);
    expect(until(h, () => c.activity === 'working' && dist(c.x, c.z, cc.x, cc.z) < 6, 2)).toBe(true);
  });

  it('the overview camera counts as a viewer: colonists near it still walk', () => {
    const h = makeGame();
    addCore(h.game);
    addBuilding(h.game, 'logging_camp', 160, 127);
    h.game.state.player.x = -300;
    h.game.state.player.z = -300;
    h.game.view.camera.mode = 'overview';
    h.game.view.camera.tx = 20;
    h.game.view.camera.tz = 0;
    const c = addColonist(h.game, 'common', { specialty: 'gatherer' }, 0, 0);
    let walked = false;
    watch(h, 6, () => {
      if (c.activity === 'walking') walked = true;
    });
    expect(walked).toBe(true);
  });
});

describe('robustness & performance', () => {
  it('runs a long mixed day/night colony without NaNs and with valid activities', () => {
    const h = makeGame();
    addCore(h.game);
    addBuilding(h.game, 'logging_camp', 140, 127);
    addBuilding(h.game, 'quarry', 140, 134);
    addBuilding(h.game, 'berry_patch', 128, 140);
    addBuilding(h.game, 'research_desk', 150, 127);
    addBuilding(h.game, 'campfire', 133, 123);
    addBuilding(h.game, 'shelter', 131, 131);
    addBuilding(h.game, 'guard_post', 160, 127);
    addBuilding(h.game, 'kitchen', 150, 134);
    for (let i = 0; i < 14; i++) addColonist(h.game, i % 3 === 0 ? 'rare' : 'common');
    const valid = new Set(['idle', 'walking', 'working', 'sleeping', 'eating', 'relaxing', 'sheltering']);
    watch(h, 360, () => {
      for (const c of h.game.state.colonists.list) {
        if (!Number.isFinite(c.x) || !Number.isFinite(c.z) || !Number.isFinite(c.rot) || !valid.has(c.activity)) throw new Error('bad colonist state');
        if (c.happiness < 0 || c.happiness > 100) throw new Error('happiness out of range');
      }
    }, 0.25);
    expect(h.game.state.time.day).toBeGreaterThanOrEqual(1);
    // at least some jobs got filled
    expect(h.game.state.colonists.list.filter((c: Colonist) => c.workplace != null).length).toBeGreaterThan(5);
  });

  it('80 colonists cost well under 1 ms per frame', () => {
    const h = makeGame();
    addCore(h.game);
    // lots of walls/floors plus a spread of facilities
    for (let i = 0; i < 300; i++) addBuilding(h.game, i % 2 ? 'wall' : 'floor', 100 + (i % 30), 100 + Math.floor(i / 30));
    for (let i = 0; i < 6; i++) addBuilding(h.game, 'logging_camp', 140 + i * 4, 127);
    for (let i = 0; i < 6; i++) addBuilding(h.game, 'quarry', 140 + i * 4, 134);
    for (let i = 0; i < 6; i++) addBuilding(h.game, 'berry_patch', 140 + i * 3, 140);
    for (let i = 0; i < 12; i++) addBuilding(h.game, 'shelter', 120 + i * 3, 150);
    for (let i = 0; i < 6; i++) addBuilding(h.game, 'guard_post', 170, 120 + i * 3);
    for (let i = 0; i < 20; i++) addBuilding(h.game, 'bench', 128 + i, 160);
    addBuilding(h.game, 'campfire', 133, 123);
    const nodes: WorldNode[] = [];
    for (let i = 0; i < 4000; i++) nodes.push({ i, def: i % 3 ? 'tree_round' : 'rock', x: ((i * 37) % 400) - 200, z: ((i * 91) % 400) - 200, rot: 0, scale: 1, region: 'crash_valley', hits: 5 });
    (h.game.sys.world as unknown as { gen: unknown }).gen = { nodes };
    for (let i = 0; i < 80; i++) addColonist(h.game, 'common');
    const cs = h.game.sys.colonists;
    // warm up (JIT) then measure
    for (let i = 0; i < 200; i++) {
      h.clock.now += 16;
      h.game.update(1 / 60);
    }
    let total = 0;
    let worst = 0;
    const frames = 1200;
    for (let i = 0; i < frames; i++) {
      h.clock.now += 16;
      h.game.state.playTime += 1 / 60;
      const t0 = performance.now();
      cs.update(1 / 60);
      const dt = performance.now() - t0;
      total += dt;
      worst = Math.max(worst, dt);
    }
    const avg = total / frames;
    // eslint-disable-next-line no-console
    console.log(`colonists.update avg ${avg.toFixed(3)} ms, worst ${worst.toFixed(2)} ms (80 colonists, ~370 buildings)`);
    expect(avg).toBeLessThan(1);
  });

  it('update() is a no-op without colonists', () => {
    const h = makeGame();
    expect(() => h.run(5)).not.toThrow();
  });
});
