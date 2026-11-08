import * as THREE from 'three';
import { paintSky } from '../scene.js';
import type { SceneParts } from '../scene.js';
import type { Scenario, ScenarioLook, ScenarioResources } from './scenario.js';
import { scenarioRegistry } from './scenarioRegistry.js';
import { disposeResources } from './scenario.js';

const SKY: [number, number, number, number] = [0x0a1a2a, 0x1a3a4a, 0x2a5a6a, 0x4a8a9a];
const LOOK: ScenarioLook = {
  sky: SKY,
  fog: { color: 0x1a2a3a, near: 22, far: 70 },
  hemi: { sky: 0x4a8a9a, ground: 0x0a1a1a, intensity: 0.4 },
  key: { color: 0x8fd8e8, intensity: 0.35 },
  fill: { color: 0x2a4a5a, intensity: 0.1 },
  ground: { color: 0x1a2a2a, gridOpacity: 0.18 },
  clouds: { color: 0x4a6a7a, speed: 0.6, visible: true },
  confetti: 0.3,
  wind: 0.8,
};

const CORAL_COLORS = [0xff6b6b, 0x4ecdc4, 0xffd93d, 0x6bcb77];

function makeCoral(w: number, h: number, z: number, baseY: number, color: number): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -8);
  shape.lineTo(-w / 2, 0);
  const segs = Math.max(2, Math.floor(h / 2));
  const sw = w / segs;
  for (let i = 0; i < segs; i++) {
    const x0 = -w / 2 + i * sw;
    const peak = h * (0.5 + 0.5 * Math.sin(i * 2.2 + z));
    shape.lineTo(x0 + sw / 2, peak);
    shape.lineTo(x0 + sw, 0);
  }
  shape.lineTo(w / 2, -8);
  shape.closePath();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
  mesh.position.set(0, baseY, z);
  return mesh;
}

export const deepSea: Scenario = {
  id: 'deepSea',
  name: 'Fondo del mar',
  icon: '🌊',
  minLevel: 9,
  look: LOOK,

  build(parts: SceneParts): void {
    const res: ScenarioResources = { meshes: [], lights: [], materials: [], geometries: [], textures: [], points: [] };

    paintSky(parts.sky, SKY);
    parts.fog.color.setHex(LOOK.fog.color);
    parts.fog.near = LOOK.fog.near;
    parts.fog.far = LOOK.fog.far;
    parts.hemi.color.setHex(LOOK.hemi.sky);
    parts.hemi.groundColor.setHex(LOOK.hemi.ground);
    parts.hemi.intensity = LOOK.hemi.intensity;
    parts.key.color.setHex(LOOK.key.color);
    parts.key.intensity = LOOK.key.intensity;
    parts.fill.color.setHex(LOOK.fill.color);
    parts.fill.intensity = LOOK.fill.intensity;
    parts.groundMat.color.setHex(LOOK.ground.color);
    const gm = parts.gridMat as THREE.Material;
    gm.transparent = true;
    gm.opacity = LOOK.ground.gridOpacity;
    parts.cloudMat.color.setHex(LOOK.clouds.color);
    for (const c of parts.clouds) c.mesh.visible = LOOK.clouds.visible;
    parts.confetti.setAlpha(LOOK.confetti);

    // Corales (van al grupo de escenografía del escenario).
    const specs: Array<[number, number, number, number, number]> = [
      [-34, 20, 10, -36, -11], [-16, 16, 8, -30, -11.5], [2, 18, 9, -34, -10.5],
      [20, 14, 7, -28, -12], [-2, 12, 6, -40, -12.5],
    ];
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      if (!spec) continue;
      const [x, w, h, z, y] = spec;
      const c = makeCoral(w, h, z, y, CORAL_COLORS[i % CORAL_COLORS.length] ?? 0xff6b6b);
      c.position.set(x, y, z);
      parts.scenery.add(c);
      res.meshes.push(c);
      res.geometries.push(c.geometry as THREE.BufferGeometry);
      res.materials.push(c.material as THREE.Material);
    }

    (deepSea as any)._res = res;
  },

  update(): void {
    // Estático; las burbujas son el campo de particulas del weather.
  },

  release(): void {
    const res = (deepSea as any)._res as ScenarioResources | undefined;
    if (res) {
      disposeResources(res);
      (deepSea as any)._res = undefined;
    }
  },
};

scenarioRegistry.register(deepSea);
