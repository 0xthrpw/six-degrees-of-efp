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
