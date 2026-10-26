import { audio } from '../core/audio.js';
import { lokoCrest } from './icons.js';

/** Паровоз збоку: котел, труба, кабіна, три ведучі колеса зі спицями. Кольори клубу: червоний корпус, зелена смуга. */
const TRAIN = `<svg class="in-train" viewBox="0 0 420 150" aria-hidden="true">
  <g class="in-wheelset">
    <rect x="40" y="48" width="230" height="52" rx="10" fill="#a8182b"/><rect x="40" y="76" width="230" height="10" fill="#157a46"/>
    <rect x="40" y="48" width="230" height="5" fill="#e8b923"/><rect x="262" y="40" width="8" height="64" rx="3" fill="#e8b923"/>
    <rect x="280" y="22" width="108" height="82" rx="6" fill="#8f1220"/><rect x="274" y="14" width="124" height="12" rx="3" fill="#2b2f33"/>
    <rect x="296" y="36" width="34" height="28" rx="3" fill="#ffe9a6"/><rect x="340" y="36" width="34" height="28" rx="3" fill="#ffe9a6"/>
    <rect x="280" y="76" width="108" height="9" fill="#157a46"/>
    <path d="M8 104 L44 60 L44 104 Z" fill="#46505a"/><rect x="20" y="96" width="24" height="8" fill="#2b2f33"/>
    <rect x="62" y="16" width="26" height="40" rx="3" fill="#23272b"/><rect x="54" y="8" width="42" height="12" rx="3" fill="#23272b"/>
    <rect x="130" y="30" width="34" height="22" rx="14" fill="#e8b923"/><rect x="190" y="34" width="22" height="16" rx="8" fill="#c9a227"/>
    <rect x="52" y="100" width="340" height="9" fill="#2b2f33"/>
    <circle cx="54" cy="70" r="9" fill="#fff6dc"/>
  </g>
  <g class="in-wh" style="--r:1"><circle cx="100" cy="116" r="24" fill="#23272b"/><circle cx="100" cy="116" r="19" fill="#a8182b"/><g stroke="#f1efe8" stroke-width="3"><path d="M100 98v36M82 116h36M87 103l26 26M113 103L87 129"/></g><circle cx="100" cy="116" r="5" fill="#e8b923"/></g>
  <g class="in-wh" style="--r:1"><circle cx="180" cy="116" r="24" fill="#23272b"/><circle cx="180" cy="116" r="19" fill="#a8182b"/><g stroke="#f1efe8" stroke-width="3"><path d="M180 98v36M162 116h36M167 103l26 26M193 103L167 129"/></g><circle cx="180" cy="116" r="5" fill="#e8b923"/></g>
  <g class="in-wh" style="--r:1"><circle cx="260" cy="116" r="24" fill="#23272b"/><circle cx="260" cy="116" r="19" fill="#a8182b"/><g stroke="#f1efe8" stroke-width="3"><path d="M260 98v36M242 116h36M247 103l26 26M273 103L247 129"/></g><circle cx="260" cy="116" r="5" fill="#e8b923"/></g>
  <g class="in-wh" style="--r:1"><circle cx="340" cy="120" r="16" fill="#23272b"/><circle cx="340" cy="120" r="12" fill="#a8182b"/><circle cx="340" cy="120" r="3" fill="#e8b923"/></g>
  <rect x="100" y="112" width="160" height="7" rx="3" fill="#e8b923"/>
</svg>`;

const SKYLINE = '<svg class="in-sky" viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden="true"><path fill="#0b1815" d="M0 160V96h40V70h30v26h24V50h36v46h28V80h40v16h32V40h30v56h26V84h44V60h34v36h30V76h40v20h26V54h38v42h30V88h50V66h36v30h28V92h40V48h30v48h24V84h48v12h36V70h40v26h30V58h34v38h28V86h46V64h32v32h40V80h34v16h28V52h36v44h30V90h40V72h30v24h34V60h36v36h24V84h44V96h20v64z"/></svg>';

export function playIntro(root, done) {
  const el = document.createElement('section');
  el.className = 'intro'; el.id = 'intro';
  const puffs = Array.from({ length: 14 }, (_, i) => `<i class="puff" style="--i:${i}"></i>`).join('');
  const stars = Array.from({ length: 36 }, () => `<i style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 55).toFixed(1)}%;--d:${(Math.random() * 3).toFixed(2)}s"></i>`).join('');
  const year = [...'1919'].map((c, i) => `<s style="--i:${i}">${c}</s>`).join('');
  const word = (t, cls) => [...t].map((c, i) => `<s class="${cls}" style="--i:${i}">${c}</s>`).join('');
  el.innerHTML = `<div class="in-stars">${stars}</div>${SKYLINE}
    <div class="in-flash"></div><div class="in-rays"></div>
    <div class="in-ground"><div class="in-sleepers"></div><div class="in-rail"></div></div>
    <div class="in-run"><div class="in-steam">${puffs}</div>${TRAIN}</div>
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
  for (let i = 0; i < 9; i++) at(500 + i * 260, () => audio.chug());
  at(1000, () => audio.rumble());
  at(3300, () => audio.click());
  at(4200, () => { audio.click(); audio.bell(); });
  at(5200, () => { audio.horn(); audio.thud(); });
  at(7600, end);
  el.classList.add('go');
}
