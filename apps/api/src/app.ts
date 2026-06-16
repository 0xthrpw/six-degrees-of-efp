import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import { env } from './env.ts'
import { gameRoutes } from './routes/game.ts'
import { meRoutes } from './routes/me.ts'
import { siweRoutes } from './routes/siwe.ts'
import { leaderboardRoutes } from './routes/leaderboard.ts'

export function buildApp() {
  const app = Fastify({ logger: { level: 'info' } })

  app.register(cors, { origin: env.webOrigin, credentials: true })
  app.register(cookie, { secret: env.sessionSecret })

  app.get('/health', async () => ({ ok: true }))

  app.register(gameRoutes)
  app.register(meRoutes)
  app.register(siweRoutes)
  app.register(leaderboardRoutes)

  return app
}
