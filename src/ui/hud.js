// Hud: табло матчу, годинник, картка гравця, банери. Методи з HUD_FWD (online/host.js) віддзеркалюються гостю.
import { I, crest, lokoCrest } from './icons.js';
import { KIT_LOKO } from '../config.js';
import { esc } from '../online/profile.js';

/** HUD матчу: чистий HTML/CSS поверх канвасу. Оновлюються лише змінені значення. */
export class Hud {
  constructor(root) {
    root.insertAdjacentHTML('beforeend', `
<section class="hud" id="hud" hidden>
  <div class="cine" id="h-cine"><i class="lb t"></i><i class="lb b"></i><span class="cine-tag" id="h-cine-tag"></span><small class="cine-skip">Торкнись — пропустити</small></div>
  <div class="bug hud-mid" id="h-bug">
    <span id="h-title" hidden></span>
    <div class="bug-main">
      <i class="bug-liv" aria-hidden="true"></i>
      <div class="bug-c me"><div class="crest-box" id="h-crest-me"></div><b id="h-me-name">ЛОК</b></div>
      <div class="bug-score"><div class="bug-sc me"><b id="h-sc-me">0</b></div><i class="bug-dash"></i><div class="bug-sc opp"><b id="h-sc-opp">0</b></div></div>
      <div class="bug-c opp"><b id="h-opp-name">СУП</b><div class="crest-box" id="h-crest-opp"></div></div>
      <div class="bug-t"><b id="h-time" class="plate-time"><span class="tm-m">00</span><em class="col">:</em><span class="tm-s">00</span></b><i class="bug-prog"><u id="h-prog"></u></i><small id="h-half">1-й тайм</small><i class="poss loose" id="h-sig" title="Зелений — м’яч у нас, червоний — у суперника"></i></div>
      <div class="bug-x" id="h-extra" hidden><b id="h-extra-n">+2</b><span id="h-extra-t"></span></div>
      <i class="bug-glint" aria-hidden="true"></i>
    </div>
    <div class="bug-goal" id="h-bug-goal" hidden><i class="bg-ball" aria-hidden="true"></i><b>ГОЛ</b><span id="h-bug-goal-t"></span></div>
    <div class="mcoins" hidden><b id="h-coins">0</b></div>
  </div>
  <div class="scard" id="h-scard" hidden></div>
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
    Object.assign(this.t, { prog: q('h-prog'), tmM: this.t.time.querySelector('.tm-m'), tmS: this.t.time.querySelector('.tm-s'), extra: q('h-extra'), extraN: q('h-extra-n'), extraT: q('h-extra-t'), bgoal: q('h-bug-goal'), bgoalT: q('h-bug-goal-t'), scard: q('h-scard') });
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
    this.spec = spec; this.goalLive = false; this.t.bgoal.hidden = true; this.t.scard.hidden = true; this.el.classList.remove('bug-off');
    this.t.title.textContent = spec.leagueName + ' · ' + spec.no + '/' + spec.of;
    this.t.oppName.textContent = spec.club.short || spec.club.name.slice(0, 3).toUpperCase();
    // онлайн: «ми» — свій онлайн-клуб (назва й прапор), а не «Локомотив»
    const H = spec.home;
    this.meName = H ? H.name : 'Локомотив';
    this.el.querySelector('#h-me-name').textContent = H ? H.short : 'ЛОК';
    this.t.crestMe.innerHTML = H && H.crest ? H.crest : lokoCrest();
    this.el.style.setProperty('--cb', spec.club.kit.main); this.el.style.setProperty('--cbt', spec.club.kit.main === '#eceff1' || spec.club.kit.main === '#f4f4f1' || spec.club.kit.main === '#e4e8ec' ? '#14231e' : '#fff');
    this.t.crestOpp.innerHTML = spec.club.crest || crest(spec.club.kit, spec.club.name.slice(0, 2));
    this.last = { time: '', me: -1, opp: -1, coins: -1 };
  }
  hide() { if (this.onHide) this.onHide(); this.cine(false); this.el.hidden = true; this.clearGoal(); this.warn(null); this.hint(null); this.t.banner.hidden = true; }

  /** Рахунок: цифра прокручується, як на табло стадіону — стара їде вгору, нова падає згори; блок спалахує кольором команди. */
  setScore(me, opp) {
    const roll = (el, v, side) => {
      const old = el.textContent; el.innerHTML = `<s class="o">${old}</s><s class="n">${v}</s>`;
      el.classList.remove('roll'); void el.offsetWidth; el.classList.add('roll');
      clearTimeout(this.tm['roll' + side]); this.tm['roll' + side] = setTimeout(() => { el.textContent = v; el.classList.remove('roll'); }, 900);
      const box = el.parentElement; box.classList.remove('goalfx'); void box.offsetWidth; box.classList.add('goalfx');
      const bug = this.t.mid; bug.classList.remove('scored', 'scored-me', 'scored-opp'); void bug.offsetWidth; bug.classList.add('scored', side);
    };
    if (me !== this.last.me) { const first = this.last.me < 0; this.last.me = me; if (first) this.t.me.textContent = me; else roll(this.t.me, me, 'scored-me'); }
    if (opp !== this.last.opp) { const first = this.last.opp < 0; this.last.opp = opp; if (first) this.t.opp.textContent = opp; else roll(this.t.opp, opp, 'scored-opp'); }
  }
  /** Годинник; extra — «+1:20», коли йде доданий час (головний годинник тоді стоїть на межі тайму). */
  setTime(text, urgent, half, extra) {
    if (text !== this.last.time) {
      this.last.time = text;
      const i = text.indexOf(':'), m = i > 0 ? text.slice(0, i) : text, sec = i > 0 ? text.slice(i + 1) : '';
      // хвилина перекидається, як пластинка на табло; секунди біжать рівно
      if (m !== this.last.min) {
        const el = this.t.tmM, old = this.last.min;
        this.last.min = m;
        if (old == null || old === '' || Math.abs(+m - +old) > 2) el.textContent = m;
        else { const o = document.createElement('s'), n = document.createElement('s'); o.className = 'o'; n.className = 'n'; o.textContent = old; n.textContent = m; el.replaceChildren(o, n); el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip'); }   // лише текст: у гостя рядок годинника приходить із мережі
      }
      this.t.tmS.textContent = sec;
    }
    if (half !== undefined && half !== this.last.half) { this.last.half = half; const h = this.t.half; h.classList.remove('swap'); void h.offsetWidth; h.textContent = half; h.classList.add('swap'); }
    this.t.mid.classList.toggle('urgent', !!urgent);
    const x = extra || '';
    if (x !== this.last.extra) { this.last.extra = x; this.t.extraT.textContent = x; this.t.mid.classList.toggle('stoppage', !!x); }
  }
  /** Смужка прогресу тайму під годинником; stop — доданий час (червона), held — годинник стоїть до розведення. */
  setProg(f, stop, held) {
    const k = Math.round(f * 500);
    if (k !== this.last.prog) { this.last.prog = k; this.t.prog.style.transform = 'scaleX(' + (k / 500) + ')'; }
    if (!!stop !== this.last.stop) { this.last.stop = !!stop; this.t.mid.classList.toggle('in-stop', !!stop); }
    if (!!held !== this.last.held) { this.last.held = !!held; this.t.mid.classList.toggle('held', !!held); }
  }
  /** Табличка резервного судді: «+N» вилітає з-під годинника й лишається, доки не скінчиться тайм. null — сховати. */
  addedTime(n) {
    const e = this.t.extra;
    if (!n) { e.hidden = true; this.t.mid.classList.remove('stoppage'); this.last.extra = ''; this.t.extraT.textContent = ''; return; }
    this.t.extraN.textContent = '+' + n; e.hidden = false;
    e.classList.remove('show'); void e.offsetWidth; e.classList.add('show');
  }
  /** Під табло виїжджає смужка «ГОЛ · Прізвище 34'» у кольорі команди, що забила. */
  scored(g) {
    const el = this.t.bgoal;
    this.t.bgoalT.textContent = g.name + ' ' + g.min;
    el.className = 'bug-goal ' + (g.mine ? 'me' : 'opp'); el.hidden = false;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this.tm.bgoal); this.tm.bgoal = setTimeout(() => { el.classList.add('out'); this.tm.bgoal = setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 450); }, 9000);
  }
  /** Велике табло, як у трансляції на перерві й після фінального свистка: команди, рахунок, автори голів. */
  scoreCard(d, dur = 3.5) {
    const sp = this.spec, el = this.t.scard;
    if (!sp) return;
    const list = (mine) => d.scorers.filter((g) => g.mine === mine).map((g, i) => `<li style="--i:${i}">${esc(g.name)} <em>${g.min}</em></li>`).join('');
    el.innerHTML = `<div class="sc-in ${d.final ? 'final' : ''}">
      <div class="sc-top"><b>${d.title}</b><span>${sp.leagueName} · матч ${sp.no}</span></div>
      <div class="sc-row">
        <div class="sc-team me"><span class="sc-cr">${this.t.crestMe.innerHTML}</span><b>${this.meName || 'Локомотив'}</b></div>
        <div class="sc-score"><b>${d.me}</b><i></i><b>${d.opp}</b></div>
        <div class="sc-team opp"><b>${sp.club.name}</b><span class="sc-cr">${this.t.crestOpp.innerHTML}</span></div>
      </div>
      ${d.pens ? `<div class="sc-pens">Пенальті ${d.pens.me} : ${d.pens.opp}</div>` : ''}
      <div class="sc-goals"><ul class="me">${list(true)}</ul><ul class="opp">${list(false)}</ul></div>
      ${d.note ? `<div class="sc-note">${d.note}</div>` : ''}
    </div>`;
    el.style.setProperty('--opp', sp.club.kit.main);
    el.hidden = false; el.classList.remove('out'); void el.offsetWidth;
    clearTimeout(this.tm.scard); this.tm.scard = setTimeout(() => { el.classList.add('out'); this.tm.scard = setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 500); }, dur * 1000);
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
    this.goalLive = true; this.el.classList.remove('bug-off');               // гол: табло лишається на екрані з новим рахунком
  }
  clearGoal() { this.t.goal.hidden = true; this.goalLive = false; if (this.el.classList.contains('cine-on')) this.el.classList.add('bug-off'); }
  /** Кінорежим: чорні смуги згори й знизу, мітка кадру («ПОВТОР»), підказка про пропуск. */
  cine(on, tag = null) {
    const c = this.cineEl ??= this.el.querySelector('#h-cine'), tg = this.cineTag ??= this.el.querySelector('#h-cine-tag');
    c.classList.toggle('on', !!on); this.el.classList.toggle('cine-on', !!on);
    // табло ховається в повторах, підбірках, перервах, на виході команд і після свистка — як у трансляції; лишається лише на святкуванні гола
    this.el.classList.toggle('bug-off', !!on && !this.goalLive);
    tg.textContent = on && tag ? tag : ''; tg.classList.toggle('live', tag === 'ПОВТОР');
    if (this.onCine) this.onCine(!!on);
  }

  /** Картка гравця з м'ячем: ім'я, рейтинг і три головні навички. null — сховати. */
  setCard(c, side) {
    const el = this.t.pcard;
    if (!c) { el.hidden = true; this._card = null; return; }
    const key = c.name + c.num + side;
    if (this._card === key) return;
    this._card = key;
    el.className = 'pcard ' + (side > 0 ? 'me' : 'opp'); el.hidden = false;
    el.innerHTML = `<b class="pc-ovr ${c.tier}">${c.ovr}</b><div class="pc-info"><span class="pc-name">${esc(c.name)}</span><small>№${c.num} · ${c.role}</small>${c.bars.map((b) => `<div class="pc-bar"><em>${b[0]}</em><i><u style="width:${b[1]}%"></u></i><s>${b[1]}</s></div>`).join('')}</div>`;
  }

  float(x, y, text, kind = '') {
    const d = this.floatEls[this.fi]; this.fi = (this.fi + 1) % this.floatEls.length;
    d.hidden = false; d.className = 'float ' + kind; d.textContent = text;
    d.style.left = x + 'px'; d.style.top = y + 'px';
    d.style.animation = 'none'; void d.offsetWidth; d.style.animation = '';
  }
}
