/**
 * Headless engine tests: every SFX recipe, the sample bank, the music scheduler and the manager run
 * against a fake AudioContext that enforces WebAudio's throwing rules (non-finite values, exponential
 * ramps to <= 0, stop-before-start...).
 */
import { describe, expect, it, vi } from 'vitest';
import { AudioManager, MAX_VOICES, type AudioHost } from '../src/audio/Audio';
import { BAKE_DURATION, SampleBank, sfxKey } from '../src/audio/bake';
import { AudioEngine } from '../src/audio/engine';
import { SOUND_IDS } from '../src/audio/ids';
import { MusicDirector } from '../src/audio/music';
import { RECIPES } from '../src/audio/sfx';
import { Voice } from '../src/audio/synth';
import { MOOD_IDS, mulberry32 } from '../src/audio/theory';
import { FakeContext, FakeOffline } from '../src/audio/dev/fakeContext';
import { EventBus } from '../src/core/events';

function makeEngine(seed = 1): { ctx: FakeContext; engine: AudioEngine } {
  const ctx = new FakeContext();
  const engine = new AudioEngine({
    context: ctx.asReal(),
    alwaysRunning: true,
    rnd: mulberry32(seed),
    offlineFactory: (ch, len, sr) => new FakeOffline(ch, len, sr).asOffline(),
  });
  engine.setVolumes(1, 1);
  return { ctx, engine };
}

function makeMusic(engine: AudioEngine, seed = 77): { bank: SampleBank; music: MusicDirector } {
  const bank = new SampleBank(engine, { gapMs: 0 });
  return { bank, music: new MusicDirector(engine, bank, mulberry32(seed)) };
}

describe('SFX recipes', () => {
  it('has a recipe for every sound id', () => {
    for (const id of SOUND_IDS) expect(typeof RECIPES[id], id).toBe('function');
    expect(Object.keys(RECIPES).length).toBe(SOUND_IDS.length);
  });

  for (const id of SOUND_IDS) {
    it(`${id}: builds a bounded, valid graph at default and extreme pitch`, () => {
      for (const pitch of [1, 0.5, 2]) {
        const { ctx, engine } = makeEngine(3);
        const before = ctx.nodeCount;
        const t = 0.5;
        const v = new Voice(engine.synth, engine.sfxBus, () => engine.sfxReverbIn, id, 1, t, 1, 0.3);
        RECIPES[id]({ v, t, p: pitch, r: mulberry32(9) });
        const nodes = ctx.nodeCount - before;
        expect(nodes, 'node count').toBeGreaterThan(1);
        // short one-shots stay small; the three big (rare) fanfares get a little more room
        expect(nodes, 'node count').toBeLessThanOrEqual(['tier_up', 'victory', 'spin_win'].includes(id) ? 125 : 100);
        expect(v.end - t, 'duration').toBeGreaterThan(0.03);
        expect(v.end - t, 'duration').toBeLessThan(4.5);
        expect(ctx.leakedSources().length, 'sources must be stopped').toBe(0);
        v.dispose();
      }
    });
  }

  it('fits inside its bake duration for every seed, so baked samples are never cut short', () => {
    for (const id of SOUND_IDS) {
      for (let seed = 1; seed <= 8; seed++) {
        for (const pitch of [1, 2]) {
          const { engine } = makeEngine(seed);
          const v = new Voice(engine.synth, engine.sfxBus, () => engine.sfxReverbIn, id, 1, 0.002, 1, 0);
          RECIPES[id]({ v, t: 0.002, p: pitch, r: mulberry32(seed) });
          expect(v.end, `${id} seed ${seed} pitch ${pitch}`).toBeLessThanOrEqual(BAKE_DURATION[id]);
        }
      }
    }
  });

  it('dry sounds never build the reverb; wet ones build it lazily', () => {
    const { ctx, engine } = makeEngine();
    const dry = new Voice(engine.synth, engine.sfxBus, () => engine.sfxReverbIn, 'ui_click', 1, 0.1, 1, 0);
    RECIPES.ui_click({ v: dry, t: 0.1, p: 1, r: mulberry32(1) });
    expect(ctx.nodes.some((n) => (n as { kind: string }).kind === 'convolver')).toBe(false);
    expect(dry.usedWet).toBe(false);

    const wet = new Voice(engine.synth, engine.sfxBus, () => engine.sfxReverbIn, 'build_complete', 1, 0.1, 1, 0);
    RECIPES.build_complete({ v: wet, t: 0.1, p: 1, r: mulberry32(1) });
    expect(wet.usedWet).toBe(true);
    expect(ctx.nodes.some((n) => (n as { kind: string }).kind === 'convolver')).toBe(true);
  });
});

describe('MusicDirector', () => {
  it('pre-schedules a minute of music for every mood, at night, and in combat without error', async () => {
    for (const mood of MOOD_IDS) {
      for (const variant of ['day', 'night', 'combat'] as const) {
        const { ctx, engine } = makeEngine(5);
        const { bank, music } = makeMusic(engine);
        music.setMood(mood, true);
        music.setNight(variant === 'night');
        music.update(60); // settle the night smoothing
        if (variant === 'combat') music.setCombat(true);
        music.start({ manual: true });
        expect(music.isRunning).toBe(true);
        await bank.whenIdle(); // instrument samples are baked in the background
        expect(bank.size).toBeGreaterThanOrEqual(3);
        const before = ctx.nodeCount;
        music.tick(60);
        const info = music.info();
        expect(info.mood).toBe(mood);
        expect(info.bar).toBeGreaterThan(15);
        expect(ctx.nodeCount - before).toBeGreaterThan(100);
        // every source scheduled by the score is bounded (only the wind / LFO of the cold mood may run on)
        expect(ctx.leakedSources().filter((n) => n.kind === 'osc').length).toBeLessThanOrEqual(2);
        music.dispose();
      }
    }
  });

  it('plays notes only for instruments that are baked: pad and bass first, melody once samples exist', async () => {
    const { ctx, engine } = makeEngine();
    const bank = new SampleBank(engine, { gapMs: 1000 }); // nothing bakes during this test's first phase
    const music = new MusicDirector(engine, bank, mulberry32(3));
    music.start({ manual: true });
    const countBufferSources = (): number => ctx.nodes.filter((n) => (n as { kind: string }).kind === 'bufsrc').length;
    music.tick(30);
    expect(ctx.nodeCount).toBeGreaterThan(30); // pad + bass are live oscillators
    expect(countBufferSources()).toBe(0); // no baked samples yet -> no sampled notes
    bank.dispose();
  });

  it('keeps tempo in the 70-90 BPM range (combat adds a few BPM)', async () => {
    const { engine } = makeEngine();
    const { music } = makeMusic(engine, 1);
    music.start({ manual: true });
    music.tick(120);
    expect(music.info().bpm).toBeGreaterThanOrEqual(68);
    expect(music.info().bpm).toBeLessThanOrEqual(90);
    music.setCombat(true);
    music.tick(240);
    expect(music.info().bpm).toBeLessThanOrEqual(98);
  });

  it('switches mood at a chord boundary after the debounce, and ignores flicker', () => {
    const { ctx, engine } = makeEngine();
    const { music } = makeMusic(engine, 4);
    music.start({ manual: true });
    music.tick(1);
    expect(music.info().mood).toBe('calm');

    music.requestMood('cold');
    music.update(1);
    music.requestMood('calm'); // back before the settle time: flicker ignored
    music.update(5);
    expect(music.info().mood).toBe('calm');

    music.requestMood('cold');
    music.update(3.5);
    expect(music.info().pendingMood).toBe('cold'); // waits for the next chord
    ctx.currentTime += 10;
    music.tick(10);
    expect(music.info().mood).toBe('cold');
    expect(music.info().pendingMood).toBeNull();
  });

  it('varies the harmony from phrase to phrase', () => {
    const { ctx, engine } = makeEngine();
    const { music } = makeMusic(engine, 12);
    music.setMood('calm', true);
    music.start({ manual: true });
    const labels: string[] = [];
    for (let i = 0; i < 40; i++) {
      ctx.currentTime += 6.5;
      music.tick(7);
      labels.push(music.info().chord);
    }
    expect(new Set(labels).size).toBeGreaterThan(4);
  });

  it('does nothing while the context is not running', () => {
    const ctx = new FakeContext();
    const engine = new AudioEngine({ context: ctx.asReal(), rnd: mulberry32(1) }); // alwaysRunning off
    ctx.state = 'suspended';
    const music = new MusicDirector(engine, new SampleBank(engine));
    music.start({ manual: true });
    expect(music.isRunning).toBe(false);
  });

  it('setEnabled(false) stops scheduling; setEnabled(true) resumes', () => {
    const { engine } = makeEngine();
    const { music } = makeMusic(engine, 2);
    music.start({ manual: true });
    music.setEnabled(false);
    expect(music.isRunning).toBe(false);
    music.setEnabled(true);
    expect(music.isRunning).toBe(true);
  });

  it('the wind bed exists only in cold regions and is freed when leaving', () => {
    const { ctx, engine } = makeEngine();
    const { music } = makeMusic(engine, 6);
    const lfos = (): number => ctx.nodes.filter((n) => (n as { kind: string; started: number | null }).kind === 'osc' && (n as { stopped: number | null }).stopped === null).length;
    music.setMood('cold', true);
    music.start({ manual: true });
    expect(lfos()).toBeGreaterThanOrEqual(1); // the wind LFO
    music.setMood('calm', true);
    expect(lfos()).toBe(0);
  });

  it('the music scheduler shuts itself down after repeated failures instead of spamming', () => {
    const { engine } = makeEngine();
    const { music } = makeMusic(engine, 2);
    music.start({ manual: true });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    engine.synth.tone = () => {
      throw new Error('boom');
    };
    for (let i = 0; i < 6; i++) music.tick(1);
    expect(music.isRunning).toBe(false);
    err.mockRestore();
  });
});

function makeHost(overrides: Partial<{ music: number; sfx: number; phase: string; night: boolean; playTime: number }> = {}) {
  const bus = new EventBus();
  const state = {
    settings: { music: overrides.music ?? 0.6, sfx: overrides.sfx ?? 0.8 },
    combat: { phase: overrides.phase ?? 'peace' },
    player: { x: 0, z: 0 },
    playTime: overrides.playTime ?? 10,
  };
  const host: AudioHost & { night: boolean; region: string } = {
    bus,
    state,
    night: overrides.night ?? false,
    region: 'crash_valley',
    sys: { world: { regionAt: () => host.region } },
    data: { biome: (id: string) => ({ mood: id === 'frozen_ridge' ? 'cold' : 'calm' }) },
    view: { camera: { mode: 'follow', yaw: 0, tx: 0, tz: 0 } },
    isNight: () => host.night,
  };
  return { host, bus, state };
}

describe('AudioManager (event wiring, throttling, voices)', () => {
  function setup(opts: Parameters<typeof makeHost>[0] & { bake?: boolean } = {}) {
    const { ctx, engine } = makeEngine(8);
    const { host, bus, state } = makeHost(opts);
    let nowMs = 1000;
    const audio = new AudioManager(host, {
      engine, rnd: mulberry32(3), now: () => nowMs, attachDom: false, bakeGapMs: 0, bake: opts.bake ?? false,
    });
    audio.init();
    return { ctx, engine, host, bus, state, audio, advance: (ms: number) => (nowMs += ms), clock: () => nowMs };
  }

  it('plays catalog sounds from gameplay events and from explicit sfx, and ignores unknown ids', () => {
    const { audio, bus, advance } = setup();
    expect(audio.play('ui_click')).toBe(true);
    advance(100);
    bus.emit('building:placed', { id: 1, def: 'wall' });
    advance(100);
    bus.emit('sfx', { id: 'coin' });
    advance(100);
    bus.emit('sfx', { id: 'no_such_sound' });
    expect(audio.debug().voices).toBe(3);
    expect(audio.play('nope')).toBe(false);
  });

  it('collapses an event and an explicit sfx for the same moment into one sound', () => {
    const { audio, bus, advance } = setup();
    bus.emit('building:completed', { id: 1, def: 'farm' });
    advance(20);
    bus.emit('sfx', { id: 'build_complete' });
    expect(audio.debug().voices).toBe(1);
  });

  it('does not react to events before the game is ready, then does', () => {
    const { audio, bus, advance } = setup({ playTime: 0 });
    bus.emit('building:placed', { id: 1, def: 'x' });
    expect(audio.debug().voices).toBe(0);
    bus.emit('game:ready', { fresh: true });
    advance(100);
    bus.emit('building:placed', { id: 1, def: 'x' });
    expect(audio.debug().voices).toBe(1);
  });

  it('throttles a gather storm to <= 8/s', () => {
    const { audio, bus, advance } = setup();
    const models = ['tree_round', 'rock', 'crystal', 'ore_iron', 'bush'];
    for (let i = 0; i < 200; i++) {
      bus.emit('gather:hit', { node: i, model: models[i % 5], x: 1, z: 1, drop: {} });
      advance(10); // 100 hits per second
    }
    const started = audio.debug().voices;
    expect(started).toBeGreaterThan(0);
    // 2 s of hammering -> at most ~16 voices, far below the 200 requests
    expect(started).toBeLessThanOrEqual(17);
  });

  it('keeps big battles bounded: turret/alien/explosion floods never exceed the voice cap', () => {
    const { audio, bus, advance, ctx } = setup();
    for (let i = 0; i < 400; i++) {
      bus.emit('turret:fired', { building: i % 20, kind: ['bullet', 'missile', 'laser', 'cannon'][i % 4], x: i % 9, z: i % 7, tx: 5, tz: 5 });
      bus.emit('alien:hit', { id: i, x: 2, z: 3, damage: 1 });
      if (i % 3 === 0) bus.emit('alien:killed', { id: i, def: 'crawler', x: 2, z: 3, by: 'turret' });
      if (i % 5 === 0) bus.emit('projectile:impact', { kind: 'missile', x: 2, y: 0, z: 3, splash: 2 });
      advance(8);
      ctx.currentTime += 0.008;
      expect(audio.debug().voices).toBeLessThanOrEqual(MAX_VOICES);
    }
    expect(audio.debug().voices).toBeGreaterThan(5);
  });

  it('important jingles still play inside a battle flood', () => {
    const { audio, bus, advance } = setup();
    for (let i = 0; i < 100; i++) {
      bus.emit('turret:fired', { building: 1, kind: 'bullet', x: 1, z: 1, tx: 2, tz: 2 });
      advance(5);
    }
    advance(1000);
    bus.emit('mission:completed', { id: 'm' });
    expect(audio.debug().voices).toBeGreaterThan(0);
    advance(1000);
    expect(audio.play('tier_up')).toBe(true);
  });

  it('arbitrates stacked jingles: tier_up wins over mission_done and reward in the same moment', () => {
    const { audio, bus, advance } = setup();
    bus.emit('reward:granted', { reward: {}, source: 'mission' }); // deferred
    bus.emit('mission:completed', { id: 'm' });
    advance(10);
    bus.emit('colony:tierUp', { tier: 1 });
    audio.update(0.016);
    advance(200);
    audio.update(0.016);
    // mission_done played, tier_up layered on top; reward never played
    expect(audio.debug().voices).toBe(2);
  });

  it('a lone reward jingle plays once its short hold elapses', () => {
    const { audio, bus, advance } = setup();
    bus.emit('reward:granted', { reward: {}, source: 'daily' });
    expect(audio.debug().voices).toBe(0);
    advance(120);
    audio.update(0.016);
    expect(audio.debug().voices).toBe(1);
  });

  it('respects the sfx volume setting (0 = silent) and a locked context', () => {
    const quiet = setup({ sfx: 0 });
    expect(quiet.audio.play('ui_click')).toBe(false);

    const ctx = new FakeContext();
    ctx.state = 'suspended';
    const engine = new AudioEngine({ context: ctx.asReal(), rnd: mulberry32(1) });
    const { host } = makeHost();
    const audio = new AudioManager(host, { engine, attachDom: false });
    audio.init();
    expect(audio.play('ui_click')).toBe(false);
  });

  it('culls and attenuates positional sounds by distance from the camera focus', () => {
    const { audio, state } = setup();
    state.player.x = 0;
    state.player.z = 0;
    expect(audio.play('alien_hit', { x: 400, z: 400 })).toBe(false); // far out of earshot
    expect(audio.play('alien_hit', { x: 5, z: 5 })).toBe(true);
  });

  it('music follows region mood, night and combat phase; overrides win', () => {
    const { audio, host, state, ctx, engine } = setup();
    engine.setVolumes(0.6, 0.8);
    audio.update(0.3); // slow tick: start music
    expect(audio.music.isRunning).toBe(true);
    expect(audio.music.info().mood).toBe('calm');

    host.region = 'frozen_ridge';
    for (let i = 0; i < 20; i++) audio.update(0.3); // > 3 s settle
    expect(audio.music.info().pendingMood === 'cold' || audio.music.info().mood === 'cold').toBe(true);

    host.night = true;
    state.combat.phase = 'attack';
    audio.update(0.3);
    expect(audio.music.info().combat).toBe(true);
    ctx.currentTime += 1;
    audio.setOverrides({ combat: false, night: false, mood: 'epic' });
    audio.update(0.3);
    expect(audio.music.info().combat).toBe(false);
    expect(audio.music.info().pendingMood === 'epic' || audio.music.info().mood === 'epic').toBe(true);
  });

  it('stops the music when the music volume is 0 and resumes when raised', () => {
    const { audio, state } = setup();
    audio.update(0.3);
    expect(audio.music.isRunning).toBe(true);
    state.settings.music = 0;
    audio.update(0.3);
    expect(audio.music.isRunning).toBe(false);
    state.settings.music = 0.5;
    audio.update(0.3);
    expect(audio.music.isRunning).toBe(true);
  });

  it('survives odd settings and a throwing world lookup without breaking the game loop', () => {
    const { audio, host, state } = setup();
    (state.settings as { music: unknown }).music = undefined;
    (state.settings as { sfx: unknown }).sfx = Number.NaN;
    expect(() => audio.update(0.3)).not.toThrow();
    expect(audio.play('ui_click')).toBe(true); // falls back to the default sfx volume

    (state.settings as { music: unknown }).music = 0.5;
    (state.settings as { sfx: unknown }).sfx = 0.8;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    host.sys.world.regionAt = () => {
      throw new Error('world not ready');
    };
    for (let i = 0; i < 5; i++) expect(() => audio.update(0.3)).not.toThrow();
    expect(err).toHaveBeenCalledTimes(1); // reported once, not every frame
    err.mockRestore();
  });

  it('dispose unsubscribes from the bus', () => {
    const { audio, bus } = setup();
    audio.dispose();
    bus.emit('building:placed', { id: 1, def: 'x' });
    expect(audio.play('ui_click')).toBe(false);
  });
});

describe('AudioManager with baked samples', () => {
  async function bakedSetup() {
    const { ctx, engine } = makeEngine(8);
    const { host, bus, state } = makeHost();
    let nowMs = 1000;
    const audio = new AudioManager(host, { engine, rnd: mulberry32(3), now: () => nowMs, attachDom: false, bakeGapMs: 0 });
    audio.init();
    audio.update(0.3); // slow tick -> starts baking + music
    await audio.bank.whenIdle();
    return { ctx, engine, host, bus, state, audio, advance: (ms: number) => (nowMs += ms) };
  }

  it('bakes every sound id (all variants) in the background', async () => {
    const { audio } = await bakedSetup();
    for (const id of SOUND_IDS) expect(audio.bank.has(sfxKey(id)), id).toBe(true);
    expect(audio.bank.variants(sfxKey('gather_wood'))!.length).toBe(3);
    expect(audio.debug().bakePending).toBe(0);
    expect(audio.bank.failures).toBe(0);
  });

  it('plays baked sounds with only 2 nodes per voice (source + gain) instead of a live recipe graph', async () => {
    const { audio, ctx, advance } = await bakedSetup();
    advance(1000);
    const before = ctx.nodeCount;
    expect(audio.play('tier_up')).toBe(true); // 117-node recipe live
    expect(ctx.nodeCount - before).toBeLessThanOrEqual(3);
    const before2 = ctx.nodeCount;
    expect(audio.play('alien_hit', { x: 8, z: 3 })).toBe(true); // + panner
    expect(ctx.nodeCount - before2).toBeLessThanOrEqual(3);
  });

  it('applies pitch through playbackRate and keeps the same throttling / voice cap', async () => {
    const { audio, bus, advance, ctx } = await bakedSetup();
    advance(1000);
    expect(audio.play('collect', { pitch: 1.5 })).toBe(true);
    for (let i = 0; i < 300; i++) {
      bus.emit('turret:fired', { building: i % 20, kind: ['bullet', 'laser', 'cannon'][i % 3], x: 1, z: 1, tx: 5, tz: 5 });
      bus.emit('alien:hit', { id: i, x: 2, z: 3, damage: 1 });
      advance(8);
      ctx.currentTime += 0.008;
      expect(audio.debug().voices).toBeLessThanOrEqual(MAX_VOICES);
    }
  });

  it('falls back to the live recipe for sounds that are not baked (e.g. offline rendering unavailable)', () => {
    const ctx = new FakeContext();
    const engine = new AudioEngine({ context: ctx.asReal(), alwaysRunning: true, offlineFactory: () => null });
    engine.setVolumes(1, 1);
    const { host } = makeHost();
    const audio = new AudioManager(host, { engine, attachDom: false, bakeGapMs: 0 });
    audio.init();
    audio.update(0.3);
    expect(audio.play('build_complete')).toBe(true);
    expect(audio.bank.unsupported).toBe(false); // discovered lazily on the first bake attempt
  });
});
