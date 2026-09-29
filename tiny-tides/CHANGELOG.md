# Changelog

## 1.0.0 — first App Store release

**Game:** idle tidepool with 70 collectible creatures across 10 families (Tidepool + premium Deep Ocean), habitat-based evolution, day/night sky and moon-phase Spring Tides, daily rewards and quests, Tide Gifts, Tidedex.
**Capsule Machine:** free daily capsule, Capsule Coins, optional Sea Glass pulls (max 20/day, switchable off), 99 collectible toys + prize capsules, hard pity (Rare+ ≤10, Legendary ≤60), weekly spotlight, shards & Prize Counter, Toybox sets. Drop rates published in-app and online.
**Monetization:** optional cosmetic decor packs, speed-ups, Sea Glass, Golden Hourglass, Deep Ocean. No ads, no accounts, no tracking.

**Polish & hardening pass (this release):**
- Rules: release refunds are priced on actual spend; daily gates only move forward (clock rewinds can't re-arm rewards, free capsule or the daily pull cap); DST-safe game days; damaged saves are repaired or refused (backup is used); newest save wins by write counter; pity-guaranteed pulls are always real toys; purchase ledger trimmed by age; honest Sea Glass bonus labels; pool XP curve softened (1.5 → 1.42); daily Sea Glass pull cap 30 → 20.
- Purchases: StoreKit plugin patched so nothing is finished before it is saved; launch/resume reconcile with the App Store's transaction list; paid pulls stay off until the storefront region is known.
- UI: first-evolution tutorial can no longer be stranded by a restart; no "Send home" during the tutorial; toasts show above dialogs; free capsule used first when tapping the crank; Escape/backdrop behave; small-screen HUD; larger hit areas; iOS 15 CSS fallbacks; audio survives interruptions; idle scenes draw at 30 fps.
- Legal: generated privacy policy, terms/EULA, drop-rates page (checked against every possible weekly spotlight), parents' guide, support and licenses pages; in-app Legal & credits; release gate for placeholders; admin checklist.
- Quality: ESLint clean; 95+ unit tests including fuzzers; 4 Playwright suites + UI monkey; three independent code reviews.
