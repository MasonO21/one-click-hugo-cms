# Launch checklist

The app builds, type-checks, lints, and passes its tests. That does **not** mean it is ready to submit. This list is what is left, roughly in order.

## 1. Test on real phones (not done)

Everything was checked with automated tests and simulated native modules. Nobody has run this app on a phone yet. Before any store build, try at least one recent iPhone and two Android phones (one Android 12 or older, one Android 14 or newer):

- [ ] Microphone and speech permission prompts: allow, deny, deny twice, then turn on from Settings.
- [ ] Voice recognition in your language, with and without signal. Check that a 60-second note is captured in full, and that long pauses do not lose text.
- [ ] Settings switch "Keep speech on this device", on a phone that supports it and one that does not.
- [ ] Location prompt, place name, and weather on a note. Try airplane mode, then "Add place and weather" afterwards.
- [ ] An outing: walk or run 15 minutes with the app open. Check distance against a fitness app. Lock the phone, background the app, and confirm the app explains itself when it comes back.
- [ ] Phone call or alarm during a recording.
- [ ] Dark mode, the largest text size, VoiceOver, and TalkBack.
- [ ] Small phones and phones with a notch or navigation bar.
- [ ] Upgrade path: install a build, add notes, install the next build over it, and confirm the notes are still there.

## 2. Accounts and identifiers (not done)

- [ ] Apple Developer Program (paid) and Google Play Console (one-time fee).
- [ ] Replace `com.trailnotes.app` in `app.config.ts` with your bundle identifier and package name.
- [ ] Run `npx eas-cli@latest init` to create the EAS project.
- [ ] Set `EXPO_PUBLIC_SITE_URL` to the deployed website.

## 3. Weather provider (decision needed)

The app uses Open-Meteo. Its free API is for non-commercial use, and this product plans a subscription.

- [ ] Buy an Open-Meteo commercial plan and set `EXPO_PUBLIC_OPEN_METEO_API_KEY`, or switch to another provider (the code is in `src/domain/weather.ts`).
- [ ] Keys inside an app can be extracted. For real traffic, put a small server in front so the key stays private.
- [ ] I could not reach Open-Meteo from the environment this was built in. The request and response handling follow its documentation and are tested with sample responses. Confirm it against the live service.

## 4. Privacy and legal (needs your review)

- [ ] Have a lawyer review the [app privacy policy](../../site/content/app-privacy.md) and the [website privacy policy](../../site/content/privacy.md). They describe what the code does today. Update them if that changes.
- [ ] Deploy the website so `https://<your-site>/app-privacy/` works. Both stores need a privacy policy URL.
- [ ] Apple "App Privacy" and Google Play "Data safety": see [listing.md](listing.md) for suggested answers. Check them against the final build.
- [ ] Apple export compliance: `ITSAppUsesNonExemptEncryption` is set to `false` because the app only uses the encryption built into the operating system. Confirm this applies to you.

## 5. Store listing (not done)

- [ ] Screenshots from real phones (iPhone 6.9-inch and 6.5-inch sizes, Android phone).
- [ ] Google Play feature graphic (1024 x 500).
- [ ] Review the text in [listing.md](listing.md), category, age rating, and support URL.
- [ ] Review notes for Apple: explain that the microphone is used for voice notes and location for tags and outings, and how to reach the Record button.

## 6. Build and submit

```bash
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform ios
npx eas-cli@latest submit --platform android
```

## Later

- Crash reporting. The app has none, on purpose, to keep the privacy story simple. Add it deliberately and update both privacy policies if you do.
- Plus features and in-app purchases. Apple and Google require in-app purchase for digital subscriptions sold in the app.
- Background route tracking, which needs the always-on location permission and store justification.
