import type { ExpeditionDef, ExpeditionRules, FrontierRules } from './schema';

/**
 * Expeditions — squads of one to three colonists (and optionally a vehicle) leave from the Radio Tower for a
 * destination in a discovered region and come back after a fixed time with a haul themed by the biome.
 * After Titanium the Frontier opens: endless trips to uncharted sites beyond the eight regions, each one charted
 * on a persistent Star Chart with milestone rewards.
 *
 * BALANCE (tests/expeditions.balance.test.ts prints the table):
 *  - The yardstick is `reference[tier]`: what a colony at that tier makes per minute (the pacing model's planned
 *    economy, averaged between entering and leaving the tier, plus half its manual gathering), valued with `value`
 *    × the good's relevance at that tier (`intro`: older bulk goods count for less as the colony outgrows them).
 *  - A full squad (3 colonists, two stars, one profession match, on foot) brings home about 25–40% of that
 *    colony's hourly value per trip hour: `baseFraction` × the duration rung's efficiency × the squad bonus.
 *    Longer rungs are a little more efficient per hour (check in less often, earn a bit more).
 *  - Hauls are split by value share (`yields`) and converted to units with that tier's worth. Every share is sized
 *    so a standard haul fits the reference colony's storage (`referenceStorage`) and never brings more than about
 *    1.5 hours of the colony's own output of a good per trip hour: expeditions complement production, never replace
 *    it. That is why the higher tiers lean on what a colony at that tier is short of (research, alloy, nano,
 *    titanium) rather than on the bulk ores it already overflows with. Rare finds (crates, drones, chips,
 *    survivors) roll on top.
 *  - Rewards are valued at the destination's own tier: the newest regions are the most rewarding, older ones stay
 *    worth a quick trip (and their survivors and crates never stop being nice).
 */

const MIN = 60;
const HOUR = 3600;

/**
 * The pacing model's planned economy at the END of each tier, net per minute (tests/data.pacing.test.ts prints these
 * as `economy@tierN`). Index 6 (Titanium) has no tier-up plan: the colony keeps growing ~25% past the Nano build-out.
 */
const PLANNED_ECONOMY: Record<string, number>[] = [
  { food: 6, wood: 6, fiber: 2, water: 3 },
  { food: 34, wood: 40, fiber: 11, water: 19, rp: 14, stone: 14 },
  { food: 87, wood: 39, fiber: 11, water: 69, rp: 61, stone: 29, iron: 4, copper: 8, coal: 9, steel: 12 },
  { food: 212, wood: 120, fiber: 21, water: 202, rp: 140, stone: 175, iron: 85, copper: 63, coal: 55, steel: 58, crystal: 4, electronics: 19, alloy: 12 },
  { food: 494, wood: 314, fiber: 112, water: 435, rp: 473, stone: 807, iron: 506, copper: 304, coal: 339, steel: 75, crystal: 26, electronics: 26, alloy: 20, energy_cell: 10, nano: 4, biomass: 17 },
  { food: 1608, wood: 832, fiber: 320, water: 1321, rp: 862, stone: 1302, iron: 1175, copper: 671, coal: 767, steel: 38, crystal: 54, electronics: 28, alloy: 20, energy_cell: 10, nano: 6, biomass: 16, titanium: 26 },
];
const TITANIUM_GROWTH = 1.25;

/** Manual gathering per active minute by tier (the pacing model's MANUAL table). */
const MANUAL_GATHERING: Record<string, number>[] = [
  { wood: 55, stone: 22, fiber: 18 },
  { wood: 40, stone: 28, fiber: 25, iron: 8, copper: 4, coal: 4 },
  { wood: 28, stone: 32, fiber: 16, iron: 18, copper: 10, coal: 10, crystal: 6 },
  // + a little biomass: the Toxic Marsh opens at Steel (the pacing table only starts counting it at Alloy)
  { stone: 30, iron: 22, copper: 14, coal: 14, crystal: 10, biomass: 4 },
  { stone: 20, iron: 20, copper: 16, coal: 16, crystal: 16, biomass: 6 },
  { crystal: 22, iron: 20, biomass: 8, titanium: 5 },
  { crystal: 25, titanium: 8, biomass: 8 },
];

/** Reference colony output per minute at each tier (mean of entering and leaving the tier + half the hand gathering). */
function referenceColonies(): Record<string, number>[] {
  const end = [...PLANNED_ECONOMY, Object.fromEntries(Object.entries(PLANNED_ECONOMY[5]).map(([k, v]) => [k, v * TITANIUM_GROWTH]))];
  const out: Record<string, number>[] = [];
  for (let t = 0; t < end.length; t++) {
    const a = end[Math.max(0, t - 1)];
    const b = end[t];
    const o: Record<string, number> = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) o[k] = ((a[k] ?? 0) + (b[k] ?? 0)) / 2;
    for (const [k, v] of Object.entries(MANUAL_GATHERING[t] ?? {})) o[k] = (o[k] ?? 0) + v * 0.5;
    out.push(o);
  }
  return out;
}

/** Planned storage at the end of each tier (the pacing plan's storage buildings); Titanium keeps the Nano build-out. */
const PLANNED_STORAGE: Record<string, number>[] = [
  { wood: 450, stone: 450, fiber: 300, food: 300, water: 300, iron: 100, copper: 100, coal: 100, steel: 80, electronics: 60, biomass: 60, crystal: 50, alloy: 40, energy_cell: 40, nano: 30, titanium: 30 },
  { wood: 1800, stone: 1800, fiber: 1200, food: 1700, water: 1850, iron: 100, copper: 100, coal: 100, steel: 80, electronics: 60, biomass: 60, crystal: 50, alloy: 40, energy_cell: 40, nano: 30, titanium: 30 },
  { wood: 3800, stone: 3800, fiber: 2400, food: 2900, water: 2850, iron: 2100, copper: 1600, coal: 1600, steel: 580, electronics: 60, biomass: 60, crystal: 50, alloy: 40, energy_cell: 40, nano: 30, titanium: 30 },
  { wood: 9800, stone: 9800, fiber: 6400, food: 2900, water: 2850, iron: 5100, copper: 4000, coal: 4000, steel: 3580, electronics: 1660, biomass: 660, crystal: 1250, alloy: 840, energy_cell: 40, nano: 30, titanium: 30 },
  { wood: 21800, stone: 21800, fiber: 14400, food: 10900, water: 10850, iron: 12100, copper: 10000, coal: 10000, steel: 9580, electronics: 5660, biomass: 2660, crystal: 5250, alloy: 7240, energy_cell: 3240, nano: 1630, titanium: 30 },
  { wood: 21800, stone: 21800, fiber: 14400, food: 10900, water: 10850, iron: 12100, copper: 10000, coal: 10000, steel: 45580, electronics: 27260, biomass: 12260, crystal: 23250, alloy: 25240, energy_cell: 21240, nano: 16030, titanium: 14430 },
];

/**
 * Worth of one unit in wood-equivalents. Anchored on the merchant trades and refinery recipes (150 wood → 70 iron,
 * 100 steel → 36 alloy, 9 steel + 5 crystal → 5 alloy …) and nudged up for what stays scarce (nano, titanium).
 * Research points are worth three wood so the ruins never flood the tech tree.
 */
const VALUE: Record<string, number> = {
  wood: 1, stone: 1, fiber: 1, food: 0.5, water: 0.4,
  iron: 2, copper: 2.5, coal: 2, steel: 6, electronics: 8, biomass: 6,
  crystal: 12, alloy: 25, energy_cell: 25, nano: 120, titanium: 80, rp: 3,
};

/** The tier each good becomes part of everyday colony life (see ExpeditionRules.intro). */
const INTRO: Record<string, number> = {
  wood: 0, stone: 0, fiber: 0, food: 0, water: 0,
  iron: 1, copper: 1, coal: 1, steel: 2, crystal: 2,
  electronics: 3, biomass: 3, alloy: 3, energy_cell: 4, nano: 4, titanium: 5,
};

const FRONTIER: FrontierRules = {
  unlockTier: 6,
  durations: [1 * HOUR, 4 * HOUR, 8 * HOUR],
  adjectives: [
    'Whispering', 'Amber', 'Silver', 'Sunken', 'Shimmering', 'Howling', 'Velvet', 'Starlit', 'Drifting', 'Hidden',
    'Crimson', 'Misty', 'Glowing', 'Hollow', 'Singing', 'Golden', 'Distant', 'Sleepy', 'Twilight', 'Echoing',
  ],
  // Past Titanium the colony overflows with bulk goods: uncharted sites bring what it is still short of, each with a
  // dash of its biome's colour (crystals in the spires, biomass in the bogs…).
  flavours: [
    { biome: 'crash_valley', nouns: ['Meadows', 'Downs', 'Hollows'], match: ['gatherer', 'engineer'], yields: { rp: 0.33, titanium: 0.33, alloy: 0.12, nano: 0.18, crystal: 0.04 } },
    { biome: 'pinewood_forest', nouns: ['Glade', 'Woods', 'Pines'], match: ['gatherer', 'farmer'], yields: { biomass: 0.02, titanium: 0.3, rp: 0.38, nano: 0.16, alloy: 0.12, crystal: 0.02 } },
    { biome: 'red_desert', nouns: ['Dunes', 'Mesa', 'Badlands'], match: ['miner', 'mechanic'], yields: { titanium: 0.45, alloy: 0.12, energy_cell: 0.12, rp: 0.31 } },
    { biome: 'crystal_canyon', nouns: ['Spires', 'Gorge', 'Caverns'], match: ['miner', 'scientist'], yields: { crystal: 0.04, energy_cell: 0.12, titanium: 0.32, rp: 0.4, alloy: 0.12 } },
    { biome: 'toxic_marsh', nouns: ['Bog', 'Fen', 'Mire'], match: ['farmer', 'guard'], yields: { biomass: 0.02, nano: 0.25, titanium: 0.3, rp: 0.36, alloy: 0.07 } },
    { biome: 'frozen_ridge', nouns: ['Glacier', 'Peaks', 'Icefield'], match: ['water_tech', 'scientist'], yields: { rp: 0.47, energy_cell: 0.12, titanium: 0.32, crystal: 0.04, alloy: 0.05 } },
    { biome: 'alien_ruins', nouns: ['Ruins', 'Ziggurat', 'Monoliths'], match: ['scientist', 'engineer'], yields: { rp: 0.5, nano: 0.2, titanium: 0.2, alloy: 0.1 } },
    { biome: 'titanium_highlands', nouns: ['Plateau', 'Heights', 'Crown'], match: ['miner', 'drone_tech'], yields: { titanium: 0.5, nano: 0.2, energy_cell: 0.1, rp: 0.2 } },
  ],
  finds: [
    { from: 1, chance: 0.25, perSite: 0.005, max: 0.5, reward: { items: { titan_crate: 1 } }, label: 'Titanium Crates' },
    { from: 1, chance: 0.12, reward: { nova: 5 }, label: 'Nova Crystals' },
    { from: 3, chance: 0.12, reward: { colonist: 'rare' }, label: 'Stranded explorers' },
    { from: 5, chance: 0.08, perSite: 0.003, max: 0.25, reward: { items: { quantum_chip: 1 } }, label: 'Quantum Chips' },
    { from: 10, chance: 0.08, perSite: 0.002, max: 0.2, reward: { items: { swarm_drone: 1 } }, label: 'Swarm Drone Packs' },
    { from: 15, chance: 0.05, perSite: 0.001, max: 0.1, reward: { colonist: 'epic' }, label: 'Epic pioneers' },
    { from: 20, chance: 0.08, reward: { items: { regen_gel: 2 } }, label: 'Regeneration Gel' },
    { from: 30, chance: 0.02, perSite: 0.0005, max: 0.05, reward: { colonist: 'legendary' }, label: 'Legendary wanderers' },
  ],
  milestones: [
    { count: 5, title: 'Pathfinder', reward: { items: { titan_crate: 2 }, nova: 10 } },
    { count: 10, title: 'Trailblazer', reward: { colonist: 'epic', items: { quantum_chip: 1 }, nova: 15 } },
    { count: 15, title: 'Cartographer', reward: { cosmetic: 'colonist_labcoat', items: { swarm_drone: 1 }, nova: 15 } },
    { count: 20, title: 'Star Gazer', reward: { cosmetic: 'deco_holo_trees', items: { titan_crate: 3 }, nova: 20 } },
    { count: 30, title: 'Wayfinder', reward: { colonist: 'legendary', items: { quantum_chip: 2 }, nova: 20 } },
    { count: 40, title: 'Horizon Walker', reward: { cosmetic: 'hovercraft_chrome', items: { swarm_drone: 2 }, nova: 25 } },
    { count: 50, title: 'Master of the Frontier', reward: { cosmetic: 'theme_frostbite', colonist: 'legendary', nova: 50 } },
  ],
  repeat: { every: 10, title: 'Frontier Legend', reward: { items: { titan_crate: 2, quantum_chip: 1 }, nova: 10 } },
  depthBonus: 0.005,
  depthBonusMax: 0.25,
};

export const EXPEDITION_RULES: ExpeditionRules = {
  unlockTier: 2,
  durations: [15 * MIN, 1 * HOUR, 4 * HOUR, 8 * HOUR],
  durationEfficiency: [1, 1.05, 1.1, 1.15],
  slots: [
    { tier: 2, slots: 1 },
    { tier: 4, slots: 2 },
    { tier: 6, slots: 3 },
  ],
  squadMax: 3,
  squadSize: [0, 0.5, 0.8, 1],
  baseFraction: 0.255,
  matchBonus: 0.2,
  skillBonus: 0.03,
  findMatchBonus: 0.6,
  vehicle: { speedPer: 0.06, speedMax: 0.2, haulPer: 1 / 4000, haulMax: 0.15 },
  variance: 0.1,
  mood: { adventure: 6, adventureHours: 3, weary: -3, wearyHours: 1, wearyFrom: 8 * HOUR },
  xpPerHour: 90,
  xpMax: 600,
  value: VALUE,
  intro: INTRO,
  relevance: { keep: 2, decay: 0.5, floor: 0.1 },
  reference: referenceColonies(),
  referenceStorage: [...PLANNED_STORAGE, PLANNED_STORAGE[5]],
  frontier: FRONTIER,
};

/**
 * Three destinations per region with rising duration and tier. `poi` picks the painted icon; `match` is who knows
 * the terrain (miners in the desert, scientists in the ruins, guards at the nests…).
 */
export const EXPEDITIONS: ExpeditionDef[] = [
  // ---------------------------------------------------------------- Crash Valley
  {
    id: 'cv_debris', region: 'crash_valley', name: 'Pod Debris Sweep', poi: 'supply_cache', icon: '🎁', duration: 15 * MIN, tier: 2, match: ['gatherer', 'engineer'],
    description: 'Comb the meadows around the crash site for scattered pod panels, rope and ration tins.',
    yields: { wood: 0.35, stone: 0.35, fiber: 0.2, food: 0.1 },
    finds: [{ chance: 0.3, reward: { items: { supply_crate: 1 } } }],
  },
  {
    id: 'cv_stash', region: 'crash_valley', name: 'Hidden Stash Hunt', poi: 'hidden_stash', icon: '🗝️', duration: 1 * HOUR, tier: 2, match: ['gatherer', 'logistics'],
    description: 'Someone buried supplies all over the valley under very obvious rocks. Go and find every one!',
    yields: { wood: 0.2, stone: 0.2, fiber: 0.15, iron: 0.25, copper: 0.2 },
    finds: [{ chance: 0.15, reward: { items: { mystery_crate: 1 } } }, { chance: 0.25, reward: { items: { medkit: 1 } } }],
  },
  {
    id: 'cv_beacon', region: 'crash_valley', name: 'Beacon Relay Trek', poi: 'beacon', icon: '📡', duration: 4 * HOUR, tier: 3, match: ['electrician', 'engineer'],
    description: "Hike the valley's old beacon line and tune every relay. Their logs are full of survey data, and somebody out there might answer.",
    yields: { steel: 0.2, electronics: 0.13, alloy: 0.16, iron: 0.1, copper: 0.09, coal: 0.07, stone: 0.05, rp: 0.2 },
    finds: [{ chance: 0.2, reward: { items: { tech_crate: 1 } } }, { chance: 0.2, reward: { colonist: 'common' } }],
  },
  // ---------------------------------------------------------------- Pinewood Forest
  {
    id: 'pf_berries', region: 'pinewood_forest', name: 'Glowberry Picking', poi: 'supply_cache', icon: '🫐', duration: 15 * MIN, tier: 2, match: ['farmer', 'cook'],
    description: 'Baskets out! The glowberries are ripe and the ferns are full of soft fiber.',
    yields: { food: 0.35, fiber: 0.25, wood: 0.4 },
    finds: [{ chance: 0.3, reward: { items: { rations_crate: 1 } } }, { chance: 0.25, reward: { items: { herbal_salve: 1 } } }],
  },
  {
    id: 'pf_timber', region: 'pinewood_forest', name: 'Ancient Spire Logging', poi: 'abandoned_cabin', icon: '🌲', duration: 1 * HOUR, tier: 2, match: ['gatherer', 'engineer'],
    description: 'The giant spire pines drop whole branches. Bundle them up and haul them home.',
    yields: { wood: 0.5, fiber: 0.2, stone: 0.3 },
    finds: [{ chance: 0.35, reward: { items: { timber_bundle: 2 } } }],
  },
  {
    id: 'pf_camp', region: 'pinewood_forest', name: 'Survivor Camp Search', poi: 'survivor_camp', icon: '🏕️', duration: 4 * HOUR, tier: 3, match: ['doctor', 'cook'],
    description: 'Follow the campfire smoke deep into the pines. Survivors hide out here, happy to swap tools and journals for a ride home.',
    yields: { wood: 0.05, fiber: 0.02, steel: 0.2, electronics: 0.12, iron: 0.08, crystal: 0.1, alloy: 0.13, rp: 0.3 },
    finds: [{ chance: 0.45, reward: { colonist: 'common' } }, { chance: 0.15, reward: { colonist: 'rare' } }, { chance: 0.3, reward: { items: { herbal_salve: 2 } } }],
  },
  // ---------------------------------------------------------------- Red Desert
  {
    id: 'rd_scrap', region: 'red_desert', name: 'Scrap Dune Scavenge', poi: 'crashed_ship', icon: '🚀', duration: 15 * MIN, tier: 2, match: ['miner', 'mechanic'],
    description: 'The wind uncovers new scrap every night. Dig it out before the dunes move again.',
    yields: { iron: 0.25, copper: 0.25, coal: 0.2, stone: 0.3 },
    finds: [{ chance: 0.2, reward: { items: { ore_bundle: 1 } } }],
  },
  {
    id: 'rd_wreck', region: 'red_desert', name: 'Wreck Salvage', poi: 'crashed_ship', icon: '🛠️', duration: 1 * HOUR, tier: 2, match: ['mechanic', 'engineer'],
    description: 'A half-buried freighter is full of metal. Bring wrenches. And snacks.',
    yields: { iron: 0.25, copper: 0.25, coal: 0.2, steel: 0.3 },
    finds: [{ chance: 0.3, reward: { items: { ore_bundle: 1 } } }, { chance: 0.2, reward: { items: { stone_bundle: 1 } } }],
  },
  {
    id: 'rd_outpost', region: 'red_desert', name: 'Lost Mining Outpost', poi: 'mining_outpost', icon: '⛏️', duration: 4 * HOUR, tier: 3, match: ['miner', 'logistics'],
    description: 'An abandoned mine with crates of ore still stacked by the door, and wanderers taking shelter inside.',
    yields: { iron: 0.1, copper: 0.1, coal: 0.08, steel: 0.21, electronics: 0.11, alloy: 0.15, rp: 0.25 },
    finds: [{ chance: 0.35, reward: { items: { steel_bundle: 1 } } }, { chance: 0.15, reward: { items: { defense_crate: 1 } } }, { chance: 0.2, reward: { colonist: 'common' } }],
  },
  // ---------------------------------------------------------------- Crystal Canyon
  {
    id: 'cc_shards', region: 'crystal_canyon', name: 'Shard Hunt', poi: 'meteor_crater', icon: '☄️', duration: 1 * HOUR, tier: 2, match: ['miner', 'gatherer'],
    description: 'Fallen shards glitter along the canyon floor after every crystal storm.',
    yields: { crystal: 0.05, copper: 0.25, iron: 0.25, stone: 0.3, coal: 0.15 },
    finds: [{ chance: 0.15, reward: { items: { mystery_crate: 1 } } }],
  },
  {
    id: 'cc_caves', region: 'crystal_canyon', name: 'Singing Caves', poi: 'alien_ruin', icon: '🎶', duration: 4 * HOUR, tier: 3, match: ['miner', 'scientist'],
    description: 'Caves that hum when the wind blows. The glyphs on the walls are worth copying down.',
    yields: { crystal: 0.15, copper: 0.1, iron: 0.1, electronics: 0.12, alloy: 0.13, rp: 0.4 },
    finds: [{ chance: 0.3, reward: { items: { research_chip: 2 } } }],
  },
  {
    id: 'cc_wreck', region: 'crystal_canyon', name: 'Crystal-Choked Wreck', poi: 'crashed_ship', icon: '💎', duration: 8 * HOUR, tier: 4, match: ['mechanic', 'miner'],
    description: 'A starship swallowed by crystal. Its alloy hull plates are still sealed in their crates.',
    yields: { crystal: 0.11, alloy: 0.3, energy_cell: 0.1, nano: 0.2, steel: 0.08, rp: 0.21 },
    finds: [{ chance: 0.4, reward: { items: { alloy_crate: 1 } } }, { chance: 0.15, reward: { items: { helper_drone: 1 } } }],
  },
  // ---------------------------------------------------------------- Toxic Marsh
  {
    id: 'tm_bloom', region: 'toxic_marsh', name: 'Glowing Bloom Harvest', poi: 'hidden_stash', icon: '🌸', duration: 1 * HOUR, tier: 3, match: ['farmer', 'gatherer'],
    description: 'Wade out at dusk when the bog blooms glow brightest. The sunken survey floats in the reeds are worth fishing out too.',
    yields: { biomass: 0.05, fiber: 0.025, food: 0.03, steel: 0.22, crystal: 0.13, electronics: 0.12, alloy: 0.16, rp: 0.265 },
    finds: [{ chance: 0.2, reward: { items: { rations_crate: 1 } } }, { chance: 0.3, reward: { items: { herbal_salve: 1 } } }],
  },
  {
    id: 'tm_lab', region: 'toxic_marsh', name: 'Overgrown Bio-Lab', poi: 'toxic_lab', icon: '🧬', duration: 4 * HOUR, tier: 3, match: ['scientist', 'doctor'],
    description: 'A greenhouse lab that got a little too enthusiastic. Its notes are still readable.',
    yields: { biomass: 0.04, electronics: 0.13, crystal: 0.15, alloy: 0.17, rp: 0.51 },
    finds: [{ chance: 0.35, reward: { items: { research_chip: 1 } } }, { chance: 0.2, reward: { items: { stim_pack: 1 } } }, { chance: 0.15, reward: { items: { tech_crate: 1 } } }],
  },
  {
    id: 'tm_nest', region: 'toxic_marsh', name: 'Sleepy Nest Raid', poi: 'alien_nest', icon: '🪺', duration: 8 * HOUR, tier: 4, match: ['guard', 'drone_tech'],
    description: 'Tiptoe past the dozing crawlers and lift the shiny things from their nest.',
    yields: { biomass: 0.025, crystal: 0.11, alloy: 0.3, nano: 0.2, rp: 0.365 },
    finds: [{ chance: 0.3, reward: { items: { alloy_crate: 1 } } }, { chance: 0.25, reward: { items: { defense_crate: 1 } } }],
  },
  // ---------------------------------------------------------------- Frozen Ridge
  {
    id: 'fr_survey', region: 'frozen_ridge', name: 'Frost Ore Survey', poi: 'research_outpost', icon: '🧊', duration: 1 * HOUR, tier: 4, match: ['miner', 'water_tech'],
    description: "Chip rare ore out of the ice and dig out the survey team's buried instruments and notes.",
    yields: { iron: 0.08, copper: 0.06, crystal: 0.2, steel: 0.2, water: 0.01, electronics: 0.12, rp: 0.33 },
    finds: [{ chance: 0.3, reward: { items: { ore_bundle: 3 } } }, { chance: 0.2, reward: { items: { steel_bundle: 1 } } }],
  },
  {
    id: 'fr_lab', region: 'frozen_ridge', name: 'Frozen Lab Recovery', poi: 'frozen_lab', icon: '🔬', duration: 4 * HOUR, tier: 4, match: ['scientist', 'electrician'],
    description: 'A research lab frozen in time. Thaw the servers and bring the data home.',
    yields: { rp: 0.55, electronics: 0.15, energy_cell: 0.12, crystal: 0.18 },
    finds: [{ chance: 0.4, reward: { items: { research_chip: 3 } } }, { chance: 0.15, reward: { items: { science_drone: 1 } } }],
  },
  {
    id: 'fr_scientists', region: 'frozen_ridge', name: 'Stranded Scientists', poi: 'stranded_scientists', icon: '🧑‍🔬', duration: 8 * HOUR, tier: 5, match: ['doctor', 'scientist'],
    description: 'A research team waiting out a blizzard with a very sad telescope. Bring blankets.',
    yields: { rp: 0.55, energy_cell: 0.1, crystal: 0.1, alloy: 0.15, nano: 0.1 },
    finds: [{ chance: 0.5, reward: { colonist: 'rare' } }, { chance: 0.3, reward: { items: { data_core: 1 } } }],
  },
  // ---------------------------------------------------------------- Alien Ruins
  {
    id: 'ar_glyphs', region: 'alien_ruins', name: 'Glyph Rubbings', poi: 'alien_ruin', icon: '🗿', duration: 1 * HOUR, tier: 4, match: ['scientist', 'engineer'],
    description: 'Paper, charcoal and patience: the ruins tell their story one glyph at a time.',
    yields: { rp: 0.6, crystal: 0.2, alloy: 0.2 },
    finds: [{ chance: 0.35, reward: { items: { research_chip: 1 } } }],
  },
  {
    id: 'ar_vault', region: 'alien_ruins', name: 'Ancient Vault Delve', poi: 'ancient_vault', icon: '🏛️', duration: 4 * HOUR, tier: 4, match: ['scientist', 'engineer'],
    description: 'A sealed vault older than the stars hums with forgotten technology.',
    yields: { rp: 0.45, crystal: 0.15, alloy: 0.25, energy_cell: 0.1, nano: 0.05 },
    finds: [{ chance: 0.35, reward: { items: { alloy_crate: 1 } } }, { chance: 0.15, reward: { nova: 3 } }, { chance: 0.1, reward: { items: { science_drone: 1 } } }],
  },
  {
    id: 'ar_hive', region: 'alien_ruins', name: 'Hive Nest Raid', poi: 'hive_nest', icon: '🕸️', duration: 8 * HOUR, tier: 5, match: ['guard', 'drone_tech'],
    description: 'A big, buzzing hive guarded by brutes. The loot inside smells amazing.',
    yields: { alloy: 0.25, crystal: 0.12, nano: 0.25, biomass: 0.07, rp: 0.31 },
    finds: [{ chance: 0.3, reward: { items: { nano_crate: 1 } } }, { chance: 0.2, reward: { items: { worker_drone: 1 } } }],
  },
  // ---------------------------------------------------------------- Titanium Highlands
  {
    id: 'th_caches', region: 'titanium_highlands', name: 'Survey Cache Run', poi: 'titanium_cache', icon: '🧰', duration: 1 * HOUR, tier: 5, match: ['miner', 'logistics'],
    description: 'Old survey crates dot the silver plateaus, packed with titanium, nano-gel and survey logs.',
    yields: { titanium: 0.4, energy_cell: 0.1, nano: 0.15, alloy: 0.1, rp: 0.25 },
    finds: [{ chance: 0.15, reward: { items: { nano_crate: 1 } } }],
  },
  {
    id: 'th_freighter', region: 'titanium_highlands', name: 'Derelict Freighter', poi: 'derelict_freighter', icon: '🚢', duration: 4 * HOUR, tier: 5, match: ['mechanic', 'logistics'],
    description: 'An enormous cargo hauler abandoned mid-journey. Its holds are still full.',
    yields: { titanium: 0.35, steel: 0.06, electronics: 0.06, alloy: 0.2, nano: 0.13, rp: 0.2 },
    finds: [{ chance: 0.3, reward: { items: { tech_crate: 2 } } }, { chance: 0.25, reward: { items: { nano_crate: 1 } } }, { chance: 0.15, reward: { items: { worker_drone: 1 } } }],
  },
  {
    id: 'th_summit', region: 'titanium_highlands', name: 'Silver Summit', poi: 'beacon', icon: '🏔️', duration: 8 * HOUR, tier: 6, match: ['miner', 'drone_tech'],
    description: 'The highest peak on the planet. The sky is close enough to touch, and so is the titanium.',
    yields: { titanium: 0.5, energy_cell: 0.1, nano: 0.2, rp: 0.2 },
    finds: [{ chance: 0.4, reward: { items: { titan_crate: 1 } } }, { chance: 0.1, reward: { items: { quantum_chip: 1 } } }, { chance: 0.1, reward: { items: { swarm_drone: 1 } } }],
  },
];
