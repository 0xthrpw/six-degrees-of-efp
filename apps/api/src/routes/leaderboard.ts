import type { FastifyInstance } from 'fastify'
import { asc, eq } from 'drizzle-orm'
import { accounts, scores } from '@sdoe/db'
import { db } from '../services.ts'

export async function leaderboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/leaderboard/:puzzleId', async (req, reply) => {
    const params = req.params as { puzzleId: string }
    const puzzleId = Number(params.puzzleId)
    if (!Number.isInteger(puzzleId)) return reply.code(400).send({ error: 'bad puzzleId' })

    const rows = await db
      .select({
        hops: scores.hops,
        timeMs: scores.timeMs,
        name: accounts.ensName,
        avatar: accounts.ensAvatar,
        address: accounts.address,
      })
      .from(scores)
      .innerJoin(accounts, eq(scores.accountId, accounts.id))
      .where(eq(scores.puzzleId, puzzleId))
      .orderBy(asc(scores.hops), asc(scores.timeMs))
      .limit(100)

    return rows.map((r, i) => ({ rank: i + 1, ...r }))
  })
}
