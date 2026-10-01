import { useEffect, useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { GameBoard } from '~/components/game/GameBoard'
import { Brand, QuickRules } from '~/components/lobby/common'
import { JoinForm } from '~/components/lobby/JoinForm'
import { WaitingRoom } from '~/components/lobby/WaitingRoom'
import { loadName, useRoom } from '~/lib/client'
import { NAME_MAX, normalizeCode } from '~/lib/protocol'

export const Route = createFileRoute('/room/$code')({
  component: RoomPage,
})

function RoomPage() {
  const { code: rawCode } = Route.useParams()
  const code = normalizeCode(rawCode)
  const navigate = useNavigate()
  const { ready, view, conn, connError, join, op, leave, act, removed, clearRemoved } = useRoom(code)
  const [spectating, setSpectating] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 4000)
    return () => clearTimeout(t)
  }, [notice])

  const report = (r: { ok: boolean; error?: string }) => {
    if (!r.ok && r.error) setNotice(r.error)
  }

  useEffect(() => {
    if (!removed) return
    setNotice('You are no longer seated in this room.')
    clearRemoved()
  }, [removed, clearRemoved])

  const [skipping, setSkipping] = useState(false)
  const currentId = view?.game ? view.game.players[view.game.currentPlayerIndex]?.id : undefined
  const currentOnline = view?.players.find((p) => p.id === currentId)?.connected ?? true
  const currentAwayFor = useOfflineFor(currentId, !currentOnline, SKIP_GRACE_MS)
  const awayLongEnough = currentAwayFor.elapsed
  const hostMember = view?.players.find((p) => p.isHost)
  const hostAway = useOfflineFor(hostMember?.id, !!hostMember && !hostMember.connected, SKIP_GRACE_MS).elapsed

  const goHome = () => navigate({ to: '/' })

  if (conn === 'missing') {
    return (
      <main className="lobby-shell">
        <Brand tagline="Room not found" />
        <section className="panel">
          <h2>No game here</h2>
          <p className="sub">
            There is no game with code <b>{code}</b>. It may have ended or the server restarted.
          </p>
          <Link to="/" className="btn btn-primary">
            Back home
          </Link>
        </section>
      </main>
    )
  }

  if (!ready || !view) return <div className="center-note">{connError || 'Entering the gem market…'}</div>

  const connectionBanner =
    conn === 'reconnecting' ? (
      <div className="conn-banner">{connError || 'Connection lost — reconnecting…'}</div>
    ) : notice ? (
      <div className="conn-banner" role="alert" onClick={() => setNotice('')}>
        {notice}
      </div>
    ) : null

  // When the host has been offline for a while, anyone can take over host duties
  // (the server promotes them on first use).
  const canHost = !!view.youId && (view.hostId === view.youId || !hostMember || hostAway)

  // In-game (or finished) — members play, others may spectate.
  if (view.status === 'playing' && view.game && (view.youId || spectating)) {
    const connected = Object.fromEntries(view.players.map((p) => [p.id, p.connected]))
    const current = view.game.players[view.game.currentPlayerIndex]
    const currentAway = view.game.status === 'playing' && current && connected[current.id] === false && awayLongEnough
    const turn = view.game.turn
    const colorIndex = Object.fromEntries(view.players.map((p, i) => [p.id, i]))
    return (
      <>
        {connectionBanner}
        {currentAway && view.youId && (
          <div className="skip-banner">
            <span>
              <b>{current.name}</b> is offline. They can rejoin with the same name from the game link.
            </span>
            <button
              className="btn btn-sm"
              disabled={skipping}
              onClick={async () => {
                setSkipping(true)
                report(await op((token) => ({ op: 'skipTurn', token, turn })))
                setSkipping(false)
              }}
            >
              Skip their turn
            </button>
          </div>
        )}
        <GameBoard
          state={view.game}
          youId={view.youId}
          connected={connected}
          isHost={canHost}
          onAction={act}
          onPlayAgain={async () => report(await op((token) => ({ op: 'playAgain', token })))}
          onLeave={goHome}
          colorIndex={colorIndex}
          currentSkipAt={view.game.status === 'playing' && current && connected[current.id] === false ? currentAwayFor.until : null}
        />
      </>
    )
  }

  return (
    <main className="lobby-shell">
      {connectionBanner}
      <Brand />
      {view.status === 'playing' && !view.youId ? (
        <section className="panel">
          <h2>Game in progress</h2>
          <p className="sub">
            {view.players.map((p) => p.name).join(', ')} are already playing. You can watch as a spectator.
          </p>
          {view.players.some((p) => !p.connected) && <RejoinForm onJoin={join} />}
          <div className="row">
            <button className="btn btn-primary" onClick={() => setSpectating(true)}>
              Watch game
            </button>
            <Link to="/" className="btn btn-ghost">
              Back home
            </Link>
          </div>
        </section>
      ) : view.youId ? (
        <WaitingRoom
          view={view}
          op={op}
          canHost={canHost}
          onLeave={async () => {
            const r = await leave()
            if (r.ok) goHome()
            else report(r)
          }}
        />
      ) : (
        <JoinForm view={view} onJoin={join} />
      )}
      <QuickRules />
    </main>
  )
}

const SKIP_GRACE_MS = 8000

/** `elapsed` turns true once `active` has stayed true for `ms` for the same `key` (e.g. a player offline
 *  for 8s); `until` is when that happens (epoch ms), or null while inactive — for a countdown. */
function useOfflineFor(key: string | undefined, active: boolean, ms: number): { elapsed: boolean; until: number | null } {
  const [elapsed, setElapsed] = useState(false)
  const [until, setUntil] = useState<number | null>(null)
  const since = useRef<{ key?: string; at: number } | null>(null)
  useEffect(() => {
    setElapsed(false)
    if (!active) {
      since.current = null
      setUntil(null)
      return
    }
    const prev = since.current
    const start = prev && prev.key === key ? prev : { key, at: Date.now() }
    since.current = start
    setUntil(start.at + ms)
    const left = ms - (Date.now() - start.at)
    const t = setTimeout(() => setElapsed(true), Math.max(0, left))
    return () => clearTimeout(t)
  }, [key, active, ms])
  return { elapsed: active && elapsed, until: active ? until : null }
}

function RejoinForm({ onJoin }: { onJoin: (name: string) => Promise<{ ok: boolean; error?: string }> }) {
  const [name, setName] = useState('')
  useEffect(() => setName(loadName()), [])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="stack"
      style={{ marginBottom: 16 }}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim()) return setError('Enter the name you were playing as')
        setBusy(true)
        const r = await onJoin(name.trim())
        if (!r.ok) setError(r.error ?? 'Could not rejoin')
        setBusy(false)
      }}
    >
      <p className="sub" style={{ margin: 0 }}>
        Were you playing and lost your tab? Enter the same name to take your seat back.
      </p>
      <div className="row">
        <input
          className="input"
          placeholder="Your name"
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn" type="submit" disabled={busy}>
          Rejoin
        </button>
      </div>
      <p className="error-text" role="alert" style={{ margin: 0 }}>
        {error}
      </p>
    </form>
  )
}
