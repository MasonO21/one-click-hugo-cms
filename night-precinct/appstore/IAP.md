# In-App Purchases and the Chief's Club subscription

Source of truth: `docs/FACTS.md` section 3. Everything here is Apple In-App Purchase (StoreKit 2). There are no ads and no other payment method.

- **Product ID** = `{{BUNDLE_ID}}.<suffix>`. The token is filled by `tools/apply_config.py`. The IDs in App Store Connect (ASC) must be character-for-character the same as the ones in the app and in the local StoreKit test file `ios/NightPrecinct/Products.storekit`. Both of those are built from your `BUNDLE_ID` and the suffixes below, so they match by construction; copy the IDs for ASC from `release/appstore/IAP.md`, where the token is already filled in. A product ID cannot be re-used once created, even if you delete the product. **Verify in App Store Connect.**
- **Price** is the intended US price. Apple only allows certain price points per storefront (see "Price note" below). The app always shows the real localized price from StoreKit (`displayPrice`), never a hard-coded price.
- **Language:** English (U.S.) only, so each product needs one localization.
- **Family Sharing:** off for everything. Consumables cannot use it. For non-consumables and the subscription, leave it off: I believe that once it is switched on for a product it cannot be switched off again. **Verify in App Store Connect.**
- **Names in the game.** The game shows its own product names in the Store tab and on its purchase sheet (see the "Name in the game" column). It reads only the localized price (`displayPrice`) from StoreKit and never shows StoreKit's `displayName`. Apple's own payment sheet does show the ASC display name, so the display names below use the same words as the game where the game has a name of its own. The local test file `Products.storekit` (rendered from `ios/NightPrecinct/Products.storekit.tmpl`) uses the same display names as this file.

## Summary table

| # | Suffix | Type | Reference Name | Localized Display Name | Name in the game (Store tab) | Price (USD, intended) |
|---|---|---|---|---|---|---|
| 1 | `badges_80` | Consumable | Gold Badges 80 | 80 Gold Badges | Pocketful | 0.99 |
| 2 | `badges_500` | Consumable | Gold Badges 500 | 500 Gold Badges | Handful | 4.99 |
| 3 | `badges_1200` | Consumable | Gold Badges 1200 | 1,200 Gold Badges | Duffel Bag | 9.99 |
| 4 | `badges_2600` | Consumable | Gold Badges 2600 | 2,600 Gold Badges | The Vault | 19.99 |
| 5 | `badges_7000` | Consumable | Gold Badges 7000 | 7,000 Gold Badges | Evidence Room | 49.99 |
| 6 | `badges_15000` | Consumable | Gold Badges 15000 | 15,000 Gold Badges | Federal Reserve | 99.99 |
| 7 | `piggy` | Consumable | Evidence Safe | Evidence Safe | Evidence Safe | 2.99 |
| 8 | `deal_crates` | Consumable | Daily Deal A Crates | Daily Deal: Crate Trio | Crate Trio | 2.99 |
| 9 | `deal_cash` | Consumable | Daily Deal B Cash | Daily Deal: Cash Crate | Cash Crate | 4.99 |
| 10 | `deal_recruit` | Consumable | Daily Deal C Recruits | Daily Deal: Recruit Rush | Recruit Rush | 7.99 |
| 11 | `starter` | Non-Consumable | Rookie Starter Pack | Rookie Starter Pack | Rookie Starter Pack | 1.99 |
| 12 | `pass_premium` | Non-Consumable | Career Pass Premium S1 | Career Pass Premium | Career Pass Premium | 9.99 |
| 13 | `auto_basic` | Non-Consumable | Auto-Clicker | Auto-Clicker | Auto-Clicker | 4.79 (see note) |
| 14 | `auto_combo` | Non-Consumable | Combo Auto-Clicker | Combo Auto-Clicker | Combo Auto-Clicker | 9.59 (see note) |
| 15 | `auto_upgrade` | Non-Consumable | Auto-Clicker to Combo Upgrade | Upgrade to Combo Auto-Clicker | Combo Auto-Clicker (tagged "Upgrade") | 4.79 (see note) |
| 16 | `vip_weekly` | Auto-Renewable Subscription (1 week) | Chief's Club Weekly | Chief's Club (Weekly) | Chief's Club | 4.99 per week |

Sixteen products: 10 consumables, 5 non-consumables, 1 subscription.

## Price note (from `docs/FACTS.md`)

The owner asked for 4.79 and 9.58. Apple only allows certain price points per storefront. The app always shows the real localized price returned by StoreKit (`displayPrice`), never a hard-coded price. In ASC choose 4.79 and 9.59 if those price points exist, otherwise the nearest available. **Verify in App Store Connect** which USD price points exist (I believe most US price points end in 9, so 9.58 is probably not offered and 9.59 is the nearest).

Other things that depend on the price you pick:

- **Precinct Patron rank.** The game adds each purchase's *intended* USD value (the table in `docs/FACTS.md` section 3) to a lifetime spend counter. It does not read the real price from StoreKit. So if you end up on a different price point, the perk thresholds (4.99 / 19.99 / 49.99 / 99.99 / 249.99) still work from the intended values. This is by design, but be aware the two can differ slightly. Chief's Club counts once (its first transaction); weekly renewals only extend the subscription. A refund lowers the counter by the refunded product's intended value (see "Refunds and revoked purchases"). The Career tab shows the counter and the thresholds in US dollars ("Purchases so far, counted in US dollars: US$X. Reach US$Y for ..."), using these intended values in every currency.
- **Description text.** `metadata/en-US/description.txt` states "4.99 USD per week" for Chief's Club. If you change that price, edit the description.
- **Storefront prices.** In ASC you set a base price and Apple fills in the other storefronts. Look through the generated prices before you save. **Verify in App Store Connect.**

## Common settings for every product

- Cleared for Sale: on.
- Availability: the same territories as the app. The app is not offered in Belgium, Brazil, mainland China, Vietnam or Russia (`SUBMISSION_CHECKLIST.md` step 15, `COMPLIANCE_BY_COUNTRY.md`), so the products are not sold there either.
- Tax category: leave the default. **Verify in App Store Connect.**
- Status target: **Ready to Submit** for all sixteen before you submit the app version. The first time, in-app purchases are submitted together with the app version (section "In-App Purchases and Subscriptions" on the version page). **Verify in App Store Connect.**
- No promotional image is required. An optional 1024 x 1024 promotional image is only needed if you want a purchase promoted on the product page. **Verify in App Store Connect.**
- Game screens (checked in the game source and in a desktop browser with a mock bridge): the bottom tab bar reads HQ, Roster, Gear-Up, Cases, Store, Career. The Store tab lists, top to bottom: the Auto-Clickers card, the Rookie Starter Pack (first 48 hours), the Chief's Club card, the Career Pass Premium card, the Evidence Safe, the Daily Deals, the Gold Badge packs, then the Gold Badge spending sections (each Gold Badge price with an approximate money value under the item), and a footer with Restore Purchases, Manage Subscription and Settings. It is a long page: scroll so that the card of the product you are capturing, its price button and (for the packs) the price are all in the picture.
- Review screenshot: every product needs one. It must show the purchase as the player sees it, with the real StoreKit price and the buy button. Capture it from a device or simulator running the app with the StoreKit configuration or a sandbox account. None of the screenshots in `appstore/screenshots/` shows the Store tab, so capture these separately (Simulator: Device > Screenshot). Size: **Verify in App Store Connect** (I believe any current iPhone screenshot size is accepted; older documentation asked for at least 640 x 920 pixels).

## Reachability (read before submitting)

Apple's reviewer must be able to find and buy every product. How the game handles that:

- `starter` is offered for the first 48 hours after the first launch (the game counts from the moment its save is created), so a reviewer on a fresh install sees it. If your build sits in review for long, it is still a fresh install for the reviewer.
- `deal_crates`, `deal_cash`, `deal_recruit` are all listed in the Store tab every day (each can be bought once per calendar day). The crate deal is hidden only when the App Store country or the device region is Belgium or Brazil, where the app is not offered anyway.
- `piggy` (Evidence Safe) always holds at least 20 Gold Badges, so it can be bought on a fresh install.
- `auto_basic` and `auto_combo` are both offered on the Auto-Clickers card on a new save, so both can be bought directly. `auto_upgrade` is the upgrade from the Auto-Clicker. It replaces the Auto-Clicker option on that card once `auto_basic` has been bought (the card is then tagged "Upgrade"). The review notes say so; attach its review screenshot from a device that owns the Auto-Clicker.

The automated test `game/tests/native-mock.js` checks that every product except the upgrade can be opened from the Store tab on a brand-new save: six packs, the Starter Pack, Chief's Club, Career Pass Premium, the Evidence Safe, three Daily Deals, and both Auto-Clicker options (it buys the upgrade in a separate step after the Auto-Clicker). If a reviewer cannot reach a product, the usual outcome is a rejection (Guideline 2.1, in-app purchases must be complete and reachable; **verify the exact guideline number**), so still try a fresh install yourself before you submit.

## Refunds and revoked purchases

A refund reaches the game as the same transaction again with `revoked` set (StoreKit `Transaction.updates`, while the game runs or at the next launch). What the game does then (from `game/src/03-payments.js`, `processTx`, `refundTx` and `revokeUnlock`), once per transaction and only for purchases that were delivered on this device:

- **Gold Badges** (Gold Badge packs, the Evidence Safe, the Daily Deals, the Rookie Starter Pack): the game remembers how many Gold Badges each purchase gave (for its last 300 purchases). On a refund it removes that many from the balance, as far as they have not been spent (the balance never goes below zero), and shows "A purchase was refunded, so its Gold Badges were removed". Other contents that were already delivered (crates, cash, units, Double Time) stay.
- **Precinct Patron**: the refunded product's intended USD value is taken off the lifetime total, so a Patron rank and its income bonus can drop.
- **One-time unlocks** (`auto_basic`, `auto_combo`, `auto_upgrade`, `pass_premium`): the game re-reads what the player still owns from Apple and removes the unlock that is no longer owned (the Auto-Clicker level, or the Career Pass premium track), then shows "A purchase was refunded, so its unlock was removed". The Rookie Starter Pack is not offered again after a refund.
- **Chief's Club**: the benefits end the next time the game checks Apple's entitlements (at launch, when offline earnings are worked out and on Restore Purchases), because a revoked subscription is no longer listed.
- The Purchase Terms page (section 6) describes the same behavior.
- **Check in build** with Xcode's Manage Transactions (Refund) as in the checklist test matrix.

## Gold Badge prices, price loading and the purchase sheet

- **Approximate money value.** Next to Gold Badge prices in the Store (Boosts and Upgrades, Elite Recruits not yet hired, cosmetics not yet owned), under the crates in the Cases tab and on the crate purchase confirmation, the game shows "about <price>": the Gold Badge price times StoreKit's price of `badges_80` divided by 80, in the player's App Store currency. That is the highest price per Gold Badge, so the real cost from a larger pack is lower. The Store footer says: "Money values next to Gold Badge prices are estimates at the price of the smallest Gold Badge pack." The value is not shown until prices have loaded. The smaller Gold Badge spends show it too: inside the streak-restore and offline double/triple buttons, under the Career Pass "Skip tier" button, and as a per-Gold-Badge value under the running jobs for Rush.
- **Buying crates with Gold Badges** always opens a confirmation sheet ("Buy crates") with the number and name of the crates, the price in Gold Badges, the approximate money value, the odds of that crate tier (and, for Elite and Legend, the pity rule), "Buy for N Gold Badges" and Cancel. 1 crate costs 30 / 120 / 300 Gold Badges (Standard / Elite / Legend), 5 crates cost 4.5 times that.
- **Price loading.** Prices come from StoreKit at launch. If that fails, the game tries again after a growing delay (up to once a minute), every time the app becomes active again, and whenever a purchase sheet is opened. Until prices arrive, price buttons read "..." and are greyed out, and an open purchase sheet updates itself when they arrive.
- **While Apple's payment sheet is up**, the game's purchase sheet cannot be closed or replaced (its close and Cancel buttons are hidden, and any other dialog waits its turn); afterwards only that sheet is closed. A second purchase cannot start while one is in progress.

## Products

### 1. `badges_80`

- **Reference Name:** Gold Badges 80
- **Product ID:** `{{BUNDLE_ID}}.badges_80`
- **Type:** Consumable
- **Price (intended):** USD 0.99
- **Family Sharing:** not available for consumables (leave off)
- **Localized Display Name (30 max):** `80 Gold Badges`
- **Localized Description (45 max):** `80 Gold Badges. First purchase adds 80 more.`
- **What it grants:** 80 Gold Badges, plus a one-time +80 first-purchase bonus on the first purchase of this pack.
- **Review screenshot:** Store tab, "Gold Badges" section (six cards in a two-column grid), with the Pocketful card and its real price visible. Until the pack has been bought once the card reads 160 with "First-time 2x" (80 plus the 80 first-time bonus). If the six packs are on one screen, one screenshot can be attached to all six; the safer option is one capture per pack. **Verify in App Store Connect** whether reuse is accepted.

### 2. `badges_500`

- **Reference Name:** Gold Badges 500
- **Product ID:** `{{BUNDLE_ID}}.badges_500`
- **Type:** Consumable
- **Price (intended):** USD 4.99
- **Family Sharing:** not available for consumables (leave off)
- **Localized Display Name (30 max):** `500 Gold Badges`
- **Localized Description (45 max):** `500 + 50 bonus badges. First buy adds 500.`
- **What it grants:** 500 Gold Badges + 50 bonus, plus a one-time +500 first-purchase bonus.
- **Review screenshot:** Store tab, "Gold Badges" section, with the Handful card (reads 1.05K with "First-time 2x" before the first purchase) and its real price visible.

### 3. `badges_1200`

- **Reference Name:** Gold Badges 1200
- **Product ID:** `{{BUNDLE_ID}}.badges_1200`
- **Type:** Consumable
- **Price (intended):** USD 9.99
- **Family Sharing:** not available for consumables (leave off)
- **Localized Display Name (30 max):** `1,200 Gold Badges`
- **Localized Description (45 max):** `1,200 + 200 bonus. First buy adds 1,200.`
- **What it grants:** 1,200 Gold Badges + 200 bonus, plus a one-time +1,200 first-purchase bonus.
- **Review screenshot:** Store tab, "Gold Badges" section, with the Duffel Bag card (reads 2.60K with "First-time 2x" before the first purchase) and its real price visible.

### 4. `badges_2600`

- **Reference Name:** Gold Badges 2600
- **Product ID:** `{{BUNDLE_ID}}.badges_2600`
- **Type:** Consumable
- **Price (intended):** USD 19.99
- **Family Sharing:** not available for consumables (leave off)
- **Localized Display Name (30 max):** `2,600 Gold Badges`
- **Localized Description (45 max):** `2,600 + 600 bonus. First buy adds 2,600.`
- **What it grants:** 2,600 Gold Badges + 600 bonus, plus a one-time +2,600 first-purchase bonus.
- **Review screenshot:** Store tab, "Gold Badges" section, with the The Vault card (reads 5.80K with "First-time 2x" before the first purchase) and its real price visible.

### 5. `badges_7000`

- **Reference Name:** Gold Badges 7000
- **Product ID:** `{{BUNDLE_ID}}.badges_7000`
- **Type:** Consumable
- **Price (intended):** USD 49.99
- **Family Sharing:** not available for consumables (leave off)
- **Localized Display Name (30 max):** `7,000 Gold Badges`
- **Localized Description (45 max):** `7,000 + 2,000 bonus. First buy adds 7,000.`
- **What it grants:** 7,000 Gold Badges + 2,000 bonus, plus a one-time +7,000 first-purchase bonus.
- **Review screenshot:** Store tab, "Gold Badges" section, with the Evidence Room card (reads 16.0K with "First-time 2x" before the first purchase) and its real price visible.

### 6. `badges_15000`

- **Reference Name:** Gold Badges 15000
- **Product ID:** `{{BUNDLE_ID}}.badges_15000`
- **Type:** Consumable
- **Price (intended):** USD 99.99
- **Family Sharing:** not available for consumables (leave off)
- **Localized Display Name (30 max):** `15,000 Gold Badges`
- **Localized Description (45 max):** `15,000 + 5,000 bonus. First buy adds 15,000.`
- **What it grants:** 15,000 Gold Badges + 5,000 bonus, plus a one-time +15,000 first-purchase bonus.
- **Review screenshot:** Store tab, "Gold Badges" section, with the Federal Reserve card (reads 35.0K with "First-time 2x" before the first purchase) and its real price visible.

### 7. `piggy` (Evidence Safe)

- **Reference Name:** Evidence Safe
- **Product ID:** `{{BUNDLE_ID}}.piggy`
- **Type:** Consumable
- **Price (intended):** USD 2.99
- **Family Sharing:** not available for consumables (leave off)
- **Localized Display Name (30 max):** `Evidence Safe`
- **Localized Description (45 max):** `Opens the safe: 20 to 500 collected badges.`
- **What it grants:** the Gold Badges the safe has collected so far (minimum 20, maximum 500).
- **Review screenshot:** Store tab, the Evidence Safe card ("Fills as you play. Holds N Gold Badges (20 to 500).") with its price.
- **Risk to check:** this is a variable-content consumable. Verified in the game: the card shows how many badges the safe holds with the 20 minimum and 500 maximum, and the purchase sheet is titled "Evidence Safe: N Gold Badges", so the amount is shown before the player buys. **Verify in App Store Connect** (and the review guidelines) that this presentation is acceptable.

### 8. `deal_crates` (Daily Deal A)

- **Reference Name:** Daily Deal A Crates
- **Product ID:** `{{BUNDLE_ID}}.deal_crates`
- **Type:** Consumable
- **Price (intended):** USD 2.99
- **Family Sharing:** not available for consumables (leave off)
- **Localized Display Name (30 max):** `Daily Deal: Crate Trio`
- **Localized Description (45 max):** `3 Elite crates + 50 Gold Badges.`
- **What it grants:** 3 Elite crates + 50 Gold Badges. Listed every day, once per day (hidden only when the App Store country or the device region is Belgium or Brazil). The game grants three Elite crates, which are the middle of the three crate tiers; the game calls them "3 Elite crates" and shows their odds on the purchase sheet.
- **Review screenshot:** Store tab, "Daily Deals" section, the Crate Trio card with its price. The crates are randomized; the card itself does not print the odds, the purchase sheet does ("Crates hold random rewards. The odds:" with the Elite crate table). Capture the purchase sheet in a second screenshot if you want the odds on record.

### 9. `deal_cash` (Daily Deal B)

- **Reference Name:** Daily Deal B Cash
- **Product ID:** `{{BUNDLE_ID}}.deal_cash`
- **Type:** Consumable
- **Price (intended):** USD 4.99
- **Family Sharing:** not available for consumables (leave off)
- **Localized Display Name (30 max):** `Daily Deal: Cash Crate`
- **Localized Description (45 max):** `24 hours of income + 200 Gold Badges.`
- **What it grants:** 24 hours of income + 200 Gold Badges. Listed every day, once per day.
- **Review screenshot:** Store tab, "Daily Deals" section, the Cash Crate card with its price.

### 10. `deal_recruit` (Daily Deal C)

- **Reference Name:** Daily Deal C Recruits
- **Product ID:** `{{BUNDLE_ID}}.deal_recruit`
- **Type:** Consumable
- **Price (intended):** USD 7.99
- **Family Sharing:** not available for consumables (leave off)
- **Localized Display Name (30 max):** `Daily Deal: Recruit Rush`
- **Localized Description (45 max):** `+15 of first 6 unit types + 100 Badges.`
- **What it grants:** +15 each of the first six unit types + 100 Gold Badges. Listed every day, once per day.
- **Review screenshot:** Store tab, "Daily Deals" section, the Recruit Rush card with its price.

### 11. `starter` (Rookie Starter Pack)

- **Reference Name:** Rookie Starter Pack
- **Product ID:** `{{BUNDLE_ID}}.starter`
- **Type:** Non-Consumable (one-time)
- **Price (intended):** USD 1.99
- **Family Sharing:** off
- **Localized Display Name (30 max):** `Rookie Starter Pack`
- **Localized Description (45 max):** `300 Badges, 3 crates, 25 units, 2h 2x income.`
- **What it grants:** 300 Gold Badges, 3 Standard crates, 25 free entry-level units and 2 hours of Double Time (double income). Offered for the first 48 hours after first launch. (Where paid random items are switched off, the 3 crates become 90 Gold Badges.)
- **Review screenshot:** Store tab, the Rookie Starter Pack card on a fresh install (delete and reinstall the app, or use Erase save in Settings, then capture within 48 hours). The pack includes 3 Standard crates; the card does not print the odds, the purchase sheet does (Standard crate table).

### 12. `pass_premium` (Career Pass Premium, Season 1)

- **Reference Name:** Career Pass Premium S1
- **Product ID:** `{{BUNDLE_ID}}.pass_premium`
- **Type:** Non-Consumable
- **Price (intended):** USD 9.99
- **Family Sharing:** off
- **Localized Display Name (30 max):** `Career Pass Premium`
- **Localized Description (45 max):** `Unlocks the Season 1 premium reward track.`
- **What it grants:** unlocks the premium reward track (30 tiers) of Season 1, including Elite crates (tiers 5, 15 and 25) and a Legend crate plus 250 Gold Badges (tier 30).
- **Review screenshot:** the Store tab card "Career Pass Premium" ("Season 1", "30 premium tiers, retroactive") with the StoreKit price. The purchase sheet also lists the Elite and Legend crate odds.
- **Planning note:** this product is for Season 1 only. A later season needs a new product ID and a new ASC product. Do not reuse this one.

### 13. `auto_basic` (Auto-Clicker)

- **Reference Name:** Auto-Clicker
- **Product ID:** `{{BUNDLE_ID}}.auto_basic`
- **Type:** Non-Consumable
- **Price (intended):** USD 4.79 (see price note; nearest available if not offered)
- **Family Sharing:** off
- **Localized Display Name (30 max):** `Auto-Clicker`
- **Localized Description (45 max):** `Taps for you 8 times a second at 1.5x power.`
- **What it grants:** taps for the player 8 times per second at 1.5x power, in every world, with an on/off toggle.
- **Review screenshot:** Store tab, the Auto-Clickers card (Auto-Clicker row) with the real price.

### 14. `auto_combo` (Combo Auto-Clicker)

- **Reference Name:** Combo Auto-Clicker
- **Product ID:** `{{BUNDLE_ID}}.auto_combo`
- **Type:** Non-Consumable
- **Price (intended):** USD 9.59 (see price note; nearest available if not offered)
- **Family Sharing:** off
- **Localized Display Name (30 max):** `Combo Auto-Clicker`
- **Localized Description (45 max):** `Auto-taps 8 times a second and builds combo.`
- **What it grants:** same speed as the Auto-Clicker, and every auto-tap builds the tap combo up to x3.0.
- **Review screenshot:** Store tab, the Auto-Clickers card (Combo Auto-Clicker row) with the real price.

### 15. `auto_upgrade` (Upgrade to Combo Auto-Clicker)

- **Reference Name:** Auto-Clicker to Combo Upgrade
- **Product ID:** `{{BUNDLE_ID}}.auto_upgrade`
- **Type:** Non-Consumable
- **Price (intended):** USD 4.79 (see price note; nearest available if not offered)
- **Family Sharing:** off
- **Localized Display Name (30 max):** `Upgrade to Combo Auto-Clicker`
- **Localized Description (45 max):** `Auto-taps now build your tap combo up to x3.`
- **What it grants:** upgrades an owned Auto-Clicker to the Combo Auto-Clicker.
- **Review screenshot:** Store tab, the "Upgrade" card ("Combo Auto-Clicker"). It shows only after the player owns the Auto-Clicker, so buy `auto_basic` first (StoreKit configuration or sandbox), then capture.

### 16. `vip_weekly` (Chief's Club subscription)

- **Reference Name:** Chief's Club Weekly
- **Product ID:** `{{BUNDLE_ID}}.vip_weekly`
- **Type:** Auto-Renewable Subscription, in the subscription group "Chief's Club" (set up below)
- **Duration:** 1 week
- **Price (intended):** USD 4.99 per week
- **Family Sharing:** off
- **Localized Display Name (30 max):** `Chief's Club (Weekly)`
- **Localized Description (45 max):** `1.5x income, 100% offline, +1 job, badges/day`
- **What it grants:** all income x1.5, offline earnings at 100% (minimum 8 hour cap), +1 job slot (shown in the game as an extra squad slot on the Cases tab), bounties auto-collect, 25 Gold Badges per day (claimed with the Claim button on the Chief's Club card, once per calendar day). Offline earnings are worked out only after the subscription has been re-checked with the App Store (the game waits at most 3 seconds), so a renewal while the player was away counts. If the subscription lapses while a job runs in the extra slot, that job stays visible and can still be collected; no new job can be started there.
- **Review screenshot:** the Chief's Club purchase sheet (tap the price on the Chief's Club card). It shows the title, the price with "per week", what is included, the auto-renewal and cancellation wording and links to Terms of Use, Privacy Policy and Purchase Terms. Restore Purchases is not on the sheet; it is in the Store tab footer. See the next section.

## Subscription group: Chief's Club

Create the group first, then the product inside it.

| Setting | Value |
|---|---|
| Subscription Group Reference Name | `Chief's Club` (internal) |
| Group localization, language | English (U.S.) |
| Group localization, Subscription Group Display Name | `Chief's Club` |
| Group localization, custom app name | leave the default so it shows `{{APP_NAME}}`. **Verify in App Store Connect** what this field is called and its limit. |
| Product in the group | `{{BUNDLE_ID}}.vip_weekly` (Reference Name `Chief's Club Weekly`) |
| Subscription level | Level 1. It is the only product in the group, so there are no upgrade, downgrade or crossgrade paths. |
| Subscription duration | 1 week |
| Price | USD 4.99 per week; review the auto-equalized prices for other storefronts. **Verify in App Store Connect.** |
| Family Sharing | off |
| Introductory offer, promotional offers, offer codes | none. `docs/FACTS.md` lists no free trial or discount, and the description and the app do not mention one. Do not add one unless the app and the description are changed to match. |
| Localization (English U.S.) | Display name `Chief's Club (Weekly)`; description `1.5x income, 100% offline, +1 job, badges/day` |
| Review screenshot | the Chief's Club purchase sheet, as described above |
| App Store Server Notifications URL | leave empty. There is no server; the app reads entitlements from StoreKit 2 on the device. |
| App-specific shared secret | not needed (no server validates receipts). |
| Billing grace period | leave the default. **Verify in App Store Connect** the current options and defaults. |

### What the in-app subscription screens show (verified in the game source)

Apple expects the purchase screen for an auto-renewable subscription to show at least: the name of the subscription, its length, the price per period (the billed price must be the most prominent price), what the subscriber gets, the auto-renewal and cancellation wording, functional links to the Terms of Use and the Privacy Policy, and a way to restore purchases. **Verify in App Store Connect** and in the current App Review Guidelines (section 3.1.2; **verify the exact guideline number and sub-letters**).

What the game shows today:

- **The Chief's Club card in the Store tab:** the name, "Weekly subscription" (or the time left when active), the benefits list, the StoreKit price followed by "/ WEEK" on the buy button, and the line "Renews weekly until cancelled. Cancel any time in your Apple Account settings, at least 24 hours before renewal." When the subscription is active the buy button becomes Manage, and a Claim button collects the 25 daily Gold Badges.
- **The purchase sheet** (opened by the price button): "Confirm purchase", the name "Chief's Club (weekly subscription)", the StoreKit price as the largest text with "per week" beside it, the five benefits, the paragraph "Chief's Club renews automatically every week until you cancel. Payment is charged to your Apple Account when you confirm. Cancel at least 24 hours before the end of the current week in Settings, then your name, then Subscriptions. Deleting the app does not cancel it.", a "Buy for <price> / week" button, Cancel, and working links to the Terms of Use, Privacy Policy and Purchase Terms. The price comes from StoreKit (`displayPrice`); the words "per week" are fixed text, because the product is fixed at one week.
- **Restore Purchases** is not on the sheet. It is on the Store tab (footer, the same tab as the Chief's Club card), in Settings and on the Career tab. **Manage Subscription** is in Settings, in the Store footer and on the card when the subscription is active.

If you want Restore Purchases on the sheet itself, that is a change to the game and is not made here; see `README.md`, "Open points in the build". Decide whether the current placement satisfies the guideline before you submit.

### Reviewer notes for the subscription

Paste this into the subscription's "Review Notes" field. Every statement in it was checked against the game source; keep it in step with the game. **Verify in App Store Connect** the field's character limit.

```
Chief's Club is a one-week auto-renewable subscription (product ID {{BUNDLE_ID}}.vip_weekly) in the subscription group "Chief's Club". It is offered on a card in the Store tab: tap the price to open the purchase screen. Benefits, applied on the device from the StoreKit entitlement: all income x1.5, offline earnings at 100% (offline cap of at least 8 hours), +1 job slot, bounties auto-collect, and 25 Gold Badges per day (claimed with the Claim button on the card). There is no free trial or introductory offer. The purchase screen shows the localized price with "per week", the benefits, the renewal and cancellation terms, and links to the Terms of Use, Privacy Policy and Purchase Terms. Restore Purchases and Manage Subscription are in the Settings screen (HQ tab, "Settings and Legal") and at the bottom of the Store tab. The app has no accounts and no server; the entitlement is read from StoreKit on the device.
```

## Check the names and descriptions

Run from the `night-precinct/` folder. It reads this file and prints any Localized Display Name over 30 characters or Localized Description over 45.

```bash
python3 - <<'PY'
import re
t = open('appstore/IAP.md', encoding='utf-8').read()
for label, lim in (('Display Name (30 max)', 30), ('Description (45 max)', 45)):
    for m in re.finditer(r'\*\*Localized ' + re.escape(label) + r':\*\* `([^`]*)`', t):
        s = m.group(1)
        print(f'{len(s):3} / {lim}  {"OK" if len(s) <= lim else "OVER"}  {s}')
PY
```
