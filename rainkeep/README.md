# Rainkeep

A complete desert water-survival strategy game for phones, in 3D. The rain stopped a generation ago. You raise the last Rainwyrm, a water dragon whose cooling mist keeps your keep alive. You dig wells so your people have water to drink and the wyrm has water to breathe, read the horizon for sandstorms and heatwaves, shelter survivors, recruit heroes, send caravans across the Dunes and ride with your Caravan. The story runs in two acts: six chapters to the Sunheart, the fallen shard of sun that boiled the sky dry, then four more through the floods and salt marshes of The Long Rains to the Ember Throne.

- **Play:** open `index.html` in any browser, or install it to your phone's home screen (see below).
- **Design and business plan:** [DESIGN.md](DESIGN.md)
- **Putting it on the App Store and Google Play:** [NATIVE.md](NATIVE.md)
- **Store listing copy:** [STORE_LISTING.md](STORE_LISTING.md) · **Privacy policy:** [PRIVACY.md](PRIVACY.md)

## What's in the game

| Area | Contents |
|---|---|
| **3D world** | The keep and the Dunes are real-time 3D scenes (three.js, vendored): low-poly desert architecture that changes with building level, a day and night cycle, sandstorms, dust haze, heatwaves and rain showers, villagers walking to work, camels, palms swaying in the wind, an animated oasis and the Rainwyrm itself. Drag to orbit, pinch to zoom. Falls back to a 2D renderer on devices without WebGL, and can be switched off in Settings |
| **The Rainwyrm** | 20 levels, 9 forms that grow fins, horns, whiskers, a rain cloud of its own, a crown of storm horns (Stormcrowned) and finally a halo and river of living water (Skyriver), 3 mist settings and Attuned mist (the wyrm sets its own from Lv 6), **Call the Rain** (from Lv 3: a shower that fills the wells, cools the keep and calms sandstorms, on a recharge, with Rain Charms for emergencies), petting and naming, an Ascension choice at Lv 12 (Monsoon, Mistveil or Floodheart), Wyrm's Torrent that opens every battle, 6 skins |
| **Survival** | Water is life: survivors drink it and the wyrm breathes it as cooling mist. If the wells run dry, the wyrm sleeps, the heat pours in and families leave. Forecast weather (dust haze, sandstorms, heatwaves) gets hotter as the wyrm grows, middays are hotter and desert nights cold; heat bands drive sickness and productivity; food, housing, raider attacks with a Storehouse to protect stock, offline protection |
| **The keep** | 13 buildings on fixed plots (Deep Well, Date Grove, Sandstone Quarry, Copper Mine, Mudbrick Houses, Healer's House, Barracks, Watchtower, Archive of Rains, Caravan Hall, Storehouse, Sunsteel Forge), worker assignment (auto or manual), 12 research lines with 15 levels each, 3 troop types in a counter triangle |
| **Warden's Gear** | The Sunsteel Forge (from Rainwyrm Lv 12) smelts copper into Sunsteel. Six pieces of gear (blade, shield, cloak and one for each troop class) climb 50 levels through five tiers and strengthen every squad you send out |
| **Keep life** | Surplus bubbles to tap over working buildings, 16 keep incidents (travellers at the gate, a fever, a buried cistern, a wedding under the palms) with choices that cost something and pay off in boosts, survivors or setbacks, and travelling merchant caravans that camp by the gate and swap what you have too much of for what you're short on |
| **Heroes** | 22 illustrated heroes in 3 rarities and 3 classes (4 arrive with Act II), levels, stars from duplicates, skills that grow with stars, Steward posts that boost buildings, recruitment with published odds, a 40-pull Legendary guarantee and a rotating featured hero |
| **Expedition** | 100 story stages in 10 chapters and two acts, with 20 bosses, chapter story cards and two endings ("The Rains" and "The Long Rains"), then the endless Burning Line. A patrol cache pays out while you're away |
| **Trials** | The **Mirage Spire**: a tower of single fights from stage 30, each floor with a twist (heat, sandstorm, glass floor, mirage, rising tide) and a Warden every tenth floor. The **Dune Duels**: a 1,000-rank ladder of rival wardens with tickets, three challengers at a time, rank rewards, seasons and a Glory shop |
| **The Dunes** | A seeded 21×21 world map whose dust haze recedes as the wyrm grows: resource nodes and gathering caravans, beasts, Scorpion raider camps, and 12 story ruins whose choices change what you bring home. In Act II the springs flood, Sunsteel veins surface on the washed-out sand and Saltborn Hives rise far from the keep |
| **Caravan** | Three simulated alliances to choose from: members help your timers, fund 5 Caravan techs, send gift chests, chat and react to what happens, and fight a Colossus raid boss with you on a timer |
| **Meta** | 71 chapter quests, 17 daily duties with 5 chests, a 7-day gift calendar, 40 achievements, mail, a 30-tier season pass whose seasons roll over every 8 hours of play (each with a new premium wyrm skin), a backpack with speedups, crates and shard pouches, and 6 rotating events (Rain Festival, Beast Hunt, Forge Festival, Builder's Rush, Spire Rush and **Oasis Wars**, a leaderboard against 9 rival keeps matched by spending bracket) |
| **Store** | Founder's Cache, Oasis Stipend, Ledger Premium, Growth Fund, Sandstorm Kit, Forge Kit, War Chest, Starglass packs, wyrm skins and supply crates. Purchases are simulated on the web and go through Apple/Google in the app build |
| **Patron program** | Ten Patron levels from lifetime spend (and a few points for each daily visit): more production, faster building and smelting, free finishes on short timers, a longer offline bank, extra Duel ticket slots and a daily chest. Never combat stats |
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
| `core.js` | State, simulation (water, heat, sickness, production), combat, core actions, save/load, the event bus other scripts hook into |
| `ui.js` | HUD, tabs, panels, every sheet, battles, toasts, tutorial hints, input, sound and haptic cues |
| `art2d.js` | Illustrated SVG hero portraits (built from each hero's `look` in data.js) and foe illustrations |
| `art3d.js` | The procedural 3D model kit: terrain, sky, water, buildings in three detail tiers, palms, camels, villagers, particles, and the animated Rainwyrm. Also renders wyrm portraits for sheets |
| `town3d.js` | The 3D keep: plot models, lighting, day and night, weather, mist, people, camera fitting, picking |
| `town.js` | The keep's 2D overlay (plates, badges, timers) and touch input; draws the whole keep in 2D when WebGL is unavailable |
| `world3d.js` | The Dunes in 3D: tile models, dust haze, caravans, badges, panning and picking |
| `world.js` | The Dunes rules: tiles, marches, beasts, camps, ruins and raids on the keep; 2D map fallback |
| `events.js` | Backpack, speedups, daily duties, gift calendar, achievements, mail, timed events, Oasis Wars |
| `keep.js` | Keep life: Call the Rain, surplus bubbles, keep incidents, travelling merchants, timed boosts |
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

The game was balanced with an automated player that plays every system (building, research, troops, heroes, gacha, marches, ruins, Caravan, raids, events, duties, surplus, rain, incidents, merchants, gear, the Spire, Duels) for up to 24 hours of game time. See DESIGN.md, section 8, for the resulting pacing.

## Shipping it

Purchases are simulated on the web. The App Store build uses Apple in-app purchase through RevenueCat. [NATIVE.md](NATIVE.md) covers the whole path: building the iOS project on a Mac, creating the 15 products in App Store Connect, connecting RevenueCat, sandbox testing, TestFlight and review.
