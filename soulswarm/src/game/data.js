// Content definitions. The single source of truth for names and numbers (mirrors docs/DESIGN_BRIEF.md).

export const RARITIES = ['common', 'rare', 'epic', 'legendary'];
export const RARITY_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
export const RARITY_COLOR = { common: '#a9b6cc', rare: '#3fb0ff', epic: '#c35cff', legendary: '#ffb52e' };
export const RARITY_MULT = { common: 1, rare: 2, epic: 3.5, legendary: 6 };

// ---------------------------------------------------------------- Heroes
export const HEROES = {
  vael: {
    id: 'vael', name: 'Vael', title: 'the Gravecaller', rarity: 'common', weapon: 'soulBolt',
    color: 0x4ef2ff, css: '#4ef2ff', body: 0x1b2a44, legion: 0x4ef2ff,
    passive: { raise: 0.10 }, passiveText: '+10% Raise Chance',
    hp: 100, speed: 6.2,
    lore: 'A lantern-bearer who learned the dead would follow anyone who remembered their names.',
  },
  nyx: {
    id: 'nyx', name: 'Nyx', title: 'Hollowborn', rarity: 'rare', weapon: 'scythe',
    color: 0xb36bff, css: '#b36bff', body: 0x22163a, legion: 0xb36bff,
    passive: { minionDmg: 0.20, minionSpeed: 0.20 }, passiveText: 'Minions +20% speed & damage',
    hp: 110, speed: 6.5,
    lore: 'Born in the hollow between heartbeats. Her scythe reaps, and her legion feasts.',
  },
  seraphine: {
    id: 'seraphine', name: 'Seraphine', title: 'Ashveil', rarity: 'epic', weapon: 'chains',
    color: 0xffb347, css: '#ffb347', body: 0x3a2414, legion: 0x7cffd4,
    passive: { nova: 0.30 }, passiveText: 'Soul Nova charges 30% faster',
    hp: 95, speed: 6.4,
    lore: 'A fallen choir-saint whose chains still burn with the last hymn of a dead cathedral.',
  },
  mordrake: {
    id: 'mordrake', name: 'Mordrake', title: 'the Undying', rarity: 'legendary', weapon: 'spears',
    color: 0x6dff9a, css: '#6dff9a', body: 0x16301f, legion: 0x6dff9a,
    passive: { cap: 0.25, revive: 1 }, passiveText: 'Legion cap +25%, revive once per run',
    hp: 130, speed: 6.0,
    lore: 'He has died nine hundred times. Each time, he brought someone back with him.',
  },
};
export const HERO_ORDER = ['vael', 'nyx', 'seraphine', 'mordrake'];
export const HERO_UNLOCK_SHARDS = 10;
export const HERO_STAR_COST = [0, 10, 20, 40, 80]; // shards to go from star i to i+1 (index = current stars)
export const HERO_MAX_STARS = 5;
export const heroStarBonus = (stars) => ({ dmg: 0.12 * Math.max(0, stars - 1), hp: 0.08 * Math.max(0, stars - 1) });

// ---------------------------------------------------------------- Enemies
// hp/dmg are chapter-1, minute-0 values. Scaling lives in run.js (see GDD).
export const ENEMIES = {
  husk:    { name: 'Husk',         hp: 14,  speed: 2.4, dmg: 6,  radius: 0.45, xp: 1, mass: 1.0, scale: 1.0 },
  ghoul:   { name: 'Ghoul',        hp: 8,   speed: 4.4, dmg: 5,  radius: 0.38, xp: 1, mass: 0.7, scale: 0.9 },
  brute:   { name: 'Brute',        hp: 75,  speed: 1.7, dmg: 18, radius: 0.85, xp: 4, mass: 5.0, scale: 1.0 },
  witch:   { name: 'Cinder Witch', hp: 22,  speed: 2.3, dmg: 10, radius: 0.45, xp: 2, mass: 1.0, scale: 1.0, ranged: { range: 8.5, cooldown: 2.6, speed: 6.5 } },
  bloater: { name: 'Bloater',      hp: 28,  speed: 2.0, dmg: 26, radius: 0.62, xp: 2, mass: 2.0, scale: 1.0, explode: { radius: 2.6, fuse: 1.0 } },
};
export const BOSS = { name: 'Gravemaw', title: 'the Hollow King', hp: 9000, speed: 2.3, dmg: 22, radius: 1.9, mass: 999 };
export const ELITE = { hpMul: 6, scale: 1.35, dmgMul: 1.5 };

// ---------------------------------------------------------------- Chapters
// Each chapter re-tints the world. Colors are hex ints for three.js.
export const CHAPTERS = [
  { id: 1, name: 'Ashen Necropolis', ground: 0x3a4658, groundB: 0x1c2330, rune: 0x2ad8ff, fog: 0x04070c, rim: 0x6fd8ff, enemy: 0xff5a2e, boss: 0xff3df0, hpMul: 1.0,  rate: 1.0 },
  { id: 2, name: 'Ember Wastes',     ground: 0x4a3226, groundB: 0x241510, rune: 0xff8a2a, fog: 0x0b0503, rim: 0xffb37a, enemy: 0xff3a3a, boss: 0xff3df0, hpMul: 1.9,  rate: 1.15 },
  { id: 3, name: 'Frozen Ossuary',   ground: 0x51637c, groundB: 0x26324a, rune: 0x9fe4ff, fog: 0x060b14, rim: 0xbfeaff, enemy: 0xff4f6a, boss: 0xb46bff, hpMul: 3.2,  rate: 1.3 },
  { id: 4, name: 'Abyssal Cathedral',ground: 0x3a2e4e, groundB: 0x1a1226, rune: 0xa35bff, fog: 0x06030c, rim: 0xd2a8ff, enemy: 0xff5a2e, boss: 0xff3df0, hpMul: 5.0,  rate: 1.45 },
  { id: 5, name: 'Crimson Throne',   ground: 0x4a2228, groundB: 0x220e12, rune: 0xff2e55, fog: 0x0a0204, rim: 0xff9aaa, enemy: 0xffb02e, boss: 0xff3df0, hpMul: 7.5,  rate: 1.6 },
];
export const RUN_LENGTH = 360; // seconds until the boss arrives
export const ENERGY_COST = 5;
export const ENERGY_MAX = 30;
export const ENERGY_REGEN_SEC = 360;

// ---------------------------------------------------------------- Run skills
const L = (arr) => (lv) => arr[Math.min(arr.length, Math.max(1, lv)) - 1];

export const SKILLS = {
  // Weapons
  soulBolt: {
    type: 'weapon', name: 'Soul Bolt', icon: 'bolt', max: 5,
    dmg: L([12, 15, 18, 22, 28]), count: L([1, 2, 2, 3, 4]), cd: L([0.7, 0.66, 0.6, 0.55, 0.48]), pierce: L([0, 0, 1, 1, 2]),
    desc: (lv) => [`Homing bolts strike the nearest foe.`, `+1 bolt`, `Bolts pierce 1 enemy`, `+1 bolt, faster casting`, `+1 bolt, pierce 2`][lv - 1],
  },
  scythe: {
    type: 'weapon', name: 'Spectral Scythe', icon: 'scythe', max: 5,
    dmg: L([16, 20, 26, 32, 42]), radius: L([2.6, 2.8, 3.0, 3.3, 3.7]), cd: L([1.6, 1.5, 1.35, 1.2, 1.0]), arcs: L([1, 1, 2, 2, 3]),
    desc: (lv) => [`A ghostly blade sweeps around you.`, `+Damage, +reach`, `Sweeps twice`, `+Damage, faster`, `Triple sweep, huge reach`][lv - 1],
  },
  chains: {
    type: 'weapon', name: 'Ashen Chains', icon: 'chain', max: 5,
    dmg: L([14, 17, 21, 26, 33]), jumps: L([3, 4, 5, 6, 8]), cd: L([1.5, 1.4, 1.25, 1.1, 0.95]), range: 7.5,
    desc: (lv) => [`Burning chains leap between foes.`, `+1 jump`, `+1 jump, +damage`, `+1 jump, faster`, `+2 jumps, searing damage`][lv - 1],
  },
  spears: {
    type: 'weapon', name: 'Bone Spears', icon: 'spear', max: 5,
    dmg: L([24, 30, 37, 46, 58]), count: L([1, 1, 2, 2, 3]), pierce: L([3, 4, 5, 6, 99]), cd: L([1.35, 1.25, 1.15, 1.05, 0.95]),
    desc: (lv) => [`Hurl lances that pierce the horde.`, `+Damage, +pierce`, `+1 spear`, `+Damage, faster`, `+1 spear, infinite pierce`][lv - 1],
  },
  skullHalo: {
    type: 'weapon', name: 'Skull Halo', icon: 'skull', max: 5,
    dmg: L([9, 11, 13, 16, 20]), count: L([2, 3, 4, 5, 6]), radius: L([2.3, 2.4, 2.6, 2.8, 3.0]),
    desc: (lv) => [`Burning skulls orbit you.`, `+1 skull`, `+1 skull, wider orbit`, `+1 skull, +damage`, `+1 skull, blazing`][lv - 1],
  },
  gravePulse: {
    type: 'weapon', name: 'Grave Pulse', icon: 'pulse', max: 5,
    dmg: L([12, 16, 20, 25, 33]), radius: L([3.6, 4.0, 4.5, 5.0, 6.0]), cd: L([3.0, 2.8, 2.5, 2.2, 1.8]),
    desc: (lv) => [`Release a shockwave that hurls foes back.`, `+Damage, +radius`, `+Radius, faster`, `+Damage, faster`, `Massive cataclysm wave`][lv - 1],
  },
  // Passives
  raiseDead: { type: 'passive', name: 'Raise Dead', icon: 'raise', max: 5, desc: () => `+6% chance slain foes rise as minions` },
  legionCap: { type: 'passive', name: 'Legion Cap', icon: 'banner', max: 5, desc: () => `+10 maximum legion size` },
  minionFury: { type: 'passive', name: 'Minion Fury', icon: 'fang', max: 5, desc: () => `Minions deal +20% damage` },
  haste: { type: 'passive', name: 'Haste', icon: 'wing', max: 5, desc: () => `+8% movement speed` },
  vitality: { type: 'passive', name: 'Vitality', icon: 'heart', max: 5, desc: () => `+20 max HP and heal 30%` },
  soulMagnet: { type: 'passive', name: 'Soul Magnet', icon: 'magnet', max: 5, desc: () => `+30% pickup radius` },
  might: { type: 'passive', name: 'Might', icon: 'sword', max: 5, desc: () => `+10% damage` },
  frenzy: { type: 'passive', name: 'Frenzy', icon: 'hourglass', max: 5, desc: () => `+8% attack speed` },
};

export const EVOLUTIONS = {
  soulStorm: { name: 'Soul Storm', from: 'soulBolt', needs: 'might', icon: 'bolt', desc: 'EVOLVED: 6 bolts that detonate on impact.' },
  boneCrown: { name: 'Bone Crown', from: 'skullHalo', needs: 'minionFury', icon: 'skull', desc: 'EVOLVED: 8 skulls. Skull kills always raise a soul.' },
};

export const WEAPON_SLOTS = 4;
export const BASE = {
  raise: 0.25, cap: 30, minionDmg: 7, minionSpeed: 9.5, minionHp: 34, pickup: 2.8,
  novaKills: 300, hardLegionMax: 400, minionLeash: 9,
};
export const xpForLevel = (lv) => Math.floor(4 + 3.2 * lv + 0.38 * lv * lv);

// ---------------------------------------------------------------- Relics (gear)
export const RELICS = {
  lantern:   { name: 'Lantern of the Lost', stat: 'raise', base: 0.03, fmt: 'pct', text: 'Raise Chance' },
  crown:     { name: 'Crown of Thorns',     stat: 'dmg',   base: 0.05, fmt: 'pct', text: 'Damage' },
  idol:      { name: 'Bone Idol',           stat: 'cap',   base: 3,    fmt: 'int', text: 'Legion Cap' },
  heart:     { name: 'Ember Heart',         stat: 'hp',    base: 10,   fmt: 'int', text: 'Max HP' },
  boots:     { name: 'Wraith Boots',        stat: 'speed', base: 0.03, fmt: 'pct', text: 'Move Speed' },
  coin:      { name: 'Grave Coin',          stat: 'gold',  base: 0.06, fmt: 'pct', text: 'Gold Gain' },
  hourglass: { name: 'Hourglass of Ash',    stat: 'haste', base: 0.03, fmt: 'pct', text: 'Attack Speed' },
  eye:       { name: 'Abyss Eye',           stat: 'nova',  base: 0.05, fmt: 'pct', text: 'Nova Charge' },
};
export const RELIC_TYPES = Object.keys(RELICS);
export const RELIC_SLOTS = 3;
export const relicValue = (r) => RELICS[r.type].base * RARITY_MULT[r.rarity] * (1 + 0.15 * ((r.level || 1) - 1));
export const formatRelicValue = (r) => {
  const d = RELICS[r.type]; const v = relicValue(r);
  return d.fmt === 'pct' ? `+${Math.round(v * 100)}% ${d.text}` : `+${Math.round(v)} ${d.text}`;
};

// ---------------------------------------------------------------- Talents (gold sink)
export const TALENTS = {
  might:    { name: 'Might',        icon: 'sword',  per: 0.04, fmt: 'pct', text: 'Damage',       max: 25 },
  vitality: { name: 'Vitality',     icon: 'heart',  per: 8,    fmt: 'int', text: 'Max HP',       max: 25 },
  raise:    { name: 'Necromancy',   icon: 'raise',  per: 0.01, fmt: 'pct', text: 'Raise Chance', max: 20 },
  cap:      { name: 'Dominion',     icon: 'banner', per: 2,    fmt: 'int', text: 'Legion Cap',   max: 20 },
  greed:    { name: 'Greed',        icon: 'coin',   per: 0.05, fmt: 'pct', text: 'Gold Gain',    max: 20 },
  swift:    { name: 'Swiftness',    icon: 'wing',   per: 0.02, fmt: 'pct', text: 'Move Speed',   max: 15 },
};
export const talentCost = (level) => Math.round((150 * Math.pow(1.32, level)) / 10) * 10;

// ---------------------------------------------------------------- Shop (prices are display-only in the prototype)
export const SKUS = {
  gems_80:     { id: 'gems_80',     kind: 'gems', price: 0.99,  gems: 80,    label: 'Pouch of Gems' },
  gems_500:    { id: 'gems_500',    kind: 'gems', price: 4.99,  gems: 500,   label: 'Sack of Gems' },
  gems_1200:   { id: 'gems_1200',   kind: 'gems', price: 9.99,  gems: 1200,  label: 'Chest of Gems', tag: 'Popular' },
  gems_2600:   { id: 'gems_2600',   kind: 'gems', price: 19.99, gems: 2600,  label: 'Coffer of Gems' },
  gems_7000:   { id: 'gems_7000',   kind: 'gems', price: 49.99, gems: 7000,  label: 'Vault of Gems', },
  gems_15000:  { id: 'gems_15000',  kind: 'gems', price: 99.99, gems: 15000, label: 'Hoard of Gems', tag: 'Best Value' },
  starter_pack:{ id: 'starter_pack',kind: 'bundle', price: 1.99, label: 'Starter Pack', once: true,
                 rewards: { hero: 'nyx', gems: 300, gold: 10000, sigils: 3 }, value: '540%' }, // 870 gems of contents at the $0.99 pack rate ÷ $1.99, hero not counted
  soul_pact:   { id: 'soul_pact',   kind: 'sub', price: 4.99, label: 'Soul Pact', days: 30,
                 rewards: { gems: 300 }, daily: { gems: 100 } },
  soul_pass:   { id: 'soul_pass',   kind: 'pass', price: 9.99, label: 'Soul Pass Premium' },
};
export const GEM_SKUS = ['gems_80', 'gems_500', 'gems_1200', 'gems_2600', 'gems_7000', 'gems_15000'];
export const STARTER_PACK_HOURS = 48;

// Gem-priced shop items
export const GEM_SHOP = {
  sigil_1:   { label: '1 Altar Sigil',   cost: 150,  rewards: { sigils: 1 } },
  sigil_10:  { label: '10 Altar Sigils', cost: 1350, rewards: { sigils: 10 } },
  gold_s:    { label: '5,000 Gold',      cost: 60,   rewards: { gold: 5000 } },
  gold_l:    { label: '30,000 Gold',     cost: 300,  rewards: { gold: 30000 } },
  energy:    { label: 'Refill Energy',   cost: 50,   rewards: { energy: 30 } },
};

// ---------------------------------------------------------------- Soul Altar (gacha)
export const ALTAR = {
  odds: { common: 0.60, rare: 0.28, epic: 0.10, legendary: 0.02 },
  cost1: 150, cost10: 1350, pityLegendary: 60,
  shardDrops: { epic: { seraphine: 4, nyx: 6 }, legendary: { mordrake: 5, seraphine: 6 } },
};

// ---------------------------------------------------------------- Soul Pass
export const PASS_TIERS = 30;
export const PASS_XP_PER_TIER = 500;
export const PASS_SEASON = { id: 1, name: 'Season I: The Waking Legion', days: 28 };
export function passReward(tier, premium) {
  // tier is 1-based
  if (!premium) {
    if (tier % 10 === 0) return { gems: 60, sigils: 1 };
    if (tier % 5 === 0) return { sigils: 1 };
    if (tier % 3 === 0) return { gems: 20 };
    return { gold: 400 + tier * 60 };
  }
  if (tier === 30) return { skin: 'eclipse_vael', gems: 300 };
  if (tier === 20) return { relic: 'legendary' };
  if (tier === 10) return { relic: 'epic', shards: { seraphine: 10 } };
  if (tier % 5 === 0) return { shards: { seraphine: 5 }, gems: 80 };
  if (tier % 2 === 0) return { gems: 50 };
  return { sigils: 1 };
}

// ---------------------------------------------------------------- Daily quests & login
export const QUESTS = [
  { id: 'kill',  text: 'Slay 500 enemies',        key: 'kills',  goal: 500, rewards: { gems: 20, passXp: 40 } },
  { id: 'raise', text: 'Raise 150 souls',         key: 'raised', goal: 150, rewards: { gold: 1500, passXp: 40 } },
  { id: 'surv',  text: 'Survive 4 minutes',       key: 'survive',goal: 240, rewards: { gems: 15, passXp: 30 } },
  { id: 'nova',  text: 'Unleash Soul Nova 3×',    key: 'novas',  goal: 3,   rewards: { gold: 1200, passXp: 30 } },
  { id: 'gate',  text: 'Pass 3 Soul Gates',       key: 'gates',  goal: 3,   rewards: { sigils: 1, passXp: 30 } },
  { id: 'runs',  text: 'Finish 2 runs',           key: 'runs',   goal: 2,   rewards: { gems: 25, passXp: 50 } },
];
export const LOGIN_REWARDS = [
  { gold: 2000 }, { gems: 30 }, { sigils: 1 }, { gold: 5000 }, { gems: 50 }, { sigils: 2 }, { gems: 100, relic: 'epic+' },
];

export const SKINS = {
  eclipse_vael: { hero: 'vael', name: 'Eclipse Vael', color: 0xffd04a, body: 0x1a1020, legion: 0xffe9a0 },
};
