import { describe, expect, it } from 'vitest'
import { getRecentTargets, pickMeTarget, recordRecentTarget } from './me-store.ts'

describe('pickMeTarget', () => {
  const cands = [{ id: 1 }, { id: 2 }, { id: 3 }]

  it('returns null when there are no candidates', () => {
    expect(pickMeTarget([], new Set())).toBeNull()
  })

  it('never returns a recently-seen target when fresh ones exist', () => {
    const recent = new Set([1, 2])
    for (const r of [0, 0.5, 0.99]) {
      expect(pickMeTarget(cands, recent, () => r)!.id).toBe(3)
    }
  })

  it('falls back to the full pool only when every candidate is recent', () => {
    const recent = new Set([1, 2, 3])
    expect(pickMeTarget(cands, recent, () => 0)!.id).toBe(1)
  })

  it('varies with the RNG', () => {
    expect(pickMeTarget(cands, new Set(), () => 0)!.id).toBe(1)
    expect(pickMeTarget(cands, new Set(), () => 0.99)!.id).toBe(3)
  })
})

describe('recent target tracking', () => {
  it('remembers served targets per user and caps the history', () => {
    const user = 9999
    for (let i = 0; i < 30; i++) recordRecentTarget(user, i)
    const recent = getRecentTargets(user)
    expect(recent.size).toBe(25) // capped
    expect(recent.has(29)).toBe(true) // newest kept
    expect(recent.has(0)).toBe(false) // oldest evicted
    expect(getRecentTargets(12345).size).toBe(0) // isolated per user
  })
})
