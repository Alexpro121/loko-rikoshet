// Запуск: API гри і власний сервер PeerJS, що знайомить гравців онлайн-матчу.
// Обидва слухають лише 127.0.0.1, назовні їх виставляє Caddy з HTTPS.
import { createServer } from 'node:http';
import { join } from 'node:path';
import { PeerServer } from 'peer';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { newClub } from './rules.js';

const config = loadConfig();
const db = openDb(join(config.dataDir, 'game.db'));
const api = createServer(createApp({ db, config, newClub }));
api.listen(config.port, config.host, () => console.log(`API гри: ${config.host}:${config.port}`));

PeerServer({ port: config.peerPort, host: config.host, path: '/', proxied: true, allow_discovery: false });
console.log(`PeerJS: ${config.host}:${config.peerPort}`);

const stop = () => { api.close(); db.close(); process.exit(0); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
