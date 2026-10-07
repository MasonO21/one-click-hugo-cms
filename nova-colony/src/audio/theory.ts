/**
 * Music theory + mood definitions for the generative ambient score. Pure functions (no WebAudio,
 * injectable RNG) so the musical rules are unit-testable.
 *
 * Model: each mood is a mode (7-note scale) with a tonic, a pentatonic "melody ladder" picked from
 * it, and a few chord progressions written as scale degrees. Chords are built by stacking thirds on
 * the mode, so any mode yields sensible chords without hand-writing every voicing.
 */

export type MoodId = 'calm' | 'mystic' | 'warm' | 'eerie' | 'cold' | 'epic';
export const MOOD_IDS: readonly MoodId[] = ['calm', 'mystic', 'warm', 'eerie', 'cold', 'epic'];

export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
} as const;

/** Chord flavour: plain triad, +7th, add9 (no 7th), suspended 2nd / 4th. */
export type Ext = 'tri' | '7' | '9' | 'sus2' | 'sus4';
/** [scale degree 0..6, extension]. */
export type ChordSpec = readonly [degree: number, ext: Ext];

export type MelodyTimbre = 'marimba' | 'bell' | 'glass' | 'flute';
export type PadWave = 'warm' | 'glass' | 'hollow' | 'brass';
export type Ambience = 'crickets' | 'wind' | 'shimmer' | 'bubbles' | 'none';

export interface MoodDef {
  id: MoodId;
  label: string;
  /** Tonic as a MIDI note (the chord/bass range is derived from it). */
  root: number;
  mode: readonly number[];
  /** Indices into `mode` forming the pentatonic melody ladder. */
  melodyDegrees: readonly number[];
  /** Tempo range (BPM); one value is picked per phrase. */
  bpm: readonly [number, number];
  progressions: readonly (readonly ChordSpec[])[];
  melody: {
    timbre: MelodyTimbre;
    /** Typical fraction of a "full" bar that gets notes (0..1). */
    density: number;
    /** Melody register: start / lowest / highest MIDI note. */
    center: number;
    low: number;
    high: number;
  };
  pad: { wave: PadWave; cutoff: number; level: number };
  /** Probability per bar of an extra high bell sparkle. */
  sparkle: number;
  /** Soft shaker level 0..1 (0 = none). */
  shaker: number;
  /** Bass loudness 0..1. */
  bass: number;
  ambience: Ambience;
  /** Reverb send amount 0..1. */
  wet: number;
}

export const MOODS: Readonly<Record<MoodId, MoodDef>> = {
  // Crash Valley — sunny, safe, simple.
  calm: {
    id: 'calm', label: 'Calm', root: 60, mode: MODES.ionian, melodyDegrees: [0, 1, 2, 4, 5], bpm: [74, 78],
    progressions: [
      [[0, '9'], [5, '7'], [3, '9'], [4, 'tri']],
      [[0, '9'], [3, '9'], [5, '7'], [4, 'sus4']],
      [[0, 'tri'], [2, '7'], [3, '9'], [0, '9']],
      [[3, '9'], [0, '9'], [4, 'tri'], [5, '7']],
      [[0, '9'], [4, 'tri'], [5, '7'], [3, '9']],
    ],
    melody: { timbre: 'marimba', density: 0.55, center: 72, low: 60, high: 86 },
    pad: { wave: 'warm', cutoff: 1000, level: 1 },
    sparkle: 0.25, shaker: 0.35, bass: 0.9, ambience: 'crickets', wet: 0.35,
  },
  // Pinewood Forest, Red Desert — campfire folk warmth.
  warm: {
    id: 'warm', label: 'Warm', root: 55, mode: MODES.mixolydian, melodyDegrees: [0, 1, 2, 4, 5], bpm: [82, 88],
    progressions: [
      [[0, 'tri'], [6, 'tri'], [3, '9'], [0, 'tri']],
      [[0, '9'], [3, 'tri'], [6, 'tri'], [3, 'tri']],
      [[0, 'tri'], [5, '7'], [3, '9'], [6, 'tri']],
      [[0, '9'], [4, '7'], [6, 'tri'], [3, '9']],
    ],
    melody: { timbre: 'marimba', density: 0.65, center: 74, low: 62, high: 86 },
    pad: { wave: 'warm', cutoff: 1150, level: 0.95 },
    sparkle: 0.2, shaker: 0.7, bass: 1, ambience: 'crickets', wet: 0.3,
  },
  // Crystal Canyon, Alien Ruins — Lydian wonder, bells, long reverb.
  mystic: {
    id: 'mystic', label: 'Mystic', root: 53, mode: MODES.lydian, melodyDegrees: [0, 2, 3, 4, 5], bpm: [70, 74],
    progressions: [
      [[0, '7'], [1, 'tri'], [0, '7'], [1, 'tri']],
      [[0, '9'], [1, 'tri'], [5, '7'], [0, '9']],
      [[0, '7'], [2, '7'], [1, 'tri'], [0, '9']],
      [[5, '7'], [1, 'tri'], [0, '7'], [2, '7']],
    ],
    melody: { timbre: 'bell', density: 0.4, center: 77, low: 65, high: 89 },
    pad: { wave: 'glass', cutoff: 1900, level: 0.9 },
    sparkle: 0.5, shaker: 0, bass: 0.8, ambience: 'shimmer', wet: 0.55,
  },
  // Toxic Marsh — Dorian, hollow tones, sparse; still cozy.
  eerie: {
    id: 'eerie', label: 'Eerie', root: 50, mode: MODES.dorian, melodyDegrees: [0, 2, 3, 4, 6], bpm: [70, 72],
    progressions: [
      [[0, '7'], [3, 'tri'], [0, '7'], [6, 'tri']],
      [[0, '9'], [6, 'tri'], [3, 'tri'], [0, 'sus2']],
      [[0, 'sus2'], [4, '7'], [3, 'tri'], [0, '7']],
      [[0, '7'], [2, 'tri'], [3, 'tri'], [0, '7']],
    ],
    melody: { timbre: 'flute', density: 0.3, center: 69, low: 57, high: 81 },
    pad: { wave: 'hollow', cutoff: 900, level: 0.95 },
    sparkle: 0.3, shaker: 0, bass: 0.8, ambience: 'bubbles', wet: 0.5,
  },
  // Frozen Ridge — open sus chords, glass bells, wind.
  cold: {
    id: 'cold', label: 'Cold', root: 57, mode: MODES.aeolian, melodyDegrees: [0, 2, 3, 4, 6], bpm: [70, 74],
    progressions: [
      [[0, 'sus2'], [5, '7'], [2, '9'], [6, 'sus4']],
      [[0, '9'], [5, 'tri'], [2, 'tri'], [6, 'tri']],
      [[0, 'sus2'], [6, 'tri'], [5, '7'], [4, 'sus4']],
      [[2, '9'], [6, 'tri'], [0, 'sus2'], [5, '7']],
    ],
    melody: { timbre: 'glass', density: 0.35, center: 76, low: 64, high: 91 },
    pad: { wave: 'glass', cutoff: 2200, level: 0.85 },
    sparkle: 0.45, shaker: 0, bass: 0.75, ambience: 'wind', wet: 0.5,
  },
  // Titanium Highlands — heroic major, brassy swells, steady pulse.
  epic: {
    id: 'epic', label: 'Epic', root: 50, mode: MODES.ionian, melodyDegrees: [0, 1, 2, 4, 5], bpm: [84, 90],
    progressions: [
      [[0, 'tri'], [4, 'tri'], [5, '7'], [3, '9']],
      [[3, '9'], [0, 'tri'], [4, 'tri'], [5, '7']],
      [[0, '9'], [2, '7'], [3, '9'], [4, 'tri']],
      [[5, '7'], [3, '9'], [0, 'tri'], [4, 'sus4']],
    ],
    melody: { timbre: 'marimba', density: 0.5, center: 74, low: 62, high: 90 },
    pad: { wave: 'brass', cutoff: 1500, level: 1.05 },
    sparkle: 0.3, shaker: 0.3, bass: 1, ambience: 'none', wet: 0.4,
  },
};

/** Resolve a biome mood string (unknown -> calm). */
export function moodFor(id: string | undefined | null): MoodDef {
  return (id && (MOODS as Record<string, MoodDef | undefined>)[id]) || MOODS.calm;
}

// ---------------------------------------------------------------------------------------------
// pitch helpers

export const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** Note `i` steps up the infinite 7-note ladder of a mode (negative = below the tonic). */
export function modeNote(root: number, mode: readonly number[], i: number): number {
  return root + 12 * Math.floor(i / 7) + mode[mod(i, 7)];
}

/** Note `k` on the pentatonic melody ladder of a mood (k may be negative or exceed 4). */
export function ladderNote(mood: MoodDef, k: number): number {
  const n = mood.melodyDegrees.length;
  return mood.root + 12 * Math.floor(k / n) + mood.mode[mood.melodyDegrees[mod(k, n)]];
}

interface LadderRange {
  kMin: number;
  kMax: number;
  kCenter: number;
}
const rangeCache = new WeakMap<MoodDef, LadderRange>();

/** Ladder index range [kMin, kMax] whose notes fall inside the mood's melody register. */
export function ladderRange(mood: MoodDef): LadderRange {
  const cached = rangeCache.get(mood);
  if (cached) return cached;
  let kMin = Number.POSITIVE_INFINITY;
  let kMax = Number.NEGATIVE_INFINITY;
  let kCenter = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let k = -40; k <= 60; k++) {
    const n = ladderNote(mood, k);
    if (n >= mood.melody.low && n <= mood.melody.high) {
      if (k < kMin) kMin = k;
      if (k > kMax) kMax = k;
      const d = Math.abs(n - mood.melody.center);
      if (d < bestDist) {
        bestDist = d;
        kCenter = k;
      }
    }
  }
  const range = { kMin, kMax, kCenter };
  rangeCache.set(mood, range);
  return range;
}

export interface Chord {
  spec: ChordSpec;
  /** Pad voicing as MIDI notes (ascending, lowest in [PAD_LOW, PAD_LOW+12)). */
  notes: number[];
  /** Root of the chord as a bass MIDI note in [36, 47] (audible on phone speakers). */
  bass: number;
  /** Distinct pitch classes (0..11) of the chord tones. */
  pcs: number[];
  /** Short readable label for the debug board, e.g. "IV9". */
  label: string;
}

export const PAD_LOW = 52;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** Scale-degree offsets (in mode steps from the chord root) for each chord flavour. */
const CHORD_STEPS: Record<Ext, readonly number[]> = {
  tri: [0, 2, 4],
  '7': [0, 2, 4, 6],
  '9': [0, 2, 4, 8],
  sus2: [0, 1, 4],
  sus4: [0, 3, 4],
};

/** Build a chord (pad voicing, bass note, pitch classes) from a degree spec in a mood's mode. */
export function buildChord(mood: MoodDef, spec: ChordSpec): Chord {
  const [degree, ext] = spec;
  const raw = CHORD_STEPS[ext].map((s) => modeNote(mood.root, mood.mode, degree + s));
  // Fold the whole chord into the pad register while keeping its internal shape.
  let shift = 0;
  const lowest = Math.min(...raw);
  while (lowest + shift >= PAD_LOW + 12) shift -= 12;
  while (lowest + shift < PAD_LOW) shift += 12;
  const notes = raw.map((n) => n + shift).sort((a, b) => a - b);
  const rootPc = mod(raw[0], 12);
  const bass = 36 + mod(rootPc - 36, 12);
  const pcs = [...new Set(raw.map((n) => mod(n, 12)))];
  const sfx = ext === 'tri' ? '' : ext === '7' ? '7' : ext === '9' ? 'add9' : ext;
  return { spec, notes, bass, pcs, label: `${ROMAN[degree]}${sfx}` };
}

/** How well a melody note sits over a chord: chord tones +, semitone clashes -, tritones slightly -. */
export function consonance(note: number, chordPcs: readonly number[]): number {
  const pc = mod(note, 12);
  let score = 0;
  for (const c of chordPcs) {
    const d = Math.abs(pc - c);
    const ic = Math.min(d, 12 - d);
    if (ic === 0) score += 2;
    else if (ic === 1) score -= 3;
    else if (ic === 6) score -= 1;
    else if (ic === 3 || ic === 4 || ic === 5) score += 0.3;
  }
  return score;
}

// ---------------------------------------------------------------------------------------------
// randomness

/** Small fast seeded PRNG (mulberry32) returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rand = () => number;

/** Weighted pick of an index (weights >= 0). Returns -1 when all weights are 0. */
export function pickWeighted(rnd: Rand, weights: ArrayLike<number>): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  if (total <= 0) return -1;
  let r = rnd() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/** Choose a progression index different from `last` (when more than one exists). */
export function pickProgression(rnd: Rand, mood: MoodDef, last: number): number {
  const n = mood.progressions.length;
  if (n <= 1) return 0;
  let i = Math.floor(rnd() * n);
  if (i === last) i = (i + 1 + Math.floor(rnd() * (n - 1))) % n;
  return i;
}

/** Pick this phrase's tempo within the mood's range. */
export function pickBpm(rnd: Rand, mood: MoodDef): number {
  return mood.bpm[0] + rnd() * (mood.bpm[1] - mood.bpm[0]);
}

// ---------------------------------------------------------------------------------------------
// melody generation

export interface MelodyNote {
  /** 16th-note step within the bar (0..15). */
  step: number;
  /** Ladder index (see ladderNote). */
  k: number;
  /** Length in 16th steps. */
  len: number;
  /** Velocity 0..1. */
  vel: number;
}

/** Relative likelihood of a note landing on each 16th step (beats strongest, off-16ths rare). */
export const STEP_WEIGHTS: readonly number[] = [3, 0.15, 0.7, 0.15, 1.9, 0.15, 1.2, 0.15, 2.3, 0.15, 1.2, 0.15, 1.9, 0.15, 1.0, 0.25];

export interface MotifOptions {
  /** 0..1 — how busy the bar is (mood density x night/combat factors). */
  density: number;
  /** Ladder index to start the walk from. */
  startK: number;
  /** Pitch classes of the current chord (for consonance weighting). */
  chordPcs: readonly number[];
  /** Max notes in the bar. */
  maxNotes?: number;
}

/** Generate one bar of melody: a few notes on weighted steps, random-walking along the ladder. */
export function generateMotif(rnd: Rand, mood: MoodDef, o: MotifOptions): MelodyNote[] {
  const { kMin, kMax } = ladderRange(mood);
  const maxNotes = o.maxNotes ?? 7;
  const target = Math.max(0, Math.min(maxNotes, Math.round(o.density * 6 * (0.55 + 0.9 * rnd()))));
  if (target === 0) return [];

  const weights = STEP_WEIGHTS.slice();
  const steps: number[] = [];
  for (let n = 0; n < target; n++) {
    const s = pickWeighted(rnd, weights);
    if (s < 0) break;
    steps.push(s);
    // keep notes at least an 8th apart: zero out the neighbours
    for (let d = -1; d <= 1; d++) if (s + d >= 0 && s + d < 16) weights[s + d] = 0;
  }
  steps.sort((a, b) => a - b);

  const notes: MelodyNote[] = [];
  let k = Math.max(kMin, Math.min(kMax, o.startK));
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const strong = step % 4 === 0;
    // candidate moves: -3..+3 ladder steps, favouring small moves and consonant landings
    const cand: number[] = [];
    const w: number[] = [];
    for (let d = -3; d <= 3; d++) {
      const nk = k + d;
      if (nk < kMin || nk > kMax) {
        cand.push(nk);
        w.push(0);
        continue;
      }
      const cons = consonance(ladderNote(mood, nk), o.chordPcs);
      const move = d === 0 ? 0.45 : Math.abs(d) === 1 ? 1.5 : Math.abs(d) === 2 ? 1 : 0.35;
      cand.push(nk);
      w.push(move * Math.exp((strong ? 0.8 : 0.45) * cons));
    }
    const pi = pickWeighted(rnd, w);
    if (pi >= 0) k = cand[pi];
    const nextStep = i + 1 < steps.length ? steps[i + 1] : 16;
    const len = Math.max(2, Math.min(8, nextStep - step));
    notes.push({ step, k, len, vel: 0.55 + 0.45 * rnd() * (strong ? 1 : 0.85) });
  }
  return notes;
}

/** Repeat an earlier motif (optionally shifted along the ladder) for recognisable phrasing. */
export function varyMotif(rnd: Rand, mood: MoodDef, prev: readonly MelodyNote[]): MelodyNote[] {
  const { kMin, kMax } = ladderRange(mood);
  const shift = rnd() < 0.4 ? (rnd() < 0.5 ? -1 : 1) : 0;
  const out: MelodyNote[] = [];
  for (const n of prev) {
    const k = Math.max(kMin, Math.min(kMax, n.k + shift));
    out.push({ step: n.step, k, len: n.len, vel: Math.max(0.4, Math.min(1, n.vel * (0.9 + 0.2 * rnd()))) });
  }
  return out;
}
