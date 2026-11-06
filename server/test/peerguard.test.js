// Захист сервера кімнат від перебору кодів: зайві нові WebSocket з адреси отримують 429, зайві OFFER не доходять до PeerJS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import WebSocket from 'ws';
import { guardedWss, createLimiter } from '../src/peerguard.js';

test('лічильник за хвилину скидається з новою хвилиною', () => {
  let t = 0;
  const lim = createLimiter(2, () => t);
  assert.deepEqual([lim('a'), lim('a'), lim('a'), lim('b')], [false, false, true, false]);
  t = 60_000;
  assert.equal(lim('a'), false);
});

test("нові з'єднання й OFFER з однієї адреси обмежені", async () => {
  const srv = createServer();
  const wss = guardedWss({ wsMax: 3, offerMax: 2 })({ server: srv, path: '/peerjs' });
  const got = [];
  wss.on('connection', (socket) => socket.on('message', (d) => got.push(String(d))));   // так підписується PeerJS
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${srv.address().port}/peerjs`;
  const open = (ip) => new Promise((resolve) => {
    const ws = new WebSocket(url, { headers: { 'X-Forwarded-For': ip } });
    ws.on('open', () => resolve(ws));
    ws.on('unexpected-response', (_req, res) => resolve(res.statusCode));
    ws.on('error', () => {});
  });
  try {
    const a = await open('1.1.1.1');
    await open('1.1.1.1'); await open('1.1.1.1');
    assert.equal(await open('1.1.1.1'), 429);
    assert.ok((await open('2.2.2.2')) instanceof WebSocket);
    for (let i = 0; i < 5; i++) a.send(JSON.stringify({ type: 'OFFER', dst: 'loko-AAAA' + i }));
    a.send(JSON.stringify({ type: 'HEARTBEAT' }));
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(got.filter((m) => m.includes('OFFER')).length, 2);
    assert.equal(got.filter((m) => m.includes('HEARTBEAT')).length, 1);
  } finally {
    for (const c of wss.clients) c.terminate();
    wss.close(); srv.close();
  }
});
