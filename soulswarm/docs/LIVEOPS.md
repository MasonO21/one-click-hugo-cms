# SOULSWARM: Live Ops Plan (Year 1)

**Status:** v1.0 · **Owner:** Live Ops Producer + Lead Game Designer · **Source of truth:** `DESIGN_BRIEF.md`
**Assumed global launch:** Monday 14 June 2027 (see `PRODUCTION_ROADMAP.md`). If launch moves, the calendar shifts with it. Seasons are always 28 days and always start on a Monday at 00:00 UTC.
**Implementation status:** mostly **Planned**. The prototype build has the daily layer (6 rotating daily quests, the 7-day login, the Daily Trial, energy, rewarded-ad placements), the weekend **Blood Moon** and the **weekly quest chest**, the **Nightmare** and **Torment** difficulties (pulled forward from S4 and S12, GDD §8.2), one Soul Pass season ("Season I: The Waking Legion" in `data.js`) and the Soul Pact. The **Boss Rush** ("The Hollow Court", GDD §8.3) is in the build too: it runs every week, Tue–Thu UTC, so it can be played and tuned (live it runs once per season, as below), with daily tries and milestones but no leaderboard yet. Endless leaderboards, holiday events, Covens and Legion Raids do not exist yet. Gameplay numbers below follow the build (`GDD.md`).

---

## 1. Cadence at a glance

| Rhythm | Content | Source in brief | New content needed? |
|---|---|---|---|
| **Daily** | 6 daily quests, 7-day login calendar, rewarded-ad rewards, energy | Daily quests, login, ads | No (config) |
| **Weekly** | **Blood Moon** weekend (2× elites, 2× rewards). **Endless Abyss** weekly leaderboard. Weekly quest chest. | Weekly event, Endless Abyss weekly | No (config) |
| **Every 28 days** | **Soul Pass season** (30 tiers, new theme, new premium skin) | 28-day Soul Pass season | Yes |
| **Monthly (once per season)** | **Limited Boss Rush** (72 h) | Monthly limited boss rush | Light (new modifiers / variant) |
| **Every 1–2 seasons** | **New hero** (Shepherd), shipping with its Rite, its Ascended Rite and a fresh 10-rank Hero Mastery track (GDD §11.2) | New hero every 1–2 seasons | Yes (heavy) |
| **Every season** | **A new Grimoire page** (GDD §4.9): a run-start boon with a price, unlocked by a new account goal or as a free Soul Pass reward (never sold, so the blank page stays a fair choice). Launch has 8 (Update 7, 2026-10-10) | Long-term goals, run variety | Light (1 painting, 1 hook) |
| **Holidays and seasons** | **A themed Soul Urn offering** (GDD §4.10): a limited extra offering in the urn loot table for an event (a pumpkin lantern that drops candy gold at Halloween, say), or a reweighted table for a Blood Moon weekend. Launch has 7 offerings (Update 8, 2026-10-10) | Run variety, event flavour | Light (1 pickup colour, 1 effect) |
| **Every 2 seasons** | **A new Soul Union** (GDD §7.4): a fifth for Necropolis first, then pairs across the roster as new weapons ship; one painted icon and one synergy each. Launch has 4 (Update 10, 2026-10-10) | Late-run build goals, Endless depth | Light (1 icon, 1 synergy) |
| **Every 2–3 seasons** | **New foes**: a pair of horde foes with new AI, Bestiary entries (3 milestones each) and risen minion forms, and weapon upgrades alongside (Update 5, "The Deepening Horde", 2026-10-09: the Grave Wraith and the Corpse Priest; GDD §5) | Bestiary growth, horde variety | Yes (medium: 2 paintings, 2 models, AI) |
| **Every 3–4 seasons** | **A new act** (GDD §8.4): five chapters in a new realm (two painted floors, three props, weather), its ground hazard, its foe and its finale boss, with the earlier bosses returning under its epithet. Launch has six acts, 30 chapters (Update 13, 2026-10-10); the late acts are paced so most players reach the newest one about when the next ships | The campaign's long tail | Yes (heavy: about 450 Higgsfield credits of art and 3–4 engineer-weeks per act) |
| **Holidays** | Halloween, Winter, Lunar New Year, Spring, Anniversary | — | Medium (reskins + event track) |
| **Roadmap features** | Clans ("Covens"), co-op **Legion Raids**, difficulty tiers beyond Torment | Clans and Legion Raids on roadmap (Nightmare and Torment are in the build) | Yes (heavy) |

### Weekly rhythm (UTC)

| Day | What happens |
|---|---|
| Mon 00:00 | Endless Abyss weekly board resets; last week's league rewards land in the mailbox. In-season weeks 1 and 3 get a fresh quest-chest theme. |
| Tue–Thu | Quiet days. In week 3 of each season the **Boss Rush** runs Tue 00:00 – Thu 23:59. |
| Fri 00:00 – Sun 23:59 | **Blood Moon**: elites ×2 (8 per chapter run instead of 4), all run rewards ×2. The sky and fog turn red and an App Store In-App Event / Play promotional card goes live. |
| Sun 20:00 | "Last chance" in-game banner for the leaderboard. Push only if the player opted in. Never more than 1 push per day. |

---

## 2. Twelve-month calendar (Seasons 1–13)

| Season | Dates (2027–28) | Theme | New hero | Boss Rush variant (week 3) | Holiday / special event | Feature drop |
|---|---|---|---|---|---|---|
| **S1** | 14 Jun – 11 Jul | **The Waking Legion** (launch) | — (launch roster: Vael, Nyx, Seraphine, Mordrake) | *Hollow Court*: the five chapter bosses back-to-back | Launch week: 2× login rewards for 7 days | Global launch. Premium pass skin: **Eclipse Vael** |
| **S2** | 12 Jul – 8 Aug | Embers of Midsummer | **Liora Bellwraith** (Epic) | *Ember Gauntlet*: burning ground in every chapter | Summer weekend: Blood Moon extended to 4 days | Endless Abyss leagues v2 (6 leagues) |
| **S3** | 9 Aug – 5 Sep | The Drowned Choir | — | *Tidal Gravemaw*: slams leave water that slows | — | Hero loadout presets; replay sharing (10 s clip) |
| **S4** | 6 Sep – 3 Oct | Bone Abbey | **Osric the Bone Abbot** (Legendary) | *Ossuary Rush*: Skull Halo pre-equipped for all | — | **Nightmare difficulty** (Ch1–5 remix; already in the prototype build, so S4 is its launch announcement). **Relic Ascension** (gold sink; also already in the prototype build, Update 11, GDD §12.1) |
| **S5** | 4 Oct – 31 Oct | Harvest of Souls | **Grimsby Lanternjaw** (Epic) | *Pumpkin King*: Gravemaw in a jack-o'-lantern crown | **Night of a Thousand Souls** (Halloween, 21–31 Oct) | Halloween cosmetics (minion tints, gate skins) |
| **S6** | 1 Nov – 28 Nov | The Hollow Court | **Isolde, the Crimson Countess** (Legendary) | *Court of Echoes*: 3 Gravemaw Echoes at once | Harvest weekend (Black Friday, 26–28 Nov). Honest bundles only, see §4.5. | **Clans ("Covens")**: 30 members, coven chat with filters, coven quests |
| **S7** | 29 Nov – 26 Dec | Frostfall Vigil | **Sigrun Frostveil** (Epic) | *Gravemaw in Ice*: frozen arena, ice patches | **Frostfall Vigil** winter event (17 Dec – 2 Jan) | Winter map variant of Ch3 |
| **S8** | 27 Dec – 23 Jan | Year of the Abyss | — | *Abyss Marathon*: 10-minute Endless sprint | New Year login calendar (31 Dec – 6 Jan) | **Endless Abyss Season ranks** (ranked divisions across 2 seasons) |
| **S9** | 24 Jan – 20 Feb | Lantern Legion | **Kaida Emberfang** (Legendary) | *Lantern Dance*: bullet rings form lantern patterns | **Lunar New Year** (from 26 Jan); **Bound Souls** Valentine weekend (12–14 Feb) | Coven gifting (sigils to coven mates, capped) |
| **S10** | 21 Feb – 19 Mar | The Thorned Choir | — | *Thorn Crown*: reflected damage modifier | — | **Legion Raids v1** (asynchronous co-op): covens fight a shared raid boss over 3 days |
| **S11** | 20 Mar – 16 Apr | Rebirth of Ash | **Thessaly of the Thorn** (Rare) | *Spring Reaping*: double gates | Spring event (around Easter, 16 Apr) | New-player boost for returning and lapsed players |
| **S12** | 17 Apr – 14 May | Torment | — | *True Form*: Gravemaw with a 4th phase | — | **Torment difficulty** (already in the prototype build, so S12 is its launch announcement). Legion Raids v2 (real-time 2-player co-op, beta) |
| **S13** | 15 May – 11 Jun | The First Shepherd | **Malachar, the First Shepherd** (Legendary) | *Shepherd's Trial*: every hero's signature weapon is available | **Anniversary** (7–20 Jun 2028, runs into S14) | Year-2 roadmap reveal |

**Hero cadence check:** new heroes in S2, S4, S5, S6, S7, S9, S11 and S13. That is 8 heroes in 13 seasons, and the gap is never more than 2 seasons (matches "a new hero every 1–2 seasons").

### 2.1 Year-1 heroes

| Hero | Rarity | Signature weapon | Passive | How to get |
|---|---|---|---|---|
| Liora Bellwraith | Epic | Grave Pulse | Pulse-struck foes stay close and rise at ×2 Raise Chance for 3 s | **In the build** (pulled forward from S2): Epic Altar rolls. Planned for S2: featured banner + S2 premium pass (10 shards) |
| Osric the Bone Abbot | Legendary | Skull Halo | Starts each run with 20 minions; Skull Halo kills rise ×2. Rite: **Bone Mass** | **In the build** (pulled forward from S4, 2026-10-08): Legendary Altar rolls (5 shards). Planned for S4: featured banner |
| Grimsby Lanternjaw | Epic | **Witchfire Lantern** (a lantern that leaves burning trails; evolves into Hallow Pyre) | +N gates give 25% more; witchfire kills rise ×1.5. Rite: **Hallowfire** | **In the build** (pulled forward from S5, 2026-10-08): Epic Altar rolls (5 shards). Planned for S5: Halloween event track (10 shards free) + banner |
| Isolde, the Crimson Countess | Legendary | Soul Leech (one more drain beam) | What her beams slay always rises. Rite: **Crimson Sabbath** (binds and blood-marks every foe within 7 m: the marked rise when they fall) | **In the build** (2026-10-10, ahead of S6): Legendary Altar rolls (5 shards). Planned for S6: featured banner, with *Court of Echoes* as her launch Boss Rush |
| Sigrun Frostveil | Epic | **Rime Shards** (new: freezing shards that shatter) | Frozen enemies have +15 pp Raise Chance | S7 premium pass + banner |
| Kaida Emberfang | Legendary | **Fox-Fire Fans** (new: boomerang fans) | Minions leave fox-fire trails (10 DPS) | Featured banner shards |
| Thessaly of the Thorn | Rare | **Thorn Whip** (new: long line attack) | +15% max HP; reflects 10% of contact damage | Free via S11 event track; banner |
| Malachar, the First Shepherd | Legendary | **Shepherd's Crook** (new: pull-and-slam) | Soul Gates' × values +0.5 | Featured banner shards |

**Banner rule:** when a featured hero is live, their shards replace the standard hero shards on Legendary rolls (Mordrake/Seraphine/Osric/Isolde) or Epic rolls (Nyx/Seraphine/Liora/Grimsby) for that banner only. The banner screen shows exactly which shards each rarity gives. Odds (60 / 28 / 10 / 2), the 10-pull guarantee and the 60-pull pity are identical on every banner. Pity carries over between banners.

**Power-creep rule:** a new hero may be best in one niche but must not beat the launch Legendary (Mordrake) on overall power by more than 5% at equal stars. Balance sims must pass before content lock.

---

## 3. Event specifications

### 3.1 Blood Moon (weekly)

- **When:** every Fri 00:00 – Sun 23:59 UTC (72 h).
- **Effect:** elites ×2 (8 per chapter run instead of the build's 4), all run rewards ×2 (stacks with the rewarded-ad double, so up to ×4 gold).
- **Why:** it gives weekends a reason to play and supplies extra Relic Chests, which make better builds and more evolutions. It costs no new art: it is a red sky preset, an audio filter and config.
- **Guardrail:** Blood Moon must not raise difficulty past the player's current chapter. Elite HP stays at 6× normal.
- **With Nightmare and Torment:** Blood Moon stacks on top of the difficulty the player chose (8 elites plus 2 or 4, rewards ×2 on top of the difficulty's ×1.75 / ×2.5 gold). The one-time difficulty first-clear gems are never doubled. A Torment Blood Moon weekend is the endgame's best gold farm by design; watch the D60+ gold balance (MONETIZATION §2.1).

### 3.2 Boss Rush (monthly, limited)

- **When:** week 3 of each season, Tue 00:00 – Thu 23:59 UTC (72 h).
- **Format:** the five chapter bosses in a row (Gravemaw → Vesperine) at Ch1→Ch5 scaling with the season's modifier. The player starts as a campaign player stands at a boss (Lv20, a veteran build, a legion of 70) and picks 4 powers at a War Council, then gets one Relic Chest pick between bosses. 3 free attempts per day (then one more per ad, as many as wanted), no energy cost. *(Build: GDD §8.3; the first design's Lv10 and 30 minions let a Chapter 5 player beat one boss of five.)*
- **Leaderboard:** fastest total clear time, in groups of 100 players matched by power.
- **Rewards:** milestone track (bosses beaten) gives sigils, gems and featured-hero shards. Rank rewards give an exclusive **legion banner** cosmetic (top 10%) and gems. Cosmetic only, never power-exclusive.

### 3.3 Endless Abyss weekly leagues

- **When:** Mon 00:00 – Sun 23:59 UTC. Score = best single run (time survived, kills as tie-break).
- **Structure:** 6 leagues (Bone → Ember → Frost → Void → Crimson → Abyssal), groups of 50. Top 10 promote, bottom 10 demote (Bone cannot demote).
- **Rewards (per week):** 50–500 gems and 1–5 sigils by league and rank. Abyssal players who finish in the top 10 of their group earn **2 Mordrake shards**.
- **Integrity:** runs are validated on the server (plausibility checks). Every top-100 run per region is replay-verified before rewards are paid (`PRODUCTION_ROADMAP.md` §5). Suspicious scores are held, not silently deleted, and the player is told.

### 3.4 Holiday events (template)

| Element | Spec |
|---|---|
| Duration | 10–14 days |
| Event map | A reskin of an existing chapter (new palette, props, enemy hats/skins). No new enemy AI. |
| Event track | 20 milestones earned with event points from runs (1 point per 10 kills + 25 for a boss kill). Free rewards include sigils, gems and that event's hero shards (when the event hero is free). |
| Event shop | None. There is no extra currency and no exchange shop, which keeps the currency list exactly as in the brief. |
| Cosmetics | 1 legion tint + 1 gate skin, earned free on the track. 1 hero skin in the premium pass of the overlapping season. |
| Store presence | App Store In-App Event and Google Play promotional content, submitted at least 2 weeks ahead. |

### 3.5 Commercial event rules (Black Friday, holidays)

- Event bundles use existing price points ($4.99 / $9.99 / $19.99). Their value badge is computed against the `gems_80` base rate, the same as everyday packs.
- No "was $X, now $Y" pricing. No fake countdowns. A bundle's end time is the real end time and is shown from the start.
- Bundles are capped at 1 purchase each, and they respect players' spending limits.

---

## 4. Content pipeline

### 4.1 Release trains

- **Binary (store) update:** every 4 weeks, submitted 10 days before season start to leave time for store review. Hotfix binaries only for crash or payment bugs.
- **Server and config content:** weekly. Blood Moon, Boss Rush modifiers, quest sets, banners, pass rewards, event tracks and tuning all ship through remote config and backend data with no store review.
- **Buffer:** the S1–S3 content must be complete (art, config, localised) before global launch. After launch we keep a rolling **2-season buffer**.

### 4.2 Season production timeline (T = season start)

| When | Milestone | Owner |
|---|---|---|
| T−12 wks | Theme lock, hero concept, Boss Rush modifier pitch | Design + Art lead |
| T−10 wks | Hero kit spec and balance sim. Pass reward table. Economy review (gem inflow vs sinks). | Design + Economy |
| T−8 wks | Art production starts: hero model and animation, skin, VFX, pass key art | Art |
| T−6 wks | Implementation (weapon code, AI, UI), first playable | Engineering |
| T−4 wks | **Content lock.** Strings to localisation (10 languages). Store assets brief. | Producer |
| T−3 wks | QA pass, device matrix, balance sims (hero ≤ +5% power rule) | QA + Design |
| T−2 wks | Binary submitted (if code changed). In-App Event / promo content submitted. | Engineering + Marketing |
| T−1 wk | Trailer and UA creatives live in test. Community teaser. | Marketing |
| T−0 | Season goes live (Mon 00:00 UTC) through config switch | Live Ops |
| T+1 wk | Post-mortem: KPIs vs forecast, tuning patch | Whole team |

### 4.3 Per-season content budget (steady state)

| Item | Count per season | Approx. effort |
|---|---|---|
| Soul Pass (30 tiers, key art, skin) | 1 | 3 artist-weeks + 1 design-week |
| New hero (model, kit, weapon, VO lines) | 0.5–1 | 6–8 artist-weeks + 3 engineer-weeks |
| Boss Rush variant (modifier + arena tint) | 1 | 1 design-week + 1 engineer-week |
| Blood Moons | 4 | Config only |
| Holiday event (when scheduled) | 0–1 | 3–4 artist-weeks + 1 design-week |
| New act (5 chapters, realm, hazard, foe, boss) | 0.25–0.33 | 4 artist-weeks + 3–4 engineer-weeks + a balance pass |
| Feature drop | Every 2 seasons | 4–12 engineer-weeks |

### 4.4 Incident playbook

- **Sev-1** (payments, data loss, progression blocker): on-call engineer within 30 min, a status message in-game within 1 h, compensation (gems/energy) announced once the issue is fixed.
- **Sev-2** (an event is broken): fix or pause the event and extend it by the downtime.
- Compensation is always a *make-good*, never a bait for spending.

---

## 5. KPI dashboard

Data flow: client and server events → Firebase Analytics → BigQuery (daily export plus streaming) → dashboards. Alerts go to the team channel at 09:00 UTC daily.

**Client events in the build (taxonomy v1, Update 14; `ANALYTICS` in `data.js`, GDD §19).** Recorded only with the player's consent, with only the listed properties, queued on the device until the SDK's transport is plugged in. Every event carries the random player ID, a session id, a sequence number and the trusted time.

| Event | Properties | Feeds |
|---|---|---|
| `session_start` | returning, days since install, level, chapter reached | DAU, D1/D7/D30, stickiness |
| `age_gate` · `consent` | band · analytics, ads, where (first, policy, settings) | consent rates (no birth year is ever sent) |
| `tutorial_start` · `ftue_complete` | — · skipped, time | FTUE completion |
| `run_start` · `run_end` | mode, chapter, act, difficulty, hero, page, Blood Moon, level · victory, time, kills, level, peak legion, boss kills, boss, death minute, first clear | runs per DAU, clear rates, death-minute heatmap, act progress, Nightmare / Torment uptake |
| `chapter_unlock` | chapter, act | act progress |
| `card_pick` | id, level, kind | skill pick rates |
| `purchase` · `purchase_blocked` | sku, USD, first · sku, reason (age, cap) | ARPDAU (IAP), conversion; restricted-mode and spend-cap hits |
| `ad_reward` | placement, completed, personalised | ARPDAU (ads), ad engagement |
| `altar_pull` · `hero_upgrade` · `talent_up` · `relic_ascend` | count, pay with, Epics, Legendaries · hero, stars, unlocked · talent, level · type, rarity, stars | economy sinks (`MONETIZATION.md` §12) |
| `quest_claim` · `bestiary_claim` · `screen_view` | quest · id, tier · screen | retention loops, navigation |
| `save_transfer` | direction (export, import) | how often players move devices (cloud-save priority) |

| Area | Metric | Definition | Target | Alert if |
|---|---|---|---|---|
| Acquisition | Installs (paid / organic) | Daily first opens by source | Organic ≥ 30% | Organic < 20% |
| | CPI | UA spend ÷ paid installs, by network and country | See `MARKETING.md` §5 | +25% week-on-week |
| | IPM | Installs per 1,000 ad impressions | ≥ 30 | < 15 |
| Retention | D1 / D7 / D30 | Share of an install cohort active on day N | 42% / 18% / 8% | D1 < 38% for 3 days in a row |
| | FTUE completion | Share reaching `ftue_complete` | ≥ 85% | < 80% |
| | First real run started | Share reaching `run_start` (Ch1) | ≥ 80% | < 75% |
| Engagement | DAU / MAU | Stickiness | ≥ 20% | < 15% |
| | Runs per DAU · minutes per DAU | | 4.0 · 32 min | −15% week-on-week |
| | Chapter clear rates | Share of attempts that kill the chapter's boss, per chapter | Ch1 70%, Ch2 55%, Ch3 45%, Ch4 35%, Ch5 25% | ±10 pp from target |
| | Act progress (Update 13) | Share of D30 / D60 / D90 players who have reached each act (GDD §8.4) | Act II 60% of D30; Act III 35% of D60; Act IV+ 20% of D90 | A chapter where more than 30% of arrivals stall for 2+ weeks (a wall) |
| | Act chapter clear rates | Per chapter, as above; an act's first chapter and finale the hardest | 30–50% (finales 20–35%) | ±10 pp |
| | Death-minute heatmap | Distribution of death time per chapter | Peak at 4:30–6:00 | Peak before 2:30 (unfair spike) |
| | Nightmare / Torment uptake | Share of D30+ players with a Nightmare clear · Torment clear; share of their runs on each tier | 40% · 15%; 50%+ of D30+ runs above Normal | < 20% Nightmare (too hard or unseen) |
| Gameplay | Skill pick rates | Share of offers taken, per card | No card < 10% or > 60% | Outside the band |
| | Gate "correct" rate | Share choosing the higher-value gate | 65–80% | > 90% (too easy) or < 50% (unclear) |
| | Novas per run | | ~6–7 per Ch1 clear (the build's 300-kill meter; GDD §4.4) | < 2 |
| Monetization | ARPDAU (IAP / ads) | Revenue ÷ DAU | $0.30 ($0.22 / $0.08) | −20% week-on-week |
| | Payer conversion D7 / D30 | Cumulative share of installs who paid | 1.5% / 3% | D7 < 1% |
| | ARPPU (30 d) | | $25+ | — |
| | Starter Pack conversion | Buyers ÷ players shown | ≥ 6% | < 4% |
| | Pass attach / completion | Premium buyers ÷ MAU · share reaching tier 30 | 5% / 60–70% | < 3% / < 55% |
| | Soul Pact holders | Active 30-day Pacts ÷ DAU | 2% | — |
| | ROAS D7 / D30 | Cohort revenue ÷ UA cost | 10% / 30% | D7 < 6% |
| Ads | Rewarded impressions per DAU · opt-in rate | | 2.5 · ≥ 35% | < 1.5 · < 25% |
| | eCPM by geo | Mediation report | Market-dependent | −30% week-on-week |
| Economy | Gem inflow vs outflow | Daily totals by source and sink | Outflow ≥ 85% of inflow | Hoarding (median balance rising 4+ weeks) |
| | Pity hit rate | Legendaries from pity ÷ all Legendaries | ≈ 30% of 60-pull cycles | Off by > 3 pp |
| Tech | Crash-free users | Crashlytics | ≥ 99.5% | < 99.0% |
| | ANR rate (Android) | Play Vitals user-perceived ANR | < 0.30% | ≥ 0.47% (Play bad-behaviour threshold) |
| | FPS p10 in run (low-tier devices) | Client sample | ≥ 28 | < 24 |
| Community | Store rating · review sentiment | | ≥ 4.5 · ≥ 80% positive | < 4.3 |

---

## 6. A/B test plan

**Method.** Server-side assignment by account (sticky), 50/50 unless noted. Each test names one primary metric and its guardrails, and has a fixed sample size and duration set *before* launch. We do not peek and stop early. Sample sizes are for 80% power at α = 0.05, two-sided.

| # | Phase | Test | Variants | Primary metric | Guardrails | Min. sample per arm |
|---|---|---|---|---|---|---|
| 1 | Soft launch | FTUE guaranteed raises | First 5 kills raise vs first 10 | D1 retention (40% → 42%) | FTUE time, D7 | 9,490 |
| 2 | Soft launch | Tutorial boss strength | Gravemaw 25% HP vs 40% HP | FTUE completion (85% → 87%) | D1 | 4,722 |
| 3 | Soft launch | Gate interval | 35 s vs 40 s vs 45 s | Gate "correct" rate, D7 | Run length | 9,254 (D7 15% → 16.5%) |
| 4 | Soft launch | Kills per full Nova charge | 300 (build) vs 200 | Novas per run, D7 | Chapter clear rate | 9,254 |
| 5 | Soft launch | Early card offers | Guaranteed new-skill card in level-ups 1–3 vs pure random | D1 | Pick-rate spread | 9,490 |
| 6 | Soft launch | Starter Pack first display | After first Ch1 boss kill vs after run 3 | D7 payer conversion | D7 retention, refund rate | 13,911 (3.0% → 3.6%) |
| 7 | Soft launch | Revive offer timing | Offer instantly vs after a 1 s death slow-mo | Revive opt-in rate | Run-end rage-quits | 4,722 |
| 8 | Post-launch | Shop layout | "Most popular" spotlight on $9.99 vs on $19.99 | ARPPU | Conversion, refunds | 13,911 |
| 9 | Post-launch | Pass preview | Show premium track preview at tier 5 vs tier 10 | Pass attach | Pass complaints | 13,911 |
| 10 | Post-launch | Opt-in "energy full" push | On vs off (opted-in players only) | D7 | Push opt-out, uninstalls | 9,254 |
| 11 | Post-launch | Quest all-clear bonus | 20 gems vs 1 Altar Sigil | Quest completion rate | Gem inflow | 9,490 |
| 12 | Post-launch | Returning player boost | 3-day 2× XP vs 3-day 2× gold for 14+ day lapsed players | D7 after return | Economy inflow | 4,722 |

**Practical limits.** At soft-launch volumes (~1,000–3,000 installs/day) a two-arm retention test needs 1–3 weeks. Monetization tests at ~3% conversion need ~14k installs per arm, so most run after global launch. We run at most 3 concurrent tests on non-overlapping systems.

**Never tested (ethics and compliance):** gacha odds or pity, prices of brief SKUs (fixed; regional prices use store tiers), purchase confirmation steps, age gate and consent flows, accessibility defaults, and anything targeting restricted-mode (under-age) players. Monetization tests exclude players who have set spending limits.
