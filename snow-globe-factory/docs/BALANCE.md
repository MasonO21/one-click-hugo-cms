# Economy balance pass (Milestone 7)

This pass was made with **`tools/BalanceSim`**, a headless 30-day run of the real simulation core. It uses no Unity. It checks
whether the economy tables in `DESIGN_PLAN.md` §7 give a sensible progression curve. It is a model of a player, not a
playtest. Every number here needs to be re-checked once people actually play the build (Milestone 2).

```bash
cd tools/BalanceSim
dotnet run -- 30 2024                   # days, seed; prints the table below
dotnet run -- 30 2024 ../../docs/x.md   # also writes the report to a file
```

## How the scripted player works

* **Real rules:** it uses the real `GameSession` services for supplies, production, the quality model, orders, themes,
  upgrades, the store and daily bills. So prices, costs, quality and upgrade effects are the game's own.
* **Time is modelled, not simulated:**
  * A globe takes **75 s** by hand, which is inside the 60–90 s design target.
  * Upgrades take time off each globe: Assembly Jig −12 s, Automated Prep −14 s, Short Conveyor −7 s and Packaging
    Machine −10 s. A fully upgraded line takes about 32 s per globe.
  * There are 120 s of pre-opening work each day, 480 s of opening hours, and each sale costs 8 s at the counter.
* **Skill:** the player's skill is 0.65, with jitter. They hit the assembly card's pose 80% of the time and its scenery
  75% of the time. They inspect half their globes. Globes with a revealed defect are rejected back to holding.
* **Buying policy:**
  * It keeps a cash reserve for tomorrow's supplies and bills.
  * It buys at most one thing each morning. That's the next upgrade in a fixed order, or the next theme, whichever is
    affordable. A theme wins once it's unlocked.
  * Secrecy upgrades (Soundproofing, Cameras) come last, because the sim has no suspicion model to reward them.
* **Walk-ins:**
  * Customers arrive at the core's rates: appeal × foot traffic, with a concurrency bonus once 2+ shoppers are allowed.
  * 85% of customers who find a stocked shelf buy the best globe on it.
* **Not modelled:** customers' suspicion, horror events, breakdowns, escapes, the player's walking time and mistakes.
  The sim's exposure stays at 0, so **it says nothing about horror pacing**.

## Result (seed 2024, after tuning)

| Day | Cash (end) | Made | Sold | Orders | Revenue | Spent | Theme | Bought today |
|---:|---:|---:|---:|---:|---:|---:|---|---|
| 1 | $366 | 6 | 6 | 0 | $299 | $83 | Winter Village |  |
| 2 | $419 | 5 | 5 | 0 | $258 | $205 | Winter Village | Preparation Cradle |
| 3 | $420 | 4 | 4 | 0 | $215 | $214 | Winter Village | Better Injector |
| 4 | $384 | 5 | 5 | 0 | $248 | $284 | Winter Village | Assembly Jig |
| 5 | $584 | 6 | 5 | 1 | $334 | $134 | Winter Village |  |
| 6 | $758 | 5 | 4 | 1 | $331 | $157 | Winter Village |  |
| 7 | $772 | 6 | 5 | 1 | $469 | $455 | Woodland Cabin | Woodland Cabin |
| 8 | $1058 | 6 | 6 | 0 | $458 | $172 | Woodland Cabin |  |
| 9 | $995 | 6 | 5 | 1 | $509 | $572 | Woodland Cabin | Improved Sealer |
| 10 | $1156 | 7 | 6 | 1 | $612 | $451 | Woodland Cabin | Short Conveyor |
| 11 | $1554 | 7 | 6 | 1 | $599 | $201 | Woodland Cabin |  |
| 12 | $1149 | 7 | 6 | 1 | $714 | $1119 | Medieval Castle | Medieval Castle |
| 13 | $1568 | 6 | 6 | 0 | $609 | $190 | Medieval Castle |  |
| 14 | $1197 | 6 | 5 | 1 | $619 | $990 | Medieval Castle | Premium Display Case |
| 15 | $1635 | 6 | 5 | 1 | $628 | $190 | Medieval Castle |  |
| 16 | $1616 | 8 | 7 | 1 | $882 | $901 | Medieval Castle | Packaging Machine |
| 17 | $2177 | 8 | 8 | 0 | $806 | $245 | Medieval Castle |  |
| 18 | $1999 | 11 | 10 | 1 | $1154 | $1332 | Medieval Castle | Automated Preparation Station |
| 19 | $2152 | 9 | 8 | 1 | $985 | $832 | Medieval Castle | Basement Soundproofing |
| 20 | $2257 | 11 | 11 | 0 | $1109 | $1004 | Medieval Castle | Security Cameras |
| 21 | $2943 | 10 | 10 | 0 | $989 | $303 | Medieval Castle |  |
| 22 | $2257 | 10 | 9 | 1 | $1253 | $1939 | Haunted Manor | Haunted Manor |
| 23 | $3203 | 10 | 10 | 0 | $1285 | $339 | Haunted Manor |  |
| 24 | $4125 | 10 | 10 | 0 | $1261 | $339 | Haunted Manor |  |
| 25 | $2398 | 10 | 9 | 1 | $1666 | $3393 | Deep-Sea Ruins | Deep-Sea Ruins |
| 26 | $3626 | 10 | 10 | 0 | $1621 | $393 | Deep-Sea Ruins |  |
| 27 | $4647 | 9 | 9 | 0 | $1414 | $393 | Deep-Sea Ruins |  |
| 28 | $5881 | 10 | 9 | 1 | $1613 | $379 | Deep-Sea Ruins |  |
| 29 | $6960 | 9 | 9 | 0 | $1475 | $396 | Deep-Sea Ruins |  |
| 30 | $3110 | 10 | 10 | 0 | $2110 | $5960 | Celestial Observatory | Celestial Observatory |

Milestones: Day 2: Preparation Cradle · Day 3: Better Injector · Day 4: Assembly Jig · Day 7: Woodland Cabin theme · Day 9: Improved Sealer · Day 10: Short Conveyor · Day 12: Medieval Castle theme · Day 14: Premium Display Case · Day 16: Packaging Machine · Day 18: Automated Preparation Station · Day 19: Basement Soundproofing · Day 20: Security Cameras · Day 22: Haunted Manor theme · Day 25: Deep-Sea Ruins theme · Day 30: Celestial Observatory theme

Exposure at the end: 0/100. Lifetime globes sold: 233.

### Milestone days across seeds

| Unlock | Seed 11 | Seed 2024 | Seed 777 | Design target (§7) |
|---|---:|---:|---:|---|
| Preparation Cradle | 2 | 2 | 2 | day 1–2 |
| Assembly Jig | 6 | 4 | 4 | day 3–5 |
| Woodland Cabin | 4 | 7 | 7 | day 4+ |
| Short Conveyor | 8 | 10 | 10 | ~day 8 |
| Medieval Castle | 11 | 12 | 13 | day 7+ |
| Packaging Machine | 14 | 16 | 17 | ~day 12–15 |
| Automated Prep | 17 | 18 | 19 | ~day 15 |
| Haunted Manor | 20 | 22 | 23 | day 10+ |
| Deep-Sea Ruins | 24 | 25 | 27 | day 14+ |
| Celestial Observatory | 28 | 30 | 32 | day 18+ |

A player working at the modelled pace reaches every theme and upgrade in **28–32 in-game days**. At 8 real minutes of
shop time per day plus preparation and management, that's about 5–6 hours. That's longer than the 2–3 hour M7 target,
so that target stays open. Faster, more skilled players will get there sooner. We need real play data before deciding
whether to shorten the curve.

## Findings

1. **The early game is tight, but it works.**
   * Days 1–6 make about $100–$200 a day before purchases.
   * The first three handling upgrades land on days 2–4, one each morning.
   * No seed triggered an emergency supply order or went into debt.
2. **Demand used to plateau.**
   * *Before tuning*, walk-ins topped out at about 15 a day by day 5. After that, extra production just piled up, and
     cash grew with nothing to spend it on.
   * **Fix:** word-of-mouth foot traffic (`DayProgression.FootTrafficMultiplier`). Arrivals grow by 3% a day, capped
     at +60% on day 21. It's used by the Unity `CustomerSpawner` and covered by `FootTraffic_GrowsThenCaps`.
3. **The late themes were out of reach.**
   * At $1800 / $3500 / $7000, Celestial wasn't reached by day 30 on seed 2024.
   * **Fix:** Haunted is now **$1600**, Deep-Sea **$3000** and Celestial **$5500**, with the same unlock days. Revenue
     per globe roughly doubles across the theme ladder (see Revenue above), and each purchase now takes 2–4 days of
     saving. That's the "one meaningful purchase every few days" rhythm from §2.
4. **The late game is limited by throughput.**
   * With every upgrade, the modelled line makes ~13 attempts a day. That's about 10 sellable globes once rejects and
     missed cards are taken out. Customers would buy more.
   * So production is now the bottleneck. That's what we want, because it pushes the player to hand work over to
     the machines. But nothing is left to buy once the line is fully upgraded.
5. **There's no late-game money sink yet.** After Celestial, cash grows by about $1.1–1.7k a day with nothing to spend
   it on. Recommended M7 additions, in priority order:
   * **Second assembly bench** (~$4000): a parallel station. This lifts the throughput cap, so it's the natural answer to
     finding 4.
   * **Shop expansions** (~$2500 each): more premium shelf slots and a window display. Store appeal is capped at 6
     displayed globes, so these would raise that cap.
   * **Upkeep that scales with the business:** basement climate control and serum refrigeration, as daily costs that
     grow with the roster. This keeps cash meaningful and ties money back into the horror fiction.
   * **Story-milestone spend** (the supplier's "requests" in the notes): large one-off payments that move the story on.
6. **Theme twists hold up.**
   * Medieval without the jig loses 0.25 dome alignment. The sim buys the jig on days 4–6, long before Medieval
     unlocks.
   * Celestial can't be sealed without the Improved Sealer. It's bought well before day 18 in every seed, so it never
     blocks in practice. It just makes sure a player who skipped it has a reason to buy it.

## Not yet validated

* **Horror pacing and suspicion under load:** the sim has no customer perception model. This needs Unity playtests.
* **Real player speed:** the 75 s manual globe is a design target, not a measurement. The first editor sessions should
  time it (M2).
* **Breakdowns and repair time:** these are in the core and tested in `AutomationTests`, but they're not in this sim.
  Expect late-game output a little lower than shown.
