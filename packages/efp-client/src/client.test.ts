import { describe, expect, it, vi } from 'vitest'
import { EfpClient, MAX_PAGE_SIZE } from './client.ts'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('EfpClient', () => {
  it('clamps limit to MAX_PAGE_SIZE in the request URL', async () => {
    const fetchImpl = vi.fn(async (..._args: unknown[]) => jsonResponse({ following: [] }))
    const client = new EfpClient({ fetchImpl: fetchImpl as unknown as typeof fetch })
    await client.getFollowingPage('vitalik.eth', { limit: 9999 })
    const url = fetchImpl.mock.calls[0]![0] as string
    expect(url).toContain(`limit=${MAX_PAGE_SIZE}`)
  })

  it('drains following across pages, stopping on a short read', async () => {
    const full = Array.from({ length: MAX_PAGE_SIZE }, (_, i) => ({ address: `0x${i}` }))
    const tail = [{ address: '0xlast' }]
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ following: full }))
      .mockResolvedValueOnce(jsonResponse({ following: full }))
      .mockResolvedValueOnce(jsonResponse({ following: tail }))
    const client = new EfpClient({ fetchImpl: fetchImpl as unknown as typeof fetch })
    const all = await client.getAllFollowing('vitalik.eth')
    expect(all).toHaveLength(MAX_PAGE_SIZE * 2 + 1)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('unwraps the ens envelope and preserves nulls', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ens: { name: null, address: '0xabc', avatar: null, records: {} } }),
    )
    const client = new EfpClient({ fetchImpl: fetchImpl as unknown as typeof fetch })
    const ens = await client.getEns('0xabc')
    expect(ens.name).toBeNull()
    expect(ens.address).toBe('0xabc')
  })

  it('retries on 429 then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, 429))
      .mockResolvedValueOnce(jsonResponse({ followers_count: 5, following_count: 3 }))
    const client = new EfpClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffMs: 1,
    })
    const stats = await client.getStats('vitalik.eth')
    expect(stats.followers_count).toBe(5)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not retry on a 404', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'not found' }, 404))
    const client = new EfpClient({ fetchImpl: fetchImpl as unknown as typeof fetch })
    await expect(client.getStats('nope.eth')).rejects.toThrow(/404/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
