/**
 * Loop policy: how many frames per second the whole game loop (sim + 3D + HUD) runs at, for battery and heat.
 *
 *   60  normal play (FramePacer holds 90 / 120 Hz screens there)
 *   30  Battery saver
 *   30  a sheet or modal covers the world (menus): the world behind is dimmed, panels animate on CSS or their own
 *       requestAnimationFrame loops, and the renderer already draws at most ~30 fps behind them
 *   30  the colony is calm and the player has left the screen alone for IDLE_AFTER_S: no finger or key down, the
 *       player standing still, play mode, no raid. A cozy colony ticking along looks the same at 30; the first touch
 *       brings 60 back on the very next frame.
 *
 * The quality governor (platform/qualityGovernor.ts) steps down below 24 fps, so the 30 fps idle cap never reads as a
 * slow device. Allocation-free per frame. Wired in main.ts; tests: tests/core.loopPolicy.test.ts.
 */
import type { Game } from './Game';

/** Seconds without input after which a calm colony runs at IDLE_FPS. */
export const IDLE_AFTER_S = 12;
/** Frame rate of the idle colony, of menus and of Battery saver. */
export const IDLE_FPS = 30;
/** Normal frame rate. */
export const FULL_FPS = 60;

export interface LoopInputs {
  batterySaver: boolean;
  /** A sheet or modal covers the world (view.panelOpen). */
  covered: boolean;
  /** Seconds since the last touch / key / wheel, or since the player last moved. */
  idleS: number;
  /** Nothing that wants full motion is going on: play mode, no raid. */
  calm: boolean;
}

/** The loop's frame-rate cap for this frame. Pure. */
export function loopFps(i: LoopInputs): number {
  if (i.batterySaver || i.covered) return IDLE_FPS;
  if (i.calm && i.idleS >= IDLE_AFTER_S) return IDLE_FPS;
  return FULL_FPS;
}

/**
 * Tracks activity (input events, a held finger or key, the player moving) and answers the cap per frame.
 * `input()` is called from the DOM listeners main.ts installs; `fps()` once per display frame.
 */
export class LoopPolicy {
  /** Time of the last input or movement (ms, the rAF / performance.now clock); boot counts as activity. */
  private lastActive: number;
  /** Pointers currently down (a finger resting on the joystick sends no events but is play). */
  private down = 0;
  private px = NaN;
  private pz = NaN;

  constructor(
    private readonly game: Game,
    now: number = typeof performance !== 'undefined' ? performance.now() : 0,
  ) {
    this.lastActive = now;
  }

  /** Any touch, click, key or wheel. */
  input(now: number): void {
    this.lastActive = now;
  }

  pointerDown(now: number): void {
    this.down++;
    this.lastActive = now;
  }

  pointerUp(now: number): void {
    this.down = Math.max(0, this.down - 1);
    this.lastActive = now;
  }

  /** Forget held pointers (the app lost focus or was hidden: their `up` may never come). */
  release(now: number): void {
    this.down = 0;
    this.lastActive = now;
  }

  /** Seconds since the last activity at `now` (0 while a pointer or a movement key is held, or the player moves). */
  idleSeconds(now: number): number {
    const g = this.game;
    const p = g.state.player;
    const inp = g.input;
    const moved = Math.abs(p.x - this.px) > 1e-4 || Math.abs(p.z - this.pz) > 1e-4;
    this.px = p.x;
    this.pz = p.z;
    if (this.down > 0 || moved || inp.moveX !== 0 || inp.moveY !== 0 || inp.interactHeld) this.lastActive = now;
    return Math.max(0, (now - this.lastActive) / 1000);
  }

  /** The frame-rate cap for the frame at `now` (ms). */
  fps(now: number): number {
    const g = this.game;
    const st = g.state;
    return loopFps({
      batterySaver: st.settings.batterySaver,
      covered: g.view.panelOpen,
      idleS: this.idleSeconds(now),
      calm: g.view.mode === 'play' && st.combat.phase === 'peace',
    });
  }
}
