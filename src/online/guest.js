// Гість онлайн-матчу: показує гру господаря й керує своєю командою.
//  · Кадри поз приходять ~20/с; малюємо їх із невеликою затримкою (буфер ~80–300 мс за тремтінням мережі) і плавно
//    інтерполюємо між двома сусідніми — рух рівний навіть при втраті кадрів.
//  · Годинник господаря зводимо з нашим за нижньою межею (час прийому − час відправки): так кожен кадр і кожна подія
//    (звук, табло, конфетті) показуються в ту саму мить гри, а не тоді, коли дійшли.
//  · Камера гостя дзеркальна (поворот на 180°): його команда атакує, як і в господаря, зліва направо. Кат-сцени — той самий
//    кінокадр, що й у господаря.
//  · Коли м'яч у його гравця, гра сповільнюється в обох, гість цілиться так само, як у звичайному матчі, і шле удар.
import * as THREE from 'three';
import { PITCH, PHYS, shotSkill } from '../config.js';
import { audio, vibrate } from '../core/audio.js';
import { skillOf, ovr } from '../state/squad.js';
import { GOAL_KEYS } from '../ui/hud.js';
import { RingTone } from '../match/ring.js';
import { shotQuality } from '../match/brain.js';
// гравці господаря й гостя для shotQuality (потрібні лише .p.x і .p.z): кільце гостя рахується локально
const _host = Array.from({ length: 11 }, () => ({ p: { x: 0, z: 0 } })), _mine = Array.from({ length: 11 }, () => ({ p: { x: 0, z: 0 } }));
import { decode, NODES, EXPR, PER, BALL, PHASES, F } from './codec.js';
import { ONLINE_AIM, plain } from './profile.js';
import { pathPoint } from '../core/camera.js';

const NN = NODES.length;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _q = [0, 0, 0, 0], _fw = new THREE.Vector3(), _qq = new THREE.Quaternion(), _cp = { x: 0, z: 0 };
const lerpAt = (A, B, k, al) => A[k] + (B[k] - A[k]) * al;
const GK_THROW = 1.25, MATE_R = 0.5;                    // MATE_R — радіус тіла гравця у фізиці (body.r)
const STALE_MS = 1500;                                  // звук і частинки, старші за це (вкладка була у фоні), вже не грають
const NET_SILENCE = 32;                                 // с показу гри без жодного кадру при живому з'єднанні: господар згорнув гру чи завис, матч не зараховуємо
const CROWD_OK = ['goal', 'groan', 'gasp', 'wave', 'clap', 'flash', 'miss'];
const BOARD_OK = new Set(['play', 'goal', 'chance', 'replay', 'replayEnd', 'break', 'end']);   // події LED-бортів від господаря (Boards.cue)
const SWAP_SND = { goal: 'concede', concede: 'goal', win: 'lose', lose: 'win' };
const SND_OK = new Set(['kick', 'wall', 'post', 'net', 'pass', 'save', 'whistle', 'horn', 'goal', 'concede', 'bell', 'rumble', 'slide', 'clap', 'thud', 'crowd', 'win', 'lose']);

export class GuestMatch {
  constructor(session, game, solo) {
    this.s = session; this.game = game; this.ui = game.ui; this.solo = solo;
    this.view = solo.view; this.path = solo.path;
    this.nodes = this.view.players.map((p) => NODES.map((k) => p[k]));
    this.nP = this.view.players.length; this.N = this.nP * PER + BALL;
    this.ball = { x: 0, z: 0, vx: 0, vz: 0 };            // дзеркальний — для камери
    this.ringTone = new RingTone();
    this.bp = { x: 0, z: 0, vx: 0, vz: 0, y: 0 };         // справжній
    this.shot = { dirx: 1, dirz: 0, power: 0, valid: false, vx: 0, vz: 0 };
    this.joy = { dx: 0, dy: 0, m: 0 }; this.anchor = { x: 0, y: 0 }; this.ptr = { x: 0, y: 0 }; this.anchorW = { x: 0, z: 0 }; this.curW = { x: 0, z: 0 }; this.scr = { x: 0, y: 0 };
    this.circ = Array.from({ length: 11 }, (_, i) => ({ x: 0, z: 0, r: i === 0 ? 0.95 : 0.5, e: 0.5 }));
    this.camP = new THREE.Vector3(); this.camL = new THREE.Vector3();
    this.ovO = { fov: 0, p: this.camP, l: this.camL, shot: 0, smooth: false, dof: 0 }; this.cvO = { tx: 0, tz: 0, zoom: 0, ang: 0 };   // кадр камери без нових об'єктів
  }

  /** spec — той самий, що в господаря (склади, форма, погода): сцена будується однаково. */
  start(spec, hudSpec) {
    const v = this.view, g = this.game;
    this.solo.exit();
    v.setup(spec, '433', spec.mySquad, spec.oppSquad); v.pitch.boards.cue('intro');   // інтро гість починає сам: господар підключає пересилання вже після свого старту
    this.ref = null;                                                    // поза спокою — від господаря (повідомлення ref)
    this.solo.walk.hide(); v.particles.clear(); this.solo.world.netPush = null;
    for (const p of v.players) p.root.visible = false;               // до першого кадру нікого не видно
    this.sk = spec.oppSquad.map((e) => skillOf(e));
    this.frames = []; this.pool = []; this.evq = []; this.off = null; this.jit = 0; this.dly = 140; this.dlyT = 140; this.gap = 50; this.prevT = 0;
    this.lastRx = performance.now(); this.lastSeq = 0; this.time = 0; this.camSeq = 0;
    this.phase = 'intro'; this.flags = 0; this.bs = 'idle'; this.aiming = false; this.slow = false; this.takerI = -1; this.danger = 0; this.owner = 0; this.ringT = 0; this.ringQ = 0; this.ringTone.reset();
    this.hdr = null; this.ov = null; this.cv = null; this.beatT = 0; this.aimSent = 0; this.lagShown = false; this.lagSec = 0;
    this.silT = 0; this.hostHidden = false; this.decor = false; this.overT = 0; this.overMin = 0; this.sentAt = 0;
    const hud = this.ui.hud;
    hud.show(hudSpec); hud.setScore(0, 0); hud.setTime('00:00', false, '1-й тайм', null); hud.addedTime(null); hud.warn(null); hud.hint(null); hud.setCard(null); hud.cine(true);
    const pw = (q) => Math.round(q.reduce((t, e) => t + ovr(e), 0) / q.length);
    hud.matchday(hudSpec, { pw: [pw(spec.oppSquad), pw(spec.mySquad)] });   // свій склад гостя — oppSquad (spec господаря)
    audio.music('match'); audio.crowd(0.7);
    g.renderer.toneMappingExposure = v.exposure || 1.1;
    g.flipCam = true; g.snapCamera();
  }

  // ------------------------------------------------------------------ мережа
  /** Поза спокою суглобів господаря: з нею розпаковуються суглоби, яких немає в кадрі (не зсунулись). */
  onRef(d, seq) {
    if (!Array.isArray(d) || d.length !== this.nP * NN * 3 || !d.every((x) => Number.isFinite(x) && Math.abs(x) < 100)) return;
    this.ref = Float32Array.from(d);
    if (Number.isFinite(seq) && seq > this.lastSeq && seq < 4294967296) this.lastSeq = seq;   // кадри минулого матчу (реванш) мають менші номери й сюди вже не потраплять
  }
  onFrame(ab) {
    if (!this.ref) return;
    const now = performance.now(), a = this.pool.pop() || new Float32Array(this.N);
    let h = null; try { h = decode(ab, a, this.ref, this.nP); } catch (_) { h = null; }
    if (!h || h.seq <= this.lastSeq) { this.pool.push(a); return; }      // старий кадр, що заблукав, — уже не потрібен
    this.lastSeq = h.seq; this.lastRx = now; this.silT = 0;
    // зведення годинників: нижня межа (час прийому − час господаря) = мінімальна затримка; повільно повзе вгору,
    // щоб не застрягти на випадковому «швидкому» кадрі й стежити за дрейфом годинників
    const smp = now - h.t;
    if (this.off === null || smp < this.off) { this.off = smp; this.overT = 0; } else {
      this.off += (smp - this.off) * 0.004;
      // затримка різко зросла (вайфай → LTE) і тримається: запас обмежено 320 мс, а межа повзе 12 с. Секунду поспіль кадри пізніші за запас —
      // це нова затримка, беремо найменшу за цю секунду
      if (smp - this.off <= this.dlyT) this.overT = 0;
      else if (!this.overT) { this.overT = now; this.overMin = smp; }
      else { if (smp < this.overMin) this.overMin = smp; if (now - this.overT > 1000) { this.off = this.overMin; this.overT = 0; } }
    }
    this.jit = this.jit * 0.94 + (smp - this.off) * 0.06;
    // запас — півтора реальні інтервали між кадрами (20 Гц — 75 мс; слабкий господар шле рідше) плюс тремтіння мережі
    if (this.prevT) this.gap += (clamp(h.t - this.prevT, 20, 250) - this.gap) * 0.06;
    this.prevT = h.t;
    this.dlyT = clamp(this.gap * 1.5 + 2.2 * this.jit, 80, 320);
    this.frames.push({ t: h.t, h, a });
    if (this.frames.length > 48) this.pool.push(this.frames.shift().a);
  }

  onEvent(e, ht) { this.evq.push({ ht: Number.isFinite(ht) ? ht : 0, e }); }

  /** Час господаря, який зараз показуємо. */
  renderT() { return this.off === null ? -1e12 : performance.now() - this.off - this.dly; }

  /** stale — подія старша за STALE_MS (вкладка була у фоні): стан застосовуємо, а спалахи й вібрацію вже ні. */
  applyEvent(e, stale = false) {
    const hud = this.ui.hud, v = this.view;
    if (!Array.isArray(e)) return;
    if (e[0] === 'snd') { const n = SWAP_SND[e[1]] || e[1]; if (SND_OK.has(n) && Array.isArray(e[2])) audio[n](...e[2].slice(0, 2).map((x) => (typeof x === 'number' || typeof x === 'boolean' ? x : 0))); return; }
    if (e[0] === 'fx' && Array.isArray(e[1])) {
      const q = e[1], n = (i, a0, b0, d) => (Number.isFinite(q[i]) ? clamp(q[i], a0, b0) : d);
      const cols = (Array.isArray(q[7]) ? q[7] : []).filter((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)).slice(0, 6);
      v.particles.burst(n(0, -200, 200, 0), n(1, -10, 60, 1), n(2, -200, 200, 0), n(3, 1, 80, 8) | 0, n(4, 0, 40, 4), n(5, 0.05, 5, 0.5), n(6, 0.02, 2, 0.2), cols.length ? cols : ['#ffffff'], n(8, -40, 40, 16), n(9, 0, 3, 0.7));
      return;
    }
    // сцена та сама, стадіон не дзеркалиться: mine — це справжній домашній сектор, тому в гостя значення те саме, що в господаря
    if (e[0] === 'crowd') {
      if (!CROWD_OK.includes(e[1])) return;
      const r = e[2] && typeof e[2] === 'object' ? e[2] : {}, o = {};
      if (typeof r.mine === 'boolean') o.mine = r.mine;
      if (Number.isFinite(r.dur)) o.dur = clamp(r.dur, 0.2, 12);
      v.stands.react(e[1], o); return;
    }
    if (e[0] === 'squash') { if (Number.isFinite(e[1]) && Number.isFinite(e[2]) && Number.isFinite(e[3])) v.ball.squash(clamp(e[1], -1, 1), clamp(e[2], -1, 1), clamp(e[3], 0, 0.4)); return; }
    if (e[0] === 'trauma') { if (Number.isFinite(e[1])) this.game.addTrauma(clamp(e[1], 0, 0.4)); return; }
    // борти: стадіон господаря, тож не дзеркалимо (як трибуни); чужі дані з мережі чистимо до чисел і коротких рядків
    if (e[0] === 'board') {
      if (!BOARD_OK.has(e[1])) return;
      const r = e[2] && typeof e[2] === 'object' ? e[2] : {}, o = {};
      for (const k of ['x', 'a', 'b', 'n']) if (Number.isFinite(r[k])) o[k] = clamp(r[k], -99, 99);
      if (typeof r.home === 'boolean') o.home = r.home;
      for (const k of ['who', 'min', 'res']) if (typeof r[k] === 'string') o[k] = r[k].slice(0, 24);
      v.pitch.boards.cue(e[1], o); return;
    }
    if (e[0] !== 'hud' || !Array.isArray(e[2])) return;
    const n = e[1], a = e[2];
    switch (n) {
      case 'setTime':                                                  // частина годинника йде в розмітку: лише формат, який справді шле господар («45:00», «+1:20»)
        if (typeof a[0] !== 'string' || !/^\d{1,3}:\d{2}$/.test(a[0])) break;
        hud.setTime(a[0], !!a[1], a[2] == null ? undefined : plain(a[2]).slice(0, 20), typeof a[3] === 'string' && /^\+\d{1,3}:\d{2}$/.test(a[3]) ? a[3] : null);
        break;
      case 'setProg': hud.setProg(+a[0] || 0, !!a[1], !!a[2]); break;
      case 'addedTime': hud.addedTime(a[0] ? +a[0] : null); break;
      case 'combo': hud.combo(clamp(+a[0] | 0, 0, 99)); break;
      case 'clearGoal': hud.clearGoal(); break;
      case 'cine': hud.cine(!!a[0], a[1] == null ? null : String(a[1])); break;
      case 'setSignal': this.owner = -(+a[0] || 0); hud.setSignal(this.owner); break;   // owner з нашого погляду: кільце загрози (ring.js)
      case 'scored': if (a[0] && typeof a[0] === 'object') hud.scored({ name: plain(a[0].name || '').slice(0, 24), min: plain(a[0].min || '').slice(0, 8), mine: !a[0].mine, og: !!a[0].og }); break;
      case 'setCard': {                                                // картка йде в innerHTML — лише перевірені значення
        const c = a[0];
        if (!c || typeof c !== 'object') { hud.setCard(null); break; }
        const n0 = (x) => clamp(Math.round(+x) || 0, 0, 99);
        hud.setCard({ name: plain(c.name).slice(0, 24), num: n0(c.num), ovr: n0(c.ovr), tier: ['gold', 'silver', 'bronze'].includes(c.tier) ? c.tier : 'bronze', role: plain(c.role).slice(0, 30),
          bars: (Array.isArray(c.bars) ? c.bars : []).slice(0, 3).map((x) => [plain(Array.isArray(x) ? x[0] : '').slice(0, 14), n0(Array.isArray(x) ? x[1] : 0)]) }, -(+a[1] || 0));
        break;
      }
      case 'goal': {
        const d = a[0]; if (!d || typeof d !== 'object' || d.pen) break;
        const ours = !d.mine;                                           // господар пропустив — забили ми (і автогол його гравця теж наш)
        hud.goal({ mine: ours, og: !!d.og, gk: !!d.gk, name: plain(d.name || '').slice(0, 24), min: plain(d.min || '').slice(0, 8), ast: plain(d.ast || '').slice(0, 24),
          tag: GOAL_KEYS.tag.includes(d.tag) ? d.tag : '', late: GOAL_KEYS.late.includes(d.late) ? d.late : '', extra: /^РИКОШЕТ ×[\d.]{1,4}$/.test(d.extra) ? d.extra : '' });
        if (stale) break;                                               // гол забито, поки вкладка була у фоні: лише напис
        if (ours) { this.game.addTrauma(0.6); this.game.fovKick(4); vibrate([30, 40, 60]); this.ui.flash('rgba(255,255,255,.4)'); } else vibrate(80);
        break;
      }
      case 'scoreCard': {
        const d = a[0]; if (!d) break;
        const NOTE = { 'Перемога': 'Поразка', 'Поразка': 'Перемога' };
        const sc = (Array.isArray(d.scorers) ? d.scorers : []).slice(0, 40).map((s) => ({ name: plain(s && s.name).slice(0, 24), min: plain(s && s.min).slice(0, 8), mine: !(s && s.mine), og: !!(s && s.og) }));
        hud.scoreCard({ title: plain(d.title || '').slice(0, 40), me: clamp(+d.opp || 0, 0, 99), opp: clamp(+d.me || 0, 0, 99), pens: null, final: !!d.final, note: plain(NOTE[d.note] || d.note || '').slice(0, 40), scorers: sc }, clamp(+a[1] || 3.5, 0.5, 12));
        break;
      }
    }
  }

  // ------------------------------------------------------------------ кадр
  update(rawDt) {
    const now = performance.now(), v = this.view, hud = this.ui.hud;
    this.time += rawDt;
    this.dly += (this.dlyT - this.dly) * Math.min(1, rawDt * 1.5);
    const rt = this.renderT();
    // події — у мить свого кадру
    while (this.evq.length && (this.off === null || this.evq[0].ht <= rt)) {
      const q = this.evq.shift(), e = q.e;
      const stale = rt - q.ht > STALE_MS;
      if (stale && Array.isArray(e) && (e[0] === 'fx' || e[0] === 'crowd' || e[0] === 'squash' || e[0] === 'trauma' || (e[0] === 'snd' && e[1] !== 'crowd') || (e[0] === 'board' && e[1] === 'chance'))) continue;   // рівень трибун — стан, решта — миттєві ефекти
      this.applyEvent(e, stale);
    }
    const fr = this.frames;
    if (fr.length) {
      while (fr.length > 2 && fr[1].t <= rt) this.pool.push(fr.shift().a);
      const A = fr[0], B = fr.length > 1 ? fr[1] : fr[0];
      const al = B.t > A.t ? clamp((rt - A.t) / (B.t - A.t), 0, 1) : 0;
      this.blend(A.a, B.a, al, rawDt);
      this.header(al < 0.5 ? A.h : B.h, A.h, B.h, al, rawDt);
    }
    // зв'язок підвис: господар згорнув гру чи мережа пропала. Обрив мережі веде net.lost і rejoin, а тут — тиша при живому з'єднанні:
    // час рахуємо кроками свого кадру, тому заморожена у фоні вкладка гостя, повернувшись, не вважає тишу господаря за свою
    const net = this.s.net, live = !this.over && this.s.state === 'match' && net && net.open;
    this.silT = live ? this.silT + rawDt : 0;
    if (this.silT > NET_SILENCE) { this.s.oppLeft(); return; }   // господар за цей час уже сам зарахував собі поразку (AWAY_MS)
    const lag = !this.over && this.s.state !== 'result' && now - this.lastRx > 1500;
    if (lag) {
      const sec = Math.ceil(NET_SILENCE - this.silT);
      if (!this.lagShown || sec !== this.lagSec) { this.lagSec = sec; hud.warn(this.hostHidden && live ? 'СУПЕРНИК ЗГОРНУВ ГРУ · ' + sec + ' С' : sec > 25 ? 'ЗВ’ЯЗОК ІЗ СУПЕРНИКОМ…' : 'ЗВ’ЯЗОК ІЗ СУПЕРНИКОМ… ' + sec + ' С'); }
    } else if (this.lagShown) hud.warn(null);
    this.lagShown = lag;
    v.stands.update(rawDt); v.weather.update(rawDt); v.surround.update(rawDt); v.pitch.decals.update(rawDt);
    v.pitch.boards.update(rawDt);
    v.particles.update(rawDt);
    this.solo.netBulge(rawDt);
    if (fr.length && rawDt > 0 && Math.hypot(this.bp.vx, this.bp.vz) > 20 && Math.random() < 0.6) { const b = this.bp; v.particles.emit(b.x, 0.25, b.z, (Math.random() - 0.5) * 1.2, 0.7, (Math.random() - 0.5) * 1.2, 0.3, 0.17, '#e8f2e4', 0, 1, 0, -1); }   // курява за м'ячем: її господар не шле, рахуємо самі
    if (this.bs === 'aim') this.updateAim();
  }

  /** Поза між двома кадрами: позиції — лінійно, повороти — slerp; вираз обличчя й видимість — з ближчого кадру. */
  blend(A, B, al, dt) {
    const P = this.view.players;
    for (let i = 0; i < this.nP; i++) {
      const ns = this.nodes[i], base = i * PER;
      for (let j = 0; j < NN; j++) {
        const n = ns[j], k = base + j * 7;
        n.position.set(lerpAt(A, B, k, al), lerpAt(A, B, k + 1, al), lerpAt(A, B, k + 2, al));
        THREE.Quaternion.slerpFlat(_q, 0, A, k + 3, B, k + 3, al); n.quaternion.fromArray(_q);
      }
      const S = al < 0.5 ? A : B, e = EXPR[S[base + NN * 7] | 0] || 'neutral';
      if (P[i].expr !== e) P[i].setExpr(e);
      P[i].root.visible = S[base + NN * 7 + 1] > 0.5;
    }
    // м'яч: видимий радіус рахуємо під свою камеру (здалеку м'яч трохи більший), позицію й обертання — з кадру
    const bo = this.nP * PER, Bv = this.view.ball, hr = lerpAt(A, B, bo + 7, al), gx = lerpAt(A, B, bo, al), gy = lerpAt(A, B, bo + 1, al), gz = lerpAt(A, B, bo + 2, al);
    Bv.cam = this.game.matchCam;
    Bv.update(dt, gx, gz, 0, 0, Math.max(0, gy - hr));
    Bv.group.position.set(gx, gy - hr + Bv.rad, gz);
    THREE.Quaternion.slerpFlat(_q, 0, A, bo + 3, B, bo + 3, al); Bv.spin.quaternion.fromArray(_q);
    this.view.updateShadows(gx, gz, Math.max(0, gy - hr));
  }

  header(h, ha, hb, al, dt) {
    const hud = this.ui.hud, v = this.view, b = this.bp, ba = ha.ball, bb = hb.ball;
    b.x = ba.x + (bb.x - ba.x) * al; b.z = ba.z + (bb.z - ba.z) * al; b.vx = ba.vx + (bb.vx - ba.vx) * al; b.vz = ba.vz + (bb.vz - ba.vz) * al; b.y = ba.y + (bb.y - ba.y) * al;
    this.ball.x = -b.x; this.ball.z = -b.z; this.ball.vx = -b.vx; this.ball.vz = -b.vz;
    this.hdr = h; this.flags = h.flags; this.phase = PHASES[h.phase] || 'play'; this.takerI = h.taker === 255 ? -1 : h.taker;
    hud.setScore(h.score[1], h.score[0]);
    if (!this.decor && this.phase === 'play') { this.decor = true; v.pitch.decals.fadeOut(); v.tunnel.userData.carpet.visible = false; }   // як Match.endIntro: доріжку прибрали, на газоні лише гра
    // камера кат-сцени: між двома кадрами того самого плану — плавно; новий план — склейка
    const ca = ha.cam, cb = hb.cam, o = this.ovO;
    this.ov = null;
    if (ca && cb && ca.shot === cb.shot) {
      this.camP.set(ca.p[0] + (cb.p[0] - ca.p[0]) * al, ca.p[1] + (cb.p[1] - ca.p[1]) * al, ca.p[2] + (cb.p[2] - ca.p[2]) * al);
      THREE.Quaternion.slerpFlat(_q, 0, ca.q, 0, cb.q, 0, al); _qq.fromArray(_q);
      o.fov = ca.fov + (cb.fov - ca.fov) * al; this.ov = o;
    } else if (h.cam) { this.camP.fromArray(h.cam.p); _qq.fromArray(h.cam.q); o.fov = h.cam.fov; this.ov = o; }
    if (this.ov) {
      _fw.set(0, 0, -1).applyQuaternion(_qq); this.camL.copy(this.camP).addScaledVector(_fw, 20);
      o.shot = ++this.camSeq; o.dof = h.dof ? h.dof.ap : 0;
    }
    if (h.cv) { const c = this.cvO; c.tx = -h.cv.tx; c.tz = -h.cv.tz; c.zoom = h.cv.zoom; c.ang = h.cv.ang; this.cv = c; } else this.cv = null;
    this.solo.world.netPush = h.net;                                     // прогин сітки воріт
    // сповільнення — як у господаря (воно спільне: час гри один)
    const slow = !!(h.flags & F.SLOW);
    if (slow !== this.slow) { this.slow = slow; this.ui.setSlow(slow); audio.slowmo(slow); if (slow) this.game.fovKick(-1.5); }
    // наш хід: м'яч у нашого гравця, господар чекає на удар
    const turn = !!(h.flags & F.TURN) && this.phase === 'play' && !(h.flags & (F.GOAL | F.RESULT)) && this.takerI >= 0;
    this.gkWait = !!(h.flags & F.GKWAIT);
    // команда удару не дала наслідків (загубилась при обриві, господар відхилив): господар досі чекає — цілимось знову
    if (turn && this.bs === 'sent' && performance.now() - this.sentAt > 1000 + (this.s.net.rtt || 0) + this.dly) { this.bs = 'ready'; this.sendAim(false); }
    if (turn && this.bs === 'idle') { this.bs = 'ready'; vibrate(12); this.pressWarn = false; }
    else if (!turn && this.bs !== 'idle') { if (this.bs === 'aim') this.cancelAim(); this.bs = 'idle'; this.hideAim(); }
    // небезпека: найближчий гравець господаря до м'яча
    let dm = 1e9; const P = v.players;
    for (let i = 1; i < 11; i++) { const r = P[i].root.position, d = (r.x - b.x) * (r.x - b.x) + (r.z - b.z) * (r.z - b.z); if (d < dm) dm = d; }
    this.danger = turn ? clamp(1 - (Math.sqrt(dm) - 3) / 15, 0, 1) : 0;
    // кільце рахується тут, локально, тим самим RingTone, що й у господаря: гість атакує −x, господар +x (координати сцени господаря)
    if (this.bs !== 'aim') {
      const mode = this.bs === 'ready' ? 1 : this.owner < 0 && this.phase === 'play' ? -1 : 0;
      if ((this.ringT -= dt) <= 0) {
        this.ringT = 0.16;
        for (let i = 0; i < 11; i++) { const h0 = P[i].root.position, g0 = P[11 + i].root.position; _host[i].p.x = h0.x; _host[i].p.z = h0.z; _mine[i].p.x = g0.x; _mine[i].p.z = g0.z; }
        this.ringQ = mode > 0 ? shotQuality(b.x, b.z, -1, _host).q : mode < 0 ? shotQuality(b.x, b.z, 1, _mine).q : 0;
      }
      if (mode > 0) v.band.visible = false;
      this.ringTone.update(v.ring, dt, this.phase === 'play' ? mode : 0, this.danger, this.ringQ, b.x, b.z, this.time);
    }
    if (this.bs === 'ready') {
      const pr = this.danger;
      const w = this.gkWait ? 'СУПЕРНИКИ ВІДХОДЯТЬ…' : pr > 0.62 ? 'ТИСК! БИЙ ЗАРАЗ' : null;
      if (!this.lagShown) hud.warn(w);
    } else if (this.bs === 'idle') { if (!this.lagShown && !this.gkWait) hud.warn(h.flags & F.AUTO && this.phase === 'play' ? 'ГРАЄ ШІ · ТОРКНИСЬ, ЩОБ КЕРУВАТИ' : null); }
    if (turn && this.slow) { this.beatT -= dt; if (this.beatT <= 0) { this.beatT = 0.55 + (1 - this.danger) * 0.5; audio.beat(this.danger); } }
  }

  // ------------------------------------------------------------------ для камери гри
  /** Опис моменту для камери — дзеркально (наша команда, суперники господаря, атакує +X), як і this.ball. */
  camInfo(o) {
    const b = this.ball, P = this.view.players, pl = o.pl;
    o.bx = b.x; o.bz = b.z; o.bvx = b.vx; o.bvz = b.vz;
    for (let i = 0; i < P.length; i++) { const q = pl[i] || (pl[i] = {}), r = P[i].root.position; q.x = -r.x; q.z = -r.z; q.side = i >= 11 ? 1 : -1; q.gk = i === 0 || i === 11; }
    o.n = P.length;
    o.carrier = this.bs !== 'idle' && this.takerI >= 0 ? 11 + this.takerI : -1; o.receiver = -1;
    o.aiming = this.aiming; o.aimOn = this.aiming && this.shot.valid && this.path.n > 1;
    if (o.aimOn) { pathPoint(this.path, this.path.goal ? 1e9 : 28, _cp); o.ax = -_cp.x; o.az = -_cp.z; }
  }
  camOverride() { return this.ov; }
  celebView() { return this.cv; }
  /** Після фінального свистка меню паузи вже не відкривається, як і в Match: «Здатися» не перетре зіграний рахунок. */
  isPlaying() { return this.phase !== 'end'; }
  pause() { /* онлайн-гра не ставиться на паузу: час спільний */ }
  resume() { }
  startPens() { }
  skipCine() { this.s.net.send({ t: 'tap' }); }

  // ------------------------------------------------------------------ керування
  canAim() { return this.bs === 'ready' && !this.gkWait; }
  pointerDown(x, y) {
    if (this.phase !== 'play' || (this.flags & (F.GOAL | F.RESULT))) { this.s.net.send({ t: 'tap' }); return; }
    if (this.flags & F.AUTO) { this.s.net.send({ t: 'tap' }); return; }   // гість знову тут: господар повертає йому керування
    if (!this.canAim()) { if (this.bs === 'ready' && this.gkWait) audio.click(); return; }
    if (this.ui.useJoy()) return;
    this.joyMode = false;
    this.anchor.x = x; this.anchor.y = y; this.ptr.x = x; this.ptr.y = y;
    this.bs = 'aim'; this.aiming = true; this.shot.valid = false; this.aimDirty = true;
    audio.click();
  }
  joyStart() {
    if (this.flags & F.AUTO) this.s.net.send({ t: 'tap' });
    if (!this.canAim()) return;
    this.joyMode = true; this.joy.m = 0;
    this.bs = 'aim'; this.aiming = true; this.shot.valid = false; this.aimDirty = true;
    audio.click(); vibrate(8);
  }
  joyMove(dx, dy, m) { if (this.bs !== 'aim' || !this.joyMode) return; this.joy.dx = dx; this.joy.dy = dy; this.joy.m = m; this.aimDirty = true; }
  pointerMove(x, y) { if (this.bs === 'aim') { this.ptr.x = x; this.ptr.y = y; this.aimDirty = true; } }
  pointerUp() {
    if (this.bs !== 'aim') return;
    if (this.joyMode && this.ui.joyActive) return;       // відпустили інший палець, джойстик ще тримають (свій відпуск спершу знімає joyActive)
    this.updateAim();
    this.aiming = false; this.hideAim();
    const sh = this.shot;
    if (!sh.valid) { this.bs = 'ready'; this.sendAim(false); return; }
    this.s.net.send({ t: 'cmd', dx: sh.dirx, dz: sh.dirz, pw: sh.power });
    this.bs = 'sent'; this.sentAt = performance.now(); this.view.ring.visible = false;
  }
  cancelAim() { if (this.bs === 'aim') { this.bs = 'ready'; this.aiming = false; this.hideAim(); this.sendAim(false); } }
  hideAim() { const v = this.view; v.aim.hide(); v.ring.visible = false; v.band.visible = false; }
  sendAim(on) { this.s.net.send(on ? { t: 'aim', on: 1, dx: this.shot.dirx, dz: this.shot.dirz, pw: this.shot.power } : { t: 'aim', on: 0 }); }

  /** Приціл гостя — той самий розрахунок, що й у звичайному матчі: напрямок, сила, траєкторія з відскоками. */
  updateAim() {
    const sh = this.shot, b = this.bp, g = this.game;
    let dirx = 0, dirz = 0, power = 0, valid = false;
    if (this.joyMode) {
      const j = this.joy;
      g.worldToScreen(b.x, b.z, this.scr);
      g.screenToGround(this.scr.x, this.scr.y, this.anchorW);
      g.screenToGround(this.scr.x + j.dx * 140, this.scr.y + j.dy * 140, this.curW);
      const px = this.curW.x - this.anchorW.x, pz = this.curW.z - this.anchorW.z, wl = Math.hypot(px, pz);
      valid = j.m > 0.14 && wl > 0.01;
      if (valid) { dirx = px / wl; dirz = pz / wl; power = clamp((j.m - 0.14) / 0.86, 0, 1); }
    } else {
      g.screenToGround(this.anchor.x, this.anchor.y, this.anchorW);
      g.screenToGround(this.ptr.x, this.ptr.y, this.curW);
      const px = this.anchorW.x - this.curW.x, pz = this.anchorW.z - this.curW.z, wl = Math.hypot(px, pz);
      const pxl = Math.hypot(this.anchor.x - this.ptr.x, this.anchor.y - this.ptr.y), hh = g.h;
      const minPx = hh * PHYS.pullMinFrac, maxPx = hh * PHYS.pullMaxFrac;
      valid = pxl > minPx && wl > 0.01;
      if (valid) { dirx = px / wl; dirz = pz / wl; power = clamp((pxl - minPx) / (maxPx - minPx), 0, 1); }
    }
    const was = sh.valid; sh.valid = valid;
    if (!valid) { this.view.aim.hide(); this.view.band.visible = false; sh.power = 0; if (was) this.sendAim(false); return; }
    sh.dirx = dirx; sh.dirz = dirz; sh.power = power;
    const sk = this.sk[Math.max(0, this.takerI)], hands = this.takerI === 0 && !(this.flags & F.GKFOOT);   // воротар поза штрафним б'є ногою: та сама формула, що в remoteKick
    const speed = hands ? (9 + 17 * power) * GK_THROW : Math.min(PHYS.maxSpeed, PHYS.baseShot * (0.28 + 0.72 * power) * (power >= 0.45 ? shotSkill(sk.shoot) : 1));
    sh.vx = dirx * speed; sh.vz = dirz * speed;
    const v = this.view;
    if (this.aimDirty) {
      const P = v.players;
      for (let i = 0; i < 11; i++) { const r = P[i].root.position, c = this.circ[i]; c.x = r.x; c.z = r.z; }
      // суперник упритул до м'яча на мить не блокує удар — приціл теж його не бачить
      const cs = (this.aimC ??= []); cs.length = 0;
      for (let i = 0; i < 11; i++) { const c = this.circ[i]; if (Math.hypot(c.x - b.x, c.z - b.z) >= 1.9) cs.push(c); }
      this.path.setCircles(cs, null);
      this.path.simulate(b.x, b.z, sh.vx, sh.vz, ONLINE_AIM.bounces);
      // як у господаря (Match.updateAim, дзеркально): удар у створ проходить між своїми; пас і удар мимо — ні
      const ok = (dirx < -0.05 && Math.abs(b.z + dirz * (-PITCH.L - b.x) / dirx) < PITCH.G + 1.2 && b.x + PITCH.L < 60) || (power >= 0.45 && this.takerI !== 0 && this.path.goal && this.path.x[this.path.n - 1] < 0);
      if (!ok) this.cutAimAtMates();
      this.aimDirty = false;
      v.aim.mat.color.setHex(0xffffff);
      v.ring.visible = true; v.band.visible = true;
      const bl = 2 + power * 7;
      v.band.position.set(b.x - dirx * bl / 2, 0.08, b.z - dirz * bl / 2);
      v.band.scale.x = bl; v.band.rotation.y = -Math.atan2(dirz, dirx);
      v.ring.material.color.setHSL(0.36 - 0.34 * power, 0.65, 0.62);
      v.ring.position.set(b.x, 0.07, b.z); v.ring.scale.setScalar(1.1 + power * 1.2);
    }
    v.aim.draw(this.path, 1.1, 1.15, this.time * 5);
    // господар бачить, як наш гравець розвертається й готується до удару (його поза — з нашого прицілу)
    const now = performance.now(); if (now - this.aimSent > 120) { this.aimSent = now; this.sendAim(true); }
  }

  /** Обриває пунктир на першому партнері на шляху (друга половина view.players): так само, як Match.cutAimAtMates. */
  cutAimAtMates() {
    const pa = this.path, b = this.bp, P = this.view.players, rr = MATE_R + PITCH.R;
    for (let i = 1; i < pa.n; i++) {
      const x0 = pa.x[i - 1], z0 = pa.z[i - 1], ex = pa.x[i] - x0, ez = pa.z[i] - z0, l2 = ex * ex + ez * ez || 1e-6;
      for (let j = 0; j < 11; j++) {
        if (j === this.takerI) continue;
        const m = P[11 + j].root.position, t = clamp(((m.x - x0) * ex + (m.z - z0) * ez) / l2, 0, 1), dx = x0 + ex * t - m.x, dz = z0 + ez * t - m.z;
        if (dx * dx + dz * dz >= rr * rr || Math.hypot(m.x - b.x, m.z - b.z) < 1.9) continue;
        pa.x[i] = x0 + ex * t; pa.z[i] = z0 + ez * t; pa.cum[i] = pa.cum[i - 1] + (pa.cum[i] - pa.cum[i - 1]) * t;
        pa.n = i + 1; pa.length = pa.cum[i]; pa.goal = false;
        return;
      }
    }
  }

  exit() {
    const g = this.game, v = this.view;
    this.over = true;
    this.hideAim(); this.aiming = false; this.bs = 'idle';
    if (this.slow) { this.slow = false; this.ui.setSlow(false); audio.slowmo(false); }
    g.flipCam = false; g.renderer.toneMappingExposure = 1.1;
    for (const p of v.players) p.root.visible = true;
    v.particles.clear(); this.ui.hud.cine(false); audio.crowd(0);
    for (const f of this.frames || []) this.pool.push(f.a);
    this.frames = []; this.evq = [];
  }
}
