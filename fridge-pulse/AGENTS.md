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
- The offer ($9.99/month, 2-week free trial) lives only in `src/billing/trial.ts`; never type a price or trial length into copy. `__tests__/pricing.test.ts` scans the app, store listing and legal text.
- Any code path that sends photos or item names to the server needs the user's AI consent (`settings.aiConsent`, `AiConsentModal`); demo mode is exempt because nothing leaves the device.
- Native bundles must resolve: run `npx expo export --platform ios --platform android --output-dir /tmp/x` after adding imports. Expo peer packages (expo-asset, expo-file-system) must be top-level dependencies; `__tests__/dependencies.test.ts` guards this.
- Colours come from `src/theme`; `__tests__/contrast.test.ts` fails if a pair drops below WCAG AA. Emoji per food are pinned by `test-utils/foodCases.ts`; add a row when you add a rule in `src/components/categories.ts`.
- Store assets: `store/` (listing, checklist, screenshots). Regenerate screenshots with `SCREENSHOT_MODE=1 npm run preview:build && CHROMIUM_PATH=/opt/pw-browsers/chromium npm run store:screenshots`, then rebuild the normal preview with `npm run preview:build`.
- Typing suggestions: `src/lib/suggest.ts` (pure, tested in `__tests__/suggest.test.ts`) over `src/lib/foodCatalog.ts`. A catalog food shows its emoji and a "keeps about" estimate, so when adding foods check both (`emojiFor`, `estimateShelfLifeDays`); the catalog test fails on duplicates or implausible estimates. Shelf-life and emoji rules are first-match-wins: put compound foods ("peanut butter", "leftover pasta") before the words they contain.
- Shelf life: every figure in `src/lib/shelfLife.ts` must sit inside the independent reference in `test-utils/shelfLifeReference.json` (`__tests__/shelflife-reference.test.ts`). When adding a food, add a reference row from FoodKeeper / FDA / FSIS guidance, not from the app's own number. Mark jars and cans with `pk()` and food that freezes badly with `nf()`.
- Motion: use `src/components/motion.tsx` (`FadeIn`, `PressableScale`, `useAnimatedValue`, `useReducedMotion`). Never `useRef(new Animated.Value())` (the React Compiler lint rejects reading refs in render), never `useNativeDriver: true` on web (use `NATIVE_DRIVER`), and interpolation input ranges must increase. Every animated component is rendered to the end of its animation in `__tests__/animated-components.test.tsx`; add yours there.
- Marking food used or thrown out goes through `resolveItems` (`src/store/actions.ts`): it updates the lifetime totals behind the Impact card, plays haptics and shows the global message bar with Undo (`src/store/snackbar.ts`, `SnackbarHost` at the root). Screens with a `footer` register its height so the bar sits above it.
- Dates on screen come from `useToday()` (`src/hooks/useToday.ts`), which moves on at midnight and on return to the app; do not compute "today" once at mount.

