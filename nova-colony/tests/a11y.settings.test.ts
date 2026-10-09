import { afterEach, describe, expect, it, vi } from 'vitest';
import { reducedMotion, resetMotionCache } from '../src/core/motion';
import { createInitialState } from '../src/core/state';
import { migrateState } from '../src/platform/saveMigrate';

describe('accessibility settings', () => {
  afterEach(() => {
    resetMotionCache();
    vi.unstubAllGlobals();
  });

  it('new and old saves default both options to off', () => {
    const s = createInitialState(1, 0);
    expect(s.settings.largeText).toBe(false);
    expect(s.settings.reduceMotion).toBe(false);
    const old = JSON.parse(JSON.stringify(s));
    delete old.settings.largeText;
    delete old.settings.reduceMotion;
    const loaded = migrateState(old);
    expect(loaded.settings.largeText).toBe(false);
    expect(loaded.settings.reduceMotion).toBe(false);
  });

  it('reduced motion follows the toggle, or the phone setting when the toggle is off', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }));
    expect(reducedMotion({ reduceMotion: false })).toBe(true);
    resetMotionCache();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(reducedMotion({ reduceMotion: false })).toBe(false);
    expect(reducedMotion({ reduceMotion: true })).toBe(true);
  });
});
