import { describe, expect, it } from 'vitest';
import { boltPath } from '../src/render/fx/boltPath.js';

/** LCG determinista: el trazado debe depender solo del RNG inyectado. */
function seq(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('boltPath (geometría del rayo)', () => {
  const FROM = { x: 0, y: 16 };
  const TO = { x: 2, y: -3 };

  it('nace y muere exactamente en los extremos', () => {
    const pts = boltPath(FROM, TO, seq(1), 7);
    expect(pts.length).toBe(8);
    expect(pts[0]).toEqual(FROM);
    expect(pts[pts.length - 1]).toEqual(TO);
  });

  it('es determinista con el mismo RNG', () => {
    expect(boltPath(FROM, TO, seq(42), 7)).toEqual(boltPath(FROM, TO, seq(42), 7));
    expect(boltPath(FROM, TO, seq(1), 7)).not.toEqual(boltPath(FROM, TO, seq(2), 7));
  });

  it('mantiene las dentelladas acotadas y sin valores no finitos', () => {
    const segments = 7;
    const pts = boltPath(FROM, TO, seq(7), segments);
    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    for (let i = 1; i < pts.length - 1; i++) {
      const t = i / segments;
      const baseX = FROM.x + (TO.x - FROM.x) * t;
      const p = pts[i];
      if (p) expect(Math.abs(p.x - baseX)).toBeLessThanOrEqual(0.4500001);
    }
  });
});
