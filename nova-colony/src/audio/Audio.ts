/**
 * AudioManager — procedural WebAudio SFX and adaptive ambient music (no audio files needed).
 *
 * - Listens to `game.bus`: the generic `sfx` event plus ~50 gameplay events (see mapping.ts), so most
 *   systems never need to emit `sfx` themselves. Same-id sounds inside ~50 ms are collapsed, so an
 *   event and an explicit `sfx` for the same moment play once.
 * - Unlocks itself on the first pointerdown / touchend / keydown (iOS), suspends while the page is
 *   hidden, and re-reads `settings.music` / `settings.sfx` continuously.
 * - Music follows the player's region mood (`BiomeDef.mood`), the day/night cycle and the combat
 *   phase.
 * - CPU-light: each sound is rendered once from its procedural recipe into a small sample in the
 *   background (OfflineAudioContext, see bake.ts); a hit is then just BufferSource -> Gain. Until a
 *   sound is baked (or if the browser cannot render offline) the live recipe plays instead.
 * - Voice cap (24, priority-aware stealing), per-group rate limits and jingle arbitration keep big
 *   battles pleasant.
 * - Public: `play(id, { x, z, volume, pitch })` for direct use, e.g. `audio.play('ui_click')`.
 *
 * Wiring (src/main.ts): `const audio = new AudioManager(game); audio.init();` then `audio.update(dt)`
 * every frame — already in place.
 *
 * OWNER: audio agent.
 */
import type { EventBus, GameEvents } from '../core/events';
import { SampleBank, RATE_JITTER, SampleVoice, bakeOrder, sfxJobs, sfxKey } from './bake';
import { AudioEngine } from './engine';
import { resolveSoundId, type SoundId } from './ids';
import { MAPPED_EVENTS, soundForEvent } from './mapping';
import { MusicDirector, type MusicInfo } from './music';
import { SoundGate, StingerArbiter, VoicePool, policyFor, spatialize } from './policy';
import { RECIPES } from './sfx';
import { Voice } from './synth';
import { moodFor, type MoodId } from './theory';

/** Maximum simultaneous one-shot voices; the oldest low-priority voice is stolen beyond this. */
export const MAX_VOICES = 24;

/** A 0..1 volume setting, falling back to `fallback` when missing / not a number (old saves). */
function level(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** The slice of `Game` the audio layer reads (lets the dev board run without a full Game). */
export interface AudioHost {
  readonly bus: EventBus;
  readonly state: {
    readonly settings: { readonly music: number; readonly sfx: number };
    readonly combat: { readonly phase: string };
    readonly player: { readonly x: number; readonly z: number };
    readonly playTime: number;
  };
  readonly sys: { readonly world: { regionAt(x: number, z: number): string } };
  readonly data: { biome(id: string): { readonly mood: string } | undefined };
  readonly view?: { readonly camera: { readonly mode: string; readonly yaw: number; readonly tx: number; readonly tz: number } };
  isNight(): boolean;
}

export interface PlayOptions {
  /** World position of the source (stereo pan + distance attenuation relative to the camera focus). */
  x?: number;
  z?: number;
  /** Linear volume multiplier (default 1). */
  volume?: number;
  /** Playback-rate multiplier (default 1). */
  pitch?: number;
}

export interface AudioManagerOptions {
  engine?: AudioEngine;
  /** Random source for sound variation and music (default Math.random; never the game's seeded rng). */
  rnd?: () => number;
  /** Monotonic millisecond clock (tests). */
  now?: () => number;
  /** Attach DOM unlock / visibility listeners (default true when a document exists). */
  attachDom?: boolean;
  /** Pause between background bake jobs in ms (default 30; tests use 0). */
  bakeGapMs?: number;
  /** Bake sounds into samples in the background (default true); false = always play live recipes. */
  bake?: boolean;
}

/** Dev / debug overrides (used by the sound board). `null` = follow the game. */
export interface AudioOverrides {
  mood: MoodId | null;
  night: boolean | null;
  combat: boolean | null;
}

export class AudioManager {
  readonly engine: AudioEngine;
  readonly bank: SampleBank;
  readonly music: MusicDirector;
  readonly overrides: AudioOverrides = { mood: null, night: null, combat: null };

  private readonly gate = new SoundGate();
  private readonly pool = new VoicePool<Voice | SampleVoice>(MAX_VOICES);
  private readonly arbiter = new StingerArbiter();
  private readonly rnd: () => number;
  private readonly clock: () => number;
  private readonly offs: (() => void)[] = [];
  private deferredOpts: PlayOptions = {};
  private bakeRequested = false;
  private inited = false;
  private disposed = false;
  private ready: boolean;
  private elapsed = 0;
  private slowAcc = 0;

  constructor(private readonly game: AudioHost, private readonly opts: AudioManagerOptions = {}) {
    this.rnd = opts.rnd ?? Math.random;
    this.clock = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.engine = opts.engine ?? new AudioEngine({ rnd: this.rnd });
    this.bank = new SampleBank(this.engine, { gapMs: opts.bakeGapMs });
    this.music = new MusicDirector(this.engine, this.bank, this.rnd);
    this.ready = game.state.playTime > 0;
  }

  /** Subscribe to the bus and hook the browser unlock / visibility events. */
  init(): void {
    if (this.inited) return;
    this.inited = true;
    const bus = this.game.bus;

    this.offs.push(bus.on('sfx', (e) => void this.play(e.id, e)));
    this.offs.push(bus.on('game:ready', () => (this.ready = true)));
    const subscribe = <K extends keyof GameEvents>(type: K): void => {
      this.offs.push(bus.on(type, (p) => this.onGameEvent(type, p)));
    };
    for (const type of MAPPED_EVENTS) subscribe(type);

    this.offs.push(this.engine.onRunning(() => this.onRunning()));
    const attach = this.opts.attachDom ?? typeof document !== 'undefined';
    if (attach) this.engine.attachDom();
  }

  /** Try to start audio now. Browsers need this inside a user gesture (auto-wired in init()). */
  unlock(): void {
    this.engine.unlock();
  }

  /**
   * Play a sound by id. Returns true when a voice started (or was queued behind a bigger jingle),
   * false when it was dropped (unknown id, locked context, throttled, out of earshot...).
   */
  play(id: string, opts: PlayOptions = {}): boolean {
    if (this.disposed) return false;
    const sid = resolveSoundId(id);
    if (!sid || !this.engine.running) return false;
    try {
      const s = this.game.state.settings;
      const sfx = level(s.sfx, 0.8);
      if (sfx <= 0.001) return false;
      this.engine.setVolumes(level(s.music, 0.6), sfx); // no-op unless changed; covers the very first sound

      const nowMs = this.clock();
      const pol = policyFor(sid);
      if (pol.stinger !== undefined) {
        const verdict = this.arbiter.request(sid, pol.stinger, nowMs);
        if (verdict === 'drop') return false;
        if (verdict === 'defer') {
          this.deferredOpts = opts;
          return true;
        }
      }
      return this.trigger(sid, opts, nowMs);
    } catch (e) {
      this.reportOnce(e);
      return false;
    }
  }

  /** Per-frame: flush deferred jingles, drive music dynamics, poll settings at 4 Hz. */
  update(dt: number): void {
    if (this.disposed) return;
    try {
      this.elapsed += dt;
      // If game:ready was missed (audio created late), stop ignoring events after a short grace.
      if (!this.ready && (this.game.state.playTime > 0.5 || this.elapsed > 2)) this.ready = true;

      const due = this.arbiter.flush(this.clock());
      if (due) this.trigger(due.id as SoundId, this.deferredOpts, this.clock());

      this.music.update(dt);
      this.slowAcc += dt;
      if (this.slowAcc >= 0.25) {
        this.slowAcc = 0;
        this.slowTick();
      }
    } catch (e) {
      this.reportOnce(e); // audio must never break the game loop
    }
  }

  /** Dev: force mood / night / combat (null = follow the game). */
  setOverrides(o: Partial<AudioOverrides>): void {
    Object.assign(this.overrides, o);
    if (this.engine.running) this.syncMusic(false);
  }

  /** Dev: snapshot for the sound board. */
  debug(): { engine: string; voices: number; baked: number; bakePending: number; music: MusicInfo } {
    return {
      engine: this.engine.unsupported ? 'unsupported' : this.engine.ctx ? this.engine.ctx.state : 'locked',
      voices: this.pool.size,
      baked: this.bank.size,
      bakePending: this.bank.pending,
      music: this.music.info(),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.pool.clear();
    this.music.dispose();
    this.bank.dispose();
    this.engine.dispose();
  }

  // ------------------------------------------------------------------------------ internals

  private onGameEvent<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    if (!this.ready) return;
    const req = soundForEvent(type, payload);
    if (req) this.play(req.id, req);
  }

  /** Context just started (or resumed): apply volumes and (re)start the music in the right mood. */
  private onRunning(): void {
    try {
      const s = this.game.state.settings;
      this.engine.setVolumes(level(s.music, 0.6), level(s.sfx, 0.8));
      this.ensureBaking();
      this.syncMusic(true);
    } catch (e) {
      this.reportOnce(e);
    }
  }

  private slowTick(): void {
    const s = this.game.state.settings;
    this.engine.setVolumes(level(s.music, 0.6), level(s.sfx, 0.8));
    this.pool.prune(this.engine.now);
    if (this.engine.running) {
      this.ensureBaking();
      this.syncMusic(false);
    }
  }

  /** Once audio runs, start rendering every sound into a cheap sample in the background. */
  private ensureBaking(): void {
    if (this.bakeRequested || this.opts.bake === false) return;
    this.bakeRequested = true;
    this.bank.enqueue(sfxJobs(bakeOrder()));
  }

  private reported = false;
  private reportOnce(e: unknown): void {
    if (this.reported) return;
    this.reported = true;
    console.error('[audio] error (further errors suppressed)', e);
  }

  /** Push mood / night / combat / enabled state into the music director. */
  private syncMusic(initial: boolean): void {
    const music = this.music;
    const o = this.overrides;
    music.setNight(o.night ?? this.game.isNight());
    music.setCombat(o.combat ?? this.game.state.combat.phase === 'attack');
    if (o.mood) music.setMood(o.mood, initial);
    else if (initial) music.setMood(this.regionMood(), true);
    else music.requestMood(this.regionMood());
    music.setEnabled(level(this.game.state.settings.music, 0.6) > 0.002);
    if (!music.isRunning) music.start();
  }

  private regionMood(): MoodId {
    const p = this.game.state.player;
    const region = this.game.sys.world.regionAt(p.x, p.z);
    return moodFor(this.game.data.biome(region)?.mood).id;
  }

  /** Distance attenuation + pan relative to the camera focus (the player in follow mode). */
  private spatial(x: number, z: number): { gain: number; pan: number } {
    const cam = this.game.view?.camera;
    let lx = this.game.state.player.x;
    let lz = this.game.state.player.z;
    let rx = 1;
    let rz = 0;
    if (cam) {
      if (cam.mode === 'overview') {
        lx = cam.tx;
        lz = cam.tz;
      }
      rx = Math.cos(cam.yaw);
      rz = -Math.sin(cam.yaw);
    }
    return spatialize(x - lx, z - lz, rx, rz);
  }

  private trigger(id: SoundId, o: PlayOptions, nowMs: number): boolean {
    const eng = this.engine;
    const ctx = eng.ctx;
    if (!ctx) return false;

    let gain = o.volume ?? 1;
    let pan = 0;
    if (o.x !== undefined && o.z !== undefined) {
      const sp = this.spatial(o.x, o.z);
      gain *= sp.gain;
      pan = Math.abs(sp.pan) < 0.12 ? 0 : sp.pan; // a panner node costs; near-centre sounds skip it
    }
    if (gain < 0.02) return false; // out of earshot: don't spend rate budget or a voice

    if (!this.gate.tryPlay(id, nowMs)) return false;
    const pol = policyFor(id);
    const now = ctx.currentTime;
    if (!this.pool.admit(pol.priority, now)) return false;

    const t = now + 0.004;
    const pitch = Math.max(0.25, Math.min(4, o.pitch ?? 1));
    const baked = this.bank.pick(sfxKey(id), this.rnd);
    let voice: Voice | SampleVoice;
    if (baked) {
      // cheap path: one pre-rendered sample (BufferSource -> Gain), pitch via playbackRate
      const jitter = RATE_JITTER[id] ?? 0;
      const rate = pitch * (1 + (this.rnd() * 2 - 1) * jitter);
      voice = new SampleVoice(ctx, eng.sfxBus, id, pol.priority, t, baked, rate, gain, pan);
    } else {
      // not baked yet (first seconds after unlock, or no offline rendering): build the recipe live
      const live = new Voice(eng.synth, eng.sfxBus, () => eng.sfxReverbIn, id, pol.priority, t, gain, pan);
      try {
        RECIPES[id]({ v: live, t, p: pitch, r: this.rnd });
      } catch (e) {
        console.error(`[audio] recipe ${id} failed`, e);
        live.stop();
        live.dispose();
        return false;
      }
      voice = live;
    }
    this.pool.add(voice);

    const rank = pol.stinger ?? 0;
    if (rank >= 3) this.music.duck(rank >= 4 ? 0.45 : 0.7, rank >= 5 ? 3 : rank >= 4 ? 2.2 : 1.2);
    return true;
  }
}
