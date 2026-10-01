import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameAction } from '~/game/types'
import type { OpResult, RoomInfo, RoomOp, RoomView } from './protocol'
import { HEARTBEAT_MS } from './protocol'

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

export async function apiCreateRoom(): Promise<string> {
  const res = await fetch('/api/rooms', { method: 'POST' })
  if (!res.ok) throw new Error('Could not create room')
  return (await res.json()).code
}

export async function apiRoomInfo(code: string): Promise<RoomInfo> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`)
  return res.json()
}

function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) return AbortSignal.timeout(ms)
  if (typeof AbortController === 'undefined') return undefined // very old browsers: no timeout
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort(), ms)
  return ctrl.signal
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

export async function apiOp(code: string, op: RoomOp): Promise<OpResult> {
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(op),
      signal: timeoutSignal(10_000), // never leave the UI stuck on a hung request
    })
    return await res.json()
  } catch {
    return { ok: false, error: 'Connection to server lost' }
  }
}

// ---------- Live room subscription ----------

export type ConnState = 'connecting' | 'open' | 'reconnecting' | 'missing'

export function useRoom(code: string) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<RoomView | null>(null)
  const [conn, setConn] = useState<ConnState>('connecting')
  const [retry, setRetry] = useState(0)
  const [removed, setRemoved] = useState(false)
  const sessionRef = useRef<Session | null>(null)
  sessionRef.current = session

  // Session lives in sessionStorage, which only exists in the browser.
  useEffect(() => {
    setSession(loadSession(code))
    setReady(true)
  }, [code])

  useEffect(() => {
    if (!ready) return
    const qs = session ? `?token=${encodeURIComponent(session.token)}` : ''
    const es = new EventSource(`/api/rooms/${encodeURIComponent(code)}/events${qs}`)
    setConn('connecting')
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    es.onopen = () => setConn('open')
    es.onmessage = (e) => {
      const v: RoomView = JSON.parse(e.data)
      setView(v)
      setConn('open')
      // Server no longer recognises us (kicked / left / server restarted): drop stale session.
      if (session && v.youId === null) {
        clearSession(code)
        setSession(null)
        setRemoved(true)
      }
    }
    es.addEventListener('missing', () => {
      es.close()
      clearSession(code)
      setConn('missing')
    })
    es.onerror = () => {
      setConn((c) => (c === 'missing' ? c : 'reconnecting'))
      // The browser gives up for good on non-SSE responses (e.g. a 500): retry ourselves.
      if (es.readyState === EventSource.CLOSED) retryTimer = setTimeout(() => setRetry((n) => n + 1), 2000)
    }
    return () => {
      clearTimeout(retryTimer)
      es.close()
    }
  }, [code, ready, session, retry])

  // Heartbeat so the server notices a device that dropped off the network without closing the stream.
  useEffect(() => {
    if (!session) return
    const beat = () => void apiOp(code, { op: 'heartbeat', token: session.token })
    const timer = setInterval(beat, HEARTBEAT_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') beat()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [code, session])

  const join = useCallback(
    async (name: string) => {
      const r = await apiOp(code, { op: 'join', name, token: sessionRef.current?.token })
      if (r.ok && r.token && r.playerId) {
        const s = { token: r.token, playerId: r.playerId }
        saveSession(code, s)
        saveName(name)
        setRemoved(false)
        setSession(s)
      }
      return r
    },
    [code],
  )

  const op = useCallback(
    async (fn: (token: string) => RoomOp): Promise<OpResult> => {
      const s = sessionRef.current
      if (!s) return { ok: false, error: 'Not joined' }
      return apiOp(code, fn(s.token))
    },
    [code],
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

  return { ready, session, view, conn, join, op, leave, act, removed, clearRemoved }
}
