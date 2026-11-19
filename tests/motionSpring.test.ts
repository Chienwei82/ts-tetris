import { describe, expect, it } from 'vitest';
import { ACTIVE_STIFFNESS, GHOST_STIFFNESS, criticalDamping, isSettled, matchByProximity, stepSpring } from '../src/render/motionSpring.js';
import type { SpringSample } from '../src/render/motionSpring.js';

function sample(x: number, y: number): SpringSample { return { x, y, vx: 0, vy: 0 }; }

describe('motionSpring', () => {
  it('amortiguamiento crítico: no sobrepasa el objetivo (sin confusión visual)', () => {
    const s = sample(0, 0);
    const damping = criticalDamping(ACTIVE_STIFFNESS);
    let maxX = 0;
    for (let i = 0; i < 120; i++) {
      stepSpring(s, 4, 0, 1 / 60, ACTIVE_STIFFNESS, damping);
      maxX = Math.max(maxX, s.x);
    }
    expect(maxX).toBeLessThanOrEqual(4 + 1e-6);
    expect(isSettled(s, 4, 0)).toBe(true);
  });

  it('converge en ~100 ms tras un paso lateral (fluido sin retraso)', () => {
    const s = sample(0, 0);
    const damping = criticalDamping(ACTIVE_STIFFNESS);
    for (let i = 0; i < 6; i++) stepSpring(s, 1, 0, 1 / 60, ACTIVE_STIFFNESS, damping);
    const dist = Math.hypot(s.x - 1, s.y);
    expect(dist).toBeLessThan(0.05); // a 100 ms queda <5 % de la celda
    for (let i = 0; i < 12; i++) stepSpring(s, 1, 0, 1 / 60, ACTIVE_STIFFNESS, damping);
    expect(isSettled(s, 1, 0)).toBe(true); // a 300 ms clavado, sin tembleque
  });

  it('la velocidad se hereda: una ráfaga encadenada fluye sin pararse', () => {
    const s = sample(0, 0);
    const damping = criticalDamping(ACTIVE_STIFFNESS);
    for (let i = 0; i < 3; i++) stepSpring(s, 1, 0, 1 / 60, ACTIVE_STIFFNESS, damping);
    const carried = Math.abs(s.vx);
    expect(carried).toBeGreaterThan(0.1);
    expect(carried).toBeLessThan(60); // sin dispararse
  });

  it('tolera dt grandes y dt cero sin divergir', () => {
    const s = sample(0, 0);
    const damping = criticalDamping(ACTIVE_STIFFNESS);
    stepSpring(s, 1, 0, 0, ACTIVE_STIFFNESS, damping);
    expect(s.x).toBe(0);
    stepSpring(s, 1, 0, 10, ACTIVE_STIFFNESS, damping); // dt topado a 0.1 s
    expect(Number.isFinite(s.x)).toBe(true);
    expect(s.x).toBeGreaterThan(0.9); // avanza sin saltar al objetivo
    expect(s.x).toBeLessThanOrEqual(1 + 1e-6); // pero nunca lo sobrepasa
  });

  it('el fantasma converge más rápido que la pieza', () => {
    const a = sample(0, 0); const g = sample(0, 0);
    for (let i = 0; i < 3; i++) {
      stepSpring(a, 2, 0, 1 / 60, ACTIVE_STIFFNESS, criticalDamping(ACTIVE_STIFFNESS));
      stepSpring(g, 2, 0, 1 / 60, GHOST_STIFFNESS, criticalDamping(GHOST_STIFFNESS));
    }
    expect(Math.abs(g.x - 2)).toBeLessThan(Math.abs(a.x - 2) + 1e-9);
  });

  it('empareja por cercanía: el lateral no cruza bloques', () => {
    const assign = matchByProximity([0, 1, 2, 3], [0, 0, 0, 0], [1, 2, 3, 4], [0, 0, 0, 0]);
    expect(assign).toEqual([0, 1, 2, 3]); // cada bloque al destino más cercano
  });

  it('empareja por cercanía al rotar: sin remolinos', () => {
    // T vertical (x=5,y=8..10 + x=6,y=9) -> horizontal: el centro va al centro.
    const assign = matchByProximity([5, 5, 5, 6], [8, 9, 10, 9], [4, 5, 6, 5], [9, 9, 9, 10]);
    const taken = new Set(assign);
    expect(taken.size).toBe(4); // biyección: ningún destino se repite
    // El bloque del ala (6,9) debe ir a una punta, no al centro.
    expect([0, 2]).toContain(assign[3]);
  });
});
