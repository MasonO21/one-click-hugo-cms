# 🌭 Sizzle Flip

A polished mobile physics game about flipping a squishy sausage out of a frying pan, onto random household objects, and — eventually — into a hot dog bun.

Inspired by the one-button chaos of *a weird game about sausage*, rebuilt for phones with touch controls and **200 machine-verified levels** across 10 worlds.

![Sizzle Flip screenshots](store/overview.jpg)

| | |
|---|---|
| **Platforms** | iOS & Android (installable PWA, works offline) · Capacitor native shell for the App Store / Play Store · any desktop browser |
| **Controls** | Drag back anywhere, aim with the trajectory guide, release to flip. Land on things, flip again. |
| **Content** | 10 worlds × 20 levels, 600 stars, 12 unlockable sausage skins, 130 shop characters, 17 trophies, route hints, per-level par & best scores |
| **Tech** | Vanilla JS + Canvas 2D, custom deterministic soft-body physics, procedural vector art, synthesized audio — zero image/audio assets |

## The worlds

1. **The Kitchen** – toasters that pop you sky-high, slippery butter, knife blocks, boiling pots, timed burners
2. **Living Room** – bouncy couches, a sleeping cat, rotating clock hands, sticky beanbags, the fireplace
3. **Backyard BBQ** – trampolines, swings, leaf blowers, sprinkler geysers, flaring grills, and a very good dog
4. **Splish Splash** – soap, rubber ducks, shower downdrafts, hair dryers, the toilet (don't)
5. **The Office** – rolling chairs, desk fans, shredders, conveyor belts, hover-bots
6. **Toy Box** – drums, jack-in-the-boxes, toy trains, balloon baskets, giant pinwheels
7. **Supermarket** – checkout belts, rolling carts, icy freezers, the deli slicer, lobster tanks
8. **Sandy Shores** – the ocean below, crabs, seagulls, beach balls, bobbing buoys
9. **Frank in Space** – low gravity, lasers, gravity lifts, spinning satellites, UFOs
10. **Hot Dog Heaven** – clouds, giant condiments, donuts, deep fryers, forks… and the final flip

## Play it

```bash
npm install
npm run dev        # http://localhost:8123  (no build step needed while developing)
npm run build      # → dist/  single-file index.html + PWA manifest + service worker + icons
```

Deploy `dist/` to any static host (Netlify, GitHub Pages, Vercel…). On a phone, open the URL and **Add to Home Screen** — it runs full-screen and offline.

Dev URL flags: `?level=37` jump to a level · `?debug` collision overlay + all worlds unlocked · `?nosw` skip the service worker.

## Testing

```bash
npm run dev &               # serve on :8123, then:
npm test                    # mechanics, soak, e2e-ads, e2e-native, e2e-shop, e2e-recover, store-products script, e2e-all (plays all 200 levels)
node tools/qa.mjs           # every route replayed with human-sized error
npm run test:chaos          # random play through the real game on every level (about an hour)
npm run test:screens        # screenshots of every screen on 9 phone/tablet sizes and of every level, with a layout audit
npm run release:check       # pre-publish gate (see RELEASE.md)
```

- `tools/test-mechanics.mjs` puts every object type (as configured in the levels) alone in a test level and drops and throws the sausage at it: each kind must do its job (land, bounce, pop, blow, carry, convey, catch, fail with the right reason, win), and nothing may pass through a surface, leave the world, turn into NaN or stay unresolved.
- `tools/soak-levels.mjs` plays every level with three kinds of random player, using the game's own respawn rules (`src/checkpoint.js`): no soft-locks, respawn loops, traps that only the 12-second stuck rule ends, tunnelling or escapes.
- `tools/e2e-chaos.mjs` does random flips, pauses, restarts and look-arounds in the real game (rendering, effects, sound, HUD) on every level and fails on any page error.
- `tools/visual-screens.mjs` taps through every screen and dialog with real taps on 9 screen sizes (320 px phones to iPad landscape and Split View, with simulated notches) and audits each layout: buttons cut off or under the notch, covered or overlapping buttons, small tap targets, clipped text. `tools/visual-levels.mjs` screenshots every level (opening view, overview, mid-flight, win) for review. `tools/check-layout.mjs` lints level layouts.
- `tools/retime-routes.mjs` keeps the stored routes exact after a change to when the sausage counts as ready to flip.
- `tools/ad-sim.mjs` estimates ads and ad revenue: it measures how forgiving every shot of a world is with the real physics, plays thousands of simulated players through it with the game's own ad pacing (`src/ads.js`), and prices the impressions for three audience mixes. Every assumption about people and prices is listed at the top of the file and can be changed with `--set`; `--detail` adds a per-level table (flips, skips, hints) that also shows difficulty spikes.

**On Android and iPhone without owning either:** every push that touches `sizzle-flip/` runs the GitHub workflow *Sizzle Flip devices* (`.github/workflows/sizzle-flip-devices.yml`). It builds the real app with an on-device self-test (`node tools/build.mjs --smoke`, `tools/device-smoke.js`) and runs it on Android 13 and Android 16 emulators and an iPhone Simulator (Xcode on a GitHub Mac). The self-test checks that the AdMob, store-billing and storage plugins load, plays level 1 through the game's touch handlers, plays a level as a shop character, opens the shop and the Hot Dog packs, and checks that a purchase the store can't complete fails cleanly. It also compiles the unsigned store builds (Android release APK/AAB, iPhone release). Screenshots and device logs are on the run page under Artifacts. A self-test build can't be shipped by accident: `npm run release:check` fails on one.

`tools/e2e-all.mjs` plays every level through the real game: each stored route is fed through the game's own touch handlers at the exact physics step the solver used, then NEXT, the world-complete cards and forced ads are handled through the real UI. `tools/e2e-native.mjs` mocks the Capacitor plugins (AdMob event semantics, Android back button, Google Play and StoreKit billing) to test the app-only code paths.

## Native app store builds (Capacitor)

The repo contains both native projects, set up for the stores. **Android** (`android/`): Capacitor 8, **targets Android 16 (API 36)** as Google Play requires, portrait (Android 16 ignores the lock on tablets, and the game also plays in landscape there), adaptive icon and splash generated from the game's own art, and an optional release signing config. **iOS** (`ios/`): the game's icon and launch screen, iPhone portrait and every iPad orientation (iPad multitasking), the AdMob / tracking / SKAdNetwork keys, the export-compliance answer and a privacy manifest; archive it in Xcode on a Mac. **Step-by-step publishing guide: [RELEASE.md](RELEASE.md).**

```bash
npm run cap:sync                        # build the web game and copy it into the native projects
npm run release:check                   # pre-publish gate
cd android && ./gradlew bundleRelease   # signed AAB (with android/keystore.properties), or use Android Studio
npx cap open ios                        # on macOS with Xcode → Archive → App Store Connect
```

Native extras are wired in automatically when running inside Capacitor: real haptics (`@capacitor/haptics`), a hidden status bar (`@capacitor/status-bar`), the Android back button (`@capacitor/app`), AdMob, store billing (`@capgo/native-purchases`) and native storage for the wallet (`@capacitor/preferences`).

## Ads

Ad logic lives in `src/ads.js` (pacing rules `AD_RULES`, the AdMob and placeholder providers). The AdMob ids live in `src/ads-config.js`; while they are Google's test ids the app runs in test mode.

**When ads appear**

| Ad | Where | Rule |
|---|---|---|
| Forced (interstitial) | Tapping **Next** or **Levels** on the level-complete card | Not before 5 levels are beaten **and** 5 minutes are played · then at most every 3rd level beaten **and** 3+ minutes apart · skipped after a level that took 10+ fails · never on world-complete, the finale, retry, fail or pause |
| Reward (opt-in) | 💡 hint | The first hint in each world is free; later ones show an **AD** badge and unlock after a reward ad |
| Reward (opt-in) | ⏭ skip | Shows after 10 flips that didn't win an unbeaten level — landings that miss the bun, falls and restarts all count, and so do earlier visits to the level (never on level 200). The level is marked *skipped* (no stars) and the next one opens |
| Reward (opt-in) | 🎯 Long aim guide (Pause menu and Options) | One ad turns it on for 10 minutes of real time (`longAimMinutes`). The aim line then shows 1.3 s of flight instead of 0.55 s. A countdown shows in the HUD, the timer survives reloads, and the player is told when it ends. A tip points to it after 5 fails |

If no ad is available (no fill, offline), the reward is granted anyway. A taken hint stays on screen through restarts. The game pauses and its audio is muted while any ad is showing. There are no banners. Setting `save.adsRemoved` (wire it to a "Remove ads" purchase) stops forced ads and keeps the opt-in ones.

**Testing the flow:** the Claude artifact, a `localhost` dev server and any URL with `?adtest` show clearly labelled placeholder ads. **Settings → Ad testing** (test builds only) has fast pacing, a "Remove ads" switch, buttons to preview both ad types, and a live readout of the pacing state. `node tools/e2e-ads.mjs` runs the whole flow in headless Chromium (42 checks). `node tools/e2e-recover.mjs` checks that the game can't get stuck (camera parked, input dead) after the view shrinks to zero size or the frame clock jumps. A deployed web build shows no ads.

**Going live with AdMob** (`@capacitor-community/admob` is installed and synced):

1. Create the app and two ad units (Interstitial, Rewarded) per platform in the [AdMob console](https://apps.admob.com).
2. Put the unit ids in `ADMOB_UNITS` in `src/ads-config.js` (test mode switches off by itself once no Google test id is left). To keep test ads on your own phone, add its test-device id to `testingDevices`.
3. Android: replace `admob_app_id` in `android/app/src/main/res/values/strings.xml` (it's read by `AndroidManifest.xml`).
4. iOS (after `npx cap add ios`): add to `ios/App/App/Info.plist` the keys `GADApplicationIdentifier` (your iOS app id), `GADIsAdManagerApp` = `true`, `SKAdNetworkItems` (Google's list) and `NSUserTrackingUsageDescription` (for example "Used to show you more relevant ads.").
5. Set up a GDPR consent message (AdMob → Privacy & messaging). The app asks for consent and App Tracking Transparency at launch.
6. Store forms: declare that the app contains ads and fill in the data-safety section (advertising ID). If you target children, set `childDirected: true` and follow Google Play Families policy.
7. `npm run cap:sync`, then `npm run release:check`, then build (see [RELEASE.md](RELEASE.md)).

Google's public test ids are configured now, so a debug build shows real test ads right away. Players in the EEA/UK can reopen the consent form from **Options → Privacy choices**.

## Shop

130 cosmetic characters, from a stick of butter to a dragon, sit in seven shop tabs: Food, Sweets, Stuff, Rides, Critters, Party and Colors, plus Bundles and Owned. They're unlocked with **Hot Dogs** 🌭, the in-game currency:

| | |
|---|---|
| Hot Dogs | Bought with real money in six packs: 100 ($0.99), 500, 1,000, 2,500, 5,000 and 10,000 ($99.99). **$1 = 100 Hot Dogs** |
| A character | 🌭100, so still $1 |
| A tab's bundle | Every character of that tab, 20% off, priced by how many of them the player is still missing: Food (27) 🌭2,160, Sweets (21) 🌭1,680, Stuff (31) 🌭2,480, Rides (9) 🌭720, Critters (17) 🌭1,360, Party (12) 🌭960, Colors (13) 🌭1,040. Offered while at least 2 are missing |
| Everything Bundle | All 130 at the same rate: 🌭10,400 (less for each character already owned) |

All of these numbers live in `src/shop-config.js`. Spending asks for confirmation; if the player is short, the Get Hot Dogs window opens with the smallest pack that covers it highlighted, and after buying it the item is offered right away.

**Store billing** (`src/shop.js`, `@capgo/native-purchases`): the packs are consumable products. Each purchase is credited once, keyed by its store transaction id, and only then consumed (Android) or finished (iOS); until then the store keeps it, and the game looks again at launch, on resume and when the shop opens. So a purchase interrupted at any point (app killed, connection lost, a pending payment that clears later, an Ask to Buy approval) is credited later, never twice. On iOS this relies on a small patch to the plugin (`patches/`, applied on `npm install`) that stops it finishing transactions on its own. Every purchase carries the install's wallet id, so a second phone or tablet on the same store account doesn't credit it as well. Store calls run one at a time, because on Android overlapping calls cut each other's billing connection. iOS refunds take the Hot Dogs back. The wallet (balance, characters, credited purchases) lives on the device, in the save and in a native copy (`@capacitor/preferences`) that brings it back if the OS clears the web view's storage. Test builds use a clearly labelled test store; the plain web build shows the characters as "In the app".

**Creating the store products:** `node tools/create-store-products.mjs --play --apple` creates or updates the six packs in Google Play and App Store Connect through their APIs (credentials and steps: [RELEASE.md](RELEASE.md)). `--dry-run` shows what it would do; `node tools/test-store-products.mjs` tests it against a mock of both APIs.

**The characters** are defined in `src/art/items.js` (the first 30) and `src/art/items-more.js` (100 more), and drawn by `src/art/itemkit.js` over the sausage's own soft-body particle chain: a width profile along the same centreline, painted details, attachments (stems, sticks, wheels, fins, wings) and the same expressive face. The physics, and so every level, are unchanged. `tools/items-gallery.html` shows every character in three poses.

## Store screenshots and video ad

```bash
npm run dev &
node tools/marketing/screens.mjs   # store/ios (1290×2796), store/ipad (2064×2752), store/play (1080×1920): 8 captioned screenshots each
node tools/marketing/ad.mjs        # store/video: a 30 s vertical ad (1080×1920) and the App Store app preview (886×1920, 29.5 s)
```

Both record the real game. Chromium runs it on a fake clock, so every frame is exact, and levels are played along their verified routes through the game's touch handlers, with the aim drag and a finger marker shown (`tools/marketing/kit.mjs`). Captions and scenes are listed at the top of each script. The ad's soundtrack is the game's own music and sound effects, rendered offline at the moments they happen in the footage. The App Store preview shows only in-app footage and doesn't mention other stores, as Apple requires.

## How the levels are made (and why they're all beatable)

Levels are built by `tools/generate.mjs` from per-world *recipes* (which props, hazards and mechanics are unlocked at each level, with the tutorial tip that introduces them) and a difficulty curve (target par, level height, obstacle density).

Every candidate level is then **played by a bot**: `tools/solver.mjs` beam-searches thousands of flips per resting position using the *exact same deterministic physics* the game runs and finds the fewest-flip route. Each shot on that route is re-fired with human-sized mistakes (aim ±1.2°, power ±2%, reaction time ±0.06 s) and must still work a set fraction of the time — high for early levels, lower as the game gets harder — so no level depends on a pixel-perfect shot. Impossible, trivial or fragile levels are rejected and rebuilt. The winning route is stored with the level and **replayed continuously** to prove it reproduces; that same route powers the in-game 💡 hint and the title-screen demo.

`node tools/qa.mjs` re-plays every stored route with random human error and reports a success rate per level. `node tools/tune-par.mjs` then sets each level's **par**: the bot's fewest flips, plus one (or two, for long routes) where the clean route is rarely executed perfectly, so three stars stay within reach. The solver's minimum is kept as `minFlips` — beating par is possible and earns the *Under Par* trophy.

Full rebuild: `node tools/generate.mjs --workers 4 && node tools/tune-par.mjs` (about 1–2 hours on 4 cores).

```bash
node tools/generate.mjs --workers 4             # (re)generate all 200 levels → src/levels/data.js
node tools/generate.mjs --only 41 --force       # regenerate a single level
```

QA pages (serve the folder, then open):

- `tools/levelview.html?src=game&ids=0,1,2` — whole levels with the solver's route traced
- `tools/gallery.html?world=kitchen&debug=1` — every prop of a world with its collision outline
- `tools/faces.html` — the sausage's expression sheet

## Project layout

```
index.html, styles.css      app shell + menus (DOM) and the game canvas
src/main.js                 boot, loop, input routing, progression, save data
src/game.js                 one level session: sim, aiming, camera, effects, rendering
src/checkpoint.js           respawn points: only spots the sausage really stays on, with fallback
src/physics.js              deterministic position-based soft-body physics (shared with the solver)
src/objects.js              prop library: collision shapes, materials, roles (10 worlds, 100+ props)
src/art/                    procedural vector art: sausage + face, props per world, backgrounds, logo
src/audio.js                synthesized SFX + per-world procedural music
src/ads.js                  ad pacing rules, AdMob + placeholder providers
src/ads-config.js           AdMob ids (edit before release)
src/shop.js                 shop: Hot Dogs wallet, store billing / test store, bundles, equip
src/shop-config.js          shop prices: Hot Dog packs, character price, bundle discount
src/art/itemkit.js          shop character renderer (art only — same physics body as the sausage)
src/art/items.js            shop characters 1–30, tabs; items-more.js: 100 more
src/privacy.js              privacy policy (in-app + dist/privacy.html) and the support page (dist/support.html)
src/levels/data.js          the 200 generated & verified levels
tools/                      generator, solver, par tuning, tests (mechanics, soak, e2e, chaos, screens), build, icon renderer; marketing/: store screenshots + video ad; ci/: device runs
store/                      listing.md (store text), iap-products.csv (the packs), captioned screenshots: ios/ (1290×2796), ipad/ (2064×2752), play/ (1080×1920); video/ (ad + App Store preview); icons/ has store icons + feature graphic
android/                    Capacitor Android project
ios/                        Capacitor iOS project (Xcode)
```

## Credits

Everything — code, art, sound and music — is generated from code in this repo. Fonts: [Lilita One](https://fonts.google.com/specimen/Lilita+One) and [Fredoka](https://fonts.google.com/specimen/Fredoka), SIL Open Font License (see `assets/fonts/`).
