// Hud: табло матчу, годинник, картка гравця, банери. Методи з HUD_FWD (online/host.js) віддзеркалюються гостю.
import { I, crest, lokoCrest } from './icons.js';
import { KIT_LOKO } from '../config.js';
import { esc } from '../online/profile.js';

/** Світлий колір форми: на ньому темний текст. */
const light = (h) => { const n = parseInt(String(h).slice(1, 7), 16) || 0; return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150; };
// чип ситуації гола: [коли забили ми, коли забили нам]; ключі ставить Match.goalImportance
const GOAL_TAG = { upset: ['ПРОТИ ФАВОРИТА', ''], open: ['РАХУНОК ВІДКРИТО', 'РАХУНОК ВІДКРИТО'], eq: ['ВІДІГРАЛИСЯ', 'СУПЕРНИК ЗРІВНЯВ'], lead: ['ВИХІД УПЕРЕД', 'СУПЕРНИК ПОПЕРЕДУ'] };
const GOAL_LATE = { late: 'НА ОСТАННІХ ХВИЛИНАХ', added: 'У ДОДАНИЙ ЧАС' };
export const GOAL_KEYS = { tag: Object.keys(GOAL_TAG), late: Object.keys(GOAL_LATE) };   // перевірка подій онлайн-гостя

/**
 * Довга назва (клуб, прізвище) пишеться повністю: шрифт .fit зменшується, доки текст не влізе (до половини),
 * а якщо й так не влазить — переноситься на другий рядок. Кличеться раз після вставки розмітки, не щокадру.
 */
export function fitText(root) {
  for (const el of root.querySelectorAll('.fit')) {
    el.style.fontSize = ''; el.classList.remove('wrap');
    const w = el.clientWidth, sw = el.scrollWidth;
    if (!w || sw <= w + 1) continue;
    el.style.fontSize = parseFloat(getComputedStyle(el).fontSize) * Math.max(0.5, (w - 1) / sw) + 'px';
    if (el.scrollWidth > el.clientWidth + 1) el.classList.add('wrap');
  }
}

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
  <div class="goaltxt" id="h-goal" hidden></div>
  <div class="mday" id="h-mday" hidden></div>
  <div class="hint" id="h-hint" hidden><i class="hand"></i><span id="h-hint-t"></span></div>
  <div class="pcard" id="h-pcard" hidden></div>
  <div class="floats" id="h-floats"></div>
</section>`);
    const q = (id) => root.querySelector('#' + id);
    this.el = q('hud');
    this.t = { title: q('h-title'), time: q('h-time'), coins: q('h-coins'), me: q('h-sc-me'), opp: q('h-sc-opp'), oppName: q('h-opp-name'), crestMe: q('h-crest-me'), crestOpp: q('h-crest-opp'), warn: q('h-warn'), combo: q('h-combo'), banner: q('h-banner'), banT: q('h-ban-t'), banS: q('h-ban-sub'), banN: q('h-ban-note'), goal: q('h-goal'), mday: q('h-mday'), hint: q('h-hint'), hintT: q('h-hint-t'), floats: q('h-floats'), mid: root.querySelector('#h-bug'), half: q('h-half'), pcard: q('h-pcard') };
    this.t.sig = q('h-sig'); this._sig = '';
    Object.assign(this.t, { prog: q('h-prog'), tmM: this.t.time.querySelector('.tm-m'), tmS: this.t.time.querySelector('.tm-s'), extra: q('h-extra'), extraN: q('h-extra-n'), extraT: q('h-extra-t'), bgoal: q('h-bug-goal'), bgoalT: q('h-bug-goal-t'), scard: q('h-scard') });
    this.floatEls = [];
    // напис, що дограв, ховаємо зовсім: інакше після display:none (кінець матчу, новий старт) браузер програє його анімацію знову на старому місці
    for (let i = 0; i < 10; i++) { const d = document.createElement('div'); d.className = 'float'; d.hidden = true; d.addEventListener('animationend', () => { d.hidden = true; }); this.t.floats.appendChild(d); this.floatEls.push(d); }
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
  hide() { if (this.onHide) this.onHide(); this.cine(false); this.el.hidden = true; this.clearFloats(); this.clearGoal(); this.matchday(null); this.warn(null); this.hint(null); this.t.banner.hidden = true; }

  /**
   * Представлення суперника на виході команд: дві панелі в кольорах форм з'їжджаються до «VS»; на нашій ще форма (останні 5).
   * spec — як у show (spec.home — свій онлайн-клуб); x — { form, revenge, pw: [ми, вони] }.
   * Лише transform/opacity; ховається сама за ~4 с або від першого дотику (той самий дотик пропускає й кадр інтро). null — сховати.
   */
  matchday(spec, x = {}) {
    const el = this.t.mday;
    clearTimeout(this.tm.mday); clearTimeout(this.tm.mdayOut); clearTimeout(this.tm.mdayHide);
    if (this._mdOff) { window.removeEventListener('pointerdown', this._mdOff, true); this._mdOff = null; }
    if (!spec) {
      if (el.hidden || el.classList.contains('out')) return;
      el.classList.add('out'); this.tm.mdayOut = setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 380);
      return;
    }
    const H = spec.home, c = spec.club, e = esc, on = !!(spec.online || (H && H.online));   // у гостя spec — hudSpec без online, але клуби з matchClub
    const side = (cls, name, city, cr, kit, rows) => {
      const m = kit && kit.main || '#254e9c', s2 = kit && kit.second || '#f1efe8';
      return `<div class="md-side ${cls}" style="--k:${m};--k2:${s2};--kt:${light(m) ? '#0c1311' : '#f6f4ec'}"><div class="md-un">
        <span class="md-cr">${cr}</span><div class="md-name"><b class="fit">${e(name)}</b><small>${e(city || '')}</small>${rows}</div></div></div>`;
    };
    const pw = (i) => (x.pw ? `<em class="md-pw">сила <b>${x.pw[i]}</b></em>` : '');
    const form = x.form && x.form.length ? `<i class="md-form" title="Останні матчі">${x.form.map((r) => `<u class="${r === 'W' ? 'w' : r === 'D' ? 'd' : 'l'}"></u>`).join('')}</i>` : '';
    const me = side('me', H ? H.name : 'Локомотив', H ? H.city : 'Київ', this.t.crestMe.innerHTML, H ? H.kit : KIT_LOKO, pw(0) + form);
    const op = side('opp', c.name, c.city, this.t.crestOpp.innerHTML, c.kit, pw(1));
    const tag = on ? 'ОНЛАЙН-МАТЧ' : e(spec.leagueName);
    const no = on ? '' : `<span>матч ${spec.no} з ${spec.of}</span>`;
    el.innerHTML = `<div class="md-in">
      <div class="md-top"><b>${tag}</b>${no}${spec.final ? '<span class="fin">ФІНАЛ</span>' : ''}${x.revenge ? '<span class="rev">РЕВАНШ</span>' : ''}</div>
      <div class="md-row">${me}<div class="md-vs"><b>VS</b></div>${op}</div>
    </div>`;
    el.classList.remove('out'); el.hidden = false; fitText(el);
    this._mdOff = () => this.matchday(null);
    this.tm.mday = setTimeout(() => window.addEventListener('pointerdown', this._mdOff, true), 400);   // дотик, що запустив матч, картку не ховає
    this.tm.mdayHide = setTimeout(() => this.matchday(null), 4600);
  }

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
  /** Під табло виїжджає смужка «ГОЛ · Прізвище 34'» у кольорі команди, що забила; автогол — «АВТОГОЛ · Прізвище» (og). */
  scored(g) {
    const el = this.t.bgoal;
    this.t.bgoalT.textContent = g.name + ' ' + g.min;
    el.querySelector('b').textContent = g.og ? 'АВТОГОЛ' : 'ГОЛ';
    el.className = 'bug-goal ' + (g.mine ? 'me' : 'opp') + (g.og ? ' og' : ''); el.hidden = false;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this.tm.bgoal); this.tm.bgoal = setTimeout(() => { el.classList.add('out'); this.tm.bgoal = setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 450); }, 9000);
  }
  /** Велике табло, як у трансляції на перерві й після фінального свистка: команди, рахунок, автори голів. */
  scoreCard(d, dur = 3.5) {
    const sp = this.spec, el = this.t.scard;
    if (!sp) return;
    const list = (mine) => d.scorers.filter((g) => g.mine === mine).map((g, i) => `<li style="--i:${i}">${esc(g.name)}${g.og ? ' <i class="og">авт.</i>' : ''} <em>${esc(g.min)}</em></li>`).join('');
    el.innerHTML = `<div class="sc-in ${d.final ? 'final' : ''}">
      <div class="sc-top"><b>${d.title}</b><span>${sp.leagueName} · матч ${sp.no}</span></div>
      <div class="sc-row">
        <div class="sc-team me"><span class="sc-cr">${this.t.crestMe.innerHTML}</span><b class="fit">${esc(this.meName || 'Локомотив')}</b></div>
        <div class="sc-score"><b>${d.me}</b><i></i><b>${d.opp}</b></div>
        <div class="sc-team opp"><b class="fit">${esc(sp.club.name)}</b><span class="sc-cr">${this.t.crestOpp.innerHTML}</span></div>
      </div>
      ${d.pens ? `<div class="sc-pens">Пенальті ${d.pens.me} : ${d.pens.opp}</div>` : ''}
      <div class="sc-goals"><ul class="me">${list(true)}</ul><ul class="opp">${list(false)}</ul></div>
      ${d.note ? `<div class="sc-note">${d.note}</div>` : ''}
    </div>`;
    el.style.setProperty('--opp', sp.club.kit.main);
    el.hidden = false; el.classList.remove('out'); fitText(el);
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
  /**
   * Напис гола з погляду того, хто дивиться: великий заголовок у центрі (згасає за ~3 с) і плашка автора внизу, як у трансляції.
   * d: { mine, og, name, min, ast, tag, late, extra, coins, gk } — mine: забила наша команда (при og — це суперник зрізав у свої);
   * name — прізвище автора (при og — автора автогола), ast — хто віддав пас, tag/late — ключі GOAL_TAG/GOAL_LATE.
   * Серія пенальті: { pen: 'goal'|'save'|'miss'|'post', mine (б'є наш), name, min, series }.
   */
  goal(d) {
    const g = this.t.goal, e = esc, crMe = this.t.crestMe.innerHTML, crOpp = this.t.crestOpp.innerHTML;
    let kind, title, label, sub = '', cr, ribbon = '';
    const chips = [];
    if (d.pen) {
      const good = (d.pen === 'goal') === !!d.mine;
      kind = good ? 'me' : 'opp'; label = 'ПЕНАЛЬТІ'; cr = d.mine ? crMe : crOpp;
      title = d.pen === 'goal' ? (d.mine ? 'ГОЛ!' : 'ЗАБИЛИ') : d.pen === 'save' ? (d.mine ? 'ВІДБИВ' : 'ТИ ВІДБИВ!') : d.pen === 'miss' ? 'МИМО!' : 'ШТАНГА!';
      if (d.series) chips.push(['', 'серія ' + d.series]);
    } else {
      const mine = !!d.mine, own = mine !== !!d.og;                            // own — автор із нашої команди
      kind = (mine ? 'me' : 'opp') + (d.og ? ' og' : '');
      title = d.og ? (mine ? 'АВТОГОЛ!' : 'АВТОГОЛ') : mine ? 'ГОЛ!' : 'ПРОПУСТИЛИ';
      label = d.og ? 'АВТОГОЛ' : 'ГОЛ';
      cr = own ? crMe : crOpp;
      sub = d.og ? (d.gk ? 'воротар — у власні ворота' : 'зрізав у власні ворота') : d.ast ? 'пас: ' + d.ast : '';
      const t = GOAL_TAG[d.tag]; if (t && t[mine ? 0 : 1]) chips.push(['tag', t[mine ? 0 : 1]]);
      if (d.extra) chips.push(['', d.extra]);
      if (d.coins) chips.push(['coin', '+' + d.coins]);
      ribbon = GOAL_LATE[d.late] || '';
      if (ribbon) kind += ' late';
    }
    const who = d.name || (cr === crMe ? this.meName || 'Локомотив' : this.spec ? this.spec.club.name : '');
    g.innerHTML = `<div class="gt-mid">${ribbon ? `<div class="gt-late"><span>${ribbon}</span></div>` : ''}
      <h1 class="gt-t" aria-label="${title}">${[...title].map((ch, i) => `<s style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</s>`).join('')}</h1>
      ${chips.length ? `<div class="gt-chips">${chips.map(([c, t], i) => `<span class="${c}" style="--i:${i}">${e(t)}${c === 'coin' ? I.coin : ''}</span>`).join('')}</div>` : ''}</div>
      <div class="gt-plate"><div class="gt-card"><i class="gt-lab">${label}</i><div class="gt-row"><span class="gt-cr">${cr}</span><div class="gt-who"><b class="fit">${e(who)}</b>${sub ? `<small>${e(sub)}</small>` : ''}</div><em>${e(d.min || '')}</em></div></div></div>`;
    g.className = 'goaltxt ' + kind; g.hidden = false; fitText(g);
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

  /** Прибрати всі дрібні написи одразу: розведення після гола чи тайму, кінець матчу. */
  clearFloats() { for (const d of this.floatEls) d.hidden = true; }
  float(x, y, text, kind = '') {
    const d = this.floatEls[this.fi]; this.fi = (this.fi + 1) % this.floatEls.length;
    d.hidden = false; d.className = 'float ' + kind; d.textContent = text;
    d.style.left = x + 'px'; d.style.top = y + 'px';
    d.style.animation = 'none'; void d.offsetWidth; d.style.animation = '';
  }
}
