import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomView } from '~/lib/protocol'
import { CHAT_MAX } from '~/lib/protocol'
import { CHAT_BURST, CHAT_HISTORY, CHAT_WINDOW_MS, cleanChatText, createRoom, performOp, subscribe } from './rooms'

// ---------- helpers ----------

function setup(names = ['Alice', 'Bob']) {
  const code = createRoom()!
  const tokens = names.map((name) => {
    const r = performOp(code, { op: 'join', name })
    if (!r.ok || !r.token) throw new Error(`join failed for ${name}`)
    return r.token
  })
  return { code, tokens }
}

/** Latest view seen by a subscriber with this token (null token = not a member). */
function watch(code: string, token: string | null) {
  let last: RoomView | null = null
  const unsubscribe = subscribe(code, token, (v) => (last = v))
  return {
    get view(): RoomView {
      if (!last) throw new Error('no view received')
      return last
    },
    unsubscribe: unsubscribe!,
  }
}

const say = (code: string, token: string, text: unknown) => performOp(code, { op: 'chat', token, text })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

// ---------- text cleaning ----------

describe('cleanChatText', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanChatText('  hello \n\t world  ')).toBe('hello world')
  })
  it('rejects empty, whitespace-only and non-string input', () => {
    expect(cleanChatText('')).toBeNull()
    expect(cleanChatText('   \n ')).toBeNull()
    expect(cleanChatText(42)).toBeNull()
    expect(cleanChatText(undefined)).toBeNull()
  })
  it('strips control characters and bidi overrides', () => {
    expect(cleanChatText('a\u0000b‮c⁦d')).toBe('a b c d')
  })
  it('caps length by code point without splitting emoji', () => {
    const t = cleanChatText('💎'.repeat(CHAT_MAX + 20))!
    expect(t).toBe('💎'.repeat(CHAT_MAX))
  })
  it('keeps markup as literal text', () => {
    expect(cleanChatText('<b>hi</b>')).toBe('<b>hi</b>')
  })
})

// ---------- chat op ----------

describe('chat', () => {
  it('broadcasts a message to every member', () => {
    const { code, tokens } = setup()
    const a = watch(code, tokens[0])
    const b = watch(code, tokens[1])
    expect(say(code, tokens[0], '  good luck!  ')).toEqual({ ok: true })
    for (const w of [a, b]) {
      expect(w.view.chat).toHaveLength(1)
      expect(w.view.chat[0]).toMatchObject({ name: 'Alice', text: 'good luck!', playerId: a.view.youId })
      expect(w.view.chat[0].ts).toBe(Date.now())
    }
    a.unsubscribe()
    b.unsubscribe()
  })

  it('rejects non-members and empty messages', () => {
    const { code, tokens } = setup()
    expect(say(code, 'not-a-token', 'hi')).toEqual({ ok: false, error: 'You are not in this room' })
    expect(say(code, tokens[0], '   ').ok).toBe(false)
    expect(performOp(code, { op: 'chat', text: 'hi' }).ok).toBe(false)
    const w = watch(code, tokens[0])
    expect(w.view.chat).toEqual([])
    w.unsubscribe()
  })

  it('does not show chat to non-members', () => {
    const { code, tokens } = setup()
    say(code, tokens[0], 'secret plans')
    const spectator = watch(code, null)
    expect(spectator.view.youId).toBeNull()
    expect(spectator.view.chat).toEqual([])
    spectator.unsubscribe()
  })

  it('works during a game too', () => {
    const { code, tokens } = setup()
    const a = watch(code, tokens[0])
    const b = watch(code, tokens[1])
    expect(performOp(code, { op: 'start', token: tokens[0] })).toEqual({ ok: true })
    expect(say(code, tokens[1], 'your move')).toEqual({ ok: true })
    expect(a.view.status).toBe('playing')
    expect(a.view.chat.map((m) => m.text)).toEqual(['your move'])
    a.unsubscribe()
    b.unsubscribe()
  })

  it('rate limits each player separately', () => {
    const { code, tokens } = setup()
    for (let i = 0; i < CHAT_BURST; i++) expect(say(code, tokens[0], `msg ${i}`).ok).toBe(true)
    expect(say(code, tokens[0], 'one too many').ok).toBe(false)
    expect(say(code, tokens[1], 'I can still talk').ok).toBe(true)
    vi.advanceTimersByTime(CHAT_WINDOW_MS)
    expect(say(code, tokens[0], 'calm again').ok).toBe(true)
  })

  it('keeps only the most recent messages, with increasing ids', () => {
    const { code, tokens } = setup()
    const total = CHAT_HISTORY + 7
    for (let i = 0; i < total; i++) {
      expect(say(code, tokens[i % 2], `m${i}`).ok).toBe(true)
      vi.advanceTimersByTime(CHAT_WINDOW_MS) // stay under the rate limit
    }
    const w = watch(code, tokens[0])
    expect(w.view.chat).toHaveLength(CHAT_HISTORY)
    expect(w.view.chat[0].text).toBe(`m${total - CHAT_HISTORY}`)
    expect(w.view.chat.at(-1)!.text).toBe(`m${total - 1}`)
    const ids = w.view.chat.map((m) => m.id)
    expect(ids).toEqual([...ids].sort((x, y) => x - y))
    expect(new Set(ids).size).toBe(ids.length)
    w.unsubscribe()
  })
})
