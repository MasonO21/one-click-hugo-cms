# Little Lives: Snow Globe Factory — Implementation Plan

> Status legend used throughout: **✅ Implemented & verified** (compiled and covered by automated tests),
> **🟡 Implemented, not yet run in Unity** (code written and type-checked against Unity reference
> assemblies, but never executed in the editor), **⬜ Planned**.

---

## 0. Where things stand

| Area | Status | Notes |
|---|---|---|
| Simulation core (products, economy, suspicion, director, days, saves) | ✅ | Engine-free C#; 103 NUnit tests pass under .NET 8 with C# 9 (Unity 6's language level) |
| Unity layer (greybox building, player, carrying, stations, customers, horror, HUD, audio) | 🟡 | Compiles against Unity 2021.3 reference assemblies (with Unity 6 renames mapped). **Never run in the editor.** Expect tuning and bug-fix work in Milestone 2 |
| Input System package path | 🟡 | Written but not compiled (package not available outside Unity) |
| Automation: auto-prep hopper, conveyor, packaging machine, breakdowns/repair, manual override, safe blocking | ✅ core · 🟡 scene | 10 core tests, including a randomized "no product ever lost" property test and a simulated day (16 globes vs ~5–6 by hand) |
| Unity-side tests (JsonUtility round trip, figure build, play-mode smoke tests of boot/line/automation/save-load) | 🟡 | Written and type-checked; they run in Unity's Test Runner, not here |
| Customers & orders: up to 3 shoppers with a counter queue, customers picking globes up (day 4+), special orders board, Woodland Cabin theme, store appeal | ✅ core · 🟡 scene | 12 core tests; a play-mode test covers order pickup |
| Horror & roster: Screamer, Escape Artist, Watcher, Performer behaviours; security cameras; conveyor-grab and cabinet-shift events; supplier notes | ✅ core · 🟡 scene | 9 core tests; play-mode tests for the camera desk and the Escape Artist |
| All six themes: bespoke scenery and fill (ash, sea water, star-dust) plus a production twist each | ✅ core · 🟡 scene | 4 core tests: Medieval needs the jig, Celestial needs the Improved Sealer, Haunted hides twitches (×0.6) and Deep-Sea shows them (×1.4) |
| Story (H.'s ledger) and late-game sinks: Sealing Press, Rewired Fuse Box, Window Display, Shop Assistant, electricity bills | ✅ core · 🟡 scene | 14 core tests. Five ledger chapters end in a choice (§5e). Globes for H. go down in the freight-lift crate |
| Economy balance pass | ✅ second pass | `tools/BalanceSim` runs 30 days of the real core with a scripted player. Report and tuning are in [`BALANCE.md`](BALANCE.md) |
| Level rebuilt from the three concept paintings; minis restyled to the character reference | 🟡 | Procedural reconstruction (see §5a). Floor plan: `docs/floorplan.png` |
| Real modelled art, animation, UI Toolkit, audio design | ⬜ | Everything is still built from primitives and synthesized sound |

---

## 1. The finished game in one paragraph

*Little Lives: Snow Globe Factory* is a first-person shop-and-factory sim with a horror secret. Upstairs is a cosy
winter gift shop with a music box playing. You sell hand-posed snow globes of tiny figures. The figures are
alive. Every globe starts in the basement as a small, wobbly person who looks at you, and it goes through a line
you build and run yourself: prepare, pose, decorate, seal, inspect, box, display, sell. Over days and
weeks you automate the line, unlock pricier themes and stranger characters, and fight to keep the shop's
secret from customers who notice twitching figures, muffled voices and things running across the floor.
The horror is in the business itself, not in gore. Physics is goofy when things go right and unsettling when
they go wrong.

## 2. Core loop and main decisions

```
 Basement            Backroom line                                   Storefront
 ┌────────┐   carry  ┌───────┐  ┌────────┐  ┌──────┐  ┌───────────┐  ┌──────────┐  carry  ┌──────┐  ┌─────────┐
 │Cabinets│ ───────► │Cradle │─►│Assembly│─►│Sealer│─►│Inspection?│─►│Packaging │ ──────► │Shelf │─►│ Counter │─► $$
 │ + lift │          │(serum)│  │pose/   │  │dome +│  │ (optional)│  │fold/tape │         │unbox │  │  sale   │
 └────────┘          └───────┘  │scenery/│  │seal  │  └───────────┘  └──────────┘         └──────┘  └─────────┘
      ▲                         │snow    │  └──────┘                                            │
      │                         └────────┘       serum countdown runs Prepared→Domed            │
      └──── reinvest: supplies, characters, upgrades ◄──────────────────────────────────────────┘
```

**Minute-to-minute:** carry a character upstairs, run 5 short station interactions before the Stillness
Serum countdown ends, carry the box to a shelf, serve whoever rings the bell.
**Day-to-day:** decide when to open, when to close early, what to buy, which upgrade to take.

Main decisions the player makes:

1. **Speed or quality.** Skilled station play raises quality and price. Rushing keeps the serum timer safe.
2. **Inspect or skip.** Inspection costs time and gives a certified +10% price. It also reveals weak seals, and certified globes are never returned. Skipping saves time but risks a figure moving on the shelf.
3. **Serve or produce.** A customer at the bell while a prepared character's serum is running out. Re-dose ($2), or let the customer wait?
4. **Contain or cover up.** When a globe twitches in front of a customer: pull it off the shelf, chat to distract, offer an exchange, or hope they didn't see it.
5. **What to buy.** A cheap reliability upgrade now, or save several days for a big automation purchase that uses more power (and so raises power-failure risk).
6. **When to open.** Before opening, time is frozen and you can build stock. Once open, the clock runs. Closing early is safe but earns less.

## 3. Design conflicts and how they're resolved

| # | Conflict | Resolution (implemented unless marked ⬜) |
|---|---|---|
| 1 | Chaotic physics vs precise factory work | Only *loose* characters are physics-driven: an upright torque plus hop locomotion, a stable approximation of an active ragdoll. Anything in a station, shelf or cabinet is kinematic. Releasing an item near a valid spot snaps it in. Minigames use keys and timing, not physics precision |
| 2 | Cosy business pacing vs horror | The event director cycles **Calm → Unease → Emergency → Relief**, with cooldowns and a relief window. Day 1 has no threats. A director threat never stacks on top of a natural crisis |
| 3 | Fair suspicion vs scary randomness | Suspicion only rises from evidence a customer could perceive: line of sight plus distance, or sound leaking through doors and soundproofing. **Atmospheric scares never create suspicion.** Threats always give warning signs first (6–8 s) |
| 4 | Variety of minigames vs repetitive tedium | Each station interaction takes 3–8 s and uses a different verb (timing dial, rotate + pose, pick + hold-fill, swing-drop, mouse scan, key sequence). ⬜ Automation replaces any station at a capped "good" quality, so staying manual is a quality choice, not a chore |
| 5 | Serum timer pressure vs serving customers | A 60 s base window covers one practised cycle. Warnings come at 15 s (HUD, tick sound, trembling). A $2 re-dose works anywhere, and the prototype has one customer at a time |
| 6 | Inspection that lowers price would never be used | Seal integrity affects **risk**, not price. Inspection gives +10% and protection from returns |
| 7 | Pulling a suspicious globe should not be punished | Lifting a displayed globe puts it back in its own box, so no new box is used |
| 8 | Saving a physics-heavy world | Saves are only allowed when the shop is closed and no emergency is running. A checkpoint is saved automatically every morning. `SaveValidator` repairs any inconsistency (carried → safe spot, escaped → recaptured, bad shelf links cleared) and never deletes a product |
| 9 | Business closure fail state vs relaxed play | Closure needs exposure ≥ 90, at least 3 serious incidents, **and** a warning on an earlier day. Recovery reloads that morning's checkpoint |
| 10 | Unavoidable bankruptcy | Bills you can't pay become debt, not negative cash. An emergency supply order (2 full units, $40 of debt) is offered when you are broke and have nothing to sell. Debt is repaid from 50% of each sale |
| 11 | Dark premise vs "no gore" | Serum and stasis are clearly fictional: a charge count, a countdown and an integrity number. There is no action that harms a character. A rejected globe returns its character, unharmed, to holding. The horror comes from atmosphere and implication |
| 12 | "Tiny" vs readable and grabbable in first person | Characters are about 24 cm tall with big heads and eyes. Globes are about 30 cm. The camera near-clip is 3 cm |
| 13 | "Basement beneath the backroom" vs simple greybox geometry | The basement is a tall vault behind and below the backroom, 4 m down by a flight of stairs. No holes in the floor are needed |
| 14 | Upgrades "after closing" vs instant fixes | Upgrades can be bought only while closed. Supplies and characters can be ordered at any time |

## 4. Prototype scope (Milestone 1 — what the code in this folder covers)

In: one compact building (shop, backroom, basement); one archetype (**The Sleepy One**; others exist as data);
one globe theme (Winter Village); manual prep/assembly/sealing/inspection/packaging; one customer at a time;
movement-based suspicion from weak seals (from day 2); cash + purchasable upgrades (three core ones plus three more
pure-modifier ones); save/load + morning checkpoint; one escape event (telegraphed cabinet break-out) and one malfunction
(power failure, scripted on day 5); subtitles, camera-shake slider, reduced-flicker toggle; procedural placeholder
art and audio.

Out (deliberately): multiplayer, procedural buildings, employee AI, story campaign, conveyors/automation, multiple
simultaneous customers, special orders, other themes, security cameras.

## 5. Scene structure and software architecture

### Scene

A single scene containing one `GameBootstrap` component. At runtime `LevelBuilder` generates everything:

```
SnowGlobeFactory (GameBootstrap → GameRoot, HorrorDirectorRunner, Hud)
├── Level
│   ├── Storefront   z 0..10  arched window, glass door, lit wall shelves (6 slots), round display (+4 premium slots), counter + bell, OPEN sign, hallway to STAFF ONLY
│   ├── Backroom     z 13..23 Prep cradle, Assembly worktable, Sealer, Inspection lamp, Packaging, supplies, sealed freight lift, basement door
│   └── Basement     z 23..39 (y -4) stairs, glass cabinets A1–E5, freight lift + delivery crate, pillar, trays, crates, breaker, security desk
├── Audio (AudioKit: synthesized music box, bell, scratches, mumbles, hum…)
├── Player (CharacterController + PlayerController + PlayerInteractor, camera child)
├── Customers (CustomerSpawner → CustomerAgent*)
└── Product_* (ProductView per living character / globe)
```

### Code layers

```
Assets/_Project/Scripts/
├── Core/     (asmdef SnowGlobe.Core, noEngineReferences = true)  ← all rules, 100% unit-testable
│   ├── GameSession.cs            facade wiring every service around one GameState
│   ├── Common/                   DeterministicRandom (serializable), GameBalance (tuning), ActionResult
│   ├── Characters/Archetypes.cs  7 archetypes: value, movement, noise, prep duration, special behaviour
│   ├── Production/               Product + ProductStage state machine, ProductionService, QualityModel, Themes
│   ├── Economy/                  Wallet (cash/debt), Inventory, SupplyService (+ emergency order), Upgrades
│   ├── Store/StoreService.cs     display slots, reservations, sale (exactly-once payment)
│   ├── Suspicion/                Evidence catalog, CustomerSuspicion (4 stages + floor), BusinessExposure
│   ├── Events/EventDirector.cs   tension rhythm, cooldowns, atmospheric vs threat, scripted incidents
│   ├── Days/DayCycle.cs          phases, clock, closing bills, returns, DayProgression
│   └── Save/                     GameState (is the save file), SaveValidator (repair on load)
├── Runtime/  (asmdef SnowGlobe.Runtime → Core)                   ← presentation + input + physics
│   ├── GameRoot.cs               composition root; ticks the session; maps sim events → sights/sounds
│   ├── GameBootstrap.cs, SaveSystem.cs (JsonUtility)
│   ├── World/                    LevelBuilder, Level anchors, SnapSocket, Door, holding cabinets, shelf slots, counter, sign, breaker, lights
│   ├── Player/                   PlayerController (FPS), PlayerInteractor (look/grab/carry/place/route E-X-Q)
│   ├── Products/                 ProductView (one per Product), FigureBuilder + MiniCharacterBody (felt-hat minis)
│   ├── Stations/                 StationBase + five station minigames
│   ├── Customers/                CustomerAgent (perception + shopping FSM), CustomerSpawner
│   ├── Horror/                   HorrorDirectorRunner (stages director events)
│   ├── UI/Hud.cs                 IMGUI placeholder: world-anchored labels, menus, summary, settings
│   └── Infrastructure/           GameInput (legacy + Input System), Settings, Shapes/Palette, AudioKit
├── Editor/                       "Snow Globe Factory → Create Prototype Scene" menu
└── ../Tests/EditMode/            NUnit tests (run in Unity Test Runner AND via `dotnet test`)
```

**Key rules of the architecture**

* **One source of truth.** `GameState` holds every product, its stage, timers and location. Views only mirror it.
  Every stage change goes through `ProductionService` or `StoreService`. Each checks that the transition is legal and returns an `ActionResult` whose message is shown to the player.
* **Explicit product states**: `Unprepared → Prepared → Mounted → Decorated → Domed → Sealed → (Inspected) → Packaged → Displayed → Sold`.
  The product's id *is* the character's identity, from the basement to the shopping bag.
* **Locations are explicit** (`Holding(room)`, `Station(id)`, `Shelf(slot)`, `Floor(xyz)`, `Loose(xyz)`, `Hatch`, `Carried`, `Gone`),
  so any saved state can be rebuilt without guessing.
* **Upgrades are data.** Systems read an aggregated `UpgradeModifiers` struct, never upgrade ids.
* **Deterministic randomness** (`DeterministicRandom`, whose state is saved). Seal defects, events and returns replay the same way after a load.
* **Guarantees enforced and tested:** no double sale, no payment without a displayed and reserved globe, one globe per slot, no product
  lost on load, and no suspicion without perceived evidence.

## 5a. Map and character art direction (from the concept art)

The level is a procedural reconstruction of the three paintings in `docs/concept/`. Unity can't turn a 2D painting into a room, so `LevelBuilder` rebuilds each one: its layout, props, palette (teal and navy woodwork, brass, cream plaster, warm pools of light) and lettering. The window views, title card and all signage are textures made by `tools/art/generate_art.py`: crops of the paintings, plus plaques drawn to match their lettering.

| Room | Concept | Built as |
|---|---|---|
| Storefront | `storefront.webp` | Tall arched window onto the snowy town (cropped from the painting), glass front door that opens with the shop, lit teal shelving on both walls with 6 playable slots, round three-tier display (premium upgrade adds 4 slots on its front arc), gift boxes, brass chandelier, blue rug, hallway to a STAFF ONLY door, and the globe with a hand pressed against the glass |
| Backroom | `backroom.webp` | Long central worktable (Assembly) with domes, snow jar, tree trays and work order; brass-lamp desk (Inspection); snowy side window; GLASS DOMES/BASES/… crate; supply shelves of jars; sealed FREIGHT LIFT TO BASEMENT; SHIPMENTS clipboard; SMALL WORLDS BRIGHTER PEOPLE; snowflake banners; carts of finished globes |
| Basement | `basement.webp` | 6.4 m teal vault with ribs and pipes; glass cabinet wall A1–E5 with a rolling ladder (rows 1–2 are the 10 usable holding cells, rows 3–5 are "long-term stock"); decorative cabinet bank; pillar sign SMALL LIVES BRIGHTER WORLDS; stairs up TO PRODUCTION; freight lift where deliveries arrive; miniature-room table; COATS/DRESSES/HATS/SCARVES trays; WINTER/EVERYDAY/HOLIDAY/ACCESSORIES crates; lanterns; breaker; security desk |

Gameplay changes that came with the map:

* **Holding** is now glass cabinets. E opens a cabinet's glass door, and a character can only be taken out or put back while it's open. Escape attempts are tapping on one cabinet's glass: reach it within 8 s to press it shut.
* **Deliveries** arrive in the basement freight lift (call light blinks, gate must be opened).
* **The front door** opens with the OPEN sign and closes after the last customer.
* **Customers** walk around the round display using an 8-point waypoint ring.

**Character look** (from the character reference): ~30 cm elfin minis with a tall floppy felt hat and a dangling brass star, a chunky fringed scarf, a flared coat with brass buttons, knit cuffs and mittens held together in front, bloomers, knit socks, chunky boots, pale messy hair, pointed ears, big dark eyes with glints and rosy cheeks. About 40% wear the exact reference palette (navy/red/pale blond); the rest vary coat, scarf and hair colour. The Sleepy One has heavy half-closed lids. The hat segments and scarf tail are spring-driven, so they flop when a mini is carried, runs or twitches. Globes were enlarged (dome ⌀34 cm) to fit the hats.

## 5b. Automation (Milestone 3)

Each machine is an upgrade. Once installed it appears in the backroom with a control panel. On the panel, **E** switches between AUTOMATIC and MANUAL (the manual override), and **X** repairs a breakdown ($15) or services a worn machine ($5).

| Machine | What it does | Blocks safely when… | Trade-off |
|---|---|---|---|
| Automated Prep ($1000) | Drop up to 3 awake characters in the hopper beside the cradle. It feeds them into the cradle one at a time and injects them (timing score 0.6) | a prepared character is still in the cradle, or serum runs out | +2 power, average serum window |
| Short Conveyor ($250) | Pulls sealed globes off the sealer and carries them along the right wall to the packaging table (6 s, up to 3 spaced items) | the packaging table is occupied (the belt stops) | +1 power; Heavy globes can jam it (35%) |
| Packaging Machine ($650) | Boxes whatever lands on the packaging table (4 s, packaging score capped at 0.7), then moves the box to a 4-slot output rack | boxes run out, or the rack is full (the box stays on the table, which in turn stops the belt) | Hand folding scores up to 1.0 |

Every machine wears 4% per item (6% when the building is over its power budget). The chance of breaking grows as it wears. A broken or jammed machine just stops, and whatever it was holding stays put. Machines only ever move a product between explicit locations (hopper, cradle, belt, table, rack). `Product.Location` is still the single source of truth, so grabbing a globe off the belt simply takes it out of the machine's world.

## 5c. Customers, orders and themes (Milestone 4)

* **Crowds and the queue.** The number of shoppers allowed inside grows with the business: 1 on days 1–2, 2 on days 3–4, 3 from day 5. Buyers line up behind the counter, and only the front one can be rung up. Everyone in line loses patience. Leaving the line counts as a lost sale.
* **Store appeal.** Walk-ins arrive 0.7× as often with bare shelves and up to 1.3× with six or more globes on display, multiplied by the exposure penalty.
* **Handling (day 4+).** A browsing customer may pick up the globe they're looking at for a few seconds. While it's in their hands, a stasis twitch is seen at full perception. They drop it (15% damage) and suspicion jumps. A handled globe is reserved, so neither you nor another shopper can take it.
* **Theme preference.** Each shopper favours one unlocked theme and leans toward buying it.
* **Special orders (day 4+).** Each morning 1–2 orders are posted, with at most 3 open, each due 2 days later. An order names a theme, pose, three scenery pieces, a minimum quality tier, and optionally an archetype and inspection. The bonus is $15, plus $10 per quality tier, $10 for inspection and $10 for a specific archetype, times the theme's value. It's paid on top of the globe's normal price.
  * Pin an order at the board (E, or the Orders tab). The assembly card, and the theme mounted, then follow it.
  * Place the finished box on the counter's order-pickup spot. A match is paid immediately; a mismatch tells you exactly what's wrong.
* **Themes.** Woodland Cabin (day 4, $300) sells at ×1.25. It has lighter snow and its own scenery (tall pine, log cabin, deer), and costs $3 extra per kit at mount. The later themes (M7) each have bespoke scenery and a twist:
  * **Medieval Castle:** tower, banner, knight. It takes −0.25 dome alignment without the Assembly Jig.
  * **Haunted Manor:** dead tree, manor with a lit window, ghost lantern, and grey ash fill. Customers notice movement ×0.6.
  * **Deep-Sea Ruins:** column, coral, anchor, and translucent sea-water fill. Movement is noticed ×1.4.
  * **Celestial Observatory:** telescope, observatory dome, comet, and glowing star-dust fill. It can't be sealed without the Improved Sealer.
  * Prices and pacing are in §7 and `BALANCE.md`.

## 5d. Horror & roster (Milestone 5)

| Archetype | Behaviour now in the game |
|---|---|
| The Sleepy One | Heavy half-closed lids; cheap and calm |
| The Wiggler (day 3) | Squirms out of your grip while carried |
| The Performer (day 6) | Poses score +0.2. Customers' eyes are drawn to it (they pick it to look at, and linger 1.7× longer). Its twitches are 30% more noticeable |
| The Heavy One (day 7) | Slows you to 70% while carried; 35% chance to jam the conveyor |
| The Screamer (day 8) | Stress (from carrying, bad injections) multiplies how often and how loudly it makes noise in holding. While carried it can let out a muffled scream that carries through the doors like any other noise |
| The Escape Artist (day 10) | Left in an **open** cabinet, or alone in the prep cradle, with nobody within 3.5 m for 6 s, it bolts |
| The Watcher (day 12) | Never moves while the player or any customer is looking. It is never caught twitching, so it produces no evidence. When unseen it silently turns to face you. In the cabinets it freezes and stares back the moment you look at it |

* **Security Cameras** ($700, day 6, +1 power). The basement security desk monitor shows a live feed when you're near. Press E to sit and watch full-screen, cycling storefront, backroom and basement (A/D). Only the shown feed renders. While cameras are installed, any loose character triggers a "CAMERA: something small is loose in the BACKROOM" alert. Sometimes every figure in the cabinets turns to look into the basement lens.
* **Conveyor Grab** (threat, day 3+, only with globes on the belt). After a 5 s shudder the belt stalls: a figure is gripping the rail. Pry it loose at the conveyor panel (E), or it lets go after 25 s. The belt blocks safely meanwhile.
* **Cabinet Shift** (atmospheric, day 6+). A character is in a different cabinet than the one you left it in.
* **Supplier notes.** A note arrives in the crate on days 2, 3, 4, 5, 6, 8, 10 and 12. It's shown in the morning briefing and kept in the Notes tab, slowly revealing who "H." is.

## 5e. H.'s ledger and the late game (Milestone 7)

The story is a ledger of requests from H., the supplier. Each request arrives as a red envelope in the morning crate on its day, and stays open until it's answered. They come in order. Payment requests are money sinks with a lasting reward. Globe requests go down in the freight-lift crate: normally "deliveries only come in, never go out", but the crate takes a box that matches H.'s request, and H. pays a premium.

| # | Day | Request | Reward |
|---|---|---|---|
| 1 | 8 | **Dues:** $400 | Preferred account: characters cost 15% less |
| 2 | 12 | **A Sample:** a boxed Performer, Fine or better, any theme | H. pays 2× its value |
| 3 | 16 | **Machine Oil:** $1000 ("it comes from the same place they do") | Machines wear half as fast |
| 4 | 22 | **For the Window:** a Watcher in the Haunted Manor, inspected, Fine or better | H. pays 2.5× |
| 5 | 28 | **The Last Page:** $4000, then a choice | **Sign:** you become H.'s partner. The notes arrive in your handwriting and characters cost 40% less. **Tear it out:** the town forgets its suspicions (exposure → 0), but characters cost 25% more |

* **After the ending:** the economy keeps running and both endings change it, so the shop stays playable after the story (the M7 exit criterion).
* **Where it lives:**
  * The Notes tab shows the ledger (requests, replies and the open request, with its Pay / Sign / Tear buttons) above the crate notes.
  * `StoryState` is saved, and the save validator keeps the chapter and ending consistent.

**Late-game upgrades.** These address `BALANCE.md`'s finding that cash piled up with nothing to buy and output was capped by hand sealing.
* **Sealing Press** ($1800, day 12, +2 power): a brass ram over the sealing machine. It seats the dome (70% alignment, plus the jig's assist) and seals, 3 s per step. It has a manual override panel like the other machines, and it refuses Celestial without the Improved Sealer (it waits, and the panel says why).
* **Rewired Fuse Box** ($1200, day 10): power capacity 3 → 8. A fully automated line draws 9, so it still runs a little hot.
* **Window Display** ($1600, day 15): a lit stand of globes in the shop window, and ×1.25 walk-ins.
* **Electricity:** the nightly bill is $25 rent plus $6 per unit of power draw, so every machine has a running cost.
* **Shop Assistant** ($800, day 12): someone in a red apron behind the counter who rings up the waiting customer after 5 s. Costs $45 a night plus a 10% commission on every sale they ring up, so serving people yourself still pays. They only work the till: talking round a suspicious customer is still the player's job. This fixes the late-game counter bottleneck (`BALANCE.md`).

## 6. Milestone roadmap

| Milestone | Goal | Contents | Exit criteria |
|---|---|---|---|
| **M0 Foundations** ✅ | Rules engine | Core library + 53 tests | `dotnet test` green |
| **M1 Greybox loop** 🟡 | Whole loop playable in placeholder form | Everything in §4 | Code complete, compiles. **Needs a first editor run** |
| **M2 First playable** 🟡 | Make M1 actually fun and stable | Done without an editor: PlayMode smoke tests (boot, cabinet → sale, automation, save/load), JsonUtility round-trip test, animation LOD for distant minis. **Done in Unity 6.6:** all 102 EditMode and 8 PlayMode tests pass (fixed an edit-mode `Destroy` in `Shapes` and a float-precision assertion; PlayMode tests no longer touch the player's real saves); FPS check passes. **Still needs a human:** playtest, tune timings/physics | §9 acceptance criteria all pass |
| **M3 Automation** ✅ core · 🟡 scene | Supervisor role | Automated Prep (hopper → cradle → inject), Short Conveyor (sealer → packaging, spacing, capacity, heavy jams), Packaging Machine (capped 0.7 score, 4-slot output rack); wear, breakdowns, repair/service; per-machine manual override panels; safe blocking everywhere; power draw already feeds power-failure odds; The Wiggler from day 3 | Met in simulation: 16 globes/day, no product lost across 25 randomized runs × 600 steps |
| **M4 Customers & orders** ✅ core · 🟡 scene | Store depth | Up to 3 customers (1 on days 1–2, 2 on days 3–4, 3 from day 5) with a counter queue; customers pick globes up for a closer look from day 4; special-order board with pinning, matching and pickup; Woodland Cabin theme (and a theme picker for later ones); store appeal | Orders always pay ≥ $15 over list (tested); suspicion readability with 3 customers still needs a playtest |
| **M5 Horror & roster** ✅ core · 🟡 scene | Unease at scale | Screamer, Escape Artist, Watcher and Performer behaviours; Security Cameras upgrade (desk monitor, full-screen feeds, loose-character alerts); Conveyor Grab threat and Cabinet Shift atmospheric; supplier notes (8, days 2–12) | Needs playtests: players report "tense but fair" |
| **M6 Art & audio** ⬜ | Identity | Real low-poly models, rigged minis (optional joint-based active ragdoll behind the same `MiniCharacterBody` API), lighting, sound design, UI Toolkit HUD | Vertical slice capture |
| **M7 Content & balance** 🟡 | Longevity | **Done:** all six themes with bespoke scenery and twists; H.'s ledger story with two endings (§5e); late-game sinks (Sealing Press, Fuse Box, Window Display, electricity); **Shop Assistant** (fixes the counter bottleneck, tested in-scene); headless balance sim with three tuning passes (`BALANCE.md`). **To do:** endless-mode sinks (cash now piles up at ~$3.8k/day after day 31), performance pass, build pipeline | Economy playable after the story: **met** in the core. 2–3 h of progression: **not met.** The sim reaches the ending on days 28–29 (about 5 h), so either accept that or scale prices by ~0.6 (a design call) |

## 7. Initial economy and progression tables

All values live in `GameBalance`, `ArchetypeCatalog`, `ThemeCatalog` and `UpgradeCatalog`. They are starting
values for tuning, not final balance.

**Unit economics (Sleepy One, Winter Village)**

| Item | Cost |
|---|---|
| Character | $8 |
| Globe kit (base, scenery, snow, dome) | $7 |
| Stillness Serum charge (fictional) | $2 (+$2 per re-dose) |
| Packaging box | $3 |
| **Production cost** | **$20** |
| Sale price at quality 0.5 | $40 (`base × theme × (0.5 + quality) × 1.1 if certified`) |
| Sale price range, sloppy → perfect | ~$24 → $60 ($66 certified) |
| Nightly bills | $25 rent + $6 per unit of machine power draw |
| Starting cash / stock | $150; 3 characters, 3 kits, 4 serum, 3 boxes |

Expected early day: about 4–6 hand-made globes in an 8-minute open period → ~$80–150 net. The first three
upgrades are affordable over days 1–3.

**Quality** = 0.3·pose + 0.3·decoration + 0.2·snow + 0.1·dome + 0.1·packaging − 0.6·damage.
Tiers: Flawed < 0.35 ≤ Standard < 0.65 ≤ Fine < 0.85 ≤ Exquisite.

**Archetypes**

| Archetype | Cost | Base value | Movement | Noise | Prep (s) | Serum × | Special | Day |
|---|---|---|---|---|---|---|---|---|
| The Sleepy One | $8 | $40 | 0.15 | 0.10 | 1.5 | 1.1 | — | 1 |
| The Wiggler | $10 | $48 | 0.55 | 0.20 | 2.5 | 0.85 | Slips loose grips | 3 |
| The Performer | $14 | $65 | 0.35 | 0.30 | 2.0 | 1.0 | Draws attention | 6 |
| The Heavy One | $16 | $80 | 0.20 | 0.20 | 3.5 | 1.2 | Slows carrying, jams conveyors | 7 |
| The Screamer | $12 | $55 | 0.30 | 0.85 | 2.0 | 0.9 | Muffled noise when stressed | 8 |
| The Escape Artist | $15 | $70 | 0.60 | 0.20 | 2.5 | 0.75 | Seeks open doors | 10 |
| The Watcher | $20 | $95 | 0.50 | 0.05 | 3.0 | 1.0 | Moves only when unobserved | 12 |

**Themes**

| Theme | Value × | Extra kit cost | Unlock | Snow target | Production twist |
|---|---|---|---|---|---|
| Winter Village | 1.0 | $0 | start | 0.60 | — |
| Woodland Cabin | 1.25 | $3 | $300, day 4 | 0.45 | Pine must face front |
| Medieval Castle | 1.6 | $6 | $900, day 7 | 0.55 | Tall scenery: dome fit −0.25 without the Assembly Jig ✅ |
| Haunted Manor | 2.0 | $10 | $1600, day 10 | 0.35 | Dim: customers see movement at ×0.6 ✅ |
| Deep-Sea Ruins | 2.6 | $16 | $2500, day 14 | 0.80 | Clear water: movement seen at ×1.4 ✅ |
| Celestial Observatory | 3.5 | $25 | $4500, day 18 | 0.30 | Cannot be sealed without the Improved Sealer ✅ |

**Upgrades** (✅ = has a working effect in the prototype)

| Upgrade | Cost | Category | Day | Solves | Trade-off | Proto |
|---|---|---|---|---|---|---|
| Preparation Cradle | $60 | Handling | 1 | Characters slip during injection; timing zone +60% | — | ✅ |
| Better Injector | $100 | Handling | 1 | Serum window ×1.5 | — | ✅ |
| Assembly Jig | $150 | Speed | 1 | Assembly ×0.6 time, dome alignment +0.15 | — | ✅ |
| Short Conveyor | $250 | Automation | 3 | Walking globes sealer→packaging | +1 power; Heavy jams | ✅ |
| Improved Sealer | $400 | Quality | 2 | Seal defects ×0.4 | +1 power, hum | ✅ |
| Basement Soundproofing | $500 | Secrecy | 2 | Basement noise leak ×0.35 | You hear less too | ✅ |
| Packaging Machine | $650 | Automation | 4 | Hand boxing | Capped "good" packaging score | ✅ |
| Premium Display Case | $800 | Storage | 3 | +4 slots; movement there ×0.5 visible | — | ✅ |
| Automated Prep Station | $1000 | Automation | 5 | Hand injection | +2 power, average timing | ✅ |
| Security Cameras | $700 | Secrecy | 6 | Watching three floors at once | +1 power; the feeds show things | ✅ |
| Rewired Fuse Box | $1200 | Handling | 10 | Power capacity +5 (3 → 8) | — | ✅ |
| Sealing Press | $1800 | Automation | 12 | Fits and seals domes by itself (70% dome score) | +2 power, noise | ✅ |
| Window Display | $1600 | Appeal | 15 | Walk-ins ×1.25 | People stare in after closing | ✅ |
| Shop Assistant | $800 | Appeal | 12 | Rings up waiting customers (5 s each) | $45 a night + 10% of the sales they ring up | ✅ |

Power capacity is 3 (8 with the Rewired Fuse Box). Going over it makes power failures more likely in the director's weighting, and machines wear 1.5× faster. A fully automated line draws 9.

**Day introductions**

| Day | New |
|---|---|
| 1 | Basic assembly and sales. No seal defects, no threats |
| 2 | Seal defects can occur (minor movement); escape attempts possible; Improved Sealer and Soundproofing unlock |
| 3 | The Wiggler; conveyor and premium case unlock |
| 4 | Customers handle globes; special orders |
| 5 | Scripted power failure 90 game-minutes after opening |

**Secrecy numbers**

* Customer stages: Comfortable < 25 ≤ Curious < 50 ≤ Investigating < 80 ≤ Alarmed. Decay is 0.6/s, but only while Comfortable or Curious, and never below the floor.
* A first sighting of an evidence type counts ×0.5 (it reads as "is it mechanical?"). Repeats count ×1, ×1.5, … up to ×2.5.
* Undeniable evidence (a loose character, an awake character carried in view, or repeated blatant movement) sets a floor at 90% of the current value.
* Chat (distract) −20, with a 20 s cooldown. Removing the globe they're focused on −15. Exchange offer −25, once per customer. None of these goes below the floor, and none works on an Alarmed customer.
* Exposure when a customer leaves: Curious +1, Investigating +4, Alarmed +12 (counts as a serious incident). +3 if they saw undeniable evidence. −8 per clean day.
* Exposure effects: customer attentiveness ×(1 + E/100); arrival rate ×(1 − 0.4·E/100); from E ≥ 50, un-inspected defective globes may be returned for a refund.

## 8. Highest technical risks and how to prototype them early

| Risk | Why it matters | Early prototype / mitigation |
|---|---|---|
| **Active-ragdoll feel at 24 cm scale** | Tiny rigidbodies jitter and tunnel. A true joint ragdoll is expensive to tune | Implemented a stable approximation: spring-driven procedural limbs, one rigidbody with upright torque and hop locomotion. M2: a "20 loose minis" stress room, drop tests from shelf height, then tune torque, hop and damping. Fallback: kinematic scurry (already used beyond 15 m) |
| **Carry and placement frustration** | The core verb | Soft velocity follow, collision with the player ignored while carried, snap sockets with generous radii, the placement target named in the prompt. M2: five-player hallway test, time to place a globe on each station |
| **Perception fairness and cost** | Players must be able to explain every suspicion rise | Perception runs at 4 Hz per customer with LOS raycasts to candidates only. The core is unit-tested. ⬜ Debug overlay drawing each customer's vision cone and last evidence |
| **Save consistency with a live physics world** | Duplicate or lost products break trust | Core state is authoritative. Saves happen only when closed and calm. A validator runs on load, and tests cover duplicates, carried, escaped and broken shelf links. M2: JsonUtility round-trip EditMode test |
| **Automation throughput vs "no product ever disappears"** | Queues and conveyors create edge cases | ⬜ Model queues in Core first, with capacity and blocking, then add property-based tests (random operations → products conserved) before building any conveyor object |
| **Tone** | The premise could tip into cruelty | Fictional devices, no harm verbs, rejection returns the character unharmed. Horror comes from implication and atmosphere. Review every new mechanic against this rule |
| **Unity 6 API drift** | Code was written without an editor | Type-checked against 2021.3 reference assemblies (`tools/typecheck-unity.sh`). First task of M2 is to open it in Unity 6 and fix anything that appears |
| **Performance with many displayed figures** | Each figure animates six springs | Posed and Frozen figures are cheap. ⬜ Disable `MiniCharacterBody` updates off-screen and beyond 10 m |

## 9. Acceptance criteria — first playable build

| # | Criterion | Status |
|---|---|---|
| 1 | From a new game, a first-time player can make and sell one globe within ~5 minutes using only in-game prompts and the Day 1 briefing | 🟡 needs playtest |
| 2 | A practised player completes a full cycle (pen → shelf) in 60–90 s; Cradle + Injector + Jig noticeably shorten or ease it | 🟡 needs playtest |
| 3 | Money is exact: supplies are deducted when bought; a sale pays once; a globe cannot be sold twice or without being displayed and reserved | ✅ tests |
| 4 | The serum warns at 15 s and expiry turns the character into a loose, catchable character; the kit is lost; the character still exists | ✅ core tests · ✅ in-world (PlayMode `Serum_WarnsAt15s_…`) |
| 5 | Suspicion rises only from perceivable evidence; a first small twitch reads as a "mechanical feature"; repeats escalate to Alarmed; an alarmed customer flees and raises exposure | ✅ core tests · ✅ in-world (PlayMode `Suspicion_TwitchInView_…`: unseen twitches ignored, first twitch reads as mechanical, repeats → Alarmed → flees → exposure) |
| 6 | From day 2, a weak seal can make a displayed globe twitch in view of a customer (the basic movement suspicion event) | ✅ core tests · ✅ in-world (same test drives the twitch a weak seal produces) |
| 7 | The escape event is telegraphed for ≥ 8 s, can be prevented by reaching the gate, and otherwise produces a recapturable loose character; the threat resolves on recapture | ✅ in-world (PlayMode `Escape_…` ×2); fairness still needs a playtest |
| 8 | At least three upgrades are purchasable while closed and have visible effects (Cradle, Injector, Jig; also Sealer, Soundproofing, Premium Case) | ✅ core tests · 🟡 in-world |
| 9 | Save/load keeps day, cash, debt, inventory, upgrades and every product's id, name, stage, timers and location; no duplicates | ✅ tests (System.Text.Json) · ✅ JsonUtility round-trip passes in Unity |
| 10 | No product ever disappears: occupied stations overflow beside themselves, invalid shelf links are repaired, sold products leave the world | ✅ tests · 🟡 in-world |
| 11 | Day loop: open when ready, auto-close at 5 pm (or early), summary with bills, next day with a checkpoint | ✅ core tests · ✅ in-world (PlayMode `DayLoop_…`) |
| 12 | Subtitles, camera-shake slider and reduced-flicker toggle work and persist | ✅ persistence + reduced flicker verified in-world (PlayMode `Settings_…`) |
| 13 | Holds 60 FPS on a mid-range PC with ≤ 20 products in the world | ✅ measured in the Unity 6 editor (RTX 3050, i5-10400F), 20 products with 12 loose: worst sampled frame 11.2 ms (~89 FPS) across all rooms; editor overhead included |
