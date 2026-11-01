import type { RoomSnapshot } from '../../../shared/src/types';

interface Props {
  snap: RoomSnapshot;
  isHost: boolean;
  onStart: () => void;
  onLeave: () => void;
  toast: (m: string) => void;
}

export default function Room({ snap, isHost, onStart, onLeave, toast }: Props) {
  const link = `${window.location.origin}/?room=${snap.code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Ссылка скопирована — отправьте её друзьям');
    } catch {
      toast(link);
    }
  };

  return (
    <div className="home">
      <div className="home-card">
        <h1>🎩 {snap.board.meta.title}</h1>
        <p className="subtitle">Комната создана. Пригласите друзей!</p>
        <div className="room-code">{snap.code}</div>
        <button className="btn secondary big" onClick={copy}>
          📋 Скопировать ссылку
        </button>
        <h3>Игроки ({snap.players.length}/8)</h3>
        <ul className="lobby-players">
          {snap.players.map((p) => (
            <li key={p.id}>
              <span className="dot" style={{ background: p.color }} />
              {p.name}
              {p.isHost && ' 👑'}
              {!p.connected && ' 💤'}
            </li>
          ))}
        </ul>
        {isHost ? (
          <button className="btn primary big" disabled={snap.players.length < 2} onClick={onStart}>
            {snap.players.length < 2 ? 'Нужно минимум 2 игрока' : 'Начать игру'}
          </button>
        ) : (
          <p className="hint">Ждём, пока хост начнёт игру…</p>
        )}
        <button className="link-btn" onClick={onLeave}>
          Выйти
        </button>
      </div>
    </div>
  );
}
