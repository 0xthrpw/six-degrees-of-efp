# Six Degrees of EFP

Connect one Ethereum account to another by hopping through the **Ethereum Follow
Protocol** (EFP) "follow" graph in as few steps as possible — *Six Degrees of
Wikipedia*, but the links are follows and the pages are people (rendered with their
ENS name + avatar). Showcases three protocols doing real work: **EFP** (the board),
**ENS** (human-readable nodes), and **SIWE** (identity for the leaderboard).

See [`six-degrees-of-efp-spec.md`](./six-degrees-of-efp-spec.md) for the game design.

## How it plays

- A **START** and **TARGET** account are pinned at the top.
- You stand on START and see everyone it follows; click one to hop. Hop counter +1.
- Win by **landing exactly on TARGET**. Fewer hops beats more; time breaks ties.
- **Daily Challenge** (same pair for everyone), **Endless** (random solvable pairs,
  difficulty 2→3→4), and **Me Mode** (START = your signed-in account).
- Sign in with Ethereum to post scores to the leaderboard.

## Architecture

A pnpm monorepo. The graph is **precomputed** into Postgres so we can compute par
(shortest path), guarantee solvable pairs, pin a daily snapshot for fairness, and
validate solutions server-side (anti-cheat) — the frontend never hits EFP during play.

```
apps/
  web/         Vite + React SPA (ethereum-identity-kit, wagmi/viem, SIWE)
  api/         Fastify server: daily/board/solve/endless/me/leaderboard + SIWE
packages/
  crawler/     leaderboard-seeded BFS crawl → Postgres snapshot + daily/endless pairs
  graph/       in-memory CSR graph: BFS par, path validation, pair selection
  efp-client/  typed EFP API client (paging at the 100/page cap, backoff)
  db/          Drizzle schema + migrations (accounts, edges, snapshots, scores, …)
```

Data flow: **crawler** → **Postgres** → **api** (loads the active snapshot into an
in-memory CSR graph) → **web**.

## Prerequisites

- Node 20+, pnpm 10+, Docker (for Postgres).

## Setup

```bash
pnpm install
cp .env.example .env          # defaults work for local dev
pnpm db:up                    # start Postgres (host port 5434)
pnpm db:generate              # generate the SQL migration from the schema
pnpm db:migrate               # apply it
pnpm crawl                    # crawl the graph + pick today's puzzle (see caps below)
```

For a quick local graph, use small crawl caps:

```bash
CRAWL_SEED_LIMIT=50 CRAWL_NODE_CAP=2000 CRAWL_MAX_DEPTH=2 pnpm crawl
```

Crawl bounds (in `.env`): `CRAWL_SEED_LIMIT` (leaderboard top-N to seed from),
`CRAWL_NODE_CAP` (stop discovering past this many nodes), `CRAWL_MAX_DEPTH`,
`CRAWL_CONCURRENCY`. Re-run the crawler to refresh; **restart the API** afterward so it
loads the new active snapshot.

## Running

```bash
pnpm api:dev     # builds the API to dist/ and runs it with node  → http://localhost:8787
pnpm web:dev     # Vite dev server                                → http://localhost:5173
```

> **Why build the API instead of `tsx src/index.ts`?** On this machine `tsx` is
> unreliable as a *long-running* process (it climbs in memory until it OOMs). The
> app itself has no leak — verified via `app.inject` (flat ~34 MB) and the built
> `node` server (flat ~80 MB under load). So the API and crawler are bundled with
> esbuild (`build.mjs`) and run with plain `node`.

## How each protocol is used

| Protocol | Role |
|---|---|
| **EFP** | The whole board. `/following` are the moves; `/leaderboard/ranked` seeds the crawl; `/stats` + `/ens` enrich cards. |
| **ENS** | Every node renders as an ENS name + avatar (resolved via EFP's `/ens`, cached in Postgres, lazily backfilled). Falls back to a generated avatar + `0x…`. |
| **SIWE** | Sign in to post scores tied to your ENS identity and to play Me Mode. Nonce + verify on the backend (`/api/siwe/*`); signatures can't be spoofed. |

## Testing

```bash
pnpm -r typecheck
pnpm -r test       # graph (BFS/par/validation), efp-client (paging/backoff), crawler utils
```

The daily/endless flow is verified end-to-end in a headless browser (board renders,
hops load, win + par display, server-validated solve). **SIWE / Me Mode sign-in needs
a real wallet** in the browser to test interactively — set `VITE_WALLETCONNECT_PROJECT_ID`
in `.env` for WalletConnect, or use an injected wallet.

## Notes & next steps

- **Scale.** v1 ships a *bounded* materialized subgraph seeded from the leaderboard
  (configurable caps). The schema/crawler/BFS scale up to the full EFP graph by raising
  the caps and running a longer crawl — no rewrite.
- **Snapshot refresh** is restart-based for v1 (the crawl cadence is ~daily); a hot
  reload of the in-memory graph would remove the restart.
