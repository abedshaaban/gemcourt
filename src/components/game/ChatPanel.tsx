import { MessageCircle, X } from 'lucide-react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'
import type { LogEntry, PublicPlayer } from '../../game/types'
import { CHAT_MAX } from '../../lib/protocol'
import type { ChatMessage } from '../../lib/protocol'
import { GameLog } from './GameLog'
import { avatarColor, cx } from './ui'

/** What the board needs to show the room chat (members only; spectators get none). */
export interface ChatFeed {
  messages: ChatMessage[]
  onSend: (text: string) => Promise<{ ok: boolean; error?: string }>
}

const PHONE_MQ = '(max-width: 760px)' // keep in sync with the phone breakpoint in game.css
const STICK_PX = 48 // within this distance of the bottom, new messages keep the list scrolled down
// useLayoutEffect warns during SSR; the scroll position only matters in the browser anyway.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const update = () => setMatches(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [query])
  return matches
}

/** Number of others' messages that arrived while the chat wasn't visible. History present on first
 *  render counts as read, so reloading the page doesn't flag old messages. */
export function useChatUnread(messages: ChatMessage[], youId: string | null, visible: boolean): number {
  const lastId = messages.length ? messages[messages.length - 1].id : 0
  const [seenId, setSeenId] = useState<number | null>(null)
  useEffect(() => {
    // Ids restart if the server did; never let an old high-water mark hide new messages.
    if (seenId === null || visible || lastId < seenId) setSeenId(lastId)
  }, [lastId, visible, seenId])
  if (seenId === null || visible) return 0
  return messages.filter((m) => m.id > seenId && m.playerId !== youId).length
}

// One shared formatter: toLocaleTimeString() builds a new Intl formatter on every call.
let timeFormat: Intl.DateTimeFormat | null = null
const timeOf = (ts: number) => (timeFormat ??= new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' })).format(ts)

export function ChatPanel({
  messages,
  youId,
  players,
  colorIndex,
  onSend,
  header,
  className,
  autoFocus,
}: {
  messages: ChatMessage[]
  youId: string | null
  players: { id: string; name: string }[] // current names (players may rename in the lobby)
  colorIndex?: Record<string, number> // playerId -> stable avatar color index (join order)
  onSend: (text: string) => Promise<{ ok: boolean; error?: string }>
  header?: ReactNode
  className?: string
  autoFocus?: boolean
}): JSX.Element {
  const listRef = useRef<HTMLOListElement>(null)
  const stick = useRef(true)
  const sendingRef = useRef(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const lastId = messages.length ? messages[messages.length - 1].id : 0
  const lastMine = messages.length > 0 && messages[messages.length - 1].playerId === youId

  // Newest at the bottom: follow new messages unless the reader scrolled up (your own always scroll).
  useIsoLayoutEffect(() => {
    const el = listRef.current
    if (el && (stick.current || lastMine)) el.scrollTop = el.scrollHeight
  }, [lastId])

  useEffect(() => {
    if (!error) return
    const t = window.setTimeout(() => setError(''), 4000)
    return () => window.clearTimeout(t)
  }, [error])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || sendingRef.current) return
    sendingRef.current = true
    try {
      const r = await onSend(text)
      if (r.ok) {
        setDraft('')
        setError('')
      } else setError(r.error ?? 'Message not sent')
    } finally {
      sendingRef.current = false
    }
  }

  // Typing re-renders this panel on every keystroke; only rebuild the message list when its inputs change.
  const items = useMemo(() => {
    const nameOf = (m: ChatMessage) => players.find((p) => p.id === m.playerId)?.name ?? m.name
    const colorOf = (m: ChatMessage) => {
      const idx = colorIndex?.[m.playerId] ?? players.findIndex((p) => p.id === m.playerId)
      return idx >= 0 ? avatarColor(idx) : 'var(--text-faint)'
    }
    return messages.map((m) => {
      const mine = m.playerId === youId
      return (
        <li key={m.id} className={cx('sp-chat__item', mine && 'is-mine')} title={timeOf(m.ts)}>
          <span className="sp-chat__name" style={{ color: mine ? undefined : colorOf(m) }}>
            {mine ? 'You' : nameOf(m)}
          </span>
          {/* Plain text child: React escapes it, so messages can never inject markup. */}
          <span className="sp-chat__text">{m.text}</span>
        </li>
      )
    })
  }, [messages, youId, players, colorIndex])

  return (
    <section className={cx('sp-chat', className)} aria-label="Chat">
      {header ?? <h3 className="sp-section-title">Table talk</h3>}
      <ol
        className="sp-log__list sp-chat__list"
        ref={listRef}
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX
        }}
      >
        {messages.length === 0 && <li className="sp-log__empty">No messages yet. Say hello to the table…</li>}
        {items}
      </ol>
      <form className="sp-chat__form" onSubmit={submit}>
        <input
          className="input sp-chat__input"
          value={draft}
          maxLength={CHAT_MAX}
          placeholder="Message the table…"
          aria-label="Chat message"
          enterKeyHint="send"
          autoComplete="off"
          autoFocus={autoFocus}
          onChange={(e) => {
            setDraft(e.target.value)
            if (error) setError('')
          }}
        />
        <button type="submit" className="btn btn-sm btn-primary" disabled={!draft.trim()}>
          Send
        </button>
      </form>
      <p className="error-text sp-chat__error" role="alert">
        {error}
      </p>
    </section>
  )
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="sp-chat-badge" aria-label={`${count} unread`}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

/**
 * The sidebar's bottom section: the Chronicle (game log), plus the room chat for members.
 * Desktop: Chronicle / Chat tabs in the same slot, so the sidebar's height budget is unchanged.
 * Phone: the Chronicle stays in the page flow and the chat opens as a sheet from a floating button.
 */
export function SideFeed({
  log,
  players,
  colorIndex,
  youId,
  chat,
}: {
  log: LogEntry[]
  players: PublicPlayer[]
  colorIndex?: Record<string, number>
  youId: string | null
  chat?: ChatFeed
}): JSX.Element {
  const isPhone = useMediaQuery(PHONE_MQ)
  const [tab, setTab] = useState<'log' | 'chat'>('log')
  const [sheetOpen, setSheetOpen] = useState(false)
  const unread = useChatUnread(chat?.messages ?? [], youId, isPhone ? sheetOpen : tab === 'chat')

  useEffect(() => {
    if (!isPhone) setSheetOpen(false)
  }, [isPhone])

  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setSheetOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheetOpen])

  const showChat = !isPhone && tab === 'chat'
  // Memoized so the (memoized) GameLog isn't re-rendered just because this header was re-created.
  const tabs = useMemo(() => (
    <div className="sp-section-title sp-feed__tabs" role="tablist" aria-label="Chronicle and chat">
      <button type="button" role="tab" aria-selected={!showChat} className={cx('sp-feed__tab', !showChat && 'is-active')} onClick={() => setTab('log')}>
        Chronicle
      </button>
      <button type="button" role="tab" aria-selected={showChat} className={cx('sp-feed__tab', showChat && 'is-active')} onClick={() => setTab('chat')}>
        Chat
        <UnreadBadge count={unread} />
      </button>
    </div>
  ), [showChat, unread])

  if (!chat) return <GameLog log={log} players={players} colorIndex={colorIndex} />

  return (
    <>
      {showChat ? (
        <ChatPanel
          className="sp-log"
          header={tabs}
          messages={chat.messages}
          youId={youId}
          players={players}
          colorIndex={colorIndex}
          onSend={chat.onSend}
          autoFocus
        />
      ) : (
        <GameLog log={log} players={players} colorIndex={colorIndex} header={isPhone ? undefined : tabs} />
      )}

      {isPhone && (
        <>
          <button
            type="button"
            className={cx('sp-chat-fab', sheetOpen && 'is-open')}
            onClick={() => setSheetOpen((o) => !o)}
            aria-expanded={sheetOpen}
            aria-label={unread > 0 ? `Chat, ${unread} unread` : 'Chat'}
          >
            <MessageCircle size={22} aria-hidden="true" />
            <UnreadBadge count={unread} />
          </button>
          {sheetOpen && (
            <>
              <div className="sp-chat-scrim" onClick={() => setSheetOpen(false)} aria-hidden="true" />
              <div className="sp-chat-sheet" role="dialog" aria-label="Chat">
                <ChatPanel
                  header={
                    <header className="sp-chat-sheet__head">
                      <h3 className="sp-section-title">Table talk</h3>
                      <button type="button" className="sp-iconbtn sp-iconbtn--close" onClick={() => setSheetOpen(false)} aria-label="Close chat"><X size={16} aria-hidden="true" /></button>
                    </header>
                  }
                  messages={chat.messages}
                  youId={youId}
                  players={players}
                  colorIndex={colorIndex}
                  onSend={chat.onSend}
                />
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
