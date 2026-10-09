/** RNG con semilla para el modo caos: misma semilla => misma partida. */
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

export function hashSeed(seed: number | string): number {
  if (typeof seed === 'number') return seed >>> 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function randomSeed(): number {
  const buf = new Uint32Array(1);
  try {
    crypto.getRandomValues(buf);
    const v = buf[0];
    if (typeof v === 'number') return v >>> 0;
  } catch { /* crypto no disponible (SSR/tests) */ }
  return (Date.now() ^ ((Math.random() * 0xffffffff) >>> 0)) >>> 0;
}
