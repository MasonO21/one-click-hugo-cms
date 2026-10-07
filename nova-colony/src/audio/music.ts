/**
 * MusicDirector — relaxing generative ambient score, 100% synthesized.
 *
 * Layers: warm stereo pad, soft bass, marimba / bell / glass / flute melody (pentatonic random walk
 * with motif memory), sparse high sparkles, light shaker, night crickets / marsh bubbles / ridge
 * wind, plus an energetic combat layer (soft drums, bass pulse, faster arps) that crossfades in
 * during invasions.
 *
 * CPU: pitched instruments, drums and shakers are baked once into short samples (see bake.ts /
 * musicSamples.ts) and played as BufferSource -> Gain; only the pad and bass stay live oscillators.
 *
 * Scheduling: a look-ahead scheduler (setInterval ~25 ms + AudioContext.currentTime), never per
 * frame. Musical state is generated bar by bar: chords change every two bars, a progression is
 * picked per 4-chord phrase (never the same twice in a row), melodies are re-generated or varied
 * from the previous bar, and some bars breathe (rest) so the music never loops audibly.
 *
 * Mood (scale / timbre / register / tempo) follows the player's region; night makes it softer and
 * sparser. Mood changes take effect at the next chord boundary so the old pad releases under the
 * new one (a natural crossfade).
 */
import { nearestRef, type SampleBank } from './bake';
import type { AudioEngine } from './engine';
import {
  DRUM_KEYS, REFS, SHAKER_KEY, pitchedKey, sampleJobs, timbreSet, type PitchedSet, type SampleSet,
} from './musicSamples';
import {
  MOODS, buildChord, generateMotif, ladderNote, ladderRange, midiToFreq, pickBpm, pickProgression, varyMotif,
  type Chord, type ChordSpec, type MelodyNote, type MoodDef, type MoodId, type Rand,
} from './theory';

const TICK_MS = 25;
const LOOKAHEAD = 0.3;
const BARS_PER_CHORD = 2;
const STEPS = 16;
const COMBAT_BPM_BOOST = 5;
const COMBAT_TAIL_SECONDS = 6;
/** A new region mood must persist this long before the music follows it. */
const MOOD_SETTLE_SECONDS = 3;

type PhraseKind = 'full' | 'sparse' | 'interlude';

/** Instrument families baked in idle time, after everything the current situation needs. */
const LATER_SETS: readonly SampleSet[] = ['drums', 'pluck', 'thump', 'shaker', 'bell', 'glass', 'flute'];

export interface MusicInfo {
  running: boolean;
  mood: MoodId;
  pendingMood: MoodId | null;
  chord: string;
  bar: number;
  bpm: number;
  night: number;
  combat: boolean;
  phrase: PhraseKind;
}

export class MusicDirector {
  private ctx!: BaseAudioContext;
  private graphBuilt = false;
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  // graph
  private mix!: GainNode;
  private duckG!: GainNode;
  private verbIn!: GainNode;
  private verbOut!: GainNode;
  private echoIn!: GainNode;
  private echoDelay!: DelayNode;
  private padBus!: GainNode;
  private bassBus!: GainNode;
  private melBuses: GainNode[] = [];
  private sparkBuses: GainNode[] = [];
  private shakerBus!: GainNode;
  private combatG!: GainNode;
  private drumBus!: GainNode;
  private arpBus!: GainNode;
  private ambBus!: GainNode;
  private wind: { src: AudioBufferSourceNode; lfo: OscillatorNode; gain: GainNode } | null = null;

  // musical state
  private mood: MoodDef = MOODS.calm;
  private pendingMood: MoodDef | null = null;
  private candidate: MoodId | null = null;
  private candidateT = 0;
  private prog: readonly ChordSpec[] = MOODS.calm.progressions[0];
  private progIdx = -1;
  private chordIdx = Number.POSITIVE_INFINITY;
  private chord: Chord = buildChord(MOODS.calm, MOODS.calm.progressions[0][0]);
  private phrase: PhraseKind = 'full';
  private bpm = 76;
  private targetBpm = 76;
  private step = 0;
  private barCount = 0;
  private nextTime = 0;
  private slots: (MelodyNote | null)[] = new Array<MelodyNote | null>(STEPS).fill(null);
  private lastMotif: MelodyNote[] | null = null;
  private lastK: number | null = null;
  private sparkStep = -1;
  private bubbleStep = -1;
  private nextChirp = 0;

  // dynamics
  private night = 0;
  private nightTarget = 0;
  private combatOn = false;
  private combatTail = 0;
  private enabled = true;
  private failures = 0;

  constructor(
    private readonly engine: AudioEngine,
    private readonly bank: SampleBank,
    private readonly rnd: Rand = Math.random,
  ) {}

  // ----------------------------------------------------------------------------- public API

  /** Begin (or resume) playback. No-op until the audio context is running. */
  start(opts: { manual?: boolean } = {}): void {
    if (this.running || !this.enabled) return;
    if (!this.engine.ctx || !this.engine.running) return;
    this.ctx = this.engine.ctx;
    this.buildGraph();
    this.running = true;
    const now = this.ctx.currentTime;
    this.nextTime = now + 0.2;
    this.step = 0;
    this.barCount = 0; // first bar starts a chord
    this.chordIdx = Number.POSITIVE_INFINITY; // ...and a fresh phrase
    this.nextChirp = now;
    this.mix.gain.cancelScheduledValues(now);
    this.mix.gain.setValueAtTime(this.mix.gain.value, now);
    this.mix.gain.setTargetAtTime(this.mixTarget(), now, 1.4);
    this.requestSamples();
    if (!opts.manual && !this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  /** Fade out and stop scheduling (music volume 0, or context closing). */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.graphBuilt) {
      const now = this.ctx.currentTime;
      this.mix.gain.cancelScheduledValues(now);
      this.mix.gain.setTargetAtTime(0, now, 0.3);
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Enable/disable music (e.g. volume slider at 0): disabled = no scheduling, no CPU. */
  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    if (!on) this.stop();
    else if (this.engine.running) this.start();
  }

  /**
   * Follow the player's region mood. The new mood must persist for a few seconds (debounce at
   * borders) and then takes effect at the next chord boundary.
   */
  requestMood(id: MoodId): void {
    const target = this.pendingMood?.id ?? this.mood.id;
    if (id === target) {
      this.candidate = null;
      return;
    }
    if (id !== this.candidate) {
      this.candidate = id;
      this.candidateT = 0;
    }
  }

  /** Switch mood now (or at the next chord when running and not `immediate`). */
  setMood(id: MoodId, immediate = false): void {
    const def = MOODS[id];
    if (!def) return;
    this.candidate = null;
    if (def === this.mood) {
      this.pendingMood = null;
      return;
    }
    if (immediate || !this.running) {
      this.mood = def;
      this.pendingMood = null;
      this.chordIdx = Number.POSITIVE_INFINITY;
      this.barCount = 0; // the next bar starts a new chord in the new mood
      this.onMoodApplied();
    } else {
      this.pendingMood = def;
    }
  }

  setNight(night: boolean): void {
    const target = night ? 1 : 0;
    if (target === this.nightTarget) return;
    this.nightTarget = target;
    if (this.graphBuilt && this.running) {
      const now = this.ctx.currentTime;
      this.mix.gain.setTargetAtTime(this.mixTarget(), now, 3);
    }
  }

  /** Crossfade the combat layer in (invasion running) or out. */
  setCombat(on: boolean): void {
    if (on === this.combatOn) return;
    this.combatOn = on;
    if (on) this.combatTail = COMBAT_TAIL_SECONDS;
    if (this.graphBuilt) {
      const now = this.ctx.currentTime;
      this.combatG.gain.cancelScheduledValues(now);
      this.combatG.gain.setTargetAtTime(on ? 1 : 0, now, on ? 0.9 : 2);
    }
    this.targetBpm = this.pickPhraseBpm();
    if (on) this.requestSamples();
  }

  /** Briefly lower the music under a fanfare. */
  duck(depth: number, hold: number): void {
    if (!this.graphBuilt || !this.running) return;
    const now = this.ctx.currentTime;
    this.duckG.gain.cancelScheduledValues(now);
    this.duckG.gain.setTargetAtTime(depth, now, 0.05);
    this.duckG.gain.setTargetAtTime(1, now + hold, 0.7);
  }

  /** Per-frame housekeeping: smooth night, debounce mood, count down the combat tail. */
  update(dt: number): void {
    const k = 1 - Math.exp(-dt / 6);
    this.night += (this.nightTarget - this.night) * k;
    if (this.candidate) {
      this.candidateT += dt;
      if (this.candidateT >= MOOD_SETTLE_SECONDS) this.setMood(this.candidate);
    }
    if (!this.combatOn && this.combatTail > 0) this.combatTail -= dt;
  }

  info(): MusicInfo {
    return {
      running: this.running,
      mood: this.mood.id,
      pendingMood: this.pendingMood?.id ?? null,
      chord: this.chord.label,
      bar: this.barCount,
      bpm: Math.round(this.bpm),
      night: Math.round(this.night * 100) / 100,
      combat: this.combatOn,
      phrase: this.phrase,
    };
  }

  dispose(): void {
    this.stop();
    if (this.graphBuilt) this.mix.disconnect();
    this.graphBuilt = false;
  }

  /**
   * Schedule everything due within `lookahead` seconds. Called by the internal timer; tests and
   * offline renders call it with a long lookahead to pre-render music.
   */
  tick(lookahead = LOOKAHEAD): void {
    if (!this.running || !this.engine.running) return;
    try {
      this.schedule(lookahead);
      this.failures = 0;
    } catch (e) {
      console.error('[audio] music scheduler error', e);
      if (++this.failures >= 3) {
        console.error('[audio] music disabled after repeated errors');
        this.stop();
      }
    }
  }

  private schedule(lookahead: number): void {
    const now = this.ctx.currentTime;
    if (this.nextTime < now - 0.4) this.nextTime = now + 0.05; // woke from a throttled / suspended tab
    const horizon = now + lookahead;
    while (this.nextTime < horizon) {
      this.scheduleStep(this.nextTime, now);
      this.step++;
      if (this.step >= STEPS) this.step = 0;
      this.nextTime += this.stepDur();
    }
    this.scheduleAmbience(now, horizon);
  }

  // ------------------------------------------------------------------------------- graph

  private mixTarget(): number {
    return 1 - 0.18 * this.nightTarget;
  }

  private bus(level: number, wet: number, echo: number, pan = 0): GainNode {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = level;
    let out: AudioNode = g;
    if (pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      out = p;
    }
    out.connect(this.mix);
    if (wet > 0) {
      const w = ctx.createGain();
      w.gain.value = wet;
      g.connect(w);
      w.connect(this.verbIn);
    }
    if (echo > 0) {
      const e = ctx.createGain();
      e.gain.value = echo;
      g.connect(e);
      e.connect(this.echoIn);
    }
    return g;
  }

  private buildGraph(): void {
    if (this.graphBuilt) return;
    const ctx = this.ctx;
    this.mix = ctx.createGain();
    this.mix.gain.value = 0;
    this.duckG = ctx.createGain();
    this.mix.connect(this.duckG);
    this.duckG.connect(this.engine.musicBus);

    // long, dark hall
    this.verbIn = ctx.createGain();
    const verb = this.engine.createReverb(2.4, 2.6, 0.62);
    this.verbOut = ctx.createGain();
    this.verbOut.gain.value = 0.9 * this.mood.wet * 2;
    this.verbIn.connect(verb);
    verb.connect(this.verbOut);
    this.verbOut.connect(this.mix);

    // dotted-eighth echo with a lowpassed feedback loop
    this.echoIn = ctx.createGain();
    this.echoDelay = ctx.createDelay(1.5);
    this.echoDelay.delayTime.value = this.dottedEighth();
    const fb = ctx.createGain();
    fb.gain.value = 0.34;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.55;
    this.echoIn.connect(this.echoDelay);
    this.echoDelay.connect(lp);
    lp.connect(fb);
    fb.connect(this.echoDelay);
    lp.connect(echoOut);
    echoOut.connect(this.mix);
    const echoVerb = ctx.createGain();
    echoVerb.gain.value = 0.3;
    echoOut.connect(echoVerb);
    echoVerb.connect(this.verbIn);

    this.padBus = this.bus(0.55, 0.5, 0);
    this.bassBus = this.bus(0.8, 0.05, 0);
    this.melBuses = [this.bus(0.8, 0.45, 0.5, -0.4), this.bus(0.8, 0.45, 0.5, 0), this.bus(0.8, 0.45, 0.5, 0.4)];
    this.sparkBuses = [this.bus(0.55, 0.7, 0.6, -0.5), this.bus(0.55, 0.7, 0.6, 0.5)];
    this.shakerBus = this.bus(0.5, 0.1, 0);
    this.ambBus = this.bus(0.6, 0.3, 0);

    // combat layer sits behind its own fade gain
    this.combatG = ctx.createGain();
    this.combatG.gain.value = this.combatOn ? 1 : 0;
    this.combatG.connect(this.mix);
    this.drumBus = ctx.createGain();
    this.drumBus.gain.value = 0.8;
    this.drumBus.connect(this.combatG);
    this.arpBus = ctx.createGain();
    this.arpBus.gain.value = 0.7;
    this.arpBus.connect(this.combatG);
    const arpWet = ctx.createGain();
    arpWet.gain.value = 0.3;
    this.arpBus.connect(arpWet);
    arpWet.connect(this.verbIn);
    const arpEcho = ctx.createGain();
    arpEcho.gain.value = 0.25;
    this.arpBus.connect(arpEcho);
    arpEcho.connect(this.echoIn);

    this.graphBuilt = true;
    this.onMoodApplied();
  }

  /** Apply per-mood mix settings (reverb amount, wind bed). */
  private onMoodApplied(): void {
    this.lastK = null;
    this.lastMotif = null;
    this.targetBpm = this.pickPhraseBpm();
    if (!this.running) this.bpm = this.targetBpm;
    if (!this.graphBuilt) return;
    const now = this.ctx.currentTime;
    this.verbOut.gain.setTargetAtTime(0.9 * this.mood.wet * 2, now, 1.5);
    this.setWind(this.mood.ambience === 'wind');
    this.requestSamples();
  }

  /** Soft wind bed for cold regions: built only while needed (a looping noise + filter is not free). */
  private setWind(on: boolean): void {
    const now = this.ctx.currentTime;
    if (on && !this.wind) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.engine.noise.white;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 520;
      bp.Q.value = 0.6;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.11;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      src.connect(bp);
      bp.connect(gain);
      gain.connect(this.ambBus);
      src.start();
      lfo.start();
      this.wind = { src, lfo, gain };
    }
    const w = this.wind;
    if (!w) return;
    w.gain.gain.cancelScheduledValues(now);
    w.gain.gain.setTargetAtTime(on ? 0.07 : 0, now, 2.5);
    if (!on) {
      // fade out, then free the nodes
      const stopAt = now + 9;
      w.src.stop(stopAt);
      w.lfo.stop(stopAt);
      this.wind = null;
    }
  }

  /**
   * Ask the sample bank for the instruments the current mood / state needs now (front of the queue),
   * and queue every other instrument family behind everything else so later mood changes and the
   * first invasion start with their instruments ready. Idempotent.
   */
  private requestSamples(): void {
    const now: SampleSet[] = [timbreSet(this.mood.melody.timbre), 'spark'];
    if (this.mood.shaker > 0) now.push('shaker');
    if (this.combatOn || this.combatTail > 0) now.push('drums', 'pluck', 'thump');
    for (const s of now) this.bank.enqueue(sampleJobs(s), true);
    for (const s of LATER_SETS) this.bank.enqueue(sampleJobs(s));
  }

  /**
   * Play a baked pitched note: nearest reference sample transposed by playbackRate. `dur` shortens
   * the note with a short fade; returns false while the sample is still baking (the note is skipped).
   */
  private playNote(dest: AudioNode, set: PitchedSet, midi: number, t: number, gain: number, dur = 0): boolean {
    const { ref, rate } = nearestRef(REFS[set], midi);
    const buf = this.bank.pick(pitchedKey(set, ref), this.rnd);
    return buf ? this.playBuffer(dest, buf, rate, t, gain, dur) : false;
  }

  private playBuffer(dest: AudioNode, buf: AudioBuffer, rate: number, t: number, gain: number, dur = 0): boolean {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (rate !== 1) src.playbackRate.value = rate;
    const g = ctx.createGain();
    const natural = buf.duration / rate;
    if (dur > 0 && dur < natural - 0.05) {
      g.gain.setValueAtTime(gain, t);
      g.gain.setValueAtTime(gain, t + Math.max(0, dur - 0.18));
      g.gain.linearRampToValueAtTime(0, t + dur);
      src.start(t);
      src.stop(t + dur + 0.02);
    } else {
      g.gain.value = gain;
      src.start(t);
    }
    src.connect(g);
    g.connect(dest);
    return true;
  }

  // ------------------------------------------------------------------------------ timing

  private pickPhraseBpm(): number {
    return pickBpm(this.rnd, this.mood) + (this.combatOn ? COMBAT_BPM_BOOST : 0) - this.night * 4;
  }

  private stepDur(): number {
    return 60 / this.bpm / 4;
  }

  private dottedEighth(): number {
    return (60 / this.bpm) * 0.75;
  }

  // -------------------------------------------------------------------------- scheduling

  private scheduleStep(time: number, now: number): void {
    const s = this.step;
    if (s === 0) this.startBar(time);

    const note = this.slots[s];
    if (note) this.playMelody(note, time, now);
    if (s === this.sparkStep) this.playSparkle(time);
    if (s === this.bubbleStep) this.playBubble(time);
    this.playShaker(s, time);
    this.playBass(s, time);
    if (this.combatOn || this.combatTail > 0) this.combatStep(s, time);
  }

  private startBar(time: number): void {
    // ease tempo toward the phrase target (also keeps the echo in time)
    this.bpm += (this.targetBpm - this.bpm) * 0.5;
    this.echoDelay.delayTime.setTargetAtTime(this.dottedEighth(), time, 0.5);

    if (this.barCount % BARS_PER_CHORD === 0) this.startChord(time);
    this.barCount++;
    this.prepareBar();
  }

  private startChord(time: number): void {
    if (this.pendingMood) {
      this.mood = this.pendingMood;
      this.pendingMood = null;
      this.chordIdx = Number.POSITIVE_INFINITY;
      this.onMoodApplied();
    }
    if (this.chordIdx >= this.prog.length) {
      this.chordIdx = 0;
      this.startPhrase();
    }
    this.chord = buildChord(this.mood, this.prog[this.chordIdx++]);
    this.playPad(time, BARS_PER_CHORD * STEPS * this.stepDur());
  }

  private startPhrase(): void {
    this.progIdx = pickProgression(this.rnd, this.mood, this.progIdx);
    this.prog = this.mood.progressions[this.progIdx];
    this.targetBpm = this.pickPhraseBpm();
    const r = this.rnd();
    this.phrase = r < 0.7 ? 'full' : r < 0.9 ? 'sparse' : 'interlude';
  }

  /** Pick this bar's melody, sparkle and bubble positions. */
  private prepareBar(): void {
    const mood = this.mood;
    this.slots.fill(null);
    this.sparkStep = -1;
    this.bubbleStep = -1;

    const breathe = 0.15 + 0.2 * this.night;
    const silent = this.phrase === 'interlude' || this.rnd() < breathe;
    if (!silent) {
      const density =
        mood.melody.density * (this.phrase === 'sparse' ? 0.5 : 1) * (1 - 0.5 * this.night) * (this.combatOn ? 1.2 : 1);
      let motif: MelodyNote[];
      if (this.lastMotif && this.lastMotif.length > 0 && this.rnd() < 0.45) {
        motif = varyMotif(this.rnd, mood, this.lastMotif);
      } else {
        const { kCenter } = ladderRange(mood);
        motif = generateMotif(this.rnd, mood, {
          density,
          startK: this.lastK ?? kCenter - (this.night > 0.5 ? 2 : 0),
          chordPcs: this.chord.pcs,
        });
      }
      if (motif.length > 0) {
        this.lastMotif = motif;
        this.lastK = motif[motif.length - 1].k;
      }
      for (const n of motif) this.slots[n.step] = n;
    }

    const sparkP = mood.sparkle * (this.phrase === 'interlude' ? 2 : 1) * (1 - 0.3 * this.night) * (this.combatOn ? 0.3 : 1);
    if (this.rnd() < sparkP) this.sparkStep = [2, 6, 10, 14, 3, 11][Math.floor(this.rnd() * 6)];
    if (mood.ambience === 'bubbles' && this.rnd() < 0.55) this.bubbleStep = Math.floor(this.rnd() * 16);
  }

  // ------------------------------------------------------------------------------ layers

  /** Stereo supersaw-lite pad: two detuned groups, per-chord lowpass, long overlapping envelopes. */
  private playPad(time: number, dur: number): void {
    const ctx = this.ctx;
    const mood = this.mood;
    const wave = mood.pad.wave;
    const attack = wave === 'brass' ? 1.1 : 1.6;
    const release = 2.4;
    const peak = 0.05 * mood.pad.level * (1 - 0.15 * this.night);
    const cutoff = mood.pad.cutoff * (1 - 0.35 * this.night) * (this.combatOn ? 1.25 : 1) * (0.9 + 0.2 * this.rnd());
    const end = time + dur + release;

    for (const side of [-1, 1]) {
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(peak, time + attack);
      env.gain.setValueAtTime(peak, time + dur);
      env.gain.linearRampToValueAtTime(0, end);
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.Q.value = 0.5;
      if (wave === 'brass') {
        filt.frequency.setValueAtTime(cutoff * 0.45, time);
        filt.frequency.linearRampToValueAtTime(cutoff, time + attack * 1.2);
      } else {
        filt.frequency.setValueAtTime(cutoff, time);
      }
      const pan = ctx.createStereoPanner();
      pan.pan.value = side * 0.5;
      filt.connect(env);
      env.connect(pan);
      pan.connect(this.padBus);

      for (const midi of this.chord.notes) {
        const osc = ctx.createOscillator();
        if (wave === 'hollow') osc.setPeriodicWave(this.engine.waves.hollow);
        else if (wave === 'glass') osc.type = side < 0 ? 'sine' : 'triangle';
        else osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(midiToFreq(midi), time);
        osc.detune.value = side * 6 + (this.rnd() - 0.5) * 4;
        osc.connect(filt);
        osc.start(time);
        osc.stop(end + 0.1);
      }
    }
  }

  private playBass(s: number, time: number): void {
    const mood = this.mood;
    let midi = -1;
    let vel = 1;
    if (s === 0) midi = this.chord.bass;
    else if (s === 10 && this.night < 0.5 && this.rnd() < 0.5) {
      midi = this.chord.bass + (this.rnd() < 0.5 ? 7 : 12);
      vel = 0.6;
    }
    if (midi < 0) return;
    const g = mood.bass * vel * (1 - 0.2 * this.night);
    const f = midiToFreq(midi);
    const synth = this.engine.synth;
    // two plain oscillators (no filter nodes): a sine root plus a triangle octave that stays audible on phones
    synth.tone(this.bassBus, { f, t: time, a: 0.015, d: s === 0 ? 1.8 : 1.0, g: 0.5 * g });
    synth.tone(this.bassBus, { f: f * 2, t: time, a: 0.01, d: 0.6, g: 0.1 * g, type: 'triangle' });
  }

  private playMelody(n: MelodyNote, time: number, now: number): void {
    const mood = this.mood;
    const midi = ladderNote(mood, n.k);
    const len = n.len * this.stepDur();
    const vel = n.vel * (1 - 0.25 * this.night);
    const t = Math.max(time + (this.rnd() - 0.5) * 0.014, now + 0.002); // tiny human timing wobble
    const bus = this.melBuses[this.rnd() < 0.5 ? 1 : this.rnd() < 0.5 ? 0 : 2];
    switch (mood.melody.timbre) {
      case 'marimba':
        this.playNote(bus, 'pluck', midi, t, 0.26 * vel * (1 - 0.15 * this.night), Math.min(1.8, 0.55 + len * 1.1));
        break;
      case 'bell':
        this.playNote(bus, 'bell', midi, t, 0.13 * vel, 1.3 + len);
        break;
      case 'glass':
        this.playNote(bus, 'glass', midi, t, 0.215 * vel);
        break;
      case 'flute':
        this.playNote(bus, 'flute', midi, t, 0.145 * vel);
        break;
    }
  }

  private playSparkle(time: number): void {
    const { kMax } = ladderRange(this.mood);
    const k = Math.min(kMax, (this.lastK ?? 0) + 5 + Math.floor(this.rnd() * 3));
    const midi = Math.max(ladderNote(this.mood, k), 76);
    this.playNote(this.sparkBuses[this.rnd() < 0.5 ? 0 : 1], 'spark', midi, time, 0.06 * (1 - 0.3 * this.night));
  }

  private playBubble(time: number): void {
    const f = 300 + this.rnd() * 500;
    this.engine.synth.tone(this.ambBus, { f, f2: f * 1.8, glide: 0.07, t: time, d: 0.14, a: 0.004, g: 0.05 });
  }

  private playShaker(s: number, time: number): void {
    const level = this.mood.shaker * (1 - this.night);
    if (level < 0.02) return;
    const accent = s === 6 || s === 14;
    let g = 0;
    if (s === 2 || s === 10) g = 0.05;
    else if (accent) g = 0.07;
    else if ((s === 12 || s === 15) && this.rnd() < 0.3) g = 0.025;
    if (g === 0) return;
    const buf = this.bank.pick(SHAKER_KEY, this.rnd);
    if (buf) this.playBuffer(this.shakerBus, buf, 0.95 + this.rnd() * 0.1, time + this.rnd() * 0.008, g * level * (0.8 + 0.4 * this.rnd()));
  }

  /** Energetic layer: soft kick / clap / hats, 8th-note arps, pulsing bass (epic adds timpani). */
  private combatStep(s: number, time: number): void {
    const bank = this.bank;
    const drums = this.drumBus;
    const hit = (key: string, gain: number): void => {
      const buf = bank.pick(key, this.rnd);
      if (buf) this.playBuffer(drums, buf, 1, time, gain);
    };

    if (s === 0 || s === 8 || (s === 10 && this.rnd() < 0.35)) hit(DRUM_KEYS.kick, 0.75);
    if (s === 4 || s === 12) hit(DRUM_KEYS.clap, 0.25);
    if (s % 2 === 0) hit(DRUM_KEYS.hat, s % 4 === 2 ? 0.075 : 0.045);
    if (this.mood.id === 'epic' && s === 0) hit(DRUM_KEYS.timp, 0.56);

    // 8th-note arpeggio over the chord tones
    if (s % 2 === 0) {
      const tones = this.chord.notes;
      const idx = [0, 1, 2, 3, 2, 1, 2, 1][(s / 2) % 8] % tones.length;
      const midi = Math.min(tones[idx] + 12 + (s % 8 === 6 ? 12 : 0), 93);
      this.playNote(this.arpBus, 'pluck', midi, time, s % 4 === 0 ? 0.16 : 0.11, 0.3);
    }

    // syncopated bass pulse
    if (s === 0 || s === 3 || s === 6 || s === 8 || s === 11 || s === 14) {
      this.playNote(drums, 'thump', this.chord.bass + 12, time, s === 0 ? 0.3 : 0.2);
    }
  }

  /** Time-based (not grid-locked) ambience: night crickets. */
  private scheduleAmbience(now: number, horizon: number): void {
    if (this.mood.ambience !== 'crickets' || this.night < 0.3) return;
    if (this.nextChirp < now) this.nextChirp = now + this.rnd() * 0.6;
    while (this.nextChirp < horizon) {
      this.chirp(this.nextChirp);
      this.nextChirp += 0.9 + this.rnd() * 1.8;
    }
  }

  /** A soft cricket trill: one oscillator gated into 3-5 short pulses. */
  private chirp(t0: number): void {
    const ctx = this.ctx;
    const pulses = 3 + Math.floor(this.rnd() * 3);
    const gap = 0.075;
    const peak = 0.02 * this.night;
    const osc = ctx.createOscillator();
    osc.frequency.value = 4300 + this.rnd() * 800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    for (let i = 0; i < pulses; i++) {
      const ti = t0 + i * gap;
      g.gain.setValueAtTime(0, ti);
      g.gain.linearRampToValueAtTime(peak, ti + 0.012);
      g.gain.linearRampToValueAtTime(0, ti + 0.036);
    }
    const pan = ctx.createStereoPanner();
    pan.pan.value = (this.rnd() - 0.5) * 1.4;
    osc.connect(g);
    g.connect(pan);
    pan.connect(this.ambBus);
    osc.start(t0);
    osc.stop(t0 + pulses * gap + 0.05);
  }
}
