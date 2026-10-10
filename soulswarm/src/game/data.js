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
    passive: { nova: 0.30, novaRaise: 2 }, passiveText: 'Nova charges 30% faster, its kills rise ×2',
    hp: 105, speed: 6.4,
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
    passive: { pulseRaise: 2, pulseMark: 3, pulseKnock: 0.25 }, passiveText: 'Pulse-struck foes stay close and rise ×2',
    hp: 105, speed: 6.3,
    lore: 'She tolled the funeral bell for forty years. Then, one night, the dead began to answer.',
  },
  grimsby: {
    id: 'grimsby', name: 'Grimsby', title: 'Lanternjaw', rarity: 'epic', weapon: 'witchfire',
    color: 0xc6ff3d, css: '#c6ff3d', body: 0x1e2a14, legion: 0xc6ff3d,
    passive: { gateAdd: 0.25, witchRaise: 1.5 }, passiveText: 'Soul Gates give 25% more, witchfire kills rise ×1.5',
    hp: 105, speed: 6.4,
    lore: 'He lit the graveyard lamps for a hundred Hallows Eves. On the last one, he swallowed the flame to keep it.',
  },
  osric: {
    id: 'osric', name: 'Osric', title: 'the Bone Abbot', rarity: 'legendary', weapon: 'skullHalo',
    color: 0xe2b65a, css: '#f0d494', body: 0x3a3222, legion: 0xf5c35c, // antique gold: his ivory robes bloom to white on their own
    passive: { startLegion: 20, tithe: true }, passiveText: 'Starts with 20 minions; his legion\'s slain send him their souls',
    hp: 135, speed: 6.0,
    lore: 'His abbey emptied the night the plague came. He kept saying Mass anyway, and in time the pews filled again.',
  },
  isolde: { // Update 12: the eighth Shepherd, Soul Leech's own
    id: 'isolde', name: 'Isolde', title: 'the Crimson Countess', rarity: 'legendary', weapon: 'soulLeech',
    color: 0xff4d6d, css: '#ff4d6d', body: 0x3a1220, legion: 0x5b7cff, // her guests' blue blood: a crimson legion would read as the horde
    passive: { leechBeams: 1, leechRaise: true }, passiveText: 'One more drain beam; what her beams slay always rises',
    hp: 120, speed: 6.3,
    lore: 'She threw the last feast her house ever held. The guests never left, and she never stopped pouring.',
  },
};
export const HERO_ORDER = ['vael', 'nyx', 'seraphine', 'liora', 'grimsby', 'mordrake', 'osric', 'isolde'];
export const HERO_UNLOCK_SHARDS = 10;
export const HERO_STAR_COST = [0, 10, 20, 40, 80]; // shards to go from star i to i+1 (index = current stars)
export const HERO_MAX_STARS = 5;
export const heroStarBonus = (stars) => ({ dmg: 0.12 * Math.max(0, stars - 1), hp: 0.08 * Math.max(0, stars - 1) });

// ---------------------------------------------------------------- Hero Rites (rites.js, ui/riteui.js)
// Each hero's signature active ability on the RITE button (Shift / E on desktop). Ready at the start of every run.
// cd = cooldown in seconds of run time (it waits while paused). Seconds, metres; dmg = base damage × the run's damage
// multiplier × (1 + ch × (chapter − 1)), the same chapter scaling as Soul Nova and the legion.
export const RITES = {
  ch: 0.45,
  hintAt: 8,          // the one-time Rite hint shows once this many seconds have passed (it is ready from the start)
  bossStagger: 0.25,  // a stun never stops a boss: it only pushes its next attack back by this much
  // every kill rises (Raise Chance 100%; the legion cap and overflow rules still hold); shards within `pull` m fly in
  vael: { name: 'Grave Call', short: 'CALL', cd: 20, dur: 4, pull: 12,
    desc: 'For 4 s every foe you slay rises, and soul shards within 12 m fly to you.',
    // Ascended (Hero Mastery rank 5): the call lasts `dur` s longer and every `champEvery`-th foe it raises is a Champion
    asc: { dur: 1, champEvery: 3 }, ascDesc: 'The call lasts 5 s, and every third foe it raises rises as a Champion.' },
  // dash `dist` m in `time` s along the stick (facing when idle), invulnerable; foes within `width` of the path take
  // dmg and are knocked aside; the legion moves +haste for hasteT s to catch up
  nyx: { name: 'Shadow Step', short: 'STEP', cd: 8, dist: 7, time: 0.18, invuln: 0.4, width: 1.5, dmg: 90, knock: 12, haste: 0.6, hasteT: 3,
    desc: 'Dash 7 m through the horde, untouchable, slashing all in your path. Your legion surges after you.',
    // Ascended: a second charge; the cooldown starts once both are spent or `window` s after the first step
    asc: { window: 3 }, ascDesc: 'A second charge: step again within 3 s before the Rite recharges.' },
  // ash chains strike up to n foes on screen (the boss and elites first, then Cinder Witches, then the nearest), `span` s
// from first to last;
  // each hit pins the foe (a stun) for `pin` s and ignites it (burn = share of the hit over 2 s; burning kills get +burnRaise
// Raise Chance); +nova charge
  seraphine: { name: 'Ashfall', short: 'ASHFALL', cd: 18, n: 20, range: 16, span: 0.5, dmg: 120, burn: 0.6, burnRaise: 0.15, nova: 0.15, pin: 0.8,
    desc: 'Burning chains fall on 20 foes, elites then Witches first, pinning them for 0.8 s. They ignite, and your Nova charges +15%.',
    // Ascended: a second wave of `n` chains falls `delay` s after the first (on foes the first wave did not strike)
    asc: { delay: 1, n: 10 }, ascDesc: 'A second wave of 10 chains falls 1 s later on the foes the first one missed.' },
  // a bell tolls `r` m around her: foes are stunned, take dmg, carry her toll for `mark` s; enemy shots are cleared and
  // Cinder Witches within `silence` m are stunned too (their fire waits)
  liora: { name: 'Death Knell', short: 'KNELL', cd: 15, r: 5, silence: 10, stun: 1.5, mark: 5, dmg: 60,
    desc: 'A great bell tolls: foes within 5 m are stunned and marked by the toll for 5 s. Enemy fire is silenced, and Witches within 10 m with it.',
    // Ascended: it tolls again `delay` s later out to `r` m (stun `stun` s, dmg × `dmg`, the toll mark, shots cleared again)
    asc: { delay: 1.2, r: 7, stun: 1, dmg: 1 }, ascDesc: 'The bell tolls a second time 1.2 s later, out to 7 m: another stun, toll and silence.' },
  // a ring of bone spikes (`r` m) for `dur` s at the cast point: foes inside are thrown out and every crossing
  // hurts (once per hitCd per foe); Witch fire falling inside shatters on the bone; minions inside heal `heal` of their
  // max HP over the duration; a boss is only shoved at bossPush m/s; the ring moves with him
  mordrake: { name: 'Ossuary Wall', short: 'WALL', cd: 18, r: 5, dur: 5, dmg: 60, hitCd: 0.5, knock: 9, heal: 0.5, bossPush: 1.2, spikes: 44,
    desc: 'A ring of bone spikes rises around you for 5 s. Foes are hurled out and cut on every crossing, Witch fire shatters on it, and your legion inside heals 50%.',
    // Ascended: when the wall falls its spikes burst outward: every foe within `r` m outside the ring takes dmg, knocked away
    asc: { r: 3.5, dmg: 120, knock: 14 }, ascDesc: 'When the wall falls, its spikes burst outward and cut every foe within 3.5 m of the ring for 120.' },
  // his jaw blazes: foes within `r` m take dmg, flee in terror for `fear` s and stand in witchfire; for `dur` s he runs
  // +haste and his trail of witchfire is `trailR` m wide, dps per second while they stand in it
  grimsby: { name: 'Hallowfire', short: 'BLAZE', cd: 16, r: 6, fear: 2, dmg: 40, dur: 6, haste: 0.3, trailR: 1.7, dps: 45,
    desc: 'Your jaw blazes: foes within 6 m are scorched and flee in terror for 2 s. For 6 s you run 30% faster and leave a wide river of witchfire.',
    // Ascended: a terrified foe takes +dread damage from every source while it flees, and the terror lasts `fear` s
    asc: { dread: 0.35, fear: 3 }, ascDesc: 'Terror lasts 3 s, and terrified foes take 35% more damage from every source.' },
  // `monks` bone monks rise around him (past the cap: they fade like any overflow) and for `dur` s the legion deals
  // +fury damage, the Skull Halo turns `spin` × as fast and the hymn wards him (damage taken × (1 − ward))
  osric: { name: 'Bone Mass', short: 'MASS', cd: 18, monks: 12, dur: 6, fury: 0.5, spin: 2, ward: 0.4,
    desc: 'Twelve bone monks rise to join your legion. For 6 s your whole legion deals +50% damage, your Skull Halo spins twice as fast and you take 40% less damage.',
    // Ascended: every `champEvery`-th monk rises as a Champion (gold, ×3 HP, ×2 damage)
    asc: { champEvery: 2 }, ascDesc: 'Every other monk rises as a Champion.' },
  // a blood nova: foes within `r` m take dmg, are bound (stunned) `bind` s and blood-marked `mark` s: a marked foe that
  // dies rises (Raise Chance 100%; the cap holds). She heals `heal` HP per foe struck (at most `healMax`). A boss is
  // only staggered and never marked; Soul Thieves and Cursed Coffins are spared
  isolde: { name: 'Crimson Sabbath', short: 'FEAST', cd: 18, r: 7, dmg: 70, bind: 1.2, mark: 6, heal: 2, healMax: 30, color: 0xff2448, // blood, not her sapphire legion
    desc: 'A blood nova binds every foe within 7 m for 1.2 s and marks them for 6 s: the marked rise when they fall. Each foe struck heals you 2 HP.',
    // Ascended: a marked foe that falls bursts into blood mist, marking up to `n` unmarked foes within `spread` m
    asc: { spread: 3, n: 3 }, ascDesc: 'A marked foe that falls bursts into blood mist, marking up to 3 foes within 3 m.' },
};

// ---------------------------------------------------------------- Hero Mastery (meta/mastery.js, Update 9)
// Every hero ranks 1 → 10 by being played: a run gives the hero who fought it the run's pass XP as mastery XP (with the
// difficulty bonus; Boss Rush and the Daily Trial count, the tutorial does not; the ad double never doubles it).
// need[r] is the XP from rank r to r + 1 (7,650 in all: about 13 runs to rank 5, 50 to rank 10). Perks stack: hp and dmg
// multiply the hero's HP and damage, riteCd shortens the Rite's cooldown, weaponLv starts the signature weapon higher,
// asc ascends the Rite (RITES[id].asc), aura is the rank-10 mark. Each rank-up pays its reward once.
export const MASTERY = {
  max: 10,
  need: [0, 250, 400, 550, 700, 850, 1000, 1150, 1300, 1450],
  ranks: {
    2: { perk: { hp: 0.02 }, text: '+2% max HP', reward: { gold: 500 } },
    3: { perk: { riteCd: 0.1 }, text: 'Rite cooldown −10%', reward: { gems: 20 } },
    4: { perk: { dmg: 0.02 }, text: '+2% damage', reward: { gold: 1000 } },
    5: { perk: { asc: true }, text: 'Ascended Rite', reward: { sigils: 1 } },
    6: { perk: { hp: 0.02 }, text: '+2% max HP', reward: { gems: 30 } },
    7: { perk: { weaponLv: 1 }, text: 'Signature weapon starts at Lv 2', reward: { gold: 1500 } },
    8: { perk: { dmg: 0.02 }, text: '+2% damage', reward: { gems: 40 } },
    9: { perk: { riteCd: 0.1 }, text: 'Rite cooldown −10% more', reward: { gold: 2000 } },
    10: { perk: { aura: true }, text: 'Soulbound aura and the Master title', reward: { sigils: 1, gems: 50 } },
  },
};

// ---------------------------------------------------------------- Enemies
// hp/dmg are chapter-1, minute-0 values. Scaling lives in run.js (see GDD).
// Signature moves (seconds, metres, radians). Damaging telegraphs never go below 1.0 s (accessibility floor).
//   ghoul.pack: pack size [min, max] from one direction · flank: each member's heading offset (±30°), fading out from 6.5 m to 3 m
//   ghoul.lunge: crouch telegraph at `range`, aimed `lead` s ahead of the target; then a dash at `speed` for `dur` along that
//     locked direction; then `recover` s at `crawl` × speed; then `cd` s of normal chasing (contact still hurts) before the next
//   brute.slam: wind up at `range`, then a cone (`reach`, ±`arc`) for dmgMul × damage with knockback; `cd` before the next one
//   witch.lob: arcing orb at the target's position `lead` s ahead, landing after `flight` s on a `radius` circle (area damage)
//   from: { ch, minute } = the first chapter and minute it joins the horde · cap = most alive at once
//   wraith: the legion can neither target, taunt nor harm it; dive = within `range` m it speeds up ×speedMul on a ±weave
//     rad swing (a slower ±0.35 rad drift outside)
//   priest: holds `keep` m from the Shepherd and backs off inside `flee`; raise = every cd s (±20%) it channels `channel` s
//     over up to `n` corpses within `reach` m (a foe that did not rise stays a corpse for `corpse` s), which then rise as
//     hollow Husks (no soul shard, no corpse); a stun, a fear or its death breaks the channel
export const ENEMIES = {
  husk:    { name: 'Husk',         hp: 14,  speed: 2.4, dmg: 6,  radius: 0.45, xp: 1, mass: 1.0, scale: 1.0 },
  ghoul:   { name: 'Ghoul',        hp: 8,   speed: 4.4, dmg: 5,  radius: 0.38, xp: 1, mass: 0.7, scale: 0.9,
             pack: [4, 6], flank: 0.52, lunge: { range: 3, crouch: 0.4, lead: 0.4, speed: 11, dur: 0.3, recover: 0.6, crawl: 0.35, cd: 1.5 } },
  brute:   { name: 'Brute',        hp: 75,  speed: 1.7, dmg: 18, radius: 0.85, xp: 4, mass: 5.0, scale: 1.0,
             slam: { range: 2.2, windup: 1.0, reach: 2.4, arc: 0.7, dmgMul: 1.4, knock: 9, recover: 0.8, cd: 2.4 } },
  witch:   { name: 'Cinder Witch', hp: 22,  speed: 2.3, dmg: 10, radius: 0.45, xp: 2, mass: 1.0, scale: 1.0, ranged: { range: 8.5, cooldown: 3.0, speed: 6.5 },
             lob: { flight: 1.0, lead: 0.3, radius: 1.1, height: 3.2 } }, // gentler lead: slow movers were hit far more (+76% Ch1)
  bloater: { name: 'Bloater',      hp: 28,  speed: 2.0, dmg: 26, radius: 0.62, xp: 2, mass: 2.0, scale: 1.0, explode: { radius: 2.6, fuse: 1.0 } },
  wraith:  { name: 'Grave Wraith', hp: 16,  speed: 3.2, dmg: 7,  radius: 0.42, xp: 2, mass: 0.6, scale: 1.0, from: { ch: 2, minute: 2.5 }, cap: 14,
             dive: { range: 5, speedMul: 1.55, weave: 0.6 } },
  priest:  { name: 'Corpse Priest', hp: 45, speed: 2.1, dmg: 8,  radius: 0.5,  xp: 4, mass: 1.4, scale: 1.0, from: { ch: 3, minute: 3 }, cap: 3,
             keep: 10, flee: 7, raise: { cd: 6, channel: 1.2, n: 3, reach: 7, corpse: 10 } },
  // Update 13's act foes (act: true = only where a chapter weights it, mods.weights):
  //   siren: holds `keep` m off; every song.cd s (±20%) sings onto a circle around the Shepherd (`r` m, telegraph `tele`
  //     s): minions inside are entranced for `entrance` s (they stop fighting and drift toward her); a stun or her
  //     death breaks the song
  //   thornback: within charge.range (beyond min) it lowers its head over a lane (`tele` s), then charges `dist` m at
  //     `speed`: the Shepherd in its path takes dmgMul × damage and is thrown aside, minions are trampled; brambles grow
  //     behind it; then `recover` s and `cd` s before the next
  //   rat: comes in packs (`pack`) that flank like Ghouls; bites quickly (`bite` s between bites)
  //   caller: holds `keep` m off; every bolt.cd s it marks a line toward where the Shepherd will be (`lead` s ahead):
  //     `len` m long, `w` m either side, for `tele` s; then lightning runs along it (minions inside take minionDmg ×)
  //   stalker: between blink.range m, every blink.cd s it marks a spot `dist` m beside the Shepherd (`tele` s), vanishes,
  //     appears there and pounces (`pounce` m/s for `pounceT` s)
  siren:   { name: 'Drowned Siren', hp: 26, speed: 2.4, dmg: 8, radius: 0.45, xp: 2, mass: 1.0, scale: 1.0, from: { ch: 6, minute: 1 }, cap: 6, act: true,
             keep: 9, flee: 6, song: { cd: 7, tele: 1.1, r: 4.2, entrance: 2.5 } },
  thornback: { name: 'Thornback', hp: 70, speed: 2.0, dmg: 16, radius: 0.75, xp: 4, mass: 4.0, scale: 1.0, from: { ch: 11, minute: 1 }, cap: 8, act: true,
             charge: { range: 10, min: 3, tele: 1.0, speed: 13, dist: 11, w: 0.9, dmgMul: 1.4, knock: 10, recover: 1.0, cd: 4.5 } },
  rat:     { name: 'Plague Rat', hp: 5, speed: 5.0, dmg: 3, radius: 0.3, xp: 1, mass: 0.4, scale: 1.0, from: { ch: 16, minute: 0.5 }, cap: 90, act: true,
             pack: [9, 13], flank: 0.7, bite: 0.5 },
  caller:  { name: 'Stormcaller', hp: 24, speed: 2.3, dmg: 11, radius: 0.45, xp: 2, mass: 1.0, scale: 1.0, from: { ch: 21, minute: 1 }, cap: 10, act: true,
             keep: 9, flee: 6, bolt: { cd: 4, tele: 1.0, len: 12, w: 0.65, lead: 0.3, minionDmg: 0.6 } },
  stalker: { name: 'Void Stalker', hp: 30, speed: 3.0, dmg: 12, radius: 0.45, xp: 2, mass: 1.0, scale: 1.0, from: { ch: 26, minute: 1 }, cap: 12, act: true,
             blink: { range: [5, 15], cd: 5, tele: 1.0, dist: 2.4, pounce: 9, pounceT: 0.25 } },
};
// HP = hp × chapter hpMul × (1 + chHp × (c − 1)) × tune[c − 1] × Endless scale; damage = dmg × (1 + chDmg × (c − 1)) × √scale
// tune evens the fight out at about a minute for a player with that chapter's typical progression (scripts/balance.mjs, GOD=1)
// Every chapter boss (BOSSES below) shares these stats.
export const BOSS = { hp: 12500, speed: 2.3, dmg: 22, radius: 1.9, mass: 999, chHp: 0.05, chDmg: 0.3,
  tune: [1, 0.8, 0.75, 1.15, 1.2, 1],
  firstRun: 0.6 }; // a first Chapter 1 run without the tutorial: 60% HP and no phase III
// ---------------------------------------------------------------- Beginner tutorial ("The Waking", tutorial.js, ui/coachui.js)
// A free, guided first run on Chapter 1 that teaches one thing per step. The horde comes only as each step needs it, the
// Shepherd cannot fall (hits stop at 1 HP) and the Hollow King at the end is a quarter as strong, phase I only.
// Seconds, metres; trickle = [Husks per second, most alive at once].
export const TUTORIAL = {
  moveDist: 6,          // metres walked to pass the first step
  slay: 5,              // Husks to slay; the first five always rise
  legion: 12,           // legion size before the first Soul Gate
  raise: 0.5,           // Raise Chance floor for the whole tutorial
  legionHelp: 45,       // seconds before the legion step tops the legion up itself (no dead end)
  pack: [8, 4],         // the legion step's Ghoul pack: [seconds in, size]
  trickle: { slay: [0.8, 10], legion: [1.6, 22], gate: [0.7, 10], rite: [1.2, 26], elite: [1.5, 22], nova: [1.4, 40] }, // the elite step also regrows the legion the Nova spent
  arc: 6,               // Husks waiting ahead when the slaying starts
  riteRing: [18, 9],    // [Husks, radius] around the Shepherd for the Rite to hit
  regrow: [15, 20],     // after the Nova: the elite comes once the legion is back to this, or after this many seconds
  eliteHp: 0.6,         // the elite Brute's HP ×
  novaRing: [30, 11],   // the SURROUNDED ring of the Nova step
  novaPre: 0.5,         // Nova charge × before the Nova step (so the meter fills when it is taught)
  novaBoost: 5,         // and × during it
  novaFill: 10,         // seconds into the Nova step before the meter tops itself up
  bossWarn: 4,          // seconds from the warning to the King's rise
  bossHp: 0.25,         // the King's HP × (12,500 → 3,125)
  done: 1.3,            // seconds a finished step shows its tick before the next
  reward: { gold: 500, gems: 30 }, // for finishing, on top of the run's kill and time gold
};
// ---------------------------------------------------------------- Boss Rush ("The Hollow Court", run.js rush, ui/meta/rush.js)
// The five chapter bosses back to back in the Abyss, each at its own chapter's scaling (× hp[k] for HP). The Shepherd
// starts where a campaign player stands at a boss: Lv `level`, a veteran build (the first card of `auto` draws), legion
// cap +`cap` and a legion of `legion`, then picks `draft` powers; each boss drops a Relic Chest, raises `souls` souls and
// heals `heal` of max HP, and the next rises `gap` s later. A limited event: in the build it
// runs every week on `days` (UTC; Tue–Thu); live, once per season through remote config (LIVEOPS.md §3.2). Free:
// `tries` a day, then one more try per rewarded ad, as many as wanted (ads are never capped). Milestones (bosses beaten in
// one attempt) pay once per event.
export const BOSS_RUSH = {
  name: 'The Hollow Court', unlockAt: 2, // chapter.unlocked: a first Chapter 1 clear
  days: [2, 3, 4], tries: 3,
  level: 20, auto: 14, cap: 40, legion: 70, draft: 4, first: 3, warn: 3, gap: 6, souls: 20, heal: 0.4,
  hp: [1, 0.85, 0.7, 0.6, 0.55],
  milestones: [{ gold: 1000 }, { gems: 20 }, { gold: 1500 }, { gems: 30 }, { sigils: 1, gems: 40 }],
  // Update 14: two courts. The Hollow Court (Act I's bosses, at their chapters' scaling) every week; once a player has
  // cleared Chapter 10, every other week (odd weeks since 1970) brings the Fallen Court instead: the act finales, at
  // Chapters 10, 15, 20, 25 and 30, from a stronger start. Same tries, milestones and rewards. profile.flags.rushCourt
  // overrides (QA).
  courts: {
    // its first boss a little gentler (hp): with the shared table a player who had just cleared Chapter 1 never beat one
    // (balance.mjs RUSH=1, 0 of 4 runs); now about half the time, so the first milestone is in reach from the start
    hollow: { name: 'The Hollow Court', bosses: ['gravemaw', 'pyrexa', 'vaulkar', 'azrathel', 'vesperine'], chapters: [1, 2, 3, 4, 5], unlockAt: 2,
      hp: [0.7, 0.85, 0.7, 0.6, 0.55] },
    // a stronger seasoned start for bosses at Chapters 10-30 (balance.mjs RUSH=1 COURT=fallen: with the shared start no
    // player cleared it; with this, a player at Chapter 20-30 progression clears about half the time, one at 11 beats one to three; its cap is raised to hold the 110 souls)
    fallen: { name: 'The Fallen Court', bosses: ['morwenna', 'gorrath', 'mire', 'kaelthar', 'nihl'], chapters: [10, 15, 20, 25, 30], unlockAt: 11,
      start: { level: 30, auto: 22, legion: 110, cap: 80, draft: 5 } },
  },
};
/** A court's seasoned start: BOSS_RUSH's level, auto picks, legion, draft and cap, with the court's own `start` over them. */
export const rushStart = (court) => {
  const R = BOSS_RUSH, C = R.courts[court] || R.courts.hollow;
  return { level: R.level, auto: R.auto, legion: R.legion, draft: R.draft, cap: R.cap, ...(C.start || {}) };
};
// ---------------------------------------------------------------- Chapter bosses (boss.js)
// Each campaign chapter ends with its own boss; the Endless Abyss brings them back in turn (BOSS_ORDER, by depth). They
// share the stats above and the three-phase frame below, and differ in look, names, a twist on the shared attacks and a
// signature attack of their own (BOSS_PHASES.rain / lances / smite / fan), weighed into each phase's pick by sigW:
//   twist: 1 none · 2 the slam bands burn · 3 frost shards erupt along the slam rings · 4 one extra ring per gap volley ·
//          5 phase III from 50% HP · 6 the slam bands leave tide pools · 7 brambles · 8 miasma clouds · 9 lightning falls
//          through the fight · 10 phase III from 50% HP and the dark pulls (gravity pulses toward the boss)
//   sig: summon (Husks and Ghouls rise around him) · rain (Cinder Rain: fire lobbed onto marked circles, leaving burning
//        ground) · lances (Glacier Lances: lanes of frost shards rippling out toward the Shepherd) · smite (pillars of
//        light fall where the Shepherd is, one after another) · fan (Blood Lances: aimed fans of blood orbs) ·
//        tidal (Tidal Lanes: marked lanes across the arena, then a wave runs down each) · roots (Root Snare: lines of thorns
//        toward the Shepherd that hold him fast) · spores (Blight Rain: spore pods that burst into miasma) · storm
//        (Tempest: lightning beams that turn around the boss) · echo (Nihl: every fallen boss's signature, one after another)
// phases: [title, how to survive it] per phase · dirge: the soft enrage's banner · roar: his roar's pitch ·
// voice: announcer lines `${voice}`, `${voice}_return` and `${voice}_slain` (src/assets/voice)
export const BOSSES = {
  gravemaw: { name: 'Gravemaw', title: 'the Hollow King', color: 0xff3df0, twist: 1, sig: 'summon', sigW: [0.25, 0, 0], roar: 1, voice: 'a_boss',
    phases: [['HOLLOW TREAD', 'Step between the slam rings'], ['EMBER LITURGY', 'Follow the gaps as the rings turn'], ['CROWN OF CINDERS', 'Circle with the spiral']],
    dirge: ['HOLLOW DIRGE', 'He keens for the dead: +50% damage and attack speed'] },
  pyrexa: { name: 'Pyrexa', title: 'the Cinder Matron', color: 0xff7a1a, twist: 2, sig: 'rain', sigW: [0.25, 0.25, 0.2], roar: 1.3, voice: 'a_pyrexa',
    phases: [['SMOULDER', 'Her slam rings burn: wait for the fire to die down'], ['FIRESTORM', 'Weave between the falling cinders'], ['PYRE ETERNAL', 'Circle with the flame spiral']],
    dirge: ['INFERNO', 'The pyre roars: +50% damage and attack speed'] },
  vaulkar: { name: 'Vaulkar', title: 'the Ossuary Colossus', color: 0x8f9cff, twist: 3, sig: 'lances', sigW: [0.25, 0.25, 0.2], roar: 0.7, voice: 'a_vaulkar',
    phases: [['BONE TREMOR', 'Frost shards rise where his rings land'], ['WHITE SILENCE', 'Step out of the glacier lances'], ['ABSOLUTE ZERO', 'Circle with the spiral']],
    dirge: ['DEEP FREEZE', 'The cold takes hold: +50% damage and attack speed'] },
  azrathel: { name: 'Azrathel', title: 'the Fallen Seraph', color: 0xb070ff, twist: 4, sig: 'smite', sigW: [0.25, 0.25, 0.2], roar: 0.9, voice: 'a_azrathel',
    phases: [['FALLEN GRACE', 'Keep moving: the light falls where you stand'], ['UNHOLY HYMN', 'One more ring in every volley'], ['LAST JUDGEMENT', 'Circle with the spiral']],
    dirge: ['DIVINE WRATH', 'Heaven burns: +50% damage and attack speed'] },
  vesperine: { name: 'Vesperine', title: 'the Crimson Queen', color: 0xff2e55, twist: 5, sig: 'fan', sigW: [0.25, 0.25, 0.2], roar: 1.15, voice: 'a_vesperine',
    phases: [['COURT OF BLOOD', 'Slip between the blood lances'], ['CRIMSON WALTZ', 'Follow the gaps as the rings turn'], ['BLOOD ECLIPSE', 'Her eclipse comes early: circle with the spiral']],
    dirge: ['BLOODLUST', 'She thirsts: +50% damage and attack speed'] },
  // Update 13: each later act ends with its own boss
  morwenna: { name: 'Morwenna', title: 'the Drowned Cantor', color: 0x2fe6c8, twist: 6, sig: 'tidal', sigW: [0.25, 0.25, 0.2], roar: 1.25, voice: 'a_morwenna',
    phases: [['LOW TIDE', 'Her slam rings leave tide pools: step out of the marked lanes before the wave runs'], ['DROWNING HYMN', 'Follow the gaps as the rings turn'], ['THE DEEP CHOIR', 'Circle with the spiral']],
    dirge: ['HIGH TIDE', 'The sea rises: +50% damage and attack speed'] },
  gorrath: { name: 'Gorrath', title: 'the Briar King', color: 0xc8e040, twist: 7, sig: 'roots', sigW: [0.25, 0.25, 0.2], roar: 0.7, voice: 'a_gorrath',
    phases: [['THORN CROWN', 'His slam rings leave brambles: step around them'], ['ROOT SNARE', 'Step between the thorn lines or be held fast'], ['THE WILD HUNT', 'Circle with the spiral']],
    dirge: ['OVERGROWTH', 'The forest wakes: +50% damage and attack speed'] },
  mire: { name: 'Mother Mire', title: 'the Plague Bloom', color: 0x9cff3a, twist: 8, sig: 'spores', sigW: [0.25, 0.25, 0.2], roar: 0.85, voice: 'a_mire',
    phases: [['SPORE SEASON', 'Her slam rings leave miasma: keep out of the clouds'], ['BLIGHT RAIN', 'Weave between the falling spore pods'], ['THE GREAT ROT', 'Circle with the spiral']],
    dirge: ['PESTILENCE', 'The rot blooms: +50% damage and attack speed'] },
  kaelthar: { name: 'Kaelthar', title: 'the Storm Herald', color: 0x7fd4ff, twist: 9, sig: 'storm', sigW: [0.25, 0.25, 0.2], roar: 1.05, voice: 'a_kaelthar',
    phases: [['GATHERING STORM', 'Lightning falls around him: watch the marks'], ['TEMPEST', 'Outrun the turning lightning beams'], ['THE LAST THUNDER', 'Circle with the spiral']],
    dirge: ['MAELSTROM', 'The storm breaks: +50% damage and attack speed'] },
  nihl: { name: 'Nihl', title: 'the First Night', color: 0xd0b8ff, twist: 10, sig: 'echo', sigW: [0.3, 0.3, 0.25], roar: 0.6, voice: 'a_nihl',
    phases: [['EVENTIDE', 'The dark pulls you in: walk against it'], ['ECHOES OF THE FALLEN', 'Every fallen realm returns: read each mark'], ['THE FIRST NIGHT', 'Its night comes at half its strength: circle with the spiral']],
    dirge: ['ENDLESS NIGHT', 'The stars go out: +50% damage and attack speed'] },
};
export const BOSS_ORDER = ['gravemaw', 'pyrexa', 'vaulkar', 'azrathel', 'vesperine']; // Act I's bosses: the Boss Rush's Hollow Court
// the Endless Abyss brings all ten back in turn, Act I's then the act finales' (Update 14), by depth
export const ENDLESS_BOSSES = [...BOSS_ORDER, 'morwenna', 'gorrath', 'mire', 'kaelthar', 'nihl'];
export const LATE_BOSSES = ['morwenna', 'gorrath', 'mire', 'kaelthar', 'nihl']; // the bosses of Acts II–VI (Update 13)
// A returning boss (chapter tier > 1) fights harder: attack rate × (1 + rate × (tier − 1)), one more gap-ring wave from
// tier 3, and its soft enrage `dirge` s sooner per tier (never before `dirgeMin` s). Its banner carries the act's epithet.
export const BOSS_TIER = { rate: 0.06, waveFrom: 3, dirge: 12, dirgeMin: 120 };
/** The boss a run faces next: its chapter's, or in the Endless Abyss the next in turn by depth. */
export const bossFor = (ch, depth = 0) => (ch.endless ? ENDLESS_BOSSES[depth % ENDLESS_BOSSES.length] : ch.bossId || 'gravemaw');
// The chapter bosses' three-phase fight (boss.js). Seconds, metres, radians; dmg values are × the boss's touch damage.
// Every damaging telegraph is >= minTele (accessibility floor) in every chapter, phase and enrage state.
export const BOSS_PHASES = {
  minTele: 1.0,
  rise: 1.4,                      // rises out of the ground, immune
  minPhase: [18, 14],             // phases I and II play at least this long; hit the tick sooner and he is warded (IMMUNE) there until then
  wardBreak: 0.05,                // damage poured into the ward shortens it: 1 s per this share of his max HP
  arena: { radius: 18, closeTo: 12, closeTime: 4, seal: 1.2, soft: 1.1, push: 14, hard: 0.35 }, // soft: push-back zone, hard: closest approach to the wall
  // from = HP fraction where the phase begins. speed = chase speed ×, rate = attack rate × (recoveries ÷ rate).
  // weights: the shared attacks; each boss adds its signature attack (sig) at its sigW for the phase. Names: BOSSES.phases.
  phases: [
    { from: 1, speed: 1, rate: 1, slamTele: 1.2, orb: 1, weights: { slam: 0.42, ring: 0.33 } },
    { from: 0.66, speed: 1.15, rate: 1.25, slamTele: 1.1, orb: 1.1, weights: { slam: 0.4, rings: 0.6 } },
    { from: 0.33, speed: 1.35, rate: 1.35, slamTele: 1.0, orb: 1.2, weights: { slam: 0.3, rings: 0.3, spiral: 0.4 } },
  ],
  transition: { dur: 2, slow: 0.3, slowDur: 0.45, flash: 0.55, push: 7, pushR: 9, knockR: 9, knock: 9 }, // push: Shepherd m/s, knock: horde impulse
  slam: { radii: [3, 6, 9], halfW: 0.65, every: 0.3, dmg: 1.4, minionDmg: 0.7, range: 13, recover: 1.9 },
  ring: { n: 24, gaps: 2, gapSlots: 3, speed: 6, dmg: 0.6, tele: 1.0, every: 0.45, waves: 1, recover: 1.6 },
  rings: { waves: 3, every: 0.5, turn: 0.35, recover: 1.7 }, // rotating gap rings: each wave turns its gaps by `turn`
  spiral: { arms: 4, dur: 2.5, every: 0.09, spin: 0.75, speed: 5.5, dmg: 0.55, tele: 1.0, recover: 1.5 },
  // Hollow aura: he sears a swarm of minions this close (× his damage per second): none below `from` in reach, full at `full`
  aura: { r: 3.2, dps: [0, 0, 1.5], from: 12, full: 32 },
  summon: { n: 6, r: 3.2, tele: 1.0, recover: 1.4 },
  // signature attacks; [a, b, c] = by phase
  rain: { n: [5, 7, 9], first: 0.35, spread: [1.6, 5.5], every: 0.16, flight: 1.1, radius: 1.45, height: 4, dmg: 0.6, recover: 1.5 }, // first: lead (s) on the Shepherd's path
  lances: { lanes: [3, 4, 5], arc: 0.42, shards: 6, from: 2.2, step: 1.25, tele: 1.0, every: 0.12, r: 0.7, life: 2.0, dmg: 0.5, recover: 1.4 },
  smite: { n: [3, 4, 5], every: 0.6, tele: 1.1, r: 2.1, lead: 0.45, dmg: 1.1, minionDmg: 0.6, recover: 1.5 },
  fan: { volleys: [2, 3, 3], n: 7, arc: 0.95, windup: 1.0, every: 0.45, speed: 8, dmg: 0.55, recover: 1.4 },
  waves: { first: 4, every: [12, 15], size: [12, 16], arc: 2.4, tele: 1.0, minDist: 7 }, // edge waves from phase II
  trickle: { rate: 1.2, max: [70, 45, 45], minDist: 9 }, // the whole fight, from the arena edge; max alive per phase
  dirge: { at: 180, dmg: 1.5, rate: 1.5 }, // "Hollow Dirge" soft enrage, seconds after he rises
  nova: { mul: 0.5, cap: 0.25 }, // Soul Nova (and soul bursts) hurt him at 50%, at most 25% of his max HP per Nova
  // twists (BOSSES.twist): 2 fire rings, 3 frost shards, 4 one extra ring per volley, 5 phase III at 50%
  fire: { life: 3, dmg: 0.35 },
  frost: { life: 3.5, n: [4, 7, 10], r: 0.75, dmg: 0.35 },
  extraRing: 1,
  ch5Crown: 0.5,
  // Update 13's signatures and twists ([a, b, c] = by phase)
  tidal: { lanes: [2, 3, 4], w: 1.3, len: 30, spread: [-4, 4], tele: 1.2, every: 0.35, dmg: 0.6, knock: 8, minionDmg: 0.6, recover: 1.5 },
  roots: { lanes: [2, 3, 4], arc: 0.38, spikes: 7, from: 2, step: 1.3, tele: 1.0, every: 0.1, r: 0.75, life: 1.6, dmg: 0.45, root: 0.6, recover: 1.4 },
  spores: { n: [4, 6, 8], first: 0.35, spread: [2, 6], every: 0.18, flight: 1.15, radius: 1.3, height: 4.5, dmg: 0.5, cloud: 2.6, life: 6, recover: 1.5 },
  storm: { beams: [2, 3, 4], len: 16, w: 0.7, tele: 1.2, dur: 3.2, spin: 0.62, dmg: 0.5, hitCd: 0.6, inner: 1.6, recover: 1.5 },
  echo: ['rain', 'lances', 'smite', 'fan', 'tidal', 'roots', 'spores', 'storm'],
  tide: { r: 2.2, life: 6, n: [4, 6, 8] },     // twist 6: tide pools left along the slam bands
  thorn: { r: 1.1, life: 5, n: [5, 8, 11] },   // twist 7: brambles along the slam bands
  rot: { r: 2.0, life: 6, n: [2, 3, 4] },      // twist 8: miasma clouds along the slam bands
  thunder: { every: [2.6, 3.8] },              // twist 9: a lightning strike near the Shepherd this often (HAZARDS.lightning)
  well: { every: [7, 9], warn: 1.2, pull: 1.4, strength: 4.5, r: 14 }, // twist 10: the dark pulls him toward the boss
};
export const ELITE = { hpMul: 6, scale: 1.35, dmgMul: 1.5, crown: 0xffd04a };

// ---------------------------------------------------------------- Elite affixes and run events (affixes.js, events.js)
// Every elite the director raises rolls `count` affixes (`late` from Chapter `lateFrom` and in Endless), plus
// run.diff.eliteAffixes when a difficulty sets it. Each affix pays `gold` bonus gold on the kill. A first run's
// elites roll only from `tutorial`. Champions raised from affixed elites keep none of them.
//   warded: a soul ward worth `share` × max HP soaks `cut` of every hit until it breaks, then a `stagger` s stagger
//   splitter: on death, n [min, max] non-elite, chest-less copies with `hp` × the type's normal HP, `speed` ×, `scale` ×
//   vampiric: heals `heal` × max HP whenever another enemy dies within `r` m (at most once per `cd` s)
//   hasted: move speed ×
//   commander: enemies within `r` m move and hit `speed` / `dmg` × harder; its death routs them
//     (a `knock` m/s shove, then `slow` × speed for `rout` s)
export const AFFIXES = {
  count: 1, late: 2, lateFrom: 4, gold: 40, tutorial: ['warded', 'hasted'],
  warded:    { name: 'Warded',    color: '#9ff0ff', desc: 'Shatter its soul ward',      share: 0.35, cut: 0.7, stagger: 0.9 },
  splitter:  { name: 'Splitter',  color: '#ffa25a', desc: 'Splits apart in death',      n: [3, 4], hp: 0.9, speed: 1.35, scale: 0.78 },
  vampiric:  { name: 'Vampiric',  color: '#ff4a62', desc: 'Feeds on nearby deaths',     heal: 0.04, r: 6, cd: 0.35 },
  hasted:    { name: 'Hasted',    color: '#ffc46a', desc: 'Unnaturally swift',          speed: 1.45 },
  commander: { name: 'Commander', color: '#ffe07a', desc: 'Rallies the horde, slay it to rout them', r: 6, speed: 1.25, dmg: 1.25, rout: 2, slow: 0.4, knock: 7 },
};
export const AFFIX_IDS = ['warded', 'splitter', 'vampiric', 'hasted', 'commander'];
// Mid-run events: one at a time, the first at `first` [min, max] s, then every `every` [min, max] s, inside [from, to]
// (Endless keeps rolling: no `to`). Never within `clear` s of a gate pair or an elite, `swarm` s of a swarm ring, or
// `bossGap` s before the boss; a first run waits until `tutorialFrom`. Each appears `dist` m from the Shepherd, clear
// of hazards and gates, and simply lapses if ignored.
//   thief: flees for `life` s at `speed` m/s (idle `wake` s unless the Shepherd comes within `alert` m; beyond `far` m
//     it dawdles at `dawdle` ×); hp × husk-scaled HP; the kill pays gold[0] + gold[1] × chapter and `xp` × a level of XP
//   shrine: stand inside `r` m for `hold` s (progress drains at `drain` × when outside) for a 1-of-3 blessing lasting `buff` s
//   coffin: `hp` (husk-scaled); breaking it releases `wave` foes `ring` m around it and a chest-less mini-elite
//     (`mini`: HP and size × an elite's); clear them, or last `reward` s, for a Relic Chest
export const RUN_EVENTS = {
  from: 60, to: 320, first: [62, 80], every: [80, 110], clear: 8, swarm: 5, bossGap: 40, tutorialFrom: 150, dist: 12,
  weights: { thief: 1, shrine: 1, coffin: 1 },
  thief:  { name: 'Soul Thief', life: 18, hp: 125, speed: 5.0, wake: 1.2, alert: 8, far: 15, dawdle: 0.55, escape: 40, gold: [100, 40], xp: 1 },
  shrine: { name: 'Shrine of Souls', life: 28, r: 1.9, hold: 2.5, drain: 1.5, buff: 60 },
  coffin: { name: 'Cursed Coffin', life: 30, hp: 150, wave: 20, ring: [2.2, 4.6], mini: { hp: 0.5, scale: 0.85, types: ['husk', 'brute', 'witch'] }, reward: 20 },
};
// Shrine of Souls blessings (a pick of 3): xp ×, minionDmg ×, speed ×, magnet (every shard and pickup flies in), raise +pp
// ---------------------------------------------------------------- Soul Urns (urns.js; GDD §4.10)
// Funerary urns rise around the map: the first at `first` s, then one every `every` s (±25%), `dist` m from the
// Shepherd (ahead of him first, clear of hazards, the gates and each other), at most `max` standing; one crumbles once
// he leaves it `far` m behind. Walking into an urn (within `touch` m) smashes it and spills one offering, drawn by
// `loot` weight (hearts and magnets are the pickups' own; the rest are OFFERINGS). None in the tutorial.
export const URNS = { first: 18, every: 14, dist: [9, 15], max: 3, touch: 1.3, far: 46,
  loot: { heart: 16, magnet: 12, knell: 16, frost: 12, lantern: 16, gold: 18, horn: 10 } };
// knell: every foe within r m loses frac of its max HP (elites eliteFrac, the boss bossFrac; never an event creature);
// frost: every foe within r m is stunned `stun` s (the boss's next attack only slips, as for a Rite); lantern: the
// Soul Feast blessing (double XP) for dur s; gold: +gold run gold; horn: n Shades rise around the Shepherd (under the cap)
export const OFFERINGS = {
  knell: { name: 'Death Knell', icon: 'pulse', r: 11, frac: 0.6, eliteFrac: 0.25, bossFrac: 0.04 },
  frost: { name: 'Frost Hourglass', icon: 'hourglass', r: 14, stun: 3 },
  lantern: { name: 'Soul Lantern', icon: 'lantern', dur: 15 },
  gold: { name: 'Gilded Skull', icon: 'coin', gold: 60 },
  horn: { name: 'Ossuary Horn', icon: 'banner', n: 8 },
};

export const BLESSINGS = {
  feast:  { name: 'Soul Feast',    icon: 'star',   desc: 'Double XP from soul shards',           xp: 2 },
  wrath:  { name: 'Legion Wrath',  icon: 'fang',   desc: 'Minions deal +50% damage',             minionDmg: 1.5 },
  stride: { name: 'Wraith Stride', icon: 'wing',   desc: '+30% move speed',                      speed: 1.3 },
  tide:   { name: 'Soul Tide',     icon: 'magnet', desc: 'Every shard and treasure flies to you', magnet: true },
  call:   { name: 'Open Graves',   icon: 'raise',  desc: '+20% Raise Chance',                    raise: 0.2 },
};

// ---------------------------------------------------------------- The campaign (GDD §8)
// Six acts of five chapters. Act I (the Waking Dark) is the first five; Update 13 (2026-10-10) added Acts II–VI. Each act
// has its own realm (biome: painted floors, props and weather, world.js / weather.js), its own ground hazard and its own
// foe, and ends with its own boss; its other chapters bring earlier bosses back stronger (`tier`), under the act's epithet.
const PARADE = [45, 75, 110, 150, 185, 225, 255, 290]; // the doubled elite times of the parade chapters (5, 9, 20, 23, 29)
export const ACTS = [
  { n: 1, name: 'The Waking Dark',   from: 1,  to: 5,  epithet: '',            css: '#4ef2ff', hazard: 'Each chapter its own twist', foe: '' },
  { n: 2, name: 'The Drowned Coast', from: 6,  to: 10, epithet: 'Drowned',     css: '#2fe6c8', hazard: 'Tide pools', foe: 'siren' },
  { n: 3, name: 'The Thornwood',     from: 11, to: 15, epithet: 'Thornbound',  css: '#c8e040', hazard: 'Brambles', foe: 'thornback' },
  { n: 4, name: 'The Plague Fens',   from: 16, to: 20, epithet: 'Blighted',    css: '#9cff3a', hazard: 'Miasma', foe: 'rat' },
  { n: 5, name: 'The Storm Spire',   from: 21, to: 25, epithet: 'Stormforged', css: '#7fd4ff', hazard: 'Lightning', foe: 'caller' },
  { n: 6, name: 'The Hollow Moon',   from: 26, to: 30, epithet: 'Moonless',    css: '#d0b8ff', hazard: 'Gravity wells', foe: 'stalker' },
];
export const CAMPAIGN_LENGTH = 30;
export const ENDLESS_ID = 100; // the Endless Abyss's id (records, art, difficulty); it was 6 while the campaign had five chapters
export const actOf = (id) => ACTS[Math.min(ACTS.length, Math.max(1, Math.ceil(id / 5))) - 1];

// Scaling by chapter level: a campaign chapter's level is its number; the Endless Abyss plays at level 6 (as it always
// has). Chapters 1–5 keep their tuning. The Shepherd's side (minion damage, Soul Nova, Rites) grows by side per level and
// keeps growing; from Chapter 6 his weapons grow with it (× side(c) / side(5)). The horde's HP grows with the same and
// `press` more per chapter from Chapter 6, and its damage by `dmg` per level up to 6, then by `dmgLate` per chapter: the
// press is what the Shepherd's own growth (talents, relics, stars, mastery) has to answer (scripts/balance.mjs).
export const SCALE = { side: 0.45, dmg: 0.35, press: 1.015, dmgLate: 1.012, minionHp: 0.4, bossDmg: 0.3, rate: 0.016, rateMax: 2.0 };
export const chapterLevel = (ch) => (ch && (ch.lvl || ch.id)) || 1;
export const sideScale = (lvl) => 1 + SCALE.side * (lvl - 1);
export const weaponScale = (lvl) => (lvl <= 5 ? 1 : sideScale(lvl) / sideScale(5));
export const foeDmgScale = (lvl) => (lvl <= 6 ? 1 + SCALE.dmg * (lvl - 1) : (1 + 5 * SCALE.dmg) * SCALE.dmgLate ** (lvl - 6));
export const minionHpScale = (lvl) => (lvl <= 6 ? 1 + SCALE.minionHp * (lvl - 1) : (1 + 5 * SCALE.minionHp) * SCALE.dmgLate ** (lvl - 6));
export const bossDmgScale = (lvl) => (lvl <= 6 ? 1 + SCALE.bossDmg * (lvl - 1) : (1 + 5 * SCALE.bossDmg) * SCALE.dmgLate ** (lvl - 6));
const lateHp = (c) => 7.5 * weaponScale(c) * SCALE.press ** (c - 5);
const lateRate = (c) => Math.min(SCALE.rateMax, 1.6 + SCALE.rate * (c - 5));

// Each chapter re-tints the world. Colors are hex ints for three.js. boss / bossId: its boss's colour and id (BOSSES);
// tier: how many acts since the boss's own (1 in its own act; a returning boss is stronger, BOSS_TIER below).
// biome: the realm's props and weather · floor: its painted floor (world.js FLOORS) · art: CHAPTER_ART key (ui/art.js)
// mods = the chapter's identity, read by the director (run.js), enemies.js, hazards.js and player.js:
//   tag: run-start banner line · weights: spawn-weight multiplier per enemy type (an act foe only spawns where it is
//   weighted) · pack: Ghoul pack size [min, max]
//   burn: Witch lobs leave burning ground · vents / ice / hands / tide / brambles / miasma / lightning / gravity: ground
//   hazards (tuning in HAZARDS below)
//   vignette: fog vignette strength for the run (engine default 1.0) · sight: metres before the ground fades to fog (default 22)
//   elites: elite spawn times in seconds
//   rotate (Endless): the chapter mods used at abyss depth 1, 2, 3… (cycles)
const PAL = { // by act: ground, groundB, rune, fog, rim, enemy
  2: [0x2a4a4e, 0x0e2026, 0x2fe6c8, 0x02090b, 0x8ff0e0, 0xff6a3a],
  3: [0x3a4026, 0x181c0e, 0xc8e040, 0x060803, 0xdbe89a, 0xff5a2e],
  4: [0x3a3046, 0x171222, 0x9cff3a, 0x070509, 0xcaff9a, 0xff7a2e],
  5: [0x36404e, 0x141a24, 0x7fd4ff, 0x03060b, 0xbfe6ff, 0xff5a2e],
  6: [0x44445a, 0x1a1828, 0xd0b8ff, 0x050409, 0xe2d8ff, 0xff6a4a],
};
const BIOME = { 2: 'drowned', 3: 'thorn', 4: 'fen', 5: 'storm', 6: 'moon' };
const later = (id, name, bossId, tier, floor, mods) => {
  const act = Math.ceil(id / 5), p = PAL[act];
  return { id, act, name, ground: p[0], groundB: p[1], rune: p[2], fog: p[3], rim: p[4], enemy: p[5], boss: 0, bossId, tier,
    hpMul: +lateHp(id).toFixed(2), rate: +lateRate(id).toFixed(3), biome: BIOME[act], floor, art: id, mods };
};
export const CHAPTERS = [
  { id: 1, act: 1, name: 'Ashen Necropolis', ground: 0x3a4658, groundB: 0x1c2330, rune: 0x2ad8ff, fog: 0x04070c, rim: 0x6fd8ff, enemy: 0xff5a2e, boss: 0xff3df0, bossId: 'gravemaw', tier: 1, hpMul: 1.0,  rate: 1.0,
    biome: 'necropolis', floor: 'necropolis', art: 1, mods: {} },
  { id: 2, act: 1, name: 'Ember Wastes',     ground: 0x4a3226, groundB: 0x241510, rune: 0xff8a2a, fog: 0x0b0503, rim: 0xffb37a, enemy: 0xff3a3a, boss: 0xff7a1a, bossId: 'pyrexa', tier: 1, hpMul: 1.9,  rate: 1.15,
    biome: 'ember', floor: 'ember', art: 2, mods: { tag: 'The witches’ fire lingers', weights: { witch: 1.8 }, burn: true, vents: true } },
  { id: 3, act: 1, name: 'Frozen Ossuary',   ground: 0x51637c, groundB: 0x26324a, rune: 0x9fe4ff, fog: 0x060b14, rim: 0xbfeaff, enemy: 0xff4f6a, boss: 0x8f9cff, bossId: 'vaulkar', tier: 1, hpMul: 3.2,  rate: 1.3,
    biome: 'ossuary', floor: 'ossuary', art: 3, mods: { tag: 'Ghoul packs hunt on treacherous ice, and the Corpse Priests tend the dead', weights: { ghoul: 1.5, priest: 1.6 }, pack: [6, 8], ice: true } },
  { id: 4, act: 1, name: 'Abyssal Cathedral',ground: 0x3a2e4e, groundB: 0x1a1226, rune: 0xa35bff, fog: 0x06030c, rim: 0xd2a8ff, enemy: 0xff5a2e, boss: 0xb070ff, bossId: 'azrathel', tier: 1, hpMul: 5.0,  rate: 1.45,
    biome: 'cathedral', floor: 'cathedral', art: 4, mods: { tag: 'Bloaters swarm, Wraiths drift in and the abyss reaches up', weights: { bloater: 2, wraith: 1.6 }, vignette: 1.25, sight: 17, hands: true } },
  { id: 5, act: 1, name: 'Crimson Throne',   ground: 0x4a2228, groundB: 0x220e12, rune: 0xff2e55, fog: 0x0a0204, rim: 0xff9aaa, enemy: 0xffb02e, boss: 0xff2e55, bossId: 'vesperine', tier: 1, hpMul: 7.5,  rate: 1.6,
    biome: 'throne', floor: 'throne', art: 5, mods: { tag: 'The gilded court rises: twice the elites', weights: { brute: 1.6 }, elites: PARADE } },
  // Act II: the Drowned Coast. Tide pools drag at the Shepherd; Drowned Sirens sing the legion still.
  later(6, 'Sunken Choir', 'gravemaw', 2, 'drowned', { tag: 'Tide pools drag at your feet, and Drowned Sirens sing your legion still', tide: true, weights: { siren: 1 } }),
  later(7, 'Saltgrave Shore', 'pyrexa', 2, 'shore', { tag: 'Ghoul packs hunt the shore between the tide pools', tide: true, weights: { siren: 1, ghoul: 1.6 }, pack: [6, 8] }),
  later(8, 'Wreck of the Last Ark', 'vaulkar', 2, 'shore', { tag: 'Witch fire burns on the wrecks, and the tide runs high', tide: true, burn: true, weights: { siren: 1.2, witch: 1.6 } }),
  later(9, 'Lighthouse of Lost Souls', 'azrathel', 2, 'drowned', { tag: 'The lighthouse calls the gilded dead: twice the elites', tide: true, weights: { siren: 1.3 }, elites: PARADE }),
  later(10, 'The Abyssal Choir', 'morwenna', 1, 'drowned', { tag: 'The whole choir sings: Sirens swarm the drowned nave', tide: true, weights: { siren: 2.2, wraith: 1.4 }, vignette: 1.15, sight: 19 }),
  // Act III: the Thornwood. Brambles cut and slow; Thornbacks charge down marked lanes.
  later(11, 'Witherwood Edge', 'vesperine', 2, 'thornwood', { tag: 'Brambles bite, and Thornbacks charge from the trees', brambles: true, weights: { thornback: 1 } }),
  later(12, 'The Hanging Grove', 'gravemaw', 3, 'grove', { tag: 'Ghoul packs drop from the gallows boughs', brambles: true, weights: { thornback: 1, ghoul: 1.6 }, pack: [6, 8] }),
  later(13, 'Briar Labyrinth', 'pyrexa', 3, 'thornwood', { tag: 'The maze closes in: short sight and thorns on every side', brambles: true, weights: { thornback: 1.3, priest: 1.4 }, vignette: 1.25, sight: 16 }),
  later(14, 'Rotheart Hollow', 'morwenna', 2, 'grove', { tag: 'Bloaters swell on the rotting heart', brambles: true, weights: { thornback: 1.2, bloater: 1.8 } }),
  later(15, 'The Thorn Throne', 'gorrath', 1, 'thornwood', { tag: 'The Briar King’s court: Thornbacks stampede', brambles: true, weights: { thornback: 2, brute: 1.4 } }),
  // Act IV: the Plague Fens. Miasma clouds drift over the mire; Plague Rats come in swarms.
  later(16, 'Mirewood Fen', 'vaulkar', 4, 'fen', { tag: 'Plague miasma drifts over the mire, and the rats come in swarms', miasma: true, weights: { rat: 1 } }),
  later(17, 'Gallows Bog', 'azrathel', 4, 'fen', { tag: 'Wraiths drift through the fog of the gallows', miasma: true, weights: { rat: 1, wraith: 1.8 } }),
  later(18, 'Leper’s Crossing', 'vesperine', 4, 'fen', { tag: 'The pyres burn: Witch fire lingers on the crossing', miasma: true, burn: true, weights: { rat: 1.2, witch: 1.6 } }),
  later(19, 'The Rotting Abbey', 'gorrath', 2, 'fungal', { tag: 'Corpse Priests tend the plague dead in the abbey', miasma: true, weights: { rat: 1, priest: 2, bloater: 1.5 } }),
  later(20, 'Mother of Rot', 'mire', 1, 'fungal', { tag: 'The Mother’s brood: rat swarms and twice the elites', miasma: true, weights: { rat: 2, bloater: 1.4 }, elites: PARADE }),
  // Act V: the Storm Spire. Lightning falls on marked ground; Stormcallers bring it down in lines.
  later(21, 'Thunderstep Pass', 'gravemaw', 5, 'slate', { tag: 'Lightning strikes where you stand, and Stormcallers bring it down', lightning: true, weights: { caller: 1 } }),
  later(22, 'The Shattered Bridges', 'pyrexa', 5, 'peak', { tag: 'Ice on the bridges and lightning in the clouds', lightning: true, ice: true, weights: { caller: 1, ghoul: 1.4 } }),
  later(23, 'Galebreak Monastery', 'vaulkar', 5, 'slate', { tag: 'The bells toll for the gilded dead: twice the elites', lightning: true, weights: { caller: 1.3 }, elites: PARADE }),
  later(24, 'Eye of the Tempest', 'mire', 2, 'peak', { tag: 'The storm’s eye: ember vents and lightning', lightning: true, vents: true, weights: { caller: 1.4, witch: 1.4 } }),
  later(25, 'The Storm Spire', 'kaelthar', 1, 'slate', { tag: 'The Herald’s choir of storms: Stormcallers everywhere', lightning: true, weights: { caller: 2.2, brute: 1.4 } }),
  // Act VI: the Hollow Moon. Gravity wells pull the Shepherd in; Void Stalkers blink beside him.
  later(26, 'Moonfall Steps', 'azrathel', 6, 'regolith', { tag: 'Gravity wells pull at you, and Void Stalkers blink close', gravity: true, weights: { stalker: 1 } }),
  later(27, 'The Silent Sea', 'vesperine', 6, 'regolith', { tag: 'Abyssal hands reach from the dust', gravity: true, hands: true, weights: { stalker: 1.2, wraith: 1.4 } }),
  later(28, 'Orrery of Bones', 'kaelthar', 2, 'starfloor', { tag: 'The orrery turns: the tides and thorns of fallen realms', gravity: true, tide: true, brambles: true, weights: { stalker: 1.2, siren: 1, thornback: 1 } }),
  later(29, 'The Last Cathedral', 'morwenna', 5, 'starfloor', { tag: 'Every realm’s dead march: twice the elites', gravity: true, miasma: true, weights: { stalker: 1.3, rat: 1, caller: 1 }, elites: PARADE }),
  later(30, 'The Hollow Moon', 'nihl', 1, 'starfloor', { tag: 'The First Night falls: gravity, lightning and the Stalkers', gravity: true, lightning: true, weights: { stalker: 2, caller: 1.2 }, vignette: 1.2, sight: 18 }),
];
for (const c of CHAPTERS) if (!c.boss) c.boss = BOSSES[c.bossId].color;
// Unlocked by clearing Chapter 5. No time limit; the run ends when you fall. It plays at chapter level 6.
export const ENDLESS = { id: ENDLESS_ID, lvl: 6, act: 0, name: 'Endless Abyss', endless: true, ground: 0x2c2848, groundB: 0x120e22, rune: 0x6b7bff, fog: 0x05040c, rim: 0xa8b4ff, enemy: 0xff4a6a, boss: 0xff3df0, hpMul: 4.0, rate: 1.4,
  biome: 'abyss', floor: 'abyss', art: 'endless', mods: { rotate: [2, 3, 4, 5, 7, 13, 18, 22, 27] } }; // Act I's twists, then one chapter of each later act (its hazard and foe; Update 14)
export const ENDLESS_UNLOCK = 6; // chapter.unlocked: a first Chapter 5 clear opens it
// Campaign rewards past Act I (economy.applyRunResult): clear gems stop growing at Chapter 10; a Normal first clear pays
// 40 + 18c gems and a Sigil in Act I, then `late` gems and a Sigil, and an act's last chapter (its own boss) `finale`
// gems and `finaleSigils`; the boss's Normal hoard improves by act (rarity odds, rolled from the top down)
export const CAMPAIGN_REWARDS = { clearGemsCap: 10, late: 100, finale: 250, finaleSigils: 3,
  hoard: [[2, { common: 0.5, rare: 0.5 }], [10, { common: 0.325, rare: 0.325, epic: 0.35 }], [20, { rare: 0.5, epic: 0.5 }], [30, { rare: 0.3, epic: 0.67, legendary: 0.03 }]] };
export const firstClearGems = (c) => (c <= 5 ? 40 + 18 * c : c % 5 === 0 ? CAMPAIGN_REWARDS.finale : CAMPAIGN_REWARDS.late);
export const firstClearSigils = (c) => (c > 5 && c % 5 === 0 ? CAMPAIGN_REWARDS.finaleSigils : 1);
export const normalHoard = (c) => CAMPAIGN_REWARDS.hoard.find(([to]) => c <= to)[1];
/** A chapter by id (the Endless Abyss by ENDLESS_ID); an unknown id falls back to Chapter 1. */
export const chapterById = (id) => (+id === ENDLESS_ID ? ENDLESS : CHAPTERS[(+id || 1) - 1] || CHAPTERS[0]);
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
  // Update 13's realms (dmg / dps values are chapter-1, minute-0 and scale like enemy damage):
  //   tide: pools on a hash grid; in one the Shepherd moves at ×speed (Act II)
  //   brambles: patches on a hash grid; in one he moves at ×speed and is cut for dps (Act III). A Thornback's charge
  //     leaves short-lived patches (trail: radius, life) every `every` m
  //   miasma: n poison clouds drift past him (radius range, drift m/s, placed near–far m ahead, life s); inside, dps (Act IV)
  //   lightning: a strike every `every` s where he will be `lead` s ahead (± jitter m); telegraph `warn` s, then dmg to him
  //     and foeHit × a Husk's HP (at the run's scaling) to foes within radius: it burns the horde too (Act V)
  //   gravity: wells on a hash grid; each pulses every `period` s: `warn` s gathering, then `pull` s drawing him toward its
  //     centre (strength m/s at the core, fading to 0 at radius); the core (coreR) hurts once a pulse (Act VI)
  tide: { cell: 13, chance: 0.5, radius: [2.4, 4.0], speed: 0.72 },
  brambles: { cell: 12, chance: 0.42, radius: [1.5, 2.6], speed: 0.85, dps: 5, trail: { r: 1.0, life: 4, every: 1.3 } },
  miasma: { n: 3, radius: [2.6, 3.8], drift: 1.0, near: 6, far: 16, dps: 6, life: [14, 22] },
  lightning: { every: [3.5, 5.5], lead: 0.5, jitter: 2.2, radius: 1.5, warn: 1.1, dmg: 14, foeHit: 1.6 },
  gravity: { cell: 16, chance: 0.4, radius: 6, coreR: 1.3, period: [7, 9.5], warn: 1.2, pull: 1.6, strength: 5, dmg: 12 },
};
export const RUN_LENGTH = 360; // seconds until the boss arrives
export const ENDLESS_BOSS_EVERY = 300; // Endless Abyss: a boss every 5:00 (the ten in turn, ENDLESS_BOSSES), stronger each time
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
  // `chains` per cast (each from its own first foe, never sharing a link); from Lv4 each chain's first foe is pinned `stun` s,
  // a foe at most once per pinCd s (so the nearest Brute or Bloater can't be held off its slam or fuse forever)
  chains: {
    type: 'weapon', name: 'Ashen Chains', icon: 'chain', max: 5,
    dmg: L([18, 23, 29, 37, 44]), jumps: L([3, 4, 5, 6, 5]), chains: L([1, 1, 1, 1, 2]), stun: L([0, 0, 0, 0.25, 0.25]), pinCd: 2,
    cd: L([1.5, 1.4, 1.25, 1.1, 0.95]), range: 7.5,
    splash: 1.4, splashDmg: 0.5, // each link also scorches foes within 1.4 m of its target for 50%
    desc: (lv) => [`Burning chains leap between foes, scorching those beside them.`, `+1 jump`, `+1 jump, +damage`, `+1 jump, faster. The first foe is pinned`, `A second chain, searing damage`][lv - 1],
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
  // from Lv3 the wave chills what it strikes: × (1 - slow) speed for slowDur s (never the boss)
  gravePulse: {
    type: 'weapon', name: 'Grave Pulse', icon: 'pulse', max: 5,
    dmg: L([12, 16, 20, 25, 33]), radius: L([3.6, 4.0, 4.5, 5.0, 6.0]), cd: L([3.0, 2.8, 2.5, 2.2, 1.8]),
    slow: L([0, 0, 0.25, 0.25, 0.3]), slowDur: 1.5,
    desc: (lv) => [`Release a shockwave that hurls foes back.`, `+Damage, +radius`, `+Radius, faster. The wave chills foes, -25% speed`, `+Damage, faster`, `Massive cataclysm wave, -30% speed`][lv - 1],
  },
  // the Shepherd leaves witchfire where he walks (a patch every `gap` m, or at his feet every `idle` s standing still):
  // r m wide, burning `life` s for dps a second to foes inside (one tick every 0.25 s, the hottest patch only);
  // from Lv3 he also hurls `toss` lanterns every cd s at the nearest foe: tossDmg on the shatter and a poolR m pool.
  // The souls of foes witchfire kills fly to the Shepherd (they die behind him, on the path he has already walked)
  witchfire: {
    type: 'weapon', name: 'Witchfire Lantern', icon: 'lantern', max: 5, gap: 1.1, idle: 0.6,
    dps: L([14, 18, 24, 28, 37]), r: L([0.95, 1.05, 1.15, 1.3, 1.45]), life: L([2.2, 2.4, 2.6, 2.8, 3.2]),
    toss: L([0, 0, 1, 1, 2]), tossDmg: L([0, 0, 30, 38, 48]), poolR: L([0, 0, 2.2, 2.5, 2.8]), cd: L([2.8, 2.6, 2.4, 2.2, 2.0]),
    desc: (lv) => [`Your lantern drips witchfire where you walk. Foes burn in it.`, `+Damage, wider flames`, `Hurl a lantern that bursts into a burning pool`, `+Damage, bigger pools, faster`, `Two lanterns, blazing`][lv - 1],
  },
  // tombstones crash onto the horde: every cd s, `count` stones on its densest packs within `reach` m, each after a
  // `fall` s shadow; one hits everything within r m (× area) for dmg and hurls it out. The stones sink after `sink` s
  gravefall: {
    type: 'weapon', name: 'Gravefall', icon: 'tomb', max: 5, reach: 11, fall: 0.55, sink: 0.7,
    dmg: L([26, 32, 40, 50, 58]), count: L([1, 2, 2, 3, 4]), r: L([1.6, 1.7, 1.9, 2.1, 2.3]), cd: L([2.4, 2.2, 2.0, 1.8, 1.6]),
    desc: (lv) => [`Tombstones crash down on the thickest of the horde.`, `+1 tombstone`, `+Damage, wider impact`, `+1 tombstone, faster`, `+1 tombstone, crushing damage`][lv - 1],
  },
  // drain beams lock onto the toughest foes within range (the boss, then elites, then the most HP) and hold them until
  // they fall or escape; a beam on a common foe jumps to a boss or an unheld elite that comes into reach, and every beam
  // may take the boss. dps a second each in ticks of `tick` s; foes the beam passes through (within searR m) are seared
  // for `sear` of it. The Shepherd heals `leech` of the damage, at most healCap HP a second
  soulLeech: {
    type: 'weapon', name: 'Soul Leech', icon: 'leech', max: 5, tick: 0.2, healCap: 3, retarget: 0.6, sear: 0.4, searR: 0.6,
    dps: L([45, 58, 72, 90, 115]), beams: L([1, 1, 2, 2, 3]), range: L([6, 6.5, 7, 7.5, 8]), leech: L([0.04, 0.04, 0.05, 0.05, 0.06]),
    desc: (lv) => [`A drain beam latches onto the toughest foe near you and feeds you its life.`, `+Damage, longer reach`, `A second beam`, `+Damage, longer reach`, `A third beam, deeper drain`][lv - 1],
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
  graveWard: { type: 'passive', name: 'Grave Ward', icon: 'ward', max: 5, desc: () => `-6% damage taken` },
  dreadReach: { type: 'passive', name: 'Dread Reach', icon: 'reach', max: 5, desc: () => `+10% weapon area` },
};

// Banish: a level-up card's ✕ strikes that skill from the run's draws for good (not evolutions); perRun per run
export const BANISH = { perRun: 2 };
// Reroll: redraw the cards on a level-up or Relic Chest screen, as often as wanted, each time for `gems` Soul Gems or
// one rewarded ad (free with the Soul Pact, whose ads are skipped); never on a Shrine of Souls blessing
export const REROLL = { gems: 50 };

export const EVOLUTIONS = {
  // Tunables are read by weapons.js (and projectiles.js, legion.js). Radii are in metres, times in seconds, dmg before Might/crits.
  soulStorm: {
    name: 'Soul Storm', from: 'soulBolt', needs: 'might', icon: 'bolt', desc: 'EVOLVED: 6 bolts that detonate on impact. A kill splits the bolt in two.',
    split: 2, splitDmg: 0.5, splitR: 8,      // a bolt that kills splits into 2 mini-bolts (50% damage, no blast, no split) at foes within 8 m
  },
  boneCrown: {
    name: 'Bone Crown', from: 'skullHalo', needs: 'minionFury', icon: 'skull', desc: 'EVOLVED: 8 skulls. Skull kills always raise a soul. Minions near you strike harder and mend.',
    auraR: 6, auraDmg: 0.3,                  // minions within 6 m of the Shepherd deal +30%
    mend: 0.2, mendEvery: 4,                 // and every 4 s heal 20% of their max HP
  },
  harvestMoon: {
    name: 'Harvest Moon', from: 'scythe', needs: 'haste', icon: 'scythe', desc: 'EVOLVED: Twin moon blades orbit you. Scythe kills heal.',
    dmg: 46, arcs: 3, cd: 0.9,                                   // the periodic sweep (reach = scythe Lv5 radius)
    blades: 2, bladeDmg: 58, spin: 5.2, bladeHit: 1.3, bladeCd: 0.3, // orbiting crescents at max reach (rad/s); per-enemy hit cooldown
    heal: 1, healPerSec: 6,                                      // HP per scythe kill, capped by a bank that refills at healPerSec
  },
  chainsOfPerdition: {
    name: 'Chains of Perdition', from: 'chains', needs: 'frenzy', icon: 'chain', desc: 'EVOLVED: Twin 7-jump chains set foes ablaze. The burning rise more often.',
    dmg: 50, jumps: 7, chains: 2, stun: 0.25, // two 7-link chains; links prefer targets at least 1.6 m apart (max jump 4.5 m, as Lv5)
    minHop: 1.6,
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
  hallowPyre: {
    name: 'Hallow Pyre', from: 'witchfire', needs: 'raiseDead', icon: 'lantern', desc: 'EVOLVED: A river of witchfire and three lanterns at once. Foes slain in it burst, setting their neighbours alight.',
    dps: 52, r: 1.75, life: 3.6,                     // the trail
    toss: 3, tossDmg: 62, poolR: 3.0, cd: 1.8,       // the lanterns
    burst: 1.6, burstLife: 1.4, burstMax: 8,         // a witchfire kill leaves a burst pool this wide; at most burstMax a second
  },
  // the stones stand as graves for `grave` s; a foe slain within graveR m (× area) of a standing grave gets +raise pp
  // Raise Chance (still capped at 85%)
  necropolis: {
    name: 'Necropolis', from: 'gravefall', needs: 'legionCap', icon: 'tomb', desc: 'EVOLVED: Six tombstones at once. They stand as graves, and the slain beside them rise far more often.',
    count: 6, dmg: 70, r: 2.6, cd: 1.4, grave: 3, graveR: 3, raise: 0.4,
  },
  // twin beams fork from each target to the next foe within `fork` m; while the Shepherd is at full HP the stolen life
  // mends his most wounded minions instead
  vampiricCommunion: {
    name: 'Vampiric Communion', from: 'soulLeech', needs: 'graveWard', icon: 'leech', desc: 'EVOLVED: Four beams that fork into the horde. Stolen life heals you, then your legion.',
    beams: 4, dps: 165, range: 8.5, leech: 0.08, healCap: 6, fork: 3, forkDps: 0.6, mend: 3,
  },
  requiem: {
    name: 'Requiem', from: 'gravePulse', needs: 'soulMagnet', icon: 'pulse', desc: 'EVOLVED: Drags the horde in, then detonates. Draws in soul shards.',
    dmg: 48, radius: 6.5, cd: 1.4,
    pull: 0.3, pullForce: 70, swirl: 0.35,   // 0.3 s inward drag (accel m/s², tangential share) before the blast
    slow: 0.3, slowDur: 1.5,                 // the blast chills, as the Lv5 pulse
    shardR: 12,                              // soul shards within 12 m fly to the Shepherd on each blast
  },
};

// ---------------------------------------------------------------- Soul Unions (Update 10; weapons.js, arsenal.js)
// When both evolutions of a pair are in the build, the pair's Union card enters the draw (weight 1,000, like an
// evolution). Taking it fuses the two weapons into one slot (a fifth weapon fits) and adds the pair's synergy. Every
// hero's signature weapon belongs to one pair; Necropolis stands alone.
export const UNIONS = {
  // every Requiem blast hurls a ring of `bolts` Soul Storm bolts outward, each curving onto a foe (blast and split as Soul Storm)
  starfall: { name: 'Starfall Requiem', of: ['soulStorm', 'requiem'], icon: 'bolt',
    desc: 'UNION: Every Requiem blast hurls a ring of 14 Soul Storm bolts into the horde. Frees a weapon slot.',
    bolts: 14, dmg: 56, pierce: 2 },
  // each moon blade leaves a witchfire patch every `gap` m of its path; a blade kill bursts into flame like a witchfire kill
  witchMoon: { name: 'Witch Moon', of: ['harvestMoon', 'hallowPyre'], icon: 'scythe',
    desc: 'UNION: The moon blades trail witchfire as they turn, and what they slay bursts into flame. Frees a weapon slot.',
    gap: 2, r: 1.7, life: 2.4, dps: 72 },
  // every Communion drain tick feeds Perdition's burn (`burn` × the tick, as a chain hit would); every chain link that
  // lands heals linkHeal HP from the Communion's heal bank (its 6 HP a second cap holds)
  bloodCovenant: { name: 'Blood Covenant', of: ['chainsOfPerdition', 'vampiricCommunion'], icon: 'chain',
    desc: 'UNION: Communion beams set their prey ablaze, and every chain link that lands feeds you life. Frees a weapon slot.',
    burn: 3, linkHeal: 0.6 },
  // every `every` s each skull of the crown hurls a bone spear at the nearest foe within `range` m of it, bursting into
  // Barrage shrapnel
  ossuaryCrown: { name: 'Ossuary Crown', of: ['boneCrown', 'ossuaryBarrage'], icon: 'skull',
    desc: 'UNION: Every 2 s each skull of the crown hurls a bone spear that bursts into shrapnel. Frees a weapon slot.',
    every: 2, dmg: 40, range: 12 },
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
// Tuned with bot sims so the Ch1 boss time-to-kill stays within ±25% of the all-Shade legion (see the GDD).
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
  // a risen Grave Wraith: a quick striker that passes through blows (its strikes cost it no recoil)
  phantom:   { from: 'wraith',  hp: 0.5,  dmg: 1.05, interval: 0.42, speed: 1.35, seek: 7.5, contact: 0.4, leash: 2, recoilMul: 0, scale: 0.9 },
  // a risen Corpse Priest: a weak striker that stays near the Shepherd and mends the minions within healR m by
  // heal × their max HP every `pulse` s
  soulPriest:{ from: 'priest',  hp: 1.2,  dmg: 0.5,  interval: 1.0,  speed: 0.8,  seek: 5,   contact: 0.45, leash: -2, pulse: 3, healR: 4, heal: 0.12, scale: 0.8 },
  champion:  { scale: 1.35, hp: 3, dmg: 2 }, // a raised elite: multiplies its variant
  recoil: 0.3, bossRecoil: 0.5, // a melee hit costs the minion this share of its target's contact damage
  bossEngage: 24, // at most this many minions fight the boss at once; the rest fight adds or orbit
  capHeal: 0.5, // a raise roll at the legion cap heals the weakest minion by this share of its max HP
};

// ---------------------------------------------------------------- Kill streaks and game feel (GDD §4.7)
// Kill streak (streak.js): kills from any source chain while each lands within the window of the one before. The window
// tightens as the streak grows, window / (1 + n / tighten), never under floor (sim seconds: slow-mo and hit-stop never break
// a streak). Crossing a tier starts an 8 s Soul Frenzy at that tier (a lower tier never downgrades a running one): XP gain
// ×(1 + xp) and minion attack speed ×(1 + haste). nova = Soul Nova charge in kill-equivalents; a tier reached mid-detonation
// banks it until the chain ends. The HUD counter shows from showAt kills; the stinger rises `semis` semitones per tier.
// Tuned on bot kill traces (Ch1/2/4): ordinary fights reach tier 1–2, a Nova of 100+ souls tier 3–4.
export const STREAK = {
  window: 1.2, tighten: 120, floor: 0.3, showAt: 10, frenzy: 8, stingGap: 0.12,
  tiers: [
    { at: 30,  name: 'CARNAGE',      xp: 0.10, haste: 0.10, nova: 0,  semis: 0 },
    { at: 75,  name: 'MASSACRE',     xp: 0.15, haste: 0.20, nova: 0,  semis: 3 },
    { at: 150, name: 'ANNIHILATION', xp: 0.20, haste: 0.30, nova: 15, semis: 5 },
    { at: 300, name: 'SOUL HARVEST', xp: 0.25, haste: 0.40, nova: 30, semis: 7 },
    { at: 500, name: 'APOCALYPSE',   xp: 0.30, haste: 0.50, nova: 45, semis: 12 },
  ],
};
// Hit-stop (effects.js): the simulation dips to `scale` speed for this many real seconds (× the screen-shake setting), easing
// back over the last `recover` share. It multiplies a running slow-mo instead of replacing it; real-time timers keep going.
export const HITSTOP = { scale: 0.04, recover: 0.35, elite: 0.075, phase: 0.09, gate: 0.065, nova: 0.08 };
// Soul Nova wind-up (sim seconds): the tap grants the invulnerability and clears enemy shots at once, the souls flare and
// stream into the Shepherd, then his blast fires and the detonation chain ripples outward.
export const NOVA = { windup: 0.25 };
// Overflow fade (legion.js): once the legion has been over the cap for `grace` s (a gate that adds souls restarts it), the
// excess dissolves at `rate` of itself per second (at least `min` per second), each soul fading out over `dissolve` s.
export const OVERFLOW = { grace: 15, rate: 0.02, min: 0.4, dissolve: 1.2 };
// Level-up pulse: when the cards appear, soul shards within `vacuum` m fly to the Shepherd.
export const LEVEL_PULSE = { vacuum: 6 };

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
// Relic Ascension (Update 11; economy.ascendRelic): a Lv10 relic ascends ★1 → ★5, each star +`per` of its stat. A duplicate
// of a Lv10 relic becomes one of its ascension shards (relic.dups) instead of being lost; star n costs shards[n-1] shards
// and gold[n-1] gold (150,000 gold and 9 shards for all five: the endgame gold sink).
export const ASCENSION = { max: 5, per: 0.1, shards: [1, 1, 2, 2, 3], gold: [5000, 10000, 20000, 40000, 75000] };
export const relicValue = (r) => RELICS[r.type].base * RARITY_MULT[r.rarity] * (1 + 0.15 * ((r.level || 1) - 1)) * (1 + ASCENSION.per * (r.stars || 0));
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

// ---------------------------------------------------------------- Voice lines (audio/audio.js)
// Recorded lines in src/assets/voice (mastered by scripts/voice-master.sh). One line plays at a time over a ducked mix.
// pri: a line cuts in over a lower one and is dropped under an equal or higher one; cd: seconds before it can repeat;
// wait: an important line queues this long for the voice to free up instead of being dropped; group: lines sharing a
// cooldown, though a higher rank (a bigger streak) than the group's last line always gets through.
export const VOICE = {
  duck: 0.5, gap: 0.25, novaSouls: 40,
  groups: { streak: 30 },
  lines: {
    a_carnage: { pri: 1, group: 'streak', rank: 1 }, a_massacre: { pri: 1.1, group: 'streak', rank: 2 },
    a_annihilation: { pri: 1.2, group: 'streak', rank: 3 }, a_harvest: { pri: 1.3, group: 'streak', rank: 4 },
    a_apocalypse: { pri: 1.4, group: 'streak', rank: 5 },
    a_nova: { pri: 1, cd: 45 }, a_elite: { pri: 2, cd: 30 }, a_evolution: { pri: 2, wait: 1.5 },
    a_thief: { pri: 2, wait: 1.5 }, a_shrine: { pri: 2, wait: 1.5 }, a_coffin: { pri: 2, wait: 1.5 },
    a_revive: { pri: 3 }, a_depth: { pri: 3, wait: 3 },
    a_nightmare: { pri: 3, wait: 2 }, a_torment: { pri: 3, wait: 2 }, a_bloodmoon: { pri: 3, wait: 2 }, a_trial: { pri: 3, wait: 2 },
    a_boss: { pri: 4, wait: 2 }, a_boss_return: { pri: 4, wait: 2 }, a_boss_slain: { pri: 4, wait: 2 }, // Gravemaw; the other bosses:
    a_pyrexa: { pri: 4, wait: 2 }, a_pyrexa_return: { pri: 4, wait: 2 }, a_pyrexa_slain: { pri: 4, wait: 2 },
    a_vaulkar: { pri: 4, wait: 2 }, a_vaulkar_return: { pri: 4, wait: 2 }, a_vaulkar_slain: { pri: 4, wait: 2 },
    a_azrathel: { pri: 4, wait: 2 }, a_azrathel_return: { pri: 4, wait: 2 }, a_azrathel_slain: { pri: 4, wait: 2 },
    a_vesperine: { pri: 4, wait: 2 }, a_vesperine_return: { pri: 4, wait: 2 }, a_vesperine_slain: { pri: 4, wait: 2 },
    a_morwenna: { pri: 4, wait: 2 }, a_morwenna_return: { pri: 4, wait: 2 }, a_morwenna_slain: { pri: 4, wait: 2 },
    a_gorrath: { pri: 4, wait: 2 }, a_gorrath_return: { pri: 4, wait: 2 }, a_gorrath_slain: { pri: 4, wait: 2 },
    a_mire: { pri: 4, wait: 2 }, a_mire_return: { pri: 4, wait: 2 }, a_mire_slain: { pri: 4, wait: 2 },
    a_kaelthar: { pri: 4, wait: 2 }, a_kaelthar_return: { pri: 4, wait: 2 }, a_kaelthar_slain: { pri: 4, wait: 2 },
    a_nihl: { pri: 4, wait: 2 }, a_nihl_return: { pri: 4, wait: 2 }, a_nihl_slain: { pri: 4, wait: 2 },
    a_cleared: { pri: 4, wait: 4 }, a_defeat: { pri: 4, wait: 1 },
    rite: { pri: 3, cd: 20 }, greet: { pri: 3, cd: 2 }, // {hero}_rite on a Rite cast, {hero}_greet on the hero screen
  },
  streak: ['a_carnage', 'a_massacre', 'a_annihilation', 'a_harvest', 'a_apocalypse'],
};

// ---------------------------------------------------------------- Trusted clock (meta/clock.js)
// Daily resets, energy and timers run on server time when online. server: the game's own endpoint once the backend
// exists (JSON { now } in ms, or any response with a Date header); until then two public sources that allow
// cross-origin reads: Cloudflare's trace (ts=…) and timeapi.io (UTC dateTime).
export const CLOCK = {
  server: '',
  sources: ['https://www.cloudflare.com/cdn-cgi/trace', 'https://timeapi.io/api/Time/current/zone?timeZone=UTC'],
  timeoutMs: 6000, maxRtt: 15000, // a slower answer is too uncertain to trust
  resyncMin: 10,                   // while the app stays open (it also re-syncs on every resume)
  min: Date.UTC(2025, 0, 1), max: Date.UTC(2100, 0, 1), // sanity bounds on a server's answer
};

// ---------------------------------------------------------------- Soul Altar (gacha)
export const ALTAR = {
  odds: { common: 0.60, rare: 0.28, epic: 0.10, legendary: 0.02 },
  cost1: 150, cost10: 1350, pityLegendary: 60,
  shardDrops: { epic: { seraphine: 4, nyx: 6, liora: 5, grimsby: 5 }, legendary: { mordrake: 5, seraphine: 6, osric: 5, isolde: 5 } },
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
  { id: 'urns',   text: 'Smash 6 Soul Urns',       key: 'urns',    goal: 6 },
  { id: 'evolve', text: 'Evolve a weapon',         key: 'evolve',  goal: 1, late: true },
  { id: 'boss',   text: 'Defeat a chapter boss',   key: 'bosses',  goal: 1, late: true },
  { id: 'trial',  text: 'Clear the Daily Trial',   key: 'trial',   goal: 1, late: true },
  // Nightmare unlocks with the first Chapter 1 clear, the same gate as `late`; Torment counts too
  { id: 'nmClear', text: 'Clear a chapter on Nightmare', key: 'hardClears', goal: 1, late: true },
  { id: 'nmElite', text: 'Slay 5 elites on Nightmare',   key: 'hardElites', goal: 5, late: true },
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

// ---------------------------------------------------------------- Bestiary (meta/bestiary.js, ui/meta/bestiary.js)
// A painted entry per foe. Kills add up over every run (gilded elites count as their base type; the Soul Thief and the five
// chapter bosses count too). An entry unlocks with its first kill. Its three milestones are claimed in order, each once:
// goals = kill counts (`rare` foes use rareGoals), rewards[i] = tier i + 1's bundle. In all: 26,000 gold, 13 sigils and
// 650 gems (MONETIZATION §2).
export const BESTIARY = {
  goals: [100, 1000, 10000], rareGoals: [1, 10, 50], // a foe's own `goals` override both (the Corpse Priest: at most 3 alive)
  rewards: [{ gold: 2000 }, { sigils: 1 }, { gems: 50 }],
  order: ['husk', 'ghoul', 'brute', 'witch', 'bloater', 'wraith', 'priest', 'siren', 'thornback', 'rat', 'caller', 'stalker', 'thief',
    'gravemaw', 'pyrexa', 'vaulkar', 'azrathel', 'vesperine', 'morwenna', 'gorrath', 'mire', 'kaelthar', 'nihl'],
  foes: {
    husk: { name: 'Husk', role: 'Chaser', color: '#ff8a3d',
      lore: 'Once they were mourners. Now they remember only the long walk to the grave, and they walk it toward you.',
      fights: 'Shambles straight at you in endless numbers. Raise fodder: anything kills it.' },
    ghoul: { name: 'Ghoul', role: 'Pack runner', color: '#9fd8ff',
      lore: 'Starved things that run on all fours and hunt by the warmth of the living. They never hunt alone.',
      fights: 'Hunts in packs of 4–6, crouches, then lunges. Sidestep the lunge and keep moving.' },
    brute: { name: 'Brute', role: 'Tank', color: '#ff7a2e',
      lore: 'Three dead soldiers stitched around a furnace heart. It has forgotten every name but the weight of its fists.',
      fights: 'Rears back over a cone on the ground, then slams. Step out of the cone.' },
    witch: { name: 'Cinder Witch', role: 'Ranged', color: '#ff5a3a',
      lore: 'They burned her at the stake, and she kept the fire. Every orb she throws is an ember of her own pyre.',
      fights: 'Keeps her distance and lobs fire onto a marked circle. Keep moving when one appears.' },
    bloater: { name: 'Bloater', role: 'Bomber', color: '#c35cff',
      lore: 'The plague pits fed it until it could hold no more. Now it waits for someone to come close.',
      fights: 'Flashes when it reaches you, then bursts a second later. Kill it early, or let it pop inside the horde.' },
    wraith: { name: 'Grave Wraith', role: 'Phantom', color: '#c8b6ff',
      lore: 'Some of the dead were buried without a name. They never learned to walk again, so they drift, and they hate whoever still has one.',
      fights: 'Passes straight through your legion: minions cannot hold or harm it. Dives at you on a weave. Only your own weapons stop it.' },
    priest: { name: 'Corpse Priest', role: 'Necromancer', color: '#ff2e4a', goals: [50, 500, 3000],
      lore: 'The plague priests buried the dead by the cartload. When the graves overflowed, one of them learned to empty them again.',
      fights: 'Keeps its distance and chants over the fallen, raising them as hollow Husks. Kill it first, or raise the dead before it can.' },
    thief: { name: 'Soul Thief', role: 'Run event', color: '#ffcf4a', rare: true,
      lore: 'It picks the pockets of the dying, coins and souls alike, and it has never once stood and fought.',
      fights: 'Never attacks. Flees with its sack for 18 s, faster than the horde but slower than you. Run it down for gold.' },
    gravemaw: { name: 'Gravemaw', role: 'The Hollow King · Ashen Necropolis', color: '#ff3df0', rare: true, boss: true,
      lore: 'The Hollow King wears a crown of cinders over a ribcage full of stolen souls, and he wants yours.',
      fights: 'Three phases in a sealed arena: slam rings, turning gap rings, then a spiral. Raises the dead around him.' },
    pyrexa: { name: 'Pyrexa', role: 'The Cinder Matron · Ember Wastes', color: '#ff7a1a', rare: true, boss: true,
      lore: 'Every Cinder Witch was once a girl on a pyre. Pyrexa was the first, and she taught the others to keep the fire.',
      fights: 'Her slam rings burn after they land. Cinder Rain lobs fire onto marked circles that leave the ground burning.' },
    vaulkar: { name: 'Vaulkar', role: 'The Ossuary Colossus · Frozen Ossuary', color: '#8f9cff', rare: true, boss: true,
      lore: 'The monks of the ossuary stacked their dead into a guardian. The cold kept it, and it kept walking.',
      fights: 'Frost shards erupt along his slam rings. Glacier Lances ripple out toward you in lanes: step between them.' },
    azrathel: { name: 'Azrathel', role: 'The Fallen Seraph · Abyssal Cathedral', color: '#b070ff', rare: true, boss: true,
      lore: 'He sang the cathedral\u2019s last hymn as the abyss came up through its floor, and he never stopped singing.',
      fights: 'An extra ring in every gap volley. Smite drops pillars of light on your path, one after another: keep moving.' },
    vesperine: { name: 'Vesperine', role: 'The Crimson Queen · Crimson Throne', color: '#ff2e55', rare: true, boss: true,
      lore: 'She bought her crown with her kingdom\u2019s blood, and she has been thirsty ever since.',
      fights: 'Blood Lances: aimed fans of blood orbs, a beat apart. Her eclipse (the spiral) comes at half her health.' },
    // Update 13: the act foes and the bosses of Acts II–VI
    siren: { name: 'Drowned Siren', role: 'Enchanter · the Drowned Coast', color: '#2fe6c8', goals: [50, 500, 3000],
      lore: 'The lighthouse keepers’ wives walked into the sea to call their husbands home. They are still calling.',
      fights: 'Keeps her distance and sings onto a marked circle around you: minions inside forget the fight for a few seconds. Kill her first.' },
    thornback: { name: 'Thornback', role: 'Charger · the Thornwood', color: '#c8e040', goals: [50, 500, 3000],
      lore: 'The boars of the Witherwood ate the Briar King’s bark and grew his thorns. Now they run where he points.',
      fights: 'Lowers its head over a marked lane, then charges straight down it, trampling minions and leaving brambles. Step out of the lane.' },
    rat: { name: 'Plague Rat', role: 'Swarm · the Plague Fens', color: '#9cff3a', goals: [500, 5000, 50000],
      lore: 'Mother Mire’s children. There are never fewer of them than there were yesterday.',
      fights: 'Pours in by the dozen, fast and fragile, flanking like a Ghoul pack. Your legion eats them; just never stand still in a swarm.' },
    caller: { name: 'Stormcaller', role: 'Caster · the Storm Spire', color: '#7fd4ff', goals: [50, 500, 3000],
      lore: 'The monks of Galebreak prayed for the storm to spare them. It answered by making them its voice.',
      fights: 'Keeps its distance and marks a line toward where you are going; a second later lightning runs down it. Step off the line.' },
    stalker: { name: 'Void Stalker', role: 'Ambusher · the Hollow Moon', color: '#d0b8ff', goals: [50, 500, 3000],
      lore: 'What the first night was made of, before there were stars to show its shape.',
      fights: 'Marks a spot beside you, vanishes, then appears there and pounces. Move off the mark and it lands on nothing.' },
    morwenna: { name: 'Morwenna', role: 'The Drowned Cantor · the Abyssal Choir', color: '#2fe6c8', rare: true, boss: true,
      lore: 'She sang the drowned cathedral’s last mass as the sea came in, and the choir sang on beneath the waves.',
      fights: 'Her slam rings leave tide pools. Tidal Lanes: marked lanes across the arena, then a wave runs down each one.' },
    gorrath: { name: 'Gorrath', role: 'The Briar King · the Thorn Throne', color: '#c8e040', rare: true, boss: true,
      lore: 'The oldest tree in the Thornwood was crowned by the things that hanged themselves from it.',
      fights: 'His slam rings leave brambles. Root Snare: lines of thorns rip toward you and hold you fast if they catch you.' },
    mire: { name: 'Mother Mire', role: 'The Plague Bloom · Mother of Rot', color: '#9cff3a', rare: true, boss: true,
      lore: 'The plague had to come from somewhere. It came from her, and she has been so very proud of it.',
      fights: 'Her slam rings leave miasma clouds. Blight Rain: spore pods fall on marked circles and burst into poison.' },
    kaelthar: { name: 'Kaelthar', role: 'The Storm Herald · the Storm Spire', color: '#7fd4ff', rare: true, boss: true,
      lore: 'He was sent to announce the end of the world. He has been announcing it, very loudly, ever since.',
      fights: 'Lightning falls around him through the whole fight. Tempest: lightning beams sweep around him; keep ahead of them.' },
    nihl: { name: 'Nihl', role: 'The First Night · the Hollow Moon', color: '#d0b8ff', rare: true, boss: true,
      lore: 'Before the first star, there was Nihl. It would like things back the way they were.',
      fights: 'The dark pulls you toward it. Its signature borrows every fallen boss’s in turn, and its last phase comes at half its strength.' },
  },
};

// ---------------------------------------------------------------- Difficulty (Nightmare, Torment)
// Per chapter: a Normal clear unlocks Nightmare, a Nightmare clear unlocks Torment. Campaign chapters only: Endless Abyss
// and the Daily Trial always play Normal. Blood Moon stacks on top of any difficulty. Normal is the identity.
//   hp / dmg / spawn: × enemy HP, enemy and hazard damage, director spawn rate (once the boss rises its arena adds are plain
//   Normal adds: he alone carries the difficulty)
//   ramp: minutes for the extra HP to build up from ×1 to ×hp, so the opening still lets you level (damage and spawns apply at once)
//   xp: × soul-shard XP, so the build keeps pace with a horde that dies more slowly (the boss arrives at 6:00 either way)
//   bossHp / bossDmg: × the boss's HP and damage; below the horde's so its fight stays within ~1.6× its Normal length
//   (scripts/balance.mjs GOD=1: harder hits mostly shred the legion that fights him)
//   extraElites: the first n of DIFFICULTY_ELITES join the elite schedule · eliteAffixes: affixes per elite (elite-affix system)
//   gold / passXp: × run gold and pass XP (account XP stays at the Normal amount, so account-level gems don't speed up)
//   firstClearGems: one-time gems for the first clear of each chapter at this difficulty (never doubled by Blood Moon or ads)
//   hoard: the boss's hoard relic odds by rarity (null: the chapter's Normal odds) · tint: the world palette is mixed toward
//   these colours by `mix` (the Blood Moon look swap, blended) · css: UI colour
export const DIFFICULTY_ORDER = ['normal', 'nightmare', 'torment'];
export const DIFFICULTY = {
  normal:    { id: 'normal', name: 'Normal', hp: 1, ramp: 0, xp: 1, bossHp: 1, bossDmg: 1, dmg: 1, spawn: 1, extraElites: 0, eliteAffixes: 0, gold: 1, passXp: 1, firstClearGems: 0, hoard: null, tint: null, css: '#4ef2ff' },
  nightmare: { id: 'nightmare', name: 'Nightmare', hp: 2.2, ramp: 2, xp: 2, bossHp: 1.4, bossDmg: 1.4, dmg: 2, spawn: 1.25, extraElites: 2, eliteAffixes: 1, gold: 1.75, passXp: 1.5, firstClearGems: 60,
    hoard: { epic: 0.4, rare: 0.6 }, tint: { mix: 0.7, ground: 0x3a1f62, groundB: 0x140830, fog: 0x080312, rune: 0xb04bff, rim: 0xc89bff }, css: '#b46bff' },
  torment:   { id: 'torment', name: 'Torment', hp: 3.5, ramp: 2.5, xp: 2.8, bossHp: 1.5, bossDmg: 1.6, dmg: 2.8, spawn: 1.4, extraElites: 4, eliteAffixes: 2, gold: 2.5, passXp: 2, firstClearGems: 120,
    hoard: { legendary: 0.02, epic: 0.98 }, tint: { mix: 0.85, ground: 0x2c0a0e, groundB: 0x0b0204, fog: 0x040001, rune: 0xff1a2e, rim: 0xff5a5a }, css: '#ff3b4e' },
};
// Nightmare and Torment ease off through the later acts, where the chapters' own scaling already compounds with them:
// their extra foe HP, damage and spawn rate, and the boss's extra HP and damage, slide from the full amount at Chapter
// `from` to `end` of it at Chapter `to`. Rewards keep their full multipliers. (scripts/balance.mjs DIFF=… PROG=30: at full
// strength even a maxed Shepherd never cleared Chapter 30; at 0.7 one clears Nightmare 3 runs in 6, Torment 2 in 6.)
export const DIFFICULTY_EASE = { from: 10, to: 30, end: 0.7, keys: ['hp', 'dmg', 'bossHp', 'bossDmg', 'spawn'] };
/** A run's difficulty for a chapter: D with the later acts' easing applied (Normal and Chapters 1–10 unchanged). */
export function easedDifficulty(D, chapterId) {
  const E = DIFFICULTY_EASE, k = chapterId > E.from ? 1 - (1 - E.end) * Math.min(1, (chapterId - E.from) / (E.to - E.from)) : 1;
  const out = { ...D };
  if (k < 1 && D.id !== 'normal') for (const key of E.keys) out[key] = 1 + (D[key] - 1) * k;
  return out;
}
export const DIFFICULTY_ELITES = [190, 320, 115, 260]; // extra elite times (s), taken in this order
const mixHex = (a, b, t) => { let o = 0; for (let s = 0; s <= 16; s += 8) { const x = (a >> s) & 255; o |= Math.round(x + (((b >> s) & 255) - x) * t) << s; } return o; };
/** A run's world palette pulled toward the difficulty tint (environment keys only: allies and enemies keep their colours). */
export function difficultyLook(look, tint) {
  const out = { ...look };
  for (const k of ['ground', 'groundB', 'fog', 'rune', 'rim']) out[k] = mixHex(look[k], tint[k], tint.mix);
  out.recolor = Math.max(look.recolor || 0, tint.mix); // the painted floor takes the palette too (world.js)
  return out;
}

// ---------------------------------------------------------------- Daily Trial
// One free run a day (no energy) on a cleared chapter with one boon and one bane, seeded by date. Unlocks once Chapter 1 is cleared.
// A rewarded ad buys another attempt, as many as wanted until the trial is beaten (ads are never capped); the prize pays
// once a day: the clear reward on the first clear, and the fall-early gems up to failGemsMax across the day's attempts.
export const TRIAL = {
  unlockAt: 2,
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
/** Folds a list of mutator ids (and a Grimoire page, if one is inscribed) into one modifier set for a run. */
export function mergeMutators(ids = [], page = null) {
  const m = { ids, page: null, stats: {}, spawn: 1, hp: 1, speed: 1, weights: null, eliteEvery: 0, gateEvery: 0, noBadGates: false, startLv: 0, xp: 1, gateAdd: 0, gateCull: 1 };
  const fold = (d) => {
    for (const [k, v] of Object.entries(d.stats || {})) m.stats[k] = k === 'raise' || k === 'cap' ? (m.stats[k] || 0) + v : (m.stats[k] || 1) * v;
    for (const k of ['spawn', 'hp', 'speed', 'xp', 'gateCull']) if (d[k]) m[k] *= d[k];
    if (d.gateAdd) m.gateAdd += d.gateAdd;
    if (d.weights) { m.weights = m.weights || {}; for (const [t, w] of Object.entries(d.weights)) m.weights[t] = (m.weights[t] || 1) * w; }
    for (const k of ['eliteEvery', 'gateEvery', 'startLv']) if (d[k]) m[k] = d[k];
    if (d.noBadGates) m.noBadGates = true;
  };
  for (const id of ids) if (MUTATORS[id]) fold(MUTATORS[id]);
  if (page && GRIMOIRE.pages[page]) { fold(GRIMOIRE.pages[page]); m.page = page; }
  return m;
}

// ---------------------------------------------------------------- the Grimoire (meta/grimoire.js, ui/meta/grimoire.js)
// One page may be inscribed before a run (campaign chapters on any difficulty, and the Endless Abyss; never the tutorial,
// the Daily Trial or Boss Rush): a rule-bending boon with a price. Pages unlock from account goals: `unlock.stat`
// (profile.stats, at least n) or `unlock.clear` (that chapter's boss slain). A page folds into the run's modifiers like
// a Daily Trial mutator (mergeMutators: stats raise/cap add, the rest multiply; spawn; gateEvery), plus xp (soul shard
// value), gateAdd (+N gates give more), gateCull (−N gates take more) and its own hooks in run.js / legion.js:
//   graves: every `every` s up to n un-risen corpses within r m of the Shepherd rise as Shades (under the cap)
//   tithe: a minion that falls bursts for dmg × minion damage within r m
//   feast: every kill heals `heal` HP, at most `cap` HP a second
export const GRIMOIRE = {
  order: ['banner', 'furnace', 'glass', 'restless', 'midnight', 'tithe', 'carrion', 'gate'],
  pages: {
    banner: { name: 'Banner of the Damned', color: '#7fe8ff', boon: '+25 legion cap', cost: 'Minions have 15% less HP',
      stats: { cap: 25, minionHp: 0.85 }, unlock: { stat: 'runs', n: 3, text: 'Finish 3 runs' } },
    furnace: { name: 'Soul Furnace', color: '#4ef2ff', boon: 'Soul shards are worth 30% more', cost: '15% more foes',
      xp: 1.3, spawn: 1.15, unlock: { clear: 1, text: 'Clear Chapter 1' } },
    glass: { name: 'Glass Shepherd', color: '#ffe08a', boon: 'Your weapons deal 35% more damage', cost: 'You take 35% more damage',
      stats: { dmgMul: 1.35, ward: 1.35 }, unlock: { clear: 2, text: 'Clear Chapter 2' } },
    restless: { name: 'Restless Graves', color: '#9dffb8', boon: 'Every 6 s, up to 3 fallen foes near you rise to serve you', cost: '−5% Raise Chance',
      stats: { raise: -0.05 }, graves: { every: 6, n: 3, r: 7 }, unlock: { stat: 'raised', n: 2000, text: 'Raise 2,000 minions' } },
    midnight: { name: 'Midnight Mass', color: '#c8b6ff', boon: 'Soul Nova charges 60% faster', cost: 'Minions deal 15% less damage',
      stats: { nova: 1.6, minionDmg: 0.85 }, unlock: { stat: 'bestStreak', n: 300, text: 'Reach a 300 kill streak' } },
    tithe: { name: 'Ossuary Tithe', color: '#ff8a3d', boon: 'A fallen minion bursts for 4× minion damage around it', cost: '−10 legion cap',
      stats: { cap: -10 }, tithe: { dmg: 4, r: 2.2 }, unlock: { stat: 'bestLegion', n: 150, text: 'Command a legion of 150' } },
    carrion: { name: 'Carrion Feast', color: '#ff3d6e', boon: 'Every kill heals 0.35 HP (up to 4 a second)', cost: '25% less max HP',
      stats: { maxHp: 0.75 }, feast: { heal: 0.35, cap: 4 }, unlock: { stat: 'kills', n: 25000, text: 'Slay 25,000 foes' } },
    gate: { name: "Gravecaller's Gate", color: '#ffd04a', boon: 'Soul Gates every 30 s, and +N gates give 25% more', cost: 'Culling gates take 25% more',
      gateEvery: 30, gateAdd: 0.25, gateCull: 1.25, unlock: { clear: 4, text: 'Clear Chapter 4' } },
  },
};

export const SKINS = {
  eclipse_vael: { hero: 'vael', name: 'Eclipse Vael', color: 0xffd04a, body: 0x1a1020, legion: 0xffe9a0 },
};

// ---------------------------------------------------------------- Privacy, consent and analytics (Update 14, GDD §19)
// A neutral age gate runs once before anything is measured; its answer sets a band (meta/privacy.js):
//   child: under minAge: no purchases, no analytics, non-personalised ads only, no consent sheet;
//   teen:  under adultAge: personalised ads stay off; analytics needs consent, and in the EU (under euConsentAge) it stays off;
//   adult: the consent sheet asks for analytics and personalised ads, both off until chosen.
// `version` is the privacy policy's: raising it shows the consent sheet again. `policyUrl` is the studio's hosted policy
// (docs/PRIVACY_POLICY.md; a placeholder until the studio publishes it).
export const PRIVACY = { version: 1, minAge: 13, euConsentAge: 16, adultAge: 18, oldest: 100, policyUrl: 'https://example.com/soulswarm/privacy',
  termsUrl: 'https://example.com/soulswarm/terms', // docs/TERMS_OF_USE.md, hosted by the studio (a placeholder until then)
  // monthly spending limits for teens (MONETIZATION.md §11), in USD of list prices this calendar month: [under this age, cap]
  spendCaps: [[16, 50], [18, 100]] };

// ---------------------------------------------------------------- Feats (Update 14, GDD §20)
// Lifetime goals in tiers. Each family measures something the profile already keeps (meta/feats.js featValue), so a
// returning player is credited at once; tiers are claimed in order for gems (economy.claimFeat). `text` takes the tier's
// goal for {n} ({s} and {es} pluralise it). Store builds report each reached tier to Game Center / Play Games as
// `${id}_${tier}` (engine/platform.js).
export const FEATS = {
  order: ['campaign', 'nightmare', 'torment', 'bane', 'reaper', 'souls', 'legion', 'streak', 'runs', 'heroes', 'mastery', 'bestiary', 'abyss', 'rush', 'trial', 'relics', 'level'],
  families: {
    campaign:  { name: 'The Long Night',     icon: 'map',       text: 'Clear {n} chapters',                          goals: [5, 10, 15, 20, 25, 30],     gems: [40, 60, 80, 100, 120, 250] },
    nightmare: { name: 'Nightmare Walker',   icon: 'eye',       text: 'Clear {n} chapter{s} on Nightmare',             goals: [1, 10, 30],                 gems: [40, 100, 250] },
    torment:   { name: 'Bringer of Torment', icon: 'skull',     text: 'Clear {n} chapter{s} on Torment',               goals: [1, 10, 30],                 gems: [60, 150, 400] },
    bane:      { name: 'Bane of Kings',      icon: 'crown',     text: 'Slay {n} bosses',                             goals: [10, 50, 200],               gems: [30, 80, 200] },
    reaper:    { name: 'Reaper',             icon: 'scythe',    text: 'Slay {n} foes',                               goals: [1000, 10000, 100000, 1e6],  gems: [20, 40, 80, 160] },
    souls:     { name: 'Shepherd of Souls',  icon: 'raise',     text: 'Raise {n} souls',                             goals: [500, 5000, 50000, 250000],  gems: [20, 40, 80, 160] },
    legion:    { name: 'The Endless Host',   icon: 'banner',    text: 'Lead a legion of {n}',                        goals: [75, 150, 250, 350],         gems: [20, 40, 80, 150] },
    streak:    { name: 'Apocalypse',         icon: 'bolt',      text: 'Chain a kill streak of {n}',                  goals: [75, 150, 300, 500],         gems: [20, 40, 80, 150] },
    runs:      { name: 'Veteran',            icon: 'swords',    text: 'Fight {n} runs',                              goals: [10, 50, 200, 500],          gems: [20, 40, 80, 150] },
    heroes:    { name: 'The Gathering',      icon: 'helm',      text: 'Command {n} heroes',                          goals: [2, 4, 6, 8],                gems: [30, 50, 80, 150] },
    mastery:   { name: 'Soulbound',          icon: 'star',      text: 'Raise a hero to Mastery rank {n}',            goals: [3, 5, 8, 10],               gems: [20, 40, 80, 150] },
    bestiary:  { name: 'Chronicler',         icon: 'book',      text: 'Unlock {n} Bestiary entries',                 goals: [5, 12, 18, 23],             gems: [20, 40, 80, 150] },
    abyss:     { name: 'Abyss Diver',        icon: 'nova',      text: 'Reach depth {n} in the Endless Abyss',        goals: [2, 4, 7, 10],               gems: [30, 60, 120, 250] },
    rush:      { name: 'Court Breaker',      icon: 'trophy',    text: 'Win {n} Boss Rush{es}',                         goals: [1, 5, 20],                  gems: [50, 100, 200] },
    trial:     { name: 'Trialborn',          icon: 'hourglass', text: 'Win {n} Daily Trial{s}',                        goals: [1, 10, 50],                 gems: [30, 60, 150] },
    relics:    { name: 'Relic Keeper',       icon: 'shard',     text: 'Ascend a relic to {n} star{s}',                 goals: [1, 3, 5],                   gems: [30, 80, 200] },
    level:     { name: 'Ascendant',          icon: 'idol',      text: 'Reach account level {n}',                     goals: [10, 25, 50],                gems: [30, 60, 150] },
  },
};

// Reminders (meta/reminders.js): opt-in local notifications, never in the quiet hours (22:00–09:00 local).
export const REMINDERS = {
  quiet: [22, 9], dailyHour: 19,
  text: {
    energy: { title: 'Your energy is full', body: 'The legion is restless, Shepherd. Your runs are ready.' },
    daily: { title: 'A new day in the dark', body: 'Your free chest and new quests are waiting.' },
    rush: { title: 'The Boss Rush is open', body: 'The court gathers. Face its five bosses back to back before Friday.' },
  },
};

// The store review prompt (meta/review.js): only after a high point, a few times ever, never to a child.
export const REVIEW = { chapters: [3, 10, 20, 30], max: 3, gapDays: 60, delayMs: 2500 };

// Gameplay analytics (meta/analytics.js, LIVEOPS.md §5): events queue on the device, at most queueMax, and only with
// consent. There is no analytics service in this build (`endpoint` empty), so nothing leaves the device; the store build
// plugs its SDK in with analytics.setTransport. Each event lists the properties it may carry (anything else is dropped,
// so no free text or personal data slips in).
export const ANALYTICS = {
  queueMax: 500, batch: 50, flushEvery: 30, endpoint: '',
  events: {
    session_start: ['returning', 'days', 'level', 'chapter'],
    age_gate: ['band', 'eu'],
    consent: ['analytics', 'ads', 'where'],
    tutorial_start: [],
    ftue_complete: ['skipped', 'time'],
    run_start: ['mode', 'chapter', 'act', 'difficulty', 'hero', 'page', 'bloodMoon', 'level'],
    run_end: ['mode', 'chapter', 'act', 'difficulty', 'hero', 'victory', 'time', 'kills', 'level', 'legion', 'bossKills', 'boss', 'deathMinute', 'firstClear'],
    chapter_unlock: ['chapter', 'act'],
    card_pick: ['id', 'level', 'kind'],
    purchase: ['sku', 'usd', 'first'],
    purchase_blocked: ['sku', 'reason'],
    ad_reward: ['placement', 'completed', 'personalised'],
    altar_pull: ['count', 'payWith', 'epic', 'legendary'],
    hero_upgrade: ['hero', 'stars', 'unlocked'],
    talent_up: ['talent', 'level'],
    relic_ascend: ['type', 'rarity', 'stars'],
    quest_claim: ['quest'],
    bestiary_claim: ['id', 'tier'],
    feat_claim: ['id', 'tier'],
    screen_view: ['screen'],
    save_transfer: ['direction'],
  },
};
