// Матч і підтверджений результат. Господар рахує матч, гість лише дивиться: сервер вірить господарю, а гість звіряє.
// Старти обох гравців з одним кодом кімнати в межах PAIR_SEC сервер парує в один матч; без пари матч «solo» (як у
// локальній грі, сервер його не рахує). Нагороди й Ело рахує applyResult гри (rules.reward) за серверними рейтингами.
import { randomBytes } from 'node:crypto';

export const PAIR_SEC = 30;               // другий старт із тим самим кодом чекаємо стільки
export const ALONE_SEC = 60;              // звіт одного гравця стає підсумком, якщо другий мовчить стільки
export const SETTLE_SEC = 15 * 60;        // ніхто не звітував: матч закривається (серверний settleLive)
const DISPUTE_COINS = 30;                 // розбіжність у рахунку: обом лише монети за участь
const TECH = [3, 0];                      // технічний результат, як у грі (session.js)
const MODES = ['quick', 'friend', 'cup'];
const CODE = /^[A-HJ-NP-Z2-9]{5}$/;
const FINAL = new Set(['done', 'disputed', 'void']);

const other = (role) => (role === 'host' ? 'guest' : 'host');

export function matchRoutes(ctx, club) {
  const { db, rules, auth, readJson, HttpError, sec, tx, ledger } = ctx;
  const q = {
    pending: db.prepare(`SELECT * FROM matches WHERE code = ? AND state = 'pending' AND started_at >= ? ORDER BY started_at DESC LIMIT 1`),
    add: db.prepare(`INSERT INTO matches (id, code, mode, cup_id, host_id, guest_id, started_at, state) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`),
    join: db.prepare(`UPDATE matches SET host_id = ?, guest_id = ?, state = 'live' WHERE id = ? AND state = 'pending'`),
    get: db.prepare('SELECT * FROM matches WHERE id = ?'),
    solo: db.prepare(`UPDATE matches SET state = 'solo', ended_at = ? WHERE state = 'pending' AND started_at < ?`),
    open: db.prepare(`SELECT * FROM matches WHERE state = 'live' AND started_at < ?`),
    reports: db.prepare('SELECT player_id, at, json FROM match_reports WHERE match_id = ?'),
    report: db.prepare('INSERT OR IGNORE INTO match_reports (match_id, player_id, at, json) VALUES (?, ?, ?, ?)'),
    end: db.prepare('UPDATE matches SET state = ?, ended_at = ?, score_h = ?, score_g = ?, json = ? WHERE id = ?'),
    mine: db.prepare(`SELECT m.id, m.mode, m.started_at FROM matches m WHERE (m.host_id = ? OR m.guest_id = ?) AND m.state IN ('pending', 'live')
      AND NOT EXISTS (SELECT 1 FROM match_reports r WHERE r.match_id = m.id AND r.player_id = ?) ORDER BY m.started_at DESC LIMIT 1`),
    playing: db.prepare(`SELECT COUNT(*) AS n FROM matches WHERE state = 'live' AND started_at >= ?`),
  };

  /** Звіт із тіла запиту: рахунок 0…99, автори голів почищені, як їх чистить гра. */
  function cleanReport(b) {
    const sc = (Array.isArray(b.scorers) ? b.scorers : []).slice(0, 40).map((s) => ({
      name: rules.plain(s && s.name != null ? s.name : '').slice(0, 24), min: rules.plain(s && s.min != null ? s.min : '').slice(0, 8), mine: !!(s && s.mine), og: !!(s && s.og),
    }));
    const n = (v) => (Number.isFinite(+v) ? Math.min(99, Math.max(0, Math.round(+v))) : 0);
    return { me: n(b.me), opp: n(b.opp), scorers: sc, forfeit: b.forfeit === 'me' || b.forfeit === 'opp' ? b.forfeit : null, void: b.void === true };
  }

  /** Звіт у погляді господаря: { void } | { tech: хто програв } | { h, g, sc }. */
  function canon(rep, role) {
    if (rep.void) return { void: true };
    if (rep.forfeit) return { tech: rep.forfeit === 'me' ? role : other(role) };
    if (role === 'host') return { h: rep.me, g: rep.opp, sc: rep.scorers };
    return { h: rep.opp, g: rep.me, sc: rep.scorers.map((s) => ({ ...s, mine: !s.mine })) };
  }
  const sameScore = (a, b) => a.h === b.h && a.g === b.g;

  /** Що вирішено за звітами на мить t: null (ще чекаємо) або { kind: 'score'|'tech'|'void'|'disputed', ... }. */
  function decide(m, t) {
    const reps = {};
    for (const r of q.reports.all(m.id)) {
      const role = r.player_id === m.host_id ? 'host' : 'guest';
      reps[role] = { at: r.at, c: canon(JSON.parse(r.json), role) };
    }
    const H = reps.host, G = reps.guest;
    // технічна поразка самому собі (вихід із матчу) діє одразу
    if (H && H.c.tech === 'host') return { kind: 'tech', loser: 'host' };
    if (G && G.c.tech === 'guest') return { kind: 'tech', loser: 'guest' };
    const asIs = (c) => (c.void ? { kind: 'void' } : c.tech ? { kind: 'tech', loser: c.tech } : { kind: 'score', h: c.h, g: c.g, sc: c.sc });
    if (H && G) {
      if (H.c.void) return { kind: 'void' };              // вірим господарю
      if (G.c.void) return asIs(H.c);
      if (!H.c.tech && !G.c.tech && sameScore(H.c, G.c)) return asIs(H.c);
      return { kind: 'disputed' };
    }
    if (H) return t - H.at >= ALONE_SEC ? asIs(H.c) : null;
    if (G) {
      if ((G.c.tech === 'host' || G.c.void) && t - G.at >= ALONE_SEC) return asIs(G.c);
      return t - m.started_at >= SETTLE_SEC ? { kind: 'tech', loser: 'host' } : null;   // господар так і не звітував
    }
    return t - m.started_at >= SETTLE_SEC ? { kind: 'void' } : null;
  }

  /** Записати підсумок: нагороди обом в одній транзакції (викликається всередині tx). */
  function apply(m, d, t) {
    const ids = { host: m.host_id, guest: m.guest_id };
    const json = { rew: {}, quests: {}, kind: d.kind };
    const reason = 'match:' + m.id;
    if (d.kind === 'void') { q.end.run('void', t, null, null, JSON.stringify(json), m.id); return; }
    const st = { host: club.load(ids.host), guest: club.load(ids.guest) };
    if (d.kind === 'disputed') {
      for (const role of ['host', 'guest']) {
        const s = st[role]; if (!s) continue;
        s.coins += DISPUTE_COINS; club.store(ids[role], s); ledger(ids[role], DISPUTE_COINS, reason);
        json.rew[role] = { coins: DISPUTE_COINS, dR: 0, xp: 0, lvl: s.lvl, clubUp: false, ups: [] };
      }
      q.end.run('disputed', t, null, null, JSON.stringify(json), m.id);
      return;
    }
    let h, g, sc = [];
    if (d.kind === 'tech') { [h, g] = d.loser === 'host' ? [TECH[1], TECH[0]] : TECH; json.tech = d.loser; } else ({ h, g, sc } = d);
    const before = { host: st.host && st.host.rating, guest: st.guest && st.guest.rating };
    for (const role of ['host', 'guest']) {
      const s = st[role]; if (!s) continue;
      const me = role === 'host' ? h : g, opp = role === 'host' ? g : h;
      const view = role === 'host' ? sc : sc.map((x) => ({ ...x, mine: !x.mine }));
      const outcome = me > opp ? 'win' : me < opp ? 'loss' : 'draw';
      const oppR = before[other(role)] ?? 1000;
      const mine = view.filter((x) => x.mine && !x.og).map((x) => x.name);   // автогол суперника — наш гол, але не гол героя
      const r = rules.reward(s, outcome, me, oppR, mine);
      const next = { ...r.state, imported: s.imported };
      club.store(ids[role], next);
      ledger(ids[role], r.rew.coins, reason);
      ledger(ids[role], next.coins - s.coins - r.rew.coins, 'lvl');           // бонус за новий рівень клубу
      json.rew[role] = r.rew;
      // квести лише за дограний матч (без технічного результату)
      json.quests[role] = d.kind === 'score' && ctx.questsAfter ? ctx.questsAfter(ids[role], { me, opp, scorers: view }, s.heroes, before[role], oppR) : [];
    }
    q.end.run('done', t, h, g, JSON.stringify(json), m.id);
  }

  /** Підсумувати матч, якщо вже можна (у транзакції). Повертає свіжий рядок матчу. */
  function settle(m, t = sec()) {
    if (m.state === 'pending' && m.started_at < t - PAIR_SEC) { q.solo.run(t, t - PAIR_SEC); return q.get.get(m.id); }
    if (m.state !== 'live') return m;
    const d = decide(m, t);
    if (!d) return m;
    apply(m, d, t);
    return q.get.get(m.id);
  }
  /** Фонова перевірка: матчі без пари стають solo, мовчазні — закриваються за правилами. */
  function sweep(t = sec()) {
    tx(db, () => {
      q.solo.run(t, t - PAIR_SEC);
      for (const m of q.open.all(t - ALONE_SEC)) settle(m, t);
    });
  }

  function view(m, playerId) {
    const role = m.host_id === playerId ? 'host' : m.guest_id === playerId ? 'guest' : null;
    if (!role) throw new HttpError(404, 'no_match');
    if (m.state === 'solo') return { state: 'solo' };
    if (!FINAL.has(m.state)) return { state: 'wait' };
    const j = JSON.parse(m.json || '{}');
    return {
      state: m.state, score: m.score_h == null ? null : role === 'host' ? [m.score_h, m.score_g] : [m.score_g, m.score_h],
      rew: (j.rew && j.rew[role]) || null, quests: (j.quests && j.quests[role]) || [], club: club.out(club.load(playerId)),
    };
  }

  const routes = {
    'POST /match/start': async (req) => {
      const p = auth(req);
      const b = await readJson(req);
      const code = String(b.code || '').toUpperCase();
      if (!CODE.test(code)) throw new HttpError(400, 'bad_code');
      const role = b.role === 'guest' ? 'guest' : b.role === 'host' ? 'host' : null;
      if (!role) throw new HttpError(400, 'bad_role');
      const mode = MODES.includes(b.mode) ? b.mode : 'friend';
      if (!club.load(p.id)) throw new HttpError(409, 'no_club');
      const t = sec();
      return tx(db, () => {
        const m = q.pending.get(code, t - PAIR_SEC);
        if (m) {
          if (m.host_id === p.id || m.guest_id === p.id) {
            if (m[role + '_id'] === p.id) return { matchId: m.id };     // повтор того самого старту
          } else if (m[role + '_id'] == null) {
            const hostId = role === 'host' ? p.id : m.host_id, guestId = role === 'guest' ? p.id : m.guest_id;
            q.join.run(hostId, guestId, m.id);
            return { matchId: m.id };
          }
        }
        const id = randomBytes(9).toString('base64url');
        q.add.run(id, code, mode, mode === 'cup' && b.cup != null ? String(b.cup).slice(0, 40) : null, role === 'host' ? p.id : null, role === 'guest' ? p.id : null, t);
        return { matchId: id };
      });
    },

    'POST /match/result': async (req) => {
      const p = auth(req);
      const b = await readJson(req);
      const id = String(b.matchId || '');
      const t = sec();
      return tx(db, () => {
        let m = q.get.get(id);
        if (!m || (m.host_id !== p.id && m.guest_id !== p.id)) throw new HttpError(404, 'no_match');
        m = settle(m, t);
        if (m.state === 'live') { q.report.run(id, p.id, t, JSON.stringify(cleanReport(b))); m = settle(m, t); }
        return view(m, p.id);
      });
    },
  };
  const patterns = [
    ['GET', /^\/match\/([A-Za-z0-9_-]{6,40})$/, (req, _ip, _url, [id]) => {
      const p = auth(req);
      return tx(db, () => {
        const m = q.get.get(id);
        if (!m) throw new HttpError(404, 'no_match');
        return view(settle(m), p.id);
      });
    }],
  ];

  const live = (playerId) => {
    const m = q.mine.get(playerId, playerId, playerId);
    return m ? { matchId: m.id, mode: m.mode, startedAt: m.started_at } : null;
  };
  const playing = (t = sec()) => q.playing.get(t - SETTLE_SEC).n * 2;

  return { routes, patterns, sweep, live, playing };
}
