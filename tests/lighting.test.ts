import { describe, expect, it } from 'vitest';
import {
  HEMI_GRADE,
  KEY_GRADE,
  MIN_FILL_INTENSITY,
  MIN_HEMI_INTENSITY,
  MIN_KEY_INTENSITY,
  REFERENCE_LOOK,
  gradeSceneLighting,
  lightingOf,
  mixHex
} from '../src/render/sceneLighting.js';
import type { SceneLighting } from '../src/render/sceneLighting.js';
import type { ScenarioLook } from '../src/render/scenarios/scenario.js';
import { cityNight } from '../src/render/scenarios/cityNight.js';
import { deepSea } from '../src/render/scenarios/deepSea.js';
import { forest } from '../src/render/scenarios/forest.js';
import { space } from '../src/render/scenarios/space.js';

/** Intensidades finales de referencia del diorama (tema Pradera). */
const REF_HEMI = REFERENCE_LOOK.hemi.intensity * HEMI_GRADE;
const REF_KEY = REFERENCE_LOOK.key.intensity * KEY_GRADE;
const REF_FILL = REFERENCE_LOOK.fill.intensity;

/** Distancia de color (suma de canales) para comprobar acercamientos al tinte base. */
function colorDistance(a: number, b: number): number {
  return (
    Math.abs(((a >> 16) & 0xff) - ((b >> 16) & 0xff)) +
    Math.abs(((a >> 8) & 0xff) - ((b >> 8) & 0xff)) +
    Math.abs((a & 0xff) - (b & 0xff))
  );
}

const SCENARIOS: Array<{ look: ScenarioLook }> = [forest, cityNight, space, deepSea];

describe('gradación de luz de los fondos', () => {
  it('deja intacto el look de referencia (el día clásico no cambia)', () => {
    const graded = gradeSceneLighting(REFERENCE_LOOK);
    // Colores y niebla idénticos; intensidades = las del tema clásico ya graduado.
    expect(graded.hemi.sky).toBe(REFERENCE_LOOK.hemi.sky);
    expect(graded.hemi.ground).toBe(REFERENCE_LOOK.hemi.ground);
    expect(graded.key.color).toBe(REFERENCE_LOOK.key.color);
    expect(graded.fill).toEqual(REFERENCE_LOOK.fill);
    expect(graded.ground).toBe(REFERENCE_LOOK.ground);
    expect(graded.fog).toEqual(REFERENCE_LOOK.fog);
    expect(graded.hemi.intensity).toBeCloseTo(REF_HEMI, 6);
    expect(graded.key.intensity).toBeCloseTo(REF_KEY, 6);
  });

  it('mantiene el tablero legible con cualquier escenario (±25 % del día)', () => {
    for (const s of SCENARIOS) {
      const graded = gradeSceneLighting(lightingOf(s.look));
      expect(graded.hemi.intensity).toBeGreaterThanOrEqual(REF_HEMI * 0.74);
      expect(graded.hemi.intensity).toBeLessThanOrEqual(REF_HEMI * 1.26);
      expect(graded.key.intensity).toBeGreaterThanOrEqual(REF_KEY * 0.74);
      expect(graded.key.intensity).toBeLessThanOrEqual(REF_KEY * 1.26);
      expect(graded.fill.intensity).toBeGreaterThanOrEqual(REF_FILL * 0.74);
      expect(graded.fill.intensity).toBeLessThanOrEqual(REF_FILL * 1.26);
    }
  });

  it('nunca baja de los suelos de legibilidad, ni con un look negro', () => {
    const pitchBlack: SceneLighting = {
      hemi: { sky: 0x000000, ground: 0x000000, intensity: 0 },
      key: { color: 0x000000, intensity: 0 },
      fill: { color: 0x000000, intensity: 0 },
      ground: 0x000000,
      fog: { near: 5, far: 40 }
    };
    const graded = gradeSceneLighting(pitchBlack);
    expect(graded.hemi.intensity).toBe(MIN_HEMI_INTENSITY);
    expect(graded.key.intensity).toBe(MIN_KEY_INTENSITY);
    expect(graded.fill.intensity).toBe(MIN_FILL_INTENSITY);
  });

  it('acerca los colores de luz al tinte base sin borrar el ambiente', () => {
    for (const s of SCENARIOS) {
      const raw = lightingOf(s.look);
      const graded = gradeSceneLighting(raw);
      // El color graduado está más cerca de la referencia que el original…
      expect(colorDistance(graded.hemi.sky, REFERENCE_LOOK.hemi.sky))
        .toBeLessThan(colorDistance(raw.hemi.sky, REFERENCE_LOOK.hemi.sky));
      expect(colorDistance(graded.key.color, REFERENCE_LOOK.key.color))
        .toBeLessThanOrEqual(colorDistance(raw.key.color, REFERENCE_LOOK.key.color));
      // …pero conserva parte del tinte del escenario (no es la referencia pura).
      expect(graded.hemi.sky).not.toBe(REFERENCE_LOOK.hemi.sky);
    }
  });

  it('acerca el suelo al papel para que no se vaya a negro', () => {
    for (const s of SCENARIOS) {
      const raw = lightingOf(s.look);
      const graded = gradeSceneLighting(raw);
      expect(colorDistance(graded.ground, REFERENCE_LOOK.ground))
        .toBeLessThan(colorDistance(raw.ground, REFERENCE_LOOK.ground));
      // Sigue siendo un suelo con ambiente, nunca ni negro ni blanco puro.
      expect(graded.ground).not.toBe(0x000000);
      expect(graded.ground).not.toBe(0xffffff);
    }
  });

  it('no deja que la niebla empiece delante del plano del tablero', () => {
    for (const s of SCENARIOS) {
      const raw = lightingOf(s.look);
      const graded = gradeSceneLighting(raw);
      expect(graded.fog.near).toBe(REFERENCE_LOOK.fog.near);
      expect(graded.fog.far).toBe(raw.fog.far);
      expect(graded.fog.far).toBeGreaterThan(graded.fog.near);
    }
  });

  it('es monótona: más intensidad de origen, más luz final', () => {
    const base = REFERENCE_LOOK;
    const dim = gradeSceneLighting({ ...base, key: { ...base.key, intensity: 0.3 } });
    const mid = gradeSceneLighting(base);
    const bright = gradeSceneLighting({ ...base, key: { ...base.key, intensity: 3 } });
    expect(dim.key.intensity).toBeLessThan(mid.key.intensity);
    expect(mid.key.intensity).toBeLessThan(bright.key.intensity);
    expect(dim.hemi.intensity).toBeLessThanOrEqual(mid.hemi.intensity);
  });

  it('mixHex interpola los extremos y el punto medio', () => {
    expect(mixHex(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mixHex(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mixHex(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mixHex(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
  });
});
