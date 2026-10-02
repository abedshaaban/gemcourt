import { describe, expect, it } from 'vitest'
import { shareEqual } from './client'

describe('shareEqual', () => {
  it('returns the previous object when deep-equal', () => {
    const prev = { a: 1, list: [{ id: 1 }, { id: 2 }], nested: { x: 'y' } }
    const next = JSON.parse(JSON.stringify(prev))
    expect(shareEqual(prev, next)).toBe(prev)
  })

  it('keeps unchanged subtrees and replaces changed ones', () => {
    const prev = { version: 1, game: { log: [{ id: 1 }], bank: { white: 4 } }, chat: [{ id: 1, text: 'hi' }] }
    const next = { version: 2, game: { log: [{ id: 1 }], bank: { white: 3 } }, chat: [{ id: 1, text: 'hi' }] }
    const out = shareEqual(prev, next)
    expect(out).toEqual(next)
    expect(out).not.toBe(prev)
    expect(out.chat).toBe(prev.chat)
    expect(out.game.log).toBe(prev.game.log)
    expect(out.game.bank).not.toBe(prev.game.bank)
  })

  it('reuses common array items when an array grows or shrinks', () => {
    const prev = { log: [{ id: 1 }, { id: 2 }] }
    const grown = shareEqual(prev, { log: [{ id: 1 }, { id: 2 }, { id: 3 }] })
    expect(grown.log).toHaveLength(3)
    expect(grown.log).not.toBe(prev.log)
    expect(grown.log[0]).toBe(prev.log[0])
    const shrunk = shareEqual(prev, { log: [{ id: 1 }] })
    expect(shrunk.log).toEqual([{ id: 1 }])
    expect(shrunk.log[0]).toBe(prev.log[0])
  })

  it('handles added/removed keys, nulls and type changes', () => {
    expect(shareEqual({ a: 1 }, { a: 1, b: 2 })).toEqual({ a: 1, b: 2 })
    expect(shareEqual({ a: 1, b: 2 }, { a: 1 })).toEqual({ a: 1 })
    expect(shareEqual({ a: undefined }, { b: undefined })).toEqual({ b: undefined })
    expect(shareEqual({ game: { x: 1 } }, { game: null })).toEqual({ game: null })
    expect(shareEqual([1, 2], { 0: 1, 1: 2 })).toEqual({ 0: 1, 1: 2 })
    expect(shareEqual(null, { a: 1 })).toEqual({ a: 1 })
  })
})
