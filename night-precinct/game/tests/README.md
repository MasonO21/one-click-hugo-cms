# Tests

Everything runs against a build of the game with the debug hooks (`window.__np`) that the release build strips out.

```
npm install          # once (Playwright; Chromium must be available, see lib.js)
npm test             # everything, about 8 minutes;  node run-all.js --quick  for a 2 minute pass
```

| Script | What it checks |
|---|---|
| `static.js` | Builds the **release** target and checks it: no debug hook, no unresolved `{{TOKENS}}`, CSP present, no eval/fetch/XHR/WebSocket, no leftover ad or demo wording, no console.log/TODO, size |
| `saves.js` | Corrupt, hostile and odd save files (bad JSON, wrong types, huge numbers, future clocks, old shapes, blocked storage) never break boot and never produce NaN/undefined text |
| `native-mock.js` | The whole purchase pipeline against a **mock of the iOS bridge**: product load, localized prices, success, cancel, pending, error, duplicate delivery, crash recovery of unfinished transactions, restore, lapsed subscription, refund of a one-time unlock, region gate (Belgium), save mirroring and Erase save, every product reachable from the Store tab, zero network requests |
| `layout.js` | 7 screen sizes (320x568 up to iPad 1024x1366, portrait and landscape) x 3 worlds x every tab + Settings + purchase sheet: page overflow, off-screen elements, clipped buttons |
| `monkey.js [seed] [actions] [WxH]` | Seeded random clicking, cheating, time jumps and world hops; scans for JS errors, non-finite state, NaN/undefined text, horizontal overflow |
| `perf.js` | Frame times and main-thread load with a maxed-out roster, phone-DPR and desktop, all worlds |
| `soak.js` | 90 seconds of hammering; heap, DOM node and listener growth |

## Balance simulator

`sim/f2p.js` plays the real game code as a free-to-play player with a virtual clock (buys the best cost-per-income upgrade, opens crates, claims free rewards on their cooldowns, does daily rolls and jobs, promotes whenever possible, travels on to the next world).

```
node sim/f2p.js regular_mobile            # one archetype, JSON result
node sim/report.js                        # all archetypes, one line each
node sim/f2p.js regular_mobile 400 '{"police":8,"fire":7,"ems":12}'   # calibration mode
```

Calibration mode zeroes the promotion requirements and records the earnings a player has at the target time of each rank; it was used once to derive the `req.table` values in `game/src/01-data-state.js`. If you change income, costs or the free rewards, re-run `report.js` and, if the totals move, re-calibrate.
