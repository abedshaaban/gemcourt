// Shared contract between the game engine, the server, and the UI.
// Keep this file free of runtime dependencies other than the constants below.

export type GemColor = 'white' | 'blue' | 'green' | 'red' | 'black'
export type TokenColor = GemColor | 'gold'
export type Tier = 1 | 2 | 3

export const GEM_COLORS: readonly GemColor[] = ['white', 'blue', 'green', 'red', 'black']
export const TOKEN_COLORS: readonly TokenColor[] = [...GEM_COLORS, 'gold']
export const TIERS: readonly Tier[] = [1, 2, 3]

export const WINNING_POINTS = 15
export const MAX_TOKENS = 10
export const MAX_RESERVED = 3
export const MARKET_SLOTS = 4
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6

export type GemCounts = Record<GemColor, number>
export type TokenCounts = Record<TokenColor, number>

export interface Card {
  id: string // e.g. "t1-07"
  tier: Tier
  bonus: GemColor // the permanent gem discount this card grants
  points: number // prestige points
  cost: GemCounts
}

export interface Noble {
  id: string // e.g. "n-03"
  points: number // always 3 in the standard game
  requirement: GemCounts // bonuses (purchased cards) needed, not tokens
}

/** A card in a player's reserve. `blind` = reserved face-down from a deck (hidden from opponents). */
export interface ReservedCard extends Card {
  blind: boolean
}

export interface PlayerState {
  id: string
  name: string
  tokens: TokenCounts
  cards: Card[] // purchased cards
  reserved: ReservedCard[] // max 3
  nobles: Noble[]
}

/**
 * action      – current player must take one of the four main actions
 * discard     – current player holds > 10 tokens and must return the excess
 * chooseNoble – current player qualifies for 2+ nobles and must pick one
 */
export type TurnPhase = 'action' | 'discard' | 'chooseNoble'

export interface LogEntry {
  id: number
  playerId: string | null
  message: string
}

export interface GameState {
  winningPoints: number
  players: PlayerState[] // in turn order; index 0 is the first player
  currentPlayerIndex: number
  bank: TokenCounts
  decks: Record<Tier, Card[]> // secret; top of deck = last element
  market: Record<Tier, (Card | null)[]> // always MARKET_SLOTS entries; null = empty slot (deck ran out)
  nobles: Noble[] // nobles still available on the table
  phase: TurnPhase
  pendingNobleIds: string[] // only meaningful when phase === 'chooseNoble'
  finalRound: boolean // true once someone reaches WINNING_POINTS; round finishes so all get equal turns
  status: 'playing' | 'finished'
  winnerIds: string[] // set when status === 'finished' (more than one = shared victory)
  turn: number // number of completed turns
  log: LogEntry[] // newest last; engine may cap length (e.g. last 100)
}

export type CardSource =
  | { kind: 'market'; tier: Tier; index: number }
  | { kind: 'reserved'; cardId: string }

export type ReserveSource =
  | { kind: 'market'; tier: Tier; index: number }
  | { kind: 'deck'; tier: Tier }

export type GameAction =
  /** Take up to 3 tokens of different colors. Must take 3 when 3+ colors are available in the bank. */
  | { type: 'takeDifferent'; colors: GemColor[] }
  /** Take 2 tokens of the same color. Only allowed if that bank pile has at least 4 tokens. */
  | { type: 'takeTwo'; color: GemColor }
  /** Reserve a face-up or top-of-deck card; gain 1 gold if available. Max 3 reserved. */
  | { type: 'reserve'; source: ReserveSource }
  /** Buy a face-up or reserved card. Payment is computed automatically (colored tokens first, then gold). */
  | { type: 'buy'; source: CardSource }
  /** Return tokens to the bank until holding exactly MAX_TOKENS. Only valid in 'discard' phase. */
  | { type: 'discard'; tokens: Partial<TokenCounts> }
  /** Choose one noble among pendingNobleIds. Only valid in 'chooseNoble' phase. */
  | { type: 'chooseNoble'; nobleId: string }
  /** Skip the turn. Only allowed when the player has no legal action at all (see hasLegalMove). */
  | { type: 'pass' }

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: string }

// ---------- Client-facing (per-viewer) projection ----------

/** An opponent's blind-reserved card: only the tier is visible. */
export interface HiddenCard {
  id: string // opaque per-view id (never the real card id); use only as a list key
  tier: Tier
  hidden: true
}

export type VisibleReserved = ReservedCard | HiddenCard

export interface PublicPlayer {
  id: string
  name: string
  tokens: TokenCounts
  tokenCount: number
  cards: Card[]
  bonuses: GemCounts // count of purchased cards per color
  points: number // cards + nobles
  reserved: VisibleReserved[]
  nobles: Noble[]
}

export interface PublicGameState {
  winningPoints: number
  players: PublicPlayer[]
  currentPlayerIndex: number
  bank: TokenCounts
  deckCounts: Record<Tier, number>
  market: Record<Tier, (Card | null)[]>
  nobles: Noble[]
  phase: TurnPhase
  pendingNobleIds: string[]
  finalRound: boolean
  status: 'playing' | 'finished'
  winnerIds: string[]
  turn: number
  log: LogEntry[]
}

export function isHiddenCard(c: VisibleReserved): c is HiddenCard {
  return (c as HiddenCard).hidden === true
}
