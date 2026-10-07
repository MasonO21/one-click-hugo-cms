# Rainkeep

A complete desert water-survival strategy game for phones, in 3D. The rain stopped a generation ago. You raise the last Rainwyrm, a water dragon whose cooling mist keeps your keep alive. You dig wells so your people have water to drink and the wyrm has water to breathe, read the horizon for sandstorms and heatwaves, shelter survivors, recruit heroes, send caravans across the Dunes and ride with your Caravan. The story runs in three acts: six chapters to the Sunheart, the fallen shard of sun that boiled the sky dry; four more through the floods and salt marshes of The Long Rains to the Ember Throne; and The Wyrmsong, five chapters past the Burning Line to free the last wyrm's sealed kin and wake the Mother of Rains.

- **Play:** open `index.html` in any browser, or install it to your phone's home screen (see below).
- **Design and business plan:** [DESIGN.md](DESIGN.md)
- **Putting it on the App Store and Google Play:** [NATIVE.md](NATIVE.md)
- **Store listing copy:** [STORE_LISTING.md](STORE_LISTING.md) · **Privacy policy:** [PRIVACY.md](PRIVACY.md)

## What's in the game

| Area | Contents |
|---|---|
| **3D world** | The keep and the Dunes are real-time 3D scenes (three.js, vendored): low-poly desert architecture that changes with building level, a day and night cycle, sandstorms, dust haze, heatwaves and rain showers, villagers walking to work, camels, palms swaying in the wind, an animated oasis and the Rainwyrm itself. The keep is a terraced oasis at the head of a canyon: the spring in a sunken stepped basin, houses and barracks on raised terraces, an upper town with the Rain Altar, the watchtower on its own crag, stone stairs between the levels, cliff dwellings and the Temple of Rains carved into the canyon walls, and a walled front gate. Drag to move around, pinch or scroll to zoom (toward your finger, from the whole canyon down to street level), twist with two fingers or right-drag to turn, double-tap or press the compass to fly home. Falls back to a 2D renderer on devices without WebGL, and can be switched off in Settings |
| **The Rainwyrm** | A serpentine water dragon in 3D: a sculpted head with golden slit eyes, a hinged jaw and fangs, ear frills and long whiskers, a scalloped fin sail down its back, fan fins and a tail fan, belly plates and iridescent scales. 20 levels, 9 forms that grow its fins and frills and lengthen and branch its horns, a rain cloud of its own, a crown of storm horns (Stormcrowned) and finally a halo and river of living water (Skyriver), 3 mist settings and Attuned mist (the wyrm sets its own from Lv 6), **Call the Rain** (from Lv 3: a shower that fills the wells, cools the keep and calms sandstorms, on a recharge, with Rain Charms for emergencies), petting and naming, an Ascension choice at Lv 12 (Monsoon, Mistveil or Floodheart), Wyrm's Torrent that opens every battle, **Cloud Run** (from Lv 5: the 3D wyrm itself flies over the dunes three times a day; steer it through rain clouds and golden drops, thread rain rings for a combo that makes every cloud worth more, catch Rain Pearls, dodge dust devils, and bring the clouds home as water, Starglass and bond; pearls buy six **Wyrm Gifts**: more hearts, longer flights, a cloud magnet, more golden drops, more water, and Storm Rider), 6 skins |
| **Survival** | Water is life: survivors drink it and the wyrm breathes it as cooling mist. If the wells run dry, the wyrm sleeps, the heat pours in and families leave. Forecast weather (dust haze, sandstorms, heatwaves) gets hotter as the wyrm grows, middays are hotter and desert nights cold; heat bands drive sickness and productivity; food, housing, raider attacks with a Storehouse to protect stock, offline protection |
| **The keep** | 13 buildings on fixed plots across three levels (Deep Well, Date Grove, Sandstone Quarry, Copper Mine, Mudbrick Houses, Healer's House, Barracks, Watchtower, Archive of Rains, Caravan Hall, Storehouse, Sunsteel Forge), worker assignment (auto or manual), 12 research lines with 15 levels each, 3 troop types in a counter triangle |
| **Warden's Gear** | The Sunsteel Forge (from Rainwyrm Lv 12) smelts copper into Sunsteel. Six pieces of gear (blade, shield, cloak and one for each troop class) climb 50 levels through five tiers and strengthen every squad you send out |
| **Keep life** | Surplus bubbles to tap over working buildings, 16 keep incidents (travellers at the gate, a fever, a buried cistern, a wedding under the palms) with choices that cost something and pay off in boosts, survivors or setbacks, and travelling merchant caravans that camp by the gate and swap what you have too much of for what you're short on. **Channels**, a water puzzle: turn stone channel pieces until the spring reaches every hut, palm and field (puzzles open four at a time per Rainwyrm level, three stars against par, star chests, a daily puzzle, dowsing hints; tap the irrigation channel or the side button). **The Rainwyrm's bond**: the wyrm makes small wishes tied to normal play (rain, dates, a Downpour, a story from the Dunes), and granting them raises a 10-level bond with lasting perks. **Hold the Gate**: sighted raiders march across the dunes to the gate; rain when they arrive weakens them, and boiling water from the walls steadies your defenders. **Keep gardens** (from Rainwyrm Lv 6): nine monuments with their own place in the keep, from a fountain inside the gate and twin wyrm statues before the temple to a Sunsteel sculpture and a glass mosaic court, each raised over five levels for a small lasting bonus and modelled in the 3D keep as it grows |
| **The Deepspring** | The endgame, from Rainwyrm Lv 20: older water glowing beneath the wyrm's pool. **Tideglass**, a new crystal refined from water and copper (a refine charges every 20 minutes of keep time, up to 12 waiting, each giving 1 to 5), deepens the spring through 30 levels; Tideglass also comes from every Far South stage and boss, Mirage Spire floors past 100 and every Colossus your Caravan brings down. Each level adds 2% troop strength and 2% production and costs a large share of base resources, so a finished keep's stores have a use. Every fifth level is a **Springsong** rank that raises every hero's level cap by 5 and adds a perk (gathering, Wyrm's Torrent, offline hours, squad attack, Call the Rain). The pool glows brighter with each rank in the 3D keep |
| **Battles** | Played round by round: every squad hero has a skill (Guard, Charge, Volley, Mend or Sunder, from the hero's passive) that charges up and fires on a tap, foes and bosses wind up heavy blows you can see coming, and the Rainwyrm's breath, used once a battle, breaks a wind-up if you time it. Auto-battle, 2× speed and Skip for players who'd rather not, and a setting to resolve battles at once |
| **Heroes** | 22 illustrated heroes in 3 rarities and 3 classes (4 arrive with Act II), levels, stars from duplicates, skills that grow with stars, Steward posts that boost buildings, recruitment with published odds, a 40-pull Legendary guarantee and a rotating featured hero. **Hero Tales**: every hero has a story in three chapters (opened by hero level and stars), each a page and a fight with that hero leading, ending in a choice that makes their battle skill or their steward post stronger for good |
| **Expedition** | 150 story stages in 15 chapters and three acts, with 30 bosses, chapter story cards and three endings ("The Rains", "The Long Rains" and "The Wyrmsong"), then the endless Far South. **Story scenes** with portraits play before every boss and at each act's start, with a recurring cast (Elder Maram, Captain Hadi, young Nima), your squad's lead hero, your wyrm and the boss; a Chronicle replays chapters, scenes and endings. In Act III you free four elder Rainwyrms (the Dew, Flood, Storm and Cloud Wyrms), who come to rest on the canyon rim of your 3D keep with lasting perks, then wake the Mother of Rains. A patrol cache pays out while you're away |
| **Trials** | The **Mirage Spire**: a tower of single fights from stage 30, each floor with a twist (heat, sandstorm, glass floor, mirage, rising tide) and a Warden every tenth floor. The **Dune Duels**: a 1,000-rank ladder of rival wardens with tickets, three challengers at a time, rank rewards, seasons and a Glory shop |
| **The Dunes** | A seeded 21×21 world map whose dust haze recedes as the wyrm grows: resource nodes and gathering caravans, beasts, Scorpion raider camps, and 12 story ruins whose choices change what you bring home. In Act II the springs flood, Sunsteel veins surface on the washed-out sand and Saltborn Hives rise far from the keep. **Bloom**: once the rain is back, plant groves on open sand around the keep and watch them grow, by themselves, into palm oases on the 3D map; every oasis adds a little food and water, and 5, 12, 20 and 30 oases bring a cooler keep, more production, longer rain and the Desert Bloom skin |
| **Caravan** | Three simulated alliances to choose from: members help your timers, fund 5 Caravan techs, send gift chests, chat and react to what happens, and fight a Colossus raid boss with you on a timer |
| **Meta** | 84 chapter quests, 18 daily duties with 5 chests, a 7-day gift calendar, 58 achievements, mail, a 30-tier season pass whose seasons roll over every 8 hours of play (each with a new premium wyrm skin), a backpack with speedups, crates and shard pouches, and 6 rotating events (Rain Festival, Beast Hunt, Forge Festival, Builder's Rush, Spire Rush and **Oasis Wars**, a leaderboard against 9 rival keeps matched by spending bracket) |
| **Store** | Founder's Cache, Oasis Stipend, Ledger Premium, Growth Fund, Sandstorm Kit, Forge Kit, War Chest, Growth Packs (two tiers on sale for 3 hours after each Rainwyrm level-up, sized to the next level), Starglass packs, wyrm skins and supply crates. Purchases are simulated on the web and go through Apple/Google in the app build |
| **Patron program** | Ten Patron levels from lifetime spend (and a few points for each daily visit): more production, faster building and smelting, free finishes on short timers, a longer offline bank, extra Duel ticket slots and a daily chest. Never combat stats |
| **Interface** | A calm, painted interface in night indigo, brass and turquoise, with eight-point star ornaments and arch-shaped tabs. Painted icons for the stores, currencies, tabs, hubs and features (45 of them), buttons on painted enamel-and-gold plates with filigree end caps, and gold filigree in the corners of every sheet. One slim header bar (the wyrm's medallion, the four stores, Starglass and a menu) over a sky ribbon with the temperature, survivors and the next storm; three medallions on the side (the event, a Rewards hub and a Play hub) instead of a wall of buttons; status chips only when something is happening; brass star badges for building levels in the keep, with names when you zoom in |
| **Painted art** | 89 paintings made with Higgsfield, plus a painted UI kit (icons, button plates and sheet corners): portraits of all 22 heroes and the story cast, one painting for each of the ten foe families (worn as medallions in battle), a backdrop for each act's story scenes, the title painting, a header for every building, a banner for every event, illustrated store packs and Starglass tiers, a scene for each of the twelve Dunes ruins and one for each ending, the grotto behind every portrait of the Rainwyrm (drawn live in 3D on top, so skins and forms always match) and its painted head on the header medallion. The app icon and splash come from the same set. Anything added later without a painting falls back to drawn SVG art |
| **Polish** | Procedural music on a Hijaz scale, desert wind and spring ambience and sound effects (no audio files), haptics, a quest-driven tutorial pointer, notifications in the app build, save codes to move progress between devices, offline play when hosted, bundled fonts |

Caravan members and Oasis Wars rivals are simulated, so the whole game works offline with no server. DESIGN.md explains what a live multiplayer version would add.

## Play it

No build step is needed:

- Open `index.html` in a browser, or
- Serve the folder (`npx serve rainkeep` from the repo root) and open it on your phone over the same Wi-Fi. When served over https, the game also works offline.
- On iPhone, open it in Safari and choose **Share → Add to Home Screen** to play full screen.

Progress saves in the browser. Settings (gear icon) has sound toggles, the 3D graphics switch, save codes and **Start a new keep**. Add `?flat` to the URL to force the 2D renderer.

## Files

| File | What it does |
|---|---|
| `index.html` | Page shell: HUD, tabs, icon set, script order |
| `style.css` | All styling (desert theme, bundled fonts) |
| `data.js` | Every tunable number and all content: buildings, weather, heroes, stages, quests, events, Caravan, the Dunes, ruins, store |
| `core.js` | State, simulation (water, heat, sickness, production), the round-by-round battle engine, core actions, save/load, the event bus other scripts hook into |
| `ui.js` | Header, side hubs, menu, tabs, panels, every sheet, live battles, toasts, tutorial hints, input, sound and haptic cues |
| `artmap.js` | Where each painting lives under `art/` (portraits, foes, act backdrops, title, building headers, event banners, store art, ruins, endings) |
| `art2d.js` | Turns artmap.js into one stylesheet of painted backgrounds and button plates, swaps the painted icons into the SVG sprite so every icon in the game uses them, and draws SVG portraits and foes for anything without a painting |
| `art/` | The paintings, as WebP (about 3.4 MB in all) |
| `art3d.js` | The procedural 3D model kit: terrain, sky, water, buildings in three detail tiers, palms, camels, villagers, particles, and the animated Rainwyrm (sculpted head, jaw, horns, frills, fin sail). Also renders wyrm portraits for sheets over the painted grotto |
| `town3d.js` | The 3D keep: canyon terrain, terraces and stairs, the spring basin, plot models, garden monuments, raiders at the gate, the kin on the canyon rim, lighting, day and night, weather, mist, people, the free camera (pan, zoom, turn, collision), picking |
| `town.js` | The keep's 2D overlay (plates, badges, timers) and touch, mouse and keyboard input; draws the whole keep in 2D when WebGL is unavailable |
| `world3d.js` | The Dunes in 3D: tile models, dust haze, caravans, badges, panning and picking |
| `world.js` | The Dunes rules: tiles, marches, beasts, camps, ruins and raids on the keep; 2D map fallback |
| `events.js` | Backpack, speedups, daily duties, gift calendar, achievements, mail, timed events, Oasis Wars |
| `keep.js` | Keep life: Call the Rain, surplus bubbles, keep incidents, travelling merchants, timed boosts |
| `channels.js` | Channels, the water puzzle: generator, board, stars, star chests, daily puzzle, hints |
| `bond.js` | The Rainwyrm's bond: wishes, bond levels and their perks, the thought bubble |
| `lore.js` | The story's words: the cast, scenes before every boss, the kin of Act III and every Hero Tale (extends `DATA`) |
| `story.js` | The scene player, the Chronicle, the kin (perks, sheets, camera) and the Hero Tales |
| `bloom.js` | Bloom: groves on the Dunes, how they grow, their gifts and the Bloom sheet |
| `deepspring.js` | The Deepspring endgame: Tideglass, refine charges, the 30 levels and their Springsong ranks, its bonuses and sheet |
| `cloudrun.js` | Cloud Run, the flying mini-game: steering, clouds, rain rings and combo, Rain Pearls, dust devils, Wyrm Gifts and rewards; flies the 3D wyrm through `art3d.js` with a 2D drawing as fallback |
| `decor.js` | The keep gardens: monuments, their levels, costs and bonuses, the Gardens sheet |
| `forge.js` | The Sunsteel Forge: smelting, Warden's Gear and its panel |
| `trials.js` | The Mirage Spire and the Dune Duels |
| `patron.js` | The Patron program: levels, perks, daily chest and the Store card |
| `caravan.js` | The simulated alliance: help, tech, shop, gifts, chat, Colossus raid |
| `audio.js` | Procedural Web Audio engine (`KHAudio`) |
| `native.js` | App-store bridge (`KHNative`): RevenueCat purchases, notifications, haptics, sharing, service worker |
| `sw.js` | Service worker for offline play when hosted |
| `vendor/three.min.js` | three.js r158 (MIT, see `vendor/THREE_LICENSE.txt`) |
| `fonts/` | El Messiri and Barlow Semi Condensed (SIL Open Font License) |
| `icons/`, `icon.svg`, `manifest.webmanifest` | App icons, splash screen and home-screen install |
| `package.json`, `capacitor.config.json`, `scripts/build-www.mjs` | Native app shell (Capacitor) and build script |

## Tuning and testing

Change numbers in `data.js` and reload. Timers and production run about 30× faster than a typical live-service strategy game, so the two-act story takes a couple of weeks of evenings and the endgame a good while longer. For quick testing, open the browser console:

```js
rainkeep.advance(600)                            // fast-forward 10 minutes of game time
rainkeep.grant({ stone: 5000, water: 5000, starglass: 2000, beacons: 10, speed60: 3 })
rainkeep.act('fight')                            // any action the buttons use
rainkeep.state()                                 // the full save object
KH.town3d.zoom(1.5); KH.town3d.drag(0, -100)     // move the 3D camera
```

**Balance bot.** `tools/balance-bot.cjs` plays the whole game headless and prints milestones, resource sources, builder idle time and errors. Install Playwright once (`npm i -D playwright && npx playwright install chromium`), then run `npm run balance -- f2p 36` (modes: `f2p`, `founder`, `dolphin` at about $150, `whale` at about $1,150; purchases are simulated). It also prints where Starglass went, by action, and what blocked each next Rainwyrm level. `npm run balance -- f2p 36 5 sgspend` makes it spend Starglass only on recruits. Compare several runs: gacha luck moves results by an hour or more.

The game was balanced with an automated player that plays every system (building, research, troops, heroes, gacha, marches, ruins, Caravan, raids, events, duties, surplus, rain, incidents, merchants, gear, the Spire, Duels) for 36 hours of game time. See DESIGN.md, section 8, for the resulting pacing.

## Shipping it

Purchases are simulated on the web. The App Store build uses Apple in-app purchase through RevenueCat. [NATIVE.md](NATIVE.md) covers the whole path: building the iOS project on a Mac, creating the 17 products in App Store Connect, connecting RevenueCat, sandbox testing, TestFlight and review.
