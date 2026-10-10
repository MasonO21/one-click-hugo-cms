# Rainkeep server

The production backend for Rainkeep's online features: device sign-in, player profiles and leaderboards, the Arena,
Caravans (alliances) with chat, help requests and a daily Caravan boss, playtest reports, live config and cloud
saves. It implements the **HTTP API** in [`../NETWORK.md`](../NETWORK.md), and [`../net-http.js`](../net-http.js) is
the matching browser adapter behind `KH.net`.

It is one Node 22 process and one SQLite file, using only Node built-ins (`node:http`, `node:sqlite`,
`node:crypto`). There is nothing to `npm install`.

```
server/
  index.js          entry point: reads the environment, listens, shuts down cleanly on SIGTERM
  src/app.js        routes and the game rules the server enforces (named constants at the top)
  src/db.js         SQLite schema and queries
  src/validate.js   clamping and cleaning of everything a player sends (NETWORK.md "Data model")
  src/stream.js     the Server-Sent Events hub behind GET /v1/stream
  test/             node:test suites, including the browser adapter run in a vm
  Dockerfile        node:22-alpine image, non-root, database on the /data volume
  render.yaml       Render Blueprint: one web service with a persistent disk
```

## Run it locally

Node 22.13 or newer (where `node:sqlite` needs no flag).

```sh
cd rainkeep/server
ADMIN_TOKEN=$(openssl rand -hex 32) npm start     # http://localhost:8080/v1/health
```

The database is created at `server/data/rainkeep.db` (ignored by git). `npm start` passes
`--disable-warning=ExperimentalWarning` because `node:sqlite` is still marked experimental on Node 22; run
`node index.js` directly and you'll just see that warning once.

Tests (about 3 seconds, no network, an in-memory database and an injected clock):

```sh
cd rainkeep && node --test server/test/      # or: cd rainkeep/server && npm test
```

`server/test/index.js` exists so the folder form works on Node 22, whose `--test` takes files and globs but not a
folder.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | port to listen on (Render sets it for you) |
| `DB_PATH` | `server/data/rainkeep.db` | the SQLite file; its folder is created. `/data/rainkeep.db` in the Docker image |
| `ADMIN_TOKEN` | unset | bearer token for `/v1/admin/*`. Unset disables those routes. Use 32+ random characters |
| `CORS_ORIGIN` | `*` | allowed browser origins, comma separated. The native app's origins are `capacitor://localhost` (iOS) and `https://localhost` (Android) |

## The API

Every route in NETWORK.md's table is implemented, with these details:

- **Auth.** `POST /v1/auth {deviceId, name?}` returns `{token, id, name}`. One account per deviceId; each sign-in
  issues a new random 256-bit token, and a player's newest 5 tokens stay valid. Only SHA-256 hashes of tokens and
  of deviceIds are stored (the deviceId works like a password). Every other route takes
  `Authorization: Bearer <token>`; `GET /v1/stream` alone also takes `?token=` because `EventSource` can't send
  headers. Admin routes take `Authorization: Bearer <ADMIN_TOKEN>`, compared in constant time.
- **Errors** are `{ "error": code, "message": text }`: 400 invalid input, 401 no or bad token, 403 not allowed
  (not the leader, not a member, closed Caravan, not admin, Arena opponent out of range), 404, 405, 409 conflict
  (full Caravan, already in one, already helped), 413 body over 600 KB or save over 512 KB, 429 rate limited
  (chat, attacks, boss hits, open help requests; with `Retry-After` where a wait is known).
- **Lists** (`GET /v1/players`, `/v1/alliances`, `/v1/chat/:channel`, `/v1/helps`, `/v1/battles`,
  `/v1/admin/telemetry`, `/v1/admin/reports`) return JSON arrays. Records carry the keys the game already uses
  with the artifact backend: messages `{mid, by, name, at, text}`, help requests `{rid, aid, by, plot, label, at,
  end, need, hs}`, Arena records `{bid, att, def, win, at, d, ap, dp}`, Caravans `{aid, name, tag, color, motto,
  leader, created, open, count}`.
- **Profiles.** `PUT /v1/players/me` merges the fields it is sent, clamped to the data model's limits; unknown fields
  are dropped. `lp` (Arena points) and `aid` (membership) are ignored there because the server owns them, and
  `seen` is stamped by the server.
- **Additions** beyond the table, which `net-http.js` uses for calls the game makes (`net.js` lists them):
  `GET /v1/me` (`{id, name, aid}`, to check a stored token), `GET /v1/players?ids=a,b,c` (up to 100, for
  `names()`), `GET /v1/players/me`, `PATCH /v1/alliances/:aid {leader}` (a leader hands over to a member, as the
  game does before leaving), and for moderators with the admin token `GET /v1/admin/reports`
  (`{rid, ch, mid, by, text, at, rep, rat}`), `DELETE /v1/admin/chat/:channel/:mid` (removes a message from every
  reader, live) and `DELETE /v1/admin/reports/:rid`.
- **Events.** `GET /v1/stream` is Server-Sent Events: `hello` on connect, then `chat` (world to everyone,
  `al-{aid}` to members), `help`, `boss` and `alliance` (to the Caravan's members) and `battle` (to the defender),
  each with a JSON `data` line, and a `: ping` comment every 25 seconds. A player holds at most 3 streams.

### Rules the server enforces

All are named constants at the top of `src/app.js`:

| Rule | Value |
|---|---|
| Caravan size | 30 members; the 31st join gets 409 `full`; a closed Caravan gets 403 `closed` |
| Caravan edits and kicks | leader only. The leader may hand the lead to a member; a leader who leaves without doing so is replaced by the longest-standing member; the last member out disbands the Caravan (its chat, helps and boss go with it) |
| Chat | 1 message per 2 s per player, 200 characters, newest 100 kept per channel; `al-{aid}` for members only |
| Help | once per helper per request, never your own, at most `need` (1–10) helps, gone after a day, 10 open requests per player |
| Caravan boss | members only; 3 hits a day (`BOSS_HITS_PER_DAY`); a day's damage total may not exceed `power × 50` (`BOSS_DAMAGE_PER_POWER`); the first hit of the day fixes the boss's hp; the day must be within one of the server's UTC day |
| Arena | 5 attacks per UTC day; the defender's stored power within ±40% of the attacker's, except a revenge on a keep that attacked the caller in the last 3 days (the game offers revenge whatever the gap); a win moves `d = clamp(round(20 + (defLp − attLp) / 25), 8, 40)` points from the defender (floored at 0) to the attacker; a loss costs the attacker 5. Powers and points come from the server's records, not the request. Records are kept 3 days |

## Deploy

### Docker

```sh
docker build -t rainkeep-server rainkeep/server
docker run -d --name rainkeep -p 8080:8080 -v rainkeep-data:/data \
  -e ADMIN_TOKEN="$(openssl rand -hex 32)" -e CORS_ORIGIN='capacitor://localhost,https://localhost' rainkeep-server
```

The container runs as the non-root `node` user (uid 1000). A named volume picks up the right owner by itself; a
bind mount needs a host folder that uid 1000 can write. Put it behind HTTPS (a reverse proxy such as Caddy, or a
platform that terminates TLS): the native apps refuse plain HTTP.

### Render

`render.yaml` describes one Docker web service (`rainkeep-server`) with a 1 GB persistent disk at `/data` and a
generated `ADMIN_TOKEN`. In the dashboard choose **New > Blueprint**, pick the repository and point the Blueprint
path at `rainkeep/server/render.yaml` (or copy the file to the repository root). Its Docker paths are written from
the repository root; adjust them if `rainkeep/` sits elsewhere. A disk needs a paid instance type, keeps the
service to one instance and rules out zero-downtime deploys (a deploy restarts the one process), which is the
trade-off of SQLite. The generated admin token is in the service's **Environment** tab.

## Pointing the game at it

`net.js` already prefers the server: when `DATA.server` is set and `window.RKHttpNet` exists, it creates
`RKHttpNet(DATA.server, {})` and uses it if it comes online, before trying the artifact backend. Two small edits on
the game side, not made here, switch it on:

1. `data.js`: `server: 'https://rainkeep-server.onrender.com',` (your service's URL; a trailing slash is fine).
2. `index.html`: load the adapter before `net.js`: `<script src="net-http.js"></script>`.

`npm run build` copies every top-level `.js` file into `www/`, so the native build ships `net-http.js` once
`index.html` loads it. For the native app set `CORS_ORIGIN` to `capacitor://localhost,https://localhost` (or leave
`*`). The playtest dashboard needs `RKHttpNet(url, { adminToken })`, which `net.js` doesn't pass today; give it
the token only in a build for the team, never one players get.

The adapter keeps the device id in `localStorage['rk-device']` and the token in `localStorage['rk-token']`. Losing
the app's storage means a new account: see "What's next".

## Backups

Everything is in one SQLite file in WAL mode, so don't copy `rainkeep.db` alone while the server runs (recent
writes sit in `rainkeep.db-wal`). Take a consistent copy online instead:

```sh
# inside the container or on the Render shell
node -e "new (require('node:sqlite').DatabaseSync)('/data/rainkeep.db').exec(\"VACUUM INTO '/data/backup-$(date +%F).db'\")"
```

or `sqlite3 /data/rainkeep.db ".backup '/data/backup.db'"` where the `sqlite3` tool exists. Then copy the backup
off the machine (for example to object storage) on a schedule: a backup on the same disk doesn't survive losing
the disk. Render also snapshots persistent disks daily, which covers rollbacks but isn't an off-site copy.
To restore, stop the service, replace `rainkeep.db` (and delete any `-wal`/`-shm` files beside it), start it.

## What's next

- **Server-side battle resolution.** The server checks Arena limits and moves the points, but the win itself and
  the boss damage are still reported by the client, inside plausibility limits. `core.js`'s `newBattle` and
  `battleStep` are pure functions of both sides' stats, so the server can load the same engine, rebuild both teams
  from stored profiles and decide the result, so a modified client can't report wins it didn't earn. The boss's
  daily hp also comes from the first hitter's client.
- **Moderation tooling.** Reports are stored and a moderator can remove a message, but there is no mute, ban,
  word filter, appeal or audit log yet, and polling clients keep showing a removed message until they reload it
  (the event stream removes it live).
- **Abuse limits at the edge.** Sign-in has no per-IP limit, so a script can create accounts. Put the service
  behind a proxy or CDN rate limit, or add one here once the deployment's client-IP header is known.
- **Account recovery.** A device account lives in the app's storage; clearing it loses the account and its cloud
  save. Linking a Game Center, Play Games or email identity to the player id would fix that, and is also where
  token expiry belongs.
- **Horizontal scaling.** SQLite is single-node, and the event stream's subscribers live in one process's memory.
  One instance comfortably serves a closed playtest and well beyond; when one isn't enough, move to Postgres
  (the queries are plain SQL) and fan events out through Postgres `LISTEN/NOTIFY` or Redis pub/sub so any instance
  can serve any stream.
