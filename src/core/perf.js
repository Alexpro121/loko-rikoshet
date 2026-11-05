// Рівні деталізації під пристрій: що спрощувати, коли роздільність уже не рятує, перша оцінка телефона, пам'ять між запусками.
const KEY = 'loko-perf-v1';                                     // свій ключ, не в S: налаштування S їдуть хмарою на інші пристрої, а сила телефона ні

/**
 * Від слабкого до повного. crowd і weather — частка глядачів і крапель, натовп рухає шейдер,
 * тож частоти оновлення для нього немає (Stands). banners — чи малювати полотнища й прапори (5 викликів малювання).
 * thin (менше за рівень 2): далекі від м'яча гравці анімуються 30 разів на секунду (Match.animatePlayers).
 */
export const DETAIL = [
  { crowd: 0.25, weather: 0.35, banners: false },
  { crowd: 0.45, weather: 0.6, banners: true },
  { crowd: 0.7, weather: 0.8, banners: true },
  { crowd: 1, weather: 1, banners: true },
];
export const MAX_LEVEL = DETAIL.length - 1;

/** Перша оцінка. На Android Telegram сам каже клас пристрою в User-Agent, інакше судимо за ядрами й пам'яттю. Далі рівень веде Game.governor. */
function guess(coarse) {
  if (!coarse) return { level: MAX_LEVEL, res: 1 };
  const nav = typeof navigator === 'object' ? navigator : {};
  const m = /Telegram-Android\/[^(]*\([^)]*;\s*(LOW|AVERAGE|HIGH)\)/.exec(String(nav.userAgent || ''));
  if (m) return m[1] === 'LOW' ? { level: 1, res: 0.7 } : m[1] === 'HIGH' ? { level: MAX_LEVEL, res: 0.85 } : { level: 2, res: 0.85 };
  const cores = +nav.hardwareConcurrency || 8, mem = +nav.deviceMemory || 8;
  return cores <= 4 || mem <= 3 ? { level: 1, res: 0.7 } : { level: 2, res: 0.85 };
}

/** Що цей пристрій тягнув минулого разу, щоб не вчитись заново з фризами на кожному запуску. */
export function loadPerf(coarse) {
  const g = guess(coarse);
  try {
    const o = JSON.parse(localStorage.getItem(KEY));
    if (o && Number.isInteger(o.l) && o.l >= 0 && o.l <= MAX_LEVEL && o.r >= 0.3 && o.r <= 1) return { level: o.l, res: o.r };
  } catch (_) { /* нема сховища або битий запис */ }
  return g;
}

export function savePerf(level, res) {
  try { localStorage.setItem(KEY, JSON.stringify({ l: level, r: +res.toFixed(2) })); } catch (_) { /* приватний режим */ }
}
