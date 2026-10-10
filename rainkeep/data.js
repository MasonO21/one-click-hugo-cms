/*
 * Rainkeep content tables.
 * Every number a designer would want to tune lives here; the game scripts only read it.
 * Timers and production run ~30x faster than a live-service version would, so the
 * two-act story can be played through in a couple of weeks of evenings.
 */
'use strict';

const DATA = {
  version: '4.40.0',
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
  // ---------- The keep's layout: a terraced oasis at the head of a canyon ----------
  // x runs right, z toward the viewer (the front gate), y up. The spring sits in a sunken stepped basin;
  // the houses and the barracks stand on raised side terraces (y 1.4), the upper town on the back
  // crescent (y 2.8) and the watchtower on its own crag (y 4.4). ry turns a building toward the spring.
  keep: {
    spring: { x: 0, z: -0.5, depth: 1.2 },
    gate: { x: 0, z: 16 },
    // raised ground on stone retaining walls (outline in x, z) and the watchtower's crag
    terraces: [
      { y: 2.8, pts: [[-17.5, -19.5], [17.5, -19.5], [17.5, -6.2], [8.5, -6.2], [6.5, -6.8], [4.5, -7.6], [2.2, -8.1], [0, -8.25], [-2.2, -8.1], [-4.5, -7.6], [-6.5, -6.8], [-8.5, -6.2], [-17.5, -6.2]] },
      { y: 1.4, pts: [[-17.5, -6.4], [-8.5, -6.4], [-7.4, -4.6], [-7.0, -2.2], [-7.0, 1.6], [-7.3, 4.6], [-8.1, 6.3], [-9.0, 6.8], [-17.5, 6.8]] },
      { y: 1.4, pts: [[17.5, -6.4], [8.5, -6.4], [7.4, -4.6], [7.0, -2.2], [7.0, 1.6], [7.3, 4.6], [8.1, 6.3], [9.0, 6.8], [17.5, 6.8]] },
    ],
    crag: { x: 10.4, z: -11.2, r: 2.35, y: 4.4 },
    // stairs from [x, z, y] at the foot to [x, z, y] at the head
    stairs: [
      { a: [-9.4, 9.0, 0], b: [-9.4, 6.8, 1.4], w: 1.5 },
      { a: [9.4, 9.0, 0], b: [9.4, 6.8, 1.4], w: 1.5 },
      { a: [-8.4, -4.0, 1.4], b: [-8.4, -6.2, 2.8], w: 1.4 },
      { a: [8.4, -4.0, 1.4], b: [8.4, -6.2, 2.8], w: 1.4 },
      { a: [10.4, -6.9, 2.8], b: [10.4, -8.95, 4.4], w: 1.1 },
    ],
    plots: {
      well: { x: -4.4, z: 8.0, y: 0, ry: 0.35 },
      grove: { x: 5.0, z: 8.4, y: 0, ry: -0.35 },
      storehouse: { x: -6.4, z: 12.6, y: 0, ry: 0.5 },
      quarry: { x: -12.2, z: 10.8, y: 0, ry: 0.65 },
      mine: { x: 12.0, z: 10.8, y: 0, ry: -0.65 },
      shelter1: { x: -10.6, z: -2.2, y: 1.4, ry: 0.55 },
      shelter2: { x: -10.2, z: 3.4, y: 1.4, ry: 0.4 },
      barracks: { x: 10.6, z: -2.2, y: 1.4, ry: -0.55 },
      infirmary: { x: 10.2, z: 3.4, y: 1.4, ry: -0.4 },
      forge: { x: -10.2, z: -10.4, y: 2.8, ry: 0.35 },
      archive: { x: -4.2, z: -12.0, y: 2.8, ry: 0.15 },
      hall: { x: 3.6, z: -12.2, y: 2.8, ry: -0.15 },
      watchtower: { x: 10.4, z: -11.2, y: 4.4, ry: -0.3 },
    },
  },
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
  // formations: which class leads a march (expedition battles and marches on the Dunes). A lead class makes up
  // this share of the march when you have enough of it; the rest come in proportion.
  formation: { lead: 0.7 },
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
    // Act III: they answer the Beacon once the Ember Throne has fallen
    { id: 'yusra', name: 'Yusra Tidecaller', rarity: 'legendary', cls: 'bow', hue: 180, act: 3,
      title: 'Voice of the Old Sea', steward: { kind: 'water', val: 35 },
      look: { skin: 3, hair: '#1a1210', wrap: 'veil', cloth: '#1f7a72', trim: '#9ff0e0' },
      skill: { name: 'Song of the Tide', desc: 'Your side hits {atk} harder and recovers {heal} of its health each round.', fx: { atk: 0.14, heal: 0.03 } },
      bio: 'She learned the wyrm-songs from her grandmother on the Bone Coast, where the sea used to be. When she sings, water remembers where it belongs.' },
    { id: 'haroun', name: 'Haroun Glasshand', rarity: 'legendary', cls: 'guard', hue: 32, act: 3,
      title: 'Shaper of the Black Glass', steward: { kind: 'stone', val: 35 },
      look: { skin: 4, hair: '#8a8478', wrap: 'helm', cloth: '#5a3a1a', trim: '#ffb347', beard: '#8a8478', mark: 'scar' },
      skill: { name: 'Glass Bastion', desc: 'Your side takes {dr} less damage and ignores {pierce} of enemy defense.', fx: { dr: 0.12, pierce: 0.12 } },
      bio: 'A glassblower from the Burning Line who shapes the melted desert into shields. His hands are scarred to the wrist and he will not wear gloves.' },
    { id: 'noor', name: 'Noor Bonewalker', rarity: 'epic', cls: 'lancer', hue: 40, act: 3,
      title: 'Bonepicker Turned Rider', steward: { kind: 'copper', val: 20 },
      look: { skin: 2, hair: '#120c08', wrap: 'scarf', cloth: '#a8641c', trim: '#f0e6d0' },
      skill: { name: 'Fang Charge', desc: 'Opening strike deals {burst} extra damage.', fx: { burst: 0.35 } },
      bio: 'She grew up picking wyrm bones on the Bone Coast and sold every charm she ever carved to buy a camel. Now she rides at the front.' },
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
    // Act III: The Wyrmsong
    { from: 101, act: 3, name: 'The Burning Line', foes: [['Sunborn Host', 'guard'], ['Scorchline Riders', 'lancer'], ['Pale Archers', 'bow'], ['Glass Titans', 'guard']],
      story: 'Forty days of rain, and on the forty-first {wyrm} began to sing. Not its usual hum: a long, rising song that set every water jar in the keep ringing. And from the far south, past the smouldering Burning Line, something sang back.' },
    { from: 111, act: 3, name: 'The Bone Coast', foes: [['Bonepickers', 'lancer'], ['Marrow Hounds', 'lancer'], ['Ribcage Golems', 'guard'], ['Gull Harpies', 'bow']],
      story: 'South of the Burning Line the old sea left its shore behind: a white beach a hundred miles long, made of bones. Wyrm bones. The Bonepickers who live there grind them into charms and sell them as rain-luck. The song is louder here, and it comes from under the salt.' },
    { from: 121, act: 3, name: 'The Thunderless Steppe', foes: [['Static Wraiths', 'bow'], ['Spark Jackals', 'lancer'], ['Iron Rams', 'guard'], ['Stormcaller Cultists', 'bow']],
      story: 'A storm hangs over the steppe and has not moved in sixty years. Lightning stands frozen in the air like cracks in glass. The Stormcallers say they keep it still for everyone\'s good. {wyrm} says, in its way, that something inside the storm is trying to breathe.' },
    { from: 131, act: 3, name: 'The Ashen Sky', foes: [['Ash Seraphs', 'bow'], ['Cinder Wardens', 'guard'], ['Smoke Riders', 'lancer'], ['Kiln Wyverns', 'lancer']],
      story: 'Here the ash never settled. It floats in grey reefs above the land, and the last of the Cinder Choir live on them, singing the embers warm. Somewhere inside the thickest cloud of ash, a fourth voice joins the song.' },
    { from: 141, act: 3, name: "The Mother's Well", foes: [['Thirstborn', 'guard'], ['Well Shades', 'bow'], ['Dry Lancers', 'lancer'], ['Hollow Sentinels', 'guard']],
      story: 'At the bottom of the world is a well so deep its water is older than the fallen sun. The kin say their mother sleeps there, chained by the thing the Sunwarden served: the Thirst, which lives where water should be and drinks whatever comes near. It has waited a long time for a warden to bring it a wyrm.' },
    { from: 151, name: 'The Far South', foes: [['Sunborn Host', 'guard'], ['Scorchline Riders', 'lancer'], ['Pale Archers', 'bow'], ['Glass Titans', 'guard']],
      story: 'The Mother of Rains is awake, and the maps run out. Past the Well, the last embers of the Thirst still smoulder in the far south. Push them back as far as your keep can reach.' },
  ],
  bosses: {
    5: ['Jackal Alpha', 'lancer'], 10: ['Salt Behemoth', 'guard'], 15: ['Dust Matron', 'bow'],
    20: ['Basalt Tortoise', 'guard'], 25: ['The Pale Herald', 'bow'], 30: ['The Sand Colossus', 'guard'],
    35: ['Shatterjaw Sandshark', 'lancer'], 40: ['The Mirage Queen', 'bow'], 45: ['The Buried Bellringer', 'guard'],
    50: ['Spire Colossus', 'guard'], 55: ['The Hollow King', 'lancer'], 60: ['The Sunheart', 'guard'],
    65: ['The Wadi King', 'lancer'], 70: ['The Drowned Colossus', 'guard'], 75: ['The Brine Matriarch', 'bow'],
    80: ['The Salt Leviathan', 'guard'], 85: ['The Ash Prophet', 'bow'], 90: ['The Obsidian Wyvern', 'lancer'],
    95: ['The Sunwarden', 'lancer'], 100: ['The Ember Throne', 'guard'],
    105: ['The Cinderwarden', 'guard'], 110: ['The Glass Tomb', 'guard'], 115: ['The Ossuary Matron', 'bow'],
    120: ['The Salt Prison', 'guard'], 125: ['The Stillstorm Shepherd', 'lancer'], 130: ['The Dead Storm', 'bow'],
    135: ['The Last Choirmaster', 'bow'], 140: ['The Ash Cocoon', 'guard'], 145: ['The Well-Warden', 'lancer'],
    150: ['The Thirst', 'guard'],
  },
  // the endless Far South: a named warlord every ten stages, in this order, then again a rank harder (II, III, ...)
  farSouthBosses: [['Ashfang the Ember Drake', 'lancer'], ['The Glassback Matriarch', 'guard'], ['The Cinder Colossus', 'guard'], ['Mother of Mirages', 'bow'],
    ['The Dune Leviathan', 'lancer'], ['Khamsin, the Storm Unending', 'bow'], ['The Obsidian Titan', 'guard'], ['The Pale Lion of the South', 'lancer'],
    ['The Crystal Sultan', 'guard'], ['The Last Ember of the Thirst', 'bow']],
  actOneStage: 60, // beating this ends Act I ("The Rains") and opens Act II
  actTwoStage: 100, // beating this ends Act II ("The Long Rains") and opens Act III
  finalStage: 150, // beating this ends the story ("The Wyrmsong"); stages past it are the endless Far South
  // stage n foe: base x growth^(n-1) through stage 30, then gentler late growth to 60, then the endless curve
  // (base stats raised 12% in 3.5, when hero skills and the breath's timing arrived)
  // past stage 100 (Act III and the Far South) a stage counts as 0.75 of a stage on that curve, so
  // the third act's bosses every five stages still end the story within reach of a Skyriver keep
  enemy: { atk: 80.6, def: 47, hp: 918, gAtk: 1.13, gDef: 1.12, gHp: 1.14, lateFrom: 30, lAtk: 1.027, lDef: 1.022, lHp: 1.032, endAtk: 1.03, endDef: 1.025, endHp: 1.035, boss: 1.5, act3Ease: 0.75 },
  maxRounds: 12,
  // Foe traits: from stage 16 every expedition foe has one (a boss two), each with a counter the squad can play:
  // Sunder against armor, a skill strike against regeneration, Mend against venom, the Torrent against frenzy and
  // against a sand-shell. A foe whose trait a hero's skill answers is a little weaker otherwise (ease), so a squad that
  // brings the counter comes out ahead and one that doesn't falls behind; the Torrent's traits cost no ease, since every
  // squad has the breath and the question is only when to spend it.
  traits: {
    from: 16, ease: 0.96,
    list: {
      armored: { name: 'Armored', icon: 'i-tr-armored', def: 1.5, text: 'Half again as hard to hurt. Sunder cuts twice as deep.' },
      regen: { name: 'Regenerating', icon: 'i-tr-regen', heal: 0.05, text: 'Heals 5% a round, unless a skill strikes it that round.' },
      venom: { name: 'Venomous', icon: 'i-tr-venom', dot: 0.04, ward: 2, text: 'Poisons the squad for 4% a round. Mend cures it and wards for two rounds.' },
      frenzy: { name: 'Frenzied', icon: 'i-tr-frenzy', ramp: 0.1, ease: 1, text: 'Hits 10% harder every round. The Torrent calms it.' },
      shell: { name: 'Sand-shelled', icon: 'i-tr-shell', rounds: 3, cut: 0.5, ease: 1, text: 'Takes half damage for its first three rounds. The Torrent cracks the shell.' },
    },
    order: ['armored', 'regen', 'venom', 'frenzy', 'shell'],
  },
  // ---------- Battle tactics ----------
  // Every foe winds up a heavy blow on round 3 and every 4th round after (bosses every 3rd), announced
  // a round ahead.
  // The Rainwyrm's breath is used once a battle: it burns the foe and, timed on a wind-up, breaks it.
  // Each squad hero's skill (its kind follows the hero's passive skill) charges over `charge` rounds and
  // fires on a tap, or by itself in auto-battle. Strength grows a little with the hero's stars.
  battle: {
    windupFirst: 3, windupEvery: 4, windup: 2.2,
    boss: { first: 3, every: 3, windup: 3.0 }, // bosses wind up more often
    charge: 3, startCharge: 1, // a skill is ready before round 3, then every 3 rounds
    skills: {
      dr: { name: 'Guard', desc: "Halves the damage your side takes this round and next.", rounds: 2, cut: 0.5 },
      burst: { name: 'Charge', desc: 'An extra blow worth 60% of a round.', hit: 0.6 },
      atk: { name: 'Volley', desc: 'An extra blow worth 45% of a round.', hit: 0.45 },
      heal: { name: 'Mend', desc: "Restores 12% of your side's health.", heal: 0.12 },
      pierce: { name: 'Sunder', desc: "Cuts the foe's defense by 30% for 2 rounds.", rounds: 2, cut: 0.3 },
    },
    // Breath Arts (4.40): what the Rainwyrm's one breath a fight does. Every art breaks a wind-up. The Torrent hits for
    // the breath's share of the foe's health and cracks a sand-shell or calms a frenzy; the Mist Veil heals the squad
    // instead (heal times the breath's share of the squad's health), cuts the damage it takes for two rounds and draws
    // out venom; the Riptide hits for 40% of a Torrent and holds the foe under for two rounds (no blows, no
    // regeneration), calming a frenzy. Tuned by simulation so that on a plain foe all three need about the same
    // strength, and each is a few percent ahead against its own traits: the Veil against venom, the Riptide against
    // regeneration, the Torrent against shells and frenzy. The Veil and Riptide are what take the Unbroken star.
    arts: {
      order: ['torrent', 'veil', 'riptide'],
      torrent: { name: 'Torrent', icon: 'i-water', unlock: 1, text: 'A wall of water: damage, cracks a sand-shell, calms a frenzy.' },
      veil: { name: 'Mist Veil', icon: 'i-veil', unlock: 6, heal: 1.6, rounds: 2, cut: 0.3, ward: 2, text: 'Cool mist over the squad: heals it, softens the next blows, draws out venom.' },
      riptide: { name: 'Riptide', icon: 'i-riptide', unlock: 11, hit: 0.4, rounds: 2, text: 'Drags the foe under for two rounds: less damage, but no blows and no healing while it struggles, and a frenzy calmed.' },
    },
  },
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
    note: 'Act II is over. Act III, The Wyrmsong, starts at stage 101.',
  },
  ending3: {
    title: 'The Wyrmsong',
    lines: [
      'The Thirst does not die. It is pushed down, below the water, below the stone, below the places songs can reach. Ghaitha, the Mother of Rains, lifts her head out of the Well for the first time in three hundred years and breathes, and the whole south turns to fog.',
      'The kin fly north together. Nadaa settles on the cliffs above the keep. Seyl takes the wadis, Barq the high storms, Sahab the long summer clouds. {wyrm} stays at the spring where it hatched, and Ghaitha settles on the cliff above it, like an old woman at her window.',
      'That winter it rains on the keep the way it rained in the old stories: softly, often, for no reason at all. Nima, old enough now to stand a watch, writes it all down.',
      'Elder Maram, who waited seventy years to see one wyrm, sits on the wall every evening and counts five.',
    ],
    reward: { starglass: 4000, beacons: 20, sunsteel: 3000, skin: 'wyrmsong' },
    badge: 'Wyrmsinger',
    note: "You finished Rainkeep's story. The Far South, the Mirage Spire and the Dune Duels stay open for as long as you want to play.",
  },

  // ---------- Chapter quests ----------
  // check(S) returns true when done. go: 'plot:<id>' | 'tab:<tab>' | 'sheet:<kind>'
  // where the keep-life quests were inserted in 2.1 (core.js migrates older saves)
  questsAdded21: [5, 15, 18, 25],
  // where the Forge, Spire and Duels quests were inserted in 3.0
  questsAdded30: [41, 44, 46, 47, 50, 52],
  quests: [
    { text: 'Dig the Deep Well. The Rainwyrm is thirsty.', go: 'plot:well', check: (S) => S.lv.well >= 1, reward: { water: 150 } },
    // a building can't outgrow the wyrm, so the wyrm grows first
    { text: 'Grow the Rainwyrm to Lv 2', go: 'plot:wyrm', check: (S) => S.lv.wyrm >= 2, reward: { beacons: 2, starglass: 100 } },
    { text: 'Upgrade the Date Grove to Lv 2', go: 'plot:grove', check: (S) => S.lv.grove >= 2, reward: { food: 150 } },
    { text: 'Upgrade the Deep Well to Lv 2', go: 'plot:well', check: (S) => S.lv.well >= 2, reward: { stone: 200 } },
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
    // Act III: The Wyrmsong (and Hero Tales, tales.js)
    { text: 'Read the first chapter of a Hero Tale', go: 'tab:roster', check: (S) => (S.stats.taleParts || 0) >= 1, reward: { journals: 120, starglass: 200 } },
    { text: 'Free Nadaa from the Glass Tomb (stage 110)', go: 'tab:expedition', check: (S) => S.stage > 110, reward: { starglass: 1500, shard_legendary: 1 } },
    { text: 'Finish 5 Hero Tale chapters', go: 'tab:roster', check: (S) => (S.stats.taleParts || 0) >= 5, reward: { beacons: 6 } },
    { text: 'Free Seyl from the Salt Prison (stage 120)', go: 'tab:expedition', check: (S) => S.stage > 120, reward: { starglass: 1500, sunsteel: 1200 } },
    { text: "Finish a hero's whole tale", go: 'tab:roster', check: (S) => (S.stats.talesDone || 0) >= 1, reward: { shard_legendary: 1 } },
    { text: 'Free Barq from the Dead Storm (stage 130)', go: 'tab:expedition', check: (S) => S.stage > 130, reward: { starglass: 2000, beacons: 8 } },
    { text: 'Finish 3 Hero Tales', go: 'tab:roster', check: (S) => (S.stats.talesDone || 0) >= 3, reward: { starglass: 1500, shard_epic: 2 } },
    { text: 'Free Sahab from the Ash Cocoon (stage 140)', go: 'tab:expedition', check: (S) => S.stage > 140, reward: { starglass: 2000, sunsteel: 1500 } },
    { text: 'Wake the Mother of Rains (stage 150)', go: 'tab:expedition', check: (S) => S.stage > 150, reward: { starglass: 3000, shard_legendary: 1 } },
    // the Deepspring, from Rainwyrm Lv 20
    { text: 'Refine Tideglass at the Deepspring (Rainwyrm Lv 20)', go: 'sheet:deepspring', check: (S) => (S.stats.refines || 0) >= 1, reward: { tideglass: 10 } },
    { text: 'Deepen the Deepspring to Lv 3', go: 'sheet:deepspring', check: (S) => !!S.deep && S.deep.lv >= 3, reward: { starglass: 1500 } },
    { text: 'Reach Springsong I: Deepspring Lv 5', go: 'sheet:deepspring', check: (S) => !!S.deep && S.deep.lv >= 5, reward: { tideglass: 20, shard_legendary: 1 } },
    { text: 'Push 10 stages into the Far South (stage 160)', go: 'tab:expedition', check: (S) => S.stage > 160, reward: { tideglass: 30, starglass: 1000 } },
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
    bloom: { name: 'Desert Bloom', body: ['#2f6a2a', '#9ad86a'], belly: '#fbffe8', eye: '#ffe08a', mist: ['#d8ffb0', '#ffffff'], fin: '#ff9ad0', horn: '#fff4d8', note: 'Grow 30 oases on the Dunes', locked: true },
    wyrmsong: { name: 'Wyrmsong', body: ['#23305e', '#9ab8ff'], belly: '#fff8ec', eye: '#ffd36e', mist: ['#c8d8ff', '#fff4dc'], fin: '#ffc8f0', horn: '#fff2c8', note: 'Wake the Mother of Rains', locked: true },
    // the elder kin of Act III (lore.js); never offered in the Store
    kin_nadaa: { name: 'Nadaa', hidden: true, body: ['#5a8a9a', '#dff6ff'], belly: '#ffffff', eye: '#bff4ff', mist: ['#e8fbff', '#ffffff'], fin: '#c8f0ff', horn: '#f4fbff' },
    kin_seyl: { name: 'Seyl', hidden: true, body: ['#0e3a5a', '#2fa0c8'], belly: '#bfeaff', eye: '#ffe08a', mist: ['#6cd0ff', '#dff6ff'], fin: '#4fe0d0', horn: '#d8e8f0' },
    kin_barq: { name: 'Barq', hidden: true, body: ['#2a2450', '#6a6ad8'], belly: '#e0e0ff', eye: '#fff36e', mist: ['#b0b8ff', '#fffbe0'], fin: '#ffe84a', horn: '#fff8c8' },
    kin_sahab: { name: 'Sahab', hidden: true, body: ['#8a8aa0', '#f4f4fa'], belly: '#ffffff', eye: '#7ad0ff', mist: ['#ffffff', '#f0f4ff'], fin: '#ffd8e8', horn: '#ffffff' },
    kin_ghaitha: { name: 'Ghaitha', hidden: true, body: ['#0e3a20', '#3fbf6e'], belly: '#f4ffe4', eye: '#ffe08a', mist: ['#c8ffd8', '#fffbe8'], fin: '#ffcf4a', horn: '#fff0b8' },
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
    { id: 'petkit', name: 'Companion Kit', usd: 2.99, daily: true, tag: 'Daily', needsWyrm: 7,
      grants: { treats: 150, bells: 5, speed15: 1 },
      desc: '150 Honeyed Dates and five Camel Bells for your companions, and a 15-minute speedup. Once per day, from Rainwyrm Lv 7.' },
    { id: 'roadkit', name: 'Road Dice', usd: 1.99, daily: true, tag: 'Daily', needs: 'hall',
      grants: { dice: 20, lucky: 1 },
      desc: 'Twenty Road Dice and a Lucky Die for the Spice Road. Once per day, after you build the Caravan Hall.' },
    { id: 'foundkit', name: 'Founding Chest', usd: 4.99, once: true, tag: 'Founding Week', when: (S) => !!(S.founding && S.founding.state === 'open'),
      grants: { starglass: 500, shard_epic: 1, speed60: 3, beacons: 5 },
      desc: '500 Starglass, an Epic Shard Pouch, three 60-minute speedups and five Beacon Tokens. Once, during your Founding Week.' },
    { id: 'digkit', name: "Digger's Kit", usd: 1.99, daily: true, tag: 'Daily', needsWyrm: 11,
      grants: { trowel: 30, charge: 2 },
      desc: 'Thirty Trowels and two Blasting Charges for the Buried City. Once per day, from Rainwyrm Lv 11.' },
    { id: 'heirloomkit', name: 'Heirloom Kit', usd: 4.99, daily: true, tag: 'Daily', needsWyrm: 6,
      grants: { whetstone: 40, journals: 400, speed60: 1 },
      desc: "Forty Desert Whetstones for your heroes' heirlooms, 400 Field Journals and a 1-hour speedup. Once per day, from Rainwyrm Lv 6." },
    { id: 'tidekit', name: 'Tideglass Kit', usd: 4.99, daily: true, tag: 'Daily', needsWyrm: 20,
      grants: { tideglass: 60, crate_copper: 3, speed60: 1 },
      desc: 'Sixty Tideglass for the Deepspring, three copper crates and a 60-minute speedup. Once per day, from Rainwyrm Lv 20.' },
    // Growth Packs: on sale for a few hours after each Rainwyrm level-up, once per level. `lvpack` is the share
    // of the next level's resources (the wyrm plus each building it needs), counted when the pack opens.
    { id: 'lvpack', name: 'Growth Pack', usd: 4.99, tag: 'Limited', levelPack: true,
      grants: { lvpack: 0.15, speed60: 2 },
      desc: 'Resources for 15% of your next Rainwyrm level (the wyrm and every building it needs) and two 60-minute speedups.' },
    { id: 'lvpack2', name: 'Grand Growth Pack', usd: 19.99, tag: 'Limited', levelPack: true,
      grants: { lvpack: 0.4, speed60: 5, starglass: 500 },
      desc: 'Resources for 40% of your next Rainwyrm level, five 60-minute speedups and 500 Starglass.' },
    { id: 'sg1', name: 'Pouch of Starglass', usd: 1.99, grants: { starglass: 120 } },
    { id: 'sg2', name: 'Satchel of Starglass', usd: 4.99, grants: { starglass: 330 } },
    { id: 'sg3', name: 'Chest of Starglass', usd: 9.99, grants: { starglass: 700 } },
    { id: 'sg4', name: 'Crate of Starglass', usd: 19.99, grants: { starglass: 1500 } },
    { id: 'sg5', name: 'Vault of Starglass', usd: 49.99, grants: { starglass: 4000 } },
    { id: 'sg6', name: 'Hoard of Starglass', usd: 99.99, grants: { starglass: 8500 } },
  ],
  levelPacks: { from: 6, window: 3 * 3600 }, // Growth Packs open at each Rainwyrm level from Lv 6, for 3 hours of play
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
      if (f > 100) r.tideglass = f % 10 === 0 ? 8 : 1; // the Deepspring's crystal, past floor 100
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
    treats: { name: 'Honeyed Dates', kind: 'pet', icon: 'i-treat', desc: 'Treats for your companions: they level up on them.' },
    bells: { name: 'Camel Bell', kind: 'pet', icon: 'i-bell', desc: 'Tames new companions and Advances them past Lv 10 and 20.' },
    dice: { name: 'Road Die', kind: 'road', icon: 'i-die', desc: 'Rolls the caravan forward on the Spice Road.' },
    lucky: { name: 'Lucky Die', kind: 'road', icon: 'i-luckydie', desc: 'Rolls whatever number you choose on the Spice Road.' },
    trowel: { name: 'Trowel', kind: 'dig', icon: 'i-dg-trowel', desc: 'Digs one tile of sand in the Buried City.' },
    charge: { name: 'Blasting Charge', kind: 'dig', icon: 'i-dg-charge', desc: 'Clears a 3x3 patch of the Buried City at once, bedrock and all.' },
    whetstone: { name: 'Desert Whetstone', kind: 'heirloom', icon: 'i-whetstone', desc: "Wakes and tempers a hero's heirloom." },
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
    { id: 'channel', text: 'Solve a channel puzzle', n: 1, pts: 10 },
    // shown only once their mode is open
    { id: 'crossing', text: 'Cross 3 rows on the Crossing', n: 3, pts: 10, show: (S) => S.stage >= 36 },
    { id: 'refine', text: 'Refine Tideglass twice', n: 2, pts: 10, show: (S) => S.lv.wyrm >= 20 },
    { id: 'companion', text: "Use a companion's skill", n: 1, pts: 10, show: (S) => S.lv.wyrm >= 7 },
    { id: 'road', text: 'Roll the Road Dice 5 times', n: 5, pts: 10, show: (S) => S.lv.hall > 0 },
    { id: 'rival', text: 'March on a rival keep', n: 1, pts: 15, show: (S) => S.lv.wyrm >= 8 },
    { id: 'siege', text: 'Hold 3 waves of a Scorpion Siege', n: 3, pts: 15, show: (S) => S.lv.wyrm >= 10 },
    { id: 'intel', text: 'Complete 2 watchtower reports', n: 2, pts: 15, show: (S) => S.lv.wyrm >= 4 },
    { id: 'defense', text: 'Raise a gate defense', n: 1, pts: 10, show: (S) => S.lv.wyrm >= 5 },
    { id: 'drill', text: 'Drill troops to a new rank', n: 1, pts: 10, show: (S) => S.lv.barracks >= 10 },
    { id: 'clash', text: 'Fight a Wadi Clash', n: 1, pts: 10, show: (S) => S.lv.wyrm >= 9 },
    { id: 'trade', text: 'Send a trade caravan', n: 1, pts: 10, show: (S) => S.lv.wyrm >= 10 },
    { id: 'derby', text: 'Run a Camel Derby race', n: 1, pts: 10, show: (S) => S.lv.wyrm >= 8 },
    { id: 'journey', text: 'Send heroes on a Far Journey', n: 1, pts: 10, show: (S) => S.lv.wyrm >= 5 },
    { id: 'cook', text: 'Cook a dish at the Cookfire', n: 1, pts: 10, show: (S) => S.lv.wyrm >= 4 },
    { id: 'leviathan', text: 'Attack the Sand Leviathan', n: 1, pts: 10, show: (S) => S.lv.wyrm >= 9 },
    { id: 'dig', text: 'Dig 10 tiles in the Buried City', n: 10, pts: 10, show: (S) => S.lv.wyrm >= 11 },
    { id: 'decree', text: 'Give a Warden\'s Decree', n: 1, pts: 10, show: (S) => S.lv.wyrm >= 5 },
    { id: 'outpost', text: 'Collect from an outpost', n: 1, pts: 10, show: (S) => S.lv.wyrm >= 7 },
    { id: 'fish', text: 'Catch 2 fish in the spring', n: 2, pts: 10, show: (S) => S.lv.wyrm >= 3 },
    { id: 'temper', text: 'Temper a heirloom', n: 1, pts: 10, show: (S) => Object.values(S.heroes).some((h) => h.stars >= 3) },
  ],
  dutyChests: [
    [20, { journals: 20, speed5: 1, dice: 1 }],
    [40, { starglass: 40, crate_stone: 1, treats: 5, dice: 1 }],
    [60, { beacons: 1, speed15: 1, dice: 2 }],
    [80, { starglass: 60, crate_water: 1, journals: 30, treats: 10, dice: 2 }],
    [100, { beacons: 2, speed60: 1, bells: 2, dice: 3 }],
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
  // ---------- The Rainwyrm's bond ----------
  // Every few minutes the wyrm wants something. Granting a wish adds bond points; each bond level
  // adds a small lasting perk. Wishes you miss simply fade. {n} is the wyrm's name.
  bond: {
    unlock: 2, // Rainwyrm level
    every: [300, 600], // seconds between wishes
    lasts: 1500, // a wish fades after this long
    levels: [0, 40, 100, 180, 280, 400, 540, 700, 880, 1080],
    reward: { journals: 1 }, // each granted wish, scaled to the keep
    wishes: [
      { id: 'rain', text: '{n} wants to feel the rain on its scales.', how: 'Call the Rain', ev: 'rain', need: 1, pts: 25, act: 'rain', label: 'Call the Rain', needs: (S) => S.lv.wyrm >= 3 },
      { id: 'pet', text: '{n} keeps nudging your hand with its nose.', how: 'Pet {n} three times', ev: 'pet', need: 3, pts: 12, act: 'pet', label: 'Pet' },
      { id: 'dates', text: '{n} is hungry for fresh dates.', how: 'Feed {n} dates from the stores', feed: { food: 2 }, need: 1, pts: 18 },
      { id: 'downpour', text: '{n} wants to stretch and breathe a Downpour.', how: 'Keep the mist on Downpour for 30 seconds', mist: 'high', need: 30, pts: 12, act: 'mist', arg: 'high', label: 'Downpour' },
      { id: 'tale', text: '{n} wants to hear what lies out on the Dunes.', how: 'Bring home a gathering march', ev: 'gatherDone', need: 1, pts: 20, go: 'world', label: 'To the Dunes', needs: (S) => S.quest >= 12 },
      { id: 'splash', text: '{n} wants to splash in the old channels.', how: 'Solve a channel puzzle', ev: 'channel', need: 1, pts: 20, act: 'channels', label: 'Open Channels', needs: (S) => S.lv.wyrm >= 2 },
      { id: 'storm', text: '{n} wants to watch a storm roll past, safe in its spring.', how: 'Ride out a sandstorm or heatwave', ev: 'stormEnd', need: 1, pts: 22 },
      { id: 'battle', text: '{n} wants a story of a battle won.', how: 'Win an expedition battle', ev: 'stage', need: 1, pts: 18, go: 'world', label: 'To the expedition' },
      { id: 'friend', text: '{n} wants to meet someone new.', how: 'Recruit a hero', ev: 'pull', need: 1, pts: 15, go: 'heroes', label: 'To the Beacon' },
      { id: 'build', text: '{n} likes to watch the builders work.', how: 'Finish an upgrade', ev: 'upgrade', need: 1, pts: 15 },
      { id: 'surplus', text: '{n} wants to see the keep busy.', how: 'Collect 3 surplus bubbles', ev: 'surplus', need: 3, pts: 15 },
      { id: 'forge', text: "{n} loves the forge's glow.", how: "Forge the Warden's Gear", ev: 'gear', need: 1, pts: 20, go: 'plot:forge', label: 'To the Forge', needs: (S) => S.lv.forge > 0 },
      { id: 'fly', text: '{n} keeps looking up at the sky.', how: 'Take {n} on a Cloud Run', ev: 'cloudrun', need: 1, pts: 20, act: 'cloudrun', label: 'Fly out', needs: (S) => S.lv.wyrm >= 5 },
      { id: 'spire', text: '{n} wants to see the Mirage Spire shimmer.', how: 'Clear a Mirage Spire floor', ev: 'spire', win: true, need: 1, pts: 20, go: 'world', label: 'To the Spire', needs: (S) => S.stage > 30 },
    ],
    // a lasting perk for each bond level from 2 (bonus keys, read through KH.bonus)
    perks: [
      null,
      { key: 'mult_water', val: 0.04, text: '+4% water from the wells' },
      { key: 'cool', val: 0.5, text: '+0.5°C of cooling over the keep' },
      { key: 'rainCd', val: 0.08, text: 'Call the Rain recharges 8% faster' },
      { key: 'prod', val: 0.03, text: '+3% production' },
      { key: 'breath', val: 0.1, text: "+10% Rainwyrm's breath in battle" },
      { key: 'wishx', val: 1, text: 'Granted wishes pay double' },
      { key: 'mult_water', val: 0.06, text: '+6% more water from the wells' },
      { key: 'rainDur', val: 6, text: 'Call the Rain lasts 6 seconds longer' },
      { key: 'prod', val: 0.05, text: '+5% more production, and a bond-light over the spring' },
    ],
  },

  // ---------- Keep gardens: monuments and gardens with their own place in the keep ----------
  // Each climbs 5 levels. Resource costs are quarter-crates scaled to the keep when you build, in food
  // and stone, which pile up late (water and copper stay for buildings); a few take Sunsteel or
  // Starglass instead. Every level adds `per` to a bonus.
  // at: [x, z, y] in the keep (DATA.keep coordinates).
  decor: {
    unlock: 6, maxLevel: 5, growth: 1.7,
    items: [
      { id: 'fountain', name: 'Spring Fountain', at: [0, 13.3, 0], cost: { stone: 2, food: 4 }, key: 'cool', per: 0.25, unit: '°C of cooling', desc: 'A tiered fountain inside the gate, where every caravan stops to drink.' },
      { id: 'palms', name: 'Palm Court', at: [-15.4, 10.4, 0], cost: { food: 5, stone: 1 }, key: 'prod_food', per: 0.02, pct: true, unit: 'dates', desc: 'Date palms around a reflecting pool, below the quarry cliffs.' },
      { id: 'pergola', name: 'Shade Pergola', at: [-15.3, 2.6, 1.4], cost: { stone: 2, food: 3 }, key: 'drinkCut', per: 0.02, pct: true, unit: 'less water drunk by survivors', desc: 'Vines over slatted shade, where the houses quarter rests at noon.' },
      { id: 'herbs', name: 'Herb Garden', at: [15.3, 2.6, 1.4], cost: { food: 5, stone: 1 }, key: 'heal', per: 0.06, pct: true, unit: 'faster healing', desc: "Raised beds of aloe and mint beside the Healer's House." },
      { id: 'statues', name: 'Twin Wyrm Statues', at: [0, -15.8, 2.8], cost: { stone: 3, food: 3 }, key: 'breath', per: 0.03, pct: true, unit: "Rainwyrm's breath", desc: 'Two stone wyrms guard the steps of the Temple of Rains.' },
      { id: 'beacon', name: 'Watchfire Beacon', at: [15.0, -12.6, 2.8], cost: { stone: 1, food: 4 }, key: 'forecast', per: 20, unit: 's earlier warning of storms and raiders', desc: 'A fire basket on the upper terrace that the lookouts light at the first dust.' },
      { id: 'sculpture', name: 'Sunsteel Sculpture', at: [-14.3, -13.2, 2.8], sunsteel: 400, needs: 'forge', key: 'teamAtk', per: 0.01, pct: true, unit: 'squad attack', desc: 'A coil of forged Sunsteel that catches the morning light by the forge.' },
      { id: 'obelisk', name: 'Obelisk of the Rains', at: [-5.0, -16.3, 2.8], starglass: 250, key: 'prod', per: 0.01, pct: true, unit: 'production', desc: 'Carved with the names of every rain the keep remembers.' },
      { id: 'mosaic', name: 'Glass Mosaic Court', at: [5.0, -16.3, 2.8], starglass: 200, key: 'mult_water', per: 0.015, pct: true, unit: 'water from the wells', desc: 'A courtyard of blue and turquoise glass tiles that shimmers like water.' },
    ],
  },

  // ---------- Bloom: green the Dunes once the rain is back (bloom.js) ----------
  // Plant a grove on open sand near the keep; it grows into an oasis by itself. Each oasis adds a
  // little food and well water; counts of oases unlock keep-wide gifts. Costs are quarter-crates
  // scaled to the keep, a little dearer for every grove already planted.
  bloom: {
    max: 30, reach: 5.6, // groves in all, and how far from the keep they can go (tiles)
    cost: { water: 2, food: 1 }, costGrowth: 1.06, // all thirty cost about half the water and food of one late Rainwyrm level
    grow: [240, 720], // seconds from seedling to young grove, then to oasis
    per: [['prod_food', 0.006], ['mult_water', 0.004]], // each oasis
    milestones: [
      { n: 5, perks: [['cool', 0.5]], text: '0.5 °C cooler in the keep', reward: { starglass: 300, journals: 60 } },
      { n: 12, perks: [['prod', 0.03]], text: '+3% production', reward: { beacons: 4 } },
      { n: 20, perks: [['rainDur', 8]], text: 'Called rain lasts 8 s longer', reward: { starglass: 800 } },
      { n: 30, perks: [['cool', 0.5], ['prod', 0.02]], text: 'Another 0.5 °C cooler and +2% production', reward: { skin: 'bloom', starglass: 1000 } },
    ],
  },

  // ---------- Cloud Run: the Rainwyrm flies out to herd rain clouds home ----------
  // ---------- The Crossing: a roguelite run to a hidden oasis ----------
  // Ten rows of a three-lane route across the deep desert. Each step goes to the same lane or one beside
  // it. The squad's health carries from fight to fight; boons gathered on the way last the whole run.
  crossing: {
    unlockStage: 36, // after the Shatterjaw Sandshark
    every: 8 * 3600, cap: 2, // a new route every 8 hours of keep time, up to 2 waiting
    rows: 10,
    odds: { fight: 36, elite: 12, oasis: 16, merchant: 10, mirage: 16, cache: 10 }, // rows 2-9 (row 1 is three fights, row 10 the Warden)
    // foes measure themselves against your squad as it set out: row r fights at start + per x (r - 1) of its
    // strength, elites and the Warden stronger still, so the route is as hard at stage 40 as at stage 140
    foe: { start: 0.65, per: 0.06, elite: 1.2, boss: 1.2 },
    rest: 0.08, // health back after every won fight
    oasis: 0.35, // health back at an oasis
    coins: { fight: 25, elite: 45, cache: 40 },
    boons: [
      { id: 'blades', name: 'Honed Blades', desc: 'Squad attack +15%', icon: 'i-duel', atk: 0.15 },
      { id: 'ranks', name: 'Shaded Ranks', desc: 'Squad defense +15%', icon: 'i-power', def: 0.15 },
      { id: 'skins', name: 'Full Waterskins', desc: 'Squad health +20%', icon: 'i-water', hp: 0.2 },
      { id: 'medic', name: 'Field Medic', desc: '10% more health back after every win', icon: 'i-heart', rest: 0.1 },
      { id: 'torrent', name: 'Second Wind', desc: "Wyrm's Torrent +30%", icon: 'i-raincloud', breath: 0.3 },
      { id: 'bounty', name: 'Bounty Ledger', desc: '50% more coins from fights and caches', icon: 'i-chest', coins: 0.5 },
      { id: 'fox', name: 'Desert Fox', desc: 'The first blow of every fight lands twice as hard', icon: 'i-compass', burst: 1 },
      { id: 'ward', name: 'Sun Ward', desc: 'Squad defense +10% and health +10%', icon: 'i-glory', def: 0.1, hp: 0.1 },
      { id: 'banner', name: 'War Banner', desc: 'Squad attack +10%, and +10% more against elites and the Warden', icon: 'i-flag', atk: 0.1, eliteAtk: 0.1 },
    ],
    merchant: { prices: [55, 70, 85], heal: 0.25, healCost: 35 },
    // mirage events: two choices each; effects are health (a share of the squad's), coins and a boon; a gamble is
    // an even chance of its `win` or `lose` outcome
    events: [
      { id: 'storm', title: 'A wall of sand', text: 'A sandstorm rolls in from the west. The guides say it will pass by nightfall.',
        a: { label: 'Push through it', hp: -0.15, coins: 40, says: 'The squad comes out the far side coughing, and finds a lost trader\'s purse in the drift.' },
        b: { label: 'Wait it out', says: 'You lose the afternoon, and nothing else.' } },
      { id: 'seller', title: 'A stranded water-seller', text: 'His camel is dead and his skins are full. He would rather sell than carry them.',
        a: { label: 'Buy his spare skins', coins: -30, hp: 0.25, says: 'Cool water, and the squad stands a little straighter.' },
        b: { label: 'Help him to the next well', hp: -0.1, boon: true, says: 'He presses an old charm into your hand.' } },
      { id: 'bones', title: 'Bones of an old caravan', text: 'Ribs of wagons stick out of the sand. Something glints in the nearest one.',
        a: { label: 'Search the wagons', gamble: true, win: { boon: true, says: 'An old warden\'s kit, still good.' }, lose: { hp: -0.12, says: 'A scorpion nest. The glint was its shell.' } },
        b: { label: 'Leave the dead in peace', says: 'The squad walks on in silence.' } },
      { id: 'shrine', title: 'A shrine to the Mother of Rains', text: 'A ring of blue stones and a dry basin, older than the keep.',
        a: { label: 'Pray for rain', hp: 0.15, says: 'A cloud no bigger than a hand crosses the sun, and it rains for a minute.' },
        b: { label: 'Leave an offering', coins: -35, boon: true, says: 'The stones hum. Something walks with you now.' } },
      { id: 'mirage', title: 'An oasis that should not be there', text: 'Palms and still water, a mile off the route. The scouts disagree about whether it is real.',
        a: { label: 'Go and drink', gamble: true, win: { hp: 0.3, says: 'It was real. Everyone drinks their fill.' }, lose: { hp: -0.1, says: 'It was a mirage, and the sand was hot.' } },
        b: { label: 'Keep to the route', says: 'The palms fade behind you.' } },
      { id: 'rope', title: 'A dry well with a rope in it', text: 'The rope is new. Someone climbed down here not long ago, and did not climb back up.',
        a: { label: 'Climb down', gamble: true, win: { coins: 60, says: "A smuggler's stash, and no smuggler." }, lose: { hp: -0.12, says: 'The rope gives way halfway down.' } },
        b: { label: 'Leave it alone', says: 'Some wells are better left dry.' } },
      { id: 'pilgrims', title: 'Pilgrims bound for the oasis', text: 'Old men and children, walking the same route, with nothing to fight with.',
        a: { label: 'Escort them', hp: -0.1, coins: 55, says: 'Raiders try them once. Not twice. The pilgrims pay what they can.' },
        b: { label: 'Point the way and walk on', says: 'They thank you and fall behind.' } },
      { id: 'glass', title: 'A field of black glass', text: 'The sand has melted into blades here, all the way to the next ridge.',
        a: { label: 'Cross it carefully', hp: -0.08, says: 'Slow going, and sore feet.' },
        b: { label: 'Pay a guide to go around', coins: -20, says: 'A boy with a goat knows a path. He is worth every coin.' } },
      { id: 'skull', title: 'A wyrm\'s skull in the sand', text: 'Bigger than a house, and the wind sings through it. The squad goes quiet.',
        a: { label: 'Rest in its shade', hp: 0.2, says: 'Cool air, and a sound like rain. Everyone sleeps well.' },
        b: { label: 'Take a tooth for the road', boon: true, says: 'It hums in your hand.' } },
    ],
    // the chest at the end, by rows cleared (`won`: the Warden fell); journals scale with the keep
    rewards: (d, won) => {
      const r = { starglass: 10 * d, journals: 2 * d, whetstone: Math.floor(d / 2) };
      if (d >= 4) r.sunsteel = 30 * d;
      if (d >= 7) r.beacons = 1;
      if (won) { r.starglass += 80; r.beacons = 2; }
      return r;
    },
  },

  // ---------- The Deepspring (endgame, from Rainwyrm Lv 20) ----------
  // Older water under the wyrm's pool. Tideglass (refined from water and copper, or won in the Far
  // South, high in the Mirage Spire and from Colossus raids) deepens it through 30 levels; base
  // resources are the other half of each level, so the stores a finished keep piles up have a use.
  deepspring: {
    unlock: 20, // Rainwyrm level
    max: 30,
    glass: (L) => Math.round(8 * Math.pow(1.1, L - 1)), // Tideglass to reach level L (1,316 for all 30)
    res: (L) => {
      const g = 1 + 0.12 * (L - 1);
      return { stone: Math.round(600000 * g), water: Math.round(420000 * g), food: Math.round(260000 * g), copper: Math.round(90000 * g) };
    },
    troop: 0.02, prod: 0.02, // troop strength and production per level
    // every fifth level is a Springsong rank: every hero's level cap rises, plus a perk
    ranks: [
      { at: 5, name: 'Springsong I', perk: 'Gathering on the Dunes +10%', bonus: { heroCap: 5, gather: 0.1 } },
      { at: 10, name: 'Springsong II', perk: "Wyrm's Torrent +20%", bonus: { heroCap: 5, breath: 0.2 } },
      { at: 15, name: 'Springsong III', perk: 'The keep works 2 more hours while you are away', bonus: { heroCap: 5, offlineCap: 7200 } },
      { at: 20, name: 'Springsong IV', perk: 'Squad attack +5%', bonus: { heroCap: 5, teamAtk: 0.05 } },
      { at: 25, name: 'Springsong V', perk: 'Call the Rain recharges 15% faster', bonus: { heroCap: 5, rainCd: 0.15 } },
      { at: 30, name: 'Keeper of the Deepspring', perk: 'Squad attack +5% more', bonus: { heroCap: 5, teamAtk: 0.05 } },
    ],
    refine: {
      every: 1200, cap: 12, // a refine charge every 20 minutes of keep time, up to 12 waiting
      cost: { water: 16, copper: 10 }, // quarter-crates of the keep's size, per refine
      yield: [[1, 0.5], [2, 0.35], [3, 0.12], [5, 0.03]], // Tideglass per refine and its chance: 1.71 on average
      starglass: 60, starglassStep: 15, // a refine bought with Starglass when no charge waits; each more that day costs 15 more
    },
    farSouth: { stage: 1, boss: 10 }, // Tideglass for each Far South stage and each of its bosses
    raidKill: 1, // for each fallen Colossus, once the spring is open
    welcome: 20, // waiting in the mail when it opens
    reserve: 8, // quarter-crates of water that refining and deepening always leave for the wyrm
  },

  // ---------- Companions: desert animals that live in the keep (companions.js) ----------
  // Tamed with Honeyed Dates (treats) and Camel Bells once their requirement is met. Each grows to Lv 30 on
  // treats, with an Advance at Lv 10 and 20 that takes bells; every level adds to its keep bonus (`per`, on
  // KH.bonus key `key`), and its skill (on a cooldown in keep time) gets stronger with it.
  companions: {
    unlock: 7, // Rainwyrm level: Sahra the fennec arrives in the mail
    max: 30, tiers: [10, 20], // Advance needed to pass Lv 10 and Lv 20
    treat: (L, r) => Math.round(6 * Math.pow(1.13, L - 2) * r), // treats from Lv L-1 to L (r: rarity factor): about 1,550 to grow a common one to Lv 30
    bells: [5, 15], // Camel Bells for each Advance (times the rarity factor, rounded)
    rarity: { common: 1, rare: 1.5, epic: 2 },
    forage: { every: 1800, cap: 16 }, // a treat forages every 30 minutes of keep time, up to 16 waiting
    welcome: { treats: 20, bells: 5 },
    beast: { chance: 0.35, n: (lvl) => 1 + Math.floor(lvl / 5), bell: 0.03, bellLvl: 6 }, // a beast slain on the Dunes: a chance of treats, and from Lv 6 a small chance of a bell
    bossBells: 1, // bells from every tenth expedition stage (each boss) and every tenth Spire floor
    crossBells: 2, // bells for reaching the Crossing's hidden oasis
    power: 40, // keep power per companion level
    list: [
      { id: 'fennec', name: 'Sahra', kind: 'Fennec Fox', rarity: 'common', key: 'prod_food', per: 0.005, unit: 'food production',
        req: null, tame: null, bio: 'A fennec kit who followed the first caravan in and never left. Her ears hear water moving under the sand.',
        skill: { id: 'dig', name: 'Dig', cd: 4 * 3600, desc: 'Digs up a cache of food and water.', res: { food: [3, 0.2], water: [2, 0.15] } } },
      { id: 'sandcat', name: 'Layl', kind: 'Sand Cat', rarity: 'common', key: 'prod_copper', per: 0.005, unit: 'copper production',
        req: { wyrm: 9 }, tame: { treats: 30 }, bio: 'A night hunter with soft wide paws. He brings home whatever glints.',
        skill: { id: 'prowl', name: 'Night Prowl', cd: 6 * 3600, desc: 'Brings home copper and a little Starglass.', res: { copper: [2, 0.15] }, starglass: [10, 1] } },
      { id: 'hoopoe', name: 'Hudhud', kind: 'Hoopoe', rarity: 'rare', key: 'build', per: 0.0025, unit: 'building and research speed',
        req: { stage: 45 }, tame: { treats: 60, bells: 2 }, bio: 'The messenger bird of the old tales, crest raised like a crown. Builders work faster when he watches.',
        skill: { id: 'message', name: 'Urgent Message', cd: 8 * 3600, desc: 'Hurries every building, research and training under way.', mins: [10, 1] } },
      { id: 'oryx', name: 'Rimaya', kind: 'Arabian Oryx', rarity: 'rare', key: 'prod_water', per: 0.005, unit: 'water from the wells',
        req: { wyrm: 12 }, tame: { treats: 80, bells: 3 }, bio: 'She can smell rain a day away and walk to it without drinking.',
        skill: { id: 'trek', name: 'Long Trek', cd: 8 * 3600, desc: 'Gathering marches bring home more for a while.', buff: { key: 'gather', v: [0.3, 0.01], secs: 7200 } } },
      { id: 'falcon', name: 'Saqr', kind: 'Saker Falcon', rarity: 'epic', key: 'teamAtk', per: 0.003, unit: 'squad attack',
        req: { stage: 80 }, tame: { treats: 120, bells: 5 }, bio: 'A hunting falcon who chose the keep over her falconer. Nothing on the Dunes moves without her seeing.',
        skill: { id: 'eye', name: "Falcon's Eye", cd: 8 * 3600, desc: 'Squad attack rises for an hour.', buff: { key: 'teamAtk', v: [0.1, 0.005], secs: 3600 } } },
      { id: 'caracal', name: 'Nimr', kind: 'Caracal', rarity: 'epic', key: 'troop', per: 0.003, unit: 'troop strength',
        req: { stage: 110 }, tame: { treats: 160, bells: 8 }, bio: 'Tufted ears, a hunter\'s patience and a temper. The troops fight harder with him on the walls.',
        skill: { id: 'pounce', name: 'Pounce', cd: 8 * 3600, desc: 'Troop strength rises for an hour.', buff: { key: 'troop', v: [0.1, 0.005], secs: 3600 } } },
    ],
  },

  // ---------- The Spice Road (road.js): a dice board the Caravan Hall's traders run ----------
  road: {
    unlockPlot: 'hall', // opens once the Caravan Hall is built
    season: 8 * 3600, // a Road season: laps and their prizes start over every 8 hours of keep time
    free: { every: 1200, cap: 10 }, // a free Road Die every 20 minutes of keep time, while fewer than 10 are in hand
    welcome: { dice: 10, lucky: 1 },
    // the 24 stops, starting at Home Oasis and running clockwise round the board
    board: ['home', 'water', 'chest', 'food', 'bandits', 'stone', 'market', 'water', 'mirage', 'copper', 'well', 'starglass',
      'shrine', 'food', 'bandits', 'chest', 'dustdevil', 'stone', 'market', 'copper', 'chest', 'bandits', 'starglass', 'water'],
    // what each stop gives (resources in quarter-crates, scaled like every other reward)
    stops: {
      home: { name: 'Home Oasis', icon: 'i-flag', desc: 'Every lap past it pays out; land on it exactly for a free Road Die.' },
      water: { name: 'Hidden Spring', icon: 'i-water', give: { water: 1 } },
      food: { name: 'Date Palms', icon: 'i-food', give: { food: 1 } },
      stone: { name: 'Salt Pan', icon: 'i-stone', give: { stone: 1 } },
      copper: { name: 'Copper Hills', icon: 'i-copper', give: { copper: 0.75 } },
      starglass: { name: 'Glass Flats', icon: 'i-gem', give: { starglass: 15 } },
      chest: { name: 'Buried Cache', icon: 'i-chest', desc: 'Dig up something from the cache table.' },
      bandits: { name: 'Bandit Gulch', icon: 'i-bandit', desc: 'Your squad fights a bandit band for its loot.' },
      market: { name: 'Bazaar', icon: 'i-market', desc: 'A trader lets you pick one of three wares, free.' },
      mirage: { name: 'Mirage', icon: 'i-mirage', desc: 'The caravan follows a mirage 2 to 7 stops ahead.' },
      well: { name: 'Sweet Well', icon: 'i-well', desc: 'The next stop that pays out pays double.' },
      dustdevil: { name: 'Dust Devil', icon: 'i-dustdevil', desc: 'The wind carries the caravan 3 stops on.' },
      shrine: { name: 'Shrine of Rain', icon: 'i-shrine', desc: 'A free Road Die, and the Rainwyrm feels the prayer.' },
    },
    // the Buried Cache: [weight, reward]
    cache: [[30, { speed15: 1 }], [24, { journals: 1.5 }], [14, { treats: 15 }], [12, { rainCharm: 1 }], [10, { beacons: 1 }], [6, { dice: 2 }], [4, { lucky: 1 }], [3, { shard_epic: 1 }]],
    // the Bazaar's wares, three offered at a time
    wares: [{ crate_water: 1 }, { crate_food: 1 }, { crate_stone: 1 }, { crate_copper: 1 }, { speed15: 2 }, { starglass: 40 }, { beacons: 1 }, { treats: 25 }, { dice: 2 }, { journals: 3 }, { whetstone: 3 }],
    // bandits are as strong as this share of your expedition stage (at least stage 2, at most 3 per wyrm level)
    bandits: { stage: 0.85, win: { starglass: 15, journals: 1 } },
    lapGive: { journals: 1.5 }, // every lap round the road
    homeDice: 1, shrineDice: 1, shrineBond: 15,
    // lap prizes for the season: [laps, reward]
    laps: [[1, { starglass: 80 }], [2, { lucky: 1, speed15: 2 }], [3, { dice: 5 }], [5, { shard_epic: 1 }], [7, { beacons: 3, lucky: 1 }],
      [10, { starglass: 400 }], [13, { dice: 10, speed60: 2 }], [16, { lucky: 2, beacons: 3 }], [20, { shard_legendary: 1 }]],
    // Road Dice from the rest of the game
    bossDice: 2, beastDice: 0.05, warLap: 50,
  },

  // ---------- Rival Keeps (rivals.js): other keeps on the Dunes to scout, raid, and fear ----------
  rivals: {
    unlock: 8, // Rainwyrm level: your scouts find them
    count: 8,
    ring: [3.6, 9.4], // how far out they stand, in tiles
    // each rival's strength as a share of your expedition stage, weakest (nearest) first
    ranks: [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.35, 1.5],
    wall: 1.15, // they fight from behind walls
    stash: 4, // quarter-crates of each resource in a full storehouse, times the rival's strength
    refill: 5400, // a raided storehouse fills back up over 90 minutes of keep time
    plunder: 0.35, // the share of its storehouse a win carries home
    shield: 5400, // a rival you beat raises a Peace Shield for 90 minutes
    scout: { food: 0.25 }, scoutFor: 1800, // what a scouting report costs, and how long it holds
    loss: 0.2, lossWin: 0.04, // troops lost in a failed attack, and in a won one
    strike: { chance: 0.5, after: [900, 2100] }, // the chance a raided rival strikes back, and when
    strikeMult: 0.95, // its warband against your gate, as a share of its keep's strength
    revenge: { secs: 3600, atk: 0.2 }, // strike back within the hour for +20% attack
    peace: { secs: 7200, starglass: 150 }, // your own Peace Shield: no warband strikes while it holds
    win: { starglass: 20, journals: 1.5 }, // on top of the plunder (times the rival's strength)
    warPts: 60, // Oasis Wars points per win
    colors: ['#b5452a', '#2f6f9a', '#7a3f8a', '#3f8a4a', '#c99a2c', '#9a2f5a', '#2f8a8a', '#5a4a3a'],
  },

  // ---------- The Cookfire ----------
  // From Rainwyrm Lv 4 every fish you land also goes into the larder, and the cookfire in the courtyard turns them
  // (with food from the stores) into dishes that serve the keep for a few hours: fx are KH.bonus keys. Two dishes can
  // be on the table at once, and never the same one twice; the rarest fish make the best dishes.
  cook: {
    unlock: 4, table: 2,
    recipes: [
      { id: 'skewers', name: 'Minnow Skewers', icon: 'i-ck-skewers', fish: { minnow: 4 }, food: 0.5, hours: 2, fx: { gather: 0.2 }, text: 'Marches gather 20% faster' },
      { id: 'stew', name: 'Sand Carp Stew', icon: 'i-ck-stew', fish: { carp: 3 }, food: 1, hours: 2, fx: { prod: 0.08 }, text: 'All production +8%' },
      { id: 'pilaf', name: 'Golden Barb Pilaf', icon: 'i-ck-pilaf', fish: { barb: 2 }, food: 1, hours: 2, fx: { teamAtk: 0.06 }, text: 'Squads fight 6% harder' },
      { id: 'broth', name: 'Glass Eel Broth', icon: 'i-ck-broth', fish: { eel: 2 }, food: 0.5, hours: 3, fx: { heal: 0.5 }, cure: 0.5, text: 'Half the sick back on their feet, healing +50%' },
      { id: 'roast', name: 'Whiskers Roast', icon: 'i-ck-roast', fish: { whiskers: 1, carp: 2 }, food: 1, hours: 3, fx: { troop: 0.03 }, text: 'Every troop 3% stronger' },
      { id: 'banquet', name: 'Rain Koi Banquet', icon: 'i-ck-banquet', fish: { koi: 1, barb: 2 }, food: 2, hours: 4, fx: { prod: 0.06, teamAtk: 0.08, breath: 0.1 }, text: 'Production +6%, squads 8% harder, the Torrent +10%' },
    ],
    warPts: 10,
  },

  // ---------- The Sand Leviathan ----------
  // From Rainwyrm Lv 9 the Leviathan surfaces on the Dunes for a hunt of one day of keep time, then dives and surfaces
  // again. It cannot be killed: each of three attacks a hunt is a full battle of 12 rounds against it, scored by the
  // damage done, and the best attack ranks you among the Hall's fifty wardens. Each hunt it fights as one class, so
  // the squad that counters it does most. Par is what the squad would do on auto-battle when the hunt begins;
  // marks for beating par reward playing the fight well, the rank rewards strength.
  leviathan: {
    unlock: 9, hunt: 86400, attacks: 3,
    hp: 12, atk: 0.85, // its health and blows as multiples of the current expedition foe's: far more than 12 rounds can take
    luck: [0.8, 1.3], // each warden's form on the day, against their share of your par by power
    marks: [[0.6, { journals: 2 }], [1, { speed60: 1 }], [1.25, { whetstone: 4 }], [1.5, { beacons: 1, starglass: 60 }]],
    rank: [[1, { starglass: 300, whetstone: 8, beacons: 2 }], [3, { starglass: 200, whetstone: 6, beacons: 1 }], [10, { starglass: 120, whetstone: 4 }], [25, { starglass: 70, whetstone: 2 }], [50, { starglass: 40 }]],
    warPts: 30, // Oasis Wars points per attack
  },

  // ---------- The Sparring Ring ----------
  // From Rainwyrm Lv 10 heroes can take a seat in the ring, where they spar with the keep's best and fight at the level
  // of its third-best hero outside the ring, but never past a seated hero's own level cap (so stars still matter); they
  // keep it in the squad too. Four seats, two more for Starglass; a seat whose hero leaves rests for twelve hours.
  spar: { unlock: 10, seats: 4, extra: [300, 600], cooldown: 43200 },

  // ---------- Stage Stars ----------
  // Three stars a story stage: the victory, ending the fight with half the squad's health or more, and winning within
  // five rounds. Fights at the edge of the squad's strength run five to seven rounds and end below half health, so a
  // first clear takes one or two stars and all three want about a third more strength, or a well-played live battle.
  // Any cleared stage can be fought again for the stars it is missing. A chapter's thirty stars fill three chests
  // (resources and journals scale with the keep when claimed).
  stars: {
    unbroken: 0.5, swift: 5,
    chests: [[10, { journals: 3, crate_food: 1, speed15: 2 }], [20, { journals: 5, starglass: 30, whetstone: 1 }], [30, { starglass: 60, beacons: 1, whetstone: 2 }]],
  },

  // ---------- Hero Kinships ----------
  // Pairs of heroes whose stories are tied. A kinship forms once both are recruited and works whenever both march in
  // the same squad: one bonus for the whole squad (attack, defense, health, the Torrent, or damage taken), bigger for
  // pairs of humbler rarity and growing with the pair's stars (levels at 4, 6, 8 and 10 stars between them). No hero
  // is in two kinships, so a squad of three has at most one at work.
  kinships: {
    grow: 0.25, // each level past the first adds a quarter of the base bonus
    levelAt: [4, 6, 8, 10], // stars between the two heroes for levels 2 to 5
    pairs: [
      { id: 'glass', name: 'The Glasshands', heroes: ['nadia', 'haroun'], fx: { def: 0.06 }, text: 'Sister and brother of the Glass Sea: one knaps arrowheads from it, the other blows it into shields.' },
      { id: 'road', name: 'The Long Road', heroes: ['tariq', 'kofi'], fx: { atk: 0.05 }, text: 'Rode the same caravan road for ten years and still argue over who leads.' },
      { id: 'gate', name: 'Gatekeepers', heroes: ['rashid', 'imani'], fx: { hp: 0.06 }, text: 'One held the east gate against raiders, the other the wadi gate against the flood.' },
      { id: 'storm', name: 'Eyes of the Storm', heroes: ['leila', 'kaveh'], fx: { atk: 0.05 }, text: 'One sees through sandstorms, the other flies kites into thunderclouds. Between them they map the weather.' },
      { id: 'song', name: 'The Wyrm-Singers', heroes: ['idris', 'yusra'], fx: { torrent: 0.1 }, text: 'Raised on the old wyrm-songs, one by the keepers, one by her grandmother. The Rainwyrm answers both.' },
      { id: 'rain', name: 'Heralds of Rain', heroes: ['soraya', 'sefa'], fx: { hp: 0.06 }, text: 'Each saw rain once when no one believed in it, and walked toward it.' },
      { id: 'hunt', name: 'Dune Hunters', heroes: ['yara', 'nuri'], fx: { atk: 0.08 }, text: 'A tracker and a trapper: what one finds, the other catches.' },
      { id: 'salt', name: 'Salt and Bone', heroes: ['tomas', 'noor'], fx: { def: 0.07 }, text: 'A ferryman of the dry salt marsh and a bonepicker of the dead coast, both waiting for the water to come back.' },
      { id: 'kitchen', name: 'The Keep Kitchen', heroes: ['tamir', 'halima'], fx: { hp: 0.09 }, text: 'Stew and tonic: between them nobody in the keep goes hungry or stays sick for long.' },
      { id: 'builders', name: 'Keep Builders', heroes: ['omar', 'mara'], fx: { def: 0.09 }, text: 'He cuts the stone, she raises the windcatchers. Every wall in the keep has both their marks.' },
      { id: 'shade', name: 'Shield and Shade', heroes: ['zahra', 'amira'], fx: { dr: 0.04 }, text: 'Walked the Last Caravan out of the Glass Cities together, one with a shield and a lantern, one with shade sails.' },
      { id: 'couriers', name: 'Swift Couriers', heroes: ['samira', 'lio'], fx: { atk: 0.07 }, text: 'One carries the letters, the other scouts the road ahead. Neither has ever been caught.' },
    ],
  },

  // ---------- The Founding Week ----------
  // A new keep's first seven days: from Rainwyrm Lv 2 (for a keep that is still young) five missions open each day,
  // each worth points; point chests along the way and, at the end, a Legendary hero of the player's choosing. A day
  // opens each real day since the week began, or after each 24 hours of keep time, whichever comes first, and the
  // week stays open two days past the seventh so a missed day can be caught up. Missions count from when the week
  // opened (stat) or look at the keep as it stands (wyrm, stage).
  founding: {
    unlock: 2, youngUntil: 6, // opens at Rainwyrm Lv 2 for a keep no further than Lv 6
    days: 7, grace: 2, pts: 20,
    missions: [
      [{ id: 'd1a', text: 'Finish 6 upgrades', stat: 'upgrades', n: 6 }, { id: 'd1b', text: 'Clear expedition stage 8', stage: 8 }, { id: 'd1c', text: 'Recruit 2 heroes at the Beacon', stat: 'pulls', n: 2 },
        { id: 'd1d', text: 'Call the Rain twice', stat: 'rains', n: 2 }, { id: 'd1e', text: 'Raise the Rainwyrm to Lv 3', wyrm: 3 }],
      [{ id: 'd2a', text: 'Train 150 troops', stat: 'trained', n: 150 }, { id: 'd2b', text: 'Clear expedition stage 16', stage: 16 }, { id: 'd2c', text: 'Finish 2 research projects', stat: 'researched', n: 2 },
        { id: 'd2d', text: 'Send 3 marches to gather on the Dunes', stat: 'gathers', n: 3 }, { id: 'd2e', text: 'Raise the Rainwyrm to Lv 4', wyrm: 4 }],
      [{ id: 'd3a', text: 'Hunt 5 beasts on the Dunes', stat: 'beasts', n: 5 }, { id: 'd3b', text: 'Clear expedition stage 24', stage: 24 }, { id: 'd3c', text: 'Recruit 8 heroes at the Beacon', stat: 'pulls', n: 8 },
        { id: 'd3d', text: 'Land 4 fish at the spring', stat: 'fish', n: 4 }, { id: 'd3e', text: 'Raise the Rainwyrm to Lv 5', wyrm: 5 }],
      [{ id: 'd4a', text: 'Finish 25 upgrades', stat: 'upgrades', n: 25 }, { id: 'd4b', text: 'Clear expedition stage 32', stage: 32 }, { id: 'd4c', text: 'Train 600 troops', stat: 'trained', n: 600 },
        { id: 'd4d', text: 'Cook 2 dishes at the Cookfire', stat: 'cooked', n: 2 }, { id: 'd4e', text: 'Raise the Rainwyrm to Lv 6', wyrm: 6 }],
      [{ id: 'd5a', text: 'Send 2 parties on Far Journeys', stat: 'journeys', n: 2 }, { id: 'd5b', text: 'Clear expedition stage 40', stage: 40 }, { id: 'd5c', text: 'Call the Rain 10 times', stat: 'rains', n: 10 },
        { id: 'd5d', text: 'Finish 8 research projects', stat: 'researched', n: 8 }, { id: 'd5e', text: 'Raise the Rainwyrm to Lv 7', wyrm: 7 }],
      [{ id: 'd6a', text: 'Hunt 20 beasts on the Dunes', stat: 'beasts', n: 20 }, { id: 'd6b', text: 'Clear expedition stage 48', stage: 48 }, { id: 'd6c', text: 'Recruit 20 heroes at the Beacon', stat: 'pulls', n: 20 },
        { id: 'd6d', text: 'Donate to the Caravan 5 times', stat: 'donations', n: 5 }, { id: 'd6e', text: 'Raise the Rainwyrm to Lv 8', wyrm: 8 }],
      [{ id: 'd7a', text: 'Win a raid on a rival keep', stat: 'rivalWins', n: 1 }, { id: 'd7b', text: 'Clear expedition stage 56', stage: 56 }, { id: 'd7c', text: 'Finish 50 upgrades', stat: 'upgrades', n: 50 },
        { id: 'd7d', text: 'Train 2,000 troops', stat: 'trained', n: 2000 }, { id: 'd7e', text: 'Raise the Rainwyrm to Lv 9', wyrm: 9 }],
    ],
    chests: [[100, { journals: 2, speed15: 3 }], [200, { starglass: 100, beacons: 2 }], [300, { shard_epic: 1, speed60: 1 }], [450, { beacons: 4, starglass: 150 }],
      [600, { starglass: 250, speed60: 2 }], [700, { shard_legendary: 1 }]],
  },

  // ---------- The Buried City ----------
  // From Rainwyrm Lv 11 the well-diggers break into a city under the sand. Each layer is a grid of sand hiding five
  // relics (rectangles, either way round; the last is the layer's grand relic). A Trowel digs one tile; dug sand shows
  // how many relic pieces lie in the eight tiles around it, so a careful digger clears a layer in about 24 Trowels and
  // a careless one in about 40. Bedrock (from layer 4) takes two. A Blasting Charge clears a 3x3 patch. Every relic
  // dug up whole pays by its size; clearing all five opens the layer's chest and the way down.
  dig: {
    unlock: 11, w: 6, h: 7,
    free: { every: 2700, cap: 12 }, // a free Trowel every 45 minutes of keep time, while fewer than 12 are in hand
    welcome: { trowel: 20, charge: 1 },
    beast: 0.03, bossTrowels: 2, // a Trowel now and then from a beast hunt (one in 33), two from every expedition boss
    rock: (layer) => (layer < 4 ? 0 : Math.min(8, 2 + Math.floor((layer - 4) / 3))),
    sizes: [[1, 2], [1, 2], [1, 3], [2, 2], [2, 3]],
    relics: {
      '1x2': [{ id: 'lamp', name: 'Clay Lamp' }, { id: 'seal', name: 'Scarab Seal' }, { id: 'beads', name: 'Carnelian Beads' }, { id: 'sandal', name: 'Gilded Sandal' }],
      '1x3': [{ id: 'spear', name: 'Bronze Spear' }, { id: 'flute', name: 'Reed Flute' }, { id: 'staff', name: "Rainmaker's Staff" }],
      '2x2': [{ id: 'clock', name: 'Water Clock' }, { id: 'mirror', name: 'Bronze Mirror' }, { id: 'jar', name: 'Painted Jar' }],
      '2x3': [{ id: 'idol', name: 'Rain Idol' }, { id: 'tablet', name: 'Star Tablet' }, { id: 'chariot', name: 'Sun Chariot' }],
    },
    pay: { '1x2': { copper: 0.5 }, '1x3': { whetstone: 2 }, '2x2': { speed15: 1, journals: 1 }, '2x3': { starglass: 25, treats: 10 } },
    deeper: 0.04, // relics pay 4% more per layer down, up to double
    chest: { starglass: 20, trowel: 3 },
    chargeEvery: 3, // a Blasting Charge in every third layer's chest
    milestones: [[5, { shard_epic: 1 }], [10, { shard_legendary: 1 }], [15, { shard_epic: 2 }], [20, { shard_legendary: 1 }]], // and a Legendary Shard Pouch every 10 layers past 20
    firstFind: { starglass: 30 }, // the first of each kind of relic for the Relic Hall
    // Relic Charms (charms.js): every kind of relic dug up can be worn by one hero as a charm, its level the number
    // of that kind found (up to 10); bigger relics give more a level. fx is a hero stat: atk, def, hp, or skill power.
    charms: {
      max: 10,
      kinds: {
        lamp: { fx: 'hp', per: 0.01 }, seal: { fx: 'def', per: 0.01 }, beads: { fx: 'atk', per: 0.01 }, sandal: { fx: 'skill', per: 0.015 },
        spear: { fx: 'atk', per: 0.012 }, flute: { fx: 'skill', per: 0.015 }, staff: { fx: 'hp', per: 0.012 },
        clock: { fx: 'skill', per: 0.02 }, mirror: { fx: 'def', per: 0.015 }, jar: { fx: 'hp', per: 0.015 },
        idol: { fx: 'hp', per: 0.02 }, tablet: { fx: 'skill', per: 0.025 }, chariot: { fx: 'atk', per: 0.02 },
      },
    },
    warPts: 4, // Oasis Wars points per relic tile dug up
  },

  // ---------- Building Charters ----------
  // At Lv 10 every kind of building takes one of two charters, a lasting specialization: more of what it makes, or
  // something else the keep needs. fx are KH.bonus keys. The first charter is free; changing it costs Starglass.
  charters: {
    level: 10, change: 100,
    types: {
      well: [{ id: 'artesian', name: 'Artesian Bore', fx: { mult_water: 0.08 }, text: 'Water +8%' }, { id: 'covered', name: 'Covered Cisterns', fx: { drinkCut: 0.1 }, text: 'The keep drinks 10% less' }],
      quarry: [{ id: 'deepcut', name: 'Deep Cut', fx: { mult_stone: 0.08 }, text: 'Stone +8%' }, { id: 'masons', name: "Masons' Guild", fx: { build: 0.06 }, text: 'Building and research 6% faster' }],
      grove: [{ id: 'irrigated', name: 'Irrigated Rows', fx: { mult_food: 0.08 }, text: 'Food +8%' }, { id: 'canopies', name: 'Shade Canopies', fx: { outdoor: 0.15 }, text: 'Quarry and grove crews lose 15% less to heat and storms' }],
      mine: [{ id: 'richseam', name: 'Rich Seam', fx: { mult_copper: 0.08 }, text: 'Copper +8%' }, { id: 'bellows', name: 'Bellows Works', fx: { smelt: 0.15 }, text: 'The Forge smelts 15% more Sunsteel' }],
      shelter: [{ id: 'courtyards', name: 'Cool Courtyards', fx: { cool: 1 }, text: 'The keep 1°C cooler' }, { id: 'nightwatch', name: 'Night Watch', fx: { offlineCap: 7200 }, text: 'The keep keeps working 2 hours longer while you are away' }],
      infirmary: [{ id: 'herbalists', name: 'Herbalists', fx: { heal: 0.3 }, text: 'Healing +30%' }, { id: 'surgeons', name: 'Field Surgeons', fx: { troop: 0.02 }, text: 'Every troop 2% stronger' }],
      barracks: [{ id: 'drillyard', name: 'Drill Yard', fx: { troop: 0.03 }, text: 'Every troop 3% stronger' }, { id: 'quartermaster', name: 'Quartermaster', fx: { gather: 0.15 }, text: 'Marches gather 15% faster' }],
      watchtower: [{ id: 'farsight', name: 'Far Sight', fx: { forecast: 120 }, text: 'Weather and raiders seen further ahead' }, { id: 'signalfires', name: 'Signal Fires', fx: { rainCd: 0.15 }, text: 'Call the Rain comes back 15% sooner' }],
      archive: [{ id: 'oldrecords', name: 'Old Records', fx: { heroCap: 3 }, text: 'Every hero\'s level cap +3' }, { id: 'raincharts', name: 'Rain Charts', fx: { rainDur: 20 }, text: 'Rain lasts 20 seconds longer' }],
      hall: [{ id: 'hostelry', name: 'Hostelry', fx: { freeFinish: 120 }, text: 'Jobs with 2 more minutes left finish free' }, { id: 'arena', name: 'Duelling Ring', fx: { tickets: 1 }, text: 'One more Dune Duel ticket' }],
      storehouse: [{ id: 'vaults', name: 'Sealed Vaults', fx: { protect: 0.3 }, text: 'Raiders can never take 30% more' }, { id: 'clerks', name: 'Tally Clerks', fx: { prod: 0.02 }, text: 'All production +2%' }],
      forge: [{ id: 'blastfurnace', name: 'Blast Furnace', fx: { smelt: 0.2 }, text: 'Smelting +20%' }, { id: 'armorers', name: 'Armorers', fx: { teamAtk: 0.03 }, text: 'Squads fight 3% harder' }],
    },
  },

  // ---------- Far Journeys ----------
  // From Rainwyrm Lv 5 a board of journeys beyond the Dunes, each a party of up to three heroes away for a few hours.
  // A journey has one to three requirements the party must meet together (a class, stars between them, a rarity, a
  // hero's level, a full party), more for the longer and richer ones, and the board is drawn so that the keep's own
  // heroes can meet each one. Heroes away can't fight, so the question is who to spare. Every hero in the party
  // comes home with shards of their own, so benched heroes grow too.
  journeys: {
    unlock: 5, // Rainwyrm level
    slots: [[5, 2], [10, 3], [15, 4]],
    board: 5, refresh: 8 * 3600, reroll: 60, // a new board every 8 hours; Starglass for a new one early
    odds: [0.4, 0.3, 0.2, 0.1], // of a journey of 1 to 4 stars
    hours: [2, 4, 6, 8],
    rewards: [
      { journals: 1, food: 1.5 },
      { journals: 2, treats: 10, whetstone: 1 },
      { starglass: 50, journals: 3, whetstone: 2, dice: 2 },
      { starglass: 120, beacons: 1, whetstone: 3, speed60: 1 },
    ],
    shards: [1, 2, 3, 4], // for each hero in the party
    places: [['the Salt Wells', 'a herdsman\'s lost camels'], ['the Copper Hills', 'a seam the miners lost'], ['the Singing Dunes', 'the bells under the sand'],
      ['the Glass Sea', 'a ship half out of the glass'], ['Colossus Road', 'a footprint full of rainwater'], ['the Buried Spires', 'the noon bell-ringer'],
      ['the Red Mesas', 'a hermit who reads the wind'], ['the Ember Flats', 'a caravan that never arrived'], ['Saltmarch', 'a debt owed to the keep'],
      ['the Southern Wells', 'a wedding that needs guests'], ['the Oasis of Reeds', 'a heron the size of a man'], ['the Old Cistern Road', 'a map drawn on a jar']],
  },

  // ---------- The Dry Season ----------
  // From Rainwyrm Lv 6 a Dry Season comes every three days of keep time and lasts twelve hours, with two hours'
  // warning from the watchtower: the wells give less, the keep drinks more and the air is hotter (fx, as KH.bonus
  // keys). The Warden answers it with one edict, each with a cost: rationing (less drinking, slower work), digging
  // a deep cistern (stone and copper; the wells hold up, and every cistern adds a little water for good) or keeping
  // the rain watch (Call the Rain comes back sooner and lasts longer, but the Torrent tires). When it ends the keep
  // is graded on thirst and sickness, and a chest pays by the grade.
  dry: {
    unlock: 6, // Rainwyrm level
    every: 3 * 86400, length: 12 * 3600, warn: 2 * 3600, first: 6 * 3600, // the first comes 6 hours after it opens
    fx: { mult_water: -0.25, drinkCut: -0.15, cool: -3 },
    edicts: [
      { id: 'ration', name: 'Ration the Water', icon: 'i-dry-ration', fx: { drinkCut: 0.3, prod: -0.1 },
        text: 'Everyone drinks a third less, but the work goes slower on short rations (production -10%).' },
      { id: 'dig', name: 'Dig a Deep Cistern', icon: 'i-dry-cistern', fx: { mult_water: 0.25 }, cost: { stone: 3, copper: 1 }, keep: 0.01, max: 10,
        text: 'The wells hold up through the season, and every cistern dug adds 1% to water for good (up to 10%).' },
      { id: 'watch', name: 'Keep the Rain Watch', icon: 'i-dry-watch', fx: { rainCd: 0.5, rainDur: 30, breath: -0.2 },
        text: 'Call the Rain comes back twice as fast and lasts 30 seconds longer, but the tired Rainwyrm breathes 20% weaker in battle.' },
    ],
    // graded on thirst (minutes the keep went thirsty) and sickness (new sick as a share of the people)
    grades: [
      { g: 'A', thirst: 0, sick: 0.03, chest: { starglass: 120, water: 3, journals: 2 } },
      { g: 'B', thirst: 20, sick: 0.1, chest: { starglass: 60, water: 2 } },
      { g: 'C', thirst: 1e9, sick: 9, chest: { water: 1 } },
    ],
  },

  // ---------- Pacts & Feuds ----------
  // Each rival keep holds you in some regard, from -100 (a feud) to 100. Gifts raise it, raids lower it, and it drifts
  // back toward indifference over the days. A rival that trusts you (50 and up) will sign a pact: it sends tribute
  // every 8 hours and warriors to stand on your walls when raiders come, and it can't be raided while the pact
  // holds. Breaking a pact turns it into a feud. A rival in a feud (-50 and below) sends its warband against you
  // on its own every so often.
  pacts: {
    bands: [[-100, 'Feud', '#d0503a'], [-50, 'Hostile', '#e0904a'], [-10, 'Wary', '#c9a777'], [20, 'Friendly', '#8ac86a'], [50, 'Trusted', '#3fc8c0']],
    gift: { cost: { food: 1, water: 1, stone: 0.5 }, gain: 20, every: 6 * 3600 }, // quarter-crates; once every 6 hours a keep
    raid: -35, // standing lost when you raid a keep, won or lost
    drift: 4, // standing a day back toward 0 (not while a pact holds)
    pact: { need: 50, slots: [[8, 1], [12, 2], [16, 3]], tribute: { food: 0.6, water: 0.6, stone: 0.4 }, every: 8 * 3600, gate: 0.1, broken: -100 },
    feud: { at: -50, every: [6 * 3600, 10 * 3600] }, // a feuding keep strikes on its own about this often
    warPts: 10, // Oasis Wars points for a gift
  },

  // ---------- Gate Defenses ----------
  // Works at the front gate, raised with resources (scaled to the keep) up to Lv 10. Each helps the defenders
  // against raids and warbands every level, and at Lv 5 and Lv 10 brings one more of its tactic to every
  // Scorpion Siege. They stand on the walls in 3D and grow with their level.
  defense: {
    unlock: 5, // Rainwyrm level (when raiders start testing the walls)
    max: 10, growth: 1.32, // cost growth per level
    tacticAt: [5, 10], // levels that add one more of the work's tactic to every siege
    items: [
      { id: 'ballista', name: 'Ballista Towers', icon: 'i-ballista', tactic: 'ballista', cost: { stone: 3, copper: 1.5 }, raidAtk: 0.02, unit: 'defenders’ attack against raids', desc: 'Ballistas on the wall towers. Your defenders hit raiders harder, and every siege brings more Ballista bolts.' },
      { id: 'cauldrons', name: 'Oil Cauldrons', icon: 'i-firepot', tactic: 'pots', cost: { stone: 2, food: 2, water: 1 }, raidDef: 0.02, unit: 'defenders’ defense against raids', desc: 'Cauldrons of oil along the wall by the gate. Your defenders hold better, and every siege brings more Fire Pots.' },
      { id: 'stakes', name: 'Stake Yard', icon: 'i-stakes', tactic: 'stakes', cost: { stone: 2.5, food: 1.5 }, raidWeaken: 0.015, unit: 'weaker raiders at the gate', desc: 'Rows of sharpened stakes before the gate. Raiders arrive weaker, and every siege brings more Stakes.' },
    ],
  },

  // ---------- Troop Ranks ----------
  // Troops drilled at the Barracks rise through three ranks, each opening at a Barracks level. Drilling takes the
  // Barracks (no training meanwhile). A class fights at the average strength of all its troops, and in a fight the
  // recruits fall first, so losses come out of the unranked troops before any rank.
  ranks: {
    list: [
      { id: 'vet', name: 'Veteran', short: 'Vet', icon: 'i-rank-vet', barracks: 10, mult: 1.1, cost: 0.03, secs: 6, color: '#8fb3c9' },
      { id: 'elite', name: 'Elite', short: 'Elite', icon: 'i-rank-elite', barracks: 14, mult: 1.2, cost: 0.07, secs: 12, color: '#e0b04a' },
      { id: 'champ', name: 'Champion', short: 'Champ', icon: 'i-rank-champ', barracks: 18, mult: 1.32, cost: 0.12, secs: 20, color: '#d0583a' },
    ],
    // a troop's drill costs its training cost times the rank's cost in quarter-crates (so it grows with the keep),
    // and takes the rank's seconds (the Barracks level and the training steward speed it up like training)
    batch: 20, // troops a drill can take, per Barracks level
    warPts: 0.2, // Oasis Wars points per troop drilled
  },

  // ---------- Trade Routes ----------
  // Trade caravans leave the keep for four markets beyond the Dunes with goods each market asks for, and come home
  // with what the keep can't make. Each market posts two orders at a time (new ones every 6 hours of keep time),
  // its prices move from day to day, and the longer roads pay better but cross worse bandit country: hired guards
  // (paid in copper and food, half or full) cut the risk, and an ambushed caravan loses half its payment.
  // Guards are hired rather than drawn from the army because troops away for hours left the expedition short.
  // ---------- The Camel Derby ----------
  // From Rainwyrm Lv 8 the keep keeps a racing camel. Train its Speed, Stamina and Spirit (Lv 1-20, one session at a
  // time, food and keep time), and race it on the salt pan against five rivals in three cups, each opening
  // when you win the one before. In a race you hold to urge your camel: an urged camel runs faster and keeps its pace
  // over the dunes, but burns energy, and a camel that runs dry is spent for a few seconds. The rules were tuned in a
  // simulation of the race: a camel at the top of a cup's range wins about four races in five ridden well, one in the
  // middle about one in six, and riding matters as much as a few levels.
  derby: {
    unlock: 8, // Rainwyrm level
    entries: { cap: 3, every: 4 * 3600 }, // a race entry every 4 hours of keep time, 3 at most
    maxLv: 20,
    train: { time: 900, perLv: 240, cost: { food: 0.5 }, growth: 0.15 }, // seconds and quarter-crates of food (dates and oats), growing per level
    stats: [
      { id: 'spd', name: 'Speed', icon: 'i-dy-speed', text: 'How fast it runs' },
      { id: 'sta', name: 'Stamina', icon: 'i-dy-stamina', text: 'Urging tires it less, and it gets its breath back sooner' },
      { id: 'spi', name: 'Spirit', icon: 'i-dy-spirit', text: 'How much faster it runs when urged' },
    ],
    // rivals' levels for each stat; the first win of a cup brings its piece of tack
    cups: [
      { id: 'village', name: 'Village Cup', lv: [1, 6], tack: 'pads', color: '#c9a777',
        rewards: [{ starglass: 40, food: 1, water: 1 }, { food: 1, water: 0.5 }, { water: 0.6 }, { food: 0.3 }] },
      { id: 'oasis', name: 'Oasis Stakes', lv: [6, 12], tack: 'bridle', color: '#3fc8c0',
        rewards: [{ starglass: 80, whetstone: 1, journals: 1.5 }, { starglass: 30, journals: 1 }, { journals: 0.6 }, { food: 0.5 }] },
      { id: 'crown', name: 'Desert Crown', lv: [12, 20], tack: 'saddle', color: '#e0b04a',
        rewards: [{ starglass: 150, whetstone: 2, speed60: 1 }, { starglass: 60, whetstone: 1 }, { starglass: 25, journals: 1 }, { food: 0.8 }] },
    ],
    tack: {
      pads: { name: 'Sand Pads', icon: 'i-dy-pads', fx: { spd: 1 }, text: 'Speed +1' },
      bridle: { name: 'Braided Bridle', icon: 'i-dy-bridle', fx: { spi: 2 }, text: 'Spirit +2' },
      saddle: { name: 'Racing Saddle', icon: 'i-dy-saddle', fx: { sta: 3 }, text: 'Stamina +3' },
    },
    rules: {
      length: 650,
      track: [[0, 90, 'flat'], [90, 210, 'dune'], [210, 350, 'pan'], [350, 460, 'dune'], [460, 650, 'flat']],
      ground: { flat: 1, pan: 1.08, dune: 0.76 }, duneUrged: 0.97,
      base: 15, perSpeed: 0.012, urge: 1.22, perSpirit: 0.005,
      drain: 0.3, perStamDrain: 0.012, regen: 0.05, perStamRegen: 0.03,
      tired: { secs: 2.5, pace: 0.72, back: 0.2 }, accel: 2.2, form: [0.97, 1.03],
    },
    rivals: [['Sandpiper', 'Palmhold'], ['Old Thunder', 'Saltmarch'], ['Mirage', 'Copper Coast'], ['Date Honey', 'the Southern Wells'], ['Red Wind', 'Glassfort'],
      ['Silk Road', 'Ambergate'], ['Dune Racer', 'Highwell'], ['Night Star', 'Cinder Rock'], ['Little Storm', 'Bluefort'], ['Amber Flash', 'Reedwater']],
    colors: ['#d8402a', '#2f6fb0', '#9a48b0', '#3f9a4a', '#e8892a'],
    warPts: 12, // Oasis Wars points a race
  },

  // ---------- Hero Talents ----------
  // From Rainwyrm Lv 6 a hero chooses one of two talents at levels 10, 30, 50, 70 and 90. Each tier sets something for
  // the hero alone against something for the whole fight: atk/def/hp raise the hero's own stats, lead the troops of
  // the hero's class, skill the skill's strength, charge has the skill ready a round sooner, counter adds to the
  // edge the hero and their class's troops have over the class they beat, torrent adds to the Rainwyrm's Torrent.
  // Changing a talent once chosen costs Starglass.
  talents: {
    unlock: 6, // Rainwyrm level
    levels: [10, 30, 50, 70, 90],
    change: 50, // Starglass
    tiers: [
      [{ fx: { atk: 0.08 } }, { fx: { hp: 0.1 } }],
      [{ fx: { lead: 0.05 } }, { fx: { skill: 0.15 } }],
      [{ fx: { def: 0.12 } }, { fx: { charge: 1 } }],
      [{ fx: { atk: 0.12 } }, { fx: { counter: 0.1 } }],
      [{ fx: { lead: 0.08 } }, { fx: { torrent: 0.1 } }],
    ],
    names: {
      guard: [['Iron Hide', 'Deep Lungs'], ['Shield Captain', 'Rallying Cry'], ['Bulwark', 'Quick Hands'], ['Hammer of the Keep', 'Breaker'], ['Wall of the Rain', 'Wyrmguard']],
      bow: [['Keen Eye', 'Desert Hardy'], ['Volley Captain', 'Steady Draw'], ['Dune Cover', 'Quick Nock'], ['Heavy Shafts', 'Weak Points'], ['Rain of Arrows', 'Wyrm Spotter']],
      lancer: [['Long Reach', 'Saddle Hardened'], ['Charge Captain', 'Battle Song'], ['Scale Mail', 'First to Ride'], ['Lance of Sunsteel', 'Flank Rider'], ['Thunder of Hooves', 'Wyrm Rider']],
    },
  },

  // ---------- Warden's Decrees ----------
  // Orders the Warden gives the whole keep. Each one lasts a while (or acts at once) and then needs time before it
  // can be given again; they open one by one as the Rainwyrm grows. A decree can be given again early for Starglass.
  // fx are KH.bonus keys while the decree lasts.
  decrees: {
    unlock: 5, // Rainwyrm level
    reissue: { perHour: 30, min: 40 }, // Starglass to give a decree again early, by the hours of rest it has left
    list: [
      { id: 'harvest', name: 'Harvest Rite', lv: 5, icon: 'i-dc-harvest', dur: 7200, cd: 43200, fx: { prod: 0.3 },
        text: 'Wells, fields, quarries and mines work at festival pace: production +30%.', line: 'Drums in the fields. The keep works at festival pace.' },
      { id: 'rush', name: 'Rush Order', lv: 7, icon: 'i-dc-rush', dur: 0, cd: 43200, cut: 0.2, max: 3600,
        text: 'Every build, research and training under way finishes a fifth sooner (up to an hour each).', line: 'The builders work through the night.' },
      { id: 'arms', name: 'Call to Arms', lv: 9, icon: 'i-dc-arms', dur: 3600, cd: 28800, fx: { teamAtk: 0.12 },
        text: 'Every squad and march fights 12% harder.', line: 'The horn sounds from the walls. Every blade is sharpened.' },
      { id: 'roads', name: 'Open Roads', lv: 11, icon: 'i-dc-roads', dur: 7200, cd: 43200, fx: { gather: 0.4 },
        text: 'Marches that reach a node on the Dunes while it is in force gather 40% faster.', line: 'The gates stand open and the camel lines head for the nodes.' },
      { id: 'feast', name: 'Feast of Rain', lv: 13, icon: 'i-dc-feast', dur: 14400, cd: 86400, fx: { heal: 0.5 }, cure: true,
        text: 'The sick are cured at once, and healing is 50% faster.', line: 'Long tables in the plaza. The sick get up to eat.' },
      { id: 'vigil', name: "Wyrm's Vigil", lv: 15, icon: 'i-dc-vigil', dur: 3600, cd: 28800, fx: { breath: 0.3 },
        text: "The Rainwyrm's Torrent strikes 30% harder in every battle.", line: 'The Rainwyrm keeps watch over the keep, eyes bright.' },
    ],
  },

  trade: {
    unlock: 10, // Rainwyrm level
    slots: [[10, 2], [15, 3]], // [Rainwyrm level, caravans on the road at once]
    refresh: 21600, day: 86400, // new orders every 6 hours; prices change daily
    mood: [0.8, 1.4], // a market's prices for the day, as a multiple
    // each market: hours on the road (there and back), the bandit risk with no guards, what full guards cost
    // (quarter-crates; they make the road safe), where it lies (degrees, 0 = east), and its orders: what it wants
    // (quarter-crates, scaled to the keep) and what it pays (items as they are; journals scaled to the keep)
    markets: [
      { id: 'saltmarch', name: 'Saltmarch Bazaar', hours: 2, risk: 0.15, guards: { copper: 0.3, food: 0.6 }, dir: 180, icon: 'i-market', color: '#e0b04a',
        text: 'A salt town on the western flats, where every caravan in the desert stops sooner or later.',
        orders: [{ want: { food: 6 }, pay: { journals: 2, treats: 3 } }, { want: { water: 5 }, pay: { journals: 2, dice: 2 } }, { want: { food: 4, water: 3 }, pay: { speed15: 3, treats: 2 } }] },
      { id: 'wells', name: 'the Southern Wells', hours: 3, risk: 0.25, guards: { copper: 0.5, food: 1 }, dir: 90, icon: 'i-well', color: '#4fa8c8',
        text: 'Deep wells in the southern rocks, and the herders who water there.',
        orders: [{ want: { stone: 8 }, pay: { speed60: 1, whetstone: 2 } }, { want: { copper: 4 }, pay: { whetstone: 3, bells: 1 } }, { want: { stone: 5, copper: 2 }, pay: { speed60: 1, dice: 3 } }] },
      { id: 'copper', name: 'the Copper Coast', hours: 4, risk: 0.3, guards: { copper: 0.7, food: 1.4 }, dir: 0, icon: 'i-copper', color: '#c97a3a',
        text: 'Smelting towns along the eastern salt lakes, short of everything but metal.',
        orders: [{ want: { food: 10 }, pay: { sunsteel_cache: 1, copper: 4 } }, { want: { water: 8 }, pay: { sunsteel_cache: 1, whetstone: 2 } }, { want: { food: 6, stone: 6 }, pay: { copper: 6, journals: 2 } }] },
      { id: 'glass', name: 'the Glass Cities', hours: 6, risk: 0.4, guards: { copper: 1, food: 2 }, dir: 270, icon: 'i-gem', color: '#8fd8e8',
        text: 'The old cities under the northern glass, where the rich still pay anything for water.',
        orders: [{ want: { water: 14 }, pay: { starglass: 80, whetstone: 4 } }, { want: { food: 10, water: 8 }, pay: { shard_epic: 1, journals: 3 } }, { want: { copper: 8, water: 6 }, pay: { starglass: 60, bells: 2 } }] },
    ],
    ambush: { lose: 0.5 }, // an ambushed caravan loses this much of its payment
    warPts: 20, // Oasis Wars points per caravan home
  },

  // ---------- Oasis Outposts ----------
  // Claim a resource node on the Dunes as an outpost: a garrison marches out with the builders and stays. The
  // outpost yields the node's resource every hour and stores up to a few hours of it, and raiders come for it
  // every few hours. They are as strong as a share of your own march (so better troops matter only through the
  // garrison you leave); a garrison that loses is routed and the outpost falls.
  outposts: {
    unlock: 7, // Rainwyrm level
    slots: [[7, 1], [11, 2], [15, 3], [19, 4]], // [Rainwyrm level, outposts you can hold]
    cost: { stone: 6, food: 4 }, // quarter-crates to raise one
    up: { stone: 5, copper: 2 }, growth: 1.5, max: 5, // raising it a level, and how that grows
    // quarter-crates of the node's resource an hour, by outpost level; Sunsteel veins yield Sunsteel per hour
    yield: [1.5, 2, 2.5, 3, 3.6], sunsteel: [10, 14, 18, 23, 28],
    nodeLvl: 0.05, // each node level adds this much to the yield
    flooded: 1.5, // a flooded oasis yields this much more
    hold: 8, // hours of yield an outpost keeps before it stops
    garrison: 0.1, // the least of your march cap a garrison may be
    raid: { every: [14400, 25200], warn: 600, base: 0.06, perLvl: 0.012, wall: 0.08, lossWin: 0.08, lossFall: 0.5 },
    // a raider band is as strong as (base + perLvl x node level) of your march cap would be (a tenth to a fifth, so
    // four garrisons that hold still leave a full march at home, troop housing being twice the march cap); each outpost level
    // gives the garrison +8% defense; a won defence costs 8% of the garrison, a lost one half of it
    win: { starglass: 8, journals: 0.5 }, // per defence, times the node level's share
    warPts: 25, // Oasis Wars points per raid held
  },

  // ---------- The Hall of Wardens ----------
  // Fifty wardens of the Dunes ranked by power, you among them. The others follow a typical free player's power
  // curve (from the balance bot), each at its own share of it and its own pace. The Hall pays out daily by rank.
  hall: {
    unlock: 4, size: 50, // Rainwyrm level; wardens in the Hall, you included
    // [hours of keep time, power] for a typical free player, as the Hall counts it (troops out marching and holding
    // outposts included): the free balance bots of 4.36, redrawn when outposts and the features since had left the
    // first curve (4.19) about 1.7 times too low
    curve: [[0, 2300], [0.5, 22000], [1, 35000], [2, 55000], [3, 67000], [4, 82000], [6, 119000], [8, 162000], [10, 186000], [12, 230000], [15, 269000], [18, 329000], [21, 366000], [24, 403000], [27, 470000], [30, 490000]],
    tail: 0.004, // past the curve, power still grows this much an hour
    spread: [0.3, 2.2], skew: 1.5, // the weakest and strongest warden as a share of the curve; skew packs them low
    // (a free player who plays well sits near rank 15)
    pace: [0.8, 1.25], // how fast each warden runs along the curve
    daily: 86400, check: 30, // a payout every day of keep time; rank checked every 30 seconds
    rewards: [[1, { starglass: 400, beacons: 2 }], [3, { starglass: 300, beacons: 1 }], [10, { starglass: 200 }], [25, { starglass: 120 }], [50, { starglass: 60 }]],
    colors: ['#d0583a', '#6a7ae0', '#e0b04a', '#8a5ad0', '#4fa86a', '#c94a8a', '#4a9ad0', '#b8862a'],
    // wardens are a name from DATA.names with one of these, and keeps a first half and a second
    epithets: ['the Patient', 'Sandwalker', 'the Red', 'Wellfinder', 'the Old', 'Stormborn', 'the Quiet', 'Longspear', 'the Bold', 'Saltbeard', 'the Younger', 'Duneborn', 'the Wise', 'Brightshield', 'the Lame', 'Cloudwatcher'],
    keepA: ['Amber', 'Ash', 'Copper', 'Cedar', 'Dawn', 'Dusk', 'Ember', 'Falcon', 'Gold', 'Iron', 'Jasper', 'Lantern', 'Lion', 'Moon', 'Oasis', 'Red', 'Salt', 'Star', 'Thorn', 'Wind'],
    keepB: ['crest', 'ford', 'garth', 'haven', 'hollow', 'keep', 'mere', 'reach', 'rock', 'spire', 'spring', 'stead', 'tower', 'vale', 'wall', 'well'],
  },

  // ---------- Hero Awakening ----------
  // Past 5 stars a hero can be awakened up to A5 with its own shards: each step costs a number of duplicates'
  // worth for its rarity. Every awakening adds to the hero's attack, defense and health and 10 levels to its cap;
  // A3 and A5 also strengthen its skill.
  awaken: {
    unlock: 12, // Rainwyrm level
    wyrm: [12, 14, 16, 18, 20], // the Rainwyrm level each step opens at
    dupes: [3, 5, 7, 9, 12], // duplicates' worth of shards for A1 to A5
    stat: 0.04, cap: 10, // per awakening
    skill: { 3: 0.1, 5: 0.2 }, // skill strength from A3, and from A5 (in place of the A3 bonus)
    warPts: 40, // Oasis Wars points per awakening
  },

  // ---------- Wadi Clash ----------
  // A short live battle in a dry canyon against two rival caravans. Each side has three squads (yours are your
  // squad heroes, each with a third of the march). Holding a point scores its value every second; the first side
  // to the goal, or the leader when time runs out, wins. Squads that meet fight at once (the stronger side wins
  // and keeps the square root of the difference of the squares of the two strengths, Lanchester's law); the
  // losers limp back to camp to recover.
  clash: {
    unlock: 9, // Rainwyrm level
    banners: { cap: 3, every: 14400 }, // a Clash Banner every 4 hours of keep time, three at most; a match takes one
    length: 180, goal: 700, // seconds of a match, and the score that wins it outright
    speed: 0.11, // map widths a squad marches per second (routed squads limp at 70%)
    capture: 3, // seconds to raise a flag on a point no one is holding
    hold: 0.15, // squads fighting on a point their side holds fight this much harder
    heal: 0.06, // strength a squad gets back per second in its camp
    ready: 0.35, // a squad back in camp can march again once it is above this
    // the map is 1 wide and 1.5 tall: your camp at the bottom, the rivals' in the top corners
    camps: [[0.5, 1.4], [0.1, 0.12], [0.9, 0.12]],
    points: [
      { id: 'towerS', name: 'South Tower', x: 0.5, y: 1.12, pts: 1, icon: 'i-fort' },
      { id: 'towerW', name: 'West Tower', x: 0.22, y: 0.36, pts: 1, icon: 'i-fort' },
      { id: 'towerE', name: 'East Tower', x: 0.78, y: 0.36, pts: 1, icon: 'i-fort' },
      { id: 'wellW', name: 'West Well', x: 0.18, y: 0.8, pts: 2, icon: 'i-well' },
      { id: 'wellE', name: 'East Well', x: 0.82, y: 0.8, pts: 2, icon: 'i-well' },
      { id: 'shrine', name: 'Rain Shrine', x: 0.5, y: 0.14, pts: 2, icon: 'i-shrine' },
      { id: 'cistern', name: 'Old Cistern', x: 0.5, y: 0.7, pts: 4, icon: 'i-cistern' },
    ],
    // the two rival caravans of a match, each a share of your average squad's strength
    rivals: ['Saltmarch Riders', 'Duskmoor Company', 'Red Sash Band', 'Sunwell Lancers', 'Ravensgate Guard', 'Palmhold Free Company'],
    rivalStr: [[1, 1.12], [1.12, 1.3]], // stronger than your squads: you have the camp nearest your own tower, they have each other
    hunt: 1.6, // the other two go after the leader's points this much harder
    colors: ['#3fd0c0', '#d0583a', '#6a7ae0'],
    // by place: resources in quarter-crates, journals scaled to the keep
    rewards: [{ starglass: 120, whetstone: 3, journals: 2 }, { starglass: 70, whetstone: 2, journals: 1 }, { starglass: 30, whetstone: 1, journals: 0.5 }],
    warPts: [90, 55, 25],
    // the Clash League: league points by place, six tiers, harder rivals and richer rewards a tier, and a season
    // every week of keep time that pays by the highest tier reached and starts you two tiers lower
    league: {
      tiers: [
        { name: 'Sand', lp: 0, color: '#c9a777' }, { name: 'Copper', lp: 100, color: '#c97a3a' }, { name: 'Silver', lp: 250, color: '#c8d0d8' },
        { name: 'Gold', lp: 450, color: '#e0b04a' }, { name: 'Sunsteel', lp: 700, color: '#ff9a4a' }, { name: 'Rainwyrm', lp: 1000, color: '#3fd0c0' },
      ],
      gain: [40, 10, -20], // by place; you never drop below the tier you are in
      harder: 0.05, richer: 0.15, // per tier
      season: 604800, drop: 2,
      seasonRewards: [{ starglass: 100 }, { starglass: 200, whetstone: 3 }, { starglass: 300, whetstone: 5 }, { starglass: 450, shard_epic: 1 }, { starglass: 600, shard_epic: 2 }, { starglass: 800, shard_legendary: 1 }],
    },
  },

  // ---------- Spring Fishing ----------
  // Since the rains came back the spring has fish in it. Cast, tap when the float dips, then hold to reel and
  // let go when the fish runs; too much tension and the line snaps.
  fishing: {
    unlock: 3, // Rainwyrm level
    casts: { cap: 6, every: 3600, rain: 2 }, // a cast back every hour of keep time (6 at most); calling the rain brings 2 more
    bite: [1.6, 4.8], // seconds before a fish bites
    strike: 0.8, // seconds to strike once the float dips
    // reeling, per second: progress while holding (less for strong fish), what a fish takes back while you let go,
    // tension while holding (more for strong fish, far more when it runs) and how fast it falls when you let go
    reel: { gain: 30, slip: 9, up: 34, down: 80, runUp: 3.2, runEvery: [0.9, 2.2], runFor: [0.5, 1.1], time: 24 },
    // pull sets how hard a fish fights. Past about 1.6 no one can land it, so the strong fish sit just under:
    // a steady hand lands an Old Whiskers nine times in ten and a Rain Koi three in four, a hasty one rarely.
    fish: [
      { id: 'minnow', name: 'Spring Minnow', w: 40, pull: 0.6, cm: [5, 12], give: { food: 0.5 }, color: '#9fc8d8', text: 'Silver and quick. The children catch them by the bucket.' },
      { id: 'carp', name: 'Sand Carp', w: 28, pull: 1.0, cm: [20, 45], give: { food: 1.2 }, color: '#c9a06a', text: 'Sleeps in the sand at the bottom and wakes up hungry.' },
      { id: 'barb', name: 'Golden Barb', w: 14, pull: 1.3, cm: [15, 30], starglass: 15, color: '#e8b54a', text: 'Scales like coins. The old wells were named for them.' },
      { id: 'eel', name: 'Glass Eel', w: 10, pull: 1.48, cm: [40, 90], journals: 2, color: '#bfe8f0', text: 'You can see its heart beating. The archivists want every one.' },
      { id: 'whiskers', name: 'Old Whiskers', w: 6, pull: 1.52, cm: [60, 120], whetstone: 2, starglass: 20, color: '#7a6a4a', text: 'A catfish older than the keep. It has swallowed more than one whetstone.' },
      { id: 'koi', name: 'Rain Koi', w: 2, pull: 1.55, cm: [50, 80], starglass: 80, beacons: 1, color: '#ff8a5a', text: 'Red and gold, and only ever seen after rain. Luck for a year.' },
    ],
    firstCatch: 2, // the first of each kind pays double
    warPts: 8, // Oasis Wars points a fish
  },

  // ---------- Heirlooms ----------
  // Every hero carries one thing from before the keep. It wakes when the hero reaches 3 stars and is tempered
  // with Desert Whetstones up to Lv 10: each level adds to the hero's attack, defense and health and to the
  // strength of their skill. Whetstones come from watchtower errands and bounties, the Crossing and siege
  // chests, the Bazaar, now and then a beast, and the Heirloom Kit.
  heirloom: {
    stars: 3, // hero stars to wake it
    cost: [10, 12, 15, 18, 22, 26, 30, 35, 40, 46], // whetstones to reach Lv 1 (waking it) to Lv 10
    stat: 0.025, skill: 0.04, // per level: hero attack, defense and health, and skill strength
    beast: 0.05, // the chance a beast drops one
    // its picture: a hero's own where one was painted, else one for the class
    icons: { zahra: 'i-hl-lantern', tamir: 'i-hl-ladle', yusra: 'i-hl-conch', idris: 'i-hl-bell', sefa: 'i-hl-bell', omar: 'i-hl-pick', guard: 'i-hl-lantern', bow: 'i-hl-quiver', lancer: 'i-hl-bridle' },
    list: {
      zahra: ["The Last Caravan's Lantern", 'The lantern she carried out of the Glass Cities. It has never gone out.'],
      tariq: ["Windrider's Bridle", 'Braided from the manes of every camel that ever outran a storm with him.'],
      leila: ['The Farsight Eyepatch', 'Stitched with silver thread. She swears it lets her blind eye see the wind.'],
      idris: ["Wyrmkeeper's Bell", 'A clay bell the old keepers rang to call the wyrms to water.'],
      soraya: ["Dawnbringer's Banner", 'Blue as the morning she saw it rain.'],
      nadia: ['Glass Sea Quiver', 'Oryx hide, and arrowheads knapped from the floor of the old sea.'],
      bashir: ['The Deepwell Rope', 'Thirty years of well rope, knotted at every depth he ever reached.'],
      amira: ['The First Shade Sail', 'The first sail she ever wove, patched a hundred times and still keeping off the sun.'],
      kofi: ['The Saltroad Ledger', 'Every load he ever hauled, and every raider he ever turned back.'],
      yara: ['Hare-Bone Charm', 'From her first night hunt, and her luck ever since.'],
      rashid: ['The East Gate Bar', 'The iron bar from the gate he held alone. He carries it everywhere.'],
      samira: ["Courier's Seal Ring", 'The seal of a keep nobody has heard of. She will not say whose.'],
      omar: ['The Emergency Pick', 'Nobody has seen him use it. Everybody has seen him polish it.'],
      nuri: ['Snare-Wire Bracelet', 'Copper snare wire twisted into a bracelet, and still able to catch a hare.'],
      halima: ['The Aloe Flask', 'A tonic so strong it is kept in brass, for the worst nights only.'],
      lio: ['The Ridge Whistle', 'A bone whistle only the scouts of the ridge can hear.'],
      tamir: ['The Seasoned Ladle', 'Blackened brass, older than the keep, and still his best weapon.'],
      mara: ['The Windcatcher Vane', 'A brass vane from her first windcatcher, still turning to the breeze.'],
      imani: ['The Wadi Gate Shield', 'Dented by the first flood, and never hammered straight.'],
      kaveh: ['The Stormglass Kite', 'The kite that went into the storm cloud and came back crackling.'],
      tomas: ['The Reed Oar', 'Twenty years on a dry marsh, and wet at last.'],
      sefa: ['The Cinder Choir Bell', 'She rang it once, the night she stopped singing to the embers.'],
      yusra: ["Grandmother's Conch", 'A shell from the Bone Coast that still holds the sound of the old sea.'],
      haroun: ['The Black Glass Mask', 'Blown from the melted desert. The only mask that does not crack in the heat.'],
      noor: ['The Wyrmbone Charm', "The one charm she never sold, carved from a wyrm's knuckle."],
    },
  },

  // ---------- What's new ----------
  // Shown once to a returning player after an update (news.js): the newest features first, each with a way
  // to it, or what opens it.
  news: [
    { v: '4.40', items: [
      { icon: 'i-veil', name: 'Breath Arts', text: "Your Rainwyrm's breath can now be more than a Torrent. From Rainwyrm Lv 6 it breathes a Mist Veil that heals the squad and draws out venom, and from Lv 11 a Riptide that holds the foe under for two rounds. Choose on the stage card, against the foe in front of you.", act: 'tab:expedition', open: (S) => S.lv.wyrm >= 6, needs: 'Rainwyrm Lv 6' },
    ] },
    { v: '4.39', items: [
      { icon: 'i-star', name: 'Stage Stars', text: "Every story stage now holds three stars: the victory, ending the fight with half the squad's health, and winning within five rounds. Tap a cleared stage on the Expedition tab to fight it again for the stars it is missing; each chapter's stars fill three chests.", act: 'stars', open: (S) => S.stage > 2, needs: 'Clear stage 2' },
    ] },
    { v: '4.38', items: [
      { icon: 'i-duel', name: 'The Sparring Ring', text: "Up to four heroes sit in the ring on the Heroes tab and fight at the level of your third-best hero outside it, in the squad or anywhere else, so a kinship partner or the hero whose skill answers a foe's trait is ready when you need them.", act: 'tab:heroes', open: (S) => S.lv.wyrm >= 10, needs: 'Rainwyrm Lv 10' },
    ] },
    { v: '4.37', items: [
      { icon: 'i-check', name: 'Ready now', text: 'A new Ready entry on the left gathers everything waiting for you in one list: idle builders, a quest to claim, attacks left, a full stack of Trowels, dishes to cook. One tap goes to each.', act: 'ready', open: (S) => S.quest >= 6, needs: 'chapter quest 7' },
    ] },
    { v: '4.36', items: [
      { icon: 'i-tr-armored', name: 'Foe traits', text: 'From stage 16 every foe on the expedition has a trait, and bosses two: Armored, Regenerating, Venomous, Frenzied or Sand-shelled. Each has an answer, from a Sunder through armor to the Torrent against a frenzy, and the stage card says whether your squad has it.', act: 'tab:world', open: (S) => S.stage >= 16, needs: 'expedition stage 16' },
    ] },
    { v: '4.35', items: [
      { icon: 'i-dg-idol', name: 'Relic Charms', text: 'Every kind of relic dug up in the Buried City can now be worn by a hero as a charm: health, attack, defense or skill power, a level for every one of its kind you find. Choose one on any hero\'s sheet.', act: 'buriedcity', open: (S) => !!(S.dig && S.dig.found && Object.keys(S.dig.found).length), needs: 'a relic from the Buried City' },
    ] },
    { v: '4.34', items: [
      { icon: 'i-lev', name: 'The Sand Leviathan', text: 'A leviathan too big to kill surfaces in the deep dunes every day. Attack it three times a hunt: each attack is scored by the damage done, and the best one ranks you among the fifty wardens of the Hall.', act: 'leviathan', open: (S) => S.lv.wyrm >= 9, needs: 'Rainwyrm Lv 9' },
    ] },
    { v: '4.33', items: [
      { icon: 'i-heart', name: 'Hero Kinships', text: 'Twelve pairs of heroes whose stories are tied now fight better side by side: put both in the squad for a bonus to the whole squad, growing with the stars between them. See them on the Heroes tab.', act: 'kinships', open: (S) => Object.keys(S.heroes).length > 0, needs: 'a hero' },
    ] },
    { v: '4.32', items: [
      { icon: 'i-fw', name: 'The Founding Week', text: "A new keep's first seven days now come with missions: five open each day, each worth points, with chests along the way and a Legendary hero of your choosing at the end.", act: 'founding', open: (S) => !!(S.founding && S.founding.state === 'open'), needs: 'a new keep' },
    ] },
    { v: '4.31', items: [
      { icon: 'i-dg-trowel', name: 'The Buried City', text: 'The well-diggers have broken into a city under the sand. Dig it out layer by layer with Trowels: the sand you dig shows how many relic pieces lie around it, so read it before you dig again. Every relic dug up whole pays, and five open the way down.', act: 'buriedcity', open: (S) => S.lv.wyrm >= 11, needs: 'Rainwyrm Lv 11' },
    ] },
    { v: '4.30', items: [
      { icon: 'i-ck-fire', name: 'The Cookfire', text: 'Every fish you land now goes into the larder too. Cook them into dishes that serve the whole keep for a few hours: skewers for gathering, stew for production, pilaf for battle, and a Rain Koi Banquet for everything.', act: 'cookfire', open: (S) => S.lv.wyrm >= 4, needs: 'Rainwyrm Lv 4' },
    ] },
    { v: '4.29', items: [
      { icon: 'i-scroll', name: 'Building Charters', text: 'At Lv 10 every building takes one of two charters for good: more of what it makes, or something else the keep needs, from Covered Cisterns to a Drill Yard. Open a building to choose.', act: 'tab:town', open: (S) => Object.values(S.lv).some((v) => v >= 10), needs: 'a building at Lv 10' },
    ] },
    { v: '4.28', items: [
      { icon: 'i-journey', name: 'Far Journeys', text: 'Send parties of up to three heroes on journeys beyond the Dunes. Each asks for something (a class, stars between them, a Legendary), and every hero comes home with shards of their own, so your benched heroes grow too.', act: 'journeys', open: (S) => S.lv.wyrm >= 5, needs: 'Rainwyrm Lv 5' },
    ] },
    { v: '4.27', items: [
      { icon: 'i-dry', name: 'The Dry Season', text: 'Every three days a drought comes for half a day: the wells sink and the air burns. Answer it with an edict (ration the water, dig a deep cistern, or keep the rain watch) and earn the Warden\'s chest by how well the keep comes through.', act: 'dry', open: (S) => S.lv.wyrm >= 6, needs: 'Rainwyrm Lv 6' },
    ] },
    { v: '4.26', items: [
      { icon: 'i-peace', name: 'Pacts & Feuds', text: 'Every rival keep now remembers how you treat it. Send gifts and sign pacts for tribute and warriors on your walls, or raid them and risk a feud: a keep in a feud sends its warband on its own.', act: 'rivals', open: (S) => S.lv.wyrm >= 8, needs: 'Rainwyrm Lv 8' },
    ] },
    { v: '4.25', items: [
      { icon: 'i-derby', name: 'The Camel Derby', text: 'Raise Saffron, a racing camel, and race her on the salt pan against five rivals for the Village Cup, the Oasis Stakes and the Desert Crown. Hold to urge her on, but let her breathe, or she runs dry.', act: 'derby', open: (S) => S.lv.wyrm >= 8, needs: 'Rainwyrm Lv 8' },
    ] },
    { v: '4.24', items: [
      { icon: 'i-star', name: 'Hero Talents', text: 'At levels 10, 30, 50, 70 and 90 every hero chooses one of two talents: their own strength, or something for the whole fight, from leading their troops to a faster skill or a stronger Torrent.', act: 'tab:roster', open: (S) => S.lv.wyrm >= 6, needs: 'Rainwyrm Lv 6' },
    ] },
    { v: '4.23', items: [
      { icon: 'i-decree', name: "Warden's Decrees", text: 'Give orders to the whole keep: a Harvest Rite for production, a Rush Order to cut every timer, a Call to Arms before a battle, and more as the Rainwyrm grows. Each rests before it can be given again, so choose your moment.', act: 'decrees', open: (S) => S.lv.wyrm >= 5, needs: 'Rainwyrm Lv 5' },
    ] },
    { v: '4.22', items: [
      { icon: 'i-trophy', name: 'The Clash League', text: 'Wadi Clash matches now climb a league, from Sand to Rainwyrm: each tier brings stronger rivals and richer rewards, and every week the season pays out by the highest tier you reached.', act: 'clash', open: (S) => S.lv.wyrm >= 9, needs: 'Rainwyrm Lv 9' },
    ] },
    { v: '4.21', items: [
      { icon: 'i-caravan', name: 'Trade Routes', text: 'Send trade caravans to four markets beyond the Dunes with the goods they ask for, and bring home journals, whetstones, Sunsteel, speedups and more. Prices change daily; the far roads pay best but need an escort.', act: 'trade', open: (S) => S.lv.wyrm >= 10, needs: 'Rainwyrm Lv 10' },
    ] },
    { v: '4.20', items: [
      { icon: 'i-fort', name: 'Oasis Outposts', text: 'Claim resource nodes on the Dunes as outposts. Leave a garrison and they yield every hour, but raiders come for them: hold them with enough troops and higher walls.', act: 'outposts', open: (S) => S.lv.wyrm >= 7, needs: 'Rainwyrm Lv 7' },
    ] },
    { v: '4.19.1', items: [
      { icon: 'i-compass', name: 'A steadier camera', text: 'The keep\'s camera now keeps one fixed angle, so the keep always faces you the same way. Drag to move around, and pinch or scroll to zoom.' },
    ] },
    { v: '4.19', items: [
      { icon: 'i-trophy', name: 'Hall of Wardens', text: 'A ranking of fifty wardens of the Dunes by power, you among them. Climb it, and collect a payout by rank every day.', act: 'hall', open: (S) => S.lv.wyrm >= 4, needs: 'Rainwyrm Lv 4' },
      { icon: 'i-star', name: 'Hero Awakening', text: 'Fully starred heroes can now be awakened five times with their own shards, one more step at every second Rainwyrm level from Lv 12: more attack, defense and health, 10 more levels each time, and a stronger skill at A3 and A5.', act: 'tab:heroes', open: (S) => S.lv.wyrm >= 12, needs: 'Rainwyrm Lv 12' },
    ] },
    { v: '4.18', items: [
      { icon: 'i-clash', name: 'Wadi Clash', text: 'A live three-way battle for a dry canyon. Send your three squads to take its wells, towers, the Rain Shrine and the Old Cistern, and hold them against two rival caravans. A Clash Banner every 4 hours.', act: 'clash', open: (S) => S.lv.wyrm >= 9, needs: 'Rainwyrm Lv 9' },
    ] },
    { v: '4.17', items: [
      { icon: 'i-rank-champ', name: 'Troop Ranks', text: 'Drill your troops at the Barracks into Veterans, Elites and Champions. Every ranked troop lifts the strength of its whole class, and in a fight the recruits fall first.', act: 'plot:barracks', open: (S) => S.lv.barracks >= 10, needs: 'Barracks Lv 10' },
    ] },
    { v: '4.16', items: [
      { icon: 'i-ballista', name: 'Gate Defenses', text: 'Ballista towers, oil cauldrons and a stake yard at the gate: raise them for stronger defenders against raids and more tactics in every Scorpion Siege. They stand on the walls and grow as you raise them.', act: 'defenses', open: (S) => S.lv.wyrm >= 5, needs: 'Rainwyrm Lv 5' },
    ] },
    { v: '4.15', items: [
      { icon: 'i-fish', name: 'Spring Fishing', text: 'Fish have come back to the spring with the rains. Cast, strike when the float dips, and reel without snapping the line. Six kinds to catch, from minnows to the Rain Koi.', act: 'fishing', open: (S) => S.lv.wyrm >= 3, needs: 'Rainwyrm Lv 3' },
    ] },
    { v: '4.14', items: [
      { icon: 'i-guard', name: 'Formations', text: 'Choose which troop class leads your marches and expedition battles. The picker fights each fight out in advance and marks the formation that fares best.', act: 'tab:expedition', open: (S) => S.lv.barracks > 0, needs: 'the Barracks' },
      { icon: 'i-heirloom', name: 'Heirlooms', text: "Every hero carries one thing from before the keep. It wakes at 3 stars; temper it with Desert Whetstones for more stats and a stronger skill.", act: 'heirlooms', open: (S) => Object.values(S.heroes).some((h) => h.stars >= 3), needs: 'a hero at 3 stars' },
    ] },
    { v: '4.13', items: [
      { icon: 'i-intel', name: 'Watchtower Intel', text: 'Star-rated reports on the Dunes: rescues, hunts, lost caravans, relics, bounties and hero errands, each with its own story.', act: 'intel', open: (S) => S.lv.wyrm >= 4 && S.lv.barracks > 0, needs: 'Rainwyrm Lv 4 and the Barracks' },
    ] },
    { v: '4.12', items: [
      { icon: 'i-horn', name: 'The Scorpion Siege', text: 'Ten waves against the gate. The scouts call each wave; counter it with Fire Pots, the Ballista or Stakes, and hold for the Scorpion King.', act: 'siege', open: (S) => S.lv.wyrm >= 10, needs: 'Rainwyrm Lv 10' },
    ] },
    { v: '4.11', items: [
      { icon: 'i-fort', name: 'Rival Keeps', text: 'Eight keeps on the Dunes to scout and raid for their stores. Their warbands strike back.', act: 'rivals', open: (S) => S.lv.wyrm >= 8, needs: 'Rainwyrm Lv 8' },
    ] },
    { v: '4.10', items: [
      { icon: 'i-road', name: 'The Spice Road', text: 'A dice board round an old trade loop: roll Road Dice for resources, Starglass and lap prizes.', act: 'road', open: (S) => S.lv.hall > 0, needs: 'the Caravan Hall' },
    ] },
    { v: '4.9', items: [
      { icon: 'i-pals', name: 'Companions and the painted cast', text: 'Desert animals to tame and raise, and every hero, villager, beast and camel now a painted 3D model.', act: 'pals', open: (S) => S.lv.wyrm >= 7, needs: 'Rainwyrm Lv 7' },
    ] },
  ],

  // ---------- Watchtower Intel ----------
  // Reports from the watchtower's scouts: a job on open sand within sight, rated one to five stars. Rescues,
  // hunts and bounties are fights for the squad; a lost caravan or a relic needs only a few scouts; an errand
  // sends one hero alone (a benched one if you have one) and pays that hero's shards.
  intel: {
    unlock: 4, // Rainwyrm level (and the Barracks built, to send marches)
    every: 75 * 60, cap: 3, capAt: [10, 15], // a report every 75 minutes of keep time; one more held from Watchtower Lv 10 and 15
    ring: [2, 7.5], // how far out, in tiles (and always within sight)
    stars: [30, 30, 22, 12, 6], starTower: 0.05, // weights for one to five stars; each Watchtower level tilts them up
    // a fight is as strong as expedition stage (yours - 8 + 1.5 x stars, so even five stars is just short of where
    // your expedition stands), a bounty a little stronger
    foe: { offset: -8, perStar: 1.5, bounty: 1.1 },
    life: 6 * 3600, // a report nobody answers fades from the ledger after 6 hours of keep time
    loss: 0.15, // troops lost when a fight goes badly (the report stays)
    scouts: 0.25, escort: 0.1, // the share of the march sent with scouts, and with a hero on an errand
    starMult: (s) => 0.6 + 0.2 * s, // rewards by stars
    kinds: {
      rescue: { name: 'Rescue', icon: 'i-rescue', fight: true, w: 3, give: { food: 2, water: 1.5 }, journals: 1, survivors: 1 },
      hunt: { name: 'Hunt', icon: 'i-hunt', fight: true, w: 3, give: { food: 2.5, stone: 1.5 }, journals: 1.5, treats: 5 },
      caravan: { name: 'Lost caravan', icon: 'i-lostcaravan', fight: false, w: 2, give: { stone: 2, copper: 1.5 }, starglass: 8 },
      relic: { name: 'Relic', icon: 'i-relic', fight: false, w: 2, give: { water: 1 }, journals: 2, starglass: 12 },
      bounty: { name: 'Bounty', icon: 'i-bounty', fight: true, w: 2, give: { copper: 2 }, starglass: 20, beacon: 0.08, whet: 1 },
      errand: { name: "Hero's errand", icon: 'i-errand', fight: false, hero: true, w: 2, give: { food: 1 }, journals: 2, shards: 2, whet: 1 },
    },
    // the story on each report: a title and a line, then what the march found ({hero} is the hero on an errand)
    tales: {
      rescue: [
        ['Smoke at the dry well', 'Raiders have a family pinned down at the old well, and the water is nearly gone.', 'The raiders scatter. The family walks home between your troops, holding hands.'],
        ['A wagon on its side', 'A trader\'s wagon lies overturned in a gully. Scorpion riders circle it like vultures.', 'The riders flee into the dunes, and the trader\'s children climb out from under the wagon.'],
        ['Shepherds in a cave', 'Goatherds hide in a cave mouth while a raiding party waits them out.', 'The siege is lifted. The shepherds bring their goats and their thanks to the keep.'],
      ],
      hunt: [
        ['Old One-Ear', 'A sand lion with a torn ear has taken three camels from the caravan road.', 'Old One-Ear will take no more camels. The caravan masters send dried meat and thanks.'],
        ['Tracks by the cistern', 'Something big drinks at the cistern at night and leaves claw marks on the stone.', 'A great jackal, grey at the muzzle. The cistern is safe again.'],
        ['The man-eater of the salt flats', 'Travellers will not cross the flats while the beast hunts there.', 'The beast is down. Travellers already cross the flats again.'],
      ],
      caravan: [
        ['Bells in the dunes', 'Scouts hear camel bells in the dunes but see no riders. A caravan has lost its way.', 'Five camels, still loaded, and no sign of their drivers. Their cargo comes home.'],
        ['A trader out of water', 'A lone trader, three days lost, waves a red cloth from a dune top.', 'The trader drinks, weeps, and insists on paying for the rescue in goods.'],
        ['Tracks that circle', 'A caravan trail circles the same dune twice. Someone is lost in the haze.', 'The caravan follows your scouts to the road and leaves a share of its load as thanks.'],
      ],
      relic: [
        ['Something glints', 'A scout saw a glint on a dune crest where the wind has stripped the sand.', 'A bronze lamp, older than the keep, with writing no one can read yet.'],
        ['An old milestone', 'The wind has uncovered a carved milestone from a road no map remembers.', 'Under the stone, a sealed jar of maps and a few coins from a forgotten kingdom.'],
        ['A buried cistern', 'A ring of cut stones shows where an old cistern lies under the sand.', 'Dry, but its walls are carved with the old rain songs. The archivists are delighted.'],
      ],
      bounty: [
        ['Lieutenant Varr', 'A Scorpion lieutenant has camped close enough to see the keep\'s lamps. There is a price on his head.', 'Varr\'s banner comes down. The bounty is paid in Starglass.'],
        ['The Red Sash', 'A raider captain in a red sash has been robbing pilgrims on the shrine road.', 'The Red Sash is taken. The pilgrims\' road is open, and the bounty is yours.'],
        ['Scorpion paymaster', 'The host\'s paymaster travels with a strongbox and a small guard.', 'The strongbox is heavier than it looked.'],
      ],
      errand: [
        ['A letter from home', '{hero} has a letter from a cousin camped at the far well, and asks leave to take them water.', '{hero} comes back with the cousin\'s thanks and a bundle of old family things.'],
        ['An old teacher\'s grave', '{hero} wants to visit the grave of an old teacher out on the sand.', '{hero} returns quiet, and trains harder than ever after.'],
        ['A blade in the dunes', '{hero} has heard a rumour of a lost blade from long ago, buried by a dune.', '{hero} found it, rusted but whole, and will not say whose it was.'],
      ],
    },
    warPts: 10, // Oasis Wars points per star
  },

  // ---------- The Scorpion Siege ----------
  // Ten waves of the Scorpion host against the gate. The scouts call each wave's kind before it comes;
  // one tactic a wave counters it, and each siege brings only so many of each.
  siege: {
    unlock: 10, // Rainwyrm level
    every: 6 * 3600, cap: 1, // a host gathers every 6 hours of keep time; one waits outside the walls at most
    waves: 10, captainAt: 5, // wave 5 brings a Scorpion Captain, wave 10 the Scorpion King
    // waves measure themselves against the defenders on the walls when the horn sounds (troops at home and the
    // squad heroes in the keep): wave w comes at start + per x (w - 1) of their strength, the Captain and the King
    // stronger still; never weaker than a foe of floor x your expedition stage, so an empty wall is no shortcut
    foe: { start: 0.7, per: 0.07, captain: 1.2, king: 1.2 },
    floor: 0.7,
    kinds: {
      swarm: { name: 'Sand-rat swarm', cls: 'bow', icon: 'i-swarm', atk: 0.9, def: 0.8, hp: 1.3, desc: 'Slingers in their hundreds, light and quick and always more of them.' },
      shield: { name: 'Shieldwall', cls: 'guard', icon: 'i-shieldwall', atk: 0.9, def: 1.8, hp: 1, desc: 'Scorpion guards locked behind tall hide shields.' },
      riders: { name: 'Camel riders', cls: 'lancer', icon: 'i-riders', atk: 1.35, def: 1, hp: 0.85, desc: 'Lances and war camels: they hit the gate hard.' },
    },
    odds: { swarm: 1, shield: 1, riders: 1 },
    // one tactic a wave: each counters one kind of wave (and still helps a little against the others)
    tactics: {
      pots: { name: 'Fire Pots', icon: 'i-firepot', vs: 'swarm', desc: 'Burning oil over the swarm: +60% attack against it.', atk: 0.6 },
      ballista: { name: 'Ballista', icon: 'i-ballista', vs: 'shield', desc: 'Bolts through the hide: the shieldwall loses half its defense.', def: 0.5 },
      stakes: { name: 'Stakes', icon: 'i-stakes', vs: 'riders', desc: 'Sharpened stakes before the gate: the riders hit 40% softer.', foeAtk: 0.6 },
    },
    offAtk: 0.1, // a tactic used against the wrong kind of wave still gives +10% attack
    stock: 3, // of each tactic, every siege
    extra: { starglass: 40, max: 3 }, // one more of a tactic mid-siege, up to 3 a siege
    rest: 0.12, restPer: 0.003, // health back after a wave held (+0.3% per Healer's House level)
    rally: 0.5, // after a lost wave the defenders regroup to at least half health
    walls: 3, // lost waves before the walls are breached and the siege ends
    wall: 0.01, // attack and defense per Watchtower level
    cauldrons: { water: 4 }, cauldronBonus: 0.15, // boiling water readied for the whole siege (quarter-crates, scaled)
    farSight: 12, // from Watchtower Lv 12 the scouts see two waves ahead
    wave: { stone: 0.5, food: 0.5 }, // quarter-crates for every wave held
    captainGift: { starglass: 25, journals: 1 }, // for beating the Captain
    // the siege chest, by waves held (the King's head is worth a Beacon on top)
    chest: (d, king) => {
      const r = { starglass: 6 * d, journals: 0.5 * d, whetstone: Math.floor(d / 2) };
      if (d >= 4) r.speed15 = 1;
      if (d >= 8) r.speed60 = 1;
      if (king) { r.starglass += 60; r.beacons = 1; }
      return r;
    },
    warPts: 15, // Oasis Wars points a wave held
  },

  cloudRun: {
    unlock: 5, // Rainwyrm level (a Drake can fly)
    perDay: 3, // flights a day
    seconds: 45, hearts: 3,
    speed: [230, 430], // scroll speed at the start and the end of a flight (px per second)
    // what a flight brings home: water per cloud (quarter-crates, scaled), Starglass per golden drop, bond per 5 clouds
    water: 0.15, drop: 6, bondPer: 5,
    // rain rings: fly through them to build a combo; each combo step adds 20% to every cloud, and the combo
    // slips a step after `hold` seconds without a ring (a dust devil breaks it)
    ring: { gap: [520, 820], step: 0.2, max: 5, hold: 4 },
    // Rain Pearls: one waits in every flight that lasts long enough, and a few more turn up by chance
    pearl: { at: [14, 30], chance: 0.012 },
    // Wyrm Gifts, bought with Rain Pearls (cost of each level)
    gifts: [
      { id: 'scales', name: 'Thick Scales', icon: 'i-heart', desc: '+1 heart', cost: [4, 10] },
      { id: 'wind', name: 'Long Wind', icon: 'i-storm', desc: '+5 seconds a flight', cost: [3, 7, 12] },
      { id: 'call', name: 'Cloud Call', icon: 'i-water', desc: 'Clouds, drops and pearls drift toward the wyrm', cost: [3, 6, 10] },
      { id: 'gold', name: 'Golden Eye', icon: 'i-gem', desc: 'Golden drops turn up more often', cost: [4, 9] },
      { id: 'song', name: 'Rain Song', icon: 'i-water', desc: '+10% water from every cloud', cost: [2, 4, 6, 8, 10] },
      { id: 'storm', name: 'Storm Rider', icon: 'i-raincloud', desc: 'Storm clouds count four, and the first dust devil each flight glances off', cost: [12] },
    ],
  },

  // ---------- Channels: the water puzzle ----------
  // Turn the stone channel pieces until the spring's water reaches every hut, palm and field with
  // nothing spilling. Puzzles are generated from their number, so every player gets the same Channel 12.
  channels: {
    unlock: 2, // Rainwyrm level
    base: 8, perLevel: 4, // puzzles open: base, then 4 more for every Rainwyrm level after unlock
    // from puzzle n: columns, rows, share of rock cells
    sizes: [[1, 4, 4, 0], [4, 4, 5, 0], [11, 5, 5, 0.04], [21, 5, 6, 0.06], [36, 6, 6, 0.08], [56, 6, 7, 0.08], [81, 7, 8, 0.1]],
    // first clear (resources in quarter-crates, scaled to the keep)
    reward: (n) => (n % 10 === 0 ? { starglass: 60, water: 2 } : n % 5 === 0 ? { starglass: 25, stone: 2 } : { water: 2, food: 1 }),
    daily: { size: [6, 7, 0.08], reward: { starglass: 60, journals: 6, water: 4 } },
    hintsPerDay: 3,
    starChests: [
      [12, { starglass: 80, speed15: 2 }], [30, { beacons: 2, water: 4 }], [54, { starglass: 150, speed60: 1 }], [84, { shard_epic: 1, journals: 10 }],
      [120, { starglass: 250, rainCharm: 1 }], [160, { beacons: 4, stone: 6 }], [200, { shard_epic: 1, starglass: 300 }], [240, { shard_legendary: 1 }],
    ],
  },
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
    { id: 'chan20', text: 'Clear 20 channel puzzles', stat: 'chanClears', n: 20, reward: { starglass: 120 } },
    { id: 'chan150', text: 'Earn 150 channel stars', stat: 'chanStars', n: 150, reward: { starglass: 300 } },
    { id: 'decor15', text: 'Raise the keep gardens to 15 levels in all', stat: 'decor', n: 15, reward: { starglass: 200 } },
    { id: 'cloud40', text: 'Herd 40 clouds in a single Cloud Run', stat: 'cloudBest', n: 40, reward: { starglass: 150 } },
    { id: 'bond5', text: 'Reach bond Lv 5 with your Rainwyrm', stat: 'bond', n: 5, reward: { starglass: 150 } },
    { id: 'bond10', text: 'Reach bond Lv 10 with your Rainwyrm', stat: 'bond', n: 10, reward: { starglass: 400 } },
    { id: 'kin4', text: 'Free all four of the kin', stat: 'kin', n: 4, reward: { starglass: 600 } },
    { id: 's150', text: 'Wake the Mother of Rains', stat: 'stages', n: 150, reward: { starglass: 1000 } },
    { id: 'tale12', text: 'Finish 12 Hero Tale chapters', stat: 'taleParts', n: 12, reward: { beacons: 5 } },
    { id: 'tale8', text: 'Finish 8 Hero Tales', stat: 'talesDone', n: 8, reward: { shard_legendary: 1 } },
    { id: 'scene20', text: 'Watch 20 story scenes', stat: 'scenes', n: 20, reward: { starglass: 200 } },
    { id: 'bloom10', text: 'Grow 10 oases on the Dunes', stat: 'oases', n: 10, reward: { starglass: 300 } },
    { id: 'bloom30', text: 'Turn the Dunes green: 30 oases', stat: 'oases', n: 30, reward: { shard_legendary: 1 } },
    { id: 'cross1', text: 'Reach the hidden oasis on the Crossing', stat: 'crossWins', n: 1, reward: { beacons: 3 } },
    { id: 'cross10', text: 'Reach the hidden oasis 10 times', stat: 'crossWins', n: 10, reward: { shard_epic: 1 } },
    { id: 'deep5', text: 'Reach Springsong I in the Deepspring', stat: 'deepLv', n: 5, reward: { starglass: 500 } },
    { id: 'deep15', text: 'Reach Springsong III in the Deepspring', stat: 'deepLv', n: 15, reward: { shard_legendary: 1 } },
    { id: 'deep30', text: 'Become Keeper of the Deepspring', stat: 'deepLv', n: 30, reward: { starglass: 3000 } },
    { id: 'refine100', text: 'Refine Tideglass 100 times', stat: 'refines', n: 100, reward: { beacons: 5 } },
    { id: 'far20', text: 'Push 20 stages into the Far South', stat: 'stages', n: 170, reward: { tideglass: 50 } },
    { id: 'pal3', text: 'Tame 3 companions', stat: 'tamed', n: 3, reward: { bells: 5 } },
    { id: 'pal6', text: 'Tame all six companions', stat: 'tamed', n: 6, reward: { shard_epic: 1 } },
    { id: 'palLv', text: 'Raise your companions to 60 levels in all', stat: 'palLv', n: 60, reward: { starglass: 300 } },
    { id: 'pal30', text: 'Raise a companion to Lv 30', stat: 'palTop', n: 30, reward: { starglass: 600 } },
    { id: 'skill50', text: "Use companions' skills 50 times", stat: 'palSkills', n: 50, reward: { treats: 100 } },
    { id: 'lap5', text: 'Travel 5 laps of the Spice Road', stat: 'laps', n: 5, reward: { lucky: 1 } },
    { id: 'lap30', text: 'Travel 30 laps of the Spice Road', stat: 'laps', n: 30, reward: { lucky: 3, starglass: 300 } },
    { id: 'bandit25', text: 'Drive off 25 bandit bands on the Spice Road', stat: 'bandits', n: 25, reward: { beacons: 3 } },
    { id: 'rival10', text: 'Win 10 raids on rival keeps', stat: 'rivalWins', n: 10, reward: { starglass: 200 } },
    { id: 'rivalAll', text: 'Beat every rival keep at least once', stat: 'rivalsBeaten', n: 8, reward: { shard_epic: 1 } },
    { id: 'revenge3', text: 'Take revenge on a rival 3 times', stat: 'revenges', n: 3, reward: { beacons: 3 } },
    { id: 'siege1', text: 'Hold all ten waves of a Scorpion Siege', stat: 'siegeWins', n: 1, reward: { beacons: 3 } },
    { id: 'siege50', text: 'Hold 50 siege waves', stat: 'siegeWaves', n: 50, reward: { starglass: 300 } },
    { id: 'king5', text: 'Slay the Scorpion King 5 times', stat: 'kings', n: 5, reward: { shard_epic: 1 } },
    { id: 'intel10', text: 'Complete 10 watchtower reports', stat: 'intel', n: 10, reward: { starglass: 150 } },
    { id: 'intel60', text: 'Complete 60 watchtower reports', stat: 'intel', n: 60, reward: { shard_epic: 1 } },
    { id: 'intel5', text: 'Complete 10 five-star reports', stat: 'intel5', n: 10, reward: { beacons: 3 } },
    { id: 'heir1', text: 'Wake a heirloom', stat: 'heirWoken', n: 1, reward: { whetstone: 10 } },
    { id: 'heir10', text: 'Temper a heirloom to Lv 10', stat: 'heirTop', n: 10, reward: { shard_legendary: 1 } },
    { id: 'heir30', text: 'Temper heirlooms 30 times', stat: 'tempers', n: 30, reward: { starglass: 300 } },
    { id: 'fish25', text: 'Catch 25 fish in the spring', stat: 'fish', n: 25, reward: { starglass: 100 } },
    { id: 'fishAll', text: 'Catch every kind of fish in the spring', stat: 'fishKinds', n: 6, reward: { beacons: 3 } },
    { id: 'koi', text: 'Catch a Rain Koi', stat: 'koi', n: 1, reward: { shard_epic: 1 } },
    { id: 'def10', text: 'Raise gate defenses 10 times', stat: 'defense', n: 10, reward: { starglass: 150 } },
    { id: 'def30', text: 'Raise every gate defense to Lv 10', stat: 'defense', n: 30, reward: { shard_legendary: 1 } },
    { id: 'drill100', text: 'Drill 100 troops to a new rank', stat: 'drilled', n: 100, reward: { starglass: 150 } },
    { id: 'drill1000', text: 'Drill 1,000 troops to a new rank', stat: 'drilled', n: 1000, reward: { beacons: 2 } },
    { id: 'champ300', text: 'Command 300 Champions', stat: 'champs', n: 300, reward: { shard_legendary: 1 } },
    { id: 'trade1', text: 'Bring a trade caravan home', stat: 'tradeTrips', n: 1, reward: { starglass: 100 } },
    { id: 'trade50', text: 'Bring 50 trade caravans home', stat: 'tradeTrips', n: 50, reward: { shard_legendary: 1 } },
    { id: 'tradeGlass', text: 'Trade with the Glass Cities 10 times', stat: 'tradeGlass', n: 10, reward: { beacons: 3 } },
    { id: 'talent1', text: 'Choose a hero talent', stat: 'talents', n: 1, reward: { journals: 20 } },
    { id: 'talent25', text: 'Choose 25 hero talents', stat: 'talents', n: 25, reward: { starglass: 200 } },
    { id: 'talentFull', text: 'Give a hero all five talents', stat: 'talentFull', n: 1, reward: { shard_epic: 1 } },
    { id: 'derby1', text: 'Win a Camel Derby race', stat: 'derbyWins', n: 1, reward: { starglass: 60 } },
    { id: 'derby25', text: 'Run 25 Camel Derby races', stat: 'derbyRaces', n: 25, reward: { treats: 20, starglass: 100 } },
    { id: 'derbyCrown', text: 'Win the Desert Crown', stat: 'derbyCrown', n: 1, reward: { shard_legendary: 1 } },
    { id: 'derbyMax', text: 'Train a racing camel stat to Lv 20', stat: 'derbyTop', n: 20, reward: { beacons: 2 } },
    { id: 'gift1', text: 'Send a gift to a rival keep', stat: 'gifts', n: 1, reward: { starglass: 30 } },
    { id: 'pact1', text: 'Sign a pact with a rival keep', stat: 'pacts', n: 1, reward: { starglass: 150 } },
    { id: 'pact3', text: 'Hold three pacts at once', stat: 'pactMost', n: 3, reward: { beacons: 3 } },
    { id: 'feud1', text: 'Win a raid against a keep in a feud with you', stat: 'feudWins', n: 1, reward: { whetstone: 2 } },
    { id: 'dry1', text: 'Come through a Dry Season', stat: 'drySeasons', n: 1, reward: { starglass: 50 } },
    { id: 'dryA', text: 'Earn an A in three Dry Seasons', stat: 'dryA', n: 3, reward: { beacons: 2 } },
    { id: 'cistern5', text: 'Dig five deep cisterns', stat: 'cisterns', n: 5, reward: { starglass: 150 } },
    { id: 'journey1', text: 'Send heroes on a Far Journey', stat: 'journeys', n: 1, reward: { journals: 20 } },
    { id: 'journey50', text: 'Bring 50 Far Journeys home', stat: 'journeysHome', n: 50, reward: { starglass: 300, shard_epic: 1 } },
    { id: 'journey4', text: 'Bring a four-star Far Journey home', stat: 'journey4', n: 1, reward: { beacons: 2 } },
    { id: 'charter1', text: 'Grant a building its charter', stat: 'charters', n: 1, reward: { starglass: 50 } },
    { id: 'charter8', text: 'Grant charters to eight kinds of building', stat: 'chartered', n: 8, reward: { beacons: 2 } },
    { id: 'cook1', text: 'Cook a dish at the Cookfire', stat: 'cooked', n: 1, reward: { food: 2 } },
    { id: 'cook50', text: 'Cook 50 dishes', stat: 'cooked', n: 50, reward: { starglass: 200 } },
    { id: 'banquet', text: 'Serve a Rain Koi Banquet', stat: 'banquets', n: 1, reward: { beacons: 2 } },
    { id: 'spar4', text: 'Seat four heroes in the Sparring Ring', stat: 'sparSeated', n: 4, reward: { journals: 40 } },
    { id: 'arts3', text: 'Learn all three Breath Arts', stat: 'artsOpen', n: 3, reward: { starglass: 60 } },
    { id: 'stars30', text: 'Win 30 stage stars', stat: 'stageStars', n: 30, reward: { journals: 40 } },
    { id: 'stars150', text: 'Win 150 stage stars', stat: 'stageStars', n: 150, reward: { starglass: 100 } },
    { id: 'stars300', text: 'Win 300 stage stars', stat: 'stageStars', n: 300, reward: { starglass: 200, beacons: 2 } },
    { id: 'starfull20', text: 'Take all three stars on 20 stages', stat: 'starFull', n: 20, reward: { starglass: 60 } },
    { id: 'charm3', text: 'Have three heroes wear relic charms', stat: 'charmsWorn', n: 3, reward: { trowel: 10 } },
    { id: 'charm10', text: 'Raise a relic charm to Lv 10', stat: 'charmTop', n: 10, reward: { starglass: 300, charge: 2 } },
    { id: 'lev1', text: 'Attack the Sand Leviathan', stat: 'levAttacks', n: 1, reward: { whetstone: 3 } },
    { id: 'levtop3', text: 'Finish a Leviathan hunt in the top 3', stat: 'levTop3', n: 1, reward: { starglass: 200, beacons: 2 } },
    { id: 'lev20', text: 'See 20 Leviathan hunts through', stat: 'levHunts', n: 20, reward: { shard_legendary: 1 } },
    { id: 'kin1', text: 'Form a hero kinship', stat: 'kinTop', n: 1, reward: { beacons: 2 } },
    { id: 'kin5', text: 'Raise a hero kinship to Lv 5', stat: 'kinTop', n: 5, reward: { shard_legendary: 1 } },
    { id: 'kinfight', text: 'Fight 50 battles with a kinship in the squad', stat: 'kinFought', n: 50, reward: { starglass: 200 } },
    { id: 'relic1', text: 'Dig up a relic in the Buried City', stat: 'relics', n: 1, reward: { trowel: 5 } },
    { id: 'layer10', text: 'Reach layer 10 of the Buried City', stat: 'digLayer', n: 10, reward: { starglass: 200, charge: 2 } },
    { id: 'grand25', text: 'Dig up 25 grand relics', stat: 'grandRelics', n: 25, reward: { shard_legendary: 1 } },
    { id: 'decree10', text: "Give 10 Warden's Decrees", stat: 'decrees', n: 10, reward: { starglass: 100 } },
    { id: 'decree100', text: "Give 100 Warden's Decrees", stat: 'decrees', n: 100, reward: { starglass: 300, speed60: 2 } },
    { id: 'decreeAll', text: 'Have four decrees in force at once', stat: 'decreeMost', n: 4, reward: { beacons: 2 } },
    { id: 'outpost1', text: 'Raise an outpost on the Dunes', stat: 'outposts', n: 1, reward: { starglass: 100 } },
    { id: 'outpost4', text: 'Hold four outposts at once', stat: 'outpostsHeld', n: 4, reward: { beacons: 2 } },
    { id: 'outpostDef', text: 'Beat off 25 raids on your outposts', stat: 'outpostDefs', n: 25, reward: { shard_legendary: 1 } },
    { id: 'hall25', text: 'Reach the top 25 of the Hall of Wardens', stat: 'hallClimb', n: 26, reward: { starglass: 100 } },
    { id: 'hall10', text: 'Reach the top 10 of the Hall of Wardens', stat: 'hallClimb', n: 41, reward: { beacons: 2 } },
    { id: 'hall1', text: 'Stand first in the Hall of Wardens', stat: 'hallClimb', n: 50, reward: { shard_legendary: 1 } },
    { id: 'awaken1', text: 'Awaken a hero', stat: 'awakened', n: 1, reward: { starglass: 150 } },
    { id: 'awaken5', text: 'Awaken a hero to A5', stat: 'awakenTop', n: 5, reward: { shard_legendary: 1 } },
    { id: 'awaken15', text: 'Awaken heroes 15 times', stat: 'awakened', n: 15, reward: { beacons: 3 } },
    { id: 'clash1', text: 'Win a Wadi Clash', stat: 'clashWins', n: 1, reward: { starglass: 100 } },
    { id: 'clash25', text: 'Win 25 Wadi Clashes', stat: 'clashWins', n: 25, reward: { shard_legendary: 1 } },
    { id: 'clashGold', text: 'Reach the Gold league in the Wadi Clash', stat: 'clashTop', n: 3, reward: { beacons: 2 } },
    { id: 'clashTop', text: 'Reach the Rainwyrm league in the Wadi Clash', stat: 'clashTop', n: 5, reward: { shard_legendary: 1 } },
    { id: 'clashSweep', text: 'Hold all seven points of the wadi at once', stat: 'clashSweep', n: 1, reward: { beacons: 2 } },
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
    // raids: rain when they arrive weakens them; boiling water poured from the walls (quarter-crates of
    // water, scaled) steadies the defenders
    raids: { fromWyrm: 5, every: [900, 1300], warn: 90, rainWeaken: 0.2, pour: { water: 3 }, pourBonus: 0.2 },
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
