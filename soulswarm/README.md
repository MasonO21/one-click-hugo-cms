# SOULSWARM: Raise the Legion

A top-down "legion survivor" for iOS and Android. Every enemy you kill can rise as a glowing soul that fights for you. You start alone and end the run leading hundreds. Soul Gates multiply your army, and Soul Nova detonates all of it in one screen-clearing blast.

- **Engine:** HTML5 + WebGL ([Three.js](https://threejs.org)) with custom shaders, bloom, GPU particles and instanced hordes. Every 3D model, effect and sound is generated in code. The painted 2D art (key art, hero splashes, logo, icon) was made with Higgsfield; see `docs/ART_AND_ADS.md`.
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

## What's in the game

- **5 campaign chapters** (6:00 survival, then the Gravemaw boss), plus **Endless Abyss**, unlocked by clearing Chapter 5. In Endless there is no time limit, Gravemaw returns every 5:00 and grows stronger, and your deepest run is recorded.
- **4 heroes** with signature weapons, plus **6 weapons, 8 passives and 2 evolutions** drafted on level-up cards.
- **The legion:** raise slain enemies, multiply them through **Soul Gates**, and detonate them with **Soul Nova**.
- **Meta progression:** talents, relics (8 types × 4 rarities), hero stars, the Soul Altar gacha (odds and pity shown in-game), a 30-tier Soul Pass, daily quests, a 7-day login calendar, energy, and a shop with simulated IAP and rewarded ads.

## Test and marketing tools

```bash
npm run playtest      # headless bot plays every hero, a full Chapter 1 clear, Endless and economy checks (28 checks)
npm run balance       # bot plays chapters 1–5 with typical progression; reports clears, deaths, boss time-to-kill (needs dev server)
npm run trailer       # renders a 21 s 1080×1920 gameplay ad to store/trailer-9x16.mp4 (needs dev server + ffmpeg)
npm run screenshots   # renders captioned 1290×2796 store screenshots to store/screenshots/ (needs dev server)
npm run art           # rebuilds in-game art, icon, splash and native sets from the painted masters in store/art
npm run build:web     # one-file web build, plus dist-single/soulswarm.html for embedding hosts
```

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
| `resources/` | App icon and splash (built from the painted masters by `npm run art`) |
| `store/` | Painted key art masters (`art/`), cinematic video ads (`ads/`), in-engine trailer and App Store screenshots; see `docs/ART_AND_ADS.md` |
| `scripts/` | Playtest bot, trailer and screenshot renderers, painted-asset pipeline, web build |

## QA hooks

`window.__soulswarm` exposes the app object for QA scripts, e.g. `__soulswarm.startRun(1)` or `__soulswarm.run.legion.addMany(100, 0, 0)`.
