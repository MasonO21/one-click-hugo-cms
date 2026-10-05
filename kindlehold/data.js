/*
 * Kindlehold content tables.
 * Every number a designer would want to tune lives here; game.js only reads it.
 * Timers and production rates are compressed (~30x) so the prototype can be
 * played through in a sitting. See DESIGN.md for live-game pacing.
 */
'use strict';

const DATA = {
  saveKey: 'kindlehold.save.v1',
  offline: { capSeconds: 3600, efficiency: 0.25 },

  start: {
    res: { wood: 300, food: 200, coal: 150, iron: 0 },
    starglass: 300,
    beacons: 3,
    journals: 10,
    survivors: 6,
    heroes: ['bram', 'pell'],
    levels: { hearth: 1, shelter1: 1, woodcutter: 1, hunter: 1 },
  },

  // ---------- Climate ----------
  // The frost hunts warmth: every Hearthwyrm level past 1 makes each kind of
  // weather colder by `chill` degrees, so storms stay a threat all game.
  weather: {
    clear: { name: 'Clear', temp: -20, chill: 1, outdoor: 1 },
    snow: { name: 'Snowfall', temp: -26, chill: 1.5, outdoor: 0.85 },
    blizzard: { name: 'Blizzard', temp: -34, chill: 3.5, outdoor: 0.5 },
    deepfreeze: { name: 'Deep Freeze', temp: -46, chill: 4, outdoor: 0.3 },
  },
  comfort: [
    // first band whose min the town temperature reaches applies
    { min: 5, name: 'Comfortable', prod: 1.1, sick: 0, lost: 0 },
    { min: -5, name: 'Chilly', prod: 1, sick: 0, lost: 0 },
    { min: -15, name: 'Cold', prod: 0.85, sick: 0.008, lost: 0 },
    { min: -999, name: 'Freezing', prod: 0.7, sick: 0.015, lost: 0.003 },
  ],
  foodPerSurvivor: 0.1,
  arrivalEvery: 10,
  baseRecovery: 0.01,
  infirmaryRate: 0.012, // extra recovery chance per patient per second, per Infirmary level

  // ---------- The Hearthwyrm ----------
  hearth: {
    maxLevel: 10,
    stages: [
      { from: 1, name: 'Hatchling', size: 0.62 },
      { from: 3, name: 'Whelp', size: 0.76 },
      { from: 5, name: 'Drake', size: 0.9 },
      { from: 7, name: 'Firewyrm', size: 1.04 },
      { from: 9, name: 'Elder Hearthwyrm', size: 1.18 },
    ],
    heat: (L) => 16 + 3.5 * L,
    burn: (L) => 0.3 + 0.3 * L,
    blaze: {
      low: { name: 'Banked', heat: 0.6, burn: 0.5 },
      steady: { name: 'Steady', heat: 1, burn: 1 },
      roaring: { name: 'Roaring', heat: 1.45, burn: 2 },
    },
  },

  // ---------- Buildings ----------
  buildings: {
    hearth: {
      name: 'Hearthwyrm', cost: { wood: 120, coal: 80 }, time: 15, growth: 1.8,
      desc: 'The last living flame. Its warmth keeps the frost at bay and its growth decides how far your hold can grow.',
    },
    shelter: {
      name: 'Hide Shelter', cost: { wood: 60 }, time: 8, growth: 1.75,
      desc: 'Fur-lined huts. Every level houses three more survivors.',
      housing: (L) => 4 + 3 * L,
    },
    woodcutter: {
      name: "Woodcutter's Camp", cost: { wood: 40, food: 20 }, time: 6, growth: 1.75,
      prod: 'wood', perWorker: 0.5, outdoor: true,
      desc: 'Fells the frozen pines. Outdoor work slows in bad weather.',
    },
    hunter: {
      name: "Hunter's Lodge", cost: { wood: 50 }, time: 6, growth: 1.75,
      prod: 'food', perWorker: 0.4, outdoor: true,
      desc: 'Trappers and hunters keep the stewpots full. Outdoor work slows in bad weather.',
    },
    coalpit: {
      name: 'Coal Pit', cost: { wood: 70, food: 30 }, time: 8, growth: 1.75,
      prod: 'coal', perWorker: 0.3,
      desc: 'Coal feeds the Hearthwyrm. If the coal runs out, the wyrm sleeps and the cold comes in.',
    },
    ironmine: {
      name: 'Iron Mine', cost: { wood: 150, coal: 80 }, time: 15, growth: 1.75,
      prod: 'iron', perWorker: 0.15,
      desc: 'Iron for lances, tools and the upper levels of every building.',
    },
    infirmary: {
      name: 'Infirmary', cost: { wood: 120, coal: 40 }, time: 12, growth: 1.75,
      desc: 'Herbalists nurse the frostbitten back to work.',
    },
    barracks: {
      name: 'Barracks', cost: { wood: 150, food: 100 }, time: 15, growth: 1.75,
      desc: 'Trains Shieldguards, Frostbows and Sled Lancers for expeditions.',
    },
    watchtower: {
      name: 'Watchtower', cost: { wood: 180, coal: 60, iron: 30 }, time: 18, growth: 1.75,
      desc: 'Lookouts read the sky. Each level sees incoming weather further ahead.',
    },
    archive: {
      name: 'Archive of Thaw', cost: { wood: 250, coal: 120, iron: 60 }, time: 25, growth: 1.75,
      desc: 'Scholars piece together what the old world knew. Unlocks research.',
    },
  },
  ironShareFrom: 4, // levels >= this also cost iron (20% of the wood cost)
  buildTimeGrowth: 1.5,
  workerSlots: (L) => 3 + L,
  workerGrowth: 0.15, // per-worker output gain per building level

  // Fixed plots around the nest, front (bottom of screen) first, going clockwise.
  plots: [
    { id: 'coalpit', type: 'coalpit', unlock: 1 },
    { id: 'woodcutter', type: 'woodcutter', unlock: 1 },
    { id: 'shelter1', type: 'shelter', unlock: 1 },
    { id: 'infirmary', type: 'infirmary', unlock: 2 },
    { id: 'archive', type: 'archive', unlock: 4 },
    { id: 'watchtower', type: 'watchtower', unlock: 3 },
    { id: 'barracks', type: 'barracks', unlock: 2 },
    { id: 'shelter2', type: 'shelter', unlock: 2 },
    { id: 'hunter', type: 'hunter', unlock: 1 },
    { id: 'ironmine', type: 'ironmine', unlock: 3 },
  ],

  // ---------- Research ----------
  techs: [
    { id: 'insulation', name: 'Hide-Lined Walls', desc: '+2°C town warmth per level', cost: { wood: 200, iron: 40 }, time: 20 },
    { id: 'axes', name: 'Bone Saws', desc: '+12% wood per level', cost: { wood: 150, food: 100 }, time: 15 },
    { id: 'traps', name: 'Snare Lines', desc: '+12% food per level', cost: { wood: 150, coal: 60 }, time: 15 },
    { id: 'seams', name: 'Deep Seams', desc: '+12% coal per level', cost: { wood: 180, food: 120 }, time: 18 },
    { id: 'smelt', name: 'Bellows Smelting', desc: '+12% iron per level', cost: { wood: 220, coal: 150 }, time: 20 },
    { id: 'medicine', name: 'Willowbark Tinctures', desc: '+30% healing per level', cost: { food: 200, coal: 80 }, time: 18 },
    { id: 'drills', name: 'Shield Drills', desc: '+6% troop attack and defense per level', cost: { food: 250, iron: 60 }, time: 25 },
    { id: 'horns', name: 'Long Horns', desc: '+30s weather forecast per level', cost: { wood: 200, iron: 30 }, time: 18 },
  ],
  techGrowth: 1.8,
  techTimeGrowth: 1.5,

  // ---------- Troops ----------
  troops: {
    guard: { name: 'Shieldguards', atk: 1.5, def: 3, hp: 25, cost: { food: 4, wood: 2 } },
    bow: { name: 'Frostbows', atk: 3, def: 1.2, hp: 15, cost: { food: 3, wood: 4 } },
    lancer: { name: 'Sled Lancers', atk: 2.5, def: 2, hp: 20, cost: { food: 5, iron: 1 }, needs: 'ironmine' },
  },
  trainSecondsPerUnit: 0.5,
  // key beats value
  counters: { guard: 'lancer', lancer: 'bow', bow: 'guard' },
  classes: {
    guard: { name: 'Shieldguard', icon: 'i-guard' },
    bow: { name: 'Frostbow', icon: 'i-bow' },
    lancer: { name: 'Sled Lancer', icon: 'i-lancer' },
  },

  // ---------- Heroes ----------
  rarities: {
    rare: { name: 'Rare', atk: 40, def: 30, hp: 400 },
    epic: { name: 'Epic', atk: 60, def: 45, hp: 600 },
    legendary: { name: 'Legendary', atk: 90, def: 65, hp: 900 },
  },
  stewardPosts: {
    wood: { plot: 'woodcutter', label: (v) => `+${v}% wood` },
    food: { plot: 'hunter', label: (v) => `+${v}% food` },
    coal: { plot: 'coalpit', label: (v) => `+${v}% coal` },
    iron: { plot: 'ironmine', label: (v) => `+${v}% iron` },
    heat: { plot: 'hearth', label: (v) => `+${v}°C town warmth` },
    heal: { plot: 'infirmary', label: (v) => `+${v}% healing` },
    train: { plot: 'barracks', label: (v) => `+${v}% training speed` },
  },
  heroes: [
    { id: 'sigrun', name: 'Sigrun Ashmantle', rarity: 'legendary', cls: 'guard', hue: 14,
      title: 'Shield of the Last Caravan', steward: { kind: 'heat', val: 3 },
      skill: { name: 'Ember Bulwark', desc: 'Your side takes 15% less damage.', fx: { dr: 0.15 } },
      bio: 'She walked three hundred survivors out of the Grey Cities with a shield and a lantern.' },
    { id: 'kael', name: 'Kael Vire', rarity: 'legendary', cls: 'lancer', hue: 200,
      title: 'Rider of the Rimeway', steward: { kind: 'train', val: 30 },
      skill: { name: 'Avalanche Charge', desc: 'Opening strike deals +45% damage.', fx: { burst: 0.45 } },
      bio: 'His dog teams are the only thing faster than a whiteout.' },
    { id: 'mireille', name: 'Mireille Frost-Eye', rarity: 'legendary', cls: 'bow', hue: 280,
      title: 'Sees Through Any Whiteout', steward: { kind: 'food', val: 25 },
      skill: { name: 'Hailstorm Volley', desc: 'Your side deals +18% damage.', fx: { atk: 0.18 } },
      bio: 'Lost an eye to the frost and swears the other one sees better for it.' },
    { id: 'ondrak', name: 'Ondrak the Unburnt', rarity: 'legendary', cls: 'guard', hue: 30,
      title: 'Wyrm-Whisperer', steward: { kind: 'coal', val: 25 },
      skill: { name: 'Hearthbond', desc: 'Restores 6% of your side\'s health each round.', fx: { heal: 0.06 } },
      bio: 'Raised by the last wyrm-keepers. The Hearthwyrm purrs when he walks past.' },
    { id: 'bram', name: 'Bram Coalhand', rarity: 'epic', cls: 'guard', hue: 25,
      title: 'Pitboss of Blackseam', steward: { kind: 'coal', val: 15 },
      skill: { name: 'Hold the Seam', desc: 'Your side takes 8% less damage.', fx: { dr: 0.08 } },
      bio: 'Thirty years underground. Says the cold up here is the easy part.' },
    { id: 'tove', name: 'Tove Brightneedle', rarity: 'epic', cls: 'bow', hue: 330,
      title: 'Stitcher of Warm Furs', steward: { kind: 'heat', val: 2 },
      skill: { name: 'Needle Rain', desc: 'Your side deals +10% damage.', fx: { atk: 0.1 } },
      bio: 'Her coats have saved more lives than any wall.' },
    { id: 'oskar', name: 'Oskar Rimehart', rarity: 'epic', cls: 'lancer', hue: 190,
      title: 'Dogsled Captain', steward: { kind: 'wood', val: 15 },
      skill: { name: 'Sled Charge', desc: 'Opening strike deals +25% damage.', fx: { burst: 0.25 } },
      bio: 'Hauls timber by day and raiders by night.' },
    { id: 'yara', name: 'Yara Saltwind', rarity: 'epic', cls: 'bow', hue: 160,
      title: 'Huntress of the Drifts', steward: { kind: 'food', val: 15 },
      skill: { name: 'Pinning Shot', desc: 'Your side deals +10% damage.', fx: { atk: 0.1 } },
      bio: 'Tracks a snow hare across a frozen lake in the dark.' },
    { id: 'gunnar', name: 'Gunnar Two-Axe', rarity: 'rare', cls: 'guard', hue: 40,
      title: 'Lumber Boss', steward: { kind: 'wood', val: 10 },
      skill: { name: 'Stubborn', desc: 'Your side takes 5% less damage.', fx: { dr: 0.05 } },
      bio: 'One axe for trees. The other one, he says, is for emergencies.' },
    { id: 'pell', name: 'Pell the Trapper', rarity: 'rare', cls: 'bow', hue: 95,
      title: 'Snare Setter', steward: { kind: 'food', val: 10 },
      skill: { name: 'Quick Draw', desc: 'Opening strike deals +15% damage.', fx: { burst: 0.15 } },
      bio: 'Knows every rabbit run within a day\'s walk.' },
    { id: 'hedda', name: 'Hedda Willowbark', rarity: 'rare', cls: 'guard', hue: 120,
      title: 'Hold Herbalist', steward: { kind: 'heal', val: 25 },
      skill: { name: 'Poultice', desc: 'Restores 3% of your side\'s health each round.', fx: { heal: 0.03 } },
      bio: 'Brews willowbark tea strong enough to wake the dead. Nearly has.' },
    { id: 'lio', name: 'Lio Sparrow', rarity: 'rare', cls: 'lancer', hue: 220,
      title: 'Scout of the Ridge', steward: { kind: 'iron', val: 10 },
      skill: { name: 'Flank', desc: 'Your side deals +6% damage.', fx: { atk: 0.06 } },
      bio: 'Fourteen years old and already the best scout in the hold.' },
  ],
  heroLevelCapPerStar: 10,
  heroMaxStars: 5,
  shardsPerDupe: 10,

  // ---------- Recruitment ----------
  recruit: {
    odds: { legendary: 0.03, epic: 0.17, rare: 0.8 },
    pity: 40, // a Legendary is guaranteed within this many pulls
    firstPull: 'oskar', // tutorial pull fills out the third troop class
    featured: 'ondrak',
    featuredShare: 0.5, // half of Legendary results are the featured hero
    singleCost: 150,
    tenCost: 1350,
  },

  // ---------- Expedition ----------
  chapters: [
    { from: 1, name: 'Whitepine Edge', foes: [['Frost Wolves', 'lancer'], ['Starving Raiders', 'guard'], ['Ice Elk Herd', 'lancer'], ['Raider Archers', 'bow']] },
    { from: 11, name: 'The Hollow Drifts', foes: [['Snow Wraiths', 'bow'], ['Ice Crawlers', 'guard'], ['Frozen Legion', 'guard'], ['Drift Stalkers', 'lancer']] },
    { from: 21, name: "Titan's Reach", foes: [['Rime Golems', 'guard'], ['Hailstorm Harpies', 'bow'], ['Winter Cultists', 'lancer'], ['Shard Hounds', 'lancer']] },
  ],
  bosses: {
    5: ['Rime Alpha', 'lancer'], 10: ['Glacier Bear', 'guard'], 15: ['Hollow Matron', 'bow'],
    20: ['Crystal Mammoth', 'guard'], 25: ['The Pale Herald', 'bow'], 30: ['The Frost Titan', 'guard'],
  },
  maxStage: 30,
  enemy: { atk: 72, def: 42, hp: 820, gAtk: 1.15, gDef: 1.14, gHp: 1.16, boss: 1.6 },
  maxRounds: 12,
  patrolCapMinutes: 120,

  // ---------- Chapter quests ----------
  // check(S, G) returns true when done. G is the game helper namespace.
  quests: [
    { text: 'Build the Coal Pit. The Hearthwyrm is hungry.', go: 'plot:coalpit', check: (S) => S.lv.coalpit >= 1, reward: { coal: 150 } },
    { text: "Upgrade the Hunter's Lodge to Lv 2", go: 'plot:hunter', check: (S) => S.lv.hunter >= 2, reward: { food: 150 } },
    { text: 'Upgrade the Coal Pit to Lv 2', go: 'plot:coalpit', check: (S) => S.lv.coalpit >= 2, reward: { wood: 200 } },
    { text: 'Grow the Hearthwyrm to Lv 2', go: 'plot:hearth', check: (S) => S.lv.hearth >= 2, reward: { beacons: 2, starglass: 100 } },
    { text: 'Build the Infirmary', go: 'plot:infirmary', check: (S) => S.lv.infirmary >= 1, reward: { journals: 15 } },
    { text: 'Recruit a hero at the Beacon', go: 'tab:recruit', check: (S) => S.stats.pulls >= 1, reward: { journals: 20 } },
    { text: 'Raise any hero to Lv 3', go: 'tab:heroes', check: (S) => Object.values(S.heroes).some((h) => h.lvl >= 3), reward: { wood: 300, food: 200 } },
    { text: 'Clear Expedition stage 2', go: 'tab:expedition', check: (S) => S.stage > 2, reward: { starglass: 80 } },
    { text: 'Build the Barracks', go: 'plot:barracks', check: (S) => S.lv.barracks >= 1, reward: { food: 300 } },
    { text: 'Train 20 troops', go: 'plot:barracks', check: (S) => S.stats.trained >= 20, reward: { journals: 20 } },
    { text: 'Build a second Hide Shelter', go: 'plot:shelter2', check: (S) => S.lv.shelter2 >= 1, reward: { wood: 400 } },
    { text: 'Grow the Hearthwyrm to Lv 3', go: 'plot:hearth', check: (S) => S.lv.hearth >= 3, reward: { beacons: 2, coal: 300 } },
    { text: 'Build the Iron Mine', go: 'plot:ironmine', check: (S) => S.lv.ironmine >= 1, reward: { iron: 100 } },
    { text: 'Build the Watchtower', go: 'plot:watchtower', check: (S) => S.lv.watchtower >= 1, reward: { starglass: 100 } },
    { text: 'Clear Expedition stage 5', go: 'tab:expedition', check: (S) => S.stage > 5, reward: { beacons: 2 } },
    { text: 'Station a hero as Steward', go: 'tab:heroes', check: (S) => Object.keys(S.stewards).length >= 1, reward: { journals: 30 } },
    { text: 'Grow the Hearthwyrm to Lv 4', go: 'plot:hearth', check: (S) => S.lv.hearth >= 4, reward: { starglass: 150, iron: 200 } },
    { text: 'Build the Archive of Thaw', go: 'plot:archive', check: (S) => S.lv.archive >= 1, reward: { journals: 30 } },
    { text: 'Complete any research', go: 'plot:archive', check: (S) => S.stats.researched >= 1, reward: { beacons: 2 } },
    { text: 'Clear Expedition stage 10', go: 'tab:expedition', check: (S) => S.stage > 10, reward: { starglass: 200 } },
    { text: 'Shelter 40 survivors', go: 'plot:shelter1', check: (S) => S.pop >= 40, reward: { food: 1500 } },
    { text: 'Grow the Hearthwyrm to Lv 6', go: 'plot:hearth', check: (S) => S.lv.hearth >= 6, reward: { beacons: 3, starglass: 200 } },
    { text: 'Clear Expedition stage 15', go: 'tab:expedition', check: (S) => S.stage > 15, reward: { journals: 80 } },
    { text: 'Grow the Hearthwyrm to Lv 8', go: 'plot:hearth', check: (S) => S.lv.hearth >= 8, reward: { beacons: 5 } },
    { text: 'Clear Expedition stage 20', go: 'tab:expedition', check: (S) => S.stage > 20, reward: { starglass: 400 } },
    { text: 'Raise the Elder Hearthwyrm (Lv 10)', go: 'plot:hearth', check: (S) => S.lv.hearth >= 10, reward: { beacons: 10, starglass: 500 } },
    { text: 'Defeat the Frost Titan (stage 30)', go: 'tab:expedition', check: (S) => S.stage > 30, reward: { starglass: 1000 } },
  ],
  questPassXp: 60,

  // ---------- Hearthkeeper's Ledger (season pass) ----------
  pass: {
    xpPerTier: 250,
    tiers: [
      [{ wood: 300 }, { starglass: 100 }],
      [{ journals: 10 }, { beacons: 2 }],
      [{ food: 300 }, { starglass: 150 }],
      [{ beacons: 1 }, { journals: 30 }],
      [{ coal: 400 }, { starglass: 200 }],
      [{ journals: 15 }, { beacons: 3 }],
      [{ iron: 200 }, { starglass: 250 }],
      [{ starglass: 50 }, { journals: 50 }],
      [{ beacons: 1 }, { beacons: 5 }],
      [{ wood: 1500 }, { starglass: 300 }],
      [{ journals: 20 }, { iron: 1000 }],
      [{ food: 1500 }, { beacons: 5 }],
      [{ beacons: 2 }, { starglass: 400 }],
      [{ starglass: 100 }, { journals: 80 }],
      [{ beacons: 3 }, { skin: 'aurora' }],
    ],
  },

  // ---------- Cosmetics (never affect stats) ----------
  skins: {
    hearth: { name: 'Hearth Gold', body: ['#a8431f', '#f0943a'], belly: '#ffd27a', eye: '#fff2b0', fire: ['#ff6a1f', '#ffd27a'], horn: '#f6e3c0' },
    aurora: { name: 'Aurora Scales', body: ['#136f62', '#6fe6c0'], belly: '#c8fff0', eye: '#e6fffa', fire: ['#2fcf9c', '#d6fff4'], horn: '#e8fff8', usd: 4.99, note: 'Also the final Ledger Premium reward' },
    obsidian: { name: 'Obsidian Ember', body: ['#17151d', '#4b3a50'], belly: '#ff7a3c', eye: '#ff5a2a', fire: ['#ff3d1f', '#ffb36b'], horn: '#c9b8c8', usd: 6.99 },
    sapphire: { name: 'Glacier Sapphire', body: ['#22449a', '#75b3ff'], belly: '#d6ecff', eye: '#ffffff', fire: ['#4ab0ff', '#e0f4ff'], horn: '#eaf4ff', starglass: 1500, note: 'Earnable with free Starglass' },
  },

  // ---------- Store (simulated; StoreKit in the App Store build) ----------
  shop: [
    { id: 'founder', name: "Founder's Cache", usd: 0.99, once: true, tag: 'Best first buy',
      grants: { starglass: 300, beacons: 5, journals: 30, builder2: 1 },
      desc: '300 Starglass, 5 Beacon Tokens, 30 Field Journals and a permanent second builder.' },
    { id: 'stipend', name: 'Ember Stipend', usd: 4.99, tag: '30 days',
      grants: { starglass: 300, stipend: 30 },
      desc: '300 Starglass now, then 90 Starglass every day you log in for 30 days.' },
    { id: 'ledger', name: 'Ledger Premium', usd: 9.99, once: true, tag: 'Season',
      grants: { ledger: 1 },
      desc: 'Unlocks the premium track of the Hearthkeeper\'s Ledger, including the Aurora Scales wyrm skin.' },
    { id: 'sg1', name: 'Pouch of Starglass', usd: 1.99, grants: { starglass: 120 } },
    { id: 'sg2', name: 'Satchel of Starglass', usd: 4.99, grants: { starglass: 330 } },
    { id: 'sg3', name: 'Chest of Starglass', usd: 9.99, grants: { starglass: 700 } },
    { id: 'sg4', name: 'Crate of Starglass', usd: 19.99, grants: { starglass: 1500 } },
    { id: 'sg5', name: 'Vault of Starglass', usd: 49.99, grants: { starglass: 4000 } },
    { id: 'sg6', name: 'Hoard of Starglass', usd: 99.99, grants: { starglass: 8500 } },
  ],
  crateCost: 100, // starglass per supply crate
  crateSize: (res, hearthLvl) => Math.round({ wood: 500, food: 450, coal: 350, iron: 150 }[res] * Math.pow(hearthLvl, 1.4)),
  speedupSecondsPerStarglass: 10,
  freeFinishSeconds: 10,

  passXp: { stage: 30, upgrade: 10, research: 20, pull: 5, train10: 1 },
};
