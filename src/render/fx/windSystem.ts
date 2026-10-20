import * as THREE from 'three';
import { setSpriteAlpha, spriteMaterial } from '../particles.js';
import { createFxRandom } from './fxRandom.js';
import type { FxRandom } from './fxRandom.js';

/** Ráfaga de papel: una tira horizontal difuminada en los extremos. */
function streakTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.22, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.78, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    // Banda fina (4/32): al proyectarse se lee como una raya, no como un punto.
    ctx.fillRect(0, 14, 128, 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Partículas de viento en el fondo (detrás del tablero). Usa su propio RNG
 * cosmético: nunca consume la semilla de las reglas. Solo simula mientras está
 * visible (fundido de entrada/salida incluido).
 */
export class WindSystem {
  readonly points: THREE.Points;
  private readonly mat: THREE.ShaderMaterial;
  private readonly attr: THREE.BufferAttribute;
  private readonly speed: Float32Array;
  private readonly phase: Float32Array;
  private readonly rng: FxRandom;
  private readonly box = { x0: -40, x1: 40, y0: -10, y1: 16, z0: -28, z1: -6 };
  private dir: -1 | 1 = 1;
  private target = 0;
  private fade = 0;
  private boost = 0;
  private time = 0;

  constructor(scene: THREE.Scene, count = 240) {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const alp = new Float32Array(count);
    this.speed = new Float32Array(count);
    this.phase = new Float32Array(count);
    this.rng = createFxRandom();
    const b = this.box;
    const tint = new THREE.Color(0xffffff);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = b.x0 + this.rng.next() * (b.x1 - b.x0);
      pos[i * 3 + 1] = b.y0 + this.rng.next() * (b.y1 - b.y0);
      pos[i * 3 + 2] = b.z0 + this.rng.next() * (b.z1 - b.z0);
      col[i * 3] = tint.r;
      col[i * 3 + 1] = tint.g;
      col[i * 3 + 2] = tint.b;
      alp[i] = 0.55 + this.rng.next() * 0.4;
      this.speed[i] = 18 + this.rng.next() * 20;
      this.phase[i] = this.rng.next() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
    this.mat = spriteMaterial(streakTexture(), 1);
    setSpriteAlpha(this.mat, 0);
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  /** Sopla en una dirección: fundido de entrada y desplazamiento continuo. */
  setDirection(dir: -1 | 1): void {
    this.dir = dir;
    this.target = 1;
  }

  setEnabled(on: boolean): void {
    this.target = on ? 1 : 0;
    if (!on) this.boost = 0;
  }

  /** Ráfaga puntual: acelera las tiras durante un instante. */
  gust(dir: -1 | 1): void {
    this.dir = dir;
    this.target = 1;
    this.boost = 1;
  }

  update(dt: number): void {
    this.boost = Math.max(0, this.boost - dt / 0.9);
    if (this.fade !== this.target) {
      const step = dt / 0.7;
      this.fade = this.target > this.fade ? Math.min(this.target, this.fade + step) : Math.max(this.target, this.fade - step);
      setSpriteAlpha(this.mat, 0.8 * this.fade);
      this.points.visible = this.fade > 0.01;
    }
    if (!this.points.visible) return;
    this.time += dt;
    const a = this.attr.array as Float32Array;
    const speed = this.speed;
    const phase = this.phase;
    const b = this.box;
    const mul = 1 + this.boost * 1.7;
    const n = speed.length;
    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      let x = (a[ix] ?? 0) + this.dir * (speed[i] ?? 10) * mul * dt;
      const y = (a[ix + 1] ?? 0) + Math.sin(this.time * 2.2 + (phase[i] ?? 0)) * dt * 0.7;
      if (this.dir > 0 && x > b.x1) x = b.x0;
      if (this.dir < 0 && x < b.x0) x = b.x1;
      a[ix] = x;
      a[ix + 1] = y;
      if (y < b.y0 || y > b.y1) a[ix + 1] = b.y0 + this.rng.next() * (b.y1 - b.y0);
    }
    this.attr.needsUpdate = true;
  }
}
