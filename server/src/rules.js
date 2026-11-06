// Правила гри беремо з самої гри (src/online/profile.js), щоб сервер і клієнт не розійшлися.
// Модулі гри при імпорті торкаються браузера (localStorage, addEventListener), тому перед імпортом
// ставимо мінімальні заглушки. Пам'ять заглушки серверу не потрібна: клуби живуть у базі.
const mem = new Map();
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage?.setItem) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    },
  });
}

const profile = await import('../../src/online/profile.js');

/** Новий онлайн-клуб за правилами гри: 300 монет, рейтинг 1000, 11 героїв. */
export const newClub = () => profile.newClub();
const squad = await import('../../src/state/squad.js');

/** Загальна сила героя (OVR) і риси героїв, як їх показує гра: для картки клубу в боті. */
export const ovr = (hero) => squad.ovr(hero);
export const TRAITS = profile.TRAITS;

// ------------------------------------------------------------------ онлайн-хаб (API 2): ті самі правила, що в грі
/** Чистка клубу й героїв із мережі (назва, прапор normFlag, навички 8…99, ролі зі слотів схеми). */
export const fromWire = (w) => profile.fromWire(w);
export const trainPrice = (v) => profile.trainPrice(v);
export const SCOUT_PRICE = profile.SCOUT_PRICE;
export const RARITY = profile.RARITY;
export const clubXpNeed = (l) => profile.clubXpNeed(l);
export const xpNeed = (l) => squad.xpNeed(l);
export const newHero = (slot, used, rar) => profile.newHero(slot, used, rar);   // rar не задано — рідкість за шансом скаута
// Паки магазину (PACKS, packRarity): поки їх немає в profile.js гілки сервера, маршрут /club/pack не існує (клієнт бачить 404)
export const PACKS = profile.PACKS && typeof profile.packRarity === 'function' ? profile.PACKS : null;
export const packRarity = (kind) => profile.packRarity(kind);
export const slotsOf = (form) => profile.slotsOf(form);
export const plain = (v) => profile.plain(v);

// applyResult гри рахує на OP (клуб пристрою). Сервер підставляє в OP клуб із бази, кличе ту саму функцію й забирає
// підсумок: одна формула нагород і Ело на гру й сервер. Усе синхронно, тож два матчі не переплетуться.
const STATE_KEYS = ['club', 'heroes', 'lvl', 'xp', 'coins', 'rating', 'rec', 'goals', 'games'];
/**
 * Нагороди за матч для клубу state ({ club, heroes, lvl, xp, coins, rating, rec, goals, games }).
 * Повертає новий стан і rew = { dR, coins, xp, clubUp, lvl, ups } як у грі; state не змінюється.
 */
export function reward(state, outcome, myGoals, oppRating, scorers) {
  const op = profile.OP, s = structuredClone(state);
  for (const k of STATE_KEYS) op[k] = s[k];
  const rew = profile.applyResult(outcome, myGoals, oppRating, scorers);
  const out = {};
  for (const k of STATE_KEYS) out[k] = op[k];
  return { state: structuredClone(out), rew };
}

// Квести (src/online/quests.js): поки модуля немає в гілці, на якій стоїть сервер, частина 'quests' вимкнена
let quests = null;
try { quests = await import('../../src/online/quests.js'); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
/** Чи є в грі чисті експорти квестів для сервера. */
export const QUESTS = !!(quests && ['questPeriods', 'dayIds', 'weekIds', 'questDef', 'questStep', 'factsOf', 'questsLeft'].every((k) => typeof quests[k] === 'function'));
export const questPeriods = (t) => quests.questPeriods(t);
export const questsLeft = (t) => quests.questsLeft(t);
export const dayIds = (d) => quests.dayIds(d);
export const weekIds = (w) => quests.weekIds(w);
export const questDef = (id) => quests.questDef(id);
export const questStep = (id, m) => quests.questStep(id, m);
export const factsOf = (r, heroes, myR, oppR) => quests.factsOf(r, heroes, myR, oppR);
