# Rainkeep: game design and business plan

**Pitch:** The rain stopped a generation ago. Raise the last Rainwyrm, a water dragon whose cooling mist keeps a desert keep alive, and dig the wells that keep your people drinking. Rainkeep is a 3D survival city-builder with heroes, expeditions and alliances, aimed at the same audience as Whiteout Survival, with the survival game that its ads promise kept at the center of play.

This document covers what the game in this folder (version 2.1) contains, what makes it different enough to pull players away from Whiteout Survival, how it makes money, and what it would take to ship it.

---

## 1. Where Whiteout Survival is strong, and where it leaves an opening

Whiteout Survival (Century Games, 2023) is one of the highest-grossing mobile strategy games of the last few years; third-party trackers estimate its lifetime revenue well past $1B. We keep the structure that makes that work:

| Keep | Why it works |
|---|---|
| An apocalypse settlement built around a single life-giving source | Instantly readable premise, strong ad creative, a clear "keep them alive" fantasy |
| One central structure whose level gates every other building | Clear long-term goal; each upgrade unlocks visible growth |
| Collectible heroes with rarity, stars and gacha recruitment | The core of the revenue model in the genre |
| Short PvE stages early, alliances and server events later | Fast early wins, then social retention |
| Timers with speedups, battle pass, monthly card, packs | Proven spending ladder from $0.99 to whale tiers |

Complaints that come up again and again in Whiteout Survival's store reviews and community forums are where we win:

1. **The game in the ads isn't the game.** Ads show survivors freezing and heat management. In the real game that layer fades after the first hour and the game becomes a timer-and-power race.
2. **Late joiners and free players get crushed** by older servers and heavy spenders in server-versus-server events.
3. **Pack fatigue.** Constant pop-up offers and a feeling that every system has its own paywall.
4. **Weak attachment.** The furnace is a building; nobody loves a building.
5. **Sameness.** The frozen-apocalypse look has been copied by many games since; a new game in the same snow reads as a clone in an ad feed.

## 2. What makes Rainkeep different

These six pillars are all in the game. Each one answers a complaint above.

1. **A new world: the desert that forgot the rain.** Sun-baked sandstone, palm groves, turquoise water, sandstorms and heatwaves. It is instantly distinguishable from the snow games in an ad feed, but the survival logic is just as primal: water is life. The setting also gives the game a natural day and night cycle, warm and cool palettes, and a hopeful ending (the rain coming back) that a frozen setting struggles to deliver.
2. **A living water source: the Rainwyrm.** Your "furnace" is a water dragon coiled in the keep's spring, rendered in real-time 3D. It grows through seven forms (Hatchling, Whelp, Drake, Tidewyrm, Elder, Ascended, Primordial), visibly gets bigger, sprouts fins, horns and whiskers, and at the end trails a small rain cloud of its own. It blinks, hums when petted, calls a torrent to open every battle, and goes dormant if the wells run dry. Players name it, and at Lv 12 they choose its Ascension (Monsoon, Mistveil or Floodheart). It gives players a pet to protect and a canvas for cosmetic spending (skins), revenue that doesn't add pay-to-win pressure.
3. **Survival that stays real all game.** Water has two jobs: survivors drink it and the wyrm breathes it as cooling mist. Weather is forecast ahead of time (Dust Haze, Sandstorm, Heatwave), and the sun "hunts water", so every time the wyrm grows, storms run hotter. Middays run hotter and desert nights run cold, so the right mist changes through the day. Players choose the mist (Drizzle, Steady, Downpour), trading water for cooling, and from Lv 6 can let an Attuned wyrm set it for them. From Lv 3 the wyrm can **Call the Rain**: a short shower on a long recharge that refills the wells, cools the keep and calms a sandstorm, so the big storm of the day becomes a decision about when to spend it. Heat makes survivors sick, the Healer's House treats them, and in a Scorching keep the sick can be lost. If the cisterns run dry, the wyrm sleeps and families leave to find water elsewhere.
4. **A real 3D keep and world.** The keep and the Dunes are 3D scenes, not static backdrops: buildings change shape as they level up, villagers carry water jars between the well and their work, camels circle the walls, palms sway harder in a sandstorm, lanterns come on at night, and caravans visibly cross the Dunes. You can orbit and zoom. This is the screenshot and the ad.
5. **Heroes matter at home, not just in fights.** Every hero can be stationed as a Steward of one building (Bashir boosts the wells, Halima speeds healing, Zahra cools the keep). Collecting heroes improves your keep as well as your squad, which deepens the gacha without adding more combat power. The cast is illustrated, diverse and original.
6. **Offline protection and fair competition.** While you're away, the wyrm keeps a gentle mist: production continues at a reduced rate and nobody gets sick. Oasis Wars, the leaderboard event, matches players into brackets by spending (Free, Supporter, Patron), so whales fight whales and newcomers fight newcomers. In 2.1 the nine rival keeps are simulated; in a live version they would be real players on bracketed servers.

### Naming and IP

Everything is original: the setting (the Long Noon, the Rainwyrm, the Sunheart), building names, hero names and bios, currencies (Starglass, Beacon Tokens, Field Journals), the 3D models (generated in code), the portraits and the icon. Heroes draw on many cultures without depicting any real people, places or religious sites. Before launch, run a trademark search on "Rainkeep" in the US, EU, UK, Japan and Korea. Do not use "Whiteout Survival" as a store keyword or in ad copy; Apple rejects competitor names in keywords and it invites a trademark claim. Comparative messaging ("tired of losing to whales?") is fine without naming them; have a lawyer review it.

## 3. Core loop

```
Minute to minute:  check forecast → set the mist → tap surplus bubbles → start an upgrade → send a caravan
Every few minutes: settle a keep incident → trade with a visiting merchant → Call the Rain before the storm
Session (5-10 min): claim quest → clear an expedition stage → level heroes → recruit → strike the Colossus
Day:               gift calendar, daily duties, patrol cache, Oasis Stipend, Caravan help and donations
Event (20 min*):   Rain Festival → Beast Hunt → Builder's Rush → Oasis Wars, on rotation
Season:            30-tier Wellkeeper's Ledger, new skins, more Dunes and Burning Line
```
*Game time. Timers and rates run about 30× faster than a typical live-service game.

### Systems in version 2.1

| System | What it does | Where |
|---|---|---|
| Rainwyrm | Cooling, water drinking, 3 mist settings, 15 levels and 7 forms, naming, petting, Ascension branch, Wyrm's Torrent in battle | `core.js`, `art3d.js` |
| Water + survival | Survivors drink water, the wyrm breathes it; forecast queue, storms that scale with wyrm level, hot middays and cold nights, Attuned mist, heat bands, sickness, healing, losses, thirst, food, housing, offline protection | `core.js` tick |
| Keep | 12 buildings, auto/manual workers, 10 research lines × 10 levels, Storehouse protection | `DATA.buildings`, `DATA.techs` |
| Keep life | Call the Rain (an active wyrm ability with a recharge and Rain Charms), surplus bubbles over working buildings, 16 keep incidents with priced choices and random outcomes (boosts, survivors, Starglass, setbacks), travelling merchants whose offers follow what the keep has too much of, timed boosts | `keep.js`, `DATA.incidents`, `DATA.merchant` |
| 3D presentation | Procedural low-poly models in three detail tiers per building, day and night, weather (fog, dust, heat, rain), a merchant camp, incident and surplus markers, villagers, camels, mist particles, camera fitting, orbit and zoom, picking; 2D fallback | `art3d.js`, `town3d.js`, `world3d.js`, `town.js` |
| Troops | 3 classes in a counter triangle, Barracks-scaled strength, march cap, housing cap | `DATA.troops` |
| Heroes | 18 illustrated heroes, 3 rarities, levels capped by stars and Rainwyrm level, skills that grow with stars, Steward posts | `DATA.heroes`, `art2d.js` |
| Recruitment | Published odds, 40-pull Legendary pity, 10-pull Epic guarantee, featured hero rotating each event, shard pouches | `DATA.recruit` |
| Expedition | 60 stages in 6 chapters with story, 12 bosses, an ending ("The Rains"), the endless Burning Line, patrol cache | `DATA.chapters` |
| The Dunes | Seeded 21×21 map, dust haze, gathering caravans, beasts, raider camps, 12 story ruins with choices, raids on the keep | `world.js`, `world3d.js` |
| Caravan | 3 alliances, AI members who help timers, 5 Caravan techs, donations, points shop, gift chests, reactive chat, Colossus raid | `caravan.js` |
| Meta | 49 chapter quests, daily duties + chests, 7-day gift calendar, 33 achievements, mail, backpack, 4 rotating events including Oasis Wars | `events.js` |
| Season pass | 30-tier free and premium Ledger with two skins | `DATA.pass` |
| Store | Starter offer, monthly card, pass, growth fund, daily kit, value chest, Starglass, skins, crates | `DATA.shop`, `native.js` |
| Polish | Procedural audio on a Hijaz scale, haptics, notifications, tutorial pointer, save codes, offline play, bundled fonts | `audio.js`, `native.js`, `sw.js` |

## 4. Monetization

Target: match the genre's spending ladder while putting more of the spend into breadth (cosmetics, convenience, collection) and less into raw PvP power. Spend brackets in PvP are what let us keep whales (who carry most genre revenue) while telling free players the game is fair.

| Product | Price (USD) | Role |
|---|---|---|
| Founder's Cache: Starglass, tokens, journals, **permanent second builder** | $0.99, once | Converts a free player into a payer early. The second builder is the most useful thing in the game, so this is the single most important offer |
| Oasis Stipend: 300 Starglass now and 90 a day for 30 days | $4.99 / 30 days | Daily login habit plus recurring revenue |
| Wellkeeper's Ledger premium track | $9.99 / season | Mid-spender anchor; capstone is a wyrm skin |
| Starglass packs | $1.99 to $99.99 | Speedups, recruits, crates |
| Wyrm skins (Oasis Jade, Obsidian Tide; Deepwater Sapphire earnable with free Starglass) | $4.99 to $6.99 | Cosmetic only, and in 3D a skin is a showpiece players see every session |
| Growth Fund: 6,000 Starglass paid out at Rainwyrm Lv 5, 8, 10, 12 and 15 | $14.99, once | Commits mid-spenders to the long game; pays back only if they keep playing |
| Sandstorm Kit: speedups, water crates and tokens | $2.99, once a day | Low-friction daily impulse buy |
| Warden's War Chest: Starglass, tokens and a Legendary Shard Pouch | $19.99 | High-value anchor for heavier spenders |
| Caravan gift chests | n/a | Every purchase by a Caravan member sends everyone a small gift: social proof that spending helps the group |
| Hero-specific banners and event packs *(live ops)* | $4.99 to $99.99 | High-spender depth, tied to live events |
| VIP levels from lifetime spend *(planned)* | n/a | Convenience perks; never PvP stats |

**Pricing anchors in the game:** a single recruit costs 150 Starglass. The $9.99 pack buys about 4.7 recruits, and a 10-pull costs 1,350 Starglass, about $19. That is in line with genre norms; tune it in soft launch.

### Store and legal compliance (non-negotiable)

- **Apple in-app purchase** for all digital goods (App Store Review Guideline 3.1.1). The web build simulates purchases. The App Store build routes them through StoreKit via RevenueCat, which validates receipts server-side (see NATIVE.md).
- **Gacha odds disclosed before purchase.** Apple requires it for paid random items, and so do China, Korea and Japan. The game has an Odds sheet on the Beacon screen.
- **Paid random items are restricted in some countries** (Belgium bans them outright). Build a region switch that turns paid recruits into direct purchases or shard shops.
- **Age rating, parental controls and spending limits for minors**, plus clear refund flows. In-game currency prices must show real-money equivalents where local law requires.

## 5. How we pull Whiteout Survival players over

1. **Message:** "The survival game you were promised." Ad creative is real Rainkeep gameplay captured from the 3D keep: a sandstorm rolling in at dusk, the player switching the wyrm to Downpour, mist rolling over the keep, villagers safe in the shade. Because the gameplay is real, the ad-to-game gap that drives churn in this genre is closed.
2. **Something new to look at.** A warm, sunlit desert with turquoise water stands out in an ad feed full of snow. It signals "new game" rather than "another clone".
3. **Fresh, fair servers at launch.** Everyone starts on day one, and Oasis Wars spend brackets are announced up front.
4. **The Rainwyrm as the face of the game.** Skins, wyrm-naming, sharing your wyrm's form. A lovable 3D mascot is a UA and social asset that a furnace can't be.
5. **Returning-veteran onboarding.** Skip-tutorial for experienced 4X players and a "Warden's Welcome" catch-up event for anyone who joins a server late.
6. **Creator program** with mid-size strategy and Whiteout Survival YouTubers and streamers at soft launch. Give them early access, custom wyrm skins and Caravan-founder codes.

## 6. From 2.1 to a live multiplayer game

Version 2.1 is a complete single-player game: every system above works offline, with simulated Caravan members and rival keeps. Turning it into a live-service multiplayer game means swapping the simulations for real players:

- **Real Caravans:** shared help requests, donations and Colossus raids backed by a server, plus chat with moderation.
- **Shared Dunes:** one map per server, where caravans can meet rival keeps.
- **Oasis Wars between servers:** real bracketed leaderboards each season, with server transfers at the start of a season.
- **Live ops:** monthly hero banners, new chapters past the Sunheart, seasonal skins and event packs, all tuned through remote config.

## 7. What it takes to ship and scale

This folder is a **complete, playable single-player game** (HTML5 + WebGL, wrapped for iOS/Android with Capacitor), ready for TestFlight playtests and a small-scale store release. A top-grossing live multiplayer game is a much larger project. Rough figures for planning; each should be validated with a studio or publisher:

| Phase | Goal | Typical team / time |
|---|---|---|
| Version 2.1 (this) | Full single-player game in 3D, store-ready shell, simulated multiplayer. Playtest with genre players and soft-launch small | Done; iterate with data.js |
| Live multiplayer | Hand-authored hero art and wyrm animation pass, server-authoritative backend, real Caravans, shared Dunes, analytics | 6-12 people, 4-6 months |
| Soft launch | 1-3 test markets (commonly Canada, Australia, Philippines). Hit retention and payer gates before scaling spend | 15-30 people, 3-6 months |
| Global launch | Paid user acquisition at scale, live ops, alliances and PvP | 30-80+ people, ongoing |

**Gates before spending real UA money.** These are genre rules of thumb to confirm in soft launch:

- Day-1 retention around 40%, Day-7 around 15%, Day-30 around 6% or better
- A payer conversion rate of a few percent in the first 30 days
- Projected 180-day revenue per install above cost per install with margin. 4X installs in tier-1 markets commonly cost well into double-digit dollars

**What a live backend adds that 2.1 doesn't have:** accounts and cloud saves (2.1 has on-device saves and save codes), server-authoritative timers and economy (2.1 trusts the device, which is normal for a single-player game but not for competitive multiplayer), anti-cheat, analytics events for every economy action, remote config for tuning, push notifications ("Sandstorm in 10 minutes"), chat and moderation.

**Performance.** The 3D scenes are built for phones: static geometry is merged per material so a fully built keep is a few hundred draw calls, there is one shadow-casting light, the shadow map drops to 1024 px on small screens, the pixel ratio is capped at 2, and rendering stops whenever the tab is hidden or another screen is open. Players on older devices can switch 3D off in Settings; the 2D renderer plays the same game.

**Funding and publishing.** Games at Whiteout Survival's revenue are backed by very large user-acquisition budgets. Realistic routes are: (a) take this game to a mobile strategy publisher, or (b) raise for a lean team to reach soft launch and prove the retention gates, then raise or partner for UA.

### Honest risk statement

Most 4X and survival-strategy launches never reach top-grossing charts, regardless of quality, because the category is dominated by a few incumbents with large UA budgets. Nothing in a design document can guarantee revenue. What the plan above does is make the risky bets cheap first (prototype, then soft-launch metrics) and only spend big once players prove they stay and pay.

## 8. Balance and pacing (measured)

The game was tuned with an automated player that plays every system the way a strong, active player would: it builds, researches, trains, recruits, stations stewards, gathers, hunts, explores ruins, donates, raids with its Caravan, claims every reward, sets the mist before storms (Attuned mist from Lv 6) and fights the next stage whenever the odds look good. Since 2.1 it also taps every surplus bubble, calls the rain whenever it's ready, settles every incident with the first choice it can afford and takes every merchant trade it can pay for. Over 13 hours that is about 130 showers, 610 bubbles, 70 incidents and 240 trades. These are the measured results (game time, which runs about 30× faster than a live-service game):

| Milestone | Free player (four runs) | With the Founder's Cache (two runs) |
|---|---|---|
| Rainwyrm Lv 5 | 12-29 min | 7-17 min |
| Rainwyrm Lv 10 | 2.9-3.3 h | 2.5-2.6 h |
| Stage 30, the Sand Colossus | 1.3-3.1 h | 1.5-2.1 h |
| Stage 60, the Sunheart (story ending) | 4.9-5.7 h | 4.1-5.2 h |
| Burning Line depth 10 | 6.8-8.3 h | 5.5-7.3 h |
| Rainwyrm Lv 14 | 9.8-10.8 h | 8 h |
| Rainwyrm Lv 15, Primordial form | 12.3 h (one run), past 13 h (three) | 11.1 h |
| All 49 chapter quests | 13+ h | 12-13+ h |

Keep life rewards attention without replacing the core economy. A player who ignores it, or taps bubbles only every 10 minutes, reaches the Sunheart in about 6.5 h, roughly the pre-2.1 pace. Late levels (past Rainwyrm Lv 10) cost more since 2.1 (`lateCostGrowth` 1.7), so the extra income speeds up the story but not the endgame: Lv 14 still lands near 10 hours, as before. Measured in resources, an always-attentive player gets about 15% more output from bubbles and 10-15% more water from showers. Incidents roughly break even on stone and food: they cost resources up front and pay back in boosts, water, Starglass and survivors. Merchants mostly turn surplus food into journals, Rain Charms and the scarce resource. Earlier drafts were much more generous: a 2-minute bubble every 4 minutes, two 15-minute speedups per merchant and big rain bursts brought the ending down to under 3 hours, and they were cut back.

Run-to-run spread is wide (gacha luck and raid timing move stage 60 by up to an hour), so tune with several seeds, not one.

In every run the keep never ran dry (zero minutes thirsty or dormant) and sickness stayed under 0.05% of survivor-time: a player who digs the wells and sets the mist before storms stays safe, while one who ignores water loses survivors and production.

A human player is less efficient than the bot, so expect the story to take roughly two to three times as long: a handful of evenings.

Other measured outcomes:

- **Water is the first lesson.** A new keep loses water every minute until the first quest (dig the Deep Well) is done, so players learn the core mechanic in the first minute.
- **Every resource is used.** Building costs draw on stone, water (mudbrick and mortar), food and copper from level 3 up. Stone and copper are the late-game constraints; food piles up for training and donations.
- **Nights matter.** Desert nights run 7°C colder and middays 2°C hotter, so a wyrm left on Steady wastes water after dark. Attuned mist drizzles at night and pours before storms. That alone saves enough water to speed the free player's story by about a tenth.
- **Old saves carry over.** Saves from 2.0 load into 2.1 at the same chapter quest (the four new quests are stepped over), and the keep's new systems start up on the first tick.
- **No errors** across all automated runs.

## 9. Next steps

1. Playtest with 20+ genre players; watch the first 10 minutes, the first sandstorm and the first caravan across the Dunes.
2. Ship to TestFlight using NATIVE.md, with real purchases in the App Store sandbox. Check frame rate on a 3-4 year old iPhone and Android mid-ranger.
3. Commission hand-painted key art of the Rainwyrm and the six Legendary heroes for the store page and ads.
4. Add analytics hooks (tutorial funnel, first purchase view, storm outcomes, when players call the rain, which incident choices they pick, day-1/7/30 retention).
5. Soft-launch in one or two test markets and check the retention gates in section 7 before spending on user acquisition.
6. If retention holds, start the live multiplayer backend in section 6.
