/**
 * A background stay (the app kept in memory, not closed) produces like a closed app: the same offline progress as a
 * launch, credited when the app comes back (platform/hooks.ts installResumeCredit + Game.creditAbsence).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installResumeCredit } from '../src/platform/hooks';
import { WELCOME_BACK_MIN_AWAY } from '../src/core/Game';
import { addBuilding, makeGame } from './economy.helpers';

const MIN = 60_000;

function rig() {
  const t = makeGame();
  addBuilding(t.game, 't_mine'); // 6 ore / min, offline efficiency 1 in the test data
  t.game.sys.economy.recompute();
  const bg = new Set<() => void>();
  const fg = new Set<() => void>();
  const off = installResumeCredit(t.game, {
    onBackground: (cb) => (bg.add(cb), () => bg.delete(cb)),
    onForeground: (cb) => (fg.add(cb), () => fg.delete(cb)),
  });
  const ready = vi.fn();
  t.game.bus.on('offline:ready', ready);
  return { ...t, off, ready, hide: () => bg.forEach((f) => f()), show: () => fg.forEach((f) => f()), ore: () => t.game.state.resources.amounts.t_ore ?? 0 };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('warm resume: offline progress for a background stay', () => {
  it('two hours in the background: Welcome Back with the same summary a launch would compute', () => {
    const r = rig();
    const expected = r.game.sys.economy.computeOffline(2 * 3600);
    r.hide();
    r.hide(); // several sources report the same transition
    r.clock.now += 2 * 3600_000;
    r.show();
    r.show();
    expect(r.ready).toHaveBeenCalledTimes(1);
    expect(r.game.pendingOffline).toMatchObject({ seconds: expected.seconds, gains: expected.gains });
    expect(r.game.state.lastTickAt).toBe(r.clock.now);
    r.game.sys.liveops.claimOffline(false);
    expect(r.ore()).toBe(expected.gains.t_ore);
  });

  it('capped like a launch (8 h)', () => {
    const r = rig();
    r.hide();
    r.clock.now += 20 * 3600_000;
    r.show();
    expect(r.game.pendingOffline!.seconds).toBe(8 * 3600);
  });

  it('a short break is credited quietly, an app switch not at all', () => {
    const r = rig();
    r.hide();
    r.clock.now += 3 * MIN;
    r.show();
    expect(r.ready).not.toHaveBeenCalled();
    expect(r.game.pendingOffline).toBeNull();
    expect(r.ore()).toBe(18);
    r.hide();
    r.clock.now += 40_000;
    r.show();
    expect(r.ore()).toBe(18);
    expect(WELCOME_BACK_MIN_AWAY).toBe(300);
  });

  it('a frame that runs before the foreground event does not hide the gap', () => {
    const r = rig();
    r.hide();
    r.clock.now += 3600_000;
    r.game.update(0.1); // the loop resumed first: lastTickAt is "now" already
    r.show();
    expect(r.ready).toHaveBeenCalledTimes(1);
    expect(r.game.pendingOffline!.away).toBeCloseTo(3600 - 0.1, 3);
  });

  it('time the game kept simulating meanwhile (inactive but visible) is not credited twice', () => {
    const r = rig();
    r.hide();
    for (let i = 0; i < 900; i++) {
      r.clock.now += 100;
      r.game.update(0.1); // 90 s of normal play while "inactive"
    }
    r.show();
    expect(r.ready).not.toHaveBeenCalled();
    const before = r.ore();
    expect(before).toBeLessThanOrEqual(10); // what 90 s of online production made, nothing on top
  });

  it('coming back without having gone away does nothing; unsubscribes', () => {
    const r = rig();
    r.clock.now += 3600_000;
    r.show(); // pageshow at load etc.
    expect(r.ready).not.toHaveBeenCalled();
    r.off();
    r.hide();
    r.clock.now += 3600_000;
    r.show();
    expect(r.ready).not.toHaveBeenCalled();
  });

  it('an earlier unclaimed Welcome Back is merged, never lost', () => {
    const r = rig();
    r.hide();
    r.clock.now += 3600_000;
    r.show();
    const first = r.game.pendingOffline!.gains.t_ore!;
    r.hide();
    r.clock.now += 3600_000;
    r.show();
    expect(r.game.pendingOffline!.gains.t_ore).toBe(2 * first);
    r.game.sys.liveops.claimOffline(false);
    expect(r.ore()).toBe(2 * first);
  });
});
