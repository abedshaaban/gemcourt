import { TOKEN_COLORS } from '../../game/types'
import type { GemColor, TokenColor, TokenCounts } from '../../game/types'
import { Chip } from './Gem'
import { GEM_NAME, cx } from './ui'

export function Bank({
  bank,
  selection,
  interactive,
  pending,
  onPick,
}: {
  bank: TokenCounts
  selection: GemColor[]
  interactive: boolean
  pending: boolean
  onPick: (c: TokenColor) => void
}) {
  return (
    <section className={cx('sp-bank', interactive && 'is-interactive')} aria-label="Bank">
      <h3 className="sp-section-title sp-bank__title">Bank</h3>
      <div className="sp-bank__piles">
        {TOKEN_COLORS.map((c) => {
          const picked = c === 'gold' ? 0 : selection.filter((s) => s === c).length
          const shown = bank[c] - picked
          const depth = Math.min(4, Math.max(0, shown - 1))
          return (
            <button
              key={c}
              type="button"
              className={cx(
                'sp-pile',
                `sp-pile--d${depth}`,
                shown <= 0 && 'is-empty',
                picked > 0 && 'is-picked',
                c === 'gold' && 'is-gold',
              )}
              onClick={() => onPick(c)}
              disabled={!interactive || pending}
              aria-label={`${GEM_NAME[c]}: ${bank[c]} in bank${picked ? `, ${picked} selected` : ''}`}
              title={c === 'gold' ? 'Gold (wild) — gained only by reserving a card' : `${GEM_NAME[c]} — ${bank[c]} in bank`}
            >
              <Chip color={c} size="lg" />
              <span className="sp-pile__count">
                <span key={shown} className="sp-bump">
                  {shown}
                </span>
              </span>
              {picked > 0 && <span className="sp-pile__picked">−{picked}</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function SelectionTray({
  selection,
  canConfirm,
  pending,
  hint,
  onUnpick,
  onConfirm,
  onClear,
}: {
  selection: GemColor[]
  canConfirm: boolean
  pending: boolean
  hint: string
  onUnpick: (index: number) => void
  onConfirm: () => void
  onClear: () => void
}) {
  return (
    <div className={cx('sp-tray', selection.length > 0 && 'has-items')} aria-live="polite">
      <div className="sp-tray__chips">
        {selection.length === 0 ? (
          <span className="sp-tray__placeholder">Select gems from the bank</span>
        ) : (
          selection.map((c, i) => (
            <button
              key={`${c}${i}`}
              type="button"
              className="sp-chipbtn sp-lift"
              onClick={() => onUnpick(i)}
              disabled={pending}
              aria-label={`Put back ${GEM_NAME[c]}`}
            >
              <Chip color={c} size="sm" />
            </button>
          ))
        )}
      </div>
      <p className="sp-tray__hint">{hint}</p>
      <div className="sp-tray__actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClear} disabled={selection.length === 0 || pending}>
          Clear
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onConfirm} disabled={!canConfirm || pending}>
          Take gems
        </button>
      </div>
    </div>
  )
}
