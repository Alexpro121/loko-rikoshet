// Склад: реальний ROSTER, навички, рівні, заміни, тренування, склади суперників (oppSquad).
import { S, commit } from './save.js';
import { ACADEMY, FORMATIONS, KITS, STAT_KEYS, GK_KEYS, LINE_OF, pickKit, heatOf } from '../config.js';
import { striker, keeper, keeperTier } from './economy.js';
import { rng } from '../graphics/voxel.js';
import { rivalOf, hashStr } from './rivals.js';

/** Характеристики гравців: власні навички й інтелект, що справді впливають на гру й розвиваються. */
export { STAT_KEYS, GK_KEYS };
export const STAT_NAMES = { pace: 'Швидкість', shoot: 'Удар', pass: 'Пас', drib: 'Ведення', tack: 'Відбір', iq: 'Інтелект', react: 'Реакція', reach: 'Досяжність', hands: 'Ловля' };
export const STAT_HINT = {
  pace: 'біжить швидше', shoot: 'сильніший і точніший удар', pass: 'точніші передачі', drib: 'легше приймає й важче відібрати',
  tack: 'частіше відбирає й вибиває підкатом', iq: 'краще читає гру й обирає рішення', react: 'встигає стрибнути в куток', reach: 'довші руки й ширший стрибок', hands: 'ловить сильніші удари',
};
export const keysFor = (line) => (line === 'G' ? GK_KEYS : STAT_KEYS);
export const ROLE_UA = { GK: 'Воротар', LB: 'Лівий захисник', RB: 'Правий захисник', CB: 'Центральний захисник', DM: 'Опорний півзахисник', CM: 'Півзахисник', AM: 'Атакувальний півзахисник', LM: 'Лівий півзахисник', RM: 'Правий півзахисник', LW: 'Лівий фланг', RW: 'Правий фланг', ST: 'Нападник' };

const BIAS = {
  D: { pace: 2, shoot: -12, pass: 0, drib: -4, tack: 14, iq: 6 },
  M: { pace: 0, shoot: -2, pass: 12, drib: 6, tack: 2, iq: 8 },
  W: { pace: 14, shoot: 2, pass: 2, drib: 12, tack: -10, iq: -2 },
  F: { pace: 8, shoot: 14, pass: -2, drib: 8, tack: -14, iq: 2 },
  G: { react: 12, reach: 8, hands: 10, pass: -4, iq: 4 },
};
const WEIGHT = {
  D: { pace: 0.15, shoot: 0.03, pass: 0.12, drib: 0.1, tack: 0.35, iq: 0.25 },
  M: { pace: 0.1, shoot: 0.12, pass: 0.3, drib: 0.2, tack: 0.1, iq: 0.18 },
  W: { pace: 0.28, shoot: 0.17, pass: 0.1, drib: 0.3, tack: 0.02, iq: 0.13 },
  F: { pace: 0.2, shoot: 0.36, pass: 0.06, drib: 0.2, tack: 0.02, iq: 0.16 },
  G: { react: 0.34, reach: 0.2, hands: 0.26, pass: 0.05, iq: 0.15 },
};
/** Борода: 0 нема, 1 щетина, 2 вуса, 3 повна. */
const pickBeard = (rnd) => { const r = rnd(); return r < 0.58 ? 0 : r < 0.76 ? 1 : r < 0.86 ? 2 : 3; };
export const myKit = () => (KITS[S.kitId] || KITS.home).kit;
/** Форма на матч із цим клубом: обрана гравцем, а якщо вона зливається з формою суперника, інша з комплектів. S.kitId не змінюється. */
export const matchKit = (club) => pickKit(myKit(), club && club.kit, Object.values(KITS).map((k) => k.kit));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function makeStats(line, base, rnd = Math.random, spread = 7) {
  const st = {};
  for (const k of keysFor(line)) st[k] = clamp(Math.round(base + (BIAS[line][k] || 0) + (rnd() * 2 - 1) * spread), 8, 99);
  return st;
}
export function ovr(e) {
  const w = WEIGHT[e.line] || WEIGHT.M; let s = 0, t = 0;
  for (const k of keysFor(e.line)) { s += (e.stats[k] || 0) * w[k]; t += w[k]; }
  return Math.round(s / t);
}
export const xpNeed = (lvl) => 50 + 30 * (lvl - 1);
/** Ціна +1 до навички: 50 → ~180, 60 → ~570, 70 → ~1770, 80 → ~5500 монет (при 1.17 було 370, 1780, 8550, 41000: тренування не рухало склад). */
export const trainCost = (v) => Math.max(25, Math.round(30 * Math.pow(1.12, v - 34)));
export const tierOf = (o) => (o >= 80 ? 'gold' : o >= 62 ? 'silver' : 'bronze');

const FIRST_UA = ACADEMY.firstNames, LAST_UA = ACADEMY.lastNames;
const FIRST_INT = ['Лука', 'Марко', 'Томас', 'Карлос', 'Дієго', 'Адам', 'Лео', 'Маттео', 'Яспер', 'Жуан', 'Олів’є', 'Рафаел'];
const LAST_INT = ['Россі', 'Мюллер', 'Гарсія', 'Сілва', 'Леоне', 'Вебер', 'Мартінес', 'Пейн', 'Дюран', 'Лопес', 'Бергер', 'Фернандес'];

export function newEntry(role, idx, rnd, base, names = 'ua') {
  const pick = (a) => a[(rnd() * a.length) | 0];
  const line = role.name === 'GK' ? 'G' : role.line;
  return {
    id: 'p' + idx + Math.floor(rnd() * 1e6), role: role.name, line, num: role.num,
    name: names === 'ua' ? pick(FIRST_UA) + ' ' + pick(LAST_UA) : pick(FIRST_INT) + ' ' + pick(LAST_INT),
    stats: makeStats(line, base, rnd), xp: 0, lvl: 1, apps: 0, goals: 0,
    skin: pick(ACADEMY.skins), hair: pick(ACADEMY.hairs), hairCol: pick(ACADEMY.hairCols), beard: pickBeard(rnd),
  };
}

const GK_ROLE = { name: 'GK', line: 'G', num: 1 };

/** Реальний склад ФК «Локомотив» Київ: [номер, ім'я та прізвище, природна позиція]. Номери без підтвердження (8, 11, 14) призначені умовно. */
export const ROSTER = [
  [1, 'Роман Льопка', 'GK'], [12, 'Арсен Беліменко', 'GK'], [71, 'Максим Карпенко', 'GK'],
  [3, 'Роман Савченко', 'LB'], [5, 'Микола Сираш', 'CB'], [18, 'Денис Гаркавенко', 'CB'], [32, 'Даніїл Романенко', 'CB'],
  [44, 'Тимур Тітаренко', 'CB'], [99, 'Євгеній Ярмак', 'CB'], [19, 'Руслан Ткаченко', 'RB'], [16, 'Ілля Засовицький', 'LB'],
  [6, 'Артем Сабалаєв', 'DM'], [9, 'Богдан Мануйлов', 'CM'], [90, 'Петро Савчук', 'CM'], [77, 'Олександр Савчук', 'CM'],
  [8, 'Володимир Чернецький', 'CM'], [14, 'Данило Костиря', 'DM'],
  [33, 'Сергій М’якушко', 'ST'], [10, 'Данило Голуб', 'LW'], [11, 'Володимир Тименко', 'RW'],
];
/** Хто виходить у стартовому складі: слот розстановки 4-3-3 -> номер гравця. */
const STARTERS = [1, 3, 5, 32, 19, 90, 6, 9, 10, 33, 11];

function rosterEntry(r, idx, rnd, base, slot) {
  const [num, name, pos] = r;
  const line = LINE_OF[pos];
  const pick = (a) => a[(rnd() * a.length) | 0];
  return {
    id: 'r' + num, role: slot ? slot.name : pos, pos, line: slot ? (slot.name === 'GK' ? 'G' : slot.line) : line, num, name, real: true,
    stats: makeStats(slot ? (slot.name === 'GK' ? 'G' : slot.line) : line, base, rnd), xp: 0, lvl: 1, apps: 0, goals: 0,
    skin: pick(ACADEMY.skins), hair: pick(ACADEMY.hairs), hairCol: pick(ACADEMY.hairCols), beard: pickBeard(rnd),
  };
}

/** Початковий склад: 11 у стартовому складі за розстановкою 4-3-3 і 9 у запасі (реальні гравці). */
export function defaultSquad() {
  const rnd = rng(77), slots = [GK_ROLE, ...FORMATIONS['433']];
  const byNum = new Map(ROSTER.map((r) => [r[0], r]));
  const squad = slots.map((slot, i) => rosterEntry(byNum.get(STARTERS[i]), i, rnd, 40, slot));
  const bench = ROSTER.filter((r) => !STARTERS.includes(r[0])).map((r, i) => rosterEntry(r, 20 + i, rnd, 34));
  return { squad, bench };
}

export function ensureSquad() {
  const ok = Array.isArray(S.squad) && S.squad.length === 11 && S.squad[0] && S.squad[0].stats;
  if (!ok) { const d = defaultSquad(); S.squad = d.squad; S.bench = d.bench; commit(); return; }
  const legacy = (e) => !e.real && !String(e.id).startsWith('g');                // випускник (g…) міг лишитись без позначки, але він справжній
  if (S.squad.some(legacy) || !Array.isArray(S.bench)) {
    // старий збережений склад: залишаємо навички й досвід, але даємо реальні імена та номери; наявний запас не чіпаємо
    const d = defaultSquad();
    S.squad = S.squad.map((e, i) => { if (!legacy(e)) return e; const t = d.squad[i]; return { ...e, id: t.id, name: t.name, num: t.num, pos: t.pos, real: true, skin: t.skin, hair: t.hair, hairCol: t.hairCol }; });
    const ids = new Set(S.squad.map((e) => e.id));
    S.bench = (Array.isArray(S.bench) ? S.bench : d.bench).filter((e) => !ids.has(e.id)); commit();
  }
}

/** Усі гравці клубу: спершу основа, потім запас. */
export const allPlayers = () => [...S.squad, ...(S.bench || [])];

/** Міняє гравця з основи на запасного: новачок займає роль слота, замінений повертається на лаву зі своєю природною позицією. */
export function swapPlayers(slot, benchIdx) {
  const out = S.squad[slot], inn = S.bench[benchIdx];
  if (!out || !inn || (out.line === 'G') !== (inn.line === 'G')) return false;   // польовий будь-куди (рейтинг сам покаже чужу лінію), воротар лише на воротаря
  const slotRole = out.role, slotLine = out.line;
  inn.role = slotRole; inn.line = slotLine;
  out.role = out.pos || out.role; out.line = LINE_OF[out.role] || out.line;
  S.squad[slot] = inn; S.bench[benchIdx] = out;
  commit();
  return true;
}

/** Схеми клубу в кар'єрі. */
export const CAREER_FORMS = ['433', '442', '4231', '4141', '352', '343', '532'];
/** Нова схема: гравці лишаються на номерах слотів і грають ролі нової схеми; природна позиція pos не міняється. */
function relabelSquad() {
  const roles = FORMATIONS[S.tactic] || FORMATIONS['433'];
  S.squad.forEach((e, i) => { if (i) { e.role = roles[i - 1].name; e.line = roles[i - 1].line; } });
}
export function setTactic(f) { if (!CAREER_FORMS.includes(f)) return false; S.tactic = f; relabelSquad(); commit(); return true; }
/** Два гравці основи міняються місцями. Воротар лишається в рамці: у нього інші навички. */
export function swapStarters(a, b) {
  if (a === b || !a || !b || !S.squad[a] || !S.squad[b]) return false;
  const t = S.squad[a]; S.squad[a] = S.squad[b]; S.squad[b] = t; relabelSquad(); commit(); return true;
}
/** Найкраща лінія для польового гравця: рейтинг рахується за вагами лінії, тож форвард у захисті слабшає. */
export function bestLine(e) {
  let best = e.line, top = -1;
  for (const line of ['D', 'M', 'W', 'F']) { const o = ovr({ ...e, line }); if (o > top) { top = o; best = line; } }
  return { line: best, ovr: top };
}

/** Склад суперника: сила росте з прогресом, ролі мають свої сильні сторони. */
/**
 * Склад суперника — сталий: ті самі гравці (імена, обличчя, сильні й слабкі сторони) щосезону, лише ростуть — кожен у
 * свому темпі (молоді й талановиті швидше). У кожного клубу своя зірка (+9), склад підлаштований під стиль клубу
 * (техніка — пас і дриблінг, сила — відбір), а за кожну нашу перемогу над ними — реванш (rivals.js).
 */
export function oppSquad(spec) {
  const d = heatOf(spec.fixtureIdx, spec.season), h = hashStr(spec.club.name), rnd = rng(h % 1e6 + 13), dev = rng(h % 1e6 + 7919 * (spec.season + 1));
  const rv = rivalOf(spec), bias = rv.style.bias || {};
  // сила складу — найбільший важіль складності (симулятор: склад першого матчу на місці 10-го дає 100% перемог). Наш склад
  // росте лише на ~0.3 рейтингу за матч, тож суперник +1 за матч (було +2.8, і кар'єра впиралась у Лігу чемпіонів):
  // рейтинг ~35 у першому матчі (наш ~46), рівня нашого складу досягає на Чемпіонаті світу; стеля — для старих сезонів
  const base = clamp(25 + d + (spec.no - 1) * 0.6 + rv.revenge, 25, 78), names = spec.league >= 3 ? 'int' : 'ua';
  const roles = FORMATIONS[spec.formation];
  const sq = [newEntry(GK_ROLE, 0, rnd, base + 2, names)];
  roles.forEach((r, i) => sq.push(newEntry(r, i + 1, rnd, base, names)));
  // ім'я випадкове й може повторитись: другому такому гравцеві наступне вільне прізвище. rnd тут не чіпаємо, інакше зміняться наявні склади
  const seen = new Set(), LAST = names === 'int' ? LAST_INT : LAST_UA;
  for (const e of sq) {
    const sp = e.name.indexOf(' '), first = e.name.slice(0, sp);
    for (let j = LAST.indexOf(e.name.slice(sp + 1)); seen.has(e.name);) { j = (j + 1) % LAST.length; e.name = first + ' ' + LAST[j]; }
    seen.add(e.name);
  }
  // зірка клубу — нападник/фланговий (за клубом), у деяких клубів — воротар
  const att = sq.map((e, i) => i).filter((i) => sq[i].line === 'F' || sq[i].line === 'W' || sq[i].role === 'AM');
  const star = h % 5 === 0 ? 0 : att[h % att.length] ?? 10;
  const grow = Math.min(spec.season, 3);
  sq.forEach((e, i) => {
    const talent = dev() * 6 - 2;                                    // за сезон: хтось додає, хтось стоїть на місці
    for (const k of keysFor(e.line)) e.stats[k] = clamp(Math.round(e.stats[k] + talent * grow * 0.5 + (bias[k] || 0) * rv.k + (i === star ? 9 : 0)), 8, 99);
    if (i === star) e.star = true;
  });
  return sq;
}

/** Нормалізовані 0..1 навички для ігрової логіки. */
export function skillOf(e, gkBonus = 0) {
  const s = {};
  for (const k of keysFor(e.line)) s[k] = clamp((e.stats[k] + (e.line === 'G' && (k === 'react' || k === 'reach' || k === 'hands') ? gkBonus * 100 : 0)) / 100, 0.05, 1);
  for (const k of STAT_KEYS) if (s[k] === undefined) s[k] = 0.5;
  for (const k of GK_KEYS) if (s[k] === undefined) s[k] = 0.5;
  return s;
}
export const gkBonus = () => keeperTier() * 0.05;

/** Вигляд гравця: збережене обличчя; воротар і нападник-трансфер замінюють зовнішність того, хто стоїть на їхньому місці. */
/** Куплений нападник один, а у схемі їх буває двоє: його обличчя лише в першого. */
const isLeadST = (e) => e.role === 'ST' && S.squad.find((x) => x.role === 'ST') === e;
/** Куплений воротар стоїть у рамці: запасні воротарі лишаються зі своїми обличчями. */
const isFrameGK = (e) => S.squad[0] === e;
export function squadLook(e) {
  if (e.custom) return { skin: e.skin, hair: e.hair, hairCol: e.hairCol, beard: e.beard || 0, num: e.num };
  if (isFrameGK(e)) { const k = keeper(); return { skin: k.skin, hair: k.hair, hairCol: k.hairCol, beard: e.beard || 0, num: e.num }; }
  if (isLeadST(e)) { const s = striker(); return { skin: s.skin, hair: s.hair, hairCol: s.hairCol, beard: e.beard || 0, num: e.num }; }
  return { skin: e.skin, hair: e.hair, hairCol: e.hairCol, beard: e.beard || 0, num: e.num };
}
/** Підпис вигляду для кешу портретів. */
export const lookSig = (e) => [e.skin, e.hair, e.hairCol, e.beard || 0, e.custom ? 'c' : isFrameGK(e) ? keeper().id : isLeadST(e) ? striker().id : '', S.kitId || 'home'].join('');

/** Перша правка вигляду: запис бере те, що гравець бачив (зокрема обличчя купленого), а власне обличчя лишається в orig для скидання. Старі записи з custom уже мають свій вигляд у полях і не змінюються. */
export function customizeLook(e) {
  if (e.custom) return;
  const L = squadLook(e);
  e.orig = { skin: e.skin, hair: e.hair, hairCol: e.hairCol, beard: e.beard || 0 };
  e.skin = L.skin; e.hair = L.hair; e.hairCol = L.hairCol; e.beard = L.beard; e.custom = true;
}
/** Скидає вигляд: orig, а для старих записів без нього початкове обличчя (реальний склад — за id, випускник — з академії). */
export function resetLook(e) {
  const o = e.orig || [...defaultSquad().squad, ...defaultSquad().bench].find((d) => d.id === e.id) || S.academy.players.find((p) => p.id === e.id);
  if (o) { e.skin = o.skin; e.hair = o.hair; e.hairCol = o.hairCol; e.beard = o.beard || 0; }
  e.custom = false; delete e.orig;
}

/** Досвід: підвищення рівня дає +1 до двох навичок, що найбільше пасують ролі. */
export function gainXp(e, amount, events) {
  e.xp += amount;
  while (e.xp >= xpNeed(e.lvl)) {
    e.xp -= xpNeed(e.lvl); e.lvl++;
    const keys = keysFor(e.line), b = BIAS[e.line];
    for (let n = 0; n < 2; n++) {
      let tot = 0; const w = keys.map((k) => { const v = Math.max(1, (b[k] || 0) + 16) * (e.stats[k] >= 99 ? 0 : 1); tot += v; return v; });
      if (tot <= 0) break;
      let r = Math.random() * tot, pick = keys[0];
      for (let i = 0; i < keys.length; i++) { if ((r -= w[i]) < 0) { pick = keys[i]; break; } }
      e.stats[pick] = Math.min(99, e.stats[pick] + 1);
      if (events) events.push({ name: e.name, key: pick, lvl: e.lvl });
    }
  }
}

export function trainStat(idx, key) {
  const e = allPlayers()[idx]; if (!e) return false;
  const v = e.stats[key], c = trainCost(v);
  if (v >= 99 || S.coins < c) return false;
  S.coins -= c; e.stats[key] = v + 1; commit();
  return c;
}

/** Випускник академії займає місце лівого флангу, якщо він сильніший. */
export function signGraduate(gr) {
  let idx = S.squad.findIndex((e) => e.role === 'LW');
  if (idx < 0) S.squad.forEach((e, i) => { if (i && (idx < 0 || ovr(e) < ovr(S.squad[idx]))) idx = i; });   // у схемі без флангу — на місце найслабшого
  if (idx < 0) return false;
  const base = gr.rar === 'e' ? 66 : gr.rar === 'r' ? 54 : 44, rnd = Math.random;
  const e = { id: gr.id, role: 'LW', pos: 'LW', line: 'W', num: gr.num, name: gr.name, real: true, stats: makeStats('W', base, rnd, 4), xp: 0, lvl: 1, apps: 0, goals: 0, skin: gr.skin, hair: gr.hair, hairCol: gr.hairCol, beard: 0 };
  e.role = S.squad[idx].role; e.line = S.squad[idx].line;
  if (ovr(e) > ovr(S.squad[idx])) {
    const old = S.squad[idx]; old.role = old.pos || 'LW'; old.line = LINE_OF[old.role] || 'W';
    // номер випускника випадковий: у клубі він не має повторюватись
    const used = new Set(allPlayers().map((p) => p.num));
    for (let i = 0; i < 99 && used.has(e.num); i++) e.num = (e.num % 99) + 1;
    gr.num = e.num;
    S.bench.push(old); S.squad[idx] = e; return true;
  }
  return false;
}

export const squadRating = () => Math.round(S.squad.reduce((a, e) => a + ovr(e), 0) / S.squad.length);
