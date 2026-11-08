import * as THREE from 'three';
import { BOARD_H, cellToWorld } from '../constants.js';
import type { Vec2 } from '../../game/types.js';
import { boltPath } from './boltPath.js';
import type { BoltPoint } from './boltPath.js';
import { createFxRandom } from './fxRandom.js';
import type { FxRandom } from './fxRandom.js';

/* ── Geometría de los rayos: cintas preasignadas (cero GC en el game loop) ── */
const MAX_BOLT_POINTS = 10;
const BOLT_INDICES: number[] = (() => {
  const idx: number[] = [];
  for (let i = 0; i < MAX_BOLT_POINTS - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return idx;
})();

interface Ribbon {
  geo: THREE.BufferGeometry;
  pos: THREE.BufferAttribute;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
}

function createRibbon(color: number, opacity: number): Ribbon {
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(MAX_BOLT_POINTS * 2 * 3), 3);
  pos.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pos);
  geo.setIndex(BOLT_INDICES.slice());
  geo.setDrawRange(0, 0);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 26;
  return { geo, pos, mesh };
}

/** Reescribe la cinta como un polígono de `width` unidades alrededor del trazo. */
function writeRibbon(ribbon: Ribbon, points: BoltPoint[], width: number): void {
  const arr = ribbon.pos.array as Float32Array;
  const n = Math.min(points.length, MAX_BOLT_POINTS);
  for (let i = 0; i < n; i++) {
    const p = points[i] as BoltPoint;
    const prev = points[Math.max(0, i - 1)] as BoltPoint;
    const next = points[Math.min(n - 1, i + 1)] as BoltPoint;
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy * width * 0.5;
    const ny = dx * width * 0.5;
    const o = i * 6;
    arr[o] = p.x + nx; arr[o + 1] = p.y + ny; arr[o + 2] = 0;
    arr[o + 3] = p.x - nx; arr[o + 4] = p.y - ny; arr[o + 5] = 0;
  }
  ribbon.pos.needsUpdate = true;
  ribbon.geo.setDrawRange(0, Math.max(0, n - 1) * 6);
}

interface RingFx {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  mat: THREE.MeshBasicMaterial;
  t: number;
  life: number;
  from: number;
  to: number;
}

interface BoltFx {
  group: THREE.Group;
  core: Ribbon;
  glow: Ribbon;
  t: number;
  life: number;
}

interface BeamFx {
  group: THREE.Group;
  mat: THREE.MeshBasicMaterial;
  cone: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  coneMat: THREE.MeshBasicMaterial;
  t: number;
  life: number;
  warn: boolean;
}

const BOMB_COLOR = 0xffa53a;
const BOMB_CORE = 0xfff0b8;
const BOLT_COLOR = 0xffe066;
const BOLT_CORE = 0xfffbe0;
const DRILL_COLOR = 0xff6b4a;

/**
 * Efectos de puesta en escena de los eventos del Caos (bomba, rayo, taladro…).
 * Todos los objetos están preasignados: aparecer un efecto no reserva memoria.
 * Es puramente cosmético: con los efectos apagados la app no invoca los `spawn*`.
 */
export class ChaosFx {
  private readonly group = new THREE.Group();
  private readonly rings: RingFx[] = [];
  private readonly bolts: BoltFx[] = [];
  private readonly beams: BeamFx[] = [];
  private readonly rng: FxRandom = createFxRandom();
  private enabled = true;

  constructor(scene: THREE.Scene) {
    const ringGeo = new THREE.RingGeometry(0.44, 0.62, 40);
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: BOMB_COLOR, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 22;
      this.group.add(mesh);
      this.rings.push({ mesh, mat, t: 0, life: 0, from: 1, to: 1 });
    }
    for (let i = 0; i < 4; i++) {
      const group = new THREE.Group();
      const core = createRibbon(BOLT_CORE, 1);
      const glow = createRibbon(BOLT_COLOR, 0.4);
      group.add(glow.mesh, core.mesh);
      this.group.add(group);
      this.bolts.push({ group, core, glow, t: 0, life: 0 });
    }
    const beamGeo = new THREE.PlaneGeometry(1.15, BOARD_H + 3);
    const coneGeo = new THREE.ConeGeometry(0.34, 0.72, 4);
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: DRILL_COLOR, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
      });
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0xffb27a, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.rotation.z = Math.PI; // punta hacia abajo: señala la columna
      cone.position.y = BOARD_H / 2 + 1.7;
      const mesh = new THREE.Mesh(beamGeo, mat);
      mesh.renderOrder = 21;
      cone.renderOrder = 27;
      const group = new THREE.Group();
      group.add(mesh, cone);
      group.visible = false;
      this.group.add(group);
      this.beams.push({ group, mat, cone, coneMat, t: 0, life: 0, warn: true });
    }
    scene.add(this.group);
  }

  /** Con efectos apagados no se dibuja nada (las reglas no cambian). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.clear();
  }

  /** Onda expansiva de la bomba (dos anillos: fuego y núcleo brillante). */
  bombBlast(x: number, y: number): void {
    if (!this.enabled) return;
    this.spawnRing(x, y, BOMB_COLOR, 1.0, 3.6, 0.52);
    this.spawnRing(x, y, BOMB_CORE, 0.6, 2.3, 0.34);
  }

  /** Impacto puntual (p. ej. el taladro del powerup al hundirse). */
  impact(x: number, y: number, color = DRILL_COLOR): void {
    if (!this.enabled) return;
    this.spawnRing(x, y, color, 0.55, 2.0, 0.32);
  }

  /** Rayo dentado desde el cielo hasta cada celda golpeada. */
  boltStrike(cells: Vec2[], color = BOLT_COLOR): void {
    if (!this.enabled || cells.length === 0) return;
    for (const c of cells) {
      const p = cellToWorld(c.x, c.y);
      const from: BoltPoint = { x: p.x + (this.rng.next() - 0.5) * 2.2, y: BOARD_H / 2 + 2.2 };
      const to: BoltPoint = { x: p.x, y: p.y + 0.25 };
      const points = boltPath(from, to, () => this.rng.next(), 7);
      this.spawnBolt(points, color);
    }
  }

  /** Haz de aviso sobre la columna que el taladro perforará (`seconds` de antelación). */
  drillWarning(column: number, seconds: number): void {
    if (!this.enabled) return;
    this.spawnBeam(column, Math.max(0.2, seconds), true);
  }

  /** Fogonazo + onda de la perforación del taladro. */
  drillStrike(column: number): void {
    if (!this.enabled) return;
    this.spawnBeam(column, 0.55, false);
    const p = cellToWorld(column, 0);
    this.spawnRing(p.x, -BOARD_H / 2 + 0.35, DRILL_COLOR, 0.7, 2.8, 0.42);
  }

  /** Avanza los efectos; devuelve true mientras haya algo visible (redibujar). */
  update(dt: number): boolean {
    let active = false;
    for (const r of this.rings) {
      if (r.t >= r.life) continue;
      r.t += dt;
      const k = Math.min(1, r.t / r.life);
      const e = 1 - (1 - k) * (1 - k);
      r.mesh.scale.setScalar(r.from + (r.to - r.from) * e);
      r.mat.opacity = Math.max(0, 1 - k) * 0.85;
      r.mesh.visible = k < 1;
      if (k < 1) active = true;
    }
    for (const b of this.bolts) {
      if (b.t >= b.life) continue;
      b.t += dt;
      const k = Math.min(1, b.t / b.life);
      const flicker = 0.65 + 0.35 * Math.sin(b.t * 70);
      b.core.mesh.material.opacity = Math.max(0, 1 - k) * flicker;
      b.glow.mesh.material.opacity = Math.max(0, 1 - k) * 0.55 * flicker;
      b.group.visible = k < 1;
      if (k < 1) active = true;
    }
    for (const b of this.beams) {
      if (b.t >= b.life) continue;
      b.t += dt;
      const k = Math.min(1, b.t / b.life);
      if (b.warn) {
        const pulse = 0.5 + 0.5 * Math.sin(b.t * 16);
        b.mat.opacity = 0.12 + 0.2 * pulse;
        b.coneMat.opacity = 0.5 + 0.45 * pulse;
        b.cone.position.y = BOARD_H / 2 + 1.7 + Math.sin(b.t * 10) * 0.22;
        b.cone.rotation.y += dt * 6;
      } else {
        b.mat.color.setHex(0xffd08a);
        b.mat.opacity = Math.max(0, 1 - k) * 0.9;
        b.coneMat.opacity = Math.max(0, 1 - k) * 0.8;
      }
      b.group.visible = k < 1;
      if (k < 1) active = true;
    }
    return active;
  }

  /** Oculta todo (fin de tormenta, reinicio, efectos OFF). */
  clear(): void {
    for (const r of this.rings) { r.t = 0; r.life = 0; r.mesh.visible = false; r.mat.opacity = 0; }
    for (const b of this.bolts) { b.t = 0; b.life = 0; b.group.visible = false; }
    for (const b of this.beams) {
      b.t = 0; b.life = 0; b.group.visible = false;
      b.mat.color.setHex(DRILL_COLOR); b.mat.opacity = 0; b.coneMat.opacity = 0;
    }
  }

  private spawnRing(x: number, y: number, color: number, from: number, to: number, life: number): void {
    let target = this.rings.find((r) => r.t >= r.life);
    if (!target) {
      // Sin hueco libre: recicla el anillo más avanzado (nunca se acumulan meshes).
      target = this.rings[0] as RingFx;
      for (const r of this.rings) {
        if (r.t / Math.max(0.001, r.life) > target.t / Math.max(0.001, target.life)) target = r;
      }
    }
    target.t = 0;
    target.life = life;
    target.from = from;
    target.to = to;
    target.mesh.position.set(x, y, 0.85);
    target.mesh.scale.setScalar(from);
    target.mat.color.setHex(color);
    target.mat.opacity = 0.85;
    target.mesh.visible = true;
  }

  private spawnBolt(points: BoltPoint[], color: number): void {
    let target = this.bolts.find((b) => b.t >= b.life);
    if (!target) target = this.bolts[0] as BoltFx;
    writeRibbon(target.core, points, 0.1);
    writeRibbon(target.glow, points, 0.42);
    target.core.mesh.visible = true;
    target.glow.mesh.visible = true;
    target.core.mesh.material.opacity = 1;
    target.glow.mesh.material.opacity = 0.45;
    target.glow.mesh.material.color.setHex(color);
    target.group.position.z = 1.4;
    target.group.visible = true;
    target.t = 0;
    target.life = 0.42;
  }

  private spawnBeam(column: number, life: number, warn: boolean): void {
    let target = this.beams.find((b) => b.t >= b.life);
    if (!target) target = this.beams[0] as BeamFx;
    const p = cellToWorld(column, 0);
    target.group.position.set(p.x, 0, 2.6);
    target.mat.color.setHex(DRILL_COLOR);
    target.mat.opacity = 0.2;
    target.coneMat.opacity = 0.6;
    target.cone.position.y = BOARD_H / 2 + 1.7;
    target.group.visible = true;
    target.t = 0;
    target.life = life;
    target.warn = warn;
  }
}

