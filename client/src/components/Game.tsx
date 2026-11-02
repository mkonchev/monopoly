import { useState } from 'react';
import type { GameAction, RoomSnapshot } from '../../../shared/src/types';
import Board from './Board';
import CenterPanel from './CenterPanel';
import Players from './Players';
import MyProperties from './MyProperties';
import LogPanel from './LogPanel';
import CardModal from './CardModal';
import TileInfo from './TileInfo';
import Deals from './Deals';

interface Props {
  snap: RoomSnapshot;
  act: (a: GameAction) => void;
  toast: (m: string) => void;
  leave: () => void;
}

export default function Game({ snap, act, leave }: Props) {
  const [infoTile, setInfoTile] = useState<number | null>(null);
  const pickMode = snap.state.phase === 'triplet' && snap.you === snap.state.turnPlayer;
  return (
    <div className="game">
      <header className="game-header">
        <span className="game-title">🎩 {snap.board.meta.title}</span>
        <span className="room-badge">{snap.code}</span>
        <button className="link-btn" onClick={leave}>
          Выйти
        </button>
      </header>
      <div className="game-body">
        <Board
          snap={snap}
          onSelectTile={setInfoTile}
          onPickTile={pickMode ? (idx) => act({ type: 'tripletMove', tile: idx }) : undefined}
        >
          <CenterPanel snap={snap} act={act} />
        </Board>
        <aside className="side">
          <Players snap={snap} />
          <Deals snap={snap} act={act} />
          <MyProperties snap={snap} act={act} onSelectTile={setInfoTile} />
          <LogPanel snap={snap} />
        </aside>
      </div>
      <CardModal snap={snap} />
      {infoTile !== null && <TileInfo idx={infoTile} snap={snap} onClose={() => setInfoTile(null)} />}
    </div>
  );
}
