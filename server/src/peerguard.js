// Захист сервера кімнат PeerJS від перебору кодів. Коди кімнат короткі (5 знаків), тож чужу кімнату друзів можна шукати
// перебором: або новими з'єднаннями, або пропозиціями з'єднання (OFFER) через одне. Обмежуємо обидва за адресою гравця.
// Caddy стоїть перед PeerJS і ставить X-Forwarded-For; сам PeerJS слухає лише 127.0.0.1, тож заголовку можна вірити.
import { WebSocketServer } from 'ws';

export const WS_PER_MIN = 40;             // нових WebSocket з адреси за хвилину: маяки швидкого матчу відкривають до 8 за коло
export const OFFERS_PER_MIN = 120;        // спроб з'єднатися з кимось з адреси за хвилину: перебір 28 млн кодів стає марним
const KEYS_MAX = 50000;

/** Лічильник подій за хвилину на ключ: true — ліміт перевищено. */
export function createLimiter(max, now = Date.now) {
  const hits = new Map();
  return (key) => {
    const minute = Math.floor(now() / 60000), h = hits.get(key);
    if (!h || h[0] !== minute) { if (hits.size > KEYS_MAX) hits.clear(); hits.set(key, [minute, 1]); return false; }
    return ++h[1] > max;
  };
}

export const ipOf = (req, behindProxy = true) =>
  (behindProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';

/** Пропозиція з'єднання PeerJS: {"type":"OFFER",...}. Решту (серцебиття, ICE) не чіпаємо. */
const isOffer = (data) => {
  const s = typeof data === 'string' ? data : Buffer.isBuffer(data) ? data.toString('utf8', 0, 64) : '';
  return /"type"\s*:\s*"OFFER"/.test(s);
};

/**
 * Фабрика для PeerServer({ createWebSocketServer }): відмова 429 на зайві нові з'єднання, а зайві OFFER
 * мовчки відкидаються (з'єднання в того, хто перебирає, просто не встановлюється).
 */
export function guardedWss({ behindProxy = true, now = Date.now, wsMax = WS_PER_MIN, offerMax = OFFERS_PER_MIN } = {}) {
  const wsLimit = createLimiter(wsMax, now), offerLimit = createLimiter(offerMax, now);
  return (options) => {
    const wss = new WebSocketServer({
      ...options,
      verifyClient: ({ req }, cb) => (wsLimit(ipOf(req, behindProxy)) ? cb(false, 429, 'slow down') : cb(true)),
    });
    // наш слухач стоїть першим (PeerJS підписується після створення), тож обгортаємо обробники повідомлень сокета
    wss.on('connection', (socket, req) => {
      const ip = ipOf(req, behindProxy), on = socket.on.bind(socket);
      socket.on = (ev, fn) => (ev !== 'message' ? on(ev, fn) : on(ev, (data, ...rest) => {
        if (isOffer(data) && offerLimit(ip)) return;
        fn(data, ...rest);
      }));
    });
    return wss;
  };
}
