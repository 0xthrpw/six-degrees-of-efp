import { eq, inArray } from 'drizzle-orm'
import { accounts, type Account } from '@sdoe/db'
import { db, efp } from './services.ts'
import { mapLimit } from './util.ts'

/** Display payload for one node/person card. */
export interface Card {
  id: number
  address: string
  name: string | null
  avatar: string | null
  followers: number | null
}

export function toCard(a: Pick<Account, 'id' | 'address' | 'ensName' | 'ensAvatar' | 'followersCount'>): Card {
  return {
    id: a.id,
    address: a.address,
    name: a.ensName,
    avatar: a.ensAvatar,
    followers: a.followersCount,
  }
}

/** Ensure an account row exists for an address; returns its id. */
export async function ensureAccount(address: string): Promise<number> {
  const addr = address.toLowerCase()
  await db.insert(accounts).values({ address: addr }).onConflictDoNothing()
  const rows = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.address, addr))
  return rows[0]!.id
}

export async function ensureAddresses(addresses: string[]): Promise<Map<string, number>> {
  const uniq = [...new Set(addresses.map((a) => a.toLowerCase()))]
  const map = new Map<string, number>()
  if (uniq.length === 0) return map
  for (let i = 0; i < uniq.length; i += 1000) {
    const c = uniq.slice(i, i + 1000)
    await db
      .insert(accounts)
      .values(c.map((address) => ({ address })))
      .onConflictDoNothing()
    const rows = await db
      .select({ id: accounts.id, address: accounts.address })
      .from(accounts)
      .where(inArray(accounts.address, c))
    for (const r of rows) map.set(r.address, r.id)
  }
  return map
}

/**
 * Lazily backfill ENS name/avatar for rows never hydrated (ens_updated_at null),
 * writing through to Postgres so subsequent viewers hit our cache. Mutates the
 * passed rows in place. Failures leave the row unhydrated (client shows 0x…).
 */
export async function hydrateRows(rows: Account[]): Promise<void> {
  const need = rows.filter((r) => r.ensUpdatedAt == null)
  if (need.length === 0) return
  await mapLimit(need, 8, async (r) => {
    try {
      const ens = await efp.getEns(r.address)
      const avatar = ens.avatar ?? ens.records?.['avatar'] ?? null
      r.ensName = ens.name
      r.ensAvatar = avatar
      r.ensUpdatedAt = new Date()
      await db
        .update(accounts)
        .set({ ensName: ens.name, ensAvatar: avatar, ensUpdatedAt: r.ensUpdatedAt })
        .where(eq(accounts.id, r.id))
    } catch {
      // leave unhydrated; do not mark ens_updated_at so we retry later
    }
  })
}

/** Fetch one card, lazily resolving its ENS (name + avatar) if not yet cached. */
export async function getCardHydrated(id: number): Promise<Card | null> {
  const rows = await db.select().from(accounts).where(eq(accounts.id, id))
  if (rows.length === 0) return null
  await hydrateRows(rows)
  return toCard(rows[0]!)
}

/** Fetch cards for a set of ids in the given order (no hydration). */
export async function getCards(ids: number[]): Promise<Card[]> {
  if (ids.length === 0) return []
  const rows = await db.select().from(accounts).where(inArray(accounts.id, ids))
  const byId = new Map(rows.map((r) => [r.id, toCard(r)]))
  return ids.map((id) => byId.get(id)).filter((c): c is Card => c !== undefined)
}
