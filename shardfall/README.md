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
npm run balance           # per-hero win rates from bot matches (npm run balance -- 300 nyx kaida)
npm run build             # single-file dist/shardfall.html
cd server && npm ci && npm test   # online server, including a two-browser match
```

**Controls.** Drag on the left half of the screen to move. Hold the red button to attack. Tap a skill to auto-aim it, or drag it to aim, and release over Cancel to call it off. Tap the gold **+** on a skill to learn or upgrade it; with auto-upgrade on (Settings), an unspent point is used for you after 3 seconds. The small button next to Recall is your battle spell. The three buttons at the top right signal your team. Tap the score to open the scoreboard. Settings can move the joystick to the right side.

On a keyboard: WASD to move, Space to attack, Q/E/R for skills, Shift+Q/E/R to upgrade them, F for your battle spell, B to recall, Z/X/C to signal Attack/Retreat/Group up, P for the shop, G to quick-buy, O for the scoreboard and Esc to pause.

---

## 1. Positioning: familiar, but clearly its own game

| | Honor of Kings | Shardfall Arena |
|---|---|---|
| Format | 5v5, three lanes, 15–20 min | **3v3, one lane plus two jungles, ~8 min** (simulated matches average 8 min) |
| Heroes | Chinese history and myth, painted characters | **The "Shardborn": living crystal heroes** with a distinct faceted art style |
| Big objectives | Tyrant / Overlord | **Shard Colossus** (top of the river, from 1:30): empowers your team for 90 seconds and adds Shard Golems to your next three waves. **Abyssal Wyrm** (bottom of the river, from 6:00): every hero on the team that slays it cheats death once in the next 150 seconds |
| Early game | Tower plating | Towers are **fortified for the first 4 minutes** and take reduced damage without friendly minions nearby |
| Kept on purpose | Virtual joystick, auto-target attack button, 3 skills + ultimate, drag-to-aim, quick-buy, kill announcer, ranked tiers, skins, battle pass, monthly card | Same. These are genre conventions players expect, not anyone's IP |

Keep it this way as you add content: your own names, art, sounds and hero designs. Riot and Tencent have taken mobile MOBAs that copied League of Legends to court.

## 2. What's in the game

**Modes**
- **Quick Match:** 3v3 against bots at Easy, Normal or Hard.
- **Hero draft** before every Quick and Ranked match (except your very first):
  - Picks go ally, enemy, enemy, you, ally, enemy, so you see two enemy heroes before you choose.
  - Ranked adds one ban per side first. Banned heroes can't be picked by either team.
  - Bot picks fill what their team lacks (a frontliner, ranged damage, no doubled roles). The enemy answers a fragile backline with its Assassin.
  - You get 25 seconds to pick (15 to ban), and the timer locks in your hovered hero.
  - A one-line hint reads your team's shape ("no frontline yet", "good pick: their backline is fragile").
  - In Quick nobody takes the hero you're hovering. In Ranked the enemy can ban it or take it.
  - If the draft takes every hero you own, any remaining hero is yours as a trial for that match.
- **Ranked:** Bronze → Silver → Gold → Platinum → Diamond → Master → Legend, with three divisions of three stars per tier.
  - Win streaks earn bonus stars, and the match MVP never loses a star.
  - Bronze and Silver are protected from demotion.
  - Bots get tougher as you climb, and every tier has a one-time reward.
- **Shard Brawl:** a random hero (including ones you don't own), level 5 start with gold, no jungle, about 5 minutes.
  - One rule twist each week, the same for everyone, and never the same twist two weeks running:
    - Rapid Fire: cooldowns 40% shorter.
    - Glass Cannons: +30% hero damage, −20% max health.
    - Swiftwind: +25% move speed.
    - Gold Rush: triple passive gold.
    - Shard Storm: river power shards every 30 seconds.
  - The twist shows on the Brawl card and the loading screen, and is announced when the match starts.
- **Titan Raid:** a co-op boss fight. You and two bot allies start at level 9 with 3,500 gold and take on the Shard Titan in the middle of the map. There are no towers, minions or jungle.
  - The Titan's big attacks are telegraphed with red warnings that show exactly where they'll hit:
    - **Shard Slam:** circles under two or three heroes, with a stun.
    - **Prism Beam:** a line.
    - **Shatter Ring:** below half health, a ring around it. Hug the Titan or get far away.
  - Shardlings break off at 75% and 40% health. Renewal shards in the river heal you every 25 seconds.
  - It swings at whoever has hurt it most recently, with tanks and fighters drawing double. Tolvar can taunt it.
  - It enrages at 4:00 and wins at 5:00. Heroes respawn after 8 seconds, and if all three are down at once the raid is lost.
  - Bot allies step out of most warnings (about 9 in 10), take a Renewal shard when hurt and clear Shardlings first.
  - Normal, Hard and Nightmare. Over 30 simulated all-bot runs each, bots clear 97%, 70% and 30%, in a median 2:51, 3:41 and 4:02.
  - The first clear of each difficulty each week pays 10, 20 or 40 gems, and your best time is kept. Raids give coins, pass XP and mastery, but don't touch your rank or PvP stats.
- **Online 3v3:** real players on a server-authoritative match. Bots fill empty slots, and if you disconnect a bot takes over until you reconnect.
- **Training Grounds:** any hero, including ones you don't own yet, against three target dummies in mid lane.
  - Dummies stand still, heal to full a few seconds after the last hit, and stand back up 2 seconds after falling. Towers hold fire.
  - Toggles for no cooldowns, free gold and max level, plus a live DPS meter.
  - Nothing is earned or recorded, so it's a safe place to learn a kit, a spell or a build.

**In a match**
- 12 heroes across 6 roles, with 36 skills: dashes, skillshots, chain lightning, ground zones, hooks, shields, heals, executes, summons, walls and taunts.
- **Tolvar, the Bellwarden** (Tank, the newest hero) keeps enemies in the fight:
  - **Iron Rush:** a charge that carries the first enemy hero to its end and stuns them there. Anyone else in the way is knocked aside.
  - **Toll of Challenge:** taunts nearby enemy heroes for 1 second. They have to walk to Tolvar and attack him, and can't use skills. Battle spells still work, and Shard Purify cleanses it.
  - **Great Bell:** an ultimate that drops a giant bell. Enemy heroes under it take heavy damage and can't leave its ring for 3 seconds. Only Shard Blink gets out.
  - **Unbroken passive:** stuns and slows on him are 30% shorter, and heroes he has taunted deal 25% less damage to him.

  Bots ring the bell in close fights and save the Great Bell for two grouped enemies or a wounded one with a teammate nearby.
- **Quarra, the Shard Artificer** (Mage) builds her own battlefield:
  - **Shard Turret:** a turret that shoots for 12 seconds; up to two stand at once.
  - **Prism Wall:** a wall enemies can't walk or dash through. Enemies caught on its line are thrown to the far side and slowed.
  - **Crystal Bastion:** an ultimate that fires at two enemies and shields allies every second.
  - **Masterwork passive:** her attacks hit turret-marked enemies harder.

  Turret kills and assists count for Quarra, and bots play all three of her tools.
- **Smarter bot team fights:** divers reach past the frontline for squishy carries, tanks and supports peel whoever is attacking a teammate, and the whole team leans toward a shared focus target.
- **Hero passives:** every hero has one, and four of them show stacks over the hero's head so both teams can read them:
  - **Kaida:** Kindling. Skill hits charge an erupting, healing attack.
  - **Orin:** Undertow. Soaked enemies take more from his skills.
  - **Sylva:** Galewind. Every 4th attack hits harder and slows.
  - **Brakka:** Bedrock. An emergency shield when he drops low.
  - **Nyx:** Predator. Bonus damage on wounded heroes, and takedowns reset her dash.
  - **Lumen:** Dawnlight. Her attacks periodically heal the weakest ally.
  - **Vexa:** Overcharge. Every 3rd skill hit stuns.
  - **Drace:** Bloodrage. More attack speed and lifesteal the lower he gets.
  - **Rhea:** Focus. Attacks ramp up on one target.
  - **Oska:** Tidewall. Allies near him take less damage.
  - **Quarra:** Masterwork. Her constructions scale with power, and her attacks punish turret-marked enemies.
  - **Tolvar:** Unbroken. Shorter crowd control on him, and taunted heroes hit him softer.
- **Skill ranks:** every level gives a skill point. You start with one skill and choose which to learn and max. Basic skills go to rank 4 and the ultimate to rank 3 (at levels 4, 7 and 10). Each rank hits harder and recharges faster.
- **One jungler per team:** you, if you bring Shard Smite, or otherwise the bot best suited to it. Both sides get the same treatment.
- Towers that punish diving, with backdoor protection.
- Minion waves, siege minions, two jungle buffs, the Shard Colossus and the Abyssal Wyrm. Bots contest both objectives, and Group up calls the nearer one.
- **Jungle blessings,** each lasting 70 seconds, with a glowing mote at the holder's feet that both teams can see:
  - **Ember Wisp:** Ember Blessing, 10% more damage.
  - **Thornback:** Stoneward Blessing, 20% faster cooldowns and 0.4% of max health back every second.
- **Comeback gold:** while a team trails by 1,500 gold or more, its kills pay 30% more, assists 50% more and tower takedowns 200 instead of 150 per hero. A gold "Comeback gold" tag shows in the HUD while it's on. A lost lane is not a lost match.
- **River Power Shards:** from 2:00 (1:00 in Brawl), two spots in the river each hold a random shard, refilled every 90 seconds. Walk over one to take it:
  - **Haste:** move faster.
  - **Renewal:** heal 35%.
  - **Bulwark:** a 20% shield.
  - **Fury:** 15% more damage.

  Both teams see who took what, and bots detour for a nearby shard.
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
- 16 items with recommended builds and one-tap quick-buy. Storm Bow and Reaper Cleaver add critical strike chance (crits deal 175% and show as gold numbers). Four items have passive effects that counter specific threats:
  - **Witherblade:** halves enemy healing.
  - **Rimefang Bow:** attacks slow.
  - **Spined Carapace:** reflects attack damage.
  - **Nightglass Orb:** skill hits deal %-health damage.
- Bots that lane, last-hit, jungle, fight over objectives, team-fight and retreat, at five strengths.
- **Kill impact:** a zoom punch and gold flash on your kills, plus a beat of slow motion offline.
- **Battle stats after every match:** the team gold lead over time, and each hero's damage to heroes, damage taken and healing done (online too).
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
- **Splash art** for the lobby, hero roster, skin shop and loading screen: one portrait for each of the 12 heroes and each of the 15 skins.
- **Key art** behind the menus.
- **The battlefield** is painted by `npm run paint-map` (`tools/map-painter.js`), from the game's own layout, so it always lines up with the lane, river, towers, camps and tall grass. It renders in headless Chromium at 1.5 pixels per world unit, with a WebP of about 700 KB:
  - The ground: noise-shaded grass, a cobbled lane with curb stones, a river with depth, caustics, foam and sandy banks, and stone plazas, tower pads and rune pads.
  - The landmarks: the Shard altar island, the Wyrm's violet rift and trampled jungle camps with braziers and roots.
  - The scenery: dirt paths, flowers, mushrooms, crystal sprouts and a border forest.
  - Tall props stay in the strips nobody can walk on, so nothing looks like a wall that isn't one.
  - Re-run it after moving anything on the map. If the image is missing, the match draws a simpler map itself.
- **Drawn in code each frame:**
  - Stone-and-crystal tower spires and Heartstone daises, with rubble when they fall.
  - Crystal-soldier minions: shield-bearers, staff casters, crystal-cannon carts and stone Shard Golems.
  - Tall grass that sways and rustles when someone moves through it, with reeds and cattails where it stands in the river.
  - The jungle and river monsters: a fire-spirit Ember Wisp, a thorn-shelled Thornback and a crystal-golem Shard Colossus.
  - Living-world effects: river light that flows downstream, drifting cloud shadows, jungle fireflies, glowing shots and sparks, and a soft vignette. The low graphics setting turns the extras off.
- **In-match sprites** for all 27 looks. Each sprite was generated from its own splash, so a skin looks the same in the shop and in a match. Every sprite faces right, and the game mirrors it when a hero turns. A hero leans into a run, breathes when idle and flashes white when hit. The small hero pictures in menus use them too.

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
- **Tune balance with real players.** Over two pooled runs of `npm run balance -- 300` (600 bot matches per hero), every hero wins 41–57%. Ranged carries lead (Quarra, Sylva and Vexa 56–57%), and the melee divers trail (Nyx 41%, Kaida and Drace 44%). A single 300-game run can swing a hero by up to 10 points, so pool at least two runs before changing numbers. Bot results mostly show how well the AI plays each hero, so real match data should drive the next pass.

## 5. File map

| File | What it holds |
|---|---|
| `web/js/data.js` | Heroes, skills, items, skins, prices, pass, ranks, mastery, achievements, event, chest odds. **Tune the game here** |
| `web/js/match.js` | Match simulation and bot AI. No DOM access, and the server runs this same file |
| `web/js/draw.js` | All rendering: hero sprites (with the drawn crystal as fallback), map, effects, minimap |
| `web/js/hud.js` | Touch and keyboard controls, in-match HUD, shop and scoreboard |
| `web/js/lobby.js` | Menus, modes, hero draft, economy screens, profile, results |
| `web/js/store.js` | Save data, economy and ranked rules, and the test stand-ins for purchases and ads |
| `web/js/platform.js` | Native bridge: RevenueCat purchases, AdMob rewarded video, haptics, Android back button |
| `web/js/net.js` | Online play: connection, matchmaking, and the server-fed match the HUD renders |
| `web/js/audio.js` | Generated background music |
| `server/src/` | Game server: `game.js` (match rooms) and `index.js` (HTTP API, WebSocket, matchmaking) |
