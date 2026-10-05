# SOULSWARM: Game Design Document

**Tagline:** *Raise the Legion.*
**Status:** v1.0, pre-production (playable HTML5/Three.js prototype exists)
**Owner:** Lead Game Designer / PM
**Source of truth:** `DESIGN_BRIEF.md`. If this document and the brief disagree, the brief wins. Numbers marked *(tuning)* are starting values for balancing and are expected to move during soft launch.

---

## 1. Vision and pillars

**Vision.** You start a run alone in a graveyard. Six minutes later you are leading a glowing cyan legion of 300+ souls, all of them enemies you killed and raised. Then you trade the whole army for one screen-clearing Soul Nova. SOULSWARM is a "Legion Survivor": a horde-survival roguelite played in portrait with one thumb, where the horde itself is the thing you collect.

**Audience.** Players aged 16–35 who enjoy short-session action roguelites (Vampire Survivors, Survivor.io, Archero, Brotato) and the "army grows on screen" fantasy of hybrid-casual runner ads. They play on commutes and breaks and want a satisfying 7-minute arc.

| # | Pillar | What it means in practice | Test question for any feature |
|---|---|---|---|
| 1 | **The horde becomes yours** | Converting enemies is the core verb. Legion size is the number on screen that matters most. | Does this make the legion feel bigger, smarter or more personal? |
| 2 | **One thumb, zero friction** | Movement is the only required input. Attacks are automatic. The NOVA button is the only extra tap. | Can it be played one-handed on a bus? |
| 3 | **A real decision every ~40 seconds** | Soul Gates, level-up cards and Nova timing are the rhythm of choice. | Does this create a choice the player can get right or wrong? |
| 4 | **Earn the wipe** | Soul Nova is the payoff. It must feel enormous and must cost something real: your army. | Does this make the Nova moment bigger or the cost clearer? |
| 5 | **Fair by default** | Visible odds and pity, honest timers, no forced ads, all story content beatable for free. | Would we be comfortable explaining this to a journalist and a parent? |

**Non-goals at launch:** PvP, real-time co-op, chat, trading, energy-gated story beyond the 5-energy run cost.

---

## 2. Core loops

| Loop | Length | Player goal | Key systems | Reward |
|---|---|---|---|---|
| Moment-to-moment | 1–10 s | Survive, kill, collect | Floating joystick, auto-attack, raises, pickups | Soul shards (XP), new minions |
| Run | 6–9 min | Clear the chapter (survive 6:00, kill Gravemaw) | Level-up cards, Soul Gates, elites, Nova, boss | Gold, pass XP, quest progress, first-clear gems |
| Meta | Days to months | Get strong enough for the next chapter | Talents, relics, heroes and stars, Soul Altar | Power, new chapters, Endless Abyss |
| Daily | 15–40 min/day | Finish quests, spend energy | 6 daily quests, 7-day login calendar, rewarded ads, energy | Gems, gold, sigils, pass XP |
| Weekly | 7 days | Climb the leaderboard, farm Blood Moon | Blood Moon weekend, Endless Abyss weekly board, weekly quest chest | Sigils, gems, league rewards |
| Seasonal | 28 days | Finish the Soul Pass, collect the new hero | Soul Pass (30 tiers), monthly Boss Rush, new hero every 1–2 seasons | Skins, Epic/Legendary relics, hero shards |

**Moment-to-moment.** Move → weapons fire automatically at the nearest threat → an enemy dies → it drops a soul shard and has a *Raise Chance* to rise as a cyan minion → minions orbit you and hunt nearby enemies → more kills → more shards and more minions. The player's only job is positioning: kite, collect, pick gates, avoid telegraphs.

**Run.** 0:00–6:00 survival with rising density, 8 Soul Gates, 3 elites (1:30, 3:00, 4:30) and roughly 25 level-ups, then Gravemaw at 6:00. A full clear takes 7–8 minutes including the boss. A failed run usually ends between 2:30 and 5:00.

**Daily.** Energy regenerates (+1 every 6 min, 30 max = 6 runs per full bar, 3 hours from empty to full). Quests are designed to be finished in 2–3 runs. Daily quest set: Slay 500 enemies · Raise 150 souls · Survive 4 minutes · Unleash Soul Nova 3× · Pass 3 Soul Gates · Finish 2 runs.

| Daily quest reward | Gems | Gold | Pass XP |
|---|---|---|---|
| Slay 500 enemies | 0 | 1,000 | 10 |
| Raise 150 souls | 10 | 0 | 10 |
| Survive 4 minutes | 0 | 1,000 | 10 |
| Unleash Soul Nova 3× | 10 | 0 | 10 |
| Pass 3 Soul Gates | 0 | 1,000 | 10 |
| Finish 2 runs | 10 | 0 | 10 |
| All 6 complete (bonus) | 20 | 0 | 20 |
| **Daily total** | **50** | **3,000** | **80** |

**7-day login calendar** (does not reset if a day is missed; it pauses): D1 2,000 gold · D2 1 Altar Sigil · D3 50 gems · D4 5,000 gold · D5 1 Altar Sigil · D6 15 energy · D7 Legendary-chance relic chest (Epic 85% / Legendary 15%, odds shown) + 100 gems. The cycle then repeats.

**Weekly.** Blood Moon runs every weekend (Fri 00:00 – Sun 23:59 UTC): 2× elites and 2× run rewards. Endless Abyss leaderboards reset Monday 00:00 UTC. The weekly quest chest (finish 25 daily quests in a week) gives 1 Altar Sigil, 50 gems and 100 pass XP.

**Seasonal.** A Soul Pass season lasts 28 days with 30 tiers × 100 pass XP = 3,000 XP. A player who does all quests and about 3 runs a day earns about 125 pass XP per day and finishes on roughly day 22–24. A casual player (4 days a week) reaches roughly tier 15.

---

## 3. Controls

| Input | Behaviour | Notes |
|---|---|---|
| **Floating joystick** | Touch anywhere in the lower 75% of the screen to spawn the stick base at your thumb. Drag to move. Release to stop. | Dead zone 8 dp. Max deflection 56 dp. Analog speed from 30% to 100% of deflection. The base follows the thumb if it is dragged beyond 1.5× radius ("leash"). |
| **Auto-attack** | All weapons fire on their own cooldowns. | Targeting: nearest enemy within weapon range. Elites and Bloaters within 3 m get priority. Directional weapons (Scythe, Spears) aim at the nearest enemy, or along the move direction when nothing is in range. |
| **NOVA button** | 72 dp circle in the bottom-right (mirrored in left-handed mode). Disabled below 100% charge or below 10 minions. | Pulses and plays a rising hum at 100%. A tap triggers a 0.4 s wind-up. It cannot be triggered by a joystick drag that starts on the button. |
| **Pause** | Top-right, 44 dp. Also auto-pauses on app background and on incoming calls. | The pause screen shows the current build, legion size and Nova charge. |
| **Level-up / chest cards** | 3 large cards. Tap to pick. Gameplay is paused. | A 0.3 s input guard stops accidental picks from a thumb still on the glass. |
| **Haptics** | Light tick on raise (throttled to 10/s), medium on gate pass, heavy on Nova and boss slam. | Toggle in settings. |

There are no other in-run buttons. Rerolls (1 free per run) sit inside the level-up screen.

---

## 4. Run systems

### 4.1 Run timeline (Chapter 1 reference)

| Time | Spawn mix | Scripted events |
|---|---|---|
| 0:00–0:45 | Husks 100% | First Soul Gate at ~0:40 |
| 0:45–1:30 | Husks 75%, Ghoul packs 25% | Gate ~1:20 |
| 1:30 | — | **Elite Husk** (gold) |
| 1:30–3:00 | Husks 55%, Ghouls 20%, Bloaters 15%, Brutes 10% (from 2:15) | Gates ~2:00, ~2:40 |
| 3:00 | — | **Elite Brute** + 15 s horde surge (spawn rate ×1.5) |
| 3:00–4:30 | Husks 45%, Ghouls 20%, Bloaters 12%, Brutes 10%, Cinder Witches 13% | Gates ~3:20, ~4:00 |
| 4:30 | — | **Elite Cinder Witch** |
| 4:30–6:00 | All types; density peak | Gates ~4:40, ~5:20; final surge at 5:30 |
| 6:00 | Normal spawns stop | **Gravemaw, the Hollow King** |

### 4.2 The Legion (Raise Chance and minions)

- **Raise Chance** is in percentage points (pp). Base 10%. Sources: Vael +10 pp, the Raise Dead skill, the Raise Chance talent, the Lantern of the Lost relic. **Hard cap 60%.**
- Every kill rolls Raise Chance, whether the player or a minion made the kill. Elites and bosses cannot be raised.
- **Legion cap:** base 150. Additive bonuses: the Legion Cap skill (+25 to +150). Percentage bonuses: Legion Cap talent, Bone Idol relic, Mordrake +25%. Percentages add together, then multiply the flat cap. **Technical hard ceiling: 400 minions** on every device, for performance and leaderboard fairness.
- When at the cap, kills still roll. A successful roll heals the weakest minion by 50% instead of adding a new one.
- **Minion types inherit the silhouette of what they were**, recoloured cyan/teal:

| Raised from | Minion | HP | Damage / hit | Attack interval | Speed (m/s) | Special |
|---|---|---|---|---|---|---|
| Husk | Shade | 30 | 3 | 1.0 s | 4.0 | — |
| Ghoul | Wisp Runner | 15 | 2 | 0.6 s | 6.0 | Leashes farther (9 m) |
| Brute | Bulwark | 120 | 6 | 1.4 s | 3.0 | Taunts enemies within 3 m |
| Cinder Witch | Soul Witch | 25 | 5 (orb, 6 m range) | 1.5 s | 3.5 | Ranged |
| Bloater | Soul Bomb | 20 | 30 AoE (2 m), once | — | 4.5 | Runs into the densest cluster and explodes |

- Minion HP scales with chapter (×1.45^(c−1)). Minion damage = base × (1 + Minion Fury% + hero bonuses) × (1 + all Damage%) × star multiplier.
- **AI:** idle minions orbit the player in 3 rings (2.5 m / 4 m / 5.5 m). Each minion hunts the nearest enemy within its leash (6 m) and returns when the target dies or leaves the leash. At most 24 minions can engage a boss at once (melee slots); the rest fight adds.

### 4.3 Soul Gates

- A pair spawns every **40 s ±5 s** from 0:40 to 5:20 (8 per chapter, none during the boss). They appear 5–7 m ahead of the player's movement, 3 m apart, and last 8 s.
- **The numbers are always the truth.** The values shown are exactly what happens. There are no hidden modifiers, and ×N is applied to the legion size at the moment you walk through.
- The gate choice is a maths-and-risk puzzle. The better-looking gate is often placed behind a Brute or a Bloater cluster.
- **Overflow:** gate results can push the legion above the cap (up to the 400 ceiling). Overflow minions last 20 s, then fade at 2 per second until the legion is back at the cap.
- **Negative gates are never pure traps.** Minions lost to a −% gate detonate at 50% Nova power, which makes −50% an emergency escape when surrounded.

| Window | Typical pairs (pool, weighted) |
|---|---|
| 0:40–2:00 | +10 vs +15 · +15 vs ×2 · +5 vs ×2 |
| 2:00–4:00 | ×2 vs +40 · +30 vs ×1.5 · ×2 vs −50% |
| 4:00–5:20 | ×2 vs −50% · +50 vs ×1.5 · ×3 vs +60 (10% chance) |

### 4.4 Soul Nova

- **Charge meter 0–100:** +0.3 per kill (any source), +5 per elite kill, +3 per gate passed. Multipliers: Seraphine ×1.3, Abyss Eye relic +5% to +30%. Target: about 3 Novas per Chapter 1 clear.
- **Activation:** 0.4 s wind-up with hit-stop. The player is invulnerable for 1.5 s. Every minion detonates in a chain that ripples outward from the player over 1.0 s.
- **Damage per detonation** = (25 + 0.5 × N) × Damage multiplier, radius 2.5 m, where N = legion size when NOVA was pressed. At N = 300, each blast deals 175 base damage, 300 times, overlapping.
- **Cost:** the legion drops to 0. Enemies killed by the Nova get +25 pp Raise Chance, so the rebuild starts at once.
- **Bosses** take 50% damage from Nova, capped at **25% of boss max HP per Nova**.

### 4.5 Pickups

| Pickup | Source | Effect |
|---|---|---|
| Soul shard (XP) | Every kill | XP equal to the enemy's XP value. Off-screen shards merge after 300 are on the map. |
| Heart | 0.5% per kill, 3% per Brute | Heals 25% of max HP |
| Magnet | 0.15% per kill, at most 1 per 60 s | Pulls every shard on the map |
| Relic Chest | Every elite | A free skill pick (choose 1 of 3), or an evolution if eligible |

### 4.6 Level-ups and loadout

- Choose 1 of 3 cards per level. **Loadout: 4 weapons (the hero's signature weapon is slot 1, at Lv1) + 4 passives.** Max skill level is 5.
- Maxing everything needs 39 level-ups (player Lv40). A Chapter 1 clear reaches about Lv26, so builds involve real trade-offs.
- When every slot is full and maxed, cards offer +50 gold, a Heart, or "Soul Surge" (+10 minions).
- 1 free reroll per run. No ads inside a run except the revive offer on death.

---

## 5. Enemy roster

Base values are for Chapter 1 at minute 0. Scaling is in §8.

| Enemy | Role | Base HP | Speed (m/s) | Damage | XP | Behaviour | Counterplay |
|---|---|---|---|---|---|---|---|
| **Husk** | Basic chaser | 14 | 1.6 | 6 per s (contact) | 1 | Walks straight at the player with flocking separation. Spawns in rings just off-screen. About 50–60% of the horde. | Anything works. Husks are raise fodder. |
| **Ghoul** | Runner | 8 | 3.6 | 4 per hit | 1 | Packs of 4–6 approach in a ±30° arc to flank, then lunge at 3 m (0.4 s crouch telegraph, 6 m/s dash for 0.5 s). | Keep moving. Skull Halo and Grave Pulse shred packs. |
| **Brute** | Tank | 120 | 1.2 | 15 per slam | 6 | Immune to knockback. Slams a 1.5 m cone after a 0.8 s wind-up. Soaks minion attacks. | Bone Spears pierce. Bulwark minions taunt it. |
| **Cinder Witch** | Ranged | 30 | 2.2 | 10 per orb | 3 | Holds 6–8 m from the player. Lobs an arcing ember orb every 3 s onto a telegraphed circle (1.0 s). From Chapter 2 the orb leaves burning ground for 2 s. | Ashen Chains and homing Soul Bolts reach her. Dash through the gap between orbs. |
| **Bloater** | Bomber | 40 | 1.8 | 25 AoE (2.5 m) | 2 | Within 2 m of the player it swells and flashes red for 1.0 s, then explodes. If killed early it pops and damages *enemies* for 25. | Kill it inside a crowd. Never let it reach you. |
| **Elite** (any type) | Gold variant | ×6 | same | ×1.5 | ×10 | Gold #ffd04a glow, ×1.3 scale, a crown-shaped silhouette marker, immune to slows. Cannot be raised. | Drops a **Relic Chest**. |
| **Gravemaw, the Hollow King** | Boss | 40,000 | 1.0 | see §6 | — | Appears at 6:00. Killing him clears the chapter. | See §6. |

Enemy colour code: warm ember/crimson (#ff4a2a, #ff8a3d), elites gold (#ffd04a), boss magenta/violet (#ff3df0). Every enemy has an emissive core so it reads against the dark ground.

---

## 6. Boss: Gravemaw, the Hollow King

Normal spawns stop at 6:00. The arena ring (18 m radius) seals with a magenta rune border. Target time-to-kill is 60–100 s for a player at the recommended power.

| Phase | HP band | Attacks | Adds |
|---|---|---|---|
| **1: Hollow Tread** | 100–66% | **Grave Slam** every 6 s: three telegraphed concentric rings (1.2 s telegraph, radii 3 / 6 / 9 m, 0.4 s stagger), 30 damage per ring. Slam rings also kill minions they touch. | 12 Husks every 15 s |
| *Transition* | 66% | Roars, invulnerable for 2 s, knockback pulse | — |
| **2: Ember Liturgy** | 66–33% | Adds **Ember Bullet Rings**: radial ring of 24 orbs with 2 safe gaps, two rings 0.8 s apart, every 7 s, 12 damage per orb. Slam every 8 s. | 16 Husks every 15 s |
| *Transition* | 33% | Crown ignites, invulnerable for 2 s | — |
| **3: Crown of Cinders** | 33–0% | Double slam (inner then outer rings). **Spiral bullet stream** (4 rotating arms, 3 s). The arena border closes from 18 m to 12 m over 20 s. | 20 Husks + 1 Brute every 12 s |
| *Soft enrage* | 3:00 into the fight | "Hollow Dirge": +50% damage and attack rate | — |

**Chapter twists:** Ch2 slams leave fire rings for 3 s · Ch3 slams leave ice patches (slide) · Ch4 adds one extra bullet ring per volley · Ch5 Phase 3 begins at 50% HP. Telegraphs never get shorter than 1.0 s in any chapter (an accessibility floor).

Boss HP = 40,000 × 1.45^(c−1): **Ch1 40,000 · Ch2 58,000 · Ch3 84,100 · Ch4 121,900 · Ch5 176,800**.

---

## 7. Skills

Damage values are base values before Might, talents, relics and stars.

### 7.1 Weapons

**Soul Bolt** (homing bolts, 9 m range, 360°/s turn rate). Vael's signature weapon.

| Stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Damage | 12 | 14 | 17 | 20 | 24 |
| Bolts per volley | 1 | 2 | 2 | 3 | 4 |
| Cooldown (s) | 1.00 | 1.00 | 0.85 | 0.85 | 0.70 |
| Pierce | 0 | 0 | 0 | 1 | 1 |

**Spectral Scythe** (sweeping arc, knockback). Nyx's signature weapon.

| Stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Damage | 30 | 36 | 44 | 52 | 62 |
| Arc | 120° | 150° | 180° | 240° | 360° |
| Radius (m) | 2.2 | 2.4 | 2.6 | 2.8 | 3.0 |
| Cooldown (s) | 1.40 | 1.35 | 1.25 | 1.20 | 1.10 |

**Ashen Chains** (chain lightning, 4 m jump range). Seraphine's signature weapon.

| Stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Damage per hit | 18 | 21 | 25 | 29 | 34 |
| Jumps | 3 | 4 | 5 | 6 | 8 |
| Chains per cast | 1 | 1 | 1 | 2 | 2 |
| Cooldown (s) | 1.6 | 1.5 | 1.4 | 1.3 | 1.1 |
| Extra | — | — | 0.25 s stun on first target | same | same |

**Bone Spears** (piercing lances in a 10° fan). Mordrake's signature weapon.

| Stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Damage | 26 | 30 | 35 | 40 | 48 |
| Spears | 1 | 2 | 2 | 3 | 4 |
| Pierce | 3 | 3 | 5 | 5 | Unlimited |
| Cooldown (s) | 1.50 | 1.50 | 1.35 | 1.35 | 1.20 |

**Skull Halo** (orbiting skulls, 180°/s, each skull can hit the same enemy every 0.5 s)

| Stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Damage per hit | 10 | 12 | 14 | 17 | 20 |
| Skulls | 2 | 3 | 4 | 5 | 6 |
| Orbit radius (m) | 1.6 | 1.7 | 1.8 | 2.0 | 2.2 |
| Uptime (on / off, s) | 3 / 2 | 3.5 / 1.5 | 4 / 1 | 5 / 0.5 | Always on |

**Grave Pulse** (AoE pulse centred on the player)

| Stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Damage | 20 | 24 | 29 | 34 | 40 |
| Radius (m) | 3.0 | 3.4 | 3.8 | 4.2 | 4.8 |
| Cooldown (s) | 3.0 | 2.8 | 2.6 | 2.4 | 2.0 |
| Slow | — | — | 20% / 1 s | 25% / 1 s | 30% / 1.5 s |

### 7.2 Passives (cumulative values at each level)

| Passive | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Raise Dead (Raise Chance) | +4 pp | +8 pp | +12 pp | +16 pp | +20 pp |
| Legion Cap (max minions) | +25 | +50 | +80 | +115 | +150 |
| Minion Fury (minion damage) | +15% | +30% | +45% | +65% | +90% |
| Haste (move speed) | +6% | +12% | +18% | +24% | +30% |
| Vitality (max HP; each pick also heals 30% of max HP) | +12% | +24% | +36% | +50% | +65% |
| Soul Magnet (pickup radius, base 1.5 m) | +25% | +50% | +80% | +110% | +150% |
| Might (all damage, minions included) | +10% | +20% | +30% | +42% | +55% |
| Frenzy (attack speed) | +8% | +16% | +24% | +33% | +42% |

### 7.3 Evolutions (stretch goal for launch)

An evolution is offered when the weapon is Lv5 **and** the paired passive is owned (any level). It appears in the next Relic Chest. If no elite remains, it appears as a guaranteed level-up card. The evolution replaces the weapon in its slot.

| Evolution | Recipe | Effect |
|---|---|---|
| **Soul Storm** | Soul Bolt Lv5 + Might | 6 bolts every 0.5 s, 30 damage, pierce 2. Each kill splits the bolt into 2 mini-bolts (10 damage). |
| **Bone Crown** | Skull Halo Lv5 + Minion Fury | 8 skulls, 26 damage, 2.6 m radius, always on. Minions within 6 m of the player get +30% damage. Every 4 s the crown heals all minions for 20%. |

---

## 8. Chapters and difficulty scaling

| # | Chapter | Palette | HP mult 1.45^(c−1) | Spawn mult | Modifier | Recommended talents |
|---|---|---|---|---|---|---|
| 1 | Ashen Necropolis | Teal / ember | 1.00 | 1.00 | None (teaching chapter) | 0 |
| 2 | Ember Wastes | Orange | 1.45 | 1.15 | More Cinder Witches; burning ground | ~8 levels total |
| 3 | Frozen Ossuary | Ice blue | 2.10 | 1.30 | Ghoul packs of 6–8; ice patches | ~25 |
| 4 | Abyssal Cathedral | Violet | 3.05 | 1.45 | 2× Bloaters; tighter fog vignette | ~60 |
| 5 | Crimson Throne | Blood red | 4.42 | 1.60 | 4 elites (1:15, 2:30, 3:45, 5:00) | ~110 |
| ∞ | Endless Abyss | Shifting | 4.42 (c = 5) | 1.60 | Time keeps scaling; Abyss Surge every 5:00 | Endgame |

Each chapter is exactly 6:00 plus the boss. Chapter N+1 unlocks when Gravemaw dies in Chapter N. Endless Abyss unlocks after the first Chapter 5 clear.

**Formulas** (c = chapter 1–5, m = minutes elapsed as a decimal):

- **Enemy HP** = BaseHP × 1.45^(c−1) × (1 + 0.20m + 0.03m²)
- **Enemy damage** = BaseDamage × (1 + 0.25(c−1)) × (1 + 0.05m)
- **Spawn rate (enemies/s)** = 1.5 × (1 + 0.15(c−1)) × (1 + 0.35m), with a limit of 220 enemies alive at once
- **Elite HP** = 6 × Enemy HP · **Boss HP** = 40,000 × 1.45^(c−1)

| Enemy HP multiplier | m=0 | m=1 | m=2 | m=3 | m=4 | m=5 | m=6 |
|---|---|---|---|---|---|---|---|
| Ch1 | 1.00 | 1.23 | 1.52 | 1.87 | 2.28 | 2.75 | 3.28 |
| Ch2 | 1.45 | 1.78 | 2.20 | 2.71 | 3.31 | 3.99 | 4.76 |
| Ch3 | 2.10 | 2.59 | 3.20 | 3.93 | 4.79 | 5.78 | 6.90 |
| Ch4 | 3.05 | 3.75 | 4.63 | 5.70 | 6.95 | 8.38 | 10.00 |
| Ch5 | 4.42 | 5.44 | 6.72 | 8.27 | 10.08 | 12.16 | 14.50 |

| Spawn rate (per s) | m=0 | m=3 | m=6 | Spawned in 6:00 |
|---|---|---|---|---|
| Ch1 | 1.50 | 3.07 | 4.65 | ~1,105 |
| Ch3 | 1.95 | 4.00 | 6.04 | ~1,437 |
| Ch5 | 2.40 | 4.92 | 7.44 | ~1,769 |

**Endless Abyss** uses c = 5 with m unbounded: at minute 10 the HP multiplier is ×26.5 and the spawn rate is 10.8/s; at minute 15 it is ×47.5 and 15.0/s. Every 5:00 an *Abyss Surge* spawns a Gravemaw Echo (30% of Ch5 boss HP). Ranking is by time survived, with kills as the tie-break.

---

## 9. In-run XP curve

**XP to next level** = round(5 + 3L + 0.12L²), where L is the current level.

| Level L | 1 | 2 | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 |
|---|---|---|---|---|---|---|---|---|---|---|
| XP to next | 8 | 11 | 23 | 47 | 77 | 113 | 155 | 203 | 257 | 317 |
| Total XP to reach L | 0 | 8 | 53 | 214 | 507 | 962 | 1,608 | 2,476 | 3,597 | 5,000 |

A Chapter 1 clear produces about 1,100 kills at about 1.5 XP each, plus elites, for roughly 1,750 XP, which is **Lv26 at 6:00**. That is one level-up every 6–10 s in minute 1 and every 20–25 s in minute 6. Shard XP values are fixed across chapters. Higher chapters level faster only because they spawn more enemies.

---

## 10. Run rewards

**Gold** = floor( (25 × M + 0.6 × K + 300 × B) × (1 + 0.25 × (c − 1)) × (1 + G) )

M = minutes survived (max 6), K = total kills (player and minions), B = 1 if Gravemaw was killed, c = chapter, G = gold bonus (Greed talent + Grave Coin + Soul Pact 20%). Blood Moon doubles the result. The rewarded-ad "double run rewards" doubles it again (they stack).

| Example (G = 0) | Full clear | Death at 4:00 (~55% kills, no boss) |
|---|---|---|
| Ch1 (~1,100 kills) | 1,110 | 463 |
| Ch3 (~1,450 kills) | 1,980 | 867 |
| Ch5 (~1,750 kills) | 3,000 | 1,354 |

- **Pass XP per run** = 2 × floor(M) + 5 × B (max 17).
- **First-clear bonus:** Ch1–Ch4 give 100 gems each. Ch5 gives 300 gems + 5 Altar Sigils.
- **Gravemaw's Hoard** (boss kill only): one relic roll. Ch1: Common 80 / Rare 18 / Epic 2. Each chapter moves 7.5 pp from Common to Rare and Epic, so Ch5 is Common 50 / Rare 38 / Epic 12. Runs never drop Legendaries. Odds are shown on the results screen.

---

## 11. Heroes (Shepherds)

| Hero | Rarity | Base HP | Move (m/s) | Signature weapon | Passive | How to get |
|---|---|---|---|---|---|---|
| Vael, the Gravecaller | Common | 100 | 4.5 | Soul Bolt | +10% Raise Chance (pp) | Free (starter) |
| Nyx Hollowborn | Rare | 90 | 4.8 | Spectral Scythe | Minions +20% speed and damage | Starter Pack / summon shards |
| Seraphine Ashveil | Epic | 95 | 4.6 | Ashen Chains | Soul Nova charges 30% faster | Summon shards (Epic+), Soul Pass S1 premium |
| Mordrake the Undying | Legendary | 120 | 4.3 | Bone Spears | Legion cap +25%; revive once per run at 50% HP | Summon shards (Legendary) |

**Stars.** Unlocking takes 10 shards (1★). Star costs: 10 / 20 / 40 / 80 shards for 2★ / 3★ / 4★ / 5★ (160 shards from first shard to 5★). Each star above 1★ adds +12% damage and +8% HP, so 5★ = +48% damage, +32% HP.

**Shard sources at launch:** an Epic Soul Altar roll gives 2 shards (Nyx or Seraphine, 50/50). A Legendary roll gives 5 Mordrake shards. The Soul Pass S1 premium track gives 10 Seraphine shards. In Endless Abyss, the top 10 of each Abyssal-league group earn 2 Mordrake shards per week. Duplicate unlocks (for example, owning Nyx and then buying the Starter Pack) convert to 10 shards of that hero.

---

## 12. Relics (gear)

Equip 3. There are 8 types and 4 rarities. Rarity multiplies the Common value (×1 / ×2 / ×3.5 / ×6). **Duplicates** (same type and same rarity) add +1 relic level. Each level adds +15% of that relic's stat. **Max level 10** (×2.35).

| Relic | Stat | Common | Rare | Epic | Legendary |
|---|---|---|---|---|---|
| Lantern of the Lost | Raise Chance | +2 pp | +4 pp | +7 pp | +12 pp |
| Crown of Thorns | Damage | +5% | +10% | +17.5% | +30% |
| Bone Idol | Legion cap | +5% | +10% | +17.5% | +30% |
| Ember Heart | Max HP | +6% | +12% | +21% | +36% |
| Wraith Boots | Move speed | +3% | +6% | +10.5% | +18% |
| Grave Coin | Gold | +5% | +10% | +17.5% | +30% |
| Hourglass of Ash | Attack speed | +4% | +8% | +14% | +24% |
| Abyss Eye | Nova charge | +5% | +10% | +17.5% | +30% |

---

## 13. Talents (gold sink)

Six talents, max level 40 each. **Talent level cap = 10 + 6 × chapters cleared** (40 after Ch5). This ties power to progress and stops gold hoarders from skipping chapters.

**Cost(L)** = 150 × 1.12^(L−1), rounded to the nearest 10. That is 150 at L1, 420 at L10, 1,290 at L20, 4,010 at L30 and 12,460 at L40. Maxing one talent costs 115,050 gold; maxing all six costs **690,300 gold**, about 2.5–4 months for an engaged player.

| Talent | Per level | At L40 |
|---|---|---|
| Might | +1.5% damage | +60% |
| Vitality | +2% max HP | +80% |
| Raise Chance | +0.25 pp | +10 pp |
| Legion Cap | +1% legion cap | +40% |
| Greed | +2% gold | +80% |
| Swiftness | +0.5% move speed | +20% |

---

## 14. Art direction: "Neon Gothic"

- **Camera:** top-down perspective with a 55° tilt and 40° FOV, portrait. About 12 m of world is visible across the screen. Slight look-ahead (1.5 m) in the move direction so gates and threats appear in front of the thumb, not under it.
- **Ground:** dark obsidian graveyard, glowing rune lines, fog vignette, heavy bloom. Value range is kept low (L* < 20) so emissives carry the image.
- **Colour law:** allies are always cool (#4ef2ff, #7cffd4), enemies are always warm (#ff4a2a, #ff8a3d), elites are gold (#ffd04a), bosses are magenta/violet (#ff3df0). Chapter tints change the environment only and never ally or enemy colours.

| Chapter | Environment key colour | Fog / rune accent | Note |
|---|---|---|---|
| 1 Ashen Necropolis | #0d1a1c obsidian | Teal runes, ember braziers | Reference palette |
| 2 Ember Wastes | #1a0e08 scorched | Orange #ff9a3c haze | Enemies get a brighter rim light to separate from the orange ground |
| 3 Frozen Ossuary | #0e141c frost | Pale ice #bfe6ff, desaturated | Kept low-saturation so cyan allies still pop |
| 4 Abyssal Cathedral | #120c1e | Violet #9b5cff stained glass | Boss magenta gets a white core to stay distinct |
| 5 Crimson Throne | #1a0608 | Blood red #c8102e | Enemy ember shifted to orange to avoid blending with red |

- **Readability:** strong silhouettes, an emissive core on every unit, additive particles, screen shake (scalable), 40–80 ms hit-stop on elite kills and the Nova wind-up. Enemy telegraphs are ground decals that fill from the edge inward.
- **Minions:** the same instanced meshes as their source enemy, cyan with a soft trail. At 300+ minions, trails switch to a shared ribbon per ring for performance.
- **UI:** obsidian panels with cyan rune trim. Premium currency and offers use gold. Display font is a gothic serif (e.g. Cinzel); body font is a clean sans (e.g. Inter). Numbers on gates and legion count are huge and outlined.

## 15. Audio direction

- **Music:** dark synthwave with choir and pipe organ. **Stems are added as the legion grows** (25 / 100 / 200 / 300 minions): percussion, then bass, choir and lead. The player *hears* the army getting bigger. Boss tracks are separate, with a phase-3 key change.
- **SFX priorities** (voice limit 32): 1) player hit and telegraphs, 2) Nova, 3) gates, 4) level-up, 5) raises (pooled into a shimmering chord, at most 10 voices), 6) weapons, 7) enemy deaths (heavily pooled).
- **Signature sounds:** *Raise*, a rising glassy chime. *Gate*, a deep bell, pitched up for + and × and down for −. *Nova*, a 0.4 s inhale, then a sub-bass drop and a crackling chain that spreads in stereo with the ripple. *Gravemaw*, a low brass drone and a distinct slam warning cue 1.2 s before impact.
- **Mix:** music ducks −6 dB during Nova and boss telegraphs. Full playability with sound off: every audio cue has a visual twin.

---

## 16. UX and FTUE: the first 10 minutes

Goal: the player experiences all three hooks (raise, gate, Nova) and a boss kill inside 4 minutes, before any shop or currency screen.

| Time | Beat | What the player does / sees | Telemetry event |
|---|---|---|---|
| 0:00 | Launch | Logo (2 s), loading in under 5 s on a mid-range device | `app_open` |
| 0:05 | Age gate | Neutral birth-year wheel (no default age). Under-13 routes to restricted mode (see MONETIZATION §11). EEA/UK users see the consent dialog. | `age_gate_done` |
| 0:15 | Cold open | 6 s in-engine shot: Vael rises among graves. "Raise the Legion." | `ftue_intro` |
| 0:20 | "The Waking" (tutorial run, no energy cost) | Ghost thumb: "Drag anywhere to move." | `ftue_move` |
| 0:30 | First kill | Soul Bolt fires automatically. Husk dies. | `ftue_first_kill` |
| 0:35 | **Hook 1: Raise** | The first 5 kills raise at 100% (tutorial only). Caption: "The fallen rise for you." | `ftue_first_raise` |
| 0:50 | First level-up | 3 cards. Raise Dead is highlighted, but any pick is allowed. | `ftue_levelup` |
| 1:20 | **Hook 2: Soul Gate** | Legion is about 12. Gates: +5 vs ×2. After passing, a short caption explains the maths ("×2 = +12!"). A wrong pick gets a gentle hint, not a punishment. | `ftue_gate` (choice) |
| 1:45 | First elite | Gold Brute. It drops a Relic Chest → free pick. | `ftue_elite` |
| 2:15 | **Hook 3: Soul Nova** | The meter is accelerated in the tutorial. A pulsing ring and finger point at NOVA. Screen wipe, 0.3 s slow-mo, legion count drops to 0 and starts climbing again. | `ftue_nova` |
| 2:40 | Second gate | ×2 vs −50%, where ×2 sits behind a Bloater. Teaches risk. | `ftue_gate2` |
| 3:00 | Gravemaw (tutorial) | 25% HP, Phase 1 only. Telegraph rings are shown slowly. | `ftue_boss` |
| 3:45 | Victory | Results: gold, 50 gems, peak legion. "Your legion peaked at N." | `ftue_complete` |
| 4:00 | Home screen | Only **Play** and **Talents** are lit. Other tabs show locked silhouettes. | `home_first` |
| 4:15 | First talent | Guided: buy Might Lv1 (150 gold). The gold sink is learned. | `talent_first` |
| 4:30 | Chapter 1 | Energy explained in one line (5 per run, refills over time). The first death in Chapter 1 gets a free revive with no ad. | `run_start` |
| 4:30–11:30 | First real run | Full 6:00 + boss. Most new players reach 3:30–5:30 on the first try. | `run_end` |
| After run 1 | Unlocks | Soul Altar unlocks with a **gift relic** (a labelled gift, not a fake summon; the FTUE never stages an Altar result). Daily quests unlock. | `altar_unlock` |

**Later gates:** the 7-day login appears at the start of session 2. The Starter Pack is first shown after the player's first Chapter 1 boss kill, and never during the tutorial. Its 48 h timer starts at first display and is real. Rewarded-ad placements first appear in run 2. On iOS the ATT prompt is preceded by a one-screen explanation and shown before the first ad, never at cold start.

---

## 17. Accessibility

| Area | Feature |
|---|---|
| Vision | Colourblind modes (protan / deutan / tritan) that remap enemy warm colours while keeping shape cues. Elites always carry a crown marker; Bloaters always show a pulsing ring. **High-contrast outlines** toggle. UI text scale 90–150%. |
| Photosensitivity | **Reduce flashes**: Nova and boss flashes capped at 3 Hz with luminance limits, bloom reduced. Screen shake slider (0–100%). Hit-stop toggle. |
| Motor | One-thumb by design. Left-handed mode mirrors the NOVA button. Adjustable joystick size and dead zone. **Auto-Nova** option (fires at 100% when legion ≥ 50). Pause anywhere. No timing-critical taps outside movement. |
| Hearing | Every audio cue has a visual twin. Subtitles for all VO. Separate volume sliders for music, SFX and UI. |
| Cognitive | Gate maths preview toggle ("shows result: 37 → 74"). Telegraphs are never under 1.0 s. A tutorial replay and a short skills glossary in pause. |
| Performance comfort | 30 / 60 fps choice, battery saver mode, reduced-particles mode. |

---

## 18. Open design questions (to resolve in alpha)

1. Is a 60% Raise Chance cap too high for Chapter 1 power fantasy versus Chapter 5 challenge? Test 50% vs 60%.
2. Should overflow minions above the cap fade (current) or persist until the next Nova?
3. Evolutions are a stretch goal. If they slip, do they ship in Season 2 with a third recipe?
4. Auto-Nova could reduce the skill expression of Nova timing. Monitor Nova-timing win rates for players who use it.
