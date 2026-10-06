import type { InputActions } from './input.js';
import { InputController } from './input.js';
import type { ControlMode } from './settings.js';
import { TouchControls } from './touchControls.js';

/**
 * Capa unificada de entrada: el teclado y los controles táctiles producen las
 * mismas `InputActions`, de modo que la lógica de la app no conoce el origen.
 * El teclado sigue activo en modo táctil (híbridos con teclado físico).
 */
export class InputManager {
  private readonly keyboard: InputController;
  private readonly touch: TouchControls;
  private mode: ControlMode = 'desktop';

  constructor(actions: InputActions, touchRoot: HTMLElement) {
    this.keyboard = new InputController(actions);
    this.touch = new TouchControls(touchRoot, actions);
    this.touch.setVisible(false);
  }

  setMode(mode: ControlMode): void {
    this.mode = mode;
    this.touch.setVisible(mode === 'touch');
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
  }

  dispose(): void {
    this.keyboard.dispose();
    this.touch.dispose();
  }
}