import * as THREE from 'three';
import { COL, KIT_LOKO, KIT_GK_LOKO, ACADEMY, FORMATIONS } from '../config.js';
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

const SKIN = ACADEMY.skins, HAIR = ACADEMY.hairs, HCOL = ACADEMY.hairCols;
const SCALE = 0.82;

/** Усе, що малюється в матчі: арена, 22 гравці, м'яч, м'які тіні, частинки. */
export class MatchView {
  constructor() {
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(COL.sky);
    scene.fog = new THREE.Fog(COL.sky, 150, 340);
    scene.add(new THREE.HemisphereLight(0xd3e4ff, 0x7b6d5c, 1.05));
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.0);
    sun.position.set(-24, 40, 22); scene.add(sun);

    const pitch = (this.pitch = buildPitch());
    scene.add(pitch.group);
    this.stands = new Stands(); scene.add(this.stands.group);

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
  setup(spec, myFormation, mySquad, oppSq) {
    const k = keeper();
    this.mine[0].setLook(this.look(KIT_GK_LOKO, true, squadLook(mySquad[0]), 1));
    this.mine.forEach((p, i) => { if (i === 0) return; const e = mySquad[i], L = squadLook(e); p.setLook(this.look(myKit(), false, L, L.num)); });
    const c = spec.club;
    this.stands.setOpponent(c);
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
      const k = (p.root.scale.x / 0.82) * 2.5 * (1 - Math.min(0.4, p.root.position.y * 0.25));
      m[o] = k * 1.15; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0; m[o + 4] = 0; m[o + 5] = 1; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = k * 0.95; m[o + 11] = 0; m[o + 12] = p.x + 0.45; m[o + 13] = 0.05; m[o + 14] = p.z - 0.25; m[o + 15] = 1;
      o += 16;
    }
    const k = 1.45 * (1 - Math.min(0.6, ballH * 0.5));
    m[o] = k; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0; m[o + 4] = 0; m[o + 5] = 1; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = k; m[o + 11] = 0; m[o + 12] = ballX + 0.2; m[o + 13] = 0.05; m[o + 14] = ballZ - 0.12; m[o + 15] = 1;
    this.shadows.instanceMatrix.needsUpdate = true;
  }
}
