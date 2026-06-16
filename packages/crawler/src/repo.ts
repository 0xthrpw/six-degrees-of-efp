import { eq, inArray, sql } from 'drizzle-orm'
import {
  accounts,
  dailyPuzzles,
  edges,
  endlessPairs,
  snapshots,
  type Database,
} from '@sdoe/db'
import type { LeaderboardEntry } from '@sdoe/efp-client'
import type { Pair } from '@sdoe/graph'
import { chunk } from './concurrency.ts'

/** Insert any unknown addresses (address-only) and return address -> id for all. */
export async function ensureAddresses(
  db: Database,
  addresses: string[],
): Promise<Map<string, number>> {
  const uniq = [...new Set(addresses.map((a) => a.toLowerCase()))]
  const map = new Map<string, number>()
  if (uniq.length === 0) return map
  for (const c of chunk(uniq, 1000)) {
    await db
      .insert(accounts)
      .values(c.map((address) => ({ address })))
      .onConflictDoNothing()
  }
  for (const c of chunk(uniq, 1000)) {
    const rows = await db
      .select({ id: accounts.id, address: accounts.address })
      .from(accounts)
      .where(inArray(accounts.address, c))
    for (const r of rows) map.set(r.address, r.id)
  }
  return map
}

/** Upsert leaderboard seeds with their ENS name/avatar/counts. */
export async function upsertSeeds(
  db: Database,
  leaders: LeaderboardEntry[],
): Promise<Map<string, number>> {
  const now = new Date()
  const rows = leaders.map((l) => ({
    address: l.address.toLowerCase(),
    ensName: l.name,
    ensAvatar: l.avatar,
    followersCount: l.followers,
    followingCount: l.following,
    ensUpdatedAt: now,
    crawledAt: now,
  }))
  for (const c of chunk(rows, 500)) {
    await db
      .insert(accounts)
      .values(c)
      .onConflictDoUpdate({
        target: accounts.address,
        set: {
          ensName: sql`excluded.ens_name`,
          ensAvatar: sql`excluded.ens_avatar`,
          followersCount: sql`excluded.followers_count`,
          followingCount: sql`excluded.following_count`,
          ensUpdatedAt: sql`excluded.ens_updated_at`,
          crawledAt: sql`excluded.crawled_at`,
        },
      })
  }
  const map = new Map<string, number>()
  for (const c of chunk(rows.map((r) => r.address), 1000)) {
    const sel = await db
      .select({ id: accounts.id, address: accounts.address })
      .from(accounts)
      .where(inArray(accounts.address, c))
    for (const r of sel) map.set(r.address, r.id)
  }
  return map
}

/** Persist edges under a new snapshot and flip it to the single active one. */
export async function writeSnapshot(
  db: Database,
  nodeCount: number,
  edgePairs: Array<readonly [number, number]>,
): Promise<number> {
  const inserted = await db
    .insert(snapshots)
    .values({ status: 'building', nodeCount })
    .returning({ id: snapshots.id })
  const snapshotId = inserted[0]!.id

  const rows = edgePairs.map(([srcId, dstId]) => ({ snapshotId, srcId, dstId }))
  for (const c of chunk(rows, 5000)) {
    await db.insert(edges).values(c).onConflictDoNothing()
  }

  await db.update(snapshots).set({ status: 'archived' }).where(eq(snapshots.status, 'active'))
  await db
    .update(snapshots)
    .set({ status: 'active', nodeCount, edgeCount: rows.length })
    .where(eq(snapshots.id, snapshotId))
  return snapshotId
}

export async function insertDailyPuzzle(
  db: Database,
  p: { date: string; snapshotId: number; startId: number; targetId: number; par: number },
): Promise<void> {
  await db.insert(dailyPuzzles).values(p).onConflictDoNothing()
}

export async function insertEndlessPairs(
  db: Database,
  snapshotId: number,
  pairs: Pair[],
): Promise<void> {
  if (pairs.length === 0) return
  const rows = pairs.map((p) => ({
    snapshotId,
    startId: p.startId,
    targetId: p.targetId,
    par: p.par,
  }))
  for (const c of chunk(rows, 1000)) await db.insert(endlessPairs).values(c)
}
