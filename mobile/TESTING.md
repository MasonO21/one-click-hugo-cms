# Trying Trail Notes on your phone

Voice notes use native code, so the app cannot run inside the Expo Go app. You need a build of Trail Notes itself. Expo's cloud service, EAS, makes one for you; nothing needs to be installed on your phone except the app.

The steps below were written without access to the Expo website, which changes often. If a screen looks different from what is described, follow what the site shows, or use the computer route.

## Android (free, quickest)

Android can install a test build straight from a link. You need a free [Expo account](https://expo.dev/signup).

### With a computer

```bash
cd mobile
npm install
npx eas-cli@latest login
npx eas-cli@latest init
```

`init` creates the project and prints its id. Paste that id into `EAS_PROJECT_ID` near the top of `app.config.ts`, then:

```bash
npx eas-cli@latest build --profile preview --platform android
```

The build takes about 10 to 20 minutes. When it is done, EAS shows a link and a QR code. Open it on your Android phone, download the file, and install it. Android will ask you to allow installs from your browser the first time.

### With only your phone

1. Sign in at [expo.dev](https://expo.dev) and create a project named `trail-notes`. Copy its project id.
2. On GitHub, open `mobile/app.config.ts`, tap the pencil to edit, paste the id into `EAS_PROJECT_ID`, and commit.
3. In the project on expo.dev, connect the GitHub repository and set the base directory to `mobile`.
4. Start a build from the website: platform Android, profile `preview`.
5. When it finishes, open the build page on your phone and install it.

## iPhone (needs a paid Apple Developer account)

Apple only lets you install test builds through its own channels.

### TestFlight (recommended)

```bash
cd mobile
npx eas-cli@latest build --profile production --platform ios
npx eas-cli@latest submit --platform ios
```

EAS walks you through signing in to Apple and creating the certificates. After Apple processes the build (often under an hour), install the TestFlight app on your iPhone and accept the invite.

### Direct install

Register your iPhone once with `npx eas-cli@latest device:create`. It shows a link to open on the phone. Then run `npx eas-cli@latest build --profile preview --platform ios` and open the finished build's link on the iPhone. On iOS 16 and later, turn on Developer Mode in Settings > Privacy & Security when asked.

## For live code changes

Use `--profile development` instead of `preview`, then run `npx expo start --dev-client` on a computer on the same Wi-Fi as the phone. Changes to the code show up on the phone without a new build.

## A 15-minute first test

Try this on each phone and note anything odd, with the phone model and OS version.

1. **First launch.** Read the welcome screen and tap Get started.
2. **Record a note.** Tap Record, allow the microphone, speech recognition, and location. Say: "Fog lifting off the ridge. Legs feel strong and I'm so happy I came out." Tap Stop and save.
   - The words should match what you said.
   - Within a few seconds the note should show a place, the weather, and the mood Happy.
3. **No signal.** Turn on airplane mode and record another note. It should save without weather. Turn airplane mode off, open the note, and tap Add place and weather.
4. **Long note.** Talk for a full minute with a few pauses. Nothing you said should be missing.
5. **Outing.** Tap Start hike and walk for five minutes with the app open. Record a note on the way. Tap Finish outing and check the distance against a fitness app.
6. **Interruptions.** Start recording, then lock the phone or take a call. What you said before should be saved.
7. **Search.** Search for "fog" and for "happy". Use the mood filter.
8. **Edit.** Open a note, change some words, save, and change the mood.
9. **Settings.** Switch to °C and km, export as text, and check the shared file.
10. **Looks and access.** Turn on dark mode, the largest text size, and VoiceOver or TalkBack, and move around the app.

The full pre-launch list is in [store/CHECKLIST.md](store/CHECKLIST.md).
