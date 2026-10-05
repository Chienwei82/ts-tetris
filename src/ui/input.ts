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
  setSoftDrop: (v: boolean) => void;
}
const DAS = 0.15;
const ARR = 0.045;
export class InputController {
  leftHeld = false; rightHeld = false;
  private leftT = 0; private rightT = 0;
  private leftAcc = 0; private rightAcc = 0;
  private readonly actions: InputActions;
  constructor(actions: InputActions) {
    this.actions = actions;
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
  }
  private onKeyDown(e: KeyboardEvent): void {
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
        if (!e.repeat) { a.onLeft(); this.leftHeld = true; this.leftT = 0; this.leftAcc = 0; }
        break;
      case 'ArrowRight':
        if (!e.repeat) { a.onRight(); this.rightHeld = true; this.rightT = 0; this.rightAcc = 0; }
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
      case 'Enter':
        if (!e.repeat) a.onConfirm();
        break;
    }
  }
  private onKeyUp(e: KeyboardEvent): void {
    switch (e.code) {
      case 'ArrowLeft': this.leftHeld = false; break;
      case 'ArrowRight': this.rightHeld = false; break;
      case 'ArrowDown': this.actions.setSoftDrop(false); break;
    }
  }
  /** Call each frame for auto-shift. */
  update(dt: number): void {
    if (this.leftHeld && !this.rightHeld) {
      this.leftT += dt;
      if (this.leftT >= DAS) { this.leftAcc += dt; while (this.leftAcc >= ARR) { this.leftAcc -= ARR; this.actions.onLeft(); } }
    } else this.leftAcc = 0;
    if (this.rightHeld && !this.leftHeld) {
      this.rightT += dt;
      if (this.rightT >= DAS) { this.rightAcc += dt; while (this.rightAcc >= ARR) { this.rightAcc -= ARR; this.actions.onRight(); } }
    } else this.rightAcc = 0;
  }
  releaseAll(): void { this.leftHeld = false; this.rightHeld = false; this.actions.setSoftDrop(false); this.leftT = 0; this.rightT = 0; }
}
