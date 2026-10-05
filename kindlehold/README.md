# Kindlehold

A complete frozen-world survival strategy game for phones. You raise the Hearthwyrm, a fire dragon whose warmth keeps your town alive. You feed it coal, read the weather, shelter survivors, recruit heroes, march across the Snowfield, stand with your Kindred and push six chapters of story to the Heart of Winter.

- **Play:** open `index.html` in any browser, or install it to your phone's home screen (see below).
- **Design and business plan:** [DESIGN.md](DESIGN.md)
- **Putting it on the App Store and Google Play:** [NATIVE.md](NATIVE.md)
- **Store listing copy:** [STORE_LISTING.md](STORE_LISTING.md) · **Privacy policy:** [PRIVACY.md](PRIVACY.md)

## What's in the game

| Area | Contents |
|---|---|
| **The Hearthwyrm** | 15 levels, 7 visible forms, 3 blaze settings, petting and naming, an Ascension choice at Lv 12 (Sunforge, Rimeward or Stormheart), Wyrm's Breath that opens every battle, 6 skins |
| **Survival** | Forecast weather (snowfall, blizzards, deep freezes) that gets colder as the wyrm grows, warmth bands, sickness and recovery, food, housing, raider attacks with a Storehouse to protect stock, offline protection |
| **The hold** | 12 buildings on fixed plots, worker assignment (auto or manual), 10 research lines with 10 levels each, 3 troop types in a counter triangle |
| **Heroes** | 18 heroes in 3 rarities and 3 classes, levels, stars from duplicates, skills that grow with stars, Steward posts that boost buildings, recruitment with published odds, a 40-pull Legendary guarantee and a rotating featured hero |
| **Expedition** | 60 story stages in 6 chapters with 12 bosses, chapter story cards, an ending, then the endless Frostline. A patrol cache pays out while you're away |
| **The Snowfield** | A seeded 21×21 world map whose frost line recedes as the wyrm grows: resource nodes and gathering marches, beasts, raider camps, and 12 story ruins whose choices change what you bring home |
| **Kindred** | Three simulated alliances to choose from: members help your timers, fund 5 Kindred techs, send gift chests, chat and react to what happens, and fight a Titan raid boss with you on a timer |
| **Meta** | 45 chapter quests, daily duties with 5 chests, a 7-day gift calendar, 30 achievements, mail, a 30-tier season pass, a backpack with speedups, crates and shard pouches, and 4 rotating events including **Thaw Wars**, a leaderboard against 9 rival holds matched by spending bracket |
| **Store** | Founder's Cache, Ember Stipend, Ledger Premium, Growth Fund, Storm Kit, War Chest, Starglass packs, skins and supply crates. Purchases are simulated on the web and go through Apple/Google in the app build |
| **Polish** | Procedural music, ambience and sound effects (no audio files), haptics, a quest-driven tutorial pointer, notifications in the app build, save codes to move progress between devices, offline play when hosted |

Kindred members and Thaw Wars rivals are simulated, so the whole game works offline with no server. DESIGN.md explains what a live multiplayer version would add.

## Play it

No build step is needed:

- Open `index.html` in a browser, or
- Serve the folder (`npx serve kindlehold` from the repo root) and open it on your phone over the same Wi-Fi. When served over https, the game also works offline.
- On iPhone, open it in Safari and choose **Share → Add to Home Screen** to play full screen.

Progress saves in the browser. Settings (gear icon) has sound toggles, save codes and **Start a new hold**.

## Files

| File | What it does |
|---|---|
| `index.html` | Page shell: HUD, tabs, icon set, script order |
| `style.css` | All styling |
| `data.js` | Every tunable number and all content: buildings, weather, heroes, stages, quests, events, Kindred, Snowfield, ruins, store |
| `core.js` | State, simulation, combat, core actions, save/load, the event bus other scripts hook into |
| `ui.js` | HUD, tabs, panels, every sheet, battles, toasts, tutorial hints, input, sound and haptic cues |
| `town.js` | The canvas hold and the Hearthwyrm drawing (also used for wyrm portraits) |
| `events.js` | Backpack, speedups, daily duties, gift calendar, achievements, mail, timed events, Thaw Wars |
| `kindred.js` | The simulated alliance: help, tech, shop, gifts, chat, Titan raid |
| `world.js` | The Snowfield map, marches, beasts, camps, ruins and raids on the hold |
| `audio.js` | Procedural Web Audio engine (`KHAudio`) |
| `native.js` | App-store bridge (`KHNative`): RevenueCat purchases, notifications, haptics, sharing, service worker |
| `sw.js` | Service worker for offline play when hosted |
| `icons/`, `icon.svg`, `manifest.webmanifest` | App icons, splash screen and home-screen install |
| `package.json`, `capacitor.config.json`, `scripts/build-www.mjs` | Native app shell (Capacitor) and build script |

## Tuning and testing

Change numbers in `data.js` and reload. Timers and production run about 30× faster than a typical live-service strategy game, so the full story takes a handful of evenings. For quick testing, open the browser console:

```js
kindlehold.advance(600)                          // fast-forward 10 minutes of game time
kindlehold.grant({ wood: 5000, starglass: 2000, beacons: 10, speed60: 3 })
kindlehold.act('fight')                          // any action the buttons use
kindlehold.state()                               // the full save object
```

The game was balanced with an automated player that plays every system (building, research, troops, heroes, gacha, marches, ruins, Kindred, raids, events, duties) for 9-13 hours of game time. See DESIGN.md, section 8, for the resulting pacing.

## Shipping it

Purchases are simulated on the web. The App Store build uses Apple in-app purchase through RevenueCat. [NATIVE.md](NATIVE.md) covers the whole path: building the iOS project on a Mac, creating the 14 products in App Store Connect, connecting RevenueCat, sandbox testing, TestFlight and review.
