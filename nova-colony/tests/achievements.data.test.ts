/**
 * Achievements — content integrity: stable unique ids, tiered lines that climb, sources the game really produces,
 * valid and modest rewards (Nova capped), art that exists.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDataRegistry } from '../src/data';
import { ACHIEVEMENT_CATEGORIES } from '../src/data/achievements';
import type { AchievementDef, BuildingCategory } from '../src/data/schema';
import { COUNTED_TYPES, METRICS } from '../src/sim/meta/achievementRules';

const data = createDataRegistry();
const ALL = data.achievements;
const resIds = new Set(data.resources.map((r) => r.id));
const itemIds = new Set(data.items.map((i) => i.id));
const buildingIds = new Set(data.buildings.map((b) => b.id));
const buildingCats = new Set<BuildingCategory>(data.buildings.map((b) => b.category));
const recipeIds = new Set(data.recipes.map((r) => r.id));
const researchIds = new Set(data.research.map((r) => r.id));
const alienIds = new Set(data.aliens.map((a) => a.id));
const biomeIds = new Set(data.biomes.map((b) => b.id));
const poiIds = new Set(data.pois.map((p) => p.id));
const expeditionIds = new Set(data.expeditions.map((e) => e.id));
const rarities = new Set(['common', 'rare', 'epic', 'legendary']);

const lines = (): Map<string, AchievementDef[]> => {
  const m = new Map<string, AchievementDef[]>();
  for (const d of ALL) m.set(d.line, [...(m.get(d.line) ?? []), d]);
  return m;
};

describe('achievements.data — shape', () => {
  it('has ~50-65 achievements', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(50);
    expect(ALL.length).toBeLessThanOrEqual(65);
  });

  it('ids are unique, stable-looking `ach_*` and derived from the line and medal', () => {
    const seen = new Set<string>();
    for (const d of ALL) {
      expect(d.id, d.id).toMatch(/^ach_[a-z0-9]+(_[a-z0-9]+)*$/);
      expect(seen.has(d.id), `duplicate ${d.id}`).toBe(false);
      seen.add(d.id);
      expect(d.id).toBe(d.medal === 'special' ? `ach_${d.line}` : `ach_${d.line}_${d.medal}`);
      expect(data.achievement(d.id)).toBe(d);
    }
  });

  it('every achievement has a cozy name, a one-line description and an emoji', () => {
    for (const d of ALL) {
      expect(d.name.trim().length, d.id).toBeGreaterThan(2);
      expect(d.name.length, `${d.id} name too long for a phone card`).toBeLessThanOrEqual(24);
      expect(d.description, d.id).not.toMatch(/\n|\{n\}|undefined|NaN/);
      expect(d.description.length, `${d.id} description`).toBeGreaterThan(8);
      expect(d.description.length, `${d.id} description too long`).toBeLessThanOrEqual(64);
      expect(d.icon.length, d.id).toBeGreaterThan(0);
    }
  });

  it('every category is real and has something in it; the data and the section list agree', () => {
    const cats = new Set(ACHIEVEMENT_CATEGORIES.map((c) => c.id));
    expect(cats.size).toBe(ACHIEVEMENT_CATEGORIES.length);
    for (const d of ALL) expect(cats.has(d.category), `${d.id} category`).toBe(true);
    for (const c of ACHIEVEMENT_CATEGORIES) expect(ALL.filter((d) => d.category === c.id).length, c.id).toBeGreaterThanOrEqual(3);
  });

  it('is listed in category order (the journal draws it straight through)', () => {
    const order = ACHIEVEMENT_CATEGORIES.map((c) => c.id);
    let last = 0;
    for (const d of ALL) {
      const i = order.indexOf(d.category);
      expect(i, d.id).toBeGreaterThanOrEqual(last);
      last = i;
    }
  });

  it('a line keeps its three medals together, and shares one name, category, source and unit', () => {
    for (const [line, defs] of lines()) {
      if (defs.length === 1) {
        expect(defs[0].medal, line).toBe('special');
        continue;
      }
      expect(defs.map((d) => d.medal), line).toEqual(['bronze', 'silver', 'gold']);
      for (const d of defs) {
        expect(d.name).toBe(defs[0].name);
        expect(d.category).toBe(defs[0].category);
        expect(d.source).toEqual(defs[0].source);
        expect(d.unit).toBe(defs[0].unit);
      }
    }
  });

  it('thresholds are positive and strictly increasing within a line', () => {
    for (const [line, defs] of lines()) {
      for (const d of defs) expect(d.target > 0 && Number.isFinite(d.target), d.id).toBe(true);
      for (let i = 1; i < defs.length; i++) expect(defs[i].target, `${line}: ${defs[i].medal}`).toBeGreaterThan(defs[i - 1].target);
    }
  });

  it('descriptions mention their own threshold (so a tier can never read as another one)', () => {
    for (const d of ALL) {
      if (d.medal === 'special' || d.target < 2) continue;
      const shown = d.target.toLocaleString('en-US');
      const allWord = /every|all/i.test(d.description);
      expect(d.description.includes(shown) || allWord, `${d.id}: "${d.description}"`).toBe(true);
    }
  });
});

describe('achievements.data — sources are things the game produces', () => {
  const missionsSrc = readFileSync(new URL('../src/sim/missions.ts', import.meta.url), 'utf8');

  it('every counter source is a lifetime counter the mission system keeps', () => {
    for (const d of ALL) {
      if (d.source.kind !== 'counter') continue;
      const { type, target } = d.source;
      expect(COUNTED_TYPES.has(type), `${d.id}: mission type ${type} keeps no lifetime counter`).toBe(true);
      // the mission system really bumps that type (it is not just in a list)
      expect(missionsSrc.includes(`bump('${type}'`), `${d.id}: missions.ts never bumps '${type}'`).toBe(true);
      switch (type) {
        case 'gather': expect(target === '*' || resIds.has(target), `${d.id} ${target}`).toBe(true); break;
        case 'build': expect(target === '*' || buildingIds.has(target) || (target.startsWith('category:') && buildingCats.has(target.slice(9) as BuildingCategory)), `${d.id} ${target}`).toBe(true); break;
        case 'upgrade': expect(target === '*' || buildingIds.has(target), `${d.id} ${target}`).toBe(true); break;
        case 'recruit': expect(target === '*' || rarities.has(target), `${d.id} ${target}`).toBe(true); break;
        case 'discover': expect(target === '*' || biomeIds.has(target), `${d.id} ${target}`).toBe(true); break;
        case 'kill': expect(target === '*' || alienIds.has(target), `${d.id} ${target}`).toBe(true); break;
        case 'craft': expect(target === '*' || recipeIds.has(target), `${d.id} ${target}`).toBe(true); break;
        case 'research': expect(target === '*' || researchIds.has(target), `${d.id} ${target}`).toBe(true); break;
        case 'loot': expect(target === '*' || poiIds.has(target), `${d.id} ${target}`).toBe(true); break;
        case 'equip': expect(target === '*' || data.item(target) != null, `${d.id} ${target}`).toBe(true); break;
        case 'expedition':
          expect(['launch', 'collect', 'frontier', '*'].includes(target) || expeditionIds.has(target) || biomeIds.has(target), `${d.id} ${target}`).toBe(true);
          if (['launch', 'collect', 'frontier'].includes(target)) expect(missionsSrc.includes(`'${target}'`), `${d.id}: no '${target}' expedition counter`).toBe(true);
          break;
        default:
          expect(target, `${d.id}`).toBe('*');
      }
    }
  });

  it('every metric source is one the reader knows', () => {
    for (const d of ALL) if (d.source.kind === 'metric') expect(METRICS.includes(d.source.metric), `${d.id}: ${d.source.metric}`).toBe(true);
  });

  it('no target asks for more than the game contains', () => {
    const cap: Partial<Record<string, number>> = {
      regions: data.biomes.length,
      research: data.research.length,
      buildingTypes: data.buildings.length,
      alienTypes: data.aliens.length,
      colonyTier: data.tiers.length - 1,
    };
    for (const d of ALL) {
      if (d.source.kind !== 'metric') continue;
      const max = cap[d.source.metric];
      if (max != null) expect(d.target, `${d.id}: only ${max} exist`).toBeLessThanOrEqual(max);
    }
  });

  it('there is a one-off for every boss and every colony tier', () => {
    const bosses = data.aliens.filter((a) => a.boss);
    expect(bosses.length).toBeGreaterThanOrEqual(3);
    for (const b of bosses) {
      const hit = ALL.find((d) => d.source.kind === 'counter' && d.source.type === 'kill' && d.source.target === b.id);
      expect(hit, `boss ${b.id}`).toBeDefined();
      expect(hit!.medal).toBe('special');
    }
    for (let t = 1; t < data.tiers.length; t++) {
      const hit = ALL.find((d) => d.source.kind === 'metric' && d.source.metric === 'colonyTier' && d.target === t);
      expect(hit, `tier ${t}`).toBeDefined();
      expect(hit!.description).toContain(data.tiers[t].name);
    }
  });

  it('a legendary colonist, the Star Chart and a login streak are covered', () => {
    const has = (m: string) => ALL.some((d) => d.source.kind === 'metric' && d.source.metric === m);
    for (const m of ['legendary', 'charted', 'loginDays', 'playHours']) expect(has(m), m).toBe(true);
    expect(ALL.some((d) => d.source.kind === 'metric' && d.source.metric === 'charted' && d.target === 10)).toBe(true);
  });

  it('bronze medals come early: small first steps', () => {
    for (const [line, defs] of lines()) {
      if (defs.length < 3) continue;
      const bronze = defs[0];
      const gold = defs[2];
      // gold is a long-term goal: at least ~10x the first step for open-ended counters
      if (bronze.source.kind === 'counter' && bronze.source.target === '*') expect(gold.target / bronze.target, line).toBeGreaterThanOrEqual(10);
    }
  });
});

describe('achievements.data — rewards', () => {
  it('rewards use real resources and items and only the modest kinds', () => {
    for (const d of ALL) {
      expect(Object.keys(d.reward).every((k) => ['xp', 'nova', 'rp', 'resources', 'items'].includes(k)), `${d.id}: ${Object.keys(d.reward)}`).toBe(true);
      expect(d.reward.xp ?? 0, `${d.id} xp`).toBeGreaterThan(0);
      for (const [k, v] of Object.entries(d.reward.resources ?? {})) {
        expect(resIds.has(k), `${d.id}: resource ${k}`).toBe(true);
        expect(v! > 0 && Number.isFinite(v!), `${d.id}: ${k} amount`).toBe(true);
      }
      for (const [k, v] of Object.entries(d.reward.items ?? {})) {
        expect(itemIds.has(k), `${d.id}: item ${k}`).toBe(true);
        expect(v, `${d.id}: ${k} count`).toBeGreaterThan(0);
      }
      expect(Object.keys(d.reward.resources ?? {}).length + Object.keys(d.reward.items ?? {}).length + (d.reward.rp ? 1 : 0), `${d.id} gives nothing but XP`).toBeGreaterThan(0);
    }
  });

  it('Nova only comes with silver, gold and the one-offs, and the total stays modest (<= 400)', () => {
    let total = 0;
    for (const d of ALL) {
      const nova = d.reward.nova ?? 0;
      if (d.medal === 'bronze') expect(nova, `${d.id}: bronze pays no Nova`).toBe(0);
      expect(Number.isInteger(nova), d.id).toBe(true);
      total += nova;
    }
    expect(total).toBeGreaterThan(100);
    expect(total).toBeLessThanOrEqual(400);
  });

  it('a line pays more as the medal climbs (XP, Nova, and a later-stage crate for gold)', () => {
    for (const [line, defs] of lines()) {
      if (defs.length < 3) continue;
      const xp = defs.map((d) => d.reward.xp ?? 0);
      expect(xp[1], line).toBeGreaterThan(xp[0]);
      expect(xp[2], line).toBeGreaterThan(xp[1]);
      const nova = defs.map((d) => d.reward.nova ?? 0);
      expect(nova[2], line).toBeGreaterThanOrEqual(nova[1]);
    }
  });

  it('crates match the stage: a line never hands out a lower-tier crate as it climbs, and bronze stays humble', () => {
    const tier = (d: AchievementDef) => Math.max(0, ...Object.keys(d.reward.items ?? {}).map((id) => data.item(id)!.tier));
    for (const [line, defs] of lines()) {
      if (defs.length < 3) continue;
      expect(tier(defs[1]), line).toBeGreaterThanOrEqual(tier(defs[0]));
      expect(tier(defs[2]), line).toBeGreaterThanOrEqual(tier(defs[1]));
    }
    // first-hour bronzes pay basics: starter resources (or a crate/bundle of the first tiers), never endgame goods
    for (const d of ALL) {
      if (d.medal !== 'bronze' || d.source.kind === 'metric' && (d.source.metric === 'charted')) continue;
      for (const k of Object.keys(d.reward.resources ?? {})) expect(['wood', 'stone', 'fiber', 'food', 'water'].includes(k), `${d.id}: ${k}`).toBe(true);
      expect(tier(d), d.id).toBeLessThanOrEqual(1);
    }
  });
});
