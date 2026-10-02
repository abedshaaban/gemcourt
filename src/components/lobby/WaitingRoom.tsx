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
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const [confirmKick, setConfirmKick] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(copiedTimer.current), [])

  useEffect(() => {
    apiRoomInfo(view.code)
      .then((i) => {
        setLanUrls(i.lanUrls)
        setPublicUrl(i.publicUrl ?? null)
      })
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

  // Prefer an address that works from anywhere: the page's own origin when it was opened through the
  // tunnel, else the tunnel's public URL, else the LAN address. The LAN link stays as an alternative.
  const origin = typeof location !== 'undefined' ? location.origin : ''
  const viaTunnel = typeof location !== 'undefined' && location.protocol === 'https:' && !isLocalHost(location.hostname)
  const inviteBase = viaTunnel ? origin : (publicUrl ?? lanUrls[0] ?? origin)
  const inviteUrl = `${inviteBase}/room/${view.code}`
  const lanInvite = lanUrls[0] && lanUrls[0] !== inviteBase ? `${lanUrls[0]}/room/${view.code}` : null

  // QR of the invite link for phones at the table. Client-only (lazy import, after mount) so SSR
  // never renders it; skipped for localhost links, which another device couldn't open anyway.
  const [qrSrc, setQrSrc] = useState<string | null>(null)
  useEffect(() => {
    if (isLocalHost(new URL(inviteUrl, location.href).hostname)) return setQrSrc(null)
    let cancelled = false
    import('qrcode')
      .then((QR) => QR.toString(inviteUrl, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' }))
      .then((svg) => !cancelled && setQrSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [inviteUrl])

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
        <div className="row room-code__actions">
          <button className="btn btn-sm" onClick={() => copy(view.code, 'code')}>
            {copied === 'code' ? 'Copied!' : 'Copy code'}
          </button>
          <button className="btn btn-sm" onClick={() => copy(inviteUrl, 'link')}>
            {copied === 'link' ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </div>
      {(lanUrls.length > 0 || publicUrl || qrSrc) && (
        <div className="share">
          {qrSrc && <img className="share-qr" src={qrSrc} width={112} height={112} alt={`QR code for ${inviteUrl}`} />}
          <p className="share-hint">
            {qrSrc ? 'Scan with a phone, or open ' : 'Friends on your network can open '}
            <code>{inviteUrl}</code>
            {lanInvite && (
              <>
                {' '}
                · on the same Wi-Fi: <code>{lanInvite}</code>
              </>
            )}
            {copied === 'failed' && <span className="error-text"> — copy blocked by the browser, select it manually.</span>}
          </p>
        </div>
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
            {isHost && p.id !== view.youId && confirmKick === p.id ? (
              <span className="row confirm-inline" role="group" aria-label={`Remove ${p.name}?`}>
                <span className="muted">Remove?</span>
                <button
                  className="btn btn-sm btn-danger"
                  disabled={busy}
                  autoFocus
                  onClick={async () => {
                    await run((token) => ({ op: 'kick', token, playerId: p.id }))
                    setConfirmKick(null)
                  }}
                >
                  Yes
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setConfirmKick(null)}>
                  No
                </button>
              </span>
            ) : (
              isHost &&
              p.id !== view.youId && (
                <button
                  className="btn btn-sm btn-ghost"
                  disabled={busy}
                  aria-label={`Remove ${p.name}`}
                  onClick={() => setConfirmKick(p.id)}
                >
                  Remove
                </button>
              )
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
        {confirmLeave ? (
          <span className="row confirm-inline" role="group" aria-label="Leave the room?">
            <span className="muted">{me?.isHost && view.players.length > 1 ? 'Leave? Hosting passes to another player.' : 'Leave the room?'}</span>
            <button className="btn btn-sm btn-danger" autoFocus onClick={onLeave} disabled={busy}>
              Leave
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setConfirmLeave(false)}>
              Stay
            </button>
          </span>
        ) : (
          <button
            className="btn btn-ghost"
            // Alone in the room there is nothing to lose, so skip the confirmation.
            onClick={() => (isHost || view.players.length > 1 ? setConfirmLeave(true) : onLeave())}
            disabled={busy}
          >
            Leave
          </button>
        )}
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
      <div className="sp-length" aria-label="Game length">
        <span className="muted">Game length</span>
        <div className="sp-length__choices" role="group" aria-label="Choose winning score">
          {([12, 15, 18] as const).map((points) => (
            <button key={points} type="button" className={`btn btn-sm${view.winningPoints === points ? ' btn-primary' : ' btn-ghost'}`}
              aria-pressed={view.winningPoints === points} disabled={!isHost || busy}
              onClick={() => void run((token) => ({ op: 'setWinningPoints', token, points }))}>
              {points === 12 ? 'Quick · 12' : points === 18 ? 'Long · 18' : 'Classic · 15'}
            </button>
          ))}
        </div>
        {!isHost && <span className="muted">Host chose {view.winningPoints} points</span>}
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

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}
