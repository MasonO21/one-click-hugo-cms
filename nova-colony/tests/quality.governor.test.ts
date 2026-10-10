/**
 * Automatic graphics quality — the runtime governor (platform/qualityGovernor.ts): a pure state machine fed frame
 * times. Steps down one level after sustained low FPS (sooner on a crawl), ignores spikes and excluded periods, never
 * steps up, and leaves manual mode alone.
 */
import { describe, expect, it } from 'vitest';
import { GOVERNOR_DEFAULTS, QualityGovernor, lowerQuality } from '../src/platform/qualityGovernor';
import type { QualityLevel, QualityMode } from '../src/core/state';

/** Drives a governor the way the frame loop does, applying its steps to a settings-like object. */
class Sim {
  readonly gov: QualityGovernor;
  mode: QualityMode = 'auto';
  quality: QualityLevel = 'high';
  steps: QualityLevel[] = [];
  constructor(cfg = {}) {
    this.gov = new QualityGovernor(cfg);
  }
  /** Run `seconds` of frames at `fps`. */
  run(seconds: number, fps: number, excluded = false): this {
    const dt = 1 / fps;
    for (let t = 0; t < seconds - 1e-9; t += dt) {
      const next = this.gov.update(dt, this.mode, this.quality, excluded);
      if (next) {
        this.steps.push(next);
        this.quality = next;
      }
    }
    return this;
  }
}

describe('governor: steps down after sustained low FPS', () => {
  it('high → medium after the boot grace plus one full 6 s window under 27 fps', () => {
    const s = new Sim();
    s.run(GOVERNOR_DEFAULTS.bootGraceS, 15); // boot: ignored however slow
    expect(s.steps).toEqual([]);
    s.run(5.5, 15);
    expect(s.steps).toEqual([]); // window not full yet
    s.run(1, 15);
    expect(s.steps).toEqual(['medium']);
    expect(s.gov.lastMedian).toBeCloseTo(15, 0);
  });

  it('a phone that cannot hold 30 fps steps down within 15 s of boot', () => {
    const s = new Sim();
    let t = 0;
    while (!s.steps.length && t < 60) {
      s.run(0.5, 24);
      t += 0.5;
    }
    expect(s.steps).toEqual(['medium']);
    expect(t).toBeLessThanOrEqual(15);
  });

  it('a crawl (under 12 fps) steps down after 4 s instead of the full window', () => {
    const s = new Sim().run(GOVERNOR_DEFAULTS.bootGraceS, 60);
    s.run(3.5, 8);
    expect(s.steps).toEqual([]);
    s.run(1, 8);
    expect(s.steps).toEqual(['medium']);
    // and after the settle period, another 4 s crawl at medium steps to low
    s.run(GOVERNOR_DEFAULTS.settleS + 4.5, 8);
    expect(s.steps).toEqual(['medium', 'low']);
  });

  it('keeps going one level at a time (medium → low) after the settle period, then stops at the floor', () => {
    const s = new Sim().run(8 + 6, 15);
    expect(s.steps).toEqual(['medium']);
    s.run(GOVERNOR_DEFAULTS.settleS + 5.5, 15);
    expect(s.steps).toEqual(['medium']); // settling + refilling the window
    s.run(1, 15);
    expect(s.steps).toEqual(['medium', 'low']);
    s.run(120, 5);
    expect(s.steps).toEqual(['medium', 'low']); // nothing below low
    expect(s.gov.steps).toBe(2);
  });

  it('just above the threshold is fine; just below steps down', () => {
    expect(new Sim().run(40, 28).steps).toEqual([]);
    expect(new Sim().run(40, 25).steps).toEqual(['medium', 'low']);
  });

  it('a steady 60 fps (or a 30 fps low-power cap) never steps down', () => {
    expect(new Sim().run(300, 60).steps).toEqual([]);
    expect(new Sim().run(300, 30).steps).toEqual([]);
  });

  it('works with frame times clamped by the loop (dt ≤ 0.1 s still reads as ≤ 10 fps)', () => {
    expect(new Sim().run(20, 10).steps).toEqual(['medium']);
  });
});

describe('governor: ignores short spikes', () => {
  it('3 slow seconds inside 8 s of good play are not "sustained"', () => {
    const s = new Sim().run(8, 60);
    for (let i = 0; i < 10; i++) s.run(5, 60).run(3, 8); // repeated 3 s hitches every 8 s
    expect(s.steps).toEqual([]);
  });

  it('a single long hitch (one huge frame) does not step down', () => {
    const s = new Sim().run(12, 60);
    s.gov.update(0.1, 'auto', 'high', false); // the loop clamps a 2 s stall to 0.1
    s.run(30, 60);
    expect(s.steps).toEqual([]);
  });

  it('sustained means more than half the window: 4 slow seconds of 6 do step down', () => {
    const s = new Sim().run(8, 60).run(3, 60).run(4, 18);
    expect(s.steps).toEqual(['medium']);
  });
});

describe('governor: excluded periods', () => {
  it('the first 8 s after boot never count', () => {
    const s = new Sim().run(8, 5);
    expect(s.steps).toEqual([]);
    expect(s.gov.samples).toBe(0);
  });

  it('slow frames while a panel is open / the tab is hidden are ignored', () => {
    const s = new Sim().run(8, 60);
    s.run(60, 10, true);
    expect(s.steps).toEqual([]);
    expect(s.gov.samples).toBe(0);
  });

  it('good samples before and after a panel still make one window (panels pause, not reset)', () => {
    const s = new Sim().run(8, 60).run(3, 60);
    expect(s.gov.samples).toBe(3);
    s.run(3, 30, true); // panel open
    s.run(GOVERNOR_DEFAULTS.pauseGraceS, 60); // grace after it closes
    expect(s.gov.samples).toBe(3);
    s.run(3, 60);
    expect(s.gov.samples).toBe(6);
  });

  it('the second after a panel closes is skipped', () => {
    const s = new Sim().run(10, 60);
    s.run(2, 60, true);
    s.run(0.99, 5); // the DOM settles: slow, but inside the grace
    s.run(6, 60);
    expect(s.gov.lastMedian).toBeGreaterThan(55);
  });

  it('hold() (tier-up rebuild, resume from background) throws the window away and skips the next seconds', () => {
    const s = new Sim().run(8, 60).run(5, 15);
    expect(s.gov.samples).toBe(5);
    s.gov.hold();
    expect(s.gov.samples).toBe(0);
    s.run(GOVERNOR_DEFAULTS.settleS - 0.1, 5); // the rebuild itself: ignored
    expect(s.steps).toEqual([]);
    s.run(8, 60);
    expect(s.steps).toEqual([]);
  });

  it('a quality change from outside (the player, the device pick) restarts measuring after a settle period', () => {
    const s = new Sim().run(8, 60).run(5, 15);
    expect(s.gov.samples).toBe(5);
    s.quality = 'medium';
    s.run(GOVERNOR_DEFAULTS.settleS, 15);
    expect(s.steps).toEqual([]);
    expect(s.gov.samples).toBe(0);
  });
});

describe('governor: never steps up, no oscillation', () => {
  it('a recovered frame rate after a step down does not raise the level again', () => {
    const s = new Sim().run(8 + 6.5, 15);
    expect(s.steps).toEqual(['medium']);
    s.run(600, 60);
    expect(s.quality).toBe('medium');
    expect(s.steps).toEqual(['medium']);
  });

  it('alternating fast and slow minutes only ever goes down, one level per sustained slow stretch', () => {
    const s = new Sim();
    for (let i = 0; i < 6; i++) s.run(60, 60).run(30, 12);
    expect(s.steps).toEqual(['medium', 'low']);
  });

  it('lowerQuality only goes down', () => {
    expect(lowerQuality('high')).toBe('medium');
    expect(lowerQuality('medium')).toBe('low');
    expect(lowerQuality('low')).toBeNull();
  });
});

describe('governor: manual mode', () => {
  it('never touches a level the player picked', () => {
    const s = new Sim();
    s.mode = 'manual';
    s.run(300, 5);
    expect(s.steps).toEqual([]);
    expect(s.quality).toBe('high');
  });

  it('switching back to auto starts fresh after a settle period', () => {
    const s = new Sim();
    s.mode = 'manual';
    s.run(60, 5);
    s.mode = 'auto';
    s.run(GOVERNOR_DEFAULTS.settleS + 5.5, 15);
    expect(s.steps).toEqual([]);
    s.run(1, 15);
    expect(s.steps).toEqual(['medium']);
  });
});

describe('governor: cost', () => {
  it('allocates nothing per frame (fixed-size ring)', () => {
    const g = new QualityGovernor();
    const ring = (g as unknown as { ring: Float64Array }).ring;
    expect(ring).toBeInstanceOf(Float64Array);
    expect(ring.length).toBe(GOVERNOR_DEFAULTS.windowS);
    for (let i = 0; i < 100_000; i++) g.update(1 / 60, 'auto', 'high', false);
    expect((g as unknown as { ring: Float64Array }).ring).toBe(ring);
  });
});
