# syntax=docker/dockerfile:1
# Build context is the monorepo root (Railway: set Root Directory = repo root,
# Dockerfile Path = apps/api/Dockerfile).

# ---- builder: install workspace deps and bundle the API + migrator ----
FROM node:20-alpine AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# Manifests first so the install layer caches across source-only changes.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/crawler/package.json packages/crawler/
COPY packages/db/package.json packages/db/
COPY packages/efp-client/package.json packages/efp-client/
COPY packages/graph/package.json packages/graph/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter "@sdoe/api..."

# Source, then bundle. esbuild inlines the @sdoe/* workspace packages, so the
# runtime stage needs no node_modules.
COPY . .
RUN pnpm --filter @sdoe/db build && pnpm --filter @sdoe/api build

# ---- runtime: just node + the bundles ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
ENV MIGRATIONS_DIR=/app/drizzle
WORKDIR /app
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/packages/db/dist/migrate.js ./migrate.js
COPY --from=builder /app/packages/db/drizzle ./drizzle

# Apply migrations (idempotent) then start the server. Railway provides PORT.
CMD ["sh", "-c", "node /app/migrate.js && node /app/dist/index.js"]
