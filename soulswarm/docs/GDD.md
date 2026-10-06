# SOULSWARM: Game Design Document

**Tagline:** *Raise the Legion.*
**Status:** v1.2, synced to the playable HTML5/Three.js prototype after the gameplay update (Oct 2026)
**Owner:** Lead Game Designer / PM
**Source of truth:** the code. Gameplay and economy numbers live in `src/game/data.js`, `run.js`, `skills.js`, `boss.js`, `gates.js` and `src/meta/economy.js`. This document and `DESIGN_BRIEF.md` mirror them; if they disagree, the code wins and the docs get fixed. Numbers marked *(tuning)* are starting values for balancing and are expected to move during soft launch.

---

## 0. Implementation status

The prototype in `src/` is a playable browser build (Three.js, with Capacitor shells for iOS and Android). Purchases and rewarded ads are **simulated** by `src/meta/store.js`, and the profile is saved on the device (localStorage).

| Area | Playable in the current build | Planned (not in the build) |
|---|---|---|
| Run | Floating joystick (plus WASD), auto-firing weapons, Raise Chance minions in 5 variants plus Champions (§4.2), legion up to 400 with the overflow fade (§4.3), Soul Gates (+N / ×2 / ×3 / −N / ÷2), Soul Nova with its wind-up (§4.4), kill streaks and Soul Frenzy (§4.7), hit-stop, the level-up pulse, swarm rings, Ghoul packs, Brute slams, Witch lobs, chapter modifiers and hazards (§5, §8), 4 elites (8 in Ch5) with 1-of-3 Relic Chests and elite affixes (Warded, Splitter, Vampiric, Hasted, Commander; §5.1), mid-run events (Soul Thief, Shrine of Souls with 60 s blessings, Cursed Coffin; §4.8), gate guards and soul bursts, Gravemaw (sealed arena, three phases, ring slams, gap rings, spiral, Hollow Dirge; §6), level-up cards with 1 ad reroll, 6 weapon evolutions, revive (ad or 60 gems; Mordrake gets 1 free), **Hero Rites**: one signature active ability per hero on its own RITE button (§11.1), five first-run hints and two scripted first-run beats (§16), accessibility settings (§17) | Full scripted tutorial run, adaptive music stems (§15), the remaining accessibility options (§17) |
| Content | 5 chapters plus Endless Abyss, **Nightmare and Torment difficulties** for every chapter (§8.2), 5 enemy types plus elites, 6 weapons, 8 passives, 6 evolutions, 5 heroes (1★–5★) each with a Rite, 8 relic types × 4 rarities, 6 talents | Endless leaderboards, new heroes (`LIVEOPS.md`) |
| Meta and economy | Soul Altar (disclosed odds, 60-pull pity, 10-pull Epic guarantee, free daily summon), Soul Pass Season I (30 tiers), 6 rotating daily quests, 7-day login, the Daily Trial (§8.1), energy, all 9 SKUs (simulated), gem shop, Soul Pact, Starter Pack, daily free chest, rewarded-ad placements, account level | Talent level cap by chapters cleared, quest all-clear bonus, weekly quest chest, pass catch-up tiers, Pact grace days, daily ad caps, Relic Ascension, server-side economy and cloud save (`PRODUCTION_ROADMAP.md`) |
| Live ops and social | Blood Moon weekends, weekly quest chest | Boss Rush, holiday events, leaderboards and leagues, Covens (clans), Legion Raids, share card and replay clips |

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
| Meta | Days to months | Get strong enough for the next chapter, then for Nightmare and Torment | Talents, relics, heroes and stars, Soul Altar | Power, new chapters, Nightmare and Torment clears (§8.2), Endless Abyss depth record |
| Daily | 15–40 min/day | Finish quests, spend energy, beat the Daily Trial | 6 daily quests, 7-day login calendar, the Daily Trial (§8.1), rewarded ads, energy | Gems, gold, sigils, pass XP |
| Weekly | 7 days | Farm Blood Moon, fill the weekly chest (Planned: climb the leaderboard) | Blood Moon weekend, weekly quest chest (Planned: Endless Abyss weekly board) | Sigils, gems (Planned: league rewards) |
| Seasonal | 28 days | Finish the Soul Pass, collect the new hero | Soul Pass (30 tiers); Planned: monthly Boss Rush, new hero every 1–2 seasons | Skins, Epic/Legendary relics, hero shards |

**Moment-to-moment.** Move → weapons fire automatically at the nearest threat → an enemy dies → it drops a soul shard and has a *Raise Chance* to rise as a cyan minion → minions orbit you and hunt nearby enemies → more kills → more shards and more minions. The player's only job is positioning: kite, collect, pick gates, avoid telegraphs.

**Run.** 0:00–6:00 survival with rising density, 9 Soul Gate pairs (0:28, then every 40 s), 6 swarm rings, 4 elites (1:15, 2:30, 3:45, 4:50) each with an affix (§5.1), about 3 optional mid-run events (§4.8) and roughly 21 level-ups (about Lv22, §9), then Gravemaw at 6:00. A full clear is 6:00 plus the boss fight. A failed run usually ends between 2:30 and 5:00.

**Daily.** Energy regenerates (+1 every 6 min, 30 max = 6 runs per full bar, 3 hours from empty to full). Quests are designed to be finished in 2–3 runs and reset at local midnight. Daily quests rotate: "Finish 2 runs" every day plus 5 drawn by date from a pool of 13: Slay 500 enemies · Raise 150 souls · Survive 4 minutes (in one run) · Unleash Soul Nova 3× · Pass 3 Soul Gates · Open 2 Relic Chests · Slay 3 elites · Lead a legion of 100, and after the first Chapter 1 clear (which also opens Nightmare on Chapter 1) also Evolve a weapon · Defeat Gravemaw · Clear the Daily Trial · Clear a chapter on Nightmare · Slay 5 elites on Nightmare (Torment counts for both). Rewards belong to the 5 slots (in order: 20 gems · 1,500 gold · 15 gems · 1,200 gold · 1 sigil, each with pass XP), so the daily value never changes.

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

**Weekly.** **Blood Moon** runs every weekend (Fri 00:00 – Sun 23:59 UTC) in the campaign and Endless (not the Daily Trial), on top of any difficulty (§8.2): 8 elites per run instead of 4 (at 45, 75, 110, 150, 185, 225, 255, 290 s; Endless elites twice as often), so 8 Relic Chests, and **double run gold and gems** (pass XP unchanged, to protect Soul Pass pacing). The ground, runes and sky turn blood red, a "BLOOD MOON" banner opens each run, the home screen shows a ribbon with the time left, and the results screen a "Blood Moon ×2" badge. The **weekly quest chest** (claim 25 daily quests between Monday and Sunday, local time) gives 1 Altar Sigil, 50 gems and 100 pass XP; it sits at the top of the quests panel. *(Planned: Endless Abyss leaderboards reset Monday 00:00 UTC.)*

**Seasonal.** A Soul Pass season lasts 28 days with 30 tiers × 500 pass XP = 15,000 XP. Daily quests give 220 pass XP and a run gives about 80–210 (§10; ×1.5 on Nightmare, ×2 on Torment), so a player who does all quests and about 3 runs a day earns about 700 pass XP per day and reaches tier 30 in about 3 weeks (an endgame player on Torment in about 12 days). A casual player (quests plus 1 run a day) reaches roughly tier 15–20 by the end of the season.

---

## 3. Controls

| Input | Behaviour | Notes |
|---|---|---|
| **Floating joystick** | Touch anywhere on the battlefield to spawn the stick base at your thumb. Drag to move. Release to stop. WASD / arrow keys on desktop. | Radius 58 px. Dead zone 12% of the radius (~7 px), then analog speed rises linearly to 100% at full deflection. The base follows the thumb if it is dragged beyond 1.6× radius ("leash"). |
| **Auto-attack** | All weapons fire on their own cooldowns. | Soul Bolt targets the nearest enemies within 11.5 m, Ashen Chains the nearest within 7.5 m, Bone Spears aim at the nearest within 13 m (or straight ahead). The Scythe sweeps a full circle starting from the facing direction; Grave Pulse and Skull Halo hit around the player. A weapon with no target retries after 0.12 s. *(Planned: elites and Bloaters within 3 m get priority.)* |
| **NOVA button** | 88 px circle in the bottom-right (Space on desktop). Works at 100% charge with any legion size. | Pulses when ready. A tap commits at once (invulnerability, enemy shots cleared), then a 0.25 s wind-up before the blast, which lands with a hit-stop and 0.55 s of slow motion (§4.4). A touch on the button never starts the joystick. *(Planned: disabled below 10 minions, left-handed mirror.)* |
| **RITE button** | 64 px circle above-left of NOVA, in the hero's colour, with the Rite's icon and short name (Shift or E on desktop). Mirrored with NOVA in left-handed mode. | The hero's signature active ability (§11.1). Ready from the start of every run. A radial ring refills over the cooldown with a seconds counter; the button pulses and chimes when ready and glows while the Rite is working. Like NOVA, it fires on touch-down and never starts the joystick. |
| **Pause** | Top-left, 36 px. Also auto-pauses when the app goes to the background. | The pause screen shows time, kills, legion size and the current build, plus a sound toggle and "Abandon run". *(Planned: Nova charge on the pause screen.)* |
| **Level-up / chest cards** | 3 large cards. Tap to pick. Gameplay is paused. | Taps in the first 0.3 s are ignored (no accidental picks from a swipe). After a pick the Shepherd gets 0.6 s of invulnerability. A Relic Chest uses the same three cards under a gold "Relic Chest" header; chests are offered before queued level-ups. |
| **Haptics** | Success on level-up, Relic Chest and a good gate; warning on a bad gate and the boss warning; medium when hit, on the Nova tap and on a CARNAGE or MASSACRE streak tier; heavy on the Nova blast, ANNIHILATION and higher tiers, boss slam, death and boss kill. | Toggle in settings. *(Planned: a light tick on raise, throttled to 10/s.)* |

There are no other in-run buttons beyond NOVA and RITE. The reroll (1 per run, through an optional rewarded ad, free with Soul Pact) sits inside the level-up screen.

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

- **Raise Chance** is in percentage points (pp). Base 25%. Sources: Vael +10 pp, the Raise Dead skill (+6 pp per level), the Necromancy talent (+1 pp per level), the Lantern of the Lost relic (+3 to +18 pp, more with relic levels). **Hard cap 85%.** Raise Chance is halved while a Soul Nova is detonating, except for kills by Seraphine's own Nova (×2 instead). During Vael's **Grave Call** (§11.1) every kill rises (100%).
- Every kill rolls Raise Chance, whether the Shepherd, a minion, the Nova or a Bloater blast made the kill. Elites can be raised. The Bloater that explodes does not rise, and Gravemaw cannot be raised (killing him adds 30 minions instead).
- **Legion cap:** base 30. Flat bonuses: the Legion Cap skill (+10 per level, +50 at Lv5), the Dominion talent (+2 per level, +40 at L20), the Bone Idol relic (+3 to +18, up to +42 at Legendary Lv10). Mordrake multiplies the total by 1.25, then it is rounded. **Technical hard ceiling: 400 minions** on every device, for performance and leaderboard fairness.
- Kills only roll while the legion is below the cap. A successful roll **at** the cap heals the weakest minion by 50% of its max HP instead.
- **Overflow:** gates (and Gravemaw's death) can push the legion above the cap, up to 400. The excess does not stay forever: after a grace period it dissolves gently (§4.3), so a big gate is something to spend, ideally on a Nova.
- **Soul Frenzy** (§4.7) shortens every minion's attack interval while it runs (+10% to +50% attack speed by tier).
- **Minion variants:** every kill rises as **its own kind**, recoloured in the hero's legion colour. Base stats (Level = the Shepherd's in-run level, c = chapter):

| Stat | Base value |
|---|---|
| HP | 34 × (1 + 0.08(level − 1)) × (1 + 0.4(c − 1)) |
| Damage per hit | 7 × hero damage multiplier (stars, Might talent, Crown of Thorns) × Nyx 1.2 × (1 + 0.2 × Minion Fury level) × (1 + 0.04(level − 1)) × (1 + 0.45(c − 1)), ±15% per hit. The in-run Might skill does not apply. No crits. |
| Speed | 9.5 m/s (Nyx +20%); 15% faster while returning to formation |
| Damage taken | Each melee hit costs the minion 30% of its target's contact damage (50% against Gravemaw). Boss slams kill every minion in the slam radius. Bloater blasts deal 60. |

| Raised from | Minion | HP | Damage | Attack | Speed | Special |
|---|---|---|---|---|---|---|
| Husk (and gate / boss souls) | **Shade** (the soul wisp) | ×1 | ×1 | 0.5 s | ×1 | — |
| Ghoul | **Wisp Runner** | ×0.55 | ×0.75 | 0.32 s | ×1.3 | Hunts 3 m farther out |
| Brute | **Bulwark** | ×3 | ×1.0 | 1.1 s | ×0.7 | **Taunts**: enemies within 3 m attack it instead of the Shepherd (Bloaters ignore taunts). A bodyguard: it guards a 2.3 m ring and only fights foes within 5 m of the Shepherd |
| Cinder Witch | **Soul Witch** | ×0.8 | ×1.1 per orb | 1.1 s | ×0.9 | Ranged: a homing soul orb (12 m/s) at targets within 6 m, holding 4 m away |
| Bloater | **Soul Bomb** | ×0.7 | 6 × minion damage in 2.4 m, once | — | ×1.15 | Dives into the densest cluster within 8 m (3+ foes; any after 5 s idle; elites and Gravemaw weigh double), flashes 0.25 s, detonates and leaves the legion. Its kills roll raises |
| Any elite | **Champion** of its kind | ×3 more | ×2 more | — | — | ×1.35 size, gold rim and crown spark |

- **AI:** idle minions orbit the player in up to 5 rings of 12 (radii 1.7 / 2.45 / 3.2 / 3.95 / 4.7 m, alternating direction). Every 0.25–0.45 s an idle minion looks for the nearest enemy within 6.5 m of itself that is inside the 9 m leash around the player. It drops the target when it dies or moves more than 12 m from the player. At most 24 minions engage Gravemaw at once; the rest fight adds or orbit.

### 4.3 Soul Gates

- A pair spawns every **40 s** from 0:28 to 5:48 (9 per chapter, none during the boss). They appear 10.5 m ahead along the player's movement direction (straight up-screen if standing still), side by side (each 3.4 m wide, 0.9 m apart), rise in 0.6 s and last 15 s.
- **The numbers are always the truth.** The values shown are exactly what happens. There are no hidden modifiers, and ×N is applied to the legion size at the moment you walk through. The only limit is the 400 ceiling.
- The gate choice is a maths-and-risk puzzle. From 2:00, 60% of pairs plant a guard 3.4 m in front of the gate with the bigger payoff (the larger legion change at that moment): a Brute with 3 Husks, or from 4:00 a 50/50 between that squad and a cluster of 3 Bloaters. Guards use the run's normal HP and damage scaling. Scripted pairs are never guarded.
- **Overflow:** gate results can push the legion above the cap (up to the 400 ceiling). Kills stop raising until the legion is back under the cap, and the excess **fades**:
  - **Grace:** nothing fades for the first 15 s over the cap. Every gate that adds souls restarts the grace, so a ×2 always gets its full window.
  - **Fade:** then 2% of the excess dissolves per second (at least 0.4 per second), newest souls first. Champions and Soul Bombs that are already diving are spared.
  - **Example:** ×2 at 100 with a cap of 60 makes 200 (140 over). After the grace, about 130 are still over at 20 s, 105 at 30 s and 70 at 50 s. The last of the excess is gone about 160 s after the gate, unless a Nova spends it first.
  - **Visual:** a fading soul stops fighting, rises, sheds wisps and shrinks away over 1.2 s, with no damage. The legion counter's cap turns gold while the legion is over it.
  - The fade never takes the legion below the cap. Numbers are in `OVERFLOW` (`data.js`).
- **Negative gates:** −N removes N minions (all of them if the legion is smaller) and ÷2 removes half, rounded down. The lost souls **detonate** at half Nova power, rippling outward from the gate over min(0.6, 0.12 + 0.003n) s: each blast deals 0.5 × (35 + 0.5L) × Damage multiplier × (1 + 0.45(c − 1)) in 2.6 m, where L is the legion size before the gate. This makes ÷2 an emergency escape when the horde closes in.

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

- **Charge meter:** each kill (any source) adds 1/300 of a full charge, times the Nova charge multiplier (Seraphine +30%, Abyss Eye relic +5% to +30%, more with relic levels). An elite kill counts as 6 kills and passing a Soul Gate (good or bad) as 3. The top kill-streak tiers add 15 / 30 / 45 (§4.7), and Seraphine's Ashfall adds 15% of a full charge (§11.1). Kills during a detonation (wind-up included) add nothing; a streak tier reached mid-detonation is banked and paid when the chain ends. A full charge takes 300 kills (≈231 for Seraphine), so a Chapter 1 clear (~2,000–2,500 kills) gives roughly 6–7 Novas.
- **Activation:** tap NOVA at 100%.
  - **On the tap:** the legion is committed (the count drops to 0), all enemy projectiles clear, and the Shepherd becomes invulnerable for 1.75 s (the 0.25 s wind-up plus the old 1.5 s).
  - **Wind-up (0.25 s):** every soul flares where it stands and streams light into the Shepherd, with a rising inhale.
  - **Release:** his own blast fires with an 80 ms hit-stop, a flash, 0.55 s of slow motion (30% speed) and the big "N SOULS" number. Shots fired during the wind-up are cleared again.
  - **Chain:** every soul then detonates in a chain that ripples outward from the player over min(0.75, 0.15 + 0.003N) s.
- **Damage per detonation** = (35 + 0.5 × N) × Damage multiplier × (1 + 0.45(c − 1)), radius 2.6 m, where N = legion size when NOVA was pressed and the Damage multiplier includes stars, the Might talent and skill, and Crown of Thorns. The Shepherd's own blast deals 1.2× that damage in a 7 m radius, with knockback. At N = 300, each blast deals 185 base damage, 300 times, overlapping.
- **Cost:** the legion drops to 0, and Raise Chance is halved until the chain finishes, so the rebuild starts a beat later. Seraphine is the exception: foes her Nova kills rise at ×2, so her detonations restock the legion.
- **Bosses** take 50% damage from Nova, capped at 25% of their max HP per Nova (§6).

### 4.5 Pickups

| Pickup | Source | Effect |
|---|---|---|
| Soul shard (XP) | Every kill | XP equal to the enemy's XP value (×12 for elites). At most 420 shards on the map; past ~416, new shards merge into the nearest shard within 3 m. Shards left 48 m behind are lost. |
| Heart | 0.6% per non-elite kill | Heals 30% of max HP |
| Magnet | 0.3% per non-elite kill | Pulls every shard on the map |
| Relic Chest | Every elite (not a Cursed Coffin's mini-elite), and a cleared Cursed Coffin (§4.8) | Choose 1 of 3 cards, drawn like a level-up (an eligible evolution is almost always offered). Uses the run's single ad reroll if it is still unspent. |

Pickup radius is 2.8 m (Soul Magnet +30% per level). Hearts, magnets and chests are pulled in at 80% of that radius and vanish after 40 s.

### 4.6 Level-ups and loadout

- **Level-up pulse:** when the cards appear, a soul ring sweeps out from the Shepherd and every soul shard within 6 m flies to him once a card is picked (often worth a little more XP). Relic Chests don't pulse.
- Choose 1 of 3 cards per level. **Loadout: 4 weapons (the hero's signature weapon is slot 1, at Lv1), plus any of the 8 passives** (there is no passive slot limit). Max skill level is 5.
- **Card weighting:** every skill below Lv5 is in the pool (new weapons only while a weapon slot is free). Base weight 1.0 for a new skill and 1.5 for an upgrade; ×1.3 for Raise Dead, Legion Cap and Minion Fury; ×1.5 for a new weapon while fewer than 2 are owned; an eligible evolution has weight 1,000. The 3 cards are drawn without repeats.
- Maxing everything takes 63 picks (19 weapon upgrades, 40 passive levels, 4 evolutions, one per owned weapon). With 4 Relic Chests per run that is about 59 level-ups (player Lv60). A Chapter 1 clear reaches about Lv22, so builds involve real trade-offs.
- When nothing is left to upgrade, the cards are "Second Wind" (heal 50% HP) and "Grave Gold" (+150 gold this run).
- 1 reroll per run, through an optional rewarded ad. No other ads inside a run except the revive offer on death.
- **Revive:** one paid revive per run (rewarded ad or 60 gems), offered for 10 s on the death screen. It restores full HP, gives 2.5 s of invulnerability and blasts every enemy within 8 m for 50% of its max HP. Mordrake's free revive triggers automatically on his first death and does not use up the paid one.

### 4.7 Kill streaks and Soul Frenzy

The legion and the Nova kill in bursts; the streak turns those bursts into a visible, rewarded rhythm. Code: `src/game/streak.js` (rules), `src/ui/streakui.js` (HUD); numbers in `STREAK` (`data.js`).

- **Chaining.** Every kill counts, whoever makes it: the Shepherd, minions, Soul Bombs, the Nova, gate bursts, Bloater blasts. A kill extends the streak if it lands within the **window** of the previous one.
  - The window is 1.2 s for a fresh streak and tightens as the streak grows: 1.2 / (1 + n / 120) s, never under 0.3 s. That is 0.96 s at 30, 0.74 s at 75, 0.53 s at 150, 0.34 s at 300 and 0.3 s from about 360.
  - A fixed window does not work: from minute 3 the horde dies faster than one kill a second, so every streak would run unbroken to the top tier.
  - The window runs on game time, so slow motion, hit-stop and the level-up screen never break a streak.
- **Tiers.** Each tier starts an **8 s Soul Frenzy** at that tier. A higher tier restarts it; a lower tier from a new streak never downgrades or extends a stronger Frenzy that is still running. The Frenzy outlives the streak that earned it. *(Soul Frenzy is the streak buff; the passive skill called Frenzy (§7.2) is unrelated.)*

| Tier | Kills | XP gain | Minion attack speed | Soul Nova charge |
|---|---|---|---|---|
| CARNAGE | 30 | +10% | +10% | — |
| MASSACRE | 75 | +15% | +20% | — |
| ANNIHILATION | 150 | +20% | +30% | +15 kills (5%) |
| SOUL HARVEST | 300 | +25% | +40% | +30 kills (10%) |
| APOCALYPSE | 500 | +30% | +50% | +45 kills (15%) |

- **Nova charge** follows the existing rule that nothing charges mid-detonation. A tier reached during a Nova chain (the usual place for tier 3+) is banked and paid out the moment the chain ends.
- **Tuning.** The window and thresholds were tuned on kill traces from bot runs (Chapters 1, 2 and 4). Over a full 6:00 run, ordinary fighting reaches CARNAGE about 10 times, MASSACRE about 5 times and, late in the run, ANNIHILATION about twice. Most Novas land ANNIHILATION, and the biggest (300+ kills) land SOUL HARVEST. APOCALYPSE needs a near-full legion detonated into a dense horde.
- **HUD** (at the HUD's 20 Hz, never per kill):
  - **Counter:** a counter at the left edge, a third of the way down, appears from 10 kills. It grows with each tier, pulses as kills land, and shifts colour per tier: pale soul, then cyan, gold, ember, blood and violet-white.
  - **Decay bar:** under the number, it shows the time left in the window.
  - **On a break:** the final count greys and fades out.
  - **Frenzy chip:** shows the Frenzy tier and its remaining time.
- **Tier call:** the tier name in large slanted Cinzel slides out beside the counter for 1.8 s, with a line saying what the Frenzy grants.
  - It sits in the band between the banners (24%) and the Shepherd and Nova number (50%), so it never covers either.
  - The stinger (a stone thump, a D-minor brass stab and a bell) rises 0, 3, 5, 7 and 12 semitones by tier; APOCALYPSE adds the choir.
  - Haptics: medium for tiers 1–2, heavy for 3+.
  - Tiers crossed in one burst collapse into one call and one stinger.
- **Records.** The run's best streak goes into `run.counters.bestStreak` and the run result (`bestStreak`). It is shown on the results screen with its tier and the profile record ("New record" when beaten). The record is kept in `profile.stats.bestStreak`; older saves load with 0.
- **Balance.** Measured with the balance bot, seeded so every arm plays the same 16 seeds (Vael, Chapters 2 and 4, 8 seeds each). The whole package is the streaks, the Nova wind-up, hit-stop, the overflow fade and the level-up pulse.

| Build | Ch2 | Ch4 | Average survival |
|---|---|---|---|
| Before this change (the previous build) | 257 s | 267 s | 262 s |
| All of it switched off in data | 235 s | 294 s | 264 s (+1%) |
| Soul Frenzy only | 263 s | 279 s | 271 s (+3%) |
| Everything except the overflow fade | 259 s | 333 s | 296 s (+13%) |
| **Everything (the build)** | 263 s | 310 s | **287 s (+9.6%)** |

The spread between runs is large (±60 s), so each average is good to about ±5%:

- **Switched off:** matches the previous build on average. Single seeds differ because the new code draws random numbers in a different order.
- **Soul Frenzy:** worth a couple of percent (+2.3% against the switched-off arm), well inside the +10% budget.
- **Overflow fade:** costs about 3%.
- **Level-up shard vacuum:** most of the rest. It helps the fleeing bot more than a player who walks over shards. If human playtests find the chapters easier, `LEVEL_PULSE.vacuum` is the first lever to pull.

**Hit-stop.** A brief freeze sells the big hits: 75 ms on an elite kill, 90 ms on a Gravemaw phase change, 65 ms on a ×2 or ×3 gate, and 80 ms when the Nova blast fires.
- The game slows to 4% speed, easing back over the last third.
- It multiplies any slow motion that is running instead of replacing it.
- Real-time timers keep running: the HUD, banners, the death and victory beats, and the streak's fade-out.
- It is a motion effect, so it scales with the screen-shake slider; at 0% there is no hit-stop (§17).

### 4.8 Run events

Optional side objectives that add a decision between the scripted beats. Numbers live in `RUN_EVENTS` and `BLESSINGS` (`data.js`); the logic is in `events.js`.

- **Schedule:** one event at a time. The first comes at 1:02–1:20, then one every 80–110 s, only between 1:00 and 5:20, so a campaign run sees about 3 (measured: 1:23, 2:55 and 4:16 in one Chapter 1 run). Endless keeps rolling them, waiting 25 s after each Gravemaw kill.
- **Spacing:** never within 8 s of a gate pair or an elite, 5 s of a swarm ring, or 40 s of Gravemaw's arrival, and never during his fight. If Gravemaw arrives anyway, the event lapses quietly (a pending coffin reward pays out at once). A first run gets none before 2:30.
- **Placement:** 12 m from the Shepherd, ahead of him when possible. The spot must be at least 2.6 m clear of ember vents, ice patches, burning ground, a pending abyssal grab and a standing gate pair. With no clear spot, it retries 2 s later.
- **Presentation:** a banner announces each event. While it is off screen, an arrow on the screen edge (kept clear of the HUD) points at it, with its distance. Each event is optional: ignored, it lapses.
- **Counters:** `counters.events` counts events completed (thief slain, blessing taken, coffin cleared), and the run result carries it as `events`.

| Event | What happens | Reward | If ignored |
|---|---|---|---|
| **Soul Thief** | A glinting imp with a glowing sack. It rummages for 1.2 s, or until the Shepherd comes within 8 m, then flees at 5.0 m/s, jinking as it runs: faster than Husks (2.4) and Ghouls (4.4), slower than the Shepherd (6.2). Beyond 15 m it dawdles at 55% speed. It has 125 × the run's HP multiplier, takes hits from every weapon and minion, and never attacks. | +100 + 40 × chapter bonus gold (Ch1 140) and a burst of 10 soul shards worth one full level of XP. It never rises. | It escapes after 18 s (or past 40 m): "IT GOT AWAY". |
| **Shrine of Souls** | A glowing 1.9 m rune circle with a floating soul crystal. Standing inside fills a gold progress ring over 2.5 s (it drains at 1.5× when you step out). Then gameplay pauses, like a level-up, on a pick of 3 blessings (no reroll). | A 60 s blessing, shown as a HUD chip with a timer: **Soul Feast** ×2 XP · **Legion Wrath** minions +50% damage · **Wraith Stride** +30% move speed · **Soul Tide** every shard, heart, magnet and chest flies to you · **Open Graves** +20 pp Raise Chance (85% cap). Blessings already active are not offered; they survive level-ups. | It fades after 28 s. |
| **Cursed Coffin** | An upright, chained coffin on a crimson rune circle. Any damage counts (weapons, minions, Bloater blasts); it has 150 × the run's HP multiplier and never moves. Breaking it releases a wave of 20 foes from the current spawn mix, in a ring 2.2–4.6 m around it, plus one mini-elite: an elite with half an elite's HP, 85% of its size and 1 affix, which carries no chest. | When the wave is cleared, or after 20 s, a Relic Chest rises from the coffin and flies to the Shepherd (the normal chest pick). | It sinks after 30 s. |

---

## 5. Enemy roster

Base values are for Chapter 1 at minute 0. Scaling is in §8. Each enemy deals its contact damage at most once per 0.8 s, and the Shepherd is invulnerable for 0.5 s after any hit. Enemies more than 42 m from the player despawn.

| Enemy | Role | Base HP | Speed (m/s) | Damage | XP | Behaviour | Counterplay |
|---|---|---|---|---|---|---|---|
| **Husk** | Basic chaser | 14 | 2.4 | 6 per touch | 1 | Walks straight at the player with flocking separation and a slight weave. Spawns just off-screen and in swarm rings. 40–100% of the horde. | Anything works. Husks are raise fodder. |
| **Ghoul** | Runner | 8 | 4.4 | 5 per touch | 1 | Spawns in **packs of 4–6** (Ch3: 6–8) from one point, usually ahead of the Shepherd; members fan out 1.8 m apart and flank at their own angle within ±30° (full swing beyond 6.5 m, none at 3 m). Within 3 m: a 0.4 s crouch (squash and flash), aimed 0.4 s ahead, then a **lunge** at 11 m/s for 0.3 s, 0.6 s recovery at 35% speed, then 1.5 s before it can lunge again. Ghoul share of the horde is unchanged (packs bank the director's picks). Every 3rd swarm-ring enemy after 2:00 is a single Ghoul. | Keep moving; sidestep the lunge. Skull Halo and Grave Pulse shred packs. |
| **Brute** | Tank | 75 | 1.7 | 18 per touch | 4 | Mass 5: shrugs off most knockback and shoves smaller enemies aside. Within 2.2 m it rears back for **1.0 s** with a ground cone telegraph (2.4 m, ±40°; both × elite scale), then **slams** for 1.4× damage to the Shepherd and every minion in the cone, with 9 m/s knockback. 0.8 s recovery, 2.4 s between slams. | Step out of the cone. Bone Spears pierce. |
| **Cinder Witch** | Ranged | 22 | 2.3 | 10 per orb | 2 | Stops at 8.5 m, backs away inside 5.1 m, and **lobs** an ember orb about every 3.0 s (±15%) at the Shepherd's position 0.3 s ahead. The orb arcs for 1.0 s onto a 1.1 m telegraph circle (with a closing outer ring) and hits the Shepherd and minions inside. From Chapter 2 the landing leaves **burning ground** for 3 s (25% of the orb damage per second, ticks every 0.3 s, patches don't stack). | Ashen Chains and homing Soul Bolts reach her. Keep moving when a circle appears. |
| **Bloater** | Bomber | 28 | 2.0 | 26 AoE (2.6 m) | 2 | Within 2.4 m of the player it slows to 25%, flashes and shows a 2.6 m telegraph, then explodes after 1.0 s. The blast also deals 60 to minions and 1.2× its max HP to other *enemies*. Killed early, it just dies (and can rise). | Kill it early, or let it detonate inside a crowd. Never let it reach you. |
| **Elite** (any type) | Gold variant | ×6 | ×0.9 | ×1.5 | ×12 | Gold #ffd04a glow, ×1.35 scale, ×3 mass, and a floating gold **crown** marker. Rolls 1–2 affixes (§5.1). Can be raised. | Drops a **Relic Chest**. |
| **Gravemaw, the Hollow King** | Boss | 12,500 | 2.3 | 22 per touch, see §6 | — | Appears at 6:00. Killing him clears the chapter. | See §6. |

Enemy colour code: warm ember/crimson (#ff4a2a, #ff8a3d), elites gold (#ffd04a), boss magenta/violet (#ff3df0). Every enemy has an emissive core so it reads against the dark ground.

### 5.1 Elite affixes

Every elite the director raises rolls **1 affix**, or **2 from Chapter 4 and in Endless**, plus `run.diff.eliteAffixes` when a difficulty sets it. A first run rolls only Warded or Hasted.
- **Announcement:** the ELITE banner names them (e.g. "WARDED BRUTE", "VAMPIRIC HASTED CINDER WITCH") and says what each does. A small tag in each affix's colour floats over the elite, with a thin gauge under it while a ward holds.
- **Rewards:** affixed elites still drop their Relic Chest, plus **+40 bonus gold per affix**.
- **Champions:** an elite raised as a Champion carries no affix.
- **Boss fight:** boss-time adds never roll affixes. An affixed elite that is still alive when Gravemaw arrives keeps its affixes.

Numbers live in `AFFIXES` (`data.js`), the logic in `affixes.js`.

| Affix | Effect | Visual and sound |
|---|---|---|
| **Warded** | A soul ward worth 35% of max HP. While it holds, it soaks 70% of every hit (30% reaches HP), so the elite effectively has about 1.35× HP. When it breaks, the elite staggers in place for 0.9 s. | A pale-cyan fresnel bubble that flashes on hits. The break: a glass shatter, a shockwave, "WARD BROKEN", a short hit-stop and a light haptic. |
| **Splitter** | On death it bursts into 3–4 smaller copies of its type. The copies are 78% size, have 0.9× a normal enemy's HP, move 35% faster, are not elites and carry no chest. | A throbbing orange aura; a wet pop and an orange burst on the split. |
| **Vampiric** | Heals 4% of max HP whenever another enemy dies within 6 m, at most once per 0.35 s (so at most about 11% per second inside a meat grinder). | A pulsing red aura; a red tether of blood motes streams from each corpse it feeds on. |
| **Hasted** | +45% move speed (an elite Brute walks at about 2.2 m/s, an elite Husk at 3.1, both still slower than the Shepherd). | A trail of embers. |
| **Commander** | Enemies within 6 m move and hit 25% harder (slams and lobs included). Killing it routs them: a 7 m/s shove away from it, then 40% speed for 2 s. | A dashed gold ground ring of 6 m; embers over the rallied foes. The rout: "ROUTED!", a gold ring and a sagging war horn. |

**Balance check (2026-10-06).** The balance bot played Vael 16 times on each of Chapters 2, 4 and 5, measuring average survival:

| Build | Ch2 | Ch4 | Ch5 |
|---|---|---|---|
| Before | 265 s | 275 s | 286 s |
| Affixes only (events off) | 291 s | 292 s | 272 s |
| Affixes and events | 271 s | 284 s | 289 s |

Runs spread by about ±60 s (standard error about 15 s). The one drop is Ch5 with affixes only: 8 elites with 2 affixes each cost 5%. That is inside the noise and well inside the 10% budget for affixes. The bot never seeks out events, so events show up here only when it stumbles on one.

---

## 6. Boss: Gravemaw, the Hollow King

A three-phase fight in a sealed arena. All numbers live in `BOSS` and `BOSS_PHASES` (`data.js`). Damage values are × his touch damage.

**HP and damage.** HP = 12,500 × chapter HP mult × (1 + 0.05(c−1)) × chapter tune × Endless scale × difficulty boss HP (§8.2). The tune factors (1, 0.8, 0.75, 1.15, 1.2) even the fight out at about a minute for a player with that chapter's typical progression. That gives **Ch1 12,500 · Ch2 19,950 · Ch3 33,000 · Ch4 82,656 · Ch5 135,000**; the first Endless King has 62,500. Damage = 22 × (1 + 0.3(c−1)) × √scale × difficulty damage. Measured with typical progression (`scripts/balance.mjs`, `GOD=1`): Ch1 ≈ 54 s · Ch2 ≈ 51–60 s · Ch3 ≈ 70–76 s · Ch4 ≈ 64 s · Ch5 ≈ 68 s.

**Rise and arena.**
- **Rise:** 1.4 s, immune, with the boss bar white. He rises 11 m up-screen. His first attack comes 2.5 s after spawn.
- **Seal:** a magenta rune circle seals an **18 m arena** centred on the Shepherd. The rune sweeps round in 1.2 s, behind a 2.4 m light curtain.
- **Soft wall:** push-back starts 1.1 m from the edge at 14/s. The Shepherd can't get closer than 0.35 m, and contact gives sparks, a sound and a light haptic.
- When the seal completes, the leftover horde burns away (no XP or souls; elites stay).
- Boss orbs that reach the wall are destroyed there. He stays inside too.
- The arena fades out over 1 s when he dies. In Endless the run then continues.

**Adds come only from the arena edge.**
- **Trickle:** 1.2/s × chapter rate (70% Husk, 30% Ghoul), at least 9 m from the Shepherd. At most 70 alive in phase I, 45 in II–III.
- **Edge waves** from phase II: 12–16 Husks every 12–15 s, on an arc opposite the Shepherd.
  - Each spawn point flares for 1.0 s first, and none appear within 7 m.
  - In phase III each wave includes a Brute.

| Phase | HP | Moves |
|---|---|---|
| **I: Hollow Tread** | 100–66% | Chase 2.3 m/s. Picks: slam 0.42 (within 13 m), ring 0.33, summon 0.25; no attack repeats except the slam. |
| **II: Ember Liturgy** | 66–33% | Chase ×1.15, attack rate ×1.25, slam telegraph 1.1 s, orbs ×1.1 speed. Picks: slam 0.4, rotating gap rings 0.6. |
| **III: Crown of Cinders** | 33–0% | Enraged: chase ×1.35, attack rate ×1.35, slam telegraph 1.0 s, orbs ×1.2. Picks: slam 0.3, rings 0.3, spiral 0.4. The arena closes from 18 m to 12 m over 4 s. |

**His moves**
- **Grave Slam:** he leaps onto the Shepherd's spot after a 1.2 s telegraph (1.1 s in phase II, 1.0 s in III). Three concentric rings follow 0.3 s apart:
  - ring 1, on landing, is a disc out to 3.65 m;
  - the 6 m and 9 m rings are ±0.65 m bands, with dashed white guides marking the safe lanes between them;
  - each ring deals 1.4×;
  - the landing disc **kills every minion inside outright**, Champions included, and the outer bands deal 0.7 × 1.4× to minions;
  - recovery 1.9 s.
- **Ember Ring:** a 1.0 s fan telegraph, then 24 orbs with 2 opposite gaps (about 48° each) at 6 m/s, 0.6× each. Recovery 1.6 s.
- **Rotating gap rings (phase II and later):** 3 waves 0.5 s apart, each gap turned ±0.35 rad. The fan shows the next gap solid and later ones dashed.
- **Summon:** rune circles for 1.0 s, then 6 adds around him at 3.2 m (every 3rd a Ghoul). Recovery 1.4 s.
- **Spiral (phase III):** a 1.0 s sigil shows the curl and spin direction. Then 4 arms for 2.5 s (one orb per arm every 0.09 s, 0.75 rad/s, 5.5 m/s, 0.55× each). The Shepherd starts between two arms.
- **Crown aura (phase III):** minions within 3.2 m take 1.5× damage per second, scaling from 12 crowding minions to full strength at 32, so a banked legion can't delete the last phase.

**Fight rules**
- **Phase transitions:** a 2 s immune roar.
  - Enemy shots clear, with a 90 ms hit-stop, slow-mo 0.3× for 0.45 s and a flash.
  - The Shepherd is pushed back gently, and adds within 9 m are knocked back.
  - The phase banner shows his painted portrait. Unfinished telegraphs are withdrawn.
  - Minions that hit him while he's immune take no recoil.
- **Phase floor:** phase I lasts at least 18 s and phase II at least 14 s. Reach the tick sooner and he is held there (IMMUNE, white bar with a "WARD n" countdown) until the phase has played out, so a huge legion can't skip phases. Damage poured into the ward shortens it by 1 s per 5% of his max HP, so strong builds shatter it faster.
- **Soul Nova** and gate soul bursts hurt him at **50%, capped at 25% of max HP per Nova**. Damage numbers show what actually landed.
- **Hollow Dirge (soft enrage):** 180 s after he spawns he gains +50% damage and attack rate, with a banner. Telegraphs never shorten.
- **Chapter twists:**
  - Ch2: each slam ring leaves a burning band for 3 s.
  - Ch3: each ring leaves 4 / 7 / 10 frost shards (0.75 m, 3.5 s).
  - Ch4: one extra wave per ring volley.
  - Ch5: phase III starts at 50%.
  - Endless follows the modifier rotation by depth.
- **Accessibility floor:** no damaging telegraph is under 1.0 s in any chapter, phase or enrage state.
- **On his death:** every enemy is cleared, all shards fly to the player and 30 souls join the legion. In the campaign the chapter is cleared.

---

## 7. Skills

Damage values are base values before Might, talents, relics and stars. Every weapon hit has a 10% chance to crit for ×2 damage. Cooldowns are divided by the attack-speed multiplier (Frenzy, Hourglass of Ash).

### 7.1 Weapons

**Soul Bolt** (homing bolts at the nearest enemies within 11.5 m, 17 m/s, 1.4 s life). Vael's signature weapon.

| Stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Damage | 13 | 17 | 22 | 30 | 40 |
| Bolts per volley | 1 | 2 | 2 | 3 | 5 |
| Cooldown (s) | 0.70 | 0.66 | 0.60 | 0.55 | 0.48 |
| Pierce | 0 | 1 | 1 | 2 | 3 |

**Spectral Scythe** (full-circle sweeps, 0.3 s each, starting from the facing direction; knockback; each sweep hits an enemy once). Nyx's signature weapon.

| Stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Damage | 16 | 20 | 26 | 32 | 42 |
| Sweeps per cast | 1 | 1 | 2 | 2 | 3 |
| Radius (m) | 2.6 | 2.8 | 3.0 | 3.3 | 3.7 |
| Cooldown (s) | 1.60 | 1.50 | 1.35 | 1.20 | 1.00 |

**Ashen Chains** (chain lightning: first target within 7.5 m, then jumps to the nearest new enemy within 4.5 m). Each link also **scorches** every other enemy within 1.4 m of its target for 50% damage. Seraphine's signature weapon.

| Stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Damage per hit | 18 | 23 | 29 | 37 | 48 |
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
| Vitality (max HP; each pick also heals 30% of max HP) | +20 | +40 | +60 | +80 | +100 |
| Soul Magnet (pickup radius, base 2.8 m) | +30% | +60% | +90% | +120% | +150% |
| Might (weapon and Nova damage, not minions) | +10% | +20% | +30% | +40% | +50% |
| Frenzy (attack speed) | +8% | +16% | +24% | +32% | +40% |

### 7.3 Evolutions

All six evolutions are in the build, one per weapon. An evolution card enters the pool when the weapon is Lv5 **and** the paired passive is owned (any level). With weight 1,000 it is almost always the next card offered, at a level-up or from a Relic Chest. The weapon keeps its slot and is upgraded in place.

| Evolution | Recipe | Effect |
|---|---|---|
| **Soul Storm** | Soul Bolt Lv5 + Might | 6 bolts per volley (Lv5 cooldown), 44 damage, pierce 4. Each hit explodes for 60% damage in a 1.5 m radius. |
| **Bone Crown** | Skull Halo Lv5 + Minion Fury | 8 skulls, 26 damage, 3.2 m radius, always on. Every skull kill raises a soul (while below the cap). |
| **Harvest Moon** | Spectral Scythe Lv5 + Haste | The sweep becomes 3 sweeps of 46 damage every 0.9 s at the Lv5 reach (3.7 m). Two crescent blades also orbit at that reach (5.2 rad/s), dealing 58 per hit in a 1.3 m radius, each enemy at most once per 0.3 s, knocking foes along the spin. Every scythe kill heals 1 HP from a bank that refills at 6 HP/s (cap 6). |
| **Chains of Perdition** | Ashen Chains Lv5 + Frenzy | 12 links of 54 damage; links prefer targets at least 1.6 m apart and no closer to the Shepherd, so the chain lashes outward. Each link scorches within 1.7 m for 50%. Targets burn for 40% of the hit over 2 s (ticks every 0.25 s; re-hits add to the pool and refresh the timer). Kills while burning get **+25 pp Raise Chance** (still capped at 85%). |
| **Ossuary Barrage** | Bone Spears Lv5 + Vitality | A fan of 5 spears (0.2 rad apart), 56 damage, unlimited pierce. Each flies 3.5 m past its target (5–16 m; odd spears 1.2 m further) and bursts into bone shrapnel: 55% damage in 2 m with knockback. |
| **Requiem** | Grave Pulse Lv5 + Soul Magnet | Every 1.4 s: a 0.3 s drag pulls enemies inward (70 m/s², with a swirl; never the boss), then a 46-damage blast in 6.5 m with strong knockback. Each blast also pulls every soul shard within 12 m to the Shepherd. |

Measured in a dense, continuous horde (Ch1 minute-4 mix at ×8 HP, 22 enemies/s, the Shepherd kiting, no legion), effective DPS at Lv5 → evolved: Soul Bolt 1,730 → 4,350 · Skull Halo 2,100 → 2,560 (its payoff is the raises) · Scythe 3,130 → 4,020 · Chains 2,590 → 3,590 · Spears 2,680 → 3,360 · Grave Pulse 2,010 → 2,840.

*(Planned extras: Soul Storm kills split the bolt into 2 mini-bolts; Bone Crown gives minions within 6 m +30% damage and heals them 20% every 4 s.)*

---

## 8. Chapters and difficulty scaling

| # | Chapter | Palette | HP mult | Spawn mult | Modifier | Recommended talents |
|---|---|---|---|---|---|---|
| 1 | Ashen Necropolis | Teal / ember | 1.00 | 1.00 | None (teaching chapter) | 0 |
| 2 | Ember Wastes | Orange | 1.90 | 1.15 | Cinder Witch weight ×1.8; lobs leave burning ground; **ember vents** (15 m grid, 32% of cells, 1.6 m radius, a puff every 6.5–9 s after a 1.2 s telegraph, 12 base damage scaled like enemy damage) | ~8 levels total |
| 3 | Frozen Ossuary | Ice blue | 3.20 | 1.30 | Ghoul weight ×1.5, packs of 6–8; **ice patches** (12 m grid, 50% of cells, radius 2.6–4.4 m): on ice the Shepherd accelerates at 30% of normal, stops with 20% of normal friction and gets +8% top speed | ~25 |
| 4 | Abyssal Cathedral | Violet | 5.00 | 1.45 | Bloater weight ×2; vignette 1.25 and ground fog pulled in from 26 to 17 m; **abyssal hands** every 6–9 s aimed 0.6 s ahead (1.3 m, 1.0 s telegraph, 0.6 s root) | ~60 |
| 5 | Crimson Throne | Blood red | 7.50 | 1.60 | **8 elites** (45, 75, 110, 150, 185, 225, 255, 290 s); Brute weight ×1.6 | ~110 |
| ∞ | Endless Abyss | Shifting | 4.00 (flatter curve) | 1.40 | No time limit; Gravemaw returns every 5:00, +60% HP each time. Each depth rotates the active modifiers Ch2 → Ch3 → Ch4 → Ch5 ("THE ABYSS SHIFTS"); under Ch5 modifiers elites come every 35 s | Endgame |

Chapters differ in palette, HP mult, spawn mult, the modifiers above and the chapter terms below. A run opens with a banner naming the chapter and its twist. Hazards (burning ground, vents, hands, ice) affect only the Shepherd. Every chapter but Ch5 has 4 elites. Each chapter is exactly 6:00 plus the boss. Chapter N+1 unlocks when Gravemaw dies in Chapter N (on Normal). Endless Abyss unlocks after the first Chapter 5 clear. Every campaign chapter can then be replayed on **Nightmare** and **Torment** (§8.2).

**Formulas** (c = chapter 1–5, m = minutes elapsed as a decimal):

- **Enemy HP** = BaseHP × chapter HP mult × (1 + 0.28m + 0.04m²) × difficulty HP (§8.2; 1 on Normal, ramping in from 1 over the first minutes, and 1 for Gravemaw's arena adds)
- **Enemy damage** = BaseDamage × (1 + 0.1m) × (1 + 0.35(c−1)) × difficulty damage. Ch1 goes from ×1.00 to ×1.60 at 6:00; Ch5 from ×2.40 to ×3.84 (on Normal).
- **Spawn rate (enemies/s)** = (1.1 + 0.85m + 0.22m²) × chapter spawn mult × difficulty spawn, with a limit of 200 / 280 / 340 enemies alive at once (low / mid / high quality tier). Swarm rings and elites come on top and are not scaled by chapter.
- **Elite HP** = 6 × Enemy HP · **Boss HP** = 12,500 × chapter HP mult × (1 + 0.05(c−1)) × chapter tune × difficulty boss HP (§6, §8.2)
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

**Endless Abyss (in the build).** Chapter id 6, unlocked by the first Chapter 5 clear. It uses its own flatter HP curve, `4.0 × (1 + 0.32m + 0.025m²)` (×26.8 at minute 10, ×45.6 at minute 15), and spawn mult 1.40 under the normal alive limit. There is no time limit: the run ends when the player falls (one paid revive as usual). Gravemaw returns every 5:00 with HP `12,500 × 4.0 × 1.25 × (1 + 0.6k)` (62,500 for the first, k = kills so far), and every return replays all three phases and damage × √(1 + 0.6k). Each kill drops a Relic Chest, raises 25 souls and resets the 5:00 clock. Elites keep coming every 70 s after the first four. Rewards: the normal gold formula, 15 gems per Gravemaw plus 2 per minute, and a relic (Rare; Epic from 2 kills; Epic+ from 3). The deepest run is saved as the chapter-6 best time. Endless is **Normal only**: it already escalates without end, so the chapter card hides the difficulty selector there (§8.2). *(Planned: weekly leaderboards ranked by time survived, kills as tie-break.)*

### 8.1 Daily Trial

One free run a day (no energy) that twists the core loop. It unlocks once Chapter 1 is cleared (home screen, left column, gold "Trial" button with a badge while today's attempt is unused).

- **Seeded by date.** The day's hash picks a chapter the player has cleared (1 to unlocked − 1, max 5), one **boon** and one **bane**. Everyone at the same progress sees the same trial; it resets at local midnight.
- **One attempt a day,** plus one more through a rewarded ad (`trial_retry`). Starting the trial uses the attempt.
- **Rewards:** the normal run gold and pass XP, plus on a clear **40 gems and +150 pass XP**; every 3rd clear also gives **1 Altar Sigil** (the panel counts down to it). A failed attempt pays 8 gems per full minute survived (max 40) instead of the normal run gems. Trials never change chapter records, unlocks or first-clear rewards.
- **Always Normal difficulty.** The mutators are the trial's twist, so Nightmare and Torment (§8.2) never apply, whatever the chapter card is set to.
- **Announced** in-run by a "DAILY TRIAL" banner at 0:03.6 naming both mutators; the pause screen lists them.

| Boon | Effect | Bane | Effect |
|---|---|---|---|
| Soul Harvest | +20 pp Raise Chance (85% cap) | Swarming Dark | +50% enemy spawns |
| Overflowing Cup | +40 legion cap (400 ceiling) | Iron Hides | Enemies have +60% HP |
| Nova Font | Soul Nova charges ×2 | Witching Hour | Cinder Witch spawn weight ×4 (from 2:00) |
| Gilded Gates | A gate pair every 25 s; bad gates become +N | Gilded Horrors | An elite every 40 s (8 per run, so 8 Relic Chests) |
| Awakened | Signature weapon starts at Lv3 | Brittle Legion | Minions have half HP |
| Legion Fury | Minions deal +60% damage | Restless Dead | Enemies move 30% faster |

### 8.2 Nightmare and Torment

Every campaign chapter can be replayed on two harder difficulties for long-term replayability. The tunables live in `DIFFICULTY` (`data.js`); the rules are in `src/meta/difficulty.js`. A run carries them as `run.diff`, which is always defined (Normal is the identity: every multiplier 1, no extra elites, no affixes).

- **Unlocks, per chapter:** a Normal clear opens that chapter's Nightmare, and a Nightmare clear opens its Torment. Chapter unlocks, Endless Abyss and the Normal first-clear reward still come from Normal clears only.
- **Normal only:** Endless Abyss (it already escalates without end) and the Daily Trial (its mutators are its twist). For those the selector is hidden, and a requested difficulty is ignored.
- **Blood Moon stacks on top** of any difficulty: its 8 elites plus the difficulty's extra ones (10 on a Nightmare weekend), and ×2 gold and gems on top of the difficulty's gold.
- **Energy:** 5 per run on every difficulty. A harder run is not a reason to spend more of the session pacer.
- **Choosing:** the home screen's chapter card has a three-way selector (Normal · Nightmare · Torment) under the chapter name. Each button shows its gold multiplier, or a lock with "Beat Normal" / "Beat Nightmare" (a tap on a locked tier explains why). The choice is remembered per chapter (`profile.diff.sel`). BATTLE turns violet or crimson to match. The status line shows the chosen tier's record, or its first-clear bonus.

| | Normal | Nightmare | Torment |
|---|---|---|---|
| Enemy HP (horde, elites, gate guards), reached after the ramp | ×1 | ×NM_HP, ramping in over NM_RAMP min | ×TM_HP, ramping in over TM_RAMP min |
| Enemy damage (horde, hazards, Gravemaw) | ×1 | ×NM_DMG | ×TM_DMG |
| Spawn rate (director; swarm rings unchanged) | ×1 | ×NM_SPAWN | ×TM_SPAWN |
| Elites | 4 (8 in Ch5) | +2, at 3:10 and 5:20 | +4, also at 1:55 and 4:20 |
| Affixes per elite (§5.1; `run.diff.eliteAffixes` is the extra) | 1 (2 from Ch4) | +1: 2 (3 from Ch4) | +2: 3 (4 from Ch4) |
| Soul shard XP | ×1 | ×NM_XP | ×TM_XP |
| Gravemaw HP (his arena adds keep Normal HP) | ×1 | ×NM_BOSS | ×TM_BOSS |
| Run gold · pass XP | ×1 · ×1 | ×1.75 · ×1.5 | ×2.5 · ×2 |
| First clear (once per chapter) | 70–150 gems + 1 sigil | +60 gems | +120 gems |
| Gravemaw's Hoard | §10 | Rare 60% / Epic 40% | Epic 98% / Legendary 2% |
| World palette | the chapter's | mixed 70% toward violet | mixed 85% toward blood red on black |

- **Three rules keep the harder tiers fair rather than grindy.** Each came from the balance bot:
  - **HP ramp:** the extra HP builds up from ×1 at 0:00 to its full value over the ramp. Damage, spawns and elites apply at once. With a flat ×3.5–4.5, Chapter 5 Torment Husks had ~470 HP at 0:00, and the bot died at level 2 with ~100 kills: a wall, not a challenge.
  - **Richer souls:** shard XP is multiplied. A tougher horde dies more slowly, and without this the Shepherd met Gravemaw ~10 levels behind a Normal run.
  - **Gravemaw scales less than the horde, and his arena adds keep Normal HP.** Tough adds piled up at the arena's alive cap, soaked the Shepherd's weapons and the legion, and stretched Nightmare fights past 8 minutes. The target is a fight no more than about 1.6× its Normal length.
- **Look and feedback:** the ground, runes, rim light and fog are pulled toward the difficulty's palette, the same swap as the Blood Moon look and applied over it on Blood Moon weekends. Allies and enemies keep their colours (§14). The HUD shows a NIGHTMARE or TORMENT tag under the chapter name. A banner at 0:03.6 names the difficulty (the Blood Moon banner names it instead on weekends). The pause and results screens show a difficulty pill with its gold multiplier.
- **Records:** best time, best legion, best kills and a cleared flag are kept per chapter per difficulty (`profile.diff.best`). Normal's clear flag stays in the chapter record. Old saves migrate safely: the block is added, Normal records are seeded from the chapter records, and Nightmare opens on every chapter already cleared.
- **Quests:** "Clear a chapter on Nightmare" and "Slay 5 elites on Nightmare" join the late daily-quest pool (Torment counts for both, §2).

BAL_TABLE

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

**Gold** = round( (0.9 × K + 2.2 × T + 400 × c × B) × (1 + G) × P × D + bonus )

K = total kills (player and minions), T = seconds survived including the boss fight (max 960), B = 1 if Gravemaw was killed, c = chapter, G = gold bonus (Greed talent + Grave Coin relic), P = 1.2 with an active Soul Pact, D = the difficulty's gold multiplier (Normal 1, Nightmare 1.75, Torment 2.5; §8.2; the flat bonus is not multiplied), bonus = 150 per "Grave Gold" card + 40 per affix on each slain elite (§5.1) + 100 + 40c per slain Soul Thief (§4.8). Blood Moon doubles the run's gold and gems, and the rewarded-ad "double rewards" then grants the (doubled) gold and gems a second time, so the two stack to ×4 (×10 the Normal base on a Torment Blood Moon run).

| Example (G = 0) | Full clear (T = 7:00) | Death at 4:00 (no boss) |
|---|---|---|
| Ch1 (~2,000 / ~870 kills) | 3,124 | 1,311 |
| Ch3 (~2,550 / ~1,110 kills) | 4,419 | 1,527 |
| Ch5 (~3,100 / ~1,350 kills) | 5,714 | 1,743 |

- **Gems per run:** a clear gives 10 + 2c (12–20). A defeat gives 2 gems per full 2 minutes survived (4 at 4:00). The same on every difficulty.
- **Pass XP per run** = round( round(20 + T/6 + K/40 + 40 × B) × X ), where X = 1 / 1.5 / 2 on Normal / Nightmare / Torment: about 180 for a Ch1 clear and 82 for a death at 4:00 on Normal. Account XP gets the Normal amount (without X). Account level n → n+1 needs 80 + 40n XP, and every account level-up gives 20 gems.
- **First-clear bonus** (replaces the clear gems): 50 + 20c gems (Ch1 70 · Ch2 90 · Ch3 110 · Ch4 130 · Ch5 150) + 1 Altar Sigil. The first **Nightmare** clear of a chapter adds **+60 gems** and the first **Torment** clear **+120 gems** on top of the 12–20 clear gems, once per chapter per difficulty (900 gems in total). That bonus is flat: Blood Moon and the rewarded-ad double skip it.
- **Gravemaw's Hoard** (every boss kill): one relic of a random type. Odds by difficulty:

| Hoard rarity | Common | Rare | Epic | Legendary |
|---|---|---|---|---|
| Normal Ch1–2 | 50% | 50% | — | — |
| Normal Ch3–5 | 32.5% | 32.5% | 35% | — |
| Nightmare (any chapter) | — | 60% | 40% | — |
| Torment (any chapter) | — | — | 98% | **2%** |

Campaign runs never dropped Legendaries before Torment (the Endless Epic+ relic from depth 4 already could). Torment's 2% is the same rate as one Altar pull and gives a relic only, never hero shards (MONETIZATION §2.5). *(Planned: odds shown on the results screen.)*

| Reward per run | Normal | Nightmare | Torment |
|---|---|---|---|
| Gold (D) | ×1 | ×1.75 | ×2.5 |
| Pass XP (X) | ×1 | ×1.5 | ×2 |
| Run gems | 12–20 per clear | same | same |
| First clear, one-time per chapter | 70–150 gems + 1 sigil | +60 gems | +120 gems |
| Hoard floor | Common | Rare | Epic |
| Energy | 5 | 5 | 5 |
| Example: Ch5 clear, G = 0 | 5,714 gold · ~210 XP | 10,000 gold · ~310 XP | 14,285 gold · ~415 XP |

---

## 11. Heroes (Shepherds)

| Hero | Rarity | Base HP | Move (m/s) | Signature weapon | Passive | Rite (§11.1) | How to get |
|---|---|---|---|---|---|---|---|
| Vael, the Gravecaller | Common | 100 | 6.2 | Soul Bolt | +10% Raise Chance (pp) | **Grave Call** (20 s): for 4 s every kill rises; shards within 12 m fly in | Free (starter) |
| Nyx Hollowborn | Rare | 110 | 6.5 | Spectral Scythe | Minions +20% speed and damage | **Shadow Step** (8 s): an invulnerable 7 m dash that cuts its path; the legion surges +60% for 3 s | Starter Pack / Epic summon shards |
| Seraphine Ashveil | Epic | 105 | 6.4 | Ashen Chains | Soul Nova charges 30% faster, and foes her Nova kills rise at ×2 Raise Chance (not halved) | **Ashfall** (18 s): burning chains strike and pin 20 foes on screen (elites, then Witches, first); +15% Nova charge | Epic and Legendary summon shards, Soul Pass S1 premium |
| Liora Bellwraith | Epic | 105 | 6.3 | Grave Pulse | Her pulses mark foes for 3 s; marked foes rise at ×2 Raise Chance whoever kills them (85% cap). Her pulses push foes 75% less, so they stay inside her legion's reach | **Death Knell** (15 s): a bell toll stuns foes within 5 m for 1.5 s and marks them for 5 s; it clears enemy fire and silences Witches within 10 m | Epic summon shards |
| Mordrake the Undying | Legendary | 130 | 6.0 | Bone Spears | Legion cap +25%; revive once per run at full HP | **Ossuary Wall** (18 s): a 5 m ring of bone spikes for 5 s that throws foes out, shatters Witch fire and heals the legion inside | Legendary summon shards |

**Balance check (2026-10-06, before Hero Rites).** The balance bot (`HERO=<id> npm run balance`) played every hero at equal progression on Chapters 2 and 4, 6 to 10 runs each. Average survival (§11.1 has the numbers with Rites):

| Hero | Survival | Note |
|---|---|---|
| Vael | 291 s | |
| Mordrake | 299 s | plus his revive |
| Seraphine | 268 s | 216 s before her Nova fix |
| Liora | 251 s | 230 s before the toll and knockback fix |
| Nyx | 246 s | |

- **Seraphine's fix:** her faster Nova used to empty the legion more often, so she had the smallest army.
- **Liora's fix:** her ×2 rarely fired, because pulses seldom land the killing blow. Her pulses also flung the horde out of her legion's reach.
- **Spread:** results vary by about ±35 s between runs. For Liora, +15% base damage or +6 pp Raise Chance did not move her result outside that spread.
- **Vael's lead:** most likely a bot artifact. The bot only flees, which favours Vael's homing Soul Bolt; he takes the least damage of any hero.
- **Before nerfing Vael:** confirm with human playtest data first, because the chapters are tuned around him.

**Stars.** Unlocking takes 10 shards (1★). Star costs: 10 / 20 / 40 / 80 shards for 2★ / 3★ / 4★ / 5★ (160 shards from first shard to 5★). Each star above 1★ adds +12% damage and +8% HP, so 5★ = +48% damage, +32% HP.

**Shard sources:** an Epic Soul Altar roll gives 4 Seraphine, 6 Nyx or 5 Liora shards (equal chance). A Legendary roll gives 5 Mordrake or 6 Seraphine shards (50/50). The Soul Pass S1 premium track gives 25 Seraphine shards (10 at tier 10, 5 each at tiers 5, 15 and 25). Duplicate hero grants (for example, owning Nyx and then buying the Starter Pack) convert to 20 shards of that hero. *(Planned: in Endless Abyss, the top 10 of each Abyssal-league group earn 2 Mordrake shards per week.)*

### 11.1 Hero Rites

Each hero has a signature active ability, a **Rite**, on its own RITE button (§3). It is ready from the first second of every run and then recharges on its own cooldown. The cooldown counts run time, so it waits while the game is paused or a card pick is open and slows down with slow motion. All numbers live in `RITES` (`data.js`); the code is `src/game/rites.js` and `src/ui/riteui.js`.

**Rite damage** = base × the run's damage multiplier (stars, Might talent and skill, Crown of Thorns) × (1 + 0.45(c − 1)), the same chapter scaling as Soul Nova. Shadow Step and Ashfall can crit (10%, ×2) like a weapon.

| Hero | Rite | Cooldown | What it does |
|---|---|---|---|
| Vael | **Grave Call** | 20 s | For 4 s every kill rises (Raise Chance 100%). The legion cap and its overflow rules still hold: a roll at the cap mends the weakest minion instead. Soul shards within 12 m fly to Vael for the whole call. |
| Nyx | **Shadow Step** | 8 s | Dashes 7 m in 0.18 s along the stick (her facing when idle), invulnerable for 0.4 s. It slips abyssal hands and slam shoves. Foes within 1.5 m of the path take 90 and are knocked aside. The legion moves +60% faster for 3 s to catch up. |
| Seraphine | **Ashfall** | 18 s | Burning chains fall on up to 20 foes on screen over 0.5 s: Gravemaw and elites first, then Cinder Witches, then the nearest. Each takes 120, is pinned (stunned) for 0.8 s and burns for 60% of the hit over 2 s; a kill while burning gets +15 pp Raise Chance (85% cap). If a struck foe dies first, its chain finds the nearest unstruck foe within 3 m. Adds +15% Soul Nova charge (not mid-detonation). |
| Liora | **Death Knell** | 15 s | A great bell tolls around her. Every foe within 5 m is stunned for 1.5 s, takes 60 and carries her toll for 5 s (her passive's ×2 Raise Chance, whoever lands the kill; the passive's own mark lasts 3 s). Every enemy shot and Witch fire orb in flight is cleared, and Cinder Witches out to 10 m are stunned too, so their next fire waits. |
| Mordrake | **Ossuary Wall** | 18 s | A ring of bone spikes (5 m) erupts around him for 5 s and moves with him. Foes inside are thrown out; every crossing cuts for 60 with knockback (at most once per 0.5 s per foe). Witch fire that would land inside shatters on the bone. Minions inside heal 50% of their max HP over the 5 s. |

**Stun** (`Enemies.stun`): a stunned foe neither steers nor attacks, and only drifts on its knockback. A Brute wind-up, a Ghoul crouch or lunge and a Bloater fuse in progress are called off, and the Bloater's fuse circle goes out with it. Stunned foes stop waddling and three pale daze motes circle their heads.

**Gravemaw keeps his rules.** Rite damage goes through his own filter (immune while rising, roaring or warded; phase floors). A stun never stops him: it only pushes his next attack back by 0.25 s while he is chasing. The Ossuary Wall only leans on him (1.2 m/s outward) instead of throwing him out. Ashfall strikes him first. Grave Call cannot raise him.

**Look and feel.** Each Rite is meant to sell the hero in the Soul Altar:
- *Grave Call:* a 12 m rune ring around Vael, a heartbeat pulse ring every second, souls streaming in from the rim, and a cyan soul pillar (in the legion colour) wherever a foe rises. Slow motion 0.25 s.
- *Shadow Step:* four afterimages along the path, a shadow trail with a hot core, smoke, a scythe slash where she lands, and a speed streak behind the surging legion.
- *Ashfall:* ash drifts down across the screen; each target gets a pulsing ember mark, then a jagged burning chain falls from the sky onto it with an ember burst.
- *Death Knell:* a spectral bell drops over Liora, swings and tolls; the toll band runs down its body, three rings roll out to 5 m, and a brief hit-stop lands the strike.
- *Ossuary Wall:* 44 bone spikes in two staggered rows erupt in a wave from where Mordrake faces, glowing marrow-green at the root, under a green rune ring. They tremble while up and sink back at the end.
- Each Rite calls out its name over the battlefield, has its own sound (§15) and a haptic (medium for Shadow Step, heavy for the others; a light tick when the Rite is ready again). Flashes and shake go through the Reduce flashes and shake settings (§17).

**Run result.** `counters.rites` counts casts; the run result carries it as `rites`.

**Balance (balance bot, 2026-10-06).** `scripts/balance.mjs` casts the Rite on a simple rule per hero (`RITE=0` turns it off): Mordrake at 2+ foes within 3 m or 5+ within 6 m; Liora at 3+ within 3 m, 8+ within 6 m, or when a Witch's fire circle is about to land on her; Nyx the same, dashing straight away from the crowd or out of the circle; Vael at 12+ foes within 12 m; Seraphine at 14+ foes within 12 m, an elite or 2+ Witches in sight; Gravemaw within 8 m always counts. Every hero, equal progression, Chapters 2 and 4, 12 runs per chapter each, same build with the Rite off and on:

| Hero | Rite off | Rite on | Gain | Ch2 off → on | Ch4 off → on | Casts per run | vs Mordrake (on) |
|---|---|---|---|---|---|---|---|
| Vael | 281 s | 331 s | +18.1% | 261 → 290 s | 300 → 372 s | 13.5 | -8.8% |
| Nyx | 253 s | 283 s | +12.0% | 232 → 258 s | 273 → 308 s | 12.5 | -22.1% |
| Seraphine | 273 s | 312 s | +14.4% | 245 → 269 s | 301 → 356 s | 14.4 | -13.9% |
| Liora | 254 s | 285 s | +12.0% | 237 → 275 s | 271 → 294 s | 8.8 | -21.5% |
| Mordrake | 337 s | 363 s | +7.8% | 309 → 348 s | 365 → 378 s | 9.8 | — |

- **Why Witches matter:** damage-source tallies showed Witch fire orbs deal 60–75% of the damage the bot takes; melee contact is the rest. Rites that only answer melee or only add damage barely moved survival in testing (Ashfall at 110–170 damage changed nothing until its strikes pinned foes), which is why Ashfall targets and pins Witches right after elites, the Knell silences Witches out to 10 m, the Wall shatters their fire, and the bot rings the Knell or steps out when a fire circle is about to land.
- **Power-creep rule** (`LIVEOPS.md`): no hero may beat Mordrake by more than 5%, measured against Mordrake with his own Rite. All pass: Vael comes closest at −8.8%.
- **Mordrake's gain** is held down by the clear ceiling: a cleared run stops at about 400 s, and he already cleared 4 of 12 Chapter 4 runs without his Rite (6 of 12 with it). On Chapter 2, where nobody clears, he gains +12.6%.
- **Spread:** a single run varies by about ±35 s, so each figure is the mean of 24 runs (standard error about ±10 s). Earlier 12-run passes of the same build moved by up to 10 points.
- **Tuning history:** the brief's cooldowns (Vael 30, Nyx 10, Seraphine 24, Liora 22, Mordrake 28 s) gave −2% to +7%, so cooldowns came down and Grave Call's pull went from 9 to 12 m (more XP was what moved Vael). Raising Ashfall's damage to 170 or its Nova charge to 25% did nothing; pinning its targets did (+12% in the trial). The Knell's 10 m Witch silence and the Wall's fire shattering were added for the same reason.

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
- **Colour law:** allies are always cool, enemies are always warm (#ff4a2a, #ff8a3d), elites are gold (#ffd04a), bosses are magenta/violet (#ff3df0). Chapter tints change the environment only and never ally or enemy colours. Each hero has its own cool **legion colour**, used for the legion, Nova and Soul Bolts: Vael cyan #4ef2ff, Nyx violet #b36bff, Seraphine mint #7cffd4, Mordrake green #6dff9a. The hero model keeps its own tint, so Seraphine herself stays amber (#ffb347) while her legion is mint. *Exception: the premium Eclipse Vael skin gives its legion pale gold (#ffe9a0). This is intentional, a cosmetic flex the player chooses to equip.*

| Chapter | Environment key colour | Fog / rune accent | Note |
|---|---|---|---|
| 1 Ashen Necropolis | #0d1a1c obsidian | Teal runes, ember braziers | Reference palette |
| 2 Ember Wastes | #1a0e08 scorched | Orange #ff9a3c haze | Enemies get a brighter rim light to separate from the orange ground |
| 3 Frozen Ossuary | #0e141c frost | Pale ice #bfe6ff, desaturated | Kept low-saturation so cyan allies still pop |
| 4 Abyssal Cathedral | #120c1e | Violet #9b5cff stained glass | Boss magenta gets a white core to stay distinct |
| 5 Crimson Throne | #1a0608 | Blood red #c8102e | Enemy ember shifted to orange to avoid blending with red |
| Nightmare (any chapter) | The chapter's colours mixed 70% toward #3a1f62 / #140830 | Violet runes #b04bff, near-black fog #080312 | Same swap as the Blood Moon look (§2), blended so each chapter stays recognisable; allies and enemies keep their colours |
| Torment (any chapter) | Mixed 85% toward #2c0a0e / #0b0204 | Blood-red runes #ff1a2e, black fog #040001 | Darker than Blood Moon; enemies' emissive cores and gold elites still read against it |

- **Readability:** strong silhouettes, an emissive core on every unit, additive particles, screen shake (scalable), 65–90 ms hit-stop on elite kills, Gravemaw's phase changes, ×2/×3 gates and the Nova blast (§4.7). Enemy telegraphs are ground decals that fill from the edge inward.
- **Minions:** Shades are instanced soul wisps with particle trails. Every other variant is a **spectral ghost of its source enemy's silhouette** in the legion colour: an opaque emissive body with a hot rim, a ripple running up the body and a tail that dissolves into the ground, plus a halo glow sprite and a trail (one instanced mesh per variant). Champions add a gold rim, eyes and halo. *(Planned: at 300+ minions, trails switch to a shared ribbon per ring for performance.)*
- **UI:** obsidian panels with cyan rune trim. Premium currency and offers use gold. Display font is a gothic serif (e.g. Cinzel); body font is a clean sans (e.g. Inter). Numbers on gates and legion count are huge and outlined.

## 15. Audio direction

*Status: the build has menu, battle and boss music tracks plus a faster, harsher **Crown of Cinders** track for Gravemaw's last phase, all procedural. Every gameplay-update mechanic has its own synthesized SFX: Ghoul lunge hiss, Brute growl and slam, Witch lob and fiery landing, Soul Bomb implosion-boom, Champion chime, the arena-seal drone, wall zap, phase-change choir stab and ward ping. The Nova has its wind-up inhale, and each kill-streak tier has a brass-and-bell stinger that rises in pitch by tier (§4.7). Elite affixes and run events add a glass ward shatter, the Splitter's pop, the Commander's rout horn, the Soul Thief's jingle-and-cackle and its escape whoosh, the shrine's bell chime and the coffin's wood-splitting boom. Rendered offline, they peak between −19 and −7 dBFS before the master limiter, the same range as the existing SFX, so none of them clips. Each Hero Rite has its own signature sound (a funeral bell and rising souls for Grave Call, a tearing whoosh and ringing blade for Shadow Step, a hymn and a cascade of chain strikes for Ashfall, a great bell for Death Knell, heaving earth and splintering bone for Ossuary Wall) plus a soft rising chime when a Rite is ready again (§11.1); rendered offline, all are clearly audible and none clips. The stem system below is Planned.*

- **Music:** dark synthwave with choir and pipe organ. **Stems are added as the legion grows** (25 / 100 / 200 / 300 minions): percussion, then bass, choir and lead. The player *hears* the army getting bigger. Boss tracks are separate, with a phase-3 key change.
- **SFX priorities** (voice limit 32): 1) player hit and telegraphs, 2) Nova, 3) gates, 4) level-up, 5) raises (pooled into a shimmering chord, at most 10 voices), 6) weapons, 7) enemy deaths (heavily pooled).
- **Signature sounds:** *Raise*, a rising glassy chime. *Gate*, a deep bell, pitched up for + and × and down for −. *Nova*, a 0.25 s inhale (the wind-up), then a sub-bass drop and a crackling chain that spreads in stereo with the ripple. *Gravemaw*, a low brass drone and a distinct slam warning cue 1.2 s before impact.
- **Mix:** music ducks −6 dB during Nova and boss telegraphs. Full playability with sound off: every audio cue has a visual twin.

---

## 16. UX and FTUE: the first 10 minutes

Goal: the player experiences all three hooks (raise, gate, Nova) and a boss kill inside 4 minutes, before any shop or currency screen.

**Status:** the build has no separate tutorial run. The first Chapter 1 run (5 energy) doubles as the tutorial and shows five one-time hints. Each hint appears once per profile.

| Trigger (build) | Hint |
|---|---|
| First run, 1.5 s in, the player has not moved yet | "Drag anywhere to move. Your Shepherd attacks automatically." |
| First minion raised | "Slain foes rise to fight for you. This is your LEGION!" |
| First Soul Gate pair (0:28) | "Walk through a Soul Gate to grow your legion!" (with the banner "SOUL GATES: Walk through one to reshape your legion") |
| Nova meter first reaches 100% (after ~300 kills, around 2:30–3:00) | "Soul Nova is ready! Tap NOVA to detonate your legion." |
| The Rite is ready and 8 s have passed (it is ready from the start, so this is 0:08, once no other hint is showing) | "Your Rite is ready! Tap CALL to unleash Grave Call." (the hero's short name and Rite; hint key `rite`) |

The scripted beats below are **Planned**. Times are session times from app open (the planned tutorial run starts at 0:20). Where a beat uses run systems, the build's run time is given in brackets.

| Time | Beat | What the player does / sees | Telemetry event |
|---|---|---|---|
| 0:00 | Launch | Logo (2 s), loading in under 5 s on a mid-range device | `app_open` |
| 0:05 | Age gate (Planned) | Neutral birth-year wheel (no default age). Under-13 routes to restricted mode (see MONETIZATION §11). EEA/UK users see the consent dialog. | `age_gate_done` |
| 0:15 | Cold open (Planned) | 6 s in-engine shot: Vael rises among graves. "Raise the Legion." | `ftue_intro` |
| 0:20 | "The Waking" (Planned tutorial run, no energy cost) | Ghost thumb: "Drag anywhere to move." (Build: the move hint above, in a normal Ch1 run.) | `ftue_move` |
| 0:30 | First kill | Soul Bolt fires automatically. Husk dies. | `ftue_first_kill` |
| 0:35 | **Hook 1: Raise** | In the first run the first 5 kills always rise (build), and the raise hint fires. Planned caption: "The fallen rise for you." | `ftue_first_raise` |
| 0:50 | First level-up | 3 cards. Planned: Raise Dead is highlighted, but any pick is allowed. (Build: the first level needs only 7 XP, so it comes ~0:08 into the run.) | `ftue_levelup` |
| 1:20 | **Hook 2: Soul Gate** | Legion is about 12. Scripted pair: +5 vs ×2. After passing ×2, a caption explains the maths ("×2 turned 12 souls into 24"). A wrong pick gets no punishment. (Build: in the first run, the first pair after the legion reaches 10 is the scripted +5 vs ×2, sides random; earlier pairs are normal, usually two adds.) | `ftue_gate` (choice) |
| 1:45 | First elite | Gold Brute (Planned script). It drops a Relic Chest → free pick. (Build: an Elite Husk at 1:15; its chest opens a 1-of-3 pick.) | `ftue_elite` |
| 2:15 | **Hook 3: Soul Nova** | The meter charges 2.5× faster until the first Nova of the first run (build). Planned: a pulsing ring and finger point at NOVA. Screen wipe, slow-mo, legion count drops to 0 and starts climbing again. (Build: the meter fills after ~300 kills, around 2:30–3:00, and the Nova hint fires; 0.55 s slow-mo.) | `ftue_nova` |
| 2:40 | Second gate | ×2 vs ÷2, where ×2 sits behind a Bloater (Planned placement). Teaches risk. (Build: pairs at 1:08, 1:48 and 2:28 can offer ×2 vs −N or ÷2.) | `ftue_gate2` |
| 3:00 | Gravemaw (Planned tutorial boss at 3:00) | Planned: 25% HP, Phase 1 only. (Build: in the first run Gravemaw arrives at 6:00 with **60% HP (7,500)** and only phases I–II; the Crown of Cinders is held back for later runs.) | `ftue_boss` |
| 3:45 | Victory | Results: time, kills, peak legion, raised, level, gates, best kill streak (with its tier and the record) and rewards (a Ch1 first clear gives ~3,100 gold, 70 gems, 1 sigil and a relic). Planned line: "Your legion peaked at N." | `ftue_complete` |
| 4:00 | Home screen | Planned: only **Play** and **Talents** are lit; other tabs show locked silhouettes. (Build: every tab is open.) | `home_first` |
| 4:15 | First talent | Buy Might Lv1 (150 gold; new accounts start with 1,500 gold). Planned: guided. The gold sink is learned. | `talent_first` |
| 4:30 | Chapter 1 | Energy explained in one line (5 per run, refills over time). Planned: the first death in Chapter 1 gets a free revive with no ad. | `run_start` |
| 4:30–11:30 | First real run | Full 6:00 + boss. Most new players reach 3:30–5:30 on the first try. | `run_end` |
| After run 1 | Unlocks (Planned) | Soul Altar unlocks with a **gift relic** (a labelled gift, not a fake summon; the FTUE never stages an Altar result). Daily quests unlock. (Build: the Altar and quests are open from the start, with 150 gems and 1 sigil.) | `altar_unlock` |

**Later gates (Planned):** the 7-day login appears at the start of session 2. The Starter Pack is first shown after the player's first Chapter 1 boss kill, and never during the tutorial. Its 48 h timer starts at first display and is real. Rewarded-ad placements first appear in run 2. On iOS the ATT prompt is preceded by a one-screen explanation and shown before the first ad, never at cold start. *(Build: the login calendar and rewarded ads are available from the first session, and the Starter Pack's 48 h timer starts at account creation.)*

---

## 17. Accessibility

*Status: the build has music and SFX volume, mute, a haptics toggle, a quality setting (auto / low / mid / high), a 30 FPS battery saver, and an Accessibility section in Settings: a screen-shake slider (0–100%, which also scales hit-stop; 0% turns it off), **Reduce flashes** (full-screen flashes capped at 20%, whiteouts at 15%, chromatic aberration at 25%), **Auto-Nova** (fires at 100% charge when the legion is 50 or more) and a **Left-handed** mode that mirrors the NOVA and RITE buttons and the skill bar. Rite effects respect Reduce flashes and the shake slider, and their haptics follow the haptics toggle. Everything else in this table is Planned.*

| Area | Feature |
|---|---|
| Vision | Colourblind modes (protan / deutan / tritan) that remap enemy warm colours while keeping shape cues. Elites always carry a crown marker; Bloaters always show a pulsing ring. **High-contrast outlines** toggle. UI text scale 90–150%. |
| Photosensitivity | **Reduce flashes**: Nova and boss flashes capped at 3 Hz with luminance limits, bloom reduced. Screen shake slider (0–100%). A separate hit-stop toggle (in the build, hit-stop follows the shake slider). |
| Motor | One-thumb by design. Left-handed mode mirrors the NOVA button. Adjustable joystick size and dead zone. **Auto-Nova** option (fires at 100% when legion ≥ 50). Pause anywhere. No timing-critical taps outside movement. |
| Hearing | Every audio cue has a visual twin. Subtitles for all VO. Separate volume sliders for music, SFX and UI. |
| Cognitive | Gate maths preview toggle ("shows result: 37 → 74"). Telegraphs are never under 1.0 s (the build's Bloater fuse and enraged slam sit exactly at 1.0 s). A tutorial replay and a short skills glossary in pause. |
| Performance comfort | 30 / 60 fps choice, battery saver mode, reduced-particles mode. |

---

## 18. Open design questions (to resolve in alpha)

1. The build's Raise Chance cap is 85% (base 25%). Is that too high for Chapter 5 challenge? Test 60% vs 85%.
2. **Resolved: overflow.** Overflow minions now fade: a 15 s grace (restarted by every gate that adds souls), then 2% of the excess per second (§4.3). A big gate still pays for a Nova, but 400 souls can no longer be banked forever.
3. Every weapon now has one evolution. Do second recipes (a weapon + a different passive) ship in Season 2?
4. Auto-Nova (Planned) could reduce the skill expression of Nova timing. Monitor Nova-timing win rates for players who use it.
5. **Resolved: boss HP.** Gravemaw is now a three-phase fight with 12,500 base HP, a phase floor and a Nova cap (§6). A Chapter 1 fight with a typical build lasts about 55–60 s (median), and per-chapter tuning keeps Ch2–5 at about 50–75 s. The old single-phase King died in a median 22 s, sometimes to one Nova.
6. **Resolved: Soul Pass pacing.** XP per tier is now 500 (was 100), so 30 tiers take 15,000 XP. A player who does all quests and 3 runs a day finishes in about 3 weeks; a casual player (quests plus 1 run) reaches roughly tier 15–20 (§2).
7. **Resolved: Nova frequency.** A full charge now takes 300 kills (was 140), about 6–7 Novas per Chapter 1 clear instead of ~14 (§4.4).
