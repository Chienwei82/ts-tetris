import * as THREE from 'three';
import type { SceneParts } from '../scene.js';
import type { Scenario, ScenarioLook, ScenarioResources } from './scenario.js';
import { scenarioRegistry } from './scenarioRegistry.js';
import { disposeResources } from './scenario.js';

const SKY: [number, number, number, number] = [0x05050a, 0x1a1a40, 0x2a1f5e, 0x453a80];
const LOOK: ScenarioLook = {
  sky: SKY,
  fog: { color: 0x1c1840, near: 26, far: 88 },
  hemi: { sky: 0x5a4fa0, ground: 0x12101f, intensity: 0.5 },
  key: { color: 0xc9b8ff, intensity: 0.45 },
  fill: { color: 0x3a3a6a, intensity: 0.1 },
  ground: { color: 0x2a2438, gridOpacity: 0.12 },
  clouds: { color: 0x5a54a0, speed: 0.3, visible: false },
  confetti: 0.2,
  wind: 0.3,
};

function makePlanet(radius: number, z: number, baseY: number, color: number): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 40);
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, baseY, z);
  return mesh;
}

export const space: Scenario = {
  id: 'space',
  name: 'Espacio',
  icon: '🚀',
  minLevel: 7,
  look: LOOK,

  build(parts: SceneParts): void {
    const res: ScenarioResources = { meshes: [], lights: [], materials: [], geometries: [], textures: [], points: [] };

    // Cielo, luces, niebla y suelo los aplica ScenarioManager con el look ya
    // graduado (ver render/sceneLighting.ts): así el fondo cambia sin apagar
    // el tablero ni las piezas. Aquí solo se construye la escenografía.

    // Planetas (van al grupo de escenografía del escenario).
    const specs: Array<[number, number, number, number, number]> = [
      [-28, 4, -40, -10, 0x4a4a8a], [-10, 3, -34, -11, 0x6a4a8a],
      [10, 3.5, -38, -10.5, 0x8a4a6a], [28, 2.5, -32, -11.5, 0x4a6a8a],
    ];
    for (const spec of specs) {
      const [x, r, z, y, c] = spec;
      const p = makePlanet(r, z, y, c);
      p.position.set(x, y, z);
      parts.scenery.add(p);
      res.meshes.push(p);
      res.geometries.push(p.geometry as THREE.BufferGeometry);
      res.materials.push(p.material as THREE.Material);
    }

    (space as any)._res = res;
  },

  update(): void {
    // Estático; las estrellas del fondo son el campo de estrellas del weather.
  },

  release(): void {
    const res = (space as any)._res as ScenarioResources | undefined;
    if (res) {
      disposeResources(res);
      (space as any)._res = undefined;
    }
  },
};

scenarioRegistry.register(space);
