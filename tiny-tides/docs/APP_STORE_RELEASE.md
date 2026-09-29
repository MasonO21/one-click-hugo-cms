# Shipping Tiny Tides to the App Store

Everything that can be prepared without a Mac and an Apple Developer account is **already done and committed** in this folder:
the Xcode project (`ios/`), app icon + launch screen, privacy manifest, export-compliance flag, StoreKit test file, store screenshots, listing copy, a generated legal website (privacy, terms/EULA, drop rates, parents' guide, support, licenses), the IAP catalogue and an App Review notes file.
What remains is the part only *you* can do: sign with your Apple account, create the App Store Connect record, and press Submit. This runbook is that part, in order.

> **Honest status:** the game logic (95+ unit tests including fuzzers), the full first-run flow and every screen have been tested in a phone-sized browser with real touch input. It has **not** been run on a physical iPhone or through Apple's sandbox — that needs your Mac/devices. Section 6 is a device checklist; please run it via TestFlight before submitting.

> **Do this in order:** this runbook (Mac/Xcode/upload) and **`legal/APP_STORE_ADMIN_CHECKLIST.md`** (accounts, agreements, tax, EU trader status, age rating, territories, App Store Connect fields) together cover everything that isn't code.

## 0. What you need
- A Mac with the **latest stable Xcode** (Capacitor 8 needs a recent Xcode; Apple also raises the minimum SDK for uploads each spring — check *App Store Connect → Apps → Uploads* if the upload is rejected for SDK version).
- An **Apple Developer Program** membership ($99/yr) — https://developer.apple.com/programs/
- Node 20+ (`node -v`).
- A place to host the static `site/` folder (GitHub Pages, Netlify, Cloudflare Pages…).

## 1. Get the code and choose your identity
```bash
git clone <this repo> && cd <repo>/tiny-tides
git checkout claude/tiny-tides-game        # the branch this was built on
npm ci
npm run verify                             # lint + unit tests + e2e + release build — should be all green (legal:check is expected to fail until step 2 is done)
```
**Pick your bundle id** (reverse-DNS of a domain/name you control). Every IAP product id is derived from it, so change it *before* creating anything in App Store Connect:
```bash
npm run rename -- com.yourname.tinytides    # updates data.js, capacitor.config.json, Xcode project, legal config, StoreKit file, store/iap-products.md
```

## 2. Publish the legal pages and set the links
All legal documents are generated from **`legal/site.config.json`** (see `legal/README.md`).
1. Fill in every value in `legal/site.config.json`: your legal name, a support inbox you monitor, postal address, governing law, and the address (`baseUrl`) where you will host the site. `bundleId` is already set by step 1.
2. `npm run site` — writes `site/` (privacy, terms/EULA, drop rates, parents' guide, support, licenses) and `store/EULA.txt` + `store/APP_REVIEW_NOTES.md`.
3. Host the `site/` folder at `baseUrl` (GitHub Pages via the manual workflow `.github/workflows/tiny-tides-pages.yml`, Netlify, Cloudflare Pages, your domain…). Open every page on a phone.
4. `npm run legal:check` must pass. It fails while any placeholder remains, a generated page is stale, or the bundle id differs between the config, Xcode and Capacitor. `npm run release` runs it for you, and `npm run build` bakes the same details into the app (Settings links, Legal & credits).

## 3. Build and open in Xcode
```bash
npm run release       # lint + tests + legal check + release build (minified, debug hooks stripped) + cap sync
# (or just `npm run ios:sync` to build and sync without the gates)
npm run ios:open      # opens ios/App/App.xcodeproj
```
In Xcode → target **App**:
- **Signing & Capabilities** → select your *Team*; leave "Automatically manage signing" on.
- **+ Capability → In-App Purchase**.
- **General**: Display Name `Tiny Tides`, Version `1.0`, Build `1` (bump Build for every upload). Deployment target iOS 15. Devices: iPhone + iPad.
- Confirm `ios/App/App/PrivacyInfo.xcprivacy` shows under the App group (it is wired in already).

### Test purchases locally (no App Store Connect needed)
Product → Scheme → Edit Scheme → **Run → Options → StoreKit Configuration → `TinyTides.storekit`**. Run on a simulator or device and buy everything. Use *Debug → StoreKit → Manage Transactions* to test refunds, Ask-to-Buy and interrupted purchases.

## 4. Create the app in App Store Connect
1. Apps → **+ New App**: iOS, name, primary language, the bundle id from step 1, SKU (`tinytides-ios-001`).
2. **App Information**: category Games (Simulation, Casual), Privacy Policy URL, age rating (answers in `store/APP_STORE_LISTING.md`). **The Capsule Machine sells randomized items, so answer the loot-box question Yes and expect a rating above 4+.**
3. **App Privacy**: *Data Not Collected*.
4. **Pricing**: Free. **Availability**: all territories.
5. **Monetization → In-App Purchases**: create the 10 products in `store/iap-products.md` **exactly** (Product ID, type, price, name, description, review screenshot). They must be in *Ready to Submit* state and attached to the version.
6. **Version 1.0**: paste the text from `store/APP_STORE_LISTING.md`; upload screenshots from `store/screenshots/` (iPhone 6.9″ and iPad 13″ are the required sets); reviewer notes; contact info.

## 5. Archive and upload
In Xcode: destination **Any iOS Device (arm64)** → *Product → Archive* → *Distribute App → App Store Connect → Upload*.
Command-line equivalent:
```bash
cd ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath ../../build/TinyTides.xcarchive archive
xcodebuild -exportArchive -archivePath ../../build/TinyTides.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath ../../build/export   # ExportOptions: method app-store-connect, your teamID
```
When processing finishes (≈10–30 min) the build appears under *TestFlight* and can be selected on the version page.

## 6. Device QA before you press Submit (TestFlight)
Run on at least one small iPhone, one large iPhone and one iPad if you can.
- [ ] Fresh install → tutorial completes (dig, rock, egg, hatch, bubble, level, evolve, reveal). No dead ends; "Skip tips" works.
- [ ] Force-quit and relaunch: pool, creatures, currencies, timers all restored. Leave for a few hours: **Welcome back** modal shows pearls/eggs/evolutions.
- [ ] Airplane mode: everything except purchases works.
- [ ] Capsule Machine: free daily pull, 1× and 10× with Coins, then Sea Glass (confirm dialog, exact cost 30/270, cap message after 20 pulls), reveal animations, Skip, Toybox, Prize Counter, Rates totals ≈100%, place a figure, tap the Beach Gachapon. Turn *Sea Glass capsule pulls* off in Settings and confirm the buttons refuse.
- [ ] Sandbox purchases (Settings → App Store → Sandbox Account): each consumable credits exactly once; Deep Ocean unlocks and its first egg hatches; Golden Hourglass shortens timers; bundles unlock decor; **Restore Purchases** on a second device/reinstall returns the non-consumables (and doesn't re-grant bonus glass).
- [ ] Interrupt a purchase (kill the app mid-sheet): the item still arrives on next launch, once.
- [ ] Reminders: Settings → Reminders asks for permission; finish an evolution timer with the app closed and confirm the notification arrives at a sane hour.
- [ ] Silent switch, headphones, incoming call: audio pauses/resumes sensibly; music off setting is respected.
- [ ] Rotate iPad; split-view/Slide Over; Dynamic Island/notch safe areas; Low Power Mode (turn on *Battery saver* if it stutters).
- [ ] Share/photo works and Cancel returns to the game.
- [ ] Settings → Privacy/Terms/Support links open your live pages.
- [ ] Change the device clock forward/back a day: no crash, no negative timers.

## 7. Submit
*Version page → Add for Review → Submit.* Typical review is 24–48 h. Release manually or automatically.
Reasons apps like this get rejected and how this build already handles them:
| Guideline | Risk | Status |
|---|---|---|
| 2.1 Completeness | crashes / placeholder content | Tested flows; no placeholders except the URLs you set in step 2 |
| 3.1.1 In-App Purchase | must offer Restore; no unlocking via other means | Restore is in Settings and Shop; all sales go through StoreKit |
| 4.2 Minimum functionality | "wrapped website" | Native shell **plus** native haptics, local notifications, StoreKit, share sheet, offline play — it is a game with depth |
| 5.1.1 Privacy | missing policy / label | Policy pages + "Data Not Collected" + privacy manifest |
| 3.1.1 Loot boxes | odds must be shown **before** purchase | Capsule Machine → Rates lists every item's %; linked from the Sea Glass shop tab and the machine screen; confirm dialog before each Sea Glass spend |
| Local gambling law | paid random items restricted in some countries (e.g. Belgium, Brazil) | `NO_PAID_RANDOM` in `src/config.js` disables Sea Glass pulls by storefront and device region (and until the region is known); see `legal/APP_STORE_ADMIN_CHECKLIST.md` §6, review with a lawyer and/or remove territories in App Store Connect |
| 1.3 / Kids | Made-for-Kids rules | **Do not** submit to the Kids Category (paid random items are not allowed there). The app collects no data, but the audience of paid gacha includes minors, so the guardrails (daily cap, off-switch, confirmation, free pulls) are on by default |

## 8. After launch
- Watch *App Store Connect → Analytics* (retention, proceeds) and *Crashes*.
- Ship the content in `docs/GAME_DESIGN.md → Roadmap` — new families and seasonal decor packs are cheap to add (they are just rows in `src/data.js` and a drawer function in `src/art_creatures.js`).
- If you add analytics/crash reporting/cloud save, **update the privacy label, `legal/templates/privacy.body.html` and `legal/DATA_MAP.md` first** (a test fails if a tracking SDK or network call appears in the app).

## Appendix — no Mac?
iOS apps can only be built with Xcode. Options: a cloud Mac (MacinCloud), **Xcode Cloud**, GitHub Actions `macos-latest` runners, or Codemagic — all can run steps 3 and 5 from this repo. You will need App Store Connect API keys / signing certificates as secrets.
