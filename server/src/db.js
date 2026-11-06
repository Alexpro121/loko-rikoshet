// База гри: один файл SQLite (вбудований node:sqlite). Зміни схеми додаються в кінець MIGRATIONS,
// а номер виконаної міграції зберігає PRAGMA user_version.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const MIGRATIONS = [
  `CREATE TABLE players (
     id INTEGER PRIMARY KEY,            -- Telegram ID
     name TEXT NOT NULL,
     username TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL,
     last_seen INTEGER NOT NULL,
     banned INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     player_id INTEGER NOT NULL REFERENCES players(id),
     expires_at INTEGER NOT NULL
   );
   CREATE INDEX sessions_player ON sessions(player_id);
   CREATE TABLE clubs (
     player_id INTEGER PRIMARY KEY REFERENCES players(id),
     data TEXT NOT NULL,                -- клуб і герої у форматі гри (OP)
     coins INTEGER NOT NULL,
     rating INTEGER NOT NULL,
     lvl INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE coin_ledger (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     player_id INTEGER NOT NULL REFERENCES players(id),
     delta INTEGER NOT NULL,
     reason TEXT NOT NULL,
     at INTEGER NOT NULL
   );
   CREATE INDEX coin_ledger_player ON coin_ledger(player_id);`,
];

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const done = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = done; v < MIGRATIONS.length; v++) {
    tx(db, () => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
  return db;
}

/** Усе або нічого: збій посередині не лишає половини змін. */
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
