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
