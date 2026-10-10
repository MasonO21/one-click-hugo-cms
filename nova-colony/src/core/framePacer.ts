/**
 * Frame pacing for phones: never simulate + draw above `fps`, whatever the display refresh rate. 90/120 Hz
 * screens would otherwise run the whole game 1.5–2× as often as needed (battery, heat), and Battery saver
 * holds it at 30. Works on the requestAnimationFrame timestamps, so a 60 Hz screen at 60 fps runs every frame.
 */
/** rAF timestamps jitter by well under a millisecond; this keeps a 60 Hz screen from ever skipping at 60 fps. */
const TOLERANCE_MS = 3;

export class FramePacer {
  private next = 0;

  /** Should the display frame at `t` (ms, the rAF timestamp) run, given the cap `fps`? */
  due(t: number, fps: number): boolean {
    const interval = 1000 / fps;
    if (t < this.next - TOLERANCE_MS) return false;
    // keep the cadence while on time; after a stall (background, long frame) restart from now
    this.next = t - this.next > interval ? t + interval : this.next + interval;
    return true;
  }
}

/** The frame-rate cap in use: 30 in Battery saver, else 60. */
export function fpsCap(batterySaver: boolean): number {
  return batterySaver ? 30 : 60;
}

/**
 * Seconds to step for the display frame at `t` (ms, the rAF timestamp) after the last one at `last`: never negative
 * (a frame that arrives after a long blocking task, such as the shader warm-up, can carry a timestamp from before it,
 * and a negative step froze the HUD's poll timers for seconds) and at most `max` (a stall is not a fast-forward).
 */
export function frameStep(t: number, last: number, max = 0.1): number {
  const dt = (t - last) / 1000;
  return dt > 0 ? Math.min(max, dt) : 0;
}

