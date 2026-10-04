This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Project notes (Fridge Pulse)

- Layout: screens in `src/app/`, pure logic in `src/lib/` (unit-tested), billing in `src/billing/`, state in `src/store/`, backend in `server/` (separate package with its own tests). See `README.md`.
- Checks to run before finishing: `npm run typecheck && npm run lint && npm test`, and `cd server && npm run typecheck && npm test`.
- `docs.expo.dev` and `api.expo.dev` can be blocked in cloud sessions, so `npx expo install` and `npx expo lint` auto-setup fail there. Use the installed packages' `.d.ts` files as the API reference, and take SDK-compatible versions from `node_modules/expo/bundledNativeModules.json`.
- `EXPO_PUBLIC_*` values are inlined at build time; after changing them run Metro / `expo export` with `--clear`.
- `Alert.alert` is a no-op on web and embedded viewers suppress `window.confirm`. Use `confirm()` / `notify()` from `src/lib/dialogs.ts` (native alert, or the in-app `DialogHost` on web) for any flow that awaits an answer.
- Persisted stores use `persistStorage()` (`src/store/storage.ts`), which never rejects. A rejected read would leave a store un-hydrated and the app stuck on its splash screen.
- `npm run preview:build` builds the hosted web preview into `preview/` (git-ignored). Test it against a strict CSP, a nested path and a phone viewport; see the README.
- Billing must fail closed: never make the local trial provider reachable in a production build (`src/billing/index.ts`).
- The app and server share one JSON contract (`server/src/schemas.ts` <-> `src/lib/types.ts`, `src/lib/api.ts`). Change both together.
- Server model calls follow the Claude API notes: `claude-opus-5-5` default, no `thinking` / sampling params, explicit `output_config.effort`, structured output via `beta.messages.parse`, `fallbacks: "default"`, and `stop_reason` checked before reading content.
- The offer (four plans in `PLANS`: monthly, yearly, household monthly, household yearly, each with a 2-week free trial) lives only in `src/billing/trial.ts`; never type a price or trial length into copy, comments included. Show a plan's price with `planPriceLabel(prices, plan)` (the store's localised price once loaded). `__tests__/pricing.test.ts` scans the app, store listing and legal text; legal text uses `{{price}}`, `{{yearlyPrice}}`, `{{householdMonthlyPrice}}`, `{{householdYearlyPrice}}` and `{{householdPeople}}`.
- Access is the person's own plan (`isUnlocked(entitlement)`) or a household plan covering their household (`isCovered(household)` from `src/store/household.ts`); the root layout combines them. On the server, `allowed()` in `server/src/app.ts` does the same: a payer's `household` entitlement is recorded with `households.sponsor()`, members are let in while `coverage()` is live, and the payer is re-checked with RevenueCat once it lapses. `GET /v1/household`, `join` and `leave` work without a plan (`OPEN_ROUTES`).
- Any code path that sends photos or item names to the server needs the user's AI consent (`settings.aiConsent`, `AiConsentModal`); demo mode is exempt because nothing leaves the device.
- Native bundles must resolve: run `npx expo export --platform ios --platform android --output-dir /tmp/x` after adding imports. Expo peer packages (expo-asset, expo-file-system) must be top-level dependencies; `__tests__/dependencies.test.ts` guards this.
- Brand: `docs/brand.md`. Colours come from `src/theme`; `__tests__/contrast.test.ts` fails if a pair drops below WCAG AA. Text and icons use `primary`; filled buttons and chips use `primaryFill` with `onPrimary`. White on the orange `cta` gradient is only large-text contrast, so use it only through `Button variant="cta"` (19pt bold label). Dark is the default look (`settings.appearance`); `useTheme()` resolves it. Neon halos go through `glow()`, and only in the dark look. Emoji per food are pinned by `test-utils/foodCases.ts`; add a row when you add a rule in `src/components/categories.ts`.
- Store assets: `store/` (listing, checklist, screenshots). Regenerate screenshots with `SCREENSHOT_MODE=1 npm run preview:build && CHROMIUM_PATH=/opt/pw-browsers/chromium npm run store:screenshots`, then rebuild the normal preview with `npm run preview:build`.
- Typing suggestions: `src/lib/suggest.ts` (pure, tested in `__tests__/suggest.test.ts`) over `src/lib/foodCatalog.ts`. A catalog food shows its emoji and a "keeps about" estimate, so when adding foods check both (`emojiFor`, `estimateShelfLifeDays`); the catalog test fails on duplicates or implausible estimates. Shelf-life and emoji rules are first-match-wins: put compound foods ("peanut butter", "leftover pasta") before the words they contain.
- Shelf life: every figure in `src/lib/shelfLife.ts` must sit inside the independent reference in `test-utils/shelfLifeReference.json` (`__tests__/shelflife-reference.test.ts`). When adding a food, add a reference row from FoodKeeper / FDA / FSIS guidance, not from the app's own number. Mark jars and cans with `pk()` and food that freezes badly with `nf()`.
- Motion: use `src/components/motion.tsx` (`FadeIn`, `PressableScale`, `useAnimatedValue`, `useReducedMotion`). Never `useRef(new Animated.Value())` (the React Compiler lint rejects reading refs in render), never `useNativeDriver: true` on web (use `NATIVE_DRIVER`), and interpolation input ranges must increase. Every animated component is rendered to the end of its animation in `__tests__/animated-components.test.tsx`; add yours there.
- Marking food used or thrown out goes through `resolveItems` (`src/store/actions.ts`): it updates the lifetime totals behind the Impact card, plays haptics and shows the global message bar with Undo (`src/store/snackbar.ts`, `SnackbarHost` at the root). Screens with a `footer` register its height so the bar sits above it.
- Dates on screen come from `useToday()` (`src/hooks/useToday.ts`), which moves on at midnight and on return to the app; do not compute "today" once at mount.
- Online lookup of unfamiliar food: `POST /v1/identify` (`server/src/claude.ts` `identify`, `server/src/pictures.ts`, `server/src/identify.ts`). It uses the `web_search_20260209` server tool plus a strict `report_food` tool instead of structured output, handles `pause_turn` by resending the assistant turn, and never lets the model supply an image URL: pictures come only from Open Food Facts / Wikimedia (`PICTURE_HOSTS`, mirrored in `src/lib/identify.ts`). App side: `src/lib/identify.ts` (pure: which drafts need a lookup, `toCandidates` trust boundary), `src/store/lookups.ts` (queue, abort on leaving review), `src/store/foods.ts` (the person's food database; it keeps the shelf-life registry in `src/lib/shelfLife.ts` in step via `setLearnedFoods`). Tests: `__tests__/identify.test.tsx`, `server/test/pictures.test.ts`.
- Taught foods override built-in rules by exact name or alias, so the reference test does not cover them; do not add taught foods to `RULES`.
- Store calls that persist (zustand `persist`) can return a promise: in tests, wrap them in a block body (`act(() => { ... })`) so `act` is not handed a thenable.
- Fonts: Montserrat (headings) and Open Sans (body), one family per weight (`src/theme/fonts.ts`, files in `src/theme/fontSources.ts`). `Text` and `Field` pick the family from the weight and reset `fontWeight`; never set `fontWeight` on raw RN text with a brand family. The preview build inlines the fonts (`src/lib/brandFontsData.ts` stub), like the icon font. Jest has a global AsyncStorage mock in `jest.setup.js` because the theme reads a persisted setting.
- SVG (react-native-svg): gradient ids must be unique per drawing (`useId`), and an objectBoundingBox gradient on a perfectly horizontal or vertical line draws nothing; use a solid colour there.
- Icons and splash come from `scripts/brand-assets.mjs` (keep its mark in step with `FridgeMark`).
- Built-in recipes: `src/lib/recipes.ts` (data) filled by `src/lib/meals.ts` (`fillRecipe`, `toMeal`, `localSuggestions`). Slots ask for culinary roles from `src/lib/ingredients.ts`, never for names or categories. When adding a food rule, put compound names before the words they end with (the match ending furthest right wins; ties go to the earlier rule) and give it only the roles a cook would use it for; dessert foods get dessert roles only. When adding a recipe: conditional lines (`{ if: 'slot' }` or `{ if: '@role' }`) for anything optional, `{slot}` placeholders only where the slot is filled (or `{slot|fallback}`), and a summary that does not promise optional ingredients. `__tests__/recipes.test.ts` must pass: it renders every recipe with random kitchens and checks sweet/savoury/leftover lists that are written independently of the role table, and the wording for every diet.
- Categories: `guessCategory` (`src/lib/shelfLife.ts`) uses taught foods, then the catalog by exact name, then the catalog name a food ends with, then word rules. A catalog food's category is the truth (scans are corrected to it in `toDrafts`); `__tests__/categories.test.ts` checks the word rules agree with the catalog.
- Receipts: `POST /v1/scan` with `mode: "receipt"` uses `RECEIPT_SYSTEM` and the same output schema (`keptIn` per item and `purchaseDate` are null for shelf photos). App side, `toDrafts(..., 'receipt')` picks each item's place with `receiptPlace` (the app's own rule for known food, never the cupboard for food that must be chilled) and dates from `purchaseDay`; review mode `'receipt'` gives every item its own Fridge / Freezer / Pantry chips (`moveDraft`). A receipt photo is never sent to the lookup. Tests: `__tests__/receipts.test.ts`.
- Nutrition: figures live in `src/lib/nutritionData.ts` (USDA SR Legacy via TempoLife, CC BY 4.0, credited on About), one row per catalog food or a name in `UNMEASURED`. When you add a catalog food, add its row from an SR Legacy entry (name it in the comment) or list it as unmeasured; `__tests__/nutrition.test.ts` fails otherwise and checks the energy adds up. `nutritionFor` only matches a name whose front words do not change the food (`CHANGED`): no figure beats a wrong one. Recipe estimates come from `servingPortions` in `src/lib/meals.ts`; AI meals carry the model's `nutrition`, kept only if `toMealNutrition` finds it self-consistent.
- Goals and food log: `src/lib/goals.ts` (protein g/kg and Mifflin-St Jeor, tested in `__tests__/wellness.test.ts`), `src/store/foodLog.ts`, and `src/store/logActions.ts` for every add/remove so the health app stays in step. "I made this" passes the new entry to `resolveItems(..., { logged })` so one Undo takes back both. Body details, the log and health data never leave the phone and are never sent to the AI.
- Health: `src/health/provider.{ios,android}.ts` load their libraries with a guarded `require` on first use; keep it that way, or a build without the native module crashes at launch. Use `getHealth()` / `setHealthForTesting()` from `src/store/health.ts`. Native health needs a development build, not Expo Go.
- Households: every change to an item or shopping entry must go through the stores so it gets `updatedAt`, and removals must go through `removeItem` / `remove` so a tombstone is kept; `applyRemote` is only for merged copies from the household. Server storage is `server/src/household.ts` (node:sqlite, Node 22.13+). Tests: `__tests__/household.test.ts`, `server/test/household.test.ts`.
- Money: prices live on items (`price`, `currency`); `src/lib/money.ts` only adds up real prices. Never put a dollar amount in code comments or copy: `__tests__/pricing.test.ts` treats any one other than the subscription price as a mistake.
- `Screen` turns off keyboard dismissal on scroll on the web (React Native Web treats every scroll as a drag, and phone browsers scroll to the focused field).
