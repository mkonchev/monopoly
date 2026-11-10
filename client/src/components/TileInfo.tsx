import { useRef, useState } from 'react';
import type { RoomSnapshot } from '../../../shared/src/types';
import { fmtMoney } from '../fmt';

// 3D-наклон карточки за курсором + блик (общий для модалок-карточек)
function useTilt() {
  const tiltRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 25 });
  const onTiltMove = (e: React.MouseEvent) => {
    const el = tiltRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setTilt({ rx: -(py - 0.5) * 10, ry: (px - 0.5) * 16, gx: px * 100, gy: py * 100 });
  };
  const onTiltLeave = () => setTilt({ rx: 0, ry: 0, gx: 50, gy: 25 });
  return { tiltRef, tilt, onTiltMove, onTiltLeave };
}

// Карточка поля по клику: рента по уровням застройки, дом, залог.
export default function TileInfo({ idx, snap, onClose }: { idx: number; snap: RoomSnapshot; onClose: () => void }) {
  const { tiltRef, tilt, onTiltMove, onTiltLeave } = useTilt();
  const tile = snap.board.tiles[idx];
  const ps = snap.state.properties[idx];

  if (snap.state.drone?.tile === idx) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="tile-info-modal card-tilt"
          ref={tiltRef}
          onMouseMove={onTiltMove}
          onMouseLeave={onTiltLeave}
          onClick={(e) => e.stopPropagation()}
          style={{ transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)` }}
        >
          <div className="card-glare" style={{ background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.4), rgba(255,255,255,0) 55%)` }} />
          <div className="tile-info-bar" style={{ background: '#17171a' }} />
          <h2 className="tile-info-title">🕳️ {tile.name}</h2>
          <p className="tile-info-note">Поле уничтожено дроном Сыктывкара. Здесь больше ничего нет и ничего не действует.</p>
          <button className="btn primary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    );
  }

  if (!ps || !('price' in tile)) return null;
  const cur = snap.board.meta.currency;
  const owner = ps.owner ? snap.players.find((p) => p.id === ps.owner) : null;
  const group = tile.type === 'street' ? snap.board.groups[tile.group] : null;
  const price = tile.price;
  const mortgage = Math.round(price * 0.5);
  const unmortgage = Math.round(price * 0.55);

  // Вся группа у владельца и без залогов — базовая рента улицы удваивается.
  const groupIdxs =
    tile.type === 'street'
      ? snap.board.tiles.map((t, i) => (t.type === 'street' && t.group === tile.group ? i : -1)).filter((i) => i >= 0)
      : [];
  const monopoly = !!owner && groupIdxs.every((i) => snap.state.properties[i]!.owner === owner.id && !snap.state.properties[i]!.mortgaged);

  let rows: { label: string; rent: string; current?: boolean }[] = [];
  let rentNote: string | null = null;

  if (tile.type === 'street') {
    const labels = ['База (0 домов)', '1 дом', '2 дома', '3 дома', '4 дома', 'Отель'];
    rows = tile.rent.map((r, k) => ({
      label: labels[k],
      rent: fmtMoney(k === 0 && monopoly ? r * 2 : r, cur),
      current: ps.houses === k,
    }));
    if (monopoly) rentNote = 'Владелец собрал всю цветовую группу — базовая рента удвоена.';
    else rentNote = 'Если владелец соберёт всю группу, базовая рента удвоится.';
  } else if (tile.type === 'railroad') {
    const ownedByOwner = owner
      ? snap.board.tiles
          .map((t, i) => (t.type === 'railroad' ? i : -1))
          .filter((i) => i >= 0 && snap.state.properties[i]!.owner === owner.id && !snap.state.properties[i]!.mortgaged).length
      : 0;
    const labels = ['1 вокзал', '2 вокзала', '3 вокзала', '4 вокзала'];
    rows = tile.rent.map((r, k) => ({ label: labels[k], rent: fmtMoney(r, cur), current: ownedByOwner === k + 1 }));
    rentNote = 'Рента зависит от числа вокзалов у владельца. Заложенные вокзалы не считаются.';
  } else if (tile.type === 'utility') {
    rows = [
      { label: 'У владельца одно предприятие', rent: `бросок × ${tile.rentMultiplier[0]}`, current: true },
      { label: 'У владельца оба предприятия', rent: `бросок × ${tile.rentMultiplier[1]}` },
    ];
    rentNote = 'Рента = сумма выпавших кубиков, умноженная на коэффициент.';
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
          className="tile-info-modal card-tilt"
          ref={tiltRef}
          onMouseMove={onTiltMove}
          onMouseLeave={onTiltLeave}
          onClick={(e) => e.stopPropagation()}
          style={{ transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)` }}
        >
          <div className="card-glare" style={{ background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.4), rgba(255,255,255,0) 55%)` }} />
        <div className="tile-info-bar" style={{ background: group?.color ?? '#8a8f98' }} />
        <h2 className="tile-info-title">
          {group && <span className="dot" style={{ background: group.color }} />}
          {tile.name}
        </h2>
        <div className="tile-info-sub">
          {owner ? (
            <>
              Владелец: <b style={{ color: owner.color === '#fdd835' ? '#b58900' : owner.color }}>{owner.name}</b>
              {ps.mortgaged && ' · 🏦 в залоге'}
              {tile.type === 'street' && ps.houses > 0 && ` · ${ps.houses === 5 ? 'отель' : `${ps.houses} дом(а)`}`}
            </>
          ) : (
            'Свободно — можно купить'
          )}
        </div>

        <h3 className="tile-info-heading">Сколько стоит наступить</h3>
        <table className="rent-table">
          <tbody>
            {rows.map((r, k) => (
              <tr key={k} className={r.current ? 'current' : ''}>
                <td>{r.label}</td>
                <td>{r.rent}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rentNote && <p className="tile-info-note">{rentNote}</p>}

        <h3 className="tile-info-heading">Операции</h3>
        <ul className="tile-facts">
          <li>🏷 Покупка: <b>{fmtMoney(price, cur)}</b></li>
          {tile.type === 'street' && <li>🏠 Дом (или отель): <b>{fmtMoney(tile.houseCost, cur)}</b> за каждый уровень</li>}
          <li>🏦 Залог (получите): <b>{fmtMoney(mortgage, cur)}</b></li>
          <li>↩ Выкуп из залога (заплатите): <b>{fmtMoney(unmortgage, cur)}</b></li>
          {tile.type === 'street' && <li>Продажа дома банку: <b>{fmtMoney(Math.round(tile.houseCost * 0.5), cur)}</b></li>}
        </ul>

        <button className="btn primary" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
