// Запуск: API гри і власний сервер PeerJS, що знайомить гравців онлайн-матчу.
// Обидва слухають лише 127.0.0.1, назовні їх виставляє Caddy з HTTPS.
import { createServer } from 'node:http';
import { join } from 'node:path';
import { PeerServer } from 'peer';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { newClub } from './rules.js';
import { scheduleMaintenance } from './maintenance.js';

const PEERS_MAX = 1000;                   // одночасних гравців у сервері кімнат: далі нові отримують відмову, а не гальмують усіх

const config = loadConfig();
const db = openDb(join(config.dataDir, 'game.db'));
const api = createServer(createApp({ db, config, newClub }));
// Caddy тримає з'єднання до API відкритими 30 с; тут довше, щоб Caddy не натрапив на щойно закрите (502)
api.keepAliveTimeout = 60_000;
api.headersTimeout = 15_000;
api.requestTimeout = 15_000;
api.listen(config.port, config.host, () => console.log(`API гри: ${config.host}:${config.port}`));

PeerServer({ port: config.peerPort, host: config.host, path: '/', proxied: true, allow_discovery: false, concurrent_limit: PEERS_MAX });
console.log(`PeerJS: ${config.host}:${config.peerPort}`);

const stopMaintenance = scheduleMaintenance(db, join(config.dataDir, 'backups'));

// systemd зупиняє службу перед оновленням: базу закриваємо акуратно, щоб WAL злився в основний файл
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  stopMaintenance();
  const end = () => { try { db.close(); } catch (_) { /* ignore */ } process.exit(0); };
  api.close(end);
  api.closeIdleConnections();
  setTimeout(end, 3000).unref();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
