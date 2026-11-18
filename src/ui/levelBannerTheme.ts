import { THEMES, themeIndexForLevel } from '../render/themes.js';
import { scenarioMetaForLevel } from '../render/scenarios/scenarioCatalog.js';
import type { ScenarioId } from '../render/scenarios/scenarioCatalog.js';

/** Estilos visuales disponibles para el cartel de nivel. */
export type BannerStageId = ScenarioId | 'pradera';

export interface BannerStage {
  id: BannerStageId;
  icon: string;
  name: string;
}

const MEADOW: BannerStage = { id: 'pradera', icon: '☀️', name: 'Pradera' };

/**
 * Fondo que ofrecerá un nivel: escenario si ya hay uno desbloqueado y, si no
 * (niveles 1-2), el tema clásico. Mantiene el cartel alineado con el diorama
 * real en vez de con el índice de tema interno.
 */
export function bannerStageForLevel(level: number): BannerStage {
  const scenario = scenarioMetaForLevel(level);
  if (scenario) return { id: scenario.id, icon: scenario.icon, name: scenario.name };
  const theme = THEMES[themeIndexForLevel(level)];
  return theme ? { id: 'pradera', icon: theme.icon, name: theme.name } : MEADOW;
}
