/**
 * Achievements — the Colony Journal's content. Progress comes from what the game already counts (the mission system's
 * lifetime counters and plain state, see sim/meta/achievementRules.ts); nothing here needs new bookkeeping.
 *
 * Shape:
 *  - Tiered LINES earn bronze / silver / gold (`ach_<line>_<medal>`): bronze in the first hours, silver mid-game,
 *    gold a long-term goal (a full game, Tier 0 -> Titanium, is ~45 h of play).
 *  - ONE-OFFS earn a single 'special' medal (`ach_<name>`): bosses, colony tiers, a legendary colonist.
 *  - The ids are what Game Center / Google Play Games are mapped to (docs/MOBILE.md): never rename one.
 *
 * Rewards are cozy and sized to when you would typically earn them: season XP and modest resources or crates of that
 * stage. Nova (premium currency) only comes with silver / gold and the one-offs, ~300 in total (tests cap it at 400).
 */
import type { AchievementCategory, AchievementDef, AchievementMedal, AchievementSource, Reward } from './schema';
import { TIERS } from './tiers';

/** Metadata of the nine journal sections, in display order. */
export const ACHIEVEMENT_CATEGORIES: { id: AchievementCategory; name: string; icon: string; blurb: string }[] = [
  { id: 'builder', name: 'Builder', icon: '🏗️', blurb: 'Raise it, upgrade it, gather for it.' },
  { id: 'explorer', name: 'Explorer', icon: '🧭', blurb: 'Roam the planet and see what is out there.' },
  { id: 'defender', name: 'Defender', icon: '🛡️', blurb: 'Keep the colony safe and cozy.' },
  { id: 'scientist', name: 'Scientist', icon: '🔬', blurb: 'Curiosity pays off, tier after tier.' },
  { id: 'community', name: 'Community', icon: '🧑‍🤝‍🧑', blurb: 'A colony is its people.' },
  { id: 'crafter', name: 'Crafter', icon: '🛠️', blurb: 'Make things, by hand or by machine.' },
  { id: 'expeditions', name: 'Expeditions', icon: '🥾', blurb: 'Squads on the road and the Star Chart.' },
  { id: 'collector', name: 'Collector', icon: '📚', blurb: 'One of everything, please.' },
  { id: 'veteran', name: 'Veteran', icon: '⭐', blurb: 'Time spent and days returned.' },
];

const MEDALS = ['bronze', 'silver', 'gold'] as const;

/** `{n}` formatted with thousands separators ("50,000"). */
const num = (n: number): string => n.toLocaleString('en-US');

interface LineSpec {
  /** Line id: ids become `ach_<id>_<medal>`. */
  id: string;
  category: AchievementCategory;
  name: string;
  icon: string;
  art?: string;
  source: AchievementSource;
  unit?: AchievementDef['unit'];
  /** One-line description for a threshold. */
  desc: (n: string, raw: number) => string;
  /** Bronze, silver, gold. */
  steps: [number, Reward][];
}

function line(s: LineSpec): AchievementDef[] {
  return s.steps.map(([target, reward], i) => ({
    id: `ach_${s.id}_${MEDALS[i]}`,
    line: s.id,
    category: s.category,
    name: s.name,
    description: s.desc(num(target), target),
    medal: MEDALS[i] as AchievementMedal,
    icon: s.icon,
    art: s.art,
    source: s.source,
    target,
    reward,
    unit: s.unit,
  }));
}

interface OneSpec {
  /** `ach_<id>`. */
  id: string;
  category: AchievementCategory;
  name: string;
  description: string;
  icon: string;
  art?: string;
  source: AchievementSource;
  target: number;
  reward: Reward;
  unit?: AchievementDef['unit'];
}

function one(s: OneSpec): AchievementDef {
  return { ...s, id: `ach_${s.id}`, line: s.id, medal: 'special' };
}

const counter = (type: Extract<AchievementSource, { kind: 'counter' }>['type'], target = '*'): AchievementSource => ({ kind: 'counter', type, target });
const metric = (m: Extract<AchievementSource, { kind: 'metric' }>['metric']): AchievementSource => ({ kind: 'metric', metric: m });

// ------------------------------------------------------------------------------------------------------------------
// Tiered lines
// ------------------------------------------------------------------------------------------------------------------

const LINES: AchievementDef[] = [
  // ---- Builder
  ...line({
    id: 'handy_hands', category: 'builder', name: 'Handy Hands', icon: '🔨', art: 'hud:build', source: counter('build'),
    desc: (n) => `Finish ${n} buildings and pieces`,
    steps: [
      [25, { xp: 30, resources: { wood: 80, stone: 40 } }],
      [250, { xp: 150, nova: 3, items: { defense_crate: 1 } }],
      [1500, { xp: 400, nova: 8, items: { alloy_crate: 1, mystery_crate: 1 } }],
    ],
  }),
  ...line({
    id: 'lumberjack', category: 'builder', name: 'Lumberjack', icon: '🪵', art: 'resource:wood', source: counter('gather', 'wood'),
    desc: (n) => `Gather ${n} wood`,
    steps: [
      [500, { xp: 30, items: { timber_bundle: 1 } }],
      [5000, { xp: 150, nova: 3, items: { timber_bundle: 2, supply_crate: 1 } }],
      [50000, { xp: 400, nova: 8, items: { mystery_crate: 2 } }],
    ],
  }),
  ...line({
    id: 'upgrade_fan', category: 'builder', name: 'Upgrade Fan', icon: '⬆️', art: 'building:workshop', source: counter('upgrade'),
    desc: (n) => `Upgrade buildings ${n} times`,
    steps: [
      [5, { xp: 30, resources: { wood: 60, fiber: 40 } }],
      [50, { xp: 150, nova: 3, items: { ore_bundle: 1 } }],
      [300, { xp: 400, nova: 8, items: { tech_crate: 1, steel_bundle: 1 } }],
    ],
  }),

  // ---- Explorer
  ...line({
    id: 'treasure_hunter', category: 'explorer', name: 'Treasure Hunter', icon: '🎒', art: 'poi:supply_cache', source: counter('loot'),
    desc: (n) => `Loot ${n} points of interest`,
    steps: [
      [5, { xp: 35, items: { supply_crate: 1 } }],
      [25, { xp: 150, nova: 3, items: { mystery_crate: 1 } }],
      [60, { xp: 400, nova: 8, items: { alloy_crate: 1, mystery_crate: 1 } }],
    ],
  }),
  ...line({
    id: 'cartographer', category: 'explorer', name: 'Cartographer', icon: '🗺️', art: 'hud:map', source: metric('regions'),
    desc: (n, raw) => (raw >= 8 ? 'Discover every region of the planet' : `Discover ${n} regions of the planet`),
    steps: [
      [3, { xp: 40, resources: { food: 60, water: 60 } }],
      [5, { xp: 160, nova: 3, items: { defense_crate: 1 } }],
      [8, { xp: 450, nova: 10, items: { titan_crate: 1 } }],
    ],
  }),

  // ---- Defender
  ...line({
    id: 'raid_survivor', category: 'defender', name: 'Raid Survivor', icon: '🛡️', art: 'hud:defense', source: counter('defend'),
    desc: (n, raw) => (raw === 1 ? 'Survive an alien raid' : `Survive ${n} alien raids`),
    steps: [
      [1, { xp: 40, resources: { wood: 60, stone: 40 } }],
      [15, { xp: 170, nova: 3, items: { defense_crate: 2 } }],
      [75, { xp: 450, nova: 10, items: { alloy_crate: 1, nano_crate: 1 } }],
    ],
  }),
  ...line({
    id: 'alien_hunter', category: 'defender', name: 'Alien Hunter', icon: '👾', art: 'alien:crawler', source: counter('kill'),
    desc: (n) => `Defeat ${n} aliens`,
    steps: [
      [25, { xp: 35, resources: { wood: 60, fiber: 40 }, items: { bandage: 2 } }],
      [250, { xp: 160, nova: 3, items: { medkit: 3, ore_bundle: 1 } }],
      [2500, { xp: 450, nova: 10, items: { regen_gel: 2, nano_crate: 1 } }],
    ],
  }),

  // ---- Scientist
  ...line({
    id: 'researcher', category: 'scientist', name: 'Researcher', icon: '🔬', art: 'hud:tech', source: metric('research'),
    desc: (n, raw) => (raw >= 90 ? 'Complete every research project' : `Complete ${n} research projects`),
    steps: [
      [5, { xp: 40, rp: 15 }],
      [35, { xp: 170, nova: 3, items: { research_chip: 2 } }],
      [90, { xp: 500, nova: 12, items: { quantum_chip: 1, data_core: 2 } }],
    ],
  }),

  // ---- Community
  ...line({
    id: 'welcome_home', category: 'community', name: 'Welcome Home', icon: '🏡', art: 'hud:population', source: metric('colonists'),
    desc: (n) => `Have ${n} colonists living in your colony`,
    steps: [
      [3, { xp: 35, resources: { food: 60, water: 60 } }],
      [15, { xp: 170, nova: 3, items: { rations_crate: 2 } }],
      [40, { xp: 450, nova: 10, items: { colonist_crate: 1, nano_crate: 1 } }],
    ],
  }),

  ...line({
    id: 'good_neighbour', category: 'community', name: 'Good Neighbour', icon: '🤝', art: 'hud:wish', source: counter('wish'),
    desc: (n, raw) => (raw === 1 ? 'Grant a colonist’s wish' : `Grant ${n} colonists’ wishes`),
    steps: [
      [3, { xp: 40, resources: { food: 80, water: 60 } }],
      [25, { xp: 220, nova: 4, items: { rations_crate: 2 } }],
      [100, { xp: 520, nova: 10, items: { colonist_crate: 1, nano_crate: 1 } }],
    ],
  }),

  // ---- Crafter
  ...line({
    id: 'maker', category: 'crafter', name: 'Maker', icon: '🛠️', art: 'hud:craft', source: counter('craft'),
    desc: (n) => `Craft ${n} items`,
    steps: [
      [5, { xp: 30, resources: { wood: 60, stone: 40 } }],
      [50, { xp: 150, nova: 3, items: { machine_parts: 2 } }],
      [400, { xp: 400, nova: 8, items: { robotic_core: 1, tech_crate: 1 } }],
    ],
  }),

  // ---- Expeditions
  ...line({
    id: 'trailblazers', category: 'expeditions', name: 'Trailblazers', icon: '🥾', art: 'building:radio_tower', source: counter('expedition', 'collect'),
    desc: (n, raw) => (raw === 1 ? 'Bring home an expedition haul' : `Bring home ${n} expedition hauls`),
    steps: [
      [1, { xp: 50, items: { supply_crate: 1 } }],
      [15, { xp: 180, nova: 3, items: { mystery_crate: 1 } }],
      [75, { xp: 450, nova: 10, items: { alloy_crate: 1, mystery_crate: 1 } }],
    ],
  }),
  ...line({
    id: 'star_charter', category: 'expeditions', name: 'Star Charter', icon: '🌠', art: 'poi:beacon', source: metric('charted'),
    desc: (n, raw) => (raw === 1 ? 'Chart your first Frontier site' : `Chart ${n} Frontier sites on the Star Chart`),
    steps: [
      [1, { xp: 100, items: { nano_crate: 1 } }],
      [10, { xp: 250, nova: 4, items: { titan_crate: 1 } }],
      [30, { xp: 500, nova: 12, items: { titan_crate: 2, mystery_crate: 1 } }],
    ],
  }),

  // ---- Collector
  ...line({
    id: 'town_planner', category: 'collector', name: 'Town Planner', icon: '🏘️', art: 'building:command_center', source: metric('buildingTypes'),
    desc: (n) => `Build ${n} different kinds of building`,
    steps: [
      [10, { xp: 40, resources: { wood: 80, stone: 60 } }],
      [50, { xp: 170, nova: 3, items: { steel_bundle: 1 } }],
      [120, { xp: 450, nova: 10, items: { alloy_crate: 1, nano_crate: 1 } }],
    ],
  }),
  ...line({
    id: 'bestiary', category: 'collector', name: 'Bestiary', icon: '📖', art: 'alien:flyer', source: metric('alienTypes'),
    desc: (n, raw) => (raw >= 14 ? 'Defeat every kind of alien' : `Defeat ${n} different kinds of alien`),
    steps: [
      [4, { xp: 40, items: { bandage: 2 } }],
      [9, { xp: 170, nova: 3, items: { medkit: 2 } }],
      [14, { xp: 450, nova: 10, items: { nano_injector: 1, titan_crate: 1 } }],
    ],
  }),

  // ---- Veteran
  ...line({
    id: 'time_well_spent', category: 'veteran', name: 'Time Well Spent', icon: '⏳', art: 'hud:day', source: metric('playHours'), unit: 'hours',
    desc: (n, raw) => (raw === 1 ? 'Spend an hour in your colony' : `Spend ${n} hours in your colony`),
    steps: [
      [1, { xp: 40, resources: { food: 60, water: 60 } }],
      [10, { xp: 170, nova: 4, items: { rations_crate: 2 } }],
      [50, { xp: 500, nova: 12, items: { mystery_crate: 2 } }],
    ],
  }),
  ...line({
    id: 'regular_visitor', category: 'veteran', name: 'Regular Visitor', icon: '📅', art: 'reward:daily_gift', source: metric('loginDays'),
    desc: (n) => `Collect the daily gift on ${n} different days`,
    steps: [
      [3, { xp: 40, items: { supply_crate: 1 } }],
      [7, { xp: 170, nova: 4, items: { mystery_crate: 1 } }],
      [30, { xp: 450, nova: 12, items: { mystery_crate: 2 } }],
    ],
  }),
];

// ------------------------------------------------------------------------------------------------------------------
// One-offs
// ------------------------------------------------------------------------------------------------------------------

const tierName = (i: number): string => TIERS[i]?.name ?? `Tier ${i}`;

const TIER_REWARDS: [string, string, Reward][] = [
  ['Solid Start', '🪵', { xp: 40, resources: { wood: 100, fiber: 60 } }],
  ['Rock Solid', '🪨', { xp: 80, nova: 2, items: { stone_bundle: 1 } }],
  ['Steady as Steel', '🔩', { xp: 120, nova: 3, items: { ore_bundle: 1 } }],
  ['Alloy Allies', '🛰️', { xp: 180, nova: 5, items: { tech_crate: 1 } }],
  ['Small Wonders', '✨', { xp: 250, nova: 6, items: { alloy_crate: 1 } }],
  ['Titanium Dreams', '🌟', { xp: 500, nova: 15, items: { nano_crate: 1, titan_crate: 1 } }],
];

const ONE_OFFS: AchievementDef[] = [
  one({
    id: 'boss_elder_brute', category: 'defender', name: 'Brute Force', icon: '🦣', art: 'alien:brute', source: counter('kill', 'elder_brute'), target: 1,
    description: 'Defeat an Elder Brute',
    reward: { xp: 200, nova: 6, items: { steel_bundle: 1, medkit: 2 } },
  }),
  one({
    id: 'boss_hive_mother', category: 'defender', name: "Queen's Gambit", icon: '👑', art: 'alien:queen', source: counter('kill', 'hive_mother'), target: 1,
    description: 'Defeat a Hive Mother',
    reward: { xp: 300, nova: 10, items: { alloy_crate: 1 } },
  }),
  one({
    id: 'boss_titan_prime', category: 'defender', name: 'Titanic Victory', icon: '🗿', art: 'alien:titan', source: counter('kill', 'titan_prime'), target: 1,
    description: 'Defeat Titan Prime',
    reward: { xp: 600, nova: 18, items: { titan_crate: 2 } },
  }),
  one({
    id: 'best_friends', category: 'community', name: 'Best Friends', icon: '💛', art: 'hud:wish', source: metric('bestFriends'), target: 1,
    description: 'Fill all five friendship hearts with a colonist',
    reward: { xp: 300, nova: 8, items: { rations_crate: 1 } },
  }),
  one({
    id: 'legend', category: 'community', name: 'Living Legend', icon: '🌟', art: 'hud:crew', source: metric('legendary'), target: 1,
    description: 'Welcome a legendary colonist',
    reward: { xp: 400, nova: 12, items: { colonist_crate: 1 } },
  }),
  one({
    id: 'say_cheese', category: 'community', name: 'Say Cheese!', icon: '📸', art: 'hud:photo', source: counter('photo'), target: 1,
    description: 'Take your first photo in Photo Mode',
    reward: { xp: 40, nova: 2, resources: { food: 40, water: 40 } },
  }),
  ...TIER_REWARDS.map(([name, icon, reward], i) =>
    one({
      id: `tier_${i + 1}`, category: 'scientist', name, icon, art: `tier:${i + 1}`, source: metric('colonyTier'), target: i + 1, unit: 'tier',
      description: `Reach the ${tierName(i + 1)} tier`,
      reward,
    }),
  ),
];

/** Every achievement, in display order (category by category: the lines first, then the one-offs). */
export const ACHIEVEMENTS: AchievementDef[] = (() => {
  const all = [...LINES, ...ONE_OFFS];
  const order = new Map(ACHIEVEMENT_CATEGORIES.map((c, i) => [c.id, i]));
  // stable sort by category keeps the authoring order inside each section
  return all
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (order.get(x.a.category) ?? 0) - (order.get(y.a.category) ?? 0) || x.i - y.i)
    .map((x) => x.a);
})();
