import { describe, expect, it } from 'vitest';
import { DEBRIS_CONFIG, DEBRIS_QUALITY } from '../src/render/fx/debrisConfig.js';
import { debrisActive } from '../src/render/fx/debrisMode.js';
import { DebrisSimulation } from '../src/render/fx/debrisSimulation.js';
import type { DebrisBody } from '../src/render/fx/debrisSimulation.js';
import { createFxRandom } from '../src/render/fx/fxRandom.js';
import { isFxQuality } from '../src/render/fx/fxQuality.js';

function bodyAt(sim: DebrisSimulation, index: number): DebrisBody {
  const body = sim.bodies[index];
  if (!body) throw new Error('missing debris body ' + index);
  return body;
}

function newSim(capacity: number, maxActive: number): DebrisSimulation {
  return new DebrisSimulation({
    capacity,
    profile: { ...DEBRIS_QUALITY.high, maxActive },
    random: createFxRandom(1234)
  });
}

describe('debrisActive', () => {
  const base = { effectsOn: true, reducedMotion: false, classicOptIn: false };

  it('activa los escombros por defecto solo en Caos', () => {
    expect(debrisActive({ ...base, mode: 'chaos' })).toBe(true);
    expect(debrisActive({ ...base, mode: 'classic' })).toBe(false);
  });

  it('permite activarlos en Tradicional con opt-in', () => {
    expect(debrisActive({ ...base, mode: 'classic', classicOptIn: true })).toBe(true);
  });

  it('nunca los activa con efectos apagados o movimiento reducido', () => {
    expect(debrisActive({ ...base, mode: 'chaos', effectsOn: false })).toBe(false);
    expect(debrisActive({ ...base, mode: 'chaos', reducedMotion: true })).toBe(false);
    expect(debrisActive({ ...base, mode: 'classic', classicOptIn: true, reducedMotion: true })).toBe(false);
  });
});

describe('DebrisSimulation', () => {
  it('recicla el cuerpo activo más antiguo al llenar el pool', () => {
    const sim = newSim(5, 5);
    for (let i = 1; i <= 5; i++) {
      sim.spawn({ x: 0, y: 0, z: 0, color: i });
    }
    expect(sim.activeCount).toBe(5);

    sim.spawn({ x: 0, y: 0, z: 0, color: 99 });

    expect(sim.activeCount).toBe(5);
    expect(sim.evictedCount).toBe(1);
    const colors = sim.bodies.filter((b) => b.active).map((b) => b.color);
    expect(colors).not.toContain(1);
    expect(colors).toContain(99);
  });

  it('respeta el máximo activo de la calidad aunque el pool sea mayor', () => {
    const sim = newSim(20, 3);
    for (let i = 0; i < 8; i++) {
      sim.spawn({ x: 0, y: 0, z: 0, color: 0xffffff });
    }
    expect(sim.activeCount).toBe(3);
  });

  it('satura el pool con muchos lanzamientos sin superar el límite', () => {
    const sim = newSim(20, 3);
    for (let i = 0; i < 1000; i++) {
      sim.spawn({ x: 0, y: 0, z: 0, color: i });
    }
    expect(sim.activeCount).toBe(3);
    expect(sim.evictedCount).toBe(997);
  });

  it('recorta los cuerpos sobrantes al bajar de calidad', () => {
    const sim = newSim(20, 6);
    for (let i = 0; i < 6; i++) {
      sim.spawn({ x: 0, y: 0, z: 0, color: 0xffffff });
    }
    expect(sim.activeCount).toBe(6);

    sim.setProfile({ ...DEBRIS_QUALITY.low, maxActive: 2 });

    expect(sim.activeCount).toBe(2);
  });

  it('cae, rebota contra la plataforma y termina reposando', () => {
    const sim = newSim(4, 4);
    sim.spawn({ x: 0, y: DEBRIS_CONFIG.floorY + 1, z: 0, color: 0xffffff });
    const body = bodyAt(sim, 0);
    // Fuerza un descenso limpio para medir el rebote sin el impulso aleatorio.
    body.vx = 0;
    body.vy = -8;
    body.vz = 0;

    let bounced = false;
    for (let i = 0; i < 180 && !bounced; i++) {
      sim.update(1 / 60);
      if (body.vy > 0.1) bounced = true;
    }

    expect(bounced).toBe(true);
    const restY = DEBRIS_CONFIG.floorY + (DEBRIS_CONFIG.size * body.scale) / 2;
    expect(body.y).toBeGreaterThanOrEqual(restY - 1e-6);
    expect(body.y).toBeLessThanOrEqual(restY + 0.01);
  });

  it('se desvanece y libera el cuerpo al terminar su vida', () => {
    const sim = new DebrisSimulation({
      capacity: 2,
      profile: { ...DEBRIS_QUALITY.low, maxActive: 2, fadeDelay: 0.05, fadeDurationMin: 0.05, fadeDurationMax: 0.05 },
      random: createFxRandom(7)
    });
    sim.spawn({ x: 0, y: 0, z: 0, color: 0xffffff });
    expect(sim.activeCount).toBe(1);

    for (let i = 0; i < 20; i++) sim.update(1 / 60);

    expect(sim.activeCount).toBe(0);
    expect(bodyAt(sim, 0).alpha).toBe(0);
  });

  it('clear() deja el pool vacío y reutilizable', () => {
    const sim = newSim(8, 8);
    sim.spawn({ x: 0, y: 0, z: 0, color: 0xffffff });
    sim.spawn({ x: 1, y: 0, z: 0, color: 0xffffff });
    sim.clear();
    expect(sim.activeCount).toBe(0);
    sim.spawn({ x: 2, y: 0, z: 0, color: 0xffffff });
    expect(sim.activeCount).toBe(1);
  });
});

describe('configuración de escombros', () => {
  it('mantiene las duraciones de desvanecido dentro de 1-2 s', () => {
    for (const profile of Object.values(DEBRIS_QUALITY)) {
      const min = profile.fadeDelay + profile.fadeDurationMin;
      const max = profile.fadeDelay + profile.fadeDurationMax;
      expect(min).toBeGreaterThanOrEqual(1);
      expect(max).toBeLessThanOrEqual(2.1);
    }
  });

  it('valida la calidad guardada', () => {
    expect(isFxQuality('low')).toBe(true);
    expect(isFxQuality('high')).toBe(true);
    expect(isFxQuality('ultra')).toBe(false);
    expect(isFxQuality(null)).toBe(false);
  });
});
