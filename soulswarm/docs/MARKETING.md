# SOULSWARM: Marketing, Store Listing and Soft Launch

**Status:** v1.0 · **Owner:** PM + UA/Marketing Manager · **Source of truth:** `DESIGN_BRIEF.md`

---

## 1. Positioning

- **One-liner:** *Kill the horde. Raise it. Lead it. Then blow it all up.*
- **Category promise:** a "Legion Survivor". The horde-survival roguelite fans already love, plus the "army grows on screen" fantasy from runner ads, delivered as **real gameplay**.
- **Audience:** 16–35, plays short action sessions, has installed at least one survivor-like or hybrid-casual runner. Majority male at launch (genre norm). The Neon Gothic art is chosen to read as "cool" rather than "cute" so it travels to a wider audience.
- **The three things every asset sells:** 1) **Convert the horde** (1 → 300+). 2) **Soul Gates** (pick the right gate). 3) **Soul Nova** (trade your army for a screen wipe).

### Ad truthfulness policy (non-negotiable)

1. Every gameplay frame of every ad comes from the shipping build (or a dev build with identical content). There is no mocked-up gameplay. The "pick the right gate" mechanic is in the game, so we can run that creative honestly. Painted cinematic footage (`docs/ART_AND_ADS.md`) is allowed only in paid UA and only under these conditions: it carries an on-screen CINEMATIC label, it never shows a mechanic, number or feature the game lacks, and the end card says "Cinematic sequences are not actual gameplay." Store app previews stay 100% in-app capture.
2. Every number shown is achievable in-game: legion up to the 400 ceiling, gate values from the real generator (GDD §4.3), enemies alive at once ≤ 340 (the build's high-tier cap; 200 on low, 280 on mid). Features that are still Planned (GDD §0) cannot appear in an ad until they ship. "1 vs 1,000" refers to the **kill counter** in one run, not 1,000 enemies on screen at once.
3. Sped-up footage carries a small "Gameplay sped up" label. Debug or cheat builds are used only for *camera* control, never to show results a player cannot get.
4. No implied odds ("I always pull Legendary!"), no real-money gambling imagery, no ads aimed at children.

This policy protects the stores' and regulators' trust (the UK ASA has upheld complaints against misleading mobile-game ads). It also protects retention: players who install for a game that doesn't exist churn on day 0.

---

## 2. App Store listing (iOS)

| Field | Limit | Copy | Length |
|---|---|---|---|
| **App name** | 30 | `SOULSWARM: Raise the Legion` | 27 |
| **Subtitle** | 30 | `Turn the Horde Into Your Army` | 29 |
| **Keyword field** | 100 | `survivor,roguelike,necromancer,undead,minions,swarm,action,rpg,arcade,boss,gothic,dungeon,hero,dark` | 99 |
| **Promotional text** | 170 | `Season 1 is live! Raise a legion of 300+ souls, pick the right Soul Gate and wipe the screen with Soul Nova. Unlock Eclipse Vael in the Soul Pass.` | 146 |
| Primary / secondary category | — | Games › Action / Games › Role Playing | — |

Keyword rules: no words already in the name or subtitle (Apple indexes those already), no spaces after commas, singular *or* plural (not both), and no competitor names or trademarks. "swarm" is listed separately because "SOULSWARM" is indexed as one word.

### Full description (App Store and Google Play)

> **You start alone. You finish with an army.**
>
> SOULSWARM is a one-thumb horde-survival roguelite with a twist: every enemy you slay can rise again as a glowing soul that fights for YOU. Survive six minutes in a haunted necropolis, grow your spectral legion from 1 to 300+, and topple the Hollow King.
>
> **RAISE THE LEGION**
> Husks, Ghouls, Brutes, Cinder Witches, even exploding Bloaters: whatever falls, rises. Watch your cyan legion swell on screen and hunt the horde for you.
>
> **PICK THE RIGHT GATE**
> Every 40 seconds, two Soul Gates appear. +15 or ×2? ×2 or ÷2? Do the maths, dodge the danger and walk through. One choice can double your army.
>
> **UNLEASH SOUL NOVA**
> Fill the Nova meter, tap once, and your entire legion detonates in a chain of spectral explosions. The bigger your army, the bigger the blast. Trade everything for a total screen wipe, then raise it all again.
>
> **BUILD A NEW LEGEND EVERY RUN**
> Choose 1 of 3 skills each level: homing Soul Bolts, a Spectral Scythe, Ashen Chains, Bone Spears, Skull Halo, Grave Pulse and 8 passives. Max them out and discover evolutions like Soul Storm and Bone Crown.
>
> **FOUR SHEPHERDS OF THE DEAD**
> Play as Vael the Gravecaller, Nyx Hollowborn, Seraphine Ashveil, Liora Bellwraith or the legendary Mordrake the Undying. Each has a signature weapon and a passive that changes how your legion fights.
>
> **CONQUER FIVE CURSED CHAPTERS**
> From the Ashen Necropolis to the Crimson Throne, then climb the weekly Endless Abyss leaderboards. Blood Moon weekends double the elites AND the rewards.
>
> **PLAY YOUR WAY**
> • Portrait, one thumb, auto-attack: perfect for short breaks
> • 6–9 minute runs
> • Colourblind modes, flash reduction and left-handed layout
> • Every chapter can be completed without paying
>
> SOULSWARM is free to play and offers optional in-app purchases, including random items (Soul Altar). Odds and pity counters are shown in-game before every summon. You can set spending limits in Settings. Rewarded ads are always optional. There are no forced ads.
>
> Privacy Policy: [URL] · Terms of Use: [URL]

(≈2,000 characters; limit 4,000.)

*Build check:* Endless Abyss, Blood Moon, colourblind modes, flash reduction and the left-handed layout are Planned (GDD §0, §17). Cut those lines if they are not in the submitted build.

## 3. Google Play listing

| Field | Limit | Copy | Length |
|---|---|---|---|
| **Title** | 30 | `SOULSWARM: Raise the Legion` | 27 |
| **Short description** | 80 | `Slay the horde, raise the dead, lead 300+ souls and wipe the screen with a Nova.` | 80 |
| **Full description** | 4,000 | As above. Google indexes the full description, so "roguelike", "survivor", "necromancer" and "undead" each appear naturally 2–3 times (no stuffing). | ~2,000 |
| Feature graphic | 1024 × 500 | Vael at the bottom, the legion spiralling up into a Nova burst, logo top-left | — |
| Tags / category | — | Action › Roguelike; Casual action | — |
| Content rating | IARC questionnaire | Expected: PEGI 7–12 / ESRB E10+ to T, with "In-Game Purchases (Includes Random Items)". Final rating comes from the questionnaire (`PRODUCTION_ROADMAP.md` §8.2). | — |

Google Play has no keyword field.

---

## 4. Store screenshot storyboard (10 portrait screenshots)

Format: iOS 6.9" (1320 × 2868) is required, and the 6.5" set is derived from it. Android 1080 × 1920 (9:16). The **first 3 screenshots appear in search results**, so they carry all three hooks. Captions are 2–5 words, huge, at the top in the gothic display font, with cyan for allies and warm colours for enemies.

| # | Caption | Scene | Composition notes |
|---|---|---|---|
| 1 | **EVERY KILL JOINS YOUR ARMY** | Chapter 1 at 2:30: Vael in a mixed legion (every minion kind plus gold Champions) inside two rings of the horde | The hero shot. The kill-streak counter shows at the left edge. |
| 2 | **PICK THE RIGHT GATE** | A ×3 / ÷2 Soul Gate pair ahead of a 45-soul legion | Both gates readable; the legion heads for ×3. |
| 3 | **DETONATE THE LEGION** | Mid-Nova: 180 souls detonating in a chain through two rings of the horde | Peak bloom frame, 0.45 s into the chain (after the 0.25 s wind-up). |
| 4 | **SLAY THE HOLLOW KING** | Gravemaw mid Grave Slam telegraph, facing the camera, the legion around Vael | Ring bands and safe lanes visible. |
| 5 | **COLLECT LEGENDARY SHEPHERDS** | The heroes screen with all five painted hero cards (Vael, Nyx, Seraphine, Liora, Mordrake) | Rarity frames (Common → Legendary) and star rows visible. |
| 6 | **FIVE CURSED CHAPTERS** | Chapter 2 (Ember Wastes): a ring of Cinder Witches and their fire lobs | Chapter palette and hazards. |
| 7 | **UNLEASH YOUR HERO'S RITE** | Seraphine casts Ashfall: ash chains rain on the horde | The RITE button and the Soul Frenzy chip visible. |
| 8 | **DARE NIGHTMARE & TORMENT** | Chapter 5 on Torment: the blood-red floor, a Warded and Hasted elite with its tags, Vael's cyan legion | Shows the endgame tiers and elite affixes. |
| 9 | **HUNT EVERY HORROR** | The Bestiary: painted foe cards with kill counts and milestone pips, rewards waiting | The collection layer; App Store only. |
| 10 | **FORGE YOUR BUILD** | A level-up over a live fight: the painted power cards, with the gold Soul Storm evolution on top | Painted ability icons; App Store only. |

Rendered by `npm run screenshots` (`scripts/store-screenshots.mjs`) at 1290 × 2796. Order matters: 1–3 appear in search results. The App Store takes all 10; Google Play shows 8 phone screenshots, so it gets 1–8.

**App preview video (iOS, 25 s):** 0–3 s legion growing (hook 1) → 3–9 s gate choice → 9–15 s Nova wipe → 15–21 s Gravemaw fight → 21–25 s logo + "Raise the Legion". In-game audio only. No device frames (per Apple's guidelines).

---

## 5. Soft-launch plan

### 5.1 Phases

| Phase | Dates (2027) | Countries | Platforms | Goal | UA budget | Install target |
|---|---|---|---|---|---|---|
| **A: Tech test** | 25 Jan – 21 Feb | Philippines, Malaysia | Android + iOS | Crashes, low-end performance, backend load, FTUE funnel | $8k–$15k | ~15k |
| **B: Retention** | 22 Feb – 4 Apr | Canada, Australia, New Zealand | Android + iOS | D1/D7/D30, chapter difficulty curve, CPI and creative testing | $40k–$80k | ~25k |
| **C: Monetization** | 5 Apr – 30 May | B + Denmark, Sweden, Norway, Finland | Android + iOS | Full shop, Soul Pass seasons, Soul Pact, ads mediation, EEA consent flows, ROAS curves | $60k–$120k | ~35k |
| **Go / no-go review** | 31 May – 4 Jun | — | — | Gates below | — | — |
| **Global launch** | **Mon 14 Jun 2027** | Worldwide (BE mode in Belgium; China excluded) | Both | | See `PRODUCTION_ROADMAP.md` §9 | |

Why these countries: Philippines and Malaysia give cheap installs on a wide range of low-end Android devices. Canada, Australia and New Zealand are English-speaking and behave like the US and UK at lower CPI, without spending the big markets' launch "newness". The Nordics test GDPR/TCF consent and EU price display. Belgium and the Netherlands stay out of soft launch because of loot-box law (see `MONETIZATION.md` §11).

### 5.2 Metric gates (measured on CA/AU/NZ cohorts; Phase A has tech gates only)

These are **our internal thresholds**, informed by genre benchmark ranges. They are not industry guarantees. Every metric must hit "Go", or the leadership review must explicitly accept the risk in writing.

| Metric | Kill / rethink | Iterate | **Go global** |
|---|---|---|---|
| D1 retention | < 33% | 33–39% | **≥ 40%** |
| D7 retention | < 10% | 10–14% | **≥ 15%** |
| D30 retention | < 4% | 4–5.9% | **≥ 6%** |
| CPI, iOS (CA/AU, blended networks) | > $6.00 | $3.50–$6.00 | **≤ $3.50** |
| CPI, Android (CA/AU) | > $3.50 | $2.00–$3.50 | **≤ $2.00** |
| IPM (best 3 creatives) | < 10 | 10–24 | **≥ 25** |
| FTUE completion | < 75% | 75–84% | **≥ 85%** |
| Crash-free users | < 98.5% | 98.5–99.4% | **≥ 99.5%** |
| Payer conversion by D30 | < 1.5% | 1.5–2.9% | **≥ 3%** |
| ARPDAU (IAP + ads) | < $0.12 | $0.12–$0.24 | **≥ $0.25** |
| D7 ROAS | < 5% | 5–9% | **≥ 10%** |
| Projected LTV365 (net) ÷ blended paid CPI | < 0.7 | 0.7–1.19 | **≥ 1.2** |

**Phase A tech gates:** crash-free users ≥ 99.0%, ANR < 0.47%, low-tier FPS p10 ≥ 24, cold start to home < 8 s on low tier, zero payment or data-loss bugs.

**If gates are missed:** iterate in 2-week update cycles for up to 8 extra weeks. Retention misses are fixed first (FTUE, difficulty, run variety), then monetization. If D7 stays under 10% after two major updates, we stop and rethink the core rather than spend on launch UA.

---

## 6. Video ad creative scripts

All scripts are 9:16 first, with 1:1 and 16:9 cut-downs. Every script ends on the same 2 s end card: logo, "Raise the Legion", store badges and a "Free to play · In-app purchases" line. Sound-off safe: captions on every line, big on-screen numbers. Primary KPIs: 3-second thumb-stop rate, CTR and IPM. The best performers move to Spark Ads and Meta Advantage+ campaigns.

### Ad 1: "1 vs 1,000" (15 s)

- **Hook (0–3 s):** Vael alone in the centre. Caption: **"1 vs 1,000"**. The kill counter in the top corner starts spinning as Husks pour in from all four edges.
- 3–6 s: first kills. The first enemy rises cyan. Caption: "…but every kill joins me."
- 6–10 s: sped-up montage, legion 5 → 60 → 180 while the kill counter reaches 1,000. ("Gameplay sped up" label.)
- 10–13 s: the legion overwhelms the remaining horde. Caption: **"Now it's 300 vs them."**
- 13–15 s: end card.
- **Variants:** caption "Me vs the entire graveyard"; counter in red vs cyan.
- **In-engine render:** `scripts/record-trailer.mjs` produces Ad 1-style creatives straight from the game. It renders a scripted 9:16 gameplay ad (1080×1920, 30 fps, 21 s by default) to MP4 with these beats: "One Shepherd against the horde" → every kill joins your army → pick the ×3 gate over ÷2 → Soul Nova wipe → Gravemaw → end card "PLAY FREE" with "Free to play · In-app purchases". Run `node scripts/record-trailer.mjs [out.mp4] [url]` against the dev server (`npm run dev`); it needs Playwright and ffmpeg with libx264. It steps a real Chapter 1 run frame by frame and the Shepherd can take damage, but the beats are scripted (an upgraded account with Raise Chance at its 85% cap, a forced ×3 vs ÷2 pair, an instant Nova, Gravemaw called early), so check every cut against the truthfulness policy (§1) and add store badges before it runs.
- **Cinematic cuts:** `store/ads/` holds a 34.8 s 9:16 and a 28.3 s 16:9 ad that wrap this gameplay in labelled, painted Kling cinematics (souls rising, Gravemaw's reveal). See `docs/ART_AND_ADS.md` for cuts, sources and where they may run.

### Ad 2: "Pick the Right Gate" (20 s)

- **Hook (0–3 s):** freeze-frame on two gates, **`+15`** and **`×2`**, legion count **10** (the first pair at 0:28; the build never offers ×2 below a legion of 10). Caption: **"Which gate??"** with a 3-2-1 timer.
- 3–6 s: the player walks through ×2. 10 → 20. Caption: "Wrong! ×2 = only +10."
- 6–9 s: rewind wipe (presented clearly as a replay). Takes +15 → 25.
- 9–14 s: the next gate pair `×2` vs `+40` at legion 52 (a real 2:28 pair) → ×2 → **104**. Caption: "Now ×2 wins."
- 14–18 s: the legion swarms a Brute.
- 18–20 s: end card. "Can you do the maths?"
- **Variants:** a numbers-only version at different legion sizes to drive comments ("Comment your pick").

### Ad 3: "Soul Nova Wipe" (15 s)

- **Hook (0–3 s):** a screen completely packed: 300 cyan minions vs an ember horde. Thumb hovers over the glowing **NOVA** button. Caption: **"Do I sacrifice them all?"**
- 3–4 s: tap. A beat of silence and slow motion (the build's 0.55 s slow-mo; the 0.4 s wind-up is Planned).
- 4–9 s: chain detonation ripples outward in slow motion, then real time. Screen-clearing white-cyan bloom. Bass drop.
- 9–12 s: an empty, smouldering arena. Legion counter 0. Then the first enemies killed by the Nova rise again. Caption: "…and raise them again."
- 12–15 s: end card.
- **Variants:** an ASMR cut with no music, only the chain crackle; a "how big can the Nova get?" cut at legion 400.

### Ad 4: "Fail → Win" (30 s)

- **Hook (0–3 s):** Gravemaw's slam rings close in, the player panics and dies. Caption: **"I lost to this boss 5 times…"**
- 3–8 s: a replay of the mistake: the player popped Nova early on Husks. The legion is gone when the boss arrives. Caption: "Mistake: wasted Nova."
- 8–14 s: second attempt. The player saves Nova, picks ×2 at the 5:08 gate → legion 280.
- 14–22 s: Gravemaw's ember bullet rings. The player dodges through the gaps, then fires Nova. A big chunk of the bar disappears.
- 22–27 s: he enrages at 50% HP. The legion and Bone Spears finish him. "CHAPTER CLEARED".
- 27–30 s: end card. "Save your Nova."
- **Note:** both attempts are real recorded runs. The losing run must not be staged with a weakened build.

### Ad 5: "1 → 300 Timelapse" (20 s)

- **Hook (0–3 s):** a giant counter fills the top third: **1**. Caption: "Watch my army grow."
- 3–17 s: a single run sped up ×6. The camera pulls back slowly as the legion grows: 1 → 12 → 47 → 120 → 233 → **312**. Music stems layer in at each threshold (a Planned in-game feature, GDD §15; not in the current build).
- 17–20 s: end card.
- **Variants:** with and without the music-stem explanation caption.

### Ad 6: "Turn Their Bomb on Them" (15 s) (Soul Bombs are in the build, GDD §4.2.)

- **Hook (0–3 s):** a Bloater swells and flashes red right next to Vael. Caption: **"DON'T let it touch you!"**
- 3–6 s: Soul Bolt kills it early. It rises as a **cyan Soul Bomb**.
- 6–11 s: the Soul Bomb dives into the densest pack and explodes (2.4 m blast). The pack drops, and some of them rise. Caption: "Their bomb. My army." Capture a real dense moment; never stage a kill count the blast can't reach.
- 11–15 s: end card.

### Ad 7: "Legion vs the Hollow King" (25 s)

- **Hook (0–3 s):** low angle on Gravemaw, magenta crown blazing. Caption: **"Can 300 souls beat the Hollow King?"**
- 3–10 s: the legion charges. Slam rings knock minions flying (they really do die to slams). Legion 300 → 210.
- 10–17 s: the legion tears through the summoned Husks and Ghouls and swarms the boss. Health bar 100% → 50%: "GRAVEMAW ENRAGES". (Bulwark and Soul Witch minions are Planned.)
- 17–22 s: enraged ember rings (3 waves of 26 orbs). Nova finisher.
- 22–25 s: end card. "Yes. Yes they can."

### Ad 8: "Which Shepherd Are You?" (20 s)

- **Hook (0–3 s):** a 2 × 2 grid of the four heroes, each with a rarity frame. Caption: **"Pick one. Comment below."**
- 3–7 s: **Vael**, homing Soul Bolts and +10% Raise Chance: "The Gravecaller."
- 7–11 s: **Nyx**, a 360° Spectral Scythe and fast, furious minions: "The Reaper."
- 11–15 s: **Seraphine**, Ashen Chains arcing through 8 targets, a fast Nova: "The Storm."
- 15–18 s: **Mordrake**, Bone Spears piercing a line of Brutes, then a revive: "The Undying."
- 18–20 s: end card.
- **Note:** rarity is shown honestly. No caption may imply Mordrake is easy to obtain.

### Creative testing process

Each week: 6–10 new variants (new hooks on proven bodies) → $300–$600 per creative test budget per network in CA/AU → kill below the median IPM after 2,000 impressions → scale winners → refresh winners every 2–3 weeks to fight creative fatigue.

---

## 7. UGC and TikTok angle

| Format | Example | Why it works |
|---|---|---|
| **Gate Math Challenge** (stitch/duet) | Creator freezes on "37 souls: `+40` or `×2`?" and asks viewers to comment before the reveal | Comment bait built on a real mechanic. The answer is debatable once position and risk are considered. |
| **Biggest Nova** | "My 400-legion Nova" compilations, ranked by kills per Nova | Satisfying, loops well, natural competition between creators |
| **Rate My Legion** | Results-screen card: peak legion, kills, build | Shareable flex. The in-game share card (launch) makes it one tap. |
| **Boss Fail → Win tips** | "Beat an enraged Gravemaw with this build" | Search-friendly guides that grow the community |
| **Hero tier list** | "Is Mordrake worth it?" | Debate content. We never pay for tier-list rankings. |

**Program:** 30–50 nano and micro creators (5k–100k followers) in CA/AU during soft launch Phase C, then 150+ at global launch. Creators get early-access builds, a creator code that grants a cosmetic legion tint (no power), and a flat fee or CPI-based deal. Every paid post uses the platform's branded-content tag and #ad (FTC endorsement guides and ASA/CAP rules). The brief to creators forbids showing or implying guaranteed summon results and any targeting of under-13 audiences.

**Built-in sharing:** at launch, a share card (peak legion, kills, chapter, hero) with a watermark and store link. In Season 3, a 10-second auto-captured replay clip of the last Nova or the boss kill (`LIVEOPS.md`).

**Hashtags:** #SOULSWARM #RaiseTheLegion #SoulNova #PickTheGate.

---

## 8. Global launch beats

| When | Beat |
|---|---|
| T−8 weeks | Google Play pre-registration opens (pre-registration reward: a "Gravecaller's Banner" legion cosmetic). App Store pre-order opens. |
| T−6 weeks | Featuring nominations submitted in App Store Connect and Play Console. Press kit live (trailer, 4K screenshots, fact sheet, odds summary). |
| T−4 weeks | Creator seeding (early builds). Discord opens. The 30 s launch trailer goes to YouTube. |
| T−1 week | App Store In-App Event "Season 1: The Waking Legion" scheduled. UA campaigns warmed up at low budget. |
| T−0 (Mon 14 Jun 2027) | Launch. UA ramps over 7–10 days as networks' algorithms learn. Daily ROAS review. |
| T+2 weeks | First Boss Rush ("Hollow Court"). Launch retrospective. Scale or hold UA based on D7 ROAS. |
