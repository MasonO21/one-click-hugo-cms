# SOULSWARM: Game Design Document

**Tagline:** *Raise the Legion.*
**Status:** v1.1, synced to the playable HTML5/Three.js prototype (Oct 2026)
**Owner:** Lead Game Designer / PM
**Source of truth:** the code. Gameplay and economy numbers live in `src/game/data.js`, `run.js`, `skills.js`, `boss.js`, `gates.js` and `src/meta/economy.js`. This document and `DESIGN_BRIEF.md` mirror them; if they disagree, the code wins and the docs get fixed. Numbers marked *(tuning)* are starting values for balancing and are expected to move during soft launch.

---

## 0. Implementation status

The prototype in `src/` is a playable browser build (Three.js, with Capacitor shells for iOS and Android). Purchases and rewarded ads are **simulated** by `src/meta/store.js`, and the profile is saved on the device (localStorage).

| Area | Playable in the current build | Planned (not in the build) |
|---|---|---|
| Run | Floating joystick (plus WASD), auto-firing weapons, Raise Chance minions (one minion type), legion up to 400, Soul Gates (+N / ×2 / ×3 / −N / ÷2), Soul Nova, swarm rings, 4 elites with Relic Chests, Gravemaw (slam, ember rings, summons, enrage at 50%), level-up cards with 1 ad reroll, revive (ad or 60 gems; Mordrake gets 1 free), four first-run hints | Scripted tutorial run, minion variants (§4.2), overflow fade, Nova wind-up and invulnerability, boss phases and sealed arena (§6), enemy special moves and chapter modifiers (§5, §8), adaptive music stems (§15), accessibility options (§17) |
| Content | 5 chapters, 5 enemy types plus elites, 6 weapons, 8 passives, 2 evolutions, 4 heroes (1★–5★), 8 relic types × 4 rarities, 6 talents | Endless Abyss, Nightmare and Torment difficulties, new heroes (`LIVEOPS.md`) |
| Meta and economy | Soul Altar (disclosed odds, 60-pull pity, 10-pull Epic guarantee, free daily summon), Soul Pass Season I (30 tiers), 6 daily quests, 7-day login, energy, all 9 SKUs (simulated), gem shop, Soul Pact, Starter Pack, daily free chest, rewarded-ad placements, account level | Talent level cap by chapters cleared, quest all-clear bonus, weekly quest chest, pass catch-up tiers, Pact grace days, daily ad caps, Relic Ascension, server-side economy and cloud save (`PRODUCTION_ROADMAP.md`) |
| Live ops and social | — | Blood Moon, Boss Rush, holiday events, leaderboards and leagues, Covens (clans), Legion Raids, share card and replay clips |

Everything below describes the build unless it is marked **Planned**.

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
| Run | 6–9 min | Clear the chapter (survive 6:00, kill Gravemaw) | Level-up cards, Soul Gates, elites, Nova, boss | Gold, gems, pass XP, quest progress, first-clear bonus |
| Meta | Days to months | Get strong enough for the next chapter | Talents, relics, heroes and stars, Soul Altar | Power, new chapters, Endless Abyss (Planned) |
| Daily | 15–40 min/day | Finish quests, spend energy | 6 daily quests, 7-day login calendar, rewarded ads, energy | Gems, gold, sigils, pass XP |
| Weekly (Planned) | 7 days | Climb the leaderboard, farm Blood Moon | Blood Moon weekend, Endless Abyss weekly board, weekly quest chest | Sigils, gems, league rewards |
| Seasonal | 28 days | Finish the Soul Pass, collect the new hero | Soul Pass (30 tiers); Planned: monthly Boss Rush, new hero every 1–2 seasons | Skins, Epic/Legendary relics, hero shards |

**Moment-to-moment.** Move → weapons fire automatically at the nearest threat → an enemy dies → it drops a soul shard and has a *Raise Chance* to rise as a cyan minion → minions orbit you and hunt nearby enemies → more kills → more shards and more minions. The player's only job is positioning: kite, collect, pick gates, avoid telegraphs.

**Run.** 0:00–6:00 survival with rising density, 9 Soul Gate pairs (0:28, then every 40 s), 6 swarm rings, 4 elites (1:15, 2:30, 3:45, 4:50) and roughly 21 level-ups (about Lv22, §9), then Gravemaw at 6:00. A full clear is 6:00 plus the boss fight. A failed run usually ends between 2:30 and 5:00.

**Daily.** Energy regenerates (+1 every 6 min, 30 max = 6 runs per full bar, 3 hours from empty to full). Quests are designed to be finished in 2–3 runs and reset at local midnight. Daily quest set: Slay 500 enemies · Raise 150 souls · Survive 4 minutes (in one run) · Unleash Soul Nova 3× · Pass 3 Soul Gates · Finish 2 runs.

| Daily quest reward | Gems | Gold | Sigils | Pass XP |
|---|---|---|---|---|
| Slay 500 enemies | 20 | 0 | 0 | 40 |
| Raise 150 souls | 0 | 1,500 | 0 | 40 |
| Survive 4 minutes | 15 | 0 | 0 | 30 |
| Unleash Soul Nova 3× | 0 | 1,200 | 0 | 30 |
| Pass 3 Soul Gates | 0 | 0 | 1 | 30 |
| Finish 2 runs | 25 | 0 | 0 | 50 |
| All 6 complete (bonus) | Planned | | | |
| **Daily total** | **60** | **2,700** | **1** | **220** |

**7-day login calendar** (does not reset if a day is missed; it pauses): D1 2,000 gold · D2 30 gems · D3 1 Altar Sigil · D4 5,000 gold · D5 50 gems · D6 2 Altar Sigils · D7 Legendary-chance relic chest (Epic 80% / Legendary 20%; showing these odds on the calendar is Planned) + 100 gems. One cycle = 7,000 gold, 180 gems, 3 sigils and 1 relic. The cycle then repeats.

**Weekly (Planned).** Blood Moon runs every weekend (Fri 00:00 – Sun 23:59 UTC): 2× elites (8 per run instead of 4) and 2× run rewards. Endless Abyss leaderboards reset Monday 00:00 UTC. The weekly quest chest (finish 25 daily quests in a week) gives 1 Altar Sigil, 50 gems and 100 pass XP.

**Seasonal.** A Soul Pass season lasts 28 days with 30 tiers × 100 pass XP = 3,000 XP. Daily quests give 220 pass XP and a run gives about 80–210 (§10), so a player who does all quests and about 3 runs a day earns about 600 pass XP per day and reaches tier 30 in about 5 days. A casual player (4 days a week, 2 runs a day) finishes in about 2 weeks. *(Tuning: far faster than the 28-day pacing the season was designed for; see §18.)*

---

## 3. Controls

| Input | Behaviour | Notes |
|---|---|---|
| **Floating joystick** | Touch anywhere on the battlefield to spawn the stick base at your thumb. Drag to move. Release to stop. WASD / arrow keys on desktop. | Radius 58 px. Dead zone 12% of the radius (~7 px), then analog speed rises linearly to 100% at full deflection. The base follows the thumb if it is dragged beyond 1.6× radius ("leash"). |
| **Auto-attack** | All weapons fire on their own cooldowns. | Soul Bolt targets the nearest enemies within 11.5 m, Ashen Chains the nearest within 7.5 m, Bone Spears aim at the nearest within 13 m (or straight ahead). The Scythe sweeps a full circle starting from the facing direction; Grave Pulse and Skull Halo hit around the player. A weapon with no target retries after 0.12 s. *(Planned: elites and Bloaters within 3 m get priority.)* |
| **NOVA button** | 88 px circle in the bottom-right (Space on desktop). Works at 100% charge with any legion size. | Pulses when ready. A tap fires immediately with 0.55 s of slow motion. A touch on the button never starts the joystick. *(Planned: 0.4 s wind-up, disabled below 10 minions, left-handed mirror.)* |
| **Pause** | Top-left, 36 px. Also auto-pauses when the app goes to the background. | The pause screen shows time, kills, legion size and the current build, plus a sound toggle and "Abandon run". *(Planned: Nova charge on the pause screen.)* |
| **Level-up / chest cards** | 3 large cards. Tap to pick. Gameplay is paused. | After a pick the Shepherd gets 0.6 s of invulnerability. *(Planned: a 0.3 s input guard against accidental picks.)* |
| **Haptics** | Success on level-up, Relic Chest and a good gate; warning on a bad gate and the boss warning; medium when hit; heavy on Nova, boss slam, death and boss kill. | Toggle in settings. *(Planned: a light tick on raise, throttled to 10/s.)* |

There are no other in-run buttons. The reroll (1 per run, through an optional rewarded ad, free with Soul Pact) sits inside the level-up screen.

---

## 4. Run systems

### 4.1 Run timeline (Chapter 1 reference)

| Time | Spawn mix | Scripted events |
|---|---|---|
| 0:00–1:00 | Husks 100% | First Soul Gate pair at 0:28. Swarm ring at 0:50 (22 Husks, 13 m around the player) |
| 1:00–2:00 | Husks 75%, Ghouls 25% | Gate 1:08. **Elite Husk** at 1:15. Gate 1:48. Swarm ring 1:50 (27) |
| 2:00–3:00 | Husks 55%, Ghouls 25%, Cinder Witches 10%, Bloaters 10% | Gate 2:28. **Elite Brute** at 2:30. Swarm ring 2:50 (32; from here every 3rd is a Ghoul) |
| 3:00–4:00 | Husks 45%, Ghouls 20%, Brutes 13%, Cinder Witches 12%, Bloaters 10% | Gate 3:08. **Elite Cinder Witch** at 3:45. Gate 3:48. Swarm ring 3:50 (37) |
| 4:00–6:00 | Husks 40%, Ghouls 20%, Brutes 17%, Cinder Witches 13%, Bloaters 10%; density peak | Gate 4:28. **Elite Brute** and swarm ring (40) at 4:50. Gates 5:08, 5:48. Swarm ring 5:50 (40). Warning banner "THE HOLLOW KING APPROACHES" at 5:52 |
| 6:00 | Normal spawns stop; a trickle of Husks and Ghouls continues (§6) | **Gravemaw, the Hollow King**. Open gates vanish |

Normal spawns appear just off-screen; 45% of them are biased toward the player's movement direction.

### 4.2 The Legion (Raise Chance and minions)

- **Raise Chance** is in percentage points (pp). Base 25%. Sources: Vael +10 pp, the Raise Dead skill (+6 pp per level), the Necromancy talent (+1 pp per level), the Lantern of the Lost relic (+3 to +18 pp, more with relic levels). **Hard cap 85%.** Raise Chance is halved while a Soul Nova is detonating.
- Every kill rolls Raise Chance, whether the Shepherd, a minion, the Nova or a Bloater blast made the kill. Elites can be raised. The Bloater that explodes does not rise, and Gravemaw cannot be raised (killing him adds 30 minions instead).
- **Legion cap:** base 30. Flat bonuses: the Legion Cap skill (+10 per level, +50 at Lv5), the Dominion talent (+2 per level, +40 at L20), the Bone Idol relic (+3 to +18, up to +42 at Legendary Lv10). Mordrake multiplies the total by 1.25, then it is rounded. **Technical hard ceiling: 400 minions** on every device, for performance and leaderboard fairness.
- Kills only roll while the legion is below the cap; at the cap nothing happens. *(Planned: a successful roll at the cap heals the weakest minion by 50%.)*
- **Minions (build):** one minion type, a soul wisp in the hero's colour. Level = the Shepherd's in-run level, c = chapter.

| Stat | Value |
|---|---|
| HP | 34 × (1 + 0.08(level − 1)) × (1 + 0.4(c − 1)) |
| Damage per hit | 7 × hero damage multiplier (stars, Might talent, Crown of Thorns) × Nyx 1.2 × (1 + 0.2 × Minion Fury level) × (1 + 0.04(level − 1)) × (1 + 0.45(c − 1)), ±15% per hit. The in-run Might skill does not apply. No crits. |
| Attack interval | 0.5 s, on contact |
| Speed | 9.5 m/s (Nyx +20%); 15% faster while returning to formation |
| Damage taken | 30% of the target's damage per hit (50% against Gravemaw). Boss slams kill every minion in the slam radius. Bloater blasts deal 60. |

- **Planned minion variants** (not in the build). Minion types inherit the silhouette of what they were, recoloured cyan/teal:

| Raised from | Minion | HP | Damage / hit | Attack interval | Speed (m/s) | Special |
|---|---|---|---|---|---|---|
| Husk | Shade | 30 | 3 | 1.0 s | 4.0 | — |
| Ghoul | Wisp Runner | 15 | 2 | 0.6 s | 6.0 | Leashes farther (9 m) |
| Brute | Bulwark | 120 | 6 | 1.4 s | 3.0 | Taunts enemies within 3 m |
| Cinder Witch | Soul Witch | 25 | 5 (orb, 6 m range) | 1.5 s | 3.5 | Ranged |
| Bloater | Soul Bomb | 20 | 30 AoE (2 m), once | — | 4.5 | Runs into the densest cluster and explodes |

- **AI:** idle minions orbit the player in up to 5 rings of 12 (radii 1.7 / 2.45 / 3.2 / 3.95 / 4.7 m, alternating direction). Every 0.25–0.45 s an idle minion looks for the nearest enemy within 6.5 m of itself that is inside the 9 m leash around the player. It drops the target when it dies or moves more than 12 m from the player. *(Planned: at most 24 minions engage a boss at once.)*

### 4.3 Soul Gates

- A pair spawns every **40 s** from 0:28 to 5:48 (9 per chapter, none during the boss). They appear 10.5 m ahead along the player's movement direction (straight up-screen if standing still), side by side (each 3.4 m wide, 0.9 m apart), rise in 0.6 s and last 15 s.
- **The numbers are always the truth.** The values shown are exactly what happens. There are no hidden modifiers, and ×N is applied to the legion size at the moment you walk through. The only limit is the 400 ceiling.
- The gate choice is a maths-and-risk puzzle. *(Planned: the better-looking gate is often placed behind a Brute or a Bloater cluster.)*
- **Overflow:** gate results can push the legion above the cap (up to the 400 ceiling). Overflow minions stay until they die or are detonated, but kills stop raising until the legion is back under the cap. *(Planned: overflow minions last 20 s, then fade at 2 per second.)*
- **Negative gates:** −N removes N minions (all of them if the legion is smaller) and ÷2 removes half, rounded down. Lost minions simply vanish. *(Planned: minions lost to a negative gate detonate at 50% Nova power, making ÷2 an emergency escape.)*

**How pairs are built** (L = legion size, m = minutes elapsed; values round to the nearest 5, minimum 5):

- **+N** = (12 + 7m + 0.2L) × k. **−N** = max(10, 0.5L). The bad gate is −N when L < 12, otherwise −N or ÷2 at 50/50.
- L < 10: 60% two adds (k = 1.3 and 0.6), 40% add (k = 1.2) vs bad.
- L ≥ 10: 45% add (k = 1) vs ×2 · 30% ×2 (×3 with 15% chance) vs bad · 25% add (k = 1.4) vs bad. Sides are random.

| Example | Typical pairs |
|---|---|
| 0:28, legion 5 | +20 vs +10 · +20 vs −10 |
| 1:08, legion 30 | +25 vs ×2 · ×2 vs −15 (or ÷2) · +35 vs −15 (or ÷2) |
| 3:08, legion 100 | +55 vs ×2 · ×2 or ×3 vs −50 (or ÷2) · +75 vs −50 (or ÷2) |
| 5:08, legion 200 | +90 vs ×2 · ×2 or ×3 vs −100 (or ÷2) · +125 vs −100 (or ÷2) |

### 4.4 Soul Nova

- **Charge meter:** each kill (any source) adds 1/140 of a full charge, times the Nova charge multiplier (Seraphine +30%, Abyss Eye relic +5% to +30%, more with relic levels). Kills during a detonation add nothing. A full charge takes 140 kills (≈108 for Seraphine), so a Chapter 1 clear (~2,000 kills) can fill the meter roughly 14 times. *(Planned: +5 per elite kill, +3 per gate.)*
- **Activation:** tap NOVA at 100%. It fires at once with 0.55 s of slow motion (30% speed), a flash, and all enemy projectiles cleared. Every minion detonates in a chain that ripples outward from the player over min(0.75, 0.15 + 0.003N) s. *(Planned: 0.4 s wind-up with hit-stop and 1.5 s of invulnerability.)*
- **Damage per detonation** = (35 + 0.5 × N) × Damage multiplier × (1 + 0.45(c − 1)), radius 2.6 m, where N = legion size when NOVA was pressed and the Damage multiplier includes stars, the Might talent and skill, and Crown of Thorns. The Shepherd's own blast deals 1.2× that damage in a 7 m radius, with knockback. At N = 300, each blast deals 185 base damage, 300 times, overlapping.
- **Cost:** the legion drops to 0, and Raise Chance is halved until the chain finishes, so the rebuild starts a beat later.
- **Bosses** take full Nova damage in the build. *(Planned: bosses take 50% damage from Nova, capped at 25% of boss max HP per Nova.)*

### 4.5 Pickups

| Pickup | Source | Effect |
|---|---|---|
| Soul shard (XP) | Every kill | XP equal to the enemy's XP value (×12 for elites). At most 420 shards on the map; past ~416, new shards merge into the nearest shard within 3 m. Shards left 48 m behind are lost. |
| Heart | 0.6% per non-elite kill | Heals 30% of max HP |
| Magnet | 0.3% per non-elite kill | Pulls every shard on the map |
| Relic Chest | Every elite | One weighted random card, applied automatically (an evolution if eligible). *(Planned: choose 1 of 3.)* |

Pickup radius is 2.8 m (Soul Magnet +30% per level). Hearts, magnets and chests are pulled in at 80% of that radius and vanish after 40 s.

### 4.6 Level-ups and loadout

- Choose 1 of 3 cards per level. **Loadout: 4 weapons (the hero's signature weapon is slot 1, at Lv1), plus any of the 8 passives** (there is no passive slot limit). Max skill level is 5.
- **Card weighting:** every skill below Lv5 is in the pool (new weapons only while a weapon slot is free). Base weight 1.0 for a new skill and 1.5 for an upgrade; ×1.3 for Raise Dead, Legion Cap and Minion Fury; ×1.5 for a new weapon while fewer than 2 are owned; an eligible evolution has weight 1,000. The 3 cards are drawn without repeats.
- Maxing everything takes 61 picks (19 weapon upgrades, 40 passive levels, 2 evolutions). With 4 Relic Chests per run that is about 57 level-ups (player Lv58). A Chapter 1 clear reaches about Lv22, so builds involve real trade-offs.
- When nothing is left to upgrade, the cards are "Second Wind" (heal 50% HP) and "Grave Gold" (+150 gold this run).
- 1 reroll per run, through an optional rewarded ad. No other ads inside a run except the revive offer on death.
- **Revive:** one paid revive per run (rewarded ad or 60 gems), offered for 10 s on the death screen. It restores full HP, gives 2.5 s of invulnerability and blasts every enemy within 8 m for 50% of its max HP. Mordrake's free revive triggers automatically on his first death and does not use up the paid one.

---

## 5. Enemy roster

Base values are for Chapter 1 at minute 0. Scaling is in §8. Each enemy deals its contact damage at most once per 0.8 s, and the Shepherd is invulnerable for 0.5 s after any hit. Enemies more than 42 m from the player despawn.

| Enemy | Role | Base HP | Speed (m/s) | Damage | XP | Behaviour | Counterplay |
|---|---|---|---|---|---|---|---|
| **Husk** | Basic chaser | 14 | 2.4 | 6 per touch | 1 | Walks straight at the player with flocking separation and a slight weave. Spawns just off-screen and in swarm rings. 40–100% of the horde. | Anything works. Husks are raise fodder. |
| **Ghoul** | Runner | 8 | 4.4 | 5 per touch | 1 | A fast chaser; every 3rd swarm-ring enemy after 2:00. *(Planned: packs of 4–6 that flank in a ±30° arc and lunge at 3 m after a 0.4 s crouch telegraph.)* | Keep moving. Skull Halo and Grave Pulse shred packs. |
| **Brute** | Tank | 75 | 1.7 | 18 per touch | 4 | Mass 5: shrugs off most knockback and shoves smaller enemies aside. Soaks minion attacks. *(Planned: a 1.5 m cone slam after a 0.8 s wind-up.)* | Bone Spears pierce. |
| **Cinder Witch** | Ranged | 22 | 2.3 | 10 per orb | 2 | Stops at 8.5 m, backs away inside 5.1 m, and fires a straight ember orb (6.5 m/s) about every 2.6 s. *(Planned: arcing orbs onto a telegraphed circle; burning ground from Chapter 2.)* | Ashen Chains and homing Soul Bolts reach her. Sidestep the orbs. |
| **Bloater** | Bomber | 28 | 2.0 | 26 AoE (2.6 m) | 2 | Within 2.4 m of the player it slows to 25%, flashes and shows a 2.6 m telegraph, then explodes after 0.85 s. The blast also deals 60 to minions and 1.2× its max HP to other *enemies*. Killed early, it just dies (and can rise). | Kill it early, or let it detonate inside a crowd. Never let it reach you. |
| **Elite** (any type) | Gold variant | ×6 | ×0.9 | ×1.5 | ×12 | Gold #ffd04a glow, ×1.35 scale, ×3 mass. Can be raised. *(Planned: crown-shaped silhouette marker.)* | Drops a **Relic Chest**. |
| **Gravemaw, the Hollow King** | Boss | 3,400 | 2.3 | 22 per touch, see §6 | — | Appears at 6:00. Killing him clears the chapter. | See §6. |

Enemy colour code: warm ember/crimson (#ff4a2a, #ff8a3d), elites gold (#ffd04a), boss magenta/violet (#ff3df0). Every enemy has an emissive core so it reads against the dark ground.

---

## 6. Boss: Gravemaw, the Hollow King

Normal spawns stop at 6:00 and any open Soul Gates vanish. A trickle of Husks (70%) and Ghouls (30%) continues at 1.2/s × the chapter spawn mult, up to 90 alive. Gravemaw rises 11 m up-screen from the player over 1.4 s and cannot be damaged while rising. Target time-to-kill is 60–100 s for a player at the recommended power *(tuning; see §18)*.

| Attack | Chosen when | Normal | Enraged (below 50% HP) |
|---|---|---|---|
| **Chase** | Between attacks | 2.3 m/s. Contact deals full damage, at most once per 1.0 s. | +35% move speed |
| **Grave Slam** | 45% of picks, only if the player is within 13 m | Telegraphed circle on the player's position (radius 3.4 m, 1.25 s). He leaps and lands for 1.4× damage and kills every minion inside. 1.9 s recovery. | Radius 4.2 m, 1.0 s telegraph, 1.3 s recovery |
| **Ember Ring** | 33% of picks (78% when the player is beyond 13 m) | 2 waves, 0.45 s apart, of 18 orbs at 6 m/s, each dealing 0.6× damage; each wave is rotated so the gaps shift. 1.6 s recovery. | 3 waves of 26 orbs at 7.5 m/s |
| **Summon** | 22% of picks | 6 adds in a ring (Husks, every 3rd a Ghoul) at the run's current HP and damage scaling. 1.4 s recovery. | 8 adds; the first is an Elite |

His first attack comes 2.5 s after he rises. At 50% HP he enrages once ("GRAVEMAW ENRAGES"). When he dies, every enemy is cleared, all shards fly to the player, 30 souls join the legion and the chapter is cleared.

**Planned (design, not in the build):** an 18 m arena sealed by a magenta rune border; three phases (*Hollow Tread* 100–66%, *Ember Liturgy* 66–33%, *Crown of Cinders* 33–0%) with 2 s invulnerable roar transitions; Grave Slam as three concentric rings (radii 3 / 6 / 9 m, 1.2 s telegraph, 30 damage per ring); bullet rings of 24 orbs with 2 safe gaps; a 4-arm spiral stream and an arena that closes from 18 m to 12 m in phase 3; Husk waves (12–20, plus a Brute in phase 3) every 12–15 s; and a "Hollow Dirge" soft enrage (+50% damage and attack rate) 3:00 into the fight.

**Chapter twists (Planned):** Ch2 slams leave fire rings for 3 s · Ch3 slams leave ice patches (slide) · Ch4 adds one extra bullet ring per volley · Ch5 Phase 3 begins at 50% HP. Telegraphs never get shorter than 1.0 s in any chapter (an accessibility floor; the build's enraged slam sits exactly at 1.0 s).

Boss HP = 3,400 × chapter HP mult × (1 + 0.15(c−1)): **Ch1 3,400 · Ch2 7,429 · Ch3 14,144 · Ch4 24,650 · Ch5 40,800**. Boss damage = 22 × (1 + 0.3(c−1)): Ch1 22 · Ch2 28.6 · Ch3 35.2 · Ch4 41.8 · Ch5 48.4. Neither scales with run time.

---

## 7. Skills

Damage values are base values before Might, talents, relics and stars. Every weapon hit has a 10% chance to crit for ×2 damage. Cooldowns are divided by the attack-speed multiplier (Frenzy, Hourglass of Ash).

### 7.1 Weapons

**Soul Bolt** (homing bolts at the nearest enemies within 11.5 m, 17 m/s, 1.4 s life). Vael's signature weapon.

| Stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Damage | 12 | 15 | 18 | 22 | 28 |
| Bolts per volley | 1 | 2 | 2 | 3 | 4 |
| Cooldown (s) | 0.70 | 0.66 | 0.60 | 0.55 | 0.48 |
| Pierce | 0 | 0 | 1 | 1 | 2 |

**Spectral Scythe** (full-circle sweeps, 0.3 s each, starting from the facing direction; knockback; each sweep hits an enemy once). Nyx's signature weapon.

| Stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Damage | 16 | 20 | 26 | 32 | 42 |
| Sweeps per cast | 1 | 1 | 2 | 2 | 3 |
| Radius (m) | 2.6 | 2.8 | 3.0 | 3.3 | 3.7 |
| Cooldown (s) | 1.60 | 1.50 | 1.35 | 1.20 | 1.00 |

**Ashen Chains** (chain lightning: first target within 7.5 m, then jumps to the nearest new enemy within 4.5 m). Seraphine's signature weapon.

| Stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Damage per hit | 14 | 17 | 21 | 26 | 33 |
| Targets hit | 3 | 4 | 5 | 6 | 8 |
| Cooldown (s) | 1.50 | 1.40 | 1.25 | 1.10 | 0.95 |

*(Planned: 2 chains per cast and a 0.25 s stun on the first target at higher levels.)*

**Bone Spears** (piercing lances aimed at the nearest enemy within 13 m, in a fan 0.2 rad ≈ 11° apart; 21 m/s, about 20 m reach). Mordrake's signature weapon.

| Stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Damage | 24 | 30 | 37 | 46 | 58 |
| Spears | 1 | 1 | 2 | 2 | 3 |
| Pierce | 3 | 4 | 5 | 6 | Unlimited |
| Cooldown (s) | 1.35 | 1.25 | 1.15 | 1.05 | 0.95 |

**Skull Halo** (orbiting skulls, always on, ~155°/s; each enemy can be hit by the halo once every 0.35 s)

| Stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Damage per hit | 9 | 11 | 13 | 16 | 20 |
| Skulls | 2 | 3 | 4 | 5 | 6 |
| Orbit radius (m) | 2.3 | 2.4 | 2.6 | 2.8 | 3.0 |

**Grave Pulse** (AoE shockwave centred on the player, strong knockback)

| Stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Damage | 12 | 16 | 20 | 25 | 33 |
| Radius (m) | 3.6 | 4.0 | 4.5 | 5.0 | 6.0 |
| Cooldown (s) | 3.0 | 2.8 | 2.5 | 2.2 | 1.8 |

*(Planned: a 20–30% slow from Lv3.)*

### 7.2 Passives (cumulative values at each level)

| Passive | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Raise Dead (Raise Chance) | +6 pp | +12 pp | +18 pp | +24 pp | +30 pp |
| Legion Cap (max minions) | +10 | +20 | +30 | +40 | +50 |
| Minion Fury (minion damage) | +20% | +40% | +60% | +80% | +100% |
| Haste (move speed) | +8% | +16% | +24% | +32% | +40% |
| Vitality (max HP; the added HP is also healed) | +20 | +40 | +60 | +80 | +100 |
| Soul Magnet (pickup radius, base 2.8 m) | +30% | +60% | +90% | +120% | +150% |
| Might (weapon and Nova damage, not minions) | +10% | +20% | +30% | +40% | +50% |
| Frenzy (attack speed) | +8% | +16% | +24% | +32% | +40% |

The Vitality card text says "heal 30%", but the build only adds the +20 HP to current HP. Fix the card or the code before soft launch.

### 7.3 Evolutions

Both evolutions are in the build. An evolution card enters the pool when the weapon is Lv5 **and** the paired passive is owned (any level). With weight 1,000 it is almost always the next card offered, at a level-up or from a Relic Chest. The weapon keeps its slot and is upgraded in place.

| Evolution | Recipe | Effect |
|---|---|---|
| **Soul Storm** | Soul Bolt Lv5 + Might | 6 bolts per volley (Lv5 cooldown), 34 damage, pierce 3. Each hit explodes for 60% damage in a 1.9 m radius. |
| **Bone Crown** | Skull Halo Lv5 + Minion Fury | 8 skulls, 26 damage, 3.2 m radius, always on. Every skull kill raises a soul (while below the cap). |

*(Planned extras from the original design: Soul Storm kills split the bolt into 2 mini-bolts; Bone Crown gives minions within 6 m +30% damage and heals them 20% every 4 s.)*

---

## 8. Chapters and difficulty scaling

| # | Chapter | Palette | HP mult | Spawn mult | Modifier (Planned) | Recommended talents |
|---|---|---|---|---|---|---|
| 1 | Ashen Necropolis | Teal / ember | 1.00 | 1.00 | None (teaching chapter) | 0 |
| 2 | Ember Wastes | Orange | 1.90 | 1.15 | More Cinder Witches; burning ground | ~8 levels total |
| 3 | Frozen Ossuary | Ice blue | 3.20 | 1.30 | Ghoul packs of 6–8; ice patches | ~25 |
| 4 | Abyssal Cathedral | Violet | 5.00 | 1.45 | 2× Bloaters; tighter fog vignette | ~60 |
| 5 | Crimson Throne | Blood red | 7.50 | 1.60 | Extra elites | ~110 |
| ∞ | Endless Abyss (Planned) | Shifting | 7.50 (c = 5) | 1.60 | Time keeps scaling; Abyss Surge every 5:00 | Endgame |

In the build, chapters differ only in palette, HP mult, spawn mult and the chapter terms below; every chapter has the same 4 elites. Each chapter is exactly 6:00 plus the boss. Chapter N+1 unlocks when Gravemaw dies in Chapter N. *(Planned: Endless Abyss unlocks after the first Chapter 5 clear.)*

**Formulas** (c = chapter 1–5, m = minutes elapsed as a decimal):

- **Enemy HP** = BaseHP × chapter HP mult × (1 + 0.28m + 0.04m²)
- **Enemy damage** = BaseDamage × (1 + 0.1m) × (1 + 0.35(c−1)). Ch1 goes from ×1.00 to ×1.60 at 6:00; Ch5 from ×2.40 to ×3.84.
- **Spawn rate (enemies/s)** = (1.1 + 0.85m + 0.22m²) × chapter spawn mult, with a limit of 200 / 280 / 340 enemies alive at once (low / mid / high quality tier). Swarm rings and elites come on top and are not scaled by chapter.
- **Elite HP** = 6 × Enemy HP · **Boss HP** = 3,400 × chapter HP mult × (1 + 0.15(c−1))
- **The Shepherd's side:** minion damage ×(1 + 0.45(c−1)), minion HP ×(1 + 0.4(c−1)) and Nova damage ×(1 + 0.45(c−1)).

| Enemy HP multiplier | m=0 | m=1 | m=2 | m=3 | m=4 | m=5 | m=6 |
|---|---|---|---|---|---|---|---|
| Ch1 | 1.00 | 1.32 | 1.72 | 2.20 | 2.76 | 3.40 | 4.12 |
| Ch2 | 1.90 | 2.51 | 3.27 | 4.18 | 5.24 | 6.46 | 7.83 |
| Ch3 | 3.20 | 4.22 | 5.50 | 7.04 | 8.83 | 10.88 | 13.18 |
| Ch4 | 5.00 | 6.60 | 8.60 | 11.00 | 13.80 | 17.00 | 20.60 |
| Ch5 | 7.50 | 9.90 | 12.90 | 16.50 | 20.70 | 25.50 | 30.90 |

| Spawn rate (per s) | m=0 | m=3 | m=6 | Spawned in 6:00 (director + 198 in swarm rings + 4 elites) |
|---|---|---|---|---|
| Ch1 | 1.10 | 5.63 | 14.12 | ~2,466 |
| Ch3 | 1.43 | 7.32 | 18.36 | ~3,146 |
| Ch5 | 1.76 | 9.01 | 22.59 | ~3,825 |

These are upper bounds: when the alive limit is reached, the director skips spawns.

**Endless Abyss (Planned)** would use c = 5 with m unbounded. With the build's quadratic curves, minute 10 would mean ×58.5 HP and 50.6 spawns/s, far beyond the alive limit, so Endless needs its own flatter curve before it ships. Every 5:00 an *Abyss Surge* spawns a Gravemaw Echo (30% of Ch5 boss HP = 12,240). Ranking is by time survived, with kills as the tie-break.

---

## 9. In-run XP curve

**XP to next level** = floor(4 + 3.2L + 0.38L²), where L is the current level.

| Level L | 1 | 2 | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 |
|---|---|---|---|---|---|---|---|---|---|---|
| XP to next | 7 | 11 | 29 | 74 | 137 | 220 | 321 | 442 | 581 | 740 |
| Total XP to reach L | 0 | 7 | 57 | 283 | 771 | 1,613 | 2,906 | 4,745 | 7,225 | 10,439 |

A Chapter 1 clear produces about 2,000 kills at about 1 XP each, plus 132 XP from the 4 elites (12 + 48 + 24 + 48), for roughly 2,130 XP, which is **Lv22 at 6:00**. That is one level-up every 10–15 s in minute 1 and about every 20 s in minute 6. Brutes (4 XP), Witches and Bloaters (2 XP) make up 35–40% of spawns after 3:00, so a player who kills nearly everything can reach about Lv27. Shard XP values are fixed across chapters. Higher chapters level faster only because they spawn more enemies.

---

## 10. Run rewards

**Gold** = round( (0.9 × K + 2.2 × T + 400 × c × B) × (1 + G) × P + bonus )

K = total kills (player and minions), T = seconds survived including the boss fight (max 960), B = 1 if Gravemaw was killed, c = chapter, G = gold bonus (Greed talent + Grave Coin relic), P = 1.2 with an active Soul Pact, bonus = 150 per "Grave Gold" card. The rewarded-ad "double rewards" grants the run's gold and gems a second time. *(Planned: Blood Moon doubles the result as well, and the two stack.)*

| Example (G = 0) | Full clear (T = 7:00) | Death at 4:00 (no boss) |
|---|---|---|
| Ch1 (~2,000 / ~870 kills) | 3,124 | 1,311 |
| Ch3 (~2,550 / ~1,110 kills) | 4,419 | 1,527 |
| Ch5 (~3,100 / ~1,350 kills) | 5,714 | 1,743 |

- **Gems per run:** a clear gives 10 + 2c (12–20). A defeat gives 2 gems per full 2 minutes survived (4 at 4:00).
- **Pass XP per run** = round(20 + T/6 + K/40 + 40 × B): about 180 for a Ch1 clear and 82 for a death at 4:00. The same amount is added to account XP. Account level n → n+1 needs 80 + 40n XP, and every account level-up gives 20 gems.
- **First-clear bonus** (replaces the clear gems): 50 + 20c gems (Ch1 70 · Ch2 90 · Ch3 110 · Ch4 130 · Ch5 150) + 1 Altar Sigil.
- **Gravemaw's Hoard** (every boss kill): one relic of a random type. Ch1–2: Common 50 / Rare 50. Ch3–5: Epic 35 / Rare 32.5 / Common 32.5. Runs never drop Legendaries. *(Planned: odds shown on the results screen.)*

---

## 11. Heroes (Shepherds)

| Hero | Rarity | Base HP | Move (m/s) | Signature weapon | Passive | How to get |
|---|---|---|---|---|---|---|
| Vael, the Gravecaller | Common | 100 | 6.2 | Soul Bolt | +10% Raise Chance (pp) | Free (starter) |
| Nyx Hollowborn | Rare | 110 | 6.5 | Spectral Scythe | Minions +20% speed and damage | Starter Pack / Epic summon shards |
| Seraphine Ashveil | Epic | 95 | 6.4 | Ashen Chains | Soul Nova charges 30% faster | Epic and Legendary summon shards, Soul Pass S1 premium |
| Mordrake the Undying | Legendary | 130 | 6.0 | Bone Spears | Legion cap +25%; revive once per run at full HP | Legendary summon shards |

**Stars.** Unlocking takes 10 shards (1★). Star costs: 10 / 20 / 40 / 80 shards for 2★ / 3★ / 4★ / 5★ (160 shards from first shard to 5★). Each star above 1★ adds +12% damage and +8% HP, so 5★ = +48% damage, +32% HP.

**Shard sources:** an Epic Soul Altar roll gives 4 Seraphine or 6 Nyx shards (50/50). A Legendary roll gives 5 Mordrake or 6 Seraphine shards (50/50). The Soul Pass S1 premium track gives 25 Seraphine shards (10 at tier 10, 5 each at tiers 5, 15 and 25). Duplicate hero grants (for example, owning Nyx and then buying the Starter Pack) convert to 20 shards of that hero. *(Planned: in Endless Abyss, the top 10 of each Abyssal-league group earn 2 Mordrake shards per week.)*

---

## 12. Relics (gear)

Equip 3. There are 8 types and 4 rarities. Rarity multiplies the Common value (×1 / ×2 / ×3.5 / ×6). **Duplicates** (same type and same rarity) add +1 relic level. Each level adds +15% of that relic's stat. **Max level 10** (×2.35). New relics auto-equip into an empty slot. New accounts start with a Common Crown of Thorns and a Rare Lantern of the Lost equipped.

| Relic | Stat | Common | Rare | Epic | Legendary |
|---|---|---|---|---|---|
| Lantern of the Lost | Raise Chance | +3 pp | +6 pp | +10.5 pp | +18 pp |
| Crown of Thorns | Damage | +5% | +10% | +17.5% | +30% |
| Bone Idol | Legion cap (flat) | +3 | +6 | +10.5 (→ 11) | +18 |
| Ember Heart | Max HP (flat) | +10 | +20 | +35 | +60 |
| Wraith Boots | Move speed | +3% | +6% | +10.5% | +18% |
| Grave Coin | Gold | +6% | +12% | +21% | +36% |
| Hourglass of Ash | Attack speed | +3% | +6% | +10.5% | +18% |
| Abyss Eye | Nova charge | +5% | +10% | +17.5% | +30% |

---

## 13. Talents (gold sink)

Six talents with different max levels (125 levels in total). *(Planned: talent level cap = 10 + 6 × chapters cleared. This would tie power to progress and stop gold hoarders from skipping chapters.)*

**Cost** of the next level = round(150 × 1.32^L / 10) × 10, where L is the current level. That is 150 for level 1, 460 for level 5, 1,820 for level 10, 7,310 for level 15, 29,310 for level 20 and 117,450 for level 25. Maxing a 25-level talent costs 484,010 gold, a 20-level talent 120,410 and Swiftness 29,690. Maxing all six costs **1,358,940 gold**, about 2–3 months for an engaged player (4–6 runs a day).

| Talent | Per level | Max level | At max |
|---|---|---|---|
| Might | +4% damage | 25 | +100% |
| Vitality | +8 max HP | 25 | +200 HP |
| Necromancy (Raise Chance) | +1 pp | 20 | +20 pp |
| Dominion (Legion Cap) | +2 legion cap | 20 | +40 |
| Greed | +5% gold | 20 | +100% |
| Swiftness | +2% move speed | 15 | +30% |

---

## 14. Art direction: "Neon Gothic"

- **Camera:** top-down perspective with a 57° tilt and 45° FOV, portrait. About 12.5 m of world is visible across the screen, widening by up to 5 m as the legion grows (legion ÷ 50) and by 3.5 m during the boss. Slight look-ahead (0.22 s of movement, ~1.4 m) so gates and threats appear in front of the thumb, not under it.
- **Ground:** dark obsidian graveyard, glowing rune lines, fog vignette, heavy bloom. Value range is kept low (L* < 20) so emissives carry the image.
- **Colour law:** allies are always cool (#4ef2ff, #7cffd4), enemies are always warm (#ff4a2a, #ff8a3d), elites are gold (#ffd04a), bosses are magenta/violet (#ff3df0). Chapter tints change the environment only and never ally or enemy colours. *Build note: the legion, Nova and Soul Bolts take the hero's colour (Nyx #b36bff, Seraphine #ffb347, Mordrake #6dff9a), so Seraphine's amber legion breaks this law (§18).*

| Chapter | Environment key colour | Fog / rune accent | Note |
|---|---|---|---|
| 1 Ashen Necropolis | #0d1a1c obsidian | Teal runes, ember braziers | Reference palette |
| 2 Ember Wastes | #1a0e08 scorched | Orange #ff9a3c haze | Enemies get a brighter rim light to separate from the orange ground |
| 3 Frozen Ossuary | #0e141c frost | Pale ice #bfe6ff, desaturated | Kept low-saturation so cyan allies still pop |
| 4 Abyssal Cathedral | #120c1e | Violet #9b5cff stained glass | Boss magenta gets a white core to stay distinct |
| 5 Crimson Throne | #1a0608 | Blood red #c8102e | Enemy ember shifted to orange to avoid blending with red |

- **Readability:** strong silhouettes, an emissive core on every unit, additive particles, screen shake (scalable), 40–80 ms hit-stop on elite kills and the Nova wind-up. Enemy telegraphs are ground decals that fill from the edge inward.
- **Minions:** one instanced soul-wisp mesh with particle trails in the build. *(Planned: the same instanced meshes as their source enemy, cyan with a soft trail; at 300+ minions, trails switch to a shared ribbon per ring for performance.)*
- **UI:** obsidian panels with cyan rune trim. Premium currency and offers use gold. Display font is a gothic serif (e.g. Cinzel); body font is a clean sans (e.g. Inter). Numbers on gates and legion count are huge and outlined.

## 15. Audio direction

*Status: the build has separate menu, battle and boss music tracks and procedural SFX. The stem system below is Planned.*

- **Music:** dark synthwave with choir and pipe organ. **Stems are added as the legion grows** (25 / 100 / 200 / 300 minions): percussion, then bass, choir and lead. The player *hears* the army getting bigger. Boss tracks are separate, with a phase-3 key change.
- **SFX priorities** (voice limit 32): 1) player hit and telegraphs, 2) Nova, 3) gates, 4) level-up, 5) raises (pooled into a shimmering chord, at most 10 voices), 6) weapons, 7) enemy deaths (heavily pooled).
- **Signature sounds:** *Raise*, a rising glassy chime. *Gate*, a deep bell, pitched up for + and × and down for −. *Nova*, a 0.4 s inhale, then a sub-bass drop and a crackling chain that spreads in stereo with the ripple. *Gravemaw*, a low brass drone and a distinct slam warning cue 1.2 s before impact.
- **Mix:** music ducks −6 dB during Nova and boss telegraphs. Full playability with sound off: every audio cue has a visual twin.

---

## 16. UX and FTUE: the first 10 minutes

Goal: the player experiences all three hooks (raise, gate, Nova) and a boss kill inside 4 minutes, before any shop or currency screen.

**Status:** the build has no separate tutorial run. The first Chapter 1 run (5 energy) doubles as the tutorial and shows four one-time hints. Each hint appears once per profile.

| Trigger (build) | Hint |
|---|---|
| First run, 1.5 s in, the player has not moved yet | "Drag anywhere to move. Your Shepherd attacks automatically." |
| First minion raised | "Slain foes rise to fight for you. This is your LEGION!" |
| First Soul Gate pair (0:28) | "Walk through a Soul Gate to grow your legion!" (with the banner "SOUL GATES: Walk through one to reshape your legion") |
| Nova meter first reaches 100% (after ~140 kills, around 1:20) | "Soul Nova is ready! Tap NOVA to detonate your legion." |

The scripted beats below are **Planned**. Times are session times from app open (the planned tutorial run starts at 0:20). Where a beat uses run systems, the build's run time is given in brackets.

| Time | Beat | What the player does / sees | Telemetry event |
|---|---|---|---|
| 0:00 | Launch | Logo (2 s), loading in under 5 s on a mid-range device | `app_open` |
| 0:05 | Age gate (Planned) | Neutral birth-year wheel (no default age). Under-13 routes to restricted mode (see MONETIZATION §11). EEA/UK users see the consent dialog. | `age_gate_done` |
| 0:15 | Cold open (Planned) | 6 s in-engine shot: Vael rises among graves. "Raise the Legion." | `ftue_intro` |
| 0:20 | "The Waking" (Planned tutorial run, no energy cost) | Ghost thumb: "Drag anywhere to move." (Build: the move hint above, in a normal Ch1 run.) | `ftue_move` |
| 0:30 | First kill | Soul Bolt fires automatically. Husk dies. | `ftue_first_kill` |
| 0:35 | **Hook 1: Raise** | Planned: the first 5 kills raise at 100% (tutorial only). Caption: "The fallen rise for you." (Build: Vael's 35% Raise Chance usually raises one of the first 3 kills, and the raise hint fires.) | `ftue_first_raise` |
| 0:50 | First level-up | 3 cards. Planned: Raise Dead is highlighted, but any pick is allowed. (Build: the first level needs only 7 XP, so it comes ~0:08 into the run.) | `ftue_levelup` |
| 1:20 | **Hook 2: Soul Gate** | Legion is about 12. Planned scripted pair: +5 vs ×2. After passing, a short caption explains the maths ("×2 = +12!"). A wrong pick gets a gentle hint, not a punishment. (Build: the first pair arrives at 0:28 with the gate hint; at legion ~12 it is typically +20 vs ×2.) | `ftue_gate` (choice) |
| 1:45 | First elite | Gold Brute (Planned script). It drops a Relic Chest → free pick. (Build: an Elite Husk at 1:15; the chest card is applied automatically.) | `ftue_elite` |
| 2:15 | **Hook 3: Soul Nova** | Planned: the meter is accelerated in the tutorial, and a pulsing ring and finger point at NOVA. Screen wipe, slow-mo, legion count drops to 0 and starts climbing again. (Build: the meter fills after ~140 kills, around 1:20, and the Nova hint fires; 0.55 s slow-mo.) | `ftue_nova` |
| 2:40 | Second gate | ×2 vs ÷2, where ×2 sits behind a Bloater (Planned placement). Teaches risk. (Build: pairs at 1:08, 1:48 and 2:28 can offer ×2 vs −N or ÷2.) | `ftue_gate2` |
| 3:00 | Gravemaw (Planned tutorial boss) | 25% HP, Phase 1 only. Telegraph rings are shown slowly. (Build: Gravemaw arrives at 6:00 with full Ch1 HP, 3,400.) | `ftue_boss` |
| 3:45 | Victory | Results: time, kills, peak legion, raised, level, gates and rewards (a Ch1 first clear gives ~3,100 gold, 70 gems, 1 sigil and a relic). Planned line: "Your legion peaked at N." | `ftue_complete` |
| 4:00 | Home screen | Planned: only **Play** and **Talents** are lit; other tabs show locked silhouettes. (Build: every tab is open.) | `home_first` |
| 4:15 | First talent | Buy Might Lv1 (150 gold; new accounts start with 1,500 gold). Planned: guided. The gold sink is learned. | `talent_first` |
| 4:30 | Chapter 1 | Energy explained in one line (5 per run, refills over time). Planned: the first death in Chapter 1 gets a free revive with no ad. | `run_start` |
| 4:30–11:30 | First real run | Full 6:00 + boss. Most new players reach 3:30–5:30 on the first try. | `run_end` |
| After run 1 | Unlocks (Planned) | Soul Altar unlocks with a **gift relic** (a labelled gift, not a fake summon; the FTUE never stages an Altar result). Daily quests unlock. (Build: the Altar and quests are open from the start, with 150 gems and 1 sigil.) | `altar_unlock` |

**Later gates (Planned):** the 7-day login appears at the start of session 2. The Starter Pack is first shown after the player's first Chapter 1 boss kill, and never during the tutorial. Its 48 h timer starts at first display and is real. Rewarded-ad placements first appear in run 2. On iOS the ATT prompt is preceded by a one-screen explanation and shown before the first ad, never at cold start. *(Build: the login calendar and rewarded ads are available from the first session, and the Starter Pack's 48 h timer starts at account creation.)*

---

## 17. Accessibility

*Status: Planned. The build has music and SFX volume, mute, a haptics toggle and a quality setting (auto / low / mid / high).*

| Area | Feature |
|---|---|
| Vision | Colourblind modes (protan / deutan / tritan) that remap enemy warm colours while keeping shape cues. Elites always carry a crown marker; Bloaters always show a pulsing ring. **High-contrast outlines** toggle. UI text scale 90–150%. |
| Photosensitivity | **Reduce flashes**: Nova and boss flashes capped at 3 Hz with luminance limits, bloom reduced. Screen shake slider (0–100%). Hit-stop toggle. |
| Motor | One-thumb by design. Left-handed mode mirrors the NOVA button. Adjustable joystick size and dead zone. **Auto-Nova** option (fires at 100% when legion ≥ 50). Pause anywhere. No timing-critical taps outside movement. |
| Hearing | Every audio cue has a visual twin. Subtitles for all VO. Separate volume sliders for music, SFX and UI. |
| Cognitive | Gate maths preview toggle ("shows result: 37 → 74"). Telegraphs are never under 1.0 s (the build's Bloater fuse is 0.85 s, §18). A tutorial replay and a short skills glossary in pause. |
| Performance comfort | 30 / 60 fps choice, battery saver mode, reduced-particles mode. |

---

## 18. Open design questions (to resolve in alpha)

1. The build's Raise Chance cap is 85% (base 25%). Is that too high for Chapter 5 challenge? Test 60% vs 85%.
2. Overflow minions above the cap persist in the build. Should they fade (the original design) or persist until the next Nova?
3. Both evolutions shipped in the build. Does a third recipe ship in Season 2?
4. Auto-Nova (Planned) could reduce the skill expression of Nova timing. Monitor Nova-timing win rates for players who use it.
5. Boss HP: Gravemaw is 3,400 × chapter scaling in the build, down from the 40,000 design. Measure time-to-kill against the 60–100 s target.
6. Soul Pass pacing: quest and run pass XP let a daily player finish 30 tiers in about 5 days. Cut pass XP or raise XP per tier to fit the 28-day season.
7. Nova frequency: a full charge every 140 kills allows ~14 Novas per Chapter 1 clear, versus the earlier target of ~3. Decide whether the meter should be slower.
8. Rule breaks to fix in code: the Bloater fuse (0.85 s) is under the 1.0 s telegraph floor, and the hero-coloured legion breaks the colour law for Seraphine (§14).
