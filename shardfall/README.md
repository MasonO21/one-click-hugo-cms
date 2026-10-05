# Shardfall Arena

A playable prototype of an original mobile MOBA. It's built to feel familiar to Honor of Kings, Mobile Legends and Wild Rift players without copying any of them.

- `web/` is the game: plain HTML, CSS and JavaScript with no build step and no dependencies. Open `web/index.html` in a browser.
- `node build.mjs` bundles it into a single file at `dist/shardfall.html`.

Controls: drag on the left half of the screen to move. Hold the red button to attack. Tap a skill to auto-aim it, or drag it to aim yourself. On a keyboard: WASD to move, Space to attack, Q/E/R for skills, F to blink, B to recall, P for the shop and G to quick-buy.

---

## 1. Positioning: familiar, but clearly its own game

| | Honor of Kings | Shardfall Arena |
|---|---|---|
| Format | 5v5, three lanes, 15–20 min | **3v3, one lane plus two jungles, ~8 min** (simulated matches run 5–12 min) |
| Heroes | Chinese history and myth, painted characters | **The "Shardborn": living crystal heroes** with a distinct faceted art style |
| Big objective | Tyrant / Overlord | **Shard Colossus** at the river. Taking it empowers your team for 90s and adds Shard Golem siege minions to your next three waves |
| Early game | Tower plating | Towers are **fortified for the first 4 minutes** (take half damage) and take reduced damage without friendly minions nearby |
| Kept on purpose | Virtual joystick, auto-target attack button, 3 skills + ultimate, drag-to-aim, in-match quick-buy, kill announcer, skins, battle pass, monthly card | Same. These are genre conventions players expect, not anyone's IP |

**What makes it feel familiar:** the controls and HUD layout, the match flow (lane, towers, jungle, base), and the meta loop (pass, skins, missions, daily login).

**What keeps it from reading as a copy:**
- A shorter 3v3 format.
- Its own art direction.
- Its own names, lore and objective.
- No reused UI art, icons, sounds or hero kits.

Keep it that way as you add content. Riot and Tencent have taken mobile MOBAs that copied League of Legends to court.

## 2. What's in the prototype

**Match**
- 6 heroes, 18 skills.
- Towers with target priority, a ramping damage penalty for diving, and backdoor protection.
- Minion waves, siege minions and jungle camps with buffs.
- The Shard Colossus.
- Tall grass that hides heroes, plus invisibility.
- Recall and Blink.
- 12 items with recommended builds and one-tap quick-buy.
- Bot AI on 3 difficulty levels. Bots lane, last-hit, jungle, contest objectives, team-fight, retreat and recall.
- Kill streaks, multi-kills, Ace and Shutdown announcements.

**Meta game**
- Hero roster with a free weekly rotation.
- 15 skins in 5 tiers. Skins change in-match visuals (colors, crowns, aura particles), so other players see them.
- Gem shop, Starter Pack, Aether Card (monthly), and a 30-tier battle pass with free and Elite tracks.
- Chests with published odds and pity, plus a Shard Exchange.
- Daily and weekly missions, a 7-day login calendar, and rewarded-video placements.
- Account levels, a post-match results screen with MVP, and a first-match tutorial.
- Settings with a monthly spending limit and purchase history.

## 3. Monetization design

Mobile MOBA revenue comes mostly from **cosmetics people show off in front of other players**, plus **recurring passes**. It doesn't come from selling power: pay-to-win kills PvP retention, and retention is the whole business.

| Product | Price | Why it works |
|---|---|---|
| Starter Pack (once) | $1.99 | Converts a non-payer into a payer cheaply. First purchases predict later ones |
| Gem packs | $0.99 – $99.99 | Standard App Store tiers. Each pack's first purchase is doubled |
| Aether Card | $4.99 / 30 days | 300 gems now + 60/day if you log in (2,040 total). Drives daily logins |
| Elite Shard Pass | 688 gems (~$10) per season | Two exclusive skins, +20% pass XP, 280 gems back. Renews every season |
| Skins | 288 / 588 / 888 gems | Rare / Epic / Legendary. Bots wear them in matches, which advertises them |
| Aether Chest | 120 gems | Odds shown before purchase. Epic skin guaranteed within 50 chests |
| Pass tier skip | 75 gems | Impulse buy near the end of a season |

**Rewarded video placements.** All are opt-in and capped per day, to protect retention and ad fill rates:
- **Coin cache:** 5 per day.
- **Free chest:** 1 per day.
- **Double coins after a match:** 3 per day. This usually performs best, because it fires at a moment of success.

**Coins vs gems.** Coins are earned only by playing, and every hero can be unlocked with coins. Gems are the premium currency. This split is what lets you say "not pay-to-win" truthfully.

### Things deliberately left out, and why

These choices are about compliance and long-term revenue, not just taste.

- **No hidden odds.** App Store Review Guideline 3.1.1 requires odds to be disclosed before any purchase of a randomized item. Some countries, Belgium for example, treat paid loot boxes as gambling, so be ready to turn paid chests off by region.
- **No fake countdown timers and no purchases on a single tap.** Every gem spend has a confirmation step. The FTC made Epic pay $245M in refunds over purchase "dark patterns" in Fortnite.
- **No selling stats.** It would wreck matchmaking fairness and day-30 retention.
- **A spending limit.** Many young players play this genre. A parental spending limit is cheap to build, helps with your age rating and press, and reduces chargebacks. If you target under-13s, COPPA applies.

## 4. Getting it onto the App Store

### Fastest path: wrap this build

1. Wrap `web/` with **Capacitor**: `npm i @capacitor/core @capacitor/cli @capacitor/ios`, then `npx cap init`, `npx cap add ios`, `npx cap open ios`. Lock the app to landscape in Xcode.
2. Replace the two stand-ins in `web/js/store.js`. Nothing else in the game calls a platform SDK.
   - `SF.iap.buy` → StoreKit 2, for example via RevenueCat's Capacitor plugin. Apple requires its own in-app purchase system for digital goods.
   - `SF.ads.showRewarded` → AdMob or AppLovin MAX rewarded video. Add the App Tracking Transparency prompt and a privacy manifest.
3. Move the save game from `localStorage` to a server. Otherwise players can edit their own gem balance, and progress is lost when they reinstall.

### What a real Honor of Kings competitor still needs

This prototype plays against bots. The genre's revenue depends on **real-time PvP**, which needs:
- **A server-authoritative match server**, such as Photon Fusion, Nakama or a custom server running the same simulation. `match.js` already keeps every game rule in a fixed-tick update loop with no rendering inside it, which is the shape a server simulation needs. You'd swap `Math.random` for a seeded RNG.
- **Matchmaking and ranking**, plus anti-cheat and reconnect support.
- **Accounts and friends**, along with live operations tooling and analytics. Track D1/D7/D30 retention, payer conversion and ARPDAU.
- **A content pipeline.** Successful MOBAs ship a new hero or skin line every few weeks. That cadence, plus spending on user acquisition, drives revenue far more than any single feature.
- **Professional art and audio.** The procedural crystal art is a placeholder that sets the style.

Many teams rebuild in Unity at this stage for performance and tooling. In that case, treat this repo as the playable design spec.

## 5. File map

| File | What it holds |
|---|---|
| `web/js/data.js` | Heroes, skills, items, skins, prices, pass, missions, chest odds. **Tune the game here** |
| `web/js/match.js` | Match simulation and bot AI. No DOM access |
| `web/js/draw.js` | All rendering: hero art, map, effects, minimap |
| `web/js/hud.js` | Touch and keyboard controls, in-match HUD and shop |
| `web/js/lobby.js` | Menus, economy screens, results |
| `web/js/store.js` | Save data, economy rules, and the IAP and ad stand-ins |
