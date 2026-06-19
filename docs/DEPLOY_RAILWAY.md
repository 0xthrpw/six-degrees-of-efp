# Deploying Six Degrees of EFP to Railway

This repo ships one Dockerfile per service so each runs as its own Railway service,
all built from the **monorepo root** as Docker context:

| Service   | Dockerfile                     | Kind          | Purpose                                  |
|-----------|--------------------------------|---------------|------------------------------------------|
| `api`     | `apps/api/Dockerfile`          | Web service   | Fastify API (`/health`, game, SIWE, …)   |
| `web`     | `apps/web/Dockerfile`          | Web service   | Static React SPA served by Caddy         |
| `crawler` | `packages/crawler/Dockerfile`  | **Cron** job  | Migrates + crawls EFP, writes a snapshot |
| Postgres  | Railway plugin                 | Database      | You add this from the Railway dashboard  |

Each Node service is bundled to a single file with esbuild, so the runtime images carry
**no `node_modules`** — just `node` (api/crawler) or `caddy` (web). The api and crawler
images also embed the Drizzle migrator and apply migrations on start (idempotent).

> Migrations run automatically: both the api and the crawler run `node migrate.js`
> before their main process (`MIGRATIONS_DIR=/app/drizzle` is baked in). The first
> service to start creates the schema; the rest are no-ops.

---

## 1. Create the Postgres database

In your Railway project: **New → Database → PostgreSQL**. Railway provisions it and
exposes `DATABASE_URL` on that service. Other services reference it with a
[reference variable](https://docs.railway.com/guides/variables#reference-variables):
`${{Postgres.DATABASE_URL}}` (rename `Postgres` if you named the plugin differently).

## 2. Create the three services from this repo

For **each** service: **New → GitHub Repo → (this repo)**, then in the service's
**Settings**:

- **Build** → **Builder**: `Dockerfile`
- **Root Directory**: leave as the repo root (`/`). The Dockerfiles `COPY` from the
  monorepo root and need the full workspace + `pnpm-lock.yaml` in context.
- **Dockerfile Path**: set per the table above (`apps/api/Dockerfile`, etc.).

(Three services pointing at one repo is expected — they differ only by Dockerfile path.)

## 3. Set variables per service

### `api`
| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `WEB_ORIGIN` | the web service's public URL, e.g. `https://web-production-xxxx.up.railway.app` (for CORS) |
| `SESSION_SECRET` | a real 32+ byte secret |
| `SIWE_DOMAIN` | the web app's host, e.g. `web-production-xxxx.up.railway.app` |
| `SIWE_URI` | the web app's URL, e.g. `https://web-production-xxxx.up.railway.app` |
| `EFP_API_BASE` | `https://api.ethfollow.xyz/api/v1` |

`PORT` is injected by Railway and the server listens on it automatically — don't set it.
Under **Settings → Networking**, generate a domain (or attach a custom one). Optionally
set the **Healthcheck Path** to `/health`.

### `web`
The SPA bakes its config at **build time**, so these are needed as **build variables**
(Railway passes service variables to the Docker build as `--build-arg`; the Dockerfile
declares the matching `ARG`s):

| Variable | Value |
|---|---|
| `VITE_API_BASE` | the **api** service's public URL, e.g. `https://api-production-xxxx.up.railway.app` |
| `VITE_WALLETCONNECT_PROJECT_ID` | your WalletConnect project id (optional) |

> Changing `VITE_API_BASE` requires a **redeploy/rebuild** of `web`, not just a restart.
> Generate the api domain first so you know the URL. Generate a domain for `web` too.

### `crawler`
| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `EFP_API_BASE` | `https://api.ethfollow.xyz/api/v1` |
| `CRAWL_SEED_LIMIT` / `CRAWL_NODE_CAP` / `CRAWL_MAX_DEPTH` / `CRAWL_CONCURRENCY` | optional bounds (see `.env.example`) |

The crawler is a **one-shot job**: it exits when done. Configure it as a cron so a clean
exit isn't treated as a crash — **Settings → Cron Schedule**, e.g. `0 6 * * *` (daily
06:00 UTC). Railway runs the container on schedule and won't restart-loop it. To populate
data immediately the first time, trigger a manual deploy/run.

## 4. First deploy order

1. Postgres (provisioned).
2. `crawler` — run it once so a snapshot exists (the api logs
   `no active snapshot — run the crawler first` until then). It migrates the schema too.
3. `api` and `web` — deploy in either order; set `web`'s `VITE_API_BASE` to the api URL
   and the api's `WEB_ORIGIN`/`SIWE_*` to the web URL.

---

## Local parity

These same images run locally:

```bash
# API (needs a reachable Postgres)
docker build -f apps/api/Dockerfile -t sdoe-api .
docker run --rm -e PORT=8080 -e DATABASE_URL=postgres://sdoe:sdoe@host.docker.internal:5434/sdoe sdoe-api

# Web (API URL baked at build time)
docker build -f apps/web/Dockerfile --build-arg VITE_API_BASE=http://localhost:8080 -t sdoe-web .
docker run --rm -e PORT=8081 sdoe-web

# Crawler (one-shot)
docker build -f packages/crawler/Dockerfile -t sdoe-crawler .
docker run --rm -e DATABASE_URL=postgres://sdoe:sdoe@host.docker.internal:5434/sdoe sdoe-crawler
```

`pnpm dev` / `docker compose up -d postgres` remain the day-to-day local workflow; these
Dockerfiles are only for deployment.
