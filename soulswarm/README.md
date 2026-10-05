# SOULSWARM: Raise the Legion

A top-down "legion survivor" for iOS and Android. Every enemy you kill can rise as a glowing soul that fights for you. You start alone and end the run leading hundreds. Soul Gates multiply your army, and Soul Nova detonates all of it in one screen-clearing blast.

- **Engine:** HTML5 + WebGL ([Three.js](https://threejs.org)) with custom shaders, bloom, GPU particles and instanced hordes. No external art: every model, effect, icon and sound is generated in code.
- **Store wrapper:** [Capacitor 7](https://capacitorjs.com). The native Xcode project is in `ios/` and the Android Studio project in `android/`.
- **Docs:** [`docs/`](docs/) contains the design brief, GDD, monetization model, live-ops calendar, marketing plan and production roadmap.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173. Use your phone on the same Wi-Fi for touch.
npm run build        # production web build in dist/
SINGLE=1 npm run build   # one self-contained HTML file in dist-single/
```

Desktop controls are WASD/arrows to move and Space for Soul Nova. On touch, drag anywhere to move and tap NOVA.

## Ship it to the stores

```bash
npm run cap:ios       # build, sync, open Xcode (needs macOS + Xcode 16+)
npm run cap:android   # build, sync, open Android Studio
npm run icons         # re-render icon/splash from the live game (dev server must be running)
npx capacitor-assets generate --assetPath resources   # regenerate native icon/splash sizes
```

Before submitting, you will need:
1. An Apple Developer account ($99/yr) and a Google Play developer account ($25 one-time). Set the bundle ID in `capacitor.config.json` (`com.soulswarm.game` is a placeholder).
2. **Real payments.** `src/meta/store.js` simulates purchases and rewarded ads. Replace `purchase()` with RevenueCat or StoreKit 2 / Play Billing, validate receipts on a server, and replace `rewardedAd()` with AppLovin MAX (or similar). Never grant items before validation.
3. Cloud save and anti-cheat. Progress lives in `localStorage` (`src/meta/save.js`), which is fine for soft launch, but move it server-side before any leaderboards.
4. Analytics, a privacy policy URL, the ATT prompt (iOS), GDPR consent, and age rating questionnaires. Odds disclosure for the Soul Altar is already in-game.

See `docs/PRODUCTION_ROADMAP.md` for the full checklist, team plan and budget.

## Code map

| Path | What it is |
|---|---|
| `src/main.js` | Boot and app wiring (profile, audio, engine, menus, runs) |
| `src/engine/` | Renderer and post-processing, shaders, GPU particles, procedural models, input, haptics |
| `src/game/data.js` | **All tunable content and numbers**: heroes, enemies, skills, chapters, relics, talents, shop, pass, quests |
| `src/game/run.js` | One run: director (waves, gates, elites, boss), XP, Soul Nova, death/revive, camera |
| `src/game/*.js` | Enemies, legion, weapons, projectiles, pickups, gates, boss, world, effects |
| `src/meta/` | Save, economy rules (gacha, pass, quests, rewards), store adapter |
| `src/ui/` | Design system (`style.css`), HUD and run modals (`runui.js`), menus (`meta/`) |
| `src/audio/audio.js` | Procedural Web Audio SFX and music, with no audio files |
| `resources/` | Master icon and splash art |

## QA hooks

`window.__soulswarm` exposes the app object for QA scripts, e.g. `__soulswarm.startRun(1)` or `__soulswarm.run.legion.addMany(100, 0, 0)`.
