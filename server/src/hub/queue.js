// Черга швидкого матчу за рейтингом, лише в пам'яті. Кожен, хто шукає, уже тримає відкриту кімнату PeerJS (code);
// сервер лише каже, хто до кого йде. Довге очікування до waitMs (≤ 12 с при requestTimeout 15 с), клієнт повторює запит,
// поки state === 'wait'. Перезапуск сервера губить чергу: клієнт просто стане в неї знову.

const CODE = /^[A-HJ-NP-Z2-9]{5}$/;
const WIN0 = 100, WIN_STEP = 25, WIN_EVERY = 5000, WIN_MAX = 400;   // вікно рейтингу ±100, +25 кожні 5 с, до ±400
const ANY_MS = 40_000;                    // після 40 с годиться будь-хто
const GONE_MS = 20_000;                   // не повторив запит стільки — випадає з черги
const DISPUTE_SEC = 3600;                 // після розбіжності в рахунку цю пару годину не зводимо
const AVOID_MAX = 20;

export function queueRoutes(ctx, club, match, waitMs) {
  const { db, auth, readJson, HttpError, now, pid } = ctx;
  const Q = new Map();                    // id гравця → { id, pid, code, avoid (pid), rating, name, since, seen, waiter, paired }
  const disputed = db.prepare(`SELECT 1 FROM matches WHERE state = 'disputed' AND ended_at >= ?
    AND ((host_id = ? AND guest_id = ?) OR (host_id = ? AND guest_id = ?)) LIMIT 1`);
  const banned = db.prepare('SELECT banned FROM players WHERE id = ?');   // забанений під час очікування в пару не йде

  const searching = () => { let n = 0; for (const e of Q.values()) if (!e.paired) n++; return n; };
  const win = (e, t) => {
    const w = t - e.since;
    return w >= ANY_MS ? Infinity : Math.min(WIN_MAX, WIN0 + WIN_STEP * Math.floor(w / WIN_EVERY));
  };

  /** Віддати гравцеві пару: якщо він зараз чекає, одразу; інакше пара лежить до його наступного запиту (до GONE_MS). */
  function give(e) {
    if (!e.waiter) return;
    Q.delete(e.id);
    e.waiter(e.paired);
  }
  /** Найкраща пара для e: найближчий за рейтингом, далі той, хто довше чекає. Господар — хто чекав довше. */
  function tryPair(e, t) {
    let best = null, bestD = Infinity;
    const recent = Math.floor(t / 1000) - DISPUTE_SEC;
    for (const o of Q.values()) {
      if (o === e || o.paired || e.avoid.has(o.pid) || o.avoid.has(e.pid)) continue;
      const d = Math.abs(o.rating - e.rating);
      if (d > Math.max(win(e, t), win(o, t))) continue;
      if (d > bestD || (d === bestD && o.since >= best.since)) continue;
      if (disputed.get(recent, e.id, o.id, o.id, e.id) || banned.get(o.id).banned) continue;
      best = o; bestD = d;
    }
    if (!best) return false;
    const [host, guest] = best.since <= e.since ? [best, e] : [e, best];
    host.paired = { state: 'paired', role: 'host', code: host.code, opp: { id: guest.pid, name: guest.name, rating: guest.rating } };
    guest.paired = { state: 'paired', role: 'guest', code: host.code, opp: { id: host.pid, name: host.name, rating: host.rating } };
    give(best);
    return true;
  }
  /** Зниклі гравці випадають; пара, яку ніхто не забрав за GONE_MS, теж. */
  function sweep(t = now()) {
    for (const e of Q.values()) if (!e.waiter && t - e.seen > GONE_MS) Q.delete(e.id);
  }

  const routes = {
    'POST /queue': async (req) => {
      const p = auth(req);
      const b = await readJson(req);
      const code = String(b.code || '').toUpperCase();
      if (!CODE.test(code)) throw new HttpError(400, 'bad_code');
      const s = club.load(p.id);
      if (!s) throw new HttpError(409, 'no_club');
      const t = now();
      sweep(t);
      let e = Q.get(p.id);
      if (e && e.paired) { Q.delete(p.id); return e.paired; }
      const avoid = new Set((Array.isArray(b.avoid) ? b.avoid : []).slice(0, AVOID_MAX).map(String).filter((v) => /^[A-Za-z0-9_-]{12}$/.test(v)));   // непрозорі id із opp.id
      if (e) {
        if (e.waiter) e.waiter({ state: 'wait', searching: searching() });   // старий запит того самого гравця завершуємо
        Object.assign(e, { code, avoid, rating: s.rating, name: s.club.name });
      } else {
        e = { id: p.id, pid: pid(p.id), code, avoid, rating: s.rating, name: s.club.name, since: t, seen: t, waiter: null, paired: null };
        Q.set(p.id, e);
      }
      e.seen = t;
      if (tryPair(e, t)) { Q.delete(p.id); return e.paired; }
      return new Promise((resolve) => {
        const me = e;
        const done = (v) => { clearTimeout(timer); if (me.waiter === done) me.waiter = null; me.seen = now(); resolve(v); };
        const timer = setTimeout(() => {
          if (me.paired) { Q.delete(me.id); return done(me.paired); }
          if (Q.get(me.id) === me) tryPair(me, now());                  // вікно могло розширитись, поки чекали
          done(me.paired || { state: 'wait', searching: searching() });
          if (me.paired) Q.delete(me.id);
        }, waitMs);
        me.waiter = done;
      });
    },

    'POST /queue/leave': (req) => {
      const p = auth(req);
      const e = Q.get(p.id);
      if (e) { Q.delete(p.id); if (e.waiter) e.waiter({ state: 'left' }); }
      return { ok: true };
    },

    'GET /queue/stats': (req) => {
      auth(req);
      return { searching: searching(), playing: match.playing() };
    },
  };

  return { routes, sweep };
}
