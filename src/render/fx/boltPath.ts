/**
 * Geometría pura de un rayo dentado. Se mantiene sin three.js para poder
 * probarla con Vitest (sin DOM ni WebGL) y para que el RNG sea inyectable.
 */
export interface BoltPoint {
  x: number;
  y: number;
}

/**
 * Devuelve `segments + 1` puntos entre `from` y `to` con dentelladas
 * horizontales (aspecto de relámpago). Los extremos son exactos: el rayo nace
 * en el cielo y muere justo en la celda golpeada.
 */
export function boltPath(from: BoltPoint, to: BoltPoint, rng: () => number, segments = 7): BoltPoint[] {
  const n = Math.max(2, Math.floor(segments));
  const points: BoltPoint[] = [{ x: from.x, y: from.y }];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const jitter = (rng() - 0.5) * 0.9;
    points.push({
      x: from.x + (to.x - from.x) * t + jitter,
      y: from.y + (to.y - from.y) * t + (rng() - 0.5) * 0.12
    });
  }
  points.push({ x: to.x, y: to.y });
  return points;
}
