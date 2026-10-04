# Fridge Pulse

*Your kitchen's vital sign.* Photograph your fridge, freezer or pantry. Fridge Pulse lists what is inside, tracks what is about to expire, reminds you before it goes off, and suggests meals that use it up first. When food is about to go, it helps you rescue it: swipe it away as used, freeze it in time, or cook it, and watch your no-waste streak grow. A shopping list closes the loop, putting new food away with its own expiry dates.

**Pricing:** free for 2 weeks (14 days), then $9.99 per month or $59.99 per year. The household plan, $14.99 per month or $89.99 per year, also covers up to 8 people in the payer's shared household. Hard paywall once the trial ends. The offer is defined once in `src/billing/trial.ts`, and `__tests__/pricing.test.ts` fails if any other price or trial length appears in the app or store listing.

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

## Look and feel

The app follows the brand sheet (`docs/brand.md`): a dark neon interface in Pulse Magenta, Electric Blue, Zesty Orange and Lime Spark, Montserrat headlines with Open Sans text, glowing card outlines, and a heartbeat that runs through the logo and the dashboard.

- **Home dashboard.** The "Fridge Pulse" wordmark and a beating neon fridge logo, a glowing dashboard card with the **Freshness score** (the share of your food with more than 3 days left, as a lime meter), the colour-coded freshness bar and a scrolling heart-monitor trace, then a big orange **Scan your fridge** button.
- **Dark by default**, with Light and Match phone under Settings > Appearance. Every text and control colour passes WCAG AA in both looks (`__tests__/contrast.test.ts`); the orange button keeps its white label at large-text size so it does too.
- **New icon and store art**: the neon fridge on a blue-to-orange tile (`scripts/brand-assets.mjs` renders every size), a dark neon splash screen, and store screenshots and the Play feature graphic in the same style.

## Rescuing food: what the app does

- **Swipe to resolve.** On Pulse and Items, swipe a row right when you used it, left if it was thrown out (or tap the check). The row slides away, a message bar confirms it with a countdown and **Undo**, and using food in its last three days is celebrated as a rescue with a burst of leaves. Screen readers get the same actions from the row's actions menu.
- **Your impact.** A card on Pulse shows food rescued in the last 30 days, a no-waste streak (days since anything was thrown out), the last seven days as a chart of used versus thrown out, and progress to the next rescue milestone (1, 5, 10, 25...). Counts only; nothing is estimated.
- **Freeze it.** When food that freezes well is due within three days, its detail screen offers to move it to the freezer, with the new date (chicken: about 9 months). Foods that freeze badly (salad leaves, eggs in the shell, mayonnaise, soft cheese) are never offered.
- **Keep it fresh.** Each item shows one or two storage tips from USDA / FSIS / FDA consumer advice: raw poultry on the bottom shelf, cut mould from hard cheese but bin soft cheese, keep basil out of the fridge, and so on.
- **I made this.** Open a meal idea and tap "I made this" to mark every tracked ingredient it used as used, with one Undo.
- **Receipt scanning.** "Scan a receipt" on Pulse (or the Receipt switch on the scan screen) reads a shopping receipt: abbreviations are expanded ("BNLS SKNLS CHKN BRST" is chicken breast), bags, cleaning products, tax and totals are skipped, each food is headed for the fridge, freezer or pantry with its own Fridge / Freezer / Pantry choice, and dates count from the day on the receipt. See "Receipts" below.
- **Calories and macros.** Every item's detail screen shows calories, protein, carbs, fat and fibre for a typical portion and per 100 g, plus the whole amount when the quantity is a weight or a count ("1.3 lb" of bananas). Every meal idea shows calories on its card and a per-serving breakdown when opened. See "Nutrition" below.
- **Protein and calorie goals.** Settings > Health and goals > Your goals turns weight (plus optional height, age, sex, activity and goal) into a daily protein target in grams per kilogram and, with height and age, a calorie target. The Meals tab shows protein left today, a "Most protein" order and a "High protein" tag.
- **A food log that fills itself.** "I made this" logs a serving of the meal with its figures (one Undo takes back both), an item's screen has "Log 1 medium", and the food log screen adds tracked food in one tap, typed food, or a quick calorie entry. A Today card on Pulse shows protein and calories against the goals.
- **Apple Health and Health Connect.** Connect from Pulse or Settings: steps, active energy and workouts come in for the Today card and active days, and logged food goes out as dietary energy, protein, carbs and fat.
- **Money from receipts.** Receipts now carry each line's price, so the Impact card shows what was rescued and what was thrown out this month, in money. Prices can be typed on any item too.
- **Shared household.** Settings > Household: start one and share the invite code, or join with one. Everyone sees one food list and one shopping list, and new items show who added them.
- **Weekly score.** A score out of 100 on Pulse from the last seven days: food used rather than thrown out, protein goal days and active days. Parts with nothing to count are left out, not marked down.
- **184 built-in recipes.** Without AI (or offline) the Meals tab picks from a library of omelets, curries, soups, salads, pasta, tacos, traybakes, sides, snacks, desserts and drinks, best first, six at a time with "More ideas". See "Meal ideas" below.
- **Shopping list.** A List tab with typing suggestions, "Buy again" chips for food you finished recently, sharing, and **Put away**: ticked-off items open a review with each food headed where it usually lives (bananas in the cupboard, milk in the fridge, ice cream in the freezer) and saved with its own estimated date.
- **Motion.** A heartbeat logo that beats faster when food needs using, a heart-monitor trace on the dashboard, a freshness meter that fills up, a freshness bar that grows in, rows and cards that fade in, springy buttons, a scan line over your photo while it is read, and a countdown on the message bar. Everything respects the phone's Reduce Motion setting (and turns off in screenshot builds).

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
- Meal ideas are ranked by how soon their ingredients expire. Items already past their date are never suggested. The AI is told to use each food the way a cook would (no dessert food in savoury dishes), and the app drops any AI idea that still puts, say, ice cream into a soup (`plausibleMeal` in `src/lib/meals.ts`).
- The server defaults to `claude-opus-5-5` (override with `ANTHROPIC_MODEL`), with `output_config.effort` set explicitly (scan: medium, meals: low, identify: medium) and server-side refusal fallback enabled. Photos are not stored or logged by the server.

Looking up an unfamiliar item:

`photo + name + clue -> POST /v1/identify -> Claude with web search (web_search_20260209, at most 4 searches) -> answer through a strict report_food tool -> picture from Open Food Facts / Wikipedia -> "Is this your item?" -> Your foods`

- The answer comes back through a strict tool rather than structured output so it can be combined with the web search server tool; paused server-tool turns are resumed, and a model that forgets to report is asked once more before the lookup fails.
- Searches favour the country in the phone's locale. Picture lookups send only product words, identify the server with `PICTURE_USER_AGENT` (set a contact address, as Open Food Facts asks) and are cached for 12 hours.

Rough cost, as an estimate to check against your own usage: a 3-photo scan is about 8k input tokens plus a few thousand output tokens, so on the order of $0.05 to $0.10 with Opus 5.5 pricing, and about half that on Sonnet 5.5 (`ANTHROPIC_MODEL=claude-sonnet-5-5`). A lookup is dearer than a scan: up to four web searches ($10 per 1,000 searches, so at most $0.04) plus the search results as input tokens, very roughly $0.05 to $0.25 each. Each food is looked up once, since confirmed foods are recognised afterwards. Per-user daily caps (`SCANS_PER_DAY` 15, `MEALS_PER_DAY` 40, `IDENTIFIES_PER_DAY` 10) bound worst-case spend.

## Monetization: 14-day free trial, then monthly, yearly or household

| Plan | US price | Who it covers |
| --- | --- | --- |
| Monthly | $9.99 per month | The payer |
| Yearly (picked first on the paywall, "Save 50%") | $59.99 per year | The payer |
| Household monthly | $14.99 per month | The payer and up to 7 others in their shared household |
| Household yearly | $89.99 per year | The same, billed yearly |

The trial is a **store-side introductory offer** on every plan, so the App Store and Google Play collect consent and payment details up front and convert automatically after 14 days. The app reads the result through RevenueCat (entitlement `pro` on every plan, plus `household` on the household plans; a trial reports `periodType: trial`; the product id says which plan).

Accounts and configuration you need to create (none of this can be done from code; `store/subscription-setup.md` has every step):

1. **Apple Developer + App Store Connect:** an app record and one subscription group with the four auto-renewable subscriptions, each with a **free-trial introductory offer of 2 weeks**. Household plans on level 1, the others on level 2.
2. **Google Play Console:** the four subscriptions (monthly or yearly base plans), each with a **14-day free-trial offer**.
3. **RevenueCat:** a project with both apps; entitlement `pro` on all four products and `household` on the two household products; a default offering with the Monthly and Annual packages and custom `household_monthly` / `household_annual` packages.
4. Put the RevenueCat **public** SDK keys in the app's `.env` (`EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY`). Put the RevenueCat **secret** key on the server (`REVENUECAT_SECRET_KEY`). The server uses it to reject requests from anyone without an active trial, subscription or household cover.

How the app behaves:

- First launch: onboarding, then the paywall. Starting the trial opens the store's purchase sheet.
- While the trial or subscription is active the whole app is unlocked. When it lapses, the app returns to the paywall on the next foreground (hard paywall).
- The paywall has a plan picker: "Just me" or "Household", then Yearly or Monthly. Yearly is picked first; its saving is worked out from the store's own prices.
- Someone who already used a trial sees "Subscribe for" and the picked plan's price instead of "Start free trial". Trial eligibility is enforced by the stores per Apple ID / Google account and subscription group, so reinstalling or switching plans does not grant another trial.
- Settings > Plans switches plan once unlocked. On Android the app passes the old subscription to Google Play (with time proration) so nobody pays twice; the App Store does this itself within the group.
- `PLANS`, `TRIAL_DAYS` and the wording constants in `src/billing/trial.ts` are used for display copy only. Keep them in step with the store offers. The prices shown come from the store when available.
- A local notification warns 2 days before the trial ends (1 day if less time is left) with the picked plan's price and the end date, as long as notifications are allowed.
- The paywall shows the picked plan's price, trial length, the date the first charge happens, auto-renewal terms, Restore purchases, and in-app Terms and Privacy screens (guideline 3.1.2).
- **Household plan:** the server records the payer against their household whenever their phone calls it (the `household` entitlement and its end date from RevenueCat). Members without a plan are let in while that date is in the future; when it passes, and every 6 hours before then (`SPONSOR_RECHECK_MS`, so a refund ends the cover within hours), the server asks RevenueCat about the payer again, so a renewal carries on without the payer opening the app. Joining, viewing and leaving a household work without a plan, so a covered person can join from the paywall ("Someone at home has the household plan?"). The app unlocks on its own plan or on the household's `coveredUntil` (`isCovered` in `src/store/household.ts`).
- **Safety net:** without RevenueCat keys, a production build fails closed (nobody gets access). The local trial simulation only runs in development, Expo Go, or when `EXPO_PUBLIC_BILLING_MODE=demo` is set. Never set that flag for a store release, because on-device state is trivially bypassable.

RevenueCat needs a **development build** (not Expo Go): `npx eas-cli build --profile development --platform ios` (or `android`). Test purchases with App Store sandbox / Play test accounts.

## Before you submit to the stores

The app-side work is done; what is left needs your accounts and decisions. `store/README.md` has the full checklist, `store/subscription-setup.md` the exact App Store Connect / Play / RevenueCat steps for the four plans with a 2-week free trial, and `store/privacy-and-compliance.md` the answers for Apple's privacy details and Google's Data safety form.

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

### Meal ideas

The built-in recipes (`src/lib/recipes.ts`, 184 of them) never match food by a word in its name or by its category. Each food gets culinary **roles** from an ordered table (`src/lib/ingredients.ts`): spinach can be a salad leaf or cooking greens, cherry tomatoes go raw or roasted, heavy cream cooks or whips, ice cream is only ever ice cream. A recipe slot asks for roles ("a vegetable that roasts", "a cheese that melts", "fruit for a crumble"), so:

- ice cream never lands in a soup because its name contains "cream", strawberries never count as a vegetable, and leftover lasagna is not cooked into anything;
- compound names read the way a cook reads them: the rule whose match ends furthest right wins ("honey roast ham" is ham, "strawberry yogurt" is a sweet yogurt, "peanut butter" is not butter), and compound rules come before the words they end with;
- frozen food loses its raw uses (frozen spinach goes in soup, not salad), and food the table does not know is left out of the built-in recipes (the AI still sees it).

Steps are written for the meal actually suggested: lines appear only when their ingredient is used, `{veg}` becomes "spinach and bell peppers", and wording follows the diet (vegans get "plant milk" and "vegan butter", vegetarians "vegetable stock", gluten-free cooks "gluten-free soy sauce"). Ideas are ranked by how much soon-to-expire food they use, each page of six holds at most two of a kind, and one idea never marks more than eight items used. `__tests__/recipes.test.ts` checks every recipe against hand-written lists of sweet-only, savoury-only and leftover foods, renders each recipe with random kitchens, and checks the wording for every diet.

### Receipts

`receipt photo(s) -> POST /v1/scan with mode "receipt" -> Claude reads the food lines -> review: each item with its own place -> saved with the shopping date`

- The server uses a separate receipt prompt (`RECEIPT_SYSTEM` in `server/src/prompts.ts`) with the same output shape as a shelf scan plus `keptIn` per item and the `purchaseDate` printed on the receipt. Low-confidence lines keep the printed text as their clue, so the person can check it and the online lookup has something to search for (a receipt photo is never sent to the lookup, since it does not show the food).
- `toDrafts` (`src/lib/scan.ts`) decides where each item goes: the app's own rule for food it knows (bananas on the counter, ice cream in the freezer), the reader's answer for anything else, and never the cupboard for food that must be chilled. Dates count from the purchase date when it is believable (today or up to 30 days back), otherwise from today, and the saved item's "added" date is the day of the shop.
- A repeat of something already tracked stays ticked (it is more of it, not the same jar seen twice) but is labelled "Already tracked".
- Receipts can show the shop and the last digits of a payment card. The prompt reads only food lines and the date, the server keeps nothing, the tip on the scan screen says to fold card details over, and the privacy policy says so.
- In the preview, "Try a sample receipt" returns a sample shop.

### Nutrition

- `src/lib/nutritionData.ts` holds calories, protein, carbs, fat and fibre per 100 g, and a household portion, for 360 of the 383 foods in the typing catalog. The figures are USDA FoodData Central SR Legacy (public domain) as published in the TempoLife food database (CC BY 4.0, credited on the About screen); each line names the SR Legacy food it came from. The other 23 (halloumi, takeout, soup, oat milk...) vary too much or have no close SR Legacy entry, so they show "No nutrition figures" instead of a guess.
- `nutritionFor` (`src/lib/nutrition.ts`) matches a name exactly (any case, singular or plural, pack sizes like "80/20" or "x12" ignored) or by the catalog food it ends with ("Kirkland chicken breast"), but never when a word in front changes the food: dried apricots, chocolate milk, fried rice, cauliflower rice and light mayonnaise get no figures rather than wrong ones.
- Built-in recipes: each ingredient counts as its typical portion times how much of it goes into one serving (two eggs in an omelette, two slices in a sandwich, half a portion from an optional slot), plus half a tablespoon of oil or butter when the recipe cooks in it. The card says when some ingredients had no figures ("4 of 5 ingredients").
- AI meal ideas carry the model's own per-serving estimate (`nutrition` in the meals response). The app keeps it only when the numbers are sensible and the calories roughly match the macros (`toMealNutrition`).
- `__tests__/nutrition.test.ts` checks every row adds up (energy against the macros, at most 100 g per 100 g), spot-checks a dozen foods against USDA values typed in by hand, the name matching both ways, quantities, and that every built-in recipe gives a believable figure per serving.

### Goals, food log and the weekly score

- `src/lib/goals.ts`: protein at 1.0 g/kg (staying healthy), 1.3 when active, 1.4 to gain weight and 1.6 to lose weight or build muscle, at least 1.2 from 65, capped at 250 g, with a range shown around it (RDA 0.8 g/kg; ACSM / ISSN guidance for active people; Morton et al. 2018 for muscle; PROT-AGE for older adults). Calories: Mifflin-St Jeor times an activity factor, minus 500 to lose or plus 250 to 300 to gain, never below resting energy when losing or a 1,200 to 1,500 floor, and only for adults. The screen says these are general estimates and not for pregnancy, children or medical conditions. Body details stay on the phone.
- `src/lib/foodLog.ts` and `src/store/foodLog.ts`: entries keep figures per serving and the servings eaten (in halves), 90 days of history. `src/store/logActions.ts` adds and removes entries and keeps the health app in step (a servings change rewrites it once the taps stop).
- `src/lib/weekly.ts`: the rolling seven days. Food is used / (used + thrown out); protein is days at 90% of the goal out of 7 (counted once anything is logged); active days are 7,000 steps or a 20-minute workout, out of 5. The score is the average of the parts that can be counted.

### Apple Health and Health Connect

- `src/health/`: one `HealthProvider` interface with `provider.ios.ts` (HealthKit via `@kingstinct/react-native-healthkit`), `provider.android.ts` (Health Connect via `react-native-health-connect`) and `provider.ts` (sample data in the web preview, nothing in a real web build). The libraries are loaded on first use, so a build without their native modules (Expo Go, tests) treats health as unavailable instead of failing to start.
- Reads: daily steps, active energy and workout minutes for the last seven days, on launch and on return to the app. Writes: one sample each of dietary energy, protein, carbs and fat per logged entry (HealthKit) or one Nutrition record (Health Connect), removed again on Undo or delete.
- Config: the HealthKit plugin adds the capability and both usage strings; the Health Connect plugin adds the permission rationale activity; `app.json` lists the four Android permissions and `expo-build-properties` sets minSdk 26. These need a development or store build; Expo Go cannot load them. Store forms: see `store/privacy-and-compliance.md`.

### Shared households

`phone A change -> POST /v1/household/sync (changes since last push, cursor) -> server keeps the newest version per item -> phone B's next sync gets everything after its cursor -> merge`

- Server: `server/src/household.ts` on Node's built-in SQLite (`HOUSEHOLD_DB`, default `data/households.sqlite`; the Dockerfile declares `/app/data` as a volume; `HOUSEHOLD_DB=off` turns sharing off). Households have up to 8 members and 3,000 shared records; invite codes are 8 characters without look-alike letters, and wrong codes are limited to 10 a day per person. Member ids are stored as SHA-256 hashes of the app user id; the one exception is whoever pays for a household plan, whose app user id is kept with the household (with the plan's end date) so the server can ask RevenueCat about renewals, and is cleared when they leave or the plan ends. Deletions are kept 60 days; a clock more than 5 minutes fast cannot win. The last member leaving deletes the household.
- App: items and shopping entries carry `updatedAt`; removals are remembered as tombstones (`src/lib/householdSync.ts` merges, newest wins). `src/store/household.ts` syncs on launch, every 30 seconds while open, on return, and two seconds after a local change. Joining shares what the phone already has. Leaving keeps this phone's copy. Every member needs their own trial or subscription, unless someone in the household has the household plan, which covers them all.
- The preview has no server, so starting or joining there makes a sample household with a sample housemate and two of their items.

### Money from receipts

The receipt reader returns each line's total `price` and the receipt's `currency`; drafts and saved items keep them, and an item's screen lets a price be typed or cleared. `moneyThisMonth` (`src/lib/money.ts`) adds up the prices of items used or thrown out this calendar month (a rescue being one used in its last three days), in the most common currency, and says how many items it is based on. Items without a price are left out rather than guessed.

### Categories

A typed or scanned food gets its category from what the app knows first: a food the person has taught it, then the food list (so oat milk is always a drink, frozen pizza is a ready meal), then the food-list name it ends with ("organic baby spinach", "sliced pepperoni"), then word rules. Words at the front decide where they should ("canned peaches", "pickled onions", "dried apricots"), and meat-free versions of meat are not meat. `__tests__/categories.test.ts` checks every catalog food, its variants, and about 60 awkward names.

### Food images

Foods are shown with emoji chosen by name (`src/components/categories.ts`, pinned by a 118-food table test and reviewed visually and blind). Real photos were requested but could not be downloaded from this build environment, so none are included. `docs/food-photos.md` explains the blocker, the licences that are safe for a paid app, the three-step accuracy check to apply, and the design for adding them.

## Development

```bash
npm test               # app tests: dates, expiry, meals and recipes, categories, reminders, billing, pricing consistency, contrast, emoji accuracy, store listing limits, dependency guard
npm run typecheck
npm run lint
cd server && npm test  # 68 server tests
npx expo export --platform ios --platform android   # proves the native bundles resolve every import
```

Preview in a browser (uses demo billing): `npm run export:web`, then serve `dist/`. Camera capture is native-only; on web the library picker is used.

Notifications: one digest per day for the next 14 days, listing items that expire today or tomorrow, rescheduled whenever the inventory or settings change and whenever the app comes to the foreground. Tapping one opens the Meals tab.

### API contract (app to server)

`Authorization: Bearer <RevenueCat app user id>` on every call. Errors are `{ "error": { "code", "message" } }` with 401/402 (not subscribed), 400/413 (bad input), 422 (model declined), 429 (rate limited, with `Retry-After`), 502/503 (upstream).

- `POST /v1/scan` `{ mode?: "shelf" | "receipt", location, today, locale, images: [{ mediaType, data(base64) }], known?: [{ name, looks }] }` returns `{ items: [{ name, category, quantity, shelfLifeDays, labelExpiryDate, confidence, clue, photo, keptIn, price }], purchaseDate, currency, notes }` (`keptIn`, `price`, `purchaseDate` and `currency` are null for shelf photos)
- `POST /v1/identify` `{ name, category, location, clue?, today, locale?, image?: { mediaType, data } }` returns `{ candidates: [{ name, brand, product, category, keptIn, shelfLife: { fridge, freezer, pantry }, looks, why, sourceUrl, image: { url, credit, pageUrl } | null }] }` (an empty list means no confident match)
- `POST /v1/meals` `{ today, diet, servings, exclude, items: [{ name, category, quantity, daysLeft }] }` returns `{ meals: [{ title, summary, minutes, servings, uses, extras, steps, nutrition: { kcal, protein, carbs, fat } | null }] }` (nutrition is per serving)

- `GET /v1/household` returns `{ household: { name, code, members: [{ name, you, sponsor? }], coveredUntil } | null }` (`coveredUntil` is when the household plan covering everyone renews or ends, in ms, or null; `sponsor` marks whoever pays for it); `POST /v1/household` `{ name, memberName }` creates one; `POST /v1/household/join` `{ code, memberName }`; `POST /v1/household/leave`; `POST /v1/household/code` makes a new invite code. 404 means no such household (or not in one), 409 means already in one, full, or too many items.
- `POST /v1/household/sync` `{ since, changes: [{ kind: "item" | "shopping", id, updatedAt, deleted, data | null }] }` returns `{ cursor, more, changes: [...], household }`. Item and shopping data are checked against `SharedItemSchema` / `SharedShoppingSchema`.

The shapes are defined in `server/src/schemas.ts` (zod) and mirrored in `src/lib/types.ts` and `src/lib/api.ts`. Change them together.

## What has and has not been verified

Verified in the build environment:

- App and server typecheck, lint is clean, and all 1422 app tests and 79 server tests pass. The tests include: every food's shelf life in all three places against the independent reference; prices appear only as the four plans' and the trial only as 2 weeks, typed nowhere but `src/billing/trial.ts`; plan prices, the yearly saving from localised store prices, which plan a store product is, finding packages in the offering, and switching plans in the demo; the household plan on the server (recording the payer, a longer plan taking over, cover for members, asking RevenueCat again once the date passes so a renewal carries on and an ended plan stops, and every 6 hours before then so a refund stops it early, a refunded payer not covered by their own old record, a date still ahead holding while RevenueCat is unreachable, the payer leaving or switching, join without a plan, upgrading an older database); every text, control and switch colour meets WCAG AA contrast in light and dark; typing suggestions; the rescue stats, streak and milestones; the shopping list and put-away; diet filters; the reminder scheduler under rapid changes; the online lookup (which items are looked up, the answer checked at the app's trust boundary, pictures only from the two allowed hosts, Yes / No / cancel, the food database feeding shelf life, suggestions and later scans); the identify request sent through the real SDK to a fake API (photo, web search limits, strict report tool, resuming a paused turn, one nudge, refusals); picture lookups against stand-in Open Food Facts and Wikipedia services; and a render of every animated component through to the end of its animation.
- The iOS and Android bundles export (`expo export`), which proves every import resolves natively.
- Goals, food log, health, money, household and weekly score, in Chromium on an emulated iPhone (dark, light and Reduce Motion, no console errors): connecting the sample health app shows steps on the Today card; 80 kg, 180 cm, 30, male, active, build muscle gives 130 g protein and about 3,010 kcal, and a weight of 8 is flagged and not used; receipt prices show on the review and on items; logging a banana from its screen; using strawberries and throwing out bananas shows their prices as rescued and thrown out this month; the weekly score with all three parts; "Most protein" puts high-protein ideas first; "I made this" says it will log a serving and does; the food log lists entries, quick add works out calories from macros, and the day can be changed; starting a household shows an invite code, leaving and joining brings in the sample housemate's food, marked with who added it. The run also found and fixed a web-only bug: scrolling closed the keyboard, and a phone browser scrolls to show the field you tap.
- Plans, in the same setup (dark, light and Reduce Motion, no console errors): the paywall opens on Yearly with "Save 50%"; Monthly, Household (keeping the period) and Household yearly each change the price under the button and the small print; a trial on the household plan shows "Household, yearly" in Settings; starting a household shows "Your household plan covers everyone here"; switching to Yearly in Settings > Plans ends the cover and the household screen offers the plan instead; on a fresh phone, joining with a code from the paywall unlocks the app through the sample housemate's household plan, Settings says "Included in Sam (sample)'s household plan", and leaving the household goes back to the paywall; after a monthly trial ends, a household nobody pays for shows on the paywall with "Leave household", which works and then offers joining instead. The run found and fixed one copy slip (a sentence starting in lower case on the web).
- The HealthKit and Health Connect config plugins, checked with `expo config --type introspect`: the HealthKit entitlement and both usage strings, the four Health Connect permissions, the rationale activity and minSdk 26.
- Receipts and nutrition, in Chromium on an emulated iPhone (dark, light and Reduce Motion, no console errors): "Scan a receipt" opens the scan screen in receipt mode, the switch goes back and forth, the sample receipt lands on "Your receipt" with the shopping date and 6 / 2 / 6 items headed for the fridge, freezer and pantry, ice cream in the freezer and bananas in the pantry, moving chicken to the freezer re-dates it, the bananas' detail screen shows 105 kcal per medium banana and the whole 1.3 lb, and meal cards show calories with the per-serving tiles when opened.
- In Chromium on an emulated iPhone, in light mode, dark mode and with Reduce Motion on, a scripted run covers adding food by typing, rescuing with the check mark and Undo, swiping food away, freezing an item in time, storage tips, the name guard, adding to and ticking off the shopping list, "Buy again", putting shopping away, "I made this", and the discard prompt, with no console errors or warnings. A second scripted run covers the lookup: the mystery item is looked up on its own, "Is this your item?" shows a picture, "No" steps to the next match and then to no match, "Yes" renames the item and saves it to Your foods, its picture then appears in Items, the next scan names it without a lookup, and typing suggests it. The earlier onboarding-to-subscription runs, a strict-CSP embedded run, and an end-to-end run against the real server (with Anthropic, Open Food Facts and Wikipedia faked) all pass; the end-to-end run now includes a lookup from a real uploaded photo through to a tracked item with the looked-up shelf life.
- A full-app review found 17 defects (among them: reminders scheduled twice when settings changed quickly, dates going stale in an app left open overnight, items savable with a blank name, over-80-item meal requests failing, a scan result appearing after cancelling, gluten-free and vegan filters missing foods, food used after its date counted as rescued, an unreadable Undo). Each is fixed and has a test.

**Not verified** (needs your hands or credentials):

- Real food photos, and scan accuracy on real photos and real receipts (no API key here), including how well real receipt abbreviations are expanded.
- How close the AI's per-serving nutrition estimates are on real recipes (the app checks they are self-consistent, not that they are right).
- Apple Health and Health Connect on a real phone: the permission sheets, reading steps and workouts, and nutrition appearing in the Health app. The code follows the libraries' published types and the config was checked, but it has not run on a device. iOS and Android native builds have not been compiled here.
- Purchases and plan changes against the real App Store and Google Play sandboxes (they need your store accounts; `store/subscription-setup.md` has the checklist), and household cover between two real phones.
- Household sharing between two real phones against a deployed server. The server was tested with its own tests (create, join, newest-wins, deletions, paging, limits) and the app's sync loop against a stand-in server, but not end to end over a network.
- Running on an iOS or Android device or simulator: camera, permission prompts, haptics, swipe feel on a real touch screen, modal presentation, safe areas, and scheduled notifications.
- Real purchases through StoreKit / Play Billing / RevenueCat, including the trial converting and a cancelled trial not renewing.
- Real Anthropic responses. The request shape was tested against a fake API using the real SDK, but no live call was made. That includes web search: how well real searches identify real products, and how accurate the shelf lives they find are, is untested.
- Real Open Food Facts and Wikipedia responses and pictures (this environment cannot reach them); the parsing follows their documented response formats and was tested against stand-ins.
- Legal text is a reasonable starting point, not legal advice.
