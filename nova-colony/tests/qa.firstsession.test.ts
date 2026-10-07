/**
 * Guards for first-session polish found in the browser playtest (docs/SPEC.md §33):
 * daylight through the guided session, quiet short absences, and the Welcome Back threshold.
 */
import { describe, expect, it } from 'vitest';
import { FIRST_DAY_STRETCH, Game, WELCOME_BACK_MIN_AWAY } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { serializeState, deserializeState } from '../src/core/state';

function fresh(now = { t: Date.UTC(2026, 9, 7, 9) }) {
  const game = new Game({ seed: 99, services: createMockServices(), clock: () => now.t });
  game.start();
  return { game, now };
}

describe('first session: day/night', () => {
  it('day 1 runs slower while the tutorial is in progress, so the guided ~13 minutes stay in daylight', () => {
    const { game } = fresh();
    const len = game.data.balance.dayLength;
    const t0 = game.state.time.dayTime;
    const nightAt = 0.78;
    // guided session: nightfall only after (0.78 - start) * len * stretch seconds
    const secondsToNight = (nightAt - t0) * len * FIRST_DAY_STRETCH;
    expect(secondsToNight / 60).toBeGreaterThan(12);
    // a human-paced first session (QA bot: first attack 12.7 min, first tier-up 13.9 min) lands in golden hour,
    // where shadows are long and warm, before the sun/moon light swap at 0.7575 — with ~2 min to spare
    const at = (min: number) => t0 + (min * 60) / (len * FIRST_DAY_STRETCH);
    expect(at(12.7)).toBeGreaterThan(0.64);
    expect(at(13.9)).toBeGreaterThan(0.68);
    expect(at(13.9)).toBeLessThan(0.73);
    expect(at(15.5)).toBeLessThan(0.7575);
    for (let i = 0; i < 12 * 60 * 4; i++) game.update(0.25);
    expect(game.isNight()).toBe(false);
    // once the arc is done the clock runs at normal speed again
    game.state.tutorial.done = true;
    const before = game.state.time.dayTime;
    game.update(0.25);
    expect(game.state.time.dayTime - before).toBeCloseTo(0.25 / len, 8);
  });
});

describe('first session: coming back', () => {
  it('credits a short break quietly (no Welcome Back modal for "+1"), shows the modal after a real absence', () => {
    const { game, now } = fresh();
    for (let i = 0; i < 40; i++) game.update(0.25);
    game.state.research.points = 0;
    game.sys.economy.recompute();
    const saved = serializeState(game.state);

    const shortNow = { t: now.t + (WELCOME_BACK_MIN_AWAY - 60) * 1000 };
    const g2 = new Game({ state: deserializeState(saved), services: createMockServices(), clock: () => shortNow.t });
    g2.start();
    expect(g2.pendingOffline).toBeNull();
    expect(g2.state.research.points).toBeGreaterThan(0); // the core's research trickle was credited anyway

    const longNow = { t: now.t + 4 * 3600 * 1000 };
    const g3 = new Game({ state: deserializeState(saved), services: createMockServices(), clock: () => longNow.t });
    g3.start();
    expect(g3.pendingOffline).not.toBeNull();
  });
});
