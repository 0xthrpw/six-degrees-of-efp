import { describe, expect, it } from 'vitest'
import { SnapshotGraph, UNREACHABLE } from './graph.ts'
import { pickDailyPair, samplePairs } from './pairs.ts'

// 1->2, 1->3, 2->4, 3->4, 4->5, 5->6 ; node 7 is isolated.
const input = {
  nodeIds: [1, 2, 3, 4, 5, 6, 7],
  edges: [
    [1, 2],
    [1, 3],
    [2, 4],
    [3, 4],
    [4, 5],
    [5, 6],
  ] as Array<readonly [number, number]>,
}

// Deterministic RNG for reproducible pair sampling.
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('SnapshotGraph', () => {
  const g = new SnapshotGraph(input)

  it('reports node/edge counts and out-neighbors', () => {
    expect(g.n).toBe(7)
    expect(g.edgeCount).toBe(6)
    expect(new Set(g.following(1))).toEqual(new Set([2, 3]))
    expect(g.outDegree(7)).toBe(0)
  })

  it('computes shortest hops over directed edges', () => {
    expect(g.shortestHops(1, 1)).toBe(0)
    expect(g.shortestHops(1, 4)).toBe(2)
    expect(g.shortestHops(1, 5)).toBe(3)
    expect(g.shortestHops(1, 6)).toBe(4)
  })

  it('returns UNREACHABLE for isolated / backwards targets', () => {
    expect(g.shortestHops(1, 7)).toBe(UNREACHABLE)
    expect(g.shortestHops(6, 1)).toBe(UNREACHABLE) // edges are directed
  })

  it('validates a real path and reports hops', () => {
    expect(g.validatePath([1, 2, 4, 5], 1, 5)).toEqual({ valid: true, hops: 3 })
    expect(g.validatePath([1, 3, 4, 5], 1, 5)).toEqual({ valid: true, hops: 3 })
  })

  it('rejects fabricated edges, wrong endpoints, and unknown nodes', () => {
    expect(g.validatePath([1, 2, 5], 1, 5).valid).toBe(false) // 2->5 is not an edge
    expect(g.validatePath([2, 4, 5], 1, 5).valid).toBe(false) // wrong start
    expect(g.validatePath([1, 2, 4], 1, 5).valid).toBe(false) // wrong target
    expect(g.validatePath([1, 999, 5], 1, 5).valid).toBe(false) // unknown node
  })
})

describe('pair selection', () => {
  const g = new SnapshotGraph(input)

  it('only ever produces solvable pairs with par in range', () => {
    const pairs = samplePairs(g, 20, { pars: [2, 3, 4], rng: mulberry32(42) })
    expect(pairs.length).toBeGreaterThan(0)
    for (const p of pairs) {
      expect([2, 3, 4]).toContain(p.par)
      expect(g.shortestHops(p.startId, p.targetId)).toBe(p.par)
    }
  })

  it('picks a daily pair preferring the requested par', () => {
    const pair = pickDailyPair(g, { pars: [2, 3], preferredPar: 3, rng: mulberry32(7) })
    expect(pair).not.toBeNull()
    expect(g.shortestHops(pair!.startId, pair!.targetId)).toBe(pair!.par)
  })
})
