import { useEffect, useState } from 'react'
import { api } from '../api.ts'
import type { Card, SolveResp } from '../types.ts'

export interface GameInit {
  mode: 'daily' | 'endless' | 'me'
  start: Card
  target: Card
  par: number
  puzzleId?: number
  meToken?: string
  /** Pre-loaded first board for Me Mode (the player's own follows). */
  meFollowing?: Card[]
  meFollowingTotal?: number
}

interface BoardState {
  following: Card[]
  total: number
  nextCursor: number | null
}

const empty: BoardState = { following: [], total: 0, nextCursor: null }

export function useGame(init: GameInit) {
  const [path, setPath] = useState<Card[]>([init.start])
  const [board, setBoard] = useState<BoardState>(empty)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'playing' | 'won'>('playing')
  const [result, setResult] = useState<SolveResp | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState(() => Date.now())

  const current = path[path.length - 1]!

  const isMeStart = (node: Card) => init.mode === 'me' && node.id === init.start.id

  const loadBoard = async (node: Card, q: string, cursor = 0, append = false) => {
    setLoading(true)
    setError(null)
    try {
      if (isMeStart(node)) {
        const all = init.meFollowing ?? []
        const filtered = q
          ? all.filter((c) => (c.name ?? c.address).toLowerCase().includes(q.toLowerCase()))
          : all
        setBoard({ following: filtered, total: init.meFollowingTotal ?? all.length, nextCursor: null })
      } else {
        const resp = await api.board(node.id, cursor, q)
        setBoard((prev) => ({
          following: append ? [...prev.following, ...resp.following] : resp.following,
          total: resp.total,
          nextCursor: resp.nextCursor,
        }))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load')
    } finally {
      setLoading(false)
    }
  }

  const finish = async (finalPath: Card[]) => {
    setStatus('won')
    const ids = finalPath.map((c) => c.id)
    const timeMs = Date.now() - startedAt
    try {
      const resp =
        init.mode === 'me'
          ? await api.meSolve({ meToken: init.meToken!, path: ids, timeMs })
          : await api.solve({
              mode: init.mode,
              puzzleId: init.puzzleId,
              startId: init.start.id,
              targetId: init.target.id,
              path: ids,
              timeMs,
            })
      setResult(resp)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to submit')
    }
  }

  const hop = (card: Card) => {
    if (status !== 'playing') return
    const newPath = [...path, card]
    setPath(newPath)
    setQuery('')
    if (card.id === init.target.id) void finish(newPath)
    else void loadBoard(card, '')
  }

  const undo = () => {
    if (status !== 'playing' || path.length <= 1) return
    const newPath = path.slice(0, -1)
    setPath(newPath)
    setQuery('')
    void loadBoard(newPath[newPath.length - 1]!, '')
  }

  const restart = () => {
    setPath([init.start])
    setStatus('playing')
    setResult(null)
    setQuery('')
    setStartedAt(Date.now()) // a restart is a fresh attempt — reset the clock too
    void loadBoard(init.start, '')
  }

  const search = (q: string) => {
    setQuery(q)
    void loadBoard(current, q, 0, false)
  }

  const loadMore = () => {
    if (board.nextCursor == null || loading) return
    void loadBoard(current, query, board.nextCursor, true)
  }

  // Load the opening board once.
  useEffect(() => {
    void loadBoard(init.start, '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    mode: init.mode,
    start: init.start,
    target: init.target,
    par: init.par,
    path,
    current,
    board,
    loading,
    query,
    status,
    result,
    error,
    startedAt,
    hop,
    undo,
    restart,
    search,
    loadMore,
  }
}
