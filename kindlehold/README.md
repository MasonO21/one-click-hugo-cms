# Kindlehold (prototype)

A playable prototype of a frozen-world survival strategy game for phones. You raise the Hearthwyrm, a fire dragon that keeps your town alive. Feed it coal, read the weather forecast, shelter survivors, recruit heroes and push expeditions into the frost.

The game design, monetization plan and go-to-market plan are in [DESIGN.md](DESIGN.md).

## Play it

No build step. Any of these work:

- Open `index.html` in a browser.
- Serve the folder: `npx serve kindlehold` (from the repo root), then open the URL on your phone on the same Wi-Fi.
- On an iPhone, open the served page in Safari and use **Share → Add to Home Screen** to run it full screen like an app.

Progress saves in the browser (`localStorage`). Settings (gear icon) → **Start a new hold** wipes it.

## Files

| File | What's in it |
|---|---|
| `index.html` | Page shell, HUD, tab bar, inline icon set |
| `style.css` | All styling |
| `data.js` | Every tunable number and all content: buildings, weather, heroes, stages, quests, pass, store |
| `game.js` | Simulation, actions, UI rendering, the canvas town and Hearthwyrm drawing |
| `manifest.webmanifest`, `icon.svg` | Home-screen install |
| `DESIGN.md` | Game design and business plan |

## Tuning and testing

Change numbers in `data.js` and reload. For quick testing, open the browser console:

```js
kindlehold.advance(600)                 // fast-forward 10 minutes of game time
kindlehold.grant({ wood: 5000, starglass: 2000, beacons: 10 })
kindlehold.act('fight')                 // any action the buttons use
kindlehold.state()                      // the full save object
```

Timers and production run about 30× faster than the planned live game so the whole loop fits in one sitting.

## Purchases are simulated

The Store shows the planned price points, but nothing is charged; buttons grant the items and add to a "simulated spend" counter. A real App Store release must use Apple in-app purchase (StoreKit) with server-side receipt validation. See DESIGN.md §4.

## Getting it onto an iPhone for testing

The quickest path for playtests is to wrap this web build with [Capacitor](https://capacitorjs.com/):

1. `npm init -y && npm i @capacitor/core @capacitor/cli @capacitor/ios`
2. `npx cap init Kindlehold com.yourstudio.kindlehold --web-dir kindlehold`
3. `npx cap add ios && npx cap open ios`, then build in Xcode and upload to TestFlight.

This needs a Mac with Xcode and an Apple Developer account. For a commercial launch, plan to rebuild the client in a game engine (Unity or Cocos) with a real backend. DESIGN.md §7 covers why.
