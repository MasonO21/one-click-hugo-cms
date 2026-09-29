# Data map (answers for Apple’s “App Privacy” questionnaire and for the privacy policy)

**Summary: Tiny Tides collects no data. Nothing leaves the device.** In App Store Connect → App Privacy choose **“Data Not Collected”**. Do not tick “Tracking”.

## What the app stores, and where

| Data | Where | Purpose | Leaves the device? | Removed by |
|---|---|---|---|---|
| Game save (pool layout, creatures, toys, currencies, quests, streak, settings, tutorial progress, timestamps, ledger of delivered purchase ids) | App sandbox: `@capacitor/preferences` (iOS UserDefaults) and WebView localStorage; a second backup copy of the save | Let the player continue | **No.** Included in the user’s own iOS/iCloud device backup (Apple’s feature, not ours) | Delete app, or Settings → Reset progress |
| Settings (music, sound, haptics, reminders, reduce motion, battery saver, Sea Glass pulls on/off) | same | Preferences | No | same |
| Local notification schedule | iOS notification center | Optional reminders | No (no push server, no push token) | Turn reminders off / Reset |
| Temporary PNG for sharing a picture | app cache, deleted right after the share sheet closes | Share | Only if the user picks a destination in the iOS share sheet | Automatic |

## What the app does **not** do

* No account, sign-in, name, email, phone, address, contacts, photos library, camera, microphone, location, health, or device identifiers (no IDFA / IDFV read).
* No analytics, crash reporting, advertising, attribution or remote-config SDK. No network requests of its own (the only outside communication is StoreKit ↔ Apple for purchases, done by iOS).
* No third-party web content. Links (privacy, terms, support…) open in the system browser.

## Apple-required privacy manifest (`ios/App/App/PrivacyInfo.xcprivacy`)

* `NSPrivacyTracking` = false, no tracking domains, no collected data types.
* Required-reason APIs declared: **UserDefaults** (`CA92.1` — app-only settings/save) and **File timestamp** (`C617.1` — files inside the app container).
* Third-party SDK manifests: Capacitor and its plugins ship their own manifests where required; re-run *Product → Archive → Generate Privacy Report* in Xcode before submitting to confirm the merged report matches this table.

## Purchases

Handled by Apple. The app calls StoreKit 2 only to (a) list prices, (b) buy, (c) read the user’s own transaction list to deliver/restore items. Apple does not tell developers who the buyer is. The app stores only the transaction *id* (a number) so it never credits a purchase twice.

## Children

Not in the Kids Category and not directed to children under 13; there is nothing to collect from anyone. If this ever changes (accounts, cloud save, chat, ads), update the policy, this file and the manifest first, and reconsider COPPA / GDPR-K / age-rating answers.
