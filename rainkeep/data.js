/*
 * Rainkeep content tables.
 * Every number a designer would want to tune lives here; the game scripts only read it.
 * Timers and production run ~30x faster than a live-service version would, so the
 * whole game can be played through in a handful of evenings.
 */
'use strict';

const DATA = {
  version: '2.0.0',
  saveKey: 'rainkeep.save.v1',
  offline: { capSeconds: 4 * 3600, efficiency: 0.25 },
  // RevenueCat public SDK key for the App Store build (see NATIVE.md). Empty = simulated store.
  revenueCatApiKey: '',
  // Where PRIVACY.md is hosted (required by the App Store). Shown in Settings when set.
  privacyUrl: '',

  start: {
    res: { stone: 300, food: 200, water: 150, copper: 0 },
    starglass: 300,
    beacons: 3,
    journals: 10,
    survivors: 6,
    heroes: ['bashir', 'nuri'],
    levels: { wyrm: 1, shelter1: 1, quarry: 1, grove: 1 },
    wyrmName: 'Rill',
  },

  // ---------- Climate ----------
  // The sun hunts water: every Rainwyrm level past 1 makes each kind of weather
  // hotter by `scorch` degrees, so storms stay a threat all game.
  // Lower is better: the first band whose max the town temperature stays under applies.
  weather: {
    clear: { name: 'Clear Skies', temp: 40, scorch: 0.5, outdoor: 1 },
    haze: { name: 'Dust Haze', temp: 43, scorch: 0.75, outdoor: 0.85 },
    sandstorm: { name: 'Sandstorm', temp: 47, scorch: 1.75, outdoor: 0.5 },
    heatwave: { name: 'Heatwave', temp: 53, scorch: 2, outdoor: 0.3 },
  },
  comfort: [
    { max: 27.5, name: 'Pleasant', prod: 1.1, sick: 0, lost: 0 },
    { max: 32.5, name: 'Warm', prod: 1, sick: 0, lost: 0 },
    { max: 37.5, name: 'Hot', prod: 0.85, sick: 0.008, lost: 0 },
    { max: 999, name: 'Scorching', prod: 0.7, sick: 0.015, lost: 0.003 },
  ],
  foodPerSurvivor: 0.1,
  waterPerSurvivor: 0.02, // everyone drinks, on top of what the wyrm needs
  arrivalEvery: 10,
  baseRecovery: 0.01,
  infirmaryRate: 0.012, // extra recovery chance per patient per second, per Healer's House level

  // ---------- The Rainwyrm ----------
  wyrm: {
    maxLevel: 15,
    stages: [
      { from: 1, name: 'Hatchling', size: 0.62, line: 'small, thirsty and very curious' },
      { from: 3, name: 'Whelp', size: 0.76, line: 'has unfurled its fins. Its mist now drifts to the edge of the keep.' },
      { from: 5, name: 'Drake', size: 0.9, line: 'has become a Drake, and the heat backs away from the walls.' },
      { from: 7, name: 'Tidewyrm', size: 1.03, line: 'shimmers like deep water. The survivors say the afternoons feel shorter.' },
      { from: 9, name: 'Elder Rainwyrm', size: 1.15, line: 'has become an Elder Rainwyrm. The old songs speak of wyrms like this one.' },
      { from: 12, name: 'Ascended Rainwyrm', size: 1.25, line: 'has ascended. Choose the storm it will carry.' },
      { from: 15, name: 'Primordial Rainwyrm', size: 1.34, line: 'trails a small cloud wherever it flies. The Sunheart can feel it from here.' },
    ],
    cool: (L) => 8 + 1.75 * L, // degrees of shade the mist takes off the town
    drink: (L) => 0.25 + 0.25 * L, // water per second at a Steady mist
    mist: {
      low: { name: 'Drizzle', cool: 0.6, drink: 0.5 },
      steady: { name: 'Steady', cool: 1, drink: 1 },
      high: { name: 'Downpour', cool: 1.45, drink: 2 },
    },
    // Wyrm's Torrent: at the start of every battle the wyrm strikes this share of the foe's health.
    breath: (L) => 0.012 * L,
  },
  ascension: {
    level: 12,
    branches: {
      monsoon: { name: 'Monsoon', color: '#5fd0ff', desc: '+10% production of every resource.', crest: '#d8f6ff' },
      mistveil: { name: 'Mistveil', color: '#b9f0e0', desc: '−3°C town heat, and storms are sighted 60s sooner.', crest: '#f0fffa' },
      floodheart: { name: 'Floodheart', color: '#3a7bff', desc: "Wyrm's Torrent strikes twice as hard and squads deal +8% damage.", crest: '#bcd4ff' },
    },
  },

  // ---------- Buildings ----------
  buildings: {
    wyrm: {
      name: 'Rainwyrm', cost: { stone: 120, water: 80 }, time: 15, growth: 1.8,
      desc: 'The last Rainwyrm. It drinks from your wells and breathes cool mist over the keep, and its growth decides how far your keep can grow.',
    },
    shelter: {
      name: 'Mudbrick Houses', cost: { stone: 60 }, time: 8, growth: 1.75,
      desc: 'Thick walls and shaded courtyards. Every level houses three more survivors.',
      housing: (L) => 4 + 3 * L,
    },
    quarry: {
      name: 'Sandstone Quarry', cost: { stone: 40, food: 20 }, time: 6, growth: 1.75,
      prod: 'stone', perWorker: 0.5, outdoor: true,
      desc: 'Cuts building stone from the cliffs. Outdoor work slows in bad weather.',
    },
    grove: {
      name: 'Date Grove', cost: { stone: 50 }, time: 6, growth: 1.75,
      prod: 'food', perWorker: 0.4, outdoor: true,
      desc: 'Palms, gardens and drip channels keep the cookpots full. Outdoor work slows in bad weather.',
    },
    well: {
      name: 'Deep Well', cost: { stone: 70, food: 30 }, time: 8, growth: 1.75,
      prod: 'water', perWorker: 0.3,
      desc: 'Water for the people and for the wyrm. If the wells run dry, the wyrm sleeps, the heat pours in and the keep goes thirsty.',
    },
    mine: {
      name: 'Copper Mine', cost: { stone: 150, water: 80 }, time: 15, growth: 1.75,
      prod: 'copper', perWorker: 0.2,
      desc: 'Copper for spearheads, pipes and the upper levels of every building.',
    },
    infirmary: {
      name: "Healer's House", cost: { stone: 120, water: 40 }, time: 12, growth: 1.75,
      desc: 'Healers nurse the heatstruck and the thirsty back to work.',
    },
    barracks: {
      name: 'Barracks', cost: { stone: 150, food: 100 }, time: 15, growth: 1.75,
      desc: 'Trains Shieldbearers, Dune Archers and Camel Lancers. More levels mean bigger marches and stronger troops.',
    },
    watchtower: {
      name: 'Watchtower', cost: { stone: 180, water: 60, copper: 30 }, time: 18, growth: 1.75,
      desc: 'Lookouts read the horizon. Each level sees storms and raiders further ahead and steadies your defenders.',
    },
    archive: {
      name: 'Archive of Rains', cost: { stone: 250, water: 120, copper: 60 }, time: 25, growth: 1.75,
      desc: 'Scholars piece together how the old world called the rain. Unlocks research.',
    },
    hall: {
      name: 'Caravan Hall', cost: { stone: 220, food: 120 }, time: 20, growth: 1.75,
      desc: 'Seat of your Caravan. Each level lets more members help your upgrades and lets you donate more often.',
    },
    storehouse: {
      name: 'Storehouse', cost: { stone: 260, water: 100, copper: 40 }, time: 20, growth: 1.75,
      desc: 'Deep sandstone vaults. Resources up to the protected amount can never be stolen by raiders.',
      protect: (L) => Math.round(400 * Math.pow(L, 1.7)),
    },
  },
  copperShareFrom: 4, // levels >= this also cost copper (22% of the stone cost)
  lateLevel: 10, // past this level costs and timers grow more gently
  lateCostGrowth: 1.45,
  buildTimeGrowth: 1.42,
  lateTimeGrowth: 1.12,
  workerSlots: (L) => 3 + L,
  workerGrowth: 0.15, // per-worker output gain per building level

  // Fixed plots around the wyrm's spring, front (bottom of screen) first, going clockwise.
  plots: [
    { id: 'well', type: 'well', unlock: 1 },
    { id: 'quarry', type: 'quarry', unlock: 1 },
    { id: 'shelter1', type: 'shelter', unlock: 1 },
    { id: 'infirmary', type: 'infirmary', unlock: 2 },
    { id: 'storehouse', type: 'storehouse', unlock: 5 },
    { id: 'archive', type: 'archive', unlock: 4 },
    { id: 'watchtower', type: 'watchtower', unlock: 3 },
    { id: 'hall', type: 'hall', unlock: 4 },
    { id: 'barracks', type: 'barracks', unlock: 2 },
    { id: 'shelter2', type: 'shelter', unlock: 2 },
    { id: 'grove', type: 'grove', unlock: 1 },
    { id: 'mine', type: 'mine', unlock: 3 },
  ],
  wyrmReqs: (to) => {
    if (to < 2) return [];
    const r = [{ plot: 'well', lvl: to - 1 }, { plot: 'shelter1', lvl: to - 1 }];
    if (to >= 5) r.push({ plot: 'mine', lvl: to - 2 });
    if (to >= 8) r.push({ plot: 'storehouse', lvl: to - 3 });
    if (to >= 11) r.push({ plot: 'barracks', lvl: to - 2 });
    if (to >= 13) r.push({ plot: 'archive', lvl: to - 4 });
    return r;
  },

  // ---------- Research ----------
  techs: [
    { id: 'shade', name: 'Shade Sails', desc: '−1°C town heat per level', cost: { stone: 200, copper: 40 }, time: 20 },
    { id: 'chisels', name: 'Bronze Chisels', desc: '+12% stone per level', cost: { stone: 150, food: 100 }, time: 15 },
    { id: 'irrigation', name: 'Drip Irrigation', desc: '+12% food per level', cost: { stone: 150, water: 60 }, time: 15 },
    { id: 'boring', name: 'Deep Boring', desc: '+12% water per level', cost: { stone: 180, food: 120 }, time: 18 },
    { id: 'smelt', name: 'Bellows Smelting', desc: '+12% copper per level', cost: { stone: 220, water: 150 }, time: 20 },
    { id: 'medicine', name: 'Aloe Tinctures', desc: '+30% healing per level', cost: { food: 200, water: 80 }, time: 18 },
    { id: 'drills', name: 'Shield Drills', desc: '+6% troop attack and defense per level', cost: { food: 250, copper: 60 }, time: 25 },
    { id: 'mirrors', name: 'Signal Mirrors', desc: '+30s storm and raider warning per level', cost: { stone: 200, copper: 30 }, time: 18 },
    { id: 'camels', name: 'Camel Trains', desc: '+10% gathering speed and load per level', cost: { stone: 260, copper: 50 }, time: 22 },
    { id: 'tactics', name: 'Hero Tactics', desc: '+5% hero attack, defense and health per level', cost: { food: 300, copper: 80 }, time: 28 },
  ],
  techMaxLevel: 10,
  techGrowth: 1.65,
  techTimeGrowth: 1.5,

  // ---------- Troops ----------
  troops: {
    guard: { name: 'Shieldbearers', atk: 1.5, def: 3, hp: 25, cost: { food: 4, stone: 2 } },
    bow: { name: 'Dune Archers', atk: 3, def: 1.2, hp: 15, cost: { food: 3, stone: 4 } },
    lancer: { name: 'Camel Lancers', atk: 2.5, def: 2, hp: 20, cost: { food: 5, copper: 1 }, needs: 'mine' },
  },
  trainSecondsPerUnit: 0.5,
  troopLevelBonus: 0.12, // troops get this much stronger (compounding) per Barracks level past 1
  marchCap: (L) => (L ? 30 + 25 * L : 0),
  // key beats value
  counters: { guard: 'lancer', lancer: 'bow', bow: 'guard' },
  classes: {
    guard: { name: 'Shieldbearer', icon: 'i-guard' },
    bow: { name: 'Dune Archer', icon: 'i-bow' },
    lancer: { name: 'Camel Lancer', icon: 'i-lancer' },
  },

  // ---------- Heroes ----------
  rarities: {
    rare: { name: 'Rare', atk: 40, def: 30, hp: 400 },
    epic: { name: 'Epic', atk: 60, def: 45, hp: 600 },
    legendary: { name: 'Legendary', atk: 90, def: 65, hp: 900 },
  },
  stewardPosts: {
    stone: { plot: 'quarry', label: (v) => `+${v}% stone` },
    food: { plot: 'grove', label: (v) => `+${v}% food` },
    water: { plot: 'well', label: (v) => `+${v}% water` },
    copper: { plot: 'mine', label: (v) => `+${v}% copper` },
    cool: { plot: 'wyrm', label: (v) => `−${v}°C town heat` },
    heal: { plot: 'infirmary', label: (v) => `+${v}% healing` },
    train: { plot: 'barracks', label: (v) => `+${v}% training speed` },
    gather: { plot: 'watchtower', label: (v) => `+${v}% gathering speed` },
  },
  // look: portrait details. skin 0-5, hair/cloth colors, wrap = head covering style
  heroes: [
    { id: 'zahra', name: 'Zahra Sunshield', rarity: 'legendary', cls: 'guard', hue: 14,
      title: 'Shield of the Last Caravan', steward: { kind: 'cool', val: 1.5 },
      look: { skin: 2, hair: '#1d1410', wrap: 'hood', cloth: '#b5452a', trim: '#f2c46b', mark: 'scar' },
      skill: { name: 'Sunward Bulwark', desc: 'Your side takes {dr} less damage.', fx: { dr: 0.15 } },
      bio: 'She walked three hundred people out of the Glass Cities with a shield and a lantern.' },
    { id: 'tariq', name: 'Tariq Windrider', rarity: 'legendary', cls: 'lancer', hue: 200,
      title: 'Rider of the Long Road', steward: { kind: 'train', val: 30 },
      look: { skin: 3, hair: '#120d0b', wrap: 'turban', cloth: '#1f5f8b', trim: '#e8d39a', beard: '#120d0b' },
      skill: { name: 'Dune Charge', desc: 'Opening strike deals {burst} extra damage.', fx: { burst: 0.45 } },
      bio: 'His camels are the only thing on the Dunes faster than a sandstorm.' },
    { id: 'leila', name: 'Leila Farsight', rarity: 'legendary', cls: 'bow', hue: 280,
      title: 'Sees Through Any Sandstorm', steward: { kind: 'food', val: 25 },
      look: { skin: 1, hair: '#2a1a14', wrap: 'scarf', cloth: '#5b3d92', trim: '#d8c3ff', mark: 'patch' },
      skill: { name: 'Sunfall Volley', desc: 'Your side deals {atk} more damage.', fx: { atk: 0.18 } },
      bio: 'Lost an eye to a sandstorm and swears the other one sees farther for it.' },
    { id: 'idris', name: 'Idris the Unparched', rarity: 'legendary', cls: 'guard', hue: 190,
      title: 'Wyrm-Whisperer', steward: { kind: 'water', val: 25 },
      look: { skin: 4, hair: '#e8e2d6', wrap: 'turban', cloth: '#1d7a7a', trim: '#9ff0e6', beard: '#e8e2d6' },
      skill: { name: 'Rainbond', desc: "Restores {heal} of your side's health each round.", fx: { heal: 0.06 } },
      bio: 'Raised by the last wyrm-keepers. The Rainwyrm hums when he walks past.' },
    { id: 'soraya', name: 'Soraya Dawnbringer', rarity: 'legendary', cls: 'lancer', hue: 45,
      title: 'Herald of the Rains', steward: { kind: 'gather', val: 40 },
      look: { skin: 0, hair: '#7a3b1c', wrap: 'circlet', cloth: '#c98a1d', trim: '#fff1b8' },
      skill: { name: 'First Rain', desc: 'Opening strike deals {burst} extra damage.', fx: { burst: 0.55 } },
      bio: 'Swears she saw rain once, for a single morning, far to the north.' },
    { id: 'nadia', name: 'Nadia Glasshand', rarity: 'legendary', cls: 'bow', hue: 165,
      title: 'Huntress of the Glass Sea', steward: { kind: 'copper', val: 25 },
      look: { skin: 5, hair: '#0f0b0a', wrap: 'scarf', cloth: '#1f6b5a', trim: '#a8f0d8' },
      skill: { name: 'Glasspiercer', desc: "Ignores {pierce} of the enemy's defense.", fx: { pierce: 0.3 } },
      bio: 'Her arrowheads are knapped from the glass of the old sea floor. They do not break.' },
    { id: 'bashir', name: 'Bashir Deepwell', rarity: 'epic', cls: 'guard', hue: 25,
      title: 'Wellmaster', steward: { kind: 'water', val: 15 },
      look: { skin: 3, hair: '#2b1d14', wrap: 'cap', cloth: '#8a5a2b', trim: '#f0c27a', beard: '#3b2a1d' },
      skill: { name: 'Hold the Shaft', desc: 'Your side takes {dr} less damage.', fx: { dr: 0.08 } },
      bio: 'Thirty years down the wells. Says the heat up here is the easy part.' },
    { id: 'amira', name: 'Amira Brightloom', rarity: 'epic', cls: 'bow', hue: 330,
      title: 'Weaver of Shade', steward: { kind: 'cool', val: 1 },
      look: { skin: 1, hair: '#3a2218', wrap: 'scarf', cloth: '#a8326a', trim: '#ffc2dc' },
      skill: { name: 'Needle Rain', desc: 'Your side deals {atk} more damage.', fx: { atk: 0.1 } },
      bio: 'Her shade sails have saved more lives than any wall.' },
    { id: 'kofi', name: 'Kofi Saltroad', rarity: 'epic', cls: 'lancer', hue: 35,
      title: 'Caravan Captain', steward: { kind: 'stone', val: 15 },
      look: { skin: 5, hair: '#0f0b0a', wrap: 'turban', cloth: '#6b4a2e', trim: '#e9c88a', beard: '#1a120e' },
      skill: { name: 'Camel Charge', desc: 'Opening strike deals {burst} extra damage.', fx: { burst: 0.25 } },
      bio: 'Hauls stone by day and raiders by night.' },
    { id: 'yara', name: 'Yara Swiftfoot', rarity: 'epic', cls: 'bow', hue: 150,
      title: 'Huntress of the Dunes', steward: { kind: 'food', val: 15 },
      look: { skin: 2, hair: '#4a2a18', wrap: 'braid', cloth: '#3f7a3a', trim: '#cfe8a0' },
      skill: { name: 'Pinning Shot', desc: 'Your side deals {atk} more damage.', fx: { atk: 0.1 } },
      bio: 'Tracks a sand hare across the dunes in the dark.' },
    { id: 'rashid', name: 'Rashid Gatebreaker', rarity: 'epic', cls: 'guard', hue: 0,
      title: 'Raid Breaker', steward: { kind: 'train', val: 20 },
      look: { skin: 4, hair: '#1a120e', wrap: 'helm', cloth: '#8b2a22', trim: '#e0a070', beard: '#1a120e' },
      skill: { name: 'Copper Wall', desc: 'Your side takes {dr} less damage.', fx: { dr: 0.1 } },
      bio: 'Held the east gate alone for a night. Does not like to talk about it.' },
    { id: 'samira', name: 'Samira Whisperwind', rarity: 'epic', cls: 'lancer', hue: 250,
      title: 'Courier of the Dunes', steward: { kind: 'gather', val: 25 },
      look: { skin: 0, hair: '#1d1410', wrap: 'veil', cloth: '#3b4a9a', trim: '#c8d0ff' },
      skill: { name: 'Slipstream', desc: "Ignores {pierce} of the enemy's defense.", fx: { pierce: 0.15 } },
      bio: 'Carries letters between keeps that have never met. Reads none of them. Probably.' },
    { id: 'omar', name: 'Omar Two-Picks', rarity: 'rare', cls: 'guard', hue: 40,
      title: 'Quarry Boss', steward: { kind: 'stone', val: 10 },
      look: { skin: 2, hair: '#5a3a20', wrap: 'cap', cloth: '#9a6a2e', trim: '#f0d08a', beard: '#a8682e' },
      skill: { name: 'Stubborn', desc: 'Your side takes {dr} less damage.', fx: { dr: 0.05 } },
      bio: 'One pick for stone. The other one, he says, is for emergencies.' },
    { id: 'nuri', name: 'Nuri the Trapper', rarity: 'rare', cls: 'bow', hue: 95,
      title: 'Snare Setter', steward: { kind: 'food', val: 10 },
      look: { skin: 3, hair: '#2b1d14', wrap: 'scarf', cloth: '#6a7a2e', trim: '#e0e8a0' },
      skill: { name: 'Quick Draw', desc: 'Opening strike deals {burst} extra damage.', fx: { burst: 0.15 } },
      bio: "Knows every hare run within a day's walk." },
    { id: 'halima', name: 'Halima Aloe', rarity: 'rare', cls: 'guard', hue: 120,
      title: 'Keep Herbalist', steward: { kind: 'heal', val: 25 },
      look: { skin: 4, hair: '#d9d2c4', wrap: 'veil', cloth: '#2e7a4a', trim: '#b8f0c8' },
      skill: { name: 'Poultice', desc: "Restores {heal} of your side's health each round.", fx: { heal: 0.03 } },
      bio: 'Brews aloe tonics strong enough to wake the dead. Nearly has.' },
    { id: 'lio', name: 'Lio Sparrow', rarity: 'rare', cls: 'lancer', hue: 220,
      title: 'Scout of the Ridge', steward: { kind: 'copper', val: 10 },
      look: { skin: 1, hair: '#6b3a1c', wrap: 'none', cloth: '#2c5d8f', trim: '#bfe0ff' },
      skill: { name: 'Flank', desc: 'Your side deals {atk} more damage.', fx: { atk: 0.06 } },
      bio: 'Fourteen years old and already the best scout in the keep.' },
    { id: 'tamir', name: 'Tamir Kettle', rarity: 'rare', cls: 'bow', hue: 60,
      title: 'Camp Cook', steward: { kind: 'food', val: 10 },
      look: { skin: 2, hair: '#3b2a1d', wrap: 'cap', cloth: '#a0782a', trim: '#fff0b0', beard: '#7a5434' },
      skill: { name: 'Spiced Stew', desc: "Restores {heal} of your side's health each round.", fx: { heal: 0.02 } },
      bio: 'Fights with a sling, a ladle, and opinions about seasoning.' },
    { id: 'mara', name: 'Mara Windcatch', rarity: 'rare', cls: 'lancer', hue: 185,
      title: 'Tower Builder', steward: { kind: 'cool', val: 1 },
      look: { skin: 0, hair: '#b0542a', wrap: 'goggles', cloth: '#2a7a8a', trim: '#b0f0ff' },
      skill: { name: 'Gust Lance', desc: 'Opening strike deals {burst} extra damage.', fx: { burst: 0.15 } },
      bio: 'Builds windcatcher towers that pull the breeze down cool through the houses. Claims she has never once been too hot.' },
  ],
  heroLevelCapPerStar: 10,
  heroCapPerWyrm: 5, // each Rainwyrm level past 9 raises every hero's level cap by this much
  heroMaxStars: 5,
  shardsPerDupe: { rare: 10, epic: 15, legendary: 25 }, // shards a duplicate recruit gives; each star costs 10 x current stars
  skillPerStar: 0.2, // hero skills grow 20% stronger per star past the first

  // ---------- Recruitment ----------
  recruit: {
    odds: { legendary: 0.03, epic: 0.17, rare: 0.8 },
    pity: 40, // a Legendary is guaranteed within this many pulls
    firstPull: 'kofi', // tutorial pull fills out the third troop class
    featuredShare: 0.5, // half of Legendary results are the featured hero (it rotates each event)
    singleCost: 150,
    tenCost: 1350,
  },

  // ---------- Expedition ----------
  chapters: [
    { from: 1, name: 'The Salt Flats', foes: [['Dune Jackals', 'lancer'], ['Thirsty Raiders', 'guard'], ['Sand Vipers', 'lancer'], ['Raider Slingers', 'bow']],
      story: 'The salt flats around the keep crack like old pottery. Jackals hunt along the cracks, and so do raiders who would kill for a full waterskin. Clear the flats and the quarry crews can work in peace.' },
    { from: 11, name: 'The Singing Dunes', foes: [['Dust Wraiths', 'bow'], ['Sand Crawlers', 'guard'], ['Bone Legion', 'guard'], ['Dune Stalkers', 'lancer']],
      story: 'Beyond the flats the dunes hum whenever the wind crosses them. Things move under the sand, and the scouts swear something down there hums back.' },
    { from: 21, name: 'Colossus Road', foes: [['Sandstone Golems', 'guard'], ['Sun Harpies', 'bow'], ['Ember Cultists', 'lancer'], ['Glass Hounds', 'lancer']],
      story: 'Footprints the size of houses, baked into the rock, lead south. The old songs say whatever made them is the reason the rain stopped.' },
    { from: 31, name: 'The Glass Sea', foes: [['Glassback Scorpions', 'guard'], ['Mirage Wraiths', 'bow'], ['Glass Serpents', 'lancer'], ['Salt Reavers', 'lancer']],
      story: 'Where the Colossus fell, the old sea floor melted into a plain of green glass. Under it, ships lie where the water left them, lanterns still hanging from their masts.' },
    { from: 41, name: 'The Buried Spires', foes: [['Bell Cultists', 'bow'], ['Spire Sentinels', 'guard'], ['Dust Riders', 'lancer'], ['Choir of Ash', 'bow']],
      story: 'A city swallowed by the dunes, only its bell towers still above the sand. Somebody down there rings the bells every noon.' },
    { from: 51, name: 'The Sunheart', foes: [['Sun Hounds', 'lancer'], ['Hollow Knights', 'guard'], ['Ashen Archers', 'bow'], ['Burning Seraphs', 'bow']],
      story: 'At the end of every road lies the reason the sky forgot how to rain: a fallen shard of the sun the size of a mountain, pulsing once an hour. Your wyrm can feel it. It can feel your wyrm.' },
    { from: 61, name: 'The Burning Line', foes: [['Sunborn Host', 'guard'], ['Scorchline Riders', 'lancer'], ['Pale Archers', 'bow'], ['Glass Titans', 'guard']],
      story: 'The Sunheart is quenched, but its heat still bakes the far south. Push the Burning Line back as far as your keep can reach.' },
  ],
  bosses: {
    5: ['Jackal Alpha', 'lancer'], 10: ['Salt Behemoth', 'guard'], 15: ['Dust Matron', 'bow'],
    20: ['Basalt Tortoise', 'guard'], 25: ['The Pale Herald', 'bow'], 30: ['The Sand Colossus', 'guard'],
    35: ['Shatterjaw Sandshark', 'lancer'], 40: ['The Mirage Queen', 'bow'], 45: ['The Buried Bellringer', 'guard'],
    50: ['Spire Colossus', 'guard'], 55: ['The Hollow King', 'lancer'], 60: ['The Sunheart', 'guard'],
  },
  finalStage: 60, // beating this ends the story; stages past it are the endless Burning Line
  // stage n foe: base x growth^(n-1) through stage 30, then gentler late growth to 60, then the endless curve
  enemy: { atk: 72, def: 42, hp: 820, gAtk: 1.13, gDef: 1.12, gHp: 1.14, lateFrom: 30, lAtk: 1.027, lDef: 1.022, lHp: 1.032, endAtk: 1.03, endDef: 1.025, endHp: 1.035, boss: 1.5 },
  maxRounds: 12,
  patrolCapMinutes: 120,
  ending: {
    title: 'The Rains',
    lines: [
      'The Sunheart dims like an ember dropped into a well, and then, all at once, it goes dark.',
      'That night, clouds gather over the keep for the first time in a generation. When the first drops hit the sand, the children run outside. They have never felt rain. They stand in the square with their faces turned up, laughing.',
      "It isn't the old world yet. The Burning Line still bakes the far south. But the wells are rising, and the sky is a little softer than it was yesterday.",
      '{wyrm} curls up beside the deepest well and sleeps a long, cool sleep.',
    ],
    reward: { starglass: 2000, beacons: 10, skin: 'firstrain' },
  },

  // ---------- Chapter quests ----------
  // check(S) returns true when done. go: 'plot:<id>' | 'tab:<tab>' | 'sheet:<kind>'
  quests: [
    { text: 'Dig the Deep Well. The Rainwyrm is thirsty.', go: 'plot:well', check: (S) => S.lv.well >= 1, reward: { water: 150 } },
    { text: 'Upgrade the Date Grove to Lv 2', go: 'plot:grove', check: (S) => S.lv.grove >= 2, reward: { food: 150 } },
    { text: 'Upgrade the Deep Well to Lv 2', go: 'plot:well', check: (S) => S.lv.well >= 2, reward: { stone: 200 } },
    { text: 'Grow the Rainwyrm to Lv 2', go: 'plot:wyrm', check: (S) => S.lv.wyrm >= 2, reward: { beacons: 2, starglass: 100 } },
    { text: 'Pet your Rainwyrm', go: 'plot:wyrm', check: (S) => S.stats.pets >= 1, reward: { journals: 10 } },
    { text: "Build the Healer's House", go: 'plot:infirmary', check: (S) => S.lv.infirmary >= 1, reward: { journals: 15 } },
    { text: 'Recruit a hero at the Beacon', go: 'tab:recruit', check: (S) => S.stats.pulls >= 1, reward: { journals: 20 } },
    { text: 'Raise any hero to Lv 3', go: 'tab:heroes', check: (S) => Object.values(S.heroes).some((h) => h.lvl >= 3), reward: { stone: 300, food: 200 } },
    { text: 'Clear Expedition stage 2', go: 'tab:expedition', check: (S) => S.stage > 2, reward: { starglass: 80 } },
    { text: 'Build the Barracks', go: 'plot:barracks', check: (S) => S.lv.barracks >= 1, reward: { food: 300 } },
    { text: 'Train 20 troops', go: 'plot:barracks', check: (S) => S.stats.trained >= 20, reward: { journals: 20 } },
    { text: 'Send a gathering march out on the Dunes', go: 'tab:world', check: (S) => S.stats.gathers >= 1, reward: { stone: 400, speed5: 1 } },
    { text: 'Build a second block of Mudbrick Houses', go: 'plot:shelter2', check: (S) => S.lv.shelter2 >= 1, reward: { stone: 400 } },
    { text: 'Grow the Rainwyrm to Lv 3', go: 'plot:wyrm', check: (S) => S.lv.wyrm >= 3, reward: { beacons: 2, water: 300 } },
    { text: 'Build the Copper Mine', go: 'plot:mine', check: (S) => S.lv.mine >= 1, reward: { copper: 100 } },
    { text: 'Build the Watchtower', go: 'plot:watchtower', check: (S) => S.lv.watchtower >= 1, reward: { starglass: 100 } },
    { text: 'Explore a ruin on the Dunes', go: 'tab:world', check: (S) => S.stats.ruins >= 1, reward: { journals: 25 } },
    { text: 'Clear Expedition stage 5', go: 'tab:expedition', check: (S) => S.stage > 5, reward: { beacons: 2 } },
    { text: 'Station a hero as Steward', go: 'tab:heroes', check: (S) => Object.keys(S.stewards).length >= 1, reward: { journals: 30 } },
    { text: 'Grow the Rainwyrm to Lv 4', go: 'plot:wyrm', check: (S) => S.lv.wyrm >= 4, reward: { starglass: 150, copper: 200 } },
    { text: 'Build the Caravan Hall', go: 'plot:hall', check: (S) => S.lv.hall >= 1, reward: { food: 500 } },
    { text: 'Join a Caravan', go: 'tab:caravan', check: (S) => !!S.caravan.joined, reward: { beacons: 2, speed15: 1 } },
    { text: 'Build the Archive of Rains', go: 'plot:archive', check: (S) => S.lv.archive >= 1, reward: { journals: 30 } },
    { text: 'Complete any research', go: 'plot:archive', check: (S) => S.stats.researched >= 1, reward: { beacons: 2 } },
    { text: 'Slay a beast on the Dunes', go: 'tab:world', check: (S) => S.stats.beasts >= 1, reward: { journals: 30 } },
    { text: 'Donate to your Caravan', go: 'tab:caravan', check: (S) => S.stats.donations >= 1, reward: { starglass: 100 } },
    { text: 'Clear Expedition stage 10', go: 'tab:expedition', check: (S) => S.stage > 10, reward: { starglass: 200 } },
    { text: 'Grow the Rainwyrm to Lv 5', go: 'plot:wyrm', check: (S) => S.lv.wyrm >= 5, reward: { beacons: 3 } },
    { text: 'Build the Storehouse', go: 'plot:storehouse', check: (S) => S.lv.storehouse >= 1, reward: { copper: 300 } },
    { text: 'Open a Daily Duties chest', go: 'sheet:duties', check: (S) => S.stats.dutyChests >= 1, reward: { speed15: 2 } },
    { text: 'Shelter 40 survivors', go: 'plot:shelter1', check: (S) => S.pop >= 40, reward: { food: 1500 } },
    { text: 'Grow the Rainwyrm to Lv 6', go: 'plot:wyrm', check: (S) => S.lv.wyrm >= 6, reward: { beacons: 3, starglass: 200 } },
    { text: 'Strike the Colossus in a Caravan raid', go: 'tab:caravan', check: (S) => S.stats.raidAttacks >= 1, reward: { journals: 60 } },
    { text: 'Clear Expedition stage 15', go: 'tab:expedition', check: (S) => S.stage > 15, reward: { journals: 80 } },
    { text: 'Repel a raider attack on the keep', go: 'plot:watchtower', check: (S) => S.stats.raidsRepelled >= 1, reward: { starglass: 200 } },
    { text: 'Grow the Rainwyrm to Lv 8', go: 'plot:wyrm', check: (S) => S.lv.wyrm >= 8, reward: { beacons: 5 } },
    { text: 'Clear Expedition stage 20', go: 'tab:expedition', check: (S) => S.stage > 20, reward: { starglass: 400 } },
    { text: 'Grow the Rainwyrm to Lv 10', go: 'plot:wyrm', check: (S) => S.lv.wyrm >= 10, reward: { beacons: 6, shard_epic: 1 } },
    { text: 'Defeat the Sand Colossus (stage 30)', go: 'tab:expedition', check: (S) => S.stage > 30, reward: { starglass: 600, shard_legendary: 1 } },
    { text: "Choose your Rainwyrm's Ascension (Lv 12)", go: 'plot:wyrm', check: (S) => !!S.wyrm.element, reward: { beacons: 8 } },
    { text: 'Destroy a Scorpion raider camp', go: 'tab:world', check: (S) => S.stats.camps >= 1, reward: { starglass: 300 } },
    { text: 'Clear Expedition stage 40', go: 'tab:expedition', check: (S) => S.stage > 40, reward: { starglass: 600 } },
    { text: 'Clear Expedition stage 50', go: 'tab:expedition', check: (S) => S.stage > 50, reward: { beacons: 10 } },
    { text: 'Raise the Primordial Rainwyrm (Lv 15)', go: 'plot:wyrm', check: (S) => S.lv.wyrm >= 15, reward: { starglass: 1000, shard_legendary: 1 } },
    { text: 'Quench the Sunheart (stage 60)', go: 'tab:expedition', check: (S) => S.stage > 60, reward: { starglass: 1500 } },
  ],
  questPassXp: 60,

  // ---------- Wellkeeper's Ledger (season pass) ----------
  pass: {
    xpPerTier: 250,
    tiers: [
      [{ stone: 300 }, { starglass: 100 }],
      [{ journals: 10 }, { beacons: 2 }],
      [{ food: 300 }, { starglass: 150 }],
      [{ beacons: 1 }, { journals: 30 }],
      [{ water: 400 }, { speed15: 2 }],
      [{ journals: 15 }, { beacons: 3 }],
      [{ copper: 200 }, { starglass: 250 }],
      [{ speed5: 2 }, { journals: 50 }],
      [{ beacons: 1 }, { beacons: 5 }],
      [{ stone: 1500 }, { shard_epic: 1 }],
      [{ journals: 20 }, { copper: 1000 }],
      [{ food: 1500 }, { beacons: 5 }],
      [{ beacons: 2 }, { starglass: 400 }],
      [{ starglass: 100 }, { speed60: 2 }],
      [{ speed15: 2 }, { skin: 'oasis' }],
      [{ water: 3000 }, { starglass: 300 }],
      [{ journals: 40 }, { beacons: 5 }],
      [{ beacons: 2 }, { journals: 120 }],
      [{ copper: 2000 }, { shard_epic: 2 }],
      [{ starglass: 150 }, { starglass: 500 }],
      [{ speed60: 1 }, { beacons: 6 }],
      [{ stone: 6000 }, { speed60: 3 }],
      [{ journals: 60 }, { starglass: 500 }],
      [{ beacons: 3 }, { shard_legendary: 1 }],
      [{ food: 6000 }, { journals: 200 }],
      [{ starglass: 200 }, { beacons: 8 }],
      [{ speed60: 2 }, { starglass: 600 }],
      [{ copper: 4000 }, { shard_legendary: 1 }],
      [{ beacons: 4 }, { starglass: 800 }],
      [{ shard_epic: 1 }, { skin: 'sandglass' }],
    ],
  },

  // ---------- Cosmetics (never affect stats) ----------
  // body: back/belly gradient, fin: crest and fins, mist: breath colors
  skins: {
    river: { name: 'River Teal', body: ['#16809c', '#45d4da'], belly: '#c9f6ea', eye: '#fff4b8', mist: ['#8be6ff', '#eafcff'], fin: '#7ff0e0', horn: '#f4e6c8' },
    oasis: { name: 'Oasis Jade', body: ['#1c6a3c', '#7bd56a'], belly: '#eaffd2', eye: '#fffbe0', mist: ['#b0f5bc', '#f2fff2'], fin: '#d6ff9a', horn: '#f2e8c8', usd: 4.99, note: 'Also a Ledger Premium reward' },
    obsidian: { name: 'Obsidian Tide', body: ['#141822', '#3d4a68'], belly: '#58d7ff', eye: '#7ff0ff', mist: ['#3ad0ff', '#c8f4ff'], fin: '#3ad0ff', horn: '#c9c3d6', usd: 6.99 },
    sapphire: { name: 'Deepwater Sapphire', body: ['#1b3a96', '#5aa2ff'], belly: '#d6ecff', eye: '#ffffff', mist: ['#6cb8ff', '#e6f4ff'], fin: '#9fd0ff', horn: '#eaf4ff', starglass: 1500, note: 'Earnable with free Starglass' },
    sandglass: { name: 'Sandglass', body: ['#7e5f34', '#e2c287'], belly: '#fff3d6', eye: '#ff9a4a', mist: ['#ffd9a0', '#fff6e4'], fin: '#ffb35c', horn: '#fffaf0', note: 'Final Ledger Premium reward', locked: true },
    firstrain: { name: 'First Rain', body: ['#4e3aa0', '#8fc8ff'], belly: '#f1f7ff', eye: '#ffffff', mist: ['#c9b6ff', '#ffffff'], fin: '#ffd6f2', horn: '#fff8e6', note: 'Quench the Sunheart', locked: true },
  },

  // ---------- Store (simulated on the web; StoreKit via RevenueCat in the app) ----------
  shop: [
    { id: 'founder', name: "Founder's Cache", usd: 0.99, once: true, tag: 'Best first buy',
      grants: { starglass: 300, beacons: 5, journals: 30, builder2: 1 },
      desc: '300 Starglass, 5 Beacon Tokens, 30 Field Journals and a permanent second builder.' },
    { id: 'stipend', name: 'Oasis Stipend', usd: 4.99, tag: '30 days',
      grants: { starglass: 300, stipend: 30 },
      desc: '300 Starglass now, then 90 Starglass every day you log in for 30 days.' },
    { id: 'ledger', name: 'Ledger Premium', usd: 9.99, once: true, tag: 'Season',
      grants: { ledger: 1 },
      desc: "Unlocks the premium track of the Wellkeeper's Ledger, including the Oasis Jade and Sandglass wyrm skins." },
    { id: 'growth', name: 'Growth Fund', usd: 14.99, once: true, tag: '6,000 Starglass',
      grants: { growth: 1 },
      desc: 'Pays out Starglass each time your Rainwyrm reaches Lv 5, 8, 10, 12 and 15. 6,000 in total.' },
    { id: 'stormkit', name: 'Sandstorm Kit', usd: 2.99, daily: true, tag: 'Daily',
      grants: { speed15: 3, crate_water: 2, beacons: 2 },
      desc: 'Three 15-minute speedups, two water crates and two Beacon Tokens. Once per day.' },
    { id: 'warchest', name: "Warden's War Chest", usd: 19.99, tag: 'Value',
      grants: { starglass: 1600, beacons: 10, shard_legendary: 1 },
      desc: '1,600 Starglass, 10 Beacon Tokens and a Legendary Shard Pouch.' },
    { id: 'sg1', name: 'Pouch of Starglass', usd: 1.99, grants: { starglass: 120 } },
    { id: 'sg2', name: 'Satchel of Starglass', usd: 4.99, grants: { starglass: 330 } },
    { id: 'sg3', name: 'Chest of Starglass', usd: 9.99, grants: { starglass: 700 } },
    { id: 'sg4', name: 'Crate of Starglass', usd: 19.99, grants: { starglass: 1500 } },
    { id: 'sg5', name: 'Vault of Starglass', usd: 49.99, grants: { starglass: 4000 } },
    { id: 'sg6', name: 'Hoard of Starglass', usd: 99.99, grants: { starglass: 8500 } },
  ],
  growthFund: [[5, 800], [8, 1000], [10, 1200], [12, 1400], [15, 1600]],
  crateCost: 100, // starglass per supply crate
  crateSize: (res, wyrmLvl) => Math.round({ stone: 500, food: 450, water: 350, copper: 150 }[res] * Math.pow(wyrmLvl, 1.4)),
  speedupSecondsPerStarglass: 10,
  freeFinishSeconds: 10,

  passXp: { stage: 30, upgrade: 10, research: 20, pull: 5, train10: 1, beast: 15, gather: 10, duty: 5 },

  // ---------- Backpack items ----------
  items: {
    speed1: { name: '1-minute Speedup', kind: 'speed', secs: 60, icon: 'i-clock' },
    speed5: { name: '5-minute Speedup', kind: 'speed', secs: 300, icon: 'i-clock' },
    speed15: { name: '15-minute Speedup', kind: 'speed', secs: 900, icon: 'i-clock' },
    speed60: { name: '1-hour Speedup', kind: 'speed', secs: 3600, icon: 'i-clock' },
    crate_stone: { name: 'Stone Crate', kind: 'crate', res: 'stone', icon: 'i-stone' },
    crate_food: { name: 'Food Crate', kind: 'crate', res: 'food', icon: 'i-food' },
    crate_water: { name: 'Water Crate', kind: 'crate', res: 'water', icon: 'i-water' },
    crate_copper: { name: 'Copper Crate', kind: 'crate', res: 'copper', icon: 'i-copper' },
    shard_epic: { name: 'Epic Shard Pouch', kind: 'shards', rarity: 'epic', n: 10, icon: 'i-star', desc: 'Pick any Epic hero: recruit them, or add 10 shards if you have them.' },
    shard_legendary: { name: 'Legendary Shard Pouch', kind: 'shards', rarity: 'legendary', n: 10, icon: 'i-star', desc: 'Pick any Legendary hero: recruit them, or add 10 shards if you have them.' },
  },

  // ---------- Daily duties (reset at local midnight) ----------
  duties: [
    { id: 'upgrade', text: 'Finish 2 upgrades', n: 2, pts: 15 },
    { id: 'stage', text: 'Win an expedition battle', n: 1, pts: 10 },
    { id: 'beast', text: 'Slay 2 beasts on the Dunes', n: 2, pts: 15 },
    { id: 'gather', text: 'Bring home 2 gathering marches', n: 2, pts: 15 },
    { id: 'train', text: 'Train 50 troops', n: 50, pts: 10 },
    { id: 'pull', text: 'Recruit a hero', n: 1, pts: 10 },
    { id: 'donate', text: 'Donate to your Caravan 3 times', n: 3, pts: 10 },
    { id: 'pet', text: 'Pet your Rainwyrm', n: 1, pts: 5 },
    { id: 'storm', text: 'Ride out a storm with no one falling ill', n: 1, pts: 15 },
    { id: 'patrol', text: 'Collect the patrol cache', n: 1, pts: 5 },
    { id: 'research', text: 'Finish a research', n: 1, pts: 10 },
  ],
  dutyChests: [
    [20, { journals: 20, speed5: 1 }],
    [40, { starglass: 40, crate_stone: 1 }],
    [60, { beacons: 1, speed15: 1 }],
    [80, { starglass: 60, crate_water: 1, journals: 30 }],
    [100, { beacons: 2, speed60: 1 }],
  ],

  // ---------- Login calendar (one claim per day, cycles every 7 claims) ----------
  login: [
    { beacons: 2 },
    { speed15: 2, journals: 20 },
    { starglass: 100 },
    { crate_copper: 1, journals: 40 },
    { beacons: 3 },
    { speed60: 1, starglass: 100 },
    { shard_epic: 1, beacons: 2 },
  ],

  // ---------- Achievements ----------
  achievements: [
    { id: 'h3', text: 'Raise a Whelp', stat: 'wyrm', n: 3, reward: { starglass: 50 } },
    { id: 'h6', text: 'Raise a Drake to Lv 6', stat: 'wyrm', n: 6, reward: { starglass: 100 } },
    { id: 'h10', text: 'Raise an Elder Rainwyrm to Lv 10', stat: 'wyrm', n: 10, reward: { starglass: 200 } },
    { id: 'h15', text: 'Raise the Primordial Rainwyrm', stat: 'wyrm', n: 15, reward: { starglass: 400 } },
    { id: 's10', text: 'Clear 10 expedition stages', stat: 'stages', n: 10, reward: { starglass: 50 } },
    { id: 's30', text: 'Clear 30 expedition stages', stat: 'stages', n: 30, reward: { starglass: 150 } },
    { id: 's60', text: 'Clear all 60 expedition stages', stat: 'stages', n: 60, reward: { starglass: 400 } },
    { id: 'f10', text: 'Push the Burning Line back 10 stages', stat: 'stages', n: 70, reward: { starglass: 300 } },
    { id: 'hero6', text: 'Recruit 6 heroes', stat: 'heroes', n: 6, reward: { beacons: 2 } },
    { id: 'hero12', text: 'Recruit 12 heroes', stat: 'heroes', n: 12, reward: { beacons: 4 } },
    { id: 'hero18', text: 'Recruit every hero', stat: 'heroes', n: 18, reward: { starglass: 500 } },
    { id: 'star10', text: 'Earn 10 hero stars', stat: 'stars', n: 10, reward: { journals: 60 } },
    { id: 'star30', text: 'Earn 30 hero stars', stat: 'stars', n: 30, reward: { starglass: 200 } },
    { id: 'pop40', text: 'Shelter 40 survivors', stat: 'pop', n: 40, reward: { starglass: 50 } },
    { id: 'pop80', text: 'Shelter 80 survivors', stat: 'pop', n: 80, reward: { starglass: 150 } },
    { id: 'train500', text: 'Train 500 troops', stat: 'trained', n: 500, reward: { journals: 40 } },
    { id: 'train5k', text: 'Train 5,000 troops', stat: 'trained', n: 5000, reward: { starglass: 200 } },
    { id: 'storm10', text: 'Ride out 10 storms with no one falling ill', stat: 'cleanStorms', n: 10, reward: { starglass: 100 } },
    { id: 'storm50', text: 'Ride out 50 storms with no one falling ill', stat: 'cleanStorms', n: 50, reward: { starglass: 300 } },
    { id: 'beast25', text: 'Slay 25 beasts', stat: 'beasts', n: 25, reward: { starglass: 100 } },
    { id: 'beast150', text: 'Slay 150 beasts', stat: 'beasts', n: 150, reward: { starglass: 300 } },
    { id: 'gather20', text: 'Bring home 20 gathering marches', stat: 'gathers', n: 20, reward: { speed60: 1 } },
    { id: 'ruins8', text: 'Explore 8 ruins', stat: 'ruins', n: 8, reward: { beacons: 3 } },
    { id: 'camps5', text: 'Destroy 5 raider camps', stat: 'camps', n: 5, reward: { starglass: 200 } },
    { id: 'raid5', text: 'Repel 5 raids on the keep', stat: 'raidsRepelled', n: 5, reward: { starglass: 200 } },
    { id: 'tech20', text: 'Finish 20 research levels', stat: 'researched', n: 20, reward: { starglass: 150 } },
    { id: 'donate50', text: 'Donate to your Caravan 50 times', stat: 'donations', n: 50, reward: { beacons: 3 } },
    { id: 'titan5', text: 'Help bring down 5 Colossus raids', stat: 'raidKills', n: 5, reward: { starglass: 200 } },
    { id: 'war1', text: 'Finish first in an Oasis Wars bracket', stat: 'warWins', n: 1, reward: { starglass: 300 } },
    { id: 'pets30', text: 'Pet your Rainwyrm 30 times', stat: 'pets', n: 30, reward: { starglass: 100 } },
  ],

  // ---------- Timed events (rotate in game time) ----------
  events: {
    length: 1200,
    rotation: ['rainfest', 'hunt', 'builder', 'oasis'],
    defs: {
      rainfest: { name: 'Rain Festival', desc: 'Keep the Rainwyrm misting. Every second it breathes earns a point, two in a Downpour.',
        tiers: [[300, { water: 1 }], [700, { speed15: 1 }], [1100, { beacons: 1 }], [1500, { starglass: 150 }]] },
      hunt: { name: 'Beast Hunt', desc: 'Slay beasts on the Dunes. Each beast is worth 10 points per level.',
        tiers: [[60, { journals: 1 }], [180, { speed15: 1 }], [350, { beacons: 1 }], [600, { starglass: 150 }]] },
      builder: { name: "Builder's Rush", desc: 'Finished upgrades earn 10 points per level, research 5 per level, and every 10 troops trained 1 point.',
        tiers: [[60, { stone: 1 }], [160, { speed15: 1 }], [300, { beacons: 1 }], [480, { starglass: 150 }]] },
      oasis: { name: 'Oasis Wars', desc: 'Everything you do earns points. Climb your bracket against nine rival keeps. Brackets are matched by spending, so spenders face spenders.',
        tiers: [[200, { journals: 1 }], [600, { speed15: 1 }], [1200, { beacons: 1 }]],
        ranks: [[1, { starglass: 400, beacons: 3 }], [3, { starglass: 250, beacons: 2 }], [6, { starglass: 120, beacons: 1 }], [10, { starglass: 60 }]] },
    },
    // Event tier rewards written as small numbers are scaled: resources in quarter-crates, journals x (5 + 2 x wyrm level).
    warPoints: { upgrade: 20, stage: 60, beast: 15, gather: 1, research: 30, train: 0.2, pull: 10, raid: 80 },
    warPace: (L) => 25 + 16 * L, // expected points per minute for an active player, used to build the rival bracket
  },

  // ---------- Caravan (alliance; members are simulated) ----------
  caravan: {
    unlockPlot: 'hall',
    options: [
      { id: 'lastwell', name: 'The Last Well', tag: 'WEL', motto: 'No cup left empty.', style: 'Helpful veterans. Lots of build help.', helpMult: 1.3, raidMult: 1, chatty: 0.7 },
      { id: 'sunbreak', name: 'Sunbreakers', tag: 'SUN', motto: 'We march into the heat.', style: 'Competitive raiders. Colossi fall fast.', helpMult: 0.9, raidMult: 1.35, chatty: 1 },
      { id: 'palmshade', name: 'Palmshade Kin', tag: 'PLM', motto: 'Slow roots, deep shade.', style: 'Relaxed and chatty. Generous with gifts.', helpMult: 1, raidMult: 0.9, chatty: 1.5, giftMult: 1.5 },
    ],
    members: 14,
    techs: [
      { id: 'shade', name: 'Shared Shade', desc: '−0.5°C town heat per level', max: 10 },
      { id: 'supply', name: 'Supply Lines', desc: '+3% production per level', max: 10 },
      { id: 'banners', name: 'War Banners', desc: '+3% troop attack and defense per level', max: 10 },
      { id: 'hands', name: 'Many Hands', desc: '+3% construction and research speed per level', max: 10 },
      { id: 'scouts', name: 'Dune Scouts', desc: '+5% gathering speed per level', max: 10 },
    ],
    techXp: (lvl) => Math.round(200 * Math.pow(1.35, lvl)),
    donateXp: 40,
    donatePoints: 10,
    aiXpPerSecond: 0.9,
    chargeEvery: 45,
    shop: [
      { id: 'k_beacon', name: 'Beacon Token', cost: 260, grants: { beacons: 1 } },
      { id: 'k_speed15', name: '15-minute Speedup', cost: 120, grants: { speed15: 1 } },
      { id: 'k_journals', name: '40 Field Journals', cost: 150, grants: { journals: 40 } },
      { id: 'k_water', name: 'Water Crate', cost: 100, grants: { crate_water: 1 } },
      { id: 'k_epic', name: 'Epic Shard Pouch', cost: 1500, grants: { shard_epic: 1 } },
      { id: 'k_legendary', name: 'Legendary Shard Pouch', cost: 4000, grants: { shard_legendary: 1 } },
    ],
    raid: { every: 900, open: 480, attacks: 3, boss: 'Shade of the Sand Colossus' },
    raidRewards: [[1, { starglass: 200, beacons: 2 }], [3, { starglass: 140, beacons: 1 }], [7, { starglass: 90, speed15: 1 }], [15, { starglass: 50 }]],
    raidKillReward: { journals: 2, crate_copper: 1, cpoints: 200 },
    quickChat: ['Thanks for the help!', 'Sandstorm incoming. Fill the cisterns!', "Who's up for the Colossus?", 'Good morning, Caravan!', 'Anyone have tips for the next boss?'],
  },
  names: ['Anwar', 'Basma', 'Dalia', 'Emre', 'Faris', 'Ghada', 'Hamza', 'Inaya', 'Jamal', 'Karim', 'Lina', 'Malik', 'Noor', 'Ola', 'Qadir', 'Rania', 'Salim', 'Tala', 'Umar', 'Wafa', 'Yusuf', 'Zain', 'Ayo', 'Bisi', 'Chidi', 'Dara', 'Esi', 'Femi', 'Kenji', 'Mei', 'Arjun', 'Priya', 'Tenzin', 'Selin', 'Mateo', 'Lucia', 'Ines', 'Rook', 'Wren', 'Sorrel'],
  keeps: ['Sunwell', 'Palmhold', 'Greywatch', 'Saltmarch', 'Dunewatch', 'Mirage Gate', 'Ashgrove', 'Glassmere', 'Southlight', 'Sandgate', 'Cinderstead', 'Jackal Rock', 'Lanternhill', 'Brightwater', 'Stonecistern', 'Kettlewick', 'Ravensgate', 'Duskmoor'],

  // ---------- The Dunes (world map) ----------
  world: {
    size: 21, // tiles per side; your keep sits in the middle
    sight: (L) => 2 + Math.floor(L * 0.55), // tiles of clear air around the keep; past it the dust haze hides the map
    travelPerTile: 5, // seconds of march per tile
    marchSlots: (barracksLvl) => (barracksLvl ? 1 + (barracksLvl >= 5 ? 1 : 0) + (barracksLvl >= 10 ? 1 : 0) : 0),
    // load: units each troop can carry; rate: units per troop per second; cap: per node level
    nodes: {
      stone: { name: 'Stone Outcrop', load: 15, rate: 0.15, cap: 1500 },
      food: { name: 'Date Oasis', load: 15, rate: 0.15, cap: 1500 },
      water: { name: 'Hidden Spring', load: 11, rate: 0.11, cap: 1100 },
      copper: { name: 'Copper Vein', load: 7, rate: 0.08, cap: 700 },
    },
    nodeRespawn: 300,
    beasts: [['Jackal Pack', 'lancer'], ['Sand Lion', 'guard'], ['Horned Oryx', 'lancer'], ['Dust Wraith', 'bow'], ['Ironback Tortoise', 'guard'], ['Vulture Flock', 'bow']],
    beastRespawn: 240,
    beastStage: (lvl) => 1 + (lvl - 1) * 4.5, // expedition stage of equal strength
    beastScale: 0.8,
    campStageBonus: 3,
    campScale: 1.25,
    campRespawn: 600,
    raids: { fromWyrm: 5, every: [900, 1300], warn: 90 },
  },
  ruins: [
    { id: 'cart', name: 'Overturned Cart', text: 'A cargo cart lies on its side, half buried in sand. Footprints lead off toward the rocks.',
      choices: [
        { label: 'Dig out the cargo', outcomes: [{ p: 1, text: 'Sacks of dried dates and cut stone, still good.', reward: { food: 3, stone: 2 } }] },
        { label: 'Follow the footprints', outcomes: [
          { p: 0.55, text: 'A sunburnt family shelters in the shadow of the rocks. They follow your troops home.', reward: { survivors: 3 } },
          { p: 0.45, text: 'The tracks vanish under drifting sand. You find a dropped journal.', reward: { journals: 1 } }] },
      ] },
    { id: 'wagons', name: 'Buried Caravan', text: 'Six wagons in a line, sunk to the axles, their drivers long gone. The sand hisses when anyone walks near.',
      choices: [
        { label: 'Pry open every crate', outcomes: [
          { p: 0.7, text: 'Copper tools and nails, enough to fill a cart.', reward: { copper: 4 } },
          { p: 0.3, text: 'The sand gives way under the last wagon. Some troops do not come back.', reward: { copper: 2, troopsLost: 0.15 } }] },
        { label: 'Take only what is loose', outcomes: [{ p: 1, text: 'A modest haul, and everyone home safe.', reward: { copper: 1, stone: 1 } }] },
      ] },
    { id: 'observatory', name: 'Old Observatory', text: 'A dome of cracked glass on a hill. Inside, a brass telescope still points at the white sky.',
      choices: [
        { label: 'Copy the star charts', outcomes: [{ p: 1, text: 'Your scholars will be busy for weeks.', reward: { journals: 2, starglass: 30 } }] },
        { label: 'Salvage the brass', outcomes: [{ p: 1, text: 'Good metal is good metal.', reward: { copper: 3 } }] },
      ] },
    { id: 'bunker', name: 'Sealed Bunker', text: 'A steel door in the hillside, rusted shut. Something knocks on it from the inside. Twice. Then nothing.',
      choices: [
        { label: 'Force the door', outcomes: [
          { p: 0.45, text: 'An old-world supply cache, starglass shining in the lamplight.', reward: { starglass: 120 } },
          { p: 0.55, text: 'Empty, apart from something that bolts past your troops into the dunes. Several are hurt in the scramble.', reward: { troopsLost: 0.1, journals: 1 } }] },
        { label: 'Knock back and wait', outcomes: [
          { p: 0.6, text: 'Two survivors climb out, blinking. They have been waiting a long time.', reward: { survivors: 2, journals: 1 } },
          { p: 0.4, text: 'No answer. You leave a full waterskin by the door.', reward: { water: 1 } }] },
      ] },
    { id: 'chapel', name: 'Sand-Choked Chapel', text: 'Candles stand on the altar of a tiny chapel, wicks still black. The pews are full of sand.',
      choices: [
        { label: 'Light the candles', outcomes: [{ p: 1, text: 'The little room fills with soft light. Your troops come home quietly cheerful, and someone left a token on the altar.', reward: { beacons: 1 } }] },
        { label: 'Melt the wax into jar seals', outcomes: [{ p: 1, text: 'Sealed jars lose nothing to the heat.', reward: { water: 3 } }] },
      ] },
    { id: 'airship', name: 'Wrecked Airship', text: 'The ribs of an airship rise out of a dune like a whale skeleton. The cabin hangs high in the frame.',
      choices: [
        { label: 'Climb to the cabin', outcomes: [
          { p: 0.35, text: "A captain's strongbox, and inside it a hero's letter of introduction.", reward: { shard_epic: 1 } },
          { p: 0.65, text: 'The cabin is empty except for a log book.', reward: { journals: 2 } }] },
        { label: 'Strip the hull', outcomes: [{ p: 1, text: 'Canvas, rope, struts and rivets.', reward: { stone: 3, copper: 2 } }] },
      ] },
    { id: 'den', name: 'Fox Den', text: 'A den under a dead acacia. Kits yip inside. The parents are out hunting.',
      choices: [
        { label: 'Leave a gift of meat', outcomes: [{ p: 1, text: 'The foxes will remember. Your gatherers find fresh trails all week.', reward: { foodCost: 2, journals: 2, starglass: 40 } }] },
        { label: 'Leave them be', outcomes: [{ p: 1, text: 'You mark the den on your maps and walk on.', reward: { journals: 1 } }] },
      ] },
    { id: 'pool', name: 'Hidden Oasis', text: 'A clear pool ringed with green reeds, the only green for miles.',
      choices: [
        { label: 'Let the troops bathe', outcomes: [{ p: 1, text: 'They come home glowing, and the sick in the keep recover from the stories alone.', reward: { heal: 1, journals: 1 } }] },
        { label: 'Fill every waterskin', outcomes: [{ p: 1, text: 'The camels groan under the weight. Worth it.', reward: { water: 4 } }] },
      ] },
    { id: 'forge', name: 'Abandoned Forge', text: 'A smithy with its roof caved in. The anvil is still here, and a heap of unworked ore.',
      choices: [
        { label: 'Carry back the ore', outcomes: [{ p: 1, text: 'Heavy going, but worth it.', reward: { copper: 3 } }] },
        { label: "Search the smith's quarters", outcomes: [
          { p: 0.5, text: "Drawings of a wyrm, very like yours. Your scholars won't stop talking about it.", reward: { journals: 3 } },
          { p: 0.5, text: 'A purse of starglass under a loose floorboard.', reward: { starglass: 60 } }] },
      ] },
    { id: 'shrine', name: 'Rain Shrine', text: 'A stone ring around a dry basin. Old offerings lie scattered around it: coins, toys, a wyrm carved from bone.',
      choices: [
        { label: 'Pour an offering of water', outcomes: [{ p: 1, text: 'For a moment the basin glistens. Back home, your Rainwyrm lifts its head and looks south.', reward: { waterCost: 2, beacons: 1, starglass: 50 } }] },
        { label: 'Take the bone wyrm', outcomes: [{ p: 1, text: 'Your Rainwyrm sniffs it, sneezes, and loves it.', reward: { journals: 2 } }] },
      ] },
    { id: 'scouts', name: 'Lost Scouts', text: 'Three scouts from another keep, lost for days, sheltering under a rock overhang.',
      choices: [
        { label: 'Bring them home', outcomes: [{ p: 1, text: 'They decide to stay.', reward: { survivors: 3 } }] },
        { label: 'Trade supplies for their maps', outcomes: [{ p: 1, text: 'Their maps show copper no one has touched in years.', reward: { copper: 3, foodCost: 1 } }] },
      ] },
    { id: 'mine', name: 'Collapsed Mine', text: 'A mine entrance half blocked by rockfall. Cool air breathes out of it, and somewhere inside, water drips.',
      choices: [
        { label: 'Clear the rockfall', outcomes: [
          { p: 0.75, text: 'An underground stream, clear and cold.', reward: { water: 5 } },
          { p: 0.25, text: 'The tunnel shifts. Your troops get out, but not all of them.', reward: { water: 2, troopsLost: 0.12 } }] },
        { label: 'Gather what seeps outside', outcomes: [{ p: 1, text: 'Enough to keep the wyrm happy for a day.', reward: { water: 2 } }] },
      ] },
  ],
};
