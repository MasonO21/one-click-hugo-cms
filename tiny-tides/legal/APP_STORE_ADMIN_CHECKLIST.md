# App Store admin checklist — everything that is not code

The code, the legal pages and the store text are done. These are the steps only **you** can do (they need your identity, your bank, or your Mac). Tick them in order. Apple’s screens get renamed from time to time; the *intent* of each step stays the same.

> This list reflects Apple’s requirements as generally published and common practice. It is not legal or tax advice. Items marked **⚖** are worth a short conversation with a lawyer or accountant in your country.

## 0. Before anything else (30 minutes)

- [ ] **Decide who the publisher is** — you as an individual, or a company (an LLC is common; needs a D-U-N-S number, free from Dun & Bradstreet, which can take days). **The name you pick appears on the App Store as the seller in every country, and no territory choice can hide it.** If you don’t want your personal legal name public, publish as an LLC (its name shows instead). ⚖
- [ ] Fill in **`legal/site.config.json`**: the support email (`maceion@proton.me`) and country (United States of America) are already set. Add your legal name (or LLC name) and your **US state** (the terms use that state’s law and courts). **No street address or phone number is published anywhere**: the website and terms show only name, country and email, and the App Store uses Apple’s standard license agreement. `npm run legal:check` lists anything still missing. ⚖ Some consumer laws (for example California’s online-seller disclosure) expect a postal address on request; a PO box or virtual mailbox covers that without using your home address.
- [ ] **Check the name “Tiny Tides”.** Search App Store, Google Play, the USPTO (tmsearch.uspto.gov), EUIPO and WIPO Global Brand Database for conflicts in games (class 9 / 41). If it’s taken you only need to change `appName` in the config, the display name in `ios/App/App/Info.plist`, and the App Store name. ⚖
- [ ] **Register a domain or choose free hosting**, publish `site/` (see `legal/README.md`), and set `baseUrl`. Open every page on a phone.

## 1. Apple accounts and agreements

- [ ] Enroll in the **Apple Developer Program** (developer.apple.com/programs, US$99/year; enrollment can take from minutes to a few days, longer for organizations).
- [ ] App Store Connect → **Business** (Agreements, Tax and Banking):
  - [ ] Accept the **Paid Applications Agreement** (required even though the app is free, because it has in-app purchases).
  - [ ] Add **bank account** and complete the **tax forms** (US individuals: W-9; others: W-8BEN/W-8BEN-E, and any local tax IDs Apple asks for). ⚖
- [ ] **EU Digital Services Act “trader” status** (Business → Compliance): not needed for Tiny Tides, because the app is **not sold in the EU** (section 6). If App Store Connect still asks, answer honestly; with every EU country unticked, the app isn’t offered there either way.
- [ ] Optional: join the **App Store Small Business Program** (15% commission instead of 30% while proceeds are under US$1M/year).

## 2. Identifiers and project (needs a Mac with Xcode)

> **No Mac?** Follow `docs/BUILD_WITHOUT_A_MAC.md` instead of this section and section 4’s Xcode steps: a GitHub-hosted Mac builds the app and uploads it to TestFlight for you. (App Store Connect’s *Safari Web Extension Packager* is for Safari browser add-ons and isn’t used for this game.)

- [ ] `npm ci` (this also applies the StoreKit patch), then **`npm run rename -- com.yourname.tinytides`** if you want a different bundle id (it updates Xcode, Capacitor, the StoreKit test file and the legal config together). Keep it lower-case, reverse-domain, and permanent — it can never change after release.
- [ ] `npm run ios:sync`, `npm run ios:open`, then in Xcode: **Signing & Capabilities** → select your Team (also put the same 10-character Team ID into `ios/ExportOptions.plist`, replacing `YOURTEAMID`) → keep **Automatic signing** on. Capabilities: *In-App Purchase* and *Declared Age Range* (the entitlement file `ios/App/App/App.entitlements` is already wired in; if Xcode shows a signing error, click **+ Capability → Declared Age Range** once so your App ID gets it). No Push, iCloud or Sign in with Apple are needed.
- [ ] Build with **Xcode 26.2 or later** (iOS 26.2 SDK). Apple requires it for the age-assurance APIs, and the project weak-links the `DeclaredAgeRange` framework so the app still runs on iOS 15–25. On an iOS 15–18 device, launch the app once to confirm it starts normally.
- [ ] Set **Version 1.0.0 / Build 1** (Xcode → App target → General), deployment target iOS 15.
- [ ] **Product → Archive** → *Distribute App* → *App Store Connect* → *Upload*.
- [ ] Xcode → Organizer → the archive → **Generate Privacy Report** and confirm it matches `legal/DATA_MAP.md` (no tracking, no collected data).

## 3. App Store Connect → My Apps → New App

- [ ] Platform iOS · Name (30 chars max) · Primary language English (U.S.) · Bundle ID (from the list) · SKU (any unique string, e.g. `tinytides-ios-1`).
- [ ] **App Information**: Category *Games* → primary *Simulation* (secondary *Casual*, optional). Subtitle and keywords: `store/APP_STORE_LISTING.md`. **License Agreement: leave Apple’s standard EULA** (don’t add a custom one: a custom EULA must include your address and phone). The terms page adds the game’s own rules and is linked from the app and the listing.
- [ ] **Pricing and Availability**: Free. Choose countries (see section 6 first!).
- [ ] **In-App Purchases** (Monetization → In-App Purchases → “+”): create the 10 products exactly as listed in `store/iap-products.md` — product **ID**, type (Consumable / Non-Consumable), price tier, display name, description, and a **review screenshot** of the Shop for each (any screenshot of the item’s card in the Shop, 640×920 or larger). Products must be in “Ready to Submit” and attached to the first version.
- [ ] **App Privacy**: Privacy Policy URL = `<baseUrl>/privacy.html`; data collection = **Data Not Collected**. (See `legal/DATA_MAP.md`.)
- [ ] **Age Rating** questionnaire — answer honestly:
  - Violence, horror, sexual content, profanity, drugs, medical, mature themes: **None**.
  - Gambling / contests: **None** (no simulated casino games, no real-money gambling).
  - **Loot boxes / paid random items: Yes.** This raises the rating above 4+. Apple sets the exact minimum age per country (at the time of writing: 9+ in most countries, 16+ in Australia and 18+ in Brazil). Do not pick “Made for Kids”.
  - Unrestricted web access: **No** (links open in the browser only).
  - **Parental controls: Yes** (a parental gate for Sea Glass pulls and real-money purchases for players under 18, plus the in-game off switch). **Age assurance: Yes** (Apple’s Declared Age Range on iOS 26+, otherwise a neutral date-of-birth screen; only “adult / under 18” is kept on the device).
- [ ] **Version page**: description, promo text, keywords, support URL `<baseUrl>/support.html`, marketing URL `<baseUrl>/index.html`, copyright `© 2026 <your legal name>`, screenshots from `store/screenshots/` (6.9″ iPhone and 13″ iPad sets are required; the 6.5″ set is optional and can be regenerated with `npm run store-shots`).
- [ ] **App Review Information**: your name, phone, email (seen only by Apple’s reviewers, never published); sign-in required = **No**; paste `store/APP_REVIEW_NOTES.md` into Notes.
- [ ] **Export compliance**: the build already sets `ITSAppUsesNonExemptEncryption = NO` (the app uses only Apple’s built-in HTTPS/StoreKit, which is exempt), so Connect should not ask. If it does: “Uses encryption? Yes → exempt (only standard OS encryption)”. No French/other annual filings are needed for exempt use. ⚖
- [ ] **Content rights**: “Does your app contain, show or access third-party content?” → **No** (all art is procedural, sound is synthesized, the font is OFL and bundled).
- [ ] **Advertising Identifier**: No. **Tracking**: No.
- [ ] Accessibility (optional Nutrition Labels): only claim what is true. The game supports *Reduce Motion*, sufficient text contrast is not guaranteed on all buttons, and it is not VoiceOver-navigable in the pool scene — so do not tick VoiceOver.

## 4. Test before you submit (TestFlight)

- [ ] Internal TestFlight (up to 100 team members, no review): install on **two real devices**, ideally the oldest iPhone you can find that runs iOS 15.
- [ ] **Age check:** on an iOS 26 device, make the first Sea Glass pull and confirm Apple’s age-range sheet appears. On an older device, confirm the date-of-birth screen appears. Pick an under-18 date on a second test install and confirm pulls stay off until the parent question is answered.
- [ ] Using a **Sandbox Apple ID** (App Store Connect → Users and Access → Sandbox): buy each product once; buy Sea Glass twice; force-quit during a purchase and relaunch; turn on Airplane Mode mid-purchase; delete the app, reinstall and **Restore purchases**; test *Ask to Buy* with a child account in Family Sharing.
- [ ] Play 2 days across midnight; change time zone; set the clock forward/back and confirm rewards can’t be claimed twice.
- [ ] Verify on device (can’t be tested off-device): (a) after a reinstall, finished *consumable* purchases from before the reinstall are **not** re-delivered (expected), (b) a refunded purchase is not clawed back (by design), (c) the Restore button shows Apple’s sign-in sheet when needed.
- [ ] Run through `docs/QA_REPORT.md`’s manual list once.

## 5. Submit

- [ ] Choose the build in the version page, answer “Manual release” (recommended for v1.0), **Add for Review → Submit to App Review**. Typical review: about 1–2 days; the first submission of a game with in-app purchases and random items is examined closely, which is why the odds, limits and off-switch are reachable from the machine itself.
- [ ] If rejected: read the guideline number in Resolution Center. The likely candidates and where the app already answers them: **3.1.1** (odds disclosed — Rates tab + website, purchase confirm, restore button), **5.1.1** (privacy policy + manifest present), **4.2** (minimum functionality — the game has depth), **2.1** (crashes/placeholders — none; the legal pages must be live, hence `npm run legal:check`).

## 6. Territories and local rules ⚖

Researched September 2026. Laws on paid random items (“loot boxes”) and minors change quickly, so re-check before release and ask a lawyer about the markets that matter to you. The game ships in **English only**, and the App Store shows the English listing in every country you sell in.

**Already handled in the app**
- Belgium and Brazil: Sea Glass capsule pulls are switched off (`src/regions.js → NO_PAID_RANDOM`). Free pulls and Capsule Coins still work.
- Japan: rewards for completing capsule sets are switched off (`NO_SET_REWARDS`, the “kompu gacha” rule).
- Everywhere: odds are shown before any purchase, there is a daily cap and an off switch, and every Sea Glass spend shows the approximate real-money price (EU consumer-protection guidance). Before the first paid pull the app checks age; players under 18 need a parent’s OK for paid pulls and real-money purchases.
- **Texas (SB 2420, in force since 4 June 2026):** where Apple reports that age assurance is required, the app asks Apple’s Declared Age Range at launch and applies the under-18 protections. Similar laws take effect in **Utah (6 May 2027), Louisiana (1 July 2027), Alabama (1 January 2027) and California (AB 1043, 1 January 2027)**. The same code covers them, but re-check Apple’s guidance before each date. If a future update is a “significant change” under these laws, Apple’s `showSignificantUpdateAcknowledgment` API must be added. ⚖

**Untick these 37 territories** in App Store Connect → your app → **Pricing and Availability** (decided: any country that adds a licence, registration, local representative, local-language notice, extra paperwork or a ban on paid random items is left out; so is any country where in-app purchases don’t work or where Apple must publish your personal details; and the whole European Union is left out). You can add a country back later, after sorting out its requirements.

*Outside the EU (10):*
- [ ] **China mainland**: every game needs a government publishing licence (ISBN/“banhao”) through a Chinese publisher.
- [ ] **Vietnam**: games need a local licence.
- [ ] **Indonesia**: Electronic System Provider (PSE) registration and an IGRS game rating.
- [ ] **Russia**: App Store payments there stopped on 1 April 2026, so in-app purchases can’t be bought.
- [ ] **Belarus**: precaution. Sanctions are cutting Belarusian bank cards off from Apple’s payments, and App Store purchases there may stop the way they did in Russia.
- [ ] **Brazil**: paid loot boxes are banned in games minors can use (ECA Digital, March 2026), and a Brazilian legal representative is required.
- [ ] **South Korea**: the probability-item notice must appear in Korean on the listing, in the game and in ads, and a Korean game rating is needed.
- [ ] **Japan**: Apple requires a seller-information page (特定商取引法) for apps with in-app purchases; complete-gacha and prepaid-balance rules also apply.
- [ ] **Saudi Arabia**: the media regulator (GAMR, formerly GCAM) may require a Saudi game classification even for games sold through the App Store.
- [ ] **United Arab Emirates**: the UAE Media Council runs its own age classification for games, mobile included.

*The whole European Union (27):* Austria, **Belgium** (it also treats paid loot boxes as illegal gambling), Bulgaria, Croatia, Cyprus, Czechia, Denmark, Estonia, Finland, France, Germany, Greece, Hungary, Ireland, Italy, Latvia, Lithuania, Luxembourg, Malta, Netherlands, Poland, Portugal, Romania, Slovakia, Slovenia, Spain, Sweden.
- [ ] All 27 unticked. This avoids the Digital Services Act trader listing (your name, address, phone and email shown publicly), EU consumer-law and loot-box rules, and pending EU laws (Poland’s draft gambling-licence rule, the Digital Fairness Act). Norway, Iceland and Liechtenstein aren’t in the EU and stay ticked; untick them too if you want all of Europe’s single market out.

**Where Apple publishes a developer’s personal details** (checked against App Store Connect’s compliance pages, October 2026): the **EU** (Digital Services Act: name, address, phone, email), **China mainland** (company registration details) and **South Korea** (only for developers based in Korea). All are unticked above. Everywhere else the App Store shows only the seller name (see section 0 for keeping your personal name off it). The tax-reporting forms Apple collects (DAC7, Canada’s ITA, MRDP, SERR) are sent to tax authorities, not published.

Keep everything else ticked. The in-app switches (no paid pulls in Belgium and Brazil, no set rewards in Japan) stay in the code as a backup, for example for a player whose Apple ID later moves to one of these countries.

**Countries you keep, and why they need nothing extra**
- **United States, UK, Canada, Australia, New Zealand and the rest:** the odds disclosure, spending limits, age check, parental gate and purchase notices already in the app cover them. Prizes can’t be traded or cashed out, so keep it that way.
- **Watch list (no action now):** if a country you sell in later bans or licenses paid random items, untick it or turn off paid pulls there (`src/regions.js`).

- [ ] Confirm the governing-law clause (the **state** in `site.config.json`) and the consumer-rights wording suit your main markets.
- [ ] Confirm the **COPPA / GDPR-K** position: the app is not in the Kids Category, is not directed to children under 13, and collects no personal information from anyone (the age check keeps only “adult / under 18” on the device). If you ever move to the Kids Category, talk to counsel first.
- [ ] **US consumer protection:** the FTC’s 2025 order against HoYoverse (Genshin Impact) expects odds, real-money exchange rates and parental consent for under-16 loot-box purchases. The app provides all three (it asks consent for anyone under 18). New York’s action against Valve concerned tradable prizes; our prizes can’t be traded or cashed out, so keep it that way.

## 7. After release

- [ ] Add the live App Store link to the website’s home page if you like.
- [ ] Reply to reviews; watch App Store Connect → *Analytics* and *Crashes* (Xcode Organizer) — these are Apple’s own aggregate, anonymous reports and do not change the privacy answers.
- [ ] Renew the Developer Program yearly. Keep the site online for as long as the app is on sale (Apple checks the privacy URL).
- [ ] When you change prices, odds, pity, daily limit, or what the app collects: update `src/data.js` / the templates, `npm run site`, redeploy the site, update the App Store text, and increase **Effective date** in `site.config.json`.
- [ ] Keep the receipts: Apple’s monthly financial reports for your accounts.
