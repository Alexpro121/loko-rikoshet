import { audio } from '../core/audio.js';
import { lokoCrest } from './icons.js';
import { S } from '../state/save.js';

/** Голос: «Хто ми?» низько, «ЛОКО!» голосно (мовний синтез браузера, якщо є). */
function say(text, pitch, rate, vol) {
  try {
    if (!S.settings.sfx || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'uk-UA'; u.pitch = pitch; u.rate = rate; u.volume = vol;
    const v = speechSynthesis.getVoices().find((x) => /^uk/i.test(x.lang));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) { /* без голосу */ }
}

/** Потяг у стилі клубного автобуса й УЗ: червоний корпус, зелені шеврони, білий фірмовий пояс, силует носорога. Рухається вправо, кабіна праворуч. */
const rhino = (x, y, k) => `<g transform="translate(${x} ${y}) scale(${k})"><path fill="#15191c" d="M0 78 C-4 50 10 22 40 14 C58 8 74 12 88 24 L112 6 L104 34 C120 42 122 62 108 76 C100 86 86 88 76 82 C70 94 52 96 44 86 C34 92 12 94 0 78Z"/><path fill="#d6282f" d="M30 40 C46 30 66 32 78 44 C70 52 52 56 38 54Z"/><path fill="#15191c" d="M38 36 L70 40 L60 48Z"/><circle cx="62" cy="43" r="3.2" fill="#46e06a"/><path fill="none" stroke="#15191c" stroke-width="5" d="M6 70 C16 84 34 90 52 82"/></g>`;
const RED = '#d6282f', DRED = '#a81c24', GRN = '#3fae3c';
let _gs = 3;
const gr = () => { _gs = (_gs * 1103515245 + 12345) & 0x7fffffff; return _gs / 0x7fffffff; };
const glass = (x, y, w, h) => {
  let pax = '';
  const n = gr() < 0.3 ? 0 : gr() < 0.55 ? 1 : 2;
  for (let k = 0; k < n; k++) { const px = x + w * (n === 1 ? 0.5 : 0.3 + k * 0.4) + (gr() - 0.5) * 3; pax += `<circle cx="${px.toFixed(1)}" cy="${y + h - 9.5}" r="3.1" fill="#0d1419"/><path d="M${(px - 4.6).toFixed(1)} ${y + h - 1} q0 -6 4.6 -6 q4.6 0 4.6 6z" fill="#0d1419"/>`; }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.5" fill="#f1cf7a"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.5" fill="#1a2a35" opacity=".62"/>${pax}<polygon points="${x + 2},${y + h - 2} ${x + w * 0.45},${y + 2} ${x + w * 0.7},${y + 2} ${x + w * 0.25},${y + h - 2}" fill="#bcd6e3" opacity=".3"/><rect x="${x}" y="${y}" width="${w}" height="4" rx="2" fill="#000" opacity=".3"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.5" fill="none" stroke="#2b343a" stroke-width="1.6"/>`;
};
const wheel = (cx) => `<g><circle cx="${cx}" cy="133" r="11.5" fill="#15181b"/><circle cx="${cx}" cy="133" r="8" fill="#c3cacf"/><g class="in-wh"><path d="M${cx} 126v14M${cx - 7} 133h14M${cx - 5} 128l10 10M${cx + 5} 128l-10 10" stroke="#59636a" stroke-width="1.6"/></g><circle cx="${cx}" cy="133" r="2.6" fill="#f2c230"/></g>`;
const bogie = (cx) => `<g><rect x="${cx - 34}" y="116" width="68" height="8" rx="3" fill="#2a2f33"/><rect x="${cx - 26}" y="111" width="52" height="6" fill="#3a4248"/>${[-17, 17].map((d) => `<rect x="${cx + d - 5}" y="121" width="10" height="7" rx="2" fill="#23272b"/>`).join('')}${wheel(cx - 17)}${wheel(cx + 17)}<path class="in-rod" d="M${cx - 17} 133 H${cx + 17}" stroke="#7d868c" stroke-width="3" stroke-linecap="round"/><path d="M${cx - 30} 126 H${cx + 30}" stroke="#23272b" stroke-width="3"/></g>`;
const doorAt = (x) => `<g><rect x="${x}" y="48" width="32" height="64" rx="2" fill="${DRED}" stroke="#7d1219" stroke-width="1.2"/><rect x="${x + 3}" y="52" width="12" height="30" rx="2" fill="#12202a"/><rect x="${x + 17}" y="52" width="12" height="30" rx="2" fill="#12202a"/><line x1="${x + 16}" y1="48" x2="${x + 16}" y2="112" stroke="#7d1219" stroke-width="1.4"/><rect x="${x - 2}" y="60" width="2.6" height="46" fill="#f2c230"/><rect x="${x + 31}" y="60" width="2.6" height="46" fill="#f2c230"/><rect x="${x + 2}" y="112" width="28" height="4" fill="#2a2f33"/><rect x="${x + 10}" y="88" width="12" height="3" rx="1" fill="#e9eef0"/></g>`;
const chevrons = (x0, x1, y0, y1) => { let o = ''; for (let cx = x0; cx < x1; cx += 38) o += `<polygon points="${cx},${y1} ${cx + 22},${y1} ${cx + 52},${y0} ${cx + 30},${y0}" fill="${GRN}"/><polygon points="${cx - 7},${y1} ${cx},${y1} ${cx + 30},${y0} ${cx + 23},${y0}" fill="#fff"/>`; return o; };
const roofGear = (x, n) => Array.from({ length: n }, (_, k) => `<rect x="${x + 70 + k * 80}" y="36" width="52" height="8" rx="3" fill="#8e979c"/><rect x="${x + 76 + k * 80}" y="34" width="40" height="3" fill="#6d767b"/>`).join('');
const rhino2 = (x, y, k) => rhino(x, y, k);
const car = (x, i) => {
  let wins = '';
  const start = i === 0 ? 150 : 62;
  for (let n = 0; start + n * 29 < 306; n++) wins += glass(x + start + n * 29, 54, 24, 24);
  return `<g><clipPath id="cc${i}"><rect x="${x}" y="44" width="360" height="68" rx="10"/></clipPath>
    <rect x="${x}" y="44" width="360" height="68" rx="10" fill="${RED}"/>
    <g clip-path="url(#cc${i})">
      <rect x="${x}" y="44" width="360" height="5" fill="${DRED}"/>
      ${chevrons(x + (i === 0 ? 150 : 60), x + 300, 80, 112)}
      <rect x="${x}" y="106" width="360" height="6" fill="#8e1822"/>
      ${i === 0 ? rhino2(x + 30, 46, 0.74) : ''}
    </g>
    ${wins}
    ${i === 0 ? `<text x="${x + 54}" y="62" font-family="Rubik, Arial Black, sans-serif" font-weight="800" font-size="11" fill="none" stroke="#fff" stroke-width=".9" letter-spacing="2">FCLK</text>` : ''}
    <rect x="${x + (i === 0 ? 120 : 84)}" y="87" width="${i === 0 ? 200 : 232}" height="15" fill="#fff"/><polygon points="${x + (i === 0 ? 120 : 84)},87 ${x + (i === 0 ? 112 : 76)},102 ${x + (i === 0 ? 120 : 84)},102" fill="#fff" opacity=".0"/>
    <text x="${x + (i === 0 ? 220 : 200)}" y="98.5" text-anchor="middle" font-family="Rubik, Arial Black, sans-serif" font-weight="800" font-size="11" fill="${RED}" letter-spacing=".8">${i === 1 ? 'FC LOKOMOTYV KYIV 1919' : 'УКРЗАЛІЗНИЦЯ · ЛОКО'}</text>
    ${doorAt(x + 18)}${doorAt(x + 310)}
    ${roofGear(x, 3)}
    ${[100, 200, 290].map((dx) => `<rect x="${x + dx}" y="34" width="26" height="4" rx="2" fill="#a9b2b7"/>`).join('')}
    <rect x="${x + 52}" y="82" width="18" height="6" rx="1.5" fill="#f1efe8"/><text x="${x + 61}" y="87" text-anchor="middle" font-family="Rubik, Arial, sans-serif" font-weight="800" font-size="5" fill="#14231e">${i === 0 ? '0141' : '0142'}</text>
    <circle cx="${x + 8}" cy="98" r="3" fill="#ffe9a6"/><circle cx="${x + 352}" cy="98" r="3" fill="#c8202b"/>
    <path d="M${x + 100} 119 q6 8 12 0" fill="none" stroke="#15181b" stroke-width="2"/><rect x="${x + 120}" y="112" width="34" height="10" rx="2" fill="#3a4248"/><rect x="${x + 250}" y="112" width="30" height="9" rx="2" fill="#3a4248"/>
    <rect x="${x + 96}" y="112" width="60" height="9" rx="2" fill="#2f353a"/><rect x="${x + 200}" y="112" width="46" height="8" rx="2" fill="#2f353a"/>
    ${bogie(x + 62)}${bogie(x + 298)}
  </g>`;
};
const gang = (x) => `<g><rect x="${x}" y="52" width="10" height="58" fill="#15181b"/>${[0, 1, 2, 3].map((n) => `<line x1="${x + 2 + n * 2.2}" y1="52" x2="${x + 2 + n * 2.2}" y2="110" stroke="#2b3136" stroke-width="1"/>`).join('')}</g>`;
const head = (x) => `<g><clipPath id="ch"><path d="M${x} 44 H${x + 224} Q${x + 262} 46 ${x + 284} 72 L${x + 298} 108 V112 H${x} Z"/></clipPath>
    <path d="M${x} 44 H${x + 224} Q${x + 262} 46 ${x + 284} 72 L${x + 298} 108 V112 H${x} Z" fill="${RED}"/>
    <g clip-path="url(#ch)"><rect x="${x}" y="44" width="300" height="5" fill="${DRED}"/>${chevrons(x + 60, x + 250, 80, 112)}<polygon points="${x + 236},112 ${x + 300},112 ${x + 300},84 ${x + 272},72" fill="${GRN}"/><polygon points="${x + 230},112 ${x + 237},112 ${x + 273},72 ${x + 266},72" fill="#fff"/><rect x="${x}" y="106" width="300" height="6" fill="#8e1822"/></g>
    ${doorAt(x + 18)}
    ${[0, 1, 2, 3, 4].map((n) => glass(x + 62 + n * 29, 54, 24, 24)).join('')}
    <path d="M${x + 214} 49 Q${x + 244} 50 ${x + 263} 70 L${x + 270} 80 H${x + 214} Z" fill="#12202a" stroke="#2b343a" stroke-width="1.6"/><path d="M${x + 222} 52 L${x + 250} 54 L${x + 232} 78 H${x + 222} Z" fill="#6f8fa1" opacity=".3"/>
    <rect x="${x + 84}" y="87" width="120" height="15" fill="#fff"/><text x="${x + 144}" y="98.5" text-anchor="middle" font-family="Rubik, Arial Black, sans-serif" font-weight="800" font-size="10.5" fill="${RED}" letter-spacing=".6">УЗ · ЛОКО</text>
    <rect x="${x + 258}" y="92" width="26" height="9" rx="2" fill="#f1efe8"/><text x="${x + 271}" y="99.5" text-anchor="middle" font-family="Rubik, Arial, sans-serif" font-weight="800" font-size="7" fill="#14231e">1919</text>
    <rect x="${x + 270}" y="80" width="12" height="7" rx="2" fill="#fff6dc"/><circle class="in-head" cx="${x + 288}" cy="92" r="4.5" fill="#fff6dc"/><circle class="in-head" cx="${x + 288}" cy="92" r="14" fill="#ffe9a6" opacity=".3"/>
    <rect x="${x + 284}" y="104" width="18" height="6" rx="2" fill="#f2c230"/>
    <path d="M${x + 80} 44 V32 H${x + 150} V44 M${x + 92} 32 L${x + 108} 14 H${x + 126} L${x + 140} 32" fill="none" stroke="#23272b" stroke-width="3"/><rect x="${x + 100}" y="11" width="34" height="5" rx="2" fill="#23272b"/>
    <rect x="${x + 20}" y="36" width="52" height="8" rx="3" fill="#8e979c"/>
    <rect x="${x + 232}" y="41" width="34" height="7" rx="1.5" fill="#0b1114"/><text x="${x + 249}" y="47" text-anchor="middle" font-family="Rubik, Arial, sans-serif" font-weight="800" font-size="5.6" fill="#ffb52e">ЛОКО · КИЇВ</text>
    <path d="M${x + 244} 77 L${x + 262} 66" stroke="#15181b" stroke-width="1.6"/>
    ${bogie(x + 62)}${bogie(x + 232)}
  </g>`;
const WRED = '#d6282f', WDRED = '#a81c24', WGRN = '#3fae3c';
const wwin = (x, y, w, h) => glass(x, y, w, h);
const wheelN = (cx) => `<circle class="not_found_st6" cx="${cx}" cy="285.6" r="15.1"></circle><path class="not_found_st2" d="M${cx} 295.7c-5.6 0-10.1-4.5-10.1-10.1s4.5-10.1 10.1-10.1 10.1 4.5 10.1 10.1c0 5.5-4.6 10.1-10.1 10.1z"></path>`;
/** Вагон 1:1 за зразком (плацкарт УЗ, вигляд збоку): рифлений корпус, 10 вікон (парні зі спущеною рамою), дві торцеві двері, чорна рама, два візки. Малюється в координатах зразка (x 38..1258, y 545..767), далі масштабується до локомотива. */
const WK = 0.745;
const wagon = (i) => {
  const RED = '#d6282f', DK = '#b3202a';
  const xs = [242, 332, 422, 512, 600, 690, 780, 870, 958, 1048];
  const win = (x, n) => {
    const split = n % 2 === 0, w = 49;
    return `<g><rect x="${x}" y="612" width="${w}" height="45" rx="5" fill="#1b1a3a" stroke="#f4f4ee" stroke-width="2.4"/>${split ? `<rect x="${x + 2}" y="613" width="${w - 4}" height="15" rx="3" fill="#f4f4ee"/><rect x="${x + 4}" y="616" width="${w - 8}" height="9" rx="2" fill="#1b1a3a"/><line x1="${x + 2}" y1="634" x2="${x + w - 2}" y2="634" stroke="#f4f4ee" stroke-width="1.6"/>` : ''}<polygon points="${x + 6},${655} ${x + 22},${614} ${x + 32},${614} ${x + 16},${655}" fill="#fff" opacity=".07"/></g>`;
  };
  let ribs = '';
  for (let y = 596; y < 706; y += 7) if (y < 612 || y > 668) ribs += `<line x1="108" y1="${y}" x2="1182" y2="${y}" stroke="${DK}" stroke-width="1.5"/>`;
  for (const y of [624, 636, 648]) { ribs += `<line x1="108" y1="${y}" x2="238" y2="${y}" stroke="${DK}" stroke-width="1.2"/><line x1="1100" y1="${y}" x2="1182" y2="${y}" stroke="${DK}" stroke-width="1.2"/>`; }
  const door = (x) => `<g><rect x="${x}" y="598" width="44" height="108" fill="#a81c24" stroke="#7d1219" stroke-width="2"/><rect x="${x + 8}" y="612" width="28" height="44" rx="3" fill="#1b1a3a" stroke="#f4f4ee" stroke-width="2.2"/><line x1="${x + 8}" y1="634" x2="${x + 36}" y2="634" stroke="#f4f4ee" stroke-width="1.6"/>${[0, 1, 2].map((n) => `<line x1="${x + 8}" y1="${588 + n * 3}" x2="${x + 36}" y2="${588 + n * 3}" stroke="#2a2f33" stroke-width="1.4"/>`).join('')}<rect x="${x + 4}" y="676" width="36" height="6" fill="#7d1219"/></g>`;
  const wheel = (cx) => `<g><circle cx="${cx}" cy="745" r="23" fill="#0e1012"/><circle cx="${cx}" cy="745" r="21.6" fill="url(#wmT)"/><circle cx="${cx}" cy="745" r="18.4" fill="#171b1e"/><g class="in-wh"><circle cx="${cx}" cy="745" r="17.4" fill="url(#wmD)"/><path d="M${cx + 10.0} ${745 + 0.0} L${cx + 16.2} ${745 + 0.0}M${cx + 8.7} ${745 + 5.0} L${cx + 14.0} ${745 + 8.1}M${cx + 5.0} ${745 + 8.7} L${cx + 8.1} ${745 + 14.0}M${cx + 0.0} ${745 + 10.0} L${cx + 0.0} ${745 + 16.2}M${cx + -5.0} ${745 + 8.7} L${cx + -8.1} ${745 + 14.0}M${cx + -8.7} ${745 + 5.0} L${cx + -14.0} ${745 + 8.1}M${cx + -10.0} ${745 + 0.0} L${cx + -16.2} ${745 + 0.0}M${cx + -8.7} ${745 + -5.0} L${cx + -14.0} ${745 + -8.1}M${cx + -5.0} ${745 + -8.7} L${cx + -8.1} ${745 + -14.0}M${cx + -0.0} ${745 + -10.0} L${cx + -0.0} ${745 + -16.2}M${cx + 5.0} ${745 + -8.7} L${cx + 8.1} ${745 + -14.0}M${cx + 8.7} ${745 + -5.0} L${cx + 14.0} ${745 + -8.1}" stroke="#69747b" stroke-width="1.5"/><circle cx="${cx}" cy="745" r="10.6" fill="none" stroke="#2f363b" stroke-width="2.2"/><circle cx="${cx}" cy="745" r="8.2" fill="url(#wmH)"/><circle cx="${cx + 5.2}" cy="${745 + 0.0}" r="1.1" fill="#4b545a"/><circle cx="${cx + 2.6}" cy="${745 + 4.5}" r="1.1" fill="#4b545a"/><circle cx="${cx + -2.6}" cy="${745 + 4.5}" r="1.1" fill="#4b545a"/><circle cx="${cx + -5.2}" cy="${745 + 0.0}" r="1.1" fill="#4b545a"/><circle cx="${cx + -2.6}" cy="${745 + -4.5}" r="1.1" fill="#4b545a"/><circle cx="${cx + 2.6}" cy="${745 + -4.5}" r="1.1" fill="#4b545a"/><circle cx="${cx}" cy="745" r="2.8" fill="#23282c"/></g><path d="M${cx - 20} 740 A21 21 0 0 1 ${cx - 6} 724.5" fill="none" stroke="#fff" stroke-width="1.6" opacity=".22"/></g>`;
  const bog = (cx) => `<g><rect x="${cx - 96}" y="722" width="192" height="12" rx="5" fill="#15181b"/><rect x="${cx - 70}" y="712" width="140" height="12" fill="#1f2428"/>${[-62, 62].map((d) => `<rect x="${cx + d - 13}" y="724" width="26" height="10" rx="2" fill="#23282c"/><path d="M${cx + d - 9} 722 l4 -5 l-8 -3 l8 -3 l-8 -3 l8 -3" fill="none" stroke="#6d767b" stroke-width="2"/>`).join('')}<rect x="${cx - 40}" y="738" width="6" height="10" fill="#59636a"/><rect x="${cx + 34}" y="738" width="6" height="10" fill="#59636a"/>${[-62, 62].map((d) => `<rect x="${cx + d + (d < 0 ? 17 : -24)}" y="733" width="7" height="24" rx="2.5" fill="#15181b"/>`).join('')}<rect x="${cx - 58}" y="728" width="116" height="6" fill="#2a3036"/>${wheel(cx - 62)}${wheel(cx + 62)}<rect x="${cx - 24}" y="736" width="48" height="5" fill="#3a4248"/></g>`;
  const label = ['FC LOKOMOTYV KYIV 1919', 'УКРЗАЛІЗНИЦЯ · ЛОКО', 'ЗАЛІЗНИЧНИКИ · КИЇВ', 'ЛОКО · ВПЕРЕД!', 'КИЇВ · 1919', 'РИКОШЕТ · ЛОКО'][i];
  return `<g>
    <rect x="38" y="705" width="1220" height="15" fill="#101214"/>
    <rect x="520" y="719" width="46" height="18" fill="#101214"/><rect x="330" y="719" width="110" height="9" fill="#101214"/><rect x="705" y="719" width="152" height="10" fill="#101214"/><rect x="900" y="719" width="60" height="8" fill="#101214"/>
    <path d="M44 590 V563 Q44 545 72 545 H1226 Q1252 545 1252 566 V590 Z" fill="#e4e5e3"/><path d="M44 575 H1252 V590 H44 Z" fill="#cfd1cf"/>
    <rect x="140" y="552" width="40" height="12" fill="#b9bcbd"/><rect x="146" y="544" width="10" height="10" fill="#9ea2a4"/><rect x="164" y="544" width="10" height="10" fill="#9ea2a4"/>
    <rect x="1128" y="546" width="14" height="10" fill="#aeb2b3"/><rect x="1188" y="544" width="14" height="12" fill="#aeb2b3"/>
    <rect x="42" y="585" width="1212" height="122" rx="3" fill="${RED}"/>
    ${ribs}
    <rect x="108" y="660" width="1072" height="8" fill="#3fae3c"/><rect x="108" y="668" width="1072" height="2.4" fill="#f4f4ee"/>
    <text x="640" y="697" text-anchor="middle" font-family="Rubik, Arial Black, sans-serif" font-weight="800" font-size="19" fill="#fff" letter-spacing="4">${label}</text>
    ${xs.map(win).join('')}
    <rect x="1130" y="614" width="32" height="42" rx="4" fill="#1b1a3a" stroke="#f4f4ee" stroke-width="2.2"/>
    ${door(62)}${door(1186)}
    <rect x="38" y="585" width="24" height="132" fill="#15181b"/><rect x="1236" y="585" width="22" height="132" fill="#15181b"/>
    <text x="230" y="590" font-family="Rubik, Arial, sans-serif" font-weight="700" font-size="9" fill="#fff" opacity=".8">61 22 20-77 0${20 + i + 1}-4</text>
    ${bog(210)}${bog(1060)}
  </g>`;
};
const gangN = (x) => `<g><rect x="${x}" y="170" width="24" height="86" fill="#15181b"/>${[0, 1, 2, 3, 4].map((n) => `<line x1="${x + 2 + n * 2.6}" y1="170" x2="${x + 2 + n * 2.6}" y2="256" stroke="#2b3136" stroke-width="1"/>`).join('')}<rect x="${x - 4}" y="254" width="22" height="7" fill="#444"/></g>`;
const TRAIN = `<svg class="in-train" viewBox="-5217 128 6097 182" aria-hidden="true"><defs><radialGradient id="wmT" cx="35%" cy="30%"><stop offset="0" stop-color="#cdd5d9"/><stop offset="1" stop-color="#4a545b"/></radialGradient><radialGradient id="wmD" cx="40%" cy="35%"><stop offset="0" stop-color="#6a757c"/><stop offset="1" stop-color="#2a3035"/></radialGradient><radialGradient id="wmH" cx="35%" cy="30%"><stop offset="0" stop-color="#e3e8ea"/><stop offset="1" stop-color="#7b858b"/></radialGradient></defs>${[0, 1, 2, 3, 4, 5].reverse().map((k) => { const fx = -602 - k * 923; return `<g class="in-w" data-cx="${fx + 454}"><g transform="translate(${fx} 300) scale(${WK}) translate(-38 -765)">${wagon(k)}</g>${gangN(fx + 905)}</g>`; }).join('')}<g id="not_found_train" transform="translate(1190 0) scale(-1 1)"><clipPath id="lcClip"><path d="M321.8 300.7v-32.4s1.2.7-1.5-2.4v-29.1s3.1-11.6 10.7-21.1c0 0 7.6-12 15.5-17.5h1.3s10.2-4.9 30.9-28h.6s-.9-1.4 0-2.7c0 0 10.1-10.5 21-12.3 0 0 9.4-1.8 20.2-1.8h47.7V151H492v-1.1h10.1v1.1h19v2.2s8.2.9 19.2-4.2c0 0 1.4-1.1 28.8-1.1h291.5v6.8h7.5v2.2s12.2-.6 12.2 9.8V177l-10-.1v57.9s14.9-.5 14.9 10.2c0 0 1 9-14.9 8.9v3.8H719.5s-2.4.1-4.3 3l-15 29s-2.9 5.1-10.8 5.1H504.3s-2.9.1-6.1-5l-13.1-25s-4.5-7.1-11.8-7.1H369v2.4s-3.2 1.3-7.1 8.7L351.4 289s-2.9 6.3-6.9 6.4h-17.8l-4.9 5.3z"/></clipPath><path fill="#b3dcdf" d="M344.5 248.5h507.2v37.8H344.5z"></path><g id="not_found_wheels"><circle class="not_found_st6" cx="384.1" cy="285.6" r="15.1"></circle><path class="not_found_st2" d="M384.1 295.7c-5.6 0-10.1-4.5-10.1-10.1s4.5-10.1 10.1-10.1 10.1 4.5 10.1 10.1c0 5.5-4.6 10.1-10.1 10.1z"></path><circle class="not_found_st6" cx="416.1" cy="285.6" r="15.1"></circle><path class="not_found_st2" d="M416.1 295.7c-5.6 0-10.1-4.5-10.1-10.1s4.5-10.1 10.1-10.1 10.1 4.5 10.1 10.1c0 5.5-4.6 10.1-10.1 10.1z"></path><circle class="not_found_st6" cx="469.1" cy="285.6" r="15.1"></circle><path class="not_found_st2" d="M469.1 295.7c-5.6 0-10.1-4.5-10.1-10.1s4.5-10.1 10.1-10.1 10.1 4.5 10.1 10.1c0 5.5-4.6 10.1-10.1 10.1z"></path><circle class="not_found_st6" cx="734.1" cy="285.6" r="15.1"></circle><path class="not_found_st2" d="M734.1 295.7c-5.6 0-10.1-4.5-10.1-10.1s4.5-10.1 10.1-10.1 10.1 4.5 10.1 10.1c0 5.5-4.6 10.1-10.1 10.1z"></path><circle class="not_found_st6" cx="766.1" cy="285.6" r="15.1"></circle><path class="not_found_st2" d="M766.1 295.7c-5.6 0-10.1-4.5-10.1-10.1s4.5-10.1 10.1-10.1 10.1 4.5 10.1 10.1c0 5.5-4.6 10.1-10.1 10.1z"></path><circle class="not_found_st6" cx="821.1" cy="285.6" r="15.1"></circle><path class="not_found_st2" d="M821.1 295.7c-5.6 0-10.1-4.5-10.1-10.1s4.5-10.1 10.1-10.1 10.1 4.5 10.1 10.1c0 5.5-4.6 10.1-10.1 10.1z"></path></g><path id="not_found_bracefront" class="not_found_st7" d="M383.2 285.6h88.1"></path><path id="not_found_braceback" class="not_found_st7" d="M733.2 285.6h88.1"></path><g id="not_found_car-layers"><path id="not_found_car" class="not_found_st8" d="M321.8 300.7v-32.4s1.2.7-1.5-2.4v-29.1s3.1-11.6 10.7-21.1c0 0 7.6-12 15.5-17.5h1.3s10.2-4.9 30.9-28h.6s-.9-1.4 0-2.7c0 0 10.1-10.5 21-12.3 0 0 9.4-1.8 20.2-1.8h47.7V151H492v-1.1h10.1v1.1h19v2.2s8.2.9 19.2-4.2c0 0 1.4-1.1 28.8-1.1h291.5v6.8h7.5v2.2s12.2-.6 12.2 9.8V177l-10-.1v57.9s14.9-.5 14.9 10.2c0 0 1 9-14.9 8.9v3.8H719.5s-2.4.1-4.3 3l-15 29s-2.9 5.1-10.8 5.1H504.3s-2.9.1-6.1-5l-13.1-25s-4.5-7.1-11.8-7.1H369v2.4s-3.2 1.3-7.1 8.7L351.4 289s-2.9 6.3-6.9 6.4h-17.8l-4.9 5.3z"></path><g clip-path="url(#lcClip)"><polygon points="355,300 385,300 360,246 330,246" fill="#3fae3c"/><polygon points="348,300 355,300 330,246 323,246" fill="#fff"/><polygon points="417,300 447,300 422,246 392,246" fill="#3fae3c"/><polygon points="410,300 417,300 392,246 385,246" fill="#fff"/><polygon points="479,300 509,300 484,246 454,246" fill="#3fae3c"/><polygon points="472,300 479,300 454,246 447,246" fill="#fff"/><polygon points="541,300 571,300 546,246 516,246" fill="#3fae3c"/><polygon points="534,300 541,300 516,246 509,246" fill="#fff"/><polygon points="603,300 633,300 608,246 578,246" fill="#3fae3c"/><polygon points="596,300 603,300 578,246 571,246" fill="#fff"/><polygon points="665,300 695,300 670,246 640,246" fill="#3fae3c"/><polygon points="658,300 665,300 640,246 633,246" fill="#fff"/><polygon points="727,300 757,300 732,246 702,246" fill="#3fae3c"/><polygon points="720,300 727,300 702,246 695,246" fill="#fff"/><polygon points="789,300 819,300 794,246 764,246" fill="#3fae3c"/><polygon points="782,300 789,300 764,246 757,246" fill="#fff"/><polygon points="851,300 881,300 856,246 826,246" fill="#3fae3c"/><polygon points="844,300 851,300 826,246 819,246" fill="#fff"/></g><path id="not_found_streamline-outine" class="not_found_st8" d="M320.3 236.6s1.4-6.8 4.4-11.3c0 0 .1-2.3 23.2-6.3l78-16.6s103.3-21.1 134.9-26.1c0 0 93.3-16 120.5-17.9 0 0 57.6-4.3 100-4.1h88.9v63.4s-10.3 5.4-17.1 5.3c0 0-305.6 4.9-366.3 8.1 0 0-100.3 4.8-119.1 6.8 0-.1-46.6 1.2-47.4-1.3z"></path><g id="not_found_window-grate"><path class="not_found_st9" d="M739.5 182.6H854"></path><path class="not_found_st9" d="M739.5 177.6H854"></path><path class="not_found_st9" d="M739.5 172.6H854"></path><path class="not_found_st9" d="M739.5 167.6H854"></path><path class="not_found_st9" d="M739.5 161.4H854v26.1H739.5z"></path></g><path class="not_found_st9" d="M320.3 257.8h549.9"></path><g id="not_found_ladders"><g id="not_found_ladder-f"><path id="not_found_front-ladder" class="not_found_st8" d="M433.8 258.4h17.8v34.8h-17.8z"></path><path id="not_found_fb-rung" class="not_found_st9" d="M433.8 281.1h17.7"></path><path id="not_found_ft-rung" class="not_found_st9" d="M433.8 268.6h17.7"></path></g><g id="not_found_ladder-b"><path id="not_found_ladder-back" class="not_found_st8" d="M851.8 257.8h17.8v34.8h-17.8z"></path><path id="not_found_bt-rung" class="not_found_st9" d="M851.8 268.6h17.7"></path><path id="not_found_bb-rung" class="not_found_st9" d="M851.8 281.1h17.7"></path></g></g><path id="not_found_window-front" class="not_found_st8" d="M350.5 196.4s-.4 3.9 15.2 4.3l32.3-30.3s-18.2 1.1-19-.8l-28.5 26.8z"></path></g></g><text x="783" y="230" text-anchor="middle" class="in-ltx" font-size="21">ЛОКО</text><text x="440" y="212" text-anchor="middle" class="in-ltx" font-size="18">LOKOMOTYV KYIV 1919</text></svg>`;

const HILL = 'M0 120 C80 70 170 50 260 84 C340 112 420 52 520 66 C620 80 700 108 800 76 C880 52 950 84 1000 100 V120Z';
const SCENERY = `<div class="in-clouds">${[8, 20, 34, 14, 28].map((t, i) => `<i style="top:${t}%;--d:${i * -9}s;--sp:${28 + i * 7}s;--s:${0.7 + (i % 3) * 0.3}"></i>`).join('')}</div>
  <svg class="in-hills h2" viewBox="0 0 2000 120" preserveAspectRatio="none" aria-hidden="true"><g fill="#a7d6bd"><path d="${HILL}"/><path transform="translate(1000 0)" d="${HILL}"/></g></svg>
  <svg class="in-hills h1" viewBox="0 0 2000 120" preserveAspectRatio="none" aria-hidden="true"><g fill="#5db070"><path transform="translate(-300 20) scale(1 .8)" d="${HILL}"/><path transform="translate(700 20) scale(1 .8)" d="${HILL}"/><path transform="translate(1700 20) scale(1 .8)" d="${HILL}"/></g></svg>`;

export function playIntro(root, done) {
  const el = document.createElement('section');
  el.className = 'intro'; el.id = 'intro';
  const year = [...'1919'].map((c, i) => `<s style="--i:${i}">${c}</s>`).join('');
  const word = (t, cls) => [...t].map((c, i) => `<s class="${cls}" style="--i:${i}">${c}</s>`).join('');
  el.innerHTML = `${SCENERY}
    <div class="in-flash"></div><div class="in-rays"></div>
    <div class="in-ground"><div class="in-sleepers"></div><div class="in-rail"></div></div>
    <div class="in-run">${TRAIN}</div>
    <div class="in-sem red"><div class="in-lamp"><i class="r"></i><i class="g"></i></div><b class="in-say"><span class="s1">СТОП</span><span class="s2">ВПЕРЕД!</span></b></div>
    <div class="in-chant" data-s=""><b class="q">ХТО МИ?</b><b class="a">ЛОКО!</b></div>
    <div class="in-cards" id="in-cards"></div>
    <div class="in-year" hidden><small>КИЇВСЬКІ ЗАЛІЗНИЧНИКИ З</small><div class="in-flap">${year}</div></div>
    <div class="in-crest">${lokoCrest()}</div>
    <h1 class="in-title"><div class="t1">${word('ЛОКОМОТИВ', 'a')}</div><div class="t2">${word('РИКОШЕТ', 'b')}</div></h1>
    <div class="in-slip"><span>РЕЙС №1</span><b>КИЇВ → ЛІГА ЧЕМПІОНІВ</b><i></i></div>
    <button class="in-skip" aria-label="Пропустити">ПРОПУСТИТИ ›</button>`;
  root.appendChild(el);

  let finished = false;
  const T = [];
  const at = (ms, fn) => T.push(setTimeout(fn, ms));
  const end = () => {
    if (finished) return; finished = true; T.forEach(clearTimeout); cancelAnimationFrame(raf);
    try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    el.classList.add('out');
    setTimeout(() => { el.remove(); }, 700);
    done();
  };
  el.addEventListener('click', end);

  // плавний рух і фізика: кожен вагон — окрема маса на пружно-демпферних зчепках
  const sem = el.querySelector('.in-sem'), run = el.querySelector('.in-run'), ws = [...el.querySelectorAll('.in-w')], N = ws.length, VB = 6097;
  const cxs = ws.map((w) => +w.dataset.cx), r = new Float32Array(N), vr = new Float32Array(N);
  const K = 130, C = 15, LIM = 9;
  run.style.animation = 'none';
  const scen = el.getAnimations({ subtree: true }).filter((an) => /^(hill|sleep)$/.test(an.animationName || ''));
  let last = performance.now(), t0 = last, xPrev = null, vPrev = 0, dist = 0, raf = 0;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const frame = (now) => {
    if (finished) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = (now - t0) / 1000, vw = innerWidth, Wpx = run.getBoundingClientRect().width || 1;
    const TA = 3.0, TH = 4.2, TD = 6.5, x0 = -0.08 * vw - Wpx, x1 = 0.86 * vw - Wpx, x2 = 1.03 * vw;
    let x;
    if (t < TA) x = x0 + (x1 - x0) * (1 - Math.pow(1 - t / TA, 3));            // заїзд і плавне гальмування перед червоним
    else if (t < TH) x = x1;                                                      // стоїть: червоний → зелений
    else { const q = Math.min(1, (t - TH) / TD); x = x1 + (x2 - x1) * (0.5 - 0.5 * Math.cos(Math.PI * q)); }   // м'який розгін, проходять усі вагони
    if (t > 3.5 && sem.classList.contains('red')) { sem.classList.replace('red', 'green'); audio.click(); audio.bell(); }
    run.style.transform = `translateX(${x.toFixed(2)}px)`;
    if (xPrev === null || dt <= 0) { xPrev = x; return; }
    const v = (x - xPrev) / dt, upx = Wpx / VB, a = (v - vPrev) / dt / upx;
    xPrev = x; vPrev = v; dist += (Math.abs(v) / upx) * dt;
    const sf = clamp(Math.abs(v) / (0.45 * vw), 0, 1);
    for (let i = 0; i < N; i++) {
      const prev = i === 0 ? 0 : r[i - 1], vprev = i === 0 ? 0 : vr[i - 1];
      const next = i === N - 1 ? r[i] : r[i + 1], vnext = i === N - 1 ? vr[i] : vr[i + 1];
      const F = -a + K * (prev - r[i]) + C * (vprev - vr[i]) - K * (r[i] - next) - C * (vr[i] - vnext);
      vr[i] += F * dt; r[i] = clamp(r[i] + vr[i] * dt, -LIM, LIM);
      const ph = ((dist + i * 923) / 425) * Math.PI * 2;
      const dy = -Math.abs(Math.sin(ph)) * 0.9 * sf, rot = Math.sin(ph + 1.3) * 0.16 * sf + clamp(a * 0.0009, -0.35, 0.35);
      ws[i].setAttribute('transform', `translate(${r[i].toFixed(2)} ${dy.toFixed(2)}) rotate(${rot.toFixed(3)} ${cxs[i]} 300)`);
    }
    const rate = clamp(Math.abs(v) / (0.18 * vw), 0.0001, 6);
    for (const an of scen) an.playbackRate = rate;
    run.style.setProperty('--wp', Math.abs(v) < 8 ? 'paused' : 'running');
    run.style.setProperty('--ws', clamp(138 / Math.max(1, Math.abs(v) / upx), 0.06, 3).toFixed(3) + 's');
  };
  raf = requestAnimationFrame(frame);

  // звук і сценарій: гудок, зупинка, зелений, відправлення, фінал із чантом «Хто ми? — ЛОКО!»
  const CARDS = [
    ['ФК ЛОКОМОТИВ', 'КИЇВ · ЗАЛІЗНИЧНИКИ', 0],
    ['1919', 'РІК ЗАСНУВАННЯ · НАЙСТАРІШИЙ КЛУБ КИЄВА', 1],
    ['ЗАЛІЗНИЧНИКИ', 'КЛУБ ПІВДЕННО-ЗАХІДНОЇ ЗАЛІЗНИЦІ', 0],
    ['СТОП → ВПЕРЕД', 'ЧЕРВОНИЙ І ЗЕЛЕНИЙ — СИГНАЛИ ЗАЛІЗНИЦІ', 0],
    ['5× ЧЕМПІОН КИЄВА', 'ПЕРЕМОГИ, ЯКІ ВАРТО ПАМ’ЯТАТИ', 0],
    ['СТАДІОН «ЛОКОМОТИВ»', 'З 1925 РОКУ · 1631 МІСЦЕ', 0],
    ['ДАВАЙ, ЛОКО!', 'ВІД ДРУГОЇ ЛІГИ ДО ЛІГИ ЧЕМПІОНІВ', 0],
  ];
  const box = el.querySelector('#in-cards');
  CARDS.forEach(([big, sub, flap], i) => {
    const c = document.createElement('div'); c.className = 'in-card';
    const head = flap ? `<div class="in-cf">${[...big].map((ch, k) => `<s style="--i:${k}">${ch}</s>`).join('')}</div>` : `<b>${big}</b>`;
    c.innerHTML = `<i class="in-ci">${lokoCrest()}</i><div>${head}<small>${sub}</small></div>`;
    box.appendChild(c);
    at(500 + i * 1150, () => c.classList.add('on'));
    at(500 + i * 1150 + 1000, () => c.classList.remove('on'));
  });
  const chant = el.querySelector('.in-chant');
  const shout = (kind) => { chant.dataset.s = ''; void chant.offsetWidth; chant.dataset.s = kind; };
  at(150, () => audio.horn());
  at(400, () => audio.rumble());
  at(2900, () => audio.thud());
  at(4200, () => { audio.horn(); audio.rumble(); });
  at(8800, () => { el.classList.add('fin'); audio.horn(); audio.thud(); });
  at(10300, () => { shout('q'); say('Хто ми?', 0.5, 0.85, 1); });
  at(11300, () => { shout('a'); say('Локо!', 1.0, 1.0, 1); audio.crowd(0.98); audio.horn(); });
  at(12300, () => { shout('q'); say('Хто ми?', 0.5, 0.85, 1); });
  at(13200, () => { shout('b'); say('Локо!', 1.1, 1.05, 1); audio.crowd(1); audio.horn(); audio.thud(); });
  at(15000, end);
  el.classList.add('go');
}
