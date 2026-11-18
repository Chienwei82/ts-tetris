import { describe, expect, it } from 'vitest';
import { DEBRIS_QUALITY } from '../src/render/fx/debrisConfig.js';
import { DebrisSimulation } from '../src/render/fx/debrisSimulation.js';
import { createFxRandom } from '../src/render/fx/fxRandom.js';

function newSim(): DebrisSimulation {
  return new DebrisSimulation({
    capacity: 4,
    profile: { ...DEBRIS_QUALITY.high, maxActive: 4 },
    random: createFxRandom(77)
  });
}

describe('impactos de escombros', () => {
  it('no emite impactos mientras el cubo va por el aire', () => {
    const sim = newSim();
    sim.spawn({ x: 0, y: 0, z: 0, color: 0xffffff });
    for (let i = 0; i < 8; i++) sim.update(1 / 60);
    expect(sim.pendingImpacts).toBe(0);
  });

  it('registra el golpe contra la plataforma con su fuerza', () => {
    const sim = newSim();
    sim.spawn({ x: 0, y: 0, z: 0, color: 0xffffff });
    for (let i = 0; i < 400; i++) sim.update(1 / 60);
    expect(sim.pendingImpacts).toBeGreaterThan(0);
    expect(sim.impacts[0]?.strength).toBeGreaterThan(0);
    sim.clearImpacts();
    expect(sim.pendingImpacts).toBe(0);
  });

  it('clear() también descarta los impactos pendientes', () => {
    const sim = newSim();
    sim.spawn({ x: 0, y: 0, z: 0, color: 0xffffff });
    for (let i = 0; i < 400; i++) sim.update(1 / 60);
    expect(sim.pendingImpacts).toBeGreaterThan(0);
    sim.clear();
    expect(sim.pendingImpacts).toBe(0);
  });
});
