// Онлайн-хаб (API 2): два клієнти проходять перенесення клубу, старт матчу, звіти й бачать монети, Ело, квести, чергу й таблицю.
// Квести перевіряються, коли src/online/quests.js є в гілці; до того їх можна підставити з іншої копії гри:
// LOKO_QUESTS=шлях/до/src/online/quests.js npm test. Так само паки магазину: LOKO_PACKS=шлях/до/src/online/profile.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { signInitData } from '../src/telegram.js';
import * as baseRules from '../src/rules.js';
import { ALONE_SEC, SETTLE_SEC, PAIR_SEC, PAIR_DAY, MIN_REPORT_SEC } from '../src/hub/match.js';

const BOT = '123456:TEST-TOKEN';
const ORIGIN = 'https://alexpro121.github.io';
const NOW = 1_800_000_000;

let rules = baseRules;
if (!rules.QUESTS && process.env.LOKO_QUESTS) {
  const m = await import(pathToFileURL(process.env.LOKO_QUESTS).href);
  rules = { ...baseRules, QUESTS: true, questPeriods: m.questPeriods, questsLeft: m.questsLeft, dayIds: m.dayIds, weekIds: m.weekIds, questDef: m.questDef, questStep: m.questStep, factsOf: m.factsOf };
}

if (!rules.PACKS && process.env.LOKO_PACKS) {
  const m = await import(pathToFileURL(process.env.LOKO_PACKS).href);
  rules = { ...rules, PACKS: m.PACKS, packRarity: m.packRarity };
}

const initData = (id, name) => signInitData({ auth_date: String(NOW), query_id: 'q', user: JSON.stringify({ id, first_name: name, username: 'u' + id }) }, BOT);

async function start() {
  const db = openDb(':memory:');
  const clock = { ms: NOW * 1000 };
  const config = { botToken: BOT, origins: [ORIGIN], turnSecret: '', turnUrls: [], behindProxy: false };
  const app = createApp({ db, config, newClub: rules.newClub, rules, now: () => clock.ms, queueWaitMs: 300 });
  const srv = createServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, path, body, token) => {
    const headers = { 'Content-Type': 'application/json', Origin: ORIGIN };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  const login = async (id, name) => (await call('POST', '/auth/telegram', { initData: initData(id, name) })).body.token;
  const tick = (s) => { clock.ms += s * 1000; };
  return { db, app, call, login, tick, close: () => new Promise((r) => srv.close(r)) };
}

/** Клуб пристрою в форматі toServer() гри. */
function device(over = {}) {
  const c = rules.newClub();
  return {
    club: { name: c.club.name, city: c.club.city, flag: c.club.flag, gk: c.club.gk, form: c.club.form },
    heroes: c.heroes.map((e) => ({ name: e.name, num: e.num, role: e.role, line: e.line, stats: e.stats, skin: e.skin, hair: e.hair, hairCol: e.hairCol, beard: e.beard, rar: e.rar, trait: e.trait, id: e.id, xp: e.xp, lvl: e.lvl, apps: e.apps, goals: e.goals })),
    base: { coins: 500, rating: 1000, lvl: 1, xp: 0, rec: { w: 10, d: 5, l: 5 }, goals: 0, games: 20, ...over },   // 20 матчів: межі перенесення не заважають
  };
}
const ledger = (db, id) => db.prepare('SELECT delta, reason FROM coin_ledger WHERE player_id = ? ORDER BY id').all(id).map((r) => [r.delta, r.reason]);
const sumLedger = (db, id) => ledger(db, id).reduce((a, [d]) => a + d, 0);

test('health перелічує частини хабу', async () => {
  const s = await start();
  try {
    const h = (await s.call('GET', '/health')).body;
    assert.equal(h.api, 2);
    assert.deepEqual(h.features, ['club', 'match', ...(rules.QUESTS ? ['quests'] : []), 'queue', 'top', ...(rules.SHOP ? ['shop'] : [])]);
  } finally { await s.close(); }
});

test('клуб: перенесення з межами, далі лише вигляд і порядок героїв, тренування, скаут, новий клуб', async () => {
  const s = await start();
  try {
    const t = await s.login(1, 'Аня');
    // накрутка в localStorage: межі відносно заявлених матчів, порушення обрізаються й пишуться у flags
    const dev = device({ coins: 999999, rating: 5000, lvl: 50, goals: 900, games: 10, rec: { w: 30, d: 0, l: 0 } });
    dev.heroes[3].stats.pace = 400; dev.heroes[3].rar = 'c'; dev.heroes[3].lvl = 500; dev.heroes[3].xp = 1e9;
    const first = await s.call('POST', '/club/save', dev, t);
    assert.equal(first.status, 200);
    const c = first.body.club;
    assert.equal(c.games, 10); assert.deepEqual(c.rec, { w: 10, d: 0, l: 0 });
    assert.equal(c.coins, 300 + 200 * 10); assert.equal(c.rating, 1000 + 40 * 10);
    assert.equal(c.lvl, 1 + 5); assert.equal(c.goals, 150);
    assert.equal(c.heroes[3].stats.pace, rules.RARITY.c.base + 28 + 10); assert.equal(c.heroes[3].lvl, 99);
    assert.ok(c.heroes[3].xp < rules.xpNeed(99));
    assert.deepEqual(c.heroes.map((e) => e.id), dev.heroes.map((e) => e.id));
    for (const k of ['club', 'heroes', 'xp', 'rec', 'goals', 'games', 'coins', 'rating', 'lvl']) assert.ok(k in c, k);
    assert.deepEqual(ledger(s.db, 1), [[2300, 'import']]);
    const fl = s.db.prepare("SELECT kind, json FROM flags WHERE player_id = 1").all();
    assert.equal(fl.length, 1); assert.equal(fl[0].kind, 'import');
    for (const k of ['coins', 'rating', 'lvl', 'goals', 'rec', 'stats']) assert.ok(k in JSON.parse(fl[0].json), k);
    // чесний свіжий клуб нічого не втрачає (легенда до 90 навичок)
    const tf = await s.login(5, 'Чесний'), honest = device({ coins: 300, games: 0, rec: { w: 0, d: 0, l: 0 } });
    const got = (await s.call('POST', '/club/save', honest, tf)).body.club;
    assert.deepEqual(got.heroes.map((e) => e.stats), honest.heroes.map((e) => e.stats));
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM flags WHERE player_id = 5').get().n, 0);

    // другий виклик: base і навички ігноруються, обмін польових героїв приймається, назва змінюється
    const next = device({ coins: 1 });
    next.club.name = 'НОВІ'; next.club.form = '442';
    const sw = structuredClone(c.heroes);
    [sw[1], sw[2]] = [sw[2], sw[1]];
    sw[5].stats.pace = 99;
    const upd = (await s.call('POST', '/club/save', { ...next, heroes: sw }, t)).body.club;
    assert.equal(upd.club.name, 'НОВІ'); assert.equal(upd.club.form, '442');
    assert.equal(upd.coins, 2300);
    assert.deepEqual(upd.heroes.map((e) => e.id), sw.map((e) => e.id));
    assert.equal(upd.heroes[5].stats.pace, c.heroes[5].stats.pace);
    assert.deepEqual(upd.heroes.map((e) => e.role), rules.slotsOf('442').map((x) => x.name));

    // підміна героя чи воротар не на 0: порядок лишається серверний
    const fake = upd.heroes.map((e) => ({ ...e })); fake[4] = { ...fake[4], id: 'чужий' };
    assert.deepEqual((await s.call('POST', '/club/save', { ...next, heroes: fake }, t)).body.club.heroes.map((e) => e.id), upd.heroes.map((e) => e.id));
    const gk = upd.heroes.map((e) => ({ ...e })); [gk[0], gk[1]] = [gk[1], gk[0]];
    assert.deepEqual((await s.call('POST', '/club/save', { ...next, heroes: gk }, t)).body.club.heroes.map((e) => e.id), upd.heroes.map((e) => e.id));

    const v = upd.heroes[2].stats.shoot;
    const tr = (await s.call('POST', '/club/train', { hero: 2, stat: 'shoot' }, t)).body;
    assert.equal(tr.hero.stats.shoot, v + 1);
    assert.equal(tr.coins, 2300 - rules.trainPrice(v));
    assert.equal((await s.call('POST', '/club/train', { hero: 16, stat: 'shoot' }, t)).body.error, 'bad_hero');
    assert.equal((await s.call('POST', '/club/train', { hero: 11, stat: 'shoot' }, t)).body.error, 'bad_hero');   // лава порожня

    const sc = (await s.call('POST', '/club/scout', { hero: 7 }, t)).body;
    assert.equal(sc.coins, tr.coins - rules.SCOUT_PRICE);
    assert.equal(sc.hero.num, upd.heroes[7].num);
    assert.notEqual(sc.hero.id, upd.heroes[7].id);
    assert.equal(sumLedger(s.db, 1), sc.coins);

    const rs = (await s.call('POST', '/club/reset', {}, t)).body.club;
    assert.equal(rs.coins, 300); assert.equal(rs.rating, 1000);
    assert.equal(sumLedger(s.db, 1), 300);

    // бідний клуб не тренується
    const t2 = await s.login(2, 'Бо');
    await s.call('POST', '/club/save', device({ coins: 0 }), t2);
    assert.equal((await s.call('POST', '/club/train', { hero: 1, stat: 'pace' }, t2)).body.error, 'no_coins');
    assert.equal((await s.call('POST', '/club/scout', { hero: 1 }, t2)).body.error, 'no_coins');
  } finally { await s.close(); }
});

/** Господар відкриває матч, гість приходить за квитком; play — пройшов час матчу (звіт раніше — розбіжність). */
async function pair(s, code = 'ABCDE', mode = 'friend', play = true) {
  const h = await s.call('POST', '/match/start', { code, role: 'host', mode }, s.th);
  assert.match(h.body.ticket, /^[A-Za-z0-9_-]{16,64}$/);
  const g = await s.call('POST', '/match/start', { role: 'guest', mode, ticket: h.body.ticket }, s.tg);
  assert.equal(h.body.matchId, g.body.matchId);
  if (play) s.tick(MIN_REPORT_SEC);
  return h.body.matchId;
}
async function two(s) {
  s.th = await s.login(10, 'Господар'); s.tg = await s.login(20, 'Гість');
  s.ch = (await s.call('POST', '/club/save', device({ rating: 1100 }), s.th)).body.club;
  s.cg = (await s.call('POST', '/club/save', device({ rating: 1000 }), s.tg)).body.club;
}
const surname = (n) => n.split(' ').slice(-1)[0];

test('матч за квитком: код кімнати нічого не дає, квиток одноразовий, гість не може бути господарем', async () => {
  const s = await start();
  try {
    await two(s);
    const t3 = await s.login(30, 'Чужий');
    await s.call('POST', '/club/save', device(), t3);
    const h = (await s.call('POST', '/match/start', { code: 'ABCDE', role: 'host', mode: 'friend' }, s.th)).body;
    // за кодом без квитка не зайти
    assert.equal((await s.call('POST', '/match/start', { code: 'ABCDE', role: 'guest', mode: 'friend' }, t3)).body.error, 'bad_ticket');
    assert.equal((await s.call('POST', '/match/start', { role: 'guest', ticket: 'x'.repeat(24) }, t3)).body.error, 'bad_ticket');
    assert.equal((await s.call('POST', '/match/start', { role: 'guest', ticket: h.ticket }, s.th)).body.error, 'self');
    // квиток у базі лише хешем
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM matches WHERE ticket_hash = ?').get(h.ticket).n, 0);
    const g = (await s.call('POST', '/match/start', { role: 'guest', ticket: h.ticket }, s.tg)).body;
    assert.equal(g.matchId, h.matchId);
    // реконект того самого гостя — той самий матч; чужий з тим самим квитком — відмова
    assert.equal((await s.call('POST', '/match/start', { role: 'guest', ticket: h.ticket }, s.tg)).body.matchId, h.matchId);
    assert.equal((await s.call('POST', '/match/start', { role: 'guest', ticket: h.ticket }, t3)).body.error, 'bad_ticket');
    // квиток живе PAIR_SEC; повтор старту господаря дає той самий матч із новим квитком
    const h2 = (await s.call('POST', '/match/start', { code: 'BBBBB', role: 'host' }, s.th)).body;
    const h3 = (await s.call('POST', '/match/start', { code: 'BBBBB', role: 'host' }, s.th)).body;
    assert.equal(h3.matchId, h2.matchId); assert.notEqual(h3.ticket, h2.ticket);
    assert.equal((await s.call('POST', '/match/start', { role: 'guest', ticket: h2.ticket }, s.tg)).body.error, 'bad_ticket');
    s.tick(PAIR_SEC + 1);
    assert.equal((await s.call('POST', '/match/start', { role: 'guest', ticket: h3.ticket }, s.tg)).body.error, 'bad_ticket');
    // чужі Telegram ID не потрапляють у відповіді матчу
    s.tick(MIN_REPORT_SEC);
    await s.call('POST', '/match/result', { matchId: h.matchId, me: 1, opp: 0 }, s.th);
    const r = await s.call('POST', '/match/result', { matchId: h.matchId, me: 0, opp: 1 }, s.tg);
    assert.ok(!JSON.stringify(r.body).includes('"10"') && !/\b(host_id|guest_id|player_id)\b/.test(JSON.stringify(r.body)));
  } finally { await s.close(); }
});

test('фарм пари: надто швидкий звіт — розбіжність, понад 3 матчі за добу без рейтингу, голи в монетах до 8', async () => {
  const s = await start();
  try {
    await two(s);
    // звіт раніше 200 с після парування
    let id = await pair(s, 'AAAAA', 'friend', false);
    s.tick(MIN_REPORT_SEC - 10);
    await s.call('POST', '/match/result', { matchId: id, me: 5, opp: 0 }, s.th);
    let r = (await s.call('POST', '/match/result', { matchId: id, me: 0, opp: 5 }, s.tg)).body;
    assert.equal(r.state, 'disputed'); assert.equal(r.club.rating, 1000);
    assert.deepEqual(s.db.prepare('SELECT kind FROM flags WHERE player_id = 10').all().map((f) => f.kind), ['fast']);
    // голи в монетах до 8
    id = await pair(s, 'BBBBB');
    await s.call('POST', '/match/result', { matchId: id, me: 20, opp: 0 }, s.th);
    r = (await s.call('POST', '/match/result', { matchId: id, me: 0, opp: 20 }, s.tg)).body;
    const rh = (await s.call('GET', '/match/' + id, null, s.th)).body;
    assert.equal(rh.rew.coins, 120 + 8 * 15);
    // ще два рейтингові (технічний теж рахується), четвертий за добу — лише за участь
    id = await pair(s, 'CCCCC');
    await s.call('POST', '/match/result', { matchId: id, me: 0, opp: 3, forfeit: 'me' }, s.tg);
    id = await pair(s, 'DDDDD');
    await s.call('POST', '/match/result', { matchId: id, me: 1, opp: 0 }, s.th);
    await s.call('POST', '/match/result', { matchId: id, me: 0, opp: 1 }, s.tg);
    const before = (await s.call('GET', '/me', null, s.th)).body.club;
    id = await pair(s, 'EEEEE');
    await s.call('POST', '/match/result', { matchId: id, me: 2, opp: 0 }, s.th);
    r = (await s.call('POST', '/match/result', { matchId: id, me: 0, opp: 2 }, s.tg)).body;
    assert.equal(r.state, 'done'); assert.equal(r.limited, true); assert.equal(r.rew.coins, 30); assert.equal(r.rew.dR, 0);
    const after = (await s.call('GET', '/match/' + id, null, s.th)).body.club;
    assert.equal(after.rating, before.rating); assert.equal(after.coins, before.coins + 30); assert.equal(after.games, before.games);
    assert.equal(s.db.prepare("SELECT COUNT(*) AS n FROM flags WHERE kind = 'pair'").get().n, 2);
    assert.equal(PAIR_DAY, 3);
    // наступної київської доби пара знову грає на рейтинг
    s.tick(86400);
    id = await pair(s, 'FFFFF');
    await s.call('POST', '/match/result', { matchId: id, me: 1, opp: 0 }, s.th);
    r = (await s.call('POST', '/match/result', { matchId: id, me: 0, opp: 1 }, s.tg)).body;
    assert.equal(r.limited, false); assert.ok(r.rew.dR < 0);
    for (const p of [10, 20]) {
      const coins = (await s.call('GET', '/me', null, p === 10 ? s.th : s.tg)).body.club.coins;   // /me ще й зараховує незабрані квести
      assert.equal(sumLedger(s.db, p), coins);
    }
  } finally { await s.close(); }
});

test('матч: дзеркальні звіти дають монети, Ело, досвід і голи героям обом', async () => {
  const s = await start();
  try {
    await two(s);
    const id = await pair(s);
    const me = (await s.call('GET', '/me', null, s.th)).body;
    assert.equal(me.live.matchId, id);
    assert.equal(me.rank, 1);
    const hs = surname(s.ch.heroes[9].name), gs = surname(s.cg.heroes[10].name);
    const scorers = [{ name: gs, min: "12'", mine: false, og: false }, { name: hs, min: "40'", mine: true, og: false }, { name: hs, min: "70'", mine: true, og: false }];
    const r1 = (await s.call('POST', '/match/result', { matchId: id, me: 2, opp: 1, scorers }, s.th)).body;
    assert.equal(r1.state, 'wait');
    const r2 = (await s.call('POST', '/match/result', { matchId: id, me: 1, opp: 2, scorers: scorers.map((x) => ({ ...x, mine: !x.mine })) }, s.tg)).body;
    assert.equal(r2.state, 'done');
    const rh = (await s.call('GET', '/match/' + id, null, s.th)).body;
    assert.equal(rh.state, 'done');
    // нагороди тієї самої формули, що в грі (applyResult)
    const exp = 1 / (1 + Math.pow(10, (1000 - 1100) / 400));
    assert.equal(rh.rew.dR, Math.round(32 * (1 - exp)));
    assert.equal(rh.rew.coins, 120 + 2 * 15);
    assert.equal(r2.rew.coins, 30 + 15);
    assert.equal(rh.club.rating, 1100 + rh.rew.dR);
    assert.equal(r2.club.rating, 1000 + r2.rew.dR);
    assert.ok(r2.rew.dR < 0);
    assert.equal(rh.club.coins, 500 + 150);
    assert.equal(rh.club.heroes[9].goals, 2);
    assert.equal(r2.club.heroes[10].goals, 1);
    assert.deepEqual(rh.club.rec, { w: 11, d: 5, l: 5 });
    assert.deepEqual(r2.club.rec, { w: 10, d: 5, l: 6 });
    assert.equal(rh.club.games, 21);
    assert.equal(sumLedger(s.db, 10), rh.club.coins);
    assert.equal(sumLedger(s.db, 20), r2.club.coins);
    assert.equal((await s.call('GET', '/me', null, s.th)).body.live, null);
    // повторний звіт нічого не нараховує вдруге
    const again = (await s.call('POST', '/match/result', { matchId: id, me: 9, opp: 0 }, s.th)).body;
    assert.equal(again.club.coins, rh.club.coins);
    // чужий матч не видно
    const t3 = await s.login(30, 'Хтось');
    assert.equal((await s.call('GET', '/match/' + id, null, t3)).status, 404);

    if (rules.QUESTS) {
      const q = rh.quests;
      assert.ok(Array.isArray(q));
      const list = (await s.call('GET', '/quests', null, s.th)).body;
      assert.equal(list.day.list.length, 3);
      assert.equal(list.week.list.length, 1);
      const play = [...list.day.list, ...list.week.list];
      assert.ok(play.every((e) => e.p >= 0 && e.p <= e.n));
      for (const e of q) {
        const before = sumLedger(s.db, 10);
        const per = e.period;
        const c = (await s.call('POST', '/quests/claim', { period: per, id: e.id }, s.th)).body;
        assert.equal(c.coins, e.c);
        assert.equal(c.total, before + e.c);
        assert.equal((await s.call('POST', '/quests/claim', { period: per, id: e.id }, s.th)).body.error, 'claimed');
      }
    }
  } finally { await s.close(); }
});

test('матч: розбіжність, вихід, мовчання гостя, settleLive через 15 хв, solo', async () => {
  const s = await start();
  try {
    await two(s);
    // розбіжність: рейтинг без змін, обом 30 монет
    let id = await pair(s, 'AAAAA');
    await s.call('POST', '/match/result', { matchId: id, me: 3, opp: 0 }, s.th);
    let r = (await s.call('POST', '/match/result', { matchId: id, me: 2, opp: 0 }, s.tg)).body;
    assert.equal(r.state, 'disputed');
    assert.equal(r.rew.coins, 30); assert.equal(r.club.rating, 1000); assert.equal(r.club.coins, 530);

    // вихід гостя: технічна поразка одразу
    id = await pair(s, 'BBBBB');
    r = (await s.call('POST', '/match/result', { matchId: id, me: 0, opp: 3, forfeit: 'me' }, s.tg)).body;
    assert.equal(r.state, 'done');
    assert.deepEqual(r.score, [0, 3]);
    assert.equal(r.rew.coins, 30);
    assert.deepEqual(r.quests, []);

    // господар звітував, гість мовчить 60 с: рахунок господаря
    id = await pair(s, 'CCCCC');
    assert.equal((await s.call('POST', '/match/result', { matchId: id, me: 1, opp: 1 }, s.th)).body.state, 'wait');
    s.tick(ALONE_SEC - 1);
    assert.equal((await s.call('GET', '/match/' + id, null, s.th)).body.state, 'wait');
    s.tick(2);
    r = (await s.call('GET', '/match/' + id, null, s.tg)).body;
    assert.equal(r.state, 'done'); assert.deepEqual(r.score, [1, 1]);

    // гість повідомив, що господар вийшов, господар мовчить 60 с: технічна перемога гостя
    id = await pair(s, 'DDDDD');
    await s.call('POST', '/match/result', { matchId: id, me: 0, opp: 0, forfeit: 'opp' }, s.tg);
    s.tick(ALONE_SEC + 1);
    s.app.sweep();
    r = (await s.call('GET', '/match/' + id, null, s.tg)).body;
    assert.equal(r.state, 'done'); assert.deepEqual(r.score, [3, 0]);

    // гість звітував рахунок, господар зник: через 15 хв поразка господарю (наступна доба: ліміт пари не заважає)
    s.tick(86400);
    id = await pair(s, 'EEEEE');
    await s.call('POST', '/match/result', { matchId: id, me: 2, opp: 2 }, s.tg);
    s.tick(SETTLE_SEC); s.app.sweep();
    r = (await s.call('GET', '/match/' + id, null, s.th)).body;
    assert.equal(r.state, 'done'); assert.deepEqual(r.score, [0, 3]);

    // ніхто не звітував 15 хв: не зараховано
    id = await pair(s, 'FFFFF');
    s.tick(SETTLE_SEC); s.app.sweep();
    assert.equal((await s.call('GET', '/match/' + id, null, s.th)).body.state, 'void');

    // без гостя PAIR_SEC: solo, сервер його не рахує
    const solo = (await s.call('POST', '/match/start', { code: 'GGGGG', role: 'host', mode: 'friend' }, s.th)).body.matchId;
    s.tick(PAIR_SEC + 1);
    assert.equal((await s.call('POST', '/match/result', { matchId: solo, me: 5, opp: 0 }, s.th)).body.state, 'solo');
    // реванш у тій самій кімнаті — новий матч
    const a = await pair(s, 'HHHHH', 'friend', false), b = await pair(s, 'HHHHH', 'friend', false);
    assert.notEqual(a, b);

    // журнал монет сходиться з клубами
    for (const p of [10, 20]) {
      const coins = (await s.call('GET', '/me', null, p === 10 ? s.th : s.tg)).body.club.coins;   // /me ще й зараховує незабрані квести
      assert.equal(sumLedger(s.db, p), coins);
    }
  } finally { await s.close(); }
});

test('черга: пара за рейтингом, господар той, хто довше чекав, avoid і таблиця', async () => {
  const s = await start();
  try {
    await two(s);
    const t3 = await s.login(30, 'Далекий');
    await s.call('POST', '/club/save', device({ rating: 1800 }), t3);
    // гравець 30 далеко за рейтингом: чекає
    const w = (await s.call('POST', '/queue', { code: 'QQQQQ' }, t3)).body;
    assert.equal(w.state, 'wait');
    const first = s.call('POST', '/queue', { code: 'HHHHH' }, s.th);   // чекає довгим запитом
    await new Promise((r) => setTimeout(r, 50));
    s.tick(1);
    const g = (await s.call('POST', '/queue', { code: 'GGGGG' }, s.tg)).body;
    const h = (await first).body;
    assert.equal(g.state, 'paired'); assert.equal(g.role, 'guest'); assert.equal(g.code, 'HHHHH');
    assert.equal(h.role, 'host'); assert.equal(h.code, 'HHHHH');
    assert.equal(h.opp.name, s.cg.club.name); assert.equal(h.opp.rating, 1000);
    assert.match(h.opp.id, /^[A-Za-z0-9_-]{12}$/); assert.match(g.opp.id, /^[A-Za-z0-9_-]{12}$/);
    assert.notEqual(h.opp.id, g.opp.id);
    assert.ok(!JSON.stringify([h, g]).includes('20') || h.opp.id.includes('20'));
    assert.equal((await s.call('GET', '/queue/stats', null, s.th)).body.searching, 1);

    // гравець 30 повторює запит, як клієнт (інакше випав би з черги через 20 с)
    const poll30 = async () => assert.equal((await s.call('POST', '/queue', { code: 'QQQQQ' }, t3)).body.state, 'wait');
    s.tick(15); await poll30();
    s.tick(15); await poll30();
    s.tick(11);
    // після 40 с 30-й годиться будь-кому, але avoid не зводить
    // непрозорий id гравця 30 береться з пари, як у клієнта: спершу 20 зводиться з ним, потім 10 його уникає
    const any = (await s.call('POST', '/queue', { code: 'GGGGG' }, s.tg)).body;
    assert.equal(any.state, 'paired'); assert.equal(any.opp.rating, 1800);
    const pid30 = any.opp.id;
    assert.equal((await s.call('POST', '/queue', { code: 'QQQQQ' }, t3)).body.state, 'paired');
    assert.equal((await s.call('POST', '/queue', { code: 'QQQQQ' }, t3)).body.state, 'wait');
    s.tick(15); await poll30();
    s.tick(15); await poll30();
    s.tick(11); await poll30();
    assert.equal((await s.call('POST', '/queue', { code: 'HHHHH', avoid: [pid30] }, s.th)).body.state, 'wait');
    await s.call('POST', '/queue/leave', {}, s.th);
    assert.equal((await s.call('POST', '/queue', { code: 'HHHHH' }, s.th)).body.state, 'paired');

    const top = (await s.call('GET', '/top?limit=2', null, s.th)).body;
    assert.deepEqual(top.list.map((e) => e.rating), [1800, 1100]);
    assert.deepEqual(top.list.map((e) => e.place), [1, 2]);
    assert.deepEqual(top.me, { place: 2, rating: 1100 });
  } finally { await s.close(); }
});

test('квести: прогрес за підтвердженим матчем, «Забрати» і зарахування незабраного', { skip: !rules.QUESTS && 'немає src/online/quests.js' }, async () => {
  const s = await start();
  try {
    await two(s);
    const hs = surname(s.ch.heroes[9].name);
    const scorers = [{ name: 'X', min: "5'", mine: false, og: false }, ...[1, 2, 3, 4].map((m) => ({ name: hs, min: m * 10 + "'", mine: true, og: false }))];
    const id = await pair(s);
    await s.call('POST', '/match/result', { matchId: id, me: 4, opp: 1, scorers }, s.th);
    const r = (await s.call('POST', '/match/result', { matchId: id, me: 1, opp: 4, scorers: scorers.map((x) => ({ ...x, mine: !x.mine })) }, s.tg)).body;
    assert.equal(r.state, 'done');
    const facts = rules.factsOf({ me: 4, opp: 1, scorers }, s.ch.heroes, 1100, 1000);
    const q = (await s.call('GET', '/quests', null, s.th)).body;
    for (const e of [...q.day.list, ...q.week.list]) assert.equal(e.p, Math.min(e.n, rules.questStep(e.id, facts)), e.id);
    assert.ok(q.day.left_ms > 0 && q.week.left_ms >= q.day.left_ms);
    const done = [...q.day.list, ...q.week.list].filter((e) => e.p >= e.n);
    const per = (e) => (q.day.list.includes(e) ? q.day.period : q.week.period);
    assert.equal((await s.call('POST', '/quests/claim', { period: q.day.period, id: q.day.list.find((e) => e.p < e.n)?.id || 'play2' }, s.th)).status >= 400, true);
    const [take, ...leave] = done;
    let coins = (await s.call('GET', '/me', null, s.th)).body.club.coins;
    if (take) {
      const c = (await s.call('POST', '/quests/claim', { period: per(take), id: take.id }, s.th)).body;
      assert.equal(c.total, coins + take.c); coins = c.total;
    }
    // наступного тижня незабране зараховується саме
    s.tick(8 * 86400);
    const me = (await s.call('GET', '/me', null, s.th)).body;
    assert.deepEqual(me.quests.banked, leave.map((e) => ({ t: e.t, c: e.c })));
    assert.equal(me.club.coins, coins + leave.reduce((a, e) => a + e.c, 0));
    assert.ok(me.quests.day.list.every((e) => e.p === 0 && !e.got));
    assert.deepEqual((await s.call('GET', '/quests', null, s.th)).body.banked, []);
    assert.equal(sumLedger(s.db, 10), me.club.coins);
    // гість програв 1:4: його квести рахуються з його погляду
    const gq = (await s.call('GET', '/me', null, s.tg)).body.quests;
    assert.ok(gq);
  } finally { await s.close(); }
});

test('паки магазину: ціна з PACKS, рідкість за шансами пака, номер слота лишається', { skip: !rules.PACKS && 'немає PACKS у src/online/profile.js' }, async () => {
  const s = await start();
  try {
    const t = await s.login(1, 'Аня');
    const c = (await s.call('POST', '/club/save', device({ coins: 20000, games: 100, rec: { w: 100, d: 0, l: 0 } }), t)).body.club;
    const ep = (await s.call('POST', '/club/pack', { hero: 4, pack: 'epic' }, t)).body;
    assert.equal(ep.coins, 20000 - rules.PACKS.epic.price);
    assert.ok(['e', 'l'].includes(ep.hero.rar));
    assert.equal(ep.hero.num, c.heroes[4].num);
    assert.notEqual(ep.hero.id, c.heroes[4].id);
    const rr = (await s.call('POST', '/club/pack', { hero: 0, pack: 'rare' }, t)).body;
    assert.ok(['r', 'e', 'l'].includes(rr.hero.rar));
    assert.equal(rr.hero.line, 'G');
    assert.equal((await s.call('POST', '/club/pack', { hero: 1, pack: 'scout' }, t)).body.error, 'bad_pack');
    assert.equal((await s.call('POST', '/club/pack', { hero: 1, pack: 'gold' }, t)).body.error, 'bad_pack');
    assert.equal((await s.call('POST', '/club/pack', { hero: 12, pack: 'rare' }, t)).body.error, 'bad_hero');
    assert.deepEqual(ledger(s.db, 1).slice(1), [[-rules.PACKS.epic.price, 'pack'], [-rules.PACKS.rare.price, 'pack']]);
    const me = (await s.call('GET', '/me', null, t)).body.club;
    assert.equal(me.heroes[4].id, ep.hero.id);
    assert.equal(sumLedger(s.db, 1), me.coins);
    const t2 = await s.login(2, 'Бо');
    await s.call('POST', '/club/save', device({ coins: 400 }), t2);
    assert.equal((await s.call('POST', '/club/pack', { hero: 1, pack: 'rare' }, t2)).body.error, 'no_coins');
  } finally { await s.close(); }
});

test('магазин і лава: пак кладе новачка на лаву, склад міняється разом із лавою, продаж лише з лави', { skip: !rules.SHOP && 'немає лави в src/online/profile.js' }, async () => {
  const s = await start();
  try {
    const t = await s.login(1, 'Аня');
    const dev = device({ coins: 20000, games: 100, rec: { w: 100, d: 0, l: 0 } });
    // лава з пристрою переноситься з тими самими межами; зламаний запис відкидається
    const extra = rules.newClub().heroes;
    dev.bench = [{ ...extra[4], stats: { ...extra[4].stats, pace: 400 } }, extra[0], 'сміття'];
    const c = (await s.call('POST', '/club/save', dev, t)).body.club;
    assert.equal(c.bench.length, 2);
    assert.equal(c.bench[0].stats.pace, 99);
    assert.equal(c.bench[1].line, 'G'); assert.equal(c.bench[1].role, 'GK');
    // пак: новачок на лаві, гроші й журнал
    const b = (await s.call('POST', '/club/buy', { hero: 3, pack: 'epic' }, t)).body;
    assert.equal(b.coins, 20000 - rules.PACKS.epic.price);
    assert.equal(b.bench, 2); assert.equal(b.club.bench[2].id, b.hero.id);
    assert.ok(['e', 'l'].includes(b.hero.rar)); assert.ok(b.hero.num >= 12);
    const sc = (await s.call('POST', '/club/buy', { hero: 0, pack: 'scout' }, t)).body;
    assert.equal(sc.hero.role, 'GK');
    await s.call('POST', '/club/buy', { hero: 5, pack: 'rare' }, t);
    assert.equal((await s.call('POST', '/club/buy', { hero: 5, pack: 'rare' }, t)).body.error, 'bench_full');
    assert.equal((await s.call('POST', '/club/buy', { hero: 5, pack: 'gold' }, t)).body.error, 'bad_pack');
    // склад разом із лавою: новачок у основу, той, кого замінили, на лаву
    let me = (await s.call('GET', '/me', null, t)).body.club;
    const H = me.heroes.slice(), B = me.bench.slice();
    [H[3], B[2]] = [B[2], H[3]];
    let up = (await s.call('POST', '/club/save', { ...dev, heroes: H, bench: B }, t)).body.club;
    assert.equal(up.heroes[3].id, b.hero.id); assert.equal(up.bench[2].id, me.heroes[3].id);
    assert.equal(up.heroes[3].role, rules.slotsOf(up.club.form)[3].name);
    // польовий у рамку чи підміна героя — склад лишається серверний
    const bad = up.heroes.slice(), bb = up.bench.slice();
    [bad[0], bb[0]] = [bb[0], bad[0]];
    let same = (await s.call('POST', '/club/save', { ...dev, heroes: bad, bench: bb }, t)).body.club;
    assert.deepEqual(same.heroes.map((e) => e.id), up.heroes.map((e) => e.id));
    const fake = up.bench.slice(); fake[0] = { ...fake[0], id: 'чужий' };
    same = (await s.call('POST', '/club/save', { ...dev, heroes: up.heroes, bench: fake }, t)).body.club;
    assert.deepEqual(same.bench.map((e) => e.id), up.bench.map((e) => e.id));
    // воротар із лави в рамку — можна
    const gH = up.heroes.slice(), gB = up.bench.slice(), gj = gB.findIndex((e) => e.role === 'GK');
    [gH[0], gB[gj]] = [gB[gj], gH[0]];
    up = (await s.call('POST', '/club/save', { ...dev, heroes: gH, bench: gB }, t)).body.club;
    assert.equal(up.heroes[0].id, gH[0].id); assert.equal(up.bench[gj].role, 'GK');
    // продаж: лише з лави, за ціною гри, у журнал
    assert.equal((await s.call('POST', '/club/sell', { id: up.heroes[4].id }, t)).body.error, 'not_bench');
    const out = up.bench[1], before = up.coins;
    const sold = (await s.call('POST', '/club/sell', { id: out.id }, t)).body;
    assert.equal(sold.gain, rules.sellPrice(out)); assert.equal(sold.coins, before + sold.gain);
    assert.equal(sold.club.bench.length, 4); assert.ok(!sold.club.bench.some((e) => e.id === out.id));
    assert.equal((await s.call('POST', '/club/sell', { id: out.id }, t)).body.error, 'bad_hero');
    // тренування героя з лави за id
    const bh = sold.club.bench[0], k = Object.keys(bh.stats).find((x) => bh.stats[x] < 99);
    const tr = (await s.call('POST', '/club/train', { hero: 11, id: bh.id, stat: k }, t)).body;
    assert.equal(tr.hero.id, bh.id); assert.equal(tr.hero.stats[k], bh.stats[k] + 1);
    // матч не губить лаву
    me = (await s.call('GET', '/me', null, t)).body.club;
    assert.equal(me.bench.length, 4);
    assert.deepEqual(ledger(s.db, 1).map((r) => r[1]), ['import', 'pack', 'scout', 'pack', 'sell', 'train']);
    assert.equal(sumLedger(s.db, 1), me.coins);
    // ціни: перепродаж завжди дешевший за пак (навіть легенда з паку епіків)
    for (const r of ['c', 'r', 'e', 'l']) assert.ok(rules.sellPrice({ rar: r, stats: { pace: 99, shoot: 99, pass: 99, drib: 99, tack: 99, iq: 99 }, line: 'F' }) < rules.PACKS.epic.price);
  } finally { await s.close(); }
});

test('матч не губить лаву: нагороди отримує основа, лава лишається як була', { skip: !rules.SHOP && 'немає лави' }, async () => {
  const s = await start();
  try {
    await two(s);
    const b = (await s.call('POST', '/club/buy', { hero: 2, pack: 'rare' }, s.th)).body;
    assert.equal(b.club.bench.length, 1);
    const id = await pair(s);
    await s.call('POST', '/match/result', { matchId: id, me: 1, opp: 0 }, s.th);
    await s.call('POST', '/match/result', { matchId: id, me: 0, opp: 1 }, s.tg);
    const c = (await s.call('GET', '/me', null, s.th)).body.club;
    assert.equal(c.bench.length, 1); assert.equal(c.bench[0].id, b.hero.id);
    assert.equal(c.bench[0].apps, 0); assert.equal(c.heroes[2].apps, 1);
    assert.equal(c.games, 21);
  } finally { await s.close(); }
});
