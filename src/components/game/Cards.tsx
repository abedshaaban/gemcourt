import { Check, Crown } from 'lucide-react'
import { memo } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Card, GemCounts, Noble, Tier } from '../../game/types'
import { GEM_COLORS } from '../../game/types'
import { CardArt } from './CardArt'
import { CostPip, GemIcon, ReqPip, gemsWithCost } from './Gem'
import { GEM_NAME, ROMAN, cx, describeCost } from './ui'

export type CardSize = 'sm' | 'md' | 'lg'

interface Clickable {
  onClick?: () => void
  disabled?: boolean
}

function Shell({
  onClick,
  disabled,
  className,
  label,
  style,
  cardId,
  children,
}: Clickable & { className: string; label: string; style?: CSSProperties; cardId?: string; children: ReactNode }) {
  if (onClick) {
    return (
      <button type="button" className={cx(className, 'is-clickable')} onClick={onClick} disabled={disabled} aria-label={label} title={label} style={style} data-card-id={cardId}>
        {children}
      </button>
    )
  }
  return (
    <div className={className} aria-label={label} title={label} role="img" style={style} data-card-id={cardId}>
      {children}
    </div>
  )
}

export function cardLabel(card: Card, affordable?: boolean): string {
  const pts = card.points > 0 ? `${card.points} point${card.points === 1 ? '' : 's'}, ` : ''
  return `Tier ${ROMAN[card.tier]} card — ${pts}${GEM_NAME[card.bonus]} bonus — costs ${describeCost(card.cost)}${affordable ? ' — affordable' : ''}`
}

/** A face-up development card. */
export function DevCard({
  card,
  size = 'md',
  affordable,
  blind,
  deal,
  onClick,
  disabled,
  className,
  style,
  cardId,
}: Clickable & {
  card: Card
  size?: CardSize
  affordable?: boolean
  /** reserved face-down from a deck (only its owner sees the face) */
  blind?: boolean
  /** play the "dealt" entrance animation (on mount) */
  deal?: boolean
  className?: string
  style?: CSSProperties
  cardId?: string
}) {
  return (
    <Shell
      onClick={onClick}
      disabled={disabled}
      label={cardLabel(card, affordable)}
      style={style}
      cardId={cardId ?? card.id}
      className={cx(
        'sp-card',
        `sp-card--${size}`,
        `sp-tier-${card.tier}`,
        `sp-c-${card.bonus}`,
        affordable && 'is-affordable',
        blind && 'is-blind',
        deal && 'sp-deal',
        className,
      )}
    >
      <span className="sp-card__head">
        <span className="sp-card__points">{card.points > 0 ? card.points : ''}</span>
        <GemIcon color={card.bonus} className="sp-card__bonus" />
      </span>
      <CardArt color={card.bonus} tier={card.tier} cardId={card.id} />
      <span className="sp-card__cost">
        {gemsWithCost(card.cost).map((c) => (
          <CostPip key={c} color={c} n={card.cost[c]} />
        ))}
      </span>
      {blind && (
        <span className="sp-card__blind" title="Reserved blind — hidden from your rivals">
          Blind
        </span>
      )}
      {affordable ? (
        <span className="sp-card__can" aria-hidden="true" title="You can buy this">
          <Check size="1em" aria-hidden="true" />
        </span>
      ) : (
        <span className="sp-card__tier" aria-hidden="true">
          {ROMAN[card.tier]}
        </span>
      )}
    </Shell>
  )
}

/** Face-down card (deck pile or a blind-reserved card). */
export function CardBack({
  tier,
  count,
  size = 'md',
  deck,
  onClick,
  disabled,
  className,
}: Clickable & { tier: Tier; count?: number; size?: CardSize; deck?: boolean; className?: string }) {
  const empty = deck && count === 0
  const label = deck
    ? `Tier ${ROMAN[tier]} deck — ${count ?? 0} card${count === 1 ? '' : 's'} left`
    : `Face-down tier ${ROMAN[tier]} card`
  return (
    <Shell
      onClick={onClick}
      disabled={disabled}
      label={label}
      className={cx(
        'sp-back',
        `sp-back--${size}`,
        `sp-tier-${tier}`,
        deck && 'sp-back--deck',
        deck && (count ?? 0) > 1 && 'is-stacked',
        empty && 'is-empty',
        className,
      )}
    >
      <span className="sp-back__frame">
        <span className="sp-back__numeral">{ROMAN[tier]}</span>
        {deck && <span className="sp-back__title">Splendor</span>}
      </span>
      {deck && (
        <span className="sp-back__count">
          <span key={count} className="sp-bump">
            {count ?? 0}
          </span>
        </span>
      )}
    </Shell>
  )
}

export function EmptySlot({ size = 'md' }: { size?: CardSize }) {
  return <div className={cx('sp-slot-empty', `sp-card--${size}`)} aria-label="Empty slot" />
}

/** Memoized: on the board its props (structurally shared noble/bonuses) rarely change between renders. */
export const NobleTile = memo(function NobleTile({
  noble,
  size = 'md',
  onClick,
  disabled,
  className,
  highlight,
  progress,
}: Clickable & {
  noble: Noble
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  highlight?: boolean
  /** the viewer's bonuses: shows how close they are to each requirement */
  progress?: GemCounts
}) {
  const reqs = GEM_COLORS.filter((c) => noble.requirement[c] > 0)
  const mine = progress
    ? ` — you have ${reqs.map((c) => `${Math.min(progress[c], noble.requirement[c])} of ${noble.requirement[c]} ${GEM_NAME[c]}`).join(', ')}`
    : ''
  const label = `Noble — ${noble.points} points — requires ${reqs.map((c) => `${noble.requirement[c]} ${GEM_NAME[c]}`).join(', ')} cards${mine}`
  return (
    <Shell
      onClick={onClick}
      disabled={disabled}
      label={label}
      className={cx('sp-noble', `sp-noble--${size}`, highlight && 'is-highlight', className)}
    >
      <span className="sp-noble__strip">
        <span className="sp-noble__points">{noble.points}</span>
        <span className="sp-noble__reqs">
          {reqs.map((c) => (
            <ReqPip key={c} color={c} n={noble.requirement[c]} have={progress?.[c]} />
          ))}
        </span>
      </span>
      <span className="sp-noble__crest" aria-hidden="true">
        <Crown size="1em" aria-hidden="true" />
      </span>
    </Shell>
  )
})
