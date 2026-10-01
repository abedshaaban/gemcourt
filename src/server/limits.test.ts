import { describe, expect, it } from 'vitest'
import { Counter, SlidingWindowLimiter, TokenBucket, clientAddress } from './limits'

function clock(start = 1_000_000) {
  let t = start
  const now = () => t
  now.advance = (ms: number) => (t += ms)
  return now
}

describe('SlidingWindowLimiter', () => {
  it('allows up to the limit per window, per key', () => {
    const now = clock()
    const l = new SlidingWindowLimiter(3, 1000, now)
    expect([l.take('a'), l.take('a'), l.take('a'), l.take('a')]).toEqual([true, true, true, false])
    expect(l.take('b')).toBe(true)
    expect(l.allowed('a')).toBe(false)
    expect(l.allowed('b')).toBe(true)
  })

  it('frees hits as they slide out of the window', () => {
    const now = clock()
    const l = new SlidingWindowLimiter(2, 1000, now)
    l.take('a')
    now.advance(600)
    l.take('a')
    expect(l.take('a')).toBe(false)
    now.advance(500) // first hit is now 1100ms old
    expect(l.take('a')).toBe(true)
    expect(l.take('a')).toBe(false)
  })

  it('does not count refused hits', () => {
    const now = clock()
    const l = new SlidingWindowLimiter(1, 1000, now)
    l.take('a')
    for (let i = 0; i < 10; i++) l.take('a')
    now.advance(1001)
    expect(l.take('a')).toBe(true)
  })

  it('prunes idle keys and never grows past maxKeys', () => {
    const now = clock()
    const l = new SlidingWindowLimiter(5, 1000, now, 100)
    for (let i = 0; i < 1000; i++) l.take(`ip-${i}`)
    expect(l.size).toBeLessThanOrEqual(100)
    now.advance(2000)
    l.prune()
    expect(l.size).toBe(0)
  })

  it('allowed() has no side effects on the count', () => {
    const l = new SlidingWindowLimiter(1, 1000, clock())
    for (let i = 0; i < 5; i++) expect(l.allowed('a')).toBe(true)
    expect(l.take('a')).toBe(true)
  })
})

describe('TokenBucket', () => {
  it('allows a burst, then refills at the given rate', () => {
    const now = clock()
    const b = new TokenBucket(3, 2, now)
    expect([b.take(), b.take(), b.take(), b.take()]).toEqual([true, true, true, false])
    now.advance(500) // +1 token
    expect(b.take()).toBe(true)
    expect(b.take()).toBe(false)
    now.advance(60_000) // never above capacity
    expect([b.take(), b.take(), b.take(), b.take()]).toEqual([true, true, true, false])
  })
})

describe('Counter', () => {
  it('counts per key and forgets keys at zero', () => {
    const c = new Counter()
    c.inc('a')
    c.inc('a')
    c.inc('b')
    expect(c.get('a')).toBe(2)
    c.dec('a')
    c.dec('a')
    c.dec('b')
    expect(c.get('a')).toBe(0)
    expect(c.size).toBe(0)
  })
})

describe('clientAddress', () => {
  it('uses CF-Connecting-IP only from a loopback peer (the local cloudflared)', () => {
    expect(clientAddress('127.0.0.1', '203.0.113.7')).toEqual({ ip: '203.0.113.7', local: false })
    expect(clientAddress('::1', ['203.0.113.7'])).toEqual({ ip: '203.0.113.7', local: false })
    expect(clientAddress('192.168.1.20', '203.0.113.7')).toEqual({ ip: '192.168.1.20', local: false })
  })

  it('treats direct loopback traffic as local and unwraps IPv4-mapped addresses', () => {
    expect(clientAddress('127.0.0.1', undefined)).toEqual({ ip: '127.0.0.1', local: true })
    expect(clientAddress('::ffff:127.0.0.1', '')).toEqual({ ip: '127.0.0.1', local: true })
    expect(clientAddress('::ffff:192.168.1.5', null)).toEqual({ ip: '192.168.1.5', local: false })
    expect(clientAddress(undefined, undefined)).toEqual({ ip: 'unknown', local: false })
  })
})
