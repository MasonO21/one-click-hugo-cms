# Night Precinct

An offline idle / incremental game where you build a police precinct, then a fire station, then an EMS service (three worlds, 12 ranks each). It is a single HTML5 game wrapped in a small native iOS app with real StoreKit 2 in-app purchases.

Everything needed to submit to the App Store lives in this folder. **Read "What only you can do" below first**: a few steps cannot be done by anyone but the account holder, and some things in here have not been verified on a real device.

```
game/        the game (HTML/CSS/JS source, fonts) and its tests
ios/         native iOS shell (Swift, XcodeGen spec, privacy manifest, StoreKit test file, icon)
legal/       privacy policy, terms of use (EULA), purchase and subscription terms, crate odds, support, notices
appstore/    listing text, screenshots, IAP setup, age rating, privacy label, export compliance, review notes, checklist
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
7. In App Store Connect: create the app, then the 16 in-app purchases and the subscription group exactly as listed in `appstore/IAP.md`. Set prices.
8. Upload the build (Xcode: Product > Archive > Distribute App), wait for processing, run it through TestFlight with a **Sandbox** Apple ID, and test every purchase, restore, and subscription cancel.
9. Paste the store text from `release/appstore/metadata/en-US/`, upload `appstore/screenshots/`, answer the age rating and privacy questions using `appstore/AGE_RATING.md` and `appstore/APP_PRIVACY.md`, attach the review notes.
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
| Region availability | Randomized crates are switched off automatically in Belgium (see `docs/FACTS.md`). Decide whether you want to distribute in China mainland, South Korea, and other regions with special rules for loot boxes or game licences |

## Design decisions worth knowing

- **No ads, no tracking, no analytics, no accounts, no network calls from the game.** "Data Not Collected" in the privacy label is accurate as built. If you add any SDK later, every legal document and the label must be updated.
- The earlier web demo had fake ads and a demo checkout. Those are gone. Free rewards (Rally Boost every 3 h, Supply Drop every 6 h, Daily Roll Call) replaced ads, and every purchase goes through StoreKit.
- Prices are always read from StoreKit (`displayPrice`), never hard-coded in the app.
- Purchases are de-duplicated by transaction ID and finished only after the reward is saved, so a crash mid-purchase cannot lose or duplicate items. Non-consumables and the subscription are re-derived from Apple's records at every launch and on Restore.
- Crate odds are shown in the app (Settings > Crate odds and in the Cases tab) and on `odds.html`. Buying crates with Gold Badges is disabled in Belgium.
- "Reduce flashing" (Settings) dims siren lights; it is on by default when iOS Reduce Motion is on.
- Balance (free-to-play, no purchases, simulated with the real game code): see "Balance" below.

## Building and testing

```
python3 tools/build.py --target native          # -> game/www/index.html   (what the app bundles)
python3 tools/build.py --target preview         # -> release/preview/night_precinct.html (fragment for web preview)
cd game/tests && npm install && npm test        # full QA suite (needs Chromium via Playwright)
node tools/make_assets.js all                   # regenerate app icon + screenshots
```

The test suite covers: release-build hygiene (no debug hooks, no network APIs, CSP, no leftover placeholders), corrupt-save recovery, the purchase flow against a mock iOS bridge (success, cancel, pending, error, duplicate delivery, crash recovery, restore, lapsed subscription, region gate, save mirroring, zero network requests), a layout audit at 7 device sizes in all three worlds, three seeded monkey tests (thousands of random actions each, scanning for errors / NaN / overflow), a frame-rate profile and a 90-second memory soak.

## Balance (free-to-play, no real-money purchases)

Simulated with the game's own code and a virtual clock (`game/tests/sim/`). Time to clear all three worlds:

| Player | Play pattern | Days to beat all three worlds |
|---|---|---|
| Casual | 2 sessions x 10 min | about 66 |
| Regular | 4 sessions x 15 min | about 36 |
| Dedicated | 8 sessions x 10 min | about 37 |
| Browser tab open all day | 6 sessions x 15 min, tab left open | about 40 |
| Always playing | 24 h a day | about 31 |

Per world for the regular player: police about day 11, fire about day 21, EMS about day 36. Spending money speeds this up but is never required: every world is clearable free. Run `node game/tests/sim/report.js` to reproduce.
