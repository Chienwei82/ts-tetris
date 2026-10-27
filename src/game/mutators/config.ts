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
  /** Relámpago: segundos entre descargas. */
  lightningIntervalSec: number;
  /** Relámpago: antelación del primer rayo desde el inicio de la tormenta. */
  lightningFirstStrikeSec: number;
  /** Relámpago: bloques rotos por descarga. */
  lightningBreaks: number;
  /** Relámpago: segundos de aturdimiento (visual/juego). */
  lightningStunSec: number;
  /** Granizo: segundos entre descargas. */
  hailIntervalSec: number;
  /** Granizo: antelación de la primera descarga. */
  hailFirstFallSec: number;
  /** Granizo: segundos hasta que el granizo se derrite. */
  hailMeltSec: number;
  /** Granizo: columnas afectadas por descarga. */
  hailMaxPerWave: number;
  /** Taladro: segundos entre descargas. */
  drillIntervalSec: number;
  /** Taladro: antelación de la primera descarga desde el inicio de la tormenta. */
  drillFirstStrikeSec: number;
  /** Taladro: aviso previo antes de la perforación. */
  drillWarnSec: number;
  /** Taladro: ancho del cono (celdas a cada lado del eje). */
  drillConeWidth: number;
}

export const DEFAULT_MUTATOR_CONFIG: MutatorConfig = {
  pool: ['wind', 'rain', 'lightning', 'hail', 'drill'],
  firstDelaySec: 18,
  warnSec: 1.6,
  activeSec: 18,
  cooldownSec: 12,
  windIntervalSec: 6,
  windWarnSec: 1.2,
  windFirstGustSec: 3,
  lightningIntervalSec: 5,
  lightningFirstStrikeSec: 3,
  lightningBreaks: 3,
  lightningStunSec: 0.9,
  hailIntervalSec: 2.2,
  hailFirstFallSec: 3,
  hailMeltSec: 7,
  hailMaxPerWave: 2,
  drillIntervalSec: 4.0,
  drillFirstStrikeSec: 3,
  drillWarnSec: 1.2,
  drillConeWidth: 1
};
