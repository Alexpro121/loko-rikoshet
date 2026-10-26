import * as THREE from 'three';
import { VoxelBuilder, vcMat } from './voxel.js';

export const LOCO_LEN = 5.4, WAGON_LEN = 5.0, GAP = 0.3;
export const TRAIN_LEN = LOCO_LEN + GAP + (WAGON_LEN + GAP) * 2 - GAP;

const wheel = new THREE.CylinderGeometry(0.58, 0.58, 0.3, 10);

/** Локомотив у кольорах клубу. Початок координат — центр, перед — +Z. */
export function locoMesh() {
  const b = new VoxelBuilder();
  b.box(0, 0.5, 0, 2.7, 0.7, LOCO_LEN, '#1b2a2a');
  b.box(0, 1.55, 0.35, 2.5, 1.6, 4.3, '#0f8a45');
  b.box(0, 1.55, 2.2, 2.0, 1.3, 1.0, '#12a150');
  b.box(0, 3.0, -1.55, 2.4, 1.4, 1.9, '#e11d2e');
  b.box(0, 3.1, -1.55, 2.5, 0.5, 1.3, '#cfeaf5');
  b.box(0, 3.6, 1.2, 0.55, 1.0, 0.55, '#2a2a2a');
  b.box(0, 3.9, 1.2, 0.8, 0.2, 0.8, '#2a2a2a');
  b.box(0, 2.05, 2.75, 1.5, 0.6, 0.1, '#ffe27a');
  b.box(0, 0.45, 2.85, 2.8, 0.5, 0.35, '#f4f4f2');
  b.box(0, 2.9, 0.2, 2.6, 0.18, 4.6, '#f4f4f2');                 // смуга
  for (let k = 0; k < 3; k++) for (const sd of [-1, 1]) b.shape(wheel, sd * 1.3, 0.6, -1.6 + k * 1.6, '#222', 0, 0, Math.PI / 2);
  return b.mesh(vcMat(), { static: false });
}

export function wagonMesh(red = true) {
  const b = new VoxelBuilder();
  b.box(0, 0.5, 0, 2.7, 0.55, WAGON_LEN, '#1b2a2a');
  b.box(0, 1.9, 0, 2.6, 2.1, WAGON_LEN - 0.2, red ? '#e11d2e' : '#12a150');
  b.box(0, 2.25, 0, 2.7, 0.5, WAGON_LEN - 0.1, '#f4f4f2');
  for (let k = 0; k < 3; k++) b.box(0, 2.45, -1.5 + k * 1.5, 2.72, 0.5, 0.75, '#cfeaf5');
  for (const sd of [-1, 1]) for (let k = 0; k < 2; k++) b.shape(wheel, sd * 1.3, 0.58, -1.3 + k * 2.6, '#222', 0, 0, Math.PI / 2);
  return b.mesh(vcMat(), { static: false });
}

/** Увесь склад для «Експресу»: перед на z = 0, тіло простягається в -Z. */
export function buildTrainGroup() {
  const g = new THREE.Group();
  const loco = locoMesh(); loco.position.z = -LOCO_LEN / 2; g.add(loco);
  for (let i = 0; i < 2; i++) {
    const w = wagonMesh(i === 0); w.position.z = -LOCO_LEN - GAP - WAGON_LEN / 2 - i * (WAGON_LEN + GAP);
    g.add(w);
  }
  return g;
}
