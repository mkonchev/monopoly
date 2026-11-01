import type { RoomSnapshot } from '../../../shared/src/types';
import { fmtMoney } from '../fmt';

export default function Players({ snap }: { snap: RoomSnapshot }) {
  const { players, state, board } = snap;
  return (
    <section className="panel">
      <h3>Игроки</h3>
      <ul className="player-list">
        {players.map((p) => (
          <li
            key={p.id}
            className={[
              'player-row',
              state.turnPlayer === p.id ? 'turn' : '',
              p.bankrupt ? 'bankrupt' : '',
              p.id === snap.you ? 'me' : '',
            ].join(' ')}
          >
            <span className="dot" style={{ background: p.color }} />
            <div className="player-main">
              <div className="player-name">
                {p.name}
                {p.isHost && ' 👑'}
                {p.inJail && ' 🚔'}
                {p.jailCards > 0 && ` 🎫${p.jailCards}`}
                {!p.connected && ' 💤'}
                {p.id === snap.you && ' (вы)'}
              </div>
              <div className="player-sub">
                {state.phase !== 'lobby' && <>📍 {board.tiles[p.position]?.name}</>}
              </div>
            </div>
            <div className="player-money">
              <div>{fmtMoney(p.money, board.meta.currency)}</div>
              {p.loan && (
                <div className={`loan-badge${p.loan.due ? ' due' : ''}`}>
                  🏦 долг {fmtMoney(p.loan.debt, board.meta.currency)}{p.loan.due ? ' ⚠' : ''}
                </div>
              )}
              <div className="player-worth">имущество: {fmtMoney(p.netWorth, board.meta.currency)}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
