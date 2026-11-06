// Мережа онлайн-матчу: кімната за кодом через PeerJS (публічний сервер лише знайомить двох гравців), далі — пряме
// WebRTC-з'єднання. Два канали в одному з'єднанні:
//  ctl — надійний і впорядкований (JSON): привітання, старт, події матчу, команди удару, кінець;
//  st  — ненадійний і невпорядкований (бінарний): кадри поз 20 разів на секунду; загублений кадр не гальмує наступні.
// Пінг раз на секунду дає затримку (RTT) і пульс: обрив — понад 8 с тиші, лише якщо й саме з'єднання вже не «connected».
// Тишу кадрів при живому з'єднанні (господар згорнув гру) ловить гість: guest.js, NET_SILENCE.

import { peerServer, iceServers, markDown } from './server.js';

export const PREFIX = 'lokorush-v1-';
const TK_KEY = 'loko-online-tk';
const FRAME_QUEUE = 16e3;                            // ~5 кадрів (250 мс): кадр — 3.2 КБ, 20/с, тобто 64 КБ/с. Далі черга лише старить картинку, свіжий кадр важливіший
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     // без 0/O, 1/I — код легко продиктувати
export const PROTO = 2;
export const makeCode = () => Array.from({ length: 5 }, () => ALPH[(Math.random() * ALPH.length) | 0]).join('');
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

const PEER_CFG = {
  config: {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
    ],
  },
  debug: 0,
};

let PeerCls = null;
/** Мітка гостя: у sessionStorage вкладки, тож після F5 господар упізнає свого гостя навіть раніше, ніж помітить обрив. */
function tabToken() {
  const mk = () => Math.random().toString(36).slice(2);
  try { let t = sessionStorage.getItem(TK_KEY); if (!t) { t = mk(); sessionStorage.setItem(TK_KEY, t); } return t; } catch (_) { return mk(); }
}

// чанк PeerJS вантажиться лише тут: після релізу старий файл зник (404), а збій import() браузер пам'ятає, тож допоможе лише перезавантаження
export async function loadPeer() {
  if (!PeerCls) { try { PeerCls = (await import('peerjs')).Peer; } catch (e) { console.error(e); throw Object.assign(new Error('chunk'), { type: 'chunk' }); } }
  return PeerCls;
}

const OWN_WAIT = 6000;                               // свій сервер кімнат відповідає за мить; довше чекати нема сенсу
const SERVER_FAIL = ['network', 'server-error', 'socket-error', 'timeout'];

/** Свій сервер гри (src/online/server.js) знайомить гравців і дає ретранслятор; без нього публічний PeerJS. */
async function ownConfig(force = false) {
  const [stunG, stunCf, publicTurn] = PEER_CFG.config.iceServers;
  const relay = await iceServers();                 // спершу API: якщо сервер лежить, peerServer() далі дасть null
  const own = peerServer(force);
  return own && { ...own, config: { iceServers: [stunG, stunCf, ...relay, publicTurn] }, debug: 0 };
}

/** Peer на своєму сервері, а якщо він недоступний — на публічному. peer.via каже, де саме ('own' | 'public'). */
export async function openPeer(Peer, id, publicOnly = false) {
  const own = !publicOnly && peerServer() && await ownConfig();
  if (own) {
    try { return Object.assign(await openWith(Peer, id, own, OWN_WAIT), { via: 'own' }); } catch (e) {
      if (!SERVER_FAIL.includes(e.type)) throw e;
      markDown();
    }
  }
  return Object.assign(await openWith(Peer, id, PEER_CFG, 12000), { via: 'public' });
}

function openWith(Peer, id, cfg, wait) {
  return new Promise((res, rej) => {
    const p = id ? new Peer(id, cfg) : new Peer(cfg);
    const to = setTimeout(() => { rej(Object.assign(new Error('timeout'), { type: 'timeout' })); try { p.destroy(); } catch (_) { /* ignore */ } }, wait);
    // лише до відкриття: пізніша помилка (сервер кімнат моргнув, збій WebRTC) не має знищувати peer разом із живим з'єднанням
    const onErr = (e) => { clearTimeout(to); try { p.destroy(); } catch (_) { /* ignore */ } rej(e); };
    p.once('open', () => { clearTimeout(to); p.off('error', onErr); res(p); });
    p.once('error', onErr);
  });
}

export class Net {
  constructor() {
    this.h = {}; this.peer = null; this.conn = null; this.st = null; this.role = null; this.code = '';
    this.open = false; this.rtt = 0; this.lastRx = 0; this.closed = false; this._ping = 0; this.retry = 0;
    this.tk = tabToken(); this.guestTk = null;           // мітка гостя: за нею господар упізнає свого після обриву
  }
  on(ev, fn) { (this.h[ev] ??= []).push(fn); return this; }
  emit(ev, ...a) { for (const f of this.h[ev] || []) { try { f(...a); } catch (e) { console.error(e); } } }

  /** Скасували, поки йшло підключення: peer уже нікому не потрібен (інакше «закрита» кімната лишиться на сервері). */
  kept(p) {
    if (!this.closed) return p;
    try { p.destroy(); } catch (_) { /* ignore */ }
    throw Object.assign(new Error('closed'), { type: 'closed' });
  }
  /** Обрив із сервером кімнат — ще не обрив гри (WebRTC живе окремо): повертаємось до сервера з паузою, поки не закриємо самі. */
  watch(p) {
    p.on('disconnected', () => {
      if (this.closed) return;
      setTimeout(() => { if (!this.closed && p.disconnected && !p.destroyed) try { p.reconnect(); } catch (_) { /* ignore */ } }, 2000);
    });
  }

  /** Створити кімнату: повертає код. Якщо код зайнятий — пробуємо інший. */
  async host() {
    const Peer = await loadPeer(); this.role = 'host';
    let last;
    for (let i = 0; i < 5; i++) {
      const code = makeCode();
      try { this.peer = this.kept(await openPeer(Peer, PREFIX + code)); this.code = code; break; } catch (e) { last = e; if (e.type !== 'unavailable-id') throw e; }
    }
    if (!this.peer) throw last;
    this.peer.on('connection', (c) => {
      if (this.closed) { c.close(); return; }
      // кімната на двох: поки суперник на зв'язку, інших не пускаємо; втрачений суперник може повернутися з тим самим кодом
      const tk = c.metadata && c.metadata.tk;
      if (this.open && tk !== this.guestTk) { c.on('open', () => { try { c.send({ t: 'full' }); } catch (_) { /* ignore */ } setTimeout(() => c.close(), 400); }); return; }
      if (this.open) this.lost();                            // це наш гість, а ми ще не помітили обрив: старе з'єднання вже мертве
      this.guestTk = tk; this.attach(c);
    });
    this.watch(this.peer);
    this.peer.on('error', (e) => { if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error') this.emit('warn', e.type); });
    return this.code;
  }

  /**
   * Приєднатися за кодом. Кімнати немає на одному сервері кімнат — шукаємо на іншому: у господаря свій сервер міг бути
   * недоступний (кімната на публічному), або недоступним щойно здавався нам (ми на публічному, кімната на своєму).
   */
  async join(code) {
    const Peer = await loadPeer(); this.role = 'guest'; this.code = cleanCode(code);
    if (!this.peer || this.peer.destroyed) { this.peer = this.kept(await openPeer(Peer)); this.watch(this.peer); }
    try { await this.connectTo(this.peer); } catch (e) {
      if (e.type !== 'no-room') throw e;
      const toOwn = this.peer.via !== 'own', cfg = toOwn && await ownConfig(true);
      if (toOwn && !cfg) throw e;
      let pub;
      try { pub = this.kept(toOwn ? Object.assign(await openWith(Peer, undefined, cfg, OWN_WAIT), { via: 'own' }) : await openPeer(Peer, undefined, true)); }
      catch (e2) { throw toOwn && e2.type !== 'closed' ? e : e2; }   // свій сервер і справді лежить: кімнати просто немає
      try { await this.connectTo(pub); } catch (e2) { try { pub.destroy(); } catch (_) { /* ignore */ } throw e2; }
      try { this.peer.destroy(); } catch (_) { /* ignore */ }
      this.peer = pub; this.watch(pub);
    }
  }

  connectTo(peer) {
    if (peer.disconnected) return Promise.reject(Object.assign(new Error('network'), { type: 'network' }));   // сервер кімнат ще недоступний: rejoin спробує ще
    return new Promise((res, rej) => {
      const fail = (e) => { cleanup(); rej(e); };
      const onErr = (e) => { if (e.type === 'peer-unavailable') fail(Object.assign(new Error('no-room'), { type: 'no-room' })); else fail(e); };
      const to = setTimeout(() => fail(Object.assign(new Error('timeout'), { type: 'timeout' })), 15000);
      const cleanup = () => { clearTimeout(to); peer.off('error', onErr); };
      peer.on('error', onErr);
      const c = peer.connect(PREFIX + this.code, { label: 'ctl', reliable: true, serialization: 'json', metadata: { v: PROTO, tk: this.tk } });
      this.attach(c, () => { cleanup(); res(); });
    });
  }

  attach(c, onOpen) {
    if (this.conn && this.conn !== c) { try { this.conn.close(); } catch (_) { /* ignore */ } }
    this.conn = c;
    c.on('open', () => {
      if (this.conn !== c) return;
      this.setupStream(c.peerConnection);
      const back = this.wasOpen; this.open = true; this.wasOpen = true; this.lastRx = performance.now(); this.retry = 0;
      this.startPing();
      if (onOpen) onOpen();
      this.emit(back ? 'back' : 'open');
    });
    c.on('data', (m) => { if (this.conn !== c) return; this.lastRx = performance.now(); this.onMsg(m); });
    c.on('close', () => { if (this.conn === c) this.lost(); });
    c.on('error', () => { if (this.conn === c) this.lost(); });
  }

  /** Другий канал у тому ж з'єднанні: узгоджений (negotiated) — обидві сторони створюють його самі, без сигналізації. */
  setupStream(pc) {
    this.st = null;
    try {
      const st = pc.createDataChannel('st', { negotiated: true, id: 33, ordered: false, maxRetransmits: 0 });
      st.binaryType = 'arraybuffer';
      st.onmessage = (e) => { this.lastRx = performance.now(); this.emit('frame', e.data); };
      this.st = st;
      pc.addEventListener('iceconnectionstatechange', () => { if (pc.iceConnectionState === 'failed' && this.conn && this.conn.peerConnection === pc) this.lost(); });
    } catch (_) { this.st = null; }
  }

  onMsg(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'ping') { this.send({ t: 'pong', s: m.s }); return; }
    if (m.t === 'pong') { const r = performance.now() - (+m.s || 0); if (r >= 0 && r < 10000) this.rtt = this.rtt ? this.rtt * 0.8 + r * 0.2 : r; return; }
    this.emit('msg', m);
  }

  startPing() {
    clearInterval(this._ping);
    this._ping = setInterval(() => {
      if (!this.open) return;
      this.send({ t: 'ping', s: performance.now() });
      // тиша — ще не обрив: згорнута вкладка суперника шле пінги рідко (браузер гальмує таймери). Обрив — коли й саме
      // з'єднання не «connected» (закрита вкладка й зникла мережа ловляться окремо: close / ICE failed)
      const pc = this.conn && this.conn.peerConnection, st = pc ? pc.connectionState || pc.iceConnectionState : 'closed';
      if (performance.now() - this.lastRx > 8000 && st !== 'connected' && st !== 'completed') this.lost();
    }, 1000);
  }

  send(m) { if (this.open && this.conn && this.conn.open) { try { this.conn.send(m); } catch (_) { /* ignore */ } } }
  /** Кадр поз: лише ненадійним каналом; якщо черга росте (повільна мережа) — кадр пропускаємо, наступний буде свіжіший. */
  sendFrame(buf) {
    const st = this.st;
    if (st && st.readyState === 'open' && st.bufferedAmount < FRAME_QUEUE) { try { st.send(buf); } catch (_) { /* ignore */ } }
  }

  /** Лише поточне з'єднання (чужий клієнт): кімната лишається й чекає наступного гостя. */
  drop() { try { if (this.conn) this.conn.close(); } catch (_) { /* ignore */ } }

  /** Зв'язок зник у нас, а не в суперника: немає мережі або недоступний сервер кімнат. */
  offline() { return navigator.onLine === false || !!this.netDown || !!(this.peer && this.peer.disconnected && !this.peer.destroyed); }

  lost() {
    if (!this.open || this.closed) return;
    this.open = false; clearInterval(this._ping); this.st = null;
    this.emit('lost');
    if (this.role === 'guest') this.rejoin();
  }

  /** Гість сам перепідключається до тієї ж кімнати (до ~25 с): вайфай моргнув, телефон перейшов на мобільний. */
  async rejoin() {
    if (this.closed || this.open) return;
    if (++this.retry > 8) { this.emit('gone'); return; }
    try { await this.join(this.code); } catch (e) { this.netDown = !!e && ['network', 'server-error', 'socket-error'].includes(e.type); setTimeout(() => this.rejoin(), 2500); }
  }

  /** linger — скільки ще тримати з'єднання: закриття обриває те, що браузер не встиг надіслати (прощальне повідомлення). */
  close(linger = 0) {
    this.closed = true; this.open = false; clearInterval(this._ping);
    const conn = this.conn, peer = this.peer;
    this.conn = null; this.peer = null; this.st = null; this.h = {};
    const end = () => {
      try { if (conn) conn.close(); } catch (_) { /* ignore */ }
      try { if (peer) peer.destroy(); } catch (_) { /* ignore */ }
    };
    if (linger) setTimeout(end, linger); else end();
  }
}
