// Очередь анимаций: дифф снапшотов сервера → события, которые сцена
// отыгрывает последовательно. Финальное состояние не теряется: после
// опустошения очереди сцена синхронизируется с актуальным снапшотом.
import type { RoomSnapshot } from '../../../shared/src/types';
import { tilePlacement } from './placement';

export type AnimEvent =
  | { kind: 'dice'; v1: number; v2: number; speed: string | null; id: number }
  | { kind: 'move'; player: string; path: number[]; glide: boolean }
  | { kind: 'build'; tile: number; houses: number }
  | { kind: 'cops'; tiles: number[] }
  | { kind: 'drone'; tile: number };

export function eventDuration(e: AnimEvent): number {
  switch (e.kind) {
    case 'dice': return 1000;
    case 'move': return e.glide ? 650 : e.path.length * 300;
    case 'build': return 400;
    case 'cops': return 2400;
    case 'drone': return 2800;
  }
}

export class AnimQueue {
  pending: AnimEvent[] = [];
  active: { e: AnimEvent; start: number } | null = null;

  // анимируемое состояние, читается сценой в useFrame
  figures = new Map<string, { x: number; z: number }>();
  hop: { player: string; from: { x: number; z: number }; to: { x: number; z: number }; start: number; dur: number; glide: boolean } | null = null;
  dice: { start: number; v1: number; v2: number; speed: string | null } | null = null;
  lastDice: { v1: number; v2: number; speed: string | null } | null = null;
  builds = new Map<string, number>(); // tile → время постройки последней
  cops: { tiles: number[]; start: number } | null = null;
  drone: { tile: number; start: number } | null = null;

  // центры клеток в мировых координатах
  private center(idx: number): { x: number; z: number } {
    const p = tilePlacement(idx);
    return { x: p.x, z: p.z };
  }

  // Первичный синк без анимаций (подключение/реконнект)
  syncInstant(snap: RoomSnapshot): void {
    for (const p of snap.players) {
      if (!p.bankrupt) {
        const c = this.center(p.position);
        this.figures.set(p.id, { x: c.x, z: c.z });
      } else this.figures.delete(p.id);
    }
    this.pending = [];
    this.active = null;
    this.hop = null;
    this.dice = null;
    this.cops = snap.state.cops ? { tiles: snap.state.cops.tiles, start: performance.now() } : null;
    this.drone = snap.state.drone ? { tile: snap.state.drone.tile, start: performance.now() } : null;
  }

  // Дифф снапшотов → события в очередь
  pushFromDiff(prev: RoomSnapshot, next: RoomSnapshot): void {
    // кубики
    if (next.state.dice && (!prev || prev.state.rollId !== next.state.rollId)) {
      this.pending.push({ kind: 'dice', v1: next.state.dice[0], v2: next.state.dice[1], speed: next.state.speedFace, id: next.state.rollId });
    }
    // перемещения игроков
    for (const p of next.players) {
      const before = prev?.players.find((q) => q.id === p.id);
      const oldPos = before?.position ?? p.position;
      if (oldPos === p.position || p.bankrupt) continue;
      const fwd = (p.position - oldPos + 40) % 40;
      const back = (oldPos - p.position + 40) % 40;
      if (fwd > 0 && fwd <= 12) {
        const path: number[] = [];
        for (let k = 1; k <= fwd; k++) path.push((oldPos + k) % 40);
        this.pending.push({ kind: 'move', player: p.id, path, glide: false });
      } else if (back > 0 && back <= 12) {
        const path: number[] = [];
        for (let k = 1; k <= back; k++) path.push((oldPos - k + 40) % 40);
        this.pending.push({ kind: 'move', player: p.id, path, glide: false });
      } else {
        this.pending.push({ kind: 'move', player: p.id, path: [oldPos, p.position], glide: true });
      }
    }
    // постройки
    for (const [iStr, ps] of Object.entries(next.state.properties)) {
      const i = Number(iStr);
      const before = prev?.state.properties[i];
      if (before && ps.houses > before.houses && ps.houses > 0) {
        this.pending.push({ kind: 'build', tile: i, houses: ps.houses });
      }
    }
    // менты
    if (next.state.cops && (!prev?.state.cops || !prev.state.cops.tiles.length)) {
      this.pending.push({ kind: 'cops', tiles: next.state.cops.tiles });
    }
    // дрон
    if (next.state.drone && (!prev?.state.drone || prev.state.drone.seq !== next.state.drone.seq)) {
      this.pending.push({ kind: 'drone', tile: next.state.drone.tile });
    }
  }

  // вызывается из useFrame: активирует следующее событие, когда текущее отыграно
  pump(now: number, snap: RoomSnapshot): void {
    if (!this.active && this.pending.length) {
      const e = this.pending.shift()!;
      this.active = { e, start: now };
      this.activate(e, now, snap);
    }
    if (this.active) {
      const dur = eventDuration(this.active.e);
      if (now - this.active.start >= dur) {
        this.finish(this.active.e, snap);
        this.active = null;
      }
    }
  }

  private activate(e: AnimEvent, now: number, snap: RoomSnapshot): void {
    switch (e.kind) {
      case 'dice':
        this.dice = { start: now, v1: e.v1, v2: e.v2, speed: e.speed };
        break;
      case 'move': {
        const from = this.figures.get(e.player) ?? this.center(e.path[0]);
        const to = this.center(e.path[e.path.length - 1]);
        this.hop = { player: e.player, from: { x: from.x, z: from.z }, to, start: now, dur: eventDuration(e), glide: e.glide };
        break;
      }
      case 'build':
        this.builds.set('b' + e.tile, now);
        break;
      case 'cops':
        this.cops = { tiles: e.tiles, start: now };
        break;
      case 'drone':
        this.drone = { tile: e.tile, start: now };
        break;
    }
    void snap;
  }

  private finish(e: AnimEvent, snap: RoomSnapshot): void {
    switch (e.kind) {
      case 'move': {
        const c = this.center(e.path[e.path.length - 1]);
        this.figures.set(e.player, { x: c.x, z: c.z });
        this.hop = null;
        break;
      }
      case 'dice':
        this.lastDice = { v1: e.v1, v2: e.v2, speed: e.speed };
        this.dice = null;
        break;
      case 'cops':
        if (snap.state.cops) this.cops = { tiles: snap.state.cops.tiles, start: this.cops?.start ?? performance.now() };
        break;
      case 'drone':
        if (snap.state.drone) this.drone = { tile: snap.state.drone.tile, start: this.drone?.start ?? performance.now() };
        break;
      case 'build':
        break;
    }
  }
}
