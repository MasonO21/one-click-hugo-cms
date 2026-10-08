# Nova Colony — Store Listing Document (v1.0)

## 1. App Identity & Subtitles

**App Name:** Nova Colony

**iOS Subtitle** (≤30 chars):
```
Build Your Dream Colony
```

**Google Play Short Description** (≤80 chars):
```
Crash-land, build, recruit colonists, and grow a gleaming Titanium super-colony.
```

**iOS Promotional Text** (≤170 chars):
```
From a crashed escape pod to a sprawling automated fortress. Build, manage, defend, and explore a beautiful alien world as you grow a wooden camp into a Titanium super-colony.
```

---

## 2. Full Description (≤4000 chars)

**Tone:** Warm, cozy, inviting; emphasize fantasy and progress.

Nova Colony is a relaxing base-building adventure where you crash-land on a stunning alien planet and grow a humble wooden camp into a gleaming Titanium super-colony.

**The Fantasy:**
You emerge from your damaged escape pod with nothing but a basic tool, a small backpack, and determination. Gather resources, build shelter, recruit fellow survivors, and slowly transform the landscape around you. What starts as a desperate survival camp becomes a thriving settlement, then an organized colony, and finally an automated technological fortress that rivals the greatest human achievements.

**Core Features:**

- **7 Base Tiers:** Progress from Wood through Reinforced Wood, Stone, Steel, Advanced Alloy, and Nano-Tech to Titanium. Watch your colony's architecture visibly transform with each tier—your humble campfire becomes a fusion reactor, and your wooden walls become gleaming titanium barriers.

- **Free-Form Building:** Drag-to-build on a touch-friendly grid. Automatic roofs over enclosed spaces, full refunds, move/rotate/copy buildings for free, and powerful mass-upgrade tools make construction fast and satisfying.

- **150 Buildings, 90 Research Nodes:** From humble farms and crafting tables to automated factories, drone hangars, laser turrets, and quantum storage, every building is data-driven and serves a purpose.

- **Colonists with Personality:** Recruit survivors with names, traits, and specialties. Farmers auto-harvest, engineers repair machinery, guards defend against invasions, scientists research new tech—and everyone's happiness matters.

- **Automation Path:** Start gathering resources yourself. Progress to workers who gather for you, then to logging camps and automated harvesters. Eventually, drones handle everything while you focus on strategy and expansion.

- **Exciting (But Never Punishing) Invasions:** Aliens attack with a 2-minute warning. Defend with barricades, spike traps, guard towers, machine-gun sentries, missile turrets, laser cannons, and plasma defenses. A properly upgraded colony survives—and buildings auto-repair for free if damaged.

- **Open World with 8 Biomes:** Unlock Crash Valley, Pinewood Forest, Crystal Canyon, Red Desert, Toxic Marsh, Frozen Ridge, Alien Ruins, and Titanium Highlands over time. Each holds unique resources, points of interest, survivor camps, and secrets.

- **Offline Progress:** Your colony keeps producing while you're away. Return to a "Welcome Back" summary of earned resources, and watch offline earnings double with an optional ad.

- **Live-Ops & Rewards:**
  - 7-day login rewards (resources → crafting mats → Nova Crystals → colonist → defense gear → more crystals → legendary reward)
  - Daily spin wheel with chances for resources, Nova, boosts, and rare crates
  - 50-level season pass (free + premium tracks; XP from normal play)
  - Optional **Colony Pass** subscription ($7.99/mo): daily Nova Crystals, +10% production, extra offline storage, double daily rewards, exclusive cosmetics

- **Optional Rewarded Ads:** Watch short videos to double offline earnings, boost production for 10 minutes, instantly finish crafting, open free resource crates, refresh recruits, or gain research bonuses. Ads are *always* rewarded and *never* forced—you choose when to watch.

- **Cosmetics & Customization:** Base themes (Sakura, Aurora, Neon, etc.), player outfits, colonist outfits, vehicle and turret skins, and decorations let you make your colony uniquely yours.

- **No Gameplay Paywalls:** Everything playable in the free game. Purchases grant Nova Crystals, cosmetics, convenience boosts, and premium season rewards only—never lock story, Titanium, biomes, or any core system behind payment.

**Why Play?**
Every few minutes brings a new accomplishment: discovering a biome, upgrading a tier, recruiting a colonist, unlocking powerful tech, defending against aliens, or watching automated machines turn raw materials into finished products. The game constantly makes you feel progress and growth—exactly what makes base-building games so satisfying.

**Tech:** Built with TypeScript, three.js, and Capacitor. No heavy graphics files—everything from low-poly architecture to procedural audio is generated at runtime for instant load times and a small install size.

---

## 3. Keywords & Category Suggestions

**iOS Keywords** (≤100 chars, comma-separated, no spaces after commas):
```
base building,simulation,management,strategy,cozy,aliens,sci-fi,colonists,automation,offline
```

**Google Play Keywords** (similar):
```
base building,simulation,management,strategy,cozy,aliens,sci-fi,colonists,automation,offline
```

**Category Suggestions:**
- **iOS:** Games → Simulation (Primary), Games → Strategy (Secondary)
- **Google Play:** Simulation (Primary), Casual (Secondary)

---

## 4. "What's New" — Version 1.0

**v1.0.0 Launch:**
```
Welcome to Nova Colony!

🚀 Crash-land on an alien planet and grow your colony from wood to titanium.
🏗️  Build 150 buildings, recruit colonists, and automate everything.
👽 Defend against periodic alien invasions (they're exciting but never punishing).
🌍 Explore 8 beautiful biomes, each with unique resources and secrets.
📱 Play offline—your colony produces while you're away.
💎 Earn Nova Crystals through play, or collect daily rewards & bonuses.
🎯 Complete 105 polished missions, reach Titanium, and become the ultimate colony builder.

Join over [X] players building their dream colonies. Free to play, optional purchases, no paywalls.
```

---

## 5. Screenshot Captions (8 shots, ≤40 chars each)

The store-ready set lives in `nova-colony/art/store/screenshots/` and is generated by
`node scripts/store-shots.mjs --url <dev server> --save <late-game save>` (see the header of that script; it shoots
at High quality from a tier-6 save and composes the brand frame + caption). Re-run it after art changes.

| # | File | Caption | iPhone 6.9" | iPad 13" | Play phone |
|---|---|---|---|---|---|
| 1 | `01-hero.png` | Build your dream colony on a new world | ✓ | ✓ | ✓ |
| 2 | `02-tiers.png` | From wood camp to titanium fortress | ✓ | ✓ | ✓ |
| 3 | `03-night.png` | Warm lights and thriving nights | ✓ | ✓ | ✓ |
| 4 | `04-raid.png` | Defend your colony from alien raids | ✓ | ✓ | ✓ |
| 5 | `05-build.png` | Drag, drop, build: 150 buildings | ✓ | ✓ | ✓ |
| 6 | `06-research.png` | 90 technologies to research | ✓ | | ✓ |
| 7 | `07-crew.png` | Recruit colonists with personality | ✓ | | ✓ |
| 8 | `08-map.png` | Explore 8 beautiful alien biomes | ✓ | ✓ (as `06-map.png`) | ✓ |

Sizes: iPhone 6.9" 1320×2868, iPad 13" 2064×2752, Google Play phone 1080×1920 (RGB PNG, no alpha, each well
under 8 MB). The older captures in `docs/screenshots/` predate the lighting pass and painted UI; don't upload them.

---

## 6. Age Rating & Questionnaire Notes

### Apple App Store (IARC Rating)

**Content Restrictions to Declare:**

- **Cartoon or Fantasy Violence:**
  - Aliens attack the player's base periodically. Player defends with automated turrets, barricades, traps, and weapons.
  - Aliens are destroyed; players' buildings auto-repair (no destruction/loss).
  - Violence is non-graphic, cartoonish, and thematic only.
  - **Frequency:** Occasional (alien invasions every 30–60 minutes of play).
  - **Intensity:** Low to moderate; stylized, not realistic.

- **In-App Purchases:**
  - Optional Nova Crystals (premium currency) in packs ($0.99–$99.99).
  - Optional cosmetics (themes, outfits, skins) purchasable with currency.
  - Optional Colony Pass subscription ($7.99/month).
  - Season Pass premium track ($9.99/season).
  - **None of these unlock core gameplay.**

- **Advertising:**
  - Optional rewarded video ads (player chooses to watch for in-game rewards).
  - No banner ads, no interstitials, no forced ads.
  - Ads are gated behind player consent and are always optional.

**Recommended Rating:** 9+ — answer "Infrequent/Mild Cartoon or Fantasy Violence" (turrets and the player regularly defeat cartoon aliens; no blood, no gore).

---

### Google Play (IARC Questionnaire)

**Form Answers:**

- **Violence:** Yes, Cartoon/Fantasy
  - Aliens vs. automated defenses; no graphic depiction.
  
- **Purchases:** Yes
  - IAP for cosmetics, convenience, season premium, subscription.
  
- **Advertising:** Yes, Rewarded only
  - Optional video ads for in-game bonuses.
  
- **Location Data:** No
  
- **Personal Information:** No (analytics: opt-in install ID only)
  
- **Sensitive Permissions:** No (vibration/haptics only for optional feedback)

**Recommended Rating:** Everyone / Everyone 10+ (IARC category: Low maturity).

---

## 7. Privacy: App Privacy (Apple) & Data Safety (Google)

### Data We Collect (if analytics is enabled)

**Collection is opt-in and off by default.** On first launch a small, non-blocking card asks "Help make Nova Colony even cozier? Share anonymous gameplay stats" with equally prominent **No thanks** / **Sure!** buttons; nothing is collected unless the player taps **Sure!**. Players can change the choice anytime in Settings → Privacy ("Help improve the game"). Disabling it immediately stops all tracking and deletes the install ID.

**Type of Data Collected:**

1. **Install ID (Random):**
   - A random 128-bit identifier generated on first launch.
   - Not linked to device ID, advertising ID, or any personal identity.
   - Deleted from device when player disables analytics consent.

2. **Gameplay Events (No PII):**
   - Session start/end (timestamp, duration, game version).
   - Tutorial/mission progress (mission IDs, mission step, time-to-completion).
   - Tier progression (tier unlocked, time taken).
   - Research completion (research node ID, tier).
   - Building usage (building type ID, count aggregated).
   - World exploration (region/biome IDs discovered).
   - Combat milestones (waves fought, kills, tier).
   - Ad engagement (ad placement ID, result: watched/failed).
   - Purchase events (product ID, purchase count).
   - Retention (calendar days since install; checked once per day).
   - Quit point (current mission & progress % when app is paused).
   - Progression stall detection (10+ minutes without mission progress).
   - Daily/season feature claims (day, streak, level).
   - Offline earnings claimed.

3. **What We DO NOT Collect:**
   - No email, username, device identifiers, or personal names.
   - No device ID, IDFA (iOS), or Advertising ID (Android) in analytics.
   - No location data.
   - No contact list, photos, or file access.
   - No string values beyond ~64 characters; e-mail-like strings are redacted.

**Retention:** Events are batched and sent once per 20 events or 30 seconds (whichever comes first), or when the app is paused. Failed sends are retried with a bounded queue; oldest events drop first if the queue exceeds ~300 events.

**Sink:** Events are sent to an HTTPS endpoint (if `VITE_ANALYTICS_URL` is configured). On web or without a backend URL, events are dropped and stay on-device only. All data is handled in-memory; nothing is cached on disk.

---

### Third-Party Services & Their Data Collection

**VERIFY:** These third parties have their own privacy policies and data collection. We do not control these; your privacy statements must link to or summarize their disclosures:

1. **AdMob (Google)** — Rewarded Ads
   - Serves and tracks rewarded video ads.
   - Collects: ad interaction data, app usage (limited), and may request App Tracking Transparency (iOS).
   - **Their Privacy Policy:** [Google Privacy Policy](https://policies.google.com/privacy)
   - **iOS App Tracking Transparency:** App requests user consent before tracking (NSUserTrackingUsageDescription).
   - **Android Advertising ID Disclosure:** Play Console Data Safety form requires declaration of ad-related permissions.

2. **RevenueCat** — In-App Purchases
   - Processes and validates purchases (acts as a middle layer between the app and App Store / Google Play).
   - Collects: purchase transaction data (product ID, price, timestamp, user receipt).
   - **Their Privacy Policy:** [RevenueCat Privacy Policy](https://www.revenuecat.com/privacy)
   - **Note:** RevenueCat is a licensed reseller; the App Store and Google Play themselves also process payment information per their own privacy policies.

3. **App Store & Google Play** (native stores)
   - Process purchase transactions and payment methods.
   - Collect: payment info, install data, device identifiers.
   - Governed by Apple and Google's privacy policies respectively.

---

### Player Controls & Consent

- **In-Game Privacy Settings:** Players can toggle analytics on/off in Settings → Privacy & Analytics.
- **When toggled off:** Analytics consent is immediately disabled, the queue is cleared, and the install ID is deleted from the device.
- **Cloud Save (Optional):** If enabled via backend URL (`VITE_CLOUD_SAVE_URL`), players get a recovery ID (NOVA-XXXX-XXXX-XXXX) to sync saves across devices. This ID is a bearer secret; no authentication is required once known. Recommend HTTPS-only, rate-limiting, and a privacy policy disclosing this recovery mechanism.

---

### Apple App Privacy Labels (Data Not Linked to You)

**Summary:** All analytics data is "not linked to you" (the player's identity), collected only if consent is enabled, and tied to a random install ID only.

| Category | Data Types | Linked to You | Purpose |
|----------|-----------|---|---------|
| **Gameplay Events** | Mission IDs, building types, tier, event counts, timestamps | No | Product analytics & retention measurement |
| **Install ID** | Random 128-bit identifier | No | Batching events; deleted on consent withdrawal |
| **Diagnostics (Crash Data / Other Diagnostic Data)** | Error events for failures the game recovered from: a code-location label, the first line of the error message (≤64 chars) and the top bundle stack frame; at most 25 per session (`src/platform/errorReport.ts`). Only with analytics consent | No | App functionality (finding and fixing bugs) |
| **Ads** | Ad placement ID, result (watched/failed) | No | Ad effectiveness & limit enforcement |
| **Purchases** | Product ID, purchase count | No | Purchase funnel analysis |
| **Location** | (None) | — | — |
| **Contacts** | (None) | — | — |
| **Photos/Media** | (None) | — | — |
| **Calendar/Events** | (None) | — | — |
| **Camera** | (None) | — | — |
| **Microphone** | (None) | — | — |
| **Sensitive Info** | (None) | — | — |

**VERIFY:** Confirm no other data collection methods are active. Add "Cloud Save Recovery ID" row if `VITE_CLOUD_SAVE_URL` is set in production.

---

### Google Play Data Safety Form

**Summary for each category:**

- **Personal info:** No collection (no email, phone, profile data).
- **Location:** No (not accessed).
- **Financial info:** Payment processed by RevenueCat & App Store only; we do not retain card details.
- **Health & fitness:** No.
- **Messages:** No.
- **Photos & videos:** No.
- **Audio files:** No.
- **Calendar events:** No.
- **Contacts:** No.
- **Search/browsing history:** No.
- **App activity:** Yes — opt-in analytics (gameplay events, install ID, ad engagement). Declared as "not linked to you" and tied to random install ID.
- **App info and performance → Crash logs / Diagnostics:** Yes — opt-in only (same analytics consent): error events for failures the game recovered from (location label, first line of the message, top stack frame), max 25 per session, tied to the random install ID. Purpose: app functionality / analytics.

**Third-Party Sharing:**
- ✓ Ads (AdMob): ad placement ID, gameplay session flags.
- ✓ Analytics (HTTP endpoint, if configured): gameplay event batches with install ID.
- ✓ Purchases (RevenueCat & App Store): purchase transactions.
- ✗ No sharing with other third parties for marketing/tracking.

**Advertising Privacy:**
- Rewarded ads only; player must consent in-game.
- AdMob Consent Mode / UMP enabled (respects regional privacy laws).
- App Tracking Transparency request (iOS) before first ad if needed.
- Declare "com.google.android.gms.permission.AD_ID" in manifest (Play Console auto-detects this).

---

## 8. Pre-Submission Checklist

### Graphics & Assets

- [ ] **App Icon:** 1024×1024 PNG (no transparency) placed at `nova-colony/assets/icon.png`
  - Generated with `npx @capacitor/assets generate` and verified in both stores.
  
- [ ] **Splash Screen:** 2732×2732 PNG (launch image) at `nova-colony/assets/splash.png`
  - Generated with `npx @capacitor/assets generate` and verified in native projects.
  
- [ ] **Screenshots:** At least 2 per device type, up to 5–8 for better visibility:
  - **iPhone 6.9" (Portrait):** 1320×2868 — 8 ready in `art/store/screenshots/iphone-6.9/` (see §5).
  - **iPad 13" (Portrait):** 2064×2752 — 6 ready in `art/store/screenshots/ipad-13/`.
  - **Google Play (Phone portrait):** 1080×1920 — 8 ready in `art/store/screenshots/play-phone/`.
  - **Google Play (Tablet):** 1600×2560 or 2560×1600. Suggested: 1–2.
  - [ ] Screenshot files are optimized (no excessive size; PNG compression OK).
  - [ ] Captions/overlays are legible on mobile (16pt+ font, contrast ≥4.5:1).

- [ ] **Preview Video** (optional but recommended for both stores):
  - 15–30 seconds, vertical (9:16) for mobile, 1080p minimum.
  - Shows: crash-landing → building → colonists → aliens → Titanium tier.
  - No sound needed; music/SFX added by store algos; captions/text overlays help.

### Configuration & Content

- [ ] **Store Product IDs Created & Active:**
  - Verified in RevenueCat: all 8 product IDs from `src/data/monetization.ts` exist.
    - [ ] `nova_starter_pack` (non-consumable)
    - [ ] `nova_crystals_small` (consumable)
    - [ ] `nova_builder_pack` (consumable)
    - [ ] `nova_colony_pack` (consumable)
    - [ ] `nova_commander_pack` (consumable)
    - [ ] `nova_ultimate_pack` (consumable)
    - [ ] `colony_pass_monthly` (auto-renewing subscription)
    - [ ] `season_pass_premium` (non-consumable)
  - [ ] **iOS App Store:** All products created in App Store Connect, tested in Sandbox.
  - [ ] **Google Play:** All products created, activated, and approved (require internal test build submitted first).
  - [ ] Prices set in each store; fallback prices in code (`monetization.ts`) are reasonable placeholders.

- [ ] **Colony Pass Subscription Terms:**
  - Visible in-game (near shop / subscription button): "Renews monthly for $7.99. Cancel anytime in Settings."
  - Renewal terms displayed in store listing as required (iOS & Android).
  - Restore purchases tested: tapping "Restore" re-grants subscription benefits if license is active.

- [ ] **Privacy & Legal:**
  - [ ] **Privacy Policy URL:** Live HTTPS page that covers:
    - Analytics opt-in/out, data retention, install ID, AdMob, RevenueCat, cloud saves (if enabled).
    - Link to AdMob and RevenueCat privacy policies.
    - Contact email for privacy inquiries (support@novacolony.dev or similar).
  - [ ] **Terms of Service (optional but recommended):** Covers in-app purchases, account recovery, fair play.
  - [ ] **Support/Contact Email:** Listed in stores and accessible in-game (Settings → Help & Support).
  - [ ] **Developer Website / Org Name:** Consistent across both stores.

- [ ] **App Data Safety (Google Play):**
  - Submitted questionnaire with:
    - Analytics: Opt-in, not linked to identity, for product metrics.
    - Ad ID: Declared (used by AdMob).
    - Purchases: RevenueCat & Play billing only.
    - Third-party sharing: AdMob, RevenueCat, analytics endpoint.
  - [ ] Play Console automatically declares `AD_ID` permission (from AdMob integration).

- [ ] **Age Rating (IARC):**
  - Submitted questionnaire (required once, covers Apple/Google/Amazon/Windows Store).
  - Categories: Cartoon/Fantasy violence (alien combat), optional ads, optional IAP.
  - Recommended rating: 9+ (iOS) / Everyone 10+ (Google, IARC) / PEGI 7.

- [ ] **AdMob Setup:**
  - [ ] **iOS:** Real app ID (ca-app-pub-…~…) in `ios/App/App/Info.plist` → `GADApplicationIdentifier`.
  - [ ] **Android:** Real app ID in `android/gradle.properties` or build.gradle (ADMOB_APP_ID_ANDROID).
  - [ ] **Ad Unit IDs:**
    - [ ] iOS rewarded unit ID in `.env.production` → `VITE_ADMOB_REWARDED_IOS`.
    - [ ] Android rewarded unit ID in `.env.production` → `VITE_ADMOB_REWARDED_ANDROID`.
  - [ ] **SKAdNetwork List (iOS only):** Full current list from Google pasted into `Info.plist` → `SKAdNetworkItems`.
    - (Repo stub: only `cstr6suwn9.skadnetwork` included; fetch the full list from [Google SKAdNetwork](https://developers.google.com/admob/ios/3p-skadnetworks)).
  - [ ] **Consent & UMP:** AdMob Consent Mode configured; GDPR/regional privacy forms published (if applicable).
  - [ ] **app-ads.txt:** Published at `https://yourdomain.com/app-ads.txt` (contains AdMob app ID & direct-seller declaration).

- [ ] **RevenueCat Configuration:**
  - [ ] Public SDK keys set:
    - [ ] `VITE_RC_IOS_KEY` (starts with `appl_…`) in `.env.production`.
    - [ ] `VITE_RC_ANDROID_KEY` (starts with `goog_…`) in `.env.production`.
  - [ ] Products synced in RevenueCat dashboard; all 8 IDs active.
  - [ ] Tested on real device: purchase flow, restore purchases, subscription renewal.

### Build & Testing

- [ ] **Web Build Clean:**
  ```bash
  npm test                # All tests pass
  npm run typecheck       # No TS errors
  npm run build           # No build errors
  ```

- [ ] **Native Builds:**
  - [ ] **Android:**
    - [ ] `npm run cap:sync` → no errors.
    - [ ] Built AAB (Android App Bundle) for release: `./gradlew bundleRelease` or Android Studio.
    - [ ] Signed with upload key (not app key); keystore never committed.
    - [ ] Version codes bumped: `versionCode` in `android/app/build.gradle`.
    - [ ] Tested on Android 12+ and Android 8+ devices (if minSdk = 24).
  - [ ] **iOS:**
    - [ ] `npm run cap:sync` → no errors.
    - [ ] Built Archive in Xcode: Product → Archive.
    - [ ] Team provisioning profile set; signing certificate valid.
    - [ ] Version bumped: `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in Xcode.
    - [ ] Tested on iOS 15+ and iPad (all orientations).

- [ ] **Device Testing (Real Hardware):**
  - [ ] **No DEV UI:** App shows no "DEV AD" overlay or "DEV STORE" prompt on device.
  - [ ] **No Test Ads:** Real ad unit IDs serve live ads (or test ads if `VITE_ADMOB_TESTING=true` on QA build).
  - [ ] **Ads Work:** Each of 9 ad placements plays, grants reward, respects daily limits.
  - [ ] **Purchases Work:** Buy a consumable and a subscription on both iOS TestFlight and Google Play Internal Test.
  - [ ] **Restore Works:** Restore purchases on a second device/sandbox account; subscription benefits re-grant.
  - [ ] **Offline & Welcome Back:** Close app, wait 1+ hour, relaunch → "Welcome Back" summary shows; offline ad doubles earnings.
  - [ ] **Saves & Recovery:** Close app mid-session → relaunch restores state; export recovery code and import on a second device.
  - [ ] **Cloud Save (if enabled):** Cloud sync works; recovery ID shown in Settings.
  - [ ] **Haptics:** Haptics toggle in Settings controls vibration on successful builds/interactions (Android & iOS).
  - [ ] **Orientation:** Portrait + Landscape both work; safe-area/notch handled correctly.
  - [ ] **Performance:** No crashes on large colonies; frame rate stable (30+ fps on modern devices).

- [ ] **Analytics & Logging:**
  - [ ] Analytics can be toggled on/off in Settings; opt-in state is respected.
  - [ ] No analytics are sent when disabled.
  - [ ] Server endpoint (`VITE_ANALYTICS_URL`) is reachable and accepts batches (200 OK).

### Legal & Store Compliance

- [ ] **Subscription Disclosure (iOS & Android):**
  - In-app: prominent text near Colony Pass button.
  - Store listing: subscription terms visible (auto-renew, cancellation, price).
  - Sandbox/Internal Test: subscription can be purchased and canceled without charge.

- [ ] **Refund Policy:**
  - Comply with Apple (72-hour refund window) and Google Play (48-hour window) policies.
  - In-game help text: "Refunds handled by [App Store / Google Play]."

- [ ] **Age Appropriateness:**
  - All text is family-friendly (no profanity, no mature themes).
  - Alien combat is cartoonish; no gore or realistic violence.
  - Advertising is opt-in and non-intrusive.

- [ ] **Localizations (If Applicable):**
  - At minimum: English (US) and English (UK).
  - Recommended: Spanish, French, German, Japanese (for broader reach).
  - Ensure localized screenshots, descriptions, and privacy policy.

### Final Pre-Release

- [ ] **Version Bump:** All version numbers aligned:
  - `package.json` → `version: "1.0.0"`
  - `capacitor.config.ts` → `appVersion: "1.0.0"`
  - `android/app/build.gradle` → `versionCode 1`, `versionName "1.0.0"`
  - `ios/App/App/Info.plist` → `CFBundleShortVersionString: "1.0.0"`, `CFBundleVersion: "1"`

- [ ] **Git Commit & Tag:**
  ```bash
  git add -A
  git commit -m "release: v1.0.0"
  git tag -a v1.0.0 -m "Nova Colony v1.0.0 release"
  git push origin main --tags
  ```

- [ ] **Store Submission:**
  - [ ] **iOS TestFlight (Beta):** Submit for review (1–2 days); invite external testers.
  - [ ] **iOS App Store:** Submit for review after TestFlight validation (2–5 days typical).
  - [ ] **Google Play Closed Testing (Beta):** Submit internal test build; run through device tests.
  - [ ] **Google Play Production:** Submit after passing internal tests (4–24 hours typical).

---

## 9. Additional Notes

### VERIFY Tasks

These sections require manual verification before store submission:

1. **VERIFY:** Confirm no unexpected data is collected beyond the analytics listed (check `analyticsHooks.ts` for any additional tracking).
2. **VERIFY:** Confirm cloud-save backend URL (if enabled) is HTTPS and implements rate-limiting & access controls.
3. **VERIFY:** Confirm AdMob & RevenueCat credentials are valid and not test/placeholder IDs in production build.
4. **VERIFY:** Confirm privacy policy, terms, and support contact are live and accessible.
5. **VERIFY:** Confirm all third-party SDKs (AdMob, RevenueCat) are current and their privacy policies are linked from the store listing.

### Files to Reference

- `src/data/monetization.ts` — Product IDs, ad placements, cosmetics, season pass, daily rewards.
- `src/platform/analytics.ts` — Analytics client, consent handling, install ID management.
- `src/platform/analyticsHooks.ts` — Event tracking hooks (mission, tier, building, ad, purchase, etc.).
- `src/platform/cloud.ts` — Cloud save recovery ID generation and protocol.
- `capacitor.config.ts` — App ID, version, native config.
- `MOBILE.md` — Comprehensive mobile build and release guide (§1–11).

### Contact & Support

- **Player Support:** support@novacolony.dev (or configured support email)
- **Privacy Inquiries:** privacy@novacolony.dev (or developer email)
- **Developer Website:** https://novacolony.dev (or company site)
- **Social Media:** (Optional; add if community channels are active)

---

**Document prepared for Nova Colony v1.0 store submission.**
**Last updated:** 2026-10-07
**Author & Attribution:** Prepared by Claude Haiku 4.5 (Anthropic)
