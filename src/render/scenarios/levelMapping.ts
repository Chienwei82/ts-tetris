/** Subconjunto mínimo de un escenario que necesita la selección por nivel. */
export interface ScenarioLevelInfo {
  readonly id: string;
  readonly minLevel: number;
}

/**
 * Elige (de forma pura y sin dependencias de Three/DOM) el escenario que
 * corresponde a un nivel:
 *  - se consideran sólo los escenarios ya desbloqueados (`lv >= minLevel`);
 *  - se ordenan por `minLevel` para respetar la progresión;
 *  - se rota entre ellos cada `levelsPerScenario` niveles.
 *
 * Devuelve el id del escenario o `null` si todavía no hay ninguno disponible.
 */
export function scenarioForLevel(
  all: ReadonlyArray<ScenarioLevelInfo>,
  lv: number,
  levelsPerScenario: number
): string | null {
  const unlocked = all
    .filter((s) => lv >= s.minLevel)
    .slice()
    .sort((a, b) => a.minLevel - b.minLevel);
  if (unlocked.length === 0) return null;
  const period = Math.max(1, Math.floor(levelsPerScenario));
  const step = Math.floor((Math.max(1, lv) - 1) / period);
  const cand = unlocked[step % unlocked.length];
  return cand ? cand.id : null;
}