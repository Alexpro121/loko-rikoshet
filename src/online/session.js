// Онлайн-сесія: кімната за кодом або швидкий пошук (маяки, seek.js) → лобі (обидва бачать клуби одне одного й тиснуть «Готовий») → матч → результат
// → реванш. Господар — той, хто створив кімнату: його гра рахує матч (host.js), гість показує її (guest.js).
// Вихід посеред матчу — технічна поразка того, хто вийшов, і перемога суперникові. Вийшов це: «Здатися», закрив сторінку (поразку
// зарахує наступний запуск, settleLive), згорнув гру понад 30 с (onVis). Обрив зв'язку: гість сам перепідключається (rejoin), господар
// чекає 30 с, гравцем гостя тим часом грає ШІ. Не повернувся: поразка тому, у кого зник зв'язок (dropped). Фінальний свисток під час обриву повторюється (lastEnd).
import { S } from '../state/save.js';
import { audio } from '../core/audio.js';
import { appHidden } from '../core/telegram.js';
import { Net, PROTO, cleanCode } from './net.js';
import { HostLink } from './host.js';
import { GuestMatch } from './guest.js';
import { OP, toWire, fromWire, matchClub, awayKit, flagSvg, applyResult, plain, markLive, clearLive, settleLive } from './profile.js';
import { Seeker } from './seek.js';
import { questMatch, matchFacts } from './quests.js';
import { Cloud } from './cloud.js';
import { has, queueJoin, queueLeave } from './server.js';

const AWAY_MS = 30000;                                       // згорнув гру в матчі довше за це: вийшов
const OPP_AWAY_MS = 32000;                                   // суперник згорнув і не сказав «bye» (телефон приспав вкладку): трохи пізніше за його власний AWAY_MS
const REJOIN_MS = 35000;                                     // після F5 гість ще може повернутись у той самий матч
const BYE_MS = 400;                                          // «bye» має встигнути піти, перш ніж закриємо з'єднання
const BUSY_MS = 3000;                                        // «busy» чинний лише на самому старті: посеред матчу чужий клієнт ним нічого не анулює
const GIVE_MS = 12000;                                       // маяк віддав код, а гість так і не зайшов: світимо знову
const RELIGHT_MS = 4000;                                     // усі адреси маяків зайняті: пробуємо ще
const TICKET_MS = 30000;                                     // квиток від господаря не прийшов (у нього немає сервера гри): матч без серверного підрахунку
const pickEnv = (v, list) => (v === 'random' || !list.includes(v) ? list[(Math.random() * list.length) | 0] : v);

export class Online {
  constructor(game, ui) {
    this.g = game; this.ui = ui; game.online = this;
    this.net = null; this.state = 'idle'; this.code = ''; this.err = ''; this.opp = null; this.ready = { me: false, opp: false };
    this.mode = 'friend'; this.seeker = null; this.seekAt = 0; this.onFound = null;   // mode: 'friend' — кімната за кодом, 'quick' — швидкий пошук
    this.cloud = new Cloud(this); this.midP = null; this.ticket = null; this.midRes = null; this.qOn = null; this.queued = false; this.searching = null; this.avoid = [];   // сервер гри: cloud.js, черга швидкого матчу
    this.link = null; this.guest = null; this.last = null; this.lostT = 0; this.lastEnd = null; this.startT = 0; this.onOpp = null;
    // згорнута вкладка: господар перестає рахувати гру, а гість нічим не керує. Суперник дізнається одразу, а не за тайм-аутом
    document.addEventListener('visibilitychange', () => this.onVis());
    this.awayT = 0; this.oppAwayT = 0; this.hiddenAt = 0;
    // минула сесія лишила матч без результату: сторінку закрили посеред гри
    const live = OP.live;
    if (live) setTimeout(() => { if (this.state !== 'match' && settleLive()) ui.toast('Технічна поразка: ти вийшов із минулого матчу'); }, Date.now() - live.at < 900000 ? REJOIN_MS : 0);
  }
  get role() { return this.net ? this.net.role : null; }
  inMatch() { return this.state === 'match'; }
  sendVis() { if (this.net && this.net.open && this.state === 'match') this.net.send({ t: 'vis', on: appHidden() ? 1 : 0 }); }
  /** Згорнув гру в матчі понад AWAY_MS: це вихід. Таймер може не спрацювати (телефон приспав вкладку), тож перевіряємо ще й при поверненні. */
  onVis() {
    this.sendVis(); clearTimeout(this.awayT);
    if (this.state !== 'match') { this.hiddenAt = 0; return; }
    if (appHidden()) {
      this.hiddenAt = Date.now();
      this.awayT = setTimeout(() => { if (appHidden() && this.state === 'match') this.leave(); }, AWAY_MS);
      return;
    }
    const away = this.hiddenAt ? Date.now() - this.hiddenAt : 0; this.hiddenAt = 0;
    if (away > AWAY_MS) this.leave();
  }
  /** Іде кар'єрний матч: онлайн-старт не має його вихопити. */
  busy() { const n = this.g.sm.name; return this.state !== 'match' && (n === 'MATCH' || n === 'GOAL'); }
  /** Вийшов із панелі чи пішов грати кар'єру: готовність знімаємо, щоб матч не почався без нього. */
  unready() { if (!this.ready.me) return; this.ready.me = false; if (this.net && this.net.open) this.net.send({ t: 'ready', on: false }); }
  refresh() { if (this.ui.panel === 'online') this.ui.renderPanel(); }
  setErr(t) { this.err = t; this.refresh(); }

  // ------------------------------------------------------------------ кімната
  async create() {
    this.close(); this.mode = 'friend'; this.state = 'creating'; this.err = ''; this.refresh();
    const net = (this.net = new Net()); this.bind(net);
    try { this.code = await net.host(); if (this.net !== net) return; this.state = 'hosting'; }
    catch (e) { if (this.net !== net) return; this.close(); this.err = this.why(e); }
    this.refresh();
  }
  async join(code) {
    code = cleanCode(code);
    if (code.length !== 5) { this.setErr('Код — 5 символів'); return; }
    this.close(); this.mode = 'friend'; this.state = 'joining'; this.code = code; this.err = ''; this.refresh();
    const net = (this.net = new Net()); this.bind(net);
    try { await net.join(code); } catch (e) { if (this.net !== net) return; this.close(); this.err = this.why(e); this.refresh(); }
  }
  // ------------------------------------------------------------------ швидкий матч
  /** Обійти маяки (seek.js); нікого — відкрити кімнату й засвітити маяк. Стан 'seeking' триває, доки суперник не зайде в кімнату. */
  async seek() {
    this.close(); this.mode = 'quick'; this.state = 'seeking'; this.err = ''; this.seekAt = Date.now(); this.refresh();
    const sk = (this.seeker = new Seeker());
    try {
      const code = await sk.scan();
      if (this.seeker !== sk) return;
      if (code) { this.seekJoin(code); return; }
      const net = (this.net = new Net()); this.bind(net);
      this.code = await net.host();
      if (this.seeker !== sk || this.net !== net) return;
      if (has('queue')) this.qloop(sk);                     // черга сервера гри підбирає за рейтингом; маяк світить паралельно для тих, хто без сервера
      await this.relight();
    } catch (e) { if (this.seeker !== sk) return; this.close(); this.err = this.why(e); this.refresh(); }
  }
  /**
   * Черга сервера гри (POST /queue, довге очікування): у черзі стоїть код своєї кімнати. Пара: гість іде в кімнату господаря,
   * господар чекає його GIVE_MS і, якщо той не прийшов, стає в чергу знову. Черга недоступна — лишається маяк.
   */
  async qloop(sk) {
    this.qOn = sk;
    const live = () => this.qOn === sk && this.seeker === sk && this.state === 'seeking';
    while (live()) {
      this.queued = true;                                    // сервер ставить у чергу вже на вході запиту: скасування має його прибрати
      const r = await queueJoin(this.code, this.avoid);
      if (!live()) return;
      if (!r || r.error) { this.queued = false; this.qOn = null; return; }
      this.queued = r.state === 'wait';
      if (Number.isFinite(r.searching)) { this.searching = r.searching; this.patchSeek(); }
      if (r.state === 'paired' && r.opp && r.opp.id != null) this.avoid = [r.opp.id, ...this.avoid].slice(0, 3);   // не той, з ким щойно не вийшло
      if (r.state === 'paired' && r.role === 'guest' && r.code) {
        this.qOn = null; const net = this.net; if (net) { net.close(); this.net = null; }
        if (sk.lit()) sk.dim();
        this.seekJoin(r.code); return;
      }
      if (r.state === 'paired') { await new Promise((ok) => setTimeout(ok, GIVE_MS)); continue; }   // господар: гість іде до нас; кімната відкриється раніше — live() стане false
    }
  }
  /** Скільки гравців зараз у черзі: оновлюємо рядок без перемальовування панелі. */
  patchSeek() {
    const el = this.ui.panel === 'online' && this.ui.el.panel.querySelector('[data-seekn]');
    if (el && Number.isFinite(this.searching)) el.textContent = 'зараз шукають: ' + this.searching;
  }
  /** Вийти з черги сервера (знайшли суперника іншим шляхом чи скасували). */
  unqueue() { this.qOn = null; if (this.queued) { this.queued = false; queueLeave(); } }
  /** Маяк для своєї кімнати. Хтось засвітився раніше — закриваємо свою кімнату й ідемо до нього. */
  async relight() {
    const sk = this.seeker, net = this.net; if (!sk || !net) return;
    const again = (ms) => { clearTimeout(this.giveT); this.giveT = setTimeout(() => { if (this.seeker === sk && this.state === 'seeking') this.relight().catch(() => this.retrySeek(sk)); }, ms); };
    sk.onGive = () => again(GIVE_MS);
    const r = await sk.light(this.code, !!(net.peer && net.peer.via === 'public'));
    if (this.seeker !== sk || this.state !== 'seeking') return;
    if (r.other) { if (this.net === net) { net.close(); this.net = null; } this.seekJoin(r.other); return; }
    if (!r.lit) again(RELIGHT_MS);
  }
  /** Код від маяка: звичайний вхід у кімнату, але стан лишається пошуком. Не вийшло (кімнату вже зайняли) — шукаємо знову. */
  async seekJoin(code) {
    const sk = this.seeker;
    this.unqueue(); this.code = code;
    const net = (this.net = new Net()); this.bind(net); this.refresh();
    try { await net.join(code); } catch (_) {
      if (this.net !== net || this.seeker !== sk) return;
      net.close(); this.net = null; this.code = '';
      this.retrySeek(sk);
    }
  }
  retrySeek(sk) { clearTimeout(this.giveT); this.giveT = setTimeout(() => { if (this.seeker === sk && this.state === 'seeking') this.seek(); }, 600); }
  /** Суперник швидкого матчу пішов із лобі чи кімната виявилась зайнятою: у хабі шукаємо нового, поза ним просто закриваємо. */
  reseek(msg) {
    if (msg) this.ui.toast(msg);
    if (this.ui.panel === 'online') this.seek(); else { this.close(); this.refresh(); }
  }
  /** Вийшов із хабу: пошук без нього не триває (суперник чекав би на того, хто вже пішов). */
  stopSeek() { if (this.state === 'seeking') this.leave(); }

  why(e) {
    const t = e && e.type;
    if (t === 'chunk') { this.errReload = true; return 'Онлайн-режим не завантажився: вийшла нова версія гри або немає інтернету'; }
    if (t === 'no-room') return 'Кімнату не знайдено — перевір код';
    if (t === 'timeout') return 'Немає відповіді — перевір інтернет';
    if (t === 'browser-incompatible') return 'Браузер не підтримує онлайн-гру';
    if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Сервер кімнат недоступний — спробуй ще раз';
    return 'Не вдалося з’єднатися';
  }

  bind(net) {
    net.on('open', () => {
      if (this.net !== net) return;
      if (this.seeker) { this.seeker.stop(); this.seeker = null; clearTimeout(this.giveT); }   // суперник у кімнаті: маяк більше не потрібен
      this.unqueue();
      this.state = 'lobby'; this.ready = { me: false, opp: false }; this.hello(); audio.horn();
      if (this.onFound) this.onFound();
      this.refresh();
    });
    net.on('back', () => {
      if (this.net !== net) return;
      clearTimeout(this.lostT); this.hello(); this.sendVis();
      if (this.state === 'match' && this.role === 'host' && this.ticket) this.net.send({ t: 'mt', k: this.ticket });   // гість повернувся: квиток матчу ще раз (міг не дійти)
      if (this.state === 'match') {
        if (this.link) { this.ui.hud.warn(null); this.link.resync(); this.chkGuest = true; }
        this.ui.toast('Суперник знову на зв’язку');
      }
      else if (this.state !== 'result') { this.state = 'lobby'; this.ready = { me: false, opp: false }; this.err = ''; }
      this.refresh();
    });
    net.on('msg', (m) => { if (this.net === net) this.onMsg(m); });
    net.on('frame', (ab) => { if (this.net === net && this.guest) this.guest.onFrame(ab); });
    net.on('lost', () => {
      if (this.net !== net) return;
      if (this.role === 'host') {
        if (this.state === 'match') { this.ui.hud.warn('СУПЕРНИК ВІДКЛЮЧИВСЯ…'); this.lostT = setTimeout(() => this.dropped(), 30000); }
        else if (this.mode === 'quick') { this.reseek(this.opp ? 'Суперник відключився — шукаємо іншого' : ''); return; }
        else { this.state = 'hosting'; if (this.opp) this.ui.toast('Суперник відключився — кімната чекає'); this.opp = null; this.ready = { me: false, opp: false }; }
      } else if (this.state !== 'match') this.state = 'wait';
      this.refresh();
    });
    net.on('gone', () => { if (this.net === net) this.dropped(); });
  }
  hello() { this.net.send({ t: 'hello', v: PROTO, p: toWire(), st: this.state }); }
  /** Свій клуб змінився (редактор, тренування, скаут): суперник має грати проти нього, а не проти старого привітання. */
  sync(fromServer) {
    if (this.net && this.net.open && this.state !== 'match') this.hello();
    if (!fromServer) this.cloud.dirty();                     // правку гравця зберегти й на сервері гри
  }

  onMsg(m) {
    switch (m.t) {
      case 'hello':
        if (m.v !== PROTO) {
          const t = 'У суперника інша версія гри — оновіть сторінку';
          if (this.role !== 'host') { this.close(); this.setErr(t); return; }
          if (this.state === 'match') return;                 // справжній гість проходить цю перевірку в лобі: посеред матчу це чужий клієнт
          this.err = t; this.net.drop(); this.refresh(); return;   // кімната лишається: закривається лише це з'єднання
        }
        { const first = !this.opp; this.opp = fromWire(m.p); if (first) { this.ui.toast('Суперник: ' + this.opp.club.name); this.refresh(); } else if (this.onOpp) this.onOpp(); }
        if (this.chkGuest) {                                 // гість повернувся без матчу (оновив сторінку): наздоганяє гру, що триває
          this.chkGuest = false;
          if (m.st !== 'match' && this.state === 'match' && this.link) { this.net.send({ t: 'start', env: this.env }); this.link.sendRef(); this.link.resync(); }
        }
        // гість повернувся в матч, який у нас уже закінчився: «end» при обриві пропав. Двічі він його не застосує: після першого гість уже не в стані match
        if (m.st === 'match' && this.state !== 'match' && this.role === 'host' && this.lastEnd) this.net.send(this.lastEnd);
        return;
      case 'full':
        if (this.role !== 'guest') return;                   // це відповідь господаря новому гостю; від гостя це чужий клієнт
        if (this.state === 'match') { this.techLoss(); return; }   // місце вже зайняв хтось інший: ми запізнились повернутись
        if (this.mode === 'quick') { this.reseek(''); return; }
        this.close(); this.setErr('Кімната вже зайнята'); return;
      case 'ready':
        this.ready.opp = !!m.on; if (this.onOpp) this.onOpp();
        if (this.role === 'host' && this.ready.me && this.ready.opp) this.startMatch();
        return;
      case 'busy':                                           // гість саме почав кар'єрний матч (розминулись із «готовий»): у лобі, без результату
        if (this.role === 'host' && this.state === 'match' && performance.now() - this.startT < BUSY_MS) {
          this.state = 'lobby'; this.net.send({ t: 'ready', on: false }); this.g.sm.go('MENU'); if (this.link) { this.link.uninstall(); this.link = null; } this.ui.openPanel('online'); this.ui.toast('Суперник саме почав кар’єрний матч');
        }
        return;
      case 'start': if (this.role === 'guest' && this.opp) this.beginGuest(m); return;
      case 'mt': this.onTicket(m.k); return;
      case 'ev': if (this.guest) this.guest.onEvent(m.e, m.ht); return;
      case 'ref': if (this.guest) this.guest.onRef(m.d, m.s); return;
      case 'vis':
        if (this.guest) this.guest.hostHidden = !!m.on;
        else if (this.link && this.state === 'match') { this.link.onMsg(m); clearTimeout(this.oppAwayT); if (m.on) this.oppAwayT = setTimeout(() => { if (this.state === 'match') this.oppLeft(); }, OPP_AWAY_MS); }
        return;
      case 'cmd': case 'aim': case 'tap': if (this.link) this.link.onMsg(m); return;
      case 'end': if (this.role === 'guest' && this.state === 'match') this.guestEnd(m); return;
      case 'bye': this.oppLeft(); return;
    }
  }

  setReady(on) {
    if (!this.net || !this.net.open || !this.opp) return;
    if (on) this.hello();                                    // надійний канал упорядкований: профіль дійде раніше за «готовий»
    this.ready.me = on; this.net.send({ t: 'ready', on }); audio.click();
    if (this.role === 'host' && this.ready.me && this.ready.opp) this.startMatch(); else this.refresh();
  }

  // ------------------------------------------------------------------ матч
  /** Специфікація матчу — однакова в обох: господарі — клуб господаря, гості — клуб гостя. */
  buildSpec(hostP, guestP, env) {
    const home = matchClub(hostP.club), away = matchClub(guestP.club);
    home.crest = flagSvg(hostP.club.flag, 'oflag crest'); away.crest = flagSvg(guestP.club.flag, 'oflag crest');
    away.kit = awayKit(home.kit, guestP.club);               // обидва будують spec самі: вибір форми залежить лише від прапорів
    return {
      leagueName: 'Онлайн-матч', no: 1, of: 1, final: false, club: away, home, mySquad: hostP.heroes, oppSquad: guestP.heroes, env,
      myForm: hostP.club.form, formation: guestP.club.form, note: '', scale: 1, time: 270, runSpeed: 9.2, press: 0.6, line: 0.02, gkErr: 2.2, counterSpeed: 48, tackle: 0.62, slowFactor: 0.16,
      scout: { corner: 0, flank: 0 }, fixtureIdx: 0, season: 0, league: 0, globalNo: 1,
    };
  }
  /** Свій клуб у тому ж вигляді, що його бачить суперник (через ту саму перевірку) — сцени в обох однакові. */
  me() { return fromWire(toWire()); }

  startMatch() {
    if (this.busy()) { this.unready(); this.refresh(); return; }
    const env = { time: pickEnv(S.settings.timeOfDay, ['day', 'dusk', 'night']), weather: pickEnv(S.settings.weather, ['clear', 'clear', 'cloudy', 'rain', 'snow', 'fog']) };
    this.hello(); this.net.send({ t: 'start', env }); this.env = env;
    this.ready = { me: false, opp: false }; this.lastEnd = null; this.startT = performance.now();
    const spec = this.buildSpec(this.me(), this.opp, env), seq = this.link ? this.link.seq : 0;
    if (this.link) this.link.uninstall();
    this.link = new HostLink(this, this.g); spec.online = { role: 'host', link: this.link };
    this.link.seq = seq;                                     // номери кадрів наскрізь: заблукалий кадр минулого матчу завжди старший за новий
    this.state = 'match'; this.oppRating = this.opp.rating; markLive(this.oppRating);
    // сервер гри: господар отримує matchId і квиток, квиток іде гостю напряму (P2P), гість стартує з ним — сторонній із кодом кімнати не стане «гостем»
    this.ticket = null;
    this.midP = this.cloud.start(this.code, 'host', this.mode).then((r) => {
      if (r && Cloud.ticketOk(r.ticket) && this.state === 'match' && this.net) { this.ticket = r.ticket; this.net.send({ t: 'mt', k: r.ticket }); }
      return r ? r.matchId : null;
    });
    this.ui.closePanel(true); this.ui.hideResult();
    this.g.link = this.link;
    this.g.sm.go('MATCH', { spec });
  }
  beginGuest(m) {
    if (this.busy()) { this.unready(); this.net.send({ t: 'busy' }); return; }
    const env = m.env && typeof m.env === 'object' ? { time: pickEnv(m.env.time, ['day', 'dusk', 'night']), weather: pickEnv(m.env.weather, ['clear', 'cloudy', 'rain', 'snow', 'fog']) } : { time: 'day', weather: 'clear' };
    this.ready = { me: false, opp: false };
    const spec = this.buildSpec(this.opp, this.me(), env);
    const hudSpec = { leagueName: 'Онлайн-матч', no: 1, of: 1, club: spec.home, home: spec.club };
    if (this.guest) this.guest.exit();
    this.guest = new GuestMatch(this, this.g, this.g.ensureMatch()); this.hudSpec = hudSpec;
    if (this.state !== 'match' || !this.midP) {                          // повтор «start» після реконекту — той самий матч
      if (this.midRes) this.midRes(null);
      this.midRes = null;
      this.midP = has('match') ? new Promise((res) => { this.midRes = res; setTimeout(() => { if (this.midRes === res) { this.midRes = null; res(null); } }, TICKET_MS); }) : null;
    }
    this.state = 'match'; this.oppRating = this.opp.rating; markLive(this.oppRating);
    this.ui.closePanel(true); this.ui.hideResult();
    this.g.sm.go('MATCH', { guest: this.guest, spec, hudSpec });
  }

  /** Гість: квиток матчу від господаря (перевіряємо формат: це дані суперника) — старт матчу на сервері гри. */
  onTicket(k) {
    const res = this.midRes;
    if (this.role !== 'guest' || this.state !== 'match' || !res || !Cloud.ticketOk(k)) return;
    this.midRes = null;
    this.cloud.start(this.code, 'guest', this.mode, k).then((r) => res(r ? r.matchId : null));
  }

  /** Господар: фінальний свисток (Match.end → RESULT). Гостю — рахунок і автори голів; собі — нагороди. */
  finish(r) {
    if (r.applied) return r.rew;
    r.applied = true; clearLive();
    if (this.net && this.role === 'host' && !r.forfeit && !r.void) { this.lastEnd = { t: 'end', me: r.me, opp: r.opp, scorers: r.scorers }; this.net.send(this.lastEnd); }   // при обриві не дійде: повторимо, коли гість повернеться
    this.state = 'result';
    if (this.link) { this.link.uninstall(); }
    const mid = this.midP; this.midP = null;
    if (mid) this.cloud.report(mid, r);                      // сервер гри звіряє звіти обох і сам рахує нагороди; тут — лише миттєвий показ
    if (r.void) return (r.rew = null);
    const mine = (r.scorers || []).filter((s) => s.mine && !s.og).map((s) => s.name);   // автогол суперника — наш гол, але не гол героя-однофамільця
    const myR = OP.rating, oppR = this.oppRating ?? 1000;
    r.rew = applyResult(r.outcome, r.me, oppR, mine);
    r.quests = r.forfeit || has('quests') ? [] : questMatch(matchFacts(r, myR, oppR));   // квести рахують лише матчі, дограні до свистка; із сервером їх рахує він
    if (this.net && !r.forfeit) this.hello();                // новий рейтинг і рівень — для реваншу й картки в лобі
    return r.rew;
  }
  guestEnd(m) {
    const n = (v) => Math.max(0, Math.min(99, Math.round(+v) || 0));
    const me = n(m.opp), opp = n(m.me);
    const scorers = (Array.isArray(m.scorers) ? m.scorers : []).slice(0, 40).map((s) => ({ name: plain(s && s.name).slice(0, 24), min: plain(s && s.min).slice(0, 8), mine: !(s && s.mine), og: !!(s && s.og) }));
    this.g.sm.go('RESULT', { online: true, outcome: me > opp ? 'win' : me < opp ? 'loss' : 'draw', me, opp, spec: this.hudSpec, scorers });
  }

  /** Вихід із матчу (кнопка «Здатися») — технічна поразка; суперникові — перемога. */
  leave() {
    const mt = this.g.match;
    if (this.state === 'match' && mt && mt.phase === 'end') return;   // меню відкрили до свистка: матч уже зіграно, результат от-от прийде
    if (this.state === 'match') {
      this.net && this.net.send({ t: 'bye' });
      this.techLoss();
      return;
    }
    this.net && this.net.send({ t: 'bye' }); this.close(BYE_MS); this.refresh();
  }
  techLoss() {
    const sp = this.role === 'host' ? { club: matchClub(this.opp.club), home: matchClub(OP.club) } : this.hudSpec;
    const r = { online: true, outcome: 'loss', me: 0, opp: 3, spec: sp, scorers: [], forfeit: 'me' };
    this.finish(r); this.close(BYE_MS); this.g.sm.go('MENU'); this.ui.toast('Технічна поразка 0:3: ти вийшов із матчу');
  }
  /** Матч обірвано: гра за екраном результату не йде далі (ні голів, ні другого фіналу з нагородами). */
  stopMatch() {
    const m = this.g.match; if (!m) return;
    m.exit(); this.ui.hud.warn(null); this.ui.hud.clearGoal();
    if (!this.guest) { m.prevPhase = 'idle'; m.phase = 'paused'; }   // стан RESULT далі викликає update: на паузі він лише малює
    else this.g.flipCam = true;                                      // тло за екраном результату не розвертається (меню скине)
  }
  /** Суперник вийшов сам: у матчі — наша технічна перемога. */
  oppLeft() {
    if (this.state === 'match') {
      const sp = this.role === 'host' ? { club: matchClub(this.opp.club), home: matchClub(OP.club) } : this.hudSpec;
      const r = { online: true, outcome: 'win', me: 3, opp: 0, spec: sp, scorers: [], forfeit: 'opp' };
      this.stopMatch(); this.close(); this.state = 'result';
      this.g.sm.go('RESULT', r);
      return;
    }
    if (this.mode === 'quick') { this.reseek('Суперник вийшов — шукаємо іншого'); return; }
    if (this.role === 'host') { this.opp = null; this.ready = { me: false, opp: false }; this.state = 'hosting'; this.ui.toast('Суперник вийшов — кімната чекає'); }
    else { this.close(); this.ui.toast('Господар закрив кімнату'); }
    this.refresh();
  }
  /** Зв'язок так і не відновився: поразка тому, у кого він зник. Наша мережа жива, отже, пішов суперник. */
  dropped() {
    if (this.state === 'match') { if (this.net && this.net.offline()) this.techLoss(); else this.oppLeft(); return; }
    if (this.mode === 'quick') { this.reseek('Зв’язок із суперником втрачено — шукаємо іншого'); return; }
    this.close(); this.setErr('Зв’язок втрачено');
  }

  /** Після результату: реванш — знову «Готовий» в обох (господар стартує). */
  rematch() {
    if (!this.net || !this.net.open || !this.opp) { this.ui.toast('Суперника вже немає в кімнаті'); return false; }
    this.state = 'lobby'; this.setReady(true); return true;
  }
  toLobby() {
    // гість на реконекті, а «end» йому ще винні: кімната лишається, інакше він не дізнається результату зіграного матчу
    if (this.net && !this.net.open && this.role === 'host' && this.lastEnd) { this.state = 'hosting'; this.opp = null; this.ready = { me: false, opp: false }; return; }
    if (!this.net || !this.net.open) { this.close(); return; }
    this.state = 'lobby';
    if (this.ready.me) { this.ready.me = false; this.net.send({ t: 'ready', on: false }); }   // «готовий» суперника лишається: він не повториться
  }

  close(linger = 0) {
    clearTimeout(this.lostT); clearTimeout(this.awayT); clearTimeout(this.oppAwayT); clearTimeout(this.giveT); this.chkGuest = false; this.lastEnd = null;
    if (this.seeker) { this.seeker.stop(); this.seeker = null; }
    this.unqueue(); this.ticket = null;
    if (this.link) { this.link.uninstall(); this.link = null; }
    this.g.link = null;
    if (this.net) { this.net.close(linger); this.net = null; }
    this.guest = null; this.opp = null; this.ready = { me: false, opp: false };
    if (this.state !== 'result') this.state = 'idle';
    this.code = '';
  }
}
