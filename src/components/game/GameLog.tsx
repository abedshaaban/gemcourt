import { useEffect, useRef } from 'react'
import type { LogEntry, PublicPlayer } from '../../game/types'
import { avatarColor } from './ui'

export function GameLog({ log, players }: { log: LogEntry[]; players: PublicPlayer[] }) {
  const listRef = useRef<HTMLOListElement>(null)
  const lastId = log.length ? log[log.length - 1].id : -1

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lastId])

  return (
    <section className="sp-log" aria-label="Game log">
      <h3 className="sp-section-title">Chronicle</h3>
      <ol className="sp-log__list" ref={listRef} aria-live="polite">
        {log.length === 0 && <li className="sp-log__empty">The game begins…</li>}
        {log.map((entry) => {
          const idx = entry.playerId ? players.findIndex((p) => p.id === entry.playerId) : -1
          return (
            <li key={entry.id} className="sp-log__item">
              <span
                className="sp-log__mark"
                style={{ background: idx >= 0 ? avatarColor(idx) : 'var(--accent)' }}
                aria-hidden="true"
              />
              <span>{entry.message}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
