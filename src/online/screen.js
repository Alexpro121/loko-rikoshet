// Вкладка «Онлайн» у меню: свій онлайн-клуб (назва, прапор, рівень, рейтинг), герої з прокачкою і гра з людиною
// за кодом кімнати. Тут лише розмітка й кнопки; логіка з'єднання — session.js.
import { audio } from '../core/audio.js';
import { I } from '../ui/icons.js';
import { portrait } from '../ui/portrait.js';
import { STAT_NAMES, STAT_HINT, ROLE_UA, keysFor, ovr, xpNeed } from '../state/squad.js';
import { fmt } from '../state/economy.js';
import { OP, saveOP, resetOP, esc, plain, flagSvg, kitOf, gkKitOf, teamRating, trainPrice, trainHero, scoutHero, SCOUT_PRICE, clubXpNeed, TRAITS, RARITY } from './profile.js';
import { FLAG_COLS, FLAG_PATS, FLAG_EMB, FLAG_PLATES, FLAG_OVS, FLAG_EDGES, FLAG_STYLES, flagUri, emblemSvg, rollFlag } from './flag.js';
import { Online } from './session.js';
import { cleanCode } from './net.js';

const STYLE_UA = { any: 'Усі', classic: 'Класика', herald: 'Геральдика', modern: 'Сучасний', wild: 'Дикий' };
const FE_TABS = { gen: 'Генератор', field: 'Поле', emblem: 'Знак', colors: 'Кольори', extra: 'Оздоба' };
const SLOTS_UA = ['Футболка', 'Шорти', 'Третій', 'Знак', 'Плашка', 'Воротар'];
const EDGE_UA = { none: 'Без рамки', thin: 'Тонка', white: 'Біла', gold: 'Золота', double: 'Подвійна', wide: 'Широка' };
const PLATE_UA = { none: 'Без плашки', disc: 'Коло', shield: 'Щит', dia: 'Ромб', hex: 'Шестикутник', oct: 'Восьмикутник', sq: 'Квадрат', star: 'Зірка' };
const WF_SLICES = 14, WF_PERIOD = 2.6;

/** Полотно, що майорить: смужки одного SVG хитаються зі зсувом. Фаза від годинника, тож перемальовування панелі не смикає хвилю. */
const waveFlag = (flag, cls = '') => {
  let sl = ''; for (let i = 0; i < WF_SLICES; i++) sl += `<s style="--i:${i}"></s>`;
  return `<div class="wf ${cls}" data-wf style="--fl:${flagUri(flag)};--ph:${(-(performance.now() / 1000) % WF_PERIOD).toFixed(2)}s"><i class="wf-pole"></i><div class="wf-cloth">${sl}</div></div>`;
};
const tile = (label, val, cls = '') => `<div class="on-tile ${cls}"><small>${label}</small><b>${val}</b></div>`;

export class OnlineScreen {
  constructor(ui, game) {
    this.ui = ui; this.g = game; this.tab = 'play'; this.sel = 1; this.codeIn = '';
    this.fe = 'gen'; this.feStyle = 'any'; this.slot = 0; this.cands = null; this.hist = []; this.histT = 0;
    this.seenSel = -1; this.popKey = null; this.bump = false; this.rdy = { me: false, opp: false };
    ui.root.addEventListener('change', (e) => { if (e.target.matches('[data-ocol]')) this.patchFe(); });   // свій колір: панель перемальовуємо лише після вибору, інакше палітра закриється
    this.s = new Online(game, ui);
    // запрошення за посиланням ?room=КОД: відкриваємо вкладку й одразу заходимо в кімнату
    // пінг у лобі оновлюється сам (без перемальовування панелі — щоб не збивати натискання)
    setInterval(() => {
      const el = ui.panel === 'online' && ui.el.panel.querySelector('.on-ping'), n = this.s.net;
      if (el && n && n.rtt) el.textContent = 'пінг ' + Math.round(n.rtt) + ' мс';
    }, 2000);
    const m = /[?&]room=([A-Za-z0-9]{5})/.exec(location.search);
    this.invite = m ? cleanCode(m[1]) : null;
  }
  /** Після заставки меню: якщо гра відкрита за посиланням-запрошенням — одразу в кімнату. */
  onMenu() {
    if (!this.invite) return;
    const code = this.invite; this.invite = null;
    try { history.replaceState(null, '', location.pathname); } catch (_) { /* ignore */ }
    this.ui.openPanel('online'); this.tab = 'play'; this.s.join(code);
  }

  /** Ключ вкладки для панелі: зміна стану кімнати теж «нова сторінка» (вхідні анімації, прокрутка з нуля). */
  subKey() { return this.tab === 'play' ? 'play:' + this.playState() : this.tab; }
  playState() { const s = this.s; return !s.net ? (s.state === 'creating' || s.state === 'joining' ? s.state : 'idle') : s.state === 'result' ? 'lobby' : s.state; }

  html() {
    const t = this.tab, c = OP.club, k = kitOf(c), tb = (id, n) => `<button class="${t === id ? 'on' : ''}" data-act="on-tab:${id}"><span>${n}</span></button>`;
    const body = t === 'club' ? this.clubHtml() : t === 'heroes' ? this.heroesHtml() : this.playHtml();
    const bump = this.bump; this.bump = false;
    return `<div class="sheet wide on-sheet" style="--ka:${k.main};--kb:${k.second}">
      <header class="on-h">
        <div class="on-h-fl" data-hflag>${flagSvg(c.flag)}</div>
        <div class="on-h-t"><small>Онлайн-клуб · рів. ${OP.lvl}</small><h2 data-hname>${esc(c.name)}</h2></div>
        <nav class="on-tabs">${tb('play', 'Гра')}${tb('club', 'Клуб')}${tb('heroes', 'Герої')}</nav>
        <span class="on-purse ${bump ? 'bump' : ''}"><b>${fmt(OP.coins)}</b>${I.coin}</span>
        <button class="sq on-x" data-act="close-panel" aria-label="Закрити">${I.close}</button>
      </header>
      <div class="sheet-b on-b">${body}</div></div>`;
  }

  // ------------------------------------------------------------------ клуб
  /** Картка клубу: прапор на сцені, назва, цифри. Спільна для гри, кімнати й лобі. */
  clubCard(p, o = {}) {
    const c = p.club, rating = p.rating, power = teamRating(p.heroes), lvl = p.lvl, x = o.vs;
    const cmp = (a, b) => (x ? (a > b ? 'up' : a < b ? 'down' : '') : '');
    return `<div class="on-stage ${o.opp ? 'opp' : ''}">${waveFlag(c.flag, o.opp ? 'mirror' : '')}${o.stamp || ''}</div>
      <div class="on-cc-n"><b>${esc(c.name)}</b><em>${esc(c.city || '')}</em></div>
      <div class="on-tiles">${tile('Рейтинг', rating, cmp(rating, x && x.rating))}${tile('Сила', power, cmp(power, x && teamRating(x.heroes)))}${tile('Рівень', lvl, cmp(lvl, x && x.lvl))}</div>`;
  }
  /** Форма клубу на справжніх гравцях: рендер кешується за кольорами, тож кожен новий колір малюється один раз. */
  kitsHtml() {
    const H = OP.heroes, star = H.reduce((b, e) => (e.line !== 'G' && ovr(e) > ovr(b) ? e : b), H[1]), k = kitOf(OP.club), sig = k.main + k.second + OP.club.gk;
    return `<img data-kit="f" src="${portrait(this.g.renderer, this.look(star), 'on-' + star.id + star.num + sig)}" alt=""/><img data-kit="g" src="${portrait(this.g.renderer, this.look(H[0]), 'on-' + H[0].id + H[0].num + sig)}" alt=""/>`;
  }
  clubHtml() {
    const c = OP.club, need = clubXpNeed(OP.lvl), w = OP.games ? Math.round((OP.rec.w / OP.games) * 100) : 0;
    return `<div class="on-club">
      <section class="on-id on-a">
        <div class="on-stage big"><div class="on-kits" data-kits data-sig="${kitOf(c).main + kitOf(c).second + c.gk}">${this.kitsHtml()}</div>${waveFlag(c.flag)}</div>
        <input class="on-name" data-oname maxlength="14" value="${esc(c.name)}" aria-label="Назва клубу"/>
        <input class="on-city" data-ocity maxlength="18" value="${esc(c.city)}" aria-label="Місто"/>
        <div class="on-lvl"><div><span>Рівень <b>${OP.lvl}</b></span><small>${OP.xp}/${need} · новий рівень: +100 ${I.coin}</small></div><i class="on-bar"><u style="width:${Math.min(100, (OP.xp / need) * 100)}%"></u></i></div>
        <div class="on-tiles four">${tile('Рейтинг', OP.rating)}${tile('Сила', teamRating())}${tile('Матчі', OP.games)}${tile('Голи', OP.goals)}</div>
        <div class="on-rec"><span>Перемоги <b>${OP.rec.w}</b></span><span>Нічиї <b>${OP.rec.d}</b></span><span>Поразки <b>${OP.rec.l}</b></span><span>Відсоток <b>${w}%</b></span></div>
        <p class="fine">Перемога +120, нічия +60, поразка +30, кожен гол +15 ${I.coin}. Монети, рівні й герої тут окремі від «Локомотива».</p>
        <button class="on-reset" data-act="on-reset"><b>НОВИЙ ВИПАДКОВИЙ КЛУБ</b></button>
      </section>
      <section class="on-fe on-a" style="--d:1">
        <div class="on-fe-t">${Object.keys(FE_TABS).map((k) => `<button class="${this.fe === k ? 'on' : ''}" data-act="on-fe:${k}">${FE_TABS[k]}</button>`).join('')}</div>
        <div class="on-fe-b" data-febody>${this.feHtml()}</div>
      </section></div>`;
  }

  // ------------------------------------------------------------------ редактор прапора
  feHtml() { return { gen: this.feGen, field: this.feField, emblem: this.feEmblem, colors: this.feColors, extra: this.feExtra }[this.fe].call(this); }
  dice(part, label) { return `<button class="on-dice" data-act="on-froll:${part}"><span>${emblemSvg('star4')}</span><b>${label}</b></button>`; }
  thumb(act, cur, id, flag, title) { return `<button class="on-th ${cur === id ? 'on' : ''}" data-act="${act}:${id}" aria-label="${title}" title="${title}">${flagSvg(flag)}</button>`; }
  feGen() {
    if (!this.cands) this.rollCands();
    const seg = ['any', ...FLAG_STYLES].map((k) => `<button class="${this.feStyle === k ? 'on' : ''}" data-act="on-fstyle:${k}">${STYLE_UA[k]}</button>`).join('');
    const cards = this.cands.map((f, i) => `<button class="on-cand" style="--i:${i}" data-act="on-cand:${i}" aria-label="Обрати варіант ${i + 1}">${flagSvg(f)}</button>`).join('');
    return `<div class="on-seg">${seg}</div><div class="on-cands">${cards}</div>
      <div class="on-fe-row"><button class="on-dice main" data-act="on-cands"><span>${emblemSvg('star4')}</span><b>ЩЕ ВАРІАНТИ</b></button><button class="on-dice" data-act="on-undo" ${this.hist.length ? '' : 'disabled'}><b>НАЗАД</b></button></div>
      <small class="on-note">Торкнись варіанта, і він стане прапором клубу. Форма фарбується у два перші кольори прапора.</small>`;
  }
  feField() {
    const f = OP.club.flag, bare = { ...f, em: 'none', pl: 'none', ov: 'none', edge: 'none' };
    return `<div class="on-fe-row">${this.dice('field', 'ВИПАДКОВЕ ПОЛЕ')}<button class="on-dice ${f.flip ? 'lit' : ''}" data-act="on-flip"><b>ДЗЕРКАЛО</b></button></div>
      <div class="on-grid">${FLAG_PATS.map((p) => this.thumb('on-pat', f.pat, p, { ...bare, pat: p }, p)).join('')}</div>`;
  }
  feEmblem() {
    const f = OP.club.flag, c = f.c;
    const ems = FLAG_EMB.map((e) => `<button class="on-em ${f.em === e ? 'on' : ''}" style="background:${c[0]}" data-act="on-emb:${e}" aria-label="${e}">${e === 'none' ? '<i class="on-none"></i>' : emblemSvg(e, c[3] === c[0] ? c[1] : c[3])}</button>`).join('');
    const pls = FLAG_PLATES.map((p) => this.thumb('on-plate', f.pl, p, { ...f, ov: 'none', edge: 'none', pos: 4, sz: 100, rep: 1, rot: 0, pl: p }, PLATE_UA[p])).join('');
    const spots = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<button class="${f.pos === i ? 'on' : ''}" data-act="on-pos:${i}" aria-label="Позиція ${i + 1}"></button>`).join('');
    const rep = [1, 2, 3].map((n) => `<button class="${f.rep === n ? 'on' : ''}" data-act="on-rep:${n}">×${n}</button>`).join('');
    return `<div class="on-fe-row">${this.dice('emblem', 'ВИПАДКОВИЙ ЗНАК')}</div>
      <div class="on-tune">
        <div class="on-pad" aria-label="Місце знака">${spots}</div>
        <div class="on-sl">
          <div class="rng"><label>Розмір <output data-out="sz">${f.sz}%</output></label><input type="range" min="40" max="200" step="5" value="${f.sz}" data-oflag="sz" aria-label="Розмір знака"/></div>
          <div class="rng"><label>Нахил <output data-out="rot">${f.rot}°</output></label><input type="range" min="-180" max="180" step="5" value="${f.rot}" data-oflag="rot" aria-label="Нахил знака"/></div>
          <div class="on-seg sm"><small>Скільки</small>${rep}</div>
        </div>
      </div>
      <small class="on-cap">Знак</small><div class="on-grid em">${ems}</div>
      <small class="on-cap">Плашка під знаком</small><div class="on-grid">${pls}</div>`;
  }
  feColors() {
    const c = OP.club, f = c.flag, cur = this.slot === 5 ? c.gk : f.c[this.slot];
    const slots = SLOTS_UA.map((n, i) => `<button class="on-slot ${this.slot === i ? 'on' : ''}" data-act="on-slot:${i}"><i data-slot="${i}" style="background:${i === 5 ? c.gk : f.c[i]}"></i><span>${n}</span></button>`).join('');
    const sw = FLAG_COLS.map((x) => `<button class="sw ${cur === x ? 'on' : ''}" style="background:${x}" data-act="on-col:${x}" aria-label="${x}"></button>`).join('');
    return `<div class="on-fe-row">${this.dice('colors', 'ВИПАДКОВА СХЕМА')}<button class="on-dice" data-act="on-swap"><b>ПОМІНЯТИ 1 І 2</b></button></div>
      <div class="on-slots">${slots}</div><div class="on-pal">${sw}<label class="on-own"><input type="color" value="${cur}" data-ocol aria-label="Свій колір"/><span>Свій</span></label></div>`;
  }
  feExtra() {
    const f = OP.club.flag;
    return `<div class="on-fe-row">${this.dice('extra', 'ВИПАДКОВА ОЗДОБА')}</div>
      <small class="on-cap">Оздоба</small><div class="on-grid">${FLAG_OVS.map((o) => this.thumb('on-ov', f.ov, o, { ...f, ov: o }, o)).join('')}</div>
      <small class="on-cap">Рамка</small><div class="on-grid wide">${FLAG_EDGES.map((e) => this.thumb('on-edge', f.edge, e, { ...f, edge: e }, EDGE_UA[e])).join('')}</div>`;
  }
  rollCands() { this.cands = []; for (let i = 0; i < 8; i++) this.cands.push(rollFlag(this.feStyle)); }
  remember() { const now = performance.now(); if (now - this.histT > 700) { this.hist.push(JSON.stringify(OP.club.flag)); if (this.hist.length > 30) this.hist.shift(); } this.histT = now; }
  /** Оновлює прапор усюди на вкладці, не чіпаючи решту панелі: перетягування повзунка й хвиля не перериваються. */
  patchFlag(pop) {
    const P = this.ui.el.panel, f = OP.club.flag, k = kitOf(OP.club), u = flagUri(f);
    P.querySelectorAll('[data-wf]').forEach((w) => w.style.setProperty('--fl', u));
    const h = P.querySelector('[data-hflag]'); if (h) h.innerHTML = flagSvg(f);
    const sh = P.querySelector('.on-sheet'); if (sh) { sh.style.setProperty('--ka', k.main); sh.style.setProperty('--kb', k.second); }
    if (pop) { const w = P.querySelector('.on-stage [data-wf]'); if (w && w.animate) w.animate([{ transform: 'scale(.88) rotate(-2deg)' }, { transform: 'scale(1.05)', offset: 0.6 }, { transform: 'none' }], { duration: 320, easing: 'ease-out' }); }
  }
  patchFe() {
    const P = this.ui.el.panel, b = P.querySelector('[data-febody]'); if (!b) return;
    const y = b.scrollTop; b.innerHTML = this.feHtml(); b.scrollTop = y;
    const ks = P.querySelector('[data-kits]'), k = kitOf(OP.club), sig = k.main + k.second + OP.club.gk;   // картинку міняємо лише з новими кольорами, інакше вона блимає
    if (ks && ks.dataset.sig !== sig) { ks.dataset.sig = sig; ks.innerHTML = this.kitsHtml(); }
  }
  /** Прапор змінився кнопкою: зберегти, показати, сказати супернику (із затримкою, щоб серія кліків не засипала канал). */
  flagDone(pop = true) {
    saveOP(); this.patchFlag(pop); this.patchFe(); this.syncSoon();
  }
  syncSoon() { clearTimeout(this.syncT); this.syncT = setTimeout(() => this.s.sync(), 250); }

  // ------------------------------------------------------------------ герої
  look(e) { const gk = e.line === 'G'; return { kit: gk ? gkKitOf(OP.club) : kitOf(OP.club), num: e.num, skin: e.skin, hair: e.hair, hairCol: e.hairCol, beard: e.beard || 0, gk, scale: 0.9 }; }
  heroesHtml() {
    const g = this.g, H = OP.heroes, kk = kitOf(OP.club), kSig = kk.main + kk.second + OP.club.gk;
    if (!H[this.sel]) this.sel = 1;
    const fresh = this.seenSel !== this.sel; this.seenSel = this.sel;
    const pop = this.popKey; this.popKey = null;
    const cards = H.map((e, i) => {
      const o = ovr(e), R = RARITY[e.rar] || RARITY.c;
      const img = portrait(g.renderer, this.look(e), 'on-' + e.id + e.num + kSig);
      return `<button class="sq-card on-hero r-${e.rar || 'c'} on-a ${i === this.sel ? 'on' : ''}" style="--rc:${R.col};--d:${i * 0.5}" data-act="on-sel:${i}"><i class="on-ovr">${o}</i><img src="${img}" alt=""/><b>${esc(e.name.split(' ').slice(-1)[0])}</b><em>№${e.num} · ${e.role}</em></button>`;
    }).join('');
    const e = H[this.sel], o = ovr(e), R = RARITY[e.rar] || RARITY.c, T = TRAITS[e.trait], need = xpNeed(e.lvl);
    const tiles = keysFor(e.line).map((k) => {
      const v = e.stats[k], c = trainPrice(v), can = OP.coins >= c && v < 99, tr = T && T.stat === k;
      return `<div class="st ${tr ? 'tr' : ''} ${pop === k ? 'pop' : ''}"><div class="st-t"><span>${STAT_NAMES[k]}${tr ? ' ★' : ''}</span><b>${v}</b></div><i><u style="width:${v}%"></u></i><button class="btn buy ${can ? 'can' : ''}" data-act="on-train:${this.sel}:${k}" ${v >= 99 ? 'disabled' : ''}><b>+1 · ${fmt(c)}</b>${I.coin}</button><small>${STAT_HINT[k]}</small>${pop === k ? '<u class="on-plus">+1</u>' : ''}</div>`;
    }).join('');
    const hero = portrait(g.renderer, this.look(e), 'on-' + e.id + e.num + kSig);
    const detail = `<div class="sq-d ${fresh ? 'on-flip' : ''}" style="--rc:${R.col}"><div class="on-hd r-${e.rar || 'c'}"><div class="on-hd-p"><i class="on-rays"></i><img src="${hero}" alt=""/><i class="on-ovr big">${o}</i></div><div class="on-hd-t"><h3>${esc(e.name)}</h3>
      <p><span class="on-rar">${R.name}</span> №${e.num} · ${ROLE_UA[e.role] || e.role}</p>${T ? `<p class="on-trait">★ ${T.name}: ${T.tip}</p>` : ''}
      <i class="on-bar"><u style="width:${Math.min(100, (e.xp / need) * 100)}%"></u></i><small>Рівень ${e.lvl} · досвід ${e.xp}/${need} · матчів ${e.apps} · голів ${e.goals}</small>
      <button class="btn alt on-scout ${OP.coins >= SCOUT_PRICE ? '' : 'dim'}" data-act="on-scout:${this.sel}"><b>СКАУТ: ІНШИЙ ГЕРОЙ · ${SCOUT_PRICE}</b>${I.coin}</button></div></div><div class="st-grid">${tiles}</div></div>`;
    return `<div class="sq-wrap on-heroes"><div class="sq-list scroller">${cards}</div>${detail}</div>`;
  }
  /** Новий герой від скаута: картка відкривається з променями кольору рідкості; закриття веде назад у панель. */
  revealHero(h) {
    const R = RARITY[h.rar] || RARITY.c, T = TRAITS[h.trait], k = kitOf(OP.club);
    const img = portrait(this.g.renderer, this.look(h), 'on-' + h.id + h.num + k.main + k.second + OP.club.gk);
    const el = this.ui.el.reveal;
    el.innerHTML = `<div class="reveal-in on-reveal r-${h.rar || 'c'}" style="--rc:${R.col}" data-act="close-reveal"><div class="rays"></div><i class="on-ovr big">${ovr(h)}</i><img src="${img}" alt=""/><small>${R.name}</small><h2>${esc(h.name)}</h2><p>№${h.num} · ${ROLE_UA[h.role] || h.role}${T ? ` · ★ ${T.name}` : ''}</p><button class="btn go"><b>ДО СКЛАДУ</b></button></div>`;
    el.hidden = false;
  }

  // ------------------------------------------------------------------ гра
  playHtml() {
    const s = this.s, st = this.playState(), err = s.err ? `<p class="on-err">${esc(s.err)}</p>` : '';
    if (st === 'idle' || st === 'hosting') this.rdy = { me: false, opp: false };
    if (st === 'idle') {
      return `<div class="on-play">
        <section class="on-card on-cc on-a">${this.clubCard(OP)}<div class="on-rec"><span>Перемоги <b>${OP.rec.w}</b></span><span>Нічиї <b>${OP.rec.d}</b></span><span>Поразки <b>${OP.rec.l}</b></span></div></section>
        <section class="on-card on-go on-a" style="--d:1">
          <button class="on-create" data-act="on-create"><i class="on-sweep"></i><span>${I.play}</span><b>СТВОРИТИ КІМНАТУ<small>отримаєш код для друга</small></b></button>
          <div class="on-or"><span>або введи код друга</span></div>
          <div class="on-join"><input class="on-code-in" data-ocode maxlength="5" placeholder="КОД" value="${esc(this.codeIn)}" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Код кімнати"/><button class="btn alt" data-act="on-join"><b>УВІЙТИ</b></button></div>${err}
          <p class="fine">Матч 1 на 1: кожен керує своєю командою, коли м’яч у його гравця. Потрібен інтернет в обох. Сервер лише знайомить гравців, далі гра йде напряму між пристроями.</p></section></div>`;
    }
    if (st === 'creating' || st === 'joining' || st === 'wait') {
      const t = st === 'creating' ? 'Створюємо кімнату' : st === 'wait' ? 'Перепідключаємось' : 'Шукаємо кімнату ' + esc(s.code);
      return `<div class="on-play"><section class="on-card on-busy on-a"><div class="on-wheel">${emblemSvg('wheel')}</div><i class="on-rail"></i><b>${t}<span class="on-dots"><u></u><u></u><u></u></span></b>${err}<button class="btn alt" data-act="on-cancel"><b>СКАСУВАТИ</b></button></section></div>`;
    }
    if (st === 'hosting') {
      const code = [...s.code].map((ch, i) => `<s style="--i:${i}">${ch}</s>`).join('');
      return `<div class="on-play">
        <section class="on-card on-cc on-a">${this.clubCard(OP)}</section>
        <section class="on-card on-room on-a" style="--d:1"><small>Код кімнати</small><div class="on-code flap">${code}</div>
          <div class="on-row"><button class="btn go" data-act="on-copy"><b>КОПІЮВАТИ КОД</b></button><button class="btn alt" data-act="on-share"><b>ПОСИЛАННЯ</b></button></div>
          <div class="on-wait"><div class="on-radar"><i></i><i></i><u></u></div><span>Чекаємо суперника<span class="on-dots"><u></u><u></u><u></u></span></span></div>${err}<button class="btn alt on-close" data-act="on-cancel"><b>ЗАКРИТИ КІМНАТУ</b></button></section></div>`;
    }
    // лобі: обидва на зв'язку
    const o = s.opp, rtt = s.net && s.net.rtt ? Math.round(s.net.rtt) : 0;
    const stampOf = (key, on) => { const nw = on && !this.rdy[key]; this.rdy[key] = on; return on ? `<div class="on-stamp ${nw ? 'new' : ''}">ГОТОВИЙ</div>` : ''; };
    const myStamp = stampOf('me', s.ready.me), opStamp = stampOf('opp', s.ready.opp);
    const bars = rtt ? (rtt < 60 ? 4 : rtt < 120 ? 3 : rtt < 220 ? 2 : 1) : 0, sig = [1, 2, 3, 4].map((i) => `<u class="${i <= bars ? 'on' : ''}"></u>`).join('');
    const oc = o ? `${this.clubCard(o, { opp: true, vs: OP, stamp: opStamp })}<div class="on-ready ${s.ready.opp ? 'yes' : ''}">${s.ready.opp ? 'ГОТОВИЙ ДО МАТЧУ' : `чекаємо<span class="on-dots"><u></u><u></u><u></u></span>`}</div>` : `<div class="on-busy mini"><div class="on-wheel">${emblemSvg('wheel')}</div><b>Отримуємо дані суперника</b></div>`;
    return `<div class="on-play on-lobby">
      <section class="on-card on-cc on-fromL">${this.clubCard(OP, { vs: o, stamp: myStamp })}<button class="btn ${s.ready.me ? 'on' : 'go'} on-rdy" data-act="on-ready" ${o ? '' : 'disabled'}><b>${s.ready.me ? 'ГОТОВИЙ ✓' : 'Я ГОТОВИЙ'}</b></button></section>
      <div class="on-vs on-a" style="--d:3"><i class="on-vs-l"></i><b>VS</b><i class="on-vs-l"></i><div class="on-sig" aria-hidden="true">${sig}</div><small class="on-ping">${rtt ? 'пінг ' + rtt + ' мс' : 'пінг —'}</small><small>${s.role === 'host' ? 'ти господар' : 'ти в гостях'}</small><small>код ${esc(s.code)}</small></div>
      <section class="on-card on-cc on-fromR">${oc}</section>
      <div class="on-foot">${err}<button class="btn alt" data-act="on-cancel"><b>ВИЙТИ З КІМНАТИ</b></button></div></div>`;
  }

  // ------------------------------------------------------------------ дії
  input(el) {
    if (el.matches('[data-oname]')) {
      const v = plain(el.value).toUpperCase().slice(0, 14);
      if (v.replace(/[^A-ZА-ЯІЇЄҐ]/g, '') === 'ЮКСА') { audio.deny(); this.ui.toast('Помилка, проблемна команда'); el.value = OP.club.name; return true; }   // заборонена назва: лишається попередня
      if (v) { OP.club.name = v; saveOP(); this.s.sync(); const h = this.ui.el.panel.querySelector('[data-hname]'); if (h) h.textContent = v; }
      return true;
    }
    if (el.matches('[data-ocity]')) { OP.club.city = plain(el.value).slice(0, 18); saveOP(); this.s.sync(); return true; }
    if (el.matches('[data-oflag]')) {                                // повзунки: панель не перемальовуємо, інакше перетягування обірветься
      this.remember(); const k = el.dataset.oflag, v = +el.value; OP.club.flag[k] = v; saveOP(); this.patchFlag(false); this.syncSoon();
      const o = this.ui.el.panel.querySelector(`[data-out="${k}"]`); if (o) o.textContent = v + (k === 'rot' ? '°' : '%');
      return true;
    }
    if (el.matches('[data-ocol]')) {
      this.remember(); this.setColor(el.value); saveOP(); this.patchFlag(false); this.syncSoon();
      const sl = this.ui.el.panel.querySelector(`[data-slot="${this.slot}"]`); if (sl) sl.style.background = el.value;
      return true;
    }
    if (el.matches('[data-ocode]')) { const v = cleanCode(el.value); this.codeIn = v; if (el.value !== v) el.value = v; return true; }
    return false;
  }
  setColor(x) { if (this.slot === 5) OP.club.gk = x; else OP.club.flag.c[this.slot] = x; }
  act(a, el) {
    const s = this.s, [k, x, y] = a.split(':');
    const re = () => this.ui.renderPanel();
    const ed = () => { s.sync(); return re(); };             // свій клуб змінився — суперник теж має це бачити
    switch (k) {
      case 'on-tab': audio.click(); this.tab = x; return re();
      case 'on-sel': audio.click(); this.sel = +x; return re();
      case 'on-train': { const c = trainHero(+x, y); if (c === false) { audio.deny(); this.ui.toast(OP.heroes[+x] && OP.heroes[+x].stats[y] >= 99 ? 'Навичка на максимумі' : 'Не вистачає монет — грай онлайн-матчі'); } else { audio.buy(); this.popKey = y; this.bump = true; } return ed(); }
      case 'on-scout': {
        const h = scoutHero(+x);
        if (!h) { audio.deny(); this.ui.toast('Скаут коштує ' + SCOUT_PRICE + ' монет'); return; }
        if (h.rar === 'l') audio.horn(); else audio.win();
        this.seenSel = -1; this.bump = true; s.sync(); this.revealHero(h); return;
      }
      case 'on-fe': audio.click(); this.fe = x; return re();
      case 'on-fstyle': audio.click(); this.feStyle = x; this.rollCands(); return this.patchFe();
      case 'on-cands': audio.click(); this.rollCands(); return this.patchFe();
      case 'on-cand': if (this.cands && this.cands[+x]) { this.remember(); this.histT = 0; OP.club.flag = JSON.parse(JSON.stringify(this.cands[+x])); audio.buy(); this.flagDone(); } return;
      case 'on-undo': if (this.hist.length) { OP.club.flag = JSON.parse(this.hist.pop()); this.histT = 0; audio.back(); this.flagDone(); } return;
      case 'on-froll': this.remember(); this.histT = 0; OP.club.flag = rollFlag(this.feStyle, OP.club.flag, x); audio.click(); return this.flagDone();
      case 'on-pat': case 'on-emb': case 'on-plate': case 'on-ov': case 'on-edge': {
        this.remember(); this.histT = 0;
        OP.club.flag[{ 'on-pat': 'pat', 'on-emb': 'em', 'on-plate': 'pl', 'on-ov': 'ov', 'on-edge': 'edge' }[k]] = x; audio.click(); return this.flagDone();
      }
      case 'on-pos': case 'on-rep': this.remember(); this.histT = 0; OP.club.flag[k === 'on-pos' ? 'pos' : 'rep'] = +x; audio.click(); return this.flagDone();
      case 'on-flip': this.remember(); this.histT = 0; OP.club.flag.flip = OP.club.flag.flip ? 0 : 1; audio.click(); return this.flagDone();
      case 'on-swap': { this.remember(); this.histT = 0; const c = OP.club.flag.c, t = c[0]; c[0] = c[1]; c[1] = t; audio.click(); return this.flagDone(); }
      case 'on-slot': audio.click(); this.slot = +x; return this.patchFe();
      case 'on-col': this.remember(); this.histT = 0; this.setColor(x); audio.click(); return this.flagDone();
      case 'on-reset':
        if (el.dataset.arm) { resetOP(); audio.horn(); this.ui.toast('Новий клуб: ' + OP.club.name); this.sel = 1; this.hist = []; this.cands = null; return ed(); }
        el.dataset.arm = 1; el.querySelector('b').textContent = 'ТОЧНО? ГЕРОЇ Й МОНЕТИ ЗНИКНУТЬ'; setTimeout(() => { delete el.dataset.arm; const b = el.querySelector('b'); if (b) b.textContent = 'НОВИЙ ВИПАДКОВИЙ КЛУБ'; }, 3000); return;
      case 'on-create': audio.click(); audio.unlock(); return s.create();
      case 'on-join': { audio.click(); audio.unlock(); const inp = this.ui.el.panel.querySelector('[data-ocode]'); return s.join(inp ? inp.value : this.codeIn); }
      case 'on-cancel': audio.back(); s.leave(); return re();
      case 'on-ready': return s.setReady(!s.ready.me);
      case 'on-copy': this.copy(s.code, 'Код ' + s.code + ' скопійовано'); return;
      case 'on-share': {
        const url = location.origin + location.pathname + '?room=' + s.code;
        if (navigator.share) navigator.share({ title: 'LOKO RUSH — онлайн-матч', text: 'Заходь у мою кімнату: ' + s.code, url }).catch(() => {});
        else this.copy(url, 'Посилання скопійовано');
        return;
      }
      case 'on-rematch':                                             // спершу в лобі, потім «готовий»: якщо суперник уже чекає — матч стартує одразу
        audio.click(); this.tab = 'play'; this.g.sm.go('MENU'); this.ui.openPanel('online');
        if (s.rematch() && s.state !== 'match') this.ui.toast('Чекаємо, поки суперник теж натисне «Реванш»');
        return;
      case 'on-menu': audio.click(); s.toLobby(); this.g.sm.go('MENU'); this.ui.openPanel('online'); this.tab = 'play'; return re();
    }
  }
  copy(text, msg) {
    const ok = () => this.ui.toast(msg);
    try { navigator.clipboard.writeText(text).then(ok, () => this.ui.toast(text)); } catch (_) { this.ui.toast(text); }
  }

  // ------------------------------------------------------------------ результат
  showResult(r) {
    const rew = this.s.finish(r), win = r.outcome === 'win', draw = r.outcome === 'draw';
    const sp = r.spec || {}, flag = (c) => (c && c.crest) || flagSvg((c && c.flag) || OP.club.flag, 'oflag crest');
    const lines = [], chips = [];
    if (rew) {
      const goals = r.me * 15;
      lines.push({ label: win ? 'Перемога' : draw ? 'Нічия' : 'Участь', value: rew.coins - goals, coin: true });
      if (goals) lines.push({ label: 'Голи · ' + r.me + ' × 15', value: goals, coin: true });
      lines.push({ label: 'Рейтинг', text: (rew.dR >= 0 ? '+' : '') + rew.dR, sub: String(OP.rating) });
      lines.push({ label: 'Досвід клубу', text: '+' + rew.xp, sub: 'рів. ' + rew.lvl });
      if (rew.clubUp) chips.push(['gold', I.up, `Клуб досяг ${rew.lvl} рівня: +100 монет`]);
      for (const u of rew.ups.slice(0, 5)) chips.push(['blue', I.up, `${u.name.split(' ')[0]} ${u.lvl} рів.: ${STAT_NAMES[u.key]} +1`]);
    }
    if (r.forfeit) chips.push([r.forfeit === 'opp' ? 'green' : 'red', I.bolt, r.forfeit === 'opp' ? 'Суперник вийшов — технічна перемога' : 'Ти вийшов — технічна поразка']);
    if (r.void) chips.push(['mint', I.bolt, 'Зв’язок обірвався — рейтинг не змінився']);
    const can = this.s.net && this.s.net.open && !r.forfeit;
    this.ui.renderResult({
      outcome: r.void ? 'void' : r.outcome, title: r.void ? 'НЕ ЗАРАХОВАНО' : win ? 'ПЕРЕМОГА!' : draw ? 'НІЧИЯ' : 'ПОРАЗКА', tag: 'Онлайн-матч · рейтинг ' + OP.rating,
      me: { name: sp.home ? sp.home.name : OP.club.name, crest: flag(sp.home) }, opp: { name: sp.club ? sp.club.name : 'СУПЕРНИК', crest: flag(sp.club) },
      score: [r.me, r.opp], scorers: r.scorers, chips, fact: 'Монети онлайн-клубу: ' + fmt(OP.coins),
      head: 'Нагороди клубу', lines, total: rew ? rew.coins : null,
      buttons: [...(can ? [['go', 'on-rematch', 'РЕВАНШ', I.play]] : []), ['alt', 'on-menu', can ? 'В ЛОБІ' : 'ДО ОНЛАЙНУ']],
    });
  }
}
