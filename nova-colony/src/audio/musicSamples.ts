/**
 * Instrument samples for the music director, baked once with the procedural synth (see bake.ts).
 *
 * Pitched instruments are rendered at a few reference notes and transposed with playbackRate
 * (at most ±6 semitones, so the timbre stays natural). Drum hits and shakers are single samples.
 * Every sample is normalised to roughly full scale; the director applies the musical gain.
 */
import type { BakeJob } from './bake';
import type { MelodyTimbre } from './theory';
import { midiToFreq } from './theory';

export type SampleSet = 'pluck' | 'bell' | 'glass' | 'flute' | 'spark' | 'drums' | 'shaker' | 'thump';

export const PLUCK_REFS = [60, 66, 72, 78, 84, 90] as const;
export const BELL_REFS = [64, 76, 88] as const;
export const GLASS_REFS = [66, 78, 90] as const;
export const FLUTE_REFS = [60, 68, 76] as const;
export const SPARK_REFS = [80, 92] as const;
export const THUMP_REFS = [50, 58] as const;

/** Reference pitches per pitched sample family. */
export const REFS = {
  pluck: PLUCK_REFS,
  bell: BELL_REFS,
  glass: GLASS_REFS,
  flute: FLUTE_REFS,
  spark: SPARK_REFS,
  thump: THUMP_REFS,
} as const;

export type PitchedSet = keyof typeof REFS;

/** Bank key of a pitched sample. */
export const pitchedKey = (set: PitchedSet, ref: number): string => `${set}:${ref}`;

export const SHAKER_KEY = 'shaker';
export const DRUM_KEYS = { kick: 'drum:kick', clap: 'drum:clap', hat: 'drum:hat', timp: 'drum:timp' } as const;

/** Which sample family voices each melody timbre. */
export function timbreSet(t: MelodyTimbre): PitchedSet {
  switch (t) {
    case 'marimba':
      return 'pluck';
    case 'bell':
      return 'bell';
    case 'glass':
      return 'glass';
    case 'flute':
      return 'flute';
  }
}

const T0 = 0.002;

/** Soft, mostly < 10 kHz material: baked at 24 kHz to halve memory. */
const SOFT_RATE = 24000;
/** Low-frequency hits (kick, timpani, bass pulse): 22.05 kHz is the lowest rate every Safari accepts. */
const LOW_RATE = 22050;

function pitchedJobs(set: PitchedSet): BakeJob[] {
  return REFS[set].map((ref): BakeJob => {
    const f = midiToFreq(ref);
    const key = pitchedKey(set, ref);
    switch (set) {
      case 'pluck':
        return { key, dur: 2.15, sampleRate: SOFT_RATE, render: (b) => void b.synth.pluck(b.dest, { f, t: T0, d: 2, g: 1 }) };
      case 'bell':
        return { key, dur: 2.5, sampleRate: SOFT_RATE, render: (b) => void b.synth.fm(b.dest, { f, t: T0, d: 2.3, g: 1, ratio: 2.5, index: 1.1 }) };
      case 'glass':
        return { key, dur: 1.9, sampleRate: SOFT_RATE, render: (b) => void b.synth.bell(b.dest, { f, t: T0, d: 1.7, g: 0.65, kind: 'soft' }) };
      case 'flute':
        return { key, dur: 1.4, sampleRate: SOFT_RATE, render: (b) => void b.synth.flute(b.dest, { f, t: T0, dur: 0.55, g: 0.9 }) };
      case 'spark':
        return { key, dur: 2.3, sampleRate: SOFT_RATE, render: (b) => void b.synth.fm(b.dest, { f, t: T0, d: 2.1, g: 1, ratio: 3.5, index: 0.8 }) };
      case 'thump':
        return { key, dur: 0.3, sampleRate: LOW_RATE, render: (b) => void b.synth.tone(b.dest, { f, t: T0, a: 0.008, d: 0.22, g: 1, type: 'triangle', lp: 700 }) };
    }
  });
}

/** Bake jobs for one sample family. */
export function sampleJobs(set: SampleSet): BakeJob[] {
  switch (set) {
    case 'shaker':
      return [0, 1, 2].map((variant): BakeJob => ({
        key: SHAKER_KEY,
        variant,
        dur: 0.12,
        render: (b) => void b.synth.noiseHit(b.dest, { t: T0, a: 0.008, d: 0.06, g: 1, type: 'bandpass', f: 7500, q: 0.7 }),
      }));
    case 'drums':
      return [
        {
          key: DRUM_KEYS.kick,
          dur: 0.4,
          sampleRate: LOW_RATE,
          render: (b) => {
            b.synth.tone(b.dest, { f: 120, f2: 45, glide: 0.09, t: T0, d: 0.24, a: 0.002, g: 0.55 });
            b.synth.tone(b.dest, { f: 240, f2: 110, glide: 0.06, t: T0, d: 0.1, a: 0.002, g: 0.12, type: 'triangle' });
            b.synth.noiseHit(b.dest, { t: T0, d: 0.04, a: 0.001, g: 0.08, type: 'lowpass', f: 900 });
          },
        },
        {
          key: DRUM_KEYS.clap,
          dur: 0.25,
          render: (b) => {
            b.synth.noiseHit(b.dest, { t: T0, d: 0.14, a: 0.002, g: 0.8, type: 'bandpass', f: 1700, q: 0.8 });
            b.synth.tone(b.dest, { f: 190, f2: 150, t: T0, d: 0.09, g: 0.45, type: 'triangle' });
          },
        },
        {
          key: DRUM_KEYS.hat,
          dur: 0.1,
          render: (b) => void b.synth.noiseHit(b.dest, { t: T0, d: 0.035, a: 0.001, g: 1, type: 'highpass', f: 7000 }),
        },
        {
          key: DRUM_KEYS.timp,
          dur: 1.0,
          sampleRate: LOW_RATE,
          render: (b) => {
            b.synth.tone(b.dest, { f: 98, f2: 60, glide: 0.2, t: T0, d: 0.8, g: 0.8 });
            b.synth.tone(b.dest, { f: 196, f2: 120, glide: 0.15, t: T0, d: 0.3, g: 0.2, type: 'triangle' });
            b.synth.noiseHit(b.dest, { t: T0, d: 0.1, g: 0.35, type: 'lowpass', f: 600 });
          },
        },
      ];
    default:
      return pitchedJobs(set);
  }
}
