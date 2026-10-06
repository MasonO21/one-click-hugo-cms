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
  liora: {
    id: 'liora', name: 'Liora', title: 'Bellwraith', rarity: 'epic', weapon: 'gravePulse',
    color: 0xc9bcff, css: '#b4a6ff', body: 0x2a2442, legion: 0x9fb4ff,
    passive: { pulseRaise: 2 }, passiveText: 'Grave Pulse kills have ×2 Raise Chance',
    hp: 105, speed: 6.3,
    lore: 'She tolled the funeral bell for forty years. Then, one night, the dead began to answer.',
  },
};
export const HERO_ORDER = ['vael', 'nyx', 'seraphine', 'liora', 'mordrake'];
export const HERO_UNLOCK_SHARDS = 10;
export const HERO_STAR_COST = [0, 10, 20, 40, 80]; // shards to go from star i to i+1 (index = current stars)
export const HERO_MAX_STARS = 5;
export const heroStarBonus = (stars) => ({ dmg: 0.12 * Math.max(0, stars - 1), hp: 0.08 * Math.max(0, stars - 1) });

// ---------------------------------------------------------------- Enemies
// hp/dmg are chapter-1, minute-0 values. Scaling lives in run.js (see GDD).
// Signature moves (seconds, metres, radians). Damaging telegraphs never go below 1.0 s (accessibility floor).
//   ghoul.pack: pack size [min, max] from one direction · flank: each member's heading offset (±30°), fading out from 6.5 m to 3 m
//   ghoul.lunge: crouch telegraph at `range`, aimed `lead` s ahead of the target; then a dash at `speed` for `dur` along that
//     locked direction; then `recover` s at `crawl` × speed; then `cd` s of normal chasing (contact still hurts) before the next
//   brute.slam: wind up at `range`, then a cone (`reach`, ±`arc`) for dmgMul × damage with knockback; `cd` before the next one
//   witch.lob: arcing orb at the target's position `lead` s ahead, landing after `flight` s on a `radius` circle (area damage)
export const ENEMIES = {
  husk:    { name: 'Husk',         hp: 14,  speed: 2.4, dmg: 6,  radius: 0.45, xp: 1, mass: 1.0, scale: 1.0 },
  ghoul:   { name: 'Ghoul',        hp: 8,   speed: 4.4, dmg: 5,  radius: 0.38, xp: 1, mass: 0.7, scale: 0.9,
             pack: [4, 6], flank: 0.52, lunge: { range: 3, crouch: 0.4, lead: 0.4, speed: 11, dur: 0.3, recover: 0.6, crawl: 0.35, cd: 1.5 } },
  brute:   { name: 'Brute',        hp: 75,  speed: 1.7, dmg: 18, radius: 0.85, xp: 4, mass: 5.0, scale: 1.0,
             slam: { range: 2.2, windup: 1.0, reach: 2.4, arc: 0.7, dmgMul: 1.4, knock: 9, recover: 0.8, cd: 2.4 } },
  witch:   { name: 'Cinder Witch', hp: 22,  speed: 2.3, dmg: 10, radius: 0.45, xp: 2, mass: 1.0, scale: 1.0, ranged: { range: 8.5, cooldown: 3.0, speed: 6.5 },
             lob: { flight: 1.0, lead: 0.3, radius: 1.1, height: 3.2 } }, // gentler lead: slow movers were hit far more (+76% Ch1)
  bloater: { name: 'Bloater',      hp: 28,  speed: 2.0, dmg: 26, radius: 0.62, xp: 2, mass: 2.0, scale: 1.0, explode: { radius: 2.6, fuse: 1.0 } },
};
// HP = hp × chapter hpMul × (1 + chHp × (c − 1)) × tune[c − 1] × Endless scale; damage = dmg × (1 + chDmg × (c − 1)) × √scale
// tune evens the fight out at about a minute for a player with that chapter's typical progression (scripts/balance.mjs, GOD=1)
export const BOSS = { name: 'Gravemaw', title: 'the Hollow King', hp: 12500, speed: 2.3, dmg: 22, radius: 1.9, mass: 999, chHp: 0.05, chDmg: 0.3,
  tune: [1, 0.8, 0.75, 1.15, 1.2, 1],
  firstRun: 0.6 }; // a player's very first run: 60% HP and no Crown of Cinders (phase III)
// Gravemaw's three-phase fight (boss.js). Seconds, metres, radians; dmg values are × the King's touch damage.
// Every damaging telegraph is >= minTele (accessibility floor) in every chapter, phase and enrage state.
export const BOSS_PHASES = {
  minTele: 1.0,
  rise: 1.4,                      // rises out of the ground, immune
  minPhase: [18, 14],             // phases I and II play at least this long; hit the tick sooner and he is warded (IMMUNE) there until then
  wardBreak: 0.05,                // damage poured into the ward shortens it: 1 s per this share of his max HP
  arena: { radius: 18, closeTo: 12, closeTime: 4, seal: 1.2, soft: 1.1, push: 14, hard: 0.35 }, // soft: push-back zone, hard: closest approach to the wall
  // from = HP fraction where the phase begins. speed = chase speed ×, rate = attack rate × (recoveries ÷ rate).
  phases: [
    { name: 'HOLLOW TREAD', sub: 'Phase I · Step between the slam rings', from: 1, speed: 1, rate: 1, slamTele: 1.2, orb: 1,
      weights: { slam: 0.42, ring: 0.33, summon: 0.25 } },
    { name: 'EMBER LITURGY', sub: 'Phase II · Follow the gaps as the rings turn', from: 0.66, speed: 1.15, rate: 1.25, slamTele: 1.1, orb: 1.1,
      weights: { slam: 0.4, rings: 0.6 } },
    { name: 'CROWN OF CINDERS', sub: 'Phase III · Circle with the spiral', from: 0.33, speed: 1.35, rate: 1.35, slamTele: 1.0, orb: 1.2,
      weights: { slam: 0.3, rings: 0.3, spiral: 0.4 } },
  ],
  transition: { dur: 2, slow: 0.3, slowDur: 0.45, flash: 0.55, push: 7, pushR: 9, knockR: 9, knock: 9 }, // push: Shepherd m/s, knock: horde impulse
  slam: { radii: [3, 6, 9], halfW: 0.65, every: 0.3, dmg: 1.4, minionDmg: 0.7, range: 13, recover: 1.9 },
  ring: { n: 24, gaps: 2, gapSlots: 3, speed: 6, dmg: 0.6, tele: 1.0, every: 0.45, waves: 1, recover: 1.6 },
  rings: { waves: 3, every: 0.5, turn: 0.35, recover: 1.7 }, // rotating gap rings: each wave turns its gaps by `turn`
  spiral: { arms: 4, dur: 2.5, every: 0.09, spin: 0.75, speed: 5.5, dmg: 0.55, tele: 1.0, recover: 1.5 },
  // Hollow aura: he sears a swarm of minions this close (× his damage per second): none below `from` in reach, full at `full`
  aura: { r: 3.2, dps: [0, 0, 1.5], from: 12, full: 32 },
  summon: { n: 6, r: 3.2, tele: 1.0, recover: 1.4 },
  waves: { first: 4, every: [12, 15], size: [12, 16], arc: 2.4, tele: 1.0, minDist: 7 }, // edge waves from phase II
  trickle: { rate: 1.2, max: [70, 45, 45], minDist: 9 }, // the whole fight, from the arena edge; max alive per phase
  dirge: { at: 180, dmg: 1.5, rate: 1.5 }, // "Hollow Dirge" soft enrage, seconds after he rises
  nova: { mul: 0.5, cap: 0.25 }, // Soul Nova (and soul bursts) hurt him at 50%, at most 25% of his max HP per Nova
  // chapter twists: 2 fire rings, 3 frost shards, 4 one extra ring per volley, 5 phase III at 50%
  fire: { life: 3, dmg: 0.35 },
  frost: { life: 3.5, n: [4, 7, 10], r: 0.75, dmg: 0.35 },
  extraRing: 1,
  ch5Crown: 0.5,
};
export const ELITE = { hpMul: 6, scale: 1.35, dmgMul: 1.5, crown: 0xffd04a };

// ---------------------------------------------------------------- Chapters
// Each chapter re-tints the world. Colors are hex ints for three.js.
// mods = the chapter's identity, read by the director (run.js), enemies.js, hazards.js and player.js:
//   tag: run-start banner line · weights: spawn-weight multiplier per enemy type · pack: Ghoul pack size [min, max]
//   burn: Witch lobs leave burning ground · vents / ice / hands: ground hazards (tuning in HAZARDS below)
//   vignette: fog vignette strength for the run (engine default 0.85) · sight: metres before the ground fades to fog (default 26)
//   elites: elite spawn times in seconds
//   rotate (Endless): the chapter mods used at abyss depth 1, 2, 3… (cycles)
export const CHAPTERS = [
  { id: 1, name: 'Ashen Necropolis', ground: 0x3a4658, groundB: 0x1c2330, rune: 0x2ad8ff, fog: 0x04070c, rim: 0x6fd8ff, enemy: 0xff5a2e, boss: 0xff3df0, hpMul: 1.0,  rate: 1.0,
    mods: {} },
  { id: 2, name: 'Ember Wastes',     ground: 0x4a3226, groundB: 0x241510, rune: 0xff8a2a, fog: 0x0b0503, rim: 0xffb37a, enemy: 0xff3a3a, boss: 0xff3df0, hpMul: 1.9,  rate: 1.15,
    mods: { tag: 'The witches’ fire lingers', weights: { witch: 1.8 }, burn: true, vents: true } },
  { id: 3, name: 'Frozen Ossuary',   ground: 0x51637c, groundB: 0x26324a, rune: 0x9fe4ff, fog: 0x060b14, rim: 0xbfeaff, enemy: 0xff4f6a, boss: 0xb46bff, hpMul: 3.2,  rate: 1.3,
    mods: { tag: 'Ghoul packs hunt on treacherous ice', weights: { ghoul: 1.5 }, pack: [6, 8], ice: true } },
  { id: 4, name: 'Abyssal Cathedral',ground: 0x3a2e4e, groundB: 0x1a1226, rune: 0xa35bff, fog: 0x06030c, rim: 0xd2a8ff, enemy: 0xff5a2e, boss: 0xff3df0, hpMul: 5.0,  rate: 1.45,
    mods: { tag: 'Bloaters swarm and the abyss reaches up', weights: { bloater: 2 }, vignette: 1.25, sight: 17, hands: true } },
  { id: 5, name: 'Crimson Throne',   ground: 0x4a2228, groundB: 0x220e12, rune: 0xff2e55, fog: 0x0a0204, rim: 0xff9aaa, enemy: 0xffb02e, boss: 0xff3df0, hpMul: 7.5,  rate: 1.6,
    mods: { tag: 'The gilded court rises: twice the elites', weights: { brute: 1.6 }, elites: [45, 75, 110, 150, 185, 225, 255, 290] } },
  // Unlocked by clearing Chapter 5. No time limit; the run ends when you fall.
  { id: 6, name: 'Endless Abyss', endless: true, ground: 0x2c2848, groundB: 0x120e22, rune: 0x6b7bff, fog: 0x05040c, rim: 0xa8b4ff, enemy: 0xff4a6a, boss: 0xff3df0, hpMul: 4.0, rate: 1.4,
    mods: { rotate: [2, 3, 4, 5] } },
];
/** The modifier set active in a chapter; Endless rotates through other chapters' sets by abyss depth (0-based). */
export const chapterMods = (ch, depth = 0) => {
  const rot = ch.mods && ch.mods.rotate;
  return rot ? CHAPTERS[rot[depth % rot.length] - 1].mods : ch.mods || {};
};
// Ground hazards (hazards.js). Damage values are chapter-1, minute-0 and scale like enemy damage.
//   burn: burning ground left by Witch lobs; dps = this share of the orb's damage per second, for `life` s
//   vents: ember vents on a hash grid (`cell` m, `chance` per cell); each puffs every `period` s after a `warn` s telegraph
//   ice: translucent patches (radius range); on ice the Shepherd's acceleration and stopping friction are scaled, top speed ×speed
//   hands: abyssal grabs every `every` s at the Shepherd's position `lead` s ahead; telegraph `warn` s, then root for `root` s
//     (claws stay up for `grab` s)
export const HAZARDS = {
  burn: { share: 0.25, life: 3 },
  vents: { cell: 15, chance: 0.32, radius: 1.6, period: [6.5, 9], warn: 1.2, puff: 0.5, dmg: 12 },
  ice: { cell: 12, chance: 0.5, radius: [2.6, 4.4], accel: 0.3, friction: 0.2, speed: 1.08 },
  hands: { every: [6, 9], lead: 0.6, radius: 1.3, warn: 1.0, root: 0.6, grab: 0.7 },
};
export const RUN_LENGTH = 360; // seconds until the boss arrives
export const ENDLESS_BOSS_EVERY = 300; // Endless Abyss: Gravemaw returns every 5:00, stronger each time
export const ENERGY_COST = 5;
export const ENERGY_MAX = 30;
export const ENERGY_REGEN_SEC = 360;

// ---------------------------------------------------------------- Run skills
const L = (arr) => (lv) => arr[Math.min(arr.length, Math.max(1, lv)) - 1];

export const SKILLS = {
  // Weapons
  soulBolt: {
    type: 'weapon', name: 'Soul Bolt', icon: 'bolt', max: 5,
    dmg: L([13, 17, 22, 30, 40]), count: L([1, 2, 2, 3, 5]), cd: L([0.7, 0.66, 0.6, 0.55, 0.48]), pierce: L([0, 1, 1, 2, 3]),
    desc: (lv) => [`Homing bolts strike the nearest foe.`, `+1 bolt, pierce 1`, `+Damage`, `+1 bolt, pierce 2, faster`, `+2 bolts, pierce 3`][lv - 1],
  },
  scythe: {
    type: 'weapon', name: 'Spectral Scythe', icon: 'scythe', max: 5,
    dmg: L([16, 20, 26, 32, 42]), radius: L([2.6, 2.8, 3.0, 3.3, 3.7]), cd: L([1.6, 1.5, 1.35, 1.2, 1.0]), arcs: L([1, 1, 2, 2, 3]),
    desc: (lv) => [`A ghostly blade sweeps around you.`, `+Damage, +reach`, `Sweeps twice`, `+Damage, faster`, `Triple sweep, huge reach`][lv - 1],
  },
  chains: {
    type: 'weapon', name: 'Ashen Chains', icon: 'chain', max: 5,
    dmg: L([18, 23, 29, 37, 48]), jumps: L([3, 4, 5, 6, 8]), cd: L([1.5, 1.4, 1.25, 1.1, 0.95]), range: 7.5,
    splash: 1.4, splashDmg: 0.5, // each link also scorches foes within 1.4 m of its target for 50%
    desc: (lv) => [`Burning chains leap between foes, scorching those beside them.`, `+1 jump`, `+1 jump, +damage`, `+1 jump, faster`, `+2 jumps, searing damage`][lv - 1],
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
  // Tunables below are read by weapons.js. Radii are in metres, times in seconds, dmg before Might/crits.
  harvestMoon: {
    name: 'Harvest Moon', from: 'scythe', needs: 'haste', icon: 'scythe', desc: 'EVOLVED: Twin moon blades orbit you. Scythe kills heal.',
    dmg: 46, arcs: 3, cd: 0.9,                                   // the periodic sweep (reach = scythe Lv5 radius)
    blades: 2, bladeDmg: 58, spin: 5.2, bladeHit: 1.3, bladeCd: 0.3, // orbiting crescents at max reach (rad/s); per-enemy hit cooldown
    heal: 1, healPerSec: 6,                                      // HP per scythe kill, capped by a bank that refills at healPerSec
  },
  chainsOfPerdition: {
    name: 'Chains of Perdition', from: 'chains', needs: 'frenzy', icon: 'chain', desc: 'EVOLVED: 12-jump chains set foes ablaze. The burning rise more often.',
    dmg: 54, jumps: 12, minHop: 1.6,        // links prefer targets at least 1.6 m apart (max jump 4.5 m, as Lv5)
    splash: 1.7,                            // scorch radius around each link (50% damage, as the base chains)
    burn: 0.4, burnTime: 2, burnTick: 0.25, // burn deals 40% of each hit over 2 s (re-hits add to the pool and refresh the timer)
    raise: 0.25,                            // +25 pp Raise Chance for kills while burning (still capped at 85%)
  },
  ossuaryBarrage: {
    name: 'Ossuary Barrage', from: 'spears', needs: 'vitality', icon: 'spear', desc: 'EVOLVED: A fan of 5 spears that burst into bone shrapnel.',
    count: 5, dmg: 56, spread: 0.2,          // infinite pierce
    past: 3.5, minReach: 5, maxReach: 16,    // flight ends 3.5 m past the target (5-16 m; 16 with no target), then bursts
    stagger: 1.2,                            // odd spears fly 1.2 m further, so the bursts land in two rows
    shrapnel: 0.55, shrapnelR: 2, shards: 12, // burst = 55% of the spear's damage in 2 m; bone shard meshes per burst
  },
  requiem: {
    name: 'Requiem', from: 'gravePulse', needs: 'soulMagnet', icon: 'pulse', desc: 'EVOLVED: Drags the horde in, then detonates. Draws in soul shards.',
    dmg: 46, radius: 6.5, cd: 1.4,
    pull: 0.3, pullForce: 70, swirl: 0.35,   // 0.3 s inward drag (accel m/s², tangential share) before the blast
    shardR: 12,                              // soul shards within 12 m fly to the Shepherd on each blast
  },
};

export const WEAPON_SLOTS = 4;
export const BASE = {
  raise: 0.25, cap: 30, minionDmg: 7, minionSpeed: 9.5, minionHp: 34, pickup: 2.8,
  novaKills: 300, hardLegionMax: 400, minionLeash: 9,
};
export const xpForLevel = (lv) => Math.floor(4 + 3.2 * lv + 0.38 * lv * lv);

// ---------------------------------------------------------------- Legion variants (GDD §4.2)
// A raised minion keeps the identity of the enemy it was (`from`). hp / dmg / speed multiply the run's
// minion stats (stats.minionHp / minionDmg / minionSpeed), so chapter, level, Nyx and Minion Fury scaling apply.
// interval = seconds between attacks · seek = target search radius (m) · leash = metres added to (or taken from)
// BASE.minionLeash · contact = melee reach beyond the target's radius · scale = ghost model scale (Shades stay wisps).
// Tuned with bot sims so the Ch1 Gravemaw time-to-kill stays within ±25% of the all-Shade legion (see the GDD).
export const MINIONS = {
  shade:     { from: 'husk',    hp: 1,    dmg: 1,    interval: 0.5,  speed: 1,    seek: 6.5, contact: 0.4 },
  runner:    { from: 'ghoul',   hp: 0.55, dmg: 0.75, interval: 0.32, speed: 1.3,  seek: 6.5, contact: 0.4, leash: 3, scale: 1.15 },
  // taunt: enemies within this many metres attack the Bulwark instead of the Shepherd · guard: idle ring radius
  // · a bodyguard: it only engages foes within 5 m of the Shepherd (leash -4), so it holds the line instead of hunting
  bulwark:   { from: 'brute',   hp: 3,    dmg: 1.0,  interval: 1.1,  speed: 0.7,  seek: 6.5, contact: 0.7, leash: -4, taunt: 3, guard: 2.3, knock: 3, scale: 0.8 },
  // ranged: one orb per interval within range, holding `keep` metres from the target; an orb costs recoilMul × melee recoil
  soulWitch: { from: 'witch',   hp: 0.8,  dmg: 1.1,  interval: 1.1,  speed: 0.9,  seek: 7,   range: 6, keep: 4, orbSpeed: 12, recoilMul: 0.75, scale: 0.8 },
  // dives into the densest cluster within seek (at least minCluster enemies, any after `patience` idle seconds),
  // flashes for `fuse` s on contact, then blasts `blast` × minionDmg in `radius` m and leaves the legion
  soulBomb:  { from: 'bloater', hp: 0.7,  speed: 1.15, seek: 8,   radius: 2.4, blast: 6, fuse: 0.25, knock: 9,
               minCluster: 3, patience: 5, searchEvery: 0.6, eliteWeight: 2, bossWeight: 2, scale: 0.75 },
  champion:  { scale: 1.35, hp: 3, dmg: 2 }, // a raised elite: multiplies its variant
  recoil: 0.3, bossRecoil: 0.5, // a melee hit costs the minion this share of its target's contact damage
  bossEngage: 24, // at most this many minions fight Gravemaw at once; the rest fight adds or orbit
  capHeal: 0.5, // a raise roll at the legion cap heals the weakest minion by this share of its max HP
};

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
  shardDrops: { epic: { seraphine: 4, nyx: 6, liora: 5 }, legendary: { mordrake: 5, seraphine: 6 } },
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
// Daily quests: "Finish 2 runs" every day, plus 5 drawn from the pool by date. Rewards belong to the slot, not the quest,
// so the daily value never changes (60 gems, 2,700 gold, 1 sigil, 220 pass XP). `late` quests need a Chapter 1 clear.
export const QUEST_DAILY = { id: 'runs', text: 'Finish 2 runs', key: 'runs', goal: 2, rewards: { gems: 25, passXp: 50 } };
export const QUEST_SLOTS = [
  { gems: 20, passXp: 40 }, { gold: 1500, passXp: 40 }, { gems: 15, passXp: 30 }, { gold: 1200, passXp: 30 }, { sigils: 1, passXp: 30 },
];
export const QUEST_POOL = [
  { id: 'kill',   text: 'Slay 500 enemies',        key: 'kills',   goal: 500 },
  { id: 'raise',  text: 'Raise 150 souls',         key: 'raised',  goal: 150 },
  { id: 'surv',   text: 'Survive 4 minutes',       key: 'survive', goal: 240 },
  { id: 'nova',   text: 'Unleash Soul Nova 3×',    key: 'novas',   goal: 3 },
  { id: 'gate',   text: 'Pass 3 Soul Gates',       key: 'gates',   goal: 3 },
  { id: 'chest',  text: 'Open 2 Relic Chests',     key: 'chests',  goal: 2 },
  { id: 'elite',  text: 'Slay 3 elites',           key: 'elites',  goal: 3 },
  { id: 'legion', text: 'Lead a legion of 100',    key: 'peak',    goal: 100 },
  { id: 'evolve', text: 'Evolve a weapon',         key: 'evolve',  goal: 1, late: true },
  { id: 'boss',   text: 'Defeat Gravemaw',         key: 'bosses',  goal: 1, late: true },
  { id: 'trial',  text: 'Clear the Daily Trial',   key: 'trial',   goal: 1, late: true },
];
export const LOGIN_REWARDS = [
  { gold: 2000 }, { gems: 30 }, { sigils: 1 }, { gold: 5000 }, { gems: 50 }, { sigils: 2 }, { gems: 100, relic: 'epic+' },
];

// ---------------------------------------------------------------- Weekend and weekly
// Blood Moon: every weekend (Fri 00:00 – Sun 23:59 UTC). 8 elites a run (so 8 Relic Chests), double run gold and gems,
// and a blood-red sky. Endless elites come twice as often. Not applied to the Daily Trial.
export const BLOOD_MOON = { days: [5, 6, 0], elites: [45, 75, 110, 150, 185, 225, 255, 290], rewardMul: 2, ground: 0x4a2228, groundB: 0x1c080c, fog: 0x12020a, rune: 0xff2e3a, rim: 0xff8a8a };
// Weekly chest: claim 25 daily quests in a week (Monday to Sunday, local time).
export const WEEKLY_CHEST = { goal: 25, rewards: { sigils: 1, gems: 50, passXp: 100 } };

// ---------------------------------------------------------------- Daily Trial
// One free run a day (no energy) on a cleared chapter with one boon and one bane, seeded by date. Unlocks once Chapter 1 is cleared.
export const TRIAL = {
  unlockAt: 2, adRetries: 1,
  clear: { gems: 40, passXp: 150 }, sigilEvery: 3, // on top of the normal gold and pass XP; every 3rd clear also gives a Sigil
  failGemsPerMin: 8, failGemsMax: 40,
};
// stats: raise/cap add; nova/minionDmg/minionHp multiply. spawn/hp/speed multiply the horde; weights re-weight the spawn mix.
export const MUTATORS = {
  soulHarvest: { kind: 'boon', name: 'Soul Harvest',    icon: 'raise',  desc: '+20% Raise Chance',                stats: { raise: 0.2 } },
  overflow:    { kind: 'boon', name: 'Overflowing Cup', icon: 'banner', desc: '+40 legion cap',                    stats: { cap: 40 } },
  novaFont:    { kind: 'boon', name: 'Nova Font',       icon: 'nova',   desc: 'Soul Nova charges twice as fast',   stats: { nova: 2 } },
  gildedGates: { kind: 'boon', name: 'Gilded Gates',    icon: 'plus',   desc: 'Gates every 25 s, and none cull',  gateEvery: 25, noBadGates: true },
  awakened:    { kind: 'boon', name: 'Awakened',        icon: 'star',   desc: 'Start with your weapon at Lv3',     startLv: 3 },
  legionFury:  { kind: 'boon', name: 'Legion Fury',     icon: 'fang',   desc: 'Minions deal +60% damage',          stats: { minionDmg: 1.6 } },
  swarming:    { kind: 'bane', name: 'Swarming Dark',   icon: 'skull',  desc: '+50% enemy spawns',                 spawn: 1.5 },
  ironHides:   { kind: 'bane', name: 'Iron Hides',      icon: 'helm',   desc: 'Enemies have +60% HP',              hp: 1.6 },
  witching:    { kind: 'bane', name: 'Witching Hour',   icon: 'eye',    desc: 'Cinder Witches everywhere',         weights: { witch: 4 } },
  gilded:      { kind: 'bane', name: 'Gilded Horrors',  icon: 'crown',  desc: 'An elite every 40 s (more chests!)', eliteEvery: 40 },
  brittle:     { kind: 'bane', name: 'Brittle Legion',  icon: 'shard',  desc: 'Minions have half HP',              stats: { minionHp: 0.5 } },
  restless:    { kind: 'bane', name: 'Restless Dead',   icon: 'wing',   desc: 'Enemies move 30% faster',           speed: 1.3 },
};
/** Folds a list of mutator ids into one modifier set for a run. */
export function mergeMutators(ids = []) {
  const m = { ids, stats: {}, spawn: 1, hp: 1, speed: 1, weights: null, eliteEvery: 0, gateEvery: 0, noBadGates: false, startLv: 0 };
  for (const id of ids) {
    const d = MUTATORS[id];
    if (!d) continue;
    for (const [k, v] of Object.entries(d.stats || {})) m.stats[k] = k === 'raise' || k === 'cap' ? (m.stats[k] || 0) + v : (m.stats[k] || 1) * v;
    for (const k of ['spawn', 'hp', 'speed']) if (d[k]) m[k] *= d[k];
    if (d.weights) { m.weights = m.weights || {}; for (const [t, w] of Object.entries(d.weights)) m.weights[t] = (m.weights[t] || 1) * w; }
    for (const k of ['eliteEvery', 'gateEvery', 'startLv']) if (d[k]) m[k] = d[k];
    if (d.noBadGates) m.noBadGates = true;
  }
  return m;
}

export const SKINS = {
  eclipse_vael: { hero: 'vael', name: 'Eclipse Vael', color: 0xffd04a, body: 0x1a1020, legion: 0xffe9a0 },
};
