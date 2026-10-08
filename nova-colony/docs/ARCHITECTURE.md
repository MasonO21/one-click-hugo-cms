# Nova Colony — Architecture & Team Contracts

Read this fully before writing code. The full game spec is in `docs/SPEC.md`.

## Stack

- **TypeScript + Vite** web app, **three.js** stylized low-poly 3D, DOM/CSS overlay UI, procedural **WebAudio**.
- Packaged for **iOS / Android with Capacitor** (`capacitor.config.ts`, native adapters in `src/platform`).
- **Vitest** for headless simulation tests (`tests/`). Chromium + Playwright available for screenshots.
- No binary audio or 3D model assets: all models are procedural three.js geometry, all sounds are synthesized. The only shipped
  images are the 2D WebP illustrations in `public/art` (resource icons, portraits, tiers, …) — see `docs/ART.md`; the UI looks
  them up through `src/ui/art.ts` and always falls back to the emoji in the data.

## Layers (strict)

```
src/core      Game, EventBus, GameState (save model), view/input/derived state, helpers  (lead-owned)
src/data      schema.ts (contract, lead-owned) + content files (data agent)
src/sim       headless simulation systems — NO DOM, NO three.js (unit-testable)
src/platform  save, ads, IAP, analytics, haptics, cloud — behind interfaces in platform/types.ts
src/render    three.js — reads state/derived/view, listens to bus, never mutates game.state
src/ui        DOM overlay — reads state, calls system methods, writes game.input / game.view
src/audio     WebAudio — listens to bus
```

Data flow: **UI → system methods → state mutation → bus events → render/ui/audio react**.
Render and UI read `game.state` directly every frame (cheap, no copying).

## Ownership (one owner per file; never edit files you don't own)

| Area | Files | Owner |
|---|---|---|
| Core engine & contracts | `src/core/*`, `src/data/schema.ts`, `src/data/index.ts`, `src/sim/System.ts`, `src/platform/types.ts`, `src/platform/mock.ts`, `src/render/api.ts`, `src/main.ts` | lead |
| Content & balance data | `src/data/*.ts` except schema/index/names | data agent |
| Colonist names/bios | `src/data/names.ts` | names agent |
| Construction | `src/sim/buildings.ts` (+ new `src/sim/build/*`) | construction/economy agent |
| Economy, research, crafting, tiers, offline | `src/sim/economy.ts`, `research.ts`, `crafting.ts`, `progression.ts` (+ `src/sim/econ/*`) | construction/economy agent |
| Colonists | `src/sim/colonists.ts` (+ `src/sim/colony/*`) | colonists agent |
| Combat & invasions | `src/sim/combat.ts` (+ `src/sim/combat/*`) | combat agent |
| World, player, exploration, vehicles, world events | `src/sim/world.ts`, `player.ts`, `worldEvents.ts` (+ `src/sim/world/*`) | world agent |
| Expeditions & the Frontier (squads, hauls, Star Chart) | `src/sim/expeditions.ts` (+ `src/sim/expedition/*`), content in `src/data/expeditions.ts` | expeditions |
| Missions, tutorial, live-ops, monetization, save, platform adapters, Capacitor | `src/sim/missions.ts`, `tutorial.ts`, `liveops.ts`, `src/platform/*` (except types/mock), `capacitor.config.ts`, native project files | meta agent |
| Achievements & the Colony Journal | `src/sim/achievements.ts` (+ `src/sim/meta/achievementRules.ts`), content in `src/data/achievements.ts`, `src/platform/achievements.ts`, UI `src/ui/panels/JournalPanel.ts` + `src/ui/logic/achievements.ts` | achievements |
| Rendering | `src/render/*` (except api.ts) | render agent |
| UI | `src/ui/*`, `src/ui/styles/*` | ui agent |
| Audio | `src/audio/*` | audio agent |

Tests: put yours in `tests/<area>.*.test.ts` (e.g. `tests/combat.flowfield.test.ts`).

## Extending shared types without editing shared files

TypeScript declaration merging — do it from **your own** file:

```ts
declare module '../core/state' { interface CombatState { myNewField?: number } }      // persistent field (init lazily!)
declare module '../core/events' { interface GameEvents { 'combat:myEvent': { x: number } } }
declare module '../data/schema' { interface AlienDef { armor?: number } }              // optional content field
```

Need a method on another agent's system that doesn't exist yet? Don't edit their file. Read the
state directly (all state is plain data) or write a local helper, and list the request in your final
report so the lead can reconcile during integration.

**Public method signatures in the stub files are contracts.** Implement them; you may add new public
methods; do not rename/remove/change existing signatures.

## Conventions

- World: X/Z plane, Y up, origin = crash site/colony core. `CELL = 2` world units, `WORLD_CELLS = 256`
  (world spans −256..256). Helpers in `src/core/constants.ts` (`cellOf`, `cellCenter`, `cellMin`,
  `cellIndex`, `rotatedSize`, `footprintCenter`).
- Buildings: `(x, z)` = min-corner cell; footprint `def.size` swapped when `rot` is 1 or 3.
  The core (`command_center`, 3×3) is placed with its center at the origin on a new game.
- Units: time in seconds, rates **per minute**, ranges in **cells** in data (convert ×CELL to world units).
- Clocks: `state.playTime` (online seconds) for gameplay timers; `game.now()` epoch ms for real-world
  timers (daily, boosts, VIP, ads, offline). Never call `Date.now()` in sim code — use `game.now()`.
- Randomness in sim: `game.rng` (seeded). World generation must be deterministic from `state.seed`.
- Content ids: only `ANCHOR_IDS` in `schema.ts` may be hard-coded. Everything else is driven by def
  fields (`storage`, `produces`, `turret`, `housing`, `research_rate`, `station`, `factory`, …).
- Rewards: always go through `game.grant(reward, source, x?, z?)`.
- Presentation requests from sim: emit `ui:toast`, `ui:float`, `ui:celebrate`, `sfx`, `fx:shake`.
- Performance: no per-frame allocations in hot loops where avoidable; object pools for aliens,
  projectiles, particles; instanced meshes for repeated geometry; simulation shortcuts for
  off-screen colonists/factories. Target 60 fps on mid-range phones with 300+ buildings, 50 colonists,
  100 aliens.
- Graphics quality: the renderer reads only `settings.quality`. With `settings.qualityMode = 'auto'` (new
  installs) `src/platform/autoQuality.ts` owns it: a once-per-device pick at boot (`deviceQuality.ts`, from
  `Renderer.init`'s `onContext` hook) and a frame-rate governor (`qualityGovernor.ts`) that only ever steps
  down. The Settings panel switches modes through `game.autoQuality` (`setManual` / `enableAuto`).

## Camera & movement convention (render ⇄ player ⇄ UI)

- `view.camera.yaw` (radians): the camera sits at `target + (sin(yaw)·d, h, cos(yaw)·d)` looking at the
  target (the player in 'follow' mode, `(tx, tz)` in 'overview' mode). `view.camera.zoom` 0..1 → distance.
- Ground-plane camera forward = `(-sin yaw, -cos yaw)`, camera right = `(cos yaw, -sin yaw)`.
- Joystick (`input.moveX` right, `input.moveY` up) → world direction
  `dx = moveX·cos(yaw) − moveY·sin(yaw)`, `dz = −moveX·sin(yaw) − moveY·cos(yaw)`.
- Facing `rot` for characters/buildings: rotation about +Y, `rot = atan2(dx, dz)` (0 faces +Z).

## Sound ids (emit `bus.emit('sfx', { id })`; audio also reacts to gameplay events directly)

`ui_click ui_open ui_close ui_error ui_tab · gather_wood gather_stone gather_plant gather_crystal gather_metal ·
place build_complete upgrade remove deposit collect coin reward crate_open · craft_start craft_done research_done ·
mission_done level_up tier_up celebrate · alarm attack_start victory · turret_bullet turret_flame turret_missile
turret_laser turret_plasma turret_rail turret_cannon · alien_hit alien_die explosion shield_hit player_hurt ·
spin_tick spin_win door vehicle_start teleport recruit discover`

## Panels (UI opens on `bus.emit('ui:open', { panel, arg })`)

`build colonists recruit research craft inventory map missions shop season daily spin settings welcome victory
building(arg=id) colony merchant(arg=eventId) vehicles expeditions(arg={ dest?, tab? }) journal(arg={ tab?: 'medals' | 'records' })`. UI element hooks for tutorial highlighting:
`#btn-build #btn-colonists #btn-research #btn-craft #btn-map #btn-missions #btn-shop #btn-menu #btn-interact`,
panels `[data-panel="<name>"]`, build cards `[data-build="<defId>"]`, research nodes `[data-research="<id>"]`.

## Cozy design rules (every system)

1. Never punish: no permadeath, buildings are never destroyed (0 HP → "damaged", auto-repairs free),
   colonists never die or leave, removing a building refunds 100%, moving is free.
2. Constant progress: something rewarding every 1–3 minutes; numbers float up; resources fly to HUD.
3. Problems are small and solvable (low food → happiness bonus shrinks, never starvation).
4. Manual → assisted → automated → extremely powerful.
5. Ads are optional and genuinely useful; every gameplay system is reachable free.

## Lifecycle

`new Game(opts)` → `game.start()` (systems `init()` then `onLoad(fresh)`; offline summary computed;
`game:ready`) → each frame `game.update(dt)` (systems in `UPDATE_ORDER`, see `Game.ts`) →
`renderer.render(dt)` → `ui.update(dt)` → `audio.update(dt)`.

On a **fresh** game, `onLoad(true)` responsibilities:
- economy: grant `data.starterKit.resources`; compute derived.
- buildings: place the core (`command_center`) centered on the origin, status active, set `colony.coreId`.
- player (world agent): equip `starterKit` items, stand next to the pod.
- world: generate world, unlock + discover `crash_valley` (and any region whose unlock is empty).
- missions: activate `data.firstMission` + side missions.
- liveops: init season id, free-crate timer.
- colonists: create the initial candidate pool (recruitment needs a `recruit` building though).
- combat: phase 'peace', `nextAt = Infinity` until the tutorial mission schedules the first attack
  (`MissionDef.onComplete.attack` → `combat.schedule(delay, warning)`); after the first victory,
  regular invasions every `TierDef.invasionInterval` seconds.

## Testing & checks

- `npm run typecheck`, `npm test`, `npm run build` must pass for your files.
- Prefer deterministic tests using `new Game({ seed, clock })` and stepping `game.update(dt)`.
- In a worktree, symlink node_modules instead of installing:
  `ln -s /home/user/one-click-hugo-cms/nova-colony/node_modules nova-colony/node_modules`
