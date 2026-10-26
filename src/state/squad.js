import { S, commit } from './save.js';
import { ACADEMY, FORMATIONS } from '../config.js';
import { striker, keeper, keeperTier } from './economy.js';
import { rng } from '../graphics/voxel.js';

/** Характеристики гравців: власні навички й інтелект, що справді впливають на гру й розвиваються. */
export const STAT_KEYS = ['pace', 'shoot', 'pass', 'drib', 'tack', 'iq'];
export const GK_KEYS = ['react', 'reach', 'hands', 'pass', 'iq'];
export const STAT_NAMES = { pace: 'Швидкість', shoot: 'Удар', pass: 'Пас', drib: 'Дриблінг', tack: 'Відбір', iq: 'Інтелект', react: 'Реакція', reach: 'Дотяжка', hands: 'Ловля' };
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
export const trainCost = (v) => Math.max(25, Math.round(30 * Math.pow(1.17, v - 34)));
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
    skin: pick(ACADEMY.skins), hair: pick(ACADEMY.hairs), hairCol: pick(ACADEMY.hairCols),
  };
}

const GK_ROLE = { name: 'GK', line: 'G', num: 1 };

/** Початковий склад: воротар + 10 польових за розстановкою 4-3-3. */
export function defaultSquad() {
  const rnd = rng(77), roles = FORMATIONS['433'];
  const sq = [newEntry(GK_ROLE, 0, rnd, 40)];
  roles.forEach((r, i) => sq.push(newEntry(r, i + 1, rnd, 40)));
  return sq;
}

export function ensureSquad() {
  if (!Array.isArray(S.squad) || S.squad.length !== 11 || !S.squad[0] || !S.squad[0].stats) { S.squad = defaultSquad(); commit(); }
}

/** Склад суперника: сила росте з прогресом, ролі мають свої сильні сторони. */
export function oppSquad(spec) {
  const d = spec.fixtureIdx + spec.season * 13, rnd = rng(spec.globalNo * 977 + 13);
  const base = clamp(28 + d * 2.5 + (spec.no - 1) * 1.0, 26, 88), names = spec.league >= 3 ? 'int' : 'ua';
  const roles = FORMATIONS[spec.formation];
  const sq = [newEntry(GK_ROLE, 0, rnd, base + 2, names)];
  roles.forEach((r, i) => sq.push(newEntry(r, i + 1, rnd, base, names)));
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

/** Вигляд гравця: збережене обличчя; нападник-трансфер замінює зовнішність центрального нападника. */
export function squadLook(e) {
  if (e.role === 'GK') { const k = keeper(); return { skin: k.skin, hair: k.hair, hairCol: k.hairCol, num: e.num }; }
  if (e.role === 'ST') { const s = striker(); return { skin: s.skin, hair: s.hair, hairCol: s.hairCol, num: e.num }; }
  return { skin: e.skin, hair: e.hair, hairCol: e.hairCol, num: e.num };
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
  const e = S.squad[idx]; if (!e) return false;
  const v = e.stats[key], c = trainCost(v);
  if (v >= 99 || S.coins < c) return false;
  S.coins -= c; e.stats[key] = v + 1; commit();
  return c;
}

/** Випускник академії займає місце лівого флангу, якщо він сильніший. */
export function signGraduate(gr) {
  const idx = S.squad.findIndex((e) => e.role === 'LW');
  if (idx < 0) return false;
  const base = gr.rar === 'e' ? 66 : gr.rar === 'r' ? 54 : 44, rnd = Math.random;
  const e = { id: gr.id, role: 'LW', line: 'W', num: gr.num, name: gr.name, stats: makeStats('W', base, rnd, 4), xp: 0, lvl: 1, apps: 0, goals: 0, skin: gr.skin, hair: gr.hair, hairCol: gr.hairCol };
  if (ovr(e) > ovr(S.squad[idx])) { S.squad[idx] = e; return true; }
  return false;
}

export const squadRating = () => Math.round(S.squad.reduce((a, e) => a + ovr(e), 0) / S.squad.length);
