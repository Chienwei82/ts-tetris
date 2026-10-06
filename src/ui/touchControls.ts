import type { InputActions } from './input.js';
import { AutoShift } from './autoShift.js';

/** Mismos DAS/ARR que el teclado para que los botones "se sientan" igual. */
const DAS = 0.15;
const ARR = 0.045;

function find(root: HTMLElement, id: string): HTMLElement {
  const e = root.querySelector<HTMLElement>('#' + id);
  if (!e) throw new Error('missing #' + id);
  return e;
}

/**
 * Controles táctiles superpuestos al canvas (DOM, fuera de la escena three.js):
 * solo botones ←/→ para desplazar la pieza (arriba/abajo no tienen sentido en
 * este juego) y botones de acción. Pointer Events con multitáctil real vía
 * `setPointerCapture`: cada dedo controla su botón de forma independiente.
 */
export class TouchControls {
  private readonly root: HTMLElement;
  private readonly actions: InputActions;
  private readonly leftShift = new AutoShift(DAS, ARR);
  private readonly rightShift = new AutoShift(DAS, ARR);
  private readonly stepLeft = (): void => { this.actions.onLeft(); };
  private readonly stepRight = (): void => { this.actions.onRight(); };
  private readonly cleanups: Array<() => void> = [];

  constructor(root: HTMLElement, actions: InputActions) {
    this.root = root;
    this.actions = actions;
    this.bindHold('tc-left', () => actions.onLeft(), this.leftShift);
    this.bindHold('tc-right', () => actions.onRight(), this.rightShift);
    this.bindButton('tc-ccw', () => actions.onRotateCCW());
    this.bindButton('tc-cw', () => actions.onRotateCW());
    this.bindButton('tc-drop', () => actions.onHardDrop());
    this.bindButton('tc-hold', () => actions.onHold());
  }

  /** Muestra u oculta los controles (ocultos en modo escritorio). */
  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
    this.root.setAttribute('aria-hidden', String(!visible));
    if (!visible) this.releaseAll();
  }

  /** Call each frame for button auto-shift. */
  update(dt: number): void {
    this.leftShift.update(dt, this.stepLeft);
    this.rightShift.update(dt, this.stepRight);
  }

  releaseAll(): void {
    this.leftShift.release();
    this.rightShift.release();
  }

  dispose(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    this.releaseAll();
  }

  private bindButton(id: string, onDown: () => void): void {
    const btn = find(this.root, id);
    const down = (e: PointerEvent): void => {
      e.preventDefault();
      // Captura el puntero: cada dedo controla su botón de forma independiente.
      btn.setPointerCapture(e.pointerId);
      btn.classList.add('active');
      onDown();
    };
    const up = (e: PointerEvent): void => {
      e.preventDefault();
      btn.classList.remove('active');
      if (btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);
    };
    const lost = (): void => btn.classList.remove('active');
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', lost);
    this.cleanups.push(() => {
      btn.removeEventListener('pointerdown', down);
      btn.removeEventListener('pointerup', up);
      btn.removeEventListener('pointercancel', up);
      btn.removeEventListener('lostpointercapture', lost);
    });
  }

  /** Botón de movimiento con auto-repetición DAS/ARR (como el teclado). */
  private bindHold(id: string, onStep: () => void, shift: AutoShift): void {
    const btn = find(this.root, id);
    const down = (e: PointerEvent): void => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      btn.classList.add('active');
      onStep();
      shift.press();
    };
    const up = (e: PointerEvent): void => {
      e.preventDefault();
      btn.classList.remove('active');
      shift.release();
      if (btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);
    };
    const lost = (): void => { btn.classList.remove('active'); shift.release(); };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', lost);
    this.cleanups.push(() => {
      btn.removeEventListener('pointerdown', down);
      btn.removeEventListener('pointerup', up);
      btn.removeEventListener('pointercancel', up);
      btn.removeEventListener('lostpointercapture', lost);
    });
  }
}