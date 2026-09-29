# 🌊 Tiny Tides

*An idle tidepool ecosystem you check on a few times a day. Creatures evolve based on how you arrange rocks and water.*

Vanilla JavaScript + Canvas 2D game (≈190 KB, no engine), wrapped for iOS with **Capacitor 8** (Swift Package Manager) and **StoreKit 2** purchases. All art is procedural and all audio is synthesized — there are no image/sound assets to license.

<p align="center"><img src="store/screenshots/iphone-6.9/01-build.png" width="220"> <img src="store/screenshots/iphone-6.9/02-evolve.png" width="220"> <img src="store/screenshots/iphone-6.9/06-deep.png" width="220"></p>

## Quick start
```bash
npm ci
npm test                 # 23 simulation tests
npm run build:demo       # web build in www/ (simulated purchases) — serve www/ with any static server
npm run dev              # debug build with watch (window.__tt cheat hooks enabled)
npm run test:e2e         # phone-viewport Playwright run-through (needs the debug build: node tools/build.mjs --debug)
npm run balance -- 60 4  # economy bot: 60 days, 4 check-ins/day
```
Ship it: **[docs/APP_STORE_RELEASE.md](docs/APP_STORE_RELEASE.md)** · listing copy: [store/APP_STORE_LISTING.md](store/APP_STORE_LISTING.md) · design: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) · what was verified: [docs/QA_REPORT.md](docs/QA_REPORT.md)

## Layout
```
src/data.js          all content: traits, pieces, 10 families/70 forms, decor, products, quests
src/sim.js           pure game rules (no DOM / no Date.now): traits, spawn, evolve, offline catch-up, IAP crediting
src/render.js        Canvas scene: blobby water, day/night sky, creatures, particles
src/art_creatures.js procedural kawaii creature drawing + hats;  src/art_world.js rocks, props, eggs
src/ui.js            DOM UI (HUD, inspector, Tidedex, shop, quests, settings, tutorial coach)
src/game.js          controller: save/load, actions, tutorial state machine, reminders
src/platform.js      Capacitor bridge (storage, haptics, notifications, share, StoreKit) with web fallbacks
src/audio.js         WebAudio synth: SFX + procedural ocean loop
ios/                 Xcode project (SPM) — icon, splash, privacy manifest, StoreKit test file
site/                privacy / terms / support pages to host publicly
store/               listing copy, IAP table, generated App Store screenshots
tools/               build, tests helpers, asset + screenshot generators, balance bot
```

## Handy scripts
| | |
|---|---|
| `npm run assets` | re-render icon/splash from game art and refresh the Xcode asset catalog |
| `npm run store-shots` | regenerate App Store screenshots (iPhone 6.9″/6.5″, iPad 13″) |
| `npm run storekit` | regenerate `TinyTides.storekit` + `store/iap-products.md` from `src/data.js` |
| `npm run rename -- com.you.tinytides` | change the bundle id (and all IAP ids) everywhere |
| `npm run sheet` | contact sheet of all 70 creatures |
| `npm run ios:sync` / `ios:open` | build + `cap sync` / open Xcode |

## Adding a creature
Add a `br` entry to a family in `src/data.js` (name, mythic name, palette, deco list). Deco vocabulary lives in `art_creatures.js` (`moss, rocks, lava, leaves, glowdots, bubbles, stars, crystals, stripes, spots, rays, aura`). `npm test` checks unique names and that every needed trait is producible in that biome; `npm run sheet` shows it.
