import { audio } from '../core/audio.js';
import { lokoCrest } from './icons.js';

/** Потяг у стилі клубного автобуса й УЗ: червоний корпус, зелені шеврони, білий фірмовий пояс, силует носорога. Рухається вправо, кабіна праворуч. */
const rhino = (x, y, k) => `<g transform="translate(${x} ${y}) scale(${k})"><path fill="#15191c" d="M0 78 C-4 50 10 22 40 14 C58 8 74 12 88 24 L112 6 L104 34 C120 42 122 62 108 76 C100 86 86 88 76 82 C70 94 52 96 44 86 C34 92 12 94 0 78Z"/><path fill="#d6282f" d="M30 40 C46 30 66 32 78 44 C70 52 52 56 38 54Z"/><path fill="#15191c" d="M38 36 L70 40 L60 48Z"/><circle cx="62" cy="43" r="3.2" fill="#46e06a"/><path fill="none" stroke="#15191c" stroke-width="5" d="M6 70 C16 84 34 90 52 82"/></g>`;
const car = (x, i) => {
  const chev = [0, 1, 2, 3, 4].map((n) => `<polygon points="${x + 120 + n * 30},112 ${x + 150 + n * 30},112 ${x + 182 + n * 30},68 ${x + 152 + n * 30},68" fill="#3fae3c"/><polygon points="${x + 114 + n * 30},112 ${x + 120 + n * 30},112 ${x + 152 + n * 30},68 ${x + 146 + n * 30},68" fill="#fff"/>`).join('');
  const win = Array.from({ length: 8 }, (_, n) => `<rect x="${x + 28 + n * 28}" y="52" width="24" height="20" rx="2" fill="#1a2630"/><rect x="${x + 28 + n * 28}" y="52" width="24" height="6" rx="2" fill="#3b5666" opacity=".7"/>`).join('');
  return `<g><rect x="${x}" y="40" width="258" height="72" rx="9" fill="#d6282f"/><clipPath id="cc${i}"><rect x="${x}" y="40" width="258" height="72" rx="9"/></clipPath>
    <g clip-path="url(#cc${i})">${chev}${i === 0 ? rhino(x + 8, 52, 0.62) : ''}</g>
    <rect x="${x}" y="40" width="258" height="6" rx="3" fill="#a81c24"/>${win}
    <rect x="${x + 30}" y="86" width="210" height="15" fill="#fff"/><text x="${x + 135}" y="98" text-anchor="middle" font-family="Rubik, Arial Black, sans-serif" font-weight="800" font-size="10.5" fill="#d6282f" letter-spacing=".6">${i === 1 ? 'FC LOKOMOTYV KYIV 1919' : 'УКРЗАЛІЗНИЦЯ · ЛОКО'}</text>
    ${i === 0 ? `<text x="${x + 10}" y="48" font-family="Rubik, Arial Black, sans-serif" font-weight="800" font-size="9" fill="none" stroke="#fff" stroke-width=".7" letter-spacing="1">FCLK</text>` : ''}
    <rect x="${x + 4}" y="106" width="250" height="6" fill="#23272b"/>
    ${[x + 36, x + 190].map((bx) => `<g><rect x="${bx - 22}" y="112" width="52" height="9" rx="3" fill="#23272b"/><circle cx="${bx - 10}" cy="128" r="13" fill="#1b1e21"/><circle cx="${bx - 10}" cy="128" r="7" fill="#c8cfd3"/><circle cx="${bx + 14}" cy="128" r="13" fill="#1b1e21"/><circle cx="${bx + 14}" cy="128" r="7" fill="#c8cfd3"/></g>`).join('')}
    <rect x="${x + 258}" y="94" width="8" height="6" fill="#444"/></g>`;
};
const TRAIN = `<svg class="in-train" viewBox="0 0 860 146" aria-hidden="true">
  ${car(0, 0)}${car(266, 1)}
  <g>
    <path d="M532 40 H690 L742 72 L754 108 V112 H532 Z" fill="#d6282f"/>
    <clipPath id="cl"><path d="M532 40 H690 L742 72 L754 108 V112 H532 Z"/></clipPath>
    <g clip-path="url(#cl)"><polygon points="560,112 590,112 622,68 592,68" fill="#3fae3c"/><polygon points="640,112 670,112 702,68 672,68" fill="#3fae3c"/><polygon points="718,112 760,112 760,76 742,72" fill="#3fae3c"/><polygon points="554,112 560,112 592,68 586,68" fill="#fff"/><polygon points="634,112 640,112 672,68 666,68" fill="#fff"/></g>
    <path d="M690 40 L742 72 L728 72 L690 52 Z" fill="#a81c24"/>
    <path d="M700 50 L736 70 H700 Z" fill="#1a2630"/><path d="M706 53 L726 65 H706 Z" fill="#3b5666" opacity=".7"/>
    <rect x="548" y="52" width="40" height="22" rx="2" fill="#1a2630"/><rect x="600" y="52" width="40" height="22" rx="2" fill="#1a2630"/><rect x="652" y="52" width="36" height="22" rx="2" fill="#1a2630"/>
    <rect x="584" y="86" width="104" height="14" fill="#fff"/><text x="636" y="97" text-anchor="middle" font-family="Rubik, Arial Black, sans-serif" font-weight="800" font-size="11" fill="#d6282f">УЗ · ЛОКО</text>
    <rect x="532" y="104" width="224" height="8" fill="#23272b"/>
    <circle class="in-head" cx="746" cy="94" r="5" fill="#fff6dc"/><circle class="in-head" cx="746" cy="94" r="12" fill="#ffe9a6" opacity=".35"/><rect x="740" y="102" width="14" height="5" rx="2" fill="#ffb52e"/>
    <path d="M580 40 V26 H640 V40 M590 26 L610 8 L630 26" fill="none" stroke="#23272b" stroke-width="3"/><rect x="596" y="4" width="28" height="5" rx="2" fill="#23272b"/>
    ${[560, 700].map((bx) => `<g><rect x="${bx - 22}" y="112" width="52" height="9" rx="3" fill="#23272b"/><circle cx="${bx - 10}" cy="128" r="13" fill="#1b1e21"/><circle cx="${bx - 10}" cy="128" r="7" fill="#c8cfd3"/><circle cx="${bx + 14}" cy="128" r="13" fill="#1b1e21"/><circle cx="${bx + 14}" cy="128" r="7" fill="#c8cfd3"/></g>`).join('')}
  </g>
</svg>`;

const STATION = `<svg class="in-station" viewBox="0 0 1200 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <rect x="0" y="150" width="1200" height="50" fill="#2a3338"/><rect x="0" y="150" width="1200" height="6" fill="#ffd23a"/>
  <path d="M60 60 H1140 V76 H60Z" fill="#1c2428"/><path d="M40 52 H1160 L1148 60 H52Z" fill="#2c363b"/>
  ${[120, 360, 600, 840, 1080].map((x) => `<rect x="${x}" y="76" width="8" height="76" fill="#3a444a"/><circle cx="${x + 4}" cy="84" r="6" fill="#ffe9a6"/><circle cx="${x + 4}" cy="84" r="22" fill="#ffe9a6" opacity=".12"/>`).join('')}
  <rect x="520" y="96" width="160" height="34" rx="4" fill="#0f4a8a" stroke="#f1efe8" stroke-width="3"/><text x="600" y="120" text-anchor="middle" font-family="Rubik, Arial Black, sans-serif" font-weight="800" font-size="20" fill="#fff" letter-spacing="3">КИЇВ</text>
</svg>`;

const SKYLINE = '<svg class="in-sky" viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden="true"><path fill="#0b1815" d="M0 160V96h40V70h30v26h24V50h36v46h28V80h40v16h32V40h30v56h26V84h44V60h34v36h30V76h40v20h26V54h38v42h30V88h50V66h36v30h28V92h40V48h30v48h24V84h48v12h36V70h40v26h30V58h34v38h28V86h46V64h32v32h40V80h34v16h28V52h36v44h30V90h40V72h30v24h34V60h36v36h24V84h44V96h20v64z"/></svg>';

export function playIntro(root, done) {
  const el = document.createElement('section');
  el.className = 'intro'; el.id = 'intro';
  const stars = Array.from({ length: 36 }, () => `<i style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 55).toFixed(1)}%;--d:${(Math.random() * 3).toFixed(2)}s"></i>`).join('');
  const year = [...'1919'].map((c, i) => `<s style="--i:${i}">${c}</s>`).join('');
  const word = (t, cls) => [...t].map((c, i) => `<s class="${cls}" style="--i:${i}">${c}</s>`).join('');
  el.innerHTML = `<div class="in-stars">${stars}</div>${SKYLINE}
    <div class="in-flash"></div><div class="in-rays"></div>
    <div class="in-ground"><div class="in-sleepers"></div><div class="in-rail"></div></div>
    ${STATION}<div class="in-run">${TRAIN}</div>
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
