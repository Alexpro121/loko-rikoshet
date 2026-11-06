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

/** Налаштування PeerJS для власного сервера кімнат або null. force — навіть якщо сервер щойно падав (пошук кімнати там). */
export function peerServer(force = false) {
  if (!SERVER_URL || (!force && !serverOn())) return null;
  const u = new URL(SERVER_URL);
  return { host: u.hostname, port: u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80), path: '/p/', secure: u.protocol === 'https:' };
}

async function api(path, init = {}, wait = API_WAIT) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), wait);
  let r;
  try {
    r = await fetch(SERVER_URL + path, { ...init, signal: ctl.signal });
  } catch (e) {
    // довге очікування черги, обірване нами ж, — не падіння сервера: інакше хвилину кімнати й маяки відкривались би на
    // публічному PeerJS, а суперники лишались на своєму, і пошук не зводив би їх (BUGS NET-6)
    if (!(e && e.name === 'AbortError' && wait > API_WAIT)) markDown();
    throw e;
  } finally { clearTimeout(t); }
  if (r.status >= 500) markDown();
  if (!r.ok) { let code = ''; try { code = (await r.json()).error || ''; } catch (_) { /* не JSON */ } throw Object.assign(new Error('api'), { status: r.status, code }); }
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
async function authed(path, body, wait) {
  const init = (s) => (body
    ? { method: 'POST', headers: { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { headers: { Authorization: 'Bearer ' + s.token } });
  const s = await login();
  if (!s) return null;
  try { return await api(path, init(s), wait); } catch (e) {
    if (e.status !== 401) throw e;
    session = null; store(null);
    const again = await login();
    return again ? api(path, init(again), wait) : null;
  }
}

// ------------------------------------------------------------------ онлайн-хаб на сервері (контракт API 2)
// Сервер вмикає частини по одній і перелічує їх у GET /health → features: 'club', 'match', 'quests', 'queue', 'top', 'cups'.
// Частини, якої немає в списку, гра не чіпає й лишається на локальній логіці (клуб і квести на пристрої, маяки PeerJS).
// Поза Telegram акаунта немає: список порожній.
const NONE = new Set();
const FEATS_MS = 600e3;                   // список частин перевіряємо раз на 10 хв
const POLL_WAIT = 14000;                  // довге очікування черги: сервер тримає запит до 12 с
let feats = null, featsAt = 0;

/** Частини сервера, доступні цьому гравцеві (чекає відповіді /health, якщо список старий). */
export async function features() {
  if (!SERVER_URL || !tgInitData() || !serverOn()) return NONE;
  if (feats && Date.now() - featsAt < FEATS_MS) return feats;
  try {
    const r = await api('/health');
    feats = new Set(r && r.api >= 2 && Array.isArray(r.features) ? r.features.map(String) : []);
    featsAt = Date.now();
  } catch (_) { feats = NONE; featsAt = Date.now() - FEATS_MS + DOWN_MS; }   // збій /health: без частин хвилину, а не 10
  return feats;
}
/** Те саме без очікування: за останньою відповіддю /health (для розмітки й синхронних рішень). */
export const has = (f) => !!feats && feats.has(f) && serverOn() && !!tgInitData();

/**
 * Виклик частини f. null — частини немає чи сервер недоступний (гра лишається локальною);
 * { error } — сервер відмовив (наприклад 'no_coins'), тоді гра бере стан із сервера.
 */
async function call(f, path, body, wait) {
  if (!(await features()).has(f)) return null;
  try { return (await authed(path, body, wait)) || null; } catch (e) { return e && e.status && e.status < 500 ? { error: e.code || String(e.status) } : null; }
}
/** Клуб: перший виклик переносить клуб із пристрою (base), далі лише вигляд і тактику. Відповідь — клуб, як у /me. */
export const saveClub = (data) => call('club', '/club/save', data);
export const meOnServer = () => call('club', '/me');
/** Тренування: hero — номер у спільному списку (основа, далі лава), id — щоб сервер не сплутав героя, якщо склад ще не збережено. */
export const trainOnServer = (hero, stat, id) => call('club', '/club/train', { hero, stat, id });
export const scoutOnServer = (hero) => call('club', '/club/scout', { hero });
/** Пак героїв магазину (PACKS у profile.js): { coins, hero } або { error } ('no_coins', 'bad_pack', 'not_found' — сервер ще не вміє). */
export const packOnServer = (hero, pack) => call('club', '/club/pack', { hero, pack });
export const resetOnServer = () => call('club', '/club/reset', {});
/** Магазин і лава (частина 'shop'): пак кладе новачка на лаву — { coins, hero, bench, club }; продаж лише з лави, за id — { coins, gain, club }. */
export const buyOnServer = (hero, pack) => call('shop', '/club/buy', { hero, pack });
export const sellOnServer = (id) => call('shop', '/club/sell', { id });
/**
 * Матч: господар стартує й отримує { matchId, ticket }; квиток іде гостю напряму по P2P ('mt'), і гість стартує з ним.
 * Код кімнати знає кожен, кому його надіслали, тож за кодом сервер не парує: інакше чужий міг би стати «гостем» на сервері.
 */
export const matchStart = (body) => call('match', '/match/start', body);
export const matchReport = (body) => call('match', '/match/result', body);
export const matchState = (id) => call('match', '/match/' + encodeURIComponent(id));
/** Черга швидкого матчу: довге очікування до 12 с; повторювати, поки state === 'wait'. */
export const queueJoin = (code, avoid) => call('queue', '/queue', { code, avoid }, POLL_WAIT);
export const queueLeave = () => call('queue', '/queue/leave', {});
export const queueStats = () => call('queue', '/queue/stats');
/** Квести на сервері: набір, прогрес, «Забрати». */
export const serverQuests = () => call('quests', '/quests');
export const claimOnServer = (period, id) => call('quests', '/quests/claim', { period, id });
/** Таблиця рейтингу. */
export const topList = () => call('top', '/top?limit=50');

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
