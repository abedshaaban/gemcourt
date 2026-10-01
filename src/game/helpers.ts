import { GEM_COLORS, MAX_RESERVED, TOKEN_COLORS } from './types'
import type { Card, GemCounts, Noble, Tier, TokenCounts } from './types'

export function emptyGems(): GemCounts {
  return { white: 0, blue: 0, green: 0, red: 0, black: 0 }
}

export function emptyTokens(): TokenCounts {
  return { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 }
}

export function tokenTotal(tokens: Partial<TokenCounts>): number {
  return TOKEN_COLORS.reduce((sum, c) => sum + (tokens[c] ?? 0), 0)
}

export function bonusesOf(cards: Card[]): GemCounts {
  const b = emptyGems()
  for (const card of cards) b[card.bonus]++
  return b
}

export function pointsOf(cards: Card[], nobles: Noble[]): number {
  return cards.reduce((s, c) => s + c.points, 0) + nobles.reduce((s, n) => s + n.points, 0)
}

/**
 * Tokens a player must spend to buy a card: bonuses discount first, then colored tokens,
 * then gold covers any shortfall. Returns null if the player cannot afford the card.
 */
export function computePayment(tokens: TokenCounts, bonuses: GemCounts, cost: GemCounts): TokenCounts | null {
  const pay = emptyTokens()
  let goldNeeded = 0
  for (const color of GEM_COLORS) {
    const due = Math.max(0, cost[color] - bonuses[color])
    const fromColor = Math.min(due, tokens[color])
    pay[color] = fromColor
    goldNeeded += due - fromColor
  }
  if (goldNeeded > tokens.gold) return null
  pay.gold = goldNeeded
  return pay
}

export function canAfford(tokens: TokenCounts, bonuses: GemCounts, cost: GemCounts): boolean {
  return computePayment(tokens, bonuses, cost) !== null
}

export function meetsNoble(bonuses: GemCounts, noble: Noble): boolean {
  return GEM_COLORS.every((c) => bonuses[c] >= noble.requirement[c])
}

/**
 * True if the player can make any main action: take gems, reserve, or buy.
 * Works on both engine and public state (reserved cards must be the player's own, fully visible).
 */
export function hasLegalMove(args: {
  bank: TokenCounts
  market: Record<Tier, (Card | null)[]>
  deckCounts: Record<Tier, number>
  tokens: TokenCounts
  bonuses: GemCounts
  reserved: Card[]
}): boolean {
  const { bank, market, deckCounts, tokens, bonuses, reserved } = args
  if (GEM_COLORS.some((c) => bank[c] > 0)) return true
  const marketCards = ([1, 2, 3] as Tier[]).flatMap((t) => market[t]).filter((c): c is Card => c !== null)
  if (reserved.length < MAX_RESERVED && (marketCards.length > 0 || deckCounts[1] + deckCounts[2] + deckCounts[3] > 0)) return true
  return [...marketCards, ...reserved].some((c) => canAfford(tokens, bonuses, c.cost))
}
