import { describe, expect, it } from 'vitest';
import { frameFor, PLAY_HALF_H, PLAY_HALF_W } from '../src/render/framing.js';

/** tan(fov/2) con la FOV de la app (40°). */
const TAN_HALF = Math.tan((40 * Math.PI) / 360);

describe('frameFor', () => {
  it('en 16:9 mantiene el encuadre clásico de escritorio', () => {
    const f = frameFor(16 / 9);
    expect(f.dist).toBeCloseTo(31.5, 0);
    expect(f.targetY).toBe(0);
  });

  it('en vertical aleja la cámara para que el tablero (con marco) quepa entero', () => {
    const aspect = 390 / 844;
    const f = frameFor(aspect);
    const visibleW = 2 * f.dist * TAN_HALF * aspect;
    expect(visibleW).toBeGreaterThanOrEqual(2 * PLAY_HALF_W);
    expect(f.dist).toBeGreaterThan(31.5);
  });

  it('en horizontal manda la altura y el área de juego nunca se recorta', () => {
    const f = frameFor(844 / 390);
    const visibleH = 2 * f.dist * TAN_HALF;
    expect(visibleH).toBeGreaterThanOrEqual(2 * PLAY_HALF_H);
  });

  it('cuando la banda inferior es mayor, el tablero sube (centrado en el hueco)', () => {
    const top = 0.085;
    const bottom = 0.2;
    const f = frameFor(390 / 844, { top, bottom });
    expect(f.targetY).toBeLessThan(0);
    const visibleH = 2 * f.dist * TAN_HALF;
    // El desplazamiento equivale al desequilibrio de las bandas de UI.
    expect(f.targetY / visibleH).toBeCloseTo((top - bottom) / 2, 5);
  });

  it('cuando la banda superior es mayor, el tablero baja', () => {
    const f = frameFor(844 / 390, { top: 0.185, bottom: 0 });
    expect(f.targetY).toBeGreaterThan(0);
  });

  it('con bandas el área de juego sigue cabiendo en el hueco libre', () => {
    const top = 0.085;
    const bottom = 0.2;
    const f = frameFor(390 / 844, { top, bottom });
    const freeH = 2 * f.dist * TAN_HALF * (1 - top - bottom);
    expect(freeH).toBeGreaterThanOrEqual(2 * PLAY_HALF_H);
    const freeW = 2 * f.dist * TAN_HALF * (390 / 844);
    expect(freeW).toBeGreaterThanOrEqual(2 * PLAY_HALF_W);
  });

  it('bandas extremas no rompen el encaje (oclusión limitada al 80 %)', () => {
    const f = frameFor(1, { top: 0.6, bottom: 0.6 });
    expect(Number.isFinite(f.dist)).toBe(true);
    expect(f.dist).toBeGreaterThan(0);
  });
});