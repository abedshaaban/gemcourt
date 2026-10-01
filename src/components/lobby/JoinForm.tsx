import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { MAX_PLAYERS } from '~/game/types'
import { NAME_MAX } from '~/lib/protocol'
import type { OpResult, RoomView } from '~/lib/protocol'
import { loadName } from '~/lib/client'

export function JoinForm({ view, onJoin }: { view: RoomView; onJoin: (name: string) => Promise<OpResult> }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => setName(loadName()), [])

  // A full table still accepts an offline player's name (they reclaim their seat).
  const full = view.players.length >= MAX_PLAYERS && view.players.every((p) => p.connected)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Please enter a name')
    setBusy(true)
    setError('')
    const r = await onJoin(name.trim())
    if (!r.ok) setError(r.error)
    setBusy(false)
  }

  return (
    <section className="panel">
      <div className="room-code">
        <div>
          <div className="label">Game code</div>
          <div className="code">{view.code}</div>
        </div>
        <span className="badge">
          {view.players.length}/{MAX_PLAYERS} players
        </span>
      </div>
      {full ? (
        <>
          <h2>Table is full</h2>
          <p className="sub">This game already has {MAX_PLAYERS} players.</p>
          <Link to="/" className="btn">
            Back home
          </Link>
        </>
      ) : (
        <>
          <h2>Take a seat</h2>
          <p className="sub">Choose the name other merchants will see.</p>
          <form className="stack" onSubmit={submit}>
            <div className="field">
              <input
                className="input"
                placeholder="Your name"
                aria-label="Your name"
                aria-describedby="name-count"
                autoFocus
                value={name}
                maxLength={NAME_MAX}
                onChange={(e) => {
                  setName(e.target.value)
                  setError('')
                }}
              />
              <span id="name-count" className={`field-count${name.length >= NAME_MAX ? ' is-max' : ''}`}>
                {name.length >= NAME_MAX ? 'Max length · ' : ''}
                {name.length}/{NAME_MAX}
              </span>
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Joining…' : 'Join waiting room'}
            </button>
          </form>
          <p className="error-text" role="alert">
            {error}
          </p>
          {view.players.length > 0 && (
            <p className="muted" style={{ fontSize: 14, margin: 0 }}>
              Already seated: {view.players.map((p) => p.name).join(', ')}
            </p>
          )}
        </>
      )}
    </section>
  )
}
