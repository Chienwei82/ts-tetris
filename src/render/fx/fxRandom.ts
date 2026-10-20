import { mulberry32, randomSeed } from '../../game/rng.js';

/**
 * Generador exclusivo de los efectos visuales.
 *
 * Comparte el algoritmo (mulberry32) con el RNG del juego, pero SIEMPRE usa una
 * instancia y una semilla propias. Nunca se le pasa `chaosSeed` ni se lee el
 * estado del motor: así una partida reproducible no se desincroniza por culpa
 * de un efecto cosmético.
 */
export interface FxRandom {
  next(): number;
  range(min: number, max: number): number;
  chance(probability: number): boolean;
}

export function createFxRandom(seed: number = randomSeed()): FxRandom {
  const next = mulberry32(seed);
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    chance: (probability) => next() < probability
  };
}
