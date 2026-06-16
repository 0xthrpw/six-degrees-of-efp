import type { FastifyInstance } from 'fastify'
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { accounts, dailyPuzzles, endlessPairs, scores, type Account } from '@sdoe/db'
import { UNREACHABLE } from '@sdoe/graph'
import { db } from '../services.ts'
import { getActiveGraph } from '../services.ts'
import { ensureAccount, getCards, hydrateRows, toCard } from '../accounts.ts'
import { getSessionAddress } from '../session.ts'

interface SolveBody {
  mode: 'daily' | 'endless'
  puzzleId?: number
  startId: number
  targetId: number
  path: number[]
  timeMs: number
}

async function persistScore(opts: {
  mode: string
  puzzleId: number | null
  accountId: number
  startId: number
  targetId: number
  hops: number
  par: number
  timeMs: number
  path: number[]
}): Promise<void> {
  const values = {
    mode: opts.mode,
    puzzleId: opts.puzzleId,
    accountId: opts.accountId,
    startId: opts.startId,
    targetId: opts.targetId,
    hops: opts.hops,
    par: opts.par,
    timeMs: opts.timeMs,
    path: opts.path,
  }
  if (opts.puzzleId != null) {
    await db
      .insert(scores)
      .values(values)
      .onConflictDoUpdate({
        target: [scores.puzzleId, scores.accountId],
        set: { hops: opts.hops, timeMs: opts.timeMs, path: opts.path, createdAt: new Date() },
        setWhere: sql`scores.hops > excluded.hops OR (scores.hops = excluded.hops AND scores.time_ms > excluded.time_ms)`,
      })
  } else {
    await db.insert(scores).values(values)
  }
}

export async function gameRoutes(app: FastifyInstance): Promise<void> {
  // Today's pinned puzzle (for the active snapshot).
  app.get('/api/daily', async (_req, reply) => {
    const active = await getActiveGraph()
    if (!active) return reply.code(503).send({ error: 'no active snapshot' })
    const rows = await db
      .select()
      .from(dailyPuzzles)
      .where(eq(dailyPuzzles.snapshotId, active.snapshotId))
      .orderBy(desc(dailyPuzzles.date))
      .limit(1)
    if (rows.length === 0) return reply.code(404).send({ error: 'no daily puzzle yet' })
    const p = rows[0]!
    const cards = await getCards([p.startId, p.targetId])
    return {
      puzzleId: p.id,
      date: p.date,
      par: p.par,
      snapshotId: p.snapshotId,
      start: cards.find((c) => c.id === p.startId) ?? null,
      target: cards.find((c) => c.id === p.targetId) ?? null,
    }
  })

  // The following list of one node, sorted by popularity, paginated + searchable.
  app.get('/api/board/:nodeId/following', async (req, reply) => {
    const active = await getActiveGraph()
    if (!active) return reply.code(503).send({ error: 'no active snapshot' })
    const params = req.params as { nodeId: string }
    const query = req.query as { cursor?: string; q?: string; limit?: string }
    const nodeId = Number(params.nodeId)
    if (!Number.isInteger(nodeId)) return reply.code(400).send({ error: 'bad nodeId' })

    const neighborIds = active.graph.following(nodeId)
    const offset = Math.max(0, Number(query.cursor ?? 0) || 0)
    const limit = Math.min(Math.max(1, Number(query.limit ?? 48) || 48), 100)

    if (neighborIds.length === 0) {
      return { nodeId, total: 0, cursor: offset, nextCursor: null, following: [] }
    }

    const q = query.q?.trim()
    let where = inArray(accounts.id, neighborIds)
    if (q) {
      const like = `%${q}%`
      where = and(where, or(ilike(accounts.ensName, like), ilike(accounts.address, `%${q.toLowerCase()}%`)))!
    }
    const rows: Account[] = await db
      .select()
      .from(accounts)
      .where(where)
      .orderBy(sql`${accounts.followersCount} DESC NULLS LAST`, sql`${accounts.ensName} ASC NULLS LAST`, accounts.id)
      .limit(limit + 1)
      .offset(offset)

    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)
    await hydrateRows(page)

    return {
      nodeId,
      total: neighborIds.length,
      cursor: offset,
      nextCursor: hasMore ? offset + limit : null,
      following: page.map(toCard),
    }
  })

  // Validate a finished path (server-authoritative; client is never trusted).
  app.post('/api/solve', async (req, reply) => {
    const active = await getActiveGraph()
    if (!active) return reply.code(503).send({ error: 'no active snapshot' })
    const body = req.body as SolveBody
    if (!Array.isArray(body.path) || body.path.length < 2) {
      return reply.code(400).send({ error: 'path must have at least 2 nodes' })
    }

    let par: number
    let puzzleId: number | null = null
    if (body.mode === 'daily') {
      if (body.puzzleId == null) return reply.code(400).send({ error: 'puzzleId required' })
      const rows = await db.select().from(dailyPuzzles).where(eq(dailyPuzzles.id, body.puzzleId)).limit(1)
      const puzzle = rows[0]
      if (!puzzle || puzzle.snapshotId !== active.snapshotId) {
        return reply.code(409).send({ error: 'puzzle not for active snapshot' })
      }
      if (puzzle.startId !== body.startId || puzzle.targetId !== body.targetId) {
        return reply.code(400).send({ error: 'start/target do not match puzzle' })
      }
      par = puzzle.par
      puzzleId = puzzle.id
    } else {
      const hops = active.graph.shortestHops(body.startId, body.targetId)
      if (hops === UNREACHABLE) return reply.code(400).send({ error: 'pair is unreachable' })
      par = hops
    }

    const check = active.graph.validatePath(body.path, body.startId, body.targetId)
    if (!check.valid) return { valid: false, reason: check.reason }

    const address = getSessionAddress(req)
    if (address) {
      const accountId = await ensureAccount(address)
      await persistScore({
        mode: body.mode,
        puzzleId,
        accountId,
        startId: body.startId,
        targetId: body.targetId,
        hops: check.hops,
        par,
        timeMs: Math.max(0, Math.floor(body.timeMs) || 0),
        path: body.path,
      })
    }

    return { valid: true, hops: check.hops, par, beatPar: check.hops <= par, posted: Boolean(address) }
  })

  // A random solvable Endless pair at the requested difficulty.
  app.get('/api/endless/next', async (req, reply) => {
    const active = await getActiveGraph()
    if (!active) return reply.code(503).send({ error: 'no active snapshot' })
    const query = req.query as { par?: string }
    const par = Number(query.par)
    const conds = [eq(endlessPairs.snapshotId, active.snapshotId)]
    if (Number.isInteger(par)) conds.push(eq(endlessPairs.par, par))
    const rows = await db
      .select()
      .from(endlessPairs)
      .where(and(...conds))
      .orderBy(sql`random()`)
      .limit(1)
    if (rows.length === 0) return reply.code(404).send({ error: 'no endless pairs' })
    const p = rows[0]!
    const cards = await getCards([p.startId, p.targetId])
    return {
      startId: p.startId,
      targetId: p.targetId,
      par: p.par,
      start: cards.find((c) => c.id === p.startId) ?? null,
      target: cards.find((c) => c.id === p.targetId) ?? null,
    }
  })
}
