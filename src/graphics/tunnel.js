import * as THREE from 'three';
import { PITCH } from '../config.js';
import { VoxelBuilder } from './voxel.js';
import { signTexture } from './textures.js';

const { W } = PITCH;

/**
 * Тунель гравців: бетонна арка в центрі протилежної (від камери) бровки, темне нутро з лампами,
 * червона доріжка до газону й вивіска. Звідси команди виходять на інтро.
 */
export function buildTunnel() {
  const group = new THREE.Group(), b = new VoxelBuilder(0.2);
  const z0 = -W + 0.3, depth = 4.6, zc = z0 - depth / 2, wd = 7.2, hh = 3.8;
  // нутро: підлога, стіни, стеля (темні), лампи на стелі
  b.box(0, 0.05, zc, wd - 0.8, 0.1, depth, '#14181b');
  b.box(-(wd - 0.8) / 2, hh / 2, zc, 0.4, hh, depth, '#10141a'); b.box((wd - 0.8) / 2, hh / 2, zc, 0.4, hh, depth, '#10141a');
  b.box(0, hh - 0.2, zc, wd - 0.8, 0.4, depth, '#0d1116');
  b.box(0, hh / 2, z0 - depth, wd, hh, 0.4, '#0b0e12');
  for (let i = 0; i < 4; i++) b.box(0, hh - 0.5, z0 - 0.6 - i * 1.1, 3.0, 0.1, 0.4, '#ffe3a0');
  // арка: стовпи й перемичка зі смугами клубу
  for (const sx of [-1, 1]) { b.box(sx * (wd / 2), hh / 2, z0 - 0.2, 0.9, hh, 0.9, '#c9ced1'); b.box(sx * (wd / 2), hh / 2 + 0.2, z0 + 0.2, 0.3, hh - 0.4, 0.2, sx > 0 ? '#c8213a' : '#157a46'); }
  b.box(0, hh + 0.35, z0 - 0.2, wd + 1.2, 0.8, 1.0, '#c9ced1');
  b.box(0, hh + 0.35, z0 + 0.35, wd + 1.2, 0.18, 0.12, '#c8213a'); b.box(0, hh + 0.52, z0 + 0.35, wd + 1.2, 0.1, 0.12, '#157a46');
  // дах-козирьок та бічні парапети
  b.box(0, hh + 0.9, zc, wd + 1.6, 0.3, depth + 0.6, '#2b3236');
  for (const sx of [-1, 1]) b.box(sx * (wd / 2 + 1.1), 0.7, z0 - 0.9, 0.5, 1.4, 2.2, '#262c30');
  // червона доріжка до поля
  b.box(0, 0.045, z0 + 2.2, 3.4, 0.05, 5.2, '#a8182b');
  b.box(-1.7, 0.05, z0 + 2.2, 0.12, 0.06, 5.2, '#e8b923'); b.box(1.7, 0.05, z0 + 2.2, 0.12, 0.06, 5.2, '#e8b923');
  group.add(b.mesh());
  // вивіска над аркою
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.05), new THREE.MeshBasicMaterial({ map: signTexture('ВИХІД ГРАВЦІВ', '#0e5a38', '#f1efe8') }));
  sign.position.set(0, hh + 0.42, z0 + 0.5); group.add(sign);
  group.userData = { mouthZ: z0, startZ: z0 - depth + 0.9 };
  return group;
}
