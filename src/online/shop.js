// Магазин онлайн-хабу: «Вагони» (скаут і паки з чесними шансами й гарантом), «Ринок» (готові гравці), «Лава» (запас і продаж).
// Відкриття: запит (сервер гри або пристрій) і потяг (openTrain із src/ui/packtrain.js) стартують разом; потяг стає на вагоні
// з відповіді (wagon), з вагона виходить гравець, далі його картка (src/ui/card.js) злітає з перону, перевертається й пропонує
// основу, лаву чи продаж. Помилка мережі: потяг гасне, монети не списані. Правила (PACKS, гарант, ринок) — src/online/profile.js.
import { audio, vibrate } from '../core/audio.js';
import { I } from '../ui/icons.js';
import { VOX } from '../ui/vox.js';
import { heroCard, heroBack, bindCards } from '../ui/card.js';
import { portrait } from '../ui/portrait.js';
import { fmt } from '../state/economy.js';
import { ovr, keysFor } from '../state/squad.js';
import * as PR from './profile.js';
import { OP, PACKS, RARITY, TRAITS, BENCH_MAX, SELL, sellPrice, esc, flagSvg, kitOf, isKeeper, buyPack, swapAny, moveDeny } from './profile.js';
import { has } from './server.js';
import { inTelegram, tgInvoice } from '../core/telegram.js';

// Потяг — модуль заставки (src/ui/packtrain.js). Поки його немає, відкриття йде простою заміною з тим самим інтерфейсом:
// openTrain({ kind, odds, result, view, host }) → Promise<{ end: 'done' | 'skip' | 'error', at, close }>.
const TRAIN = import.meta.glob('../ui/packtrain.js');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
const PACK_ART = { scout: 'binoculars', rare: 'crateRare', epic: 'crateEpic', gold: 'crateGold' };
const WIN = 120;                                          // монет за перемогу (applyResult): мірило «скільки матчів до суми»
const SUBS = { wagons: 'Вагони', market: 'Ринок', bench: 'Лава', iron: 'Iron Dollar' };
const pct = (v) => Math.round(v * 100) + '%';
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
const lastName = (n) => String(n).split(' ').slice(-1)[0];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Вагон із відповіді, а старий сервер без нього — за правилом (wagonOf у profile.js); рідкість завжди справжня. */
const wagonFor = (r) => (r.wagon && RARITY[r.wagon.rar] ? r.wagon : typeof PR.wagonOf === 'function' ? PR.wagonOf(r.hero) : { no: 0, rar: r.hero.rar });
/** Вітрина ринку в одному вигляді (сервер чи пристрій): until — мить оновлення за годинником пристрою. */
const normMk = (v) => (v && Array.isArray(v.offers) ? { list: v.offers, until: Date.now() + Math.max(0, +v.left_ms || 0), refresh: v.refresh_price } : null);

/** Місткість лави: базова й куплені за Iron Dollar місця (benchCap у profile.js); поки правила не знають місць — BENCH_MAX. */
export const benchCap = () => (typeof PR.benchCap === 'function' ? PR.benchCap(OP) : BENCH_MAX);
/**
 * Iron Dollar: 'srv' — веде сервер гри (частина 'iron'), 'local' — клуб на пристрої, null — недоступно: правил ще немає
 * (IRON у profile.js) або сервер веде клуб, а доларів не знає (покупка на пристрої розійшлася б із сервером).
 */
export const ironMode = () => (!PR.IRON ? null : has('iron') ? 'srv' : has('club') ? null : 'local');
/** «Бракує 7 Iron Dollar»: і де їх узяти. */
const shortIron = (price) => `Бракує ${price - (OP.iron | 0)} Iron Dollar · тижневі квести дають по 2–3`;

/** «Бракує 270 монет · ≈ 3 перемоги»: скільки ще й скільки це матчів. */
export function shortOf(price, coins = OP.coins) {
  const need = price - coins; if (need <= 0) return '';
  const w = Math.ceil(need / WIN);
  return `Бракує ${fmt(need)} монет · ≈ ${w} ${plural(w, 'перемога', 'перемоги', 'перемог')}`;
}

/** Заміна потяга: вагон тремтить, поки чекаємо відповіді, і гасне кольором рідкості. Інтерфейс той самий, що в openTrain. */
async function fallbackTrain({ kind, result, host }) {
  const L = document.createElement('div'); L.className = 'sh-fb';
  L.innerHTML = `<div class="pk-open"><div class="pk-box">${VOX[PACK_ART[kind]] || VOX.crateRare}</div><small>Відчиняємо вагон</small></div>`;
  host.appendChild(L);
  const t0 = performance.now();
  let r = null; try { r = await result; } catch (_) { r = null; }
  if (!r || !r.hero) { L.remove(); return { end: 'error', at: null, close() {} }; }
  await wait(Math.max(0, 900 - (performance.now() - t0)));
  const box = L.querySelector('.pk-open'); box.style.setProperty('--rc', RARITY[(r.wagon && r.wagon.rar) || r.hero.rar].col); box.classList.add('pk-go');
  await wait(420);
  const at = L.querySelector('.pk-box').getBoundingClientRect();
  return { end: 'done', at, close() { L.remove(); } };
}
async function trainFn() {
  const load = TRAIN['../ui/packtrain.js'];
  if (!load) return fallbackTrain;
  try { const m = await load(); return typeof m.openTrain === 'function' ? m.openTrain : fallbackTrain; } catch (_) { return fallbackTrain; }
}

export class Shop {
  /** sc — OnlineScreen (вигляд героя, продаж, перемальовування, сесія). */
  constructor(sc) { this.sc = sc; this.ui = sc.ui; this.sub = 'wagons'; this.busy = false; this.run = null; this.mkt = null; this.gone = false; }
  get s() { return this.sc.s; }
  re() { this.ui.renderPanel(); }

  // ------------------------------------------------------------------ дані для картки
  img(e) { const k = kitOf(OP.club); return portrait(this.sc.g.renderer, this.sc.look(e), 'on-' + e.id + e.num + k.main + k.second + OP.club.gk); }
  card(e, o = {}) { return heroCard(e, { img: this.img(e), flag: flagSvg(OP.club.flag), ...o }); }
  /** Хто в клубі грає на цій позиції: той самий слот схеми, інакше та сама лінія (воротар — воротар); з кількох — слабший. */
  mineFor(h) {
    const H = OP.heroes, gk = isKeeper(h);
    const same = H.filter((e) => isKeeper(e) === gk && (gk || e.pos === h.pos));
    const pool = same.length ? same : H.filter((e) => isKeeper(e) === gk && (gk || e.line === h.line));
    return pool.reduce((b, e) => (!b || ovr(e) < ovr(b) ? e : b), null);
  }
  cmpWith(h, m) {
    if (!m) return null;
    const k = {}; for (const s of keysFor(h.line)) k[s] = (h.stats[s] | 0) - ((m.stats && m.stats[s]) | 0);
    return { d: ovr(h) - ovr(m), k };
  }

  // ------------------------------------------------------------------ вкладка
  html() {
    const B = OP.bench || [], tabs = Object.keys(SUBS).map((k) => `<button class="sh-tab ${this.sub === k ? 'on' : ''}" data-act="sh-sub:${k}">${SUBS[k]}${k === 'bench' ? ` <em>${B.length}/${benchCap()}</em>` : ''}</button>`).join('');
    const body = this.sub === 'market' ? this.marketHtml() : this.sub === 'bench' ? this.benchHtml() : this.sub === 'iron' ? this.ironHtml() : this.wagonsHtml();
    return `<div class="sh"><nav class="sh-tabs on-a">${tabs}</nav>${body}</div>`;
  }
  afterRender() { bindCards(this.ui.el.panel); bindCards(this.ui.el.reveal); }

  /**
   * Вагони: скаут і паки. Смуга шансів — ті самі числа, якими рахує правило (PACKS); гарант — pityLeft. Пак із ціною в
   * Iron Dollar (iron, «Золотий вагон») видно, лише коли долари доступні (ironMode).
   */
  wagonsHtml() {
    const full = (OP.bench || []).length >= benchCap(), im = ironMode();
    const tiles = Object.keys(PACKS).filter((k) => !PACKS[k].iron || im).map((k, n) => {
      const p = PACKS[k], o = ['l', 'e', 'r', 'c'].filter((r) => p.odds[r]), dol = !!p.iron, can = dol ? (OP.iron | 0) >= p.iron : OP.coins >= p.price;
      const cost = dol ? `${fmt(p.iron)}${I.iron}` : `${fmt(p.price)}${I.coin}`;
      const strip = o.map((r) => `<u style="flex:${p.odds[r]};background:${RARITY[r].col}"></u>`).join('');
      const legend = o.map((r) => `<span style="--rc:${RARITY[r].col}">${RARITY[r].name} <b>${pct(p.odds[r])}</b></span>`).join('');
      const left = p.pity && typeof PR.pityLeft === 'function' ? PR.pityLeft(OP, k) : null;
      const pr = p.pity && RARITY[p.pity.rar] ? RARITY[p.pity.rar] : null;
      const pity = left != null && pr ? `<span class="sh-pity" style="--rc:${pr.col}">${left <= 1 ? `наступний — точно «${pr.name.toLowerCase()}» чи краще` : `до гаранту «${pr.name.toLowerCase()}»: <b>${left}</b>`}</span>` : '';
      return `<section class="sh-wg pk-${k} on-a" style="--d:${n}"><span class="sh-wg-a">${VOX[PACK_ART[k]]}</span>
        <b class="sh-wg-t">${p.name}</b><i class="hub-pk-s">${strip}</i><span class="hub-pk-l">${legend}</span>${pity}
        <button class="sh-go ${can && !full ? '' : 'dim'}" data-act="sh-open:${k}"><b>Відкрити</b><span>${cost}</span></button>
        ${can ? '' : `<small class="sh-short">${dol ? shortIron(p.iron) : shortOf(p.price)}</small>`}</section>`;
    }).join('');
    const note = full ? `<button class="sh-note warn on-a" data-act="sh-sub:bench">Лава повна (${benchCap()}/${benchCap()}): відкриття спершу попросить продати когось</button>`
      : `<p class="sh-note on-a">Новачок сідає на лаву (${(OP.bench || []).length}/${benchCap()}); після відкриття — в основу, на лаву чи продати.</p>`;
    return `<div class="sh-wgs">${tiles}</div>${note}`;
  }

  // ------------------------------------------------------------------ ринок
  /**
   * Вітрина ринку (6 готових гравців на день): із сервера, якщо він її веде ('market'), інакше правило на пристрої
   * (marketHere у profile.js). Сервер веде клуб, а ринку не знає — ринку немає: покупка на пристрої розійшлася б із монетами
   * сервера. Повертає { list, until, refresh }, 'wait' — сервер ще відповідає, null — ринку немає.
   */
  market() {
    if (has('club') && !has('market')) return null;
    if (has('market')) {
      if (this.mkt && this.mkt.until > Date.now()) return this.mkt;
      this.loadMarket(); return this.mFail ? null : 'wait';
    }
    return typeof PR.marketHere === 'function' ? normMk(PR.marketHere(Date.now())) : null;
  }
  loadMarket() {
    if (this.mLoad || Date.now() < (this.mNext || 0)) return;
    this.mLoad = true;
    this.s.cloud.marketLoad().then((r) => {
      this.mLoad = false; const v = r && !r.error ? normMk(r) : null;
      this.mkt = v; this.mFail = !v; if (!v) this.mNext = Date.now() + 15000;   // не смикати сервер на кожне перемальовування
      if (this.ui.panel === 'online' && this.sc.tab === 'shop' && this.sub === 'market') this.re();
    });
  }
  marketHtml() {
    const M = this.market();
    if (M === 'wait') return '<p class="sh-note on-a">Завантажуємо вітрину…</p>';
    if (!M) return `<p class="sh-note on-a">${this.mFail ? 'Сервер гри не віддав вітрину, спробуй трохи згодом.' : has('club') ? 'Ринок готових гравців відкриється, щойно його ввімкне сервер гри.' : 'Ринок готових гравців відкриється з наступним оновленням гри.'}</p>`;
    const cards = M.list.map((x, k) => {
      const h = x.hero, m = this.mineFor(h), cmp = this.cmpWith(h, m), can = OP.coins >= x.price;
      const vs = m ? `<small class="sh-vs">проти ${esc(lastName(m.name))} (${ovr(m)})</small>` : '';
      const btn = x.sold ? '<b class="sh-sold">ПРОДАНО</b>'
        : `<button class="sh-buy ${can ? '' : 'dim'}" data-act="sh-mbuy:${k}"><b>Купити</b><span>${fmt(x.price)}${I.coin}</span></button>${can ? '' : `<small class="sh-short">${shortOf(x.price)}</small>`}`;
      return `<div class="sh-mk on-a" style="--d:${k}">${this.card(h, { cmp, state: x.sold ? 'sold' : '', back: heroBack(h, `<p class="hc-bt">Продаж потім: ${fmt(sellPrice(h))} монет</p>`) })}${vs}${btn}</div>`;
    }).join('');
    const C = PR.IRON, mi = ironMode() && C && C.mref != null;
    const ref = (M.refresh != null ? `<button class="sh-ref ${OP.coins >= M.refresh ? '' : 'dim'}" data-act="sh-mref"><b>Оновити вітрину</b><span>${fmt(M.refresh)}${I.coin}</span></button>` : '')
      + (mi ? `<button class="sh-ref ${(OP.iron | 0) >= C.mref ? '' : 'dim'}" data-act="sh-mrefi"><b>Оновити</b><span>${C.mref}${I.iron}</span></button>` : '');
    return `<div class="sh-mhead on-a"><span>Нові гравці через <b data-mleft="${M.until}">${this.leftTxt(M.until)}</b></span><span class="sh-refs">${ref}</span></div><div class="sh-mks">${cards}</div>`;
  }
  leftTxt(until) {
    const s = Math.max(0, Math.round((until - Date.now()) / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? `${h} год ${m} хв` : m ? `${m} хв ${s % 60} с` : `${s} с`;
  }
  /** Годинник вітрини (раз на секунду, без перемальовування); час вийшов — нова вітрина. */
  tick() {
    const el = this.ui.panel === 'online' && this.sc.tab === 'shop' && this.sub === 'market' && this.ui.el.panel.querySelector('[data-mleft]');
    if (!el) return;
    const u = +el.dataset.mleft;
    if (u <= Date.now()) { this.mkt = null; this.re(); return; }
    el.textContent = this.leftTxt(u);
  }

  // ------------------------------------------------------------------ Iron Dollar
  /**
   * Розділ другої валюти: місця на лаві (ціна росте з кожним), мішок монет, нова риса героя (з «Героїв»), свіжий ринок;
   * поповнення через Telegram Stars і те, де долари заробляються. Ціни й правила — IRON у profile.js.
   */
  ironHtml() {
    const C = PR.IRON, mode = ironMode(), have = OP.iron | 0;
    if (!C) return '<p class="sh-note on-a">Iron Dollar з’явиться з наступним оновленням гри.</p>';
    if (!mode) return '<p class="sh-note on-a">Iron Dollar відкриється, щойно його ввімкне сервер гри.</p>';
    const tile = (n, art, t, p, act, price, extra = '') => {
      const can = price != null && have >= price;
      return `<section class="sh-wg sh-iw on-a" style="--d:${n}"><span class="sh-wg-a">${art}</span><b class="sh-wg-t">${t}</b><span class="sh-ip">${p}</span>
        ${price == null ? `<b class="sh-sold">${extra || 'ГОТОВО'}</b>` : `<button class="sh-go ${can ? '' : 'dim'}" data-act="${act}"><b>${extra || 'Купити'}</b><span>${price}${I.iron}</span></button>`}
        ${price != null && !can ? `<small class="sh-short">${shortIron(price)}</small>` : ''}</section>`;
    };
    const slots = OP.slots | 0, max = PR.SLOTS_MAX ?? C.slot.length, base = PR.BENCH_BASE ?? BENCH_MAX;
    const tiles = [
      tile(0, VOX.bench, 'Місце на лаві', `Лава ${benchCap()} → ${Math.min(base + max, benchCap() + 1)} місць. Куплено ${slots} з ${max}`, 'sh-islot', slots < max ? C.slot[slots] : null, slots < max ? '' : 'ЛАВА НАЙБІЛЬША'),
      tile(1, VOX.coins, 'Мішок монет', `+${fmt(C.bagCoins)} монет онлайн-клубу одразу`, 'sh-ibag', C.bag),
      tile(2, VOX.crown, 'Нова риса', 'Інша риса героя з набору його лінії. Обери гравця в «Героях»', 'sh-itrait', C.trait, 'Обрати гравця'),
    ].join('');
    const stars = Array.isArray(PR.STARS) ? PR.STARS : [], sOn = has('stars') && inTelegram();
    const top = stars.map((p) => `<button class="sh-star ${sOn ? '' : 'dim'}" data-act="sh-stars:${esc(p.id)}"><b>${p.iron}${I.iron}</b><span>★ ${p.stars}</span></button>`).join('');
    const topup = stars.length ? `<section class="sh-tops on-a"><b class="hub-tile-h">Поповнити зірками Telegram</b><div class="sh-stars">${top}</div>
      ${sOn ? '' : `<small class="sh-short">${inTelegram() ? 'Оплата зірками відкриється, щойно її ввімкне сервер гри' : 'Зірками можна платити лише в грі всередині Telegram'}</small>`}</section>` : '';
    const earn = `<p class="sh-note on-a">Де заробити Iron Dollar: тижневі квести (по 2–3), новий рівень клубу (+2), рейтинг тижня (до 30, лише із сервером гри), зірки Telegram. У тебе зараз <b>${have}</b>.</p>`;
    return `<div class="sh-wgs">${tiles}</div>${topup}${earn}`;
  }
  /** Кнопка «Нова риса» в деталях героя (screen.heroDetail): лише коли долари доступні. */
  traitBtn(sel) {
    const C = PR.IRON; if (!C || !ironMode() || C.trait == null) return '';
    return `<button class="btn alt on-scout ${(OP.iron | 0) >= C.trait ? '' : 'dim'}" data-act="sh-trait:${sel}"><b>НОВА РИСА · ${C.trait}</b>${I.iron}</button>`;
  }
  /** Покупка за доларами: kind — 'slot', 'bag' або 'trait' (i — герой у спільному списку). Другий дотик підтверджує. */
  async ironBuy(kind, i, el) {
    const C = PR.IRON, mode = ironMode(); if (!C || !mode || this.busy) return;
    const price = kind === 'slot' ? C.slot[OP.slots | 0] : kind === 'bag' ? C.bag : C.trait;
    if (price == null) return this.say('Лава вже найбільша');
    if ((OP.iron | 0) < price) return this.say(shortIron(price));
    const h = kind === 'trait' ? PR.allHeroes()[i] : null;
    if (kind === 'trait' && !h) return;
    if (!this.sc.armed(el, `ТОЧНО? ${price} $`)) return;
    this.busy = true;
    let r;
    if (mode === 'srv') r = await this.s.cloud.iron(kind, h ? { hero: h.id } : {});
    else r = kind === 'slot' ? PR.buySlotHere() : kind === 'bag' ? PR.ironBagHere() : PR.traitHere(i);
    this.busy = false;
    if (!r || r.error) {
      const e = r && r.error;
      this.say(r === null ? 'Немає зв’язку із сервером гри, спробуй ще раз' : e === 'no_iron' ? shortIron(price) : e === 'max' ? 'Лава вже найбільша' : 'Покупка не вдалася');
      return this.re();
    }
    audio.buy(); vibrate(30); this.sc.bump = true; this.sc.tac.seen = -1; this.s.sync(true);
    if (kind === 'slot') this.ui.toast(`Лава тепер на ${benchCap()} місць`);
    else if (kind === 'bag') { audio.coin(3); this.ui.toast(`+${fmt(C.bagCoins)} монет`); }
    else { const e = PR.allHeroes().find((x) => x.id === h.id) || h, T = TRAITS[e.trait]; this.ui.toast(`${lastName(e.name)}: нова риса${T ? ' «' + T.name + '»' : ''}`); }
    this.re();
  }
  /** Пакет доларів за Telegram Stars: рахунок робить бот (сервер гри), платить Telegram; після оплати беремо клуб із сервера. */
  async stars(id) {
    if (!has('stars') || !inTelegram()) return this.say(inTelegram() ? 'Оплата зірками відкриється згодом' : 'Зірками можна платити лише в Telegram');
    if (this.busy) return;
    this.busy = true; audio.click();
    const r = await this.s.cloud.stars(id);
    if (!r || r.error || !r.link) { this.busy = false; return this.say(r === null ? 'Немає зв’язку із сервером гри' : 'Рахунок не створено, спробуй ще раз'); }
    const st = await tgInvoice(r.link);
    this.busy = false;
    if (st === 'paid') { audio.coin(3); vibrate([12, 30, 12]); await this.s.cloud.resync(); this.sc.bump = true; this.ui.toast('Iron Dollar зараховано'); this.re(); }
    else if (st === 'failed') this.say('Оплата не пройшла');
  }

  // ------------------------------------------------------------------ лава
  benchHtml() {
    const B = OP.bench || [];
    const cards = B.map((e, j) => {
      const m = this.mineFor(e), up = m && ovr(e) > ovr(m);
      return `<div class="sh-bn on-a" style="--d:${j}">${this.card(e, { size: 's', cmp: this.cmpWith(e, m), back: heroBack(e) })}
        ${m ? `<button class="sh-mini ${up ? 'go' : ''}" data-act="sh-in:${esc(e.id)}"><b>В основу</b><small>замість ${esc(lastName(m.name))}</small></button>` : ''}
        <button class="sh-mini" data-act="sh-sell:${esc(e.id)}"><b>Продати</b><small>+${fmt(sellPrice(e))}</small></button></div>`;
    }).join('');
    const base = ['c', 'r', 'e', 'l'].map((r) => `${RARITY[r].name.toLowerCase()} ${SELL[r]}`).join(', ');
    return `<div class="sh-bns">${cards || '<p class="sh-note on-a">Лава порожня. Новачки з вагонів і ринку сідають сюди.</p>'}</div>
      <p class="sh-note on-a">На лаві гравець не грає й досвіду не отримує. Продаж: ${base} і ще 5 за кожне очко рейтингу понад базу рідкості; завжди менше за ціну вагона.</p>`;
  }

  // ------------------------------------------------------------------ дії
  act(k, x, y, el) {
    switch (k) {
      case 'sh-sub': audio.click(); this.sub = SUBS[x] ? x : 'wagons'; return this.re();
      case 'sh-open': return this.open(x);
      case 'sh-mbuy': return this.marketBuy(+x, el);
      case 'sh-mref': return this.marketRefresh(el);
      case 'sh-in': return this.toStart(x);
      case 'sh-sell': return this.sell(x, el);
      case 'sh-rv-close': return this.closeOpen();
      case 'sh-card': return this.showCard(PR.allHeroes()[+x]);
      case 'sh-rv-sell': return this.sell(x, el, true);
      case 'sh-rv-in': return this.toStart(x, true);
      case 'sh-free': return this.sell(x, el, false, y);          // продати з вікна «лава повна» й одразу продовжити
      case 'sh-islot': return this.ironBuy('slot', 0, el);
      case 'sh-ibag': return this.ironBuy('bag', 0, el);
      case 'sh-trait': return this.ironBuy('trait', +x, el);
      case 'sh-itrait': audio.click(); this.sc.tab = 'heroes'; this.ui.toast('Обери гравця й натисни «Нова риса»'); return this.re();
      case 'sh-mrefi': return this.marketRefresh(el, true);
      case 'sh-stars': return this.stars(x);
    }
  }
  say(t) { audio.deny(); vibrate(20); this.ui.toast(t); }

  /** Новачок із лави в основу замість того, хто грає на його позиції (той сідає на лаву). */
  toStart(id, fromOpen = false) {
    const B = OP.bench || [], j = B.findIndex((e) => e.id === id), e = B[j]; if (!e) return;
    const m = this.mineFor(e), i = m ? OP.heroes.indexOf(m) : -1;
    if (i < 0 || !swapAny(i, 11 + j)) { this.say(moveDeny(OP, i, 11 + j) || 'Не вийшло поставити в основу'); return; }
    audio.buy(); this.ui.toast(`${lastName(e.name)} в основі, ${lastName(m.name)} на лаві`);
    this.sc.tac.seen = -1; this.s.sync();
    if (fromOpen) this.closeOpen(); else this.re();
  }
  /** Продати з лави (з підтвердженням другим дотиком). fromOpen — закрити вікно відкриття, then — продовжити відкриття then. */
  sell(id, el, fromOpen = false, then = '') {
    const j = (OP.bench || []).findIndex((e) => e.id === id), e = OP.bench[j]; if (!e) return;
    if (!this.sc.armed(el, 'ТОЧНО? +' + fmt(sellPrice(e)))) return;
    this.sc.sellAt(j, () => {
      if (fromOpen) this.closeOpen();
      else if (then) { this.ui.el.reveal.hidden = true; setTimeout(() => this.open(then), 60); }
    });
  }

  /** Лава повна: у тому ж вікні показуємо запасних із кнопкою «Продати», після продажу відкриття йде саме. */
  freeHtml(kind) {
    const B = OP.bench || [];
    const cards = B.map((e) => `<div class="sh-bn">${this.card(e, { size: 's' })}<button class="sh-mini" data-act="sh-free:${esc(e.id)}:${kind}"><b>Продати</b><small>+${fmt(sellPrice(e))}</small></button></div>`).join('');
    return `<div class="sh-free"><b class="sh-ft">Лава повна (${benchCap()}/${benchCap()})</b><p>Продай когось — і «${PACKS[kind].name}» відкриється одразу.</p><div class="sh-bns">${cards}</div>
      <button class="btn alt" data-act="sh-rv-close"><b>СКАСУВАТИ</b></button></div>`;
  }

  /**
   * Купити й відкрити вагон kind. Запит і потяг стартують разом: потяг їде, поки чекаємо, і стає на вагоні з відповіді;
   * з вагона виходить гравець, а на його місці перевертається картка. slot — позиція скаута з «Героїв»; без неї позицію
   * новачка обирає правило (packInto). Помилка: потяг гасне, монети не списано (запит їх не взяв).
   */
  async open(kind, slot) {
    const P = PACKS[kind]; if (!P || this.busy) return;
    if (P.iron ? !ironMode() || (OP.iron | 0) < P.iron : OP.coins < P.price) return this.say(P.iron ? (ironMode() ? shortIron(P.iron) : 'Iron Dollar поки недоступний') : shortOf(P.price));
    const el = this.ui.el.reveal;
    if ((OP.bench || []).length >= benchCap()) { audio.click(); el.innerHTML = `<div class="sh-ov">${this.freeHtml(kind)}</div>`; el.hidden = false; this.ui.revealClose = null; return; }
    this.busy = true; this.gone = false; audio.click();
    el.innerHTML = '<div class="sh-ov sh-opening"><div class="sh-out" data-out hidden></div></div>';
    el.hidden = false;
    const out = el.querySelector('[data-out]'), kit = kitOf(OP.club);
    this.ui.revealClose = () => { this.gone = true; };              // «назад» посеред потяга: дочекаємось його й одразу приберемо
    const result = this.request(kind, slot);
    result.catch(() => {});
    const openTrain = await trainFn();
    const view = (h) => { const key = 'on-' + h.id + h.num + kit.main + kit.second + OP.club.gk; return { look: this.sc.look(h), key, still: () => this.img(h) }; };
    let run;                                                   // card: false — блок параметрів малює не потяг, а наша картка
    try { run = await openTrain({ kind, odds: P.odds, result, view, host: el, card: false }); } catch (_) { run = { end: 'error', at: null, close() {} }; }
    const r = await result.then((v) => v, (e) => ({ error: (e && e.error) || 'net' }));
    this.busy = false;
    if (this.gone || el.hidden) {                                   // закрили кнопкою «назад»: куплений гравець уже на лаві
      run.close(); this.ui.revealClose = null;
      if (r && r.hero) this.ui.toast(`${lastName(r.hero.name)} на лаві`);
      setTimeout(() => this.re(), 280); return;
    }
    if (run.end === 'error' || !r || !r.hero) return this.failed(out, r);
    this.run = run; this.ui.revealClose = () => { if (this.run) { this.run.close(); this.run = null; } setTimeout(() => this.re(), 280); };
    // герой лишається на пероні (run.hero), картка стає з протилежного боку екрана й живе разом із ним до закриття вікна;
    // без героя (запасна заміна потяга) картка в центрі, а шар потяга тане під нею
    const side = !!(run.hero && run.hero.width);
    if (side) el.querySelector('.sh-ov').classList.add('side', run.hero.left + run.hero.width / 2 < innerWidth / 2 ? 'side-r' : 'side-l');
    this.reveal(out, r.hero, r.wagon, r.replaced, run.at);
    if (!side) setTimeout(() => { if (this.run === run) { run.close(); this.run = null; } }, REDUCED.matches ? 0 : 650);
  }
  /** Запит покупки: сервер гри (якщо веде клуб) або пристрій. Promise<{ hero, wagon, replaced }>, reject — { error }. */
  async request(kind, slot) {
    const H = OP.heroes, weak = () => H.reduce((b, e, k) => (k && ovr(e) < ovr(H[b]) ? k : b), 1);
    let r;
    if (has('club')) {
      r = await this.s.cloud.buy(kind, slot ?? (has('shop') ? undefined : weak()));   // старий сервер без лави міняє героя на слоті
      if (r === null) throw { error: 'net' };
    } else r = buyPack(kind, slot);
    if (!r || r.error || !r.hero) throw { error: (r && r.error) || 'server' };
    this.sc.tac.seen = -1; this.sc.bump = true; this.s.sync(true);
    return { hero: r.hero, replaced: !!r.replaced, wagon: wagonFor(r) };
  }
  failed(out, r) {
    this.ui.revealClose = null;
    const e = r && r.error, t = e === 'net' ? 'Немає зв’язку із сервером гри. Монети не списано, спробуй ще раз'
      : e === 'no_coins' ? 'Бракує монет' : e === 'no_iron' ? 'Бракує Iron Dollar' : e === 'bench_full' ? 'Лава повна: продай когось' : 'Відкриття не вдалося. Монети не списано';
    audio.deny(); vibrate(20);
    out.hidden = false; out.innerHTML = `<div class="sh-fail"><b>${t}</b><button class="btn alt" data-act="sh-rv-close"><b>ЗАКРИТИ</b></button></div>`;
  }
  /**
   * Гравець вийшов із вагона: картка злітає з його місця (at — де він стоїть) у центр і перевертається лицем, під нею вибір —
   * основа замість слабшого на позиції, лава чи продаж. Тактильний відгук на появу, на легенду — довший.
   */
  reveal(out, h, w, replaced, at) {
    const m = replaced ? null : this.mineFor(h), cmp = this.cmpWith(h, m), up = m && ovr(h) > ovr(m), R = RARITY[h.rar] || RARITY.c;
    if (h.rar === 'l' || h.rar === 'e') audio.horn(); else audio.win();
    vibrate(h.rar === 'l' ? [20, 40, 20, 40, 60] : 30);
    const verdict = m ? `<p class="sh-vd ${cmp.d > 0 ? 'up' : cmp.d < 0 ? 'dn' : ''}">${cmp.d > 0 ? 'Сильніший' : cmp.d < 0 ? 'Слабший' : 'Такий самий'}, ніж ${esc(lastName(m.name))} (${ovr(m)})</p>` : '';
    const acts = replaced
      ? '<p class="sh-vd">Став в основу замість гравця цієї позиції</p><div class="sh-acts"><button class="sh-act go" data-act="sh-rv-close"><b>До складу</b></button></div>'
      : `<div class="sh-acts">${m ? `<button class="sh-act ${up ? 'go' : ''}" data-act="sh-rv-in:${esc(h.id)}"><b>В основу</b><small>замість ${esc(lastName(m.name))}</small></button>` : ''}
        <button class="sh-act ${up ? '' : 'go'}" data-act="sh-rv-close"><b>На лаву</b><small>${(OP.bench || []).length}/${benchCap()}</small></button>
        <button class="sh-act" data-act="sh-rv-sell:${esc(h.id)}"><b>Продати</b><small>+${fmt(sellPrice(h))}</small></button></div>`;
    out.hidden = false;
    out.innerHTML = `<div class="sh-rv r-${h.rar}" style="--rc:${R.col}"><small class="sh-wn">${w && w.no ? `Вагон №${w.no} · ` : ''}${R.name}</small>
      <div class="sh-fly">${this.card(h, { size: 'l', state: 'new', cmp, flip: !REDUCED.matches, back: heroBack(h) })}</div>${verdict}${acts}</div>`;
    const fly = out.querySelector('.sh-fly'), c = out.querySelector('.hc');
    if (REDUCED.matches || !fly) return;
    if (at && at.width) {                                           // FLIP: з місця гравця на пероні у свою позицію
      const b = fly.getBoundingClientRect(), s = Math.max(0.15, Math.min(1, at.height / b.height));
      fly.style.transform = `translate(${Math.round(at.left + at.width / 2 - (b.left + b.width / 2))}px, ${Math.round(at.top + at.height / 2 - (b.top + b.height / 2))}px) scale(${s.toFixed(3)})`;
      fly.getBoundingClientRect();
      fly.classList.add('go'); fly.style.transform = '';
    }
    requestAnimationFrame(() => requestAnimationFrame(() => c && c.classList.remove('flip')));   // лицем догори — перевертанням
  }
  /** Картка гравця клубу поверх усього («Герої»): лицем, із переворотом на зворот; закривається кнопкою чи «назад». */
  showCard(e) {
    if (!e) return;
    const el = this.ui.el.reveal; audio.click();
    el.innerHTML = `<div class="sh-ov"><div class="sh-rv" style="--rc:${(RARITY[e.rar] || RARITY.c).col}">${this.card(e, { size: 'l', back: heroBack(e, `<p class="hc-bt">Продаж: ${fmt(sellPrice(e))} монет</p>`) })}
      <div class="sh-acts"><button class="sh-act go" data-act="sh-rv-close"><b>Закрити</b></button></div></div></div>`;
    el.hidden = false; this.ui.revealClose = null; bindCards(el);
  }
  closeOpen() {
    if (this.run) { this.run.close(); this.run = null; }
    this.ui.revealClose = null; this.busy = false;
    this.ui.el.reveal.hidden = true; audio.click(); this.re();
  }

  // ------------------------------------------------------------------ ринок: дії
  /** Купити гравця з вітрини (другий дотик підтверджує): на сервері, якщо він веде ринок, інакше на пристрої. */
  async marketBuy(k, el) {
    const M = this.market(), x = M && M !== 'wait' && M.list[k]; if (!x || x.sold || this.busy) return;
    if (OP.coins < x.price) return this.say(shortOf(x.price));
    if ((OP.bench || []).length >= benchCap()) { this.say('Лава повна: продай когось'); this.sub = 'bench'; return this.re(); }
    if (!this.sc.armed(el, 'ТОЧНО? ' + fmt(x.price))) return;
    this.busy = true;
    const srv = has('market'), slot = x.slot ?? k;
    const r = srv ? await this.s.cloud.marketBuy(slot) : PR.marketTake(slot, Date.now());
    this.busy = false;
    if (!r || r.error) {
      const e = r && r.error;
      this.say(r === null ? 'Немає зв’язку із сервером гри, спробуй ще раз' : e === 'sold' ? 'Цього гравця вже продано' : e === 'bench_full' ? 'Лава повна: продай когось' : e === 'no_coins' ? 'Бракує монет' : 'Вітрина змінилась, глянь ще раз');
      if (srv) this.mkt = null;
      return this.re();
    }
    if (srv && this.mkt) { const o = this.mkt.list.find((q) => q.slot === slot); if (o) o.sold = true; }
    audio.buy(); audio.coin(2); vibrate(30); this.sc.bump = true; this.sc.tac.seen = -1; this.s.sync(true);
    this.ui.toast(`${r.hero.name} на лаві`);
    this.re();
  }
  /** Оновити вітрину за монети (ціна росте з кожним оновленням за день). */
  async marketRefresh(el, iron = false) {
    const M = this.market(); if (!M || M === 'wait' || this.busy) return;
    const price = iron ? PR.IRON && PR.IRON.mref : M.refresh; if (price == null || (iron && !ironMode())) return;
    if (iron ? (OP.iron | 0) < price : OP.coins < price) return this.say(iron ? shortIron(price) : shortOf(price));
    if (!this.sc.armed(el, 'ТОЧНО? ' + fmt(price) + (iron ? ' $' : ''))) return;
    this.busy = true;
    const srv = has('market'), r = srv ? await this.s.cloud.marketRefresh(iron) : iron ? PR.marketRenewIron(Date.now()) : PR.marketRenew(Date.now());
    this.busy = false;
    if (!r || r.error) { this.say(r === null ? 'Немає зв’язку із сервером гри' : iron ? shortIron(price) : 'Бракує монет'); return this.re(); }
    if (srv) this.mkt = normMk(r);
    audio.buy(); this.sc.bump = true; this.re();
  }
}
