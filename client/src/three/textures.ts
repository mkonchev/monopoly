// Canvas-текстуры верхних граней клеток: цветная полоса улицы, название, цена.
import * as THREE from 'three';
import type { BoardConfig, Tile } from '../../../shared/src/types';
import { tilePlacement, type TilePlacement } from './placement';

const cache = new Map<string, THREE.CanvasTexture>();

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number): void {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  lines.push(line);
  for (const l of lines.slice(0, 3)) {
    ctx.fillText(l, x, y);
    y += lh;
  }
}

// Рисует «портрет» клетки (полоса сверху, название, цена) и возвращает canvas.
function drawPortrait(board: BoardConfig, tile: Tile, destroyed: boolean): HTMLCanvasElement {
  const W = 256;
  const H = 384;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;

  if (destroyed) {
    // кратер
    const g = ctx.createRadialGradient(W / 2, H / 2 - 20, 20, W / 2, H / 2, 240);
    g.addColorStop(0, '#3c3c42');
    g.addColorStop(0.6, '#18181c');
    g.addColorStop(1, '#26262b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#9a9aa5';
    ctx.font = 'bold 64px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🕳️', W / 2, H / 2 + 10);
    ctx.font = 'bold 30px Arial';
    ctx.fillStyle = '#77777f';
    ctx.fillText('— уничто —', W / 2, H - 90);
    ctx.fillText('жено —', W / 2, H - 52);
    return cv;
  }

  ctx.fillStyle = '#f7f4ea';
  ctx.fillRect(0, 0, W, H);

  const group = tile.type === 'street' ? board.groups[tile.group] : null;

  // цветная полоса (верх портрета)
  const barH = 90;
  if (group) {
    ctx.fillStyle = group.color;
    ctx.fillRect(0, 0, W, barH);
  } else if (tile.type === 'chance') {
    ctx.fillStyle = '#f7941d';
    ctx.fillRect(0, 0, W, barH);
    ctx.font = '44px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('❓', W / 2, barH / 2 + 16);
  } else if (tile.type === 'chest') {
    ctx.fillStyle = '#1e88e5';
    ctx.fillRect(0, 0, W, barH);
    ctx.font = '44px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎁', W / 2, barH / 2 + 16);
  } else if (tile.type === 'casino') {
    ctx.fillStyle = '#7b1fa2';
    ctx.fillRect(0, 0, W, barH);
    ctx.font = '44px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎰', W / 2, barH / 2 + 16);
  } else if (tile.type === 'go') {
    ctx.fillStyle = '#f7f4ea';
    ctx.font = '52px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🏁', W / 2, 70);
  } else if (tile.type === 'jail') {
    ctx.fillStyle = '#f7f4ea';
    ctx.font = '52px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🚔', W / 2, 70);
  } else if (tile.type === 'go-to-jail') {
    ctx.fillStyle = '#f7f4ea';
    ctx.font = '52px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('👮', W / 2, 70);
  }

  // название
  ctx.fillStyle = '#1c1c1c';
  ctx.font = 'bold 30px Arial';
  ctx.textAlign = 'center';
  wrapText(ctx, tile.name, W / 2, barH + 66, W - 24, 38);

  // цена
  const price = 'price' in tile ? tile.price : 0;
  if (price > 0) {
    ctx.fillStyle = '#555';
    ctx.font = '26px Arial';
    ctx.fillText('Ⓜ ' + Math.round(price / 1000) + 'к', W / 2, H - 40);
  }
  return cv;
}

// Собирает итоговую текстуру верхней грани с учётом ориентации (полоса к внешнему краю).
export function tileTopTexture(board: BoardConfig, idx: number, destroyed: boolean): THREE.CanvasTexture {
  const key = idx + (destroyed ? ':d' : '');
  const cached = cache.get(key);
  if (cached) return cached;

  const tile = board.tiles[idx];
  const p: TilePlacement = tilePlacement(idx);
  const portrait = drawPortrait(board, tile, destroyed);

  const cv = document.createElement('canvas');
  const W = p.side === 'left' || p.side === 'right' ? 384 : 512;
  const H = p.side === 'left' || p.side === 'right' ? 512 : 384;
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;

  if (p.side === 'corner') {
    ctx.drawImage(portrait, 0, 0, W, H);
  } else if (p.side === 'bottom') {
    // полоса к южному краю
    ctx.translate(W / 2, H / 2);
    ctx.rotate(Math.PI);
    ctx.drawImage(portrait, -W / 2, -H / 2, W, H);
  } else if (p.side === 'top') {
    ctx.drawImage(portrait, 0, 0, W, H);
  } else if (p.side === 'left') {
    // полоса к западному краю
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(portrait, -W / 2, -H / 2, W, H);
  } else {
    ctx.translate(W / 2, H / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(portrait, -W / 2, -H / 2, W, H);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

// Центральная плита доски: зелёное сукно с логотипом
export function centerTexture(): THREE.CanvasTexture {
  const key = 'center';
  const cached = cache.get(key);
  if (cached) return cached;
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#2e5d34');
  g.addColorStop(1, '#1e4023');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(255, 213, 79, 0.5)';
  ctx.lineWidth = 6;
  ctx.strokeRect(40, 40, S - 80, S - 80);
  ctx.fillStyle = 'rgba(255, 213, 79, 0.85)';
  ctx.font = 'bold 110px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText('МОНОПОЛИЯ', S / 2, S / 2 - 20);
  ctx.font = '34px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('СЫКТЫВКАР EDITION', S / 2, S / 2 + 40);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

// Текстура кратера для боковых граней уничтоженной клетки
export function craterSideTexture(): THREE.CanvasTexture {
  const key = 'crater-side';
  const cached = cache.get(key);
  if (cached) return cached;
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 64;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#1c1c20';
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = '#2e2e34';
  for (let i = 0; i < 12; i++) {
    ctx.fillRect((i * 37) % 120, 10 + ((i * 23) % 40), 10, 6);
  }
  const tex = new THREE.CanvasTexture(cv);
  cache.set(key, tex);
  return tex;
}

// Грань скоростного кубика: числа 1-3 или символы
export function speedFaceTexture(face: string): THREE.CanvasTexture {
  const key = 'speed' + face;
  const cached = cache.get(key);
  if (cached) return cached;
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#e6f4e6';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#2f7d32';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, S - 6, S - 6);
  ctx.fillStyle = '#1c5c20';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (face === 'bus' || face === 'm1') {
    ctx.font = '58px Arial';
    ctx.fillText(face === 'bus' ? '🚌' : '🎩', S / 2, S / 2 + 4);
  } else {
    ctx.font = 'bold 64px Arial';
    ctx.fillText(face, S / 2, S / 2 + 4);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

// Грань кубика с точками (значения 1..6)
export function dieFaceTexture(value: number | string, color = '#ffffff'): THREE.CanvasTexture {
  const key = 'die' + value + color;
  const cached = cache.get(key);
  if (cached) return cached;
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, S, S);
  const grd = ctx.createLinearGradient(0, 0, S, S);
  grd.addColorStop(0, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#1c1c1c';
  const P: Record<string, [number, number][]> = {
    1: [[64, 64]],
    2: [[34, 34], [94, 94]],
    3: [[30, 30], [64, 64], [98, 98]],
    4: [[34, 34], [94, 34], [34, 94], [94, 94]],
    5: [[34, 34], [94, 34], [64, 64], [34, 94], [94, 94]],
    6: [[34, 28], [94, 28], [34, 64], [94, 64], [34, 100], [94, 100]],
  };
  for (const [px, py] of P[String(value)]) {
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}
