// Матч і підтверджений результат. Господар рахує матч, гість лише дивиться: сервер вірить господарю, а гість звіряє.
// Господар відкриває матч і отримує одноразовий квиток, який шле гостю P2P; гість приходить у матч лише з ним (код кімнати
// знає кожен, кому його надіслали, тож за кодом не паруємо). Без гостя за PAIR_SEC матч «solo» (як у локальній грі,
// сервер його не рахує). Нагороди й Ело рахує applyResult гри (rules.reward) за серверними рейтингами.
// Від фарму між своїми акаунтами: рейтингових матчів однієї пари не більше PAIR_DAY за київську добу, звіт рахунку раніше
// MIN_REPORT_SEC після парування — розбіжність, монет за голи не більше ніж за COIN_GOALS.
import { randomBytes, createHash } from 'node:crypto';

export const PAIR_SEC = 120;              // квиток господаря живе стільки; без гостя матч стає solo
export const ALONE_SEC = 60;              // звіт одного гравця стає підсумком, якщо другий мовчить стільки
export const SETTLE_SEC = 15 * 60;        // ніхто не звітував: матч закривається (серверний settleLive)
const DISPUTE_COINS = 30;                 // розбіжність у рахунку чи ліміт пари: обом лише монети за участь
export const PAIR_DAY = 3;                // рейтингових матчів тієї самої пари за київську добу
export const MIN_REPORT_SEC = 200;        // матч триває 270 с: рахунок раніше — розбіжність
const COIN_GOALS = 8;                     // голів, за які платимо монети, не більше
const TICKET = /^[A-Za-z0-9_-]{16,64}$/;
const TECH = [3, 0];                      // технічний результат, як у грі (session.js)
const MODES = ['quick', 'friend', 'cup'];
const CODE = /^[A-HJ-NP-Z2-9]{5}$/;
const FINAL = new Set(['done', 'disputed', 'void']);

const other = (role) => (role === 'host' ? 'guest' : 'host');
const hashTicket = (t) => createHash('sha256').update(t).digest('hex');

let fmtK = null;
/** Початок київської доби (секунди) для мітки t. */
export function kyivDayStart(t) {
  fmtK ??= new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kyiv', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
  const o = {};
  for (const x of fmtK.formatToParts(t * 1000)) o[x.type] = +x.value;
  return t - ((o.hour % 24) * 3600 + o.minute * 60 + o.second);
}

export function matchRoutes(ctx, club) {
  const { db, rules, auth, readJson, HttpError, sec, tx, ledger, flag } = ctx;
  const q = {
    pending: db.prepare(`SELECT * FROM matches WHERE code = ? AND host_id = ? AND state = 'pending' AND ticket_exp >= ? ORDER BY started_at DESC LIMIT 1`),
    add: db.prepare(`INSERT INTO matches (id, code, mode, cup_id, host_id, started_at, state, ticket_hash, ticket_exp) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`),
    reticket: db.prepare('UPDATE matches SET ticket_hash = ?, ticket_exp = ? WHERE id = ?'),
    byTicket: db.prepare('SELECT * FROM matches WHERE ticket_hash = ?'),
    join: db.prepare(`UPDATE matches SET guest_id = ?, state = 'live', paired_at = ? WHERE id = ? AND state = 'pending' AND guest_id IS NULL`),
    get: db.prepare('SELECT * FROM matches WHERE id = ?'),
    solo: db.prepare(`UPDATE matches SET state = 'solo', ended_at = ? WHERE state = 'pending' AND ticket_exp < ?`),
    open: db.prepare(`SELECT * FROM matches WHERE state = 'live' AND paired_at < ?`),
    pairRated: db.prepare(`SELECT COUNT(*) AS n FROM matches WHERE rated = 1 AND ended_at >= ?
      AND ((host_id = ? AND guest_id = ?) OR (host_id = ? AND guest_id = ?))`),
    rated: db.prepare('UPDATE matches SET rated = 1 WHERE id = ?'),
    reports: db.prepare('SELECT player_id, at, json FROM match_reports WHERE match_id = ?'),
    report: db.prepare('INSERT OR IGNORE INTO match_reports (match_id, player_id, at, json) VALUES (?, ?, ?, ?)'),
    end: db.prepare('UPDATE matches SET state = ?, ended_at = ?, score_h = ?, score_g = ?, json = ? WHERE id = ?'),
    mine: db.prepare(`SELECT m.id, m.mode, m.started_at FROM matches m WHERE (m.host_id = ? OR m.guest_id = ?) AND m.state IN ('pending', 'live')
      AND NOT EXISTS (SELECT 1 FROM match_reports r WHERE r.match_id = m.id AND r.player_id = ?) ORDER BY m.started_at DESC LIMIT 1`),
    playing: db.prepare(`SELECT COUNT(*) AS n FROM matches WHERE state = 'live' AND paired_at >= ?`),
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
    // рахунок раніше, ніж матч міг скінчитися: фарм чи підробка — розбіжність (вихід і void так не перевіряємо)
    const fast = ['host', 'guest'].filter((r) => reps[r] && reps[r].c.h != null && reps[r].at - m.paired_at < MIN_REPORT_SEC);
    if (fast.length) return { kind: 'disputed', fast };
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
      return t - m.paired_at >= SETTLE_SEC ? { kind: 'tech', loser: 'host' } : null;   // господар так і не звітував
    }
    return t - m.paired_at >= SETTLE_SEC ? { kind: 'void' } : null;
  }

  /** Записати підсумок: нагороди обом в одній транзакції (викликається всередині tx). */
  function apply(m, d, t) {
    const ids = { host: m.host_id, guest: m.guest_id };
    const json = { rew: {}, quests: {}, kind: d.kind };
    const reason = 'match:' + m.id;
    if (d.kind === 'void') { q.end.run('void', t, null, null, JSON.stringify(json), m.id); return; }
    const st = { host: club.load(ids.host), guest: club.load(ids.guest) };
    /** Лише монети за участь, без рейтингу, досвіду й квестів. */
    const consolation = () => {
      for (const role of ['host', 'guest']) {
        const s = st[role]; if (!s) continue;
        s.coins += DISPUTE_COINS; club.store(ids[role], s); ledger(ids[role], DISPUTE_COINS, reason);
        json.rew[role] = { coins: DISPUTE_COINS, dR: 0, xp: 0, lvl: s.lvl, clubUp: false, ups: [] };
      }
    };
    if (d.kind === 'disputed') {
      const reps = {};
      for (const r of q.reports.all(m.id)) reps[r.player_id === ids.host ? 'host' : 'guest'] = { ...JSON.parse(r.json), sec: r.at - m.paired_at };
      for (const role of ['host', 'guest']) flag(ids[role], d.fast && d.fast.includes(role) ? 'fast' : 'disputed', { match: m.id, role, with: ids[other(role)], reports: reps });
      consolation();
      q.end.run('disputed', t, null, null, JSON.stringify(json), m.id);
      return;
    }
    let h, g, sc = [];
    if (d.kind === 'tech') { [h, g] = d.loser === 'host' ? [TECH[1], TECH[0]] : TECH; json.tech = d.loser; } else ({ h, g, sc } = d);
    // ліміт пари за київську добу (технічні перемоги теж рахуються): далі матч без рейтингу й квестів, лише за участь
    if (q.pairRated.get(kyivDayStart(t), ids.host, ids.guest, ids.guest, ids.host).n >= PAIR_DAY) {
      for (const role of ['host', 'guest']) flag(ids[role], 'pair', { match: m.id, role, with: ids[other(role)], score: [h, g] });
      consolation();
      json.limited = true;
      q.end.run('done', t, h, g, JSON.stringify(json), m.id);
      return;
    }
    q.rated.run(m.id);
    const before = { host: st.host && st.host.rating, guest: st.guest && st.guest.rating };
    for (const role of ['host', 'guest']) {
      const s = st[role]; if (!s) continue;
      const me = role === 'host' ? h : g, opp = role === 'host' ? g : h;
      const view = role === 'host' ? sc : sc.map((x) => ({ ...x, mine: !x.mine }));
      const outcome = me > opp ? 'win' : me < opp ? 'loss' : 'draw';
      const oppR = before[other(role)] ?? 1000;
      const mine = view.filter((x) => x.mine && !x.og).map((x) => x.name);   // автогол суперника — наш гол, але не гол героя
      const r = rules.reward(s, outcome, Math.min(me, COIN_GOALS), oppR, mine.slice(0, COIN_GOALS));
      const next = { ...s, ...r.state };                                     // лава й решта клубу лишаються як були
      club.store(ids[role], next);
      ledger(ids[role], r.rew.coins, reason);
      ledger(ids[role], next.coins - s.coins - r.rew.coins, 'lvl');           // бонус за новий рівень клубу
      if (r.rew.iron) ctx.ironLedger(ids[role], r.rew.iron, 'lvl');           // Iron Dollar за новий рівень
      json.rew[role] = r.rew;
      // квести лише за дограний матч (без технічного результату)
      json.quests[role] = d.kind === 'score' && ctx.questsAfter ? ctx.questsAfter(ids[role], { me, opp, scorers: view }, s.heroes, before[role], oppR) : [];
    }
    q.end.run('done', t, h, g, JSON.stringify(json), m.id);
  }

  /** Підсумувати матч, якщо вже можна (у транзакції). Повертає свіжий рядок матчу. */
  function settle(m, t = sec()) {
    if (m.state === 'pending' && m.ticket_exp < t) { q.solo.run(t, t); return q.get.get(m.id); }
    if (m.state !== 'live') return m;
    const d = decide(m, t);
    if (!d) return m;
    apply(m, d, t);
    return q.get.get(m.id);
  }
  /** Фонова перевірка: матчі без пари стають solo, мовчазні — закриваються за правилами. */
  function sweep(t = sec()) {
    tx(db, () => {
      q.solo.run(t, t);
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
      rew: (j.rew && j.rew[role]) || null, quests: (j.quests && j.quests[role]) || [], limited: !!j.limited, club: club.out(club.load(playerId)),
    };
  }

  const routes = {
    // господар: { code, role: 'host', mode } → { matchId, ticket }; гість: { role: 'guest', mode, ticket } → { matchId }
    'POST /match/start': async (req) => {
      const p = auth(req);
      const b = await readJson(req);
      const role = b.role === 'guest' ? 'guest' : b.role === 'host' ? 'host' : null;
      if (!role) throw new HttpError(400, 'bad_role');
      if (!club.load(p.id)) throw new HttpError(409, 'no_club');
      const t = sec();
      if (role === 'guest') {
        const ticket = String(b.ticket || '');
        if (!TICKET.test(ticket)) throw new HttpError(400, 'bad_ticket');
        return tx(db, () => {
          const m = q.byTicket.get(hashTicket(ticket));
          if (!m) throw new HttpError(409, 'bad_ticket');
          if (m.guest_id === p.id) return { matchId: m.id };              // реконект того самого гостя
          if (m.host_id === p.id) throw new HttpError(409, 'self');
          if (m.guest_id != null || m.state !== 'pending' || m.ticket_exp < t) throw new HttpError(409, 'bad_ticket');
          q.join.run(p.id, t, m.id);
          return { matchId: m.id };
        });
      }
      const code = String(b.code || '').toUpperCase();
      if (!CODE.test(code)) throw new HttpError(400, 'bad_code');
      const mode = MODES.includes(b.mode) ? b.mode : 'friend';
      const ticket = randomBytes(18).toString('base64url');            // у базі лише хеш
      return tx(db, () => {
        const m = q.pending.get(code, p.id, t);
        if (m) { q.reticket.run(hashTicket(ticket), t + PAIR_SEC, m.id); return { matchId: m.id, ticket }; }   // повтор старту: новий квиток
        const id = randomBytes(9).toString('base64url');
        q.add.run(id, code, mode, mode === 'cup' && b.cup != null ? String(b.cup).slice(0, 40) : null, p.id, t, hashTicket(ticket), t + PAIR_SEC);
        return { matchId: id, ticket };
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
