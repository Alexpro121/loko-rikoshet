import { S } from './save.js';

/**
 * Еволюція суперників. Кожен клуб — не випадкова збірна на один матч, а живий суперник:
 *  • стиль гри (пресинг, контратаки, техніка, сила), який він грає дедалі чіткіше з кожною зустріччю;
 *  • пам'ять зустрічей: обіграв їх — наступного сезону вони виходять на реванш підсиленими;
 *  • сталий склад (ті самі гравці щосезону ростуть) і своя зірка;
 *  • скаутинг: суперники вивчають твою гру (у який кут б'єш, яким флангом атакуєш, чи довго цілишся) — воротар
 *    «грає» в твій улюблений кут, захисники зсуваються на твій фланг, а на довге прицілювання тиснуть пресингом.
 *    Вивчене згасає, якщо ти міняєш гру: варіюй удари — і їхнє «домашнє завдання» не спрацює.
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** Стилі: зсуви параметрів матчу на повну силу стилю (k = 1). */
export const STYLES = [
  { id: 'press', name: 'ПРЕСИНГ', tip: 'тиснуть високо й відбирають', mod: { press: 0.18, line: 0.05, runSpeed: 0.35, slowFactor: 0.025 } },
  { id: 'counter', name: 'КОНТРАТАКИ', tip: 'сидять глибоко й швидко б’ють у відповідь', mod: { press: -0.06, line: -0.04, runSpeed: 0.5, counterSpeed: 5 } },
  { id: 'tech', name: 'ТЕХНІКА', tip: 'точні паси й удари', mod: { gkErr: -0.8, tackle: 0.03 }, bias: { pass: 8, drib: 6, shoot: 4 } },
  { id: 'power', name: 'СИЛА', tip: 'жорсткий відбір і сильні удари', mod: { tackle: 0.08, counterSpeed: 3, press: 0.06 }, bias: { tack: 8, pace: 3 } },
];

const rec = (name) => ((S.rivals ||= {})[name] ||= { met: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });

/** Що ми знаємо про суперника перед матчем. */
export function rivalOf(spec) {
  const name = spec.club.name, r = (S.rivals && S.rivals[name]) || { met: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
  const style = STYLES[hashStr(name) % STYLES.length];
  // стиль чіткішає з кожною зустріччю (зіграні матчі з цим клубом) і з рівнем ліги
  const k = clamp(0.45 + 0.18 * r.met + 0.1 * spec.league, 0.45, 1);
  // реванш: кожна наша перемога над ними — +2 до сили їхнього складу (до +6), поразки від них — зменшують
  const revenge = clamp(2 * r.w - r.l, 0, 6);
  return { name, style, k, revenge, rec: r, know: scoutKnow(spec) };
}

/** Параметри матчу з урахуванням стилю, реваншу й вивченої гри гравця. */
export function evolveSpec(spec) {
  const rv = rivalOf(spec), m = rv.style.mod, k = rv.k, out = { ...spec, rival: rv };
  const add = (key, lo, hi) => { if (m[key]) out[key] = clamp(out[key] + m[key] * k, lo, hi); };
  add('press', 0.05, 0.95); add('line', -0.04, 0.18); add('runSpeed', 7, 10.3); add('counterSpeed', 32, 66);
  add('gkErr', 0.3, 5); add('tackle', 0.4, 0.95); add('slowFactor', 0.1, 0.27);
  // скаутинг: на довге прицілювання — сильніший пресинг
  const sc = S.scout, kn = rv.know;
  if (sc && sc.aim > 1.4) out.press = clamp(out.press + 0.12 * kn * clamp((sc.aim - 1.4) / 1.2, 0, 1), 0.05, 0.95);
  out.scout = {
    know: kn,
    corner: sc ? clamp(sc.corner, -1, 1) * kn : 0,                  // куди «грає» воротар (z-знак наших ударів у його ворота)
    flank: sc ? clamp(sc.flank, -1, 1) * kn : 0,                    // куди зсувається їхній блок
  };
  return out;
}

/** Наскільки суперник вивчив твою гру: росте з кількістю зіграних матчів і з рівнем ліги (кращі клуби краще аналізують). */
function scoutKnow(spec) {
  const sc = S.scout; if (!sc || !sc.n) return 0;
  return clamp(sc.n / 5, 0, 1) * clamp(0.35 + 0.18 * spec.league, 0.35, 0.9);
}

/** Записати матч: результат проти клубу і що суперники помітили в нашій грі (ковзне середнє — свіже важить більше). */
export function recordMatch(spec, me, opp, log) {
  const r = rec(spec.club.name);
  r.met++; r.gf += me; r.ga += opp; if (me > opp) r.w++; else if (me < opp) r.l++; else r.d++;
  const sc = (S.scout ||= { n: 0, corner: 0, flank: 0, dist: 20, aim: 1, shots: 0 });
  if (log && log.shots.length) {
    const n = log.shots.length, a = clamp(0.25 + n * 0.04, 0.25, 0.55);
    let cz = 0, fz = 0, d = 0;
    for (const s of log.shots) { cz += Math.sign(s.gz) * Math.min(1, Math.abs(s.gz) / 2.5); fz += s.bz; d += s.dist; }
    sc.corner += (cz / n - sc.corner) * a; sc.flank += (clamp(fz / n / 14, -1, 1) - sc.flank) * a; sc.dist += (d / n - sc.dist) * a;
    sc.shots += n;
  }
  if (log && log.aims.length) { const m = log.aims.reduce((s, v) => s + v, 0) / log.aims.length; sc.aim += (m - sc.aim) * 0.4; }
  sc.n++;
}

/** Підказка для табло: що суперник про тебе знає (або null). */
export function scoutNote(spec) {
  const sp = evolveSpec(spec), s = sp.scout;
  if (Math.abs(s.corner) > 0.25) return 'Знають: б’єш у ' + (s.corner > 0 ? 'правий' : 'лівий') + ' кут';
  if (Math.abs(s.flank) > 0.3) return 'Знають: атакуєш ' + (s.flank > 0 ? 'правим' : 'лівим') + ' флангом';
  if (S.scout && S.scout.aim > 1.6 && s.know > 0.3) return 'Знають: довго цілишся — тиснутимуть';
  return null;
}
