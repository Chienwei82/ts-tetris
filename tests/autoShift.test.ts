import { describe, expect, it } from 'vitest';
import { AutoShift } from '../src/ui/autoShift.js';

describe('AutoShift', () => {
  it('no repite antes de que transcurra el DAS', () => {
    const shift = new AutoShift(0.15, 0.045);
    let steps = 0;
    shift.press();
    shift.update(0.14, () => { steps++; });
    shift.update(0.01, () => { steps++; });
    expect(steps).toBe(0);
  });

  it('repite con el ritmo ARR una vez pasado el DAS', () => {
    const shift = new AutoShift(0.15, 0.045);
    let steps = 0;
    shift.press();
    shift.update(0.14, () => { steps++; }); // DAS acumulado: 0.14
    shift.update(0.02, () => { steps++; }); // 0.16 >= DAS; acc = 0.02
    expect(steps).toBe(0);
    shift.update(0.1, () => { steps++; });  // acc = 0.09 (topado a 2×ARR) → 2 pasos
    expect(steps).toBe(2);
  });

  it('no dispara cuando la dirección está suelta', () => {
    const shift = new AutoShift(0.15, 0.045);
    let steps = 0;
    shift.update(1, () => { steps++; });
    shift.press();
    shift.release();
    shift.update(1, () => { steps++; });
    expect(steps).toBe(0);
    expect(shift.isHeld()).toBe(false);
  });

  it('reinicia los temporizadores al volver a pulsar', () => {
    const shift = new AutoShift(0.15, 0.045);
    let steps = 0;
    shift.press();
    // Deuda topada a 2×ARR por frame: cada llamada de 0.2 s da 2 pasos (no 4
    // de golpe): la cadencia real se alcanza llamada a llamada, sin ráfagas.
    shift.update(0.2, () => { steps++; });
    expect(steps).toBe(2);
    shift.update(0.2, () => { steps++; });
    expect(steps).toBe(4);
    shift.release();
    shift.press();
    shift.update(0.14, () => { steps++; }); // vuelve a esperar el DAS
    expect(steps).toBe(4);
  });

  it('topa el dt: un tirón no dispara una ráfaga de pasos atrasados', () => {
    const shift = new AutoShift(0.15, 0.045);
    let steps = 0;
    shift.press();
    shift.update(10, () => { steps++; }); // pestaña oculta: dt topado a 0.25 s
    // 0.25 s de deuda → como máximo ceil(0.25/0.045)+1 = 7 pasos, no cientos.
    expect(steps).toBeLessThanOrEqual(7);
    expect(steps).toBeGreaterThan(0);
  });

  it('escala el ARR (lluvia del Caos) sin tocar el DAS', () => {
    const shift = new AutoShift(0.15, 0.045);
    let steps = 0;
    shift.press();
    shift.update(0.14, () => { steps++; }, 0.55); // aún en DAS: nada
    expect(steps).toBe(0);
    shift.update(0.02, () => { steps++; }, 0.55); // DAS cumplido, ARR×0.55
    expect(steps).toBe(0); // acc = 0.02 < 0.02475
    shift.update(0.01, () => { steps++; }, 0.55); // acc = 0.03 ≥ 0.02475
    expect(steps).toBe(1);
  });
});