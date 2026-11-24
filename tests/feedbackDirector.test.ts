import { describe, expect, it } from 'vitest';
import { CAMERA_BUDGET_PER_SECOND, FeedbackDirector, MAX_CAMERA_BUDGET } from '../src/ui/feedbackDirector.js';

describe('FeedbackDirector', () => {
  it('bloquea avisos de igual o menor prioridad mientras dura el actual', () => {
    const f = new FeedbackDirector();
    expect(f.allowAnnouncement('clear', 10, 1.8)).toBe(true);
    expect(f.allowAnnouncement('clear', 11, 1.8)).toBe(false);
    expect(f.allowAnnouncement('routine', 11.5, 1.5)).toBe(false);
  });

  it('permite que un evento crítico interrumpa uno menor', () => {
    const f = new FeedbackDirector();
    expect(f.allowAnnouncement('clear', 4, 2)).toBe(true);
    expect(f.allowAnnouncement('critical', 4.2, 1)).toBe(true);
    expect(f.allowAnnouncement('combo', 4.3, 1)).toBe(false);
  });

  it('vuelve a admitir avisos cuando termina la reserva', () => {
    const f = new FeedbackDirector();
    expect(f.allowAnnouncement('combo', 0, 1)).toBe(true);
    expect(f.allowAnnouncement('clear', 0.9, 1)).toBe(false);
    expect(f.allowAnnouncement('clear', 1.01, 1)).toBe(true);
  });

  it('limita el trauma acumulado y lo recupera con el tiempo', () => {
    const f = new FeedbackDirector();
    expect(f.cameraAllowance(0.8, 1)).toBeCloseTo(0.8);
    expect(f.cameraAllowance(0.8, 1)).toBeCloseTo(MAX_CAMERA_BUDGET - 0.8);
    expect(f.cameraAllowance(0.5, 1.5)).toBeCloseTo(0.5);
    expect(f.cameraAllowance(1, 2)).toBeCloseTo(1);
    expect(f.cameraAllowance(0.5, 2)).toBeCloseTo(0.1);
    expect(f.cameraAllowance(0.5, 2)).toBe(0);
    expect(f.cameraAllowance(0, 2.5)).toBe(0);
    expect(MAX_CAMERA_BUDGET / CAMERA_BUDGET_PER_SECOND).toBeLessThan(1);
  });

  it('descarta fogonazos demasiado próximos y reset limpia los presupuestos', () => {
    const f = new FeedbackDirector();
    expect(f.allowFlash(1)).toBe(true);
    expect(f.allowFlash(1.1)).toBe(false);
    expect(f.allowFlash(1.2)).toBe(true);
    f.cameraAllowance(MAX_CAMERA_BUDGET, 2);
    f.reset();
    expect(f.allowAnnouncement('critical', 2, 1)).toBe(true);
    expect(f.cameraAllowance(MAX_CAMERA_BUDGET, 2)).toBeCloseTo(MAX_CAMERA_BUDGET);
  });
});
