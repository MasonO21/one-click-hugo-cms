# Night Precinct

An offline idle / incremental game where you build a police precinct, then a fire station, then an EMS service (three worlds, 12 ranks each). It is a single HTML5 game wrapped in a small native iOS app with real StoreKit 2 in-app purchases. The game is in English; every player-facing string is already marked for translation (`docs/TRANSLATING.md`), so adding a language later needs no code changes.

Everything needed to submit to the App Store lives in this folder. **Read "What only you can do" below first**: a few steps cannot be done by anyone but the account holder, and some things in here have not been verified on a real device.

```
game/        the game (HTML/CSS/JS source, fonts) and its tests
ios/         native iOS shell (Swift, XcodeGen spec, privacy manifest, StoreKit test file, icon)
legal/       privacy policy, terms of use (EULA), purchase and subscription terms, crate odds, support, notices
appstore/    listing text, screenshots, trailer, IAP setup, age rating, privacy label, export compliance, per-country rules, review notes, checklist
tools/       build + config scripts, icon/screenshot generator
docs/        FACTS.md (single source of truth for every claim in the legal and store text) and the native bridge protocol
release.config.json   the only file you edit to personalise everything
```

## Ship it in 10 steps

1. **Fill in `release.config.json`**: your company name and address, bundle ID, Team ID, contact e-mails, the URLs where you will host the legal pages, governing law.
2. `python3 tools/apply_config.py --strict` renders the legal pages, store text, Xcode project spec and StoreKit test file. `--strict` fails while any placeholder remains.
3. **Host `release/legal/*.html`** at the URLs from step 1 (any static host works; GitHub Pages is fine). They must be live before you submit.
4. Have the legal pages reviewed by a lawyer (see below), then re-run step 2.
5. On a Mac with the Xcode version App Store Connect currently requires (check Apple's "Upcoming Requirements" page; it has moved up every spring) and XcodeGen (`brew install xcodegen`): `cd ios && xcodegen generate && open NightPrecinct.xcodeproj`.
6. Run in the simulator (the scheme uses `Products.storekit`, so purchases work without App Store Connect). Go through `appstore/SUBMISSION_CHECKLIST.md` section "Device testing".
7. In App Store Connect: create the app, then the 16 in-app purchases and the subscription group exactly as listed in `appstore/IAP.md`. Set prices. Under **Pricing and Availability**, remove the countries listed in `appstore/COMPLIANCE_BY_COUNTRY.md` (at least Belgium, Brazil, China mainland, Vietnam and Russia) and turn off automatic release in new countries.
8. Upload the build (Xcode: Product > Archive > Distribute App), wait for processing, run it through TestFlight with a **Sandbox** Apple ID, and test every purchase, restore, and subscription cancel.
9. Paste the store text from `release/appstore/metadata/en-US/`, upload `appstore/screenshots/` and the app preview video `appstore/trailer/app-preview-886x1920.mp4`, answer the age rating and privacy questions using `appstore/AGE_RATING.md` and `appstore/APP_PRIVACY.md`, attach the review notes.
10. Submit for review.

## What only you can do (and what is not verified)

| Item | Why it needs you |
|---|---|
| Apple Developer Program account, bundle ID, Team ID, agreements/tax/banking for paid apps | Tied to a legal entity or person |
| Create the app + IAP products in App Store Connect and choose price points | Apple only offers fixed price points per storefront. The game shows whatever price StoreKit returns, but you set them. The two auto-clicker prices requested ($4.79 and $9.58) are not standard tiers; use the nearest ones offered (the docs assume 4.79 and 9.59) |
| **Compile and run the Swift code** | The Swift files were written without access to Xcode. They follow the documented StoreKit 2 / WebKit APIs and were carefully reviewed by reading, but expect that you may need to fix a compiler error or two. `ios/README.md` lists the parts to watch |
| **Sandbox / TestFlight purchase testing** | Cannot be simulated outside Apple's servers. The game side is tested against a mock of the bridge (`game/tests/native-mock.js`); the Swift side is not |
| **Lawyer review of `legal/`** | The documents are careful drafts written to match how the app actually works, and include Apple's required EULA terms, subscription disclosures and loot-box odds. They are not legal advice. Have them checked for your jurisdiction (consumer law, children's privacy, EU/UK requirements, class-action and arbitration wording, governing law) |
| **Trademark and name search for "Night Precinct"** | Not done. Do a USPTO/EUIPO and App Store search; rename in `release.config.json` if needed |
| Real device screenshots (optional) | The provided screenshots are rendered from the game at the exact required pixel sizes. Apple accepts them, but real Simulator captures are the safer choice if you want to match reviewer expectations exactly |
| Age rating questionnaire, privacy nutrition label, export compliance | Answers are prepared in `appstore/`, but you must enter them and they are your legal declaration |
| Support mailbox and website | The support and privacy pages tell players to write to the addresses you configure. They must be monitored |
| **Country availability** | Paid crates (random items) are on. The plan is to not sell the game where paid loot boxes are banned or need a licence: Belgium, Brazil, China mainland, Vietnam and Russia. You untick these in App Store Connect; the code cannot do it for you. As a safety net, the game also hides crate purchases if the App Store country or device region is Belgium or Brazil. South Korea, Taiwan, Japan and Indonesia have extra rules (local-language odds notices, a seller notice, a rating registration). `appstore/COMPLIANCE_BY_COUNTRY.md` lists each one with what to do or when to leave the country out |
| **Texas age-assurance law** | Apple has enforced the Texas App Store Accountability Act for new Texas accounts since 4 June 2026 (Utah, Louisiana, Alabama and California follow in 2027). Apple asks apps to use its Declared Age Range and related APIs (iOS 26.2+ SDK). **These are not built.** Have counsel assess launching in the US without them, or add them before launch |
| Japan seller notice | `legal/japan.html` (Act on Specified Commercial Transactions) needs a responsible person and a phone number: fill `COMPANY_REPRESENTATIVE` and `CONTACT_PHONE` in `release.config.json`, or leave Japan out |

## Design decisions worth knowing

- **No ads, no tracking, no analytics, no accounts, no network calls from the game.** "Data Not Collected" in the privacy label is accurate as built. If you add any SDK later, every legal document and the label must be updated.
- The earlier web demo had fake ads and a demo checkout. Those are gone. Free rewards (Rally Boost every 3 h, Supply Drop every 6 h, Daily Roll Call) replaced ads, and every purchase goes through StoreKit.
- Prices are always read from StoreKit (`displayPrice`), never hard-coded in the app.
- Purchases are de-duplicated by transaction ID and finished only after the reward is saved, so a crash mid-purchase cannot lose or duplicate items. Non-consumables and the subscription are re-derived from Apple's records at every launch and on Restore.
- Crate odds are shown in the app (Settings > Crate odds, the Cases tab, and the confirmation shown before every crate purchase) and on `odds.html`. Gold Badge prices show an approximate real-money value. The store listing starts with "Contains loot boxes" (required in the UK). Crate purchases are hidden if the App Store country or device region is Belgium or Brazil.
- "Reduce flashing" (Settings) dims siren lights; it is on by default when iOS Reduce Motion is on.
- Balance (free-to-play, no purchases, simulated with the real game code): see "Balance" below.

## Building and testing

```
python3 tools/build.py --target native          # -> game/www/index.html   (what the app bundles)
python3 tools/build.py --target preview         # -> release/preview/night_precinct.html (fragment for web preview)
cd game/tests && npm install && npm test        # full QA suite (needs Chromium via Playwright)
node tools/make_assets.js all                   # regenerate app icon + screenshots
node tools/trailer/make_trailer.js all          # re-render both trailer videos (about 4 min each)
```

The test suite covers: release-build hygiene (no debug hooks, no network APIs, CSP, no leftover placeholders), corrupt-save recovery, the purchase flow against a mock iOS bridge (success, cancel, pending, error, refund, duplicate delivery, crash recovery, restore, lapsed subscription, country gate, save mirroring, zero network requests), regression checks for every bug fixed before release, translation readiness, a layout audit at 7 device sizes in all three worlds, three seeded monkey tests (thousands of random actions each, scanning for errors / NaN / overflow), a frame-rate profile and a 90-second memory soak.

## Balance (free-to-play, no real-money purchases)

Simulated with the game's own code and a virtual clock (`game/tests/sim/`). Time to clear all three worlds:

| Player | Play pattern | Days to beat all three worlds |
|---|---|---|
| Casual | 2 sessions x 10 min | about 68 |
| Regular | 4 sessions x 15 min | about 37 |
| Dedicated | 8 sessions x 10 min | about 38 |
| Browser tab open all day | 6 sessions x 15 min, tab left open | about 40 |
| Always playing | 24 h a day | about 32 |

Per world for the regular player: police about day 12, fire about day 22, EMS about day 37. Spending money speeds this up but is never required: every world is clearable free. Run `node game/tests/sim/report.js` to reproduce.

## Trailer

Two 30-second videos cut from real gameplay (the game runs on a virtual clock and is captured frame by frame, with an original synthesized 150 BPM soundtrack, no licensed music or stock footage):

| File | Use |
|---|---|
| `appstore/trailer/night-precinct-trailer-1080x1920.mp4` | Social and paid ads (TikTok, Reels, Shorts, Meta, Apple Search Ads). Ends on a "FREE TO PLAY" card and carries the line "In-game purchases (includes random items)" |
| `appstore/trailer/app-preview-886x1920.mp4` | App Store app preview for the 6.5"/6.9" iPhone slot. No price or "free" claim, as Apple's preview rules require |

Korean ads for a game with paid random items must say so in Korean ("확률형 아이템 포함"); add that before running ads there.
