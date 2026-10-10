# Nova Colony — Game Spec (condensed from the product brief)

**Pillar: COZY, SATISFYING, ADDICTIVE, RELAXING — never difficult or punishing. The player must
constantly feel progress.** Every feature must pass: *does this make building and improving the
colony more satisfying?* If not, simplify or remove.

Emotional arc: Vulnerable Survivor → Small Camp → Growing Settlement → Organized Colony →
Industrial Fortress → Advanced Civilization → Titanium Super-Colony. "I built all of this."

## 1. Concept
Crash-land on a beautiful alien planet with: a basic survival tool, small backpack, damaged escape
pod, a little food & water, a simple crafting station. Grow it into a huge automated colony.
Base tiers: Wood → Reinforced Wood → Stone → Steel → Advanced Alloy → Nano-Tech → **Titanium** (final).

## 2. Loop
Explore → Gather → Build → Recruit → Automate → Upgrade → Defend → Expand → Unlock tech → Repeat.
Every few minutes an accomplishment: new building, colonist, weapon, expansion, generator upgrade,
production increase, area discovered, alien defeated, tech researched, defense unlocked, tier reached.

**Pacing (data/pacing.ts):** an engaged player (five 20-minute sessions a day) reaches Reinforced Wood in the first
session, Stone at the end of day 1, Steel on day 3, Alloy on day 6–7, Nano on day 13–14 and **Titanium in about four
weeks** (~45 h online). Production numbers stay big; the goals grow: per-tier multipliers on building costs (and so
level-ups), storage, research, tier-ups and mission rewards; past the first few copies each new copy of a facility costs
15% more (levelling up and newer machines become the better deal); decor and structure pieces are never paced. Converters
and factories pause while every output store is full. A tier is a goal of a few days, so the Colony panel's tier-up card
shows each resource as "have / need" (live). `node scripts/pacing-bot.mjs` plays it through and prints the
schedule, gaps between accomplishments, income by source (offline <= ~40% from Stone on), colonists, raids and Nova.

## 3. Open world (mobile-friendly)
Biomes, unlocked gradually: **Crash Valley** (start, grasslands, basic resources), **Pinewood Forest**
(wood, animals, berries, abandoned structures), **Crystal Canyon** (alien crystals), **Red Desert**
(minerals, rare metals), **Toxic Marsh** (biological materials), **Frozen Ridge** (rare ores, abandoned
research facilities), **Alien Ruins** (ancient tech), **Titanium Highlands** (end-game titanium).
Feels large without long travel: fast travel, vehicles, teleporters later, resource markers, points
of interest, hidden loot, abandoned structures, ruins, survivor camps, crashed spacecraft.

## 4. Base building
Free-form bases on a grid with smart snapping that works great on touch. Floors, walls, doors,
windows, roofs, stairs, platforms, storage, workshops, farms, kitchens, bedrooms, medical rooms,
labs, generator rooms, water facilities, factories, defense towers, hangars, command centers.
Drag-to-build walls, auto snapping, **automatic roof generation**, copy, move, rotate, upgrade entire
room, mass upgrade, blueprint saving. Moving never loses resources. Fast & satisfying placement.

## 5. Tiers (unlock highlights)
- T1 Wood: wooden walls, campfire, basic storage, small farms, water collectors, crafting table;
  barricades, spike traps, basic manually operated turret.
- T2 Reinforced: larger buildings, better storage, water tanks, larger farms, guard towers, better crafting.
- T3 Stone: stone walls, workshops, kitchens, bedrooms, medical, research stations; crossfire towers,
  basic automated sentry guns.
- T4 Steel: electrical systems, power grid, solar, wind, industrial generators, electric doors,
  factories, automated farms; machine-gun turrets, electric fences, reinforced gates.
- T5 Advanced Alloy: automated mining, large factories, advanced power, robotics, automated
  logistics, advanced labs; missile turrets, heavy sentries, shield generators.
- T6 Nano-Tech: nanotech, drone workers, automated repair, fusion, matter processors, advanced
  robotics; laser turrets, combat drones, energy barriers, repair drones.
- T7 **Titanium**: sleek futuristic fortress — automated doors, glowing energy, advanced lighting,
  massive power; titanium walls/floors/towers, fusion reactors, quantum storage, automated factories,
  teleporters, advanced medical, fully automated farms, AI logistics; titanium sentry cannons, plasma
  turrets, railgun towers, drone swarms, energy shields, anti-air. Reaching Titanium = major moment.

## 6–7. Colonists & happiness
Recruit/discover survivors: name, appearance, personality, specialty, skill level, happiness, job,
bedroom. Professions: farmer, engineer, electrician, scientist, doctor, cook, miner, guard, mechanic,
water technician, drone technician, logistics. They auto-perform jobs (electricians maintain
generators, farmers crops, cooks meals, engineers repair, guards defend, scientists research).
Happiness (simple) from beds, food, water, electricity, entertainment, comfortable rooms, decor,
safety → productivity **bonuses**. Unhappy colonists do NOT leave.

**Recruitment board** (Radio Tower): a few seats (3, +1 per recruiting research). Recruiting someone leaves the seat
empty; a new survivor answers the radio on an absolute clock (time away counts) until the board is full again, every
20 min at Wood, 3 h 20 at Reinforced, 15 h at Stone, 2 days at Steel, a week at Alloy, two weeks at Nano and 12 h at
Titanium, where the last few join for the Super-Colony (`balance.recruitArrivalMinutes`,
sim/colony/recruitBoard.ts). The board shows "next survivor in 12:41". Rescues, expeditions, crates, survey milestones,
daily gifts and rewards add colonists on top, so a colony grows to ~10 at Stone, ~22 at Steel, ~32 at Alloy, ~40 at
Nano and ~50 around Titanium. The "New recruits" ad / Nova offer swaps the survivors waiting for fresh faces (a choice
of specialties); it never fills an empty seat, so the colony's growth stays on the arrival clock.

**Colony Spirit & festivals** (what a happy colony is worth once happiness tops out, from the Reinforced tier): while
average happiness is above 75, a Spirit meter fills during online play, faster with decor and entertainment per
colonist, medical care and friendship hearts; every granted wish adds a chunk. Full: a 10-minute **festival** with +25%
production (online only), everyone off duty gathers round the campfire to raise a mug under string lights and paper
lanterns, and a festival chest (the tier's supply crates, plus a Supply Cache from Stone) lands in the Inventory. An
engaged colony holds one about every 45–55 online minutes mid-game. Nothing moves while the app is closed. A HUD chip
shows the meter (tap: what fills it) or the festival countdown; a side chain counts 1 / 5 / 15 festivals.

## 8. Resources
Basic: wood, stone, fiber, food, water. Intermediate: iron, copper, coal, steel, electronics.
Advanced: alien crystals, advanced alloys, energy cells, nano-material, titanium.
Gathering: player (early) → colonists (mid) → machines (late) → drones/auto-mining (end).

## 9–11. Power, food, water
Power from wind, solar, fuel, geothermal, fusion; machines consume. Show simply:
"Production 850 · Consumption 610 · Available +240". Food: farms, greenhouses, hydroponics, kitchens,
storage, automated farms (enormous end-game output). Water: rain collector → pump → purification →
industrial purifier → atmospheric water generator.

## 12–14. Invasions, aliens, defenses
Periodic attacks: exciting, not stressful; rarely lose progress. A raid comes every `invasionInterval` of online play:
15 min early on, 20 min at Stone, 25 at Steel, 30 at Alloy, 35 at Nano, 40 at Titanium (about three a day for an
engaged player once tiers last days); only the first four raids of a tier grow it. Warning first:
"ALIEN ACTIVITY DETECTED — ATTACK IN 2:00". Early 5–10 small aliens; late swarms + giants; a properly
upgraded base survives. Aliens: Crawler (small fast), Spitter (ranged vs defenses), Brute (attacks
walls), Burrower (emerges underground), Flyer (needs anti-air), Swarm Queen (spawns smaller),
Titan (massive late-game). Occasional approachable bosses. Defenses: barricades, spike traps, guard
towers → MG sentries, electric fences, automated gates, flamethrowers → missiles, heavy cannons,
combat drones → lasers, plasma, railguns, shield generators, drone swarms. Watching dozens of
defenses shred an invasion must feel amazing.

## 15–16. Crafting & equipment
Categories: weapons, tools, building materials, technology, defense, food, medical, machines, drones,
vehicles. Increasingly automated: factories where resources go in and products come out.
Equipment slots: tools, weapons, armor, backpacks, utility. Weapons: makeshift rifle, shotgun,
assault rifle, energy rifle, plasma rifle, titanium rifle. Combat is secondary to building.

## 17–18. Research & automation
Big but easy tech tree: construction, power, food, water, defense, weapons, automation, robotics,
exploration, colonist upgrades, titanium tech. Scientists generate research points.
**Research Mastery** (the long tail, and the post-Titanium sink): from the Stone tier, six repeatable lines turn spare
points into small lasting bonuses: Production +3%, Logistics +5% storage, Construction +5% build speed, and from Steel
Defense +3% turret damage, Crew +3% colonist work speed, Expeditions +4% haul. Each level costs ×1.5 the one before
(from ~5 minutes of research at the tier the line opens); no cap, half the bonus per level past 20. Research panel,
Mastery tab. Offline, the labs bank at most two hours of research points (Welcome Back says when they filled up).
Automation chain: player chops → colonist chops → logging station → automated harvester → drones.

## 19–20. Vehicles & events
ATV, buggy, mining truck, hover bike, armored rover, titanium hovercraft (speed + storage).
Optional events: meteor crash, abandoned spacecraft, survivor rescue, alien nest, supply drop, rare
merchant, crystal storm, ancient structure activates — all with valuable rewards.

## 20b. Expeditions & the Frontier (meta-loop for colonists and vehicles)
From the Stone tier the Radio Tower sends squads of 1–3 colonists (plus an optional vehicle: shorter trip, bigger
haul) to 24 destinations, three per discovered region, on a 15 min / 1 h / 4 h / 8 h ladder. Squad members are away
(no job, upkeep or AI; beds and jobs kept for them). Hauls are themed by biome, valued at the destination's tier
(a standard squad brings home 25–40% of a reference colony's hourly value per trip hour, sized to fit storage),
raised by profession match and skill; rare finds roll crates, drones, chips and survivors. Timers are absolute (they
finish offline) and a local notification says when the squad is home. After Titanium the Frontier opens: generated
uncharted sites, finds that escalate with depth, and a Star Chart with milestone rewards every 5–10 sites, forever.
Cozy: nobody is ever hurt; a long walk without a vehicle only leaves the squad a little tired.

## 20c. Achievements & the Colony Journal
62 cozy achievements in nine sections (Builder, Explorer, Defender, Scientist, Community, Crafter, Expeditions,
Collector, Veteran): 17 tiered lines with bronze / silver / gold (Lumberjack 500 / 75,000 / 150,000 wood …: bronze in the
first hour or two, silver in the first two weeks, gold from week two to the weeks after Titanium) and 11 one-offs (each boss, each
colony tier, a legendary colonist). Progress is never double-counted: it reads the lifetime mission counters and plain
state. Rewards are season XP plus modest resources / crates of the stage they are earned in; Nova (~310 in total) only
with silver, gold and the one-offs. Earned medals wait for a tap on Claim (Claim all too). A save from before the
Journal earns everything it already earned at once, with a single "N achievements already earned!" toast. The Journal
(Menu tile, badge for unclaimed medals) shows every achievement with its medal, progress bar and reward, the date each
medal was claimed, and the Colony Records (lifetime wood, aliens, raids, buildings, research, expeditions, hours …).
Unlock toasts open it when tapped. The guided first session stays quiet. Unlocks are mirrored to Game Center / Play
Games through a no-op platform hook (docs/MOBILE.md §6c).

## 20d. Colonist wishes & friendship (short, cozy goals between bigger ones)
Once the opening tutorial is over, a colonist voices a small wish about every 5–8 minutes of online play (at most two
open, one per colonist; never during an alien attack, never from someone away, asleep or indoors): hand over a couple
of minutes' worth of a resource with one tap, place one more lantern / flower bed / bench / fountain…, hand-craft a quick
recipe, walk up and Chat, or open any cache out there. Each is doable in 1–10 minutes at its tier; a bubble over their
head, a pink badge on the Crew button and a Wishes tab show what is waiting, and "Show me" opens the right menu or
points the guide arrow. Granting one: "Wish granted!" +8 happiness for 4 hours and a chunk of Colony Spirit (§6–7), a friendship heart (0–5; three hearts
+5% productivity, five = Best friends +3 happiness for good) and a small thank-you gift (~3 minutes of colony output,
sometimes 1–2 Nova). Who and what are rolled from the save seed and a counter (no save-scumming); nothing moves offline
and an open wish simply fades after 45 minutes of play: no penalty, ever. A "Good Neighbour" side chain (1 → 10 → 30
wishes) opens with the first wish.

## 20e. Exploration that pays off: tier-scaled loot, restocking caches, region surveys
Points of interest hand out goods scaled to the colony's tier, in their own flavour (a wreck is parts and electronics,
a supply cache food and basics, a ruin research): each is worth a few minutes of a reference colony's output at that
tier (caches 2.5–6, wrecks and mines 5–8, labs and ruins 10–15, vaults 20; data/survey.ts), never more than 60% of a
good's storage, plus the POI's own items, Nova and survivors. Caches, wrecks, mines and nests restock every 30–60
minutes on an absolute clock (time away counts) and wear a soft survey ring when full again; vaults, ruins, labs,
cabins and rescues stay one-off. A long sweep thins out (past 6 hauls within an hour the goods shrink, never below 20%).
Every region has a survey meter (land charted 50%, points of interest explored 35%, field guide of its node kinds 15%)
with milestones claimed from the Map: 25% a cache of the region's goods, 50% a survivor who lives out there, 75% a
keepsake cosmetic (Nova when owned), 100% a permanent perk (+5% of the region's goods or research, +1 expedition squad
for the Frozen Ridge). The Map lists every region's meter and next milestone; a tapped region says what is left and
"Show me" points the guide arrow there. Between things to do, a quiet "Survey" pill under the mission card points at a
restocked cache, an unopened site or uncharted ground nearby.

## 21. Juice
Resources fly to storage, buildings construct piece by piece, upgrade transformation animations,
resource pops, machines visibly operate, conveyors move items, colonists visibly work, turrets track
aliens, satisfying explosions, floating numbers ("+25 Wood", "+100 Energy", "Production +20%").

## 22. Mobile controls
Left virtual joystick, right-side camera drag, context interaction button, big touch menus, few taps
to build, optional auto-gather, comfortable one-handed management.

## 23. Difficulty
Intentionally EASY. Avoid permadeath, base loss, starvation loops, frequent colonist death, brutal
raids, complicated recipes, grinding. Small, easily solved problems only.

## 24–25. Offline & rewarded ads
Colony produces offline: the first 10 minutes away at full speed, then at a relaxed pace (10%) up to the 8-hour cap
(research and VIP extend it); Welcome Back may fill storage up to 2× (rewards too). Five short sessions a day leave the
app closed ~93% of the time, so this keeps Welcome Back generous but at about a third of a day's income.
"Welcome Back! Away for 4h 32m — Your Colony Produced: +4,250 Wood …" with
optional ad to **DOUBLE OFFLINE REWARDS** (primary ad placement). Voluntary ads for: 2× offline,
2× production 10 min, instant craft, free resource crate, recruit refresh, bonus invasion rewards,
extra research points, extra daily spin, temporary drone assistant. Players should WANT to watch.

## 26–31. Monetization & live-ops
Premium currency **Nova Crystals** (earned slowly in play, purchasable). Packs: $0.99 Starter,
$4.99 Crystal, $9.99 Builder, $19.99 Colony, $49.99 Commander, $99.99 Ultimate — prices configured in
the stores, not hard-coded. IAP: Starter (resources + crystals + exclusive cosmetic), Builder
(construction boosts), Colonist (high-quality colonists), Defense (resources + turret blueprints),
Automation, Titanium Founder (late game); cosmetics: base themes, outfits, vehicle/turret skins,
decorations, colonist outfits. **Never lock Titanium or any gameplay system behind payment.**
Optional VIP **Colony Pass $7.99/mo**: daily Nova, extra daily rewards, +10% production, more offline
storage, exclusive decorations, monthly outfit — never necessary. Season pass with free + premium
tracks; XP from normal play (building, gathering, exploring, defending, crafting, missions). A season runs about a
month; 50 levels at 5,000 XP each, so an engaged free player finishes the free track in its last days (the pacing
bot: level 50 around day 27-29).
7-day login rewards (D1 resources, D2 crafting mats, D3 Nova, D4 colonist crate, D5 defense crate,
D6 premium currency, D7 large legendary reward). Daily spin wheel placed in the settlement (free
daily; ad for another).

## 32–33. Missions & the first 15 minutes (retention-critical, must be extremely polished)
Simple guiding missions (gather 100 wood, build a farm, recruit a colonist, build a generator, defeat
10 aliens, upgrade a wall, discover Crystal Canyon).
- 0–2: crash landing, exit pod, gather wood · 2–4: first wooden shelter · 4–6: campfire + storage ·
  6–8: rescue first colonist · 8–10: colonist auto-collects resources · 10–12: first defense turret ·
  12: "ALIEN ATTACK INCOMING" · 13: small attack, turret destroys aliens · 14: big reward chest ·
  15: Reinforced Wood tech available — long-term progression is immediately clear.

## 34–36. Fantasy, art, sound
End state: 50+ colonists, factories, robots, drones, fusion reactors, automated farms, huge storage,
garages, labs, titanium skyscrapers, energy shields, plasma turrets, railguns, hundreds of machines.
Art: stylized 3D for mobile — colorful, warm, cozy, slightly futuristic, polished, readable; beautiful
days; nights with warm windows, glowing machines, neon energy, stars. Titanium looks spectacular.
Sound: relaxing ambient music; satisfying gather/craft/build/upgrade/crate/collect/research/turret/
alien-defeat/unlock sounds; slightly more energetic music during invasions.

## 37–39. Performance, saves, analytics
LOD, pooling, cheap alien spawns & colonist AI, few draw calls, small textures, cheap lighting &
physics; large colonies smooth; simulation shortcuts for invisible colonists/factories.
Autosave, cloud saves, local backups, account recovery — never lose hours of progress.
Privacy-conscious analytics hooks: tutorial completion, session duration, retention, tech
progression, building usage, ad engagement, purchase conversion, progression speed, quit points,
slow-progression points.

## 40–41. Architecture & phases
Modular systems, data-driven content (resources, buildings, colonists, weapons, tech, aliens,
recipes, costs, rewards, progression). Vertical phases: 1 movement/camera/world/gather/inventory/
basic wood building · 2 colonists/jobs/food/water/power/automation · 3 aliens/turrets/walls/combat/
damage · 4 full tech progression to Titanium · 5 open world/biomes/vehicles/events · 6 offline/ads/
IAP/daily/spin/season · 7 polish (animation, sound, VFX, UI, tutorial, performance, balance).
