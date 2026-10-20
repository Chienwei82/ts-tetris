import { BOARD_H } from '../constants.js';
import type { FxQuality } from './fxQuality.js';

/** Ajustes físicos de los escombros que cambian con la calidad. */
export interface DebrisPhysicsProfile {
  /** Cuerpos simultáneos. Al superarlo se recicla el más antiguo. */
  maxActive: number;
  gravity: number;
  /** Energía conservada al rebotar contra la plataforma (0 = sin rebote). */
  restitution: number;
  /** Pérdida de velocidad horizontal en cada contacto. */
  friction: number;
  /** Velocidad angular máxima al nacer (rad/s). */
  spin: number;
  /** Tiempo antes de empezar a desvanecerse. */
  fadeDelay: number;
  fadeDurationMin: number;
  fadeDurationMax: number;
}

/**
 * Todos los valores ajustables de la Etapa 2. Si un número afecta al aspecto,
 * a la duración o al coste del efecto, vive aquí (no en los módulos).
 */
export const DEBRIS_CONFIG = {
  /** Lado del cubo, en unidades de celda. */
  size: 0.42,
  /** Superficie de la plataforma del tablero donde rebotan (tapa del cartón). */
  floorY: -BOARD_H / 2 - 0.62,
  /** z de nacimiento: delante del tablero, para no tapar la pila. */
  spawnZ: 0.7,
  spreadX: 2.6,
  impulseUpMin: 2.4,
  impulseUpMax: 5.2,
  driftZMin: 0.15,
  driftZMax: 0.7,
  /** Paso fijo de la simulación: rebotes estables con cualquier framerate. */
  fixedStep: 1 / 60,
  /** Nunca simular más de este delta por frame (evita saltos tras un tirón). */
  maxFrameDelta: 0.1,
  maxSubSteps: 6,
  /** Por debajo de esta velocidad el rebote se considera nulo. */
  minBounceSpeed: 0.8,
  /** Amortiguación del giro al tocar el suelo. */
  spinDamping: 0.55,
  /** Velocidad vertical mínima para considerar que el cuerpo reposa. */
  settleSpeed: 0.25
} as const;

/**
 * Presets de calidad. La capacidad del `InstancedMesh` se reserva una sola vez
 * con el máximo (alta); cambiar de calidad solo recorta el número activo.
 */
export const DEBRIS_QUALITY: Record<FxQuality, DebrisPhysicsProfile> = {
  high: {
    maxActive: 240,
    gravity: 24,
    restitution: 0.42,
    friction: 0.72,
    spin: 7,
    fadeDelay: 0.25,
    fadeDurationMin: 1,
    fadeDurationMax: 1.6
  },
  medium: {
    maxActive: 140,
    gravity: 24,
    restitution: 0.3,
    friction: 0.62,
    spin: 5,
    fadeDelay: 0.2,
    fadeDurationMin: 0.9,
    fadeDurationMax: 1.4
  },
  low: {
    maxActive: 70,
    gravity: 26,
    restitution: 0.14,
    friction: 0.5,
    spin: 3,
    fadeDelay: 0.15,
    fadeDurationMin: 0.85,
    fadeDurationMax: 1.15
  }
};

/** Capacidad única del pool: el máximo de todos los presets. */
export const DEBRIS_CAPACITY = DEBRIS_QUALITY.high.maxActive;
