import { desc, eq } from 'drizzle-orm'
import { createDb, edges, snapshots } from '@sdoe/db'
import { EfpClient } from '@sdoe/efp-client'
import { SnapshotGraph } from '@sdoe/graph'
import { env } from './env.ts'

const { db, pool } = createDb()
export { db, pool }

export const efp = new EfpClient({ baseUrl: env.efpBase, retries: 4 })

export interface ActiveGraph {
  snapshotId: number
  graph: SnapshotGraph
}

let active: ActiveGraph | null = null
let loading: Promise<ActiveGraph | null> | null = null

/**
 * Loads the single active snapshot into an in-memory CSR graph (once). The API
 * serves the board and computes par from this. After a fresh crawl, restart the
 * API to pick up the new snapshot (acceptable for the once-a-day crawl cadence).
 */
export async function getActiveGraph(): Promise<ActiveGraph | null> {
  if (active) return active
  if (loading) return loading
  loading = (async () => {
    const snap = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.status, 'active'))
      .orderBy(desc(snapshots.id))
      .limit(1)
    if (snap.length === 0) return null
    const snapshotId = snap[0]!.id
    const rows = await db
      .select({ src: edges.srcId, dst: edges.dstId })
      .from(edges)
      .where(eq(edges.snapshotId, snapshotId))
    const nodeSet = new Set<number>()
    const edgeList: Array<[number, number]> = []
    for (const r of rows) {
      nodeSet.add(r.src)
      nodeSet.add(r.dst)
      edgeList.push([r.src, r.dst])
    }
    const graph = new SnapshotGraph({ nodeIds: [...nodeSet], edges: edgeList })
    active = { snapshotId, graph }
    return active
  })()
  return loading
}
