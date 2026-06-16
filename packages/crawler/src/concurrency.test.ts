import { describe, expect, it } from 'vitest'
import { chunk, mapLimit } from './concurrency.ts'

describe('mapLimit', () => {
  it('preserves input order in results', async () => {
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => n * 10)
    expect(out).toEqual([10, 20, 30, 40, 50])
  })

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0
    let peak = 0
    await mapLimit(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
    })
    expect(peak).toBeLessThanOrEqual(3)
    expect(peak).toBeGreaterThan(1)
  })
})

describe('chunk', () => {
  it('splits into fixed-size groups with a remainder', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
  it('handles empty input', () => {
    expect(chunk([], 10)).toEqual([])
  })
})
