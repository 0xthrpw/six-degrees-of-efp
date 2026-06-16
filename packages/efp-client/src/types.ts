/** Response shapes verified live against api.ethfollow.xyz (2026-06-15). */

export interface EfpStats {
  followers_count: number
  following_count: number
}

export interface EfpEns {
  name: string | null
  address: string
  avatar: string | null
  records: Record<string, string | null>
  updated_at?: string
}

/** Item from GET /users/{id}/following. Note: no block/mute flags here. */
export interface FollowingItem {
  version: number
  record_type: string
  data: string
  address: string
  tags: string[]
}

/** Item from GET /users/{id}/followers. Block/mute flags live here. */
export interface FollowerItem {
  efp_list_nft_token_id: string
  address: string
  tags: string[]
  is_following: boolean
  is_blocked: boolean
  is_muted: boolean
  updated_at: string
}

/** Normalized entry from GET /leaderboard/ranked (numeric strings parsed). */
export interface LeaderboardEntry {
  address: string
  name: string | null
  avatar: string | null
  followers: number
  following: number
}

export type SortOrder = 'latest' | 'earliest' | 'followers'

export class EfpApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message)
    this.name = 'EfpApiError'
  }
}
