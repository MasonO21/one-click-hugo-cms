/*
 * Kindlehold content tables.
 * Every number a designer would want to tune lives here; the game scripts only read it.
 * Timers and production run ~30x faster than a live-service version would, so the
 * whole game can be played through in a handful of evenings.
 */
'use strict';

const DATA = {
  version: '1.0.0',
  saveKey: 'kindlehold.save.v1',
  offline: { capSeconds: 4 * 3600, efficiency: 0.25 },
  // RevenueCat public SDK key for the App Store build (see NATIVE.md). Empty = simulated store.
  revenueCatApiKey: '',
  // Where PRIVACY.md is hosted (required by the App Store). Shown in Settings when set.
  privacyUrl: '',

  start: {
    res: { wood: 300, food: 200, coal: 150, iron: 0 },
    starglass: 300,
    beacons: 3,
    journals: 10,
    survivors: 6,
    heroes: ['bram', 'pell'],
    levels: { hearth: 1, shelter1: 1, woodcutter: 1, hunter: 1 },
    wyrmName: 'Cinder',
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
    maxLevel: 15,
    stages: [
      { from: 1, name: 'Hatchling', size: 0.62, line: 'small, hungry and very curious' },
      { from: 3, name: 'Whelp', size: 0.76, line: "has unfurled its wings. Its warmth now reaches the edge of the hold." },
      { from: 5, name: 'Drake', size: 0.9, line: 'has become a Drake, and the frost backs away from the walls.' },
      { from: 7, name: 'Firewyrm', size: 1.03, line: 'glows from within. The survivors say the nights feel shorter.' },
      { from: 9, name: 'Elder Hearthwyrm', size: 1.15, line: 'has become an Elder Hearthwyrm. The old songs speak of wyrms like this one.' },
      { from: 12, name: 'Ascended Hearthwyrm', size: 1.25, line: 'has ascended. Choose the fire it will carry.' },
      { from: 15, name: 'Primordial Hearthwyrm', size: 1.34, line: 'blazes like a small sun. The Heart of Winter can feel it from here.' },
    ],
    heat: (L) => 16 + 3.5 * L,
    burn: (L) => 0.3 + 0.3 * L,
    blaze: {
      low: { name: 'Banked', heat: 0.6, burn: 0.5 },
      steady: { name: 'Steady', heat: 1, burn: 1 },
      roaring: { name: 'Roaring', heat: 1.45, burn: 2 },
    },
    // Wyrm's Breath: at the start of every battle the wyrm scorches this share of the foe's health.
    breath: (L) => 0.012 * L,
  },
  ascension: {
    level: 12,
    branches: {
      sunforge: { name: 'Sunforge', color: '#ffd27a', desc: '+10% production of every resource.', crest: '#fff1b8' },
      rimeward: { name: 'Rimeward', color: '#9fe3ff', desc: '+6°C town warmth, and storms are sighted 60s sooner.', crest: '#e0f7ff' },
      stormheart: { name: 'Stormheart', color: '#ff6a3c', desc: "Wyrm's Breath scorches twice as hard and squads deal +8% damage.", crest: '#ffb38a' },
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
      prod: 'iron', perWorker: 0.2,
      desc: 'Iron for lances, tools and the upper levels of every building.',
    },
    infirmary: {
      name: 'Infirmary', cost: { wood: 120, coal: 40 }, time: 12, growth: 1.75,
      desc: 'Herbalists nurse the frostbitten back to work.',
    },
    barracks: {
      name: 'Barracks', cost: { wood: 150, food: 100 }, time: 15, growth: 1.75,
      desc: 'Trains Shieldguards, Frostbows and Sled Lancers. More levels mean bigger marches and stronger troops.',
    },
    watchtower: {
      name: 'Watchtower', cost: { wood: 180, coal: 60, iron: 30 }, time: 18, growth: 1.75,
      desc: 'Lookouts read the sky and the snowfield. Each level sees weather and raiders further ahead and steadies your defenders.',
    },
    archive: {
      name: 'Archive of Thaw', cost: { wood: 250, coal: 120, iron: 60 }, time: 25, growth: 1.75,
      desc: 'Scholars piece together what the old world knew. Unlocks research.',
    },
    hall: {
      name: 'Kindred Hall', cost: { wood: 220, food: 120 }, time: 20, growth: 1.75,
      desc: 'Seat of your Kindred. Each level lets more members help your upgrades and lets you donate more often.',
    },
    storehouse: {
      name: 'Storehouse', cost: { wood: 260, coal: 100, iron: 40 }, time: 20, growth: 1.75,
      desc: 'Thick stone vaults. Resources up to the protected amount can never be stolen by raiders.',
      protect: (L) => Math.round(400 * Math.pow(L, 1.7)),
    },
  },
  ironShareFrom: 4, // levels >= this also cost iron (20% of the wood cost)
  lateLevel: 10, // past this level costs and timers grow more gently
  lateCostGrowth: 1.45,
  buildTimeGrowth: 1.42,
  lateTimeGrowth: 1.12,
  workerSlots: (L) => 3 + L,
  workerGrowth: 0.15, // per-worker output gain per building level

  // Fixed plots around the nest, front (bottom of screen) first, going clockwise.
  plots: [
    { id: 'coalpit', type: 'coalpit', unlock: 1 },
    { id: 'woodcutter', type: 'woodcutter', unlock: 1 },
    { id: 'shelter1', type: 'shelter', unlock: 1 },
    { id: 'infirmary', type: 'infirmary', unlock: 2 },
    { id: 'storehouse', type: 'storehouse', unlock: 5 },
    { id: 'archive', type: 'archive', unlock: 4 },
    { id: 'watchtower', type: 'watchtower', unlock: 3 },
    { id: 'hall', type: 'hall', unlock: 4 },
    { id: 'barracks', type: 'barracks', unlock: 2 },
    { id: 'shelter2', type: 'shelter', unlock: 2 },
    { id: 'hunter', type: 'hunter', unlock: 1 },
    { id: 'ironmine', type: 'ironmine', unlock: 3 },
  ],
  hearthReqs: (to) => {
    if (to < 2) return [];
    const r = [{ plot: 'coalpit', lvl: to - 1 }, { plot: 'shelter1', lvl: to - 1 }];
    if (to >= 5) r.push({ plot: 'ironmine', lvl: to - 2 });
    if (to >= 8) r.push({ plot: 'storehouse', lvl: to - 3 });
    if (to >= 11) r.push({ plot: 'barracks', lvl: to - 2 });
    if (to >= 13) r.push({ plot: 'archive', lvl: to - 4 });
    return r;
  },

  // ---------- Research ----------
  techs: [
    { id: 'insulation', name: 'Hide-Lined Walls', desc: '+2°C town warmth per level', cost: { wood: 200, iron: 40 }, time: 20 },
    { id: 'axes', name: 'Bone Saws', desc: '+12% wood per level', cost: { wood: 150, food: 100 }, time: 15 },
    { id: 'traps', name: 'Snare Lines', desc: '+12% food per level', cost: { wood: 150, coal: 60 }, time: 15 },
    { id: 'seams', name: 'Deep Seams', desc: '+12% coal per level', cost: { wood: 180, food: 120 }, time: 18 },
    { id: 'smelt', name: 'Bellows Smelting', desc: '+12% iron per level', cost: { wood: 220, coal: 150 }, time: 20 },
    { id: 'medicine', name: 'Willowbark Tinctures', desc: '+30% healing per level', cost: { food: 200, coal: 80 }, time: 18 },
    { id: 'drills', name: 'Shield Drills', desc: '+6% troop attack and defense per level', cost: { food: 250, iron: 60 }, time: 25 },
    { id: 'horns', name: 'Long Horns', desc: '+30s weather and raider warning per level', cost: { wood: 200, iron: 30 }, time: 18 },
    { id: 'sledges', name: 'Freight Sledges', desc: '+10% gathering speed and load per level', cost: { wood: 260, iron: 50 }, time: 22 },
    { id: 'tactics', name: 'Hero Tactics', desc: '+5% hero attack, defense and health per level', cost: { food: 300, iron: 80 }, time: 28 },
  ],
  techMaxLevel: 10,
  techGrowth: 1.65,
  techTimeGrowth: 1.5,

  // ---------- Troops ----------
  troops: {
    guard: { name: 'Shieldguards', atk: 1.5, def: 3, hp: 25, cost: { food: 4, wood: 2 } },
    bow: { name: 'Frostbows', atk: 3, def: 1.2, hp: 15, cost: { food: 3, wood: 4 } },
    lancer: { name: 'Sled Lancers', atk: 2.5, def: 2, hp: 20, cost: { food: 5, iron: 1 }, needs: 'ironmine' },
  },
  trainSecondsPerUnit: 0.5,
  troopLevelBonus: 0.12, // troops get this much stronger (compounding) per Barracks level past 1
  marchCap: (L) => (L ? 30 + 25 * L : 0),
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
    gather: { plot: 'watchtower', label: (v) => `+${v}% gathering speed` },
  },
  heroes: [
    { id: 'sigrun', name: 'Sigrun Ashmantle', rarity: 'legendary', cls: 'guard', hue: 14,
      title: 'Shield of the Last Caravan', steward: { kind: 'heat', val: 3 },
      skill: { name: 'Ember Bulwark', desc: 'Your side takes {dr} less damage.', fx: { dr: 0.15 } },
      bio: 'She walked three hundred survivors out of the Grey Cities with a shield and a lantern.' },
    { id: 'kael', name: 'Kael Vire', rarity: 'legendary', cls: 'lancer', hue: 200,
      title: 'Rider of the Rimeway', steward: { kind: 'train', val: 30 },
      skill: { name: 'Avalanche Charge', desc: 'Opening strike deals {burst} extra damage.', fx: { burst: 0.45 } },
      bio: 'His dog teams are the only thing faster than a whiteout.' },
    { id: 'mireille', name: 'Mireille Frost-Eye', rarity: 'legendary', cls: 'bow', hue: 280,
      title: 'Sees Through Any Whiteout', steward: { kind: 'food', val: 25 },
      skill: { name: 'Hailstorm Volley', desc: 'Your side deals {atk} more damage.', fx: { atk: 0.18 } },
      bio: 'Lost an eye to the frost and swears the other one sees better for it.' },
    { id: 'ondrak', name: 'Ondrak the Unburnt', rarity: 'legendary', cls: 'guard', hue: 30,
      title: 'Wyrm-Whisperer', steward: { kind: 'coal', val: 25 },
      skill: { name: 'Hearthbond', desc: "Restores {heal} of your side's health each round.", fx: { heal: 0.06 } },
      bio: 'Raised by the last wyrm-keepers. The Hearthwyrm purrs when he walks past.' },
    { id: 'astrid', name: 'Astrid Dawnbreaker', rarity: 'legendary', cls: 'lancer', hue: 45,
      title: 'Herald of the Thaw', steward: { kind: 'gather', val: 40 },
      skill: { name: 'First Light', desc: 'Opening strike deals {burst} extra damage.', fx: { burst: 0.55 } },
      bio: 'Swears she has seen the sun come back once, for a single morning, far to the south.' },
    { id: 'vesna', name: 'Vesna Coldiron', rarity: 'legendary', cls: 'bow', hue: 175,
      title: 'Huntress of the Glass Sea', steward: { kind: 'iron', val: 25 },
      skill: { name: 'Glasspiercer', desc: "Ignores {pierce} of the enemy's defense.", fx: { pierce: 0.3 } },
      bio: 'Her arrowheads are chipped from the ice of the Glass Sea. They do not break.' },
    { id: 'bram', name: 'Bram Coalhand', rarity: 'epic', cls: 'guard', hue: 25,
      title: 'Pitboss of Blackseam', steward: { kind: 'coal', val: 15 },
      skill: { name: 'Hold the Seam', desc: 'Your side takes {dr} less damage.', fx: { dr: 0.08 } },
      bio: 'Thirty years underground. Says the cold up here is the easy part.' },
    { id: 'tove', name: 'Tove Brightneedle', rarity: 'epic', cls: 'bow', hue: 330,
      title: 'Stitcher of Warm Furs', steward: { kind: 'heat', val: 2 },
      skill: { name: 'Needle Rain', desc: 'Your side deals {atk} more damage.', fx: { atk: 0.1 } },
      bio: 'Her coats have saved more lives than any wall.' },
    { id: 'oskar', name: 'Oskar Rimehart', rarity: 'epic', cls: 'lancer', hue: 190,
      title: 'Dogsled Captain', steward: { kind: 'wood', val: 15 },
      skill: { name: 'Sled Charge', desc: 'Opening strike deals {burst} extra damage.', fx: { burst: 0.25 } },
      bio: 'Hauls timber by day and raiders by night.' },
    { id: 'yara', name: 'Yara Saltwind', rarity: 'epic', cls: 'bow', hue: 160,
      title: 'Huntress of the Drifts', steward: { kind: 'food', val: 15 },
      skill: { name: 'Pinning Shot', desc: 'Your side deals {atk} more damage.', fx: { atk: 0.1 } },
      bio: 'Tracks a snow hare across a frozen lake in the dark.' },
    { id: 'rurik', name: 'Rurik Ashfall', rarity: 'epic', cls: 'guard', hue: 0,
      title: 'Raid Breaker', steward: { kind: 'train', val: 20 },
      skill: { name: 'Iron Wall', desc: 'Your side takes {dr} less damage.', fx: { dr: 0.1 } },
      bio: 'Held the east gate alone for a night. Does not like to talk about it.' },
    { id: 'ilse', name: 'Ilse Whisperwind', rarity: 'epic', cls: 'lancer', hue: 250,
      title: 'Courier of the Drifts', steward: { kind: 'gather', val: 25 },
      skill: { name: 'Slipstream', desc: "Ignores {pierce} of the enemy's defense.", fx: { pierce: 0.15 } },
      bio: 'Carries letters between holds that have never met. Reads none of them. Probably.' },
    { id: 'gunnar', name: 'Gunnar Two-Axe', rarity: 'rare', cls: 'guard', hue: 40,
      title: 'Lumber Boss', steward: { kind: 'wood', val: 10 },
      skill: { name: 'Stubborn', desc: 'Your side takes {dr} less damage.', fx: { dr: 0.05 } },
      bio: 'One axe for trees. The other one, he says, is for emergencies.' },
    { id: 'pell', name: 'Pell the Trapper', rarity: 'rare', cls: 'bow', hue: 95,
      title: 'Snare Setter', steward: { kind: 'food', val: 10 },
      skill: { name: 'Quick Draw', desc: 'Opening strike deals {burst} extra damage.', fx: { burst: 0.15 } },
      bio: "Knows every rabbit run within a day's walk." },
    { id: 'hedda', name: 'Hedda Willowbark', rarity: 'rare', cls: 'guard', hue: 120,
      title: 'Hold Herbalist', steward: { kind: 'heal', val: 25 },
      skill: { name: 'Poultice', desc: "Restores {heal} of your side's health each round.", fx: { heal: 0.03 } },
      bio: 'Brews willowbark tea strong enough to wake the dead. Nearly has.' },
    { id: 'lio', name: 'Lio Sparrow', rarity: 'rare', cls: 'lancer', hue: 220,
      title: 'Scout of the Ridge', steward: { kind: 'iron', val: 10 },
      skill: { name: 'Flank', desc: 'Your side deals {atk} more damage.', fx: { atk: 0.06 } },
      bio: 'Fourteen years old and already the best scout in the hold.' },
    { id: 'tomas', name: 'Tomas Kettle', rarity: 'rare', cls: 'bow', hue: 60,
      title: 'Camp Cook', steward: { kind: 'food', val: 10 },
      skill: { name: 'Hot Stew', desc: "Restores {heal} of your side's health each round.", fx: { heal: 0.02 } },
      bio: 'Fights with a crossbow, a ladle, and opinions about seasoning.' },
    { id: 'mara', name: 'Mara Flint', rarity: 'rare', cls: 'lancer', hue: 15,
      title: 'Sparkwright', steward: { kind: 'heat', val: 2 },
      skill: { name: 'Spark Lance', desc: 'Opening strike deals {burst} extra damage.', fx: { burst: 0.15 } },
      bio: 'Can light a fire in a blizzard with wet tinder. Has bet on it. Has won.' },
  ],
  heroLevelCapPerStar: 10,
  heroCapPerHearth: 5, // each Hearthwyrm level past 9 raises every hero's level cap by this much
  heroMaxStars: 5,
  shardsPerDupe: { rare: 10, epic: 15, legendary: 25 }, // shards a duplicate recruit gives; each star costs 10 x current stars
  skillPerStar: 0.2, // hero skills grow 20% stronger per star past the first

  // ---------- Recruitment ----------
  recruit: {
    odds: { legendary: 0.03, epic: 0.17, rare: 0.8 },
    pity: 40, // a Legendary is guaranteed within this many pulls
    firstPull: 'oskar', // tutorial pull fills out the third troop class
    featuredShare: 0.5, // half of Legendary results are the featured hero (it rotates each event)
    singleCost: 150,
    tenCost: 1350,
  },

  // ---------- Expedition ----------
  chapters: [
    { from: 1, name: 'Whitepine Edge', foes: [['Frost Wolves', 'lancer'], ['Starving Raiders', 'guard'], ['Ice Elk Herd', 'lancer'], ['Raider Archers', 'bow']],
      story: 'The pines at the edge of the hold still stand, frozen mid-sway. Wolves hunt between them, and so do worse things. Clear the edge and the woodcutters can work in peace.' },
    { from: 11, name: 'The Hollow Drifts', foes: [['Snow Wraiths', 'bow'], ['Ice Crawlers', 'guard'], ['Frozen Legion', 'guard'], ['Drift Stalkers', 'lancer']],
      story: 'Beyond the pines the snow is hollow underneath. Things move in the tunnels, and the scouts swear the drifts sing at night.' },
    { from: 21, name: "Titan's Reach", foes: [['Rime Golems', 'guard'], ['Hailstorm Harpies', 'bow'], ['Winter Cultists', 'lancer'], ['Shard Hounds', 'lancer']],
      story: 'Footprints the size of houses lead north. The old songs say whatever made them is the reason the sun went grey.' },
    { from: 31, name: 'The Glass Sea', foes: [['Shardback Crabs', 'guard'], ['Mirror Wraiths', 'bow'], ['Glass Serpents', 'lancer'], ['Salt Reavers', 'lancer']],
      story: "The Titan's fall cracked the old frozen sea. Under the glass, ships still float in the dark water with their lanterns lit." },
    { from: 41, name: 'The Sunken Spires', foes: [['Bell Cultists', 'bow'], ['Spire Sentinels', 'guard'], ['Drowned Riders', 'lancer'], ['Choir of Rime', 'bow']],
      story: 'A drowned city, its bell towers jutting out of the ice. Somebody down there is still ringing the bells.' },
    { from: 51, name: 'Heart of Winter', foes: [["Winter's Hounds", 'lancer'], ['Hollow Knights', 'guard'], ['Starless Archers', 'bow'], ['Frozen Seraphs', 'bow']],
      story: 'At the end of every road lies the source of the cold: a heart of black ice the size of a mountain, beating once an hour. Your wyrm can feel it. It can feel your wyrm.' },
    { from: 61, name: 'The Frostline', foes: [['Rimeborn Host', 'guard'], ['Frostline Riders', 'lancer'], ['Pale Archers', 'bow'], ['Shard Titans', 'guard']],
      story: 'The Heart is broken, but its frost still clings to the far north. Push the Frostline back as far as your hold can reach.' },
  ],
  bosses: {
    5: ['Rime Alpha', 'lancer'], 10: ['Glacier Bear', 'guard'], 15: ['Hollow Matron', 'bow'],
    20: ['Crystal Mammoth', 'guard'], 25: ['The Pale Herald', 'bow'], 30: ['The Frost Titan', 'guard'],
    35: ['Shatterjaw Leviathan', 'lancer'], 40: ['The Rime Queen', 'bow'], 45: ['The Drowned Bellringer', 'guard'],
    50: ['Spire Colossus', 'guard'], 55: ['The Hollow King', 'lancer'], 60: ['The Heart of Winter', 'guard'],
  },
  finalStage: 60, // beating this ends the story; stages past it are the endless Frostline
  // stage n foe: base x growth^(n-1) through stage 30, then gentler late growth to 60, then the endless curve
  enemy: { atk: 72, def: 42, hp: 820, gAtk: 1.13, gDef: 1.12, gHp: 1.14, lateFrom: 30, lAtk: 1.027, lDef: 1.022, lHp: 1.032, endAtk: 1.03, endDef: 1.025, endHp: 1.035, boss: 1.5 },
  maxRounds: 12,
  patrolCapMinutes: 120,
  ending: {
    title: 'The Thaw',
    lines: [
      'The Heart of Winter cracks like river ice in spring, and then, all at once, it breaks.',
      'For the first time in a generation, water drips from the eaves of the hold. The children have never heard the sound before. They stand in the doorways and listen.',
      "It isn't spring yet. The Frostline still clings to the far north. But the sky is a little less grey than it was yesterday.",
      '{wyrm} curls around the hearth and sleeps a long, warm sleep.',
    ],
    reward: { starglass: 2000, beacons: 10, skin: 'dawnfire' },
  },

  // ---------- Chapter quests ----------
  // check(S) returns true when done. go: 'plot:<id>' | 'tab:<tab>' | 'sheet:<kind>'
  quests: [
    { text: 'Build the Coal Pit. The Hearthwyrm is hungry.', go: 'plot:coalpit', check: (S) => S.lv.coalpit >= 1, reward: { coal: 150 } },
    { text: "Upgrade the Hunter's Lodge to Lv 2", go: 'plot:hunter', check: (S) => S.lv.hunter >= 2, reward: { food: 150 } },
    { text: 'Upgrade the Coal Pit to Lv 2', go: 'plot:coalpit', check: (S) => S.lv.coalpit >= 2, reward: { wood: 200 } },
    { text: 'Grow the Hearthwyrm to Lv 2', go: 'plot:hearth', check: (S) => S.lv.hearth >= 2, reward: { beacons: 2, starglass: 100 } },
    { text: 'Pet your Hearthwyrm', go: 'plot:hearth', check: (S) => S.stats.pets >= 1, reward: { journals: 10 } },
    { text: 'Build the Infirmary', go: 'plot:infirmary', check: (S) => S.lv.infirmary >= 1, reward: { journals: 15 } },
    { text: 'Recruit a hero at the Beacon', go: 'tab:recruit', check: (S) => S.stats.pulls >= 1, reward: { journals: 20 } },
    { text: 'Raise any hero to Lv 3', go: 'tab:heroes', check: (S) => Object.values(S.heroes).some((h) => h.lvl >= 3), reward: { wood: 300, food: 200 } },
    { text: 'Clear Expedition stage 2', go: 'tab:expedition', check: (S) => S.stage > 2, reward: { starglass: 80 } },
    { text: 'Build the Barracks', go: 'plot:barracks', check: (S) => S.lv.barracks >= 1, reward: { food: 300 } },
    { text: 'Train 20 troops', go: 'plot:barracks', check: (S) => S.stats.trained >= 20, reward: { journals: 20 } },
    { text: 'Send a gathering march out on the Snowfield', go: 'tab:world', check: (S) => S.stats.gathers >= 1, reward: { wood: 400, speed5: 1 } },
    { text: 'Build a second Hide Shelter', go: 'plot:shelter2', check: (S) => S.lv.shelter2 >= 1, reward: { wood: 400 } },
    { text: 'Grow the Hearthwyrm to Lv 3', go: 'plot:hearth', check: (S) => S.lv.hearth >= 3, reward: { beacons: 2, coal: 300 } },
    { text: 'Build the Iron Mine', go: 'plot:ironmine', check: (S) => S.lv.ironmine >= 1, reward: { iron: 100 } },
    { text: 'Build the Watchtower', go: 'plot:watchtower', check: (S) => S.lv.watchtower >= 1, reward: { starglass: 100 } },
    { text: 'Explore a ruin on the Snowfield', go: 'tab:world', check: (S) => S.stats.ruins >= 1, reward: { journals: 25 } },
    { text: 'Clear Expedition stage 5', go: 'tab:expedition', check: (S) => S.stage > 5, reward: { beacons: 2 } },
    { text: 'Station a hero as Steward', go: 'tab:heroes', check: (S) => Object.keys(S.stewards).length >= 1, reward: { journals: 30 } },
    { text: 'Grow the Hearthwyrm to Lv 4', go: 'plot:hearth', check: (S) => S.lv.hearth >= 4, reward: { starglass: 150, iron: 200 } },
    { text: 'Build the Kindred Hall', go: 'plot:hall', check: (S) => S.lv.hall >= 1, reward: { food: 500 } },
    { text: 'Join a Kindred', go: 'tab:kindred', check: (S) => !!S.kindred.joined, reward: { beacons: 2, speed15: 1 } },
    { text: 'Build the Archive of Thaw', go: 'plot:archive', check: (S) => S.lv.archive >= 1, reward: { journals: 30 } },
    { text: 'Complete any research', go: 'plot:archive', check: (S) => S.stats.researched >= 1, reward: { beacons: 2 } },
    { text: 'Slay a beast on the Snowfield', go: 'tab:world', check: (S) => S.stats.beasts >= 1, reward: { journals: 30 } },
    { text: 'Donate to your Kindred', go: 'tab:kindred', check: (S) => S.stats.donations >= 1, reward: { starglass: 100 } },
    { text: 'Clear Expedition stage 10', go: 'tab:expedition', check: (S) => S.stage > 10, reward: { starglass: 200 } },
    { text: 'Grow the Hearthwyrm to Lv 5', go: 'plot:hearth', check: (S) => S.lv.hearth >= 5, reward: { beacons: 3 } },
    { text: 'Build the Storehouse', go: 'plot:storehouse', check: (S) => S.lv.storehouse >= 1, reward: { iron: 300 } },
    { text: 'Open a Daily Duties chest', go: 'sheet:duties', check: (S) => S.stats.dutyChests >= 1, reward: { speed15: 2 } },
    { text: 'Shelter 40 survivors', go: 'plot:shelter1', check: (S) => S.pop >= 40, reward: { food: 1500 } },
    { text: 'Grow the Hearthwyrm to Lv 6', go: 'plot:hearth', check: (S) => S.lv.hearth >= 6, reward: { beacons: 3, starglass: 200 } },
    { text: 'Strike the Titan in a Kindred raid', go: 'tab:kindred', check: (S) => S.stats.raidAttacks >= 1, reward: { journals: 60 } },
    { text: 'Clear Expedition stage 15', go: 'tab:expedition', check: (S) => S.stage > 15, reward: { journals: 80 } },
    { text: 'Repel a raider attack on the hold', go: 'plot:watchtower', check: (S) => S.stats.raidsRepelled >= 1, reward: { starglass: 200 } },
    { text: 'Grow the Hearthwyrm to Lv 8', go: 'plot:hearth', check: (S) => S.lv.hearth >= 8, reward: { beacons: 5 } },
    { text: 'Clear Expedition stage 20', go: 'tab:expedition', check: (S) => S.stage > 20, reward: { starglass: 400 } },
    { text: 'Grow the Hearthwyrm to Lv 10', go: 'plot:hearth', check: (S) => S.lv.hearth >= 10, reward: { beacons: 6, shard_epic: 1 } },
    { text: 'Defeat the Frost Titan (stage 30)', go: 'tab:expedition', check: (S) => S.stage > 30, reward: { starglass: 600, shard_legendary: 1 } },
    { text: 'Choose your Hearthwyrm\'s Ascension (Lv 12)', go: 'plot:hearth', check: (S) => !!S.wyrm.element, reward: { beacons: 8 } },
    { text: 'Destroy a Frostfang raider camp', go: 'tab:world', check: (S) => S.stats.camps >= 1, reward: { starglass: 300 } },
    { text: 'Clear Expedition stage 40', go: 'tab:expedition', check: (S) => S.stage > 40, reward: { starglass: 600 } },
    { text: 'Clear Expedition stage 50', go: 'tab:expedition', check: (S) => S.stage > 50, reward: { beacons: 10 } },
    { text: 'Raise the Primordial Hearthwyrm (Lv 15)', go: 'plot:hearth', check: (S) => S.lv.hearth >= 15, reward: { starglass: 1000, shard_legendary: 1 } },
    { text: 'Defeat the Heart of Winter (stage 60)', go: 'tab:expedition', check: (S) => S.stage > 60, reward: { starglass: 1500 } },
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
      [{ coal: 400 }, { speed15: 2 }],
      [{ journals: 15 }, { beacons: 3 }],
      [{ iron: 200 }, { starglass: 250 }],
      [{ speed5: 2 }, { journals: 50 }],
      [{ beacons: 1 }, { beacons: 5 }],
      [{ wood: 1500 }, { shard_epic: 1 }],
      [{ journals: 20 }, { iron: 1000 }],
      [{ food: 1500 }, { beacons: 5 }],
      [{ beacons: 2 }, { starglass: 400 }],
      [{ starglass: 100 }, { speed60: 2 }],
      [{ speed15: 2 }, { skin: 'aurora' }],
      [{ coal: 3000 }, { starglass: 300 }],
      [{ journals: 40 }, { beacons: 5 }],
      [{ beacons: 2 }, { journals: 120 }],
      [{ iron: 2000 }, { shard_epic: 2 }],
      [{ starglass: 150 }, { starglass: 500 }],
      [{ speed60: 1 }, { beacons: 6 }],
      [{ wood: 6000 }, { speed60: 3 }],
      [{ journals: 60 }, { starglass: 500 }],
      [{ beacons: 3 }, { shard_legendary: 1 }],
      [{ food: 6000 }, { journals: 200 }],
      [{ starglass: 200 }, { beacons: 8 }],
      [{ speed60: 2 }, { starglass: 600 }],
      [{ iron: 4000 }, { shard_legendary: 1 }],
      [{ beacons: 4 }, { starglass: 800 }],
      [{ shard_epic: 1 }, { skin: 'ashwake' }],
    ],
  },

  // ---------- Cosmetics (never affect stats) ----------
  skins: {
    hearth: { name: 'Hearth Gold', body: ['#a8431f', '#f0943a'], belly: '#ffd27a', eye: '#fff2b0', fire: ['#ff6a1f', '#ffd27a'], horn: '#f6e3c0' },
    aurora: { name: 'Aurora Scales', body: ['#136f62', '#6fe6c0'], belly: '#c8fff0', eye: '#e6fffa', fire: ['#2fcf9c', '#d6fff4'], horn: '#e8fff8', usd: 4.99, note: 'Also a Ledger Premium reward' },
    obsidian: { name: 'Obsidian Ember', body: ['#17151d', '#4b3a50'], belly: '#ff7a3c', eye: '#ff5a2a', fire: ['#ff3d1f', '#ffb36b'], horn: '#c9b8c8', usd: 6.99 },
    sapphire: { name: 'Glacier Sapphire', body: ['#22449a', '#75b3ff'], belly: '#d6ecff', eye: '#ffffff', fire: ['#4ab0ff', '#e0f4ff'], horn: '#eaf4ff', starglass: 1500, note: 'Earnable with free Starglass' },
    ashwake: { name: 'Ashwake', body: ['#3b3f47', '#9aa3ad'], belly: '#e8e2d6', eye: '#ff9a4a', fire: ['#ff8a3d', '#ffe0b0'], horn: '#f2efe8', note: 'Final Ledger Premium reward', locked: true },
    dawnfire: { name: 'Dawnfire', body: ['#c2185b', '#ffb36b'], belly: '#fff1c7', eye: '#ffffff', fire: ['#ff8fb3', '#fff4c2'], horn: '#fff8e6', note: 'Defeat the Heart of Winter', locked: true },
  },

  // ---------- Store (simulated on the web; StoreKit via RevenueCat in the app) ----------
  shop: [
    { id: 'founder', name: "Founder's Cache", usd: 0.99, once: true, tag: 'Best first buy',
      grants: { starglass: 300, beacons: 5, journals: 30, builder2: 1 },
      desc: '300 Starglass, 5 Beacon Tokens, 30 Field Journals and a permanent second builder.' },
    { id: 'stipend', name: 'Ember Stipend', usd: 4.99, tag: '30 days',
      grants: { starglass: 300, stipend: 30 },
      desc: '300 Starglass now, then 90 Starglass every day you log in for 30 days.' },
    { id: 'ledger', name: 'Ledger Premium', usd: 9.99, once: true, tag: 'Season',
      grants: { ledger: 1 },
      desc: "Unlocks the premium track of the Hearthkeeper's Ledger, including the Aurora Scales and Ashwake wyrm skins." },
    { id: 'growth', name: 'Growth Fund', usd: 14.99, once: true, tag: '6,000 Starglass',
      grants: { growth: 1 },
      desc: 'Pays out Starglass each time your Hearthwyrm reaches Lv 5, 8, 10, 12 and 15. 6,000 in total.' },
    { id: 'stormkit', name: 'Storm Kit', usd: 2.99, daily: true, tag: 'Daily',
      grants: { speed15: 3, crate_coal: 2, beacons: 2 },
      desc: 'Three 15-minute speedups, two coal crates and two Beacon Tokens. Once per day.' },
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
  crateSize: (res, hearthLvl) => Math.round({ wood: 500, food: 450, coal: 350, iron: 150 }[res] * Math.pow(hearthLvl, 1.4)),
  speedupSecondsPerStarglass: 10,
  freeFinishSeconds: 10,

  passXp: { stage: 30, upgrade: 10, research: 20, pull: 5, train10: 1, beast: 15, gather: 10, duty: 5 },

  // ---------- Backpack items ----------
  items: {
    speed1: { name: '1-minute Speedup', kind: 'speed', secs: 60, icon: 'i-clock' },
    speed5: { name: '5-minute Speedup', kind: 'speed', secs: 300, icon: 'i-clock' },
    speed15: { name: '15-minute Speedup', kind: 'speed', secs: 900, icon: 'i-clock' },
    speed60: { name: '1-hour Speedup', kind: 'speed', secs: 3600, icon: 'i-clock' },
    crate_wood: { name: 'Wood Crate', kind: 'crate', res: 'wood', icon: 'i-wood' },
    crate_food: { name: 'Food Crate', kind: 'crate', res: 'food', icon: 'i-food' },
    crate_coal: { name: 'Coal Crate', kind: 'crate', res: 'coal', icon: 'i-coal' },
    crate_iron: { name: 'Iron Crate', kind: 'crate', res: 'iron', icon: 'i-iron' },
    shard_epic: { name: 'Epic Shard Pouch', kind: 'shards', rarity: 'epic', n: 10, icon: 'i-star', desc: 'Pick any Epic hero: recruit them, or add 10 shards if you have them.' },
    shard_legendary: { name: 'Legendary Shard Pouch', kind: 'shards', rarity: 'legendary', n: 10, icon: 'i-star', desc: 'Pick any Legendary hero: recruit them, or add 10 shards if you have them.' },
  },

  // ---------- Daily duties (reset at local midnight) ----------
  duties: [
    { id: 'upgrade', text: 'Finish 2 upgrades', n: 2, pts: 15 },
    { id: 'stage', text: 'Win an expedition battle', n: 1, pts: 10 },
    { id: 'beast', text: 'Slay 2 beasts on the Snowfield', n: 2, pts: 15 },
    { id: 'gather', text: 'Bring home 2 gathering marches', n: 2, pts: 15 },
    { id: 'train', text: 'Train 50 troops', n: 50, pts: 10 },
    { id: 'pull', text: 'Recruit a hero', n: 1, pts: 10 },
    { id: 'donate', text: 'Donate to your Kindred 3 times', n: 3, pts: 10 },
    { id: 'pet', text: 'Pet your Hearthwyrm', n: 1, pts: 5 },
    { id: 'storm', text: 'Ride out a storm with no one falling ill', n: 1, pts: 15 },
    { id: 'patrol', text: 'Collect the patrol cache', n: 1, pts: 5 },
    { id: 'research', text: 'Finish a research', n: 1, pts: 10 },
  ],
  dutyChests: [
    [20, { journals: 20, speed5: 1 }],
    [40, { starglass: 40, crate_wood: 1 }],
    [60, { beacons: 1, speed15: 1 }],
    [80, { starglass: 60, crate_coal: 1, journals: 30 }],
    [100, { beacons: 2, speed60: 1 }],
  ],

  // ---------- Login calendar (one claim per day, cycles every 7 claims) ----------
  login: [
    { beacons: 2 },
    { speed15: 2, journals: 20 },
    { starglass: 100 },
    { crate_iron: 1, journals: 40 },
    { beacons: 3 },
    { speed60: 1, starglass: 100 },
    { shard_epic: 1, beacons: 2 },
  ],

  // ---------- Achievements ----------
  achievements: [
    { id: 'h3', text: 'Raise a Whelp', stat: 'hearth', n: 3, reward: { starglass: 50 } },
    { id: 'h6', text: 'Raise a Drake to Lv 6', stat: 'hearth', n: 6, reward: { starglass: 100 } },
    { id: 'h10', text: 'Raise an Elder Hearthwyrm to Lv 10', stat: 'hearth', n: 10, reward: { starglass: 200 } },
    { id: 'h15', text: 'Raise the Primordial Hearthwyrm', stat: 'hearth', n: 15, reward: { starglass: 400 } },
    { id: 's10', text: 'Clear 10 expedition stages', stat: 'stages', n: 10, reward: { starglass: 50 } },
    { id: 's30', text: 'Clear 30 expedition stages', stat: 'stages', n: 30, reward: { starglass: 150 } },
    { id: 's60', text: 'Clear all 60 expedition stages', stat: 'stages', n: 60, reward: { starglass: 400 } },
    { id: 'f10', text: 'Push the Frostline 10 stages deep', stat: 'stages', n: 70, reward: { starglass: 300 } },
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
    { id: 'raid5', text: 'Repel 5 raids on the hold', stat: 'raidsRepelled', n: 5, reward: { starglass: 200 } },
    { id: 'tech20', text: 'Finish 20 research levels', stat: 'researched', n: 20, reward: { starglass: 150 } },
    { id: 'donate50', text: 'Donate to your Kindred 50 times', stat: 'donations', n: 50, reward: { beacons: 3 } },
    { id: 'titan5', text: 'Help bring down 5 Titan raids', stat: 'raidKills', n: 5, reward: { starglass: 200 } },
    { id: 'thaw1', text: 'Finish first in a Thaw Wars bracket', stat: 'thawWins', n: 1, reward: { starglass: 300 } },
    { id: 'pets30', text: 'Pet your Hearthwyrm 30 times', stat: 'pets', n: 30, reward: { starglass: 100 } },
  ],

  // ---------- Timed events (rotate in game time) ----------
  events: {
    length: 1200,
    rotation: ['ember', 'hunt', 'builder', 'thaw'],
    defs: {
      ember: { name: 'Ember Festival', desc: 'Keep the Hearthwyrm fed. Every second it burns earns a point, two when it roars.',
        tiers: [[300, { coal: 1 }], [700, { speed15: 1 }], [1100, { beacons: 1 }], [1500, { starglass: 150 }]] },
      hunt: { name: 'Beast Hunt', desc: 'Slay beasts on the Snowfield. Each beast is worth 10 points per level.',
        tiers: [[60, { journals: 1 }], [180, { speed15: 1 }], [350, { beacons: 1 }], [600, { starglass: 150 }]] },
      builder: { name: "Builder's Rush", desc: 'Finished upgrades earn 10 points per level, research 5 per level, and every 10 troops trained 1 point.',
        tiers: [[60, { wood: 1 }], [160, { speed15: 1 }], [300, { beacons: 1 }], [480, { starglass: 150 }]] },
      thaw: { name: 'Thaw Wars', desc: 'Everything you do earns points. Climb your bracket against nine rival holds. Brackets are matched by spending, so spenders face spenders.',
        tiers: [[200, { journals: 1 }], [600, { speed15: 1 }], [1200, { beacons: 1 }]],
        ranks: [[1, { starglass: 400, beacons: 3 }], [3, { starglass: 250, beacons: 2 }], [6, { starglass: 120, beacons: 1 }], [10, { starglass: 60 }]] },
    },
    // Event tier rewards written as small numbers are scaled: resources in quarter-crates, journals x (5 + 2 x hearth level).
    thawPoints: { upgrade: 20, stage: 60, beast: 15, gather: 1, research: 30, train: 0.2, pull: 10, raid: 80 },
    thawPace: (L) => 25 + 16 * L, // expected points per minute for an active player, used to build the rival bracket
  },

  // ---------- Kindred (alliance; members are simulated) ----------
  kindred: {
    unlockPlot: 'hall',
    options: [
      { id: 'ashen', name: 'The Ashen Vow', tag: 'ASH', motto: 'No fire left behind.', style: 'Helpful veterans. Lots of build help.', helpMult: 1.3, raidMult: 1, chatty: 0.7 },
      { id: 'lantern', name: 'Lanternfall', tag: 'LNT', motto: 'We light the way north.', style: 'Competitive raiders. Titans fall fast.', helpMult: 0.9, raidMult: 1.35, chatty: 1 },
      { id: 'north', name: 'Northwind Kin', tag: 'NWK', motto: 'Slow roots, deep warmth.', style: 'Relaxed and chatty. Generous with gifts.', helpMult: 1, raidMult: 0.9, chatty: 1.5, giftMult: 1.5 },
    ],
    members: 14,
    techs: [
      { id: 'hearth', name: 'Shared Hearth', desc: '+1°C town warmth per level', max: 10 },
      { id: 'supply', name: 'Supply Lines', desc: '+3% production per level', max: 10 },
      { id: 'banners', name: 'War Banners', desc: '+3% troop attack and defense per level', max: 10 },
      { id: 'hands', name: 'Many Hands', desc: '+3% construction and research speed per level', max: 10 },
      { id: 'scouts', name: 'Snow Scouts', desc: '+5% gathering speed per level', max: 10 },
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
      { id: 'k_coal', name: 'Coal Crate', cost: 100, grants: { crate_coal: 1 } },
      { id: 'k_epic', name: 'Epic Shard Pouch', cost: 1500, grants: { shard_epic: 1 } },
      { id: 'k_legendary', name: 'Legendary Shard Pouch', cost: 4000, grants: { shard_legendary: 1 } },
    ],
    raid: { every: 900, open: 480, attacks: 3, boss: 'Shade of the Frost Titan' },
    raidRewards: [[1, { starglass: 200, beacons: 2 }], [3, { starglass: 140, beacons: 1 }], [7, { starglass: 90, speed15: 1 }], [15, { starglass: 50 }]],
    raidKillReward: { journals: 2, crate_iron: 1, kpoints: 200 },
    quickChat: ['Thanks for the help!', 'Storm incoming. Stoke your fires!', "Who's up for the Titan?", 'Good morning, Kindred!', 'Anyone have tips for the next boss?'],
  },
  names: ['Brannoch', 'Ylva', 'Tamsin', 'Orrin', 'Kesh', 'Liv', 'Halvard', 'Mirela', 'Sorrel', 'Dagny', 'Feodor', 'Ines', 'Calder', 'Runa', 'Pim', 'Aster', 'Gisli', 'Noor', 'Bastian', 'Elka', 'Torvald', 'Wren', 'Signe', 'Cato', 'Hollis', 'Saba', 'Ivo', 'Freya', 'Lumi', 'Rook', 'Agna', 'Jory', 'Nils', 'Petra', 'Odo', 'Marit', 'Sten', 'Vala', 'Ebbe', 'Kaja'],
  holds: ['Emberfall', 'Pinehold', 'Greywatch', 'Saltmarch', 'Coldharbor', 'Rimecross', 'Ashgrove', 'Hollowmere', 'Northlight', 'Frostgate', 'Cinderstead', 'Wolfden', 'Lanternhill', 'Brightwater', 'Stonehearth', 'Kettlewick', 'Ravensgate', 'Duskmoor'],

  // ---------- The Snowfield (world map) ----------
  world: {
    size: 21, // tiles per side; your hold sits in the middle
    sight: (L) => 2 + Math.floor(L * 0.55), // tiles of thawed ground around the hold
    travelPerTile: 5, // seconds of march per tile
    marchSlots: (barracksLvl) => (barracksLvl ? 1 + (barracksLvl >= 5 ? 1 : 0) + (barracksLvl >= 10 ? 1 : 0) : 0),
    // load: units each troop can carry; rate: units per troop per second; cap: per node level
    nodes: {
      wood: { name: 'Timber Stand', load: 15, rate: 0.15, cap: 1500 },
      food: { name: 'Hunting Ground', load: 15, rate: 0.15, cap: 1500 },
      coal: { name: 'Coal Seam', load: 11, rate: 0.11, cap: 1100 },
      iron: { name: 'Iron Vein', load: 7, rate: 0.08, cap: 700 },
    },
    nodeRespawn: 300,
    beasts: [['Frost Wolf Pack', 'lancer'], ['Ice Bear', 'guard'], ['Rime Elk', 'lancer'], ['Snow Wraith', 'bow'], ['Glacier Boar', 'guard'], ['Harpy Flock', 'bow']],
    beastRespawn: 240,
    beastStage: (lvl) => 1 + (lvl - 1) * 4.5, // expedition stage of equal strength
    beastScale: 0.8,
    campStageBonus: 3,
    campScale: 1.25,
    campRespawn: 600,
    raids: { fromHearth: 5, every: [900, 1300], warn: 90 },
  },
  ruins: [
    { id: 'sledge', name: 'Overturned Sledge', text: 'A cargo sledge lies on its side, half buried. Footprints lead off into the pines.',
      choices: [
        { label: 'Dig out the cargo', outcomes: [{ p: 1, text: 'Crates of salted meat and dry kindling, still good.', reward: { food: 3, wood: 2 } }] },
        { label: 'Follow the footprints', outcomes: [
          { p: 0.55, text: 'A frostbitten family huddles in a hollow tree. They follow your troops home.', reward: { survivors: 3 } },
          { p: 0.45, text: 'The tracks vanish in fresh snow. You find a dropped journal.', reward: { journals: 1 } }] },
      ] },
    { id: 'caravan', name: 'Frozen Caravan', text: 'Six wagons frozen in a line, their drivers long gone. The ice groans when anyone walks near.',
      choices: [
        { label: 'Pry open every crate', outcomes: [
          { p: 0.7, text: 'Iron tools and nails, enough to fill a sledge.', reward: { iron: 4 } },
          { p: 0.3, text: 'The ice gives way under the last wagon. Some troops do not come back.', reward: { iron: 2, troopsLost: 0.15 } }] },
        { label: 'Take only what is loose', outcomes: [{ p: 1, text: 'A modest haul, and everyone home safe.', reward: { iron: 1, wood: 1 } }] },
      ] },
    { id: 'observatory', name: 'Old Observatory', text: 'A dome of cracked glass on a hill. Inside, a brass telescope still points at the grey sky.',
      choices: [
        { label: 'Copy the star charts', outcomes: [{ p: 1, text: 'Your scholars will be busy for weeks.', reward: { journals: 2, starglass: 30 } }] },
        { label: 'Salvage the brass', outcomes: [{ p: 1, text: 'Good metal is good metal.', reward: { iron: 3 } }] },
      ] },
    { id: 'bunker', name: 'Sealed Bunker', text: 'A steel door in the hillside, frozen shut. Something knocks on it from the inside. Twice. Then nothing.',
      choices: [
        { label: 'Force the door', outcomes: [
          { p: 0.45, text: 'A pre-Night supply cache, starglass shining in the lamplight.', reward: { starglass: 120 } },
          { p: 0.55, text: 'Empty, apart from something that bolts past your troops into the snow. Several are hurt in the scramble.', reward: { troopsLost: 0.1, journals: 1 } }] },
        { label: 'Knock back and wait', outcomes: [
          { p: 0.6, text: 'Two survivors climb out, blinking. They have been waiting a long time.', reward: { survivors: 2, journals: 1 } },
          { p: 0.4, text: 'No answer. You leave a lantern by the door.', reward: { coal: 1 } }] },
      ] },
    { id: 'chapel', name: 'Ice-Locked Chapel', text: 'Candles stand on the altar of a tiny chapel, wicks still black. The pews are full of snow.',
      choices: [
        { label: 'Light the candles', outcomes: [{ p: 1, text: 'The little room fills with warm light. Your troops come home quietly cheerful, and someone left a token on the altar.', reward: { beacons: 1 } }] },
        { label: 'Take the candles for fuel', outcomes: [{ p: 1, text: 'Tallow burns well.', reward: { coal: 3 } }] },
      ] },
    { id: 'airship', name: 'Wrecked Airship', text: 'The ribs of an airship rise out of a drift like a whale skeleton. The cabin hangs high in the frame.',
      choices: [
        { label: 'Climb to the cabin', outcomes: [
          { p: 0.35, text: "A captain's strongbox, and inside it a hero's letter of introduction.", reward: { shard_epic: 1 } },
          { p: 0.65, text: 'The cabin is empty except for a log book.', reward: { journals: 2 } }] },
        { label: 'Strip the hull', outcomes: [{ p: 1, text: 'Canvas, rope, struts and rivets.', reward: { wood: 3, iron: 2 } }] },
      ] },
    { id: 'den', name: 'Wolf Den', text: 'A den under a fallen spruce. Pups yip inside. The pack is out hunting.',
      choices: [
        { label: 'Leave a gift of meat', outcomes: [{ p: 1, text: 'The pack will remember. Your hunters find fresh trails all week.', reward: { foodCost: 2, journals: 2, starglass: 40 } }] },
        { label: 'Leave them be', outcomes: [{ p: 1, text: 'You mark the den on your maps and walk on.', reward: { journals: 1 } }] },
      ] },
    { id: 'spring', name: 'Hot Spring', text: 'Steam rises from a pool ringed with green moss, the only green for miles.',
      choices: [
        { label: 'Let the troops bathe', outcomes: [{ p: 1, text: 'They come home glowing, and the sick in the hold recover from the stories alone.', reward: { heal: 1, journals: 1 } }] },
        { label: 'Haul back the mineral salts', outcomes: [{ p: 1, text: 'The salts keep meat for months.', reward: { food: 4 } }] },
      ] },
    { id: 'forge', name: 'Abandoned Forge', text: 'A smithy with its roof caved in. The anvil is still here, and a heap of unworked ore.',
      choices: [
        { label: 'Carry back the ore', outcomes: [{ p: 1, text: 'Heavy going, but worth it.', reward: { iron: 3 } }] },
        { label: 'Search the smith\'s quarters', outcomes: [
          { p: 0.5, text: "Drawings of a wyrm, very like yours. Your scholars won't stop talking about it.", reward: { journals: 3 } },
          { p: 0.5, text: 'A purse of starglass under a loose floorboard.', reward: { starglass: 60 } }] },
      ] },
    { id: 'shrine', name: 'Ember Shrine', text: 'A stone ring around a pit of cold ash. Old offerings lie scattered around it: coins, toys, a wyrm carved from bone.',
      choices: [
        { label: 'Leave an offering of coal', outcomes: [{ p: 1, text: 'For a moment the ash glows. Back home, your Hearthwyrm lifts its head and looks north.', reward: { coalCost: 2, beacons: 1, starglass: 50 } }] },
        { label: 'Take the bone wyrm', outcomes: [{ p: 1, text: 'Your Hearthwyrm sniffs it, sneezes, and loves it.', reward: { journals: 2 } }] },
      ] },
    { id: 'scouts', name: 'Lost Scouts', text: 'Three scouts from another hold, lost for days, sheltering in a snow cave.',
      choices: [
        { label: 'Bring them home', outcomes: [{ p: 1, text: 'They decide to stay.', reward: { survivors: 3 } }] },
        { label: 'Trade supplies for their maps', outcomes: [{ p: 1, text: 'Their maps show iron no one has touched in years.', reward: { iron: 3, foodCost: 1 } }] },
      ] },
    { id: 'mine', name: 'Collapsed Mine', text: 'A mine entrance half blocked by rockfall. Cold air breathes out of it.',
      choices: [
        { label: 'Clear the rockfall', outcomes: [
          { p: 0.75, text: 'A seam of coal as thick as a man.', reward: { coal: 5 } },
          { p: 0.25, text: 'The tunnel shifts. Your troops get out, but not all of them.', reward: { coal: 2, troopsLost: 0.12 } }] },
        { label: 'Gather what fell outside', outcomes: [{ p: 1, text: 'Enough to keep the wyrm happy for a day.', reward: { coal: 2 } }] },
      ] },
  ],
};
