# Sunup

**One tap every morning tells the people who love you that you're okay.**

Sunup is a daily safety net for people who live alone and for the people who worry about them. You check in once a day ("I'm up"). If you don't, Sunup checks on you, then alerts your circle, step by step, until someone reaches you. There's no location tracking.

## What's in the app

| Feature | Free | Premium ($9.99/mo or $79.99/yr) |
| --- | --- | --- |
| Daily check-in with mood, note and photo postcards | ✓ | ✓ |
| Circle feed: see the people you watch check in | ✓ | ✓ |
| SOS (hold to send, optional location) | ✓ | ✓ |
| Away mode (pause check-ins) | ✓ | ✓ |
| People in your circle | 2 | Unlimited |
| Escalation | Reminder → alarm → circle alerted | + phone call to you → calls to your circle → packet released → wellness-check advice |
| "If I go dark" packet: pets, home access, health, people to tell | Fill in only | Released to chosen people during an alert |
| Moments: date / run / night out / travel timers + fake-call escape | | ✓ |
| Smart check-in (opening the app in your window counts) | | ✓ |
| Up to 3 check-in windows a day | | ✓ |

People in your circle don't need the app: anyone added by phone gets texts and calls.

### The escalation ladder (Premium, 30-minute grace)

| After the deadline | What happens |
| --- | --- |
| 0 min | Reminder notification to you |
| 15 min | Urgent alarm and a text to you |
| 30 min | Automated phone call to you |
| 40 min | Your circle is alerted (push + text) |
| 60 min | Sunup calls your circle; your packet is released to the people you chose |
| 90 min | Your circle is told how to request an in-person wellness check |

Checking in at any point stops everything and tells anyone already alerted that you're okay. A watcher can also tap "I reached them" to stand everyone down.

## Run it

Requires Node 22+.

```bash
cd sunup
npm install
npm run dev        # server on :8787 + web app on http://localhost:5173
npm run demo       # web app only, in on-device demo mode
npm run check      # typecheck + tests
```

### Two modes

- **Server mode** (when a Sunup server answers `/api/health`): real accounts, circles across phones, a server-side clock that runs the alert ladder, web push, and texts/calls through Twilio.
- **Demo mode** (no server, e.g. a static host): the same engine runs in the browser over `localStorage`, with a sample circle of simulated people (Mom and Jordan) who check in on their own. The demo controls play an hour of escalation in about 90 seconds.

`npm run build:demo` produces `dist-demo/sunup-demo.html`, a single self-contained file of the demo.

## Deploy

Any Node host with a persistent disk works (Render, Railway, Fly.io, a VPS). Push notifications need HTTPS.

```bash
npm run build
npm start
```

Or with Docker: `docker build -t sunup . && docker run -p 8787:8787 -v sunup-data:/data sunup`.

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (default 8787) |
| `PUBLIC_URL` | The app's public URL, used in texts |
| `DATA_DIR` | Where `sunup.json` is stored (default `./data`) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Real texts and calls. Without them, texts and calls are logged to the console. |
| `VAPID_SUBJECT` | Contact for web push, e.g. `mailto:you@yourdomain.com`. VAPID keys are generated on first run and saved in the data file. |

## How it's built

```
src/shared/   The engine: schedules, time zones, the escalation ladder, circles, plans,
              and the per-user snapshot. Pure TypeScript, shared by server and demo.
src/web/      React app (Vite). store/demo.ts runs the engine locally; store/server.ts
              talks to the API. Screens: Today, Circle, Moments, If I go dark, You.
server/       Express API, JSON-file store, alert clock (ticks every 15s), web push,
              Twilio texts and calls.
tests/        Engine tests (time zones, ladder timing, limits, moments, SOS) and API tests.
public/       PWA manifest, service worker (offline shell + push), icons.
```

Every rule lives in `src/shared/service.ts`, so the demo and the server behave identically. The server exposes one `POST /api/action` endpoint that feeds the same validated actions into the engine.

## Before a real launch

This is a working prototype, not a finished product. Before charging money or promising safety to real people:

- **Payments.** "Start free trial" works; subscribing needs Stripe (web) or RevenueCat (app stores) wired to `Sunup.setPlan`.
- **Native apps.** iOS web push only works after "Add to Home Screen". Native iOS/Android apps are needed for reliable alarms (critical alerts), true smart check-in from phone activity, and app-store distribution. The engine and API can stay as they are.
- **Accounts.** Sign-in is a device token. Add phone-number verification (SMS code) and account recovery.
- **Messaging compliance.** US texting needs A2P 10DLC registration, and contacts added by phone should get an opt-in text before they're relied on.
- **Wellness checks.** The last ladder step gives advice; a dispatch partner (e.g. a monitoring-center API) would let Sunup request in-person checks directly.
- **Data.** Move from the JSON file to Postgres, and encrypt "If I go dark" packets at rest.
- **Legal.** Clear terms that Sunup isn't an emergency service and can't guarantee delivery.
