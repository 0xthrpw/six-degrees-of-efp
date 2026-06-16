import type { FastifyReply, FastifyRequest } from 'fastify'

const SESSION_COOKIE = 'sdoe_session'
export const NONCE_COOKIE = 'sdoe_nonce'

const baseCookie = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: false, // dev over http; set true behind TLS in prod
  path: '/',
}

export function setSession(reply: FastifyReply, address: string): void {
  reply.setCookie(SESSION_COOKIE, address.toLowerCase(), {
    ...baseCookie,
    signed: true,
    maxAge: 60 * 60 * 24 * 7,
  })
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' })
}

export function getSessionAddress(req: FastifyRequest): string | null {
  const raw = req.cookies[SESSION_COOKIE]
  if (!raw) return null
  const unsigned = req.unsignCookie(raw)
  return unsigned.valid && unsigned.value ? unsigned.value : null
}

export function setNonce(reply: FastifyReply, nonce: string): void {
  reply.setCookie(NONCE_COOKIE, nonce, { ...baseCookie, signed: true, maxAge: 60 * 10 })
}

export function getNonce(req: FastifyRequest): string | null {
  const raw = req.cookies[NONCE_COOKIE]
  if (!raw) return null
  const unsigned = req.unsignCookie(raw)
  return unsigned.valid && unsigned.value ? unsigned.value : null
}

export function clearNonce(reply: FastifyReply): void {
  reply.clearCookie(NONCE_COOKIE, { path: '/' })
}
