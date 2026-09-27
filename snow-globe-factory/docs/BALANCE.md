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
| 1 | $384 | 6 | 6 | 0 | $299 | $83 | Winter Village |  |
| 2 | $362 | 5 | 5 | 0 | $247 | $305 | Winter Village | Preparation Cradle, Better Injector |
| 3 | $385 | 5 | 5 | 0 | $267 | $284 | Winter Village | Assembly Jig |
| 4 | $630 | 6 | 5 | 1 | $325 | $134 | Winter Village |  |
| 5 | $589 | 6 | 6 | 0 | $371 | $460 | Woodland Cabin | Woodland Cabin theme |
| 6 | $921 | 5 | 4 | 1 | $434 | $169 | Woodland Cabin |  |
| 7 | $815 | 6 | 6 | 0 | $423 | $561 | Woodland Cabin | Improved Sealer |
| 8 | $843 | 6 | 5 | 1 | $519 | $573 | Woodland Cabin | Ledger: Dues |
| 9 | $1043 | 7 | 7 | 0 | $579 | $453 | Woodland Cabin | Short Conveyor |
| 10 | $1381 | 6 | 6 | 0 | $507 | $203 | Woodland Cabin |  |
| 11 | $1819 | 7 | 6 | 1 | $567 | $188 | Woodland Cabin |  |
| 12 | $1704 | 6 | 5 | 1 | $917 | $1136 | Medieval Castle | Medieval Castle theme, Sent to H. |
| 13 | $1598 | 7 | 7 | 0 | $698 | $896 | Medieval Castle | Packaging Machine |
| 14 | $1581 | 12 | 12 | 0 | $1269 | $1350 | Medieval Castle | Shop Assistant |
| 15 | $2364 | 13 | 13 | 0 | $1294 | $554 | Medieval Castle |  |
| 16 | $2172 | 12 | 12 | 0 | $1246 | $1561 | Medieval Castle | Ledger: Machine Oil |
| 17 | $2374 | 18 | 17 | 1 | $1783 | $1727 | Medieval Castle | Automated Preparation Station |
| 18 | $2553 | 16 | 16 | 0 | $1678 | $1542 | Medieval Castle | Premium Display Case |
| 19 | $2124 | 16 | 16 | 0 | $1917 | $2412 | Haunted Manor | Haunted Manor theme |
| 20 | $3595 | 17 | 16 | 1 | $2205 | $823 | Haunted Manor |  |
| 21 | $3554 | 24 | 24 | 0 | $2887 | $3006 | Haunted Manor | Sealing Press |
| 22 | $4415 | 25 | 24 | 1 | $4707 | $3963 | Deep-Sea Ruins | Deep-Sea Ruins theme, Sent to H. |
| 23 | $5665 | 26 | 26 | 0 | $4268 | $3100 | Deep-Sea Ruins | Window Display |
| 24 | $5008 | 25 | 24 | 1 | $5527 | $6259 | Celestial Observatory | Celestial Observatory theme |
| 25 | $6383 | 25 | 25 | 0 | $5439 | $4271 | Celestial Observatory | Rewired Fuse Box, Basement Soundproofing, Security Cameras |
| 26 | $7778 | 27 | 27 | 0 | $6271 | $4939 | Celestial Observatory | Refit 1 |
| 27 | $6701 | 27 | 26 | 1 | $6702 | $7990 | Celestial Observatory | Refit 2 |
| 28 | $7266 | 25 | 25 | 0 | $6327 | $5910 | Celestial Observatory | Ledger: The Last Page |
| 29 | $12051 | 25 | 24 | 1 | $6465 | $1870 | Celestial Observatory |  |
| 30 | $16693 | 26 | 25 | 1 | $6327 | $1860 | Celestial Observatory |  |
| 31 | $9444 | 26 | 26 | 0 | $6547 | $13908 | Celestial Observatory | Refit 3 |
| 32 | $14623 | 27 | 27 | 0 | $7112 | $1965 | Celestial Observatory |  |
| 33 | $19663 | 25 | 24 | 1 | $6825 | $1925 | Celestial Observatory |  |
| 34 | $24759 | 26 | 25 | 1 | $6744 | $1903 | Celestial Observatory |  |
| 35 | $29935 | 27 | 27 | 0 | $6851 | $1939 | Celestial Observatory |  |
| 36 | $11185 | 26 | 25 | 1 | $7064 | $25949 | Celestial Observatory | Refit 4 |

Milestones: Day 2: Preparation Cradle · Day 2: Better Injector · Day 3: Assembly Jig · Day 5: Woodland Cabin theme · Day 7: Improved Sealer · Day 8: ledger 'Dues' · Day 9: Short Conveyor · Day 12: Medieval Castle theme · Day 12: ledger 'A Sample' (globe) · Day 13: Packaging Machine · Day 14: Shop Assistant · Day 16: ledger 'Machine Oil' · Day 17: Automated Preparation Station · Day 18: Premium Display Case · Day 19: Haunted Manor theme · Day 21: Sealing Press · Day 22: Deep-Sea Ruins theme · Day 22: ledger 'For the Window' (globe) · Day 23: Window Display · Day 24: Celestial Observatory theme · Day 25: Rewired Fuse Box · Day 25: Basement Soundproofing · Day 25: Security Cameras · Day 26: Refit 1 · Day 27: Refit 2 · Day 28: ledger 'The Last Page' · Day 31: Refit 3 · Day 36: Refit 4

Exposure at the end: 0/100. Lifetime globes sold: 596.

### Milestone days across seeds

| Purchase / story beat | Seed 11 | Seed 2024 | Seed 777 | Seed 5 |
|---|---:|---:|---:|---:|
| Preparation Cradle | 2 | 2 | 2 | 2 |
| Assembly Jig | 3 | 3 | 3 | 3 |
| Woodland Cabin | 5 | 5 | 6 | 5 |
| Ledger: Dues ($400) | 9 | 8 | 10 | 8 |
| Short Conveyor | 8 | 9 | 8 | 9 |
| Ledger: A Sample (Performer globe) | 12 | 12 | 12 | 12 |
| Medieval Castle | 11 | 12 | 12 | 11 |
| Packaging Machine | 13 | 13 | 13 | 13 |
| **Shop Assistant** | 14 | 14 | 14 | 15 |
| Automated Prep | 15 | 17 | 17 | 17 |
| Haunted Manor | 18 | 19 | 20 | 19 |
| Ledger: For the Window (Haunted Watcher) | 22 | 22 | 22 | 22 |
| Sealing Press | 20 | 21 | 21 | 21 |
| Deep-Sea Ruins | 21 | 22 | 22 | 22 |
| Window Display | 22 | 23 | 23 | 23 |
| **Ledger: The Last Page ($4000, ending)** | 28 | 28 | 28 | 28 |
| Celestial Observatory | 23 | 24 | 24 | 24 |
| First boutique refit | 24 | 26 | 26 | 26 |
| Lifetime globes sold by day 36 | 625 | 596 | 600 | 600 |

A player working at the modelled pace reaches **the story's ending on day 28** (the ledger's own day gates set that), with
the themes, the assistant and the first refit arriving days earlier than before the daily goals (next section).

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
7. **Daily goals** (this pass). Three small goals a morning, each paying a little cash, plus a streak bonus for clearing
   all three.
   * The first tuning ($8–45 a goal, streak up to $100) doubled the early economy: Celestial on day 19 instead of 29.
     Even small bonuses compound, because every purchase comes sooner and raises output.
   * Now: $2–15 a goal at first (rising 10% a day) and a streak bonus of $3 a day up to $20. With goals switched off,
     the sim reproduces the old milestones exactly, so the remaining change is the goals themselves: the assistant
     arrives on days 14–15 (was 19), Celestial on 23–24 (was 29–30) and the first refit on 24–26 (was 31). The ending
     stays on day 28.
   * The sim clears every goal every day, which real players won't, so real play will sit between the two.
8. **Fixes to the sim's buying policy:**
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
