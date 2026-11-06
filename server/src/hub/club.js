// Клуб гравця на сервері: перше збереження переносить клуб із пристрою, далі сервер приймає лише вигляд і тактику,
// а монети, рейтинг, навички й досвід рахує сам (тренування, скаут, матчі). Формули беремо з гри (rules.js).

const IMPORT_COINS = 20000;               // захист від накрутки при перенесенні
const IMPORT_RATING = 2400;
const MAX_LVL = 99;
const MAX_COUNT = 1e6;
const HERO_ID = /^[A-Za-z0-9_-]{1,24}$/;

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
    const { imported, ...rest } = s;
    return rest;
  };

  /** Вигляд і склад із тіла запиту, почищені fromWire (назва, прапор, навички, ролі зі слотів). */
  function clean(body) {
    const c = body.club && typeof body.club === 'object' ? body.club : {};
    const hs = Array.isArray(body.heroes) ? body.heroes.slice(0, 11) : [];
    const w = rules.fromWire({ name: c.name, city: c.city, flag: c.flag, gk: c.gk, form: c.form, heroes: hs });
    return { w, hs };
  }

  /** Перший виклик: клуб пристрою з прогресом base у межах захисту від накрутки. */
  function importClub(body) {
    const { w, hs } = clean(body);
    const b = body.base && typeof body.base === 'object' ? body.base : {};
    const ids = new Set();
    const heroes = w.heroes.map((e, i) => {
      const h = hs[i] && typeof hs[i] === 'object' ? hs[i] : {};
      let id = typeof h.id === 'string' && HERO_ID.test(h.id) && !ids.has(h.id) ? h.id : '';
      while (!id || ids.has(id)) id = 'h' + Math.floor(Math.random() * 1e9).toString(36);
      ids.add(id);
      const lvl = int(h.lvl, 1, MAX_LVL, 1);
      return { ...e, id, lvl, xp: int(h.xp, 0, rules.xpNeed(lvl) - 1, 0), apps: int(h.apps, 0, MAX_COUNT, 0), goals: int(h.goals, 0, MAX_COUNT, 0) };
    });
    const lvl = int(b.lvl, 1, MAX_LVL, 1);
    const rec = b.rec && typeof b.rec === 'object' ? b.rec : {};
    return {
      v: 1, nm: 1, club: w.club, heroes,
      lvl, xp: int(b.xp, 0, rules.clubXpNeed(lvl) - 1, 0),
      coins: int(b.coins, 0, IMPORT_COINS, 300), rating: int(b.rating, 0, IMPORT_RATING, 1000),
      rec: { w: int(rec.w, 0, MAX_COUNT, 0), d: int(rec.d, 0, MAX_COUNT, 0), l: int(rec.l, 0, MAX_COUNT, 0) },
      goals: int(b.goals, 0, MAX_COUNT, 0), games: int(b.games, 0, MAX_COUNT, 0),
    };
  }

  /**
   * Наступні виклики: назва, місто, прапор, форма воротаря, схема й порядок героїв. Порядок приймаємо, лише якщо це ті самі
   * герої (за id) і воротар лишився на 0; навички, досвід і решта прогресу залишаються з бази.
   */
  function updateLooks(s, body) {
    const { w, hs } = clean(body);
    const byId = new Map(s.heroes.map((e) => [e.id, e]));
    const order = hs.map((h) => (h && typeof h === 'object' ? byId.get(h.id) : null));
    const same = order.length === 11 && order.every(Boolean) && new Set(order).size === 11 && order[0] === s.heroes[0];
    const heroes = same ? order : s.heroes;
    // ролі й лінії зі слотів нової схеми (як relabel у грі): fromWire над героями з бази
    const re = rules.fromWire({ form: w.club.form, heroes }).heroes;
    s.club = w.club;
    s.heroes = heroes.map((e, i) => ({ ...e, role: re[i].role, pos: re[i].pos, line: re[i].line }));
    return s;
  }

  const heroIdx = (v) => {
    const i = Number(v);
    if (!Number.isInteger(i) || i < 0 || i > 10) throw new HttpError(400, 'bad_hero');
    return i;
  };
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
      const h = rules.newHero(rules.slotsOf(s.club.form)[i], used, rar);
      h.num = s.heroes[i].num;
      s.heroes[i] = h; s.coins -= price;
      store(playerId, s);
      ledger(playerId, -price, reason);
      return { coins: s.coins, hero: h };
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
          const s = importClub(body);
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
      const i = heroIdx(body.hero), k = String(body.stat || '');
      return tx(db, () => {
        const s = need(p.id), e = s.heroes[i];
        if (!e || !Object.prototype.hasOwnProperty.call(e.stats, k)) throw new HttpError(400, 'bad_stat');
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
        const s = { ...c, imported: true };
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
      const P = kind !== 'scout' && Object.prototype.hasOwnProperty.call(rules.PACKS, kind) ? rules.PACKS[kind] : null;
      if (!P) throw new HttpError(400, 'bad_pack');
      return newcomer(p.id, i, P.price, rules.packRarity(kind), 'pack');
    };
  }

  return { routes, load, store, out };
}
