import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { and, desc, eq, gte, isNotNull } from 'drizzle-orm'
import { accounts, createDb, dailyPuzzles, edges, snapshots } from '@sdoe/db'
import { pickDailyPair, SnapshotGraph, UNREACHABLE } from '@sdoe/graph'

// Allow a root .env for local runs; an inline DATABASE_URL still wins (dotenv
// never overrides an already-set var).
const here = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(here, '../../..', '.env') })

/**
 * Re-pick today's Daily Challenge, restricted to endpoints that have BOTH an ENS
 * name and avatar (so the board looks good), and replace the pinned row for
 * today's UTC date. The /api/daily route reads this fresh from Postgres, so the
 * change is live immediately — no API restart needed.
 *
 * Env knobs:
 *   RESET_DAILY_PAR           preferred hop count (default 3)
 *   RESET_DAILY_MIN_FOLLOWERS only use endpoints with >= this many followers
 *                             (default 0 = any; e.g. 1000 forces well-known accounts)
 */
function log(msg: string) {
  console.log(`[reset-daily] ${msg}`)
}

const preferredPar = Number(process.env.RESET_DAILY_PAR) || 3
const minFollowers = Number(process.env.RESET_DAILY_MIN_FOLLOWERS) || 0

const { db, pool } = createDb()

// 1. The single active snapshot everyone plays against.
const snap = await db
  .select()
  .from(snapshots)
  .where(eq(snapshots.status, 'active'))
  .orderBy(desc(snapshots.id))
  .limit(1)
if (snap.length === 0) {
  console.error('No active snapshot — run the crawler first.')
  process.exit(1)
}
const snapshotId = snap[0]!.id

// 2. Rebuild the in-memory graph for this snapshot (same as the API does).
const edgeRows = await db
  .select({ src: edges.srcId, dst: edges.dstId })
  .from(edges)
  .where(eq(edges.snapshotId, snapshotId))
const nodeSet = new Set<number>()
const edgeList: Array<[number, number]> = []
for (const r of edgeRows) {
  nodeSet.add(r.src)
  nodeSet.add(r.dst)
  edgeList.push([r.src, r.dst])
}
const graph = new SnapshotGraph({ nodeIds: [...nodeSet], edges: edgeList })
log(`snapshot #${snapshotId}: ${graph.n} nodes, ${graph.edgeCount} edges`)

// 3. The pretty pool: accounts with a name AND an avatar that are in this graph.
const niceRows = await db
  .select({ id: accounts.id, name: accounts.ensName, avatar: accounts.ensAvatar })
  .from(accounts)
  .where(
    and(
      isNotNull(accounts.ensName),
      isNotNull(accounts.ensAvatar),
      minFollowers > 0 ? gte(accounts.followersCount, minFollowers) : undefined,
    ),
  )
const nameById = new Map<number, string>()
const niceIds: number[] = []
for (const r of niceRows) {
  if (!graph.hasNode(r.id)) continue
  niceIds.push(r.id)
  if (r.name) nameById.set(r.id, r.name)
}
const niceIdSet = new Set(niceIds)
log(
  `candidate endpoints with name+avatar in graph: ${niceIds.length}` +
    (minFollowers > 0 ? ` (followers >= ${minFollowers})` : ''),
)
if (niceIds.length < 2) {
  console.error('Not enough named+avatar accounts to build a pair. Try a larger crawl.')
  process.exit(1)
}

// 4. Pick a solvable named->named pair, preferring `preferredPar`.
const pair = pickDailyPair(graph, {
  pars: [2, 3, 4],
  preferredPar,
  startIds: niceIds,
  targetIds: niceIdSet,
})
if (!pair) {
  console.error('Could not find a solvable named->named pair in this snapshot.')
  process.exit(1)
}

// 5. Verify before writing — never pin an unsolvable or mislabeled puzzle.
const hops = graph.shortestHops(pair.startId, pair.targetId)
if (hops === UNREACHABLE || hops !== pair.par) {
  console.error(`Sanity check failed: shortestHops=${hops} but par=${pair.par}. Aborting.`)
  process.exit(1)
}

// 6. Replace today's pinned puzzle.
const date = new Date().toISOString().slice(0, 10)
await db
  .insert(dailyPuzzles)
  .values({ date, snapshotId, startId: pair.startId, targetId: pair.targetId, par: pair.par })
  .onConflictDoUpdate({
    target: dailyPuzzles.date,
    set: { snapshotId, startId: pair.startId, targetId: pair.targetId, par: pair.par },
  })

const label = (id: number) => `${nameById.get(id) ?? `#${id}`} (id ${id})`
log(`daily ${date} set: ${label(pair.startId)} -> ${label(pair.targetId)} at par ${pair.par}`)

await pool.end()
