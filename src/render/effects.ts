import * as THREE from 'three';
import { BOARD_H } from './constants.js';

export class CameraShake {
  trauma = 0;
  private enabled = true;
  /** Sacudida de terremoto: amplitud propia, más vertical y de mayor duración. */
  private quakePower = 0;
  private quakeLeft = 0;
  private quakeTime = 0;
  /** Offset reutilizado cada frame: cero asignaciones en el game loop. */
  private readonly offset = { x: 0, y: 0 };

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.trauma = 0;
      this.quakePower = 0;
      this.quakeLeft = 0;
      this.quakeTime = 0;
      this.offset.x = 0;
      this.offset.y = 0;
    }
  }

  add(amount: number): void {
    if (!this.enabled) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Terremoto de escombros: convive con el trauma normal y decae por separado. */
  quake(power = 0.7, seconds = 0.6): void {
    if (!this.enabled) return;
    this.quakePower = Math.min(1, Math.max(this.quakePower, power));
    this.quakeTime = Math.max(this.quakeTime, seconds);
    this.quakeLeft = Math.max(this.quakeLeft, seconds);
  }

  update(dt: number): { x: number; y: number } {
    if (!this.enabled) return this.offset;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.quakeLeft = Math.max(0, this.quakeLeft - dt);
    if (this.quakeLeft === 0) this.quakePower = 0;
    const s = this.trauma * this.trauma;
    const q = this.quakeLeft > 0 && this.quakeTime > 0
      ? this.quakePower * (this.quakeLeft / this.quakeTime)
      : 0;
    const t = performance.now() / 1000;
    this.offset.x = s * 0.55 * Math.sin(t * 61.7) + q * 0.42 * Math.sin(t * 43.1);
    this.offset.y = s * 0.45 * Math.cos(t * 53.3) + q * 0.62 * Math.sin(t * 37.7);
    return this.offset;
  }
}
export class ClearFlash {
  private mesh: THREE.Mesh;
  private enabled = true;
  private life = 0; private maxLife = 0.45; private active = false;
  constructor(scene: THREE.Scene, width: number) {
    const geo = new THREE.PlaneGeometry(width, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff3d6, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.z = 0.6;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.active = false;
      this.mesh.visible = false;
    }
  }
  flash(row: number, height = 1): void {
    if (!this.enabled) return;
    const y = row - BOARD_H / 2 + 0.5 + (height - 1) / 2;
    this.mesh.position.y = y;
    this.mesh.scale.set(1, height, 1);
    this.life = 0; this.active = true; this.mesh.visible = true;
  }
  update(dt: number): void {
    if (!this.enabled || !this.active) return;
    this.life += dt;
    const k = 1 - this.life / this.maxLife;
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, k) * 0.85;
    if (k <= 0) { this.active = false; this.mesh.visible = false; }
  }
}
