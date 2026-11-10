import { useState } from 'react';
import type { GameAction, RoomSnapshot } from '../../../shared/src/types';
import BoardScene from '../three/BoardScene';
import CenterPanel from './CenterPanel';
import Players from './Players';
import MyProperties from './MyProperties';
import LogPanel from './LogPanel';
import CardModal from './CardModal';
import TileInfo from './TileInfo';
import Deals from './Deals';
import AllProperties from './AllProperties';
import CasinoModal from './CasinoModal';

interface Props {
  snap: RoomSnapshot;
  act: (a: GameAction) => void;
  toast: (m: string) => void;
  leave: () => void;
}

export default function Game({ snap, act, leave }: Props) {
  const [infoTile, setInfoTile] = useState<number | null>(null);
  const [follow, setFollow] = useState(false);
  const pickMode = snap.state.phase === 'triplet' && snap.you === snap.state.turnPlayer;
  return (
    <div className="game">
      <div className="game-body">
        <AllProperties snap={snap} onSelectTile={setInfoTile} />
        <div className="scene-wrap">
          <BoardScene
            snap={snap}
            follow={follow}
            onSelectTile={setInfoTile}
            pickMode={pickMode}
            onPickTile={(idx) => act({ type: 'tripletMove', tile: idx })}
          />
          <div className="scene-center">
            <CenterPanel snap={snap} act={act} hideDice />
          </div>
          <button
            className={'follow-btn' + (follow ? ' on' : '')}
            title="Камера следует за твоей фигуркой"
            onClick={() => setFollow((f) => !f)}
          >
            🎥 {follow ? 'Не следить' : 'Следить'}
          </button>
        </div>
        <aside className="side">
          <div className="side-meta">
            <span className="room-badge">{snap.code}</span>
            <button className="link-btn" onClick={leave}>
              Выйти
            </button>
          </div>
          <Players snap={snap} />
          <Deals snap={snap} act={act} />
          <MyProperties snap={snap} act={act} onSelectTile={setInfoTile} />
          <LogPanel snap={snap} />
        </aside>
      </div>
      <CardModal snap={snap} />
      <CasinoModal snap={snap} act={act} />
      {infoTile !== null && <TileInfo idx={infoTile} snap={snap} onClose={() => setInfoTile(null)} />}
    </div>
  );
}
