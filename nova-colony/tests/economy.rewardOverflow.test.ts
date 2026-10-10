/**
 * Rewards into full storage. The pacing bot (tests/pacing) found that from the Reinforced tier on most storage sits at
 * its cap, so crates, mission rewards, victory chests and medals delivered only 26-55% of what their cards showed
 * (and none of the Titanium finale's). Rewards now overfill storage like Welcome Back and expedition hauls do.
 */
import { describe, expect, it } from 'vitest';
import { makeGame } from './economy.helpers';

describe('economy: rewards overfill storage like Welcome Back', () => {
  it('a reward into full storage arrives in full, up to capacity x offlineStorageMult', () => {
    const { game } = makeGame();
    const eco = game.sys.economy;
    const mult = game.data.balance.offlineStorageMult ?? 1;
    expect(mult).toBeGreaterThan(1);
    const cap = eco.capacity('wood');
    expect(cap).toBeGreaterThan(0);
    eco.add('wood', cap, 'gather');
    expect(eco.amount('wood')).toBe(cap);

    game.grant({ resources: { wood: 120 } }, 'mission');
    expect(eco.amount('wood')).toBe(cap + 120);

    // a huge one still stops at the generous overflow limit
    game.grant({ resources: { wood: cap * 10 } }, 'crate');
    expect(eco.amount('wood')).toBe(cap * mult);
  });

  it('gathering and production still stop at the cap', () => {
    const { game } = makeGame();
    const eco = game.sys.economy;
    const cap = eco.capacity('stone');
    expect(eco.add('stone', cap + 50, 'gather')).toBe(cap);
    expect(eco.add('stone', 10, 'production')).toBe(0);
    expect(eco.add('stone', 10, 'drop')).toBe(0);
    expect(eco.amount('stone')).toBe(cap);
  });
});
