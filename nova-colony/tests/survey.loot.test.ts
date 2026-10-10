/**
 * Exploration that pays off (data/survey.ts, sim/world/poiLoot.ts, sim/world.ts): POI loot scales with the colony's
 * tier in the POI's own flavour, caches restock on an absolute clock (time away counts), story POIs stay one-off, and
 * saves from before all this still load and restock.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { Rng } from '../src/core/rng';
import { createMockServices } from '../src/platform/mock';
import { createInitialState, deserializeState, serializeState, type GameState } from '../src/core/state';
import { migrateState } from '../src/platform/saveMigrate';
import { createDataRegistry } from '../src/data';
import { LOOT_FRESH_PER_HOUR, LOOT_THIN_FLOOR, POI_LOOT } from '../src/data/survey';
import { lootPool, lootThinning, lootValue, rollPoiLoot } from '../src/sim/world/poiLoot';
import { rewardValue } from '../src/sim/expedition/rules';
import { collectEvents } from './world.helpers';

const data = createDataRegistry();
const BIG = () => 1e9;

function rig(state?: GameState, at = 1_700_000_000_000) {
  const clock = { now: at };
  const game = new Game({ seed: 1234, state, services: createMockServices(), clock: () => clock.now });
  game.start();
  const step = (seconds: number, dt = 0.25) => {
    for (let i = 0; i < Math.round(seconds / dt); i++) {
      clock.now += dt * 1000;
      game.update(dt);
    }
  };
  return { game, clock, step };
}

const reload = (g: Game, clockAt: number) => rig(migrateState(deserializeState(serializeState(g.state))), clockAt);

describe('POI loot: tier-scaled, in each POI’s flavour', () => {
  it('is worth its minutes of colony output at every tier (storage permitting)', () => {
    const rng = new Rng(7);
    for (let tier = 0; tier <= 6; tier++) {
      for (const [id, def] of Object.entries(POI_LOOT)) {
        const r = rollPoiLoot({ data, tier, capacity: BIG }, id, rng);
        const worth = rewardValue(data, { resources: r.resources, rp: r.rp }, tier);
        const target = lootValue(data, tier, def.minutes);
        // ±10% wobble, rounding to nice numbers and a little slack for tiny amounts at Wood
        expect(worth, `${id} @${tier}`).toBeGreaterThan(target * 0.8);
        expect(worth, `${id} @${tier}`).toBeLessThan(target * 1.2 + 25);
      }
    }
  });

  it('a ruin opened at Steel is worth dozens of times the old fixed Wood-tier loot', () => {
    const old = rewardValue(data, { rp: 80, resources: { crystal: 10 } }, 3);
    const now = rewardValue(data, rollPoiLoot({ data, tier: 3, capacity: BIG }, 'alien_ruin', new Rng(3)), 3);
    expect(now).toBeGreaterThan(old * 20);
  });

  it('keeps each POI’s flavour and never hands out goods more than a tier ahead', () => {
    const rng = new Rng(11);
    for (let tier = 0; tier <= 6; tier++) {
      for (const [id, def] of Object.entries(POI_LOOT)) {
        for (let k = 0; k < 6; k++) {
          const r = rollPoiLoot({ data, tier, capacity: BIG }, id, rng);
          const goods = [...Object.keys(r.resources ?? {}), ...(r.rp ? ['rp'] : [])];
          expect(goods.length, id).toBeGreaterThan(0);
          expect(goods.length).toBeLessThanOrEqual(def.picks);
          const pool = lootPool({ data, tier, capacity: BIG }, def.yields).map(([g]) => g);
          for (const g of goods) {
            if (pool.length) expect(pool, `${id} @${tier}`).toContain(g);
            expect(data.expeditionRules.intro[g] ?? 0, `${g} from ${id} @${tier}`).toBeLessThanOrEqual(Math.max(tier + 1, pool.length ? 0 : 99));
          }
        }
      }
    }
    // a wreck is parts and electronics; a supply cache is food and basics
    const wreck = lootPool({ data, tier: 3, capacity: BIG }, POI_LOOT.crashed_ship.yields).map(([g]) => g);
    expect(wreck).toContain('electronics');
    expect(wreck).not.toContain('food');
    const cache = lootPool({ data, tier: 0, capacity: BIG }, POI_LOOT.supply_cache.yields).map(([g]) => g);
    expect(cache).toEqual(expect.arrayContaining(['food', 'wood', 'stone']));
    expect(cache).not.toContain('titanium');
  });

  it('keeps the items, Nova, survivor and season XP of the POI; beacons are unchanged', () => {
    const rng = new Rng(5);
    expect(rollPoiLoot({ data, tier: 2 }, 'hidden_stash', rng).items).toEqual({ medkit: 1 });
    expect(rollPoiLoot({ data, tier: 4 }, 'hive_nest', rng).nova).toBe(8);
    const sci = rollPoiLoot({ data, tier: 5 }, 'stranded_scientists', rng);
    expect(sci.colonist).toBe('rare');
    expect(sci.rp).toBeGreaterThan(1000);
    expect(rollPoiLoot({ data, tier: 3 }, 'beacon', rng)).toEqual({ xp: 15 });
  });

  it('never brings more than 60% of a good’s storage, and skips goods with no storage yet', () => {
    const caps: Record<string, number> = { food: 100, water: 100, wood: 100, stone: 100, fiber: 100 };
    const rng = new Rng(9);
    for (let k = 0; k < 20; k++) {
      const r = rollPoiLoot({ data, tier: 3, capacity: (id) => caps[id] ?? 0 }, 'supply_cache', rng);
      for (const [g, n] of Object.entries(r.resources ?? {})) {
        expect(caps[g]).toBeGreaterThan(0);
        expect(n).toBeLessThanOrEqual(60);
      }
    }
  });

  it('the same seed rolls the same haul', () => {
    const a = rollPoiLoot({ data, tier: 4, capacity: BIG }, 'derelict_freighter', new Rng(99));
    const b = rollPoiLoot({ data, tier: 4, capacity: BIG }, 'derelict_freighter', new Rng(99));
    expect(a).toEqual(b);
  });

  it('a looted POI announces exactly what it granted, scaled to the colony tier', () => {
    const { game } = rig();
    game.state.colony.tier = 3;
    game.bus.emit('colony:tierUp', { tier: 3 });
    game.sys.economy.capacity = () => 1e9; // a Steel colony's storage
    const looted = collectEvents(game, 'world:poiLooted');
    const ship = game.sys.world.gen.pois.find((p) => p.def === 'crashed_ship')!;
    const before = { ...game.state.resources.amounts };
    const rp = game.state.research.points;
    expect(game.sys.world.lootPoi(ship.id)).toBe(true);
    const r = looted[0].reward;
    expect(rewardValue(data, r, 3)).toBeGreaterThan(lootValue(data, 3, POI_LOOT.crashed_ship.minutes) * 0.85);
    for (const [k, n] of Object.entries(r.resources ?? {})) expect(game.state.resources.amounts[k]).toBe((before[k] ?? 0) + (n as number));
    expect(game.state.research.points).toBe(rp + (r.rp ?? 0));
  });
});

describe('long sweeps thin out', () => {
  it('the first hauls of the hour are full, later ones shrink toward a floor', () => {
    for (let n = 0; n < LOOT_FRESH_PER_HOUR; n++) expect(lootThinning(n)).toBe(1);
    expect(lootThinning(LOOT_FRESH_PER_HOUR)).toBeCloseTo(0.8, 6);
    expect(lootThinning(LOOT_FRESH_PER_HOUR + 1)).toBeLessThan(0.8);
    expect(lootThinning(500)).toBe(LOOT_THIN_FLOOR);
  });

  it('sweeping every cache in sight: the goods thin out after a handful, full again an hour later', () => {
    const { game, clock } = rig();
    game.sys.economy.capacity = () => 1e9;
    const looted = collectEvents(game, 'world:poiLooted');
    const w = game.sys.world;
    const caches = w.gen.pois.filter((p) => ['supply_cache', 'hidden_stash', 'abandoned_cabin'].includes(p.def));
    expect(caches.length).toBeGreaterThan(LOOT_FRESH_PER_HOUR + 4);
    for (const c of caches) expect(w.lootPoi(c.id)).toBe(true);
    const worth = (r: Record<string, unknown>) => rewardValue(data, r, 0) / lootValue(data, 0, POI_LOOT[(r as { def: string }).def]?.minutes ?? 1);
    const ratio = looted.map((e, i) => worth({ ...e.reward, def: caches[i].def }));
    expect(Math.min(...ratio.slice(0, LOOT_FRESH_PER_HOUR))).toBeGreaterThan(0.75);
    expect(Math.max(...ratio.slice(-3))).toBeLessThan(0.6);
    expect(game.state.world.lootLog!.length).toBe(caches.length);
    // an hour on, the next haul is full again (and the log only keeps the last hour)
    clock.now += 3_700_000;
    const ship = w.gen.pois.find((p) => p.def === 'mining_outpost')!;
    expect(w.lootPoi(ship.id)).toBe(true);
    expect(game.state.world.lootLog).toEqual([clock.now]);
  });
});

describe('restocking: absolute timers, one-off story POIs', () => {
  it('caches and wrecks restock every 30-60 minutes; vaults, ruins, labs, cabins and rescues never', () => {
    for (const p of data.pois) {
      const restocks = ['supply_cache', 'hidden_stash', 'titanium_cache', 'mining_outpost', 'crashed_ship', 'derelict_freighter', 'alien_nest', 'hive_nest'].includes(p.id);
      if (restocks) {
        expect(p.respawn, p.id).toBeGreaterThanOrEqual(1800);
        expect(p.respawn, p.id).toBeLessThanOrEqual(3600);
      } else expect(p.respawn, p.id).toBe(0);
    }
  });

  it('a cache restocks while the app is closed and shows as restocked on the next launch', () => {
    const { game, clock } = rig();
    const cache = game.sys.world.gen.pois.find((p) => p.def === 'supply_cache')!;
    expect(game.sys.world.lootPoi(cache.id)).toBe(true);
    const s = game.state.world.pois[cache.id];
    expect(s.times).toBe(1);
    expect(s.restockAt).toBe(clock.now + 1800 * 1000);
    expect(game.sys.world.poiRestockLeft(cache.id)).toBeCloseTo(1800, 0);

    // closed for 20 minutes: not yet
    const early = reload(game, clock.now + 20 * 60_000);
    expect(early.game.state.world.pois[cache.id].looted).toBe(true);
    expect(early.game.sys.world.poiRestockLeft(cache.id)).toBeCloseTo(600, 0);
    // closed for 31 minutes: full again on launch, marked as restocked
    const back = reload(game, clock.now + 31 * 60_000);
    const w = back.game.sys.world;
    expect(back.game.state.world.pois[cache.id].looted).toBe(false);
    expect(w.poiRestocked(cache.id)).toBe(true);
    expect(w.poiExplored(cache.id)).toBe(true);
    expect(w.lootPoi(cache.id)).toBe(true);
    expect(back.game.state.world.pois[cache.id].times).toBe(2);
  });

  it('restocks online too, and says when', () => {
    const { game, step } = rig();
    const restocked = collectEvents(game, 'world:poiRestocked');
    const stash = game.sys.world.gen.pois.find((p) => p.def === 'hidden_stash')!;
    expect(game.sys.world.lootPoi(stash.id)).toBe(true);
    step(3590);
    expect(game.sys.world.lootPoi(stash.id)).toBe(false);
    step(15);
    expect(restocked).toEqual([{ id: stash.id, poi: 'hidden_stash' }]);
    expect(game.sys.world.poiRestocked(stash.id)).toBe(true);
  }, 30_000);

  it('story POIs stay one-off however long the colony was away', () => {
    const { game, clock } = rig();
    game.state.colony.tier = 4;
    game.bus.emit('colony:tierUp', { tier: 4 });
    const vault = game.sys.world.gen.pois.find((p) => p.def === 'ancient_vault')!;
    const cabin = game.sys.world.gen.pois.find((p) => p.def === 'abandoned_cabin')!;
    expect(game.sys.world.lootPoi(vault.id)).toBe(true);
    expect(game.sys.world.lootPoi(cabin.id)).toBe(true);
    const back = reload(game, clock.now + 30 * 86_400_000);
    expect(back.game.state.world.pois[vault.id].looted).toBe(true);
    expect(back.game.state.world.pois[cabin.id].looted).toBe(true);
    expect(back.game.sys.world.poiRestockLeft(vault.id)).toBe(Number.POSITIVE_INFINITY);
    expect(back.game.sys.world.lootPoi(vault.id)).toBe(false);
  });

  it('an old save (no restockAt / times) loads, counts its looted POIs as explored and restocks on play time', () => {
    const base = rig();
    const cache = base.game.sys.world.gen.pois.find((p) => p.def === 'supply_cache')!;
    const raw = JSON.parse(serializeState(createInitialState(1234, 1_700_000_000_000)));
    raw.playTime = 5000;
    raw.world.pois = { [cache.id]: { discovered: true, looted: true, lootedAt: 4000 } };
    const state = migrateState(raw);
    const { game, step } = rig(state, 1_700_000_100_000);
    const w = game.sys.world;
    expect(w.poiExplored(cache.id)).toBe(true);
    expect(game.state.world.pois[cache.id].looted).toBe(true);
    expect(w.poiRestockLeft(cache.id)).toBeCloseTo(800, 0);
    step(810);
    expect(game.state.world.pois[cache.id].looted).toBe(false);
    expect(w.poiRestocked(cache.id)).toBe(true);
    expect(w.lootPoi(cache.id)).toBe(true);
    expect(game.state.world.pois[cache.id].times).toBe(1);
  }, 20_000);
});
