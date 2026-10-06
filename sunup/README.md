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

Any Node host with a persistent disk works. Push notifications need HTTPS.

**Render (one click):** the repo root has a `render.yaml` blueprint. In Render, choose New > Blueprint, pick this repo and branch, and fill in the environment variables below. It runs on the Starter plan with a 1 GB disk for the data file.

**Anywhere else:** `npm run build && npm start`, or Docker: `docker build -t sunup . && docker run -p 8787:8787 -v sunup-data:/data sunup`.

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (default 8787) |
| `PUBLIC_URL` | The app's public URL, e.g. `https://sunup.example.com`. Used in texts and webhooks. |
| `DATA_DIR` | Where `sunup.json`, photos and the data key are stored (default `./data`) |
| `SUNUP_DATA_KEY` | Encrypts "If I go dark" packets at rest. Create one with `openssl rand -base64 32` and keep a copy somewhere safe: without it the packets can't be read. If unset, a key is generated once and saved as `data.key` in `DATA_DIR`. |
| `VAPID_SUBJECT` | Contact for web push, e.g. `mailto:you@yourdomain.com`. VAPID keys are generated on first run and saved in the data file. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Texts, calls and sign-in codes. Without them, texts and calls are logged to the console (and in development, sign-in codes are shown on screen). |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` | Paid subscriptions. Without them, Premium is a card-free 7-day trial. |

### Twilio setup

1. Buy a phone number that can send SMS and make calls, and put its number in `TWILIO_FROM`.
2. In the number's settings, set "A message comes in" to a webhook: `PUBLIC_URL/api/twilio/sms` (HTTP POST). This is how contacts' YES / STOP / START replies reach Sunup. Requests are checked against Twilio's signature.
3. For US texting, register the number for A2P 10DLC in the Twilio console (required by carriers).

### Stripe setup

1. Create a product "Sunup Premium" with two recurring prices: $9.99 monthly and $79.99 yearly. Put their price IDs in `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY`.
2. Add a webhook endpoint at `PUBLIC_URL/api/stripe/webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
3. Turn on the customer portal (Settings > Billing > Customer portal) so people can cancel or change plans from "Manage subscription".

New subscribers get a 7-day trial through Checkout. Anyone who already used a trial is charged right away.

## Website

The server also serves the marketing site from `public/`: the landing page at `/welcome` (point ads here), plus `terms.html` and `privacy.html`. The terms and privacy pages are drafts: fill in the bracketed company details and have a lawyer review them.

## How it's built

```
src/shared/   The engine: schedules, time zones, the escalation ladder, circles, plans,
              and the per-user snapshot. Pure TypeScript, shared by server and demo.
src/web/      React app (Vite). store/demo.ts runs the engine locally; store/server.ts
              talks to the API. Screens: Today, Circle, Moments, If I go dark, You.
server/       Express API, JSON-file store, alert clock (ticks every 15s), web push,
              Twilio texts and calls, phone sign-in codes, Stripe billing.
tests/        Engine tests (time zones, ladder timing, limits, moments, SOS, consent),
              API tests, and Twilio/Stripe tests against a recording fake.
public/       PWA manifest, service worker (offline shell + push), icons, and the website
              (landing page, terms, privacy, app screenshots).
```

Every rule lives in `src/shared/service.ts`, so the demo and the server behave identically. The server exposes one `POST /api/action` endpoint that feeds the same validated actions into the engine.

## Accounts and contacts

- **Sign-in:** people sign up with their mobile number and a texted 6-digit code, and sign back in on any device the same way. A number can only be confirmed on one account. People can also skip the number, but then they can't sign back in.
- **Contacts added by phone** get a consent text. YES confirms; STOP stops every text and call from Sunup (START turns them back on). The person who added them is told either way.

## Before a real launch

This is a working prototype. Before charging money or promising safety to real people:

- **Native apps.** iOS web push only works after "Add to Home Screen". Native iOS/Android apps are needed for reliable alarms (critical alerts), true smart check-in from phone activity, and app-store distribution. Inside an iOS app, subscriptions must go through Apple's in-app purchase (RevenueCat is the usual shortcut); the engine's `applyBilling` already takes a provider's status.
- **Wellness checks.** The last ladder step gives advice; a dispatch partner (e.g. a monitoring-center API) would let Sunup request in-person checks directly.
- **Data.** Packets are encrypted at rest and photos are stored as separate files, but everything else lives in one JSON file. Move to Postgres once there are more than a few thousand users.
- **Legal.** Finish the draft terms and privacy policy with a lawyer, and confirm the texting consent flow with your SMS provider.
