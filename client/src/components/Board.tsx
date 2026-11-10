import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { RoomSnapshot } from '../../../shared/src/types';
import { figureEmoji } from '../../../shared/src/tokens';
import { CORNER_EMOJI, gridPos, sideOf, tileCenter } from '../boardLayout';
import { fmtCompact, fmtMoney } from '../fmt';

export default function Board({ snap, children, onSelectTile, onPickTile }: { snap: RoomSnapshot; children?: ReactNode; onSelectTile?: (idx: number) => void; onPickTile?: (idx: number) => void }) {
  // анимация удара дрона: следим за seq события
  const [droneAnim, setDroneAnim] = useState<number | null>(null);
  const seenDrone = useRef(0);
  useEffect(() => {
    const d = snap.state.drone;
    if (d && d.seq !== seenDrone.current) {
      seenDrone.current = d.seq;
      setDroneAnim(d.tile);
      const t = setTimeout(() => setDroneAnim(null), 4200);
      return () => clearTimeout(t);
    }
  }, [snap.state.drone]);
  // машина гаишников: при появлении события проезжает через доску с мигалками
  const [copsDrive, setCopsDrive] = useState(false);
  const copsPrev = useRef(false);
  useEffect(() => {
    const active = !!snap.state.cops;
    if (active && !copsPrev.current) {
      setCopsDrive(true);
      const t = setTimeout(() => setCopsDrive(false), 2400);
      copsPrev.current = true;
      return () => clearTimeout(t);
    }
    copsPrev.current = active;
  }, [snap.state.cops]);
  return (
    <div className={'board' + (copsDrive ? ' cops-drive' : '')}>
      {snap.board.tiles.map((tile, i) => (
        <Tile key={i} idx={i} snap={snap} onSelectTile={onSelectTile} onPickTile={onPickTile} droneAnim={droneAnim === i} />
      ))}
      <TokensLayer snap={snap} />
      {copsDrive && (
        <div className="cops-car">
          <span className="cops-car-body">🚔</span>
          <span className="cops-light l1" />
          <span className="cops-light l2" />
        </div>
      )}
      <div className="board-center">{children}</div>
    </div>
  );
}

// Фишки игроков поверх доски: плавно «шагают» на новую клетку с подпрыгиванием
function TokensLayer({ snap }: { snap: RoomSnapshot }) {
  return (
    <div className="tokens-layer">
      {snap.players.filter((p) => !p.bankrupt).map((p) => {
        const c = tileCenter(p.position);
        return (
          <div key={p.id} className="token-piece" style={{ left: c.x + '%', top: c.y + '%' }}>
            <span key={p.position} className="token" style={{ background: p.color }} title={p.name}>
              {figureEmoji(p.figure)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Tile({ idx, snap, onSelectTile, onPickTile, droneAnim }: { idx: number; snap: RoomSnapshot; onSelectTile?: (idx: number) => void; onPickTile?: (idx: number) => void; droneAnim?: boolean }) {
  const tile = snap.board.tiles[idx];
  const ps = snap.state.properties[idx];
  const side = sideOf(idx);
  const owner = ps?.owner ? snap.players.find((p) => p.id === ps.owner) : null;
  const group = tile.type === 'street' ? snap.board.groups[tile.group] : null;
  const pos = gridPos(idx);

  const price = 'price' in tile ? tile.price : 0;
  const houses = ps?.houses ?? 0;
  const pickMode = !!onPickTile;
  const destroyed = snap.state.drone?.tile === idx;
  const crater = destroyed && !droneAnim;

  return (
    <div
      className={[
        'tile',
        `side-${side}`,
        price > 0 && !pickMode && !crater ? 'clickable' : '',
        pickMode && !crater ? 'pickable' : '',
        crater ? 'destroyed' : '',
        droneAnim ? 'drone-strike' : '',
        owner ? 'owned' : '',
        ps?.mortgaged ? 'mortgaged' : '',
        owner?.id === snap.you ? 'mine' : '',
      ].join(' ')}
      onClick={
        pickMode
          ? () => onPickTile!(idx)
          : price > 0 && onSelectTile
            ? () => onSelectTile(idx)
            : undefined
      }
      style={{
        gridRow: pos.row,
        gridColumn: pos.col,
      }}
      title={
        price > 0
          ? `${tile.name}${owner ? ` — ${owner.name}` : ''}${price ? `, ${fmtMoney(price, snap.board.meta.currency)}` : ''}`
          : tile.name
      }
    >
      {owner && <div className="owner-fill" style={{ background: owner.color }} />}
      {group && (
        <div className="bar" style={{ background: group.color }}>
          {houses === 5 ? (
            <span className="hotel" />
          ) : (
            Array.from({ length: houses }).map((_, k) => <span key={k} className="house" />)
          )}
        </div>
      )}
      {side === 'corner' ? (
        <div className="corner-face">
          <span className="corner-emoji">{CORNER_EMOJI[idx]}</span>
          <span className="tname">{tile.name}</span>
        </div>
      ) : (
        <>
          <div className="tname">{tile.name}</div>
          {price > 0 && <div className="tprice">{fmtCompact(price)}</div>}
        </>
      )}
      {ps?.mortgaged && <span className="mort-badge">🏦</span>}
      {idx === 10 && snap.state.casinoPot > 0 && (
        <span className="pot-chip" title="Банк казино">
          🎰 {fmtCompact(snap.state.casinoPot)}
        </span>
      )}
      {tile.type === 'chance' && <span className="tile-emoji">❓</span>}
      {tile.type === 'chest' && <span className="tile-emoji">🎁</span>}
      {snap.state.cops?.tiles.includes(idx) && (
        <span className="cops-badge" title="Сыковские менты! Приедешь — штраф">
          🚨
        </span>
      )}
      {crater && <span className="crater-emoji">🕳️</span>}
      {droneAnim && <span className="drone-fly">🛸</span>}
      {droneAnim && <span className="drone-boom">💥</span>}
    </div>
  );
}
