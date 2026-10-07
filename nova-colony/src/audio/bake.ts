/**
 * Sample baking — the CPU-saving core of the audio layer.
 *
 * Building a jingle live costs dozens of WebAudio nodes, and node creation / tail-time bookkeeping
 * (especially BiquadFilters) is what hurts phones during big battles. So every sound is *rendered
 * once* with the procedural recipes into a short AudioBuffer using an OfflineAudioContext (still no
 * audio files!) and thereafter a hit is just BufferSource -> Gain (-> Panner): 2-3 nodes.
 *
 * - Baking happens in the background after the context unlocks, one sound at a time, rendered off the
 *   main thread by the browser. Until a sound is baked the manager plays the live recipe instead,
 *   so nothing is ever silent and an unsupported browser simply stays on the live path.
 * - Random-heavy sounds are baked in several variants; pitch is a playbackRate.
 * - The music director bakes its instrument notes (plucks, bells, drum hits) the same way.
 */
import type { AudioEngine } from './engine';
import type { SoundId } from './ids';
import { SOUND_IDS } from './ids';
import type { Priority, PooledVoice } from './policy';
import { RECIPES } from './sfx';
import { Synth, Voice, createWaveTables } from './synth';
import { mulberry32, type Rand } from './theory';

// ---------------------------------------------------------------------------------- pure helpers

/** Longest tail (s) each recipe can produce incl. reverb, rounded up. Verified against the recipes in tests. */
export const BAKE_DURATION: Readonly<Record<SoundId, number>> = {
  ui_click: 0.2, ui_open: 0.3, ui_close: 0.3, ui_error: 0.45, ui_tab: 0.2,
  gather_wood: 0.3, gather_stone: 0.25, gather_plant: 0.4, gather_crystal: 1.6, gather_metal: 0.45,
  place: 0.3, build_complete: 2.7, upgrade: 2.6, remove: 0.4, deposit: 0.3,
  collect: 0.25, coin: 1.5, reward: 2.3, crate_open: 2.7, celebrate: 2.6, level_up: 2.6, tier_up: 4.5,
  craft_start: 0.5, craft_done: 1.95, research_done: 3.6, mission_done: 3.0, discover: 3.6,
  alarm: 3.5, attack_start: 2.5, victory: 3.4,
  turret_bullet: 0.2, turret_flame: 0.4, turret_missile: 0.6, turret_laser: 0.3, turret_plasma: 0.45, turret_rail: 0.75, turret_cannon: 0.55,
  alien_hit: 0.3, alien_die: 1.4, explosion: 1.75, shield_hit: 1.6, player_hurt: 0.35,
  spin_tick: 0.15, spin_win: 3.25, door: 0.4, vehicle_start: 1.15, teleport: 2.65, recruit: 2.45,
};

/** How many random variants to bake per id (recipes with randomness get several; default 1). */
export const BAKE_VARIANTS: Readonly<Partial<Record<SoundId, number>>> = {
  ui_click: 2, ui_tab: 2,
  gather_wood: 3, gather_stone: 3, gather_plant: 3, gather_crystal: 4, gather_metal: 3,
  collect: 3, coin: 2, deposit: 2,
  turret_bullet: 3, turret_flame: 2, turret_laser: 2, turret_plasma: 2,
  alien_hit: 3, alien_die: 2,
};

/** Playback-rate jitter (+/- fraction) applied to baked frequent sounds so repeats never sound identical. */
export const RATE_JITTER: Readonly<Partial<Record<SoundId, number>>> = {
  gather_wood: 0.03, gather_stone: 0.03, gather_plant: 0.03, gather_crystal: 0.02, gather_metal: 0.03,
  collect: 0.05, coin: 0.03, turret_bullet: 0.04, turret_flame: 0.03, turret_laser: 0.03, turret_plasma: 0.03,
  turret_missile: 0.03, turret_cannon: 0.03, alien_hit: 0.06, alien_die: 0.05, explosion: 0.04, ui_click: 0.02,
  deposit: 0.03, place: 0.02, player_hurt: 0.03, shield_hit: 0.03,
};

/** Order in which sounds are baked: what plays most / earliest first. */
export const BAKE_ORDER: readonly SoundId[] = [
  'ui_click', 'ui_open', 'ui_close', 'ui_tab', 'ui_error',
  'gather_wood', 'gather_stone', 'gather_plant', 'gather_crystal', 'gather_metal', 'collect', 'place', 'build_complete',
  'turret_bullet', 'alien_hit', 'alien_die', 'turret_laser', 'turret_missile', 'turret_cannon', 'turret_flame',
  'turret_plasma', 'turret_rail', 'explosion', 'shield_hit', 'player_hurt', 'deposit', 'coin', 'remove', 'upgrade',
  'reward', 'crate_open', 'craft_start', 'craft_done', 'research_done', 'mission_done', 'alarm', 'attack_start',
  'victory', 'level_up', 'tier_up', 'celebrate', 'recruit', 'spin_tick', 'spin_win', 'door', 'vehicle_start',
  'teleport', 'discover',
];

export function variantCount(id: SoundId): number {
  return BAKE_VARIANTS[id] ?? 1;
}

/** Bank key of an SFX id. */
export const sfxKey = (id: string): string => `sfx:${id}`;

/**
 * Length to keep after rendering: index just past the last sample louder than `floor`, plus a short
 * pad (never less than `minLen`). Pure — unit-tested.
 */
export function audibleLength(chans: readonly Float32Array[], sampleRate: number, floor = 2e-4, padSec = 0.02, minLen = 64): number {
  const total = chans.length ? chans[0].length : 0;
  let last = 0;
  for (const c of chans) {
    for (let i = Math.min(c.length, total) - 1; i >= last; i--) {
      if (Math.abs(c[i]) > floor) {
        last = i + 1;
        break;
      }
    }
  }
  return Math.min(total, Math.max(minLen, last + Math.floor(padSec * sampleRate)));
}

/** Linear fade-out over the last `fadeSec` of `len` samples (prevents a click where the tail was cut). */
export function fadeOut(chans: readonly Float32Array[], len: number, sampleRate: number, fadeSec = 0.012): void {
  const n = Math.min(len, Math.floor(fadeSec * sampleRate));
  for (const c of chans) {
    for (let i = 0; i < n; i++) c[len - 1 - i] *= i / n;
  }
}

/** Nearest reference pitch for a note and the playback rate that transposes it there. */
export function nearestRef(refs: readonly number[], midi: number): { ref: number; rate: number } {
  let best = refs[0];
  for (const r of refs) if (Math.abs(r - midi) < Math.abs(best - midi)) best = r;
  return { ref: best, rate: Math.pow(2, (midi - best) / 12) };
}

// ------------------------------------------------------------------------------------- jobs

/** What a bake job renders into (an offline context with its own synth and optional reverb). */
export interface BakeContext {
  ctx: BaseAudioContext;
  synth: Synth;
  dest: AudioNode;
  /** Builds the reverb send on first use (offline convolver sharing the engine's impulse response). */
  wetIn: () => AudioNode;
  rnd: Rand;
}

export interface BakeJob {
  /** Bank key (variants of the same key accumulate). */
  key: string;
  /** Seconds of audio to render (trimmed afterwards). */
  dur: number;
  /**
   * Render at a lower sample rate to save memory (buffers resample on playback). Used for long,
   * soft jingles and low-frequency hits; omitted = the context's rate.
   */
  sampleRate?: number;
  /** Render the sound starting at t = 0.002. Return true when the result needs stereo (reverb). */
  render(b: BakeContext): boolean | void;
  /** Variant index (seeds the RNG). */
  variant?: number;
}

/** Jobs that bake every variant of the given sound ids with the SFX recipes. */
export function sfxJobs(ids: readonly SoundId[]): BakeJob[] {
  const jobs: BakeJob[] = [];
  for (const id of ids) {
    for (let v = 0; v < variantCount(id); v++) {
      jobs.push({
        key: sfxKey(id),
        dur: BAKE_DURATION[id],
        // long jingles / tails are soft and bright-ish only up to ~10 kHz: half the memory at 24 kHz
        sampleRate: BAKE_DURATION[id] > 0.8 ? 24000 : undefined,
        variant: v,
        render(b) {
          const voice = new Voice(b.synth, b.dest, b.wetIn, id, 1, 0, 1, 0);
          RECIPES[id]({ v: voice, t: 0.002, p: 1, r: b.rnd });
          return voice.usedWet;
        },
      });
    }
  }
  return jobs;
}

/** All sound ids in baking order (anything missing from BAKE_ORDER goes last). */
export function bakeOrder(): SoundId[] {
  const seen = new Set<SoundId>(BAKE_ORDER);
  return [...BAKE_ORDER, ...SOUND_IDS.filter((id) => !seen.has(id))];
}

// -------------------------------------------------------------------------------- playback voice

/** A baked one-shot: BufferSource -> Gain (-> StereoPanner). Pool-compatible like the live Voice. */
export class SampleVoice implements PooledVoice {
  readonly end: number;
  private readonly out: GainNode;
  private readonly src: AudioBufferSourceNode;
  private pan: StereoPannerNode | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    dest: AudioNode,
    readonly id: string,
    readonly priority: Priority,
    readonly start: number,
    buffer: AudioBuffer,
    rate: number,
    gain: number,
    pan: number,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = gain;
    this.src = ctx.createBufferSource();
    this.src.buffer = buffer;
    if (rate !== 1) this.src.playbackRate.value = rate;
    this.src.connect(this.out);
    if (pan && typeof ctx.createStereoPanner === 'function') {
      this.pan = ctx.createStereoPanner();
      this.pan.pan.value = pan;
      this.out.connect(this.pan);
      this.pan.connect(dest);
    } else {
      this.out.connect(dest);
    }
    this.src.start(start);
    this.end = start + buffer.duration / rate + 0.02;
  }

  stop(): void {
    const now = this.ctx.currentTime;
    try {
      this.out.gain.cancelScheduledValues(now);
      this.out.gain.setTargetAtTime(0, now, 0.012);
      this.src.stop(now + 0.07);
    } catch {
      /* already finished */
    }
  }

  dispose(): void {
    this.out.disconnect();
    this.pan?.disconnect();
  }
}

// ------------------------------------------------------------------------------------- the bank

export interface BankOptions {
  rnd?: Rand;
  /** Pause between jobs so baking never hogs the main thread (default 30 ms). */
  gapMs?: number;
}

/** Background baker + store of rendered samples, keyed by name (variants accumulate under one key). */
export class SampleBank {
  private readonly bufs = new Map<string, AudioBuffer[]>();
  private readonly queued = new Set<string>();
  private queue: BakeJob[] = [];
  private busy = false;
  private disposed = false;
  private idleWaiters: (() => void)[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly gapMs: number;
  /** Jobs that failed to render (the live path keeps working for them). */
  failures = 0;
  /** Set when the browser cannot render offline: the bank stays empty and everything plays live. */
  unsupported = false;

  constructor(private readonly engine: AudioEngine, private readonly opts: BankOptions = {}) {
    this.gapMs = opts.gapMs ?? 30;
  }

  /** Number of jobs waiting. */
  get pending(): number {
    return this.queue.length + (this.busy ? 1 : 0);
  }

  /** Number of distinct keys with at least one baked variant. */
  get size(): number {
    return this.bufs.size;
  }

  has(key: string): boolean {
    return this.bufs.has(key);
  }

  /** Baked variants for a key (do not mutate). */
  variants(key: string): readonly AudioBuffer[] | undefined {
    return this.bufs.get(key);
  }

  /** A random baked variant for a key, or undefined when not (yet) baked. */
  pick(key: string, rnd: Rand): AudioBuffer | undefined {
    const arr = this.bufs.get(key);
    return arr ? arr[arr.length === 1 ? 0 : Math.floor(rnd() * arr.length)] : undefined;
  }

  /** Queue jobs (skipping ones already queued / baked). `front` puts them ahead of the queue. */
  enqueue(jobs: readonly BakeJob[], front = false): void {
    if (this.unsupported || this.disposed) return;
    const fresh: BakeJob[] = [];
    for (const j of jobs) {
      const id = `${j.key}#${j.variant ?? 0}`;
      if (this.queued.has(id)) continue;
      this.queued.add(id);
      fresh.push(j);
    }
    this.queue = front ? [...fresh, ...this.queue] : [...this.queue, ...fresh];
    this.pump();
  }

  /** Resolves when the queue has drained (tests, dev board). */
  whenIdle(): Promise<void> {
    if (this.pending === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.queue.length = 0;
    this.bufs.clear();
    this.flushIdle();
  }

  private flushIdle(): void {
    if (this.pending > 0) return;
    const w = this.idleWaiters;
    this.idleWaiters = [];
    for (const r of w) r();
  }

  private pump(): void {
    if (this.busy || this.timer || this.disposed || this.queue.length === 0) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runNext();
    }, this.gapMs);
  }

  private async runNext(): Promise<void> {
    const job = this.queue.shift();
    if (!job || this.disposed) {
      this.flushIdle();
      return;
    }
    this.busy = true;
    try {
      const buf = await this.bake(job);
      if (buf && !this.disposed) {
        const arr = this.bufs.get(job.key);
        if (arr) arr.push(buf);
        else this.bufs.set(job.key, [buf]);
      }
    } catch (e) {
      this.failures++;
      if (this.failures <= 2) console.error(`[audio] bake failed for ${job.key}`, e);
      if (this.failures >= 6) {
        // something is fundamentally broken (e.g. no offline rendering): stop trying
        this.unsupported = true;
        this.queue.length = 0;
      }
    }
    this.busy = false;
    if (this.queue.length) this.pump();
    else this.flushIdle();
  }

  /** Render one job into a trimmed AudioBuffer in the main context's format. */
  private async bake(job: BakeJob): Promise<AudioBuffer | null> {
    const eng = this.engine;
    const main = eng.ctx;
    if (!main) return null;
    let sr = Math.min(main.sampleRate, job.sampleRate ?? main.sampleRate);
    let off = eng.createOffline(2, Math.max(1, Math.ceil(job.dur * sr)), sr);
    if (!off && sr !== main.sampleRate) {
      // this browser refuses the reduced rate: bake at the native one
      sr = main.sampleRate;
      off = eng.createOffline(2, Math.max(1, Math.ceil(job.dur * sr)), sr);
    }
    if (!off) {
      this.unsupported = true;
      this.queue.length = 0;
      return null;
    }
    const seed = (hashString(job.key) + (job.variant ?? 0) * 7919) >>> 0;
    const rnd = this.opts.rnd ? this.opts.rnd : mulberry32(seed);
    const synth = new Synth(off, eng.noise, createWaveTables(off), rnd);
    const out = off.createGain();
    out.connect(off.destination);
    let wetIn: GainNode | null = null;
    const ensureWet = (): AudioNode => {
      if (!wetIn) {
        wetIn = off.createGain();
        const conv = off.createConvolver();
        conv.buffer = eng.impulse(1.1, 3.2, 0.45, off);
        const wetOut = off.createGain();
        wetOut.gain.value = 0.8;
        wetIn.connect(conv);
        conv.connect(wetOut);
        wetOut.connect(out);
      }
      return wetIn;
    };

    const stereo = job.render({ ctx: off, synth, dest: out, wetIn: ensureWet, rnd }) === true;
    const rendered = await renderOffline(off);

    const chans = [rendered.getChannelData(0)];
    if (stereo && rendered.numberOfChannels > 1) chans.push(rendered.getChannelData(1));
    const keep = audibleLength(chans, sr);
    fadeOut(chans, keep, sr);
    try {
      // trimmed copy (the rendered buffer is as long as the job's worst case)
      const buf = main.createBuffer(chans.length, keep, sr);
      for (let c = 0; c < chans.length; c++) buf.getChannelData(c).set(chans[c].subarray(0, keep));
      return buf;
    } catch {
      return rendered; // buffers are context-independent, so the untrimmed render is still playable
    }
  }
}

/** Run an offline context to completion (promise API on modern engines, oncomplete on old Safari). */
export function renderOffline(off: OfflineAudioContext): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolve, reject) => {
    off.oncomplete = (e: OfflineAudioCompletionEvent) => resolve(e.renderedBuffer);
    try {
      const p = off.startRendering() as Promise<AudioBuffer> | undefined;
      if (p && typeof p.then === 'function') p.then(resolve, reject);
    } catch (e) {
      reject(e);
    }
  });
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
