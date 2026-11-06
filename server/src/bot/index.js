// Бот гри в Telegram: меню, картка клубу, рейтинг, виклики на матч (inline-режим) і HTML-віджети в повідомленнях.
// Віджети (Bot API 10.4, sendWidget) — головний вигляд; де Bot API чи клієнт їх не вміє, ті самі дані йдуть текстом.
import { readFileSync, existsSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { createApi, isUnknownMethod, isNotModified, TgError } from './api.js';
import * as T from './texts.js';

const W = (f) => readFileSync(new URL(`./widgets/${f}`, import.meta.url), 'utf8');
export const WIDGETS = { club: W('club.html'), duel: W('duel.html'), top: W('top.html') };

const UPDATES = ['message', 'callback_query', 'inline_query', 'widget_query', 'shared_widget_query'];
const WIDGETS_RETRY_MS = 3600e3;           // Bot API без віджетів: пробуємо знову за годину
const USER_GAP_MS = 700;                   // не частіше дії на користувача: захист від флуду кнопками
const ROOM = /\b([A-HJ-NP-Z2-9]{5})\b/;    // алфавіт кодів кімнат гри (без 0/O, 1/I)
const SETUP_VERSION = 1;

const cut = (s, n) => String(s ?? '').slice(0, n);
const hhmm = (ms) => new Date(ms).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' });
const nameOf = (u) => cut([u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Гравець', 40);

/** Секрет вебхука з токена бота: окремого налаштування не треба, а чужий запит на /tg без нього не пройде. */
export const hookSecret = (token) => createHmac('sha256', 'loko-webhook').update(token).digest('hex').slice(0, 48);

export function createBot({ db, config, rules, api = createApi(config.botToken, config.botApiUrl), log = console, now = () => Date.now() }) {
  const q = {
    kvGet: db.prepare('SELECT v FROM kv WHERE k = ?'),
    kvSet: db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'),
    club: db.prepare('SELECT c.data, c.coins, c.rating, c.lvl, p.name FROM clubs c JOIN players p ON p.id = c.player_id WHERE c.player_id = ?'),
    above: db.prepare('SELECT COUNT(*) AS n FROM clubs c JOIN players p ON p.id = c.player_id WHERE p.banned = 0 AND c.rating > ?'),
    top: db.prepare(`SELECT p.name, c.data, c.rating FROM clubs c JOIN players p ON p.id = c.player_id WHERE p.banned = 0
      ORDER BY c.rating DESC, c.lvl DESC, c.updated_at ASC LIMIT 10`),
    count: db.prepare('SELECT COUNT(*) AS n FROM clubs c JOIN players p ON p.id = c.player_id WHERE p.banned = 0'),
  };
  const kv = { get: (k) => q.kvGet.get(k)?.v ?? null, set: (k, v) => q.kvSet.run(k, String(v)) };
  let me = null;                             // getMe: username для посилань
  let widgetsOffUntil = config.widgets ? 0 : Infinity;
  const lastAct = new Map();

  const link = (start = '') => `https://t.me/${me.username}?startapp${start ? '=' + start : ''}`;
  const widgetsOn = () => now() >= widgetsOffUntil;
  const playButton = (chat) => (chat && chat.type === 'private'
    ? { text: '⚽️ Грати', web_app: { url: config.gameUrl } }
    : { text: '⚽️ Грати', url: link() });
  const menu = (chat) => ({ inline_keyboard: [
    [playButton(chat)],
    [{ text: '🛡 Мій клуб', callback_data: 'club' }, { text: '🏆 Рейтинг', callback_data: 'top' }],
    [{ text: '⚔️ Кинути виклик другу', switch_inline_query_chosen_chat: { query: '', allow_user_chats: true, allow_group_chats: true } }],
    [{ text: '❓ Як грати', callback_data: 'help' }],
  ] });
  const backTo = (chat) => ({ inline_keyboard: [[playButton(chat)], [{ text: '‹ Меню', callback_data: 'menu' }]] });

  // ------------------------------------------------------------------ дані
  /** Картка клубу гравця (≤1 КБ JSON, чатовий стан віджета). */
  function card(userId, fallbackName) {
    const row = q.club.get(userId);
    const base = { p: cut(row?.name || fallbackName, 32), b: me.username };
    if (!row) return base;
    let d = {};
    try { d = JSON.parse(row.data); } catch (_) { /* битий запис: показуємо, що є */ }
    const c = (d.club && d.club.flag && d.club.flag.c) || [];
    const heroes = Array.isArray(d.heroes) ? d.heroes : [];
    const h = heroes.map((e) => [cut(e.name, 20), e.rar || 'c', safeOvr(e), cut(rules.TRAITS[e.trait]?.name || '', 12)])
      .sort((a, b) => b[2] - a[2]).slice(0, 3);
    const rec = d.rec || {};
    return { ...base, n: cut(d.club?.name || 'КЛУБ', 20), ci: cut(d.club?.city || '', 20), c: c.slice(0, 3),
      l: row.lvl, r: row.rating, co: row.coins, rec: [rec.w | 0, rec.d | 0, rec.l | 0], k: q.above.get(row.rating).n + 1, h };
  }
  function safeOvr(e) { try { return rules.ovr(e) | 0; } catch (_) { return 0; } }

  function topData() {
    const top = q.top.all().map((r) => {
      let d = {};
      try { d = JSON.parse(r.data); } catch (_) { /* ignore */ }
      return [cut(r.name, 24), cut(d.club?.name || '', 20), r.rating, d.club?.flag?.c?.[0] || '#888888'];
    });
    return { top, n: q.count.get().n, t: hhmm(now()) };
  }

  // ------------------------------------------------------------------ надсилання
  function widgetFailed(e) {
    if (isUnknownMethod(e)) { widgetsOffUntil = now() + WIDGETS_RETRY_MS; log.warn('Bot API без віджетів: поки шлемо текстом'); return true; }
    if (e instanceof TgError && /WIDGET|not supported|unsupported/i.test(e.description)) { log.warn('Віджет не пройшов:', e.description); return true; }
    return false;
  }
  /** Віджет або, якщо не вийшло, запасний варіант. */
  async function widgetOr(fields, fallback) {
    if (widgetsOn()) {
      try { return await api('sendWidget', fields); } catch (e) { if (!widgetFailed(e)) throw e; }
    }
    return fallback();
  }
  const say = (chat, text, reply_markup) => api('sendMessage', { chat_id: chat.id, text, parse_mode: 'HTML', reply_markup, link_preview_options: { is_disabled: true } });

  async function sendWelcome(chat, from) {
    const caption = T.welcome(from.first_name), reply_markup = menu(chat);
    const cached = kv.get('cover');
    try {
      if (cached) return await api('sendPhoto', { chat_id: chat.id, photo: cached, caption, parse_mode: 'HTML', reply_markup });
      if (existsSync(config.coverFile)) {
        const m = await api.upload('sendPhoto', 'photo', config.coverFile, { chat_id: String(chat.id), caption, parse_mode: 'HTML', reply_markup });
        const id = m.photo && m.photo.at(-1).file_id;
        if (id) kv.set('cover', id);
        return m;
      }
    } catch (e) { log.warn('Обкладинка не надіслалась:', e.message); if (cached) kv.set('cover', ''); }
    return say(chat, caption, reply_markup);
  }

  async function sendClub(chat, from) {
    const c = card(from.id, nameOf(from));
    return widgetOr(
      { chat_id: chat.id, html: WIDGETS.club, chat_data: JSON.stringify(c), caption: T.clubCaption(c), allow_queries: true, reply_markup: c.n ? undefined : backTo(chat) },
      () => say(chat, T.clubText(c), backTo(chat)),
    );
  }

  async function sendTop(chat, from) {
    const data = topData(), c = card(from.id, nameOf(from));
    const mine = c.n ? JSON.stringify({ k: c.k, r: c.r, n: c.n }) : undefined;
    const fallback = () => say(chat, T.topText(data, c.n ? c : null), backTo(chat));
    if (!widgetsOn()) return fallback();
    const pub = JSON.stringify({ ...data, r: Number(kv.get('topRev') || 0) + 1 });
    let id = kv.get('topWidget');
    try {
      if (id) {
        // спільний рейтинг: один віджет на всіх, кожна копія бачить свіжі дані
        if (kv.get('topBody') !== JSON.stringify(data.top) || kv.get('topN') !== String(data.n)) {
          await api('editSharedWidgetData', { widget_id: id, public_data: pub, cache_time: 60 }).catch((e) => { if (!isNotModified(e)) throw e; });
          kv.set('topRev', Number(kv.get('topRev') || 0) + 1); kv.set('topBody', JSON.stringify(data.top)); kv.set('topN', data.n);
        }
        return await api('sendSharedWidget', { chat_id: chat.id, widget_id: id, ...(mine ? { chat_data: mine } : {}) });
      }
    } catch (e) {
      if (widgetFailed(e)) return fallback();
      log.warn('Спільний рейтинг недоступний, створюю новий:', e.message);
    }
    const m = await widgetOr({ chat_id: chat.id, html: WIDGETS.top, is_shared: true, public_data: pub, caption: '🏆 Рейтинг LOKO RUSH', ...(mine ? { chat_data: mine } : {}) }, fallback);
    if (m && m.widget && m.widget.id) {
      kv.set('topWidget', m.widget.id); kv.set('topRev', JSON.parse(pub).r); kv.set('topBody', JSON.stringify(data.top)); kv.set('topN', data.n);
    }
    return m;
  }

  // ------------------------------------------------------------------ inline-режим: виклики й картки в будь-який чат
  function duelOf(from, code) {
    const c = card(from.id, nameOf(from));
    return { p: c.p, n: c.n, c: c.c, r: c.r, code, t: code ? hhmm(now()) : undefined, b: me.username };
  }
  async function onInline(iq) {
    const code = (String(iq.query || '').toUpperCase().match(ROOM) || [])[1] || '';
    const d = duelOf(iq.from, code), c = card(iq.from.id, nameOf(iq.from));
    const thumb = { thumbnail_url: config.gameUrl.replace(/\/?$/, '/') + 'icon-192.png', thumbnail_width: 192, thumbnail_height: 192 };
    const accept = { inline_keyboard: [[{ text: code ? '⚔️ Прийняти виклик' : '⚽️ Грати в LOKO RUSH', url: link(code ? 'room_' + code : '') }]] };
    const results = [];
    if (widgetsOn()) {
      results.push({ type: 'article', id: 'wd' + code, title: code ? `⚔️ Виклик: кімната ${code}` : '⚔️ Кинути виклик', description: 'Картка виклику: друг зайде одним дотиком', ...thumb,
        input_message_content: { html: WIDGETS.duel, public_data: JSON.stringify(d), caption: T.duelCaption(d) } });
      if (c.n) results.push({ type: 'article', id: 'wc', title: `🛡 Мій клуб: ${c.n}`, description: `Рейтинг ${c.r} · рівень ${c.l}`, ...thumb,
        input_message_content: { html: WIDGETS.club, chat_data: JSON.stringify(c), public_data: JSON.stringify(c), caption: T.clubCaption(c) } });
    }
    results.push({ type: 'article', id: 'td' + code, title: code ? `Виклик текстом: ${code}` : 'Запрошення текстом', description: 'Для старих версій Telegram', ...thumb,
      input_message_content: { message_text: T.duelText(d), parse_mode: 'HTML' }, reply_markup: accept });
    try {
      await api('answerInlineQuery', { inline_query_id: iq.id, results, cache_time: 10, is_personal: true });
    } catch (e) {
      // сервер без віджетів у inline: лишаємо текстові
      if (results.length > 1 && e instanceof TgError && e.code === 400) {
        widgetsOffUntil = now() + WIDGETS_RETRY_MS;
        log.warn('Inline-віджети не прийнято:', e.description);
        await api('answerInlineQuery', { inline_query_id: iq.id, results: results.filter((r) => r.reply_markup), cache_time: 10, is_personal: true });
      } else throw e;
    }
  }

  /** Готове повідомлення для Telegram.WebApp.shareMessage: картка виклику (віджет або текст із кнопкою). */
  async function prepareRoom(user, code) {
    if (!me) me = await api('getMe');
    const d = duelOf(user, code);
    const where = { user_id: user.id, allow_user_chats: true, allow_group_chats: true };
    const text = { type: 'article', id: 'r' + code, title: `Виклик: кімната ${code}`, input_message_content: { message_text: T.duelText(d), parse_mode: 'HTML' },
      reply_markup: { inline_keyboard: [[{ text: '⚔️ Прийняти виклик', url: link('room_' + code) }]] } };
    if (widgetsOn()) {
      try {
        const r = await api('savePreparedInlineMessage', { ...where, result: { type: 'article', id: 'w' + code, title: `Виклик: кімната ${code}`,
          input_message_content: { html: WIDGETS.duel, public_data: JSON.stringify(d), caption: T.duelCaption(d) } } });
        return r.id;
      } catch (e) { if (!(e instanceof TgError && e.code === 400) && !widgetFailed(e)) throw e; log.warn('Картка-віджет для shareMessage не пройшла:', e.message); }
    }
    try { return (await api('savePreparedInlineMessage', { ...where, result: text })).id; } catch (e) { log.warn('savePreparedInlineMessage:', e.message); return null; }
  }

  // ------------------------------------------------------------------ запити віджетів
  async function onWidgetQuery(wq, fromCopy) {
    let data = { err: 'unknown' };
    if (!fromCopy && wq.data === 'me') data = card(wq.from.id, nameOf(wq.from));
    await api('answerWidgetQuery', { widget_query_id: wq.id, data: JSON.stringify(data) });
  }

  // ------------------------------------------------------------------ повідомлення й кнопки
  async function onMessage(m) {
    const chat = m.chat, from = m.from || {};
    const [cmd0, arg = ''] = String(m.text || '').trim().split(/\s+/, 2);
    const cmd = cmd0.split('@')[0].toLowerCase();
    if (cmd === '/start') {
      const room = /^room_([A-Za-z0-9]{5})$/.exec(arg);
      if (room) return say(chat, `⚔️ Тебе кличуть у кімнату <code>${T.esc(room[1].toUpperCase())}</code>`, { inline_keyboard: [[{ text: '⚽️ Зайти в кімнату', url: link('room_' + room[1].toUpperCase()) }]] });
      return sendWelcome(chat, from);
    }
    if (cmd === '/play') return say(chat, '⚽️ <b>LOKO RUSH</b>: поверни телефон горизонтально й тисни «Грати»', { inline_keyboard: [[playButton(chat)]] });
    if (cmd === '/club' || cmd === '/profile') return sendClub(chat, from);
    if (cmd === '/top') return sendTop(chat, from);
    if (cmd === '/help') return say(chat, T.HELP, backTo(chat));
    if (cmd === '/challenge') return say(chat, T.CHALLENGE_HOW, { inline_keyboard: [[{ text: '⚔️ Вибрати чат', switch_inline_query_chosen_chat: { query: '', allow_user_chats: true, allow_group_chats: true } }]] });
    if (chat.type === 'private' && !cmd.startsWith('/')) return say(chat, 'Обери, що робимо 👇', menu(chat));
    return null;
  }

  async function onCallback(cq) {
    const chat = cq.message && cq.message.chat;
    await api('answerCallbackQuery', { callback_query_id: cq.id }).catch(() => {});
    if (!chat) return;
    if (cq.data === 'club') return sendClub(chat, cq.from);
    if (cq.data === 'top') return sendTop(chat, cq.from);
    if (cq.data === 'help') return say(chat, T.HELP, backTo(chat));
    if (cq.data === 'menu') return say(chat, 'Обери, що робимо 👇', menu(chat));
  }

  /** Одне оновлення від Telegram. Помилки не виходять назовні: вебхук завжди відповідає 200. */
  async function handle(u) {
    const who = (u.message || u.callback_query || u.inline_query || {}).from;
    if (who && !u.inline_query) {
      const t = now(), last = lastAct.get(who.id) || 0;
      if (t - last < USER_GAP_MS) { if (u.callback_query) await api('answerCallbackQuery', { callback_query_id: u.callback_query.id }).catch(() => {}); return; }
      lastAct.set(who.id, t);
      if (lastAct.size > 5000) lastAct.clear();
    }
    try {
      if (!me) me = await api('getMe');
      if (u.message) await onMessage(u.message);
      else if (u.callback_query) await onCallback(u.callback_query);
      else if (u.inline_query) await onInline(u.inline_query);
      else if (u.widget_query) await onWidgetQuery(u.widget_query, false);
      else if (u.shared_widget_query) await onWidgetQuery(u.shared_widget_query, true);
    } catch (e) { log.error('Бот:', e.message); }
  }

  /** Профіль бота: команди, описи, кнопка меню; вебхук або опитування. Описи шлемо лише коли змінились. */
  async function setup() {
    me = await api('getMe');
    const sig = JSON.stringify([SETUP_VERSION, T.COMMANDS, T.SHORT, T.DESCRIPTION, config.gameUrl]);
    if (kv.get('setup') !== sig) {
      await api('setMyCommands', { commands: T.COMMANDS });
      await api('setMyCommands', { commands: T.COMMANDS_EN, language_code: 'en' });
      await api('setMyDescription', { description: T.DESCRIPTION });
      await api('setMyDescription', { description: T.DESCRIPTION_EN, language_code: 'en' });
      await api('setMyShortDescription', { short_description: T.SHORT });
      await api('setMyShortDescription', { short_description: T.SHORT_EN, language_code: 'en' });
      await api('setChatMenuButton', { menu_button: { type: 'web_app', text: T.MENU_BUTTON, web_app: { url: config.gameUrl } } });
      kv.set('setup', sig);
    }
    if (config.publicUrl) {
      const hook = { url: config.publicUrl.replace(/\/+$/, '') + '/tg', secret_token: hookSecret(config.botToken), max_connections: 10 };
      try { await api('setWebhook', { ...hook, allowed_updates: UPDATES }); } catch (e) {
        log.warn('Вебхук з оновленнями віджетів не прийнято, без них:', e.message);
        await api('setWebhook', { ...hook, allowed_updates: UPDATES.slice(0, 3) });
      }
    }
    log.log(`Бот @${me.username}: ${config.publicUrl ? 'вебхук' : 'опитування'}, віджети ${widgetsOn() ? 'увімкнені' : 'вимкнені'}`);
    return me;
  }

  /** Без публічної адреси (локально): довге опитування. Повертає функцію зупинки. */
  function poll() {
    let stop = false, offset = 0;
    (async () => {
      await api('deleteWebhook', {}).catch(() => {});
      while (!stop) {
        try {
          const ups = await api('getUpdates', { offset, timeout: 50, allowed_updates: UPDATES });
          for (const u of ups) { offset = u.update_id + 1; await handle(u); }
        } catch (e) { log.warn('getUpdates:', e.message); await new Promise((r) => setTimeout(r, 5000)); }
      }
    })();
    return () => { stop = true; };
  }

  return { handle, setup, poll, prepareRoom, card, topData, secret: hookSecret(config.botToken) };
}
