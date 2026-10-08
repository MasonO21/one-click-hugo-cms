/**
 * AutoQuality — automatic graphics quality, wired into the boot sequence and the frame loop (main.ts).
 *
 *  - Boot (`decide`, called by Renderer.init once the WebGL context exists and before the scene is built): in auto
 *    mode, when no level has been picked for this device yet, read the device signals and pick one
 *    (deviceQuality.ts). The pick is stored in settings (`quality` + `qualityDevice`), so it runs once per device,
 *    not on every launch.
 *  - Every frame (`update`): feed the governor (qualityGovernor.ts) the frame time and whether this is normal play.
 *    When it steps down, write the lower level to settings (the renderer applies it on its next frame), save right
 *    away so the next launch starts there, and show one toast.
 *  - Settings → Auto (`enableAuto`) returns to auto mode with a fresh device pick; Settings → a level
 *    (`setManual`) hands the level to the player and the governor stops.
 *
 * The renderer only ever reads `settings.quality`; nothing here touches render internals.
 *
 * OWNER: meta agent (platform). Tests: tests/quality.auto.test.ts.
 */
import type { Game } from '../core/Game';
import type { QualityLevel } from '../core/state';
import { reportLoopError } from '../core/guard';
import { deviceKey, pickQuality, readDeviceSignals, type DeviceSignals, type QualityPick } from './deviceQuality';
import { QualityGovernor, type GovernorConfig } from './qualityGovernor';
import { onForeground } from './lifecycle';
import { isNative } from './env';

declare module '../core/Game' {
  interface Game {
    /** The auto-quality controller (set by its constructor). Settings uses it for the Auto button. */
    autoQuality?: AutoQuality;
  }
}

type AnyGl = WebGLRenderingContext | WebGL2RenderingContext;

export const QUALITY_LABEL: Record<QualityLevel, string> = { low: 'Low', medium: 'Medium', high: 'High' };

export interface AutoQualityOptions {
  governor?: Partial<GovernorConfig>;
  /** Device signals override (tests); default: read from the browser. */
  readSignals?: (gl: AnyGl | null) => DeviceSignals;
}

export class AutoQuality {
  readonly governor: QualityGovernor;
  /** Signals read at boot, reused when the player picks Auto again (the device has not changed). */
  signals: DeviceSignals | null = null;
  /** The last device pick and why (console / debugging). */
  lastPick: QualityPick | null = null;
  private offs: Array<() => void> = [];
  private wasHidden = false;
  private failed = false;

  constructor(
    private readonly game: Game,
    private readonly opts: AutoQualityOptions = {},
  ) {
    this.governor = new QualityGovernor(opts.governor);
    game.autoQuality = this;
  }

  private read(gl: AnyGl | null): DeviceSignals {
    return this.opts.readSignals ? this.opts.readSignals(gl) : readDeviceSignals(gl, isNative());
  }

  /**
   * Boot-time device check. Only in auto mode, and only when no level has been picked for this device yet.
   * Never throws: on any failure the level simply stays what it was.
   */
  decide(gl?: AnyGl | null): void {
    try {
      this.signals = this.read(gl ?? null);
      const s = this.game.state.settings;
      if (s.qualityMode !== 'auto') return;
      const key = deviceKey(this.signals);
      if (s.qualityDevice === key) return; // picked on an earlier launch (and maybe stepped down since): keep it
      this.pick(this.signals, key);
    } catch (e) {
      console.warn(`[quality] device check failed; staying at ${this.game.state.settings.quality}`, e);
    }
  }

  private pick(sig: DeviceSignals, key: string): void {
    const s = this.game.state.settings;
    const p = pickQuality(sig);
    s.quality = p.quality;
    s.qualityDevice = key;
    this.lastPick = p;
    console.info(`[quality] auto picked ${p.quality}: ${p.reason}`);
  }

  /** Settings → Auto: automatic again, with a fresh device pick (which may raise the level). Returns the level. */
  enableAuto(): QualityLevel {
    const s = this.game.state.settings;
    s.qualityMode = 'auto';
    try {
      const sig = this.signals ?? this.read(null);
      this.signals = sig;
      this.pick(sig, deviceKey(sig));
    } catch (e) {
      console.warn('[quality] device check failed', e);
    }
    return s.quality;
  }

  /** Settings → a level: the player's choice from now on; the governor leaves it alone. */
  setManual(q: QualityLevel): void {
    const s = this.game.state.settings;
    s.qualityMode = 'manual';
    s.quality = q;
  }

  /** Listen for the moments the frame rate is not representative. Call once, after `game.start()`. */
  attach(): this {
    const hold = () => this.governor.hold();
    const bus = this.game.bus;
    this.offs.push(
      // a tier-up re-tiers every facility over the next frames; fast travel rebuilds the terrain and nature around
      // the player
      bus.on('colony:tierUp', hold),
      bus.on('world:fastTravel', hold),
      // back from the background: the first frames catch up on timers, textures and audio
      onForeground(hold),
    );
    return this;
  }

  dispose(): void {
    this.offs.forEach((f) => f());
    this.offs = [];
    if (this.game.autoQuality === this) delete this.game.autoQuality;
  }

  /** Per frame from the main loop, with the loop's dt (seconds). Allocation-free; never throws. */
  update(dt: number): void {
    if (this.failed) return;
    try {
      const g = this.game;
      const s = g.state.settings;
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      if (this.wasHidden && !hidden) this.governor.hold(); // visible again (covers WebViews without pageshow)
      this.wasHidden = hidden;
      const excluded = hidden || g.view.panelOpen || g.isPaused();
      const next = this.governor.update(dt, s.qualityMode, s.quality, excluded);
      if (next) this.stepDown(next);
    } catch (e) {
      this.failed = true; // a broken governor must never cost a frame again
      reportLoopError('quality', e);
    }
  }

  private stepDown(next: QualityLevel): void {
    const g = this.game;
    const s = g.state.settings;
    const from = s.quality;
    s.quality = next;
    console.info(`[quality] auto: median ${this.governor.lastMedian.toFixed(1)} fps over ${this.governor.cfg.windowS} s — ${from} → ${next}`);
    g.toast(`Smoother graphics: switched to ${QUALITY_LABEL[next]} · change in Settings`, 'info', '✨');
    // persist now, so the next launch starts at the lower level even if the app is closed in a minute
    if (g.saves) void g.saves.save(g, true);
  }
}
