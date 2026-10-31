// Вкладка «Онлайн» у меню: свій онлайн-клуб (назва, прапор, рівень, рейтинг), герої з прокачкою і гра з людиною
// за кодом кімнати. Тут лише розмітка й кнопки; логіка з'єднання — session.js.
import { audio } from '../core/audio.js';
import { I } from '../ui/icons.js';
import { portrait } from '../ui/portrait.js';
import { STAT_NAMES, STAT_HINT, ROLE_UA, keysFor, ovr, tierOf, xpNeed } from '../state/squad.js';
import { fmt } from '../state/economy.js';
import { OP, saveOP, resetOP, esc, plain, flagSvg, kitOf, gkKitOf, shortOf, teamRating, trainPrice, trainHero, scoutHero, SCOUT_PRICE, clubXpNeed, TRAITS, RARITY, FLAG_COLS, FLAG_PATS, FLAG_EMB, newClub } from './profile.js';
import { Online } from './session.js';
import { cleanCode } from './net.js';

const PAT_UA = { h2: 'Дві смуги', h3: 'Три смуги', v3: 'Вертикаль', diag: 'Діагональ', cross: 'Хрест', border: 'Рамка', chev: 'Шеврон', quad: 'Шахи' };
const EMB_UA = { none: 'Без знака', star: 'Зірка', ball: 'М’яч', bolt: 'Блискавка', crown: 'Корона', wheel: 'Колесо', trident: 'Тризуб' };
const sheet = (title, body) => `<div class="sheet wide on-sheet"><header class="sheet-h"><h2>${title}</h2><button class="sq btn-red" data-act="close-panel" aria-label="Закрити">${I.close}</button></header><div class="sheet-b">${body}</div></div>`;

export class OnlineScreen {
  constructor(ui, game) {
    this.ui = ui; this.g = game; this.tab = 'play'; this.sel = 1; this.codeIn = '';
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

  html() {
    const t = this.tab, tb = (k, n) => `<button class="${t === k ? 'on' : ''}" data-act="on-tab:${k}">${n}</button>`;
    const tabs = `<div class="tabs">${tb('play', 'ГРА')}${tb('club', 'КЛУБ')}${tb('heroes', 'ГЕРОЇ')}</div>`;
    const body = t === 'club' ? this.clubHtml() : t === 'heroes' ? this.heroesHtml() : this.playHtml();
    const purse = `<span class="on-purse">${fmt(OP.coins)}${I.coin}</span>`;
    return sheet(`Онлайн · ${esc(OP.club.name)} ${purse}`, tabs + body);
  }

  // ------------------------------------------------------------------ клуб
  badge(club, ext = '') {
    return `<div class="on-badge ${ext}">${flagSvg(club.flag)}<div><b>${esc(club.name)}</b><em>${esc(club.city || '')}</em></div></div>`;
  }
  clubHtml() {
    const c = OP.club, f = c.flag, need = clubXpNeed(OP.lvl);
    const sw = (i) => FLAG_COLS.map((x) => `<button class="sw ${f.c[i] === x ? 'on' : ''}" style="background:${x}" data-act="on-col:${i}:${x}" aria-label="${x}"></button>`).join('');
    const chips = (list, cur, act, names) => list.map((x) => `<button class="chip-b ${x === cur ? 'on' : ''}" data-act="${act}:${x}">${names[x]}</button>`).join('');
    const gks = ['#e0a81c', '#d86a8a', '#9fbf3a', '#3fb7d8', '#f08a24', '#8a5cd6'].map((x) => `<button class="sw ${c.gk === x ? 'on' : ''}" style="background:${x}" data-act="on-gk:${x}" aria-label="${x}"></button>`).join('');
    const k = kitOf(c);
    return `<div class="on-club">
      <section class="on-id">
        <div class="on-flag-big">${flagSvg(f)}</div>
        <input class="on-name" data-oname maxlength="14" value="${esc(c.name)}" aria-label="Назва клубу"/>
        <input class="on-city" data-ocity maxlength="18" value="${esc(c.city)}" aria-label="Місто"/>
        <div class="on-kit"><i style="background:linear-gradient(90deg,${k.main} 0 62%,${k.second} 62% 100%)"></i><span>Форма — з кольорів прапора</span></div>
        <div class="on-row"><button class="btn alt" data-act="on-randflag"><b>ВИПАДКОВИЙ ПРАПОР</b></button></div>
        <div class="kv"><span>Рівень клубу</span><b>${OP.lvl}</b></div>
        <div class="xp"><u style="width:${Math.min(100, (OP.xp / need) * 100)}%"></u></div><small>досвід ${OP.xp}/${need} · новий рівень: +100 ${I.coin}</small>
      </section>
      <section class="on-edit scroller">
        <div class="cu-r"><small>Візерунок</small><div class="chips">${chips(FLAG_PATS, f.pat, 'on-pat', PAT_UA)}</div></div>
        <div class="cu-r"><small>Основний колір (футболка)</small><div class="sws">${sw(0)}</div></div>
        <div class="cu-r"><small>Другий колір (шорти)</small><div class="sws">${sw(1)}</div></div>
        <div class="cu-r"><small>Колір знака</small><div class="sws">${sw(2)}</div></div>
        <div class="cu-r"><small>Знак</small><div class="chips">${chips(FLAG_EMB, f.em, 'on-emb', EMB_UA)}</div></div>
        <div class="cu-r"><small>Форма воротаря</small><div class="sws">${gks}</div></div>
      </section>
      <section class="on-stats">
        <div class="kv"><span>Рейтинг</span><b>${OP.rating}</b></div>
        <div class="kv"><span>Сила складу</span><b>${teamRating()}</b></div>
        <div class="kv"><span>Матчі</span><b>${OP.games}</b></div>
        <div class="kv"><span>Перемоги · нічиї · поразки</span><b>${OP.rec.w} · ${OP.rec.d} · ${OP.rec.l}</b></div>
        <div class="kv"><span>Голи</span><b>${OP.goals}</b></div>
        <p class="fine">Онлайн-клуб окремий від «Локомотива»: монети, рівні й герої тут свої. Перемога +120, нічия +60, поразка +30, кожен гол +15 ${I.coin}.</p>
        <button class="tg danger" data-act="on-reset"><b>НОВИЙ ВИПАДКОВИЙ КЛУБ</b></button>
      </section></div>`;
  }

  // ------------------------------------------------------------------ герої
  look(e) { const gk = e.line === 'G'; return { kit: gk ? gkKitOf(OP.club) : kitOf(OP.club), num: e.num, skin: e.skin, hair: e.hair, hairCol: e.hairCol, beard: e.beard || 0, gk, scale: 0.9 }; }
  heroesHtml() {
    const g = this.g, H = OP.heroes, kk = kitOf(OP.club), kSig = kk.main + kk.second + OP.club.gk;
    if (!H[this.sel]) this.sel = 1;
    const cards = H.map((e, i) => {
      const o = ovr(e), R = RARITY[e.rar] || RARITY.c;
      const img = portrait(g.renderer, this.look(e), 'on-' + e.id + e.num + kSig);
      return `<button class="sq-card on-hero ${i === this.sel ? 'on' : ''}" style="--rc:${R.col}" data-act="on-sel:${i}"><i class="ovr ${tierOf(o)}">${o}</i><img src="${img}" alt=""/><b>${esc(e.name.split(' ').slice(-1)[0])}</b><em>№${e.num} · ${e.role}</em></button>`;
    }).join('');
    const e = H[this.sel], o = ovr(e), R = RARITY[e.rar] || RARITY.c, T = TRAITS[e.trait], need = xpNeed(e.lvl);
    const tiles = keysFor(e.line).map((k) => {
      const v = e.stats[k], c = trainPrice(v), can = OP.coins >= c && v < 99;
      return `<div class="st"><div class="st-t"><span>${STAT_NAMES[k]}${T && T.stat === k ? ' ★' : ''}</span><b>${v}</b></div><i><u style="width:${v}%"></u></i><button class="btn buy ${can ? 'can' : ''}" data-act="on-train:${this.sel}:${k}" ${v >= 99 ? 'disabled' : ''}><b>+1 · ${fmt(c)}</b>${I.coin}</button><small>${STAT_HINT[k]}</small></div>`;
    }).join('');
    const detail = `<div class="sq-d"><div class="sq-h"><i class="ovr big ${tierOf(o)}">${o}</i><div><h3>${esc(e.name)}</h3>
      <p><span class="on-rar" style="--rc:${R.col}">${R.name}</span>${T ? ` <span class="on-trait">★ ${T.name} — ${T.tip}</span>` : ''}</p>
      <p>№${e.num} · ${ROLE_UA[e.role] || e.role}</p><div class="xp"><u style="width:${Math.min(100, (e.xp / need) * 100)}%"></u></div><small>Рівень ${e.lvl} · досвід ${e.xp}/${need} · матчів ${e.apps} · голів ${e.goals}</small>
      <button class="btn alt on-scout ${OP.coins >= SCOUT_PRICE ? '' : 'dim'}" data-act="on-scout:${this.sel}"><b>СКАУТ: ІНШИЙ ГЕРОЙ · ${SCOUT_PRICE}</b>${I.coin}</button></div></div><div class="st-grid">${tiles}</div></div>`;
    return `<div class="sq-wrap"><div class="sq-list scroller">${cards}</div>${detail}</div>`;
  }

  // ------------------------------------------------------------------ гра
  playHtml() {
    const s = this.s, st = !s.net ? 'idle' : s.state === 'result' ? 'lobby' : s.state, err = s.err ? `<p class="on-err">${esc(s.err)}</p>` : '';
    const me = this.badge(OP.club, 'me'), myR = `<div class="on-meta"><span>Рейтинг <b>${OP.rating}</b></span><span>Сила <b>${teamRating()}</b></span><span>Рів. <b>${OP.lvl}</b></span></div>`;
    if (st === 'idle') {
      return `<div class="on-play">
        <section class="on-card">${me}${myR}<p>Створи кімнату й передай код другові — або введи його код. Матч 1 на 1: кожен керує своєю командою, коли м’яч у його гравця.</p></section>
        <section class="on-card"><button class="btn go big on-create" data-act="on-create"><b>СТВОРИТИ КІМНАТУ</b></button>
          <div class="on-join"><input class="on-code-in" data-ocode maxlength="5" placeholder="КОД" value="${esc(this.codeIn)}" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Код кімнати"/><button class="btn alt" data-act="on-join"><b>УВІЙТИ</b></button></div>${err}
          <p class="fine">Потрібен інтернет в обох. Сервер лише знайомить гравців, далі гра йде напряму між пристроями.</p></section></div>`;
    }
    if (st === 'creating' || st === 'joining' || st === 'wait') {
      const t = st === 'creating' ? 'Створюємо кімнату…' : st === 'wait' ? 'Перепідключаємось…' : 'Шукаємо кімнату ' + esc(s.code) + '…';
      return `<div class="on-play"><section class="on-card on-busy"><i class="on-spin"></i><b>${t}</b>${err}<button class="btn alt" data-act="on-cancel"><b>СКАСУВАТИ</b></button></section></div>`;
    }
    if (st === 'hosting') {
      const code = [...s.code].map((ch, i) => `<s style="--i:${i}">${ch}</s>`).join('');
      return `<div class="on-play">
        <section class="on-card">${me}${myR}</section>
        <section class="on-card on-room"><small>Код кімнати</small><div class="on-code flap">${code}</div>
          <div class="on-row"><button class="btn alt" data-act="on-copy"><b>КОПІЮВАТИ КОД</b></button><button class="btn alt" data-act="on-share"><b>ПОСИЛАННЯ</b></button></div>
          <p class="on-wait"><i class="on-spin"></i>Чекаємо суперника…</p>${err}<button class="btn alt" data-act="on-cancel"><b>ЗАКРИТИ КІМНАТУ</b></button></section></div>`;
    }
    // лобі: обидва на зв'язку
    const o = s.opp, ping = s.net && s.net.rtt ? Math.round(s.net.rtt) + ' мс' : '—';
    const oc = o ? `${this.badge(o.club, 'opp')}<div class="on-meta"><span>Рейтинг <b>${o.rating}</b></span><span>Сила <b>${teamRating(o.heroes)}</b></span><span>Рів. <b>${o.lvl}</b></span></div><div class="on-ready ${s.ready.opp ? 'yes' : ''}">${s.ready.opp ? 'ГОТОВИЙ' : 'ще не готовий'}</div>` : '<p>Отримуємо дані суперника…</p>';
    return `<div class="on-play on-lobby">
      <section class="on-card">${me}${myR}<button class="btn ${s.ready.me ? 'on' : 'go'} big" data-act="on-ready" ${o ? '' : 'disabled'}><b>${s.ready.me ? 'ГОТОВИЙ ✓' : 'Я ГОТОВИЙ'}</b></button></section>
      <div class="on-vs"><b>VS</b><small class="on-ping">пінг ${ping}</small><small>${s.role === 'host' ? 'ти господар' : 'ти в гостях'} · код ${esc(s.code)}</small></div>
      <section class="on-card">${oc}</section>
      <div class="on-foot">${err}<button class="btn alt" data-act="on-cancel"><b>ВИЙТИ З КІМНАТИ</b></button></div></div>`;
  }

  // ------------------------------------------------------------------ дії
  input(el) {
    if (el.matches('[data-oname]')) { const v = plain(el.value).toUpperCase().slice(0, 14); if (v) { OP.club.name = v; saveOP(); } return true; }
    if (el.matches('[data-ocity]')) { OP.club.city = plain(el.value).slice(0, 18); saveOP(); return true; }
    if (el.matches('[data-ocode]')) { const v = cleanCode(el.value); this.codeIn = v; if (el.value !== v) el.value = v; return true; }
    return false;
  }
  act(a, el) {
    const s = this.s, [k, x, y] = a.split(':');
    const re = () => this.ui.renderPanel();
    switch (k) {
      case 'on-tab': audio.click(); this.tab = x; return re();
      case 'on-sel': audio.click(); this.sel = +x; return re();
      case 'on-train': { const c = trainHero(+x, y); if (c === false) { audio.deny(); this.ui.toast(OP.heroes[+x] && OP.heroes[+x].stats[y] >= 99 ? 'Навичка на максимумі' : 'Не вистачає монет — грай онлайн-матчі'); } else audio.buy(); return re(); }
      case 'on-scout': {
        const h = scoutHero(+x);
        if (!h) { audio.deny(); this.ui.toast('Скаут коштує ' + SCOUT_PRICE + ' монет'); return; }
        audio.win(); this.ui.toast((RARITY[h.rar] || RARITY.c).name + ': ' + h.name + (TRAITS[h.trait] ? ' · ' + TRAITS[h.trait].name : '')); return re();
      }
      case 'on-col': OP.club.flag.c[+x] = y; saveOP(); audio.click(); return re();
      case 'on-pat': OP.club.flag.pat = x; saveOP(); audio.click(); return re();
      case 'on-emb': OP.club.flag.em = x; saveOP(); audio.click(); return re();
      case 'on-gk': OP.club.gk = x; saveOP(); audio.click(); return re();
      case 'on-randflag': { const n = newClub().club; OP.club.flag = n.flag; OP.club.gk = n.gk; saveOP(); audio.click(); return re(); }
      case 'on-reset':
        if (el.dataset.arm) { resetOP(); audio.horn(); this.ui.toast('Новий клуб: ' + OP.club.name); this.sel = 1; return re(); }
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
