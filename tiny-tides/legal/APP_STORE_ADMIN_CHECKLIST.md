# App Store admin checklist — everything that is not code

The code, the legal pages and the store text are done. These are the steps only **you** can do (they need your identity, your bank, or your Mac). Tick them in order. Apple’s screens get renamed from time to time; the *intent* of each step stays the same.

> This list reflects Apple’s requirements as generally published and common practice. It is not legal or tax advice. Items marked **⚖** are worth a short conversation with a lawyer or accountant in your country.

## 0. Before anything else (30 minutes)

- [ ] **Decide who the publisher is** — you as an individual, or a company (an LLC is common; needs a D-U-N-S number, free from Dun & Bradstreet, which can take days). The name you pick appears on the App Store as the seller. ⚖
- [ ] Fill in **`legal/site.config.json`** with the same legal name, a real support email, and a postal address. Apple and EU law require a way for customers to reach the publisher; an individual’s home address can be replaced by a PO box or virtual office if you prefer privacy (check that it can receive legal post).
- [ ] **Check the name “Tiny Tides”.** Search App Store, Google Play, the USPTO (tmsearch.uspto.gov), EUIPO and WIPO Global Brand Database for conflicts in games (class 9 / 41). If it’s taken you only need to change `appName` in the config, the display name in `ios/App/App/Info.plist`, and the App Store name. ⚖
- [ ] **Register a domain or choose free hosting**, publish `site/` (see `legal/README.md`), and set `baseUrl`. Open every page on a phone.

## 1. Apple accounts and agreements

- [ ] Enroll in the **Apple Developer Program** (developer.apple.com/programs, US$99/year; enrollment can take from minutes to a few days, longer for organizations).
- [ ] App Store Connect → **Business** (Agreements, Tax and Banking):
  - [ ] Accept the **Paid Applications Agreement** (required even though the app is free, because it has in-app purchases).
  - [ ] Add **bank account** and complete the **tax forms** (US individuals: W-9; others: W-8BEN/W-8BEN-E, and any local tax IDs Apple asks for). ⚖
- [ ] **EU Digital Services Act “trader” status** (Business → Compliance): if you sell as a business/for profit you are a trader — Apple shows your name, address, phone and email on your EU product pages. Enter them (the `phone` in `site.config.json` is a reminder for this form). If you declare yourself a non-trader, EU storefronts will not list the app. ⚖
- [ ] Optional: join the **App Store Small Business Program** (15% commission instead of 30% while proceeds are under US$1M/year).

## 2. Identifiers and project (needs a Mac with Xcode)

- [ ] `npm ci` (this also applies the StoreKit patch), then **`npm run rename -- com.yourname.tinytides`** if you want a different bundle id (it updates Xcode, Capacitor, the StoreKit test file and the legal config together). Keep it lower-case, reverse-domain, and permanent — it can never change after release.
- [ ] `npm run ios:sync`, `npm run ios:open`, then in Xcode: **Signing & Capabilities** → select your Team (also put the same 10-character Team ID into `ios/ExportOptions.plist`, replacing `YOURTEAMID`) → keep **Automatic signing** on. Capabilities: *In-App Purchase* only (no Push, no iCloud, no Sign-in with Apple — and none are needed).
- [ ] Set **Version 1.0.0 / Build 1** (Xcode → App target → General), deployment target iOS 15.
- [ ] **Product → Archive** → *Distribute App* → *App Store Connect* → *Upload*.
- [ ] Xcode → Organizer → the archive → **Generate Privacy Report** and confirm it matches `legal/DATA_MAP.md` (no tracking, no collected data).

## 3. App Store Connect → My Apps → New App

- [ ] Platform iOS · Name (30 chars max) · Primary language English (U.S.) · Bundle ID (from the list) · SKU (any unique string, e.g. `tinytides-ios-1`).
- [ ] **App Information**: Category *Games* → primary *Simulation* (secondary *Casual*, optional). Subtitle and keywords: `store/APP_STORE_LISTING.md`. **License Agreement → Edit → Custom** and paste `store/EULA.txt` (or leave Apple’s standard EULA on; the terms page then still applies through the link).
- [ ] **Pricing and Availability**: Free. Choose countries (see section 6 first!).
- [ ] **In-App Purchases** (Monetization → In-App Purchases → “+”): create the 10 products exactly as listed in `store/iap-products.md` — product **ID**, type (Consumable / Non-Consumable), price tier, display name, description, and a **review screenshot** of the Shop for each (any screenshot of the item’s card in the Shop, 640×920 or larger). Products must be in “Ready to Submit” and attached to the first version.
- [ ] **App Privacy**: Privacy Policy URL = `<baseUrl>/privacy.html`; data collection = **Data Not Collected**. (See `legal/DATA_MAP.md`.)
- [ ] **Age Rating** questionnaire — answer honestly:
  - Violence, horror, sexual content, profanity, drugs, medical, mature themes: **None**.
  - Gambling / contests: **None** (no simulated casino games, no real-money gambling).
  - **Loot boxes / paid random items: Yes.** This raises the rating above 4+ (Apple sets the exact minimum age). Do not pick “Made for Kids”.
  - Unrestricted web access: **No** (links open in the browser only).
  - Parental controls / age assurance features in the app: **No**.
- [ ] **Version page**: description, promo text, keywords, support URL `<baseUrl>/support.html`, marketing URL `<baseUrl>/index.html`, copyright `© 2026 <your legal name>`, screenshots from `store/screenshots/` (6.9″ iPhone and 13″ iPad sets are required; the 6.5″ set is optional and can be regenerated with `npm run store-shots`).
- [ ] **App Review Information**: your name, phone, email; sign-in required = **No**; paste `store/APP_REVIEW_NOTES.md` into Notes.
- [ ] **Export compliance**: the build already sets `ITSAppUsesNonExemptEncryption = NO` (the app uses only Apple’s built-in HTTPS/StoreKit, which is exempt), so Connect should not ask. If it does: “Uses encryption? Yes → exempt (only standard OS encryption)”. No French/other annual filings are needed for exempt use. ⚖
- [ ] **Content rights**: “Does your app contain, show or access third-party content?” → **No** (all art is procedural, sound is synthesized, the font is OFL and bundled).
- [ ] **Advertising Identifier**: No. **Tracking**: No.
- [ ] Accessibility (optional Nutrition Labels): only claim what is true. The game supports *Reduce Motion*, sufficient text contrast is not guaranteed on all buttons, and it is not VoiceOver-navigable in the pool scene — so do not tick VoiceOver.

## 4. Test before you submit (TestFlight)

- [ ] Internal TestFlight (up to 100 team members, no review): install on **two real devices**, ideally the oldest iPhone you can find that runs iOS 15.
- [ ] Using a **Sandbox Apple ID** (App Store Connect → Users and Access → Sandbox): buy each product once; buy Sea Glass twice; force-quit during a purchase and relaunch; turn on Airplane Mode mid-purchase; delete the app, reinstall and **Restore purchases**; test *Ask to Buy* with a child account in Family Sharing.
- [ ] Play 2 days across midnight; change time zone; set the clock forward/back and confirm rewards can’t be claimed twice.
- [ ] Verify on device (can’t be tested off-device): (a) after a reinstall, finished *consumable* purchases from before the reinstall are **not** re-delivered (expected), (b) a refunded purchase is not clawed back (by design), (c) the Restore button shows Apple’s sign-in sheet when needed.
- [ ] Run through `docs/QA_REPORT.md`’s manual list once.

## 5. Submit

- [ ] Choose the build in the version page, answer “Manual release” (recommended for v1.0), **Add for Review → Submit to App Review**. Typical review: about 1–2 days; the first submission of a game with in-app purchases and random items is examined closely, which is why the odds, limits and off-switch are reachable from the machine itself.
- [ ] If rejected: read the guideline number in Resolution Center. The likely candidates and where the app already answers them: **3.1.1** (odds disclosed — Rates tab + website, purchase confirm, restore button), **5.1.1** (privacy policy + manifest present), **4.2** (minimum functionality — the game has depth), **2.1** (crashes/placeholders — none; the legal pages must be live, hence `npm run legal:check`).

## 6. Territories and local rules ⚖

Paid random items and games are regulated differently by country. The code turns **Sea Glass pulls off** in the countries listed in `src/config.js → NO_PAID_RANDOM` (currently Belgium, where paid loot boxes are treated as illegal gambling, and Brazil as a precaution for minors’ protection rules). Free pulls and Capsule Coins keep working everywhere. Before release decide, with advice for your situation, whether to:

- [ ] **Untick** countries in Pricing and Availability instead of (or as well as) the in-app switch. Consider unticking **mainland China** (games with in-app purchases need a Chinese publishing licence, ISBN and ICP filing), and **South Korea** unless you have completed Korean game rating (GRAC) and business requirements for games.
- [ ] Review rules on paid random items where you sell: **Australia** and **New Zealand** (classification systems), **the UK / EU** (consumer-protection and advertising rules on odds, transparency and children), **the Netherlands**, **Japan** (complete-gacha ban), **Brazil**, **US states** (evolving). Add a country to `NO_PAID_RANDOM` (use both the ISO alpha-2 and alpha-3 code, e.g. `'BE', 'BEL'`) to switch pulls off there.
- [ ] Confirm the **governing law and venue** clauses in the terms (`governingLaw`, `venue` in the config) suit where you live, and that the consumer-rights wording is right for your main markets.
- [ ] Confirm **COPPA / GDPR-K** posture: the app is not in the Kids Category, is not directed to children under 13, and collects no personal information from anyone. If you ever switch to the Kids Category, paid random items, external links and IAP rules change substantially — talk to counsel first.

## 7. After release

- [ ] Add the live App Store link to the website’s home page if you like.
- [ ] Reply to reviews; watch App Store Connect → *Analytics* and *Crashes* (Xcode Organizer) — these are Apple’s own aggregate, anonymous reports and do not change the privacy answers.
- [ ] Renew the Developer Program yearly. Keep the site online for as long as the app is on sale (Apple checks the privacy URL).
- [ ] When you change prices, odds, pity, daily limit, or what the app collects: update `src/data.js` / the templates, `npm run site`, redeploy the site, update the App Store text, and increase **Effective date** in `site.config.json`.
- [ ] Keep the receipts: Apple’s monthly financial reports for your accounts.
