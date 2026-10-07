/**
 * Sound id catalog. The first nine groups mirror the "Sound ids" list in docs/ARCHITECTURE.md;
 * `discover` is an audio-owned extension (region / point-of-interest discovery sting).
 *
 * Pure data — safe to import from tests and from the dev sound board.
 */
export const SOUND_CATEGORIES = {
  ui: ['ui_click', 'ui_open', 'ui_close', 'ui_error', 'ui_tab'],
  gather: ['gather_wood', 'gather_stone', 'gather_plant', 'gather_crystal', 'gather_metal'],
  build: ['place', 'build_complete', 'upgrade', 'remove', 'deposit'],
  rewards: ['collect', 'coin', 'reward', 'crate_open', 'celebrate', 'level_up', 'tier_up'],
  progress: ['craft_start', 'craft_done', 'research_done', 'mission_done', 'discover'],
  combat: [
    'alarm', 'attack_start', 'victory',
    'turret_bullet', 'turret_flame', 'turret_missile', 'turret_laser', 'turret_plasma', 'turret_rail', 'turret_cannon',
    'alien_hit', 'alien_die', 'explosion', 'shield_hit', 'player_hurt',
  ],
  world: ['spin_tick', 'spin_win', 'door', 'vehicle_start', 'teleport', 'recruit'],
} as const;

export type SoundCategory = keyof typeof SOUND_CATEGORIES;
export type SoundId = (typeof SOUND_CATEGORIES)[SoundCategory][number];

export const SOUND_IDS: readonly SoundId[] = (Object.values(SOUND_CATEGORIES) as readonly (readonly SoundId[])[]).flat();

const ID_SET: ReadonlySet<string> = new Set(SOUND_IDS);

/** Forgiving aliases so a system that emits a slightly different id still gets a sound. */
export const SOUND_ALIASES: Readonly<Record<string, SoundId>> = {
  click: 'ui_click',
  tap: 'ui_click',
  open: 'ui_open',
  close: 'ui_close',
  error: 'ui_error',
  tab: 'ui_tab',
  chop: 'gather_wood',
  mine: 'gather_stone',
  build: 'place',
  built: 'build_complete',
  complete: 'build_complete',
  upgraded: 'upgrade',
  craft: 'craft_start',
  research: 'research_done',
  mission: 'mission_done',
  levelup: 'level_up',
  tierup: 'tier_up',
  warning: 'alarm',
  hurt: 'player_hurt',
  die: 'alien_die',
  win: 'spin_win',
  tick: 'spin_tick',
  fanfare: 'tier_up',
  chest: 'crate_open',
};

/** Resolve a (possibly aliased) id to a known sound id, or null when unknown. */
export function resolveSoundId(id: string): SoundId | null {
  if (ID_SET.has(id)) return id as SoundId;
  return SOUND_ALIASES[id] ?? null;
}

export function isSoundId(id: string): id is SoundId {
  return ID_SET.has(id);
}
