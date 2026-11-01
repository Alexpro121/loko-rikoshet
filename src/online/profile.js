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

const NAMES = ['СОКІЛ', 'ГРІМ', 'ВОВКИ', 'БУРЯ', 'КОМЕТА', 'ЛЕВИ', 'ШТОРМ', 'ЯСТРУБИ', 'ВУЛКАН', 'МАЯК', 'ЛАВІНА', 'ЗУБРИ', 'ДРАКОНИ', 'ЕКСПРЕС', 'ТАЙФУН', 'БЛИСКАВКА', 'ВІТЕР', 'ГЕТЬМАН', 'КОЗАКИ', 'ФЕНІКС'];
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

const SLOTS = [{ name: 'GK', line: 'G', num: 1 }, ...FORMATIONS['433']];
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
  const heroes = SLOTS.map((s, i) => newHero(s, used, i === star ? (Math.random() < 0.35 ? 'l' : 'e') : rollRar()));
  return { v: 1, club: { name: pick(NAMES), city: pick(CITIES), flag, gk: pick(GK_COLS) }, heroes, nm: 1, lvl: 1, xp: 0, coins: 300, rating: 1000, rec: { w: 0, d: 0, l: 0 }, goals: 0, games: 0 };
}

/** Старе збереження: прапор із новими шарами й герої з іменами нового генератора. Лише раз: результат одразу записуємо, інакше випадковість мінялася б з кожним запуском. */
function migrate(o) {
  if (o.club && o.club.flag && o.club.flag.ov !== undefined && o.nm) return;
  if (o.club) o.club.flag = upgradeFlag(o.club.flag);
  if (!o.nm) { const used = new Set(); for (const e of o.heroes) e.name = newName(used, e.rar); o.nm = 1; }   // рівні, навички й голи лишаються
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) { /* ignore */ }
}

function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const o = JSON.parse(raw); if (o && o.v === 1 && Array.isArray(o.heroes) && o.heroes.length === 11) { migrate(o); return o; } } } catch (_) { /* приватний режим */ }
  const o = newClub(); try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) { /* ignore */ }
  return o;
}

export let OP = load();
export function saveOP() { try { localStorage.setItem(KEY, JSON.stringify(OP)); } catch (_) { /* ignore */ } }
export function resetOP() { OP = newClub(); saveOP(); return OP; }

// ------------------------------------------------------------------ форма й прапор
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
/** Форма з кольорів прапора: футболка — перший колір, шорти — другий; номер — контрастний. */
export function kitOf(club) {
  const [a, b] = club.flag.c, dark = lum(a) > 0.6;
  return { main: a, second: b, shorts: b, socks: a, plate: dark ? '#14231e' : '#f1efe8', numInk: dark ? '#f1efe8' : '#13321f', ink: 'dark' };
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
/** Скаут: на слот приходить новий випадковий герой (рідкість — за шансом, легенда — 5%). */
export function scoutHero(i) {
  if (OP.coins < SCOUT_PRICE) return null;
  const used = new Set(OP.heroes.flatMap((e, j) => (j === i ? [] : [surname(e.name), 'f:' + e.name.split(' ')[0]])));
  const slot = SLOTS[i]; OP.coins -= SCOUT_PRICE;
  const h = newHero(slot, used); h.num = OP.heroes[i].num; OP.heroes[i] = h; saveOP(); return h;
}

// ------------------------------------------------------------------ обмін із суперником
/** Що бачить суперник: клуб і склад (без монет). */
export function toWire() {
  const c = OP.club;
  return {
    name: c.name, city: c.city, flag: c.flag, gk: c.gk, lvl: OP.lvl, rating: OP.rating, rec: OP.rec,
    heroes: OP.heroes.map((e) => ({ name: e.name, num: e.num, role: e.role, line: e.line, stats: e.stats, skin: e.skin, hair: e.hair, hairCol: e.hairCol, beard: e.beard || 0, rar: e.rar, trait: e.trait })),
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
const col = (v, d) => (typeof v === 'string' && HEX.test(v) ? v : d);
/** Чужий рядок: без символів розмітки (імена потрапляють у табло), обрізаний. */
export const plain = (v) => String(v).replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim();
const str = (v, d, n) => (typeof v === 'string' && plain(v) ? plain(v).slice(0, n) : d);
const num = (v, a, b, d) => (Number.isFinite(+v) ? clamp(Math.round(+v), a, b) : d);
/** Профіль суперника з мережі — усе перевіряємо й обрізаємо (дані чужі: жодного HTML, лише відомі значення). */
export function fromWire(w) {
  w = w && typeof w === 'object' ? w : {};
  const club = {
    name: str(w.name, 'ГОСТІ', 14).toUpperCase(), city: str(w.city, '', 18),
    flag: normFlag(w.flag),
    gk: col(w.gk, '#9fbf3a'),
  };
  const hs = Array.isArray(w.heroes) ? w.heroes : [];
  const heroes = SLOTS.map((s, i) => {
    const h = hs[i] && typeof hs[i] === 'object' ? hs[i] : {}, line = lineOf(s), st = {};
    for (const k of keysFor(line)) st[k] = num(h.stats && h.stats[k], 8, 99, 45);
    return {
      id: 'o' + i, role: s.name, pos: s.name, line, num: num(h.num, 1, 99, s.num), name: str(h.name, 'Гравець ' + (i + 1), 22), custom: true, stats: st, xp: 0, lvl: 1, apps: 0, goals: 0,
      rar: RARITY[h.rar] ? h.rar : 'c', trait: TRAITS[h.trait] ? h.trait : null,
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
