/**
 * Colony Journal presentation logic: icons, progress text, line views and their order, section totals, the badge
 * and the Colony Records.
 */
import { describe, expect, it } from 'vitest';
import { computeBadges } from '../src/ui/logic/badges';
import {
  achievementArt,
  categoryViews,
  colonyRecords,
  fmtDay,
  fmtNum,
  journalBadge,
  lineViews,
  medalArt,
  orderLines,
  progressLabel,
  toastIconArt,
  type LineView,
} from '../src/ui/logic/achievements';
import { ACHIEVEMENT_CATEGORIES } from '../src/data/achievements';
import { hudArt, rewardArt } from '../src/ui/art';
import { fakeColonist, makeGame } from './meta.helpers';

const tick = (g: ReturnType<typeof makeGame>, s = 9) => {
  g.clock.now += s * 1000;
  g.game.sys.achievements.update(s);
};

describe('journal — formatting', () => {
  it('writes exact counts with separators and never rounds up', () => {
    expect(fmtNum(0)).toBe('0');
    expect(fmtNum(3412)).toBe('3,412');
    expect(fmtNum(49999.9)).toBe('49,999');
    expect(fmtNum(1234567)).toBe('1,234,567');
    expect(fmtNum(-5)).toBe('0');
  });

  it('progress text: counts, colony tiers and hours', () => {
    expect(progressLabel({ target: 5000 }, 3412)).toBe('3,412 / 5,000');
    expect(progressLabel({ target: 5000 }, 99999)).toBe('5,000 / 5,000');
    expect(progressLabel({ target: 1 }, 0)).toBe('0 / 1');
    expect(progressLabel({ target: 4, unit: 'tier' }, 2)).toBe('Tier 2 / 4');
    expect(progressLabel({ target: 10, unit: 'hours' }, 3.46)).toBe('3.4 / 10 h');
    expect(progressLabel({ target: 10, unit: 'hours' }, 0.04)).toBe('0 / 10 h');
    expect(progressLabel({ target: 50, unit: 'hours' }, 12.6)).toBe('12 / 50 h');
  });

  it('dates: this year short, other years with the year', () => {
    const now = new Date(2026, 9, 8, 12).getTime();
    expect(fmtDay(new Date(2026, 2, 4, 9).getTime(), now)).toBe('Mar 4');
    expect(fmtDay(new Date(2025, 11, 31, 23).getTime(), now)).toBe('Dec 31, 2025');
  });
});

describe('journal — icons', () => {
  it('every painted-icon key in the content resolves through the existing art lookups', () => {
    const data = makeGame().game.data;
    for (const d of data.achievements) {
      if (d.art) expect(achievementArt(d), `${d.id}: art "${d.art}" has no illustration`).not.toBeNull();
    }
  });

  it('resolves "<kind>:<id>" through the existing art lookups, null for the unknown', () => {
    expect(achievementArt({ art: 'resource:wood' })).toBe('art/resources/wood.webp');
    expect(achievementArt({ art: 'hud:build' })).toBe('art/hud/build.webp');
    expect(achievementArt({ art: 'tier:3' })).toBe('art/tiers/tier-3-steel.webp');
    expect(achievementArt({ art: 'alien:titan' })).toBe('art/aliens/titan.webp');
    expect(achievementArt({ art: 'hud:does_not_exist' })).toBeNull();
    expect(achievementArt({ art: 'nonsense:x' })).toBeNull();
    expect(achievementArt({})).toBeNull();
  });

  it('medals and the journal use the painted art when it exists (the lead ships it) and the emoji otherwise', () => {
    expect(medalArt('special')).toBeNull();
    expect(medalArt('gold')).toBe(rewardArt('medal_gold'));
    expect(toastIconArt('🥉')).toBe(rewardArt('medal_bronze'));
    expect(toastIconArt('🥈')).toBe(rewardArt('medal_silver'));
    expect(toastIconArt('📔')).toBe(hudArt('journal'));
    expect(toastIconArt('🎁')).toBeNull();
    expect(toastIconArt(undefined)).toBeNull();
  });
});

describe('journal — lines, order, sections', () => {
  it('one view per line: tiered lines keep three medals, one-offs are a line of one', () => {
    const g = makeGame();
    const views = lineViews(g.game);
    const defs = g.game.data.achievements;
    expect(views.reduce((n, v) => n + v.total, 0)).toBe(defs.length);
    expect(new Set(views.map((v) => v.line)).size).toBe(views.length);
    const lumber = views.find((v) => v.line === 'lumberjack')!;
    expect(lumber.defs.map((d) => d.medal)).toEqual(['bronze', 'silver', 'gold']);
    expect(lumber).toMatchObject({ state: 'progress', earned: 0, frac: 0 });
    expect(lumber.next!.id).toBe('ach_lumberjack_bronze');
    const brute = views.find((v) => v.line === 'boss_elder_brute')!;
    expect(brute.total).toBe(1);
    expect(brute.defs[0].medal).toBe('special');
  });

  it('follows progress, claimable medals and completion', () => {
    const g = makeGame();
    g.game.bus.emit('gather:hit', { node: 0, model: 'tree_round', x: 0, z: 0, drop: { ['wood']: 750 } });
    tick(g);
    let lumber = lineViews(g.game).find((v) => v.line === 'lumberjack')!;
    expect(lumber.state).toBe('claim');
    expect(lumber.claimable.map((d) => d.medal)).toEqual(['bronze']);
    expect(lumber.next!.medal).toBe('silver');
    expect(lumber.value).toBe(750);
    expect(lumber.frac).toBeCloseTo(750 / g.game.data.achievement('ach_lumberjack_silver')!.target, 5);
    expect(lumber.earned).toBe(1);

    g.game.sys.achievements.claimLine('lumberjack');
    lumber = lineViews(g.game).find((v) => v.line === 'lumberjack')!;
    expect(lumber.state).toBe('progress');
    expect(lumber.claimable).toEqual([]);

    g.game.bus.emit('gather:hit', { node: 0, model: 'tree_round', x: 0, z: 0, drop: { ['wood']: g.game.data.achievement('ach_lumberjack_gold')!.target } });
    tick(g);
    g.game.sys.achievements.claimAll();
    lumber = lineViews(g.game).find((v) => v.line === 'lumberjack')!;
    expect(lumber).toMatchObject({ state: 'done', next: null, frac: 1, earned: 3 });
  });

  it('orders claimable lines first and finished ones last, keeping the authored order otherwise', () => {
    const mk = (line: string, state: LineView['state']): LineView => ({ line, state }) as LineView;
    const sorted = orderLines([mk('a', 'done'), mk('b', 'progress'), mk('c', 'claim'), mk('d', 'progress'), mk('e', 'claim'), mk('f', 'done')]);
    expect(sorted.map((l) => l.line)).toEqual(['c', 'e', 'b', 'd', 'a', 'f']);
  });

  it('sections: every category in display order with honest totals and claim counts', () => {
    const g = makeGame();
    g.game.state.colony.tier = 2;
    g.game.state.colonists.list.push(fakeColonist(1), fakeColonist(2), fakeColonist(3));
    tick(g);
    const cats = categoryViews(g.game);
    expect(cats.map((c) => c.id)).toEqual(ACHIEVEMENT_CATEGORIES.map((c) => c.id));
    expect(cats.reduce((n, c) => n + c.total, 0)).toBe(g.game.data.achievements.length);
    const sci = cats.find((c) => c.id === 'scientist')!;
    expect(sci.claimable).toBe(2); // Reinforced + Stone
    expect(sci.earned).toBe(2);
    expect(sci.lines[0].state).toBe('claim'); // claimable lines float to the top
    const com = cats.find((c) => c.id === 'community')!;
    expect(com.claimable).toBe(1);
    expect(cats.reduce((n, c) => n + c.claimable, 0)).toBe(journalBadge(g.game));
  });
});

describe('journal — badge', () => {
  it('stays quiet during the guided first session, like the other meta offers', () => {
    const g = makeGame();
    g.game.state.colony.tier = 2;
    tick(g);
    expect(journalBadge(g.game)).toBe(2);
    expect(computeBadges(g.game).journal).toBe(0);
    g.game.state.tutorial.done = true;
    expect(computeBadges(g.game).journal).toBe(2);
  });

  it('counts medals waiting for Claim, flows through computeBadges and drops as they are claimed', () => {
    const g = makeGame();
    g.game.state.tutorial.done = true;
    expect(computeBadges(g.game).journal).toBe(0);
    g.game.state.colony.tier = 3;
    tick(g);
    expect(journalBadge(g.game)).toBe(3);
    expect(computeBadges(g.game).journal).toBe(3);
    g.game.sys.achievements.claim('ach_tier_1');
    expect(computeBadges(g.game).journal).toBe(2);
    g.game.sys.achievements.claimAll();
    expect(computeBadges(g.game).journal).toBe(0);
  });
});

describe('journal — Colony Records', () => {
  it('reads lifetime stats from counters and state, with unique ids and no NaN', () => {
    const g = makeGame();
    const st = g.game.state;
    st.missions.counters['gather:wood'] = 12345;
    st.missions.counters['gather:*'] = 99999;
    st.missions.counters['kill:*'] = 77;
    st.missions.counters['kill:elder_brute'] = 2;
    st.missions.counters['kill:titan_prime'] = 1;
    st.missions.counters['defend:*'] = 9;
    st.stats.wavesWon = 11; // a save whose counter lags: the larger one wins
    st.playTime = 3 * 3600 + 25 * 60;
    st.time.day = 14;
    st.expeditions.launched = 6;
    st.expeditions.collected = 5;
    st.liveops.daily.streak = 4;
    st.research.completed = g.game.data.research.slice(0, 12).map((r) => r.id);
    const rows = colonyRecords(g.game);
    const by = Object.fromEntries(rows.map((r) => [r.id, r.value]));
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.length).toBeGreaterThanOrEqual(16);
    expect(by.wood).toBe('12,345');
    expect(by.gathered).toBe('99,999');
    expect(by.aliens).toBe('77');
    expect(by.bosses).toBe('3');
    expect(by.raids).toBe('11');
    expect(by.time).toBe('3h 25m');
    expect(by.days).toBe('14');
    expect(by.expeditions).toBe('6');
    expect(by.hauls).toBe('5');
    expect(by.gifts).toBe('4');
    expect(by.research).toBe(`12 / ${g.game.data.research.length}`);
    expect(by.regions).toBe(`${st.world.regionsDiscovered.length} / ${g.game.data.biomes.length}`);
    for (const r of rows) {
      expect(r.label.length, r.id).toBeGreaterThan(3);
      expect(r.value, r.id).not.toMatch(/NaN|undefined|Infinity/);
      expect(r.icon.length, r.id).toBeGreaterThan(0);
    }
  });

  it('every record starts at zero-ish on a fresh colony (nothing invented)', () => {
    const g = makeGame();
    const by = Object.fromEntries(colonyRecords(g.game).map((r) => [r.id, r.value]));
    for (const id of ['wood', 'stone', 'gathered', 'upgrades', 'crafted', 'aliens', 'raids', 'bosses', 'looted', 'expeditions', 'hauls', 'charted', 'gifts']) expect(by[id], id).toBe('0');
    expect(by.medals).toBe(`0 / ${g.game.data.achievements.length}`);
  });
});
