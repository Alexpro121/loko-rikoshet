import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../src/db.js';
import { runMaintenance, due, BACKUPS_KEEP } from '../src/maintenance.js';

const DAY = 24 * 3600 * 1000;

test('обслуговування чистить прострочені сесії, робить цілісну копію й тримає 14 останніх', () => {
  const dir = mkdtempSync(join(tmpdir(), 'loko-'));
  try {
    const db = openDb(join(dir, 'game.db'));
    db.prepare("INSERT INTO players (id, name, created_at, last_seen) VALUES (1, 'А', 0, 0)").run();
    db.prepare("INSERT INTO sessions VALUES ('old', 1, 10), ('new', 1, 9999999999)").run();
    const bk = join(dir, 'backups');
    const days = Array.from({ length: 20 }, (_, i) => Date.UTC(2026, 0, i + 1, 3));
    const runs = days.map((ms) => runMaintenance(db, bk, ms));
    assert.equal(runs[0].expired, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 1);
    const files = readdirSync(bk).sort();
    assert.equal(files.length, BACKUPS_KEEP);
    assert.equal(files.at(-1), 'game-20260120.db');
    const copy = new DatabaseSync(join(bk, files.at(-1)), { readOnly: true });
    assert.equal(copy.prepare("SELECT token_hash FROM sessions").get().token_hash, 'new');
    copy.close(); db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('обслуговування вночі раз на добу, а без копії понад дві доби одразу', () => {
  const dir = mkdtempSync(join(tmpdir(), 'loko-'));
  try {
    const night = Date.UTC(2026, 0, 10, 2), noon = Date.UTC(2026, 0, 10, 12);
    assert.equal(due(dir, noon), true);                 // копій немає зовсім
    const f = join(dir, 'game-20260109.db');
    writeFileSync(f, '');
    utimesSync(f, (night - DAY) / 1000, (night - DAY) / 1000);
    assert.equal(due(dir, night), true);
    assert.equal(due(dir, noon), false);                // удень чекаємо ночі
    utimesSync(f, (night - 3 * 3600e3) / 1000, (night - 3 * 3600e3) / 1000);
    assert.equal(due(dir, night), false);               // сьогоднішня вже є
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
