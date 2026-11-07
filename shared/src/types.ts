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
  type: 'go' | 'jail' | 'free-parking' | 'casino' | 'go-to-jail' | 'chance' | 'chest';
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
    loans?: LoanRules;
    cops?: CopsRules;
    drone?: DroneRules;
  };
  groups: Record<string, { name: string; color: string }>;
  tiles: Tile[];
  chance: CardDef[];
  chest: CardDef[];
}

export interface LoanRules {
  bankRate: number; // ставка банка за ход должника (0.15 = 15%)
  playerRate: number; // ставка займа между игроками
  termTurns: number; // срок кредита в ходах должника
  extendRateFactor: number; // продление: ставка умножается на это
  maxExtensions: number;
  maxPrincipal: number; // максимальная сумма тела кредита
  rescueSharePercent: number; // доля ренты спасателю (50 = половина)
}

// Активный кредит игрока.
export interface LoanState {
  creditor: 'bank' | string; // банк или id игрока-кредитора
  principal: number;
  debt: number; // текущий долг с процентами
  rate: number;
  turnsServed: number;
  termTurns: number;
  extensions: number;
  due: boolean; // срок вышел — нужно платить/продлевать, иначе в конце хода изъятие
  rescued: boolean; // долг погашен спасателем: он же кредитор и получает долю ренты
}

export interface TradeOffer {
  id: string;
  from: string;
  to: string;
  giveTiles: number[];
  giveMoney: number;
  wantTiles: number[];
  wantMoney: number;
}

export interface LoanRequest {
  id: string;
  from: string; // заёмщик
  to: string; // потенциальный кредитор
  amount: number;
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
  offers: { trades: TradeOffer[]; loanRequests: LoanRequest[] };
  awaitingOffer: AwaitingOffer | null;
  // Событие «Сыковские менты»: клетки с мигалками и остаток бросков
  cops: { tiles: number[]; rollsLeft: number } | null;
  copsFinePending: boolean; // игрок приехал на клетку — штраф спишется при завершении разрешения
  // Событие «Дрон»: уничтоженное поле (0 или 1 раз за игру)
  drone: { tile: number; seq: number } | null;
  // Казино (бывшая бесплатная стоянка): банк из всех штрафов и выплат банку
  casinoPot: number;
  lastCasinoRoll: { seq: number; player: string; roll: number; payout: number } | null;
  casinoSeq: number;
  // Быстрый режим (скоростной кубик)
  speedDie: boolean;
  speedFace: SpeedFace | null;
  pendingMrMonopoly: boolean; // ход Мистера Монополии отложен до разрешения покупки/долга
}

// ---------- Состояние игры (то, что видит клиент) ----------

export type Phase = 'lobby' | 'roll' | 'buy' | 'debt' | 'manage' | 'over' | 'bus' | 'triplet' | 'casino';

// Грань скоростного кубика (быстрый режим).
export type SpeedFace = '1' | '2' | '3' | 'bus' | 'm1';

// Ожидание ответа на предложение обмена/займа: ход предложившего приостановлен.
export interface AwaitingOffer {
  kind: 'trade' | 'loan';
  id: string;
  from: string;
  to: string;
}

// Случайное событие «Сыковские менты».
export interface CopsRules {
  chance: number; // шанс появления на каждом броске (0.05 = 5%)
  fine: number; // штраф за попадание на клетку с ментами
  rolls: number; // сколько бросков (всех игроков) патрулируют
  tiles: number; // сколько клеток с мигалками
}

// Случайное событие «Дрон»: раз за игру уничтожает случайное поле.
export interface DroneRules {
  chance: number; // шанс появления на каждом броске (0.02 = 2%)
}

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
  loan: LoanState | null;
  figure: string | null; // id фигурки из FIGURES
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
  | { type: 'declareBankrupt' }
  // кредиты
  | { type: 'takeLoan'; amount: number }
  | { type: 'requestLoanFrom'; to: string; amount: number }
  | { type: 'acceptLoanRequest'; id: string }
  | { type: 'declineLoanRequest'; id: string }
  | { type: 'repayLoan' }
  | { type: 'extendLoan' }
  | { type: 'defaultLoan' }
  | { type: 'rescueLoan'; target: string }
  // обмен
  | { type: 'proposeTrade'; to: string; giveTiles: number[]; giveMoney: number; wantTiles: number[]; wantMoney: number }
  | { type: 'acceptTrade'; id: string }
  | { type: 'declineTrade'; id: string }
  | { type: 'cancelOffer'; kind: 'trade' | 'loan'; id: string }
  // быстрый режим (скоростной кубик)
  | { type: 'setSpeedDie'; enabled: boolean }
  | { type: 'busMove'; choice: 'sum' | 'd1' | 'd2' }
  | { type: 'tripletMove'; tile: number }
  // фигурка
  | { type: 'setFigure'; figure: string }
  // казино
  | { type: 'casinoBet'; numbers: number[] };
