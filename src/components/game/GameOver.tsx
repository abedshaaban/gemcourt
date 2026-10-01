import { useEffect, useRef } from 'react'
import type { PublicGameState } from '../../game/types'
import { Avatar } from './PlayerPanels'
import { cx } from './ui'

export function GameOver({
  state,
  youId,
  isHost,
  onPlayAgain,
  onLeave,
  onViewBoard,
  colorIndex,
}: {
  colorIndex?: Record<string, number>
  state: PublicGameState
  youId: string | null
  isHost: boolean
  onPlayAgain: () => void
  onLeave: () => void
  onViewBoard: () => void
}) {
  const indexed = state.players.map((p, i) => ({ p, i }))
  const ranked = [...indexed].sort((a, b) => b.p.points - a.p.points || a.p.cards.length - b.p.cards.length)
  const winners = new Set(state.winnerIds)
  const winnerNames = state.players.filter((p) => winners.has(p.id)).map((p) => p.name)
  const youWon = youId !== null && winners.has(youId)
  // Only mention the tie-break when players tied on points and card count actually decided it.
  const best = Math.max(...state.players.map((p) => p.points))
  const tiedOnPoints = state.players.filter((p) => p.points === best).length
  const tieBroken = tiedOnPoints > 1 && winners.size > 0 && winners.size < tiedOnPoints

  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = rootRef.current
    ;(el?.querySelector<HTMLElement>('.sp-over__actions button') ?? el)?.focus()
  }, [])

  // dense ranking: ties share a place when points and card count match
  let place = 0
  let prev: { points: number; cards: number } | null = null
  const places = ranked.map(({ p }) => {
    if (!prev || prev.points !== p.points || prev.cards !== p.cards.length) place++
    prev = { points: p.points, cards: p.cards.length }
    return place
  })

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="sp-over"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sp-over-title"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        onViewBoard()
      }}
    >
      <div className="sp-over__card">
        <div className="sp-over__crown" aria-hidden="true">
          ♛
        </div>
        <h2 id="sp-over-title" className="sp-over__title">
          {youWon ? 'Victory' : 'The Game Is Done'}
        </h2>
        <p className="sp-over__sub">
          {winnerNames.length === 0
            ? 'The final round has ended.'
            : winnerNames.length === 1
              ? `${winnerNames[0]} is the most illustrious merchant of the Renaissance.`
              : `A shared triumph: ${winnerNames.join(' & ')}.`}
        </p>

        <ol className="sp-rank">
          {ranked.map(({ p, i }, k) => {
            const won = winners.has(p.id)
            return (
              <li key={p.id} className={cx('sp-rank__row', won && 'is-winner', p.id === youId && 'is-you')}>
                <span className="sp-rank__place">{won ? <span className="sp-rank__crown">♛</span> : places[k]}</span>
                <Avatar name={p.name} index={colorIndex?.[p.id] ?? i} size={34} />
                <span className="sp-rank__who">
                  <span className="sp-rank__name">
                    <span className="sp-ellipsis">{p.name}</span>
                    {p.id === youId && <span className="badge">You</span>}
                  </span>
                  {/* compact stats for phones, where the stat columns are hidden */}
                  <span className="sp-rank__sub">
                    {p.cards.length} card{p.cards.length === 1 ? '' : 's'} · {p.nobles.length} noble{p.nobles.length === 1 ? '' : 's'}
                  </span>
                </span>
                <span className="sp-rank__stat" title="Development cards">
                  <b>{p.cards.length}</b> cards
                </span>
                <span className="sp-rank__stat" title="Nobles">
                  <b>{p.nobles.length}</b> nobles
                </span>
                <span className="sp-rank__points">
                  {p.points}
                  <small>pts</small>
                </span>
              </li>
            )
          })}
        </ol>
        {tieBroken && (
          <p className="sp-over__tiebreak">Tied on points — the tie went to the fewest development cards.</p>
        )}

        <div className="sp-over__actions">
          {isHost ? (
            <button type="button" className="btn btn-primary" onClick={onPlayAgain}>
              Play again
            </button>
          ) : (
            <span className="sp-over__waiting">Waiting for the host…</span>
          )}
          <button type="button" className="btn" onClick={onViewBoard}>
            View board
          </button>
          <button type="button" className="btn btn-ghost" onClick={onLeave}>
            Leave
          </button>
        </div>
      </div>
    </div>
  )
}
