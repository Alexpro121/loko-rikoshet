// Нічне обслуговування бази: прострочені сесії, локальна копія бази, оптимізація запитів.
// Працює всередині служби раз на добу вночі, коли ні гравців, ні нічної роботи бота LOKO (01:15 за Києвом).
import { mkdirSync, readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const BACKUPS_KEEP = 14;            // днів локальних копій
const NIGHT_UTC = [1, 5];                  // 03:00–07:59 за Києвом
const DAY_MS = 24 * 3600 * 1000;

const stamp = (ms) => new Date(ms).toISOString().slice(0, 10).replaceAll('-', '');

/** Остання локальна копія: час її створення або 0. */
export function lastBackupMs(dir) {
  if (!existsSync(dir)) return 0;
  let last = 0;
  for (const f of readdirSync(dir)) if (/^game-\d{8}\.db$/.test(f)) last = Math.max(last, statSync(join(dir, f)).mtimeMs);
  return last;
}

/** Чи час обслуговувати: раз на добу вночі, а якщо копії немає вже понад дві доби — одразу. */
export function due(dir, nowMs) {
  const age = nowMs - lastBackupMs(dir);
  const h = new Date(nowMs).getUTCHours();
  return age > 2 * DAY_MS || (age > 20 * 3600 * 1000 && h >= NIGHT_UTC[0] && h <= NIGHT_UTC[1]);
}

export function runMaintenance(db, dir, nowMs = Date.now()) {
  const nowSec = Math.floor(nowMs / 1000);
  const expired = db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowSec).changes;
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `game-${stamp(nowMs)}.db`);
  if (existsSync(file)) unlinkSync(file);
  // VACUUM INTO дає цілісну стиснуту копію, не зупиняючи гру
  db.prepare('VACUUM INTO ?').run(file);
  const old = readdirSync(dir).filter((f) => /^game-\d{8}\.db$/.test(f)).sort().slice(0, -BACKUPS_KEEP);
  for (const f of old) unlinkSync(join(dir, f));
  db.exec('PRAGMA optimize');
  return { expired, file, removed: old.length };
}

/** Перевірка щогодини; сам запуск короткий (база в мегабайтах). */
export function scheduleMaintenance(db, dir, log = console) {
  const tick = () => {
    try {
      if (!due(dir, Date.now())) return;
      const r = runMaintenance(db, dir);
      log.log(`Обслуговування: прострочених сесій ${r.expired}, копія ${r.file}, старих копій видалено ${r.removed}`);
    } catch (e) { log.error('Обслуговування не вдалося', e); }
  };
  const first = setTimeout(tick, 5 * 60 * 1000);   // не в мить запуску: після оновлення сервер спершу приймає гравців
  const every = setInterval(tick, 3600 * 1000);
  first.unref(); every.unref();
  return () => { clearTimeout(first); clearInterval(every); };
}
