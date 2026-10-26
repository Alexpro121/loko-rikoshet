import { I, crest, lokoCrest } from './icons.js';
import { KIT_LOKO } from '../config.js';

/** HUD матчу: чистий HTML/CSS поверх канвасу. Оновлюються лише змінені значення. */
export class Hud {
  constructor(root) {
    root.insertAdjacentHTML('beforeend', `
<section class="hud" id="hud" hidden>
  <div class="bug hud-mid" id="h-bug">
    <span id="h-title" hidden></span>
    <div class="bug-main">
      <div class="bug-c me"><div class="crest-box" id="h-crest-me"></div><b>ЛОК</b></div>
      <div class="bug-sc me"><b id="h-sc-me">0</b></div>
      <div class="bug-sc opp"><b id="h-sc-opp">0</b></div>
      <div class="bug-c opp"><b id="h-opp-name">СУП</b><div class="crest-box" id="h-crest-opp"></div></div>
      <div class="bug-t"><b id="h-time" class="plate-time">00:00</b><small id="h-half">1-й тайм</small><i class="poss loose" id="h-sig" title="Зелений — м’яч у нас, червоний — у суперника"></i></div>
    </div>
    <div class="mcoins" hidden><b id="h-coins">0</b></div>
  </div>
  <button class="sq pause-btn" data-act="pause" aria-label="Пауза">${I.pause}</button>
  <div class="warn" id="h-warn" hidden></div>
  <div class="combo" id="h-combo" hidden></div>
  <div class="banner" id="h-banner" hidden><div class="banner-in"><small id="h-ban-sub"></small><h2 id="h-ban-t"></h2><em id="h-ban-note"></em></div></div>
  <div class="goaltxt" id="h-goal" hidden><h1 id="h-goal-t"></h1><p id="h-goal-s"></p></div>
  <div class="hint" id="h-hint" hidden><i class="hand"></i><span id="h-hint-t"></span></div>
  <div class="pcard" id="h-pcard" hidden></div>
  <div class="floats" id="h-floats"></div>
</section>`);
    const q = (id) => root.querySelector('#' + id);
    this.el = q('hud');
    this.t = { title: q('h-title'), time: q('h-time'), coins: q('h-coins'), me: q('h-sc-me'), opp: q('h-sc-opp'), oppName: q('h-opp-name'), crestMe: q('h-crest-me'), crestOpp: q('h-crest-opp'), warn: q('h-warn'), combo: q('h-combo'), banner: q('h-banner'), banT: q('h-ban-t'), banS: q('h-ban-sub'), banN: q('h-ban-note'), goal: q('h-goal'), goalT: q('h-goal-t'), goalS: q('h-goal-s'), hint: q('h-hint'), hintT: q('h-hint-t'), floats: q('h-floats'), mid: root.querySelector('#h-bug'), half: q('h-half'), pcard: q('h-pcard') };
    this.t.sig = q('h-sig'); this._sig = '';
    this.floatEls = [];
    for (let i = 0; i < 10; i++) { const d = document.createElement('div'); d.className = 'float'; d.hidden = true; this.t.floats.appendChild(d); this.floatEls.push(d); }
    this.fi = 0; this.last = { time: '', me: -1, opp: -1, coins: -1 };
    this.tm = {};
    this.t.crestMe.innerHTML = lokoCrest();
  }

  show(spec) {
    this.el.hidden = false;
    this.t.mid.classList.remove('enter'); void this.t.mid.offsetWidth; this.t.mid.classList.add('enter'); clearTimeout(this.tm.enter); this.tm.enter = setTimeout(() => this.t.mid.classList.remove('enter'), 1600);
    if (this.onShow) this.onShow();
    this.t.title.textContent = spec.leagueName + ' · ' + spec.no + '/' + spec.of;
    this.t.oppName.textContent = spec.club.name.slice(0, 3).toUpperCase();
    this.el.style.setProperty('--cb', spec.club.kit.main); this.el.style.setProperty('--cbt', spec.club.kit.main === '#eceff1' || spec.club.kit.main === '#f4f4f1' || spec.club.kit.main === '#e4e8ec' ? '#14231e' : '#fff');
    this.t.crestOpp.innerHTML = crest(spec.club.kit, spec.club.name.slice(0, 2));
    this.last = { time: '', me: -1, opp: -1, coins: -1 };
  }
  hide() { if (this.onHide) this.onHide(); this.el.hidden = true; this.clearGoal(); this.warn(null); this.hint(null); this.t.banner.hidden = true; }

  setScore(me, opp) {
    const pop = (el, v) => { el.textContent = v; this.bump(el); const box = el.parentElement; box.classList.remove('goalfx'); void box.offsetWidth; box.classList.add('goalfx'); const bug = this.t.mid; bug.classList.remove('scored'); void bug.offsetWidth; bug.classList.add('scored'); };
    if (me !== this.last.me) { const first = this.last.me < 0; this.last.me = me; if (first) this.t.me.textContent = me; else pop(this.t.me, me); }
    if (opp !== this.last.opp) { const first = this.last.opp < 0; this.last.opp = opp; if (first) this.t.opp.textContent = opp; else pop(this.t.opp, opp); }
  }
  setTime(text, urgent, half) {
    if (text !== this.last.time) { this.last.time = text; const i = text.indexOf(':'); this.t.time.innerHTML = i > 0 ? text.slice(0, i) + '<em class="col">:</em>' + text.slice(i + 1) : text; }
    if (half !== undefined && half !== this.last.half) { this.last.half = half; const h = this.t.half; h.classList.remove('swap'); void h.offsetWidth; h.textContent = half; h.classList.add('swap'); }
    this.t.mid.classList.toggle('urgent', !!urgent);
  }
  /** Семафор: зелений «вперед» — м'яч у нас, червоний «стоп» — у суперника, жовтий — вільний. */
  setSignal(owner) {
    const k = owner > 0 ? 'go' : owner < 0 ? 'stop' : 'loose';
    if (k === this._sig) return;
    this._sig = k; this.t.sig.className = 'poss ' + k;
  }
  setCoins(n) {
    if (n === this.last.coins) return;
    this.last.coins = n; this.t.coins.textContent = n; this.bump(this.t.coins);
  }
  bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

  warn(text) {
    const w = this.t.warn;
    if (!text) { w.hidden = true; this._warn = null; return; }
    if (this._warn === text) return;
    this._warn = text; w.textContent = text; w.hidden = false;
  }
  hint(text) {
    const h = this.t.hint;
    if (!text) { h.hidden = true; return; }
    this.t.hintT.textContent = text; h.hidden = false;
  }
  combo(n) {
    const c = this.t.combo;
    c.textContent = 'РИКОШЕТ ×' + n; c.hidden = false;
    c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
    clearTimeout(this.tm.combo); this.tm.combo = setTimeout(() => { c.hidden = true; }, 1400);
  }
  banner(title, sub, note) {
    const b = this.t.banner;
    this.t.banT.textContent = title; this.t.banS.textContent = sub; this.t.banN.textContent = note || '';
    b.hidden = false; b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
    clearTimeout(this.tm.banner); this.tm.banner = setTimeout(() => { b.hidden = true; }, 2300);
  }
  goal(title, sub, kind) {
    const g = this.t.goal;
    this.t.goalT.textContent = title; this.t.goalS.textContent = sub;
    g.className = 'goaltxt ' + kind; g.hidden = false;
  }
  clearGoal() { this.t.goal.hidden = true; }

  /** Картка гравця з м'ячем: ім'я, рейтинг і три головні навички. null — сховати. */
  setCard(c, side) {
    const el = this.t.pcard;
    if (!c) { el.hidden = true; this._card = null; return; }
    const key = c.name + c.num + side;
    if (this._card === key) return;
    this._card = key;
    el.className = 'pcard ' + (side > 0 ? 'me' : 'opp'); el.hidden = false;
    el.innerHTML = `<b class="pc-ovr ${c.tier}">${c.ovr}</b><div class="pc-info"><span class="pc-name">${c.name}</span><small>№${c.num} · ${c.role}</small>${c.bars.map((b) => `<div class="pc-bar"><em>${b[0]}</em><i><u style="width:${b[1]}%"></u></i><s>${b[1]}</s></div>`).join('')}</div>`;
  }

  float(x, y, text, kind = '') {
    const d = this.floatEls[this.fi]; this.fi = (this.fi + 1) % this.floatEls.length;
    d.hidden = false; d.className = 'float ' + kind; d.textContent = text;
    d.style.left = x + 'px'; d.style.top = y + 'px';
    d.style.animation = 'none'; void d.offsetWidth; d.style.animation = '';
  }
}
