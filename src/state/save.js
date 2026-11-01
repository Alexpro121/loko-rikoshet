// Збереження кар'єри: об'єкт S у localStorage, commit/flush, підписники. Нове поле додавай у defaults().
import { SETTINGS_DEFAULT, FIXTURES, ACADEMY } from '../config.js';

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
  stats: { matches: 0, wins: 0, goals: 0, bestCombo: 0, rams: 0 },
  settings: { ...SETTINGS_DEFAULT },
  cashAt: Date.now(),
  tutorial: false,
  squad: null,
  bench: null,
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
function normalize(s) {
  s.fixture = int(s.fixture, 0, FIXTURES.length - 1);
  s.season = int(s.season, 0); s.up.stadium = int(s.up.stadium, 0);
  s.tickets = int(s.tickets, 0); s.trophies = int(s.trophies, 0);
  s.academy.progress = int(s.academy.progress, 0, ACADEMY.need);
  s.academy.players = s.academy.players.filter((p) => p && Number.isFinite(p.bonus));   // без бонусу весь дохід став би NaN
  if (!Number.isFinite(s.coins) || s.coins < 0) s.coins = 0;
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
      return normalize(s);
    }
  } catch (e) {                                    // приватний режим або пошкоджений запис
    if (raw) try { localStorage.setItem(KEY + '-broken', raw); } catch (_) { /* ignore */ }   // наступне збереження затре запис: лишаємо копію
  }
  return defaults();
}

export const S = load();

const listeners = new Set();
let timer = 0, saveFailed = false, onFail = null;

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Сховище не приймає запис (квота, приватний режим): гравець має про це знати; один раз, доки запис не запрацює знову. */
export function onSaveError(fn) { onFail = fn; if (saveFailed) fn(); }

export function flush() {
  clearTimeout(timer); timer = 0;
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
addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
