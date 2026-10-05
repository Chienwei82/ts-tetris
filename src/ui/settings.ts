const STORAGE_KEY = 'tetris-3d:fx';

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
