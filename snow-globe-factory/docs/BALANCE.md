# Economy balance pass (Milestone 7)

This pass was made with **`tools/BalanceSim`**, a headless run of the real simulation core. It uses no Unity. It checks
whether the prices in `DESIGN_PLAN.md` §7 give a sensible progression curve. It is a model of a player, not a playtest.
Every number here needs to be re-checked once people actually play the build (Milestone 2).

```bash
cd tools/BalanceSim
dotnet run -- 36 2024                   # days, seed; prints the table below
dotnet run -- 36 2024 ../../docs/x.md   # also writes the report to a file
```

## How the scripted player works

* **Real rules:** it uses the real `GameSession` services for supplies, production, the quality model, orders, themes,
  upgrades, H.'s ledger, the store and the nightly bills (rent plus electricity). So prices, costs, quality and upgrade
  effects are the game's own.
* **Time is modelled, not simulated:**
  * A globe takes **75 s** by hand, which is inside the 60–90 s design target.
  * Upgrades take time off each globe: Assembly Jig −12 s, Automated Prep −14 s, Short Conveyor −7 s, Packaging
    Machine −10 s and Sealing Press −10 s. A fully automated line takes about 22 s per globe.
  * There are 120 s of pre-opening work each day and 480 s of opening hours. Each sale costs 8 s at the counter.
* **Skill:** the player's skill is 0.65, with jitter. They hit the assembly card's pose 80% of the time and its scenery
  75% of the time. They inspect half their globes. Globes with a revealed defect are rejected back to holding.
* **Buying policy:**
  * It keeps a cash reserve for tomorrow's supplies and bills.
  * H.'s payment requests are paid as soon as they're affordable. The last page is signed.
  * When H. asks for a globe, it builds one to spec and inspects it, as soon as the theme and figure are available.
  * Everything else follows a fixed shopping list: handling fixes first, then themes and automation interleaved.
    It saves up for the next item on the list, and buys up to three things a morning.
  * Secrecy upgrades and the fuse box come last, because the sim has no suspicion, power-cut or wear model to reward
    them.
* **Walk-ins:**
  * Customers arrive at the core's rates: appeal × word of mouth × window display, with a concurrency bonus once 2+
    shoppers are allowed.
  * 85% of customers who find a stocked shelf buy the best globe on it.
* **Not modelled:** customers' suspicion, horror events, breakdowns and machine wear, power cuts, escapes, and the
  player's walking time and mistakes. The sim's exposure stays at 0, so **it says nothing about horror pacing**.

## Result (seed 2024)

| Day | Cash (end) | Made | Sold | Orders | Revenue | Spent | Theme | Bought today |
|---:|---:|---:|---:|---:|---:|---:|---|---|
| 1 | $366 | 6 | 6 | 0 | $299 | $83 | Winter Village |  |
| 2 | $319 | 5 | 5 | 0 | $258 | $305 | Winter Village | Preparation Cradle, Better Injector |
| 3 | $420 | 4 | 4 | 0 | $215 | $114 | Winter Village |  |
| 4 | $384 | 5 | 5 | 0 | $248 | $284 | Winter Village | Assembly Jig |
| 5 | $584 | 6 | 5 | 1 | $334 | $134 | Winter Village |  |
| 6 | $758 | 5 | 4 | 1 | $331 | $157 | Winter Village |  |
| 7 | $772 | 6 | 5 | 1 | $469 | $455 | Woodland Cabin | Woodland Cabin theme |
| 8 | $1058 | 6 | 6 | 0 | $458 | $172 | Woodland Cabin |  |
| 9 | $892 | 5 | 5 | 0 | $395 | $561 | Woodland Cabin | Ledger: Dues |
| 10 | $775 | 6 | 5 | 1 | $438 | $555 | Woodland Cabin | Improved Sealer |
| 11 | $869 | 7 | 7 | 0 | $547 | $453 | Woodland Cabin | Short Conveyor |
| 12 | $1343 | 6 | 6 | 0 | $689 | $215 | Woodland Cabin | Sent to H. |
| 13 | $1666 | 6 | 5 | 1 | $490 | $167 | Woodland Cabin |  |
| 14 | $1049 | 5 | 4 | 1 | $477 | $1094 | Medieval Castle | Medieval Castle theme |
| 15 | $1263 | 4 | 4 | 0 | $396 | $182 | Medieval Castle |  |
| 16 | $1666 | 6 | 6 | 0 | $575 | $172 | Medieval Castle |  |
| 17 | $1616 | 8 | 8 | 0 | $858 | $908 | Medieval Castle | Packaging Machine |
| 18 | $1697 | 13 | 12 | 1 | $1442 | $1361 | Medieval Castle | Shop Assistant |
| 19 | $2517 | 13 | 12 | 1 | $1377 | $557 | Medieval Castle |  |
| 20 | $2403 | 13 | 12 | 1 | $1447 | $1561 | Medieval Castle | Ledger: Machine Oil |
| 21 | $2567 | 18 | 17 | 1 | $1920 | $1756 | Medieval Castle | Automated Preparation Station |
| 22 | $2565 | 15 | 15 | 0 | $1527 | $1529 | Medieval Castle | Premium Display Case |
| 23 | $2818 | 16 | 16 | 0 | $2681 | $2428 | Haunted Manor | Haunted Manor theme, Sent to H. |
| 24 | $3037 | 26 | 25 | 1 | $3244 | $3025 | Haunted Manor | Sealing Press |
| 25 | $5013 | 26 | 26 | 0 | $3222 | $1246 | Haunted Manor |  |
| 26 | $3686 | 25 | 25 | 0 | $4199 | $5526 | Deep-Sea Ruins | Deep-Sea Ruins theme, Window Display |
| 27 | $6367 | 26 | 25 | 1 | $4179 | $1498 | Deep-Sea Ruins |  |
| 28 | $5095 | 26 | 25 | 1 | $4132 | $5404 | Deep-Sea Ruins | Ledger: The Last Page |
| 29 | $8000 | 26 | 25 | 1 | $4327 | $1422 | Deep-Sea Ruins |  |
| 30 | $5710 | 26 | 25 | 1 | $5705 | $7995 | Celestial Observatory | Celestial Observatory theme, Rewired Fuse Box, Basement Soundproofing |
| 31 | $8723 | 26 | 26 | 0 | $5525 | $2512 | Celestial Observatory | Security Cameras |
| 32 | $12589 | 26 | 25 | 1 | $5659 | $1793 | Celestial Observatory |  |
| 33 | $16541 | 27 | 26 | 1 | $5763 | $1811 | Celestial Observatory |  |
| 34 | $20412 | 26 | 26 | 0 | $5713 | $1842 | Celestial Observatory |  |
| 35 | $24178 | 26 | 26 | 0 | $5569 | $1803 | Celestial Observatory |  |
| 36 | $28027 | 26 | 26 | 0 | $5660 | $1811 | Celestial Observatory |  |

Milestones: Day 2: Preparation Cradle · Day 2: Better Injector · Day 4: Assembly Jig · Day 7: Woodland Cabin theme · Day 9: ledger 'Dues' · Day 10: Improved Sealer · Day 11: Short Conveyor · Day 12: ledger 'A Sample' (globe) · Day 14: Medieval Castle theme · Day 17: Packaging Machine · Day 18: Shop Assistant · Day 20: ledger 'Machine Oil' · Day 21: Automated Preparation Station · Day 22: Premium Display Case · Day 23: Haunted Manor theme · Day 23: ledger 'For the Window' (globe) · Day 24: Sealing Press · Day 26: Deep-Sea Ruins theme · Day 26: Window Display · Day 28: ledger 'The Last Page' · Day 30: Celestial Observatory theme · Day 30: Rewired Fuse Box · Day 30: Basement Soundproofing · Day 31: Security Cameras

Exposure at the end: 0/100. Lifetime globes sold: 524.

### Milestone days across seeds

| Purchase / story beat | Seed 11 | Seed 2024 | Seed 777 | Seed 5 |
|---|---:|---:|---:|---:|
| Preparation Cradle | 2 | 2 | 2 | 2 |
| Assembly Jig | 3 | 4 | 3 | 4 |
| Woodland Cabin | 6 | 7 | 6 | 6 |
| Ledger: Dues ($400) | 8 | 9 | 8 | 8 |
| Short Conveyor | 11 | 11 | 11 | 12 |
| Ledger: A Sample (Performer globe) | 12 | 12 | 12 | 12 |
| Medieval Castle | 13 | 14 | 13 | 14 |
| Packaging Machine | 15 | 17 | 15 | 16 |
| **Shop Assistant** | **18** | **18** | **19** | **20** |
| Automated Prep | 20 | 21 | 20 | 22 |
| Haunted Manor | 22 | 23 | 23 | 24 |
| Ledger: For the Window (Haunted Watcher) | 22 | 23 | 23 | 24 |
| Sealing Press | 23 | 24 | 24 | 25 |
| Deep-Sea Ruins | 25 | 26 | 25 | 27 |
| Window Display | 25 | 26 | 26 | 27 |
| **Ledger: The Last Page ($4000, ending)** | **28** | **28** | **28** | **29** |
| Celestial Observatory | 27 | 30 | 29 | 30 |
| Lifetime globes sold by day 36 | 545 | 524 | 535 | 502 |

A player working at the modelled pace reaches **the story's ending on days 28–29**, and has bought everything by
about day 31. Before the Shop Assistant existed, it was days 30–32 and 34–36.

That's still about 5 hours of play, longer than the 2–3 hour M7 target in the design plan. It's a design decision,
not a bug. The options are:

* **Accept a ~5 h campaign.** This is common for cosy management games, and the economy stays playable after the
  ending.
* **Compress it.** Multiplying every price by about 0.6 would put the ending near day 18.

This needs real play data first, because faster players will get there sooner.

## Tuning history

1. **Word-of-mouth foot traffic** (first pass):
   * Walk-ins used to plateau by day 5.
   * Arrivals now grow by 3% a day, capped at +60% (`DayProgression.FootTrafficMultiplier`).
2. **Cheaper late themes:**
   * First pass: Haunted $1800 → $1600, Deep-Sea $3500 → $3000 and Celestial $7000 → $5500.
   * Second pass, after the ledger and new upgrades were added: Deep-Sea → **$2500** and Celestial → **$4500**.
3. **Late-game money sinks** (this pass). These address the first pass's finding that cash piled up with nothing to
   buy once Celestial was unlocked:
   * **H.'s ledger** (the story; see `DESIGN_PLAN.md` §5e):
     * payments of $400, $1000 and $4000, each with a lasting reward;
     * two globe requests that H. pays 2× and 2.5× for.
   * **Sealing Press** ($1800, day 12). It raises the throughput cap that the first pass identified.
   * **Window Display** ($1600, day 15): +25% walk-ins.
   * **Rewired Fuse Box** ($1200, day 10): +5 power capacity. Without it, a fully automated line (9 power) overloads
     the base capacity of 3.
   * **Electricity:** $6 per power unit a night, on top of the $25 rent. That's about $50–60 a night late in the game.
   * The new items' prices were cut once after the first run: Machine Oil $2000 → $1000, Last Page $6000 → $4000,
     Sealing Press $2400 → $1800 and Window Display $2200 → $1600.
5. **Shop Assistant** (this pass). The counter was the late-game bottleneck (finding 3 below):
   * A first version ($500 to hire, $45 a night) more than doubled lifetime sales, because serving took over half of
     each open day.
   * That's the intended effect (the plan wanted the player freed to run the line), so it stays strong, but it now
     costs **$800** to hire, **$45 a night** and a **10% commission** on every sale the assistant rings up. Serving a
     customer yourself keeps the full price, so there's still a reason to walk to the till.
   * The sim hires them right after the Packaging Machine, on days 18–20.
6. **Endless-mode sinks** (this pass). After the assistant, cash piled up at ~$3.8k a day once everything was bought.
   * **Boutique refits:** five visible renovations (garlands, sconces, velvet runner, chandelier, gilded sign),
     each +6% on every retail price, costing $3000, $6000, $12000, $24000 and $48000. Tiers 1–2 pay back in about
     10–20 days; tiers 4–5 never do. They're prestige.
   * **Sponsoring the winter fair:** once a day, −20 business exposure, for $1000 more each time. The sim has no
     exposure, so it never buys it; it's a pressure valve for a busy horror business in real play.
   * With 50-day runs, the sim buys refit 1 on days 30–32 and refit 5 on days 48–50. Cash on day 36 is now
     $8k–$18k instead of $26k–$34k, and it stays flat through day 50 while the refits soak it up.
7. **Fixes to the sim's buying policy:**
   * Buying several things a morning with no saving rule meant cheap upgrades ate every theme budget.
   * Letting themes always come first starved automation.
   * An explicit shopping list with saving (above) behaves like a sensible player.

## Findings

1. **The early game is tight, but it works.**
   * Days 1–6 make about $100–$200 a day before purchases.
   * The handling upgrades land on days 2–4.
   * No seed triggered an emergency supply order or went into debt.
2. **The story paces the mid-game well.**
   * One ledger beat arrives every 3–5 days from day 8.
   * The two globe requests turn up exactly when the player has the right figure and theme. The Sample needs a
     Performer (day 6+). For the Window needs Haunted Manor plus a Watcher (day 12+).
3. **The counter bottleneck is fixed by the Shop Assistant.**
   * Before: with every upgrade, the line could make about 20 globes a day, but serving ~40 walk-ins took most of the
     day, so the modelled player made 11–13.
   * Now: once the assistant is hired, output climbs to 25–27 globes a day, limited by the line again.
4. **Cash no longer piles up straight away.** The boutique refits give days 30–50 a goal (tuning history 6). After the
   fifth refit, only the fair sponsorship is left, so a very long game will pile up cash again. More ideas if that
   matters in playtests: rarer figures, upkeep that scales with the roster, and a second shop.
5. **The theme twists hold up.**
   * The jig is bought on days 3–4, long before Medieval.
   * The Improved Sealer is bought on day 10, long before Celestial.

## Not yet validated

* **Horror pacing and suspicion under load:** the sim has no customer perception model. This needs Unity playtests.
* **Real player speed:** the 75 s manual globe is a design target, not a measurement. The first editor sessions should
  time it (M2).
* **Breakdowns, repair time and machine wear:** these are in the core and tested, but they're not in this sim. So the
  sim undervalues the Machine Oil and the Fuse Box.
