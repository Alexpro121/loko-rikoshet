import * as THREE from 'three';
import { COL, KIT_LOKO, KIT_GK_LOKO, ACADEMY, FORMATIONS, PITCH } from '../config.js';
import { S } from '../state/save.js';
import { keeper } from '../state/economy.js';
import { squadLook, myKit } from '../state/squad.js';
import { buildPitch } from '../graphics/pitch.js';
import { Stands } from '../graphics/stands.js';
import { Particles } from '../graphics/particles.js';
import { BallView } from '../graphics/ball.js';
import { Player } from '../graphics/player.js';
import { shadowTexture } from '../graphics/textures.js';
import { AimDots } from '../physics/aim.js';
import { Weather } from '../graphics/weather.js';
import { buildTunnel } from '../graphics/tunnel.js';
import { buildSurround } from '../graphics/surround.js';

const SKIN = ACADEMY.skins, HAIR = ACADEMY.hairs, HCOL = ACADEMY.hairCols;
const SCALE = 0.82;

/** Усе, що малюється в матчі: арена, 22 гравці, м'яч, м'які тіні, частинки. */
export class MatchView {
  constructor() {
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(COL.sky);
    scene.fog = new THREE.Fog(COL.sky, 150, 340);
    const hemi = (this.hemi = new THREE.HemisphereLight(0xd3e4ff, 0x7b6d5c, 1.05)); scene.add(hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff0d6, 2.0));
    sun.position.set(-24, 40, 22); scene.add(sun);

    const pitch = (this.pitch = buildPitch());
    scene.add(pitch.group);
    this.stands = new Stands(); scene.add(this.stands.group);
    this.tunnel = buildTunnel(); scene.add(this.tunnel);
    this.surround = buildSurround(); scene.add(this.surround.group);
    this.weather = new Weather(); scene.add(this.weather.group);
    // сяйво прожекторів уночі й увечері
    const gc = document.createElement('canvas'); gc.width = gc.height = 128; const gg = gc.getContext('2d'), gr = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,244,214,1)'); gr.addColorStop(0.25, 'rgba(255,236,190,0.55)'); gr.addColorStop(1, 'rgba(255,230,170,0)'); gg.fillStyle = gr; gg.fillRect(0, 0, 128, 128);
    const gtex = new THREE.CanvasTexture(gc); this.glow = new THREE.Group();
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: gtex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.scale.set(26, 26, 1); sp.position.set(sx * (PITCH.L + 9), 16.6, sz * (PITCH.W + 9)); this.glow.add(sp); }
    this.glow.visible = false; scene.add(this.glow);
    // прожектори: 4 SpotLight з кутів, що освітлюють газон і створюють «басейни» світла; плюс прозорі конуси променів і зорі
    this.spots = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const sl = new THREE.SpotLight(0xfff1d6, 0, 0, 1.05, 1.0, 0); sl.position.set(sx * (PITCH.L + 9), 16.4, sz * (PITCH.W + 9));
      sl.target.position.set(-sx * PITCH.L * 0.28, 0, -sz * PITCH.W * 0.25); scene.add(sl, sl.target); this.spots.push(sl);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(11, 36, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      cone.position.copy(sl.position).lerp(sl.target.position, 0.5); cone.lookAt(sl.target.position); cone.rotateX(-Math.PI / 2); cone.scale.y = sl.position.distanceTo(sl.target.position) / 36; cone.visible = false; this.glow.add(cone);
    }
    const sg = new THREE.BufferGeometry(), sp = []; for (let i = 0; i < 260; i++) { const a = Math.random() * 6.283, r = 220 + Math.random() * 40, y = 40 + Math.random() * 150; sp.push(Math.cos(a) * r, y, Math.sin(a) * r); }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, fog: false, transparent: true, opacity: 0.9 })); this.stars.visible = false; scene.add(this.stars);

    const mk = (kit, gk, i) => new Player({ kit, num: i + 1, skin: SKIN[i % 4], hair: HAIR[i % 5], hairCol: HCOL[i % 6], gk, scale: SCALE });
    this.mine = Array.from({ length: 11 }, (_, i) => mk(i === 0 ? KIT_GK_LOKO : KIT_LOKO, i === 0, i));
    this.opp = Array.from({ length: 11 }, (_, i) => mk(i === 0 ? KIT_GK_LOKO : KIT_LOKO, i === 0, i + 3));
    this.players = [...this.mine, ...this.opp];
    for (const p of this.players) scene.add(p.root);

    this.ball = new BallView(); scene.add(this.ball.group);
    const sh = new THREE.PlaneGeometry(1, 1); sh.rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(sh, new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.62 }), this.players.length + 1);
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.shadows.frustumCulled = false; this.shadows.renderOrder = 2;
    scene.add(this.shadows);

    this.aim = new AimDots(110); scene.add(this.aim.mesh);
    const rg = new THREE.RingGeometry(0.9, 1.0, 40); rg.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    this.ring.visible = false; this.ring.renderOrder = 3; scene.add(this.ring);
    this.band = new THREE.Mesh(new THREE.BoxGeometry(1, 0.04, 0.16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
    this.band.visible = false; this.band.renderOrder = 3; scene.add(this.band);

    this.particles = new Particles(520, 1); scene.add(this.particles.mesh);
  }

  look(kit, gk, who, num, scale = SCALE) { return { kit, num, skin: who.skin, hair: who.hair, hairCol: who.hairCol, beard: who.beard || 0, gk, scale }; }

  /** Склади під матч: обличчя, номери й форма з персональних записів гравців (мій склад і суперник). */
  /** Час доби й погода: небо, туман, світло, прожектори, опади. */
  setEnv(time, weather) {
    const T = {
      day: { sky: '#bfd3da', hs: '#d3e4ff', hg: '#7b6d5c', h: 1.05, sun: '#fff0d6', si: 2.0, pos: [-24, 40, 22], glow: 0, exp: 1.1 },
      dusk: { sky: '#e9a07a', hs: '#ffc9a0', hg: '#6b4a5a', h: 0.9, sun: '#ffb070', si: 1.7, pos: [-52, 13, 12], glow: 0.55, exp: 1.0 },
      night: { sky: '#070b1c', hs: '#5568a8', hg: '#1a2336', h: 0.55, sun: '#b8c8ff', si: 0.28, pos: [-14, 48, 12], glow: 1, exp: 1.15 },
    };
    const t = T[time] || T.day, g = new THREE.Color();
    let sky = new THREE.Color(t.sky), si = t.si, h = t.h, near = 150, far = 340, tint = null;
    const grey = (c, k) => sky.lerp(new THREE.Color(c), k);
    if (weather === 'cloudy') { grey(time === 'night' ? '#141a2a' : '#9ca6ad', 0.6); si *= 0.55; h *= 1.05; }
    else if (weather === 'rain') { grey(time === 'night' ? '#10151f' : '#7d8890', 0.75); si *= 0.35; h *= 0.95; near = 110; far = 280; tint = '#cfd9de'; }
    else if (weather === 'snow') { grey(time === 'night' ? '#2a3550' : '#e3eaee', 0.7); si *= 0.55; h *= 1.2; near = 90; far = 240; tint = '#e9f2ef'; }
    else if (weather === 'fog') { grey(time === 'night' ? '#1a2133' : '#c1c9cc', 0.85); si *= 0.5; near = 28; far = 135; }
    this.scene.background = sky; this.scene.fog = new THREE.Fog(sky.getHex(), near, far);
    this.hemi.color.set(t.hs); this.hemi.groundColor.set(t.hg); this.hemi.intensity = h;
    this.sun.color.set(t.sun); this.sun.intensity = si; this.sun.position.set(...t.pos);
    this.glow.visible = t.glow > 0;
    const wf = weather === 'fog' ? 0.6 : weather === 'rain' ? 0.8 : 1;
    for (const sp of this.glow.children) { if (sp.isSprite) sp.material.opacity = t.glow * wf; else { sp.visible = time === 'night'; sp.material.opacity = 0.055 * wf * (weather === 'fog' || weather === 'rain' ? 1.8 : 1); } }
    const spotI = time === 'night' ? 0.8 : time === 'dusk' ? 0.3 : 0;
    for (const sl of this.spots) { sl.intensity = spotI; sl.visible = spotI > 0; }       // вимкнений прожектор не рахується у шейдері
    this.stars.visible = time === 'night' && (weather === 'clear' || weather === 'snow');
    this.weather.set(weather === 'rain' || weather === 'snow' ? weather : 'clear');
    this.exposure = t.exp;
    // газон світліє під снігом, а в дощ трохи темніє
    if (this.pitch.grassMat) this.pitch.grassMat.color.set(weather === 'snow' ? '#e6efe9' : weather === 'rain' ? '#a9b8ac' : '#ffffff');
  }

  setup(spec, myFormation, mySquad, oppSq) {
    const pick = (v, list) => (v === 'random' ? list[(Math.random() * list.length) | 0] : v);
    this.setEnv(pick(S.settings.timeOfDay, ['day', 'dusk', 'night']), pick(S.settings.weather, ['clear', 'clear', 'cloudy', 'rain', 'snow', 'fog']));
    const k = keeper();
    this.mine[0].setLook(this.look(KIT_GK_LOKO, true, squadLook(mySquad[0]), 1));
    this.mine.forEach((p, i) => { if (i === 0) return; const e = mySquad[i], L = squadLook(e); p.setLook(this.look(myKit(), false, L, L.num)); });
    const c = spec.club;
    this.stands.setOpponent(c); this.stands.particles = this.particles; this.pitch.boards.redraw(c); this.pitch.decals.setOpponent(c); this.pitch.decals.show();
    this.opp[0].setLook(this.look(c.gk, true, oppSq[0], 1));
    this.opp.forEach((p, i) => { if (i === 0) return; const e = oppSq[i]; p.setLook(this.look(c.kit, false, e, e.num)); });
    this.particles.clear();
  }

  /** М'які блоб-тіні: радіальна текстура, легкий зсув від сонця. */
  updateShadows(ballX, ballZ, ballH) {
    const m = this.shadows.instanceMatrix.array;
    let o = 0;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const k = p.root.visible ? (p.root.scale.x / 0.82) * 2.5 * (1 - Math.min(0.4, p.root.position.y * 0.25)) : 0;   // схований (ще в тунелі) — без тіні
      m[o] = k * 1.15; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0; m[o + 4] = 0; m[o + 5] = 1; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = k * 0.95; m[o + 11] = 0; m[o + 12] = p.root.position.x + 0.45; m[o + 13] = 0.05; m[o + 14] = p.root.position.z - 0.25;   // за тілом (і в повторі) m[o + 15] = 1;
      o += 16;
    }
    const k = 0.75 * (this.ball.vs || 1) * (1 - Math.min(0.6, ballH * 0.5));   // тінь у розмір м'яча (разом зі збільшенням видимості)
    m[o] = k; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0; m[o + 4] = 0; m[o + 5] = 1; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = k; m[o + 11] = 0; m[o + 12] = ballX + 0.2; m[o + 13] = 0.05; m[o + 14] = ballZ - 0.12; m[o + 15] = 1;
    this.shadows.instanceMatrix.needsUpdate = true;
  }
}
