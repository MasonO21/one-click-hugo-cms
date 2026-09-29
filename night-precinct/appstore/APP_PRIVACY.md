# App Privacy ("nutrition label") answers

Source of truth: `docs/FACTS.md` section 2. Every statement below must stay exactly true. If the app changes, redo this file and the answers in ASC.

## The answer

In ASC > your app > App Privacy > Get Started / Edit, answer the first question ("Do you or your third-party partners collect data from this app?") with **No**. The label then reads **Data Not Collected**.

There is no "Data Used to Track You", no "Data Linked to You" and no "Data Not Linked to You" to list.

**Privacy Policy URL** (required for iOS apps): `{{PRIVACY_URL}}`. Enter it in ASC > App Information > Privacy Policy URL. The hosted page must load over https with no login and must match `docs/FACTS.md` section 2. The legal pages come from `release/legal/` (see `SUBMISSION_CHECKLIST.md`). Leave "User Privacy Choices URL" empty. **Verify in App Store Connect** the current field names on the App Privacy page.

## Why "not collected" is correct

Apple's definition, as I know it: "collect" means transmitting data off the device in a way that lets you or your third-party partners access it for longer than needed to service the request in real time. Data that stays on the device is not collected. **Verify in App Store Connect** the current wording on the App Privacy page ("Learn more" link) before you answer.

The app has no account, no analytics, no advertising, no tracking, no crash-reporting SDK and no third-party SDK. It makes no network requests of its own. The only network traffic is Apple's own StoreKit traffic (which Apple handles) and, when the player taps a link, a browser view on a legal or support page.

## Justification by data type

ASC lists the categories below. The names may differ slightly. **Verify in App Store Connect.**

| Category | Data types in ASC | Collected? | Why |
|---|---|---|---|
| Contact Info | Name, Email Address, Phone Number, Physical Address, Other User Contact Info | No | No account, no sign-in, no form. The app never asks for any of these. |
| Health & Fitness | Health, Fitness | No | The app does not read HealthKit or any health data. The EMS theme is fiction. |
| Financial Info | Payment Info, Credit Info, Other Financial Info | No | Purchases are processed entirely by Apple. The developer never sees payment details. |
| Location | Precise Location, Coarse Location | No | No location permission or API. The app reads the device region code (for example `US`) only on the device, to switch off buying crates with Gold Badges in Belgium. It is not sent anywhere. |
| Sensitive Info | Sensitive Info | No | None. |
| Contacts | Contacts | No | No Contacts access. |
| User Content | Emails or Text Messages, Photos or Videos, Audio Data, Gameplay Content, Customer Support, Other User Content | No | Nothing is uploaded. Gameplay content (currencies, upgrades, timestamps, settings) is saved on the device only, in local storage mirrored to `save.json` in Application Support. Customer support happens by email or on the website, outside the app. |
| Browsing History | Browsing History | No | No browsing inside the app. |
| Search History | Search History | No | No search feature. |
| Identifiers | User ID, Device ID | No | No account, no user ID. No IDFA, no IDFV sent anywhere, no App Tracking Transparency prompt. |
| Purchases | Purchase History | No | StoreKit gives the app only product IDs, transaction IDs and dates. The app keeps a list of its most recent transaction IDs (at most 300) in the on-device save file to avoid double-granting. That list never leaves the device. Apple keeps its own purchase records under its own privacy policy. |
| Usage Data | Product Interaction, Advertising Data, Other Usage Data | No | No analytics. No ads. |
| Diagnostics | Crash Data, Performance Data, Other Diagnostic Data | No | No crash-reporting or performance SDK. Crash logs that users choose to share with developers through iOS and Xcode Organizer come from Apple's own system, not from code in the app. **Verify in App Store Connect** that Apple does not want these listed. |
| Other Data | Other Data Types | No | None. |
| Newer categories (for example Body, Surroundings) | any | No | The app does not use those sensors. **Verify in App Store Connect** whether they appear. |

Permissions requested: none (no camera, microphone, photos, location, contacts, notifications, tracking). `ios/NightPrecinct/Info.plist` contains no permission purpose strings (`NS...UsageDescription` keys); that was checked in the file. Look at the built app's `Info.plist` once more in the archive.

## Things that are NOT app data collection, but keep in mind

- **Your website.** When a player taps a legal or support link, the page opens in `SFSafariViewController`. Your web host may keep ordinary server logs (IP address, user agent). That is your website, not the app, and the app cannot see it. Say so in the website's own privacy policy if it applies, and check with the attorney reviewing `legal/`.
- **Support emails.** If a player emails `{{CONTACT_EMAIL}}` or `{{PRIVACY_EMAIL}}`, you receive their email address. That happens outside the app. Mention it in the privacy policy.
- **Backups.** The save file is included in normal iOS device backups (iCloud or a computer). That is the player's own backup, made by Apple's system, not a transfer to you.

## Privacy manifest

The app ships a privacy manifest, `PrivacyInfo.xcprivacy`. It declares:

- `NSPrivacyTracking` = false
- no tracking domains
- no collected data types
- no required-reason API use (empty accessed-API list)

What has been checked, and what still has to be done on a Mac (nobody has built the project in Xcode yet):

1. The file has to be in the app target's "Copy Bundle Resources" so it is inside the built app. `ios/project.yml.tmpl` includes the whole `NightPrecinct` source folder and, according to its comment, XcodeGen puts the privacy manifest into Copy Bundle Resources (not verified by running XcodeGen). Confirm it in Xcode, then open Organizer, right-click the archive, choose "Generate Privacy Report", and confirm the report shows no tracking and no data collection.
2. "No required-reason API use" is only true if the Swift shell (and the web view content) really uses none. Apple's list includes file timestamp APIs, system boot time, disk space, user defaults and active keyboards. A search of `ios/NightPrecinct` found none of them: no `UserDefaults`, no file attribute or modification-date calls, no disk-space or uptime calls (`SaveStore.swift` says so in its own comment). The page code uses only standard browser features (local storage and timers). If a later change adds one of these APIs, add a declaration with an approved reason to the manifest. **Verify in App Store Connect** (the upload check emails you about missing declarations) and read the current list in Apple's documentation.
3. No third-party SDK is bundled, so no third-party privacy manifests are needed.

## If you ever add an SDK

If the owner later adds any analytics, advertising, attribution, crash-reporting, A/B-testing, login or other third-party SDK (or any network call of the app's own), you must redo all of these before the update ships:

1. This file, and the App Privacy answers in ASC (the label changes from "Data Not Collected").
2. `PrivacyInfo.xcprivacy` (declared data types, tracking, tracking domains, the SDK's own manifest and signature).
3. The privacy policy at `{{PRIVACY_URL}}` and its hosted copy.
4. `AGE_RATING.md` if it adds ads or web content, `docs/FACTS.md` section 2, and the review notes.
5. If any tracking is added: the App Tracking Transparency prompt and the `NSUserTrackingUsageDescription` string.
6. If the app is later changed to make network requests of its own: revisit "works offline" wording in the description and review notes.
