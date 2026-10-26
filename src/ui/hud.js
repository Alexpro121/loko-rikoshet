import { I, crest, lokoCrest } from './icons.js';
import { KIT_LOKO } from '../config.js';

/** HUD матчу: чистий HTML/CSS поверх канвасу. Оновлюються лише змінені значення. */
export class Hud {
  constructor(root) {
    root.insertAdjacentHTML('beforeend', `
<section class="hud" id="hud" hidden>
  <div class="team me"><div class="crest-box" id="h-crest-me"></div><div class="team-txt"><span>ЛОКОМОТИВ</span><b id="h-sc-me">0</b></div></div>
  <div class="hud-mid">
    <div class="plate"><span id="h-title" class="plate-t"></span><div class="plate-r"><i class="sig loose" id="h-sig" title="Семафор: зелений — м’яч у нас, червоний — у суперника"></i><b id="h-time" class="plate-time">0:60</b></div></div>
    <div class="mcoins"><b id="h-coins">0</b>${I.coin}</div>
  </div>
  <div class="team opp"><div class="team-txt"><span id="h-opp-name">СУПЕРНИК</span><b id="h-sc-opp">0</b></div><div class="crest-box" id="h-crest-opp"></div></div>
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
    this.t = { title: q('h-title'), time: q('h-time'), coins: q('h-coins'), me: q('h-sc-me'), opp: q('h-sc-opp'), oppName: q('h-opp-name'), crestMe: q('h-crest-me'), crestOpp: q('h-crest-opp'), warn: q('h-warn'), combo: q('h-combo'), banner: q('h-banner'), banT: q('h-ban-t'), banS: q('h-ban-sub'), banN: q('h-ban-note'), goal: q('h-goal'), goalT: q('h-goal-t'), goalS: q('h-goal-s'), hint: q('h-hint'), hintT: q('h-hint-t'), floats: q('h-floats'), mid: root.querySelector('.hud-mid'), pcard: q('h-pcard') };
    this.t.sig = q('h-sig'); this._sig = '';
    this.floatEls = [];
    for (let i = 0; i < 10; i++) { const d = document.createElement('div'); d.className = 'float'; d.hidden = true; this.t.floats.appendChild(d); this.floatEls.push(d); }
    this.fi = 0; this.last = { time: '', me: -1, opp: -1, coins: -1 };
    this.tm = {};
    this.t.crestMe.innerHTML = lokoCrest();
  }

  show(spec) {
    this.el.hidden = false;
    if (this.onShow) this.onShow();
    this.t.title.textContent = spec.leagueName + ' · ' + spec.no + '/' + spec.of;
    this.t.oppName.textContent = spec.club.name;
    this.t.crestOpp.innerHTML = crest(spec.club.kit, spec.club.name.slice(0, 2));
    this.last = { time: '', me: -1, opp: -1, coins: -1 };
  }
  hide() { if (this.onHide) this.onHide(); this.el.hidden = true; this.clearGoal(); this.warn(null); this.hint(null); this.t.banner.hidden = true; }

  setScore(me, opp) {
    if (me !== this.last.me) { this.t.me.textContent = me; this.last.me = me; this.bump(this.t.me); }
    if (opp !== this.last.opp) { this.t.opp.textContent = opp; this.last.opp = opp; this.bump(this.t.opp); }
  }
  setTime(text, urgent) {
    if (text !== this.last.time) { this.t.time.textContent = text; this.last.time = text; }
    this.t.mid.classList.toggle('urgent', !!urgent);
  }
  /** Семафор: зелений «вперед» — м'яч у нас, червоний «стоп» — у суперника, жовтий — вільний. */
  setSignal(owner) {
    const k = owner > 0 ? 'go' : owner < 0 ? 'stop' : 'loose';
    if (k === this._sig) return;
    this._sig = k; this.t.sig.className = 'sig ' + k;
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
