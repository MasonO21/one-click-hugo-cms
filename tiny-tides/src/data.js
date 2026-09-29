// Tiny Tides — static game data. Pure data, no DOM, safe to import from Node tests.

export const APP_ID = 'com.tinytides.game';
export const SAVE_KEY = 'tinytides.save.v1';
export const HOUR = 3600e3;
export const MIN = 60e3;

// ---------------------------------------------------------------- traits
export const TRAITS = ['stone', 'depth', 'calm', 'green', 'warmth', 'glow'];
export const TRAIT_INFO = {
  stone:  { name: 'Stone',  color: '#a3adc8', tip: 'Rocks nearby' },
  depth:  { name: 'Depth',  color: '#7b83ff', tip: 'Deep water nearby' },
  calm:   { name: 'Calm',   color: '#36d1f0', tip: 'Shallow water nearby' },
  green:  { name: 'Green',  color: '#45d483', tip: 'Kelp and moss nearby' },
  warmth: { name: 'Warmth', color: '#ff7a59', tip: 'Ember rocks and vents nearby' },
  glow:   { name: 'Glow',   color: '#ffd23f', tip: 'Glowing stones nearby' },
};
// neighbourhood kernel: [dx, dy, weight]
export const KERNEL = [
  [0, 0, 1], [1, 0, .75], [-1, 0, .75], [0, 1, .75], [0, -1, .75],
  [2, 0, .45], [-2, 0, .45], [0, 2, .45], [0, -2, .45],
  [1, 1, .45], [1, -1, .45], [-1, 1, .45], [-1, -1, .45],
];
export const TRAIT_SCALE = 25;      // raw kernel sum * scale = 0..100
export const BRANCH_NEED = 30;      // trait needed to pick an evolution branch
export const MYTHIC_NEED = 65;      // main trait needed for stage 3
export const MYTHIC_SECOND = 30;    // secondary trait needed for stage 3

// water level contributions to traits, per biome
export const WATER_TR = {
  tide: { 1: { calm: 1 }, 2: { depth: 1, calm: .2 } },
  deep: { 1: { calm: 1 }, 2: { depth: .8, calm: .2 }, 3: { depth: 1.4 } },
};

// ---------------------------------------------------------------- biomes
export const BIOMES = {
  tide: {
    name: 'Tidepool', maxW: 2, digCost: { 1: 8, 2: 20 }, deepUnlock: 4, rateMult: 1,
    steps: [
      { w: 5, h: 6, cost: 0, lvl: 1 },
      { w: 6, h: 6, cost: 400, lvl: 3 },
      { w: 6, h: 7, cost: 1200, lvl: 5 },
      { w: 7, h: 7, cost: 3500, lvl: 8 },
      { w: 7, h: 8, cost: 9000, lvl: 12 },
      { w: 7, h: 9, cost: 25000, lvl: 16 },
    ],
  },
  deep: {
    name: 'Deep Ocean', maxW: 3, digCost: { 1: 20, 2: 45, 3: 90 }, deepUnlock: 1, rateMult: 1.7,
    steps: [
      { w: 6, h: 7, cost: 0, lvl: 1 },
      { w: 7, h: 8, cost: 6000, lvl: 8 },
      { w: 7, h: 9, cost: 30000, lvl: 16 },
    ],
  },
};

// ---------------------------------------------------------------- pieces (rocks & plants)
// onW: water levels a piece can sit on. tr: trait contribution.
export const PIECES = {
  granite:   { name: 'Granite', short: 'Granite',      biome: 'tide', kind: 'rock',  cost: 20,  unlock: 1, tr: { stone: 1 },                 onW: [0, 1],       blurb: 'A sturdy grey pebble.' },
  kelp:      { name: 'Kelp', short: 'Kelp',         biome: 'tide', kind: 'plant', cost: 30,  unlock: 2, tr: { green: 1 },                 onW: [0, 1, 2],    blurb: 'Swaying green ribbons.' },
  mossy:     { name: 'Mossy Rock', short: 'Moss',   biome: 'tide', kind: 'rock',  cost: 45,  unlock: 3, tr: { stone: .6, green: .6 },     onW: [0, 1],       blurb: 'Fuzzy with soft moss.' },
  ember:     { name: 'Ember Rock', short: 'Ember',   biome: 'tide', kind: 'rock',  cost: 90,  unlock: 5, tr: { stone: .5, warmth: 1 },     onW: [0, 1],       blurb: 'Warm to the touch.' },
  pearlite:  { name: 'Glow Pearlite', short: 'Pearl', biome: 'tide', kind: 'rock', cost: 160, unlock: 6, tr: { stone: .3, glow: 1 },       onW: [0, 1],       blurb: 'Glimmers in the dark.' },
  basalt:    { name: 'Basalt', short: 'Basalt',       biome: 'deep', kind: 'rock',  cost: 40,  unlock: 1, tr: { stone: 1 },                 onW: [0, 1, 2, 3], blurb: 'Dark volcanic column.' },
  glowstone: { name: 'Glowstone', short: 'Glow',    biome: 'deep', kind: 'rock',  cost: 120, unlock: 1, tr: { stone: .3, glow: 1 },       onW: [0, 1, 2, 3], blurb: 'A lantern from the deep.' },
  vent:      { name: 'Thermal Vent', short: 'Vent', biome: 'deep', kind: 'rock',  cost: 150, unlock: 1, tr: { stone: .4, warmth: 1.2 },   onW: [0, 1, 2, 3], blurb: 'Bubbling warm water.' },
  biokelp:   { name: 'Glow Kelp', short: 'Glow Kelp',    biome: 'deep', kind: 'plant', cost: 90,  unlock: 1, tr: { green: 1, glow: .5 },       onW: [0, 1, 2, 3], blurb: 'Shimmering fronds.' },
};
export const PIECES_BY_BIOME = {
  tide: ['granite', 'kelp', 'mossy', 'ember', 'pearlite'],
  deep: ['basalt', 'glowstone', 'vent', 'biokelp'],
};
export const REFUND = 0.5;

// ---------------------------------------------------------------- creature families
// stage 1 form id: `${fam}.0`; stage 2: `${fam}.b.${trait}`; stage 3: `${fam}.m.${trait}`
// pal: body / belly / accent; deco: decorations drawn by art.js
const F = (o) => o;
export const FAMILIES = {
  crab: F({
    biome: 'tide', name: 'Pinchy', med: 'land', w: [0, 1], likes: { stone: 1, calm: .5 }, unlock: 1, second: 'glow',
    blurb: 'A shy little crab who collects pebbles.', hint: 'Loves rocky shores',
    pal: { body: '#ff8f7a', belly: '#ffd6c9', accent: '#ff5d73' },
    br: {
      stone:  { name: 'Boulderclaw', mythic: 'Titan Claw',   pal: { body: '#a9b3d6', belly: '#e2e7f8', accent: '#6f7bb0' }, deco: ['rocks'] },
      green:  { name: 'Mosspinch',   mythic: 'Grove Warden', pal: { body: '#86df93', belly: '#dcf8dc', accent: '#3fb56b' }, deco: ['moss', 'leaves'] },
      warmth: { name: 'Emberclaw',   mythic: 'Magma Monarch', pal: { body: '#ff9a52', belly: '#ffe3ae', accent: '#ff4d4d' }, deco: ['lava'] },
    },
  }),
  snail: F({
    biome: 'tide', name: 'Swirly', med: 'land', w: [0, 1], likes: { green: 1, calm: .7 }, unlock: 2, second: 'warmth',
    blurb: 'Carries a swirly shell full of secrets.', hint: 'Loves leafy, damp corners',
    pal: { body: '#ffe0ef', belly: '#ffc9e6', accent: '#ff9ed4' },
    br: {
      green: { name: 'Fernshell',   mythic: 'Grove Spiral',   pal: { body: '#dbf7c9', belly: '#a6ebac', accent: '#6fd17a' }, deco: ['leaves'] },
      glow:  { name: 'Lumishell',   mythic: 'Lantern Spiral', pal: { body: '#e9e2ff', belly: '#d8c9ff', accent: '#a78bfa' }, deco: ['glowdots'] },
      calm:  { name: 'Bubbleshell', mythic: 'Cloud Spiral',   pal: { body: '#d6f3ff', belly: '#a9e6ff', accent: '#5ec8f5' }, deco: ['bubbles'] },
    },
  }),
  star: F({
    biome: 'tide', name: 'Twinkle', med: 'land', w: [1], likes: { stone: 1, calm: 1 }, unlock: 3, second: 'green',
    blurb: 'Naps in warm shallows and dreams of the sky.', hint: 'Loves rocky shallows',
    pal: { body: '#ffc857', belly: '#fff0b8', accent: '#ff8c42' },
    br: {
      warmth: { name: 'Sunstar',  mythic: 'Solar Sovereign', pal: { body: '#ff8a5c', belly: '#ffd6a0', accent: '#ff4d4d' }, deco: ['rays'] },
      glow:   { name: 'Novastar', mythic: 'Supernova',       pal: { body: '#b590ff', belly: '#e6d8ff', accent: '#7c5cff' }, deco: ['stars'] },
      stone:  { name: 'Rockstar', mythic: 'Rock Legend',     pal: { body: '#b9c4e2', belly: '#eef1fb', accent: '#7b8bbf' }, deco: ['crystals'] },
    },
  }),
  horse: F({
    biome: 'tide', name: 'Bobbin', med: 'water', w: [1], likes: { green: 1, calm: 1 }, unlock: 4, second: 'warmth',
    blurb: 'A bobbing seahorse who hugs the kelp.', hint: 'Loves kelp in calm shallows',
    pal: { body: '#8be9c8', belly: '#d7fff1', accent: '#35c4a0' },
    br: {
      green: { name: 'Kelpie',    mythic: 'Elder Kelpie',   pal: { body: '#8fe58a', belly: '#e0fbd8', accent: '#3fb56b' }, deco: ['leaves'] },
      glow:  { name: 'Aurorse',   mythic: 'Aurora Regent',  pal: { body: '#c8acff', belly: '#efe6ff', accent: '#8b5cf6' }, deco: ['stars', 'glowdots'] },
      stone: { name: 'Coralhorse', mythic: 'Reef Sovereign', pal: { body: '#ff9ec1', belly: '#ffe0ec', accent: '#ff5f9e' }, deco: ['crystals'] },
    },
  }),
  jelly: F({
    biome: 'tide', name: 'Jellybean', med: 'water', w: [2], likes: { depth: 1, glow: .4 }, unlock: 5, second: 'stone',
    blurb: 'Drifts through the deep like a wobbly lantern.', hint: 'Loves deep water',
    pal: { body: '#ffa8e0', belly: '#ffd6f1', accent: '#ff6bc6' },
    br: {
      depth:  { name: 'Midnight Jelly', mythic: 'Abyss Empress', pal: { body: '#8592ff', belly: '#cfd5ff', accent: '#4b57e6' }, deco: ['glowdots'] },
      glow:   { name: 'Neon Jelly',     mythic: 'Disco Deity',   pal: { body: '#6ef2d0', belly: '#c6fbee', accent: '#1fd1a8' }, deco: ['stars', 'glowdots'] },
      warmth: { name: 'Sunset Jelly',   mythic: 'Golden Hour',   pal: { body: '#ffb36b', belly: '#ffe0b8', accent: '#ff7a59' }, deco: ['stripes'] },
    },
  }),
  octo: F({
    biome: 'tide', name: 'Octopip', med: 'water', w: [1, 2], likes: { stone: 1, depth: .6 }, unlock: 7, second: 'warmth',
    blurb: 'A curious eight-armed puzzle solver.', hint: 'Loves rocky, deep nooks',
    pal: { body: '#b895ff', belly: '#e3d3ff', accent: '#8b5cf6' },
    br: {
      stone: { name: 'Grotto Octo', mythic: 'Cave Kraken',    pal: { body: '#90a2cc', belly: '#dde4f6', accent: '#5f719f' }, deco: ['rocks'] },
      green: { name: 'Camo Octo',   mythic: 'Verdant Kraken', pal: { body: '#71d98f', belly: '#d6f7de', accent: '#2fae63' }, deco: ['leaves', 'spots'] },
      glow:  { name: 'Prism Octo',  mythic: 'Prism Kraken',   pal: { body: '#ff8ad8', belly: '#ffd3f2', accent: '#e14bb4' }, deco: ['glowdots', 'stars'] },
    },
  }),
  angler: F({
    biome: 'deep', name: 'Lumi', med: 'water', w: [2, 3], likes: { glow: 1, depth: .7 }, unlock: 1, second: 'green',
    blurb: 'Carries its own little lantern.', hint: 'Loves glowing depths',
    pal: { body: '#5b6cf0', belly: '#a5aeff', accent: '#ffd23f' },
    br: {
      glow:   { name: 'Glimmer Angler', mythic: 'Starlight Angler', pal: { body: '#3ec6e6', belly: '#a9efff', accent: '#fff07a' }, deco: ['glowdots'] },
      warmth: { name: 'Vent Angler',    mythic: 'Volcano Angler',   pal: { body: '#ff7f6b', belly: '#ffc7b8', accent: '#ffd23f' }, deco: ['lava'] },
      depth:  { name: 'Void Angler',    mythic: 'Abyss Angler',     pal: { body: '#4a3fa8', belly: '#8d84e8', accent: '#ff6bc6' }, deco: ['stars'] },
    },
  }),
  naut: F({
    biome: 'deep', name: 'Spiralo', med: 'water', w: [1, 2, 3], likes: { stone: 1, depth: .6 }, unlock: 1, second: 'warmth',
    blurb: 'An ancient spiral who has seen everything.', hint: 'Loves rocky trenches',
    pal: { body: '#ffd9b0', belly: '#fff0dc', accent: '#ffb347' },
    br: {
      stone: { name: 'Fossil Naut',   mythic: 'Ancient Naut', pal: { body: '#d8c7a6', belly: '#f2ead8', accent: '#a48a5e' }, deco: ['rocks'] },
      glow:  { name: 'Prism Naut',    mythic: 'Aurora Naut',  pal: { body: '#e2c8ff', belly: '#f6ecff', accent: '#b57cff' }, deco: ['stars', 'glowdots'] },
      depth: { name: 'Midnight Naut', mythic: 'Cosmic Naut',  pal: { body: '#8f9bff', belly: '#d2d7ff', accent: '#4b57e6' }, deco: ['stars'] },
    },
  }),
  manta: F({
    biome: 'deep', name: 'Flutterray', med: 'water', w: [2, 3], likes: { depth: 1, calm: .3 }, unlock: 1, second: 'stone',
    blurb: 'Glides through the dark like a paper kite.', hint: 'Loves open, deep water',
    pal: { body: '#6a7bff', belly: '#dfe4ff', accent: '#3b46c9' },
    br: {
      depth: { name: 'Trench Ray', mythic: 'Phantom Ray', pal: { body: '#4d43b8', belly: '#a89fff', accent: '#261d7a' }, deco: ['glowdots'] },
      calm:  { name: 'Cloud Ray',  mythic: 'Sky Ray',     pal: { body: '#8fdcff', belly: '#f0fbff', accent: '#4fb6ec' }, deco: ['bubbles'] },
      glow:  { name: 'Halo Ray',   mythic: 'Angel Ray',   pal: { body: '#fff0a0', belly: '#fffbe0', accent: '#ffc933' }, deco: ['stars'] },
    },
  }),
  drake: F({
    biome: 'deep', name: 'Leafling', med: 'water', w: [1, 2], likes: { green: 1, calm: .6 }, unlock: 1, second: 'depth',
    blurb: 'A leafy little dragon of the kelp forest.', hint: 'Loves glow kelp',
    pal: { body: '#52d6a4', belly: '#c9f7e3', accent: '#1fa77a' },
    br: {
      green:  { name: 'Kelp Drake',  mythic: 'Elder Drake',  pal: { body: '#7ce07a', belly: '#d9f9d2', accent: '#3fb56b' }, deco: ['leaves'] },
      warmth: { name: 'Ember Drake', mythic: 'Inferno Drake', pal: { body: '#ff9a52', belly: '#ffe3ae', accent: '#ff4d4d' }, deco: ['lava', 'leaves'] },
      glow:   { name: 'Star Drake',  mythic: 'Galaxy Drake', pal: { body: '#b590ff', belly: '#e6d8ff', accent: '#7c5cff' }, deco: ['stars', 'leaves'] },
    },
  }),
};
export const FAMILY_IDS = Object.keys(FAMILIES);
export const FAMILIES_BY_BIOME = {
  tide: FAMILY_IDS.filter((f) => FAMILIES[f].biome === 'tide'),
  deep: FAMILY_IDS.filter((f) => FAMILIES[f].biome === 'deep'),
};

// ---------------------------------------------------------------- forms
export const FORMS = {};
for (const fid of FAMILY_IDS) {
  const fam = FAMILIES[fid];
  FORMS[`${fid}.0`] = { id: `${fid}.0`, fam: fid, stage: 1, trait: null, name: fam.name, pal: fam.pal, deco: [], blurb: fam.blurb };
  for (const [trait, b] of Object.entries(fam.br)) {
    FORMS[`${fid}.b.${trait}`] = {
      id: `${fid}.b.${trait}`, fam: fid, stage: 2, trait, name: b.name, pal: b.pal, deco: b.deco,
      blurb: `${fam.name} grown up in ${TRAIT_INFO[trait].name.toLowerCase()}-rich surroundings.`,
    };
    FORMS[`${fid}.m.${trait}`] = {
      id: `${fid}.m.${trait}`, fam: fid, stage: 3, trait, name: b.mythic, pal: b.pal, deco: [...b.deco, 'aura', 'crown'],
      blurb: `The legendary ${b.name}. Only the most devoted keepers ever see one.`,
    };
  }
}
export const FORM_IDS = Object.keys(FORMS);
export const formsOfFamily = (fid) => FORM_IDS.filter((f) => FORMS[f].fam === fid);
export const formsOfBiome = (biome) => FORM_IDS.filter((f) => FAMILIES[FORMS[f].fam].biome === biome);
export const branchForm = (fid, trait) => `${fid}.b.${trait}`;
export const mythicForm = (fid, trait) => `${fid}.m.${trait}`;

// ---------------------------------------------------------------- creature economy
export const STAGE = {
  1: { rate: 24,  maxLvl: 5,  lvlBase: 15,   lvlGrow: 1.5,  evoLvl: 3, evoCost: 80,   evoTime: 2 * HOUR, xp: 0,   lvlXp: 2 },
  2: { rate: 80,  maxLvl: 12, lvlBase: 250,  lvlGrow: 1.45, evoLvl: 8, evoCost: 4000, evoTime: 10 * HOUR, xp: 60, lvlXp: 5 },
  3: { rate: 260, maxLvl: 20, lvlBase: 3000, lvlGrow: 1.36, evoLvl: 0, evoCost: 0,    evoTime: 0,        xp: 300, lvlXp: 12 },
};
export const LVL_RATE_GAIN = 0.15;
export const TUTORIAL_EVO_TIME = 15e3;
export const EGG_INTERVAL = 25 * MIN;
export const EGG_WARM = 3 * MIN;
export const MAX_OFFLINE = 14 * 24 * HOUR;
export const DEX_RATE_BONUS = 0.01;
export const POOL_RATE_BONUS = 0.03;
export const SPEEDUP_MIN_PER_GLASS = 15;
export const TOKEN_MS = HOUR;
export const HOURGLASS_FACTOR = 0.75;
export const DISCOVER_GLASS = { 1: 0, 2: 4, 3: 12 };
export const DISCOVER_XP = { 1: 15, 2: 40, 3: 150 };

export const xpForLevel = (l) => Math.round(60 * Math.pow(1.5, l - 1));
export const MAX_POOL_LVL = 30;
export const bubbleCapHours = (lvl) => Math.min(12, 4 + 0.5 * (lvl - 1));

// Milestone claims are saved by list position: only ever add new entries at the END of DEX_MILESTONES / TOY_MILESTONES.
export const DEX_MILESTONES = [
  { n: 5, glass: 10, coins: 1 }, { n: 15, glass: 20, coins: 2 }, { n: 30, glass: 40, coins: 3 }, { n: 50, glass: 60, coins: 4 }, { n: 70, glass: 100, coins: 6 },
];

// ---------------------------------------------------------------- shop / decor
// kind: prop | hat | skin | fx. price {pearls}|{glass}|pack.
export const DECOR = {
  // shore & float props
  sandcastle:  { kind: 'prop', place: 'shore', name: 'Sandcastle',    price: { pearls: 500 } },
  umbrella:    { kind: 'prop', place: 'shore', name: 'Beach Umbrella', price: { pearls: 1500 } },
  sign:        { kind: 'prop', place: 'shore', name: 'Tide Sign',     price: { pearls: 800 } },
  surfboard:   { kind: 'prop', place: 'shore', name: 'Surfboard',     price: { pearls: 2500 } },
  lantern:     { kind: 'prop', place: 'shore', name: 'Glow Lantern',  price: { glass: 20 } },
  lighthouse:  { kind: 'prop', place: 'shore', name: 'Tiny Lighthouse', price: { glass: 60 } },
  treasure:    { kind: 'prop', place: 'shore', name: 'Treasure Chest', price: { glass: 45 } },
  duck:        { kind: 'prop', place: 'float', name: 'Rubber Ducky',  price: { pearls: 1200 } },
  lilypad:     { kind: 'prop', place: 'float', name: 'Lily Pad',      price: { pearls: 600 } },
  flamingo:    { kind: 'prop', place: 'float', name: 'Flamingo Float', pack: 'party' },
  boombox:     { kind: 'prop', place: 'shore', name: 'Boombox',       pack: 'party' },
  sakuratree:  { kind: 'prop', place: 'shore', name: 'Sakura Tree',   pack: 'sakura' },
  paperlantern: { kind: 'prop', place: 'shore', name: 'Paper Lantern', pack: 'sakura' },
  neonpalm:    { kind: 'prop', place: 'shore', name: 'Neon Palm',     pack: 'neon' },
  arcade:      { kind: 'prop', place: 'shore', name: 'Mini Arcade',   pack: 'neon' },
  // creature hats
  flowerhat:   { kind: 'hat', name: 'Daisy',        price: { pearls: 400 } },
  cap:         { kind: 'hat', name: 'Beach Cap',    price: { pearls: 1200 } },
  halo:        { kind: 'hat', name: 'Halo',         price: { glass: 25 } },
  wizard:      { kind: 'hat', name: 'Wizard Hat',   price: { glass: 40 } },
  partyhat:    { kind: 'hat', name: 'Party Hat',    pack: 'party' },
  crownhat:    { kind: 'hat', name: 'Royal Crown',  pack: 'party' },
  bow:         { kind: 'hat', name: 'Sakura Bow',   pack: 'sakura' },
  shades:      { kind: 'hat', name: 'Cool Shades',  pack: 'neon' },
  headphones:  { kind: 'hat', name: 'Headphones',   pack: 'neon' },
  // pool skins
  aqua:        { kind: 'skin', name: 'Classic Aqua',  free: true },
  bubblegum:   { kind: 'skin', name: 'Bubblegum',     price: { glass: 100 } },
  mint:        { kind: 'skin', name: 'Mint Soda',     price: { glass: 100 } },
  sunset:      { kind: 'skin', name: 'Sunset Sorbet', price: { glass: 120 } },
  aurora:      { kind: 'skin', name: 'Aurora',        price: { glass: 120 } },
  sakura:      { kind: 'skin', name: 'Sakura Shore',  pack: 'sakura' },
  neon:        { kind: 'skin', name: 'Neon Arcade',   pack: 'neon' },
  // ambient effects
  bubbles:     { kind: 'fx', name: 'Rising Bubbles', free: true },
  nofx:        { kind: 'fx', name: 'Clear Skies',    free: true },
  fireflies:   { kind: 'fx', name: 'Fireflies',      price: { pearls: 5000 } },
  stardust:    { kind: 'fx', name: 'Stardust',       price: { glass: 40 } },
  petals:      { kind: 'fx', name: 'Sakura Petals',  pack: 'sakura' },
  confetti:    { kind: 'fx', name: 'Confetti',       pack: 'party' },
  stars:       { kind: 'fx', name: 'Neon Stars',     pack: 'neon' },
  // ---- Capsule Machine exclusives (gacha: tier). Never sold directly; also available at the Prize Counter.
  capsulestack: { kind: 'prop', place: 'shore', name: 'Capsule Stack',  gacha: 'common' },
  pinwheel:    { kind: 'prop', place: 'shore', name: 'Pinwheel',        gacha: 'common' },
  boba:        { kind: 'prop', place: 'shore', name: 'Bubble Tea',      gacha: 'common' },
  beachball:   { kind: 'prop', place: 'float', name: 'Beach Ball',      gacha: 'common' },
  balloons:    { kind: 'prop', place: 'shore', name: 'Balloon Bunch',   gacha: 'uncommon' },
  capsulemachine: { kind: 'prop', place: 'shore', name: 'Beach Gachapon', gacha: 'rare', blurb: 'Tap it on your beach to open the Capsule Machine.' },
  catears:     { kind: 'hat', name: 'Kitty Ears',    gacha: 'common' },
  chef:        { kind: 'hat', name: 'Chef Hat',      gacha: 'common' },
  antenna:     { kind: 'hat', name: 'Bubble Antenna', gacha: 'common' },
  tophat:      { kind: 'hat', name: 'Top Hat',       gacha: 'uncommon' },
  pirate:      { kind: 'hat', name: 'Pirate Hat',    gacha: 'uncommon' },
  starclip:    { kind: 'hat', name: 'Star Clip',     gacha: 'uncommon' },
  unicorn:     { kind: 'hat', name: 'Unicorn Horn',  gacha: 'rare' },
  goldcrown:   { kind: 'hat', name: 'Golden Crown',  gacha: 'legendary' },
  candy:       { kind: 'skin', name: 'Candy Cloud',  gacha: 'rare' },
  holo:        { kind: 'skin', name: 'Holo Prism',   gacha: 'legendary' },
  midnight:    { kind: 'skin', name: 'Midnight Cove', gacha: 'legendary' },
  hearts:      { kind: 'fx', name: 'Floating Hearts', gacha: 'rare' },
  rainbow:     { kind: 'fx', name: 'Rainbow Sparkle', gacha: 'legendary' },
};

// ---- Capsule figurines: one collectible toy per creature form (tier follows the form's stage) + a golden one per family
export const figId = (formId) => `fig_${formId.replace(/\./g, '_')}`;
export const goldFigId = (fam) => `figg_${fam}`;
const STAGE_TIER = { 1: 'common', 2: 'uncommon', 3: 'rare' };
for (const f of FORM_IDS) DECOR[figId(f)] = { kind: 'prop', place: 'shore', name: `${FORMS[f].name} Figure`, gacha: STAGE_TIER[FORMS[f].stage], fig: f };
for (const fam of FAMILY_IDS) {
  const top = mythicForm(fam, Object.keys(FAMILIES[fam].br)[0]);
  DECOR[goldFigId(fam)] = { kind: 'prop', place: 'shore', name: `Golden ${FORMS[top].name}`, gacha: 'legendary', fig: top, gold: true };
}
export const DECOR_IDS = Object.keys(DECOR);
export const FREE_DECOR = DECOR_IDS.filter((d) => DECOR[d].free);

export const SKINS = {
  aqua:      { sand: '#ffe9c2', sandDk: '#f6cf94', wet: '#e9b877', shallow: '#8aeaf6', shallow2: '#5fd3f0', deep: '#4aa0ea', deep2: '#3673d6', trench: '#2447b4', slab: '#e2a86b', slabDk: '#c98a52' },
  bubblegum: { sand: '#ffe3f1', sandDk: '#f9bcda', wet: '#ee9fc7', shallow: '#ffc8ef', shallow2: '#ff9fe0', deep: '#c58cff', deep2: '#9b6cff', trench: '#6c46d8', slab: '#f19bc5', slabDk: '#d37aa9' },
  mint:      { sand: '#f5ffe8', sandDk: '#d3edb6', wet: '#b8dc9c', shallow: '#aaffd9', shallow2: '#70efc2', deep: '#34d0b0', deep2: '#20a997', trench: '#13766f', slab: '#a6d18b', slabDk: '#88b56d' },
  sunset:    { sand: '#ffdcb5', sandDk: '#f7ac72', wet: '#e88e5f', shallow: '#ffd2a3', shallow2: '#ffa483', deep: '#ff7096', deep2: '#d2497f', trench: '#8f307a', slab: '#e68b57', slabDk: '#c8703f' },
  aurora:    { sand: '#e8edff', sandDk: '#bcc7f6', wet: '#a2b2ec', shallow: '#a0f6e8', shallow2: '#69e5d5', deep: '#7080ff', deep2: '#5b46d8', trench: '#3c2c9e', slab: '#8f9edd', slabDk: '#7280c2' },
  sakura:    { sand: '#fff1f5', sandDk: '#ffcbdb', wet: '#f6abc2', shallow: '#ffd8e8', shallow2: '#ffb5d3', deep: '#ff90c0', deep2: '#e26ba7', trench: '#a9447f', slab: '#f4a5c1', slabDk: '#d888a5', sky: 'dusk' },
  neon:      { sand: '#3d2b7d', sandDk: '#2c1e60', wet: '#20154a', shallow: '#22e8ff', shallow2: '#00c4ff', deep: '#7b3dff', deep2: '#5b20e2', trench: '#2e109e', slab: '#1e1449', slabDk: '#150e35', sky: 'night' },
  candy:     { sand: '#fff0fb', sandDk: '#ffc6ee', wet: '#f4a8dd', shallow: '#bff6ff', shallow2: '#8fe3ff', deep: '#ff9ce6', deep2: '#e068c8', trench: '#a03fa0', slab: '#ffb5e8', slabDk: '#e18bcb' },
  holo:      { sand: '#f3eaff', sandDk: '#c9d4ff', wet: '#b5c2f5', shallow: '#aaf5ff', shallow2: '#c8b0ff', deep: '#ff9ad8', deep2: '#7f8cff', trench: '#4a3fb8', slab: '#c6b8ff', slabDk: '#98a2f0' },
  midnight:  { sand: '#39336f', sandDk: '#282456', wet: '#1b1842', shallow: '#3fd0e8', shallow2: '#2aa8d8', deep: '#5b4bd8', deep2: '#3c2fb0', trench: '#221a78', slab: '#1a1642', slabDk: '#0f0c2e', sky: 'night' },
  abyss:     { sand: '#4d52a8', sandDk: '#383c86', wet: '#2b2f6c', shallow: '#33c9d8', shallow2: '#22a3d0', deep: '#2f74dc', deep2: '#234fbc', trench: '#16308f', slab: '#262870', slabDk: '#16174a', sky: 'night' },
};

export const PACKS = {
  sakura: { name: 'Sakura Shore Pack', iap: `${APP_ID}.pack.sakura`, items: ['sakuratree', 'paperlantern', 'bow', 'sakura', 'petals'], blurb: 'Cherry-blossom pool skin, falling petals & more.' },
  neon:   { name: 'Neon Arcade Pack',  iap: `${APP_ID}.pack.neon`,   items: ['neonpalm', 'arcade', 'shades', 'headphones', 'neon', 'stars'], blurb: 'Glowing night-arcade vibes.' },
  party:  { name: 'Pool Party Pack',   iap: `${APP_ID}.pack.party`,  items: ['flamingo', 'boombox', 'partyhat', 'crownhat', 'confetti'], blurb: 'Confetti, crowns and a flamingo float.' },
};

// ---------------------------------------------------------------- in-app purchases
// type: consumable | nonconsumable. Fallback price strings are shown until the store returns real ones.
export const PRODUCTS = {
  [`${APP_ID}.glass.60`]:   { type: 'consumable', name: '60 Sea Glass',   glass: 60,   price: '$0.99',  tag: '' },
  [`${APP_ID}.glass.330`]:  { type: 'consumable', name: '330 Sea Glass',  glass: 330,  price: '$4.99',  tag: '+10% bonus' },
  [`${APP_ID}.glass.700`]:  { type: 'consumable', name: '700 Sea Glass',  glass: 700,  price: '$9.99',  tag: '+16% bonus' },
  [`${APP_ID}.glass.1500`]: { type: 'consumable', name: '1500 Sea Glass', glass: 1500, price: '$19.99', tag: '+25% bonus' },
  [`${APP_ID}.deepocean`]:  { type: 'nonconsumable', name: 'Deep Ocean Biome', deep: true, glass: 50, price: '$7.99' },
  [`${APP_ID}.hourglass`]:  { type: 'nonconsumable', name: 'Golden Hourglass', hourglass: true, price: '$4.99' },
  [`${APP_ID}.pack.sakura`]: { type: 'nonconsumable', name: PACKS.sakura.name, pack: 'sakura', price: '$2.99' },
  [`${APP_ID}.pack.neon`]:   { type: 'nonconsumable', name: PACKS.neon.name,   pack: 'neon',   price: '$2.99' },
  [`${APP_ID}.pack.party`]:  { type: 'nonconsumable', name: PACKS.party.name,  pack: 'party',  price: '$2.99' },
  [`${APP_ID}.starter`]:     { type: 'nonconsumable', name: 'Starter Bundle',  starter: true, glass: 200, items: ['partyhat', 'bubblegum'], price: '$2.99' },
};
export const PRODUCT_IDS = Object.keys(PRODUCTS);
export const IAP = {
  deep: `${APP_ID}.deepocean`, hourglass: `${APP_ID}.hourglass`, starter: `${APP_ID}.starter`,
  glass: [`${APP_ID}.glass.60`, `${APP_ID}.glass.330`, `${APP_ID}.glass.700`, `${APP_ID}.glass.1500`],
};

// boosts purchasable with Sea Glass (speed-ups)
export const BOOSTS = {
  ff2:  { name: 'Fast-Forward 2h',  desc: 'Instantly collect 2 hours of pearls', glass: 15, ff: 2 },
  ff8:  { name: 'Fast-Forward 8h',  desc: 'Instantly collect 8 hours of pearls', glass: 50, ff: 8 },
  sun:  { name: 'Sun Surge',        desc: 'Double pearl income for 2 hours',     glass: 25, mult: 2, dur: 2 * HOUR },
  egg:  { name: 'Lucky Egg',        desc: 'An egg washes ashore right now',      glass: 10, egg: true },
};

// ---------------------------------------------------------------- quests & rewards
export const QUEST_TEMPLATES = [
  { id: 'collect',  text: (n) => `Pop ${n} bubbles`,        min: 8,  max: 20, ev: 'collect', glass: 3 },
  { id: 'pearls',   text: (n) => `Earn ${n} pearls`,        scale: true,     ev: 'pearls',  glass: 3 },
  { id: 'place',    text: (n) => `Place ${n} rocks or plants`, min: 4, max: 8, ev: 'place',  glass: 3 },
  { id: 'levelup',  text: (n) => `Level up creatures ${n} times`, min: 2, max: 4, ev: 'levelup', glass: 4 },
  { id: 'hatch',    text: (n) => `Hatch ${n} egg${n > 1 ? 's' : ''}`, min: 1, max: 2, ev: 'hatch', glass: 4 },
  { id: 'pet',      text: (n) => `Pet ${n} creatures`,      min: 4,  max: 8,  ev: 'pet',    glass: 3 },
  { id: 'gift',     text: () => 'Open a Tide Gift',         min: 1,  max: 1,  ev: 'gift',    glass: 3 },
  { id: 'evolve',   text: () => 'Start an evolution',       min: 1,  max: 1,  ev: 'evolve',  glass: 5 },
  { id: 'pull',     text: () => 'Pull a capsule',           min: 1,  max: 1,  ev: 'pull',    glass: 2, coins: 1 },
];
export const QUEST_COUNT = 3;
export const QUEST_ALL_BONUS = { glass: 10, tokens: 1, coins: 1 };
export const DAILY_REWARDS = [
  { pearlsHours: .5, label: 'Pearls' },
  { glass: 5, label: '5 Sea Glass' },
  { pearlsHours: 1, label: 'Pearls' },
  { tokens: 1, label: 'Speed Token' },
  { glass: 10, label: '10 Sea Glass' },
  { pearlsHours: 2, label: 'Pearls' },
  { glass: 25, tokens: 1, coins: 2, label: '25 Glass + Token + 2 Coins' },
];
export const GIFT_WINDOWS = [
  { id: 0, name: 'Morning Tide',   from: 5,  to: 12 },
  { id: 1, name: 'Afternoon Tide', from: 12, to: 18 },
  { id: 2, name: 'Evening Tide',   from: 18, to: 29 },
];
export const SPRING_TIDE = { rate: 1.25, egg: 0.6 };

// ================================================================ Capsule Machine (gashapon)
// Cosmetic collectibles only. Paid pulls spend Sea Glass; Capsule Coins are earned free through play.
// Every rate shown in the game is computed from this table (see gachaTable in sim.js). These are the odds of each capsule before the
// pity guarantee (see rollCapsule): pity only ever adds chances of a Rare or Legendary collectible, it never lowers a rate.
export const GACHA = {
  tiers: [
    { id: 'common',    name: 'Common',    p: 58, color: '#8fd3ff', stars: 1, shards: 1,  prize: 8 },
    { id: 'uncommon',  name: 'Uncommon',  p: 28, color: '#6fe3a0', stars: 2, shards: 3,  prize: 25 },
    { id: 'rare',      name: 'Rare',      p: 11, color: '#ffc93f', stars: 3, shards: 10, prize: 80 },
    { id: 'legendary', name: 'Legendary', p: 3,  color: '#ff7ad9', stars: 4, shards: 40, prize: 300 },
  ],
  costCoin: 1,            // Capsule Coins per pull
  costGlass: 30,          // Sea Glass per pull
  costGlass10: 270,       // ten pulls (10% off)
  pityRare: 10,           // a Rare-or-better capsule is guaranteed at least every 10th pull
  pityLegend: 60,         // a Legendary capsule is guaranteed at least every 60th pull
  paidDailyCap: 20,       // maximum Sea Glass pulls per day (self-imposed spending guardrail: 600 Sea Glass, roughly $6-9)
  spotMult: 3,            // this week's Spotlight items are 3x as likely as their tier siblings
};
export const TIER = Object.fromEntries(GACHA.tiers.map((t) => [t.id, t]));
export const TIER_IDS = GACHA.tiers.map((t) => t.id);

// Non-cosmetic "filler" capsules: small one-time rewards that keep pulls feeling generous. They are listed in the published rates,
// are never the pity-guaranteed prize, and never reset the pity counters.
const FILLERS = [
  { id: 'f_coin',    tier: 'common',   w: 6, name: 'Capsule Coin',         reward: { coins: 1 } },
  { id: 'f_glass',   tier: 'common',   w: 4, name: '3 Sea Glass',          reward: { glass: 3 } },
  { id: 'f_pearls',  tier: 'common',   w: 10, name: '2 hours of Pearls',   reward: { pearlsHours: 2 } },
  { id: 'f_coin2',   tier: 'uncommon', w: 4, name: '2 Capsule Coins',      reward: { coins: 2 } },
  { id: 'f_token',   tier: 'uncommon', w: 4, name: 'Speed Token',          reward: { tokens: 1 } },
  { id: 'f_pearls6', tier: 'uncommon', w: 4, name: '6 hours of Pearls',    reward: { pearlsHours: 6 } },
  { id: 'f_glass10', tier: 'rare',     w: 3, name: '10 Sea Glass',         reward: { glass: 10 } },
];
const DECOR_WEIGHT = { common: 2, uncommon: 2, rare: 3, legendary: 3 };
export const GACHA_POOL = [];
for (const id of DECOR_IDS) {
  const d = DECOR[id]; if (!d.gacha) continue;
  const isFig = !!d.fig;
  const w = isFig ? (d.gold ? 2 : d.gacha === 'common' ? 2 : 1) : DECOR_WEIGHT[d.gacha];
  GACHA_POOL.push({ id, tier: d.gacha, w, name: d.name, kind: isFig ? 'fig' : d.kind, fig: d.fig, gold: !!d.gold, filler: false });
}
for (const f of FILLERS) GACHA_POOL.push({ ...f, kind: 'filler', filler: true });
export const POOL_BY_ID = Object.fromEntries(GACHA_POOL.map((i) => [i.id, i]));
export const POOL_BY_TIER = Object.fromEntries(TIER_IDS.map((t) => [t, GACHA_POOL.filter((i) => i.tier === t)]));
export const COLLECTIBLE_IDS = GACHA_POOL.filter((i) => !i.filler).map((i) => i.id);
export const FIG_IDS = GACHA_POOL.filter((i) => i.kind === 'fig').map((i) => i.id);

// Toybox sets: own every figure of a family (7) for a bonus; own all ten golden figures for a big one.
export const TOY_SETS = FAMILY_IDS.map((fam) => ({
  id: `set_${fam}`, name: `${FAMILIES[fam].name} Family`, fam, items: formsOfFamily(fam).map(figId), reward: { coins: 2, glass: 15 },
}));
TOY_SETS.push({ id: 'set_gold', name: 'Golden Collection', fam: null, items: FAMILY_IDS.map(goldFigId), reward: { coins: 5, glass: 100 } });
export const TOY_MILESTONES = [
  { n: 10, reward: { coins: 1, glass: 5 } }, { n: 25, reward: { coins: 2, glass: 15 } }, { n: 50, reward: { coins: 4, glass: 30 } },
  { n: 75, reward: { coins: 6, glass: 60 } }, { n: COLLECTIBLE_IDS.length, reward: { coins: 10, glass: 150 } },
];
