import { describe, expect, it } from 'vitest';
import { createDataRegistry } from '../src/data';
import type { WishDef, WishKind } from '../src/data/schema';
import { giveAmount, referenceRate, thankYouGift } from '../src/sim/wish/rules';

const data = createDataRegistry();
const R = data.wishRules;
const KINDS: WishKind[] = ['give', 'build', 'craft', 'chat', 'explore'];
const professions = new Set(data.professions.map((p) => p.id));
const traits = new Set(data.traits.map((t) => t.id));
const value = data.expeditionRules.value;

/** Tiers a wish can be voiced at. */
function tiersOf(w: WishDef): number[] {
  const out: number[] = [];
  for (let t = w.minTier; t <= (w.maxTier ?? 6); t++) out.push(t);
  return out;
}

/** Worth of a bag in wood-equivalents (the expedition yardstick). */
function worth(bag: Record<string, number | undefined>): number {
  return Object.entries(bag).reduce((s, [k, v]) => s + (v ?? 0) * (value[k] ?? 1), 0);
}

/** A reference colony's output per minute at a tier, in wood-equivalents (research points excluded). */
function outputWorth(tier: number): number {
  const ref = data.expeditionRules.reference[tier];
  return Object.entries(ref).reduce((s, [k, v]) => (k === 'rp' ? s : s + v * (value[k] ?? 1)), 0);
}

describe('wishes.data — the pool', () => {
  it('30–50 wishes with unique ids, every kind present', () => {
    expect(data.wishes.length).toBeGreaterThanOrEqual(30);
    expect(data.wishes.length).toBeLessThanOrEqual(50);
    expect(new Set(data.wishes.map((w) => w.id)).size).toBe(data.wishes.length);
    for (const k of KINDS) expect(data.wishes.some((w) => w.kind === k), k).toBe(true);
    for (const w of data.wishes) expect(data.wish(w.id)).toBe(w);
  });

  it('every wish has its words, an icon, a positive weight and a sane tier window', () => {
    for (const w of data.wishes) {
      expect(KINDS, w.id).toContain(w.kind);
      expect(w.title.length, `${w.id} title`).toBeGreaterThan(3);
      expect(w.title.length, `${w.id} title`).toBeLessThanOrEqual(26);
      expect(w.text.length, `${w.id} text`).toBeGreaterThan(20);
      expect(w.text.length, `${w.id} text`).toBeLessThanOrEqual(110);
      expect(w.icon.length, `${w.id} icon`).toBeGreaterThan(0);
      expect(w.weight, `${w.id} weight`).toBeGreaterThan(0);
      expect(Number.isInteger(w.minTier) && w.minTier >= 0 && w.minTier <= 6, `${w.id} minTier`).toBe(true);
      if (w.maxTier != null) expect(w.maxTier, `${w.id} maxTier`).toBeGreaterThanOrEqual(w.minTier);
      // give wishes say how many; nobody else has a number to fill in
      expect(w.text.includes('{n}'), `${w.id} {n}`).toBe(w.kind === 'give');
      for (const p of w.likes?.professions ?? []) expect(professions.has(p), `${w.id} likes ${p}`).toBe(true);
      for (const t of w.likes?.traits ?? []) expect(traits.has(t), `${w.id} likes trait ${t}`).toBe(true);
    }
  });

  it('every tier offers plenty to wish for, including something to give and someone to chat with', () => {
    for (let t = 0; t <= 6; t++) {
      const here = data.wishes.filter((w) => tiersOf(w).includes(t));
      expect(here.length, `tier ${t}`).toBeGreaterThanOrEqual(10);
      expect(here.some((w) => w.kind === 'give'), `give @${t}`).toBe(true);
      expect(here.some((w) => w.kind === 'chat'), `chat @${t}`).toBe(true);
      expect(here.some((w) => w.kind === 'build'), `build @${t}`).toBe(true);
    }
  });
});

describe('wishes.data — achievable at their tier, within a few minutes', () => {
  it('give: a real resource the reference colony makes at every tier it is voiced, a few minutes of it, fitting storage', () => {
    for (const w of data.wishes.filter((x) => x.kind === 'give')) {
      expect(data.resource(w.target), `${w.id} target ${w.target}`).toBeTruthy();
      for (const t of tiersOf(w)) {
        const per = referenceRate(data, t, w.target);
        expect(per, `${w.id}: nobody makes ${w.target} at tier ${t}`).toBeGreaterThan(0);
        const storage = data.expeditionRules.referenceStorage[t][w.target] ?? data.resource(w.target)!.baseCapacity;
        const n = giveAmount(data, w, t, storage);
        expect(n, `${w.id} @${t}`).toBeGreaterThanOrEqual(R.giveMin);
        expect(n, `${w.id} @${t} fits storage`).toBeLessThanOrEqual(storage * R.giveCapShare);
        // a couple of minutes of production: never more than ~10 minutes even where output is tiny
        expect(n / per, `${w.id} @${t}: ${n} = ${(n / per).toFixed(1)} min`).toBeLessThanOrEqual(10);
      }
    }
  });

  it('build: a real building, unlocked by its tier, small and cheap enough to place right away', () => {
    for (const w of data.wishes.filter((x) => x.kind === 'build')) {
      const b = data.building(w.target);
      expect(b, `${w.id} target ${w.target}`).toBeTruthy();
      expect(b!.unlockTier, `${w.id}: ${w.target} unlocks at ${b!.unlockTier}`).toBeLessThanOrEqual(w.minTier);
      if (b!.research) expect(data.researchDef(b!.research), `${w.id} research`).toBeTruthy();
      expect(b!.piece, `${w.id}: no structure pieces`).toBeFalsy();
      expect(b!.size[0] * b!.size[1], `${w.id} footprint`).toBeLessThanOrEqual(16);
      expect(b!.buildTime, `${w.id} build time`).toBeLessThanOrEqual(15);
      expect(w.upTo ?? R.buildUpTo, `${w.id} upTo`).toBeGreaterThanOrEqual(1);
      for (const t of tiersOf(w)) {
        const cost = worth(b!.cost);
        expect(cost / outputWorth(t), `${w.id} @${t} costs ${cost.toFixed(0)}`).toBeLessThanOrEqual(10);
      }
    }
  });

  it('craft: a real recipe from a station available by its tier, quick, no item inputs, no vehicles', () => {
    for (const w of data.wishes.filter((x) => x.kind === 'craft')) {
      const r = data.recipe(w.target);
      expect(r, `${w.id} target ${w.target}`).toBeTruthy();
      expect(r!.unlockTier, `${w.id}: ${w.target} unlocks at ${r!.unlockTier}`).toBeLessThanOrEqual(w.minTier);
      if (r!.research) expect(data.researchDef(r!.research), `${w.id} research`).toBeTruthy();
      expect(r!.outputs.vehicle, `${w.id} vehicle`).toBeFalsy();
      expect(Object.keys(r!.itemInputs ?? {}).length, `${w.id} item inputs`).toBe(0);
      expect(r!.time, `${w.id} craft time`).toBeLessThanOrEqual(60);
      if (r!.station !== 'hand') {
        const stations = data.buildings.filter((b) => b.station === r!.station);
        expect(stations.length, `${w.id} station ${r!.station}`).toBeGreaterThan(0);
        expect(Math.min(...stations.map((b) => b.unlockTier)), `${w.id} station tier`).toBeLessThanOrEqual(w.minTier);
      }
      for (const t of tiersOf(w)) {
        for (const [res, n] of Object.entries(r!.inputs)) {
          const per = referenceRate(data, t, res);
          expect(per, `${w.id} @${t}: ${res} is not made yet`).toBeGreaterThan(0);
          expect((n ?? 0) / per, `${w.id} @${t}: ${n} ${res}`).toBeLessThanOrEqual(10);
        }
      }
    }
  });

  it('chat and explore need no target', () => {
    for (const w of data.wishes.filter((x) => x.kind === 'chat' || x.kind === 'explore')) expect(w.target, w.id).toBe('');
  });
});

describe('wishes.data — rules and rewards stay cozy and small', () => {
  it('cadence, cap, expiry, mood and hearts match the design', () => {
    expect(R.interval[0]).toBeGreaterThanOrEqual(8 * 60);
    expect(R.interval[1]).toBeLessThanOrEqual(12 * 60);
    expect(R.interval[0]).toBeLessThan(R.interval[1]);
    expect(R.firstDelay[0]).toBeLessThan(R.firstDelay[1]);
    expect(R.firstDelay[1]).toBeLessThanOrEqual(R.interval[0]);
    expect(R.maxOpen).toBe(2);
    expect(R.expire).toBeGreaterThanOrEqual(40 * 60);
    expect(R.expire).toBeLessThanOrEqual(50 * 60);
    expect(R.retry).toBeGreaterThan(0);
    expect(R.hearts).toBe(5);
    expect(R.mood.value).toBeGreaterThan(0);
    expect(R.mood.value).toBeLessThanOrEqual(10);
    expect(R.mood.hours).toBeGreaterThanOrEqual(2);
    expect(R.mood.hours).toBeLessThanOrEqual(6);
    expect(R.perks.productivityHearts).toBeLessThan(R.perks.bestFriendsHearts);
    expect(R.perks.bestFriendsHearts).toBeLessThanOrEqual(R.hearts);
    expect(R.perks.productivity).toBeLessThanOrEqual(0.1);
    expect(R.perks.bestFriendsHappiness).toBeLessThanOrEqual(5);
    expect(R.reward.novaChance).toBeLessThanOrEqual(0.15);
    expect(R.reward.nova[1]).toBeLessThanOrEqual(2);
    expect(R.reward.pool.length).toBe(7);
  });

  it('a thank-you gift is a few minutes of colony output at every tier, never large', () => {
    for (let t = 0; t <= 6; t++) {
      for (const id of R.reward.pool[t]) expect(data.resource(id), `pool ${t}: ${id}`).toBeTruthy();
      for (let s = 1; s <= 40; s++) {
        const gift = thankYouGift(data, t, s * 104729);
        const minutes = worth(gift.resources ?? {}) / outputWorth(t);
        expect(minutes, `tier ${t} seed ${s}: ${JSON.stringify(gift.resources)}`).toBeLessThanOrEqual(6);
        expect(Object.keys(gift.resources ?? {}).length).toBeGreaterThanOrEqual(1);
        expect(gift.xp ?? 0).toBeLessThanOrEqual(20);
      }
    }
  });
});
