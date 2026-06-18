import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api.ts'
import type { Card } from '../types.ts'
import { useGame, type GameInit } from '../game/useGame.ts'
import { HeroBar } from '../components/HeroBar.tsx'
import { Avatar } from '../components/Avatar.tsx'
import { PersonCard, shortAddress } from '../components/PersonCard.tsx'
import { SignIn } from '../components/SignIn.tsx'
import { useSession } from '../session.tsx'

type Mode = 'daily' | 'endless' | 'me'

export function Play() {
  const { mode } = useParams()
  const m: Mode = mode === 'endless' || mode === 'me' ? mode : 'daily'
  const [init, setInit] = useState<GameInit | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [level, setLevel] = useState(2)

  const load = useCallback(async () => {
    setErr(null)
    setInit(null)
    try {
      if (m === 'daily') {
        const d = await api.daily()
        setInit({ mode: 'daily', start: d.start, target: d.target, par: d.par, puzzleId: d.puzzleId })
      } else if (m === 'endless') {
        const e = await api.endlessNext(level)
        setInit({ mode: 'endless', start: e.start, target: e.target, par: e.par })
      } else {
        const me = await api.mePuzzle()
        setInit({
          mode: 'me',
          start: me.start,
          target: me.target,
          par: me.par,
          meToken: me.meToken,
          meFollowing: me.following,
          meFollowingTotal: me.followingTotal,
        })
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to start')
    }
  }, [m, level])

  useEffect(() => {
    void load()
  }, [load])

  const onNext = () => {
    if (m === 'endless') setLevel((l) => Math.min(l + 1, 4))
    else void load()
  }

  if (err) {
    return (
      <div className="card">
        <p>Couldn’t start: {err}</p>
        <button type="button" className="btn" onClick={() => void load()}>
          Retry
        </button>
      </div>
    )
  }
  if (!init) return <div className="card">Loading…</div>

  return (
    <GameView
      key={`${init.mode}-${init.start.id}-${init.target.id}`}
      init={init}
      canAdvance={m !== 'daily'}
      onNext={onNext}
    />
  )
}

function Timer({ startedAt, frozen }: { startedAt: number; frozen: boolean }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (frozen) return
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [frozen])
  const secs = ((frozen ? now : Date.now()) - startedAt) / 1000
  return <span className="stat">{secs.toFixed(1)}s</span>
}

function GameView({
  init,
  canAdvance,
  onNext,
}: {
  init: GameInit
  canAdvance: boolean
  onNext: () => void
}) {
  const g = useGame(init)
  const hops = g.path.length - 1

  return (
    <div className="game">
      <HeroBar start={g.start} target={g.target} par={g.par} />

      <div className="statusbar">
        <div className="standing">
          <span className="muted small">standing on</span>
          <Avatar address={g.current.address} src={g.current.avatar} name={g.current.name} size={32} />
          <b>{g.current.name ?? shortAddress(g.current.address)}</b>
        </div>
        <div className="stats">
          <span className="stat">{hops} hops</span>
          <Timer startedAt={g.startedAt} frozen={g.status === 'won'} />
          <button type="button" className="btn btn--ghost" onClick={g.undo} disabled={g.path.length <= 1 || g.status === 'won'}>
            Undo
          </button>
          <button type="button" className="btn btn--ghost" onClick={g.restart}>
            Restart
          </button>
        </div>
      </div>

      <input
        className="search"
        placeholder={`Search ${g.board.total} follows…`}
        value={g.query}
        onChange={(e) => g.search(e.target.value)}
      />

      {g.error && <p className="auth__err">{g.error}</p>}

      <div className="grid">
        {g.board.following.map((c: Card) => (
          <PersonCard
            key={c.id}
            card={c}
            highlight={c.id === g.target.id}
            onClick={() => g.hop(c)}
          />
        ))}
      </div>
      {g.loading && <p className="muted">Loading…</p>}
      {!g.loading && g.board.following.length === 0 && (
        <p className="muted">No follows here — this is a dead end. Undo or restart.</p>
      )}
      {g.board.nextCursor != null && (
        <button type="button" className="btn btn--ghost" onClick={g.loadMore}>
          Show more
        </button>
      )}

      {g.status === 'won' && <Result game={g} canAdvance={canAdvance} onNext={onNext} />}
    </div>
  )
}

function Result({
  game,
  canAdvance,
  onNext,
}: {
  game: ReturnType<typeof useGame>
  canAdvance: boolean
  onNext: () => void
}) {
  const nav = useNavigate()
  const { address } = useSession()
  const [copied, setCopied] = useState(false)
  const hops = game.path.length - 1
  const r = game.result
  const startName = game.start.name ?? shortAddress(game.start.address)
  const targetName = game.target.name ?? shortAddress(game.target.address)
  const invalid = r != null && r.valid === false
  const saved = r?.posted === true
  const secs = ((game.finishedMs ?? Date.now() - game.startedAt) / 1000).toFixed(1)

  // If the player signs in after winning, save the result they already earned.
  useEffect(() => {
    if (address && r?.valid && !r.posted) void game.resubmit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  const share = async () => {
    const text = `${startName} → ${targetName} in ${hops} hops (best: ${game.par}) — Six Degrees of EFP`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="overlay">
      <div className="result card">
        <h2>{invalid ? '🤔 Hmm…' : r?.beatPar ? '🏆 Optimal!' : '✅ Connected!'}</h2>
        <p className="result__line">
          {startName} → {targetName} in <b>{hops} hops</b>. Best possible: <b>{game.par}</b>.
        </p>
        <p className="muted">{secs}s{saved ? ' · saved to the leaderboard' : ''}</p>

        {invalid && <p className="auth__err">Couldn’t verify that path: {r?.reason}</p>}
        {!invalid && !saved && (
          <div className="saveprompt">
            {address ? (
              <span className="muted small">Saving your score…</span>
            ) : (
              <>
                <span className="muted small">Sign in to save your score to the leaderboard.</span>
                <SignIn />
              </>
            )}
          </div>
        )}

        <div className="replay">
          {game.path.map((c, i) => (
            <span className="replay__node" key={`${c.id}-${i}`}>
              <Avatar address={c.address} src={c.avatar} name={c.name} size={28} />
              {i < game.path.length - 1 && <span className="replay__arrow">→</span>}
            </span>
          ))}
        </div>

        <div className="row">
          {canAdvance && (
            <button type="button" className="btn btn--big" onClick={onNext}>
              Next puzzle
            </button>
          )}
          <button type="button" className="btn" onClick={game.restart}>
            Replay
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => void share()}>
            {copied ? 'Copied!' : 'Share'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => nav('/')}>
            Home
          </button>
        </div>
      </div>
    </div>
  )
}
