// Налаштування сервера з оточення (на сервері це /etc/loko-game/env, див. deploy/).
import { join } from 'node:path';

const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

export function loadConfig(env = process.env) {
  const cfg = {
    port: Number(env.PORT || 8787),
    host: env.HOST || '127.0.0.1',
    peerPort: Number(env.PEER_PORT || 9000),
    dataDir: env.DATA_DIR || join(process.cwd(), 'data'),
    botToken: env.BOT_TOKEN || '',
    origins: list(env.ALLOWED_ORIGINS),
    turnSecret: env.TURN_SECRET || '',
    turnUrls: list(env.TURN_URLS),
    behindProxy: env.BEHIND_PROXY !== '0',
  };
  if (!cfg.botToken) throw new Error('BOT_TOKEN не задано: без нього не перевірити вхід гравців');
  if (!cfg.origins.length) throw new Error('ALLOWED_ORIGINS не задано: адреса, з якої відкривається гра');
  return cfg;
}
