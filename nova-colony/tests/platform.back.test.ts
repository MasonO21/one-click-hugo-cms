/**
 * Android back button: undo the most specific thing on screen, and only at rest send the app to the background
 * (never finish the activity, which is what Capacitor does when no listener is registered).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { backAction } from '../src/ui/logic/back';

const h = vi.hoisted(() => ({
  platform: 'android' as 'android' | 'ios' | 'web',
  back: null as null | (() => void),
  minimize: vi.fn(async () => {}),
  removed: 0,
}));

vi.mock('../src/platform/env', () => ({
  platformName: () => h.platform,
  isNative: () => h.platform !== 'web',
  env: () => '',
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (name: string, fn: () => void) => {
      if (name === 'backButton') h.back = fn;
      return { remove: async () => void h.removed++ };
    }),
    minimizeApp: h.minimize,
  },
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('back cascade', () => {
  it('closes a panel first, then leaves build mode, then clears the selection, else nothing', () => {
    expect(backAction({ panelOpen: true, buildActive: true, hasSelection: true })).toBe('panel');
    expect(backAction({ panelOpen: false, buildActive: true, hasSelection: true })).toBe('build');
    expect(backAction({ panelOpen: false, buildActive: false, hasSelection: true })).toBe('selection');
    expect(backAction({ panelOpen: false, buildActive: false, hasSelection: false })).toBe('none');
  });
});

describe('onBackButton (Android)', () => {
  beforeEach(() => {
    h.platform = 'android';
    h.back = null;
    h.minimize.mockClear();
    h.removed = 0;
    vi.resetModules();
  });

  it('a used press stays in the game; an unused one backgrounds the app instead of exiting', async () => {
    const { onBackButton } = await import('../src/platform/lifecycle');
    let used = true;
    onBackButton(() => used);
    await flush();
    expect(h.back).toBeTypeOf('function');
    h.back!();
    expect(h.minimize).not.toHaveBeenCalled();
    used = false;
    h.back!();
    await flush();
    expect(h.minimize).toHaveBeenCalledTimes(1);
  });

  it('a throwing handler never sends the player out of the game', async () => {
    const { onBackButton } = await import('../src/platform/lifecycle');
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    onBackButton(() => {
      throw new Error('boom');
    });
    await flush();
    h.back!();
    await flush();
    expect(h.minimize).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('unsubscribes, including when disposed before the plugin loaded', async () => {
    const { onBackButton } = await import('../src/platform/lifecycle');
    onBackButton(() => true)();
    await flush();
    expect(h.removed).toBe(1);
    const off = onBackButton(() => true);
    await flush();
    off();
    expect(h.removed).toBe(2);
  });

  it('does nothing on iOS and the web (no hardware back)', async () => {
    h.platform = 'ios';
    const { onBackButton } = await import('../src/platform/lifecycle');
    onBackButton(() => false);
    await flush();
    expect(h.back).toBeNull();
  });
});
