// Онлайн-клуб гравця: окремий від кар'єри «Локомотива» — своя назва, прапор, форма, 11 унікальних героїв, рівень,
// рейтинг і монети. Зберігається окремо (loko-online-v1), щоб онлайн не чіпав прогрес кар'єри.
import { ACADEMY, FORMATIONS } from '../config.js';
import { makeStats, keysFor, ovr, gainXp } from '../state/squad.js';

const KEY = 'loko-online-v1';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = (a, rnd = Math.random) => a[(rnd() * a.length) | 0];

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const NAMES = ['СОКІЛ', 'ГРІМ', 'ВОВКИ', 'БУРЯ', 'КОМЕТА', 'ЛЕВИ', 'ШТОРМ', 'ЯСТРУБИ', 'ВУЛКАН', 'МАЯК', 'ЛАВІНА', 'ЗУБРИ', 'ДРАКОНИ', 'ЕКСПРЕС', 'ТАЙФУН', 'БЛИСКАВКА', 'ВІТЕР', 'ГЕТЬМАН', 'КОЗАКИ', 'ФЕНІКС'];
const CITIES = ['Полтава', 'Черкаси', 'Суми', 'Житомир', 'Ужгород', 'Рівне', 'Чернігів', 'Вінниця', 'Ізмаїл', 'Кременчук', 'Бердичів', 'Дрогобич', 'Мукачево', 'Умань', 'Коломия', 'Ніжин', 'Біла Церква', 'Прилуки'];
const FIRST = ['Ярема', 'Остап', 'Богдан', 'Тарас', 'Северин', 'Мирон', 'Захар', 'Орест', 'Назар', 'Святослав', 'Ілько', 'Данило', 'Гнат', 'Устим', 'Лука', 'Марко', 'Яким', 'Арсен', 'Влад', 'Корній', 'Добромир', 'Любомир', 'Остромир', 'Тихон'];
const LAST = ['Грім', 'Вихор', 'Сокира', 'Буревій', 'Залізняк', 'Підкова', 'Гартований', 'Кремінь', 'Вітрогон', 'Списенко', 'Дуб', 'Вовкулака', 'Чорновус', 'Громовий', 'Скеля', 'Блискавиця', 'Козак', 'Сірко', 'Невгамовний', 'Ковзан', 'Мечник', 'Яструб', 'Вогняр', 'Буйтур'];

/** Палітра прапорів і форм: насичені кольори, з яких добре читається футболка на газоні. */
export const FLAG_COLS = ['#d4202c', '#1f8f3f', '#1f4fa8', '#e8b923', '#f1efe8', '#14231e', '#e0762a', '#6a2fa0', '#3fb7d8', '#c2185b', '#7a8a2a', '#8d98a3'];
export const FLAG_PATS = ['h2', 'h3', 'v3', 'diag', 'cross', 'border', 'chev', 'quad'];
export const FLAG_EMB = ['none', 'star', 'ball', 'bolt', 'crown', 'wheel', 'trident'];
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
  let name = ''; for (let i = 0; i < 20; i++) { name = pick(FIRST) + ' ' + pick(LAST); if (!used.has(name)) break; }
  used.add(name);
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
  const cols = FLAG_COLS.slice().sort(() => Math.random() - 0.5);
  const flag = { pat: pick(FLAG_PATS), c: [cols[0], cols[1], cols[2]], em: pick(FLAG_EMB.slice(1)) };
  const star = 1 + ((Math.random() * 10) | 0);
  const heroes = SLOTS.map((s, i) => newHero(s, used, i === star ? (Math.random() < 0.35 ? 'l' : 'e') : rollRar()));
  return { v: 1, club: { name: pick(NAMES), city: pick(CITIES), flag, gk: pick(GK_COLS) }, heroes, lvl: 1, xp: 0, coins: 300, rating: 1000, rec: { w: 0, d: 0, l: 0 }, goals: 0, games: 0 };
}

function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const o = JSON.parse(raw); if (o && o.v === 1 && Array.isArray(o.heroes) && o.heroes.length === 11) return o; } } catch (_) { /* приватний режим */ }
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

const EMB = {
  star: '<path d="M30 9l5.6 11.4 12.6 1.8-9.1 8.9 2.2 12.5L30 37.7l-11.3 5.9 2.2-12.5-9.1-8.9 12.6-1.8z"/>',
  ball: '<circle cx="30" cy="26" r="12"/><path d="M30 19l6 4.4-2.3 7h-7.4l-2.3-7z" fill="#14231e"/>',
  bolt: '<path d="M33 8L19 29h9l-4 15 15-22h-9z"/>',
  crown: '<path d="M15 34l-3-17 10 8 8-12 8 12 10-8-3 17z"/><rect x="15" y="36" width="30" height="4"/>',
  wheel: '<circle cx="30" cy="26" r="12" fill="none" stroke-width="4"/><path d="M30 14v24M18 26h24M21.5 17.5l17 17M38.5 17.5l-17 17" stroke-width="3"/>',
  trident: '<path d="M30 8l3 6h-1.5v16c3 0 6-3 6-9V13l4 5v4c0 8-4 12-8.5 13V44h-6V35C22.5 34 18.5 30 18.5 22v-4l4-5v8c0 6 3 9 6 9V14H27z"/>',
};
/** Прапор клубу як SVG 60×40 (смуги/хрест/рамка + емблема). */
export function flagSvg(flag, cls = 'oflag') {
  const [a, b, c] = flag.c, P = {
    h2: `<rect width="60" height="20" fill="${a}"/><rect y="20" width="60" height="20" fill="${b}"/>`,
    h3: `<rect width="60" height="14" fill="${a}"/><rect y="13" width="60" height="14" fill="${b}"/><rect y="27" width="60" height="13" fill="${c}"/>`,
    v3: `<rect width="20" height="40" fill="${a}"/><rect x="20" width="20" height="40" fill="${b}"/><rect x="40" width="20" height="40" fill="${c}"/>`,
    diag: `<rect width="60" height="40" fill="${a}"/><path d="M0 40L60 0V40z" fill="${b}"/>`,
    cross: `<rect width="60" height="40" fill="${a}"/><rect x="18" width="9" height="40" fill="${b}"/><rect y="15.5" width="60" height="9" fill="${b}"/>`,
    border: `<rect width="60" height="40" fill="${b}"/><rect x="5" y="5" width="50" height="30" fill="${a}"/>`,
    chev: `<rect width="60" height="40" fill="${a}"/><path d="M0 0L26 20 0 40z" fill="${b}"/>`,
    quad: `<rect width="60" height="40" fill="${a}"/><rect width="30" height="20" fill="${b}"/><rect x="30" y="20" width="30" height="20" fill="${b}"/>`,
  }[flag.pat] || '';
  const em = EMB[flag.em] ? `<g transform="translate(${flag.pat === 'cross' ? 22.5 : 30} 20) scale(.62) translate(-30 -26)" fill="${c}" stroke="${c}">${EMB[flag.em]}</g>` : '';
  return `<svg class="${cls}" viewBox="0 0 60 40" aria-hidden="true">${P}${em}<rect width="60" height="40" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/></svg>`;
}

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
  const used = new Set(OP.heroes.map((e) => e.name));
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
  const f = w.flag && typeof w.flag === 'object' ? w.flag : {};
  const fc = Array.isArray(f.c) ? f.c : [];
  const club = {
    name: str(w.name, 'ГОСТІ', 14).toUpperCase(), city: str(w.city, '', 18),
    flag: { pat: FLAG_PATS.includes(f.pat) ? f.pat : 'h2', c: [col(fc[0], '#254e9c'), col(fc[1], '#e4e8ec'), col(fc[2], '#e8b923')], em: FLAG_EMB.includes(f.em) ? f.em : 'none' },
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
  const ups = [];
  for (const e of OP.heroes) {
    e.apps++;
    const g = scorers.filter((n) => n === String(e.name).split(' ').slice(-1)[0]).length; e.goals += g;
    gainXp(e, (win ? 30 : draw ? 20 : 12) + g * 25, ups);
  }
  saveOP();
  return { dR, coins, xp, clubUp, lvl: OP.lvl, ups };
}
