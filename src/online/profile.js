// Онлайн-клуб гравця: окремий від кар'єри «Локомотива» — своя назва, прапор, форма, 11 унікальних героїв, рівень,
// рейтинг і монети. Зберігається окремо (loko-online-v1), щоб онлайн не чіпав прогрес кар'єри.
import { ACADEMY, FORMATIONS } from '../config.js';
import { makeStats, keysFor, ovr, gainXp } from '../state/squad.js';
import { rollFlag, normFlag, upgradeFlag, flagSvg } from './flag.js';
import { newName } from './names.js';

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

/** Новий герой на слот: випадкове ім'я й вигляд (зі ширшого вибору редактора), рідкість, риса й навички. */
export function newHero(slot, used = new Set(), rar = rollRar()) {
  const line = lineOf(slot), R = RARITY[rar];
  const name = newName(used, rar);
  const trait = pick(line === 'G' ? GK_TRAITS : FIELD_TRAITS[line]);
  const stats = makeStats(line, R.base, Math.random, 6), t = TRAITS[trait];
  stats[t.stat] = clamp(stats[t.stat] + t.b, 8, 99);
  const r = Math.random(), beard = r < 0.55 ? 0 : r < 0.72 ? 1 : r < 0.85 ? 2 : 3;
  return {
    id: 'h' + Math.floor(Math.random() * 1e9).toString(36), role: slot.name, pos: slot.name, line, num: slot.num, name, custom: true,
    stats, xp: 0, lvl: 1, apps: 0, goals: 0, rar, trait,
    skin: pick(ACADEMY.allSkins), hair: pick(ACADEMY.allHairs), hairCol: pick(ACADEMY.allHairCols), beard,
  };
}

/** Новий випадковий клуб: назва, місто, прапор, 11 героїв (щонайменше один епічний — зірка команди). */
export function newClub() {
  const used = new Set();
  const flag = rollFlag();
  const star = 1 + ((Math.random() * 10) | 0);
  const form = pick(['433', '442', '4231']);
  const heroes = slotsOf(form).map((s, i) => newHero(s, used, i === star ? (Math.random() < 0.35 ? 'l' : 'e') : rollRar()));
  return { v: 1, club: { name: pick(NAMES), city: pick(CITIES), flag, gk: pick(GK_COLS), form }, heroes, nm: 1, lvl: 1, xp: 0, coins: 300, rating: 1000, rec: { w: 0, d: 0, l: 0 }, goals: 0, games: 0 };
}

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
    e.num = count(e.num, 1, sl[i].num, 99); e.xp = count(e.xp, 0, 0); e.lvl = count(e.lvl, 1, 1); e.apps = count(e.apps, 0, 0); e.goals = count(e.goals, 0, 0); e.beard = count(e.beard, 0, 0, 3);
    if (!hasKey(RARITY, e.rar)) e.rar = 'c';
    if (e.custom !== true) e.custom = true;                      // власний вигляд героя (squadLook); з сервера поле не приходить
    if (e.trait != null && !hasKey(TRAITS, e.trait)) e.trait = null;
    if (typeof e.skin !== 'string') e.skin = ACADEMY.allSkins[1];
    if (typeof e.hair !== 'string') e.hair = 'crop';
    if (typeof e.hairCol !== 'string') e.hairCol = '#1f2933';
  }
  relabel(H, c.form);
}
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
    heroes: OP.heroes.map((e) => ({ ...toWireHero(e), id: e.id, xp: e.xp, lvl: e.lvl, apps: e.apps, goals: e.goals })),
    base: { coins: OP.coins, rating: OP.rating, lvl: OP.lvl, xp: OP.xp, rec: OP.rec, goals: OP.goals, games: OP.games },
  };
}
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
    const o = JSON.parse(JSON.stringify({ v: 1, nm: 1, club: c.club, heroes: c.heroes, lvl: c.lvl, xp: c.xp, coins: c.coins, rating: c.rating, rec: c.rec, goals: c.goals, games: c.games }));
    if (o.club.flag) o.club.flag = normFlag(o.club.flag);
    o.q = OP.q; o.live = OP.live; repair(o); OP = o; saveOP(); return true;
  }
  for (const k of ['coins', 'rating', 'lvl', 'xp', 'goals', 'games']) if (Number.isFinite(c[k])) OP[k] = Math.max(0, c[k]);
  if (c.rec && typeof c.rec === 'object') for (const k of ['w', 'd', 'l']) if (Number.isFinite(c.rec[k])) OP.rec[k] = c.rec[k];
  c.heroes.forEach((h, i) => adoptHero(i, h));
  saveOP(); return true;
}
/** Герой від сервера (тренування, матч): навички й досвід; новий id — новий герой (скаут), тоді весь запис. */
export function adoptHero(i, h) {
  const e = OP.heroes[i]; if (!e || !h || typeof h !== 'object') return false;
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

export function trainHero(i, k) {
  const e = OP.heroes[i]; if (!e || !(k in e.stats)) return false;
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
  scout: { name: 'Скаут', price: SCOUT_PRICE, odds: { c: 0.5, r: 0.3, e: 0.15, l: 0.05 } },
  rare: { name: 'Рідкісний пак', price: 450, odds: { r: 0.7, e: 0.25, l: 0.05 } },
  epic: { name: 'Епічний пак', price: 1200, odds: { e: 0.85, l: 0.15 } },
};
/** Рідкість за шансами пака: від легенди до звичайного. */
export function packRarity(kind, rnd = Math.random) {
  const o = (PACKS[kind] || PACKS.scout).odds; let r = rnd();
  for (const k of ['l', 'e', 'r', 'c']) { const p = o[k] || 0; if (r < p) return k; r -= p; }
  return Object.keys(o)[0];
}
/** Купити пак kind на слот i: новий герой або null (не вистачає монет, немає такого слота чи пака). */
export function buyPack(kind, i) {
  const P = PACKS[kind];
  if (!P || !OP.heroes[i] || OP.coins < P.price) return null;
  const used = new Set(OP.heroes.flatMap((e, j) => (j === i ? [] : [surname(e.name), 'f:' + e.name.split(' ')[0]])));
  const slot = slotsOf(OP.club.form)[i]; OP.coins -= P.price;
  const h = newHero(slot, used, packRarity(kind)); h.num = OP.heroes[i].num; OP.heroes[i] = h; saveOP(); return h;
}
/** Скаут: на слот приходить новий випадковий герой (рідкість — за шансом, легенда — 5%). */
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
  let clubUp = false; while (OP.xp >= clubXpNeed(OP.lvl)) { OP.xp -= clubXpNeed(OP.lvl); OP.lvl++; OP.coins += 100; clubUp = true; }
  const ups = [], left = scorers.slice();                    // кожен гол — одному героєві, навіть якщо в старому клубі є однофамільці
  for (const e of OP.heroes) {
    e.apps++;
    const sn = surname(e.name); let g = 0;
    for (let i = left.indexOf(sn); i >= 0; i = left.indexOf(sn)) { left.splice(i, 1); g++; }
    e.goals += g;
    gainXp(e, (win ? 30 : draw ? 20 : 12) + g * 25, ups);
  }
  saveOP();
  return { dR, coins, xp, clubUp, lvl: OP.lvl, ups };
}
