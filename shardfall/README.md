# Shardfall Arena

An original mobile MOBA: fast 3v3 battles with crystal heroes. It's built to feel familiar to Honor of Kings, Mobile Legends and Wild Rift players without copying any of them. Play it offline against bots or online against real players.

| Folder | What it is |
|---|---|
| `web/` | The game: plain HTML, CSS and JavaScript, with no build step. Open `web/index.html`, or run `npm start` for the installable offline web version |
| `ios/`, `android/` | Capacitor native projects with icons, splash screens and landscape lock |
| `server/` | Online game server: matchmaking, authoritative matches, accounts, cloud save, leaderboard ([server/README.md](server/README.md)) |
| `docs/APP_STORE.md` | **Step-by-step release checklist** for the App Store and Google Play |
| `tests/`, `server/test/` | Automated tests. CI runs them on every push (`.github/workflows/shardfall.yml`) |
| `art/manifest.json` | The Higgsfield splash art, key art and in-match sprites: each image's job id and source URL |
| `tools/` | Icon/splash generator, art downloader (`fetch-art.mjs`), local server, platform check |

```bash
cd shardfall
npm ci
npm start                 # play at http://localhost:5173
npm test                  # game rules: every skill, full matches, economy, saves
npm run test:ui           # every screen at phone and desktop sizes, each offline mode
npm run test:platform     # PWA, offline play, native fallbacks
npm run build             # single-file dist/shardfall.html
cd server && npm ci && npm test   # online server, including a two-browser match
```

**Controls.** Drag on the left half of the screen to move. Hold the red button to attack. Tap a skill to auto-aim it, or drag it to aim, and release over Cancel to call it off. The small button next to Recall is your battle spell. The three buttons at the top right signal your team. Tap the score to open the scoreboard. Settings can move the joystick to the right side.

On a keyboard: WASD to move, Space to attack, Q/E/R for skills, F for your battle spell, B to recall, Z/X/C to signal Attack/Retreat/Group up, P for the shop, G to quick-buy, O for the scoreboard and Esc to pause.

---

## 1. Positioning: familiar, but clearly its own game

| | Honor of Kings | Shardfall Arena |
|---|---|---|
| Format | 5v5, three lanes, 15–20 min | **3v3, one lane plus two jungles, ~8 min** (simulated matches average 8 min) |
| Heroes | Chinese history and myth, painted characters | **The "Shardborn": living crystal heroes** with a distinct faceted art style |
| Big objective | Tyrant / Overlord | **Shard Colossus** at the river. Taking it empowers your team for 90 seconds and adds Shard Golem siege minions to your next three waves |
| Early game | Tower plating | Towers are **fortified for the first 4 minutes** and take reduced damage without friendly minions nearby |
| Kept on purpose | Virtual joystick, auto-target attack button, 3 skills + ultimate, drag-to-aim, quick-buy, kill announcer, ranked tiers, skins, battle pass, monthly card | Same. These are genre conventions players expect, not anyone's IP |

Keep it this way as you add content: your own names, art, sounds and hero designs. Riot and Tencent have taken mobile MOBAs that copied League of Legends to court.

## 2. What's in the game

**Modes**
- **Quick Match:** 3v3 against bots at Easy, Normal or Hard.
- **Ranked:** Bronze → Silver → Gold → Platinum → Diamond → Master → Legend, with three divisions of three stars per tier.
  - Win streaks earn bonus stars, and the match MVP never loses a star.
  - Bronze and Silver are protected from demotion.
  - Bots get tougher as you climb, and every tier has a one-time reward.
- **Shard Brawl:** a random hero (including ones you don't own), level 5 start with gold, no jungle, about 5 minutes.
- **Online 3v3:** real players on a server-authoritative match. Bots fill empty slots, and if you disconnect a bot takes over until you reconnect.

**In a match**
- 10 heroes across 6 roles, with 30 skills: dashes, skillshots, chain lightning, ground zones, hooks, shields, heals and executes.
- Towers that punish diving, with backdoor protection.
- Minion waves, siege minions, two jungle buffs and the Shard Colossus.
- Tall grass that hides heroes, plus invisibility. Recall to base.
- **Battle spells.** Before a match, pick one of six for your hero:
  - **Blink:** a short teleport.
  - **Mend:** heals you and nearby allies.
  - **Shard Smite:** true damage to a monster or minion. Junglers take it, and it can steal the Colossus.
  - **Sprint:** move faster for a few seconds.
  - **Purify:** breaks stuns and slows.
  - **Shatter:** an execute that grows with the target's missing health.

  Spells unlock with account level, and your choice is remembered per hero. Bots bring the spell that suits their role and use it when it pays off. The spell button glows when Smite or Shatter would land the kill.
- **Quick signals:** Attack, Retreat and Group up. Bot teammates obey them for a few seconds and answer in the feed. "Group up" means "take the Colossus" while it's awake. Online, signals go to your team only.
- **Death recap:** while you wait to respawn, see who killed you and what hurt most in your last 10 seconds, split into attacks and skills.
- 12 items with recommended builds and one-tap quick-buy.
- Bots that lane, last-hit, jungle, fight over objectives, team-fight and retreat, at five strengths.
- Announcer calls (First Blood, multi-kills, Ace, Shutdown), a scoreboard, generated music and sound, a low-power graphics mode and left-handed controls.

**Progression and economy**
- **Heroes:** a free weekly rotation, unlockable with coins (earned) or gems (premium). **Hero mastery** levels pay rewards.
- **Skins:** 25 in 7 tiers (Classic, Rare, Epic, Legendary, plus Pass, Ranked and Event exclusives). Skins change in-match visuals, so other players see them.
- **Shop and passes:** gem shop, Starter Pack, Aether Card (30-day), and a 30-tier Shard Pass with free and Elite tracks.
- **Chests:** odds published in-game, a pity guarantee, and a Shard Exchange for duplicates.
- **Daily habits:** daily and weekly missions, a 7-day login calendar, and opt-in rewarded videos.
- **Stormfront Festival:** an event that pays tokens from every match, spent in an exchange with an event-exclusive skin.
- **Profile:** rank and rank rewards, career stats, most-played heroes, match history, and 13 achievements that pay gems.
- **Settings:** a monthly spending limit, purchase history, cloud save (online) and in-app account deletion.

**Art.** All of it was made with Higgsfield:
- **Splash art** for the lobby, hero roster, skin shop and loading screen: one portrait for each of the 10 heroes and each of the 15 skins.
- **Key art** behind the menus.
- **In-match sprites** for all 25 looks. Each sprite was generated from its own splash, so a skin looks the same in the shop and in a match. Every sprite faces right, and the game mirrors it when a hero turns. A hero leans into a run, breathes when idle and flashes white when hit. The small hero pictures in menus use them too.

Run `node tools/fetch-art.mjs` to download everything into `web/assets/art/` as WebP (about 4.5 MB). Sprites are trimmed to the figure and placed on a shared 400×400 frame with the feet on one baseline. If any file is missing, that picture falls back to the drawn crystal hero, so the game always works. Check Higgsfield's terms for commercial use before shipping.

## 3. Monetization design

Mobile MOBA revenue comes mostly from **cosmetics people show off in front of other players**, plus **recurring passes**. Selling power kills player-vs-player retention, and retention is the whole business.

| Product | Price | Why it works |
|---|---|---|
| Starter Pack (once) | $1.99 | Turns a non-payer into a payer cheaply. First purchases predict later ones |
| Gem packs | $0.99 – $99.99 | Standard store price tiers. Each pack's first purchase is doubled |
| Aether Card | $4.99 / 30 days | 300 gems now + 60 per day you log in (2,040 total). Drives daily logins |
| Elite Shard Pass | 688 gems (~$10) per season | Three exclusive skins, +20% pass XP, 280 gems back. Renews every season |
| Skins | 288 / 588 / 888 gems | Rare / Epic / Legendary. Bots and other players wear them in matches, which advertises them |
| Aether Chest | 120 gems | Odds shown before purchase. Epic skin guaranteed within 50 chests |
| Pass tier skip | 75 gems | Impulse buy near the end of a season |

**Free sources of gems:**
- Shard Pass tiers
- Achievements
- Ranked rewards
- Mastery levels
- The 7-day login calendar

Free gems teach non-payers what gems are worth, and that is what converts them.

**Rewarded videos** are opt-in and capped per day:
- **Coin cache:** 5 per day.
- **Free chest:** 1 per day.
- **Double coins after a match:** 3 per day. This usually earns the most, because it comes at a moment of success.

**Coins vs gems.** Coins are earned only by playing, and every hero can be unlocked with coins. That is what lets you honestly say "not pay-to-win".

### Left out deliberately

- **No hidden odds.** App Store guideline 3.1.1 requires odds before any randomized purchase. Some countries (Belgium, for example) treat paid loot boxes as gambling, so be ready to turn paid chests off by region.
- **No fake countdown timers and no one-tap purchases.** Every gem spend asks for confirmation. The FTC made Epic refund $245M over purchase "dark patterns" in Fortnite.
- **No selling stats.** It would wreck matchmaking fairness and long-term retention.
- **A parental spending limit**, plus in-app data deletion. These help with age ratings and press, and cut chargebacks.

## 4. Releasing it

Everything code can do is done. What's left needs your accounts and keys:
- Apple and Google developer accounts
- RevenueCat and AdMob keys, and the store products
- Hosting the game server
- Filling in the legal templates

Follow **[docs/APP_STORE.md](docs/APP_STORE.md)** step by step.

**Before a real launch at scale:**
- **Make currency server-authoritative.** Grant gems from a purchase webhook on the server rather than in the client.
- **Move server storage** from a JSON file to a database.
- **Add an analytics SDK** to measure D1/D7/D30 retention and payer conversion.
- **Commission art and audio.** The procedural crystal art and generated music are consistent and shippable, but professional assets raise conversion.
- **Plan content.** Ship a new hero or skin line every 2–4 weeks, a new pass each season, and rotating festivals. In this genre, content cadence and spending on user acquisition drive revenue far more than any single feature.
- **Animate the sprites.** Heroes are single still poses today. Next up are attack and skill pose frames for each hero (from the same Higgsfield references), swapped in while attacking or casting.
- **Tune balance with real players.** In 120 simulated bot matches every hero wins 38–63% of the time, but bot results mostly show how well the AI plays each hero.

## 5. File map

| File | What it holds |
|---|---|
| `web/js/data.js` | Heroes, skills, items, skins, prices, pass, ranks, mastery, achievements, event, chest odds. **Tune the game here** |
| `web/js/match.js` | Match simulation and bot AI. No DOM access, and the server runs this same file |
| `web/js/draw.js` | All rendering: hero sprites (with the drawn crystal as fallback), map, effects, minimap |
| `web/js/hud.js` | Touch and keyboard controls, in-match HUD, shop and scoreboard |
| `web/js/lobby.js` | Menus, modes, economy screens, profile, results |
| `web/js/store.js` | Save data, economy and ranked rules, and the test stand-ins for purchases and ads |
| `web/js/platform.js` | Native bridge: RevenueCat purchases, AdMob rewarded video, haptics, Android back button |
| `web/js/net.js` | Online play: connection, matchmaking, and the server-fed match the HUD renders |
| `web/js/audio.js` | Generated background music |
| `server/src/` | Game server: `game.js` (match rooms) and `index.js` (HTTP API, WebSocket, matchmaking) |
