import { Bell, BellOff, CircleAlert, Crown, Sparkle, X } from 'lucide-react'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, JSX } from 'react'
import { GEM_COLORS, MAX_RESERVED, MAX_TOKENS, isHiddenCard } from '../../game/types'
import type {
  Card,
  GameAction,
  GemColor,
  PublicGameState,
  ReservedCard,
  Tier,
  TokenColor,
  TokenCounts,
} from '../../game/types'
import { canAfford, hasLegalMove } from '../../game/helpers'
import { CardActionModal, ConfirmLeaveModal, DeckModal, DiscardModal, NobleChoiceModal } from './ActionModals'
import { Bank, SelectionTray } from './Bank'
import { CardBack, DevCard, EmptySlot, NobleTile } from './Cards'
import { LazyTableBoard3D } from './lazy3d'
import { SideFeed } from './ChatPanel'
import type { ChatFeed } from './ChatPanel'
import { GameOver } from './GameOver'
import { LogText } from './LogText'
import { MyBar, OpponentPanel, YourArea } from './PlayerPanels'
import { RulesPanel } from './RulesPanel'
import { GEM_NAME, GEM_PLURAL, ROMAN, avatarColor, cx, phaseVerb } from './ui'
import { useTurnAlert } from './useTurnAlert'

export interface GameBoardProps {
  state: PublicGameState
  youId: string | null // null = spectator
  connected: Record<string, boolean> // playerId -> online
  onAction: (action: GameAction) => Promise<{ ok: boolean; error?: string }>
  isHost: boolean
  onPlayAgain: () => void // host-only, shown on game-over screen
  onLeave: () => void
  colorIndex?: Record<string, number> // playerId -> stable avatar color index (join order)
  currentSkipAt?: number | null // current player is offline: when their turn becomes skippable (epoch ms)
  chat?: ChatFeed // room chat (members only)
}

type Target =
  | { kind: 'market'; tier: Tier; index: number; card: Card }
  | { kind: 'deck'; tier: Tier }
  | { kind: 'reserved'; card: ReservedCard; ownerId?: string } // ownerId: a rival's visible reserved card

const TIER_ORDER: Tier[] = [3, 2, 1]
const FLASH_MS = 2000 // how long a rival's panel and a refilled market slot stay highlighted
const PHONE_MQ = '(max-width: 760px)' // keep in sync with the phone breakpoint in game.css
const USER_SCROLL_QUIET_MS = 1000 // don't auto-scroll if the user touched the scroll this recently

async function flyCardIntoCollection(card: Card, source: HTMLElement | null): Promise<void> {
  if (!source || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const sourceRect = source.getBoundingClientRect()
  const movingCard = source.cloneNode(true) as HTMLElement
  movingCard.classList.remove('sp-deal', 'sp-fresh')
  movingCard.setAttribute('aria-hidden', 'true')
  Object.assign(movingCard.style, {
    position: 'fixed', left: `${sourceRect.left}px`, top: `${sourceRect.top}px`,
    width: `${sourceRect.width}px`, height: `${sourceRect.height}px`, margin: '0', zIndex: '10000',
    pointerEvents: 'none', transformOrigin: 'center center', willChange: 'left, top, width, height, transform',
  })
  document.body.append(movingCard)
  const findDestination = () => Array.from(document.querySelectorAll<HTMLElement>('.sp-you__collection .sp-card[data-card-id]'))
    .find((element) => element.dataset.cardId === card.id) ?? null
  let destination = findDestination()
  const waitStarted = performance.now()
  while (!destination && performance.now() - waitStarted < 1400) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    destination = findDestination()
  }
  if (!destination) {
    movingCard.remove()
    return
  }
  const destRect = destination.getBoundingClientRect()
  const animation = movingCard.animate([
    { left: `${sourceRect.left}px`, top: `${sourceRect.top}px`, width: `${sourceRect.width}px`, height: `${sourceRect.height}px`, transform: 'perspective(900px) rotateY(0deg) rotateZ(0deg)', opacity: 1, offset: 0 },
    { left: `${(sourceRect.left + destRect.left) / 2}px`, top: `${(sourceRect.top + destRect.top) / 2 - 78}px`, width: `${(sourceRect.width + destRect.width) / 2}px`, height: `${(sourceRect.height + destRect.height) / 2}px`, transform: 'perspective(900px) rotateY(22deg) rotateZ(-7deg)', opacity: 1, offset: 0.58 },
    { left: `${destRect.left}px`, top: `${destRect.top}px`, width: `${destRect.width}px`, height: `${destRect.height}px`, transform: 'perspective(900px) rotateY(0deg) rotateZ(0deg)', opacity: 0.25, offset: 1 },
  ], { duration: 760, easing: 'cubic-bezier(.2,.72,.22,1)', fill: 'forwards' })
  try { await animation.finished } catch { /* interrupted by navigation */ }
  movingCard.remove()
  destination.animate([{ transform: 'translateY(5px) scale(.92)', filter: 'brightness(1.7)' }, { transform: 'translateY(0) scale(1)', filter: 'brightness(1)' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' })
}

/** "Offline — skip available in Ns", then "Offline — you can skip their turn" (members only; spectators can't skip).
 *  Ticks once a second while counting down. Null when the current player isn't offline. */
function useOfflineStatus(skipAt: number | null, canSkip: boolean): string | null {
  // Stores whole seconds (not a timestamp): a tick that lands on the same second returns the previous
  // state, so React skips the re-render and the board updates once a second instead of four times.
  const [tick, setTick] = useState<{ at: number | null; left: number }>({ at: null, left: 0 })
  useEffect(() => {
    if (skipAt === null) return
    const update = () => {
      const left = secondsLeft(skipAt)
      setTick((prev) => (prev.at === skipAt && prev.left === left ? prev : { at: skipAt, left }))
      return left
    }
    if (update() <= 0) return
    const id = window.setInterval(() => {
      if (update() <= 0) window.clearInterval(id)
    }, 250) // finer than 1s so the displayed second never lags
    return () => window.clearInterval(id)
  }, [skipAt])
  if (skipAt === null) return null
  if (!canSkip) return 'Offline'
  // Before the effect has synced to a new skipAt, compute directly rather than show a stale value.
  const left = tick.at === skipAt ? tick.left : secondsLeft(skipAt)
  return left > 0 ? `Offline — skip available in ${left}s` : 'Offline — you can skip their turn'
}

function secondsLeft(at: number): number {
  return Math.max(0, Math.ceil((at - Date.now()) / 1000))
}

/** Next token selection after clicking a bank pile, plus an optional explanatory hint. */
function nextSelection(sel: GemColor[], color: GemColor, bank: TokenCounts): { sel: GemColor[]; hint?: string } {
  const isDouble = sel.length === 2 && sel[0] === sel[1]
  if (sel.includes(color)) {
    if (isDouble) return { sel: [] }
    if (sel.length === 1) {
      if (bank[color] >= 4) return { sel: [color, color] }
      return { sel: [], hint: `Taking two ${GEM_PLURAL[color]} needs at least 4 in the pile.` }
    }
    return { sel: sel.filter((c) => c !== color) }
  }
  if (bank[color] <= 0) return { sel, hint: `The ${GEM_NAME[color]} pile is empty.` }
  if (isDouble) return { sel: [sel[0], color] }
  if (sel.length >= 3) return { sel, hint: 'At most 3 different gems per turn.' }
  return { sel: [...sel, color] }
}

export function GameBoard({
  state,
  youId,
  connected,
  onAction,
  isHost,
  onPlayAgain,
  onLeave,
  colorIndex,
  currentSkipAt = null,
  chat,
}: GameBoardProps): JSX.Element {
  const meIndex = youId ? state.players.findIndex((p) => p.id === youId) : -1
  const me = meIndex >= 0 ? state.players[meIndex] : null
  const current = state.players[state.currentPlayerIndex] ?? null
  const playing = state.status === 'playing'
  const isMyTurn = playing && !!me && current?.id === me.id
  const canAct = isMyTurn && state.phase === 'action'
  const { soundOn, toggleSound } = useTurnAlert(isMyTurn)
  const offlineStatus = useOfflineStatus(playing && !isMyTurn ? currentSkipAt : null, !!me)

  const [selection, setSelectionState] = useState<GemColor[]>([])
  // mirror in a ref so rapid clicks never compute from a stale selection
  const selectionRef = useRef<GemColor[]>([])
  const setSelection = useCallback((next: GemColor[] | ((s: GemColor[]) => GemColor[])) => {
    const value = typeof next === 'function' ? next(selectionRef.current) : next
    selectionRef.current = value
    setSelectionState(value)
  }, [])
  const [hint, setHint] = useState<string | null>(null)
  const [target, setTarget] = useState<Target | null>(null)
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const [toast, setToast] = useState<{ id: number; message: string; kind?: 'noble' } | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [tutorialStep, setTutorialStep] = useState<number>(() => {
    try { return localStorage.getItem('splendor-tutorial-done') ? -1 : 0 } catch { return -1 }
  })
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [resultsHidden, setResultsHidden] = useState(false)

  // ---------- what just happened ----------
  const lastLogId = state.log.length ? state.log[state.log.length - 1].id : 0
  const lastRivalMove = useMemo(() => {
    for (let i = state.log.length - 1; i >= 0; i--) {
      const e = state.log[i]
      if (e.playerId && e.playerId !== youId) return e
    }
    return null
  }, [state.log, youId])
  const [flashPlayerId, setFlashPlayerId] = useState<string | null>(null)
  const [freshCardIds, setFreshCardIds] = useState<ReadonlySet<string>>(() => new Set())
  const seenLogId = useRef<number | null>(null)
  const seenMarket = useRef<Set<string> | null>(null)
  const marketKey = TIER_ORDER.map((t) => state.market[t].map((c) => c?.id ?? '-').join(',')).join('|')

  // Briefly highlight the rival who just acted; congratulate me on a noble visit.
  useEffect(() => {
    const prev = seenLogId.current
    seenLogId.current = lastLogId
    if (prev === null) return // first render: nothing "just happened"
    const visit = state.log.find((e) => e.id > prev && youId && e.playerId === youId && / visited by a noble/.test(e.message))
    if (visit) {
      const pts = /\(\+(\d+)\)/.exec(visit.message)?.[1] ?? '3'
      setToast({ id: Date.now(), message: `A noble visits you! +${pts} prestige`, kind: 'noble' })
    }
    const actor = [...state.log].reverse().find((e) => e.id > prev && e.playerId && e.playerId !== youId)
    // (a re-run cancels the previous timer, so always settle the highlight here)
    setFlashPlayerId(actor?.playerId ?? null)
    if (!actor) return
    const t = window.setTimeout(() => setFlashPlayerId(null), FLASH_MS)
    return () => window.clearTimeout(t)
  }, [lastLogId]) // keyed on the newest entry only

  // Briefly highlight market slots that were just refilled.
  useEffect(() => {
    const ids = new Set(TIER_ORDER.flatMap((t) => state.market[t].flatMap((c) => (c ? [c.id] : []))))
    const prev = seenMarket.current
    seenMarket.current = ids
    if (!prev) return
    const fresh = new Set([...ids].filter((id) => !prev.has(id)))
    setFreshCardIds(fresh)
    if (fresh.size === 0) return
    const t = window.setTimeout(() => setFreshCardIds(new Set()), FLASH_MS)
    return () => window.clearTimeout(t)
  }, [marketKey]) // marketKey captures the market contents

  // Reset transient UI whenever the turn or phase moves on.
  useEffect(() => {
    setSelection([])
    setHint(null)
    setTarget(null)
  }, [state.turn, state.currentPlayerIndex, state.phase, state.status, setSelection])

  useEffect(() => {
    if (state.status === 'playing') setResultsHidden(false)
    else setRulesOpen(false) // results screen takes over; avoid stacked overlays
  }, [state.status])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), 6000)
    return () => window.clearTimeout(t)
  }, [toast])

  const showError = useCallback((message: string) => setToast({ id: Date.now(), message }), [])

  const run = useCallback(
    async (action: GameAction): Promise<boolean> => {
      if (pendingRef.current) return false
      pendingRef.current = true
      setPending(true)
      try {
        const res = await onAction(action)
        if (!res.ok) {
          showError(res.error ?? 'That move was not allowed.')
          return false
        }
        setToast((t) => (t?.kind === 'noble' ? t : null)) // clear errors, keep good news
        return true
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Could not reach the server.')
        return false
      } finally {
        pendingRef.current = false
        setPending(false)
      }
    },
    [onAction, showError],
  )

  // ---------- token selection ----------
  const availableColors = GEM_COLORS.filter((c) => state.bank[c] > 0).length
  const isDouble = selection.length === 2 && selection[0] === selection[1]
  // Engine rule: exactly 3 different colors, or all remaining colors when fewer than 3 are left.
  const requiredDifferent = Math.min(3, availableColors)
  const canConfirmTake = canAct && (isDouble || (requiredDifferent > 0 && selection.length === requiredDifferent))
  const stuck =
    canAct &&
    !!me &&
    !hasLegalMove({
      bank: state.bank,
      market: state.market,
      deckCounts: state.deckCounts,
      tokens: me.tokens,
      bonuses: me.bonuses,
      reserved: me.reserved.filter((c): c is ReservedCard => !isHiddenCard(c)),
    })

  const pickBank = (c: TokenColor) => {
    if (!canAct || pending) return
    if (c === 'gold') {
      setHint('Gold can only be gained by reserving a card.')
      return
    }
    const next = nextSelection(selectionRef.current, c, state.bank)
    setSelection(next.sel)
    setHint(next.hint ?? null)
  }

  const confirmTake = async () => {
    if (!canConfirmTake) return
    const action: GameAction = isDouble
      ? { type: 'takeTwo', color: selection[0] }
      : { type: 'takeDifferent', colors: [...selection] }
    if (await run(action)) setSelection([])
  }

  let trayHint: string
  if (hint) trayHint = hint
  else if (selection.length === 0)
    trayHint =
      availableColors >= 3
        ? 'Take 3 different gems, or click a pile twice for 2 of a kind (pile of 4+).'
        : requiredDifferent === 0
          ? 'The bank has no gems left.'
          : `Only ${requiredDifferent} color${requiredDifferent === 1 ? '' : 's'} left — take one of each.`
  else if (isDouble) trayHint = `Two ${GEM_PLURAL[selection[0]]}.`
  else if (canConfirmTake) trayHint = 'Ready — press Take gems.'
  else if (selection.length === 1 && state.bank[selection[0]] >= 4)
    trayHint = `Add ${requiredDifferent - selection.length} more color${requiredDifferent - selection.length === 1 ? '' : 's'}, or click ${GEM_NAME[selection[0]]} again for two.`
  else trayHint = `Pick ${requiredDifferent - selection.length} more color${requiredDifferent - selection.length === 1 ? '' : 's'}.`
  if (me && selection.length > 0 && me.tokenCount + selection.length > MAX_TOKENS) {
    const over = me.tokenCount + selection.length - MAX_TOKENS
    trayHint += ` You'll return ${over} token${over === 1 ? '' : 's'} after.`
  }

  // ---------- card actions ----------
  const canReserve = !!me && me.reserved.length < MAX_RESERVED

  const closeTarget = useCallback(() => setTarget(null), [])

  // Card modals open off-turn too, but only as a look-only view.
  const readOnlyReason = canAct ? undefined : isMyTurn ? 'Finish your turn first.' : 'Not your turn — you can look, but not buy or reserve.'

  const doBuy = async () => {
    if (!canAct || !target || target.kind === 'deck' || (target.kind === 'reserved' && target.ownerId)) return
    const cardToBuy = target.card
    const sourceSelector = target.kind === 'market' ? '.sp-table' : '.sp-you__reserved'
    const source = Array.from(document.querySelectorAll<HTMLElement>(`${sourceSelector} .sp-card[data-card-id]`))
      .find((element) => element.dataset.cardId === cardToBuy.id) ?? null
    const ok = await run({
      type: 'buy',
      source:
        target.kind === 'market'
          ? { kind: 'market', tier: target.tier, index: target.index }
          : { kind: 'reserved', cardId: target.card.id },
    })
    if (ok) {
      setTarget(null)
      setSelection([])
      void flyCardIntoCollection(cardToBuy, source)
    }
  }

  const doReserve = async () => {
    if (!canAct || !target || target.kind === 'reserved') return
    const ok = await run({
      type: 'reserve',
      source: target.kind === 'market' ? { kind: 'market', tier: target.tier, index: target.index } : { kind: 'deck', tier: target.tier },
    })
    if (ok) {
      setTarget(null)
      setSelection([])
    }
  }

  // ---------- derived ----------
  const opponents = state.players.map((p, i) => ({ p, i })).filter(({ p }) => p.id !== youId)
  const pendingNobles = state.nobles.filter((n) => state.pendingNobleIds.includes(n.id))
  // Final round: who triggered it (from the engine's log line) and whose turns remain before the game ends.
  const finalTrigger = useMemo(() => {
    if (!state.finalRound) return null
    for (let i = state.log.length - 1; i >= 0; i--) {
      const m = /^(.+) reached (\d+) points\. Final round!$/.exec(state.log[i].message)
      if (m && state.log[i].playerId === null) return { name: m[1], points: m[2] }
    }
    return null
  }, [state.finalRound, state.log])
  const turnsLeft = state.players.slice(state.currentPlayerIndex)
  // After the game ends turn is a multiple of the player count, so don't count a round that never started.
  const round = state.players.length
    ? Math.floor(Math.max(0, state.turn - (playing ? 0 : 1)) / state.players.length) + 1
    : 1

  const discardNeeded = isMyTurn && state.phase === 'discard' && me
  const nobleNeeded = isMyTurn && state.phase === 'chooseNoble'
  const overlayOpen =
    rulesOpen ||
    confirmLeave ||
    (!!me && target !== null) ||
    !!discardNeeded ||
    (nobleNeeded && pendingNobles.length > 0) ||
    (state.status === 'finished' && !resultsHidden)

  const tutorialSteps = [
    { selector: '.sp-market', title: 'The card market', body: 'Choose a face-up card to buy, or reserve it for later. The gem icons show its cost; your permanent bonuses reduce that cost.' },
    { selector: '.sp-bankcol', title: 'Collect gems', body: 'Take up to three different gems, or two of one color when at least four remain in the bank.' },
    { selector: '.sp-nobles', title: 'Earn noble visits', body: 'Build the matching color bonuses to attract a noble. Each noble is worth 3 points.' },
    { selector: '.sp-you', title: 'Your collection', body: `Purchased cards give permanent discounts. Reach ${state.winningPoints} points to trigger the final round.` },
  ]
  useEffect(() => {
    document.querySelectorAll('.sp-tutorial-focus').forEach((el) => el.classList.remove('sp-tutorial-focus'))
    if (tutorialStep < 0) return
    const target = document.querySelector(tutorialSteps[tutorialStep]?.selector ?? '')
    target?.classList.add('sp-tutorial-focus')
    target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center', inline: 'nearest' })
    return () => target?.classList.remove('sp-tutorial-focus')
  }, [tutorialStep, state.winningPoints])
  const closeTutorial = () => {
    setTutorialStep(-1)
    try { localStorage.setItem('splendor-tutorial-done', '1') } catch { /* storage may be disabled */ }
  }

  // Phone: when my turn starts, bring the table (market, bank, tray) into view under the sticky top bar —
  // unless an overlay is up or the user is scrolling themselves.
  const tableRef = useRef<HTMLElement>(null)
  const lastUserScroll = useRef(0)
  const wasMyTurn = useRef(isMyTurn)
  const overlayRef = useRef(false)
  overlayRef.current = rulesOpen || confirmLeave // card modals close by themselves when the turn changes
  useEffect(() => {
    const mark = () => {
      lastUserScroll.current = Date.now()
    }
    const opts = { passive: true } as const
    window.addEventListener('touchstart', mark, opts)
    window.addEventListener('touchmove', mark, opts)
    window.addEventListener('wheel', mark, opts)
    return () => {
      window.removeEventListener('touchstart', mark)
      window.removeEventListener('touchmove', mark)
      window.removeEventListener('wheel', mark)
    }
  }, [])
  useEffect(() => {
    const started = isMyTurn && !wasMyTurn.current
    wasMyTurn.current = isMyTurn
    const table = tableRef.current
    if (!started || !table || overlayRef.current || !window.matchMedia(PHONE_MQ).matches) return
    if (Date.now() - lastUserScroll.current < USER_SCROLL_QUIET_MS) return
    const barH = document.querySelector('.sp-topbar')?.getBoundingClientRect().height ?? 0
    const delta = table.getBoundingClientRect().top - barH - 8
    if (Math.abs(delta) < 24) return // already in place
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: window.scrollY + delta, behavior: reduce ? 'auto' : 'smooth' })
  }, [isMyTurn])

  useEffect(() => {
    if (!rulesOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setRulesOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rulesOpen])

  // Idle tray text follows the phase, so nothing extra appears below the table mid-turn.
  let idleText: string
  if (isMyTurn) idleText = state.phase === 'discard' ? 'Return tokens to finish your turn…' : 'Choose a noble to finish your turn…'
  else if (!current) idleText = 'Waiting for the next player…'
  else if (state.phase === 'action') idleText = `Waiting for ${current.name}…`
  else idleText = `${current.name} ${phaseVerb(state.phase)}`

  let turnText: string
  let turnSub: string | null = null
  if (!playing) turnText = 'Game over'
  else if (isMyTurn) {
    turnText = 'Your turn'
    turnSub =
      state.phase === 'discard' ? 'Return tokens' : state.phase === 'chooseNoble' ? 'Choose a noble' : 'Take an action'
  } else if (current) {
    turnText = `Waiting for ${current.name}`
    if (offlineStatus) turnSub = offlineStatus
    else if (state.phase !== 'action') turnSub = `${current.name} ${phaseVerb(state.phase)}`
  } else turnText = 'Waiting…'

  return (
    <div className={cx('sp-game', isMyTurn && 'is-my-turn', !me && 'is-spectator', me && playing && 'has-mybar')}>
      {/* ---------- top bar ---------- */}
      <header className="sp-topbar">
        <div className="sp-topbar__brand">
          <span className="sp-brand">Splendor</span>
          <span className="sp-round">
            Round {round}
            {!me && <span className="badge">Spectating</span>}
          </span>
        </div>

        <div className="sp-turnbox">
          <div className={cx('sp-turn', isMyTurn && 'is-you', !playing && 'is-over', !!offlineStatus && 'is-away')} aria-live="polite">
            <span className="sp-turn__dot" aria-hidden="true" />
            <span className="sp-turn__text">{turnText}</span>
            {turnSub && <span className="sp-turn__sub">{turnSub}</span>}
          </div>
          {playing && (
            // Always rendered while playing (empty at first) so the bar doesn't shift on the first move.
            <p className="sp-lastmove" aria-live="polite">
              {lastRivalMove ? (
                <span key={lastRivalMove.id} className="sp-lastmove__inner">
                  <span
                    className="sp-lastmove__mark"
                    style={{ background: avatarColor(colorIndex?.[lastRivalMove.playerId ?? ''] ?? state.players.findIndex((p) => p.id === lastRivalMove.playerId)) }}
                    aria-hidden="true"
                  />
                  <span className="sp-ellipsis">
                    <LogText message={lastRivalMove.message} names={state.players.map((p) => p.name)} />
                  </span>
                </span>
              ) : (
                '\u00a0'
              )}
            </p>
          )}
        </div>

        <div className="sp-topbar__actions">
          {me && (
            <button
              type="button"
              className={cx('sp-iconbtn sp-soundbtn', !soundOn && 'is-off')}
              onClick={toggleSound}
              aria-pressed={soundOn}
              aria-label="Chime when it's your turn"
              title={soundOn ? 'Turn chime on — click to mute' : 'Turn chime muted — click to turn on'}
            >
              {soundOn ? <Bell size={16} aria-hidden="true" /> : <BellOff size={16} aria-hidden="true" />}
            </button>
          )}
          <button
            type="button"
            className={cx('btn btn-sm', rulesOpen ? 'btn-primary' : 'btn-ghost')}
            onClick={() => setRulesOpen((o) => !o)}
            aria-expanded={rulesOpen}
            aria-controls="sp-rules-drawer"
          >
            Rules
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setTutorialStep(0)}>Tour</button>
          <button type="button" className="btn btn-sm" onClick={() => (playing && me ? setConfirmLeave(true) : onLeave())}>
            Leave
          </button>
        </div>
      </header>

      {state.finalRound && playing && (
        // Zero-height slot: the banner floats over the gap below the top bar, so nothing shifts when it appears.
        <div className="sp-final-slot">
          <div className="sp-final" role="status">
            <span className="sp-final__ornament" aria-hidden="true">
              <Sparkle size="1em" aria-hidden="true" />
            </span>
            <span className="sp-ellipsis">
              <strong>Final round</strong> —{' '}
              {finalTrigger
                ? `${me && finalTrigger.name === me.name ? 'You' : finalTrigger.name} reached ${finalTrigger.points}`
                : `a merchant reached ${state.winningPoints}`}
              <span className="sp-final__pts"> prestige</span>
              {' · '}
              {turnsLeft.length === 1 ? 'last turn' : `${turnsLeft.length} turns left`}
              <span className="sp-final__who">
                {': '}
                {turnsLeft.map((p) => (p.id === youId ? 'you' : p.name)).join(', then ')}
              </span>
            </span>
            <span className="sp-final__ornament" aria-hidden="true">
              <Sparkle size="1em" aria-hidden="true" />
            </span>
          </div>
        </div>
      )}

      <div className="sp-main" inert={overlayOpen}>
        <div className="sp-left">
          {/* ---------- table ---------- */}
          {/* 5–6 players deal 6–7 nobles: on desktop they stand in two columns (see game.css). */}
          <section
            className={cx('sp-table', state.players.length >= 5 && 'sp-table--many-nobles')}
            aria-label="Table"
            ref={tableRef}
          >
            <Suspense fallback={null}>
              <LazyTableBoard3D />
            </Suspense>
            <div className="sp-nobles" aria-label="Nobles">
              {state.nobles.map((n) => (
                <NobleTile
                  key={n.id}
                  noble={n}
                  size="md"
                  highlight={nobleNeeded && state.pendingNobleIds.includes(n.id)}
                  progress={me && playing ? me.bonuses : undefined}
                />
              ))}
              {state.nobles.length === 0 && <span className="sp-none">All nobles have found patrons.</span>}
            </div>

            <div className="sp-table__grid">
              <div className="sp-market">
                {TIER_ORDER.map((tier) => (
                  <div key={tier} className={cx('sp-tier-row', `sp-tier-${tier}`)} aria-label={`Tier ${ROMAN[tier]}`}>
                    <CardBack
                      tier={tier}
                      deck
                      count={state.deckCounts[tier]}
                      onClick={canAct && state.deckCounts[tier] > 0 ? () => setTarget({ kind: 'deck', tier }) : undefined}
                      disabled={pending}
                    />
                    {state.market[tier].map((card, index) =>
                      card ? (
                        <DevCard
                          key={card.id}
                          card={card}
                          deal
                          className={freshCardIds.has(card.id) ? 'sp-fresh' : undefined}
                          style={{ '--i': index } as CSSProperties}
                          affordable={!!me && playing && canAfford(me.tokens, me.bonuses, card.cost)}
                          onClick={me && playing ? () => setTarget({ kind: 'market', tier, index, card }) : undefined}
                          disabled={pending}
                        />
                      ) : (
                        <EmptySlot key={`empty-${index}`} />
                      ),
                    )}
                  </div>
                ))}
              </div>

              <div className="sp-bankcol">
                <Bank bank={state.bank} selection={selection} interactive={canAct} pending={pending} onPick={pickBank} />
              </div>
            </div>

            {stuck && (
              <div className="sp-stuck" role="status">
                <span>No legal move: the bank is out of gems, you can't reserve and nothing is affordable.</span>
                <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => void run({ type: 'pass' })}>
                  Pass turn
                </button>
              </div>
            )}
            {me && playing && !canAct && (
              // Keeps the table the same height between turns so the layout doesn't jump.
              <div className="sp-tray sp-tray--idle" aria-hidden="true">
                <span className="sp-tray__placeholder">{idleText}</span>
              </div>
            )}
            {canAct && !stuck && (
              <SelectionTray
                selection={selection}
                canConfirm={canConfirmTake}
                pending={pending}
                hint={trayHint}
                onUnpick={(i) => {
                  setSelection((s) => s.filter((_, k) => k !== i))
                  setHint(null)
                }}
                onConfirm={confirmTake}
                onClear={() => {
                  setSelection([])
                  setHint(null)
                }}
              />
            )}
          </section>

          {me && (
            <YourArea
              player={me}
              index={colorIndex?.[me.id] ?? meIndex}
              online={connected[me.id] ?? true}
              isTurn={isMyTurn}
              playing={playing}
              pending={pending}
              onReservedClick={(card) => setTarget({ kind: 'reserved', card })}
            />
          )}
        </div>

        <aside className="sp-side">
          <section className="sp-opps" aria-label={me ? 'Opponents' : 'Players'}>
            <h3 className="sp-section-title">{me ? 'Rivals' : 'Merchants'}</h3>
            <div className="sp-opps__list">
              {opponents.map(({ p, i }) => (
                <OpponentPanel
                  key={p.id}
                  player={p}
                  index={colorIndex?.[p.id] ?? i}
                  online={!!connected[p.id]}
                  isTurn={playing && i === state.currentPlayerIndex}
                  phase={state.phase}
                  statusOverride={offlineStatus ?? undefined}
                  flash={flashPlayerId === p.id}
                  onReservedClick={me && playing ? (card) => setTarget({ kind: 'reserved', card, ownerId: p.id }) : undefined}
                />
              ))}
            </div>
          </section>
          <SideFeed log={state.log} players={state.players} colorIndex={colorIndex} youId={youId} chat={chat} />
        </aside>
      </div>

      {tutorialStep >= 0 && (
        <aside className="sp-tutorial" role="dialog" aria-modal="false" aria-labelledby="sp-tutorial-title">
          <div className="sp-tutorial__progress">Game tour · {tutorialStep + 1} of {tutorialSteps.length}</div>
          <h2 id="sp-tutorial-title">{tutorialSteps[tutorialStep].title}</h2>
          <p>{tutorialSteps[tutorialStep].body}</p>
          <div className="sp-tutorial__actions">
            <button type="button" className="btn btn-sm btn-ghost" onClick={closeTutorial}>Skip tour</button>
            {tutorialStep > 0 && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setTutorialStep((n) => n - 1)}>Back</button>}
            <button type="button" className="btn btn-sm btn-primary" onClick={() => tutorialStep === tutorialSteps.length - 1 ? closeTutorial() : setTutorialStep((n) => n + 1)}>
              {tutorialStep === tutorialSteps.length - 1 ? 'Done' : 'Next'}
            </button>
          </div>
        </aside>
      )}

      {me && playing && <MyBar player={me} isTurn={isMyTurn} />}

      {/* ---------- drawers, modals, overlays ---------- */}
      <div className={cx('sp-drawer-scrim', rulesOpen && 'is-open')} onClick={() => setRulesOpen(false)} aria-hidden="true" />
      <aside id="sp-rules-drawer" className={cx('sp-drawer', rulesOpen && 'is-open')} aria-label="Rules" aria-hidden={!rulesOpen} inert={!rulesOpen}>
        <header className="sp-drawer__head">
          <h2 className="sp-drawer__title">Rules of Splendor</h2>
          <button type="button" className="sp-iconbtn sp-iconbtn--close" onClick={() => setRulesOpen(false)} aria-label="Close rules"><X size={16} aria-hidden="true" /></button>
        </header>
        <div className="sp-drawer__body">
          <RulesPanel />
        </div>
      </aside>

      {me && target?.kind === 'market' && (
        <CardActionModal
          card={target.card}
          me={me}
          bankGold={state.bank.gold}
          canReserve={canReserve}
          pending={pending}
          onBuy={doBuy}
          onReserve={doReserve}
          onClose={closeTarget}
          readOnly={readOnlyReason}
        />
      )}
      {me && target?.kind === 'reserved' && (
        <CardActionModal
          card={target.card}
          me={me}
          bankGold={state.bank.gold}
          canReserve={false}
          pending={pending}
          onBuy={doBuy}
          onClose={closeTarget}
          fromReserve
          readOnly={readOnlyReason}
          owner={target.ownerId ? state.players.find((p) => p.id === target.ownerId) : undefined}
        />
      )}
      {me && canAct && target?.kind === 'deck' && (
        <DeckModal
          tier={target.tier}
          count={state.deckCounts[target.tier]}
          me={me}
          bankGold={state.bank.gold}
          pending={pending}
          onReserve={doReserve}
          onClose={closeTarget}
        />
      )}
      {discardNeeded && (
        <DiscardModal
          key={`discard-${state.turn}-${me.tokenCount}`}
          me={me}
          pending={pending}
          onConfirm={(tokens) => void run({ type: 'discard', tokens })}
        />
      )}
      {nobleNeeded && pendingNobles.length > 0 && (
        <NobleChoiceModal nobles={pendingNobles} pending={pending} onChoose={(nobleId) => void run({ type: 'chooseNoble', nobleId })} />
      )}
      {confirmLeave && (
        <ConfirmLeaveModal
          onClose={() => setConfirmLeave(false)}
          onLeave={() => {
            setConfirmLeave(false)
            onLeave()
          }}
        />
      )}

      {state.status === 'finished' &&
        (resultsHidden ? (
          <button type="button" className="btn btn-primary sp-results-fab" onClick={() => setResultsHidden(false)}>
            <Crown size="1em" aria-hidden="true" /> Show results
          </button>
        ) : (
          <GameOver
            state={state}
            youId={youId}
            isHost={isHost}
            onPlayAgain={onPlayAgain}
            onLeave={onLeave}
            onViewBoard={() => setResultsHidden(true)}
            colorIndex={colorIndex}
          />
        ))}

      {toast && (
        <div className={cx('sp-toast', toast.kind === 'noble' && 'sp-toast--noble')} role={toast.kind ? 'status' : 'alert'} key={toast.id}>
          <span className="sp-toast__icon" aria-hidden="true">
            {toast.kind === 'noble' ? <Crown size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}
          </span>
          <span className="sp-toast__msg">{toast.message}</span>
          <button type="button" className="sp-iconbtn sp-iconbtn--close" onClick={() => setToast(null)} aria-label="Dismiss"><X size={16} aria-hidden="true" /></button>
        </div>
      )}
    </div>
  )
}
