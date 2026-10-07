import { describe, expect, it } from 'vitest';
import {
  GROUP_LIMITS, SPATIAL, SoundGate, StingerArbiter, VoicePool, policyFor, spatialize, volumeCurve,
  type PooledVoice, type Priority,
} from '../src/audio/policy';
import { SOUND_IDS, resolveSoundId } from '../src/audio/ids';

describe('SoundGate (dedupe + rate limiting)', () => {
  it('collapses the same id within its dedupe window (event + explicit sfx double-fire)', () => {
    const g = new SoundGate();
    expect(g.tryPlay('build_complete', 1000)).toBe(true);
    expect(g.tryPlay('build_complete', 1020)).toBe(false);
    expect(g.tryPlay('build_complete', 1049)).toBe(false);
    expect(g.tryPlay('build_complete', 1050)).toBe(true);
  });

  it('does not dedupe different ids', () => {
    const g = new SoundGate();
    expect(g.tryPlay('place', 1000)).toBe(true);
    expect(g.tryPlay('build_complete', 1001)).toBe(true);
  });

  it('caps gather sounds at 8 per sliding second across all gather ids', () => {
    const g = new SoundGate();
    const ids = ['gather_wood', 'gather_stone', 'gather_plant', 'gather_crystal', 'gather_metal'];
    let accepted = 0;
    // attempt a gather sound every 10 ms for 3 s
    const times: number[] = [];
    for (let t = 0; t < 3000; t += 10) {
      if (g.tryPlay(ids[(t / 10) % ids.length], t)) {
        accepted++;
        times.push(t);
      }
    }
    expect(accepted).toBeGreaterThan(15); // still lively
    expect(accepted).toBeLessThanOrEqual(24); // <= 8/s over 3 s
    for (const t of times) {
      const inWindow = times.filter((x) => x >= t && x < t + 1000).length;
      expect(inWindow).toBeLessThanOrEqual(8);
    }
  });

  it('caps turret shots at 12/s total across projectile kinds and spaces them out', () => {
    const g = new SoundGate();
    const kinds = ['turret_bullet', 'turret_flame', 'turret_missile', 'turret_laser', 'turret_plasma', 'turret_rail', 'turret_cannon'];
    const times: number[] = [];
    for (let t = 0; t < 4000; t += 5) {
      if (g.tryPlay(kinds[(t / 5) % kinds.length], t)) times.push(t);
    }
    for (const t of times) {
      expect(times.filter((x) => x >= t && x < t + 1000).length).toBeLessThanOrEqual(12);
    }
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(GROUP_LIMITS.turret.minGapMs);
    expect(times.length).toBeGreaterThan(30);
  });

  it('caps collect blips at 6/s', () => {
    const g = new SoundGate();
    const times: number[] = [];
    for (let t = 0; t < 2000; t += 7) if (g.tryPlay(t % 14 === 0 ? 'collect' : 'coin', t)) times.push(t);
    for (const t of times) expect(times.filter((x) => x >= t && x < t + 1000).length).toBeLessThanOrEqual(6);
  });

  it('does not consume budget when a sound is rejected', () => {
    const g = new SoundGate();
    expect(g.tryPlay('gather_wood', 0)).toBe(true);
    for (let i = 0; i < 50; i++) g.tryPlay('gather_wood', 10); // all rejected (dedupe)
    // budget intact: after the min gap another gather sound plays
    expect(g.tryPlay('gather_stone', 70)).toBe(true);
  });

  it('recovers after a quiet second', () => {
    const g = new SoundGate();
    for (let t = 0; t < 1000; t += 60) g.tryPlay('collect', t);
    expect(g.tryPlay('collect', 5000)).toBe(true);
  });

  it('every sound id has a sane policy', () => {
    for (const id of SOUND_IDS) {
      const p = policyFor(id);
      expect(p.dedupeMs).toBeGreaterThanOrEqual(0);
      if (p.group) expect(GROUP_LIMITS[p.group], `${id} group ${p.group}`).toBeTruthy();
    }
    // spammy ambient sounds are first to be stolen, jingles never
    expect(policyFor('gather_wood').priority).toBe(0);
    expect(policyFor('turret_laser').priority).toBe(0);
    expect(policyFor('tier_up').priority).toBe(2);
  });
});

function fakeVoice(id: string, priority: Priority, start: number, end: number, log: string[]): PooledVoice {
  return {
    id, priority, start, end,
    stop: () => void log.push(`stop:${id}`),
    dispose: () => void log.push(`dispose:${id}`),
  };
}

describe('VoicePool', () => {
  it('prunes finished voices and frees them', () => {
    const log: string[] = [];
    const pool = new VoicePool(4);
    pool.add(fakeVoice('a', 1, 0, 1, log));
    pool.add(fakeVoice('b', 1, 0, 5, log));
    pool.prune(2);
    expect(pool.size).toBe(1);
    expect(log).toEqual(['dispose:a']);
  });

  it('steals the oldest lowest-priority voice when full', () => {
    const log: string[] = [];
    const pool = new VoicePool(3);
    pool.add(fakeVoice('jingle', 2, 0, 10, log));
    pool.add(fakeVoice('old-ambient', 0, 1, 10, log));
    pool.add(fakeVoice('new-ambient', 0, 2, 10, log));
    expect(pool.admit(1, 3)).toBe(true);
    expect(log).toEqual(['stop:old-ambient', 'dispose:old-ambient']);
    expect(pool.size).toBe(2);
  });

  it('never steals a more important voice: the new sound is dropped', () => {
    const log: string[] = [];
    const pool = new VoicePool(2);
    pool.add(fakeVoice('j1', 2, 0, 10, log));
    pool.add(fakeVoice('j2', 2, 1, 10, log));
    expect(pool.admit(0, 2)).toBe(false);
    expect(log).toEqual([]);
  });

  it('an important sound can steal an equal-priority voice, oldest first', () => {
    const log: string[] = [];
    const pool = new VoicePool(2);
    pool.add(fakeVoice('j1', 2, 0, 10, log));
    pool.add(fakeVoice('j2', 2, 1, 10, log));
    expect(pool.admit(2, 2)).toBe(true);
    expect(log[0]).toBe('stop:j1');
  });

  it('caps concurrent voices at max under a flood', () => {
    const pool = new VoicePool(24);
    for (let i = 0; i < 200; i++) {
      if (pool.admit(0, i * 0.01)) pool.add(fakeVoice('x', 0, i * 0.01, 1000, []));
    }
    expect(pool.size).toBe(24);
  });

  it('clear stops and disposes everything', () => {
    const log: string[] = [];
    const pool = new VoicePool(4);
    pool.add(fakeVoice('a', 1, 0, 9, log));
    pool.clear();
    expect(pool.size).toBe(0);
    expect(log).toEqual(['stop:a', 'dispose:a']);
  });
});

describe('StingerArbiter', () => {
  it('lets a lone jingle through (low ranks are held briefly, then flushed)', () => {
    const a = new StingerArbiter(90, 700, 1);
    expect(a.request('reward', 1, 1000)).toBe('defer');
    expect(a.flush(1050)).toBeNull();
    expect(a.flush(1090)?.id).toBe('reward');
    expect(a.flush(1200)).toBeNull();
  });

  it('a bigger jingle in the same moment cancels the held low one', () => {
    const a = new StingerArbiter();
    expect(a.request('reward', 1, 1000)).toBe('defer');
    expect(a.request('mission_done', 4, 1010)).toBe('play');
    expect(a.flush(1200)).toBeNull();
  });

  it('drops lower or equal ranks shortly after a bigger one', () => {
    const a = new StingerArbiter();
    expect(a.request('tier_up', 5, 0)).toBe('play');
    expect(a.request('mission_done', 4, 100)).toBe('drop');
    expect(a.request('reward', 1, 200)).toBe('drop');
    expect(a.request('victory', 5, 300)).toBe('drop');
    // after the block window another jingle is fine
    expect(a.request('mission_done', 4, 800)).toBe('play');
  });

  it('lets a higher-ranked jingle layer over a lower one', () => {
    const a = new StingerArbiter();
    expect(a.request('build_complete', 3, 0)).toBe('play');
    expect(a.request('mission_done', 4, 20)).toBe('play');
  });

  it('collapses duplicate low-rank jingles in one moment', () => {
    const a = new StingerArbiter();
    expect(a.request('reward', 1, 0)).toBe('defer');
    expect(a.request('reward', 1, 5)).toBe('drop');
  });

  it('a deferred jingle that became redundant is not flushed', () => {
    const a = new StingerArbiter(90, 700, 1);
    expect(a.request('reward', 1, 0)).toBe('defer');
    expect(a.request('crate_open', 2, 50)).toBe('play');
    expect(a.flush(500)).toBeNull();
  });
});

describe('volume + spatial model', () => {
  it('volume curve is monotonic and hits the endpoints', () => {
    expect(volumeCurve(0)).toBe(0);
    expect(volumeCurve(1)).toBe(1);
    expect(volumeCurve(-3)).toBe(0);
    expect(volumeCurve(7)).toBe(1);
    expect(volumeCurve(Number.NaN)).toBe(0); // odd saves must never produce NaN gains
    expect(volumeCurve(undefined as unknown as number)).toBe(0);
    let prev = -1;
    for (let v = 0; v <= 1; v += 0.1) {
      const c = volumeCurve(v);
      expect(c).toBeGreaterThan(prev);
      prev = c;
    }
  });

  it('is full volume and centered up close', () => {
    const s = spatialize(0, 0, 1, 0);
    expect(s).toEqual({ gain: 1, pan: 0 });
    expect(spatialize(3, 4, 1, 0).gain).toBe(1);
  });

  it('attenuates with distance and is silent beyond max distance', () => {
    const near = spatialize(SPATIAL.refDist + 5, 0, 1, 0).gain;
    const far = spatialize(SPATIAL.refDist + 40, 0, 1, 0).gain;
    expect(near).toBeLessThan(1);
    expect(far).toBeLessThan(near);
    expect(spatialize(SPATIAL.maxDist, 0, 1, 0).gain).toBe(0);
    expect(spatialize(500, 0, 1, 0).gain).toBe(0);
  });

  it('pans toward the camera-right side, bounded', () => {
    expect(spatialize(20, 0, 1, 0).pan).toBeGreaterThan(0.3);
    expect(spatialize(-20, 0, 1, 0).pan).toBeLessThan(-0.3);
    expect(Math.abs(spatialize(1000, 0, 1, 0).pan)).toBeLessThanOrEqual(SPATIAL.maxPan);
    // rotated camera: right = (0, -1)  (yaw = pi/2 -> right = (cos, -sin) = (0, -1))
    expect(spatialize(0, -20, 0, -1).pan).toBeGreaterThan(0.3);
    expect(spatialize(0, 20, 0, -1).pan).toBeLessThan(-0.3);
  });
});

describe('sound ids', () => {
  it('resolves ids and aliases, rejects unknown', () => {
    expect(resolveSoundId('ui_click')).toBe('ui_click');
    expect(resolveSoundId('click')).toBe('ui_click');
    expect(resolveSoundId('definitely_not_a_sound')).toBeNull();
  });

  it('covers the whole ARCHITECTURE.md catalog', () => {
    const catalog = `ui_click ui_open ui_close ui_error ui_tab gather_wood gather_stone gather_plant gather_crystal gather_metal
      place build_complete upgrade remove deposit collect coin reward crate_open craft_start craft_done research_done
      mission_done level_up tier_up celebrate alarm attack_start victory turret_bullet turret_flame turret_missile
      turret_laser turret_plasma turret_rail turret_cannon alien_hit alien_die explosion shield_hit player_hurt
      spin_tick spin_win door vehicle_start teleport recruit`.split(/\s+/);
    expect(catalog.length).toBe(47);
    for (const id of catalog) expect(SOUND_IDS as readonly string[], id).toContain(id);
  });
});
