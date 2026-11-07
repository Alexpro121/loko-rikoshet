// Iron Dollar на сервері: товари за доларами (місце лави, мішок монет, нова риса), тижнева нагорода за рейтинг і
// Telegram Stars. Правила й ціни — з гри (buySlot, ironBag, traitReroll, IRON_TOP, STARS у src/online/profile.js).
// Долари живуть у клубі (data.iron), кожна зміна пише рядок у iron_ledger. Платіж зірками записується рівно раз
// за telegram_payment_charge_id (таблиця stars_payments) і ніколи не губиться: або долари за умовами виданого рахунку
// (stars_invoices — діють, навіть якщо пакет потім змінили чи прибрали), або повернення зірок (refundStarPayment),
// а якщо й воно не вдалось — статус owed для власника.

const PAYLOAD = /^iron:(\d{1,15}):([a-z0-9]{1,16}):[A-Za-z0-9_-]{4,16}$/;

export function ironRoutes(ctx, club) {
  const { db, rules, auth, readJson, HttpError, sec, now, tx, ledger, ironLedger } = ctx;
  const q = {
    top: db.prepare(`SELECT c.player_id FROM clubs c JOIN players p ON p.id = c.player_id
      WHERE p.banned = 0 AND c.imported_at IS NOT NULL ORDER BY c.rating DESC, c.lvl DESC, c.updated_at ASC LIMIT ?`),
    kvGet: db.prepare('SELECT v FROM kv WHERE k = ?'),
    kvSet: db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'),
    inv: db.prepare('INSERT OR IGNORE INTO stars_invoices (payload, player_id, pack, stars, iron, at) VALUES (?, ?, ?, ?, ?, ?)'),
    invGet: db.prepare('SELECT player_id, pack, stars, iron FROM stars_invoices WHERE payload = ?'),
    paid: db.prepare(`INSERT OR IGNORE INTO stars_payments (charge_id, player_id, payer, pack, stars, iron, status, note, at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    status: db.prepare("UPDATE stars_payments SET status = ?, note = ? WHERE charge_id = ? AND status = 'refund'"),
    stuck: db.prepare("SELECT charge_id, payer, note FROM stars_payments WHERE status = 'refund' AND at < ? LIMIT 20"),
  };
  const need = (id) => {
    const s = club.load(id);
    if (!s) throw new HttpError(409, 'no_club');
    s.bench = s.bench || [];
    return s;
  };
  const fail = (e) => { throw new HttpError(e === 'bad_hero' ? 400 : 409, e); };
  /** Додати долари клубу (у транзакції) з поясненням для гравця (ironGot показує екран). */
  function grant(playerId, n, reason, why) {
    const s = club.load(playerId); if (!s || !n) return false;
    s.iron = (s.iron | 0) + n;
    if (why) s.ironGot = [...(Array.isArray(s.ironGot) ? s.ironGot : []), { why, n }].slice(-20);
    club.store(playerId, s); ironLedger(playerId, n, reason);
    return true;
  }

  const routes = {
    'POST /iron/slot': (req) => {
      const p = auth(req);
      return tx(db, () => {
        const s = need(p.id), r = rules.buySlot(s);
        if (r.error) fail(r.error);
        club.store(p.id, s); ironLedger(p.id, -r.price, 'slot');
        return { slots: r.slots, price: r.price, club: club.out(club.load(p.id)) };
      });
    },
    'POST /iron/bag': (req) => {
      const p = auth(req);
      return tx(db, () => {
        const s = need(p.id), r = rules.ironBag(s);
        if (r.error) fail(r.error);
        club.store(p.id, s); ironLedger(p.id, -r.price, 'bag'); ledger(p.id, r.coins, 'iron_bag');
        return { coins: r.coins, price: r.price, club: club.out(club.load(p.id)) };
      });
    },
    // нова риса героя за id (не за номером: склад на пристрої міг змінитись, а збереження ще не дійшло)
    'POST /iron/trait': async (req) => {
      const p = auth(req);
      const b = await readJson(req);
      const id = String(b.hero || '');
      return tx(db, () => {
        const s = need(p.id), i = [...s.heroes, ...s.bench].findIndex((e) => e.id === id);
        if (i < 0) fail('bad_hero');
        const r = rules.traitReroll(s, i);
        if (r.error) fail(r.error);
        club.store(p.id, s); ironLedger(p.id, -r.price, 'trait');
        return { hero: r.hero, price: r.price, club: club.out(club.load(p.id)) };
      });
    },
  };

  /**
   * Тижнева нагорода за рейтинг: з першою перевіркою нового тижня (понеділок 00:00 за Києвом) топ отримує IRON_TOP.
   * Тиждень — номер дня понеділка (questPeriods). Перший запуск лише запам'ятовує тиждень, нічого не роздаючи.
   */
  function weekly(t = now()) {
    const w = rules.questPeriods(t).w, was = q.kvGet.get('iron_week');
    if (!was) { q.kvSet.run('iron_week', String(w)); return 0; }
    if (+was.v >= w) return 0;
    const max = rules.IRON_TOP[rules.IRON_TOP.length - 1].to;
    return tx(db, () => {
      if (+q.kvGet.get('iron_week').v >= w) return 0;               // друга перевірка вже роздала
      let n = 0;
      q.top.all(max).forEach((row, i) => { const k = rules.ironForPlace(i + 1); if (k && grant(row.player_id, k, `top:${w - 7}`, { top: i + 1 })) n++; });
      q.kvSet.run('iron_week', String(w));
      return n;
    });
  }

  // ------------------------------------------------------------------ Telegram Stars
  const pack = (id) => rules.STARS.find((x) => x.id === id) || null;
  /**
   * Умови платежу за payload і сумою: записані при видачі рахунку (stars_invoices), а для рахунку без запису — поточний
   * пакет STARS. null — рахунок невідомий, сума не та чи payload чужий: такий платіж не зараховуємо, а повертаємо.
   */
  function terms(payload, total) {
    const m = PAYLOAD.exec(String(payload || ''));
    if (!m) return null;
    const inv = q.invGet.get(String(payload));
    if (inv) return inv.stars === total && inv.player_id === +m[1] ? { uid: inv.player_id, pack: inv.pack, stars: inv.stars, iron: inv.iron } : null;
    const P = pack(m[2]);
    return P && P.stars === total ? { uid: +m[1], pack: P.id, stars: P.stars, iron: P.iron } : null;
  }
  /** Чи можна приймати цей платіж (pre_checkout_query): умови відомі, валюта XTR, платить той самий гравець, клуб є. */
  function check(pq) {
    const t = pq.currency === 'XTR' ? terms(pq.invoice_payload, pq.total_amount) : null;
    if (!t || String(pq.from && pq.from.id) !== String(t.uid)) return 'Рахунок застарів, відкрий магазин у грі ще раз';
    if (!club.load(t.uid)) return 'Спершу відкрий онлайн-клуб у грі';
    return null;
  }
  /**
   * Успішний платіж: рівно один рядок у stars_payments за charge id, і гроші гравця не губляться ніколи.
   * Умови відомі й клуб є → долари (iron_ledger, ironGot). Інакше (клубу немає, рахунок невідомий, сума не та) →
   * повернення зірок платникові. Повернення не вдалось → статус owed: його бачить власник. Повернення, що застрягло
   * між записом і викликом Telegram (процес упав), повторює sweep. Відповідь: { status: paid | refunded | owed | dup | none }.
   */
  async function credit(msg) {
    const sp = msg.successful_payment || {}, charge = String(sp.telegram_payment_charge_id || '');
    if (!charge) return { status: 'none' };                       // без номера ні зарахувати, ні повернути: лише лог бота
    const payer = Number(msg.from && msg.from.id) || Number(msg.chat && msg.chat.id) || 0;
    const t = sp.currency === 'XTR' ? terms(sp.invoice_payload, sp.total_amount) : null;
    const m = PAYLOAD.exec(String(sp.invoice_payload || ''));
    const uid = t ? t.uid : m ? +m[1] : payer, stars = Number.isInteger(sp.total_amount) ? sp.total_amount : 0;
    const r = tx(db, () => {
      const ok = !!(t && club.load(uid)), why = !t ? 'terms' : ok ? '' : 'no_club';
      const packId = t ? t.pack : m ? m[2] : '?';
      if (!q.paid.run(charge, uid, payer || uid, packId, stars, ok ? t.iron : 0, ok ? 'paid' : 'refund', why, sec()).changes) return { status: 'dup' };
      if (!ok) return { status: 'refund', why };
      grant(uid, t.iron, `stars:${charge}`, { stars });
      return { status: 'paid', iron: t.iron };
    });
    if (r.status !== 'refund') return r;
    return { status: await refund(charge, payer || uid, r.why), why: r.why };
  }
  /** Повернути зірки платникові. Уже повернений Telegram платіж — теж успіх (повтор після падіння процесу). */
  async function refund(charge, payer, why) {
    let ok = false, err = '';
    try { ok = !!(ctx.bot && ctx.bot.refund && (await ctx.bot.refund(payer, charge))); } catch (e) {
      err = String((e && e.message) || e).slice(0, 200);
      ok = /ALREADY_REFUNDED/i.test(err);
    }
    if (!ok && !err) err = 'no_refund';
    q.status.run(ok ? 'refunded' : 'owed', why + (err && !ok ? ': ' + err : ''), charge);
    return ok ? 'refunded' : 'owed';
  }
  /** sweep: повернення, що застрягли між записом і викликом Telegram (процес упав), старші за хвилину. */
  async function retryRefunds(t = now()) {
    let n = 0;
    for (const r of q.stuck.all(Math.floor(t / 1000) - 60)) if ((await refund(r.charge_id, r.payer, r.note || 'retry')) === 'refunded') n++;
    return n;
  }
  /** Посилання на рахунок: payload несе гравця й пакет, ціну Telegram бере з prices, а умови пишуться в stars_invoices. */
  async function invoice(playerId, id) {
    const P = pack(id);
    if (!P) throw new HttpError(400, 'bad_pack');
    if (!ctx.bot || !ctx.bot.invoice) throw new HttpError(404, 'no_bot');
    const nonce = Math.random().toString(36).slice(2, 10), payload = `iron:${playerId}:${P.id}:${nonce}`;
    q.inv.run(payload, playerId, P.id, P.stars, P.iron, sec());   // рахунок оплатять і після зміни STARS: діють ці умови
    const link = await ctx.bot.invoice({ title: `${P.iron} Iron Dollar`, description: `Iron Dollar для онлайн-клубу LOKO RUSH: ${P.iron}`, payload, stars: P.stars });
    if (!link) throw new HttpError(502, 'telegram');
    return { link };
  }
  const starsRoutes = {
    'POST /stars/invoice': async (req) => {
      const p = auth(req);
      const b = await readJson(req);
      if (!club.load(p.id)) throw new HttpError(409, 'no_club');
      return invoice(p.id, String(b.pack || ''));
    },
  };

  /** Що показати гравцеві в /me: нараховані долари (рейтинг, зірки) з минулого разу; показ їх знімає. */
  function takeGot(playerId) {
    const s = club.load(playerId);
    if (!s || !Array.isArray(s.ironGot) || !s.ironGot.length) return [];
    const got = s.ironGot; s.ironGot = []; club.store(playerId, s);
    return got;
  }

  return { routes, starsRoutes, weekly, check, credit, retryRefunds, takeGot };
}
