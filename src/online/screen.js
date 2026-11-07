// Онлайн-хаб: окремий розділ гри на весь екран (меню кар'єри за ним сховане). Свій верх (назад у кар'єру, клуб, монети онлайн-клубу)
// і своя нижня навігація: Матч (режими з modes.js: швидкий пошук, гра з другом за кодом, турніри), Квести (quests.js), Клуб (назва,
// прапор), Герої (схема й прокачка). Тут лише розмітка й кнопки; логіка з'єднання — session.js, пошук — seek.js.
import { audio } from '../core/audio.js';
import { I } from '../ui/icons.js';
import { portrait, mountTurntable } from '../ui/portrait.js';
import { VOX } from '../ui/vox.js';
import { Tactics, formName } from '../ui/tactics.js';
import { STAT_NAMES, STAT_HINT, ROLE_UA, keysFor, ovr, xpNeed, bestLine } from '../state/squad.js';
import { fmt } from '../state/economy.js';
import { OP, saveOP, resetOP, esc, plain, flagSvg, matchClub, kitOf, gkKitOf, teamRating, trainPrice, trainHero, SCOUT_PRICE, clubXpNeed, TRAITS, RARITY, ONLINE_FORMS, setForm, allHeroes, swapAny, moveDeny, sellHero, sellPrice, isKeeper } from './profile.js';
import { FLAG_COLS, FLAG_PATS, FLAG_EMB, FLAG_PLATES, FLAG_OVS, FLAG_EDGES, FLAG_STYLES, flagUri, emblemSvg, rollFlag, normFlag } from './flag.js';
import { Online } from './session.js';
import { cleanCode } from './net.js';
import { tgStartRoom, tgShareRoom, tgShareMessage, inTelegram } from '../core/telegram.js';
import { serverOn, roomShareId } from './server.js';
import { MODES, modeTabs } from './modes.js';
import { syncQuests } from './quests.js';
import { has } from './server.js';
import { Shop, benchCap } from './shop.js';
import * as PR from './profile.js';

const STYLE_UA = { any: 'Усі', classic: 'Класика', herald: 'Геральдика', modern: 'Сучасний', wild: 'Дикий' };
const FE_TABS = { gen: 'Генератор', field: 'Поле', emblem: 'Знак', colors: 'Кольори', extra: 'Оздоба' };
const SLOTS_UA = ['Футболка', 'Шорти', 'Третій', 'Знак', 'Плашка', 'Воротар'];
const EDGE_UA = { none: 'Без рамки', thin: 'Тонка', white: 'Біла', gold: 'Золота', double: 'Подвійна', wide: 'Широка' };
const PLATE_UA = { none: 'Без плашки', disc: 'Коло', shield: 'Щит', dia: 'Ромб', hex: 'Шестикутник', oct: 'Восьмикутник', sq: 'Квадрат', star: 'Зірка' };
const WF_SLICES = matchMedia('(pointer: coarse)').matches ? 9 : 14, WF_PERIOD = 2.6;   // на телефоні менше смужок: кожна це окремий шар
const LINE_UA = { D: 'захист', M: 'півзахист', W: 'фланг', F: 'напад' };

/** Полотно, що майорить: смужки одного SVG хитаються зі зсувом. Фаза від годинника, тож перемальовування панелі не смикає хвилю. */
const waveFlag = (flag, cls = '') => {
  let sl = ''; for (let i = 0; i < WF_SLICES; i++) sl += `<s style="--i:${i}"></s>`;
  return `<div class="wf ${cls}" data-wf style="--n:${WF_SLICES};--fl:${flagUri(flag)};--ph:${(-(performance.now() / 1000) % WF_PERIOD).toFixed(2)}s"><i class="wf-pole"></i><div class="wf-cloth">${sl}</div></div>`;
};
const tile = (label, val, cls = '') => `<div class="on-tile ${cls}"><small>${label}</small><b>${val}</b></div>`;
/** Вкладки хабу: нижня навігація. Режим зі своїм екраном (modes.js, tab) додає ще одну перед «Магазином». «Клуб» — кнопка в шапці поруч із монетами. */
const TABS = [{ id: 'play', name: 'Матч', ic: VOX.match }, { id: 'quests', name: 'Квести', ic: VOX.clipboard }, { id: 'shop', name: 'Магазин', ic: VOX.shop }, { id: 'heroes', name: 'Герої', ic: VOX.team }];
/** Таблиця рейтингу: лише коли сервер гри її веде (features 'top'), бо рейтинг інших клубів знає тільки він. */
const TOP_TAB = { id: 'top', name: 'Рейтинг', ic: VOX.podium };
/** Воксельний предмет кожного квесту (id із quests.js); невідомий квест — м'яч. */
const QUEST_ART = { play2: 'ball', goals3: 'goal', unbeaten: 'shield', win: 'cup', clean: 'glove', back: 'boot', big: 'goal', four: 'goal', comeback: 'score', giant: 'crown', 'w-win8': 'cup', 'w-goals20': 'goal', 'w-play12': 'ball' };
const questArt = (id) => VOX[QUEST_ART[id] || 'ball'];
/** «7 год 12 хв», «2 дн 5 год», «12 хв»: скільки до оновлення квестів. */
const left = (ms) => {
  const m = Math.max(1, Math.ceil(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
  return d ? `${d} дн ${h} год` : h ? `${h} год ${mi} хв` : `${mi} хв`;
};
const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
/** Лава запасних є, коли клуб веде пристрій або сервер уміє лаву ('shop'); старий сервер без неї — лише основа. */
const benchOn = () => !has('club') || has('shop');
/** Кнопка з підтвердженням: перший дотик просить ще один, за 3 с повертається. true — це був другий дотик. */
function armed(el, ask) {
  if (el.dataset.arm) { delete el.dataset.arm; return true; }
  const b = el.querySelector('b'), was = b ? b.textContent : '';
  el.dataset.arm = 1; if (b) b.textContent = ask;
  setTimeout(() => { if (!el.dataset.arm) return; delete el.dataset.arm; if (b) b.textContent = was; }, 3000);
  return false;
}

export class OnlineScreen {
  constructor(ui, game) {
    this.ui = ui; this.g = game; this.tab = 'play'; this.codeIn = '';
    this.fe = 'gen'; this.feStyle = 'any'; this.slot = 0; this.cands = null; this.hist = []; this.histT = 0;
    this.popKey = null; this.bump = false; this.rdy = { me: false, opp: false };
    const sig = () => { const k = kitOf(OP.club); return k.main + k.second + OP.club.gk; };
    this.tac = new Tactics({
      forms: ONLINE_FORMS, deny: 'Воротар завжди в рамці', denyFor: (a, b) => moveDeny(OP, a, b) || null,
      // склад і лава одним списком (0–10 основа, далі запас): воротар міняється лише на воротаря з лави
      list: () => (benchOn() ? allHeroes() : OP.heroes), form: () => OP.club.form, setForm, swap: swapAny, canSwap: (i) => i !== 0 || (benchOn() && OP.bench.some(isKeeper)), ovr,
      col: (e) => (RARITY[e.rar] || RARITY.c).col, portrait: (e) => portrait(game.renderer, this.look(e), 'on-' + e.id + e.num + sig()),
      view: (e) => ({ look: this.look(e), key: 'on-' + e.id + e.num + sig() }), role: (e) => ROLE_UA[e.role] || e.role, detail: (e, i) => this.heroDetail(e, i),
      defaultSel: () => 1, render: () => ui.renderPanel(), changed: () => this.s.sync(), toast: (t) => ui.toast(t), host: () => ui.el.panel,
    });
    // екранна клавіатура закриває низ екрана: поле вводу піднімаємо, а Enter у назві й місті її ховає
    ui.root.addEventListener('focusin', (e) => { if (e.target.matches('.on-name, .on-city, .on-code-in')) setTimeout(() => e.target.scrollIntoView({ block: 'center' }), 350); });
    ui.root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-oname], [data-ocity]')) e.target.blur(); });
    ui.root.addEventListener('change', (e) => { if (e.target.matches('[data-ocol]')) this.patchFe(); });   // свій колір: панель перемальовуємо лише після вибору, інакше палітра закриється
    this.s = new Online(game, ui); this.s.onOpp = () => this.patchOpp();
    this.s.screen = this;
    this.shop = new Shop(this);                               // магазин: вагони, ринок, лава й відкриття (shop.js)
    this.s.onFound = () => { this.tab = 'play'; this.tac.swapFrom = null; };   // суперник знайшовся, поки гравець був у «Клубі» чи «Героях»: одразу в лобі
    // пінг у лобі, годинник пошуку й час до нових квестів оновлюються самі (без перемальовування панелі — щоб не збивати натискання)
    setInterval(() => {
      if (ui.panel !== 'online') return;
      const P = ui.el.panel, n = this.s.net, ping = P.querySelector('.on-ping'), sk = P.querySelector('[data-seekt]');
      if (ping && n && n.rtt) ping.textContent = 'пінг ' + Math.round(n.rtt) + ' мс';
      if (sk) sk.textContent = clock(Date.now() - this.s.seekAt);
      this.shop.tick();
      const ql = P.querySelectorAll('[data-qleft]');
      if (ql.length) {
        const L = this.s.cloud.view().left;
        if (L.day < 1500) { setTimeout(() => this.s.cloud.rollover(), 1600); return; }   // північ за Києвом: новий набір
        ql.forEach((el) => { el.textContent = left(L[el.dataset.qleft]); });
      }
    }, 1000);
    // запрошення за посиланням ?room=КОД: відкриваємо вкладку й одразу заходимо в кімнату
    const m = /[?&]room=([A-Za-z0-9]{5})/.exec(location.search), tgRoom = tgStartRoom();
    this.invite = m ? cleanCode(m[1]) : tgRoom ? cleanCode(tgRoom) : null;
  }
  /** Перший показ меню: якщо гра відкрита за посиланням-запрошенням, одразу в кімнату (заставки тоді пропускає UI.skipToRoom). Код лишається в полі «Гра з другом» для повторної спроби. */
  onMenu() {
    if (!this.invite) return;
    const code = this.invite; this.invite = null;
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (_) { /* ignore */ }
    this.ui.openPanel('online'); this.tab = 'play'; this.codeIn = code; this.s.join(code, true);
  }

  /** Ключ вкладки для панелі: зміна стану кімнати теж «нова сторінка» (вхідні анімації, прокрутка з нуля). */
  subKey() { return this.tab === 'play' ? 'play:' + this.playState() : this.tab; }
  playState() {
    const s = this.s;
    if (s.state === 'seeking') return 'seeking';
    return !s.net ? (s.state === 'creating' || s.state === 'joining' ? s.state : 'idle') : s.state === 'result' ? 'lobby' : s.state;
  }
  tabs() { const m = modeTabs(), top = has('top') ? [TOP_TAB] : []; return [TABS[0], TABS[1], ...m, ...top, TABS[2], TABS[3]]; }
  /** Хаб щойно відкрито: сервер гри підтягує клуб, квести й таблицю (якщо їх уміє); без сервера нічого не міняється. */
  onOpen() {
    const on = this.g.startStage(matchClub(OP.club));                  // свій стадіон у тлі; рівень 0 — суцільне тло
    const sh = this.ui.el.panel.querySelector('.hub'); if (sh) sh.classList.toggle('staged', on);
    this.s.cloud.open().catch(() => {});
  }

  /** Крок «назад» усередині хабу (Esc, кнопка Telegram): інша вкладка → «Матч», пошук → скасувати. false — хаб закривається. */
  back() {
    if (this.tab !== 'play') { audio.back(); this.tab = 'play'; this.tac.swapFrom = null; this.ui.renderPanel(); return true; }
    if (this.s.state === 'seeking') { audio.back(); this.s.leave(); this.ui.renderPanel(); return true; }
    return false;
  }

  html() {
    const banked = this.s.cloud.questsOn() ? [] : syncQuests();    // новий день: незабрані нагороди минулого зараховуються самі (із сервером — він)
    if (banked.length) { const sum = banked.reduce((a, q) => a + q.c, 0); setTimeout(() => this.ui.toast('Незабрані квести зараховано: +' + fmt(sum) + ' монет'), 300); }
    const T = this.tabs(); if (this.tab !== 'club' && !T.some((x) => x.id === this.tab)) this.tab = 'play';
    const t = this.tab, c = OP.club, k = kitOf(c), ready = this.s.cloud.ready(), mt = T.find((x) => x.id === t);
    const body = t === 'club' ? this.clubHtml() : t === 'heroes' ? this.heroesHtml() : t === 'quests' ? this.questsHtml() : t === 'top' ? this.topHtml() : t === 'shop' ? this.shopHtml() : mt && mt.html ? mt.html(this) : this.playHtml();
    const bump = this.bump; this.bump = false;
    const fx = this.navAt !== t; this.navAt = t;                     // вкладку щойно відкрито: її предмет у навігації раз оживає (fx)
    const nav = T.map((x) => `<button class="hub-nb ${t === x.id ? (fx ? 'on fx' : 'on') : ''}" data-act="on-tab:${x.id}" ${t === x.id ? 'aria-current="page"' : ''}><span class="hub-ic">${x.ic}</span><b>${x.name}</b>${x.id === 'quests' && ready ? `<u class="hub-dot">${ready}</u>` : ''}</button>`).join('');
    const seek = this.s.state === 'seeking' && t !== 'play' ? `<button class="hub-seek" data-act="on-tab:play"><span class="on-radar"><i></i><i></i><u></u></span><b>Пошук</b></button>` : '';
    const staged = !!(this.g.splash && this.g.splash.hub), need = clubXpNeed(OP.lvl);
    return `<div class="sheet wide on-sheet hub ${staged ? 'staged' : ''}" style="--ka:${k.main};--kb:${k.second}"><i class="hub-scrim" aria-hidden="true"></i>
      <header class="on-h hub-h">
        <button class="hub-back" data-act="close-panel" aria-label="Назад у кар’єру">${I.back}<b>Кар’єра</b></button>
        <div class="on-h-fl" data-hflag>${flagSvg(c.flag)}</div>
        <div class="on-h-t"><h2 data-hname>${esc(c.name)}</h2><span class="hub-lvl"><em>рів. ${OP.lvl}</em><i class="hub-xp" title="${OP.xp} / ${need}"><u style="width:${Math.min(100, (OP.xp / need) * 100)}%"></u></i><small>рейтинг ${OP.rating}</small></span></div>
        ${seek}<button class="hub-clubb ${t === 'club' ? 'on' : ''}" data-act="on-tab:club" ${t === 'club' ? 'aria-current="page"' : ''}><span class="hub-ic">${I.pennant}</span><b>Клуб</b></button><span class="on-purse ${bump ? 'bump' : ''}"><b>${fmt(OP.coins)}</b>${I.coin}</span><button class="on-purse iron ${bump ? 'bump' : ''}" data-act="on-iron" aria-label="Iron Dollar: магазин"><b>${fmt(OP.iron | 0)}</b>${I.iron}</button>
      </header>
      <div class="sheet-b on-b">${body}</div>
      <nav class="hub-nav" aria-label="Розділи онлайну">${nav}</nav></div>`;
  }

  // ------------------------------------------------------------------ квести
  questCard(q, i) {
    const pct = Math.round((q.p / q.n) * 100);
    const dol = q.d ? `<b>+${q.d}</b>${I.iron}` : '';                    // тижневий квест дає ще й Iron Dollar
    const end = q.got ? `<span class="hub-qok">${I.check}<b>Забрано</b></span>`
      : q.done ? `<button class="btn go hub-claim" data-act="on-claim:${q.kind}:${q.i}"><b>ЗАБРАТИ +${q.c}</b>${I.coin}${dol}</button>`
        : `<span class="hub-qr"><b>+${q.c}</b>${I.coin}${dol}</span>`;
    return `<div class="hub-qc on-a ${q.done ? 'done' : ''} ${q.got ? 'got' : ''}" style="--d:${i}"><span class="hub-qa">${questArt(q.id)}</span><div class="hub-qt"><b>${esc(q.t)}</b><small>${q.p} / ${q.n}</small></div><i class="on-bar"><u style="width:${pct}%"></u></i>${end}</div>`;
  }
  questsHtml() {
    const Q = this.s.cloud.view(), L = Q.left;
    return `<div class="hub-q">
      <section class="hub-qs"><header><b>Квести дня</b><small>нові через <span data-qleft="day">${left(L.day)}</span></small></header>${Q.day.map((q, i) => this.questCard(q, i)).join('')}</section>
      <section class="hub-qs week"><header><b>Квест тижня</b><small>новий через <span data-qleft="week">${left(L.week)}</span></small></header>${Q.week.map((q, i) => this.questCard(q, i + 3)).join('')}
        <p class="fine">Рахуються онлайн-матчі, дограні до фінального свистка: технічна перемога чи поразка й обірваний матч ні. Квести однакові для всіх і оновлюються опівночі за Києвом, тижневий у понеділок. Виконане й не забране до оновлення зараховується саме.</p></section></div>`;
  }
  /** Таблиця рейтингу від сервера гри. Дані чужі: рядки лише через esc, прапор через normFlag у flagSvg. */
  topHtml() {
    const T = this.s.cloud.top;
    if (!T) return `<div class="on-play"><section class="on-card on-busy on-a"><div class="on-wheel">${emblemSvg('wheel')}</div><b>Завантажуємо таблицю<span class="on-dots"><u></u><u></u><u></u></span></b></section></div>`;
    const n = (v) => (Number.isFinite(+v) ? Math.round(+v) : 0), me = T.me || {};
    // нагорода тижня за місце (IRON_TOP у profile.js, нараховує сервер щопонеділка): біля кожного місця й своє зараз
    const prize = (p) => (typeof PR.ironForPlace === 'function' && p > 0 ? PR.ironForPlace(p) : 0);
    const rows = T.list.slice(0, 50).map((e, i) => { const p = n(e.place) || i + 1, z = prize(p); return `<li class="${n(e.place) === n(me.place) ? 'me' : ''}"><b>${p}</b><span class="hub-tf">${flagSvg(normFlag(e.flag))}</span><span class="hub-tn">${esc(plain(e.name || ''))}</span><small>рів. ${n(e.lvl)} · ${n(e.w)}-${n(e.d)}-${n(e.l)}</small><em>${n(e.rating)}</em>${z ? `<i class="hub-tz">+${z}${I.iron}</i>` : '<i class="hub-tz"></i>'}</li>`; }).join('');
    const tiers = Array.isArray(PR.IRON_TOP) ? PR.IRON_TOP : [];
    let from = 1; const tl = tiers.map((r) => { const t = `${from === r.to ? r.to : from + '–' + r.to}: ${r.n}`; from = r.to + 1; return t; }).join(' · ');
    const mine = prize(n(me.place));
    const week = tl ? `<p class="hub-tw">Нагорода тижня в Iron Dollar (щопонеділка): ${tl}.${me.place ? (mine ? ` Твоє місце зараз дає <b>+${mine}</b>${I.iron}` : ' Твоє місце поки без нагороди') : ''}</p>` : '';
    return `<div class="hub-top on-a"><header><span class="hub-top-a">${VOX.podium}</span><b>Рейтинг клубів</b>${me.place ? `<small>твоє місце <span>${n(me.place)}</span> · ${n(me.rating)}</small>` : ''}</header>${week}<ol>${rows}</ol></div>`;
  }

  // ------------------------------------------------------------------ клуб
  /** Картка клубу: прапор на сцені, назва, цифри. Спільна для гри, кімнати й лобі. */
  clubCard(p, o = {}) {
    const c = p.club;
    return `<div class="on-stage ${o.opp ? 'opp' : ''}">${waveFlag(c.flag, o.opp ? 'mirror' : '')}${o.stamp || ''}</div>
      <div class="on-cc-n"><b>${esc(c.name)}</b><em>${esc(c.city || '')}${c.form ? ' · ' + formName(c.form) : ''}</em></div>
      ${this.clubTiles(p, o.vs)}`;
  }
  clubTiles(p, x) {
    const rating = p.rating, power = teamRating(p.heroes), lvl = p.lvl, cmp = (a, b) => (x ? (a > b ? 'up' : a < b ? 'down' : '') : '');
    return `<div class="on-tiles">${tile('Рейтинг', rating, cmp(rating, x && x.rating))}${tile('Сила', power, cmp(power, x && teamRating(x.heroes)))}${tile('Рівень', lvl, cmp(lvl, x && x.lvl))}</div>`;
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
        <input class="on-name" data-oname enterkeyhint="done" maxlength="14" value="${esc(c.name)}" aria-label="Назва клубу"/>
        <input class="on-city" data-ocity enterkeyhint="done" maxlength="18" value="${esc(c.city)}" aria-label="Місто"/>
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
    clearTimeout(this.kitT);                                         // рендер форми відкладаємо: кнопка має реагувати миттєво, а серія кліків малює лише останній колір
    this.kitT = setTimeout(() => {
      const ks = this.ui.el.panel.querySelector('[data-kits]'), k = kitOf(OP.club), sig = k.main + k.second + OP.club.gk;   // картинку міняємо лише з новими кольорами, інакше вона блимає
      if (ks && ks.dataset.sig !== sig) { ks.dataset.sig = sig; ks.innerHTML = this.kitsHtml(); }
    }, 180);
  }
  /** Прапор змінився кнопкою: зберегти, показати, сказати супернику (із затримкою, щоб серія кліків не засипала канал). */
  flagDone(pop = true) {
    saveOP(); this.patchFlag(pop); this.patchFe(); this.syncSoon(); this.restage();
  }
  syncSoon() { clearTimeout(this.syncT); this.syncT = setTimeout(() => this.s.sync(), 250); }

  // ------------------------------------------------------------------ герої
  look(e) { const gk = e.line === 'G'; return { kit: gk ? gkKitOf(OP.club) : kitOf(OP.club), num: e.num, skin: e.skin, hair: e.hair, hairCol: e.hairCol, beard: e.beard || 0, gk, scale: 0.9 }; }
  afterRender() { if (this.tab === 'heroes') this.tac.afterRender(); else if (this.tab === 'shop') this.shop.afterRender(); else { this.mountStar(); this.featInit(); } }
  /** Кнопка з підтвердженням (для shop.js). */
  armed(el, ask) { return armed(el, ask); }
  heroDetail(e, sel) {
    const pop = this.popKey; this.popKey = null;
    const o = ovr(e), R = RARITY[e.rar] || RARITY.c, T = TRAITS[e.trait], need = xpNeed(e.lvl), B = e.line === 'G' ? null : bestLine(e);
    const tiles = keysFor(e.line).map((k) => {
      const v = e.stats[k], c = trainPrice(v), can = OP.coins >= c && v < 99, tr = T && T.stat === k;
      return `<div class="st ${tr ? 'tr' : ''} ${pop === k ? 'pop' : ''}"><div class="st-t"><span>${STAT_NAMES[k]}${tr ? ' ★' : ''}</span><b>${v}</b></div><i><u style="width:${v}%"></u></i><button class="btn buy ${can ? 'can' : ''}" data-act="on-train:${sel}:${k}" ${v >= 99 ? 'disabled' : ''}><b>+1 · ${fmt(c)}</b>${I.coin}</button><small>${STAT_HINT[k]}</small>${pop === k ? '<u class="on-plus">+1</u>' : ''}</div>`;
    }).join('');
    const onB = sel >= 11, full = OP.bench.length >= benchCap();
    const fit = !onB && B && B.ovr - o >= 2 ? `<p class="on-fit">Не на своїй лінії: у ${LINE_UA[B.line]}і рейтинг був би ${B.ovr}</p>` : '';
    // лава: продаж (з підтвердженням) і підказка, як випустити в основу; основа: скаут шукає новачка на цю позицію
    const act = onB
      ? `<p class="on-fit">На лаві: у матчі не грає й досвіду не отримує. В основу — «Поміняти місцями» й торкнись гравця на полі.</p><button class="btn alt on-scout" data-act="on-sell:${sel - 11}"><b>ПРОДАТИ · ${fmt(sellPrice(e))}</b>${I.coin}</button>`
      : benchOn()
        ? `<button class="btn alt on-scout ${OP.coins >= SCOUT_PRICE && !full ? '' : 'dim'}" data-act="on-scout:${sel}"><b>${full ? 'ЛАВА ПОВНА: ПРОДАЙ КОГОСЬ' : 'СКАУТ: НОВАЧОК НА ЦЮ ПОЗИЦІЮ · ' + SCOUT_PRICE}</b>${full ? '' : I.coin}</button>`
        : `<button class="btn alt on-scout ${OP.coins >= SCOUT_PRICE ? '' : 'dim'}" data-act="on-scout:${sel}"><b>СКАУТ: ІНШИЙ ГЕРОЙ · ${SCOUT_PRICE}</b>${I.coin}</button>`;
    return `<div class="on-hd"><div class="on-hd-t"><button class="on-card-b" data-act="sh-card:${sel}" style="--rc:${R.col}"><b>Картка</b></button><p><span class="on-rar">${R.name}</span> №${e.num} · ${ROLE_UA[e.role] || e.role}${onB ? ' · запас' : ''} · рейтинг <b>${o}</b></p>${T ? `<p class="on-trait">★ ${T.name}: ${T.tip}</p>` : ''}${fit}
      <i class="on-bar"><u style="width:${Math.min(100, (e.xp / need) * 100)}%"></u></i><small>Рівень ${e.lvl} · досвід ${e.xp}/${need} · матчів ${e.apps} · голів ${e.goals}</small>
      ${act}${this.shop.traitBtn(sel)}</div></div><div class="st-grid">${tiles}</div>`;
  }
  heroesHtml() { return this.tac.html(); }

  /** Продати героя з лави j (на сервері — сервер, без нього — пристрій). after — що зробити після успіху. */
  sellAt(j, after) {
    const s = this.s, e = OP.bench[j]; if (!e) return;
    const done = (gain) => { audio.coin(3); audio.buy(); this.bump = true; this.tac.sel = null; this.ui.toast(`${e.name} продано: +${fmt(gain)} монет`); if (after) after(); s.sync(true); this.ui.renderPanel(); };
    if (has('club')) {
      if (!has('shop') || this.selling) return;
      this.selling = true;
      s.cloud.sell(j).then((r) => {
        this.selling = false;
        if (r && !r.error) return done(r.gain);
        audio.deny(); this.ui.toast(r === null ? 'Сервер гри недоступний, спробуй ще раз' : 'Сервер не прийняв продаж'); this.ui.renderPanel();
      });
      return;
    }
    const r = sellHero(j); if (!r.error) done(r.gain);
  }

  // ------------------------------------------------------------------ головна хабу
  /** Зірка клубу: найсильніший польовий герой (як на формі в «Клубі»). */
  star() { const H = OP.heroes; return H.reduce((b, e) => (e.line !== 'G' && ovr(e) > ovr(b) ? e : b), H[1]); }
  /** Зірка на весь зріст ліворуч: живий 3D (mountTurntable у afterRender), стоїть обличчям; пальцем можна покрутити. Табличка веде до героїв. */
  starHtml() {
    const e = this.star(), R = RARITY[e.rar] || RARITY.c;
    return `<div class="hub-star" style="--rc:${R.col}"><i class="hub-star-sh"></i><canvas data-star></canvas>
      <button class="hub-star-tag on-a" style="--d:2" data-act="on-tab:heroes"><i>${ovr(e)}</i><b>${esc(e.name.split(' ').slice(-1)[0])}</b><small>${ROLE_UA[e.role] || e.role}</small></button></div>`;
  }
  mountStar() {
    const ph = this.ui.el.panel.querySelector('canvas[data-star]'); if (!ph) return;
    const e = this.star(), k = kitOf(OP.club), key = 'on-' + e.id + e.num + k.main + k.second + OP.club.gk;
    mountTurntable(ph, this.look(e), key, () => portrait(this.g.renderer, this.look(e), key), { fixed: true, rest: 0.32 });
  }
  /** Сторінка каруселі режимів: режим із MODES, чинний або чесно неактивний (без вигаданих даних). */
  slideHtml(m) {
    if (!m.on()) return `<div class="hub-sl off" aria-disabled="true"><b class="hub-sl-t">${esc(m.title)}</b><p>${m.why}</p><span class="hub-sl-lock">${I.lock}<b>Ще немає</b></span><span class="hub-sl-art off">${VOX.cupOff}</span></div>`;
    if (m.id === 'quick') {
      const sub = has('queue') ? 'Сервер підбере суперника з близьким рейтингом' : 'Суперник — той, хто зараз теж шукає гру';
      return `<button class="hub-sl quick" data-act="${m.act}"><b class="hub-sl-t">Швидкий матч</b><p>${sub}</p><span class="hub-sl-go"><i>${I.play}</i><b>Шукати</b></span><span class="hub-sl-art">${VOX.match}</span></button>`;
    }
    return `<button class="hub-sl" data-act="${m.act}"><b class="hub-sl-t">${esc(m.title)}</b><p>${m.sub || ''}</p><span class="hub-sl-go"><i>${I.play}</i><b>Грати</b></span></button>`;
  }
  /**
   * Вкладка «Матч» без кімнати: головний екран, як у футбольних іграх. Ліворуч зірка клубу, праворуч сітка:
   * карусель режимів (гортає лише гравець: головна кнопка не має зникати сама), клуб полем його кольору, гра з другом, квести дня.
   */
  homeHtml(err) {
    const Q = this.s.cloud.view(), ready = this.s.cloud.ready(), c = OP.club, k = kitOf(c);
    const slides = MODES.filter((m) => m.id !== 'friend').map((m) => this.slideHtml(m));
    const dots = slides.length > 1 ? `<nav class="hub-dots">${slides.map((_, i) => `<button data-act="on-feat:${i}" data-fdot aria-label="Сторінка ${i + 1}"></button>`).join('')}</nav>` : '';
    const done = Q.day.filter((q) => q.done).length;
    const rows = Q.day.map((q) => `<li class="${q.done ? 'done' : ''}"><span>${esc(q.t)}</span><b>${q.got ? '✓' : q.p + '/' + q.n}</b><i><u style="width:${Math.round((q.p / q.n) * 100)}%"></u></i></li>`).join('');
    return `<div class="hub-home">${this.starHtml()}
      <div class="hub-grid">
        <section class="hub-feat on-a" style="--d:1"><div class="hub-feat-s" data-feat>${slides.join('')}</div>${dots}</section>
        <button class="hub-tile club on-a" style="--d:2;--f:${k.main};--fi:${k.numInk}" data-act="on-tab:club"><span class="hub-tile-fl">${waveFlag(c.flag)}</span>
          <b class="hub-tile-h">${esc(c.name)}</b><span class="hub-tile-p">${formName(c.form)} · сила ${teamRating()}<br>${OP.rec.w} В · ${OP.rec.d} Н · ${OP.rec.l} П</span></button>
        <section class="hub-tile friend on-a" style="--d:3"><span class="hub-tile-art">${VOX.online}</span><b class="hub-tile-h">Гра з другом</b><span class="hub-tile-p">Створи кімнату й надішли другові код або посилання. Є код — введи його.</span>
          <div class="hub-friend-r"><button class="btn go" data-act="on-create"><b>Створити кімнату</b></button>
          <div class="on-join"><input class="on-code-in" data-ocode enterkeyhint="go" maxlength="5" placeholder="КОД" value="${esc(this.codeIn)}" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Код кімнати"/><button class="btn alt" data-act="on-join"><b>Увійти</b></button></div></div>${err ? '<div class="hub-err">' + err + '</div>' : ''}</section>
        <button class="hub-tile quests on-a ${ready ? 'ready' : ''}" style="--d:4" data-act="on-tab:quests"><b class="hub-tile-h">Квести дня<em>${ready ? 'забрати ' + ready : done + ' з ' + Q.day.length}</em></b><ul>${rows}</ul></button>
      </div></div>`;
  }
  /** Карусель режимів: крапки за прокруткою, миша тягне як палець, колесо гортає сторінки, перемальовування не скидає сторінку. */
  featInit() {
    const P = this.ui.el.panel, box = P.querySelector('[data-feat]'); if (!box) return;
    const dots = [...P.querySelectorAll('[data-fdot]')], n = dots.length, w = () => Math.max(1, box.clientWidth);
    const cur = () => Math.max(0, Math.min(n - 1, Math.round(box.scrollLeft / w())));
    const mark = () => { const i = cur(); this.featI = i; dots.forEach((d, j) => d.classList.toggle('on', j === i)); };
    if (this.featI) box.scrollLeft = this.featI * w();
    mark();
    box.addEventListener('scroll', mark, { passive: true });
    let drag = null, wheelT = 0;
    box.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') { drag = { x: e.clientX, l: box.scrollLeft, moved: false }; box.style.scrollSnapType = 'none'; }
    });
    box.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 6) drag.moved = true; box.scrollLeft = drag.l - dx; });
    const end = () => {
      if (!drag) return;
      const d = drag; drag = null; box.style.scrollSnapType = '';
      if (d.moved) { this.featNo = performance.now() + 250; this.featGo(Math.round(box.scrollLeft / w())); }
    };
    box.addEventListener('pointerup', end); box.addEventListener('pointerleave', end);
    box.addEventListener('click', (e) => { if (performance.now() < (this.featNo || 0)) { e.stopPropagation(); e.preventDefault(); } }, true);   // кінець перетягування — не натискання плитки
    box.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault(); const now = performance.now(); if (now < wheelT) return; wheelT = now + 450;
      this.featGo(cur() + Math.sign(e.deltaY));
    }, { passive: false });
  }
  featGo(i) {
    const box = this.ui.el.panel.querySelector('[data-feat]'); if (!box) return;
    const n = box.children.length; i = ((i % n) + n) % n; this.featI = i;
    box.scrollTo({ left: i * box.clientWidth, behavior: 'smooth' });
  }
  // ------------------------------------------------------------------ магазин (shop.js)
  shopHtml() { return this.shop.html(); }

  /** Трибуни хабу в кольорах клубу: після правки прапора чи нового клубу (із затримкою, бо банери перемальовуються). */
  restage() { clearTimeout(this.stageT); this.stageT = setTimeout(() => { if (this.g.splash && this.g.splash.hub) this.g.startStage(matchClub(OP.club)); }, 700); }

  // ------------------------------------------------------------------ гра
  playHtml() {
    const s = this.s, st = this.playState(), err = s.err ? `<p class="on-err">${esc(s.err)}</p>${s.errReload ? '<button class="btn alt" data-act="on-reload"><b>ОНОВИТИ СТОРІНКУ</b></button>' : ''}` : '';
    if (st === 'idle' || st === 'hosting') this.rdy = { me: false, opp: false };
    if (st === 'idle') return this.homeHtml(err);
    if (st === 'seeking') {
      const found = !!s.net && s.role === 'guest';
      return `<div class="hub-home">${this.starHtml()}
        <section class="on-card hub-seeking hub-glass on-a" style="--d:1">
          <div class="hub-radar" aria-hidden="true"><i></i><i></i><i></i><u></u></div>
          <b>${found ? 'Суперник є, заходимо в кімнату' : 'Шукаємо суперника'}<span class="on-dots"><u></u><u></u><u></u></span></b>
          <small class="hub-clock" data-seekt>${clock(Date.now() - s.seekAt)}</small><small class="hub-seekn" data-seekn>${Number.isFinite(s.searching) && s.queued ? 'зараз шукають: ' + s.searching : ''}</small>
          <p class="fine">${has('queue') ? 'Сервер підбирає суперника з близьким рейтингом; що довше пошук, то ширше коло.' : 'Суперником стане той, хто зараз теж шукає швидкий матч, без підбору за рейтингом.'} Довго нікого — поклич друга кодом кімнати.</p>${err}
          <div class="on-row"><button class="btn alt" data-act="on-cancel"><b>СКАСУВАТИ</b></button><button class="btn alt" data-act="on-create"><b>КІМНАТА ДЛЯ ДРУГА</b></button></div>
        </section></div>`;
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
    const myStamp = this.stampOf('me', s.ready.me);
    this.oppKey = null;
    const bars = rtt ? (rtt < 60 ? 4 : rtt < 120 ? 3 : rtt < 220 ? 2 : 1) : 0, sig = [1, 2, 3, 4].map((i) => `<u class="${i <= bars ? 'on' : ''}"></u>`).join('');
    const oc = this.oppCard();
    return `<div class="on-play on-lobby">
      <section class="on-card on-cc on-fromL">${this.clubCard(OP, { vs: o, stamp: myStamp })}<button class="btn ${s.ready.me ? 'on' : 'go'} on-rdy" data-act="on-ready" ${o ? '' : 'disabled'}><b>${s.ready.me ? 'ГОТОВИЙ ✓' : 'Я ГОТОВИЙ'}</b></button></section>
      <div class="on-vs on-a" style="--d:3"><i class="on-vs-l"></i><b>ПРОТИ</b><i class="on-vs-l"></i><div class="on-sig" aria-hidden="true">${sig}</div><small class="on-ping">${rtt ? 'пінг ' + rtt + ' мс' : 'пінг —'}</small><small>${s.role === 'host' ? 'ти господар' : 'ти в гостях'}</small><small>${s.mode === 'quick' ? 'швидкий матч' : 'код ' + esc(s.code)}</small></div>
      <section class="on-card on-cc on-fromR">${oc}</section>
      <div class="on-foot">${err}${s.mode === 'quick' && s.state !== 'result' ? '<button class="btn alt" data-act="on-next"><b>ІНШИЙ СУПЕРНИК</b></button>' : ''}<button class="btn alt" data-act="on-cancel"><b>ВИЙТИ З КІМНАТИ</b></button></div></div>`;
  }

  stampOf(key, on) { const nw = on && !this.rdy[key]; this.rdy[key] = on; return on ? `<div class="on-stamp ${nw ? 'new' : ''}">ГОТОВИЙ</div>` : ''; }
  /** Картка суперника в лобі. */
  oppCard() {
    const s = this.s, o = s.opp;
    return o ? `${this.clubCard(o, { opp: true, vs: OP, stamp: this.stampOf('opp', s.ready.opp) })}<div class="on-ready ${s.ready.opp ? 'yes' : ''}">${s.ready.opp ? 'ГОТОВИЙ ДО МАТЧУ' : `чекаємо<span class="on-dots"><u></u><u></u><u></u></span>`}</div>` : `<div class="on-busy mini"><div class="on-wheel">${emblemSvg('wheel')}</div><b>Отримуємо дані суперника</b></div>`;
  }
  /** Суперник змінив клуб чи готовність: оновлюємо лише його картку й порівняння зі своїм клубом. Панель не перемальовуємо: зберігаються ввід, повзунок і натискання «Я ГОТОВИЙ». */
  patchOpp() {
    const s = this.s, o = s.opp, P = this.ui.el.panel;
    if (this.ui.panel !== 'online' || this.tab !== 'play' || this.playState() !== 'lobby' || !o) return;
    const key = JSON.stringify([o.club, o.rating, o.lvl, teamRating(o.heroes), s.ready.opp]);
    if (key === this.oppKey) return;
    const box = P.querySelector('.on-fromR'), mine = P.querySelector('.on-fromL .on-tiles');
    if (!box) return;
    this.oppKey = key; box.innerHTML = this.oppCard();
    if (mine) mine.outerHTML = this.clubTiles(OP, o);
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
    if (k.startsWith('sh-')) return this.shop.act(k, x, y, el);
    switch (k) {
      case 'on-iron': audio.click(); this.tab = 'shop'; this.shop.sub = 'iron'; this.tac.swapFrom = null; return re();   // гаманець доларів веде в їхній розділ магазину
      case 'on-tab': audio.click(); this.tab = x; this.tac.swapFrom = null; if (x === 'top') this.s.cloud.loadTop().then(() => this.s.cloud.refresh()); return re();
      case 'on-train': { const c = trainHero(+x, y); if (c === false) { audio.deny(); this.ui.toast(allHeroes()[+x] && allHeroes()[+x].stats[y] >= 99 ? 'Навичка на максимумі' : 'Бракує монет — грай онлайн-матчі'); } else { audio.buy(); this.popKey = y; this.bump = true; s.cloud.train(+x, y); } return ed(); }   // сервер гри підтверджує тренування й поправляє монети
      case 'on-scout': return this.shop.open('scout', +x);
      case 'on-sell': { const e = OP.bench[+x]; if (!e || !armed(el, 'ТОЧНО? +' + fmt(sellPrice(e)))) return; return this.sellAt(+x); }
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
        if (el.dataset.arm) {
          const done = () => { audio.horn(); this.ui.toast('Новий клуб: ' + OP.club.name); this.tac.sel = 1; this.hist = []; this.cands = null; s.sync(true); this.restage(); return re(); };
          delete el.dataset.arm;
          if (!has('club')) { resetOP(); return done(); }
          s.cloud.reset().then((ok) => { if (ok) return done(); if (ok === null) { resetOP(); return done(); } audio.deny(); this.ui.toast('Сервер не створив новий клуб'); });   // null — сервер недоступний
          return;
        }
        el.dataset.arm = 1; el.querySelector('b').textContent = 'СПРАВДІ? ГЕРОЇ Й МОНЕТИ ЗНИКНУТЬ'; setTimeout(() => { delete el.dataset.arm; const b = el.querySelector('b'); if (b) b.textContent = 'НОВИЙ ВИПАДКОВИЙ КЛУБ'; }, 3000); return;
      case 'on-reload': location.reload(); return;
      case 'on-create': audio.click(); audio.unlock(); return s.create();
      case 'on-join': { audio.click(); audio.unlock(); const inp = this.ui.el.panel.querySelector('[data-ocode]'); return s.join(inp ? inp.value : this.codeIn); }
      case 'on-cancel': audio.back(); s.leave(); return re();
      case 'on-seek': audio.click(); audio.unlock(); return s.seek();
      case 'on-feat': audio.click(); return this.featGo(+x);
      case 'on-next': audio.click(); s.leave(); return s.seek();     // суперник у лобі не тисне «готовий»: попрощатися й шукати іншого
      case 'on-claim': {
        if (this.claiming) return;
        this.claiming = true;
        const q0 = s.cloud.view()[x === 'week' ? 'week' : 'day'][+y], d = q0 && q0.d ? q0.d : 0;
        Promise.resolve(s.cloud.claim(x, +y)).then((c) => {
          this.claiming = false;
          if (!c) { audio.deny(); return re(); }
          audio.coin(3); audio.buy(); this.bump = true; this.ui.toast('Квест: +' + fmt(c) + ' монет' + (d ? ' і +' + d + ' Iron Dollar' : '') + ' онлайн-клубу'); return re();
        });
        return;
      }
      case 'on-ready': return s.setReady(!s.ready.me);
      case 'on-copy': this.copy(s.code, 'Код ' + s.code + ' скопійовано'); return;
      case 'on-share': {
        const url = location.origin + location.pathname + '?room=' + s.code, code = s.code;
        // у Telegram із сервером гри: бот готує картку виклику, і вона йде в чат через рідне вікно «Поділитися»
        if (inTelegram() && serverOn()) {
          roomShareId(code).then((id) => { if (!tgShareMessage(id)) tgShareRoom(code, url, 'Заходь у мою кімнату LOKO RUSH: ' + code); });
          return;
        }
        if (tgShareRoom(s.code, url, 'Заходь у мою кімнату LOKO RUSH: ' + s.code)) return;
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
      if (rew.clubUp) chips.push(['gold', I.up, `Клуб досяг ${rew.lvl} рівня: +100 монет${rew.iron ? ` і +${rew.iron} Iron Dollar` : ''}`]);
      for (const q of r.quests || []) chips.push(['gold', I.check, `Квест виконано: ${q.t}. Нагорода +${q.c} чекає в хабі`]);
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
      buttons: [...(can ? [['go', 'on-rematch', 'РЕВАНШ', I.play]] : []), ['alt', 'on-menu', can ? 'ДО КІМНАТИ' : 'ДО ОНЛАЙНУ']],
    });
  }
}
