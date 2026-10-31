import { S, commit, resetAll, subscribe } from '../state/save.js';
import { LEAGUES, FIXTURES, STRIKERS, KEEPERS, ACADEMY, STADIUM_TIERS, STADIUM_TIER_NAMES, KIT_LOKO, KIT_GK_LOKO, KITS, matchSpec, CAM_PRESETS } from '../config.js';
import { stadiumCost, INCOME_STEP, incomePct, incomeMult, stadiumTier, nextTierLevel, pendingCash, cashRate, CASH_CAP_MIN, rollGraduate, fmt } from '../state/economy.js';
import { audio, vibrate } from '../core/audio.js';
import { I, crest, lokoCrest } from './icons.js';
import { VOX } from './vox.js';
import { CLUB, CHRONICLE, LEGENDS, ALUMNI, HONOURS, STADIUM, FACTS, randomFact } from '../club.js';
import { Hud } from './hud.js';
import { playIntro } from './intro.js';
import { portrait } from './portrait.js';
import { ensureSquad, oppSquad, allPlayers, swapTargets, swapPlayers, ovr, tierOf, keysFor, STAT_NAMES, STAT_HINT, ROLE_UA, trainCost, trainStat, xpNeed, squadRating, signGraduate, squadLook, myKit, lookSig } from '../state/squad.js';

/** Тестові інструменти (+10 000 монет) лише з ?test в адресі або в dev-збірці. */
const TEST_MODE = !!(import.meta.env && import.meta.env.DEV) || /[?&]test/.test(location.search);
import { striker } from '../state/economy.js';
import { rivalOf, scoutNote } from '../state/rivals.js';

const rarCol = (id) => ACADEMY.rarities.find((r) => r.id === id) || ACADEMY.rarities[0];

function countTo(el, to, ms = 650, fmtFn = fmt) {
  const from = Number(el.dataset.v || 0); el.dataset.v = to;
  if (from === to) { el.textContent = fmtFn(to); return; }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmtFn(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const sheet = (title, body, cls = '') => `
<div class="sheet ${cls}">
  <header class="sheet-h"><h2>${title}</h2><button class="sq btn-red" data-act="close-panel" aria-label="Закрити">${I.close}</button></header>
  <div class="sheet-b">${body}</div>
</div>`;

export class UI {
  constructor(root) {
    this.root = root; this.game = null; this.panel = null; this.tab = 'squad'; this.sel = null; this.stTab = 'info';
    root.insertAdjacentHTML('beforeend', `
<section class="menu" id="menu" hidden>
  <header class="top">
    <div class="top-l"><button class="sq btn-dark" data-act="settings" aria-label="Налаштування">${I.gear}</button><button class="sq btn-dark" data-act="fs" aria-label="На весь екран">${I.full}</button></div>
    <div class="league" id="m-league"></div>
    <div class="wallet">
      <button class="purse gold" ${TEST_MODE ? 'data-act="test-coins"' : ''}><b id="m-coins" data-v="0">0</b>${I.coin}</button>
      <div class="purse mint"><b id="m-tickets" data-v="0">0</b>${I.ticket}</div>
      <button class="cash" id="m-cash" data-act="cash" hidden></button>
    </div>
  </header>
  <aside class="m-side m-left" id="m-club" data-act="nav-transfers"></aside>
  <aside class="m-side m-right" id="m-next"></aside>
  <footer class="bottom">
    <div class="cards">
      <button class="card" id="m-stad" data-act="up-stadium"><span class="card-ic">${I.stadium}</span><span class="card-t"><b>Стадіон</b><em id="m-stad-v"></em></span><span class="card-p" id="m-stad-c"></span></button>
    </div>
    <nav class="nav" id="m-nav">
      <button class="nb on" data-act="nav-match"><span class="nb-face"><i class="nb-glint"></i></span><i class="nb-sh"></i><span class="nb-ic">${VOX.match}</span><span class="nb-t">Матч</span></button>
      <button class="nb" data-act="nav-transfers"><span class="nb-face"><i class="nb-glint"></i></span><i class="nb-sh"></i><span class="nb-ic">${VOX.team}</span><span class="nb-t">Команда</span></button>
      <button class="nb" data-act="nav-academy"><span class="nb-face"><i class="nb-glint"></i></span><i class="nb-sh"></i><span class="nb-ic">${VOX.academy}</span><span class="nb-t">Академія</span><u id="m-acad-dot" hidden></u></button>
      <button class="nb" data-act="nav-stadium"><span class="nb-face"><i class="nb-glint"></i></span><i class="nb-sh"></i><span class="nb-ic">${VOX.stadium}</span><span class="nb-t">Стадіон</span></button>
      <button class="nb nb-online" data-act="nav-online"><span class="nb-face"><i class="nb-glint"></i></span><i class="nb-sh"></i><span class="nb-ic">${VOX.online}</span><span class="nb-t">Онлайн</span><u class="nb-live" aria-hidden="true"></u></button>
    </nav>
    <button class="cta" id="m-cta" data-act="play" aria-label="Почати матч">
      <span class="go-tag"><em>Матч</em><strong id="m-cta-n"></strong><small id="m-cta-s"></small></span>
      <span class="go-body"><b class="go-t">ВПЕРЕД!</b><svg class="go-chev" viewBox="0 0 40 24" aria-hidden="true"><path d="M2 3l11 9-11 9V3zM15 3l11 9-11 9V3zM28 3l11 9-11 9V3z"/></svg><i class="go-sweep" aria-hidden="true"></i></span>
    </button>
  </footer>
</section>
<section class="panel" id="panel" hidden></section>`);
    this.hud = new Hud(root);
    root.insertAdjacentHTML('beforeend', `
<section class="overlay result" id="result" hidden></section>
<section class="overlay pause" id="pause" hidden>
  <div class="sp-bg pz-bg" aria-hidden="true"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i></div>
  <div class="pz">
    <div class="pz-l">
      <h2 class="pz-t" data-t="ПАУЗА">ПАУЗА</h2>
      <div class="pz-sc" id="p-score"></div>
      <div class="pz-fact"><b>Знали?</b><p class="fact" id="p-fact"></p></div>
    </div>
    <div class="pz-r">
      <button class="pz-b go" data-act="resume">${I.play}<b>Продовжити</b></button>
      <button class="pz-b" data-act="pens">${I.ball}<b>Пенальті</b></button>
      <button class="pz-b" data-act="settings">${I.gear}<b>Налаштування</b></button>
      <button class="pz-b red" data-act="quit">${I.close}<b>В меню</b></button>
    </div>
  </div>
</section>
<section class="overlay settings" id="settings" hidden></section>
<section class="overlay custom" id="custom" hidden></section>
<section class="overlay reveal" id="reveal" hidden></section>
<section class="splash" id="splash">
  <div class="sp-bg" aria-hidden="true"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i></div>
  <div class="sp-rails" aria-hidden="true"><i></i><i></i><u></u><u class="g"></u></div>
  <div class="splash-in">
    <div class="sp-crest">${lokoCrest()}</div>
    <h1 class="sp-title" aria-label="LOKO RUSH">
      <span class="sp-trail" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="l1" data-t="LOKO">LOKO</span>
      <span class="l2" data-t="RUSH">RUSH</span>
    </h1>
    <button class="sp-go" data-act="start"><span class="sp-go-t">ГРАТИ</span><svg viewBox="0 0 40 24" aria-hidden="true"><path d="M2 3l11 9-11 9V3zM15 3l11 9-11 9V3zM28 3l11 9-11 9V3z"/></svg></button>
    <div class="ios-hint" id="ios-hint" hidden><b>Для повного екрана на iPhone</b><ol><li>Натисни <i class="shr">⬆︎</i> «Поділитись» у Safari</li><li>Обери «На початковий екран»</li><li>Відкрий гру з нової іконки</li></ol><button class="btn alt" data-act="ios-ok"><b>ЗРОЗУМІЛО</b></button></div>
  </div>
</section>
<div class="joy-bar" id="joy-bar" hidden><span>Перетягни джойстик у зручне місце</span><button class="btn alt" data-act="joy-reset"><b>СКИНУТИ</b></button><button class="btn go" data-act="joy-done"><b>ГОТОВО</b></button></div>
<div class="joy" id="joy" hidden><div class="joy-ring"><i class="joy-knob"></i></div></div>
<div class="toast" id="toast" hidden></div>
<div class="flash" id="flash"></div>
<div class="slowfx" id="slowfx"></div>`);
    const q = (id) => root.querySelector('#' + id);
    this.el = { joy: q('joy'), menu: q('menu'), panel: q('panel'), result: q('result'), pause: q('pause'), settings: q('settings'), custom: q('custom'), reveal: q('reveal'), splash: q('splash'), toast: q('toast'), flash: q('flash'), league: q('m-league'), club: q('m-club'), next: q('m-next'), coins: q('m-coins'), tickets: q('m-tickets'), cash: q('m-cash'), cta: q('m-cta'), ctaS: q('m-cta-s'), stad: q('m-stad'), stadV: q('m-stad-v'), stadC: q('m-stad-c'), nav: q('m-nav'), acadDot: q('m-acad-dot') };
    root.addEventListener('input', (e) => {
      if (this.online && this.online.input(e.target)) return;
      const nm = e.target.closest('[data-cname]');
      if (nm && this.cu != null) { const pl = allPlayers()[this.cu]; if (pl) { pl.name = nm.value.slice(0, 22) || pl.name; pl.custom = true; commit(); } return; }
      const t = e.target.closest('[data-range]'); if (!t) return;
      const k = t.dataset.range, v = +t.value;
      S.settings[k] = v; this.applyControls(); commit();
      if (k.startsWith('cam')) this.game.computeMatchBase();
      const o = t.parentElement.querySelector('output'); if (o) o.textContent = (t.dataset.sign && v > 0 ? '+' : '') + v + (t.dataset.unit || '%');
    });
    root.addEventListener('click', (e) => {
      if (e.target === this.el.settings) return this.closeSettings();                 // тап по затемненню закриває вікно
      if (e.target === this.el.custom) return this.closeCustom();
      const t = e.target.closest('[data-act]'); if (t) this.act(t.dataset.act, t);
    });
    this.hud.onShow = () => this.setMatchUi(true);
    this.hud.onHide = () => this.setMatchUi(false);
    this.tiltNav();
    this.hud.onCine = (on) => { if (this.cineOn !== on) { this.cineOn = on; this.applyControls(); } };
    this.initJoy();
    this.applyControls();
    this.iosHint();
    subscribe(() => this.refresh());
    addEventListener('keydown', (e) => this.key(e));
    setInterval(() => this.tickCash(), 1000);
  }

  // ---------------------------------------------------------------- розмітка під екран
  onResize(w, h) {
    const s = document.documentElement.style;
    s.setProperty('--vh', h / 100 + 'px'); s.setProperty('--vw', w / 100 + 'px');
    const rot = h > w * 1.02;
    if (this.rotated !== rot) {
      this.rotated = rot;
      if (rot && this.game && this.game.match && this.game.match.isPlaying() && !(this.game.online && this.game.online.inMatch())) this.pause();
    }
  }

  key(e) {
    if (e.repeat) return;
    // у полі вводу (назва, код кімнати) літери — це текст, а не гарячі клавіші; Enter у полі коду — увійти
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      if (e.key === 'Enter' && e.target.matches('[data-ocode]') && this.online) this.online.act('on-join', e.target);
      if (e.key === 'Enter' || e.key === 'Escape') e.target.blur();
      return;
    }
    const g = this.game;
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (g.sm.name === 'MATCH') { if (!this.el.pause.hidden) this.act('resume'); else this.pause(); }
      else if (!this.el.settings.hidden) this.closeSettings();
      else if (this.panel) this.closePanel();
    } else if (e.key === 'f' || e.key === 'F') g.toggleFullscreen();
    else if ((e.key === ' ' || e.key === 'Enter') && g.sm.name === 'MENU' && !this.panel && this.el.splash.hidden && this.el.settings.hidden) this.menuTap();
  }

  /** iPhone не вміє fullscreen API: пропонуємо встановити гру на початковий екран (тоді вона відкривається без рядка Safari). */
  isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  isStandalone() { return !!navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || (window.matchMedia && matchMedia('(display-mode: fullscreen)').matches); }
  iosHint(force) {
    const el = this.el.splash && this.el.splash.querySelector('#ios-hint'); if (!el) return;
    let seen = false; try { seen = localStorage.getItem('loko-ios-hint') === '1'; } catch (_) { /* ignore */ }
    el.hidden = !(this.isIOS() && !this.isStandalone() && (force || !seen));
  }

  // ---------------------------------------------------------------- керування
  /** Джойстик: на телефоні за замовчуванням, інакше за налаштуванням. */
  useJoy() {
    const c = S.settings.control;
    return c === 'joy' || (c === 'auto' && !!(this.game && this.game.coarse));
  }
  setMatchUi(on) { this.matchActive = on; this.applyControls(); }
  applyControls() {
    // джойстик плавно проявляється й ховається; у катсценах його не видно
    const jel = this.el.joy, want = (this.matchActive && this.useJoy()) || this.joyEdit, show = want && (this.joyEdit || !this.cineOn);
    clearTimeout(this._joyT);
    if (show) {
      if (jel.hidden) { jel.classList.add('off'); jel.hidden = false; void jel.offsetWidth; }
      jel.classList.remove('off');
    } else if (!jel.hidden) {
      jel.classList.add('off'); jel.querySelector('.joy-knob').style.transform = ''; if (this.joyRelease) this.joyRelease(false);
      this._joyT = setTimeout(() => { if (jel.classList.contains('off')) jel.hidden = true; }, 400);
    }
    const js = this.el.joy.style, st0 = S.settings, custom = st0.joyX >= 0 && st0.joyY >= 0;
    js.left = custom ? st0.joyX * 100 + '%' : ''; js.top = custom ? st0.joyY * 100 + '%' : '';
    js.right = js.bottom = custom ? 'auto' : ''; js.transform = custom ? 'translate(-50%, -50%)' : '';
    this.root.classList.toggle('hand-left', S.settings.hand === 'left');
    const st = this.root.style;
    st.setProperty('--joy-s', (S.settings.joySize / 100).toFixed(2));
    st.setProperty('--joy-a', (S.settings.joyAlpha / 100).toFixed(2));
  }
  initJoy() {
    const el = this.el.joy, ring = el.querySelector('.joy-ring'), knob = el.querySelector('.joy-knob');
    let pid = -1, cx = 0, cy = 0, R = 1;
    const set = (e) => {
      let dx = (e.clientX - cx) / R, dy = (e.clientY - cy) / R;
      const l = Math.hypot(dx, dy) || 1, m = Math.min(1, l);
      dx /= l; dy /= l;
      knob.style.transform = `translate(${dx * m * R * 0.62}px, ${dy * m * R * 0.62}px)`;
      if (this.game && this.game.match) this.game.match.joyMove(dx, dy, m);
    };
    let drag = -1;
    // палець «загубився» (джойстик сховався в катсцені, вікно втратило фокус, система забрала дотик) — без цього скидання
    // pid лишався зайнятим і джойстик більше не реагував до перезапуску
    const release = (fire) => {
      if (pid === -1) return;
      const p = pid; pid = -1; this.joyActive = false; knob.style.transform = '';
      try { if (el.hasPointerCapture(p)) el.releasePointerCapture(p); } catch (_) { /* ignore */ }
      const m = this.game && this.game.match; if (m) { if (fire) m.pointerUp(); else m.cancelAim(); }
    };
    // прицілювання ще не почалось (палець притиснули трохи раніше, ніж м'яч прийшов, або приціл скасував інший дотик) —
    // починаємо, щойно можна, не змушуючи відпускати й тиснути знову
    const ensure = () => { const m = this.game && this.game.match; if (m && pid !== -1 && m.bs === 'ready') m.joyStart(); };
    el.addEventListener('pointerdown', (e) => {
      if (this.joyEdit) { drag = e.pointerId; try { el.setPointerCapture(drag); } catch (_) { /* ignore */ } e.preventDefault(); return; }
      if (!this.game || !this.game.match) return;
      if (pid !== -1) { if (e.pointerId === pid) return; release(false); }      // новий дотик — старий уже не повернеться
      const r = ring.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2; R = r.width / 2 || 1;
      pid = e.pointerId; this.joyActive = true; try { el.setPointerCapture(pid); } catch (_) { /* ignore */ }
      this.game.match.joyStart(); set(e); e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (this.joyEdit && e.pointerId === drag) {
        const cl = (v, a, b) => Math.max(a, Math.min(b, v));
        S.settings.joyX = cl(e.clientX / innerWidth, 0.1, 0.9); S.settings.joyY = cl(e.clientY / innerHeight, 0.2, 0.88); this.applyControls(); return;
      }
      if (e.pointerId === pid) { ensure(); set(e); }
    });
    el.addEventListener('pointerup', (e) => { if (e.pointerId === drag) { drag = -1; commit(); } });
    el.addEventListener('pointerup', (e) => { if (e.pointerId === pid) release(true); });
    el.addEventListener('pointercancel', (e) => { if (e.pointerId === pid) release(false); });
    el.addEventListener('lostpointercapture', (e) => { if (e.pointerId === pid) release(false); });
    addEventListener('blur', () => release(false));
    document.addEventListener('visibilitychange', () => { if (document.hidden) release(false); });
    this.joyRelease = release;
  }

  // ---------------------------------------------------------------- дії
  act(a, el) {
    const g = this.game;
    switch (a) {
      case 'start': this.started = true; this.game.acquireWake(); audio.unlock(); g.enterFullscreen(); this.el.splash.classList.add('out'); setTimeout(() => { this.el.splash.hidden = true; }, 380); audio.click(); g.ensureMatch(); playIntro(this.root, () => { audio.music('menu'); this.showMenu(); }); return;
      case 'play': return this.menuTap();
      case 'test-coins': if (!TEST_MODE) return; S.coins += 10000; commit(); audio.coin(3); this.toast('+10 000 монет (тест)'); return;
      case 'pens': { const mm = g.match; if (!mm) return; audio.click(); this.el.pause.hidden = true; if (mm.phase === 'paused') mm.resume(); mm.startPens(); return; }
      case 'ios-ok': try { localStorage.setItem('loko-ios-hint', '1'); } catch (_) { /* ignore */ } this.iosHint(); return;
      case 'fs': audio.click(); if (this.isIOS() && !this.isStandalone()) { this.closeSettings(); this.el.splash.hidden = false; this.el.splash.classList.remove('out'); this.iosHint(true); return; } return g.toggleFullscreen();
      case 'settings': audio.click(); return this.openSettings();
      case 'close-settings': audio.back(); return this.closeSettings();
      case 'cash': return this.claimCash();
      case 'up-stadium': return this.buyStadium();
      case 'nav-match': audio.click(); return this.closePanel();
      case 'nav-transfers': case 'nav-academy': case 'nav-stadium': case 'nav-online': audio.click(); return this.openPanel(a.slice(4));
      case 'close-panel': audio.back(); return this.closePanel();
      case 'tab-st-info': case 'tab-st-chron': case 'tab-st-sym': audio.click(); this.stTab = a.slice(7); return this.renderPanel();
      case 'tab-squad': case 'tab-strikers': case 'tab-keepers': audio.click(); this.tab = a.slice(4); return this.renderPanel();
      case 'acad-collect': return this.collectGraduate();
      case 'acad-boost': return this.boostAcademy();
      case 'close-reveal': audio.click(); this.el.reveal.hidden = true; return this.renderPanel();
      case 'pause': audio.click(); return this.pause();
      case 'resume': audio.click(); this.el.pause.hidden = true; if (g.match) g.match.resume(); return;
      case 'quit': audio.back(); this.el.pause.hidden = true; return g.quitMatch();
      case 'result-menu': audio.click(); return g.toMenu();
      case 'result-next': audio.click(); return g.play();
      case 'result-retry': audio.click(); return g.play();
      case 'joy-move': this.joyEdit = true; this.el.joy.classList.add('edit'); this.closeSettings(); this.root.querySelector('#joy-bar').hidden = false; this.applyControls(); return;
      case 'joy-done': this.joyEdit = false; this.el.joy.classList.remove('edit'); this.root.querySelector('#joy-bar').hidden = true; this.applyControls(); commit(); this.openSettings(); return;
      case 'joy-reset': S.settings.joyX = S.settings.joyY = -1; this.applyControls(); commit(); return;
      case 'ctl-auto': case 'ctl-joy': case 'ctl-drag': S.settings.control = a.slice(4); commit(); this.applyControls(); audio.click(); return this.renderSettings();
      case 'hand-right': case 'hand-left': S.settings.hand = a.slice(5); commit(); this.applyControls(); audio.click(); return this.renderSettings();
      case 'set-sfx': S.settings.sfx = !S.settings.sfx; audio.applySettings(); audio.click(); commit(); return this.renderSettings();
      case 'set-music': S.settings.music = !S.settings.music; audio.applySettings(); commit(); return this.renderSettings();
      case 'set-shake': S.settings.camShake = !S.settings.camShake; commit(); audio.click(); return this.renderSettings();
      case 'set-haptics': S.settings.haptics = !S.settings.haptics; commit(); if (S.settings.haptics && navigator.vibrate) navigator.vibrate(30); return this.renderSettings();
      case 'q-auto': case 'q-high': case 'q-low': S.settings.quality = a.slice(2); g.res = 1; g.applyPixelRatio(true); commit(); audio.click(); return this.renderSettings();
      case 'reset': if (el.dataset.arm) { resetAll(); ensureSquad(); audio.back(); this.closeSettings(); this.toast('Прогрес скинуто'); g.island.setTier(0, false); g.island.setTrophies(0); } else { el.dataset.arm = 1; el.querySelector('b').textContent = 'ТОЧНО СКИНУТИ?'; setTimeout(() => { delete el.dataset.arm; const b = el.querySelector('b'); if (b) b.textContent = 'СКИНУТИ ПРОГРЕС'; }, 3000); } return;
      default:
        if (a.startsWith('on-')) return this.online && this.online.act(a, el);
        if (a.startsWith('sel:')) { this.sel = +a.slice(4); audio.click(); return this.renderPanel(); }
        if (a.startsWith('cam-')) { if (CAM_PRESETS[a.slice(4)]) { S.settings.camMode = a.slice(4); commit(); g.computeMatchBase(); audio.click(); return this.renderSettings(); } }
        if (a.startsWith('set-tab:')) { this.setTab = a.slice(8); audio.click(); return this.renderSettings(); }
        if (a.startsWith('tod-')) { S.settings.timeOfDay = a.slice(4); commit(); audio.click(); return this.renderSettings(); }
        if (a.startsWith('wth-')) { S.settings.weather = a.slice(4); commit(); audio.click(); return this.renderSettings(); }
        if (a.startsWith('cust:')) return this.openCustom(+a.slice(5));
        if (a.startsWith('cu-')) return this.customAct(a, el);
        if (a.startsWith('train:')) return this.train(a);
        if (a.startsWith('swap:')) { const [, bi, slot] = a.split(':'); if (swapPlayers(+slot, +bi - 11)) { this.sel = +slot; audio.buy(); this.toast('Заміна проведена'); } else audio.deny(); return this.renderPanel(); }
        if (a.startsWith('buy:')) return this.buy(a.slice(4));
        if (a.startsWith('equip:')) return this.equip(a.slice(6));
    }
  }

  menuTap() {
    const g = this.game; this.el.cta.classList.remove('punch'); void this.el.cta.offsetWidth; this.el.cta.classList.add('punch');
    if (g.sm.name !== 'MENU' || !this.el.splash.hidden || !this.el.settings.hidden || !this.el.reveal.hidden) return;
    if (this.panel) this.closePanel(true);                                             // локомотив видно й над панеллю: їде одразу
    audio.click(); audio.unlock();
    g.play();
  }

  toast(text) {
    const t = this.el.toast; t.textContent = text; t.hidden = false;
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => { t.hidden = true; }, 2200);
  }
  setSlow(on) { const f = this.root.querySelector('#slowfx'); if (f) f.classList.toggle('on', !!on); }
  flash(color) {
    const f = this.el.flash; f.style.setProperty('--c', color);
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }

  // ---------------------------------------------------------------- меню
  showMenu() {
    if (!this.started) return;
    const m = this.el.menu;
    m.hidden = false; m.classList.remove('hide', 'enter'); void m.offsetWidth; m.classList.add('enter');
    clearTimeout(this._enterT); this._enterT = setTimeout(() => m.classList.remove('enter'), 2600);
    this.refresh(true);
    this.rollFlaps();
    if (this.online) this.online.onMenu();
  }

  /** Вкладки-плити нахиляються за курсором, іконка «висить» над плитою й зсувається сильніше — об'ємний паралакс. */
  tiltNav() {
    const nav = this.el.nav;
    nav.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const b = e.target.closest('.nb'); if (!b) return;
      const r = b.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      b.style.setProperty('--rx', (-py * 22).toFixed(1) + 'deg'); b.style.setProperty('--ry', (px * 26).toFixed(1) + 'deg');
    });
    nav.addEventListener('pointerout', (e) => { const b = e.target.closest('.nb'); if (b && !b.contains(e.relatedTarget)) { b.style.removeProperty('--rx'); b.style.removeProperty('--ry'); } });
  }

  /** Табло «перебирає» літери, як справжнє розкидне табло, і зупиняється по черзі зліва направо. */
  rollFlaps() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cells = [...this.el.next.querySelectorAll('.flap s')]; if (!cells.length) return;
    const AB = 'АБВГДЕЄЖЗИІКЛМНОПРСТУФХЦЧШЮЯ0123456789';
    const fin = cells.map((c) => c.innerHTML), stop = cells.map((c) => 260 + (+c.style.getPropertyValue('--i') || 0) * 55 + Math.random() * 120);
    const t0 = performance.now(), id = (this._flapId = (this._flapId || 0) + 1);
    const step = (now) => {
      if (id !== this._flapId) return;
      const t = now - t0; let busy = false;
      cells.forEach((c, i) => {
        if (t >= stop[i]) { if (c.dataset.r) { c.innerHTML = fin[i]; delete c.dataset.r; c.classList.remove('set'); void c.offsetWidth; c.classList.add('set'); } return; }
        busy = true; c.dataset.r = 1; if (fin[i] !== '&nbsp;') c.textContent = AB[(Math.random() * AB.length) | 0];
      });
      if (busy) setTimeout(() => requestAnimationFrame(step), 45);
    };
    requestAnimationFrame(step);
  }
  hideMenu() { this.el.menu.hidden = true; this.closePanel(true); }

  leagueStrip() {
    const spec = matchSpec(S.fixture, S.season), lg = LEAGUES[spec.league];
    const next = LEAGUES[spec.league + 1];
    const n = lg.clubs.length;
    const chips = lg.clubs.map((c, i) => {
      const st = i < spec.no - 1 ? 'done' : i === spec.no - 1 ? 'cur' : 'todo';
      const fin = i === n - 1;
      return `<div class="stn ${st} ${fin ? 'fin' : ''}" style="--i:${i}">${fin ? `<i class="stn-cup">${I.trophy}</i>` : ''}<span class="stn-n">${st === 'done' ? I.check : i + 1}</span><em>${c.name}</em></div>`;
    }).join('');
    const sh = (txt, name, cls) => `<div class="lg-plate ${cls}"><b>${txt}</b><i>${name}</i></div>`;
    this.el.league.innerHTML = sh(lg.short, lg.name, 'cur')
      + `<div class="route" style="--n:${n};--p:${n > 1 ? (spec.no - 1) / (n - 1) : 0}"><i class="rt-line"></i><i class="rt-done"></i><div class="stns">${chips}</div></div>`
      + (next ? sh(next.short, next.name, 'next') : sh('' + (S.season + 2), 'Сезон ' + (S.season + 2), 'next'));
  }

  refresh(force) {
    const e = this.el;
    countTo(e.coins, Math.floor(S.coins), force ? 0 : 500, (v) => fmt(v));
    countTo(e.tickets, S.tickets, 0, (v) => String(Math.round(v)));
    const spec = matchSpec(S.fixture, S.season);
    e.ctaS.textContent = spec.club.name; document.getElementById('m-cta-n').textContent = '№' + spec.no;
    e.stadV.textContent = '+' + INCOME_STEP + '% · рів. ' + (S.up.stadium + 1);
    e.stadC.innerHTML = fmt(stadiumCost()) + I.coin;
    e.stad.classList.toggle('can', S.coins >= stadiumCost());
    e.acadDot.hidden = !S.academy.ready;
    if (force || this._leagueKey !== S.fixture + ':' + S.season) { this._leagueKey = S.fixture + ':' + S.season; this.leagueStrip(); }
    this.menuCards(force);
    this.tickCash();
    if (this.panel) this.renderPanel();
  }

  /** Інформаційні картки меню: клуб, наступний суперник, зірка складу та стрічка фактів. */
  menuCards(force) {
    const g = this.game; if (!g) return;
    ensureSquad();
    const spec = matchSpec(S.fixture, S.season), all = allPlayers();
    const rating = squadRating();
    const form = (S.form || []).slice(-5);
    const dots = Array.from({ length: 5 }, (_, i) => { const r = form[i - (5 - form.length)]; return `<i class="f ${r ? r.toLowerCase() : ''}">${r === 'W' ? 'П' : r === 'D' ? 'Н' : r === 'L' ? 'Ц' : ''}</i>`; }).join('');
    const kc = [rating, S.stats.wins, S.stats.goals, S.stats.bestCombo, form.join(''), S.trophies].join('|');
    if (force || this._clubKey !== kc) {
      this._clubKey = kc;
      this.el.club.innerHTML = `<i class="mc-band" aria-hidden="true"></i>
        <div class="mc-h">${lokoCrest()}<div><b>Локомотив</b><em>Київ · з 1919</em></div></div>
        <div class="mc-num"><b id="m-rating" data-v="0">0</b><span>сила<br>складу</span></div>
        <div class="mc-stats"><div><b>${S.stats.wins}</b><span>перемог</span></div><div><b>${S.stats.goals}</b><span>голів</span></div><div><b>${S.trophies}</b><span>кубків</span></div></div>
        <div class="mc-form"><span>Форма</span>${form.length ? `<div>${dots}</div>` : '<em>ще без матчів</em>'}</div>
        <div class="mc-more">Склад команди<svg viewBox="0 0 40 24" aria-hidden="true"><path d="M2 3l11 9-11 9V3zM15 3l11 9-11 9V3z"/></svg></div>`;
      const rt = this.el.club.querySelector('#m-rating');
      if (force) countTo(rt, rating, 900, (v) => String(Math.round(v))); else { rt.dataset.v = rating; rt.textContent = rating; }
    }
    const nk = [S.fixture, S.season, rating, S.up.stadium, S.stats.matches].join('|');
    if (force || this._nextKey !== nk) {
      this._nextKey = nk;
      const rv = rivalOf(spec), note = scoutNote(spec);
      const oq = oppSquad(spec), star = oq.find((e) => e.star), oAvg = Math.round(oq.reduce((a, e) => a + ovr(e), 0) / oq.length), diff = oAvg - rating;
      const lvl = diff <= -8 ? 1 : diff <= 3 ? 2 : diff <= 14 ? 3 : 4, label = ['', 'Легко', 'Рівний бій', 'Складно', 'Дуже складно'][lvl];
      const rew = Math.round(120 * spec.scale * incomeMult());
      const flap = (t) => [...String(t).toUpperCase()].map((ch, i) => `<s style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</s>`).join('');
      const sig = [1, 2, 3, 4].map((n) => `<i class="${n <= lvl ? 'on l' + lvl : ''}"></i>`).join('');
      this.el.next.innerHTML = `<div class="bd-h"><span>Відправлення</span><b>${spec.no}/${spec.of}</b><time class="bd-clk">${this.clock()}</time></div>
        <div class="bd-r"><em>До</em><div class="flap">${flap(spec.club.name)}</div></div>
        <div class="bd-r"><em>Місто</em><div class="flap sm">${flap(spec.club.city)}</div></div>
        <div class="bd-r"><em>Ліга</em><div class="flap sm">${flap(spec.leagueName)}</div></div>
        <div class="bd-r"><em>Стиль</em><div class="flap sm">${flap(rv.style.name)}</div></div>
        <div class="bd-n">${star ? `<b>★ ${star.name}</b> · ` : ''}${note || rv.style.tip}${rv.rec.met ? ` · зустрічі ${rv.rec.w}-${rv.rec.d}-${rv.rec.l}` : ''}${rv.revenge ? ' · <i>РЕВАНШ</i>' : ''}</div>
        <div class="bd-s"><div class="sem">${sig}</div><span>${label}</span></div>
        <div class="bd-f"><span>Приз</span><b>+${fmt(rew)}</b>${I.coin}</div>`;
    }
  }

  /** Вокзальний годинник на табло: справжній час пристрою, двокрапка блимає. */
  clock() {
    const d = new Date(), p = (v) => String(v).padStart(2, '0');
    return `${p(d.getHours())}<i>:</i>${p(d.getMinutes())}`;
  }

  tickCash() {
    const clk = !this.el.menu.hidden && this.el.next.querySelector('.bd-clk');
    if (clk) { const t = this.clock(); if (clk.dataset.t !== t) { clk.dataset.t = t; clk.innerHTML = t; } }
    const c = pendingCash();
    const b = this.el.cash;
    if (c >= 10) { b.hidden = false; const t = 'Каса +' + fmt(c); if (b.dataset.t !== t) { b.dataset.t = t; b.innerHTML = I.coin + '<b>' + t + '</b>'; } }
    else b.hidden = true;
  }
  claimCash() {
    const c = pendingCash();
    if (c < 1) return;
    S.coins += c; S.cashAt = Date.now(); commit();
    audio.coin(3); audio.buy();
    this.toast('Каса стадіону: +' + fmt(c));
  }

  deny(el) { audio.deny(); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
  pop(el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }

  buyStadium() {
    const c = stadiumCost();
    if (S.coins < c) return this.deny(this.el.stad);
    const before = stadiumTier();
    S.coins -= c; S.up.stadium++; commit(); audio.buy(); this.pop(this.el.stad);
    const after = stadiumTier();
    if (after !== before) { this.game.onStadiumUpgraded(); audio.horn(); this.toast('Новий ярус: ' + STADIUM_TIER_NAMES[after]); }
    else this.toast('Дохід +' + INCOME_STEP + '%: тепер +' + incomePct() + '%');
  }

  // ---------------------------------------------------------------- панелі
  openPanel(name) {
    this.panel = name;
    this.el.panel.hidden = false; this.el.menu.classList.add('panel-open');
    this.el.nav.querySelectorAll('.nb').forEach((b, i) => b.classList.toggle('on', ['match', 'transfers', 'academy', 'stadium', 'online'][i] === name));
    this.renderPanel();
  }
  closePanel(silent) {
    this.panel = null; this.el.panel.hidden = true; this.el.menu.classList.remove('panel-open');
    this.el.nav.querySelectorAll('.nb').forEach((b, i) => b.classList.toggle('on', i === 0));
  }

  renderPanel() {
    if (!this.panel) return;
    const p = this.panel;
    const html = p === 'transfers' ? this.transfersHtml() : p === 'academy' ? this.academyHtml() : p === 'online' ? this.online.html() : this.stadiumHtml();
    const keep = this.el.panel.querySelector('.scroller');
    const sl = keep ? keep.scrollLeft : 0;
    this.el.panel.innerHTML = html;
    const sc = this.el.panel.querySelector('.scroller'); if (sc) sc.scrollLeft = sl;
  }

  statBar(label, v) { return `<div class="stat"><span>${label}</span><i><u style="width:${Math.round(v * 100)}%"></u></i></div>`; }

  teamTabs() {
    const t = this.tab;
    return `<div class="tabs"><button class="${t === 'squad' ? 'on' : ''}" data-act="tab-squad">СКЛАД</button><button class="${t === 'strikers' ? 'on' : ''}" data-act="tab-strikers">НАПАДНИКИ</button><button class="${t === 'keepers' ? 'on' : ''}" data-act="tab-keepers">ВОРОТАРІ</button></div>`;
  }

  /** Склад: картки гравців з рейтингом і праворуч детальна картка з тренуванням навичок. */
  squadHtml() {
    const g = this.game; ensureSquad();
    if (this.sel == null || !allPlayers()[this.sel]) this.sel = Math.max(1, S.squad.findIndex((e) => e.role === 'ST'));
    const all = allPlayers();
    const cards = all.map((e, i) => {
      const L = squadLook(e), gk = e.line === 'G', o = ovr(e);
      const img = portrait(g.renderer, { kit: gk ? KIT_GK_LOKO : myKit(), num: e.num, skin: L.skin, hair: L.hair, hairCol: L.hairCol, beard: L.beard, gk, scale: 0.9 }, 'sq-' + e.id + e.num + lookSig(e) + (e.role === 'ST' && !e.custom ? striker().id : ''));
      return `<button class="sq-card ${i === this.sel ? 'on' : ''} ${i >= 11 ? 'sub' : ''}" data-act="sel:${i}"><i class="ovr ${tierOf(o)}">${o}</i><img src="${img}" alt=""/><b>${e.name.split(' ').slice(-1)[0]}</b><em>№${e.num} · ${i >= 11 ? 'запас' : e.role}</em></button>`;
    }).join('');
    const e = all[this.sel], o = ovr(e), need = xpNeed(e.lvl), isSub = this.sel >= 11;
    const swaps = isSub ? `<div class="swaps"><small>Замінити в основі:</small>${swapTargets(e).map((si) => `<button class="btn sw" data-act="swap:${this.sel}:${si}"><b>№${S.squad[si].num} ${S.squad[si].name.split(' ')[0]}</b><em>${S.squad[si].role} · ${ovr(S.squad[si])}</em></button>`).join('')}</div>` : '';
    const tiles = keysFor(e.line).map((k) => {
      const v = e.stats[k], c = trainCost(v), can = S.coins >= c && v < 99;
      return `<div class="st"><div class="st-t"><span>${STAT_NAMES[k]}</span><b>${v}</b></div><i><u style="width:${v}%"></u></i><button class="btn buy ${can ? 'can' : ''}" data-act="train:${this.sel}:${k}" ${v >= 99 ? 'disabled' : ''}><b>+1 · ${fmt(c)}</b>${I.coin}</button><small>${STAT_HINT[k]}</small></div>`;
    }).join('');
    const detail = `<div class="sq-d"><div class="sq-h"><i class="ovr big ${tierOf(o)}">${o}</i><div><h3>${e.name}</h3><button class="btn alt cust" data-act="cust:${this.sel}"><b>ВИГЛЯД</b></button><p>№${e.num} · ${ROLE_UA[isSub ? (e.pos || e.role) : e.role]}${isSub ? ' · запасний' : ''}</p><div class="xp"><u style="width:${Math.min(100, (e.xp / need) * 100)}%"></u></div><small>Рівень ${e.lvl} · досвід ${e.xp}/${need} · матчів ${e.apps} · голів ${e.goals}</small></div></div>${swaps}<div class="st-grid">${tiles}</div></div>`;
    return sheet('Команда · рейтинг ' + squadRating(), this.teamTabs() + `<div class="sq-wrap"><div class="sq-list scroller">${cards}</div>${detail}</div>`, 'wide');
  }

  train(a) {
    const [, i, k] = a.split(':');
    const c = trainStat(+i, k);
    if (c === false) { audio.deny(); const e = allPlayers()[+i]; this.toast(e && e.stats[k] >= 99 ? 'Навичка на максимумі' : 'Не вистачає монет'); return; }
    audio.buy();
  }

  transfersHtml() {
    if (this.tab === 'squad') return this.squadHtml();
    const g = this.game, st = this.tab === 'strikers';
    const list = st ? STRIKERS : KEEPERS, owned = st ? S.strikers : S.keepers, cur = st ? S.striker : S.keeper;
    const cards = list.map((c) => {
      const kit = st ? myKit() : KIT_GK_LOKO;
      const img = portrait(g.renderer, { kit, num: st ? 9 : 1, skin: c.skin, hair: c.hair, hairCol: c.hairCol, gk: !st, scale: 0.9 }, 'tr-' + c.id);
      const has = owned.includes(c.id), eq = cur === c.id;
      const stats = st
        ? this.statBar('Точність', 1 - c.jitter / 4.5) + this.statBar('Приціл', c.bounces / 6)
        : this.statBar('Швидкість', c.speed / 12.5) + this.statBar('Досяжність', c.reach / 1.7);
      const btn = eq ? `<button class="btn on" disabled>${I.check}<b>У ГРІ</b></button>` : has ? `<button class="btn go" data-act="equip:${c.id}"><b>ОБРАТИ</b></button>` : `<button class="btn buy ${S.coins >= c.price ? 'can' : ''}" data-act="buy:${c.id}"><b>${fmt(c.price)}</b>${I.coin}</button>`;
      return `<article class="tcard ${eq ? 'eq' : ''} ${has ? 'own' : ''}"><img class="pic" alt="${c.name}" src="${img}"/><h3>${c.name}</h3><p>${c.tip}</p>${stats}${btn}</article>`;
    }).join('');
    return sheet('Команда · трансфери', this.teamTabs() + `<div class="scroller">${cards}</div>`, 'wide');
  }

  academyHtml() {
    const g = this.game, A = ACADEMY, pr = S.academy.progress, ready = S.academy.ready;
    const stns = Array.from({ length: A.need + 1 }, (_, i) => `<i class="${i <= pr ? 'f' : ''}"></i>`).join('');
    const left = A.need - pr;
    const slots = Array.from({ length: A.slots }, (_, i) => {
      const p = S.academy.players[i];
      if (!p) return `<div class="slot empty"><span>${I.lock}</span><em>вільне місце</em></div>`;
      const img = portrait(g.renderer, { kit: myKit(), num: p.num, skin: p.skin, hair: p.hair, hairCol: p.hairCol, gk: false, scale: 0.9 }, 'ac-' + p.id);
      return `<div class="slot" style="--rc:${rarCol(p.rar).col}"><img src="${img}" alt=""/><b>${p.name}</b><em>№${p.num} · +${p.bonus}% дохід</em></div>`;
    }).join('');
    const act = ready ? `<button class="btn go big" data-act="acad-collect"><b>ЗАБРАТИ ВИПУСКНИКА</b></button>` : `<button class="btn buy ${S.tickets > 0 ? 'can' : ''}" data-act="acad-boost"><b>Прискорити: 1</b>${I.ticket}</button>`;
    const left_ = `<div class="acad-l"><h3>${ready ? 'Випускник готовий!' : 'Наступний випускник'}</h3><div class="track"><div class="track-bar">${stns}</div><span class="train" style="--p:${Math.min(1, pr / A.need)}">${I.bolt}</span></div><p>${ready ? 'Юний вихованець чекає на місце в складі.' : 'Ще ' + left + ' очк. до випускника: перемога дає 2, будь-який матч 1.'}</p>${act}<p class="fine">Місця: ${S.academy.players.length}/${A.slots}. Кожен випускник дає % до доходу, а найкращий виходить на поле.</p></div>`;
    return sheet('Академія Локомотива', `<div class="acad">${left_}<div class="slots">${slots}</div></div>`, 'wide');
  }

  stadiumHtml() {
    const lvl = S.up.stadium, t = stadiumTier(), nx = nextTierLevel();
    const rows = STADIUM_TIER_NAMES.map((n, i) => `<li class="${i <= t ? 'ok' : ''}">${i <= t ? I.check : I.lock}<span>${n}</span><em>рів. ${STADIUM_TIERS[i] + 1}</em></li>`).join('');
    const info = `<div class="stad-i"><h3>${STADIUM_TIER_NAMES[t]}</h3>
      <div class="kv"><span>Рівень стадіону</span><b>${lvl + 1}</b></div>
      <div class="kv"><span>Дохід з матчів</span><b>+${incomePct()}%</b></div>
      <div class="kv"><span>Каса за хвилину</span><b>${cashRate().toFixed(1)}</b></div>
      <div class="kv"><span>Каса копичиться до</span><b>${CASH_CAP_MIN} хв</b></div>
      <div class="kv"><span>Кубки</span><b>${S.trophies}</b></div>
      <p>${nx !== null ? 'Наступний ярус на рівні ' + (nx + 1) + ': ' + STADIUM_TIER_NAMES[t + 1] + '.' : 'Золота арена зведена. Далі росте лише дохід.'}</p>
      <button class="btn buy ${S.coins >= stadiumCost() ? 'can' : ''}" data-act="up-stadium"><b>Покращити · ${fmt(stadiumCost())}</b>${I.coin}</button></div>`;
    const st = this.stTab, tb = (k, t) => `<button class="${st === k ? 'on' : ''}" data-act="tab-st-${k}">${t}</button>`;
    const tabs = `<div class="tabs">${tb('info', 'СТАДІОН')}${tb('chron', 'ХРОНІКА КЛУБУ')}${tb('sym', 'СИМВОЛІКА')}</div>`;
    const body = st === 'chron' ? this.chronicleHtml() : st === 'sym' ? this.symbolsHtml() : `<div class="stad">${info}<ul class="tiers">${rows}</ul></div>`;
    return sheet('Стадіон і клуб', tabs + body, 'wide');
  }

  /** Хроніка: сторінки історії клубу відкриваються перемогами. */
  chronicleHtml() {
    const w = S.stats.wins;
    const cards = CHRONICLE.map((c) => w >= c.wins
      ? `<article class="chap"><b>${c.year}</b><h3>${c.title}</h3><p>${c.text}</p></article>`
      : `<article class="chap lock"><b>${c.year}</b><span>${I.lock}</span><p>Відкриється після ${c.wins} ${c.wins === 1 ? 'перемоги' : 'перемог'}</p></article>`).join('');
    const open = CHRONICLE.filter((c) => w >= c.wins).length;
    return `<p class="chron-h">Відкрито сторінок: ${open} з ${CHRONICLE.length}. Перемагай, щоб дізнатися історію залізничників.</p><div class="scroller">${cards}</div>`;
  }

  /** Символіка: кольори, прізвисько, власник, нагороди, стадіон, легенди. */
  symbolsHtml() {
    const kv = STADIUM.map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('');
    const hon = HONOURS.map((h) => `<div class="kv"><span>${h.t}</span><b>${h.d}</b></div>`).join('');
    return `<div class="sym">
      <section><div class="sym-crest">${lokoCrest()}</div><h3>${CLUB.name}</h3><p>З ${CLUB.founded} року. Скорочено ${CLUB.short}, прізвисько «${CLUB.nick}». Власник: ${CLUB.owner}.</p>
        <p class="note">Значок у грі стилізований під сигнальні прапорці, це не офіційний логотип клубу.</p>
        <div class="flags"><i class="fl red"></i><span>червоний — стоп</span><i class="fl green"></i><span>зелений — вперед</span></div></section>
      <section><h3>Нагороди</h3>${hon}<h3>Стадіон «Локомотив»</h3>${kv}</section>
      <section><h3>Легенди клубу</h3><p>${LEGENDS.join(', ')}.</p><h3>Вихованці</h3><p>${ALUMNI.join(', ')}.</p></section></div>`;
  }

  buy(id) {
    const list = [...STRIKERS, ...KEEPERS], c = list.find((x) => x.id === id);
    if (!c) return;
    const st = id[0] === 's', owned = st ? S.strikers : S.keepers;
    if (owned.includes(id)) return;
    if (S.coins < c.price) { audio.deny(); this.toast('Не вистачає ' + fmt(c.price - S.coins) + ' монет'); return; }
    S.coins -= c.price; owned.push(id); if (st) S.striker = id; else S.keeper = id;
    commit(); audio.buy(); this.toast(c.name + ' у складі!');
  }
  equip(id) {
    const st = id[0] === 's';
    if (st) S.striker = id; else S.keeper = id;
    commit(); audio.click();
  }

  collectGraduate() {
    if (!S.academy.ready) return;
    const gr = rollGraduate(), A = ACADEMY;
    let note = '';
    if (S.academy.players.length < A.slots) S.academy.players.push(gr);
    else {
      let wi = 0; S.academy.players.forEach((p, i) => { if (p.bonus < S.academy.players[wi].bonus) wi = i; });
      if (S.academy.players[wi].bonus < gr.bonus) { S.academy.players[wi] = gr; note = 'замінив найслабшого'; }
      else { const c = 80 * 3; S.coins += c; note = 'місць немає: +' + c + ' монет'; }
    }
    const signed = signGraduate(gr); if (signed) note = (note ? note + ' · ' : '') + 'вийшов у основний склад';
    S.academy.progress = 0; S.academy.ready = false;
    commit(); audio.win();
    const r = rarCol(gr.rar);
    const img = portrait(this.game.renderer, { kit: myKit(), num: gr.num, skin: gr.skin, hair: gr.hair, hairCol: gr.hairCol, gk: false, scale: 0.9 }, 'ac-' + gr.id);
    this.el.reveal.innerHTML = `<div class="reveal-in" style="--rc:${r.col}" data-act="close-reveal"><div class="rays"></div><img src="${img}" alt=""/><small>${r.name}</small><h2>${gr.name}</h2><p>№${gr.num} · +${gr.bonus}% до доходу ${note ? '· ' + note : ''}</p><button class="btn go"><b>ВІТАЮ</b></button></div>`;
    this.el.reveal.hidden = false;
  }
  boostAcademy() {
    if (S.academy.ready) return;
    if (S.tickets < 1) { audio.deny(); this.toast('Квитки дають за перемоги й кубки'); return; }
    S.tickets--; S.academy.progress++;
    if (S.academy.progress >= ACADEMY.need) { S.academy.progress = ACADEMY.need; S.academy.ready = true; }
    commit(); audio.buy();
  }

  // ---------------------------------------------------------------- налаштування
  // ---------------------------------------------------------------- редактор вигляду гравця й форми
  openCustom(idx) {
    this.cu = idx; this.el.custom.hidden = false; this.renderCustom(); audio.click();
  }
  closeCustom() { this.el.custom.hidden = true; this.cu = null; if (this.panel) this.renderPanel(); }
  customAct(a, el) {
    const e = allPlayers()[this.cu]; if (!e && a !== 'cu-done') return;
    const [k, v] = [a.slice(3, a.indexOf(':') < 0 ? a.length : a.indexOf(':')), a.indexOf(':') < 0 ? '' : a.slice(a.indexOf(':') + 1)];
    if (k === 'done') { audio.back(); return this.closeCustom(); }
    if (k === 'kit') { S.kitId = v; commit(); audio.click(); return this.renderCustom(); }
    if (k === 'skin') e.skin = v;
    else if (k === 'hair') e.hair = v;
    else if (k === 'col') e.hairCol = v;
    else if (k === 'beard') e.beard = +v;
    else if (k === 'num') {
      const used = new Set(allPlayers().filter((p) => p !== e).map((p) => p.num));
      let n = e.num; for (let i = 0; i < 99; i++) { n = ((n - 1 + (v === '+' ? 1 : -1) + 99) % 99) + 1; if (!used.has(n)) break; }
      e.num = n;
    } else if (k === 'reset') { e.custom = false; }
    if (k !== 'reset') e.custom = true;
    commit(); audio.click(); this.renderCustom();
  }
  renderCustom() {
    const g = this.game, e = allPlayers()[this.cu]; if (!e) return;
    const L = squadLook(e), gk = e.line === 'G';
    const img = portrait(g.renderer, { kit: gk ? KIT_GK_LOKO : myKit(), num: e.num, skin: L.skin, hair: L.hair, hairCol: L.hairCol, beard: L.beard, gk, scale: 1.0 }, 'cu-' + e.id + e.num + lookSig(e));
    const sw = (arr, cur, act) => arr.map((c) => `<button class="sw ${c === cur ? 'on' : ''}" style="background:${c}" data-act="${act}:${c}" aria-label="${c}"></button>`).join('');
    const opt = (arr, cur, act, names) => arr.map((c, i) => `<button class="chip-b ${c === cur ? 'on' : ''}" data-act="${act}:${c}">${names ? names[i] : c}</button>`).join('');
    const HN = { crop: 'Класика', buzz: 'Під нуль', slick: 'Зачіс', curly: 'Кучері', pony: 'Хвіст', long: 'Довге', mohawk: 'Мохавк', band: 'Пов’язка', bald: 'Лисий' };
    const kits = Object.entries(KITS).map(([id, v]) => `<button class="kit-b ${S.kitId === id ? 'on' : ''}" data-act="cu-kit:${id}"><i style="background:linear-gradient(90deg,${v.kit.main} 0 60%,${v.kit.second} 60% 100%)"></i><span>${v.name}</span></button>`).join('');
    this.el.custom.innerHTML = `<div class="card-box wide cu-box">
      <header class="sheet-h"><h2>Вигляд · №${e.num}</h2><button class="sq btn-red" data-act="cu-done" aria-label="Готово">${I.check}</button></header>
      <div class="cu-wrap">
        <div class="cu-prev"><img src="${img}" alt=""/><input class="cu-name" data-cname maxlength="22" value="${e.name.replace(/"/g, '&quot;')}" aria-label="Ім’я"/>
          <div class="cu-num"><button class="btn alt" data-act="cu-num:-"><b>−</b></button><span>№${e.num}</span><button class="btn alt" data-act="cu-num:+"><b>+</b></button></div>
          <button class="btn alt" data-act="cu-reset"><b>ЗАЛИШИТИ ЗА ЗАМОВЧУВАННЯМ</b></button></div>
        <div class="cu-opts scroller">
          <div class="cu-r"><small>Форма клубу</small><div class="kits">${kits}</div></div>
          <div class="cu-r"><small>Шкіра</small><div class="sws">${sw(ACADEMY.allSkins, L.skin, 'cu-skin')}</div></div>
          <div class="cu-r"><small>Зачіска</small><div class="chips">${opt(ACADEMY.allHairs, L.hair, 'cu-hair', ACADEMY.allHairs.map((h) => HN[h]))}</div></div>
          <div class="cu-r"><small>Колір волосся</small><div class="sws">${sw(ACADEMY.allHairCols, L.hairCol, 'cu-col')}</div></div>
          <div class="cu-r"><small>Борода</small><div class="chips">${['Нема', 'Щетина', 'Вуса', 'Борода'].map((n, i) => `<button class="chip-b ${(L.beard || 0) === i ? 'on' : ''}" data-act="cu-beard:${i}">${n}</button>`).join('')}</div></div>
        </div></div></div>`;
  }

  openSettings() {
    this.el.settings.hidden = false; this.renderSettings();
  }
  closeSettings() { this.el.settings.hidden = true; }
  renderSettings() {
    const s = S.settings, row = (a, label, on) => `<button class="tg ${on ? 'on' : ''}" data-act="${a}"><span>${label}</span><i><u></u></i></button>`;
    const cb = (k, t) => `<button class="${s.control === k ? 'on' : ''}" data-act="ctl-${k}">${t}</button>`;
    const hb = (k, t) => `<button class="${s.hand === k ? 'on' : ''}" data-act="hand-${k}">${t}</button>`;
    const tdb = (k, t) => `<button class="${s.timeOfDay === k ? 'on' : ''}" data-act="tod-${k}">${t}</button>`;
    const wtb = (k, t) => `<button class="${s.weather === k ? 'on' : ''}" data-act="wth-${k}">${t}</button>`;
    const qb = (k, t) => `<button class="${s.quality === k ? 'on' : ''}" data-act="q-${k}">${t}</button>`;
    const tab = this.setTab || 'gen';
    const tabs = [['gen', 'Загальне', I.gear], ['match', 'Матч', I.ball], ['cam', 'Камера', I.full], ['ctl', 'Керування', I.up]];
    const pages = {
      gen: `${row('set-sfx', 'Звуки', s.sfx)}${row('set-music', 'Музика', s.music)}${row('set-haptics', 'Вібрація', s.haptics)}
        <button class="tg" data-act="fs"><span>На весь екран</span>${I.full}</button>
        <div class="tg q"><span>Графіка</span><div class="seg">${qb('auto', 'АВТО')}${qb('high', 'ВИСОКА')}${qb('low', 'ЕКОНОМНА')}</div></div>
        <button class="tg danger" data-act="reset"><span></span><b>СКИНУТИ ПРОГРЕС</b></button>`,
      match: `<div class="tg q"><span>Час доби</span><div class="seg">${tdb('day', 'ДЕНЬ')}${tdb('dusk', 'ВЕЧІР')}${tdb('night', 'НІЧ')}${tdb('random', 'ВИПАДКОВО')}</div></div>
        <div class="tg q"><span>Погода</span><div class="seg">${wtb('clear', 'ЯСНО')}${wtb('cloudy', 'ХМАРНО')}${wtb('rain', 'ДОЩ')}${wtb('snow', 'СНІГ')}${wtb('fog', 'ТУМАН')}${wtb('random', 'ВИПАДКОВО')}</div></div>`,
      cam: `<div class="tg q"><span>Камера в матчі</span><div class="seg cam-views">${Object.entries(CAM_PRESETS).map(([k, v]) => `<button class="${(s.camMode || 'classic') === k ? 'on' : ''}" data-act="cam-${k}">${v.name}</button>`).join('')}</div><small class="cam-note">${(CAM_PRESETS[s.camMode] || CAM_PRESETS.classic).note}</small></div>
        <div class="tg q joy-set"><div class="rng"><label>Відстань<output>${s.camDist}%</output></label><input type="range" min="70" max="140" step="5" value="${s.camDist}" data-range="camDist" aria-label="Відстань камери"/></div><div class="rng"><label>Нахил<output>${s.camTiltOff > 0 ? '+' : ''}${s.camTiltOff}°</output></label><input type="range" min="-15" max="20" step="1" value="${s.camTiltOff}" data-range="camTiltOff" data-unit="°" data-sign="1" aria-label="Нахил камери відносно пресету"/></div><div class="rng"><label>Слідкування за м'ячем<output>${s.camFollow}%</output></label><input type="range" min="50" max="220" step="10" value="${s.camFollow}" data-range="camFollow" aria-label="Швидкість слідкування камери"/></div></div>
        ${row('set-shake', 'Тряска камери', s.camShake !== false)}`,
      ctl: `<div class="tg q"><span>Керування ударом</span><div class="seg">${cb('auto', 'АВТО')}${cb('joy', 'ДЖОЙСТИК')}${cb('drag', 'ВІДТЯГУВАННЯ')}</div></div>
        <div class="tg q"><span>Джойстик</span><div class="seg">${hb('right', 'ПРАВОРУЧ')}${hb('left', 'ЛІВОРУЧ')}</div></div>
        <div class="tg q joy-set"><div class="rng"><label>Розмір джойстика<output>${s.joySize}%</output></label><input type="range" min="80" max="200" step="5" value="${s.joySize}" data-range="joySize" aria-label="Розмір джойстика"/></div><div class="rng"><label>Прозорість<output>${s.joyAlpha}%</output></label><input type="range" min="20" max="100" step="5" value="${s.joyAlpha}" data-range="joyAlpha" aria-label="Прозорість джойстика"/></div><button class="btn alt joy-mv" data-act="joy-move"><b>ПЕРЕМІСТИТИ</b></button><div class="joy-prev"><div class="joy-ring"><i class="joy-knob"></i></div></div></div>`,
    };
    this.el.settings.innerHTML = `<div class="card-box wide st-box">
      <header class="sheet-h"><h2>Налаштування</h2><button class="sq btn-red" data-act="close-settings" aria-label="Закрити">${I.close}</button></header>
      <div class="st-wrap">
        <nav class="st-tabs">${tabs.map(([k, t, ic]) => `<button class="${tab === k ? 'on' : ''}" data-act="set-tab:${k}"><i>${ic}</i><span>${t}</span></button>`).join('')}</nav>
        <div class="set-grid st-${tab}">${pages[tab]}</div>
      </div></div>`;
  }

  // ---------------------------------------------------------------- пауза, результат
  pause() {
    const g = this.game;
    if (g.sm.name !== 'MATCH' || !g.match.isPlaying()) return;
    g.match.pause(); this.el.pause.hidden = false;
    // онлайн: гра не зупиняється (час спільний), пенальті немає, а вихід — це здача матчу
    const on = !!(g.online && g.online.inMatch());
    this.el.pause.querySelector('[data-act="pens"]').hidden = on;
    this.el.pause.querySelector('[data-act="quit"] b').textContent = on ? 'Здатися (0:3)' : 'В меню';
    { const t = this.el.pause.querySelector('.pz-t'); t.textContent = t.dataset.t = on ? 'МЕНЮ' : 'ПАУЗА'; }
    const pf = this.root.querySelector('#p-fact'); if (pf) pf.textContent = randomFact();
    const tx = (id) => { const e = this.root.querySelector('#' + id); return e ? e.textContent : ''; };
    this.root.querySelector('#p-score').innerHTML = `<span>${tx('h-me-name')}</span><b>${Math.max(0, this.hud.last.me)}</b><i>:</i><b>${Math.max(0, this.hud.last.opp)}</b><span>${tx('h-opp-name')}</span><em>${this.hud.last.time || ''} · ${this.hud.last.half || ''}</em>`;   // з табло — без цифр, що саме перегортаються
  }

  showResult(r) {
    if (r.online) return this.online.showResult(r);
    const spec = r.spec, win = r.outcome === 'win', draw = r.outcome === 'draw';
    const extras = [];
    if (r.cup) extras.push(['gold', I.trophy, `Кубок ${spec.leagueName.toLowerCase()} завойовано`]);
    if (r.promoted != null) extras.push(['green', I.up, `Підвищення: ${LEAGUES[r.promoted].name}`]);
    if (r.newSeason) extras.push(['green', I.up, 'Новий сезон: суперники сильніші']);
    if (r.tickets) extras.push(['mint', I.ticket, `+${r.tickets} ${r.tickets === 1 ? 'квиток' : 'квитки'}`]);
    if (r.academyReady) extras.push(['blue', I.team, 'Випускник академії чекає']);
    if (r.chapter) extras.push(['gold', I.trophy, `Нова сторінка хроніки: ${r.chapter}`]);
    for (const lu of (r.levelUps || []).slice(0, 5)) extras.push(['blue', I.up, `${lu.name.split(' ')[0]} ${lu.lvl} рів.: ${STAT_NAMES[lu.key]} +1`]);
    if (r.stats.saves) extras.push(['red', I.bolt, `Сейви воротаря: ${r.stats.saves}`]);
    const next = FIXTURES[S.fixture];
    this.renderResult({
      outcome: r.outcome, title: win ? 'ПЕРЕМОГА!' : draw ? 'НІЧИЯ' : 'ПОРАЗКА', tag: spec.leagueName + ' · матч ' + spec.no + ' з ' + spec.of,
      me: { name: 'Локомотив', crest: lokoCrest() }, opp: { name: spec.club.name, crest: crest(spec.club.kit, spec.club.name.slice(0, 2)) },
      score: [r.me, r.opp], pens: r.pens, scorers: r.scorers, chips: extras, fact: 'Знали? ' + randomFact(),
      head: 'Каса матчу', lines: r.lines.map((l) => ({ label: l.label, value: l.value, coin: true })), total: r.total,
      buttons: [win ? ['go', 'result-next', `ДАЛІ: ${next.club.name}`, I.play] : ['go', 'result-retry', 'РЕВАНШ', I.play], ['alt', 'result-menu', 'В МЕНЮ']],
    });
  }

  /**
   * Екран результату (кар'єра й онлайн) у лівреї меню: заголовок падає по літері, табло з гербами й рахунком «грюкає»,
   * автори голів, досягнення, каса матчу рахується рядок за рядком і «зараховується» печаткою; на перемогу — конфеті й промені.
   * d: { outcome, title, tag, me/opp: {name, crest}, score, pens, scorers, chips: [[колір, іконка, текст]], fact, head,
   *      lines: [{label, value | text, coin, sub}], total, buttons: [[вид, дія, напис, іконка]] }
   */
  renderResult(d) {
    for (const t of this._resT || []) clearTimeout(t);
    this._resT = [];
    const e = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const o = d.outcome, [a, b] = d.score, win = o === 'win';
    const letters = [...d.title].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : e(ch)}</span>`).join('');
    const COLS = ['#d4202c', '#1f8f3f', '#f6f4ec', '#ffc61a', '#3fb7d8'];
    const conf = win ? `<div class="rs-conf" aria-hidden="true">${Array.from({ length: 46 }, (_, i) => `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--dx:${((Math.random() - 0.5) * 30).toFixed(1)}vw;--d:${(Math.random() * 3).toFixed(2)}s;--t:${(2.8 + Math.random() * 2.4).toFixed(2)}s;--r:${(Math.random() * 1080 - 540) | 0}deg;--s:${(0.6 + Math.random() * 0.9).toFixed(2)};--c:${COLS[i % COLS.length]}"></i>`).join('')}</div>` : '';
    const goals = (mine) => (d.scorers || []).filter((g) => !!g.mine === mine).slice(0, 6).map((g, i) => `<li style="--i:${i}">${I.ball}<span>${e(g.name)}</span><em>${e(g.min)}</em></li>`).join('');
    const gl = goals(true), go = goals(false);
    const chips = (d.chips || []).map(([c, ic, t], i) => `<div class="chip ${c}" style="--i:${i}">${ic}<span>${e(t)}</span></div>`).join('');
    const lines = (d.lines || []).map((l, i) => `<li style="--i:${i}"><span>${e(l.label)}</span>${l.text != null ? `<b>${e(l.text)}</b>` : `<b data-to="${l.value}">0</b>`}${l.coin ? I.coin : ''}${l.sub != null ? `<em>${e(l.sub)}</em>` : ''}</li>`).join('');
    const btns = d.buttons.map(([k, act, t, ic], i) => `<button class="rs-b ${k}" style="--i:${i}" data-act="${act}">${ic || ''}<b>${e(t)}</b></button>`).join('');
    const pens = d.pens ? `<div class="rs-pens">Пенальті <b>${d.pens.me}</b>:<b>${d.pens.opp}</b></div>` : '';
    const nl = (d.lines || []).length;
    this.el.result.innerHTML = `<div class="sp-bg rs-bg" aria-hidden="true"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i></div>
    <div class="rs-glow" aria-hidden="true">${win ? '<u class="rs-rays"></u>' : ''}</div>${conf}
    <div class="rs ${o}" style="--nl:${nl}">
      <div class="rs-l">
        <small class="rs-tag">${e(d.tag)}</small>
        <h1 class="rs-t" data-t="${e(d.title)}" aria-label="${e(d.title)}">${letters}</h1>
        <div class="rs-board">
          <div class="rs-team me ${a > b ? 'w' : ''}"><span class="rs-cr">${d.me.crest}</span><b>${e(d.me.name)}</b></div>
          <div class="rs-score"><b class="${a > b ? 'w' : ''}">${a}</b><i>:</i><b class="${b > a ? 'w' : ''}">${b}</b></div>
          <div class="rs-team opp ${b > a ? 'w' : ''}"><b>${e(d.opp.name)}</b><span class="rs-cr">${d.opp.crest}</span></div>
        </div>
        ${pens}
        ${gl || go ? `<div class="rs-goals"><ul class="me">${gl}</ul><ul class="opp">${go}</ul></div>` : ''}
        ${chips ? `<div class="rs-chips">${chips}</div>` : ''}
        ${d.fact ? `<p class="rs-fact">${e(d.fact)}</p>` : ''}
      </div>
      <div class="rs-r">
        <h3 class="rs-h">${e(d.head || 'Підсумок')}</h3>
        <ul class="rs-lines">${lines}</ul>
        ${d.total != null ? `<div class="rs-total"><span>Разом</span><b id="r-total" data-v="0">0</b>${I.coin}<em class="rs-stamp">ЗАРАХОВАНО</em></div>` : ''}
        <div class="rs-btns">${btns}</div>
      </div>
    </div>`;
    const el = this.el.result; el.hidden = false; el.className = 'overlay result ' + o;
    // каса: кожен рядок дораховується, коли виїхав; потім «Разом» і печатка
    const T = (ms, f) => this._resT.push(setTimeout(f, ms));
    el.querySelectorAll('.rs-lines b[data-to]').forEach((b, i) => T(1150 + i * 170, () => { countTo(b, +b.dataset.to, 520); audio.coin(Math.min(2, i)); }));
    const tot = el.querySelector('#r-total');
    if (tot) {
      const t0 = 1250 + nl * 170;
      T(t0, () => countTo(tot, d.total, 900));
      T(t0 + 950, () => { el.querySelector('.rs-total').classList.add('paid'); audio.coin(3); vibrate([12, 30, 12]); });
    }
  }
  hideResult() { for (const t of this._resT || []) clearTimeout(t); this._resT = []; this.el.result.hidden = true; }
}
