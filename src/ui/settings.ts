const STORAGE_KEY = 'tetris-3d:fx';
const MODE_KEY = 'tetris-3d:controls';

/** Modo de control elegido por el usuario: teclado/ratón o táctil. */
export type ControlMode = 'desktop' | 'touch';

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Stored background-effects preference; defaults to off when the OS asks for reduced motion. */
export function loadEffectsEnabled(): boolean {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch { /* storage unavailable (private mode) */ }
  return !prefersReducedMotion();
}

export function saveEffectsEnabled(on: boolean): void {
  try { window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

/** Elección de controles guardada; `null` si el usuario nunca eligió. */
export function loadControlMode(): ControlMode | null {
  try {
    const v = window.localStorage.getItem(MODE_KEY);
    if (v === 'desktop' || v === 'touch') return v;
  } catch { /* storage unavailable (private mode) */ }
  return null;
}

export function saveControlMode(mode: ControlMode): void {
  try { window.localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
}
