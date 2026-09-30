# Changelog

## 1.0.0 — first App Store release

**Game:** idle tidepool with 70 collectible creatures across 10 families (Tidepool + premium Deep Ocean), habitat-based evolution, day/night sky and moon-phase Spring Tides, daily rewards and quests, Tide Gifts, Tidedex.
**Capsule Machine:** free daily capsule, Capsule Coins, optional Sea Glass pulls (max 20/day, switchable off), 99 collectible toys + prize capsules, hard pity (Rare+ ≤10, Legendary ≤60), weekly spotlight, shards & Prize Counter, Toybox sets. Drop rates published in-app and online.
**Monetization:** optional cosmetic decor packs, speed-ups, Sea Glass, Golden Hourglass, Deep Ocean. No ads, no accounts, no tracking.

**Compliance & release-readiness pass:**
- Age check before the first Sea Glass capsule pull (Apple's Declared Age Range on iOS 26+, otherwise a neutral birth month/year screen; only "adult / under 18" is kept on the device). Where the law requires an age check (e.g. Texas SB 2420) the app asks Apple at launch.
- Players under 18 need a parent (parental gate) to turn on Sea Glass pulls and to confirm real-money purchases.
- Every Sea Glass spend asks first and shows the approximate real-money value; the App Store description opens with "Contains in-game purchases (includes random items)."
- Toybox set rewards are off in Japan (complete-gacha rule); paid pulls stay off in Belgium and Brazil.
- Publisher contact maceion@proton.me, United States; terms use your US state's law; privacy policy adds US state privacy, Do Not Track/GPC and age-check sections.
- All text moved into one generated English file (src/locales/en.json), ready for translation later.
- Art: crab hats sit between the eye-stalks, jellyfish hats sit on the dome, the nautilus face sits in front of its shell, decorations and sparkles never cover faces, golden figures read as gold for every creature, Holo Prism skin has rainbow water, and several edge-clipping fixes.
- 30-second vertical and landscape trailer (store/trailer/).

**Polish & hardening pass:**
- Rules: release refunds are priced on actual spend; daily gates only move forward (clock rewinds can't re-arm rewards, free capsule or the daily pull cap); DST-safe game days; damaged saves are repaired or refused (backup is used); newest save wins by write counter; pity-guaranteed pulls are always real toys; purchase ledger trimmed by age; honest Sea Glass bonus labels; pool XP curve softened (1.5 → 1.42); daily Sea Glass pull cap 30 → 20.
- Purchases: StoreKit plugin patched so nothing is finished before it is saved; launch/resume reconcile with the App Store's transaction list; paid pulls stay off until the storefront region is known.
- UI: first-evolution tutorial can no longer be stranded by a restart; no "Send home" during the tutorial; toasts show above dialogs; free capsule used first when tapping the crank; Escape/backdrop behave; small-screen HUD; larger hit areas; iOS 15 CSS fallbacks; audio survives interruptions; idle scenes draw at 30 fps.
- Legal: generated privacy policy, terms/EULA, drop-rates page (checked against every possible weekly spotlight), parents' guide, support and licenses pages; in-app Legal & credits; release gate for placeholders; admin checklist.
- Quality: ESLint clean; 95+ unit tests including fuzzers; 4 Playwright suites + UI monkey; three independent code reviews.
