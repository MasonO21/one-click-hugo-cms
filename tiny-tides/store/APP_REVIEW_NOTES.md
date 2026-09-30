# Notes for App Review (paste into App Store Connect → App Review Information → Notes)

Tiny Tides is an offline idle game. There is **no sign-in and no demo account** to enter.

**First launch:** a short guided tutorial (about 2 minutes) teaches digging, placing a rock, hatching an egg and the first evolution. “Skip tips” is available at any time.

**In-app purchases** (all use StoreKit 2; please use the sandbox account):
* Sea Glass packs (consumable), Deep Ocean biome, Golden Hourglass, three decor packs and a Starter Bundle (non-consumable). Open **Shop** (the bag icon in the bottom bar) to buy; **Settings → Restore purchases** restores non-consumables.

**Randomized items (Guideline 3.1.1):** The *Capsule Machine* (pink capsule button on the pool screen after the tutorial) gives one free capsule per day, uses free Capsule Coins, and can also use Sea Glass. The complete odds for every prize, the guaranteed-prize (pity) rules, the weekly spotlight and the price/daily limit are shown in the machine’s **Rates** tab **before any purchase**, and on the website (“Drop rates”). Before the first Sea Glass pull the app checks age: on iOS 26+ with Apple’s Declared Age Range (entitlement `com.apple.developer.declared-age-range`), otherwise with a neutral birth month/year screen — **enter any adult birth date to test paid pulls**. Players under 18 need a parent to turn Sea Glass pulls on and to confirm real-money purchases (a parental gate: type the answer to a multiplication such as 17 × 8). Sea Glass pulls ask for confirmation and show the approximate real-money value, are limited to 20 per day, can be switched off in **Settings → Sea Glass capsule pulls**, and are disabled automatically in regions where paid random items are restricted. Prizes are cosmetic toys or small one-time rewards with no cash value.

**Privacy:** the app collects no data and contains no analytics, ads or third-party SDKs. **Reminders** are optional local notifications requested only after the tutorial.

**Contact:** maceion@proton.me
