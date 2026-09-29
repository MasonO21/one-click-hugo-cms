# Trail Notes app

A voice-first journal for hikers and runners, built with Expo (React Native) and TypeScript. Talk while you move. Trail Notes turns your words into a note and tags it with the place, the weather, and your mood. Everything is stored on the phone.

## What version 1 does

- **Record or write a note.** Tap Record and talk, or type. Speech is recognized by the phone's own speech service and only the text is kept.
- **Automatic tags.** Place (from the phone's map service), weather (Open-Meteo), and a mood estimated from the words. The mood can be changed.
- **Outings.** Start a hike or run to record the route and distance. Notes made during an outing belong to it.
- **Search and filter.** Full-text search across notes, places, weather, moods, and outing names, plus a mood filter.
- **Your data.** Export as text or JSON. Delete everything from Settings.
- **Light and dark mode**, screen reader labels, large text.

Plus features from the website (route maps, long-term insights, yearly recap books) and in-app purchases are **not** part of version 1.

## Limits to know about

- **The app must stay open** during an outing. Route tracking is foreground only: it never asks for background location. Settings keeps the screen on during outings by default, which uses more battery.
- **Voice notes need a development build.** The speech recognition module has native code, so Expo Go cannot run this app.
- **Android 12 and older** cannot recognize speech continuously. The app restarts recognition between phrases, so long notes may have small gaps.
- **Weather needs a signal.** A note saved offline is kept without weather, and the note screen offers to add it later.

## Run it

You need Node 20 or newer.

```bash
cd mobile
npm install
npm run check          # type-check, lint, and tests
npx expo run:android   # needs Android Studio, or use an EAS build below
npx expo run:ios       # needs a Mac with Xcode
```

Without local toolchains, build in the cloud with [EAS](https://docs.expo.dev/eas/):

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --profile development --platform ios     # or android
```

Then start the dev server with `npx expo start --dev-client`.

## Configuration

Set these environment variables before building (for example in EAS secrets or a `.env` file). Anything starting with `EXPO_PUBLIC_` is included in the app and can be read by anyone who has it.

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SITE_URL` | The website's address. Enables the privacy policy and support links in Settings. |
| `EXPO_PUBLIC_OPEN_METEO_API_KEY` | Paid Open-Meteo key. **Required for a commercial launch**: the free weather API is for non-commercial use only. A key inside the app can be extracted, so for heavy use put a small proxy in front of the API. |

Also change the placeholder iOS bundle identifier and Android package (`com.trailnotes.app`) in `app.config.ts` to ones you own.

## How it is organized

```
src/app/         screens and navigation (Expo Router)
src/domain/      plain logic: mood, weather, place, route, units, search, export
src/db/          SQLite schema, migrations, repository (full-text search with a fallback)
src/speech/      speech session controller (restarts, silence, errors) and the Expo adapter
src/services/    location, tagging, export
src/providers/   settings and outing state
src/components/  note cards and tags
src/ui/          theme and basic components
store/           store listing draft and launch checklist
```

The logic in `domain`, `db`, `speech`, and `services` is tested against a real SQLite engine and a fake recognizer. The screens are tested by rendering the real routes.

## Before you submit to the stores

Read [store/CHECKLIST.md](store/CHECKLIST.md). It lists what could not be done or checked from the development environment this app was built in, including testing on real phones.
