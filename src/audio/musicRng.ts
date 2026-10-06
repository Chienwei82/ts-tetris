/**
 * Generación de números pseudoaleatorios determinista (mulberry32).
 * Toda la música procedural deriva de aquí: misma semilla ⇒ misma canción.
 */

/** mulberry32: rápido, de buena calidad y con estado de 32 bits. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mezcla una semilla (número o texto) a un entero de 32 bits (FNV-1a). */
export function hashSeed(seed: number | string): number {
  if (typeof seed === 'number') return seed >>> 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * RNG independiente por compás: el material de cada compás depende solo de
 * (semilla, compás), con independencia de lo que suene antes o después.
 */
export function rngForBar(seed: number, bar: number): () => number {
  return mulberry32((hashSeed(seed) ^ Math.imul(bar + 1, 0x9e3779b1)) >>> 0);
}