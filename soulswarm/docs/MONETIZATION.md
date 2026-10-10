# SOULSWARM: Monetization and Economy Design

**Status:** v1.1, synced to the prototype build (Oct 2026) · **Owner:** Lead Game Designer / PM · **Source of truth:** the code (`src/game/data.js` for prices, odds, SKUs and rewards; `src/meta/economy.js` for the rules). `DESIGN_BRIEF.md` and `GDD.md` mirror it. Anything marked **Planned** is not in the current build, where purchases and ads are simulated.

---

## 1. The honest framing

No game is guaranteed to make money, let alone millions. Most mobile games never recover their development and marketing costs. Revenue comes from four multiplied factors, and a weak link in any one of them sinks the product:

> **Revenue ≈ Installs × Retention (days active per install) × ARPDAU**
> **ARPDAU ≈ (payer share of DAU × average daily spend per payer) + (ad impressions per DAU × eCPM ÷ 1,000)**
> **Profit ≈ Paid installs × (net LTV − CPI) + organic installs × net LTV − team and operating costs**

- **Retention** is the multiplier on everything else. A 2× change in D30 retention roughly doubles lifetime value. That makes it the first thing to fix, ahead of the shop.
- **Conversion × ARPPU** is what the economy design controls: how many players ever pay, and how much the payers keep paying.
- **UA cost (CPI)** decides whether we can buy growth. If net LTV is below CPI, every paid install loses money and the game cannot scale, however good it looks.

Our design stance: **monetise speed, convenience, collection and cosmetics; never monetise the ability to finish the story.** That follows the brief's fairness guardrails, and it also protects retention, which is worth more than any single sale.

---

## 2. Currencies: sources and sinks

### 2.1 Gold (soft)

| Sources | Typical amount | Sinks | Amount |
|---|---|---|---|
| Run rewards (formula in GDD §10) | 3,124 (Ch1 clear) to 5,714 (Ch5 clear); ~1,300–1,750 for a death at 4:00. Nightmare ×1.75, Torment ×2.5 (a Ch5 Torment clear ≈ 14,300) | **Talents** (6 talents, 125 levels) | 1,358,940 to max everything |
| Daily quests | 2,700 / day | Talent level cap = 10 + 6 × chapters cleared (Planned) | Paces spending |
| 7-day login | 7,000 / cycle | | |
| Soul Pass free track | 20,800 / season | | |
| Starter Pack | 10,000 (one-time) | | |
| Gold bundles (gem sink) | 60 gems → 5,000 · 300 gems → 30,000 | | |
| Rewarded "daily free chest" | 800–1,499 (plus 10 gems and a relic) | | |
| Soul Pact | +20% run gold | | |
| New account | 1,500 (one-time) | | |
| Bestiary milestones (GDD §5.2) | 2,000 per entry's first milestone, 26,000 in all (one-time) | | |

**Risk:** an engaged player (4–6 runs a day) maxes all talents in roughly 2–3 months, after which gold has no sink. Nightmare and Torment (GDD §8.2) pay ×1.75 / ×2.5 run gold, and that stacks with Blood Moon (×2) and the rewarded-ad double, so a Torment Blood Moon clear with the ad pays ×10 the Normal base. That is acceptable only because Torment players are endgame players whose talents are mostly bought already; it makes the Season 4 gold sink more urgent, not less. Post-launch sinks (Relic Ascension, legion cosmetics bought with gold) are on the live-ops roadmap for Season 4 (see `LIVEOPS.md`). Watch the median gold balance of D60+ players. If it climbs without stopping, the sink is late.

### 2.2 Soul Gems (premium)

| Sources | Amount | Sinks | Price |
|---|---|---|---|
| IAP gem packs | 80–15,000 (×2 on the first buy of each tier) | **Soul Altar** | 150 per pull · 1,350 per 10-pull |
| Daily quests | 60 / day | Energy refill | 30 energy for 50 gems (no daily cap in the build) |
| 7-day login | 180 / cycle | Revive (alternative to the ad) | 60 gems, 1 paid revive per run in total |
| Run rewards | 12–20 per repeat clear; 2 per full 2 minutes survived on a defeat | Gold bundles | 60 / 300 gems |
| Account level-ups | 20 each | Altar Sigils (gem shop) | 150 each · 1,350 for 10 |
| Soul Pass free / premium | 340 / 1,140 per season | Soul Pass catch-up tiers (Planned) | 100 per tier, last 7 days of a season only |
| Chapter first clears | 70 / 90 / 110 / 130 / 150 for Ch1–5 (one-time, 550 total; only the 12–20 clear gems in it are doubled by Blood Moon or the ad) | | |
| Nightmare / Torment first clears | +60 / +120 per chapter on top of the 12–20 clear gems (one-time, 300 + 600 = 900 total; never doubled by Blood Moon or the ad) | | |
| Soul Pact | 300 now + 100 / day | | |
| Starter Pack | 300 | | |
| Daily free chest (rewarded ad) | 10 / day | | |
| Daily Trial clear (once a day; a rewarded ad buys one retry) | 40 / day, plus 1 Sigil every 3rd clear | | |
| New account | 150 (one-time) | | |
| Weekly quest chest (25 daily quests) | 50 / week, plus 1 Sigil | | |
| Bestiary milestones (GDD §5.2) | 50 per entry's third milestone (10,000 kills; 3,000 Corpse Priests; or 50 Soul Thieves / kills of a chapter boss), 650 in all (one-time, over months) | | |
| Events and leaderboards (Planned) | 50–500 per event | | |

### 2.3 Energy, Altar Sigils, Hero Shards

| Currency | Sources | Sinks | Design intent |
|---|---|---|---|
| **Energy** (30 max, +1 every 6 min) | Regen (30 in 3 h), rewarded ad (+10, 3/day), gems (50 for +30, no daily cap in the build). Refills may go above 30 (to 99); regen only runs below 30. | 5 per run, including the first Chapter 1 run, on every difficulty (Nightmare and Torment cost the same: a harder run is not a reason to spend more of the session pacer). Planned: Endless Abyss at 5; a free tutorial run and Boss Rush (3 free tries per day). | A soft session pacer, not a paywall. A full bar = 6 runs, about 45 minutes of play. |
| **Altar Sigils** (1 sigil = 1 pull) | Daily quest "Pass 3 Soul Gates" (1/day), login (3 per cycle), free pass (6), premium pass (12), Starter Pack (3), each chapter's first clear (1, 5 in total), each Bestiary entry's second milestone (1, 13 in total), new account (1), gem shop (150 gems each). Planned: weekly chest, events. | Soul Altar only | Lets free players pull without spending gems. Keeps summon value visible. |
| **Hero Shards** | Epic rolls (4 Seraphine, 6 Nyx, 5 Liora or 5 Grimsby, equal chance), Legendary rolls (5 Mordrake, 6 Seraphine or 5 Osric, equal chance), premium pass S1 (25 Seraphine), duplicate hero grants (20). Planned: Endless Abyss Abyssal league, top 10 per group (2 Mordrake per week). | Unlock (10) and stars (10/20/40/80) | Long-tail collection chase. Stars give +12% damage and +8% HP each. |

### 2.4 What a free player earns per 28-day season (daily active, all quests, ~3 runs a day)

| Source | Gems | Sigils | Pulls |
|---|---|---|---|
| Daily quests (60 × 28, 1 sigil a day) | 1,680 | 28 | |
| 7-day login (4 cycles) | 720 | 12 | |
| Soul Pass free track | 340 | 6 | |
| Run gems (~84 runs, half repeat clears, half defeats, ~9 each) | ~750 | — | |
| Account level-ups (~21 in the first season, fewer later) | ~420 | — | |
| Weekly quest chest (Planned) | — | — | |
| **Subtotal** | **≈ 3,900 gems ≈ 29 pulls** (at 10-pull price) | **46** | **≈ 75** |
| Rewarded "free daily summon" (×28) | — | — | +28 |
| Rewarded daily free chest (10 gems × 28) | 280 | — | +2 |
| **Total** | | | **≈ 105 pulls ≈ 3.0 Legendaries per season** (≈ 2.1 without ads) |

Event sources are not included: the Boss Rush milestones (GDD §8.3) pay at most 2,500 gold, 90 gems and 1 sigil per event (≈ 270 gem-equivalent, and only for a full clear; a fresh Chapter 1 player earns the first, 1,000 gold). The build runs the event weekly so it can be played, which would add about 10% to a full-clearing player's season; live, it runs once a season (about 2.5%). One-time sources are not included either: chapter first clears (550 gems + 5 sigils), Nightmare and Torment first clears (900 gems, spread over months of endgame play, see §2.5), Bestiary milestones (650 gems + 13 sigils + 26,000 gold, see §2.6), the beginner tutorial (its run's gold plus 500 gold and 30 gems, once; GDD §16) and the new-account balance (150 gems + 1 sigil).

### 2.5 Nightmare and Torment (endgame difficulty)

Each campaign chapter can be replayed on Nightmare (after a Normal clear) and Torment (after a Nightmare clear); see GDD §8.2. The rewards are built so endgame players keep earning without inflating premium currency:

| | Normal | Nightmare | Torment | Why |
|---|---|---|---|---|
| Run gold | ×1 | ×1.75 | ×2.5 | Gold is the soft currency; endgame players have little left to buy with it (see §2.1 risk). The flat bounties (+40 per elite affix, Soul Thieves) are not multiplied, though harder elites carry 1–2 more affixes |
| Pass XP | ×1 | ×1.5 | ×2 | Pass XP is capped at 15,000 a season, so it only moves *when* an endgame player finishes the pass. Account XP stays at the Normal amount, so the 20-gem account level-ups keep their pace |
| Run gems | 12–20 per clear | same | same | No per-run gem multiplier: repeat farming never prints premium currency |
| First clear (one-time per chapter) | 70–150 gems + 1 sigil | +60 gems | +120 gems | 900 gems in total, about 7 pulls, earned over months. Flat: Blood Moon and the rewarded-ad double skip it |
| Boss Hoard relic | Ch1–2 Common/Rare, Ch3–5 up to Epic 35% | Rare 60% / Epic 40% | Epic 98% / Legendary 2% | Relics only, never hero shards, so Mordrake, Osric and Seraphine still come from the Altar |
| Energy | 5 | 5 | 5 | |

**Legendary relics from Torment.** Campaign runs never dropped Legendaries before (the Endless Abyss Epic+ relic at depth 4+ already could, at 20%). Torment's Hoard has a 2% Legendary chance, the same as one Altar pull. An endgame player clearing Torment 2–3 times a day finds roughly 1–2 Legendary relics a season this way, against ≈ 3 from a free player's pulls. That deepens relic collection (§6.5: a specific Legendary at Lv10 needs ~80 copies) without competing with the Altar's hero shards. Watch the share of Legendary relics that come from Torment; if it passes ~35% of all Legendaries for D90+ players, lower it to 1%.

That is generous by design. A free player unlocks a first Legendary hero (10 shards = two drops of Mordrake or of Osric, ≈ 3.8 Legendary rolls, because a third of Legendary rolls give Seraphine shards instead) in about 5–8 weeks; Mordrake in particular takes ≈ 6 Legendary rolls (8–12 weeks) since Osric joined the pool on 2026-10-08. The whole story is clearable with Vael. Spending buys *speed* (more pulls now), *depth* (stars and relic levels) and *cosmetics*.

### 2.6 The Bestiary (collection milestones)

The Bestiary (GDD §5.2) has a painted entry for each of 13 foes (the horde's seven, the Soul Thief and the five chapter bosses), and each entry has three milestones that pay once per account, 39 in all (`BESTIARY` in `data.js`):

| Milestone | Goal: Husk, Ghoul, Brute, Cinder Witch, Bloater, Grave Wraith | Goal: Corpse Priest | Goal: Soul Thief, each chapter boss | Reward | All 13 entries |
|---|---|---|---|---|---|
| I | 100 kills | 50 | 1 | 2,000 gold | 26,000 gold |
| II | 1,000 | 500 | 10 | 1 Altar Sigil | 13 sigils |
| III | 10,000 | 3,000 | 50 | 50 gems | 650 gems |

**Budget check.** The whole Bestiary is worth about 2,910 gem-equivalent: 650 gems, 13 sigils (1,950 at the gem-shop price) and 26,000 gold (≈ 310 gems at the 5,000-for-60 rate). That is about 19 pulls, once. The four newer chapter bosses (2026-10-08) added about a third of it and Update 5's two foes (2026-10-09) about a sixth; both pay the slowest. The Corpse Priest has lower goals because at most three are ever alive, so it dies far less often than the horde foes.
- **Against a season:** a daily free player earns ≈ 3,900 gems and 46 sigils per season (§2.4). The Bestiary's first five horde entries and the Soul Thief add about +9% gems and +15% sigils in the first season only. The Grave Wraith (Chapter 2 on) and the Corpse Priest (Chapter 3 on) start with the campaign and their 100 gems and 2 sigils land over the first two seasons. The boss entries spread over the campaign: each pays 2,000 gold with its chapter's first clear, a sigil after ten kills (ten clears of its chapter on any difficulty, or every fifth Endless boss) and 50 gems after fifty, so most of their 200 gems and 4 sigils land in the second season or later.
- **Against the other one-time sources:** its gems match the chapter first clears (550 gems + 5 sigils) and stay under the Nightmare / Torment first clears (900 gems); its sigils, about two a season after the first, are the larger share.
- **Pacing:** the horde entries' tiers I and II land in the first days, the bosses' as the campaign goes; the gems of tier III arrive over about a month (4 days for Husks, 3–4 weeks for Brutes, Witches and Bloaters, about a month of Soul Thieves, and 50 kills of each chapter boss). That is a trickle of about 12 gems a day in the first month, not a lump that floods the Altar.
- **Fairness:** nothing in it is sold and money cannot speed it up: kills come only from playing.
- **Verdict:** the suggested rewards stand as designed. If D30+ gem balances run high (§12), the tier III gems (50 → 30) are the lever to pull.

---

### 2.7 The Grimoire (run-start pages, never sold)

The Grimoire (GDD §4.9) is a collection with no price tag: its eight pages unlock from play (runs finished, chapter clears, minions raised, a kill streak, a legion size, foes slain). Every page is a trade (a boon with a price), so none is a straight power purchase, and the blank page stays a fair choice; for that reason pages are **never sold** for gems or money. They pay off monetization indirectly: they give a reason to keep playing (and to replay cleared chapters with a new twist) between hero releases, and new pages can arrive as free Soul Pass rewards to make the pass feel richer without touching its premium value.

## 3. Spend-depth ladder

| Tier | Lifetime / monthly spend | Typical purchases | What they get | Share of players (target) |
|---|---|---|---|---|
| **Free** | $0 | Rewarded ads | Full story, ~3 Legendaries per season with ads | 95–97% |
| **Minnow** | $0.99–$9.99 lifetime | `starter_pack` $1.99, first-purchase `gems_80` (160 gems), one `gems_500` | Nyx early; 1 extra 10-pull | ~2–3% |
| **Dolphin** | ~$15–$60 per month | `soul_pact` $4.99 + `soul_pass` $9.99 (= $14.98), occasional `gems_1200`/`gems_2600` | ~43 extra pulls per season + guaranteed Legendary relic + Eclipse Vael skin. About 1.4× the pull rate of a free player who watches every ad (≈ 2× one who watches none). | ~0.8–1.5% |
| **Whale** | $100–$500+ per month | `gems_7000`, `gems_15000` | $100 ≈ 111 pulls ≈ 3.2 Legendaries · $500 ≈ 16 Legendaries. Chasing Mordrake and Osric 5★ and Legendary relic levels. | ~0.1–0.3% |

In midcore gacha games a small share of payers usually produces most IAP revenue. Industry write-ups often cite 50–70% from the top 10% of payers. We design for depth, but we cap harm with the spending limits in §10. **Dolphins are the health metric:** a game that only works with whales is fragile and attracts regulatory and press risk.

---

## 4. SKU catalogue: why each one exists

| SKU | Price | Contents | Gems per $ | Why it exists |
|---|---|---|---|---|
| `gems_80` | $0.99 | 80 gems (first buy: 160) | 80.8 | The lowest-friction first purchase. It breaks the "I never pay" barrier. Also the base rate for honest bonus labels. |
| `gems_500` | $4.99 | 500 (1,000) | 100.2 (+24% vs base) | Impulse tier. Covers a revive habit and energy. |
| `gems_1200` | $9.99 | 1,200 (2,400) | 120.1 (+49%) | Under one 10-pull (1,350). On a first purchase (2,400) it covers one 10-pull with gems to spare. The workhorse tier. |
| `gems_2600` | $19.99 | 2,600 (5,200) | 130.1 (+61%) | About two 10-pulls (2,700) with a small top-up. |
| `gems_7000` | $49.99 | 7,000 (14,000) | 140.0 (+73%) | Dolphin-to-whale bridge. ~52 pulls, close to one guaranteed pity cycle (60). |
| `gems_15000` | $99.99 | 15,000 (30,000) | 150.0 (+86%) | **Anchor.** Sets the price ceiling that makes everything else look reasonable, and serves whales. |
| `starter_pack` | $1.99, one-time, 48 h | Nyx Hollowborn (20 Nyx shards if already owned) + 300 gems + 10,000 gold + 3 sigils | — | Converts new players at their most engaged moment and gives a new hero, not just currency. |
| `soul_pact` | $4.99 / 30 days | 300 gems now + 100 / day + ad-free rewards + 20% more run gold | 661 (if claimed daily) | Habit and retention product. It rewards daily logins and is the best value in the shop on purpose. |
| `soul_pass` | $9.99 / season | Premium Soul Pass track | — | Seasonal engagement product. Value is paced over 28 days and finished by playing. |

**First-purchase doubling:** the first purchase of *each* gem tier gives double gems (the "×2 FIRST" badge disappears after use). That turns every tier into a one-time "deal", encourages trying the next tier up, and removes the risk of the first purchase feeling bad.

---

## 5. Pricing psychology (and the honesty rules that go with it)

| Technique | How we use it | Honesty rule |
|---|---|---|
| **Anchoring** | `gems_15000` sits at the right edge with "Best rate: 150 gems/$". The $9.99 tier sits in the visual centre with the "Most popular" tag. | "Most popular" only if it is true in the last 30 days of data for that region. The build's "Best Value" tag sits on `gems_15000`, the best rate (150 gems/$); `gems_7000` has no tag. |
| **Bonus labels** | Each pack shows "+X% gems vs $0.99 rate" (+24% / +49% / +61% / +73% / +86%). | Always computed against `gems_80`. Never against an imaginary "original price". |
| **First-purchase bonus** | ×2 gems, one per tier. | Shown as "×2 on first purchase", never a fake crossed-out price. |
| **Starter Pack value framing** | The honest, conservative badge reads **"540% value"** (`SKUS.starter_pack.value`), with Nyx shown separately as the Rare hero. Basis: 300 gems + 10,000 gold (120 gems at the gem-shop rate) + 3 sigils (450 gems) = 870 gems ≈ $10.77 at the $0.99/80-gem rate, ÷ $1.99, with the hero not counted. | Value claims are computed from public prices: gems at the `gems_80` base rate, gold and sigils at their gem-shop prices. Heroes are listed, not priced, so the badge understates the pack rather than inflating it. |
| **Timed offer** | The Starter Pack has a real 48 h countdown from first display. (Build: the 48 h start at account creation; counting from first display is Planned.) | The timer never resets secretly. If it expires, the pack is gone for good. We do not "surprise" re-offer the same pack. |
| **Charm pricing** | All prices end in .99 (store price tiers). Regional prices use the store's local tiers. | Same contents in every region. |
| **Decoy / ladder** | The `gems_1200` → `gems_2600` jump is small in price-per-gem, but crosses "two 10-pulls". | — |
| **Real-money echo** | In the EU/UK (and as an option elsewhere) gem prices show an approximate local-currency equivalent ("1,350 gems ≈ €9.99"). | Required by our reading of the 2025 EU CPC principles on in-game currencies. |

---

## 6. Soul Altar gacha math

### 6.1 Rules (as disclosed in-game)

These rules were re-checked against `summon` and `rollRarity` in `src/meta/economy.js` and match the build.

- Per-pull odds: **Common 60% · Rare 28% · Epic 10% · Legendary 2%.**
- **Legendary pity:** a visible counter. If pulls 1–59 since your last Legendary have none, pull 60 is a Legendary. The counter resets on any Legendary and carries over between sessions and between single and 10-pulls.
- **10-pull guarantee:** if a 10-pull contains no Epic or Legendary, its last result is upgraded to **Epic**. *Design decision:* the guarantee never upgrades to Legendary, so the disclosed 2% is the exact Legendary rate on every non-pity pull.
- Cost: 150 gems or 1 sigil per pull. 1,350 gems or 10 sigils per 10-pull (135 per pull).

### 6.2 Expected pulls to a Legendary

Let p = 0.02, q = 0.98, and N = the pull on which the first Legendary arrives. With hard pity at 60:

> P(N = k) = q^(k−1) · p for k = 1…59, and P(N = 60) = q^59
> **E[N] = Σ_{k=0}^{59} q^k = (1 − q^60) / p = (1 − 0.2976) / 0.02 = 35.12 pulls**

Without pity it would be 1/p = **50 pulls**. Pity cuts the average by 30% and the effective Legendary rate becomes 1/35.12 = **2.85%**. The standard deviation is 21.4 pulls. A Monte Carlo re-check that runs the build's own `summon` logic (400,000 simulated players, including the 10-pull rule) gives 35.18, within sampling error of 35.12, with 30.5% of players hitting pity.

| Pulls done | P(at least one Legendary) |
|---|---|
| 1 | 2.0% |
| 10 (one 10-pull) | 18.3% |
| 20 | 33.2% |
| 30 | 45.5% |
| 35 (median) | 50.7% |
| 40 | 55.4% |
| 50 | 63.6% |
| 59 | 69.6% |
| 60 | **100%** (pity) |

- **Median: 35 pulls.** 25th percentile: 15 pulls. **30.4%** of players hit the pity pull (q^59 = 0.3036).
- Players who buy only 10-pulls *purchase* on average 38.4 pulls (3.84 ten-pulls) before the batch that contains their first Legendary. The extra pulls in that batch are not wasted, because the pity counter carries on.

### 6.3 What a Legendary costs

| Measure | Gems | USD at `gems_1200` rate | USD at `gems_15000` rate |
|---|---|---|---|
| Expected, single pulls (35.12 × 150) | 5,268 | $43.86 | $35.12 |
| **Expected, 10-pull price (35.12 × 135)** | **4,741** | **$39.47** | **$31.61** |
| Worst case, 6 × 10-pull | 8,100 | $67.43 | $53.99 |
| Worst case, 60 singles | 9,000 | $74.93 | $60.00 |

### 6.4 Epics and the 10-pull guarantee

P(no Epic+ in 10 natural rolls) = 0.88^10 = 27.9%. Expected Epics per 10-pull = 1.0 + 0.279 = **1.28**, and expected Epic-or-better = **1.48**. The guarantee lifts the effective Epic rate from 10% to about 12.8%. Counting pity Legendaries (long-run Legendary rate 2.85%), a simulation of the build gives 1.24 Epics and 1.53 Epic-or-better per 10-pull. (If design ever let the guaranteed slot roll Legendary at the 10:2 Epic:Legendary weight, simulation shows expected pulls to Legendary would drop to ~31.5. That would also change the disclosed odds, so it is **not** our launch rule.)

### 6.5 Collection depth (why whales have somewhere to go)

| Chase | Legendaries needed | Expected pulls | Gems (at 135) | ≈ USD (150 gems/$) |
|---|---|---|---|---|
| Unlock Mordrake (10 shards; a Legendary gives 5 Mordrake shards a third of the time) | 6 | 211 | 28,580 | $191 |
| Mordrake first shard → 5★ (160 shards) | 96 | 3,372 | 456,800 | $3,045 |
| Osric, the same chase (5 shards a third of the time) | 6 / 96 | 211 / 3,372 | 28,580 / 456,800 | $191 / $3,045 |
| One of each of the 8 Legendary relic types (coupon collector, 8 × H₈) | 21.7 | 764 | 103,094 | $687 |
| One *specific* Legendary relic at Lv10 (10 copies, 1/8 chance each) | 80 | 2,810 | 379,321 | $2,529 |

Those depths are typical of the genre. They are also why §10's spending limits and the "power is never required for story" rule matter. The UI must never imply that maxing is expected.

---

## 7. Soul Pass economics

- 30 tiers × 500 XP = 15,000 XP per 28-day season. Daily quests give 220 pass XP a day and each run gives round(20 + T/6 + K/40 + 40 on a clear), about 80–210. A daily player (all quests, ~3 runs) earns ~700 XP/day and finishes in about 3 weeks, leaving a week of slack. A casual player (quests plus 1 run a day) reaches roughly tier 15–20.
- Nightmare and Torment runs give ×1.5 / ×2 pass XP, so an endgame player on Torment (~1,300 XP a day) can finish in about 12 days. That is the intended reward for mastery: the premium track's contents do not change, and the target that matters (60–70% of premium buyers reach tier 30) only gets easier. Watch for premium buyers who finish in week 2 and then stop playing; if that shows up, cap the difficulty bonus at Nightmare's ×1.5.
- **Free track (30 tiers):** 20,800 gold, 340 gems, 6 sigils.
- **Premium track ($9.99):** 1,140 gems, 12 sigils, 1 Epic relic (tier 10), 1 Legendary relic (tier 20), 25 Seraphine shards (S1: 10 at tier 10, 5 at tiers 5, 15 and 25), "Eclipse Vael" skin + 300 gems (tier 30). Premium unlocks retroactively. Buying on day 20 grants every premium reward already earned.
- **Honest value badge:** 1,140 gems + 12 sigils = 2,940 gem-equivalent, versus 1,200 gems for the $9.99 gem pack → **"2.4× the gems of the $9.99 pack"**, plus relics, shards and the skin, which we list but do not price.
- **Targets:** premium attach rate 5% of season MAU in Tier-1 markets. 60–70% of premium buyers reach tier 30. If completion falls below 55%, we raise XP rewards *during* the season, never later.
- Revenue per season per 100k MAU at 5% attach = 5,000 × $9.99 ≈ **$50k gross** (before store fees).
- *(Planned)* Catch-up tiers (100 gems each) unlock only in the final 7 days, so buying tiers never replaces playing for most of the season.

## 8. Soul Pact (30-day pass)

- Implemented as a **non-renewing 30-day purchase** (iOS non-renewing subscription; a Play one-time product with a server-side 30-day entitlement). Apple's auto-renew periods are calendar months, not 30 days. Non-renewing also removes any "forgot to cancel" complaint.
- Value: 300 + 30 × 100 = 3,300 gems for $4.99 (661 gems/$, 4.4× the best gem pack). The first daily 100 is granted with the purchase. In the build, the daily 100 gems are claimed from the Pact card (home screen or shop), and a day that is not claimed is lost. *(Planned: claims through the mailbox, and **unclaimed days carry over for up to 3 days** (grace), then expire.)*
- "Ad-free rewards": every rewarded-ad placement grants its reward instantly, with the same daily caps.
- The +20% gold applies to run gold only, not to quest, login or pass gold.
- *(Planned)* Reminders at 3 days and 1 day before expiry (in-game only; push only if the player opted in).

---

## 9. Rewarded ads (opt-in only, no interstitials, ever)

| Placement | Reward | Cap | Surface |
|---|---|---|---|
| Revive | Revive at full HP, 2.5 s invulnerability, a blast that deals 50% max HP to enemies within 8 m, with knockback | 1 per run (shared with the 60-gem revive) | Death screen (10 s) |
| Double run rewards | Run gold and gems granted again (stacks with Blood Moon's ×2) | 1 per run (Planned: 5 / day) | Results screen |
| Free daily summon | 1 single Soul Altar pull | 1 / day | Soul Altar |
| Energy refill | +10 energy | 3 / day | Energy popup |
| Daily free chest | 800–1,499 gold + 10 gems + 1 relic (Common 85% / Rare 15%; showing these odds is Planned) | 1 / day | Shop and home screen |
| Level-up reroll | Redraw the 3 cards | 1 per run | Level-up screen |
| **Global cap** | | **12 ads / day (Planned)** | |

- *(Planned)* No ad offer appears during the tutorial or in run 1. No ad offer appears within 30 s of a purchase. (Build: every placement is offered from the first run.)
- Soul Pact holders skip ads with the same caps.

**Ad revenue model.** Ad ARPDAU = impressions per DAU × eCPM ÷ 1,000. Rough industry ranges for rewarded video (they vary a lot by season, network and year; Q4 is highest): US iOS ~$15–$40, US Android ~$8–$25, Tier-2 ~$3–$10, Tier-3 ~$0.5–$3. **Target:** 2.0–3.0 rewarded impressions per DAU and ad ARPDAU of $0.03–$0.06 in Tier-1 markets. Ads monetise the 95%+ who never pay.

---

## 10. Benchmarks, targets and the LTV model

**Industry benchmark ranges** (approximate. Published figures from analytics vendors and ad networks vary by source, year, region and platform. These are context, not promises):

| Metric | Hybrid-casual | Midcore roguelite / survivor-like |
|---|---|---|
| D1 / D7 / D30 retention | 30–40% / 8–15% / 2–5% | 35–45% / 12–20% / 5–10% |
| ARPDAU (Tier-1) | $0.08–$0.25 | $0.25–$0.80 |
| Cumulative payer conversion by D30 | 1–3% | 2–5% |
| Monthly ARPPU | $10–$30 | $20–$60+ |
| CPI (US iOS / US Android / Tier-3) | $1.5–$4 / $0.8–$2.5 / $0.1–$0.4 | $3–$8 / $1.5–$4 / $0.2–$0.6 |

**SOULSWARM targets** (our goals for soft launch, not forecasts): D1 42%, D7 18%, D30 8%, ARPDAU $0.30 (75% IAP / 25% ads), D30 payer conversion 3%+. Minimum global-launch gates are in `MARKETING.md` §5.

**Illustrative LTV model.** Retention is a power curve fitted through D1, D7 and D30. LTV = (sum of retention over the horizon) × ARPDAU. Net assumes 75% of revenue is IAP after a 30% store fee, and ads are reported net.

| Scenario | D1 / D7 / D30 | ARPDAU | Active days per install (180 d) | LTV180 gross | LTV180 net |
|---|---|---|---|---|---|
| Weak | 32% / 10% / 3% | $0.12 | 5.2 | $0.62 | $0.48 |
| **Target** | 42% / 18% / 8% | $0.30 | 11.8 | **$3.55** | **$2.75** (≈$3.15 at a 15% fee) |
| Strong | 48% / 24% / 12% | $0.45 | 17.5 | $7.85 | $6.09 |

**What "millions" takes.** Suppose 10,000 installs a day for a year, 70% of them paid at a $2.50 blended CPI. That is about $6.4M of UA. In-year gross revenue under the same assumptions:

| Scenario | In-year gross | In-year net | UA spend | Outcome |
|---|---|---|---|---|
| Weak | $2.2M | $1.7M | $6.4M | Loses ~$4.7M before salaries. **Stop scaling.** |
| Target | $12.3M | $9.5M | $6.4M | Positive, but payback takes ~6+ months and needs cash to fund it. |
| Strong | $27.3M | $21.1M | $6.4M | A hit. Scale UA hard. |

The same game can land in any of those rows. Soft launch exists to find out which row we are in **before** spending the money (`MARKETING.md` §5). Apple's Small Business Program and Google's first-$1M tier cut the store fee to 15%, which helps a small studio's margins but does not rescue a weak scenario.

---

## 11. Fairness and compliance guardrails

*This is a design summary, not legal advice. Each item gets a legal review before soft launch and again before entering each new market.*

| Area | Requirement | How SOULSWARM complies |
|---|---|---|
| **Apple App Review 3.1.1** | Digital goods use In-App Purchase. Apps offering loot boxes or other randomised paid items must disclose the odds of each item type *before* purchase. | All SKUs go through StoreKit. Odds, pity counter and the 10-pull rule are shown on the Altar screen and on an "Odds" page one tap away, before the confirm button. Odds are also published on our website. |
| **Apple non-renewing purchases** | Non-renewing subscriptions must be available on all the user's devices. | Soul Pact is tied to the cloud-save account, and restore works on every device. |
| **Google Play Payments policy** | Play Billing for digital goods. Loot-box odds disclosed in advance of, and close to, the purchase. | Same odds UI on Android. Play Billing via RevenueCat. |
| **Belgium** | The Belgian Gaming Commission (2018) treats paid loot boxes as games of chance under the Gaming Act, which requires a licence. | **BE mode** (by store country plus account region): gems cannot buy Altar pulls. Sigils exist only from free sources. The Starter Pack and premium Soul Pass swap their sigils for fixed, named relics. |
| **Netherlands** | The KSA (2018) found loot boxes with *transferable* items unlawful. The Council of State (2022, EA case) overturned a fine, but political pressure for an EU-level ban continues. | Nothing is tradeable, transferable or cash-out-able. BE mode can be switched on for NL by remote config if the law changes. |
| **Other markets** | South Korea: mandatory probability disclosure (2024). China: disclosure and minor-play limits. Japan: "kompu gacha" (complete-the-set prizes) banned. Australia: paid loot boxes get a minimum M classification (2024). UK: industry loot-box principles (parental consent for under-18s, odds disclosure). Brazil: 2025 child online-safety law restricts loot boxes for minors. | Odds everywhere. No set-completion prizes. Under-18 loot-box purchase blocks where required. China is not a launch market. |
| **EU consumer law** | The 2025 CPC Network principles on in-game virtual currencies: show real-money equivalents, do not exploit minors, give clear pre-contract info. | Approximate local price next to gem costs in the EU/UK. Clear pack contents. No pressure tactics. |
| **COPPA (US) / GDPR-K (EU)** | Under-13s (US) and under the local digital consent age (13–16, EU) need verified parental consent before personal data is collected. Ad SDKs must respect child status. | **Neutral age gate** before any SDK starts. Under the threshold → restricted mode: no IAP surfaces, no personalised ads (child-directed flags set in AppLovin MAX), no IDFA/GAID, preset names only on leaderboards, analytics without advertising IDs. Store target audience is 13+, so we do not opt into the Families programme. |
| **Spending limits** | Brief: confirmation on every purchase; parental controls and an age gate in production. | Every purchase and every gem spend of 150+ gems has an in-game confirm before the OS sheet. **Under 16 (self-declared): $50/month cap. 16–17: $100/month cap.** Optional self-set daily/weekly/monthly limits for everyone; lowering a limit is instant, raising one takes 24 h. Parental PIN for purchases. Spend history in Settings. A non-blocking well-being check-in after $500 in 30 days. |
| **Dark-pattern avoidance** | The FTC's 2022 Epic Games settlement ($245M in refunds) set a clear bar on misleading purchase flows. | No fake timers, no secret timer resets, no confirm-shaming, no pre-ticked boxes, no forced or interstitial ads, no "pay to beat this boss" prompts. Refunds are handled by the stores. Refunded gems are clawed back (the balance can go negative). There are no bans for a first chargeback. |
| **Odds integrity** | Odds must not vary by player, spend or segment. | Rolls happen on the server with an audited RNG. Odds are never A/B tested. Pity state is stored on the server. (Planned for production; the prototype rolls and stores pity on the device.) |

---

## 12. Economy telemetry and red flags

| Metric | Red flag | Response |
|---|---|---|
| Median gems held, D30+ players | > 10,000 and rising | Sinks too weak or sources too generous. Add an event summon banner. |
| Share of players hitting Legendary pity | Far from 30.4% | RNG or logging bug. Investigate immediately. |
| Starter Pack conversion (of players shown it) | < 4% | Check the trigger moment and value framing, not the price (the price is fixed). |
| Soul Pass premium completion | < 55% | Raise pass XP mid-season. |
| Revenue share from the top 1% of payers | > 60% | Strengthen the dolphin offers (Pact and Pass value). |
| Refund rate | > 2% of transactions | Audit purchase confirmation and offer clarity. |
| Rewarded-ad opt-in (share of DAU who watch ≥1) | < 25% | Improve placement value. Never add forced ads. |
