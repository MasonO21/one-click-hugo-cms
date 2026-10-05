# Kindlehold: game design and business plan

**Pitch:** Raise the last living dragon of fire and keep a frozen town alive around it. Kindlehold is a survival city-builder with heroes, expeditions and alliances, aimed at the same audience as Whiteout Survival, with the survival game that its ads promise kept at the center of play.

This document covers what the prototype in this folder proves, what makes the game different enough to pull players away from Whiteout Survival, how it makes money, and what it would take to ship it.

---

## 1. Where Whiteout Survival is strong, and where it leaves an opening

Whiteout Survival (Century Games, 2023) is one of the highest-grossing mobile strategy games of the last few years; third-party trackers estimate its lifetime revenue well past $1B. We keep what makes that work:

| Keep | Why it works |
|---|---|
| A frozen-apocalypse settlement built around a single heat source | Instantly readable premise, strong ad creative, cozy-versus-cold contrast |
| Central "furnace" level gates every other building | Clear long-term goal; each upgrade unlocks visible growth |
| Collectible heroes with rarity, stars and gacha recruitment | The core of the revenue model in the genre |
| Short PvE stages early, alliances and server events later | Fast early wins, then social retention |
| Timers with speedups, battle pass, monthly card, packs | Proven spending ladder from $0.99 to whale tiers |

Complaints that come up again and again in Whiteout Survival's store reviews and community forums are where we win:

1. **The game in the ads isn't the game.** Ads show survivors freezing and heat management. In the real game that layer fades after the first hour and the game becomes a timer-and-power race.
2. **Late joiners and free players get crushed** by older servers and heavy spenders in server-versus-server events.
3. **Pack fatigue.** Constant pop-up offers and a feeling that every system has its own paywall.
4. **Weak attachment.** The furnace is a building; nobody loves a building.

## 2. What makes Kindlehold different

These five pillars are in the prototype now (except where noted). Each one answers a complaint above.

1. **A living heat source: the Hearthwyrm.** Your "furnace" is a fire dragon coiled around the hearth. It grows through five forms (Hatchling, Whelp, Drake, Firewyrm, Elder Hearthwyrm), visibly gets bigger, blinks, breathes embers, and goes dormant and grey if you let the coal run out. It gives players a pet to protect and a canvas for cosmetic spending (skins), which is revenue that doesn't add pay-to-win pressure.
2. **Survival that stays real all game.** Weather is forecast ahead of time (Snowfall, Blizzard, Deep Freeze). The frost "hunts warmth", so every time the wyrm grows, storms hit harder. Players choose the blaze (Banked, Steady, Roaring), trading coal for heat. Cold makes survivors sick, the Infirmary heals them, and in a Freezing hold the sick can be lost. In our balance-bot runs, a player who stokes the fire before storms finished an hour of compressed play about one Hearthwyrm level and five expedition stages ahead of one who ignored the weather.
3. **Heroes matter at home, not just in fights.** Every hero can be stationed as a Steward of one building (Bram boosts coal, Hedda speeds healing, Sigrun adds warmth). Collecting heroes improves your town as well as your squad, which deepens the gacha without adding more combat power.
4. **Offline protection.** While you're away, the wyrm banks its fire: production continues at a reduced rate and nobody gets sick. No logging in to a dead town.
5. **Fair seasons** *(design, not in prototype)*. Server-versus-server "Thaw Wars" use spend brackets, so whales fight whales and newcomers fight newcomers. Each season ends with a "Thaw" that opens new regions and lets players move to fresh servers with their heroes and cosmetics. This is the headline message to Whiteout Survival players.

### Naming and IP

Everything is original: the setting (the Long Night, the Hearthwyrm), building names, hero names and bios, currencies (Starglass, Beacon Tokens, Field Journals), and the art. Before launch, run a trademark search on "Kindlehold" in the US, EU, UK, Japan and Korea. Do not use "Whiteout Survival" as a store keyword or in ad copy; Apple rejects competitor names in keywords and it invites a trademark claim. Comparative messaging ("tired of losing to whales?") is fine without naming them; have a lawyer review it.

## 3. Core loop

```
Minute to minute:  check forecast → set blaze → assign workers → start an upgrade
Session (5-10 min): claim quest → clear an expedition stage → level heroes → recruit
Day:               patrol cache, Ember Stipend claim, alliance help (planned), events
Season (6-8 wks):  Ledger pass, Thaw Wars (planned), new region and wyrm skin
```

### Systems in the prototype

| System | What it does | Where |
|---|---|---|
| Hearthwyrm | Heat, coal burn, 3 blaze settings, 5 growth forms, gates all building levels | `game.js` tick + `drawWyrm` |
| Weather | Forecast queue, storms scale with wyrm level, Watchtower extends sight | `nextWeather`, `DATA.weather` |
| Survivors | Housing, food, sickness, healing, losses, arrivals, auto or manual worker assignment | `tick`, `autoAssign` |
| 11 buildings | Fixed plots around the nest, each with its own effect | `DATA.buildings`, `DATA.plots` |
| Research | 8 techs in the Archive of Thaw | `DATA.techs` |
| Troops | 3 classes in a counter triangle (Shieldguard > Sled Lancer > Frostbow > Shieldguard), march cap, housing cap | `DATA.troops` |
| Heroes | 12 heroes, 3 rarities, levels, stars from duplicates, combat skill, Steward post | `DATA.heroes` |
| Recruitment | Published odds, 40-pull Legendary pity, 10-pull Epic guarantee, featured hero | `DATA.recruit` |
| Expedition | 30 stages in 3 chapters, 6 bosses, auto-battle, idle patrol cache | `DATA.chapters` |
| Quests | 27 chapter quests that walk new players through every system | `DATA.quests` |
| Season pass | 15-tier free and premium Ledger | `DATA.pass` |
| Store | Starter offer, monthly card, pass, Starglass packs, cosmetic skins, supply crates (all simulated) | `DATA.shop` |

Timers and rates are compressed about 30× so the prototype plays through in an hour. In the live game the first Hearthwyrm upgrades take minutes and later ones take hours to days, as in the genre.

## 4. Monetization

Target: match the genre's spending ladder while putting more of the spend into breadth (cosmetics, convenience, collection) and less into raw PvP power. Spend brackets in PvP are what let us keep whales (who carry most genre revenue) while telling free players the game is fair.

| Product | Price (USD) | Role |
|---|---|---|
| Founder's Cache: Starglass, tokens, journals, **permanent second builder** | $0.99, once | Converts a free player into a payer early. The second builder is the most useful thing in the game, so this is the single most important offer |
| Ember Stipend: 300 Starglass now and 90 a day for 30 days | $4.99 / 30 days | Daily login habit plus recurring revenue |
| Hearthkeeper's Ledger premium track | $9.99 / season | Mid-spender anchor; capstone is a wyrm skin |
| Starglass packs | $1.99 to $99.99 | Speedups, recruits, crates |
| Wyrm skins (Aurora Scales, Obsidian Ember; Glacier Sapphire earnable with free Starglass) | $4.99 to $6.99 | Cosmetic only; the biggest differentiator from a "furnace" |
| Event packs, hero-specific recruit banners, growth fund *(planned)* | $4.99 to $99.99 | High-spender depth, tied to live events |
| VIP levels from lifetime spend *(planned)* | n/a | Convenience perks; never PvP stats |

**Pricing anchors used in the prototype:** a single recruit costs 150 Starglass. The $9.99 pack buys about 4.7 recruits, and a 10-pull costs 1,350 Starglass, about $19. That is in line with genre norms; tune it in soft launch.

### Store and legal compliance (non-negotiable)

- **Apple in-app purchase** for all digital goods (App Store Review Guideline 3.1.1). The prototype's buttons are simulated. The App Store build must route through StoreKit with server-side receipt validation.
- **Gacha odds disclosed before purchase.** Apple requires it for paid random items, and so do China, Korea and Japan. The prototype has an Odds sheet on the recruit screen.
- **Paid random items are restricted in some countries** (Belgium bans them outright). Build a region switch that turns paid recruits into direct purchases or shard shops.
- **Age rating, parental controls and spending limits for minors**, plus clear refund flows. In-game currency prices must show real-money equivalents where local law requires.

## 5. How we pull Whiteout Survival players over

1. **Message:** "The survival game you were promised." Ad creative shows real Kindlehold gameplay: a blizzard rolling in, the player stoking the wyrm to Roaring, survivors staying warm. Because the gameplay is real, the ad-to-game gap that drives churn in this genre is closed.
2. **Fresh, fair servers at launch.** Everyone starts on day one, and Thaw Wars spend brackets are announced up front.
3. **The Hearthwyrm as the face of the game.** Skins, wyrm-naming, sharing your wyrm's form. A lovable mascot is a UA and social asset that a furnace can't be.
4. **Returning-veteran onboarding.** Skip-tutorial for experienced 4X players and a "Warden's Welcome" catch-up event for anyone who joins a server late.
5. **Creator program** with mid-size strategy and Whiteout Survival YouTubers and streamers at soft launch. Give them early access, custom wyrm skins and alliance-founder codes.

## 6. Live-ops roadmap (after launch)

- **Season 1 (launch):** Chapters 1-3, Ledger, Founder's Cache, first skin set.
- **Alliances ("Kindreds"):** build-help, shared alliance hearth, Frost Titan alliance raid.
- **World map:** scout and gather on a shared snowfield; rival holds; the frost line shrinks each season.
- **Thaw Wars:** bracketed server-versus-server event every season.
- **Wyrm evolutions:** elemental branches at Elder form (cosmetic plus small, non-PvP town bonuses).
- **Monthly hero banners** and story events in the Long Night lore.

## 7. What it takes to ship and scale

This folder is a **playable HTML5 prototype** for testing the concept, balance and art direction. A top-grossing live game is a much larger project. Rough figures for planning; each should be validated with a studio or publisher:

| Phase | Goal | Typical team / time |
|---|---|---|
| Prototype (this) | Prove the loop and the Hearthwyrm's appeal; playtest with 20-50 genre players | Done; iterate with data.js |
| Vertical slice | Production art, Unity (or Cocos) client, server-authoritative backend, StoreKit | 6-12 people, 4-6 months |
| Soft launch | 1-3 test markets (commonly Canada, Australia, Philippines). Hit retention and payer gates before scaling spend | 15-30 people, 3-6 months |
| Global launch | Paid user acquisition at scale, live ops, alliances and PvP | 30-80+ people, ongoing |

**Gates before spending real UA money.** These are genre rules of thumb to confirm in soft launch:

- Day-1 retention around 40%, Day-7 around 15%, Day-30 around 6% or better
- A payer conversion rate of a few percent in the first 30 days
- Projected 180-day revenue per install above cost per install with margin. 4X installs in tier-1 markets commonly cost well into double-digit dollars

**What the backend needs that the prototype doesn't have:** accounts and cloud saves, server-authoritative timers and economy (the prototype trusts the client, which is fine for testing and not for real money), receipt validation, anti-cheat, analytics events for every economy action, remote config for tuning, push notifications ("Blizzard in 10 minutes"), chat and moderation.

**Funding and publishing.** Games at Whiteout Survival's revenue are backed by very large user-acquisition budgets. Realistic routes are: (a) take this prototype and a vertical slice to a mobile strategy publisher, or (b) raise for a lean team to reach soft launch and prove the retention gates, then raise or partner for UA.

### Honest risk statement

Most 4X and survival-strategy launches never reach top-grossing charts, regardless of quality, because the category is dominated by a few incumbents with large UA budgets. Nothing in a design document can guarantee revenue. What the plan above does is make the risky bets cheap first (prototype, then soft-launch metrics) and only spend big once players prove they stay and pay.

## 8. Next steps for the prototype

1. Playtest with 20+ Whiteout Survival players; watch the first 10 minutes and the first blizzard.
2. Add analytics hooks (tutorial funnel, first purchase screen views, storm outcomes).
3. Commission a concept-art pass on the Hearthwyrm's five forms; this is the marketing hero.
4. Prototype alliances with a minimal shared-state backend.
5. Wrap the web build in Capacitor for TestFlight playtests on real iPhones (see README).
