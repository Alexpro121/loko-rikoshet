// Клуб гравця на сервері: перше збереження переносить клуб із пристрою, далі сервер приймає лише вигляд і тактику,
// а монети, рейтинг, навички й досвід рахує сам (тренування, скаут, матчі). Формули беремо з гри (rules.js).

// Перенесення з пристрою: прогрес не більший, ніж дають заявлені матчі (localStorage можна наредагувати). Порушення
// обрізаємо й пишемо у flags як 'import'.
const IMPORT_COINS = 20000, COINS_PER_GAME = 200, START_COINS = 300;
const IMPORT_RATING = 2400, RATING_PER_GAME = 40, START_RATING = 1000;
const GOALS_PER_GAME = 15;
const STAT_SPREAD = 28;                   // свіжий герой: база рідкості + розкид і риса, не більше +28 (легенда до 90)
const MAX_LVL = 99;
const MAX_COUNT = 1e6;
const HERO_ID = /^[A-Za-z0-9_-]{1,24}$/;
const FIELD_LINES = ['D', 'M', 'W', 'F'], LINE_ROLE = { D: 'CB', M: 'CM', W: 'LW', F: 'ST' };
const ROLE = /^(LB|RB|CB|DM|CM|AM|LM|RM|LW|RW|ST)$/;
const isObj = (v) => !!v && typeof v === 'object';

const int = (v, a, b, d) => (Number.isFinite(+v) ? Math.min(b, Math.max(a, Math.round(+v))) : d);
const surname = (n) => String(n).split(' ').slice(-1)[0];

export function clubRoutes(ctx) {
  const { db, rules, auth, readJson, HttpError, sec, tx, ledger } = ctx;
  const q = {
    club: db.prepare('SELECT data, coins, rating, lvl, imported_at FROM clubs WHERE player_id = ?'),
    add: db.prepare('INSERT INTO clubs (player_id, data, coins, rating, lvl, updated_at, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    put: db.prepare('UPDATE clubs SET data = ?, coins = ?, rating = ?, lvl = ?, updated_at = ? WHERE player_id = ?'),
    imported: db.prepare('UPDATE clubs SET imported_at = ? WHERE player_id = ?'),
  };

  /** Клуб із бази як стан гри: { club, heroes, xp, rec, goals, games, coins, rating, lvl, imported }. */
  function load(id) {
    const row = q.club.get(id);
    if (!row) return null;
    return { ...JSON.parse(row.data), coins: row.coins, rating: row.rating, lvl: row.lvl, imported: row.imported_at != null };
  }
  function store(id, s) {
    const { coins, rating, lvl, imported, ...data } = s;
    q.put.run(JSON.stringify(data), coins, rating, lvl, sec(), id);
  }
  /** Відповідь клієнтові: формат, який приймає adoptServer у грі. */
  const out = (s) => {
    if (!s) return null;
    const { imported, mk, mark, ironGot, ...rest } = s;                         // вітрину ринку віддає GET /market, а не кожна відповідь клубу
    return rest;
  };

  /** Вигляд і склад із тіла запиту, почищені fromWire (назва, прапор, навички, ролі зі слотів). */
  function clean(body) {
    const c = body.club && typeof body.club === 'object' ? body.club : {};
    const hs = Array.isArray(body.heroes) ? body.heroes.slice(0, 11) : [];
    const w = rules.fromWire({ name: c.name, city: c.city, flag: c.flag, gk: c.gk, form: c.form, heroes: hs });
    return { w, hs };
  }

  /**
   * Перший виклик: клуб пристрою з прогресом base у межах заявлених матчів. Повертає { s, cut }: cut — що обрізано
   * ({ поле: [заявлено, прийнято] }), для журналу підозрілого.
   */
  function importClub(body) {
    const { w, hs } = clean(body);
    const b = body.base && typeof body.base === 'object' ? body.base : {};
    const cut = {};
    const lim = (name, v, max) => { if (v > max) { cut[name] = [v, max]; return max; } return v; };
    // матчі: w + d + l = games; зайве знімаємо з перемог, далі нічиїх; недостача зменшує games
    const r0 = b.rec && typeof b.rec === 'object' ? b.rec : {};
    const rec = { w: int(r0.w, 0, MAX_COUNT, 0), d: int(r0.d, 0, MAX_COUNT, 0), l: int(r0.l, 0, MAX_COUNT, 0) };
    let games = int(b.games, 0, MAX_COUNT, 0);
    const sum = rec.w + rec.d + rec.l;
    if (sum > games) {
      let over = sum - games;
      cut.rec = [{ ...rec }, null];
      for (const k of ['w', 'd', 'l']) { const t = Math.min(rec[k], over); rec[k] -= t; over -= t; }
      cut.rec[1] = { ...rec };
    } else if (sum < games) { cut.games = [games, sum]; games = sum; }
    const statMax = (rar) => Math.min(99, (rules.RARITY[rar] || rules.RARITY.c).base + STAT_SPREAD + games);
    const ids = new Set();
    let stats = 0;
    const hero = (e, h) => {
      let id = typeof h.id === 'string' && HERO_ID.test(h.id) && !ids.has(h.id) ? h.id : '';
      while (!id || ids.has(id)) id = 'h' + Math.floor(Math.random() * 1e9).toString(36);
      ids.add(id);
      const mx = statMax(e.rar);
      for (const k in e.stats) if (e.stats[k] > mx) { e.stats[k] = mx; stats++; }
      const lvl = int(h.lvl, 1, MAX_LVL, 1);
      return { ...e, id, lvl, xp: int(h.xp, 0, rules.xpNeed(lvl) - 1, 0), apps: Math.min(games, int(h.apps, 0, MAX_COUNT, 0)), goals: Math.min(GOALS_PER_GAME * games, int(h.goals, 0, MAX_COUNT, 0)) };
    };
    const heroes = w.heroes.map((e, i) => hero(e, isObj(hs[i]) ? hs[i] : {}));
    // лава (якщо гра її веде): ті самі межі, що й в основи
    // Iron Dollar з пристрою: не більше, ніж дають рівні клубу (IRON.lvl за рівень) і тижневі квести (≤ 3 за кожні 8 матчів);
    // спершу з цього бюджету йдуть куплені місця лави, решта — долари
    let slots = 0, iron = 0;
    if (rules.IRONOK) {
      let budget = rules.IRON.lvl * (int(b.lvl, 1, MAX_LVL, 1) - 1) + 3 * Math.floor(games / 8);
      const want = int(b.slots, 0, rules.SLOTS_MAX, 0);
      while (slots < want && budget >= rules.IRON.slot[slots]) budget -= rules.IRON.slot[slots++];
      iron = Math.min(int(b.iron, 0, MAX_COUNT, 0), budget);
      if (slots < want) cut.slots = [want, slots];
      if (int(b.iron, 0, MAX_COUNT, 0) > iron) cut.iron = [int(b.iron, 0, MAX_COUNT, 0), iron];
    }
    const bs = rules.SHOP && Array.isArray(body.bench) ? body.bench.filter(isObj).slice(0, rules.benchCap({ slots })) : [];
    const bench = bs.map((h) => hero(cleanBench(h), h));
    if (stats) cut.stats = [stats, 'навичок обрізано до бази рідкості + ' + STAT_SPREAD + ' + матчі'];
    const lvl = lim('lvl', int(b.lvl, 1, MAX_LVL, 1), 1 + Math.ceil(games / 2));
    const s = {
      v: 1, nm: 1, club: w.club, heroes, bench, pity: 0, iron, slots,
      lvl, xp: int(b.xp, 0, rules.clubXpNeed(lvl) - 1, 0),
      coins: lim('coins', int(b.coins, 0, MAX_COUNT, START_COINS), Math.min(IMPORT_COINS, START_COINS + COINS_PER_GAME * games)),
      rating: lim('rating', int(b.rating, 0, MAX_COUNT, START_RATING), Math.min(IMPORT_RATING, START_RATING + RATING_PER_GAME * games)),
      rec, goals: lim('goals', int(b.goals, 0, MAX_COUNT, 0), GOALS_PER_GAME * games), games,
    };
    return { s, cut };
  }

  /**
   * Наступні виклики: назва, місто, прапор, форма воротаря, схема й порядок героїв. Порядок приймаємо, лише якщо це ті самі
   * герої (за id) і воротар лишився на 0; навички, досвід і решта прогресу залишаються з бази.
   */
  function updateLooks(s, body) {
    const { w, hs } = clean(body);
    const list = all(s), byId = new Map(list.map((e) => [e.id, e]));
    const pick = (h) => (isObj(h) ? byId.get(h.id) : null);
    const order = hs.map(pick);
    let heroes = s.heroes;
    if (rules.SHOP && Array.isArray(body.bench)) {
      // склад разом із лавою: ті самі герої (за id), воротар на 0 і лише там (lineupOk гри)
      const bench = body.bench.slice(0, rules.BENCH_MAX + 1).map(pick);
      const got = [...order, ...bench];
      if (got.every(Boolean) && new Set(got).size === list.length && got.length === list.length && rules.lineupOk(order, bench, rules.benchCap(s))) { heroes = order; s.bench = bench; }
    } else {
      const same = order.length === 11 && order.every(Boolean) && new Set(order).size === 11 && order[0] === s.heroes[0];
      if (same) heroes = order;
    }
    // ролі й лінії зі слотів нової схеми (як relabel у грі): fromWire над героями з бази
    const re = rules.fromWire({ form: w.club.form, heroes }).heroes;
    s.club = w.club;
    s.heroes = heroes.map((e, i) => ({ ...e, role: re[i].role, pos: re[i].pos, line: re[i].line }));
    return s;
  }

  const heroIdx = (v, max = 10) => {
    const i = Number(v);
    if (!Number.isInteger(i) || i < 0 || i > max) throw new HttpError(400, 'bad_hero');
    return i;
  };
  const all = (s) => [...s.heroes, ...(s.bench || [])];
  /**
   * Герой із лави з мережі: чистить той самий fromWire (воротар — як слот 0, польовий — як слот 1), а лінію й роль
   * лишаємо його власні, бо на лаві слота немає. Воротар — за навичками («Ловля»), як isKeeper у грі.
   */
  function cleanBench(h) {
    const gk = isObj(h) && isObj(h.stats) && 'hands' in h.stats;
    const e = rules.fromWire({ heroes: gk ? [h] : [{}, h] }).heroes[gk ? 0 : 1];
    const line = gk ? 'G' : FIELD_LINES.includes(h.line) ? h.line : 'M';
    const role = gk ? 'GK' : ROLE.test(h.role) ? h.role : LINE_ROLE[line];
    return { ...e, line, role, pos: role };
  }
  const need = (id) => {
    const s = load(id);
    if (!s) throw new HttpError(409, 'no_club');
    return s;
  };

  /** Новий герой на слот i за price монет (скаут чи пак): номер слота лишається, ім'я не повторює решти складу (як scoutHero у грі). */
  function newcomer(playerId, i, price, rar, reason) {
    return tx(db, () => {
      const s = need(playerId);
      if (s.coins < price) throw new HttpError(409, 'no_coins');
      const used = new Set(s.heroes.flatMap((e, j) => (j === i ? [] : [surname(e.name), 'f:' + e.name.split(' ')[0]])));
      const hairs = new Set([...s.heroes.filter((e, j) => j !== i), ...(s.bench || [])].map((e) => e.hair));
      const h = rules.newHero(rules.slotsOf(s.club.form)[i], used, rar, hairs);
      h.num = s.heroes[i].num;
      s.heroes[i] = h; s.coins -= price;
      store(playerId, s);
      ledger(playerId, -price, reason);
      return { coins: s.coins, hero: h, wagon: rules.wagonOf(h) };
    });
  }

  const routes = {
    'POST /club/save': async (req) => {
      const p = auth(req);
      const body = await readJson(req);
      return tx(db, () => {
        const have = load(p.id);
        // клуб, створений POST /club і ще не зіграний, замінює клуб із пристрою
        const fresh = !have || (!have.imported && !have.games);
        if (fresh) {
          const { s, cut } = importClub(body);
          if (Object.keys(cut).length) ctx.flag(p.id, 'import', cut);
          const { coins, rating, lvl, ...data } = s;
          if (have) { store(p.id, s); q.imported.run(sec(), p.id); } else q.add.run(p.id, JSON.stringify(data), coins, rating, lvl, sec(), sec());
          ledger(p.id, coins - (have ? have.coins : 0), 'import');
          return { club: out(load(p.id)), imported: true };
        }
        const s = updateLooks(have, body);
        store(p.id, s);
        if (!have.imported) q.imported.run(sec(), p.id);
        return { club: out(load(p.id)), imported: false };
      });
    },

    'POST /club/train': async (req) => {
      const p = auth(req);
      const body = await readJson(req);
      const i = heroIdx(body.hero, 10 + (rules.BENCH_MAX || 0)), k = String(body.stat || '');   // BENCH_MAX — межа будь-якої лави
      return tx(db, () => {
        const s = need(p.id), L = all(s);
        // id героя (якщо є) важливіший за номер: склад міг змінитись на пристрої, а збереження ще не дійшло
        const e = typeof body.id === 'string' ? L.find((x) => x.id === body.id) : L[i];
        if (!e) throw new HttpError(400, 'bad_hero');
        if (!Object.prototype.hasOwnProperty.call(e.stats, k)) throw new HttpError(400, 'bad_stat');
        const v = e.stats[k];
        if (v >= 99) throw new HttpError(409, 'max');
        const c = rules.trainPrice(v);
        if (s.coins < c) throw new HttpError(409, 'no_coins');
        s.coins -= c; e.stats[k] = v + 1;
        store(p.id, s);
        ledger(p.id, -c, 'train');
        return { coins: s.coins, hero: e };
      });
    },

    'POST /club/scout': async (req) => {
      const p = auth(req);
      const body = await readJson(req);
      return newcomer(p.id, heroIdx(body.hero), rules.SCOUT_PRICE, undefined, 'scout');
    },

    // «Новий випадковий клуб»: клуб за правилами гри; квести (окрема таблиця) не скидаються
    'POST /club/reset': (req) => {
      const p = auth(req);
      return tx(db, () => {
        const have = load(p.id);
        const c = ctx.newClub();
        // вітрина дня, Iron Dollar і куплені місця лави лишаються: це не клуб, а гаманець гравця
        const s = { ...c, imported: true, ...(have && have.mk ? { mk: have.mk } : {}), ...(have ? { iron: have.iron | 0, slots: have.slots | 0 } : {}) };   // вітрина дня лишається: скидання не дає купити її вдруге
        if (have) store(p.id, s);
        else { const { coins, rating, lvl, ...data } = c; q.add.run(p.id, JSON.stringify(data), coins, rating, lvl, sec(), sec()); }
        q.imported.run(sec(), p.id);
        ledger(p.id, c.coins - (have ? have.coins : 0), 'reset');
        return { club: out(load(p.id)) };
      });
    },
  };

  // магазин: рідкісний і епічний паки (скаут — окремий маршрут); ціни й шанси з PACKS гри
  if (rules.PACKS) {
    routes['POST /club/pack'] = async (req) => {
      const p = auth(req);
      const body = await readJson(req);
      const i = heroIdx(body.hero), kind = String(body.pack || '');
      const P = kind !== 'scout' && Object.prototype.hasOwnProperty.call(rules.PACKS, kind) && rules.PACKS[kind].price ? rules.PACKS[kind] : null;   // золотий вагон (за долари) — лише /club/buy
      if (!P) throw new HttpError(400, 'bad_pack');
      return newcomer(p.id, i, P.price, rules.packRarity(kind), 'pack');
    };
  }

  // магазин і лава (частина 'shop'): пак кладе новачка на лаву, продаж — лише з лави; правила й ціни з гри (packInto, sellFrom)
  if (rules.SHOP) {
    const fail = (r) => { throw new HttpError(r.error === 'no_coins' || r.error === 'no_iron' || r.error === 'bench_full' ? 409 : 400, r.error); };
    routes['POST /club/buy'] = async (req) => {
      const p = auth(req);
      const body = await readJson(req);
      const i = body.hero == null ? null : heroIdx(body.hero), kind = String(body.pack || '');   // без hero позицію обирає правило гри
      if (!Object.prototype.hasOwnProperty.call(rules.PACKS, kind)) throw new HttpError(400, 'bad_pack');
      return tx(db, () => {
        const s = need(p.id);
        s.bench = s.bench || [];
        const r = rules.packInto(s, kind, i);
        if (r.error) fail(r);
        store(p.id, s);
        ledger(p.id, -r.price, kind === 'scout' ? 'scout' : 'pack');
        if (r.iron) ctx.ironLedger(p.id, -r.iron, kind);                  // золотий вагон — за Iron Dollar
        return { coins: s.coins, hero: r.hero, bench: r.bench, pity: r.pity, wagon: r.wagon, club: out(load(p.id)) };
      });
    };
    routes['POST /club/sell'] = async (req) => {
      const p = auth(req);
      const body = await readJson(req);
      const id = String(body.id || '');
      return tx(db, () => {
        const s = need(p.id), B = s.bench || [];
        const j = B.findIndex((e) => e.id === id);
        if (j < 0) throw new HttpError(409, s.heroes.some((e) => e.id === id) ? 'not_bench' : 'bad_hero');
        const r = rules.sellFrom(s, j);
        if (r.error) fail(r);
        store(p.id, s);
        ledger(p.id, r.gain, 'sell');
        return { coins: s.coins, gain: r.gain, club: out(load(p.id)) };
      });
    };
  }

  return { routes, load, store, out };
}
