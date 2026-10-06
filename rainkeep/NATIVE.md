# Shipping Rainkeep to the App Store (and Google Play)

This walks through turning the web game in this folder into an iPhone app, step by step. You need a Mac for the iOS part. Budget an afternoon for the first build and a few days for Apple's review.

The app is a [Capacitor](https://capacitorjs.com/) shell around the same HTML/JS files you can play in a browser. Purchases go through Apple (or Google) using [RevenueCat](https://www.revenuecat.com/), which handles receipt checking so you don't need your own server.

## What you need

| Item | Cost | Notes |
|---|---|---|
| A Mac with macOS 14 or newer | | Xcode only runs on macOS |
| Xcode (free, Mac App Store) | free | Open it once after installing to finish setup |
| Node.js 22 or newer | free | [nodejs.org](https://nodejs.org) |
| Apple Developer Program | $99/year | [developer.apple.com/programs](https://developer.apple.com/programs/) |
| RevenueCat account | free until $2.5k/month revenue | [app.revenuecat.com](https://app.revenuecat.com) |
| Google Play Console (Android only) | $25 once | [play.google.com/console](https://play.google.com/console) |

## 1. Build the iOS project

In a terminal, from this `rainkeep/` folder:

```bash
npm install            # Capacitor, its plugins and RevenueCat
npm run build          # copies the game into www/
npx cap add ios        # creates the ios/ Xcode project (first time only)
npx cap sync ios       # copies www/ and plugins into the Xcode project
npx cap open ios       # opens Xcode
```

After any change to the game files, run `npm run cap:sync` and rebuild in Xcode.

## 2. Set up the app in Xcode

1. Select the **App** target, then **Signing & Capabilities**.
2. Choose your **Team** (your Apple Developer account). Leave "Automatically manage signing" on.
3. The bundle identifier is `com.rainkeep.game` (from `capacitor.config.json`). If that ID is taken, change it in both places.
4. Click **+ Capability** and add **In-App Purchase** and **Push Notifications**. Local notifications don't strictly need the second, but adding it avoids a later rebuild.
5. **App icon:** open `App/App/Assets.xcassets/AppIcon` and drop in `icons/icon-1024.png`. Xcode makes the smaller sizes.
6. **Splash:** replace the images in `App/App/Assets.xcassets/Splash.imageset` with `icons/splash-2732.png`.
7. **Orientation:** in the target's **General** tab, under Deployment Info, tick **Portrait** only.
8. **3D graphics:** the keep and the Dunes render with WebGL inside the app's web view (WKWebView on iOS, Chrome WebView on Android); both support it on every device the app targets. Test frame rate on the oldest phone you plan to support. Players can switch 3D off in Settings, and the game falls back to its 2D renderer automatically if WebGL isn't available.
8. Plug in an iPhone, pick it as the run destination and press ▶. The game should start.

## 3. Create the app and products in App Store Connect

1. In [App Store Connect](https://appstoreconnect.apple.com), go to **Apps**, then **+**, then **New App**. Platform iOS, name **Rainkeep**, bundle ID `com.rainkeep.game`, SKU `rainkeep`.
2. Open the app, go to **Monetization**, then **In-App Purchases**, and create every product below. Product IDs must match exactly (they live in `native.js`).

| In-game item | Product ID | Type | Price tier |
|---|---|---|---|
| Founder's Cache | `com.rainkeep.founder` | Non-Consumable | $0.99 |
| Oasis Stipend | `com.rainkeep.stipend30` | Consumable | $4.99 |
| Ledger Premium (each season) | `com.rainkeep.ledger.season` | Consumable | $9.99 |
| Growth Fund | `com.rainkeep.growthfund` | Non-Consumable | $14.99 |
| Sandstorm Kit | `com.rainkeep.stormkit` | Consumable | $2.99 |
| Warden's War Chest | `com.rainkeep.warchest` | Consumable | $19.99 |
| Forge Kit | `com.rainkeep.forgekit` | Consumable | $4.99 |
| Growth Pack (each Rainwyrm level) | `com.rainkeep.growthpack` | Consumable | $4.99 |
| Grand Growth Pack (each Rainwyrm level) | `com.rainkeep.growthpack.grand` | Consumable | $19.99 |
| Pouch of Starglass | `com.rainkeep.starglass.120` | Consumable | $1.99 |
| Satchel of Starglass | `com.rainkeep.starglass.330` | Consumable | $4.99 |
| Chest of Starglass | `com.rainkeep.starglass.700` | Consumable | $9.99 |
| Crate of Starglass | `com.rainkeep.starglass.1500` | Consumable | $19.99 |
| Vault of Starglass | `com.rainkeep.starglass.4000` | Consumable | $49.99 |
| Hoard of Starglass | `com.rainkeep.starglass.8500` | Consumable | $99.99 |
| Oasis Jade skin | `com.rainkeep.skin.oasis` | Non-Consumable | $4.99 |
| Obsidian Tide skin | `com.rainkeep.skin.obsidian` | Non-Consumable | $6.99 |

Each product needs a display name, a description and a review screenshot (any in-game screenshot of the Store tab works).

3. Under **Business**, sign the **Paid Apps Agreement** and add banking and tax details. Purchases won't work, even in testing, until this is done.

## 4. Connect RevenueCat

1. Create a RevenueCat project and add an **App Store** app with bundle ID `com.rainkeep.game`.
2. Follow RevenueCat's guide to upload an **In-App Purchase Key** from App Store Connect (Users and Access, then Integrations, then In-App Purchase).
3. Under **Products**, import the product IDs above.
4. Copy the app's **public SDK key** (starts with `appl_`).
5. Paste it into `data.js`:

   ```js
   revenueCatApiKey: 'appl_XXXXXXXXXXXXXXXX',
   ```

6. Run `npm run cap:sync` and rebuild. In the app, the Store tab now shows real local prices, and buying opens Apple's purchase sheet. The web version keeps simulating purchases because the key only works inside the app.

## 5. Test purchases in the sandbox

1. In App Store Connect, under **Users and Access**, then **Sandbox**, create a sandbox tester with a fresh email address.
2. On your iPhone, open **Settings**, then **App Store**, then **Sandbox Account**, and sign in as that tester.
3. Run the app from Xcode and buy the Founder's Cache. You should see a "[Sandbox]" purchase sheet, then a second builder in the keep.
4. Delete and reinstall the app, then use **Settings → Restore purchases** in the game. The Founder's Cache, Growth Fund and skins should come back. (Ledger Premium is a per-season consumable, so it is not restored; the season it was bought for stays unlocked in the save.)

## 6. TestFlight

1. In Xcode, choose **Product**, then **Archive**. When the archive finishes, click **Distribute App**, then **App Store Connect**.
2. In App Store Connect, go to **TestFlight**. Once the build finishes processing, add yourself and up to 10,000 testers by email or a public link.

## 7. Submit for review

Fill in the app page using `STORE_LISTING.md` (name, subtitle, description, keywords, screenshots). Then:

- **Privacy policy URL:** host `PRIVACY.md` as a web page (GitHub Pages or your Netlify site works) and paste its URL.
- **App Privacy ("nutrition label"):** choose **Data Not Collected**. Rainkeep keeps the save on the device. RevenueCat processes purchase receipts with an anonymous ID; Apple's guidance is that purchase history handled only for fulfilling purchases still needs declaring if it's linked to the user, so read RevenueCat's current "App Privacy" guide and match what it says for your setup.
- **Age rating questionnaire:** the game contains **paid random items** (hero recruitment). Answer **Yes** to "Loot boxes or other paid random items". Simulated gambling: **None** (there are no casino-style games). Expect a **12+** rating. Odds are disclosed in-game on the Beacon screen (the **Odds** button), which Apple requires.
- **Export compliance:** the app uses only standard HTTPS through Apple's frameworks, so answer that it uses exempt encryption (or add `ITSAppUsesNonExemptEncryption = NO` to `Info.plist`).
- **Review notes:** mention that Caravan members and rival keeps are simulated, that there is no account or login, and how to reach the Store tab.

Common first-review rejections and how to avoid them:

| Rejection | Fix |
|---|---|
| Guideline 3.1.1: purchases not using IAP | Make sure `revenueCatApiKey` is set in the submitted build, so no simulated purchase screens appear |
| Guideline 2.1: products not submitted | Attach your IAP products to the version on the submission page |
| Guideline 5.1.1: privacy policy missing | Host PRIVACY.md and link it both in App Store Connect and from the game's Settings, or in the app description |
| Loot box odds | Already shown on the Beacon screen. Point the reviewer to it |

## Android (Google Play)

```bash
npx cap add android
npm run cap:sync
npx cap open android      # opens Android Studio
```

1. Create the app in Play Console and add the same product IDs as **in-app products**. Google calls consumables and non-consumables both "in-app products"; RevenueCat tracks which is which.
2. Add a **Play Store** app in RevenueCat, connect the Play service credentials, and use the Google public SDK key (starts with `goog_`). The game reads one key, so ship separate builds per platform, or extend `KHNative.init` to choose the key by platform.
3. Upload a signed App Bundle (`Build`, then `Generate Signed Bundle`) to an internal testing track first.

## Updating the game after launch

1. Edit the web files, then `npm run cap:sync`.
2. Bump the version and build number in Xcode (General tab), archive and submit.
3. To change prices or add offers, create the product in App Store Connect and RevenueCat first, then add it to `DATA.shop` in `data.js` and to `SKUS` in `native.js`.
