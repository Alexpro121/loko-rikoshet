// playIntro: заставка запуску: офіційний герб «Локомотива» Київ; з тунелю в червоному трикутнику виїжджає локомотив і стає на своє місце (SVG, WAAPI).
import { audio } from '../core/audio.js';
import CREST from '../../public/loko-logo.svg?raw';

// ---------- деталі герба з офіційного SVG ----------
const RED = '#E31119', GRN = '#67B430', INK = '#05110c';
const P = [...CREST.matchAll(/<path d="([^"]+)" fill="[^"]+"\/>/g)].map((m) => m[1]);
const CLIP = (CREST.match(/<clipPath id="clip0_294_871">\s*([\s\S]*?)<\/clipPath>/) || ['', ''])[1].trim();
const LETTERS = [11, 12, 13, 14, 15, 16, 17, 18, 19], KYIV = [7, 8, 9, 10], LOCO = [3, 2, 6, 4, 5];
const BODY = [3], SKIRT = [6, 4, 5], PLOUGH = [2];             // кузов на ресорах; рама зі спідницею, буфером і «1919»; передній плуг із решіткою
const f = (n, d = 2) => +n.toFixed(d);
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];

// Перспектива самого логотипу: лінії даху, смуг і низу локомотива сходяться в нижній лівій нозі «А».
const VP = [21.3, 127];
// Тунель. Лівий край зіву: внутрішній край лівої червоної смуги з її вигином; правий: внутрішній край правої смуги до землі (y = 127.19).
const PA = [56.23, 116.95], PB = [82.65, 71.24], PQ = [88.89, 82.04], PG = [114.95, 127.19];
const N = [0.866, -0.5];                                       // нормаль правого краю назовні, на світло
const TUN = 'M122.65 1.94L82.65 71.24L56.23 116.95C52.57 123.29 45.8 127.19 38.48 127.19L38.48 230L330 230L330 1.94Z';
const A2 = add(PB, N, 7), G2 = [f(A2[0] + (127.19 - A2[1]) * 0.57735), 127.19];
const ARCH = `M56.23 116.95L82.65 71.24L${f(A2[0])} ${f(A2[1])}L${G2[0]} ${G2[1]}L38.48 127.19C45.8 127.19 52.57 123.29 56.23 116.95Z`;
const D0 = add(PQ, N, -2.5), D1 = add(PQ, N, 3.5);            // темрява м'яко сходить біля правого краю
const RIBS = [0.95, 0.89, 0.83, 0.77, 0.71, 0.65, 0.6];      // кільця обробки тунелю: копії зіву ближче до точки сходу
const rib = (k) => { const p = (q) => [f(VP[0] + k * (q[0] - VP[0])), f(VP[1] + k * (q[1] - VP[1]))]; const [a, b, c] = [p(PA), p(PB), p(PG)]; return `M${a[0]} ${a[1]}L${b[0]} ${b[1]}L${c[0]} ${c[1]}`; };
const LAMP = [116.9, 78.8];                                    // фара: кільце в контурі корпусу
const MARK = [[111.1, 98.7], [133.4, 98.7]];                   // габаритні вогні
const WHEELS = [48, 70, 92, 124, 144];                         // де під рамою колеса торкаються рейки (y = 127)
// промінь фари: конус уздовж променя від точки сходу через фару, тобто прямо на глядача
const AX = (() => { const d = [LAMP[0] - VP[0], LAMP[1] - VP[1]], l = Math.hypot(d[0], d[1]); return [d[0] / l, d[1] / l]; })();
const PX = [-AX[1], AX[0]];
const cone = (len, half) => { const e = add(LAMP, AX, len), w = Math.tan(half * Math.PI / 180) * len, a = add(e, PX, w), b = add(e, PX, -w); return `M${LAMP[0]} ${LAMP[1]}L${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}Z`; };
const BEAM_END = add(LAMP, AX, 150), GLOW_AT = add(LAMP, AX, 30);
const CAB = P[3] ? P[3].split(/(?=M)/).find((s) => s.startsWith('M106.95 84.77')) : '';   // лобове скло: у тунелі в кабіні горить світло
const STACK = [96, 83.4];                                     // вихлоп на даху за кабіною
const NOSE = [[119, 76], [130, 86], [138, 98], [142, 110], [149, 125]];   // передній край: з нього зриває дим тунелю
// Повний червоний трикутник: праві ноги обох шевронів продовжено до основи; зріз заходить на 0,8 в офіційну частину, щоб не було шва.
const atBase = (p) => f(p[0] + (127.19 - p[1]) * 0.57735);
const EXT = [
  `M88.49 81.35L97.89 75.92L${atBase([98.29, 76.61])} 127.19L${atBase([88.89, 82.04])} 127.19Z`,
  `M105.37 71.66C108.71 69.94 112.36 68.89 116.12 68.57L${atBase([116.52, 69.26])} 127.19L${atBase([105.77, 72.35])} 127.19Z`,
];
// Натрієві лампи на правій стіні тунелю; напрям у глибину, уздовж якого відступає темрява, коли тунель розчиняється.
const WALLK = [0.95, 0.86, 0.77, 0.69, 0.61, 0.54];
const DIRV = (() => { const d = [104 - VP[0], 100 - VP[1]], l = Math.hypot(d[0], d[1]); return [d[0] / l, d[1] / l]; })();
const WALL = WALLK.map((k) => {
  const b = [VP[0] + k * (PB[0] - VP[0]), VP[1] + k * (PB[1] - VP[1])], c = [VP[0] + k * (PG[0] - VP[0]), VP[1] + k * (PG[1] - VP[1])];
  const x = b[0] + 0.38 * (c[0] - b[0]) - 1.3 * k, y = b[1] + 0.38 * (c[1] - b[1]);
  const ang = Math.atan2(y - VP[1], x - VP[0]) * 180 / Math.PI, p = (x - VP[0]) * DIRV[0] + (y - VP[1]) * DIRV[1];
  return { x: f(x), y: f(y), k, ang: f(ang, 1), p: f(p, 1), gx: f(c[0] - 2.5 * k), fog: f(0.45 + 0.55 * (k - 0.54) / 0.41) };
});
const LAMPS_Z = [...WALLK.map((k) => f(1 / k, 3)), 2.1, 2.55, 3, 3.45, 3.9, 4.35, 4.8, 5.25, 5.7, 6.15];

// ---------- розмітка: один векторний SVG, усі id й класи з префіксом li-, щоб не зачепити стилі гри ----------
const paths = (ids, fill) => ids.map((i) => `<path d="${P[i]}"${fill ? ` fill="${fill}"` : ''}/>`).join('');
const sprites = (n, kind, cls) => Array.from({ length: n }, () => `<image class="sp ${cls}" data-k="${kind}" x="-12" y="-12" width="24" height="24" preserveAspectRatio="none" opacity="0"/>`).join('');
// локомотив однією будовою: перспектива (pg) > рама на візках (pc) > [спідниця, плуг (pp), кузов: крен (pr) > ресори (pb)]
const loco = (fill, extra = '') => `<g class="pg"><g class="pc">${fill ? `<use href="#skirtShape" fill="${fill}"/>` : ''}<g class="pp">${fill ? `<use href="#ploughShape" fill="${fill}"/>` : ''}</g><g class="pr"><g class="pb">${fill ? `<use href="#bodyShape" fill="${fill}"/>` : ''}${extra}</g></g></g></g>`;
const scoped = (html) => html.replace(/\bid="([^"]+)"/g, 'id="li-$1"').replace(/url\(#([^)]+)\)/g, 'url(#li-$1)').replace(/href="#([^"]+)"/g, 'href="#li-$1"')
  .replace(/class="([^"]+)"/g, (_, c) => `class="${c.split(/\s+/).map((t) => 'li-' + t).join(' ')}"`);
const sel = (s) => s.replace(/([.#])([\w-]+)/g, '$1li-$2');

function scene() {
  return scoped(`<div class="stage" aria-label="Герб ФК Локомотив Київ" role="img">
  <svg class="floor" viewBox="-60 0 286 60" preserveAspectRatio="xMidYMin meet" aria-hidden="true"><defs><linearGradient id="fl" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${INK}" stop-opacity=".55"/><stop offset=".55" stop-color="${INK}"/></linearGradient></defs><g opacity=".14"><use href="#crest-mark" transform="translate(0 180) scale(1 -1)"/></g><rect x="-60" y="0" width="286" height="60" fill="url(#fl)"/></svg>
  <svg class="art" viewBox="0 0 166 180" aria-hidden="true">
    <defs>
      <clipPath id="cc">${CLIP}</clipPath>
      <clipPath id="pl"><path d="${P[0]}"/></clipPath>
      <clipPath id="tun"><path d="${TUN}"/></clipPath>
      <clipPath id="arch"><path d="${ARCH}"/></clipPath>
      <clipPath id="coneC"><path d="${cone(150, 19)}"/></clipPath>
      <clipPath id="locoClip">${paths([3, 6, 4, 5, 2])}</clipPath>
      <radialGradient id="tunG" gradientUnits="userSpaceOnUse" cx="106" cy="118" r="62"><stop offset="0" stop-color="#2b3731"/><stop offset=".35" stop-color="#121c17"/><stop offset="1" stop-color="#030806"/></radialGradient>
      <linearGradient id="archF" gradientUnits="userSpaceOnUse" x1="${f(D0[0])}" y1="${f(D0[1])}" x2="${f(D1[0])}" y2="${f(D1[1])}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <mask id="archM" maskUnits="userSpaceOnUse" x="0" y="0" width="166" height="180"><rect width="166" height="180" fill="url(#archF)"/></mask>
      <linearGradient id="beamG" gradientUnits="userSpaceOnUse" x1="${LAMP[0]}" y1="${LAMP[1]}" x2="${f(BEAM_END[0])}" y2="${f(BEAM_END[1])}"><stop offset="0" stop-color="#fff2c8" stop-opacity=".62"/><stop offset=".3" stop-color="#ffe9b0" stop-opacity=".26"/><stop offset="1" stop-color="#ffe9b0" stop-opacity="0"/></linearGradient>
      <radialGradient id="wallG"><stop offset="0" stop-color="#ffe3a1" stop-opacity=".38"/><stop offset=".5" stop-color="#d9b877" stop-opacity=".14"/><stop offset="1" stop-color="#d9b877" stop-opacity="0"/></radialGradient>
      <linearGradient id="glintG"><stop offset="0" stop-color="#ffe7a8" stop-opacity="0"/><stop offset=".55" stop-color="#fff2cc" stop-opacity=".9"/><stop offset="1" stop-color="#ffe7a8" stop-opacity=".2"/></linearGradient>
      <radialGradient id="haloS"><stop offset="0" stop-color="#ffd59a" stop-opacity=".9"/><stop offset=".18" stop-color="#ffab4a" stop-opacity=".45"/><stop offset=".55" stop-color="#ff9530" stop-opacity=".12"/><stop offset="1" stop-color="#ff9530" stop-opacity="0"/></radialGradient>
      <radialGradient id="poolS"><stop offset="0" stop-color="#ffb860" stop-opacity=".42"/><stop offset=".6" stop-color="#e88a2c" stop-opacity=".12"/><stop offset="1" stop-color="#e88a2c" stop-opacity="0"/></radialGradient>
      <linearGradient id="railS"><stop offset="0" stop-color="#ffc06a" stop-opacity="0"/><stop offset=".5" stop-color="#ffd590" stop-opacity=".85"/><stop offset="1" stop-color="#ffc06a" stop-opacity="0"/></linearGradient>
      <linearGradient id="disG" gradientUnits="userSpaceOnUse" x1="-34" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <mask id="disM" maskUnits="userSpaceOnUse" x="-80" y="-40" width="330" height="260"><g id="disF"><rect x="-420" y="-160" width="420" height="320" fill="url(#disG)"/>${Array.from({ length: 8 }, (_, i) => `<image class="sp" data-k="steam" x="-12" y="-12" width="24" height="24" preserveAspectRatio="none" transform="translate(${-10 + (i % 3) * 4} ${-62 + i * 15}) scale(${(1.7 + (i % 3) * 0.35).toFixed(2)})"/>`).join('')}</g></mask>
      <linearGradient id="sweepG"><stop offset="0" stop-color="#ffc36a" stop-opacity="0"/><stop offset=".5" stop-color="#ffd38a" stop-opacity=".9"/><stop offset="1" stop-color="#ffc36a" stop-opacity="0"/></linearGradient>
      <radialGradient id="poolG"><stop offset="0" stop-color="#fff0c6" stop-opacity=".85"/><stop offset=".5" stop-color="#ffe0a0" stop-opacity=".3"/><stop offset="1" stop-color="#ffe0a0" stop-opacity="0"/></radialGradient>
      <radialGradient id="bloomG"><stop offset="0" stop-color="#fff7de" stop-opacity=".4"/><stop offset=".4" stop-color="#ffeec4" stop-opacity=".12"/><stop offset="1" stop-color="#ffeec4" stop-opacity="0"/></radialGradient>
      <radialGradient id="ambG"><stop offset="0" stop-color="#ffd08a"/><stop offset=".3" stop-color="#ff9f3d" stop-opacity=".75"/><stop offset="1" stop-color="#ff8a24" stop-opacity="0"/></radialGradient>
      <radialGradient id="glow"><stop offset="0" stop-color="#fffbe6"/><stop offset=".28" stop-color="#fff3b8" stop-opacity=".85"/><stop offset="1" stop-color="#fff3b8" stop-opacity="0"/></radialGradient>
      <linearGradient id="streak"><stop offset="0" stop-color="#fff6cf" stop-opacity="0"/><stop offset=".5" stop-color="#fffdf0" stop-opacity=".95"/><stop offset="1" stop-color="#fff6cf" stop-opacity="0"/></linearGradient>
      <linearGradient id="streakV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6cf" stop-opacity="0"/><stop offset=".5" stop-color="#fffdf0" stop-opacity=".8"/><stop offset="1" stop-color="#fff6cf" stop-opacity="0"/></linearGradient>
      <linearGradient id="beam" x1="0" x2="1"><stop offset="0" stop-color="#fff6cf" stop-opacity=".55"/><stop offset="1" stop-color="#fff6cf" stop-opacity="0"/></linearGradient>
      <mask id="ink"><path d="${P[1]}" fill="#fff"/>${paths([...LOCO, ...LETTERS, ...KYIV], '#fff')}</mask>
      <g id="bodyShape">${paths(BODY)}</g>
      <g id="skirtShape">${paths(SKIRT)}</g>
      <g id="ploughShape">${paths(PLOUGH)}</g>
      <g id="crest-mark"><path d="${P[0]}" fill="#fff" opacity=".9"/><path d="${P[1]}" fill="${RED}"/>${paths(LOCO, GRN)}</g>
    </defs>
    <g id="root"><g id="shake">
      <g clip-path="url(#cc)"><path d="${P[0]}" fill="#fff"/></g>
      <g clip-path="url(#arch)"><g mask="url(#disM)"><g id="tdark" opacity="0" mask="url(#archM)">
        <rect x="30" y="60" width="100" height="70" fill="url(#tunG)"/>
        <g fill="none" stroke="#cfd6d2" stroke-width=".55" stroke-linejoin="round">${RIBS.map((k) => `<path class="rb" d="${rib(k)}" opacity="0"/>`).join('')}</g>
        <g>${WALL.map((w) => `<g class="wl" data-p="${w.p}" opacity="${w.fog}"><ellipse cx="${w.x}" cy="${w.y}" rx="${f(15 * w.k)}" ry="${f(4.6 * w.k)}" transform="rotate(${w.ang} ${w.x} ${w.y})" fill="url(#poolS)"/><ellipse cx="${w.gx}" cy="126.85" rx="${f(7 * w.k)}" ry=".34" fill="url(#railS)"/><circle cx="${w.x}" cy="${w.y}" r="${f(9.5 * w.k)}" fill="url(#haloS)"/><circle cx="${w.x}" cy="${w.y}" r="${f(2.3 * w.k)}" fill="#ffd9a0" opacity=".45"/><ellipse cx="${w.x}" cy="${w.y}" rx="${f(1.4 * w.k)}" ry="${f(0.6 * w.k)}" transform="rotate(${f(w.ang + 90, 1)} ${w.x} ${w.y})" fill="#fff4dc"/></g>`).join('')}</g>
        <circle id="apg" cx="66" cy="114" r="30" fill="url(#wallG)" opacity="0"/>
        <line id="glint" x1="40" y1="126.85" x2="${PG[0]}" y2="126.85" stroke="url(#glintG)" stroke-width=".5" opacity="0"/>
        <g id="beamT" opacity="0"><g class="pg"><g class="pc"><g class="pr"><g class="pb">
          <circle cx="${f(GLOW_AT[0])}" cy="${f(GLOW_AT[1])}" r="46" fill="url(#wallG)"/>
          <ellipse cx="196" cy="126.4" rx="38" ry="2.2" fill="url(#poolG)"/>
          <path d="${cone(165, 25)}" fill="url(#beamG)" opacity=".45"/>
          <path d="${cone(150, 12)}" fill="url(#beamG)" opacity=".8"/>
          <path d="${cone(135, 4.5)}" fill="url(#beamG)"/>
          <g clip-path="url(#coneC)">${sprites(6, 'lit', 'lh')}</g>
        </g></g></g></g></g>
      </g></g>
      <g>${sprites(9, 'smoke', 'ms')}</g></g>
      <g id="railsG"><g id="railExt" fill="${RED}">${EXT.map((d) => `<path d="${d}"/>`).join('')}</g><path d="${P[1]}" fill="${RED}"/></g>
      <g clip-path="url(#pl)"><g clip-path="url(#tun)">
        ${loco(GRN)}
        ${loco('', `<g clip-path="url(#locoClip)">${LAMPS_Z.map(() => '<rect class="sw" x="-18" y="60" width="18" height="72" fill="url(#sweepG)" opacity="0"/>').join('')}</g><path class="cab" d="${CAB}" fill="#ffd27a" opacity="0"/>${MARK.map(([x, y]) => `<circle class="mk" cx="${x}" cy="${y}" r="3.4" fill="url(#glow)" opacity="0"/>`).join('')}<circle id="lampRun" cx="${LAMP[0]}" cy="${LAMP[1]}" r="5.5" fill="url(#glow)" opacity="0"/>`)}
        <g id="flare" opacity="0"><circle r="30" fill="url(#bloomG)"/><circle r="15" fill="url(#glow)"/><circle id="amber" r="12" fill="url(#ambG)" opacity="0"/><ellipse rx="48" ry="1.15" fill="url(#streak)"/><ellipse rx=".9" ry="10" fill="url(#streakV)"/></g>
        <g>${Array.from({ length: 26 }, (_, i) => `<line class="sk" x1="0" y1="0" x2="${-(1.6 + (i % 3) * 0.9)}" y2="${f(-0.3 - (i % 2) * 0.4)}" stroke="${i % 3 ? '#ffc23d' : '#ff7a1a'}" stroke-width="${i % 2 ? 0.8 : 1.2}" stroke-linecap="round" opacity="0"/>`).join('')}</g>
      </g></g>
      <g clip-path="url(#tun)"><g>${sprites(12, 'smoke', 'bw')}</g><g>${sprites(22, 'smoke', 'ex')}</g></g>
      <g clip-path="url(#pl)">${paths(LETTERS, RED)}</g>${paths(KYIV, RED)}
      <g pointer-events="none">
        <g>${sprites(18, 'steam', 'sb')}</g>
        <g mask="url(#ink)"><rect id="sheen" x="-30" y="-20" width="18" height="230" fill="#fff" opacity=".55" transform="skewX(-22)"/></g>
        <path id="beamP" d="M${LAMP[0]} ${LAMP[1]}L166 50L166 72Z" fill="url(#beam)" opacity="0"/>
      </g>
    </g></g>
  </svg>
</div>`);
}

// ---------- текстури диму: клуб із викривленого фрактального шуму, білий згори з легкою тінню знизу ----------
const fr = (x) => { const v = Math.sin(x) * 43758.5453; return v - Math.floor(v); };   // сталий «випадок»: кожен показ однаковий
/** Пікселі RGBA однієї текстури S×S. Текст функції йде у воркер, тому все потрібне лежить усередині, ззовні вона нічого не бере. */
function smokePx(kind, seed, S) {
  const fr = (x) => { const v = Math.sin(x) * 43758.5453; return v - Math.floor(v); };
  const px = new Uint8ClampedArray(S * S * 4);
  const h = (x, y) => fr(x * 127.1 + y * 311.7 + seed * 74.7);
  const sm = (t) => t * t * (3 - 2 * t);
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), v = sm(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), e = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
  };
  const fbm = (x, y) => { let s = 0, a = .5, q = 1; for (let o = 0; o < 4; o++) { s += a * vn(x * q, y * q); q *= 2.03; a *= .5; } return s / .9375; };
  const col = { smoke: [[250, 251, 250], [178, 187, 183]], steam: [[255, 255, 255], [190, 201, 196]], lit: [[255, 243, 208], [222, 186, 122]] }[kind];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const X = x / S, Y = y / S, r = Math.hypot(X - .5, Y - .5) * 2;
    const wx = fbm(X * 3 + seed, Y * 3 + 7.3), wy = fbm(X * 3 + 3.1, Y * 3 + seed * 1.7);
    const n = fbm(X * 4.2 + wx * 1.7 + seed * 5, Y * 4.2 + wy * 1.7);
    const fall = Math.max(0, 1 - r), dens = Math.pow(fall, 1.3) * (n * 1.75 - .38);
    const t = Math.min(1, Math.max(0, Y * .85 + (.5 - n) * .7)), i = (y * S + x) * 4;
    for (let c = 0; c < 3; c++) px[i + c] = col[0][c] + (col[1][c] - col[0][c]) * t;
    px[i + 3] = Math.pow(Math.max(0, Math.min(1, dens * 1.35)), 1.15) * 255;
  }
  return px;
}
const TS = 96, TLIST = [['smoke', 1], ['smoke', 2], ['smoke', 3], ['steam', 4], ['steam', 5], ['steam', 6], ['lit', 7], ['lit', 8]];
const WORK = 'const px=' + smokePx + ';onmessage=async(e)=>{const S=e.data.S,o=[];for(const[k,s]of e.data.list){const p=px(k,s,S);'
  + 'if(self.OffscreenCanvas){const c=new OffscreenCanvas(S,S);c.getContext("2d").putImageData(new ImageData(p,S,S),0,0);o.push(await c.convertToBlob())}else o.push(p)}postMessage(o)}';
const texUrl = (p) => { const c = document.createElement('canvas'); c.width = c.height = TS; c.getContext('2d').putImageData(new ImageData(p, TS, TS), 0, 0); return c.toDataURL(); };
let TEX = null;
/** Текстури диму, раз за сесію. Шум рахує воркер ще під екраном ЛОКО РАШ: у потоці сторінки це пів секунди фризу в першому кадрі
 *  заставки. Без воркера рахуємо по одній текстурі між кадрами. */
function textures() {
  if (TEX) return TEX;
  const pack = (u) => ({ smoke: u.slice(0, 3), steam: u.slice(3, 6), lit: u.slice(6) });
  TEX = new Promise((res) => {
    const slow = () => { const u = []; const one = () => { u.push(texUrl(smokePx(...TLIST[u.length], TS))); if (u.length < TLIST.length) setTimeout(one, 30); else res(pack(u)); }; setTimeout(one, 30); };
    let w;
    try { w = new Worker(URL.createObjectURL(new Blob([WORK], { type: 'text/javascript' }))); } catch (_) { slow(); return; }
    w.onmessage = (e) => { w.terminate(); res(pack(e.data.map((d) => (d instanceof Blob ? URL.createObjectURL(d) : texUrl(d))))); };
    w.onerror = () => { w.terminate(); slow(); };
    w.postMessage({ S: TS, list: TLIST });
  });
  return TEX;
}
if (typeof Worker !== 'undefined' && !matchMedia('(prefers-reduced-motion: reduce)').matches) textures();   // одразу при завантаженні гри

/** Частка часу, коли крива cubic-bezier(e) доходить до частки шляху p. */
function timeAt(e, p) {
  p = Math.max(0, Math.min(1, p));
  for (let i = 1; i <= 400; i++) {
    const t = i / 400, m = 1 - t, y = 3 * m * m * t * e[1] + 3 * m * t * t * e[3] + t * t * t;
    if (y >= p) return 3 * m * m * t * e[0] + 3 * m * t * t * e[2] + t * t * t;
  }
  return 1;
}

// ---------- рух локомотива: відстань до глядача z, видимий розмір 1/z ----------
const LT = 700, D = 2700, ARR = LT + D;                         // старт, час виїзду, мить зупинки
const C = .74, Z0 = 7;                                           // рівний хід майже до виходу, далі різке гальмування; на старті він усемеро далі
const SET = 1100;                                                // скільки після зупинки ще заспокоюється підвіска
const V = 1 / (C + (1 - C) / 2);
const dist = (u) => u < C ? V * u : V * u - V * (u - C) * (u - C) / (2 * (1 - C));   // пройдена частка шляху
const zAt = (u) => Z0 - (Z0 - 1) * dist(u);
const sAt = (u) => 1 / zAt(u);
const spd = (u) => u < C ? 1 : Math.max(0, 1 - (u - C) / (1 - C));
const tr = (x, y) => 'translate(' + x.toFixed(3) + 'px,' + y.toFixed(3) + 'px)';
const persp = (s) => tr(VP[0] * (1 - s), VP[1] * (1 - s)) + ' scale(' + s.toFixed(4) + ')';
const world = (p, s) => [VP[0] + s * (p[0] - VP[0]), VP[1] + s * (p[1] - VP[1])];
const uWhen = (ok) => { let u = 0; while (u < 1 && !ok(u)) u += .002; return u; };
const glow = (u) => Math.min(1, .3 + 1.9 * Math.max(0, sAt(u) - .14));   // скільки світла фари в тунелі: що ближче, то яскравіше
const joints = [];                                                // стики рейок: через рівні відрізки шляху
for (let i = 1, zb = Z0; i <= 1600; i++) { const u = i / 1600, z = zAt(u); if (zb - z >= .3) { zb = z; joints.push(u); } }

/** Підвіска. Передній і задній візки ловлять кожен стик по черзі, рама гойдається між ними; кузов на ресорах іде за рамою
 *  з запізненням, клює носом, поки тримають гальма, і відскакує, коли потяг став; на ходу кузов погойдується з боку на бік.
 *  Стан кожні 4 мс: [час, підскок рами, нахил рами°, плуг відносно рами, кузов відносно рами, кивок кузова°, крен°]. */
function suspension() {
  const dt = 4, n = Math.round((D + SET) / dt), w = (hz) => 2 * Math.PI * hz / 1000;
  const wB = w(15), wH = w(3.3), wP = w(2.1), wR = w(1.2);
  const J = joints.map((u) => u * D), hits = [];
  J.forEach((t, k) => { const gap = (k < J.length - 1 ? J[k + 1] : t + (t - J[k - 1])) - t, a = spd(t / D); hits.push([t, 0, a], [t + gap * .42, 1, a]); });
  hits.sort((p, q) => p[0] - q[0]);
  let cf = 0, vf = 0, cr = 0, vr = 0, yb = 0, vb = 0, th = 0, vt = 0, ro = 0, vro = 0, bk = 0, hi = 0;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i * dt, u = Math.min(1, t / D);
    while (hi < hits.length && hits[hi][0] <= t) {
      const [, rear, a] = hits[hi++];
      if (rear) vr -= .085 * a; else vf -= .085 * a;
      vb -= .012 * a; vro += (fr(hi * 2.71) - .5) * .0001 * a;
    }
    bk += ((t >= D * C && t < D ? 1 : 0) - bk) * Math.min(1, dt / 110);   // гальма набирають силу й відпускають за ~0,1 с
    vf += (-wB * wB * cf - 2 * .42 * wB * vf) * dt; cf += vf * dt;
    vr += (-wB * wB * cr - 2 * .42 * wB * vr) * dt; cr += vr * dt;
    const yc = (cf + cr) / 2, vc = (vf + vr) / 2;
    vb += (-wH * wH * (yb - yc) - 2 * .26 * wH * (vb - vc)) * dt; yb += vb * dt;
    vt += (-wP * wP * (th - 1.6 * bk) - 2 * .24 * wP * vt) * dt; th += vt * dt;
    vro += (-wR * wR * ro - 2 * .25 * wR * vro + wR * wR * .0025 * spd(u) * Math.sin(2 * Math.PI * t / 760)) * dt; ro += vro * dt;
    out.push([t, yc, (cr - cf) / 88 * 57.3, cf - yc, yb - yc, th, ro * 57.3]);
  }
  return out;
}

/** Заставка запуску: повний герб із тунелем у червоному трикутнику; з тунелю виїжджає локомотив, гальмує й стає на своє місце,
 *  тунель розчиняється, фара гасне. Дотик будь-де пропускає. `done` кличеться один раз, коли заставка почала зникати. */
export function playIntro(root, done) {
  if (P.length !== 20 || !CAB) { done(); return; }                // герб змінили так, що деталі вже не впізнати: заставку пропускаємо
  const el = document.createElement('section');
  el.className = 'intro'; el.id = 'intro';
  el.innerHTML = scene() + '<button class="li-skip" type="button" aria-label="Пропустити">ПРОПУСТИТИ ›</button>';
  root.appendChild(el);
  const $ = (s) => el.querySelector(sel(s)), $$ = (s) => [...el.querySelectorAll(sel(s))];
  const live = [], T = [], Q = [];
  const A = (node, kf, o) => { const a = node.animate(kf, o); live.push(a); return a; };
  const each = (s, kf, o) => $$(s).forEach((node) => A(node, kf, o));
  const at = (ms, fn) => Q.push([ms, fn]);                        // годинники звуку стартують разом з анімаціями (go)
  let finished = false;
  const end = () => {
    if (finished) return; finished = true;
    T.forEach(clearTimeout);
    el.classList.add('out');
    setTimeout(() => { for (const a of live) a.cancel(); el.remove(); }, 650);
    done();
  };
  el.addEventListener('click', end);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {   // без руху: лише готовий герб
    $('#tdark').remove(); $('#railExt').remove();
    T.push(setTimeout(end, 1600));
    return;
  }
  textures().then((tex) => { if (!finished) $$('.sp').forEach((im, i) => { const l = tex[im.dataset.k]; im.setAttribute('href', l[i % l.length]); }); });

  const run = { duration: D, delay: LT, easing: 'linear', fill: 'both' };
  const sample = (n, fn) => Array.from({ length: n + 1 }, (_, i) => fn(i / n));
  /** Клуб диму чи пари: виринає, розпливається й тане; рух гальмує, як у справжнього диму. */
  const puff = (node, x, y, dx, dy, s0, s1, r0, dr, op, dur, t) => A(node, [
    { opacity: 0, transform: tr(x, y) + ' rotate(' + r0 + 'deg) scale(' + s0.toFixed(3) + ')', easing: 'cubic-bezier(.1,.55,.3,1)' },
    { opacity: op, offset: .14, easing: 'ease-in-out' },
    { opacity: op * .55, offset: .5, easing: 'ease-in-out' },
    { opacity: 0, transform: tr(x + dx, y + dy) + ' rotate(' + (r0 + dr) + 'deg) scale(' + s1.toFixed(3) + ')' }], { duration: dur, delay: t, fill: 'backwards' });

  // 1. тунель: темний зів у червоному трикутнику; коли потяг став, денне світло заходить у зів, і темрява відступає
  //    в глибину рваним димчастим краєм, лампи перед краєм блимають і гаснуть, лишається легкий туман, що тане
  const DV0 = ARR + 140, DVD = 1700, FA = 132, FB = 4, DE = [.42, 0, .3, 1];
  const ang = Math.atan2(DIRV[1], DIRV[0]) * 180 / Math.PI;
  const front = (F) => 'translate(' + VP[0] + 'px,' + VP[1] + 'px) rotate(' + ang.toFixed(2) + 'deg) translate(' + F + 'px,0px)';
  const atFront = (q) => DV0 + DVD * timeAt(DE, Math.max(0, Math.min(1, (FA - q) / (FA - FB))));
  A($('#disF'), [{ transform: front(FA) }, { transform: front(FB) }], { duration: DVD, delay: DV0, easing: 'cubic-bezier(' + DE + ')', fill: 'both' });
  const TD = DV0 + DVD + 150;
  A($('#tdark'), [{ opacity: 1 }, { opacity: 1, offset: (DV0 + DVD - 100) / TD }, { opacity: 0 }], { duration: TD, fill: 'both' });
  $$('.wl').forEach((w) => {
    const o = +w.getAttribute('opacity');
    A(w, [{ opacity: o }, { opacity: o * .3, offset: .2 }, { opacity: o * .85, offset: .34 }, { opacity: o * .12, offset: .55 }, { opacity: o * .45, offset: .66 }, { opacity: 0 }], { duration: 340, delay: atFront(+w.dataset.p + 40) - 120, fill: 'forwards' });
  });
  $$('.ms').forEach((m, j) => {
    const q = (j + .5) / 9 * .92, F = FA - (FA - FB) * q, r = fr(j * 6.7 + 31), off = -30 + (j % 5) * 12 + r * 6, a = DIRV;
    const x = VP[0] + a[0] * (F - 16) - a[1] * off, y = VP[1] + a[1] * (F - 16) + a[0] * off, far = 8 + 8 * r;
    puff(m, x, y, a[0] * far, a[1] * far - 5 - 4 * r, .9, 1.9 + .8 * r, (r * 360) | 0, ((r - .5) * 60) | 0, .32, 1500 + 600 * r, DV0 + DVD * timeAt(DE, q));
  });
  // світло фари в тунелі: пляма на стінах, конус у димці, відблиск на рейці; кільця спалахують, коли світло підходить до них
  A($('#beamT'), sample(90, (u) => ({ offset: u, opacity: +glow(u).toFixed(3) })), run);
  A($('#apg'), sample(90, (u) => { const s = sAt(u); return { offset: u, opacity: +(glow(u) * (s < .42 ? 1 : Math.max(.35, 1 - (s - .42) * 2.5))).toFixed(3) }; }), run);
  A($('#glint'), sample(90, (u) => ({ offset: u, opacity: +(.85 * glow(u) * (sAt(u) < .8 ? 1 : 0)).toFixed(3) })), run);
  $$('.rb').forEach((r, j) => {
    const zr = 1 / RIBS[j];
    A(r, sample(90, (u) => { const d = zAt(u) - zr, b = d < -.04 ? 0 : Math.exp(-((d - .3) ** 2) / .1); return { offset: u, opacity: +(.12 + .88 * b * glow(u)).toFixed(3) }; }), run);
  });
  $$('.lh').forEach((h, j) => {
    const r = fr(j * 8.3 + 5), d = 24 + j * 20, o = (r - .5) * 18, k0 = 1.4 + j * .35, a0 = (r * 360) | 0;
    const x = LAMP[0] + AX[0] * d + PX[0] * o, y = LAMP[1] + AX[1] * d + PX[1] * o;
    A(h, [{ opacity: 0, transform: tr(x, y) + ' rotate(' + a0 + 'deg) scale(' + k0 + ')' }, { opacity: .35, offset: .08 }, { opacity: .35, offset: .9 }, { opacity: 0, transform: tr(x + 4, y - 3) + ' rotate(' + (a0 + 40) + 'deg) scale(' + (k0 * 1.3).toFixed(2) + ')' }], { duration: D + 300, delay: LT - 300, fill: 'both' });
  });

  // 2. виїзд: перспектива спільна для всіх копій локомотива (сам, його вогні, промінь фари);
  //    кожна деталь реагує на рух по-своєму: рама й плуг на візках, кузов на ресорах, крен
  each('.pg', sample(120, (u) => ({ offset: u, transform: persp(sAt(u)) })), run);
  const SU = suspension(), TS = D + SET, ride = { duration: TS, delay: LT, easing: 'linear', fill: 'both' };
  const keys = (fn) => { const k = []; for (let i = 0; i < SU.length; i += 3) k.push({ offset: Math.min(1, SU[i][0] / TS), transform: fn(SU[i]) }); k.push({ offset: 1, transform: fn([TS, 0, 0, 0, 0, 0, 0]) }); return k; };
  each('.pc', keys((q) => 'translateY(' + q[1].toFixed(3) + 'px) rotate(' + q[2].toFixed(3) + 'deg)'), ride);
  each('.pp', keys((q) => 'translateY(' + q[3].toFixed(3) + 'px)'), ride);
  each('.pr', keys((q) => 'rotate(' + q[6].toFixed(3) + 'deg)'), ride);
  each('.pb', keys((q) => 'translateY(' + q[4].toFixed(3) + 'px) rotate(' + q[5].toFixed(3) + 'deg)'), ride);
  // фара: у тунелі сліпить, на денному світлі здається слабшою, а коли потяг став, гасне, як лампа розжарення:
  // спершу швидко, далі довгим хвостом, і біле світло наостанок тепліє до бурштинового
  const uX = uWhen((u) => sAt(u) >= .8), uL = uWhen((u) => sAt(u) >= .76), OFF = ARR + 260, FADE = 1500, TL = OFF + FADE - LT;
  const lamp = (o) => [{ opacity: 0 }, { opacity: o, offset: .02 * D / TL }, { opacity: o, offset: D * uL / TL }, { opacity: o * .62, offset: (D * uL + 280) / TL }, { opacity: o * .62, offset: (OFF - LT) / TL, easing: 'cubic-bezier(.2,.6,.35,1)' }, { opacity: 0 }];
  const lit = { duration: TL, delay: LT, fill: 'both' };
  A($('#lampRun'), lamp(1), lit);
  each('.mk', lamp(.95), lit);
  A($('#amber'), [{ opacity: 0 }, { opacity: 0, offset: .08 }, { opacity: 1, offset: .5 }, { opacity: 0 }], { duration: FADE + 150, delay: OFF, easing: 'ease-in-out', fill: 'both' });
  A($('#beamP'), [{ opacity: 0 }, { opacity: 0, offset: D * uL / TL }, { opacity: .5, offset: (D * uL + 320) / TL }, { opacity: .5, offset: (OFF - LT) / TL, easing: 'cubic-bezier(.2,.6,.35,1)' }, { opacity: 0 }], lit);
  A($('#flare'), sample(120, (u) => { const s = sAt(u), p = world(LAMP, s); return { offset: u, transform: tr(p[0], p[1]) + ' scale(' + (.3 + .7 * Math.sqrt(s)).toFixed(3) + ')' }; }), run);
  A($('#flare'), lamp(1), lit);
  each('.cab', [{ opacity: 0 }, { opacity: .85, offset: .03 }, { opacity: .85, offset: uX }, { opacity: 0 }], run);
  // тунельні лампи: щоразу, коли локомотив минає лампу, по ньому від морди до хвоста пробігає теплий відблиск
  $$('.sw').forEach((s, j) => {
    const zr = LAMPS_Z[j], u0 = uWhen((u) => zAt(u) <= zr), u1 = uWhen((u) => zAt(u) <= zr - .3);
    if (u0 >= 1 || sAt(u0) < .17 || sAt(u0) > .84) return;
    A(s, [{ opacity: 0, transform: 'translateX(158px)' }, { opacity: .55, offset: .2 }, { opacity: .55, offset: .7 }, { opacity: 0, transform: 'translateX(56px)' }], { duration: Math.min(420, Math.max(110, D * (u1 - u0))), delay: LT + D * u0, easing: 'linear', fill: 'backwards' });
  });
  // гуркіт: що ближче важкий локомотив, то сильніше дрижить картинка
  const rn = Math.round(D / 42);
  A($('#shake'), sample(rn, (u) => { const i = Math.round(u * rn), a = u < .2 || i === rn ? 0 : .55 * Math.pow(sAt(u), 1.5) * (1 - .7 * (1 - spd(u))); return { offset: u, transform: tr((fr(i * 1.7) - .5) * 2 * a, (fr(i * 3.1) - .5) * 2 * a) }; }), { duration: D, delay: LT, easing: 'linear' });
  // іскри з-під коліс на гальмуванні: вилітають там, де колесо було тієї миті, і летять назад до тунелю
  $$('.sk').forEach((k, i) => {
    const u = C + .02 + (i / 26) * (.97 - C - .02), s = sAt(u), r = fr(i * 5.1);
    const x0 = VP[0] + s * (WHEELS[i % 5] - VP[0]), y0 = 127, fly = (5 + r * 9) * s + 1.5, k0 = (.4 + s).toFixed(2);
    A(k, [
      { opacity: 1, transform: tr(x0, y0) + ' scale(' + k0 + ')' },
      { opacity: 1, transform: tr(x0 - fly * .7, y0 - (1.5 + r * 3) * s) + ' scale(' + k0 + ')', offset: .45 },
      { opacity: 0, transform: tr(x0 - fly, y0 + 1.5) + ' scale(' + k0 + ')' }], { duration: 220 + r * 180, delay: LT + D * u, easing: 'ease-out', fill: 'forwards' });
  });
  // щойно ніс заходить на праву ногу трикутника, її продовження за локомотивом розчиняється, і до зупинки лишаються зрізи, як у гербі
  const x0 = LT + D * uWhen((u) => sAt(u) >= .62);
  A($('#railExt'), [{ opacity: 1 }, { opacity: 0 }], { duration: ARR + 250 - x0, delay: x0, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });

  // 3. дим, і в кожного свій видимий початок. Вихлоп б'є з комина на даху, щойно той підходить до виходу,
  //    вітер зносить його вгору-вправо; що ближче зупинка, то рідше й слабше: дизель скидає оберти
  const ex = $$('.ex'), e0 = LT + D * uWhen((u) => sAt(u) >= .74), e1 = ARR + 900;
  ex.forEach((e, j) => {
    const t = e0 + (e1 - e0) * Math.pow(j / (ex.length - 1), 1.35), u = Math.min(1, (t - LT) / D), s = sAt(u), p = world(STACK, s), r = fr(j * 3.3 + 11), q = fr(j * 7.1 + 13);
    const k = t < ARR ? 1 : Math.max(.45, 1 - (t - ARR) / 1600);
    puff(e, p[0] + (q - .5) * 1.5, p[1], 6 + 11 * r, -(15 + 13 * q), .28 + .1 * q, (1.2 + .9 * r) * k, (r * 360) | 0, ((q - .5) * 110) | 0, (.42 + .12 * q) * k, 2000 + 900 * r, t);
  });
  // носова хвиля: дим тунелю зривається з морди, щойно та проходить зів, і розкочується навсібіч
  const bw = $$('.bw'), n0 = uWhen((u) => sAt(u) >= .6), n1 = uWhen((u) => sAt(u) >= .92);
  bw.forEach((b, j) => {
    const u = n0 + (n1 - n0) * j / (bw.length - 1), s = sAt(u), pt = NOSE[j % NOSE.length], p = world(pt, s), r = fr(j * 4.7 + 21), q = fr(j * 1.3 + 23);
    const rx = p[0] - VP[0], ry = p[1] - VP[1], rl = Math.hypot(rx, ry), up = pt[1] < 100 ? -.75 : pt[1] < 120 ? -.3 : 0, far = (9 + 13 * r) * s * 1.4;
    puff(b, p[0], p[1], rx / rl * far, (ry / rl + up) * far - 3 * q, .3 * s + .1, (1.3 + .9 * r) * s, (q * 360) | 0, ((r - .5) * 100) | 0, .34 + .12 * q, 1300 + 700 * r, LT + D * u);
  });
  // пара з гальм: б'є з-під передніх коліс, коли ті вже на світлі, густішає до зупинки й тягнеться вздовж колії;
  // на зупинці ще раз шипить з-під задніх
  const sb = $$('.sb'), b0 = LT + D * uWhen((u) => sAt(u) >= .8), b1 = ARR + 420, nb = sb.length - 4;
  sb.forEach((b, j) => {
    const r = fr(j * 6.1 + 4), q = fr(j * 2.3 + 8);
    if (j >= nb) {
      const x = j % 2 ? 70 : 92;
      puff(b, x + (q - .5) * 4, 125.6, (j % 2 ? -1 : 1) * (6 + r * 10), -(2 + q * 5), .4, 1.1 + r * .8, (r * 360) | 0, ((q - .5) * 60) | 0, .5, 1800 + r * 900, ARR + 240 + (j - nb) * 70);
      return;
    }
    const t = b0 + (b1 - b0) * Math.pow(j / (nb - 1), .7), s = sAt(Math.min(1, (t - LT) / D)), side = j % 4 === 0 ? -1 : 1;
    const x = VP[0] + s * ((j % 2 ? 124 : 144) - VP[0]) + (q - .5) * 4;
    puff(b, x, 125.4, side * (6 + r * 16), -(2.5 + q * 7), .45 + .15 * q, 1.2 + r * 1.1, (r * 360) | 0, (side * (20 + q * 40)) | 0, .5 + .2 * q, 1900 + r * 1100, t);
  });

  // 4. зупинка: герб здригається; наостанок по всьому гербу пробігає відблиск
  A($('#root'), [{ transform: 'none' }, { transform: tr(.9, .5) }, { transform: tr(-.35, 0) }, { transform: 'none' }], { duration: 380, delay: ARR - 20, easing: 'ease-out' });
  const SH = ARR + 1300;
  A($('#sheen'), [{ transform: 'skewX(-22deg) translateX(0)' }, { transform: 'skewX(-22deg) translateX(250px)' }], { duration: 1000, delay: SH, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'both' });

  // звук: гуркіт із глибини, гудок у тунелі, скрип гальм, глухий удар зупинки, шипіння пари, дзвін на фіналі
  at(LT, () => audio.rumble());
  at(LT + 900, () => audio.horn());
  at(LT + D * C, () => audio.hiss(3600, 10, 0.8, 0.03));
  at(ARR, () => audio.thud());
  at(ARR + 240, () => audio.hiss(1500, 0.6, 0.8, 0.05));
  at(SH + 200, () => audio.bell());
  at(SH + 1350, end);

  // 5. старт. Перший показ кожного виду деталей (маска, градієнт, дим) GPU зустрічає збиранням програм малювання: хвилі фризу
  //    по ~0,3 с посеред виїзду. Тому поруч ставимо невидиму копію герба, де видно все, і тримаємо анімації на першому кадрі
  //    (герб стоїть, локомотив ще в глибині тунелю), доки кадри не підуть рівно. Тоді копію прибираємо й пускаємо рух.
  //    До LT - 300 (перший серпанок фари) кадр і так нерухомий, тож час очікування зараховуємо в цю паузу, а не додаємо до неї.
  for (const a of live) a.pause();
  const warm = document.createElement('div');
  warm.className = 'li-warm'; warm.innerHTML = scene(); el.appendChild(warm);
  const t0 = performance.now(); let prev = t0, calm = 0;
  const go = (now) => {
    const k = Math.min(LT - 300, now - t0);
    warm.remove();
    for (const a of live) { a.currentTime = k; a.play(); }
    for (const [ms, fn] of Q) T.push(setTimeout(fn, ms - k));
  };
  const wait = (now) => {
    if (finished) return;
    calm = now - prev < 70 ? calm + 1 : 0; prev = now;
    if (calm >= 3 || now - t0 > 1500) go(now); else requestAnimationFrame(wait);
  };
  requestAnimationFrame(wait);
}
