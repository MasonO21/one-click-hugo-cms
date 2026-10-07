/**
 * Playback policy — pure logic with no WebAudio dependency (unit-tested in node):
 *  - per-id dedupe window and per-group rate limiting (`SoundGate`)
 *  - concurrent voice limiting with priority-aware stealing (`VoicePool`)
 *  - jingle arbitration so overlapping fanfares do not pile up (`StingerArbiter`)
 *  - volume curve and distance / pan model
 */
import type { SoundId } from './ids';

/** 0 = ambient/spammy (first to be stolen), 1 = normal, 2 = important (never stolen by lower). */
export type Priority = 0 | 1 | 2;

export interface GroupLimit {
  /** Hard cap: at most this many sounds of the group start in any sliding 1 s window. */
  perSecond: number;
  /** Minimum spacing between two sounds of the group, so bursts never clump into a buzz. */
  minGapMs: number;
}

export const GROUP_LIMITS: Readonly<Record<string, GroupLimit>> = {
  gather: { perSecond: 8, minGapMs: 60 },
  collect: { perSecond: 6, minGapMs: 80 },
  turret: { perSecond: 12, minGapMs: 45 },
  alienHit: { perSecond: 10, minGapMs: 55 },
  alienDie: { perSecond: 6, minGapMs: 90 },
  explosion: { perSecond: 6, minGapMs: 90 },
  shield: { perSecond: 4, minGapMs: 120 },
  hurt: { perSecond: 3, minGapMs: 250 },
  error: { perSecond: 3, minGapMs: 300 },
  tick: { perSecond: 30, minGapMs: 20 },
  ui: { perSecond: 14, minGapMs: 25 },
};

export interface SoundPolicy {
  /** Rate-limit group (see GROUP_LIMITS). */
  group?: string;
  /** Same id within this window is dropped (collapses event + explicit `sfx` double-fires). */
  dedupeMs: number;
  priority: Priority;
  /** Jingle rank (see StingerArbiter); undefined = not a jingle. */
  stinger?: number;
}

const DEFAULT_DEDUPE_MS = 50;

const OVERRIDES: Partial<Record<SoundId, Partial<SoundPolicy>>> = {
  ui_click: { group: 'ui', dedupeMs: 30 },
  ui_open: { group: 'ui' },
  ui_close: { group: 'ui' },
  ui_tab: { group: 'ui', dedupeMs: 30, priority: 0 },
  ui_error: { group: 'error', dedupeMs: 200 },

  gather_wood: { group: 'gather', dedupeMs: 30, priority: 0 },
  gather_stone: { group: 'gather', dedupeMs: 30, priority: 0 },
  gather_plant: { group: 'gather', dedupeMs: 30, priority: 0 },
  gather_crystal: { group: 'gather', dedupeMs: 30, priority: 0 },
  gather_metal: { group: 'gather', dedupeMs: 30, priority: 0 },

  collect: { group: 'collect', dedupeMs: 40, priority: 0 },
  coin: { group: 'collect', dedupeMs: 40, priority: 0 },

  turret_bullet: { group: 'turret', dedupeMs: 25, priority: 0 },
  turret_flame: { group: 'turret', dedupeMs: 25, priority: 0 },
  turret_missile: { group: 'turret', dedupeMs: 25, priority: 0 },
  turret_laser: { group: 'turret', dedupeMs: 25, priority: 0 },
  turret_plasma: { group: 'turret', dedupeMs: 25, priority: 0 },
  turret_rail: { group: 'turret', dedupeMs: 25, priority: 0 },
  turret_cannon: { group: 'turret', dedupeMs: 25, priority: 0 },

  alien_hit: { group: 'alienHit', dedupeMs: 25, priority: 0 },
  alien_die: { group: 'alienDie', dedupeMs: 30, priority: 0 },
  explosion: { group: 'explosion', dedupeMs: 40, priority: 1 },
  shield_hit: { group: 'shield', dedupeMs: 40, priority: 0 },
  player_hurt: { group: 'hurt', dedupeMs: 100, priority: 1 },

  spin_tick: { group: 'tick', dedupeMs: 12, priority: 0 },

  // jingles: never stolen by ambient sounds, ranked so the biggest one wins
  reward: { priority: 2, stinger: 1 },
  crate_open: { priority: 2, stinger: 2 },
  celebrate: { priority: 2, stinger: 3 },
  build_complete: { priority: 2, stinger: 3 },
  upgrade: { priority: 2, stinger: 3 },
  recruit: { priority: 2, stinger: 3 },
  spin_win: { priority: 2, stinger: 3 },
  discover: { priority: 2, stinger: 3 },
  research_done: { priority: 2, stinger: 4 },
  mission_done: { priority: 2, stinger: 4 },
  level_up: { priority: 2, stinger: 4 },
  victory: { priority: 2, stinger: 5 },
  tier_up: { priority: 2, stinger: 5 },

  alarm: { priority: 2, dedupeMs: 500 },
  attack_start: { priority: 2, dedupeMs: 500 },
};

const policyCache = new Map<string, SoundPolicy>();

/** Policy for a sound id (defaults: normal priority, 50 ms dedupe, no group). */
export function policyFor(id: string): SoundPolicy {
  let p = policyCache.get(id);
  if (!p) {
    p = { dedupeMs: DEFAULT_DEDUPE_MS, priority: 1, ...OVERRIDES[id as SoundId] };
    policyCache.set(id, p);
  }
  return p;
}

interface Ring {
  /** Accept times of the last `perSecond` plays (circular). */
  t: Float64Array;
  i: number;
  lastMs: number;
}

/**
 * Decides whether a sound may start *now*. Combines a per-id dedupe window with per-group sliding
 * window limits. `tryPlay` records the play only when it is accepted.
 */
export class SoundGate {
  private readonly lastById = new Map<string, number>();
  private readonly rings = new Map<string, Ring>();

  constructor(
    private readonly limits: Readonly<Record<string, GroupLimit>> = GROUP_LIMITS,
    private readonly policy: (id: string) => SoundPolicy = policyFor,
  ) {}

  tryPlay(id: string, nowMs: number): boolean {
    const pol = this.policy(id);
    const prev = this.lastById.get(id);
    if (prev !== undefined && nowMs - prev < pol.dedupeMs) return false;

    let ring: Ring | undefined;
    if (pol.group) {
      const lim = this.limits[pol.group];
      if (lim) {
        ring = this.rings.get(pol.group);
        if (!ring) {
          ring = { t: new Float64Array(Math.max(1, Math.floor(lim.perSecond))).fill(Number.NEGATIVE_INFINITY), i: 0, lastMs: Number.NEGATIVE_INFINITY };
          this.rings.set(pol.group, ring);
        }
        if (nowMs - ring.lastMs < lim.minGapMs) return false;
        // The oldest of the last N accepted plays is still inside the 1 s window -> N plays already.
        if (nowMs - ring.t[ring.i] < 1000) return false;
      }
    }

    this.lastById.set(id, nowMs);
    if (ring) {
      ring.t[ring.i] = nowMs;
      ring.i = (ring.i + 1) % ring.t.length;
      ring.lastMs = nowMs;
    }
    return true;
  }

  reset(): void {
    this.lastById.clear();
    this.rings.clear();
  }
}

export interface PooledVoice {
  id: string;
  priority: Priority;
  /** Audio-clock time the voice started / is scheduled to end. */
  start: number;
  end: number;
  /** Fade out and silence immediately (voice stolen). */
  stop(): void;
  /** Free graph resources after the voice finished or was stolen. */
  dispose(): void;
}

/** Tracks active one-shot voices; enforces a concurrency cap by stealing the oldest low-priority voice. */
export class VoicePool<V extends PooledVoice = PooledVoice> {
  private voices: V[] = [];

  constructor(readonly max = 24) {}

  get size(): number {
    return this.voices.length;
  }

  /** Remove finished voices. */
  prune(now: number): void {
    const list = this.voices;
    let w = 0;
    for (let r = 0; r < list.length; r++) {
      const v = list[r];
      if (v.end <= now) v.dispose();
      else list[w++] = v;
    }
    list.length = w;
  }

  /**
   * Try to make room for a new voice of the given priority. Returns false when the pool is full of
   * more important voices (the new sound should be dropped).
   */
  admit(priority: Priority, now: number): boolean {
    this.prune(now);
    if (this.voices.length < this.max) return true;
    let victim = -1;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      if (v.priority > priority) continue;
      if (victim < 0) victim = i;
      else {
        const b = this.voices[victim];
        if (v.priority < b.priority || (v.priority === b.priority && v.start < b.start)) victim = i;
      }
    }
    if (victim < 0) return false;
    const [stolen] = this.voices.splice(victim, 1);
    stolen.stop();
    stolen.dispose();
    return true;
  }

  add(v: V): void {
    this.voices.push(v);
  }

  /** Stop everything (e.g. on dispose). */
  clear(): void {
    for (const v of this.voices) {
      v.stop();
      v.dispose();
    }
    this.voices.length = 0;
  }
}

export interface PendingStinger {
  id: string;
  rank: number;
  due: number;
}

/**
 * Jingle arbitration. Many gameplay moments fire several jingles at once (mission complete + reward
 * granted + crate opened). Rules:
 *  - a jingle is dropped if an equal-or-higher ranked one started within `blockMs`;
 *  - low-ranked jingles (rank <= `deferRank`) wait `holdMs` so a bigger one arriving in the same
 *    moment can replace them;
 *  - a higher-ranked jingle cancels pending lower-ranked ones.
 */
export class StingerArbiter {
  private lastRank = 0;
  private lastAt = Number.NEGATIVE_INFINITY;
  private pending: PendingStinger | null = null;

  constructor(
    private readonly holdMs = 90,
    private readonly blockMs = 700,
    private readonly deferRank = 1,
  ) {}

  /** @returns 'play' (start now), 'defer' (held briefly) or 'drop'. */
  request(id: string, rank: number, nowMs: number): 'play' | 'defer' | 'drop' {
    if (nowMs - this.lastAt < this.blockMs && this.lastRank >= rank) return 'drop';
    if (this.pending && this.pending.rank >= rank && nowMs < this.pending.due) {
      // a pending jingle of equal / higher rank already covers this moment
      return 'drop';
    }
    if (rank <= this.deferRank) {
      this.pending = { id, rank, due: nowMs + this.holdMs };
      return 'defer';
    }
    if (this.pending && this.pending.rank < rank) this.pending = null;
    this.lastRank = rank;
    this.lastAt = nowMs;
    return 'play';
  }

  /** Call periodically; returns a deferred jingle that is now due and still allowed, else null. */
  flush(nowMs: number): PendingStinger | null {
    const p = this.pending;
    if (!p || nowMs < p.due) return null;
    this.pending = null;
    if (nowMs - this.lastAt < this.blockMs && this.lastRank >= p.rank) return null;
    this.lastRank = p.rank;
    this.lastAt = nowMs;
    return p;
  }

  reset(): void {
    this.pending = null;
    this.lastRank = 0;
    this.lastAt = Number.NEGATIVE_INFINITY;
  }
}

/** Perceptual volume curve: settings slider 0..1 -> linear gain. */
export function volumeCurve(v: number): number {
  if (!(v > 0)) return 0; // also catches NaN / undefined from odd saves
  return Math.pow(v > 1 ? 1 : v, 1.7);
}

export interface Spatial {
  /** Linear gain 0..1 from distance. */
  gain: number;
  /** Stereo pan -1..1. */
  pan: number;
}

export const SPATIAL = { refDist: 14, maxDist: 90, panWidth: 26, maxPan: 0.7 } as const;

/**
 * Distance attenuation + stereo pan for a source offset (dx, dz) from the listener, given the
 * camera's ground-plane right vector (rightX, rightZ) (see ARCHITECTURE "Camera & movement").
 */
export function spatialize(dx: number, dz: number, rightX: number, rightZ: number): Spatial {
  const d = Math.sqrt(dx * dx + dz * dz);
  let gain = 1;
  if (d > SPATIAL.refDist) {
    const k = 1 - (d - SPATIAL.refDist) / (SPATIAL.maxDist - SPATIAL.refDist);
    gain = k <= 0 ? 0 : Math.pow(k, 1.5);
  }
  let pan = 0;
  if (d > 0.5) {
    const side = dx * rightX + dz * rightZ;
    pan = Math.max(-1, Math.min(1, side / SPATIAL.panWidth)) * SPATIAL.maxPan;
  }
  return { gain, pan };
}
