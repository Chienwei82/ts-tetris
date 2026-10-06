import type { PerspectiveCamera, WebGLRenderer } from 'three';

export interface ViewportOptions {
  /** Tope de `devicePixelRatio` para cuidar las GPUs móviles. */
  maxPixelRatio?: number;
}

/**
 * Viewport a pantalla completa: mantiene el canvas y la cámara sincronizados
 * con la ventana (resize, rotación, barra direcciones de Android vía
 * `visualViewport`) y limita el pixel ratio. Vive fuera de la lógica de escena.
 */
export class ViewportManager {
  private readonly renderer: WebGLRenderer;
  private readonly camera: PerspectiveCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly maxPixelRatio: number;
  private readonly cleanups: Array<() => void> = [];
  private orientationTimer = 0;

  constructor(renderer: WebGLRenderer, camera: PerspectiveCamera, canvas: HTMLCanvasElement, opts: ViewportOptions = {}) {
    this.renderer = renderer;
    this.camera = camera;
    this.canvas = canvas;
    this.maxPixelRatio = opts.maxPixelRatio ?? 2;

    const apply = (): void => this.apply();
    const onOrientation = (): void => {
      this.apply();
      // Android dispara el resize tarde: re-aplicamos tras la rotación.
      window.clearTimeout(this.orientationTimer);
      this.orientationTimer = window.setTimeout(apply, 250);
    };
    const vv = window.visualViewport;
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', onOrientation);
    screen.orientation?.addEventListener('change', onOrientation);
    vv?.addEventListener('resize', apply);
    // El colapso de la barra de direcciones mueve el viewport visual sin resize fiable.
    vv?.addEventListener('scroll', apply);
    this.cleanups.push(() => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', onOrientation);
      screen.orientation?.removeEventListener('change', onOrientation);
      vv?.removeEventListener('resize', apply);
      vv?.removeEventListener('scroll', apply);
      window.clearTimeout(this.orientationTimer);
    });
    this.apply();
  }

  /** Recalcula tamaño del renderer, aspecto de cámara y pixel ratio. */
  apply(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), this.maxPixelRatio);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
  }
}