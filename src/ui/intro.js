import { audio } from '../core/audio.js';
import { lokoCrest } from './icons.js';

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
const TRAIN = `<svg class="in-train" viewBox="310 140 570 170" aria-hidden="true"><g id="not_found_train"><path fill="#b3dcdf" d="M344.5 248.5h507.2v37.8H344.5z"></path><g id="not_found_wheels"><circle class="not_found_st6" cx="384.1" cy="285.6" r="15.1"></circle><path class="not_found_st2" d="M384.1 295.7c-5.6 0-10.1-4.5-10.1-10.1s4.5-10.1 10.1-10.1 10.1 4.5 10.1 10.1c0 5.5-4.6 10.1-10.1 10.1z"></path><circle class="not_found_st6" cx="416.1" cy="285.6" r="15.1"></circle><path class="not_found_st2" d="M416.1 295.7c-5.6 0-10.1-4.5-10.1-10.1s4.5-10.1 10.1-10.1 10.1 4.5 10.1 10.1c0 5.5-4.6 10.1-10.1 10.1z"></path><circle class="not_found_st6" cx="469.1" cy="285.6" r="15.1"></circle><path class="not_found_st2" d="M469.1 295.7c-5.6 0-10.1-4.5-10.1-10.1s4.5-10.1 10.1-10.1 10.1 4.5 10.1 10.1c0 5.5-4.6 10.1-10.1 10.1z"></path><circle class="not_found_st6" cx="734.1" cy="285.6" r="15.1"></circle><path class="not_found_st2" d="M734.1 295.7c-5.6 0-10.1-4.5-10.1-10.1s4.5-10.1 10.1-10.1 10.1 4.5 10.1 10.1c0 5.5-4.6 10.1-10.1 10.1z"></path><circle class="not_found_st6" cx="766.1" cy="285.6" r="15.1"></circle><path class="not_found_st2" d="M766.1 295.7c-5.6 0-10.1-4.5-10.1-10.1s4.5-10.1 10.1-10.1 10.1 4.5 10.1 10.1c0 5.5-4.6 10.1-10.1 10.1z"></path><circle class="not_found_st6" cx="821.1" cy="285.6" r="15.1"></circle><path class="not_found_st2" d="M821.1 295.7c-5.6 0-10.1-4.5-10.1-10.1s4.5-10.1 10.1-10.1 10.1 4.5 10.1 10.1c0 5.5-4.6 10.1-10.1 10.1z"></path></g><path id="not_found_bracefront" class="not_found_st7" d="M383.2 285.6h88.1"></path><path id="not_found_braceback" class="not_found_st7" d="M733.2 285.6h88.1"></path><g id="not_found_car-layers"><path id="not_found_car" class="not_found_st8" d="M321.8 300.7v-32.4s1.2.7-1.5-2.4v-29.1s3.1-11.6 10.7-21.1c0 0 7.6-12 15.5-17.5h1.3s10.2-4.9 30.9-28h.6s-.9-1.4 0-2.7c0 0 10.1-10.5 21-12.3 0 0 9.4-1.8 20.2-1.8h47.7V151H492v-1.1h10.1v1.1h19v2.2s8.2.9 19.2-4.2c0 0 1.4-1.1 28.8-1.1h291.5v6.8h7.5v2.2s12.2-.6 12.2 9.8V177l-10-.1v57.9s14.9-.5 14.9 10.2c0 0 1 9-14.9 8.9v3.8H719.5s-2.4.1-4.3 3l-15 29s-2.9 5.1-10.8 5.1H504.3s-2.9.1-6.1-5l-13.1-25s-4.5-7.1-11.8-7.1H369v2.4s-3.2 1.3-7.1 8.7L351.4 289s-2.9 6.3-6.9 6.4h-17.8l-4.9 5.3z"></path><path id="not_found_streamline-outine" class="not_found_st8" d="M320.3 236.6s1.4-6.8 4.4-11.3c0 0 .1-2.3 23.2-6.3l78-16.6s103.3-21.1 134.9-26.1c0 0 93.3-16 120.5-17.9 0 0 57.6-4.3 100-4.1h88.9v63.4s-10.3 5.4-17.1 5.3c0 0-305.6 4.9-366.3 8.1 0 0-100.3 4.8-119.1 6.8 0-.1-46.6 1.2-47.4-1.3z"></path><g id="not_found_window-grate"><path class="not_found_st9" d="M739.5 182.6H854"></path><path class="not_found_st9" d="M739.5 177.6H854"></path><path class="not_found_st9" d="M739.5 172.6H854"></path><path class="not_found_st9" d="M739.5 167.6H854"></path><path class="not_found_st9" d="M739.5 161.4H854v26.1H739.5z"></path></g><path class="not_found_st9" d="M320.3 257.8h549.9"></path><g id="not_found_Text"><text transform="translate(377.037 230.025)" class="not_found_st8 not_found_st10" font-size="21">ЛОКО</text><text transform="translate(640 213.994)" class="not_found_st8 not_found_st10" font-size="21">LOKOMOTYV KYIV 1919</text></g><g id="not_found_ladders"><g id="not_found_ladder-f"><path id="not_found_front-ladder" class="not_found_st8" d="M433.8 258.4h17.8v34.8h-17.8z"></path><path id="not_found_fb-rung" class="not_found_st9" d="M433.8 281.1h17.7"></path><path id="not_found_ft-rung" class="not_found_st9" d="M433.8 268.6h17.7"></path></g><g id="not_found_ladder-b"><path id="not_found_ladder-back" class="not_found_st8" d="M851.8 257.8h17.8v34.8h-17.8z"></path><path id="not_found_bt-rung" class="not_found_st9" d="M851.8 268.6h17.7"></path><path id="not_found_bb-rung" class="not_found_st9" d="M851.8 281.1h17.7"></path></g></g><path id="not_found_window-front" class="not_found_st8" d="M350.5 196.4s-.4 3.9 15.2 4.3l32.3-30.3s-18.2 1.1-19-.8l-28.5 26.8z"></path></g></g></svg>`;

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
    <div class="in-sem"><div class="in-lamp"><i class="r"></i><i class="g"></i></div><b class="in-say"><span class="s1">СТОП</span><span class="s2">ВПЕРЕД!</span></b></div>
    <div class="in-year"><small>КИЇВСЬКІ ЗАЛІЗНИЧНИКИ З</small><div class="in-flap">${year}</div></div>
    <div class="in-crest">${lokoCrest()}</div>
    <h1 class="in-title"><div class="t1">${word('ЛОКОМОТИВ', 'a')}</div><div class="t2">${word('РИКОШЕТ', 'b')}</div></h1>
    <div class="in-slip"><span>РЕЙС №1</span><b>КИЇВ → ЛІГА ЧЕМПІОНІВ</b><i></i></div>
    <button class="in-skip" aria-label="Пропустити">ПРОПУСТИТИ ›</button>`;
  root.appendChild(el);

  let finished = false;
  const T = [];
  const at = (ms, fn) => T.push(setTimeout(fn, ms));
  const end = () => {
    if (finished) return; finished = true; T.forEach(clearTimeout);
    el.classList.add('out');
    setTimeout(() => { el.remove(); }, 700);
    done();
  };
  el.addEventListener('click', end);

  // звук: гудок, хід поїзда, світлофор, удар печатки
  at(150, () => audio.horn());
  at(400, () => audio.rumble());
  at(2500, () => audio.thud());
  at(3700, () => audio.horn());
  at(3800, () => audio.rumble());
  at(3300, () => audio.click());
  at(4200, () => { audio.click(); audio.bell(); });
  at(5200, () => { audio.horn(); audio.thud(); });
  at(7600, end);
  el.classList.add('go');
}
