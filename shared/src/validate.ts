import type { BoardConfig, CardEffect, Tile } from './types';

const TILE_TYPES: Tile['type'][] = [
  'go', 'jail', 'free-parking', 'casino', 'go-to-jail', 'chance', 'chest', 'tax', 'street', 'railroad', 'utility',
];

// Возвращает список ошибок конфига; пустой список = конфиг корректен.
export function validateBoard(b: BoardConfig): string[] {
  const errors: string[] = [];
  const add = (m: string) => errors.push(m);

  if (!b.meta || !b.meta.currency) add('meta.currency обязателен');
  if (!b.rules || typeof b.rules.startMoney !== 'number') add('rules.startMoney обязателен');
  if (!b.rules || typeof b.rules.goSalary !== 'number') add('rules.goSalary обязателен');
  if (!b.rules || typeof b.rules.jailFine !== 'number') add('rules.jailFine обязателен');

  if (!Array.isArray(b.tiles)) {
    add('tiles должен быть массивом');
    return errors;
  }
  if (b.tiles.length !== 40) add(`tiles: должно быть ровно 40 полей, сейчас ${b.tiles.length}`);

  const names = new Map<string, number>();
  // Уникальность важна для полей, на которые карточки могут ссылаться по названию.
  b.tiles.forEach((t, i) => {
    const name = t.name ? String(t.name).trim() : '';
    if (!name) add(`tile[${i}]: отсутствует name`);
    const mustBeUnique = t.type === 'street' || t.type === 'railroad' || t.type === 'utility';
    if (mustBeUnique && names.has(name)) add(`tile[${i}]: дублируется название "${name}" (tile[${names.get(name)!}])`);
    else names.set(name, i);
    if (!TILE_TYPES.includes(t.type)) add(`tile[${i}] ("${name}"): неизвестный тип "${t.type}"`);

    if (t.type === 'street') {
      if (!t.group || !b.groups?.[t.group]) add(`tile[${i}] ("${name}"): неизвестная группа "${t.group}"`);
      if (typeof t.price !== 'number' || t.price <= 0) add(`tile[${i}] ("${name}"): неверная цена`);
      if (!Array.isArray(t.rent) || t.rent.length !== 6 || t.rent.some((r) => typeof r !== 'number')) {
        add(`tile[${i}] ("${name}"): rent должен быть массивом из 6 чисел [база, 1-4 дома, отель]`);
      }
      if (typeof t.houseCost !== 'number' || t.houseCost <= 0) add(`tile[${i}] ("${name}"): неверная houseCost`);
    }
    if (t.type === 'railroad') {
      if (!Array.isArray(t.rent) || t.rent.length !== 4) add(`tile[${i}] ("${name}"): rent должен быть массивом из 4 чисел`);
      if (typeof t.price !== 'number' || t.price <= 0) add(`tile[${i}] ("${name}"): неверная цена`);
    }
    if (t.type === 'utility') {
      if (!Array.isArray(t.rentMultiplier) || t.rentMultiplier.length !== 2) add(`tile[${i}] ("${name}"): rentMultiplier должен быть массивом из 2 чисел`);
      if (typeof t.price !== 'number' || t.price <= 0) add(`tile[${i}] ("${name}"): неверная цена`);
    }
    if (t.type === 'tax' && (typeof t.amount !== 'number' || t.amount <= 0)) {
      add(`tile[${i}] ("${name}"): неверная сумма налога`);
    }
  });

  for (const key of ['chance', 'chest'] as const) {
    const deck = b[key];
    if (!Array.isArray(deck) || deck.length === 0) {
      add(`${key}: должен быть непустым массивом карточек`);
      continue;
    }
    deck.forEach((c, i) => {
      if (!c.text) add(`${key}[${i}]: отсутствует текст`);
      if (c.image !== undefined && typeof c.image !== 'string') add(`${key}[${i}]: image должен быть строкой`);
      if (!c.effect || !isEffect(c.effect)) add(`${key}[${i}]: неизвестный или отсутствующий effect`);
      else {
        const e = c.effect as CardEffect;
        if (e.type === 'moveTo' && typeof e.tile === 'string' && !names.has(e.tile.trim())) {
          add(`${key}[${i}]: moveTo ссылается на несуществующее поле "${e.tile}"`);
        }
        if (e.type === 'moveTo' && typeof e.tile === 'number' && (e.tile < 0 || e.tile >= b.tiles.length)) {
          add(`${key}[${i}]: moveTo ссылается на несуществующий индекс ${e.tile}`);
        }
      }
    });
  }

  return errors;
}

function isEffect(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const t = (e as { type?: unknown }).type;
  return typeof t === 'string' && [
    'money', 'moneyFromEach', 'moneyToEach', 'moveTo', 'moveBy', 'goToJail', 'getOutOfJail', 'nearestRailroad', 'nearestUtility', 'repairs',
  ].includes(t);
}
