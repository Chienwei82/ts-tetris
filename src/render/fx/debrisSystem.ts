import * as THREE from 'three';
import { PIECE_COLORS } from '../../game/types.js';
import type { PieceKind } from '../../game/types.js';
import { toonGradient } from '../materials.js';
import { DEBRIS_CAPACITY, DEBRIS_CONFIG, DEBRIS_QUALITY } from './debrisConfig.js';
import { DebrisSimulation } from './debrisSimulation.js';
import type { DebrisBody, DebrisOrigin, DebrisSpawnOptions } from './debrisSimulation.js';
import { createFxRandom } from './fxRandom.js';
import type { FxRandom } from './fxRandom.js';
import type { FxQuality } from './fxQuality.js';

/** Celda eliminada del tablero, en coordenadas de mundo. */
export interface DebrisCell {
  kind: PieceKind;
  x: number;
  y: number;
}

export interface DebrisSystemOptions {
  quality?: FxQuality;
  random?: FxRandom;
}

const scratchMatrix = new THREE.Matrix4();
const scratchQuat = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();
const scratchPos = new THREE.Vector3();
const scratchScale = new THREE.Vector3();
const scratchColor = new THREE.Color();
const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Escombros visuales de un solo draw call.
 *
 * La simulación (`DebrisSimulation`) es pura y testeable; esta clase solo la
 * dibuja como instancias, escribe color/alfa por instancia y libera la GPU.
 * API reutilizable: `spawnBurst` acepta posiciones de mundo y color, así que
 * bombas, rayos o cualquier evento futuro pueden lanzar escombros sin conocer
 * la eliminación de líneas.
 */
export class DebrisSystem {
  private readonly scene: THREE.Scene;
  private readonly simulation: DebrisSimulation;
  private readonly mesh: THREE.InstancedMesh;
  private readonly geometry: THREE.BoxGeometry;
  private readonly material: THREE.MeshToonMaterial;
  private readonly alphas: Float32Array;
  private readonly alphaAttr: THREE.InstancedBufferAttribute;
  private readonly colors: Float32Array;
  private readonly colorAttr: THREE.InstancedBufferAttribute;
  private enabled = true;
  private paused = false;
  private wasActive = false;
  private currentQuality: FxQuality;

  constructor(scene: THREE.Scene, opts: DebrisSystemOptions = {}) {
    this.scene = scene;
    this.currentQuality = opts.quality ?? 'high';
    const random = opts.random ?? createFxRandom();
    this.simulation = new DebrisSimulation({
      capacity: DEBRIS_CAPACITY,
      profile: DEBRIS_QUALITY[this.currentQuality],
      random
    });

    this.geometry = new THREE.BoxGeometry(DEBRIS_CONFIG.size, DEBRIS_CONFIG.size, DEBRIS_CONFIG.size);
    this.alphas = new Float32Array(DEBRIS_CAPACITY);
    this.alphaAttr = new THREE.InstancedBufferAttribute(this.alphas, 1);
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
    this.colors = new Float32Array(DEBRIS_CAPACITY * 3);
    this.colorAttr = new THREE.InstancedBufferAttribute(this.colors, 3);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aAlpha', this.alphaAttr);
    this.geometry.setAttribute('aColor', this.colorAttr);

    this.material = new THREE.MeshToonMaterial({
      color: 0xffffff,
      gradientMap: toonGradient,
      transparent: true,
      depthWrite: false
    });
    this.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec3 aColor;\nattribute float aAlpha;\nvarying vec3 vDebrisColor;\nvarying float vDebrisAlpha;'
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvDebrisColor = aColor;\nvDebrisAlpha = aAlpha;'
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vDebrisColor;\nvarying float vDebrisAlpha;')
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\ndiffuseColor.rgb *= vDebrisColor;\ndiffuseColor.a *= vDebrisAlpha;'
        );
    };
    this.material.customProgramCacheKey = () => 'debris-toon-alpha-v1';

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, DEBRIS_CAPACITY);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = DEBRIS_CAPACITY;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 12;
    this.mesh.visible = false;
    for (let i = 0; i < DEBRIS_CAPACITY; i++) this.mesh.setMatrixAt(i, ZERO_MATRIX);
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
  }

  get quality(): FxQuality { return this.currentQuality; }
  get activeCount(): number { return this.simulation.activeCount; }

  /** Lanza escombros desde puntos de mundo (API genérica para otros eventos). */
  spawnBurst(origins: readonly DebrisOrigin[], options: DebrisSpawnOptions = {}): void {
    if (!this.enabled || origins.length === 0) return;
    for (const origin of origins) this.spawnOne(origin, options);
    this.colorAttr.needsUpdate = true;
    this.mesh.visible = true;
    this.wasActive = true;
  }

  /** Atajo para las celdas eliminadas de una línea. */
  spawnCells(cells: readonly DebrisCell[], options: DebrisSpawnOptions = {}): void {
    if (!this.enabled || cells.length === 0) return;
    const origin: DebrisOrigin = { x: 0, y: 0, z: DEBRIS_CONFIG.spawnZ, color: 0xffffff };
    for (const cell of cells) {
      origin.x = cell.x;
      origin.y = cell.y;
      origin.color = PIECE_COLORS[cell.kind];
      this.spawnOne(origin, options);
    }
    this.colorAttr.needsUpdate = true;
    this.mesh.visible = true;
    this.wasActive = true;
  }

  setQuality(quality: FxQuality): void {
    if (quality === this.currentQuality) return;
    this.currentQuality = quality;
    this.simulation.setProfile(DEBRIS_QUALITY[quality]);
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    if (!on) this.clear();
  }

  /** La pausa congela la física, igual que el resto de animaciones. */
  setPaused(on: boolean): void { this.paused = on; }

  clear(): void {
    this.simulation.clear();
    for (let i = 0; i < DEBRIS_CAPACITY; i++) {
      this.mesh.setMatrixAt(i, ZERO_MATRIX);
      this.alphas[i] = 0;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
    this.mesh.visible = false;
    this.wasActive = false;
  }

  update(dt: number): void {
    if (!this.enabled || this.paused) return;
    this.simulation.update(dt);
    const active = this.simulation.activeCount;
    if (active === 0 && !this.wasActive) return;
    this.writeInstances();
    this.wasActive = active > 0;
    this.mesh.visible = active > 0;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.clear();
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }


  private spawnOne(origin: DebrisOrigin, options: DebrisSpawnOptions): void {
    const index = this.simulation.spawn(origin, options);
    if (index >= 0) this.writeColor(index, origin.color);
  }

  /** Vuelca el estado de la simulación al buffer de instancias. */
  private writeInstances(): void {
    for (let i = 0; i < DEBRIS_CAPACITY; i++) {
      const body = this.simulation.bodies[i];
      if (!body || !body.active) {
        this.mesh.setMatrixAt(i, ZERO_MATRIX);
        this.alphas[i] = 0;
        continue;
      }
      this.writeBodyMatrix(i, body);
      this.alphas[i] = body.alpha;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }

  private writeBodyMatrix(index: number, body: DebrisBody): void {
    scratchPos.set(body.x, body.y, body.z);
    scratchEuler.set(body.rx, body.ry, body.rz);
    scratchQuat.setFromEuler(scratchEuler);
    scratchScale.setScalar(body.scale);
    scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
    this.mesh.setMatrixAt(index, scratchMatrix);
  }

  private writeColor(index: number, hex: number): void {
    scratchColor.setHex(hex);
    this.colors[index * 3] = scratchColor.r;
    this.colors[index * 3 + 1] = scratchColor.g;
    this.colors[index * 3 + 2] = scratchColor.b;
  }
}

