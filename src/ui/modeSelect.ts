import type { DeviceProfile } from '../platform/device.js';
import type { ControlMode } from './settings.js';
import { loadControlMode, saveControlMode } from './settings.js';

export interface ModeSelectOptions {
  root: HTMLElement;
  profile: DeviceProfile;
  onChoose: (mode: ControlMode) => void;
  /** Se avisa cada vez que el diálogo se abre/cierra (p. ej. para silenciar el teclado). */
  onOpenChange?: (open: boolean) => void;
}

function button(root: HTMLElement, id: string): HTMLButtonElement {
  const e = root.querySelector<HTMLButtonElement>('#' + id);
  if (!e) throw new Error('missing #' + id);
  return e;
}

/**
 * Pantalla de selección de modo (fallback): solo aparece cuando la detección
 * de dispositivo tiene confianza baja. La elección persiste en localStorage.
 */
export class ModeSelect {
  private readonly root: HTMLElement;
  private readonly profile: DeviceProfile;
  private readonly onChoose: (mode: ControlMode) => void;
  private readonly onOpenChange: (open: boolean) => void;
  private readonly btnDesktop: HTMLButtonElement;
  private readonly btnTouch: HTMLButtonElement;
  private readonly cleanups: Array<() => void> = [];
  private open = false;

  constructor(opts: ModeSelectOptions) {
    this.root = opts.root;
    this.profile = opts.profile;
    this.onChoose = opts.onChoose;
    this.onOpenChange = opts.onOpenChange ?? (() => {});
    this.btnDesktop = button(opts.root, 'btn-mode-desktop');
    this.btnTouch = button(opts.root, 'btn-mode-touch');
    const pickDesktop = (): void => this.choose('desktop');
    const pickTouch = (): void => this.choose('touch');
    this.btnDesktop.addEventListener('click', pickDesktop);
    this.btnTouch.addEventListener('click', pickTouch);
    this.cleanups.push(() => {
      this.btnDesktop.removeEventListener('click', pickDesktop);
      this.btnTouch.removeEventListener('click', pickTouch);
    });
  }

  /** Arranque: elección guardada > detección fiable > pantalla de selección. */
  resolve(): void {
    const saved = loadControlMode();
    if (saved) { this.onChoose(saved); return; }
    if (this.profile.confidence === 'high') {
      this.onChoose(this.profile.kind === 'desktop' ? 'desktop' : 'touch');
      return;
    }
    this.show();
  }

  show(): void {
    this.open = true;
    this.root.classList.remove('hidden-overlay');
    this.onOpenChange(true);
    this.btnTouch.focus();
  }

  hide(): void {
    this.open = false;
    this.root.classList.add('hidden-overlay');
    this.onOpenChange(false);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  isOpen(): boolean { return this.open; }

  dispose(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
  }

  private choose(mode: ControlMode): void {
    saveControlMode(mode);
    this.hide();
    this.onChoose(mode);
  }
}