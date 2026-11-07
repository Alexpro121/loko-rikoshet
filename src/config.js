// Усі числові константи гри в одному місці.

export const PITCH = {
  L: 58,          // пів-довжини газону по X (100 одиниць, як справжнє поле 105×68 у масштабі)
  W: 37,          // пів-ширини по Z (64)
  // одиниця ≈ 0.9 м; гравець ~1.9 м. Ворота й м'яч — у справжніх пропорціях до гравців (трохи «пробачливіші» за реальні)
  G: 4.6,         // пів-ширини воріт (8.3 м; справжні 7.32 м)
  CH: 2.8,        // зріз кутів арени
  WALL: 1.2,
  WALL_H: 1.2,
  GOAL_H: 2.9,    // висота воріт (2.6 м; справжні 2.44 м)
  GOAL_D: 2.2,    // глибина воріт за лінією
  BOX_D: 15.6,    // штрафний: глибина від лінії воріт (розмітка й правила воротаря)
  BOX_W: 19,      // штрафний: пів-ширини
  R: 0.16,        // радіус м'яча у фізиці (трохи більший за видимий — м'яч легше прийняти й заблокувати)
  BALL_VIS: 0.14, // видимий радіус м'яча (діаметр ~25 см; справжній 22 см)
  POST_R: 0.16,
};

export const PHYS = {
  hz: 120,
  drag: 0.7,      // експоненційне гальмування
  roll: 1.1,       // постійне гальмування, од/с²
  stop: 0.5,       // нижче цієї швидкості м'яч зупиняється
  wallE: 0.88,
  wallMu: 0.14,    // тертя м'яча об борт у мить удару: ковзний відскок втрачає частину дотичної швидкості
  postE: 0.85,     // пружність стовпів і поперечини
  baseShot: 64,    // швидкість максимального удару без прокачки
  maxSpeed: 100,
  pullMaxFrac: 0.34, // відтягування (частка висоти екрана) для 100% сили
  pullMinFrac: 0.04,
  trapSpeed: 15,   // повільніше за це м'яч «приймають» гравці
};

export const COL = {
  skyMenu: 0xa9d9de,
  sky: 0xbfd3da,
  soil: '#a86a4e',
  gold: '#e8b923',
};

export const KIT_LOKO = { stripe: null, main: '#d4202c', second: '#1f8f3f', sleeve: '#d4202c', shorts: '#1f8f3f', socks: '#d4202c', under: '#f1efe8', collar: '#1f8f3f', boot: '#b9c1c7', plate: '#f1efe8', numInk: '#13321f', ink: 'dark', sponsor: true };
/** Комплекти форми клубу на вибір: домашня (червоно-зелена), виїзна (біла) і третя (чорно-золота). */
export const KITS = {
  home: { name: 'Домашня', kit: KIT_LOKO },
  away: { name: 'Виїзна', kit: { stripe: '#c8213a', main: '#f1efe8', second: '#c8213a', shorts: '#157a46', socks: '#f1efe8', plate: '#14231e', numInk: '#13321f', ink: 'dark' } },
  third: { name: 'Третя', kit: { stripe: '#e8b923', main: '#1c2328', second: '#e8b923', shorts: '#1c2328', socks: '#1c2328', plate: '#f1efe8', numInk: '#13321f', ink: 'dark' } },
};
export const KIT_GK_LOKO = { main: '#e0a81c', second: '#23272b', shorts: '#23272b', socks: '#e0a81c', plate: '#23272b', numInk: '#f1efe8', ink: 'light' };

/** Головні кольори ближчі за це (відстань у RGB): 22 гравці на полі вже не розрізняються. */
export const KIT_CLASH = 60;
const kitRgb = (k) => { const m = k && /^#([0-9a-f]{6})$/i.exec(k.main); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/** Відстань між головними кольорами двох форм; Infinity, якщо колір не вдалось прочитати (тоді форми вважаються різними). */
export function kitDist(a, b) { const p = kitRgb(a), q = kitRgb(b); return p && q ? Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) : Infinity; }
/**
 * Форма на один матч (чиста функція, нічого не зберігає; кар'єра й онлайн). Повертає kit, якщо він не зливається з oppKit;
 * інакше першу придатну з alts; якщо придатних нема, ту, що найдальша від суперника.
 */
export function pickKit(kit, oppKit, alts = []) {
  if (kitDist(kit, oppKit) >= KIT_CLASH) return kit;
  let best = kit, top = kitDist(kit, oppKit);
  for (const a of alts) { const d = kitDist(a, oppKit); if (d >= KIT_CLASH) return a; if (d > top) { top = d; best = a; } }
  return best;
}

const club = (name, city, a, b, gk) => ({
  name, city,
  kit: { main: a, second: b, shorts: b, socks: a, plate: '#f1efe8', numInk: '#1f2933', ink: 'dark' },
  gk: { main: gk, second: '#1f2933', shorts: '#1f2933', socks: gk, plate: '#1f2933', numInk: '#f1efe8', ink: 'light' },
});

// Ліги: що вище, то щільніший пресинг, швидші гравці й краща розстановка суперника.
export const LEAGUES = [
  { id: 'l2', name: 'Друга ліга', short: '2', formation: '442', note: '',
    clubs: [club('ЛЕЛЕКИ', 'Вербогір', '#8fc3dc', '#f1efe8', '#9fbf3a'), club('ГОНЧАРІ', 'Глинополь', '#d9b02a', '#23272b', '#d86a8a'), club('ЖУРАВЛІ', 'Журавлин', '#8d98a3', '#1f2933', '#9fbf3a')] },
  { id: 'l1', name: 'Перша ліга', short: '1', formation: '433', note: 'Суперник тисне вище',
    clubs: [club('БУРЕВІЙ', 'Золотополе', '#dcc12c', '#1f4fa8', '#d86a8a'), club('ПРИБІЙ', 'Мореград', '#254e9c', '#e4e8ec', '#9fbf3a'), club('СМЕРЕКА', 'Верхоліс', '#eceff1', '#237a3f', '#d86a8a')] },
  { id: 'upl', name: 'Вища ліга', short: 'В', formation: '4231', note: 'Швидкі фланги й кращі воротарі',
    clubs: [club('ТЕРИКОН', 'Рудоград', '#3a4048', '#eceff1', '#9fbf3a'), club('БАСТІОН', 'Кам’яноград', '#eceff1', '#6a3fa0', '#d98a3a'), club('ГОРНИЛО', 'Вогнеград', '#e0762a', '#2a2f6b', '#9fbf3a')] },
  { id: 'ucl', name: 'Ліга чемпіонів', short: 'ЛЧ', formation: '433', note: 'Високий тиск і швидкі контратаки',
    clubs: [club('ВАЛЬДОРА', 'Вальдора', '#3b2a5c', '#e8b923', '#9fbf3a'), club('НОРДГАЙМ', 'Нордгайм', '#eceff1', '#1c2b4a', '#e0a81c'), club('ТОРРЕМАР', 'Торремар', '#f4f4f1', '#c6a02a', '#d86a8a'), club('ГРЕЙВЕЛЛ', 'Грейвелл', '#2f8f8a', '#12294d', '#e0a81c'), club('ЛІНДЕНБУРГ', 'Лінденбург', '#1c3f94', '#d9e021', '#d86a8a')] },
  { id: 'wc', name: 'Чемпіонат світу', short: 'ЧС', formation: '4231', note: 'Найсильніші клуби світу', cup: 'Кубок світу',
    clubs: [club('ЗАМБАРА', 'Замбара', '#7b2cbf', '#f4d35e', '#9fbf3a'), club('АСАГАО', 'Асагао', '#f4f4f1', '#c2185b', '#e0a81c'), club('ОРІЛЬЯ', 'Санта-Орілья', '#f2c14e', '#0b5d8f', '#d86a8a'), club('ЛЕЙКВЮ', 'Лейквю', '#101820', '#00b4d8', '#9fbf3a')] },
];

/** Навички польового гравця й воротаря, лінія кожної ролі. */
export const STAT_KEYS = ['pace', 'shoot', 'pass', 'drib', 'tack', 'iq'];
export const GK_KEYS = ['react', 'reach', 'hands', 'pass', 'iq'];
export const LINE_OF = { GK: 'G', LB: 'D', CB: 'D', RB: 'D', DM: 'M', CM: 'M', AM: 'M', LM: 'M', RM: 'M', LW: 'W', RW: 'W', ST: 'F' };

// Розстановки: u — глибина (0 власні ворота … 1 ворота суперника) у обороні/атаці, v — ширина (-1..1)
const LINE = { D: [0.14, 0.40], M: [0.30, 0.62], F: [0.46, 0.84], W: [0.40, 0.76] };
const role = (line, v, num, name) => ({ line, v, num, name, uDef: LINE[line][0], uAtk: LINE[line][1] });
export const FORMATIONS = {
  '442': [role('D', -0.78, 3, 'LB'), role('D', -0.27, 4, 'CB'), role('D', 0.27, 5, 'CB'), role('D', 0.78, 2, 'RB'), role('M', -0.8, 11, 'LM'), role('M', -0.26, 8, 'CM'), role('M', 0.26, 6, 'CM'), role('M', 0.8, 7, 'RM'), role('F', -0.28, 9, 'ST'), role('F', 0.28, 10, 'ST')],
  '433': [role('D', -0.78, 3, 'LB'), role('D', -0.27, 4, 'CB'), role('D', 0.27, 5, 'CB'), role('D', 0.78, 2, 'RB'), role('M', -0.5, 8, 'CM'), role('M', 0, 6, 'DM'), role('M', 0.5, 10, 'CM'), role('W', -0.78, 11, 'LW'), role('F', 0, 9, 'ST'), role('W', 0.78, 7, 'RW')],
  '352': [role('D', -0.55, 4, 'CB'), role('D', 0, 5, 'CB'), role('D', 0.55, 3, 'CB'), role('M', -0.85, 11, 'LM'), role('M', -0.36, 8, 'CM'), role('M', 0, 6, 'DM'), role('M', 0.36, 10, 'CM'), role('M', 0.85, 7, 'RM'), role('F', -0.28, 9, 'ST'), role('F', 0.28, 2, 'ST')],
  '343': [role('D', -0.55, 4, 'CB'), role('D', 0, 5, 'CB'), role('D', 0.55, 3, 'CB'), role('M', -0.8, 2, 'LM'), role('M', -0.26, 8, 'CM'), role('M', 0.26, 6, 'CM'), role('M', 0.8, 10, 'RM'), role('W', -0.78, 11, 'LW'), role('F', 0, 9, 'ST'), role('W', 0.78, 7, 'RW')],
  '532': [role('D', -0.86, 3, 'LB'), role('D', -0.42, 4, 'CB'), role('D', 0, 5, 'CB'), role('D', 0.42, 6, 'CB'), role('D', 0.86, 2, 'RB'), role('M', -0.5, 8, 'CM'), role('M', 0, 7, 'DM'), role('M', 0.5, 10, 'CM'), role('F', -0.28, 9, 'ST'), role('F', 0.28, 11, 'ST')],
  '4141': [role('D', -0.78, 3, 'LB'), role('D', -0.27, 4, 'CB'), role('D', 0.27, 5, 'CB'), role('D', 0.78, 2, 'RB'), role('M', 0, 6, 'DM'), role('W', -0.8, 11, 'LW'), role('M', -0.3, 8, 'CM'), role('M', 0.3, 10, 'CM'), role('W', 0.8, 7, 'RW'), role('F', 0, 9, 'ST')],
  '4231': [role('D', -0.78, 3, 'LB'), role('D', -0.27, 4, 'CB'), role('D', 0.27, 5, 'CB'), role('D', 0.78, 2, 'RB'), role('M', -0.3, 6, 'DM'), role('M', 0.3, 8, 'DM'), role('W', -0.8, 11, 'LW'), role('M', 0, 10, 'AM'), role('W', 0.8, 7, 'RW'), role('F', 0, 9, 'ST')],
};

/**
 * Фірмові зачіски закордонних клубів (Ліга чемпіонів, Чемпіонат світу). Частина є лише в них (вікінг, шипи, самурай, кіски,
 * закрутки, афро-ірокез, малет, проділ, чубчик на око), а не в українських складах. Решту складу добирає HAIR_GENERIC.
 */
export const CLUB_HAIRS = {
  'ВАЛЬДОРА': ['slick', 'sidepart', 'curtains', 'halfbun', 'curly', 'band'], 'НОРДГАЙМ': ['viking', 'halfbun', 'bun', 'long', 'wolf', 'undercut'],
  'ТОРРЕМАР': ['mullet', 'slick', 'band', 'long', 'curtains', 'quiff'], 'ГРЕЙВЕЛЛ': ['mop', 'sidepart', 'quiff', 'fringe', 'curtains', 'crop'],
  'ЛІНДЕНБУРГ': ['undercut', 'flattop', 'mullet', 'sidepart', 'wolf', 'buzz'], 'ЗАМБАРА': ['afro', 'cornrows', 'twists', 'frohawk', 'dreads', 'buzz'],
  'АСАГАО': ['spiky', 'topknot', 'emo', 'frosted', 'halfbun', 'fringe'], 'ОРІЛЬЯ': ['frohawk', 'curly', 'mullet', 'mohawk', 'twists', 'afro'],
  'ЛЕЙКВЮ': ['flattop', 'cornrows', 'frosted', 'quiff', 'buzz', 'twists'],
};
/** Звичайні зачіски, якими закордонний клуб добирає склад після фірмових (без українських і без чужих фірмових). */
export const HAIR_GENERIC = ['crop', 'buzz', 'slick', 'curly', 'pony', 'long', 'mohawk', 'band', 'bald', 'quiff', 'afro', 'undercut', 'flattop', 'bun', 'dreads', 'fringe', 'curtains', 'mop', 'frosted', 'wolf', 'halfbun'];
/** Зачіска, якої в команді ще немає (taken — Set): повтор лише коли вільних не лишилось. Рівно один виклик r(), як у звичайного вибору. */
export const freshHair = (pool, taken, r) => { const free = pool.filter((h) => !taken.has(h)); const a = free.length ? free : pool; return a[(r() * a.length) | 0]; };
/** Колода зачісок команди без повторів: спершу фірмові клубу (у випадковому порядку), далі решта. r — окремий генератор. */
export function hairDeck(clubName, r) {
  const shuf = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sig = CLUB_HAIRS[clubName];
  return sig ? [...shuf(sig), ...shuf(HAIR_GENERIC.filter((h) => !sig.includes(h)))] : shuf(ACADEMY.hairs);
}

export const FIXTURES = [];
LEAGUES.forEach((lg, li) => lg.clubs.forEach((c, ci) => FIXTURES.push({ league: li, club: c, no: ci + 1, of: lg.clubs.length, final: ci === lg.clubs.length - 1 })));

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Складність суперника за прогресом («жар»): номер матчу в сезоні плюс SEASON_HEAT за кожен пройдений сезон.
 * Новий сезон не додає всіх 18 матчів: за сезон наш склад росте приблизно на стільки, скільки суперник за 8 матчів,
 * тож другий сезон починається трохи легше за фінал першого, а не стіною (симулятор кар'єри: старий ріст
 * зупиняв гравця на 2–3 матчі Ліги чемпіонів, ~8% перемог). Нагороди (scale) й далі рахуються за всіма матчами.
 */
export const SEASON_HEAT = 8;
export const heatOf = (fixtureIdx, season) => fixtureIdx + season * SEASON_HEAT;

/** Параметри матчу за прогресом: fixtureIdx (порядковий номер у FIXTURES) + номер сезону. */
export function matchSpec(fixtureIdx, season) {
  const fx = FIXTURES[fixtureIdx];
  const lg = LEAGUES[fx.league];
  // dr — номер матчу від початку гри (нагороди); h — «жар» (heatOf): кожен наступний суперник сильніший (швидше бігає,
  // жорсткіше пресингує, точніше й сильніше б'є, дає менше часу на роздуми), а стелі досягаються лише на третьому сезоні.
  // Найбільше важать склад суперника (oppSquad), швидкість бігу й сила ударів: їхні нахили тут найпологіші
  const dr = fixtureIdx + season * FIXTURES.length, h = heatOf(fixtureIdx, season);
  return {
    fixtureIdx, season, league: fx.league, leagueName: lg.name, cupName: lg.cup || 'Кубок ліги', club: fx.club, no: fx.no, of: fx.of, final: fx.final,
    globalNo: fixtureIdx + 1 + season * FIXTURES.length,
    formation: lg.formation, note: lg.note,
    scale: 1 + dr * 0.42,
    time: 270,                                    // 4 тайми по ~68 с (на табло — стиснуті 90 хв)
    runSpeed: clamp(7.4 + h * 0.1, 7.4, 9.6),     // швидкість польових гравців суперника (наші — 9.2)
    press: clamp(0.1 + h * 0.03, 0.1, 0.85),      // наскільки агресивно суперник відбирає м'яч
    line: clamp(h * 0.006, 0, 0.14),              // наскільки високо грає захист
    gkErr: Math.max(0.6, 4.8 - h * 0.17),         // похибка ударів суперника (менше — точніше б'є)
    counterSpeed: clamp(36 + h, 36, 58),          // сила ударів суперника
    tackle: clamp(0.42 + h * 0.02, 0.42, 0.9),    // шанс відбору
    slowFactor: clamp(0.11 + h * 0.004, 0.11, 0.22),   // темп сповільнення при прицілюванні (більше — менше часу на роздуми)
  };
}

// Трансфери
export const STRIKERS = [
  { id: 's0', name: 'Новачок', price: 0, jitter: 4.5, bounces: 1, hair: 'crop', hairCol: '#4a2c17', skin: '#e8bf9b', tip: 'Приціл із 1 відскоком' },
  { id: 's1', name: 'Кочегар', price: 450, jitter: 3.4, bounces: 2, hair: 'mohawk', hairCol: '#9c2a1c', skin: '#d4a074', tip: 'Приціл із 2 відскоками' },
  { id: 's2', name: 'Стрілочник', price: 1800, jitter: 2.4, bounces: 3, hair: 'long', hairCol: '#1f2933', skin: '#e8bf9b', tip: 'Приціл із 3 відскоками' },
  { id: 's3', name: 'Машиніст', price: 6500, jitter: 1.4, bounces: 4, hair: 'band', hairCol: '#6b4423', skin: '#b07a52', tip: 'Приціл із 4 відскоками' },
  { id: 's4', name: 'Експрес', price: 20000, jitter: 0.6, bounces: 5, hair: 'mohawk', hairCol: '#c9a227', skin: '#e8bf9b', tip: 'Майже без похибки' },
  { id: 's5', name: 'Тепловоз', price: 55000, jitter: 0, bounces: 6, hair: 'bald', hairCol: '#111827', skin: '#8a5a3c', tip: 'Найточніший приціл, 6 відскоків' },
];

/** Навичка «Удар» 0..1 -> множник сили сильного удару (0.5 — звичайний, 1 — на 18 % сильніший). */
export const shotSkill = (v) => 0.82 + 0.36 * v;

export const KEEPERS = [
  { id: 'k0', name: 'Alex LOKO', price: 0, speed: 7.0, reach: 1.15, concede: 1.0, hair: 'bald', hairCol: '#c9cdd1', skin: '#e8bf9b', tip: 'Звичайний воротар' },
  { id: 'k1', name: 'Сторож', price: 380, speed: 8.4, reach: 1.25, concede: 0.85, hair: 'crop', hairCol: '#374151', skin: '#d4a074', tip: 'Швидший, довші руки' },
  { id: 'k2', name: 'Шлагбаум', price: 1500, speed: 9.6, reach: 1.4, concede: 0.7, hair: 'band', hairCol: '#1f2933', skin: '#e8bf9b', tip: 'Перекриває пів воріт' },
  { id: 'k3', name: 'Диспетчер', price: 5600, speed: 11, reach: 1.5, concede: 0.55, hair: 'crop', hairCol: '#8a6a1c', skin: '#b07a52', tip: 'Читає удари наперед' },
  { id: 'k4', name: 'Стіна', price: 18000, speed: 12.5, reach: 1.7, concede: 0.4, hair: 'long', hairCol: '#111827', skin: '#8a5a3c', tip: 'Майже не пропускає' },
];

export const ACADEMY = {
  need: 3,          // очок до випускника
  slots: 6,
  firstNames: ['Артем', 'Данило', 'Максим', 'Богдан', 'Ярослав', 'Тарас', 'Назар', 'Олексій', 'Кирило', 'Матвій', 'Левко', 'Орест', 'Станіслав', 'Захар'],
  lastNames: ['Рейка', 'Шпала', 'Семафор', 'Колія', 'Вагонюк', 'Стрілець', 'Депо', 'Перон', 'Гудок', 'Ковальчук', 'Бойко', 'Мельник', 'Шевчук', 'Лисенко'],
  rarities: [
    { id: 'c', name: 'Звичайний', bonus: [2, 3], w: 62, col: '#9ca3af' },
    { id: 'r', name: 'Рідкісний', bonus: [4, 5], w: 28, col: '#5fb3e6' },
    { id: 'e', name: 'Золотий', bonus: [7, 9], w: 10, col: '#e8b923' },
  ],
  // випадкові зачіски згенерованих гравців (склади, суперники, випускники, статисти на виході)
  hairs: ['crop', 'mohawk', 'long', 'band', 'bald', 'quiff', 'afro', 'undercut', 'fringe', 'flattop', 'dreads', 'buzz', 'curly', 'slick', 'bun', 'pony', 'oseledets', 'makitra', 'chub', 'curtains', 'mop', 'frosted', 'wolf', 'halfbun'],
  hairCols: ['#4a2c17', '#1f2933', '#8a6a1c', '#9c2a1c', '#6b4423', '#111827'],
  skins: ['#e8bf9b', '#d4a074', '#b07a52', '#8a5a3c'],
  // для редактора вигляду: ширший вибір
  allHairs: ['crop', 'buzz', 'slick', 'curly', 'pony', 'long', 'mohawk', 'band', 'bald', 'quiff', 'afro', 'undercut', 'flattop', 'bun', 'dreads', 'fringe', 'oseledets', 'makitra', 'chub', 'braidcrown', 'vinok', 'viking', 'spiky', 'topknot', 'cornrows', 'mullet', 'sidepart', 'twists', 'frohawk', 'frosted', 'curtains', 'emo', 'halfbun', 'mop', 'wolf'],
  hairNames: { crop: 'Класика', buzz: 'Їжачок', slick: 'Зачесане', curly: 'Кучері', pony: 'Хвіст', long: 'Довге', mohawk: 'Ірокез', band: 'Пов’язка', bald: 'Лисий', quiff: 'Кок', afro: 'Афро', undercut: 'Андеркат', flattop: 'Майданчик', bun: 'Гулька', dreads: 'Дреди', fringe: 'Чубчик',
    oseledets: 'Оселедець', makitra: 'Під макітру', chub: 'Чуб набік', braidcrown: 'Коса-корона', vinok: 'Вінок', viking: 'Вікінг', spiky: 'Шипи', topknot: 'Самурай', cornrows: 'Кіски', mullet: 'Малет', sidepart: 'Проділ',
    twists: 'Закрутки', frohawk: 'Афро-ірокез', frosted: 'Світлі кінчики', curtains: 'Штори', emo: 'Чубчик на око', halfbun: 'Пів-гулька', mop: 'Швабра', wolf: 'Вовча' },
  allHairCols: ['#111827', '#1f2933', '#4a2c17', '#6b4423', '#8a6a1c', '#d8b25a', '#9c2a1c', '#cfcfcf'],
  allSkins: ['#f3d2b3', '#e8bf9b', '#d4a074', '#b07a52', '#8a5a3c', '#5f3d29'],
};

// Стадіон: ярус за рівнем прокачки
export const STADIUM_TIERS = [0, 2, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 26];
export const STADIUM_TIER_NAMES = ['Перші трибуни', 'Бічні трибуни', 'Тунель і лавки', 'Прожектори', 'Другий ярус', 'Світлові борти', 'Дах і табло', 'Прапори', 'Клубна крамниця й кав’ярня', 'Тренувальне поле', 'Музей клубу', 'Готель і офіс', 'Стоянка й автобуси', 'Золота арена'];

export const SETTINGS_DEFAULT = { sfx: true, music: true, haptics: true, quality: 'auto', control: 'auto', hand: 'right', joySize: 135, joyAlpha: 70, joyX: -1, joyY: -1, timeOfDay: 'day', weather: 'clear',
  camMode: 'classic', camDist: 100, camTiltOff: 0, camFollow: 100, camShake: true,
  mapOn: true, mapX: 1, mapY: 0, mapSize: 100, mapAlpha: 85, mapRun: true, mapBall: true, mapTrailA: 50, mapOpp: true, mapCam: true };
/**
 * Пресети ігрової камери (core/camera.js). Усі — як у телетрансляції футболу: сталий широкий план, що йде за м'ячем без відставання;
 * віддаляється лише тоді, коли важливі для моменту гравці не влазять (не далі, ніж grow).
 * el — нахил (°); yaw — звідки дивимось (0 — збоку; −π/2 — з-за наших воріт, атака вгору екрана); fov — кут огляду;
 * width — скільки поля (од.) видно поперек широкого екрана біля м'яча, depth — уздовж (вглиб); pmin — частка ширини,
 * нижче якої вона не падає на вузькому екрані; af / cf — наскільки ціль іде за м'ячем поперек кадру / вглиб (1 — повністю),
 * co — зсув цілі вглиб; lead — запас попереду атаки (частка пів-ширини); rate — швидкість слідкування; swing — поворот
 * за м'ячем, як у камери на центральній лінії; mates — скільки партнерів-адресатів паса тримати в кадрі.
 */
export const CAM_PRESETS = {
  classic: { name: 'КЛАСИЧНА', note: "Звична камера гри: широкий план збоку, швидко за м'ячем", el: 60, yaw: 0, fov: 34, width: 58, depth: 37, pmin: 0.55, af: 0.94, cf: 0.55, co: -2.4, lead: 0.1, rate: 5, swing: 0, grow: 1.3, mates: 2 },
  broadcast: { name: 'ТРАНСЛЯЦІЯ', note: 'Як телетрансляція: далі й ширше, камера на центральній лінії повертається за грою', el: 50, yaw: 0, fov: 30, width: 64, depth: 34, pmin: 0.55, af: 0.96, cf: 0.4, co: -3, lead: 0.12, rate: 4.6, swing: 0.18, grow: 1.25, mates: 2 },
  dynamic: { name: 'ДИНАМІЧНА', note: 'Трохи ближче й енергійніше, більше простору попереду атаки', el: 58, yaw: 0, fov: 38, width: 50, depth: 32, pmin: 0.6, af: 1, cf: 0.7, co: -1.5, lead: 0.18, rate: 6, swing: 0.08, grow: 1.35, mates: 1 },
  tactic: { name: 'ТАКТИЧНА', note: 'Високо й широко: видно розстановку, партнерів і вільні зони', el: 72, yaw: 0, fov: 34, width: 74, depth: 46, pmin: 0.6, af: 0.9, cf: 0.4, co: -1, lead: 0.1, rate: 4.6, swing: 0, grow: 1.2, mates: 4 },
  vertical: { name: 'ВЕРТИКАЛЬНА', note: 'З-за спини: атака йде вгору екрана', el: 62, yaw: -Math.PI / 2, fov: 42, width: 46, depth: 40, pmin: 0.75, af: 0.6, cf: 1, co: -3, lead: 0.1, rate: 5, swing: 0, grow: 1.3, mates: 2 },
  auto: { name: 'АВТО', note: 'Сама обирає камеру за формою екрана: на горизонтальному це класична' },
};
