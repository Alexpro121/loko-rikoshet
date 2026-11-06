// Квести на сервері: ті самі 3 денні й 1 тижневий, що в грі (src/online/quests.js), однакові для всіх за датою Києва.
// Прогрес росте лише в підтвердженні дограного матчу (match.js → questsAfter). Рядки таблиці quests створюються ліниво.
// Виконане й незабране з минулих періодів зараховується саме при першому GET /quests чи /me після зміни періоду.

export function questRoutes(ctx) {
  const { db, rules, auth, readJson, HttpError, sec, now, tx, ledger } = ctx;
  const q = {
    rows: db.prepare('SELECT period, id, p, got_at FROM quests WHERE player_id = ? AND period IN (?, ?)'),
    row: db.prepare('SELECT p, got_at FROM quests WHERE player_id = ? AND period = ? AND id = ?'),
    put: db.prepare(`INSERT INTO quests (player_id, period, id, p) VALUES (?, ?, ?, ?)
      ON CONFLICT(player_id, period, id) DO UPDATE SET p = excluded.p`),
    got: db.prepare('UPDATE quests SET got_at = ? WHERE player_id = ? AND period = ? AND id = ? AND got_at IS NULL'),
    old: db.prepare('SELECT period, id, p FROM quests WHERE player_id = ? AND got_at IS NULL AND period NOT IN (?, ?)'),
    hasClub: db.prepare('SELECT coins FROM clubs WHERE player_id = ?'),
    coins: db.prepare('UPDATE clubs SET coins = coins + ?, updated_at = ? WHERE player_id = ?'),
  };

  /** Поточні періоди: ключі 'd:РРРР-ММ-ДД' і 'w:<номер дня понеділка>' та набори квестів. */
  function current(t = now()) {
    const { d, w } = rules.questPeriods(t);
    return [
      { kind: 'day', period: 'd:' + d, ids: rules.dayIds(d) },
      { kind: 'week', period: 'w:' + w, ids: rules.weekIds(w) },
    ];
  }

  /** Монети клубу за квест (у транзакції). false — клубу немає. */
  function pay(playerId, period, id, c) {
    if (!q.hasClub.get(playerId)) return false;
    q.got.run(sec(), playerId, period, id);
    q.coins.run(c, sec(), playerId);
    ledger(playerId, c, `quest:${period}:${id}`);
    return true;
  }

  /** Незабране з минулих періодів: монети одразу, щоб нагорода не згоріла (як bank у грі). */
  function bank(playerId, cur) {
    const out = [];
    for (const r of q.old.all(playerId, cur[0].period, cur[1].period)) {
      const d = rules.questDef(r.id);
      if (d && r.p >= d.n && pay(playerId, r.period, r.id, d.c)) out.push({ t: d.t, c: d.c });
    }
    return out;
  }

  /** Квести для екрана хабу; banked — що щойно зараховано з минулих періодів. */
  function list(playerId) {
    const t = now(), cur = current(t);
    const banked = tx(db, () => bank(playerId, cur));
    const have = new Map(q.rows.all(playerId, cur[0].period, cur[1].period).map((r) => [r.period + '/' + r.id, r]));
    const left = rules.questsLeft(t);
    const part = (c) => ({
      period: c.period, left_ms: c.kind === 'day' ? left.day : left.week,
      list: c.ids.map((id) => {
        const d = rules.questDef(id), r = have.get(c.period + '/' + id);
        return d && { id, t: d.t, n: d.n, c: d.c, p: Math.min(d.n, r ? r.p : 0), got: !!(r && r.got_at != null) };
      }).filter(Boolean),
    });
    return { day: part(cur[0]), week: part(cur[1]), banked };
  }

  /**
   * Підтверджений дограний матч просуває квести (викликається всередині транзакції матчу).
   * report — з погляду гравця { me, opp, scorers }, heroes — склад із бази, рейтинги — до матчу. Повертає щойно виконані.
   */
  ctx.questsAfter = (playerId, report, heroes, myR, oppR) => {
    const facts = rules.factsOf(report, heroes, myR, oppR), done = [];
    for (const c of current()) {
      for (const id of c.ids) {
        const d = rules.questDef(id); if (!d) continue;
        const r = q.row.get(playerId, c.period, id), p = r ? r.p : 0;
        if (p >= d.n) continue;
        const add = rules.questStep(id, facts); if (!add) continue;
        const np = Math.min(d.n, p + add);
        q.put.run(playerId, c.period, id, np);
        if (np >= d.n) done.push({ period: c.period, id, t: d.t, c: d.c });
      }
    }
    return done;
  };

  const routes = {
    'GET /quests': (req) => list(auth(req).id),

    'POST /quests/claim': async (req) => {
      const p = auth(req);
      const b = await readJson(req);
      const period = String(b.period || ''), id = String(b.id || '');
      const d = rules.questDef(id);
      if (!d || !/^(d:\d{4}-\d{2}-\d{2}|w:\d{1,7})$/.test(period)) throw new HttpError(400, 'bad_quest');
      return tx(db, () => {
        const r = q.row.get(p.id, period, id);
        if (!r || r.p < d.n) throw new HttpError(409, 'not_done');
        if (r.got_at != null) throw new HttpError(409, 'claimed');
        if (!pay(p.id, period, id, d.c)) throw new HttpError(409, 'no_club');
        return { coins: d.c, total: q.hasClub.get(p.id).coins };
      });
    },
  };

  return { routes, list };
}
