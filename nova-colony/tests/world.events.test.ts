import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { cellOf } from '../src/core/constants';
import { createDataRegistry, defaultData } from '../src/data';
import { WORLD_EVENTS } from '../src/data/events';
import type { WorldEventDef } from '../src/data/schema';
import { createMockServices } from '../src/platform/mock';
import { collectEvents, findClearSpot, type Rig } from './world.helpers';

const EXTRA: WorldEventDef[] = [
  { id: 'rare_merchant', name: 'Rare Merchant', icon: '🧳', kind: 'merchant', minTier: 0, weight: 1, duration: 300, description: '', reward: { xp: 5 }, trades: [{ give: { wood: 20 }, get: { crystal: 3 } }, { give: { stone: 10 }, get: { iron: 5 } }] },
  { id: 'alien_nest_event', name: 'Alien Nest', icon: '🪺', kind: 'nest', minTier: 0, weight: 1, duration: 600, description: '', poi: 'alien_nest', reward: { resources: { biomass: 25 }, nova: 2 } },
  { id: 'crystal_storm', name: 'Crystal Storm', icon: '⚡', kind: 'storm', minTier: 0, weight: 1, duration: 120, description: '', yieldBonus: 1, reward: {} },
  { id: 'survivor_signal', name: 'Survivor Signal', icon: '🆘', kind: 'rescue', minTier: 0, weight: 1, duration: 600, description: '', reward: { colonist: 'common', xp: 10 } },
  { id: 'ancient_site', name: 'Ancient Structure', icon: '🗿', kind: 'ancient', minTier: 0, weight: 1, duration: 600, description: 'It hums.', reward: { rp: 40, nova: 5 } },
];

function makeEventGame(seed = 99): Rig {
  const data = createDataRegistry({ ...defaultData(), worldEvents: [...WORLD_EVENTS, ...EXTRA] });
  let now = 1_700_000_000_000;
  const game = new Game({ seed, data, services: createMockServices(), clock: () => now });
  game.start();
  return {
    game,
    step(seconds, dt = 0.25) {
      for (let i = 0; i < Math.round(seconds / dt); i++) {
        now += dt * 1000;
        game.update(dt);
      }
    },
  };
}

/** Teleport the player next to an event so claims are in range. */
function goTo(game: Game, id: number) {
  const ev = game.state.world.events.find((e) => e.id === id)!;
  game.sys.player.teleport(ev.x + 1.5, ev.z + 1.5);
  return ev;
}

describe('world events: scheduling & placement', () => {
  it('rolls an event every min..max seconds of play, on walkable unlocked ground 30-110 units out', () => {
    const rig = makeEventGame();
    const { game } = rig;
    const started = collectEvents(game, 'world:eventStarted');
    const toasts = collectEvents(game, 'ui:toast');
    const bal = game.data.balance;
    const first = game.state.world.nextEventAt;
    expect(first).toBeGreaterThanOrEqual(bal.eventIntervalMin); // the tutorial gets a quiet start
    rig.step(first - 5);
    expect(started).toHaveLength(0);
    rig.step(10);
    expect(started).toHaveLength(1);
    const ev = game.state.world.events[0];
    expect(started[0]).toEqual({ id: ev.id, def: ev.def, x: ev.x, z: ev.z });
    const def = game.data.worldEvent(ev.def)!;
    expect(toasts.map((t) => t.text)).toContain(`${def.icon} ${def.name} spotted!`);
    expect(ev.endsAt).toBeCloseTo(first + def.duration, 0);
    const d = Math.hypot(ev.x, ev.z);
    expect(d).toBeGreaterThanOrEqual(30);
    expect(d).toBeLessThanOrEqual(110);
    expect(game.sys.world.walkable(ev.x, ev.z)).toBe(true);
    expect(game.sys.world.solidNear(ev.x, ev.z, 2.5)).toBe(false);
    const next = game.state.world.nextEventAt - game.state.playTime;
    expect(next).toBeGreaterThanOrEqual(bal.eventIntervalMin - 1);
    expect(next).toBeLessThanOrEqual(bal.eventIntervalMax);
  });

  it('only rolls events the colony tier allows, with variety', () => {
    const rig = makeEventGame();
    const { game } = rig;
    const seen0 = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const ev = game.sys.worldEvents.spawn();
      if (ev) seen0.add(ev.def);
      game.state.world.events.length = 0;
    }
    expect(seen0.has('meteor_crash')).toBe(false); // minTier 1
    expect(seen0.has('supply_drop')).toBe(true);
    game.state.colony.tier = 1;
    const seen1 = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const ev = game.sys.worldEvents.spawn();
      if (ev) seen1.add(ev.def);
      game.state.world.events.length = 0;
    }
    expect(seen1.has('meteor_crash')).toBe(true);
  });

  it('prefers spots near the player, never in water, locked regions or on top of POIs/events', () => {
    const rig = makeEventGame(7);
    const { game } = rig;
    const w = game.sys.world;
    const spot = findClearSpot(game, 6, 80);
    game.sys.player.teleport(spot.x, spot.z);
    let near = 0;
    const total = 30;
    for (let i = 0; i < total; i++) {
      const ev = game.sys.worldEvents.spawn('supply_drop')!;
      expect(ev).toBeTruthy();
      expect(w.walkable(ev.x, ev.z)).toBe(true);
      expect(w.isUnlocked(w.regionAt(ev.x, ev.z))).toBe(true);
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) expect(w.isWaterCell(cellOf(ev.x) + dx, cellOf(ev.z) + dz)).toBe(false);
      for (const poi of w.gen.pois) expect(Math.hypot(poi.x - ev.x, poi.z - ev.z)).toBeGreaterThan(7.9);
      for (const other of game.state.world.events) if (other !== ev) expect(Math.hypot(other.x - ev.x, other.z - ev.z)).toBeGreaterThan(13.9);
      if (Math.hypot(ev.x - spot.x, ev.z - spot.z) <= 70) near++;
      if (i % 3 === 2) game.state.world.events.length = 0;
    }
    expect(near / total).toBeGreaterThan(0.7);
  });

  it('expires events quietly and never keeps more than three open', () => {
    const rig = makeEventGame();
    const { game } = rig;
    const ended = collectEvents(game, 'world:eventEnded');
    const ev = game.sys.worldEvents.spawn('supply_drop')!;
    rig.step(599);
    expect(game.state.world.events).toHaveLength(1);
    rig.step(2);
    expect(game.state.world.events).toHaveLength(0);
    expect(ended).toEqual([{ id: ev.id, def: 'supply_drop' }]);
    // cap: with 3 unclaimed events the scheduler waits
    for (let i = 0; i < 3; i++) game.sys.worldEvents.spawn('rare_merchant');
    game.state.world.nextEventAt = game.state.playTime;
    rig.step(1);
    expect(game.state.world.events).toHaveLength(3);
    expect(game.state.world.nextEventAt).toBeGreaterThan(game.state.playTime + 30);
  });

  it('trigger() forces a specific or random event; unknown ids do nothing', () => {
    const { game } = makeEventGame();
    game.sys.worldEvents.trigger('ancient_site');
    expect(game.state.world.events.map((e) => e.def)).toEqual(['ancient_site']);
    game.sys.worldEvents.trigger();
    expect(game.state.world.events).toHaveLength(2);
    game.sys.worldEvents.trigger('nope');
    expect(game.state.world.events).toHaveLength(2);
    expect(new Set(game.state.world.events.map((e) => e.id)).size).toBe(2);
  });

  it('survives a save/load round trip', async () => {
    const { serializeState, deserializeState } = await import('../src/core/state');
    const { game } = makeEventGame();
    game.sys.worldEvents.trigger('supply_drop');
    const copy = deserializeState(serializeState(game.state));
    const data = createDataRegistry({ ...defaultData(), worldEvents: [...WORLD_EVENTS, ...EXTRA] });
    const again = new Game({ state: copy, data, services: createMockServices(), clock: () => 1_700_000_000_000 });
    again.start();
    expect(again.state.world.events).toEqual(game.state.world.events);
    expect(again.sys.worldEvents.get(game.state.world.events[0].id)).toBeTruthy();
  });
});

describe('world events: claiming', () => {
  it('grants the reward through game.grant when the player is close, once', () => {
    const { game } = makeEventGame();
    const claimed = collectEvents(game, 'world:eventClaimed');
    const ended = collectEvents(game, 'world:eventEnded');
    const grants: unknown[] = [];
    const orig = game.grant.bind(game);
    game.grant = (r, s, x, z) => {
      grants.push([r, s, x, z]);
      orig(r, s, x, z);
    };
    const ev = game.sys.worldEvents.spawn('supply_drop')!;
    expect(game.sys.worldEvents.claim(ev.id)).toBe(false); // too far
    expect(grants).toHaveLength(0);
    goTo(game, ev.id);
    const wood = game.state.resources.amounts.wood ?? 0;
    expect(game.sys.worldEvents.claim(ev.id)).toBe(true);
    expect(grants).toEqual([[WORLD_EVENTS[0].reward, 'event', ev.x, ev.z]]);
    expect(game.state.resources.amounts.wood).toBe(wood + 80);
    expect(claimed).toEqual([{ id: ev.id, def: 'supply_drop' }]);
    expect(ended).toHaveLength(1);
    expect(game.state.world.events).toHaveLength(0);
    expect(game.sys.worldEvents.claim(ev.id)).toBe(false);
    expect(game.sys.worldEvents.claim(12345)).toBe(false);
  });

  it('context button: shows the event, claims it', () => {
    const rig = makeEventGame();
    const { game } = rig;
    const ev = game.sys.worldEvents.spawn('supply_drop')!;
    goTo(game, ev.id);
    expect(game.sys.player.interaction()).toMatchObject({ kind: 'event', label: 'Collect', target: ev.id });
    game.input.interact = true;
    rig.step(0.25);
    expect(game.state.world.events).toHaveLength(0);
  });

  it('merchants stay open and trade for resources; bad trades are refused', () => {
    const { game } = makeEventGame();
    const toasts = collectEvents(game, 'ui:toast');
    const opened = collectEvents(game, 'ui:open');
    const ev = game.sys.worldEvents.spawn('rare_merchant')!;
    goTo(game, ev.id);
    game.state.resources.amounts.wood = 50;
    game.state.resources.amounts.stone = 5;
    expect(game.sys.worldEvents.claim(ev.id, 0)).toBe(true);
    expect(game.state.resources.amounts.wood).toBe(30);
    expect(game.state.resources.amounts.crystal).toBe(3);
    expect(game.sys.worldEvents.claim(ev.id, 1)).toBe(false); // needs 10 stone, has 5
    expect(game.state.resources.amounts.stone).toBe(5);
    expect(toasts.some((t) => /Not enough/.test(t.text))).toBe(true);
    expect(game.sys.worldEvents.claim(ev.id, 7)).toBe(false); // no such offer
    expect(game.sys.worldEvents.claim(ev.id, 0)).toBe(true);
    expect(game.state.resources.amounts.crystal).toBe(6);
    expect(game.state.world.events).toHaveLength(1); // still there
    // the context button opens the merchant panel
    expect(game.sys.player.interaction()).toMatchObject({ kind: 'event', label: 'Trade' });
    game.sys.player.interact();
    expect(opened.at(-1)).toEqual({ panel: 'merchant', arg: ev.id });
    // far away: no trading
    game.sys.player.teleport(0, 5);
    expect(game.sys.worldEvents.claim(ev.id, 0)).toBe(false);
  });

  it('nests wake their guardians when you approach and pay out only after they are cleared', () => {
    const rig = makeEventGame();
    const { game } = rig;
    const spawned: unknown[][] = [];
    let alive = 0;
    game.sys.combat.spawnWild = (alien, count, x, z) => {
      spawned.push([alien, count, x, z]);
      alive = count;
      return [];
    };
    game.sys.combat.wildNear = () => alive;
    const ev = game.sys.worldEvents.spawn('alien_nest_event')!;
    game.sys.player.teleport(ev.x + 60, ev.z);
    rig.step(1);
    expect(spawned).toHaveLength(0);
    game.sys.player.teleport(ev.x + 15, ev.z);
    rig.step(1);
    expect(spawned).toEqual([['crawler', 4, ev.x, ev.z]]);
    goTo(game, ev.id);
    const biomass = game.state.resources.amounts.biomass ?? 0;
    expect(game.sys.worldEvents.claim(ev.id)).toBe(false); // guardians alive
    expect(game.state.resources.amounts.biomass ?? 0).toBe(biomass);
    alive = 0;
    expect(game.sys.worldEvents.claim(ev.id)).toBe(true);
    expect(game.state.resources.amounts.biomass).toBe(biomass + 25);
    expect(spawned).toHaveLength(1);
  });

  it('claiming a nest before approaching spawns the guardians first', () => {
    const { game } = makeEventGame();
    let calls = 0;
    game.sys.combat.spawnWild = () => {
      calls++;
      return [];
    };
    const ev = game.sys.worldEvents.spawn('alien_nest_event')!;
    goTo(game, ev.id);
    expect(game.sys.worldEvents.claim(ev.id)).toBe(false);
    expect(calls).toBe(1);
    expect(game.sys.worldEvents.claim(ev.id)).toBe(true); // stub combat reports no guardians alive
  });

  it('rescue events grant a colonist and emit survivor:rescued; ancient sites celebrate', () => {
    const { game } = makeEventGame();
    const rescued = collectEvents(game, 'survivor:rescued');
    const celebrate = collectEvents(game, 'ui:celebrate');
    const granted: string[] = [];
    game.sys.colonists.grant = (r) => {
      granted.push(r);
      return 1;
    };
    const rp0 = game.state.research.points;
    const nova0 = game.state.liveops.nova;
    const r = game.sys.worldEvents.spawn('survivor_signal')!;
    goTo(game, r.id);
    expect(game.sys.worldEvents.claim(r.id)).toBe(true);
    expect(granted).toEqual(['common']);
    expect(rescued).toHaveLength(1);
    expect(rescued[0].poi).toBe(`ev_${r.id}`);
    const a = game.sys.worldEvents.spawn('ancient_site')!;
    goTo(game, a.id);
    expect(game.sys.worldEvents.claim(a.id)).toBe(true);
    expect(game.state.research.points).toBe(rp0 + 40);
    expect(game.state.liveops.nova).toBe(nova0 + 5);
    expect(celebrate).toHaveLength(1);
    expect(celebrate[0].title).toContain('Ancient Structure');
  });
});

describe('world events: crystal storm', () => {
  it('boosts gather yield while it lasts and stops afterwards', () => {
    const rig = makeEventGame();
    const { game } = rig;
    const w = game.sys.world;
    const hits = collectEvents(game, 'gather:hit');
    const tree = w.gen.nodes.find((n) => n.def === 'tree_round')!;
    game.sys.player.teleport(tree.x + 1.9, tree.z);
    expect(game.sys.worldEvents.gatherBonus()).toBe(1);
    rig.step(0.3);
    expect(hits[0].drop.wood).toBe(3);
    const ev = game.sys.worldEvents.spawn('crystal_storm')!;
    game.sys.player.teleport(tree.x + 1.9, tree.z);
    expect(game.sys.worldEvents.gatherBonus()).toBe(2); // yieldBonus 1 => x2
    expect(game.sys.worldEvents.stormActive()).toBe(true);
    hits.length = 0;
    rig.step(0.75);
    expect(hits[0].drop.wood).toBe(6);
    // storms need no visit (no reward) so the context button ignores them
    game.state.world.events[0].claimed = false;
    expect(game.sys.player.interaction()?.kind).not.toBe('event');
    rig.step(125);
    expect(game.state.world.events.find((e) => e.id === ev.id)).toBeUndefined();
    expect(game.sys.worldEvents.gatherBonus()).toBe(1);
  });
});
