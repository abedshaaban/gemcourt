import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import { MAX_RESERVED, MAX_TOKENS, isHiddenCard } from '../../game/types'
import type { PublicPlayer, ReservedCard, TurnPhase } from '../../game/types'
import { canAfford } from '../../game/helpers'
import { CardBack, DevCard, NobleTile } from './Cards'
import { Holdings } from './Gem'
import { avatarColor, cx, initial, phaseVerb } from './ui'

export function Avatar({ name, index, size = 32 }: { name: string; index: number; size?: number }) {
  return (
    <span
      className="avatar sp-avatar"
      style={{ background: avatarColor(index), width: size, height: size, fontSize: size * 0.45 }}
      aria-hidden="true"
    >
      {initial(name)}
    </span>
  )
}

function OnlineDot({ online }: { online: boolean }) {
  return (
    <span
      className={cx('sp-online', !online && 'is-off')}
      title={online ? 'Online' : 'Disconnected'}
      aria-label={online ? 'Online' : 'Disconnected'}
    />
  )
}

function PointsCrest({ points, size = 'md' }: { points: number; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={cx('sp-crest', `sp-crest--${size}`)} title={`${points} prestige points`}>
      <span key={points} className="sp-bump">
        {points}
      </span>
    </span>
  )
}

export function OpponentPanel({
  player,
  index,
  online,
  isTurn,
  phase,
  statusOverride,
  flash,
  onReservedClick,
}: {
  player: PublicPlayer
  index: number
  online: boolean
  isTurn: boolean
  phase: TurnPhase
  statusOverride?: string // replaces the turn status while it's this rival's turn (e.g. offline countdown)
  flash?: boolean // just made a move: highlight briefly
  onReservedClick?: (card: ReservedCard) => void // look-only view of a visible reserved card
}) {
  // Phones show a one-line summary that expands on tap; wider layouts hide the toggle and always show everything.
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const status = statusOverride ?? (phase === 'action' ? 'Taking a turn…' : phaseVerb(phase).replace(/^is /, ''))
  return (
    <article
      className={cx('sp-opp', isTurn && 'is-turn', flash && 'is-flash', open && 'is-open')}
      aria-label={`${player.name}${isTurn ? ' (current turn)' : ''}`}
    >
      <button
        type="button"
        className="sp-opp__toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar name={player.name} index={index} size={28} />
        <span className="sp-opp__who">
          <span className="sp-opp__name">
            <span className="sp-ellipsis">{player.name}</span>
            <OnlineDot online={online} />
            {isTurn && <span className={cx('sp-opp__turn sp-ellipsis', statusOverride && 'is-away')}>{status}</span>}
          </span>
          <span className="sp-opp__meta sp-opp__stats">
            {player.cards.length} card{player.cards.length === 1 ? '' : 's'} · {player.tokenCount}/{MAX_TOKENS} tokens ·{' '}
            {player.reserved.length} reserved
          </span>
        </span>
        <PointsCrest points={player.points} size="sm" />
        <ChevronDown className="sp-opp__chev" size={16} aria-hidden="true" />
      </button>
      <div className="sp-opp__body" id={bodyId}>
        <header className="sp-opp__head">
          <Avatar name={player.name} index={index} />
          <div className="sp-opp__who">
            <div className="sp-opp__name">
              <span className="sp-ellipsis">{player.name}</span>
              <OnlineDot online={online} />
            </div>
            <div className="sp-opp__meta">
              {isTurn ? (
                <span className={cx('sp-opp__turn', statusOverride && 'is-away')}>{status}</span>
              ) : (
                <>
                  {player.cards.length} card{player.cards.length === 1 ? '' : 's'} · {player.tokenCount}/{MAX_TOKENS} tokens
                </>
              )}
            </div>
          </div>
          <PointsCrest points={player.points} />
        </header>
        <Holdings tokens={player.tokens} bonuses={player.bonuses} size="sm" />
        {(player.reserved.length > 0 || player.nobles.length > 0) && (
          <div className="sp-opp__extras">
            {player.reserved.length > 0 && (
              <div className="sp-opp__reserved" aria-label={`${player.reserved.length} reserved`}>
                <span className="sp-mini-label">Reserved</span>
                <div className="sp-opp__row">
                  {player.reserved.map((r) =>
                    isHiddenCard(r) ? (
                      <CardBack key={r.id} tier={r.tier} size="sm" className="sp-peek" />
                    ) : (
                      <DevCard
                        key={r.id}
                        card={r}
                        size="sm"
                        className="sp-peek"
                        onClick={onReservedClick ? () => onReservedClick(r) : undefined}
                      />
                    ),
                  )}
                </div>
              </div>
            )}
            {player.nobles.length > 0 && (
              <div className="sp-opp__nobles">
                <span className="sp-mini-label">Nobles</span>
                <div className="sp-opp__row">
                  {player.nobles.map((n) => (
                    <NobleTile key={n.id} noble={n} size="xs" className="sp-peek" />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

export function YourArea({
  player,
  index,
  online,
  isTurn,
  playing,
  pending,
  onReservedClick,
}: {
  player: PublicPlayer
  index: number
  online: boolean
  isTurn: boolean
  playing: boolean
  pending: boolean
  onReservedClick: (card: ReservedCard) => void
}) {
  const reserved = player.reserved
  const emptySlots = Math.max(0, MAX_RESERVED - reserved.length)
  return (
    <section className={cx('sp-you', isTurn && 'is-turn')} aria-label="Your area">
      <div className="sp-you__id">
        <Avatar name={player.name} index={index} size={44} />
        <div className="sp-you__who">
          <div className="sp-you__name">
            <span className="sp-ellipsis">{player.name}</span>
            <OnlineDot online={online} />
          </div>
          <div className="sp-you__meta">
            {player.cards.length} card{player.cards.length === 1 ? '' : 's'} ·{' '}
            <span className={cx(player.tokenCount >= MAX_TOKENS && 'sp-warn')}>
              {player.tokenCount}/{MAX_TOKENS} tokens
            </span>
          </div>
        </div>
        <PointsCrest points={player.points} size="lg" />
      </div>

      <div className="sp-you__block">
        <span className="sp-mini-label">Tokens &amp; bonuses</span>
        <Holdings tokens={player.tokens} bonuses={player.bonuses} size="md" />
      </div>

      <div className="sp-you__block">
        <span className="sp-mini-label">
          Reserved {reserved.length}/{MAX_RESERVED}
        </span>
        <div className="sp-you__reserved">
          {reserved.map((r) =>
            isHiddenCard(r) ? (
              <CardBack key={r.id} tier={r.tier} size="md" />
            ) : (
              <DevCard
                key={r.id}
                card={r}
                size="md"
                deal
                affordable={playing && canAfford(player.tokens, player.bonuses, r.cost)}
                onClick={playing ? () => onReservedClick(r) : undefined}
                disabled={pending}
                blind={r.blind}
              />
            ),
          )}
          {Array.from({ length: emptySlots }, (_, i) => (
            <div key={`e${i}`} className="sp-slot-empty sp-card--md sp-slot-empty--reserve" aria-hidden="true" />
          ))}
        </div>
      </div>

      <div className="sp-you__block">
        <span className="sp-mini-label">Nobles</span>
        <div className="sp-you__nobles">
          {player.nobles.length === 0 ? (
            <span className="sp-none">None yet</span>
          ) : (
            player.nobles.map((n) => <NobleTile key={n.id} noble={n} size="sm" className="sp-deal" />)
          )}
        </div>
      </div>
      <div className="sp-you__block sp-you__collection-block">
        <span className="sp-mini-label">Collection · {player.cards.length}</span>
        <div className="sp-you__collection" aria-label={`${player.cards.length} collected development cards`}>
          {player.cards.length === 0 ? (
            <span className="sp-none">Your first card will rest here</span>
          ) : (
            player.cards.map((card) => (
              <div className="sp-owned-card" key={card.id}>
                <DevCard card={card} size="sm" />
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

/** Phone-only sticky strip with my points, tokens and bonuses, so they stay visible while I pick gems or cards.
 *  A visual duplicate of "Your area" (hidden from assistive tech, which reads that section instead). */
export function MyBar({ player, isTurn }: { player: PublicPlayer; isTurn: boolean }) {
  return (
    <div className={cx('sp-mybar', isTurn && 'is-turn')} aria-hidden="true">
      <div className="sp-mybar__id">
        <PointsCrest points={player.points} size="sm" />
        <span className="sp-mybar__who">
          <span className="sp-mybar__label">You</span>
          <span className={cx('sp-mybar__tokens', player.tokenCount >= MAX_TOKENS && 'sp-warn')}>
            {player.tokenCount}/{MAX_TOKENS}
          </span>
        </span>
      </div>
      <Holdings tokens={player.tokens} bonuses={player.bonuses} size="sm" />
    </div>
  )
}
