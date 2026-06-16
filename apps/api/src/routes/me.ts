import type { FastifyInstance } from 'fastify'
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { accounts, scores, type Account } from '@sdoe/db'
import { db, efp, getActiveGraph } from '../services.ts'
import { ensureAccount, ensureAddresses, hydrateRows, toCard } from '../accounts.ts'
import { getSessionAddress } from '../session.ts'
import { getMe, newMeToken, putMe } from '../me-store.ts'

const PAGE = 48

interface MeSolveBody {
  meToken: string
  path: number[]
  timeMs: number
}

export async function meRoutes(app: FastifyInstance): Promise<void> {
  // Build a Me-Mode puzzle: START = the signed-in user (who may live outside the
  // snapshot), TARGET = a recognizable account reachable through their follows.
  app.get('/api/me/puzzle', async (req, reply) => {
    const address = getSessionAddress(req)
    if (!address) return reply.code(401).send({ error: 'sign in required' })
    const active = await getActiveGraph()
    if (!active) return reply.code(503).send({ error: 'no active snapshot' })

    const userId = await ensureAccount(address)

    let following
    try {
      following = await efp.getAllFollowing(address)
    } catch {
      return reply.code(502).send({ error: 'failed to load your follows' })
    }
    const followingMap = await ensureAddresses(following.map((f) => f.address))
    const followingIds = [...followingMap.values()]
    const sources = followingIds.filter((id) => active.graph.hasNode(id))
    if (sources.length === 0) {
      return reply.code(422).send({ error: 'none of your follows are in the current graph' })
    }

    // Reachable at distance 1..3 from your follows => real hop count (par) 2..4.
    const reachable = active.graph.reachableFromSources(sources, new Set([1, 2, 3]))
    if (reachable.length === 0) return reply.code(422).send({ error: 'no reachable target' })
    // Prefer par 3 (distance 2); tie-break toward that distance.
    const byPref = [...reachable].sort((a, b) => Math.abs(a.dist - 2) - Math.abs(b.dist - 2))
    const candidateIds = byPref.slice(0, 300).map((r) => r.id)
    const named = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(inArray(accounts.id, candidateIds), isNotNull(accounts.ensName)))
    const namedSet = new Set(named.map((n) => n.id))
    const chosen = byPref.find((r) => namedSet.has(r.id)) ?? byPref[0]!
    const targetId = chosen.id
    const par = chosen.dist + 1

    const token = newMeToken()
    putMe(token, {
      userId,
      followingIds: new Set(followingIds),
      targetId,
      par,
      snapshotId: active.snapshotId,
      createdAt: Date.now(),
    })

    const userRows = await db.select().from(accounts).where(eq(accounts.id, userId))
    const targetRows = await db.select().from(accounts).where(eq(accounts.id, targetId))
    await hydrateRows([...userRows, ...targetRows])

    // First board = the player's live following list (they're not a snapshot node).
    const boardRows: Account[] = await db
      .select()
      .from(accounts)
      .where(inArray(accounts.id, followingIds))
      .orderBy(sql`${accounts.followersCount} DESC NULLS LAST`, sql`${accounts.ensName} ASC NULLS LAST`, accounts.id)
      .limit(PAGE + 1)
    const hasMore = boardRows.length > PAGE
    const page = boardRows.slice(0, PAGE)
    await hydrateRows(page)

    return {
      meToken: token,
      par,
      start: userRows[0] ? toCard(userRows[0]) : null,
      target: targetRows[0] ? toCard(targetRows[0]) : null,
      following: page.map(toCard),
      followingTotal: followingIds.length,
      followingNextCursor: hasMore ? PAGE : null,
    }
  })

  app.post('/api/me/solve', async (req, reply) => {
    const active = await getActiveGraph()
    if (!active) return reply.code(503).send({ error: 'no active snapshot' })
    const body = req.body as MeSolveBody
    const session = getMe(body.meToken)
    if (!session) return reply.code(400).send({ error: 'me session expired — start again' })
    if (session.snapshotId !== active.snapshotId) {
      return reply.code(409).send({ error: 'snapshot changed — start again' })
    }
    if (!Array.isArray(body.path) || body.path.length < 2) {
      return reply.code(400).send({ error: 'path too short' })
    }
    if (body.path[0] !== session.userId) {
      return { valid: false, reason: 'path must start at you' }
    }
    if (!session.followingIds.has(body.path[1]!)) {
      return { valid: false, reason: 'first hop must be an account you follow' }
    }
    // The remainder (from your first follow to the target) must be snapshot edges.
    const sub = body.path.slice(1)
    const check = active.graph.validatePath(sub, body.path[1]!, session.targetId)
    if (!check.valid) return { valid: false, reason: check.reason }

    const hops = body.path.length - 1
    const address = getSessionAddress(req)
    let posted = false
    if (address) {
      const accountId = await ensureAccount(address)
      await db.insert(scores).values({
        mode: 'me',
        puzzleId: null,
        accountId,
        startId: session.userId,
        targetId: session.targetId,
        hops,
        par: session.par,
        timeMs: Math.max(0, Math.floor(body.timeMs) || 0),
        path: body.path,
      })
      posted = true
    }
    return { valid: true, hops, par: session.par, beatPar: hops <= session.par, posted }
  })
}
