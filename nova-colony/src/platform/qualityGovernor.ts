/**
 * QualityGovernor — a small, pure state machine fed one frame time at a time. In auto mode, when the game
 * sustainably can't keep up it answers with the next lower level (high → medium → low). It never steps up and
 * does nothing in manual mode, so it cannot oscillate: the only ways back up are the player's.
 *
 * Measurement: frames are binned into one-second buckets, each giving that second's FPS (frames / seconds). The last
 * `windowS` buckets sit in a fixed ring; once it is full the median is taken every second and the level steps down
 * when it is below `minFps`. A median over 6 s ignores short hitches (a GC pause, an autosave, a burst of particles):
 * more than half of the window has to be slow. `minFps` sits just under the 30 fps the game must hold (and the 30 fps
 * cap of Battery saver, menus and an idle colony, core/loopPolicy.ts, which a capable phone meets exactly). A phone
 * that is far too slow does not wait for the window: `severeS` seconds in a row under `severeFps` step down at once.
 * Typical first step on a phone that cannot keep up: 8 s boot grace + 6 s window = 14 s (a crawl: 8 + 4 = 12 s).
 *
 * Only normal play is measured. The caller marks a frame `excluded` while a panel / sheet is open (the renderer
 * halves its frame rate then), the tab is hidden or the game is paused: the partial second is dropped and the next
 * `pauseGraceS` after it are skipped, but the samples gathered before stay valid. `hold(seconds)` throws the window
 * away and skips the next seconds: at boot (`bootGraceS`), after a quality change (detected here: the renderer
 * rebuilds materials and the shadow map), after the governor's own step and, from the caller, after a tier-up
 * rebuild or a resume from the background (`settleS`).
 *
 * No allocations after construction: two small Float64Arrays, sorted in place once per second.
 *
 * OWNER: meta agent (platform). Tests: tests/quality.governor.test.ts.
 */
import type { QualityLevel, QualityMode } from '../core/state';

export interface GovernorConfig {
  /** Seconds of normal play ignored after boot (shader compiles, world build, first textures). */
  bootGraceS: number;
  /** Seconds ignored after a quality change, a tier-up rebuild or a resume from the background. */
  settleS: number;
  /** Seconds ignored once an excluded stretch ends (a panel closing, the tab coming back). */
  pauseGraceS: number;
  /** Window length, in one-second samples. */
  windowS: number;
  /** Step down when the median FPS over the window is below this. */
  minFps: number;
  /** Step down at once after this many one-second samples in a row under `severeFps`. */
  severeS: number;
  severeFps: number;
}

export const GOVERNOR_DEFAULTS: Readonly<GovernorConfig> = {
  bootGraceS: 8,
  settleS: 5,
  pauseGraceS: 1,
  windowS: 6,
  minFps: 27,
  severeS: 4,
  severeFps: 12,
};

/** One level lower, or null at the floor. */
export function lowerQuality(q: QualityLevel): QualityLevel | null {
  return q === 'high' ? 'medium' : q === 'medium' ? 'low' : null;
}

/** Float slack so 60 × (1/60) s closes a one-second bucket and a 10 s grace ends after 10 s of frames. */
const EPS = 1e-6;

export class QualityGovernor {
  readonly cfg: GovernorConfig;
  /** Seconds of normal play still to skip. */
  private wait: number;
  private readonly ring: Float64Array;
  private readonly sorted: Float64Array;
  private head = 0;
  private count = 0;
  private bucketT = 0;
  private bucketN = 0;
  private lastMode: QualityMode | null = null;
  private lastQuality: QualityLevel | null = null;
  /** Median FPS of the last full window (NaN before the first one) — debugging / tests. */
  lastMedian = Number.NaN;
  /** Steps taken since construction. */
  steps = 0;

  constructor(cfg: Partial<GovernorConfig> = {}) {
    this.cfg = { ...GOVERNOR_DEFAULTS, ...cfg };
    this.cfg.windowS = Math.max(1, Math.round(this.cfg.windowS));
    this.cfg.severeS = Math.max(1, Math.min(this.cfg.windowS, Math.round(this.cfg.severeS)));
    this.ring = new Float64Array(this.cfg.windowS);
    this.sorted = new Float64Array(this.cfg.windowS);
    this.wait = this.cfg.bootGraceS;
  }

  /** Throw the window away and skip the next `seconds` of normal play (tier-up rebuild, resume, …). */
  hold(seconds: number = this.cfg.settleS): void {
    this.count = 0;
    this.head = 0;
    this.bucketT = 0;
    this.bucketN = 0;
    if (seconds > this.wait) this.wait = seconds;
  }

  /** Seconds still skipped before measuring resumes (debugging / tests). */
  get waiting(): number {
    return Math.max(0, this.wait);
  }

  /** One-second samples currently in the window. */
  get samples(): number {
    return this.count;
  }

  /**
   * Feed one frame. `dt` = wall-clock seconds since the previous frame; `mode` / `quality` = the settings as they are
   * now; `excluded` = this frame is not normal play. Returns the level to switch to when stepping down, else null.
   */
  update(dt: number, mode: QualityMode, quality: QualityLevel, excluded: boolean): QualityLevel | null {
    if (mode !== this.lastMode || quality !== this.lastQuality) {
      // the player (Settings) or the device pick changed the mode or level: let the renderer settle first
      const first = this.lastMode === null;
      this.lastMode = mode;
      this.lastQuality = quality;
      if (!first) this.hold(this.cfg.settleS);
    }
    if (!(dt > 0)) return null;
    if (excluded) {
      this.bucketT = 0;
      this.bucketN = 0;
      if (this.cfg.pauseGraceS > this.wait) this.wait = this.cfg.pauseGraceS;
      return null;
    }
    // grace periods run down in any mode, so switching to auto after a while waits `settleS`, not the boot grace
    if (this.wait > EPS) {
      this.wait -= dt;
      return null;
    }
    // manual mode belongs to the player; at low there is nothing left to step down to
    if (mode !== 'auto' || quality === 'low') return null;

    this.bucketT += dt;
    this.bucketN++;
    if (this.bucketT < 1 - EPS) return null;
    this.ring[this.head] = this.bucketN / this.bucketT;
    this.head = (this.head + 1) % this.ring.length;
    if (this.count < this.ring.length) this.count++;
    this.bucketT = 0;
    this.bucketN = 0;
    const severe = this.severe();
    if (this.count < this.ring.length && !severe) return null;

    if (severe) {
      this.lastMedian = this.ring[(this.head - 1 + this.ring.length) % this.ring.length]; // the latest second (logging)
    } else {
      const med = this.median();
      this.lastMedian = med;
      if (med >= this.cfg.minFps) return null;
    }
    const next = lowerQuality(quality);
    if (!next) return null;
    this.steps++;
    // expect the caller to apply `next`; measure again only after it has settled
    this.lastQuality = next;
    this.hold(this.cfg.settleS);
    return next;
  }

  /** The last `severeS` one-second samples are all under `severeFps` (a crawl: no need to wait for the window). */
  private severe(): boolean {
    const k = this.cfg.severeS;
    if (this.count < k) return false;
    const n = this.ring.length;
    for (let i = 1; i <= k; i++) if (this.ring[(this.head - i + n) % n] >= this.cfg.severeFps) return false;
    return true;
  }

  /** Median of the full ring (insertion sort into the scratch array: 6 numbers, once a second). */
  private median(): number {
    const n = this.ring.length;
    const a = this.sorted;
    for (let i = 0; i < n; i++) {
      const v = this.ring[i];
      let j = i - 1;
      while (j >= 0 && a[j] > v) {
        a[j + 1] = a[j];
        j--;
      }
      a[j + 1] = v;
    }
    return n % 2 ? a[(n - 1) >> 1] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }
}
