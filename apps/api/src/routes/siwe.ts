import type { FastifyInstance } from 'fastify'
import { generateNonce, SiweMessage } from 'siwe'
import { ensureAccount, getCards } from '../accounts.ts'
import {
  clearNonce,
  clearSession,
  getNonce,
  getSessionAddress,
  setNonce,
  setSession,
} from '../session.ts'

interface VerifyBody {
  message: string
  signature: string
}

export async function siweRoutes(app: FastifyInstance): Promise<void> {
  // Issue a single-use nonce, stored in a signed httpOnly cookie.
  app.get('/api/siwe/nonce', async (_req, reply) => {
    const nonce = generateNonce()
    setNonce(reply, nonce)
    return { nonce }
  })

  // Verify the signed SIWE message against the issued nonce, then open a session.
  app.post('/api/siwe/verify', async (req, reply) => {
    const body = req.body as VerifyBody
    const expectedNonce = getNonce(req)
    if (!expectedNonce) return reply.code(422).send({ error: 'missing or expired nonce' })
    if (!body?.message || !body?.signature) {
      return reply.code(400).send({ error: 'message and signature required' })
    }
    try {
      const message = new SiweMessage(body.message)
      const result = await message.verify({ signature: body.signature, nonce: expectedNonce })
      if (!result.success) throw new Error('verification failed')
      const address = message.address.toLowerCase()
      await ensureAccount(address)
      setSession(reply, address)
      clearNonce(reply)
      return { address }
    } catch {
      return reply.code(401).send({ error: 'invalid signature' })
    }
  })

  app.get('/api/siwe/me', async (req) => {
    const address = getSessionAddress(req)
    if (!address) return { address: null, profile: null }
    const id = await ensureAccount(address)
    const cards = await getCards([id])
    return { address, profile: cards[0] ?? null }
  })

  app.post('/api/siwe/signout', async (_req, reply) => {
    clearSession(reply)
    return { ok: true }
  })
}
