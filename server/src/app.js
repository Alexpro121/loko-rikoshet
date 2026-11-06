// HTTP API гри: вхід через Telegram, профіль онлайн-клубу, паролі до ретранслятора.
// Гроші й рейтинг змінює лише сервер: клієнт просить дію, сервер перевіряє й записує.
import { createHash, randomBytes } from 'node:crypto';
import { verifyInitData } from './telegram.js';
import { turnCredentials } from './turn.js';
import { tx } from './db.js';

export const API_VERSION = 1;
const BODY_LIMIT = 64 * 1024;
const SESSION_SEC = 30 * 24 * 3600;
const AUTH_PER_MIN = 20;                 // спроб входу з однієї адреси за хвилину

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

export function createApp({ db, config, newClub, now = () => Date.now() }) {
  const sec = () => Math.floor(now() / 1000);
  const hits = new Map();                // ip -> [хвилина, кількість]

  const q = {
    upsertPlayer: db.prepare(`INSERT INTO players (id, name, username, created_at, last_seen) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, username = excluded.username, last_seen = excluded.last_seen`),
    player: db.prepare('SELECT id, name, username, banned FROM players WHERE id = ?'),
    addSession: db.prepare('INSERT INTO sessions (token_hash, player_id, expires_at) VALUES (?, ?, ?)'),
    session: db.prepare('SELECT player_id, expires_at FROM sessions WHERE token_hash = ?'),
    dropExpired: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
    club: db.prepare('SELECT data, coins, rating, lvl FROM clubs WHERE player_id = ?'),
    addClub: db.prepare('INSERT INTO clubs (player_id, data, coins, rating, lvl, updated_at) VALUES (?, ?, ?, ?, ?, ?)'),
    ledger: db.prepare('INSERT INTO coin_ledger (player_id, delta, reason, at) VALUES (?, ?, ?, ?)'),
  };

  function rateLimited(ip) {
    const minute = Math.floor(now() / 60000);
    const h = hits.get(ip);
    if (!h || h[0] !== minute) { hits.set(ip, [minute, 1]); if (hits.size > 10000) hits.clear(); return false; }
    return ++h[1] > AUTH_PER_MIN;
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

  const routes = {
    'GET /health': () => ({ ok: true, api: API_VERSION }),

    'POST /auth/telegram': async (req, ip) => {
      if (rateLimited(ip)) throw new HttpError(429, 'slow_down');
      const body = await readJson(req);
      const user = verifyInitData(body.initData, config.botToken, sec());
      if (!user) throw new HttpError(401, 'bad_init_data');
      const t = sec();
      const token = randomBytes(32).toString('base64url');
      tx(db, () => {
        q.upsertPlayer.run(user.id, user.name, user.username, t, t);
        q.addSession.run(hashToken(token), user.id, t + SESSION_SEC);
        q.dropExpired.run(t);
      });
      const p = q.player.get(user.id);
      if (p.banned) throw new HttpError(403, 'banned');
      return { token, expiresAt: t + SESSION_SEC, player: { id: p.id, name: p.name } };
    },

    'GET /me': (req) => {
      const p = auth(req);
      return { player: { id: p.id, name: p.name }, club: clubOut(q.club.get(p.id)) };
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

    'GET /turn': (req) => {
      const p = auth(req);
      if (!config.turnSecret || !config.turnUrls.length) return { iceServers: [] };
      const c = turnCredentials(config.turnSecret, p.id, config.turnUrls, sec());
      return { iceServers: [{ urls: c.urls, username: c.username, credential: c.credential }], ttl: c.ttl };
    },
  };

  return async function handle(req, res) {
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

    const path = new URL(req.url, 'http://x').pathname;
    const route = routes[`${req.method} ${path}`];
    if (!route) return send(404, { error: 'not_found' });
    // за Caddy справжня адреса гравця в X-Forwarded-For; без проксі беремо адресу з'єднання
    const ip = (config.behindProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';
    try {
      send(200, await route(req, ip));
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { error: e.code });
      console.error(e);
      send(500, { error: 'internal' });
    }
  };
}
