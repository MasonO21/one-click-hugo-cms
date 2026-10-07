/**
 * SFX recipes: one function per sound id, built from the `Voice` primitives (tones, filtered noise,
 * bells, FM bells, plucks). Design language: soft wooden / stony / plant / glass / metal textures,
 * major-pentatonic jingles (everything is in C so stacked jingles never clash), rounded attacks and
 * short reverb tails — satisfying, never harsh.
 */
import type { SoundId } from './ids';
import type { Voice } from './synth';
import { midiToFreq } from './theory';

export interface RecipeCtx {
  v: Voice;
  /** Start time on the audio clock. */
  t: number;
  /** Pitch multiplier (1 = default). */
  p: number;
  /** Random float in [0, 1). */
  r: () => number;
}

export type Recipe = (c: RecipeCtx) => void;

const F = midiToFreq;
// C major pentatonic, MIDI numbers
const C4 = 60, E4 = 64, G4 = 67, A4 = 69;
const C5 = 72, D5 = 74, E5 = 76, G5 = 79, A5 = 81;
const C6 = 84, D6 = 86, E6 = 88, G6 = 91, A6 = 93;
const C7 = 96;

/** Rising run of FM bells. */
function bellRun(v: Voice, t: number, notes: number[], step: number, o: { d: number; g: number; tail?: number; ratio?: number; index?: number; p?: number }): void {
  const p = o.p ?? 1;
  for (let i = 0; i < notes.length; i++) {
    const last = i === notes.length - 1;
    v.fm({ f: F(notes[i]) * p, t: t + i * step, d: o.d + (last ? o.tail ?? 0 : 0), g: o.g * (last ? 1.15 : 1), ratio: o.ratio ?? 2, index: o.index ?? 1.2 });
  }
}

/** Scattered high sparkles (pentatonic) across a time span. */
function sparkles(v: Voice, t: number, span: number, count: number, g: number, r: () => number): void {
  const pool = [E6, G6, A6, C7, D6, E6 + 12];
  for (let i = 0; i < count; i++) {
    const m = pool[Math.floor(r() * pool.length)];
    v.fm({ f: F(m), t: t + r() * span, d: 0.35 + r() * 0.3, g: g * (0.6 + 0.4 * r()), ratio: 3.5, index: 0.8 });
  }
}

/** Soft sustained chord swell (triangle + lowpassed saw), used under fanfares. */
function padSwell(v: Voice, t: number, notes: number[], attack: number, hold: number, decay: number, g: number): void {
  for (const m of notes) {
    v.tone({ f: F(m), t, a: attack, hold, d: decay, g, type: 'triangle' });
    v.tone({ f: F(m) * 1.003, t, a: attack, hold, d: decay, g: g * 0.7, type: 'sawtooth', lp: 700, lp2: 1500 });
  }
}

export const RECIPES: Record<SoundId, Recipe> = {
  // ------------------------------------------------------------------------------------ UI
  ui_click({ v, t, p, r }) {
    const f = 780 * p * (0.98 + r() * 0.04);
    v.tone({ f, f2: f * 0.72, glide: 0.05, t, d: 0.07, a: 0.002, g: 0.3, type: 'triangle' });
    v.noise({ t, d: 0.02, a: 0.001, g: 0.08, type: 'bandpass', f: 3200, q: 1.5 });
  },
  ui_open({ v, t, p }) {
    v.noise({ t, d: 0.11, a: 0.03, g: 0.07, type: 'bandpass', f: 700, f2: 2400, q: 1.2 });
    v.tone({ f: 440 * p, f2: 587 * p, glide: 0.07, t, d: 0.16, a: 0.006, g: 0.24 });
    v.tone({ f: 880 * p, t: t + 0.05, d: 0.1, g: 0.07, type: 'triangle' });
  },
  ui_close({ v, t, p }) {
    v.noise({ t, d: 0.09, a: 0.01, g: 0.06, type: 'bandpass', f: 2000, f2: 700, q: 1.2 });
    v.tone({ f: 587 * p, f2: 392 * p, glide: 0.07, t, d: 0.14, a: 0.004, g: 0.22 });
  },
  ui_error({ v, t, p }) {
    // two soft muted "bonks" — says "not that" without scolding
    v.tone({ f: 247 * p, f2: 208 * p, glide: 0.1, t, d: 0.15, a: 0.004, g: 0.3, type: 'triangle', lp: 900 });
    v.tone({ f: 220 * p, f2: 185 * p, glide: 0.1, t: t + 0.12, d: 0.18, a: 0.004, g: 0.28, type: 'triangle', lp: 800 });
  },
  ui_tab({ v, t, p, r }) {
    const f = 900 * p * (0.97 + r() * 0.06);
    v.tone({ f, f2: f * 0.85, glide: 0.03, t, d: 0.05, a: 0.002, g: 0.2 });
    v.noise({ t, d: 0.012, a: 0.001, g: 0.05, type: 'highpass', f: 4000 });
  },

  // -------------------------------------------------------------------------------- gathering
  gather_wood({ v, t, p, r }) {
    const k = p * (0.93 + r() * 0.14);
    v.tone({ f: 320 * k, f2: 130 * k, glide: 0.07, t, d: 0.14, a: 0.002, g: 0.3, type: 'triangle' }); // hollow body (harmonics carry on phone speakers)
    v.tone({ f: 170 * k, f2: 90 * k, glide: 0.07, t, d: 0.12, a: 0.002, g: 0.14 }); // sub weight
    v.tone({ f: 540 * k, f2: 330 * k, glide: 0.03, t, d: 0.05, a: 0.001, g: 0.18, type: 'triangle' }); // "tok"
    v.noise({ t, d: 0.05, a: 0.001, g: 0.2, type: 'bandpass', f: 1300 * k, q: 1.1 }); // chip
    if (r() < 0.5) v.noise({ t: t + 0.028, d: 0.03, g: 0.08, type: 'bandpass', f: 2400 * k, q: 2 });
  },
  gather_stone({ v, t, p, r }) {
    const k = p * (0.92 + r() * 0.16);
    v.tone({ f: 240 * k, f2: 105 * k, glide: 0.06, t, d: 0.11, a: 0.002, g: 0.3, type: 'triangle' });
    v.tone({ f: 130 * k, f2: 65 * k, glide: 0.06, t, d: 0.1, a: 0.002, g: 0.14 });
    v.noise({ t, d: 0.07, a: 0.001, g: 0.28, type: 'highpass', f: 1400 * k, q: 0.7 });
    v.noise({ t: t + 0.012, d: 0.05, g: 0.2, type: 'bandpass', f: 3200 * k, q: 1.8 }); // crunchy grains
    v.noise({ t: t + 0.03, d: 0.04, g: 0.14, type: 'bandpass', f: 2200 * k, q: 2.5 });
    v.tone({ f: 1900 * k, t, d: 0.015, a: 0.001, g: 0.08, type: 'square' });
  },
  gather_plant({ v, t, p, r }) {
    const k = p * (0.92 + r() * 0.18);
    v.tone({ f: 380 * k, f2: 820 * k, glide: 0.06, t, d: 0.12, a: 0.003, g: 0.34 }); // bubbly pop
    v.noise({ t: t + 0.01, d: 0.1, a: 0.012, g: 0.1, type: 'highpass', f: 4500, q: 0.5 }); // leaf rustle
    v.pluck({ f: 988 * k, t: t + 0.045, d: 0.2, g: 0.14 });
  },
  gather_crystal({ v, t, p, r }) {
    const pool = [E6, G6, A6, C7, D6];
    const f = F(pool[Math.floor(r() * pool.length)]) * p;
    v.bell({ f, t, d: 0.55, g: 0.2, kind: 'glass' });
    v.bell({ f: f * 0.5, t, d: 0.4, g: 0.1, kind: 'glass' });
    v.noise({ t, d: 0.025, a: 0.001, g: 0.1, type: 'highpass', f: 6000 });
    v.wet(0.25);
  },
  gather_metal({ v, t, p, r }) {
    const k = p * (0.94 + r() * 0.12);
    v.bell({ f: 1500 * k, t, d: 0.3, g: 0.2, kind: 'metal' });
    v.tone({ f: 270 * k, f2: 150 * k, glide: 0.05, t, d: 0.09, a: 0.002, g: 0.2, type: 'triangle' });
    v.noise({ t, d: 0.02, a: 0.001, g: 0.18, type: 'highpass', f: 5000 });
  },

  // ----------------------------------------------------------------------------- construction
  place({ v, t, p }) {
    v.tone({ f: 280 * p, f2: 125 * p, glide: 0.08, t, d: 0.15, a: 0.002, g: 0.32, type: 'triangle' });
    v.tone({ f: 150 * p, f2: 80 * p, glide: 0.08, t, d: 0.13, a: 0.002, g: 0.14 });
    v.noise({ t, d: 0.05, a: 0.001, g: 0.18, type: 'bandpass', f: 1400, q: 1 });
    v.tone({ f: 620 * p, f2: 880 * p, glide: 0.04, t: t + 0.035, d: 0.08, a: 0.003, g: 0.1, type: 'triangle' });
  },
  build_complete({ v, t, p, r }) {
    v.tone({ f: 160 * p, f2: 85 * p, glide: 0.1, t, d: 0.18, g: 0.32 }); // soft "thunk" of a finished build
    bellRun(v, t + 0.04, [C5, E5, G5, C6], 0.075, { d: 0.55, g: 0.2, tail: 0.7, p });
    v.bell({ f: F(C6) * p, t: t + 0.3, d: 1.1, g: 0.09, kind: 'glass' });
    sparkles(v, t + 0.3, 0.5, 4, 0.07, r);
    v.wet(0.4);
  },
  upgrade({ v, t, p, r }) {
    bellRun(v, t, [C5, D5, E5, G5, A5, C6, E6], 0.055, { d: 0.4, g: 0.17, tail: 0.5, ratio: 3, index: 0.9, p });
    v.bell({ f: F(C6) * p, t: t + 0.38, d: 0.9, g: 0.07, kind: 'glass' });
    v.bell({ f: F(G6) * p, t: t + 0.4, d: 0.9, g: 0.06, kind: 'glass' });
    v.noise({ t: t + 0.05, a: 0.3, d: 0.5, g: 0.035, type: 'highpass', f: 6500 });
    sparkles(v, t + 0.25, 0.5, 5, 0.06, r);
    v.wet(0.4);
  },
  remove({ v, t, p }) {
    v.noise({ t, d: 0.22, a: 0.012, g: 0.2, type: 'bandpass', f: 1600, f2: 350, q: 0.8 });
    v.tone({ f: 320 * p, f2: 140 * p, glide: 0.18, t, d: 0.22, a: 0.004, g: 0.2 });
    v.tone({ f: 740 * p, f2: 540 * p, t: t + 0.12, d: 0.08, g: 0.07, type: 'triangle' });
  },
  deposit({ v, t, p, r }) {
    const k = p * (0.96 + r() * 0.08);
    v.tone({ f: 440 * k, f2: 330 * k, glide: 0.06, t, d: 0.09, a: 0.003, g: 0.3 });
    v.tone({ f: 523 * k, f2: 392 * k, glide: 0.06, t: t + 0.07, d: 0.1, a: 0.003, g: 0.28 });
    v.noise({ t, d: 0.04, a: 0.001, g: 0.14, type: 'bandpass', f: 900, q: 1.2 });
    v.noise({ t: t + 0.07, d: 0.04, a: 0.001, g: 0.12, type: 'bandpass', f: 1100, q: 1.2 });
  },

  // ------------------------------------------------------------------------- collect & rewards
  collect({ v, t, p, r }) {
    const k = p * (0.94 + r() * 0.15); // slight random pitch keeps repeated pickups lively
    v.tone({ f: 1318 * k, f2: 1760 * k, glide: 0.035, t, d: 0.11, a: 0.002, g: 0.22, type: 'triangle' });
    v.tone({ f: 2637 * k, t: t + 0.01, d: 0.08, a: 0.002, g: 0.06 });
    v.noise({ t, d: 0.015, a: 0.001, g: 0.04, type: 'highpass', f: 6000 });
  },
  coin({ v, t, p, r }) {
    const k = p * (0.97 + r() * 0.08);
    v.fm({ f: 1568 * k, t, d: 0.2, g: 0.2, ratio: 3, index: 0.8 });
    v.fm({ f: 2093 * k, t: t + 0.065, d: 0.42, g: 0.22, ratio: 3, index: 0.8 });
    v.noise({ t, d: 0.015, a: 0.001, g: 0.06, type: 'highpass', f: 6500 });
    v.wet(0.2);
  },
  reward({ v, t, p, r }) {
    bellRun(v, t, [E5, G5, C6, E6], 0.07, { d: 0.35, g: 0.18, tail: 0.5, p });
    sparkles(v, t + 0.15, 0.4, 3, 0.06, r);
    v.wet(0.35);
  },
  crate_open({ v, t, p, r }) {
    v.noise({ t, a: 0.26, d: 0.12, g: 0.2, type: 'bandpass', f: 300, f2: 3400, q: 1.1 }); // whoosh up
    v.tone({ f: 130 * p, f2: 210 * p, glide: 0.25, t, a: 0.06, d: 0.3, g: 0.12, type: 'sawtooth', lp: 500 }); // wooden creak
    const pop = t + 0.3;
    v.tone({ f: 420 * p, f2: 150 * p, glide: 0.08, t: pop, d: 0.12, g: 0.4 });
    v.noise({ t: pop, d: 0.05, g: 0.2, type: 'bandpass', f: 1800, q: 1 });
    bellRun(v, pop + 0.02, [C6, E6, G6, C7], 0.06, { d: 0.45, g: 0.17, tail: 0.5, p });
    sparkles(v, pop + 0.1, 0.5, 5, 0.07, r);
    v.wet(0.4);
  },
  celebrate({ v, t, p, r }) {
    v.noise({ t, d: 0.06, a: 0.001, g: 0.3, type: 'bandpass', f: 2000, q: 0.9 }); // confetti pop
    v.tone({ f: 400 * p, f2: 120 * p, glide: 0.1, t, d: 0.14, g: 0.28 });
    bellRun(v, t + 0.06, [E5, G5, C6, E6, G6], 0.06, { d: 0.4, g: 0.17, tail: 0.6, p });
    v.noise({ t: t + 0.1, a: 0.02, d: 0.35, g: 0.05, type: 'highpass', f: 7000 });
    sparkles(v, t + 0.2, 0.6, 6, 0.06, r);
    v.wet(0.4);
  },
  level_up({ v, t, p, r }) {
    padSwell(v, t, [C4, G4, E5], 0.05, 0.25, 0.9, 0.035);
    const notes = [C5, E5, G5, C6, E6, G6];
    for (let i = 0; i < notes.length; i++) {
      const last = i === notes.length - 1;
      v.pluck({ f: F(notes[i]) * p, t: t + i * 0.065, d: last ? 0.9 : 0.3, g: last ? 0.22 : 0.18, bright: 1.4 });
      if (last) v.fm({ f: F(notes[i]) * p, t: t + i * 0.065, d: 1.1, g: 0.1, ratio: 3.5, index: 0.8 });
    }
    sparkles(v, t + 0.3, 0.5, 4, 0.06, r);
    v.wet(0.4);
  },
  tier_up({ v, t, p, r }) {
    // soft timpani + brassy pad + fanfare + shimmering bells: the big moment
    v.tone({ f: 112 * p, f2: 56 * p, glide: 0.25, t, d: 0.7, g: 0.34 });
    v.tone({ f: 224 * p, f2: 112 * p, glide: 0.2, t, d: 0.4, g: 0.12, type: 'triangle' });
    v.noise({ t, d: 0.18, g: 0.2, type: 'lowpass', f: 700 });
    padSwell(v, t + 0.05, [C4, G4, C5, E5], 0.45, 1.0, 1.6, 0.05);
    const fan: [number, number, number][] = [
      [G4, 0.1, 0.35], [C5, 0.3, 0.35], [E5, 0.5, 0.35], [G5, 0.7, 0.4], [C6, 0.95, 1.4],
    ];
    for (const [m, dt, d] of fan) {
      v.tone({ f: F(m) * p, t: t + dt, a: 0.03, d, g: 0.11, type: 'sawtooth', lp: 2400, lp2: 900 });
      v.fm({ f: F(m) * p, t: t + dt, d: d + 0.3, g: 0.14, ratio: 2, index: 1 });
    }
    v.bell({ f: F(C6) * p, t: t + 0.95, d: 1.9, g: 0.1, kind: 'glass' });
    v.bell({ f: F(G6) * p, t: t + 1.05, d: 1.9, g: 0.07, kind: 'soft' });
    sparkles(v, t + 0.7, 1.5, 7, 0.07, r);
    v.noise({ t: t + 0.6, a: 0.4, d: 1.0, g: 0.04, type: 'highpass', f: 6000 });
    v.wet(0.55);
  },

  // ---------------------------------------------------------------------------- crafting & tech
  craft_start({ v, t, p }) {
    v.noise({ t, d: 0.03, a: 0.001, g: 0.18, type: 'highpass', f: 3500 });
    v.noise({ t: t + 0.09, d: 0.03, a: 0.001, g: 0.15, type: 'highpass', f: 3000 });
    v.tone({ f: 120 * p, f2: 250 * p, glide: 0.3, t: t + 0.04, a: 0.03, d: 0.28, g: 0.12, type: 'sawtooth', lp: 600 });
    v.tone({ f: 660 * p, t: t + 0.2, d: 0.08, g: 0.1, type: 'triangle' });
  },
  craft_done({ v, t, p }) {
    v.tone({ f: 200 * p, f2: 120 * p, t, d: 0.06, g: 0.25 }); // hammer tap
    v.bell({ f: F(A5) * p, t: t + 0.02, d: 0.65, g: 0.22, kind: 'metal' });
    v.bell({ f: F(E6) * p, t: t + 0.11, d: 0.8, g: 0.2, kind: 'metal' });
    v.wet(0.25);
  },
  research_done({ v, t, p, r }) {
    // "eureka": clear long bells climbing a G chord + an upward idea-sparkle
    v.tone({ f: 600 * p, f2: 2400 * p, glide: 0.3, t, a: 0.02, d: 0.35, g: 0.05, type: 'triangle' });
    const notes: [number, number, number][] = [[G5, 0.05, 1.6], [D6, 0.19, 1.5], [G6, 0.33, 1.9]];
    for (const [m, dt, d] of notes) {
      v.fm({ f: F(m) * p, t: t + dt, d, g: 0.2, ratio: 3.5, index: 2.2 });
      v.bell({ f: F(m) * p, t: t + dt, d: d * 0.7, g: 0.07, kind: 'glass' });
    }
    sparkles(v, t + 0.3, 0.8, 6, 0.06, r);
    v.wet(0.55);
  },
  mission_done({ v, t, p, r }) {
    padSwell(v, t + 0.3, [C5, E5, G5], 0.08, 0.5, 0.9, 0.04);
    const run = [G4, C5, E5, G5];
    for (let i = 0; i < run.length; i++) {
      v.pluck({ f: F(run[i]) * p, t: t + i * 0.09, d: 0.35, g: 0.2, bright: 1.3 });
      v.fm({ f: F(run[i]) * p, t: t + i * 0.09, d: 0.4, g: 0.08, ratio: 2, index: 1 });
    }
    for (const m of [C5, E5, G5, C6]) v.fm({ f: F(m) * p, t: t + 0.36, d: 1.2, g: 0.13, ratio: 2, index: 0.9 });
    v.bell({ f: F(C6) * p, t: t + 0.36, d: 1.3, g: 0.08, kind: 'glass' });
    sparkles(v, t + 0.4, 0.6, 5, 0.06, r);
    v.wet(0.45);
  },
  discover({ v, t, p, r }) {
    // ethereal wonder sting: slow rising bells over a soft swell
    padSwell(v, t, [D5 - 12, A4, D5], 0.5, 0.4, 1.2, 0.03);
    const notes: [number, number][] = [[D5, 0], [A5, 0.17], [D6, 0.34], [E6, 0.55]];
    for (const [m, dt] of notes) v.fm({ f: F(m) * p, t: t + dt, d: 1.5, g: 0.17, ratio: 3, index: 1.4 });
    v.noise({ t, a: 0.5, d: 0.9, g: 0.04, type: 'bandpass', f: 1500, f2: 4500, q: 0.8 });
    sparkles(v, t + 0.5, 0.9, 5, 0.05, r);
    v.wet(0.65);
  },

  // ---------------------------------------------------------------------------------- combat
  alarm({ v, t, p }) {
    // gentle doorbell-style "ding-dong, ding-dong": attention without stress
    const times = [0, 0.4, 1.1, 1.5];
    const notes = [E5, C5, E5, C5];
    for (let i = 0; i < 4; i++) {
      v.fm({ f: F(notes[i]) * p, t: t + times[i], d: 0.9, g: 0.22, ratio: 2, index: 0.8 });
      v.tone({ f: F(notes[i]) * p, t: t + times[i], d: 0.5, g: 0.1, type: 'triangle', lp: 1500 });
    }
    v.tone({ f: 110 * p, t, a: 0.25, hold: 0.8, d: 0.9, g: 0.08, type: 'triangle' });
    v.tone({ f: 165 * p, t, a: 0.25, hold: 0.8, d: 0.9, g: 0.06, type: 'triangle' });
    v.wet(0.3);
  },
  attack_start({ v, t, p }) {
    // low soft horn on a fifth + two war-drum thumps; rousing, not scary
    for (const [f, dt, g] of [[110, 0, 0.13], [164.8, 0.05, 0.1], [220, 0.1, 0.06]] as const) {
      v.tone({ f: f * p, t: t + dt, a: 0.25, hold: 0.35, d: 0.7, g, type: 'sawtooth', lp: 600, lp2: 1100 });
    }
    v.tone({ f: 100 * p, f2: 48 * p, glide: 0.12, t, d: 0.6, g: 0.4 });
    v.tone({ f: 200 * p, f2: 100 * p, glide: 0.1, t, d: 0.3, g: 0.12, type: 'triangle' });
    v.noise({ t, d: 0.12, g: 0.22, type: 'lowpass', f: 600 });
    v.tone({ f: 90 * p, f2: 45 * p, glide: 0.12, t: t + 0.45, d: 0.5, g: 0.3 });
    v.fm({ f: F(A4) * p, t: t + 0.6, d: 0.8, g: 0.1, ratio: 2, index: 1 });
    v.wet(0.3);
  },
  victory({ v, t, p, r }) {
    v.tone({ f: 112 * p, f2: 60 * p, glide: 0.2, t, d: 0.5, g: 0.28 });
    v.tone({ f: 224 * p, f2: 120 * p, glide: 0.2, t, d: 0.3, g: 0.1, type: 'triangle' });
    padSwell(v, t, [C4, G4, C5, E5], 0.25, 0.6, 1.2, 0.045);
    const run = [C5, E5, G5, C6, E6];
    for (let i = 0; i < run.length; i++) {
      const last = i === run.length - 1;
      v.fm({ f: F(run[i]) * p, t: t + 0.08 + i * 0.1, d: last ? 1.5 : 0.5, g: last ? 0.2 : 0.17, ratio: 2, index: 1.1 });
      v.pluck({ f: F(run[i]) * p, t: t + 0.08 + i * 0.1, d: 0.4, g: 0.1, bright: 1.3 });
    }
    v.bell({ f: F(C6) * p, t: t + 0.5, d: 1.6, g: 0.09, kind: 'glass' });
    v.bell({ f: F(G6) * p, t: t + 0.52, d: 1.6, g: 0.07, kind: 'soft' });
    sparkles(v, t + 0.4, 1.0, 6, 0.06, r);
    v.wet(0.5);
  },
  turret_bullet({ v, t, p, r }) {
    const k = p * (0.93 + r() * 0.14);
    v.noise({ t, d: 0.03, a: 0.001, g: 0.22, type: 'bandpass', f: 2600 * k, q: 1 });
    v.tone({ f: 900 * k, f2: 300 * k, glide: 0.04, t, d: 0.06, a: 0.001, g: 0.28, type: 'triangle' });
    v.tone({ f: 140 * k, f2: 90 * k, t, d: 0.05, g: 0.18 });
  },
  turret_flame({ v, t, p, r }) {
    const k = p * (0.95 + r() * 0.1);
    v.noise({ t, a: 0.03, d: 0.2, g: 0.42, type: 'bandpass', f: 600 * k, f2: 1500 * k, q: 0.7 });
    v.noise({ t, a: 0.02, d: 0.16, g: 0.2, type: 'lowpass', f: 700 });
    v.tone({ f: 130 * k, f2: 90 * k, t, a: 0.02, d: 0.16, g: 0.1, type: 'triangle' });
  },
  turret_missile({ v, t, p }) {
    v.noise({ t, a: 0.03, d: 0.4, g: 0.24, type: 'bandpass', f: 500, f2: 2800, q: 0.7 });
    v.tone({ f: 170 * p, f2: 70 * p, glide: 0.12, t, d: 0.18, g: 0.3, type: 'triangle' });
    v.tone({ f: 100 * p, f2: 50 * p, glide: 0.12, t, d: 0.16, g: 0.16 });
    v.tone({ f: 600 * p, f2: 1300 * p, glide: 0.3, t: t + 0.03, a: 0.03, d: 0.3, g: 0.05, type: 'triangle' });
  },
  turret_laser({ v, t, p, r }) {
    const k = p * (0.95 + r() * 0.1);
    v.tone({ f: 1900 * k, f2: 620 * k, glide: 0.11, t, d: 0.13, a: 0.003, g: 0.22 });
    v.tone({ f: 3800 * k, f2: 1250 * k, glide: 0.1, t, d: 0.08, a: 0.003, g: 0.06, type: 'triangle' });
    v.noise({ t, d: 0.02, a: 0.001, g: 0.06, type: 'highpass', f: 5000 });
  },
  turret_plasma({ v, t, p, r }) {
    const k = p * (0.95 + r() * 0.1);
    v.fm({ f: 320 * k, t, d: 0.22, g: 0.3, ratio: 1.5, index: 2 });
    v.tone({ f: 260 * k, f2: 720 * k, glide: 0.09, t, d: 0.2, a: 0.004, g: 0.14 });
    v.bell({ f: 1180 * k, t: t + 0.04, d: 0.25, g: 0.05, kind: 'glass' });
  },
  turret_rail({ v, t, p }) {
    v.noise({ t, d: 0.04, a: 0.001, g: 0.2, type: 'highpass', f: 2500 });
    v.tone({ f: 2400 * p, f2: 380 * p, glide: 0.14, t, d: 0.16, a: 0.002, g: 0.2 });
    v.bell({ f: 1250 * p, t: t + 0.03, d: 0.55, g: 0.1, kind: 'metal' });
    v.tone({ f: 110 * p, f2: 60 * p, t, d: 0.12, g: 0.3 });
  },
  turret_cannon({ v, t, p }) {
    v.tone({ f: 125 * p, f2: 42 * p, glide: 0.2, t, d: 0.35, g: 0.3 });
    v.tone({ f: 230 * p, f2: 90 * p, glide: 0.12, t, d: 0.2, g: 0.17, type: 'triangle' });
    v.noise({ t, d: 0.18, g: 0.22, type: 'lowpass', f: 1500, f2: 250 });
    v.noise({ t, d: 0.05, a: 0.002, g: 0.12, type: 'bandpass', f: 1200, q: 0.8 });
  },
  alien_hit({ v, t, p, r }) {
    const k = p * (0.85 + r() * 0.3);
    v.tone({ f: 520 * k, f2: 170 * k, glide: 0.1, t, d: 0.12, a: 0.003, g: 0.3 }); // squish
    v.tone({ f: 330 * k, f2: 220 * k, t: t + 0.01, d: 0.1, g: 0.1, type: 'triangle' });
    v.noise({ t, d: 0.07, a: 0.002, g: 0.2, type: 'lowpass', f: 800, f2: 300, q: 0.8 }); // wet splat
  },
  alien_die({ v, t, p, r }) {
    const k = p * (0.9 + r() * 0.2);
    v.tone({ f: 260 * k, f2: 1100 * k, glide: 0.06, t, d: 0.1, a: 0.003, g: 0.26 }); // cartoony "bwip"
    v.noise({ t: t + 0.07, d: 0.04, a: 0.001, g: 0.2, type: 'bandpass', f: 2500, q: 2 }); // pop
    v.tone({ f: 500 * k, f2: 120 * k, t: t + 0.07, d: 0.1, g: 0.2 });
    v.fm({ f: F(D6) * k, t: t + 0.1, d: 0.25, g: 0.08, ratio: 3, index: 0.7 });
    v.fm({ f: F(A6) * k, t: t + 0.16, d: 0.3, g: 0.07, ratio: 3, index: 0.7 });
    v.wet(0.18);
  },
  explosion({ v, t, p }) {
    // warm: soft attack, low sine drop, dark noise bloom, no harsh top end
    v.tone({ f: 125 * p, f2: 38 * p, glide: 0.5, t, a: 0.004, d: 0.75, g: 0.42 });
    v.tone({ f: 240 * p, f2: 80 * p, glide: 0.3, t, a: 0.004, d: 0.4, g: 0.16, type: 'triangle' });
    v.noise({ t, a: 0.004, d: 0.6, g: 0.3, type: 'lowpass', f: 2400, f2: 200 });
    v.noise({ t, a: 0.004, d: 0.65, g: 0.3, type: 'lowpass', f: 1500, f2: 150, brown: true });
    v.noise({ t, a: 0.002, d: 0.14, g: 0.1, type: 'bandpass', f: 900, q: 0.7 });
    v.wet(0.2);
  },
  shield_hit({ v, t, p }) {
    v.tone({ f: 440 * p, t, d: 0.35, g: 0.1, type: 'triangle', lp: 1800 });
    v.tone({ f: 447 * p, t, d: 0.35, g: 0.1, type: 'triangle', lp: 1800 });
    v.noise({ t, d: 0.08, a: 0.001, g: 0.15, type: 'bandpass', f: 3500, f2: 1200, q: 1.2 }); // zap
    v.bell({ f: 1760 * p, t: t + 0.01, d: 0.5, g: 0.07, kind: 'glass' });
    v.wet(0.3);
  },
  player_hurt({ v, t, p }) {
    v.tone({ f: 300 * p, f2: 150 * p, glide: 0.14, t, d: 0.18, a: 0.004, g: 0.3, lp: 900 }); // soft "oof"
    v.noise({ t, d: 0.08, a: 0.002, g: 0.15, type: 'lowpass', f: 500 });
  },

  // ----------------------------------------------------------------------------------- world
  spin_tick({ v, t, p }) {
    v.tone({ f: 1400 * p, f2: 1000 * p, glide: 0.02, t, d: 0.03, a: 0.001, g: 0.24, type: 'triangle' });
    v.noise({ t, d: 0.012, a: 0.001, g: 0.1, type: 'bandpass', f: 4000, q: 1.5 });
  },
  spin_win({ v, t, p, r }) {
    const run = [C5, D5, E5, G5, A5, C6, D6, E6];
    for (let i = 0; i < run.length; i++) v.fm({ f: F(run[i]) * p, t: t + i * 0.065, d: 0.35, g: 0.14, ratio: 2, index: 1 });
    const chord = t + run.length * 0.065;
    for (const m of [C6, E6, G6, C7]) v.fm({ f: F(m) * p, t: chord, d: 1.4, g: 0.1, ratio: 2, index: 1 });
    v.bell({ f: F(C6) * p, t: chord, d: 1.4, g: 0.08, kind: 'glass' });
    v.tone({ f: 112 * p, f2: 60 * p, t: chord, d: 0.4, g: 0.3 });
    sparkles(v, chord, 0.8, 6, 0.07, r);
    v.wet(0.5);
  },
  door({ v, t, p }) {
    v.noise({ t, a: 0.02, d: 0.16, g: 0.13, type: 'bandpass', f: 800, f2: 1600, q: 0.9 }); // slide
    v.tone({ f: 880 * p, t: t + 0.12, d: 0.06, g: 0.08, type: 'triangle' });
    v.tone({ f: 180 * p, f2: 110 * p, t: t + 0.15, d: 0.09, g: 0.22 }); // soft thunk
  },
  vehicle_start({ v, t, p }) {
    v.noise({ t, d: 0.02, a: 0.001, g: 0.2, type: 'highpass', f: 3000 }); // key click
    v.tone({ f: 45 * p, f2: 95 * p, glide: 0.5, t: t + 0.05, a: 0.05, hold: 0.15, d: 0.7, g: 0.22, type: 'sawtooth', lp: 300, lp2: 700 });
    v.tone({ f: 90 * p, f2: 190 * p, glide: 0.5, t: t + 0.05, a: 0.05, hold: 0.15, d: 0.7, g: 0.13, type: 'sawtooth', lp: 500, lp2: 1200 });
    v.noise({ t: t + 0.05, a: 0.12, d: 0.7, g: 0.14, type: 'lowpass', f: 400, f2: 900, brown: true });
    v.tone({ f: 880 * p, t: t + 0.6, d: 0.08, g: 0.09, type: 'triangle' });
    v.tone({ f: 1175 * p, t: t + 0.7, d: 0.1, g: 0.09, type: 'triangle' });
  },
  teleport({ v, t, p }) {
    v.tone({ f: 180 * p, f2: 2200 * p, glide: 0.55, t, a: 0.02, d: 0.7, g: 0.2 });
    v.tone({ f: 183 * p, f2: 2250 * p, glide: 0.55, t, a: 0.02, d: 0.7, g: 0.12, type: 'triangle' });
    v.noise({ t, a: 0.3, d: 0.4, g: 0.12, type: 'bandpass', f: 300, f2: 5000, q: 2 });
    const end = t + 0.62;
    v.tone({ f: 1200 * p, f2: 400 * p, t: end, d: 0.14, g: 0.2 });
    v.fm({ f: F(C7) * p, t: end + 0.02, d: 0.7, g: 0.1, ratio: 3, index: 0.8 });
    v.wet(0.5);
  },
  recruit({ v, t, p, r }) {
    padSwell(v, t, [C4, E4, G4], 0.15, 0.25, 0.8, 0.035);
    v.fm({ f: F(G5) * p, t, d: 0.5, g: 0.2, ratio: 2, index: 1 });
    v.fm({ f: F(C6) * p, t: t + 0.11, d: 0.9, g: 0.22, ratio: 2, index: 1 });
    v.pluck({ f: F(E6) * p, t: t + 0.24, d: 0.5, g: 0.1, bright: 1.2 });
    sparkles(v, t + 0.2, 0.4, 3, 0.05, r);
    v.wet(0.4);
  },
};
