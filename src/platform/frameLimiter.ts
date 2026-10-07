/**
 * FrameLimiter: descarta frames para no superar un tope de FPS en pantallas más
 * rápidas (juego casual). Módulo puro (sin rAF ni DOM) y testeable: quien llama
 * pasa el timestamp del frame y recibe `true` si toca procesarlo (simular +
 * renderizar). La simulación del juego es dt-based, así que frenar frames no
 * cambia la velocidad de juego.
 */
export class FrameLimiter {
  private readonly minMs: number;
  private readonly epsMs: number;
  private lastMs = Number.NEGATIVE_INFINITY;

  /**
   * `fps`: tope de frames por segundo. `epsMs`: tolerancia al jitter del vsync —
   * sin ella, una pantalla de 60 Hz con frames de 16.4 ms descartaría uno de cada
   * dos y caería a 30 fps.
   */
  constructor(fps: number, epsMs = 1) {
    this.minMs = 1000 / Math.max(1, fps);
    this.epsMs = epsMs;
  }

  /** `nowMs` = timestamp del callback de requestAnimationFrame. Devuelve true si
   *  este frame se procesa. */
  shouldProcess(nowMs: number): boolean {
    if (nowMs - this.lastMs < this.minMs - this.epsMs) return false;
    this.lastMs = nowMs;
    return true;
  }
}
