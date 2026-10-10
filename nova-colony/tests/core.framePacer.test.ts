/** Frame pacing: the game never runs above its cap, whatever the screen's refresh rate. */
import { describe, expect, it } from 'vitest';
import { FramePacer, fpsCap, frameStep } from '../src/core/framePacer';

/** Run `seconds` of display frames at `hz` (with ±0.3 ms rAF jitter) and count the frames the pacer lets through. */
function run(hz: number, cap: number, seconds = 2): number {
  const p = new FramePacer();
  let n = 0;
  const frames = Math.round(hz * seconds);
  for (let i = 1; i <= frames; i++) {
    const jitter = ((i * 7919) % 7) / 10 - 0.3;
    if (p.due((i * 1000) / hz + jitter, cap)) n++;
  }
  return n / seconds;
}

describe('frame pacer', () => {
  it('a 60 Hz screen at the 60 cap runs every frame', () => {
    expect(run(60, 60)).toBe(60);
  });
  it('120 Hz and 90 Hz screens are held to about 60', () => {
    expect(run(120, 60)).toBeCloseTo(60, -1);
    const r90 = run(90, 60);
    expect(r90).toBeGreaterThanOrEqual(55);
    expect(r90).toBeLessThanOrEqual(62);
  });
  it('Battery saver holds every screen to about 30', () => {
    for (const hz of [60, 90, 120]) {
      const r = run(hz, 30);
      expect(r, `${hz} Hz`).toBeGreaterThanOrEqual(29);
      expect(r, `${hz} Hz`).toBeLessThanOrEqual(31);
    }
  });
  it('after a stall (app in the background) it restarts from now instead of bursting to catch up', () => {
    const p = new FramePacer();
    expect(p.due(1000, 60)).toBe(true);
    expect(p.due(60_000, 60)).toBe(true);
    expect(p.due(60_000 + 8.3, 60)).toBe(false);
    expect(p.due(60_000 + 16.7, 60)).toBe(true);
  });
  it('the cap is 30 in Battery saver, else 60', () => {
    expect(fpsCap(true)).toBe(30);
    expect(fpsCap(false)).toBe(60);
  });
});

describe('frameStep', () => {
  it('steps the time since the last frame, capped', () => {
    expect(frameStep(1016, 1000)).toBeCloseTo(0.016, 6);
    expect(frameStep(4000, 1000)).toBe(0.1);
    expect(frameStep(4000, 1000, 0.25)).toBe(0.25);
  });

  it('never steps backwards: a frame stamped before the last one (after a long blocking task) is a zero step', () => {
    expect(frameStep(1000, 6800)).toBe(0);
    expect(frameStep(1000, 1000)).toBe(0);
  });
});
