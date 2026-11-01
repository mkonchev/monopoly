import type { GameAction, RoomSnapshot } from '../../../shared/src/types';
import { fmtMoney } from '../fmt';

export default function MyProperties({ snap, act, onSelectTile }: { snap: RoomSnapshot; act: (a: GameAction) => void; onSelectTile?: (idx: number) => void }) {
  const { board, state, players } = snap;
  const me = players.find((p) => p.id === snap.you);
  if (!me || me.bankrupt) return null;
  const canManage = snap.you === state.turnPlayer && ['roll', 'manage', 'debt'].includes(state.phase);
  const canBuild = canManage && ['roll', 'manage'].includes(state.phase);

  const owned = board.tiles
    .map((t, i) => ({ t, i, ps: state.properties[i] }))
    .filter(({ ps }) => ps.owner === snap.you);

  if (owned.length === 0) {
    return (
      <section className="panel">
        <h3>Ваша собственность</h3>
        <p className="hint">Пока ничего не куплено</p>
      </section>
    );
  }

  const groups = new Map<string, typeof owned>();
  const singles: typeof owned = [];
  for (const item of owned) {
    if (item.t.type === 'street') {
      const list = groups.get(item.t.group) ?? [];
      list.push(item);
      groups.set(item.t.group, list);
    } else {
      singles.push(item);
    }
  }

  return (
    <section className="panel">
      <h3>Ваша собственность</h3>
      {[...groups.entries()].map(([groupId, list]) => (
        <div key={groupId} className="prop-group">
          <div className="prop-group-title">
            <span className="dot" style={{ background: board.groups[groupId]?.color }} />
            {board.groups[groupId]?.name ?? groupId}
          </div>
          {list.map(({ i }) => (
            <PropRow key={i} snap={snap} idx={i} act={act} canBuild={canBuild} canManage={canManage} onSelectTile={onSelectTile} />
          ))}
        </div>
      ))}
      {singles.length > 0 && (
        <div className="prop-group">
          {singles.map(({ i }) => (
            <PropRow key={i} snap={snap} idx={i} act={act} canBuild={canBuild} canManage={canManage} onSelectTile={onSelectTile} />
          ))}
        </div>
      )}
    </section>
  );
}

function PropRow({
  snap,
  idx,
  act,
  canBuild,
  canManage,
  onSelectTile,
}: {
  snap: RoomSnapshot;
  idx: number;
  act: (a: GameAction) => void;
  canBuild: boolean;
  canManage: boolean;
  onSelectTile?: (idx: number) => void;
}) {
  const t = snap.board.tiles[idx];
  const ps = snap.state.properties[idx]!;
  if (t.type === 'go' || t.type === 'jail' || t.type === 'free-parking' || t.type === 'go-to-jail' || t.type === 'chance' || t.type === 'chest') return null;
  const cur = snap.board.meta.currency;
  const price = 'price' in t ? t.price : 0;
  const unmortgageCost = Math.round(price * 0.55);

  return (
    <div className={`prop-row clickable${ps.mortgaged ? ' mortgaged' : ''}`} onClick={() => onSelectTile?.(idx)}>
      <div className="prop-name">
        {t.name}
        {ps.mortgaged && ' 🏦'}
        {t.type === 'street' && ps.houses === 5 && ' 🏨'}
        {t.type === 'street' && ps.houses > 0 && ps.houses < 5 && ` ${'🏠'.repeat(ps.houses)}`}
      </div>
      <div className="prop-price">{fmtMoney(price, cur)}</div>
      <div className="prop-actions" onClick={(e) => e.stopPropagation()}>
        {t.type === 'street' && (
          <>
            <button
              className="mini-btn"
              disabled={!canBuild || ps.houses >= 5}
              title="Построить дом"
              onClick={() => act({ type: 'build', tile: idx })}
            >
              🏠+
            </button>
            <button
              className="mini-btn"
              disabled={!canManage || ps.houses <= 0}
              title="Продать дом (половина цены)"
              onClick={() => act({ type: 'sellHouse', tile: idx })}
            >
              🏠−
            </button>
          </>
        )}
        {!ps.mortgaged ? (
          <button className="mini-btn" disabled={!canManage} title="Заложить (половина цены)" onClick={() => act({ type: 'mortgage', tile: idx })}>
            🏦
          </button>
        ) : (
          <button
            className="mini-btn"
            disabled={!canManage || snap.players.find((p) => p.id === snap.you)!.money < unmortgageCost}
            title={`Выкупить за ${fmtMoney(unmortgageCost, cur)}`}
            onClick={() => act({ type: 'unmortgage', tile: idx })}
          >
            ↩
          </button>
        )}
      </div>
    </div>
  );
}
