import * as THREE from 'three';
import type { SceneParts } from '../scene.js';

/** Valores estáticos de un escenario: cielo, niebla, luces y suelo. */
export interface ScenarioLook {
  /** Sky gradient stops, top -> horizon. */
  sky: [number, number, number, number];
  fog: { color: number; near: number; far: number };
  hemi: { sky: number; ground: number; intensity: number };
  key: { color: number; intensity: number };
  fill: { color: number; intensity: number };
  ground: { color: number; gridOpacity: number };
  clouds: { color: number; speed: number; visible: boolean };
  /** Ambient confetti alpha multiplier (dark stages dim it). */
  confetti: number;
  /** Wind multiplier shared by clouds and weather fields. */
  wind: number;
}

/**
 * Interfaz común de cada escenario. Cada módulo de escenario la implementa y se
 * registra en ScenarioRegistry. Así se pueden añadir escenarios nuevos sin tocar
 * el gestor ni el bucle principal.
 */
export interface Scenario {
  /** Identificador único y estable del escenario. */
  readonly id: string;
  /** Nombre legible (para el HUD). */
  readonly name: string;
  /** Ícono corto (para el HUD). */
  readonly icon: string;
  /** Nivel a partir del cual este escenario está disponible. */
  readonly minLevel: number;
  /** Apariencia estática (usada también para interpolar transiciones). */
  readonly look: ScenarioLook;

  /**
   * Construye los elementos visuales del escenario en la escena Three.js.
   * Se llama al activar el escenario. Debe registrar todo lo que cree para
   * poder liberarlo con release().
   */
  build(parts: SceneParts): void;
  /** Animación por frame mientras el escenario está activo. */
  update(dt: number): void;
  /** Libera toda la memoria de GPU (geometrías, materiales, texturas) y
   *  elimina los meshes de la escena. Se llama al cambiar de escenario. */
  release(): void;
}

/** Recursos desechables que un escenario crea durante build(). */
export interface ScenarioResources {
  meshes: THREE.Object3D[];
  lights: THREE.Light[];
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  textures: THREE.Texture[];
  points: THREE.Points[];
}

export function disposeResources(res: ScenarioResources): void {
  for (const mesh of res.meshes) {
    if (mesh.parent) mesh.parent.remove(mesh);
  }
  for (const light of res.lights) {
    if (light.parent) light.parent.remove(light);
  }
  for (const mat of res.materials) mat.dispose();
  for (const geo of res.geometries) geo.dispose();
  for (const tex of res.textures) tex.dispose();
  for (const pts of res.points) {
    if (pts.parent) pts.parent.remove(pts);
    pts.geometry.dispose();
    if (pts.material) {
      const m = pts.material as THREE.Material;
      if (Array.isArray(m)) {
        for (const mm of m) mm.dispose();
      } else {
        m.dispose();
      }
    }
  }
}
