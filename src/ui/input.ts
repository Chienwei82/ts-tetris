import { AutoShift } from './autoShift.js';

/** Acciones abstractas: teclado y táctil producen las mismas; la lógica no conoce el origen. */
export interface InputActions {
  onLeft: () => void;
  onRight: () => void;
  onDown: () => void;
  onRotateCW: () => void;
  onRotateCCW: () => void;
  onHardDrop: () => void;
  onHold: () => void;
  onPause: () => void;
  onRestart: () => void;
  onConfirm: () => void;
  onToggleEffects: () => void;
  onHelp: () => void;
  setSoftDrop: (v: boolean) => void;
}
const DAS = 0.15;
const ARR = 0.045;
export class InputController {
  private readonly actions: InputActions;
  private readonly leftShift = new AutoShift(DAS, ARR);
  private readonly rightShift = new AutoShift(DAS, ARR);
  private readonly stepLeft = (): void => { this.actions.onLeft(); };
  private readonly stepRight = (): void => { this.actions.onRight(); };
  private readonly cleanups: Array<() => void> = [];
  private enabled = true;
  constructor(actions: InputActions) {
    this.actions = actions;
    const onKeyDown = (e: KeyboardEvent): void => this.onKeyDown(e);
    const onKeyUp = (e: KeyboardEvent): void => this.onKeyUp(e);
    const onBlur = (): void => this.releaseAll();
    const onVisibility = (): void => { if (document.hidden) this.releaseAll(); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    // Losing focus must never leave keys "stuck" (endless soft-drop / DAS).
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanups.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }
  /** Silencia el teclado mientras un diálogo modal captura la interacción. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.releaseAll();
  }
  private onKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;
    // Let focused form controls (start-level slider) keep their own arrow/space handling.
    const target = e.target;
    if ((target instanceof HTMLInputElement || target instanceof HTMLSelectElement) &&
        (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'ArrowUp' || e.code === 'Space')) {
      return;
    }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'Space') e.preventDefault();
    const a = this.actions;
    switch (e.code) {
      case 'ArrowLeft':
        if (!e.repeat) { a.onLeft(); this.leftShift.press(); }
        break;
      case 'ArrowRight':
        if (!e.repeat) { a.onRight(); this.rightShift.press(); }
        break;
      case 'ArrowDown':
        if (!e.repeat) { a.setSoftDrop(true); a.onDown(); }
        break;
      case 'ArrowUp': case 'KeyX':
        if (!e.repeat) a.onRotateCW();
        break;
      case 'KeyZ':
        if (!e.repeat) a.onRotateCCW();
        break;
      case 'Space':
        if (!e.repeat) a.onHardDrop();
        break;
      case 'KeyC': case 'ShiftLeft': case 'ShiftRight':
        if (!e.repeat) a.onHold();
        break;
      case 'KeyP': case 'Escape':
        if (!e.repeat) a.onPause();
        break;
      case 'KeyR':
        if (!e.repeat) a.onRestart();
        break;
      case 'KeyE':
        if (!e.repeat) a.onToggleEffects();
        break;
      case 'KeyH':
        if (!e.repeat) a.onHelp();
        break;
      case 'Enter':
        if (!e.repeat) a.onConfirm();
        break;
    }
  }
  private onKeyUp(e: KeyboardEvent): void {
    switch (e.code) {
      case 'ArrowLeft': this.leftShift.release(); break;
      case 'ArrowRight': this.rightShift.release(); break;
      case 'ArrowDown': this.actions.setSoftDrop(false); break;
    }
  }
  /** Call each frame for auto-shift. */
  update(dt: number): void {
    const left = this.leftShift.isHeld();
    const right = this.rightShift.isHeld();
    if (left && !right) this.leftShift.update(dt, this.stepLeft);
    if (right && !left) this.rightShift.update(dt, this.stepRight);
  }
  releaseAll(): void {
    this.leftShift.release();
    this.rightShift.release();
    this.actions.setSoftDrop(false);
  }
  dispose(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    this.releaseAll();
  }
}
