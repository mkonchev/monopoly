import type { GameAction, RoomSnapshot } from '../../../shared/src/types';
import { fmtMoney } from '../fmt';

export default function CenterPanel({ snap, act, hideDice }: { snap: RoomSnapshot; act: (a: GameAction) => void; hideDice?: boolean }) {
  const { state, board, players } = snap;
  const me = players.find((p) => p.id === snap.you);
  const turn = players.find((p) => p.id === state.turnPlayer);
  const isMyTurn = !!me && state.turnPlayer === me.id && !me.bankrupt;
  const cur = board.meta.currency;

  const dice = state.dice;

  let status = '';
  let controls: React.ReactNode = null;

  if (state.awaitingOffer) {
    const a = state.awaitingOffer;
    const from = players.find((p) => p.id === a.from)?.name ?? '???';
    const to = players.find((p) => p.id === a.to)?.name ?? '???';
    status =
      a.kind === 'trade'
        ? `⏸ ${from} ждёт ответа ${to} на предложение обмена`
        : `⏸ ${from} ждёт ответа ${to} на просьбу о займе`;
  } else if (state.phase === 'over') {
    status = `🏆 Победил(а) ${players.find((p) => p.id === state.winner)?.name ?? '—'}!`;
    if (me?.isHost) {
      controls = (
        <button className="btn primary" onClick={() => act({ type: 'startGame' })}>
          🔄 Играть снова
        </button>
      );
    }
  } else if (isMyTurn && state.phase === 'bus' && state.dice) {
    const [d1, d2] = state.dice;
    status = '🚌 Автобус! Выберите, как двигаться';
    controls = (
      <div className="btn-row">
        <button className="btn primary" onClick={() => act({ type: 'busMove', choice: 'sum' })}>
          Сумма: {d1 + d2}
          {d1 === d2 ? ' (дубль!)' : ''}
        </button>
        <button className="btn secondary" onClick={() => act({ type: 'busMove', choice: 'd1' })}>
          Только {d1}
        </button>
        <button className="btn secondary" onClick={() => act({ type: 'busMove', choice: 'd2' })}>
          Только {d2}
        </button>
      </div>
    );
  } else if (isMyTurn && state.phase === 'triplet') {
    status = '🎰 ТРИПЛЕТ! Кликните любую клетку на доске — туда и переместитесь, затем бросите заново';
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
    const waiting =
      state.phase === 'bus'
        ? ' — выбирает перемещение автобуса'
        : state.phase === 'triplet'
          ? ' — выбирает клетку для триплета'
          : state.phase === 'casino'
            ? ' — играет в казино'
            : state.phase === 'buy' || state.phase === 'debt'
              ? ' — принимает решение…'
              : '';
    status = `Ход: ${turn.name}${turn.inJail ? ' (в тюрьме)' : ''}${waiting}`;
  } else {
    status = 'Ожидание…';
  }

  return (
    <div className="center-inner">
      <div className="center-title">{board.meta.title}</div>
      {dice && !hideDice && (
        <div className="dice-row" key={state.rollId}>
          <Die value={dice[0]} />
          <Die value={dice[1]} />
          {state.speedDie && state.speedFace && (
            <>
              {state.speedFace === 'bus' ? (
                <div className="speed-chip rolling">🚌</div>
              ) : state.speedFace === 'm1' ? (
                <div className="speed-chip rolling">🎩</div>
              ) : (
                <Die value={Number(state.speedFace)} speed />
              )}
            </>
          )}
        </div>
      )}
      <div className="status">{status}</div>
      {state.cops && (
        <div className="cops-banner">
          🚨 Сыковские менты патрулируют улицы! Осталось бросков: {state.cops.rollsLeft} · штраф{' '}
          {fmtMoney(snap.board.rules.cops?.fine ?? 50000, cur)}
        </div>
      )}
      {me?.loan?.due && state.phase !== 'over' && (
        <div className="due-warning center-warning">
          ⚠ Кредит просрочен! Погасите, продлите или сдайтесь в панели «Кредиты и обмен» — иначе в конце хода кредитор заберёт всё
        </div>
      )}
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

// Объёмный кубик: грани 1-6 в 3D, при броске кувыркается и ложится нужной гранью
function Die({ value, speed }: { value: number; speed?: boolean }) {
  const rot: Record<number, string> = {
    1: 'rotateX(0deg) rotateY(0deg)',
    2: 'rotateX(0deg) rotateY(-90deg)',
    3: 'rotateX(-90deg) rotateY(0deg)',
    4: 'rotateX(90deg) rotateY(0deg)',
    5: 'rotateX(0deg) rotateY(90deg)',
    6: 'rotateX(0deg) rotateY(180deg)',
  };
  return (
    <div className={'die3d-wrap' + (speed ? ' speed' : '')}>
      <div className="die3d-tumble">
        <div className="die3d-cube" style={{ transform: rot[value] ?? rot[1] }}>
          {[1, 2, 3, 4, 5, 6].map((v) => (
            <div key={v} className={'die3d-face f' + v}>
              {Array.from({ length: 9 }, (_, k) => (
                <span key={k} className={PIPS[v]?.includes(k + 1) ? 'pip on' : 'pip'} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
