// Сервер гри (папка server/): вхід через Telegram, власний PeerJS і паролі до ретранслятора.
// Поки SERVER_URL порожній, онлайн іде через публічний PeerJS, як і до появи сервера.
// Сервер смикаємо якомога рідше: сесія живе 30 днів у localStorage, паролі ретранслятора 6 годин у пам'яті,
// а недоступний сервер хвилину не чіпаємо зовсім: гра одразу йде через публічний PeerJS.
import { tgInitData } from '../core/telegram.js';

/** Адреса сервера гри, наприклад 'https://api.приклад.ua'. Порожня: сервер не використовується. */
export const SERVER_URL = 'https://2-29-117-47.sslip.io';
const API_WAIT = 4000;                    // повільний сервер не має тримати старт онлайну
const DOWN_MS = 60_000;                   // скільки не чіпати сервер після збою
const SESSION_KEY = 'loko-server-session';

let session = null;                       // { uid, token, exp }
let turn = null;                          // { list, until }
let downUntil = 0;

/** Сервер задано і він не падав щойно. */
export const serverOn = () => !!SERVER_URL && Date.now() >= downUntil;
/** Збій сервера: хвилину гра обходиться без нього. */
export function markDown() { downUntil = Date.now() + DOWN_MS; }

/** Налаштування PeerJS для власного сервера кімнат або null. */
export function peerServer() {
  if (!serverOn()) return null;
  const u = new URL(SERVER_URL);
  return { host: u.hostname, port: u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80), path: '/p/', secure: u.protocol === 'https:' };
}

async function api(path, init = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), API_WAIT);
  let r;
  try {
    r = await fetch(SERVER_URL + path, { ...init, signal: ctl.signal });
  } catch (e) { markDown(); throw e; } finally { clearTimeout(t); }
  if (r.status >= 500) markDown();
  if (!r.ok) throw Object.assign(new Error('api'), { status: r.status });
  return r.json();
}

const uidOf = (initData) => { try { return Number(JSON.parse(new URLSearchParams(initData).get('user')).id) || 0; } catch (_) { return 0; } };
const fresh = (s, uid, marginMs) => !!s && s.uid === uid && s.exp * 1000 > Date.now() + marginMs;
function stored(uid) {
  try { const s = JSON.parse(localStorage.getItem(SESSION_KEY)); return fresh(s, uid, 24 * 3600e3) ? s : null; } catch (_) { return null; }
}
function store(s) {
  try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch (_) { /* ignore */ }
}

/** Вхід через Telegram. Поза Telegram входу немає: повертає null. Збережена сесія діє без запиту до сервера. */
export async function login() {
  if (!SERVER_URL) return null;
  const initData = tgInitData();
  if (!initData) return null;
  const uid = uidOf(initData);
  if (fresh(session, uid, 60e3)) return session;
  session = stored(uid);
  if (session) return session;
  const r = await api('/auth/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData }) });
  session = { uid, token: r.token, exp: r.expiresAt };
  store(session);
  return session;
}

/** Сесію відкликали на сервері (вийшли на іншому пристрої понад ліміт, бан): забути й увійти заново. */
async function authed(path, body) {
  const init = (s) => (body
    ? { method: 'POST', headers: { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { headers: { Authorization: 'Bearer ' + s.token } });
  const s = await login();
  if (!s) return null;
  try { return await api(path, init(s)); } catch (e) {
    if (e.status !== 401) throw e;
    session = null; store(null);
    const again = await login();
    return again ? api(path, init(again)) : null;
  }
}

/** Картка виклику в кімнату від бота гри (для Telegram.WebApp.shareMessage) або null: тоді звичайне запрошення. */
export async function roomShareId(code) {
  if (!serverOn()) return null;
  try { const r = await authed('/share/room', { code }); return (r && r.id) || null; } catch (_) { return null; }
}

/** Ретранслятор сервера гри для гравця, що увійшов. Будь-який збій дає порожній список: лишаються STUN і публічний TURN. */
export async function iceServers() {
  if (turn && turn.until > Date.now()) return turn.list;
  if (!serverOn()) return [];
  try {
    const r = await authed('/turn');
    const list = r && Array.isArray(r.iceServers) ? r.iceServers : [];
    turn = { list, until: Date.now() + Math.max(60, (Number(r && r.ttl) || 0) - 600) * 1000 };   // за 10 хв до кінця беремо новий
    return list;
  } catch (_) { return []; }
}
