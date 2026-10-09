import { ALL_CARDS } from './cards'
import { ALL_NOBLES } from './nobles'
import { bonusesOf, computePayment, emptyTokens, hasLegalMove, meetsNoble, pointsOf, tokenTotal } from './helpers'
import {
  GEM_COLORS,
  MARKET_SLOTS,
  MAX_PLAYERS,
  MAX_RESERVED,
  MAX_TOKENS,
  MIN_PLAYERS,
  TIERS,
  TOKEN_COLORS,
  WINNING_POINTS,
} from './types'
import type {
  ActionResult,
  Card,
  CardSource,
  GameAction,
  GameState,
  GemColor,
  PlayerState,
  PublicGameState,
  PublicPlayer,
  ReserveSource,
  Tier,
  TokenColor,
  TokenCounts,
  VisibleReserved,
} from './types'

// ---------- small utilities ----------

/** In-place Fisher-Yates shuffle using the given rng (returns the same array). */
export function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

/** Number of tokens of each gem color in the bank at setup (5–6 players extend the official 2–4 table). */
export function gemsPerPile(playerCount: number): number {
  return ({ 2: 4, 3: 5, 4: 7, 5: 8, 6: 9 } as Record<number, number>)[playerCount] ?? 7
}

/** Gold jokers in the bank at setup: 5 up to 4 players, then one more per extra player. */
export function goldPerGame(playerCount: number): number {
  return playerCount <= 4 ? 5 : playerCount + 1
}

function addLog(state: GameState, playerId: string | null, message: string): void {
  const last = state.log[state.log.length - 1]
  state.log.push({ id: (last?.id ?? 0) + 1, playerId, message })
}

function isGemColor(c: unknown): c is GemColor {
  return typeof c === 'string' && (GEM_COLORS as readonly string[]).includes(c)
}

function isTier(t: unknown): t is Tier {
  return typeof t === 'number' && (TIERS as readonly number[]).includes(t)
}

function isSlotIndex(i: unknown): i is number {
  return typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < MARKET_SLOTS
}

/** Gem names as shown on the board, so the log reads the same as the UI. */
const GEM_LABEL: Record<TokenColor, string> = {
  white: 'diamond',
  blue: 'sapphire',
  green: 'emerald',
  red: 'ruby',
  black: 'onyx',
  gold: 'gold',
}

function describeTokens(tokens: Partial<TokenCounts>): string {
  return TOKEN_COLORS.filter((c) => (tokens[c] ?? 0) > 0)
    .map((c) => `${tokens[c]} ${GEM_LABEL[c]}`)
    .join(', ')
}

function playerPoints(p: PlayerState): number {
  return pointsOf(p.cards, p.nobles)
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

type Err = { ok: false; error: string }
const fail = (error: string): Err => ({ ok: false, error })

// ---------- setup ----------

export function createGame(players: { id: string; name: string }[], rng: () => number = Math.random, winningPoints = WINNING_POINTS): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`A game needs ${MIN_PLAYERS}-${MAX_PLAYERS} players`)
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    throw new Error('Player ids must be unique')
  }

  const decks: Record<Tier, Card[]> = { 1: [], 2: [], 3: [] }
  for (const tier of TIERS) {
    decks[tier] = shuffle(structuredClone(ALL_CARDS.filter((c) => c.tier === tier)), rng)
  }
  const market: Record<Tier, (Card | null)[]> = { 1: [], 2: [], 3: [] }
  for (const tier of TIERS) {
    for (let i = 0; i < MARKET_SLOTS; i++) market[tier].push(decks[tier].pop() ?? null)
  }

  const nobles = shuffle(structuredClone(ALL_NOBLES), rng).slice(0, players.length + 1)

  const perPile = gemsPerPile(players.length)
  const bank = emptyTokens()
  for (const c of GEM_COLORS) bank[c] = perPile
  bank.gold = goldPerGame(players.length)

  const state: GameState = {
    winningPoints: [12, 15, 18].includes(winningPoints) ? winningPoints : WINNING_POINTS,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      tokens: emptyTokens(),
      cards: [],
      reserved: [],
      nobles: [],
    })),
    currentPlayerIndex: 0,
    bank,
    decks,
    market,
    nobles,
    phase: 'action',
    pendingNobleIds: [],
    finalRound: false,
    status: 'playing',
    winnerIds: [],
    turn: 0,
    log: [],
  }
  addLog(state, null, `Game started with ${joinNames(players.map((p) => p.name))}. ${players[0].name} goes first.`)
  return state
}

// ---------- actions ----------

export function applyAction(state: GameState, playerId: string, action: GameAction): ActionResult {
  if (state.status === 'finished') return fail('The game is over')
  const playerIndex = state.players.findIndex((p) => p.id === playerId)
  if (playerIndex === -1) return fail('You are not a player in this game')
  if (playerIndex !== state.currentPlayerIndex) return fail('Not your turn')
  if (!action || typeof action !== 'object') return fail('Invalid action')

  const s = structuredClone(state)
  const player = s.players[playerIndex]
  let err: Err | null

  switch (action.type) {
    case 'takeDifferent':
    case 'takeTwo':
    case 'reserve':
    case 'buy': {
      if (s.phase === 'discard') return fail('You must discard tokens first')
      if (s.phase === 'chooseNoble') return fail('You must choose a noble first')
      if (action.type === 'takeDifferent') err = takeDifferent(s, player, action.colors)
      else if (action.type === 'takeTwo') err = takeTwo(s, player, action.color)
      else if (action.type === 'reserve') err = reserve(s, player, action.source)
      else err = buy(s, player, action.source)
      if (err) return err
      if (tokenTotal(player.tokens) > MAX_TOKENS) {
        s.phase = 'discard'
        return { ok: true, state: s }
      }
      checkNobles(s, player)
      return { ok: true, state: s }
    }
    case 'discard': {
      if (s.phase !== 'discard') return fail('You have nothing to discard')
      err = discard(s, player, action.tokens)
      if (err) return err
      s.phase = 'action'
      checkNobles(s, player)
      return { ok: true, state: s }
    }
    case 'chooseNoble': {
      if (s.phase !== 'chooseNoble') return fail('There is no noble to choose')
      if (!s.pendingNobleIds.includes(action.nobleId)) return fail('You cannot choose that noble')
      awardNoble(s, player, action.nobleId)
      endTurn(s, player)
      return { ok: true, state: s }
    }
    case 'pass': {
      if (s.phase !== 'action') return fail('Finish your turn first')
      const legal = hasLegalMove({
        bank: s.bank,
        market: s.market,
        deckCounts: { 1: s.decks[1].length, 2: s.decks[2].length, 3: s.decks[3].length },
        tokens: player.tokens,
        bonuses: bonusesOf(player.cards),
        reserved: player.reserved,
      })
      if (legal) return fail('You still have a legal move')
      addLog(s, player.id, `${player.name} had no legal move and passed`)
      endTurn(s, player)
      return { ok: true, state: s }
    }
    default:
      return fail('Unknown action')
  }
}

function takeDifferent(s: GameState, player: PlayerState, colors: unknown): Err | null {
  if (!Array.isArray(colors) || colors.length === 0) return fail('Choose at least one color')
  if (!colors.every(isGemColor)) return fail('Invalid gem color')
  if (new Set(colors).size !== colors.length) return fail('Colors must all be different')
  const available = GEM_COLORS.filter((c) => s.bank[c] > 0).length
  if (available === 0) return fail('No gem tokens left in the bank')
  const required = Math.min(3, available)
  if (colors.length !== required) {
    return fail(required === 3 ? 'You must take exactly 3 different colors' : `You must take exactly ${required} different color${required === 1 ? '' : 's'}`)
  }
  for (const c of colors) if (s.bank[c] < 1) return fail(`No ${c} tokens left in the bank`)
  const taken: Partial<TokenCounts> = {}
  for (const c of colors) {
    s.bank[c]--
    player.tokens[c]++
    taken[c] = 1
  }
  addLog(s, player.id, `${player.name} took ${GEM_COLORS.filter((c) => taken[c]).map((c) => `1 ${GEM_LABEL[c]}`).join(', ')}`)
  return null
}

function takeTwo(s: GameState, player: PlayerState, color: unknown): Err | null {
  if (!isGemColor(color)) return fail('Invalid gem color')
  if (s.bank[color] < 4) return fail(`Need at least 4 ${color} tokens in the bank to take 2`)
  s.bank[color] -= 2
  player.tokens[color] += 2
  addLog(s, player.id, `${player.name} took 2 ${GEM_LABEL[color]}`)
  return null
}

function reserve(s: GameState, player: PlayerState, source: ReserveSource | undefined): Err | null {
  if (player.reserved.length >= MAX_RESERVED) return fail(`You cannot reserve more than ${MAX_RESERVED} cards`)
  if (!source || !isTier(source.tier)) return fail('Invalid card source')
  const tier = source.tier
  let card: Card
  let blind: boolean
  if (source.kind === 'market') {
    if (!isSlotIndex(source.index)) return fail('Invalid market slot')
    const slot = s.market[tier][source.index]
    if (!slot) return fail('That market slot is empty')
    card = slot
    blind = false
    s.market[tier][source.index] = s.decks[tier].pop() ?? null
  } else if (source.kind === 'deck') {
    const top = s.decks[tier].pop()
    if (!top) return fail(`The tier ${tier} deck is empty`)
    card = top
    blind = true
  } else {
    return fail('Invalid card source')
  }
  player.reserved.push({ ...card, blind })
  let gold = ''
  if (s.bank.gold > 0) {
    s.bank.gold--
    player.tokens.gold++
    gold = ' (+1 gold)'
  }
  const what = blind ? `a tier ${tier} card from the deck` : `a tier ${tier} ${GEM_LABEL[card.bonus]} card`
  addLog(s, player.id, `${player.name} reserved ${what}${gold}`)
  return null
}

function buy(s: GameState, player: PlayerState, source: CardSource | undefined): Err | null {
  if (!source) return fail('Invalid card source')
  let card: Card
  let fromReserve = false
  let commit: () => void
  if (source.kind === 'market') {
    if (!isTier(source.tier)) return fail('Invalid tier')
    if (!isSlotIndex(source.index)) return fail('Invalid market slot')
    const tier = source.tier
    const index = source.index
    const slot = s.market[tier][index]
    if (!slot) return fail('That market slot is empty')
    card = slot
    commit = () => {
      s.market[tier][index] = s.decks[tier].pop() ?? null
    }
  } else if (source.kind === 'reserved') {
    const idx = player.reserved.findIndex((c) => c.id === source.cardId)
    if (idx === -1) return fail('That card is not in your reserve')
    const { blind: _blind, ...plain } = player.reserved[idx]
    card = plain
    fromReserve = true
    commit = () => {
      player.reserved.splice(idx, 1)
    }
  } else {
    return fail('Invalid card source')
  }

  const payment = computePayment(player.tokens, bonusesOf(player.cards), card.cost)
  if (!payment) return fail('You cannot afford that card')
  for (const c of TOKEN_COLORS) {
    player.tokens[c] -= payment[c]
    s.bank[c] += payment[c]
  }
  commit()
  player.cards.push(card)
  const pts = card.points > 0 ? ` (+${card.points} pt${card.points === 1 ? '' : 's'})` : ''
  addLog(s, player.id, `${player.name} bought ${fromReserve ? 'a reserved' : 'a'} tier ${card.tier} ${GEM_LABEL[card.bonus]} card${pts}`)
  return null
}

function discard(s: GameState, player: PlayerState, tokens: unknown): Err | null {
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return fail('Invalid tokens')
  const toReturn = emptyTokens()
  for (const [key, value] of Object.entries(tokens as Record<string, unknown>)) {
    if (!(TOKEN_COLORS as readonly string[]).includes(key)) return fail(`Invalid token color: ${key}`)
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return fail('Invalid token amount')
    const color = key as TokenColor
    if (value > player.tokens[color]) return fail(`You don't have ${value} ${color} tokens`)
    toReturn[color] = value
  }
  const excess = tokenTotal(player.tokens) - MAX_TOKENS
  if (tokenTotal(toReturn) !== excess) {
    return fail(`You must return exactly ${excess} token${excess === 1 ? '' : 's'}`)
  }
  for (const c of TOKEN_COLORS) {
    player.tokens[c] -= toReturn[c]
    s.bank[c] += toReturn[c]
  }
  addLog(s, player.id, `${player.name} returned ${describeTokens(toReturn)}`)
  return null
}

/**
 * Server-side escape hatch for an absent player: finish the current player's turn on their behalf.
 * In 'action' phase the turn is simply skipped; excess tokens are returned (most plentiful gems first,
 * gold last) and a pending noble choice picks the first eligible noble. A skip during 'discard' still
 * runs the end-of-turn noble check (the player already acted); a skip in 'action' does not.
 */
export function skipTurn(state: GameState): GameState {
  if (state.status === 'finished') return state
  const s = structuredClone(state)
  const player = s.players[s.currentPlayerIndex]
  let excess = tokenTotal(player.tokens) - MAX_TOKENS
  const returned = emptyTokens()
  while (excess > 0) {
    const color =
      [...GEM_COLORS].filter((c) => player.tokens[c] > 0).sort((a, b) => player.tokens[b] - player.tokens[a])[0] ??
      'gold'
    player.tokens[color]--
    s.bank[color]++
    returned[color]++
    excess--
  }
  if (s.phase === 'chooseNoble' && s.pendingNobleIds.length) awardNoble(s, player, s.pendingNobleIds[0])
  if (s.phase === 'discard') {
    // The player did act this turn, so the end-of-turn noble check still applies (first eligible if several).
    const bonuses = bonusesOf(player.cards)
    const noble = s.nobles.find((n) => meetsNoble(bonuses, n))
    if (noble) awardNoble(s, player, noble.id)
  }
  const back = tokenTotal(returned) > 0 ? ` and returned ${describeTokens(returned)}` : ''
  addLog(s, null, `${player.name}'s turn was skipped (player offline)${back}`)
  endTurn(s, player)
  return s
}

// ---------- end of turn ----------

function checkNobles(s: GameState, player: PlayerState): void {
  const bonuses = bonusesOf(player.cards)
  const eligible = s.nobles.filter((n) => meetsNoble(bonuses, n))
  if (eligible.length === 1) {
    awardNoble(s, player, eligible[0].id)
  } else if (eligible.length > 1) {
    s.phase = 'chooseNoble'
    s.pendingNobleIds = eligible.map((n) => n.id)
    return
  }
  endTurn(s, player)
}

function awardNoble(s: GameState, player: PlayerState, nobleId: string): void {
  const idx = s.nobles.findIndex((n) => n.id === nobleId)
  if (idx === -1) return
  const [noble] = s.nobles.splice(idx, 1)
  player.nobles.push(noble)
  addLog(s, player.id, `${player.name} was visited by a noble (+${noble.points})`)
}

function endTurn(s: GameState, player: PlayerState): void {
  s.phase = 'action'
  s.pendingNobleIds = []

  if (!s.finalRound && playerPoints(player) >= s.winningPoints) {
    s.finalRound = true
    addLog(s, null, `${player.name} reached ${playerPoints(player)} points. Final round!`)
  }

  const next = (s.currentPlayerIndex + 1) % s.players.length
  s.turn++
  s.currentPlayerIndex = next

  if (s.finalRound && next === 0) finishGame(s)
}

function finishGame(s: GameState): void {
  s.status = 'finished'
  const best = Math.max(...s.players.map(playerPoints))
  let contenders = s.players.filter((p) => playerPoints(p) === best)
  const fewestCards = Math.min(...contenders.map((p) => p.cards.length))
  contenders = contenders.filter((p) => p.cards.length === fewestCards)
  s.winnerIds = contenders.map((p) => p.id)
  const names = joinNames(contenders.map((p) => p.name))
  addLog(
    s,
    null,
    contenders.length === 1
      ? `Game over! ${names} wins with ${best} points`
      : `Game over! ${names} share the victory with ${best} points`,
  )
}

// ---------- per-viewer projection ----------

export function toPublicState(state: GameState, viewerId: string | null): PublicGameState {
  const players: PublicPlayer[] = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    tokens: { ...p.tokens },
    tokenCount: tokenTotal(p.tokens),
    cards: structuredClone(p.cards),
    bonuses: bonusesOf(p.cards),
    points: playerPoints(p),
    // Opponents' blind reserves are masked. The real card id is NOT exposed, since ids map to
    // public card data (ALL_CARDS) and would reveal the card; an opaque per-slot id is used instead.
    reserved: p.reserved.map(
      (c, i): VisibleReserved =>
        c.blind && p.id !== viewerId ? { id: `hidden-${p.id}-${i}`, tier: c.tier, hidden: true } : structuredClone(c),
    ),
    nobles: structuredClone(p.nobles),
  }))
  return {
    winningPoints: state.winningPoints,
    players,
    currentPlayerIndex: state.currentPlayerIndex,
    bank: { ...state.bank },
    deckCounts: { 1: state.decks[1].length, 2: state.decks[2].length, 3: state.decks[3].length },
    market: structuredClone(state.market),
    nobles: structuredClone(state.nobles),
    phase: state.phase,
    pendingNobleIds: [...state.pendingNobleIds],
    finalRound: state.finalRound,
    status: state.status,
    winnerIds: [...state.winnerIds],
    turn: state.turn,
    log: structuredClone(state.log),
  }
}
