import { useMemo, useState } from 'react'
import { GEM_COLORS, MAX_RESERVED, MAX_TOKENS, TOKEN_COLORS } from '../../game/types'
import type { Card, Noble, PublicPlayer, Tier, TokenColor, TokenCounts } from '../../game/types'
import { computePayment, emptyTokens, tokenTotal } from '../../game/helpers'
import { CardBack, DevCard, NobleTile } from './Cards'
import { Chip } from './Gem'
import { Modal } from './Modal'
import { GEM_NAME, ROMAN, cx } from './ui'

function PaymentLine({ me, card }: { me: PublicPlayer; card: Card }) {
  const pay = computePayment(me.tokens, me.bonuses, card.cost)
  if (!pay) {
    let short = 0
    for (const c of GEM_COLORS) short += Math.max(0, card.cost[c] - me.bonuses[c] - me.tokens[c])
    short -= me.tokens.gold
    return (
      <div className="sp-pay is-short">
        <span className="sp-pay__label">Can't afford</span>
        <span className="sp-pay__note">
          short by {short} gem{short === 1 ? '' : 's'}
        </span>
      </div>
    )
  }
  const spent = TOKEN_COLORS.filter((c) => pay[c] > 0)
  const saved = GEM_COLORS.reduce((s, c) => s + Math.min(card.cost[c], me.bonuses[c]), 0)
  return (
    <div className="sp-pay">
      <span className="sp-pay__label">You pay</span>
      {spent.length === 0 ? (
        <span className="sp-pay__note">nothing — your bonuses cover it</span>
      ) : (
        <span className="sp-pay__chips">
          {spent.map((c) => (
            <span key={c} className="sp-pay__item" title={`${pay[c]} ${GEM_NAME[c]}`}>
              <Chip color={c} size="xs">
                <span className="sp-chip__count">{pay[c]}</span>
              </Chip>
            </span>
          ))}
        </span>
      )}
      {saved > 0 && spent.length > 0 && <span className="sp-pay__note">bonuses save {saved}</span>}
    </div>
  )
}

/** Reserving gains 1 gold (if any left); warn when that pushes the player over the token limit. */
const reserveOverflows = (me: PublicPlayer, bankGold: number) => bankGold > 0 && me.tokenCount + 1 > MAX_TOKENS
const RESERVE_OVERFLOW_HINT = 'You will gain 1 gold and must then return a token.'

export function CardActionModal({
  card,
  me,
  bankGold,
  canReserve,
  pending,
  onBuy,
  onReserve,
  onClose,
  fromReserve,
}: {
  card: Card
  me: PublicPlayer
  bankGold: number
  canReserve: boolean
  pending: boolean
  onBuy: () => void
  onReserve?: () => void
  onClose: () => void
  fromReserve?: boolean
}) {
  const affordable = computePayment(me.tokens, me.bonuses, card.cost) !== null
  const reservedFull = me.reserved.length >= MAX_RESERVED
  const overflow = reserveOverflows(me, bankGold)
  return (
    <Modal
      title={fromReserve ? 'Reserved card' : `Tier ${ROMAN[card.tier]} card`}
      subtitle={`${card.points > 0 ? `${card.points} prestige · ` : ''}${GEM_NAME[card.bonus]} bonus`}
      onClose={onClose}
      className="sp-modal--card"
    >
      <div className="sp-cardmodal">
        <DevCard card={card} size="lg" affordable={affordable} />
        <div className="sp-cardmodal__actions">
          <PaymentLine me={me} card={card} />
          <button type="button" className="btn btn-primary" disabled={!affordable || pending} onClick={onBuy} autoFocus={affordable}>
            Buy card
          </button>
          {onReserve && (
            <>
              <button type="button" className="btn" disabled={!canReserve || pending} onClick={onReserve}>
                Reserve{bankGold > 0 ? ' · +1 gold' : ''}
              </button>
              <p className="sp-hint">
                {reservedFull
                  ? `You already hold ${MAX_RESERVED} reserved cards.`
                  : bankGold > 0
                    ? overflow
                      ? RESERVE_OVERFLOW_HINT
                      : 'Hold it for later and gain 1 gold (wild).'
                    : 'No gold left in the bank — you will gain none.'}
              </p>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

export function DeckModal({
  tier,
  count,
  me,
  bankGold,
  pending,
  onReserve,
  onClose,
}: {
  tier: Tier
  count: number
  me: PublicPlayer
  bankGold: number
  pending: boolean
  onReserve: () => void
  onClose: () => void
}) {
  const full = me.reserved.length >= MAX_RESERVED
  const overflow = reserveOverflows(me, bankGold)
  return (
    <Modal
      title={`Tier ${ROMAN[tier]} deck`}
      subtitle={`${count} card${count === 1 ? '' : 's'} remaining`}
      onClose={onClose}
      className="sp-modal--card"
    >
      <div className="sp-cardmodal">
        <CardBack tier={tier} size="lg" />
        <div className="sp-cardmodal__actions">
          <p className="sp-hint">Reserve the top card without looking at it first. Your opponents will only see its tier.</p>
          <button type="button" className="btn btn-primary" disabled={full || count === 0 || pending} onClick={onReserve} autoFocus>
            Reserve blind{bankGold > 0 ? ' · +1 gold' : ''}
          </button>
          {full && <p className="sp-hint sp-warn">You already hold {MAX_RESERVED} reserved cards.</p>}
          {!full && overflow && <p className="sp-hint">{RESERVE_OVERFLOW_HINT}</p>}
        </div>
      </div>
    </Modal>
  )
}

export function DiscardModal({
  me,
  pending,
  onConfirm,
}: {
  me: PublicPlayer
  pending: boolean
  onConfirm: (tokens: Partial<TokenCounts>) => void
}) {
  const [ret, setRet] = useState<TokenCounts>(emptyTokens)
  const excess = Math.max(0, me.tokenCount - MAX_TOKENS)
  const returning = tokenTotal(ret)
  const remaining = excess - returning
  const payload = useMemo(() => {
    const out: Partial<TokenCounts> = {}
    for (const c of TOKEN_COLORS) if (ret[c] > 0) out[c] = ret[c]
    return out
  }, [ret])

  const add = (c: TokenColor) => {
    if (remaining <= 0 || me.tokens[c] - ret[c] <= 0) return
    setRet((r) => ({ ...r, [c]: r[c] + 1 }))
  }
  const remove = (c: TokenColor) => {
    if (ret[c] <= 0) return
    setRet((r) => ({ ...r, [c]: r[c] - 1 }))
  }

  return (
    <Modal
      title="Return tokens"
      subtitle={`You may hold at most ${MAX_TOKENS} tokens. Choose ${excess} to return to the bank.`}
      className="sp-modal--discard"
      footer={
        <>
          <span className={cx('sp-counter', remaining === 0 && 'is-done')}>
            {remaining > 0 ? `Return ${remaining} more` : 'Ready'} · holding {me.tokenCount - returning}/{MAX_TOKENS}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRet(emptyTokens())} disabled={returning === 0 || pending}>
            Reset
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={remaining !== 0 || pending}
            onClick={() => onConfirm(payload)}
          >
            Return tokens
          </button>
        </>
      }
    >
      <p className="sp-mini-label">Your tokens — click to return</p>
      <div className="sp-discard__row">
        {TOKEN_COLORS.map((c) => {
          const left = me.tokens[c] - ret[c]
          return (
            <button
              key={c}
              type="button"
              className="sp-chipbtn sp-discard__pick"
              onClick={() => add(c)}
              disabled={left <= 0 || remaining <= 0 || pending}
              aria-label={`Return one ${GEM_NAME[c]} (${left} held)`}
            >
              <Chip color={c} size="md" className={cx(left === 0 && 'is-zero')} />
              <span className="sp-discard__n">{left}</span>
            </button>
          )
        })}
      </div>
      <p className="sp-mini-label">Returning — click to keep</p>
      <div className="sp-discard__tray">
        {returning === 0 && <span className="sp-none">Nothing selected</span>}
        {TOKEN_COLORS.flatMap((c) =>
          Array.from({ length: ret[c] }, (_, i) => (
            <button
              key={`${c}${i}`}
              type="button"
              className="sp-chipbtn sp-lift"
              onClick={() => remove(c)}
              disabled={pending}
              aria-label={`Keep one ${GEM_NAME[c]}`}
            >
              <Chip color={c} size="sm" />
            </button>
          )),
        )}
      </div>
    </Modal>
  )
}

export function NobleChoiceModal({
  nobles,
  pending,
  onChoose,
}: {
  nobles: Noble[]
  pending: boolean
  onChoose: (nobleId: string) => void
}) {
  return (
    <Modal
      title="A noble visit"
      subtitle="Several nobles admire your collection. Only one may visit you this turn — choose your patron."
      className="sp-modal--nobles"
    >
      <div className="sp-noblechoice">
        {nobles.map((n) => (
          <NobleTile key={n.id} noble={n} size="lg" onClick={() => onChoose(n.id)} disabled={pending} className="sp-noble--choice" />
        ))}
      </div>
    </Modal>
  )
}

export function ConfirmLeaveModal({ onLeave, onClose }: { onLeave: () => void; onClose: () => void }) {
  return (
    <Modal
      title="Leave the table?"
      subtitle="The game is still in progress. Your seat will sit empty while you are away."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} autoFocus>
            Stay
          </button>
          <button type="button" className="btn btn-primary" onClick={onLeave}>
            Leave
          </button>
        </>
      }
    />
  )
}
