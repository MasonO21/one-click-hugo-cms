# Tiny Tides — game design document

## 1. One-liner
A cozy, kawaii idle game about a pocket tidepool you check a few times a day. **You arrange rocks, plants and water; the creatures that wash ashore evolve into different forms depending on the habitat you built.**

## 2. Design pillars
1. **Arrangement is the game.** The only "skill" is spatial and readable: place things, see numbers move, get a different creature. No timing tests, no fail states.
2. **Sessions of 30–90 seconds, 3–6 times a day.** Everything has a reason to be visited on a rhythm: bubbles fill, tide gifts arrive morning/afternoon/evening, evolutions finish overnight.
3. **Show, don't gate.** The Tidedex shows silhouettes and exact requirements for every form. Mystery is *which* form you'll get, never *how the system works*.
4. **Visual delight for a young audience.** Sticker-style kawaii art (thick plum outlines, glossy highlights, big shiny eyes), pastel/neon palettes, a real-time day-night sky and moon phases, juicy pops/ripples/confetti.
5. **Kind monetization.** No ads, no accounts, no tracking, nothing random for sale. Money buys *time* and *self-expression*, never power that can't also be earned.

## 3. Audience
Players roughly 9–30 who like collecting and decorating (Neko Atsume, Animal Crossing, Tamagotchi-likes, idle "check-in" games). Rated 4+, but built to appeal to teens and young adults: sharable pictures, cute puns, rare "mythic" forms.

## 4. Core loops
| Loop | Length | What the player does | Why they come back |
|---|---|---|---|
| Moment | 5–15 s | Tap a bubble → pearls pop with chained combo sounds; pet a creature | Tactile, satisfying (audio + haptics) |
| Session | 30–90 s | Collect, spend pearls (level-up / build), start an evolution, open a Tide Gift | Always something affordable to do |
| Day | 3–6 sessions | Morning/afternoon/evening Tide Gift, 3 daily quests, daily reward streak, bubbles fill | Bubbles cap at 4–12 h so check-ins matter, but never punish |
| Week+ | days | Discover new forms, expand the pool (5×6 → 7×9), unlock rocks/families by Pool Level, complete Tidedex milestones, buy decor | 70 forms + collection bonus (+1% pearls each) |

## 5. Systems
**Habitat traits** — every tile has six values (0–100) from a 13-tile neighbourhood kernel: *Stone, Depth, Calm, Green, Warmth, Glow*. Pieces and water levels each add to traits (e.g. Ember Rock = Stone 0.5 + Warmth 1; Glow Kelp = Green 1 + Glow 0.5). The player sees the six bars for any creature and the tiles that count.

**Creatures** — 10 families × 7 forms = **70** (42 Tidepool + 28 Deep Ocean). Baby → 3 branch forms (need branch trait ≥ 30 and it must be the strongest) → 3 mythic forms (main trait ≥ 65 **and** a secondary trait ≥ 30). Branches map to different rocks (Stone / Green / Warmth / Glow / Depth / Calm), so one family teaches the player to build in 3 different ways.

**Spawning** — an egg washes in every ~25 min (faster on Spring Tide) if the pool has room. The family and tile are chosen by habitat suitability, so *the layout attracts species*. The starter crab always has a floor chance so the player can never soft-lock.

**Idle economy** — creatures produce pearls/hour: Baby 24 · Evolved 80 · Mythic 260, ×(1 + 0.15 per level) × happiness (0.7–1.3, from how well the habitat matches what the species likes) × Tidedex bonus × Pool-level bonus × boosts. Pearls sit in a bubble over each creature up to a cap of `4h + 0.5h × (PoolLv−1)` (max 12 h). Offline progress is computed exactly, in order, including eggs and evolution completions.

**Sinks** (so pearls stay meaningful for months): level-ups (geometric), evolution fees (80 → 4 000), pool expansions (400 → 25 000), rocks/plants, decor. Late game stage-3 level 20 costs ~2.8 M per creature.

**Timers & speed-ups** — Baby→Evolved 2 h, Evolved→Mythic 10 h (start before bed). Skip = 1 Sea Glass per 15 min remaining; Speed Tokens (earned) each shave 1 h; Golden Hourglass = −25 % forever + 1 free finish/day. The very first evolution is 15 seconds so the tutorial pays off immediately.

**Time-of-day and moon** — the sky follows the device clock (dawn, day, dusk, night with stars), and the moon phase is real. New and full moons trigger *Spring Tide* (+25 % pearls, eggs 40 % faster).

**Tide Gifts / quests / streak** — 3 gift windows per day (morning 5–12, afternoon 12–18, evening 18–5); 3 daily quests from 8 templates (+ bonus chest); 7-day login track with a forgiving *streak shield* that saves one missed day per week.

**Progression** — Pool Level (XP from discoveries, evolutions, level-ups, quests) unlocks pieces (Kelp 2, Mossy 3, Ember 5, Pearlite 6), families (Snail 2, Starfish 3, Seahorse 4, Jelly 5, Octopus 7), deep-water digging (4) and expansions.

## 6. Onboarding (≈2–3 minutes, 100 % scripted by state, not by timers)
Dig 2 tiles → place a rock → an egg washes in → hatch (3 taps) → pop the first bubble → level to 3 → place rocks until Stone ≥ 30 → Evolve (15 s) → reveal + "NEW DISCOVERY" → Pool Level-up → notification ask → daily reward. Every step has a highlighted target, a Blip mascot line and a one-tap "Skip tips".

## 7. Monetization
| Product | Type | Price | Notes |
|---|---|---|---|
| Sea Glass 60 / 330 / 700 / 1500 | Consumable | $0.99 / 4.99 / 9.99 / 19.99 | Speed-ups + premium decor; +10/16/25 % bonus ladder |
| Starter Bundle | Non-consumable, one-time | $2.99 | 200 glass + Party Hat + Bubblegum skin — the classic first-purchase bridge |
| Golden Hourglass | Non-consumable | $4.99 | Permanent −25 % evolution time + daily free finish (the "speed-up" pass) |
| Sakura / Neon / Pool Party packs | Non-consumable | $2.99 each | **Cosmetic only** (skin, props, hats, effects) |
| **Deep Ocean biome** | Non-consumable | $7.99 | Premium second habitat: 28 creatures, trench/vents/glowstone/bio-kelp, its own sky, 1.7× pearl rate, 50 glass |

Principles: no ads and no rewarded-video; no random paid rewards (Apple 3.1.1 odds rules are trivially satisfied); everything sold with real money is also reachable free through play (glass from quests/gifts/discoveries ≈ 15–25 per day), except cosmetic bundles and the biome; restore purchases everywhere; no dark patterns (no fake timers, no purchase pop-ups mid-tutorial, one-time offers are real).

Expected purchase funnel: Starter Bundle (D1–D3) → Hourglass or decor pack (D5–D14) → Deep Ocean (D14–D45, after the first Tidepool mythic).

## 8. Balance evidence (`npm run balance`)
Scripted player with 4 check-ins/day (one family only, optimal arrangement): first Evolved creature < 1 day, first mythic on day 5–7, Pool Lv 9 on day 7, Lv 14 by day 60, pearls never pile up (bot stays at 20–100 k with sinks available). With 2 check-ins/day the first mythic arrives ~3 days later — the game genuinely rewards "a few times a day" without punishing fewer. A real player spreading across 6 families takes several weeks for the Tidepool Tidedex and longer for the Deep Ocean.

## 9. Retention hooks (ethical)
- **D1:** finish the tutorial (guaranteed evolution), daily reward, first Tide Gift, "egg in 6 minutes" promise, optional reminder.
- **D3:** the next family unlocks (Snail L2, Starfish L3) — a *new habitat puzzle*; Starter Bundle offer.
- **D7:** first mythic attempt (needs two traits), 7-day reward with a Speed Token + glass, Tidedex milestone (15).
- **D30:** Deep Ocean upsell (after the first mythic), pool at 7×8, decor collecting, seasonal packs.
- **Reminders:** ≤ 3 per day, never 21:30–08:00, only for things that are real (gift arrived / evolution done / bubbles ≥ 90 %).

## 10. Roadmap after launch (cheap to add: rows in `data.js` + a drawer in `art_creatures.js`)
1. Seasonal decor packs & limited (but *earnable*) events tied to real dates and moon phases.
2. New families (Otter-ray? Sea-bunny nudibranch, Hermit-lantern) and a third biome (Coral Reef).
3. Friends' pools (asynchronous visiting via Game Center) — requires updating the privacy label.
4. Widget / Live Activity showing "bubbles ready" and the next Tide Gift.
5. Gentle mini-goals ("Build a habitat with Stone 80, Glow 40") for players who finish the Tidedex.

## 11. Risks & mitigations
| Risk | Mitigation |
|---|---|
| Shallow content after 2 weeks | 70 forms, mythic requirements, expansions, decor sinks; roadmap items above |
| Clock cheating | Single-player; only skips timers; no server economy to protect |
| Notification fatigue | Hard cap, quiet hours, opt-in after the first evolution |
| "Web wrapper" review concern | Native haptics, StoreKit 2, local notifications, share sheet, offline; real game depth |
| Client-side purchase trust | Cosmetic/idle only; add server-side receipt validation before selling competitive advantages |
