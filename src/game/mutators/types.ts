/** Mutadores disponibles en el modo Caos (tormentas). */
export type MutatorId = 'wind' | 'rain';

/** Dirección de un empuje de viento: izquierda o derecha. */
export type WindDir = -1 | 1;

/**
 * Punto de extensión que el director usa para aplicar reglas sobre el motor.
 * El director es lógica pura: no conoce el tablero ni la vista.
 */
export interface MutatorHost {
  /** Empuja la pieza activa una celda. Devuelve si pudo moverse. */
  pushWind(dir: WindDir): boolean;
  /** Activa o desactiva el suelo resbaladizo de la lluvia. */
  setSlippery(on: boolean): void;
}

/**
 * Eventos del ciclo de una tormenta. Los que afectan al juego (dirección del
 * viento, duración, empuje) salen del RNG de reglas; la vista solo los decora.
 */
export type MutatorEvent =
  | { kind: 'warn'; mutator: MutatorId; seconds: number }
  | { kind: 'start'; mutator: MutatorId; seconds: number }
  | { kind: 'end'; mutator: MutatorId }
  | { kind: 'wind-warn'; dir: WindDir; seconds: number }
  | { kind: 'wind-gust'; dir: WindDir; moved: boolean };
