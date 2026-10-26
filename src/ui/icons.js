// Прості вбудовані SVG-іконки: без емодзі та зовнішніх файлів.
const svg = (body, vb = '0 0 24 24', cls = 'ic') => `<svg class="${cls}" viewBox="${vb}" aria-hidden="true">${body}</svg>`;

export const I = {
  gear: svg('<path fill="currentColor" fill-rule="evenodd" d="M10.3 2h3.4l.5 2.5 1.7.7 2.1-1.4 2.4 2.4-1.4 2.1.7 1.7 2.5.5v3.4l-2.5.5-.7 1.7 1.4 2.1-2.4 2.4-2.1-1.4-1.7.7-.5 2.5h-3.4l-.5-2.5-1.7-.7-2.1 1.4-2.4-2.4 1.4-2.1-.7-1.7L2 13.7v-3.4l2.5-.5.7-1.7-1.4-2.1 2.4-2.4 2.1 1.4 1.7-.7zM12 8.6a3.4 3.4 0 100 6.8 3.4 3.4 0 000-6.8z"/>'),
  pause: svg('<rect x="6" y="4.5" width="4.2" height="15" rx="1" fill="currentColor"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1" fill="currentColor"/>'),
  play: svg('<path fill="currentColor" d="M7 4.5v15l12-7.5z"/>'),
  close: svg('<path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" fill="none"/>'),
  coin: svg('<circle cx="12" cy="12" r="10" fill="#ffc61a" stroke="#b07a00" stroke-width="2"/><circle cx="12" cy="12" r="6.2" fill="none" stroke="#e29d00" stroke-width="2"/><rect x="10.8" y="8" width="2.4" height="8" rx="1" fill="#b07a00"/>', '0 0 24 24', 'ic coin'),
  ticket: svg('<path d="M3 7h18v3.2a2 2 0 000 3.6V17H3v-3.2a2 2 0 000-3.6z" fill="#7be3b4" stroke="#0c7a55" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 7v10" stroke="#0c7a55" stroke-width="1.8" stroke-dasharray="1.6 1.8"/>', '0 0 24 24', 'ic tkt'),
  boot: svg('<path fill="#fff" d="M4 3h7v7.5l7.8 2.7c1.3.5 2.2 1.6 2.2 3V19H3z"/><path fill="#0b2a1f" d="M3 17h18v2.4H3z"/><circle cx="19" cy="6" r="3" fill="#fff" stroke="#0b2a1f" stroke-width="1.4"/><path d="M6 6h3M6 9h3" stroke="#0b2a1f" stroke-width="1.4" stroke-linecap="round"/>'),
  stadium: svg('<ellipse cx="12" cy="13" rx="10" ry="6" fill="#fff"/><ellipse cx="12" cy="12" rx="7" ry="3.6" fill="#2bb544"/><path d="M3 11V7.5C3 5.7 7 4 12 4s9 1.7 9 3.5V11" fill="none" stroke="#fff" stroke-width="2.2"/><path d="M9 12h6" stroke="#fff" stroke-width="1.2"/>'),
  shirt: svg('<path fill="#fff" d="M8.5 3L2.5 6.2l2.3 4.4 2.2-1V21h10V9.6l2.2 1 2.3-4.4-6-3.2c-.4 1.5-1.8 2.4-3.5 2.4S8.9 4.5 8.5 3z"/><path fill="#e11d2e" d="M7 9.6V21h2.6V9.2z" opacity=".0"/><rect x="10.4" y="10" width="3.2" height="4.4" fill="#12a150"/>'),
  team: svg('<circle cx="8" cy="7.2" r="3.2" fill="#fff"/><circle cx="17" cy="8.4" r="2.8" fill="#fff"/><path fill="#fff" d="M2 20v-3.5c0-2.6 2.5-4.4 6-4.4s6 1.8 6 4.4V20z"/><path fill="#fff" d="M15.2 12.6c3.8-.5 6.8 1 6.8 3.8V20h-5v-3.5c0-1.4-.7-2.8-1.8-3.9z"/>'),
  trophy: svg('<path fill="#ffc61a" stroke="#b07a00" stroke-width="1.4" stroke-linejoin="round" d="M7 3h10v5.5a5 5 0 01-10 0z"/><path d="M7 5H3.5c0 3 1.5 4.5 3.7 4.6M17 5h3.5c0 3-1.5 4.5-3.7 4.6" fill="none" stroke="#e29d00" stroke-width="1.8"/><rect x="10.6" y="13" width="2.8" height="4" fill="#e29d00"/><rect x="7.5" y="17" width="9" height="3.6" rx="1" fill="#ffc61a" stroke="#b07a00" stroke-width="1.4"/>'),
  full: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'),
  check: svg('<path d="M4.5 12.5l5 5L19.5 7" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 10.5V8a4 4 0 018 0v2.5" stroke="currentColor" stroke-width="2.4" fill="none"/>'),
  ball: svg('<circle cx="12" cy="12" r="10" fill="#fff" stroke="#0b2a1f" stroke-width="1.8"/><path d="M12 7.2l4.2 3-1.6 4.9H9.4L7.8 10.2z" fill="#0b2a1f"/>'),
  bolt: svg('<path d="M13 2L5 13.5h5.5L9.5 22 19 9.5h-6z" fill="currentColor"/>'),
  up: svg('<path d="M12 4l7 8h-4.5v8h-5v-8H5z" fill="currentColor"/>'),
};

/** Щит клубу: два кольори та ініціали. */
export function crest(kit, label) {
  const a = kit.main, b = kit.second;
  return `<svg class="crest" viewBox="0 0 40 46" aria-hidden="true"><path d="M3 3h34v22c0 9-9 16-17 19C12 41 3 34 3 25z" fill="${a}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M20 3h17v22c0 9-9 16-17 19z" fill="${b}"/><path d="M3 3h34v22c0 9-9 16-17 19C12 41 3 34 3 25z" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg><b class="crest-t">${label}</b>`;
}

/** Власний значок Локо: червона й зелена половини (сигнали «стоп» і «вперед») та залізничне колесо. Не офіційний логотип. */
export function lokoCrest() {
  const spokes = [0, 60, 120].map((a) => `<line x1="20" y1="22" x2="${(20 + 6.2 * Math.cos((a * Math.PI) / 180)).toFixed(1)}" y2="${(22 + 6.2 * Math.sin((a * Math.PI) / 180)).toFixed(1)}" stroke="#fff" stroke-width="1.6"/><line x1="20" y1="22" x2="${(20 - 6.2 * Math.cos((a * Math.PI) / 180)).toFixed(1)}" y2="${(22 - 6.2 * Math.sin((a * Math.PI) / 180)).toFixed(1)}" stroke="#fff" stroke-width="1.6"/>`).join('');
  return `<svg class="crest" viewBox="0 0 40 46" aria-hidden="true"><path d="M3 3h34v22c0 9-9 16-17 19C12 41 3 34 3 25z" fill="#c8213a"/><path d="M20 3h17v22c0 9-9 16-17 19z" fill="#18884f"/><circle cx="20" cy="22" r="7.6" fill="none" stroke="#fff" stroke-width="2"/>${spokes}<circle cx="20" cy="22" r="1.8" fill="#fff"/><path d="M3 3h34v22c0 9-9 16-17 19C12 41 3 34 3 25z" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><text x="20" y="37" text-anchor="middle" font-size="5.6" font-weight="800" fill="#fff" font-family="Rubik, sans-serif">1919</text></svg>`;
}
