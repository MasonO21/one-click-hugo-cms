# Subscription setup: four plans, each with a 2-week free trial

The app expects exactly these plans. The wording in the app and both listings comes from `src/billing/trial.ts` and `store/listing.json`, and tests fail if they disagree. The stores are where the offer actually takes effect, so configure them to match.

| Plan | Product ID (both stores) | Duration | US price | RevenueCat package | Entitlements | App Store level |
| --- | --- | --- | --- | --- | --- | --- |
| Monthly | `fridge_pulse_monthly` | 1 month | $9.99 | `$rc_monthly` (Monthly) | `pro` | 2 |
| Yearly | `fridge_pulse_annual` | 1 year | $59.99 | `$rc_annual` (Annual) | `pro` | 2 |
| Household monthly | `fridge_pulse_household_monthly` | 1 month | $14.99 | `household_monthly` (custom) | `pro`, `household` | 1 |
| Household yearly | `fridge_pulse_household_annual` | 1 year | $89.99 | `household_annual` (custom) | `pro`, `household` | 1 |

- All four are auto-renewing subscriptions in **one subscription group**, so a person can only hold one and moving between them is an upgrade, downgrade or crossgrade rather than a second subscription.
- Every plan has the same introductory offer: **free trial, 2 weeks, new subscribers only**. The stores give the trial once per group, so switching plans does not start another one.
- Other countries follow each store's price conversion. The app always shows the store's localised price once it has loaded.
- The paywall picks **Yearly** first. Its "Save 50%" badge is worked out from the two prices the store returns, so it stays true in every country.

## What the household plan does

The payer gets the app like any other plan. On top of that, everyone in their shared household (Settings > Household, up to 8 people including the payer) gets the app too, without paying:

1. The household plans grant a second RevenueCat entitlement, **`household`**.
2. Whenever the payer's phone talks to the server, the server sees that entitlement and its end date and records the payer against their household.
3. A member without a plan of their own is let in while that date is in the future. The app shows "Included in Sam's household plan" in Settings.
4. When the date passes (the plan renews or ends), the next member request makes the server ask RevenueCat about the payer again: a renewal carries on the cover, an ended plan stops it and those members see the paywall.
5. The payer leaving the household, or switching to a plan just for them, ends the cover.

Joining a household, looking at it and leaving it work without a plan (with a per-IP limit), so a covered person can join from the paywall: "Someone at home has the household plan? Join with their code".

## App Store Connect

1. Make sure the **Paid Apps Agreement** and your banking and tax details are active (Business).
2. Your app > **Monetization > Subscriptions**. Create a subscription group named **Fridge Pulse**.
3. Add the four subscriptions from the table, with the reference names `Fridge Pulse Monthly`, `Fridge Pulse Yearly`, `Fridge Pulse Household Monthly` and `Fridge Pulse Household Yearly`.
4. **Levels:** in the group, put both household plans on level 1 and both plans for one person on level 2. Moving to a household plan is then an upgrade that starts straight away; moving back is a downgrade that starts at the next renewal.
5. **Subscription prices:** add the US price from the table for each. Review the other countries before saving.
6. **Introductory offer** on each: type **Free**, duration **2 Weeks**, eligibility **New subscribers**, all countries and regions.
7. **Localization** (English): use the display names and descriptions under `subscriptions.plans` in `store/listing.json`.
8. **Review information:** upload `store/screenshots/subscription-review-paywall.png` (the paywall) and add a short note on how to reach it (it shows on first launch after onboarding). For the household plans add: "One person pays; up to 8 people in their shared household (Settings > Household) get access. Joining with the invite code from the paywall shows the covered state."
9. Submit the subscriptions together with your first app version. They have to be attached to a version to be reviewed.
10. Test with a **sandbox Apple ID** (App Store Connect > Users and Access > Sandbox). Sandbox time runs in minutes, so a 2-week trial and its renewal take a short while to pass.

## Google Play Console

1. **Monetize with Play > Products > Subscriptions > Create subscription**, four times, with the product IDs and names from the table.
2. On each, add a **base plan**: auto-renewing, billing period **Monthly** or **Yearly** as in the table, at the US price. Review the other countries.
3. Add an **offer** to each base plan: eligibility **New customer acquisition**, phase **Free trial**, duration **2 weeks** (14 days).
4. **Activate** the base plans and the offers.
5. Add testers under **Setup > License testing**. Use an internal testing track to try a purchase and a plan change. The app tells Google Play which subscription a change replaces (with time proration), so nobody pays for two.

## RevenueCat

1. Create a project. Add an **iOS app** (your bundle ID) and an **Android app** (your package name), and connect each store's credentials as RevenueCat's setup guide describes.
2. Add the four products for each store (RevenueCat can import them).
3. Create the entitlement **`pro`** and attach all four products.
4. Create the entitlement **`household`** and attach the two household products.
5. Create an offering called **`default`** (make it current) with four packages: the built-in **Monthly** and **Annual** packages for the two plans for one person, and custom packages **`household_monthly`** and **`household_annual`** for the household plans.
6. Copy the **public SDK keys** into the app's `.env` as `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
7. Copy the **secret API key** into the server as `REVENUECAT_SECRET_KEY`. The server uses it to refuse requests from anyone without an active trial, subscription or household cover. If you name the entitlements differently, set `REVENUECAT_ENTITLEMENT_ID` and `REVENUECAT_HOUSEHOLD_ENTITLEMENT_ID`, and change `ENTITLEMENT_ID` / `HOUSEHOLD_ENTITLEMENT_ID` in `src/billing/trial.ts` to match.

## Check it end to end (sandbox)

- [ ] The paywall shows "Just me" and "Household", Yearly picked with "Save 50%", the store's prices, "Start 2-week free trial" and the date billing starts for the picked plan.
- [ ] Confirming in the store sheet shows a free trial and the charge date for that plan.
- [ ] After purchase the app unlocks and Settings shows the plan, the days left and the billing date.
- [ ] Scanning works (the server accepted the app user ID). Without a purchase it returns a "start your free trial" message.
- [ ] Settings > Plans: switching from Monthly to Household yearly goes through the store's change sheet, and on Android the old subscription is replaced rather than kept.
- [ ] Household cover: the payer starts a household; a second phone with no plan taps "Join with their code" on the paywall, enters the code and gets in. Settings on the second phone says "Included in ...'s household plan".
- [ ] The payer cancels the household plan; once the period has ended (minutes in sandbox), the second phone is back on the paywall within a sync or two, and its card says nobody's household plan covers the household.
- [ ] Two days before a trial ends (or one, if you start late) a reminder notification arrives naming the picked plan's price, if notifications are allowed.
- [ ] After a trial lapses the app returns to the paywall. "Restore purchases" works on a second device.
- [ ] Cancelling in the store's subscription settings stops renewal at the end of the period.
