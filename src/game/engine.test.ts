import { describe, expect, it } from 'vitest'
import { ALL_CARDS } from './cards'
import { ALL_NOBLES } from './nobles'
import { applyAction, createGame, skipTurn, toPublicState } from './engine'
import { emptyGems, emptyTokens, tokenTotal } from './helpers'
import { GEM_COLORS, TIERS, isHiddenCard } from './types'
import type { ActionResult, Card, GameAction, GameState, GemColor, GemCounts, Noble, Tier, TokenCounts } from './types'

// ---------- test helpers ----------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NAMES = ['Alice', 'Bob', 'Carol', 'Dave']

function newGame(playerCount = 2, seed = 42): GameState {
  const players = NAMES.slice(0, playerCount).map((name) => ({ id: name.toLowerCase(), name }))
  return createGame(players, mulberry32(seed))
}

function mk(id: string, bonus: GemColor, points = 0, cost: Partial<GemCounts> = {}, tier: Tier = 1): Card {
  return { id, tier, bonus, points, cost: { ...emptyGems(), ...cost } }
}

function noble(id: string, req: Partial<GemCounts>): Noble {
  return { id, points: 3, requirement: { ...emptyGems(), ...req } }
}

function tokens(t: Partial<TokenCounts> = {}): TokenCounts {
  return { ...emptyTokens(), ...t }
}

function ok(r: ActionResult): GameState {
  if (!r.ok) throw new Error(`Expected ok, got error: ${r.error}`)
  return r.state
}

function err(r: ActionResult): string {
  if (r.ok) throw new Error('Expected an error, got ok')
  return r.error
}

function cardsOf(bonus: GemColor, n: number, prefix: string = bonus): Card[] {
  return Array.from({ length: n }, (_, i) => mk(`${prefix}-${i}`, bonus))
}

const act = (s: GameState, pid: string, a: GameAction) => applyAction(s, pid, a)
const take3: GameAction = { type: 'takeDifferent', colors: ['white', 'blue', 'red'] }

// ---------- data integrity ----------

describe('card data', () => {
  it('has the 90 official cards with 40/30/20 per tier and 8/6/4 per color', () => {
    expect(ALL_CARDS).toHaveLength(90)
    const expected: Record<Tier, number> = { 1: 8, 2: 6, 3: 4 }
    for (const tier of TIERS) {
      const tierCards = ALL_CARDS.filter((c) => c.tier === tier)
      expect(tierCards).toHaveLength(expected[tier] * 5)
      for (const color of GEM_COLORS) {
        expect(tierCards.filter((c) => c.bonus === color)).toHaveLength(expected[tier])
      }
    }
  })

  it('has unique, well-formed ids and complete costs', () => {
    expect(new Set(ALL_CARDS.map((c) => c.id)).size).toBe(90)
    for (const c of ALL_CARDS) {
      expect(c.id).toMatch(new RegExp(`^t${c.tier}-\\d{2}$`))
      expect(Object.keys(c.cost).sort()).toEqual([...GEM_COLORS].sort())
      for (const g of GEM_COLORS) expect(c.cost[g]).toBeGreaterThanOrEqual(0)
      expect(GEM_COLORS.reduce((s, g) => s + c.cost[g], 0)).toBeGreaterThan(0)
    }
  })

  it('has point ranges matching the base game', () => {
    const pts = (tier: Tier) => ALL_CARDS.filter((c) => c.tier === tier).map((c) => c.points)
    expect(pts(1).every((p) => p === 0 || p === 1)).toBe(true)
    expect(pts(1).filter((p) => p === 1)).toHaveLength(5)
    expect(pts(2).every((p) => p >= 1 && p <= 3)).toBe(true)
    expect(pts(3).every((p) => p >= 3 && p <= 5)).toBe(true)
    // total prestige in the deck: tier1 5, tier2 60, tier3 80
    expect(pts(1).reduce((a, b) => a + b, 0)).toBe(5)
    expect(pts(2).reduce((a, b) => a + b, 0)).toBe(55)
    expect(pts(3).reduce((a, b) => a + b, 0)).toBe(80)
  })

  it('spot-checks known cards', () => {
    // tier 3 black 4pt card costs 7 red
    expect(ALL_CARDS.some((c) => c.tier === 3 && c.bonus === 'black' && c.points === 4 && c.cost.red === 7)).toBe(true)
    // tier 1 blue 1pt card costs 4 red
    expect(ALL_CARDS.some((c) => c.tier === 1 && c.bonus === 'blue' && c.points === 1 && c.cost.red === 4)).toBe(true)
  })
})

describe('noble data', () => {
  it('has the 10 official nobles, each worth 3 points', () => {
    expect(ALL_NOBLES).toHaveLength(10)
    expect(new Set(ALL_NOBLES.map((n) => n.id)).size).toBe(10)
    for (const n of ALL_NOBLES) {
      expect(n.id).toMatch(/^n-\d{2}$/)
      expect(n.points).toBe(3)
      const nonZero = GEM_COLORS.map((c) => n.requirement[c]).filter((v) => v > 0).sort()
      expect([JSON.stringify([4, 4]), JSON.stringify([3, 3, 3])]).toContain(JSON.stringify(nonZero))
    }
    const reqs = ALL_NOBLES.map((n) => JSON.stringify(n.requirement))
    expect(new Set(reqs).size).toBe(10)
    expect(ALL_NOBLES.filter((n) => GEM_COLORS.some((c) => n.requirement[c] === 4))).toHaveLength(5)
  })
})

// ---------- setup ----------

describe('createGame', () => {
  it.each([
    [2, 4],
    [3, 5],
    [4, 7],
  ])('sets up a %i-player game with %i gems per pile', (n, perPile) => {
    const s = newGame(n)
    expect(s.players).toHaveLength(n)
    for (const c of GEM_COLORS) expect(s.bank[c]).toBe(perPile)
    expect(s.bank.gold).toBe(5)
    expect(s.nobles).toHaveLength(n + 1)
    for (const tier of TIERS) {
      expect(s.market[tier]).toHaveLength(4)
      expect(s.market[tier].every((c) => c !== null && c.tier === tier)).toBe(true)
      expect(s.decks[tier].every((c) => c.tier === tier)).toBe(true)
    }
    expect(s.decks[1]).toHaveLength(36)
    expect(s.decks[2]).toHaveLength(26)
    expect(s.decks[3]).toHaveLength(16)
    const allIds = TIERS.flatMap((t) => [...s.decks[t], ...s.market[t]].map((c) => c!.id))
    expect(new Set(allIds).size).toBe(90)
    expect(s.phase).toBe('action')
    expect(s.status).toBe('playing')
    expect(s.currentPlayerIndex).toBe(0)
    expect(s.turn).toBe(0)
    expect(s.finalRound).toBe(false)
    expect(s.winnerIds).toEqual([])
    expect(s.log).toHaveLength(1)
    expect(s.log[0].playerId).toBeNull()
    for (const p of s.players) {
      expect(tokenTotal(p.tokens)).toBe(0)
      expect(p.cards).toEqual([])
      expect(p.reserved).toEqual([])
      expect(p.nobles).toEqual([])
    }
  })

  it('keeps player order', () => {
    const s = newGame(4)
    expect(s.players.map((p) => p.name)).toEqual(NAMES)
  })

  it('is deterministic for a given rng and varies with the seed', () => {
    expect(newGame(3, 7)).toEqual(newGame(3, 7))
    expect(JSON.stringify(newGame(3, 7).decks)).not.toBe(JSON.stringify(newGame(3, 8).decks))
  })

  it('does not share card objects with ALL_CARDS', () => {
    const s = newGame()
    s.market[1][0]!.cost.white = 99
    expect(ALL_CARDS.some((c) => c.cost.white === 99)).toBe(false)
  })

  it('rejects invalid player counts and duplicate ids', () => {
    expect(() => createGame([{ id: 'a', name: 'A' }])).toThrow()
    expect(() => createGame(NAMES.concat('Eve').map((n) => ({ id: n, name: n })))).toThrow()
    expect(() =>
      createGame([
        { id: 'a', name: 'A' },
        { id: 'a', name: 'B' },
      ]),
    ).toThrow()
  })
})

// ---------- general validation ----------

describe('applyAction validation', () => {
  it('rejects actions from the wrong player or unknown players', () => {
    const s = newGame()
    expect(err(act(s, 'bob', take3))).toMatch(/not your turn/i)
    expect(err(act(s, 'mallory', take3))).toMatch(/not a player/i)
  })

  it('rejects unknown action types', () => {
    const s = newGame()
    expect(err(act(s, 'alice', { type: 'teleport' } as unknown as GameAction))).toMatch(/unknown/i)
  })

  it('rejects actions once the game is finished', () => {
    const s = newGame()
    s.status = 'finished'
    expect(err(act(s, 'alice', take3))).toMatch(/over/i)
  })

  it('never mutates the input state (success or failure)', () => {
    const s = newGame(3)
    s.players[0].tokens = tokens({ white: 3, blue: 3, green: 3 })
    s.players[0].reserved.push({ ...s.decks[1][0], blind: true })
    const snapshot = structuredClone(s)
    const actions: GameAction[] = [
      take3,
      { type: 'takeTwo', color: 'green' },
      { type: 'reserve', source: { kind: 'market', tier: 2, index: 1 } },
      { type: 'reserve', source: { kind: 'deck', tier: 3 } },
      { type: 'buy', source: { kind: 'market', tier: 1, index: 0 } },
      { type: 'buy', source: { kind: 'reserved', cardId: s.players[0].reserved[0].id } },
      { type: 'discard', tokens: { white: 1 } },
      { type: 'takeDifferent', colors: ['white', 'white', 'blue'] },
    ]
    for (const a of actions) act(s, 'alice', a)
    expect(s).toEqual(snapshot)
  })
})

// ---------- takeDifferent ----------

describe('takeDifferent', () => {
  it('takes 3 different gems and advances the turn', () => {
    const s = newGame()
    const n = ok(act(s, 'alice', { type: 'takeDifferent', colors: ['red', 'white', 'blue'] }))
    expect(n.players[0].tokens).toEqual(tokens({ white: 1, blue: 1, red: 1 }))
    expect(n.bank).toEqual(tokens({ white: 3, blue: 3, green: 4, red: 3, black: 4, gold: 5 }))
    expect(n.currentPlayerIndex).toBe(1)
    expect(n.turn).toBe(1)
    expect(n.log[n.log.length - 1]).toMatchObject({ playerId: 'alice', message: 'Alice took 1 diamond, 1 sapphire, 1 ruby' })
  })

  it('rejects duplicates, gold, invalid colors and wrong counts', () => {
    const s = newGame()
    const bad = (colors: unknown) => err(act(s, 'alice', { type: 'takeDifferent', colors } as GameAction))
    expect(bad(['white', 'white', 'blue'])).toMatch(/different/i)
    expect(bad(['white', 'blue', 'gold'])).toMatch(/invalid/i)
    expect(bad(['white', 'blue', 'purple'])).toMatch(/invalid/i)
    expect(bad(['white', 'blue'])).toMatch(/exactly 3/i)
    expect(bad(['white'])).toMatch(/exactly 3/i)
    expect(bad(['white', 'blue', 'green', 'red'])).toMatch(/exactly 3/i)
    expect(bad([])).toBeTruthy()
    expect(bad('white')).toBeTruthy()
  })

  it('rejects a color whose pile is empty', () => {
    const s = newGame()
    s.bank.white = 0
    expect(err(act(s, 'alice', { type: 'takeDifferent', colors: ['white', 'blue', 'red'] }))).toMatch(/no white/i)
    ok(act(s, 'alice', { type: 'takeDifferent', colors: ['green', 'blue', 'red'] }))
  })

  it('requires exactly as many colors as are available when fewer than 3', () => {
    const s = newGame()
    s.bank = tokens({ white: 2, blue: 1, gold: 5 })
    expect(err(act(s, 'alice', { type: 'takeDifferent', colors: ['white'] }))).toMatch(/exactly 2/i)
    const n = ok(act(s, 'alice', { type: 'takeDifferent', colors: ['white', 'blue'] }))
    expect(n.players[0].tokens).toEqual(tokens({ white: 1, blue: 1 }))

    s.bank = tokens({ black: 1 })
    ok(act(s, 'alice', { type: 'takeDifferent', colors: ['black'] }))
    expect(err(act(s, 'alice', { type: 'takeDifferent', colors: ['black', 'red'] }))).toMatch(/exactly 1/i)
  })

  it('rejects when no gems are available at all', () => {
    const s = newGame()
    s.bank = tokens({ gold: 5 })
    expect(err(act(s, 'alice', { type: 'takeDifferent', colors: ['black'] }))).toMatch(/no gem/i)
  })
})

// ---------- takeTwo ----------

describe('takeTwo', () => {
  it('takes 2 of a color when the pile has at least 4', () => {
    const s = newGame()
    const n = ok(act(s, 'alice', { type: 'takeTwo', color: 'green' }))
    expect(n.players[0].tokens.green).toBe(2)
    expect(n.bank.green).toBe(2)
    expect(n.log[n.log.length - 1].message).toBe('Alice took 2 emerald')
    expect(n.currentPlayerIndex).toBe(1)
  })

  it('rejects when the pile has fewer than 4, and rejects gold/invalid', () => {
    const s = newGame()
    s.bank.green = 3
    expect(err(act(s, 'alice', { type: 'takeTwo', color: 'green' }))).toMatch(/at least 4/i)
    expect(err(act(s, 'alice', { type: 'takeTwo', color: 'gold' } as unknown as GameAction))).toMatch(/invalid/i)
  })
})

// ---------- reserve ----------

describe('reserve', () => {
  it('reserves a market card, refills the slot, and grants 1 gold', () => {
    const s = newGame()
    const target = s.market[2][1]!
    const nextTop = s.decks[2][s.decks[2].length - 1]
    const n = ok(act(s, 'alice', { type: 'reserve', source: { kind: 'market', tier: 2, index: 1 } }))
    expect(n.players[0].reserved).toEqual([{ ...target, blind: false }])
    expect(n.market[2][1]).toEqual(nextTop)
    expect(n.decks[2]).toHaveLength(s.decks[2].length - 1)
    expect(n.players[0].tokens.gold).toBe(1)
    expect(n.bank.gold).toBe(4)
    expect(n.log[n.log.length - 1].message).toBe(`Alice reserved a tier 2 ${({ white: 'diamond', blue: 'sapphire', green: 'emerald', red: 'ruby', black: 'onyx' })[target.bonus]} card (+1 gold)`)
    expect(n.currentPlayerIndex).toBe(1)
  })

  it('leaves the slot empty when the deck is exhausted', () => {
    const s = newGame()
    s.decks[3] = []
    const n = ok(act(s, 'alice', { type: 'reserve', source: { kind: 'market', tier: 3, index: 0 } }))
    expect(n.market[3][0]).toBeNull()
  })

  it('reserves blind from the top of a deck', () => {
    const s = newGame()
    const top = s.decks[1][s.decks[1].length - 1]
    const n = ok(act(s, 'alice', { type: 'reserve', source: { kind: 'deck', tier: 1 } }))
    expect(n.players[0].reserved).toEqual([{ ...top, blind: true }])
    expect(n.decks[1]).toHaveLength(s.decks[1].length - 1)
    expect(n.market[1]).toEqual(s.market[1])
    expect(n.log[n.log.length - 1].message).toBe('Alice reserved a tier 1 card from the deck (+1 gold)')
  })

  it('still allows reserving when the bank has no gold', () => {
    const s = newGame()
    s.bank.gold = 0
    const n = ok(act(s, 'alice', { type: 'reserve', source: { kind: 'deck', tier: 2 } }))
    expect(n.players[0].tokens.gold).toBe(0)
    expect(n.players[0].reserved).toHaveLength(1)
    expect(n.log[n.log.length - 1].message).toBe('Alice reserved a tier 2 card from the deck')
  })

  it('rejects a 4th reserve, an empty deck, an empty slot and bad indices', () => {
    const s = newGame()
    const r = (source: unknown) => act(s, 'alice', { type: 'reserve', source } as GameAction)
    s.decks[3] = []
    expect(err(r({ kind: 'deck', tier: 3 }))).toMatch(/empty/i)
    s.market[1][2] = null
    expect(err(r({ kind: 'market', tier: 1, index: 2 }))).toMatch(/empty/i)
    expect(err(r({ kind: 'market', tier: 1, index: 4 }))).toMatch(/invalid/i)
    expect(err(r({ kind: 'market', tier: 1, index: -1 }))).toMatch(/invalid/i)
    expect(err(r({ kind: 'market', tier: 4, index: 0 }))).toMatch(/invalid/i)
    expect(err(r({ kind: 'nowhere', tier: 1 }))).toMatch(/invalid/i)
    s.players[0].reserved = s.decks[1].slice(0, 3).map((c) => ({ ...c, blind: false }))
    expect(err(r({ kind: 'deck', tier: 1 }))).toMatch(/more than 3/i)
  })
})

// ---------- buy ----------

describe('buy', () => {
  it('buys a market card, pays the bank, and refills from the deck', () => {
    const s = newGame()
    const card = mk('x1', 'green', 1, { white: 2, red: 1 })
    s.market[1][3] = card
    s.players[0].tokens = tokens({ white: 3, red: 1 })
    s.bank.white -= 3
    s.bank.red -= 1
    const nextTop = s.decks[1][s.decks[1].length - 1]
    const n = ok(act(s, 'alice', { type: 'buy', source: { kind: 'market', tier: 1, index: 3 } }))
    expect(n.players[0].cards).toEqual([card])
    expect(n.players[0].tokens).toEqual(tokens({ white: 1 }))
    expect(n.bank.white).toBe(s.bank.white + 2)
    expect(n.bank.red).toBe(s.bank.red + 1)
    expect(n.market[1][3]).toEqual(nextTop)
    expect(n.log[n.log.length - 1].message).toBe('Alice bought a tier 1 emerald card (+1 pt)')
    expect(n.currentPlayerIndex).toBe(1)
  })

  it('applies bonuses first, then colored tokens, then gold', () => {
    const s = newGame()
    s.players[0].cards = cardsOf('blue', 2)
    s.players[0].tokens = tokens({ blue: 1, black: 1, gold: 2 })
    s.market[2][0] = mk('x2', 'red', 2, { blue: 4, black: 2 }, 2)
    const n = ok(act(s, 'alice', { type: 'buy', source: { kind: 'market', tier: 2, index: 0 } }))
    // blue: 4 - 2 bonus = 2 due -> 1 blue + 1 gold; black 2 due -> 1 black + 1 gold
    expect(n.players[0].tokens).toEqual(tokens())
    expect(n.bank.gold).toBe(s.bank.gold + 2)
    expect(n.bank.blue).toBe(s.bank.blue + 1)
    expect(n.bank.black).toBe(s.bank.black + 1)
    expect(n.players[0].cards.map((c) => c.id)).toContain('x2')
    expect(n.log[n.log.length - 1].message).toBe('Alice bought a tier 2 ruby card (+2 pts)')
  })

  it('buys a free card with bonuses alone', () => {
    const s = newGame()
    s.players[0].cards = cardsOf('white', 3)
    s.market[1][0] = mk('free', 'black', 0, { white: 3 })
    const n = ok(act(s, 'alice', { type: 'buy', source: { kind: 'market', tier: 1, index: 0 } }))
    expect(n.players[0].cards).toHaveLength(4)
    expect(n.bank).toEqual(s.bank)
    expect(n.log[n.log.length - 1].message).toBe('Alice bought a tier 1 onyx card')
  })

  it('rejects when the player cannot afford the card', () => {
    const s = newGame()
    s.market[1][0] = mk('pricey', 'black', 0, { white: 3 })
    s.players[0].tokens = tokens({ white: 1, gold: 1 })
    expect(err(act(s, 'alice', { type: 'buy', source: { kind: 'market', tier: 1, index: 0 } }))).toMatch(/afford/i)
  })

  it('leaves the slot empty when the deck is exhausted', () => {
    const s = newGame()
    s.decks[1] = []
    s.market[1][0] = mk('free', 'black')
    const n = ok(act(s, 'alice', { type: 'buy', source: { kind: 'market', tier: 1, index: 0 } }))
    expect(n.market[1][0]).toBeNull()
  })

  it('buys a card from own reserve (strips the blind flag, no refill)', () => {
    const s = newGame()
    const card = mk('r1', 'red', 3, { green: 2 }, 3)
    s.players[0].reserved = [{ ...card, blind: true }]
    s.players[0].tokens = tokens({ green: 2 })
    const n = ok(act(s, 'alice', { type: 'buy', source: { kind: 'reserved', cardId: 'r1' } }))
    expect(n.players[0].reserved).toEqual([])
    expect(n.players[0].cards).toEqual([card])
    expect('blind' in n.players[0].cards[0]).toBe(false)
    expect(n.market).toEqual(s.market)
    expect(n.decks).toEqual(s.decks)
    expect(n.log[n.log.length - 1].message).toBe('Alice bought a reserved tier 3 ruby card (+3 pts)')
  })

  it("rejects buying a card not in one's own reserve and empty slots", () => {
    const s = newGame()
    s.players[1].reserved = [{ ...mk('bobs', 'red'), blind: false }]
    expect(err(act(s, 'alice', { type: 'buy', source: { kind: 'reserved', cardId: 'bobs' } }))).toMatch(/reserve/i)
    s.market[2][2] = null
    expect(err(act(s, 'alice', { type: 'buy', source: { kind: 'market', tier: 2, index: 2 } }))).toMatch(/empty/i)
    expect(err(act(s, 'alice', { type: 'buy', source: { kind: 'market', tier: 2, index: 9 } }))).toMatch(/invalid/i)
  })
})

// ---------- discard ----------

describe('discard phase', () => {
  function overLimit(): GameState {
    const s = newGame()
    s.players[0].tokens = tokens({ white: 3, blue: 3, green: 3 }) // 9
    return ok(act(s, 'alice', take3)) // 12
  }

  it('enters discard phase when a player ends an action with more than 10 tokens', () => {
    const s = overLimit()
    expect(s.phase).toBe('discard')
    expect(s.currentPlayerIndex).toBe(0)
    expect(s.turn).toBe(0)
    expect(tokenTotal(s.players[0].tokens)).toBe(12)
  })

  it('blocks other actions and other players during discard', () => {
    const s = overLimit()
    expect(err(act(s, 'alice', take3))).toMatch(/discard/i)
    expect(err(act(s, 'bob', { type: 'discard', tokens: { white: 2 } }))).toMatch(/not your turn/i)
  })

  it('requires returning exactly the excess, of tokens the player holds', () => {
    const s = overLimit()
    const d = (t: unknown) => err(act(s, 'alice', { type: 'discard', tokens: t } as GameAction))
    expect(d({ white: 1 })).toMatch(/exactly 2/i)
    expect(d({ white: 3 })).toMatch(/exactly 2/i)
    expect(d({})).toMatch(/exactly 2/i)
    expect(d({ black: 2 })).toMatch(/don't have/i)
    expect(d({ gold: 1, white: 1 })).toMatch(/don't have/i)
    expect(d({ purple: 2 })).toMatch(/invalid/i)
    expect(d({ white: -1, blue: 3 })).toMatch(/invalid/i)
    expect(d({ white: 1.5, blue: 0.5 })).toMatch(/invalid/i)
    expect(d(null)).toMatch(/invalid/i)
  })

  it('returns tokens to the bank and ends the turn', () => {
    const s = overLimit()
    const n = ok(act(s, 'alice', { type: 'discard', tokens: { white: 1, red: 1 } }))
    expect(tokenTotal(n.players[0].tokens)).toBe(10)
    expect(n.players[0].tokens).toEqual(tokens({ white: 3, blue: 4, green: 3 }))
    expect(n.bank.white).toBe(s.bank.white + 1)
    expect(n.bank.red).toBe(s.bank.red + 1)
    expect(n.phase).toBe('action')
    expect(n.currentPlayerIndex).toBe(1)
    expect(n.turn).toBe(1)
    expect(n.log[n.log.length - 1].message).toBe('Alice returned 1 diamond, 1 ruby')
  })

  it('rejects discard outside the discard phase', () => {
    const s = newGame()
    expect(err(act(s, 'alice', { type: 'discard', tokens: { white: 1 } }))).toMatch(/nothing to discard/i)
  })

  it('triggers when a reserve gold pushes the player to 11', () => {
    const s = newGame()
    s.players[0].tokens = tokens({ white: 4, blue: 3, green: 3 })
    const n = ok(act(s, 'alice', { type: 'reserve', source: { kind: 'deck', tier: 1 } }))
    expect(n.phase).toBe('discard')
    const d = ok(act(n, 'alice', { type: 'discard', tokens: { gold: 1 } }))
    expect(d.players[0].tokens.gold).toBe(0)
    expect(d.phase).toBe('action')
  })

  it('does not trigger at exactly 10 tokens', () => {
    const s = newGame()
    s.players[0].tokens = tokens({ white: 4, blue: 3 })
    const n = ok(act(s, 'alice', take3))
    expect(tokenTotal(n.players[0].tokens)).toBe(10)
    expect(n.phase).toBe('action')
    expect(n.currentPlayerIndex).toBe(1)
  })
})

// ---------- nobles ----------

describe('nobles', () => {
  it('auto-awards a single qualifying noble at the end of the turn', () => {
    const s = newGame()
    const nb = noble('nx', { white: 4, blue: 4 })
    s.nobles = [nb, noble('ny', { red: 4, black: 4 })]
    s.players[0].cards = [...cardsOf('white', 4), ...cardsOf('blue', 3)]
    s.market[1][0] = mk('b4', 'blue')
    const n = ok(act(s, 'alice', { type: 'buy', source: { kind: 'market', tier: 1, index: 0 } }))
    expect(n.players[0].nobles).toEqual([nb])
    expect(n.nobles.map((x) => x.id)).toEqual(['ny'])
    expect(n.log[n.log.length - 1].message).toBe('Alice was visited by a noble (+3)')
    expect(n.phase).toBe('action')
    expect(n.currentPlayerIndex).toBe(1)
    expect(toPublicState(n, null).players[0].points).toBe(3)
  })

  it('does not award a noble when requirements are not met (tokens do not count)', () => {
    const s = newGame()
    s.nobles = [noble('nx', { white: 4, blue: 4 })]
    s.players[0].cards = cardsOf('white', 4)
    s.players[0].tokens = tokens({ blue: 4 })
    const n = ok(act(s, 'alice', take3))
    expect(n.players[0].nobles).toEqual([])
    expect(n.nobles).toHaveLength(1)
  })

  it('awards a noble after the discard is resolved', () => {
    const s = newGame()
    s.nobles = [noble('nx', { white: 4, blue: 4 })]
    s.players[0].cards = [...cardsOf('white', 4), ...cardsOf('blue', 4)]
    s.players[0].tokens = tokens({ green: 9 })
    const n = ok(act(s, 'alice', take3))
    expect(n.phase).toBe('discard')
    expect(n.players[0].nobles).toEqual([])
    const d = ok(act(n, 'alice', { type: 'discard', tokens: { green: 2 } }))
    expect(d.players[0].nobles.map((x) => x.id)).toEqual(['nx'])
    expect(d.currentPlayerIndex).toBe(1)
  })

  it('asks the player to choose when 2+ nobles qualify, one noble per turn', () => {
    const s = newGame()
    s.nobles = [
      noble('n-a', { white: 4, blue: 4 }),
      noble('n-b', { white: 3, blue: 3, green: 3 }),
      noble('n-c', { red: 4, black: 4 }),
    ]
    s.players[0].cards = [...cardsOf('white', 4), ...cardsOf('blue', 4), ...cardsOf('green', 2)]
    s.market[1][0] = mk('g3', 'green')
    const n = ok(act(s, 'alice', { type: 'buy', source: { kind: 'market', tier: 1, index: 0 } }))
    expect(n.phase).toBe('chooseNoble')
    expect(n.pendingNobleIds).toEqual(['n-a', 'n-b'])
    expect(n.currentPlayerIndex).toBe(0)
    expect(n.turn).toBe(0)

    expect(err(act(n, 'alice', take3))).toMatch(/noble/i)
    expect(err(act(n, 'alice', { type: 'chooseNoble', nobleId: 'n-c' }))).toMatch(/cannot choose/i)
    expect(err(act(n, 'bob', { type: 'chooseNoble', nobleId: 'n-a' }))).toMatch(/not your turn/i)

    const c = ok(act(n, 'alice', { type: 'chooseNoble', nobleId: 'n-b' }))
    expect(c.players[0].nobles.map((x) => x.id)).toEqual(['n-b'])
    expect(c.nobles.map((x) => x.id)).toEqual(['n-a', 'n-c'])
    expect(c.phase).toBe('action')
    expect(c.pendingNobleIds).toEqual([])
    expect(c.currentPlayerIndex).toBe(1)
    expect(c.turn).toBe(1)

    // Alice still qualifies for n-a: it is auto-awarded at the end of her next turn.
    const b = ok(act(c, 'bob', { type: 'takeTwo', color: 'red' }))
    const a = ok(act(b, 'alice', { type: 'takeDifferent', colors: ['white', 'blue', 'green'] }))
    expect(a.players[0].nobles.map((x) => x.id)).toEqual(['n-b', 'n-a'])
  })

  it('rejects chooseNoble outside the chooseNoble phase', () => {
    const s = newGame()
    expect(err(act(s, 'alice', { type: 'chooseNoble', nobleId: s.nobles[0].id }))).toMatch(/no noble/i)
  })
})

// ---------- end of game ----------

describe('final round and winner', () => {
  function withPoints(s: GameState, idx: number, points: number, cardCount = 1): void {
    const cards = cardsOf('white', cardCount, `p${idx}`)
    cards[0] = { ...cards[0], points }
    s.players[idx].cards = cards
  }

  it('triggers the final round at 15 points and ends after the last player', () => {
    const s = newGame(3)
    s.nobles = []
    withPoints(s, 0, 14)
    s.market[1][0] = mk('win', 'black', 1)
    let n = ok(act(s, 'alice', { type: 'buy', source: { kind: 'market', tier: 1, index: 0 } }))
    expect(n.finalRound).toBe(true)
    expect(n.status).toBe('playing')
    expect(n.log[n.log.length - 1]).toMatchObject({ playerId: null, message: 'Alice reached 15 points. Final round!' })
    expect(n.currentPlayerIndex).toBe(1)

    n = ok(act(n, 'bob', take3))
    expect(n.status).toBe('playing')
    n = ok(act(n, 'carol', take3))
    expect(n.status).toBe('finished')
    expect(n.winnerIds).toEqual(['alice'])
    expect(n.log[n.log.length - 1].message).toBe('Game over! Alice wins with 15 points')
    expect(n.log.filter((l) => l.message.includes('Final round'))).toHaveLength(1)
    expect(err(act(n, n.players[n.currentPlayerIndex].id, take3))).toMatch(/over/i)
  })

  it('ends immediately when the last player in order reaches 15', () => {
    const s = newGame(2)
    s.nobles = []
    s.currentPlayerIndex = 1
    withPoints(s, 1, 15)
    const n = ok(act(s, 'bob', take3))
    expect(n.finalRound).toBe(true)
    expect(n.status).toBe('finished')
    expect(n.winnerIds).toEqual(['bob'])
  })

  it('lets later players overtake during the final round', () => {
    const s = newGame(2)
    s.nobles = []
    withPoints(s, 0, 15)
    withPoints(s, 1, 16)
    let n = ok(act(s, 'alice', take3))
    expect(n.finalRound).toBe(true)
    n = ok(act(n, 'bob', take3))
    expect(n.winnerIds).toEqual(['bob'])
  })

  it('breaks ties by fewest purchased cards', () => {
    const s = newGame(2)
    s.nobles = []
    withPoints(s, 0, 15, 5)
    withPoints(s, 1, 15, 3)
    const n = ok(act(ok(act(s, 'alice', take3)), 'bob', take3))
    expect(n.status).toBe('finished')
    expect(n.winnerIds).toEqual(['bob'])
    expect(n.log[n.log.length - 1].message).toBe('Game over! Bob wins with 15 points')
  })

  it('shares victory when still tied', () => {
    const s = newGame(3)
    s.nobles = []
    withPoints(s, 0, 16, 4)
    withPoints(s, 2, 16, 4)
    withPoints(s, 1, 10, 2)
    let n = ok(act(s, 'alice', take3))
    n = ok(act(n, 'bob', take3))
    n = ok(act(n, 'carol', take3))
    expect(n.status).toBe('finished')
    expect(n.winnerIds).toEqual(['alice', 'carol'])
    expect(n.log[n.log.length - 1].message).toBe('Game over! Alice and Carol share the victory with 16 points')
  })

  it('does not end the game during the final round while a phase is pending', () => {
    const s = newGame(2)
    s.nobles = []
    s.finalRound = true
    s.currentPlayerIndex = 1
    s.players[1].tokens = tokens({ red: 9 })
    const n = ok(act(s, 'bob', take3))
    expect(n.phase).toBe('discard')
    expect(n.status).toBe('playing')
    const d = ok(act(n, 'bob', { type: 'discard', tokens: { red: 2 } }))
    expect(d.status).toBe('finished')
  })
})

// ---------- log ----------

describe('log', () => {
  it('keeps the last 100 entries with monotonic ids', () => {
    const s = newGame()
    s.log = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, playerId: null, message: `m${i}` }))
    const n = ok(act(s, 'alice', take3))
    expect(n.log).toHaveLength(100)
    expect(n.log[99].id).toBe(101)
    expect(n.log[0].id).toBe(2)
    for (let i = 1; i < n.log.length; i++) expect(n.log[i].id).toBeGreaterThan(n.log[i - 1].id)
  })
})

// ---------- public projection ----------

describe('toPublicState', () => {
  function withReserves(): GameState {
    const s = newGame(3)
    let n = ok(act(s, 'alice', { type: 'reserve', source: { kind: 'deck', tier: 2 } }))
    n = ok(act(n, 'bob', { type: 'reserve', source: { kind: 'market', tier: 1, index: 0 } }))
    n = ok(act(n, 'carol', take3))
    return n
  }

  it('hides decks and exposes only deck counts', () => {
    const s = newGame()
    const p = toPublicState(s, 'alice')
    expect('decks' in p).toBe(false)
    expect(p.deckCounts).toEqual({ 1: 36, 2: 26, 3: 16 })
    expect(JSON.stringify(p)).not.toContain(s.decks[1][0].id)
  })

  it("hides opponents' blind reserves but shows the viewer's own", () => {
    const s = withReserves()
    const blindCard = s.players[0].reserved[0]
    expect(blindCard.blind).toBe(true)

    const own = toPublicState(s, 'alice')
    expect(own.players[0].reserved).toEqual([blindCard])
    expect(isHiddenCard(own.players[0].reserved[0])).toBe(false)

    for (const viewer of ['bob', 'carol', null]) {
      const p = toPublicState(s, viewer)
      const r = p.players[0].reserved[0]
      expect(isHiddenCard(r)).toBe(true)
      expect(r).toMatchObject({ tier: 2, hidden: true })
      expect(Object.keys(r).sort()).toEqual(['hidden', 'id', 'tier'])
      // the real card id must not leak (it identifies the card in public data)
      expect(JSON.stringify(p.players[0])).not.toContain(blindCard.id)
      // Bob's market reserve is public
      expect(p.players[1].reserved[0]).toEqual(s.players[1].reserved[0])
    }
  })

  it('computes tokenCount, bonuses and points', () => {
    const s = newGame()
    s.players[0].tokens = tokens({ white: 2, gold: 1 })
    s.players[0].cards = [mk('a', 'red', 2), mk('b', 'red', 1), mk('c', 'blue')]
    s.players[0].nobles = [noble('nz', { red: 4, black: 4 })]
    const p = toPublicState(s, 'bob').players[0]
    expect(p.tokenCount).toBe(3)
    expect(p.bonuses).toEqual({ ...emptyGems(), red: 2, blue: 1 })
    expect(p.points).toBe(6)
  })

  it('copies top-level fields and does not alias internal state', () => {
    const s = withReserves()
    const p = toPublicState(s, 'alice')
    expect(p.bank).toEqual(s.bank)
    expect(p.market).toEqual(s.market)
    expect(p.nobles).toEqual(s.nobles)
    expect(p.log).toEqual(s.log)
    expect(p.turn).toBe(s.turn)
    expect(p.currentPlayerIndex).toBe(s.currentPlayerIndex)
    const snapshot = structuredClone(s)
    p.bank.white = 99
    p.market[1][0]!.points = 99
    p.players[0].tokens.gold = 99
    ;(p.players[0].reserved[0] as Card).points = 99
    p.log.push({ id: 999, playerId: null, message: 'x' })
    expect(s).toEqual(snapshot)
  })
})

// ---------- smoke: random legal play never breaks invariants ----------

describe('random playthrough', () => {
  it('keeps token totals and card counts invariant over many random actions', () => {
    for (const playerCount of [2, 3, 4]) {
      const rng = mulberry32(playerCount * 1000 + 1)
      let s = newGame(playerCount, playerCount)
      const totalTokens = tokenTotal(s.bank)
      const pick = <T>(xs: T[]): T => xs[Math.floor(rng() * xs.length)]
      for (let step = 0; step < 600 && s.status === 'playing'; step++) {
        const pid = s.players[s.currentPlayerIndex].id
        const candidates: GameAction[] = []
        if (s.phase === 'discard') {
          const p = s.players[s.currentPlayerIndex]
          const excess = tokenTotal(p.tokens) - 10
          const t: Partial<TokenCounts> = {}
          let left = excess
          for (const c of [...GEM_COLORS, 'gold'] as const) {
            const n = Math.min(left, p.tokens[c])
            if (n > 0) t[c] = n
            left -= n
          }
          candidates.push({ type: 'discard', tokens: t })
        } else if (s.phase === 'chooseNoble') {
          candidates.push({ type: 'chooseNoble', nobleId: pick(s.pendingNobleIds) })
        } else {
          for (const tier of TIERS)
            for (let i = 0; i < 4; i++) {
              candidates.push({ type: 'buy', source: { kind: 'market', tier, index: i } })
              candidates.push({ type: 'buy', source: { kind: 'market', tier, index: i } })
            }
          for (const r of s.players[s.currentPlayerIndex].reserved)
            candidates.push({ type: 'buy', source: { kind: 'reserved', cardId: r.id } })
          const avail = GEM_COLORS.filter((c) => s.bank[c] > 0)
          candidates.push({ type: 'takeDifferent', colors: avail.slice(0, 3) })
          candidates.push({ type: 'takeTwo', color: pick([...GEM_COLORS]) })
          candidates.push({ type: 'reserve', source: { kind: 'market', tier: pick([1, 2, 3]), index: 0 } })
          candidates.push({ type: 'reserve', source: { kind: 'deck', tier: pick([1, 2, 3]) } })
        }
        let moved = false
        for (let tries = 0; tries < 50 && !moved; tries++) {
          const r = act(s, pid, pick(candidates))
          if (r.ok) {
            s = r.state
            moved = true
          }
        }
        if (!moved) break // stuck (the rare no-legal-action case) — acceptable for this smoke test
        const inHands = s.players.reduce((sum, p) => sum + tokenTotal(p.tokens), 0)
        expect(tokenTotal(s.bank) + inHands).toBe(totalTokens)
        for (const c of [...GEM_COLORS, 'gold'] as const) expect(s.bank[c]).toBeGreaterThanOrEqual(0)
        const cardCount =
          TIERS.reduce((sum, t) => sum + s.decks[t].length + s.market[t].filter(Boolean).length, 0) +
          s.players.reduce((sum, p) => sum + p.cards.length + p.reserved.length, 0)
        expect(cardCount).toBe(90)
        expect(s.nobles.length + s.players.reduce((sum, p) => sum + p.nobles.length, 0)).toBe(playerCount + 1)
        if (s.phase === 'action') for (const p of s.players) expect(tokenTotal(p.tokens)).toBeLessThanOrEqual(10)
      }
    }
  })
})

describe('pass and skipTurn', () => {
  function lockedGame(): GameState {
    const s = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], () => 0.3)
    s.players[0].tokens = { white: 5, blue: 5, green: 0, red: 0, black: 0, gold: 0 }
    s.players[1].tokens = { white: 0, blue: 0, green: 5, red: 5, black: 0, gold: 0 }
    s.players[2].tokens = { white: 0, blue: 0, green: 0, red: 0, black: 5, gold: 0 }
    for (const c of GEM_COLORS) s.bank[c] = 0
    s.players[0].reserved = s.decks[3].splice(0, 3).map((c) => ({ ...c, blind: true }))
    const unaffordable = ALL_CARDS.filter((c) => c.cost.white === 0 && c.cost.blue === 0)
    for (const t of TIERS) s.market[t] = unaffordable.filter((c) => c.tier === t).slice(0, 4)
    return s
  }

  it('rejects pass while a legal move exists', () => {
    const s = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], () => 0.5)
    const r = applyAction(s, 'a', { type: 'pass' })
    expect(r.ok).toBe(false)
  })

  it('allows pass when the player has no legal move', () => {
    const s = lockedGame()
    const r = applyAction(s, 'a', { type: 'pass' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.state.currentPlayerIndex).toBe(1)
      expect(r.state.turn).toBe(1)
    }
  })

  it('skipTurn returns excess tokens and advances the turn', () => {
    const s = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], () => 0.5)
    s.players[0].tokens = { white: 4, blue: 3, green: 2, red: 1, black: 1, gold: 1 }
    s.phase = 'discard'
    const next = skipTurn(s)
    expect(tokenTotal(next.players[0].tokens)).toBe(10)
    expect(next.players[0].tokens.gold).toBe(1)
    expect(next.currentPlayerIndex).toBe(1)
    expect(next.phase).toBe('action')
    expect(s.currentPlayerIndex).toBe(0) // input untouched
  })

  it('shuffle tolerates an rng returning 1', () => {
    const s = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], () => 1)
    expect(s.nobles.every(Boolean)).toBe(true)
    for (const t of TIERS) expect(s.decks[t].every(Boolean)).toBe(true)
  })
})

describe('skipTurn logging', () => {
  it('logs the tokens returned on behalf of a skipped player', () => {
    const s = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], () => 0.5)
    s.players[0].tokens = { white: 5, blue: 3, green: 2, red: 1, black: 0, gold: 0 }
    s.phase = 'discard'
    const next = skipTurn(s)
    expect(next.log[next.log.length - 1].message).toBe("A's turn was skipped (player offline) and returned 1 diamond")
  })
})

describe('skipTurn noble check', () => {
  it('awards a qualifying noble when skipping during discard', () => {
    const s = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], () => 0.5)
    s.players[0].cards = [mk('w1', 'white'), mk('w2', 'white')]
    s.players[0].tokens = tokens({ white: 5, blue: 3, green: 3 })
    s.nobles = [noble('n1', { white: 2 })]
    s.phase = 'discard'
    const next = skipTurn(s)
    expect(next.players[0].nobles.map((n) => n.id)).toEqual(['n1'])
    expect(next.nobles).toHaveLength(0)
    expect(tokenTotal(next.players[0].tokens)).toBe(10)
    expect(next.phase).toBe('action')
    expect(next.currentPlayerIndex).toBe(1)
  })

  it('auto-picks the first noble when several qualify during discard', () => {
    const s = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], () => 0.5)
    s.players[0].cards = [mk('w1', 'white'), mk('b1', 'blue')]
    s.players[0].tokens = tokens({ white: 5, blue: 3, green: 3 })
    s.nobles = [noble('n1', { white: 1 }), noble('n2', { blue: 1 })]
    s.phase = 'discard'
    const next = skipTurn(s)
    expect(next.players[0].nobles.map((n) => n.id)).toEqual(['n1'])
    expect(next.nobles.map((n) => n.id)).toEqual(['n2'])
    expect(next.phase).toBe('action')
    expect(next.pendingNobleIds).toEqual([])
    expect(next.currentPlayerIndex).toBe(1)
  })

  it('does not award nobles when skipping in action phase', () => {
    const s = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], () => 0.5)
    s.players[0].cards = [mk('w1', 'white')]
    s.nobles = [noble('n1', { white: 1 })]
    const next = skipTurn(s)
    expect(next.players[0].nobles).toHaveLength(0)
    expect(next.currentPlayerIndex).toBe(1)
  })
})
