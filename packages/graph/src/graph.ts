/**
 * Compressed-sparse-row (CSR) directed graph over the EFP follow edges of one
 * snapshot. Built once when a snapshot becomes active and kept in memory for
 * fast BFS (par), path validation (anti-cheat), and pair selection.
 *
 * The public API speaks in `accountId` (= accounts.id in Postgres). Internally
 * we remap to contiguous 0..n indices so CSR arrays stay compact.
 *
 * Note: typed-array reads use non-null assertions on hot paths — indices are
 * always provably in range, and this keeps the kernel valid under the strict
 * `noUncheckedIndexedAccess` setting that consumers compile it with.
 */

export const UNREACHABLE = Number.POSITIVE_INFINITY

export interface GraphInput {
  /** Distinct account ids that are nodes in this snapshot. */
  nodeIds: number[]
  /** Directed follow edges as [srcAccountId, dstAccountId]. */
  edges: Array<readonly [number, number]>
}

interface Csr {
  offsets: Int32Array
  targets: Int32Array
}

export interface PathCheck {
  valid: boolean
  hops: number
  reason?: string
}

export class SnapshotGraph {
  readonly n: number
  private readonly indexToId: Int32Array
  private readonly idToIndex: Map<number, number>
  private readonly fwd: Csr

  constructor(input: GraphInput) {
    this.n = input.nodeIds.length
    this.indexToId = Int32Array.from(input.nodeIds)
    this.idToIndex = new Map()
    for (let i = 0; i < this.n; i++) this.idToIndex.set(this.indexToId[i]!, i)

    // Keep only edges whose endpoints are both known nodes.
    const src: number[] = []
    const dst: number[] = []
    for (const [a, b] of input.edges) {
      const ai = this.idToIndex.get(a)
      const bi = this.idToIndex.get(b)
      if (ai === undefined || bi === undefined) continue
      src.push(ai)
      dst.push(bi)
    }
    this.fwd = buildCsr(this.n, src, dst)
  }

  get edgeCount(): number {
    return this.fwd.targets.length
  }

  hasNode(accountId: number): boolean {
    return this.idToIndex.has(accountId)
  }

  /** Out-neighbors (accounts this account follows), as account ids. */
  following(accountId: number): number[] {
    const i = this.idToIndex.get(accountId)
    if (i === undefined) return []
    const { offsets, targets } = this.fwd
    const out: number[] = []
    for (let e = offsets[i]!; e < offsets[i + 1]!; e++) out.push(this.indexToId[targets[e]!]!)
    return out
  }

  outDegree(accountId: number): number {
    const i = this.idToIndex.get(accountId)
    if (i === undefined) return 0
    return this.fwd.offsets[i + 1]! - this.fwd.offsets[i]!
  }

  /** Minimum hop count start->target over directed edges, or UNREACHABLE. */
  shortestHops(startId: number, targetId: number): number {
    const s = this.idToIndex.get(startId)
    const t = this.idToIndex.get(targetId)
    if (s === undefined || t === undefined) return UNREACHABLE
    if (s === t) return 0
    const dist = this.bfsFrom(s, t)
    return dist[t] === -1 ? UNREACHABLE : dist[t]!
  }

  /** Single-source BFS distances from a start index. Optional early-exit target. */
  private bfsFrom(start: number, target = -1): Int32Array {
    const dist = new Int32Array(this.n).fill(-1)
    const queue = new Int32Array(this.n)
    const { offsets, targets } = this.fwd
    let head = 0
    let tail = 0
    dist[start] = 0
    queue[tail++] = start
    while (head < tail) {
      const node = queue[head++]!
      const d = dist[node]!
      for (let e = offsets[node]!; e < offsets[node + 1]!; e++) {
        const nb = targets[e]!
        if (dist[nb] === -1) {
          dist[nb] = d + 1
          if (nb === target) return dist
          queue[tail++] = nb
        }
      }
    }
    return dist
  }

  /** All shortest distances from a start account (used by pair selection). */
  distancesFrom(startId: number): Int32Array | null {
    const s = this.idToIndex.get(startId)
    if (s === undefined) return null
    return this.bfsFrom(s)
  }

  /** The account ids of every node, in index order. */
  allNodeIds(): readonly number[] {
    return Array.from(this.indexToId)
  }

  /**
   * Account ids reachable from `startId` whose shortest distance is one of the
   * requested par values. The workhorse of pair selection.
   */
  targetsAtPars(startId: number, pars: ReadonlySet<number>): Array<{ id: number; par: number }> {
    const s = this.idToIndex.get(startId)
    if (s === undefined) return []
    const dist = this.bfsFrom(s)
    const out: Array<{ id: number; par: number }> = []
    for (let i = 0; i < this.n; i++) {
      const d = dist[i]!
      if (d > 0 && pars.has(d)) out.push({ id: this.indexToId[i]!, par: d })
    }
    return out
  }

  /**
   * Multi-source BFS: account ids reachable from ANY of `sourceIds` whose
   * shortest distance is in `dists`. Used by Me Mode, where the player's live
   * follows (which may live outside the snapshot) seed the search at distance 0
   * and the real hop count is `dist + 1`.
   */
  reachableFromSources(
    sourceIds: number[],
    dists: ReadonlySet<number>,
  ): Array<{ id: number; dist: number }> {
    const dist = new Int32Array(this.n).fill(-1)
    const queue = new Int32Array(this.n)
    let head = 0
    let tail = 0
    for (const id of sourceIds) {
      const s = this.idToIndex.get(id)
      if (s !== undefined && dist[s] === -1) {
        dist[s] = 0
        queue[tail++] = s
      }
    }
    const { offsets, targets } = this.fwd
    while (head < tail) {
      const node = queue[head++]!
      const d = dist[node]!
      for (let e = offsets[node]!; e < offsets[node + 1]!; e++) {
        const nb = targets[e]!
        if (dist[nb] === -1) {
          dist[nb] = d + 1
          queue[tail++] = nb
        }
      }
    }
    const out: Array<{ id: number; dist: number }> = []
    for (let i = 0; i < this.n; i++) {
      const di = dist[i]!
      if (di >= 0 && dists.has(di)) out.push({ id: this.indexToId[i]!, dist: di })
    }
    return out
  }

  private hasEdge(srcIndex: number, dstIndex: number): boolean {
    const { offsets, targets } = this.fwd
    for (let e = offsets[srcIndex]!; e < offsets[srcIndex + 1]!; e++) {
      if (targets[e] === dstIndex) return true
    }
    return false
  }

  /**
   * Anti-cheat: a submitted path (account ids) is valid iff it starts at
   * `startId`, ends at `targetId`, and every consecutive pair is a real
   * directed follow edge in this snapshot. hops = number of edges traversed.
   */
  validatePath(path: number[], startId: number, targetId: number): PathCheck {
    if (path.length < 1) return { valid: false, hops: 0, reason: 'empty path' }
    if (path[0] !== startId) return { valid: false, hops: 0, reason: 'path does not start at START' }
    if (path[path.length - 1] !== targetId)
      return { valid: false, hops: 0, reason: 'path does not end at TARGET' }
    for (let i = 0; i + 1 < path.length; i++) {
      const a = this.idToIndex.get(path[i]!)
      const b = this.idToIndex.get(path[i + 1]!)
      if (a === undefined || b === undefined)
        return { valid: false, hops: 0, reason: `unknown node in path at step ${i}` }
      if (!this.hasEdge(a, b))
        return { valid: false, hops: 0, reason: `no follow edge ${path[i]} -> ${path[i + 1]}` }
    }
    return { valid: true, hops: path.length - 1 }
  }
}

function buildCsr(n: number, srcIdx: number[], dstIdx: number[]): Csr {
  const m = srcIdx.length
  const offsets = new Int32Array(n + 1)
  for (let i = 0; i < m; i++) {
    const k = srcIdx[i]! + 1
    offsets[k] = offsets[k]! + 1
  }
  for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i + 1]! + offsets[i]!
  const targets = new Int32Array(m)
  const cursor = Int32Array.from(offsets.subarray(0, n))
  for (let i = 0; i < m; i++) {
    const j = srcIdx[i]!
    const pos = cursor[j]!
    targets[pos] = dstIdx[i]!
    cursor[j] = pos + 1
  }
  return { offsets, targets }
}
