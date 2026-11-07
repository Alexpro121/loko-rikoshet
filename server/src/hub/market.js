// Ринок готових героїв: вітрина дня на кожен клуб (правила й ціни — marketView, marketBuy, marketRefresh у грі).
// Зерно вітрини — непрозорий id гравця (HMAC секрету сервера), тож наперед її не вгадати; вітрина живе в клубі (mk).

export function marketRoutes(ctx, club) {
  const { db, rules, auth, readJson, HttpError, now, tx, ledger, pid } = ctx;
  const need = (id) => {
    const s = club.load(id);
    if (!s) throw new HttpError(409, 'no_club');
    s.bench = s.bench || [];
    return s;
  };
  const fail = (e) => { throw new HttpError(e === 'bad_slot' ? 400 : 409, e); };

  const routes = {
    // вітрина ліниво складається на новий день, тож і перегляд зберігає клуб
    'GET /market': (req) => {
      const p = auth(req);
      return tx(db, () => {
        const s = need(p.id), v = rules.marketView(s, pid(p.id), now());
        club.store(p.id, s);
        return v;
      });
    },
    'POST /market/buy': async (req) => {
      const p = auth(req);
      const b = await readJson(req);
      const slot = Number(b.slot);
      return tx(db, () => {
        const s = need(p.id), r = rules.marketBuy(s, pid(p.id), slot, now());
        if (r.error) fail(r.error);
        club.store(p.id, s);
        ledger(p.id, -r.price, 'market');
        return { coins: s.coins, hero: r.hero, bench: r.bench, price: r.price, club: club.out(club.load(p.id)) };
      });
    },
    // { iron: true } — за Iron Dollar (стала ціна, лічильник монетних оновлень не росте)
    'POST /market/refresh': async (req) => {
      const p = auth(req);
      const b = await readJson(req);
      const byIron = b.iron === true && rules.IRONOK;
      return tx(db, () => {
        const s = need(p.id), r = byIron ? rules.marketRefreshIron(s, pid(p.id), now()) : rules.marketRefresh(s, pid(p.id), now());
        if (r.error) fail(r.error);
        club.store(p.id, s);
        if (byIron) ctx.ironLedger(p.id, -r.iron, 'market_refresh'); else ledger(p.id, -r.price, 'market_refresh');
        return { coins: s.coins, iron: s.iron | 0, price: r.price || 0, iron_price: r.iron || 0, ...r.view };
      });
    },
  };
  return { routes };
}
