import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.ts'
import type { Daily, LeaderRow } from '../types.ts'
import { HeroBar } from '../components/HeroBar.tsx'
import { Avatar } from '../components/Avatar.tsx'
import { shortAddress } from '../components/PersonCard.tsx'
import { useSession } from '../session.tsx'

const label = (c: { name: string | null; address: string }) => c.name ?? shortAddress(c.address)

export function Home() {
  const nav = useNavigate()
  const { address } = useSession()
  const [daily, setDaily] = useState<Daily | null>(null)
  const [board, setBoard] = useState<LeaderRow[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api
      .daily()
      .then(async (d) => {
        setDaily(d)
        setBoard(await api.leaderboard(d.puzzleId))
      })
      .catch((e: Error) => setErr(e.message))
  }, [])

  if (err) {
    return <div className="card">Couldn’t load today’s puzzle: {err}. Has the crawler run yet?</div>
  }
  if (!daily) return <div className="card">Loading today’s challenge…</div>

  return (
    <div className="home">
      <section className="card">
        <h1>Today’s Challenge</h1>
        <HeroBar start={daily.start} target={daily.target} par={daily.par} />
        <p className="muted">
          Hop from <b>{label(daily.start)}</b> to <b>{label(daily.target)}</b> through follows.
          Fewer hops wins.
        </p>
        <div className="row">
          <button type="button" className="btn btn--big" onClick={() => nav('/play/daily')}>
            Play daily
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => nav('/play/endless')}>
            Endless
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!address}
            title={address ? '' : 'Sign in to play Me Mode'}
            onClick={() => nav('/play/me')}
          >
            Me Mode
          </button>
        </div>
        {!address && (
          <p className="muted small">Sign in with Ethereum to post scores and play Me Mode.</p>
        )}
      </section>

      <section className="card">
        <h2>Leaderboard</h2>
        {board.length === 0 ? (
          <p className="muted">No scores yet — be the first.</p>
        ) : (
          <ol className="leaderboard">
            {board.map((r) => (
              <li key={`${r.rank}-${r.address}`}>
                <span className="lb__rank">{r.rank}</span>
                <Avatar address={r.address} src={r.avatar} name={r.name} size={28} />
                <span className="lb__name">{r.name ?? shortAddress(r.address)}</span>
                <span className="lb__score">
                  {r.hops} hops · {(r.timeMs / 1000).toFixed(1)}s
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
