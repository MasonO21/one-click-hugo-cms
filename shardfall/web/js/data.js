/* Shardfall Arena — static game data. Every hero, skin and item here is original. */
window.SF = window.SF || {};
(function (SF) {
  SF.WORLD = { w: 3200, h: 1200, laneY: 600, laneHalf: 130, riverX: 1600 };
  SF.TEAM = { BLUE: 0, RED: 1, NEUTRAL: 2 };
  SF.TEAM_COLORS = ['#4fb3ff', '#ff5d6c', '#c9b27a'];

  SF.DIFFICULTY = {
    easy:   { label: 'Easy',   react: 0.55, skill: 0.35, retreat: 0.22, dmg: 0.8,  lead: 0 },
    normal: { label: 'Normal', react: 0.3,  skill: 0.7,  retreat: 0.3,  dmg: 1.0,  lead: 0.15 },
    hard:   { label: 'Hard',   react: 0.16, skill: 1.0,  retreat: 0.34, dmg: 1.12, lead: 0.3 }
  };

  // In-match items. `stats` are flat adds except as/cdr/lifesteal (fractions).
  SF.ITEMS = {
    swift_boots:    { name: 'Swift Boots',      cost: 300,  stats: { ms: 40 },               desc: '+40 move speed',               c: '#8fd3ff' },
    iron_edge:      { name: 'Iron Edge',        cost: 450,  stats: { atk: 20 },              desc: '+20 attack',                   c: '#ffb36b' },
    arcane_tome:    { name: 'Arcane Tome',      cost: 450,  stats: { power: 40 },            desc: '+40 ability power',            c: '#c78bff' },
    stoneplate:     { name: 'Stoneplate',       cost: 600,  stats: { def: 35 },              desc: '+35 defense',                  c: '#b8b8a0' },
    storm_bow:      { name: 'Storm Bow',        cost: 900,  stats: { as: 0.35, atk: 10 },    desc: '+35% attack speed, +10 attack', c: '#7cf0c8' },
    bloodfang:      { name: 'Bloodfang',        cost: 1000, stats: { atk: 30, lifesteal: 0.12 }, desc: '+30 attack, 12% lifesteal', c: '#ff6b7f' },
    tidal_charm:    { name: 'Tidal Charm',      cost: 1000, stats: { power: 60, cdr: 0.15 }, desc: '+60 power, 15% cooldown cut',  c: '#5fb8ff' },
    ember_saber:    { name: 'Ember Saber',      cost: 1150, stats: { atk: 45, cdr: 0.1 },    desc: '+45 attack, 10% cooldown cut', c: '#ff8a3d' },
    titan_heart:    { name: 'Titan Heart',      cost: 1300, stats: { hp: 800, regen: 8 },    desc: '+800 health, +8 regen/s',      c: '#ff9db0' },
    wardens_aegis:  { name: "Warden's Aegis",   cost: 1250, stats: { hp: 450, def: 35 },     desc: '+450 health, +35 defense',     c: '#e3d27a' },
    starfire_codex: { name: 'Starfire Codex',   cost: 1600, stats: { power: 130 },           desc: '+130 ability power',           c: '#ffe27a' },
    reaper_cleaver: { name: 'Reaper Cleaver',   cost: 1700, stats: { atk: 60, as: 0.2 },     desc: '+60 attack, +20% attack speed', c: '#d9e2ff' }
  };

  const B = {
    Fighter:  ['swift_boots', 'iron_edge', 'bloodfang', 'ember_saber', 'titan_heart', 'stoneplate'],
    Mage:     ['swift_boots', 'arcane_tome', 'tidal_charm', 'starfire_codex', 'titan_heart', 'wardens_aegis'],
    Tank:     ['swift_boots', 'stoneplate', 'titan_heart', 'wardens_aegis', 'ember_saber', 'bloodfang'],
    Marksman: ['swift_boots', 'iron_edge', 'storm_bow', 'bloodfang', 'reaper_cleaver', 'wardens_aegis'],
    Assassin: ['swift_boots', 'iron_edge', 'ember_saber', 'reaper_cleaver', 'bloodfang', 'stoneplate'],
    Support:  ['swift_boots', 'arcane_tome', 'wardens_aegis', 'tidal_charm', 'titan_heart', 'stoneplate']
  };

  // Skill `kind` picks the button icon. `ai` tells bots when to use it.
  SF.HEROES = [
    {
      id: 'kaida', name: 'Kaida', title: 'Ember Duelist', role: 'Fighter', shape: 'blade',
      lore: 'A shard-knight whose crystal heart burns hotter with every duel.',
      price: { coins: 0 },
      base: { hp: 840, atk: 64, power: 0, def: 24, ms: 310, range: 105, as: 0.95, regen: 5 },
      grow: { hp: 105, atk: 6, power: 0, def: 3 },
      build: B.Fighter,
      skills: [
        { id: 'flare_step', name: 'Flare Step', cd: 7, range: 270, kind: 'dash', ai: 'enemy', desc: 'Dash forward, scorching every enemy you pass.' },
        { id: 'cinder_whirl', name: 'Cinder Whirl', cd: 9, range: 165, kind: 'nova', ai: 'near', desc: 'Spin a ring of embers that damages and slows nearby enemies.' },
        { id: 'phoenix_verdict', name: 'Phoenix Verdict', cd: 40, range: 430, kind: 'ult', ai: 'execute', needsTarget: true, desc: 'Leap onto an enemy hero. Deals bonus damage based on their missing health; refunds most of the cooldown on a takedown.' }
      ]
    },
    {
      id: 'orin', name: 'Orin', title: 'Tidecaller', role: 'Mage', shape: 'drop', ranged: true,
      lore: 'An abyssal crystal that remembers every ocean it has drowned.',
      price: { coins: 0 },
      base: { hp: 640, atk: 48, power: 40, def: 16, ms: 295, range: 470, as: 0.75, regen: 4 },
      grow: { hp: 82, atk: 3, power: 14, def: 2 },
      build: B.Mage,
      skills: [
        { id: 'riptide_bolt', name: 'Riptide Bolt', cd: 5, range: 680, kind: 'bolt', ai: 'enemy', desc: 'Fire a water bolt that damages and slows the first enemy hit.' },
        { id: 'whirlpool', name: 'Whirlpool', cd: 10, range: 560, kind: 'zone', ai: 'enemy', ground: true, desc: 'After a short delay, a whirlpool erupts, damaging and stunning enemies.' },
        { id: 'leviathan_surge', name: 'Leviathan Surge', cd: 45, range: 820, kind: 'ult', ai: 'enemy', desc: 'Send a colossal wave that crashes through every enemy in a line and knocks them back.' }
      ]
    },
    {
      id: 'sylva', name: 'Sylva', title: 'Galewind Ranger', role: 'Marksman', shape: 'leaf', ranged: true,
      lore: 'A wind-carved splinter that never misses the same target twice.',
      price: { coins: 0 },
      base: { hp: 660, atk: 62, power: 0, def: 16, ms: 300, range: 520, as: 1.0, regen: 4 },
      grow: { hp: 84, atk: 7, power: 0, def: 2 },
      build: B.Marksman,
      skills: [
        { id: 'piercing_gale', name: 'Piercing Gale', cd: 6, range: 820, kind: 'bolt', ai: 'enemy', desc: 'Loose an arrow that pierces through every enemy in a line.' },
        { id: 'tailwind', name: 'Tailwind', cd: 12, range: 0, kind: 'buff', ai: 'self', desc: 'Gain 35% move speed and 60% attack speed for 4 seconds.' },
        { id: 'storm_volley', name: 'Storm Volley', cd: 35, range: 720, kind: 'ult', ai: 'enemy', desc: 'Fire a fan of seven storm arrows.' }
      ]
    },
    {
      id: 'brakka', name: 'Brakka', title: 'Stonewarden', role: 'Tank', shape: 'block',
      lore: 'The mountain shard. It has never taken a step backward.',
      price: { coins: 2500, gems: 248 },
      base: { hp: 1040, atk: 56, power: 0, def: 34, ms: 295, range: 100, as: 0.8, regen: 7 },
      grow: { hp: 135, atk: 4, power: 0, def: 4 },
      build: B.Tank,
      skills: [
        { id: 'boulder_charge', name: 'Boulder Charge', cd: 9, range: 300, kind: 'dash', ai: 'enemy', desc: 'Charge forward and stun the first enemy hero you hit.' },
        { id: 'quake', name: 'Quake', cd: 8, range: 185, kind: 'nova', ai: 'near', desc: 'Slam the ground, damaging and slowing nearby enemies. Scales with max health.' },
        { id: 'granite_bulwark', name: 'Granite Bulwark', cd: 50, range: 230, kind: 'ult', ai: 'fight', desc: 'Shield yourself and nearby allies, and stagger enemies around you.' }
      ]
    },
    {
      id: 'nyx', name: 'Nyx', title: 'Veilblade', role: 'Assassin', shape: 'star',
      lore: 'A shard of the eclipse, seen only in the instant before it strikes.',
      price: { coins: 4000, gems: 388 },
      base: { hp: 720, atk: 70, power: 0, def: 18, ms: 320, range: 100, as: 1.0, regen: 4 },
      grow: { hp: 88, atk: 7, power: 0, def: 2.5 },
      build: B.Assassin,
      skills: [
        { id: 'shadow_lunge', name: 'Shadow Lunge', cd: 7, range: 380, kind: 'dash', ai: 'enemy', needsTarget: true, anyTarget: true, desc: 'Blink behind an enemy and strike.' },
        { id: 'veil', name: 'Veil', cd: 14, range: 0, kind: 'buff', ai: 'self', desc: 'Turn invisible and faster for 3 seconds. Your next attack deals double damage.' },
        { id: 'eclipse', name: 'Eclipse', cd: 40, range: 320, kind: 'ult', ai: 'execute', needsTarget: true, desc: 'Strike an enemy hero three times; the final strike deals bonus damage based on missing health.' }
      ]
    },
    {
      id: 'lumen', name: 'Lumen', title: 'Dawn Oracle', role: 'Support', shape: 'halo', ranged: true,
      lore: 'The first light that ever struck the Shard, still keeping watch.',
      price: { coins: 4000, gems: 388 },
      base: { hp: 700, atk: 44, power: 30, def: 20, ms: 295, range: 450, as: 0.8, regen: 5 },
      grow: { hp: 92, atk: 3, power: 11, def: 3 },
      build: B.Support,
      skills: [
        { id: 'radiant_orb', name: 'Radiant Orb', cd: 5, range: 700, kind: 'bolt', ai: 'enemy', desc: 'Throw an orb of light that damages and slows the first enemy hit.' },
        { id: 'mending_light', name: 'Mending Light', cd: 11, range: 460, kind: 'heal', ai: 'heal', desc: 'Heal yourself and nearby allied heroes.' },
        { id: 'sanctuary', name: 'Sanctuary', cd: 50, range: 420, kind: 'ult', ai: 'fight', ground: true, desc: 'Consecrate an area for 4 seconds: allies inside heal and take less damage, enemies are slowed.' }
      ]
    }
  ];
  SF.HERO = {};
  SF.HEROES.forEach(h => { SF.HERO[h.id] = h; });

  // Skins: c1 = main crystal, c2 = shadow facet, c3 = glow. aura = particle trail shown in matches.
  SF.SKIN_TIERS = {
    Classic:   { color: '#93a0d6', rank: 0 },
    Rare:      { color: '#4fb3ff', rank: 1 },
    Epic:      { color: '#d38cff', rank: 2 },
    Legendary: { color: '#ffc84a', rank: 3 },
    Pass:      { color: '#4fe3d3', rank: 2 }
  };
  SF.SKINS = [
    { id: 'kaida_classic', hero: 'kaida', name: 'Classic', tier: 'Classic', c1: '#ff7a3d', c2: '#8a2b12', c3: '#ffd29a' },
    { id: 'kaida_frost', hero: 'kaida', name: 'Frostbrand', tier: 'Rare', c1: '#8fe0ff', c2: '#1d4f8f', c3: '#e6fbff', aura: 'frost', price: { gems: 288 } },
    { id: 'kaida_solar', hero: 'kaida', name: 'Solar Empress', tier: 'Legendary', c1: '#ffe07a', c2: '#c2410c', c3: '#fff6cf', aura: 'gold', crown: true, price: { gems: 888 } },
    { id: 'orin_classic', hero: 'orin', name: 'Classic', tier: 'Classic', c1: '#3fa3ff', c2: '#123a7a', c3: '#b9e6ff' },
    { id: 'orin_abyss', hero: 'orin', name: 'Abyssal Herald', tier: 'Pass', c1: '#3df2c9', c2: '#0d2f4a', c3: '#c8fff1', aura: 'bubbles', passOnly: true },
    { id: 'orin_coral', hero: 'orin', name: 'Coral Monarch', tier: 'Epic', c1: '#ff8fb1', c2: '#6b1d4a', c3: '#ffe0ea', aura: 'bubbles', price: { gems: 588 } },
    { id: 'sylva_classic', hero: 'sylva', name: 'Classic', tier: 'Classic', c1: '#7be38c', c2: '#1d5a35', c3: '#e3ffd9' },
    { id: 'sylva_autumn', hero: 'sylva', name: 'Autumn Warden', tier: 'Rare', c1: '#ffab4a', c2: '#7a3511', c3: '#ffe7c2', aura: 'leaf', price: { gems: 288 } },
    { id: 'sylva_storm', hero: 'sylva', name: 'Stormcrown', tier: 'Pass', c1: '#a7b8ff', c2: '#2a2f7a', c3: '#f1f4ff', aura: 'storm', crown: true, passOnly: true },
    { id: 'brakka_classic', hero: 'brakka', name: 'Classic', tier: 'Classic', c1: '#b5a487', c2: '#4a3f30', c3: '#f0e6cf' },
    { id: 'brakka_magma', hero: 'brakka', name: 'Magma Bastion', tier: 'Epic', c1: '#ff6a3d', c2: '#3a1410', c3: '#ffd08a', aura: 'embers', price: { gems: 588 } },
    { id: 'nyx_classic', hero: 'nyx', name: 'Classic', tier: 'Classic', c1: '#9b7bff', c2: '#2a1a5e', c3: '#e6dcff' },
    { id: 'nyx_bloodmoon', hero: 'nyx', name: 'Blood Moon', tier: 'Legendary', c1: '#ff4d6a', c2: '#3a0816', c3: '#ffd1da', aura: 'void', crown: true, price: { gems: 888 } },
    { id: 'lumen_classic', hero: 'lumen', name: 'Classic', tier: 'Classic', c1: '#fff1a8', c2: '#9a7a1d', c3: '#ffffff' },
    { id: 'lumen_aurora', hero: 'lumen', name: 'Aurora Saint', tier: 'Epic', c1: '#9effe0', c2: '#3a3a8f', c3: '#ffffff', aura: 'storm', price: { gems: 588 } }
  ];
  SF.SKIN = {};
  SF.SKINS.forEach(s => { SF.SKIN[s.id] = s; });
  SF.skinsFor = id => SF.SKINS.filter(s => s.hero === id);
  SF.defaultSkin = id => id + '_classic';

  // ---- Economy -----------------------------------------------------------
  // Real-money prices are USD tiers that map to App Store price points.
  SF.GEM_PACKS = [
    { id: 'gems_60',   gems: 60,   bonus: 0,    usd: 0.99 },
    { id: 'gems_300',  gems: 300,  bonus: 30,   usd: 4.99 },
    { id: 'gems_680',  gems: 680,  bonus: 70,   usd: 9.99, tag: 'Popular' },
    { id: 'gems_1280', gems: 1280, bonus: 160,  usd: 19.99 },
    { id: 'gems_3280', gems: 3280, bonus: 480,  usd: 49.99 },
    { id: 'gems_6480', gems: 6480, bonus: 1120, usd: 99.99, tag: 'Best value' }
  ];
  SF.OFFERS = {
    starter: { id: 'starter_pack', name: 'Starter Pack', usd: 1.99, once: true,
      rewards: [{ type: 'gems', n: 300 }, { type: 'skin', id: 'kaida_frost' }, { type: 'coins', n: 2000 }] },
    monthly: { id: 'aether_card', name: 'Aether Card', usd: 4.99, days: 30, now: 300, daily: 60 }
  };
  SF.HERO_PRICE_NOTE = 'Heroes can always be unlocked with coins earned by playing.';

  // Chest odds are shown to players in-game (required by App Store guideline 3.1.1).
  SF.CHEST = {
    gemPrice: 120,
    pity: 50,
    table: [
      { w: 40, label: '250 coins',          reward: { type: 'coins', n: 250 } },
      { w: 22, label: '600 coins',          reward: { type: 'coins', n: 600 } },
      { w: 12, label: '30 gems',            reward: { type: 'gems', n: 30 } },
      { w: 18, label: '5 skin shards',      reward: { type: 'fragments', n: 5 } },
      { w: 6,  label: '15 skin shards',     reward: { type: 'fragments', n: 15 } },
      { w: 2,  label: 'Random Epic skin',   reward: { type: 'randomEpic' } }
    ]
  };
  SF.FRAGMENT_COST = { Rare: 60, Epic: 120 };

  SF.PASS = {
    season: 1, name: 'Season 1: Shattered Sky', tiers: 30, xpPerTier: 1000, elitePrice: 688, tierPrice: 75,
    free: t => {
      if (t % 10 === 0) return { type: 'chest', n: 2 };
      if (t % 5 === 0) return { type: 'fragments', n: 10 };
      if (t % 2 === 0) return { type: 'coins', n: 300 };
      return { type: 'coins', n: 150 };
    },
    elite: t => {
      if (t === 1) return { type: 'skin', id: 'orin_abyss' };
      if (t === 30) return { type: 'skin', id: 'sylva_storm' };
      if (t % 5 === 0) return { type: 'gems', n: 70 };
      if (t % 3 === 0) return { type: 'chest', n: 1 };
      return { type: 'fragments', n: 5 };
    }
  };

  SF.DAILY_LOGIN = [
    { type: 'coins', n: 200 }, { type: 'chest', n: 1 }, { type: 'gems', n: 30 }, { type: 'coins', n: 400 },
    { type: 'fragments', n: 10 }, { type: 'coins', n: 600 }, { type: 'gems', n: 80 }
  ];

  SF.MISSIONS = [
    { id: 'play2',   text: 'Play 2 matches',         stat: 'matches',   goal: 2, reward: [{ type: 'coins', n: 100 }, { type: 'passXp', n: 200 }] },
    { id: 'take6',   text: 'Get 6 takedowns',        stat: 'takedowns', goal: 6, reward: [{ type: 'coins', n: 100 }, { type: 'passXp', n: 200 }] },
    { id: 'win1',    text: 'Win a match',            stat: 'wins',      goal: 1, reward: [{ type: 'coins', n: 150 }, { type: 'passXp', n: 300 }] },
    { id: 'tower2',  text: 'Destroy 2 towers',       stat: 'towers',    goal: 2, reward: [{ type: 'coins', n: 100 }, { type: 'passXp', n: 150 }] },
    { id: 'shard1',  text: 'Take the Shard Colossus', stat: 'shards',   goal: 1, reward: [{ type: 'coins', n: 120 }, { type: 'passXp', n: 200 }] }
  ];
  SF.WEEKLY = { id: 'win5', text: 'Win 5 matches this week', stat: 'wins', goal: 5, reward: [{ type: 'chest', n: 2 }, { type: 'passXp', n: 600 }] };

  SF.ADS = {
    coins: { label: 'Coin cache', perDay: 5, reward: [{ type: 'coins', n: 100 }] },
    chest: { label: 'Free Aether Chest', perDay: 1, reward: [{ type: 'chest', n: 1 }] },
    double: { label: 'Double match coins', perDay: 3 }
  };

  SF.BOT_NAMES = ['Valtor', 'Mirelle', 'Quill', 'Ashgrove', 'Tamsin', 'Rook', 'Juniper', 'Okoro', 'Pell', 'Sora', 'Bexley', 'Dax', 'Ilse', 'Marrow', 'Wren', 'Corvin'];
})(window.SF);
