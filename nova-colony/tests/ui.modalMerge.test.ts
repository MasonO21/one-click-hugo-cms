import { describe, expect, it } from 'vitest';
import { addRewards, canMerge, mergeArgs, mergeCelebrate, mergeKind, mergeReward, MERGE_LIST_MAX } from '../src/ui/logic/modalMerge';
import type { CelebrateArg, RewardArg } from '../src/ui/panels/CelebratePanel';

const research = (name: string): CelebrateArg => ({ title: 'Research Complete!', text: `${name} — Unlocks: Thing`, icon: '🔬' });

describe('celebration cards merge into one summary card', () => {
  it('three research cards read "3 research complete", each one listed', () => {
    let a = research('Sharper Tools');
    for (const n of ['Masonry', 'Crop Rotation']) a = mergeCelebrate(a, research(n));
    expect(a.title).toBe('3 research complete');
    expect(a.notes?.map((x) => x.text)).toEqual(['Sharper Tools — Unlocks: Thing', 'Masonry — Unlocks: Thing', 'Crop Rotation — Unlocks: Thing']);
    expect(a.entries).toHaveLength(3);
    expect(canMerge('celebrate', a)).toBe(true); // a summary keeps taking more
  });

  it('mixed cards list their titles; long lists end in "+N more"', () => {
    const m = mergeCelebrate({ title: 'Colony defended!', text: 'First Contact', icon: '🎉' }, research('Masonry'));
    expect(m.title).toBe('2 things to celebrate');
    expect(m.notes?.[0].text).toBe('Colony defended! First Contact');
    let big = research('A');
    for (let i = 0; i < 9; i++) big = mergeCelebrate(big, research(`R${i}`));
    expect(big.title).toBe('10 research complete');
    expect(big.notes).toHaveLength(MERGE_LIST_MAX + 1);
    expect(big.notes?.at(-1)?.text).toBe(`+${10 - MERGE_LIST_MAX} more`);
  });

  it('tier-ups, illustrated moments, the intro and "What\'s new" keep their own card', () => {
    expect(canMerge('celebrate', research('x'))).toBe(true);
    expect(canMerge('celebrate', { title: 'Stone Tier Reached!', tier: 2 })).toBe(false);
    expect(canMerge('celebrate', { title: 'Pinewood Forest discovered!', art: '/art/x.webp' })).toBe(false);
    expect(canMerge('celebrate', { title: 'Crash Landing!', quiet: true, ok: "Let's go!" })).toBe(false);
    expect(canMerge('celebrate', { title: "What's new", notes: [{ icon: '✨', text: 'x' }], ok: 'Take a look', quiet: true })).toBe(false);
    expect(mergeKind('victory')).toBe(false);
    expect(mergeKind('welcome')).toBe(false);
  });
});

describe('reward cards merge and add up', () => {
  it('a daily gift, a wheel prize and a season reward become one "3 rewards" card', () => {
    const daily: RewardArg = { title: 'Day 3 reward', reward: { resources: { wood: 100 }, nova: 5 } };
    const spin: RewardArg = { title: 'You won: Wood Pile!', reward: { resources: { wood: 50, stone: 20 } } };
    const season: RewardArg = { title: 'Level 5 reward', reward: { items: { supply_crate: 1 }, xp: 10 } };
    const m = mergeArgs('reward', mergeArgs('reward', daily, spin), season) as RewardArg;
    expect(m.title).toBe('3 rewards');
    expect(m.from).toEqual(['Day 3 reward', 'You won: Wood Pile!', 'Level 5 reward']);
    expect(m.reward).toEqual({ resources: { wood: 150, stone: 20 }, items: { supply_crate: 1 }, nova: 5, xp: 10 });
  });

  it('colonists, cosmetics, vehicles, boosts and purchases keep their own card', () => {
    expect(canMerge('reward', { title: 'x', reward: { colonist: 'rare' } })).toBe(false);
    expect(canMerge('reward', { title: 'x', reward: { cosmetic: 'c' } })).toBe(false);
    expect(canMerge('reward', { title: 'x', reward: { boost: { kind: 'production', mult: 2, minutes: 10 } } })).toBe(false);
    expect(canMerge('reward', { title: 'Thank you! Starter Pack', reward: { nova: 300 } })).toBe(false);
    expect(canMerge('reward', { title: 'x', reward: { resources: { wood: 1 } } })).toBe(true);
    expect(addRewards({ items: { a: 1 } }, { items: { a: 2, b: 1 }, rp: 3 })).toEqual({ items: { a: 3, b: 1 }, rp: 3 });
    expect(mergeReward({ title: 'a', reward: {} }, { title: 'b', reward: { nova: 1 } }).reward).toEqual({ nova: 1 });
  });
});
