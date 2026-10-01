import { useEffect, useRef, useState } from 'react'
import { MAX_PLAYERS, MIN_PLAYERS } from '~/game/types'
import { NAME_MAX } from '~/lib/protocol'
import type { OpResult, RoomOp, RoomView } from '~/lib/protocol'
import { apiRoomInfo, copyText, saveName } from '~/lib/client'
import { avatarColor, initial } from './common'

interface Props {
  view: RoomView
  op: (fn: (token: string) => RoomOp) => Promise<OpResult>
  canHost: boolean // you are host, or the host is offline and you may take over
  onLeave: () => void
}

export function WaitingRoom({ view, op, canHost, onLeave }: Props) {
  const me = view.players.find((p) => p.id === view.youId)
  const isHost = canHost
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState(me?.name ?? '')
  const [copied, setCopied] = useState<'code' | 'link' | 'failed' | null>(null)
  const [lanUrls, setLanUrls] = useState<string[]>([])
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(copiedTimer.current), [])

  useEffect(() => {
    apiRoomInfo(view.code)
      .then((i) => setLanUrls(i.lanUrls))
      .catch(() => {})
  }, [view.code])

  async function run(fn: (token: string) => RoomOp) {
    setBusy(true)
    setError('')
    const r = await op(fn)
    if (!r.ok) setError(r.error)
    setBusy(false)
    return r
  }

  async function saveRename(e: React.FormEvent) {
    e.preventDefault()
    const r = await run((token) => ({ op: 'rename', token, name: nameDraft }))
    if (r.ok) {
      saveName(nameDraft.trim())
      setEditing(false)
    }
  }

  const inviteUrl = `${lanUrls[0] ?? (typeof location !== 'undefined' ? location.origin : '')}/room/${view.code}`

  async function copy(text: string, what: 'code' | 'link') {
    const ok = await copyText(text)
    setCopied(ok ? what : 'failed')
    clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopied(null), 1600)
  }

  const offline = view.players.filter((p) => !p.connected)
  const canStart = view.players.length >= MIN_PLAYERS && view.players.length <= MAX_PLAYERS && offline.length === 0
  const host = view.players.find((p) => p.isHost)
  const emptySeats = Math.max(0, MAX_PLAYERS - view.players.length)

  return (
    <section className="panel panel-wide">
      <div className="room-code">
        <div>
          <div className="label">Game code</div>
          <div className="code">{view.code}</div>
        </div>
        <div className="row">
          <button className="btn btn-sm" onClick={() => copy(view.code, 'code')}>
            {copied === 'code' ? 'Copied!' : 'Copy code'}
          </button>
          <button className="btn btn-sm" onClick={() => copy(inviteUrl, 'link')}>
            {copied === 'link' ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </div>
      {lanUrls.length > 0 && (
        <p className="share-hint">
          Friends on your network can open <code>{inviteUrl}</code>
          {copied === 'failed' && <span className="error-text"> — copy blocked by the browser, select it manually.</span>}
        </p>
      )}

      <h2>Waiting room</h2>
      <p className="sub">
        {view.players.length}/{MAX_PLAYERS} seated · need at least {MIN_PLAYERS} to begin
      </p>

      <ul className="player-list">
        {view.players.map((p, i) => (
          <li key={p.id}>
            <span className="avatar" style={{ background: avatarColor(i) }}>
              {initial(p.name)}
            </span>
            {p.id === view.youId && editing ? (
              <form className="row" style={{ flex: 1 }} onSubmit={saveRename}>
                <input
                  className="input"
                  style={{ padding: '6px 10px' }}
                  autoFocus
                  value={nameDraft}
                  maxLength={NAME_MAX}
                  onChange={(e) => setNameDraft(e.target.value)}
                />
                <button className="btn btn-sm btn-primary" type="submit" disabled={busy}>
                  Save
                </button>
                <button className="btn btn-sm btn-ghost" type="button" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </form>
            ) : (
              <span className="name">{p.name}</span>
            )}
            {p.isHost && <span className="badge badge-accent">Host</span>}
            {p.id === view.youId && !editing && (
              <>
                <span className="badge">You</span>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    setNameDraft(p.name)
                    setEditing(true)
                  }}
                >
                  Rename
                </button>
              </>
            )}
            {isHost && p.id !== view.youId && (
              <button
                className="btn btn-sm btn-ghost"
                disabled={busy}
                aria-label={`Remove ${p.name}`}
                onClick={() => run((token) => ({ op: 'kick', token, playerId: p.id }))}
              >
                Remove
              </button>
            )}
            <span className={`status-dot${p.connected ? '' : ' off'}`} title={p.connected ? 'Online' : 'Offline'} />
          </li>
        ))}
        {Array.from({ length: emptySeats }, (_, i) => (
          <li key={`empty-${i}`} className="empty">
            Empty seat
          </li>
        ))}
      </ul>

      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" onClick={onLeave} disabled={busy}>
          Leave
        </button>
        {isHost ? (
          <button
            className="btn btn-primary"
            disabled={!canStart || busy}
            onClick={() => run((token) => ({ op: 'start', token }))}
          >
            {canStart ? 'Start game' : offline.length ? `${offline[0].name} is offline…` : 'Waiting for players…'}
          </button>
        ) : (
          <span className="muted">Waiting for {host?.name ?? 'the host'} to start…</span>
        )}
      </div>
      {isHost && offline.length > 0 && (
        <p className="muted" role="status" style={{ fontSize: 13, margin: '10px 0 0' }}>
          Can't start while {offline.map((p) => (p.isHost ? `${p.name} (previous host)` : p.name)).join(', ')}{' '}
          {offline.length === 1 ? 'is' : 'are'} offline. Wait for them to reconnect, or remove them to start without them.
        </p>
      )}
      <p className="error-text" role="alert">
        {error}
      </p>
    </section>
  )
}
