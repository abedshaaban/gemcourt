import type { IncomingMessage } from 'node:http'

// In-memory abuse protection. Tiny on purpose: one process, a handful of players, no shared store.

export const TOO_MANY = 'Too many attempts, wait a moment'

type Clock = () => number

/** At most `limit` hits per `windowMs` per key. Keys with no recent hits are pruned as it goes. */
export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>()
  private calls = 0

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private now: Clock = Date.now,
    private maxKeys = 10_000,
  ) {}

  private recent(key: string, now: number): number[] {
    const list = this.hits.get(key)
    if (!list) return []
    const fresh = list.filter((t) => now - t < this.windowMs)
    if (fresh.length) this.hits.set(key, fresh)
    else this.hits.delete(key)
    return fresh
  }

  /** True if `key` could take a hit right now (no side effects beyond pruning). */
  allowed(key: string): boolean {
    return this.recent(key, this.now()).length < this.limit
  }

  /** Records a hit if allowed. Returns false (and records nothing) once the key is over its limit. */
  take(key: string): boolean {
    const now = this.now()
    if (++this.calls % 256 === 0 || this.hits.size >= this.maxKeys) this.prune(now)
    const fresh = this.recent(key, now)
    if (fresh.length >= this.limit) return false
    fresh.push(now)
    this.hits.set(key, fresh)
    return true
  }

  /** Drops keys whose hits all fell out of the window; past maxKeys, the oldest keys go too. */
  prune(now = this.now()) {
    for (const key of [...this.hits.keys()]) this.recent(key, now)
    for (const key of this.hits.keys()) {
      if (this.hits.size < this.maxKeys) break
      this.hits.delete(key) // Map order = insertion order, so these are the oldest keys
    }
  }

  get size(): number {
    return this.hits.size
  }
}

/** Classic token bucket: bursts up to `capacity`, refilled at `perSecond`. One per socket, so no map. */
export class TokenBucket {
  private tokens: number
  private last: number

  constructor(
    readonly capacity: number,
    readonly perSecond: number,
    private now: Clock = Date.now,
  ) {
    this.tokens = capacity
    this.last = now()
  }

  take(): boolean {
    const now = this.now()
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.perSecond)
    this.last = now
    if (this.tokens < 1) return false
    this.tokens--
    return true
  }
}

/** Live counts per key (open sockets per IP); a key is removed when it drops back to zero. */
export class Counter {
  private counts = new Map<string, number>()
  get(key: string): number {
    return this.counts.get(key) ?? 0
  }
  inc(key: string) {
    this.counts.set(key, this.get(key) + 1)
  }
  dec(key: string) {
    const n = this.get(key) - 1
    if (n > 0) this.counts.set(key, n)
    else this.counts.delete(key)
  }
  get size(): number {
    return this.counts.size
  }
}

// ---------- client addresses ----------

export interface ClientAddress {
  ip: string
  /** Same machine, not via the tunnel (the host's own tabs): exempt from per-IP limits. */
  local: boolean
}

export function isLoopback(address: string | undefined): boolean {
  return !!address && (address === '::1' || address.startsWith('127.') || address.startsWith('::ffff:127.'))
}

/**
 * Who is this? Tunnel traffic reaches us from cloudflared on localhost, with the real visitor in
 * CF-Connecting-IP. That header is only trusted from a loopback peer: anyone on the LAN could send it.
 */
export function clientAddress(remote: string | undefined, cfHeader: string | string[] | null | undefined): ClientAddress {
  const header = (Array.isArray(cfHeader) ? cfHeader[0] : cfHeader)?.trim()
  if (isLoopback(remote) && header) return { ip: header.slice(0, 64), local: false }
  const ip = remote?.startsWith('::ffff:') ? remote.slice(7) : (remote ?? 'unknown')
  return { ip, local: isLoopback(remote) }
}

export function upgradeAddress(req: IncomingMessage): ClientAddress {
  return clientAddress(req.socket.remoteAddress, req.headers['cf-connecting-ip'])
}

/** Address of a Web Request from the route handlers (srvx keeps the Node request on `runtime`). */
export function requestAddress(request: Request): ClientAddress {
  const r = request as Request & { ip?: string; runtime?: { node?: { req?: IncomingMessage } } }
  const remote = r.runtime?.node?.req?.socket?.remoteAddress ?? r.ip
  return clientAddress(remote, request.headers.get('cf-connecting-ip'))
}

// ---------- the server's limits ----------

export const MAX_CONNECTIONS_PER_IP = 20
/** Per socket: steady 30 messages/s with bursts of 30; past that messages are dropped. */
export const WS_MESSAGE_BURST = 30
export const WS_MESSAGES_PER_SECOND = 30
/** Dropped messages a socket may rack up (refilling 5/s) before it is closed for flooding. */
export const WS_DROP_BUDGET = 60
export const WS_DROP_REFILL_PER_SECOND = 5

interface Limits {
  create: SlidingWindowLimiter // new rooms: 10 per IP per 10 minutes
  join: SlidingWindowLimiter // joins and lookups of unknown codes: 20 per IP per minute (code guessing)
  connections: Counter // open sockets per IP
}

const KEY = Symbol.for('splendor.limits')
// On globalThis so the HTTP routes and the socket handler share one set, whatever module instance they use.
export const limits: Limits = ((globalThis as { [KEY]?: Limits })[KEY] ??= {
  create: new SlidingWindowLimiter(10, 10 * 60_000),
  join: new SlidingWindowLimiter(20, 60_000),
  connections: new Counter(),
})
