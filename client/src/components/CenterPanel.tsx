import type { GameAction, RoomSnapshot } from '../../../shared/src/types';
import { fmtMoney } from '../fmt';

export default function CenterPanel({ snap, act }: { snap: RoomSnapshot; act: (a: GameAction) => void }) {
  const { state, board, players } = snap;
  const me = players.find((p) => p.id === snap.you);
  const turn = players.find((p) => p.id === state.turnPlayer);
  const isMyTurn = !!me && state.turnPlayer === me.id && !me.bankrupt;
  const cur = board.meta.currency;

  const dice = state.dice;

  let status = '';
  let controls: React.ReactNode = null;

  if (state.phase === 'over') {
    status = `🏆 Победил(а) ${players.find((p) => p.id === state.winner)?.name ?? '—'}!`;
    if (me?.isHost) {
      controls = (
        <button className="btn primary" onClick={() => act({ type: 'startGame' })}>
          🔄 Играть снова
        </button>
      );
    }
  } else if (isMyTurn) {
    if (state.phase === 'roll') {
      if (me.inJail) {
        status = `Вы в тюрьме (${me.jailTurns}/3 ходов). Дубль — и вы свободны!`;
        controls = (
          <div className="btn-row">
            <button className="btn primary" onClick={() => act({ type: 'roll' })}>
              🎲 Бросить кубики
            </button>
            <button className="btn secondary" disabled={me.money < board.rules.jailFine} onClick={() => act({ type: 'payJailFine' })}>
              Заплатить залог {fmtMoney(board.rules.jailFine, cur)}
            </button>
            {me.jailCards > 0 && (
              <button className="btn secondary" onClick={() => act({ type: 'useJailCard' })}>
                🎫 Использовать карту
              </button>
            )}
          </div>
        );
      } else {
        status = 'Ваш ход — бросайте кубики';
        controls = (
          <button className="btn primary big" onClick={() => act({ type: 'roll' })}>
            🎲 Бросить кубики
          </button>
        );
      }
    } else if (state.phase === 'buy') {
      const tile = board.tiles[me.position];
      const price = 'price' in tile ? tile.price : 0;
      status = `Покупаете «${tile.name}» за ${fmtMoney(price, cur)}?`;
      controls = (
        <div className="btn-row">
          <button className="btn primary" disabled={me.money < price} onClick={() => act({ type: 'buy' })}>
            ✅ Купить
          </button>
          <button className="btn secondary" onClick={() => act({ type: 'decline' })}>
            ❌ Отказаться
          </button>
        </div>
      );
    } else if (state.phase === 'manage') {
      status = 'Ваш ход: можно строить или заложить собственность';
      controls = (
        <button className="btn primary" onClick={() => act({ type: 'endTurn' })}>
          ⏭ Конец хода
        </button>
      );
    } else if (state.phase === 'debt' && state.debt) {
      const total = state.debt.recipients ? state.debt.amount * state.debt.recipients.length : state.debt.amount;
      const canPay = me.money >= total;
      status = `⚠ Долг ${fmtMoney(total, cur)}${canPay ? '' : ' — не хватает денег: продайте дома или заложьте собственность'}`;
      controls = (
        <div className="btn-row">
          <button className="btn primary" disabled={!canPay} onClick={() => act({ type: 'payDebt' })}>
            💸 Заплатить
          </button>
          <button className="btn danger" onClick={() => act({ type: 'declareBankrupt' })}>
            🏳 Объявить банкротство
          </button>
        </div>
      );
    }
  } else if (turn) {
    const deciding = state.phase === 'buy' || state.phase === 'debt';
    status = `Ход: ${turn.name}${turn.inJail ? ' (в тюрьме)' : ''}${deciding ? ' — принимает решение…' : ''}`;
  } else {
    status = 'Ожидание…';
  }

  return (
    <div className="center-inner">
      <div className="center-title">{board.meta.title}</div>
      {dice && (
        <div className="dice-row" key={state.rollId}>
          <Die value={dice[0]} />
          <Die value={dice[1]} />
        </div>
      )}
      <div className="status">{status}</div>
      {controls}
    </div>
  );
}

const PIPS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

function Die({ value }: { value: number }) {
  return (
    <div className="die rolling">
      {Array.from({ length: 9 }, (_, k) => (
        <span key={k} className={PIPS[value]?.includes(k + 1) ? 'pip on' : 'pip'} />
      ))}
    </div>
  );
}
