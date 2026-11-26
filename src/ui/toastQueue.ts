/** Un aviso pendiente con su propia duración. */
export interface ToastEntry {
  message: string;
  ms: number;
}

/**
 * Cola pura de avisos del HUD. Cada entrada conserva la duración con la que se
 * pidió: antes se guardaba solo el texto y la duración del primer aviso se
 * reutilizaba para todos los siguientes (un aviso crítico de 2,2 s alargaba
 * después un aviso rutinario de 1,5 s).
 *
 * No toca DOM ni timers: el HUD consume `next()` y programa el `setTimeout` con
 * la duración devuelta. Así la cola se puede probar sin navegador.
 */
export class ToastQueue {
  private readonly entries: ToastEntry[] = [];

  push(message: string, ms = 1600): void {
    this.entries.push({ message, ms: Math.max(0, ms) });
  }

  next(): ToastEntry | null {
    return this.entries.shift() ?? null;
  }

  clear(): void {
    this.entries.length = 0;
  }

  get size(): number {
    return this.entries.length;
  }
}
