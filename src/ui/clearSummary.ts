import { CLEAR_TYPE_LABEL } from '../game/types.js';
import type { ClearType } from '../game/types.js';

export interface ClearSummaryInput {
  clearType: ClearType;
  lines: number;
  comboCount: number;
  scoreGained: number;
}

export interface ClearSummary {
  /** Titular del aviso ("¡TETRIS!"). */
  title: string;
  /** Desglose compacto ("+1200 · Combo x3"). */
  detail: string;
}

/**
 * Un único aviso por clear, con el desglose legible en lugar de varios toasts
 * encadenados. B2B y Perfect Clear se añadirán cuando existan en el motor
 * (fase de maestría); aquí solo hay tipo de clear, combo y puntos.
 */
export function clearSummary(input: ClearSummaryInput): ClearSummary {
  const { clearType, lines, comboCount, scoreGained } = input;
  const label = CLEAR_TYPE_LABEL[clearType] ?? `${lines} líneas`;
  const title = clearType === 'tetris' ? '¡TETRIS!' : clearType === 'single'
    ? 'Línea'
    : `¡${label.toUpperCase()}!`;
  const parts: string[] = [];
  if (scoreGained > 0) parts.push(`+${scoreGained}`);
  // El combo solo se anuncia a partir de la segunda limpieza encadenada.
  if (comboCount >= 2) parts.push(`Combo x${comboCount}`);
  if (parts.length === 0) parts.push(label);
  return { title, detail: parts.join(' · ') };
}
