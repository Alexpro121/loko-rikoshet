// Онлайн-хаб (API 2): два клієнти проходять перенесення клубу, старт матчу, звіти й бачать монети, Ело, квести, чергу й таблицю.
// Квести перевіряються, коли src/online/quests.js є в гілці; до того їх можна підставити з іншої копії гри:
// LOKO_QUESTS=шлях/до/src/online/quests.js npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { signInitData } from '../src/telegram.js';
import * as baseRules from '../src/rules.js';
import { ALONE_SEC, SETTLE_SEC, PAIR_SEC } from '../src/hub/match.js';

const BOT = '123456:TEST-TOKEN';
const ORIGIN = 'https://alexpro121.github.io';
const NOW = 1_800_000_000;

let rules = baseRules;
if (!rules.QUESTS && process.env.LOKO_QUESTS) {
  const m = await import(pathToFileURL(process.env.LOKO_QUESTS).href);
  rules = { ...baseRules, QUESTS: true, questPeriods: m.questPeriods, questsLeft: m.questsLeft, dayIds: m.dayIds, weekIds: m.weekIds, questDef: m.questDef, questStep: m.questStep, factsOf: m.factsOf };
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
    base: { coins: 500, rating: 1000, lvl: 1, xp: 0, rec: { w: 0, d: 0, l: 0 }, goals: 0, games: 0, ...over },
  };
}
const ledger = (db, id) => db.prepare('SELECT delta, reason FROM coin_ledger WHERE player_id = ? ORDER BY id').all(id).map((r) => [r.delta, r.reason]);
const sumLedger = (db, id) => ledger(db, id).reduce((a, [d]) => a + d, 0);

test('health перелічує частини хабу', async () => {
  const s = await start();
  try {
    const h = (await s.call('GET', '/health')).body;
    assert.equal(h.api, 2);
    assert.deepEqual(h.features, ['club', 'match', ...(rules.QUESTS ? ['quests'] : []), 'queue', 'top']);
  } finally { await s.close(); }
});

test('клуб: перенесення з межами, далі лише вигляд і порядок героїв, тренування, скаут, новий клуб', async () => {
  const s = await start();
  try {
    const t = await s.login(1, 'Аня');
    const dev = device({ coins: 999999, rating: 5000 });
    dev.heroes[3].stats.pace = 400; dev.heroes[3].lvl = 500; dev.heroes[3].xp = 1e9;
    const first = await s.call('POST', '/club/save', dev, t);
    assert.equal(first.status, 200);
    const c = first.body.club;
    assert.equal(c.coins, 20000); assert.equal(c.rating, 2400);
    assert.equal(c.heroes[3].stats.pace, 99); assert.equal(c.heroes[3].lvl, 99);
    assert.ok(c.heroes[3].xp < rules.xpNeed(99));
    assert.deepEqual(c.heroes.map((e) => e.id), dev.heroes.map((e) => e.id));
    for (const k of ['club', 'heroes', 'xp', 'rec', 'goals', 'games', 'coins', 'rating', 'lvl']) assert.ok(k in c, k);
    assert.deepEqual(ledger(s.db, 1), [[20000, 'import']]);

    // другий виклик: base і навички ігноруються, обмін польових героїв приймається, назва змінюється
    const next = device({ coins: 1 });
    next.club.name = 'НОВІ'; next.club.form = '442';
    const sw = structuredClone(c.heroes);
    [sw[1], sw[2]] = [sw[2], sw[1]];
    sw[5].stats.pace = 99;
    const upd = (await s.call('POST', '/club/save', { ...next, heroes: sw }, t)).body.club;
    assert.equal(upd.club.name, 'НОВІ'); assert.equal(upd.club.form, '442');
    assert.equal(upd.coins, 20000);
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
    assert.equal(tr.coins, 20000 - rules.trainPrice(v));
    assert.equal((await s.call('POST', '/club/train', { hero: 11, stat: 'shoot' }, t)).body.error, 'bad_hero');

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

async function pair(s, code = 'ABCDE', mode = 'friend') {
  const h = await s.call('POST', '/match/start', { code, role: 'host', mode }, s.th);
  const g = await s.call('POST', '/match/start', { code, role: 'guest', mode }, s.tg);
  assert.equal(h.body.matchId, g.body.matchId);
  return h.body.matchId;
}
async function two(s) {
  s.th = await s.login(10, 'Господар'); s.tg = await s.login(20, 'Гість');
  s.ch = (await s.call('POST', '/club/save', device({ rating: 1100 }), s.th)).body.club;
  s.cg = (await s.call('POST', '/club/save', device({ rating: 1000 }), s.tg)).body.club;
}
const surname = (n) => n.split(' ').slice(-1)[0];

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
    assert.deepEqual(rh.club.rec, { w: 1, d: 0, l: 0 });
    assert.deepEqual(r2.club.rec, { w: 0, d: 0, l: 1 });
    assert.equal(rh.club.games, 1);
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

    // гість звітував рахунок, господар зник: через 15 хв поразка господарю
    id = await pair(s, 'EEEEE');
    await s.call('POST', '/match/result', { matchId: id, me: 2, opp: 2 }, s.tg);
    s.tick(SETTLE_SEC); s.app.sweep();
    r = (await s.call('GET', '/match/' + id, null, s.th)).body;
    assert.equal(r.state, 'done'); assert.deepEqual(r.score, [0, 3]);

    // ніхто не звітував 15 хв: не зараховано
    id = await pair(s, 'FFFFF');
    s.tick(SETTLE_SEC); s.app.sweep();
    assert.equal((await s.call('GET', '/match/' + id, null, s.th)).body.state, 'void');

    // без пари 30 с: solo, сервер його не рахує
    const solo = (await s.call('POST', '/match/start', { code: 'GGGGG', role: 'host', mode: 'friend' }, s.th)).body.matchId;
    s.tick(PAIR_SEC + 1);
    assert.equal((await s.call('POST', '/match/result', { matchId: solo, me: 5, opp: 0 }, s.th)).body.state, 'solo');
    // реванш у тій самій кімнаті — новий матч
    const a = await pair(s, 'HHHHH'), b = await pair(s, 'HHHHH');
    assert.notEqual(a, b);

    // журнал монет сходиться з клубами
    for (const p of [10, 20]) assert.equal(sumLedger(s.db, p), (await s.call('GET', '/me', null, p === 10 ? s.th : s.tg)).body.club.coins);
  } finally { await s.close(); }
});

test('черга: пара за рейтингом, господар той, хто довше чекав, avoid і таблиця', async () => {
  const s = await start();
  try {
    await two(s);
    const t3 = await s.login(30, 'Далекий');
    await s.call('POST', '/club/save', device({ rating: 1900 }), t3);
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
    assert.deepEqual(h.opp, { id: 20, name: s.cg.club.name, rating: 1000 });
    assert.equal(g.opp.id, 10);
    assert.equal((await s.call('GET', '/queue/stats', null, s.th)).body.searching, 1);

    // гравець 30 повторює запит, як клієнт (інакше випав би з черги через 20 с)
    const poll30 = async () => assert.equal((await s.call('POST', '/queue', { code: 'QQQQQ' }, t3)).body.state, 'wait');
    s.tick(15); await poll30();
    s.tick(15); await poll30();
    s.tick(11);
    // після 40 с 30-й годиться будь-кому, але avoid не зводить
    assert.equal((await s.call('POST', '/queue', { code: 'HHHHH', avoid: [30] }, s.th)).body.state, 'wait');
    await s.call('POST', '/queue/leave', {}, s.th);
    const any = (await s.call('POST', '/queue', { code: 'GGGGG' }, s.tg)).body;
    assert.equal(any.state, 'paired'); assert.equal(any.opp.id, 30);

    const top = (await s.call('GET', '/top?limit=2', null, s.th)).body;
    assert.deepEqual(top.list.map((e) => e.rating), [1900, 1100]);
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
