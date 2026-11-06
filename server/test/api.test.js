import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { signInitData, verifyInitData } from '../src/telegram.js';
import { turnCredentials } from '../src/turn.js';
import { createHmac } from 'node:crypto';
import { newClub } from '../src/rules.js';

const BOT = '123456:TEST-TOKEN';
const ORIGIN = 'https://alexpro121.github.io';
const NOW = 1_800_000_000;

const initData = (id = 42, authDate = NOW, extra = {}) =>
  signInitData({ auth_date: String(authDate), query_id: 'q', user: JSON.stringify({ id, first_name: 'Іван', username: 'ivan' }), ...extra }, BOT);

async function start(over = {}) {
  const db = openDb(':memory:');
  const config = { botToken: BOT, origins: [ORIGIN], turnSecret: 's3cret', turnUrls: ['turn:api.example:3478'], behindProxy: false, ...over };
  const bot = { secret: 'x', prepareRoom: async (u, code) => `P-${u.id}-${code}` };
  const srv = createServer(createApp({ db, config, newClub, bot, now: () => NOW * 1000 }));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, path, { body, token, origin = ORIGIN } = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (origin) headers.Origin = origin;
    const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: r.status === 204 ? null : await r.json(), headers: r.headers };
  };
  return { db, call, close: () => new Promise((r) => srv.close(r)) };
}

test('справжній підпис Telegram приймається, підроблений чи застарілий ні', () => {
  assert.deepEqual(verifyInitData(initData(), BOT, NOW), { id: 42, name: 'Іван', username: 'ivan' });
  assert.equal(verifyInitData(initData(), 'інший:токен', NOW), null);
  assert.equal(verifyInitData(initData().replace('%22id%22%3A42', '%22id%22%3A43'), BOT, NOW), null);
  assert.equal(verifyInitData(initData(42, NOW - 2 * 86400), BOT, NOW), null);
  assert.equal(verifyInitData('', BOT, NOW), null);
  assert.equal(verifyInitData('hash=zz', BOT, NOW), null);
});

test('нове поле signature входить у перевірку, як у Telegram', () => {
  assert.ok(verifyInitData(initData(42, NOW, { signature: 'abc' }), BOT, NOW));
});

test('пароль ретранслятора збігається з форматом coturn use-auth-secret', () => {
  const c = turnCredentials('s3cret', 42, ['turn:x:3478'], NOW, 3600);
  assert.equal(c.username, `${NOW + 3600}:42`);
  assert.equal(c.credential, createHmac('sha1', 's3cret').update(c.username).digest('base64'));
});

test('вхід, створення клубу й профіль', async () => {
  const s = await start();
  try {
    assert.equal((await s.call('GET', '/me')).status, 401);
    const bad = await s.call('POST', '/auth/telegram', { body: { initData: initData().replace('ivan', 'evil') } });
    assert.equal(bad.status, 401);

    const login = await s.call('POST', '/auth/telegram', { body: { initData: initData() } });
    assert.equal(login.status, 200);
    const token = login.body.token;
    assert.equal((await s.call('GET', '/me', { token })).body.club, null);

    const made = await s.call('POST', '/club', { token });
    assert.equal(made.body.created, true);
    assert.equal(made.body.club.heroes.length, 11);
    assert.equal(made.body.club.coins, 300);
    assert.equal(made.body.club.rating, 1000);

    const again = await s.call('POST', '/club', { token });
    assert.equal(again.body.created, false);
    assert.deepEqual(again.body.club, made.body.club);
    assert.deepEqual((await s.call('GET', '/me', { token })).body.club, made.body.club);

    const ledger = s.db.prepare('SELECT delta, reason FROM coin_ledger WHERE player_id = 42').all();
    assert.deepEqual(ledger.map((r) => [r.delta, r.reason]), [[300, 'start']]);
  } finally { await s.close(); }
});

test('чужа адреса сторінки не отримує доступу', async () => {
  const s = await start();
  try {
    const r = await s.call('POST', '/auth/telegram', { body: { initData: initData() }, origin: 'https://evil.example' });
    assert.equal(r.status, 403);
    const ok = await s.call('GET', '/health');
    assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  } finally { await s.close(); }
});

test('заблокований гравець не входить, прострочена сесія не діє', async () => {
  const s = await start();
  try {
    const { token } = (await s.call('POST', '/auth/telegram', { body: { initData: initData(7) } })).body;
    s.db.prepare('UPDATE sessions SET expires_at = 0').run();
    assert.equal((await s.call('GET', '/me', { token })).status, 401);
    s.db.prepare('UPDATE players SET banned = 1 WHERE id = 7').run();
    assert.equal((await s.call('POST', '/auth/telegram', { body: { initData: initData(7) } })).status, 403);
  } finally { await s.close(); }
});

test('паролі ретранслятора лише після входу', async () => {
  const s = await start();
  try {
    assert.equal((await s.call('GET', '/turn')).status, 401);
    const { token } = (await s.call('POST', '/auth/telegram', { body: { initData: initData() } })).body;
    const r = await s.call('GET', '/turn', { token });
    assert.equal(r.body.iceServers[0].urls[0], 'turn:api.example:3478');
    assert.match(r.body.iceServers[0].username, /:42$/);
  } finally { await s.close(); }
});

test('частий вхід з однієї адреси обмежується', async () => {
  const s = await start();
  try {
    let last;
    for (let i = 0; i < 25; i++) last = await s.call('POST', '/auth/telegram', { body: { initData: 'x' } });
    assert.equal(last.status, 429);
  } finally { await s.close(); }
});

test('дуже велике тіло запиту відхиляється', async () => {
  const s = await start();
  try {
    const r = await s.call('POST', '/auth/telegram', { body: { initData: 'x'.repeat(70 * 1024) } }).catch(() => ({ status: 413 }));
    assert.equal(r.status, 413);
  } finally { await s.close(); }
});

test('на гравця лишається не більше п\'яти сесій, найновіші', async () => {
  const s = await start();
  try {
    const tokens = [];
    for (let i = 0; i < 7; i++) tokens.push((await s.call('POST', '/auth/telegram', { body: { initData: initData(9) } })).body.token);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE player_id = 9').get().n, 5);
    assert.equal((await s.call('GET', '/me', { token: tokens[6] })).status, 200);
  } finally { await s.close(); }
});

test('загальне обмеження частоти не чіпає перевірку стану', async () => {
  const s = await start();
  try {
    let last;
    for (let i = 0; i < 125; i++) last = await s.call('GET', '/me');
    assert.equal(last.status, 429);
    assert.equal((await s.call('GET', '/health')).body.ok, true);
  } finally { await s.close(); }
});

test('картка виклику: лише після входу й лише з правильним кодом кімнати', async () => {
  const s = await start();
  try {
    assert.equal((await s.call('POST', '/share/room', { body: { code: 'K7QXP' } })).status, 401);
    const { token } = (await s.call('POST', '/auth/telegram', { body: { initData: initData() } })).body;
    assert.equal((await s.call('POST', '/share/room', { token, body: { code: 'K0O1I' } })).status, 400);
    const r = await s.call('POST', '/share/room', { token, body: { code: 'k7qxp' } });
    assert.equal(r.body.id, 'P-42-K7QXP');
  } finally { await s.close(); }
});
