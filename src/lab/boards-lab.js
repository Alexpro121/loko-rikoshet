// Перегляд LED-бортів (boards.html): лише поле з бортами, камери гри й кіно, кнопки подій матчу й рівні деталізації; window.boards у консолі.
import '@fontsource/rubik/cyrillic-600.css';
import '@fontsource/rubik/cyrillic-800.css';
import '@fontsource/rubik/latin-600.css';
import '@fontsource/rubik/latin-800.css';
import './lab.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildPitch } from '../graphics/pitch.js';
import { DETAIL } from '../core/perf.js';
import { PITCH, LEAGUES } from '../config.js';

const { L, W } = PITCH;
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#9cc3dd');
scene.add(new THREE.HemisphereLight('#dfefff', '#3b5a2a', 1.6));
const sun = new THREE.DirectionalLight('#fff4e0', 1.8); sun.position.set(30, 60, 20); scene.add(sun);
const pitch = buildPitch(); scene.add(pitch.group);
const boards = pitch.boards;
window.boards = boards;
window.boardsCam = (p, l, fov = camera.fov) => { camera.position.set(...p); ctl.target.set(...l); camera.fov = fov; camera.updateProjectionMatrix(); ctl.update(); };   // своя точка огляду з консолі

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 600);
const ctl = new OrbitControls(camera, canvas); ctl.enableDamping = true;
// [назва, позиція, ціль, fov]: ігрові — приблизно як класична й трансляція; решта — кінокамера, повтор і трибуна (зовнішні борти)
const CAMS = [
  ['Гра', [10, 34, 22], [10, 0, -14], 34], ['Трансляція', [0, 30, 66], [0, 0, -6], 30], ['Біля борту', [6, 1.5, 30], [16, 0.7, 37], 40],
  ['За воротами', [L - 14, 3.2, 6], [L, 0.8, -2], 45], ['Кут', [-L + 12, 2.4, -W + 10], [-L, 0.6, -W + 2], 50], ['Трибуна', [-8, 13, 56], [4, 0, 30], 40],
];
const setCam = (i) => { const [, p, l, f] = CAMS[i]; camera.position.set(...p); ctl.target.set(...l); camera.fov = f; camera.updateProjectionMatrix(); ctl.update(); };
const camBox = document.getElementById('cams');
CAMS.forEach((c, i) => { const b = document.createElement('button'); b.className = 'ghost'; b.textContent = c[0]; b.onclick = () => setCam(i); camBox.appendChild(b); });
setCam(0);

// ---------------------------------------------------------------- панель
const clubs = LEAGUES.flatMap((l) => l.clubs);
let rate = 1, score = { a: 0, b: 0 }, pens = { pm: [], po: [] };
const panel = document.getElementById('panel');
panel.innerHTML = `<h1>LOKO · <b>борти</b></h1><div class="sub">Події лише для бортів: гра тут не йде. Камери — зверху ліворуч, мишею можна крутити.</div>
<h2>Події матчу</h2><div class="chips" id="ev"></div>
<h2>Пенальті</h2><div class="chips" id="pk"></div>
<h2>Кінець</h2><div class="chips" id="end"></div>
<h2>Гості</h2><div class="row"><label>Клуб</label><select id="club">${clubs.map((c, i) => `<option value="${i}">${c.name}</option>`).join('')}</select></div>
<h2>Деталізація</h2><div class="chips" id="lv"></div><div class="hint">0–1: атлас удвічі менший, без сітки діодів, переходи лише різкі.</div>
<h2>Час</h2><div class="chips" id="rate"></div>`;
const chips = (id, list) => { const box = panel.querySelector('#' + id); for (const [t, f] of list) { const b = document.createElement('button'); b.textContent = t; b.onclick = () => f(b); box.appendChild(b); } return box; };
chips('ev', [
  ['Вихід команд', () => boards.cue('intro')], ['Гра (ротація)', () => boards.cue('play')],
  ['Наш гол', () => { score.a++; boards.cue('goal', { home: true, x: L + 1, a: score.a, b: score.b, who: 'Петренко', min: "34'" }); }],
  ['Гол суперника', () => { score.b++; boards.cue('goal', { home: false, x: -L - 1, a: score.a, b: score.b, who: 'Гість', min: "61'" }); }],
  ['Момент біля їхніх воріт', () => boards.cue('chance', { x: L })], ['Момент біля наших', () => boards.cue('chance', { x: -L })],
  ['Повтор', () => boards.cue('replay')], ['Кінець повтору', () => boards.cue('replayEnd')],
  ['Перерва', () => boards.cue('break', { n: 2, ...score })], ['Кінець 1-го тайму', () => boards.cue('break', { n: 1, ...score })],
]);
chips('pk', [
  ['Почати серію', () => { pens = { pm: [], po: [] }; boards.cue('pens'); }],
  ['Ми: гол', () => { pens.pm.push(true); boards.cue('pen', { home: true, goal: true, ...pens }); }], ['Ми: мимо', () => { pens.pm.push(false); boards.cue('pen', { home: true, goal: false, ...pens }); }],
  ['Вони: гол', () => { pens.po.push(true); boards.cue('pen', { home: false, goal: true, ...pens }); }], ['Вони: сейв', () => { pens.po.push(false); boards.cue('pen', { home: false, goal: false, ...pens }); }],
]);
chips('end', [['Перемога', () => boards.cue('end', { res: 'win', a: 2, b: 1 })], ['Нічия', () => boards.cue('end', { res: 'draw', a: 1, b: 1 })], ['Поразка', () => boards.cue('end', { res: 'loss', a: 0, b: 2 })]]);
const sel = panel.querySelector('#club');
const setClub = () => { score = { a: 0, b: 0 }; boards.setTeams(null, clubs[+sel.value]); };
sel.onchange = setClub; setClub();
const lvBox = chips('lv', DETAIL.map((d, i) => [String(i), (b) => { boards.setDetail(d); [...lvBox.children].forEach((x) => x.classList.toggle('on', x === b)); }]));
lvBox.lastChild.classList.add('on'); boards.setDetail(DETAIL[DETAIL.length - 1]);
const rBox = chips('rate', [['×1', 1], ['×0.25', 0.25], ['пауза', 0]].map(([t, r]) => [t, (b) => { rate = r; [...rBox.children].forEach((x) => x.classList.toggle('on', x === b)); }]));
rBox.firstChild.classList.add('on');

// ---------------------------------------------------------------- цикл
const stats = document.getElementById('stats');
function resize() { const r = canvas.parentElement.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  boards.update(dt * rate);
  ctl.update(); renderer.render(scene, camera);
  stats.textContent = `режим ${boards.mode} · крок ${boards.stage} · далі через ${Math.max(0, boards.next - boards.t).toFixed(1)} с · викликів ${renderer.info.render.calls}`;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
