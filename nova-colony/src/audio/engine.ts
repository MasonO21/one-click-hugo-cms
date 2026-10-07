/**
 * AudioEngine — owns the single AudioContext and the shared mixing graph:
 *
 *   voices ─► sfxBus ─► (gentle high shelf) ─┐
 *   music  ─► musicBus ──────────────────────┴─► master ─► compressor/limiter ─► destination
 *   live-voice reverb send (built lazily) ─► convolver ─► sfxBus
 *
 * It also handles the mobile life-cycle: the context is created / resumed on the first user gesture
 * (iOS requirement), suspended while the page is hidden and resumed when it returns, and it copes
 * with iOS' "interrupted" state by retrying on every later gesture.
 *
 * The engine can also wrap a pre-built context (e.g. an OfflineAudioContext for dev rendering).
 */
import { createNoiseSet, createWaveTables, Synth, type NoiseSet, type WaveTables } from './synth';
import { volumeCurve } from './policy';

/** Trims applied after the user volume so default settings sit comfortably under the limiter. */
export const MUSIC_TRIM = 0.95;
export const SFX_TRIM = 0.9;

export interface EngineOptions {
  /** Use an existing context instead of creating one on the first gesture. */
  context?: BaseAudioContext;
  /** Treat the context as running regardless of its state (offline rendering). */
  alwaysRunning?: boolean;
  rnd?: () => number;
  /** Offline-context factory used to bake samples (tests inject a fake; default = OfflineAudioContext). */
  offlineFactory?: (channels: number, length: number, sampleRate: number) => OfflineAudioContext | null;
}

type AudioContextCtor = new (opts?: AudioContextOptions) => AudioContext;
type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

function defaultOffline(channels: number, length: number, sampleRate: number): OfflineAudioContext | null {
  const g = globalThis as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
  const Ctor = g.OfflineAudioContext ?? g.webkitOfflineAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor(channels, length, sampleRate);
  } catch {
    return null;
  }
}

function contextCtor(): AudioContextCtor | null {
  const g = globalThis as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

export class AudioEngine {
  ctx: BaseAudioContext | null = null;
  synth!: Synth;
  noise!: NoiseSet;
  waves!: WaveTables;
  master!: GainNode;
  musicBus!: GainNode;
  sfxBus!: GainNode;
  /** True when the browser has no WebAudio (everything becomes a no-op). */
  unsupported = false;

  private readonly rnd: () => number;
  private readonly forceRunning: boolean;
  private readonly impulses = new Map<string, AudioBuffer>();
  private readonly runningCbs = new Set<() => void>();
  private hiddenSuspended = false;
  private domCleanup: (() => void) | null = null;
  private lastVolumes = { music: -1, sfx: -1 };
  private reverbIn: GainNode | null = null;
  private readonly offlineFactory: NonNullable<EngineOptions['offlineFactory']>;

  constructor(opts: EngineOptions = {}) {
    this.rnd = opts.rnd ?? Math.random;
    this.forceRunning = opts.alwaysRunning ?? false;
    this.offlineFactory = opts.offlineFactory ?? defaultOffline;
    if (opts.context) this.build(opts.context);
  }

  /** Is audio actually flowing (context exists and is running)? */
  get running(): boolean {
    if (!this.ctx) return false;
    return this.forceRunning || this.ctx.state === 'running';
  }

  /**
   * Input of the shared SFX reverb used by live (not yet baked) voices. Built on first use, so a
   * session that only plays baked samples never pays for the convolver.
   */
  get sfxReverbIn(): GainNode {
    if (!this.reverbIn) {
      const ctx = this.ctx as BaseAudioContext;
      const input = ctx.createGain();
      const verb = this.createReverb(1.1, 3.2, 0.45);
      const out = ctx.createGain();
      out.gain.value = 0.8;
      input.connect(verb);
      verb.connect(out);
      out.connect(this.sfxBus);
      this.reverbIn = input;
    }
    return this.reverbIn;
  }

  get sampleRate(): number {
    return this.ctx ? this.ctx.sampleRate : 44100;
  }

  /** A fresh offline context for baking samples, or null when the browser cannot render offline. */
  createOffline(channels: number, length: number, sampleRate: number): OfflineAudioContext | null {
    return this.offlineFactory(channels, length, sampleRate);
  }

  /** Audio-clock time, or 0 before the context exists. */
  get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Call `cb` every time the context (re)enters the running state. Returns an unsubscribe. */
  onRunning(cb: () => void): () => void {
    this.runningCbs.add(cb);
    return () => this.runningCbs.delete(cb);
  }

  /** Create the context if needed and try to start it. Must be called from a user gesture. */
  unlock(): void {
    if (this.unsupported) return;
    try {
      this.doUnlock();
    } catch (e) {
      console.error('[audio] unlock failed', e);
    }
  }

  private doUnlock(): void {
    if (!this.ctx) {
      const Ctor = contextCtor();
      if (!Ctor) {
        this.unsupported = true;
        return;
      }
      let ctx: AudioContext;
      try {
        ctx = new Ctor({ latencyHint: 'interactive' });
      } catch {
        this.unsupported = true;
        return;
      }
      this.build(ctx);
      // iOS: let WebAudio play even with the hardware silent switch on (Safari 16.4+).
      try {
        const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
        if (session) session.type = 'playback';
      } catch {
        /* optional */
      }
    }
    const c = this.ctx as AudioContext;
    if (c.state !== 'running' && !(typeof document !== 'undefined' && document.hidden)) {
      c.resume().catch(() => {});
      this.primeIos(c);
    }
    if (c.state === 'running') this.fireRunning();
  }

  /** Play a one-sample silent buffer inside the gesture; some iOS versions need it to fully unlock. */
  private primeIos(c: AudioContext): void {
    try {
      const b = c.createBuffer(1, 1, c.sampleRate);
      const s = c.createBufferSource();
      s.buffer = b;
      s.connect(c.destination);
      s.start(0);
    } catch {
      /* ignore */
    }
  }

  /**
   * Attach DOM life-cycle listeners: unlock on first gestures (kept for later iOS interruptions),
   * suspend while hidden, resume on return.
   */
  attachDom(doc: Document = document, win: Window = window): void {
    if (this.domCleanup) return;
    const gesture = (): void => {
      if (!this.ctx || this.ctx.state !== 'running') this.unlock();
    };
    const gestures = ['pointerdown', 'touchend', 'mousedown', 'keydown'] as const;
    for (const g of gestures) doc.addEventListener(g, gesture, { capture: true, passive: true });

    const onVisibility = (): void => {
      const c = this.ctx as AudioContext | null;
      if (!c) return;
      if (doc.hidden) {
        if (c.state === 'running') {
          this.hiddenSuspended = true;
          c.suspend().catch(() => {});
        }
      } else if (this.hiddenSuspended) {
        this.hiddenSuspended = false;
        c.resume().catch(() => {});
      }
    };
    doc.addEventListener('visibilitychange', onVisibility);
    win.addEventListener('pagehide', onVisibility);
    win.addEventListener('pageshow', onVisibility);

    this.domCleanup = () => {
      for (const g of gestures) doc.removeEventListener(g, gesture, { capture: true } as EventListenerOptions);
      doc.removeEventListener('visibilitychange', onVisibility);
      win.removeEventListener('pagehide', onVisibility);
      win.removeEventListener('pageshow', onVisibility);
    };
  }

  /** Apply the user's music / sfx volume settings (0..1) with a short smoothing ramp. */
  setVolumes(music: number, sfx: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (music !== this.lastVolumes.music) {
      this.musicBus.gain.setTargetAtTime(volumeCurve(music) * MUSIC_TRIM, now, 0.06);
      this.lastVolumes.music = music;
    }
    if (sfx !== this.lastVolumes.sfx) {
      this.sfxBus.gain.setTargetAtTime(volumeCurve(sfx) * SFX_TRIM, now, 0.04);
      this.lastVolumes.sfx = sfx;
    }
  }

  /**
   * Cached synthetic reverb impulse response (decaying, progressively darker stereo noise) at the
   * sample rate of `ctx` (a ConvolverNode only accepts an IR in its own context's rate; offline
   * bake contexts may run at a lower rate than the main one).
   */
  impulse(seconds: number, decay = 3, darkness = 0.5, ctx: BaseAudioContext = this.ctx as BaseAudioContext): AudioBuffer {
    const rate = ctx.sampleRate;
    const key = `${seconds}:${decay}:${darkness}:${rate}`;
    let buf = this.impulses.get(key);
    if (!buf) {
      const len = Math.floor(seconds * rate);
      const pre = Math.floor(0.012 * rate);
      buf = ctx.createBuffer(2, len, rate);
      const BLOCK = 32; // slowly-varying terms are computed per block, not per sample (cheap on phones)
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let lp = 0;
        let k = 0;
        let env = 0;
        for (let i = 0; i < len; i++) {
          if (i % BLOCK === 0) {
            const t = i / len;
            // one-pole smoothing coefficient, rescaled so the cutoff (in Hz) is the same at any sample rate
            k = Math.pow(darkness + (0.95 - darkness) * t, 48000 / rate);
            env = Math.pow(1 - t, decay) * 3;
          }
          lp = lp * k + (this.rnd() * 2 - 1) * (1 - k);
          const fadeIn = i < pre ? 0 : Math.min(1, (i - pre) / 60);
          d[i] = lp * env * fadeIn;
        }
      }
      this.impulses.set(key, buf);
    }
    return buf;
  }

  /** Create a convolution reverb with the cached IR. */
  createReverb(seconds: number, decay = 3, darkness = 0.5): ConvolverNode {
    const c = (this.ctx as BaseAudioContext).createConvolver();
    c.buffer = this.impulse(seconds, decay, darkness);
    return c;
  }

  suspend(): void {
    const c = this.ctx as AudioContext | null;
    if (c && c.state === 'running') c.suspend().catch(() => {});
  }

  dispose(): void {
    this.domCleanup?.();
    this.domCleanup = null;
    this.runningCbs.clear();
    const c = this.ctx as AudioContext | null;
    if (c && typeof c.close === 'function' && c.state !== 'closed') c.close().catch(() => {});
    this.ctx = null;
  }

  private fireRunning(): void {
    for (const cb of [...this.runningCbs]) {
      try {
        cb();
      } catch (e) {
        console.error('[audio] running callback failed', e);
      }
    }
  }

  private build(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    this.noise = createNoiseSet(ctx);
    this.waves = createWaveTables(ctx);
    this.synth = new Synth(ctx, this.noise, this.waves, this.rnd);

    // master: one compressor tuned as a gentle glue-compressor that also catches peaks
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 14;
    comp.ratio.value = 7;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0;
    const soften = ctx.createBiquadFilter();
    soften.type = 'highshelf';
    soften.frequency.value = 5500;
    soften.gain.value = -3;
    this.sfxBus.connect(soften);
    soften.connect(this.master);

    this.reverbIn = null;
    this.lastVolumes = { music: -1, sfx: -1 };
    if ('addEventListener' in ctx) {
      ctx.addEventListener('statechange', () => {
        if (ctx.state === 'running') this.fireRunning();
      });
    }
  }
}
