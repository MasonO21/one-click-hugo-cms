# Kindlehold: game design and business plan

**Pitch:** Raise the last living dragon of fire and keep a frozen town alive around it. Kindlehold is a survival city-builder with heroes, expeditions and alliances, aimed at the same audience as Whiteout Survival, with the survival game that its ads promise kept at the center of play.

This document covers what the game in this folder (version 1.0) contains, what makes the game different enough to pull players away from Whiteout Survival, how it makes money, and what it would take to ship it.

---

## 1. Where Whiteout Survival is strong, and where it leaves an opening

Whiteout Survival (Century Games, 2023) is one of the highest-grossing mobile strategy games of the last few years; third-party trackers estimate its lifetime revenue well past $1B. We keep what makes that work:

| Keep | Why it works |
|---|---|
| A frozen-apocalypse settlement built around a single heat source | Instantly readable premise, strong ad creative, cozy-versus-cold contrast |
| Central "furnace" level gates every other building | Clear long-term goal; each upgrade unlocks visible growth |
| Collectible heroes with rarity, stars and gacha recruitment | The core of the revenue model in the genre |
| Short PvE stages early, alliances and server events later | Fast early wins, then social retention |
| Timers with speedups, battle pass, monthly card, packs | Proven spending ladder from $0.99 to whale tiers |

Complaints that come up again and again in Whiteout Survival's store reviews and community forums are where we win:

1. **The game in the ads isn't the game.** Ads show survivors freezing and heat management. In the real game that layer fades after the first hour and the game becomes a timer-and-power race.
2. **Late joiners and free players get crushed** by older servers and heavy spenders in server-versus-server events.
3. **Pack fatigue.** Constant pop-up offers and a feeling that every system has its own paywall.
4. **Weak attachment.** The furnace is a building; nobody loves a building.

## 2. What makes Kindlehold different

These five pillars are all in the game. Each one answers a complaint above.

1. **A living heat source: the Hearthwyrm.** Your "furnace" is a fire dragon coiled around the hearth. It grows through seven forms (Hatchling, Whelp, Drake, Firewyrm, Elder, Ascended, Primordial), visibly gets bigger, blinks, purrs when petted, breathes fire to open every battle, and goes dormant and grey if you let the coal run out. Players name it, and at Lv 12 they choose its Ascension (Sunforge, Rimeward or Stormheart). It gives players a pet to protect and a canvas for cosmetic spending (skins), which is revenue that doesn't add pay-to-win pressure.
2. **Survival that stays real all game.** Weather is forecast ahead of time (Snowfall, Blizzard, Deep Freeze). The frost "hunts warmth", so every time the wyrm grows, storms hit harder. Players choose the blaze (Banked, Steady, Roaring), trading coal for heat. Cold makes survivors sick, the Infirmary heals them, and in a Freezing hold the sick can be lost. In our balance-bot runs, a player who stokes the fire before storms finished an hour of compressed play about one Hearthwyrm level and five expedition stages ahead of one who ignored the weather.
3. **Heroes matter at home, not just in fights.** Every hero can be stationed as a Steward of one building (Bram boosts coal, Hedda speeds healing, Sigrun adds warmth). Collecting heroes improves your town as well as your squad, which deepens the gacha without adding more combat power.
4. **Offline protection.** While you're away, the wyrm banks its fire: production continues at a reduced rate and nobody gets sick. No logging in to a dead town.
5. **Fair competition.** Thaw Wars, the leaderboard event, matches players into brackets by spending (Free, Supporter, Patron), so whales fight whales and newcomers fight newcomers. In 1.0 the nine rival holds are simulated; in a live version they would be real players on bracketed servers, with a seasonal "Thaw" that opens new regions. This is the headline message to Whiteout Survival players.

### Naming and IP

Everything is original: the setting (the Long Night, the Hearthwyrm), building names, hero names and bios, currencies (Starglass, Beacon Tokens, Field Journals), and the art. Before launch, run a trademark search on "Kindlehold" in the US, EU, UK, Japan and Korea. Do not use "Whiteout Survival" as a store keyword or in ad copy; Apple rejects competitor names in keywords and it invites a trademark claim. Comparative messaging ("tired of losing to whales?") is fine without naming them; have a lawyer review it.

## 3. Core loop

```
Minute to minute:  check forecast → set blaze → assign workers → start an upgrade → send a march
Session (5-10 min): claim quest → clear an expedition stage → level heroes → recruit → strike the Titan
Day:               gift calendar, daily duties, patrol cache, Ember Stipend, Kindred help and donations
Event (20 min*):   Ember Festival → Beast Hunt → Builder's Rush → Thaw Wars, on rotation
Season:            30-tier Ledger pass, new skins, more Snowfield and Frostline
```
*Game time. Timers and rates run about 30× faster than a typical live-service game.

### Systems in version 1.0

| System | What it does | Where |
|---|---|---|
| Hearthwyrm | Heat, coal burn, 3 blaze settings, 15 levels and 7 forms, naming, petting, Ascension branch, Wyrm's Breath in battle | `core.js`, `town.js` |
| Weather + survival | Forecast queue, storms that scale with wyrm level, warmth bands, sickness, healing, losses, food, housing, offline protection | `core.js` tick |
| Hold | 12 buildings, auto/manual workers, 10 research lines × 10 levels, Storehouse protection | `DATA.buildings`, `DATA.techs` |
| Troops | 3 classes in a counter triangle, Barracks-scaled strength, march cap, housing cap | `DATA.troops` |
| Heroes | 18 heroes, 3 rarities, levels capped by stars and Hearthwyrm level, skills that grow with stars, Steward posts | `DATA.heroes` |
| Recruitment | Published odds, 40-pull Legendary pity, 10-pull Epic guarantee, featured hero rotating each event, shard pouches | `DATA.recruit` |
| Expedition | 60 stages in 6 chapters with story, 12 bosses, an ending, the endless Frostline, patrol cache | `DATA.chapters` |
| Snowfield | Seeded 21×21 map, frost line, gathering marches, beasts, raider camps, 12 story ruins with choices, raids on the hold | `world.js` |
| Kindred | 3 alliances, AI members who help timers, 5 Kindred techs, donations, points shop, gift chests, reactive chat, Titan raid | `kindred.js` |
| Meta | 45 chapter quests, daily duties + chests, 7-day gift calendar, 30 achievements, mail, backpack, 4 rotating events including Thaw Wars | `events.js` |
| Season pass | 30-tier free and premium Ledger with two skins | `DATA.pass` |
| Store | Starter offer, monthly card, pass, growth fund, daily kit, value chest, Starglass, skins, crates | `DATA.shop`, `native.js` |
| Polish | Procedural audio, haptics, notifications, tutorial pointer, save codes, offline play | `audio.js`, `native.js`, `sw.js` |

## 4. Monetization

Target: match the genre's spending ladder while putting more of the spend into breadth (cosmetics, convenience, collection) and less into raw PvP power. Spend brackets in PvP are what let us keep whales (who carry most genre revenue) while telling free players the game is fair.

| Product | Price (USD) | Role |
|---|---|---|
| Founder's Cache: Starglass, tokens, journals, **permanent second builder** | $0.99, once | Converts a free player into a payer early. The second builder is the most useful thing in the game, so this is the single most important offer |
| Ember Stipend: 300 Starglass now and 90 a day for 30 days | $4.99 / 30 days | Daily login habit plus recurring revenue |
| Hearthkeeper's Ledger premium track | $9.99 / season | Mid-spender anchor; capstone is a wyrm skin |
| Starglass packs | $1.99 to $99.99 | Speedups, recruits, crates |
| Wyrm skins (Aurora Scales, Obsidian Ember; Glacier Sapphire earnable with free Starglass) | $4.99 to $6.99 | Cosmetic only; the biggest differentiator from a "furnace" |
| Growth Fund: 6,000 Starglass paid out at Hearthwyrm Lv 5, 8, 10, 12 and 15 | $14.99, once | Commits mid-spenders to the long game; pays back only if they keep playing |
| Storm Kit: speedups, coal crates and tokens | $2.99, once a day | Low-friction daily impulse buy |
| Warden's War Chest: Starglass, tokens and a Legendary Shard Pouch | $19.99 | High-value anchor for heavier spenders |
| Kindred gift chests | n/a | Every purchase by a Kindred member sends everyone a small gift: social proof that spending helps the group |
| Hero-specific banners and event packs *(live ops)* | $4.99 to $99.99 | High-spender depth, tied to live events |
| VIP levels from lifetime spend *(planned)* | n/a | Convenience perks; never PvP stats |

**Pricing anchors in the game:** a single recruit costs 150 Starglass. The $9.99 pack buys about 4.7 recruits, and a 10-pull costs 1,350 Starglass, about $19. That is in line with genre norms; tune it in soft launch.

### Store and legal compliance (non-negotiable)

- **Apple in-app purchase** for all digital goods (App Store Review Guideline 3.1.1). The web build simulates purchases. The App Store build routes them through StoreKit via RevenueCat, which validates receipts server-side (see NATIVE.md).
- **Gacha odds disclosed before purchase.** Apple requires it for paid random items, and so do China, Korea and Japan. The game has an Odds sheet on the Beacon screen.
- **Paid random items are restricted in some countries** (Belgium bans them outright). Build a region switch that turns paid recruits into direct purchases or shard shops.
- **Age rating, parental controls and spending limits for minors**, plus clear refund flows. In-game currency prices must show real-money equivalents where local law requires.

## 5. How we pull Whiteout Survival players over

1. **Message:** "The survival game you were promised." Ad creative shows real Kindlehold gameplay: a blizzard rolling in, the player stoking the wyrm to Roaring, survivors staying warm. Because the gameplay is real, the ad-to-game gap that drives churn in this genre is closed.
2. **Fresh, fair servers at launch.** Everyone starts on day one, and Thaw Wars spend brackets are announced up front.
3. **The Hearthwyrm as the face of the game.** Skins, wyrm-naming, sharing your wyrm's form. A lovable mascot is a UA and social asset that a furnace can't be.
4. **Returning-veteran onboarding.** Skip-tutorial for experienced 4X players and a "Warden's Welcome" catch-up event for anyone who joins a server late.
5. **Creator program** with mid-size strategy and Whiteout Survival YouTubers and streamers at soft launch. Give them early access, custom wyrm skins and alliance-founder codes.

## 6. From 1.0 to a live multiplayer game

Version 1.0 is a complete single-player game: every system above works offline, with simulated Kindred members and rival holds. Turning it into a live-service multiplayer game means swapping the simulations for real players:

- **Real Kindreds:** shared help requests, donations and Titan raids backed by a server, plus chat with moderation.
- **Shared Snowfield:** one map per server, where marches can meet rival holds.
- **Thaw Wars between servers:** real bracketed leaderboards each season, with server transfers at the Thaw.
- **Live ops:** monthly hero banners, new chapters past the Heart of Winter, seasonal skins and event packs, all tuned through remote config.

## 7. What it takes to ship and scale

This folder is a **complete, playable single-player game** (HTML5, wrapped for iOS/Android with Capacitor), ready for TestFlight playtests and a small-scale store release. A top-grossing live multiplayer game is a much larger project. Rough figures for planning; each should be validated with a studio or publisher:

| Phase | Goal | Typical team / time |
|---|---|---|
| Version 1.0 (this) | Full single-player game, store-ready shell, simulated multiplayer. Playtest with genre players and soft-launch small | Done; iterate with data.js |
| Live multiplayer | Production art pass, server-authoritative backend, real Kindreds, shared Snowfield, analytics | 6-12 people, 4-6 months |
| Soft launch | 1-3 test markets (commonly Canada, Australia, Philippines). Hit retention and payer gates before scaling spend | 15-30 people, 3-6 months |
| Global launch | Paid user acquisition at scale, live ops, alliances and PvP | 30-80+ people, ongoing |

**Gates before spending real UA money.** These are genre rules of thumb to confirm in soft launch:

- Day-1 retention around 40%, Day-7 around 15%, Day-30 around 6% or better
- A payer conversion rate of a few percent in the first 30 days
- Projected 180-day revenue per install above cost per install with margin. 4X installs in tier-1 markets commonly cost well into double-digit dollars

**What a live backend adds that 1.0 doesn't have:** accounts and cloud saves (1.0 has on-device saves and save codes), server-authoritative timers and economy (1.0 trusts the device, which is normal for a single-player game but not for competitive multiplayer), anti-cheat, analytics events for every economy action, remote config for tuning, push notifications ("Blizzard in 10 minutes"), chat and moderation.

**Funding and publishing.** Games at Whiteout Survival's revenue are backed by very large user-acquisition budgets. Realistic routes are: (a) take this game to a mobile strategy publisher, or (b) raise for a lean team to reach soft launch and prove the retention gates, then raise or partner for UA.

### Honest risk statement

Most 4X and survival-strategy launches never reach top-grossing charts, regardless of quality, because the category is dominated by a few incumbents with large UA budgets. Nothing in a design document can guarantee revenue. What the plan above does is make the risky bets cheap first (prototype, then soft-launch metrics) and only spend big once players prove they stay and pay.

## 8. Balance and pacing (measured)

The game was tuned with an automated player that plays every system the way a strong, active player would: it builds, researches, trains, recruits, stations stewards, gathers, hunts, explores ruins, donates, raids with its Kindred, claims every reward and fights the next stage whenever the odds look good. These are the ranges from the last two 12-13 hour free-to-play runs (game time, which runs about 30× faster than a live-service game):

| Milestone | Game time (free player) |
|---|---|
| Hearthwyrm Lv 5 | 10-20 min |
| Hearthwyrm Lv 10 | 3-3.5 h |
| Stage 30, the Frost Titan | ~2 h |
| Stage 60, the Heart of Winter (story ending) | 5-7 h |
| Frostline depth 10 | 7.5-9 h |
| Hearthwyrm Lv 15, Primordial form | 12-13 h |
| All 45 chapter quests | ~12 h |

A human player is less efficient than the bot, so expect the story to take roughly two to three times as long: a handful of evenings. Buying the Founder's Cache (second builder) shortens the Hearthwyrm path by about a fifth.

Other measured outcomes:

- **Survival matters.** A player who stokes the fire before storms finished an hour of play about one Hearthwyrm level and five stages ahead of one who ignored the weather. Sickness stays near zero for careful players and costs careless ones production.
- **Every resource is used.** Building costs draw on wood, coal, food and iron from level 3 up. Iron and coal are the late-game constraints; wood and food pile up for donations and training.
- **Thaw Wars is winnable but not free.** A very active player places first most of the time in the free bracket; rivals scale with the hold's size.
- **No errors** across all automated runs (more than 60 hours of simulated play in total).

## 9. Next steps

1. Playtest with 20+ genre players; watch the first 10 minutes, the first blizzard and the first Snowfield march.
2. Ship to TestFlight using NATIVE.md, with real purchases in the App Store sandbox.
3. Commission production art for the Hearthwyrm's seven forms and the hero portraits; this is the marketing hero.
4. Add analytics hooks (tutorial funnel, first purchase view, storm outcomes, day-1/7/30 retention).
5. Soft-launch in one or two test markets and check the retention gates in section 7 before spending on user acquisition.
6. If retention holds, start the live multiplayer backend in section 6.
