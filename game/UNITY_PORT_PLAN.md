# Aether Rift: Warden Clash — Unity Port Plan

Goal: turn the HTML prototype (`game/index.html`) into a shippable iOS and Android game with online matches, ads, purchases and live-ops.

## 1. Decisions up front

| Area | Choice | Why |
|---|---|---|
| Engine | Unity 6 LTS, URP (Universal Render Pipeline), 3D heroes on a 2.5D top-down camera | Best mobile ad and IAP ecosystem; 3D heroes sell skins better than 2D sprites |
| Language | C# | |
| Networking | Photon Fusion 2 (host-authoritative / Shared mode) for v1; dedicated server later if needed | Fast to ship; handles prediction and lag compensation |
| Backend | Unity Gaming Services (Authentication, Cloud Save, Economy, Remote Config, Analytics) or PlayFab | Server-side currency, receipt validation, config |
| Ads | AppLovin MAX mediation (AdMob + Unity Ads + others) | Highest fill and eCPM through mediation |
| IAP | Unity IAP (StoreKit 2 / Play Billing) + server receipt validation | |
| Input | Unity Input System, on-screen stick and buttons | |
| UI | UI Toolkit (menus), uGUI (HUD) | |
| Addressables | Yes, for heroes, skins and VFX | Small first download; content updates without a store release |
| Targets | iOS 15+, Android 8+ (API 26), 60 fps on mid-range phones, build under 150 MB initial | |

## 2. Project structure

```
Assets/
  _Game/
    Core/            # bootstrap, services locator, save, config
    Data/            # ScriptableObjects: HeroDef, SkillDef, SkinDef, PassDef, ShopDef, OddsTable
    Gameplay/
      Sim/           # deterministic-ish combat: Health, Attack, Skill, Status (stun/shield), Minion, Tower, Nexus, Monster
      Heroes/        # HeroController, HeroBrain (bot AI)
      Match/         # MatchManager, WaveSpawner, CampSpawner, XP/Level, WinCondition
      Net/           # Fusion NetworkObjects, input structs
    Meta/            # Home, Heroes, Draw, Pass, Shop, Daily, Rank
    Economy/         # Wallet, Draw (gacha), PassProgress, Purchases, Ads
    UI/              # HUD, joystick, skill buttons, minimap, modals
    Audio/ VFX/ Art/
  Tests/             # EditMode (economy, odds, rank) + PlayMode (combat)
```

## 3. Mapping the prototype to Unity

| Prototype (`index.html`) | Unity |
|---|---|
| `HEROES`, `SKINS`, `SHOP`, `ODDS` constants | ScriptableObjects (`HeroDef`, `SkillDef`, `SkinDef`, `ShopItemDef`, `OddsTable`) plus Remote Config overrides |
| Skill types `dash / shot / aoe / heal / shield` | `SkillDef.Type` enum plus a `ISkillExecutor` per type (strategy pattern) |
| `mkHero`, `update`, `pickTarget`, `dmgTo` | `HeroController`, `TargetingSystem`, `Health.TakeDamage` |
| Minion waves (14 s, 3 per lane) | `WaveSpawner` driven by `MatchConfig` |
| Jungle camps, 45 s respawn | `CampSpawner` and `MonsterBrain` (aggro, leash, heal on reset) |
| Bots | `HeroBrain` finite-state machine (Lane → Fight → Retreat) plus skill rules; becomes the fallback AI for disconnects and for low-population matchmaking |
| `S` save in localStorage | Cloud Save document, authoritative copy on the server |
| `watchAd()` stub | `IAdService` (AppLovin MAX rewarded) with a server-side daily cap |
| `buy()` stub | `IPurchaseService` (Unity IAP) with a receipt-validation Cloud Code function |
| `rollOne()` and pity | Server-side Cloud Code function. **Never roll the draw on the client.** |
| `RANKS` and trophies | Server-side rank service (move to Elo/MMR matchmaking later) |
| WebAudio `sfx()` | `AudioMixer` and pooled `AudioSource`s |
| Canvas drawing | URP scene, hero prefabs, particle VFX, world-space health bars |

## 4. Architecture rules

1. **Server authority for anything with value.** Currencies, draw results, purchases, pass progress, ad rewards and ranked results are written only by backend functions. The client requests, the server decides.
2. **Data-driven balance.** All numbers (HP, damage, cooldowns, draw odds, prices) live in ScriptableObjects and Remote Config so you can tune without a store update.
3. **Gameplay is separated from presentation.** Sim code has no `MonoBehaviour` rendering dependencies, so it's testable and can run on a dedicated server later.
4. **Draw odds are displayed in the UI from the same `OddsTable` the server uses.** This is required by Apple and Google policy and prevents mismatch bugs.
5. **Ad frequency caps and pity are server-validated.** The client can't grant itself rewards.

## 5. Milestones

**M0: Setup (1 week).** Unity project, URP, Git LFS, CI build (GameCI) for iOS/Android, Addressables, coding standards, device test matrix.

**M1: Offline vertical slice (4–5 weeks).** Single-player match against bots, matching the current prototype: 2 lanes, towers, nexus, minions, camps, 4 heroes with greybox 3D, camera, joystick and skill buttons, HUD, minimap. Goal: it feels good at 60 fps on a mid-range phone.

**M2: Meta layer (3–4 weeks).** Home, hero select, hero and skin unlocks, battle pass, daily rewards, shop UI, local wallet behind an `IBackend` interface so M3 can swap in the server.

**M3: Backend and monetization (3–4 weeks).** Auth, Cloud Save, Economy. Server-side draw with pity. IAP with receipt validation. Rewarded ads through MAX with a daily cap. Analytics events (funnel, ARPDAU, ad impressions per DAU).

**M4: Multiplayer (6–8 weeks).** Fusion integration, lobby and matchmaking (3v3 first, 5v5 after), client prediction, reconnect, bot backfill, anti-cheat basics (server validation of movement and cooldowns), ranked ladder with MMR.

**M5: Content and polish (6+ weeks, ongoing).** Final 3D art, animation, VFX, music, 8+ heroes, localization, tutorial and first-time-user experience, accessibility, performance pass.

**M6: Soft launch (4–6 weeks).** Release in 2–3 small markets (e.g. Philippines, Canada, Australia). Measure D1/D7/D30 retention and payer conversion, then tune the economy and ad placement with Remote Config.

**M7: Global launch and live-ops.** Seasonal pass, new hero every 4–6 weeks, events, ranked seasons, esports-style tournaments.

Rough total to soft launch: **8–10 months with a team of about 6** (2 gameplay engineers, 1 backend, 1 UI/tech artist, 1 3D/animation artist, 1 designer/producer). Solo, expect 18–24 months, so plan to buy assets.

## 6. Monetization design, kept compliant

- **Revenue levers:** battle pass (the most reliable), cosmetic skins via the draw, starter and first-purchase offers, gem bundles, rewarded ads (double rewards, free draw, free gems).
- **Required by the stores:** disclose draw odds in-app; restore purchases button; parental-gate or age rules for minors; privacy policy; consent flow (ATT on iOS, UMP/GDPR consent for ads); no ads shown to users who declined consent where required.
- **Keep it cosmetic.** Selling stats or power invites review bombing, refunds and regulator attention, and kills ranked integrity.
- **Guardrails:** spending-limit and purchase-confirmation screens, no fake countdown pressure, and stricter limits and no draw purchases for users flagged under 18 or in regions that require it. Honor of Kings itself added such limits after regulator pressure.
- **Ad placement:** only opt-in rewarded video (post-match double, free draw, free gems). No interstitials during matches. Cap at 6 per day.

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Netcode complexity and lag | Start with 3v3, use Fusion, add bot backfill, test on throttled networks from M4 week 1 |
| Cheating | Server-authoritative economy; validate inputs; rate-limit |
| Art cost | Stylized low-poly, shared rig and animations across heroes, outsource skins |
| Retention drop-off | Soft launch; instrument every funnel step; tune with Remote Config |
| Store rejection | Odds disclosure, IAP restore, privacy, age gate, no copied IP |
| Looking like a clone | Original heroes, setting, and UI. Keep the 2-lane format and jungle camps, but differentiate with the 4-minute match length and ranked ladder |
| Scope creep | Ship 3v3, 8 heroes at soft launch; 5v5 and a third lane come later |

## 8. First two weeks (concrete tasks)

1. Create the Unity 6 project with the structure above and set up CI.
2. Port data into ScriptableObjects (8 heroes, 14 skills, 5 skins, odds, pass levels).
3. Build `Health`, `AttackController`, `SkillExecutor` for dash/shot/aoe/heal/shield, with EditMode tests.
4. Implement `WaveSpawner`, `Tower`, `Nexus`, and a greybox lane map.
5. Build the joystick and the three skill buttons with cooldown UI.
6. Port the bot FSM (Lane → Fight → Retreat) and verify a full bot-vs-bot match runs.
7. Port economy logic (draw, pity, pass XP, rank) as pure C# classes with unit tests that reproduce the prototype's behavior.

## 9. Success metrics for soft launch

| Metric | Target |
|---|---|
| D1 / D7 / D30 retention | 40% / 15% / 6% |
| Payer conversion | 3–5% |
| ARPDAU | $0.15+ blended (IAP + ads) |
| Avg match length | under 6 min |
| Crash-free sessions | 99.5%+ |
| Rewarded ad opt-in rate | 30%+ of DAU |
