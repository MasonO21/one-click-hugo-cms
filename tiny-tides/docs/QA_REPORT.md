# QA report (what was actually verified)

| Area | How | Result |
|---|---|---|
| Simulation rules (traits, spawning, evolution, offline catch-up, quests, streaks, gifts, IAP crediting, save migration) | `npm test` — 37 Node tests | ✅ pass |
| Capsule Machine rules (odds table sums to 1, measured frequencies match published per-item odds over 60 000 pulls, pity ≤10/≤60 over 30 000 pulls, coin/glass costs, daily cap, disabled setting, free daily, shards, Prize Counter, sets, save migration, deterministic RNG) | `test/gacha.test.mjs` — 14 of the 37 tests | ✅ pass |
| Economy pacing | `npm run balance` — scripted player, 2/4/6 check-ins per day, 60 days | ✅ tuned (see design doc) |
| Capsule Machine UI: FAB → free pull → drop → open → reveal → 10-pull → Open all → summary → Sea Glass confirm → region block → Toybox → detail → Prize Counter → Rates (sums ≈100 %) → place figure → tap Beach Gachapon → reload persistence | `node tools/gacha-e2e.mjs` — Playwright, real touch | ✅ pass at 390×844, 375×667, 360×740, 820×1180 |
| First-run tutorial → every screen → premium purchase (demo mode) → save/reload → welcome-back | `npm run test:e2e` — Playwright, real touch events, mobile Chromium | ✅ pass on 390×844, 375×667, 820×1180 and 1180×820 |
| Console errors during all of the above | E2E asserts none | ✅ none |
| Release bundle contains no debug hooks | grep of `www/app.js` | ✅ ~250 KB, no `__tt` |
| iOS project files | Info.plist/PrivacyInfo parsed as valid plists; pbxproj braces balanced; `cap sync ios` succeeds with all 9 plugins | ✅ |
| **Real iPhone / iPad, TestFlight, Apple sandbox purchases, notifications, audio session** | *Not possible in this environment* | ⚠️ **you must run the checklist in `docs/APP_STORE_RELEASE.md` §6** |

Known limitations to be aware of:
- Purchases are trusted client-side (no receipt validation server). Acceptable for a single-player cosmetic/idle game; add server validation if you later sell competitive advantages.
- A player who moves the device clock forward can skip timers (common for idle games; no online features are affected).
- The web build's audio starts after the first tap (browser rule); on iOS the app follows the silent switch.
