# Deploying the Fridge Pulse server

The app needs this server online for scanning, meal ideas, lookups, barcodes and shared households, and App Review needs it online too. It is one Node process with one SQLite file for households, so it runs as **a single instance with a persistent disk**. Rate limits are kept in memory, which is another reason to keep it to one instance.

Two ready-made setups are here: Fly.io (`fly.toml`) and Render (`render.yaml`). Any host that runs a Docker image with a persistent disk works the same way.

## What you need first

| Secret | Where it comes from |
| --- | --- |
| `ANTHROPIC_API_KEY` | console.anthropic.com > API keys. Check that web search is enabled for the organization (Console > Settings), or lookups find nothing. |
| `REVENUECAT_SECRET_KEY` | RevenueCat > Project settings > API keys > **Secret** key. Never put it in the app. |
| `PICTURE_USER_AGENT` | Your own text with a contact address, for example `FridgePulse/1.0 (support@yourdomain.com)`. Open Food Facts asks every client to identify itself. |

The other settings have working defaults; `.env.example` lists them all.

## Fly.io

1. Install `flyctl` and sign in: `fly auth login`.
2. In `fridge-pulse/server`, change `app = "fridge-pulse-api"` in `fly.toml` to a name of your own (it becomes `https://<name>.fly.dev`). Pick a `primary_region` near your users.
3. Create the app without deploying: `fly launch --copy-config --no-deploy`.
4. Create the volume in the same region: `fly volumes create fridge_pulse_data --size 1 --region iad`.
5. Set the secrets:
   ```sh
   fly secrets set ANTHROPIC_API_KEY=... REVENUECAT_SECRET_KEY=... PICTURE_USER_AGENT="FridgePulse/1.0 (support@yourdomain.com)"
   ```
6. Deploy: `fly deploy`. Then make sure there is exactly one machine: `fly scale count 1`.
7. Check it: `curl https://<name>.fly.dev/health` answers `{"ok":true}`.

Fly snapshots volumes daily and keeps them for 5 days by default (`fly volumes snapshots list`).

## Render

1. Push this repository to GitHub.
2. In Render: **New > Blueprint**, pick the repository, and set the Blueprint path to `fridge-pulse/server/render.yaml`.
3. Enter `ANTHROPIC_API_KEY`, `REVENUECAT_SECRET_KEY` and `PICTURE_USER_AGENT` when asked.
4. The disk needs a paid instance type (`plan: starter` in the file). Keep **one** instance.
5. Check it: `curl https://<service>.onrender.com/health` answers `{"ok":true}`.

## Point the app at it

Put the address in the app's `.env` and rebuild:

```sh
EXPO_PUBLIC_API_URL=https://<your-server>
```

`EXPO_PUBLIC_*` values are baked in at build time, so make a new EAS build (or `eas update`) after changing it.

## Notes

- **The disk:** households live in `/app/data/households.sqlite`. Keep `HOUSEHOLD_DB` inside `/app/data`. The image's entrypoint makes the disk writable for the unprivileged `node` user (both hosts attach disks owned by root), then starts the server as that user.
- **Client addresses:** on Fly the server reads the caller's address from `Fly-Client-IP` (`CLIENT_IP_HEADER`), which callers cannot fake. Elsewhere, set `TRUST_PROXY=true` behind the host's proxy; the first `X-Forwarded-For` entry is then used, which a caller can make up, so the per-IP limits are a speed bump there rather than a wall (per-person daily caps still apply).
- **Redeploys** send SIGTERM; the server finishes what is in flight and closes the database before exiting.
- **Costs** come mostly from the Anthropic API; the per-person daily caps (`SCANS_PER_DAY`, `MEALS_PER_DAY`, `IDENTIFIES_PER_DAY`) bound them. See the README for rough figures.
- **Not verified here:** the image was not built in the session that wrote this (the sandbox could not reach the package registries from inside a container). Build it once locally with `docker build -t fridge-pulse-server .` before the first deploy, or let Fly or Render build it and watch the first boot's logs.
