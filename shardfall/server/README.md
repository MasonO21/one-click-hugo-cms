# Shardfall Arena game server

Online 3v3 for Shardfall Arena. One Node process serves:

- **Matchmaking and matches over WebSocket** (`/ws`). Matches are server-authoritative. The server runs the same `web/js/match.js` the game uses offline, at 30 ticks per second, and streams snapshots to each player at 15 per second.
- **An HTTP API** for guest accounts, cloud save, the ranked leaderboard and account deletion.

```bash
cd shardfall/server
npm install
npm start                # listens on :8787
npm test                 # protocol, HTTP, visibility, full-match and two-browser tests
```

To play online, open Settings in the game, set **Online game server** to the server's address (for example `ws://localhost:8787` or `wss://play.example.com`), and pick **Online 3v3**. A build can also set `window.SF_SERVER_URL` before the scripts load.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | HTTP and WebSocket port. `0` picks a free port |
| `QUEUE_WAIT` | `8` | Seconds a player waits for others before bots fill the match |
| `DATA_DIR` | `./data` | Where `accounts.json` is written |
| `TICK_SCALE` | `1` | Simulation steps per tick. Only for fast tests |

## Deploying

The Docker image needs the game rules from `web/js`, so build it from the `shardfall/` folder:

```bash
docker build -f server/Dockerfile -t shardfall-server .
docker run -p 8787:8787 -v shardfall-data:/data shardfall-server
```

Any host that supports long-lived WebSockets works, such as Fly.io, Render or a small VM. Put it behind TLS (`wss://`), because iOS blocks plain `ws://` in release builds. One CPU core runs dozens of matches at the same time. Each match costs about 1 ms per tick.

## How a match works

1. The client sends `hello` (with a saved token, if it has one) and gets `welcome { pid, token }`.
2. The client sends `queue { mode, heroId, skinId, name }`. Up to 6 humans are grouped. After `QUEUE_WAIT` seconds, bots fill the empty slots. Humans alternate teams, and two humans on the same team never share a hero.
3. The server sends `match { room, team, pid, roster, bushes }`, then a stream of `s` snapshots containing:
   - every unit the player's team can see (enemy heroes hidden in grass are not sent at all)
   - zones and projectiles
   - the player's own gold, cooldowns and buffs
   - recorded events: effects, damage numbers, kills and announcements
4. The client sends inputs, and the server validates all of them:

| Message | Meaning |
|---|---|
| `in { d: {x,y} \| null, a: bool }` | Move direction and whether attack is held |
| `cast { i, dir, p, tg }` | Cast skill `i`. The aim is clamped to the skill's range, and the target must be a visible enemy in range. With no `dir`, the server auto-aims |
| `buy { id }` | Buy an item |
| `flash { d }` | Blink |
| `recall` | Recall to base |
| `surrender` | Concede. When every connected human on a team has surrendered, the match ends |

5. `end { winner, summary }` closes the match. In ranked matches, each human's MMR updates with an Elo formula (K = 32).

**Disconnects.** If a player drops, a bot takes over their hero after 10 seconds. Reconnecting with the same token hands the hero back.

**Anti-cheat.** Gold, damage, cooldowns and positions only ever change on the server. Clients send intentions, never results. Messages are rate-limited, and payloads are capped at 4 KB.

## HTTP API

| Method and path | Body | Result |
|---|---|---|
| `POST /api/login` | `{ deviceId, name }` | `{ pid, token }`. The same device always gets the same account |
| `GET /api/save` | Bearer token | `{ save, savedAt }` |
| `PUT /api/save` | `{ save }`, 64 KB max | `{ savedAt }` |
| `DELETE /api/account` | Bearer token | Deletes the account and its save. Apple requires in-app account deletion |
| `GET /api/leaderboard` | – | The top 50 players by ranked MMR |
| `GET /health` | – | Status, active rooms and the queue size |

## Before a real launch

- Move accounts from the JSON file to a database such as Postgres, and keep **currency balances on the server**. The cloud save is currently a blob the client uploads.
- Verify purchases on the server, with RevenueCat webhooks or the App Store Server API, before granting gems.
- Run several server instances behind a matchmaker that knows which instance owns each room.
- Add regional servers. A MOBA feels laggy above about 120 ms of round-trip time.
