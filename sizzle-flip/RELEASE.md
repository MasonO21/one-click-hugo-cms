# Releasing Sizzle Flip

Everything in the code is release-ready. What is left needs **your** accounts, keys and contact details, which cannot be committed to a repository. `npm run release:check` lists exactly what is still missing and passes once it is done.

## 1. Fill in your details (15 minutes)

| What | Where |
|---|---|
| AdMob ad unit ids (Interstitial + Rewarded, Android and iOS) | `src/ads-config.js` → `ADMOB_UNITS` |
| AdMob **app** id for Android | `android/app/src/main/res/values/strings.xml` → `admob_app_id` |
| Contact email for the privacy policy | `src/privacy.js` → `PRIVACY_CONTACT` |
| If the game is aimed at children under 13 | `src/ads-config.js` → `childDirected: true` (and Play's Families policy applies) |

**Shop (in-app purchases).** Players buy **Hot Dogs**, the in-game currency, and spend them on characters (🌭100 each) and bundles. The store products are the six Hot Dog packs, all **consumable**:

| Product id | Hot Dogs | US price |
|---|---|---|
| `hotdogs_100` | 100 | $0.99 |
| `hotdogs_500` | 500 | $4.99 |
| `hotdogs_1000` | 1,000 | $9.99 |
| `hotdogs_2500` | 2,500 | $24.99 |
| `hotdogs_5000` | 5,000 | $49.99 |
| `hotdogs_10000` | 10,000 | $99.99 |

They are defined in `src/shop-config.js` (with the character price and the 20% bundle discount) and listed in `store/iap-products.csv`. `tools/create-store-products.mjs` creates them in both stores for you (sections 3 and 4). The game shows each store's localized price.

Test mode (test ads plus the **Settings → Ad testing** panel) switches off by itself once no Google test id is left.

## 2. Host two small files

1. **Privacy policy.** `npm run build` writes `dist/privacy.html`. Host it anywhere public, for example GitHub Pages or Netlify, then use its URL in both store listings. The same text is in the app under **Options → Privacy policy**.
2. **app-ads.txt.** On your developer website (the one you enter in the store listing), serve `https://<your-site>/app-ads.txt` containing the line AdMob shows you, which looks like:
   `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`
3. In AdMob → **Privacy & messaging**, create a **GDPR consent message** and a **US states message**, and publish them. The app already shows them at launch and offers **Options → Privacy choices** where required.

## 3. Android (Google Play)

Requirements: JDK 21 and Android Studio (or the command-line SDK). The project targets **Android 16 (API 36)**, which Play requires for new apps since 31 Aug 2026.

```bash
npm ci
npm run cap:sync            # build the web game and copy it into android/
npm run release:check       # must print "Ready to build a release."
```

**Signing (one time).** Create an upload key and keep it safe, outside the repo:

```bash
keytool -genkeypair -v -keystore ~/sizzle-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Then create `android/keystore.properties` (it is git-ignored):

```
storeFile=/Users/you/sizzle-upload.jks
storePassword=…
keyAlias=upload
keyPassword=…
```

**Shop products in Google Play.**
1. Set up a payments profile (Play Console → Setup → Payments profile).
2. Upload a first build to a testing track (internal testing is enough). Play only accepts products for an app that uses billing; the billing permission is already included through the purchases plugin.
3. Create the six Hot Dog packs with the script:
   - In Google Cloud (any project): enable the **Google Play Android Developer API**, create a **service account** and download a **JSON key** for it.
   - In Play Console → **Users and permissions**: invite the service account's email address and give it **Manage store presence** for Sizzle Flip.
   - Run:
     ```bash
     PLAY_SERVICE_ACCOUNT=~/keys/play-service-account.json node tools/create-store-products.mjs --play
     ```
     Each pack is created with its US price, Play converts it for every other country, and the pack is activated. It's safe to run again (after changing a price in `src/shop-config.js`, for example).
   - Or by hand: **Monetize with Play → Products → One-time products**, one product per row of `store/iap-products.csv` (same id, title and description, the US price with "convert" for other countries), then **Activate**.
4. To make free test purchases, add your Google account under **Setup → License testing**.

**Build the bundle:** run `cd android && ./gradlew bundleRelease`. The output is `android/app/build/outputs/bundle/release/app-release.aab`. Enrol in **Play App Signing** when you upload it.

**For every later update,** raise `versionCode` (and `versionName`) in `android/app/build.gradle`.

**Play Console answers:**

- **App category:** Game → Casual.
- **Contains ads:** Yes.
- **In-app purchases:** Yes: Hot Dogs, an in-game currency for optional cosmetic characters. Payment data is handled by Google Play, so nothing extra goes in Data safety (purchase history stays on the device). In the IARC questionnaire, answer "yes" to digital purchases.
- **Advertising ID:** Yes, used for Advertising or marketing. The permission is already in the manifest.
- **Data safety:**
  - Data is collected and shared by the AdMob SDK:
    - Device or other IDs: collected and shared, for advertising and analytics.
    - Approximate location (from the IP address): collected and shared, for advertising.
    - App interactions: collected and shared, for advertising and analytics.
    - Crash logs and diagnostics: collected, for analytics.
  - Data is encrypted in transit: Yes.
  - Users can't request deletion of data held by Google (it is tied to the resettable advertising ID). Game progress never leaves the device.
- **Target audience:** 13+ recommended (otherwise set `childDirected: true`, see section 1).
- **Content rating (IARC):** cartoon slapstick with no violence, gambling or user content; digital purchases: yes. Expect Everyone / PEGI 3, with an "In-app purchases" notice.
- **Store listing:** use the text in `store/listing.md`, the screenshots in `store/play/` (1080×1920), the icon `icons/play-icon-512.png` and the feature graphic `icons/feature-1024x500.png`.
- **Closed testing first:** a new *personal* developer account must run a closed test with at least 12 testers for 14 days before production access is granted.

## 4. iOS (App Store) — needs a Mac with Xcode

```bash
npm run cap:sync
npx cap add ios && npx cap sync ios && npx cap open ios
```

**In `ios/App/App/Info.plist`, add:**

- `GADApplicationIdentifier`: your iOS AdMob app id.
- `NSUserTrackingUsageDescription`: "Your data will be used to show you more relevant ads."
- `SKAdNetworkItems`: Google's list from the AdMob iOS quick-start.

Don't add `SKIncludeConsumableInAppPurchaseHistory`: it would make every finished Hot Dog purchase come back after a reinstall.

The purchases plugin is patched (`patches/@capgo+native-purchases+8.8.1.patch`, applied by `npm ci` / `npm install` through `postinstall`) so that it leaves each purchase unfinished until the game has credited it. `npm run release:check` verifies the patch is in place.

**Then:**

1. Set the bundle id `com.sizzleflip.game`, your team, the version and the build number, and add the **In-App Purchase** capability (Signing & Capabilities).
2. Choose **Product → Archive**, then upload it to App Store Connect.

**App Store Connect:**

- **Shop products:**
  1. Sign the **Paid Apps** agreement and add your banking and tax details (Business section).
  2. Create the app in App Store Connect (bundle id `com.sizzleflip.game`) if it doesn't exist yet.
  3. Create an API key: **Users and Access → Integrations → App Store Connect API**, role **App Manager**. Note the key id and the issuer id, and download the `AuthKey_….p8` file (only possible once).
  4. Create the six packs:
     ```bash
     ASC_KEY_ID=ABC123DEFG ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx ASC_KEY_FILE=~/keys/AuthKey_ABC123DEFG.p8 \
       node tools/create-store-products.mjs --apple
     ```
     Each pack is created as a **Consumable** with its English name and description, the US price (Apple sets the other countries from it), availability in every country and the review screenshot (`store/iap-review.jpg`, the Get Hot Dogs window). It ends in *Ready to Submit*. Safe to run again.
     Or by hand: **Monetization → In-App Purchases → +**, type **Consumable**, one per row of `store/iap-products.csv`, with `store/iap-review.jpg` as the review screenshot.
  5. New in-app purchases are reviewed with an app version: on the version page, under **In-App Purchases and Subscriptions**, select the six packs before you submit.
  6. For testing, use Sandbox testers (Users and Access → Sandbox).

- **Icon:** `icons/ios-icon-1024.png` (opaque).
- **Screenshots:** `store/ios/` (1290×2796).
- **iPad:** either add iPad screenshots (2064×2752) or limit the app to iPhone in Xcode.
- **App Privacy:**
  - Identifiers: Device ID, used for third-party advertising, and *used to track* if the player allows tracking.
  - Usage data: product interaction, for advertising and analytics.
  - Diagnostics: for analytics.
- **Privacy policy URL:** the hosted `privacy.html`.

## 5. Final check before you press publish

- [ ] `npm run release:check` passes.
- [ ] The latest run of the GitHub workflow **Sizzle Flip devices** (Actions tab) is green: the app built and passed its self-test on Android 13, Android 16 and the iPhone Simulator. Its screenshots are under the run's Artifacts. (Rebuild with `npm run cap:sync` afterwards if you ever made a `--smoke` build locally.)
- [ ] Install the release build on a real phone:
  - The consent form appears (use a VPN to an EU country, or AdMob's test-device geography setting).
  - After level 5 and 5 minutes of play, a forced ad appears on NEXT.
  - With a license tester (Android) or a Sandbox tester (iOS): buy a pack, check the Hot Dogs arrive once, buy a character and a bundle with them, and buy the same pack a second time (it must be allowed: that shows it was consumed).
  - Force-quit the app right after paying for a pack, reopen it: the Hot Dogs arrive at launch, once.
  - Hints, skip and the long aim guide show reward ads.
  - Back works on every screen.
- [ ] Test ads are gone (real ads may take a few hours to start serving after the app is linked in AdMob).

## What has been verified for this release

- **All 200 levels played through the real game** in a browser, using the game's own touch handlers and real UI (NEXT, world-complete cards, forced ads), with no errors: `tools/e2e-all.mjs`.
- **Every stored route** replays and wins under the game's launch rule (only from rest), and holds up under human-sized error: `tools/qa.mjs`.
- **Shop:**
  - All 130 characters are drawn over the sausage's own physics body, so the hitbox, mass and bounce are identical. All 200 levels were played through the real game with a different character on each level, cycling through all 130: `tools/e2e-all.mjs --items`.
  - Hot Dogs, the six packs, characters at 🌭100, every tab's bundle and the Everything Bundle priced in proportion to what they unlock (including partly owned tabs), the "not enough Hot Dogs" flow, equipping, the Locker, reloads, "Reset progress" (which keeps Hot Dogs and characters) and the test store are covered by `tools/e2e-shop.mjs` (56 checks).
  - Store billing with Google Play and StoreKit behaviour mocked: localized prices, purchases credited once and only then consumed or finished, a purchase interrupted before it was credited, a consume that fails, pending payments, Ask to Buy, cancels, store errors, refunds, and the wallet coming back from native storage after the web view's storage is cleared: `tools/e2e-native.mjs`.
  - The product-creation script against a mock of both store APIs (signed requests, bodies, pagination, the screenshot upload, nothing duplicated on a second run): `tools/test-store-products.mjs`.
- **Ads:**
  - The pacing rules, reward ads, skip and the long aim guide in the browser: `tools/e2e-ads.mjs`, 42 checks.
  - The native AdMob event handling (an early close, failure to show, no-fill retries, consent and privacy options) and the Android back button on every screen, using mocked plugins: `tools/e2e-native.mjs`, 24 checks.
- **Robustness:** the game recovers from a zero-size view, a jumping frame clock and a broken camera: `tools/e2e-recover.mjs`, 20 checks. Saves survive corrupt data and storage that throws.
- **Layouts:** 320×568 up to 430×932 phones, plus tablets in both orientations. Android 16 ignores the portrait lock on large screens.
