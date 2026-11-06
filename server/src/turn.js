// Тимчасові паролі до ретранслятора coturn (режим use-auth-secret): пароль діє кілька годин і лише
// для гравця, що увійшов, тож чужі не ганятимуть через наш сервер свій трафік.
import { createHmac } from 'node:crypto';

export const TURN_TTL_SEC = 6 * 3600;

export function turnCredentials(secret, playerId, urls, nowSec = Math.floor(Date.now() / 1000), ttl = TURN_TTL_SEC) {
  const username = `${nowSec + ttl}:${playerId}`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');
  return { urls, username, credential, ttl };
}
