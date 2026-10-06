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
    shift.update(0.1, () => { steps++; });  // acc = 0.12 → 2 pasos de 0.045
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
    shift.update(0.2, () => { steps++; }); // 0.2 >= DAS → 4 pasos
    expect(steps).toBe(4);
    shift.release();
    shift.press();
    shift.update(0.14, () => { steps++; }); // vuelve a esperar el DAS
    expect(steps).toBe(4);
  });
});