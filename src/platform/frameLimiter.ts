/**
 * FrameLimiter: decide qué frames de `requestAnimationFrame` se simulan y
 * renderizan para no superar un tope de FPS (juego casual). Módulo puro (sin
 * rAF ni DOM) y testeable: quien llama pasa el timestamp del frame y recibe
 * `true` si toca procesarlo.
 *
 * El tiempo sobrante se ACUMULA en vez de descartarse. Con el descarte puro,
 * una pantalla de 75 Hz (13,33 ms por frame) no alcanzaba el umbral de 16,67 ms
 * y procesaba uno de cada dos frames (~37,5 fps): el juego se sentía a tirones.
 * Acumulando, la cadencia media es el tope configurado (~60 fps) sea cual sea el
 * refresco, con un frame saltado de vez en cuando en lugar de una caída a la
 * mitad.
 *
 * La simulación es dt-based, así que frenar frames no cambia la velocidad de
 * juego; la entrada sí debe actualizarse en cada rAF (ver `app.animate`).
 */
export class FrameLimiter {
  private readonly minMs: number;
  private readonly epsMs: number;
  /** Tiempo pendiente de consumir por la cadencia objetivo. */
  private pendingMs = 0;
  private lastMs: number | null = null;

  /**
   * `fps`: tope de frames por segundo. `epsMs`: tolerancia al jitter del vsync —
   * sin ella, una pantalla de 60 Hz con frames de 16,4 ms descartaría uno de cada
   * dos y caería a 30 fps.
   */
  constructor(fps: number, epsMs = 1) {
    this.minMs = 1000 / Math.max(1, fps);
    this.epsMs = epsMs;
  }

  /** `nowMs` = timestamp del callback de requestAnimationFrame. Devuelve true si
   *  este frame se procesa. */
  shouldProcess(nowMs: number): boolean {
    // Primer frame: procesar siempre y arrancar el reloj.
    if (this.lastMs === null) {
      this.lastMs = nowMs;
      return true;
    }
    // Timestamps repetidos o desordenados no deben acumular deuda.
    if (!(nowMs > this.lastMs)) return false;
    const dt = nowMs - this.lastMs;
    this.lastMs = nowMs;
    // Tras una pestaña oculta o un parón largo no se acumulan ráfagas de frames:
    // se empieza de cero con un único frame pendiente.
    if (dt > this.minMs * 4) {
      this.pendingMs = this.minMs;
    } else {
      // El tope de deuda evita que un jitter puntual genere dos frames seguidos.
      this.pendingMs = Math.min(this.pendingMs + dt, this.minMs * 2);
    }
    if (this.pendingMs < this.minMs - this.epsMs) return false;
    this.pendingMs = Math.max(0, this.pendingMs - this.minMs);
    return true;
  }
}
