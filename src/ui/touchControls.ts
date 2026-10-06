import type { InputActions } from './input.js';
import { AutoShift } from './autoShift.js';

/** Mismos DAS/ARR que el teclado para que el joystick "se sienta" igual. */
const DAS = 0.15;
const ARR = 0.045;
/** Zona muerta del joystick como fracción del radio. */
const DEADZONE = 0.3;
/** Umbral vertical (fracción del radio) para caída suave. */
const SOFT_ZONE = 0.45;
/** Flick hacia arriba (fracción del radio negativa) = caída instantánea. */
const FLICK_UP = -0.6;
/** Recorrido máximo del pomo como fracción del joystick. */
const KNOB_TRAVEL = 0.22;

type Direction = -1 | 0 | 1;

function find(root: HTMLElement, id: string): HTMLElement {
  const e = root.querySelector<HTMLElement>('#' + id);
  if (!e) throw new Error('missing #' + id);
  return e;
}

/**
 * Controles táctiles superpuestos al canvas (DOM, fuera de la escena three.js):
 * joystick virtual (mover / caída suave / flick = caída instantánea) y botones
 * de acción. Pointer Events con multitáctil real vía `setPointerCapture`.
 */
export class TouchControls {
  private readonly root: HTMLElement;
  private readonly joy: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly actions: InputActions;
  private readonly leftShift = new AutoShift(DAS, ARR);
  private readonly rightShift = new AutoShift(DAS, ARR);
  private readonly stepLeft = (): void => { this.actions.onLeft(); };
  private readonly stepRight = (): void => { this.actions.onRight(); };
  private readonly cleanups: Array<() => void> = [];
  private joyId: number | null = null;
  private joyRect: DOMRect | null = null;
  private joyDir: Direction = 0;
  private softHeld = false;
  private flickUsed = false;

  constructor(root: HTMLElement, actions: InputActions) {
    this.root = root;
    this.actions = actions;
    this.joy = find(root, 'joy');
    this.knob = find(root, 'joy-knob');
    this.bindJoystick();
    this.bindButton('tc-ccw', () => actions.onRotateCCW());
    this.bindButton('tc-cw', () => actions.onRotateCW());
    this.bindButton('tc-drop', () => actions.onHardDrop());
    this.bindButton('tc-hold', () => actions.onHold());
    this.bindButton('tc-pause', () => actions.onPause());
    this.bindButton('tc-restart', () => actions.onRestart());
    this.bindButton('tc-help', () => actions.onHelp());
  }

  /** Muestra u oculta los controles (ocultos en modo escritorio). */
  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
    this.root.setAttribute('aria-hidden', String(!visible));
    if (!visible) this.releaseAll();
  }

  /** Call each frame for joystick auto-shift. */
  update(dt: number): void {
    if (this.joyDir === -1) this.leftShift.update(dt, this.stepLeft);
    else if (this.joyDir === 1) this.rightShift.update(dt, this.stepRight);
  }

  releaseAll(): void {
    this.resetJoy();
    this.joyId = null;
    this.joyRect = null;
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

  private bindJoystick(): void {
    const joy = this.joy;
    const down = (e: PointerEvent): void => {
      e.preventDefault();
      joy.setPointerCapture(e.pointerId);
      this.joyId = e.pointerId;
      this.joyRect = joy.getBoundingClientRect();
      this.flickUsed = false;
      this.updateJoy(e);
    };
    const move = (e: PointerEvent): void => {
      if (e.pointerId !== this.joyId) return;
      e.preventDefault();
      this.updateJoy(e);
    };
    const up = (e: PointerEvent): void => {
      if (e.pointerId !== this.joyId) return;
      this.releaseAll();
      if (joy.hasPointerCapture(e.pointerId)) joy.releasePointerCapture(e.pointerId);
    };
    const lost = (e: PointerEvent): void => {
      if (e.pointerId === this.joyId) this.releaseAll();
    };
    joy.addEventListener('pointerdown', down);
    joy.addEventListener('pointermove', move);
    joy.addEventListener('pointerup', up);
    joy.addEventListener('pointercancel', up);
    joy.addEventListener('lostpointercapture', lost);
    this.cleanups.push(() => {
      joy.removeEventListener('pointerdown', down);
      joy.removeEventListener('pointermove', move);
      joy.removeEventListener('pointerup', up);
      joy.removeEventListener('pointercancel', up);
      joy.removeEventListener('lostpointercapture', lost);
    });
  }

  private updateJoy(e: PointerEvent): void {
    const rect = this.joyRect ?? this.joy.getBoundingClientRect();
    const half = rect.width / 2;
    const dx = e.clientX - (rect.left + half);
    const dy = e.clientY - (rect.top + half);
    const maxTravel = rect.width * KNOB_TRAVEL;
    this.knob.style.transform =
      'translate(' + Math.max(-maxTravel, Math.min(maxTravel, dx)) + 'px, ' +
      Math.max(-maxTravel, Math.min(maxTravel, dy)) + 'px)';

    const nx = dx / half;
    const ny = dy / half;
    const dir: Direction = nx < -DEADZONE ? -1 : nx > DEADZONE ? 1 : 0;
    if (dir !== this.joyDir) {
      this.joyDir = dir;
      this.leftShift.release();
      this.rightShift.release();
      if (dir === -1) { this.actions.onLeft(); this.leftShift.press(); }
      else if (dir === 1) { this.actions.onRight(); this.rightShift.press(); }
    }
    const soft = ny > SOFT_ZONE;
    if (soft !== this.softHeld) {
      this.softHeld = soft;
      this.actions.setSoftDrop(soft);
      if (soft) this.actions.onDown();
    }
    if (ny < FLICK_UP && !this.flickUsed) {
      this.flickUsed = true;
      this.actions.onHardDrop();
    }
  }

  private resetJoy(): void {
    this.joyDir = 0;
    this.leftShift.release();
    this.rightShift.release();
    this.knob.style.transform = '';
    if (this.softHeld) {
      this.softHeld = false;
      this.actions.setSoftDrop(false);
    }
    this.flickUsed = false;
  }
}