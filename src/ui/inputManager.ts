import type { InputActions } from './input.js';
import { InputController } from './input.js';
import { PieceDrag } from './pieceDrag.js';
import type { ControlMode } from './settings.js';
import { TouchControls } from './touchControls.js';

/**
 * Capa unificada de entrada: el teclado, los botones táctiles y el arrastre de
 * la pieza sobre el canvas producen las mismas `InputActions`, de modo que la
 * lógica de la app no conoce el origen. El teclado sigue activo en modo táctil
 * (híbridos con teclado físico).
 */
export class InputManager {
  private readonly keyboard: InputController;
  private readonly touch: TouchControls;
  private readonly pieceDrag: PieceDrag;
  private mode: ControlMode = 'desktop';

  constructor(
    actions: InputActions,
    touchRoot: HTMLElement,
    dragRoot: HTMLElement,
    cellPx: () => { x: number; y: number }
  ) {
    this.keyboard = new InputController(actions);
    this.touch = new TouchControls(touchRoot, actions);
    this.touch.setVisible(false);
    this.pieceDrag = new PieceDrag(dragRoot, actions, cellPx);
    this.pieceDrag.setEnabled(false);
  }

  setMode(mode: ControlMode): void {
    this.mode = mode;
    this.touch.setVisible(mode === 'touch');
    this.pieceDrag.setEnabled(mode === 'touch');
    this.releaseAll();
  }

  getMode(): ControlMode { return this.mode; }

  /** Silencia el teclado mientras un diálogo modal captura la interacción. */
  setEnabled(enabled: boolean): void { this.keyboard.setEnabled(enabled); }

  /** Call each frame for auto-shift. */
  update(dt: number): void {
    this.keyboard.update(dt);
    if (this.mode === 'touch') this.touch.update(dt);
  }

  releaseAll(): void {
    this.keyboard.releaseAll();
    this.touch.releaseAll();
    this.pieceDrag.cancel();
  }

  dispose(): void {
    this.keyboard.dispose();
    this.touch.dispose();
    this.pieceDrag.dispose();
  }
}