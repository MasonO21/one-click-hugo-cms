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
| Run | Floating joystick (plus WASD), auto-firing weapons, Raise Chance minions in 7 variants plus Champions (§4.2), legion up to 400 with the overflow fade (§4.3), Soul Gates (+N / ×2 / ×3 / −N / ÷2), Soul Nova with its wind-up (§4.4), kill streaks and Soul Frenzy (§4.7), hit-stop, the level-up pulse, swarm rings, Ghoul packs, Brute slams, Witch lobs, Grave Wraith dives and Corpse Priest raisings, chapter modifiers and hazards (§5, §8), 4 elites (8 in Ch5) with 1-of-3 Relic Chests and elite affixes (Warded, Splitter, Vampiric, Hasted, Commander; §5.1), mid-run events (Soul Thief, Shrine of Souls with 60 s blessings, Cursed Coffin; §4.8), gate guards and soul bursts, five chapter bosses (Gravemaw, Pyrexa, Vaulkar, Azrathel, Vesperine: a sealed arena, three phases, ring slams, gap rings, spiral, a soft enrage, and a chapter twist and signature attack each; §6), level-up cards with 1 ad reroll and 2 banishes (§4.6), 9 weapon evolutions, revive (ad or 60 gems; Mordrake gets 1 free), **Hero Rites**: one signature active ability per hero on its own RITE button (§11.1), **the beginner tutorial run "The Waking"** with its coach (§16), accessibility settings (§17) | Adaptive music stems (§15), the remaining accessibility options (§17) |
| Content | 5 chapters, each with its own boss (§6), plus Endless Abyss, **Nightmare and Torment difficulties** for every chapter (§8.2), 7 enemy types plus elites (the Grave Wraith and the Corpse Priest joined on 2026-10-09, §5), 9 weapons, 10 passives, 9 evolutions (Gravefall, Soul Leech, Grave Ward and Dread Reach joined on 2026-10-10, §7), 7 heroes (1★–5★) each with a Rite (Grimsby Lanternjaw and Osric the Bone Abbot joined on 2026-10-08, §11), 8 relic types × 4 rarities, 6 talents, painted chapter art on the home chapter card, the run intro card and the results header (§8) | Endless leaderboards, further heroes (`LIVEOPS.md`) |
| Meta and economy | **The Bestiary** (§5.2: 13 painted entries, kills per foe and boss, 39 one-time milestones), Soul Altar (disclosed odds, 60-pull pity, 10-pull Epic guarantee, free daily summon), Soul Pass Season I (30 tiers), 6 rotating daily quests, 7-day login, the Daily Trial (§8.1), energy, all 9 SKUs (simulated), gem shop, Soul Pact, Starter Pack, daily free chest, rewarded-ad placements, account level | Talent level cap by chapters cleared, quest all-clear bonus, weekly quest chest, pass catch-up tiers, Pact grace days, daily ad caps, Relic Ascension, server-side economy and cloud save (`PRODUCTION_ROADMAP.md`) |
| Live ops and social | Blood Moon weekends, weekly quest chest, **Boss Rush** (the weekly Hollow Court, §8.3), the **share card** (§10.1) | Boss Rush leaderboard, holiday events, leaderboards and leagues, Covens (clans), Legion Raids, replay clips, a store link on the share card |

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
| Run | 6–9 min | Clear the chapter (survive 6:00, slay the chapter's boss) | Level-up cards, Soul Gates, elites, Nova, boss | Gold, gems, pass XP, quest progress, first-clear bonus |
| Meta | Days to months | Get strong enough for the next chapter, then for Nightmare and Torment | Talents, relics, heroes and stars, Soul Altar, the Bestiary (§5.2) | Power, new chapters, Nightmare and Torment clears (§8.2), Endless Abyss depth record |
| Daily | 15–40 min/day | Finish quests, spend energy, beat the Daily Trial | 6 daily quests, 7-day login calendar, the Daily Trial (§8.1), rewarded ads, energy | Gems, gold, sigils, pass XP |
| Weekly | 7 days | Farm Blood Moon, fill the weekly chest (Planned: climb the leaderboard) | Blood Moon weekend, weekly quest chest (Planned: Endless Abyss weekly board) | Sigils, gems (Planned: league rewards) |
| Seasonal | 28 days | Finish the Soul Pass, collect the new hero | Soul Pass (30 tiers); Planned: monthly Boss Rush, new hero every 1–2 seasons | Skins, Epic/Legendary relics, hero shards |

**Moment-to-moment.** Move → weapons fire automatically at the nearest threat → an enemy dies → it drops a soul shard and has a *Raise Chance* to rise as a cyan minion → minions orbit you and hunt nearby enemies → more kills → more shards and more minions. The player's only job is positioning: kite, collect, pick gates, avoid telegraphs.

**Run.** 0:00–6:00 survival with rising density, 9 Soul Gate pairs (0:28, then every 40 s), 6 swarm rings, 4 elites (1:15, 2:30, 3:45, 4:50) each with an affix (§5.1), about 3 optional mid-run events (§4.8) and roughly 21 level-ups (about Lv22, §9), then the chapter's boss at 6:00 (§6). A full clear is 6:00 plus the boss fight. A failed run usually ends between 2:30 and 5:00.

**Daily.** Energy regenerates (+1 every 6 min, 30 max = 6 runs per full bar, 3 hours from empty to full). Quests are designed to be finished in 2–3 runs and reset at local midnight. Daily quests rotate: "Finish 2 runs" every day plus 5 drawn by date from a pool of 13: Slay 500 enemies · Raise 150 souls · Survive 4 minutes (in one run) · Unleash Soul Nova 3× · Pass 3 Soul Gates · Open 2 Relic Chests · Slay 3 elites · Lead a legion of 100, and after the first Chapter 1 clear (which also opens Nightmare on Chapter 1) also Evolve a weapon · Defeat a chapter boss · Clear the Daily Trial · Clear a chapter on Nightmare · Slay 5 elites on Nightmare (Torment counts for both). Rewards belong to the 5 slots (in order: 20 gems · 1,500 gold · 15 gems · 1,200 gold · 1 sigil, each with pass XP), so the daily value never changes.

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

**Time (daily resets).** Daily quests, the login calendar, the free chest and free summon, the Soul Pact tribute, the Daily Trial, the weekly chest, energy and every countdown run on trusted time (`src/meta/clock.js`). Online, the clock is set from a time server (`CLOCK` in `data.js`: the game's own endpoint once the backend exists, until then Cloudflare's trace and timeapi.io) at launch, on every resume and every 10 minutes, and runs on the device's monotonic timer in between, which changing the device clock cannot touch. Offline, it uses the device clock but never earlier than the last trusted time kept in the save. The reset day only moves forward, so winding the clock back re-grants nothing, and rewards claimed early after an offline wind-forward wait for real time to catch up. Days roll over at local midnight.

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
| **Pause** | Top-left, 36 px. Also auto-pauses when the app goes to the background. | The pause screen shows time, kills, legion size and the current build, plus a sound toggle and "Abandon run" (a defeat, except during the victory beat after the boss falls, which still wins the chapter). *(Planned: Nova charge on the pause screen.)* |
| **Back (Android) / Esc** | The hardware back button (Escape on desktop) acts on the top layer: it closes a dialog, skips or closes the Soul Altar reveal, pauses a run and resumes it, continues from the results, and steps the menu back to BATTLE. | From BATTLE it sends the app to the background (state kept). It never skips a level-up or shrine card, the revive prompt or an ad (`src/ui/back.js`). |
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
| 4:00–6:00 | Husks 40%, Ghouls 20%, Brutes 17%, Cinder Witches 13%, Bloaters 10%; density peak | Gate 4:28. **Elite Brute** and swarm ring (40) at 4:50. Gates 5:08, 5:48. Swarm ring 5:50 (40). Warning banner "THE HOLLOW KING APPROACHES" at 5:52 (each chapter names its own boss) |
| 6:00 | Normal spawns stop; a trickle of Husks and Ghouls continues (§6) | **The chapter boss** (Chapter 1: Gravemaw, the Hollow King; §6). Open gates vanish |

Normal spawns appear just off-screen; 45% of them are biased toward the player's movement direction.

From Chapter 2 the **Grave Wraith** joins the mix at 2:30 (weight 5% of the 2:00 row, 6% from 3:00, 7% from 4:00), and from Chapter 3 the **Corpse Priest** at 3:00 (3%). Each also has an alive cap (14 Wraiths, 3 Priests); at the cap, or before its chapter and minute, its weight is zero and the others share the picks. Chapter 1 is unchanged.

### 4.2 The Legion (Raise Chance and minions)

- **Raise Chance** is in percentage points (pp). Base 25%. Sources: Vael +10 pp, the Raise Dead skill (+6 pp per level), the Necromancy talent (+1 pp per level), the Lantern of the Lost relic (+3 to +18 pp, more with relic levels). **Hard cap 85%.** Raise Chance is halved while a Soul Nova is detonating, except for kills by Seraphine's own Nova (×2 instead). During Vael's **Grave Call** (§11.1) every kill rises (100%).
- Every kill rolls Raise Chance, whether the Shepherd, a minion, the Nova or a Bloater blast made the kill. Elites can be raised. The Bloater that explodes does not rise, and a chapter boss cannot be raised (killing one adds 30 minions instead).
- **Legion cap:** base 30. Flat bonuses: the Legion Cap skill (+10 per level, +50 at Lv5), the Dominion talent (+2 per level, +40 at L20), the Bone Idol relic (+3 to +18, up to +42 at Legendary Lv10). Mordrake multiplies the total by 1.25, then it is rounded. **Technical hard ceiling: 400 minions** on every device, for performance and leaderboard fairness.
- Kills only roll while the legion is below the cap. A successful roll **at** the cap heals the weakest minion by 50% of its max HP instead.
- **Overflow:** gates (and a boss's death) can push the legion above the cap, up to 400. The excess does not stay forever: after a grace period it dissolves gently (§4.3), so a big gate is something to spend, ideally on a Nova.
- **Soul Frenzy** (§4.7) shortens every minion's attack interval while it runs (+10% to +50% attack speed by tier).
- **Minion variants:** every kill rises as **its own kind**, recoloured in the hero's legion colour. Base stats (Level = the Shepherd's in-run level, c = chapter):

| Stat | Base value |
|---|---|
| HP | 34 × (1 + 0.08(level − 1)) × (1 + 0.4(c − 1)) |
| Damage per hit | 7 × hero damage multiplier (stars, Might talent, Crown of Thorns) × Nyx 1.2 × (1 + 0.2 × Minion Fury level) × (1 + 0.04(level − 1)) × (1 + 0.45(c − 1)), ±15% per hit. The in-run Might skill does not apply. No crits. |
| Speed | 9.5 m/s (Nyx +20%); 15% faster while returning to formation |
| Damage taken | Each melee hit costs the minion 30% of its target's contact damage (50% against a chapter boss). Boss slams kill every minion in the slam radius. Bloater blasts deal 60. |

| Raised from | Minion | HP | Damage | Attack | Speed | Special |
|---|---|---|---|---|---|---|
| Husk (and gate / boss souls) | **Shade** (the soul wisp) | ×1 | ×1 | 0.5 s | ×1 | — |
| Ghoul | **Wisp Runner** | ×0.55 | ×0.75 | 0.32 s | ×1.3 | Hunts 3 m farther out |
| Brute | **Bulwark** | ×3 | ×1.0 | 1.1 s | ×0.7 | **Taunts**: enemies within 3 m attack it instead of the Shepherd (Bloaters, Grave Wraiths and Corpse Priests ignore taunts). A bodyguard: it guards a 2.3 m ring and only fights foes within 5 m of the Shepherd |
| Cinder Witch | **Soul Witch** | ×0.8 | ×1.1 per orb | 1.1 s | ×0.9 | Ranged: a homing soul orb (12 m/s) at targets within 6 m, holding 4 m away |
| Bloater | **Soul Bomb** | ×0.7 | 6 × minion damage in 2.4 m, once | — | ×1.15 | Dives into the densest cluster within 8 m (3+ foes; any after 5 s idle; elites and bosses weigh double), flashes 0.25 s, detonates and leaves the legion. Its kills roll raises |
| Grave Wraith | **Phantom** | ×0.5 | ×1.05 | 0.42 s | ×1.35 | Takes **no recoil** from its own blows; hunts 1 m farther out and roams 2 m farther from the Shepherd |
| Corpse Priest | **Soul Priest** | ×1.2 | ×0.5 | 1.0 s | ×0.8 | Every 3 s it **mends** every minion within 4 m (itself included) by 12% of max HP (18% as a Champion); stays 2 m nearer the Shepherd |
| Any elite | **Champion** of its kind | ×3 more | ×2 more | — | — | ×1.35 size, gold rim and crown spark |

- **AI:** idle minions orbit the player in up to 5 rings of 12 (radii 1.7 / 2.45 / 3.2 / 3.95 / 4.7 m, alternating direction). Every 0.25–0.45 s an idle minion looks for the nearest enemy within 6.5 m of itself that is inside the 9 m leash around the player. It drops the target when it dies or moves more than 12 m from the player. At most 24 minions engage the boss at once; the rest fight adds or orbit. Minions never target a Grave Wraith (§5).

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
- Maxing everything takes 73 picks (19 weapon upgrades, 50 passive levels, 4 evolutions, one per owned weapon). With 4 Relic Chests per run that is about 69 level-ups (player Lv70). A Chapter 1 clear reaches about Lv22, so builds involve real trade-offs.
- **Banish:** 2 per run (none in the tutorial). Each weapon or passive card carries a small ✕; tapping it strikes that skill from the run's draws for good and replaces the card in place with a fresh draw that is never one of the other cards on the table. Evolution and bonus cards can't be banished, Shrine of Souls blessings neither. A line under the cards counts the banishes left. It lets a player steer a build toward an evolution without spending the ad reroll (`skills.js` `banish`).
- When nothing is left to upgrade, the cards are "Second Wind" (heal 50% HP) and "Grave Gold" (+150 gold this run).
- 1 reroll per run, through an optional rewarded ad. No other ads inside a run except the revive offer on death.
- **Revive:** one paid revive per run (rewarded ad or 60 gems), offered for 10 s on the death screen. It restores full HP, gives 2.5 s of invulnerability and blasts every enemy within 8 m for 50% of its max HP. Mordrake's free revive triggers automatically on his first death and does not use up the paid one.
- **The boss falls while the Shepherd is down** (the legion finishes it in the 1.1 s before the death screen): there is no revive prompt; the victory beat plays out and the chapter is won. Once it has fallen, nothing can hurt the Shepherd.

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

**Hit-stop.** A brief freeze sells the big hits: 75 ms on an elite kill, 90 ms on a boss phase change, 65 ms on a ×2 or ×3 gate, and 80 ms when the Nova blast fires.
- The game slows to 4% speed, easing back over the last third.
- It multiplies any slow motion that is running instead of replacing it.
- Real-time timers keep running: the HUD, banners, the death and victory beats, and the streak's fade-out.
- It is a motion effect, so it scales with the screen-shake slider; at 0% there is no hit-stop (§17).

### 4.8 Run events

Optional side objectives that add a decision between the scripted beats. Numbers live in `RUN_EVENTS` and `BLESSINGS` (`data.js`); the logic is in `events.js`.

- **Schedule:** one event at a time. The first comes at 1:02–1:20, then one every 80–110 s, only between 1:00 and 5:20, so a campaign run sees about 3 (measured: 1:23, 2:55 and 4:16 in one Chapter 1 run). Endless keeps rolling them, waiting 25 s after each boss kill.
- **Spacing:** never within 8 s of a gate pair or an elite, 5 s of a swarm ring, or 40 s of the boss's arrival, and never during its fight. If the boss arrives anyway, the event lapses quietly (a pending coffin reward pays out at once). A first run gets none before 2:30.
- **Placement:** 12 m from the Shepherd, ahead of him when possible. The spot must be at least 2.6 m clear of ember vents, ice patches, burning ground, a pending abyssal grab and a standing gate pair. With no clear spot, it retries 2 s later.
- **Presentation:** a banner announces each event. While it is off screen, an arrow on the screen edge (kept clear of the HUD) points at it, with its distance. Each event is optional: ignored, it lapses.
- **Counters:** `counters.events` counts events completed (thief slain, blessing taken, coffin cleared), and the run result carries it as `events`. A slain Soul Thief also counts in the Bestiary (`counters.byType.thief`, §5.2).

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
| **Grave Wraith** | Phantom | 16 | 3.2 | 7 per touch | 2 | From Chapter 2 at 2:30, at most 14 alive. **Passes through the legion**: minions never target it, their blows and Soul Bombs pass through it, and it ignores taunts, so it never fights the legion either. Drifts in on a slow weave, then within 5 m **dives** at ×1.55 speed (about 5 m/s), swinging from side to side. | Only the Shepherd's own damage harms it: weapons, the Nova, Rites, gate bursts and Bloater blasts. Skull Halo, the Scythe and Grave Pulse meet the dive; Soul Bolts and Ashen Chains home in. |
| **Corpse Priest** | Necromancer | 45 | 2.1 | 8 per touch | 4 | From Chapter 3 at 3:00, at most 3 alive. Holds 10 m off, backs away inside 7 m and ignores taunts. Every 6 s (±20%) it claims up to 3 of the horde's dead within 7 m (the newest first; below), marks each grave with a crimson circle and **chants** for 1.2 s: soul threads stream to it and it glows. Then the dead rise as **hollow Husks**, which drop no soul shard and leave no corpse. A stun, a fear or its death breaks the chant and frees the graves. | Kill it first: Bone Spears, Soul Bolts and Ashen Chains reach it, and the Lv4 chain's pin breaks a chant. A higher Raise Chance leaves it fewer dead to raise. |
| **Elite** (any type) | Gold variant | ×6 | ×0.9 | ×1.5 | ×12 | Gold #ffd04a glow, ×1.35 scale, ×3 mass, and a floating gold **crown** marker. Rolls 1–2 affixes (§5.1). Can be raised. | Drops a **Relic Chest**. |
| **The chapter boss** (Gravemaw, Pyrexa, Vaulkar, Azrathel, Vesperine) | Boss | 12,500 | 2.3 | 22 per touch, see §6 | — | Appears at 6:00. Killing it clears the chapter. | See §6. |

**The dead.** Every kill that does not rise as a minion leaves a corpse for the Corpse Priests: kept 10 s, the newest 48 at most (`run.corpses`). A Priest, the Husks it raised and event foes leave none, and a raised corpse is used up.

**Balance check (Update 5, 2026-10-09).** The balance bot played five heroes 4 times each on Chapters 2 and 4 (average survival, before → after): Vael 331 → 336 s, Mordrake 347 → 373, Osric 321 → 360, Liora 278 → 297, Grimsby 308 → 283. The new foes take a share of the mix from Brutes and Witches rather than adding to it, so the horde is no harder overall. Grimsby's drop is on Chapter 2 only; an A/B with the Wraiths switched off measured 262 s against 271 s with them (8 runs each way), so it is run-to-run spread (about ±60 s a run), not the Wraiths.

Enemy colour code: warm ember/crimson (#ff4a2a, #ff8a3d), the Grave Wraith pale violet (#c8b6ff), the Corpse Priest's necromancy crimson (#ff2e4a), elites gold (#ffd04a), each boss in its own colour (Gravemaw magenta #ff3df0, Pyrexa ember #ff7a1a, Vaulkar ice #8f9cff, Azrathel violet #b070ff, Vesperine crimson #ff2e55), which its bar, banner and telegraphs share. Every enemy has an emissive core so it reads against the dark ground.

### 5.1 Elite affixes

Every elite the director raises rolls **1 affix**, or **2 from Chapter 4 and in Endless**, plus `run.diff.eliteAffixes` when a difficulty sets it. A first run rolls only Warded or Hasted.
- **Announcement:** the ELITE banner names them (e.g. "WARDED BRUTE", "VAMPIRIC HASTED CINDER WITCH") and says what each does. A small tag in each affix's colour floats over the elite, with a thin gauge under it while a ward holds.
- **Rewards:** affixed elites still drop their Relic Chest, plus **+40 bonus gold per affix**.
- **Champions:** an elite raised as a Champion carries no affix.
- **Boss fight:** boss-time adds never roll affixes. An affixed elite that is still alive when the boss arrives keeps its affixes.

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

### 5.2 The Bestiary

A collection screen that turns the horde into long-term goals with painted rewards: the **BESTIARY** sub-tab of the Heroes screen, beside Heroes, Relics and Talents. Numbers live in `BESTIARY` (`data.js`), the rules in `src/meta/bestiary.js` (claims in `economy.claimBestiary`), the screen in `src/ui/meta/bestiary.js`.

- **Entries:** Husk, Ghoul, Brute, Cinder Witch, Bloater, Grave Wraith, Corpse Priest, the Soul Thief (§4.8) and the five chapter bosses (Gravemaw, Pyrexa, Vaulkar, Azrathel, Vesperine; wide cards across the row). Each has its painting (3:4, `src/assets/art/foe-*.webp`), its name and role, a line of lore, a "How it fights" line and its kill count. A summary panel counts entries discovered, milestones claimed and foes slain.
- **Locked:** until its first kill an entry shows a dark, cold silhouette of its painting under a "?", named "???" and "Undiscovered". Its milestones are already listed, so the goal is visible.
- **What counts:** every kill of a type, whoever lands it (the Shepherd, the legion, the Nova, gate bursts, Bloater blasts). Gilded elites count as their base type, and so do Splitter copies, gate guards, coffin waves and the bosses' arena adds. A slain Soul Thief counts as a Soul Thief; a broken Cursed Coffin never counts. Each boss counts for itself, once per campaign victory over it (also when the legion fells it while the Shepherd is down) and once per Endless kill. Daily Trial runs count too.
- **How it is tracked:** the run keeps `run.counters.byType` (one integer increment per kill, no allocation; the Soul Thief in `events.js`, the bosses in `Run.onBossKilled`). The run result carries a copy as `byType`, and `applyRunResult` adds it to `profile.bestiary.kills`, ignoring unknown ids and junk values.
- **Milestones:** three per entry, claimed in order with a button on the entry's sheet, each once. The Heroes tab, the BESTIARY sub-tab and the card show a red dot while one waits.

| Milestone | I | II | III |
|---|---|---|---|
| Husk, Ghoul, Brute, Cinder Witch, Bloater, Grave Wraith | 100 kills | 1,000 | 10,000 |
| Corpse Priest | 50 | 500 | 3,000 |
| Soul Thief, the five chapter bosses | 1 | 10 | 50 |
| Reward | 2,000 gold | 1 Altar Sigil | 50 gems |

All 39 milestones pay 26,000 gold, 13 sigils and 650 gems, once per account (budget check in `MONETIZATION.md` §2.6).

- **Pacing:** a bot's Chapter 1 clear (2,511 kills) slew 1,335 Husks, 526 Ghouls, 252 Brutes, 207 Cinder Witches and 191 Bloaters (53 / 21 / 10 / 8 / 8%). Later chapters spawn more and tilt the mix (Ember Wastes ×1.8 Witches, Abyssal Cathedral ×2 Bloaters, Crimson Throne ×1.6 Brutes). For a daily player (about 3 runs, ~1,800 kills a run):
  - for the five horde foes, tier I lands in the first run or two (Witches and Bloaters join the horde at 2:00, Brutes at 3:00) and tier II within one to three days;
  - tier III takes about 4 days for Husks, about 10 for Ghouls and 3–4 weeks for Brutes, Witches and Bloaters;
  - the Grave Wraith (Chapter 2 on, about 5–7% of the horde after 2:30) and the Corpse Priest (Chapter 3 on, at most 3 alive, so it has its own lower goals) start once those chapters open, and their tier III takes a month or more of daily play;
  - about one Soul Thief shows up per run (one event in three), so if most are caught its 50 take about a month; each boss's 50 are 50 kills of it: clears of its chapter (on any difficulty) or, every fifth boss, in the Endless Abyss. The bosses therefore pay out last: tier I with each chapter's first clear, tier II after ten clears, tier III over months.
  The last gems therefore arrive about a month in, and the Bestiary keeps paying out across the first season instead of in one day.
- **Old saves:** the block is added with zeros (and saves from before the chapter bosses gain their four entries at zero, from before Update 5 the Grave Wraith and the Corpse Priest). Gravemaw starts at the save's clear count, since before the chapter bosses every clear slew him, so a veteran opens the Bestiary with the Hollow King unlocked and his first milestones waiting. Wrong types and out-of-range values are coerced (`save.js`).
- **Quests:** no Bestiary line joins the daily or weekly pool. "Slay 500 enemies" already rewards the same play, and a per-type quest ("Slay 50 Bloaters") would push players to farm one foe instead of playing the run.

---

## 6. The chapter bosses

Each chapter ends with its own boss. All five fight the same three-phase fight in a sealed arena, with the same stats and the same shared attacks, and each adds a **twist** on those attacks and a **signature attack** of its own. All numbers live in `BOSS`, `BOSSES` and `BOSS_PHASES` (`data.js`), the fight in `boss.js`. Damage values are × the boss's touch damage. Below, "he" is any boss.

| Ch | Boss | Colour | Twist on the shared attacks | Signature attack (phase weights I / II / III) | Phases |
|---|---|---|---|---|---|
| 1 | **Gravemaw, the Hollow King** | magenta | — | Summon (0.25 / – / –) | Hollow Tread · Ember Liturgy · Crown of Cinders |
| 2 | **Pyrexa, the Cinder Matron** | ember | Each slam ring leaves a burning band for 3 s | Cinder Rain (0.25 / 0.25 / 0.2) | Smoulder · Firestorm · Pyre Eternal |
| 3 | **Vaulkar, the Ossuary Colossus** | ice blue | Each slam ring leaves 4 / 7 / 10 frost shards (0.75 m, 3.5 s) | Glacier Lances (0.25 / 0.25 / 0.2) | Bone Tremor · White Silence · Absolute Zero |
| 4 | **Azrathel, the Fallen Seraph** | violet | One extra wave in every ring volley | Smite (0.25 / 0.25 / 0.2) | Fallen Grace · Unholy Hymn · Last Judgement |
| 5 | **Vesperine, the Crimson Queen** | crimson | Phase III starts at 50% | Blood Lances (0.25 / 0.25 / 0.2) | Court of Blood · Crimson Waltz · Blood Eclipse |

- **Look and voice:** each has a painted 3D model (`ART_AND_ADS.md` §6), a painted portrait on its phase banners and Bestiary card, its colour on the boss bar, banners and telegraphs (danger marks lean toward crimson so they read against its own glow), its name and title on the bar ("Pyrexa, the Cinder Matron"), its own warning ("THE CINDER MATRON APPROACHES"), a roar pitched to its size, its own enrage name (Hollow Dirge, Inferno, Deep Freeze, Divine Wrath, Bloodlust) and three announcer lines (arrival, Endless return, death).
- **Why one frame:** the stats and the phase frame are balanced and tested; five separate fights would split that tuning five ways. The twist changes how the shared attacks are dodged and the signature adds a new problem, so each chapter's finale reads differently while the fight length stays on target.

**HP and damage.** HP = 12,500 × chapter HP mult × (1 + 0.05(c−1)) × chapter tune × Endless scale × difficulty boss HP (§8.2). The tune factors (1, 0.8, 0.75, 1.15, 1.2) even the fight out at about a minute for a player with that chapter's typical progression. That gives **Ch1 12,500 · Ch2 19,950 · Ch3 33,000 · Ch4 82,656 · Ch5 135,000**; the first Endless King has 62,500. Damage = 22 × (1 + 0.3(c−1)) × √scale × difficulty boss damage (§8.2). Measured with typical progression (`scripts/balance.mjs`, `GOD=1`): Ch1 ≈ 54 s · Ch2 ≈ 51–60 s · Ch3 ≈ 70–76 s · Ch4 ≈ 64 s · Ch5 ≈ 68 s.

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
| **I** | 100–66% | Chase 2.3 m/s. Picks: slam 0.42 (within 13 m), ring 0.33, signature (table above); no attack repeats except the slam. |
| **II** | 66–33% | Chase ×1.15, attack rate ×1.25, slam telegraph 1.1 s, orbs ×1.1 speed. Picks: slam 0.4, rotating gap rings 0.6, signature. |
| **III** | 33–0% (Vesperine 50–0%) | Enraged: chase ×1.35, attack rate ×1.35, slam telegraph 1.0 s, orbs ×1.2. Picks: slam 0.3, rings 0.3, spiral 0.4, signature. The arena closes from 18 m to 12 m over 4 s. |

Each phase opens with a banner naming it, with a one-line hint (Pyrexa's second: "FIRESTORM", "Phase II · Weave between the falling cinders").

**Shared moves**
- **Grave Slam:** he leaps onto the Shepherd's spot after a 1.2 s telegraph (1.1 s in phase II, 1.0 s in III). Three concentric rings follow 0.3 s apart:
  - ring 1, on landing, is a disc out to 3.65 m;
  - the 6 m and 9 m rings are ±0.65 m bands, with dashed white guides marking the safe lanes between them;
  - each ring deals 1.4×;
  - the landing disc **kills every minion inside outright**, Champions included, and the outer bands deal 0.7 × 1.4× to minions;
  - recovery 1.9 s.
- **Ember Ring:** a 1.0 s fan telegraph, then 24 orbs with 2 opposite gaps (about 48° each) at 6 m/s, 0.6× each. Recovery 1.6 s.
- **Rotating gap rings (phase II and later):** 3 waves 0.5 s apart, each gap turned ±0.35 rad. The fan shows the next gap solid and later ones dashed.
- **Spiral (phase III):** a 1.0 s sigil shows the curl and spin direction. Then 4 arms for 2.5 s (one orb per arm every 0.09 s, 0.75 rad/s, 5.5 m/s, 0.55× each). The Shepherd starts between two arms.
- **Crown aura (phase III):** minions within 3.2 m take 1.5× damage per second, scaling from 12 crowding minions to full strength at 32, so a banked legion can't delete the last phase.

**Signature attacks** (counts are by phase I / II / III)
- **Summon (Gravemaw):** rune circles for 1.0 s, then 6 adds around him at 3.2 m (every 3rd a Ghoul). Recovery 1.4 s.
- **Cinder Rain (Pyrexa):** 5 / 7 / 9 fireballs lobbed 0.16 s apart onto marked circles (1.45 m): the first where the Shepherd will be in 0.35 s, the rest 1.6–5.5 m around him. Each lands 1.1 s after it leaves her hand, deals 0.6× and leaves the ground burning. Liora's Death Knell clears them in flight. Recovery 1.5 s.
- **Glacier Lances (Vaulkar):** 3 / 4 / 5 lanes fanned 0.42 rad apart, aimed at the Shepherd, each 6 frost shards from 2.2 m out, 1.25 m apart. Every spot is marked for 1.0 s plus 0.12 s per step outward (a ripple), then erupts into a 0.7 m shard that stands 2 s (0.5×). Recovery 1.4 s after the last.
- **Smite (Azrathel):** 3 / 4 / 5 pillars of light, 0.6 s apart, each aimed where the Shepherd will be in 0.45 s and marked for 1.1 s. A 2.1 m strike (+0.2 m grace) deals 1.1× to the Shepherd and 0.6 × 1.1× to minions inside. Recovery 1.5 s.
- **Blood Lances (Vesperine):** she raises her scepter over a cone toward the Shepherd for 1.0 s, then 2 / 3 / 3 fans of 7 blood orbs (0.95 rad, 8 m/s, 0.55×) fly down it 0.45 s apart; each fan fills the gaps of the last. Recovery 1.4 s.
- Every mark is withdrawn if a phase roar interrupts the attack, and every signature telegraph is at least 1.0 s.

**Fight rules**
- **Phase transitions:** a 2 s immune roar.
  - Enemy shots clear, with a 90 ms hit-stop, slow-mo 0.3× for 0.45 s and a flash.
  - The Shepherd is pushed back gently, and adds within 9 m are knocked back.
  - The phase banner shows his painted portrait. Unfinished telegraphs are withdrawn.
  - Minions that hit him while he's immune take no recoil.
- **Phase floor:** phase I lasts at least 18 s and phase II at least 14 s. Reach the tick sooner and he is held there (IMMUNE, white bar with a "WARD n" countdown) until the phase has played out, so a huge legion can't skip phases. Damage poured into the ward shortens it by 1 s per 5% of his max HP, so strong builds shatter it faster.
- **Soul Nova** and gate soul bursts hurt him at **50%, capped at 25% of max HP per Nova**. Damage numbers show what actually landed.
- **Soft enrage** (Hollow Dirge, Inferno, Deep Freeze, Divine Wrath, Bloodlust): 180 s after he spawns he gains +50% damage and attack rate, with a banner. Telegraphs never shorten.
- **Twists:** each boss brings its own (table above), in its chapter and in the Endless Abyss alike.
- **Accessibility floor:** no damaging telegraph is under 1.0 s in any chapter, phase or enrage state.
- **On his death:** every enemy is cleared, all shards fly to the player and 30 souls join the legion. In the campaign the chapter is cleared.

**Balance check (2026-10-08, `scripts/balance.mjs`, Vael, Normal, typical progression).** The bosses of Chapters 2–5 against the build before them, in which every chapter fought Gravemaw with its twist. The twists are the old chapter twists, so only the signature attacks are new, and they replace Gravemaw's summon in phase I and join phases II and III at about a fifth of the picks.

| Ch | Boss | Fight, before → after (`GOD=1`, s) | Damage taken in the run, before → after (`GOD=1`) |
|---|---|---|---|
| 2 | Pyrexa | 29 → 35 | 626 → 1,087 |
| 3 | Vaulkar | 36 → 29 | 1,441 → 854 |
| 4 | Azrathel | 44 → 32 | 1,203 → 718 |
| 5 | Vesperine | 38 → 34 | 1,505 → 764 |

Three runs per cell, so the spread is wide (one Ch2 run took 209 damage, another 1,126, on the same build). Fight length stays inside the old band and nothing points to a harder finale; the signatures trade the summon's adds (which fed the legion) for dodging, and the bot does not dodge. Without `GOD=1` (4 runs per chapter, 16 a side) the same 3 runs died in the boss fight on both builds, and the bot won 4 of the 7 fights it reached before and 5 of 8 after; most of its deaths come earlier, in the horde.

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

**Ashen Chains** (chain lightning: first target within 7.5 m, then jumps to the nearest new enemy within 4.5 m). Each link also **scorches** every other enemy within 1.4 m of its target for 50% damage. From Lv4 each chain **pins** its first foe for 0.25 s (a stun: no steering, no attack; a wind-up or a Corpse Priest's chant is broken; never the boss). A foe can be pinned at most once every 2 s, so the nearest Brute or Bloater is not held off its slam or fuse forever by a chain that fires every second. At Lv5 a second chain starts from the nearest foe the first did not strike, and the two never share a link. Seraphine's signature weapon.

| Stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Damage per hit | 18 | 23 | 29 | 37 | 44 |
| Chains per cast | 1 | 1 | 1 | 1 | 2 |
| Targets per chain | 3 | 4 | 5 | 6 | 5 |
| Pin on the first foe (s) | – | – | – | 0.25 | 0.25 |
| Cooldown (s) | 1.50 | 1.40 | 1.25 | 1.10 | 0.95 |

**Bone Spears** (piercing lances aimed at the nearest enemy within 13 m, in a fan 0.2 rad ≈ 11° apart; 21 m/s, about 20 m reach). Mordrake's signature weapon.

| Stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Damage | 24 | 30 | 37 | 46 | 58 |
| Spears | 1 | 1 | 2 | 2 | 3 |
| Pierce | 3 | 4 | 5 | 6 | Unlimited |
| Cooldown (s) | 1.35 | 1.25 | 1.15 | 1.05 | 0.95 |

**Skull Halo** (orbiting skulls, always on, ~155°/s; each enemy can be hit by the halo once every 0.35 s). Osric's signature weapon.

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
| Chill (speed, 1.5 s) | – | – | −25% | −25% | −30% |

The **chill** goes through the elites' shared slow (`affixes.js`): a stronger slow that is still running (a broken ward's stagger, a Commander's rout) is kept, and the boss and event creatures are never chilled. A chilled foe sheds a cold mote.

**Witchfire Lantern** (the Shepherd's lantern drips witchfire where he walks: a burning patch every 1.1 m walked, or one at his feet every 0.6 s standing still). A foe inside takes the patch's damage per second in ticks of 0.25 s, from the hottest patch it stands in only (overlapping patches never stack). From Lv3 he also hurls lanterns at the nearest foes (spread over the nearest few): each shatters after a 0.45 s arc, hits everything in its pool's radius once and leaves a burning pool that lasts 0.6 s longer than the trail. The souls of foes that witchfire kills fly to the Shepherd, because they die behind him, on the path he has already walked (without that, a kiting Grimsby left his XP behind and reached the boss several levels short). Grimsby's signature weapon; the patches are ground decals in the lantern's lime (`hazards.js`), simulated in `weapons.js`.

| Stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Burn per second | 14 | 18 | 24 | 28 | 37 |
| Trail patch radius (m) | 0.95 | 1.05 | 1.15 | 1.3 | 1.45 |
| Patch life (s) | 2.2 | 2.4 | 2.6 | 2.8 | 3.2 |
| Lanterns per throw | – | – | 1 | 1 | 2 |
| Lantern hit / pool radius (m) | – | – | 30 / 2.2 | 38 / 2.5 | 48 / 2.8 |
| Throw cooldown (s) | – | – | 2.4 | 2.2 | 2.0 |

**Gravefall** (tombstones crash onto the horde: each cast picks impact points on the densest packs within 11 m, scoring a sample of 18 foes by how many others stand within the impact radius, elites ×3 and the boss ×6, spread at least the radius apart, and aimed a little ahead of the foe). A stone falls for 0.55 s, a faint ring of pale-blue motes tightening on its landing spot, then hits everything in its radius once with a heavy knockback, raises dust and stands 0.7 s before sinking. Radii scale with Dread Reach. It is the horde-crowd weapon; `arsenal.js`.

| Stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Damage | 26 | 32 | 40 | 50 | 58 |
| Tombstones per cast | 1 | 2 | 2 | 3 | 4 |
| Impact radius (m) | 1.6 | 1.7 | 1.9 | 2.1 | 2.3 |
| Cooldown (s) | 2.4 | 2.2 | 2.0 | 1.8 | 1.6 |

**Soul Leech** (drain beams from the Shepherd's staff, always on). Each beam locks onto the toughest foe in range that no other beam holds (the boss, then elites, then the most HP) and **holds it** until it falls or slips more than 1 m out of range. Every 0.6 s a beam on a common foe jumps to a boss or an unheld elite in reach, and every beam may take the boss. It drains in ticks of 0.2 s and also **sears** every foe it passes through (within 0.6 m of the beam, each once a tick) for 40% of its damage. The Shepherd heals a share of all the damage, at most 3 HP a second (a bank that refills at that rate); the trickle shows as one number a second. A drained foe glows faintly instead of flashing white. Numbers show about once a second per beam (crits always). The elite and boss killer, and the only weapon that heals; `arsenal.js`.

| Stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| Damage per second (each beam) | 45 | 58 | 72 | 90 | 115 |
| Beams | 1 | 1 | 2 | 2 | 3 |
| Range (m) | 6 | 6.5 | 7 | 7.5 | 8 |
| Heals (share of damage, max 3 HP/s) | 4% | 4% | 5% | 5% | 6% |

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
| Grave Ward (damage taken; after Osric's Bone Mass ward) | −6% | −12% | −18% | −24% | −30% |
| Dread Reach (weapon area: Scythe, Skull Halo, Grave Pulse and Requiem, Witchfire, Gravefall and Necropolis's graves) | +10% | +20% | +30% | +40% | +50% |

### 7.3 Evolutions

All nine evolutions are in the build, one per weapon. An evolution card enters the pool when the weapon is Lv5 **and** the paired passive is owned (any level). With weight 1,000 it is almost always the next card offered, at a level-up or from a Relic Chest. The weapon keeps its slot and is upgraded in place.

| Evolution | Recipe | Effect |
|---|---|---|
| **Soul Storm** | Soul Bolt Lv5 + Might | 6 bolts per volley (Lv5 cooldown), 44 damage, pierce 4. Each hit explodes for 60% damage in a 1.5 m radius. A bolt that kills **splits** into 2 mini-bolts (50% of its damage, no blast, drawn at 60% size) that home on the nearest foes within 8 m; they never split again. |
| **Bone Crown** | Skull Halo Lv5 + Minion Fury | 8 skulls, 26 damage, 3.2 m radius, always on. Every skull kill raises a soul (while below the cap). Its **aura**: minions within 6 m of the Shepherd strike +30% (blows and Soul Witch orbs), and every 4 s a ring of skull-fire mends every minion within 6 m by 20% of max HP. |
| **Harvest Moon** | Spectral Scythe Lv5 + Haste | The sweep becomes 3 sweeps of 46 damage every 0.9 s at the Lv5 reach (3.7 m). Two crescent blades also orbit at that reach (5.2 rad/s), dealing 58 per hit in a 1.3 m radius, each enemy at most once per 0.3 s, knocking foes along the spin. Every scythe kill heals 1 HP from a bank that refills at 6 HP/s (cap 6). |
| **Chains of Perdition** | Ashen Chains Lv5 + Frenzy | Two chains of 7 links of 50 damage, each pinning its first foe 0.25 s; links prefer targets at least 1.6 m apart and no closer to the Shepherd, so the chain lashes outward. Each link scorches within 1.7 m for 50%. Targets burn for 40% of the hit over 2 s (ticks every 0.25 s; re-hits add to the pool and refresh the timer). Kills while burning get **+25 pp Raise Chance** (still capped at 85%). |
| **Ossuary Barrage** | Bone Spears Lv5 + Vitality | A fan of 5 spears (0.2 rad apart), 56 damage, unlimited pierce. Each flies 3.5 m past its target (5–16 m; odd spears 1.2 m further) and bursts into bone shrapnel: 55% damage in 2 m with knockback. |
| **Hallow Pyre** | Witchfire Lantern Lv5 + Raise Dead | A river of witchfire: trail patches 1.75 m wide that burn 52 a second for 3.6 s, and 3 lanterns every 1.8 s (62 on the shatter, 3 m pools). A foe slain by witchfire bursts into a new 1.6 m patch that burns for 1.4 s, so the fire spreads through a packed horde (at most 8 bursts a second). |
| **Necropolis** | Gravefall Lv5 + Legion Cap | Six tombstones every 1.4 s, 70 damage, 2.6 m. They **stand as graves** for 3 s, glowing; a foe slain within 3 m of a standing grave gets **+40 pp Raise Chance** (still capped at 85%). |
| **Vampiric Communion** | Soul Leech Lv5 + Grave Ward | Four beams of 165 damage a second (8.5 m), each **forking** from its target to the nearest other foe within 3 m for 60%. Heals 8% of the damage, at most 6 HP a second; while the Shepherd is at full HP the stolen life **mends his three most wounded minions** instead (every 0.5 s). |
| **Requiem** | Grave Pulse Lv5 + Soul Magnet | Every 1.4 s: a 0.3 s drag pulls enemies inward (70 m/s², with a swirl; never the boss), then a 48-damage blast in 6.5 m with strong knockback that chills (−30% speed for 1.5 s). Each blast also pulls every soul shard within 12 m to the Shepherd. |

Measured in a dense, continuous horde (Ch1 minute-4 mix at ×8 HP, 22 enemies/s, the Shepherd kiting, no legion), effective DPS at Lv5 → evolved: Soul Bolt 1,780 → 4,390 · Skull Halo 2,100 → 2,560 (its payoff is the raises) · Scythe 3,130 → 4,020 · Chains 2,640 → 3,700 · Spears 2,680 → 3,360 · Grave Pulse 1,840–2,030 → 2,610–2,660 (bench-to-bench spread is about ±5%).

Update 5 (2026-10-09) added the Lv4 pin and the Lv5 twin chain, the pulse's chill, Soul Storm's split and the Bone Crown's aura. On the same bench, before → after: Ashen Chains Lv5 2,590 → 2,640 (Perdition 3,590 → 3,700), Soul Bolt 1,730 → 1,780 (Soul Storm 4,350 → 4,390; in a horde this dense the volley already kills everything in reach, so the split shows most in thinner crowds), Grave Pulse 2,010 → 2,030. The chill pushed Requiem's DPS down (2,840 → 2,660; chilled foes reach the blast more slowly), so its blast went from 46 to 48 damage; it stays ×1.3–1.4 the Lv5 pulse, and the chill is the payoff. The Bone Crown's aura works on the legion, which this bench leaves out.

Update 6 (2026-10-10) added Gravefall and Soul Leech on the same bench: Gravefall Lv5 3,080 → Necropolis 3,920 (the crowd weapon, beside the Scythe; Necropolis's raises come on top, with a legion), Soul Leech Lv5 1,710–1,920 (beside Soul Bolt, the other focused weapon, plus its healing and elite and boss focus) → Vampiric Communion 2,720 after its beams went from 135 to 165 a second. The first Soul Leech re-picked the freshest, toughest foe every 0.6 s and never finished one (250 DPS, no kills); its beams now hold their foe and sear what they cross.

**Balance check (Update 6).** With the four new skills in the card pool (the bot takes the first card it is offered, so they turn up at random), five heroes played 4 runs each on Chapters 2 and 4. Average survival, Update 5 → Update 6: Vael 336 → 368 s, Mordrake 373 → 380, Osric 360 → 336, Grimsby 283 → 326, Liora 297 → 323; across the five 330 → 347 s (+5%), inside the ±30 s spread of a 4-run mean. A wider pool lets more builds come together (Grave Ward and the leech's healing help most). Mordrake still leads, and no hero beats him by more than 5%. Boss kill times did not move (33–43 s).

---

## 8. Chapters and difficulty scaling

| # | Chapter | Palette | HP mult | Spawn mult | Modifier | Recommended talents |
|---|---|---|---|---|---|---|
| 1 | Ashen Necropolis | Teal / ember | 1.00 | 1.00 | None (teaching chapter) | 0 |
| 2 | Ember Wastes | Orange | 1.90 | 1.15 | Cinder Witch weight ×1.8; lobs leave burning ground; **ember vents** (15 m grid, 32% of cells, 1.6 m radius, a puff every 6.5–9 s after a 1.2 s telegraph, 12 base damage scaled like enemy damage) | ~8 levels total |
| 3 | Frozen Ossuary | Ice blue | 3.20 | 1.30 | Ghoul weight ×1.5, packs of 6–8; Corpse Priest weight ×1.6 (it joins here); **ice patches** (12 m grid, 50% of cells, radius 2.6–4.4 m): on ice the Shepherd accelerates at 30% of normal, stops with 20% of normal friction and gets +8% top speed | ~25 |
| 4 | Abyssal Cathedral | Violet | 5.00 | 1.45 | Bloater weight ×2; Grave Wraith weight ×1.6; vignette 1.25 and ground fog pulled in from 26 to 17 m; **abyssal hands** every 6–9 s aimed 0.6 s ahead (1.3 m, 1.0 s telegraph, 0.6 s root) | ~60 |
| 5 | Crimson Throne | Blood red | 7.50 | 1.60 | **8 elites** (45, 75, 110, 150, 185, 225, 255, 290 s); Brute weight ×1.6 | ~110 |
| ∞ | Endless Abyss | Shifting | 4.00 (flatter curve) | 1.40 | No time limit; a boss rises every 5:00 (the five in turn, from Gravemaw), +60% HP each time. Each depth rotates the active modifiers Ch2 → Ch3 → Ch4 → Ch5 ("THE ABYSS SHIFTS"); under Ch5 modifiers elites come every 35 s | Endgame |

Chapters differ in palette, HP mult, spawn mult, the modifiers above and the chapter terms below. A run opens with the intro card naming the chapter and its twist (below). Hazards (burning ground, vents, hands, ice) affect only the Shepherd. Every chapter but Ch5 has 4 elites. Each chapter is exactly 6:00 plus the boss. Chapter N+1 unlocks when Chapter N's boss dies (on Normal). Endless Abyss unlocks after the first Chapter 5 clear. Every campaign chapter can then be replayed on **Nightmare** and **Torment** (§8.2).

**Chapter art.** Each chapter has a painted 16:9 key art (`src/assets/art/chapter-N.webp`; Endless Abyss is chapter 6; style and jobs in `ART_AND_ADS.md`).
- **Home chapter card:** the selected chapter's painting fills the card behind its content. Gradients darken the edges (behind the arrows), the centre (behind the name) and the bottom (behind the difficulty selector), with the chapter's rune colour glowing at the top, so the name, record line, selector and arrows stay readable. A new chapter's painting fades in over the last one in 0.45 s, and the neighbouring paintings are decoded ahead of a swipe. A locked chapter's painting is greyed. The card keeps its size and layout on every phone; the layers are absolutely positioned behind the content.
- **Run intro card** (`src/ui/runintro.js`), replacing the old chapter banner at 0:00.6:
  - **What it shows:** for about 2.4 s, the chapter's painting as a wide strip feathered at the edges, the chapter number (or "Endless", or "Daily Trial · Chapter N"), the chapter name in Cinzel under a glowing rule, and its twist (the modifier tagline; campaign chapters without a modifier tag: "Survive 6:00, then slay the Hollow King", naming that chapter's boss; Endless: the first rotation's twist, e.g. "Ember Wastes: The witches' fire lingers"). Nightmare or Torment and Blood Moon show as tags beside the chapter number.
  - **Where:** in the top third, just under the timer (100 px from the top, 100–130 px tall), well clear of the Shepherd at screen centre. The legion counter, still 0, steps aside while it shows.
  - **Input and timing:** it takes no input (pointer-events off, so the joystick starts anywhere, on it too). It fades in over 0.35 s and out over 0.4 s, and goes when its own fade ends, so a first-frame hitch never cuts it short. The Daily Trial, Blood Moon and Nightmare / Torment banners still open at 0:03.6, after it has gone. Endless depth changes keep their "THE ABYSS SHIFTS" banner.
  - **Reduce flashes** (§17) drops its light flare and the glow on the rule.
- **Results:** a faint strip of the chapter's painting sits behind the VICTORY / DEFEAT header.

**Formulas** (c = chapter 1–5, m = minutes elapsed as a decimal):

- **Enemy HP** = BaseHP × chapter HP mult × (1 + 0.28m + 0.04m²) × difficulty HP (§8.2; 1 on Normal, ramping in from 1 over the first minutes, and 1 for the boss's arena adds)
- **Enemy damage** = BaseDamage × (1 + 0.1m) × (1 + 0.35(c−1)) × difficulty damage (1 for the boss's arena adds). Ch1 goes from ×1.00 to ×1.60 at 6:00; Ch5 from ×2.40 to ×3.84 (on Normal).
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

**Endless Abyss (in the build).** Chapter id 6, unlocked by the first Chapter 5 clear. It uses its own flatter HP curve, `4.0 × (1 + 0.32m + 0.025m²)` (×26.8 at minute 10, ×45.6 at minute 15), and spawn mult 1.40 under the normal alive limit. There is no time limit: the run ends when the player falls (one paid revive as usual). A boss rises every 5:00, the five chapter bosses in turn (Gravemaw, Pyrexa, Vaulkar, Azrathel, Vesperine, then Gravemaw again, each with its own twist and signature; the warning reads "… RETURNS" from the sixth), with HP `12,500 × 4.0 × 1.25 × (1 + 0.6k)` (62,500 for the first, k = kills so far), and every return replays all three phases and damage × √(1 + 0.6k). Each kill drops a Relic Chest, raises 25 souls and resets the 5:00 clock. Elites keep coming every 70 s after the first four. Rewards: the normal gold formula, 15 gems per boss plus 2 per minute, and a relic (Rare; Epic from 2 kills; Epic+ from 3). The deepest run is saved as the chapter-6 best time. Endless is **Normal only**: it already escalates without end, so the chapter card hides the difficulty selector there (§8.2). *(Planned: weekly leaderboards ranked by time survived, kills as tie-break.)*

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
- **Choosing:** the home screen's chapter card has a three-way selector (Normal · Nightmare · Torment) under the chapter name. Each button shows its gold multiplier, or a lock with "Beat Normal" / "Beat Nightmare" (a tap on a locked tier explains why). The choice is remembered per chapter (`profile.diff.sel`). BATTLE turns violet or crimson to match. The status line shows the chosen tier's record, or its first-clear bonus; on short phones (≤ 700 px tall) the selector compacts and takes the status line's place.

| | Normal | Nightmare | Torment |
|---|---|---|---|
| Enemy HP (horde, elites, gate guards), reached after the ramp | ×1 | ×2.2, ramping in over 2 min | ×3.5, ramping in over 2.5 min |
| Enemy damage (horde and hazards) | ×1 | ×2 | ×2.8 |
| Spawn rate (director; swarm rings unchanged) | ×1 | ×1.25 | ×1.4 |
| Elites | 4 (8 in Ch5) | +2, at 3:10 and 5:20 | +4, also at 1:55 and 4:20 |
| Affixes per elite (§5.1; `run.diff.eliteAffixes` is the extra) | 1 (2 from Ch4) | +1: 2 (3 from Ch4) | +2: 3 (4 from Ch4) |
| Soul shard XP | ×1 | ×2 | ×2.8 |
| Boss HP · damage (its arena adds are plain Normal adds) | ×1 · ×1 | ×1.4 · ×1.4 | ×1.5 · ×1.6 |
| Run gold · pass XP | ×1 · ×1 | ×1.75 · ×1.5 | ×2.5 · ×2 |
| First clear (once per chapter) | 70–150 gems + 1 sigil | +60 gems | +120 gems |
| Boss Hoard | §10 | Rare 60% / Epic 40% | Epic 98% / Legendary 2% |
| World palette | the chapter's | mixed 70% toward violet | mixed 85% toward blood red on black |

- **Three rules keep the harder tiers fair rather than grindy.** Each came from the balance bot:
  - **HP ramp:** the extra HP builds up from ×1 at 0:00 to its full value over the ramp. Damage, spawns and elites apply at once. With a flat ×3.5–4.5, Chapter 5 Torment Husks had ~470 HP at 0:00, and the bot died at level 2 with ~100 kills: a wall, not a challenge.
  - **Richer souls:** shard XP is multiplied. A tougher horde dies more slowly, and without this the Shepherd met the boss ~10 levels behind a Normal run.
  - **The boss scales less than the horde, and once it rises its arena adds are plain Normal adds (HP and damage).** Tough adds piled up at the arena's alive cap and soaked the Shepherd's weapons, and harder hits (the boss's and theirs) shredded the legion that fights it, stretching Nightmare fights past 8 minutes. The boss alone carries the difficulty in its arena. The target is a fight no more than about 1.6× its Normal length.
- **Look and feedback:** the ground, runes, rim light and fog are pulled toward the difficulty's palette, the same swap as the Blood Moon look and applied over it on Blood Moon weekends. Allies and enemies keep their colours (§14). The HUD shows a NIGHTMARE or TORMENT tag under the chapter name. The run intro card tags it, and a banner at 0:03.6 names it (the Blood Moon banner names it instead on weekends). The pause and results screens show a difficulty pill with its gold multiplier.
- **Records:** best time, best legion, best kills, best kill streak (§4.7) and a cleared flag are kept per chapter per difficulty (`profile.diff.best`). Normal's clear flag stays in the chapter record. Old saves migrate safely: the block is added, Normal records are seeded from the chapter records, and Nightmare opens on every chapter already cleared.
- **Quests:** "Clear a chapter on Nightmare" and "Slay 5 elites on Nightmare" join the late daily-quest pool (Torment counts for both, §2).

**Balance check (2026-10-07, `scripts/balance.mjs`).** The bot plays Vael on the build with kill streaks, elite affixes, run events and Rites (on, as players have them). Each row uses the bot's typical progression for that chapter. `PROG=5` plays Chapter 2 with Chapter 5's progression, because Nightmare players arrive stronger than that table assumes. The bot only flees and seldom clears, so mortal survival is the yardstick. Boss fights use `GOD=1` (no hit can kill). Rows are 5–18 runs each.

| | Normal | Nightmare | Torment |
|---|---|---|---|
| Ch2 survival | 279 s | 180 s (65%) | 153 s (55%) |
| Ch5 survival | 373 s (5 of 8 clear) | 205 s (55%) | 195 s (52%; median 165 s, 44%) |
| Ch2 at Ch5 progression: survival · clears | 385 s · 6/6 | 367 s · 5/6 | 355 s · 5/6 |
| Gravemaw fight (`GOD=1`), Ch2 · Ch5 | 33 s · 34 s | 31 s · 38 s (0.9× · 1.1×) | 67 s · 62 s (2.0× · 1.8×; Ch5 median 33 s) |
| Gravemaw fight (`GOD=1`), Ch2 at Ch5 progression | 20 s | 17 s | 15 s |

- **Survival clusters:** on Chapter 5 the bot's deaths bunch around the 2:30–3:10 elite wave (Ch5's own elites plus the 3:10 extra one) on both tiers. So Torment's extra edge shows in the median, in Chapter 2 and in its boss rather than in the Ch5 mean. More Torment damage (×3.2) did not move it and only slowed the build.
- **Torment's Gravemaw** at chapter progression runs past the 1.6× target (about 2×), and fights are bimodal (a build that snowballs kills him as fast as on Normal). At Chapter 5 progression on Chapter 2 he falls as fast as on Normal. A Torment player is expected to arrive above the typical progression the bot can model.

---

### 8.3 Boss Rush: The Hollow Court (in the build)

A limited event: the five chapter bosses back to back in one run. Numbers live in `BOSS_RUSH` (`data.js`), the state and rewards in `economy.js` (`rushState`, `applyRushResult`), the run mode in `run.js` (`rush`), the panel in `ui/meta/rush.js`. LIVEOPS.md §3.2 is the live plan.

- **When.** In the build it runs every week, Tuesday 00:00 – Thursday 23:59 UTC; live it runs once per season (week 3) through remote config. `profile.flags.bossRush` ('on' / 'off') overrides the calendar for QA.
- **Who.** Unlocked by a first Chapter 1 clear. The home screen's **Rush** button glows crimson while the Court is open and carries a dot while a free try is left.
- **Cost.** Free: **3 tries a day** (no energy), one more by rewarded ad. Entering uses a try; abandoning or falling ends it.
- **The run.** The Abyss map, titled "Boss Rush · The Hollow Court · Five bosses. One legion. No rest." The Shepherd starts where a campaign player stands at a boss:
  - level 20, a veteran build (the first card of 14 draws, applied at once), legion cap +40 and a legion of 70;
  - then the **War Council**: 4 picks of the player's own, while the clock waits.
- **The bosses.** Gravemaw, Pyrexa, Vaulkar, Azrathel, Vesperine, each in its full three-phase fight with its own twist and signature (§6). The run scales as each boss's chapter (horde HP and damage, the Shepherd's and legion's chapter scaling), and each boss has its campaign HP × 1 / 0.85 / 0.7 / 0.6 / 0.55 (no horde phase levels the Shepherd between them). The warning comes 3 s before each, the first 3 s after the War Council.
- **Between bosses.** A Relic Chest (the pick between bosses), 20 souls rise, the Shepherd heals 40% of max HP, the leftover adds burn away, and the next boss rises 6 s later. The HUD reads "Boss *n* of 5" under the clock, and the clock is the score.
- **Results.** "COURT CLEARED" or "FALLEN · Boss Rush · *n* of 5 bosses": the run's kill and time gold, pass XP, quests (kills, bosses and the rest), Bestiary kills (each boss counts for itself) and account XP. No chapter records, no Boss Hoard relic, no ad doubling.
- **Event rewards.** Milestones by bosses beaten in one attempt, each paid once per event: 1 boss 1,000 gold · 2 bosses 20 gems · 3 bosses 1,500 gold · 4 bosses 30 gems · the Court cleared 1 Altar Sigil + 40 gems. The panel shows the five bosses (ticked when beaten this event), the track, the event's best clear and the all-time best. *(Planned: the power-matched leaderboard and the cosmetic legion banner, LIVEOPS.md §3.2.)*
- **Balance (2026-10-08, `RUSH=1 scripts/balance.mjs`, Vael, `GOD=1`).** Fights last about as long as the campaign's at matching progression, so how far a player gets tracks their campaign: Chapter 5 progression clears in about 3:00 (each boss 25–48 s), Chapter 3 in about 4:15, a fresh Chapter 1 clear in about 7:00 with the later bosses 70–130 s each. Mortal, the bot (which does not dodge) cleared it once in two at Chapter 5 progression and fell to the first boss at Chapter 1–2.

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

K = total kills (player and minions), T = seconds survived including the boss fight (max 960), B = 1 if the boss was killed, c = chapter, G = gold bonus (Greed talent + Grave Coin relic), P = 1.2 with an active Soul Pact, D = the difficulty's gold multiplier (Normal 1, Nightmare 1.75, Torment 2.5; §8.2; the flat bonus is not multiplied), bonus = 150 per "Grave Gold" card + 40 per affix on each slain elite (§5.1) + 100 + 40c per slain Soul Thief (§4.8). Blood Moon doubles the run's gold and gems, and the rewarded-ad "double rewards" then grants the (doubled) gold and gems a second time, so the two stack to ×4 (×10 the Normal base on a Torment Blood Moon run).

| Example (G = 0) | Full clear (T = 7:00) | Death at 4:00 (no boss) |
|---|---|---|
| Ch1 (~2,000 / ~870 kills) | 3,124 | 1,311 |
| Ch3 (~2,550 / ~1,110 kills) | 4,419 | 1,527 |
| Ch5 (~3,100 / ~1,350 kills) | 5,714 | 1,743 |

- **Gems per run:** a clear gives 10 + 2c (12–20). A defeat gives 2 gems per full 2 minutes survived (4 at 4:00). The same on every difficulty.
- **Pass XP per run** = round( round(20 + T/6 + K/40 + 40 × B) × X ), where X = 1 / 1.5 / 2 on Normal / Nightmare / Torment: about 180 for a Ch1 clear and 82 for a death at 4:00 on Normal. Account XP gets the Normal amount (without X). Account level n → n+1 needs 80 + 40n XP, and every account level-up gives 20 gems.
- **First-clear bonus:** 50 + 20c gems in all (Ch1 70 · Ch2 90 · Ch3 110 · Ch4 130 · Ch5 150), that is the usual 10 + 2c clear gems plus a one-time 40 + 18c, and 1 Altar Sigil. The first **Nightmare** clear of a chapter adds **+60 gems** and the first **Torment** clear **+120 gems** on top of the 12–20 clear gems, once per chapter per difficulty (900 gems in total). Every first-clear bonus is flat: Blood Moon and the rewarded-ad double apply only to the clear gems.
- **Boss Hoard** (every boss kill): one relic of a random type. Odds by difficulty:

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

### 10.1 The share card (in the build)

Every results screen except the tutorial's has a **Share** button beside Double rewards (`ui/sharecard.js`). It paints a 1080×1350 card (the 4:5 portrait that Instagram, TikTok and messengers show whole) on a 2D canvas from the painted art, with nothing sent anywhere until the player shares it:

- **Background:** the chapter's painting (the Abyss for Endless and the Boss Rush), dimmed, with the hero's splash (or the equipped skin's) on the right, feathered into it.
- **Headline:** VICTORY, FALLEN, COURT CLEARED / FELL IN THE COURT, or ABYSS DEPTH *n*, over the chapter, difficulty or mode.
- **The hook:** peak legion, huge, in the legion's colour: "214 SOULS IN MY LEGION".
- **The boss:** the slain boss's portrait framed in its colour with "SLEW PYREXA, the Cinder Matron"; the Boss Rush shows each boss beaten, the Abyss each boss slain.
- **Then:** the hero's name and title, time / kills / raised / level, the build's painted weapon icons (evolved ones shown evolved) and "CAN YOUR LEGION BEAT MINE?".
- **The sheet:** the card with **Share** (the Web Share sheet with the image, where the device offers it), **Save image** (a download; inside the claude.ai artifact viewer, which blocks plain downloads, the viewer's own save prompt through its `downloads` capability) and a long-press / right-click hint for the rest. The results stay open behind it. *(Planned: a store link and QR code on the card once the store pages exist; native share through the Capacitor Share plugin where the web sheet is missing, as in Android's WebView.)*

---

## 11. Heroes (Shepherds)

| Hero | Rarity | Base HP | Move (m/s) | Signature weapon | Passive | Rite (§11.1) | How to get |
|---|---|---|---|---|---|---|---|
| Vael, the Gravecaller | Common | 100 | 6.2 | Soul Bolt | +10% Raise Chance (pp) | **Grave Call** (20 s): for 4 s every kill rises; shards within 12 m fly in | Free (starter) |
| Nyx Hollowborn | Rare | 110 | 6.5 | Spectral Scythe | Minions +20% speed and damage | **Shadow Step** (8 s): an invulnerable 7 m dash that cuts its path; the legion surges +60% for 3 s | Starter Pack / Epic summon shards |
| Seraphine Ashveil | Epic | 105 | 6.4 | Ashen Chains | Soul Nova charges 30% faster, and foes her Nova kills rise at ×2 Raise Chance (not halved) | **Ashfall** (18 s): burning chains strike and pin 20 foes on screen (elites, then Witches, first); +15% Nova charge | Epic and Legendary summon shards, Soul Pass S1 premium |
| Liora Bellwraith | Epic | 105 | 6.3 | Grave Pulse | Her pulses mark foes for 3 s; marked foes rise at ×2 Raise Chance whoever kills them (85% cap). Her pulses push foes 75% less, so they stay inside her legion's reach | **Death Knell** (15 s): a bell toll stuns foes within 5 m for 1.5 s and marks them for 5 s; it clears enemy fire (not a boss's patterns) and silences Witches within 10 m | Epic summon shards |
| Grimsby Lanternjaw | Epic | 105 | 6.4 | Witchfire Lantern | +N Soul Gates give 25% more souls (rounded to 5: +15 becomes +20); foes his witchfire kills rise at ×1.5 Raise Chance (85% cap) | **Hallowfire** (16 s): foes within 6 m are scorched and flee in terror for 2 s; for 6 s he runs 30% faster, trailing a 1.7 m river of witchfire | Epic summon shards |
| Mordrake the Undying | Legendary | 130 | 6.0 | Bone Spears | Legion cap +25%; revive once per run at full HP | **Ossuary Wall** (18 s): a 5 m ring of bone spikes for 5 s that throws foes out, shatters Witch fire and heals the legion inside | Legendary summon shards |
| Osric the Bone Abbot | Legendary | 135 | 6.0 | Skull Halo | Starts every run with 20 minions (not in the tutorial or Boss Rush); Skull Halo kills rise at ×2 Raise Chance (85% cap; Bone Crown's sure raise stands) | **Bone Mass** (18 s): 12 bone monks rise to join the legion; for 6 s the whole legion deals +50% damage, the Skull Halo spins twice as fast and he takes 40% less damage | Legendary summon shards |

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

**Balance check for Grimsby and Osric (2026-10-08).** The balance bot (`scripts/balance.mjs`; casting Hallowfire at 3+ foes within 3 m or 8+ within 6 m, Bone Mass at 10+ within 12 m) played each at the same progression as the roster. Mortal runs are 4 per chapter on Chapters 2 and 4 (one run varies by about ±35 s, so a 4-run mean is good to about ±18 s); god-mode runs (2 per chapter on 1, 3 and 5) measure the boss fight.

| Hero | Ch2 survival | Ch4 survival | Mean | vs Mordrake | Boss TTK, god mode (Ch1 / 3 / 5) |
|---|---|---|---|---|---|
| Vael | 276 s | 386 s | 331 s | −4.6% | 38 / 35 / 34 s |
| Mordrake | 289 s | 405 s | 347 s | — | 47 / 45 / 37 s |
| Osric | 287 s | 355 s | 321 s | −7.5% | 25 / 37 / 52 s (before the tithe and ward) |
| Grimsby | 306 s | 310 s | 308 s | −11.2% | 47 / 45 / – s |
| Liora | 225 s | 331 s | 278 s | −19.9% | 72 / 38 / 50 s |

- **Grimsby's fix:** his witchfire kills foes behind him, on the path he has already walked, so a kiting player left their soul shards behind. In his first god-mode runs he reached the boss up to 9 levels short (a 139 s Chapter 1 boss fight). The souls of witchfire kills now fly to him; his Chapter 1 boss fight came down from 88 s to 47 s on average.
- **Osric's fixes:** his legion does his killing at up to 9 m, so the same thing happened to him (6 levels behind Vael at death on Chapter 2, 237 s survival). The first fix, a 40% ward during Bone Mass, a 22 → 18 s cooldown and 125 → 135 HP, did not move it (226 s), because his deaths were XP-starved, not damage-starved. The tithe (his legion's kills send him their souls) replaced a "Skull Halo kills rise ×2" passive and took him to 287 s and 355 s.
- **Power-creep rule:** neither beats Mordrake (both are below him), and Osric sits within the noise of Vael. The Witchfire Lantern measured 3,330 effective DPS at Lv5 in the weapon bench's dense horde (`scripts/weapon-bench.mjs`), the strongest Lv5 weapon there before its Lv4–5 burn was trimmed (30 → 28, 40 → 37); Hallow Pyre measured 4,050, beside Harvest Moon. It is weakest against a single target, which is where Grimsby's boss fights are slow.

**Stars.** Unlocking takes 10 shards (1★). Star costs: 10 / 20 / 40 / 80 shards for 2★ / 3★ / 4★ / 5★ (160 shards from first shard to 5★). Each star above 1★ adds +12% damage and +8% HP, so 5★ = +48% damage, +32% HP.

**Shard sources:** an Epic Soul Altar roll gives 4 Seraphine, 6 Nyx, 5 Liora or 5 Grimsby shards (equal chance). A Legendary roll gives 5 Mordrake, 6 Seraphine or 5 Osric shards (equal chance). The Soul Pass S1 premium track gives 25 Seraphine shards (10 at tier 10, 5 each at tiers 5, 15 and 25). Duplicate hero grants (for example, owning Nyx and then buying the Starter Pack) convert to 20 shards of that hero. *(Planned: in Endless Abyss, the top 10 of each Abyssal-league group earn 2 Mordrake shards per week.)*

### 11.1 Hero Rites

Each hero has a signature active ability, a **Rite**, on its own RITE button (§3). It is ready from the first second of every run and then recharges on its own cooldown. The cooldown counts run time, so it waits while the game is paused or a card pick is open and slows down with slow motion. All numbers live in `RITES` (`data.js`); the code is `src/game/rites.js` and `src/ui/riteui.js`.

**Rite damage** = base × the run's damage multiplier (stars, Might talent and skill, Crown of Thorns) × (1 + 0.45(c − 1)), the same chapter scaling as Soul Nova. Shadow Step and Ashfall can crit (10%, ×2) like a weapon.

| Hero | Rite | Cooldown | What it does |
|---|---|---|---|
| Vael | **Grave Call** | 20 s | For 4 s every kill rises (Raise Chance 100%). The legion cap and its overflow rules still hold: a roll at the cap mends the weakest minion instead. Soul shards within 12 m fly to Vael for the whole call. |
| Nyx | **Shadow Step** | 8 s | Dashes 7 m in 0.18 s along the stick (her facing when idle), invulnerable for 0.4 s. It slips abyssal hands and slam shoves. Foes within 1.5 m of the path take 90 and are knocked aside. The legion moves +60% faster for 3 s to catch up. |
| Seraphine | **Ashfall** | 18 s | Burning chains fall on up to 20 foes on screen over 0.5 s: the boss and elites first, then Cinder Witches, then the nearest. Each takes 120, is pinned (stunned) for 0.8 s and burns for 60% of the hit over 2 s; a kill while burning gets +15 pp Raise Chance (85% cap). If a struck foe dies first, its chain finds the nearest unstruck foe within 3 m. Adds +15% Soul Nova charge (not mid-detonation). |
| Liora | **Death Knell** | 15 s | A great bell tolls around her. Every foe within 5 m is stunned for 1.5 s, takes 60 and carries her toll for 5 s (her passive's ×2 Raise Chance, whoever lands the kill; the passive's own mark lasts 3 s). Every enemy shot and Witch fire orb in flight is cleared (a boss's ring, spiral and fan orbs fly on; Pyrexa's lobbed cinders are cleared), and Cinder Witches out to 10 m are stunned too, so their next fire waits. |
| Mordrake | **Ossuary Wall** | 18 s | A ring of bone spikes (5 m) erupts around him for 5 s and moves with him. Foes inside are thrown out; every crossing cuts for 60 with knockback (at most once per 0.5 s per foe). Witch fire that would land inside shatters on the bone. Minions inside heal 50% of their max HP over the 5 s. |
| Grimsby | **Hallowfire** | 16 s | His lantern jaw blazes. Every foe within 6 m takes 40 and **flees** in terror for 2 s, and a 3 m pyre burns where he stood. For 6 s he runs 30% faster and his trail becomes a 1.7 m river of witchfire (a patch every 0.9 m, 45 a second, with the Rite's chapter scaling) whether or not he still carries the lantern's own trail. |
| Osric | **Bone Mass** | 18 s | Twelve bone monks rise around him and join the legion (past the cap: like a gate's surplus, they fade with the overflow rules). For 6 s the whole legion deals +50% damage, his Skull Halo turns twice as fast and the hymn wards him: he takes 40% less damage (burning ground included). The buffs survive a level-up's stat rebuild. |

**Fear** (`Enemies.fear`, Hallowfire): a frightened foe runs straight away from the Shepherd at 110% of its speed and never attacks; a wind-up in progress is called off as by a stun. A boss is never frightened: it takes the stun's 0.25 s stagger instead.

**Stun** (`Enemies.stun`): a stunned foe neither steers nor attacks, and only drifts on its knockback. A Brute wind-up, a Ghoul crouch or lunge and a Bloater fuse in progress are called off, and the Bloater's fuse circle goes out with it. Stunned foes stop waddling and three pale daze motes circle their heads.

**Bosses keep their rules.** Rite damage goes through the boss's own filter (immune while rising, roaring or warded; phase floors). A stun never stops a boss: it only pushes its next attack back by 0.25 s while it is chasing. The Ossuary Wall only leans on him (1.2 m/s outward) instead of throwing him out, and neither it nor the Death Knell clears his ring and spiral orbs. Ashfall strikes him first. Grave Call cannot raise him.

**Look and feel.** Each Rite is meant to sell the hero in the Soul Altar:
- *Grave Call:* a 12 m rune ring around Vael, a heartbeat pulse ring every second, souls streaming in from the rim, and a cyan soul pillar (in the legion colour) wherever a foe rises. Slow motion 0.25 s.
- *Shadow Step:* four afterimages along the path, a shadow trail with a hot core, smoke, a scythe slash where she lands, and a speed streak behind the surging legion.
- *Ashfall:* ash drifts down across the screen; each target gets a pulsing ember mark, then a jagged burning chain falls from the sky onto it with an ember burst.
- *Death Knell:* a spectral bell drops over Liora, swings and tolls; the toll band runs down its body, three rings roll out to 5 m, and a brief hit-stop lands the strike.
- *Ossuary Wall:* 44 bone spikes in two staggered rows erupt in a wave from where Mordrake faces, glowing marrow-green at the root, under a green rune ring. They tremble while up and sink back at the end.
- *Hallowfire:* lime shockwaves and a ring of witchfire roll out to 6 m, his jaw blazes over his head for the whole 6 s, and the river of fire curls behind him.
- *Bone Mass:* an organ chord and a choir of monks; a pillar of gold rises where each monk climbs out of the ground, and a gold halo floats over every minion, and a gold ward glows around him, while the Mass lasts.
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

- **Readability:** strong silhouettes, an emissive core on every unit, additive particles, screen shake (scalable), 65–90 ms hit-stop on elite kills, boss phase changes, ×2/×3 gates and the Nova blast (§4.7). Enemy telegraphs are ground decals that fill from the edge inward.
- **Minions:** Shades are instanced soul wisps with particle trails. Every other variant is a **spectral ghost of its source enemy's silhouette** in the legion colour: an opaque emissive body with a hot rim, a ripple running up the body and a tail that dissolves into the ground, plus a halo glow sprite and a trail (one instanced mesh per variant). Champions add a gold rim, eyes and halo. *(Planned: at 300+ minions, trails switch to a shared ribbon per ring for performance.)*
- **UI:** obsidian panels with cyan rune trim. Premium currency and offers use gold. Display font is a gothic serif (e.g. Cinzel); body font is a clean sans (e.g. Inter). Numbers on gates and legion count are huge and outlined. Painted art (heroes, chapters, Bestiary foes, the Hollow King) carries the menus; chapter paintings sit behind the chapter card, the run intro card and the results header, always darkened behind text (§8, §5.2). Every item the player collects or picks is painted too, in one shared style (an object glowing on a dark ground that fades into its frame): the 8 relics, the 28 abilities (9 weapons, 10 passives, 9 evolutions, also used by the talents with the same stat), the 6 gem packs and the Eclipse Vael skin. The HUD's 30 px skill slots keep line icons, which read better at that size (`ART_AND_ADS.md` §1). **The heroes themselves are 3D models built from their painted art**: a turnaround sheet of each splash, turned into a textured model, then rigged (`ART_AND_ADS.md` §4). They run when the hero moves and idle when it stands, on the home screen and in every run, keeping the weapon stance of their art; Eclipse Vael has its own. **So are the foes**: the horde, the legion's ghosts, the Soul Thief and the Hollow King are painted 3D models from their Bestiary art. A vertex shader walks them, so hundreds stay one draw call per type, and their eyes and ember cracks burn in the chapter's foe colour (gold on elites) (`ART_AND_ADS.md` §6). **Every chapter is a painted place, kept dark**: the painted floor and props surface only in the lantern's and the legion's light, under a cold moon with creeping shadows. Each chapter has its own painted floor (lava veins glowing in the Ember Wastes, frozen bones in the Ossuary, gold-inlaid marble in the Throne), its own painted 3D props (graves and soul lamps, braziers, ice, gargoyles, gilded knights, void crystals) whose flames light the floor, and its own weather (ash, embers, snow, motes, dust, starlight) (`ART_AND_ADS.md` §5). The painted texture leads the shading, the hero's rim light only accents it, and glowing paint (eyes, flames, blades) blooms.

## 15. Audio direction

*Status: the build has menu, battle and boss music tracks plus a faster, harsher last-phase track for every boss's phase III, all procedural. Every gameplay-update mechanic has its own synthesized SFX: Ghoul lunge hiss, Brute growl and slam, Witch lob and fiery landing, Soul Bomb implosion-boom, Champion chime, the arena-seal drone, wall zap, phase-change choir stab and ward ping. The Nova has its wind-up inhale, and each kill-streak tier has a brass-and-bell stinger that rises in pitch by tier (§4.7). Elite affixes and run events add a glass ward shatter, the Splitter's pop, the Commander's rout horn, the Soul Thief's jingle-and-cackle and its escape whoosh, the shrine's bell chime and the coffin's wood-splitting boom. Rendered offline, they peak between −19 and −7 dBFS before the master limiter, the same range as the existing SFX, so none of them clips. Each Hero Rite has its own signature sound (a funeral bell and rising souls for Grave Call, a tearing whoosh and ringing blade for Shadow Step, a hymn and a cascade of chain strikes for Ashfall, a great bell for Death Knell, heaving earth and splintering bone for Ossuary Wall, a roaring whoosh of witchfire and a cackle for Hallowfire, an organ chord, a monks' choir and rattling bones for Bone Mass) plus a soft rising chime when a Rite is ready again (§11.1); rendered offline, all are clearly audible and none clips. The stem system below is Planned.*

*The build is also **voiced**: an announcer and the seven Shepherds, 48 recorded lines (cast and scripts in `ART_AND_ADS.md` §3). They are the only recorded audio; each is mastered to −16 LUFS, mono, and decoded once after the first tap. Tunables are in `VOICE` (`data.js`).*

| Moment | Line |
|---|---|
| Kill-streak tiers (§4.7) | "Carnage!", "Massacre!", "Annihilation!", "Soul Harvest!", "Apocalypse!" |
| A Nova of 40+ souls | "Soul Nova!" |
| Elite spawn | "An elite has risen." |
| Boss warning | "The Hollow King approaches." / "The Hollow King returns." (Endless) |
| Boss killed | "The Hollow King has fallen.", then "Chapter cleared." (campaign) or "The abyss deepens." (Endless) |
| Death / revive | "You have fallen." / "Rise again." |
| Run events (§4.8) | "A Soul Thief! Catch it!", "A Shrine of Souls awakens.", "A cursed coffin! Break it... if you dare." |
| Run start | "Nightmare.", "Torment.", "The Blood Moon rises.", "The Daily Trial begins." |
| Weapon evolution | "Evolution!" |
| Rite cast (§11.1) | Vael "Rise! All of you, rise!", Nyx "Into the hollow.", Seraphine "Let the ash fall!", Liora "Hear the bell.", Grimsby "Heh heh... let it burn!", Mordrake "None shall pass!", Osric "Brothers, rise! Sing the mass!" |
| Hero screen, unlock, Starter Pack (Nyx) | Vael "They remember their names. So do I.", Nyx "The hollow between heartbeats is mine.", Seraphine "My hymn still burns.", Liora "Listen... the dead are answering.", Grimsby "Mind the lantern, friend. It bites.", Mordrake "I have died nine hundred times. Once more is nothing.", Osric "My abbey is empty. My congregation... is not." |

- **One line at a time.** Each line has a priority: a more important line cuts in (boss and outcome lines > Rites, revive and run start > elites, events and evolution > streak calls and Nova). An equal or lower one is dropped, except the important lines, which queue for 1.5–4 s and are dropped if still blocked.
- **No chatter.** The streak calls share a 30 s window in which only a bigger tier gets through, so a chain still escalates "Carnage!" → "Massacre!" → "Annihilation!". "Soul Nova!" repeats at most every 45 s, the elite call every 30 s and a hero's Rite line every 20 s. In a bot-played Chapter 3 that is about one line every 15 s.
- **Mix:** music and SFX duck to 50% under a line and swell back over 0.45 s. A **Voice** slider in Settings sits under Music and SFX; mute silences it too.

- **Music:** dark synthwave with choir and pipe organ. **Stems are added as the legion grows** (25 / 100 / 200 / 300 minions): percussion, then bass, choir and lead. The player *hears* the army getting bigger. Boss tracks are separate, with a phase-3 key change.
- **SFX priorities** (voice limit 32): 1) player hit and telegraphs, 2) Nova, 3) gates, 4) level-up, 5) raises (pooled into a shimmering chord, at most 10 voices), 6) weapons, 7) enemy deaths (heavily pooled).
- **Signature sounds:** *Raise*, a rising glassy chime. *Gate*, a deep bell, pitched up for + and × and down for −. *Nova*, a 0.25 s inhale (the wind-up), then a sub-bass drop and a crackling chain that spreads in stereo with the ripple. *Gravemaw*, a low brass drone and a distinct slam warning cue 1.2 s before impact.
- **Mix:** music ducks −6 dB during Nova and boss telegraphs, and music and SFX duck under a voice line. Full playability with sound off: every audio cue has a visual twin, and every voice line has an on-screen banner or effect of the same moment.

---

## 16. UX and FTUE: the first 10 minutes

Goal: the player experiences all three hooks (raise, gate, Nova) and a boss kill inside 4 minutes, before any shop or currency screen.

**Status: the build has the tutorial run, "The Waking"** (`game/tutorial.js`, coach `ui/coachui.js`, numbers in `TUTORIAL`, `data.js`). A new Shepherd's home screen reads "Begin your training, Shepherd." and the BATTLE button shows **Free**; tapping it starts the tutorial (no energy) instead of Chapter 1. It is Chapter 1's map with Vael (or the selected hero), opened by the intro card "Tutorial · The Waking · Raise the dead. Lead the legion."

- **The coach.** A panel above the controls shows "Training · n/8", the step's name, one instruction, a smaller second line and a progress bar, with a tick when the step is done (1.3 s, 3 s for the gate and the Rite, 2.6 s for Nova). It also has the only touch target that is not the joystick: **Skip**. A ghost fingertip demonstrates the drag, a gold ring and arrow sit on the control to touch (LEGION, the RITE button, NOVA), and a bobbing marker flags the spot on the field (the ×2 gate, the elite, its chest; at the screen edge when off screen). The game's one-time hints stay quiet; the gate's maths line and other remarks show in the coach's second line instead.
- **The steps.** The tutorial replaces the run director until the King rises, so the horde comes only as a step needs it (Husks trickle in at 0.7–1.6 per second, each step capped at 10–40 alive).

| # | Step | The player | Done when | Setup |
|---|---|---|---|---|
| 1 | Move | Drags anywhere (desktop: WASD) | 6 m walked | Nothing spawns; the fingertip shows the drag until 1.5 m |
| 2 | Fight | Watches the Shepherd attack on their own | 5 Husks slain | 6 Husks wait in an arc ahead; the first five kills always rise |
| 3 | Raise the legion | Keeps slaying; the ring is on LEGION | Legion 12 | Raise Chance at least 50% all tutorial; a Ghoul pack of 4 at 8 s; at 45 s the legion tops itself up |
| 4 | Soul Gates | Walks through the marked ×2 | Any gate passed | The +5 / ×2 lesson pair, sides random; passing ×2 explains the maths; a missed pair returns ("Missed it!") |
| 5 | Your Rite | Taps the ringed RITE button | The Rite is cast | Its cooldown is reset; 18 Husks in a ring at 9 m |
| 6 | Soul Nova | Slays the ring, then taps the ringed NOVA | Nova fired | A SURROUNDED ring of 30 Husks; the meter charges ×5 here (×0.5 before, so it fills when taught) and tops itself up after 10 s |
| 7 | Elites | Rebuilds the legion to 15 ("Your souls rise again…"), then slays the marked elite Brute (60% HP) and grabs the marked chest | The Relic Chest is opened | Husks at 1.5/s; the elite comes at legion 15 or after 20 s, so it never meets a spent legion |
| 8 | The Hollow King | Fights Gravemaw; tips follow his attacks ("Step out of the glowing rings…", "Slip through the gaps…") | He falls | The warning, then the King 4 s later at 25% HP (3,125), phase I only |

- **It cannot be lost.** Hits stop at 1 HP (an early remark explains that in battle they do not), and the Shepherd recovers to full before the elite and before the King. The first level-up card screen and the first Relic Chest carry a coach line.
- **Pacing.** A bot that does each thing at once finishes in about 1:10–1:45 of run time; a new player takes longer.
- **Result.** "TRAINING COMPLETE": the run's kill and time gold plus **500 gold and 30 gems**, Bestiary kills and lifetime stats. Abandoned from the pause menu it reads "TRAINING ENDED" and pays nothing, like Skip; the reward still waits for a finished replay. It is no chapter attempt: no records, unlock, first clear, quests, pass XP or Boss Hoard, and no ad doubling (rewarded ads start after the tutorial). It pays **once per account** (`flags.tutorialPaid`); older saves count their first run as their training.
- **Then the home screen.** The strip "Spend your gold on **Talents**" (and a dot on Heroes and its Talents tab) leads to Talents, where the coach rings Might (or the first affordable talent). Buying any talent switches the strip to "Chapter 1 awaits. Your legion is ready." with the pulsing BATTLE button; the first real run clears the pointers (`flags.coach`).
- **Skip** (the coach's corner) pauses and asks; skipping counts the training as done, pays nothing, spends nothing and points the home screen at Chapter 1. **Settings → Replay the tutorial** runs it again any time as free practice that pays nothing.
- **Without the tutorial** (a run started with the flag unset, e.g. by QA), the old first-run softening still applies: the first five kills rise, the first Nova charges 2.5× faster, the first gate pair after legion 10 is the +5 / ×2 lesson, and the King has 60% HP and no phase III.

The beats below are the original plan; the tutorial above builds most of them (marked **Build**). Times are session times from app open.

| Time | Beat | What the player does / sees | Telemetry event |
|---|---|---|---|
| 0:00 | Launch | Logo (2 s), loading in under 5 s on a mid-range device | `app_open` |
| 0:05 | Age gate (Planned) | Neutral birth-year wheel (no default age). Under-13 routes to restricted mode (see MONETIZATION §11). EEA/UK users see the consent dialog. | `age_gate_done` |
| 0:15 | Cold open (Planned) | 6 s in-engine shot: Vael rises among graves. "Raise the Legion." | `ftue_intro` |
| 0:20 | "The Waking" (**Build**: the tutorial run, no energy cost) | Ghost fingertip: "Drag anywhere on the screen to move." (step 1) | `ftue_move` |
| 0:30 | First kill | Soul Bolt fires automatically. Husk dies. | `ftue_first_kill` |
| 0:35 | **Hook 1: Raise** | The first 5 kills always rise. **Build:** step 3 rings the LEGION counter: "The slain rise to fight for you. Grow your LEGION to 12." | `ftue_first_raise` |
| 0:50 | First level-up | 3 cards. Planned: Raise Dead is highlighted, but any pick is allowed. (**Build:** the first level needs only 7 XP, so it comes during step 2 or 3; the card screen carries the coach's line and nothing is highlighted.) | `ftue_levelup` |
| 1:20 | **Hook 2: Soul Gate** | Legion is about 12. Scripted pair: +5 vs ×2. After passing ×2, a caption explains the maths ("×2 turned 12 souls into 24"). A wrong pick gets no punishment. (**Build:** step 4, once the legion is 12; the ×2 is marked and a missed pair returns.) | `ftue_gate` (choice) |
| 1:45 | First elite | Gold Brute. It drops a Relic Chest → free pick. (**Build:** step 7, right after the Nova, at 60% HP; the elite, then its chest, are marked.) | `ftue_elite` |
| 2:15 | **Hook 3: Soul Nova** | **Build:** step 6: a ring of 30 Husks, the meter ×5, and a gold ring and arrow on NOVA once it is full. Screen wipe, slow-mo, legion count drops to 0 and starts climbing again. | `ftue_nova` |
| 2:40 | Second gate | ×2 vs ÷2, where ×2 sits behind a Bloater (Planned placement). Teaches risk. (Build: pairs at 1:08, 1:48 and 2:28 can offer ×2 vs −N or ÷2.) (Not in the tutorial.) | `ftue_gate2` |
| 3:00 | Gravemaw (**Build**: the tutorial's last step) | 25% HP (3,125), phase I only, 4 s after the warning; the coach's tips follow his slam and ember ring. | `ftue_boss` |
| 3:45 | Victory | Results: time, kills, peak legion, raised, level, gates, best kill streak (with its tier and the record) and rewards (a Ch1 first clear gives ~3,100 gold, 70 gems, 1 sigil and a relic). Planned line: "Your legion peaked at N." **Build:** "TRAINING COMPLETE": the run's gold plus 500 gold and 30 gems, once; no ad doubling. | `ftue_complete` |
| 4:00 | Home screen | Planned: only **Play** and **Talents** are lit; other tabs show locked silhouettes. (Build: every tab is open; the strip "Spend your gold on Talents" and a Heroes dot lead on.) | `home_first` |
| 4:15 | First talent | Buy Might Lv1 (150 gold; new accounts start with 1,500 gold). **Build:** guided: Might is ringed on the Talents tab, and buying it turns the strip to "Chapter 1 awaits". The gold sink is learned. | `talent_first` |
| 4:30 | Chapter 1 | Energy explained in one line (5 per run, refills over time). Planned: the first death in Chapter 1 gets a free revive with no ad. | `run_start` |
| 4:30–11:30 | First real run | Full 6:00 + boss. Most new players reach 3:30–5:30 on the first try. | `run_end` |
| After run 1 | Unlocks (Planned) | Soul Altar unlocks with a **gift relic** (a labelled gift, not a fake summon; the FTUE never stages an Altar result). Daily quests unlock. (Build: the Altar and quests are open from the start, with 150 gems and 1 sigil.) | `altar_unlock` |

**Later gates (Planned):** the 7-day login appears at the start of session 2. The Starter Pack is first shown after the player's first Chapter 1 boss kill, and never during the tutorial. Its 48 h timer starts at first display and is real. Rewarded-ad placements first appear in run 2. On iOS the ATT prompt is preceded by a one-screen explanation and shown before the first ad, never at cold start. *(Build: the login calendar and rewarded ads are available from the first session, and the Starter Pack's 48 h timer starts at account creation.)*

---

## 17. Accessibility

*Status: the build has music, SFX and voice volume, mute, a haptics toggle, a quality setting (auto / low / mid / high), a 30 FPS battery saver, and an Accessibility section in Settings: a screen-shake slider (0–100%, which also scales hit-stop; 0% turns it off), **Reduce flashes** (full-screen flashes capped at 20%, whiteouts at 15%, chromatic aberration at 25%), **Auto-Nova** (fires at 100% charge when the legion is 50 or more) and a **Left-handed** mode that mirrors the NOVA and RITE buttons and the skill bar. Rite effects respect Reduce flashes and the shake slider, and their haptics follow the haptics toggle. Reduce flashes also drops the run intro card's light flare (§8). Everything else in this table is Planned.*

| Area | Feature |
|---|---|
| Vision | Colourblind modes (protan / deutan / tritan) that remap enemy warm colours while keeping shape cues. Elites always carry a crown marker; Bloaters always show a pulsing ring. **High-contrast outlines** toggle. UI text scale 90–150%. |
| Photosensitivity | **Reduce flashes**: Nova and boss flashes capped at 3 Hz with luminance limits, bloom reduced. Screen shake slider (0–100%). A separate hit-stop toggle (in the build, hit-stop follows the shake slider). |
| Motor | One-thumb by design. Left-handed mode mirrors the NOVA button. Adjustable joystick size and dead zone. **Auto-Nova** option (fires at 100% when legion ≥ 50). Pause anywhere. No timing-critical taps outside movement. |
| Hearing | Every audio cue has a visual twin. Every voice line plays with a banner or effect of the same moment (the streak tier, the elite's name, "SOUL THIEF", the boss warning, the Rite itself), so the build needs no separate subtitles. Separate volume sliders for music, SFX and voice (in the build). |
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
