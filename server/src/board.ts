import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BoardConfig } from '../../shared/src/types';
import { validateBoard } from '../../shared/src/validate';

function readBoard(p: string): BoardConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    throw new Error(`Не удалось прочитать ${p}: ${(e as Error).message}`);
  }
  const errors = validateBoard(raw as BoardConfig);
  if (errors.length > 0) {
    throw new Error(`Ошибки в ${p}:\n  - ${errors.join('\n  - ')}`);
  }
  return raw as BoardConfig;
}

export function loadBoard(): BoardConfig {
  const envPath = process.env.BOARD_PATH;
  if (envPath) return readBoard(envPath);

  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'shared', 'board.json');
    if (fs.existsSync(candidate)) return readBoard(candidate);
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }

  // Fallback: относительно собранного файла (server/dist/index.js -> корень репозитория)
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidate = path.resolve(here, '../../shared/board.json');
  if (fs.existsSync(candidate)) return readBoard(candidate);

  throw new Error('board.json не найден. Положите его в shared/board.json или укажите BOARD_PATH');
}
