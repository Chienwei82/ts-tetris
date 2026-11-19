/**
 * Auto-repetición DAS/ARR para una dirección mantenida: paso inmediato al
 * pulsar (lo hace quien llama), pausa `das` y luego un paso cada `arr`.
 * Compartido por teclado y botones táctiles para que se sientan igual.
 *
 * Detalles de fluidez:
 * - El `dt` se topa (pestaña oculta, tirones) para no acumular ráfagas.
 * - Los pasos por `update()` se limitan a los que caben en el tiempo real
 *   transcurrido (`ceil(dt/arr)`), con un extra de tolerancia para no perder
 *   ritmo por redondeo: cadencia sostenida sí, ráfaga atrasada no.
 */
export class AutoShift {
  private held = false;
  private elapsed = 0;
  private acc = 0;
  private readonly das: number;
  private readonly arr: number;

  constructor(das: number, arr: number) {
    this.das = das;
    this.arr = arr;
  }

  press(): void { this.held = true; this.elapsed = 0; this.acc = 0; }
  release(): void { this.held = false; this.elapsed = 0; this.acc = 0; }
  isHeld(): boolean { return this.held; }

  /**
   * Llama a `step` a ritmo ARR una vez transcurrido el DAS. `arrScale`
   * acelera la repetición (lluvia del Caos: 0.55) sin tocar el DAS ni el
   * tamaño del paso (siempre 1 celda).
   */
  update(dt: number, step: () => void, arrScale = 1): void {
    if (!this.held) return;
    const arr = Math.max(0.008, this.arr * (arrScale > 0 ? arrScale : 1));
    const safeDt = Math.max(0, Math.min(dt, 0.25));
    this.elapsed += safeDt;
    if (this.elapsed < this.das) return;
    this.acc = Math.min(this.acc + safeDt, arr * 2);
    // Como máximo los pasos que caben en este frame (+1 de tolerancia): si el
    // juego se congeló, no se dispara la deuda acumulada de golpe.
    const budget = Math.max(1, Math.ceil(safeDt / arr) + 1);
    let steps = 0;
    while (this.acc >= arr && steps < budget) { this.acc -= arr; steps++; step(); }
    if (steps >= budget) this.acc = Math.min(this.acc, arr);
  }
}