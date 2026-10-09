import { GemIcon } from './Gem'

/** Concise summary of the standard game rules. Rendered inside the board's rules drawer. */
export function RulesPanel() {
  return (
    <div className="sp-rules">
      <p className="sp-rules__lead">
        Renaissance gem merchants race to <strong>15 prestige points</strong> by buying mines, transport and shops — and
        attracting the patronage of nobles.
      </p>

      <h4>Setup by player count</h4>
      <table className="sp-rules__table">
        <thead>
          <tr>
            <th>Players</th>
            <th>Gems per color</th>
            <th>Gold</th>
            <th>Nobles</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>2</td>
            <td>4</td>
            <td>5</td>
            <td>3</td>
          </tr>
          <tr>
            <td>3</td>
            <td>5</td>
            <td>5</td>
            <td>4</td>
          </tr>
          <tr>
            <td>4</td>
            <td>7</td>
            <td>5</td>
            <td>5</td>
          </tr>
          <tr>
            <td>5</td>
            <td>8</td>
            <td>6</td>
            <td>6</td>
          </tr>
          <tr>
            <td>6</td>
            <td>9</td>
            <td>7</td>
            <td>7</td>
          </tr>
        </tbody>
      </table>
      <p>
        Four face-up cards are dealt from each of the three decks (tiers I, II, III). The base game is for 2–4; 5 and 6
        players are a house extension with larger piles and the same decks.
      </p>

      <h4>On your turn, do exactly one</h4>
      <ol className="sp-rules__actions">
        <li>
          <strong>Take 3 different gems</strong> — one each of three colors. (Fewer only if fewer colors remain.)
        </li>
        <li>
          <strong>Take 2 of the same gem</strong> — only from a pile holding at least 4.
        </li>
        <li>
          <strong>Reserve a card</strong> — a face-up card or the top of a deck, and take 1{' '}
          <GemIcon color="gold" className="sp-rules__gem" /> gold if any remain. Max 3 reserved; they can't be
          discarded.
        </li>
        <li>
          <strong>Buy a card</strong> — from the market or your reserve. Gold is wild.
        </li>
      </ol>

      <h4>Bonuses</h4>
      <p>
        Every card you own gives a permanent <em>bonus</em> of its gem color, reducing that color in future costs by 1
        per card. A card may cost you nothing at all.
      </p>

      <h4>10-token limit</h4>
      <p>You may never end your turn holding more than 10 tokens (gold included). Return the excess of your choice.</p>

      <h4>Nobles</h4>
      <p>
        At the end of your turn, if your <em>bonuses</em> (cards, not tokens) meet a noble's requirement, the noble
        visits you: +3 points. Only one noble per turn — choose if several qualify. You cannot refuse a visit.
      </p>

      <h4>End of the game</h4>
      <p>
        When a player reaches 15 points, finish the current round so everyone has had the same number of turns. The
        player with the most points wins; on a tie, the one who bought the <strong>fewest development cards</strong>{' '}
        wins.
      </p>
    </div>
  )
}
