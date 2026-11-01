// Общие типы игры — используются и сервером, и клиентом.

// ---------- Конфиг доски (board.json) ----------

export interface CardDef {
  text: string;
  effect: CardEffect;
}

export type CardEffect =
  | { type: 'money'; amount: number } // +/- деньги; отрицательный = платишь в банк
  | { type: 'moneyFromEach'; amount: number } // получить с каждого игрока
  | { type: 'moneyToEach'; amount: number } // заплатить каждому игроку
  | { type: 'moveTo'; tile: number | string } // перейти на поле (индекс или точное название)
  | { type: 'moveBy'; steps: number } // пройти N шагов (отрицательное = назад)
  | { type: 'goToJail' }
  | { type: 'getOutOfJail' }
  | { type: 'nearestRailroad' } // к ближайшему вокзалу, рента x2
  | { type: 'nearestUtility' } // к ближайшему предприятию, плата: кубики x10
  | { type: 'repairs'; perHouse: number; perHotel: number }; // ремонт за каждый дом/отель

export interface StreetTile {
  type: 'street';
  name: string;
  group: string;
  price: number;
  rent: [number, number, number, number, number, number]; // [база, 1 дом, 2, 3, 4, отель]
  houseCost: number;
}

export interface RailroadTile {
  type: 'railroad';
  name: string;
  price: number;
  rent: [number, number, number, number]; // рента по числу вокзалов у владельца
}

export interface UtilityTile {
  type: 'utility';
  name: string;
  price: number;
  rentMultiplier: [number, number]; // xN при одном / двух предприятиях
}

export interface TaxTile {
  type: 'tax';
  name: string;
  amount: number;
}

export interface SimpleTile {
  type: 'go' | 'jail' | 'free-parking' | 'go-to-jail' | 'chance' | 'chest';
  name: string;
}

export type Tile = StreetTile | RailroadTile | UtilityTile | TaxTile | SimpleTile;

export interface BoardConfig {
  meta: { title: string; currency: string };
  rules: {
    startMoney: number;
    goSalary: number;
    jailFine: number;
    housesLimit: number | null;
    hotelsLimit: number | null;
  };
  groups: Record<string, { name: string; color: string }>;
  tiles: Tile[];
  chance: CardDef[];
  chest: CardDef[];
}

// ---------- Состояние игры (то, что видит клиент) ----------

export type Phase = 'lobby' | 'roll' | 'buy' | 'debt' | 'manage' | 'over';

export interface PublicPlayer {
  id: string;
  name: string;
  color: string;
  money: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  jailCards: number;
  bankrupt: boolean;
  connected: boolean;
  isHost: boolean;
  netWorth: number;
}

export interface PropertyState {
  owner: string | null;
  mortgaged: boolean;
  houses: number; // 0..5, 5 = отель
}

export interface LogEntry {
  id: number;
  text: string;
}

export interface LastCard {
  seq: number;
  deck: 'chance' | 'chest';
  text: string;
  drawer: string;
}

export interface DebtInfo {
  player: string;
  amount: number;
  creditor: string | 'bank';
  reason: string; // 'rent' | 'tax' | 'card' | 'jail-fine' | 'card-toEach'
  recipients?: string[]; // для moneyToEach
}

export interface GameState {
  phase: Phase;
  turnPlayer: string | null;
  turnNumber: number;
  dice: [number, number] | null;
  rollId: number;
  doublesCount: number;
  pendingExtraRoll: boolean;
  properties: Record<number, PropertyState>;
  debt: DebtInfo | null;
  lastCard: LastCard | null;
  cardSeq: number;
  winner: string | null;
  log: LogEntry[];
  logSeq: number;
  bank: { houses: number | null; hotels: number | null };
}

export interface RoomSnapshot {
  code: string;
  board: BoardConfig;
  state: GameState;
  players: PublicPlayer[];
  started: boolean;
  you: string | null;
}

// ---------- Действия клиента ----------

export type GameAction =
  | { type: 'startGame' }
  | { type: 'roll' }
  | { type: 'buy' }
  | { type: 'decline' }
  | { type: 'endTurn' }
  | { type: 'payJailFine' }
  | { type: 'useJailCard' }
  | { type: 'build'; tile: number }
  | { type: 'sellHouse'; tile: number }
  | { type: 'mortgage'; tile: number }
  | { type: 'unmortgage'; tile: number }
  | { type: 'payDebt' }
  | { type: 'declareBankrupt' };
