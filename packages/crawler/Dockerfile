# syntax=docker/dockerfile:1
# Build context is the monorepo root (Railway: set Root Directory = repo root,
# Dockerfile Path = packages/crawler/Dockerfile).
#
# The crawler is a one-shot job: it migrates, crawls, then exits. Run it on Railway
# as a Cron service (e.g. "0 6 * * *") so a clean exit is not treated as a crash.

# ---- builder: install workspace deps and bundle the crawler + migrator ----
FROM node:20-alpine AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/crawler/package.json packages/crawler/
COPY packages/db/package.json packages/db/
COPY packages/efp-client/package.json packages/efp-client/
COPY packages/graph/package.json packages/graph/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter "@sdoe/crawler..."

COPY . .
RUN pnpm --filter @sdoe/db build && pnpm --filter @sdoe/crawler build

# ---- runtime: just node + the bundles ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
ENV MIGRATIONS_DIR=/app/drizzle
WORKDIR /app
COPY --from=builder /app/packages/crawler/dist ./dist
COPY --from=builder /app/packages/db/dist/migrate.js ./migrate.js
COPY --from=builder /app/packages/db/drizzle ./drizzle

CMD ["sh", "-c", "node /app/migrate.js && node /app/dist/crawl.js"]
