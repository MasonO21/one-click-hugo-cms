# App Store Connect — listing copy (paste-ready)

> Field limits are Apple's. Everything below is already within them.

## App information
| Field | Value |
|---|---|
| **Name** (≤30) | `Tiny Tides` — if taken, try `Tiny Tides: Tidepool Idle` |
| **Subtitle** (≤30) | `Cozy idle tidepool creatures` |
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
Arrange rocks and water, welcome tiny creatures and watch them evolve! Check in a few times a day to pop bubbles, open Tide Gifts and discover all 70 forms.
```

**Keywords** (≤100, comma-separated, no spaces)
```
idle,tidepool,cozy,cute,creatures,evolve,ocean,collect,relaxing,pets,crab,jellyfish,aquarium,sea
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

MAKE IT YOURS
• Decorate with sandcastles, lighthouses, lanterns, rubber ducks and more.
• Give your friends hats, crowns and sunglasses.
• Switch pool looks — Bubblegum, Mint Soda, Sunset, Aurora, Sakura and Neon — and add falling petals, fireflies or stardust.
• Snap a picture and share your pool.

DIVE INTO THE DEEP OCEAN (optional)
A glowing second biome with trenches, thermal vents, bioluminescent kelp and 28 new creatures. One purchase, yours forever.

KIND BY DESIGN
No ads. No accounts. No tracking. Your game lives on your device. Optional purchases are cosmetic decor, time-savers and the Deep Ocean biome — nothing is random or pay-to-win, and every purchase can also be earned or simply skipped.

Follow the tide. See who your friends become.

Tiny Tides is free to play with optional in-app purchases. Privacy: no data is collected.
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

## Age rating questionnaire (expected result: **4+**)
| Question | Answer |
|---|---|
| Cartoon / fantasy violence, realistic violence, sexual content, profanity, horror, alcohol/tobacco/drugs, mature themes | None |
| Simulated gambling / contests | None |
| Unrestricted web access | No (only Settings links to the developer's own privacy/terms/support pages) |
| User-generated content / chat / social features | None |
| **Loot boxes / paid random rewards** | **No.** Tide Gifts are free and random, but nothing purchasable is randomized — all purchases are deterministic and listed with exact contents. |
| Medical / wellness | None |

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
• Sea Glass packs (consumable) – speed-up currency and decor.
• Golden Hourglass, three cosmetic bundles, Starter Bundle (non-consumable).
• Deep Ocean biome (non-consumable) – unlocks the second, premium habitat; tap the "Deep" button at the top of the Pool screen to preview and purchase.
Restore Purchases is in Settings (gear icon). Nothing purchasable is randomized.

Reminders (local notifications) are optional and are requested only after the tutorial. There is no tracking, no ads and no data collection.
```

## In-app purchases
See `store/iap-products.md` (generated) for the exact Product IDs, types and prices. For each: Reference Name, Product ID, Price, Display Name + Description (en-US) and one **review screenshot** (use `store/screenshots/iphone-6.9/*` framed shots or a plain Shop screenshot). First-time IAPs must be attached to the app version before submitting.
