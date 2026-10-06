# SOULSWARM: Production Roadmap (Prototype → Store Launch)

**Status:** v1.0 (5 Oct 2026) · **Owner:** PM / Producer · **Source of truth:** `DESIGN_BRIEF.md`
**Starting point:** a playable HTML5/WebGL (Three.js) prototype in the browser.
**Target:** global launch on iOS and Android on **Mon 14 June 2027**, after a three-phase soft launch (`MARKETING.md` §5).

*Vendor prices and store policies change often. Every cost and policy note below is "as understood at time of writing; verify before committing".*

---

## 1. What "store-shipped" means (definition of done)

1. Native iOS and Android apps built from the same TypeScript/Three.js codebase, wrapped with **Capacitor**, approved on the App Store and Google Play.
2. Real purchases for all 9 SKUs in the brief, validated **on the server**, with refunds clawed back.
3. Rewarded ads only, through **AppLovin MAX** mediation, with consent (GDPR/TCF, ATT) and child-safe handling.
4. Server-authoritative economy: wallet, Soul Altar rolls and pity, quests, Soul Pass, cloud save, weekly leaderboards with anti-cheat.
5. Analytics, attribution, crash reporting and remote config in place before the first soft-launch install.
6. Privacy policy, terms, age gate, spending limits, odds disclosure, account deletion and age ratings complete.
7. Performance budgets (§8) met on the low-tier reference devices.

---

## 2. Target architecture

```
┌──────────────────────── Device ────────────────────────┐
│  Game (TypeScript + Three.js, Vite build, bundled)      │
│   ├─ Sim core: fixed 30 Hz, seeded PRNG (deterministic) │
│   └─ Renderer: instanced meshes, quality tiers          │
│  Capacitor bridge                                       │
│   ├─ RevenueCat (IAP)        ├─ AppLovin MAX (rewarded) │
│   ├─ Firebase: Analytics, Crashlytics, Remote Config,   │
│   │   Cloud Messaging        ├─ Sentry (JS errors)      │
│   ├─ MMP SDK (attribution)   ├─ ATT, Haptics, App,      │
│   └─ Play Integrity / App Attest   Preferences, Share   │
└───────────────┬───────────────────────────┬─────────────┘
                │ HTTPS / WebSocket          │ webhooks
        ┌───────▼────────┐          ┌───────▼────────┐
        │ Nakama backend │◄─────────│   RevenueCat   │◄── Apple / Google
        │ auth, wallet,  │ purchase │ receipt checks │    server notifications
        │ gacha, quests, │  events  └────────────────┘
        │ pass, leader-  │──► BigQuery (via Firebase export + server events)
        │ boards, save   │
        └────────────────┘
```

**Tooling.** `scripts/record-trailer.mjs` renders a scripted 9:16 gameplay ad (1080×1920, 30 fps) to MP4 from the dev build: it steps a real run frame by frame in headless Chromium (Playwright) and encodes with ffmpeg (libx264). It is the in-engine way to produce Ad 1-style creatives for creative testing (`MARKETING.md` §6).

---

## 3. Capacitor wrapping (iOS and Android)

| Topic | Decision / work item |
|---|---|
| Version | The current Capacitor major. iOS uses WKWebView; Android uses the system WebView (Chromium). |
| Code loading | All game JS and assets ship **inside the binary**. Content (tuning, events, banners) updates through remote config and backend data. Game code changes go through store review. We do not hot-push code. |
| Rendering | WebGL2 required, with no WebGL1 fallback. Handle `webglcontextlost` / `restored` (rebuild GPU resources and resume a paused run). |
| Lifecycle | `App` plugin: pause the run and mute audio on background. Auto-pause on calls. Save a run checkpoint every 30 s so an OS kill can resume. |
| Audio | Web Audio unlocked on first touch. Respect the iOS silent switch (ambient session). Duck on interruptions. |
| Display | Portrait lock. Safe-area insets (notch, home indicator, Android cutouts). Immersive mode on Android. Keep the screen awake during runs only. |
| Input | Touch events with `passive: false` on the game canvas. Disable double-tap zoom, text selection and overscroll bounce. Android back button = pause or back. |
| Haptics | Capacitor Haptics plugin, throttled (GDD §3). |
| Build | Vite production build with meshopt geometry, KTX2/Basis textures and AAC audio. Android App Bundle with Play App Signing. iOS build and signing through Xcode Cloud or fastlane. |
| Size | Install size target ≤ 150 MB (aim for < 100 MB). Optional chapter assets are downloaded after the tutorial. |
| Native plugins needed | RevenueCat (official Capacitor plugin). **AppLovin MAX: no official Capacitor plugin, so we write a thin custom plugin** for rewarded ads only (load, show, callbacks, consent flags; about 1–2 engineer-weeks per platform). Firebase via community-maintained Capacitor plugins. Sentry's Capacitor SDK. ATT plugin. |

## 4. Store accounts and setup

| Item | Cost | Lead time / notes |
|---|---|---|
| **Apple Developer Program** (organisation) | **$99 / year** | Needs a D-U-N-S number (can take 1–2+ weeks). Sign the Paid Apps agreement and complete tax and banking forms before IAP works. Enrol in the **App Store Small Business Program** (15% commission under $1M/year). |
| **Google Play Console** (organisation) | **$25 one-time** | Register as an *organisation* (D-U-N-S) in October. New *personal* accounts must run a closed test with at least 12 testers for 14 days before production access. Set up the merchant/payments profile. Google takes 15% on the first $1M per year. |
| App records | — | Bundle ID `com.<studio>.soulswarm`. IAP products created in both stores (§5). TestFlight internal and external groups; Play internal, closed and open tracks. |
| Store requirements | — | Build with the current Xcode/iOS SDK that App Store Connect requires. Target the current required Android API level (Google raises it every August). |
| Ownership hygiene | — | Company-owned accounts with 2FA and at least 2 admins. Signing keys in a secrets vault. |

## 5. In-app purchases

**Decision: RevenueCat on top of StoreKit 2 and Google Play Billing.** It gives one cross-platform API, server-side receipt validation, refund events, analytics and integrations, which saves a native engineer about 6–10 weeks compared with building and maintaining our own validation. (Pricing at time of writing: free up to a monthly revenue threshold, then a small percentage of tracked revenue. Verify the current plan.) Fallback if we ever leave RevenueCat: StoreKit 2 with the App Store Server API and Server Notifications v2 for iOS, and the Play Developer API (purchases + voided purchases) with Real-time Developer Notifications for Android.

| SKU | Price | iOS product type | Play product type | Server rule |
|---|---|---|---|---|
| `gems_80` … `gems_15000` | $0.99–$99.99 | Consumable | One-time (consumable) | ×2 gems on the first purchase of each tier (server flag per account) |
| `starter_pack` | $1.99 | Consumable | One-time | Once per account. Offer window 48 h from first display, stored on the server. |
| `soul_pact` | $4.99 | **Non-renewing subscription** (30 days) | One-time + server entitlement | 300 gems now. 100/day claimable (3-day grace). Stacks by extending the end date. |
| `soul_pass` | $9.99 | Consumable | One-time | Unlocks the premium track for the *current season ID*. Retroactive grants. |

**Purchase flow:** in-game confirm screen (brief requirement) → spend-limit check on the server → OS purchase sheet → RevenueCat validates with Apple/Google → **webhook to Nakama** → idempotent grant (keyed on store transaction ID) → client refreshes wallet. The client never grants currency. Handle Ask-to-Buy / deferred and pending purchases, restore purchases, and **refund webhooks → clawback** (the wallet may go negative; gem spending locks until the balance is positive). BE mode (Belgium) swaps sigils in bundles for fixed relics through server-side product variants.

## 6. Rewarded ads (AppLovin MAX)

- **Rewarded video only.** No interstitials, no banners (brief guardrail). Placements and caps are in `MONETIZATION.md` §9.
- **Networks** (bidding first): AppLovin, Google AdMob, Unity Ads, Meta Audience Network, Mintegral, Pangle, Liftoff, InMobi, DT Exchange. Add or drop networks by eCPM contribution after 4 weeks of soft launch.
- **Server-side reward verification** (MAX S2S callbacks) → Nakama grants the reward and enforces caps. The client's "ad finished" event is never trusted.
- **Consent:** an IAB TCF v2.2 certified CMP for EEA/UK users (Google requires one to serve its demand there). MAX's consent flow with Google UMP covers this. US state privacy laws: a "Do Not Sell or Share" toggle.
- **iOS:** ATT system prompt after a one-screen explainer, shown before the first ad (never at cold start). SKAdNetwork / AdAttributionKit IDs in Info.plist. Privacy manifests for every SDK.
- **Children:** restricted-mode users get the child-directed / under-age flags, no IDFA/GAID, or ads off entirely (decision for legal review).
- `app-ads.txt` on the studio website before the first ad request.

## 7. Analytics, attribution, crash reporting, backend

### 7.1 Analytics and attribution

- **Primary:** Firebase Analytics with **BigQuery export** (the source of truth for dashboards in `LIVEOPS.md` §5). Firebase Remote Config powers tuning, the BE/NL loot-box switch and A/B assignment (server-side for economy tests).
- **Optional:** GameAnalytics (free) during soft launch for genre benchmark comparisons.
- **Attribution (MMP):** AppsFlyer, Adjust or Singular. This is required for paid UA, SKAN/AdAttributionKit decoding and ROAS by campaign. Pricing is negotiated and grows with volume.
- **Event taxonomy v1** (about 40 events), for example: `ftue_*` steps, `run_start` / `run_end` (chapter, hero, time, kills, peak legion, cause of death), `levelup_pick`, `gate_pass` (offered values, chosen value, legion before/after), `nova_use` (legion size, kills), `boss_phase`, `altar_pull` (count, results, pity counter), `iap_confirm_shown` / `iap_success` / `iap_cancel`, `ad_offer` / `ad_complete`, `quest_complete`, `pass_tier`, and `economy_source` / `economy_sink` (currency, amount, reason).

### 7.2 Crash and error reporting

- **Firebase Crashlytics** for native crashes and ANRs. **Sentry** for JavaScript errors and performance traces, with source maps uploaded in CI. A custom breadcrumb for WebGL context loss. Play Console Android vitals watched daily: user-perceived crash rate stays under 1.09% and ANR rate under 0.47% (Play's "bad behaviour" thresholds), and our own targets are much lower.

### 7.3 Backend: cloud save, economy, leaderboards, anti-cheat

| Option | Strengths | Weaknesses | Fit |
|---|---|---|---|
| **Nakama** (Heroic Labs; open source, self-host or Heroic Cloud) | Built-in auth, storage, wallets, **leaderboards with cron resets and tournaments**, groups (clans), real-time multiplayer (Legion Raids v2), server modules in TypeScript/Go | We run or rent the servers. Smaller ecosystem. | **Chosen.** It covers launch and the roadmap (Covens, Raids). |
| PlayFab (Microsoft) | Managed economy, leaderboards with reset, CloudScript, LiveOps tools | Pricing by usage at scale, vendor lock-in, less flexible real-time multiplayer | Strong alternative |
| Firebase (Auth, Firestore, Functions) | Already in the stack, very fast to start | No native leaderboards or tournaments. Anti-cheat and economy logic all custom. | Analytics, config and push only |

**Server responsibilities:** device auth with optional Sign in with Apple / Google linking. Cloud save (economy state lives on the server; the client keeps only settings and a run checkpoint). Wallet and ledger. Soul Altar RNG and pity (audited, logged per pull). Quests, login calendar, Soul Pass, energy (server time). Weekly Endless Abyss and Boss Rush leaderboards. Spend limits. **In-app account deletion** (Apple requirement) plus a web deletion link (Google Play requirement).

**Anti-cheat:**

1. **Server authority:** every currency grant happens on the server. The client only sends intents and run summaries.
2. **Run tickets:** the server issues a run ID, a seed and a start time, and charges 5 energy. A result is accepted once per ticket, and only if wall-clock time ≥ game time.
3. **Plausibility checks:** kills ≤ the maximum possible spawns for that chapter and duration (from GDD §8 formulas), level ≤ the XP possible, gold recomputed on the server from the run summary, damage and legion within the ceilings.
4. **Deterministic replay:** the sim runs at a fixed 30 Hz with a seeded PRNG. The client uploads a compact input log (joystick at 10 Hz plus card, gate and Nova events, about 20–40 KB per run). **Every top-100 leaderboard run is re-simulated headless on the server** before rewards are paid.
5. **Device integrity:** Play Integrity API and Apple App Attest on leaderboard submissions. Obfuscated JS bundle. Rate limits.
6. **Response:** suspicious scores are held and the player is told. Repeat offenders go to a shadow leaderboard. No bans without review.

Chapter runs can start offline. Energy is reconciled and rewards are granted on reconnect, capped at 3 offline runs per day pending checks. Endless Abyss, events and the Soul Altar need a connection.

## 8. Privacy, age rating and performance budgets

### 8.1 Privacy and compliance checklist

- Privacy policy and terms hosted on the studio site. **URLs entered in both store listings and linked in-app** (both stores require it).
- Neutral **age gate** before any SDK starts. COPPA/GDPR-K restricted mode (`MONETIZATION.md` §11).
- **ATT** explainer + prompt (iOS). **GDPR/UK GDPR consent** through a TCF v2.2 CMP. CCPA/CPRA opt-out.
- Apple **privacy nutrition labels** and **privacy manifests** (`PrivacyInfo.xcprivacy`, required-reason APIs, signed third-party SDKs). Google Play **Data safety** form.
- Data processing agreements with every vendor. Data retention schedule. A data protection impact assessment (minors + advertising).
- Odds disclosure screens. Spend limits and history. BE mode. The EU real-money price echo.

### 8.2 Age rating

Apple's age-rating questionnaire (the updated 4+/9+/13+/16+/18+ system) and the IARC questionnaire for Google Play, completed honestly: fantasy violence against non-human undead, no blood, in-app purchases, **paid random items**, no user-generated content at launch (coven chat in S6 will need updated answers and moderation). Expected: PEGI 7–12 and ESRB E10+ to T, with the "In-Game Purchases (Includes Random Items)" descriptor, and Australia M (paid loot boxes). Final ratings come from the questionnaires, not from us.

### 8.3 Performance budgets

**Supported:** iOS 15+ (WebGL2). Android 8.0+ with WebGL2 and ≥ 3 GB RAM (lower devices excluded in the Play device catalogue). Quality tier is auto-detected by a 3-second GPU benchmark at first launch and can be overridden in Settings.

| Budget | Low tier | Mid tier | High tier |
|---|---|---|---|
| Reference devices | Galaxy A13 / Redmi Note 9 class (Mali-G52, Adreno 610), iPhone 8 | Pixel 6a / Galaxy A54 class, iPhone XR–12 | Snapdragon 8 Gen 1+, iPhone 13+ |
| Frame rate | 30 fps locked | 60 target, ≥ 45 floor | 60 locked |
| Simulation | Fixed 30 Hz on all tiers (determinism); render interpolation | same | same |
| Sim CPU per tick | ≤ 8 ms | ≤ 5 ms | ≤ 3 ms |
| Draw calls | ≤ 60 | ≤ 100 | ≤ 150 |
| Triangles on screen | ≤ 120k | ≤ 250k | ≤ 400k |
| Render resolution | DPR cap 1.25, dynamic 70–100% | DPR cap 2.0 | Native up to 2.5 |
| Bloom | Off (baked emissive sprites) | Half-res | Full-res |
| Particles | ≤ 800 | ≤ 2,000 | ≤ 4,000 |
| Units (build caps) | 200 enemies alive, 400 minions, ≤ 400 player shots + 150 enemy orbs | 280 enemies, rest same | 340 enemies, rest same |
| Memory (whole app) | ≤ 600 MB (GPU textures ≤ 120 MB, JS heap ≤ 150 MB) | ≤ 900 MB | ≤ 1.2 GB |
| Garbage collection | Zero allocations per frame in a run (pools, typed arrays); GC pause ≤ 5 ms | same | same |
| Cold start → home | ≤ 8 s | ≤ 5 s | ≤ 3 s |
| Thermal / battery | 30-min session without dropping a tier | ≤ 12% battery per 30 min | — |

**Gameplay parity:** the prototype scales the alive-enemy cap by quality tier (200 / 280 / 340, `run.js`). The 400-minion ceiling is the same on every tier. Leaderboard modes (Planned) need one shared enemy cap on every tier for fairness, so this must be decided before Endless Abyss ships.

**Techniques:** one `InstancedMesh` per unit archetype with vertex-animation textures (no skinned meshes for the horde). Structure-of-arrays typed buffers. A 2 m spatial hash for targeting and separation. Minion AI updated in thirds (staggered ticks). Shard merging past ~416 shards on the map (the build's 420-shard pool). Pooled additive particles. A shared ribbon trail per minion ring. Shader warm-up during the loading screen.

---

## 9. Team, milestones and budget

### 9.1 Team composition (FTE)

| Role | Alpha (Oct–Dec 26) | Soft launch (Jan–May 27) | Live (Jun 27+) |
|---|---|---|---|
| Producer / PM (Lead Game Designer) | 1 | 1 | 1 |
| Game + economy designer | 1 | 1 | 2 (adds live-ops designer) |
| Tech lead (TypeScript / Three.js) | 1 | 1 | 1 |
| Gameplay engineers | 2 | 2 | 2 |
| Mobile / native engineer (Capacitor, IAP, ads) | 1 | 1 | 0.5 |
| Backend / DevOps engineer (Nakama) | 1 | 1 | 1 |
| 3D / VFX artists | 1 | 2 | 2 |
| UI / UX artist | 1 | 1 | 1 |
| Tech artist / animation (contract) | 0.5 | 0.5 | 0.5 |
| Audio (contract) | 0.25 | 0.25 | 0.25 |
| QA (plus an outsourced device lab) | 0.5 | 1 | 1 |
| Data analyst | — | 0.5 | 1 |
| UA / marketing manager | — | 1 | 1 |
| Community manager | — | 0.5 | 1 |
| **Total** | **~10.25** | **~13.75** | **~15.25** |

A lean variant (4–5 generalists plus contractors) is possible. It roughly doubles the calendar to soft launch and cuts the live-ops cadence to one hero every 2 seasons.

### 9.2 Month-by-month plan

| Month | Milestone | Key deliverables | Exit criteria |
|---|---|---|---|
| **Oct 2026** | Foundation | Tech audit of the prototype. Port to TypeScript modules plus a deterministic 30 Hz sim. Capacitor shells running on 6 test devices. Apple and Google org accounts (D-U-N-S). Backend spike (Nakama). Analytics taxonomy v1. | The game runs at budget on the low-tier reference Android device. |
| **Nov 2026** | Systems online | Nakama auth, cloud save, wallet. RevenueCat sandbox purchases for all SKUs. Custom MAX plugin with test ads. Firebase, Crashlytics, Sentry. Age gate and CMP. Chapters 1–3 content. | End-to-end purchase → webhook → grant works in sandbox. |
| **Dec 2026** | **Alpha** (content complete) | Chapters 1–5 and Gravemaw phases. All 14 skills plus 6 evolutions. 4 heroes, relics, talents. Server-side Soul Altar with pity. Quests, login, Soul Pass S0. Economy sim sheet. TestFlight / Play internal friends-and-family test (50 people). | FTUE beats complete. No blocker bugs. |
| **Jan 2027** | Beta | FTUE polish. Localisation (EN, ES, PT-BR, FR, DE, JA, KO, ZH-Hant, RU, TR). Privacy policy, ratings, store listings. Anti-cheat v1. Load test (10k CCU). **Phase A tech test starts 25 Jan** (PH, MY). | Store approval on both platforms. |
| **Feb 2027** | Tech fixes → retention test | Crash/ANR/performance fixes from Phase A. **Phase B starts 22 Feb** (CA, AU, NZ). Blood Moon and Endless Abyss leaderboards live. | Phase A tech gates passed (`MARKETING.md` §5.2). |
| **Mar 2027** | Retention iteration | 2-week update cycles. A/B tests 1–5 (`LIVEOPS.md` §6). Difficulty-curve tuning from death heatmaps. Creative testing (8 scripts → 30+ variants). | D1 / D7 trending to gates. |
| **Apr 2027** | Monetization test | **Phase C starts 5 Apr** (+ Nordics). Full shop, Soul Pact, Soul Pass seasons, ads mediation tuning. Boss Rush v1. Replay verification live. | Purchases and ads stable. No economy exploits. |
| **May 2027** | Launch readiness | Season 1–3 content complete (2-season buffer). Featuring nominations. Pre-registration. Press kit. Load test (100k CCU). **Go/no-go review 31 May – 4 Jun.** | All gates "Go", or written risk acceptance. |
| **Jun 2027** | **Global launch (14 Jun)** | UA ramp, launch In-App Event, live-ops on-call rota. | Crash-free ≥ 99.5%, store rating ≥ 4.5. |
| **Jul–Sep 2027** | Live S2–S4 | Liora (S2), Osric (S4), Nightmare difficulty, Relic Ascension, hero loadout presets, replay sharing. Coven development. | KPIs within `LIVEOPS.md` targets. |
| **Oct–Dec 2027** | Live S5–S7 | Halloween and winter events, **Covens (S6)**, Legion Raids development. | — |

**If soft-launch gates slip:** global launch moves in 4-week steps (up to 8 weeks). The live-ops calendar shifts with it, because seasons are relative to launch.

### 9.3 Budget range (rough order of magnitude)

Fully loaded team cost depends heavily on location: roughly $6k–$14k per FTE per month blended.

| Line item | Lean indie (4–5 + contractors) | Small studio (~10–14 FTE) |
|---|---|---|
| Team, Oct 2026 – Jun 2027 (9 months) | $250k – $450k | $650k – $1.3M |
| Contract art, audio, trailer | $40k – $90k | $80k – $200k |
| Tools and services pre-launch (Apple $99/yr, Google $25, backend hosting, MMP, Sentry, devices/device cloud, design tools) | $10k – $25k | $20k – $50k |
| QA outsourcing / device lab | $10k – $30k | $25k – $70k |
| Localisation (10 languages, ~15k words + store pages) | $10k – $25k | $20k – $50k |
| Legal and privacy (policies, loot-box review, ratings, trademark) | $10k – $30k | $20k – $60k |
| Soft-launch UA (Phases A–C) | $60k – $120k | $110k – $215k |
| **Subtotal to global launch** | **≈ $0.39M – $0.77M** | **≈ $0.93M – $1.95M** |
| Global launch UA, first 90 days (only if gates pass; scaled by ROAS) | $150k – $600k | $500k – $2M |
| Ongoing live ops (per month after launch) | $35k – $70k + UA | $90k – $170k + $3k–$25k infrastructure + UA |

Reality check: the budget buys a *chance* at a hit, not a hit. The soft-launch gates exist so that the biggest spend (launch UA) happens only after the data says net LTV is above CPI (`MONETIZATION.md` §10).

---

## 10. Top risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| WebView performance on low-end Android (600+ units, bloom) | High | High | Budgets from week 1, instancing and VAT, quality tiers, a low-end device in every daily playtest. Fallback plan: drop Low tier to 3 GB+ only. |
| iOS WKWebView memory kills (WebGL + ad SDK) | Medium | High | Memory budgets, texture compression, release run assets before showing an ad, Sentry memory breadcrumbs. |
| Determinism breaks replay verification | Medium | Medium | Fixed-step sim, seeded PRNG, no `Math.random` in the sim (lint rule), cross-device replay tests in CI. |
| Loot-box regulation changes in a key market | Medium | Medium | BE-mode switch in remote config, legal review per market, odds and pity already exceed most requirements. |
| CPI above LTV | Medium | Critical | Creative velocity, organic and UGC loops, soft-launch kill gates, no launch UA without "Go". |
| Content treadmill burns out the team | Medium | High | 2-season buffer, config-only weekly events, reskin-based holidays, a hero every 2 seasons in the lean plan. |
| Store rejection (IAP, privacy, metadata) | Low–Medium | Medium | Pre-submission checklist, external TestFlight review early in January, no external purchase links. |
