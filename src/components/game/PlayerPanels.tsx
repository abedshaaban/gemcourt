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
}: {
  player: PublicPlayer
  index: number
  online: boolean
  isTurn: boolean
  phase: TurnPhase
}) {
  return (
    <article className={cx('sp-opp', isTurn && 'is-turn')} aria-label={`${player.name}${isTurn ? ' (current turn)' : ''}`}>
      <header className="sp-opp__head">
        <Avatar name={player.name} index={index} />
        <div className="sp-opp__who">
          <div className="sp-opp__name">
            <span className="sp-ellipsis">{player.name}</span>
            <OnlineDot online={online} />
          </div>
          <div className="sp-opp__meta">
            {isTurn ? (
              <span className="sp-opp__turn">{phase === 'action' ? 'Taking a turn…' : phaseVerb(phase).replace(/^is /, '')}</span>
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
                    <DevCard key={r.id} card={r} size="sm" className="sp-peek" />
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
    </article>
  )
}

export function YourArea({
  player,
  index,
  online,
  isTurn,
  canAct,
  playing,
  pending,
  onReservedClick,
}: {
  player: PublicPlayer
  index: number
  online: boolean
  isTurn: boolean
  canAct: boolean
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
                onClick={canAct ? () => onReservedClick(r) : undefined}
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
    </section>
  )
}
