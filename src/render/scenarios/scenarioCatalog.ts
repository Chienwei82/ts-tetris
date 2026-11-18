import { scenarioForLevel } from './levelMapping.js';

/** Escenarios disponibles y sus metadatos puros (sin three.js ni DOM). */
export type ScenarioId = 'forest' | 'cityNight' | 'space' | 'deepSea';

export interface ScenarioMeta {
  readonly id: ScenarioId;
  readonly name: string;
  readonly icon: string;
  readonly minLevel: number;
}

/** Un escenario nuevo cada 5 niveles (misma regla que ScenarioManager). */
export const LEVELS_PER_SCENARIO = 5;

/**
 * Fuente única de los metadatos: la usan los módulos de escenario (para no
 * duplicar nombre/icono) y el cartel de nivel (para saber qué fondo toca).
 */
export const SCENARIO_META: Record<ScenarioId, ScenarioMeta> = {
  forest: { id: 'forest', name: 'Bosque', icon: '🌲', minLevel: 3 },
  cityNight: { id: 'cityNight', name: 'Ciudad nocturna', icon: '🌃', minLevel: 5 },
  space: { id: 'space', name: 'Espacio', icon: '🚀', minLevel: 7 },
  deepSea: { id: 'deepSea', name: 'Fondo del mar', icon: '🌊', minLevel: 9 }
};

export const SCENARIO_CATALOG: readonly ScenarioMeta[] = Object.values(SCENARIO_META);

/** Escenario que ofrece un nivel, o null para los niveles con tema clásico. */
export function scenarioMetaForLevel(level: number): ScenarioMeta | null {
  const id = scenarioForLevel(SCENARIO_CATALOG, level, LEVELS_PER_SCENARIO);
  if (id === null) return null;
  return SCENARIO_CATALOG.find((scenario) => scenario.id === id) ?? null;
}
