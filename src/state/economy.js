import { S } from './save.js';
import { STADIUM_TIERS, STRIKERS, KEEPERS, ACADEMY } from '../config.js';

const round = (v) => {
  if (v < 100) return Math.round(v / 5) * 5;
  if (v < 1000) return Math.round(v / 10) * 10;
  return Math.round(v / 50) * 50;
};

export const kickCost = (lvl = S.up.kick) => round(60 * Math.pow(1.32, lvl));
export const stadiumCost = (lvl = S.up.stadium) => round(90 * Math.pow(1.34, lvl));

export const KICK_STEP = 6;     // % сили за рівень
export const INCOME_STEP = 8;   // % доходу за рівень

export const powerMult = () => 1 + (KICK_STEP / 100) * S.up.kick;
export const academyBonus = () => S.academy.players.reduce((a, p) => a + p.bonus, 0);
export const incomePct = () => INCOME_STEP * S.up.stadium + academyBonus();
export const incomeMult = () => 1 + incomePct() / 100;

export function stadiumTier(level = S.up.stadium) {
  let t = 0;
  for (let i = 0; i < STADIUM_TIERS.length; i++) if (level >= STADIUM_TIERS[i]) t = i;
  return t;
}
export const nextTierLevel = (level = S.up.stadium) => {
  const t = stadiumTier(level);
  return t + 1 < STADIUM_TIERS.length ? STADIUM_TIERS[t + 1] : null;
};

export const striker = () => STRIKERS.find((s) => s.id === S.striker) || STRIKERS[0];
export const keeper = () => KEEPERS.find((s) => s.id === S.keeper) || KEEPERS[0];
export const strikerTier = () => STRIKERS.indexOf(striker());
export const keeperTier = () => KEEPERS.indexOf(keeper());

/** Каса стадіону: пасивний дохід, що копичиться між візитами. */
export const CASH_CAP_MIN = 90;
export const cashRate = () => (4 + 1.6 * S.up.stadium) * incomeMult();
export function pendingCash(now = Date.now()) {
  const min = Math.min(CASH_CAP_MIN, Math.max(0, (now - S.cashAt) / 60000));
  return Math.floor(min * cashRate());
}

export function rollGraduate() {
  const A = ACADEMY;
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  let r = Math.random() * A.rarities.reduce((a, x) => a + x.w, 0), rar = A.rarities[0];
  for (const x of A.rarities) { if ((r -= x.w) < 0) { rar = x; break; } }
  const bonus = rar.bonus[0] + Math.round(Math.random() * (rar.bonus[1] - rar.bonus[0]));
  S.academy.serial++;
  return {
    id: 'g' + S.academy.serial,
    name: pick(A.firstNames) + ' ' + pick(A.lastNames),
    num: 2 + ((Math.random() * 28) | 0),
    rar: rar.id, bonus,
    hair: pick(A.hairs), hairCol: pick(A.hairCols), skin: pick(A.skins),
  };
}

export const fmt = (n) => {
  n = Math.floor(n);
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.0', '') + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace('.0', '') + 'K';
  return String(n);
};
