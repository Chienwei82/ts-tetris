import type { InputActions } from './input.js';

/** Desplazamiento máximo (px) para que un gesto siga contando como tap. */
export const TAP_SLOP_PX = 10;
/** Duración máxima (s) de un tap. */
export const TAP_MAX_S = 0.28;

/** Pasos de celda completados por un movimiento del puntero. */
export interface GestureSteps {
  dx: number;
  dy: number;
}

/**
 * Máquina de gestos pura (sin DOM): acumula el desplazamiento del puntero y lo
 * convierte en pasos discretos de celda, conservando el resto entre eventos.
 * Un gesto casi estático y breve se resuelve como `tap` al soltar. Hacia arriba
 * nunca se emite paso (la pieza no sube): la caída sigue la profundidad máxima
 * alcanzada por el dedo, así un temblor arriba/abajo no repite caídas.
 */
export class PieceGesture {
  private active = false;
  private moved = false;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private accX = 0;
  private accY = 0;
  private lowY = 0;
  private startTime = 0;

  press(x: number, y: number, t: number): void {
    this.active = true;
    this.moved = false;
    this.startX = x;
    this.startY = y;
    this.lastX = x;
    this.accX = 0;
    this.accY = 0;
    this.lowY = 0;
    this.startTime = t;
  }

  /** Acumula el delta y devuelve pasos de celda (X firmado, Y solo hacia abajo). */
  move(x: number, y: number, cell: { x: number; y: number }): GestureSteps {
    if (!this.active) return { dx: 0, dy: 0 };
    const dx = x - this.lastX;
    this.lastX = x;
    const offX = x - this.startX;
    const offY = y - this.startY;
    if (!this.moved && offX * offX + offY * offY > TAP_SLOP_PX * TAP_SLOP_PX) this.moved = true;
    let sx = 0;
    let sy = 0;
    // Horizontal: la pieza sigue al dedo, resto conservado en ambos sentidos.
    this.accX += dx;
    while (this.accX >= cell.x) { sx += 1; this.accX -= cell.x; }
    while (this.accX <= -cell.x) { sx -= 1; this.accX += cell.x; }
    // Vertical: caída suave por profundidad nueva del dedo (subir no cuenta).
    if (offY > this.lowY) {
      this.accY += offY - this.lowY;
      this.lowY = offY;
    }
    while (this.accY >= cell.y) { sy += 1; this.accY -= cell.y; }
    return { dx: sx, dy: sy };
  }

  /** Cierra el gesto: `true` si cuenta como tap (para rotar la pieza). */
  release(t: number): boolean {
    if (!this.active) return false;
    const tap = !this.moved && t - this.startTime <= TAP_MAX_S;
    this.reset();
    return tap;
  }

  cancel(): void {
    this.reset();
  }

  isActive(): boolean {
    return this.active;
  }

  private reset(): void {
    this.active = false;
    this.moved = false;
    this.accX = 0;
    this.accY = 0;
    this.lowY = 0;
    this.startTime = 0;
  }
}

function now(): number {
  return performance.now() / 1000;
}

/**
 * Manipulación directa de la pieza sobre el canvas (solo modo táctil):
 * arrastrar la desplaza celda a celda (hacia abajo, caída suave) y un toque
 * breve la rota en sentido horario. Convive con los botones táctiles — cada
 * dedo controla su elemento de forma independiente (`setPointerCapture`) — y
 * no sustituye a ⇊: el gesto nunca dispara caída instantánea.
 */
export class PieceDrag {
  private readonly root: HTMLElement;
  private readonly actions: InputActions;
  private readonly cellPx: () => { x: number; y: number };
  private readonly gesture = new PieceGesture();
  private readonly cleanups: Array<() => void> = [];
  private pointerId: number | null = null;
  private enabled = false;

  constructor(root: HTMLElement, actions: InputActions, cellPx: () => { x: number; y: number }) {
    this.root = root;
    this.actions = actions;
    this.cellPx = cellPx;
    const down = (e: PointerEvent): void => {
      if (!this.enabled || this.pointerId !== null) return;
      e.preventDefault();
      this.pointerId = e.pointerId;
      root.setPointerCapture(e.pointerId);
      this.gesture.press(e.clientX, e.clientY, now());
    };
    const move = (e: PointerEvent): void => {
      if (e.pointerId !== this.pointerId) return;
      e.preventDefault();
      const s = this.gesture.move(e.clientX, e.clientY, this.cellPx());
      for (let i = 0; i < s.dx; i++) this.actions.onRight();
      for (let i = 0; i < -s.dx; i++) this.actions.onLeft();
      for (let i = 0; i < s.dy; i++) this.actions.onDown();
    };
    const up = (e: PointerEvent): void => {
      if (e.pointerId !== this.pointerId) return;
      e.preventDefault();
      const tap = this.gesture.release(now());
      this.endPointer(e.pointerId);
      if (tap) this.actions.onRotateCW();
    };
    const lost = (e: PointerEvent): void => {
      if (e.pointerId !== this.pointerId) return;
      this.gesture.cancel();
      this.pointerId = null;
    };
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', lost);
    root.addEventListener('lostpointercapture', lost);
    this.cleanups.push(() => {
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
      root.removeEventListener('pointercancel', lost);
      root.removeEventListener('lostpointercapture', lost);
    });
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.cancel();
  }

  /** Cancela el gesto en curso (sin tap) — lo usa `releaseAll` de InputManager. */
  cancel(): void {
    this.gesture.cancel();
    if (this.pointerId !== null) this.endPointer(this.pointerId);
  }

  dispose(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    this.cancel();
  }

  private endPointer(id: number): void {
    if (this.root.hasPointerCapture(id)) this.root.releasePointerCapture(id);
    this.pointerId = null;
  }
}