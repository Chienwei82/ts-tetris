import { describe, expect, it } from 'vitest';
import { scenarioForLevel } from '../src/render/scenarios/levelMapping.js';
import { ScenarioRegistry } from '../src/render/scenarios/scenarioRegistry.js';
import type { Scenario } from '../src/render/scenarios/scenario.js';

/** Escenarios de prueba con la misma progresión que los reales (3,5,7,9). */
const SAMPLE = [
  { id: 'forest', minLevel: 3 },
  { id: 'cityNight', minLevel: 5 },
  { id: 'space', minLevel: 7 },
  { id: 'deepSea', minLevel: 9 },
];

describe('selección de escenario por nivel', () => {
  it('no elige escenario antes del primer desbloqueo', () => {
    expect(scenarioForLevel(SAMPLE, 1, 5)).toBeNull();
    expect(scenarioForLevel(SAMPLE, 2, 5)).toBeNull();
  });

  it('desbloquea el primer escenario en su minLevel', () => {
    expect(scenarioForLevel(SAMPLE, 3, 5)).toBe('forest');
    expect(scenarioForLevel(SAMPLE, 5, 5)).toBe('forest');
  });

  it('rota cada levelsPerScenario niveles respetando los desbloqueados', () => {
    expect(scenarioForLevel(SAMPLE, 6, 5)).toBe('cityNight'); // step 1
    expect(scenarioForLevel(SAMPLE, 11, 5)).toBe('space'); // step 2 (3 desbloqueados)
    expect(scenarioForLevel(SAMPLE, 16, 5)).toBe('deepSea'); // step 3 (4 desbloqueados)
    expect(scenarioForLevel(SAMPLE, 21, 5)).toBe('forest'); // step 4 -> ciclo
  });

  it('con levelsPerScenario=1 rota más rápido', () => {
    // Con periodo 1 el "step" avanza cada nivel; una vez desbloqueados los 4,
    // rota en ciclo forest → cityNight → space → deepSea.
    expect(scenarioForLevel(SAMPLE, 9, 1)).toBe('forest');
    expect(scenarioForLevel(SAMPLE, 10, 1)).toBe('cityNight');
    expect(scenarioForLevel(SAMPLE, 11, 1)).toBe('space');
    expect(scenarioForLevel(SAMPLE, 12, 1)).toBe('deepSea');
  });

  it('es independiente del orden de entrada (ordena por minLevel)', () => {
    const shuffled = [SAMPLE[2]!, SAMPLE[0]!, SAMPLE[3]!, SAMPLE[1]!];
    expect(scenarioForLevel(shuffled, 6, 5)).toBe('cityNight');
    expect(scenarioForLevel(shuffled, 11, 5)).toBe('space');
  });

  it('tolerar levelsPerScenario inválido (<=0) sin romper', () => {
    expect(scenarioForLevel(SAMPLE, 3, 0)).toBe('forest');
  });
});

describe('ScenarioRegistry', () => {
  const stub = (id: string, minLevel: number): Scenario => ({
    id,
    name: id,
    icon: '',
    minLevel,
    look: {} as Scenario['look'],
    build: () => {},
    update: () => {},
    release: () => {},
  });

  it('registra y recupera escenarios', () => {
    const reg = new ScenarioRegistry();
    reg.register(stub('a', 1));
    reg.register(stub('b', 2));
    expect(reg.get('a')?.id).toBe('a');
    expect(reg.has('b')).toBe(true);
    expect(reg.has('z')).toBe(false);
    expect(reg.all()).toHaveLength(2);
    expect(reg.ids()).toEqual(['a', 'b']);
  });

  it('rechaza ids duplicados', () => {
    const reg = new ScenarioRegistry();
    reg.register(stub('dup', 1));
    expect(() => reg.register(stub('dup', 2))).toThrow(/duplicado/i);
  });
});
