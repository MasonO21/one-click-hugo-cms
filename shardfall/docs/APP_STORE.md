# Releasing Shardfall Arena on the App Store and Google Play

This is a step-by-step checklist for getting from this repo to a live app. Steps marked 🔑 need your own accounts or keys, and nobody can do those for you.

The repo already has:
- iOS and Android projects (`ios/`, `android/`), landscape-only, with icons and splash screens
- Purchase and ad code wired up (`web/js/platform.js`), running on test keys
- Privacy policy and terms templates (`web/legal/`)
- In-app account deletion, chest odds shown in-game, and a parental spending limit

---

## 1. Accounts 🔑

| What | Cost | Notes |
|---|---|---|
| [Apple Developer Program](https://developer.apple.com/programs/) | $99 per year | Enroll as an organization if you have a company. Your company name then shows on the store |
| [Google Play Console](https://play.google.com/console) | $25 once | **New personal accounts must run a closed test with at least 12 testers for 14 days in a row before production** ([Google](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)). Organization accounts are exempt |
| [RevenueCat](https://www.revenuecat.com) | Free until $2.5k monthly revenue, then a percentage | Handles purchases on both stores |
| [Google AdMob](https://admob.google.com) | Free | Pays you for rewarded videos |
| A server host (Fly.io, Render, a VPS) | About $5–20/month to start | Only needed for online play. See `server/README.md` |
| A Mac with Xcode | – | Needed to build for iOS |

## 2. Fill in your identifiers 🔑

1. **App id.** `com.shardfall.arena` is a placeholder. If you change it, update `capacitor.config.json` (`appId`), `android/app/build.gradle` (`applicationId` and `namespace`), and the bundle identifier in Xcode.
2. **`web/js/platform.js` → `CONFIG`:**
   - `revenueCatKey.ios` and `revenueCatKey.android`: from RevenueCat → Project → API keys.
   - `devTestPurchases: false`. **Required for any build you submit.** Otherwise purchases fall back to the free test sheet.
   - `admob.rewarded.ios` and `admob.rewarded.android`: your rewarded ad unit ids. Then set `admob.testing: false`.
3. **AdMob app ids:** replace the Google test ids in `ios/App/App/Info.plist` (`GADApplicationIdentifier`) and `android/app/src/main/AndroidManifest.xml` (`com.google.android.gms.ads.APPLICATION_ID`).
4. **Online server (optional):** set `window.SF_SERVER_URL = 'wss://your-server'` in a small script before `js/net.js` in `web/index.html`, or let players enter it in Settings.
5. **Legal pages:** replace every `[PLACEHOLDER]` in `web/legal/privacy.html` and `terms.html`, have a lawyer review them, and host them at a public URL. Both stores require a privacy policy URL.

Then run `npm ci && npx cap sync` in `shardfall/`.

## 3. In-app products

Create these in **App Store Connect → your app → Monetization**, in **Play Console → Monetize → Products**, and in RevenueCat (Products, then attach them to an Offering). The ids must match `platform.js`.

| Game id (`data.js`) | Store product id | Apple type | Google type | Price |
|---|---|---|---|---|
| `gems_60` | `com.shardfall.arena.gems60` | Consumable | One-time, consumable | $0.99 |
| `gems_300` | `com.shardfall.arena.gems300` | Consumable | One-time, consumable | $4.99 |
| `gems_680` | `com.shardfall.arena.gems680` | Consumable | One-time, consumable | $9.99 |
| `gems_1280` | `com.shardfall.arena.gems1280` | Consumable | One-time, consumable | $19.99 |
| `gems_3280` | `com.shardfall.arena.gems3280` | Consumable | One-time, consumable | $49.99 |
| `gems_6480` | `com.shardfall.arena.gems6480` | Consumable | One-time, consumable | $99.99 |
| `starter_pack` | `com.shardfall.arena.starterpack` | Non-consumable | One-time, non-consumable | $1.99 |
| `aether_card` | `com.shardfall.arena.aethercard` | Non-renewing subscription (30 days) | One-time, consumable | $4.99 |

Notes:
- Each product needs a display name, description and review screenshot. Use the in-game shop screen.
- Gems are consumable and are not restored on a new device. The Starter Pack is restored by **Shop → Gems → Restore purchases**.
- **Before launch, move currency to the server.** Right now the client grants gems after a successful purchase. A server should grant them from a RevenueCat webhook instead, so that edited saves can't mint gems.

## 4. Ads and tracking 🔑

- In AdMob: create an iOS app and an Android app, one **Rewarded** ad unit each, and publish `app-ads.txt` on your developer website.
- iOS shows the App Tracking Transparency prompt before the first ad (`platform.js`). The prompt text is in `Info.plist` (`NSUserTrackingUsageDescription`).
- `Info.plist` includes Google's SKAdNetwork id. If you add ad networks through AdMob mediation, add their ids too.
- If you target children, set `admob.childDirected: true` and read section 7.

## 5. Store listing

| Item | Apple | Google |
|---|---|---|
| Icon | `web/assets/icon-1024.png` (no transparency) | `store-assets/play-icon-512.png` |
| Feature graphic | – | `store-assets/feature-graphic-1024x500.png` (Higgsfield key art + logo) |
| Promo image | Optional for marketing | `store-assets/promo-1920x1080.png` |
| Screenshots | iPhone 6.9" landscape (2868×1320 or 2796×1290), iPad 13" if you support iPad | At least 2 phone screenshots; 7" and 10" tablet sets are recommended |
| Category | Games → Action (secondary: Strategy) | Game → Action |
| Privacy policy URL | Required | Required |

Run the game in a desktop browser at the right window size (`npm start`) and take screenshots of a team fight, the hero roster, a skin and the battle pass.

## 6. Privacy disclosures

These must match `web/legal/privacy.html`.

**Apple App Privacy ("nutrition label")**
- **Data linked to the user:** Identifiers (user id), Purchases (purchase history), Usage Data (product interaction: gameplay), Diagnostics (crash data). The purposes are App Functionality and Analytics.
- **Data used to track the user:** Identifiers (device id / IDFA), for Third-Party Advertising. This applies only if the player allows tracking, through AdMob.
- **Not collected:** contacts, location, health, financial info (Apple handles payment), photos, audio or browsing history.

**Google Play Data safety:** the same categories. Mark data as encrypted in transit (yes), and as deletable on request (yes, in-app under **Settings → Delete my data**).

**Account deletion.** Apple requires in-app deletion for apps that create accounts. The game deletes local data and calls `DELETE /api/account` on the server. Google also asks for a web link where users can request deletion, so add one to your website.

## 7. Age rating

Apple's ratings are now **4+, 9+, 13+, 16+ and 18+**. The questionnaire includes questions on in-app controls, capabilities, medical topics and violent themes. Every app must have answered them by January 31, 2026 to keep shipping updates ([Apple](https://developer.apple.com/news/upcoming-requirements/?id=07242025a)). Suggested answers for this game:

- Violence: **cartoon or fantasy, infrequent/mild**. Crystal creatures, no blood.
- **In-app purchases: yes.** Random paid items (chests): yes. Odds are shown in-game, as required by App Store guideline 3.1.1 ([background](https://toucharcade.com/2017/12/21/apple-quietly-updated-the-app-store-review-guidelines-to-require-disclosure-of-loot-box-iap-odds/)).
- **In-app controls: yes.** There's a monthly spending limit in Settings.
- **Capabilities:** account creation (only if online play is enabled). There's no chat and no user-generated content.
- Advertising: yes, opt-in rewarded videos only.

On Google Play, fill in the IARC questionnaire with the same answers.

**Children.** If your target audience includes under-13s, you must follow COPPA, GDPR-K and Google's Families Policy. That means child-directed ad settings, no tracking prompt for kids, and parental gates on purchases. The simpler route is to target 13+ and say so in the listing and the privacy policy.

## 8. Build and test

**iOS (on a Mac):**
```bash
cd shardfall
npm ci
npx cap sync ios
npx cap open ios
```
In Xcode, select the **App** target, then go to **Signing & Capabilities**. Choose your Team, check that the bundle id is right, and add the **In-App Purchase** capability. Then run it on a real iPhone.

To ship: **Product → Archive → Distribute App → App Store Connect**. The build appears in TestFlight in about 15 minutes. Invite testers, and test purchases with a Sandbox account (**Settings → App Store → Sandbox Account** on the phone).

**Android:**
```bash
npx cap sync android
npx cap open android
```
In Android Studio, use **Build → Generate Signed Bundle (.aab)**. Keep the keystore safe forever. Upload the bundle to **Play Console → Testing → Internal testing** first, then **Closed testing** (12 testers for 14 days, if section 1 applies to you).

**Before every submission:**
- `npm test`, `npm run test:ui` and `npm run test:platform` all pass. CI runs them on every push.
- `devTestPurchases: false`, `admob.testing: false`, and real AdMob and RevenueCat ids are set.
- You have played a full match on a real phone, in both orientations' landscape modes.

## 9. App Review notes (paste into App Store Connect)

> Shardfall Arena is a 3v3 battle game. All modes except "Online 3v3" work offline against bots: tap Battle on the home screen. Purchases are in Shop (gem packs, Starter Pack, Aether Card), and chest drop rates are shown on Shop → Chests. Rewarded videos are optional and found under Free. Online play connects to our server at [SERVER URL] and needs no login; a guest account is created automatically. Account deletion: Settings → Delete my data.

## 10. After launch

- Watch crash reports (Xcode Organizer, Play Console vitals) and RevenueCat revenue.
- Track D1/D7/D30 retention and payer conversion. Add an analytics SDK if you want this per feature, and disclose it in the privacy policy.
- Plan content: a new hero or skin line every 2–4 weeks, a new Shard Pass each season, and festival events. That cadence drives revenue in this genre far more than any single feature.
