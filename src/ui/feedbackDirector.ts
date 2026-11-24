/**
 * Coordina la presentación de eventos para que no compitan entre sí.
 * Es lógica pura: el tiempo se inyecta y no depende del DOM, Three.js ni el motor.
 */
export type FeedbackPriority = 'routine' | 'clear' | 'combo' | 'level' | 'critical';

const PRIORITY_RANK: Record<FeedbackPriority, number> = {
  routine: 1,
  clear: 2,
  combo: 3,
  level: 4,
  critical: 5,
};

/** Trauma máximo que la cámara puede acumular en una ventana corta. */
export const MAX_CAMERA_BUDGET = 1.1;
/** Recuperación del presupuesto de cámara por segundo. */
export const CAMERA_BUDGET_PER_SECOND = 2.2;

export class FeedbackDirector {
  private announceUntil = 0;
  private announceRank = 0;
  private cameraBudget = MAX_CAMERA_BUDGET;
  private lastCameraAt: number | null = null;
  private lastFlashAt = Number.NEGATIVE_INFINITY;

  reset(): void {
    this.announceUntil = 0;
    this.announceRank = 0;
    this.cameraBudget = MAX_CAMERA_BUDGET;
    this.lastCameraAt = null;
    this.lastFlashAt = Number.NEGATIVE_INFINITY;
  }

  /**
   * Reserva el canal de anuncios durante `duration`. Un evento de igual o menor
   * prioridad no puede solaparse; uno superior sí interrumpe la reserva.
   */
  allowAnnouncement(priority: FeedbackPriority, now: number, duration: number): boolean {
    const rank = PRIORITY_RANK[priority];
    if (now < this.announceUntil && rank <= this.announceRank) return false;
    this.announceUntil = now + Math.max(0, duration);
    this.announceRank = rank;
    return true;
  }

  /**
   * Concede trauma de cámara dentro de un presupuesto acumulativo. Los impactos
   * pequeños siguen sintiéndose, pero una cadena de eventos no satura la vista.
   */
  cameraAllowance(requested: number, now: number): number {
    if (this.lastCameraAt !== null) {
      const elapsed = Math.max(0, now - this.lastCameraAt);
      this.cameraBudget = Math.min(
        MAX_CAMERA_BUDGET,
        this.cameraBudget + elapsed * CAMERA_BUDGET_PER_SECOND
      );
    }
    this.lastCameraAt = now;
    const granted = Math.min(Math.max(0, requested), this.cameraBudget);
    this.cameraBudget = Math.max(0, this.cameraBudget - granted);
    return granted;
  }

  /** Evita dos fogonazos casi simultáneos; el segundo se descarta. */
  allowFlash(now: number, minGap = 0.16): boolean {
    if (now - this.lastFlashAt < minGap) return false;
    this.lastFlashAt = now;
    return true;
  }
}
