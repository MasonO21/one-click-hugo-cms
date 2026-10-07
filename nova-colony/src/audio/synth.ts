/**
 * Synthesis toolkit: small self-cleaning building blocks (oscillator + envelope, filtered noise,
 * inharmonic bells, FM bells, marimba plucks, flute) used by both the SFX recipes and the music
 * director. Everything is created on demand, scheduled in the future and left to be garbage
 * collected — no persistent nodes except the shared noise buffers and wave tables.
 *
 * All methods take a destination node and return the (audio-clock) end time of the sound.
 */
import type { Priority, PooledVoice } from './policy';

export interface NoiseSet {
  white: AudioBuffer;
  brown: AudioBuffer;
}

export interface WaveTables {
  /** Woody mallet tone: strong fundamental + 4th harmonic. */
  marimba: PeriodicWave;
  /** Soft glass: fundamental + gentle 2nd/3rd. */
  glass: PeriodicWave;
  /** Hollow, odd-harmonic tone. */
  hollow: PeriodicWave;
}

/** Collects the sources and end time of a group of nodes (one SFX voice). */
export interface Rec {
  end: number;
  srcs: AudioScheduledSourceNode[];
}

export interface ToneOpts {
  /** Start frequency (Hz). */
  f: number;
  /** End frequency; glides exponentially over `glide` seconds. */
  f2?: number;
  glide?: number;
  /** Start time (audio clock). */
  t: number;
  /** Decay time from peak to silence (s). */
  d: number;
  /** Attack (s), default 5 ms. */
  a?: number;
  /** Time held at peak before decaying (s). */
  hold?: number;
  /** Peak gain, default 0.3. */
  g?: number;
  type?: OscillatorType;
  wave?: PeriodicWave;
  /** Detune in cents. */
  detune?: number;
  /** Optional lowpass: start cutoff, end cutoff (exponential over the note), Q. */
  lp?: number;
  lp2?: number;
  lpQ?: number;
  /** Stereo position -1..1. */
  pan?: number;
}

export interface NoiseOpts {
  t: number;
  d: number;
  a?: number;
  hold?: number;
  g?: number;
  type: BiquadFilterType;
  /** Filter frequency, optionally sweeping to f2 over the sound. */
  f: number;
  f2?: number;
  q?: number;
  /** Use the low-rumble (brown) noise instead of white. */
  brown?: boolean;
  pan?: number;
}

export type BellKind = 'glass' | 'metal' | 'soft' | 'wood';

export interface BellOpts {
  f: number;
  t: number;
  d: number;
  g?: number;
  kind?: BellKind;
  pan?: number;
}

export interface FmOpts {
  f: number;
  t: number;
  d: number;
  g?: number;
  /** Modulator / carrier frequency ratio (2 = mellow bell, 3.5 = glassy, 1 = brassy). */
  ratio?: number;
  /** Modulation index at the attack (decays quickly). */
  index?: number;
  a?: number;
  pan?: number;
}

export interface PluckOpts {
  f: number;
  t: number;
  d: number;
  g?: number;
  /** Brightness multiplier of the pluck's opening filter (1 = default). */
  bright?: number;
  pan?: number;
}

export interface FluteOpts {
  f: number;
  t: number;
  /** Sustain time (s) before the release. */
  dur: number;
  g?: number;
  pan?: number;
}

/** [frequency ratio, relative gain, relative decay] per partial. */
const BELLS: Record<BellKind, readonly (readonly [number, number, number])[]> = {
  glass: [[1, 1, 1], [2.756, 0.4, 0.55], [5.404, 0.2, 0.32], [8.933, 0.08, 0.2]],
  metal: [[1, 1, 1], [2.32, 0.6, 0.5], [4.25, 0.4, 0.3], [6.63, 0.25, 0.18]],
  soft: [[1, 1, 1], [2.0, 0.35, 0.6], [3.0, 0.18, 0.4]],
  wood: [[1, 1, 1], [3.9, 0.55, 0.3], [9.2, 0.15, 0.12]],
};

export function createWaveTables(ctx: BaseAudioContext): WaveTables {
  const make = (harm: number[]): PeriodicWave => {
    const imag = new Float32Array(harm.length + 1);
    const real = new Float32Array(harm.length + 1);
    for (let i = 0; i < harm.length; i++) imag[i + 1] = harm[i];
    return ctx.createPeriodicWave(real, imag);
  };
  return {
    marimba: make([1, 0.05, 0.03, 0.38, 0, 0.12, 0, 0.04]),
    glass: make([1, 0.22, 0.1, 0.04]),
    hollow: make([1, 0, 0.42, 0, 0.2, 0, 0.1, 0, 0.05]),
  };
}

export function createNoiseSet(ctx: BaseAudioContext, seconds = 2): NoiseSet {
  const len = Math.floor(ctx.sampleRate * seconds);
  const white = ctx.createBuffer(1, len, ctx.sampleRate);
  const brown = ctx.createBuffer(1, len, ctx.sampleRate);
  const w = white.getChannelData(0);
  const b = brown.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const r = Math.random() * 2 - 1;
    w[i] = r;
    last = (last + 0.02 * r) / 1.02;
    b[i] = last * 3.5;
  }
  return { white, brown };
}

export class Synth {
  /** Highest frequency we ask an oscillator for (stay safely under Nyquist). */
  readonly maxFreq: number;

  constructor(
    readonly ctx: BaseAudioContext,
    readonly noise: NoiseSet,
    readonly waves: WaveTables,
    readonly rnd: () => number = Math.random,
  ) {
    this.maxFreq = Math.min(15000, ctx.sampleRate * 0.45);
  }

  /** Route a node to `dest`, through a stereo panner when `pan` is set. */
  private route(node: AudioNode, dest: AudioNode, pan?: number): void {
    if (pan && typeof this.ctx.createStereoPanner === 'function') {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      p.connect(dest);
    } else {
      node.connect(dest);
    }
  }

  private track(rec: Rec | undefined, src: AudioScheduledSourceNode, end: number): void {
    if (!rec) return;
    rec.srcs.push(src);
    if (end + 0.05 > rec.end) rec.end = end + 0.05;
  }

  /** Oscillator with attack/hold/exponential-decay envelope, optional glide and lowpass sweep. */
  tone(dest: AudioNode, o: ToneOpts, rec?: Rec): number {
    const ctx = this.ctx;
    const t = o.t;
    const a = o.a ?? 0.005;
    const hold = o.hold ?? 0;
    const g = o.g ?? 0.3;
    const end = t + a + hold + o.d;

    const osc = ctx.createOscillator();
    if (o.wave) osc.setPeriodicWave(o.wave);
    else osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(Math.min(o.f, this.maxFreq), t);
    if (o.f2 !== undefined && o.f2 !== o.f) {
      osc.frequency.exponentialRampToValueAtTime(Math.min(o.f2, this.maxFreq), t + (o.glide ?? o.d));
    }
    if (o.detune) osc.detune.value = o.detune;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(g, t + a);
    if (hold > 0) env.gain.setValueAtTime(g, t + a + hold);
    env.gain.exponentialRampToValueAtTime(0.0001, end);

    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(o.lp, t);
      if (o.lp2) f.frequency.exponentialRampToValueAtTime(o.lp2, end);
      f.Q.value = o.lpQ ?? 0.7;
      osc.connect(f);
      f.connect(env);
    } else {
      osc.connect(env);
    }
    this.route(env, dest, o.pan);
    osc.start(t);
    osc.stop(end + 0.03);
    this.track(rec, osc, end);
    return end;
  }

  /** Filtered noise burst (chips, swooshes, shakers, hi-hats, rumbles). */
  noiseHit(dest: AudioNode, o: NoiseOpts, rec?: Rec): number {
    const ctx = this.ctx;
    const t = o.t;
    const a = o.a ?? 0.003;
    const hold = o.hold ?? 0;
    const g = o.g ?? 0.2;
    const end = t + a + hold + o.d;
    const buf = o.brown ? this.noise.brown : this.noise.white;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type;
    f.frequency.setValueAtTime(o.f, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, end);
    f.Q.value = o.q ?? 1;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(g, t + a);
    if (hold > 0) env.gain.setValueAtTime(g, t + a + hold);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    src.connect(f);
    f.connect(env);
    this.route(env, dest, o.pan);
    src.start(t, this.rnd() * (buf.duration - 0.05));
    src.stop(end + 0.03);
    this.track(rec, src, end);
    return end;
  }

  /** Inharmonic additive bell (glassy chime, metallic clink, wooden tock). */
  bell(dest: AudioNode, o: BellOpts, rec?: Rec): number {
    const parts = BELLS[o.kind ?? 'glass'];
    const g = o.g ?? 0.2;
    let end = o.t;
    for (let i = 0; i < parts.length; i++) {
      const [ratio, pg, pd] = parts[i];
      const f = o.f * ratio;
      if (f > this.maxFreq) continue;
      end = Math.max(end, this.tone(dest, { f, t: o.t, d: o.d * pd, a: 0.002, g: g * pg, pan: o.pan }, rec));
    }
    return end;
  }

  /** Two-operator FM bell: bright attack that mellows as the modulation index decays. */
  fm(dest: AudioNode, o: FmOpts, rec?: Rec): number {
    const ctx = this.ctx;
    const t = o.t;
    const a = o.a ?? 0.003;
    const g = o.g ?? 0.2;
    const ratio = o.ratio ?? 2;
    const index = o.index ?? 1.4;
    const end = t + a + o.d;

    const car = ctx.createOscillator();
    car.frequency.setValueAtTime(Math.min(o.f, this.maxFreq), t);
    const mod = ctx.createOscillator();
    mod.frequency.setValueAtTime(Math.min(o.f * ratio, this.maxFreq), t);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(o.f * index, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(o.f * index * 0.02, 0.01), t + a + o.d * 0.45);
    mod.connect(mg);
    mg.connect(car.frequency);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(g, t + a);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    car.connect(env);
    this.route(env, dest, o.pan);
    car.start(t);
    mod.start(t);
    car.stop(end + 0.03);
    mod.stop(end + 0.03);
    this.track(rec, car, end);
    this.track(rec, mod, end);
    return end;
  }

  /** Marimba-like pluck: woody wave table through a fast-closing lowpass. */
  pluck(dest: AudioNode, o: PluckOpts, rec?: Rec): number {
    const bright = o.bright ?? 1;
    return this.tone(
      dest,
      {
        f: o.f,
        t: o.t,
        d: o.d,
        a: 0.003,
        g: o.g ?? 0.25,
        wave: this.waves.marimba,
        lp: Math.min(o.f * 9 * bright, 9000),
        lp2: Math.max(o.f * 1.4, 400),
        pan: o.pan,
      },
      rec,
    );
  }

  /** Soft flute / whistle: slow attack, delayed vibrato and a breath of noise. */
  flute(dest: AudioNode, o: FluteOpts, rec?: Rec): number {
    const ctx = this.ctx;
    const t = o.t;
    const g = o.g ?? 0.18;
    const a = 0.09;
    const end = t + a + o.dur + 0.55;

    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(o.f, t);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(o.f * 0.007, t + a + o.dur * 0.6);
    lfo.connect(lg);
    lg.connect(osc.frequency);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(g, t + a);
    env.gain.setValueAtTime(g * 0.85, t + a + o.dur);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(env);
    this.route(env, dest, o.pan);
    osc.start(t);
    lfo.start(t);
    osc.stop(end + 0.03);
    lfo.stop(end + 0.03);
    this.track(rec, osc, end);
    this.track(rec, lfo, end);
    this.noiseHit(dest, { t, a: 0.05, hold: o.dur * 0.5, d: 0.35, g: g * 0.12, type: 'bandpass', f: Math.min(o.f * 2, 6000), q: 3, pan: o.pan }, rec);
    return end;
  }
}

/**
 * One SFX voice: an output gain (volume / spatial attenuation, optional pan) that every node of the
 * sound feeds into. Implements PooledVoice so the pool can steal it or free it when finished.
 */
export class Voice implements PooledVoice {
  readonly out: GainNode;
  readonly rec: Rec;
  private panNode: StereoPannerNode | null = null;
  private wetNode: GainNode | null = null;

  constructor(
    private readonly synth: Synth,
    dest: AudioNode,
    /** Reverb send target, or a factory that builds it on first use (so dry sounds never pay for it). */
    private readonly wetDest: AudioNode | (() => AudioNode) | null,
    readonly id: string,
    readonly priority: Priority,
    readonly start: number,
    gain: number,
    pan: number,
  ) {
    const ctx = synth.ctx;
    this.rec = { end: start, srcs: [] };
    this.out = ctx.createGain();
    this.out.gain.value = gain;
    if (pan && typeof ctx.createStereoPanner === 'function') {
      this.panNode = ctx.createStereoPanner();
      this.panNode.pan.value = pan;
      this.out.connect(this.panNode);
      this.panNode.connect(dest);
    } else {
      this.out.connect(dest);
    }
  }

  get end(): number {
    return this.rec.end;
  }

  tone(o: ToneOpts): number {
    return this.synth.tone(this.out, o, this.rec);
  }
  noise(o: NoiseOpts): number {
    return this.synth.noiseHit(this.out, o, this.rec);
  }
  bell(o: BellOpts): number {
    return this.synth.bell(this.out, o, this.rec);
  }
  fm(o: FmOpts): number {
    return this.synth.fm(this.out, o, this.rec);
  }
  pluck(o: PluckOpts): number {
    return this.synth.pluck(this.out, o, this.rec);
  }

  /** True once the sound sends into the reverb (its baked version then needs stereo). */
  get usedWet(): boolean {
    return this.wetNode !== null;
  }

  /** Send part of this voice into the shared SFX reverb (cozy tails for chimes and jingles). */
  wet(level: number): void {
    if (!this.wetDest || this.wetNode) return;
    const target = typeof this.wetDest === 'function' ? this.wetDest() : this.wetDest;
    this.wetNode = this.synth.ctx.createGain();
    this.wetNode.gain.value = level;
    this.out.connect(this.wetNode);
    this.wetNode.connect(target);
    // reverb tail outlives the dry sound
    this.rec.end += 0.6 + level;
  }

  stop(): void {
    const now = this.synth.ctx.currentTime;
    try {
      this.out.gain.cancelScheduledValues(now);
      this.out.gain.setTargetAtTime(0, now, 0.012);
      for (const s of this.rec.srcs) s.stop(now + 0.07);
    } catch {
      /* source already finished */
    }
  }

  dispose(): void {
    this.out.disconnect();
    this.panNode?.disconnect();
    this.wetNode?.disconnect();
  }
}
