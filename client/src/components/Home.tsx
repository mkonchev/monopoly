import { useState } from 'react';

interface Props {
  onCreate: (name: string) => void;
  onJoin: (code: string, name: string) => void;
}

export default function Home({ onCreate, onJoin }: Props) {
  const [name, setName] = useState(() => localStorage.getItem('monopoly:name') ?? '');
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase() ?? '');

  const saveName = (v: string) => {
    setName(v);
    localStorage.setItem('monopoly:name', v);
  };

  return (
    <div className="home">
      <div className="home-card">
        <h1>🎩 Монополия</h1>
        <p className="subtitle">Создайте комнату и отправьте ссылку друзьям</p>
        <label className="field">
          <span>Ваше имя</span>
          <input value={name} onChange={(e) => saveName(e.target.value)} placeholder="Игрок" maxLength={20} />
        </label>
        <button className="btn primary big" disabled={!name.trim()} onClick={() => onCreate(name.trim())}>
          Создать комнату
        </button>
        <div className="divider">или</div>
        <div className="join-row">
          <input
            className="code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="КОД"
            maxLength={4}
          />
          <button className="btn primary big" disabled={!name.trim() || code.length !== 4} onClick={() => onJoin(code, name.trim())}>
            Войти
          </button>
        </div>
      </div>
    </div>
  );
}
