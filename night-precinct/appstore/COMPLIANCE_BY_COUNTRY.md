# Compliance by country

Status date: **30 September 2026**. Written for the owner of {{APP_NAME}} and for the owner's lawyer.

**This is not legal advice.** It is a working summary of legal research, matched against what the game actually does. Laws, court cases and Apple's rules change; every "counsel" item below needs a qualified lawyer in that country, and every date should be checked again before you rely on it.

How this file was made:

- The legal research (dated 30 September 2026) checked pages on developer.apple.com in full. Most other sites could not be fetched from the research environment, so those claims rest on search results that quote or summarize the linked page. Anything not confirmed either way is listed under "Unverified" at the end. The source links are kept in the tables and in the "Sources" section.
- "What the game does" was checked against the game code (`game/src/*.js`) and the native bridge (`docs/NATIVE_BRIDGE.md`), not taken from the research. Where the owner decided differently from what the research recommended, this file follows the owner's decision.
- Apple 3.1.2 subscription disclosures, export compliance, trademarks and the Kids category are covered in `GUIDELINE_COMPLIANCE.md`, `EXPORT_COMPLIANCE_AND_RIGHTS.md` and `AGE_RATING.md` and are not repeated here.

Status words used below:

- **Done**: handled by the build, the listing text or the legal pages in this repository.
- **Owner action**: decided or clear, but the owner has to do it (in App Store Connect, in marketing or in the business). "Owner action: monitor" means nothing is due yet. **Owner decision** marks an owner action that is still an open choice.
- **Counsel**: needs a lawyer's view before you rely on it.

## 1. Summary

### Where the game is not listed

In App Store Connect (Pricing and Availability), untick these storefronts and **turn off automatic availability in new countries and regions**, so that every new storefront is a deliberate decision.

| Storefront | Why it is excluded |
|---|---|
| **Belgium** | Paid loot boxes (bought with money or with bought currency) are treated as illegal games of chance under the Gaming Act. The game sells crates. |
| **Brazil** | Law 15.211/2025 (ECA Digital), in force since 17 Mar 2026, bans loot boxes in games directed at or likely to be accessed by minors. Apple would also rate the game A18 in Brazil. |
| **Mainland China** | Games with in-app purchases need an NPPA game licence (ISBN) through a local publisher. Apple enforces it. |
| **Vietnam** | Decree 147/2024: even offline games need a publishing confirmation through a local entity, and Apple requires the licence number in the Vietnamese description. |
| **Russia** | Apple payments (in-app purchases and renewals) are unavailable there since 1 Apr 2026. |
| **Japan** | Owner decision, 1 Oct 2026. Selling there would need a public Japanese seller notice (responsible person and phone number), a Japanese version of it, and tracking of the unused Gold Badge balance under the Payment Services Act. The game is not listed in Japan. |

### Owner decisions still open

| Storefront | Recommendation |
|---|---|
| **South Korea** | The law expects odds as percentages on the purchase screen and a probability-items notice in ads, and they are expected in Korean (whether Korean is strictly required is unverified). The game is English only. **Exclude until a Korean odds text exists**, or list only with counsel's written OK. |
| **Taiwan** | The online-game contract rules expect odds and a fixed warning sentence in Traditional Chinese. The game is English only, and whether an offline game is covered is unclear. **Exclude until a Traditional Chinese odds text exists**, or list only with counsel's written OK. |
| **Indonesia** | The Indonesia Game Rating System (IGRS) rating is mandatory (enforced since Jan 2026) after registering as an electronic-system operator. **Register and get a rating, or exclude.** How Apple enforces it is unverified. |
| **United States** | Texas (App Store Accountability Act) is being enforced by Apple for new Texas accounts since 4 Jun 2026, and the age-assurance APIs it relies on are **not implemented** in the app. **Before selling in the US**, either ship an update with them or get counsel's view on launching without them (section 2, "United States"). |

### Everywhere the game is listed

- **English only.** The game, the App Store listing and the legal pages exist in English only. The game is translation-ready (`docs/TRANSLATING.md`) but ships no translation, and the Language setting stays hidden until one exists. Where a country expects local-language texts (France, Quebec, Japan, Korea, Taiwan), that is flagged below.
- **Paid random items are on** (`PAID_RANDOM=true` in `game/src/00-platform.js`): crates can be bought with Gold Badges, the Crate Trio daily deal is sold for real money, the Rookie Starter Pack includes 3 Standard crates, and the paid Career Pass track includes Elite and Legend crates.
- **Odds before every purchase that includes crates.** Buying crates with Gold Badges always goes through a confirmation sheet that shows the odds of that crate tier (and the pity rule for Elite and Legend) and an approximate real-money value. The purchase sheets of the Crate Trio, the Starter Pack and Career Pass Premium print the odds of the crate tiers they contain. The full table is in the game (Cases tab, "Drop rates"; Settings, "Crate odds") and on the web (`{{ODDS_URL}}`).
- **Listing line.** The App Store description (en-US) starts with: "Contains loot boxes: in-game purchases include random items (crates). Odds are shown in the game before you buy." Ads, trailers and App Previews must show "In-game purchases (includes random items)" on screen.
- **Real-money value next to Gold Badge prices** in the Store (Boosts and Upgrades, Elite Recruits, cosmetics) and on the crates (Cases tab and the crate confirmation), worked out at the price of the smallest Gold Badge pack (the highest price per badge) in the player's App Store currency.
- **Refunds.** When Apple refunds a purchase and the refund reaches the game, the Gold Badges that purchase gave are removed as far as they have not been spent, the Precinct Patron total goes down by the purchase's reference value, and one-time unlocks (the Auto-Clicker levels and Career Pass Premium) are taken back.
- **Safety net for Belgium and Brazil.** If the App Store country (read from StoreKit through the bridge command `storefront`) or the device region is `BE` or `BR`, the game switches off paid random items: no buying crates with Gold Badges, no Crate Trio, 90 Gold Badges instead of the Starter Pack's 3 crates, and fixed Gold Badges instead of crates on the Career Pass tiers that give them (free track 15, premium track 60, premium tier 30: 400). Free crates earned by playing are unchanged. The App Store country is read at launch and whenever the app comes back to the foreground.
- **No personal data.** The game has no account, no server, no analytics and makes no network requests of its own. App Privacy: Data Not Collected (`APP_PRIVACY.md`).
- **No age check.** The game asks for no age and uses no age-signal API.

## 2. Region by region

### Apple (every storefront)

| Rule | What the game does | Status |
|---|---|---|
| Guideline 3.1.1: apps that sell random items must disclose the odds of each item type before purchase; bought currency must not expire. [Guidelines](https://developer.apple.com/app-store/review/guidelines/) | Odds are printed on every sheet that sells crates (crate confirmation, Crate Trio, Starter Pack, Career Pass Premium). Gold Badges never expire. | Done. Check once in a device build (`SUBMISSION_CHECKLIST.md`, test matrix). |
| 2025 age-rating system (4+ / 9+ / 13+ / 16+ / 18+); answers were due 31 Jan 2026. Loot boxes put a game at **9+ worldwide**, **16+ in Australia** and **A18 in Brazil**. The questionnaire is worldwide; only Korea allows a regional override. [Apple](https://developer.apple.com/news/?id=ks775ehf), [Values](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions), [Set rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating) | Answer the loot-box question **Yes**. Expected result: 9+ worldwide, 16+ in Australia. Brazil is not listed. See `AGE_RATING.md`. | Owner action (answer in ASC) |
| Storefront availability | Exclusions in section 1; automatic availability in new storefronts off. | Owner action |

### European Union (all member states where listed)

| Rule | What the game does | Status |
|---|---|---|
| GDPR: applies only narrowly. The game processes no personal data; support email and web-server logs for the legal pages do. [GDPR Art. 3](https://gdpr-info.eu/art-3-gdpr/) | Privacy policy describes the game (nothing collected), support email and web logs. | Done. Counsel: whether an Art. 27 EU representative is needed (exemption for occasional processing). |
| Digital Services Act trader status. Since 17 Feb 2025 Apple removes EU apps without trader status. [Apple](https://developer.apple.com/news/?id=einwn76m) | Nothing in the app. Address, phone and email are shown on the product page. | Owner action |
| Consumer Rights Directive: withdrawal right for digital content (Art. 16(m)) and the "withdrawal button" (Art. 11a, from 19 Jun 2026). Apple acts as the developer's agent or commissionaire, so the developer may be the "trader". [Dir. 2019/2161](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A32019L2161), [Commission guidance](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:52021XC1229(04)), [Taylor Wessing](https://www.taylorwessing.com/en/insights-and-events/insights/2026/02/withdrawal-button-as-compliance-risk-for-eu-and-non-eu-businesses), [Apple Sched. 2](https://developer.apple.com/support/downloads/terms/schedules/Schedule-2-and-3-English.pdf) | The Purchase Terms state that immediate delivery ends the withdrawal right once the consumer agrees; the game itself shows no separate consent or acknowledgement step, and all payment runs through Apple. | Counsel |
| Unfair Commercial Practices Directive and the CPC Network key principles on in-game virtual currencies (21 Mar 2025; not binding, but how EU consumer authorities say they will enforce): clear prices with the real-money price for items sold for virtual currency; no hidden costs; no forcing people to buy currency they do not want (pack sizes that do not match item prices); pre-contract information; withdrawal right, including for unused currency; fair terms; protect vulnerable players. [Principles PDF](https://commission.europa.eu/document/download/8af13e88-6540-436c-b137-9853e7fe866a_en?filename=Key+principles+on+in-game+virtual+currencies.pdf), [NatLawReview](https://natlawreview.com/article/eu-new-european-consumer-protection-guidelines-virtual-currencies-video-games), [ZwillGen](https://www.zwillgen.com/gaming/cpcn-announces-virtual-currency-consumer-protection-guidelines/) | Approximate real-money value next to every Gold Badge price (smallest-pack rate): the Store, the crates, Rush, Skip tier, streak restore and the offline double or triple. A refund removes the unspent Gold Badges of that purchase. **Not covered:** the packs (80 and up) still do not match the crate prices (30 / 120 / 300); the game does not say "you need N more Gold Badges" before sending the player to the packs. | Done in part. Counsel: whether the remaining gaps matter, and which pack's rate should set the reference value. |
| European Accessibility Act (from 28 Jun 2025). The purchase flow may be an "e-commerce service"; the game itself is not in scope. Microenterprises (under 10 staff and at most EUR 2m turnover or balance sheet) are exempt. [Bird & Bird](https://www.twobirds.com/en/insights/2026/the-impact-of-the-european-accessibility-act-on-online-gaming-and-gaming-devices), [Taylor Wessing](https://www.taylorwessing.com/en/insights-and-events/insights/2025/03/accessibility-in-the-gaming-industry), [exemption](https://www.xictron.com/en/blog/accessibility-act-exemptions-microenterprises-2026/) | The Support page carries a short accessibility statement. | Owner action: confirm microenterprise status. Counsel if not exempt. |
| Digital Fairness Act (loot boxes, virtual currency, minors). Not proposed yet; Commission proposal planned for Q4 2026. [EP train](https://www.europarl.europa.eu/legislative-train/theme-protecting-our-democracy-upholding-our-values/file-digital-fairness-act), [PrivacyLaws](https://www.privacylaws.com/news/eu-proposal-on-digital-fairness-act-expected-by-the-end-of-2026/) | Nothing yet. | Owner action: monitor |

### Belgium

| Rule | What the game does | Status |
|---|---|---|
| Gaming Act: paid loot boxes (bought with money or with bought currency) are games of chance (Gaming Commission); the Antwerp Enterprise Court ruled the same in Jan 2025. [Commission report](https://www.gamingcommission.be/sites/default/files/2021-08/onderzoeksrapport-loot-boxen-Engels-publicatie.pdf), [L. Xiao](https://sites.google.com/view/leon-xiao/policy/belgium) | **Not listed.** Safety net in the build: paid random items off when the App Store country or the device region is `BE` (section 1). | Owner action: untick Belgium. Safety net done. |

### Netherlands

| Rule | What the game does | Status |
|---|---|---|
| No gambling ban for loot boxes (Council of State 2022, EA). ACM guidance on in-game sales: a euro price for every in-game offer, odds per outcome, loot boxes stated in the store listing, no urging children to buy. [ACM](https://acm.nl/nl/publicaties/voorlichting-aan-bedrijven/acm-leidraad/leidraad-bescherming-online-consument/regels-over-in-game-verkopen), [OUP](https://academic.oup.com/ijlit/article/doi/10.1093/ijlit/eaaf011/8196018), [SCL](https://www.scl.org/12540-loot-boxes-are-not-gambling-under-dutch-law/) | Odds per outcome: done. "Contains loot boxes" is the first line of the description: done. Approximate euro value next to Gold Badge prices in the Store and on crates, but not on the smaller buttons listed under the EU row. The Starter Pack timer is truthful (48 hours from first launch). | Done in part. Counsel: the remaining price gaps and a wording review for children. |

### Germany

| Rule | What the game does | Status |
|---|---|---|
| Youth Protection Act (JuSchG) 2021: the USK has counted "in-game purchases + random items" in its ratings since Jan 2023; the section 14a labelling duty sits with the platform. Section 312k BGB requires a cancel button for subscriptions sold online. [USK](https://usk.de/usk-pressemitteilung-umsetzung-neues-jugendschutzgesetz/), [section 14a](https://dejure.org/gesetze/JuSchG/14a.html), [section 312k](https://dejure.org/gesetze/BGB/312k.html) | Apple rates the app. Chief's Club is cancelled in Apple's subscription settings, reachable from Manage Subscription in the game. | Done for ratings (no USK rating found to be needed on Apple; unverified). Counsel: whether section 312k covers subscriptions sold through Apple. |

### France

| Rule | What the game does | Status |
|---|---|---|
| Toubon Law: consumer-facing offers and terms in French. [Toubon Law](https://en.wikipedia.org/wiki/Toubon_Law) | English only (game, listing and legal pages). | Counsel: the risk of selling in France in English only, or a French version of the listing and legal texts. |

### Spain

| Rule | What the game does | Status |
|---|---|---|
| Organic Law on protecting minors online, Art. 5 would bar minors from random-reward mechanisms. **Not in force**; in Congress committee on 29 Sep 2026. [Bill](https://www.congreso.es/public_oficiales/L15/CONG/BOCG/A/BOCG-15-A-52-1.PDF), [status](https://www.teleprensa.com/nacional-3/ponencia-ley-menores-entornos-digitales-continuara-trabajos-congreso-proximas-semanas/202609291307352519558.html) | Nothing yet. If it passes, adding `ES` to `LOOT_BLOCKED_REGIONS` (a one-line code change and a new build) switches off paid random items there, or Spain can be excluded. | Owner action: monitor |

### Italy

| Rule | What the game does | Status |
|---|---|---|
| No loot-box statute. The AGCM enforces the Consumer Code; in Jan 2026 it opened probes of Activision Blizzard over currency that hides the real cost, fixed bundles and weak parental-control defaults. [AGCM](https://en.agcm.it/en/media/press-releases/2026/1/PS13020-PS13039) | As for the EU CPC row: approximate money values shown in the Store and on crates; the pack and price mismatch remains. | Done in part. Counsel (as for the EU row). |

### United Kingdom

| Rule | What the game does | Status |
|---|---|---|
| CAP guidance on advertising in-game purchases (2021, reviewed 2025) and the **CAP Enforcement Notice on loot boxes in app stores** (26 Feb 2026; ASA monitoring since 26 May 2026): put "Contains loot boxes" or "Includes random-item purchases" at the top of the description ("Offers In-App Purchases" alone is not enough); ads and trailers must disclose in-game purchases including random items. The Crate Trio is a loot box bought with real money. [Enforcement Notice](https://www.asa.org.uk/resource/enforcement-notice-disclosure-of-loot-boxes-in-app-stores.html), [CAP guidance](https://www.asa.org.uk/resource/guidance-on-advertising-in-game-purchases.html) | The description starts with "Contains loot boxes: in-game purchases include random items (crates). Odds are shown in the game before you buy." | Description: done. Ads, trailers and App Previews: owner action (show "In-game purchases (includes random items)" on screen). |
| Ukie / DCMS loot-box principles (industry self-regulation, since 18 Jul 2024): controls so under-18s cannot buy without a parent; disclose loot boxes before download; odds; lenient refunds for a child's unauthorised spend. [Wiggin](https://www.wiggin.co.uk/insight/ukie-principles-and-guidance-on-paid-loot-boxes-faqs/), [next.io](https://next.io/news/regulation/loot-box-regulation-11-principles/) | Disclosure before download (listing line) and odds: done. Parental controls are Apple's (Screen Time, Ask to Buy), explained in the Privacy Policy and Purchase Terms. Refunds go through Apple; the game takes back what it can. | Done in part. Counsel: whether Ask to Buy meets principle 1. |
| ICO Children's Code (only where personal data is processed) and the DMCC subscription rules (not in force; expected spring 2027, date unverified). [ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/introduction-to-the-childrens-code/), [Lewis Silkin](https://www.lewissilkin.com/en/insights/2026/04/02/consumer-law-update-subscriptions-regime-delayed-again-to-spring-2027-102mops) | No personal data is processed by the game. | Done (Children's Code). Owner action: monitor the DMCC date. |

### United States

| Rule | What the game does | Status |
|---|---|---|
| COPPA (amended rule effective 23 Jun 2025; compliance date 22 Apr 2026). Not triggered while nothing is collected; the risk is a support email from a child. [Fed. Register](https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule) | Nothing is collected. The Privacy Policy says a parent can ask for a child's email to be deleted. | Done by design. Owner action: a process for support email from children. |
| FTC "dark patterns" orders as precedent: Epic / Fortnite (USD 245M, 2023) and Cognosphere / Genshin Impact (USD 20M, Jan 2025): express consent before charging, no confusing buttons; disclose odds and virtual-currency exchange rates; parental consent before under-16s buy loot boxes. The orders bind only those companies. [Epic](https://www.ftc.gov/news-events/news/press-releases/2023/03/ftc-finalizes-order-requiring-fortnite-maker-epic-games-pay-245-million-tricking-users-making), [Genshin](https://www.ftc.gov/news-events/news/press-releases/2025/01/genshin-impact-game-developer-will-be-banned-selling-lootboxes-teens-under-16-without-parental) | Every purchase goes through the game's own confirmation sheet (Buy and Cancel of equal size) and then Apple's payment sheet. Odds shown. Approximate money value next to Gold Badge prices in the Store and on crates. No age gate for crates. | Done in part. Owner action: decide whether to add an under-16 gate (it needs an age signal the app does not have). |
| Subscriptions: the FTC click-to-cancel rule was vacated (8th Cir., 8 Jul 2025). ROSCA and California's auto-renewal law (AB 2863 amendments, from 1 Jul 2025) still apply. [Crowell](https://www.crowell.com/en/insights/client-alerts/eighth-circuit-cancels-click-to-cancel), [Cooley](https://www.cooley.com/news/insight/2025/2025-06-04-california-automatic-renewal-law-amendments-take-effect-on-july-1-2025) | Terms on the purchase sheet, the Store card and the description; cancellation through Apple (Manage Subscription). | Done per `IAP.md`. Counsel: whether California's annual reminder applies to a weekly plan sold through Apple (unverified). |
| **Texas SB 2420 (App Store Accountability Act)**, all apps. A district court enjoined it on 23 Dec 2025; the 5th Circuit stayed that injunction (about 1 Jun 2026); Apple enforces it for new Texas accounts from **4 Jun 2026**. Developer duties: give the app **and each in-app purchase** an age rating in the statutory bands, with reasons, to the store; use the store's age and consent signals; notify significant changes. Apple asks for the **Declared Age Range API**, the **Significant Change API (PermissionKit)**, **StoreKit `ageRatingCode`** and **consent-withdrawal server notifications**; these need iOS 26.2 or later SDKs. [Apple Jun 2026](https://developer.apple.com/news/?id=sg176nne), [Apple Nov 2025](https://developer.apple.com/news/?id=2ezb6jhj), [Apple Q&A](https://developer.apple.com/support/age-assurance/), [TX Tribune](https://www.texastribune.org/2025/12/23/texas-app-store-child-ban-age-verification/), [TPR](https://www.texaspolicyresearch.com/fifth-circuit-keeps-texas-app-store-law-alive/), [Pillsbury](https://www.pillsburylaw.com/en/news-and-insights/app-store-accountability-act-texas.html) | **Not implemented.** The app targets iOS 16 (the APIs would have to sit behind an availability check), has no server to receive consent-withdrawal notifications, and uses no age signal. | **Owner action and counsel before selling in the US**: ship the age-assurance update, or have counsel assess launching without it. Give each in-app purchase an age rating if ASC asks. |
| Same kind of law in other states. **Utah** HB 498 moves the duties to **6 May 2027** (private suits only; the CCIA dropped its challenge on 21 Apr 2026). **Louisiana** HB 977 moves it to **1 Jul 2027**. **Alabama** HB 161: **1 Jan 2027**. **California** AB 1043 (Digital Age Assurance Act), operative **1 Jan 2027**: request the age signal when the app is downloaded and launched; the developer is then deemed to know the user's age range. [UT HB 498](https://le.utah.gov/Session/2026/bills/enrolled/HB0498.pdf), [LA](https://www.alstonprivacy.com/louisiana-delays-app-store-accountability-effective-date-to-july-2027/), [AL](https://www.hunton.com/privacy-and-cybersecurity-law-blog/alabama-enacts-app-store-accountability-act-requiring-age-verification), [CA AB 1043](https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202520260AB1043) | Not implemented (as for Texas). | Owner action: diary Jan 2027 (CA, AL), May 2027 (UT), Jul 2027 (LA); the Texas update covers most of it. |
| State loot-box bills: New York S10091 and A9044 pending; none enacted that the research found. [NY S10091](https://www.nysenate.gov/legislation/bills/2025/S10091) | Nothing. | Owner action: monitor |

### Canada (Quebec)

| Rule | What the game does | Status |
|---|---|---|
| Charter of the French Language: section 52.1 (software available in French on terms no less favourable) and section 55 (standard-form contracts offered in French first, since 1 Jun 2023). [C-11](https://www.legisquebec.gouv.qc.ca/en/document/cs/c-11), [Gowling](https://gowlingwlg.com/en/insights-resources/articles/2023/bill-96-s-french-first-rule-takes-effect) | English only. The Canada storefront cannot be split by province. | Counsel: the risk of selling in Canada in English only, or a French version of the game, listing and legal texts. |

### Brazil

| Rule | What the game does | Status |
|---|---|---|
| **Law 15.211/2025 (ECA Digital)**: Art. 2 IV defines a loot box as random items or advantages acquired "mediante pagamento" (for payment) without knowing the content beforehand; **Art. 20** bans them in games directed at or likely accessed by minors. **Decree 12.880/2026**: age verification (self-declaration not allowed) or a version for minors with loot boxes removed or off by default. Law in force 17 Mar 2026; decree 18 Mar 2026. Apple rates the game **A18 in Brazil** when "Loot boxes = Yes". Consumer Defense Code Art. 31: offer information in Portuguese. [Law](https://www2.camara.leg.br/legin/fed/lei/2025/lei-15211-17-setembro-2025-797997-publicacaooriginal-176498-pl.html), [Decree](https://www2.camara.leg.br/legin/fed/decret/2026/decreto-12880-18-marco-2026-798813-publicacaooriginal-178481-pe.html), [ConJur](https://www.conjur.com.br/2025-out-15/adultizacao-lei-no-15-211-proibe-caixa-de-recompensas-em-games/), [Baker McKenzie](https://www.bakermckenzie.com/en/insight/publications/2026/03/brazil-regulates-the-children-and-adolescents-online-safety-act), [Mayer Brown](https://www.mayerbrown.com/en/insights/publications/2026/04/enforcement-of-brazils-eca-digital-introduces-new-obligations-for-companies), [Apple](https://developer.apple.com/news/?id=f5zj08ey), [IDEC](https://idec.org.br/pagina-de-livro/artigo-31deg) | **Not listed.** Safety net in the build: paid random items off when the App Store country or the device region is `BR` (section 1). | Owner action: untick Brazil. Safety net done. |

### Mexico and Latin America

| Rule | What the game does | Status |
|---|---|---|
| Mexico: no loot-box law found. The consumer law (LFPC) Art. 76 bis sets duties for online sales. Chile's bill: status unverified. [LFPC](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPC.pdf) | English only; odds, prices and terms shown before purchase. | Owner action (low risk): decide whether English only is acceptable. |

### South Korea

| Rule | What the game does | Status |
|---|---|---|
| **Game Industry Promotion Act, probability items**: Enforcement Decree from 22 Mar 2024 plus the ministry (MCST) guideline; treble damages from Aug 2025. Odds as percentages **on the purchase screen** (a web page may be linked from it), on the website, and a "probability items" notice in ads and promotions. A **domestic agent** is required from 23 Oct 2025 for sales over KRW 1 trillion or an average of at least **1,000 new installs a day**. [Kim & Chang](https://www.kimchang.com/en/insights/detail.kc?sch_section=4&idx=29487), [Legal500](https://www.legal500.com/developments/thought-leadership/punitive-damages-and-other-special-legal-provisions-for-litigation-concerning-probability-based-game-items/), [Hwawoo](https://www.hwawoo.com/newsletter/2025_10_17/251017_eng_g.pdf) | Odds as percentages on every purchase screen that includes crates, and on the web, **in English only**. No Korean ad label. | **Owner decision**: exclude until a Korean odds text exists (recommended), or list with counsel's written OK. |
| Ratings and trade rules: Apple is a GRAC-designated self-rating operator (4+ and 9+ map to the Korean "All" rating; a regional override is possible from 12 Aug 2026). E-Commerce Act dark-pattern rules from 14 Feb 2025. KFTC standard terms give 7-day cancellation of unused paid content. [Apple 2024](https://developer.apple.com/news/?id=7byvco78), [Apple 2026](https://developer.apple.com/news/?id=oj3r9pvw), [Kim & Chang](https://www.kimchang.com/en/insights/detail.kc?sch_section=4&idx=31410), [KFTC terms](https://www.kimchang.com/en/insights/detail.kc?sch_section=4&idx=18042) | Rating through Apple's questionnaire. Refunds through Apple; a refund removes the unspent Gold Badges it gave. | Only if listed: counsel (pop-ups and deal prompts, cancellation of unused content). |

### Japan

**Not listed** (owner decision, 1 Oct 2026). The rules below are kept for reference if that changes.

| Rule | What the game does | Status |
|---|---|---|
| Act on Specified Commercial Transactions (tokushoho): seller page and final-confirmation-screen rules (from 1 Jun 2022); likely applies although Apple acts as agent. [Nao Law](https://nao-lawoffice.jp/venture-startup/platform/online-game1.php), [IkiNavi](https://ikinavi.jp/en/consumer/misleading-online-shopping-screens/) | `legal/japan.html`, section 1: seller, person responsible, address, phone, email, price, timing, delivery, cancellation. **English only.** The tokens `COMPANY_REPRESENTATIVE` and `CONTACT_PHONE` must be filled. | Owner action: Japanese version; fill in the owner details. Counsel: whether the developer is the "seller". |
| Payment Services Act: Gold Badges never expire, so they are a self-issued prepaid instrument. If the unused balance tops **10 million yen on 31 March or 30 September**: notify within 2 months, deposit at least half, give the Art. 13 information. [Shigyo](https://www.shigyo.co.jp/search_post/kinyu/prepaid/issuance-notification/), [Monolith](https://monolith.law/en/general-corporate/payment-services-act-mobile-games-application) | `legal/japan.html`, section 2 gives the Art. 13-type information in English. The balance is stored only on devices, so the game cannot report it. | Owner action: estimate the unused Japanese balance on each 31 Mar and 30 Sep (for example from Japanese sales of Gold Badge packs). Counsel: how to measure it. |
| JOGA gacha guidelines (voluntary) and the kompu gacha (complete-a-set) ban (Consumer Affairs Agency, 2012): odds per item type; no rewards for completing a set. [CAA](https://www.caa.go.jp/policies/policy/representation/fair_labeling/faq/card/), [JOGA](https://japanonlinegame.org/wp-content/uploads/2017/06/JOGA120815-1.pdf) | Odds per item type shown. No reward for completing a set of gear. | Done |

### Mainland China

| Rule | What the game does | Status |
|---|---|---|
| NPPA game licence (ISBN); Apple has enforced it for games with in-app purchases since 30 Jun 2020. [Niko Partners](https://nikopartners.com/apple-will-require-isbns-by-july/) | **Not listed.** | Owner action: untick mainland China. |

### Taiwan

| Rule | What the game does | Status |
|---|---|---|
| Standard-contract rules for online game services (from 1 Jan 2023): odds for paid chance items plus a fixed warning sentence in Traditional Chinese (that it is a chance-based item and buying it does not mean the player gets a specific item; exact wording in the rules). Rating regulations: a Chinese paid-content notice on the download page. The contract rules cover server-connected games, so this offline game may be outside them. [Rules](https://www.rootlaw.com.tw/LawContent.aspx?LawID=A040100051010700-1110810), [MOJ](https://www.moj.gov.tw/2204/2473/2492/152620/post), [Rating regs](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=J0030086) | Odds shown, in English only. No Traditional Chinese warning or listing. | **Owner decision**: exclude until a Traditional Chinese odds text exists (recommended), or list with counsel's written OK. |

### Hong Kong

| Rule | What the game does | Status |
|---|---|---|
| No loot-box law found. [SCMP](https://www.scmp.com/opinion/letters/article/3310247/hong-kong-can-regulate-video-game-loot-boxes-enforcing-its-laws) | Standard build. | Done (nothing required) |

### Australia

| Rule | What the game does | Status |
|---|---|---|
| Classification rules from 22 Sep 2024: paid loot boxes get at least M; simulated gambling gets R18+. Apple (not part of IARC) rates loot-box games **16+** from 18 Jun 2026 and blocks 18+ downloads without age confirmation. [Classification](https://www.classification.gov.au/about-us/media-and-news/news/new-mandatory-minimum-classifications-for-gambling-games-content), [Apple](https://developer.apple.com/news/?id=yrrb45pw), [IARC](https://www.classification.gov.au/for-industry/develop-and-use-classification-tool/use-iarc-global-rating-tool) | Loot boxes answered Yes, so 16+ in Australia. No simulated gambling (crates reveal one reward; no reels, wheel or betting). | Done by design (owner answers the questionnaire). Unverified: whether Apple's own rating satisfies the Classification Act. |

### India

| Rule | What the game does | Status |
|---|---|---|
| Online Gaming Act 2025, in force 1 May 2026: bans online money games; social games register only if notified. [SCC Online](https://www.scconline.com/blog/post/2026/04/23/meity-notified-enforcement-of-promotion-regulation-online-gaming-act-2025/) | Offline game; nothing can be cashed out; Gold Badges have no cash value. | Done (counsel to confirm) |

### Indonesia

| Rule | What the game does | Status |
|---|---|---|
| Indonesia Game Rating System (IGRS): mandatory rating, enforced since Jan 2026, after registering as an electronic-system operator (PSE). [K&K](https://www.kk-advocates.com/news/read/indonesian-game-rating-system-igrs-platform-officially-launched), [Makarim](https://www.makarim.com/news/safe-zone-indonesia-launches-2026-game-rating-system) | No IGRS registration or rating. | **Owner decision**: register and get a rating, or exclude. |

### Vietnam

| Rule | What the game does | Status |
|---|---|---|
| Decree 147/2024 (from 25 Dec 2024): offline G4 games still need a publishing confirmation through a local entity. Apple requires the licence number in the Vietnamese description (4 Feb 2025). [Apple](https://developer.apple.com/news/?id=06h4gf33), [Tilleke](https://www.tilleke.com/insights/a-closer-look-at-vietnams-decree-147-on-internet-services-and-online-information/) | **Not listed.** | Owner action: untick Vietnam. |

### Russia

| Rule | What the game does | Status |
|---|---|---|
| Apple payments unavailable since 1 Apr 2026, including in-app purchases and renewals. [MacRumors](https://www.macrumors.com/2026/04/02/apple-turns-off-payments-in-russia/) | **Not listed.** | Owner action: untick Russia. Counsel: any sanctions questions. |

### Saudi Arabia and the United Arab Emirates

| Rule | What the game does | Status |
|---|---|---|
| Saudi media regulator (GMedia) ratings 3 / 7 / 12 / 16 / 18 / 21, an IARC member. The UAE National Media Authority rates games (since Dec 2025). No Apple-specific step found. [GMedia](https://en.wikipedia.org/wiki/General_Authority_of_Media_Regulation), [UAE](https://gulfnews.com/uae/new-uae-ratings-system-for-films-games-books-1.2176427) | Benign cartoon content; Apple rating only. | Counsel (unverified; low risk) |

## 3. Action list

### Owner

1. **Availability** (ASC > Pricing and Availability): untick Belgium, Brazil, mainland China, Vietnam, Russia and Japan, and turn off automatic availability in new countries and regions.
2. **Decide** on South Korea and Taiwan (recommended: exclude until local-language odds texts exist), Indonesia (IGRS rating or exclude) (Japan: decided, not listed).
3. **United States**: before selling there, ship the age-assurance update (Declared Age Range, PermissionKit significant change, StoreKit `ageRatingCode`, a plan for consent withdrawal without a server) or get counsel's written view on launching without it. Give each in-app purchase an age rating if ASC asks. Diary 1 Jan 2027 (California, Alabama), 6 May 2027 (Utah), 1 Jul 2027 (Louisiana).
4. **Age rating**: answer the loot-box question Yes (`AGE_RATING.md`). Expect 9+ worldwide and 16+ in Australia.
5. **Listing and marketing**: keep "Contains loot boxes: ..." as the first line of the description; every ad, trailer and App Preview shows "In-game purchases (includes random items)" on screen.
6. **EU**: declare trader status (DSA); confirm microenterprise status (Accessibility Act).
7. **Japan**: not listed (owner decision, 1 Oct 2026). If that changes, the old notices page is in git history (`legal/japan.html`); it needs a Japanese version, a public responsible person and phone number, and twice-yearly tracking of unused Gold Badges.
8. **Privacy**: a process for support email, including from children (COPPA), and for web-server logs of the legal pages.
9. **Monitor**: the Spanish minors bill (be ready to add `ES` to `LOOT_BLOCKED_REGIONS` or exclude Spain), the EU Digital Fairness Act proposal (Q4 2026), the UK DMCC subscription rules (spring 2027), New York loot-box bills.
10. **Decide** whether to add an under-16 gate for paid crates in the US (FTC Genshin precedent); it needs an age signal the app does not have today.

### Counsel

1. United States: the risk of launching without the Texas age-assurance APIs, and what "an age rating for each in-app purchase" requires beyond `ageRatingCode`.
2. EU: who is the "trader" for the withdrawal right and the Art. 11a withdrawal button; whether Apple's checkout obtains the Art. 16(m) consent; whether unused Gold Badges must be refundable.
3. EU and Netherlands: whether the remaining price gaps matter (pack sizes that do not match crate prices), and which pack's rate should set the reference value (the game uses the smallest pack).
4. France and Quebec: the risk of selling in English only.
5. UK: whether Ask to Buy meets Ukie principle 1; whether crates bought with Gold Badges (a currency that can be earned or bought) fall under the CAP notice.
6. Germany: section 312k BGB for subscriptions sold through Apple.
7. Japan: whether the developer is the tokushoho "seller"; how to measure a prepaid balance that lives only on devices.
8. South Korea and Taiwan: only if the owner wants to list there in English.
9. US: California's annual reminder for a weekly plan sold through Apple; COPPA handling of support email.
10. GDPR: whether an Art. 27 EU representative is needed.

## 4. Unverified or needs counsel

- **Apple dates for Utah and Louisiana.** Apple's 24 Feb 2026 notice still gives Utah 6 May 2026 and Louisiana 1 Jul 2026; the later state amendments moved both to 2027. What Apple does now in those states is not confirmed.
- **Texas appeal.** The final 5th Circuit ruling on the merits and the exact date of the stay are unverified, and so is what "age rating for each IAP" requires beyond `ageRatingCode`.
- **Brazil scope.** Whether crates earned free, or bought with Gold Badges that can be earned or bought, are "mediante pagamento", and whether Apple's A18 gate satisfies the provider's own age-verification duty. (Moot while Brazil is not listed.)
- **EU withdrawal.** Whether Apple's EU checkout obtains the Art. 16(m) consent or gives a 14-day refund; Apple's terms could not be fetched.
- **CPC reference price.** Which pack's rate should set the real-money equivalent (the game uses the smallest pack, the highest price per badge).
- **Korea.** The exact Korean ad wording ("확률형 아이템 포함" is reported), whether the odds must be in Korean, and how Apple maps loot boxes to a Korean rating in 2026.
- **Taiwan.** Whether an offline game falls under the online-game contract rules, and whether a Taiwan rating mark is needed on the listing.
- **Australia.** Whether Apple's own ratings satisfy the Classification Act.
- **Germany.** Section 312k for in-app subscriptions, and any USK duty on the developer.
- **UK.** Whether hybrid (earned or bought) currency brings crates bought with Gold Badges into the CAP notice, and the start date of the DMCC subscription rules.
- **Other markets.** Mexico's language and price rules, Chile's bill, rating duties in Saudi Arabia and the UAE, sanctions questions for Russia.
- **Japan.** Whether the developer is the tokushoho "seller" given Apple's agent role, and how to measure a prepaid balance that lives only on devices.
- **Indonesia.** How Apple enforces the IGRS rating.
- **EU Accessibility Act.** Whether the Apple-run in-app purchase flow puts any duty on the developer.

## 5. What the build does, for reference

Checked in `game/src/00-platform.js`, `01-data-state.js`, `03-payments.js` and `04-ui.js`:

| Item | Where in the code | Behaviour |
|---|---|---|
| Paid random items switch | `PAID_RANDOM=true` | On. Set to false, every paid random item becomes a fixed reward everywhere. |
| Country safety net | `LOOT_BLOCKED_REGIONS=['BE','BR']`, `crateBuyAllowed()` | Off if the device region (`NP_BOOT.region`, read at launch) or the App Store country (`storefront` bridge command, StoreKit `Storefront.current`, re-read when the app returns to the foreground) is `BE` or `BR`. If StoreKit cannot tell the country, only the device region counts. |
| Crate purchase with Gold Badges | `buyCrate()` | Always a confirmation sheet: odds of that tier, the pity line for Elite and Legend, the price in Gold Badges and "about" the money value. 1 crate: 30 / 120 / 300 Gold Badges; 5 crates: 4.5 times that. |
| Sheets with crates | `purchaseSheet()` with `spec.crates` | Crate Trio: Elite odds. Starter Pack: Standard odds. Career Pass Premium: Elite and Legend odds. |
| Money value | `badgeValue()`, `bvHTML()` | Price of `badges_80` from StoreKit divided by 80, times the Gold Badge price, in the StoreKit currency. Not shown until prices have loaded. |
| Refunds | `refundTx()`, `revokeUnlock()` | Unspent Gold Badges from the refunded purchase removed; Patron total lowered; Auto-Clicker level and Career Pass Premium re-read from Apple and removed if no longer owned. |
| Age signals | none | No age question, no age-range API, no `ageRatingCode`. |

## 6. Sources

All links were collected by the research of 30 September 2026. See the note at the top on how they were checked.

Apple

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Age rating update (news)](https://developer.apple.com/news/?id=ks775ehf)
- [Age ratings values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions)
- [Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating)
- [EU trader status (news)](https://developer.apple.com/news/?id=einwn76m)
- [Schedule 2 and 3](https://developer.apple.com/support/downloads/terms/schedules/Schedule-2-and-3-English.pdf)
- [Texas, June 2026 (news)](https://developer.apple.com/news/?id=sg176nne)
- [Age assurance, November 2025 (news)](https://developer.apple.com/news/?id=2ezb6jhj)
- [Age assurance Q&A](https://developer.apple.com/support/age-assurance/)
- [Brazil (news)](https://developer.apple.com/news/?id=f5zj08ey)
- [Korea 2024 (news)](https://developer.apple.com/news/?id=7byvco78)
- [Korea 2026 (news)](https://developer.apple.com/news/?id=oj3r9pvw)
- [Australia (news)](https://developer.apple.com/news/?id=yrrb45pw)
- [Vietnam (news)](https://developer.apple.com/news/?id=06h4gf33)

European Union

- [GDPR Art. 3](https://gdpr-info.eu/art-3-gdpr/)
- [Directive 2019/2161](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A32019L2161)
- [Commission guidance on the Consumer Rights Directive](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:52021XC1229(04))
- [Taylor Wessing: withdrawal button](https://www.taylorwessing.com/en/insights-and-events/insights/2026/02/withdrawal-button-as-compliance-risk-for-eu-and-non-eu-businesses)
- [CPC key principles on in-game virtual currencies (PDF)](https://commission.europa.eu/document/download/8af13e88-6540-436c-b137-9853e7fe866a_en?filename=Key+principles+on+in-game+virtual+currencies.pdf)
- [NatLawReview: CPC principles](https://natlawreview.com/article/eu-new-european-consumer-protection-guidelines-virtual-currencies-video-games)
- [ZwillGen: CPC principles](https://www.zwillgen.com/gaming/cpcn-announces-virtual-currency-consumer-protection-guidelines/)
- [Bird & Bird: Accessibility Act and gaming](https://www.twobirds.com/en/insights/2026/the-impact-of-the-european-accessibility-act-on-online-gaming-and-gaming-devices)
- [Taylor Wessing: accessibility in gaming](https://www.taylorwessing.com/en/insights-and-events/insights/2025/03/accessibility-in-the-gaming-industry)
- [Microenterprise exemption](https://www.xictron.com/en/blog/accessibility-act-exemptions-microenterprises-2026/)
- [European Parliament legislative train: Digital Fairness Act](https://www.europarl.europa.eu/legislative-train/theme-protecting-our-democracy-upholding-our-values/file-digital-fairness-act)
- [PrivacyLaws: Digital Fairness Act timing](https://www.privacylaws.com/news/eu-proposal-on-digital-fairness-act-expected-by-the-end-of-2026/)

Belgium, Netherlands, Germany, France, Spain, Italy

- [Belgian Gaming Commission report](https://www.gamingcommission.be/sites/default/files/2021-08/onderzoeksrapport-loot-boxen-Engels-publicatie.pdf)
- [L. Xiao: Belgium](https://sites.google.com/view/leon-xiao/policy/belgium)
- [ACM: rules on in-game sales](https://acm.nl/nl/publicaties/voorlichting-aan-bedrijven/acm-leidraad/leidraad-bescherming-online-consument/regels-over-in-game-verkopen)
- [OUP: Dutch loot-box case](https://academic.oup.com/ijlit/article/doi/10.1093/ijlit/eaaf011/8196018)
- [SCL: loot boxes are not gambling under Dutch law](https://www.scl.org/12540-loot-boxes-are-not-gambling-under-dutch-law/)
- [USK press release](https://usk.de/usk-pressemitteilung-umsetzung-neues-jugendschutzgesetz/)
- [JuSchG section 14a](https://dejure.org/gesetze/JuSchG/14a.html)
- [BGB section 312k](https://dejure.org/gesetze/BGB/312k.html)
- [Toubon Law](https://en.wikipedia.org/wiki/Toubon_Law)
- [Spanish minors bill](https://www.congreso.es/public_oficiales/L15/CONG/BOCG/A/BOCG-15-A-52-1.PDF)
- [Spanish minors bill: status](https://www.teleprensa.com/nacional-3/ponencia-ley-menores-entornos-digitales-continuara-trabajos-congreso-proximas-semanas/202609291307352519558.html)
- [AGCM press release](https://en.agcm.it/en/media/press-releases/2026/1/PS13020-PS13039)

United Kingdom

- [ASA Enforcement Notice: loot boxes in app stores](https://www.asa.org.uk/resource/enforcement-notice-disclosure-of-loot-boxes-in-app-stores.html)
- [CAP guidance on advertising in-game purchases](https://www.asa.org.uk/resource/guidance-on-advertising-in-game-purchases.html)
- [Wiggin: Ukie principles FAQs](https://www.wiggin.co.uk/insight/ukie-principles-and-guidance-on-paid-loot-boxes-faqs/)
- [next.io: the 11 principles](https://next.io/news/regulation/loot-box-regulation-11-principles/)
- [ICO Children's Code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/introduction-to-the-childrens-code/)
- [Lewis Silkin: DMCC subscriptions delayed](https://www.lewissilkin.com/en/insights/2026/04/02/consumer-law-update-subscriptions-regime-delayed-again-to-spring-2027-102mops)

United States

- [COPPA rule (Federal Register)](https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule)
- [FTC: Epic Games order](https://www.ftc.gov/news-events/news/press-releases/2023/03/ftc-finalizes-order-requiring-fortnite-maker-epic-games-pay-245-million-tricking-users-making)
- [FTC: Genshin Impact order](https://www.ftc.gov/news-events/news/press-releases/2025/01/genshin-impact-game-developer-will-be-banned-selling-lootboxes-teens-under-16-without-parental)
- [Crowell: click-to-cancel vacated](https://www.crowell.com/en/insights/client-alerts/eighth-circuit-cancels-click-to-cancel)
- [Cooley: California auto-renewal amendments](https://www.cooley.com/news/insight/2025/2025-06-04-california-automatic-renewal-law-amendments-take-effect-on-july-1-2025)
- [Texas Tribune: injunction](https://www.texastribune.org/2025/12/23/texas-app-store-child-ban-age-verification/)
- [Texas Policy Research: 5th Circuit](https://www.texaspolicyresearch.com/fifth-circuit-keeps-texas-app-store-law-alive/)
- [Pillsbury: Texas App Store Accountability Act](https://www.pillsburylaw.com/en/news-and-insights/app-store-accountability-act-texas.html)
- [Utah HB 498](https://le.utah.gov/Session/2026/bills/enrolled/HB0498.pdf)
- [Louisiana delay](https://www.alstonprivacy.com/louisiana-delays-app-store-accountability-effective-date-to-july-2027/)
- [Alabama act](https://www.hunton.com/privacy-and-cybersecurity-law-blog/alabama-enacts-app-store-accountability-act-requiring-age-verification)
- [California AB 1043](https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202520260AB1043)
- [New York S10091](https://www.nysenate.gov/legislation/bills/2025/S10091)

Canada, Brazil, Mexico

- [Charter of the French Language (C-11)](https://www.legisquebec.gouv.qc.ca/en/document/cs/c-11)
- [Gowling: French-first rule](https://gowlingwlg.com/en/insights-resources/articles/2023/bill-96-s-french-first-rule-takes-effect)
- [Brazil Law 15.211/2025](https://www2.camara.leg.br/legin/fed/lei/2025/lei-15211-17-setembro-2025-797997-publicacaooriginal-176498-pl.html)
- [Brazil Decree 12.880/2026](https://www2.camara.leg.br/legin/fed/decret/2026/decreto-12880-18-marco-2026-798813-publicacaooriginal-178481-pe.html)
- [ConJur: loot-box ban](https://www.conjur.com.br/2025-out-15/adultizacao-lei-no-15-211-proibe-caixa-de-recompensas-em-games/)
- [Baker McKenzie: ECA Digital](https://www.bakermckenzie.com/en/insight/publications/2026/03/brazil-regulates-the-children-and-adolescents-online-safety-act)
- [Mayer Brown: ECA Digital enforcement](https://www.mayerbrown.com/en/insights/publications/2026/04/enforcement-of-brazils-eca-digital-introduces-new-obligations-for-companies)
- [IDEC: Consumer Defense Code Art. 31](https://idec.org.br/pagina-de-livro/artigo-31deg)
- [Mexico LFPC](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPC.pdf)

Asia-Pacific and Middle East

- [Kim & Chang: probability items](https://www.kimchang.com/en/insights/detail.kc?sch_section=4&idx=29487)
- [Legal500: punitive damages for probability items](https://www.legal500.com/developments/thought-leadership/punitive-damages-and-other-special-legal-provisions-for-litigation-concerning-probability-based-game-items/)
- [Hwawoo: domestic agent](https://www.hwawoo.com/newsletter/2025_10_17/251017_eng_g.pdf)
- [Kim & Chang: dark patterns](https://www.kimchang.com/en/insights/detail.kc?sch_section=4&idx=31410)
- [Kim & Chang: KFTC standard terms](https://www.kimchang.com/en/insights/detail.kc?sch_section=4&idx=18042)
- [Nao Law: tokushoho and online games](https://nao-lawoffice.jp/venture-startup/platform/online-game1.php)
- [IkiNavi: final confirmation screens](https://ikinavi.jp/en/consumer/misleading-online-shopping-screens/)
- [Shigyo: prepaid issuance notification](https://www.shigyo.co.jp/search_post/kinyu/prepaid/issuance-notification/)
- [Monolith: Payment Services Act and mobile games](https://monolith.law/en/general-corporate/payment-services-act-mobile-games-application)
- [Consumer Affairs Agency: kompu gacha](https://www.caa.go.jp/policies/policy/representation/fair_labeling/faq/card/)
- [JOGA guidelines](https://japanonlinegame.org/wp-content/uploads/2017/06/JOGA120815-1.pdf)
- [Niko Partners: Apple and ISBNs](https://nikopartners.com/apple-will-require-isbns-by-july/)
- [Taiwan online game contract rules](https://www.rootlaw.com.tw/LawContent.aspx?LawID=A040100051010700-1110810)
- [Taiwan Ministry of Justice](https://www.moj.gov.tw/2204/2473/2492/152620/post)
- [Taiwan rating regulations](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=J0030086)
- [SCMP: Hong Kong](https://www.scmp.com/opinion/letters/article/3310247/hong-kong-can-regulate-video-game-loot-boxes-enforcing-its-laws)
- [Australian Classification: gambling content](https://www.classification.gov.au/about-us/media-and-news/news/new-mandatory-minimum-classifications-for-gambling-games-content)
- [Australian Classification: IARC tool](https://www.classification.gov.au/for-industry/develop-and-use-classification-tool/use-iarc-global-rating-tool)
- [SCC Online: India Online Gaming Act](https://www.scconline.com/blog/post/2026/04/23/meity-notified-enforcement-of-promotion-regulation-online-gaming-act-2025/)
- [K&K: Indonesia IGRS](https://www.kk-advocates.com/news/read/indonesian-game-rating-system-igrs-platform-officially-launched)
- [Makarim: Indonesia IGRS](https://www.makarim.com/news/safe-zone-indonesia-launches-2026-game-rating-system)
- [Tilleke: Vietnam Decree 147](https://www.tilleke.com/insights/a-closer-look-at-vietnams-decree-147-on-internet-services-and-online-information/)
- [MacRumors: Apple payments in Russia](https://www.macrumors.com/2026/04/02/apple-turns-off-payments-in-russia/)
- [GMedia (Saudi Arabia)](https://en.wikipedia.org/wiki/General_Authority_of_Media_Regulation)
- [Gulf News: UAE ratings](https://gulfnews.com/uae/new-uae-ratings-system-for-films-games-books-1.2176427)
