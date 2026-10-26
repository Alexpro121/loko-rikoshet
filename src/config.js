// Усі числові константи гри в одному місці.

export const PITCH = {
  L: 58,          // пів-довжини газону по X (100 одиниць, як справжнє поле 105×68 у масштабі)
  W: 37,          // пів-ширини по Z (64)
  G: 7.2,         // пів-ширини воріт
  CH: 2.8,        // зріз кутів арени
  WALL: 1.2,
  WALL_H: 1.2,
  GOAL_H: 3.8,    // висота воріт
  GOAL_D: 3.2,    // глибина воріт за лінією
  R: 0.34,        // радіус м'яча
  POST_R: 0.34,
};

export const PHYS = {
  hz: 120,
  drag: 0.7,      // експоненційне гальмування
  roll: 1.1,       // постійне гальмування, од/с²
  stop: 0.5,       // нижче цієї швидкості м'яч зупиняється
  wallE: 0.88,
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

export const KIT_LOKO = { stripe: '#18884f', main: '#c8213a', second: '#18884f', shorts: '#10613c', socks: '#c8213a', plate: '#f1efe8', numInk: '#13321f', ink: 'dark' };
/** Комплекти форми клубу на вибір: домашня (червоно-зелена), виїзна (біла) і третя (чорно-золота). */
export const KITS = {
  home: { name: 'Домашня', kit: KIT_LOKO },
  away: { name: 'Виїзна', kit: { stripe: '#c8213a', main: '#f1efe8', second: '#c8213a', shorts: '#157a46', socks: '#f1efe8', plate: '#14231e', numInk: '#13321f', ink: 'dark' } },
  third: { name: 'Третя', kit: { stripe: '#e8b923', main: '#1c2328', second: '#e8b923', shorts: '#1c2328', socks: '#1c2328', plate: '#f1efe8', numInk: '#13321f', ink: 'dark' } },
};
export const KIT_GK_LOKO = { main: '#e0a81c', second: '#23272b', shorts: '#23272b', socks: '#e0a81c', plate: '#23272b', numInk: '#f1efe8', ink: 'light' };

const club = (name, city, a, b, gk) => ({
  name, city,
  kit: { main: a, second: b, shorts: b, socks: a, plate: '#f1efe8', numInk: '#1f2933', ink: 'dark' },
  gk: { main: gk, second: '#1f2933', shorts: '#1f2933', socks: gk, plate: '#1f2933', numInk: '#f1efe8', ink: 'light' },
});

// Ліги: що вище, то щільніший пресинг, швидші гравці й краща розстановка суперника.
export const LEAGUES = [
  { id: 'l2', name: 'Друга ліга', short: '2', formation: '442', note: '',
    clubs: [club('НИВА', 'Тернопіль', '#8fc3dc', '#f1efe8', '#9fbf3a'), club('ПОДІЛЛЯ', 'Хмельницький', '#d9b02a', '#23272b', '#d86a8a'), club('ВОЛИНЬ', 'Луцьк', '#8d98a3', '#1f2933', '#9fbf3a')] },
  { id: 'l1', name: 'Перша ліга', short: '1', formation: '433', note: 'Суперник тисне вище',
    clubs: [club('МЕТАЛІСТ', 'Харків', '#dcc12c', '#1f4fa8', '#d86a8a'), club('ЧОРНОМОРЕЦЬ', 'Одеса', '#254e9c', '#e4e8ec', '#9fbf3a'), club('КАРПАТИ', 'Львів', '#eceff1', '#237a3f', '#d86a8a')] },
  { id: 'upl', name: 'Прем’єр-ліга УПЛ', short: 'У', formation: '4231', note: 'Швидкі фланги й кращі воротарі',
    clubs: [club('ЗОРЯ', 'Луганськ', '#3a4048', '#eceff1', '#9fbf3a'), club('ДИНАМО', 'Київ', '#eceff1', '#2a5db8', '#d98a3a'), club('ШАХТАР', 'Донецьк', '#e0762a', '#161a1d', '#9fbf3a')] },
  { id: 'ucl', name: 'Ліга чемпіонів', short: 'ЛЧ', formation: '433', note: 'Високий пресинг і швидкі контратаки',
    clubs: [club('МІЛАН', 'Мілан', '#1a1d21', '#c2262e', '#9fbf3a'), club('МЮНХЕН', 'Мюнхен', '#eceff1', '#b3162a', '#e0a81c'), club('МАДРИД', 'Мадрид', '#f4f4f1', '#c6a02a', '#d86a8a'), club('МАНЧЕСТЕР', 'Манчестер', '#6cb8e0', '#12294d', '#e0a81c')] },
];

// Розстановки: u — глибина (0 власні ворота … 1 ворота суперника) у обороні/атаці, v — ширина (-1..1)
const LINE = { D: [0.14, 0.40], M: [0.30, 0.62], F: [0.46, 0.84], W: [0.40, 0.76] };
const role = (line, v, num, name) => ({ line, v, num, name, uDef: LINE[line][0], uAtk: LINE[line][1] });
export const FORMATIONS = {
  '442': [role('D', -0.78, 3, 'LB'), role('D', -0.27, 4, 'CB'), role('D', 0.27, 5, 'CB'), role('D', 0.78, 2, 'RB'), role('M', -0.8, 11, 'LM'), role('M', -0.26, 8, 'CM'), role('M', 0.26, 6, 'CM'), role('M', 0.8, 7, 'RM'), role('F', -0.28, 9, 'ST'), role('F', 0.28, 10, 'ST')],
  '433': [role('D', -0.78, 3, 'LB'), role('D', -0.27, 4, 'CB'), role('D', 0.27, 5, 'CB'), role('D', 0.78, 2, 'RB'), role('M', -0.5, 8, 'CM'), role('M', 0, 6, 'DM'), role('M', 0.5, 10, 'CM'), role('W', -0.78, 11, 'LW'), role('F', 0, 9, 'ST'), role('W', 0.78, 7, 'RW')],
  '4231': [role('D', -0.78, 3, 'LB'), role('D', -0.27, 4, 'CB'), role('D', 0.27, 5, 'CB'), role('D', 0.78, 2, 'RB'), role('M', -0.3, 6, 'DM'), role('M', 0.3, 8, 'DM'), role('W', -0.8, 11, 'LW'), role('M', 0, 10, 'AM'), role('W', 0.8, 7, 'RW'), role('F', 0, 9, 'ST')],
};

export const FIXTURES = [];
LEAGUES.forEach((lg, li) => lg.clubs.forEach((c, ci) => FIXTURES.push({ league: li, club: c, no: ci + 1, of: lg.clubs.length, final: ci === lg.clubs.length - 1 })));

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Параметри матчу за прогресом: fixtureIdx 0..12 + номер сезону. */
export function matchSpec(fixtureIdx, season) {
  const fx = FIXTURES[fixtureIdx];
  const lg = LEAGUES[fx.league];
  const dr = fixtureIdx + season * FIXTURES.length, d = dr * 0.5;   // м'якший, плавніший ріст складності
  return {
    fixtureIdx, season, league: fx.league, leagueName: lg.name, club: fx.club, no: fx.no, of: fx.of, final: fx.final,
    globalNo: fixtureIdx + 1 + season * FIXTURES.length,
    formation: lg.formation, note: lg.note,
    scale: 1 + dr * 0.42,
    time: 75,
    runSpeed: clamp(5.0 + d * 0.16, 5.0, 8.2),    // швидкість польових гравців суперника
    press: clamp(0.12 + d * 0.035, 0.15, 0.85),   // наскільки агресивно суперник відбирає м'яч
    line: clamp(0.0 + d * 0.012, 0, 0.14),        // наскільки високо грає захист
    gkSpeed: clamp(5.0 + d * 0.3, 5, 10),
    gkTrack: clamp(0.18 + d * 0.035, 0.15, 0.8),
    gkErr: Math.max(0.4, 4.2 - d * 0.2),
    counterSpeed: clamp(40 + d * 0.7, 40, 62),
    tackle: clamp(0.5 + d * 0.01, 0.5, 0.9),
    slowFactor: 0.14,   // скільки секунд суперник дозволяє тримати м'яч
  };
}

// Трансфери
export const STRIKERS = [
  { id: 's0', name: 'Новачок', price: 0, jitter: 4.5, bounces: 1, hair: 'crop', hairCol: '#4a2c17', skin: '#e8bf9b', tip: 'Приціл із 1 відскоком' },
  { id: 's1', name: 'Кочегар', price: 450, jitter: 3.4, bounces: 2, hair: 'mohawk', hairCol: '#9c2a1c', skin: '#d4a074', tip: 'Приціл із 2 відскоками' },
  { id: 's2', name: 'Стрілочник', price: 1800, jitter: 2.4, bounces: 3, hair: 'long', hairCol: '#1f2933', skin: '#e8bf9b', tip: 'Приціл із 3 відскоками' },
  { id: 's3', name: 'Машиніст', price: 6500, jitter: 1.4, bounces: 4, hair: 'band', hairCol: '#6b4423', skin: '#b07a52', tip: 'Приціл із 4 відскоками' },
  { id: 's4', name: 'Експрес', price: 20000, jitter: 0.6, bounces: 5, hair: 'mohawk', hairCol: '#c9a227', skin: '#e8bf9b', tip: 'Майже без похибки' },
  { id: 's5', name: 'Тепловоз', price: 55000, jitter: 0, bounces: 6, hair: 'bald', hairCol: '#111827', skin: '#8a5a3c', tip: 'Нуль похибки, 6 відскоків' },
];

export const KEEPERS = [
  { id: 'k0', name: 'Дід Мороз', price: 0, speed: 7.0, reach: 1.15, concede: 1.0, hair: 'bald', hairCol: '#c9cdd1', skin: '#e8bf9b', tip: 'Звичайний воротар' },
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
  hairs: ['crop', 'mohawk', 'long', 'band', 'bald'],
  hairCols: ['#4a2c17', '#1f2933', '#8a6a1c', '#9c2a1c', '#6b4423', '#111827'],
  skins: ['#e8bf9b', '#d4a074', '#b07a52', '#8a5a3c'],
  // для редактора вигляду: ширший вибір
  allHairs: ['crop', 'buzz', 'slick', 'curly', 'pony', 'long', 'mohawk', 'band', 'bald'],
  allHairCols: ['#111827', '#1f2933', '#4a2c17', '#6b4423', '#8a6a1c', '#d8b25a', '#9c2a1c', '#cfcfcf'],
  allSkins: ['#f3d2b3', '#e8bf9b', '#d4a074', '#b07a52', '#8a5a3c', '#5f3d29'],
};

// Стадіон: ярус за рівнем прокачки
export const STADIUM_TIERS = [0, 2, 4, 7, 10, 14, 19];
export const STADIUM_TIER_NAMES = ['Перші трибуни', 'Бічні трибуни', 'Прожектори', 'Другий ярус', 'Дах і табло', 'Прапори', 'Золота арена'];

export const SETTINGS_DEFAULT = { sfx: true, music: true, haptics: true, quality: 'auto', control: 'auto', hand: 'right', joySize: 135, joyAlpha: 70, joyX: -1, joyY: -1, timeOfDay: 'day', weather: 'clear' };
