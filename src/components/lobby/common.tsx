import { Minus, Plus } from 'lucide-react'
import { GEM_COLORS } from '~/game/types'

// Same palette as the board, indexed by join order, so each player keeps one color everywhere.
export { avatarColor, initial } from '~/components/game/ui'

export function Brand({ tagline = 'A game of Renaissance gem merchants' }: { tagline?: string }) {
  return (
    <header className="brand">
      <h1>GEMCOURT</h1>
      <p>{tagline}</p>
      <div className="gem-row" aria-hidden>
        {[...GEM_COLORS, 'gold' as const].map((c) => (
          <span key={c} className="gem-dot" style={{ background: `var(--gem-${c})` }} />
        ))}
      </div>
    </header>
  )
}

export function QuickRules() {
  return (
    <details className="rules-box">
      <summary>
        <span>How to play</span>
        <Plus className="rules-box__expand" size={16} aria-hidden="true" />
        <Minus className="rules-box__collapse" size={16} aria-hidden="true" />
      </summary>
      <ul>
        <li>2–6 players. On your turn do exactly one action:</li>
        <li>
          <b>Take 3 gems</b> of different colors, or <b>take 2 gems</b> of the same color (only if that pile has 4+).
        </li>
        <li>
          <b>Reserve</b> a face-up card or the top of a deck (max 3 reserved) and gain 1 gold joker.
        </li>
        <li>
          <b>Buy</b> a face-up or reserved card. Every card you own is a permanent discount of its color.
        </li>
        <li>You may never hold more than 10 tokens at the end of your turn.</li>
        <li>Nobles visit automatically when your card bonuses meet their requirement (3 points).</li>
        <li>When someone reaches 15 points, the round is finished. Most points wins; ties go to fewest cards.</li>
      </ul>
    </details>
  )
}
