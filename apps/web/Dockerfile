# syntax=docker/dockerfile:1
# Build context is the monorepo root (Railway: set Root Directory = repo root,
# Dockerfile Path = apps/web/Dockerfile).
#
# Vite inlines VITE_* values at BUILD time, so the API URL must be known here.
# On Railway set VITE_API_BASE (and optionally VITE_WALLETCONNECT_PROJECT_ID) as
# service variables — Railway passes them to the build as --build-arg. Changing the
# API URL requires a rebuild, not just a restart.

# ---- builder: install workspace deps and produce the static bundle ----
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
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter "@sdoe/web..."

ARG VITE_API_BASE
ARG VITE_WALLETCONNECT_PROJECT_ID
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_WALLETCONNECT_PROJECT_ID=$VITE_WALLETCONNECT_PROJECT_ID

COPY . .
RUN pnpm --filter @sdoe/web build

# ---- runtime: serve the static SPA with Caddy on $PORT ----
FROM caddy:2-alpine AS runtime
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/apps/web/dist /srv
