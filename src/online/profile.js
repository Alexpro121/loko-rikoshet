// Онлайн-клуб гравця: окремий від кар'єри «Локомотива» — своя назва, прапор, форма, 11 унікальних героїв, рівень,
// рейтинг і монети. Зберігається окремо (loko-online-v1), щоб онлайн не чіпав прогрес кар'єри.
import { ACADEMY, FORMATIONS, freshHair } from '../config.js';
import { makeStats, keysFor, ovr, gainXp } from '../state/squad.js';
import { rollFlag, normFlag, upgradeFlag, flagSvg } from './flag.js';
import { newName } from './names.js';
// дата дня за Києвом для ринку: модуль квестів імпортує OP звідси, але кличе лише у функціях, тож коло імпорту безпечне
import { questPeriods, questsLeft } from './quests.js';

export { flagSvg };

const KEY = 'loko-online-v1';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (a, rnd = Math.random) => a[(rnd() * a.length) | 0];
const surname = (n) => String(n).split(' ').slice(-1)[0];   // так героя показує табло, і за цим йому зараховують голи

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const NAMES = ['КАЖАНИ', 'ГРІМ', 'ВОВКИ', 'БУРЯ', 'КОМЕТА', 'ЛЕВИ', 'ШТОРМ', 'ЯСТРУБИ', 'ВУЛКАН', 'МАЯК', 'ЛАВІНА', 'ЗУБРИ', 'ДРАКОНИ', 'ЕКСПРЕС', 'ТАЙФУН', 'БЛИСКАВКА', 'ВІТЕР', 'ОТАМАН', 'КОЗАКИ', 'ФЕНІКС'];
const CITIES = ['Полтава', 'Черкаси', 'Суми', 'Житомир', 'Ужгород', 'Рівне', 'Чернігів', 'Вінниця', 'Ізмаїл', 'Кременчук', 'Бердичів', 'Дрогобич', 'Мукачево', 'Умань', 'Коломия', 'Ніжин', 'Біла Церква', 'Прилуки'];

const GK_COLS = ['#e0a81c', '#d86a8a', '#9fbf3a', '#3fb7d8', '#f08a24', '#8a5cd6'];

/** Унікальні риси героїв: кожна підсилює одну навичку й дає героєві характер. */
export const TRAITS = {
  cannon: { name: 'Гармата', stat: 'shoot', b: 8, tip: 'удар, від якого тріщать штанги' },
  rocket: { name: 'Ракета', stat: 'pace', b: 8, tip: 'найшвидший на полі' },
  wall: { name: 'Стіна', stat: 'tack', b: 8, tip: 'через нього не пройти' },
  maestro: { name: 'Маестро', stat: 'pass', b: 8, tip: 'пас у будь-яку щілину' },
  magic: { name: 'Чарівник', stat: 'drib', b: 8, tip: 'м’яч прилипає до ноги' },
  brain: { name: 'Мозок', stat: 'iq', b: 8, tip: 'бачить гру на два ходи вперед' },
  cat: { name: 'Кішка', stat: 'react', b: 8, tip: 'стрибає раніше, ніж б’ють' },
  octo: { name: 'Восьминіг', stat: 'reach', b: 8, tip: 'дістає м’яч у дев’ятці' },
  glue: { name: 'Клей', stat: 'hands', b: 8, tip: 'ловить навіть гарматні удари' },
};
const FIELD_TRAITS = { D: ['wall', 'brain', 'rocket'], M: ['maestro', 'brain', 'magic'], W: ['rocket', 'magic', 'cannon'], F: ['cannon', 'rocket', 'magic'] };
const GK_TRAITS = ['cat', 'octo', 'glue'];
export const RARITY = {
  c: { name: 'Звичайний', base: 44, col: '#9ca3af' },
  r: { name: 'Рідкісний', base: 50, col: '#5fb3e6' },
  e: { name: 'Епічний', base: 56, col: '#b06ae0' },
  l: { name: 'Легенда', base: 62, col: '#e8b923' },
};
const rollRar = (rnd = Math.random) => { const r = rnd(); return r < 0.05 ? 'l' : r < 0.2 ? 'e' : r < 0.5 ? 'r' : 'c'; };

/** Схеми онлайн-клубу. Слоти: 0 — воротар, далі порядок ролей схеми; героя на слоті вважаємо гравцем цієї ролі. */
export const ONLINE_FORMS = ['433', '442', '4231', '4141', '352', '343', '532'];
export const slotsOf = (form) => [{ name: 'GK', line: 'G', num: 1 }, ...(FORMATIONS[form] || FORMATIONS['433'])];
const relabel = (heroes, form) => { const sl = slotsOf(form); heroes.forEach((e, i) => { e.role = e.pos = sl[i].name; e.line = sl[i].line; }); };
/** Однакові для обох суперників параметри прицілу й воротаря (у кар'єрі їх дають трансфери). */
export const ONLINE_AIM = { bounces: 2, jitter: 2.4 };
export const ONLINE_GK = { concede: 0.8 };
const lineOf = (s) => (s.name === 'GK' ? 'G' : s.line);

/**
 * Новий герой на слот: випадкове ім'я й вигляд (зі ширшого вибору редактора), рідкість, риса й навички. rnd — генератор:
 * Math.random або сталий за зерном (вітрина ринку дня однакова в кожному відкритті). hairs — зачіски, вже зайняті в клубі:
 * новий герой бере вільну (freshHair, рівно один виклик rnd, як і звичайний вибір).
 */
export function newHero(slot, used = new Set(), rar, rnd = Math.random, hairs = new Set()) {
  if (!rar) rar = rollRar(rnd);
  const line = lineOf(slot), R = RARITY[rar];
  const name = newName(used, rar, rnd);
  const trait = pick(line === 'G' ? GK_TRAITS : FIELD_TRAITS[line], rnd);
  const stats = makeStats(line, R.base, rnd, 6), t = TRAITS[trait];
  stats[t.stat] = clamp(stats[t.stat] + t.b, 8, 99);
  const r = rnd(), beard = r < 0.55 ? 0 : r < 0.72 ? 1 : r < 0.85 ? 2 : 3;
  return {
    id: 'h' + Math.floor(rnd() * 1e9).toString(36), role: slot.name, pos: slot.name, line, num: slot.num, name, custom: true,
    stats, xp: 0, lvl: 1, apps: 0, goals: 0, rar, trait,
    skin: pick(ACADEMY.allSkins, rnd), hair: freshHair(ACADEMY.allHairs, hairs, rnd), hairCol: pick(ACADEMY.allHairCols, rnd), beard,
  };
}

/** Новий випадковий клуб: назва, місто, прапор, 11 героїв (щонайменше один епічний — зірка команди). */
export function newClub() {
  const used = new Set();
  const flag = rollFlag();
  const star = 1 + ((Math.random() * 10) | 0);
  const form = pick(['433', '442', '4231']);
  const hairs = new Set();
  const heroes = slotsOf(form).map((s, i) => { const h = newHero(s, used, i === star ? (Math.random() < 0.35 ? 'l' : 'e') : rollRar(), Math.random, hairs); hairs.add(h.hair); return h; });
  return { v: 1, club: { name: pick(NAMES), city: pick(CITIES), flag, gk: pick(GK_COLS), form }, heroes, bench: [], mark: newMark(), pity: 0, iron: 0, slots: 0, nm: 1, lvl: 1, xp: 0, coins: 300, rating: 1000, rec: { w: 0, d: 0, l: 0 }, goals: 0, games: 0 };
}

/** Мітка клубу: зерно вітрини ринку на пристрої (на сервері зерно — непрозорий id гравця). */
const newMark = () => Math.floor(Math.random() * 2 ** 31).toString(36) + Math.floor(Math.random() * 2 ** 31).toString(36);
const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const hasKey = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const count = (v, a, d, b = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, a, b) : d);
/** Ремонт за будовою (за зразком defaults/merge кар'єри): чинні значення не чіпаємо, зіпсоване поле чи героя замінюємо, клуб лишається. */
function repair(o) {
  if (!o.club || typeof o.club !== 'object') o.club = newClub().club;
  if (o.live != null && !(typeof o.live === 'object' && Number.isFinite(o.live.r) && Number.isFinite(o.live.at))) o.live = null;
  if (o.q != null && !questsOk(o.q)) delete o.q;              // квести: зіпсований набір quests.js збере заново на сьогодні
  const c = o.club;
  if (typeof c.name !== 'string' || !c.name.trim()) c.name = pick(NAMES);
  if (typeof c.city !== 'string') c.city = pick(CITIES);
  if (!isHex(c.gk)) c.gk = pick(GK_COLS);
  if (c.form !== undefined && !ONLINE_FORMS.includes(c.form)) c.form = '433';
  // старий прапор без оздоби оновить migrate; у решти виправляємо лише те, що не проходить normFlag
  if (c.flag && typeof c.flag === 'object' && c.flag.ov !== undefined) { const n = normFlag(c.flag); for (const k in n) if (JSON.stringify(c.flag[k]) !== JSON.stringify(n[k])) c.flag[k] = n[k]; }
  o.lvl = count(o.lvl, 1, 1); o.xp = count(o.xp, 0, 0); o.coins = count(o.coins, 0, 300); o.rating = count(o.rating, 0, 1000); o.goals = count(o.goals, 0, 0); o.games = count(o.games, 0, 0);
  const r = o.rec && typeof o.rec === 'object' ? o.rec : (o.rec = {});
  r.w = count(r.w, 0, 0); r.d = count(r.d, 0, 0); r.l = count(r.l, 0, 0);
  const sl = slotsOf(c.form), H = o.heroes, used = new Set();
  H.length = Math.min(H.length, 11);
  for (const e of H) if (e && typeof e.name === 'string') { used.add(surname(e.name)); used.add('f:' + e.name.split(' ')[0]); }
  for (let i = 0; i < 11; i++) {
    const e = H[i];
    if (!e || typeof e !== 'object') { H[i] = newHero(sl[i], used); continue; }
    if (typeof e.name !== 'string' || !e.name.trim()) e.name = newName(used, hasKey(RARITY, e.rar) ? e.rar : 'c');
    if (!e.stats || typeof e.stats !== 'object') e.stats = {};
    for (const k of keysFor(lineOf(sl[i]))) e.stats[k] = count(e.stats[k], 8, 45, 99);
    if (typeof e.id !== 'string') e.id = 'h' + Math.floor(Math.random() * 1e9).toString(36);
    fixHero(e, sl[i].num);
  }
  relabel(H, c.form);
  o.slots = Math.floor(count(o.slots, 0, 0, SLOTS_MAX));
  fixBench(o);
  if (typeof o.mark !== 'string' || !/^[a-z0-9]{4,24}$/.test(o.mark)) o.mark = newMark();
  o.pity = count(o.pity, 0, 0, PITY_N - 1);
  o.iron = Math.floor(count(o.iron, 0, 0)); o.slots = Math.floor(count(o.slots, 0, 0, SLOTS_MAX));
  if (o.mk != null && !marketOk(o.mk)) delete o.mk;             // зіпсована вітрина: на сьогодні збереться заново
}
/** Будова вітрини ринку: { d: день, n: оновлень сьогодні, offers: [герой], sold: [так/ні] }. */
const marketOk = (m) => !!m && typeof m === 'object' && typeof m.d === 'string' && Number.isInteger(m.n) && m.n >= 0 && (m.ni == null || (Number.isInteger(m.ni) && m.ni >= 0))
  && Array.isArray(m.offers) && m.offers.length <= MARKET_SIZE && Array.isArray(m.sold) && m.sold.length === m.offers.length
  && m.offers.every((e) => e && typeof e === 'object' && e.stats && typeof e.stats === 'object' && typeof e.name === 'string' && typeof e.id === 'string' && hasKey(RARITY, e.rar))
  && m.sold.every((x) => typeof x === 'boolean');
/** Спільне для героя основи й лави: номер, досвід, рідкість, риса, вигляд. */
function fixHero(e, num) {
  e.num = count(e.num, 1, num, 99); e.xp = count(e.xp, 0, 0); e.lvl = count(e.lvl, 1, 1); e.apps = count(e.apps, 0, 0); e.goals = count(e.goals, 0, 0); e.beard = count(e.beard, 0, 0, 3);
  if (!hasKey(RARITY, e.rar)) e.rar = 'c';
  if (e.custom !== true) e.custom = true;                      // власний вигляд героя (squadLook); з сервера поле не приходить
  if (e.trait != null && !hasKey(TRAITS, e.trait)) e.trait = null;
  if (typeof e.skin !== 'string') e.skin = ACADEMY.allSkins[1];
  if (typeof e.hair !== 'string') e.hair = 'crop';
  if (typeof e.hairCol !== 'string') e.hairCol = '#1f2933';
}
/** Скільки героїв може сидіти на лаві. */
export const BENCH_MAX = 10;
/** Лава: BENCH_BASE місць даром, ще до SLOTS_MAX купуються за Iron Dollar (buySlot). BENCH_MAX — межа будь-якої лави. */
export const BENCH_BASE = 5, SLOTS_MAX = 5;
export const benchCap = (st) => BENCH_BASE + Math.min(SLOTS_MAX, Math.max(0, (st && st.slots) | 0));
/** Воротар за навичками, а не за слотом: на лаві слота немає. */
export const isKeeper = (e) => !!(e && e.stats && 'hands' in e.stats);
/** Гарант рідкісного пака (див. packInto) і розмір вітрини ринку: тут, бо їх читає repair ще під час load. */
export const PITY_N = 5;
export const MARKET_SIZE = 6;
const FIELD_LINES = ['D', 'M', 'W', 'F'], LINE_ROLE = { D: 'CB', M: 'CM', W: 'LW', F: 'ST' };
/**
 * Лава запасних (до BENCH_MAX): кожен герой лишає свою лінію — воротар за навичками (є «Ловля»), польовий за line.
 * Зіпсованого героя з лави прибираємо, а не вигадуємо: основа завжди повна, лава може бути й порожня.
 */
function fixBench(o) {
  const ok = (e) => e && typeof e === 'object' && e.stats && typeof e.stats === 'object' && typeof e.name === 'string' && e.name.trim();
  const B = Array.isArray(o.bench) ? o.bench.filter(ok).slice(0, benchCap(o)) : [];
  const ids = new Set(o.heroes.map((e) => e.id));
  for (const e of B) {
    const gk = isKeeper(e), line = gk ? 'G' : FIELD_LINES.includes(e.line) ? e.line : 'M';
    e.line = line;
    if (gk) e.role = e.pos = 'GK'; else if (typeof e.role !== 'string' || !ROLE_UA_OK.test(e.role) || e.role === 'GK') e.role = e.pos = LINE_ROLE[line];
    for (const k of keysFor(line)) e.stats[k] = count(e.stats[k], 8, 45, 99);
    if (typeof e.id !== 'string' || ids.has(e.id)) e.id = 'h' + Math.floor(Math.random() * 1e9).toString(36);
    ids.add(e.id);
    fixHero(e, 12);
  }
  o.bench = B;
}
const ROLE_UA_OK = /^(GK|LB|RB|CB|DM|CM|AM|LM|RM|LW|RW|ST)$/;
/** Будова OP.q (src/online/quests.js): { d: 'РРРР-ММ-ДД', day: [{ id, p, got }], w: номер дня понеділка, week: [...] }. Самі назви квестів перевіряє quests.js. */
const questOk = (e) => !!e && typeof e === 'object' && typeof e.id === 'string' && Number.isFinite(e.p) && e.p >= 0 && typeof e.got === 'boolean';
const questsOk = (q) => typeof q === 'object' && typeof q.d === 'string' && Number.isFinite(q.w) && Array.isArray(q.day) && Array.isArray(q.week) && q.day.length <= 6 && q.week.length <= 3 && q.day.every(questOk) && q.week.every(questOk);
const keepBroken = (raw) => { try { localStorage.setItem(KEY + '-broken', raw); } catch (_) { /* ignore */ } };   // наступний запис затре зіпсоване: лишаємо копію, як кар'єра

/** Старе збереження: прапор із новими шарами й герої з іменами нового генератора. Лише раз: результат одразу записуємо, інакше випадковість мінялася б з кожним запуском. */
function migrate(o) {
  if (o.club && o.club.flag && o.club.flag.ov !== undefined && o.nm && o.club.form) return;
  if (o.club) { o.club.flag = upgradeFlag(o.club.flag); if (!o.club.form) o.club.form = '433'; }
  if (!o.nm) { const used = new Set(); for (const e of o.heroes) e.name = newName(used, e.rar); o.nm = 1; }   // рівні, навички й голи лишаються
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) { /* ignore */ }
}

function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && o.v === 1 && Array.isArray(o.heroes)) {
        const was = JSON.stringify(o); repair(o);
        if (JSON.stringify(o) !== was) { keepBroken(raw); localStorage.setItem(KEY, JSON.stringify(o)); }
        migrate(o); return o;
      }
      keepBroken(raw);
    }
  } catch (_) { if (raw) keepBroken(raw); }                 // зламаний запис (без raw це приватний режим)
  const o = newClub(); try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) { /* ignore */ }
  return o;
}

export let OP = load();
export function saveOP() { try { localStorage.setItem(KEY, JSON.stringify(OP)); } catch (_) { /* ignore */ } }
/** Матч почався: якщо сторінку закриють, не дограють до кінця, наступний запуск зарахує технічну поразку. */
export function markLive(r) { OP.live = { r: Number.isFinite(r) ? r : 1000, at: Date.now() }; saveOP(); }
export function clearLive() { if (OP.live) { OP.live = null; saveOP(); } }
export function settleLive() { const l = OP.live; if (!l) return false; OP.live = null; applyResult('loss', 0, l.r, []); return true; }
// ------------------------------------------------------------------ сервер гри (src/online/cloud.js)
const HERO_NUM = ['xp', 'lvl', 'apps', 'goals'];
/** Клуб для POST /club/save: вигляд, тактика, герої й base — прогрес, який сервер бере лише при першому перенесенні. */
export function toServer() {
  return {
    club: { name: OP.club.name, city: OP.club.city, flag: OP.club.flag, gk: OP.club.gk, form: OP.club.form },
    heroes: OP.heroes.map(serverHero), bench: OP.bench.map(serverHero),
    base: { coins: OP.coins, rating: OP.rating, lvl: OP.lvl, xp: OP.xp, rec: OP.rec, goals: OP.goals, games: OP.games, iron: OP.iron, slots: OP.slots },
  };
}
function serverHero(e) { return { ...toWireHero(e), id: e.id, xp: e.xp, lvl: e.lvl, apps: e.apps, goals: e.goals }; }
const DEVICE_KEY = KEY + '-device';                         // клуб пристрою до першого збігу з сервером: на випадок, якщо на сервері був інший
/**
 * Клуб від сервера гри: монети, рейтинг, рівні й навички рахує він. looks = true бере й вигляд (назва, прапор, схема,
 * склад) — при відкритті хабу, коли клуб могли змінити на іншому пристрої; false лише числа, щоб не затерти правку, яка ще
 * летить на сервер. Квести пристрою й мітка матчу лишаються. false — відповідь не схожа на клуб.
 */
export function adoptServer(c, looks = true) {
  if (!c || typeof c !== 'object' || !c.club || typeof c.club !== 'object' || !Array.isArray(c.heroes) || c.heroes.length !== 11) return false;
  const same = c.heroes.every((h, i) => h && OP.heroes[i] && h.id === OP.heroes[i].id);
  if (looks || !same) {
    if (!same) { try { if (!localStorage.getItem(DEVICE_KEY)) localStorage.setItem(DEVICE_KEY, JSON.stringify(OP)); } catch (_) { /* ignore */ } }
    const o = JSON.parse(JSON.stringify({ v: 1, nm: 1, club: c.club, heroes: c.heroes, bench: Array.isArray(c.bench) ? c.bench : OP.bench, lvl: c.lvl, xp: c.xp, coins: c.coins, rating: c.rating, rec: c.rec, goals: c.goals, games: c.games }));
    if (o.club.flag) o.club.flag = normFlag(o.club.flag);
    o.q = OP.q; o.live = OP.live; o.mark = OP.mark; o.mk = OP.mk; o.pity = Number.isFinite(c.pity) ? c.pity : OP.pity;
    o.iron = Number.isFinite(c.iron) ? c.iron : OP.iron; o.slots = Number.isFinite(c.slots) ? c.slots : OP.slots;
    repair(o); OP = o; saveOP(); return true;
  }
  for (const k of ['coins', 'rating', 'lvl', 'xp', 'goals', 'games', 'pity', 'iron', 'slots']) if (Number.isFinite(c[k])) OP[k] = Math.max(0, c[k]);
  if (c.rec && typeof c.rec === 'object') for (const k of ['w', 'd', 'l']) if (Number.isFinite(c.rec[k])) OP.rec[k] = c.rec[k];
  c.heroes.forEach((h, i) => adoptHero(i, h));
  if (Array.isArray(c.bench)) { const o = { ...OP, bench: JSON.parse(JSON.stringify(c.bench)) }; fixBench(o); OP.bench = o.bench; }   // лаву рахує сервер: беремо всю
  saveOP(); return true;
}
/** Герой від сервера (тренування, матч): навички й досвід; новий id — новий герой (скаут), тоді весь запис. */
export function adoptHero(i, h) {
  const n = OP.heroes.length, onB = i >= n, e = onB ? OP.bench[i - n] : OP.heroes[i];
  if (!e || !h || typeof h !== 'object') return false;
  if (h.id !== e.id && onB) { const o = { ...OP, bench: OP.bench.slice() }; o.bench[i - n] = JSON.parse(JSON.stringify(h)); fixBench(o); OP.bench = o.bench; saveOP(); return true; }
  if (h.id !== e.id) { const o = { ...OP, heroes: OP.heroes.slice() }; o.heroes[i] = JSON.parse(JSON.stringify(h)); repair(o); OP.heroes[i] = o.heroes[i]; saveOP(); return true; }
  if (h.stats && typeof h.stats === 'object') for (const k of keysFor(e.line)) if (Number.isFinite(h.stats[k])) e.stats[k] = clamp(h.stats[k], 8, 99);
  for (const k of HERO_NUM) if (Number.isFinite(h[k])) e[k] = Math.max(0, h[k]);
  return true;
}

/** Новий випадковий клуб. Квести дня лишаються: інакше нагороди за той самий день можна було б забрати вдруге. */
export function resetOP() { const q = OP.q; OP = newClub(); if (q) OP.q = q; saveOP(); return OP; }

// ------------------------------------------------------------------ форма й прапор
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
const kitFrom = (a, b) => { const dark = lum(a) > 0.6; return { main: a, second: b, shorts: b, socks: a, plate: dark ? '#14231e' : '#f1efe8', numInk: dark ? '#f1efe8' : '#13321f', ink: 'dark' }; };
/** Форма з кольорів прапора: футболка — перший колір, шорти — другий; номер — контрастний. */
export function kitOf(club) { const [a, b] = club.flag.c; return kitFrom(a, b); }
const KIT_NEAR = 110;                                        // той самий поріг, що й у мінімапи (ui/minimap.js, near)
const kitDist = (p, q) => { const a = parseInt(p.slice(1), 16), b = parseInt(q.slice(1), 16); return Math.hypot((a >> 16) - (b >> 16), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255)); };
/**
 * Форма гостей на цей матч: футболки надто схожі — гості вдягають інший колір свого прапора (другий, третій…), а якщо
 * весь прапор схожий, то білу чи темну. Лише кольори прапорів і без випадковості: обидва гравці мають обчислити те саме.
 */
export function awayKit(home, club) {
  const c = club.flag.c, k = kitOf(club);
  if (kitDist(k.main, home.main) >= KIT_NEAR) return k;
  for (let i = 1; i < c.length; i++) if (kitDist(c[i], home.main) >= KIT_NEAR) return kitFrom(c[i], c[0]);
  return lum(home.main) < 0.5 ? kitFrom('#f1efe8', '#14231e') : kitFrom('#14231e', '#f1efe8');
}
export function gkKitOf(club) { return { main: club.gk, second: '#1f2933', shorts: '#1f2933', socks: club.gk, plate: '#1f2933', numInk: '#f1efe8', ink: 'light' }; }
export const shortOf = (club) => String(club.name).replace(/[^A-ZА-ЯІЇЄҐ0-9]/gi, '').slice(0, 3).toUpperCase() || 'ОНЛ';


// ------------------------------------------------------------------ прокачка
export const heroOvr = ovr;
export const teamRating = (heroes = OP.heroes) => Math.round(heroes.reduce((s, e) => s + ovr(e), 0) / heroes.length);
export const trainPrice = (v) => Math.round(10 + 12 * Math.pow(1.12, v - 40));
export const SCOUT_PRICE = 180;
export const clubXpNeed = (l) => 120 + 80 * (l - 1);

/** Усі герої клубу: перші 11 — основа, далі лава (так їх нумерують склад, прокачка й сервер). */
export const allHeroes = (st = OP) => [...st.heroes, ...(st.bench || [])];
export function trainHero(i, k) {
  const e = allHeroes()[i]; if (!e || !(k in e.stats)) return false;
  const v = e.stats[k], c = trainPrice(v);
  if (v >= 99 || OP.coins < c) return false;
  OP.coins -= c; e.stats[k] = v + 1; saveOP(); return c;
}
/** Нова схема: герої лишаються на своїх номерах слотів і отримують ролі нової схеми. */
export function setForm(form) {
  if (!ONLINE_FORMS.includes(form)) return false;
  OP.club.form = form; relabel(OP.heroes, form); saveOP(); return true;
}
/** Поміняти двох польових героїв місцями. Воротар лишається в рамці: у нього інші навички. */
export function swapHeroes(a, b) {
  const H = OP.heroes;
  if (a === b || !a || !b || !H[a] || !H[b]) return false;
  const t = H[a]; H[a] = H[b]; H[b] = t; relabel(H, OP.club.form); saveOP(); return true;
}
/**
 * Магазин онлайн-хабу: скаут і паки героїв. odds — шанси рідкості (сума 1), їх же показує вітрина. Новий герой стає на
 * обраний слот із тим самим номером, старий іде з клубу. Сервер гри має рахувати паки за цими самими числами (rules.js).
 */
export const PACKS = {
  // скаут — дешевий новачок на позицію, а не шлях до зірок: епік+ зі скаута в середньому ≈ 1300 монет навіть із продажем
  // зайвих, легенда ≈ 11 500, тобто дорожче за епічний пак (1200 і ≈ 7000). Розрахунок: BUGS SHOP-1, server/README.md
  scout: { name: 'Скаут', price: SCOUT_PRICE, odds: { c: 0.6, r: 0.3, e: 0.09, l: 0.01 } },
  rare: { name: 'Рідкісний пак', price: 450, odds: { r: 0.7, e: 0.25, l: 0.05 }, pity: { n: 5, rar: 'e' } },   // гарант: n-й пак поспіль без епіка — епік+ (PITY_N)
  epic: { name: 'Епічний пак', price: 1200, odds: { e: 0.85, l: 0.15 } },
  gold: { name: 'Золотий вагон', iron: 25, odds: { e: 0.75, l: 0.25 } },              // ціна в Iron Dollar (iron), а не в монетах; без гаранту
};
/** Рідкість за шансами пака: від легенди до звичайного. */
export function packRarity(kind, rnd = Math.random) {
  const o = (PACKS[kind] || PACKS.scout).odds; let r = rnd();
  for (const k of ['l', 'e', 'r', 'c']) { const p = o[k] || 0; if (r < p) return k; r -= p; }
  return Object.keys(o)[0];
}
// ------------------------------------------------------------------ лава, магазин, продаж
// Чисті правила для гри й сервера (server/src/rules.js): st — клуб { club, heroes, bench, coins }, функції міняють його й
// повертають { error } з тими самими кодами, що й сервер. Обгортки нижче застосовують їх до OP пристрою.
/** Продаж: база рідкості й трохи за силу понад базу (прокачка, рівні). Завжди менше, ніж коштує пак: перепродаж не годує. */
export const SELL = { c: 25, r: 70, e: 160, l: 400 };
export function sellPrice(e) {
  const R = RARITY[e && e.rar] || RARITY.c;
  return (SELL[e && e.rar] || SELL.c) + 5 * Math.max(0, ovr(e) - R.base);
}
/** Склад чинний: 11 в основі, воротар на 0 і лише там, лава не більша за cap (місткість лави клубу, benchCap). */
export function lineupOk(heroes, bench, cap = BENCH_MAX) {
  return Array.isArray(heroes) && heroes.length === 11 && isKeeper(heroes[0]) && heroes.slice(1).every((e) => e && !isKeeper(e)) && Array.isArray(bench) && bench.length <= Math.min(cap, BENCH_MAX);
}
const namesOf = (list) => new Set(list.flatMap((e) => [surname(e.name), 'f:' + e.name.split(' ')[0]]));
/** Зачіски, уже зайняті в клубі: новачок бере вільну (newHero, hairs). */
const hairsOf = (list) => new Set(list.map((e) => e.hair));
/** Вільний номер для новачка: з 12, бо 1–11 носить основа нового клубу. */
function freeNum(st) {
  const used = new Set(allHeroes(st).map((e) => e.num));
  for (let n = 12; n < 100; n++) if (!used.has(n)) return n;
  return 99;
}
/**
 * Гарант рідкості рідкісного пака: PITY_N паків поспіль без епіка чи легенди — і цей гарантовано епік+ (шанси e і l
 * пака, пропорційно). P(без епіка 4 рази) = 0.7⁴ ≈ 24 %, тож гарант спрацьовує рідко, а в середньому епік із рідкісних
 * паків коштує (1 − 0.7⁵) / 0.3 ≈ 2.77 пака ≈ 1250 монет — майже як епічний пак (1200), але з шансом раніше. Скаут і
 * епічний пак лічильника не чіпають: епічний і так завжди епік+, а скаут дешевий і без гаранту.
 */
const TOP = (r) => r === 'e' || r === 'l';
/** Скільки рідкісних паків до гаранту (1 — наступний гарантовано епік+); для пака без гаранту — null. */
export const pityLeft = (st, kind = 'rare') => (kind === 'rare' ? PITY_N - Math.min(PITY_N - 1, Math.max(0, st.pity | 0)) : null);
/** Потяг відкриття: вагонів WAGONS, номер вагона героя сталий для цього відкриття (від id героя). */
export const WAGONS = 20;   // склад потяга відкриття (src/ui/packtrain.js): 20 вагонів, кольори за odds × 20
export const wagonOf = (h) => { let x = 0; for (const ch of String(h.id)) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return { no: 1 + (x % WAGONS), rar: h.rar }; };
/**
 * Пак kind: новий герой на позицію слота i сідає на лаву. { hero, bench: його місце на лаві, price, pity: скільки
 * рідкісних паків до гаранту, wagon: { no, rar } для потяга } або { error }.
 */
export function packInto(st, kind, i) {
  const P = PACKS[kind]; if (!P) return { error: 'bad_pack' };
  if (i == null) i = weakestSlot(st);                           // позицію не обрано: новачок на позицію найслабшого в основі
  const slot = slotsOf(st.club.form)[i]; if (!slot || !st.heroes[i]) return { error: 'bad_hero' };
  const B = st.bench || (st.bench = []);
  if (B.length >= benchCap(st)) return { error: 'bench_full' };
  if (P.iron ? (st.iron | 0) < P.iron : st.coins < P.price) return { error: P.iron ? 'no_iron' : 'no_coins' };
  let rar = packRarity(kind);
  if (kind === 'rare') {
    if (!TOP(rar) && (st.pity | 0) >= PITY_N - 1) { const o = P.odds; rar = Math.random() * (o.e + o.l) < o.l ? 'l' : 'e'; }
    st.pity = TOP(rar) ? 0 : Math.min(PITY_N - 1, (st.pity | 0) + 1);
  } else if (kind === 'epic') st.pity = 0;
  const h = newHero(slot, namesOf(allHeroes(st)), rar, Math.random, hairsOf(allHeroes(st)));
  h.num = freeNum(st); B.push(h);
  if (P.iron) st.iron = (st.iron | 0) - P.iron; else st.coins -= P.price;
  return { hero: h, bench: B.length - 1, price: P.price || 0, iron: P.iron || 0, pity: pityLeft(st, kind), wagon: wagonOf(h) };
}
/** Продати героя з лави j: { gain } або { error }. Основу продати не можна: спершу на лаву. */
export function sellFrom(st, j) {
  const B = st.bench || [], e = B[j]; if (!e) return { error: 'bad_hero' };
  const gain = sellPrice(e); st.coins += gain; B.splice(j, 1);
  return { gain };
}
/**
 * Обмін двох героїв у спільному списку (0–10 основа, 11+ лава): основа між собою — лише польові, основа з лавою —
 * воротар міняється лише на воротаря. Ролі основи йдуть зі слотів схеми (relabel). false — обмін не годиться.
 */
export function moveHeroes(st, a, b) {
  const H = st.heroes, B = st.bench || (st.bench = []), n = H.length, get = (i) => (i < n ? H[i] : B[i - n]);
  if (a === b || !get(a) || !get(b)) return false;
  if (a < n && b < n) { if (!a || !b) return false; const t = H[a]; H[a] = H[b]; H[b] = t; }
  else if (a >= n && b >= n) { const t = B[a - n]; B[a - n] = B[b - n]; B[b - n] = t; }
  else {
    const s = a < n ? a : b, k = (a < n ? b : a) - n;
    if (isKeeper(B[k]) !== (s === 0)) return false;
    const t = H[s]; H[s] = B[k]; B[k] = t;
  }
  relabel(H, st.club.form); return true;
}
/** Чому обмін не годиться (для підказки). */
export function moveDeny(st, a, b) {
  const n = st.heroes.length, all = allHeroes(st), x = all[a], y = all[b];
  if (!x || !y) return '';
  if ((a < n && b < n) && (!a || !b)) return 'Воротар завжди в рамці';
  if (a < n !== b < n) return isKeeper(x) || isKeeper(y) ? 'Воротаря міняє лише воротар' : '';
  return '';
}
// ------------------------------------------------------------------ ринок готових героїв
/**
 * Ринок: щодня (за Києвом) вітрина на MARKET_SIZE готових героїв для кожного клубу. Двоє на позицію найслабшого героя
 * основи, решта по одному з інших ліній. Вітрина фіксується в клубі (mk) на весь день: склад основи далі її не міняє.
 * Зерно — key (на сервері непрозорий id гравця, на пристрої мітка клубу), день і номер оновлення: те саме зерно дає ту
 * саму вітрину. Ціна — за вибір: дорожче за продаж і за очікувану ціну такого героя з пака.
 */
/** Шанси рідкості вітрини: рідкісних більше, ніж у скаута (c 50 %, r 30 %, e 15 %, l 5 %). */
export const MARKET_ODDS = { c: 0.15, r: 0.45, e: 0.3, l: 0.1 };
/**
 * Ціна за рідкістю: героя рідкості X з паків у середньому отримуєш так — звичайного скаутом за 180 / 0.6 = 300, рідкісного
 * скаутом 180 / 0.3 = 600, епіка епічним паком 1200 / 0.85 ≈ 1410 (епік+ рідкісними паками з гарантом ≈ 1250), легенду
 * епічними паками ≈ 7000–8000. Вітрина дорожча (і позиція на вибір), плюс 15 за очко рейтингу понад базу (продаж дає 5).
 */
export const MARKET_BASE = { c: 400, r: 750, e: 1600, l: 9000 };
export function marketPrice(e) {
  const R = RARITY[e && e.rar] || RARITY.c;
  return (MARKET_BASE[e && e.rar] || MARKET_BASE.c) + 15 * Math.max(0, ovr(e) - R.base);
}
/** Оновлення вітрини за монети: n — скільки разів уже оновлювали сьогодні. 60, 120, 240… до 1920. */
export const refreshPrice = (n) => 60 * 2 ** Math.min(5, Math.max(0, n | 0));
/** Сталий генератор від рядка (FNV-1a + mulberry32): однакове зерно — однакова вітрина. */
export function seeded(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = (h + 0x6d2b79f5) | 0; let x = Math.imul(h ^ (h >>> 15), 1 | h); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const rarBy = (odds, rnd) => { let r = rnd(); for (const k of ['l', 'e', 'r', 'c']) { const p = odds[k] || 0; if (r < p) return k; r -= p; } return 'c'; };
/** Слот для лінії: перший такий у схемі клубу, а якщо лінії в схемі немає — умовна роль лінії. */
const slotFor = (form, line) => slotsOf(form).find((s) => lineOf(s) === line) || { name: LINE_ROLE[line], line, num: 0 };
/** Слот найслабшого героя основи (за рейтингом). */
function weakestSlot(st) { const H = st.heroes; let w = 0; for (let i = 1; i < H.length; i++) if (ovr(H[i]) < ovr(H[w])) w = i; return w; }
function genMarket(st, key, day, n, ni = 0) {
  const rnd = seeded(`m:${key}:${day}:${n}${ni ? 'i' + ni : ''}`), form = st.club.form, sl = slotsOf(form), w = weakestSlot(st);
  const wl = lineOf(sl[w]), lines = ['G', ...FIELD_LINES].filter((l) => l !== wl);
  const slots = [sl[w], sl[w], ...lines.map((l) => slotFor(form, l))].slice(0, MARKET_SIZE);
  const used = namesOf(allHeroes(st)), ids = new Set(allHeroes(st).map((e) => e.id)), hairs = hairsOf(allHeroes(st));
  const offers = slots.map((s) => {
    const h = newHero(s, used, rarBy(MARKET_ODDS, rnd), rnd, hairs);   // freshHair бере рівно один rnd: зерно вітрини не зсувається
    hairs.add(h.hair);
    while (ids.has(h.id)) h.id = 'h' + Math.floor(rnd() * 1e9).toString(36);
    ids.add(h.id); return h;
  });
  return { offers, sold: offers.map(() => false) };
}
/** Вітрина на день t (лінива: новий день — нова вітрина й лічильник оновлень з нуля). */
function marketOf(st, key, t) {
  const day = questPeriods(t).d;
  if (!st.mk || st.mk.d !== day) st.mk = { d: day, n: 0, ...genMarket(st, key, day, 0) };
  fitHairs(st, st.mk);
  return st.mk;
}
/**
 * Клуб міг узяти зачіску непроданого героя вітрини вже після її складання (пак, ринок): такий герой бере вільну,
 * сталу за своїм id, тож екран і покупка показують ту саму, а повторний виклик нічого не міняє.
 */
function fitHairs(st, m) {
  const taken = hairsOf(allHeroes(st));
  m.offers.forEach((h, i) => {
    if (m.sold[i]) return;
    if (taken.has(h.hair)) h.hair = freshHair(ACADEMY.allHairs, taken, seeded('hair:' + h.id));
    taken.add(h.hair);
  });
}
/** Вітрина для екрана: { day, left_ms, offers: [{ slot, hero, price, sold }], refresh_price }. */
export function marketView(st, key, t = Date.now()) {
  const m = marketOf(st, key, t);
  return { day: m.d, left_ms: questsLeft(t).day, offers: m.offers.map((hero, slot) => ({ slot, hero, price: marketPrice(hero), sold: m.sold[slot] })), refresh_price: refreshPrice(m.n) };
}
/** Купити героя з вітрини slot: на лаву. { hero, bench, price } або { error: 'bad_slot' | 'sold' | 'bench_full' | 'no_coins' }. */
export function marketBuy(st, key, slot, t = Date.now()) {
  const m = marketOf(st, key, t), e = m.offers[slot];
  if (!Number.isInteger(slot) || !e) return { error: 'bad_slot' };
  if (m.sold[slot]) return { error: 'sold' };
  const B = st.bench || (st.bench = []);
  if (B.length >= benchCap(st)) return { error: 'bench_full' };
  const price = marketPrice(e);
  if (st.coins < price) return { error: 'no_coins' };
  const h = JSON.parse(JSON.stringify(e)), used = namesOf(allHeroes(st)), ids = new Set(allHeroes(st).map((x) => x.id));
  if (used.has(surname(h.name)) || used.has('f:' + h.name.split(' ')[0])) h.name = newName(used, h.rar);   // за прізвищем рахуються голи: без однофамільців
  while (ids.has(h.id)) h.id = 'h' + Math.floor(Math.random() * 1e9).toString(36);
  h.num = freeNum(st); st.coins -= price; m.sold[slot] = true; B.push(h);
  return { hero: h, bench: B.length - 1, price };
}
/** Оновити вітрину за refreshPrice: { price, view } або { error: 'no_coins' }. */
export function marketRefresh(st, key, t = Date.now()) {
  const m = marketOf(st, key, t), price = refreshPrice(m.n);
  if (st.coins < price) return { error: 'no_coins' };
  st.coins -= price; m.n++;
  Object.assign(m, genMarket(st, key, m.d, m.n, m.ni | 0));
  return { price, view: marketView(st, key, t) };
}
/** Оновити вітрину за Iron Dollar (IRON.mref): ціна стала, лічильник монетних оновлень не росте. */
export function marketRefreshIron(st, key, t = Date.now()) {
  const m = marketOf(st, key, t), price = IRON.mref;
  if ((st.iron | 0) < price) return { error: 'no_iron' };
  st.iron = (st.iron | 0) - price; m.ni = (m.ni | 0) + 1;
  Object.assign(m, genMarket(st, key, m.d, m.n, m.ni));
  return { iron: price, view: marketView(st, key, t) };
}

// ------------------------------------------------------------------ Iron Dollar: друга валюта
/**
 * Iron Dollar (st.iron): заробляється тижневими квестами (поле d у WEEK, quests.js), рівнями клубу (+IRON.lvl за рівень,
 * applyResult), місцем у рейтингу раз на тиждень (IRON_TOP, лише сервер) і купується за Telegram Stars (STARS, лише сервер).
 * Витрачається на місця лави, золотий вагон, мішок монет, нову рису героя й оновлення вітрини. Чисті правила для гри й сервера.
 */
// мішок: 5 доларів → 400 монет (80 за долар). Щедріший мішок робив би золотий вагон зайвим: 25 доларів у мішках по 1000
// давали 5000 монет — чотири епічні паки замість одного героя. Тепер 25 доларів = 2000 монет ≈ 1.7 епічного пака, і шанс
// легенди в них (0.25) той самий, що в золотому вагоні.
export const IRON = { slot: [10, 15, 20, 25, 30], gold: 25, bag: 5, bagCoins: 400, mref: 2, trait: 6, lvl: 2 };
/** Тижнева нагорода за місце в рейтингу (понеділок 00:00 за Києвом): до місця «до» включно — n доларів. */
export const IRON_TOP = [{ to: 1, n: 30 }, { to: 3, n: 20 }, { to: 10, n: 10 }, { to: 50, n: 3 }];
export const ironForPlace = (place) => { for (const r of IRON_TOP) if (place <= r.to) return r.n; return 0; };
/** Пакети за Telegram Stars (валюта XTR). Ціни остаточно затверджує власник. */
export const STARS = [{ id: 's25', iron: 25, stars: 50 }, { id: 's60', iron: 60, stars: 100 }, { id: 's150', iron: 150, stars: 225 }];
/** Ще одне місце на лаві: ціна росте з кожним купленим. { slots, price } або { error: 'max' | 'no_iron' }. */
export function buySlot(st) {
  const k = Math.max(0, st.slots | 0);
  if (k >= SLOTS_MAX) return { error: 'max' };
  const price = IRON.slot[k];
  if ((st.iron | 0) < price) return { error: 'no_iron' };
  st.iron = (st.iron | 0) - price; st.slots = k + 1;
  return { slots: st.slots, price };
}
/** Мішок монет: IRON.bag доларів на IRON.bagCoins монет. */
export function ironBag(st) {
  if ((st.iron | 0) < IRON.bag) return { error: 'no_iron' };
  st.iron = (st.iron | 0) - IRON.bag; st.coins += IRON.bagCoins;
  return { coins: IRON.bagCoins, price: IRON.bag };
}
/**
 * Нова риса героя i (0–10 основа, далі лава): інша з набору його лінії. Бонус старої риси знімається з її навички, бонус
 * нової додається до своєї (як у newHero). { hero, price } або { error: 'bad_hero' | 'no_iron' }.
 */
export function traitReroll(st, i, rnd = Math.random) {
  const e = allHeroes(st)[i]; if (!e) return { error: 'bad_hero' };
  if ((st.iron | 0) < IRON.trait) return { error: 'no_iron' };
  const set = (isKeeper(e) ? GK_TRAITS : FIELD_TRAITS[e.line] || FIELD_TRAITS.M).filter((k) => k !== e.trait);
  const old = TRAITS[e.trait], nw = pick(set, rnd), t = TRAITS[nw];
  if (old && old.stat in e.stats) e.stats[old.stat] = clamp(e.stats[old.stat] - old.b, 8, 99);
  if (t.stat in e.stats) e.stats[t.stat] = clamp(e.stats[t.stat] + t.b, 8, 99);
  e.trait = nw; st.iron = (st.iron | 0) - IRON.trait;
  return { hero: e, price: IRON.trait };
}
export function buySlotHere() { const r = buySlot(OP); if (!r.error) saveOP(); return r; }
export function ironBagHere() { const r = ironBag(OP); if (!r.error) saveOP(); return r; }
export function traitHere(i) { const r = traitReroll(OP, i); if (!r.error) saveOP(); return r; }
export function marketRenewIron(t = Date.now()) { const r = marketRefreshIron(OP, OP.mark, t); saveOP(); return r; }
/** Купити пак на пристрої: новий герой на лаві. { hero, bench } або { error }. */
export function buyPack(kind, i) { const r = packInto(OP, kind, i); if (r.hero) saveOP(); return r; }
export function marketHere(t = Date.now()) { const v = marketView(OP, OP.mark, t); saveOP(); return v; }
export function marketTake(slot, t = Date.now()) { const r = marketBuy(OP, OP.mark, slot, t); saveOP(); return r; }
export function marketRenew(t = Date.now()) { const r = marketRefresh(OP, OP.mark, t); saveOP(); return r; }
export function sellHero(j) { const r = sellFrom(OP, j); if (!r.error) saveOP(); return r; }
export function swapAny(a, b) { if (!moveHeroes(OP, a, b)) return false; saveOP(); return true; }
/** Скаут: новий випадковий герой на позицію слота i (рідкість — за шансом, легенда — 5%) на лаву. */
export function scoutHero(i) { return buyPack('scout', i); }

// ------------------------------------------------------------------ обмін із суперником
/** Що бачить суперник: клуб і склад (без монет). */
export function toWire() {
  const c = OP.club;
  return {
    name: c.name, city: c.city, flag: c.flag, gk: c.gk, form: c.form, lvl: OP.lvl, rating: OP.rating, rec: OP.rec,
    heroes: OP.heroes.map(toWireHero),
  };
}
function toWireHero(e) { return { name: e.name, num: e.num, role: e.role, line: e.line, stats: e.stats, skin: e.skin, hair: e.hair, hairCol: e.hairCol, beard: e.beard || 0, rar: e.rar, trait: e.trait }; }

const HEX = /^#[0-9a-f]{6}$/i;
const col = (v, d) => (typeof v === 'string' && HEX.test(v) ? v : d);
/** Чужий рядок: без символів розмітки й керівних символів (імена потрапляють у табло), обрізаний. */
export const plain = (v) => String(v).replace(/\s/g, ' ').replace(/[<>&"'`\\\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim();   // Cc, Cf: нульові й невидимі символи, зміна напряму тексту
const str = (v, d, n) => (typeof v === 'string' && plain(v) ? plain(v).slice(0, n) : d);
const num = (v, a, b, d) => (Number.isFinite(+v) ? clamp(Math.round(+v), a, b) : d);
/** Профіль суперника з мережі — усе перевіряємо й обрізаємо (дані чужі: жодного HTML, лише відомі значення). */
export function fromWire(w) {
  w = w && typeof w === 'object' ? w : {};
  const club = {
    name: str(w.name, 'ГОСТІ', 14).toUpperCase(), city: str(w.city, '', 18),
    flag: normFlag(w.flag),
    gk: col(w.gk, '#9fbf3a'), form: ONLINE_FORMS.includes(w.form) ? w.form : '433',
  };
  const hs = Array.isArray(w.heroes) ? w.heroes : [];
  const heroes = slotsOf(club.form).map((s, i) => {
    const h = hs[i] && typeof hs[i] === 'object' ? hs[i] : {}, line = lineOf(s), st = {};
    for (const k of keysFor(line)) st[k] = num(h.stats && h.stats[k], 8, 99, 45);
    return {
      id: 'o' + i, role: s.name, pos: s.name, line, num: num(h.num, 1, 99, s.num), name: str(h.name, 'Гравець ' + (i + 1), 22), custom: true, stats: st, xp: 0, lvl: 1, apps: 0, goals: 0,
      rar: hasKey(RARITY, h.rar) ? h.rar : 'c', trait: hasKey(TRAITS, h.trait) ? h.trait : null,
      skin: ACADEMY.allSkins.includes(h.skin) ? h.skin : ACADEMY.allSkins[1], hair: ACADEMY.allHairs.includes(h.hair) ? h.hair : 'crop', hairCol: ACADEMY.allHairCols.includes(h.hairCol) ? h.hairCol : '#1f2933', beard: num(h.beard, 0, 3, 0),
    };
  });
  const rec = w.rec && typeof w.rec === 'object' ? w.rec : {};
  return { club, heroes, lvl: num(w.lvl, 1, 999, 1), rating: num(w.rating, 0, 9999, 1000), rec: { w: num(rec.w, 0, 1e6, 0), d: num(rec.d, 0, 1e6, 0), l: num(rec.l, 0, 1e6, 0) } };
}

/** Клуб для матчу (стадіон, борти, табло): назва, місто, форма, форма воротаря, прапор. */
export function matchClub(club) { return { name: club.name, city: club.city, kit: kitOf(club), gk: gkKitOf(club), flag: club.flag, short: shortOf(club), online: true }; }

// ------------------------------------------------------------------ нагороди за матч
/**
 * Підсумок онлайн-матчу для свого клубу: монети, досвід клубу й героїв, рейтинг Ело (K = 32).
 * outcome — з нашого погляду; myGoals — скільки забили; scorers — прізвища наших авторів голів.
 */
export function applyResult(outcome, myGoals, oppRating, scorers = []) {
  const win = outcome === 'win', draw = outcome === 'draw';
  const exp = 1 / (1 + Math.pow(10, (oppRating - OP.rating) / 400)), sc = win ? 1 : draw ? 0.5 : 0;
  const dR = Math.round(32 * (sc - exp));
  OP.rating = Math.max(0, OP.rating + dR);
  const coins = (win ? 120 : draw ? 60 : 30) + myGoals * 15;
  OP.coins += coins; OP.goals += myGoals; OP.games++;
  OP.rec[win ? 'w' : draw ? 'd' : 'l']++;
  const xp = win ? 60 : draw ? 35 : 20; OP.xp += xp;
  let clubUp = false, iron = 0; while (OP.xp >= clubXpNeed(OP.lvl)) { OP.xp -= clubXpNeed(OP.lvl); OP.lvl++; OP.coins += 100; iron += IRON.lvl; clubUp = true; }
  OP.iron = (OP.iron | 0) + iron;                            // Iron Dollar за кожен новий рівень клубу
  const ups = [], left = scorers.slice();                    // кожен гол — одному героєві, навіть якщо в старому клубі є однофамільці
  for (const e of OP.heroes) {
    e.apps++;
    const sn = surname(e.name); let g = 0;
    for (let i = left.indexOf(sn); i >= 0; i = left.indexOf(sn)) { left.splice(i, 1); g++; }
    e.goals += g;
    gainXp(e, (win ? 30 : draw ? 20 : 12) + g * 25, ups);
  }
  saveOP();
  return { dR, coins, xp, clubUp, lvl: OP.lvl, ups, iron };
}
