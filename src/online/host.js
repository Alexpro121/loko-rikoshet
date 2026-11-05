// Господар онлайн-матчу: його гра — єдина правда. Він рахує фізику, ШІ і правила для обох команд, а гостю шле:
//  · кадри поз 20 разів на секунду (codec.js, ненадійний канал);
//  · події, які гість має побачити й почути так само: табло, звуки, бризки частинок, трибуни, LED-борти, салют (надійний канал).
// Команди гостя (удар/пас його гравця, приціл, тап «пропустити») приходять сюди й виконуються в грі господаря.
import { audio } from '../core/audio.js';
import { encode, captureRef, PHASES, F } from './codec.js';

const HUD_FWD = ['setTime', 'setProg', 'addedTime', 'combo', 'scored', 'scoreCard', 'setSignal', 'goal', 'clearGoal', 'cine', 'setCard'];   // рахунок гість бере з кадру
// новий звук: також SND_OK у guest.js, гість фільтрує своїм списком
const SND_FWD = ['kick', 'wall', 'pass', 'save', 'whistle', 'horn', 'goal', 'concede', 'bell', 'rumble', 'slide', 'clap', 'thud', 'crowd', 'win', 'lose'];
const FRAME_MS = 50;

export class HostLink {
  constructor(session, game) {
    this.s = session; this.game = game; this.net = session.net;
    this.seq = 0; this.nextSend = 0; this.orig = []; this.last = {}; this.goalOn = false; this.shot = 0; this.prevCam = null;
    this.idle = false; this.heard = false;                // idle — гість не відповідає (згорнув гру, відійшов): його гравцями одразу грає ШІ, доки він не озветься
  }

  /** Підключити до матчу (після Match.start): перехоплюємо табло, звуки й ефекти, щоб віддзеркалити їх гостю. */
  install(m) {
    this.m = m; this.ref = captureRef(m.view);
    this.sendRef();
    const hook = (obj, name, fn) => { const f = obj[name]; if (typeof f !== 'function') return; this.orig.push([obj, name, f]); obj[name] = function (...a) { const r = f.apply(this, a); try { fn(a); } catch (_) { /* ignore */ } return r; }; };
    const hud = m.ui.hud;
    for (const n of HUD_FWD) hook(hud, n, (a) => this.hud(n, a));
    for (const n of SND_FWD) hook(audio, n, (a) => this.ev(['snd', n, a]));
    hook(m.view.particles, 'burst', (a) => this.ev(['fx', a]));
    hook(m.view.stands, 'react', (a) => this.ev(['crowd', a[0], a[1] || null]));
    hook(m.view.ball, 'squash', (a) => this.ev(['squash', a[0], a[1], a[2]]));
    hook(m.view.pitch.boards, 'cue', (a) => this.ev(['board', a[0], a[1] || null]));   // LED-борти: гість програє ту саму подію сам (guest.js, BOARD_OK)
    // поштовх камери лише в живій грі: на гол гість реагує сам (hud:goal), а кат-сцену бачить камерою господаря
    hook(this.game, 'addTrauma', (a) => { if (this.game.sm.name === 'MATCH' && m.phase === 'play' && m.bs !== 'net') this.ev(['trauma', a[0]]); });
  }
  uninstall() { for (const [o, n, f] of this.orig.reverse()) o[n] = f; this.orig = []; }
  /** Поза спокою — гостю (надійно, одразу після «start»): кадри шлють лише зсунуті суглоби відносно неї. */
  sendRef() { this.net.send({ t: 'ref', d: Array.from(this.ref, (v) => Math.round(v * 1e5) / 1e5), s: this.seq }); }
  /** Гість повернувся: події за час обриву пропали — шлемо стан табло, щоб не лишилось завислого (кіносмуга, картка, банер). */
  resync() {
    for (const n of ['setTime', 'setProg', 'addedTime', 'setSignal', 'setCard', 'cine']) if (this.last[n]) this.ev(['hud', n, JSON.parse(this.last[n])]);
    if (!this.goalOn) this.ev(['hud', 'clearGoal', []]);
  }

  /** Табло: шлемо лише змінене (годинник оновлюється щокадру, а показує 20 секунд гри за секунду, тож це близько 20 подій на секунду). */
  hud(n, a) {
    if (n === 'setProg') a = [Math.round(a[0] * 200) / 200, a[1], a[2]];
    const k = JSON.stringify(a);
    if ((n === 'setTime' || n === 'setProg' || n === 'setSignal' || n === 'setCard') && this.last[n] === k) return;
    this.last[n] = k;
    if (n === 'goal') this.goalOn = true; else if (n === 'clearGoal') this.goalOn = false;
    this.ev(['hud', n, a]);
  }
  /** ht — час господаря: гість застосує подію саме тоді, коли покаже кадр того ж моменту (звук удару — разом з ударом). */
  ev(e) { this.net.send({ t: 'ev', e, ht: performance.now() }); }

  /** Нове володіння гостя: якщо він не відповідає, ШІ грає одразу, а не після чергових 14 с сповільнення. */
  newPoss() { this.heard = false; return this.idle; }
  /** Сплив час на удар: без жодного сигналу від гостя вважаємо, що він відійшов. Хто цілився, але не встиг, лишається при керуванні. */
  timedOut() { if (!this.heard) this.idle = true; }
  /** Гість озвався: керування повертається одразу, зокрема посеред володіння. */
  wake() { const m = this.m; this.heard = true; if (this.idle) { this.idle = false; m.netAuto = false; m.netWaitT = 0; } }

  /** Команди гостя. */
  onMsg(msg) {
    const m = this.m; if (!m) return;
    if (msg.t === 'vis') { if (msg.on) { this.idle = true; m.netAuto = true; } else this.wake(); return; }
    this.wake();
    const fin = (v) => Number.isFinite(v);
    // напрямок — лише одиничний вектор: чужий клієнт не загонить фізику в NaN завеликими числами
    const dir = () => {
      if (!fin(msg.dx) || !fin(msg.dz) || !fin(msg.pw)) return null;
      const l = Math.hypot(msg.dx, msg.dz);
      return fin(l) && l > 1e-3 ? { dx: msg.dx / l, dz: msg.dz / l, pw: Math.max(0, Math.min(1, msg.pw)) } : null;
    };
    if (msg.t === 'cmd') {
      const d = dir(); if (d && m.remoteWaiting()) m.netCmd = d;
    } else if (msg.t === 'aim') {
      m.netAim = msg.on ? dir() : null;
    } else if (msg.t === 'tap') {
      const g = this.game;
      if (g.sm.name === 'GOAL') m.skipCine();
      else if (g.sm.name === 'MATCH' && m.phase !== 'play') m.pointerDown(0, 0);
    }
  }

  /** Щокадру (після камери): у середньому раз на 50 мс — кадр поз гостю. Відлік за розкладом: «минуло ≥50 мс» на 60 Гц дало б лише 15–17 Гц. */
  frame() {
    const m = this.m, g = this.game, now = performance.now();
    if (!m || !this.net.open || now < this.nextSend) return;
    this.nextSend = Math.max(this.nextSend + FRAME_MS, now);
    const sm = g.sm.name, b = m.ball;
    let flags = 0;
    if (m.slow) flags |= F.SLOW;
    if (m.remoteCtl()) { flags |= F.TURN; if (m.gkHoldNow()) flags |= F.GKWAIT; }
    if (m.kickoff) flags |= F.KICKOFF;
    if (this.idle) flags |= F.AUTO;
    if (sm === 'GOAL') flags |= F.GOAL;
    if (sm === 'RESULT') flags |= F.RESULT;
    const ti = m.taker && m.bs === 'held' ? m.opp.indexOf(m.taker) : -1;
    if (ti === 0 && m.taker.footBall) flags |= F.GKFOOT;
    let cam = null;
    if (g._ov) {                                   // кат-сцена: гість бачить ту саму камеру (кінокадри — один для обох)
      const c = g.matchCam;
      if (this.prevCam && c.position.distanceTo(this.prevCam) > 6) this.shot++;
      (this.prevCam ??= c.position.clone()).copy(c.position);
      cam = { p: c.position, q: c.quaternion, fov: c.fov, shot: this.shot };
    } else this.prevCam = null;
    const np = m.world.netPush;
    const h = {
      seq: ++this.seq, t: now, flags, phase: Math.max(0, PHASES.indexOf(m.phase)), taker: ti < 0 ? 255 : ti,
      ball: { x: b.x, z: b.z, vx: b.vx, vz: b.vz, y: b.y || 0 }, danger: m.netDanger || 0, cam, dof: cam && g.dof ? g.dof : null,
      net: np ? { sd: np.sd, depth: np.depth, z: np.z, y: np.y } : null, cv: cam ? null : m.celebView(), score: [m.score ? m.score.me : 0, m.score ? m.score.opp : 0],
    };
    this.net.sendFrame(encode(m.view, this.ref, h));
  }
}
