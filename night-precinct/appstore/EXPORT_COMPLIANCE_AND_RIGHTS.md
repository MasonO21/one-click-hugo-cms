# Export compliance, content rights, trademarks, and documents Apple may ask for

Source of truth: `docs/FACTS.md` sections 1, 2 and 6.

This is not legal advice. Have an attorney confirm the export and trademark points.

## 1. Export compliance (encryption)

**Answer:** the app uses no encryption beyond what iOS itself provides. It qualifies for the exemption and does not implement its own cryptography.

- In `Info.plist`: `ITSAppUsesNonExemptEncryption` = `false` (NO). With this key set, ASC does not ask the export-compliance questions again for each build. The source file `ios/NightPrecinct/Info.plist` has it set to false. Confirm the key is in the built app (open `Info.plist` in the archive).
- If ASC asks anyway, my understanding of the flow is: "Does your app use encryption?" then "Does it qualify for an exemption?" The honest answer is that the only encryption involved is what iOS provides (StoreKit, the system's HTTPS handling when a legal page opens in the Safari view, and the OS's own file protection). The app has no proprietary or non-standard algorithm and no encryption library of its own. Choose the exempt option. **Verify in App Store Connect** the current wording and options.
- Because the only encryption is the operating system's, the exemption I know of applies, and no annual self-classification report should be needed. **Verify in App Store Connect** and with the attorney.

Check before you rely on this:

1. Searched: `game/src` and `ios/NightPrecinct` contain no `CryptoKit`, `CommonCrypto`, `SecKey`, `crypto.subtle`, hashing or cipher code, and `save.json` is plain JSON text. (The only word match is the upgrade name "Encrypted Radio" in the game text.) Repeat this search if code is added. Hashing for a checksum alone is generally not the concern, but a cipher would be. If any is found, stop and re-evaluate; the answer may change.
2. If a third-party SDK is added later, this answer must be redone.
3. France historically had an extra declaration for non-exempt encryption. Not needed for an exempt app, but **Verify in App Store Connect** if ASC raises it.

## 2. Content rights

**ASC question** (as I know it): "Does your app contain, show, or access third-party content?" **Answer: No.**

Why:

- **Art:** all art is original vector and canvas artwork drawn in code. No third-party art files (`docs/FACTS.md` section 1).
- **Sound:** sound effects and an original music loop per world, all synthesized on the device in code. No music or sound files, nothing licensed (`docs/FACTS.md` section 1).
- **Text and names:** all game text, world names (Night Precinct, Ember Station, Golden Hour), rank names and item names are the owner's own. Make sure none of them are names of real agencies, real products or another game's marks (see section 3).
- **Fonts:** three families used under the SIL Open Font License 1.1, bundled as files: Big Shoulders Display, Barlow Semi Condensed, Share Tech Mono (from Google Fonts / Fontsource). License texts are in `game/fonts/` (`LICENSE-big-shoulders-display.txt`, `LICENSE-barlow-semi-condensed.txt`, `LICENSE-share-tech-mono.txt`). The OFL allows embedding in an app and requires the license and copyright notice to travel with the font files. How this is handled: the fonts are embedded as base64 data inside `game/www/index.html` (the app bundle contains only that folder, so the three license files in `game/fonts/` are not copied into the app); the Credits screen in the game says the fonts are used under the SIL Open Font License 1.1 and links to the notices page (Credits > Full notices, `{{NOTICES_URL}}`), and `legal/notices.html` reproduces each font's copyright notice and the full license text. Whether that is enough is a question for the attorney; if you also want the license files inside the app, that is a project change. I do not consider fonts "third-party content" in the sense of that ASC question (it is about media and content), so I answer No. **Verify in App Store Connect**; if you prefer to be conservative you may answer Yes and confirm you hold the rights (OFL license), which is also true.
- **Code:** no third-party code. Apple system frameworks only: UIKit, WebKit, StoreKit, SafariServices, AVFoundation (`docs/FACTS.md` section 6).
- **Player-generated content:** none.

Keep the `game/fonts/` license files unchanged, and keep the notices page online for as long as the app is on sale.

## 3. Trademarks and name clearance

- **The name is a working title.** `docs/FACTS.md` says "Night Precinct" needs a trademark search before submission. Do this before you create the app record and before you spend on artwork or marketing. I have made no clearance search and give no opinion on the name.
  - Search USPTO trademark records (the current "Trademark Search" tool), and the EU and other markets you sell in (for example EUIPO's TMview, WIPO's Global Brand Database).
  - Search the App Store, Google Play and the web for the same and similar names, in games and in emergency-service categories.
  - Also check the world and item names the same way (Ember Station, Golden Hour, Chief's Club, Precinct Patron, Rally Boost, Supply Drop, Evidence Safe, Career Pass).
  - Have an attorney confirm. If you find a conflict, change `APP_NAME` in `release.config.json` (check the new name against the 30-character limit in `metadata/en-US/LIMITS.md`) and re-run `python3 tools/apply_config.py`.
- **Name similarity in the App Store.** Apple rejects names that copy or are confusingly like another app's name, and an app name must be unique. Search the App Store for close matches before you submit. If the name is taken, ASC tells you when you try to save it.
- **Do not use real agency marks.** No real police, fire department or EMS logos, badges, shields, patches, seals, uniforms or vehicle liveries; no real agency names (city or county departments, national agencies); no real emergency phone-line branding; no real unit numbers that identify an agency. Draw invented ones only.
- **Protected medical symbols.** No protected medical emblem is used (no red cross, red crescent or Star of Life); the EMS art uses a heartbeat (ECG pulse) mark and a heart emblem instead, and the protected emblems must not be added. They are protected by law in many countries, and my understanding is that the "Star of Life" is also a controlled mark in the United States; **verify with the attorney** before using it or anything close to it. A generic, invented medical symbol is safer.
- **Do not use another game's characters, names, sounds or UI.** Also avoid other apps' names in keywords, screenshots, the description or the promotional text (the keyword file contains none).
- **Fictional disclaimer.** Keep it visible on the store page and inside the game:
  > {{APP_NAME}} is a work of fiction. It is not affiliated with, endorsed by or sponsored by any real police, fire or emergency medical service agency.
  The description ends with a shorter version of this. The privacy policy, terms and the in-game About or Settings screen should carry the same statement. Check that they do.
- **Screenshots and icon.** They must not show real agency insignia, real vehicles with real markings, or real brand names.
- **What is in the art** (checked in `game/src/02-art-scene.js` and in the generated screenshots in `appstore/screenshots/`):
  - **EMS world (`06-ems.png`):** the red cross marks that the earlier drawing had on the ambulances and the medic icons are gone. The ambulances carry a heartbeat (ECG pulse) line, the medic portraits (Roster tab) carry a white pulse line on the cap, and the EMS world emblem (Career tab, world list) is a heart with a pulse line. Nothing is a red cross on a white ground, a red crescent or a Star of Life. The concern about emblems is resolved as designed; keep it that way in any art change, and still have the attorney look at the name (first bullet of this section).
  - **Checked in the art code:** the medic caps, ambulances, portraits and the world emblem no longer contain any cross shape; the caps carry a small flat white bar and the vehicles and portraits use the pulse line. Do not add a cross, crescent or Star of Life later.
  - **Rank badge:** every world shows a shield with a star beside the rank name (for example Lieutenant, Sergeant, Paramedic). It looks generic and original. Keep it invented and do not copy the shape or wording of a real agency badge.
  - **Signs in the scenes:** "24H DONUTS", "STATION 1", "24H CLINIC" (in the drawing code). These read as generic. Do not replace them with real brand or agency names.
  - **In-game cash uses a "$" sign** (for example $8.41B). It is in-game currency, but see the note in `SUBMISSION_CHECKLIST.md` step 13 about screenshots and prices.
  - **App icon** (`ios/NightPrecinct/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png`, from `tools/assets/icon.svg`): a gold shield with a star and a check mark over a red and blue light glow and a city skyline. It has no text and no agency marking.

## 4. Documents Apple may ask for

Have these ready. Not all will be requested. **Verify in App Store Connect** what your account and storefronts require.

| Document or information | Why it may be requested | Where it comes from |
|---|---|---|
| Legal entity name, address, phone, D-U-N-S number, proof of authority to sign | Organization enrollment in the Apple Developer Program | The owner's company records. Not part of this package. |
| Paid Applications agreement, tax forms, bank details | Needed before in-app purchases and subscriptions can be sold | ASC > Business (or Agreements, Tax, and Banking). See `SUBMISSION_CHECKLIST.md`. |
| Trader status and contact details (address, phone, email) for the EU Digital Services Act (not needed while the game is not listed in the EU) | Shown on the product page in EU storefronts; Apple may ask for verification documents (for example business registration) | The owner. Uses `{{COMPANY_NAME}}` and `{{COMPANY_ADDRESS}}` from the config. **Verify in App Store Connect.** |
| Privacy policy URL and support URL that work | Required for every app | `{{PRIVACY_URL}}`, `{{SUPPORT_URL}}`, hosted from `release/legal/` |
| Terms of Use (EULA) or agreement to Apple's standard EULA | Required for subscriptions to be linked | `{{TERMS_URL}}` (custom) or Apple's standard EULA. **Verify in App Store Connect.** |
| Proof of rights for third-party content | Only if you answered Yes to third-party content | Not needed for this app. Keep the font license texts from `game/fonts/`. |
| Trademark search or clearance record | Only if another rights holder complains or Apple asks | Keep your own record (see section 3). |
| Trademark or written authorization from a rights holder | Only if the app uses someone else's marks | Not applicable; do not use any. |
| Export compliance documents (annual self-classification, CCATS, French declaration) | Only for non-exempt encryption | Not needed here (section 1). |
| Age-rating support | If Apple questions an answer | `AGE_RATING.md` and `docs/FACTS.md` section 5. |
| Game license or rating certificate | Some storefronts require one for games: mainland China (game licence and ISBN) and Vietnam (publishing licence), where the app is not offered; Indonesia (IGRS rating), an open owner decision. In South Korea, Apple's own age rating serves as the game rating. | Not covered by this package. See `COMPLIANCE_BY_COUNTRY.md` and `SUBMISSION_CHECKLIST.md` step 15. **Verify in App Store Connect.** |
| Demo account | Only for apps with login | Not needed: no login. |
| Screen recording of the purchase flow | Reviewers sometimes ask when they cannot reach a product | Record on a device with the sandbox account. |
| Business and consumer contact for support | Consumer protection rules in some regions | `{{CONTACT_EMAIL}}`. |
