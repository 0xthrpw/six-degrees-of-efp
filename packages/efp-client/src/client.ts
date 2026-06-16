import {
  EfpApiError,
  type EfpEns,
  type EfpStats,
  type FollowerItem,
  type FollowingItem,
  type LeaderboardEntry,
  type SortOrder,
} from './types.ts'

/** The EFP API silently clamps `limit` to this value (verified empirically). */
export const MAX_PAGE_SIZE = 100
const DEFAULT_BASE = 'https://api.ethfollow.xyz/api/v1'

export interface EfpClientOptions {
  baseUrl?: string
  /** Retries on 429/5xx/network errors (default 4). */
  retries?: number
  /** Base backoff in ms, doubled each retry with jitter (default 500). */
  backoffMs?: number
  /** Swap in a fake for testing. Defaults to global fetch. */
  fetchImpl?: typeof fetch
  /** Hard ceiling on pages when draining a list (default 2000 = 200k records). */
  maxPages?: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class EfpClient {
  private readonly baseUrl: string
  private readonly retries: number
  private readonly backoffMs: number
  private readonly fetchImpl: typeof fetch
  private readonly maxPages: number

  constructor(opts: EfpClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.EFP_API_BASE ?? DEFAULT_BASE).replace(/\/$/, '')
    this.retries = opts.retries ?? 4
    this.backoffMs = opts.backoffMs ?? 500
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.maxPages = opts.maxPages ?? 2000
  }

  private async getJson<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`
    let lastErr: unknown
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const res = await this.fetchImpl(url, { headers: { accept: 'application/json' } })
        if (res.ok) return (await res.json()) as T
        // Retry transient statuses; fail fast on other 4xx.
        if (res.status === 429 || res.status >= 500) {
          lastErr = new EfpApiError(`EFP ${res.status} for ${url}`, res.status, url)
        } else {
          throw new EfpApiError(`EFP ${res.status} for ${url}`, res.status, url)
        }
      } catch (err) {
        lastErr = err
        if (err instanceof EfpApiError && err.status !== 429 && err.status < 500) throw err
      }
      if (attempt < this.retries) {
        const jitter = Math.floor(Math.random() * this.backoffMs)
        await sleep(this.backoffMs * 2 ** attempt + jitter)
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(`EFP request failed: ${url}`)
  }

  async getStats(id: string): Promise<EfpStats> {
    return this.getJson<EfpStats>(`/users/${encodeURIComponent(id)}/stats`)
  }

  /** Unwraps the `{ ens: {...} }` envelope. `name`/`avatar` may be null. */
  async getEns(id: string): Promise<EfpEns> {
    const body = await this.getJson<{ ens: EfpEns }>(`/users/${encodeURIComponent(id)}/ens`)
    return body.ens
  }

  async getFollowingPage(
    id: string,
    opts: { limit?: number; offset?: number; sort?: SortOrder } = {},
  ): Promise<FollowingItem[]> {
    const limit = Math.min(opts.limit ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE)
    const offset = opts.offset ?? 0
    const sort = opts.sort ? `&sort=${opts.sort}` : ''
    const body = await this.getJson<{ following: FollowingItem[] }>(
      `/users/${encodeURIComponent(id)}/following?limit=${limit}&offset=${offset}${sort}`,
    )
    return body.following ?? []
  }

  async getFollowersPage(
    id: string,
    opts: { limit?: number; offset?: number; sort?: SortOrder } = {},
  ): Promise<FollowerItem[]> {
    const limit = Math.min(opts.limit ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE)
    const offset = opts.offset ?? 0
    const sort = opts.sort ? `&sort=${opts.sort}` : ''
    const body = await this.getJson<{ followers: FollowerItem[] }>(
      `/users/${encodeURIComponent(id)}/followers?limit=${limit}&offset=${offset}${sort}`,
    )
    return body.followers ?? []
  }

  /** Drains the full following list, paging 100 at a time until a short read. */
  async getAllFollowing(id: string): Promise<FollowingItem[]> {
    const out: FollowingItem[] = []
    for (let page = 0; page < this.maxPages; page++) {
      const batch = await this.getFollowingPage(id, {
        limit: MAX_PAGE_SIZE,
        offset: page * MAX_PAGE_SIZE,
      })
      out.push(...batch)
      if (batch.length < MAX_PAGE_SIZE) break
    }
    return out
  }

  /** Drains the full followers list (used for reverse BFS / loose data). */
  async getAllFollowers(id: string): Promise<FollowerItem[]> {
    const out: FollowerItem[] = []
    for (let page = 0; page < this.maxPages; page++) {
      const batch = await this.getFollowersPage(id, {
        limit: MAX_PAGE_SIZE,
        offset: page * MAX_PAGE_SIZE,
      })
      out.push(...batch)
      if (batch.length < MAX_PAGE_SIZE) break
    }
    return out
  }

  /** Top accounts by the given metric (default followers) — our crawl seed. */
  async getLeaderboard(
    opts: { limit?: number; sort?: 'followers' | 'following' | 'mutuals' } = {},
  ): Promise<LeaderboardEntry[]> {
    const limit = opts.limit ?? 500
    const sort = opts.sort ?? 'followers'
    const body = await this.getJson<{
      results: Array<{
        address: string
        name: string | null
        avatar: string | null
        followers: string | number
        following: string | number
      }>
    }>(`/leaderboard/ranked?limit=${limit}&sort=${sort}`)
    return (body.results ?? []).map((r) => ({
      address: r.address,
      name: r.name,
      avatar: r.avatar,
      followers: Number(r.followers) || 0,
      following: Number(r.following) || 0,
    }))
  }
}
