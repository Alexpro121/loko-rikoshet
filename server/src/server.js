// Запуск: API гри і власний сервер PeerJS, що знайомить гравців онлайн-матчу.
// Обидва слухають лише 127.0.0.1, назовні їх виставляє Caddy з HTTPS.
import { createServer } from 'node:http';
import { join } from 'node:path';
import { PeerServer } from 'peer';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';
import * as rules from './rules.js';
import { createBot } from './bot/index.js';
import { scheduleMaintenance } from './maintenance.js';
import { guardedWss } from './peerguard.js';

const PEERS_MAX = 1000;                   // одночасних гравців у сервері кімнат: далі нові отримують відмову, а не гальмують усіх

const config = loadConfig();
const db = openDb(join(config.dataDir, 'game.db'));
const bot = config.bot ? createBot({ db, config, rules }) : null;
const app = createApp({ db, config, newClub: rules.newClub, rules, bot });
const api = createServer(app);
// онлайн-хаб: матчі без пари стають solo, мовчазні закриваються (серверний settleLive), черга забуває зниклих
const sweep = setInterval(() => { try { app.sweep(); } catch (e) { console.error('Перевірка матчів не вдалася', e); } }, 30_000);
sweep.unref();
// Caddy тримає з'єднання до API відкритими 30 с; тут довше, щоб Caddy не натрапив на щойно закрите (502)
api.keepAliveTimeout = 60_000;
api.headersTimeout = 15_000;
api.requestTimeout = 15_000;
api.listen(config.port, config.host, () => console.log(`API гри: ${config.host}:${config.port}`));

// перебір кодів кімнат: обмеження нових з'єднань і спроб з'єднатися з адреси (peerguard.js)
PeerServer({ port: config.peerPort, host: config.host, path: '/', proxied: true, allow_discovery: false, concurrent_limit: PEERS_MAX, createWebSocketServer: guardedWss({ behindProxy: config.behindProxy }) });
console.log(`PeerJS: ${config.host}:${config.peerPort}`);

const stopMaintenance = scheduleMaintenance(db, join(config.dataDir, 'backups'));

// Бот не тримає запуск: Telegram недоступний — API і PeerJS однаково працюють, налаштування повториться за хвилину
let stopPoll = () => {};
async function startBot() {
  try {
    await bot.setup();
    if (!config.publicUrl) stopPoll = bot.poll();
  } catch (e) { console.error('Бот не запустився:', e.message); setTimeout(startBot, 60_000).unref(); }
}
if (bot) startBot();

// systemd зупиняє службу перед оновленням: базу закриваємо акуратно, щоб WAL злився в основний файл
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  stopMaintenance();
  stopPoll();
  clearInterval(sweep);
  const end = () => { try { db.close(); } catch (_) { /* ignore */ } process.exit(0); };
  api.close(end);
  api.closeIdleConnections();
  setTimeout(end, 3000).unref();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
