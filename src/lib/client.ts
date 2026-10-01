import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameAction } from '~/game/types'
import type { ClientMessage, OpResult, RoomInfo, RoomOp, RoomView, ServerMessage } from './protocol'
import { PING_MS, WS_PATH } from './protocol'

// ---------- Session storage (per browser tab, so several tabs = several players) ----------

interface Session {
  token: string
  playerId: string
}

const sessionKey = (code: string) => `splendor:session:${code}`
const NAME_KEY = 'splendor:name'

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export function loadSession(code: string): Session | null {
  return safe(() => JSON.parse(sessionStorage.getItem(sessionKey(code)) ?? 'null'), null)
}
export function saveSession(code: string, s: Session) {
  safe(() => sessionStorage.setItem(sessionKey(code), JSON.stringify(s)), undefined)
}
export function clearSession(code: string) {
  safe(() => sessionStorage.removeItem(sessionKey(code)), undefined)
}
export function loadName(): string {
  return safe(() => localStorage.getItem(NAME_KEY) ?? '', '')
}
export function saveName(name: string) {
  safe(() => localStorage.setItem(NAME_KEY, name), undefined)
}

// ---------- HTTP ----------

async function errorOf(res: Response, fallback: string): Promise<string> {
  try {
    return (await res.json()).error ?? fallback
  } catch {
    return fallback
  }
}

export async function apiCreateRoom(): Promise<string> {
  const res = await fetch('/api/rooms', { method: 'POST' })
  if (!res.ok) throw new Error(await errorOf(res, 'Could not create a game. Is the server running?'))
  return (await res.json()).code
}

export async function apiRoomInfo(code: string): Promise<RoomInfo> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`)
  if (!res.ok) throw new Error(await errorOf(res, 'Could not reach the server'))
  return res.json()
}

/** Clipboard write that also works on plain-http LAN addresses (no async clipboard API there). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {}
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

// ---------- Live room socket ----------

export type ConnState = 'connecting' | 'open' | 'reconnecting' | 'missing'

const REQUEST_TIMEOUT_MS = 10_000 // never leave the UI stuck on a lost reply
const LOST: OpResult = { ok: false, error: 'Connection to server lost' }

function socketUrl(code: string, token: string | undefined): string {
  // wss:// behind the https tunnel, ws:// on the LAN; always the page's own origin.
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const qs = new URLSearchParams({ code })
  if (token) qs.set('token', token)
  return `${proto}//${location.host}${WS_PATH}?${qs}`
}

/** Reconnect delay: 0.5s, 1s, 2s… capped at 10s, with jitter so a room doesn't reconnect in lockstep. */
const backoff = (attempt: number) => Math.min(10_000, 500 * 2 ** attempt) * (0.75 + Math.random() * 0.5)

interface Pending {
  resolve: (r: OpResult) => void
  timer: ReturnType<typeof setTimeout>
}

export function useRoom(code: string) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<RoomView | null>(null)
  const [conn, setConn] = useState<ConnState>('connecting')
  const [connError, setConnError] = useState('')
  const [retry, setRetry] = useState(0)
  const [removed, setRemoved] = useState(false)
  const sessionRef = useRef<Session | null>(null)
  sessionRef.current = session
  const socketRef = useRef<WebSocket | null>(null)
  const pending = useRef(new Map<number, Pending>())
  const nextId = useRef(1)
  const attempts = useRef(0)

  // Session lives in sessionStorage, which only exists in the browser.
  useEffect(() => {
    setSession(loadSession(code))
    setReady(true)
  }, [code])

  // One socket per tab. It doesn't depend on `session`: after a join the server rebinds this socket
  // to the new seat, so joining costs no reconnect. A reconnect sends whatever token we hold then.
  useEffect(() => {
    if (!ready) return
    const ws = new WebSocket(socketUrl(code, sessionRef.current?.token))
    socketRef.current = ws
    setConn((c) => (c === 'open' || c === 'reconnecting' ? 'reconnecting' : 'connecting'))
    let gone = false // missing room: stay closed for good
    let done = false // this effect run has handed over (reconnect scheduled or cleanup)
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let lastMessage = Date.now()

    const failPending = () => {
      for (const p of pending.current.values()) {
        clearTimeout(p.timer)
        p.resolve(LOST)
      }
      pending.current.clear()
    }
    const reconnect = (delay: number) => {
      if (done || gone) return
      done = true
      failPending()
      setConn('reconnecting')
      retryTimer = setTimeout(() => setRetry((n) => n + 1), delay)
    }
    const drop = () => {
      // Detach first: closing a half-open socket can take a long time to report.
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
      try {
        ws.close()
      } catch {}
    }
    // Watchdog: a half-open socket (Wi-Fi blip, sleep) may never close, so reconnect after prolonged silence.
    const checkSilence = () => {
      if (done || gone) return
      if (ws.readyState === WebSocket.OPEN && Date.now() - lastMessage < PING_MS * 3) return
      if (ws.readyState === WebSocket.CONNECTING && Date.now() - lastMessage < REQUEST_TIMEOUT_MS) return
      drop()
      reconnect(0)
    }
    const watchdog = setInterval(checkSilence, 5000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkSilence()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', checkSilence)

    const send = (msg: ClientMessage) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg))
    ws.onopen = () => {
      lastMessage = Date.now()
    }
    ws.onmessage = (e) => {
      lastMessage = Date.now()
      let msg: ServerMessage
      try {
        msg = JSON.parse(e.data)
      } catch {
        return
      }
      switch (msg.type) {
        case 'view': {
          const v = msg.view
          attempts.current = 0
          setView(v)
          setConn('open')
          setConnError('')
          // Server no longer recognises us (kicked / left / server restarted): drop stale session.
          if (sessionRef.current && v.youId === null) {
            clearSession(code)
            setSession(null)
            setRemoved(true)
          }
          break
        }
        case 'result': {
          const p = pending.current.get(msg.id)
          if (!p) break
          pending.current.delete(msg.id)
          clearTimeout(p.timer)
          p.resolve(msg.result)
          break
        }
        case 'ping':
          send({ type: 'pong' })
          break
        case 'missing':
          gone = true
          clearSession(code)
          failPending()
          setConn('missing')
          break
        case 'error':
          setConnError(msg.error) // e.g. rate limited; the server closes and we retry with backoff
          break
      }
    }
    ws.onclose = () => reconnect(backoff(attempts.current++))
    ws.onerror = () => {} // 'close' follows

    return () => {
      done = true
      clearTimeout(retryTimer)
      clearInterval(watchdog)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', checkSilence)
      drop()
      failPending()
      if (socketRef.current === ws) socketRef.current = null
    }
  }, [code, ready, retry])

  /** Send an op over the socket and wait for its reply. */
  const request = useCallback((op: RoomOp): Promise<OpResult> => {
    const ws = socketRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.resolve({ ok: false, error: 'Not connected — reconnecting…' })
    const id = nextId.current++
    return new Promise<OpResult>((resolve) => {
      const timer = setTimeout(() => {
        pending.current.delete(id)
        resolve(LOST)
      }, REQUEST_TIMEOUT_MS)
      pending.current.set(id, { resolve, timer })
      ws.send(JSON.stringify({ type: 'op', id, op } satisfies ClientMessage))
    })
  }, [])

  const join = useCallback(
    async (name: string) => {
      const r = await request({ op: 'join', name, token: sessionRef.current?.token })
      if (r.ok && r.token && r.playerId) {
        const s = { token: r.token, playerId: r.playerId }
        saveSession(code, s)
        saveName(name)
        setRemoved(false)
        sessionRef.current = s // before any further view arrives, so it isn't mistaken for a removal
        setSession(s)
      }
      return r
    },
    [code, request],
  )

  const op = useCallback(
    async (fn: (token: string) => RoomOp): Promise<OpResult> => {
      const s = sessionRef.current
      if (!s) return { ok: false, error: 'Not joined' }
      return request(fn(s.token))
    },
    [request],
  )

  const leave = useCallback(async () => {
    const r = await op((token) => ({ op: 'leave', token }))
    if (r.ok) {
      clearSession(code)
      setSession(null)
    }
    return r
  }, [code, op])

  const act = useCallback((action: GameAction) => op((token) => ({ op: 'action', token, action })), [op])

  const clearRemoved = useCallback(() => setRemoved(false), [])

  return { ready, session, view, conn, connError, join, op, leave, act, removed, clearRemoved }
}
