import type { GameMode } from '../../game/types.js';

/** Entradas que deciden si los escombros deben estar activos. */
export interface DebrisActivation {
  mode: GameMode;
  /** El jugador marcó "Escombros también en Tradicional". */
  classicOptIn: boolean;
  effectsOn: boolean;
  reducedMotion: boolean;
}

/**
 * Regla única de activación, pura y testeable:
 * - Caos: activos por defecto.
 * - Tradicional: solo con opt-in explícito.
 * - Efectos apagados o `prefers-reduced-motion`: nunca.
 */
export function debrisActive(input: DebrisActivation): boolean {
  if (!input.effectsOn || input.reducedMotion) return false;
  return input.mode === 'chaos' || input.classicOptIn;
}
