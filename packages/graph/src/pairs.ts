import type { SnapshotGraph } from './graph.ts'

export interface Pair {
  startId: number
  targetId: number
  par: number
}

export interface SampleOptions {
  /** Acceptable par values (spec §11: 2 easy, 3 medium, 4+ hard). */
  pars: number[]
  /** Deterministic RNG for tests; defaults to Math.random. */
  rng?: () => number
  /** account id -> followers count. Lower-follower targets are biased toward (harder). */
  followersById?: Map<number, number>
  /** Stop after this many start samples (default = count * 40). */
  maxAttempts?: number
  /** Restrict which accounts may be START (default: every node). Used to keep
   *  daily/endless starts to recognizable (named) accounts. */
  startIds?: number[]
  /** Restrict which accounts may be TARGET (default: any reachable node). */
  targetIds?: ReadonlySet<number>
}

function pickWeightedHardest(
  candidates: Array<{ id: number; par: number }>,
  followersById: Map<number, number> | undefined,
  rng: () => number,
): { id: number; par: number } {
  if (!followersById || candidates.length === 1) {
    return candidates[Math.floor(rng() * candidates.length)]!
  }
  // Weight inversely to follower count so lower-follower targets win more often.
  const weights = candidates.map((c) => 1 / (1 + (followersById.get(c.id) ?? 0)))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rng() * total
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i]!
    if (r <= 0) return candidates[i]!
  }
  return candidates[candidates.length - 1]!
}

/**
 * Sample up to `count` distinct, solvable start->target pairs whose par falls
 * in `pars`. Used to fill the Endless pool. Tries to spread evenly across par
 * buckets so the difficulty ramp (2->3->4) has material to draw from.
 */
export function samplePairs(graph: SnapshotGraph, count: number, opts: SampleOptions): Pair[] {
  const rng = opts.rng ?? Math.random
  const parSet = new Set(opts.pars)
  const startPool = opts.startIds ?? graph.allNodeIds()
  const targetIds = opts.targetIds
  const maxAttempts = opts.maxAttempts ?? count * 40
  const seen = new Set<string>()
  const result: Pair[] = []

  for (let attempt = 0; attempt < maxAttempts && result.length < count; attempt++) {
    const start = startPool[Math.floor(rng() * startPool.length)]!
    if (graph.outDegree(start) === 0) continue
    let candidates = graph.targetsAtPars(start, parSet)
    if (targetIds) candidates = candidates.filter((c) => targetIds.has(c.id))
    if (candidates.length === 0) continue
    const chosen = pickWeightedHardest(candidates, opts.followersById, rng)
    const key = `${start}->${chosen.id}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ startId: start, targetId: chosen.id, par: chosen.par })
  }
  return result
}

/**
 * Pick a single Daily Challenge pair, preferring `preferredPar` (default 3,
 * medium) when available, otherwise any par in `pars`.
 */
export function pickDailyPair(
  graph: SnapshotGraph,
  opts: SampleOptions & { preferredPar?: number },
): Pair | null {
  const preferred = opts.preferredPar ?? 3
  const pool = samplePairs(graph, 200, opts)
  if (pool.length === 0) return null
  const atPreferred = pool.filter((p) => p.par === preferred)
  const bucket = atPreferred.length > 0 ? atPreferred : pool
  const rng = opts.rng ?? Math.random
  return bucket[Math.floor(rng() * bucket.length)]!
}
