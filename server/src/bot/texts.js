// Тексти бота гри: меню, команди, описи для профілю бота. Усе українською, розмітка HTML Bot API.

export const COMMANDS = [
  { command: 'play', description: 'Грати' },
  { command: 'club', description: 'Мій онлайн-клуб' },
  { command: 'top', description: 'Рейтинг гравців' },
  { command: 'challenge', description: 'Кинути виклик другу' },
  { command: 'help', description: 'Як грати' },
];
export const COMMANDS_EN = [
  { command: 'play', description: 'Play' },
  { command: 'club', description: 'My online club' },
  { command: 'top', description: 'Leaderboard' },
  { command: 'challenge', description: 'Challenge a friend' },
  { command: 'help', description: 'How to play' },
];

export const SHORT = "3D-футбол за ФК Локомотив Київ: кар'єра, пенальті, стадіон і онлайн-матчі з друзями.";
export const SHORT_EN = '3D football for FC Lokomotyv Kyiv: career, penalties, a stadium and online matches with friends.';
export const DESCRIPTION = [
  'LOKO RUSH — 3D-футбольна аркада за ФК Локомотив Київ ⚽️',
  '',
  "🏆 Кар'єра від Другої ліги до Чемпіонату світу",
  '🛡 Власний онлайн-клуб з героями й рейтингом',
  '⚔️ Матчі з друзями за кодом кімнати',
  '',
  'Натисни «Почати», а потім «Грати». Гра горизонтальна: поверни телефон.',
  'Фанатський неофіційний проєкт.',
].join('\n');
export const DESCRIPTION_EN = [
  'LOKO RUSH is a 3D football arcade for FC Lokomotyv Kyiv ⚽️',
  '',
  '🏆 A career from the Second League to the World Cup',
  '🛡 Your own online club with heroes and a rating',
  '⚔️ Matches with friends by room code',
  '',
  'Tap Start, then Play. The game is landscape: turn your phone.',
  'An unofficial fan project.',
].join('\n');

export const MENU_BUTTON = '⚽️ Грати';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const welcome = (name) => [
  `<b>Привіт, ${esc(name || 'гравцю')}!</b> Це <b>LOKO RUSH</b> — 3D-футбол за ФК Локомотив Київ ⚽️`,
  '',
  "🏆 Кар'єра від Другої ліги до Чемпіонату світу",
  '🛡 Онлайн-клуб: 11 героїв, рівень, рейтинг і монети',
  '⚔️ Матчі з друзями: кинь виклик у будь-який чат',
  '',
  '<i>Гра горизонтальна: поверни телефон 📱↔️</i>',
].join('\n');

export const HELP = [
  '<b>Як грати в LOKO RUSH</b>',
  '',
  '<b>Керування.</b> Притисни палець біля м’яча й відтягни назад: пунктир покаже відскоки від бортів. Відпусти — удар, довжина відтягування задає силу. Слабкий удар стає пасом партнерові.',
  '',
  "<b>Кар'єра.</b> Веди «Локомотив» із Другої ліги вгору: перемоги дають монети, монети — трансфери, тренування й стадіон.",
  '',
  '<b>Онлайн.</b> У грі відкрий «Онлайн» → «Створити кімнату» → «Посилання»: у вибраний чат піде картка виклику з кодом, і друг зайде одним дотиком.',
  '',
  '<b>Клуб і рейтинг.</b> /club — твій онлайн-клуб, /top — найкращі гравці.',
  '',
  '<i>Прогрес зберігається в Telegram і переходить між твоїми пристроями.</i>',
].join('\n');

export const CHALLENGE_HOW = [
  '<b>Виклик на матч ⚔️</b>',
  '',
  '1. Відкрий гру → «Онлайн» → «Створити кімнату».',
  '2. Натисни «Посилання»: Telegram запропонує чат, і туди піде картка виклику з кодом кімнати.',
  '',
  'Або натисни кнопку нижче й вибери чат: друг отримає запрошення в гру.',
].join('\n');

export const NO_CLUB = [
  '<b>Онлайн-клубу ще немає</b> 🛡',
  '',
  'Відкрий гру → «Онлайн»: клуб створиться сам, з назвою, прапором і 11 героями. Потім /club покаже його тут.',
].join('\n');

const RARITY = { c: '⚪️', r: '🔵', e: '🟣', l: '🟡' };

/** Картка клубу текстом: для клієнтів без віджетів і як підпис до віджета. */
export function clubText(card) {
  if (!card.n) return NO_CLUB;
  const [w, d, l] = card.rec || [0, 0, 0];
  const lines = [
    `🛡 <b>${esc(card.n)}</b> · ${esc(card.ci)}`,
    `Рівень ${card.l} · ${card.k ? `#${card.k} у рейтингу` : 'без місця в рейтингу'}`,
    '',
    `📈 Рейтинг: <b>${card.r}</b>`,
    `🪙 Монети: <b>${card.co}</b>`,
    `⚽️ Матчі: ${w} перемог, ${d} нічиїх, ${l} поразок`,
  ];
  if (card.h && card.h.length) {
    lines.push('', '<b>Зірки складу</b>');
    for (const [name, rar, o, trait] of card.h) lines.push(`${RARITY[rar] || '⚪️'} ${esc(name)} — <b>${o}</b>${trait ? ` · ${esc(trait)}` : ''}`);
  }
  return lines.join('\n');
}

export const clubCaption = (card) => (card.n ? `🛡 ${card.n} · ${card.ci} · рейтинг ${card.r}` : '🛡 Онлайн-клубу ще немає');

export function topText(top, me) {
  const medal = ['🥇', '🥈', '🥉'];
  const lines = ['🏆 <b>Рейтинг LOKO RUSH</b>', ''];
  if (!top.top.length) lines.push('Ще ніхто не зіграв онлайн. Будь першим!');
  top.top.forEach(([p, club, r], i) => lines.push(`${medal[i] || `${i + 1}.`} ${esc(p)} · <i>${esc(club)}</i> — <b>${r}</b>`));
  if (me && me.k) lines.push('', `Твоє місце: <b>#${me.k}</b> · ${me.r}`);
  if (top.n) lines.push('', `<i>Гравців: ${top.n}</i>`);
  return lines.join('\n');
}

export const duelText = (d) => [
  '⚔️ <b>Виклик на матч у LOKO RUSH</b>',
  '',
  `${esc(d.p || 'Гравець')}${d.n ? ` (${esc(d.n)}, рейтинг ${d.r})` : ''} кличе на онлайн-матч.`,
  d.code ? `Код кімнати: <code>${esc(d.code)}</code>` : '',
].filter(Boolean).join('\n');
export const duelCaption = (d) => `⚔️ Виклик на матч від ${d.p || 'гравця'}${d.code ? ` · кімната ${d.code}` : ''}`;
