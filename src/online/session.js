// Онлайн-сесія: кімната за кодом → лобі (обидва бачать клуби одне одного й тиснуть «Готовий») → матч → результат
// → реванш. Господар — той, хто створив кімнату: його гра рахує матч (host.js), гість показує її (guest.js).
// Вихід посеред матчу — технічна поразка того, хто вийшов. Обрив зв'язку: гість сам перепідключається (до ~25 с),
// господар чекає 30 с (гравцем гостя тим часом грає ІІ); не повернувся — матч не зараховується нікому.
import { S } from '../state/save.js';
import { audio } from '../core/audio.js';
import { Net, PROTO, cleanCode } from './net.js';
import { HostLink } from './host.js';
import { GuestMatch } from './guest.js';
import { OP, toWire, fromWire, matchClub, flagSvg, applyResult } from './profile.js';

const BYE_MS = 400;                                          // «bye» має встигнути піти, перш ніж закриємо з'єднання
const pickEnv = (v, list) => (v === 'random' || !list.includes(v) ? list[(Math.random() * list.length) | 0] : v);

export class Online {
  constructor(game, ui) {
    this.g = game; this.ui = ui; game.online = this;
    this.net = null; this.state = 'idle'; this.code = ''; this.err = ''; this.opp = null; this.ready = { me: false, opp: false };
    this.link = null; this.guest = null; this.last = null; this.lostT = 0;
  }
  get role() { return this.net ? this.net.role : null; }
  inMatch() { return this.state === 'match'; }
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
      clearTimeout(this.lostT); this.hello();
      if (this.state === 'match') {
        if (this.link) { this.ui.hud.warn(null); this.link.resync(); this.chkGuest = true; }
        this.ui.toast('Суперник знову на зв’язку');
      }
      else if (this.state !== 'result') { this.state = 'lobby'; this.ready = { me: false, opp: false }; }
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
        if (m.v !== PROTO) { this.close(); this.setErr('У суперника інша версія гри — оновіть сторінку'); return; }
        { const first = !this.opp; this.opp = fromWire(m.p); if (first) this.ui.toast('Суперник: ' + this.opp.club.name); }
        if (this.chkGuest) {                                 // гість повернувся без матчу (оновив сторінку): наздоганяє гру, що триває
          this.chkGuest = false;
          if (m.st !== 'match' && this.state === 'match' && this.link) { this.net.send({ t: 'start', env: this.env }); this.link.sendRef(); this.link.resync(); }
        }
        this.refresh(); return;
      case 'full':
        if (this.state === 'match') { this.dropped(); return; }   // місце вже зайняв хтось інший: повертатися нікуди
        this.close(); this.setErr('Кімната вже зайнята'); return;
      case 'ready':
        this.ready.opp = !!m.on; this.refresh();
        if (this.role === 'host' && this.ready.me && this.ready.opp) this.startMatch();
        return;
      case 'start': if (this.role === 'guest' && this.opp) this.beginGuest(m); return;
      case 'ev': if (this.guest) this.guest.onEvent(m.e, m.ht); return;
      case 'ref': if (this.guest) this.guest.onRef(m.d); return;
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
    return {
      leagueName: 'Онлайн-матч', no: 1, of: 1, final: false, club: away, home, mySquad: hostP.heroes, oppSquad: guestP.heroes, env,
      myForm: hostP.club.form, formation: guestP.club.form, note: '', scale: 1, time: 270, runSpeed: 9.2, press: 0.55, line: 0.06, gkErr: 2.2, counterSpeed: 48, tackle: 0.62, slowFactor: 0.16,
      scout: { corner: 0, flank: 0 }, fixtureIdx: 0, season: 0, league: 0, globalNo: 1,
    };
  }
  /** Свій клуб у тому ж вигляді, що його бачить суперник (через ту саму перевірку) — сцени в обох однакові. */
  me() { return fromWire(toWire()); }

  startMatch() {
    const env = { time: pickEnv(S.settings.timeOfDay, ['day', 'dusk', 'night']), weather: pickEnv(S.settings.weather, ['clear', 'clear', 'cloudy', 'rain', 'snow', 'fog']) };
    this.hello(); this.net.send({ t: 'start', env }); this.env = env;
    this.ready = { me: false, opp: false };
    const spec = this.buildSpec(this.me(), this.opp, env);
    if (this.link) this.link.uninstall();
    this.link = new HostLink(this, this.g); spec.online = { role: 'host', link: this.link };
    this.state = 'match'; this.oppRating = this.opp.rating;
    this.ui.closePanel(true); this.ui.hideResult();
    this.g.link = this.link;
    this.g.sm.go('MATCH', { spec });
  }
  beginGuest(m) {
    const env = m.env && typeof m.env === 'object' ? { time: pickEnv(m.env.time, ['day', 'dusk', 'night']), weather: pickEnv(m.env.weather, ['clear', 'cloudy', 'rain', 'snow', 'fog']) } : { time: 'day', weather: 'clear' };
    this.ready = { me: false, opp: false };
    const spec = this.buildSpec(this.opp, this.me(), env);
    const hudSpec = { leagueName: 'Онлайн-матч', no: 1, of: 1, club: spec.home, home: spec.club };
    if (this.guest) this.guest.exit();
    this.guest = new GuestMatch(this, this.g, this.g.ensureMatch()); this.hudSpec = hudSpec;
    this.state = 'match'; this.oppRating = this.opp.rating;
    this.ui.closePanel(true); this.ui.hideResult();
    this.g.sm.go('MATCH', { guest: this.guest, spec, hudSpec });
  }

  /** Господар: фінальний свисток (Match.end → RESULT). Гостю — рахунок і автори голів; собі — нагороди. */
  finish(r) {
    if (r.applied) return r.rew;
    r.applied = true;
    if (this.net && this.role === 'host' && !r.forfeit && !r.void) this.net.send({ t: 'end', me: r.me, opp: r.opp, scorers: r.scorers });
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
    const scorers = (Array.isArray(m.scorers) ? m.scorers : []).slice(0, 40).map((s) => ({ name: String(s && s.name).slice(0, 24), min: String(s && s.min).slice(0, 8), mine: !(s && s.mine) }));
    this.g.sm.go('RESULT', { online: true, outcome: me > opp ? 'win' : me < opp ? 'loss' : 'draw', me, opp, spec: this.hudSpec, scorers });
  }

  /** Вихід із матчу (кнопка «Здатися») — технічна поразка; суперникові — перемога. */
  leave() {
    if (this.state === 'match') {
      this.net && this.net.send({ t: 'bye' });
      const sp = this.role === 'host' ? { club: matchClub(this.opp.club), home: matchClub(OP.club) } : this.hudSpec;
      const r = { online: true, outcome: 'loss', me: 0, opp: 3, spec: sp, scorers: [], forfeit: 'me' };
      this.finish(r); this.close(BYE_MS); this.g.sm.go('MENU'); this.ui.toast('Технічна поразка 0:3');
      return;
    }
    this.net && this.net.send({ t: 'bye' }); this.close(BYE_MS); this.refresh();
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
  /** Зв'язок так і не відновився — матч не зараховано. */
  dropped() {
    if (this.state === 'match') {
      const sp = this.role === 'host' ? { club: matchClub(this.opp.club), home: matchClub(OP.club) } : this.hudSpec;
      this.stopMatch(); this.close(); this.state = 'result';
      this.g.sm.go('RESULT', { online: true, outcome: 'draw', me: 0, opp: 0, spec: sp, scorers: [], void: true });
      return;
    }
    this.close(); this.setErr('Зв’язок втрачено');
  }

  /** Після результату: реванш — знову «Готовий» в обох (господар стартує). */
  rematch() {
    if (!this.net || !this.net.open || !this.opp) { this.ui.toast('Суперника вже немає в кімнаті'); return false; }
    this.state = 'lobby'; this.setReady(true); return true;
  }
  toLobby() {
    if (!this.net || !this.net.open) { this.close(); return; }
    this.state = 'lobby';
    if (this.ready.me) { this.ready.me = false; this.net.send({ t: 'ready', on: false }); }   // «готовий» суперника лишається: він не повториться
  }

  close(linger = 0) {
    clearTimeout(this.lostT); this.chkGuest = false;
    if (this.link) { this.link.uninstall(); this.link = null; }
    this.g.link = null;
    if (this.net) { this.net.close(linger); this.net = null; }
    this.guest = null; this.opp = null; this.ready = { me: false, opp: false };
    if (this.state !== 'result') this.state = 'idle';
    this.code = '';
  }
}
