import type { ReactNode } from 'react'
import { GEM_COLORS, TOKEN_COLORS } from '../../game/types'
import type { GemColor, GemCounts, TokenColor, TokenCounts } from '../../game/types'
import { GEM_NAME, cx } from './ui'
import gemShapes from './gemShapes.json'

/** A faceted gem glyph, cut differently per color. Sized by font-size (1em). */
export function GemIcon({ color, className }: { color: TokenColor; className?: string }) {
  return (
    <span className={cx('sp-gem', `sp-c-${color}`, `sp-gem--${color}`, className)} aria-hidden="true">
      <svg className="sp-gem__cut" viewBox="-1.08 -1.08 2.16 2.16">
        <polygon points={gemShapes[color].map((p) => p.join(',')).join(' ')} fill="currentColor" />
        <polygon points={gemShapes[color].map(([x, y]) => `${x * .46},${y * .46}`).join(' ')} fill="white" fillOpacity=".18" />
        {gemShapes[color].map(([x, y], i) => <line key={i} x1={x} y1={y} x2={x * .46} y2={y * .46} stroke="var(--gem-line, white)" strokeOpacity=".65" strokeWidth=".055" />)}
        <polygon points={gemShapes[color].map(([x, y]) => `${x * .46},${y * .46}`).join(' ')} fill="none" stroke="var(--gem-line, white)" strokeOpacity=".65" strokeWidth=".055" />
      </svg>
    </span>
  )
}

export type ChipSize = 'xs' | 'sm' | 'md' | 'lg'

/** A round poker-style token chip. Shows `children` in the center, or the gem glyph if none. */
export function Chip({
  color,
  size = 'md',
  className,
  children,
  title,
}: {
  color: TokenColor
  size?: ChipSize
  className?: string
  children?: ReactNode
  title?: string
}) {
  return (
    <span className={cx('sp-chip', `sp-chip--${size}`, `sp-c-${color}`, className)} title={title}>
      {children ?? <GemIcon color={color} className="sp-chip__gem" />}
    </span>
  )
}

/** Small colored circle with a number (card cost). */
export function CostPip({ color, n }: { color: GemColor; n: number }) {
  return (
    <span className={cx('sp-pip', `sp-c-${color}`)} title={`${n} ${GEM_NAME[color]}`}>
      {n}
    </span>
  )
}

/** Small card-shaped pip with a number (noble requirement — counted in cards/bonuses).
 *  With `have`, a meter underneath shows the viewer's progress toward it. */
export function ReqPip({ color, n, have }: { color: GemColor; n: number; have?: number }) {
  const got = have === undefined ? null : Math.min(have, n)
  return (
    <span
      className={cx('sp-req', `sp-c-${color}`, got !== null && got >= n && 'is-met')}
      title={`${n} ${GEM_NAME[color]} cards${got !== null ? ` — you have ${got}/${n}` : ''}`}
    >
      {n}
      {got !== null && (
        <span className="sp-req__meter" aria-hidden="true">
          <span style={{ width: `${(got / n) * 100}%` }} />
        </span>
      )}
    </span>
  )
}

/** Card-shaped bonus tile with count (permanent discount). */
export function BonusTile({ color, n, size = 'md' }: { color: GemColor; n: number; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cx('sp-bonus', `sp-bonus--${size}`, `sp-c-${color}`, n === 0 && 'is-zero')}
      title={`${n} ${GEM_NAME[color]} bonus${n === 1 ? '' : 'es'}`}
    >
      <GemIcon color={color} className="sp-bonus__gem" />
      <span key={n} className="sp-bump">
        {n}
      </span>
    </span>
  )
}

/** Column-aligned view of a player's tokens (chips) over their bonuses (card tiles). */
export function Holdings({
  tokens,
  bonuses,
  size = 'md',
  onChipClick,
}: {
  tokens: TokenCounts
  bonuses: GemCounts
  size?: 'sm' | 'md'
  onChipClick?: (c: TokenColor) => void
}) {
  return (
    <div className={cx('sp-holdings', `sp-holdings--${size}`)}>
      {TOKEN_COLORS.map((c) => {
        const n = tokens[c]
        const chip = (
          <Chip color={c} size={size === 'sm' ? 'xs' : 'sm'} className={cx(n === 0 && 'is-zero')}>
            <span key={n} className="sp-chip__count sp-bump">
              {n}
            </span>
          </Chip>
        )
        return (
          <div key={c} className="sp-holdings__col" title={`${GEM_NAME[c]}: ${n} token${n === 1 ? '' : 's'}`}>
            {onChipClick ? (
              <button type="button" className="sp-chipbtn" onClick={() => onChipClick(c)} disabled={n === 0}>
                {chip}
              </button>
            ) : (
              chip
            )}
            {c === 'gold' ? (
              <span className={cx('sp-bonus', `sp-bonus--${size}`, 'sp-bonus--blank')} aria-hidden="true" />
            ) : (
              <BonusTile color={c} n={bonuses[c]} size={size} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function gemsWithCost(cost: GemCounts): GemColor[] {
  return GEM_COLORS.filter((c) => cost[c] > 0)
}
