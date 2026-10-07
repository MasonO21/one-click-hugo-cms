import { describe, expect, it, vi } from 'vitest';
import {
  BAKE_VARIANTS, SampleBank, audibleLength, bakeOrder, fadeOut, nearestRef, sfxJobs, sfxKey, variantCount,
  type BakeJob,
} from '../src/audio/bake';
import { AudioEngine } from '../src/audio/engine';
import { SOUND_IDS } from '../src/audio/ids';
import { DRUM_KEYS, PLUCK_REFS, REFS, SHAKER_KEY, pitchedKey, sampleJobs, timbreSet, type SampleSet } from '../src/audio/musicSamples';
import { FakeContext, FakeOffline } from '../src/audio/dev/fakeContext';

type OfflineFactory = (channels: number, length: number, sampleRate: number) => OfflineAudioContext | null;

function makeEngine(factory?: OfflineFactory) {
  const ctx = new FakeContext();
  const engine = new AudioEngine({
    context: ctx.asReal(),
    alwaysRunning: true,
    offlineFactory: factory ?? ((ch, len, sr) => new FakeOffline(ch, len, sr).asOffline()),
  });
  return { ctx, engine };
}

describe('pure bake helpers', () => {
  it('audibleLength trims silent tails but keeps a short pad', () => {
    const sr = 1000;
    const a = new Float32Array(2000);
    a[300] = 0.5;
    expect(audibleLength([a], sr)).toBe(301 + 20); // 20 ms pad at 1 kHz
    expect(audibleLength([new Float32Array(2000)], sr, 2e-4, 0.02, 64)).toBe(64); // all silent -> minLen
  });

  it('audibleLength looks at every channel and never exceeds the buffer', () => {
    const sr = 1000;
    const l = new Float32Array(500);
    const r = new Float32Array(500);
    l[10] = 0.3;
    r[400] = 0.3;
    expect(audibleLength([l, r], sr)).toBe(401 + 20);
    r[499] = 1;
    expect(audibleLength([l, r], sr)).toBe(500);
  });

  it('fadeOut ramps the last samples to zero without touching earlier ones', () => {
    const sr = 1000;
    const d = new Float32Array(100).fill(1);
    fadeOut([d], 100, sr, 0.01); // 10 samples
    expect(d[0]).toBe(1);
    expect(d[89]).toBe(1);
    expect(d[99]).toBe(0);
    for (let i = 91; i < 100; i++) expect(d[i]).toBeLessThan(d[i - 1] + 1e-9);
  });

  it('nearestRef picks the closest reference and the transposing rate', () => {
    expect(nearestRef(PLUCK_REFS, 72)).toEqual({ ref: 72, rate: 1 });
    const up = nearestRef(PLUCK_REFS, 75);
    expect(up.ref === 72 || up.ref === 78).toBe(true);
    expect(up.rate).toBeCloseTo(Math.pow(2, (75 - up.ref) / 12), 9);
    for (let m = 58; m <= 93; m++) {
      const r = nearestRef(PLUCK_REFS, m);
      expect(Math.abs(m - r.ref)).toBeLessThanOrEqual(3); // plucks are baked every 6 semitones
    }
    // every other family stays within a tritone of a reference across the register it is used in
    const ranges = { bell: [65, 89], glass: [64, 91], flute: [57, 81], spark: [76, 93], thump: [48, 59] } as const;
    for (const set of ['bell', 'glass', 'flute', 'spark', 'thump'] as const) {
      const [lo, hi] = ranges[set];
      for (let m = lo; m <= hi; m++) expect(Math.abs(m - nearestRef(REFS[set], m).ref), `${set} ${m}`).toBeLessThanOrEqual(6);
    }
  });

  it('bake order lists every sound exactly once', () => {
    const order = bakeOrder();
    expect(new Set(order).size).toBe(order.length);
    expect([...order].sort()).toEqual([...SOUND_IDS].sort());
    expect(order[0]).toBe('ui_click'); // most common / earliest first
  });

  it('variants: random-heavy sounds have several, the rest one', () => {
    expect(variantCount('gather_wood')).toBe(3);
    expect(variantCount('tier_up')).toBe(1);
    for (const id of Object.keys(BAKE_VARIANTS)) expect(SOUND_IDS as readonly string[]).toContain(id);
  });

  it('one SFX job per (id, variant) with distinct variant indices', () => {
    const jobs = sfxJobs(['gather_wood', 'tier_up']);
    expect(jobs.length).toBe(3 + 1);
    expect(jobs.filter((j) => j.key === sfxKey('gather_wood')).map((j) => j.variant)).toEqual([0, 1, 2]);
  });

  it('music sample families cover every melody timbre and the combat kit', () => {
    for (const t of ['marimba', 'bell', 'glass', 'flute'] as const) {
      const set = timbreSet(t);
      const jobs = sampleJobs(set);
      expect(jobs.length).toBe(REFS[set].length);
      for (const j of jobs) {
        expect(j.dur).toBeGreaterThan(0.5);
        expect(j.key.startsWith(`${set}:`)).toBe(true);
      }
    }
    expect(sampleJobs('drums').map((j) => j.key).sort()).toEqual(Object.values(DRUM_KEYS).sort());
    expect(sampleJobs('shaker').every((j) => j.key === SHAKER_KEY)).toBe(true);
    expect(pitchedKey('pluck', 72)).toBe('pluck:72');
  });
});

describe('SampleBank', () => {
  it('bakes queued jobs in order, trims them and stores variants under one key', async () => {
    const { engine } = makeEngine();
    const bank = new SampleBank(engine, { gapMs: 0 });
    const order: string[] = [];
    const job = (key: string, variant: number, stereo = false): BakeJob => ({
      key, variant, dur: 1,
      render: () => {
        order.push(`${key}#${variant}`);
        return stereo;
      },
    });
    bank.enqueue([job('a', 0), job('a', 1), job('b', 0, true)]);
    expect(bank.pending).toBeGreaterThan(0);
    await bank.whenIdle();
    expect(order).toEqual(['a#0', 'a#1', 'b#0']);
    expect(bank.variants('a')!.length).toBe(2);
    const a = bank.variants('a')![0];
    const b = bank.variants('b')![0];
    expect(a.numberOfChannels).toBe(1); // dry -> mono
    expect(b.numberOfChannels).toBe(2); // used reverb -> stereo
    // fake renders a 0.25 s burst; the 1 s buffer is trimmed to burst + pad
    expect(a.duration).toBeLessThan(0.5);
    expect(a.duration).toBeGreaterThan(0.24);
    expect(bank.pick('a', () => 0.99)).toBeTruthy();
    expect(bank.pick('missing', Math.random)).toBeUndefined();
  });

  it('skips jobs that are already queued or baked, and front-queued jobs jump the line', async () => {
    const { engine } = makeEngine();
    const bank = new SampleBank(engine, { gapMs: 0 });
    const order: string[] = [];
    const job = (key: string): BakeJob => ({ key, dur: 0.5, render: () => void order.push(key) });
    bank.enqueue([job('x'), job('y')]);
    bank.enqueue([job('x')]); // duplicate
    bank.enqueue([job('z')], true); // front
    await bank.whenIdle();
    expect(order).toEqual(['z', 'x', 'y']);
    bank.enqueue([job('x')]); // already baked: ignored
    await bank.whenIdle();
    expect(order).toEqual(['z', 'x', 'y']);
  });

  it('survives failing renders and gives up after repeated failures (live path keeps working)', async () => {
    const { engine } = makeEngine();
    const bank = new SampleBank(engine, { gapMs: 0 });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    FakeOffline.failNext = 100;
    const jobs: BakeJob[] = Array.from({ length: 10 }, (_, i) => ({ key: `k${i}`, dur: 0.2, render: () => {} }));
    bank.enqueue(jobs);
    await bank.whenIdle();
    FakeOffline.failNext = 0;
    expect(bank.failures).toBeGreaterThanOrEqual(6);
    expect(bank.unsupported).toBe(true);
    expect(bank.size).toBe(0);
    expect(err).toHaveBeenCalledTimes(2); // logged, but not spammed
    err.mockRestore();
  });

  it('a failing job render (throwing recipe) does not stop the queue', async () => {
    const { engine } = makeEngine();
    const bank = new SampleBank(engine, { gapMs: 0 });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    bank.enqueue([
      { key: 'bad', dur: 0.2, render: () => { throw new Error('recipe bug'); } },
      { key: 'good', dur: 0.2, render: () => {} },
    ]);
    await bank.whenIdle();
    expect(bank.has('bad')).toBe(false);
    expect(bank.has('good')).toBe(true);
    err.mockRestore();
  });

  it('bakes reduced-rate jobs at the reduced rate (memory), full-rate jobs at the native rate', async () => {
    const { engine } = makeEngine();
    const bank = new SampleBank(engine, { gapMs: 0 });
    bank.enqueue([
      { key: 'soft', dur: 0.5, sampleRate: 24000, render: () => {} },
      { key: 'full', dur: 0.5, render: () => {} },
      { key: 'never-upsampled', dur: 0.5, sampleRate: 96000, render: () => {} },
    ]);
    await bank.whenIdle();
    expect(bank.variants('soft')![0].sampleRate).toBe(24000);
    expect(bank.variants('full')![0].sampleRate).toBe(engine.sampleRate);
    expect(bank.variants('never-upsampled')![0].sampleRate).toBe(engine.sampleRate);
  });

  it('retries at the native rate when the browser refuses a reduced-rate offline context', async () => {
    const { engine } = makeEngine((ch, len, sr) => (sr < 40000 ? null : new FakeOffline(ch, len, sr).asOffline()));
    const bank = new SampleBank(engine, { gapMs: 0 });
    bank.enqueue([{ key: 'x', dur: 0.5, sampleRate: 22050, render: () => {} }]);
    await bank.whenIdle();
    expect(bank.has('x')).toBe(true);
    expect(bank.variants('x')![0].sampleRate).toBe(engine.sampleRate);
    expect(bank.unsupported).toBe(false);
  });

  it('marks itself unsupported when the browser has no offline rendering', async () => {
    const { engine } = makeEngine(() => null);
    const bank = new SampleBank(engine, { gapMs: 0 });
    bank.enqueue([{ key: 'a', dur: 0.2, render: () => {} }]);
    await bank.whenIdle();
    expect(bank.unsupported).toBe(true);
    expect(bank.size).toBe(0);
    bank.enqueue([{ key: 'b', dur: 0.2, render: () => {} }]);
    expect(bank.pending).toBe(0);
  });

  it('bakes every SFX recipe and every music family against the fake renderer without errors', async () => {
    const { engine } = makeEngine();
    const bank = new SampleBank(engine, { gapMs: 0 });
    bank.enqueue(sfxJobs(bakeOrder()));
    const sets: SampleSet[] = ['pluck', 'bell', 'glass', 'flute', 'spark', 'drums', 'shaker', 'thump'];
    for (const s of sets) bank.enqueue(sampleJobs(s));
    await bank.whenIdle();
    expect(bank.failures).toBe(0);
    for (const id of SOUND_IDS) expect(bank.has(sfxKey(id)), id).toBe(true);
    for (const s of ['pluck', 'bell', 'glass', 'flute', 'spark', 'thump'] as const) {
      for (const ref of REFS[s]) expect(bank.has(pitchedKey(s, ref)), `${s}:${ref}`).toBe(true);
    }
    for (const k of Object.values(DRUM_KEYS)) expect(bank.has(k), k).toBe(true);
    expect(bank.has(SHAKER_KEY)).toBe(true);
  });

  it('dispose drops everything and resolves waiters', async () => {
    const { engine } = makeEngine();
    const bank = new SampleBank(engine, { gapMs: 5 });
    bank.enqueue(sfxJobs(['ui_click', 'collect']));
    const idle = bank.whenIdle();
    bank.dispose();
    await idle;
    expect(bank.size).toBe(0);
  });
});
