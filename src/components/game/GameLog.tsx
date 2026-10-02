import { memo, useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import type { LogEntry, PublicPlayer } from '../../game/types'
import { LogText } from './LogText'
import { avatarColor } from './ui'

/** Memoized: the log can be long, and the board re-renders on every click, tick and chat message. */
export const GameLog = memo(function GameLog({
  log,
  players,
  colorIndex,
  header,
}: {
  log: LogEntry[]
  players: PublicPlayer[]
  colorIndex?: Record<string, number> // playerId -> stable avatar color index (join order)
  header?: ReactNode // replaces the "Chronicle" title (e.g. Chronicle / Chat tabs)
}) {
  const listRef = useRef<HTMLOListElement>(null)
  const lastId = log.length ? log[log.length - 1].id : -1
  const nameKey = players.map((p) => p.name).join('\u0000')
  // Stable while names are unchanged, so each memoized LogText line can skip re-rendering.
  const names = useMemo(() => players.map((p) => p.name), [nameKey])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lastId])

  return (
    <section className="sp-log" aria-label="Game log">
      {header ?? <h3 className="sp-section-title">Chronicle</h3>}
      <ol className="sp-log__list" ref={listRef} aria-live="polite">
        {log.length === 0 && <li className="sp-log__empty">The game begins…</li>}
        {log.map((entry) => {
          const idx = entry.playerId
            ? (colorIndex?.[entry.playerId] ?? players.findIndex((p) => p.id === entry.playerId))
            : -1
          return (
            <li key={entry.id} className="sp-log__item">
              <span
                className="sp-log__mark"
                style={{ background: idx >= 0 ? avatarColor(idx) : 'var(--accent)' }}
                aria-hidden="true"
              />
              <span>
                <LogText message={entry.message} names={names} />
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
})
