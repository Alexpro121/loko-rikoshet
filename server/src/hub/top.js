// Таблиця рейтингу для хабу: лише клуби, що є в грі (перенесені з пристрою чи створені «Новий клуб»), без забанених.
// Клуб, створений POST /club і ні разу не відкритий у грі, у таблицю не потрапляє.

const LIMIT = 50, LIMIT_MAX = 100;

export function topRoutes(ctx) {
  const { db, auth } = ctx;
  const q = {
    top: db.prepare(`SELECT c.data, c.rating, c.lvl FROM clubs c JOIN players p ON p.id = c.player_id
      WHERE p.banned = 0 AND c.imported_at IS NOT NULL ORDER BY c.rating DESC, c.lvl DESC, c.updated_at ASC LIMIT ?`),
    mine: db.prepare('SELECT rating, imported_at FROM clubs WHERE player_id = ?'),
    above: db.prepare(`SELECT COUNT(*) AS n FROM clubs c JOIN players p ON p.id = c.player_id
      WHERE p.banned = 0 AND c.imported_at IS NOT NULL AND c.rating > ?`),
  };

  /** Місце гравця в таблиці (однаковий рейтинг — однакове місце) або null, якщо його клубу в таблиці немає. */
  function rank(playerId) {
    const r = q.mine.get(playerId);
    return r && r.imported_at != null ? q.above.get(r.rating).n + 1 : null;
  }

  const routes = {
    'GET /top': (req, _ip, url) => {
      const p = auth(req);
      const n = Math.min(LIMIT_MAX, Math.max(1, Number(url.searchParams.get('limit')) || LIMIT));
      const list = q.top.all(n).map((r, i) => {
        const d = JSON.parse(r.data), rec = d.rec || {};
        return { place: i + 1, name: (d.club && d.club.name) || '', flag: (d.club && d.club.flag) || null, rating: r.rating, lvl: r.lvl, w: rec.w | 0, d: rec.d | 0, l: rec.l | 0 };
      });
      const me = q.mine.get(p.id);
      return { list, me: me && me.imported_at != null ? { place: rank(p.id), rating: me.rating } : null };
    },
  };

  return { routes, rank };
}
