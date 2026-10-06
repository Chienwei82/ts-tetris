import * as THREE from 'three';
import { BOARD_H } from './constants.js';
export class CameraShake {
  trauma = 0;
  /** Offset reutilizado cada frame: cero asignaciones en el game loop. */
  private readonly offset = { x: 0, y: 0 };
  add(amount: number): void { this.trauma = Math.min(1, this.trauma + amount); }
  update(dt: number): { x: number; y: number } {
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma;
    const t = performance.now() / 1000;
    this.offset.x = s * 0.55 * Math.sin(t * 61.7);
    this.offset.y = s * 0.45 * Math.cos(t * 53.3);
    return this.offset;
  }
}
export class ClearFlash {
  private mesh: THREE.Mesh;
  private life = 0; private maxLife = 0.45; private active = false;
  constructor(scene: THREE.Scene, width: number) {
    const geo = new THREE.PlaneGeometry(width, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff3d6, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.z = 0.6;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  flash(row: number, height = 1): void {
    const y = row - BOARD_H / 2 + 0.5 + (height - 1) / 2;
    this.mesh.position.y = y;
    this.mesh.scale.set(1, height, 1);
    this.life = 0; this.active = true; this.mesh.visible = true;
  }
  update(dt: number): void {
    if (!this.active) return;
    this.life += dt;
    const k = 1 - this.life / this.maxLife;
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, k) * 0.85;
    if (k <= 0) { this.active = false; this.mesh.visible = false; }
  }
}
