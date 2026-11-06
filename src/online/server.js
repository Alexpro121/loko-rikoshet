// Сервер гри (папка server/): вхід через Telegram, власний PeerJS і паролі до ретранслятора.
// Поки SERVER_URL порожній, онлайн іде через публічний PeerJS, як і до появи сервера.
import { tgInitData } from '../core/telegram.js';

/** Адреса сервера гри, наприклад 'https://api.приклад.ua'. Порожня: сервер не використовується. */
export const SERVER_URL = '';
const API_WAIT = 6000;                    // повільний сервер не має тримати старт онлайну

let session = null;                       // { token, exp } у пам'яті вкладки: вхід дешевий, Telegram дає дані щоразу

export const serverOn = () => !!SERVER_URL;

/** Налаштування PeerJS для власного сервера кімнат або null. */
export function peerServer() {
  if (!SERVER_URL) return null;
  const u = new URL(SERVER_URL);
  return { host: u.hostname, port: u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80), path: '/p/', secure: u.protocol === 'https:' };
}

async function api(path, init = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), API_WAIT);
  try {
    const r = await fetch(SERVER_URL + path, { ...init, signal: ctl.signal });
    if (!r.ok) throw Object.assign(new Error('api'), { status: r.status });
    return await r.json();
  } finally { clearTimeout(t); }
}

/** Вхід через Telegram. Поза Telegram входу немає: повертає null. */
export async function login() {
  if (!SERVER_URL) return null;
  if (session && session.exp * 1000 > Date.now() + 60e3) return session;
  const initData = tgInitData();
  if (!initData) return null;
  const r = await api('/auth/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData }) });
  session = { token: r.token, exp: r.expiresAt };
  return session;
}

/** Ретранслятор сервера гри для гравця, що увійшов. Будь-який збій дає порожній список: лишаються STUN і публічний TURN. */
export async function iceServers() {
  try {
    const s = await login();
    if (!s) return [];
    const r = await api('/turn', { headers: { Authorization: 'Bearer ' + s.token } });
    return Array.isArray(r.iceServers) ? r.iceServers : [];
  } catch (_) { return []; }
}
