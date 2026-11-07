// HTTP API гри: вхід через Telegram, профіль онлайн-клубу, паролі до ретранслятора.
// Гроші й рейтинг змінює лише сервер: клієнт просить дію, сервер перевіряє й записує.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { verifyInitData } from './telegram.js';
import { turnCredentials } from './turn.js';
import { tx } from './db.js';
import { clubRoutes } from './hub/club.js';
import { matchRoutes } from './hub/match.js';
import { questRoutes } from './hub/quests.js';
import { queueRoutes } from './hub/queue.js';
import { topRoutes } from './hub/top.js';
import { marketRoutes } from './hub/market.js';
import { ironRoutes } from './hub/iron.js';

// API 2 — онлайн-хаб (клуб на сервері, підтверджений матч, квести, черга, таблиця). Клієнт вмикає кожну частину
// за її назвою в features; без правил гри (rules) сервер лишається на API 1.
export const API_VERSION = 2;
const BODY_LIMIT = 64 * 1024;
const SESSION_SEC = 30 * 24 * 3600;
const AUTH_PER_MIN = 20;                 // спроб входу з однієї адреси за хвилину
const CALLS_PER_MIN = 120;               // усіх запитів з однієї адреси за хвилину: гра робить кілька за матч
const SESSIONS_KEEP = 5;                 // сесій на гравця (телефон, комп'ютер...): старіші видаляються

const hashToken = (t) => createHash('sha256').update(t).digest('hex');

class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_LIMIT) { reject(new HttpError(413, 'too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'bad_json')); }
    });
    req.on('error', reject);
  });
}

export function createApp({ db, config, newClub, rules = null, bot = null, now = () => Date.now(), queueWaitMs = 12_000 }) {
  const sec = () => Math.floor(now() / 1000);
  const hits = new Map();                // 'кошик:ip' -> [хвилина, кількість]

  const q = {
    upsertPlayer: db.prepare(`INSERT INTO players (id, name, username, created_at, last_seen) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, username = excluded.username, last_seen = excluded.last_seen`),
    player: db.prepare('SELECT id, name, username, banned FROM players WHERE id = ?'),
    addSession: db.prepare('INSERT INTO sessions (token_hash, player_id, expires_at) VALUES (?, ?, ?)'),
    session: db.prepare('SELECT player_id, expires_at FROM sessions WHERE token_hash = ?'),
    trimSessions: db.prepare(`DELETE FROM sessions WHERE player_id = ? AND token_hash NOT IN
      (SELECT token_hash FROM sessions WHERE player_id = ? ORDER BY rowid DESC LIMIT ${SESSIONS_KEEP})`),
    ping: db.prepare('SELECT 1 AS ok'),
    club: db.prepare('SELECT data, coins, rating, lvl FROM clubs WHERE player_id = ?'),
    addClub: db.prepare('INSERT INTO clubs (player_id, data, coins, rating, lvl, updated_at) VALUES (?, ?, ?, ?, ?, ?)'),
    ledger: db.prepare('INSERT INTO coin_ledger (player_id, delta, reason, at) VALUES (?, ?, ?, ?)'),
    flag: db.prepare('INSERT INTO flags (player_id, kind, at, json) VALUES (?, ?, ?, ?)'),
    iron: db.prepare('INSERT INTO iron_ledger (player_id, delta, reason, at) VALUES (?, ?, ?, ?)'),
  };

  function rateLimited(ip, bucket, max) {
    const minute = Math.floor(now() / 60000), key = bucket + ':' + ip;
    const h = hits.get(key);
    if (!h || h[0] !== minute) { if (hits.size > 20000) hits.clear(); hits.set(key, [minute, 1]); return false; }
    return ++h[1] > max;
  }

  function auth(req) {
    const m = /^Bearer ([A-Za-z0-9_-]{20,})$/.exec(req.headers.authorization || '');
    if (!m) throw new HttpError(401, 'no_session');
    const s = q.session.get(hashToken(m[1]));
    if (!s || s.expires_at < sec()) throw new HttpError(401, 'no_session');
    const p = q.player.get(s.player_id);
    if (!p || p.banned) throw new HttpError(403, 'banned');
    return p;
  }

  const clubOut = (row) => (row ? { ...JSON.parse(row.data), coins: row.coins, rating: row.rating, lvl: row.lvl } : null);
  /** Кожна зміна монет — рядок у журналі. */
  const ledger = (id, delta, reason) => { if (delta) q.ledger.run(id, delta, reason, sec()); };
  /** Кожна зміна Iron Dollar — рядок в iron_ledger. */
  const ironLedger = (id, delta, reason) => { if (delta) q.iron.run(id, delta, reason, sec()); };

  // онлайн-хаб: частини додають свої маршрути; features — те, що клієнт може ввімкнути
  /** Журнал підозрілого для власника: import (обрізане перенесення), disputed, pair (фарм пари), fast (надто швидкий звіт). */
  const flag = (id, kind, data) => q.flag.run(id, kind, sec(), JSON.stringify(data || {}));
  // Telegram ID інших гравців назовні не віддаємо: замість нього стабільний непрозорий id (HMAC секрету сервера)
  const pidKey = config.idSecret || config.botToken;
  const pid = (id) => createHmac('sha256', pidKey).update('pid:' + id).digest('base64url').slice(0, 12);
  const ctx = { db, rules, auth, readJson, HttpError, sec, now, tx, ledger, ironLedger, flag, pid, newClub, bot, questsAfter: null, ironAdd: null };
  // ТИМЧАСОВО: тестова кнопка магазину (POST /dev/grant). Суми задає сервер, тіло лише вибирає, що дати. Доступ усім, хто
  // увійшов через Telegram, або лише DEV_IDS (config.devIds); config.devGrant === false (DEV_GRANT=0) вимикає все.
  const DEV_GRANT = { coins: 10000, iron: 100 }, DEV_GAP_MS = 1000;
  const devOn = config.devGrant !== false;
  const devIds = Array.isArray(config.devIds) ? new Set(config.devIds) : null;
  const isDev = (id) => devOn && (!devIds || devIds.has(Number(id)));
  const devLast = new Map();                                       // гравець → мить останнього нарахування (не частіше 1/с)
  const hub = rules ? (() => {
    const club = clubRoutes(ctx);
    /** Додати долари клубу (квести, рівні): у транзакції того, хто кличе. */
    ctx.ironAdd = (id, n, reason) => { const s = club.load(id); if (!s || !n) return false; s.iron = (s.iron | 0) + n; club.store(id, s); ironLedger(id, n, reason); return true; };
    const match = matchRoutes(ctx, club);
    const quests = rules.QUESTS ? questRoutes(ctx, club) : null;     // квести вимагають match: прогрес рахує підтвердження
    const queue = queueRoutes(ctx, club, match, queueWaitMs);
    const top = topRoutes(ctx);
    const market = rules.MARKET ? marketRoutes(ctx, club) : null;
    const iron = rules.IRONOK ? ironRoutes(ctx, club) : null;
    const stars = !!(iron && bot && bot.invoice && rules.STARS && config.stars !== false);
    if (stars && bot.setPayments) bot.setPayments({ check: iron.check, credit: iron.credit });   // бот передає платежі сюди
    const features = ['club', 'match', ...(quests ? ['quests'] : []), 'queue', 'top', ...(rules.SHOP ? ['shop'] : []), ...(market ? ['market'] : []), ...(iron ? ['iron'] : []), ...(stars ? ['stars'] : [])];
    return { club, match, quests, queue, top, market, iron, stars, features };
  })() : null;

  const routes = {
    'GET /health': () => (hub ? { ok: q.ping.get().ok === 1, api: API_VERSION, features: hub.features } : { ok: q.ping.get().ok === 1, api: 1 }),

    'POST /auth/telegram': async (req, ip) => {
      if (rateLimited(ip, 'auth', AUTH_PER_MIN)) throw new HttpError(429, 'slow_down');
      const body = await readJson(req);
      const user = verifyInitData(body.initData, config.botToken, sec());
      if (!user) throw new HttpError(401, 'bad_init_data');
      const t = sec();
      const token = randomBytes(32).toString('base64url');
      tx(db, () => {
        q.upsertPlayer.run(user.id, user.name, user.username, t, t);
        q.addSession.run(hashToken(token), user.id, t + SESSION_SEC);
        q.trimSessions.run(user.id, user.id);   // прострочені чистить нічне обслуговування
      });
      const p = q.player.get(user.id);
      if (p.banned) throw new HttpError(403, 'banned');
      return { token, expiresAt: t + SESSION_SEC, player: { id: p.id, name: p.name } };
    },

    'GET /me': (req) => {
      const p = auth(req);
      const club = clubOut(q.club.get(p.id));
      if (!hub) return { player: { id: p.id, name: p.name }, club };
      const quests = hub.quests ? hub.quests.list(p.id) : undefined;   // зараховує незабране з минулих періодів, тож клуб читаємо після
      const ironGot = hub.iron ? tx(db, () => hub.iron.takeGot(p.id)) : undefined;   // нараховані долари з минулого разу (рейтинг, зірки): показ їх знімає
      return { player: { id: p.id, name: p.name }, club: hub.club.out(hub.club.load(p.id)), rank: hub.top.rank(p.id), live: hub.match.live(p.id), quests, ironGot, ...(isDev(p.id) ? { dev: true } : {}) };
    },

    // Клуб створює сервер за правилами гри; повторний виклик повертає вже наявний
    'POST /club': (req) => {
      const p = auth(req);
      return tx(db, () => {
        const have = q.club.get(p.id);
        if (have) return { club: clubOut(have), created: false };
        const c = newClub();
        const { coins, rating, lvl, ...data } = c;
        q.addClub.run(p.id, JSON.stringify(data), coins, rating, lvl, sec());
        q.ledger.run(p.id, coins, 'start', sec());
        return { club: clubOut(q.club.get(p.id)), created: true };
      });
    },

    // Картка виклику в кімнату: бот готує повідомлення, гра відкриває його у вікні «Поділитися» (shareMessage)
    'POST /share/room': async (req) => {
      const p = auth(req);
      const body = await readJson(req);
      const code = String(body.code || '').toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) throw new HttpError(400, 'bad_code');
      if (!bot) throw new HttpError(404, 'no_bot');
      const id = await bot.prepareRoom({ id: p.id, first_name: p.name }, code);
      if (!id) throw new HttpError(502, 'telegram');
      return { id };
    },

    'GET /turn': (req) => {
      const p = auth(req);
      if (!config.turnSecret || !config.turnUrls.length) return { iceServers: [] };
      const c = turnCredentials(config.turnSecret, p.id, config.turnUrls, sec());
      return { iceServers: [{ urls: c.urls, username: c.username, credential: c.credential }], ttl: c.ttl };
    },
  };

  if (hub) Object.assign(routes, hub.club.routes, hub.match.routes, hub.quests ? hub.quests.routes : {}, hub.queue.routes, hub.top.routes, hub.market ? hub.market.routes : {}, hub.iron ? hub.iron.routes : {}, hub.stars ? hub.iron.starsRoutes : {});
  if (hub && devOn) {
    // ТИМЧАСОВО: { coins: true, iron: true } → +10 000 монет і +100 Iron Dollar; рейтинг і топ не міняються
    routes['POST /dev/grant'] = async (req) => {
      const p = auth(req);
      if (!isDev(p.id)) throw new HttpError(403, 'forbidden');
      const t = now(), last = devLast.get(p.id);
      if (last !== undefined && t - last < DEV_GAP_MS) throw new HttpError(429, 'too_fast');   // скрипт не роздує журнал
      if (devLast.size > 5000) devLast.clear();
      devLast.set(p.id, t);
      const b = await readJson(req);
      const coins = b.coins ? DEV_GRANT.coins : 0, iron = b.iron && hub.iron ? DEV_GRANT.iron : 0;
      if (!coins && !iron) throw new HttpError(400, 'bad_grant');
      return tx(db, () => {
        const s = hub.club.load(p.id);
        if (!s) throw new HttpError(409, 'no_club');
        s.coins += coins; s.iron = (s.iron | 0) + iron;
        hub.club.store(p.id, s);
        ledger(p.id, coins, 'dev'); ironLedger(p.id, iron, 'dev');
        return { coins, iron, club: hub.club.out(hub.club.load(p.id)) };
      });
    };
  }
  const patterns = hub ? [...hub.match.patterns] : [];

  async function handle(req, res) {
    const origin = req.headers.origin;
    const allowed = origin && config.origins.includes(origin);
    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') { res.writeHead(allowed ? 204 : 403); res.end(); return; }
    if (origin && !allowed) return send(403, { error: 'origin' });

    const url = new URL(req.url, 'http://x'), path = url.pathname;
    // вебхук бота: Telegram шле з кількох адрес багато запитів, тож без загального ліміту, зате з секретом
    if (path === '/tg' && req.method === 'POST') {
      if (!bot || req.headers['x-telegram-bot-api-secret-token'] !== bot.secret) return send(403, { error: 'secret' });
      let update;
      try { update = await readJson(req); } catch (e) { return send(e.status || 400, { error: e.code || 'bad_json' }); }
      send(200, {});
      bot.handle(update);
      return;
    }
    let route = routes[`${req.method} ${path}`], params = [];
    if (!route) {
      for (const [method, re, fn] of patterns) {
        const m = method === req.method && re.exec(path);
        if (m) { route = fn; params = m.slice(1); break; }
      }
    }
    if (!route) return send(404, { error: 'not_found' });
    // за Caddy справжня адреса гравця в X-Forwarded-For; без проксі беремо адресу з'єднання
    const ip = (config.behindProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';
    if (path !== '/health' && rateLimited(ip, 'all', CALLS_PER_MIN)) return send(429, { error: 'slow_down' });
    try {
      send(200, await route(req, ip, url, params));
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { error: e.code });
      console.error(e);
      send(500, { error: 'internal' });
    }
  }
  /** Фонова перевірка хабу (server.js кличе раз на 30 с): матчі без пари й без звітів, черга. */
  handle.sweep = () => {
    if (!hub) return;
    hub.match.sweep(); hub.queue.sweep();
    if (hub.iron) hub.iron.weekly();
    if (hub.stars) hub.iron.retryRefunds().catch(() => {});   // застряглі повернення зірок
  };
  return handle;
}
