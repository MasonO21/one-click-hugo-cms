# Fridge Pulse

Photograph your fridge, freezer or pantry. Fridge Pulse lists what is inside, tracks what is about to expire, reminds you before it goes off, and suggests meals that use it up first.

**Pricing:** free for 2 weeks (14 days), then $9.99 per month. Hard paywall once the trial ends. The offer is defined once in `src/billing/trial.ts`, and `__tests__/pricing.test.ts` fails if any other price or trial length appears in the app or store listing.

Built with Expo (SDK 57) and React Native, plus a small Node backend that holds the Anthropic API key.

```
fridge-pulse/
  src/app/          Screens (Expo Router): onboarding, paywall, tabs, scan, review, item detail, about, legal
  src/lib/          Pure logic: dates, expiry, shelf-life estimates, meals, reminders, API client
  src/billing/      Trial / subscription (RevenueCat, local demo, fail-closed)
  src/store/        Persisted state (zustand + AsyncStorage)
  src/components/   UI components and theme
  server/           Backend: photo scan + meal ideas via Claude, subscription check, rate limits
  src/legal/        Privacy Policy and Terms of Use text (also built to hostable HTML in docs/legal/)
  store/            App Store / Play listing text, screenshots, graphics and the submission checklist
  __tests__/        App unit tests (jest)   server/test/  Server tests (node:test)
```

## Try it in two minutes (no accounts needed)

```bash
npm install
npx expo start          # press i / a for a simulator, or scan the QR code with Expo Go
```

With no configuration the app runs in **demo mode**: "Try a sample scan" returns sample food, meal ideas come from a built-in recipe list, and the trial is simulated on the device. Settings has buttons to jump the trial to "ends in 3 days" or "expired" so you can see the paywall.

## Web preview (view it in a phone browser)

`npm run preview:build` writes a self-contained, demo-mode build of the app to `preview/`:

- `index.html` is the page content (title, styles, a small bootstrap). Wrap it in a normal HTML shell if you host it yourself, or publish it as-is where the host adds the shell.
- `app.js` is the app bundle, with asset URLs made relative so it works from any folder.

The preview simulates the trial on the device, returns sample items for "Analyze", and uses the built-in recipes. It is a preview of the app's screens and flow, not the native app: no push notifications, and "Take photo" uses the browser's file/camera picker. Screens that need a confirmation use an in-app dialog because browsers and embedded viewers do not reliably show `confirm()`.

The bootstrap also keeps the preview working where a host serves it from a nested URL, blocks history changes, or forbids `<base>`, and follows an explicit light/dark choice from the host.

## Run it with real scanning

1. Start the backend (needs an Anthropic API key):

   ```bash
   cd server
   npm install
   cp .env.example .env     # set ANTHROPIC_API_KEY, and ALLOW_UNAUTHENTICATED=true for local dev
   npm run dev              # http://localhost:8787
   ```

2. Point the app at it, then restart Metro with a cleared cache (Expo inlines `EXPO_PUBLIC_*` values, and a stale cache silently keeps the old ones):

   ```bash
   cp .env.example .env     # set EXPO_PUBLIC_API_URL=http://<your-computer-ip>:8787
   npx expo start -c
   ```

   On a physical phone use your computer's LAN IP, not `localhost`.

### How scanning works

`photo -> resized to 1568px JPEG on the phone -> POST /v1/scan -> Claude (vision, structured JSON) -> editable review screen -> saved on the device`

- The model returns each item's name, category, quantity, a shelf-life estimate, and the printed date when one is legible. Printed dates win over estimates; implausible ones (years off, in the far past) are discarded.
- Nothing is saved until the person reviews it. Estimates are labelled "Estimated" and are editable. They are typical shelf lives, not food-safety guarantees.
- Meal ideas are ranked by how soon their ingredients expire. Items already past their date are never suggested.
- The server defaults to `claude-opus-5-5` (override with `ANTHROPIC_MODEL`), with `output_config.effort` set explicitly (scan: medium, meals: low) and server-side refusal fallback enabled. Photos are not stored or logged by the server.

Rough cost, as an estimate to check against your own usage: a 3-photo scan is about 8k input tokens plus a few thousand output tokens, so on the order of $0.05 to $0.10 with Opus 5.5 pricing, and about half that on Sonnet 5.5 (`ANTHROPIC_MODEL=claude-sonnet-5-5`). Per-user daily caps (`SCANS_PER_DAY`, `MEALS_PER_DAY`) bound worst-case spend.

## Monetization: 14-day free trial, then $9.99/month

The trial is a **store-side introductory offer**, so the App Store and Google Play collect consent and payment details up front and convert automatically after 14 days. The app reads the result through RevenueCat (entitlement `pro`; a trial reports `periodType: trial`).

Accounts and configuration you need to create (none of this can be done from code):

1. **Apple Developer + App Store Connect:** an app record, one auto-renewable monthly subscription at $9.99, with a **free-trial introductory offer of 2 weeks**.
2. **Google Play Console:** an app, one monthly subscription base plan at $9.99, with a **14-day free-trial offer**.
3. **RevenueCat:** a project with both apps, both products attached to an entitlement with the id `pro`, and a default offering containing the monthly package.
4. Put the RevenueCat **public** SDK keys in the app's `.env` (`EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY`). Put the RevenueCat **secret** key on the server (`REVENUECAT_SECRET_KEY`). The server uses it to reject scan and meal requests from anyone without an active trial or subscription.

How the app behaves:

- First launch: onboarding, then the paywall. Starting the trial opens the store's purchase sheet.
- While the trial or subscription is active the whole app is unlocked. When it lapses, the app returns to the paywall on the next foreground (hard paywall).
- Someone who already used a trial sees "Subscribe for $9.99/month" instead of "Start free trial". Trial eligibility is enforced by the stores per Apple ID / Google account, so reinstalling does not grant another trial.
- `TRIAL_DAYS`, `PRICE_PER_MONTH` and the wording constants in `src/billing/trial.ts` are used for display copy only. Keep them in step with the store offers. The price shown on the paywall comes from the store when available.
- A local notification warns 2 days before the trial ends (1 day if less time is left) with the price and end date, as long as notifications are allowed.
- The paywall shows the price, trial length, the date the first charge happens, auto-renewal terms, Restore purchases, and in-app Terms and Privacy screens (guideline 3.1.2).
- **Safety net:** without RevenueCat keys, a production build fails closed (nobody gets access). The local trial simulation only runs in development, Expo Go, or when `EXPO_PUBLIC_BILLING_MODE=demo` is set. Never set that flag for a store release, because on-device state is trivially bypassable.

RevenueCat needs a **development build** (not Expo Go): `npx eas-cli build --profile development --platform ios` (or `android`). Test purchases with App Store sandbox / Play test accounts.

## Before you submit to the stores

The app-side work is done; what is left needs your accounts and decisions. `store/README.md` has the full checklist, `store/subscription-setup.md` the exact App Store Connect / Play / RevenueCat steps for the $9.99 monthly plan with a 2-week free trial, and `store/privacy-and-compliance.md` the answers for Apple's privacy details and Google's Data safety form.

- [ ] Replace the placeholder bundle id / package (`com.fridgepulse.app`) in `app.json`, and the developer name and support email in `src/lib/config.ts`, with your own.
- [ ] Host the policies: `npm run legal:build` writes `docs/legal/privacy.html` and `terms.html` (copy them to any HTTPS host, or enable GitHub Pages), then set `EXPO_PUBLIC_PRIVACY_URL` / `EXPO_PUBLIC_TERMS_URL`. The store forms need those URLs. The policy text must be reviewed by you (ideally a lawyer) before release. It states that photos and item names go to a third-party AI provider (Anthropic) only after the user agrees in the app.
- [ ] Deploy the backend (`server/Dockerfile`; any Node 22 host works) over HTTPS and set `EXPO_PUBLIC_API_URL`. Set `TRUST_PROXY=true` behind a reverse proxy. Rate-limit counters are in memory, so use one instance or move them to Redis.
- [ ] Test with real photos of real fridges. Scan accuracy, date reading and shelf-life estimates depend on the model and prompt (`server/src/prompts.ts`), and I could not evaluate them without an API key.
- [ ] Build with EAS: `npx eas-cli build --profile production`, then `eas submit` (fill the placeholders in `eas.json`).
- [ ] Upload the screenshots in `store/screenshots/` (regenerate with `SCREENSHOT_MODE=1 npm run preview:build && CHROMIUM_PATH=<chromium> npm run store:screenshots`, then `npm run preview:build` for the normal preview). They are drawn from the demo build with sample data, so replace them with device screenshots if you prefer.
- [ ] Review notes for Apple: the subscription review screenshot is `store/screenshots/subscription-review-paywall.png`. Give the reviewers a way past your backend if it needs sign-in (it does not by default).

### Privacy and AI consent

Before the first photo scan or AI meal request, the app asks for explicit permission and names the AI provider (Apple guideline 5.1.2(i)). Declining keeps the app usable: items can be added by hand and meal ideas come from a built-in list. The choice can be changed in Settings > Privacy and data; turning it off stops uploads immediately and clears saved AI meal ideas.

### Adding items by typing

"Add items by hand" (Home when empty, or the Scan screen) opens a list where suggestions appear as you type (`src/components/AddItemField.tsx`, logic in `src/lib/suggest.ts`):

- Your own foods come first (anything you have added in the last 90 days, most frequent first), then about 380 common groceries (`src/lib/foodCatalog.ts`).
- Matches the start of any word ("milk" finds Oat milk; "gr yo" finds Greek yogurt), ignores accents and case, and forgives typos ("brocoli", "chiken", "avacado") when nothing matches as typed.
- Each suggestion shows its emoji and how long it keeps where you are storing it. Frozen foods go to the freezer on their own. Tapping one adds it with the right category and an estimated date; the field clears and keeps the keyboard up for the next item. Return or Add adds exactly what you typed.
- Everything runs on the phone; nothing typed is sent anywhere.

Building the catalog meant checking the app's shelf-life and emoji rules against 380 foods, which found and fixed real errors: leftover pasta and rice were estimated at a year (they matched "pasta"/"rice" before "leftover"), peanut butter at 2 days in the pantry (it matched "butter"), fish sauce at 2 days, orange juice at 4 weeks, and canned tomatoes at 5 days in the pantry. `__tests__/shelflife-scan.test.ts` pins the corrected figures.

### Food images

Foods are shown with emoji chosen by name (`src/components/categories.ts`, pinned by a 118-food table test and reviewed visually and blind). Real photos were requested but could not be downloaded from this build environment, so none are included. `docs/food-photos.md` explains the blocker, the licences that are safe for a paid app, the three-step accuracy check to apply, and the design for adding them.

## Development

```bash
npm test               # app tests: dates, expiry, meals, reminders, billing, pricing consistency, contrast, emoji accuracy, store listing limits, dependency guard
npm run typecheck
npm run lint
cd server && npm test  # 30 server tests
npx expo export --platform ios --platform android   # proves the native bundles resolve every import
```

Preview in a browser (uses demo billing): `npm run export:web`, then serve `dist/`. Camera capture is native-only; on web the library picker is used.

Notifications: one digest per day for the next 14 days, listing items that expire today or tomorrow, rescheduled whenever the inventory or settings change and whenever the app comes to the foreground. Tapping one opens the Meals tab.

### API contract (app to server)

`Authorization: Bearer <RevenueCat app user id>` on every call. Errors are `{ "error": { "code", "message" } }` with 401/402 (not subscribed), 400/413 (bad input), 422 (model declined), 429 (rate limited, with `Retry-After`), 502/503 (upstream).

- `POST /v1/scan` `{ location, today, locale, images: [{ mediaType, data(base64) }] }` returns `{ items: [{ name, category, quantity, shelfLifeDays, labelExpiryDate, confidence }], notes }`
- `POST /v1/meals` `{ today, diet, servings, exclude, items: [{ name, category, quantity, daysLeft }] }` returns `{ meals: [{ title, summary, minutes, servings, uses, extras, steps }] }`

The shapes are defined in `server/src/schemas.ts` (zod) and mirrored in `src/lib/types.ts` and `src/lib/api.ts`. Change them together.

## What has and has not been verified

Verified in the build environment:

- App and server typecheck, lint is clean, and all 403 app tests and 30 server tests pass. The tests include: the price and trial length appear only as $9.99 and 2 weeks across the app, store listing and legal text; every text/background colour pair meets WCAG AA contrast in light and dark; store listing fields fit Apple and Google limits; the emoji chosen for about 200 foods, the typing suggestions (ranking, typos, history), and a shelf-life estimate for every catalog food in every location.
- The iOS and Android bundles export (`expo export`), which proves every import resolves natively. This caught a real defect, a missing `expo-asset` dependency that would have broken the native build, and a test now guards it.
- The web build was driven in Chromium through the full journey in light and dark mode, on an emulated iPhone, inside a sandboxed iframe, from a nested path, under a strict content-security policy: onboarding, the trial and its price/date wording, sample scan, review and edit, save, every tab, item detail, Settings (plan, restore, legal screens), trial expiry to paywall, and re-subscribe.
- End to end against the real server with only Anthropic faked: the consent prompt appears before anything is sent (declining sends nothing), a real 2400x1800 photo is downscaled to 1568px, uploaded, validated, sent to the model with the expected model, effort, structured-output format and fallback setting, and the parsed result, label-date handling, meal ideas, a model refusal, and withdrawing then restoring consent all behave correctly in the UI.
- Typing suggestions were driven in Chromium on an emulated iPhone in light and dark: suggestions after one letter, typo correction, tap to add, the field keeping focus, frozen food going to the freezer, and your own foods coming first on the next visit.
- The 118 food emoji were checked by a rule table, a rendered visual review, and an independent blind identification; see `docs/food-photos.md`.

**Not verified** (needs your hands or credentials):

- Real food photos. They could not be downloaded from this environment; see `docs/food-photos.md`.
- Running on an iOS or Android device or simulator: real camera capture, permission prompts, haptics, modal presentation, safe areas, and scheduled local notifications (including the trial-ending reminder).
- Real purchases through StoreKit / Play Billing / RevenueCat, including the free-trial conversion, and that the store products match the offer in `src/billing/trial.ts`.
- Real Anthropic responses. The request shape was tested against a fake API using the real SDK, but no live call was made, so scan accuracy on real photos is unmeasured.
- Legal text is a reasonable starting point, not legal advice.
