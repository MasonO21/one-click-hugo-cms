# Releasing Sizzle Flip

Everything in the code is release-ready. What is left needs **your** accounts, keys and contact details, which cannot be committed to a repository. `npm run release:check` lists exactly what is still missing and passes once it is done.

## 1. Fill in your details (15 minutes)

| What | Where |
|---|---|
| AdMob ad unit ids (Interstitial + Rewarded, Android and iOS) | `src/ads-config.js` → `ADMOB_UNITS` |
| AdMob **app** id for Android | `android/app/src/main/res/values/strings.xml` → `admob_app_id` |
| Contact email for the privacy policy | `src/privacy.js` → `PRIVACY_CONTACT` |
| If the game is aimed at children under 13 | `src/ads-config.js` → `childDirected: true` (and Play's Families policy applies) |

**Shop (in-app purchases).** The 30 characters are one-time products with ids `item_<name>`, for example `item_butter`. The full list, with titles, descriptions and the $1.00 price, is in `store/iap-products.csv`. The ids are fixed in code, so create them in the store consoles exactly as listed (sections 3 and 4). The game shows each store's own localized price.

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
2. Upload a first build with the shop to a testing track. Play only lets you add products to an app that uses billing; the billing permission is already included through the purchases plugin.
3. Go to **Monetize → Products → One-time products** and create the 30 products from `store/iap-products.csv`:
   - same product id,
   - the title and description from the file,
   - price **US$1.00**, with "convert" for other countries,
   - then **Activate** each one.
4. To make free test purchases, add your Google account under **Setup → License testing**.

**Build the bundle:** run `cd android && ./gradlew bundleRelease`. The output is `android/app/build/outputs/bundle/release/app-release.aab`. Enrol in **Play App Signing** when you upload it.

**For every later update,** raise `versionCode` (and `versionName`) in `android/app/build.gradle`.

**Play Console answers:**

- **App category:** Game → Casual.
- **Contains ads:** Yes.
- **In-app purchases:** Yes, optional cosmetic characters. Payment data is handled by Google Play, so nothing extra goes in Data safety. In the IARC questionnaire, answer "yes" to digital purchases.
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
- **Content rating (IARC):** cartoon slapstick with no violence, gambling, user content or purchases. Expect Everyone / PEGI 3.
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

**Then:**

1. Set the bundle id `com.sizzleflip.game`, your team, the version and the build number, and add the **In-App Purchase** capability (Signing & Capabilities).
2. Choose **Product → Archive**, then upload it to App Store Connect.

**App Store Connect:**

- **Shop products:**
  1. Sign the **Paid Apps** agreement and add your banking and tax details (Business section).
  2. Under the app → **Monetization → In-App Purchases**, create the 30 products from `store/iap-products.csv` as **Non-Consumable**: same product id, display name and description, price **$0.99** (Apple's standard first tier; choose $1.00 instead if your price list offers it).
  3. Each product needs a review screenshot. Use `store/iap-review.jpg` for all of them.
  4. Submit the products together with the app version.
  5. For testing, use Sandbox testers (Users and Access → Sandbox).

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
- [ ] Install the release build on a real phone:
  - The consent form appears (use a VPN to an EU country, or AdMob's test-device geography setting).
  - After level 5 and 5 minutes of play, a forced ad appears on NEXT.
  - A test purchase works with a license tester (Android) or a Sandbox tester (iOS), and **Restore** brings items back after reinstalling.
  - Hints, skip and the long aim guide show reward ads.
  - Back works on every screen.
- [ ] Test ads are gone (real ads may take a few hours to start serving after the app is linked in AdMob).

## What has been verified for this release

- **All 200 levels played through the real game** in a browser, using the game's own touch handlers and real UI (NEXT, world-complete cards, forced ads), with no errors: `tools/e2e-all.mjs`.
- **Every stored route** replays and wins under the game's launch rule (only from rest), and holds up under human-sized error: `tools/qa.mjs`.
- **Shop:**
  - The 30 items are drawn over the sausage's own physics body, so the hitbox, mass and bounce are identical. All 200 levels were played through the real game with a different item equipped on each level: `tools/e2e-all.mjs --items`.
  - Buying, equipping, the Locker, reloads, "Reset progress" (which keeps purchases) and the test store are covered by `tools/e2e-shop.mjs`, 20 checks.
  - Store billing (localized prices, pending payments, cancels, store errors, restore, refunds) is covered with a mocked plugin in `tools/e2e-native.mjs`.
- **Ads:**
  - The pacing rules, reward ads, skip and the long aim guide in the browser: `tools/e2e-ads.mjs`, 42 checks.
  - The native AdMob event handling (an early close, failure to show, no-fill retries, consent and privacy options) and the Android back button on every screen, using mocked plugins: `tools/e2e-native.mjs`, 24 checks.
- **Robustness:** the game recovers from a zero-size view, a jumping frame clock and a broken camera: `tools/e2e-recover.mjs`, 20 checks. Saves survive corrupt data and storage that throws.
- **Layouts:** 320×568 up to 430×932 phones, plus tablets in both orientations. Android 16 ignores the portrait lock on large screens.
