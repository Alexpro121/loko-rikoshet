// Квести онлайн-клубу: 3 денні (легкий, середній, важкий) і 1 тижневий. Набір однаковий для всіх гравців: зерно — дата за Києвом,
// оновлення опівночі й у понеділок. Прогрес і забрані нагороди свої, в OP.q (loko-online-v1). Рахуються лише онлайн-матчі, дограні
// до фінального свистка: технічні результати й обірвані матчі ні (session.js, finish). Нагорода — монети онлайн-клубу кнопкою
// «Забрати»; виконане й незабране зараховується саме, коли набір оновлюється, тож нічого не згорає.
import { OP, saveOP } from './profile.js';

/** m — підсумок матчу з нашого погляду (matchFacts). f повертає, на скільки матч просуває квест. */
const DAY = {
  easy: [
    { id: 'play2', t: 'Зіграй 2 матчі', n: 2, c: 60, f: () => 1 },
    { id: 'goals3', t: 'Забий 3 голи', n: 3, c: 60, f: (m) => m.gf },
    { id: 'unbeaten', t: 'Не програй матч', n: 1, c: 65, f: (m) => +(m.gf >= m.ga) },
  ],
  mid: [
    { id: 'win', t: 'Виграй матч', n: 1, c: 90, f: (m) => +(m.gf > m.ga) },
    { id: 'clean', t: 'Зіграй на нуль', n: 1, c: 100, f: (m) => +(m.ga === 0) },
    { id: 'back', t: 'Забий гол захисником або півзахисником', n: 1, c: 90, f: (m) => m.backGoals },
  ],
  hard: [
    { id: 'big', t: 'Виграй з різницею у 2 голи', n: 1, c: 110, f: (m) => +(m.gf - m.ga >= 2) },
    { id: 'four', t: 'Забий 4 голи в одному матчі', n: 1, c: 120, f: (m) => +(m.gf >= 4) },
    { id: 'comeback', t: 'Виграй, пропустивши першим', n: 1, c: 140, f: (m) => +(m.gf > m.ga && m.behind) },
    { id: 'giant', t: 'Обіграй клуб із вищим рейтингом', n: 1, c: 130, f: (m) => +(m.gf > m.ga && m.oppR > m.myR) },
  ],
};
// d — Iron Dollar (друга валюта): тижневий квест дає ще й долари
const WEEK = [
  { id: 'w-win8', t: 'Виграй 8 матчів', n: 8, c: 450, d: 3, f: (m) => +(m.gf > m.ga) },
  { id: 'w-goals20', t: 'Забий 20 голів', n: 20, c: 400, d: 3, f: (m) => m.gf },
  { id: 'w-play12', t: 'Зіграй 12 матчів', n: 12, c: 380, d: 2, f: () => 1 },
];
const BY_ID = {};
for (const q of [...DAY.easy, ...DAY.mid, ...DAY.hard, ...WEEK]) BY_ID[q.id] = q;
export const questDef = (id) => BY_ID[id] || null;

// ------------------------------------------------------------------ час за Києвом
let fmtK;
/** Дата й час за Києвом. Старий браузер без поясу «Europe/Kyiv» бере стару назву, а без поясів зовсім — час пристрою. */
function kyiv(t) {
  if (fmtK === undefined) {
    fmtK = null;
    for (const tz of ['Europe/Kyiv', 'Europe/Kiev']) {
      try { fmtK = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }); break; } catch (_) { /* немає такого поясу */ }
    }
  }
  if (!fmtK) { const d = new Date(t); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds() }; }
  const o = {}; for (const p of fmtK.formatToParts(t)) o[p.type] = +p.value;
  return { y: o.year, m: o.month, d: o.day, h: o.hour % 24, mi: o.minute, s: o.second };
}
const dayKey = (k) => k.y + '-' + String(k.m).padStart(2, '0') + '-' + String(k.d).padStart(2, '0');
const dayNum = (k) => Math.round(Date.UTC(k.y, k.m - 1, k.d) / 864e5);
const weekday = (k) => (new Date(Date.UTC(k.y, k.m - 1, k.d)).getUTCDay() + 6) % 7;   // 0 — понеділок
const weekKey = (k) => dayNum(k) - weekday(k);                                       // номер дня понеділка
/** Скільки мілісекунд до оновлення денних і тижневого квестів. */
export function questsLeft(t = Date.now()) {
  const k = kyiv(t), day = (86400 - (k.h * 3600 + k.mi * 60 + k.s)) * 1000;
  return { day, week: day + (6 - weekday(k)) * 864e5 };
}

// ------------------------------------------------------------------ набір
/** Детермінований генератор від рядка: однаковий набір в усіх гравців того самого дня. */
function rng(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = (h + 0x6d2b79f5) | 0; let x = Math.imul(h ^ (h >>> 15), 1 | h); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const fresh = (id) => ({ id, p: 0, got: false });
// Чиста частина для сервера гри (server/): ті самі набори й та сама логіка, без OP і localStorage
/** Ключі періодів за Києвом: d — 'РРРР-ММ-ДД', w — номер дня понеділка. */
export function questPeriods(t = Date.now()) { const k = kyiv(t); return { d: dayKey(k), w: weekKey(k) }; }
/** id квестів дня d і тижня w: однакові в усіх гравців. */
export const dayIds = (d) => { const r = rng('day:' + d); return [DAY.easy, DAY.mid, DAY.hard].map((l) => l[(r() * l.length) | 0].id); };
export const weekIds = (w) => [WEEK[(rng('week:' + w)() * WEEK.length) | 0].id];
/** На скільки матч із фактами m просуває квест id (0 — не просуває). Межу n рахує той, хто зберігає прогрес. */
export const questStep = (id, m) => { const q = BY_ID[id]; return q ? Math.max(0, +q.f(m) || 0) : 0; };
const rollDay = (d) => dayIds(d).map(fresh);
const rollWeek = (w) => weekIds(w).map(fresh);

/** Виконане й незабране з минулого набору: монети клубу одразу, щоб нагорода не згоріла. */
function bank(list, out) {
  for (const e of list) { const q = BY_ID[e.id]; if (q && !e.got && e.p >= q.n) { e.got = true; OP.coins += q.c; if (q.d) OP.iron = (OP.iron | 0) + q.d; out.push({ t: q.t, c: q.c, d: q.d | 0 }); } }
}

/**
 * Поточний набір: новий день чи тиждень — новий набір. Повертає зараховані автоматично нагороди минулого набору
 * (для підказки); OP.q після виклику завжди чинний.
 */
export function syncQuests(t = Date.now()) {
  const k = kyiv(t), d = dayKey(k), w = weekKey(k), out = [];
  let q = OP.q, ch = false;
  if (!q || typeof q !== 'object') { q = OP.q = { d: '', day: [], w: 0, week: [] }; ch = true; }
  // лише вперед: годинник, переведений назад, не дає пройти вже зіграний день удруге
  if (q.d < d) { bank(q.day, out); q.d = d; q.day = rollDay(d); ch = true; }
  if (q.w < w) { bank(q.week, out); q.w = w; q.week = rollWeek(w); ch = true; }
  if (ch) saveOP();
  return out;
}

/** Квести для екрана: опис, прогрес, стан. Невідомі (прибрані з гри) пропускаємо. */
export function questList() {
  syncQuests();
  const v = (kind) => (e, i) => { const q = BY_ID[e.id]; return q && { kind, i, id: e.id, t: q.t, n: q.n, c: q.c, d: q.d | 0, p: Math.min(e.p, q.n), got: e.got, done: e.p >= q.n }; };
  return { day: OP.q.day.map(v('day')).filter(Boolean), week: OP.q.week.map(v('week')).filter(Boolean) };
}
/** Скільки нагород чекає кнопки «Забрати». */
export function questsReady() {
  const q = OP.q; if (!q) return 0;
  let n = 0;
  for (const e of [...q.day, ...q.week]) { const d = BY_ID[e.id]; if (d && !e.got && e.p >= d.n) n++; }
  return n;
}
/** Забрати нагороду: монети або 0, якщо квест ще не виконано чи вже забрано. Долари (d) додаються разом із монетами. */
export function claimQuest(kind, i) {
  syncQuests();
  const e = (kind === 'week' ? OP.q.week : OP.q.day)[i], q = e && BY_ID[e.id];
  if (!q || e.got || e.p < q.n) return 0;
  e.got = true; OP.coins += q.c; if (q.d) OP.iron = (OP.iron | 0) + q.d; saveOP(); return q.c;
}

/**
 * Підсумок матчу для квестів. r — результат (r.me, r.opp, r.scorers з погляду цього гравця), myR і oppR — рейтинги до матчу.
 * Голи захисників і півзахисників рахуємо за прізвищем, як applyResult: автогол суперника героєві не зараховується.
 */
export function matchFacts(r, myR, oppR) { return factsOf(r, OP.heroes, myR, oppR); }
/** Те саме для довільного складу heroes (сервер рахує за клубом із бази). */
export function factsOf(r, heroes, myR, oppR) {
  const sc = Array.isArray(r.scorers) ? r.scorers : [], back = new Set();
  for (const e of heroes) if (e.line === 'D' || e.line === 'M') back.add(String(e.name).split(' ').slice(-1)[0]);
  let backGoals = 0;
  for (const s of sc) if (s.mine && !s.og && back.has(s.name)) backGoals++;
  return { gf: r.me | 0, ga: r.opp | 0, myR, oppR, backGoals, behind: !!(sc[0] && !sc[0].mine) };
}
/** Дограний матч просуває квести. Повертає щойно виконані (для екрана результату). */
export function questMatch(m) {
  syncQuests();
  const out = [];
  for (const e of [...OP.q.day, ...OP.q.week]) {
    const q = BY_ID[e.id]; if (!q || e.got || e.p >= q.n) continue;
    const add = Math.max(0, +q.f(m) || 0); if (!add) continue;
    e.p = Math.min(q.n, e.p + add);
    if (e.p >= q.n) out.push({ t: q.t, c: q.c });
  }
  saveOP();
  return out;
}
