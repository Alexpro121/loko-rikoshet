// Швидкий матч без черги на сервері: «маяки» на фіксованих адресах PeerJS (SLOTS штук на версію протоколу).
// Хто шукає, спершу обходить маяки по черзі: маяк віддає першому, хто прийшов, код своєї кімнати й гасне, а той заходить у кімнату
// звичайним Net.join. Ніхто не відповів: сам стає маяком (кімната через Net.host і перша вільна адреса маяка). Адреса виявилась
// зайнятою — там щойно засвітився інший, і ми питаємо його: двоє, що почали шукати одночасно, не чекають одне одного на різних маяках.
// Маяки живуть на тому сервері кімнат, де відкрито кімнату (свій або публічний), тож гравці бачать лише маяки свого сервера.
// Суперник випадковий: рейтингу маяк не знає. Підбір за рейтингом потребує черги на сервері гри (server/README.md).
import { loadPeer, openPeer, cleanCode, PREFIX, PROTO } from './net.js';

export const SLOTS = 8;
const ASK_MS = 5000;                     // маяк мовчить довше: завислий (вкладку закрили, а сервер ще не помітив)
const LINGER_MS = 400;                   // відповідь маяка має встигнути піти, перш ніж він згасне
const beaconId = (i) => PREFIX + 'qm' + PROTO + '-' + i;

export class Seeker {
  constructor() { this.off = false; this.probe = null; this.beacon = null; this.code = ''; this.onGive = null; }

  /** Скасували пошук, поки йшло підключення: peer уже нікому не потрібен. */
  kept(p) {
    if (!this.off) return p;
    try { p.destroy(); } catch (_) { /* ignore */ }
    throw Object.assign(new Error('closed'), { type: 'closed' });
  }
  async probePeer(publicOnly) {
    if (!this.probe || this.probe.destroyed || this.probe.disconnected) {
      if (this.probe) try { this.probe.destroy(); } catch (_) { /* ignore */ }
      this.probe = this.kept(await openPeer(await loadPeer(), undefined, publicOnly));
    }
    return this.probe;
  }

  /** Обійти маяки: код кімнати першого, хто відповів, або ''. */
  async scan() {
    const p = await this.probePeer();
    for (let i = 0; i < SLOTS && !this.off; i++) { const c = await this.ask(p, i); if (c) return c; }
    return '';
  }
  /** Спитати маяк i. Порожньо: адреса вільна, маяк завис або вже віддав код іншому. */
  ask(peer, i) {
    if (peer.disconnected || peer.destroyed || this.off) return Promise.resolve('');
    return new Promise((res) => {
      let done = false, conn = null;
      const end = (c) => {
        if (done) return; done = true; clearTimeout(to); peer.off('error', onErr);
        try { if (conn) conn.close(); } catch (_) { /* ignore */ }
        res(c);
      };
      const onErr = (e) => { if (e && e.type === 'peer-unavailable') end(''); };   // питаємо по одному, тож це відповідь саме про цей маяк
      const to = setTimeout(() => end(''), ASK_MS);
      peer.on('error', onErr);
      conn = peer.connect(beaconId(i), { label: 'qm', reliable: true, serialization: 'json' });
      conn.on('data', (m) => { const c = m && m.t === 'room' ? cleanCode(m.code) : ''; if (c.length === 5) end(c); });
      conn.on('close', () => end(''));
      conn.on('error', () => end(''));
    });
  }

  /**
   * Засвітити маяк кімнати code на першій вільній адресі. Повертає { other } — код маяка, що засвітився раніше за нас
   * (тоді свою кімнату треба закрити й іти до нього), { lit: true } — маяк світить, або { lit: false } — усі адреси зайняті.
   */
  async light(code, publicOnly = false) {
    this.code = code;
    const Peer = await loadPeer();
    for (let i = 0; i < SLOTS && !this.off; i++) {
      let b;
      try { b = this.kept(await openPeer(Peer, beaconId(i), publicOnly)); } catch (e) {
        if (this.off || e.type !== 'unavailable-id') throw e;
        const c = await this.ask(await this.probePeer(publicOnly), i);
        if (c && c !== code) return { other: c };
        continue;
      }
      this.beacon = b; this.serve(b);
      return { lit: true };
    }
    return { lit: false };
  }
  /** Маяк віддає код першому, хто прийшов, і гасне: кімната на двох. Решта отримує закрите з'єднання й шукає далі. */
  serve(b) {
    b.on('connection', (c) => {
      c.on('open', () => {
        if (this.beacon !== b || this.off) { try { c.close(); } catch (_) { /* ignore */ } return; }
        try { c.send({ t: 'room', code: this.code }); } catch (_) { /* ignore */ }
        this.dim();
        if (this.onGive) this.onGive();
      });
    });
    b.on('disconnected', () => { if (this.beacon === b) this.dim(); });   // сервер кімнат моргнув: адресу вже звільнено, маяк засвітить сесія знову
  }
  lit() { return !!this.beacon; }
  dim() {
    const b = this.beacon; this.beacon = null;
    if (b) setTimeout(() => { try { b.destroy(); } catch (_) { /* ignore */ } }, LINGER_MS);
  }
  stop() {
    this.off = true; this.dim(); this.onGive = null;
    const p = this.probe; this.probe = null;
    if (p) try { p.destroy(); } catch (_) { /* ignore */ }
  }
}
