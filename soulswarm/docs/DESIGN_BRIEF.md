# SOULSWARM — Design Brief (mirrors `src/game/data.js`; if they disagree, the code wins)

**Tagline:** *Raise the Legion.*
**Genre:** "Legion Survivor": a top-down horde-survival roguelite in which every enemy you kill can rise as a glowing soul minion that fights for you. You start alone and finish the run leading a spectral legion of 300+.
**Platform:** iOS + Android (portrait, one thumb). Built with HTML5/WebGL (Three.js) and wrapped with Capacitor for the stores.
**Session length:** 6–9 minute runs. Meta progression runs for months, with seasonal live ops.

## The three hooks (what the ads sell)
1. **Convert the horde.** Killed enemies have a *Raise Chance* to come back as cyan soul minions that orbit you and hunt enemies. Your army grows on screen, from 1 to 300+.
2. **Soul Gates.** Every ~40 s a pair of glowing gates appears near the player, e.g. `+15` vs `×2` or `×2` vs `÷2`. Walking through one changes the size of your legion. This is the "pick the right gate" ad bait, built into real gameplay.
3. **Soul Nova.** The ultimate meter fills as you kill. Tap NOVA and every minion detonates in a chain of spectral explosions whose damage scales with legion size. It is the big screen-clearing ad moment. You trade your army for a wipe.

## Art direction: "Neon Gothic"
- Dark obsidian graveyard ground with glowing rune lines, fog vignette and heavy bloom.
- **Allies are cool colours:** each hero's legion has its own cool colour (Vael cyan #4ef2ff, Nyx violet #b36bff, Seraphine mint #7cffd4, Mordrake green #6dff9a), while the hero model keeps its own tint (Seraphine stays amber). The Eclipse Vael skin's pale-gold legion (#ffe9a0) is an intentional exception for a premium cosmetic.
- **Enemies are warm colours:** ember/crimson (#ff4a2a, #ff8a3d). Elites are gold (#ffd04a). Bosses are magenta/violet (#ff3df0).
- Readability first: silhouettes, emissive cores, additive particles, screen shake and hit-stop.
- Each chapter re-tints the palette: 1 Ashen Necropolis (teal/ember), 2 Ember Wastes (orange), 3 Frozen Ossuary (ice blue), 4 Abyssal Cathedral (violet), 5 Crimson Throne (blood red).

## Heroes (Shepherds)
| Hero | Rarity | Signature weapon | Passive | How to get |
|---|---|---|---|---|
| Vael, the Gravecaller | Common | Soul Bolt (homing bolts) | +10% Raise Chance | Free (starter) |
| Nyx Hollowborn | Rare | Spectral Scythe (sweeping arc) | Minions +20% speed & damage | Starter Pack / summon shards |
| Seraphine Ashveil | Epic | Ashen Chains (chain lightning) | Soul Nova charges 30% faster; her Nova's kills rise ×2 | Summon shards (Epic+) |
| Liora Bellwraith | Epic | Grave Pulse (shockwave) | Pulse-struck foes stay close and rise ×2 for 3 s | Summon shards (Epic) |
| Mordrake the Undying | Legendary | Bone Spears (piercing lances) | Legion cap +25%, revive once per run | Summon shards (Legendary) |

Heroes rank up 1★ to 5★ using shards. Each star adds +12% damage and +8% HP. Unlocking takes 10 shards. Star costs: 10/20/40/80.

## Enemies
| Enemy | Role | Notes |
|---|---|---|
| Husk | basic chaser | slow, the bulk of the horde |
| Ghoul | runner | fast, fragile, comes in packs |
| Brute | tank | big, slow, high HP, resists knockback |
| Cinder Witch | ranged | keeps distance and lobs ember orbs |
| Bloater | bomber | explodes near the player (telegraphed) |
| Elite (any type) | gold variant | ×6 HP, larger, drops a **Relic Chest** (free skill pick) |
| **Gravemaw, the Hollow King** | boss | slam AoE (telegraphed rings), ember bullet rings, summons husks. Appears at 6:00 in each chapter; killing it clears the chapter |

## In-run skills (level-up cards, choose 1 of 3, max Lv5)
**Weapons:** Soul Bolt, Spectral Scythe, Ashen Chains, Bone Spears, Skull Halo (orbiting skulls), Grave Pulse (AoE pulse).
**Passives:** Raise Dead (+raise chance), Legion Cap (+max minions), Minion Fury (+minion dmg), Haste (+move speed), Vitality (+max HP and heal), Soul Magnet (+pickup radius), Might (+damage), Frenzy (+attack speed).
**Evolutions (in the build):** Soul Bolt Lv5 + Might → *Soul Storm*. Skull Halo Lv5 + Minion Fury → *Bone Crown*.
Pickups: soul shards (XP), heart (heal), magnet, relic chest (from elites).

## Chapters
1 Ashen Necropolis, 2 Ember Wastes, 3 Frozen Ossuary, 4 Abyssal Cathedral, 5 Crimson Throne. Each lasts 6:00 and ends in a boss fight; enemy HP and density scale per chapter. Chapter 5 is followed by "Endless Abyss": no time limit, Gravemaw returns every 5:00 and grows stronger, and your deepest run is recorded (weekly leaderboards are planned for live ops).

## Meta & economy
**Currencies:** Gold (soft), Soul Gems (premium), Energy (30 max, a run costs 5, +1 every 6 min), Altar Sigils (summon keys), Hero Shards.
**Gold sinks:** Talents (permanent upgrades): Might, Vitality, Raise Chance (Necromancy), Legion Cap (Dominion), Greed (+gold), Swiftness. Each talent's cost rises per level.
**Relics (gear):** 8 relic types, 4 rarities (Common ×1, Rare ×2, Epic ×3.5, Legendary ×6 stat multiplier). Equip 3. Duplicates add +1 relic level (+15% stat).
Relics: Lantern of the Lost (+raise chance), Crown of Thorns (+damage), Bone Idol (+legion cap), Ember Heart (+max HP), Wraith Boots (+move speed), Grave Coin (+gold), Hourglass of Ash (+attack speed), Abyss Eye (+nova charge).

**Soul Altar (summon / gacha), with odds disclosed in-game:**
- Odds: Common 60% · Rare 28% · Epic 10% · Legendary 2%.
- Pity: every 10-pull guarantees Epic or better. A Legendary is guaranteed by pull 60 (the counter is visible).
- Cost: 1 pull = 150 gems or 1 sigil. 10 pulls = 1,350 gems or 10 sigils.
- Results: relics, plus hero shards on Epic/Legendary rolls.

**Shop (USD; simulated in the prototype):**
| SKU | Price | Contents |
|---|---|---|
| gems_80 | $0.99 | 80 gems |
| gems_500 | $4.99 | 500 gems |
| gems_1200 | $9.99 | 1,200 gems |
| gems_2600 | $19.99 | 2,600 gems |
| gems_7000 | $49.99 | 7,000 gems |
| gems_15000 | $99.99 | 15,000 gems |
| starter_pack | $1.99 (one-time, 48 h offer) | Nyx Hollowborn + 300 gems + 10,000 gold + 3 sigils |
| soul_pact | $4.99 / 30 days | 300 gems now + 100 gems/day + ad-free rewards + 20% more gold |
| soul_pass | $9.99 / season | Premium track of Soul Pass |
The first purchase of each gem tier gives double gems.

**Soul Pass (season battle pass):** 30 tiers, with 500 pass XP per tier (15,000 XP). XP comes from runs and quests: all quests plus 3 runs a day finishes in about 3 weeks, and quests plus 1 run a day reaches roughly tier 15–20. The free track gives gold, small gem drops and sigils. The premium track gives large gems, sigils, Epic and Legendary relics, Seraphine shards and the exclusive "Eclipse Vael" skin at tier 30. Seasons last 28 days.

**Daily quests (reset at midnight):** Slay 500 enemies, Raise 150 souls, Survive 4 minutes, Unleash Soul Nova 3×, Pass 3 Soul Gates, Finish 2 runs. Rewards are gems, gold and pass XP.
**7-day login calendar:** escalating rewards. Day 7 gives a Legendary-chance relic chest and 100 gems.
**Rewarded ads (optional, simulated):** revive, double run rewards, free daily summon, energy refill, daily free chest.

## Fairness guardrails
- Gacha odds and pity counters are always visible. Apple guideline 3.1.1 and Google Play both require odds disclosure.
- Every countdown timer is real and does not secretly reset.
- No forced interstitial ads. Ads are rewarded and opt-in only.
- All story content can be completed free-to-play. Spending speeds progress and buys cosmetics.
- Every purchase needs a confirmation step. The production build should add parental controls and an age gate.

## Live ops cadence (Planned; none of this is in the prototype yet)
Weekly event (Blood Moon: 2× elites and 2× rewards), a 28-day Soul Pass season, a new hero every 1–2 seasons, a monthly limited boss rush, and Endless Abyss weekly leaderboards. Clans/guilds and co-op "Legion Raids" are on the roadmap.
