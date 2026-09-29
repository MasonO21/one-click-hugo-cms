# QA report (what was actually verified)

Run `npm run verify` to reproduce everything marked ✅ except the device items at the bottom.

| Area | How | Result |
|---|---|---|
| Simulation rules (traits, spawning, evolution, offline catch-up, quests, streaks, gifts, IAP ledger, save migration) | `test/sim.test.mjs` | ✅ |
| Capsule Machine rules (odds sum to 1, measured frequencies match the published per-item odds over 60 000 pulls, hard pity ≤9/≤59 dry pulls over 30 000, forced pulls are always real toys, costs, daily cap, off-switch, free daily, shards, Prize Counter, sets, deterministic RNG) | `test/gacha.test.mjs`, `test/hardening.test.mjs` | ✅ |
| **Fuzzing**: 120 random-play games × 250 actions (750 000 actions in the last full run) checking ~30 invariants (no NaN/negative currency, creatures on legal unique tiles, ids unique, pity in range, cap respected, save→load→save stable) | `test/fuzz.test.mjs` | ✅ |
| **Damaged / tampered saves**: 30 named corruptions + 400 random ones (null tiles, bad forms, duplicate ids, out-of-bounds creatures, junk currencies, prototype-pollution keys, missing Deep Ocean pool…) all load into a playable game or are cleanly refused so the backup is used | `test/hardening.test.mjs` | ✅ |
| **Clock & time zones**: rewinding the clock never re-arms daily rewards, quests, gifts, the free capsule, the free hourglass finish or the paid-pull cap; day keys agree across DST changes (New York); spotlight ends at 4 am local; newest-save selection ignores the wall clock | `test/hardening.test.mjs` | ✅ |
| **Economy**: building/refund loops never create value, release refunds ≤ 50 % of actual spend, capsule prizes return ≤11 % of a coin / <1 % of a Sea Glass pull, pack bonus labels are true | `test/economy.test.mjs` | ✅ |
| **Legal pages**: no unresolved placeholders, links resolve, tags balanced, every prize and percentage on the drop-rates page lies inside what the game can roll in any of 200 different weeks, all Apple minimum EULA clauses present, no network calls / tracking SDKs in the app, privacy manifest says no tracking | `test/legal.test.mjs` | ✅ |
| Progression & economy pacing | `npm run balance` (see docs/GAME_DESIGN.md → Balance) | ✅ |
| First-run tutorial → every screen → premium purchase (demo mode) → save/reload → welcome-back; **zero requests to any server** | `tools/qa/e2e.mjs` — Playwright, real touch, mobile Chromium | ✅ |
| Capsule Machine UI end-to-end (free pull, 10-pull, Open all, Sea Glass confirm, region block, Toybox, Prize Counter, Rates, persistence) at 390×844, 375×667, 360×740, 820×1180 | `tools/qa/gacha-e2e.mjs` | ✅ |
| Review regressions: tutorial can't be stranded by a restart, no Send-home mid-tutorial, toasts above dialogs, free capsule on crank tap, Escape/backdrop behaviour, HUD fits at 320 and 375 wide | `tools/qa/regress-e2e.mjs` | ✅ |
| UI monkey: 2 500+ random taps/presses/time jumps/reloads at 320×568, 390×844, 507×900 and 694×900 — no errors, invariants hold, UI always recoverable | `tools/qa/monkey.mjs` | ✅ |
| Frame cost under 4× CPU throttle (JS draw time per frame ~4–5 ms iPhone-size, ~12 ms iPad-size in software rendering; idle scenes draw at 30 fps) | `tools/qa/perf.mjs` | ✅ |
| Lint | `npm run lint` (ESLint: no undefined names, no unused code) | ✅ clean |
| Release bundle contains no debug hooks | grep `__tt` in `www/app.js` (also in CI) | ✅ ~285 KB |
| iOS project files | Info.plist/PrivacyInfo valid; `cap sync ios` succeeds with all plugins; Swift plugin patch applies cleanly | ✅ |
| Independent adversarial code reviews (rules layer; UI & tutorial flow; rendering/platform/iOS) | three reviewers, every finding reproduced or read-verified; fixes have regression tests | ✅ all confirmed findings fixed |
| **Real iPhone / iPad, TestFlight, Apple sandbox purchases, notifications, audio session, StoreKit behaviours** | *Not possible in this environment* | ⚠️ **run the checklists in `docs/APP_STORE_RELEASE.md` §6 and `legal/APP_STORE_ADMIN_CHECKLIST.md` §4** |

## Design decisions worth knowing
- **Purchases are delivered safely.** The StoreKit plugin is patched so a purchase is never “finished” automatically; the game saves the grant first, then acknowledges. On every launch/resume it also compares Apple’s transaction list with its ledger and delivers anything missing. Old (pre-install) consumables are not re-delivered; refunds are not clawed back. Verify on a device with sandbox purchases (see the checklist).
- **No server-side receipt validation.** Acceptable for a single-player game whose purchases are cosmetic/time-savers; add validation if you ever sell competitive advantages.
- **Clock changes.** A player who moves the device clock forward can skip timers (common for idle games, nothing online is affected), but cannot claim any daily reward, free capsule or capsule-spend limit twice by winding the clock back.
- **Paid random items** are off until the App Store storefront is known, and in Belgium and Brazil; players can also switch them off in Settings.
- The web build’s audio starts after the first tap (browser rule); on iOS the app follows the silent switch and recovers after phone-call interruptions.
