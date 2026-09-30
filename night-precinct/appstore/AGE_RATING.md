# Age rating questionnaire answers

Source of truth: `docs/FACTS.md` section 5 (content descriptors) and sections 3 and 4 (purchases and crates). Regional rules are in `COMPLIANCE_BY_COUNTRY.md`.

**Read this first.** Apple's current age-rating system (introduced in 2025) uses the ratings 4+ / 9+ / 13+ / 16+ / 18+, and answers to the new questionnaire were due by 31 January 2026 for existing apps. The research of 30 September 2026 read Apple's pages on this directly ([Apple news](https://developer.apple.com/news/?id=ks775ehf), [Age ratings values and definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions), [Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating)). What it found:

- The questionnaire has a **loot-box** item. A "Yes" puts an app at **9+** worldwide.
- In **Australia**, Apple rates loot-box apps **16+** (from 18 June 2026) ([Apple](https://developer.apple.com/news/?id=yrrb45pw)).
- In **Brazil**, Apple rates them **A18** ([Apple](https://developer.apple.com/news/?id=f5zj08ey)). The game is not listed in Brazil, so this does not apply.
- The questionnaire is answered once for every storefront. Only South Korea allows a regional override of the result.
- Apple's definition of **Contests** covers the achievement of personal goals, not only competitions with prizes (see the Contests row below).

The question wording below is paraphrased. Match the meaning of each answer to what App Store Connect (ASC) actually shows, and answer honestly. If a question is not listed here, answer it from the same facts.

Where to answer: ASC > your app > App Information > Age Rating (Edit). Apple calculates the rating from your answers and shows it before you save.

## Answers

Most questions use a frequency scale (None / Infrequent / Frequent). **Verify wording in App Store Connect.**

### In-app controls

| Question | Answer | Justification |
|---|---|---|
| Parental Controls (does the app include parental controls?) | No | The app has no parental-control feature of its own. Players and parents use Apple's Screen Time and Ask to Buy. |
| Age Assurance (does the app verify or estimate the user's age?) | No | No accounts, no age question, no age-range API, no age data. See "Age-assurance laws" below. |

### Capabilities

| Question | Answer | Justification |
|---|---|---|
| Unrestricted Web Access | **No** | The game runs from bundled local files. It has no address bar and no way to browse. The only links open a browser view (`SFSafariViewController`) on fixed pages: Terms of Use, Privacy Policy, Purchase Terms, crate odds, support, the notices page (Credits > Full notices) and Apple's subscription-management page. The native shell accepts any `https` address from the page, but the game only ever sends those configured ones. |
| User-Generated Content | **No** | Players cannot create, upload or share anything. No names, no text entry shown to others, no sharing. |
| Messaging and Chat | No | No chat, no messaging, no multiplayer. |
| Advertising | No | There are no ads and no ad SDK (`docs/FACTS.md` section 3; no ad, analytics or other third-party code exists in `game/src` or `ios/`). |

### Medical or wellness

| Question | Answer | Justification |
|---|---|---|
| Medical or Treatment Information | None | The EMS world is a cartoon idle game. Patients are marked "SAVED". No medical information, procedures, dosages or advice are given (`docs/FACTS.md` section 5: no medical advice). The flavor text has jokes about bandages, defibrillators and similar (for example "restarted a heart with two paddles") but no instructions. |
| Health or Wellness Topics | None | The app does not deal with health, fitness or wellbeing topics. |

### Sexuality and nudity

| Question | Answer | Justification |
|---|---|---|
| Mature or Suggestive Themes | None | No such content. |
| Sexual Content or Nudity / Graphic Sexual Content and Nudity | None | No such content. |

### Violence

| Question | Answer | Justification |
|---|---|---|
| Cartoon or Fantasy Violence | None (see note) | `docs/FACTS.md` section 5: no violence is shown. Crooks are cuffed ("BUSTED"), fires are put out ("DOUSED"), patients are treated ("SAVED"). No blood, no injuries. |
| Realistic Violence | None | Nothing realistic is depicted. |
| Prolonged Graphic or Sadistic Realistic Violence | None | Nothing of the kind. |
| Guns or Other Weapons | None | `docs/FACTS.md` says no weapons are shown being fired. No gun, knife or similar prop is drawn in the game art (the scene and portrait drawing code, `game/src/02-art-scene.js`, has none). Some Gear-Up upgrades have weapon-like names as text only ("Stun Baton", "Taser X2", "Quick-Draw Holster", and cannon-style names in the fire and EMS worlds), shown with a handcuff or generic icon. If the question covers references as well as depictions, or you want to be cautious, answer Infrequent. |

**Note on cartoon violence.** The loot-box answer already puts the game at 9+, so a mild violence answer is not what sets the rating. Answer None, or Infrequent if you read chasing and cuffing crooks (the main button reads "ARREST!", and the scene shows "BUSTED" pop-ups and running bounty targets) as mild cartoon conflict. Over-declaring is safe; under-declaring risks a rejection or a forced change later.

### Language, horror, substances

| Question | Answer | Justification |
|---|---|---|
| Profanity or Crude Humor | None | No profanity or crude humor (`docs/FACTS.md` section 5). |
| Horror or Fear Themes | None | Cartoon fires and crooks, nothing frightening. |
| Alcohol, Tobacco or Drug Use or References | None | None (`docs/FACTS.md` section 5). |

### Chance-based activities

| Question | Answer | Justification |
|---|---|---|
| Gambling (real-money gambling) | **No** | No real-money gambling of any kind (`docs/FACTS.md` section 5). Gold Badges have no cash value and cannot be sold, transferred or exchanged. |
| Simulated Gambling (casino-style games, poker, slots, betting) | None | There are no simulated casino games. Crates are opened for rewards, not bet on. The opening screen is a single pop-up that reveals one reward with one icon scaling in (no reels, wheel or betting); if that changes, answer honestly. |
| Loot Boxes | **Yes** | Decided. Crates give randomized rewards (cash, Gold Badges, gear). They are earned free, bought with Gold Badges (which are sold for real money), and included in paid products: the Crate Trio daily deal, the Rookie Starter Pack (3 Standard crates) and the Career Pass Premium track. Odds are shown in the game before every purchase that includes crates and at `{{ODDS_URL}}` (`docs/FACTS.md` section 4). Expected effect: 9+ worldwide, 16+ in Australia. |
| Contests | None, unless the definition says otherwise (see justification) | There are no competitions between players, no leaderboards, no prizes of real value and no sweepstakes. Apple's definition of Contests also covers the achievement of personal goals; the game has achievements (Service Record) and Career Pass tiers that pay in-game rewards. Read the definition shown in ASC: if it clearly covers personal-goal rewards of this kind, answer Infrequent rather than None, and check the calculated rating before you save. |

### In-app purchases and spending

| Item | Answer | Justification |
|---|---|---|
| Does the app offer in-app purchases? | Yes | 16 Apple In-App Purchase products: 10 consumables, 5 non-consumables and 1 auto-renewable subscription (`IAP.md`). Prices range from 0.99 to 99.99 (USD, intended), and the subscription is 4.99 per week. Apple shows "Offers In-App Purchases" on the product page automatically. |
| Random items bought with money | Covered by the Loot Boxes answer | The description also starts with "Contains loot boxes: in-game purchases include random items (crates). Odds are shown in the game before you buy." (UK ASA enforcement notice; see `COMPLIANCE_BY_COUNTRY.md`). |
| Does the game encourage spending? | Say so plainly | Purchases can speed up progress, and lifetime spending unlocks a permanent income bonus (Precinct Patron). This is stated in the description and the review notes. |
| Age rating for each in-app purchase | Only if ASC asks | Texas law expects an age rating for the app and each in-app purchase (see below). If ASC offers a per-product rating, give each product the app's rating unless it asks for something else. |

### Not in the app (answer No or None if asked)

Web browsing, social features, location sharing, contacts, camera or microphone use, photos, notifications, health data, account creation, user reviews or comments, dating or mature content.

## Expected rating

- **9+** worldwide, because of the loot-box answer. A higher answer elsewhere (for example on violence or contests) could raise it; ASC shows the result.
- **16+ in Australia**, where Apple rates loot-box apps 16+.
- **Brazil**: A18 for loot-box apps, but the game is not listed there.
- **South Korea**: Apple is a self-rating operator designated by the Korean rating body (GRAC); 4+ and 9+ map to the Korean "All" rating, and a regional override is possible from 12 August 2026 ([Apple 2024](https://developer.apple.com/news/?id=7byvco78), [Apple 2026](https://developer.apple.com/news/?id=oj3r9pvw)). Whether to list in Korea is an open owner decision (`COMPLIANCE_BY_COUNTRY.md`).
- ASC displays the calculated rating before you save. Accept it. Do not change answers to get a lower number. You may choose a higher rating if you want to be more conservative; you cannot go below the calculated one. Apple may also adjust the rating during review if it disagrees with an answer.

## Age-assurance laws (open item)

Several US states require app stores and developers to use age and parental-consent signals. **The app implements none of Apple's age-assurance APIs** (Declared Age Range, the PermissionKit significant-change API, StoreKit `ageRatingCode`, and the consent-withdrawal server notifications). They need iOS 26.2 or later SDKs, the app targets iOS 16, and it has no server to receive notifications.

- **Texas** (SB 2420, App Store Accountability Act): Apple enforces it for new Texas accounts from 4 June 2026, after the 5th Circuit stayed the district court's injunction (about 1 June 2026). ([Apple](https://developer.apple.com/news/?id=sg176nne), [Apple Q&A](https://developer.apple.com/support/age-assurance/))
- **Alabama** (HB 161) and **California** (AB 1043): 1 January 2027. **Utah** (HB 498): 6 May 2027. **Louisiana** (HB 977): 1 July 2027.
- **Owner and counsel action before selling in the US**: ship an update with the age-assurance APIs, or have counsel assess launching without them. Details and sources: `COMPLIANCE_BY_COUNTRY.md`, "United States".

Until then, answer the Age Assurance question **No** (it is true), and read any extra age-assurance questions ASC shows for your storefronts.

## Not for the Kids category

The app is **not** submitted to the Kids category and is not directed to children under 13 (`docs/FACTS.md` section 2). Do not tick "Made for Kids" or pick a Kids age band. Reasons:

1. Kids apps must not include purchases or links out of the app unless they sit behind a parental gate (Guideline 1.3 as I know it; **verify the exact guideline number**). This app has real-money purchases, a subscription and links to web pages, with no parental gate.
2. It sells randomized rewards (crates), for an in-game currency bought with real money and inside paid offers. That does not belong in a children's product.
3. It offers a weekly auto-renewing subscription.
4. Kids apps face stricter limits on data and third-party services. This app collects nothing and has no third-party SDKs, so it would pass that part, but that does not fix points 1 to 3.
5. The theme (police, fire, EMS in cartoon form) may appeal to children, so keep the metadata neutral: no "kids", "children" or "family" in the name, subtitle, keywords or description, and do not pick the Family game subcategory.
6. The privacy policy says it: section 7 of `legal/privacy.html` (also `release/legal/privacy.html`) states that the app is not in the Kids category and is not directed to children under 13 (or under 16 in the European Economic Area), as `docs/FACTS.md` section 2 does. The privacy policy and the purchase terms ("Spending controls") point parents to Screen Time and Ask to Buy. Keep all documents consistent with it.
