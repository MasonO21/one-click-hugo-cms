# 🌭 Sizzle Flip

A polished mobile physics game about flipping a squishy sausage out of a frying pan, onto random household objects, and — eventually — into a hot dog bun.

Inspired by the one-button chaos of *a weird game about sausage*, rebuilt for phones with touch controls and **200 hand-tuned, machine-verified levels** across 10 worlds.

| | |
|---|---|
| **Platforms** | iOS & Android (installable PWA, works offline) · Capacitor native shell for the App Store / Play Store · any desktop browser |
| **Controls** | Drag back anywhere, aim with the trajectory guide, release to flip. Land on things, flip again. |
| **Content** | 10 worlds × 20 levels, 600 stars, 12 unlockable sausage skins, 17 trophies, route hints, per-level par & best scores |
| **Tech** | Vanilla JS + Canvas 2D, custom deterministic soft-body physics, procedural vector art, synthesized audio — zero image/audio assets |

## The worlds

1. **The Kitchen** – toasters that pop you sky-high, slippery butter, knife blocks, boiling pots, timed burners
2. **Living Room** – bouncy couches, a sleeping cat, rotating clock hands, sticky beanbags, the fireplace
3. **Backyard BBQ** – trampolines, swings, leaf blowers, sprinkler geysers, flaring grills, and a very good dog
4. **Splish Splash** – soap, rubber ducks, shower downdrafts, hair dryers, the toilet (don't)
5. **The Office** – rolling chairs, desk fans, shredders, conveyor belts, hover-bots
6. **Toy Box** – drums, jack-in-the-boxes, toy trains, balloon baskets, giant pinwheels
7. **Supermarket** – checkout belts, rolling carts, icy freezers, the deli slicer, lobster tanks
8. **Sandy Shores** – the ocean below, crabs, seagulls, beach balls, bobbing buoys
9. **Frank in Space** – low gravity, lasers, gravity lifts, spinning satellites, UFOs
10. **Hot Dog Heaven** – clouds, giant condiments, donuts, deep fryers, forks… and the final flip

## Play it

```bash
npm install
npm run dev        # http://localhost:8123  (no build step needed while developing)
npm run build      # → dist/  single-file index.html + PWA manifest + service worker + icons
```

Deploy `dist/` to any static host (Netlify, GitHub Pages, Vercel…). On a phone, open the URL and **Add to Home Screen** — it runs full-screen and offline.

Dev URL flags: `?level=37` jump to a level · `?debug` collision overlay + all worlds unlocked · `?nosw` skip the service worker.

## Native app store builds (Capacitor)

The repo already contains a configured Android project (`android/`, portrait-locked, icons + splash generated from the game's own art). iOS is one command on a Mac.

```bash
npm run build && npx cap sync           # copy the web build into the native projects
npx cap open android                    # Android Studio → Build → Generate Signed Bundle (AAB)
npx cap add ios && npx cap open ios     # on macOS with Xcode → Archive → App Store Connect
```

Native extras are wired in automatically when running inside Capacitor: real haptics (`@capacitor/haptics`) and a hidden status bar (`@capacitor/status-bar`).

## How the levels are made (and why they're all beatable)

Levels are built by `tools/generate.mjs` from per-world *recipes* (which props, hazards and mechanics are unlocked at each level, with the tutorial tip that introduces them) and a difficulty curve (target par, level height, obstacle density).

Every candidate level is then **played by a bot**: `tools/solver.mjs` beam-searches thousands of flips per resting position using the *exact same deterministic physics* the game runs and finds the fewest-flip route. Each shot on that route is re-fired with human-sized mistakes (aim ±1.2°, power ±2%, reaction time ±0.06 s) and must still work a set fraction of the time — high for early levels, lower as the game gets harder — so no level depends on a pixel-perfect shot. Impossible, trivial or fragile levels are rejected and rebuilt. The winning route is stored with the level and **replayed continuously** to prove it reproduces; that same route powers the in-game 💡 hint and the title-screen demo.

`node tools/qa.mjs` re-plays every stored route with random human error and reports a success rate per level.

```bash
node tools/generate.mjs --workers 4             # (re)generate all 200 levels → src/levels/data.js
node tools/generate.mjs --only 41 --force       # regenerate a single level
```

QA pages (serve the folder, then open):

- `tools/levelview.html?src=game&ids=0,1,2` — whole levels with the solver's route traced
- `tools/gallery.html?world=kitchen&debug=1` — every prop of a world with its collision outline
- `tools/faces.html` — the sausage's expression sheet

## Project layout

```
index.html, styles.css      app shell + menus (DOM) and the game canvas
src/main.js                 boot, loop, input routing, progression, save data
src/game.js                 one level session: sim, aiming, camera, effects, rendering
src/physics.js              deterministic position-based soft-body physics (shared with the solver)
src/objects.js              prop library: collision shapes, materials, roles (10 worlds, 100+ props)
src/art/                    procedural vector art: sausage + face, props per world, backgrounds, logo
src/audio.js                synthesized SFX + per-world procedural music
src/levels/data.js          the 200 generated & verified levels
tools/                      generator, solver, build, QA pages, icon renderer
android/                    Capacitor Android project
```

## Credits

Everything — code, art, sound and music — is generated from code in this repo. Fonts: [Lilita One](https://fonts.google.com/specimen/Lilita+One) and [Fredoka](https://fonts.google.com/specimen/Fredoka), SIL Open Font License (see `assets/fonts/`).
