// Збереження кар'єри: об'єкт S у localStorage, commit/flush, підписники. Нове поле додавай у defaults().
import { SETTINGS_DEFAULT, FIXTURES, ACADEMY, FORMATIONS, STAT_KEYS, GK_KEYS, LINE_OF } from '../config.js';
import { appHidden } from '../core/telegram.js';

const KEY = 'loko-rikoshet-save-v1';

const defaults = () => ({
  v: 1,
  coins: 150,
  tickets: 1,
  trophies: 0,
  season: 0,
  fixture: 0,
  up: { kick: 0, stadium: 0 },
  strikers: ['s0'], striker: 's0',
  keepers: ['k0'], keeper: 'k0',
  academy: { progress: 0, ready: false, players: [], serial: 0 },
  stats: { matches: 0, wins: 0, goals: 0, bestCombo: 0 },
  settings: { ...SETTINGS_DEFAULT },
  cashAt: Date.now(),
  tutorial: false,
  squad: null,
  bench: null,
  tactic: '433',                                  // схема в кар'єрі (S.form — це форма команди: останні результати)
  kitId: 'home',
  form: [],
  rivals: {},                                     // історія зустрічей із кожним клубом (rivals.js)
  scout: { n: 0, corner: 0, flank: 0, dist: 20, aim: 1, shots: 0 },   // що суперники вивчили в нашій грі
});

function merge(base, src) {
  if (!src || typeof src !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (!(k in src)) continue;
    const b = base[k], s = src[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) base[k] = Object.keys(b).length ? merge(b, s) : (s && typeof s === 'object' && !Array.isArray(s) ? s : b);   // порожній словник (rivals) — береться як є
    else if (typeof b === typeof s && (b === null || Array.isArray(b) === Array.isArray(s))) base[k] = s;
  }
  return base;
}

/** Значення поза межами (ручна правка, збереження іншої версії) підтягуємо до найближчого допустимого; справні лишаються як є. */
const int = (v, lo, hi = Infinity) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : lo);
const num = (v, d, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v, d) => (typeof v === 'string' && v ? v : d);
const BIG = 1e9;                                   // стеля лічильників: справжня гра до неї не дійде, а Infinity чи 1e308 далі ламали б арифметику
/** Межі повзунків Налаштувань: ті самі, що в data-range. joyX і joyY: -1 — на своєму місці. */
const RANGE = { joySize: [80, 200], joyAlpha: [20, 100], joyX: [-1, 1], joyY: [-1, 1], camDist: [70, 140], camTiltOff: [-15, 20], camFollow: [50, 220], mapX: [0, 1], mapY: [0, 1], mapSize: [60, 170], mapAlpha: [30, 100], mapTrailA: [15, 100] };

/** Один запис гравця: виправляє те, що можна; false, якщо запис непридатний. Роль і лінію підказує слот схеми (для запасного його pos). */
function cleanPlayer(e, slot) {
  if (!isObj(e) || !isObj(e.stats) || (typeof e.id !== 'string' && typeof e.id !== 'number')) return false;
  const pos = slot || (LINE_OF[e.pos] ? { name: e.pos, line: LINE_OF[e.pos] } : null);
  if (!LINE_OF[e.role] || e.line !== LINE_OF[e.role] && !['D', 'M', 'W', 'F'].includes(e.line)) { if (!pos) return false; e.role = pos.name; e.line = pos.line; }
  for (const k of e.line === 'G' ? GK_KEYS : STAT_KEYS) e.stats[k] = num(e.stats[k], 40, 0, 99);
  e.name = text(e.name, 'Гравець'); e.num = int(e.num, 1, 99);
  e.xp = num(e.xp, 0, 0, 1e6); e.lvl = int(e.lvl, 1, 9999);                        // gainXp рахує рівні циклом: величезний досвід завис би вкладку
  e.apps = int(e.apps, 0, BIG); e.goals = int(e.goals, 0, BIG);
  e.skin = text(e.skin, ACADEMY.skins[0]); e.hair = text(e.hair, ACADEMY.hairs[0]); e.hairCol = text(e.hairCol, ACADEMY.hairCols[0]); e.beard = int(e.beard, 0, 3);
  return true;
}
/** Склад: 11 справних, у слоті 0 воротар, у полі ніхто не повторюється; інакше false, і ensureSquad збере склад заново, а кар'єра лишається. */
function cleanSquad(s) {
  if (!Array.isArray(s.squad)) { s.squad = null; return true; }
  const roles = FORMATIONS[s.tactic];
  const ok = s.squad.length === 11 && s.squad.every((e, i) => cleanPlayer(e, i ? roles[i - 1] : { name: 'GK', line: 'G' }))
    && s.squad[0].line === 'G' && s.squad.every((e, i) => !i || e.line !== 'G') && new Set(s.squad.map((e) => e.id)).size === 11;
  if (!ok) { s.squad = null; s.bench = null; return false; }
  if (Array.isArray(s.bench)) {
    const seen = new Set(s.squad.map((e) => e.id));
    s.bench = s.bench.filter((e) => { if (!cleanPlayer(e, null) || seen.has(e.id)) return false; seen.add(e.id); return true; });
  } else s.bench = null;
  return true;
}
let squadLost = false;
const RENAMED = { 'НИВА': 'ЛЕЛЕКИ', 'ПОДІЛЛЯ': 'ГОНЧАРІ', 'ВОЛИНЬ': 'ЖУРАВЛІ', 'МЕТАЛІСТ': 'БУРЕВІЙ', 'ЧОРНОМОРЕЦЬ': 'ПРИБІЙ', 'КАРПАТИ': 'СМЕРЕКА', 'ЗОРЯ': 'ТЕРИКОН', 'ДИНАМО': 'БАСТІОН', 'ШАХТАР': 'ГОРНИЛО', 'МІЛАН': 'ВАЛЬДОРА', 'МЮНХЕН': 'НОРДГАЙМ', 'МАДРИД': 'ТОРРЕМАР', 'МАНЧЕСТЕР': 'ГРЕЙВЕЛЛ' };
function normalize(s) {
  s.fixture = int(s.fixture, 0, FIXTURES.length - 1);
  s.season = int(s.season, 0, 1e6); s.up.stadium = int(s.up.stadium, 0, 500); s.up.kick = int(s.up.kick, 0, 60);   // рефанд в economy.js рахує рівні циклом
  s.tickets = int(s.tickets, 0, BIG); s.trophies = int(s.trophies, 0, BIG);
  s.academy.progress = int(s.academy.progress, 0, ACADEMY.need); s.academy.serial = int(s.academy.serial, 0, BIG);
  s.academy.players = s.academy.players.filter((p) => isObj(p) && Number.isFinite(p.bonus));   // без бонусу весь дохід став би NaN
  for (const p of s.academy.players) { p.bonus = num(p.bonus, 0, 0, 100); p.name = text(p.name, 'Випускник'); p.num = int(p.num, 1, 99); p.skin = text(p.skin, ACADEMY.skins[0]); p.hair = text(p.hair, ACADEMY.hairs[0]); p.hairCol = text(p.hairCol, ACADEMY.hairCols[0]); }
  s.coins = num(s.coins, 0, 0, 1e15);
  if (!Number.isFinite(s.cashAt)) s.cashAt = Date.now();
  for (const k of Object.keys(s.stats)) s.stats[k] = int(s.stats[k], 0, BIG);
  const sc = defaults().scout; for (const k of Object.keys(sc)) s.scout[k] = num(s.scout[k], sc[k], -BIG, BIG);
  for (const k of Object.keys(RENAMED)) if (s.rivals[k]) { s.rivals[RENAMED[k]] ??= s.rivals[k]; delete s.rivals[k]; }   // клуби перейменовано: пам'ять суперника лишається
  for (const k of Object.keys(s.rivals)) {
    const r = s.rivals[k];
    if (!isObj(r)) { delete s.rivals[k]; continue; }
    for (const f of ['met', 'w', 'd', 'l', 'gf', 'ga']) r[f] = int(r[f], 0, BIG);
  }
  for (const k of Object.keys(RANGE)) s.settings[k] = num(s.settings[k], SETTINGS_DEFAULT[k], RANGE[k][0], RANGE[k][1]);
  if (!FORMATIONS[s.tactic]) s.tactic = '433';
  s.form = s.form.filter((r) => r === 'W' || r === 'D' || r === 'L');
  if (!cleanSquad(s)) squadLost = true;
  return s;
}

function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    if (raw) {
      const src = JSON.parse(raw), st = src && src.settings;
      const s = merge(defaults(), src);
      // старі види камери: «зверху» стала тактичною, «ближче» — динамічною, «трансляція» — трансляцією
      if (st && st.camView && !('camMode' in st)) s.settings.camMode = { top: 'tactic', close: 'dynamic', broadcast: 'broadcast' }[st.camView] || 'classic';
      normalize(s);
      if (squadLost) try { localStorage.setItem(KEY + '-broken', raw); } catch (_) { /* ignore */ }   // склад збирається заново: лишаємо копію, як і при битому записі
      return s;
    }
  } catch (e) {                                    // приватний режим або пошкоджений запис
    if (raw) try { localStorage.setItem(KEY + '-broken', raw); } catch (_) { /* ignore */ }   // наступне збереження затре запис: лишаємо копію
  }
  return defaults();
}

export const S = load();

const listeners = new Set();
let timer = 0, saveFailed = false, onFail = null, held = false;

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Сховище не приймає запис (квота, приватний режим): гравець має про це знати; один раз, доки запис не запрацює знову. */
export function onSaveError(fn) { onFail = fn; if (saveFailed) fn(); }

/** Сторінка от-от перезавантажиться з новими даними в localStorage: старий S уже не можна записувати поверх них. */
export function holdSave() { held = true; clearTimeout(timer); timer = 0; }

export function flush() {
  clearTimeout(timer); timer = 0;
  if (held) return;
  try { localStorage.setItem(KEY, JSON.stringify(S)); saveFailed = false; }
  catch (e) { if (!saveFailed) { saveFailed = true; if (onFail) onFail(); } }
}

/** Повідомити підписників і зберегти (з відкладенням, щоб не писати на кожну монету). */
export function commit() {
  if (!timer) timer = setTimeout(flush, 350);     // спершу таймер: помилка в підписнику не має зупинити збереження
  for (const fn of listeners) fn(S);
}

export function resetAll() {
  const keepSettings = S.settings;
  Object.assign(S, defaults(), { settings: keepSettings });
  flush();
  for (const fn of listeners) fn(S);
}

addEventListener('pagehide', flush);
addEventListener('visibilitychange', () => { if (appHidden()) flush(); });
