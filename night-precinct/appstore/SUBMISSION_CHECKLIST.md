# Submission checklist: from zero to the App Store

Work through the steps in order. Paths are relative to the `night-precinct/` folder unless they start with `appstore/`. Where something depends on Apple's current rules I say **Verify in App Store Connect**: Apple changes screenshot sizes, SDK requirements, price points, questionnaires and menu names often, and what I know may be out of date. ASC = App Store Connect (appstoreconnect.apple.com).

## What only you can do

No script, and no one who prepared this package, can do these for you:

- [ ] Enroll in the Apple Developer Program with your own identity, payment and legal details (step 1).
- [ ] Accept Apple's agreements and enter your tax and bank details (step 2). Apple will not let you sell without them.
- [ ] Decide the legal entity, company name, and the address and email you are willing to publish. Fill `release.config.json` (step 4).
- [ ] Buy a domain or web space and host the legal pages at the URLs you chose (step 6).
- [ ] Have an attorney review the legal texts (`legal/`, `release/legal/`) and the export, trademark and loot-box points, and the "Counsel" items in `COMPLIANCE_BY_COUNTRY.md`. Nothing here is legal advice.
- [ ] Decide the open storefront questions in `COMPLIANCE_BY_COUNTRY.md` (South Korea, Taiwan, Indonesia; Japan is decided: not listed) and the United States age-assurance item (step 15).
- [ ] Run a trademark and App Store name search for the app name and the item names (`EXPORT_COMPLIANCE_AND_RIGHTS.md` section 3).
- [ ] Create the app and every in-app purchase in ASC (steps 7 and 8).
- [ ] Build, sign and run the app in Xcode on a real device; fix compile errors (step 9). Apple's signing keys and your device are yours.
- [ ] Create sandbox testers and test every purchase against Apple's sandbox (step 10).
- [ ] Answer the age-rating, privacy, export and content-rights questions yourself, truthfully (step 16). You are the one making the declaration.
- [ ] Press Submit, answer App Review, and decide when to release.

## Before you start

- A Mac with the current Xcode. **Verify in App Store Connect** / Apple's "Upcoming Requirements" page: I believe App Store uploads must be built with the latest major Xcode and its SDK (from April 2026 that meant Xcode 26 with the iOS 26 SDK). The app's minimum iOS is 16.0 (`docs/FACTS.md`); that is separate from the SDK you build with.
- `xcodegen` installed (for example `brew install xcodegen`) and Python 3. Node.js with Playwright is needed only if you regenerate the screenshots or the icon (`node tools/make_assets.js`).
- An iPhone and, if possible, an iPad for testing. The app is universal (iPhone portrait only, iPad all orientations).
- A domain and web hosting for the legal pages.

---

## Step 1. Apple Developer Program

- [ ] Enroll at developer.apple.com/programs. The fee is about USD 99 per year. **Verify in App Store Connect** / Apple's site.
- [ ] Choose Individual or Organization.
  - Individual: your personal legal name is shown as the seller on the App Store.
  - Organization: the company name is shown. It needs a legal entity, a D-U-N-S number, a website and someone with authority to sign. It can take days or weeks to be approved.
  - If you do not want your personal name shown as the seller, use an Organization.
- [ ] Turn on two-factor authentication for the Apple Account.
- [ ] Note your **Team ID** (developer.apple.com/account > Membership details: 10 characters). It goes in `TEAM_ID`.

## Step 2. Agreements, tax and banking

- [ ] ASC > Business (called "Agreements, Tax, and Banking" in older versions; **verify the menu name**): accept the **Paid Applications Agreement**. It is required even though the app is free, because it sells in-app purchases and a subscription.
- [ ] Add a bank account and the tax forms Apple asks for (for example W-9 for a US entity, W-8 forms otherwise), and the required contacts.
- [ ] Wait until the agreement status shows Active. Until then, products cannot be sold and may not load in sandbox or TestFlight.
- [ ] EU Digital Services Act: enter your trader status and the contact details that will be shown on the product page in EU storefronts (address, phone, email). Apple may ask for proof (for example a business registration). Use a business address you are willing to publish. **Verify in App Store Connect.**

## Step 3. App ID and bundle ID

- [ ] developer.apple.com/account > Certificates, Identifiers & Profiles > Identifiers > + > App IDs > App.
- [ ] Bundle ID: **Explicit**, exactly the value you will put in `BUNDLE_ID` (reverse-DNS, lowercase, for example `com.yourcompany.nightprecinct`). It cannot be changed after the app is created in ASC.
- [ ] Capabilities: **In-App Purchase** on. I believe it is on by default for iOS App IDs. **Verify in App Store Connect** / the portal. Xcode's automatic signing can also create the App ID for you the first time you build (step 9).
- [ ] The bundle ID here, in `release.config.json`, in Xcode and in ASC must be identical.

## Step 4. Fill `release.config.json`

Edit each value. Nothing in the file is a real value yet.

| Token | What to put |
|---|---|
| `APP_NAME` | The final name, 30 characters or fewer, after the trademark and App Store search |
| `APP_SUBTITLE` | 30 characters or fewer (the default is exactly 30) |
| `BUNDLE_ID` | The explicit bundle ID from step 3 |
| `TEAM_ID` | Your 10-character Team ID |
| `COMPANY_NAME` | The legal name of the seller, as enrolled |
| `COMPANY_ADDRESS` | An address you are willing to publish; it appears in the legal pages and, for the EU, on the store page |
| `CONTACT_EMAIL`, `PRIVACY_EMAIL` | Mailboxes you read at your own domain, not a personal address |
| `WEBSITE_URL`, `SUPPORT_URL`, `PRIVACY_URL`, `TERMS_URL`, `PURCHASE_TERMS_URL`, `ODDS_URL`, `NOTICES_URL` | The real https URLs where you will host the pages (step 6). `apply_config.py` reports a problem for any of them that does not start with `https://`. The game opens `NOTICES_URL` from Credits > Full notices |
| `GOVERNING_LAW` | From your attorney |
| `EFFECTIVE_DATE` | The date the legal texts take effect (normally the release date) |
| `VERSION`, `BUILD` | `1.0.0` and `1` for the first upload. Increase `BUILD` for every new upload of the same version |
| `YEAR` | Not in `release.config.json` and not needed there. `tools/apply_config.py` and `tools/build.py` both supply it as the calendar year of the day you run them. `metadata/en-US/copyright.txt` uses it, so run the script in the year of release (or fix the copyright line by hand) |

- [ ] No `example.com`, `[YOUR ...]`, `XXXXXXXXXX` or `yourcompany` left. These are exactly the patterns `--strict` looks for in step 5. It does not check `EFFECTIVE_DATE`, so set that one yourself.
- [ ] Name and subtitle are 30 characters or fewer. Step 5 checks this for you (it prints a `PROBLEM:` line if not).

## Step 5. Run `python3 tools/apply_config.py --strict`

`tools/apply_config.py` is non-destructive. It never rewrites the templates in `legal/`, `appstore/` or `ios/*.tmpl`. It writes only git-ignored files, so you can run it as often as you like:

| Output | What it is |
|---|---|
| `release/legal/` | The filled-in legal pages (all nine files of `legal/`). Deleted and recreated on every run. |
| `release/appstore/` | A filled-in copy of this whole folder (text, `.md` documents and the screenshots). Deleted and recreated on every run. **The text for ASC is in `release/appstore/metadata/en-US/`.** |
| `ios/project.yml` | The XcodeGen spec (from `ios/project.yml.tmpl`). |
| `ios/NightPrecinct/Products.storekit` | The local StoreKit test catalog (from `Products.storekit.tmpl`). |
| `game/www/index.html` | The game built for the app (the script runs `tools/build.py --target native`; `--no-build` skips this). |

- [ ] Run `python3 tools/apply_config.py --strict`. It always renders everything first. Then it exits with status 1 while any config value is still a placeholder, or if it prints a `PROBLEM:` line (a text file over its length limit, a bad bundle ID or version, a URL that is not https, an unresolved token in the game). Fix what it lists and run it again until it prints "Config looks complete." and exits with 0.
- [ ] Do not edit anything inside `release/`. Edit the sources and run the script again.
- [ ] Search the output for leftovers: `grep -rn "{{" release/appstore/metadata/en-US/*.txt release/legal ios/project.yml ios/NightPrecinct/Products.storekit` must print nothing, and `grep -rn "\[YOUR\|example.com\|yourcompany\|XXXXXXXXXX" release/appstore/metadata/en-US/*.txt release/legal ios/project.yml` must print nothing. The rendered `.md` documents in `release/appstore/` may still mention a token name on purpose; the `.txt` files you paste into ASC must not.
- [ ] The length check is built in. `metadata/en-US/LIMITS.md` has the measured lengths and a second script if you want to see the numbers. `review_notes.txt` and `description.txt` must stay under 4000 characters after substitution.

## Step 6. Host the legal pages

- [ ] Have an attorney review the pages in `release/legal/` (privacy policy, terms of use, purchase terms, crate odds, support, notices).
- [ ] Upload the whole `release/legal/` folder (`index.html`, `terms.html`, `privacy.html`, `purchases.html`, `odds.html`, `support.html`, `notices.html` and `legal.css`; the pages link to each other and to the style sheet) so that the live URLs are exactly the values of `WEBSITE_URL`, `SUPPORT_URL`, `PRIVACY_URL`, `TERMS_URL`, `PURCHASE_TERMS_URL`, `ODDS_URL` and `NOTICES_URL`.
- [ ] Check every URL: opens over https, valid certificate, no login, no redirect loop, readable on a phone. For example `curl -sI <url>` returns `200`.
- [ ] Check the odds page matches `docs/FACTS.md` section 4 and the in-app "Drop rates" screen (Cases tab); both were checked against `game/src` and agree.
- [ ] Check the support page has a real way to contact you.
- [ ] Check the privacy page says what `docs/FACTS.md` section 2 says. Section 7 of `privacy.html` states that the app is not in the Kids category and is not directed to children under 13.
- [ ] Do not change these URLs after you submit.

## Step 7. Create the app record in ASC

- [ ] ASC > Apps > + > New App. Platform iOS. Name: the value of `APP_NAME`. Primary language: English (U.S.). The game, the listing and the legal pages are English only; do not add other App Store localizations until a translation exists (`docs/TRANSLATING.md`). Bundle ID: pick it from the list (it appears after step 3). SKU: any unique internal string, for example `nightprecinct-ios-001` (never shown to users, cannot be changed). User Access: Full Access.
- [ ] If the name is already taken, ASC tells you. Change `APP_NAME` (and re-run step 5), or choose another.
- [ ] Creating the record reserves the name for a limited time. **Verify in App Store Connect** how long.
- [ ] App Information: Subtitle from `metadata/en-US/subtitle.txt`; Categories from `metadata/en-US/categories.txt` (Games, subcategories Simulation and Strategy; **verify the choices in ASC**); Privacy Policy URL from `metadata/en-US/privacy_url.txt`.
- [ ] License Agreement (EULA): either keep Apple's standard EULA or enter your own. The description already links your Terms of Use. Ask your attorney which you want, and make the description and the in-app terms agree with it. **Verify in App Store Connect.**
- [ ] Content Rights: answer as in `EXPORT_COMPLIANCE_AND_RIGHTS.md` section 2 (No third-party content). **Verify in App Store Connect.**

## Step 8. Create the in-app purchases and the subscription group

- [ ] Follow `IAP.md`. Create the subscription group "Chief's Club" and `vip_weekly` first, then the 15 other products.
- [ ] For each product: Reference Name, Product ID (`{{BUNDLE_ID}}.<suffix>`, filled from your config; copy them from `release/appstore/IAP.md`), price, availability, English (U.S.) display name and description (within 30 and 45 characters; run the check at the end of `IAP.md`), Family Sharing off. Use the display names in `IAP.md`, not the ones in the local `Products.storekit` test file (those are for Xcode only).
- [ ] Prices: 4.79 and 9.59 for the auto-clickers if those price points exist, else the nearest. **Verify in App Store Connect.**
- [ ] The review screenshot for each product needs a running build, so upload those after step 10. Until then the products may show "Missing Metadata". That is expected now.
- [ ] Subscription group: level, one-week duration, group localization and the reviewer notes as in `IAP.md`.

## Step 9. Build the app

`ios/README.md` has the full build notes and a "First compile checklist" with the places most likely to need a small fix. From the `night-precinct/` folder:

- [ ] `python3 tools/apply_config.py --strict` (step 5). It has already written `ios/project.yml`, `ios/NightPrecinct/Products.storekit` and the game build `game/www/index.html`. (To rebuild only the game: `python3 tools/build.py --target native`.)
- [ ] The app icon is already in place at `ios/NightPrecinct/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png` (1024 x 1024, PNG, RGB, no alpha; the repository copy was checked). `node tools/make_assets.js icon` regenerates it and needs Pillow (`pip install pillow`) to strip the alpha channel; without Pillow it only warns. A missing or transparent icon fails validation at upload.
- [ ] `cd ios && xcodegen generate && open NightPrecinct.xcodeproj`. Repeat `apply_config.py` and `xcodegen generate` after any change to `release.config.json` or to a `.tmpl` file. `xcodegen generate` rewrites the project and the scheme, so changes made in Xcode's scheme editor are lost.
- [ ] If you ran the tests in `game/tests` or `node tools/make_assets.js shots` after step 5, run `python3 tools/apply_config.py` again before you build in Xcode. Those scripts leave a debug build (with test hooks) in `game/www/index.html`; `apply_config.py` replaces it with the release build.
- [ ] Target > Signing & Capabilities: select your Team (the `TEAM_ID` from the config is already written into the project; if it is still `XXXXXXXXXX`, Xcode complains), keep "Automatically manage signing" on, confirm the bundle ID. `ios/README.md` says no capability has to be added for StoreKit purchases, and the project has no entitlements file. Check that the App ID has In-App Purchase enabled (step 3). **Verify in App Store Connect** / the portal.
- [ ] Confirm version 1.0.0, build 1, deployment target iOS 16.0, iPhone and iPad, iPhone portrait only, iPad all orientations with full screen.
- [ ] In the project: `www` is a blue folder listed under Build Phases > Copy Bundle Resources, `PrivacyInfo.xcprivacy` and the asset catalog are there too, and `Products.storekit` is **not** in Copy Bundle Resources. In the archive's `Info.plist`, confirm `ITSAppUsesNonExemptEncryption` = NO (the source file already has it).
- [ ] Connect the device. On the device turn on Developer Mode (Settings > Privacy & Security > Developer Mode; **verify the path**) and, if asked, trust your developer certificate.
- [ ] Run on the device. **The Swift code has never been compiled** (`ios/README.md`: "Nobody has built it yet"). Expect a compile error or warning or two, and work through the "First compile checklist" in `ios/README.md` in the order it gives.

## Step 10. Test on device: StoreKit configuration first, then Apple's sandbox

### 10a. Local testing with the StoreKit configuration file

- [ ] The StoreKit test file is `ios/NightPrecinct/Products.storekit`, rendered from `Products.storekit.tmpl` in step 5, so its product IDs are your bundle ID plus the suffixes in `IAP.md` and its prices are the intended prices. The generated Run scheme already points at it (`project.yml.tmpl` sets it), so no manual scheme step is needed. Check once: Product > Scheme > Edit Scheme > Run > Options > StoreKit Configuration reads `Products.storekit`. If it says None, pick the file. If Xcode refuses to open the file, use the recreate steps in `ios/README.md`.
- [ ] Run on the device or the Simulator from Xcode. Use Xcode's Debug > StoreKit > Manage Transactions to refund, expire, or approve and decline pending purchases, and to delete a transaction so you can buy a non-consumable again.
- [ ] The StoreKit configuration also sets the App Store country the app sees (the file's default storefront is the United States). To test another country, open `Products.storekit` in Xcode and choose Editor > Default Storefront (**verify the menu in your Xcode**). `apply_config.py` rewrites the file on every run, so set it again after running the script.
- [ ] The subscription in the test file renews weekly in real time. To speed it up, open `Products.storekit` in Xcode and use Editor > Subscription Renewal Rate.
- [ ] Run the test matrix below.

### 10b. Apple sandbox

- [ ] ASC > Users and Access > Sandbox (**verify the menu name**): create a sandbox tester. Use an email address that is not already an Apple Account and that you control (an alias on your own domain works). Set the region to the United States.
- [ ] In the scheme, set StoreKit Configuration to None so the app talks to Apple's sandbox (or install from TestFlight in step 12, which never uses the local file).
- [ ] On the device sign in to the sandbox account (Settings > Developer > Sandbox Apple Account on recent iOS; **verify the path**; on older versions you are prompted at the first purchase).
- [ ] Products only load in the sandbox once they exist in ASC with complete metadata and the Paid Applications Agreement is active. **Verify in App Store Connect.** Until then the game's Store tab shows the price buttons as "..." and greyed out; that is the designed unavailable state.
- [ ] Run the test matrix again.
- [ ] Capture the review screenshots for every product (see `IAP.md`) and upload them in ASC.

### Test matrix (do all of it, both with the StoreKit file and in the sandbox)

**Purchases**
- [ ] Buy each of the 16 products once. The goods arrive exactly once, the price shown is the real StoreKit price, and the goods match `docs/FACTS.md` section 3.
- [ ] Buy a consumable twice. Both grants arrive. Quit and relaunch: no extra grant.
- [ ] Cancel at the payment sheet. Nothing is granted and the game stays responsive.
- [ ] Pending purchase (Ask to Buy): the game shows a pending state, grants nothing until approved, and grants once after approval. Also decline once. (In the StoreKit file test this in Manage Transactions; in the sandbox use a Family-based tester if you have one. **Verify in App Store Connect / Xcode.**)
- [ ] Interrupted purchase: force-quit the app right after paying, before the goods show. On relaunch the game recovers the transaction (`unfinished`) and grants once.
- [ ] First-purchase bonus: the +bonus applies on the first purchase of each pack only, and a second purchase of the same pack gives no extra bonus.
- [ ] Starter Pack: shows in the Store tab on a fresh install (with a countdown, a "STARTER DEAL" chip above the scene and a dot on the Store tab), only within 48 hours of first launch, buys once, and is gone afterward.
- [ ] Daily Deals: all three (Crate Trio, Cash Crate, Recruit Rush) are listed in the Store tab every day, with no need to change any date. Buy each one: it then reads "Bought today" and cannot be bought again until the next calendar day on the device (the game uses the device date). The Crate Trio purchase sheet shows the Elite crate odds before you buy.
- [ ] Offers with crates: the purchase sheets of the Rookie Starter Pack (3 Standard crates, Standard odds) and Career Pass Premium (Elite and Legend odds) print the odds before you buy, under "Crates hold random rewards. The odds:".
- [ ] Crate purchase with Gold Badges (Cases tab, x1 and x5 under each crate): every tap opens the "Buy crates" confirmation with the crate name and number, the price in Gold Badges, "about <money value>", the odds of that tier (and the pity line for Elite and Legend), "Buy for N Gold Badges" and Cancel. Cancel takes nothing. Buy takes the Gold Badges once and adds the crates. With too few Gold Badges, nothing is taken and "Not enough Gold Badges" shows. Prices: 30 / 120 / 300, and 135 / 540 / 1,350 for five.
- [ ] Money values: after prices have loaded, the Store's Gold Badge items, the Elite Recruits and the cosmetics, and the crates in the Cases tab show "about <price>" in the StoreKit currency, at the smallest pack's price per Gold Badge (for example with 80 Gold Badges at USD 0.99, a Legend crate at 300 Gold Badges reads "about $3.71"). In Airplane Mode before prices load, the values are simply absent.
- [ ] Evidence Safe: the card shows "Holds N Gold Badges (20 to 500)" and the purchase sheet is titled "Evidence Safe: N Gold Badges"; on a new save N is 20 and can be bought at once. The grant matches N, and the safe starts filling again afterwards.
- [ ] Auto-Clicker family: on a new save the Auto-Clickers card offers both the Auto-Clicker and the Combo Auto-Clicker. Buy `auto_basic` (8 taps per second at 1.5x, every world, the On/Off card and the AUTO chip work); the card then becomes an "Upgrade" card; buy `auto_upgrade` (combo builds to x3.0). On a fresh install (or after deleting the transaction in Manage Transactions) buy `auto_combo` directly.
- [ ] Career Pass Premium: the Store card disappears and the premium track in the Career tab unlocks (30 tiers, tiers already reached become claimable). The Career tab's Go Premium button shows the StoreKit price and opens the same purchase sheet.
- [ ] Precinct Patron: spending moves the lifetime counter shown on the Career tab and the permanent bonus at the thresholds (4.99 / 19.99 / 49.99 / 99.99 / 249.99). Chief's Club counts once, not for weekly renewals.
- [ ] Price loading: launch in Airplane Mode (price buttons read "..."), then turn the network on and switch back to the app, or open a purchase sheet: prices appear without a relaunch, and an open purchase sheet fills in its price.
- [ ] Purchase in progress: tap Buy on any sheet and, while Apple's payment sheet is up, try to close the game's sheet (the close and Cancel buttons are hidden, tapping outside does nothing) and try to open another sheet ("A purchase is already in progress"). After Apple's sheet closes, only the purchase sheet closes.

**Restore**
- [ ] Restore Purchases (Settings, the Store tab footer or the Career tab) on a second install (delete the app and reinstall, or a second device). Non-consumables and the subscription come back and the game says "Purchases restored" (or "Nothing new to restore"); consumables do not come back, as the Store footer, the Purchase Terms and the Support page say.
- [ ] Restore while offline fails gracefully: no crash and the message "Could not reach the App Store. Try again later."

**Subscription (Chief's Club)**
- [ ] Purchase: all benefits apply (income x1.5, offline earnings 100% with a cap of at least 8 hours, +1 job slot, bounties auto-collect). The 25 Gold Badges per day are claimed with the Claim button on the Chief's Club card in the Store tab, once per calendar day.
- [ ] Renewal: in the sandbox, time is accelerated (I believe one week renews about every 3 minutes, and only a limited number of times; **verify in App Store Connect**). Let it renew and check the benefits persist, a "Chief's Club renewed" message appears, the Precinct Patron total is not raised again and the daily badges can still only be claimed once a day.
- [ ] Expiry: cancel in the sandbox (Settings > Apple Account > Subscriptions), let it expire, and check the benefits stop and the game returns to normal.
- [ ] Refund or revoke (Xcode Manage Transactions). One-time unlocks (the Auto-Clicker levels and Career Pass Premium): the game removes the unlock as soon as the revoked transaction arrives and shows "A purchase was refunded, so its unlock was removed". A Gold Badge pack (also the Evidence Safe, a Daily Deal, the Starter Pack): the Gold Badges it gave are removed as far as they are unspent (buy a pack, spend part of it, refund it: the balance drops by the pack's amount but not below zero), "A purchase was refunded, so its Gold Badges were removed" shows, and the Precinct Patron total on the Career tab drops by the product's value. Crates, cash and units already delivered stay. The Chief's Club benefits stop the next time the game checks Apple's entitlements, which happens at launch, when offline earnings are worked out and on Restore Purchases.
- [ ] Manage Subscription (Settings, the Store tab footer, or the Manage button on an active Chief's Club card) opens Apple's subscription screen.
- [ ] The Chief's Club purchase sheet shows the title, the price with "per week", what is included, the renewal and cancellation wording, and links to Terms of Use, Privacy Policy and Purchase Terms. Restore Purchases and Manage Subscription are not on the sheet; they are in the Store tab footer (visible on the same tab) and in Settings. Compare with `IAP.md`.
- [ ] Airplane Mode: an active subscription keeps its benefits offline.
- [ ] Renewal while away: with Chief's Club active, leave the app in the background past a renewal (sandbox), come back: the off-duty earnings screen says "Offline rate 100% (Chief's Club)" and uses the 8 hour minimum cap.
- [ ] Lapsed slot: start a job in the third slot while Chief's Club is active, let the subscription expire: the job stays on the Cases tab and can be collected when done; no new job can be started in that slot.

**Conditions**
- [ ] Airplane Mode: fresh launch, full play, offline earnings after time passes, and the Store tab shows a calm unavailable state: greyed-out price buttons that read "..." and no hard-coded prices.
- [ ] Low storage: with the device almost full, launching, playing and saving do not crash. If the file write fails, the native shell answers `save failed` and the game carries on without showing a message (the copy in the web view's local storage is still written). The shell reads no disk-space API, so no required-reason declaration is expected (`APP_PRIVACY.md`); **verify in App Store Connect** when the upload check runs.
- [ ] Backgrounding: during a purchase sheet, during a timed job, and with the app suspended for hours and days; progress and offline earnings are right when you come back.
- [ ] Clock and time zone: claim the Daily Roll Call, then change the time zone east and west (Settings > General > Date & Time) and move the clock back an hour: the streak is not reported broken, and Rally Boost, Supply Drop, Double Time and running jobs keep sensible timers (no cooldown locked for hours).
- [ ] Promotion with finished jobs: let a job finish without collecting it, then promote: the job's reward is paid, and a job still running keeps running.
- [ ] Force-quit and relaunch: progress is intact (`save.json` mirroring).
- [ ] Backup and restore of the device: progress comes back with a normal iOS backup.
- [ ] Belgian device region (safety net): set the device region to Belgium (Settings > General > Language & Region) and relaunch. The x1 and x5 crate buttons are gone from the Cases tab, the Crate Trio is not in the Daily Deals, the Starter Pack reads 390 Gold Badges and no crates, and the Career Pass Premium card and sheet read "Gold Badges on every fifth tier and 400 at tier 30" with no odds. Free crates (Supply Drop, jobs, bounties, Daily Roll Call) still arrive and open. Repeat with Brazil.
- [ ] Belgian App Store country (safety net): with the device region set back to the United States, set the StoreKit configuration's storefront to Belgium (step 10a: open `Products.storekit`, Editor > Default Storefront) and run from Xcode. The same things switch off as with the Belgian region. Switch the storefront back to the United States and bring the app back to the foreground (or run it again from Xcode if the change does not reach the running app): crate buying returns. (In the sandbox or TestFlight the storefront is the tester account's country.)
- [ ] Odds: the "Drop rates" screen (Cases tab, and "Crate odds" in Settings, which opens the same in-app screen) shows the odds for all three crate tiers, and the "Crate odds" link in the Store footer opens the odds web page. Both match `docs/FACTS.md` section 4.
- [ ] Layout: iPhone portrait with the smallest and largest screens you can test, iPad in all orientations, safe areas and the Dynamic Island, Reduce Motion, sound off in Settings, haptics.
- [ ] First launch on a fresh install: the tutorial walks through tap, first hire, the away-earnings note and the first Gear-Up upgrade; "Skip tutorial" ends it; it does not come back after a relaunch.
- [ ] Audio: music starts after the first tap and fades between worlds; the Music and Sound effects switches work on their own; the silent switch mutes the game; with a podcast or music app playing, the game does not start its own music; music stops in the background and comes back on return.
- [ ] Street view: the enlarge button in the scene corner (phones only) makes the street bigger and back; the choice survives a relaunch.
- [ ] Oldest supported iOS (16.0) on a real device or simulator, and the latest iOS.
- [ ] Network check: with a proxy or Xcode's network tools, or Settings > Privacy & Security > App Privacy Report on the device, confirm the app makes no network requests other than StoreKit and the legal pages.
- [ ] Legal links (Terms, Privacy, Purchase Terms, Odds, Support) open in the Safari view and load.
- [ ] Read `release/appstore/metadata/en-US/review_notes.txt` next to the real app. Every place, name and button it mentions was checked against the game source and must exist as written: the bottom tab bar (HQ, Roster, Gear-Up, Cases, Store, Career), the Gold Badge counter that opens the Store, the "Settings and Legal" card on HQ, Restore Purchases and Manage Subscription (Settings and the Store footer), the legal links, the "Drop rates" button, and the Claim button on the Chief's Club card. If you edit the notes, keep them under 4000 characters after substitution (re-run step 5).

## Step 11. Archive and upload

- [ ] In Xcode choose "Any iOS Device (arm64)" and Product > Archive.
- [ ] Organizer > select the archive > Distribute App > App Store Connect > Upload. Keep automatic signing.
- [ ] Wait for the processing email. Read any warning emails (for example about privacy manifest or missing declarations).
- [ ] If the upload is refused because of the SDK or Xcode version, install the required Xcode. **Verify in App Store Connect.**
- [ ] If ASC asks the export-compliance question, answer as in `EXPORT_COMPLIANCE_AND_RIGHTS.md`.

## Step 12. TestFlight internal testing

- [ ] ASC > your app > TestFlight. Add yourself and other team members as internal testers (they need an ASC user role).
- [ ] Install from TestFlight (not from Xcode) on a real device and run the full test matrix once more. TestFlight purchases use the sandbox and are not charged.
- [ ] External testers are optional and need Beta App Review. Not required for release.

## Step 13. Screenshots

The screenshots in `appstore/screenshots/` are generated from the game itself by `node tools/make_assets.js shots` (run from `night-precinct/`; it needs Node, Playwright with Chromium, and builds the game with its test hooks to get a believable mid-game state). Each set is at an exact App Store pixel size and has six PNGs, RGB with no alpha: `iphone-6.9` (1320 x 2868), `iphone-6.5` (1284 x 2778) and `ipad-13` (2064 x 2752), named `01-hq` (police, HQ tab, enlarged street view), `02-roster` (police, Roster tab), `03-upgrades` (police, Gear-Up tab), `04-ops` (police, Cases tab with crates), `05-fire` (fire world, HQ tab, enlarged street view) and `06-ems` (EMS world, Roster tab). Each has a two-line caption above the game screen: "Tap. Arrest. Get paid.", "Hire a whole police force", "Gear up for bigger busts", "Run cases for badges & crates", "Then take on the fire station", "And race the clock in EMS". Captions and overlays are allowed as long as the screen below is the real app in use (Guideline 2.3; verify). `node tools/make_assets.js shots --raw` writes plain full-screen captures instead. The filled-in copy in `release/appstore/screenshots/` is identical. You can replace them with real captures from the iOS Simulator (Xcode: Device > Screenshot) if you prefer; a real capture is the safer match for reviewer expectations.

None of them shows the Store tab, so the in-app purchase review screenshots (`IAP.md`) must be captured separately. Upload the store screenshots on the version page in ASC. Apple currently accepts a smaller set of screenshot sizes than the three sets provided: I believe ASC asks only for the largest iPhone size and, because the app runs on iPad, the 13-inch iPad size, and scales them for smaller displays. **Verify the required sizes in App Store Connect** before you upload, and upload only the sets it asks for. The sizes as I know them (Apple changes these with each new device):

| Device class | Accepted pixel sizes (portrait) | Required? | Provided here |
|---|---|---|---|
| iPhone 6.9-inch | 1320 x 2868, 1290 x 2796, 1260 x 2736 | Yes, I believe | `iphone-6.9` |
| iPhone 6.5-inch | 1284 x 2778, 1242 x 2688 | Probably not needed if you provide 6.9-inch, I believe | `iphone-6.5` |
| iPad 13-inch | 2064 x 2752, 2048 x 2732 | Yes, because the app runs on iPad | `ipad-13` |
| iPad 11-inch | 1668 x 2420, 1668 x 2388, 1640 x 2360 | Optional; Apple scales from the larger set, I believe | none |

- 1 to 10 screenshots per size. PNG or JPEG, no transparency.
- The iPhone app is portrait only, so iPhone screenshots are portrait. iPad screenshots can be portrait or landscape (all orientations are supported); the generated ones are portrait.
- The in-game cash amounts use a "$" sign (for example $8.41B). That is game currency, but a reviewer or player may read it as a price. Consider whether that matters to you.
- The generated screenshots show no prices and no transient banners. If you capture new ones (for example from the Simulator), keep prices out of the frame.
- The EMS screenshot (`06-ems`) shows a heartbeat (ECG pulse) mark on the ambulances and pulse marks in the portraits. No red cross, red crescent or Star of Life is used.
- Show the real game in use. No real agency logos, no other apps' names, no prices in the image, and nothing that would not suit a low age rating (Guideline 2.3.x; verify).
- App previews (short videos) are optional. Any App Preview, trailer or ad must show "In-game purchases (includes random items)" on screen (UK ASA enforcement notice on loot boxes; see `COMPLIANCE_BY_COUNTRY.md`).
- Do not show anything the game does not do, and do not show a screen that no longer matches the build. If you change the game, regenerate the screenshots with `node tools/make_assets.js shots` and then run `python3 tools/apply_config.py` again (see step 9).

## Step 14. Version information and App Review information

- [ ] ASC > your app > iOS App > 1.0 Prepare for Submission. Paste from `release/appstore/metadata/en-US/` (the filled-in text written by step 5, not the tokenized sources in `appstore/metadata/en-US/`): Promotional Text, Description, Keywords, Support URL, Marketing URL (optional), Copyright, What's New (`release_notes.txt`).
- [ ] Select the processed build.
- [ ] App Review Information: sign-in required OFF (no demo account); contact first name, last name, phone number and email `{{CONTACT_EMAIL}}` (these are for Apple only and are not shown in the store; ASC requires a phone number and a person's name, which you type in yourself); Notes: paste `release/appstore/metadata/en-US/review_notes.txt` (after step 5 and after you have checked it against the real app, step 10).
- [ ] Optional attachment: a 30 to 60 second screen recording of a purchase, Restore Purchases and Airplane Mode play.
- [ ] Version release: choose **Manually release this version** for 1.0 so you can choose the day.

## Step 15. Price and availability

- [ ] App price: Free (all revenue is from in-app purchases). **Verify in App Store Connect.**
- [ ] Availability: all countries and regions except these, which the app is **not** offered in (reasons and sources: `COMPLIANCE_BY_COUNTRY.md`):
  - **Belgium**: paid loot boxes are banned (Gaming Act).
  - **Brazil**: paid loot boxes are banned in games likely accessed by minors (Law 15.211/2025, ECA Digital).
  - **Mainland China**: games need an NPPA licence (ISBN).
  - **Vietnam**: games need a publishing licence through a local entity.
  - **Russia**: Apple payments are unavailable there.
  - The game keeps a safety net: if the App Store country or the device region is Belgium or Brazil, paid random items switch off.
- [ ] **Turn off automatic availability in new countries and regions**, so every new storefront is your decision. **Verify in App Store Connect** where the switch is.
- [ ] Owner decisions before you tick these storefronts (`COMPLIANCE_BY_COUNTRY.md`):
  - **South Korea** and **Taiwan**: they expect odds disclosures in Korean and Traditional Chinese; the game is English only. Recommended: exclude until local-language odds texts exist, or get counsel's OK.
  - **Indonesia**: a mandatory game rating (IGRS). Register and get one, or exclude.
  - **Japan**: not listed (owner decision, 1 Oct 2026); untick it with the countries above.
  - **United States**: the Texas age-assurance APIs are not implemented (Apple enforces the Texas law for new Texas accounts from 4 June 2026; Alabama and California follow on 1 January 2027, Utah on 6 May 2027, Louisiana on 1 July 2027). Before selling in the US, ship the age-assurance update or get counsel's view.
- [ ] Confirm the in-app purchase prices (step 8) and that the description's "4.99 USD per week" matches the price you set.

## Step 16. Age rating, privacy, and other declarations

- [ ] Age Rating: answer as in `AGE_RATING.md` (**verify wording**), with Loot Boxes = **Yes**. Expect 9+ worldwide and 16+ in Australia. Accept the rating Apple calculates.
- [ ] Not Made for Kids; no Kids category.
- [ ] App Privacy: **Data Not Collected**, as in `APP_PRIVACY.md`. Publish it.
- [ ] Privacy Policy URL: `{{PRIVACY_URL}}`.
- [ ] Advertising Identifier (IDFA): No, when ASC asks at submission.
- [ ] Export compliance: `ITSAppUsesNonExemptEncryption` = NO (`EXPORT_COMPLIANCE_AND_RIGHTS.md`).
- [ ] Content rights: no third-party content.

## Step 17. Attach the in-app purchases and run the gate

On the version page, in the "In-App Purchases and Subscriptions" section, attach all 16 products (the first time, they go to review together with the app version; **verify in App Store Connect**). Then confirm:

- [ ] Every product shows Ready to Submit and has a review screenshot.
- [ ] The subscription group has its localization and the product is in it.
- [ ] Every URL from step 6 works. The legal pages are final.
- [ ] No `{{` or placeholder text in anything you pasted.
- [ ] `review_notes.txt` matches the real app (step 10) and is under 4000 characters after substitution.
- [ ] The reviewer can reach every product (`IAP.md`, "Reachability").
- [ ] The Chief's Club purchase sheet shows the required terms and links (`IAP.md`).
- [ ] Odds are shown before every purchase that includes crates: the crate confirmation sheet, and the Crate Trio, Starter Pack and Career Pass Premium purchase sheets (test matrix, step 10).
- [ ] The description (en-US) starts with "Contains loot boxes: in-game purchases include random items (crates). Odds are shown in the game before you buy."
- [ ] The description claims match the build (`README.md` has the list).
- [ ] The build you selected is the one you tested in TestFlight.

## Step 18. Submit for review

- [ ] Add for Review, then Submit to App Review. (ASC now groups items into a "review submission"; **verify the current button names**.)
- [ ] Watch the status: Waiting for Review, In Review, then Pending Developer Release, or Rejected or Metadata Rejected. Reviews usually take from a few hours to a few days. **Verify in App Store Connect.**
- [ ] If rejected: read the message in Resolution Center, answer politely with facts from `GUIDELINE_COMPLIANCE.md`, and fix what is asked. If it needs a new build, raise `BUILD` in `release.config.json`, re-run `python3 tools/apply_config.py`, run `cd ios && xcodegen generate`, then archive and upload again. A metadata-only problem can be fixed without a new build.

## Step 19. After approval

- [ ] Release the version when you are ready (manual release).
- [ ] Phased release rolls an update out to automatic-update users over seven days. I believe it applies to updates, not to a first release, so use it from 1.0.1 on. **Verify in App Store Connect.**
- [ ] Watch for the first day: crashes (Xcode Organizer > Crashes), ratings and reviews (ASC > Ratings and Reviews; answer them), App Analytics, Sales and Trends, and your support mailbox `{{CONTACT_EMAIL}}`.
- [ ] Check that the legal and odds pages stay online. If the pages go down, the app can be rejected or pulled.
- [ ] Plan updates: bug fixes (1.0.1), balance changes, new content. For every change to the odds, update the odds page, the in-app odds, the description and `docs/FACTS.md` together, and never change odds silently.
- [ ] New in-app purchases go with a new app version. A new Career Pass season needs a new product ID.
- [ ] If you ever add an SDK or a network call, redo `APP_PRIVACY.md`, `PrivacyInfo.xcprivacy` and the privacy policy before that update ships.
- [ ] If you change the subscription price, existing subscribers may need to consent to the increase. **Verify in App Store Connect.**

---

## Known limitations of this package

- **The Swift code has never been compiled.** `ios/README.md` says "Nobody has built it yet". Expect compile errors and warnings when you first open the project in Xcode, and use the "First compile checklist" in `ios/README.md`.
- **StoreKit was not tested against Apple's sandbox or TestFlight.** The purchase, restore, subscription and pending logic on the game side is exercised only against a mock of the bridge (`game/tests/native-mock.js`); the Swift side is not exercised at all. The test matrix in step 10 exists because of this.
- **The legal texts need attorney review.** They are templates. Nothing in `appstore/` is legal advice.
- **The game, `tools/*.py` and the `ios/` project were read and cross-checked when this folder was brought up to date.** Names of screens and buttons, the behavior of `tools/apply_config.py` and the name of the StoreKit test file (`Products.storekit`) are verified, and the Store tab, the Career tab, the Settings screen and the purchase sheets were looked at in a desktop browser with a mock bridge. They have not been seen on an iOS device. If the game text changes, check `metadata/en-US/review_notes.txt` and `IAP.md` again (step 10).
- **Apple's rules are from my knowledge and may be out of date**: age-rating wording, screenshot sizes, SDK requirement, price points, guideline numbers, ASC menu names and limits. Each is marked "Verify in App Store Connect" or "verify the exact guideline number".
- **No trademark, export or loot-box legal search was done.** The name is a working title. The EMS art uses no protected medical emblem, but a lawyer should still look at the name and at the crate rules of the regions where you sell.
- **Screenshots are generated, not captured.** `tools/make_assets.js` renders them from the web build. None shows the Store tab (step 13).
- **Some differences between these documents and the build are listed, not fixed.** See "Open points in the build" in `README.md`.
