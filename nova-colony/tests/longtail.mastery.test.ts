import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { serializeState } from '../src/core/state';
import { createMockServices } from '../src/platform/mock';
import { migrateState } from '../src/platform/saveMigrate';
import { MASTERY_GROWTH, MASTERY_LINES, MASTERY_SOFT_CAP } from '../src/data/mastery';
import { effectiveLevels, masteryBonus, masteryCost, masteryLine, nextBonus, pct, totalMasteryLevels } from '../src/sim/mastery';
import { collect, makeColony, reload, T0 } from './expeditions.helpers';

const line = (id: string) => masteryLine(id)!;

describe('mastery: rules', () => {
  it('six lines from the Stone tier, each a builder-facing stat', () => {
    expect(MASTERY_LINES.map((l) => l.id)).toEqual(['production', 'logistics', 'construction', 'defense', 'crew', 'expeditions']);
    for (const l of MASTERY_LINES) {
      expect(l.tier, l.id).toBeGreaterThanOrEqual(2);
      expect(l.per, l.id).toBeGreaterThan(0);
      expect(l.per, l.id).toBeLessThanOrEqual(0.05);
      expect(l.base, l.id).toBeGreaterThan(0);
    }
    expect(line('production').stat).toBe('production');
    expect(line('logistics').stat).toBe('storage');
  });

  it('each level costs x1.5 the one before; bases grow with the tier a line opens at', () => {
    const p = line('production');
    expect(masteryCost(p, 1)).toBe(p.base);
    expect(masteryCost(p, 2)).toBe(Math.round(p.base * MASTERY_GROWTH));
    expect(masteryCost(p, 11) / masteryCost(p, 10)).toBeCloseTo(1.5, 2);
    expect(line('defense').base).toBeGreaterThan(p.base);
  });

  it('bonus is linear up to the soft cap, then each level adds half', () => {
    const p = line('production');
    expect(effectiveLevels(0)).toBe(0);
    expect(effectiveLevels(MASTERY_SOFT_CAP)).toBe(MASTERY_SOFT_CAP);
    expect(effectiveLevels(MASTERY_SOFT_CAP + 4)).toBe(MASTERY_SOFT_CAP + 2);
    expect(masteryBonus(p, 7)).toBeCloseTo(0.21, 6);
    expect(nextBonus(p, 3)).toBeCloseTo(0.03, 6);
    expect(nextBonus(p, MASTERY_SOFT_CAP)).toBeCloseTo(0.015, 6);
    expect(pct(0.21)).toBe('+21%');
    expect(pct(0.015)).toBe('+1.5%');
    expect(totalMasteryLevels({ production: 3, crew: 2, junk: 9 } as Record<string, number>)).toBe(5);
  });
});

describe('mastery: research system', () => {
  it('spends RP on a level, raises the modifier and counts for the mission chain', () => {
    const rig = makeColony({ tier: 2 });
    const g = rig.game;
    const rs = g.sys.research;
    const eco = g.sys.economy;
    const before = eco.modifier('production');
    const events = collect<{ line: string; level: number }>(g, 'research:mastered');
    g.state.research.points = 10_000;
    expect(rs.masteryOpen()).toBe(true);
    expect(rs.canMaster('production')).toBe(true);
    const cost = rs.masteryCost('production');
    expect(rs.master('production')).toBe(true);
    expect(g.state.research.points).toBe(10_000 - cost);
    expect(rs.masteryLevel('production')).toBe(1);
    expect(events).toEqual([{ line: 'production', level: 1 }]);
    // the add lands in the same (1 + Σadd) bucket as research effects: +0.03 x the happiness / VIP mults
    const after = eco.modifier('production');
    expect(after).toBeGreaterThan(before + 0.029);
    rs.master('production');
    expect(eco.modifier('production') - after).toBeCloseTo(after - before, 6);
    // the side chain opened with Mastery and counts the level
    expect(g.state.missions.counters['mastery:*']).toBe(2);
    expect(g.state.missions.counters['mastery:production']).toBe(2);
  });

  it('a line waits for its tier; not enough RP is refused without spending', () => {
    const rig = makeColony({ tier: 2 });
    const g = rig.game;
    const rs = g.sys.research;
    g.state.research.points = 100_000;
    expect(rs.canMaster('defense')).toBe(false); // opens at Steel
    expect(rs.master('defense')).toBe(false);
    expect(g.state.research.points).toBe(100_000);
    g.state.research.points = 5;
    expect(rs.master('production')).toBe(false);
    expect(g.state.research.points).toBe(5);
    g.state.colony.tier = 1;
    expect(rs.masteryOpen()).toBe(false);
    expect(rs.masteryInfo().every((m) => !m.open)).toBe(true);
  });

  it('logistics raises storage, crew raises work speed, expeditions raise the haul', () => {
    const rig = makeColony({ tier: 3 });
    const g = rig.game;
    const rs = g.sys.research;
    const eco = g.sys.economy;
    eco.recompute();
    const cap0 = eco.capacity('wood');
    const crew0 = eco.modifier('workSpeed');
    const c = g.state.colonists.list[0];
    const prod0 = g.sys.colonists.productivity(c);
    g.state.research.points = 1e7;
    for (let i = 0; i < 4; i++) rs.master('logistics');
    for (let i = 0; i < 3; i++) rs.master('crew');
    eco.recompute();
    expect(eco.capacity('wood')).toBeGreaterThan(cap0);
    expect(eco.modifier('workSpeed')).toBeCloseTo(crew0 + 0.09, 6);
    expect(g.sys.colonists.productivity(c)).toBeCloseTo(prod0 * (crew0 + 0.09) / crew0, 4);
    const dest = g.data.expeditions[0].id;
    const squad = g.state.colonists.list.slice(0, 2).map((x) => x.id);
    const v0 = g.sys.expeditions.preview(dest, squad)!.value;
    for (let i = 0; i < 5; i++) rs.master('expeditions');
    eco.markDirty();
    expect(g.sys.expeditions.preview(dest, squad)!.value).toBeCloseTo(v0 * 1.2, 4);
  });

  it('levels survive a save and load; an old save without mastery loads at zero', () => {
    const rig = makeColony({ tier: 2 });
    const g = rig.game;
    g.state.research.points = 1e6;
    g.sys.research.master('construction');
    g.sys.research.master('construction');
    const back = reload(rig);
    expect(back.game.sys.research.masteryLevel('construction')).toBe(2);
    expect(back.game.sys.economy.modifier('buildSpeed')).toBeGreaterThan(1.09);

    const raw = JSON.parse(serializeState(g.state));
    delete raw.research.mastery;
    const state = migrateState(raw);
    expect(state.research.mastery).toEqual({});
    const old = new Game({ state, services: createMockServices(), clock: () => T0 });
    old.start();
    old.update(0.25);
    expect(old.sys.research.masteryLevel('construction')).toBe(0);
    expect(old.sys.research.masteryInfo()).toHaveLength(MASTERY_LINES.length);
    // junk in the slot reads as zero
    old.state.research.mastery = { production: -3, logistics: Number.NaN as unknown as number } as Record<string, number>;
    expect(old.sys.research.masteryLevel('production')).toBe(0);
    expect(old.sys.research.masteryLevel('logistics')).toBe(0);
  });
});
