// Перевірка підпису Telegram Mini App (initData): без токена бота підробити чужий акаунт неможливо.
// Порядок з документації Telegram: усі поля, крім hash, за алфавітом як «ключ=значення» через \n,
// ключ підпису це HMAC-SHA256 токена бота з ключем «WebAppData».
import { createHmac, timingSafeEqual } from 'node:crypto';

export const MAX_AGE_SEC = 24 * 3600;

/** Повертає { id, name, username } або null, якщо дані підроблені, застарілі чи неповні. */
export function verifyInitData(initData, botToken, nowSec = Date.now() / 1000, maxAgeSec = MAX_AGE_SEC) {
  if (typeof initData !== 'string' || !initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  params.delete('hash');
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(check).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || nowSec - authDate > maxAgeSec || authDate - nowSec > 300) return null;
  let user;
  try { user = JSON.parse(params.get('user') || ''); } catch { return null; }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return null;
  const name = [user.first_name, user.last_name].filter((s) => typeof s === 'string' && s).join(' ').slice(0, 64);
  return { id: user.id, name: name || `id${user.id}`, username: typeof user.username === 'string' ? user.username.slice(0, 32) : '' };
}

/** Підписує initData так само, як Telegram. Лише для тестів і локальної перевірки. */
export function signInitData(fields, botToken) {
  const params = new URLSearchParams(fields);
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}
