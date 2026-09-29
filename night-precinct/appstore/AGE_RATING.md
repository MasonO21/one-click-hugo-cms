# Age rating questionnaire answers

Source of truth: `docs/FACTS.md` section 5 (content descriptors) and sections 3 and 4 (purchases and crates).

**Read this first.** Apple changed the age-rating questionnaire in 2025: the old 4+ / 9+ / 12+ / 17+ scale was replaced by 4+ / 9+ / 13+ / 16+ / 18+, and new questions were added (in-app controls, capabilities, medical or wellness, more detail on violence and chance-based activities). I know the questionnaire in its categories, not word for word, and Apple edits the wording from time to time. Every question below therefore says **Verify wording in App Store Connect**. Match the meaning of each answer to whatever ASC actually asks. Answer honestly. If a question is not listed here, answer it from the same facts.

Where to answer: ASC > your app > App Information > Age Rating (Edit). Apple calculates the rating from your answers and shows it before you save.

## Answers

Frequency scale used by Apple in most questions: None / Infrequent / Frequent (the older form was None / Infrequent or Mild / Frequent or Intense). **Verify wording in App Store Connect.**

### In-app controls

| Question (as I know it) | Answer | Justification |
|---|---|---|
| Parental Controls (does the app include parental controls?) | No | The app has no parental-control feature. |
| Age Assurance (does the app verify or estimate the user's age?) | No | No accounts, no age check, no age data collected. |

### Capabilities

| Question | Answer | Justification |
|---|---|---|
| Unrestricted Web Access | **No** | The game runs from bundled local files. It has no address bar and no way to browse. The only links open a browser view (`SFSafariViewController`) on fixed pages: Terms of Use, Privacy Policy, Purchase Terms, crate odds, support, the notices page (Credits > Full notices) and Apple's subscription-management page. The native shell accepts any `https` address from the page, but the game only ever sends those configured ones. |
| User-Generated Content | **No** | Players cannot create, upload or share anything. No names, no text entry shown to others, no sharing. |
| Messaging and Chat | No | No chat, no messaging, no multiplayer. |
| Advertising | No | There are no ads and no ad SDK (`docs/FACTS.md` section 3; no ad, analytics or other third-party code exists in `game/src` or `ios/`). **Verify wording in App Store Connect** (I am not certain this question exists in the current form). |

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
| Cartoon or Fantasy Violence | None (see decision note) | `docs/FACTS.md` section 5: no violence is shown. Crooks are cuffed ("BUSTED"), fires are put out ("DOUSED"), patients are treated ("SAVED"). No blood, no injuries. |
| Realistic Violence | None | Nothing realistic is depicted. |
| Prolonged Graphic or Sadistic Realistic Violence | None | Nothing of the kind. |
| Guns or Other Weapons | None | `docs/FACTS.md` says no weapons are shown being fired. No gun, knife or similar prop is drawn in the game art (the scene and portrait drawing code, `game/src/02-art-scene.js`, has none). Some Gear-Up upgrades have weapon-like names as text only ("Stun Baton", "Taser X2", "Quick-Draw Holster", and cannon-style names in the fire and EMS worlds), shown with a handcuff or generic icon. If the questionnaire asks about references as well as depictions, or you want to be cautious, answer Infrequent. **Verify wording in App Store Connect.** |

**Decision note on cartoon violence.** `docs/FACTS.md` proposes 9+ under the older scheme, which is more cautious than "None" everywhere would produce (that would normally give 4+). The owner has two consistent options: (a) answer None as above and accept whatever rating Apple calculates, or (b) answer Infrequent for Cartoon or Fantasy Violence because chasing and cuffing crooks (the main button reads "ARREST!", and the scene shows "BUSTED" pop-ups and running bounty targets) could be read as mild cartoon conflict, which matches the proposed 9+. Over-declaring is safe. Under-declaring risks a rejection or a forced change later. Pick one before you fill in the form.

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
| Contests | None | No contests, prizes or sweepstakes. |
| Loot Boxes / randomized rewards for purchase | **Yes** | Crates give randomized rewards (cash, Gold Badges, gear). They can be earned free or bought with Gold Badges, and Gold Badges are bought with real money. Odds are published in the app and at `{{ODDS_URL}}` (`docs/FACTS.md` section 4). **Verify wording in App Store Connect**: I am not sure whether the current questionnaire has a separate loot-box question or folds it into another one. Answer Yes wherever the meaning applies. |

### In-app purchases and spending

| Item | Answer | Justification |
|---|---|---|
| Does the app offer in-app purchases? | Yes | 16 Apple In-App Purchase products: 10 consumables, 5 non-consumables and 1 auto-renewable subscription (`IAP.md`). Prices range from 0.99 to 99.99 (USD, intended), and the subscription is 4.99 per week. |
| Is there a separate questionnaire item? | **Verify wording in App Store Connect** | I do not know of a yes/no age-rating question about spending. Apple shows "Offers In-App Purchases" on the product page automatically from the products you attach. The disclosure that matters is the product list and prices in `IAP.md`, the crate odds, and the description text. |
| Does the game encourage spending? | Say so plainly | Purchases can speed up progress, and lifetime spending unlocks a permanent income bonus (Precinct Patron). This is stated in the description and the review notes. |

### Not in the app (answer No or None if asked)

Web browsing, social features, location sharing, contacts, camera or microphone use, photos, notifications, health data, account creation, user reviews or comments, dating or mature content.

## The old questionnaire, for reference

If ASC (or another storefront's rating body) shows the older wording, the same answers map like this. **Verify wording in App Store Connect.**

| Old question | Answer |
|---|---|
| Cartoon or Fantasy Violence | None (or Infrequent/Mild, see decision note) |
| Realistic Violence | None |
| Sexual Content or Nudity | None |
| Profanity or Crude Humor | None |
| Alcohol, Tobacco, or Drug Use or References | None |
| Mature/Suggestive Themes | None |
| Horror/Fear Themes | None |
| Medical/Treatment Information | None |
| Simulated Gambling | None |
| Contests | None |
| Unrestricted Web Access | No |
| Gambling (real money) | No |

## Expected rating and why it can differ

- **My expectation:** 9+, matching the proposal in `docs/FACTS.md` (9+ under the older scheme). Under the newer scheme the categories are 4+, 9+, 13+, 16+ and 18+.
- **Why it may be higher:** the loot-box answer (Yes) can raise the result. I believe Apple treats randomized paid rewards as a reason for a higher minimum, possibly 13+ or above, but I am not certain of the threshold. ASC displays the calculated rating before you save. **Verify in App Store Connect.** Accept the rating Apple assigns. Do not change answers to get a lower number. You may raise the rating with the override if you want to be more conservative; you cannot go below the calculated one.
- **Why it may be lower:** answering None to every violence question and having the loot-box item treated as informational could give 4+. Only accept that if every answer is true.
- **Regional ratings:** Apple derives ratings for some regions from the same answers. Some countries have their own rules for loot boxes and games (for example South Korea, Brazil, Australia; **verify per region** in ASC's rating summary). South Korea may also ask for a game rating certificate for games. See `SUBMISSION_CHECKLIST.md`.
- **Apple may adjust the rating** during review if it disagrees with an answer.
- **Regulation of age checks** (some US states, and other countries, have started to require app stores or apps to check age or use age signals). The app does no age check and uses no age-range API. **Verify in App Store Connect** whether ASC shows any extra age-assurance questions or requirements for your storefronts.

## Not for the Kids category

The app is **not** submitted to the Kids category and is not directed to children under 13 (`docs/FACTS.md` section 2). Do not tick "Made for Kids" or pick a Kids age band. Reasons:

1. Kids apps must not include purchases or links out of the app unless they sit behind a parental gate (Guideline 1.3 as I know it; **verify the exact guideline number**). This app has real-money purchases, a subscription and links to web pages, with no parental gate.
2. It sells randomized rewards (crates) for an in-game currency that is bought with real money. That does not belong in a children's product.
3. It offers a weekly auto-renewing subscription.
4. Kids apps face stricter limits on data and third-party services. This app collects nothing and has no third-party SDKs, so it would pass that part, but that does not fix points 1 to 3.
5. The theme (police, fire, EMS in cartoon form) may appeal to children, so keep the metadata neutral: no "kids", "children" or "family" in the name, subtitle, keywords or description, and do not pick the Family game subcategory.
6. The privacy policy says it: section 7 of `legal/privacy.html` (also `release/legal/privacy.html`) states that the app is not in the Kids category and is not directed to children under 13 (or under 16 in the European Economic Area), as `docs/FACTS.md` section 2 does. The privacy policy and the purchase terms ("Spending controls") point parents to Screen Time and Ask to Buy. Keep all documents consistent with it.
