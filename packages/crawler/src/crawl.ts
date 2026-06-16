import { createDb } from '@sdoe/db'
import { EfpClient } from '@sdoe/efp-client'
import { pickDailyPair, samplePairs, SnapshotGraph, UNREACHABLE, type Pair } from '@sdoe/graph'
import { crawlConfig } from './env.ts'
import { mapLimit } from './concurrency.ts'
import {
  ensureAddresses,
  insertDailyPuzzle,
  insertEndlessPairs,
  upsertSeeds,
  writeSnapshot,
} from './repo.ts'

interface FrontierNode {
  id: number
  addr: string
}

function log(msg: string) {
  console.log(`[crawl] ${msg}`)
}

async function main() {
  const cfg = crawlConfig
  log(
    `start: seedLimit=${cfg.seedLimit} nodeCap=${cfg.nodeCap} maxDepth=${cfg.maxDepth} concurrency=${cfg.concurrency}`,
  )
  const client = new EfpClient({ baseUrl: cfg.efpBase, retries: 5 })
  const { db, pool } = createDb()

  // 1. Seed from the leaderboard top-N (names/avatars/counts come for free).
  const leaders = await client.getLeaderboard({ limit: cfg.seedLimit, sort: 'followers' })
  log(`fetched ${leaders.length} leaderboard seeds`)
  const seedMap = await upsertSeeds(db, leaders)

  const addrToId = new Map(seedMap)
  const seedIds: number[] = [...seedMap.values()]
  const followersById = new Map<number, number>()
  for (const l of leaders) {
    const id = seedMap.get(l.address.toLowerCase())
    if (id !== undefined) followersById.set(id, l.followers)
  }

  // 2. Bounded BFS over /following, level by level.
  const edgeKeys = new Set<string>()
  const edgeList: Array<[number, number]> = []
  let frontier: FrontierNode[] = leaders
    .map((l) => ({ id: seedMap.get(l.address.toLowerCase())!, addr: l.address.toLowerCase() }))
    .filter((n) => n.id !== undefined)
  let depth = 0

  while (frontier.length > 0 && depth <= cfg.maxDepth) {
    log(`level ${depth}: expanding ${frontier.length} nodes (discovered=${addrToId.size})`)
    const following = await mapLimit(frontier, cfg.concurrency, async (node) => {
      try {
        const list = await client.getAllFollowing(node.addr)
        return { node, targets: list.map((f) => f.address.toLowerCase()) }
      } catch (err) {
        log(`  warn: following failed for ${node.addr}: ${(err as Error).message}`)
        return { node, targets: [] as string[] }
      }
    })

    // Collect candidate new addresses (only if we may still expand & add nodes).
    const canAddNew = depth < cfg.maxDepth
    const newAddrs: string[] = []
    if (canAddNew) {
      const seenNew = new Set<string>()
      const room = cfg.nodeCap - addrToId.size
      for (const { targets } of following) {
        for (const t of targets) {
          if (addrToId.has(t) || seenNew.has(t)) continue
          if (seenNew.size >= room) break
          seenNew.add(t)
          newAddrs.push(t)
        }
        if (seenNew.size >= room) break
      }
    }
    const addedMap = await ensureAddresses(db, newAddrs)
    for (const [addr, id] of addedMap) addrToId.set(addr, id)

    // Record edges to any known node (induced subgraph; unknowns dropped).
    for (const { node, targets } of following) {
      for (const t of targets) {
        const tid = addrToId.get(t)
        if (tid === undefined) continue
        const key = `${node.id},${tid}`
        if (edgeKeys.has(key)) continue
        edgeKeys.add(key)
        edgeList.push([node.id, tid])
      }
    }

    frontier = [...addedMap].map(([addr, id]) => ({ id, addr }))
    depth++
  }

  log(`crawl complete: ${addrToId.size} nodes, ${edgeList.length} edges`)

  // 3. Snapshot + in-memory graph.
  const snapshotId = await writeSnapshot(db, addrToId.size, edgeList)
  log(`wrote snapshot #${snapshotId}`)
  const graph = new SnapshotGraph({ nodeIds: [...addrToId.values()], edges: edgeList })

  // 4. Daily pair — prefer recognizable (seed) endpoints, relaxing if needed.
  const seedIdSet = new Set(seedIds)
  const daily =
    pickDailyPair(graph, {
      pars: [2, 3, 4],
      preferredPar: 3,
      startIds: seedIds,
      targetIds: seedIdSet,
      followersById,
    }) ??
    pickDailyPair(graph, { pars: [2, 3, 4], preferredPar: 3, startIds: seedIds, followersById }) ??
    pickDailyPair(graph, { pars: [2, 3, 4], preferredPar: 3, followersById })

  if (daily) {
    const date = new Date().toISOString().slice(0, 10)
    await insertDailyPuzzle(db, { date, snapshotId, ...daily })
    log(`daily puzzle ${date}: ${daily.startId} -> ${daily.targetId} (par ${daily.par})`)
  } else {
    log('WARN: could not find a solvable daily pair in range')
  }

  // 5. Endless pool (seed-to-seed preferred for recognizable endpoints).
  let endless: Pair[] = samplePairs(graph, 300, {
    pars: [2, 3, 4],
    startIds: seedIds,
    targetIds: seedIdSet,
    followersById,
  })
  if (endless.length === 0) {
    endless = samplePairs(graph, 300, { pars: [2, 3, 4], startIds: seedIds, followersById })
  }
  await insertEndlessPairs(db, snapshotId, endless)
  log(`endless pool: ${endless.length} pairs`)

  // Sanity: every persisted pair must be solvable at its stated par.
  const bad = endless.filter((p) => graph.shortestHops(p.startId, p.targetId) !== p.par)
  if (bad.length > 0) log(`WARN: ${bad.length} endless pairs failed par verification`)
  if (daily && graph.shortestHops(daily.startId, daily.targetId) === UNREACHABLE) {
    log('WARN: daily pair is unreachable!')
  }

  await pool.end()
  log('done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
