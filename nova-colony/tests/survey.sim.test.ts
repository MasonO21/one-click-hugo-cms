/**
 * Region surveys (sim/survey.ts): the meter (charted land, points of interest explored, field guide), milestones at
 * 25 / 50 / 75 / 100% claimed one at a time from the Map, their rewards (region cache scaled to the tier, a survivor,
 * a keepsake cosmetic or Nova, a permanent perk), "Survey" suggestions, save round trips and saves from before surveys.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { createInitialState, deserializeState, serializeState, type GameState } from '../src/core/state';
import { migrateState } from '../src/platform/saveMigrate';
import { SURVEY, regionSurveyDef } from '../src/data/survey';
import { collectEvents } from './world.helpers';

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

function setTier(game: Game, tier: number) {
  game.state.colony.tier = tier;
  game.bus.emit('colony:tierUp', { tier });
}

/** Post-tutorial colony: meta toasts on, nests' guardians already beaten. */
function grownUp(game: Game) {
  game.state.tutorial.done = true;
  game.sys.combat.spawnWild = () => [];
  game.sys.combat.wildNear = () => 0;
}

/** Reveal every fog square of a region (or the whole map). */
function chart(game: Game, region?: string) {
  const w = game.sys.world;
  for (let fz = 0; fz < 64; fz++) {
    for (let fx = 0; fx < 64; fx++) {
      const x = (fx + 0.5) * 8 - 256;
      const z = (fz + 0.5) * 8 - 256;
      if (!region || w.regionAt(x, z) === region) w.fog.reveal(x, z, 1);
    }
  }
  game.state.world.fog = w.fog.encode();
}

function exploreAll(game: Game, region: string) {
  const w = game.sys.world;
  for (const p of w.gen.pois) {
    if (p.region !== region || p.id.startsWith('poi_s')) continue;
    if (!w.lootPoi(p.id)) expect(w.lootPoi(p.id), p.id).toBe(true); // a nest wakes its guards first
  }
}

function harvestAll(game: Game, region: string) {
  const w = game.sys.world;
  const seen = new Set<string>();
  for (const n of w.gen.nodes) {
    if (n.region !== region || seen.has(n.def)) continue;
    seen.add(n.def);
    w.hitNode(n.i, 1);
  }
}

describe('survey meter', () => {
  it('starts near zero, and only unlocked regions can reach milestones', () => {
    const { game } = rig();
    const s = game.sys.survey;
    const cv = s.region('crash_valley')!;
    expect(cv.unlocked).toBe(true);
    expect(cv.pct).toBeLessThan(5);
    expect(cv.pois.total).toBe(8);
    expect(cv.specimens.total).toBeGreaterThanOrEqual(4);
    chart(game, 'red_desert'); // seen from the border, still locked
    game.bus.emit('tick:second', { playTime: 1 });
    const rd = s.region('red_desert')!;
    expect(rd.unlocked).toBe(false);
    expect(rd.charted).toBe(1);
    expect(rd.reached).toBe(0);
    expect(s.claimable()).toBe(0);
  });

  it('adds charted land (50%), explored points of interest (35%) and the field guide (15%)', () => {
    const { game } = rig();
    grownUp(game);
    const s = game.sys.survey;
    const id = 'pinewood_forest';
    chart(game, id);
    expect(s.region(id)!.charted).toBe(1);
    expect(s.region(id)!.pct).toBe(50);
    harvestAll(game, id);
    expect(s.region(id)!.specimens.missing).toEqual([]);
    expect(s.region(id)!.pct).toBe(65);
    exploreAll(game, id);
    const p = s.region(id)!;
    expect(p.pois.done).toBe(p.pois.total);
    expect(p.pct).toBe(100);
  });

  it('counts a fog square as charted from 90% of the land, and a restocked cache stays explored', () => {
    const { game, step } = rig();
    const s = game.sys.survey;
    const w = game.sys.world;
    const cache = w.gen.pois.find((p) => p.def === 'supply_cache' && p.region === 'crash_valley')!;
    expect(w.lootPoi(cache.id)).toBe(true);
    step(1810);
    expect(game.state.world.pois[cache.id].looted).toBe(false);
    expect(s.region('crash_valley')!.pois.done).toBe(1);
  }, 30_000);

  it('announces a milestone once (event + toast that opens the Map) and badges it until claimed', () => {
    const { game } = rig();
    grownUp(game);
    const reached = collectEvents(game, 'survey:milestone');
    const toasts = collectEvents(game, 'ui:toast');
    chart(game, 'pinewood_forest');
    game.bus.emit('tick:second', { playTime: 1 });
    expect(reached.map((e) => [e.region, e.step])).toEqual([
      ['pinewood_forest', 0],
      ['pinewood_forest', 1],
    ]);
    const t = toasts.filter((e) => e.text.includes('Pinewood Forest'));
    expect(t).toHaveLength(1);
    expect(t[0].open).toBe('map');
    expect(t[0].text).toMatch(/50% surveyed/);
    expect(game.sys.survey.claimable()).toBe(2);
    game.bus.emit('tick:second', { playTime: 2 });
    expect(reached).toHaveLength(2);
  });

  it('stays quiet during the guided first session (the reward still waits)', () => {
    const { game } = rig();
    const toasts = collectEvents(game, 'ui:toast');
    chart(game, 'crash_valley');
    game.bus.emit('tick:second', { playTime: 1 });
    expect(toasts.filter((e) => e.text.includes('surveyed'))).toEqual([]);
    expect(game.sys.survey.claimable()).toBeGreaterThan(0);
  });
});

describe('survey milestones: rewards', () => {
  it('pays a region cache, a survivor, a keepsake and a permanent perk, one claim at a time', () => {
    const { game } = rig();
    grownUp(game);
    setTier(game, 3);
    game.sys.economy.capacity = () => 1e9;
    const s = game.sys.survey;
    const id = 'pinewood_forest';
    const def = regionSurveyDef(id)!;
    chart(game, id);
    harvestAll(game, id);
    exploreAll(game, id);
    game.bus.emit('tick:second', { playTime: 1 });
    expect(s.claimable()).toBe(4);
    const claimed = collectEvents(game, 'survey:claimed');

    const nova0 = game.state.liveops.nova;
    const c0 = s.claim(id)!;
    expect(c0.step).toBe(0);
    expect(c0.title).toBe(SURVEY.titles[0]);
    expect(Object.keys(c0.reward.resources ?? {}).length).toBeGreaterThan(0);
    expect(game.state.liveops.nova).toBe(nova0 + SURVEY.nova[0]);

    const pop = game.state.colonists.list.length;
    const c1 = s.claim(id)!;
    expect(c1.reward.colonist).toBe(def.colonist);
    expect(game.state.colonists.list.length).toBe(pop + 1);

    const c2 = s.claim(id)!;
    expect(c2.reward.cosmetic).toBe(def.cosmetic);
    expect(game.state.liveops.cosmetics.owned).toContain(def.cosmetic);

    const wood = game.sys.economy.modifier('production:wood');
    expect(s.mastered(id)).toBe(false);
    const c3 = s.claim(id)!;
    expect(c3.perk?.title).toBe(def.perk.title);
    expect(s.mastered(id)).toBe(true);
    expect(game.sys.economy.modifier('production:wood')).toBeCloseTo(wood + 0.05, 6);
    expect(game.sys.economy.modifier('production:fiber')).toBeGreaterThan(1.04);

    expect(s.claim(id)).toBeNull();
    expect(s.claimable()).toBe(0);
    expect(claimed.map((e) => e.step)).toEqual([0, 1, 2, 3]);
    expect(s.next(id)).toBeNull();
  });

  it('the region cache scales with the colony tier', () => {
    const value = (tier: number) => {
      const { game } = rig();
      grownUp(game);
      setTier(game, tier);
      game.sys.economy.capacity = () => 1e9;
      chart(game, 'crash_valley');
      const r = game.sys.survey.claim('crash_valley')!.reward;
      const v = game.data.expeditionRules.value;
      return Object.entries(r.resources ?? {}).reduce((a, [k, n]) => a + (n ?? 0) * (v[k] ?? 1), 0) + (r.rp ?? 0) * 3;
    };
    expect(value(4)).toBeGreaterThan(value(0) * 10);
  });

  it('a keepsake the colony already owns turns into Nova', () => {
    const { game } = rig();
    grownUp(game);
    const id = 'crash_valley';
    game.state.liveops.cosmetics.owned.push(regionSurveyDef(id)!.cosmetic);
    chart(game, id);
    harvestAll(game, id);
    exploreAll(game, id);
    game.bus.emit('tick:second', { playTime: 1 });
    const s = game.sys.survey;
    s.claim(id);
    s.claim(id);
    const nova = game.state.liveops.nova;
    const c2 = s.claim(id)!;
    expect(c2.reward.cosmetic).toBeUndefined();
    expect(c2.ownedCosmetic).toBe(regionSurveyDef(id)!.cosmetic);
    expect(game.state.liveops.nova).toBe(nova + SURVEY.ownedCosmeticNova);
  });

  it('a mastered Frozen Ridge adds an expedition squad once the Radio Tower sends any', () => {
    const { game } = rig();
    grownUp(game);
    setTier(game, 4);
    const id = 'frozen_ridge';
    const slots = game.sys.expeditions.slots();
    expect(slots).toBe(2);
    chart(game, id);
    harvestAll(game, id);
    exploreAll(game, id);
    game.bus.emit('tick:second', { playTime: 1 });
    for (let i = 0; i < 4; i++) expect(game.sys.survey.claim(id)).not.toBeNull();
    expect(game.sys.expeditions.slots()).toBe(3);
    setTier(game, 0);
    expect(game.sys.expeditions.slots()).toBe(0);
  });

  it('a locked region cannot be claimed', () => {
    const { game } = rig();
    chart(game);
    game.bus.emit('tick:second', { playTime: 1 });
    expect(game.sys.survey.claim('titanium_highlands')).toBeNull();
  });
});

describe('survey suggestions', () => {
  it('points at a restocked cache first, then unopened POIs, then signals and uncharted ground', () => {
    const { game, step } = rig();
    const s = game.sys.survey;
    const w = game.sys.world;
    const cache = w.gen.pois.find((p) => p.def === 'supply_cache' && p.region === 'crash_valley')!;
    expect(w.lootPoi(cache.id)).toBe(true);
    step(1810);
    const t = s.suggest(cache.x + 30, cache.z)!;
    expect(t.kind).toBe('restocked');
    expect(t.poi).toBe(cache.id);
    expect(t.label).toBe('Restocked: Supply Cache');
    // nothing known nearby: a signal or uncharted ground in an unlocked region
    const far = s.suggest(0, 0, 400)!;
    expect(['restocked', 'unopened', 'signal', 'uncharted', 'beacon']).toContain(far.kind);
    expect(w.isUnlocked(far.region)).toBe(true);
  }, 30_000);

  it('falls back to uncharted ground once every POI in reach is explored', () => {
    const { game } = rig();
    grownUp(game);
    const w = game.sys.world;
    for (const p of w.gen.pois) if (w.isUnlocked(p.region)) w.lootPoi(p.id) || w.lootPoi(p.id);
    const t = game.sys.survey.suggest(0, 0)!;
    expect(t.kind).toBe('uncharted');
    expect(w.revealed(t.x, t.z)).toBe(false);
    expect(w.isUnlocked(w.regionAt(t.x, t.z))).toBe(true);
    chart(game);
    expect(game.sys.survey.suggest(0, 0)).toBeNull();
  });
});

describe('survey saves', () => {
  it('round-trips the field guide, reached and claimed milestones', () => {
    const { game, clock } = rig();
    grownUp(game);
    chart(game, 'pinewood_forest');
    harvestAll(game, 'pinewood_forest');
    game.bus.emit('tick:second', { playTime: 1 });
    game.sys.survey.claim('pinewood_forest');
    const back = rig(migrateState(deserializeState(serializeState(game.state))), clock.now + 60_000);
    const p = back.game.sys.survey.region('pinewood_forest')!;
    expect(p.claimed).toBe(1);
    expect(p.reached).toBe(game.sys.survey.region('pinewood_forest')!.reached);
    expect(p.specimens.missing).toEqual([]);
  });

  it('an old save without surveys loads: field guide from depleted nodes, milestones at once, one toast', () => {
    const base = rig();
    const node = base.game.sys.world.gen.nodes.find((n) => n.region === 'crash_valley' && n.def === 'tree_round')!;
    const raw = JSON.parse(serializeState(createInitialState(1234, 1_700_000_000_000)));
    raw.tutorial.done = true;
    raw.playTime = 9000;
    raw.world.depleted = { [node.i]: 9100 };
    // the whole valley seen already
    chart(base.game, 'crash_valley');
    raw.world.fog = base.game.state.world.fog;
    raw.world.regionsUnlocked = ['crash_valley', 'pinewood_forest'];
    raw.world.regionsDiscovered = ['crash_valley', 'pinewood_forest'];
    delete raw.world.survey;
    const state = migrateState(raw);
    const { game } = rig(state);
    const toasts = collectEvents(game, 'ui:toast');
    const milestones = collectEvents(game, 'survey:milestone');
    expect(game.state.world.survey).toBeDefined();
    const cv = game.sys.survey.region('crash_valley')!;
    expect(cv.specimens.done).toBe(1);
    expect(cv.reached).toBe(2);
    expect(game.sys.survey.claimable()).toBe(2);
    game.bus.emit('tick:second', { playTime: 9001 });
    game.bus.emit('tick:second', { playTime: 9002 });
    expect(milestones).toEqual([]);
    expect(toasts.filter((t) => t.text.includes('survey rewards are waiting'))).toHaveLength(1);
  });

  it('a damaged survey slice is repaired instead of crashing', () => {
    const raw = JSON.parse(serializeState(createInitialState(1234, 1_700_000_000_000)));
    raw.world.survey = { specimens: { crash_valley: 'tree' }, reached: null };
    const { game } = rig(migrateState(raw));
    expect(game.sys.survey.region('crash_valley')!.specimens.done).toBe(0);
    expect(game.sys.survey.claimable()).toBe(0);
  });
});
