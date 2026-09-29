# Waypath

**Hike a trail once. Every hiker after you gets arrows that keep them on it.**

Waypath records the route you walk (GPS track, plus waypoints such as water, viewpoints and hazards) and lets other people follow it with a GPS-style arrow: on a phone today, and on Meta glasses as the audio/display integration matures. It works as a plain trail app first; Meta glasses are the headline experience.

This is a working prototype, not a product. Everything below says what is real and what is not.

## Run it

```bash
cd trail-app
npm start            # http://127.0.0.1:8080  (Node 22+, zero dependencies)
npm test             # 41 unit/integration tests, no browser needed
npm run e2e          # browser test: needs Playwright + Chromium installed (see e2e/smoke.mjs)
```

**Try it on a desktop with no GPS:** open the app, tick **Simulate GPS** at the bottom of the home screen, then *Try demo trail* → *Follow this trail* → *Start guidance*. A simulated walker (with GPS noise) walks the trail. Use **Wander off** to watch off-trail detection and the arrow swing back toward the path.

**On a phone:** browsers only allow GPS, camera and compass on HTTPS (or `localhost`). Serve the app over HTTPS (any tunnel or host works, e.g. `cloudflared tunnel --url http://localhost:8080`) and open that URL. Add it to the home screen to install it; the app shell and any trail you saved work offline.

## What works

| | |
|---|---|
| Record | GPS recording with jitter/teleport filtering, accuracy-aware simplification (recorded length stays within ~0.2% of the true route even with 3 m GPS noise), waypoints (water / viewpoint / hazard / junction / note / photo), draft autosave so a killed tab doesn't lose a hike |
| Guide | Arrow to a lookahead point on the trail; off-trail detection with hysteresis; arrow points back to the nearest trail when lost; turn detection ("Turn left in 40 m"); waypoint alerts; correct on out-and-back and looping trails; follow in reverse; start from anywhere on the trail |
| Share | Publish to the included server, find trails by location, save offline, delete with an owner token (no accounts needed) |
| Interop | GPX import/export |
| Glasses layer | HUD frame builder + adapters (below) |
| Offline | Service worker + IndexedDB: open, browse saved trails and be guided with no signal |

## Architecture

```
public/lib/geo.js        geometry: haversine, bearing, along-track projection, simplification
public/lib/guide.js      Guide: GPS fix -> {arrow bearing, status, turn, next waypoint, events}
public/lib/recorder.js   Recorder: noisy fixes -> clean compact track
public/lib/trail.js      trail schema, validation (shared by client + server), stats
public/lib/glasses.js    hudFrame() + adapters: Voice, Haptic, Preview, MetaDisplay (stub)
public/lib/sim.js        demo trail + simulated walker
public/lib/gpx.js        GPX <-> trail
public/lib/map.js        offline canvas map + elevation profile
public/lib/sensors.js    geolocation, compass, wake lock, photo downscale
public/lib/store.js      IndexedDB + API client
public/app.js            UI (record / trail / guide views)
server.js                static files + trail API (zero deps, file-backed)
```

`geo`, `guide`, `recorder`, `trail` and `glasses` are pure and DOM-free, so they run identically in the browser, in Node tests, and would run inside a glasses companion.

### API

```
GET    /api/trails?lat=&lng=&radiusKm=&limit=   nearby summaries, closest first
GET    /api/trails/:id                          full trail
POST   /api/trails                              publish -> { id, deleteToken }
DELETE /api/trails/:id     X-Delete-Token       unpublish
```

The server assigns ids, recomputes stats from the geometry (never trusts the client), caps sizes, only accepts JPEG data-URL photos, and rate-limits uploads. Storage is one JSON file per trail; swap `TrailStore` for PostGIS in production.

## Meta glasses integration: honest status

The guide screen turns guidance into a small JSON **HUD frame** (`hudFrame()` in `glasses.js`): arrow angle *relative to where the wearer is facing*, a headline ("Turn left"), a distance, progress. Adapters consume frames:

- **`VoiceAdapter`, works today, no SDK.** Spoken cues use the browser's speech synthesis; audio from a phone plays through paired Bluetooth devices, including Meta glasses' speakers. Non-display Meta glasses can therefore already be guided by voice.
- **`HapticAdapter`**: phone vibration on turns/off-trail (Android browsers; iOS Safari does not support it).
- **`PreviewAdapter`**: renders the exact frame a display would show (black background = transparent on a see-through display). The **Glasses view** button shows it fullscreen.
- **`MetaDisplayAdapter`, a stub.** `available()` returns `false`. I have **not** integrated with any Meta SDK. To do so you need Meta's current developer access for their glasses (check their docs; what is exposed, camera, audio, display, sensors, differs by glasses model and is changing). The adapter documents the three things needed: `send(frame)` to draw a frame, `heading()` to return the wearer's head yaw from the glasses' IMU (so the arrow points where you should *look*, like an AR arrow), and `capturePhoto()` for photo waypoints from the glasses camera. Heading priority is already wired: glasses > phone compass > GPS course.

Realistic path: (1) ship the phone app with voice cues now; (2) build a small native/companion app that receives frames and renders them once display access is available; (3) later, glasses-camera photo waypoints.

## Known limitations (read before demoing to anyone)

- **Not tested on real phones or glasses.** The logic is well tested and the UI was exercised in headless Chromium with simulated GPS, but the compass, the iOS permission prompt, wake lock, speech and vibration paths have not been verified on real devices.
- **Compass assumes the phone is held roughly flat**; held upright it will be wrong. Without a compass the arrow follows your direction of travel (works once you're moving), which is the reliable mode.
- **No background tracking.** A web page can't keep GPS running with the screen off; the app holds a screen wake lock. A real product needs a native app (or glasses-side app) for battery-friendly background guidance.
- **No accounts or moderation.** Anyone can publish; deletion is by owner token only. Before going public you need accounts, reporting/moderation, and abuse controls beyond the simple rate limit.
- **Trails are single recordings.** GPS error means a lone recording can be off by several metres and can include wrong turns. The big quality lever is merging many recordings of the same route into a consensus path and confidence score (the "every hike improves the trail" loop).
- **Safety.** A wrong arrow near a cliff, or a hazard marker that's stale, has real consequences. Needs disclaimers, hazard freshness/reporting, and never presenting guidance as authoritative.

## Privacy, and the camera question

The original idea mentions recording with the glasses' camera. Continuous filming while hiking would capture strangers, and glasses cameras are already a public-trust and legal issue in many places (recording laws, park and trailhead rules). So this prototype deliberately does **not** record video: it stores the **GPS track** and lets the user take **individual, deliberate photos** for waypoints. Photos are re-encoded in the browser (which strips EXIF/GPS metadata), stay on the device by default, and are only uploaded if the user ticks *Include photos* when publishing, with a warning that they may show people. If you later add camera-based features (e.g. visual trail-following when GPS is poor), do it on-device and don't retain or upload raw frames.

## Security notes

- Trail names, notes and photos come from strangers. The UI builds DOM with `textContent` (never `innerHTML` with user data) and the server sends a strict CSP (`script-src 'self'`, no inline styles/scripts), so a hostile trail can't run script.
- Static serving is path-traversal safe; ids are validated as UUIDs; upload size, point/waypoint counts and photo type/size are capped.

## Next steps (suggested order)

1. Test on real phones outdoors; tune thresholds (`guide.js` DEFAULTS) against real GPS.
2. Seed the map with existing data (import OpenStreetMap / public GPX). The cold-start problem (no trails yet) is the biggest product risk; GPX import already exists.
3. Multi-recording merge + trail confidence.
4. Accounts, moderation, hazard reports with expiry.
5. Companion app for Meta display glasses; native app for background guidance.
