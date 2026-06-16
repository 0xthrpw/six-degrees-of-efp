import {
  pgTable,
  serial,
  integer,
  smallint,
  text,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core'

/**
 * Every node in the EFP graph we know about. `id` is a compact integer used as
 * the node id in the in-memory CSR graph; `address` is the lowercased hex key.
 * ENS columns are our own display cache (refreshed lazily by the crawler).
 */
export const accounts = pgTable(
  'accounts',
  {
    id: serial('id').primaryKey(),
    address: text('address').notNull(),
    ensName: text('ens_name'),
    ensAvatar: text('ens_avatar'),
    followersCount: integer('followers_count'),
    followingCount: integer('following_count'),
    ensUpdatedAt: timestamp('ens_updated_at', { withTimezone: true }),
    crawledAt: timestamp('crawled_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('accounts_address_uniq').on(t.address)],
)

/**
 * A pinned, immutable view of the graph. The single `active` snapshot is the
 * board everyone plays against for a day (spec §6 fairness).
 */
export const snapshots = pgTable('snapshots', {
  id: serial('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  nodeCount: integer('node_count').notNull().default(0),
  edgeCount: integer('edge_count').notNull().default(0),
  // 'building' | 'active' | 'archived'
  status: text('status').notNull().default('building'),
})

/** Directed follow edges (src follows dst) materialized for one snapshot. */
export const edges = pgTable(
  'edges',
  {
    snapshotId: integer('snapshot_id')
      .notNull()
      .references(() => snapshots.id, { onDelete: 'cascade' }),
    srcId: integer('src_id')
      .notNull()
      .references(() => accounts.id),
    dstId: integer('dst_id')
      .notNull()
      .references(() => accounts.id),
  },
  (t) => [
    primaryKey({ columns: [t.snapshotId, t.srcId, t.dstId] }),
    index('edges_following_idx').on(t.snapshotId, t.srcId),
    index('edges_followers_idx').on(t.snapshotId, t.dstId),
  ],
)

/** One pinned puzzle per UTC day. */
export const dailyPuzzles = pgTable(
  'daily_puzzles',
  {
    id: serial('id').primaryKey(),
    date: date('date').notNull(),
    snapshotId: integer('snapshot_id')
      .notNull()
      .references(() => snapshots.id),
    startId: integer('start_id')
      .notNull()
      .references(() => accounts.id),
    targetId: integer('target_id')
      .notNull()
      .references(() => accounts.id),
    par: smallint('par').notNull(),
  },
  (t) => [uniqueIndex('daily_puzzles_date_uniq').on(t.date)],
)

/** Precomputed solvable pairs for Endless/Practice, bucketed by par. */
export const endlessPairs = pgTable(
  'endless_pairs',
  {
    id: serial('id').primaryKey(),
    snapshotId: integer('snapshot_id')
      .notNull()
      .references(() => snapshots.id, { onDelete: 'cascade' }),
    startId: integer('start_id')
      .notNull()
      .references(() => accounts.id),
    targetId: integer('target_id')
      .notNull()
      .references(() => accounts.id),
    par: smallint('par').notNull(),
  },
  (t) => [index('endless_pairs_par_idx').on(t.snapshotId, t.par)],
)

/**
 * A server-validated game result. `mode` is 'daily' | 'endless' | 'me'.
 * For daily, (puzzleId, accountId) is unique so we keep each player's best.
 */
export const scores = pgTable(
  'scores',
  {
    id: serial('id').primaryKey(),
    mode: text('mode').notNull(),
    puzzleId: integer('puzzle_id').references(() => dailyPuzzles.id),
    accountId: integer('account_id')
      .notNull()
      .references(() => accounts.id),
    startId: integer('start_id')
      .notNull()
      .references(() => accounts.id),
    targetId: integer('target_id')
      .notNull()
      .references(() => accounts.id),
    hops: smallint('hops').notNull(),
    par: smallint('par').notNull(),
    timeMs: integer('time_ms').notNull(),
    path: jsonb('path').$type<number[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('scores_daily_player_uniq').on(t.puzzleId, t.accountId),
    index('scores_rank_idx').on(t.puzzleId, t.hops, t.timeMs),
  ],
)

export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type Snapshot = typeof snapshots.$inferSelect
export type Edge = typeof edges.$inferSelect
export type DailyPuzzle = typeof dailyPuzzles.$inferSelect
export type EndlessPair = typeof endlessPairs.$inferSelect
export type Score = typeof scores.$inferSelect
export type NewScore = typeof scores.$inferInsert
