// Стан пака-потяга без three: ui.js питає, чи потяг закриває екран, і передає йому «назад». Сам потяг (packtrain.js) з three
// вантажиться лише при відкритті пака, а цей модуль — разом із грою.
let cur = null;
/** Потяг, що зараз на екрані (packtrain.js ставить і знімає). */
export const setTrain = (t) => { cur = t; };
export const getTrain = () => cur;
/** Кнопка «назад» Telegram і Esc: поки потяг їде — пропуск. Коли герой уже вийшов, false: далі закриває той, хто відкрив (онлайн-хаб — close-reveal і close()). */
export function trainBack() { if (!cur || cur.closing || cur.ended) return false; cur.skipNow(); return true; }
/** Шар потяга закриває екран: головний цикл гри не малює (ui.panelCovers). */
export function trainCovers() { return !!(cur && cur.opaque); }
