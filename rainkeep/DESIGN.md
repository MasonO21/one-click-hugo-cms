# Rainkeep: game design and business plan

**Pitch:** The rain stopped a generation ago. Raise the last Rainwyrm, a water dragon whose cooling mist keeps a desert keep alive, and dig the wells that keep your people drinking. Rainkeep is a 3D survival city-builder with heroes, expeditions and alliances, aimed at the same audience as Whiteout Survival, with the survival game that its ads promise kept at the center of play.

This document covers what the game in this folder (version 4.3) contains, what makes it different enough to pull players away from Whiteout Survival, how it makes money, and what it would take to ship it.

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

These seven pillars are all in the game. Each one answers a complaint above.

1. **A new world: the desert that forgot the rain.** Sun-baked sandstone, palm groves, turquoise water, sandstorms and heatwaves. It is instantly distinguishable from the snow games in an ad feed, but the survival logic is just as primal: water is life. The setting also gives the game a natural day and night cycle, warm and cool palettes, and a hopeful ending (the rain coming back) that a frozen setting struggles to deliver.
2. **A living water source: the Rainwyrm.** Your "furnace" is a water dragon coiled in the keep's spring, rendered in real-time 3D: a sculpted head with golden slit eyes and a jaw that breathes the mist, ear frills, long whiskers, a scalloped fin sail down its back and iridescent scales. It grows through nine forms (Hatchling, Whelp, Drake, Tidewyrm, Elder, Ascended, Primordial, Stormcrowned, Skyriver), visibly gets bigger, its fins and frills widen and its horns lengthen and branch, trails a rain cloud of its own, wears a crown of storm horns with lightning in its cloud, and finally becomes a river that flies. It blinks, hums when petted, calls a torrent to open every battle, and goes dormant if the wells run dry. Players name it, and at Lv 12 they choose its Ascension (Monsoon, Mistveil or Floodheart). It gives players a pet to protect and a canvas for cosmetic spending (skins), revenue that doesn't add pay-to-win pressure.
3. **Survival that stays real all game.** Water has two jobs: survivors drink it and the wyrm breathes it as cooling mist. Weather is forecast ahead of time (Dust Haze, Sandstorm, Heatwave), and the sun "hunts water", so every time the wyrm grows, storms run hotter. Middays run hotter and desert nights run cold, so the right mist changes through the day. Players choose the mist (Drizzle, Steady, Downpour), trading water for cooling, and from Lv 6 can let an Attuned wyrm set it for them. From Lv 3 the wyrm can **Call the Rain**: a short shower on a long recharge that refills the wells, cools the keep and calms a sandstorm, so the big storm of the day becomes a decision about when to spend it. Heat makes survivors sick, the Healer's House treats them, and in a Scorching keep the sick can be lost. If the cisterns run dry, the wyrm sleeps and families leave to find water elsewhere.
4. **A real 3D keep and world.** The keep and the Dunes are 3D scenes, not static backdrops: buildings change shape as they level up, villagers carry water jars between the well and their work, camels circle the walls, palms sway harder in a sandstorm, lanterns come on at night, and caravans visibly cross the Dunes. The keep has real height: it is a terraced oasis at the head of a canyon, with the spring sunk in a stepped basin, the houses and barracks on raised terraces, an upper town and a temple carved into the cliff, so every building has a place rather than a slot on a ring. You can pan across it, zoom from the whole canyon down to street level and turn it. This is the screenshot and the ad. The interface stays out of its way: one header bar, three medallions on the side instead of a wall of buttons, and level stars instead of name plates, so the screen is mostly keep.
5. **Heroes matter at home, not just in fights.** Every hero can be stationed as a Steward of one building (Bashir boosts the wells, Halima speeds healing, Zahra cools the keep). Collecting heroes improves your keep as well as your squad, which deepens the gacha without adding more combat power. The cast is illustrated, diverse and original.
6. **Offline protection and fair competition.** While you're away, the wyrm keeps a gentle mist: production continues at a reduced rate and nobody gets sick. Oasis Wars, the leaderboard event, matches players into brackets by spending (Free, Supporter, Patron), so whales fight whales and newcomers fight newcomers. In 4.3 the nine rival keeps are simulated; in a live version they would be real players on bracketed servers.
7. **A story worth following.** Genre leaders tell their story in a paragraph per chapter. Rainkeep has three acts and three endings, a scene with a recurring cast before every boss, the last wyrm's sealed kin to bring home one by one (each visible on the canyon rim of your keep), and a three-chapter tale for every hero. Story is retention: a scene at the next boss and a tale chapter at the next hero level are reasons to come back that cost nothing to run.

### Naming and IP

Everything is original: the setting (the Long Noon, the Rainwyrm, the Sunheart), building names, hero names and bios, currencies (Starglass, Beacon Tokens, Field Journals), the 3D models (generated in code), the portraits and the icon. Heroes draw on many cultures without depicting any real people, places or religious sites. Before launch, run a trademark search on "Rainkeep" in the US, EU, UK, Japan and Korea. Do not use "Whiteout Survival" as a store keyword or in ad copy; Apple rejects competitor names in keywords and it invites a trademark claim. Comparative messaging ("tired of losing to whales?") is fine without naming them; have a lawyer review it.

## 3. Core loop

```
Minute to minute:  check forecast → set the mist → tap surplus bubbles → start an upgrade → send a caravan
Every few minutes: settle a keep incident → trade with a visiting merchant → Call the Rain before the storm
Session (5-10 min): claim quest → clear an expedition stage → level heroes → recruit → strike the Colossus
                   → climb a Mirage Spire floor → spend Duel tickets → forge the Warden's Gear
Day:               gift calendar, daily duties, patrol cache, Oasis Stipend, Caravan help and donations
Event (20 min*):   Rain Festival → Beast Hunt → Forge Festival → Builder's Rush → Spire Rush → Oasis Wars, on rotation
Duel season (3 h*): climb the ladder, earn Glory by rank, slip back and climb again
Season:            30-tier Wellkeeper's Ledger, new skins, more Dunes and Burning Line
```
*Game time. Timers and rates run about 30× faster than a typical live-service game.

### Systems in version 4.3

| System | What it does | Where |
|---|---|---|
| Rainwyrm | Cooling, water drinking, 3 mist settings, 20 levels and 9 forms, naming, petting, Ascension branch, Wyrm's Torrent in battle | `core.js`, `art3d.js` |
| Water + survival | Survivors drink water, the wyrm breathes it; forecast queue, storms that scale with wyrm level, hot middays and cold nights, Attuned mist, heat bands, sickness, healing, losses, thirst, food, housing, offline protection | `core.js` tick |
| Keep | 13 buildings, auto/manual workers, 12 research lines × 15 levels, Storehouse protection; costs bend three times (Lv 10, Lv 15) so each act has its own pace | `DATA.buildings`, `DATA.techs` |
| Sunsteel Forge | Smelts stone and copper into Sunsteel while lit (racks cap the stock); six pieces of Warden's Gear, 50 levels in five tiers, capped by the Forge's level; squad attack, defense and health plus a bonus per troop class | `forge.js`, `DATA.forge` |
| Keep life | Call the Rain (an active wyrm ability with a recharge and Rain Charms), surplus bubbles over working buildings, 16 keep incidents with priced choices and random outcomes (boosts, survivors, Starglass, setbacks), travelling merchants whose offers follow what the keep has too much of, timed boosts | `keep.js`, `DATA.incidents`, `DATA.merchant` |
| Channels | A pipe-turning water puzzle with generated levels (a random spanning tree from the spring, every piece turned at random, so Channel 12 is the same for everyone), par and three stars, eight star chests, a daily puzzle and three dowsing hints a day. Four puzzles open per Rainwyrm level, so it paces with the keep. It is the game's mini-game for ads: real gameplay, about water, in ten seconds | `channels.js`, `DATA.channels` |
| The Rainwyrm's bond | The mascot asks for things every few minutes (rain, petting, dates, a Downpour, a march home, a puzzle, a storm ridden out). Wishes are tied to things players already do, fade if ignored, and raise a 10-level bond with small lasting perks. A reason to look at the wyrm every session | `bond.js`, `DATA.bond` |
| Keep gardens | Nine monuments with fixed spots on the terraces (a fountain inside the gate, a palm court, a pergola, herb beds, twin wyrm statues before the temple, a watchfire beacon, a Sunsteel sculpture, a Starglass obelisk and a glass mosaic court). Each climbs five levels for a small lasting bonus (cooling, dates, less drinking, healing, breath, earlier warnings, squad attack, production, well water). Six are paid in food and stone scaled to the keep (never water or copper, which the buildings need), so late surpluses have a use; costs grow 1.7× a level. Each has three model tiers in the 3D keep, and Show me flies the camera to it | `decor.js`, `DATA.decor`, `town3d.js` |
| Cloud Run | A 45-second arcade flight from Rainwyrm Lv 5, three a day, with the real 3D wyrm flying (the same rigged model as the keep, bent along its flight path; a 2D drawing stands in without WebGL). Steer through rain clouds (storm clouds count triple) and golden drops, around dust devils, with three hearts. Rain rings come every 520-820 m; each one threaded in a row adds 0.2 to a cloud multiplier (up to ×2), which slips a step after 4 s without a ring and resets on a hit. Every flight that lasts 14-30 s brings one Rain Pearl, with a small chance of more. Pearls buy **Wyrm Gifts**: Thick Scales (+1 heart, two levels), Long Wind (+5 s, three), Cloud Call (pickups drift to the wyrm, three), Golden Eye (more drops, two), Rain Song (+10% water, five) and Storm Rider (storm clouds count four, the first dust devil glances off). Clouds come home as water scaled to the keep, drops as Starglass, pearls as pearls, every five clouds as bond. A second ad-ready mini-game with its own small progression, and the mascot doing something | `cloudrun.js`, `DATA.cloudRun`, `art3d.js` |
| Battle tactics | Battles play round by round. Each squad hero brings one skill by class of passive (Guard halves damage for two rounds, Charge and Volley strike extra, Mend heals, Sunder cuts the foe's defense) that charges over three rounds and fires on a tap. Foes wind up a heavy blow every few rounds (bosses more often), shown a round ahead; Guard blunts it and the Rainwyrm's breath, once a battle, breaks it. Auto-battle plays the same rules, so the bot and the instant mode stay balanced, and enemy stats rose 12% to keep the old difficulty for a tactical player | `core.js` (`newBattle`, `battleStep`, `autoActs`), `ui.js`, `DATA.battle` |
| Bloom | From Act II, groves planted on open sand within reach of the keep (one tap, from a tile or the Bloom sheet, nearest first). They grow without tending, from seedlings (4 min) to a young grove to an oasis (16 min), redrawn in 3D at each stage. Each oasis adds 0.6% food and 0.4% well water; 5, 12, 20 and 30 oases add 0.5 °C cooling, +3% production, 8 s of rain, and another 0.5 °C, +2% and the Desert Bloom skin. Thirty groves at most, priced in water and food scaled to the keep and 6% dearer each (all thirty cost about half the water and food of one late Rainwyrm level). It turns the late-game water surplus into visible change on the map: the desert going green is the story's promise, kept | `bloom.js`, `DATA.bloom`, `world3d.js` |
| The Crossing | A decision-heavy run alongside the power-check modes (Spire, Duels): route choice, attrition and boons. Foes are a fraction of the squad's own stats as it set out (0.65 at row 1, +0.06 a row; elites and the Warden ×1.2 on top), so difficulty holds steady across the whole game and the reward is in the choices. The careful auto-player (ui-independent `KH.crossing.auto`) reaches the oasis in 30-50% of runs right after unlock and 55-80% later, as stronger breath and skills tell (the balance bot, which plays tighter, won all its runs at a slightly softer setting); most losses are at the Warden, and losing there still brings home nine rows' chest. Rewards scale with rows crossed (10 Starglass and 2 journal units a row, Sunsteel from row 4, a Beacon Token from row 7, +80 Starglass and 2 Beacon Tokens for the Warden). Routes come in keep time like the Deepspring's refines, so the bot measures them too | `crossing.js`, `DATA.crossing` |
| Deepspring | The endgame sink and long tail, after the keep is finished at Rainwyrm Lv 20 (Whiteout Survival's Fire Crystal furnace levels play the same part). Tideglass gates it: refine charges build in keep time (one per 20 minutes, 12 waiting, so offline time counts), each refine costs water and copper and gives 1 to 5 (1.71 on average); the Far South (1 a stage, 10 a boss), Spire floors past 100 (1, or 8 every tenth) and Colossus kills (1) add a little. 30 levels cost 8 Tideglass rising 10% a level (1,316 in all) plus 600K stone and its share of the other resources, rising 12% a level. Each level: +2% troop strength, +2% production. Every fifth: hero level cap +5 (105 to 135 at the top, a sink for late Field Journals) and a perk through the existing bonus keys. A Starglass refine when no charge waits (60, then 15 more each that day) and a daily $4.99 Tideglass Kit are its spending levers | `deepspring.js`, `DATA.deepspring` |
| Interface | One header bar (wyrm medallion with its level, the four stores, Starglass, menu) over a one-line sky ribbon (temperature, survivors, next storm); details in a Stores sheet. The side rail shows the event, a Rewards hub and a Play hub (tiles with a back arrow into each member's sheet), plus whoever is visiting. Status chips go top right, urgent first, four at most. The quest is one ribbon. In the 3D keep a building shows a brass star with its level and a chevron when an upgrade is ready; names appear close up, for the quest's building and for the one being looked at. Night indigo, brass and turquoise throughout, with an eight-point star lattice, brass rules, arch tabs and arch tiles | `ui.js`, `style.css`, `town.js` |
| Painted art | 89 paintings made with Higgsfield (GPT Image 2 at low quality, half a credit each; 99 generations including style tests, about 49 credits): 22 hero and 3 cast portraits, 10 foe families shown as class-ringed medallions (bosses get a gold ring and a crown), 3 act backdrops for story scenes, the title painting, 12 building headers, 6 event banners, 9 store packs, 6 Starglass tiers, 12 Dunes ruins, 3 endings, the grotto behind the Rainwyrm's portraits and its head on the header medallion, plus the app icon and splash. The Rainwyrm itself stays live 3D, drawn over the grotto, so every skin, form and Ascension shows as it is. One prompt template per kind keeps the set consistent (gold sunsets for Legendary, violet dusk for Epic, moonlit blue for Rare). art2d.js loads them as one stylesheet of background images, so the HTML the UI diffs stays small; the single-file build inlines them (about 4.5 MB). Heroes, foes and offers added later fall back to drawn SVG | `artmap.js`, `art2d.js`, `art/` |
| 3D presentation | The Rainwyrm as a skinned spine (belly plates, iridescent scales, a scalloped fin sail rebuilt with it every frame) under a sculpted head with a hinged jaw, horns that lengthen and branch with its forms, ear frills, a crest and long whiskers; procedural low-poly models in three detail tiers per building, day and night, weather (fog, dust, heat, rain), a merchant camp, incident and surplus markers, villagers, camels, mist particles, a terraced canyon layout shared by both renderers (`DATA.keep`), a free camera (pan, zoom toward the finger, turn and tilt, fling, collision with the canyon walls, home button), picking; 2D fallback | `art3d.js`, `town3d.js`, `world3d.js`, `town.js` |
| Troops | 3 classes in a counter triangle, Barracks-scaled strength, march cap, housing cap | `DATA.troops` |
| Heroes | 22 illustrated heroes (4 join the pool in Act II), 3 rarities, levels capped by stars and Rainwyrm level, skills that grow with stars, Steward posts | `DATA.heroes`, `art2d.js` |
| Recruitment | Published odds, 40-pull Legendary pity, 10-pull Epic guarantee, featured hero rotating each event, shard pouches | `DATA.recruit` |
| Expedition | 150 stages in 15 chapters and three acts, 30 bosses, three endings ("The Rains", "The Long Rains", "The Wyrmsong"), the endless Far South from stage 151, patrol cache. Past stage 100 each stage climbs at 0.75 of the Act II enemy curve, so the third act's bosses every five stages still end the story soon after a keep reaches Skyriver | `DATA.chapters`, `DATA.enemy.act3Ease` |
| Story scenes | A short dialogue before every boss and at each act's opening (33 scenes), played full screen with portraits over a backdrop for each act: the keep's recurring cast (Elder Maram, who remembers the last rain; Captain Hadi of the scouts; Nima, a child born in the drought), the squad's lead hero, the wyrm, the kin and the boss. Tap to advance, Skip, a setting to turn them off, and a Chronicle that replays chapters, scenes and endings. Portraits are drawn by the same generator as the heroes | `story.js`, `lore.js` (`DATA.cast`, `DATA.scenes`) |
| The kin | Act III's elder Rainwyrms, sealed in glass, salt, a frozen storm and ash and freed by its chapter bosses: Nadaa the Dew Wyrm (survivors drink 5% less), Seyl the Flood Wyrm (+6% well water), Barq the Storm Wyrm (+10% breath, +3% squad attack), Sahab the Cloud Wyrm (faster, longer rain), and Ghaitha, the Mother of Rains (+5% production, 1 °C cooler) at the story's end. Each rests on the canyon rim of the 3D keep, with a camera flight to it | `story.js`, `lore.js` (`DATA.kin`), `town3d.js` |
| Hero Tales | Every hero has a three-chapter story (66 in all) about who they are at home: Zahra goes back for the door she left, Bashir answers a knocking from the deep shaft, Samira finally delivers a forty-year-old letter. Chapters open at hero Lv 1, Lv 15, and Lv 30 with 2 stars; each is a page and a fight with that hero leading, paying Starglass, journals and the hero's own shards. The ending is a choice: the hero's battle skill 25% stronger, or their steward post 50% stronger. A reason to level and star heroes beyond the squad | `story.js`, `lore.js` (`DATA.tales`) |
| Trials | Mirage Spire: endless floors from stage 30, a rule twist on each floor (heat, sandstorm, glass floor, mirage, rising tide), a Warden every tenth floor, first-clear rewards. Dune Duels: 1,000-rank simulated ladder, tickets that refill with play, three challengers, rank milestones, 3-hour seasons, Glory shop | `trials.js`, `DATA.spire`, `DATA.duels` |
| The Dunes | Seeded 21×21 map, dust haze, gathering caravans, beasts, raider camps (every map has one within the haze line at Rainwyrm Lv 10, so the camp quest is never out of reach), 12 story ruins with choices, raids on the keep (raiders march visibly to the gate; rain on arrival weakens them and boiling water from the walls steadies the defenders); in Act II flooded oases (twice the water), Sunsteel veins and Saltborn Hives (tougher camps that pay Sunsteel) appear on top of the Act I layout | `world.js`, `world3d.js` |
| Caravan | 3 alliances, AI members who help timers, 5 Caravan techs, donations, points shop, gift chests, reactive chat, Colossus raid | `caravan.js` |
| Meta | 80 chapter quests, 18 daily duties + chests, 7-day gift calendar, 53 achievements, mail, backpack, 6 rotating events including Oasis Wars (Forge Festival and Spire Rush fall back to older events until the Forge and Spire are open) | `events.js` |
| Season pass | Ledger seasons: 30 free and premium tiers per season, a new season every 8 hours of play, Season 1 with two skins and every later season a new premium skin (six so far, then Starglass), rewards that scale with the keep, unclaimed rewards by mail | `DATA.pass`, `events.js` |
| Store | Starter offer, monthly card, pass, growth fund, daily kits, value chest, Starglass, skins, crates | `DATA.shop`, `native.js` |
| Patron program | 10 levels from lifetime spend (100 points per $1) plus 15 points a day for visiting; production, build and research speed, free finishes, offline bank, smelting, Duel ticket slots, daily chest; no combat stats | `patron.js`, `DATA.patron` |
| Polish | Procedural audio on a Hijaz scale, haptics, notifications, tutorial pointer, save codes, offline play, bundled fonts | `audio.js`, `native.js`, `sw.js` |

## 4. Monetization

Target: match the genre's spending ladder while putting more of the spend into breadth (cosmetics, convenience, collection) and less into raw PvP power. Spend brackets in PvP are what let us keep whales (who carry most genre revenue) while telling free players the game is fair.

| Product | Price (USD) | Role |
|---|---|---|
| Founder's Cache: Starglass, tokens, journals, **permanent second builder** | $0.99, once | Converts a free player into a payer early. The second builder is the most useful thing in the game, so this is the single most important offer |
| Oasis Stipend: 300 Starglass now and 90 a day for 30 days | $4.99 / 30 days | Daily login habit plus recurring revenue |
| Wellkeeper's Ledger premium track | $9.99 / season (a season is 8 hours of play) | Mid-spender anchor and the main recurring purchase across a long game; each season's capstone is a new wyrm skin |
| Starglass packs | $1.99 to $99.99 | Speedups, recruits, crates |
| Wyrm skins (Oasis Jade, Obsidian Tide; Deepwater Sapphire earnable with free Starglass) | $4.99 to $6.99 | Cosmetic only, and in 3D a skin is a showpiece players see every session |
| Growth Fund: 10,000 Starglass paid out at Rainwyrm Lv 5, 8, 10, 12, 15, 18 and 20 | $14.99, once | Commits mid-spenders to the long game; pays back only if they keep playing |
| Sandstorm Kit: speedups, water crates and tokens | $2.99, once a day | Low-friction daily impulse buy |
| Forge Kit: 600 Sunsteel, copper crates and speedups | $4.99, once a day after the Forge is built | The Act II daily buy: gear is the long sink, so this keeps mid-spenders paying after the story's first ending |
| Warden's War Chest: Starglass, tokens and a Legendary Shard Pouch | $19.99 | High-value anchor for heavier spenders |
| Growth Packs: resources for 15% (Growth Pack) or 40% (Grand Growth Pack) of the next Rainwyrm level, plus speedups | $4.99 and $19.99, once each per level, for 3 hours after each Rainwyrm level-up from Lv 6 | The genre's level-up offer. Each level-up is a natural buying moment, and because the pack is sized to the next level (the wyrm plus every building it needs) it stays worth buying late in the game, when a Starglass crate covers only a few percent of a level |
| Caravan gift chests | n/a | Every purchase by a Caravan member sends everyone a small gift: social proof that spending helps the group |
| Hero-specific banners and event packs *(live ops)* | $4.99 to $99.99 | High-spender depth, tied to live events |
| Patron program: 10 levels from lifetime spend (100 points per $1, 15 for each daily visit) | n/a | The genre's VIP ladder. Each level adds production, build speed, free finishes, a longer offline bank, faster smelting or Duel ticket slots, plus a daily chest. The Founder's Cache unlocks Patron 1, $10 reaches Patron 3, $40 Patron 5 and $1,000 Patron 10. Never combat stats, so Duels and Oasis Wars stay fair |

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

## 6. From 4.3 to a live multiplayer game

Version 4.6 is a complete single-player game: every system above works offline, with simulated Caravan members and rival keeps. Turning it into a live-service multiplayer game means swapping the simulations for real players:

- **Real Caravans:** shared help requests, donations and Colossus raids backed by a server, plus chat with moderation.
- **Shared Dunes:** one map per server, where caravans can meet rival keeps.
- **Oasis Wars between servers:** real bracketed leaderboards each season, with server transfers at the start of a season.
- **Live ops:** monthly hero banners, new chapters past the Sunheart, seasonal skins and event packs, all tuned through remote config.

## 7. What it takes to ship and scale

This folder is a **complete, playable single-player game** (HTML5 + WebGL, wrapped for iOS/Android with Capacitor), ready for TestFlight playtests and a small-scale store release. A top-grossing live multiplayer game is a much larger project. Rough figures for planning; each should be validated with a studio or publisher:

| Phase | Goal | Typical team / time |
|---|---|---|
| Version 4.6 (this) | Full single-player game in 3D, store-ready shell, simulated multiplayer. Playtest with genre players and soft-launch small | Done; iterate with data.js |
| Live multiplayer | Artist pass over the generated paintings, hero and wyrm animation, server-authoritative backend, real Caravans, shared Dunes, analytics | 6-12 people, 4-6 months |
| Soft launch | 1-3 test markets (commonly Canada, Australia, Philippines). Hit retention and payer gates before scaling spend | 15-30 people, 3-6 months |
| Global launch | Paid user acquisition at scale, live ops, alliances and PvP | 30-80+ people, ongoing |

**Gates before spending real UA money.** These are genre rules of thumb to confirm in soft launch:

- Day-1 retention around 40%, Day-7 around 15%, Day-30 around 6% or better
- A payer conversion rate of a few percent in the first 30 days
- Projected 180-day revenue per install above cost per install with margin. 4X installs in tier-1 markets commonly cost well into double-digit dollars

**What a live backend adds that 4.3 doesn't have:** accounts and cloud saves (4.3 has on-device saves and save codes), server-authoritative timers and economy (4.3 trusts the device, which is normal for a single-player game but not for competitive multiplayer), anti-cheat, analytics events for every economy action, remote config for tuning, push notifications ("Sandstorm in 10 minutes"), chat and moderation.

**Performance.** The 3D scenes are built for phones: static geometry is merged per material so a fully built keep is a few hundred draw calls, there is one shadow-casting light, the shadow map drops to 1024 px on small screens, the pixel ratio is capped at 2, and rendering stops whenever the tab is hidden or another screen is open. Players on older devices can switch 3D off in Settings; the 2D renderer plays the same game.

**Funding and publishing.** Games at Whiteout Survival's revenue are backed by very large user-acquisition budgets. Realistic routes are: (a) take this game to a mobile strategy publisher, or (b) raise for a lean team to reach soft launch and prove the retention gates, then raise or partner for UA.

### Honest risk statement

Most 4X and survival-strategy launches never reach top-grossing charts, regardless of quality, because the category is dominated by a few incumbents with large UA budgets. Nothing in a design document can guarantee revenue. What the plan above does is make the risky bets cheap first (prototype, then soft-launch metrics) and only spend big once players prove they stay and pay.

## 8. Balance and pacing (measured)

The game was tuned with an automated player that plays every system the way a strong, active player would. It builds, researches, trains, recruits, stations stewards, gathers, hunts, explores ruins, donates, raids with its Caravan and claims every reward. It sets the mist before storms (Attuned mist from Lv 6), taps every surplus bubble, calls the rain whenever it's ready, settles incidents, trades with merchants and fights the next stage whenever the odds look good. Since 3.0 it also lights the Forge and forges the cheapest gear piece it can afford, climbs the Mirage Spire when a floor looks winnable, spends every Duel ticket on the best challenger it can beat, and trades Glory for Sunsteel and Epic pouches. Since 3.2 it also spends spare Starglass on supply crates for whatever the next Rainwyrm level is short of and on speedups for long builds, keeping a reserve, and recruits with what is left. A free player can spend Starglass either way, and it makes a big difference, so the table shows both. These are the measured results from 36-hour runs of version 3.2 (game time, which runs about 30× faster than a live-service game):

| Milestone | Free, Starglass on crates and speedups (two runs) | Free, Starglass on recruits (three runs) | With the Founder's Cache (two runs, crates and speedups) |
|---|---|---|---|
| Rainwyrm Lv 5 | 11-12 min | 13-25 min | 7 min |
| Rainwyrm Lv 10 | 1.3 h | 2.0-3.0 h | 53 min |
| Stage 30, the Sand Colossus | 1.4-1.5 h | 1.4-1.5 h | 54 min |
| Stage 60, the Sunheart (end of Act I) | 3.3-3.6 h | 4.0-5.3 h | 2.0-2.5 h |
| Rainwyrm Lv 15, Primordial | 8.3-8.9 h | 12.0-13.8 h | 6.3-7.2 h |
| Dune Duels rank 100 / rank 1 | 7.4-7.9 h / 12.4-13.9 h | 7.6-8.7 h / 14.2-15.1 h | 5.2-5.4 h / 11.0-11.2 h |
| Stage 100, the Ember Throne (end of the story) | 11.5-11.7 h | 14.5-16.3 h | 9.0-10.0 h |
| Mirage Spire floor 100 | 15.1-16.1 h | 19.9-24.0 h | 13.2-14.1 h |
| Rainwyrm Lv 18 | 18.0-18.4 h | 26.1-29.2 h | 14.3-15.3 h |
| Rainwyrm Lv 20, Skyriver | 24.9-25.2 h | Lv 19 at 32-35 h, Lv 20 not reached by 36 h | 21.9-23.5 h |
| All 71 chapter quests | by 25 h | 70 of 71 by 36 h | by 23 h |

Every run forged all six pieces of gear to Lv 50 by 36 hours.

**Crates or recruits.** A supply crate holds a fixed amount that grows with the Rainwyrm's level, so 100 Starglass pays for most of an early building and still a useful slice of a late one. Recruits make the squad stronger but don't make the keep grow. Players who put Starglass into crates finish the story about 3-4 hours sooner and reach Lv 20 about 10 hours sooner, while Duel and Spire pacing barely changes. That is the intended trade: gacha for collectors and fighters, crates for builders. A player who wants both has a reason to buy more Starglass.

**How 3.0 made the game longer.** The story used to end at stage 60 after about 5 hours. Act II adds four chapters to stage 100, so the story now ends after 11-16 hours (depending on how Starglass is spent), two to three times longer, and the endgame (Lv 20, gear, the Spire) runs to 25-36 hours or more. Act I keeps roughly its old pace (3.5-5 hours to the Sunheart). Past stage 60 the enemy curve is the old Burning Line curve, so players already in the Burning Line drop straight into Act II at a fair difficulty. What carries a player through Act II is Rainwyrm Lv 16-20 (higher hero level caps, troops and research to Lv 15) and the Warden's Gear.

**The gear and the copper economy.** The first draft of gear doubled the squad's power and drew so much copper that building stalled: Act II ended at 10 hours and the wyrm stopped growing. The shipped version gives at most +42% squad attack and defense, +54% health and +30% to each troop class at gear Lv 50, and about a third more with Sunsteel Tempering at Lv 15. Sunsteel is smelted from stone, which piles up late, plus a little copper. Gear upgrades cost Sunsteel and stone. The Forge's racks cap how much Sunsteel waits unspent, so smelting stops instead of draining copper. Copper is still the late-game constraint: stone and food reach the millions while copper stays under 200k. Buildings past Lv 15 take a smaller copper share (13% of their stone cost instead of 22%) to keep the wyrm growing.

**Trials pay out without replacing the story.** The Spire's floor f fights like expedition stage 24 + 0.9f, and its twists make some floors harder than the stage they match. Both trials pay mostly in Sunsteel, Starglass, journals and occasional shard pouches. Their first drafts (an Epic pouch every 10 floors, generous early milestones) pulled Act I down to about 3.3 hours and were cut back.

**What spending buys.** The same bot can play as a paying player, buying through the simulated store so Patron points count, and spending Starglass the same way as the free bot above (crates, then speedups, then recruits). Measured over 36 hours of version 3.2:

| Milestone | Free (two runs) | Founder's Cache ($1, Patron 1; two runs) | Dolphin (about $150, Patron 6; two runs) | Whale (about $1,150, Patron 10; two runs) |
|---|---|---|---|---|
| Stage 60, end of Act I | 3.3-3.6 h | 2.0-2.5 h | 1.5-1.7 h | 1.2 h |
| Dune Duels rank 1 | 12.4-13.9 h | 11.0-11.2 h | 10.3 h | 8.6 h |
| Stage 100, end of the story | 11.5-11.7 h | 9.0-10.0 h | 7.4-8.4 h | 4.9-5.5 h |
| Rainwyrm Lv 20 | 24.9-25.2 h | 21.9-23.5 h | 17.9-19.1 h | 13.4-13.5 h |

The dolphin buys the Founder's Cache, the Growth Fund, the Oasis Stipend, the two daily kits, Ledger Premium every season and the $4.99 Growth Pack at each Rainwyrm level (about $70 of its $150). The whale adds the Grand Growth Pack at each level, plus a War Chest and a Hoard of Starglass every two hours until it has spent about $1,000. Spending buys time: the story ends about 1.5× sooner for $150 and about 2.2× sooner for $1,150. The Founder's Cache alone brings it about 2 hours closer, mostly through the second builder. Nothing in the store sells combat stats directly. A paying player's squad is stronger only through more recruits and faster growth, the same routes a free player has.

**Version 3.4 (Channels, the bond, raid preparation).** The bot now also clears every open channel puzzle at three stars, does the daily puzzle, feeds and pets the wyrm when it asks, and boils water for the walls when raiders come. That moves free pacing about an hour sooner (stage 60 at 3.0-3.2 h, story end at 10.0-10.5 h, Lv 20 at 23.6-23.9 h, two runs) and leaves the spend ladder where it was (Founder's Cache 10.0 h / 22.1 h, dolphin 8.2 h / 19.8 h, whale 4.3 h / 13.3 h to the story end / Lv 20). Every run reached bond Lv 10, cleared all 80 channel puzzles with 240 stars and repelled 110-115 raids.

**Version 3.5 (battle tactics, Cloud Run, keep gardens).** Battles now play round by round. The bot uses auto-battle, which follows the same rules as a player who fires each skill as it charges and saves the breath for a wind-up, and enemy stats rose 12% so that a tactical player meets the old difficulty. The bot also flies its three Cloud Runs a day and raises a resource-paid garden whenever it holds three times the price. Free pacing: story end at 9.8-11.7 h and Lv 20 at 24.8-25.0 h (two runs), about an hour later than 3.4. Founder's Cache 8.8 h / 21.6 h, dolphin 8.0-9.1 h / 19.5-20.9 h, whale 5.9-6.0 h / 13.2-15.0 h to the story end / Lv 20. The first garden prices (part water and copper, 2.2× a level) slowed the whale's Lv 20 from 13.4 h with gardens off to 14.5-15.7 h, so gardens now cost only food and stone, at about a third of the first price over five levels. Every run raised 35 of the 45 garden levels and stayed error-free.

**Version 4.0 (Act III, story scenes, Hero Tales).** The story now ends at stage 150, not 100, so the bot's story-end milestone moved: the old one is now the end of Act II. The bot reads every Hero Tale chapter as it opens (squad heroes take the battle ending, others the steward one) and skips the scenes, as the instant battle mode does. Free pacing (two runs): Act I ends at 3.1-3.3 h, Act II at 10.4-11.7 h, Lv 20 at 23.2-24.4 h and Act III at 25.8-27.4 h. Founder's Cache: Act II 11.0 h, Lv 20 22.8 h, Act III 23.6 h. Dolphin: 8.7 h / 19.4-20.0 h / 20.7-21.7 h. Whale: 4.9-5.6 h / 12.9-14.3 h / 14.0-14.3 h. Spending finishes the whole story about 1.9× sooner for $1,150. Three more free runs agreed (Act III at 23.5-25.6 h). Every run freed all four kin, finished 28 tale chapters and 3 whole tales, and claimed all 80 quests. On the first pass nobody reached stage 150 in 36 hours (bosses every five stages on the endless curve); easing Act III's enemy growth to 0.75 brought it in. The bot also had two quest stalls of its own making, both fixed: it took a Saltborn Hive for the Scorpion-camp quest, and it tried the nearest camp instead of the weakest. A quest asking for four finished tales became three, since a free player levels about three heroes.

**Version 4.1 (the Illuminated interface, Bloom).** The bot plants a grove whenever it holds three times the price, from the end of Act I, and every run grew all 30 oases. At the first price (three quarter-crates of water and two of food, 7% dearer each, so all thirty cost about a whole late Rainwyrm level's water and food) free runs ended Act III at 23.3-29.2 h, 27.2 h on average, against 22.3-27.4 h and 24.3 h on average with Bloom switched off (three runs each). Groves now cost two quarter-crates of water and one of food, 6% dearer each, and free pacing matches the Bloom-off runs: Act II ends at 10.1-11.8 h, Lv 20 at 23.6-24.3 h and Act III at 24.8-25.5 h, 25.0 h on average (three runs). Founder's Cache: Act II 8.4 h, Lv 20 22.2 h, Act III 22.8 h. Dolphin: 8.3 h / 19.5 h / 20.7 h. Whale: 6.2 h / 13.9 h / 14.9 h, so spending finishes the story about 1.7× sooner. One free run on the first pass sat on the Scorpion-camp quest for 11 hours because its map had no camp inside the haze until Rainwyrm Lv 14. About one map in ten was like that at Lv 12, when the quest comes up. Maps with no camp within Lv 10 sight now hold one 5 to 6.5 tiles out, and none of the nine free runs since has stalled. The bot plays through the game's actions, not its screens, so the new interface doesn't change these numbers; it was checked with screenshot tours instead.

**Version 4.2 (painted art).** Art only: no rules or numbers changed, so the 4.1 pacing above stands. Every regression script and screenshot tour runs with the paintings, in the dev build and in the single-file build.

**Version 4.3 (the new Rainwyrm).** A redesign of the wyrm's model and images only; no rules or numbers changed, so the 4.1 pacing stands. Cloud Run draws the same dragon from above.

**Version 4.4 (Cloud Run 2.0).** Cloud Run flies the 3D wyrm and adds rain rings, the cloud combo, Rain Pearls and Wyrm Gifts; the bot flies its three runs, banks a pearl each and buys the cheapest gift it can. The bot keeps the real clock, so its day never turns over and it flies only those three, as it has since 3.5; a real player who plays across many days earns more pearls and a little more water than the bot shows. Free pacing over two runs: Act II end at 9.8-10.5 h, Lv 20 at 22.1-23.5 h, Act III end at 22.9-24.5 h, no errors. A control run of the 4.3 build in the same environment reached Lv 20 and the Act III end at 22.4 h, so the hour or so against the 4.1 figures is run-to-run spread, not this update. Whale: 4.7 h / 13.1 h / 14.1 h.

**Version 4.5 (painted UI kit).** Five icon sheets, three button plates and a corner ornament made with Higgsfield (GPT Image 2, background removed), cut into 45 icons. Each painted icon replaces the drawn symbol of the same id in the SVG sprite, so the header, tabs, hubs, chips, costs, buttons and sheets all use it with no change to the HTML the UI diffs; the map canvases keep the drawn symbol for tinted markers. Buttons wear the plates as border images: the halves of the plate fill the button and the painted end caps keep their shape at any width. The sandstorm glyph stays drawn, and Cloud Run takes a new painted rain cloud. No rules or numbers changed, so the 4.4 pacing stands.

**Version 4.6 (the Deepspring and the Crossing).** An endgame and a run mode. The bot now refines every Deepspring charge, deepens whenever the stores allow (keeping the water reserve), and plays every Crossing route with its careful auto-player; runs were 72 hours to see the long tail. Free players (four runs): Rainwyrm Lv 20 at 22.0-23.4 h and the Act III end at 24.5-26.6 h, unchanged from 4.4 within run-to-run spread; Deepspring Lv 5 at 34.9-37.7 h, Lv 10 at 40.7-44.5 h, Lv 15 at 47.9-53.1 h, Lv 20 at 56.7-63.6 h and Lv 22-23 at 72 h, which puts Keeper of the Deepspring (Lv 30) around 120-130 hours of play. The Far South frontier moved from stage 160 to 170 over those hours. Whales (two runs): Lv 20 at 13.0-13.4 h, Deepspring Lv 10 at 36.3-40.1 h and Lv 20 at 55.5-67.8 h, Lv 28 at 72 h in the faster run; their lead is small because the bot's day never turns over, so it buys the daily Tideglass Kit once, and it keeps 3,000 Starglass back from Starglass refines. Water is the Deepspring's tightest cost: the bots often drew the cisterns down to the reserve, with no thirsty or dormant minutes in any run. Tideglass came about half from refining and half from the Far South, the Spire and Colossus kills. The Crossing ran ten times in 72 hours (a route every 8 hours of keep time); the bot reached the oasis in all 30 runs at the first, softer setting, so the late rows and the Warden were stiffened (+0.06 a row, ×1.2 Warden) to leave the careful auto-player 30-50% wins at unlock and 55-80% later. Its rewards moved no milestone outside the usual spread.

**Why Growth Packs exist.** Before them, the whale bot finished the story at the same time as the $80 dolphin (about 9 hours) and reached Lv 20 no sooner. A crate grows with the Rainwyrm's level more slowly than building costs do: a late Rainwyrm level (the wyrm plus the six buildings it needs) costs about 45,000 Starglass in crates, so $1,000 of Starglass bought about two levels, and the whale bot spent much of it on recruits instead. Growth Packs are sized to the next level, so money keeps buying progress all the way to Lv 20. That is the spend ladder a high-grossing game in this genre needs. They also give every level-up a buying moment.

Run-to-run spread is wide (gacha luck and raid timing move stage 60 and stage 100 by an hour or more), so tune with several seeds, not one.

In every run the keep never ran dry (zero minutes thirsty or dormant) and sickness stayed under 0.01% of survivor-time.

A human player is less efficient than the bot, so expect the story to take roughly two to three times as long: about 25-35 hours of play to the Ember Throne, 50-80 to wake the Mother of Rains, and longer still to tell every Hero Tale and forge the gear in full.

Other measured outcomes:

- **Water is the first lesson.** A new keep loses water every minute until the first quest (dig the Deep Well) is done, so players learn the core mechanic in the first minute.
- **Every resource is used.** Building costs draw on stone, water (mudbrick and mortar), food and copper from level 3 up. The Forge turns late-game stone into Sunsteel. Copper is the late-game constraint; food piles up for training and donations.
- **Nights matter.** Desert nights run 7°C colder and middays 2°C hotter, so a wyrm left on Steady wastes water after dark. Attuned mist drizzles at night and pours before storms. That alone saves enough water to speed the free player's story by about a tenth.
- **Keep life rewards attention.** An always-attentive player gets about 15% more output from surplus bubbles and 10-15% more water from showers. Incidents roughly break even, and merchants turn surplus food into journals, Rain Charms and the scarce resource.
- **Old saves carry over.** Saves from 2.0 and 2.1 load into 4.3 at the same chapter quest (quests added since are stepped over). A finished 2.x game continues straight into the Act II quests, and a save already in the Burning Line becomes Act II progress.
- **No errors** across all automated runs.

## 9. Next steps

1. Playtest with 20+ genre players; watch the first 10 minutes, the first sandstorm and the first caravan across the Dunes.
2. Ship to TestFlight using NATIVE.md, with real purchases in the App Store sandbox. Check frame rate on a 3-4 year old iPhone and Android mid-ranger.
3. The painted set in 4.2 covers every hero, foe family, building, event and store pack. Before a large ad spend, commission a human artist to repaint the six Legendary heroes and the Rainwyrm key art over the generated versions (they show in every ad), and to animate the hero portraits for the Beacon.
4. Add analytics hooks (tutorial funnel, first purchase view, storm outcomes, when players call the rain, which incident choices they pick, day-1/7/30 retention).
5. Soft-launch in one or two test markets and check the retention gates in section 7 before spending on user acquisition.
6. If retention holds, start the live multiplayer backend in section 6.
