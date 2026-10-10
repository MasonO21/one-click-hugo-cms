/**
 * Combat — shared type extensions (declaration merging) and tuning constants.
 *
 * All merged fields are optional so other agents can keep constructing plain objects; the combat
 * pools always initialise every field so V8 hidden classes stay stable in hot loops.
 */
import { CELL } from '../../core/constants';
import type { CombatPhase, Id } from '../../core/state';
import type { Reward } from '../../data/schema';

declare module '../../core/state' {
  interface Alien {
    /** Wild alien (nest / world event): never part of an invasion, leashed to (homeX, homeZ). */
    wild?: boolean;
    homeX?: number;
    homeZ?: number;
    /** Wild: idle wander point. */
    wx?: number;
    wz?: number;
    /** Wild: walking back home after leaving the leash. */
    returning?: boolean;
    /** Smoothed velocity (world units / s) — render may use it for walk-cycle speed. */
    vx?: number;
    vz?: number;
    /** Retreating after the attack ended: untargetable, despawns shortly. */
    retreat?: boolean;
    /** Seconds until the next target re-evaluation. */
    think?: number;
    /** Cached `AlienDef.flying`. */
    air?: boolean;
    /** Body radius in world units (hits, separation). */
    rad?: number;
    /** Swarm queens: broods summoned so far (invasion queens stop at TUNE.QUEEN_BROODS / BOSS_BROODS). */
    broods?: number;
  }
  interface Projectile {
    /** Aim point (world units). Homing projectiles update it to the target's position each frame. */
    tx?: number;
    tz?: number;
    /** Who fired (kill credit). */
    by?: 'turret' | 'player' | 'trap' | 'drone' | 'alien';
    /** Firing building id (drones return to it); -1 = player / alien. */
    src?: Id;
    /** Drones: 0 = outbound, 1 = returning to the pad. */
    leg?: number;
    /** Friendly projectiles: which aliens can be hit (HIT_GROUND | HIT_AIR). */
    mask?: number;
    /** Vertical gravity for lobbed shots (cannon, alien spit). */
    g?: number;
    /** Horizontal speed (world units / s). */
    speed?: number;
  }
  interface CombatState {
    /** Warning length (s) used when the scheduled attack begins (tutorial uses a shorter one). */
    warnFor?: number;
    /** playTime when the current attack started. */
    attackStartedAt?: number;
    /** Extra reward fraction for the current attack (+0.1 when started early). */
    bonus?: number;
    /** Invasion aliens spawned (or queued) for the current wave, incl. queen minions (UI progress). */
    waveTotal?: number;
    /** The big alien the player tapped: turrets in range shoot it first until `focusUntil` (playTime). Transient. */
    focusId?: number | null;
    focusUntil?: number;
  }
}

declare module '../../core/events' {
  interface GameEvents {
    /** Any combat phase transition. */
    'combat:phase': { phase: CombatPhase; prev: CombatPhase };
    /** The attack ended early because the core went down — aliens retreated (half reward, no loss). */
    'combat:retreated': { wave: number };
    /** The player's weapon fired (render: muzzle flash / tracer; audio: shot). Throttled. */
    'player:fired': { kind: string; x: number; z: number; tx: number; tz: number };
    /** An alien struck (melee) or spat (ranged) at a building (`target` id) or the player (-1). Throttled. */
    'alien:attack': { id: Id; def: string; x: number; z: number; tx: number; tz: number; target: Id; ranged: boolean };
  }
}

/** Hit masks for target filtering. */
export const HIT_GROUND = 1;
export const HIT_AIR = 2;
export const HIT_ALL = HIT_GROUND | HIT_AIR;

/** `Alien.target` value meaning "the player". */
export const TARGET_PLAYER = -1;

/** Payload of `ui:open { panel: 'victory' }`. */
export interface VictoryInfo {
  wave: number;
  kills: number;
  reward: Reward;
  /** 'breach' = the core went down and the aliens retreated (half reward). */
  reason: 'victory' | 'breach' | 'timeout';
}

/** Tuning knobs (world units unless noted). */
export const TUNE = {
  /** Flight height of flyers. */
  FLY_Y: 2.4,
  /** Seconds of the 'dying' animation before removal. */
  DYING_TIME: 0.7,
  /** Edge spawn materialise time, burrow emerge time. */
  SPAWN_TIME: 0.45,
  BURROW_TIME: 1.2,
  /** Retreating aliens despawn after this many seconds. */
  RETREAT_TIME: 3.5,
  /** Target re-evaluation interval (s). */
  THINK: 0.45,
  /** Invasion aliens attack the player within this distance; give up beyond PLAYER_DROP. */
  PLAYER_AGGRO: 2 * CELL,
  PLAYER_DROP: 3.5 * CELL,
  /** Aliens hit the player softly (cozy). */
  PLAYER_DMG_MULT: 0.5,
  /** Knock-out duration (s). */
  KO_SECONDS: 5,
  /** Brutes look for wall pieces within this distance. */
  WALL_SEEK: 14 * CELL,
  /** Wild aliens: leash radius around home and idle wander radius. */
  LEASH: 20 * CELL,
  WANDER: 3 * CELL,
  /** Spawn ring = colony radius + this (cells); flow field = colony radius + FIELD_MARGIN (cells). */
  SPAWN_RING_EXTRA: 6,
  FIELD_MARGIN: 12,
  /** Flow-field cost of a cell blocked by a building (aliens bash through). */
  BASH_COST: 8,
  /** Debounce before rebuilding the flow field after building changes (s). */
  FIELD_DEBOUNCE: 0.4,
  /** Hard caps (performance). */
  MAX_ALIENS: 240,
  MAX_WAVE: 200,
  MAX_PROJECTILES: 700,
  /** The first N waves approach from the side the turrets cover (tutorial: the turret wins). */
  EARLY_WAVES: 3,
  /** Seconds between aliens of the same group... */
  STAGGER: 0.8,
  /** ...but a whole group spawns within this many seconds (large late-game groups arrive as swarms). */
  GROUP_WINDOW: 7,
  /** Victory celebration before returning to peace (s). */
  VICTORY_LINGER: 8,
  /** Safety net: after this long (once all spawned) remaining aliens flee and the wave counts as won. */
  ATTACK_TIMEOUT: 180,
  /**
   * An invasion Swarm Queen summons at most this many broods (a boss queen BOSS_BROODS), and no queen summons once the
   * attack is QUEEN_QUIET_AFTER seconds old: a queen the turrets could not reach kept a raid going for five minutes.
   */
  QUEEN_BROODS: 4,
  BOSS_BROODS: 6,
  QUEEN_QUIET_AFTER: 100,
  /**
   * Stragglers: when only a few invaders remain (<= max(2, 25% of the wave)) and nothing was killed,
   * spawned or hurt for this long, they flee and the wave counts as won (no minutes-long nibbling at the core).
   */
  STALL_SECONDS: 40,
  /** Manual turrets fire 2x while the player is this close (cells -> world). */
  MANUAL_RANGE: 3 * CELL,
  /** Trap damage tick (s). */
  TRAP_TICK: 0.25,
  /** Slow duration from projectiles (s). */
  SLOW_TIME: 2,
  /** Turret head turn speed (rad / s). */
  TURN_SPEED: 9,
  /** Separation strength between aliens. */
  SEPARATION: 1.6,
  /** Seconds turrets keep focusing a tapped boss (re-tap to renew). */
  FOCUS_SECONDS: 30,
} as const;

/** Travelling projectile speeds (world units / s). Hitscan kinds are absent. */
export const PROJECTILE_SPEED: Record<string, number> = {
  arrow: 26,
  bullet: 44,
  flame: 16,
  missile: 20,
  plasma: 30,
  cannon: 22,
  drone: 15,
  spit: 13,
};

/** Hitscan projectile kinds (instant beam). */
export function isHitscan(kind: string): boolean {
  return kind === 'laser' || kind === 'rail';
}
