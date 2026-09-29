# QA report (what was actually verified)

| Area | How | Result |
|---|---|---|
| Simulation rules (traits, spawning, evolution, offline catch-up, quests, streaks, gifts, IAP crediting, save migration) | `npm test` — 23 Node tests | ✅ pass |
| Economy pacing | `npm run balance` — scripted player, 2/4/6 check-ins per day, 60 days | ✅ tuned (see design doc) |
| First-run tutorial → every screen → premium purchase (demo mode) → save/reload → welcome-back | `npm run test:e2e` — Playwright, real touch events, mobile Chromium | ✅ pass on 390×844, 375×667, 820×1180 and 1180×820 |
| Console errors during all of the above | E2E asserts none | ✅ none |
| Release bundle contains no debug hooks | grep of `www/app.js` | ✅ 192 KB, no `__tt` |
| iOS project files | Info.plist/PrivacyInfo parsed as valid plists; pbxproj braces balanced; `cap sync ios` succeeds with all 9 plugins | ✅ |
| **Real iPhone / iPad, TestFlight, Apple sandbox purchases, notifications, audio session** | *Not possible in this environment* | ⚠️ **you must run the checklist in `docs/APP_STORE_RELEASE.md` §6** |

Known limitations to be aware of:
- Purchases are trusted client-side (no receipt validation server). Acceptable for a single-player cosmetic/idle game; add server validation if you later sell competitive advantages.
- A player who moves the device clock forward can skip timers (common for idle games; no online features are affected).
- The web build's audio starts after the first tap (browser rule); on iOS the app follows the silent switch.
