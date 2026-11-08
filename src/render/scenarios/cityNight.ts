import * as THREE from 'three';
import { paintSky } from '../scene.js';
import type { SceneParts } from '../scene.js';
import type { Scenario, ScenarioLook, ScenarioResources } from './scenario.js';
import { scenarioRegistry } from './scenarioRegistry.js';
import { disposeResources } from './scenario.js';

const SKY: [number, number, number, number] = [0x050a14, 0x141e30, 0x2a3a5c, 0x4a6a8a];
const LOOK: ScenarioLook = {
  sky: SKY,
  fog: { color: 0x0b1422, near: 20, far: 72 },
  hemi: { sky: 0x4a6a8a, ground: 0x121a2a, intensity: 0.35 },
  key: { color: 0xffffff, intensity: 0.5 },
  fill: { color: 0x2a3a5c, intensity: 0.15 },
  ground: { color: 0x1a1a22, gridOpacity: 0.15 },
  clouds: { color: 0x2a3a5c, speed: 0.8, visible: true },
  confetti: 0.2,
  wind: 0.5,
};

const BUILDING_COLORS = [0x1a1a22, 0x222230, 0x141a22];

function makeBuilding(w: number, h: number, z: number, baseY: number, color: number): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -8);
  shape.lineTo(-w / 2, 0);
  const floors = Math.max(2, Math.floor(h / 3));
  const fw = w / floors;
  for (let i = 0; i < floors; i++) {
    const x0 = -w / 2 + i * fw;
    const peak = h * (0.5 + 0.5 * Math.sin(i * 1.3 + z));
    shape.lineTo(x0 + fw / 2, peak);
    shape.lineTo(x0 + fw, 0);
  }
  shape.lineTo(w / 2, -8);
  shape.closePath();
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
  mesh.position.set(0, baseY, z);
  return mesh;
}

export const cityNight: Scenario = {
  id: 'cityNight',
  name: 'Ciudad nocturna',
  icon: '🌃',
  minLevel: 5,
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

    // Siluetas de edificios (van al grupo de escenografía del escenario).
    const specs: Array<[number, number, number, number, number]> = [
      [-40, 26, 14, -44, -12], [-20, 22, 12, -38, -12.5], [0, 30, 16, -46, -11.5],
      [20, 20, 13, -40, -12], [40, 24, 11, -42, -12.5],
    ];
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      if (!spec) continue;
      const [x, w, h, z, y] = spec;
      const b = makeBuilding(w, h, z, y, BUILDING_COLORS[i % BUILDING_COLORS.length] ?? 0x1a1a22);
      b.position.x = x;
      parts.scenery.add(b);
      res.meshes.push(b);
      res.geometries.push(b.geometry as THREE.BufferGeometry);
      res.materials.push(b.material as THREE.Material);
    }

    // Carteles de neón.
    const signs: Array<[number, number, number, number]> = [
      [-16, 4, -36, 0xff4444], [8, 6, -32, 0x44ff44], [-8, 3, -42, 0x4444ff],
      [18, 5, -38, 0xff44ff], [-22, 2, -44, 0xffff44],
    ];
    for (const [x, y, z, c] of signs) {
      const geo = new THREE.PlaneGeometry(2.4, 0.8);
      const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9 });
      const s = new THREE.Mesh(geo, mat);
      s.position.set(x, y, z);
      parts.scenery.add(s);
      res.meshes.push(s);
      res.geometries.push(geo);
      res.materials.push(mat);
    }

    (cityNight as any)._res = res;
  },

  update(): void {
    // Escenario estático: el movimiento de nubes lo gestiona el stage.
  },

  release(): void {
    const res = (cityNight as any)._res as ScenarioResources | undefined;
    if (res) {
      disposeResources(res);
      (cityNight as any)._res = undefined;
    }
  },
};

scenarioRegistry.register(cityNight);
