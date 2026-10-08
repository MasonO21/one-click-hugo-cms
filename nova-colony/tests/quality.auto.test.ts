/**
 * Automatic graphics quality — the controller (platform/autoQuality.ts) on a real Game: the once-per-device boot
 * pick, the governor wired to settings / toasts / saves, the Settings entry points, and a downgrade surviving a reload.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutoQuality } from '../src/platform/autoQuality';
import { GOVERNOR_DEFAULTS } from '../src/platform/qualityGovernor';
import type { DeviceSignals } from '../src/platform/deviceQuality';
import { SaveManager } from '../src/platform/save';
import { MemoryStore } from '../src/platform/mock';
import type { GameState } from '../src/core/state';
import { makeGame, makeServices } from './meta.helpers';

const SWIFTSHADER: DeviceSignals = { gpu: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', memoryGB: 8, cores: 8, dpr: 1, screenW: 1280, screenH: 720, mobile: false };
const PIXEL8: DeviceSignals = { gpu: 'Mali-G715', memoryGB: 8, cores: 9, dpr: 2.625, screenW: 412, screenH: 915, mobile: true };
const GALAXY_A14: DeviceSignals = { gpu: 'Mali-G52', memoryGB: 4, cores: 8, dpr: 2, screenW: 360, screenH: 800, mobile: true };

function setup(signals: DeviceSignals, state?: GameState) {
  const t = makeGame({ state });
  const toasts: string[] = [];
  t.game.bus.on('ui:toast', (e) => toasts.push(e.text));
  const read = vi.fn(() => signals);
  const aq = new AutoQuality(t.game, { readSignals: read });
  return { ...t, aq, toasts, read, settings: t.game.state.settings };
}

/** Feed the controller `seconds` of frames at `fps`, like the main loop. */
function play(aq: AutoQuality, seconds: number, fps: number): void {
  const dt = 1 / fps;
  for (let t = 0; t < seconds - 1e-9; t += dt) aq.update(dt);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('auto quality: boot pick', () => {
  it('a fresh game on SwiftShader picks low and remembers the device', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const t = setup(SWIFTSHADER);
    t.aq.decide(null);
    expect(t.settings.quality).toBe('low');
    expect(t.settings.qualityMode).toBe('auto');
    expect(t.settings.qualityDevice).toMatch(/swiftshader/);
    expect(t.aq.lastPick?.reason).toMatch(/software/);
  });

  it('a fresh game on a Pixel 8 picks high; on a Galaxy A14 low', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const a = setup(PIXEL8);
    a.aq.decide(null);
    expect(a.settings.quality).toBe('high');
    const b = setup(GALAXY_A14);
    b.aq.decide(null);
    expect(b.settings.quality).toBe('low');
  });

  it('runs once per device: the next launch keeps the stored level (including a downgrade)', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const t = setup(PIXEL8);
    t.aq.decide(null);
    t.settings.quality = 'medium'; // stepped down by the governor last session
    const next = new AutoQuality(t.game, { readSignals: () => PIXEL8 });
    next.decide(null);
    expect(t.settings.quality).toBe('medium');
    expect(next.lastPick).toBeNull();
  });

  it('a save restored onto a different device gets that device’s own pick', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const t = setup(PIXEL8);
    t.aq.decide(null);
    expect(t.settings.quality).toBe('high');
    new AutoQuality(t.game, { readSignals: () => GALAXY_A14 }).decide(null);
    expect(t.settings.quality).toBe('low');
  });

  it('manual mode is never touched at boot', () => {
    const t = setup(SWIFTSHADER);
    t.settings.qualityMode = 'manual';
    t.settings.quality = 'high';
    t.aq.decide(null);
    expect(t.settings.quality).toBe('high');
    expect(t.settings.qualityDevice).toBe('');
  });

  it('a throwing signal reader never blocks boot', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = makeGame();
    const aq = new AutoQuality(t.game, {
      readSignals: () => {
        throw new Error('no WebGL');
      },
    });
    expect(() => aq.decide(null)).not.toThrow();
    expect(t.game.state.settings.quality).toBe('medium');
    expect(warn).toHaveBeenCalled();
  });
});

describe('auto quality: Settings entry points', () => {
  it('picking a level makes it manual; picking Auto re-runs the device pick', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const t = setup(PIXEL8);
    t.aq.decide(null);
    t.aq.setManual('low');
    expect(t.settings).toMatchObject({ qualityMode: 'manual', quality: 'low' });
    expect(t.aq.enableAuto()).toBe('high');
    expect(t.settings).toMatchObject({ qualityMode: 'auto', quality: 'high' });
  });

  it('Auto without a boot reading (no WebGL) still decides, from what the browser reports', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const t = setup(GALAXY_A14);
    t.settings.qualityMode = 'manual';
    expect(t.aq.enableAuto()).toBe('low');
    expect(t.read).toHaveBeenCalledWith(null);
  });
});

describe('auto quality: runtime step down', () => {
  function strongDevice() {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const t = setup(PIXEL8);
    t.aq.decide(null);
    t.aq.attach();
    const save = vi.fn(async () => {});
    t.game.saves = { save } as unknown as NonNullable<typeof t.game.saves>;
    return { ...t, save };
  }

  it('steps down once after sustained low FPS, toasts once and saves', () => {
    const t = strongDevice();
    expect(t.settings.quality).toBe('high');
    play(t.aq, GOVERNOR_DEFAULTS.bootGraceS + GOVERNOR_DEFAULTS.windowS, 14);
    expect(t.settings.quality).toBe('medium');
    expect(t.settings.qualityMode).toBe('auto'); // still auto: it may go lower, never higher
    expect(t.toasts).toEqual(['Smoother graphics: switched to Medium · change in Settings']);
    expect(t.save).toHaveBeenCalledTimes(1);
    // the lower level runs fine: no more steps, no more toasts
    play(t.aq, 120, 50);
    expect(t.settings.quality).toBe('medium');
    expect(t.toasts).toHaveLength(1);
  });

  it('ignores a slow stretch while a panel is open or the game is paused', () => {
    const t = strongDevice();
    play(t.aq, 12, 60);
    t.game.view.panelOpen = true;
    play(t.aq, 30, 10);
    t.game.view.panelOpen = false;
    t.game.setPaused(true);
    play(t.aq, 30, 10);
    t.game.setPaused(false);
    play(t.aq, 30, 60);
    expect(t.settings.quality).toBe('high');
    expect(t.toasts).toEqual([]);
  });

  it('a tier-up rebuild resets the window', () => {
    const t = strongDevice();
    play(t.aq, 10 + 7, 14); // 7 slow seconds: one short of a verdict
    expect(t.aq.governor.samples).toBe(7);
    t.game.bus.emit('colony:tierUp', { tier: 1 });
    expect(t.aq.governor.samples).toBe(0);
    play(t.aq, 1.5, 14);
    expect(t.settings.quality).toBe('high');
  });

  it('respects manual mode', () => {
    const t = strongDevice();
    t.aq.setManual('high');
    play(t.aq, 120, 10);
    expect(t.settings.quality).toBe('high');
    expect(t.toasts).toEqual([]);
  });

  it('a governor that throws disables itself instead of failing every frame', () => {
    const t = strongDevice();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(t.aq.governor, 'update').mockImplementation(() => {
      throw new Error('boom');
    });
    t.aq.update(1 / 60);
    t.aq.update(1 / 60);
    expect(t.aq.governor.update).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalledTimes(1);
  });
});

describe('auto quality: a downgrade survives a reload', () => {
  it('next launch loads the lower level and does not re-run the device pick', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const services = makeServices();
    services.store = new MemoryStore();
    const t = makeGame({ services });
    const saves = new SaveManager(services, { hooks: false, now: () => t.clock.now });
    saves.attach(t.game);
    const aq = new AutoQuality(t.game, { readSignals: () => PIXEL8 });
    aq.decide(null);
    expect(t.game.state.settings.quality).toBe('high');
    play(aq, 10 + 8, 14);
    expect(t.game.state.settings.quality).toBe('medium');
    await new Promise((r) => setTimeout(r, 0)); // the step-down save is async
    saves.detach();

    const loaded = (await new SaveManager(services, { hooks: false }).load())!;
    expect(loaded.settings).toMatchObject({ quality: 'medium', qualityMode: 'auto' });
    const t2 = makeGame({ state: loaded, services });
    const aq2 = new AutoQuality(t2.game, { readSignals: () => PIXEL8 });
    aq2.decide(null);
    expect(t2.game.state.settings.quality).toBe('medium');
    expect(aq2.lastPick).toBeNull();
  });
});
