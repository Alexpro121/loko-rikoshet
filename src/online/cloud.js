// Онлайн-хаб на сервері гри (контракт API 2, server/README.md): клуб, підтверджений результат матчу, квести, таблиця.
// Кожну частину вмикає лише її назва в GET /health → features (server.js); без неї гра лишається на локальній логіці:
// клуб і квести на пристрої (profile.js, quests.js). Коли частина є, головний сервер: гра показує результат одразу за
// локальним підрахунком, а потім бере числа з відповіді сервера (adoptServer), тож розбіжність виправляється сама.
import { OP, toServer, adoptServer, adoptHero, saveOP, allHeroes } from './profile.js';
import { features, has, saveClub, meOnServer, trainOnServer, scoutOnServer, packOnServer, buyOnServer, sellOnServer, resetOnServer, matchStart, matchReport, matchState, serverQuests, claimOnServer, topList } from './server.js';
import { questList, questsReady, claimQuest, questsLeft } from './quests.js';

const SAVE_MS = 1500;                    // серія правок прапора й назви: на сервер іде лише остання
const POLL_MS = 3000, POLL_N = 20;       // результат чекає звіту суперника до ~60 с
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Cloud {
  constructor(online) {
    this.on = online; this.ui = online.ui;
    this.synced = false; this.q = null; this.qAt = 0; this.top = null; this.saveT = 0;
  }
  refresh() { if (this.ui.panel === 'online') this.ui.renderPanel(); }

  // ------------------------------------------------------------------ клуб
  /** Хаб відкрито: перший раз за запуск переносимо клуб (сервер бере base лише раз), далі підтягуємо його; плюс квести. */
  async open() {
    const f = await features(); if (!f.size) return;
    if (f.has('club')) {
      const r = this.synced ? await meOnServer() : await saveClub(toServer());
      const c = r && !r.error ? r.club || null : null;
      if (c && adoptServer(c, true)) { this.synced = true; this.on.sync(true); }
      if (r && r.quests) this.setQuests(r.quests);
    }
    if (f.has('quests') && !this.q) await this.loadQuests();
    if (f.has('top') && this.on.screen && this.on.screen.tab === 'top') await this.loadTop();
    this.refresh();
  }
  /** Вигляд чи тактика змінились: зберегти на сервері (лише числа беремо назад, щоб не затерти наступну правку). */
  dirty() {
    if (!has('club') || !this.synced) return;
    clearTimeout(this.saveT); this.pending = true;
    this.saveT = setTimeout(() => this.save(), SAVE_MS);
  }
  async save() { this.pending = false; const r = await saveClub(toServer()); if (r && r.club) adoptServer(r.club, false); }
  /** Правка складу ще чекає збереження: перед покупкою чи продажем зберегти зараз, щоб сервер бачив той самий склад. */
  async flush() { if (!this.pending) return; clearTimeout(this.saveT); await this.save(); }
  /** Сервер відмовив у дії: його клуб правильний, беремо весь. */
  async resync() { const r = await meOnServer(); if (r && r.club && adoptServer(r.club, true)) this.refresh(); }
  /** Тренування вже зроблено на пристрої (кнопка реагує одразу); сервер підтверджує ціну й навичку або повертає свій стан. */
  async train(i, k) {
    if (!has('club')) return;
    const e = allHeroes()[i];
    const r = await trainOnServer(i, k, e && e.id);
    if (!r) return;
    if (r.error) { this.ui.toast('Сервер не прийняв тренування'); return this.resync(); }
    if (Number.isFinite(r.coins)) OP.coins = r.coins;
    if (r.hero) adoptHero(i, r.hero);
    saveOP(); this.refresh();
  }
  /**
   * Скаут чи пак на сервері: героя випадково обирає сервер. Із лавою ('shop') новачок сідає на лаву — { hero, bench };
   * старий сервер без лави міняє героя на слоті i — { hero, replaced: true }. { error } — відмова, null — сервер недоступний.
   */
  async buy(kind, i) {
    if (!has('club')) return null;
    if (has('shop')) {
      await this.flush();
      const r = await buyOnServer(i, kind);
      if (!r) return null;
      if (r.error || !r.hero || !r.club) { if (r.error !== 'bench_full' && r.error !== 'no_coins') await this.resync(); return { error: r.error || 'server' }; }
      adoptServer(r.club, false);
      const j = OP.bench.findIndex((e) => e.id === r.hero.id);
      return j < 0 ? { error: 'server' } : { hero: OP.bench[j], bench: j };
    }
    const r = kind === 'scout' ? await scoutOnServer(i) : await packOnServer(i, kind);
    if (!r) return null;
    if (r.error === 'not_found') { this.ui.toast('Паки ще не підключені на сервері гри'); return { error: 'not_found' }; }
    if (r.error || !r.hero) { await this.resync(); return { error: r.error || 'server' }; }
    if (Number.isFinite(r.coins)) OP.coins = r.coins;
    adoptHero(i, r.hero); saveOP();
    return { hero: OP.heroes[i], replaced: true };
  }
  /** Продати героя з лави j на сервері: { gain } або { error }; null — сервер недоступний (тоді нічого не продаємо). */
  async sell(j) {
    const e = OP.bench[j]; if (!e) return { error: 'bad_hero' };
    await this.flush();
    const r = await sellOnServer(e.id);
    if (!r) return null;
    if (r.error || !r.club) { await this.resync(); return { error: r.error || 'server' }; }
    adoptServer(r.club, false);
    return { gain: +r.gain || 0 };
  }
  /** «Новий випадковий клуб» на сервері. null — сервера немає, тоді новий клуб робить пристрій. */
  async reset() {
    if (!has('club')) return null;
    const r = await resetOnServer();
    if (!r) return null;
    const c = r.club || r;
    return !r.error && adoptServer(c, true);
  }

  // ------------------------------------------------------------------ матч
  /** Квиток матчу від сервера: лише безпечні символи (він іде по P2P від суперника, тож перевіряємо). */
  static ticketOk(k) { return typeof k === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(k); }
  /**
   * Старт матчу на сервері. Господар: { matchId, ticket } — квиток сесія шле гостю ('mt'). Гість: передає отриманий квиток
   * і отримує matchId. null — сервера немає чи він відмовив: матч іде без серверного підрахунку.
   */
  start(code, role, mode, ticket) {
    if (!has('match')) return Promise.resolve(null);
    const body = role === 'guest' ? { role, mode, ticket } : { code, role, mode };
    return matchStart(body).then((r) => (r && !r.error && r.matchId ? r : null), () => null);
  }
  /** Звіт результату й очікування підтвердження: числа клубу й квести беремо з сервера. */
  async report(idP, r) {
    const id = await idP; if (!id) return;
    let s = await matchReport({ matchId: id, me: r.me, opp: r.opp, scorers: r.scorers || [], forfeit: r.forfeit || undefined, void: r.void || undefined });
    for (let i = 0; s && !s.error && s.state === 'wait' && i < POLL_N; i++) { await sleep(POLL_MS); s = await matchState(id); }
    if (!s || s.error || !s.state || s.state === 'wait') return;
    if (s.state === 'solo') {                                // суперник без сервера гри (поза Telegram): сервер матч не рахує, тож локальні нагороди одразу відкочуємо
      this.ui.toast('Матч не зараховано: суперник грає без входу через Telegram');
      return this.resync();
    }
    if (s.club) adoptServer(s.club, false);
    if (s.state === 'disputed') this.ui.toast('Рахунки в гравців не зійшлися: матч без рейтингу');
    else if (s.limited) this.ui.toast('Сьогодні вже 3 матчі з цим суперником: цей без рейтингу й квестів, лише 30 монет');   // сервер обмежує фарм однієї пари
    if (Array.isArray(s.quests) && s.quests.length) this.ui.toast('Квест виконано: ' + s.quests[0].t + '. Забери в хабі');
    if (has('quests')) await this.loadQuests();
    this.refresh();
  }

  // ------------------------------------------------------------------ квести
  questsOn() { return has('quests') && !!this.q; }
  async loadQuests() { const r = await serverQuests(); if (r && !r.error) this.setQuests(r); }
  setQuests(r) {
    if (!r || !r.day || !r.week) return;
    this.q = r; this.qAt = Date.now();
    const b = Array.isArray(r.banked) ? r.banked : [];
    if (b.length) { const sum = b.reduce((a, q) => a + (+q.c || 0), 0); this.ui.toast('Незабрані квести зараховано: +' + sum + ' монет'); this.q.banked = []; }
  }
  /** Квести для екрана: із сервера, якщо він їх веде, інакше з пристрою. Однакова будова: { day, week, left: { day, week } }. */
  view() {
    if (!this.questsOn()) return { ...questList(), left: questsLeft() };
    const q = this.q, gone = Date.now() - this.qAt;
    const list = (p, kind) => (Array.isArray(p.list) ? p.list : []).map((e, i) => {
      const n = Math.max(1, +e.n || 1), v = Math.min(n, +e.p || 0);
      return { kind, i, id: String(e.id), period: p.period, t: String(e.t || ''), n, c: +e.c || 0, p: v, got: !!e.got, done: v >= n };
    });
    return { day: list(q.day, 'day'), week: list(q.week, 'week'), left: { day: Math.max(0, (+q.day.left_ms || 0) - gone), week: Math.max(0, (+q.week.left_ms || 0) - gone) } };
  }
  ready() { if (!this.questsOn()) return questsReady(); const v = this.view(); return [...v.day, ...v.week].filter((e) => e.done && !e.got).length; }
  /** «Забрати»: на сервері — монети від нього; на пристрої — як раніше. Повертає монети або 0. */
  async claim(kind, i) {
    if (!this.questsOn()) return claimQuest(kind, i);
    const e = this.view()[kind === 'week' ? 'week' : 'day'][i];
    if (!e) return 0;
    const r = await claimOnServer(e.period, e.id);
    if (!r || r.error) { await this.loadQuests(); return 0; }
    if (Number.isFinite(r.total)) { OP.coins = r.total; saveOP(); }
    await this.loadQuests();
    return +r.coins || 0;
  }
  /** Набір змінився (північ за Києвом): перечитати. */
  rollover() { if (this.questsOn()) this.loadQuests().then(() => this.refresh()); else this.refresh(); }

  // ------------------------------------------------------------------ таблиця
  async loadTop() { const r = await topList(); if (r && !r.error && Array.isArray(r.list)) { this.top = r; } }
}
