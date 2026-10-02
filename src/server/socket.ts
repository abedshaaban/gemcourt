import type { IncomingMessage } from 'node:http'
import type { RawData, WebSocket } from 'ws'
import { PING_MS, WS_POLICY_VIOLATION, normalizeCode } from '~/lib/protocol'
import type { ClientMessage, OpResult, ServerMessage } from '~/lib/protocol'
import {
  MAX_CONNECTIONS_PER_IP,
  TOO_MANY,
  TokenBucket,
  WS_DROP_BUDGET,
  WS_DROP_REFILL_PER_SECOND,
  WS_MESSAGES_PER_SECOND,
  WS_MESSAGE_BURST,
  limits,
  upgradeAddress,
} from './limits'
import { performOp, subscribe } from './rooms'
import { registerWsHandler } from './runtime'

/** A client that stopped reading (sleeping laptop) is dropped rather than buffered forever. */
const MAX_BUFFERED_BYTES = 1024 * 1024

function parse(data: RawData): ClientMessage | null {
  try {
    const msg = JSON.parse(data.toString())
    return msg && typeof msg === 'object' && typeof msg.type === 'string' ? msg : null
  } catch {
    return null
  }
}

/**
 * One socket per tab, bound to the room in its URL (`/ws?code=…&token=…`). It receives the room
 * view on every change and carries every op; replies are matched to requests by id.
 */
function connect(ws: WebSocket, req: IncomingMessage) {
  const addr = upgradeAddress(req)
  const params = new URL(req.url ?? '/', 'http://localhost').searchParams
  const code = normalizeCode(params.get('code') ?? '')
  let token = params.get('token') || null

  limits.connections.inc(addr.ip)
  let open = true
  let unsubscribe: (() => void) | null = null
  let alive = true
  let ping: ReturnType<typeof setInterval> | undefined

  const send = (msg: ServerMessage) => {
    if (!open || ws.readyState !== ws.OPEN) return
    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) return ws.terminate()
    ws.send(JSON.stringify(msg))
  }
  const refuse = (msg: ServerMessage, closeCode: number) => {
    send(msg)
    ws.close(closeCode)
  }
  const bind = () => {
    unsubscribe = subscribe(
      code,
      token,
      (view) => send({ type: 'view', view }),
      () => refuse({ type: 'missing' }, 1000), // the room was cleaned up while we watched
    )
    return !!unsubscribe
  }

  ws.on('error', () => {}) // e.g. an oversized frame; 'close' follows and does the cleanup
  ws.on('close', () => {
    open = false
    clearInterval(ping)
    unsubscribe?.()
    unsubscribe = null
    limits.connections.dec(addr.ip)
  })

  // Guessing codes: an exhausted budget blocks every lookup, so "exists" can't be told from "limited".
  if (!addr.local && !limits.join.allowed(addr.ip)) return refuse({ type: 'error', error: TOO_MANY }, WS_POLICY_VIOLATION)
  if (!bind()) {
    if (!addr.local) limits.join.take(addr.ip)
    return refuse({ type: 'missing' }, 1000)
  }

  // Half-open sockets (phone left the Wi-Fi) never close by themselves: browsers answer protocol
  // pings even in background tabs, so one silent interval means the peer is gone. The JSON ping is
  // for the client's own watchdog, which can't see protocol pings.
  ws.on('pong', () => (alive = true))
  ping = setInterval(() => {
    if (!alive) return ws.terminate()
    alive = false
    ws.ping()
    send({ type: 'ping' })
  }, PING_MS)

  const bucket = new TokenBucket(WS_MESSAGE_BURST, WS_MESSAGES_PER_SECOND)
  const dropBudget = new TokenBucket(WS_DROP_BUDGET, WS_DROP_REFILL_PER_SECOND)
  const reply = (id: number, result: OpResult) => send({ type: 'result', id, result })

  ws.on('message', (data) => {
    alive = true
    if (!bucket.take()) {
      // Over the rate: drop it (with a polite answer); flooding for several seconds closes the socket.
      if (!dropBudget.take()) return ws.close(WS_POLICY_VIOLATION, 'Too many messages')
      const msg = parse(data)
      if (msg?.type === 'op' && typeof msg.id === 'number') reply(msg.id, { ok: false, error: 'Too many requests, slow down' })
      return
    }
    const msg = parse(data)
    if (!msg || msg.type !== 'op' || typeof msg.id !== 'number') return // pongs, or junk
    const op = msg.op
    if (op?.op === 'join') {
      if (!addr.local && !limits.join.take(addr.ip)) return reply(msg.id, { ok: false, error: TOO_MANY })
      const result = performOp(code, op)
      // Joined (or reclaimed a seat): rebind this socket to the member so presence and views follow.
      if (result.ok && result.token && result.token !== token) {
        unsubscribe?.()
        token = result.token
        if (!bind()) return refuse({ type: 'missing' }, 1000)
      }
      return reply(msg.id, result)
    }
    reply(msg.id, performOp(code, op))
  })
}

function refuse(req: IncomingMessage): string | null {
  const addr = upgradeAddress(req)
  if (!addr.local && limits.connections.get(addr.ip) >= MAX_CONNECTIONS_PER_IP) return 'Too many connections'
  return null
}

registerWsHandler({ refuse, connect })
