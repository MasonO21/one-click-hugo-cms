import { describe, expect, it } from 'vitest';
import {
  MODES, MOODS, MOOD_IDS, PAD_LOW, buildChord, consonance, generateMotif, ladderNote, ladderRange, midiToFreq,
  modeNote, moodFor, mulberry32, pickBpm, pickProgression, pickWeighted, varyMotif, STEP_WEIGHTS,
} from '../src/audio/theory';
import { createDataRegistry } from '../src/data';

describe('pitch helpers', () => {
  it('converts MIDI to frequency', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
    expect(midiToFreq(60)).toBeCloseTo(261.626, 2);
    expect(midiToFreq(81)).toBeCloseTo(880, 6);
  });

  it('walks a mode across octaves, including below the tonic', () => {
    const m = MODES.ionian;
    expect(modeNote(60, m, 0)).toBe(60);
    expect(modeNote(60, m, 2)).toBe(64);
    expect(modeNote(60, m, 7)).toBe(72);
    expect(modeNote(60, m, 9)).toBe(76);
    expect(modeNote(60, m, -1)).toBe(59);
    expect(modeNote(60, m, -7)).toBe(48);
  });

  it('ladderNote is a pentatonic ladder that wraps by octave', () => {
    const calm = MOODS.calm; // C D E G A
    expect([0, 1, 2, 3, 4, 5].map((k) => ladderNote(calm, k))).toEqual([60, 62, 64, 67, 69, 72]);
    expect(ladderNote(calm, -1)).toBe(57);
  });

  it('ladderRange covers the melody register, centred', () => {
    for (const id of MOOD_IDS) {
      const mood = MOODS[id];
      const { kMin, kMax, kCenter } = ladderRange(mood);
      expect(kMax - kMin).toBeGreaterThanOrEqual(7);
      expect(ladderNote(mood, kMin)).toBeGreaterThanOrEqual(mood.melody.low);
      expect(ladderNote(mood, kMax)).toBeLessThanOrEqual(mood.melody.high);
      expect(Math.abs(ladderNote(mood, kCenter) - mood.melody.center)).toBeLessThanOrEqual(3);
    }
  });
});

describe('mood definitions', () => {
  it('has all six biome moods with sane tempo (70-90 BPM) and valid progressions', () => {
    expect(MOOD_IDS.length).toBe(6);
    for (const id of MOOD_IDS) {
      const m = MOODS[id];
      expect(m.id).toBe(id);
      expect(m.mode).toHaveLength(7);
      expect(m.bpm[0]).toBeGreaterThanOrEqual(70);
      expect(m.bpm[1]).toBeLessThanOrEqual(90);
      expect(m.bpm[0]).toBeLessThanOrEqual(m.bpm[1]);
      expect(m.progressions.length).toBeGreaterThanOrEqual(3); // variety so it does not loop obviously
      for (const prog of m.progressions) {
        expect(prog).toHaveLength(4);
        for (const [deg] of prog) {
          expect(deg).toBeGreaterThanOrEqual(0);
          expect(deg).toBeLessThanOrEqual(6);
        }
      }
      for (const d of m.melodyDegrees) expect(d).toBeLessThan(7);
    }
  });

  it('every biome mood in the world data has a definition', () => {
    const data = createDataRegistry();
    for (const b of data.biomes) expect(MOODS[b.mood as keyof typeof MOODS], `${b.id}: ${b.mood}`).toBeTruthy();
  });

  it('moodFor falls back to calm', () => {
    expect(moodFor('epic').id).toBe('epic');
    expect(moodFor('nope').id).toBe('calm');
    expect(moodFor(undefined).id).toBe('calm');
  });
});

describe('chords', () => {
  it('stacks thirds on the mode (C major: I = C E G, vi7 = A C E G, IV add9 = F A C G)', () => {
    const calm = MOODS.calm;
    expect(buildChord(calm, [0, 'tri']).pcs.sort((a, b) => a - b)).toEqual([0, 4, 7]);
    expect(buildChord(calm, [5, '7']).pcs.sort((a, b) => a - b)).toEqual([0, 4, 7, 9]);
    expect(buildChord(calm, [3, '9']).pcs.sort((a, b) => a - b)).toEqual([0, 5, 7, 9]);
  });

  it('lydian II is a major chord, dorian i7 is minor-seventh', () => {
    // F lydian degree 1 = G B D
    expect(buildChord(MOODS.mystic, [1, 'tri']).pcs.sort((a, b) => a - b)).toEqual([2, 7, 11]);
    // D dorian i7 = D F A C
    expect(buildChord(MOODS.eerie, [0, '7']).pcs.sort((a, b) => a - b)).toEqual([0, 2, 5, 9]);
  });

  it('suspended chords drop the third', () => {
    const sus2 = buildChord(MOODS.cold, [0, 'sus2']); // A B E
    expect(sus2.pcs.sort((a, b) => a - b)).toEqual([4, 9, 11]);
    const sus4 = buildChord(MOODS.calm, [4, 'sus4']); // G C D
    expect(sus4.pcs.sort((a, b) => a - b)).toEqual([0, 2, 7]);
  });

  it('voices every chord of every progression inside the pad register with a bass in range', () => {
    for (const id of MOOD_IDS) {
      for (const prog of MOODS[id].progressions) {
        for (const spec of prog) {
          const c = buildChord(MOODS[id], spec);
          expect(c.notes.length).toBeGreaterThanOrEqual(3);
          expect(Math.min(...c.notes)).toBeGreaterThanOrEqual(PAD_LOW);
          expect(Math.min(...c.notes)).toBeLessThan(PAD_LOW + 12);
          expect(Math.max(...c.notes)).toBeLessThanOrEqual(PAD_LOW + 12 + 15);
          expect(c.bass).toBeGreaterThanOrEqual(36);
          expect(c.bass).toBeLessThanOrEqual(47);
          expect(c.bass % 12).toBe(c.notes.find((n) => n % 12 === c.bass % 12)! % 12);
          expect(c.label.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('consonance', () => {
  it('prefers chord tones and penalises semitone clashes', () => {
    const cMajor = [0, 4, 7];
    expect(consonance(60, cMajor)).toBeGreaterThan(consonance(61, cMajor)); // C vs C#
    expect(consonance(64, cMajor)).toBeGreaterThan(consonance(65, cMajor)); // E vs F (clashes with E)
    expect(consonance(67, cMajor)).toBeGreaterThan(0);
  });
});

describe('random helpers', () => {
  it('mulberry32 is deterministic and in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('pickWeighted respects zero weights and handles all-zero', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 200; i++) expect(pickWeighted(r, [0, 0, 5, 0])).toBe(2);
    expect(pickWeighted(r, [0, 0])).toBe(-1);
  });

  it('never repeats the same progression twice in a row', () => {
    const r = mulberry32(99);
    for (const id of MOOD_IDS) {
      let last = -1;
      const seen = new Set<number>();
      for (let i = 0; i < 100; i++) {
        const p = pickProgression(r, MOODS[id], last);
        expect(p).not.toBe(last);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(MOODS[id].progressions.length);
        seen.add(p);
        last = p;
      }
      expect(seen.size).toBe(MOODS[id].progressions.length); // all progressions get used
    }
  });

  it('picks tempo inside the mood range', () => {
    const r = mulberry32(5);
    for (const id of MOOD_IDS) {
      for (let i = 0; i < 20; i++) {
        const bpm = pickBpm(r, MOODS[id]);
        expect(bpm).toBeGreaterThanOrEqual(MOODS[id].bpm[0]);
        expect(bpm).toBeLessThanOrEqual(MOODS[id].bpm[1]);
      }
    }
  });
});

describe('melody generation', () => {
  it('produces valid, well-spaced notes inside the register for every mood', () => {
    const r = mulberry32(2024);
    for (const id of MOOD_IDS) {
      const mood = MOODS[id];
      const { kMin, kMax, kCenter } = ladderRange(mood);
      const chord = buildChord(mood, mood.progressions[0][0]);
      for (let i = 0; i < 60; i++) {
        const motif = generateMotif(r, mood, { density: mood.melody.density, startK: kCenter, chordPcs: chord.pcs });
        expect(motif.length).toBeLessThanOrEqual(7);
        let prevStep = -10;
        for (const n of motif) {
          expect(n.step).toBeGreaterThanOrEqual(0);
          expect(n.step).toBeLessThan(16);
          expect(n.step - prevStep).toBeGreaterThanOrEqual(2); // at least an 8th apart
          expect(n.k).toBeGreaterThanOrEqual(kMin);
          expect(n.k).toBeLessThanOrEqual(kMax);
          expect(n.len).toBeGreaterThanOrEqual(2);
          expect(n.len).toBeLessThanOrEqual(8);
          expect(n.step + 0).toBeLessThan(16);
          expect(n.vel).toBeGreaterThan(0.4);
          expect(n.vel).toBeLessThanOrEqual(1);
          prevStep = n.step;
        }
      }
    }
  });

  it('density controls how busy a bar is; zero density is silent', () => {
    const r = mulberry32(11);
    const mood = MOODS.calm;
    const chord = buildChord(mood, mood.progressions[0][0]);
    const avg = (density: number) => {
      let total = 0;
      for (let i = 0; i < 200; i++) total += generateMotif(r, mood, { density, startK: 6, chordPcs: chord.pcs }).length;
      return total / 200;
    };
    expect(avg(0)).toBe(0);
    expect(avg(0.2)).toBeLessThan(avg(0.55));
    expect(avg(0.55)).toBeLessThan(avg(1));
  });

  it('favours strong beats', () => {
    const r = mulberry32(3);
    const mood = MOODS.warm;
    const chord = buildChord(mood, mood.progressions[0][0]);
    const hits = new Array<number>(16).fill(0);
    for (let i = 0; i < 400; i++) {
      for (const n of generateMotif(r, mood, { density: 0.7, startK: 6, chordPcs: chord.pcs })) hits[n.step]++;
    }
    expect(hits[0]).toBeGreaterThan(hits[1] * 5);
    expect(hits[8]).toBeGreaterThan(hits[3] * 4);
    expect(STEP_WEIGHTS).toHaveLength(16);
  });

  it('mostly lands on or near chord tones (few semitone clashes on strong beats)', () => {
    const r = mulberry32(8);
    const mood = MOODS.calm;
    const chord = buildChord(mood, [0, 'tri']);
    let strong = 0;
    let clashes = 0;
    for (let i = 0; i < 300; i++) {
      for (const n of generateMotif(r, mood, { density: 0.8, startK: 6, chordPcs: chord.pcs })) {
        if (n.step % 4 !== 0) continue;
        strong++;
        if (consonance(ladderNote(mood, n.k), chord.pcs) < 0) clashes++;
      }
    }
    expect(strong).toBeGreaterThan(100);
    expect(clashes / strong).toBeLessThan(0.15);
  });

  it('varyMotif keeps rhythm and stays in range', () => {
    const r = mulberry32(21);
    const mood = MOODS.mystic;
    const { kMin, kMax } = ladderRange(mood);
    const chord = buildChord(mood, mood.progressions[0][0]);
    const base = generateMotif(r, mood, { density: 0.8, startK: 6, chordPcs: chord.pcs });
    for (let i = 0; i < 30; i++) {
      const v = varyMotif(r, mood, base);
      expect(v.map((n) => n.step)).toEqual(base.map((n) => n.step));
      for (const n of v) {
        expect(n.k).toBeGreaterThanOrEqual(kMin);
        expect(n.k).toBeLessThanOrEqual(kMax);
      }
    }
  });
});
