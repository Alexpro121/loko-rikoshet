// LED-борти поля: кадри партнерів клубу, клубні й подієві кадри в атласі на роздільності справжнього LED; шейдер обирає кадр
// для кожного модуля периметра й робить переходи; режисер раз на кілька секунд міняє програму й реагує на гру через cue().
// Щокадру міняються лише кілька uniform: атлас не перемальовується, таблиця модулів (512 байт) іде в GPU лише при зміні програми.
import * as THREE from 'three';
import { logoReady, logoImg, whenLogo } from './logo.js';
import { ANISO } from './textures.js';
import { DETAIL } from '../core/perf.js';
import { PITCH } from '../config.js';
// офіційні логотипи партнерів із Wikimedia Commons (Ukrzaliznytsya.svg, Sense_bank_logo.svg, Kelme_new_logo.svg); у Kelme дописано width/height,
// бо SVG без розміру деякі браузери не малюють на canvas. Розинки й фонду Баффета у відкритих джерелах немає — їх малюємо кодом
import uzUrl from './partners/uz.svg?url';
import senseUrl from './partners/sense.svg?url';
import kelmeUrl from './partners/kelme.svg?url';

const { L } = PITCH;
// кадр 1024×96 діодів: крок ~1 см на борті заввишки 1.02, як на справжніх периметрових екранах; діоди квадратні
const TW = 1024, TH = 96, PAD = 8, CW = TW + 2 * PAD, CH = TH + 2 * PAD;   // PAD: поле довкола кадру, щоб далекі mip-рівні не брали сусіда
const COLS = 2, ROWS = 8, NT = COLS * ROWS, NL = 4;                        // 16 сталих кадрів в атласі + 4 живі (рахунок, гості, пенальті, напис)
export const BOARD_H = 1.02;
export const FRAME_LEN = TW * BOARD_H / TH;                                 // довжина одного модуля на борті, ~10.9
const MAXS = 64;                                                            // модулів на периметрі (зараз 36)

// номери кадрів (= плиток атласу; 16+ — живі)
const CLUB = 0, CHEV = 1, UZ = 2, SENSE = 3, ROS = 4, KELME = 5, HGBF = 6, KYIV = 7, SHOP = 8, STAD = 9, GOAL = 10, CALM = 12, REPLAY = 13, BREAK = 14, CHANT = 15;
const GUEST = 16, SCORE = 17, PENS = 18, TEXT = 19;
// ротація: [кадр, вага]. Укрзалізниця — головний спонсор, тож її найчастіше
const POOL = [[UZ, 4], [SENSE, 2], [ROS, 2], [KELME, 2], [HGBF, 1], [CLUB, 3], [KYIV, 1], [SHOP, 1], [STAD, 1], [GUEST, 1]];
const POOL_W = POOL.reduce((s, p) => s + p[1], 0);

const C = { red: '#c8202b', red2: '#e2313c', green: '#127a45', green2: '#1f8f3f', cream: '#f1efe8', ink: '#121619', amber: '#f2a93b', grey: '#7d878d' };
const sans = (w, px) => `${w} ${px}px Rubik, "Arial Black", sans-serif`;
const serif = (w, px) => `${w} ${px}px Georgia, "Noto Serif", "Times New Roman", serif`;

// ---------------------------------------------------------------- дрібниці малювання
function trackW(g, s, sp) { let w = 0; for (let i = 0; i < s.length; i++) w += g.measureText(s[i]).width + sp; return w - sp; }
/** Текст із розрядкою (canvas letterSpacing є не скрізь). */
function track(g, s, x, y, sp) { for (let i = 0; i < s.length; i++) { g.fillText(s[i], x, y); x += g.measureText(s[i]).width + sp; } }
/** Шрифт найбільшого кегля, з яким рядок влазить у ширину. */
function fit(g, s, w, px, font) { g.font = font(px); while (px > 14 && g.measureText(s).width > w) { px -= 2; g.font = font(px); } return px; }
/** Курсив похилом: тіньова трансформація навколо базової лінії y. */
function italic(g, s, x, y) { g.save(); g.translate(x, y); g.transform(1, 0, -0.2, 1, 0, 0); g.fillText(s, 0, 0); g.restore(); }
function lum(hex) { const n = parseInt(String(hex).slice(1), 16); return ((n >> 16 & 255) * 0.299 + (n >> 8 & 255) * 0.587 + (n & 255) * 0.114) / 255; }
/** Колір напису на тлі bg: власний другий колір, якщо він контрастний, інакше кремовий чи чорнильний. */
function fgOn(bg, want) { return want && Math.abs(lum(bg) - lum(want)) > 0.3 ? want : lum(bg) > 0.55 ? C.ink : C.cream; }
function chevron(g, x, y, h, col) { g.fillStyle = col; g.beginPath(); g.moveTo(x, y - h / 2); g.lineTo(x + h * 0.36, y - h / 2); g.lineTo(x + h * 0.78, y); g.lineTo(x + h * 0.36, y + h / 2); g.lineTo(x, y + h / 2); g.lineTo(x + h * 0.42, y); g.fill(); }
function drop(g, x, y, r, col) {
  g.fillStyle = col; g.beginPath(); g.moveTo(x, y - r * 2.1);
  g.bezierCurveTo(x + r * 0.55, y - r * 1.25, x + r, y - r * 0.65, x + r, y); g.arc(x, y, r, 0, Math.PI);
  g.bezierCurveTo(x - r, y - r * 0.65, x - r * 0.55, y - r * 1.25, x, y - r * 2.1); g.fill();
}

const LOGO = { uz: null, sense: null, kelme: null };
let logoWait = null;
/** Логотипи вантажаться раз; cb — коли прийшли всі (або впали): тоді один раз перемальовуємо атлас. */
function whenLogos(cb) {
  if (!logoWait) {
    logoWait = Promise.all([['uz', uzUrl], ['sense', senseUrl], ['kelme', kelmeUrl]].map(([k, u]) => new Promise((ok) => {
      if (typeof Image === 'undefined') { ok(); return; }
      const im = new Image(); im.onload = () => { LOGO[k] = im; ok(); }; im.onerror = () => ok(); im.src = u;
    })));
  }
  logoWait.then(cb);
}
let _tint = null;
/** Частина логотипа (s* — у пікселях самого SVG) у прямокутник кадру; col — перефарбувати в один колір. */
function logo(g, im, sx, sy, sw, sh, dx, dy, dw, dh, col) {
  if (!col) { g.drawImage(im, sx, sy, sw, sh, dx, dy, dw, dh); return; }
  const c = _tint || (_tint = document.createElement('canvas')), w = Math.ceil(dw * 2), h = Math.ceil(dh * 2), t = c.getContext('2d');
  c.width = w; c.height = h;
  t.drawImage(im, sx, sy, sw, sh, 0, 0, w, h);
  t.globalCompositeOperation = 'source-in'; t.fillStyle = col; t.fillRect(0, 0, w, h); t.globalCompositeOperation = 'source-over';
  g.drawImage(c, 0, 0, w, h, dx, dy, dw, dh);
}

// ---------------------------------------------------------------- кадри (усе в координатах кадру 1024×96)
const PAINT = {
  [CLUB](g) {            // клуб: червоне поле, емблема, похилий «ЛОКОМОТИВ», зелена діагональ і чорнильний блок із містом
    g.fillStyle = C.red; g.fillRect(0, 0, TW, TH);
    g.fillStyle = C.green; g.beginPath(); g.moveTo(600, 0); g.lineTo(664, 0); g.lineTo(628, TH); g.lineTo(564, TH); g.fill();
    g.fillStyle = C.ink; g.beginPath(); g.moveTo(664, 0); g.lineTo(TW, 0); g.lineTo(TW, TH); g.lineTo(628, TH); g.fill();
    if (logoReady()) g.drawImage(logoImg(), 22, 7, 82 * 166 / 180, 82);
    g.fillStyle = C.cream; fit(g, 'ЛОКОМОТИВ', 430, 66, (p) => sans(800, p)); italic(g, 'ЛОКОМОТИВ', 124, 52);
    g.font = sans(800, 40); g.fillText('КИЇВ', 690, 38);
    g.fillStyle = C.red2; g.font = sans(600, 22); track(g, 'З 1919 РОКУ', 692, 74, 3);
    for (let i = 0; i < 3; i++) chevron(g, 910 + i * 32, 48, 44, i === 2 ? C.red2 : C.cream);
  },
  [CHEV](g) {            // біжучі шеврони клубу: період 128 діодів, кадр замкнений по колу (прокручується)
    g.fillStyle = C.green; g.fillRect(0, 0, TW, TH);
    for (let i = 0; i < 16; i++) chevron(g, i * 64 + 12, 48, 70, i % 2 ? C.cream : C.red2);
  },
  [UZ](g) {              // Укрзалізниця: офіційний знак «УЗ» і назва темно-синім на світлому
    g.fillStyle = '#f3f4f6'; g.fillRect(0, 0, TW, TH);
    g.fillStyle = '#2b2d7f'; g.font = sans(800, 54);
    const s = 'УКРЗАЛІЗНИЦЯ', w = trackW(g, s, 8), lw = LOGO.uz ? 74 * 185 / 66 : 0, x = (TW - w - lw - (lw ? 36 : 0)) / 2;
    if (LOGO.uz) logo(g, LOGO.uz, 0, 0, 185, 66, x, 11, lw, 74);
    track(g, s, x + lw + (lw ? 36 : 0), 50, 8);
  },
  [SENSE](g) {           // Sense Bank: офіційний напис білим на їхньому синьому
    g.fillStyle = '#2722ff'; g.fillRect(0, 0, TW, TH);
    if (LOGO.sense) { const h = 48, w = h * 173 / 24; logo(g, LOGO.sense, 0, 0, 173, 24, (TW - w) / 2, (TH - h) / 2, w, h, '#ffffff'); }
    else { g.fillStyle = '#ffffff'; g.font = sans(600, 54); const w = trackW(g, 'SENSE BANK', 12); track(g, 'SENSE BANK', (TW - w) / 2, 50, 12); }
  },
  [ROS](g) {             // «Розинка»: світле поле, крапля, кругла зелена назва й візерунок крапель
    g.fillStyle = '#e8f2ec'; g.fillRect(0, 0, TW, TH);
    for (let r = 0; r < 3; r++) for (let i = 0; i < 12; i++) drop(g, 600 + i * 34 + (r % 2) * 17, 26 + r * 26, 6, r === 1 && i % 3 === 1 ? '#2a7fc1' : '#a9cfe4');
    drop(g, 64, 64, 22, '#2a7fc1');
    g.fillStyle = '#e8f2ec'; g.beginPath(); g.ellipse(56, 60, 5, 9, -0.4, 0, 6.283); g.fill();
    g.fillStyle = '#11713f'; g.font = sans(800, 62); g.fillText('РОЗИНКА', 112, 52);
  },
  [KELME](g) {           // Kelme: офіційні лапа й напис (вирізані з одного SVG), смуги швидкості
    g.fillStyle = '#f6f6f3'; g.fillRect(0, 0, TW, TH);
    const im = LOGO.kelme, k = 10;                                     // SVG 874×1079 при viewBox 87.38×107.86: 10 пікселів на одиницю
    let x = 40;
    if (im) {
      logo(g, im, 18 * k, 0, 64 * k, 78 * k, x, 8, 66, 80); x += 96;   // лапа
      logo(g, im, 0, 94 * k, 87.4 * k, 14 * k, x, 22, 52 * 87.4 / 14, 52); x += 52 * 87.4 / 14 + 40;   // напис KELME
    } else { g.fillStyle = C.ink; g.font = sans(800, 88); italic(g, 'KELME', x, 54); x += g.measureText('KELME').width + 40; }
    g.font = sans(600, 20); g.fillStyle = '#4a5156'; track(g, 'ФОРМА КЛУБУ', x, 50, 3);
    for (let i = 0; i < 5; i++) {
      const sx = 760 + i * 52, w = 36 - i * 6;
      g.fillStyle = i === 1 ? C.red : C.ink; g.beginPath(); g.moveTo(sx + 22, 8); g.lineTo(sx + 22 + w, 8); g.lineTo(sx + w, 88); g.lineTo(sx, 88); g.fill();
    }
  },
  [HGBF](g) {            // фонд Говарда Г. Баффета: папір, засічки, подвійні лінії
    g.fillStyle = '#f3eee2'; g.fillRect(0, 0, TW, TH);
    g.fillStyle = '#1d2b4a'; g.fillRect(32, 12, TW - 64, 3); g.fillRect(32, 19, TW - 64, 1); g.fillRect(32, 77, TW - 64, 1); g.fillRect(32, 81, TW - 64, 3);
    const s = 'THE HOWARD G. BUFFETT FOUNDATION';
    let px = 36; g.font = serif(600, px); while (px > 18 && trackW(g, s, 3) > TW - 120) { px -= 2; g.font = serif(600, px); }
    track(g, s, (TW - trackW(g, s, 3)) / 2, 50, 3);
  },
  [KYIV](g) {            // найстаріший клуб Києва: великі контурні цифри року
    g.fillStyle = C.ink; g.fillRect(0, 0, TW, TH);
    g.strokeStyle = C.cream; g.lineWidth = 3; g.font = sans(800, 90); g.strokeText('1919', 26, 54);
    g.fillStyle = C.red2; g.fillRect(300, 14, 6, 68);
    g.fillStyle = C.cream; fit(g, 'НАЙСТАРІШИЙ КЛУБ КИЄВА', 680, 42, (p) => sans(800, p)); g.fillText('НАЙСТАРІШИЙ КЛУБ КИЄВА', 330, 36);
    g.fillStyle = C.red2; g.font = sans(600, 24); track(g, 'ЛОКОМОТИВ · ЗАЛІЗНИЧНИКИ', 332, 72, 3);
  },
  [SHOP](g) {            // табло відправлення: фірмова крамниця клубу на Південному вокзалі
    g.fillStyle = '#070909'; g.fillRect(0, 0, TW, TH);
    g.fillStyle = C.grey; g.font = sans(600, 15);
    g.fillText('ЧАС', 26, 15); g.fillText('ПОТЯГ', 156, 15); g.fillText('ПРИЗНАЧЕННЯ', 296, 15); g.fillText('КОЛІЯ', 948, 15);
    g.fillStyle = '#2a3034'; g.fillRect(16, 26, TW - 32, 2);
    g.fillStyle = C.amber; g.font = sans(600, 38);
    g.fillText('19:19', 24, 62); g.fillText('ЛОКО', 154, 62); g.fillText('1', 966, 62);
    fit(g, 'КРАМНИЦЯ КЛУБУ · ПІВДЕННИЙ ВОКЗАЛ', 620, 38, (p) => sans(600, p)); g.fillText('КРАМНИЦЯ КЛУБУ · ПІВДЕННИЙ ВОКЗАЛ', 296, 62);
  },
  [STAD](g) {            // стадіон: кремове поле між клубними смугами
    g.fillStyle = '#ebe6d9'; g.fillRect(0, 0, TW, TH);
    g.fillStyle = C.red; g.fillRect(0, 0, TW, 10); g.fillStyle = C.green; g.fillRect(0, TH - 10, TW, 10);
    g.fillStyle = C.ink; g.font = sans(800, 50); g.fillText('СТАДІОН «ЛОКОМОТИВ»', 36, 50);
    g.fillStyle = C.red; g.textAlign = 'right'; g.fillText('КИЇВ', TW - 36, 50); g.textAlign = 'left';
  },
  [GOAL](g) { goalTile(g, false); },
  [GOAL + 1](g) { goalTile(g, true); },
  [CALM](g) {            // пропустили: стадіон господаря не радіє, а тримається
    g.fillStyle = C.ink; g.fillRect(0, 0, TW, TH);
    g.fillStyle = C.red; g.fillRect(30, 16, 12, 64); g.fillStyle = C.green; g.fillRect(46, 16, 12, 64);
    g.fillStyle = C.cream; g.font = sans(800, 58); g.fillText('ЩЕ НЕ ВЕЧІР', 88, 50);
    for (let i = 0; i < 3; i++) chevron(g, 880 + i * 34, 48, 44, i === 2 ? C.red2 : '#3c454b');
  },
  [REPLAY](g) {          // повтор: кіноплівка й «◀◀», двічі на кадр — кадр прокручується
    g.fillStyle = C.ink; g.fillRect(0, 0, TW, TH);
    g.fillStyle = '#3a4248'; for (let x = 4; x < TW; x += 16) { g.fillRect(x, 4, 8, 7); g.fillRect(x, TH - 11, 8, 7); }
    for (let k = 0; k < 2; k++) {
      const x0 = k * 512 + 60;
      g.fillStyle = C.red2; for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(x0 + i * 28, 48); g.lineTo(x0 + 28 + i * 28, 30); g.lineTo(x0 + 28 + i * 28, 66); g.fill(); }
      g.fillStyle = C.cream; g.font = sans(800, 52); g.fillText('ПОВТОР', x0 + 82, 50);
    }
  },
  [BREAK](g) {
    g.fillStyle = C.green; g.fillRect(0, 0, TW, TH);
    g.fillStyle = C.cream; g.font = sans(800, 62); g.fillText('ПЕРЕРВА', 40, 50);
    g.fillStyle = '#bfe3cc'; g.font = sans(600, 24); g.textAlign = 'right'; g.fillText('ДРУГА ПОЛОВИНА — ЗА КІЛЬКА ХВИЛИН', TW - 40, 52); g.textAlign = 'left';
  },
  [CHANT](g) {           // кричалка складами: червоне й зелене навпіл
    g.fillStyle = C.red; g.fillRect(0, 0, TW / 2, TH); g.fillStyle = C.green; g.fillRect(TW / 2, 0, TW / 2, TH);
    g.fillStyle = C.cream; g.font = sans(800, 70);
    const sy = ['ЛО', 'КО', 'МО', 'ТИВ'];
    for (let i = 0; i < 4; i++) { g.textAlign = 'center'; italic(g, sy[i], 128 + i * 256, 54); }
    g.textAlign = 'left';
    for (let i = 1; i < 4; i++) { g.fillStyle = 'rgba(241,239,232,0.5)'; g.fillRect(i * 256 - 3, 30, 6, 36); }
  },
};
function goalTile(g, alt) {   // «ГОЛ!» у дві фази: червона й зелена, з різними місцями написів, тож борт «стрибає»
  g.fillStyle = alt ? C.green : C.red; g.fillRect(0, 0, TW, TH);
  g.fillStyle = C.cream; g.font = sans(800, 80);
  const w = g.measureText('ГОЛ!').width;
  for (let k = -1; k < 4; k++) {
    const x = k * 340 + (alt ? 210 : 40);
    g.fillStyle = C.cream; italic(g, 'ГОЛ!', x, 54);
    chevron(g, x + w + 26, 48, 44, alt ? C.red2 : '#36b56a');
  }
}

/** Живі кадри: гості, рахунок, пенальті, напис. Малюються за подією в окрему малу текстуру. */
const LIVE = {
  [GUEST](g, d) {
    const m = d.kit.main, fg = fgOn(m, d.kit.second);
    g.fillStyle = m; g.fillRect(0, 0, TW, TH);
    g.fillStyle = fg; for (let i = 0; i < 3; i++) { g.fillRect(24 + i * 16, 10, 8, 76); g.fillRect(TW - 32 - i * 16, 10, 8, 76); }
    g.globalAlpha = 0.85; g.font = sans(600, 22); track(g, 'ВІТАЄМО ГОСТЕЙ', 92, 24, 3); g.globalAlpha = 1;
    fit(g, d.away, TW - 220, 58, (p) => sans(800, p)); g.fillText(d.away, 90, 62);
  },
  [SCORE](g, d) {
    g.fillStyle = C.ink; g.fillRect(0, 0, TW, TH);
    g.fillStyle = C.red; g.fillRect(0, 0, 380, TH);
    const m = d.kit.main; g.fillStyle = m; g.fillRect(644, 0, 380, TH);
    g.textAlign = 'right'; g.fillStyle = C.cream; fit(g, d.home, 330, 44, (p) => sans(800, p)); g.fillText(d.home, 356, 50);
    g.textAlign = 'left'; g.fillStyle = fgOn(m, d.kit.second); fit(g, d.away, 330, 44, (p) => sans(800, p)); g.fillText(d.away, 668, 50);
    g.textAlign = 'center'; g.fillStyle = C.cream; g.font = sans(800, 76); g.fillText(d.a + ':' + d.b, 512, 52);
    g.textAlign = 'left';
  },
  [PENS](g, d) {
    g.fillStyle = C.ink; g.fillRect(0, 0, TW, TH);
    g.fillStyle = C.cream; g.font = sans(800, 34); g.fillText('ПЕНАЛЬТІ', 30, 50);
    const row = (arr, y, name) => {
      g.fillStyle = C.grey; fit(g, name, 200, 20, (p) => sans(600, p)); g.fillText(name, 280, y);
      const n = Math.max(5, arr.length), o = Math.max(0, arr.length - 10);
      for (let i = o; i < Math.min(n, o + 10); i++) {
        const x = 520 + (i - o) * 46;
        g.beginPath(); g.arc(x, y, 13, 0, 6.283);
        if (i < arr.length) { g.fillStyle = arr[i] ? '#2fc46e' : C.red2; g.fill(); } else { g.strokeStyle = '#4a5358'; g.lineWidth = 3; g.stroke(); }
      }
    };
    row(d.pm, 28, d.home); row(d.po, 70, d.away);
  },
  [TEXT](g, d) {
    const t = d.tone;
    g.fillStyle = t === 'win' ? C.red : t === 'goal' ? C.green : C.ink; g.fillRect(0, 0, TW, TH);
    if (t === 'win') { g.fillStyle = C.green; g.fillRect(TW - 300, 0, 300, TH); }
    g.fillStyle = C.cream; fit(g, d.main, 640, 60, (p) => sans(800, p)); g.fillText(d.main, 40, 50);
    if (d.sub) { g.textAlign = 'right'; g.font = sans(800, 44); g.fillText(d.sub, TW - 40, 50); g.textAlign = 'left'; }
  },
};

// ---------------------------------------------------------------- шейдер
const VERT_HEAD = 'varying vec2 vLed;\n';
// Шейдер (лише ASCII в тексті: старі драйвери WebGL не приймають інших символів навіть у коментарях).
// bFrame: колір кадру f у точці модуля (fu по довжині, v по висоті): плитка з анімацією й прокруткою (у діодах повного кадру,
//   тож на слабкому рівні швидкість та сама), вибірка в центрі діода через textureGrad, щоб mip брався за справжнім розміром на екрані.
// Тіло: далекий борт не глибше ~3-го mip (не тягне сусідній кадр); переходи uStyle: 0 різка зміна із затримкою модуля (хвиля),
//   1 шторка згори, 2 розсипання по діодах, 3 протяжка зліва, 4 згасання в чорне й новий кадр; шов між модулями;
//   сітку діодів видно лише зблизька, здалеку вона б мерехтіла.
const FRAG_HEAD = `
uniform sampler2D tAtlas;
uniform sampler2D tLive;
uniform sampler2D tTab;
uniform float uTime, uT0, uDur, uStyle, uDots;
uniform vec2 uLed;
varying vec2 vLed;
vec4 bTab(float x, float y) { return floor(texelFetch(tTab, ivec2(int(x), int(y)), 0) * 255.0 + 0.5); }
float bHash(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 bFrame(float f, float ph, float fu, float v, vec2 gx, vec2 gy) {
  vec4 fr = bTab(f, 1.0);
  float tile = fr.r + mod(floor(uTime * fr.b * 0.1) + ph, max(fr.g, 1.0));
  fu = fract(fu + uTime * (fr.a - 128.0) / ${TW}.0);
  vec2 fc = (floor(vec2(fu, v) * uLed) + 0.5) / uLed;
  if (tile < ${NT}.0) {
    float col = mod(tile, ${COLS}.0), row = floor(tile / ${COLS}.0);
    vec2 sz = vec2(${TW / (COLS * CW)}, ${TH / (ROWS * CH)});
    vec2 uv = vec2((col * ${CW}.0 + ${PAD}.0) / ${COLS * CW}.0 + fc.x * sz.x, 1.0 - ((row * ${CH}.0 + ${PAD}.0) / ${ROWS * CH}.0 + (1.0 - fc.y) * sz.y));
    return textureGrad(tAtlas, uv, gx * sz, gy * sz).rgb;
  }
  float row = tile - ${NT}.0;
  vec2 sz = vec2(${TW / CW}, ${TH / (NL * CH)});
  vec2 uv = vec2(${PAD}.0 / ${CW}.0 + fc.x * sz.x, 1.0 - ((row * ${CH}.0 + ${PAD}.0) / ${NL * CH}.0 + (1.0 - fc.y) * sz.y));
  return textureGrad(tLive, uv, gx * sz, gy * sz).rgb;
}
`;
const FRAG_BODY = `
  {
    float slot = floor(vLed.x), fu = vLed.x - slot;
    vec4 s = bTab(slot, 0.0);
    vec2 led = vec2(fu, vLed.y) * uLed, cell = floor(led);
    vec2 gx = dFdx(vec2(fu, vLed.y)), gy = dFdy(vec2(fu, vLed.y));
    float gl = max(length(gx * uLed), length(gy * uLed));
    if (gl > 6.0) { gx *= 6.0 / gl; gy *= 6.0 / gl; }
    float p = clamp((uTime - uT0 - s.b * 0.02) / uDur, 0.0, 1.0), fade = 1.0;
    bool useB;
    if (uStyle < 0.5) useB = uTime >= uT0 + s.b * 0.02;
    else if (uStyle < 1.5) useB = (uLed.y - cell.y - 0.5) / uLed.y < p;
    else if (uStyle < 2.5) useB = bHash(cell + slot * 17.0) < p;
    else if (uStyle < 3.5) useB = (cell.x + 0.5) / uLed.x < p;
    else { useB = p >= 0.5; fade = abs(p * 2.0 - 1.0); }
    vec3 led3 = bFrame(useB ? s.g : s.r, s.a, fu, vLed.y, gx, gy) * fade;
    if (cell.x < 1.0) led3 *= 0.3;
    vec2 q = abs(fract(led) - 0.5) * 2.0;
    float m = 1.0 - smoothstep(0.6, 0.95, max(q.x, q.y));
    float fw = max(fwidth(led.x), fwidth(led.y));
    float k = uDots * (1.0 - smoothstep(0.15, 0.35, fw));
    led3 *= mix(1.0, 0.3 + 0.9 * m, k);
    diffuseColor.rgb *= led3;
  }
`;

// ---------------------------------------------------------------- борти
/**
 * Модулі периметра й усе, що на них показують. buildPitch додає модулі (addSlot) і бере material;
 * MatchView ставить команди (setTeams) і рівень (setDetail); Match і онлайн-гість кличуть update і cue.
 */
export class Boards {
  constructor() {
    this.slots = [];                                   // { x, z, corner, ang }
    this.k = 1;                                        // масштаб атласу: 0.5 на слабких рівнях
    this.data = new Uint8Array(MAXS * 2 * 4);
    this.rot = new Uint8Array(MAXS);                   // кадр ротації кожного модуля (щоб повернути після «моменту»)
    this.tab = new THREE.DataTexture(this.data, MAXS, 2, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.tab.magFilter = this.tab.minFilter = THREE.NearestFilter; this.tab.generateMipmaps = false; this.tab.needsUpdate = true;
    for (let f = 0; f < 32; f++) this.frameDef(f, f, 1, 0, 0);
    this.frameDef(CHEV, CHEV, 1, 0, 40); this.frameDef(GOAL, GOAL, 2, 2, 0); this.frameDef(REPLAY, REPLAY, 1, 0, -36);
    this.d = { home: 'ЛОКОМОТИВ', away: 'ГОСТІ', kit: { main: '#254e9c', second: '#e4e8ec' }, a: 0, b: 0, pm: [], po: [], main: '', sub: '', tone: '' };
    this.U = {
      tAtlas: { value: null }, tLive: { value: null }, tTab: { value: this.tab },
      uTime: { value: 0 }, uT0: { value: -10 }, uDur: { value: 0.5 }, uStyle: { value: 0 }, uDots: { value: 1 }, uLed: { value: new THREE.Vector2(TW, TH) },
    };
    this.material = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });   // LED світиться сам; туман і тонмапінг — як у решти сцени
    this.material.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.U);
      sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLed = uv;');
      sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('#include <map_fragment>', FRAG_BODY);
    };
    this.material.customProgramCacheKey = () => 'loko-led-boards';
    this.build(1);
    this.t = 0; this.next = 0; this.gx = 0; this.brkN = 0; this.endWin = false; this.mode = 'play'; this.base = 'play'; this.stage = 0; this.lite = false; this.lastSync = -1;
    const repaint = () => { this.paintAtlas(); this.paintLive(); };
    whenLogo(repaint); whenLogos(repaint);
    if (typeof document === 'object' && document.fonts && document.fonts.load) {   // Rubik вантажиться ліниво: без цього перше полотно вийде запасним шрифтом
      Promise.all([document.fonts.load(sans(800, 40), 'ЛОКО'), document.fonts.load(sans(600, 20), 'ЛОКО')]).then(repaint, () => {});
    }
  }

  /** Полотна атласу й живих кадрів у масштабі k; старі текстури звільняються. */
  build(k) {
    this.k = k;
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k); return c; };
    this.ca = mk(COLS * CW, ROWS * CH); this.cl = mk(CW, NL * CH);
    const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, ANISO); return t; };
    if (this.U.tAtlas.value) { this.U.tAtlas.value.dispose(); this.U.tLive.value.dispose(); }
    this.U.tAtlas.value = tex(this.ca); this.U.tLive.value = tex(this.cl);
    this.U.uLed.value.set(Math.round(TW * k), Math.round(TH * k));
    this.paintAtlas(); this.paintLive();
  }

  /** Один кадр у комірку (col, row) полотна c: малюємо в координатах 1024×96, далі розтягуємо крайні діоди на поле PAD. */
  paintCell(c, col, row, fn, d) {
    const g = c.getContext('2d'), k = this.k, x = (col * CW + PAD) * k, y = (row * CH + PAD) * k, w = TW * k, h = TH * k, p = PAD * k;
    g.save(); g.translate(x, y); g.scale(k, k);
    g.beginPath(); g.rect(0, 0, TW, TH); g.clip();
    g.textBaseline = 'middle'; g.textAlign = 'left'; g.globalAlpha = 1;
    fn(g, d);
    g.restore();
    g.drawImage(c, x, y, w, 1, x, y - p, w, p); g.drawImage(c, x, y + h - 1, w, 1, x, y + h, w, p);
    g.drawImage(c, x, y - p, 1, h + 2 * p, x - p, y - p, p, h + 2 * p); g.drawImage(c, x + w - 1, y - p, 1, h + 2 * p, x + w, y - p, p, h + 2 * p);
  }
  paintAtlas() {
    for (let i = 0; i < NT; i++) if (PAINT[i]) this.paintCell(this.ca, i % COLS, (i / COLS) | 0, PAINT[i]);
    this.U.tAtlas.value.needsUpdate = true;
  }
  paintLive(only = -1) {
    for (let i = 0; i < NL; i++) if (only < 0 || only === NT + i) this.paintCell(this.cl, 0, i, LIVE[NT + i], this.d);
    this.U.tLive.value.needsUpdate = true;
  }

  frameDef(f, first, n, fps, scroll) { const o = (MAXS + f) * 4, a = this.data; a[o] = first; a[o + 1] = n; a[o + 2] = fps * 10; a[o + 3] = 128 + scroll; }

  /** Модуль периметра (центр x, z); вертає його номер для UV. corner — короткий зріз кута. */
  addSlot(x, z, corner) {
    const i = this.slots.length;
    if (i >= MAXS) return MAXS - 1;
    this.slots.push({ x, z, corner, ang: Math.atan2(z, x * 0.62) });
    return i;
  }

  /** Рівень деталізації: на 0–1 атлас удвічі менший, без сітки діодів і без дорогих переходів. */
  setDetail(d) {
    const lv = DETAIL.indexOf(d), lite = lv >= 0 && lv < 2;
    this.lite = lite; this.U.uDots.value = lite ? 0 : 1;
    if ((lite ? 0.5 : 1) !== this.k) this.build(lite ? 0.5 : 1);
  }

  /** Команди матчу: home — онлайн-клуб господаря (або null: «Локомотив»), club — гості. */
  setTeams(home, club) {
    const d = this.d;
    d.home = home && home.name ? String(home.name).toUpperCase() : 'ЛОКОМОТИВ';
    if (club) { d.away = String(club.name).toUpperCase(); d.kit = { main: club.kit.main, second: club.kit.second }; }
    d.a = 0; d.b = 0; d.pm = []; d.po = [];
    this.paintLive();
  }
  /** Сумісність зі старим викликом. */
  redraw(club) { this.setTeams(null, club); }

  // ------------------------------------------------------------ програма модулів
  /** Почати перехід: поточні кадри стають «A», нові пише caller у «B» (setB), далі go(). */
  begin() { const a = this.data; for (let s = 0; s < this.slots.length; s++) { const o = s * 4; a[o] = a[o + 1]; a[o + 2] = 0; a[o + 3] = 0; } }
  setB(s, f, ph = 0, delay = 0) { const o = s * 4, a = this.data; a[o + 1] = f; a[o + 3] = ph; a[o + 2] = Math.min(255, Math.round(delay * 50)); }
  go(style, dur) {
    if (this.lite && (style === 2 || style === 4)) style = style === 2 ? 1 : 0;   // слабкий рівень: без розсипання й згасання
    this.U.uT0.value = this.t; this.U.uDur.value = dur; this.U.uStyle.value = style; this.tab.needsUpdate = true;
  }
  /** Затримка модуля для хвилі від точки на периметрі (кут ang0): в обидва боки по колу. */
  waveDelay(s, ang0, full) { let d = Math.abs(this.slots[s].ang - ang0); if (d > Math.PI) d = 2 * Math.PI - d; return d / Math.PI * full; }
  pick(not) {
    for (let tries = 0; tries < 6; tries++) {
      let r = Math.random() * POOL_W, i = 0;
      while (r > POOL[i][1]) { r -= POOL[i][1]; i++; }
      if (POOL[i][0] !== not) return POOL[i][0];
    }
    return CLUB;
  }
  /** Нова програма ротації: уся арена одне, пара через модуль або послідовність, як на справжньому периметрі. */
  rotate(slow) {
    const n = this.slots.length, r = Math.random(), rot = this.rot;
    if (r < 0.28) { let f = this.pick(this.lastSync); this.lastSync = f; for (let s = 0; s < n; s++) rot[s] = f; }
    else if (r < 0.62) { const a = this.pick(-1), b = this.pick(a); for (let s = 0; s < n; s++) rot[s] = s % 2 ? b : a; }
    else {
      const q = this.seq || (this.seq = [0, 0, 0, 0, 0]);
      for (let i = 0; i < 5; i++) q[i] = this.pick(i ? q[i - 1] : q[4]);   // сусіди різні, і по колу теж
      for (let s = 0; s < n; s++) rot[s] = q[s % 5];
    }
    this.begin();
    const st = Math.random(), sa = Math.random() * 6.283;
    for (let s = 0; s < n; s++) this.setB(s, this.slots[s].corner ? CHEV : rot[s], 0, st < 0.35 ? this.waveDelay(s, sa, 1.6) : 0);
    if (st < 0.35) this.go(0, 0.3); else if (st < 0.6) this.go(4, 0.7); else if (st < 0.8) this.go(1, 0.45); else if (st < 0.9) this.go(2, 0.8); else this.go(3, 0.5);
    this.next = this.t + (slow ? 12 : 8) + Math.random() * 4;
  }
  /** Уся арена показує кадр f (на зрізах кутів — шеврони), перехід style. */
  all(f, style, dur, ph = 0, ang = null) {
    this.begin();
    for (let s = 0; s < this.slots.length; s++) this.setB(s, this.slots[s].corner && f < NT ? CHEV : f, ph ? s % 2 : 0, ang == null ? 0 : this.waveDelay(s, ang, 1.4));
    this.go(style, dur);
  }
  /** Пара кадрів через модуль. */
  pair(a, b, style, dur) { this.begin(); for (let s = 0; s < this.slots.length; s++) this.setB(s, s % 2 ? b : a); this.go(style, dur); }

  // ------------------------------------------------------------ режисер
  /**
   * Подія гри (лише вигляд, геймплей не чує): intro, play, goal {home, x, a, b, who, min}, chance {x}, replay, replayEnd,
   * break {n, a, b}, pens, pen {home, goal, pm, po}, end {res, a, b}. Онлайн: господар пересилає ці виклики гостю (host.js).
   */
  cue(name, o = {}) {
    const d = this.d;
    switch (name) {
      case 'intro': this.base = 'intro'; this.enter('intro'); break;
      case 'play': this.base = 'play'; if (this.mode !== 'replay' && this.mode !== 'goalH' && this.mode !== 'goalA') this.enter('play'); break;
      case 'goal':
        d.a = o.a | 0; d.b = o.b | 0;
        d.main = o.who ? 'ГОЛ · ' + String(o.who).toUpperCase() : 'ГОЛ'; d.sub = o.min ? String(o.min) : ''; d.tone = 'goal';
        this.paintLive(); this.gx = o.x || 0;
        this.enter(o.home ? 'goalH' : 'goalA'); break;
      case 'chance': if (this.mode === 'play' && this.base === 'play') { this.gx = o.x || 0; this.enter('chance'); } break;
      case 'replay': this.enter('replay'); break;
      case 'replayEnd': if (this.mode === 'replay') this.resume(); break;
      case 'break':
        this.base = 'break'; d.a = o.a | 0; d.b = o.b | 0;
        d.main = o.n === 2 ? 'ПЕРЕРВА' : 'КІНЕЦЬ ' + (o.n | 0) + '-ГО ТАЙМУ'; d.sub = d.a + ':' + d.b; d.tone = '';
        this.paintLive(); this.brkN = o.n | 0; this.enter('break'); break;
      case 'pens': this.base = 'pens'; d.pm = []; d.po = []; this.paintLive(PENS); this.enter('pens'); break;
      case 'pen':
        d.pm = Array.isArray(o.pm) ? o.pm.slice(0, 30) : d.pm; d.po = Array.isArray(o.po) ? o.po.slice(0, 30) : d.po; this.paintLive(PENS);
        if (o.goal && o.home) this.enter('penGoal'); break;
      case 'end':
        this.base = 'end'; d.a = o.a | 0; d.b = o.b | 0;
        d.main = o.res === 'win' ? 'ПЕРЕМОГА!' : o.res === 'draw' ? 'НІЧИЯ' : 'ДЯКУЄМО ЗА ПІДТРИМКУ'; d.sub = ''; d.tone = o.res === 'win' ? 'win' : '';
        this.paintLive(); this.endWin = o.res === 'win'; this.enter('end'); break;
      default: break;
    }
  }
  enter(mode) { this.mode = mode; this.stage = 0; this.next = this.t; this.step(); }
  resume() { this.enter(this.base); }
  /** Наступний крок поточного режиму; кличеться, коли настав час this.next. */
  step() {
    const st = this.stage++, gang = Math.atan2(0, this.gx * 0.62);
    switch (this.mode) {
      case 'play': this.rotate(false); break;
      case 'intro':
        if (st === 0) { this.begin(); for (let s = 0; s < this.slots.length; s++) this.setB(s, this.slots[s].x < 0 ? CLUB : GUEST); this.go(4, 0.8); this.next = this.t + 9; }
        else if (st === 1) { this.all(CHANT, 0, 0.3, 0, Math.PI); this.next = this.t + 6; }
        else this.rotate(false);
        break;
      case 'goalH':
        if (st === 0) { this.all(GOAL, 0, 0.3, 1, gang); this.next = this.t + 6; }
        else if (st === 1) { this.pair(SCORE, TEXT, 4, 0.7); this.next = this.t + 7; }
        else this.resume();
        break;
      case 'goalA':
        if (st === 0) { this.all(CALM, 4, 1.2); this.next = this.t + 5; }
        else if (st === 1) { this.all(SCORE, 1, 0.5); this.next = this.t + 5; }
        else this.resume();
        break;
      case 'chance':
        if (st === 0) {
          this.begin(); const sx = Math.sign(this.gx) || 1;
          for (let s = 0; s < this.slots.length; s++) { const q = this.slots[s]; this.setB(s, q.x * sx > L - 14 ? CHEV : q.corner ? CHEV : this.rot[s]); }
          this.go(0, 0.2); this.next = this.t + 3.5;
        } else { this.begin(); for (let s = 0; s < this.slots.length; s++) this.setB(s, this.slots[s].corner ? CHEV : this.rot[s]); this.go(1, 0.45); this.mode = 'play'; this.stage = 0; this.next = this.t + 5 + Math.random() * 3; }
        break;
      case 'replay': if (st === 0) { this.all(REPLAY, 1, 0.4); this.next = 1e9; } break;
      case 'break':
        if (st === 0) { this.all(this.brkN === 2 ? BREAK : TEXT, 4, 0.8); this.next = this.t + 7; }
        else if (st === 1) { this.pair(this.brkN === 2 ? BREAK : TEXT, SCORE, 1, 0.45); this.next = this.t + 6; }
        else this.rotate(true);
        break;
      case 'pens': if (st === 0) { this.all(PENS, 4, 0.8); this.next = 1e9; } break;
      case 'penGoal':
        if (st === 0) { this.all(GOAL, 0, 0.2, 1); this.next = this.t + 2.6; }
        else { this.mode = 'pens'; this.stage = 1; this.all(PENS, 1, 0.4); this.next = 1e9; }
        break;
      case 'end':
        if (st === 0 && this.endWin) { this.all(GOAL, 0, 0.3, 1, Math.PI / 2); this.next = this.t + 4; }
        else { this.pair(SCORE, TEXT, 4, 0.8); this.next = 1e9; }
        break;
      default: this.next = 1e9;
    }
  }
  /** Щокадру: лише час шейдера й, зрідка, наступний крок програми. Справжній час (не сповільнений приціл): борт живе своїм темпом. */
  update(dt) {
    if (!(dt > 0)) return;
    this.t += Math.min(dt, 0.25);
    if (this.t > 600) { this.t -= 600; this.U.uT0.value -= 600; if (this.next < 1e8) this.next -= 600; }   // малий час для точності шейдера на телефонах
    this.U.uTime.value = this.t;
    if (this.t >= this.next && this.slots.length) this.step();
  }
}
