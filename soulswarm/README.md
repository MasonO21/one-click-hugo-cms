# SOULSWARM: Raise the Legion

A top-down "legion survivor" for iOS and Android. Every enemy you kill can rise as a glowing soul that fights for you. You start alone and end the run leading hundreds. Soul Gates multiply your army, and Soul Nova detonates all of it in one screen-clearing blast.

- **Engine:** HTML5 + WebGL ([Three.js](https://threejs.org)) with custom shaders, bloom, GPU particles and instanced hordes. The effects, weather, music and sound effects are generated in code. The painted art (key art, hero splashes, chapters, Bestiary, icons), the heroes' rigged and animated 3D models, the foes' painted 3D models (walked by a vertex shader, so the horde stays instanced), each chapter's painted floor and 3D props, and the voice lines were made with Higgsfield; see `docs/ART_AND_ADS.md`.
- **Store wrapper:** [Capacitor 7](https://capacitorjs.com). The native Xcode project is in `ios/` and the Android Studio project in `android/`.
- **Docs:** [`docs/`](docs/) contains the design brief, GDD, monetization model, live-ops calendar, marketing plan and production roadmap.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173. Use your phone on the same Wi-Fi for touch.
npm run build        # production web build in dist/
SINGLE=1 npm run build   # one self-contained HTML file in dist-single/ (3D models inlined gzipped, ~13 MB)
```

Desktop controls are WASD/arrows to move, Space for Soul Nova and Shift or E for your hero's Rite. On touch, drag anywhere to move and tap NOVA or RITE.

## What's in the game

- **A beginner tutorial, "The Waking":** a new player's first Battle is a free, guided run with a coach that teaches one thing at a time (move, fight, raise the legion, a ×2 Soul Gate, the Rite, Soul Nova, an elite and its Relic Chest) and ends with a weakened Hollow King. It cannot be lost, pays 500 gold and 30 gems once, then points the way to Talents and Chapter 1. Skip it from the coach, or replay it any time from Settings.
- **Boss Rush, "The Hollow Court":** a limited weekly event (Tue–Thu UTC) after the first Chapter 1 clear: all five chapter bosses back to back from a seasoned start and a four-pick War Council, with a Relic Chest between bosses. Three free tries a day, event rewards for each boss beaten, and a best clear time.
- **Share your run:** every results screen has a Share button that paints a 1080×1350 card of the run (the hero's splash over the chapter's painting, the headline, your peak legion, the boss you slew, your stats and build) to share, save or long-press.
- **A 30-chapter campaign in six acts** (6:00 survival, then the chapter's boss): The Waking Dark, The Drowned Coast, The Thornwood, The Plague Fens, The Storm Spire and The Hollow Moon. Each act after the first is a new realm with its own painted floors, props and weather, its own ground hazard (tide pools, brambles, miasma clouds, lightning, gravity wells), its own foe and its own finale boss, and its other chapters bring earlier bosses back stronger. Your weapons grow with the campaign, so late chapters stay a fight rather than a wall of numbers. Plus the **Endless Abyss**, unlocked by clearing Chapter 5: no time limit, a boss rises every 5:00 and grows stronger, and your deepest run is recorded. Every chapter has its own painted key art: it fills the chapter card on the home screen (cross-fading as you swipe), tiles the campaign map (tap the act label on the card), and opens each run on a cinematic intro card with the act, the chapter's name, its twist and your difficulty.
- **Nightmare and Torment:** clear a chapter on Normal to replay it on Nightmare, then clear Nightmare for Torment. Tougher, deadlier hordes, more elites with extra affixes and a darker world pay ×1.75 / ×2.5 gold, ×1.5 / ×2 pass XP, one-time first-clear gems and a richer Gravemaw's Hoard (Torment can drop a Legendary relic). Pick the difficulty on the chapter card; Endless and the Daily Trial stay Normal.
- **8 heroes** with signature weapons (Vael, Nyx, Seraphine, Liora, Grimsby, Mordrake, Osric, Isolde), plus **9 weapons, 10 passives and 9 evolutions** (one per weapon) drafted on level-up cards, with **2 banishes a run** to strike skills you don't want from the draws. **Gravefall** drops tombstones on the thickest of the horde (evolving into **Necropolis**, whose graves raise the slain beside them), and **Soul Leech** latches drain beams onto elites and bosses that heal you (evolving into **Vampiric Communion**, whose forking beams feed your legion once you are whole). **Grave Ward** cuts the damage you take and **Dread Reach** widens every area weapon. Weapons grow new tricks as they level: Ashen Chains pin their first foe and fork into twin chains, Grave Pulse chills the horde, Soul Storm's killing bolts split, and the Bone Crown empowers and mends the minions around you. Grimsby Lanternjaw's **Witchfire Lantern** leaves a trail of burning witchfire and hurls lanterns that burst into pools; it evolves into **Hallow Pyre**, where the slain burst into flame and the fire spreads.
- **Hero Rites:** each hero has a signature active ability on its own RITE button, ready from the first second of every run: Vael's **Grave Call** (every kill rises), Nyx's **Shadow Step** (an untouchable dash that cuts through the horde), Seraphine's **Ashfall** (burning chains fall on 20 foes), Liora's **Death Knell** (a bell toll that stuns and marks), Grimsby's **Hallowfire** (the horde flees in terror while he runs trailing a river of fire), Mordrake's **Ossuary Wall** (a ring of bone spikes), Osric's **Bone Mass** (twelve bone monks rise, the legion fights harder and the hymn wards him) and Isolde's **Crimson Sabbath** (a blood nova binds and marks every foe around her, and the marked rise when they fall).
- **The legion:** every slain enemy can rise as its own kind (Shades, Wisp Runners, taunting Bulwarks, Soul Witches, Soul Bombs, recoil-free Phantoms, mending Soul Priests, gold Champions). Multiply it through **Soul Gates** and detonate it with **Soul Nova**, which winds up for a beat as every soul streams into the Shepherd. Souls pushed over the cap by a gate fade away after a grace period, so spend them.
- **Kill streaks:** chain kills from any source (the legion and the Nova make the biggest) through CARNAGE, MASSACRE, ANNIHILATION, SOUL HARVEST and APOCALYPSE. Each tier starts a **Soul Frenzy**: faster XP and faster-striking minions, and Nova charge at the top tiers. Your best streak is on the results screen and kept as a record. Big hits land with a brief hit-stop.
- **Ten chapter bosses**, each a painted 3D colossus with its own colour, voice and three named phases: **Gravemaw, the Hollow King** (summons the dead), **Pyrexa, the Cinder Matron** (rains fire that burns the ground), **Vaulkar, the Ossuary Colossus** (lanes of glacier lances), **Azrathel, the Fallen Seraph** (pillars of light where you stand), **Vesperine, the Crimson Queen** (fans of blood lances), and the act finales **Morwenna, the Drowned Cantor** (tidal lanes), **Gorrath, the Briar King** (thorn roots that hold you fast), **Mother Mire, the Plague Bloom** (spore pods that leave miasma), **Kaelthar, the Storm Herald** (turning lightning beams) and **Nihl, the First Night** (every fallen boss's signature in turn, and a dark that pulls you in). They share the sealed arena, the ring slams, the gap rings and the spiral, and each twists them its own way.
- **A living horde:** Ghoul packs lunge, Brutes slam, Witches lob fire. From Chapter 2, **Grave Wraiths** drift straight through your legion (only your own weapons can touch them) and dive at you; from Chapter 3, **Corpse Priests** hang back and chant over the fallen, raising them as hollow Husks. Each chapter has its own twist: burning ground, sliding ice, abyssal hands, an elite parade. Later acts add **Drowned Sirens** whose song stills your minions, charging **Thornbacks**, swarms of **Plague Rats**, **Stormcallers** that call lightning down a marked line and **Void Stalkers** that blink in beside you.
- **Elite affixes:** every elite rolls one affix, or two from Chapter 4 and in Endless. **Warded** elites carry a soul ward that shatters, **Splitters** burst into copies, **Vampiric** elites feed on nearby deaths, **Hasted** elites trail embers, and **Commanders** drive the horde around them until their death routs it. Affixed elites still drop their Relic Chest, plus bonus gold.
- **Mid-run events:** about three per run, all optional, with an edge arrow while they're off screen. Chase down a **Soul Thief** for gold and XP before it escapes. Hold a **Shrine of Souls** for a 60-second blessing. Break a **Cursed Coffin** to unleash a horde and survive it for a Relic Chest.
- **The Bestiary:** a painted entry for every foe (the horde's seven, the five act foes, the Soul Thief and the ten chapter bosses) on the Heroes screen, with its lore, how it fights and your kill count. Entries stay dark silhouettes until your first kill. Each has three milestones (100 / 1,000 / 10,000 kills; 50 / 500 / 3,000 for the Corpse Priest and four act foes; 500 / 5,000 / 50,000 for the Plague Rat; 1 / 10 / 50 for the Soul Thief and the bosses) that pay 2,000 gold, an Altar Sigil and 50 gems.
- **Isolde, the Crimson Countess:** the eighth Shepherd, a Legendary found as shards in Legendary Altar pulls. Her Soul Leech casts one more drain beam and whatever it slays always rises; her Rite, **Crimson Sabbath**, binds and blood-marks the horde around her and heals her for every foe it strikes. Painted card, rigged 3D model and her own voice.
- **Relic Ascension:** duplicates of a level-10 relic become ascension shards; spend them with gold to raise the relic up to ★5 (+10% of its stat per star), the endgame gold sink.
- **Soul Unions:** evolve both weapons of a pair and their Union fuses them into one slot with a new power: Starfall Requiem (a ring of Soul Storm bolts on every Requiem blast), Witch Moon (moon blades that trail witchfire), Blood Covenant (beams that burn, chains that heal) and Ossuary Crown (skulls that hurl bone spears).
- **Hero Mastery:** every hero ranks 1–10 by being played, with small perks, a reward per rank, the Soulbound aura at rank 10 and an **Ascended Rite** at rank 5: Vael's call raises Champions, Nyx steps twice, Seraphine's chains fall twice, Liora's bell tolls twice, Mordrake's wall shatters outward, Grimsby's terror leaves the horde open to every blow, half of Osric's monks rise as Champions, and Isolde's blood marks spread from each marked foe that falls.
- **Soul Urns:** funerary urns rise around the battlefield; smash one by walking into it for an offering: a Death Knell that tears the horde apart, a Frost Hourglass that freezes it, a Soul Lantern for double XP, a Gilded Skull of gold, an Ossuary Horn that raises minions, or a heart or magnet.
- **The Grimoire:** before a run, inscribe one of eight painted pages that bend its rules for a price: a bigger but frailer legion, richer souls in a thicker horde, a glass-cannon Shepherd, graves that rise for you, a faster Nova, minions that burst when they fall, kills that feed you, or gates that give and take more. Each page unlocks with a long-term goal (3 runs, a chapter clear, 2,000 raised, a 300 streak, …).
- **Meta progression:** talents, relics (8 types × 4 rarities), hero stars, the Soul Altar gacha (odds and pity shown in-game), a 30-tier Soul Pass, rotating daily quests, level-up rerolls for 50 gems or an ad (as many as you like), opt-in rewarded ads with no daily caps (energy, Daily Trial attempts, Boss Rush tries), the **Daily Trial** (a free daily run with a boon and a bane), **Blood Moon** weekends (double rewards, more elites), a weekly chest, a 7-day login calendar, energy, and a shop with simulated IAP and rewarded ads.

## Test and marketing tools

```bash
npm run playtest      # headless bot: every hero, a full Chapter 1 clear, boss phases, Endless, hero passives, kill streaks and game feel, elite affixes, run events, Hero Rites, Nightmare and Torment, meta and economy, bug-test regressions, the Bestiary and chapter art, the painted heroes, maps and foes, the five chapter bosses, the beginner tutorial, the Boss Rush, the share card, the new heroes' kits and Update 5's foes and weapon upgrades, Update 6's Grave Arsenal and Banish, the Grimoire, rerolls and Soul Urns, uncapped rewarded ads, Hero Mastery with the Ascended Rites, Soul Unions, Relic Ascension, Isolde the Crimson Countess, and the 30-chapter campaign (its acts, save migration, rewards, scaling, realms' hazards, act foes, act bosses and the chapter map)
node scripts/ui-sweep.mjs http://localhost:5173/   # menus sweep: every screen × 5 phones × 3 profiles (layout audit + screenshots), tap fuzzing, economy and gacha fuzzing, broken saves, lifecycle
npm run balance       # bot plays chapters 1–5 (or any of 1–30) with typical progression; reports clears, deaths, boss time-to-kill (needs dev server; DIFF=nightmare|torment, PROG=5, GOD=1, RITE=0)
node scripts/soak.mjs http://localhost:5173/ 60 1   # seeded soak/fuzz: whole runs with chaos inputs and invariant checks (RUN=n replays one; LEAK=30, PERF=1)
npm run trailer       # renders a 22 s 1080×1920 gameplay ad to store/trailer-9x16.mp4 (needs dev server + ffmpeg)
npm run screenshots   # renders captioned 1290×2796 store screenshots to store/screenshots/ (needs dev server)
npm run art           # rebuilds in-game art, icon, splash and native sets from the painted masters in store/art
npm run build:web     # one-file web build, plus dist-single/soulswarm.html for embedding hosts
```

`scripts/ads/render.sh` re-cuts the cinematic ads in a Higgsfield sandbox from the trailer and the painted clips (see `docs/ART_AND_ADS.md`).

## Ship it to the stores

```bash
npm run cap:ios       # build, sync, open Xcode (needs macOS + Xcode 16+)
npm run cap:android   # build, sync, open Android Studio
npm run icons         # re-render icon/splash from the live game (dev server must be running)
npx capacitor-assets generate --assetPath resources   # regenerate native icon/splash sizes
```

Before submitting, you will need:
1. An Apple Developer account ($99/yr) and a Google Play developer account ($25 one-time). Set the bundle ID in `capacitor.config.json` (`com.soulswarm.game` is a placeholder).
2. **Real payments.** `src/meta/store.js` simulates purchases and rewarded ads. Replace `purchase()` with RevenueCat or StoreKit 2 / Play Billing, validate receipts on a server, and replace `rewardedAd()` with AppLovin MAX (or similar). Never grant items before validation.
3. Cloud save and anti-cheat. Progress lives in `localStorage` (`src/meta/save.js`), which is fine for soft launch, but move it server-side before any leaderboards.
4. Analytics, a privacy policy URL, the ATT prompt (iOS), GDPR consent, and age rating questionnaires. Odds disclosure for the Soul Altar is already in-game.

See `docs/PRODUCTION_ROADMAP.md` for the full checklist, team plan and budget.

## Code map

| Path | What it is |
|---|---|
| `src/main.js` | Boot and app wiring (profile, audio, engine, menus, runs) |
| `src/engine/` | Renderer and post-processing, shaders, GPU particles, procedural models, input, haptics |
| `src/game/data.js` | **All tunable content and numbers**: heroes, enemies, skills, chapters, relics, talents, shop, pass, quests |
| `src/game/run.js` | One run: director (waves, gates, elites, boss), XP, Soul Nova, death/revive, camera |
| `src/game/*.js` | Enemies, legion, weapons, projectiles, pickups, gates, boss, world, effects |
| `src/meta/` | Save, economy rules (gacha, pass, quests, rewards, Bestiary), store adapter |
| `src/ui/` | Design system (`style.css`), HUD and run modals (`runui.js`), menus (`meta/`) |
| `src/audio/audio.js` | Procedural Web Audio SFX and music, plus the voice-line player (priorities, cooldowns, ducking) |
| `src/assets/voice/` | 48 recorded announcer and hero lines (Higgsfield; `scripts/voice-master.sh`) |
| `src/assets/models/` | The heroes' rigged, animated 3D models (and Eclipse Vael's), built from their painted art (Higgsfield; `scripts/hero-models.sh`, loaded by `src/engine/heromodels.js`) |
| `src/assets/foes/` | The foes' painted 3D models: the horde, the act foes, the Soul Thief and the ten chapter bosses (Higgsfield; `scripts/enemies.sh`, loaded and walked by `src/engine/foemodels.js`) |
| `src/assets/floors/`, `src/assets/props/` | Each chapter's painted floor and painted 3D props (Higgsfield; `scripts/floors.sh`, `scripts/props.sh`, placed by `src/game/world.js`, weather in `src/game/weather.js`) |
| `resources/` | App icon and splash (built from the painted masters by `npm run art`) |
| `store/` | Painted key art masters (`art/`), cinematic video ads (`ads/`), in-engine trailer and App Store screenshots; see `docs/ART_AND_ADS.md` |
| `scripts/` | Playtest bot, trailer and screenshot renderers, painted-asset and hero-model pipelines (`hero-models.sh`, `glb-*.py`), web build |

## QA hooks

`window.__soulswarm` exposes the app object for QA scripts, e.g. `__soulswarm.startRun(1)` or `__soulswarm.run.legion.addMany(100, 0, 0)`.
