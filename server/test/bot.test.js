import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { createServer } from 'node:http';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import * as rules from '../src/rules.js';
import { createBot, WIDGETS, hookSecret } from '../src/bot/index.js';
import { TgError } from '../src/bot/api.js';
import { loadConfig } from '../src/config.js';

const TOKEN = '123:TEST';
const quiet = { log() {}, warn() {}, error() {} };

/** Фальшивий Bot API: записує виклики, відповідає як Telegram. */
function fakeApi(over = {}) {
  const calls = [];
  const api = async (method, params = {}) => {
    calls.push([method, params]);
    if (over[method]) return over[method](params);
    if (method === 'getMe') return { id: 1, username: 'loko_rush_bot' };
    if (method === 'sendWidget') return { message_id: calls.length, widget: { id: 'W' + calls.length } };
    return true;
  };
  api.upload = async (method, field, file, params) => { calls.push([method + ':upload', params]); return { message_id: 1, photo: [{ file_id: 'small' }, { file_id: 'COVER' }] }; };
  api.calls = calls;
  api.of = (m) => calls.filter(([n]) => n === m).map(([, p]) => p);
  return api;
}

function setup(over) {
  const db = openDb(':memory:');
  const config = { ...loadConfig({ BOT_TOKEN: TOKEN, ALLOWED_ORIGINS: 'https://x' }), publicUrl: '' };
  let t = 1_800_000_000_000;
  const api = fakeApi(over);
  const bot = createBot({ db, config, rules, api, log: quiet, now: () => (t += 1000) });
  return { db, api, bot, config };
}

function addClub(db, id = 42, name = 'Олекса', rating = 1000) {
  const c = rules.newClub(), { coins, lvl, ...data } = c;
  db.prepare('INSERT INTO players (id, name, created_at, last_seen) VALUES (?, ?, 0, 0)').run(id, name);
  db.prepare('INSERT INTO clubs (player_id, data, coins, rating, lvl, updated_at) VALUES (?, ?, ?, ?, ?, 0)').run(id, JSON.stringify(data), coins, rating, lvl);
  return c;
}

const msg = (text, id = 42, type = 'private') => ({ message: { message_id: 1, text, chat: { id, type }, from: { id, first_name: 'Олекса' } } });

test('віджети вкладаються в ліміт Telegram: 32 КБ HTML і 4 КБ стиснутого', () => {
  for (const [name, html] of Object.entries(WIDGETS)) {
    assert.ok(Buffer.byteLength(html) < 32768, name);
    assert.ok(deflateSync(Buffer.from(html), { level: 9 }).length < 3800, `${name}: запас до 4096`);
    assert.doesNotMatch(html, /<script src|@import|@font-face|fetch\(|\bvh\b/, name);
  }
});

test('/start: обкладинка вантажиться раз, далі за file_id; меню з кнопкою гри', async () => {
  const { api, bot } = setup();
  await bot.handle(msg('/start'));
  await bot.handle(msg('/start'));
  assert.equal(api.of('sendPhoto:upload').length, 1);
  const again = api.of('sendPhoto')[0];
  assert.equal(again.photo, 'COVER');
  assert.equal(again.reply_markup.inline_keyboard[0][0].web_app.url, 'https://alexpro121.github.io/loko-rikoshet/');
});

test('/start room_КОД веде прямо в кімнату', async () => {
  const { api, bot } = setup();
  await bot.handle(msg('/start room_k7qxp'));
  const m = api.of('sendMessage')[0];
  assert.equal(m.reply_markup.inline_keyboard[0][0].url, 'https://t.me/loko_rush_bot?startapp=room_K7QXP');
});

test('картка клубу: віджет зі станом до 1 КБ, три зірки й місце в рейтингу', async () => {
  const { api, bot, db } = setup();
  addClub(db, 7, 'Марта', 1100);
  addClub(db, 42);
  await bot.handle(msg('/club'));
  const w = api.of('sendWidget')[0];
  assert.equal(w.html, WIDGETS.club);
  assert.ok(Buffer.byteLength(w.chat_data) <= 1024);
  const c = JSON.parse(w.chat_data);
  assert.equal(c.k, 2);
  assert.equal(c.h.length, 3);
  assert.ok(c.h[0][2] >= c.h[2][2]);
  assert.equal(c.b, 'loko_rush_bot');
  assert.match(w.caption, /рейтинг 1000/);
});

test('без клубу картка підказує, як його створити', async () => {
  const { api, bot } = setup();
  await bot.handle(msg('/club'));
  assert.equal(JSON.parse(api.of('sendWidget')[0].chat_data).n, undefined);
});

test('Bot API без віджетів: текст замість віджета, і більше не пробуємо годину', async () => {
  const { api, bot, db } = setup({ sendWidget: () => { throw new TgError('sendWidget', 404, 'Not Found: method not found'); } });
  addClub(db);
  await bot.handle(msg('/club'));
  await bot.handle(msg('/club'));
  assert.equal(api.of('sendWidget').length, 1);
  assert.equal(api.of('sendMessage').length, 2);
  assert.match(api.of('sendMessage')[0].text, /Зірки складу/);
});

test('inline-виклик: картка з кодом кімнати й текстовий запасний варіант', async () => {
  const { api, bot, db } = setup();
  addClub(db);
  await bot.handle({ inline_query: { id: 'iq', query: 'room k7qxp', from: { id: 42, first_name: 'Олекса' } } });
  const { results } = api.of('answerInlineQuery')[0];
  const duel = results[0];
  assert.equal(duel.input_message_content.html, WIDGETS.duel);
  assert.equal(JSON.parse(duel.input_message_content.public_data).code, 'K7QXP');
  const text = results.at(-1);
  assert.equal(text.reply_markup.inline_keyboard[0][0].url, 'https://t.me/loko_rush_bot?startapp=room_K7QXP');
});

test('запит віджета «me» отримує свіжу картку, решта — помилку', async () => {
  const { api, bot, db } = setup();
  addClub(db);
  await bot.handle({ widget_query: { id: 'q1', data: 'me', from: { id: 42, first_name: 'Олекса' }, chat: { id: 42 }, message_id: 5 } });
  await bot.handle({ shared_widget_query: { id: 'q2', data: 'me', from: { id: 42 }, widget_id: 'W' } });
  const [a, b] = api.of('answerWidgetQuery');
  assert.equal(JSON.parse(a.data).k, 1);
  assert.equal(JSON.parse(b.data).err, 'unknown');
});

test('рейтинг: один спільний віджет на всіх, оновлюється лише коли змінився', async () => {
  const { api, bot, db } = setup();
  addClub(db);
  await bot.handle(msg('/top'));
  await bot.handle(msg('/top', 43));
  assert.equal(api.of('sendWidget').length, 1);
  assert.equal(api.of('sendWidget')[0].is_shared, true);
  assert.equal(api.of('sendSharedWidget')[0].widget_id, 'W2');
  assert.equal(api.of('editSharedWidgetData').length, 0);
  addClub(db, 9, 'Іван', 1200);
  await bot.handle(msg('/top', 44));
  const ed = api.of('editSharedWidgetData')[0];
  assert.equal(JSON.parse(ed.public_data).top[0][0], 'Іван');
});

test('флуд кнопками гаситься, inline не обмежується', async () => {
  const db = openDb(':memory:');
  const config = { ...loadConfig({ BOT_TOKEN: TOKEN, ALLOWED_ORIGINS: 'https://x' }) };
  const api = fakeApi();
  const bot = createBot({ db, config, rules, api, log: quiet, now: () => 5000 });
  await bot.handle(msg('/help'));
  await bot.handle(msg('/help'));
  assert.equal(api.of('sendMessage').length, 1);
});

test('вебхук: без секрету 403, із секретом 200 і оновлення йде боту', async () => {
  const db = openDb(':memory:');
  const got = [];
  const bot = { secret: hookSecret(TOKEN), handle: (u) => got.push(u) };
  const config = { botToken: TOKEN, origins: ['https://x'], behindProxy: false };
  const srv = createServer(createApp({ db, config, newClub: rules.newClub, bot }));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/tg`;
  try {
    const bad = await fetch(url, { method: 'POST', body: '{}' });
    assert.equal(bad.status, 403);
    const ok = await fetch(url, { method: 'POST', body: '{"update_id":1}', headers: { 'X-Telegram-Bot-Api-Secret-Token': bot.secret } });
    assert.equal(ok.status, 200);
    assert.deepEqual(got, [{ update_id: 1 }]);
  } finally { await new Promise((r) => srv.close(r)); }
});

test('налаштування профілю бота шлеться раз, вебхук — щоразу', async () => {
  const { api, bot, config } = setup();
  config.publicUrl = 'https://api.example';
  await bot.setup();
  await bot.setup();
  assert.equal(api.of('setMyCommands').length, 2);
  assert.equal(api.of('setChatMenuButton')[0].menu_button.web_app.url, config.gameUrl);
  const hooks = api.of('setWebhook');
  assert.equal(hooks.length, 2);
  assert.equal(hooks[0].url, 'https://api.example/tg');
  assert.equal(hooks[0].secret_token, hookSecret(TOKEN));
});

test('картка виклику для shareMessage: віджет, а без віджетів — текст із кнопкою', async () => {
  const { api, bot, db } = setup({ savePreparedInlineMessage: (p) => {
    if (p.result.input_message_content.html) throw new TgError('savePreparedInlineMessage', 400, 'Bad Request: widget content not supported');
    return { id: 'P1', expiration_date: 0 };
  } });
  addClub(db);
  const id = await bot.prepareRoom({ id: 42, first_name: 'Олекса' }, 'K7QXP');
  assert.equal(id, 'P1');
  const [w, t] = api.of('savePreparedInlineMessage');
  assert.equal(JSON.parse(w.result.input_message_content.public_data).code, 'K7QXP');
  assert.equal(t.result.reply_markup.inline_keyboard[0][0].url, 'https://t.me/loko_rush_bot?startapp=room_K7QXP');
  assert.equal(t.user_id, 42);
});
