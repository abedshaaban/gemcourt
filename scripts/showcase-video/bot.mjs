// Minimal WebSocket player for driving Splendor rooms from Node.
import WebSocket from 'ws'

const GEMS = ['white', 'blue', 'green', 'red', 'black']

export class Bot {
  constructor(base, code, name) {
    this.base = base.replace(/^http/, 'ws')
    this.code = code
    this.name = name
    this.nextId = 1
    this.pending = new Map()
    this.view = null
    this.listeners = new Set()
  }
  connect(token) {
    return new Promise((resolve, reject) => {
      const qs = new URLSearchParams({ code: this.code })
      if (token) qs.set('token', token)
      this.ws = new WebSocket(`${this.base}/ws?${qs}`)
      this.ws.on('message', (data) => {
        const msg = JSON.parse(String(data))
        if (msg.type === 'view') {
          this.view = msg.view
          for (const l of this.listeners) l(msg.view)
          resolve()
        } else if (msg.type === 'result') {
          this.pending.get(msg.id)?.(msg.result)
          this.pending.delete(msg.id)
        } else if (msg.type === 'ping') this.ws.send(JSON.stringify({ type: 'pong' }))
      })
      this.ws.on('error', reject)
    })
  }
  send(op) {
    const id = this.nextId++
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      this.ws.send(JSON.stringify({ type: 'op', id, op }))
    })
  }
  async join() {
    const r = await this.send({ op: 'join', name: this.name })
    if (!r.ok) throw new Error(`join failed: ${r.error}`)
    this.token = r.token
    this.id = r.playerId
    return r
  }
  act(action) {
    return this.send({ op: 'action', token: this.token, action })
  }
  close() {
    this.ws?.close()
  }
}

function need(card, p) {
  // tokens still needed (after bonuses), and gold shortfall
  let short = 0
  const per = {}
  for (const c of GEMS) {
    const n = Math.max(0, card.cost[c] - p.bonuses[c])
    per[c] = n
    short += Math.max(0, n - p.tokens[c])
  }
  return { per, short }
}

/** Decide a reasonable action for player p in game g. */
export function decide(g, p, opts = {}) {
  if (g.phase === 'discard') {
    const extra = p.tokenCount - 10
    const tokens = {}
    const order = [...GEMS].sort((a, b) => p.tokens[b] - p.tokens[a])
    let left = extra
    for (const c of order) {
      while (left > 0 && p.tokens[c] - (tokens[c] ?? 0) > 0) {
        tokens[c] = (tokens[c] ?? 0) + 1
        left--
        if (p.tokens[c] - tokens[c] <= p.tokens[order[order.length - 1]]) break
      }
    }
    for (const c of order) while (left > 0 && p.tokens[c] - (tokens[c] ?? 0) > 0) { tokens[c] = (tokens[c] ?? 0) + 1; left-- }
    return { type: 'discard', tokens }
  }
  if (g.phase === 'chooseNoble') return { type: 'chooseNoble', nobleId: g.pendingNobleIds[0] }

  const market = []
  for (const tier of [1, 2, 3]) g.market[tier].forEach((card, index) => card && market.push({ card, tier, index }))
  const affordable = market.filter(({ card }) => need(card, p).short <= p.tokens.gold)
  for (const r of p.reserved) if (!r.hidden && need(r, p).short <= p.tokens.gold) affordable.push({ card: r, reserved: true })
  if (affordable.length && !opts.noBuy) {
    affordable.sort((a, b) => b.card.points - a.card.points || b.card.tier - a.card.tier)
    const pick = affordable[0]
    if (pick.card.points > 0 || p.cards.length < 6 || Math.random() < 0.7) {
      return { type: 'buy', source: pick.reserved ? { kind: 'reserved', cardId: pick.card.id } : { kind: 'market', tier: pick.tier, index: pick.index } }
    }
  }
  // target the card with best points per shortfall
  const scored = market
    .map((m) => ({ ...m, ...need(m.card, p) }))
    .sort((a, b) => (b.card.points + 1) / (b.short + 1) - (a.card.points + 1) / (a.short + 1))
  const target = scored[0]
  const avail = GEMS.filter((c) => g.bank[c] > 0)
  if (avail.length === 0 || (p.tokenCount >= 9 && p.reserved.length < 3 && Math.random() < 0.5)) {
    if (p.reserved.length < 3) return { type: 'reserve', source: { kind: 'market', tier: target.tier, index: target.index } }
  }
  const want = [...avail].sort((a, b) => (target?.per[b] ?? 0) - p.tokens[b] - ((target?.per[a] ?? 0) - p.tokens[a]) || g.bank[b] - g.bank[a])
  return { type: 'takeDifferent', colors: want.slice(0, Math.min(3, want.length)) }
}

export const cheapestNeed = need
