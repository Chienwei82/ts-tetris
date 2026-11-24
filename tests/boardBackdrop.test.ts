import { describe, expect, it } from 'vitest';
import { DEFAULT_PANEL_OPACITY, OPAQUE_PANEL, panelOpacityFor } from '../src/render/boardBackdrop.js';

const STAGES = ['pradera', 'forest', 'cityNight', 'space', 'deepSea'] as const;

describe('opacidad de la hoja del tablero', () => {
  it('sin efectos la hoja es opaca en cualquier escenario', () => {
    for (const stage of [...STAGES, null, 'desconocido']) {
      expect(panelOpacityFor(stage, false)).toBe(OPAQUE_PANEL);
    }
  });

  it('con efectos cada escenario conocido es translúcido pero legible', () => {
    for (const stage of STAGES) {
      const value = panelOpacityFor(stage, true);
      expect(value).toBeGreaterThanOrEqual(0.3);
      expect(value).toBeLessThan(0.7);
    }
  });

  it('los escenarios oscuros son más opacos que la pradera', () => {
    const prairie = panelOpacityFor('pradera', true);
    expect(panelOpacityFor('forest', true)).toBeGreaterThan(prairie);
    expect(panelOpacityFor('cityNight', true)).toBeGreaterThan(panelOpacityFor('forest', true));
    expect(panelOpacityFor('space', true)).toBeGreaterThan(panelOpacityFor('cityNight', true));
    expect(panelOpacityFor('deepSea', true)).toBeGreaterThan(prairie);
  });

  it('usa el valor por defecto si no hay escenario o no se conoce', () => {
    expect(panelOpacityFor(null, true)).toBe(DEFAULT_PANEL_OPACITY);
    expect(panelOpacityFor(undefined, true)).toBe(DEFAULT_PANEL_OPACITY);
    expect(panelOpacityFor('lava', true)).toBe(DEFAULT_PANEL_OPACITY);
  });

  it('el valor por defecto es translúcido y está en el rango esperado', () => {
    expect(DEFAULT_PANEL_OPACITY).toBeGreaterThan(0.3);
    expect(DEFAULT_PANEL_OPACITY).toBeLessThan(OPAQUE_PANEL);
  });
});
