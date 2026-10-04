# Privacy answers and store policy notes

What the app does with data, so the store forms can be answered accurately. These reflect version 1.0 as built. If you add analytics, crash reporting, ads or accounts, update the forms, the privacy manifest in `app.json`, and `src/legal/privacy.json`.

## What the app does with data

- Food items, quantities, dates and preferences are stored on the device only. There are no accounts.
- **With the person's agreement** (asked in-app before the first scan, revocable in Settings), photos are sent over HTTPS to your server and on to Anthropic's Claude API to identify food. For meal ideas, item names, categories, quantities and days-until-expiry are sent, with no photos. The server processes these in memory and does not store them.
- RevenueCat receives purchase information and a random app user ID to manage the trial and subscription. Apple and Google process payments.
- No advertising, no tracking, no analytics or crash-reporting SDK.

## Apple: App Privacy ("nutrition label")

Answer **Yes, we collect data**, and add these types. None are used for tracking.

| Data type | Linked to the person? | Purpose |
| --- | --- | --- |
| Photos or Videos | No | App Functionality |
| Other User Content (ingredient lists; a shared household's food and shopping lists) | Yes (household lists, by a scrambled app user ID) | App Functionality |
| Purchases (purchase history) | Yes | App Functionality |
| Identifiers > User ID (RevenueCat app user ID) | Yes | App Functionality |

Notes:

- Photos are declared as collected because they go to a third-party AI provider that may retain API inputs for a limited period under its own terms. If you later agree zero data retention with the provider, revisit this answer.
- Item lookups (a scan finds something the app does not know) send the same photo plus the item's name and a packaging description, so they fall under the same two data types. The web searches Claude runs, and the Open Food Facts and Wikipedia requests our server makes for a product picture, contain only product words, nothing about the person. The phone then loads the picture from Open Food Facts or Wikimedia directly, like any web image.
- Receipt photos (Scan a receipt) are photos too, so they fall under the same data type. A receipt can show the shop, the time and the last digits of a payment card; the server does not keep the photo, the AI is asked to read only the food lines and the date, and the app tells people to fold card details over. The privacy policy says the same.
- Shared households store the household's food and shopping lists on your server, keyed by a SHA-256 hash of the RevenueCat app user ID, so Other User Content is declared as linked. Nothing is stored for people who never start or join a household. The last member leaving deletes the household and its lists.
- The household plan: for the one member who pays for it, the server also keeps their RevenueCat app user ID itself (not hashed) with the household and the plan's end date, so it can ask RevenueCat whether the plan has renewed and keep covering the others. It is cleared when they leave or the plan ends. This is the same User ID already declared above, used for App Functionality.
- Health data (Apple Health / Health Connect: steps, active energy, workouts read; nutrition written) never leaves the phone, so it is not "collected" in Apple's sense and is not declared. The food log, body details and goals stay on the device too.
- **Tracking:** No. The privacy manifest in `app.json` sets `NSPrivacyTracking` to false and lists the same data types.
- The app makes no use of the advertising identifier, so you can answer **No** to the IDFA question.

## HealthKit and Health Connect

- **App Store:** the HealthKit capability and both usage strings come from the `@kingstinct/react-native-healthkit` config plugin (`app.json`). Guideline 5.1.3 applies: health data must not be used for advertising or sold, must not be stored in iCloud, and the privacy policy must say how it is used (it does, under "Apple Health and Health Connect"). In App Review notes, say that HealthKit reads steps, active energy and workouts for the weekly score and writes dietary energy and macros from the food log, and that a reviewer can try it from Pulse > Today > Connect Apple Health.
- **Google Play:** fill in the Health Connect permissions declaration in Play Console for READ_STEPS, READ_ACTIVE_CALORIES_BURNED, READ_EXERCISE and WRITE_NUTRITION, with the same reasons, and the Health apps declaration. The privacy-policy link Health Connect shows comes from the rationale activity the `react-native-health-connect` plugin adds.

## Google Play: Data safety

- **Data collected:** Photos (in "Photos and videos"), Purchase history (in "Financial info"), Device or other IDs (the RevenueCat app user ID), and, for people who share a household, Other user-generated content (the shared food and shopping lists).
- **Shared with third parties:** No. Photos are processed by a service provider on your behalf (Anthropic), which Google treats as processing rather than sharing. Confirm this against your own agreement.
- **Purpose:** App functionality.
- **Optional:** Photos are optional; the app works without AI features.
- **Encrypted in transit:** Yes.
- **Deletion:** Yes. All food data can be deleted in-app (Settings > Privacy and data > Delete all my data). The server keeps no account data.
- **Privacy policy URL:** the hosted `docs/legal/privacy-policy.html`.

## Apple App Review guidelines that matter here

| Guideline | How the app meets it |
| --- | --- |
| 3.1.2 Subscriptions | Paywall shows price, trial length, renewal terms, the billing date, Restore purchases, and links to Terms and Privacy. Terms explain cancellation. |
| 5.1.1 Privacy | Policy is in-app (Settings and paywall) and must also be linked in App Store Connect. Purpose strings for camera and photos are set. Local data can be deleted in-app. |
| 5.1.2(i) Sharing with third-party AI | An in-app consent prompt names the AI provider and what is sent, and nothing is sent until the person agrees. Consent can be withdrawn in Settings. |
| 1.4.1 Safety | Food-safety and allergy notes appear in Terms and the About screen; estimates are labelled as estimates throughout. |
| 2.1 App completeness | The backend must be live and reachable during review. Give reviewers the notes below. |
| 4.2 Minimum functionality | Tracking, reminders, meal ideas and scanning are native features, not a web wrapper. |

## Age ratings

- **App Store:** answer **None** to every content question (no violence, no user-generated content, no unrestricted web access, no medical content). The result is **4+**.
- **Google Play (IARC):** category "Utility, productivity, communication or other". Answer **No** throughout. The result is **Everyone**.
- **Target audience (Play):** choose **18 and over** for the simplest path. It avoids the extra Families Policy requirements. The privacy policy states the app is not directed at children under 13.

## Export compliance

The app uses only standard HTTPS. `ITSAppUsesNonExemptEncryption` is set to false in `app.json`, so you should not be asked export questions on each upload.

## Notes for App Review (paste into App Store Connect)

> Fridge Pulse needs no sign-in. On first launch there is a short intro, then the subscription screen: four plans (monthly or yearly, for one person or for the household), each with a 2-week free trial. Use the sandbox account provided to start the trial.
>
> The household plans also cover up to 8 people in the payer's shared household (Settings > Household). On a second device, "Someone at home has the household plan? Join with their code" on the subscription screen joins with the invite code shown in Settings > Household on the first device, and the app unlocks without a purchase.
>
> To try scanning: tap "Scan your fridge", add a photo (Choose from library or Take photo), tap Analyze. On first use an AI consent prompt appears; tap "I agree". The photo is analysed by our server and results appear on a review screen. "Add items by hand" works without AI. The Meals tab shows meal ideas, and Settings > Privacy and data lets you turn AI off.
>
> The scanning service must be online during review: REPLACE_WITH_YOUR_SERVER_URL.
