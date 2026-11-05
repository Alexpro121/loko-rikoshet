// Онлайн-сесія: кімната за кодом → лобі (обидва бачать клуби одне одного й тиснуть «Готовий») → матч → результат
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

const AWAY_MS = 30000;                                       // згорнув гру в матчі довше за це: вийшов
const OPP_AWAY_MS = 32000;                                   // суперник згорнув і не сказав «bye» (телефон приспав вкладку): трохи пізніше за його власний AWAY_MS
const REJOIN_MS = 35000;                                     // після F5 гість ще може повернутись у той самий матч
const BYE_MS = 400;                                          // «bye» має встигнути піти, перш ніж закриємо з'єднання
const BUSY_MS = 3000;                                        // «busy» чинний лише на самому старті: посеред матчу чужий клієнт ним нічого не анулює
const pickEnv = (v, list) => (v === 'random' || !list.includes(v) ? list[(Math.random() * list.length) | 0] : v);

export class Online {
  constructor(game, ui) {
    this.g = game; this.ui = ui; game.online = this;
    this.net = null; this.state = 'idle'; this.code = ''; this.err = ''; this.opp = null; this.ready = { me: false, opp: false };
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
    this.close(); this.state = 'creating'; this.err = ''; this.refresh();
    const net = (this.net = new Net()); this.bind(net);
    try { this.code = await net.host(); if (this.net !== net) return; this.state = 'hosting'; }
    catch (e) { if (this.net !== net) return; this.close(); this.err = this.why(e); }
    this.refresh();
  }
  async join(code) {
    code = cleanCode(code);
    if (code.length !== 5) { this.setErr('Код — 5 символів'); return; }
    this.close(); this.state = 'joining'; this.code = code; this.err = ''; this.refresh();
    const net = (this.net = new Net()); this.bind(net);
    try { await net.join(code); } catch (e) { if (this.net !== net) return; this.close(); this.err = this.why(e); this.refresh(); }
  }
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
    net.on('open', () => { if (this.net !== net) return; this.state = 'lobby'; this.ready = { me: false, opp: false }; this.hello(); audio.horn(); this.refresh(); });
    net.on('back', () => {
      if (this.net !== net) return;
      clearTimeout(this.lostT); this.hello(); this.sendVis();
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
        else { this.state = 'hosting'; if (this.opp) this.ui.toast('Суперник відключився — кімната чекає'); this.opp = null; this.ready = { me: false, opp: false }; }
      } else if (this.state !== 'match') this.state = 'wait';
      this.refresh();
    });
    net.on('gone', () => { if (this.net === net) this.dropped(); });
  }
  hello() { this.net.send({ t: 'hello', v: PROTO, p: toWire(), st: this.state }); }
  /** Свій клуб змінився (редактор, тренування, скаут): суперник має грати проти нього, а не проти старого привітання. */
  sync() { if (this.net && this.net.open && this.state !== 'match') this.hello(); }

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
    this.state = 'match'; this.oppRating = this.opp.rating; markLive(this.oppRating);
    this.ui.closePanel(true); this.ui.hideResult();
    this.g.sm.go('MATCH', { guest: this.guest, spec, hudSpec });
  }

  /** Господар: фінальний свисток (Match.end → RESULT). Гостю — рахунок і автори голів; собі — нагороди. */
  finish(r) {
    if (r.applied) return r.rew;
    r.applied = true; clearLive();
    if (this.net && this.role === 'host' && !r.forfeit && !r.void) { this.lastEnd = { t: 'end', me: r.me, opp: r.opp, scorers: r.scorers }; this.net.send(this.lastEnd); }   // при обриві не дійде: повторимо, коли гість повернеться
    this.state = 'result';
    if (this.link) { this.link.uninstall(); }
    if (r.void) return (r.rew = null);
    const mine = (r.scorers || []).filter((s) => s.mine).map((s) => s.name);
    r.rew = applyResult(r.outcome, r.me, this.oppRating ?? 1000, mine);
    if (this.net && !r.forfeit) this.hello();                // новий рейтинг і рівень — для реваншу й картки в лобі
    return r.rew;
  }
  guestEnd(m) {
    const n = (v) => Math.max(0, Math.min(99, Math.round(+v) || 0));
    const me = n(m.opp), opp = n(m.me);
    const scorers = (Array.isArray(m.scorers) ? m.scorers : []).slice(0, 40).map((s) => ({ name: plain(s && s.name).slice(0, 24), min: plain(s && s.min).slice(0, 8), mine: !(s && s.mine) }));
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
    if (this.role === 'host') { this.opp = null; this.ready = { me: false, opp: false }; this.state = 'hosting'; this.ui.toast('Суперник вийшов — кімната чекає'); }
    else { this.close(); this.ui.toast('Господар закрив кімнату'); }
    this.refresh();
  }
  /** Зв'язок так і не відновився: поразка тому, у кого він зник. Наша мережа жива, отже, пішов суперник. */
  dropped() {
    if (this.state === 'match') { if (this.net && this.net.offline()) this.techLoss(); else this.oppLeft(); return; }
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
    clearTimeout(this.lostT); clearTimeout(this.awayT); clearTimeout(this.oppAwayT); this.chkGuest = false; this.lastEnd = null;
    if (this.link) { this.link.uninstall(); this.link = null; }
    this.g.link = null;
    if (this.net) { this.net.close(linger); this.net = null; }
    this.guest = null; this.opp = null; this.ready = { me: false, opp: false };
    if (this.state !== 'result') this.state = 'idle';
    this.code = '';
  }
}
