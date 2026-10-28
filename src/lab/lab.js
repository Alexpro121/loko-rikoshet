import '@fontsource/rubik/cyrillic-600.css';
import '@fontsource/rubik/cyrillic-800.css';
import '@fontsource/rubik/latin-600.css';
import '@fontsource/rubik/latin-800.css';
import './lab.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Player, diveKin } from '../graphics/player.js';
import { dribbleStep } from '../match/dribble.js';
import { KITS, KIT_GK_LOKO, LEAGUES, ACADEMY } from '../config.js';

/**
 * Лабораторія гравця: окрема сторінка, де модель і всі анімації видно зблизька.
 * Стан панелі зберігається, тож після правок player.js (Vite перезавантажує сторінку) повертаєшся в ту саму позу.
 */

// ---------------------------------------------------------------- стан
const KEY = 'loko-lab-v1';
const DEF = { kit: 'home', skin: '#d4a074', hair: 'crop', hairCol: '#4a2c17', beard: 0, num: 10, expr: 'neutral', anim: 'run', speed: 6, dribble: false,
  route: 'straight', face: 'move', power: 0.8, style: 0, sadStyle: 0, dir: 1, dk: 0, rate: 1, loop: true, wire: false, joints: false, squad: false, spin: false, cam: 'three' };
let S = { ...DEF };
try { S = { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { /* приватний режим */ }
S.wire = false; S.joints = false;                     // допоміжні шари не переживають перезавантаження: модель завжди відкривається суцільною
if (!(S.rate >= 0.05 && S.rate <= 1.5)) S.rate = 1;   // темп поза межами повзунка (напр. майже нуль) заморозив би всі анімації
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* немає сховища */ } };

const KIT_LIST = [
  ['home', 'ЛОКО · домашня', KITS.home.kit], ['away', 'ЛОКО · виїзна', KITS.away.kit], ['third', 'ЛОКО · третя', KITS.third.kit], ['gk', 'ЛОКО · воротар', KIT_GK_LOKO, true],
  ...LEAGUES.flatMap((l) => l.clubs.flatMap((c) => [[c.name, c.name, c.kit], [c.name + '-gk', c.name + ' · воротар', c.gk, true]])),
];
const kitOf = (id) => KIT_LIST.find((k) => k[0] === id) || KIT_LIST[0];
const T0 = 3.0;   // «рух по лінії»: час перебіжки від штанги до штанги, с
const GK_ANIMS = ['gkwait', 'gkshuffle', 'catch', 'scoop', 'gkdive', 'pdive', 'gkjump', 'parry', 'throw'];
/** Куди дивиться гравець відносно руху (для перевірки бігу боком, спиною, навскіс): зсув погляду від напрямку руху. */
const FACES = [['move', 'Туди, куди біжить'], ['side', 'Біжить боком (праворуч)'], ['sideL', 'Біжить боком (ліворуч)'], ['back', 'Біжить спиною'],
  ['diag', 'Навскіс уперед'], ['diagback', 'Навскіс назад'], ['target', 'Дивиться на точку (м’яч)']];
const FACE_OFF = { move: 0, side: -Math.PI / 2, sideL: Math.PI / 2, back: Math.PI, diag: -Math.PI / 4, diagback: Math.PI * 0.75 };
const lookOf = (o = {}) => { const k = kitOf(o.kit ?? S.kit); return { kit: k[2], gk: !!k[3] || (!S.squad && GK_ANIMS.includes(S.anim)), num: o.num ?? S.num, skin: o.skin ?? S.skin, hair: o.hair ?? S.hair, hairCol: o.hairCol ?? S.hairCol, beard: o.beard ?? S.beard, scale: 1 }; };

const ANIMS = [
  ['idle', 'Стійка'], ['run', 'Біг'], ['aim', 'Прицілювання'], ['kick', 'Удар'], ['pkick', 'Пенальті: удар'], ['control', 'Прийом'], ['chest', 'Груди'],
  ['header', 'Удар головою'], ['block', 'Блок'], ['hit', 'Влучання м’ячем'], ['tackle', 'Відбір'], ['slide', 'Підкат'], ['stumble', 'Падіння'],
  ['kneel', 'Ковзання на колінах'], ['knock', 'Поштовх (рекдол)'], ['cheer', 'Радість'], ['sad', 'Розчарування'], ['gkwait', 'Воротар: стійка'], ['catch', 'Воротар: ловить'], ['scoop', 'Воротар: підбирає'],
  ['gkdive', 'Воротар: стрибок'], ['pdive', 'Пенальті: стрибок'], ['gkjump', 'Воротар: вгору'], ['parry', 'Воротар: відбиває'], ['throw', 'Воротар: кидок'],
  ['gkshuffle', 'Воротар: рух по лінії'], ['stagger', 'Втримав рівновагу'], ['fend', 'Тримає суперника рукою'],
];
const CHEERS = ['Стрибки з руками', 'Махає рукою', 'Літак з нахилом', 'Кулаки вгору', 'Танець', 'Сальто', '«Локомотив»', 'Оберт 360°', '«Тихо!»', 'Колиска', 'Літак', 'Віддає честь', 'Деб'];

// ---------------------------------------------------------------- сцена
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9cfd6); scene.fog = new THREE.Fog(0xa9cfd6, 30, 70);
const cam = new THREE.PerspectiveCamera(32, 1, 0.2, 200);
cam.position.set(3.2, 2.0, 4.6);
const ctl = new OrbitControls(cam, canvas); ctl.target.set(0, 1.0, 0); ctl.enableDamping = true; ctl.update();
scene.add(new THREE.HemisphereLight(0xd3e4ff, 0x7b6d5c, 1.05));
const sun = new THREE.DirectionalLight(0xfff0d6, 2.0); sun.position.set(-4, 9, 6); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun);

// газон із покосом; гравець справді біжить полем, газон пересувається за ним кроком у 8 м (період текстури)
const gc = document.createElement('canvas'); gc.width = gc.height = 512;
{
  const g = gc.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#3f8a3c' : '#377f35'; g.fillRect(0, i * 64, 512, 64); }
  for (let i = 0; i < 9000; i++) { g.fillStyle = Math.random() > 0.5 ? 'rgba(20,70,25,0.18)' : 'rgba(160,210,100,0.12)'; g.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 3); }
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0, 254, 512, 5);
}
const gtex = new THREE.CanvasTexture(gc); gtex.colorSpace = THREE.SRGBColorSpace; gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping; gtex.repeat.set(10, 10); gtex.anisotropy = 8;
const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshLambertMaterial({ map: gtex }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.27, 3), new THREE.MeshLambertMaterial({ color: 0xf4f4ee })); ball.castShadow = true; ball.visible = false; scene.add(ball);
// точка, на яку дивиться гравець (режим «дивиться на точку»), і умовний суперник для «тримає рукою»
const lookPt = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 8), new THREE.MeshLambertMaterial({ color: 0xff8a1f })); lookPt.visible = false; scene.add(lookPt);
const phantom = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.8, 0.32), new THREE.MeshLambertMaterial({ color: 0x5a6b7a, transparent: true, opacity: 0.7 })); phantom.visible = false; scene.add(phantom);

// ---------------------------------------------------------------- гравці
let players = [];
const jointDots = [];
function spawn() {
  for (const p of players) scene.remove(p.root);
  players = [];
  const looks = S.squad
    ? [{}, { kit: 'away', hair: 'curly', skin: '#8a5a3c', hairCol: '#111827', num: 7 }, { kit: 'third', hair: 'long', skin: '#f3d2b3', hairCol: '#d8b25a', num: 9, beard: 0 },
      { kit: 'gk', hair: 'band', skin: '#b07a52', hairCol: '#1f2933', num: 1 }, { kit: 'ДИНАМО', hair: 'mohawk', skin: '#e8bf9b', hairCol: '#9c2a1c', num: 22, beard: 3 },
      { kit: 'home', hair: 'slick', skin: '#5f3d29', hairCol: '#111827', num: 4, beard: 2 }]
    : [{}];
  looks.forEach((o, i) => {
    const p = new Player(lookOf(o));
    p.lx = S.squad ? (i - (looks.length - 1) / 2) * 1.6 : 0;
    p.x = follow.x + Math.cos(cmd.heading) * p.lx; p.z = follow.z - Math.sin(cmd.heading) * p.lx; p.yaw = p.bodyYaw = cmd.heading;
    p.root.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
    scene.add(p.root); players.push(p);
  });
  setWire(); setJoints(); start(true);
}
const wireMat = new THREE.MeshBasicMaterial({ color: 0x0b1410, wireframe: true, transparent: true, opacity: 0.35, depthTest: true, polygonOffset: true, polygonOffsetFactor: -1 });
/** Каркас поверх суцільної моделі (а не замість неї), щоб було видно і блоки, і їхні межі. */
function setWire() {
  for (const p of players) {
    const meshes = []; p.root.traverse((m) => { if (m.isMesh && !m.userData.wire && !m.userData.dot) meshes.push(m); });
    for (const m of meshes) {
      if (m.userData.wireChild) { m.userData.wireChild.removeFromParent(); m.userData.wireChild = null; }
      if (S.wire) { const w = new THREE.Mesh(m.geometry, wireMat); w.userData.wire = true; m.add(w); m.userData.wireChild = w; }
    }
  }
}
function setJoints() {
  for (const d of jointDots) d.removeFromParent();
  jointDots.length = 0;
  if (!S.joints) return;
  const geo = new THREE.SphereGeometry(0.03, 8, 6), mat = new THREE.MeshBasicMaterial({ color: 0xffd23a, depthTest: false });
  for (const p of players) for (const k of ['pose', 'pelvis', 'lean', 'thorax', 'neck', 'legL', 'legR', 'shinL', 'shinR', 'footL', 'footR', 'armL', 'armR', 'foreL', 'foreR']) {
    const d = new THREE.Mesh(geo, mat); d.renderOrder = 10; d.userData.dot = true; p[k].add(d); jointDots.push(d);
  }
}

// ---------------------------------------------------------------- анімації
let waitT = 0, prog = 0, lastAnim = null;
const follow = { x: 0, z: 0, init: false };
/** Запуск обраної дії (усі гравці разом). */
function start(fresh) {
  prog = 0; waitT = 0;
  for (const p of players) {
    if (fresh || lastAnim !== S.anim) { p.mode = 'idle'; p.modeT = 0; p.kicking = 0; }
    p.setExpr(S.expr);
    const a = S.anim;
    if (a === 'idle' || a === 'run') { p.mode = 'idle'; p.modeT = 0; }
    else if (a === 'aim') { p.setMode('aim', 0); p.power = S.power; }
    else if (a === 'kick') p.kick(S.power);
    else if (a === 'pkick') p.startPKick();
    // стрибки — за фізикою: спершу удар (куди й коли прилетить м'яч), потім воротар сам рахує відштовхування до цієї точки
    else if (a === 'pdive' || a === 'gkdive') {
      divePrep(p);
      if (p === players[0] && !S.squad) { gkShot(p); const aim = { x: gb.cx, y: gb.yc, z: gb.cz }; if (a === 'pdive') p.startPDive(S.dir, S.dk, aim, gb.tc); else p.gkDive(S.dir, S.dk, aim, gb.tc); }
      else if (a === 'pdive') p.startPDive(S.dir, S.dk); else p.gkDive(S.dir, S.dk);
    }
    else if (a === 'cheer') { p.cheer(2.6); p.style = S.style; }
    else if (a === 'sad') { p.sad(2.4); p.style = S.sadStyle; }
    else if (a === 'control') { p.control(); p.style = S.style % 2; }
    else if (a === 'slide') p.slideTackle();
    else if (a === 'gkwait') { p.setMode('gkwait', 0); p.splitT = 0.18; }
    else if (a === 'catch' || a === 'scoop') { if (p === players[0]) { gkShot(p); p.ballAt(gb.x, gb.y, gb.z, GB_R); } p.catchBall(); }
    else if (a === 'throw') p.throwBall();
    else if (a === 'gkjump') p.gkJump();
    else if (a === 'parry') { p.mode = 'idle'; p.modeT = 0; }
    else if (a === 'stagger') { p.mode = 'idle'; p.modeT = 0; const ang = Math.random() * Math.PI * 2; p.stagger(Math.sin(ang), Math.cos(ang), 2 + Math.random() * 1.6); }
    else if (a === 'fend') { p.mode = 'idle'; p.modeT = 0; }
    else if (a === 'gkshuffle') { p.setMode('gkwait', 0); p.shuf0 = { x: p.x, z: p.z }; p.shufT = undefined; }
    else if (a === 'knock') { const ang = Math.random() * Math.PI * 2; p.knock(Math.sin(ang), Math.cos(ang), 3 + Math.random() * 2, Math.random() < 0.6); }
    else if (typeof p[a] === 'function') p[a]();
  }
  if (players[0] && GK_ANIMS.includes(S.anim) && S.anim !== 'throw' && !S.squad) { if (!['catch', 'scoop', 'pdive', 'gkdive'].includes(S.anim)) gkShot(players[0]); } else gb.on = false;
  lastAnim = S.anim;
}
/** Стрибок у лабораторії йде вбік, як у грі: щоразу з того самого місця, на ~3 м у бік стрибка. */
function divePrep(p) { if (!p.dive0 || lastAnim !== S.anim) p.dive0 = { x: p.x, z: p.z }; p.x = p.dive0.x; p.z = p.dive0.z; p.dive0F = false; }
const isHeld = () => ['idle', 'run', 'aim', 'gkwait', 'gkshuffle', 'fend'].includes(S.anim);

// ---------------------------------------------------------------- м'яч для воротаря
// Летить у воротаря з ~11 м і приходить у точку контакту в момент, коли дія до нього готова. Руки воротаря не знають
// траєкторії наперед — бачать лише м'яч (ballAt) і самі ведуть до нього рукавиці; ловля — м'яч лишається в руках,
// відбивання й стрибок — м'яч відлітає від долонь.
const GB_R = 0.17;                                   // радіус м'яча в масштабі моделі (у грі 0.14 м при зрості 0.82)
const gb = { on: false, t: 0, x: 0, y: 0, z: 0 };
const _gh = new THREE.Vector3(), _gh2 = new THREE.Vector3();
function gkShot(p) {
  const a = S.anim, h = p.yaw, fx = Math.sin(h), fz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);   // уперед і вбік від воротаря
  const o = (a === 'pdive' || a === 'gkdive') && p.dive0 ? p.dive0 : { x: p.x, z: p.z };
  let side = 0, fwd = 0.6, y = 1.35, tc = 0.27, stick = false, parryAt = -1, y0 = 1.0, arc = 0.4;
  if (a === 'catch') stick = true;
  else if (a === 'scoop') { y = GB_R; y0 = GB_R; arc = 0; fwd = 0.8; tc = 0.42; stick = true; }
  else if (a === 'parry') { side = 0.6 * (Math.random() < 0.5 ? -1 : 1); y = 2.0; fwd = 0.55; tc = 0.45; parryAt = tc - 0.22; }
  else if (a === 'gkjump') { y = 2.95; fwd = 0.25; tc = 0.3; parryAt = tc; arc = 0.7; }
  else if (a === 'gkdive' || a === 'pdive') {
    // як на пенальті: м'яч ~3 м убік від воротаря, долітає за ~0.55 с від початку стрибка
    side = -S.dir * 3.0; y = [2.2, 1.0, GB_R][S.dk]; fwd = 0.3; if (S.dk === 2) { y0 = GB_R; arc = 0; }
    tc = 0.55; parryAt = tc;
  } else if (a === 'gkwait') { Object.assign(gb, { on: true, t: 0, mode: 'track', o, fx, fz, rx, rz }); return; }
  const cx = o.x + fx * fwd + rx * side, cz = o.z + fz * fwd + rz * side;
  Object.assign(gb, { on: true, t: 0, mode: 'fly', tc, stick, parryAt, parried: false, hit: false, arc, y0, yc: y,
    sx: cx + fx * 11 - rx * side * 0.3, sz: cz + fz * 11 - rz * side * 0.3, cx, cz, x: cx + fx * 11, y: y0, z: cz + fz * 11, vx: 0, vy: 0, vz: 0, out: { x: rx * Math.sign(side || 1), z: rz * Math.sign(side || 1), fx, fz } });
}
function stepBall(dt, p) {
  if (!gb.on) return;
  gb.t += dt;
  if (gb.mode === 'track') {                         // м'яч ходить уздовж штрафного: руки воротаря стежать за ним
    const k = Math.sin(gb.t * 0.9) * 3.2, up = 0.9 + 0.6 * Math.sin(gb.t * 1.7);
    gb.x = gb.o.x + gb.fx * 9 + gb.rx * k; gb.y = up; gb.z = gb.o.z + gb.fz * 9 + gb.rz * k;
  } else if (!gb.hit) {
    const u = Math.min(1, gb.t / gb.tc);
    gb.x = gb.sx + (gb.cx - gb.sx) * u; gb.z = gb.sz + (gb.cz - gb.sz) * u; gb.y = gb.y0 + (gb.yc - gb.y0) * u + gb.arc * 4 * u * (1 - u);
    if (gb.parryAt >= 0 && !gb.parried && gb.t >= gb.parryAt) { gb.parried = true; p.parry(_gh.set(gb.cx, gb.yc, gb.cz)); }
    if (u >= 1) {
      gb.hit = true;
      if (!gb.stick) {                               // відбитий: летить назовні й угору, далі — тяжіння й відскоки від трави
        gb.vx = gb.out.x * 5 + gb.out.fx * 3; gb.vz = gb.out.z * 5 + gb.out.fz * 3; gb.vy = gb.yc > 1.5 ? 4 : 2.5;
        if (S.anim === 'scoop' || S.anim === 'catch') gb.vy = 0;
      }
    }
  } else if (gb.stick) {                             // у руках: м'яч між рукавицями
    // між долонями; при хваті «W» — перед долонями, на відстані радіуса м'яча
    const rb = GB_R / (p.root.scale.x || 0.82);                     // радіус у одиницях моделі (кисть масштабована разом із гравцем)
    p.handL.localToWorld(_gh.set(0.0485 + rb * (1 - p.hk.grip), -0.11, 0)); p.handR.localToWorld(_gh2.set(-0.0485 - rb * (1 - p.hk.grip), -0.11, 0));
    gb.x = (_gh.x + _gh2.x) / 2; gb.y = (_gh.y + _gh2.y) / 2; gb.z = (_gh.z + _gh2.z) / 2;
    if (p.mode === 'idle') gb.on = false;
  } else {
    gb.vy -= 9.8 * dt; gb.x += gb.vx * dt; gb.y += gb.vy * dt; gb.z += gb.vz * dt;
    if (gb.y < GB_R) { gb.y = GB_R; gb.vy = Math.abs(gb.vy) * 0.5; gb.vx *= 0.8; gb.vz *= 0.8; }
  }
}
const isDriven = () => S.anim === 'pkick' || S.anim === 'pdive';

// ---------------------------------------------------------------- рух полем: команди як у матчі (швидкість + курс), обмежені фізикою людини
const ROUTES = [['straight', 'Прямо'], ['circle', 'По колу'], ['zigzag', 'Зигзаг'], ['stopgo', 'Старт-стоп'], ['chaos', 'Як у матчі'], ['spin', 'Розворот на місці']];
const cmd = { v: 0, heading: 0, tgtV: 0, tgtH: 0, timer: 0, flip: 1, brakeT: 0 };
/** Маршрут задає бажану швидкість і курс; розгін ≤ 7 м/с², гальмування ≤ 9 м/с², поворот обмежений бічним прискоренням ~7 м/с². */
function steer(dt) {
  const moving = S.anim === 'run' || S.anim === 'idle';
  const r = moving ? S.route : 'none', V = S.anim === 'run' ? S.speed : 0;
  cmd.timer -= dt;
  if (r === 'straight') { cmd.tgtV = V; cmd.tgtH = cmd.heading; }
  else if (r === 'circle') { cmd.tgtV = V; cmd.tgtH = cmd.heading + Math.max(0.3, cmd.v / 7) * 0.25; }
  else if (r === 'zigzag') { cmd.tgtV = V; if (cmd.timer <= 0) { cmd.flip = -cmd.flip; cmd.tgtH = cmd.heading + cmd.flip * 1.6; cmd.timer = 1.3; } }
  else if (r === 'stopgo') { if (cmd.timer <= 0) { cmd.flip = -cmd.flip; cmd.timer = 2.2; } cmd.tgtV = cmd.flip > 0 ? V : 0; cmd.tgtH = cmd.heading; }
  else if (r === 'chaos') { if (cmd.timer <= 0) { cmd.tgtV = V * (Math.random() < 0.25 ? 0 : 0.3 + 0.7 * Math.random()); cmd.tgtH = cmd.heading + (Math.random() * 2 - 1) * 2.4; cmd.timer = 0.6 + Math.random() * 1.3; } }
  else if (r === 'spin') { cmd.tgtV = 0; if (cmd.timer <= 0) { cmd.flip = -cmd.flip; cmd.tgtH = cmd.heading + cmd.flip * Math.PI * 0.6; cmd.timer = 1.8; } }
  else { cmd.tgtV = 0; cmd.tgtH = cmd.heading; }
  if (cmd.brakeT > 0) { cmd.brakeT -= dt; cmd.tgtV = 0; }
  // прискорення наростає плавно (обмежений ривок): людина не стартує миттєво, сила росте за ~0.3 с
  const aWant = clamp((cmd.tgtV - cmd.v) * 3, -8, 6);
  cmd.a = (cmd.a || 0) + clamp(aWant - (cmd.a || 0), -20 * dt, 20 * dt);
  const nv = cmd.v + cmd.a * dt;
  if ((cmd.v - cmd.tgtV) * (nv - cmd.tgtV) < 0) { cmd.v = cmd.tgtV; cmd.a = 0; } else cmd.v = Math.max(0, nv);
  // поворот: кутова швидкість теж наростає плавно, максимум — бічне прискорення ~7 м/с²
  const rate = cmd.v > 0.6 ? Math.min(5, 7 / cmd.v) : 4;
  let dh = (cmd.tgtH - cmd.heading) % (Math.PI * 2); if (dh > Math.PI) dh -= Math.PI * 2; if (dh < -Math.PI) dh += Math.PI * 2;
  const wWant = clamp(dh * 4, -rate, rate);
  cmd.w = (cmd.w || 0) + clamp(wWant - (cmd.w || 0), -14 * dt, 14 * dt);
  cmd.heading += cmd.w * dt;
}

let paused = false, stepOnce = 0, lastDt = 1 / 60;
const labBall = { x: 0, z: 0, vx: 0, vz: 0 }, labDrib = { on: false, t: 0, steps: 0 };   // м'яч для ведення дотиками
const clock = new THREE.Clock(), _c = new THREE.Vector3(), _pc = new THREE.Vector3();
function tick() {
  requestAnimationFrame(tick);
  let dt = Math.min(0.05, clock.getDelta());
  if (paused && !stepOnce) dt = 0; else if (stepOnce) { dt = 1 / 60; stepOnce--; }
  dt *= paused ? 1 : S.rate;
  lastDt = dt;
  if (dt > 0) steer(dt);
  if (isDriven()) {
    const dur = S.anim === 'pkick' ? 1.3 : 1.9;
    prog += dt / dur;
    if (prog > 1.25) { if (S.loop) start(); else prog = 1.25; }
  } else if (!isHeld() && dt > 0) {
    const busy = players.some((p) => p.mode !== 'idle' || p.kicking > 0);
    if (!busy && S.loop) { waitT += dt; if (waitT > 0.55) start(); }
  }
  if (players[0] && dt > 0) { stepBall(dt, players[0]); if (gb.on) players[0].ballAt(gb.x, gb.y, gb.z, GB_R); else players[0].ballAt(null); }
  for (const p of players) {
    if (S.anim === 'aim') p.power = S.power;
    if (S.anim === 'pkick') p.kickP = Math.min(1, prog);
    if (S.anim === 'pdive') p.diveP = Math.min(1.5, prog * 1.5);
    p.dribble = S.dribble && S.anim === 'run';
    const h = cmd.heading;
    p.vx = Math.sin(h) * cmd.v; p.vz = Math.cos(h) * cmd.v;
    // погляд: туди, куди біжить, або зі зсувом (боком, спиною, навскіс), або на точку — так видно кожен варіант руху
    if (S.face === 'target' && (S.anim === 'run' || S.anim === 'idle')) {
      if (!lookPt.visible || Math.hypot(lookPt.position.x - p.x, lookPt.position.z - p.z) > 16) lookPt.position.set(p.x + Math.sin(h + 1.2) * 7, 0.3, p.z + Math.cos(h + 1.2) * 7);
      p.yaw = Math.atan2(lookPt.position.x - p.x, lookPt.position.z - p.z);
    } else p.yaw = h + (S.anim === 'run' || S.anim === 'idle' ? FACE_OFF[S.face] || 0 : 0);
    if (S.anim === 'gkshuffle' && p.shuf0 && p === players[0]) {    // воротар ходить уздовж лінії вліво-вправо, дивлячись уперед
      // від штанги до штанги: розгін, перебіжка до ~1.4 м/с, гальмування, коротка пауза в стійці — і назад
      p.shufT = (p.shufT ?? T0 / 2) + dt;                             // старт із середини воріт, без стрибка позиції
      const T = T0, P = 0.7, A = 1.4, c = p.shufT % (2 * (T + P)), seg = c < T + P ? c : c - T - P;
      const q = Math.min(1, seg / T), sm = q * q * (3 - 2 * q), k = c < T + P ? -A + 2 * A * sm : A - 2 * A * sm;
      p.yaw = h; p.vx = p.vz = 0;
      p.x = p.shuf0.x + Math.cos(h) * k; p.z = p.shuf0.z - Math.sin(h) * k;
    }
    if (S.anim === 'fend' && p === players[0]) {                    // суперник кружляє поруч на 1–2 м
      const a = clock.elapsedTime * 0.8, d = 1.5 + 0.55 * Math.sin(clock.elapsedTime * 1.7);
      phantom.position.set(p.x + Math.sin(h + a) * d, 0.9, p.z + Math.cos(h + a) * d);
      p.fendAt(phantom.position.x - p.x, phantom.position.z - p.z, Math.max(0, Math.min(1, (2.1 - d) / 0.6)));
    }
    if (p.diveFree) p.dive0F = true;                                  // після відриву тіло вже не ведемо (і не переносимо наприкінці)
    if ((S.anim === 'pdive' || S.anim === 'gkdive') && p.dive0 && !p.diveFree && !p.dive0F && p.mode === 'pdive') {
      const t = diveKin(Math.min(1, p.diveP || 0), S.dk).travel, side = -S.dir * 3;
      p.x = p.dive0.x + Math.cos(h) * side * t; p.z = p.dive0.z - Math.sin(h) * side * t; p.vx = p.vz = 0;
    }
    if (dt > 0) { p.x += p.vx * dt; p.z += p.vz * dt; p.animate(dt); }
  }
  // камера й газон їдуть за гравцями
  _c.set(0, 0, 0); for (const p of players) _c.add(_pc.set(p.x, 0, p.z)); _c.divideScalar(Math.max(1, players.length));
  if (!follow.init) { follow.x = _c.x; follow.z = _c.z; follow.init = true; }
  const fdx = _c.x - follow.x, fdz = _c.z - follow.z; follow.x = _c.x; follow.z = _c.z;
  cam.position.x += fdx; cam.position.z += fdz; ctl.target.x += fdx; ctl.target.z += fdz;
  ground.position.set(Math.round(_c.x / 8) * 8, 0, Math.round(_c.z / 8) * 8);
  sun.position.set(_c.x - 4, 9, _c.z + 6); sun.target.position.set(_c.x, 0, _c.z); sun.target.updateMatrixWorld();
  if (S.spin) { ctl.autoRotate = true; ctl.autoRotateSpeed = 2.2; } else ctl.autoRotate = false;
  ball.visible = (S.anim === 'kick' || S.anim === 'pkick' || S.anim === 'run' && S.dribble || gb.on) && !S.squad;
  lookPt.visible = S.face === 'target' && (S.anim === 'run' || S.anim === 'idle'); phantom.visible = S.anim === 'fend';
  if (gb.on) { ball.position.set(gb.x, gb.y, gb.z); ball.scale.setScalar(GB_R / 0.27); }
  else if (ball.visible) {
    const p = players[0], h = cmd.heading;
    if (S.anim === 'run' && S.dribble) {                              // ведення дотиками, як у грі (dribble.js)
      if (!labDrib.on || Math.hypot(labBall.x - p.x, labBall.z - p.z) > 4) { labDrib.on = true; labBall.x = p.x + Math.sin(h) * 0.8; labBall.z = p.z + Math.cos(h) * 0.8; labBall.vx = p.vx; labBall.vz = p.vz; }
      dribbleStep(labDrib, p, labBall, Math.sin(h), Math.cos(h), lastDt);
      ball.position.set(labBall.x, 0.27, labBall.z);
    } else {
      labDrib.on = false;
      const d = 0.6; ball.position.set(p.x + Math.sin(h) * d + Math.cos(h) * 0.15, 0.27, p.z + Math.cos(h) * d - Math.sin(h) * 0.15);
    }
    ball.scale.setScalar(0.82);
  }
  ctl.update();
  renderer.render(scene, cam);
  const inf = renderer.info.render;
  const gt = players[0] && players[0].gait;
  const p0 = players[0], rel = p0 && cmd.v > 0.3 ? Math.round(((((Math.atan2(p0.vx, p0.vz) - (p0.yawF ?? p0.yaw)) * 180 / Math.PI) % 360) + 540) % 360 - 180) : null;
  gaitEl.textContent = gt ? `виміряно: ${gt.state} · ${(gt.v || 0).toFixed(1)} м/с` + (rel !== null ? ` · рух ${rel}° від погляду · таз ${Math.round((p0.hipY || 0) * 57.3)}°` : '') + (gt.cadence ? ` · каденс ${Math.round(gt.cadence)} кроків/хв · крок ${gt.step.toFixed(2)} м · опора ${(gt.contact * 1000).toFixed(0)} мс · з польотом ${Math.round(gt.flight * 100)}% кроків` : '') + ` · нахил тулуба ${gt.lean.toFixed(0)}° (усе тіло ${gt.body.toFixed(0)}°)` : '';
  stats.textContent = `${players.length} × гравець · ${(inf.triangles / players.length / 1000).toFixed(1)}k трикутників на гравця (з тінню) · ${inf.calls} draw calls · ${Math.round(1 / Math.max(1e-3, clock.getDelta() + dt))} fps`;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const stats = document.getElementById('stats');
const gaitEl = document.createElement('div'); gaitEl.style.cssText = 'color:#e9f1ec;font-size:13px;margin-bottom:4px'; stats.before(gaitEl);
{ const w = document.createElement('div'); w.style.cssText = 'position:absolute;left:12px;bottom:10px;pointer-events:none;text-shadow:0 1px 2px #000'; stats.replaceWith(w); stats.style.position = 'static'; w.append(gaitEl, stats); }

function resize() {
  const v = document.getElementById('view'), w = v.clientWidth, h = v.clientHeight;
  renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------------------------------------------------------------- камери
const CAMS = {
  three: ['3/4', [4.2, 2.4, 6.0], [0, 1.25, 0]],
  front: ['Спереду', [0, 1.5, 7.0], [0, 1.3, 0]],
  side: ['Збоку', [7.0, 1.4, 0], [0, 1.25, 0]],
  back: ['Ззаду', [0, 1.8, -7.0], [0, 1.3, 0]],
  face: ['Обличчя', [0.55, 2.3, 1.5], [0, 2.2, 0]],
  feet: ['Ноги', [1.2, 0.5, 1.8], [0, 0.35, 0]],
  match: ['Як у матчі', [0, 16, 22], [0, 0.8, 0]],
};
function setCam(id, fly = true) {
  S.cam = id; save();
  const [, p, t] = CAMS[id] || CAMS.three, k = S.squad && id !== 'face' && id !== 'feet' ? 1.9 : 1;
  const to = new THREE.Vector3(...p).multiplyScalar(k), tt = new THREE.Vector3(...t);
  if (!fly) { cam.position.copy(to); ctl.target.copy(tt); return; }
  const from = cam.position.clone(), ft = ctl.target.clone(), t0 = performance.now();
  const step = () => { const q = Math.min(1, (performance.now() - t0) / 450), e = q * q * (3 - 2 * q); cam.position.lerpVectors(from, to, e); ctl.target.lerpVectors(ft, tt, e); if (q < 1) requestAnimationFrame(step); };
  step();
  renderCams();
}
function renderCams() {
  const el = document.getElementById('cams'); el.innerHTML = '';
  for (const [id, [name]] of Object.entries(CAMS)) { const b = btn(name, () => setCam(id), S.cam === id); b.classList.add('ghost'); el.append(b); }
}

// ---------------------------------------------------------------- панель
const panel = document.getElementById('panel');
const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, attrs); e.append(...kids); return e; };
function btn(text, on, active) { const b = h('button', { textContent: text, onclick: on }); if (active) b.classList.add('on'); return b; }
function row(label, ...kids) { return h('div', { className: 'row' }, h('label', { textContent: label }), h('div', {}, ...kids)); }
function select(key, opts, after) {
  const s = h('select', { onchange: () => { S[key] = isNaN(+s.value) || typeof DEF[key] !== 'number' ? s.value : +s.value; save(); after(); } });
  for (const [v, t] of opts) s.append(h('option', { value: v, textContent: t, selected: String(S[key]) === String(v) }));
  return s;
}
function range(key, min, max, step, after = () => {}, fmt = (v) => v) {
  const out = h('span', { className: 'val', textContent: fmt(S[key]) });
  const r = h('input', { type: 'range', min, max, step, value: S[key], oninput: () => { S[key] = +r.value; out.textContent = fmt(S[key]); save(); after(); } });
  return h('div', { style: 'display:flex;align-items:center' }, r, out);
}
function swatches(key, cols, after) {
  const w = h('div', { className: 'swatches' });
  for (const c of cols) { const b = h('button', { className: 'sw' + (S[key] === c ? ' on' : ''), title: c, onclick: () => { S[key] = c; save(); after(); renderPanel(); } }); b.style.background = c; w.append(b); }
  return w;
}
function check(key, text, after) {
  const i = h('input', { type: 'checkbox', checked: !!S[key], onchange: () => { S[key] = i.checked; save(); after(); renderPanel(); } });
  return h('label', {}, i, text);
}
const relook = () => { for (const p of players) if (!S.squad) p.setLook(lookOf()); else spawn(); setWire(); setJoints(); for (const p of players) p.setExpr(S.expr); };

function renderPanel() {
  panel.innerHTML = '';
  panel.append(h('h1', { innerHTML: 'ЛОКО <b>·</b> Лабораторія гравця' }), h('div', { className: 'sub', textContent: 'Модель, форма й усі анімації зблизька. Обертай мишею, коліщатко — зум.' }));

  panel.append(h('h2', { textContent: 'Анімація' }));
  const anims = h('div', { className: 'chips' });
  for (const [id, name] of ANIMS) anims.append(btn(name, () => { S.anim = id; save(); if (players[0] && players[0].look.gk !== lookOf().gk) relook(); start(true); renderPanel(); }, S.anim === id));
  panel.append(anims);
  if (S.anim === 'run') {
    panel.append(row('Швидкість', range('speed', 0, 9.5, 0.1, () => {}, (v) => v.toFixed(1) + ' м/с')));
    panel.append(h('div', { className: 'checks' }, check('dribble', 'Ведення м’яча', () => {})));
    panel.append(h('div', { className: 'chips', style: 'margin-top:8px' }, btn('Старт із місця', () => { cmd.v = 0; }), btn('Різко гальмувати', () => { cmd.brakeT = 1.4; })));
  }
  if (['run', 'idle'].includes(S.anim)) {
    panel.append(row('Маршрут', select('route', ROUTES, () => { cmd.timer = 0; })));
    panel.append(row('Погляд', select('face', FACES, () => {})));
    panel.append(h('div', { className: 'hint', textContent: 'Боком повільно — приставний крок; боком швидше ~4 м/с — таз відкривається в бік руху. Спиною до ~4 м/с — задній хід (дрібно, на носок), швидше — розворот і біг, погляд через плече.' }));
    panel.append(h('div', { className: 'hint', textContent: 'Рух не скриптований: стопи стоять на газоні, кроки ставить регулятор рівноваги. Розгін ≤ 6 м/с², гальмування ≤ 8 м/с², сила наростає плавно; поворот ≤ 7 м/с² убік — далі тіло реагує саме: нахиляється, переступає, гальмує ногою попереду.' }));
  }
  if (['aim', 'kick'].includes(S.anim)) panel.append(row('Сила', range('power', 0, 1, 0.01, () => { if (S.anim === 'kick') start(); }, (v) => Math.round(v * 100) + '%')));
  if (S.anim === 'cheer') panel.append(row('Стиль', select('style', CHEERS.map((n, i) => [i, n]), () => start())));
  if (S.anim === 'control') panel.append(row('Стиль', select('style', [[0, 'Внутрішня сторона'], [1, 'Стегно']], () => start())));
  if (S.anim === 'sad') panel.append(row('Стиль', select('sadStyle', [[0, 'Руки на голові'], [1, 'Руки на колінах'], [2, 'Удар по газону'], [3, 'Хитає головою']], () => start())));
  if (['gkdive', 'pdive'].includes(S.anim)) {
    panel.append(row('Напрямок', select('dir', [[1, 'Вправо'], [-1, 'Вліво']], () => start())));
    panel.append(row('Висота', select('dk', [[0, 'Верхній кут'], [1, 'Середня'], [2, 'Низом']], () => start())));
  }

  panel.append(h('h2', { textContent: 'Відтворення' }));
  panel.append(row('Темп', range('rate', 0.05, 1.5, 0.05, () => {}, (v) => '×' + v.toFixed(2))));
  panel.append(h('div', { className: 'chips' },
    btn(paused ? '▶ Грати' : '❚❚ Пауза', () => { paused = !paused; renderPanel(); }, paused),
    btn('Кадр →', () => { paused = true; stepOnce = 1; renderPanel(); }),
    btn('↺ Знову', () => start(true)),
  ));
  panel.append(h('div', { className: 'checks', style: 'margin-top:8px' }, check('loop', 'Повторювати', () => {}), check('spin', 'Обертати камеру', () => {})));

  panel.append(h('h2', { textContent: 'Гравець' }));
  panel.append(row('Форма', select('kit', KIT_LIST.map((k) => [k[0], k[1]]), relook)));
  panel.append(row('Номер', range('num', 1, 99, 1, relook)));
  panel.append(row('Зачіска', select('hair', ACADEMY.allHairs.map((x) => [x, ({ crop: 'Коротка', buzz: 'Їжачок', slick: 'Зачесана', curly: 'Кучері', pony: 'Хвіст', long: 'Довга', mohawk: 'Ірокез', band: 'Пов’язка', bald: 'Лиса' })[x]]), relook)));
  panel.append(row('Волосся', swatches('hairCol', ACADEMY.allHairCols, relook)));
  panel.append(row('Шкіра', swatches('skin', ACADEMY.allSkins, relook)));
  panel.append(row('Борода', select('beard', [[0, 'Немає'], [1, 'Щетина'], [2, 'Вуса'], [3, 'Борода']], relook)));
  panel.append(row('Емоція', select('expr', [['neutral', 'Спокій'], ['happy', 'Радість'], ['shock', 'Шок'], ['angry', 'Злість']], () => { for (const p of players) p.setExpr(S.expr); })));

  panel.append(h('h2', { textContent: 'Перегляд' }));
  panel.append(h('div', { className: 'checks' },
    check('squad', 'Шестеро різних', spawn), check('wire', 'Каркас', setWire), check('joints', 'Суглоби', setJoints),
  ));
  panel.append(h('div', { className: 'hint', textContent: 'Правки в src/graphics/player.js підхоплюються одразу: сторінка перезавантажиться в тому ж стані.' }));
}

// ---------------------------------------------------------------- заміри фізики ходи (з консолі: lab.test())
/**
 * Проганяє окремого гравця (масштаб як у матчі) через сценарії поза рендером і міряє: каденс, крок, опору, політ,
 * коливання таза, згин коліна, ковзання опорної стопи, похибку IK і найнижчу точку щиколотки.
 */
function test(scen) {
  const p = new Player(lookOf({ kit: 'home' })); p.root.scale.setScalar(0.82);
  const g = p.gaitSys, V = new THREE.Vector3(), out = [];
  let v = 0, h = 0;
  const run = (name, n, ctl) => {
    const rec = { slip: 0, minY: 9, ik: 0, hMin: 9, hMax: -9, knee: 0, s0: g.steps, roll: 0, pitch: -9 }, anch = [null, null];
    const rng = {}, track = (k, x) => { const r = (rng[k] ??= [9, -9]); r[0] = Math.min(r[0], x); r[1] = Math.max(r[1], x); }, rom = (k) => rng[k] ? ((rng[k][1] - rng[k][0]) * 57.3).toFixed(0) : '–';
    for (let i = 0; i < n; i++) {
      const c = ctl(i); v += clamp(c.v - v, -9 / 60, 7 / 60); if (c.dh) h += c.dh / 60; else if (c.h !== undefined) h = c.h;
      p.yaw = h; p.vx = Math.sin(h) * v; p.vz = Math.cos(h) * v; p.x += p.vx / 60; p.z += p.vz / 60;
      p.animate(1 / 60); p.root.updateMatrixWorld(true);
      if (i < n * 0.35) continue;
      for (let k = 0; k < 2; k++) {
        const f = g.feet[k], fp = (k ? p.footR : p.footL).getWorldPosition(V);
        rec.minY = Math.min(rec.minY, fp.y);
        const ty = g.R.YA * 0.82 + g.liftOf(f.psi) * 0.82 + f.h; rec.ik = Math.max(rec.ik, Math.hypot(fp.x - f.x, fp.z - f.z, fp.y - ty));
        if (f.st === 'stance') { if (!anch[k]) anch[k] = { x: fp.x, z: fp.z }; else rec.slip = Math.max(rec.slip, Math.hypot(fp.x - anch[k].x, fp.z - anch[k].z)); } else anch[k] = null;
      }
      const hy = p.pose.getWorldPosition(V).y; rec.hMin = Math.min(rec.hMin, hy); rec.hMax = Math.max(rec.hMax, hy);
      rec.knee = Math.max(rec.knee, p.shinL.rotation.x);
      const trunk = p.pose.rotation.x + p.lean.rotation.x + p.thorax.rotation.x;   // тулуб від вертикалі
      track('trunk', trunk); track('thorY', p.lean.rotation.y + p.thorax.rotation.y); track('pelY', p.pelvis.rotation.y); track('pelZ', p.pelvis.rotation.z); track('pelX', p.pelvis.rotation.x);
      track('head', trunk + p.neck.rotation.x);
      track('shX', p.pose.position.x * 0.82); track('surX', p.pose.position.z * 0.82); rec.roll = Math.max(rec.roll, Math.abs(p.pose.rotation.z)); rec.pitch = Math.max(rec.pitch, p.pose.rotation.x);
    }
    const st = p.gait || {};
    out.push(`${name}: ${g.steps - rec.s0} кроків · ${st.state} · каденс ${Math.round(st.cadence || 0)} · крок ${(st.step || 0).toFixed(2)} м · опора ${((st.contact || 0) * 1000) | 0} мс · політ ${Math.round((st.flight || 0) * 100)}% · таз ${rec.hMin.toFixed(2)}–${rec.hMax.toFixed(2)} (${((rec.hMax - rec.hMin) * 100).toFixed(0)} см) · коліно ≤${(rec.knee * 57.3).toFixed(0)}° · нахил тіла ≤${(rec.pitch * 57.3).toFixed(0)}°, крен ≤${(rec.roll * 57.3).toFixed(0)}° · ковзання ${(rec.slip * 100).toFixed(1)} см · IK ${(rec.ik * 100).toFixed(1)} см · щиколотка ≥${rec.minY.toFixed(3)}
      розмах: тулуб ${rom('trunk')}° (нахил ${rng.trunk ? (rng.trunk[0] * 57.3).toFixed(0) + '…' + (rng.trunk[1] * 57.3).toFixed(0) : '–'}°) · груди поворот ${rom('thorY')}° · таз поворот ${rom('pelY')}°, перекіс ${rom('pelZ')}°, нахил ${rom('pelX')}° · голова ${rom('head')}° · таз убік ${(rng.shX ? (rng.shX[1] - rng.shX[0]) * 100 : 0).toFixed(1)} см, уперед-назад ${(rng.surX ? (rng.surX[1] - rng.surX[0]) * 100 : 0).toFixed(1)} см`);
  };
  const all = {
    'стоїть': () => run('стоїть', 120, () => ({ v: 0 })),
    'хода 1.4': () => run('хода 1.4', 360, () => ({ v: 1.4 })),
    'біг 3.5': () => run('біг 3.5', 360, () => ({ v: 3.5 })),
    'біг 6': () => run('біг 6', 360, () => ({ v: 6 })),
    'спринт 9': () => run('спринт 9', 360, () => ({ v: 9 })),
    'різка зупинка': () => run('різка зупинка з 8', 150, () => ({ v: 0 })),
    'поворот': () => { run('розгін', 120, () => ({ v: 6 })); run('коло R≈5м', 240, () => ({ v: 6, dh: 1.2 })); },
    'розворот на місці': () => { run('стоп', 120, () => ({ v: 0 })); run('розворот на місці', 240, (i) => ({ v: 0, h: Math.floor(i / 70) * 1.6 })); },
  };
  for (const k of scen || Object.keys(all)) all[k]();
  return out.join('\n');
}

/**
 * Заміри скриптових дій (з консолі: lab.actions()): наскільки ковзає стопа, що стоїть на траві, чи провалюється вона,
 * і найбільший ривок суглоба за кадр. Гравець у масштабі матчу, стоячи й на бігу.
 */
function actions() {
  const V = new THREE.Vector3(), out = [];
  const list = [['kick', 'удар', (p) => p.kick(0.9)], ['pkick', 'пенальті', (p) => p.startPKick()], ['control', 'прийом', (p) => { p.control(); p.style = 0; }],
    ['chest', 'груди', (p) => p.chest()], ['header', 'головою', (p) => p.header()], ['block', 'блок', (p) => p.block()], ['hit', 'влучання', (p) => p.hit()],
    ['tackle', 'відбір', (p) => p.tackle()], ['cheer', 'радість', (p) => { p.cheer(2.4); p.style = 0; }], ['cheer6', 'радість «Локомотив»', (p) => { p.cheer(2.4); p.style = 6; }],
    ['sad', 'розчарування', (p) => { p.sad(2.4); p.style = 2; }], ['gkjump', 'воротар вгору', (p) => p.gkJump()], ['parry', 'відбиває', (p) => p.parry()],
    ['throw', 'кидок', (p) => p.throwBall()], ['catch', 'ловить', (p) => p.setMode('catch', 1)]];
  for (const [id, name, go] of list) for (const run of [0, 4]) {
    const p = new Player(lookOf({ kit: 'home' })); p.root.scale.setScalar(0.82);
    let v = 0, slip = 0, minY = 9, jerk = 0, prevD = null, prev = null; const anch = [null, null];
    for (let i = 0; i < 200; i++) {
      v += clamp(run - v, -8 / 60, 6 / 60); p.yaw = 0; p.vx = 0; p.vz = i >= 60 ? v * Math.max(0, 1 - (i - 60) / 20) : v; p.z += p.vz / 60;
      if (id === 'pkick') p.kickP = clamp((i - 60) / 78, 0, 1);
      if (i === 60) go(p);
      p.animate(1 / 60); p.root.updateMatrixWorld(true);
      if (i < 60) continue;
      const cur = [p.legL, p.legR, p.shinL, p.shinR, p.armL, p.armR, p.lean, p.pose].map((o) => o.rotation.x);
      if (prev) { const d = cur.map((x, k) => x - prev[k]); if (prevD) jerk = Math.max(jerk, ...d.map((x, k) => Math.abs(x - prevD[k]))); prevD = d; }
      prev = cur;
      for (let k = 0; k < 2; k++) {
        const fp = (k ? p.footR : p.footL).getWorldPosition(V); minY = Math.min(minY, fp.y);
        if (fp.y < 0.082 + 0.012) { if (!anch[k]) anch[k] = { x: fp.x - p.x, z: fp.z - p.z, wx: fp.x, wz: fp.z }; else slip = Math.max(slip, Math.hypot(fp.x - anch[k].wx, fp.z - anch[k].wz)); } else anch[k] = null;
      }
    }
    out.push(`${name}${run ? ' на бігу' : ''}: ковзання стопи на траві ${(slip * 100).toFixed(1)} см · щиколотка ≥ ${minY.toFixed(3)} (норма 0.082) · ривок ≤ ${(jerk * 57.3).toFixed(0)}°/кадр²`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- старт
(async () => {
  try { await Promise.race([document.fonts.load('800 40px Rubik', '0123УЗ'), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* без шрифту */ }
  resize(); renderPanel(); renderCams(); setCam(S.cam, false);
  spawn();
  window.lab = { get players() { return players; }, gb, GB_R, S, scene, cam, renderer, start, spawn, test, actions };   // для налагодження з консолі
  tick();
})();
