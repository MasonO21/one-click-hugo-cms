import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { serializeState } from '../src/core/state';
import { createMockServices } from '../src/platform/mock';
import { migrateState } from '../src/platform/saveMigrate';
import { SPIRIT_RULES } from '../src/data/spirit';
import { festivalProductionMult, minutesToFull, spiritRate } from '../src/sim/colony/spiritRules';
import { tierCrate } from '../src/sim/chests';
import { collect, HOUR, makeColony, reload, T0, type Colony } from './expeditions.helpers';

const R = SPIRIT_RULES;

/**
 * Advance only the spirit clock in 1 s steps with the colony's happiness pinned (the rest of the simulation stands
 * still, so nothing else moves the average).
 */
function tickSpirit(rig: Colony, seconds: number, happiness = 100): void {
  const g = rig.game;
  for (let i = 0; i < seconds; i++) {
    g.state.playTime += 1;
    rig.clock.now += 1000;
    g.derived.happiness.average = happiness;
    g.sys.spirit.update(1);
  }
}

function plainColony(tier = 2): Colony {
  const rig = makeColony({ tier, tower: false });
  // no decor, wishes or hearts: the bare rate
  rig.game.sys.colonists.amenities = () => ({ comfort: 0, entertainment: 0, medical: 0 });
  rig.game.state.wishes.bonds = {};
  return rig;
}

describe('spirit: rules', () => {
  it('fills only above the happiness threshold, scaled by how far above it is', () => {
    expect(spiritRate({ happiness: 75, amenity: 0, medical: 0, hearts: 0 }).perMinute).toBe(0);
    expect(spiritRate({ happiness: 60, amenity: 5, medical: 3, hearts: 10 }).perMinute).toBe(0);
    expect(spiritRate({ happiness: 100, amenity: 0, medical: 0, hearts: 0 }).perMinute).toBeCloseTo(R.perMinute, 6);
    expect(spiritRate({ happiness: 87.5, amenity: 0, medical: 0, hearts: 0 }).perMinute).toBeCloseTo(R.perMinute / 2, 6);
  });

  it('decor and fun, medical care and friendships speed it up, each to a cap', () => {
    const r = spiritRate({ happiness: 100, amenity: 3, medical: 2, hearts: 5 });
    expect(r.amenity).toBeCloseTo(0.3, 6);
    expect(r.medical).toBeCloseTo(0.1, 6);
    expect(r.friendship).toBeCloseTo(0.1, 6);
    expect(r.perMinute).toBeCloseTo(R.perMinute * 1.5, 6);
    const max = spiritRate({ happiness: 100, amenity: 99, medical: 99, hearts: 999 });
    expect(max.perMinute).toBeCloseTo(R.perMinute * (1 + R.amenityMax + R.medicalMax + R.heartsMax), 6);
    expect(minutesToFull(R.full - 60, 1.5)).toBeCloseTo(40, 6);
    expect(minutesToFull(10, 0)).toBe(Infinity);
    expect(minutesToFull(R.full, 0)).toBe(0);
  });

  it('an engaged mid-game colony sees a festival about every 40-60 online minutes', () => {
    // happiness ~98, ~3 decor points per colonist, 8 hearts, a wish every ~15 min
    const r = spiritRate({ happiness: 98, amenity: 3, medical: 0, hearts: 8 });
    const perHour = r.perMinute * 60 + 4 * R.wish;
    const cycle = (R.full / perHour) * 60 + R.festival.seconds / 60;
    expect(cycle).toBeGreaterThan(40);
    expect(cycle).toBeLessThan(65);
  });
});

describe('spirit: festivals', () => {
  it('quiet before the Reinforced tier; fills while happy and online', () => {
    const rig = plainColony(0);
    tickSpirit(rig, 600);
    expect(rig.game.state.spirit.meter).toBe(0);
    rig.game.state.colony.tier = 2;
    tickSpirit(rig, 600, 100);
    expect(rig.game.state.spirit.meter).toBeCloseTo(10 * R.perMinute, 0);
    const m = rig.game.state.spirit.meter;
    tickSpirit(rig, 600, 70); // not happy enough
    expect(rig.game.state.spirit.meter).toBe(m);
  });

  it('a granted wish adds a chunk', () => {
    const rig = plainColony();
    const c = rig.game.state.colonists.list[0];
    rig.game.bus.emit('wish:granted', { id: 1, colonist: c.id, def: 'chat_story', kind: 'chat', tier: 2, hearts: 1, reward: {} });
    expect(rig.game.state.spirit.meter).toBe(R.wish);
  });

  it('full meter: a festival with +25% production online only, a festival chest, the side mission and the crowd', () => {
    const rig = plainColony();
    const g = rig.game;
    const eco = g.sys.economy;
    const started = collect<{ n: number }>(g, 'spirit:festival');
    const ended = collect<{ n: number }>(g, 'spirit:festivalEnded');
    const prod0 = eco.modifier('production');
    const off0 = eco.offlineModel();
    g.state.spirit.meter = R.full - 0.01;
    tickSpirit(rig, 2);
    expect(started).toHaveLength(1);
    expect(g.sys.spirit.active()).toBe(true);
    expect(g.state.spirit.meter).toBe(0);
    expect(g.state.spirit.festivals).toBe(1);
    expect(festivalProductionMult(g.state)).toBe(R.festival.production);
    eco.markDirty();
    expect(eco.modifier('production')).toBeCloseTo(prod0 * R.festival.production, 6);
    // offline production never includes it (like the ad boosts)
    expect(eco.offlineModel().flows.map((f) => f.outs)).toEqual(off0.flows.map((f) => f.outs));
    // the festival chest: the tier's supply crates and (Stone+) a Supply Cache
    expect(g.state.player.items[tierCrate(2)] ?? 0).toBeGreaterThanOrEqual(R.festival.crates);
    expect(g.state.player.items.chest_supply ?? 0).toBeGreaterThanOrEqual(1);
    expect(g.state.missions.counters['festival:*']).toBe(1);
    // everyone gathers in free ground round the fire, each on their own spot
    const spots = new Set<string>();
    const p = { x: 0, z: 0 };
    g.state.colonists.list.forEach((c, i) => {
      expect(g.sys.spirit.slotFor(i, p)).toBe(true);
      spots.add(`${p.x.toFixed(2)},${p.z.toFixed(2)}`);
      expect(Math.hypot(p.x - g.state.spirit.fx, p.z - g.state.spirit.fz)).toBeLessThan(12);
      expect(g.sys.buildings.blocked(Math.floor(p.x / 2), Math.floor(p.z / 2), 'colonist')).toBe(false);
    });
    expect(spots.size).toBe(g.state.colonists.list.length);
    // the meter does not fill during a festival; it ends after its online minutes
    tickSpirit(rig, R.festival.seconds - 5);
    expect(g.sys.spirit.active()).toBe(true);
    expect(g.state.spirit.meter).toBe(0);
    tickSpirit(rig, 10);
    expect(g.sys.spirit.active()).toBe(false);
    expect(ended).toHaveLength(1);
    eco.markDirty();
    expect(eco.modifier('production')).toBeCloseTo(prod0, 6);
  });

  it('waits for peace: no festival during an alien warning or attack', () => {
    const rig = plainColony();
    const g = rig.game;
    g.state.spirit.meter = R.full;
    g.state.combat.phase = 'attack';
    tickSpirit(rig, 30);
    expect(g.sys.spirit.active()).toBe(false);
    expect(g.state.spirit.meter).toBe(R.full);
    g.state.combat.phase = 'peace';
    tickSpirit(rig, 2);
    expect(g.sys.spirit.active()).toBe(true);
  });

  it('colonists drop what they are doing and celebrate, then go back to their day', () => {
    const rig = makeColony({ tier: 2, tower: false });
    const g = rig.game;
    g.state.time.dayTime = 0.45;
    g.sys.spirit.startNow();
    for (let i = 0; i < 40; i++) {
      g.state.time.dayTime = 0.45;
      rig.step(1);
    }
    const acts = g.state.colonists.list.map((c) => c.activity);
    expect(acts.filter((a) => a === 'celebrating' || a === 'walking').length).toBe(acts.length);
    expect(acts.filter((a) => a === 'celebrating').length).toBeGreaterThan(0);
    g.state.spirit.festivalUntil = g.state.playTime; // over
    for (let i = 0; i < 6; i++) {
      g.state.time.dayTime = 0.45;
      rig.step(1);
    }
    expect(g.state.colonists.list.some((c) => c.activity === 'celebrating')).toBe(false);
  });

  it('nothing moves while the app is closed: a festival resumes where it was, the meter keeps its value', () => {
    const rig = plainColony();
    const g = rig.game;
    g.sys.spirit.startNow();
    tickSpirit(rig, 120);
    const left = g.sys.spirit.left();
    const back = reload(rig, rig.clock.now + 5 * HOUR);
    expect(back.game.sys.spirit.active()).toBe(true);
    expect(back.game.sys.spirit.left()).toBeCloseTo(left, 0);
    expect(back.game.state.spirit.festivals).toBe(1);
  });

  it('an old save without the slice loads with an empty meter; junk is repaired', () => {
    const rig = plainColony();
    const raw = JSON.parse(serializeState(rig.game.state));
    delete raw.spirit;
    const state = migrateState(raw);
    expect(state.spirit).toEqual({ meter: 0, festivalUntil: 0, fx: 0, fz: 0, festivals: 0 });
    const g = new Game({ state, services: createMockServices(), clock: () => T0 });
    g.start();
    g.update(0.25);
    expect(g.sys.spirit.active()).toBe(false);

    const junk = JSON.parse(serializeState(rig.game.state));
    junk.spirit = { meter: 9999, festivalUntil: 1e12, fx: 'x', festivals: -2 };
    const g2 = new Game({ state: migrateState(junk), services: createMockServices(), clock: () => T0 });
    g2.start();
    expect(g2.state.spirit.meter).toBe(R.full);
    expect(g2.state.spirit.festivals).toBe(0);
    expect(g2.state.spirit.fx).toBe(0);
    expect(g2.sys.spirit.left()).toBeLessThanOrEqual(R.festival.seconds);
  });
});
