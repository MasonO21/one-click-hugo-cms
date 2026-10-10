# Rainkeep launch plan: from a closed test to the stores

Rainkeep has more content than most games at launch. What decides whether it can be popular is what only real
players show: whether they understand the first session, come back the next day and the next week, and whether a
few of them pay. This plan gets those answers as cheaply as possible, in three steps, and only spends real money
on players once the numbers say it will come back.

## Step 1 · Closed test (now, free)

**What:** 20 to 50 people play the claude.ai link for two weeks.

**How:**
1. Open the game's link, then **Share** it with each tester at **Contributor** access (Viewers and Commenters can
   play but not join the online side or send reports). Testers need a claude.ai account in your organization or
   an email invitation.
2. Tell them three things: play at least once a day for a week, use **Menu → Feedback** for anything confusing,
   slow or broken, and invite each other into a Caravan.
3. Optional: set a message of the day for the testers (`cfg/live` in the artifact database:
   `{ motd: "Week 1: tell us where the first ten minutes lose you", motdId: "w1" }`). Ask Claude to write it.
4. Read the **Playtest** sheet (Menu → Playtest, visible only to you): retention, the first-session funnel, devices
   and frame rates, errors and feedback. **Copy summary** gives a text version to paste to Claude for analysis.

**What to look for:**

| Signal | Healthy | Act on it if |
|---|---|---|
| Day-1 retention | 40% or more | below 30%: the first session isn't landing; study the funnel |
| Day-7 retention | 15% or more | below 10%: the mid-game loop or goals are thin |
| First-session funnel | 90% start an upgrade, 75% win a battle, 50% reach stage 10 | a step where a third or more stop |
| Median frame rate in the keep | 30+ fps | under 25: test Balanced/Low on that device class, cut more |
| First screen | under 4 s on 4G | over 6 s |
| Script errors | none recurring | any error reported by 2+ testers |
| Feedback | | the same confusion from 3+ testers is a design bug |

A closed test of friends is kinder than the market: treat its retention as a ceiling, not a forecast.

## Step 2 · Soft launch (1 to 3 months, about $5,000 to $20,000)

**Before:** fix what the closed test found; deploy the server (`server/README.md`), point the app at it
(`DATA.server`), and ship TestFlight and Google Play internal builds (`NATIVE.md`; an Android debug build can be
made here, the iOS build needs a Mac).

**Where:** one or two English-speaking markets where installs are cheap but players behave like the big markets:
the Philippines and Canada are the usual pair, Australia or New Zealand as a second.

**How many:** 3,000 to 10,000 installs: enough for retention and conversion to mean something. Buy them with small
ad campaigns (Meta, TikTok, Google App Campaigns, Unity/AppLovin) at a fixed daily budget; expect $0.50 to $2 per
install in the Philippines and $2 to $6 in Canada for a strategy game.

**Measure, by install cohort:** D1, D7 and D30 retention, the share of players who pay in their first 30 days,
average revenue per paying player, and the cost per install from each ad network and creative.

**Gates before spending more:**

| Metric | Target |
|---|---|
| D1 / D7 / D30 retention | 40% / 15% / 6% or better |
| Payer conversion, first 30 days | 2% or more |
| Projected 180-day revenue per install | above the cost per install in the target markets, with margin |

If a gate misses, change one thing at a time (the first session, the economy's pacing, the price points), buy a
fresh cohort and compare. Most strategy games need several rounds of this.

## Step 3 · Scale (only when the gates are met)

Raise spend market by market (US, UK, Germany, Japan, Korea) while watching that the cost per install stays under
what a player is worth. This is where top-grossing strategy games spend tens of millions of dollars a year;
realistically it means a publisher partner or investment, with the soft-launch numbers as the pitch.

## Creatives

The ads decide the cost of every install. Make many and let the networks find the winners:

- **15-30 s gameplay clips** (vertical 9:16): the hatchling in the spring growing into the Skyriver; a sandstorm
  rolling in and the Downpour calming it; the Glass Serpent with a Caravan's damage flying; a Legendary hero reveal.
- **"Fail" hooks**, the genre's best performers: a keep running dry, the wyrm falling asleep, raiders at the gate,
  "can you save them?"
- **Playable ad** (later): one Channels water puzzle in a single HTML file, a natural fit for this game.
- Test 5 to 10 new creatives a week in soft launch; most will lose, a few will carry the budget.

Capturing gameplay: run the game in a desktop browser at phone size and screen-record; the store screenshots in
`store/` were made the same way (see `store/README.md`).

## Store presence (ASO)

`STORE_LISTING.md` has the name, subtitle, keywords, description, screenshot plan and preview-video script. After
launch, A/B test the icon and the first two screenshots with App Store product page optimization and Google Play
store listing experiments: they move conversion more than anything else on the page.

## Community

- A Discord server from the closed test onward: an announcements channel, a bug-report channel, and a channel per
  language as you grow. Invite every tester.
- Short-form video (TikTok, YouTube Shorts) of the wyrm growing, the 3D keep at night, and the funniest feedback.
- Reply to every store review in the first months.

## What it costs, roughly

| Item | Cost |
|---|---|
| Apple Developer Program | $99 a year |
| Google Play Console | $25 once |
| Server (Render starter instance + disk) | about $10 to $25 a month for a soft launch |
| RevenueCat | free until $2,500 a month in revenue |
| Soft-launch ads | $5,000 to $20,000 over 1 to 3 months |
| Global launch | from tens of thousands a month; a publisher or investment |

## Honest odds

Most strategy-survival launches never reach the top-grossing charts, whatever their quality, because a few
incumbents spend more on ads than most studios make. The plan above doesn't change that; it makes each bet small
until real players prove they stay and pay, so the expensive step is only taken when the numbers say it's worth it.
