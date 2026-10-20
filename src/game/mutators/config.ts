import type { MutatorId } from './types.js';

/**
 * Ajustables del ciclo de tormentas del modo Caos.
 * Los tiempos se expresan en segundos de juego (nunca corren en pausa).
 */
export interface MutatorConfig {
  /** Mutadores que pueden aparecer. Permite aislar uno en tests o futuros eventos. */
  pool: readonly MutatorId[];
  /** Tiempo de partida antes del primer aviso de tormenta. */
  firstDelaySec: number;
  /** Aviso previo al inicio de la tormenta. */
  warnSec: number;
  /** Duración de la tormenta una vez activa. */
  activeSec: number;
  /** Descanso entre el final de una tormenta y el aviso de la siguiente. */
  cooldownSec: number;
  /** Viento: segundos entre empujes. */
  windIntervalSec: number;
  /** Viento: antelación mínima de la flecha (nunca menos de 1 s). */
  windWarnSec: number;
  /** Viento: primer empuje desde que empieza la tormenta. */
  windFirstGustSec: number;
}

export const DEFAULT_MUTATOR_CONFIG: MutatorConfig = {
  pool: ['wind', 'rain'],
  firstDelaySec: 18,
  warnSec: 1.6,
  activeSec: 18,
  cooldownSec: 12,
  windIntervalSec: 6,
  windWarnSec: 1.2,
  windFirstGustSec: 3
};
