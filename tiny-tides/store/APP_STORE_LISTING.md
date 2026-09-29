# App Store Connect — listing copy (paste-ready)

> Field limits are Apple's. Everything below is already within them.

## App information
| Field | Value |
|---|---|
| **Name** (≤30) | `Tiny Tides` — if taken, try `Tiny Tides: Tidepool Idle` |
| **Subtitle** (≤30) | `Cozy tidepool & capsule toys` |
| **Primary category** | Games |
| **Game subcategories** | Simulation, Casual |
| **Secondary category** (optional) | Entertainment |
| **Bundle ID** | `com.tinytides.game` (change with `npm run rename -- com.yourname.tinytides`) |
| **SKU** | `tinytides-ios-001` |
| **Primary language** | English (U.S.) |
| **Price** | Free (with in-app purchases) |
| **Availability** | All territories |
| **Content rights** | You own all content: art is procedurally drawn in code, audio is synthesized in code, UI font is Fredoka (SIL OFL 1.1) |

## Version 1.0 text

**Promotional text** (≤170, editable any time without review)
```
Arrange rocks and water, welcome tiny creatures and watch them evolve! Check in a few times a day, crank the capsule machine and collect 99 tiny toys.
```

**Keywords** (≤100, comma-separated, no spaces)
```
idle,tidepool,cozy,cute,creatures,evolve,ocean,collect,relaxing,gacha,capsule,toys,crab,jellyfish
```

**Description** (≤4000)
```
Build a tiny living tidepool — then check in whenever you like.

Tiny Tides is a cozy idle game about a pocket-sized tidepool. Dig water, place rocks and plant kelp, and little creatures wash ashore as eggs. What they grow into depends on the world YOU arrange around them.

ARRANGE. WAIT. DISCOVER.
• Rocky shores raise Stone, kelp raises Green, ember rocks bring Warmth, pearlite makes things Glow, and deeper water adds Depth and Calm.
• Every creature has three evolutions — and a legendary form for keepers who build the perfect habitat.
• Not sure what a creature will become? Tap it: its evolution tab shows exactly what each form needs.

70 COLLECTIBLE CREATURES
Crabs, snails, starfish, seahorses, jellyfish and octopuses… and in the Deep Ocean: anglerfish, nautili, manta rays and leafy dragons. Fill your Tidedex and earn rewards for every discovery.

MADE FOR SHORT, HAPPY CHECK-INS
• Your pool keeps earning pearls while you’re away. Pop the bubbles when you’re back!
• Tide Gifts wash ashore every morning, afternoon and evening.
• The sky follows your real time of day, and the moon’s real phase brings Spring Tides with bonus pearls.
• Daily quests and a forgiving streak: miss a day and your streak shield has your back.

CAPSULE MACHINE (GACHAPON)
• A free capsule every day, plus Capsule Coins from quests, Tide Gifts and your Tidedex.
• 99 collectible toys: a figure for every creature, golden versions, hats, beach decor, pool looks and effects.
• Fair and transparent: full drop rates are one tap away, a Rare-or-better is guaranteed at least every 10 pulls, and a weekly Spotlight boosts two toys.
• Duplicates turn into shards you can trade for the exact toy you want at the Prize Counter.
• Display your figures on the beach, or tap your Beach Gachapon to pull.

MAKE IT YOURS
• Decorate with sandcastles, lighthouses, lanterns, rubber ducks and more.
• Give your friends hats, crowns and sunglasses.
• Switch pool looks — Bubblegum, Mint Soda, Sunset, Aurora, Sakura and Neon — and add falling petals, fireflies or stardust.
• Snap a picture and share your pool.

DIVE INTO THE DEEP OCEAN (optional)
A glowing second biome with trenches, thermal vents, bioluminescent kelp and 28 new creatures. One purchase, yours forever.

KIND BY DESIGN
No ads. No accounts. No tracking. Your game lives on your device. Optional purchases are cosmetic decor, time-savers, Sea Glass and the Deep Ocean biome. Capsule toys are cosmetic only and never change how fast your creatures earn or evolve. Sea Glass capsule pulls are random with published rates, capped at 20 a day, and can be switched off in Settings; free pulls never run out.

Follow the tide. See who your friends become.

Tiny Tides is free to play with optional in-app purchases, including randomized capsule pulls. Drop rates are shown in the game. Privacy: no data is collected.
```

**What's New** (v1.0)
```
Welcome to Tiny Tides! Dig, decorate and discover.
```

**Support URL** `https://YOUR-HOST/tiny-tides/support.html` · **Marketing URL** `https://YOUR-HOST/tiny-tides/` · **Privacy Policy URL** `https://YOUR-HOST/tiny-tides/privacy.html`
(Host the `site/` folder — see docs/APP_STORE_RELEASE.md §2 — then set the same three links in `src/config.js`.)

**Copyright** `© 2026 YOUR NAME`

## Screenshots (already generated in `store/screenshots/`)
| Slot | Folder | Size |
|---|---|---|
| iPhone 6.9" (required) | `iphone-6.9/` | 1320 × 2868 |
| iPhone 6.5" (optional fallback) | `iphone-6.5/` | 1284 × 2778 |
| iPad 13" (required — app supports iPad) | `ipad-13/` | 2064 × 2752 |

Order: 01 build · 02 evolve · 03 discover · 04 idle · 05 tidedex · 06 deep · 07 decor.
Regenerate any time with `npm run store-shots`. App icon: `assets/icon-only.png` (1024×1024, no alpha) — already installed in the Xcode asset catalog.

## Age rating questionnaire
> **This changed when the Capsule Machine was added.** The game now contains *paid randomized items* (Sea Glass capsule pulls). Answer the loot-box / chance-based purchase question **Yes**; Apple computes the rating from your answers. Expect a rating **higher than 4+** — check the number App Store Connect shows before you plan marketing, and note that some regions apply their own ratings. Do **not** enrol the app in the Kids Category (paid random items are not allowed there).

| Question | Answer |
|---|---|
| Cartoon / fantasy violence, realistic violence, sexual content, profanity, horror, alcohol/tobacco/drugs, mature themes | None |
| Simulated gambling (casino-style games) | None — capsules are collectible toys with no cash-out of any kind |
| **Loot boxes / paid random items** | **Yes.** Capsule Machine pulls cost Sea Glass (or free Capsule Coins). Rates for every item are shown in-app before any spend (Capsule Machine → Rates, and linked from the Sea Glass shop tab). |
| Unrestricted web access | No (only Settings links to the developer's own privacy/terms/support pages) |
| User-generated content / chat / social features | None |
| Medical / wellness | None |

**Loot-box compliance summary** (Guideline 3.1.1: odds must be disclosed before purchase): per-item probabilities for all 106 capsule prizes, tier rates, pity rules, spotlight rules, duplicate conversion and the daily spending limit are listed in *Capsule Machine → Rates*, generated from the same table the game rolls against (a unit test verifies real pull frequencies match). Guardrails: guaranteed Rare+ toy every 10 pulls and Legendary toy every 60, 20 Sea Glass pulls/day cap, confirmation before every Sea Glass spend, a Settings switch that disables Sea Glass pulls entirely, a free daily pull and free Capsule Coins, and a storefront-country switch (`NO_PAID_RANDOM` in `src/config.js`: Belgium and Brazil by default; also off until the App Store region is known) that turns paid pulls off in restricted markets. The website's drop-rate page shows each prize's possible range across all weekly spotlights, and the in-app Rates tab shows the exact chances for the current week.

## App Privacy ("nutrition label")
Select **Data Not Collected**. Reasons: no accounts, no analytics, no advertising, no third-party SDKs, no server. Purchases are handled by Apple. (If you later add analytics, crash reporting or cloud save, update this label *before* shipping that version.)
Tracking: **No**. The bundled `PrivacyInfo.xcprivacy` declares no tracking and no collected data.

## Export compliance
`ITSAppUsesNonExemptEncryption = NO` is already in Info.plist (the app uses only Apple's OS encryption via HTTPS/StoreKit) — answer **No** to the encryption question.

## App Review Information
- **Sign-in required:** No.
- **Contact:** your name, phone, email.
- **Notes for the reviewer** (paste):
```
Tiny Tides is a single-player idle game; no account or network is needed. A short guided tutorial runs on first launch (about 2 minutes).

In-app purchases (all in Settings > gear icon > "Restore purchases", and in the Shop tab):
• Sea Glass packs (consumable) – speed-up currency, decor, and optional Capsule Machine pulls.
• Golden Hourglass, three cosmetic bundles, Starter Bundle (non-consumable).
• Deep Ocean biome (non-consumable) – unlocks the second, premium habitat; tap the "Deep" button at the top of the Pool screen to preview and purchase.
Restore Purchases is in Settings (gear icon).

Capsule Machine (gachapon): tap the pink capsule button on the Pool screen (available after the tutorial). It gives one FREE capsule per day and uses free "Capsule Coins" earned through play. Optionally, Sea Glass can be spent on pulls: a confirmation appears first. The complete drop rates (every item's percentage, pity guarantees and the daily 20-pull limit) are in Capsule Machine > Rates tab, and Sea Glass pulls can be switched off in Settings. Toys are cosmetic and never affect earning or evolution speed; some capsules hold a small one-time reward instead. Sea Glass pulls are disabled automatically in Belgium and Brazil.

Reminders (local notifications) are optional and are requested only after the tutorial. There is no tracking, no ads and no data collection.
```

## In-app purchases
See `store/iap-products.md` (generated) for the exact Product IDs, types and prices. For each: Reference Name, Product ID, Price, Display Name + Description (en-US) and one **review screenshot** (use `store/screenshots/iphone-6.9/*` framed shots or a plain Shop screenshot). First-time IAPs must be attached to the app version before submitting.
