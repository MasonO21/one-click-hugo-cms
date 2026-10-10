# Rainkeep online: the network contract

Rainkeep's online features (real players on the Wardens board, the Arena, real Caravans with chat, help and a
shared alliance boss, and the closed-playtest reports) talk to one interface, `KH.net` (`net.js`), with two
backends behind it:

| Backend | Where | Used when |
|---|---|---|
| **Artifact** (`net.js`, `ArtifactNet`) | the claude.ai artifact's shared database (`db`), identity (`user`) | the game is opened from its claude.ai link: everyone the owner shares it with (as Contributor or above) plays together |
| **HTTP** (`net-http.js`, `HttpNet`) | the Rainkeep server (`server/`) | the native app or a self-hosted web build with `DATA.server` set |

With neither (offline, a page opened from disk, a viewer without write access), `KH.net.online()` is false and
the game plays exactly as the single-player game it was: the simulated Caravan, rivals and Hall stay as they are.

All shared data is **untrusted** input from other players: every reader clamps numbers and length-limits strings
(`net.js: clean*()`), and every string goes on screen through `esc()`.

## Data model

Times are milliseconds since the epoch (`Date.now()`). Ids are opaque strings (the artifact's `user.id()`, or the
server's player id). Names are never stored with the artifact backend: the reader resolves ids to names
(`user.profiles()`); the server keeps the name the player chose.

### Player profile (public): `players/{id}`

| Field | Type | Notes |
|---|---|---|
| `v` | int | schema version, 1 |
| `keep` | string ≤ 24 | the keep's name (the Rainwyrm's name) |
| `name` | string ≤ 24 | server only: the player's chosen name |
| `power` | number | the keep's power (`KH.power()`) |
| `wyrm` | int 1–40 | Rainwyrm level |
| `skin` | string ≤ 24 | wyrm skin id |
| `stage` | int 1–400 | expedition stage reached (`S.stage`) |
| `cls` | `guard`/`bow`/`lancer` | the class the keep defends with (its formation lead) |
| `squad` | array ≤ 5 of `{id, lvl, stars}` | the heroes at home, for the Arena report |
| `lp` | int ≥ 0 | Arena points |
| `aid` | string ≤ 40 or null | the Caravan the player is in |
| `seen` | time | last time the game was open (updated at most every 2 minutes) |
| `ver` | string ≤ 12 | game version |

A player writes only their own profile. Profiles are written when something on them changes, at most once a
minute.

### Caravan (alliance): `al/{aid}`

`{ name ≤ 24, tag ≤ 4 (A–Z, 0–9), color '#rrggbb', motto ≤ 80, leader: id, created: time, open: bool }`

Membership is the `aid` field of each member's own profile (members of `aid` = players where `aid == aid`), so
joining and leaving never write anyone else's data. A Caravan holds at most 30 members; the 31st join is refused
by the client (artifact) or the server (HTTP). Only the leader edits the motto, colour and `open`; a leader who
leaves hands the Caravan on (the server: to the longest-standing member; the artifact backend, which keeps no
join times: to the strongest).

### Chat: `chat/{channel}/m/{mid}`

`channel` is `world` or `al-{aid}`. A message is `{ by: id, at: time, text ≤ 200 }`. Each channel keeps its newest
100 messages: a sender deletes the oldest beyond that. One message per 2 seconds per player.

### Reports and moderation

A reported chat message travels in the reporter's own playtest report (`rep`: the last 20 `{ ch, mid, by, text,
at, rat }`), which only the owner reads (the artifact's rules can't make a collection writable by testers but
readable only by the owner, since a path's write level can't be below its read level). The owner removes a message
from the Playtest sheet: the message is deleted and its id recorded in `cfg/mod` (`{ removed: { mid: time } }`,
admin-written), so the reports naming it drop off. The server keeps reports and removals itself
(`POST /v1/chat/:channel/:mid/report`). Blocking is local: a blocked player's messages and keep are hidden on the
blocker's device only.

### Help requests: `hp/{rid}`

`{ aid, by: id, plot, label ≤ 40, at: time, end: time, need: 1–10, hs: { helperId: time } }`

A Caravan member asks for help on a building in progress. Each other member can help once per request: the
artifact backend writes `update({hs: {[me]: now}})` (a nested merge, so two helpers at once both count). The
requester's game applies each new helper as a speed-up (`DATA.online.help`) and deletes the request when the
build ends or every help has arrived. Requests older than a day are deleted by whoever sees them.

### Caravan boss: `al/{aid}/boss/{day}`

`{ hp: number, dmg: { id: damage } }` for one day (`day` = UTC days since the epoch, the same for every member).
The first hit of the day creates it with `{ hp, dmg: {} }`. Each member attacks up to
`DATA.online.boss.hits` times a day; the battle is fought in the game, and the member writes their running total
with `update({dmg: {[me]: total}})`. The boss falls when the sum of `dmg` reaches `hp`; then every member who hit it
claims the day's chest (once, recorded in their save), sized by their share.

### Arena battles: `bt/{bid}`

`{ att: id, def: id, win: bool, at: time, d: int (Arena points moved), ap: power, dp: power }`

The attacker fights the defender's keep as an expedition foe of the defender's stage behind walls (the same rule
the simulated rival keeps use), writes the record and their own new `lp`; the defender's game reads the records
naming them since it last looked, applies `-d` to its own `lp` for each loss, and offers a revenge attack. Records
older than three days are deleted by whoever reads them.

### Playtest report: `pt/{id}` (artifact) · `POST /v1/telemetry` (HTTP)

One document per tester, readable only by the owner (artifact rule `read: admin`) or an admin token (server):

| Field | Meaning |
|---|---|
| `first`, `last` | first and latest time the game was open |
| `days` | sorted list (≤ 60) of local day numbers the game was opened on: retention D1/D3/D7 come from it |
| `sessions`, `secs` | count of sessions and total seconds played |
| `ftue` | `{ step: seconds since first open }` for the first-session milestones (`playtest.js: FTUE`) |
| `stage`, `wyrm`, `power`, `ver` | progress at the latest save |
| `feat` | `{ sheetOrFeature: opens }` (top 60) |
| `spend` | simulated purchases: `{ n, usd }` |
| `dev` | `{ tier, gpu, mem, cores, w, h, dpr, ua }` and start-up timings `{ ui, keep3d, dunes3d }` in ms |
| `fps` | median frames per second in the keep, sampled |
| `err` | the last 20 distinct script errors `{ m ≤ 160, n, at }` |
| `rep` | the last 20 chat messages this tester reported `{ ch, mid, by, text ≤ 200, at, rat }` |
| `old` | true for a save that began before playtest reports: no first-session funnel |
| `fb` | the last 30 feedback notes `{ at, r: 1–5, t ≤ 500, stage, ver }` |

### Live config: `cfg/live` (artifact, admin-written) · `GET /v1/config` (HTTP)

`{ motd ≤ 200, motdId, test: { week, focus ≤ 200 } }`: a message of the day shown once per `motdId`.

## The client interface (`KH.net`)

Every call returns a Promise and never throws to the caller: failures resolve `null`/`false`/`[]` and are counted
in `KH.net.status()`. `watch*` calls return an unsubscribe function.

| Call | Returns |
|---|---|
| `ready` | Promise that resolves once the backend is known |
| `online()` | true when a backend answered and this player can write |
| `kind()` | `'artifact'`, `'http'` or `null` |
| `me()` | this player's id |
| `isAdmin()` | true for the artifact's owner or an admin token: the playtest dashboard |
| `names(ids)` | `{ id: display name }` |
| `putProfile(p)` | writes this player's profile |
| `player(id)` | one profile |
| `topPlayers(by, n)` | `by` = `'power'` or `'lp'` |
| `opponents(power, n)` | profiles within ±40% of `power`, not this player |
| `members(aid)` | profiles with that `aid` |
| `alliances(n)` | Caravans, newest first |
| `alliance(aid)` | one Caravan |
| `createAlliance({name, tag, color, motto})` | the new `aid` |
| `updateAlliance(aid, patch)` | leader only |
| `watchChat(channel, cb)` | `cb(messages oldest first)` |
| `sendChat(channel, text)` | true when sent |
| `askHelp({aid, plot, label, end, need})` | request id |
| `giveHelp(rid)` | true when counted |
| `watchHelps(aid, cb)` | `cb(open requests)` |
| `dropHelp(rid)` | deletes the player's own request |
| `boss(aid, day)` | `{ hp, dmg }` or null |
| `hitBoss(aid, day, hp, total)` | writes this player's running total |
| `postBattle(rec)` | writes an Arena record |
| `battlesAgainst(since)` | records naming this player as defender |
| `report({ch, mid, by, text, at})` | HTTP only: the server's own copy of a report |
| `reports()` | HTTP only: the server's open reports (admin) |
| `removeMessage(ch, mid, rid)` | deletes a reported message and records it as removed, or closes report `rid` on the server (admin) |
| `moderation()` | `{ mid: time }` of the messages removed (admin) |
| `putTelemetry(doc)` | this tester's report |
| `allTelemetry()` | every tester's report (admin) |
| `config()` | the live config |
| `status()` | `{ kind, online, calls, errors, lastError }` |

## HTTP API (`server/`)

JSON over HTTPS. Every route but `/v1/auth` and `/v1/health` takes `Authorization: Bearer <token>`.

| Method and path | Body / query | Result |
|---|---|---|
| `GET /v1/health` | | `{ ok, version }` |
| `POST /v1/auth` | `{ deviceId, name? }` | `{ token, id }`: a device account (one per deviceId) |
| `PATCH /v1/me` | `{ name }` | `{ id, name }` |
| `PUT /v1/save` | `{ code, at }` | `{ ok }`: cloud save (the game's save code, ≤ 512 KB) |
| `GET /v1/save` | | `{ code, at }` or 404 |
| `PUT /v1/players/me` | profile fields | the stored, clamped profile |
| `GET /v1/players` | `order=power|lp`, `limit≤100`, or `aid=` | profiles with `id` and `name` |
| `GET /v1/players/opponents` | `power`, `limit≤20` | profiles within ±40% |
| `GET /v1/players/:id` | | one profile |
| `GET /v1/alliances` | `limit≤50` | Caravans with member counts |
| `POST /v1/alliances` | `{ name, tag, color, motto }` | `{ aid }` (caller becomes leader and member) |
| `GET /v1/alliances/:aid` | | the Caravan and its members |
| `PATCH /v1/alliances/:aid` | `{ motto?, color?, open? }` | leader only |
| `POST /v1/alliances/:aid/join` | | refused when full (30) or closed |
| `POST /v1/alliances/leave` | | leadership passes to the longest-standing member |
| `POST /v1/alliances/:aid/kick` | `{ id }` | leader only |
| `GET /v1/chat/:channel` | `since` | messages (`world`, or `al-{aid}` for members) |
| `POST /v1/chat/:channel` | `{ text }` | 1 per 2 s per player, ≤ 200 chars, newest 100 kept |
| `POST /v1/chat/:channel/:mid/report` | | a report for moderators |
| `POST /v1/helps` | `{ plot, label, end, need }` | `{ rid }`: in the caller's Caravan |
| `GET /v1/helps` | | the caller's Caravan's open requests |
| `POST /v1/helps/:rid/help` | | once per helper, never one's own; server counts |
| `DELETE /v1/helps/:rid` | | the requester's own |
| `GET /v1/alliances/:aid/boss` | `day` | `{ hp, dmg }` |
| `POST /v1/alliances/:aid/boss` | `{ day, hp, total }` | members only; ≤ `hits` per day; a total that grows faster than the player's power allows is refused |
| `POST /v1/battles` | `{ def, win, ap, dp }` | ≤ 5 attacks a day; opponent must be within ±40% power; the server computes and applies the points to both players |
| `GET /v1/battles` | `since` | records naming the caller as defender |
| `PUT /v1/telemetry` | the report | `{ ok }` |
| `GET /v1/admin/telemetry` | admin token | every report |
| `GET /v1/config` | | live config |
| `PUT /v1/admin/config` | admin token | sets live config |
| `GET /v1/stream` | | Server-Sent Events: `chat`, `help`, `boss`, `battle`, `alliance` for the caller |

The server is authoritative for what the artifact backend can only trust: membership limits, one help per helper,
attack limits and Arena points, boss-hit plausibility and chat rate limits. The next step for competitive play is
resolving Arena battles on the server with the same battle engine (`core.js` `newBattle`/`battleStep` are pure
functions of the two sides' stats), so a modified client can't report wins it didn't earn.
