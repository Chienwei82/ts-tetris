import type { GameMode } from '../../game/types.js';

/** Entradas que deciden si los escombros deben estar activos. */
export interface DebrisActivation {
  mode: GameMode;
  effectsOn: boolean;
  reducedMotion: boolean;
}

/**
 * Regla única de activación, pura y testeable:
 * - Los escombros son exclusivos del modo Caos.
 * - Efectos apagados o `prefers-reduced-motion`: nunca.
 */
export function debrisActive(input: DebrisActivation): boolean {
  if (!input.effectsOn || input.reducedMotion) return false;
  return input.mode === 'chaos';
}
