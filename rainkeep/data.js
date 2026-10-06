/*
 * Rainkeep content tables.
 * Every number a designer would want to tune lives here; the game scripts only read it.
 * Timers and production run ~30x faster than a live-service version would, so the
 * two-act story can be played through in a couple of weeks of evenings.
 */
'use strict';

const DATA = {
  version: '3.2.0',
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
  // Day and night (game seconds). Desert nights are cold: the keep runs cooler after dark
  // and hotter at midday, so the mist can be lowered at night to save water.
  day: {
    length: 420, offset: 50,
    // [phase, night factor]: 0 = full day, 1 = full night; values between blend
    keys: [[0, 0.35], [0.07, 0], [0.56, 0], [0.64, 0.35], [0.72, 1], [0.93, 1], [1, 0.35]],
    noon: 2, // degrees added at midday
    night: -7, // degrees added at night
  },
  foodPerSurvivor: 0.1,
  waterPerSurvivor: 0.02, // everyone drinks, on top of what the wyrm needs
  arrivalEvery: 10,
  baseRecovery: 0.01,
  infirmaryRate: 0.012, // extra recovery chance per patient per second, per Healer's House level

  // ---------- The Rainwyrm ----------
  wyrm: {
    maxLevel: 20,
    stages: [
      { from: 1, name: 'Hatchling', size: 0.62, line: 'small, thirsty and very curious' },
      { from: 3, name: 'Whelp', size: 0.76, line: 'has unfurled its fins. Its mist now drifts to the edge of the keep.' },
      { from: 5, name: 'Drake', size: 0.9, line: 'has become a Drake, and the heat backs away from the walls.' },
      { from: 7, name: 'Tidewyrm', size: 1.03, line: 'shimmers like deep water. The survivors say the afternoons feel shorter.' },
      { from: 9, name: 'Elder Rainwyrm', size: 1.15, line: 'has become an Elder Rainwyrm. The old songs speak of wyrms like this one.' },
      { from: 12, name: 'Ascended Rainwyrm', size: 1.25, line: 'has ascended. Choose the storm it will carry.' },
      { from: 15, name: 'Primordial Rainwyrm', size: 1.34, line: 'trails a small cloud wherever it flies. The Sunheart can feel it from here.' },
      { from: 17, name: 'Stormcrowned Rainwyrm', size: 1.42, line: 'wears a crown of storm horns, and its cloud carries thunder. The Saltborn stop at the edge of its shadow.' },
      { from: 20, name: 'Skyriver', size: 1.5, line: 'has become a Skyriver: a river that flies. Wherever it passes, the rain follows for days.' },
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
    autoMistLevel: 6, // from this level the wyrm can set its own mist
  },
  // Call the Rain: the wyrm's active ability
  rain: {
    unlock: 3,
    cooldown: (L) => Math.round(540 - 15 * L),
    duration: (L) => 40 + 2 * L,
    cool: 6, // degrees off the keep while it rains
    water: 1.5, // well output multiplier (rain fills the cisterns)
    burst: 0.4, // instant water, in quarter-crates
    heal: 1.5, // extra recovery while it rains
  },
  // Production buildings slowly fill a surplus bubble you tap to collect.
  surplus: { fill: 300, minutes: 0.75, plots: ['quarry', 'grove', 'well', 'mine'] },
  // Travelling merchants stop at the gate with trades sized to your keep.
  merchant: { first: 420, every: [600, 900], stay: 300, value: { stone: 1, food: 0.9, water: 1.3, copper: 3 }, rate: 0.4 },
  // Incidents in the keep: a new one every few minutes of play, one at a time.
  incidentEvery: [480, 840],
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
    forge: {
      name: 'Sunsteel Forge', cost: { stone: 2500, copper: 900, water: 900 }, time: 30, growth: 1.3,
      desc: "A furnace hot enough to work the glassy metal the Sunheart left behind. It smelts sandstone and copper into Sunsteel for the Warden's Gear, and every level lets the gear climb higher.",
    },
  },
  copperShareFrom: 4, // levels >= this also cost copper (22% of the stone cost, 13% past the end level)
  lateLevel: 10, // past this level costs and timers grow more gently
  lateCostGrowth: 1.7,
  buildTimeGrowth: 1.42,
  lateTimeGrowth: 1.12,
  endLevel: 15, // Act II levels (16-20) grow more gently again
  endCostGrowth: 1.1,
  endTimeGrowth: 1.07,
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
    { id: 'forge', type: 'forge', unlock: 12 },
  ],
  wyrmReqs: (to) => {
    if (to < 2) return [];
    const r = [{ plot: 'well', lvl: to - 1 }, { plot: 'shelter1', lvl: to - 1 }];
    if (to >= 5) r.push({ plot: 'mine', lvl: to - 2 });
    if (to >= 8) r.push({ plot: 'storehouse', lvl: to - 3 });
    if (to >= 11) r.push({ plot: 'barracks', lvl: to - 2 });
    if (to >= 13) r.push({ plot: 'archive', lvl: to - 4 });
    if (to >= 16) r.push({ plot: 'forge', lvl: to - 4 });
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
    { id: 'tempering', name: 'Sunsteel Tempering', desc: '+2% Warden\'s Gear bonuses and +5% Sunsteel smelting per level', cost: { stone: 400, copper: 150 }, time: 30, needs: 'forge' },
    { id: 'rainlore', name: 'Rain Lore', desc: 'Call the Rain recharges 4% faster and lasts 2s longer per level', cost: { water: 300, food: 300 }, time: 26, needs: 'forge' },
  ],
  techMaxLevel: 15,
  techGrowth: 1.65,
  techTimeGrowth: 1.5,
  techLateLevel: 10, // research past this level grows more gently
  techLateGrowth: 1.38,
  techLateTimeGrowth: 1.22,

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
    sunsteel: { plot: 'forge', label: (v) => `+${v}% Sunsteel smelting` },
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
    // Act II arrivals: they join the Beacon's pool once the Sunheart is quenched
    { id: 'imani', name: 'Imani Floodwarden', rarity: 'legendary', cls: 'guard', hue: 175, act: 2,
      title: 'She Held the Wadi Gate', steward: { kind: 'water', val: 30 },
      look: { skin: 4, hair: '#120c08', wrap: 'helm', cloth: '#1f6a6a', trim: '#e8d39a', mark: 'scar' },
      skill: { name: 'Floodwall', desc: 'Your side takes {dr} less damage and recovers {heal} of its health each round.', fx: { dr: 0.12, heal: 0.03 } },
      bio: 'When the first flood came down the wadi, she stood in the gate with forty shields and did not move until the water did.' },
    { id: 'kaveh', name: 'Kaveh Stormglass', rarity: 'legendary', cls: 'bow', hue: 205, act: 2,
      title: 'Reader of Thunder', steward: { kind: 'sunsteel', val: 30 },
      look: { skin: 2, hair: '#e8e4dc', wrap: 'goggles', cloth: '#2f5a7a', trim: '#9fd8ff', beard: '#d8d4cc' },
      skill: { name: 'Glass Thunder', desc: 'Your side ignores {pierce} of enemy defense and hits {atk} harder.', fx: { pierce: 0.2, atk: 0.06 } },
      bio: 'He flew a kite into a storm cloud to see where the lightning lives. He came down with white hair and a plan.' },
    { id: 'tomas', name: 'Tomás Brinehook', rarity: 'epic', cls: 'lancer', hue: 95, act: 2,
      title: 'Ferryman of the Salt Marches', steward: { kind: 'gather', val: 25 },
      look: { skin: 1, hair: '#3a2414', wrap: 'cap', cloth: '#5a7a3a', trim: '#f0d9a8', beard: '#3a2414' },
      skill: { name: 'Undertow', desc: 'Opening strike deals {burst} extra damage and ignores {pierce} of enemy defense.', fx: { burst: 0.3, pierce: 0.08 } },
      bio: 'He poled a reed boat across the dry salt marsh for twenty years, waiting. Now there is finally water under the oar.' },
    { id: 'sefa', name: 'Sefa Embersong', rarity: 'epic', cls: 'bow', hue: 18, act: 2,
      title: 'Deserter of the Cinder Choir', steward: { kind: 'sunsteel', val: 20 },
      look: { skin: 3, hair: '#5a1a10', wrap: 'veil', cloth: '#7a2a1a', trim: '#ffb347' },
      skill: { name: 'Cinder Hymn', desc: 'Your side hits {atk} harder.', fx: { atk: 0.12 } },
      bio: 'She sang to the embers for ten years. Then she heard the rain on the crater roof, and stopped singing.' },
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
    // Act II: The Long Rains
    { from: 61, act: 2, name: 'The Flooded Wadis', foes: [['Flood Raiders', 'lancer'], ['Mudback Crocodiles', 'guard'], ['Reed Archers', 'bow'], ['Silt Serpents', 'lancer']],
      story: 'The rain came back, all of it at once. Riverbeds that had been dry for a generation roar with brown water, and the raiders who lived in them have nowhere left to go but up, toward your keep. Something else came down with the floods: white footprints of salt that dry before anyone can follow them.' },
    { from: 71, act: 2, name: 'The Salt Marches', foes: [['Saltborn Husks', 'guard'], ['Brine Witches', 'bow'], ['Crystal Stalkers', 'lancer'], ['Salt Golems', 'guard']],
      story: 'Where the old inland sea dried out, the salt remembers it. The Saltborn walk out of the white flats in their hundreds: crystal husks that drink every drop they touch and leave the ground dry behind them. They are marching on the new rivers.' },
    { from: 81, act: 2, name: 'The Ember Reaches', foes: [['Cinder Monks', 'bow'], ['Obsidian Knights', 'guard'], ['Ember Drakes', 'lancer'], ['Ash Ravens', 'bow']],
      story: 'The Sunheart did not die alone. Its last embers fled south into a country of black glass and rivers of ash, where the Cinder Choir tends them like a hearth. Every ember they keep alive steals a little rain from the sky.' },
    { from: 91, act: 2, name: 'The Ember Throne', foes: [['Throne Guard', 'guard'], ['Sunlance Riders', 'lancer'], ['Choir of Embers', 'bow'], ['Flame Seraphs', 'bow']],
      story: 'At the bottom of a crater of black glass sits a throne cut from the last ember of the sun, and on it sits something that was once a warden like you. It wants the rain gone for good. Your wyrm has been dreaming about this place for weeks.' },
    { from: 101, name: 'The Burning Line', foes: [['Sunborn Host', 'guard'], ['Scorchline Riders', 'lancer'], ['Pale Archers', 'bow'], ['Glass Titans', 'guard']],
      story: 'The Ember Throne is cold, but the far south still smoulders. Push the Burning Line back as far as your keep can reach.' },
  ],
  bosses: {
    5: ['Jackal Alpha', 'lancer'], 10: ['Salt Behemoth', 'guard'], 15: ['Dust Matron', 'bow'],
    20: ['Basalt Tortoise', 'guard'], 25: ['The Pale Herald', 'bow'], 30: ['The Sand Colossus', 'guard'],
    35: ['Shatterjaw Sandshark', 'lancer'], 40: ['The Mirage Queen', 'bow'], 45: ['The Buried Bellringer', 'guard'],
    50: ['Spire Colossus', 'guard'], 55: ['The Hollow King', 'lancer'], 60: ['The Sunheart', 'guard'],
    65: ['The Wadi King', 'lancer'], 70: ['The Drowned Colossus', 'guard'], 75: ['The Brine Matriarch', 'bow'],
    80: ['The Salt Leviathan', 'guard'], 85: ['The Ash Prophet', 'bow'], 90: ['The Obsidian Wyvern', 'lancer'],
    95: ['The Sunwarden', 'lancer'], 100: ['The Ember Throne', 'guard'],
  },
  actOneStage: 60, // beating this ends Act I ("The Rains") and opens Act II
  finalStage: 100, // beating this ends the story ("The Long Rains"); stages past it are the endless Burning Line
  // stage n foe: base x growth^(n-1) through stage 30, then gentler late growth to 60, then the endless curve
  enemy: { atk: 72, def: 42, hp: 820, gAtk: 1.13, gDef: 1.12, gHp: 1.14, lateFrom: 30, lAtk: 1.027, lDef: 1.022, lHp: 1.032, endAtk: 1.03, endDef: 1.025, endHp: 1.035, boss: 1.5 },
  maxRounds: 12,
  patrolCapMinutes: 120,
  ending: {
    title: 'The Rains',
    lines: [
      'The Sunheart dims like an ember dropped into a well, and then, all at once, it goes dark.',
      'That night, clouds gather over the keep for the first time in a generation. When the first drops hit the sand, the children run outside. They have never felt rain. They stand in the square with their faces turned up, laughing.',
      "It isn't the old world yet. Far to the south, something still burns. But the wells are rising, and the sky is a little softer than it was yesterday.",
      '{wyrm} curls up beside the deepest well and sleeps a long, cool sleep. When it wakes, the rivers have started to run.',
    ],
    reward: { starglass: 2000, beacons: 10, skin: 'firstrain' },
    badge: 'Rainbringer',
    note: 'Act I is over. Act II, The Long Rains, starts at stage 61.',
  },
  ending2: {
    title: 'The Long Rains',
    lines: [
      'The Ember Throne cracks down the middle, and the last light of the fallen sun pours out of it like water from a broken jar. {wyrm} breathes once, and the light goes out.',
      'For forty days it rains. The wadis run, the salt flats turn to marsh, and the green comes back to the dunes faster than anyone remembered it could.',
      'Caravans arrive from keeps you thought were lost. Children who were born in the drought learn to swim in the oasis.',
      'The Burning Line still smoulders at the edge of the world. But for the first time in a long time, people talk about the future as if it is coming.',
    ],
    reward: { starglass: 3000, beacons: 15, sunsteel: 2000, skin: 'longrains' },
    badge: 'Keeper of the Long Rains',
    note: "You finished Rainkeep's story. The Burning Line, the Mirage Spire and the Dune Duels stay open for as long as you want to play.",
  },

  // ---------- Chapter quests ----------
  // check(S) returns true when done. go: 'plot:<id>' | 'tab:<tab>' | 'sheet:<kind>'
  // where the keep-life quests were inserted in 2.1 (core.js migrates older saves)
  questsAdded21: [5, 15, 18, 25],
  // where the Forge, Spire and Duels quests were inserted in 3.0
  questsAdded30: [41, 44, 46, 47, 50, 52],
  quests: [
    { text: 'Dig the Deep Well. The Rainwyrm is thirsty.', go: 'plot:well', check: (S) => S.lv.well >= 1, reward: { water: 150 } },
    { text: 'Upgrade the Date Grove to Lv 2', go: 'plot:grove', check: (S) => S.lv.grove >= 2, reward: { food: 150 } },
    { text: 'Upgrade the Deep Well to Lv 2', go: 'plot:well', check: (S) => S.lv.well >= 2, reward: { stone: 200 } },
    { text: 'Grow the Rainwyrm to Lv 2', go: 'plot:wyrm', check: (S) => S.lv.wyrm >= 2, reward: { beacons: 2, starglass: 100 } },
    { text: 'Pet your Rainwyrm', go: 'plot:wyrm', check: (S) => S.stats.pets >= 1, reward: { journals: 10 } },
    { text: 'Tap a surplus bubble over a building', go: 'surplus', check: (S) => (S.stats.surplus || 0) >= 1, reward: { stone: 200 } },
    { text: "Build the Healer's House", go: 'plot:infirmary', check: (S) => S.lv.infirmary >= 1, reward: { journals: 15 } },
    { text: 'Recruit a hero at the Beacon', go: 'tab:recruit', check: (S) => S.stats.pulls >= 1, reward: { journals: 20 } },
    { text: 'Raise any hero to Lv 3', go: 'tab:heroes', check: (S) => Object.values(S.heroes).some((h) => h.lvl >= 3), reward: { stone: 300, food: 200 } },
    { text: 'Clear Expedition stage 2', go: 'tab:expedition', check: (S) => S.stage > 2, reward: { starglass: 80 } },
    { text: 'Build the Barracks', go: 'plot:barracks', check: (S) => S.lv.barracks >= 1, reward: { food: 300 } },
    { text: 'Train 20 troops', go: 'plot:barracks', check: (S) => S.stats.trained >= 20, reward: { journals: 20 } },
    { text: 'Send a gathering march out on the Dunes', go: 'tab:world', check: (S) => S.stats.gathers >= 1, reward: { stone: 400, speed5: 1 } },
    { text: 'Build a second block of Mudbrick Houses', go: 'plot:shelter2', check: (S) => S.lv.shelter2 >= 1, reward: { stone: 400 } },
    { text: 'Grow the Rainwyrm to Lv 3', go: 'plot:wyrm', check: (S) => S.lv.wyrm >= 3, reward: { beacons: 2, water: 300 } },
    { text: 'Call the Rain', go: 'plot:wyrm', check: (S) => (S.stats.rains || 0) >= 1, reward: { journals: 20, rainCharm: 1 } },
    { text: 'Build the Copper Mine', go: 'plot:mine', check: (S) => S.lv.mine >= 1, reward: { copper: 100 } },
    { text: 'Build the Watchtower', go: 'plot:watchtower', check: (S) => S.lv.watchtower >= 1, reward: { starglass: 100 } },
    { text: 'Settle a matter in the keep', go: 'sheet:incident', check: (S) => (S.stats.incidents || 0) >= 1, reward: { journals: 25 } },
    { text: 'Explore a ruin on the Dunes', go: 'tab:world', check: (S) => S.stats.ruins >= 1, reward: { journals: 25 } },
    { text: 'Clear Expedition stage 5', go: 'tab:expedition', check: (S) => S.stage > 5, reward: { beacons: 2 } },
    { text: 'Station a hero as Steward', go: 'tab:heroes', check: (S) => Object.keys(S.stewards).length >= 1, reward: { journals: 30 } },
    { text: 'Grow the Rainwyrm to Lv 4', go: 'plot:wyrm', check: (S) => S.lv.wyrm >= 4, reward: { starglass: 150, copper: 200 } },
    { text: 'Build the Caravan Hall', go: 'plot:hall', check: (S) => S.lv.hall >= 1, reward: { food: 500 } },
    { text: 'Join a Caravan', go: 'tab:caravan', check: (S) => !!S.caravan.joined, reward: { beacons: 2, speed15: 1 } },
    { text: 'Trade with a travelling merchant', go: 'sheet:merchant', check: (S) => (S.stats.trades || 0) >= 1, reward: { starglass: 100 } },
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
    { text: 'Win a Dune Duel', go: 'tab:duels', check: (S) => S.stats.duelWins >= 1, reward: { starglass: 150, speed15: 2 } },
    { text: 'Grow the Rainwyrm to Lv 10', go: 'plot:wyrm', check: (S) => S.lv.wyrm >= 10, reward: { beacons: 6, shard_epic: 1 } },
    { text: 'Defeat the Sand Colossus (stage 30)', go: 'tab:expedition', check: (S) => S.stage > 30, reward: { starglass: 600, shard_legendary: 1 } },
    { text: 'Climb the Mirage Spire to floor 5', go: 'tab:spire', check: (S) => S.spire.floor > 5, reward: { starglass: 200, sunsteel: 150 } },
    { text: "Choose your Rainwyrm's Ascension (Lv 12)", go: 'plot:wyrm', check: (S) => !!S.wyrm.element, reward: { beacons: 8 } },
    { text: 'Build the Sunsteel Forge', go: 'plot:forge', check: (S) => S.lv.forge >= 1, reward: { sunsteel: 150, crate_copper: 2 } },
    { text: "Forge a piece of Warden's Gear", go: 'tab:gear', check: (S) => S.stats.gearUps >= 1, reward: { sunsteel: 150, starglass: 100 } },
    { text: 'Destroy a Scorpion raider camp', go: 'tab:world', check: (S) => S.stats.camps >= 1, reward: { starglass: 300 } },
    { text: 'Clear Expedition stage 40', go: 'tab:expedition', check: (S) => S.stage > 40, reward: { starglass: 600 } },
    { text: 'Raise a piece of gear to Fine (Lv 11)', go: 'tab:gear', check: (S) => Math.max(...Object.values(S.gear)) >= 11, reward: { sunsteel: 300, beacons: 3 } },
    { text: 'Clear Expedition stage 50', go: 'tab:expedition', check: (S) => S.stage > 50, reward: { beacons: 10 } },
    { text: 'Reach rank 300 in the Dune Duels', go: 'tab:duels', check: (S) => S.duels.best <= 300, reward: { starglass: 400, sunsteel: 200 } },
    { text: 'Raise the Primordial Rainwyrm (Lv 15)', go: 'plot:wyrm', check: (S) => S.lv.wyrm >= 15, reward: { starglass: 1000, shard_legendary: 1 } },
    { text: 'Quench the Sunheart (stage 60)', go: 'tab:expedition', check: (S) => S.stage > 60, reward: { starglass: 1500 } },
    // Act II: The Long Rains
    { text: 'Defeat the Wadi King (stage 65)', go: 'tab:expedition', check: (S) => S.stage > 65, reward: { starglass: 500, sunsteel: 300 } },
    { text: 'Climb the Mirage Spire to floor 20', go: 'tab:spire', check: (S) => S.spire.floor > 20, reward: { beacons: 6, sunsteel: 300 } },
    { text: 'Grow the Rainwyrm to Lv 16', go: 'plot:wyrm', check: (S) => S.lv.wyrm >= 16, reward: { starglass: 800, shard_epic: 1 } },
    { text: 'Defeat the Drowned Colossus (stage 70)', go: 'tab:expedition', check: (S) => S.stage > 70, reward: { starglass: 600, sunsteel: 400 } },
    { text: "Raise the Warden's Gear to 60 levels in all", go: 'tab:gear', check: (S) => Object.values(S.gear).reduce((a, b) => a + b, 0) >= 60, reward: { sunsteel: 500, crate_copper: 4 } },
    { text: 'Reach rank 150 in the Dune Duels', go: 'tab:duels', check: (S) => S.duels.best <= 150, reward: { starglass: 600, beacons: 4 } },
    { text: 'Defeat the Salt Leviathan (stage 80)', go: 'tab:expedition', check: (S) => S.stage > 80, reward: { starglass: 800, shard_legendary: 1 } },
    { text: 'Raise the Stormcrowned Rainwyrm (Lv 17)', go: 'plot:wyrm', check: (S) => S.lv.wyrm >= 17, reward: { starglass: 1000, sunsteel: 500 } },
    { text: 'Climb the Mirage Spire to floor 40', go: 'tab:spire', check: (S) => S.spire.floor > 40, reward: { beacons: 8, sunsteel: 500 } },
    { text: 'Defeat the Obsidian Wyvern (stage 90)', go: 'tab:expedition', check: (S) => S.stage > 90, reward: { starglass: 1000, beacons: 6 } },
    { text: 'Raise a piece of gear to Superior (Lv 21)', go: 'tab:gear', check: (S) => Math.max(...Object.values(S.gear)) >= 21, reward: { sunsteel: 800, shard_epic: 1 } },
    { text: 'Break the Ember Throne (stage 100)', go: 'tab:expedition', check: (S) => S.stage > 100, reward: { starglass: 2000, shard_legendary: 1 } },
    { text: 'Grow the Rainwyrm to Lv 18', go: 'plot:wyrm', check: (S) => S.lv.wyrm >= 18, reward: { starglass: 1200, beacons: 8 } },
    { text: 'Reach rank 25 in the Dune Duels', go: 'tab:duels', check: (S) => S.duels.best <= 25, reward: { starglass: 1000, sunsteel: 800 } },
    { text: 'Climb the Mirage Spire to floor 60', go: 'tab:spire', check: (S) => S.spire.floor > 60, reward: { shard_legendary: 1, sunsteel: 1000 } },
    { text: 'Raise the Skyriver (Lv 20)', go: 'plot:wyrm', check: (S) => S.lv.wyrm >= 20, reward: { starglass: 3000, beacons: 15 } },
  ],
  questPassXp: 60,

  // ---------- Wellkeeper's Ledger (season pass) ----------
  pass: {
    xpPerTier: 250,
    seasonLength: 8 * 3600, // a Ledger season lasts 8 hours of play; then a new one starts
    // Season 2 onward: small numbers are scaled to the keep when claimed (resources in quarter-crates,
    // journals x (5 + 2 x wyrm level)); the premium capstone is that season's skin.
    seasonSkins: ['monsoonbloom', 'saltglass', 'embertide', 'nightrain', 'goldenwadi', 'stormcoral'],
    seasonTiers: [
      [{ stone: 2 }, { starglass: 100 }], [{ journals: 1 }, { beacons: 2 }], [{ food: 2 }, { starglass: 150 }], [{ speed15: 1 }, { journals: 3 }],
      [{ water: 2 }, { speed60: 1 }], [{ beacons: 1 }, { beacons: 3 }], [{ copper: 2 }, { sunsteel_cache: 2 }], [{ journals: 2 }, { starglass: 250 }],
      [{ sunsteel_cache: 1 }, { rainCharm: 2 }], [{ speed15: 2 }, { shard_epic: 1 }], [{ stone: 4 }, { copper: 6 }], [{ food: 4 }, { beacons: 5 }],
      [{ beacons: 2 }, { starglass: 400 }], [{ starglass: 100 }, { speed60: 2 }], [{ speed60: 1 }, { sunsteel_cache: 3, starglass: 200 }], [{ water: 6 }, { starglass: 300 }],
      [{ journals: 3 }, { beacons: 5 }], [{ beacons: 2 }, { journals: 8 }], [{ copper: 4 }, { shard_epic: 2 }], [{ starglass: 150 }, { starglass: 500 }],
      [{ sunsteel_cache: 1 }, { beacons: 6 }], [{ stone: 8 }, { speed60: 3 }], [{ journals: 4 }, { starglass: 500 }], [{ beacons: 3 }, { sunsteel_cache: 4 }],
      [{ food: 8 }, { shard_legendary: 1 }], [{ starglass: 200 }, { beacons: 8 }], [{ speed60: 2 }, { starglass: 600 }], [{ copper: 8 }, { shard_epic: 2 }],
      [{ beacons: 4 }, { starglass: 800 }], [{ shard_epic: 1 }, { skin: 'season' }],
    ],
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
    monsoonbloom: { name: 'Monsoon Bloom', body: ['#2a5a8a', '#8ad0ff'], belly: '#f0f8ff', eye: '#ffe6f2', mist: ['#ffc8e6', '#ffffff'], fin: '#ff9ad0', horn: '#fff0f6', note: 'Ledger Season 2 premium', locked: true },
    saltglass: { name: 'Saltglass', body: ['#7d8c9a', '#e6f2fa'], belly: '#ffffff', eye: '#3fb8ff', mist: ['#dff3ff', '#ffffff'], fin: '#a8dcff', horn: '#ffffff', note: 'Ledger Season 3 premium', locked: true },
    embertide: { name: 'Ember Tide', body: ['#5a1a10', '#ff7a3a'], belly: '#ffe0c0', eye: '#fff4b8', mist: ['#ffb347', '#fff0d0'], fin: '#ffcf6e', horn: '#3a2010', note: 'Ledger Season 4 premium', locked: true },
    nightrain: { name: 'Night Rain', body: ['#0c1030', '#3a4aa0'], belly: '#c8d0ff', eye: '#ffe08a', mist: ['#8a9aff', '#e0e6ff'], fin: '#ffe08a', horn: '#e8e0ff', note: 'Ledger Season 5 premium', locked: true },
    goldenwadi: { name: 'Golden Wadi', body: ['#7a5a10', '#ffd36e'], belly: '#fff6d8', eye: '#2a8a70', mist: ['#ffe8a0', '#fffaf0'], fin: '#4fc0a0', horn: '#fff8e0', note: 'Ledger Season 6 premium', locked: true },
    stormcoral: { name: 'Storm Coral', body: ['#7a2a4a', '#ff8aa0'], belly: '#fff0f2', eye: '#9ff0ff', mist: ['#ffc0cc', '#ffffff'], fin: '#5fd0ff', horn: '#ffe8ee', note: 'Ledger Season 7 premium', locked: true },
    longrains: { name: 'Long Rains', body: ['#0e6b5a', '#7fe0c4'], belly: '#eafff7', eye: '#fff6c8', mist: ['#a8ffe0', '#ffffff'], fin: '#ffd36e', horn: '#fffbe8', note: 'Break the Ember Throne', locked: true },
  },

  // ---------- Store (simulated on the web; StoreKit via RevenueCat in the app) ----------
  shop: [
    { id: 'founder', name: "Founder's Cache", usd: 0.99, once: true, tag: 'Best first buy',
      grants: { starglass: 300, beacons: 5, journals: 30, builder2: 1 },
      desc: '300 Starglass, 5 Beacon Tokens, 30 Field Journals, a permanent second builder and Patron 1.' },
    { id: 'stipend', name: 'Oasis Stipend', usd: 4.99, tag: '30 days',
      grants: { starglass: 300, stipend: 30 },
      desc: '300 Starglass now, then 90 Starglass every day you log in for 30 days.' },
    { id: 'ledger', name: 'Ledger Premium', usd: 9.99, tag: 'Season',
      grants: { ledger: 1 },
      desc: "Unlocks the premium track of this season's Wellkeeper's Ledger, including its wyrm skin. Each season has its own premium track." },
    { id: 'growth', name: 'Growth Fund', usd: 14.99, once: true, tag: '10,000 Starglass',
      grants: { growth: 1 },
      desc: 'Pays out Starglass each time your Rainwyrm reaches Lv 5, 8, 10, 12, 15, 18 and 20. 10,000 in total.' },
    { id: 'stormkit', name: 'Sandstorm Kit', usd: 2.99, daily: true, tag: 'Daily',
      grants: { speed15: 3, crate_water: 2, beacons: 2, rainCharm: 1 },
      desc: 'Three 15-minute speedups, two water crates, two Beacon Tokens and a Rain Charm. Once per day.' },
    { id: 'warchest', name: "Warden's War Chest", usd: 19.99, tag: 'Value',
      grants: { starglass: 1600, beacons: 10, shard_legendary: 1 },
      desc: '1,600 Starglass, 10 Beacon Tokens and a Legendary Shard Pouch.' },
    { id: 'forgekit', name: 'Forge Kit', usd: 4.99, daily: true, tag: 'Daily', needs: 'forge',
      grants: { sunsteel: 600, crate_copper: 3, speed15: 2 },
      desc: "600 Sunsteel, three copper crates and two 15-minute speedups for the Warden's Gear. Once per day, after you build the Forge." },
    { id: 'sg1', name: 'Pouch of Starglass', usd: 1.99, grants: { starglass: 120 } },
    { id: 'sg2', name: 'Satchel of Starglass', usd: 4.99, grants: { starglass: 330 } },
    { id: 'sg3', name: 'Chest of Starglass', usd: 9.99, grants: { starglass: 700 } },
    { id: 'sg4', name: 'Crate of Starglass', usd: 19.99, grants: { starglass: 1500 } },
    { id: 'sg5', name: 'Vault of Starglass', usd: 49.99, grants: { starglass: 4000 } },
    { id: 'sg6', name: 'Hoard of Starglass', usd: 99.99, grants: { starglass: 8500 } },
  ],
  growthFund: [[5, 800], [8, 1000], [10, 1200], [12, 1400], [15, 1600], [18, 1800], [20, 2200]],
  crateCost: 100, // starglass per supply crate
  crateSize: (res, wyrmLvl) => Math.round({ stone: 500, food: 450, water: 350, copper: 150 }[res] * Math.pow(wyrmLvl, 1.4)),
  speedupSecondsPerStarglass: 10,
  freeFinishSeconds: 10,

  passXp: { stage: 30, upgrade: 10, research: 20, pull: 5, train10: 1, beast: 15, gather: 10, duty: 5 },

  // ---------- Sunsteel Forge and Warden's Gear ----------
  forge: {
    smelt: (L) => 2 + 1.2 * L, // Sunsteel per minute
    input: { stone: 8, copper: 3 }, // smelted from sandstone and copper, per Sunsteel
    store: (L) => 800 + 400 * L, // smelting pauses when this much Sunsteel is waiting
    gearCap: (L) => Math.min(50, 3 * L), // gear level cap from the Forge's level
    tiers: [
      { from: 0, name: 'Plain', color: '#b9a88a' },
      { from: 1, name: 'Common', color: '#e8dcc4' },
      { from: 11, name: 'Fine', color: '#7fd08a' },
      { from: 21, name: 'Superior', color: '#5fb8ff' },
      { from: 31, name: 'Epic', color: '#c39bff' },
      { from: 41, name: 'Legendary', color: '#ffcf6e' },
    ],
    // bonus at gear level L: per-level share plus a step at each new tier
    bonus: (per, L) => per * L + per * 2 * Math.floor(L / 10),
    cost: (L) => ({ sunsteel: Math.round(12 + 6 * L + 0.15 * L * L), stone: Math.round(60 * Math.pow(L + 1, 1.4)) }),
    gear: [
      { id: 'blade', name: 'Sunsteel Blade', icon: 'i-sword', stat: 'atk', per: 0.007, desc: 'Squad attack' },
      { id: 'shield', name: 'Mirror Shield', icon: 'i-guard', stat: 'def', per: 0.007, desc: 'Squad defense' },
      { id: 'cloak', name: 'Raincloak', icon: 'i-water', stat: 'hp', per: 0.009, desc: 'Squad health' },
      { id: 'helm', name: "Shieldbearer's Helm", icon: 'i-guard', troop: 'guard', per: 0.005, desc: 'Shieldbearer strength' },
      { id: 'quiver', name: 'Glassfletch Quiver', icon: 'i-bow', troop: 'bow', per: 0.005, desc: 'Dune Archer strength' },
      { id: 'saddle', name: 'Lancer Saddle', icon: 'i-lancer', troop: 'lancer', per: 0.005, desc: 'Camel Lancer strength' },
    ],
  },

  // ---------- Mirage Spire: a tower of single fights, each floor with a twist ----------
  spire: {
    unlockStage: 31, // after the Sand Colossus
    base: 24, per: 0.9, // floor f fights like expedition stage base + per x f
    warden: 1.35, // every 10th floor is a Warden
    foes: [['Mirror Knights', 'guard'], ['Glass Hounds', 'lancer'], ['Mirage Archers', 'bow'], ['Spire Sentinels', 'guard'], ['Echo Riders', 'lancer'], ['Choir of Mirrors', 'bow']],
    mods: {
      calm: { name: 'Still air', desc: 'No tricks on this floor.' },
      heat: { name: 'Blistering heat', desc: "Your squad's defense is 20% lower.", defBonus: -0.2 },
      sandstorm: { name: 'Sandstorm', desc: 'Your troops fight at half strength. Heroes carry this one.', troops: 0.5 },
      glass: { name: 'Glass floor', desc: "Your wyrm's torrent can't reach this floor.", noBreath: true },
      mirage: { name: 'Mirage', desc: 'The foe shifts shape: no class has the advantage.', noCounter: true },
      tide: { name: 'Rising tide', desc: 'Water seeps in from below: your squad hits 15% harder.', atkBonus: 0.15 },
      warden: { name: 'Spire Warden', desc: 'A Warden guards every tenth floor: 35% stronger than the floors around it.' },
    },
    cycle: ['calm', 'heat', 'tide', 'sandstorm', 'calm', 'glass', 'mirage', 'heat', 'tide'],
    rewards: (f) => {
      const r = { sunsteel: 15 + 2 * f, journals: 10 + 2 * f, starglass: f % 10 === 0 ? 100 : 10 + 2 * Math.floor(f / 5) };
      if (f % 50 === 0) r.shard_legendary = 1;
      else if (f % 20 === 0) r.shard_epic = 1;
      else if (f % 10 === 0) r.beacons = 2;
      else if (f % 5 === 0) r.beacons = 1;
      return r;
    },
  },

  // ---------- Dune Duels: a ladder of rival wardens (simulated) ----------
  duels: {
    unlockStage: 21,
    ranks: 1000,
    // rank r fights like expedition stage lo + (hi - lo) x (1 - (r - 1) / (ranks - 1)) ^ curve
    lo: 6, hi: 105, curve: 1.4,
    tickets: 5, ticketEvery: 720, // a ticket every 12 minutes of play, up to 5
    ticketCost: 50, ticketBuys: 5, // Starglass per extra ticket, extra tickets per season
    season: 10800, // a season lasts 3 hours of play
    seasonGlory: [[1, 1000], [10, 650], [50, 450], [100, 320], [300, 180], [500, 100], [1000, 50]],
    slip: 1.3, // at the end of a season your rank slips back (x1.3 + 20)
    winGlory: [12, 18, 26], // easy, even, hard challenger
    milestones: [
      [900, { starglass: 50, sunsteel: 40 }], [750, { starglass: 80, sunsteel: 60 }], [500, { starglass: 120, beacons: 1, sunsteel: 100 }],
      [300, { starglass: 150, beacons: 2, sunsteel: 150 }], [200, { starglass: 200, sunsteel: 200 }], [100, { shard_epic: 1, sunsteel: 250 }],
      [50, { starglass: 300, beacons: 3 }], [20, { shard_epic: 1, sunsteel: 400 }], [10, { shard_legendary: 1 }],
      [3, { starglass: 600, sunsteel: 600 }], [1, { starglass: 1000, beacons: 10, shard_legendary: 1 }],
    ],
    shop: [
      { id: 'sunsteel', grants: { sunsteel: 120 }, cost: 60 },
      { id: 'speed', grants: { speed15: 1 }, cost: 45 },
      { id: 'charm', grants: { rainCharm: 1 }, cost: 70 },
      { id: 'beacon', grants: { beacons: 1 }, cost: 90 },
      { id: 'copper', grants: { crate_copper: 1 }, cost: 50 },
      { id: 'epic', grants: { shard_epic: 1 }, cost: 650 },
    ],
    titles: ['Warden', 'Keeper', 'Sandwalker', 'Well-singer', 'Duneblade', 'Oathkeeper', 'Glassrider', 'Lanternbearer'],
  },

  // ---------- Patron program: levels from lifetime spend (and a little from daily logins) ----------
  // Perks are production and convenience only, never combat stats, so Duels and Oasis Wars stay fair.
  patron: {
    perDollar: 100, // Patron points per US dollar spent
    daily: 15, // points for the first visit each day, so free players reach Patron 1 in about a week
    levels: [
      { at: 90, prod: 0.02, chest: { speed5: 1, crate_stone: 1 } },
      { at: 500, prod: 0.04, build: 0.05, chest: { speed5: 2, crate_stone: 1, crate_water: 1 } },
      { at: 1000, prod: 0.06, build: 0.05, freeFinish: 60, offlineCap: 3600, chest: { speed15: 1, crate_stone: 1, crate_water: 1, starglass: 20 } },
      { at: 2000, prod: 0.08, build: 0.1, freeFinish: 60, offlineCap: 3600, tickets: 1, chest: { speed15: 1, crate_copper: 1, starglass: 30 } },
      { at: 4000, prod: 0.1, build: 0.1, freeFinish: 180, offlineCap: 3600, tickets: 1, smelt: 0.1, chest: { speed15: 2, crate_copper: 1, starglass: 40, sunsteel_cache: 1 } },
      { at: 8000, prod: 0.12, build: 0.15, freeFinish: 180, offlineCap: 7200, tickets: 1, smelt: 0.1, chest: { speed15: 2, crate_copper: 2, starglass: 50, sunsteel_cache: 1 } },
      { at: 15000, prod: 0.14, build: 0.15, freeFinish: 300, offlineCap: 7200, tickets: 1, smelt: 0.15, chest: { speed60: 1, crate_copper: 2, starglass: 60, sunsteel_cache: 1, beacons: 1 } },
      { at: 30000, prod: 0.16, build: 0.2, freeFinish: 300, offlineCap: 7200, tickets: 2, smelt: 0.15, chest: { speed60: 1, crate_copper: 2, starglass: 80, sunsteel_cache: 2, beacons: 1 } },
      { at: 50000, prod: 0.18, build: 0.2, freeFinish: 600, offlineCap: 10800, tickets: 2, smelt: 0.2, chest: { speed60: 2, crate_copper: 3, starglass: 100, sunsteel_cache: 2, beacons: 1 } },
      { at: 100000, prod: 0.2, build: 0.25, freeFinish: 600, offlineCap: 10800, tickets: 2, smelt: 0.2, chest: { speed60: 2, crate_copper: 3, starglass: 150, sunsteel_cache: 3, beacons: 2 } },
    ],
  },

  // ---------- Backpack items ----------
  items: {
    speed1: { name: '1-minute Speedup', kind: 'speed', secs: 60, icon: 'i-clock' },
    speed5: { name: '5-minute Speedup', kind: 'speed', secs: 300, icon: 'i-clock' },
    speed15: { name: '15-minute Speedup', kind: 'speed', secs: 900, icon: 'i-clock' },
    speed60: { name: '1-hour Speedup', kind: 'speed', secs: 3600, icon: 'i-clock' },
    rainCharm: { name: 'Rain Charm', kind: 'charm', icon: 'i-water', desc: 'Lets the Rainwyrm call the rain again right away.' },
    crate_stone: { name: 'Stone Crate', kind: 'crate', res: 'stone', icon: 'i-stone' },
    crate_food: { name: 'Food Crate', kind: 'crate', res: 'food', icon: 'i-food' },
    crate_water: { name: 'Water Crate', kind: 'crate', res: 'water', icon: 'i-water' },
    crate_copper: { name: 'Copper Crate', kind: 'crate', res: 'copper', icon: 'i-copper' },
    sunsteel_cache: { name: 'Sunsteel Cache', kind: 'cache', grants: { sunsteel: 150 }, icon: 'i-sunsteel', desc: '150 Sunsteel for the Warden\'s Gear.' },
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
    { id: 'rain', text: 'Call the rain', n: 1, pts: 10 },
    { id: 'surplus', text: 'Collect 5 surplus bubbles', n: 5, pts: 10 },
    { id: 'incident', text: 'Settle a matter in the keep', n: 1, pts: 10 },
    { id: 'duel', text: 'Fight 3 Dune Duels', n: 3, pts: 15 },
    { id: 'spire', text: 'Clear a Mirage Spire floor', n: 1, pts: 10 },
    { id: 'gear', text: "Forge the Warden's Gear 3 times", n: 3, pts: 10 },
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
    { starglass: 100, rainCharm: 1 },
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
    { id: 'rain25', text: 'Call the rain 25 times', stat: 'rains', n: 25, reward: { starglass: 150 } },
    { id: 'inc20', text: 'Settle 20 matters in the keep', stat: 'incidents', n: 20, reward: { beacons: 3 } },
    { id: 'trade20', text: 'Trade with merchants 20 times', stat: 'trades', n: 20, reward: { starglass: 150 } },
    { id: 'h20', text: 'Raise the Skyriver', stat: 'wyrm', n: 20, reward: { starglass: 800 } },
    { id: 's100', text: 'Break the Ember Throne', stat: 'stages', n: 100, reward: { starglass: 600 } },
    { id: 'spire25', text: 'Clear 25 floors of the Mirage Spire', stat: 'spireWins', n: 25, reward: { starglass: 200 } },
    { id: 'spire75', text: 'Clear 75 floors of the Mirage Spire', stat: 'spireWins', n: 75, reward: { shard_epic: 1 } },
    { id: 'duel50', text: 'Win 50 Dune Duels', stat: 'duelWins', n: 50, reward: { starglass: 250 } },
    { id: 'gear100', text: "Raise the Warden's Gear to 100 levels in all", stat: 'gear', n: 100, reward: { sunsteel: 800 } },
    { id: 'smelt5k', text: 'Smelt 5,000 Sunsteel', stat: 'smelted', n: 5000, reward: { starglass: 300 } },
  ],

  // ---------- Timed events (rotate in game time) ----------
  events: {
    length: 1200,
    rotation: ['rainfest', 'hunt', 'forgefest', 'builder', 'spirerush', 'oasis'],
    rotation21: ['rainfest', 'hunt', 'builder', 'oasis'], // the 2.x rotation, for events already running in older saves
    defs: {
      rainfest: { name: 'Rain Festival', desc: 'Keep the Rainwyrm misting. Every second it breathes earns a point, two in a Downpour.',
        tiers: [[300, { water: 1 }], [700, { speed15: 1 }], [1100, { beacons: 1 }], [1500, { starglass: 150 }]] },
      hunt: { name: 'Beast Hunt', desc: 'Slay beasts on the Dunes. Each beast is worth 10 points per level.',
        tiers: [[60, { journals: 1 }], [180, { speed15: 1 }], [350, { beacons: 1 }], [600, { starglass: 150 }]] },
      builder: { name: "Builder's Rush", desc: 'Finished upgrades earn 10 points per level, research 5 per level, and every 10 troops trained 1 point.',
        tiers: [[60, { stone: 1 }], [160, { speed15: 1 }], [300, { beacons: 1 }], [480, { starglass: 150 }]] },
      forgefest: { name: 'Forge Festival', needs: (S) => S.lv.forge > 0, fallback: 'builder',
        desc: 'Keep the forges roaring. Each piece of gear forged earns 25 points, every 2 Sunsteel smelted or gathered earns 1, and each Saltborn Hive you shatter earns 80.',
        tiers: [[80, { sunsteel_cache: 1 }], [250, { speed15: 1 }], [500, { beacons: 1 }], [800, { starglass: 150, sunsteel_cache: 1 }]] },
      spirerush: { name: 'Spire Rush', needs: (S) => S.stage >= DATA.spire.unlockStage, fallback: 'hunt',
        desc: 'Climb and duel. Each Mirage Spire floor cleared earns 40 points, each Dune Duel won 25 and each duel lost 8.',
        tiers: [[60, { journals: 1 }], [160, { speed15: 1 }], [320, { beacons: 1 }], [520, { starglass: 150 }]] },
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
      sunsteel: { name: 'Sunsteel Vein', load: 1, rate: 0.012, cap: 90 }, // Act II only
    },
    // Act II on the Dunes: springs flood, Sunsteel veins surface on bare sand, and Saltborn Hives rise far out
    act2: { veinShare: 0.07, hiveShare: 0.04, hiveFrom: 5, floodCap: 2, hiveStage: (lvl) => 55 + 4 * lvl, hiveScale: 1.2, hiveRespawn: 900 },
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

  // ---------- Incidents in the keep ----------
  // Small decisions at home. `at` is the plot the marker appears over ('gate' = the front gate).
  // Costs and resource rewards are in quarter-crates (they scale with the keep); buff = a timed bonus;
  // sick = share of healthy survivors who fall ill; troopsLost = share of troops at home.
  incidents: [
    { id: 'travelers', name: 'Travelers at the Gate', at: 'gate', text: 'A family of six, lips cracked from the sun, asks for water. The youngest can barely stand.',
      choices: [
        { label: 'Share our water', cost: { water: 1 }, outcomes: [{ p: 1, text: 'They drink, cry a little, and ask if they can stay. Of course they can.', reward: { survivors: 4 } }] },
        { label: 'Give them a waterskin and directions', cost: { water: 0.3 }, outcomes: [{ p: 1, text: 'They thank you and walk on toward the next keep. One of them leaves a journal behind.', reward: { journals: 1 } }] },
        { label: 'Turn them away', outcomes: [{ p: 1, text: 'They walk on. Nobody speaks much at dinner.', reward: {} }] },
      ] },
    { id: 'brackish', name: 'Brackish Water', at: 'well', needs: (S) => S.lv.well >= 1, text: 'The Deep Well tastes of salt this morning. The diggers think a seam broke open below.',
      choices: [
        { label: 'Dig past the salt seam', cost: { stone: 1.5 }, outcomes: [{ p: 1, text: 'Two days of hard work, and the water runs sweeter than ever.', reward: { buff: { key: 'prod_water', val: 0.2, secs: 360, label: '+20% water' } } }] },
        { label: 'Boil it before drinking', cost: { food: 1 }, outcomes: [{ p: 1, text: 'Cooking fires burn day and night, but nobody gets sick.', reward: {} }] },
        { label: 'Drink it anyway', outcomes: [
          { p: 0.5, text: 'It tastes awful, but everyone is fine.', reward: {} },
          { p: 0.5, text: 'By evening, the Healer\'s House is full.', reward: { sick: 0.15 } }] },
      ] },
    { id: 'buried', name: 'Buried Quarry', at: 'quarry', needs: (S) => S.lv.quarry >= 1, text: 'The wind filled the quarry cut with sand overnight. The crews are standing around the edge with shovels.',
      choices: [
        { label: 'Everyone digs together', cost: { food: 1 }, outcomes: [{ p: 1, text: 'By noon the cut is clear, and the crews have found a better face of stone.', reward: { buff: { key: 'prod_stone', val: 0.25, secs: 300, label: '+25% stone' } } }] },
        { label: 'Leave it for the quarry crew', outcomes: [{ p: 1, text: 'They get there in the end. It takes a while.', reward: { buff: { key: 'prod_stone', val: -0.2, secs: 240, label: '−20% stone' } } }] },
      ] },
    { id: 'scorpions', name: 'Scorpions in the Granary', at: 'grove', needs: (S) => S.lv.grove >= 1, text: 'A nest of scorpions has moved into the date stores. Nobody wants to reach into the baskets.',
      choices: [
        { label: 'Send in troops with torches', needs: (S) => KH.troopsAll() >= 10, outcomes: [
          { p: 0.8, text: 'Every scorpion is swept out. The troops are rather proud of themselves.', reward: { journals: 2 } },
          { p: 0.2, text: 'The nest is cleared, but a few soldiers are stung badly.', reward: { troopsLost: 0.03, journals: 1 } }] },
        { label: 'Smoke them out with wet palm fronds', cost: { water: 0.8 }, outcomes: [{ p: 1, text: 'The granary smells of smoke for a week, but the scorpions are gone.', reward: {} }] },
        { label: 'Leave them be', outcomes: [{ p: 1, text: 'They eat more than you would think.', reward: { foodCost: 3 } }] },
      ] },
    { id: 'wedding', name: 'A Wedding Under the Palms', at: 'shelter1', text: 'Two of your quarry workers want to marry under the palms by the spring.',
      choices: [
        { label: 'Throw a feast for the whole keep', cost: { food: 2 }, outcomes: [{ p: 1, text: 'There is music until dawn. The next day everyone works as if they slept a week.', reward: { buff: { key: 'prod', val: 0.12, secs: 360, label: '+12% production' } } }] },
        { label: 'A small ceremony', outcomes: [{ p: 1, text: 'It is short and lovely. Your Rainwyrm hums through the whole thing.', reward: { journals: 2 } }] },
      ] },
    { id: 'childspring', name: 'The Children\'s Spring', at: 'grove', needs: (S) => S.lv.grove >= 1, text: 'Children playing behind the palms found sand that stays damp in the midday sun.',
      choices: [
        { label: 'Dig a new spring', cost: { stone: 1 }, outcomes: [
          { p: 0.7, text: 'Clear water wells up. The children name it after themselves.', reward: { water: 3, buff: { key: 'prod_water', val: 0.1, secs: 600, label: '+10% water' } } },
          { p: 0.3, text: 'Only a seep, but every bucket counts.', reward: { water: 1.5 } }] },
        { label: 'Fill it in before someone falls', outcomes: [{ p: 1, text: 'The children are furious. Their parents are relieved.', reward: {} }] },
      ] },
    { id: 'fever', name: 'Heat Fever', at: 'infirmary', needs: (S) => S.pop >= 12, text: 'A fever is spreading through the houses. It always comes with the hottest weeks.',
      choices: [
        { label: 'Brew aloe tonic for everyone', cost: { water: 1, food: 1 }, outcomes: [{ p: 1, text: 'Bitter, but it works. The fever breaks in a day.', reward: { heal: 1 } }] },
        { label: 'Quarantine the sick houses', cost: { food: 0.6 }, outcomes: [{ p: 1, text: 'The fever stays where it started.', reward: { sick: 0.04 } }] },
        { label: 'Hope it passes', outcomes: [{ p: 1, text: 'It does pass, eventually, through half the keep first.', reward: { sick: 0.22 } }] },
      ] },
    { id: 'camels', name: 'Wild Camels', at: 'gate', text: 'A herd of wild camels wandered up to the walls, following the smell of water.',
      choices: [
        { label: 'Tame them for the caravans', cost: { food: 1.2 }, outcomes: [{ p: 1, text: 'It takes a week and a lot of dates. Your gatherers can carry more now.', reward: { buff: { key: 'gather', val: 0.25, secs: 600, label: '+25% gathering' } } }] },
        { label: 'Let them drink and go', cost: { water: 0.6 }, outcomes: [{ p: 1, text: 'An old saying goes that a watered camel brings luck. Someone finds starglass in the sand the next morning.', reward: { starglass: 40 } }] },
        { label: 'Drive them off', outcomes: [{ p: 1, text: 'They lope off into the haze, offended.', reward: {} }] },
      ] },
    { id: 'mirage', name: 'The Mirage Chaser', at: 'watchtower', needs: (S) => S.lv.watchtower >= 1, text: 'A lookout swears he saw a city of glass shimmering to the south, with water in its streets.',
      choices: [
        { label: 'Send scouts to look', needs: (S) => KH.troopsAll() >= 10, outcomes: [
          { p: 0.5, text: 'There is no city, but the scouts find an old cache half-buried in the glass.', reward: { journals: 3, starglass: 40 } },
          { p: 0.5, text: 'Just shimmer. The scouts come home sunburnt and annoyed.', reward: { troopsLost: 0.02 } }] },
        { label: 'Give the lookout a day off', outcomes: [{ p: 1, text: 'He sleeps for fourteen hours and stops seeing cities.', reward: {} }] },
      ] },
    { id: 'oldmap', name: 'An Old Map', at: 'archive', needs: (S) => S.lv.archive >= 1, text: 'Behind a loose tile in the Archive, your scholars found a map of the old water tunnels under the keep.',
      choices: [
        { label: 'Open the tunnels', cost: { stone: 1.5, copper: 0.5 }, outcomes: [{ p: 1, text: 'Cool, clean water runs in the dark under your feet. It has been there the whole time.', reward: { water: 4, buff: { key: 'prod_water', val: 0.2, secs: 480, label: '+20% water' } } }] },
        { label: 'Study it', outcomes: [{ p: 1, text: 'Your scholars fill three notebooks.', reward: { journals: 3 } }] },
      ] },
    { id: 'riders', name: 'Riders on the Ridge', at: 'watchtower', needs: (S) => S.lv.barracks >= 1 && S.lv.wyrm >= 4, text: 'Two riders have been watching the keep from the ridge since dawn.',
      choices: [
        { label: 'Chase them off', needs: (S) => KH.troopsAll() >= 20, outcomes: [
          { p: 0.7, text: 'They flee, dropping a saddlebag full of stolen starglass.', reward: { starglass: 50, journals: 1 } },
          { p: 0.3, text: 'It was a trap. Your riders fight their way back.', reward: { troopsLost: 0.05 } }] },
        { label: 'Double the watch', outcomes: [{ p: 1, text: 'Every wall is manned day and night. The troops grumble but stay sharp.', reward: { buff: { key: 'troop', val: 0.08, secs: 600, label: '+8% troop strength' } } }] },
      ] },
    { id: 'lostcaravan', name: 'Lost in the Storm', at: 'gate', needs: (S) => KH.isStorm(KH.curWx().type), text: 'Through the storm you hear camel bells. A caravan is lost just outside the walls.',
      choices: [
        { label: 'Flash the signal mirrors', cost: { water: 0.5 }, outcomes: [{ p: 1, text: 'They follow the light to the gate. The traders pay in copper and promises.', reward: { survivors: 2, copper: 1.5 } }] },
        { label: 'Bar the gates until it passes', outcomes: [{ p: 1, text: 'The bells fade. In the morning there are only tracks.', reward: {} }] },
      ] },
    { id: 'scales', name: 'Shed Scales', at: 'wyrm', needs: (S) => S.lv.wyrm >= 3, text: 'The Rainwyrm shed a few scales overnight. They shimmer like moving water.',
      choices: [
        { label: 'Sell them to a jeweler', outcomes: [{ p: 1, text: 'A traveling jeweler pays more than you expected.', reward: { starglass: 60 } }] },
        { label: 'Give them to the scholars', outcomes: [{ p: 1, text: 'The scholars study them for days and learn a great deal about wyrms.', reward: { journals: 4 } }] },
      ] },
    { id: 'watertable', name: 'Falling Water Table', at: 'well', needs: (S) => S.lv.well >= 3, text: 'The well rope comes up a little shorter every day. The water table is falling.',
      choices: [
        { label: 'Sink a second shaft', cost: { stone: 2, copper: 0.6 }, outcomes: [{ p: 1, text: 'The new shaft hits a fresh vein. The water runs strong again.', reward: { buff: { key: 'prod_water', val: 0.25, secs: 600, label: '+25% water' } } }] },
        { label: 'Ration drinking water', outcomes: [{ p: 1, text: 'Everyone drinks half. They do the work, slowly and thirsty.', reward: { buff: { key: 'drinkCut', val: 0.5, secs: 300, label: 'Half rations' }, buff2: { key: 'prod', val: -0.1, secs: 300, label: '−10% production' } } }] },
      ] },
    { id: 'healer', name: 'A Healer Passing Through', at: 'infirmary', needs: (S) => S.lv.infirmary >= 1, text: 'A traveling healer with a cart of herbs offers to work in your Healer\'s House for a while.',
      choices: [
        { label: 'Pay her in copper', cost: { copper: 0.8 }, outcomes: [{ p: 1, text: 'She treats everyone and teaches your healers a few tricks.', reward: { heal: 1, buff: { key: 'heal', val: 0.5, secs: 600, label: '+50% healing' } } }] },
        { label: 'Offer food and a bed', cost: { food: 0.5 }, outcomes: [{ p: 1, text: 'She stays two nights and leaves her notes behind.', reward: { journals: 2 } }] },
      ] },
    { id: 'storyteller', name: 'The Storyteller', at: 'hall', needs: (S) => S.lv.hall >= 1, text: 'An old storyteller arrived with a caravan and offers to tell the keep about the time before the Long Noon.',
      choices: [
        { label: 'Gather everyone in the square', outcomes: [{ p: 1, text: 'She tells them about rivers, and rain, and green hills. Nobody wants to go to bed.', reward: { buff: { key: 'prod', val: 0.08, secs: 480, label: '+8% production' } } }] },
        { label: 'Record her stories', outcomes: [{ p: 1, text: 'Your scholars write until their hands cramp.', reward: { journals: 3 } }] },
      ] },
  ],
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
