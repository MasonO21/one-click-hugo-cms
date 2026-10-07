/**
 * Gameplay event -> sound request mapping. Pure functions (no WebAudio, no Game) so the whole table
 * is unit-testable. `EVENT_SOUNDS` is also the subscription list of the AudioManager.
 */
import type { GameEvents } from '../core/events';
import type { SoundId } from './ids';

export interface SoundRequest {
  id: SoundId;
  /** World position (for stereo pan / distance attenuation). */
  x?: number;
  z?: number;
  /** Linear volume multiplier (default 1). */
  volume?: number;
  /** Playback-rate multiplier (default 1). */
  pitch?: number;
}

/** Production gains at least this big still get a collect blip (ticks of small production stay silent). */
export const BIG_PRODUCTION_GAIN = 40;

/** Drop-bag resource -> gather sound, used when the node model is unrecognised. */
const DROP_SOUND: Record<string, SoundId> = {
  wood: 'gather_wood',
  stone: 'gather_stone',
  coal: 'gather_stone',
  fiber: 'gather_plant',
  food: 'gather_plant',
  biomass: 'gather_plant',
  crystal: 'gather_crystal',
  iron: 'gather_metal',
  copper: 'gather_metal',
  steel: 'gather_metal',
  titanium: 'gather_metal',
  electronics: 'gather_metal',
};

/**
 * Which gather sound a harvested node makes. Matches by node model first (tree/rock/bush/crystal/
 * ore...), then by its main drop resource, finally falls back to stone.
 */
export function gatherSoundId(model: string, drop?: Readonly<Record<string, number | undefined>>): SoundId {
  const m = model.toLowerCase();
  if (/tree|log|wood|pine|stump/.test(m)) return 'gather_wood';
  if (/crystal|gem|ice/.test(m)) return 'gather_crystal';
  if (/bush|grass|plant|pod|berry|fiber|fern|mushroom|reed|flower|bio/.test(m)) return 'gather_plant';
  if (/ore|scrap|titan|metal|iron|copper|steel|alloy/.test(m)) return 'gather_metal';
  if (/rock|stone|boulder|coal|pebble/.test(m)) return 'gather_stone';
  if (drop) {
    let best: SoundId | null = null;
    let bestAmt = -1;
    for (const k in drop) {
      const amt = drop[k] ?? 0;
      const s = DROP_SOUND[k];
      if (s && amt > bestAmt) {
        best = s;
        bestAmt = amt;
      }
    }
    if (best) return best;
  }
  return 'gather_stone';
}

export interface TurretSound {
  id: SoundId;
  pitch: number;
  volume: number;
}

/** Turret / projectile kind (ProjectileKind) -> fire sound. */
export function turretSound(kind: string): TurretSound {
  switch (kind) {
    case 'flame':
      return { id: 'turret_flame', pitch: 1, volume: 0.8 };
    case 'missile':
      return { id: 'turret_missile', pitch: 1, volume: 1 };
    case 'laser':
      return { id: 'turret_laser', pitch: 1, volume: 0.9 };
    case 'plasma':
      return { id: 'turret_plasma', pitch: 1, volume: 1 };
    case 'rail':
      return { id: 'turret_rail', pitch: 1, volume: 1 };
    case 'cannon':
      return { id: 'turret_cannon', pitch: 1, volume: 1 };
    case 'drone':
      return { id: 'turret_laser', pitch: 1.35, volume: 0.6 };
    case 'arrow':
      return { id: 'turret_bullet', pitch: 1.25, volume: 0.7 };
    case 'bullet':
    default:
      return { id: 'turret_bullet', pitch: 1, volume: 0.9 };
  }
}

/** Explosion loudness from splash radius (cells): small pops are quiet, big blasts are warm and full. */
export function explosionVolume(splash: number): number {
  return Math.max(0.45, Math.min(1.2, 0.45 + splash * 0.22));
}

type Mapper<K extends keyof GameEvents> = (p: GameEvents[K]) => SoundRequest | null;
type EventSoundTable = { [K in keyof GameEvents]?: Mapper<K> };

const at = (id: SoundId, x?: number, z?: number, volume?: number, pitch?: number): SoundRequest => ({ id, x, z, volume, pitch });
const plain = (id: SoundId, volume?: number, pitch?: number): SoundRequest => ({ id, volume, pitch });

/** The event table. Add a handler here to give a new gameplay event a sound. */
export const EVENT_SOUNDS: EventSoundTable = {
  // gathering
  'gather:hit': (p) => at(gatherSoundId(p.model, p.drop), p.x, p.z),
  'player:deposit': () => plain('deposit'),
  'resource:gained': (p) => {
    switch (p.source) {
      case 'gather':
        return at('collect', p.x, p.z, 0.55);
      case 'loot':
      case 'drop':
        return at('collect', p.x, p.z);
      case 'trade':
        return at('coin', p.x, p.z);
      case 'production':
        return p.amount >= BIG_PRODUCTION_GAIN ? at('collect', p.x, p.z, 0.6) : null;
      // reward / offline / refund / purchase / craft are covered by their own sounds
      default:
        return null;
    }
  },

  // construction
  'building:placed': () => plain('place'),
  'building:moved': () => plain('place', 0.8, 1.1),
  'building:completed': () => plain('build_complete'),
  'building:upgraded': () => plain('upgrade'),
  'building:removed': () => plain('remove'),

  // progression
  'craft:queued': () => plain('craft_start'),
  'craft:completed': () => plain('craft_done'),
  'research:completed': () => plain('research_done'),
  'mission:completed': () => plain('mission_done'),
  'mission:claimed': () => plain('coin', 0.8),
  'colony:tierUp': () => plain('tier_up'),
  'season:levelUp': () => plain('level_up'),
  'colonist:skillUp': () => plain('level_up', 0.5, 1.2),
  'colonist:recruited': () => plain('recruit'),
  'survivor:rescued': () => plain('recruit'),
  'boost:started': () => plain('upgrade', 0.7),
  'iap:purchased': () => plain('reward'),

  // rewards
  'reward:granted': () => plain('reward'),
  'daily:claimed': () => plain('reward'),
  'offline:claimed': () => plain('reward'),
  'vehicle:unlocked': () => plain('reward'),
  'combat:rewardClaimed': () => plain('crate_open'),
  'world:poiLooted': () => plain('crate_open'),
  'spin:result': () => plain('spin_win'),

  // combat
  'combat:warning': () => plain('alarm'),
  'combat:started': () => plain('attack_start'),
  'combat:ended': () => plain('victory'),
  'turret:fired': (p) => {
    const t = turretSound(p.kind);
    return at(t.id, p.x, p.z, t.volume, t.pitch);
  },
  'alien:hit': (p) => at('alien_hit', p.x, p.z),
  'alien:killed': (p) => at('alien_die', p.x, p.z),
  'projectile:impact': (p) => (p.splash > 0 ? at('explosion', p.x, p.z, explosionVolume(p.splash)) : null),
  'shield:hit': (p) => at('shield_hit', p.x, p.z),
  'player:damaged': () => plain('player_hurt'),
  'player:downed': () => plain('player_hurt', 1, 0.75),
  'player:backpackFull': () => plain('ui_error', 0.8),
  'resource:insufficient': () => plain('ui_error', 0.8),

  // world
  'world:regionDiscovered': () => plain('discover'),
  'world:poiDiscovered': () => plain('discover', 0.7, 1.12),
  'world:eventStarted': (p) => at('discover', p.x, p.z, 0.8, 0.9),
  'world:fastTravel': () => plain('teleport'),
  'vehicle:mounted': () => plain('vehicle_start'),

  // presentation
  'ui:open': (p) => (p.panel === 'victory' ? null : plain('ui_open')),
  'ui:celebrate': () => plain('celebrate'),
};

/** Event names the audio layer subscribes to (derived from the table). */
export const MAPPED_EVENTS = Object.keys(EVENT_SOUNDS) as (keyof GameEvents)[];

/** Map one gameplay event to a sound request (or null when it is silent). */
export function soundForEvent<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): SoundRequest | null {
  const fn = EVENT_SOUNDS[type] as Mapper<K> | undefined;
  return fn ? fn(payload) : null;
}
