import { randomBytes } from 'node:crypto'

/** A pending Me-Mode game, held server-side so we can validate the first hop
 *  (the player's live follows) which lives outside the pinned snapshot. */
export interface MeSession {
  userId: number
  followingIds: Set<number>
  targetId: number
  par: number
  snapshotId: number
  createdAt: number
}

const TTL_MS = 30 * 60 * 1000
const store = new Map<string, MeSession>()

export function newMeToken(): string {
  return randomBytes(16).toString('hex')
}

export function putMe(token: string, session: MeSession): void {
  store.set(token, session)
}

export function getMe(token: string): MeSession | null {
  const s = store.get(token)
  if (!s) return null
  if (Date.now() - s.createdAt > TTL_MS) {
    store.delete(token)
    return null
  }
  return s
}

/** Recently-served Me-Mode targets per user, so we don't repeat the same one. */
const RECENT_LIMIT = 25
const recentTargets = new Map<number, number[]>()

export function getRecentTargets(userId: number): ReadonlySet<number> {
  return new Set(recentTargets.get(userId) ?? [])
}

export function recordRecentTarget(userId: number, targetId: number): void {
  const arr = recentTargets.get(userId) ?? []
  arr.push(targetId)
  while (arr.length > RECENT_LIMIT) arr.shift()
  recentTargets.set(userId, arr)
}

/**
 * Choose a Me-Mode target from reachable candidates, preferring ones not served
 * recently and picking at random for variety. Returns null only if there are no
 * candidates at all.
 */
export function pickMeTarget<T extends { id: number }>(
  candidates: T[],
  recent: ReadonlySet<number>,
  rng: () => number = Math.random,
): T | null {
  if (candidates.length === 0) return null
  const fresh = candidates.filter((c) => !recent.has(c.id))
  const pool = fresh.length > 0 ? fresh : candidates
  return pool[Math.floor(rng() * pool.length)]!
}
