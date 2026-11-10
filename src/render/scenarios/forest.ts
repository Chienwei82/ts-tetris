import * as THREE from 'three';
import type { SceneParts } from '../scene.js';
import type { Scenario, ScenarioLook, ScenarioResources } from './scenario.js';
import { scenarioRegistry } from './scenarioRegistry.js';
import { disposeResources } from './scenario.js';

const SKY: [number, number, number, number] = [0x4a7c59, 0x8fbc8f, 0xd4e6d1, 0xe8f3e4];
const LOOK: ScenarioLook = {
  sky: SKY,
  fog: { color: 0xc9e3ca, near: 26, far: 80 },
  hemi: { sky: 0xd4e6d1, ground: 0x5a8a5a, intensity: 0.8 },
  key: { color: 0xf4f1de, intensity: 1.0 },
  fill: { color: 0x8fbc8f, intensity: 0.3 },
  ground: { color: 0xe8f3e4, gridOpacity: 0.25 },
  clouds: { color: 0xf0f7f0, speed: 1.2, visible: true },
  confetti: 0.5,
  wind: 1.0,
};

const TREE_COLORS = [0x2d5a27, 0x3a6b32, 0x1e3d1a];

function makeTree(w: number, h: number, z: number, baseY: number, color: number): THREE.Group {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -8);
  shape.lineTo(-w / 2, 0);
  const tiers = Math.max(2, Math.floor(h / 3));
  const tw = w / tiers;
  for (let i = 0; i < tiers; i++) {
    const x0 = -w / 2 + i * tw;
    const peak = h * (0.45 + 0.55 * Math.abs(Math.sin(i * 2.0 + z)));
    shape.lineTo(x0 + tw / 2, peak);
    shape.lineTo(x0 + tw, 0);
  }
  shape.lineTo(w / 2, -8);
  shape.closePath();
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2, 0.6), new THREE.MeshBasicMaterial({ color: 0x4a3a2a }));
  trunk.position.set(0, 1, 0);
  const crown = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color }));
  crown.position.set(0, h / 2, 0);
  const group = new THREE.Group();
  group.add(trunk, crown);
  group.position.set(0, baseY, z);
  return group;
}

function collectResources(obj: THREE.Object3D, res: ScenarioResources): void {
  res.meshes.push(obj);
  if (obj instanceof THREE.Mesh) {
    if (obj.geometry) res.geometries.push(obj.geometry);
    if (obj.material) res.materials.push(obj.material);
  }
  obj.traverse((child) => {
    if (child === obj) return;
    res.meshes.push(child);
    if (child instanceof THREE.Mesh) {
      if (child.geometry) res.geometries.push(child.geometry);
      if (child.material) res.materials.push(child.material);
    }
  });
}

export const forest: Scenario = {
  id: 'forest',
  name: 'Bosque',
  icon: '🌲',
  minLevel: 3,
  look: LOOK,

  build(parts: SceneParts): void {
    const res: ScenarioResources = { meshes: [], lights: [], materials: [], geometries: [], textures: [], points: [] };

    // Cielo, luces, niebla y suelo los aplica ScenarioManager con el look ya
    // graduado (ver render/sceneLighting.ts): así el fondo cambia sin apagar
    // el tablero ni las piezas. Aquí solo se construye la escenografía.

    // Árboles (van al grupo de escenografía del escenario).
    const specs: Array<[number, number, number, number, number]> = [
      [-36, 22, 11, -40, -11], [-18, 18, 9, -34, -11.5], [0, 26, 13, -42, -10.5],
      [18, 20, 10, -36, -11], [36, 16, 8, -38, -12],
    ];
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      if (!spec) continue;
      const [x, w, h, z, y] = spec;
      const t = makeTree(w, h, z, y, TREE_COLORS[i % TREE_COLORS.length] ?? 0x2d5a27);
      t.position.set(x, y, z);
      parts.scenery.add(t);
      collectResources(t, res);
    }

    (forest as any)._res = res;
  },

  update(): void {
    // Estático; el movimiento de nubes lo gestiona el stage.
  },

  release(): void {
    const res = (forest as any)._res as ScenarioResources | undefined;
    if (res) {
      disposeResources(res);
      (forest as any)._res = undefined;
    }
  },
};

scenarioRegistry.register(forest);
