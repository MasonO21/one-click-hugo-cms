/**
 * The main loop must survive an exception anywhere in a frame (QA3 #11: one throw used to unwind the
 * requestAnimationFrame callback before it re-armed itself, freezing the world for good).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { guarded, loopFailures, reportLoopError, resetLoopFailures } from '../src/core/guard';
import { EventBus } from '../src/core/events';
import { makeGame } from './world.helpers';

afterEach(() => {
  resetLoopFailures();
  vi.restoreAllMocks();
});

describe('main loop guard', () => {
  it('a system that throws is skipped for the frame; the other systems and the clock keep running', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rig = makeGame();
    const g = rig.game;
    const broken = vi.spyOn(g.sys.crafting, 'update').mockImplementation(() => {
      throw new Error('boom');
    });
    const economy = vi.spyOn(g.sys.economy, 'update');
    const liveops = vi.spyOn(g.sys.liveops, 'update');
    const t0 = g.state.playTime;
    const day0 = g.state.time.dayTime;

    expect(() => rig.step(2)).not.toThrow();

    expect(broken).toHaveBeenCalledTimes(40);
    // systems before and after the broken one still ran every frame
    expect(economy).toHaveBeenCalledTimes(40);
    expect(liveops).toHaveBeenCalledTimes(40);
    expect(g.state.playTime).toBeCloseTo(t0 + 2, 5);
    expect(g.state.time.dayTime).toBeGreaterThan(day0);
    // logged once, counted every time
    expect(loopFailures().get('sim crafting')).toBe(40);
    expect(err.mock.calls.filter((c) => String(c[0]).includes('sim crafting'))).toHaveLength(1);
  });

  it('a broken step recovers as soon as it stops throwing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rig = makeGame();
    let fail = true;
    const real = rig.game.sys.economy.update.bind(rig.game.sys.economy);
    const spy = vi.spyOn(rig.game.sys.economy, 'update').mockImplementation((dt: number) => {
      if (fail) throw new Error('transient');
      real(dt);
    });
    rig.step(0.5);
    fail = false;
    rig.step(0.5);
    expect(spy).toHaveBeenCalledTimes(20);
    expect(loopFailures().get('sim economy')).toBe(10);
  });

  it('guarded() reports and swallows, and returns whether the step completed', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(guarded('render', () => undefined)).toBe(true);
    expect(guarded('render', () => {
      throw new Error('lost context');
    })).toBe(false);
    expect(guarded('render', () => {
      throw new Error('lost context');
    })).toBe(false);
    reportLoopError('ui', new Error('x'));
    expect(loopFailures().get('render')).toBe(2);
    expect(loopFailures().get('ui')).toBe(1);
    expect(err).toHaveBeenCalledTimes(2);
  });

  it('a throwing onAny listener (analytics) does not stop the event reaching later listeners', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bus = new EventBus();
    const seen: string[] = [];
    bus.onAny(() => {
      throw new Error('analytics down');
    });
    bus.onAny((type) => seen.push(type));
    expect(() => bus.emit('fx:shake', { strength: 1 })).not.toThrow();
    expect(seen).toEqual(['fx:shake']);
  });
});
