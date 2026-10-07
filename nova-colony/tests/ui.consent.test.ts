import { describe, expect, it } from 'vitest';
import { CONSENT_DELAY, stepConsent, type ConsentTimer } from '../src/ui/ConsentPrompt';

const fresh = (): ConsentTimer => ({ wait: CONSENT_DELAY, shown: false, away: false });
const run = (t: ConsentTimer, busy: boolean, seconds: number) => {
  for (let s = 0; s < seconds; s += 0.1) stepConsent(t, busy, 0.1);
};

describe('analytics consent card timing (QA: it covered the build cards the tutorial points at)', () => {
  it('appears after the delay once the screen is free', () => {
    const t = fresh();
    run(t, false, CONSENT_DELAY - 0.5);
    expect(t.shown).toBe(false);
    run(t, false, 1);
    expect(t).toEqual({ wait: 0, shown: true, away: false });
  });

  it('does not count down while a panel, the build drawer or build mode is up', () => {
    const t = fresh();
    run(t, true, 60);
    expect(t.shown).toBe(false);
    expect(t.wait).toBe(CONSENT_DELAY);
  });

  it('once shown, steps aside while the player has something open and comes back afterwards', () => {
    const t = fresh();
    run(t, false, CONSENT_DELAY + 1);
    expect(t.shown).toBe(true);
    stepConsent(t, true, 0.016);
    expect(t.away).toBe(true);
    stepConsent(t, true, 0.016);
    expect(t.away).toBe(true);
    stepConsent(t, false, 0.016);
    expect(t).toEqual({ wait: 0, shown: true, away: false });
  });
});
