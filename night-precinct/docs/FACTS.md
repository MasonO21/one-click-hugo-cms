# Night Precinct: release facts (single source of truth)

Everything in `legal/`, `appstore/` and `ios/` must agree with this file. If a fact here is wrong, fix it here first.

## 1. What the app is

- **Name:** Night Precinct (working title, needs a trademark search before submission).
- **Subtitle idea:** Idle Police, Fire & EMS Tycoon.
- **Genre:** offline idle / incremental game (Games > Simulation, secondary Strategy).
- **Version:** 1.0.0 (build 1). Minimum iOS 16.0. iPhone and iPad (universal). iPhone portrait only; iPad all orientations, full screen.
- **Three worlds, played in order:** Night Precinct (police), Ember Station (fire), Golden Hour (EMS, hard mode). A world is cleared by reaching its top rank (12 ranks). All art is original vector and canvas artwork drawn in code. No third-party art, music or sound files.
- **Tone:** cartoon, no blood, no weapons shown being fired, no injuries shown. Crooks are cuffed ("BUSTED"), fires are put out ("DOUSED"), patients are treated ("SAVED"). The game is fiction and not affiliated with any real police, fire or EMS agency.
- **Audio:** sound effects and background music are synthesized on the device with Web Audio (no audio files, no licensed music). Each world has its own original music loop, composed in code and rendered once when first needed. "Sound effects" and "Music" are separate switches in Settings. Music starts after the first tap and does not start on its own if another app is already playing audio (iOS `secondaryAudioShouldBeSilencedHint`, read on the device only). The iOS audio session is "ambient": it mixes with other audio and respects the silent switch.
- **First-run tutorial:** a new save gets a short guided start (a pointing hand and one line of text per step): tap the main button, hire the first crew member, a note that crews earn while you are away, then the first Gear-Up upgrade. Every step has "Skip tutorial". Saves that already have progress never see it.
- **Street view size (phones):** a button in the corner of the street scene enlarges it (bigger characters, less room for the lists below) and shrinks it again. The choice is kept in the save.
- **Languages:** English. The game is translation-ready (all text goes through `game/i18n`; see `docs/TRANSLATING.md`). When a translation is added, the game follows the device language and a Language option appears in Settings.

## 2. Data practices (must be exactly true)

- No account, no sign-in, no email or name collected.
- **No analytics, no advertising SDKs, no tracking, no crash-reporting SDK, no third-party SDKs at all.** No IDFA, no App Tracking Transparency prompt.
- **No network requests are made by the game itself.** Fonts are bundled in the app. The only network activity is Apple's own App Store / StoreKit traffic (loading prices, checking purchases and the subscription, making or restoring a purchase), and opening a legal or support web page in the browser when the player taps a link.
- Game progress lives on the device: browser-style local storage inside the app, mirrored to a small file (`save.json`) in the app's Application Support folder. Both are covered by normal iOS device backups (iCloud or computer). There is no cloud sync. Deleting the app without a backup deletes progress.
- The save file contains only game state (currencies, upgrades, timestamps, settings including music, tutorial progress and street view size, a list of recent purchase transaction IDs used to avoid double-granting, and for recent purchases how many Gold Badges each gave, so a refund can take them back). It contains no personal data.
- Purchases are processed entirely by Apple. The developer never sees payment details. The app receives from StoreKit only product IDs and prices, transaction IDs and dates, and the App Store country code (`Storefront.current`). The country code and the device region are used on the device only (country rules in section 4) and are not stored or sent anywhere.
- Permissions requested: none (no camera, microphone, photos, location, contacts, notifications, tracking).
- Children: the app is not in the Kids category and is not directed to children under 13. It collects no personal information from anyone.
- App Privacy "nutrition label" answer: **Data Not Collected**.
- Export compliance: uses no encryption beyond what iOS provides (`ITSAppUsesNonExemptEncryption` = NO).

## 3. Monetization

All purchases are Apple In-App Purchases (StoreKit 2). There are **no ads** and no ad network.

"Gold Badges" are the premium in-game currency. They have no cash value, cannot be transferred, sold, or exchanged, and are only usable inside the game.

Product IDs are `<BUNDLE_ID>.<suffix>`.

| Suffix | Type | Intended price (USD) | What it grants |
|---|---|---|---|
| `badges_80` | Consumable | 0.99 | 80 Gold Badges (+80 first-time bonus on first purchase of this pack) |
| `badges_500` | Consumable | 4.99 | 500 + 50 bonus (+500 first-time) |
| `badges_1200` | Consumable | 9.99 | 1,200 + 200 bonus (+1,200 first-time) |
| `badges_2600` | Consumable | 19.99 | 2,600 + 600 bonus (+2,600 first-time) |
| `badges_7000` | Consumable | 49.99 | 7,000 + 2,000 bonus (+7,000 first-time) |
| `badges_15000` | Consumable | 99.99 | 15,000 + 5,000 bonus (+15,000 first-time) |
| `piggy` | Consumable | 2.99 | Opens the Evidence Safe: the badges it has collected (always at least 20, at most 500), so it can be bought at any time |
| `deal_crates` | Consumable | 2.99 | Daily Deal A, Crate Trio: 3 Elite crates + 50 Gold Badges (listed every day, can be bought once per day; odds shown on the purchase sheet) |
| `deal_cash` | Consumable | 4.99 | Daily Deal B: 24 hours of income + 200 Gold Badges (listed every day, once per day) |
| `deal_recruit` | Consumable | 7.99 | Daily Deal C: +15 each of the first six unit types + 100 Gold Badges (listed every day, once per day) |
| `starter` | Non-consumable | 1.99 | One-time Rookie Starter Pack: 300 Gold Badges, 3 Standard crates, 25 free entry-level units, 2 hours of double income. Offered for the first 48 hours |
| `pass_premium` | Non-consumable | 9.99 | Career Pass Premium (Season 1): unlocks the premium reward track (30 tiers) |
| `auto_basic` | Non-consumable | 4.79 (see note) | Auto-Clicker: taps for the player 8 times per second at 1.5x power, in every world, on/off toggle |
| `auto_combo` | Non-consumable | 9.59 (see note) | Combo Auto-Clicker: same speed, every auto-tap builds the tap combo up to x3.0 |
| `auto_upgrade` | Non-consumable | 4.79 (see note) | Upgrade from Auto-Clicker to Combo Auto-Clicker |
| `vip_weekly` | **Auto-renewable subscription**, 1 week, group "Chief's Club" | 4.99 per week | Chief's Club: all income x1.5, offline earnings at 100% (minimum 8 hour cap), +1 job slot, bounties auto-collect, 25 Gold Badges per day |

Price note: the owner asked for 4.79 and 9.58. Apple only allows certain price points per storefront. The app always shows the real localized price returned by StoreKit (`displayPrice`), never a hard-coded price. In App Store Connect choose 4.79 and 9.59 if those price points exist, otherwise the nearest available.

Spending-linked perk: "Precinct Patron" rank. Each purchase adds its intended USD value (table above) to a lifetime spend counter kept in the save file; reaching 4.99 / 19.99 / 49.99 / 99.99 / 249.99 gives a permanent +5% / +10% / +15% / +25% / +40% income bonus. Chief's Club counts once (its first transaction), not for weekly renewals. A refund takes the value off again (and also removes the refunded purchase's unspent Gold Badges and any one-time unlock). This is derived on device, not from any server.

In-game (non-money) spending of Gold Badges (each Store price also shows an approximate real-money value at the rate of the smallest pack): crates (with a confirmation that shows the odds), instant job completion, time warps, double-time boosts, offline-earnings cap upgrades (4h / 8h / 24h), extra job slots, elite recruits (permanent multipliers), cosmetics (vehicle skins, skylines), streak restore, offline-earnings double (6 badges) and triple (15 badges).

Free ways to earn Gold Badges: achievements, daily roll call, timed jobs, bounty targets, the Career Pass free track, crates, and a small amount from levelling.

### Free rewards (replace ads)

- **Rally Boost:** claim a free 2x income boost for 15 minutes, available every 3 hours.
- **Supply Drop:** claim one free standard crate every 6 hours.
- **Daily Roll Call:** 7-day streak calendar. A broken streak can be restored for 15 Gold Badges or restarted free.
- Bounty targets (a running character to tap), timed jobs, achievements, Career Pass free track.

## 4. Randomized crates (loot boxes): odds are shown in the app and on the web

Crates contain randomized rewards. Crates can be earned free (jobs, bounties, daily rewards, Career Pass, Supply Drop) or bought with Gold Badges, and they come in the Starter Pack, the Crate Trio deal and on the paid Career Pass track. Odds are shown before every purchase that includes crates. Odds:

| Crate | Cash | Gold Badges | Common gear | Rare gear | Epic gear | Legendary gear |
|---|---|---|---|---|---|---|
| Standard (Evidence Locker / Gear Locker / Supply Cabinet) | 55% | 25% | 15% | 5% | 0% | 0% |
| Elite (Sealed Case / Toolbox Crate / Trauma Kit Case) | 25% | 25% | 0% | 30% | 17% | 3% |
| Legend (Vault Drop / Station Safe / Med Vault) | 10% | 20% | 0% | 20% | 35% | 15% |

- Cash reward: standard about 10 minutes of income, elite 1 hour, legend 4 hours (x0.8 to x1.4 random).
- Gold Badges reward: standard 3-8, elite 15-40, legend 60-150.
- Gear is a permanent income bonus per level: Common +1%, Rare +3%, Epic +6%, Legendary +12%. Max level 10 per item. A duplicate of a maxed item pays 3 Gold Badges.
- Pity: opening elite or legend crates guarantees at least one Epic-or-better gear item within every 10 opens.
- Buying crates with Gold Badges: standard 30, elite 120, legend 300 (or 5 for 4.5x that price), always through a confirmation that shows the odds and the approximate real-money value.
- `PAID_RANDOM=true` in `game/src/00-platform.js`. Setting it to false turns every paid random item into a fixed reward (no crate buying, no Crate Trio, badges instead of crates in the Starter Pack and on the pass).
- **Distribution:** the app is NOT offered in Belgium or Brazil (paid loot boxes are banned there), nor in mainland China, Vietnam, Russia or Japan (see `appstore/COMPLIANCE_BY_COUNTRY.md`). Automatic availability in new storefronts is switched off in App Store Connect.
- Safety net: if the App Store country or the device region is Belgium (`BE`) or Brazil (`BR`) the app switches off paid random rewards: no buying crates with Gold Badges, no Crate Trio deal, the Starter Pack crates become 90 Gold Badges, and the Career Pass tiers that give crates give fixed Gold Badges instead (free 15, premium 60, premium tier 30: 400). The region is the App Store storefront country (StoreKit `Storefront.current`, read at launch and whenever the app becomes active) or the device region (read at launch); either one being BE or BR applies the rule. Free crates earned by playing are unchanged.

## 5. Age suitability and content descriptors (for the questionnaire)

- Cartoon violence: none shown as violence. Characters are cuffed, fires are extinguished, patients are treated.
- No profanity, no sexual content, no alcohol/tobacco/drugs, no horror, no medical advice (EMS theme is a cartoon idle game), no user-generated content, no chat, no web browsing inside the app.
- Contains in-app purchases, including paid random items (loot boxes) with disclosed odds. No real-money gambling, no simulated casino games.
- Age rating: the loot-box question is answered **Yes**. Under Apple's current age-rating system that gives **9+** worldwide and **16+** in Australia (see `appstore/AGE_RATING.md`). Answer honestly and accept the rating Apple assigns.

## 6. Third-party components

- Fonts (SIL Open Font License 1.1), bundled as files: Big Shoulders Display, Barlow Semi Condensed, Share Tech Mono (all from Google Fonts / Fontsource). License texts are in `game/fonts/`.
- No other third-party code or assets. Apple system frameworks only (UIKit, WebKit, StoreKit, SafariServices, AVFoundation).

## 7. Config tokens

These tokens appear as `{{TOKEN}}` in templates and are filled from `release.config.json` by `tools/apply_config.py`:
`APP_NAME`, `APP_SUBTITLE`, `BUNDLE_ID`, `TEAM_ID`, `COMPANY_NAME`, `COMPANY_ADDRESS`, `CONTACT_EMAIL`, `PRIVACY_EMAIL`, `WEBSITE_URL`, `SUPPORT_URL`, `PRIVACY_URL`, `TERMS_URL`, `PURCHASE_TERMS_URL`, `ODDS_URL`, `NOTICES_URL`, `GOVERNING_LAW`, `EFFECTIVE_DATE`, `VERSION`, `BUILD`, `YEAR`.

The templates must never contain the owner's real personal details. Defaults are obvious placeholders.
