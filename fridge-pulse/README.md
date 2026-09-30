# Fridge Pulse

Photograph your fridge, freezer or pantry. Fridge Pulse lists what is inside, tracks what is about to expire, reminds you before it goes off, and suggests meals that use it up first. When food is about to go, it helps you rescue it: swipe it away as used, freeze it in time, or cook it, and watch your no-waste streak grow. A shopping list closes the loop, putting new food away with its own expiry dates.

**Pricing:** free for 2 weeks (14 days), then $9.99 per month. Hard paywall once the trial ends. The offer is defined once in `src/billing/trial.ts`, and `__tests__/pricing.test.ts` fails if any other price or trial length appears in the app or store listing.

Built with Expo (SDK 57) and React Native, plus a small Node backend that holds the Anthropic API key.

```
fridge-pulse/
  src/app/          Screens (Expo Router): onboarding, paywall, tabs (Pulse, Items, List, Meals, Settings), scan, review, item detail, about, legal
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

## Rescuing food: what the app does

- **Swipe to resolve.** On Pulse and Items, swipe a row right when you used it, left if it was thrown out (or tap the check). The row slides away, a message bar confirms it with a countdown and **Undo**, and using food in its last three days is celebrated as a rescue with a burst of leaves. Screen readers get the same actions from the row's actions menu.
- **Your impact.** A card on Pulse shows food rescued in the last 30 days, a no-waste streak (days since anything was thrown out), the last seven days as a chart of used versus thrown out, and progress to the next rescue milestone (1, 5, 10, 25...). Counts only; nothing is estimated.
- **Freeze it.** When food that freezes well is due within three days, its detail screen offers to move it to the freezer, with the new date (chicken: about 9 months). Foods that freeze badly (salad leaves, eggs in the shell, mayonnaise, soft cheese) are never offered.
- **Keep it fresh.** Each item shows one or two storage tips from USDA / FSIS / FDA consumer advice: raw poultry on the bottom shelf, cut mould from hard cheese but bin soft cheese, keep basil out of the fridge, and so on.
- **I made this.** Open a meal idea and tap "I made this" to mark every tracked ingredient it used as used, with one Undo.
- **Shopping list.** A List tab with typing suggestions, "Buy again" chips for food you finished recently, sharing, and **Put away**: ticked-off items open a review with each food headed where it usually lives (bananas in the cupboard, milk in the fridge, ice cream in the freezer) and saved with its own estimated date.
- **Motion.** A heartbeat logo that beats faster when food needs using, a freshness bar that grows in, rows and cards that fade in, springy buttons, a scan line over your photo while it is read, and a countdown on the message bar. Everything respects the phone's Reduce Motion setting (and turns off in screenshot builds).

## Unfamiliar food: looked up online, confirmed from a picture

When a scan finds something the app does not know (a name with no shelf-life rule and not in its food list, or a product the scan could only describe, like "Jar of red paste"), Fridge Pulse looks it up by itself:

1. The review screen shows "Looking this up online..." under that item. The server sends Claude the photo the item was seen in, the scan's name and what it saw ("Red plastic tub, green lid, Korean label"), and Claude searches the web for the exact product and how long it keeps.
2. The server then finds a picture of that product: by barcode or name on Open Food Facts for packaged food, or on Wikipedia for fresh food. Pictures only ever come from those two sources; the model never supplies an image address.
3. The item shows **"Is this your item?"** with the picture, the name and brand, how long it keeps where it is stored, why it matches and the source. **Yes, that's it** saves it; **No** shows the next match (up to three); after the last "No" it says there was no confident match and the item stays as scanned.
4. Confirmed foods go into **Your foods** (Settings > Your foods), a database on the phone. From then on the food has its own shelf life in the fridge, freezer and pantry, its picture shows in lists, typing suggests it, and later scans are told about it so they name it straight away instead of looking it up again. Foods can be removed there; "Delete all my data" clears them.

Typed items the app does not know get a "Look it up online" link instead (name only, on request). Leftovers are never looked up. At most five items are looked up automatically per scan, two at a time; leaving the review screen or removing an item stops its search.

In the web preview (no server) the sample scan includes a mystery tub that "finds" gochujang or ssamjang with drawn sample pictures, so the flow can be tried without an API key.

## How accurate are the expiry dates?

Every date the app estimates comes from `src/lib/shelfLife.ts`, and every figure there is checked by a test against an independent reference:

- `test-utils/shelfLifeReference.json` holds fridge, freezer and pantry ranges for 411 foods, compiled without seeing the app's figures from USDA FoodKeeper, the FDA refrigerator and freezer chart and FSIS guidance.
- `__tests__/shelflife-reference.test.ts` fails if any estimate falls outside its range. The only exceptions are written into the test with their reasons: fresh chorizo uses the raw-sausage figure (the shorter, safer one), estimates stop at two years, and a jar or carton in the cupboard is treated as unopened (an opened one would be in the fridge).
- Food that must not sit out gets "use today" in the pantry, and food that freezes badly never gains time by being frozen.
- AI estimates from a photo can shorten a date (wilted greens) but, for a food the app recognises, never exceed the guidance in the fridge or freezer. The scan prompt carries the same reference figures.

Foods confirmed from an online lookup use the shelf life found for them (the shorter figure when sources disagree, clamped to two years, and "not advised" for freezing when no freezer figure was found). Those come from web sources rather than the reference table, and the Your foods screen says so.

These are estimates for a reminder app, not food-safety guarantees; the app labels them and lets people edit every date.

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
- The server defaults to `claude-opus-5-5` (override with `ANTHROPIC_MODEL`), with `output_config.effort` set explicitly (scan: medium, meals: low, identify: medium) and server-side refusal fallback enabled. Photos are not stored or logged by the server.

Looking up an unfamiliar item:

`photo + name + clue -> POST /v1/identify -> Claude with web search (web_search_20260209, at most 4 searches) -> answer through a strict report_food tool -> picture from Open Food Facts / Wikipedia -> "Is this your item?" -> Your foods`

- The answer comes back through a strict tool rather than structured output so it can be combined with the web search server tool; paused server-tool turns are resumed, and a model that forgets to report is asked once more before the lookup fails.
- Searches favour the country in the phone's locale. Picture lookups send only product words, identify the server with `PICTURE_USER_AGENT` (set a contact address, as Open Food Facts asks) and are cached for 12 hours.

Rough cost, as an estimate to check against your own usage: a 3-photo scan is about 8k input tokens plus a few thousand output tokens, so on the order of $0.05 to $0.10 with Opus 5.5 pricing, and about half that on Sonnet 5.5 (`ANTHROPIC_MODEL=claude-sonnet-5-5`). A lookup is dearer than a scan: up to four web searches ($10 per 1,000 searches, so at most $0.04) plus the search results as input tokens, very roughly $0.05 to $0.25 each. Each food is looked up once, since confirmed foods are recognised afterwards. Per-user daily caps (`SCANS_PER_DAY` 15, `MEALS_PER_DAY` 40, `IDENTIFIES_PER_DAY` 10) bound worst-case spend.

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
- [ ] Set `PICTURE_USER_AGENT` on the server to include your contact address (Open Food Facts asks every client to identify itself), and check that web search is enabled for your Anthropic organization (Console > Settings), or lookups will find nothing.
- [ ] Try the online lookup with real unfamiliar products (foreign-label jars, niche brands) and check the pictures and shelf lives it finds before relying on them.
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
cd server && npm test  # 56 server tests
npx expo export --platform ios --platform android   # proves the native bundles resolve every import
```

Preview in a browser (uses demo billing): `npm run export:web`, then serve `dist/`. Camera capture is native-only; on web the library picker is used.

Notifications: one digest per day for the next 14 days, listing items that expire today or tomorrow, rescheduled whenever the inventory or settings change and whenever the app comes to the foreground. Tapping one opens the Meals tab.

### API contract (app to server)

`Authorization: Bearer <RevenueCat app user id>` on every call. Errors are `{ "error": { "code", "message" } }` with 401/402 (not subscribed), 400/413 (bad input), 422 (model declined), 429 (rate limited, with `Retry-After`), 502/503 (upstream).

- `POST /v1/scan` `{ location, today, locale, images: [{ mediaType, data(base64) }], known?: [{ name, looks }] }` returns `{ items: [{ name, category, quantity, shelfLifeDays, labelExpiryDate, confidence, clue, photo }], notes }`
- `POST /v1/identify` `{ name, category, location, clue?, today, locale?, image?: { mediaType, data } }` returns `{ candidates: [{ name, brand, product, category, keptIn, shelfLife: { fridge, freezer, pantry }, looks, why, sourceUrl, image: { url, credit, pageUrl } | null }] }` (an empty list means no confident match)
- `POST /v1/meals` `{ today, diet, servings, exclude, items: [{ name, category, quantity, daysLeft }] }` returns `{ meals: [{ title, summary, minutes, servings, uses, extras, steps }] }`

The shapes are defined in `server/src/schemas.ts` (zod) and mirrored in `src/lib/types.ts` and `src/lib/api.ts`. Change them together.

## What has and has not been verified

Verified in the build environment:

- App and server typecheck, lint is clean, and all 922 app tests and 56 server tests pass. The tests include: every food's shelf life in all three places against the independent reference; the price and trial length appear only as $9.99 and 2 weeks; every text, control and switch colour meets WCAG AA contrast in light and dark; typing suggestions; the rescue stats, streak and milestones; the shopping list and put-away; diet filters; the reminder scheduler under rapid changes; the online lookup (which items are looked up, the answer checked at the app's trust boundary, pictures only from the two allowed hosts, Yes / No / cancel, the food database feeding shelf life, suggestions and later scans); the identify request sent through the real SDK to a fake API (photo, web search limits, strict report tool, resuming a paused turn, one nudge, refusals); picture lookups against stand-in Open Food Facts and Wikipedia services; and a render of every animated component through to the end of its animation.
- The iOS and Android bundles export (`expo export`), which proves every import resolves natively.
- In Chromium on an emulated iPhone, in light mode, dark mode and with Reduce Motion on, a scripted run covers adding food by typing, rescuing with the check mark and Undo, swiping food away, freezing an item in time, storage tips, the name guard, adding to and ticking off the shopping list, "Buy again", putting shopping away, "I made this", and the discard prompt, with no console errors or warnings. A second scripted run covers the lookup: the mystery item is looked up on its own, "Is this your item?" shows a picture, "No" steps to the next match and then to no match, "Yes" renames the item and saves it to Your foods, its picture then appears in Items, the next scan names it without a lookup, and typing suggests it. The earlier onboarding-to-subscription runs, a strict-CSP embedded run, and an end-to-end run against the real server (with Anthropic, Open Food Facts and Wikipedia faked) all pass; the end-to-end run now includes a lookup from a real uploaded photo through to a tracked item with the looked-up shelf life.
- A full-app review found 17 defects (among them: reminders scheduled twice when settings changed quickly, dates going stale in an app left open overnight, items savable with a blank name, over-80-item meal requests failing, a scan result appearing after cancelling, gluten-free and vegan filters missing foods, food used after its date counted as rescued, an unreadable Undo). Each is fixed and has a test.

**Not verified** (needs your hands or credentials):

- Real food photos, and scan accuracy on real photos (no API key here).
- Running on an iOS or Android device or simulator: camera, permission prompts, haptics, swipe feel on a real touch screen, modal presentation, safe areas, and scheduled notifications.
- Real purchases through StoreKit / Play Billing / RevenueCat, including the trial converting and a cancelled trial not renewing.
- Real Anthropic responses. The request shape was tested against a fake API using the real SDK, but no live call was made. That includes web search: how well real searches identify real products, and how accurate the shelf lives they find are, is untested.
- Real Open Food Facts and Wikipedia responses and pictures (this environment cannot reach them); the parsing follows their documented response formats and was tested against stand-ins.
- Legal text is a reasonable starting point, not legal advice.
