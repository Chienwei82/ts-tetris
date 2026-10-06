/**
 * Auto-repetición DAS/ARR para una dirección mantenida: paso inmediato al
 * pulsar (lo hace quien llama), pausa `das` y luego un paso cada `arr`.
 * Compartido por teclado y botones táctiles para que se sientan igual.
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

  /** Llama a `step` a ritmo ARR una vez transcurrido el DAS. */
  update(dt: number, step: () => void): void {
    if (!this.held) return;
    this.elapsed += dt;
    if (this.elapsed < this.das) return;
    this.acc += dt;
    while (this.acc >= this.arr) { this.acc -= this.arr; step(); }
  }
}