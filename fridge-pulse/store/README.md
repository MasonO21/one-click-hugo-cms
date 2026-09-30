# Store launch pack

Everything needed to list Fridge Pulse in the App Store and Google Play, and what you still have to supply. **$9.99 per month with a 2-week free trial** is the only offer, and tests keep the app, legal text and these documents in agreement.

| File | What it is |
| --- | --- |
| `listing.json` | Copy-paste listing text for both stores. Character limits are tested. |
| `subscription-setup.md` | Exactly how to configure the subscription in App Store Connect, Google Play and RevenueCat. |
| `privacy-and-compliance.md` | Answers for the App Privacy label, Data safety form, age ratings, and App Review notes. |
| `screenshots/ios-6.9in/` | Seven 1290x2796 App Store screenshots. |
| `screenshots/android-phone/` | Seven 1080x1920 Google Play screenshots. |
| `screenshots/subscription-review-paywall.png` | Paywall capture for the App Store subscription review. |
| `graphics/` | 1024px App Store icon, 512px Play icon, 1024x500 Play feature graphic. |
| `../docs/legal/` | Hostable Privacy Policy and Terms of Use pages (`npm run legal:build`). |

Screenshots are rendered from the web build with `SCREENSHOT_MODE=1 npm run preview:build && npm run store:screenshots`, so fonts differ slightly from a real phone. Capture on a device or simulator if you want native rendering. Regenerate them after any UI change.

## What only you can provide

These need your identity, money or accounts, so they cannot be done for you:

1. **Names and identifiers.** Choose a bundle ID and package name (the placeholder `com.fridgepulse.app` in `app.json`), your developer or company name, a support email, and a domain or page to host the policies.
2. **Accounts.** Apple Developer Program, Google Play Console, RevenueCat, and an Anthropic API key. Each has its own sign-up and fees.
3. **A live backend.** Deploy `server/` (there is a Dockerfile) over HTTPS with `ANTHROPIC_API_KEY` and `REVENUECAT_SECRET_KEY` set. See the README for hosting notes.
4. **Legal review.** The Privacy Policy and Terms are a careful starting point that match what the app does, but they are not legal advice. Have them reviewed for your country and company before you publish.

## Launch order

1. Fill `.env` (see `.env.example`): API URL, RevenueCat keys, developer name, support email, and the hosted policy URLs.
2. Run `LEGAL_DEVELOPER="..." LEGAL_EMAIL="..." npm run legal:build`, host `docs/legal/`, and put the URLs in `.env` and both store consoles.
3. Create the subscription in both stores and RevenueCat (`subscription-setup.md`).
4. Update `app.json` (bundle ID, package name, version) and `eas.json` (submit settings), then `npx eas-cli build --profile production` for each platform.
5. Test the build on real devices: real fridge photos, a sandbox purchase, the consent prompt, the trial reminder, and restore purchases. The checklist at the end of `subscription-setup.md` covers the purchase side.
6. Fill both listings from `listing.json`, upload the screenshots and graphics, answer the privacy and rating forms from `privacy-and-compliance.md`, and add the review notes.
7. Submit. Apple usually reviews within a couple of days; Play can take longer for a new account.

## Not verified here

- Running on a physical device or simulator (camera, notifications, haptics, purchase sheets).
- Real purchases through the stores and RevenueCat.
- Real responses from the AI service, including scan accuracy on real fridge photos.
- Food photography in the app: the environment blocked every photo site, so the app uses emoji for food. See `../docs/food-photos.md`.
