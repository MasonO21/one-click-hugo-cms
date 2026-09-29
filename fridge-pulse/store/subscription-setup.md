# Subscription setup: $9.99 per month, 2-week free trial

The app expects exactly this offer. The wording in the app and both listings comes from `src/billing/trial.ts` and `store/listing.json`, and tests fail if they disagree. The stores are where the offer actually takes effect, so configure them to match.

| Setting | Value |
| --- | --- |
| Product ID (both stores) | `fridge_pulse_monthly` |
| Type | Auto-renewing subscription |
| Duration | 1 month |
| Price | $9.99 per month (US). Other countries follow each store's price conversion. |
| Introductory offer | Free trial, 2 weeks, new subscribers only |
| RevenueCat entitlement | `pro` |

## App Store Connect

1. Make sure the **Paid Apps Agreement** and your banking and tax details are active (Business).
2. Your app > **Monetization > Subscriptions**. Create a subscription group named **Fridge Pulse**.
3. Add a subscription. Reference name **Fridge Pulse Monthly**, product ID `fridge_pulse_monthly`, duration **1 Month**.
4. **Subscription prices:** add a price for the United States of **$9.99**. Review the other countries before saving.
5. **Introductory offer:** create an offer. Type **Free**, duration **2 Weeks**, eligibility **New subscribers**, all countries and regions.
6. **Localization** (English): display name `Fridge Pulse Monthly`, description `Scans, expiry reminders and meal ideas.`
7. **Review information:** upload `store/screenshots/subscription-review-paywall.png` (the paywall) and add a short note on how to reach it (it shows on first launch after onboarding).
8. Submit the subscription together with your first app version. It has to be attached to a version to be reviewed.
9. Test with a **sandbox Apple ID** (App Store Connect > Users and Access > Sandbox). Sandbox time runs in minutes, so a 2-week trial and its renewal take a short while to pass.

## Google Play Console

1. **Monetize with Play > Products > Subscriptions > Create subscription.** Product ID `fridge_pulse_monthly`, name `Fridge Pulse Monthly`.
2. Add a **base plan**: auto-renewing, billing period **Monthly**, price **US$9.99**. Review the other countries.
3. Add an **offer** to the base plan: eligibility **New customer acquisition**, phase **Free trial**, duration **2 weeks** (14 days).
4. **Activate** the base plan and the offer.
5. Add testers under **Setup > License testing**. Use an internal testing track to try a purchase.

## RevenueCat

1. Create a project. Add an **iOS app** (your bundle ID) and an **Android app** (your package name), and connect each store's credentials as RevenueCat's setup guide describes.
2. Add the product `fridge_pulse_monthly` for each store (RevenueCat can import them).
3. Create an entitlement with the identifier **`pro`** and attach both products.
4. Create an offering called **`default`** with a **Monthly** package that points at the product.
5. Copy the **public SDK keys** into the app's `.env` as `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
6. Copy the **secret API key** into the server as `REVENUECAT_SECRET_KEY`. The server uses it to refuse scan and meal requests from anyone without an active trial or subscription.

## Check it end to end (sandbox)

- [ ] The paywall shows "Start 2-week free trial", the store's price (US: $9.99) and the date billing starts.
- [ ] Confirming in the store sheet shows a free trial and the charge date.
- [ ] After purchase the app unlocks and Settings shows the days left and the billing date.
- [ ] Scanning works (the server accepted the app user ID). Without a purchase it returns a "start your free trial" message.
- [ ] Two days before the trial ends (or one, if you start late) a reminder notification arrives, if notifications are allowed.
- [ ] After the trial lapses the app returns to the paywall. "Restore purchases" works on a second device.
- [ ] Cancelling in the store's subscription settings stops renewal at the end of the period.
