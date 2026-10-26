import { SETTINGS_DEFAULT } from '../config.js';

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
});

function merge(base, src) {
  if (!src || typeof src !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (!(k in src)) continue;
    const b = base[k], s = src[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) base[k] = merge(b, s);
    else if (typeof b === typeof s) base[k] = s;
  }
  return base;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return merge(defaults(), JSON.parse(raw));
  } catch (e) { /* приватний режим або пошкоджений запис */ }
  return defaults();
}

export const S = load();

const listeners = new Set();
let timer = 0;

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function flush() {
  clearTimeout(timer); timer = 0;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* квота */ }
}

/** Повідомити підписників і зберегти (з відкладенням, щоб не писати на кожну монету). */
export function commit() {
  for (const fn of listeners) fn(S);
  if (!timer) timer = setTimeout(flush, 350);
}

export function resetAll() {
  const keepSettings = S.settings;
  Object.assign(S, defaults(), { settings: keepSettings });
  flush();
  for (const fn of listeners) fn(S);
}

addEventListener('pagehide', flush);
addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
