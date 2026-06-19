# Deploying Six Degrees of EFP to hotbox

A plan for running this app on our [hotbox](../../hotbox) PaaS (single Hetzner box,
Fastify control plane reconciling Docker against Postgres-declared desired state,
Traefik ingress with automatic TLS).

## TL;DR architecture decision

**Ship ONE hotbox service**, not three. The Fastify API also serves the built React
SPA (`@fastify/static`), so web + api share a **single origin**, and the **crawler runs
in-process** on a nightly timer. A **managed Postgres sibling** holds the data.

```
  Traefik ──HTTPS──▶  sixdegrees (1 container)
                        ├─ GET /            → static SPA (apps/web/dist)
                        ├─ /api/*           → Fastify routes
                        └─ nightly timer    → crawl → write snapshot → hot-reload graph
                              │
                              └─▶ sixdegrees-database  (managed_pg sibling, internal)
```

### Why one service (the hotbox constraints that drive this)

| hotbox fact (from the codebase) | consequence for us |
|---|---|
| Routing is **hostname-only**, no `PathPrefix` (`traefik-labels.ts`) | Can't do `/` → web, `/api` → api on one host *via hotbox*. But we **can** serve both from one container ourselves. |
| Managed Postgres sibling injects its URL **only into the parent** service (`createSiblings`) | A separate crawler service can't share the api's DB. Fold the crawler into the api. |
| **No job/cron primitive** (intentional omission) | The nightly crawl must be an in-process scheduler in a long-lived service. |
| `image_source:'github'` **forbids `requires`** and **doesn't inject build-time env** (`api.ts` refinements) | We need a managed DB *and* a baked `VITE_*`, so github-build is out → build our own image, push to a registry, deploy `image_source:'image'`. |
| Container **command isn't settable** for `kind:'app'` (deployment command is null) | The image's own `CMD`/entrypoint must do migrate → serve. |
| Sibling URL env name is `{NAME}_URL` uppercased | Name the requirement `database` → injected as `DATABASE_URL` (matches our app). Entrypoint also aliases `DB_URL`→`DATABASE_URL` defensively. |

Single-origin also makes SIWE trivial: `sameSite=lax` cookies and no CORS, because the
SPA calls `/api/*` relative to its own origin.

---

## Repo changes required (before building the image)

These are small, additive, and keep local dev working.

### 1. API serves the SPA (`apps/api`)
- Add `@fastify/static`. In `app.ts`, register it with `root = process.env.STATIC_DIR`
  (when set), serving `index.html` as the SPA fallback for non-`/api`, non-`/health`
  routes (deep links like `/play/daily` must return `index.html`).
- Locally `STATIC_DIR` is unset → API stays API-only and Vite serves the SPA as today.

### 2. Fold the crawler into the API as a scheduled task
- In `packages/crawler`, extract the body of `crawl.ts:main()` into
  `export async function runCrawl(db, client, cfg)` (drop the internal `createDb`/`pool`);
  keep `main()` as the CLI wrapper. Export it from a `packages/crawler` index.
- In `apps/api/src/services.ts`, add `reloadActiveGraph()` that clears the cached
  `active`/`loading` and re-warms it (this also fixes the "restart to load a new
  snapshot" limitation we noted).
- Add `apps/api/src/scheduler.ts`: if `CRAWL_SCHEDULE_ENABLED=true`, run `runCrawl(db, …)`
  daily (e.g. 00:10 UTC via `setTimeout` to next occurrence, then 24h interval); after
  each crawl call `reloadActiveGraph()`. Also: if `CRAWL_ON_BOOT_IF_EMPTY=true` and there
  is no active snapshot, run one crawl at startup so `/api/daily` works on first deploy.
- The API container therefore needs network egress to `api.ethfollow.xyz` and enough
  memory for the bounded crawl (see resource limits below).

### 3. Make session-cookie security env-driven (`apps/api/src/session.ts`)
- Replace the hardcoded `secure:false, sameSite:'lax'` with
  `secure: process.env.COOKIE_SECURE === 'true'` and
  `sameSite: (process.env.COOKIE_SAMESITE ?? 'lax')`.
- Prod (single origin, HTTPS): `COOKIE_SECURE=true`, `COOKIE_SAMESITE=lax`.

### 4. `VITE_API_BASE=''` for the prod web build
- Our `api.ts` uses `const BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787'`.
  Building with `VITE_API_BASE=''` makes `BASE=''` → the SPA calls `/api/*` **relative**
  to its own origin. Perfect for single-service hosting.

### 5. Migrations in the image
- Bundle `packages/db/src/migrate.ts` → `dist/migrate.js` (esbuild, same as the API
  bundle) and ship `packages/db/drizzle/*.sql`. Have `migrate.ts` resolve the migrations
  dir from `DRIZZLE_DIR ?? <dir>/drizzle`. The entrypoint runs it before the server.

---

## The image (`apps/api/Dockerfile`, multi-stage)

```dockerfile
# ---- builder ----
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# Web: relative API base so the SPA calls /api on its own origin
RUN VITE_API_BASE="" pnpm --filter @sdoe/web build
# API + migrate bundles (esbuild, self-contained)
RUN pnpm --filter @sdoe/api build         # -> apps/api/dist/index.js
RUN pnpm --filter @sdoe/api build:migrate # -> apps/api/dist/migrate.js  (new script)

# ---- runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production STATIC_DIR=/app/web DRIZZLE_DIR=/app/drizzle
COPY --from=builder /repo/apps/api/dist ./
COPY --from=builder /repo/apps/web/dist ./web
COPY --from=builder /repo/packages/db/drizzle ./drizzle
COPY apps/api/docker-entrypoint.sh ./entrypoint.sh
EXPOSE 8787
ENTRYPOINT ["sh", "./entrypoint.sh"]
```

`apps/api/docker-entrypoint.sh`:
```sh
#!/bin/sh
set -e
: "${DATABASE_URL:=$DB_URL}"   # hotbox injects DATABASE_URL (requires name 'database')
export DATABASE_URL
node migrate.js
exec node index.js
```

The esbuild bundle already inlines all deps, so the runtime stage needs no
`node_modules` — just the bundles, the SPA, and the SQL migrations.

---

## Build & push to a registry the box can pull

GHCR is the natural choice. **Public** package = no host credentials needed; **private**
= run `docker login ghcr.io` once on the box.

```bash
TAG=ghcr.io/<GHCR_ORG>/six-degrees-efp:$(git rev-parse --short HEAD)
docker build -f apps/api/Dockerfile -t "$TAG" .
docker push "$TAG"
```

(Or add a `.github/workflows/build.yml` that builds + pushes on tag — hotbox already
uses GitHub Actions.)

---

## Deploy to hotbox (HTTP API; no CLI)

Auth is a session cookie. One service create does it all.

```bash
# 1. Log in (get the cookie jar)
curl -sc cookies.txt -X POST https://<HOTBOX_HOST>/api/login \
  -H 'content-type: application/json' \
  -d '{"email":"<you>","password":"<pw>"}'

# 2. Create the service (managed Postgres sibling + ingress + healthcheck)
curl -b cookies.txt -X POST https://<HOTBOX_HOST>/api/services \
  -H 'content-type: application/json' \
  -d '{
    "project_id": "<PROJECT_ID>",
    "environment_id": "<ENV_ID>",
    "name": "Six Degrees of EFP",
    "slug": "sixdegrees",
    "kind": "app",
    "image_source": "image",
    "image": "ghcr.io/<GHCR_ORG>/six-degrees-efp:<TAG>",
    "public_port": 8787,
    "auto_subdomain": true,
    "env": {
      "EFP_API_BASE": "https://api.ethfollow.xyz/api/v1",
      "COOKIE_SECURE": "true",
      "COOKIE_SAMESITE": "lax",
      "CRAWL_SCHEDULE_ENABLED": "true",
      "CRAWL_ON_BOOT_IF_EMPTY": "true",
      "CRAWL_SEED_LIMIT": "1000",
      "CRAWL_NODE_CAP": "50000",
      "CRAWL_MAX_DEPTH": "3",
      "WEB_ORIGIN": "https://sixdegrees-<ENV_SLUG>-<PROJECT_SLUG>.<BASE_DOMAIN>",
      "SIWE_DOMAIN": "sixdegrees-<ENV_SLUG>-<PROJECT_SLUG>.<BASE_DOMAIN>",
      "SIWE_URI": "https://sixdegrees-<ENV_SLUG>-<PROJECT_SLUG>.<BASE_DOMAIN>"
    },
    "secrets": {
      "SESSION_SECRET": "<openssl rand -hex 32>"
    },
    "config": {
      "restart_policy": "on-failure",
      "requires": [{ "kind": "postgres", "name": "database" }],
      "healthcheck": { "type": "http", "path": "/health", "interval_s": 15, "retries": 3 },
      "resources": { "mem_limit_bytes": 1073741824 }
    }
  }'
```

Notes:
- `requires: [{kind:'postgres', name:'database'}]` → sibling `sixdegrees-database`,
  injects `DATABASE_URL=postgres://app:…@sixdegrees-database:5432/app`.
- `auto_subdomain:true` → public URL `https://sixdegrees-<ENV_SLUG>-<PROJECT_SLUG>.<BASE_DOMAIN>`
  (deterministic, so `WEB_ORIGIN`/`SIWE_*` above are known up front). Prefer a **custom
  `hostname`** instead if you want a nicer URL (set `"hostname":"sixdegrees.<your-domain>"`
  and drop `auto_subdomain`; needs an A record → box, HTTP-01 cert).

---

## DNS / TLS prerequisites

- **Auto-subdomain**: requires `HOTBOX_AUTO_SUBDOMAIN_BASE` set on hotbox-api, a Cloudflare
  wildcard `*.<BASE_DOMAIN>` A record (grey-cloud / DNS-only) → the box, and the
  `CLOUDFLARE_DNS_API_TOKEN` configured on Traefik (wildcard cert via DNS-01).
- **Custom hostname**: an A record for that host → the box; Traefik issues a per-host
  cert via HTTP-01 automatically.

---

## Environment & secrets matrix (prod)

| Var | Where | Value |
|---|---|---|
| `DATABASE_URL` | injected by sibling | `postgres://app:…@sixdegrees-database:5432/app` |
| `SESSION_SECRET` | **secret** | 32-byte random (`openssl rand -hex 32`) |
| `EFP_API_BASE` | env | `https://api.ethfollow.xyz/api/v1` |
| `WEB_ORIGIN`, `SIWE_DOMAIN`, `SIWE_URI` | env | the single public origin/host |
| `COOKIE_SECURE` / `COOKIE_SAMESITE` | env | `true` / `lax` |
| `CRAWL_*` | env | schedule + bounded crawl caps |
| `STATIC_DIR`, `DRIZZLE_DIR` | image | `/app/web`, `/app/drizzle` |
| `VITE_API_BASE` | **build arg** | `""` (relative) |
| `VITE_WALLETCONNECT_PROJECT_ID` | **build arg** | your WC id (or omit → injected-only wallets) |

---

## First run & verification

1. On boot, `CRAWL_ON_BOOT_IF_EMPTY` seeds a snapshot + today's puzzle (watch logs via
   hotbox SSE; the bounded crawl is seconds–minutes).
2. `curl https://<public-origin>/health` → `{"ok":true}`.
3. `curl https://<public-origin>/api/daily` → today's pair.
4. Open the site, play the daily, sign in with a wallet, confirm the score posts.

## Operations

- **New version**: build+push a new tag, then `POST /api/services/<id>/deployments`
  with `{ "image": "ghcr.io/…:<newtag>" }`.
- **Change env**: hotbox Variables API (project/env/service scope) + redeploy, or pass
  `env` on the deployment call.
- **Crawl cadence/size**: tune `CRAWL_*`; the in-process timer reloads the graph after
  each run (no restart needed).
- **Logs**: hotbox streams container logs over SSE in the dashboard.

## Inputs you provide

1. `<HOTBOX_HOST>` and login creds; `<PROJECT_ID>` + `<ENV_ID>` (create a project/env in
   the dashboard if needed) and their slugs.
2. Domain strategy: `auto_subdomain` (needs `HOTBOX_AUTO_SUBDOMAIN_BASE` configured) **or**
   a custom `hostname` + A record.
3. `<GHCR_ORG>` and whether the package is public (else `docker login ghcr.io` on the box).
4. `VITE_WALLETCONNECT_PROJECT_ID` (optional; enables WalletConnect).

## Alternative: two services (web + api)

If you'd rather separate them: deploy a static-nginx `web` image and the `api` image as
two services on two subdomains. Then set `VITE_API_BASE` to the api's absolute URL, set
the api's `WEB_ORIGIN` to the web origin, and **set `COOKIE_SAMESITE=none` + `COOKIE_SECURE=true`**
so the session cookie survives the cross-subdomain `fetch`. Simpler to operate as one
service, though — recommended above.
