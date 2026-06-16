import type {
  BoardResp,
  Daily,
  EndlessResp,
  LeaderRow,
  MePuzzle,
  SessionResp,
  SolveResp,
} from './types.ts'

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8787'

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  // Only set a JSON content-type when there is a body — otherwise Fastify
  // rejects bodyless POSTs (e.g. signout) with FST_ERR_CTP_EMPTY_JSON_BODY.
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) }
  if (opts.body != null) headers['content-type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...opts,
    headers,
  })
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { error?: string }
      detail = body.error ?? ''
    } catch {
      /* ignore */
    }
    throw new Error(detail || `${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

export interface SolvePayload {
  mode: 'daily' | 'endless'
  puzzleId?: number
  startId: number
  targetId: number
  path: number[]
  timeMs: number
}

export const api = {
  daily: () => req<Daily>('/api/daily'),
  board: (nodeId: number, cursor = 0, q = '') =>
    req<BoardResp>(`/api/board/${nodeId}/following?cursor=${cursor}&q=${encodeURIComponent(q)}`),
  solve: (body: SolvePayload) => req<SolveResp>('/api/solve', { method: 'POST', body: JSON.stringify(body) }),
  endlessNext: (par?: number) => req<EndlessResp>(`/api/endless/next${par ? `?par=${par}` : ''}`),
  mePuzzle: () => req<MePuzzle>('/api/me/puzzle'),
  meSolve: (body: { meToken: string; path: number[]; timeMs: number }) =>
    req<SolveResp>('/api/me/solve', { method: 'POST', body: JSON.stringify(body) }),
  leaderboard: (puzzleId: number) => req<LeaderRow[]>(`/api/leaderboard/${puzzleId}`),
  siweNonce: () => req<{ nonce: string }>('/api/siwe/nonce'),
  siweVerify: (body: { message: string; signature: string }) =>
    req<{ address: string }>('/api/siwe/verify', { method: 'POST', body: JSON.stringify(body) }),
  siweMe: () => req<SessionResp>('/api/siwe/me'),
  signout: () => req<{ ok: boolean }>('/api/siwe/signout', { method: 'POST' }),
}
