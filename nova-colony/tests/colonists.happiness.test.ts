import { describe, expect, it } from 'vitest';
import { cellIndex } from '../src/core/constants';
import type { Colonist } from '../src/core/state';
import { addBuilding, addColonist, makeGame } from './colonists.util';

type H = ReturnType<typeof makeGame>;

function factor(h: H, c: Colonist, label: string) {
  const f = h.game.sys.colonists.happinessFactors(c).find((x) => x.label === label);
  if (!f) throw new Error(`no factor ${label}`);
  return f;
}
const sum = (h: H, c: Colonist) => h.game.sys.colonists.happinessFactors(c).reduce((s, f) => s + f.value, 0);

/** A colony with one bed and plenty of food & water. */
function snug(): { h: H; c: Colonist } {
  const h = makeGame();
  addBuilding(h.game, 'shelter', 130, 130); // housing 2, comfort 1
  h.game.state.resources.amounts.food = 100;
  h.game.state.resources.amounts.water = 100;
  const c = addColonist(h.game, 'common', { trait: 'plain' });
  return { h, c };
}

describe('happiness', () => {
  it('breaks the target down by source and the parts add up to the target', () => {
    const { h, c } = snug();
    const b = h.game.data.balance.happiness;
    expect(factor(h, c, 'Cozy start')).toMatchObject({ value: b.base, ok: true });
    expect(factor(h, c, 'Has a bed')).toMatchObject({ value: b.bed, ok: true });
    expect(factor(h, c, 'Well fed')).toMatchObject({ value: b.food, ok: true });
    expect(factor(h, c, 'Fresh water')).toMatchObject({ value: b.water, ok: true });
    expect(factor(h, c, 'Power on')).toMatchObject({ value: b.power, ok: true });
    expect(factor(h, c, 'Comfort').value).toBeCloseTo(b.comfortPerPoint * 1, 5); // the shelter's comfort 1 for one colonist
    expect(factor(h, c, 'Feels safe')).toMatchObject({ value: 0, ok: false });
    expect(sum(h, c)).toBeCloseTo(h.game.sys.colonists.happinessTarget(c), 5);
  });

  it('missing needs only shrink the bonus — it never drops below the base', () => {
    const { h, c } = snug();
    const b = h.game.data.balance.happiness;
    const full = h.game.sys.colonists.happinessTarget(c);
    h.game.state.resources.amounts.food = 0;
    expect(factor(h, c, 'Well fed')).toMatchObject({ value: 0, ok: false });
    expect(h.game.sys.colonists.happinessTarget(c)).toBeCloseTo(full - b.food, 5);
    h.game.state.resources.amounts.water = 0;
    h.game.sys.colonists.assign(c.id, null);
    h.game.state.colonists.list[0].bed = null;
    expect(h.game.sys.colonists.happinessTarget(c)).toBeGreaterThanOrEqual(b.base);
    h.run(60);
    expect(c.happiness).toBeGreaterThanOrEqual(b.base - 1); // nobody sinks below their cozy start
  });

  it('uses economy.isShort when the economy provides it', () => {
    const { h, c } = snug();
    const eco = h.game.sys.economy as unknown as { isShort?: (id: string) => boolean };
    eco.isShort = (id) => id === 'food';
    expect(factor(h, c, 'Well fed').ok).toBe(false);
    expect(factor(h, c, 'Fresh water').ok).toBe(true);
  });

  it('power counts when satisfied or when nothing consumes it', () => {
    const { h, c } = snug();
    h.game.derived.power = { produced: 0, consumed: 20, ratio: 0.5 };
    expect(factor(h, c, 'Power on').ok).toBe(false);
    h.game.derived.power = { produced: 25, consumed: 20, ratio: 1 };
    expect(factor(h, c, 'Power on').ok).toBe(true);
    h.game.derived.power = { produced: 0, consumed: 0, ratio: 0 };
    expect(factor(h, c, 'Power on').ok).toBe(true);
  });

  it('a bed inside a roofed room adds a cozy bonus', () => {
    const { h, c } = snug();
    const before = h.game.sys.colonists.happinessTarget(c);
    h.game.derived.roofCells.add(cellIndex(130, 130));
    h.game.sys.colonists.refresh();
    expect(factor(h, c, 'Cozy room').ok).toBe(true);
    expect(h.game.sys.colonists.happinessTarget(c)).toBeGreaterThan(before);
  });

  it('comfort and entertainment scale with decor per colonist and are capped', () => {
    const { h, c } = snug();
    const b = h.game.data.balance.happiness;
    addBuilding(h.game, 'bench', 134, 130); // comfort 2, entertainment 2
    expect(factor(h, c, 'Comfort').value).toBeCloseTo(b.comfortPerPoint * 3, 5);
    expect(factor(h, c, 'Entertainment').value).toBeCloseTo(b.entertainmentPerPoint * 2, 5);
    // a second colonist halves the per-colonist share
    addColonist(h.game, 'common');
    expect(factor(h, c, 'Comfort').value).toBeCloseTo((b.comfortPerPoint * 3) / 2, 5);
    // lots of decor hits the cap
    for (let i = 0; i < 20; i++) addBuilding(h.game, 'bench', 140 + i, 134);
    expect(factor(h, c, 'Comfort').value).toBe(b.comfortMax);
    expect(factor(h, c, 'Entertainment').value).toBe(b.entertainmentMax);
  });

  it('safety needs an active turret; medical needs a medical building', () => {
    const { h, c } = snug();
    const b = h.game.data.balance.happiness;
    addBuilding(h.game, 'scrap_turret', 140, 130, { status: 'building' });
    expect(factor(h, c, 'Feels safe').ok).toBe(false);
    addBuilding(h.game, 'scrap_turret', 142, 130);
    expect(factor(h, c, 'Feels safe')).toMatchObject({ value: b.safety, ok: true });
    expect(factor(h, c, 'Medical care').ok).toBe(false);
    addBuilding(h.game, 'med_bay', 150, 130);
    expect(factor(h, c, 'Medical care')).toMatchObject({ value: b.medical, ok: true });
  });

  it('trait happiness is included and the target is clamped to 0..100', () => {
    const { h, c } = snug();
    c.trait = 'cheerful'; // +10
    expect(factor(h, c, 'Cheerful')).toMatchObject({ value: 10, ok: true });
    addBuilding(h.game, 'med_bay', 150, 130);
    addBuilding(h.game, 'scrap_turret', 142, 130);
    for (let i = 0; i < 6; i++) addBuilding(h.game, 'bench', 140 + i, 134);
    expect(sum(h, c)).toBeGreaterThan(100);
    expect(h.game.sys.colonists.happinessTarget(c)).toBe(100);
  });

  it('drifts smoothly toward the target and maintains derived averages', () => {
    const { h, c } = snug();
    const target = h.game.sys.colonists.happinessTarget(c);
    expect(c.happiness).toBe(60);
    h.run(2);
    expect(c.happiness).toBeGreaterThan(60);
    expect(c.happiness).toBeLessThan(target);
    h.run(60);
    expect(c.happiness).toBeCloseTo(target, 0);
    const d = addColonist(h.game, 'common', { trait: 'plain' });
    h.run(1);
    const avg = (c.happiness + d.happiness) / 2;
    expect(h.game.derived.happiness.average).toBeCloseTo(avg, 5);
    expect(h.game.derived.happiness.productivity).toBeCloseTo(1 + Math.max(0, avg - 50) / 100, 5);
  });
});

describe('productivity', () => {
  it('follows (1 + specialty + skill + trait) x (1 + happiness bonus)', () => {
    const h = makeGame();
    const farm = addBuilding(h.game, 'berry_patch', 130, 130); // farmer job
    const b = h.game.data.balance;
    const c = addColonist(h.game, 'epic', { specialty: 'farmer', skill: 3, trait: 'hardworking' }); // +0.15
    expect(c.workplace).toBe(farm.id);
    c.happiness = 70;
    const expected = (1 + b.specialtyBonus + 2 * b.skillBonusPerLevel + 0.15) * 1.2;
    expect(h.game.sys.colonists.productivity(c)).toBeCloseTo(expected, 5);
    // no specialty match -> no specialty bonus
    c.specialty = 'cook';
    expect(h.game.sys.colonists.productivity(c)).toBeCloseTo((1 + 2 * b.skillBonusPerLevel + 0.15) * 1.2, 5);
    // unemployed colonists never get the specialty bonus either
    h.game.sys.colonists.assign(c.id, null);
    c.specialty = 'farmer';
    expect(h.game.sys.colonists.productivity(c)).toBeCloseTo((1 + 2 * b.skillBonusPerLevel + 0.15) * 1.2, 5);
  });

  it('is never below 1 — even when unhappy or with a harsh trait', () => {
    const h = makeGame();
    addBuilding(h.game, 'berry_patch', 130, 130);
    for (const happiness of [0, 25, 50, 51, 100]) {
      for (const trait of ['grumpy', 'plain', 'genius']) {
        const c = addColonist(h.game, 'common', { trait, happiness });
        c.happiness = happiness;
        expect(h.game.sys.colonists.productivity(c)).toBeGreaterThanOrEqual(1);
      }
    }
    const grumpy = addColonist(h.game, 'common', { trait: 'grumpy' });
    grumpy.happiness = 0;
    expect(h.game.sys.colonists.productivity(grumpy)).toBe(1);
  });

  it('happy colonists are more productive', () => {
    const h = makeGame();
    const c = addColonist(h.game, 'common', { trait: 'plain' });
    c.happiness = 50;
    const low = h.game.sys.colonists.productivity(c);
    c.happiness = 100;
    expect(h.game.sys.colonists.productivity(c)).toBeCloseTo(low * 1.5, 5);
  });
});
