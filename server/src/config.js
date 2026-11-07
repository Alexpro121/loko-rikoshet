// Налаштування сервера з оточення (на сервері це /etc/loko-game/env, див. deploy/).
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COVER = fileURLToPath(new URL('../../store/telegram-cover-640x360.png', import.meta.url));

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
    // бот гри: вебхук на PUBLIC_URL/tg (без адреси — опитування), сторінка гри для кнопки «Грати»
    bot: env.BOT_ENABLED !== '0',
    publicUrl: env.PUBLIC_URL || '',
    gameUrl: env.GAME_URL || 'https://alexpro121.github.io/loko-rikoshet/',
    botApiUrl: env.BOT_API_URL || 'https://api.telegram.org',
    widgets: env.BOT_WIDGETS !== '0',
    coverFile: env.COVER_FILE || COVER,
    // оплата Iron Dollar зірками: STARS=0 вимикає частину 'stars'; SUPPORT_CONTACT — кому писати з /paysupport (@нік чи посилання)
    stars: env.STARS !== '0',
    supportContact: env.SUPPORT_CONTACT || '',
  };
  if (!cfg.botToken) throw new Error('BOT_TOKEN не задано: без нього не перевірити вхід гравців');
  if (!cfg.origins.length) throw new Error('ALLOWED_ORIGINS не задано: адреса, з якої відкривається гра');
  return cfg;
}
